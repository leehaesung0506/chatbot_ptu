import * as cheerio from "cheerio";

// 평택대학교 공식 게시판 (공개 페이지)
export const BOARDS = Object.freeze({
  general: { name: "일반공지", url: "https://www.ptu.ac.kr/www/407/subview.do" },
  academic: { name: "학사안내", url: "https://www.ptu.ac.kr/www/409/subview.do" },
  scholarship: { name: "장학금안내", url: "https://www.ptu.ac.kr/www/410/subview.do" }
});

const cache = new Map();
let refreshing = false;
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

function validOfficialUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname !== "ptu.ac.kr" && !url.hostname.endsWith(".ptu.ac.kr")) return null;
    return url.href;
  } catch {
    return null;
  }
}

// HTML 표에서 게시글 제목 · 작성일 · 원문 링크 추출
export function parseNoticeList(html, board) {
  const $ = cheerio.load(html);
  const table = $("table").filter((_, tableElement) => {
    const heading = $(tableElement).find("thead, th").text();
    return heading.includes("번호") && heading.includes("제목") && heading.includes("작성일");
  }).first();

  if (!table.length) return [];
  const rows = table.find("tbody tr").length ? table.find("tbody tr") : table.find("tr");
  const notices = [];
  const seen = new Set();

  rows.each((_, row) => {
    const cells = $(row).find("td");
    if (!cells.length) return;

    const link = $(row).find('a[href*="artclView.do"], a[href*="artclView"], a[href*="/bbs/"]').first();
    if (!link.length) return;

    const title = link.text().replace(/\s*새글\s*$/, "").replace(/\s+/g, " ").trim();
    const dateText = cells.toArray().map(cell => $(cell).text().trim())
      .find(text => /^20\d\d[.\-/]\d\d[.\-/]\d\d$/.test(text));
    const url = validOfficialUrl(link.attr("href"), board.url);
    if (!title || !dateText || !url || seen.has(url)) return;
    seen.add(url);
    notices.push({ title, date: dateText.replaceAll("/", ".").replaceAll("-", "."), url, category: board.name });
  });

  return notices.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
}

async function fetchNoticeBoard(key, board) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(board.url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "PTU-Student-Assistant/0.1 (non-official; notice-indexing)"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Official site HTTP ${response.status}`);
    const html = await response.text();
    const items = parseNoticeList(html, board);
    if (!items.length) throw new Error("Cannot parse the notice table (page layout may have changed)");
    cache.set(key, { items, updatedAt: new Date().toISOString(), error: null });
  } catch (error) {
    // 기존에 받은 데이터가 있으면 유지하되, 오류 상태를 기록한다.
    const old = cache.get(key);
    cache.set(key, { items: old?.items || [], updatedAt: old?.updatedAt || null, error: error.message });
    console.warn(`공지 수집 실패 (${key}):`, error.message);
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshNotices() {
  if (refreshing) return;
  refreshing = true;
  try {
    // 학교 서버에 부하를 주지 않도록 요청을 순차적으로 실행한다.
    for (const [key, board] of Object.entries(BOARDS)) {
      await fetchNoticeBoard(key, board);
    }
  } finally {
    refreshing = false;
  }
}

export function startNoticeRefresh() {
  void refreshNotices();
  const timer = setInterval(() => { void refreshNotices(); }, REFRESH_INTERVAL_MS);
  timer.unref?.();
}

export function isNoticeQuestion(text) {
  return /(공지|학교\s*소식|최근\s*학사|최근\s*장학|이번\s*주\s*학사|이번\s*주\s*장학)/.test(text);
}

function categoryForQuestion(question) {
  if (/장학|학자금/.test(question)) return "scholarship";
  if (/학사|수강|성적|휴학|복학|전과|졸업/.test(question)) return "academic";
  return "general";
}

function isWithinLast7Days(dateString) {
  const iso = dateString.replaceAll(".", "-");
  const date = Date.parse(`${iso}T00:00:00+09:00`);
  const elapsed = Date.now() - date;
  return Number.isFinite(date) && elapsed >= -86_400_000 && elapsed <= 7 * 86_400_000;
}

export function answerNoticeQuestion(question) {
  const key = categoryForQuestion(question);
  const board = BOARDS[key];
  const state = cache.get(key);
  if (!state?.items.length) {
    return `현재 ${board.name} 게시글을 불러오지 못했어요. 아래 공식 게시판에서 직접 확인해 주세요.\n${board.url}`;
  }

  const recentOnly = /이번\s*주|지난\s*7일|일주일/.test(question);
  const items = recentOnly ? state.items.filter(item => isWithinLast7Days(item.date)) : state.items;
  if (!items.length) {
    return `수집된 ${board.name} 게시글 중 최근 7일 내 작성된 게시글은 확인되지 않았어요. 추가 게시글이나 변경사항은 공식 게시판에서 확인해 주세요.\n${board.url}`;
  }
  const picked = items.slice(0, 3);
  const body = picked.map((item, index) => `${index + 1}. ${item.title}\n(${item.date})\n${item.url}`).join("\n\n");
  const note = state.error ? "\n\n※ 최근 갱신에 실패해 목록이 최신이 아닐 수 있어요." : "";
  return `평택대학교 ${board.name} 게시판에서 확인한 공지예요.\n\n${body}${note}\n\n원문에서 세부 내용과 신청 기간을 꼭 확인해 주세요.`;
}

export function noticeStatus() {
  return Object.fromEntries(Object.keys(BOARDS).map(key => [key, {
    count: cache.get(key)?.items.length || 0,
    updatedAt: cache.get(key)?.updatedAt || null,
    available: Boolean(cache.get(key)?.items.length)
  }]));
}

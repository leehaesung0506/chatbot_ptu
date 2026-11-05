import express from "express";
import { startNoticeRefresh, isNoticeQuestion, answerNoticeQuestion, noticeStatus } from "./notices.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

const PORT = process.env.PORT || 8080;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const WEBSITE = "https://www.ptu.ac.kr";

// 테스트 비용 보호용 프로세스 단위 제한 (서버 재시작 시 초기화됨)
let minuteStart = Date.now();
let dailyStart = Date.now();
let minuteUsed = 0;
let dailyUsed = 0;
function allowRequest() {
  const now = Date.now();
  if (now - minuteStart >= 60_000) { minuteStart = now; minuteUsed = 0; }
  if (now - dailyStart >= 86_400_000) { dailyStart = now; dailyUsed = 0; }
  const minuteLimit = Math.max(1, Number(process.env.AI_MAX_PER_MINUTE) || 20);
  const dailyLimit = Math.max(1, Number(process.env.AI_MAX_PER_DAY) || 200);
  if (minuteUsed >= minuteLimit || dailyUsed >= dailyLimit) return false;
  minuteUsed++;
  dailyUsed++;
  return true;
}

function reply(text) {
  return {
    version: "2.0",
    template: { outputs: [{ simpleText: { text: String(text).slice(0, 950) } }] }
  };
}

function getOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  return (data.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text" && typeof item.text === "string")
    .map(item => item.text)
    .join("\n")
    .trim();
}

async function answerWithAI(question) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3400);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        max_output_tokens: 230,
        instructions: [
          "너는 평택대학교 학생을 돕는 비공식 AI 도우미다.",
          "한국어로 친절하고 간결하게 3~5문장 이내로 답하라.",
          "공식 공지 목록 검색은 별도 서버 기능으로만 제공된다. 현재 AI 호출에는 검색된 원문 자료가 주어지지 않았다.",
          "수강신청 날짜, 마감일, 학칙, 장학금 신청기간, 졸업요건은 추측하거나 만들어내지 마라.",
          `학교별 최신 확인이 필요하면 공식 홈페이지 ${WEBSITE} 방문을 안내하라.`,
          "학교 공식 운영 챗봇인 것처럼 사칭하지 말고 민감한 개인정보 입력을 요청하지 마라."
        ].join(" "),
        input: [{ role: "user", content: question }]
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      console.error("OpenAI response HTTP status:", response.status);
      throw new Error("OpenAI request failed");
    }
    const data = await response.json();
    const answer = getOutputText(data);
    if (!answer) throw new Error("Empty OpenAI answer");
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/", (_req, res) => res.send("PTU AI 서버가 정상 작동 중입니다!"));
app.get("/health", (_req, res) => res.json({ status: "ok", notices: noticeStatus() }));

app.post("/kakao/skill", async (req, res) => {
  const question = req.body?.userRequest?.utterance;
  if (typeof question !== "string" || !question.trim()) {
    return res.json(reply("안녕하세요! 평택대 AI 도우미입니다. 질문을 입력해 주세요."));
  }
  const cleanQuestion = question.trim();
  if (cleanQuestion.length > 300) return res.json(reply("질문을 300자 이내로 줄여 주세요."));

  // 최신 공지 질문에는 AI의 추측 대신 공식 게시판 수집 결과로 답변
  if (isNoticeQuestion(cleanQuestion)) {
    return res.json(reply(answerNoticeQuestion(cleanQuestion)));
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.json(reply("현재 AI 연결 설정을 확인하고 있어요. 잠시 뒤 다시 시도해 주세요."));
  }
  if (!allowRequest()) {
    return res.json(reply("현재 질문이 많아 잠시 응답이 제한돼요. 조금 뒤 다시 시도해 주세요."));
  }
  try {
    const answer = await answerWithAI(cleanQuestion);
    return res.json(reply(answer));
  } catch (err) {
    console.error("AI response failed:", err?.name || "UnknownError");
    return res.json(reply("현재 AI 답변을 작성하지 못했어요. 잠시 뒤 다시 시도해 주세요."));
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PTU AI 서버 실행: ${PORT}`);
  startNoticeRefresh();
});

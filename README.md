# 평택대 도우미 3단계: 공지 제목/작성일/링크 수집

기존에 사용 중인 Railway 서비스에 적용하는 추가 코드입니다.

## 적용 방법

1. GitHub `leehaesung0506/chatbot_ptu`의 `package.json`을 이 폴더의 `package.json`으로 교체하고 Commit.
2. 같은 저장소의 `server.js`를 이 폴더의 `server.js`로 교체하고 Commit.
3. 새 파일 `notices.js`를 **저장소 최상위 경로**에 추가하고 Commit.
4. Railway `chat_ptu`가 최신 commit으로 성공 배포되었는지 확인.
5. `https://ptu2026.up.railway.app/health`에서 notices.available 및 count 확인.
6. 카카오톡에서 "최근 학사공지 알려줘", "이번 주 장학금 공지 알려줘" 테스트.

기존 `/kakao/skill` 주소는 변경할 필요 없습니다. `OPENAI_API_KEY`는 기존 Railway 환경변수를 재사용합니다. 새 API 키를 GitHub에 커밋하지 마세요.

## 기능과 한계

- 평택대학교 공개 게시판 3개(일반/학사/장학)의 **첫 페이지**에서 게시물의 제목, 작성일, 원문 링크를 가져옵니다.
- 서버 시작 시 1회, 이후 30분마다 자동 갱신을 시도합니다. 한 번에 세 게시판을 순차 요청하며 요청당 최대 6초로 제한했습니다.
- 카카오톡이 최신 공지를 묻는 경우, AI가 만들어낸 공지가 아니라 **수집한 목록**을 보여 줍니다.
- 공지의 **본문과 첨부파일은 아직 읽지 않습니다**. 신청 조건/마감일 등은 반드시 원문 확인이 필요합니다.
- 서버가 절전(sleep) 상태로 들어가거나 재시작하면 메모리 캐시가 초기화됩니다. 최초 재수집 중에는 공식 링크로 안내합니다.
- 사이트 접근 제한, 게시판 HTML 구조 변경 등의 상황에서는 수집이 실패할 수 있습니다. 현 환경에서 실제 HTML 파싱을 원격 테스트하지 못했으므로 `health` 및 Railway 로그로 확인해야 합니다.
- 공개 서비스로 확장하기 전 홈페이지 이용 정책/robots.txt를 확인하고 사이트에 부하를 주지 않도록 해야 합니다. 운영 승인, 지속 저장소, 서버 인증, API 요금 한도, 개인정보 보호도 후속 단계에서 필요합니다.

## 공식 출처

- https://www.ptu.ac.kr/www/407/subview.do
- https://www.ptu.ac.kr/www/409/subview.do
- https://www.ptu.ac.kr/www/410/subview.do


import express from "express";

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 8080;

// 서버 상태 확인
app.get("/", (req, res) => {
  res.send("PTU AI 서버가 정상 작동 중입니다!");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 카카오톡 챗봇 스킬
app.post("/kakao/skill", (req, res) => {
  const question = req.body?.userRequest?.utterance || "";

  console.log("학생 질문:", question);

  const answer = question
    ? `안녕하세요! 평택대 AI 도우미입니다.\n\n질문: ${question}\n\n현재 챗봇 연결 테스트 중입니다.`
    : "안녕하세요! 평택대 AI 도우미입니다. 질문을 입력해 주세요.";

  res.json({
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text: answer
          }
        }
      ]
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PTU AI 서버 실행: ${PORT}`);
});

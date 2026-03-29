import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Helpers ───────────────────────────────────────────────────
const fmtTime = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function grade(pct) {
  if (pct >= 90) return { label: "A+", color: "#37e6bf" };
  if (pct >= 75) return { label: "A", color: "#37e6bf" };
  if (pct >= 60) return { label: "B", color: "#7ea2ff" };
  return { label: "F", color: "#ff6b6b" };
}

export default function VideoQuizPage() {
  const router = useRouter();
  const [screen, setScreen] = useState("loading");
  const [quiz, setQuiz] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState([]);
  const [timeLeft, setTimeLeft] = useState(30);
  const [score, setScore] = useState(0);

  const timerRef = useRef(null);

  // 1. Load Quiz Data
  useEffect(() => {
    if (!router.isReady) return;
    const initQuiz = async () => {
      try {
        const raw = sessionStorage.getItem("active_summary");
        if (!raw) {
          router.push("/videosummary");
          return;
        }
        const summary = JSON.parse(raw);
        if (!summary) {
          router.push("/videosummary");
          return;
        }

        const res = await fetch(`${BASE_URL}/api/video-quiz`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ summary, num_questions: 10 }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `Server error ${res.status}`);
        }
        const data = await res.json();
        if (!data.questions || data.questions.length === 0) {
          throw new Error("No questions returned from server.");
        }
        setQuiz(data);
        setScreen("quiz");
      } catch (err) {
        console.error(err);
        setScreen("error");
      }
    };
    initQuiz();
  }, [router.isReady]);

  // 2. Timer Logic
  useEffect(() => {
    if (screen !== "quiz") return;
    setTimeLeft(30);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          handleAnswer(null);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [current, screen]);

  const handleAnswer = (idx) => {
    if (answers[quiz.questions[current].id] !== undefined) return;
    clearInterval(timerRef.current);

    const q = quiz.questions[current];
    const isCorrect = idx === q.correct;

    setAnswers((prev) => ({ ...prev, [q.id]: idx }));
    if (isCorrect) setScore((s) => s + 1);

    setResults((prev) => [
      ...prev,
      {
        question: q.question,
        isCorrect,
        selected: idx,
        correct: q.correct,
        explanation: q.explanation,
        concept: q.concept,
        options: q.options,
      },
    ]);
  };

  const nextQuestion = () => {
    if (current + 1 < quiz.questions.length) {
      setCurrent((c) => c + 1);
    } else {
      setScreen("results");
    }
  };

  if (screen === "loading") return <SummaryLoadingScreen />;
  if (screen === "error")
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100vw",
          background: "#05070f",
          color: "#ff6b6b",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Sora,sans-serif",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>
          Quiz Generation Failed
        </h2>
        <p style={{ color: "#8e98bc", fontSize: 14 }}>
          The AI couldn't generate questions. Please go back and try again.
        </p>
        <button
          onClick={() => {
            sessionStorage.setItem("came_from_quiz", "1");
            router.back();
          }}
          style={{
            marginTop: 16,
            padding: "12px 28px",
            background: "linear-gradient(135deg,#7ea2ff,#c79bff)",
            border: "none",
            borderRadius: 14,
            color: "#05070f",
            fontWeight: 800,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ← Back to Summary
        </button>
      </div>
    );

  return (
    <div className="full-page">
      <Head>
        <title>Assessment — GYAANI AI</title>
      </Head>

      {/* Background Nebulas */}
      <div className="nebula nebula-1" />
      <div className="nebula nebula-2" />

      {screen === "quiz" && (
        <div className="quiz-container">
          <header className="quiz-hdr">
            <button
              className="back-btn"
              onClick={() => {
                sessionStorage.setItem("came_from_quiz", "1");
                router.back();
              }}
            >
              ←
            </button>
            <div className="hdr-center">
              <span className="q-count">
                QUESTION {current + 1} OF {quiz.total_questions}
              </span>
              <div className="prog-track">
                <div
                  className="prog-fill"
                  style={{
                    width: `${((current + 1) / quiz.total_questions) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div
              className="timer-pill"
              style={{
                borderColor: timeLeft < 10 ? "#ff6b6b" : "#37e6bf",
                color: timeLeft < 10 ? "#ff6b6b" : "#37e6bf",
              }}
            >
              ⏱ {timeLeft}s
            </div>
          </header>

          <main className="q-content">
            <div className="q-card">
              <span className="concept-label">
                {quiz.questions[current].concept}
              </span>
              <h2 className="q-text">{quiz.questions[current].question}</h2>
            </div>

            <div className="options-list">
              {quiz.questions[current].options.map((opt, i) => {
                const isSelected = answers[quiz.questions[current].id] === i;
                const hasAnswered =
                  answers[quiz.questions[current].id] !== undefined;
                const isCorrect = i === quiz.questions[current].correct;

                let stateClass = "";
                if (hasAnswered) {
                  if (isCorrect) stateClass = "correct";
                  else if (isSelected) stateClass = "wrong";
                  else stateClass = "dimmed";
                }

                return (
                  <button
                    key={i}
                    className={`opt-btn ${stateClass}`}
                    onClick={() => handleAnswer(i)}
                    disabled={hasAnswered}
                  >
                    <span className="opt-idx">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="opt-txt">{opt}</span>
                  </button>
                );
              })}
            </div>

            {answers[quiz.questions[current].id] !== undefined && (
              <button className="next-action-btn" onClick={nextQuestion}>
                {current + 1 === quiz.total_questions
                  ? "Finish Assessment"
                  : "Next Question →"}
              </button>
            )}
          </main>
        </div>
      )}

      {screen === "results" && (
        <div className="results-container">
          <header className="res-hdr">
            <button
              className="back-btn"
              onClick={() => {
                sessionStorage.setItem("came_from_quiz", "1");
                router.push("/videosummary");
              }}
            >
              ← Back
            </button>
            <h1 className="res-title">Knowledge Analysis</h1>
            <button
              onClick={() => window.location.reload()}
              className="retry-btn"
            >
              🔄 Retake
            </button>
          </header>

          <section className="score-hero">
            <div
              className="score-orb"
              style={{
                borderColor: grade((score / quiz.total_questions) * 100).color,
              }}
            >
              <span
                className="grade-txt"
                style={{
                  color: grade((score / quiz.total_questions) * 100).color,
                }}
              >
                {grade((score / quiz.total_questions) * 100).label}
              </span>
              <span className="pct-txt">
                {Math.round((score / quiz.total_questions) * 100)}%
              </span>
            </div>
            <div className="score-meta">
              <h2>
                {score} out of {quiz.total_questions} Correct
              </h2>
              <p>Neural DNA updated based on your performance.</p>
            </div>
          </section>

          <div className="review-list">
            <p className="section-label">Detailed Breakdown</p>
            {results.map((r, i) => (
              <div
                key={i}
                className={`res-card ${r.isCorrect ? "pass" : "fail"}`}
              >
                <div className="res-card-hdr">
                  <span className="res-idx">{i + 1}</span>
                  <span className="res-concept">{r.concept}</span>
                </div>
                <p className="res-q">{r.question}</p>
                <p className="res-expl">
                  <span>💡</span> {r.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .full-page {
          min-height: 100vh;
          width: 100vw;
          background: #05070f;
          color: white;
          font-family: "Sora", sans-serif;
          position: relative;
          overflow-x: hidden;
        }
        .nebula {
          position: fixed;
          width: 50vw;
          height: 50vh;
          filter: blur(100px);
          opacity: 0.15;
          pointer-events: none;
          z-index: 0;
        }
        .nebula-1 {
          top: -10%;
          left: -10%;
          background: radial-gradient(circle, #7ea2ff, transparent);
        }
        .nebula-2 {
          bottom: -10%;
          right: -10%;
          background: radial-gradient(circle, #c79bff, transparent);
        }

        /* Quiz Layout */
        .quiz-container {
          position: relative;
          z-index: 1;
          max-width: 700px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .quiz-hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 50px;
        }
        .hdr-center {
          flex: 1;
          margin: 0 40px;
        }
        .q-count {
          font-size: 10px;
          letter-spacing: 2px;
          color: #62739f;
          font-weight: 800;
          display: block;
          margin-bottom: 10px;
        }
        .prog-track {
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          overflow: hidden;
        }
        .prog-fill {
          height: 100%;
          background: #7ea2ff;
          transition: 0.4s ease;
        }
        .timer-pill {
          padding: 6px 14px;
          border-radius: 20px;
          border: 1px solid;
          font-family: "JetBrains Mono";
          font-weight: 800;
          font-size: 14px;
        }

        .back-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          cursor: pointer;
        }

        .q-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 32px;
          border-radius: 28px;
          margin-bottom: 24px;
        }
        .concept-label {
          color: #7ea2ff;
          font-size: 10px;
          text-transform: uppercase;
          font-weight: 800;
          letter-spacing: 1px;
        }
        .q-text {
          font-size: 20px;
          margin-top: 15px;
          line-height: 1.5;
          font-weight: 700;
        }

        .options-list {
          display: grid;
          gap: 12px;
        }
        .opt-btn {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: white;
          text-align: left;
          cursor: pointer;
          transition: 0.2s;
        }
        .opt-btn:hover:not(:disabled) {
          border-color: #7ea2ff;
          transform: translateX(6px);
          background: rgba(126, 162, 255, 0.05);
        }
        .opt-idx {
          width: 32px;
          height: 32px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 13px;
          color: #62739f;
        }

        .opt-btn.correct {
          border-color: #37e6bf;
          background: rgba(55, 230, 191, 0.08);
        }
        .opt-btn.correct .opt-idx {
          background: #37e6bf;
          color: #05070f;
        }
        .opt-btn.wrong {
          border-color: #ff6b6b;
          background: rgba(255, 107, 107, 0.08);
        }
        .opt-btn.wrong .opt-idx {
          background: #ff6b6b;
          color: white;
        }
        .opt-btn.dimmed {
          opacity: 0.3;
        }

        .next-action-btn {
          width: 100%;
          margin-top: 30px;
          padding: 18px;
          background: linear-gradient(135deg, #7ea2ff, #c79bff);
          border: none;
          border-radius: 18px;
          color: #05070f;
          font-weight: 800;
          cursor: pointer;
          font-size: 15px;
        }

        /* Results Layout */
        .results-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .res-hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 50px;
        }
        .res-title {
          font-size: 20px;
          font-weight: 800;
        }
        .retry-btn {
          background: #37e6bf;
          color: #05070f;
          border: none;
          padding: 8px 18px;
          border-radius: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .score-hero {
          display: flex;
          align-items: center;
          gap: 40px;
          background: rgba(255, 255, 255, 0.03);
          padding: 40px;
          border-radius: 32px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 40px;
        }
        .score-orb {
          width: 130px;
          height: 130px;
          border: 5px solid;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.02);
        }
        .grade-txt {
          font-size: 44px;
          font-weight: 900;
        }
        .pct-txt {
          font-size: 14px;
          font-weight: 700;
          opacity: 0.6;
        }
        .score-meta h2 {
          font-size: 26px;
          font-weight: 800;
          margin-bottom: 5px;
        }
        .score-meta p {
          color: #8e98bc;
          font-size: 14px;
        }

        .review-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .res-card {
          background: rgba(255, 255, 255, 0.02);
          padding: 24px;
          border-radius: 22px;
          border-left: 5px solid #ff6b6b;
        }
        .res-card.pass {
          border-left-color: #37e6bf;
        }
        .res-card-hdr {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 12px;
        }
        .res-idx {
          font-family: "JetBrains Mono";
          font-weight: 800;
          color: #62739f;
          font-size: 12px;
        }
        .res-concept {
          font-size: 10px;
          text-transform: uppercase;
          font-weight: 800;
          color: #7ea2ff;
        }
        .res-q {
          font-weight: 700;
          font-size: 16px;
          margin-bottom: 12px;
          line-height: 1.5;
        }
        .res-expl {
          font-size: 13px;
          color: #8e98bc;
          line-height: 1.6;
          padding: 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
        }
        .section-label {
          font-size: 10px;
          letter-spacing: 2px;
          font-weight: 800;
          color: #62739f;
          text-transform: uppercase;
          margin-bottom: 20px;
          display: block;
        }
      `}</style>
    </div>
  );
}

function SummaryLoadingScreen() {
  return (
    <div className="loader">
      <div className="orb" />
      <p>GYAANI AI is generating your assessment...</p>
      <style jsx>{`
        .loader {
          height: 100vh;
          width: 100vw;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #05070f;
          color: #7ea2ff;
        }
        .orb {
          width: 50px;
          height: 50px;
          border: 3px solid transparent;
          border-top-color: #7ea2ff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

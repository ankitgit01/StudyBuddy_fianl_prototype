import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Sidebar from "../components/Sidebar";
import { getAllQuizHistory, getQuizHistoryByNote } from "../services/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SUBJECT_TONES = {
  Physics: { tone: "tone-physics", accent: "#5bd0ff", icon: "⚛️" },
  Chemistry: { tone: "tone-chemistry", accent: "#93ff78", icon: "🧪" },
  Mathematics: { tone: "tone-mathematics", accent: "#c79bff", icon: "📐" },
  Biology: { tone: "tone-biology", accent: "#ffc66d", icon: "🧬" },
  History: { tone: "tone-history", accent: "#ff8b6b", icon: "📜" },
  Geography: { tone: "tone-geography", accent: "#59f0c2", icon: "🌍" },
  English: { tone: "tone-english", accent: "#ff8fb3", icon: "📖" },
  Computer: { tone: "tone-computer", accent: "#7ea2ff", icon: "💻" },
  General: { tone: "tone-general", accent: "#f0f3ff", icon: "📂" },
};

function getSubjectTone(name) {
  return SUBJECT_TONES[name] || SUBJECT_TONES.General;
}

function difficultyText(value) {
  return value
    ? String(value).replace(/^\w/, (match) => match.toUpperCase())
    : "Mixed";
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Number(score || 0)));
}

function scoreTone(score) {
  const pct = clampScore(score);
  if (pct >= 90) return { color: "#43E97B" };
  if (pct >= 75) return { color: "#43E97B" };
  if (pct >= 60) return { color: "#4FACFE" };
  if (pct >= 45) return { color: "#FFB300" };
  return { color: "#FF6B6B" };
}

function formatScore(score) {
  const pct = clampScore(score);
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ── Loading Component ───────────────────────────────────────────
function LoadingScreen({
  message = "Fetching Quiz History...",
  subMessage = "Retrieving your knowledge reports",
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 15% 0%, rgba(91,208,255,0.10) 0%, transparent 38%), radial-gradient(ellipse at 85% 8%, rgba(199,155,255,0.09) 0%, transparent 30%), linear-gradient(180deg,#04060e,#060913)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        fontFamily: "Sora, sans-serif",
      }}
    >
      <div style={{ position: "relative", width: 72, height: 72 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1.5px solid rgba(108,99,255,0.15)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "2px solid transparent",
            borderTopColor: "#6C63FF",
            animation: "spin 0.9s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1.5px solid rgba(255,139,107,0.2)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1.5px solid transparent",
            borderTopColor: "#ff8b6b",
            animation: "spin 1.4s linear infinite reverse",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 20,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,139,107,0.4), transparent)",
          }}
        />
      </div>

      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <p
          style={{
            fontSize: 15,
            color: "#9b95ff",
            fontWeight: 800,
            letterSpacing: "-0.3px",
            margin: 0,
          }}
        >
          {message}
        </p>
        <p
          style={{ fontSize: 12, color: "#333360", fontWeight: 600, margin: 0 }}
        >
          {subMessage}
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function QuizHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [activeSubject, setActiveSubject] = useState("");
  const [activeQuizId, setActiveQuizId] = useState("");
  const [activeQuizDetails, setActiveQuizDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [deletingQuizId, setDeletingQuizId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadQuizHistory() {
      setLoading(true);
      setError("");
      try {
        const payload = await getAllQuizHistory();
        const quizItems = Array.isArray(payload?.quizzes)
          ? payload.quizzes
          : [];
        const grouped = new Map();

        quizItems.forEach((quiz) => {
          const subject = quiz.subject || "General";
          if (!grouped.has(subject)) grouped.set(subject, []);
          grouped.get(subject).push(quiz);
        });

        const nextSubjects = [...grouped.entries()]
          .map(([name, quizzes]) => ({
            name,
            quizzes: quizzes.sort((a, b) => {
              const aTime = new Date(
                a.latest_attempted_at || a.generated_at || 0,
              ).getTime();
              const bTime = new Date(
                b.latest_attempted_at || b.generated_at || 0,
              ).getTime();
              return bTime - aTime;
            }),
          }))
          .map((subject) => ({
            ...subject,
            quizCount: subject.quizzes.length,
            attemptCount: subject.quizzes.reduce(
              (sum, quiz) => sum + Number(quiz.num_attempts || 0),
              0,
            ),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setSubjects(nextSubjects);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load quiz history");
          setLoading(false);
        }
      }
    }

    loadQuizHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  const subjectEntry = useMemo(
    () => subjects.find((subject) => subject.name === activeSubject) || null,
    [activeSubject, subjects],
  );

  const activeQuizSummary = useMemo(
    () =>
      subjectEntry?.quizzes.find((quiz) => quiz.quiz_id === activeQuizId) ||
      null,
    [activeQuizId, subjectEntry],
  );

  const activeQuiz = activeQuizDetails || activeQuizSummary;

  function handleBack() {
    if (activeQuizId) {
      setActiveQuizId("");
      setActiveQuizDetails(null);
      setDetailError("");
      return;
    }
    if (activeSubject) {
      setActiveSubject("");
      return;
    }
    router.back();
  }

  async function handleOpenQuiz(quiz) {
    if (!quiz?.note_id || !quiz?.quiz_id) return;
    setActiveQuizId(quiz.quiz_id);
    setActiveQuizDetails(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const payload = await getQuizHistoryByNote(quiz.note_id);
      const quizzes = Array.isArray(payload?.quizzes) ? payload.quizzes : [];
      const detailedQuiz = quizzes.find(
        (item) => item.quiz_id === quiz.quiz_id,
      );
      if (!detailedQuiz) throw new Error("Quiz details not found");
      setActiveQuizDetails({
        ...quiz,
        ...detailedQuiz,
        note_topic: payload?.note_topic || quiz.note_topic,
        subject: payload?.subject || quiz.subject,
        attempts: Array.isArray(detailedQuiz.attempts)
          ? detailedQuiz.attempts
          : [],
      });
    } catch (err) {
      setDetailError(err.message || "Failed to load quiz details");
    } finally {
      setDetailLoading(false);
    }
  }

  function handleRetake(quiz) {
    if (!quiz?.note_id || !quiz?.quiz_id) return;
    router.push(
      `/quiz?noteId=${encodeURIComponent(quiz.note_id)}&quizId=${encodeURIComponent(quiz.quiz_id)}&from=quiz-history`,
    );
  }

  async function handleDeleteQuiz(quiz, event) {
    event.stopPropagation();
    if (!quiz?.note_id || !quiz?.quiz_id || deletingQuizId) return;
    if (!window.confirm("Delete this quiz?")) return;
    try {
      setDeletingQuizId(quiz.quiz_id);
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : "";
      const resp = await fetch(
        `${BASE_URL}/quiz/${quiz.note_id}/${quiz.quiz_id}`,
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!resp.ok) throw new Error("Failed to delete quiz");

      setSubjects((prev) =>
        prev
          .map((subject) => ({
            ...subject,
            quizzes: subject.quizzes.filter(
              (item) => item.quiz_id !== quiz.quiz_id,
            ),
          }))
          .filter((subject) => subject.quizzes.length > 0)
          .map((subject) => ({
            ...subject,
            quizCount: subject.quizzes.length,
            attemptCount: subject.quizzes.reduce(
              (sum, item) => sum + Number(item.num_attempts || 0),
              0,
            ),
          })),
      );

      if (activeQuizId === quiz.quiz_id) {
        setActiveQuizId("");
        setActiveQuizDetails(null);
        setDetailError("");
      }
    } catch (err) {
      setDetailError(err.message || "Failed to delete quiz");
    } finally {
      setDeletingQuizId("");
    }
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Head>
        <title>Quiz History | GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800;900&family=JetBrains+Mono:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <Sidebar user={{}}>
        <div className="screen">
          <header className="hdr">
            <button className="back-btn" onClick={handleBack}>
              ←
            </button>
            <div>
              <span className="hdr-title">
                {activeQuizId
                  ? "Quiz Report"
                  : activeSubject
                    ? activeSubject
                    : "Quiz History"}
              </span>
              <span className="hdr-sub">
                {activeQuizId
                  ? activeQuiz?.note_topic ||
                    activeQuizSummary?.note_topic ||
                    "Loading..."
                  : activeSubject
                    ? `${subjectEntry?.quizCount || 0} quizzes`
                    : `${subjects.length} subjects`}
              </span>
            </div>
          </header>

          <main className="body">
            {error ? <div className="state-card">{error}</div> : null}
            {!error && !subjects.length ? (
              <div className="state-card">No quizzes yet.</div>
            ) : null}

            {!error && !activeSubject && subjects.length ? (
              <section className="subject-grid">
                {subjects.map((subject, index) => {
                  const tone = getSubjectTone(subject.name);
                  return (
                    <button
                      key={subject.name}
                      type="button"
                      className={`subject-card ${tone.tone}`}
                      style={{ animationDelay: `${index * 0.04}s` }}
                      onClick={() => setActiveSubject(subject.name)}
                    >
                      <span className="subject-icon">{tone.icon}</span>
                      <span className="subject-name">{subject.name}</span>
                      <span className="subject-meta">
                        {subject.quizCount} quizzes
                      </span>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {!error && activeSubject && !activeQuizId && subjectEntry ? (
              <section className="quiz-list">
                {!subjectEntry.quizzes.length ? (
                  <div className="state-card">
                    No quizzes in this subject yet.
                  </div>
                ) : null}
                {subjectEntry.quizzes.map((quiz) => {
                  const best = scoreTone(quiz.best_score);
                  const avg = scoreTone(quiz.avg_score);
                  return (
                    <div
                      key={quiz.quiz_id}
                      role="button"
                      tabIndex={0}
                      className="quiz-card"
                      onClick={() => handleOpenQuiz(quiz)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleOpenQuiz(quiz);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="quiz-card__delete"
                        onClick={(event) => handleDeleteQuiz(quiz, event)}
                        disabled={deletingQuizId === quiz.quiz_id}
                        aria-label="Delete quiz"
                      >
                        {deletingQuizId === quiz.quiz_id ? "…" : "×"}
                      </button>
                      <div className="quiz-card__head">
                        <div>
                          <span className="quiz-card__topic">
                            {quiz.note_topic}
                          </span>
                          <span className="quiz-card__meta">
                            {difficultyText(quiz.difficulty)} ·{" "}
                            {quiz.num_questions} questions
                          </span>
                        </div>
                        <span className="quiz-card__time">
                          {formatDateTime(
                            quiz.latest_attempted_at || quiz.generated_at,
                          )}
                        </span>
                      </div>
                      <div className="quiz-card__stats">
                        <span>{quiz.num_attempts} attempts</span>
                        <span style={{ color: best.color }}>
                          Best {formatScore(quiz.best_score)}
                        </span>
                        <span style={{ color: avg.color }}>
                          Avg {formatScore(quiz.avg_score)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </section>
            ) : null}

            {!error && activeQuizId && detailLoading ? (
              <div className="state-card">Loading report...</div>
            ) : null}

            {!error && activeQuizId && detailError ? (
              <div className="state-card">{detailError}</div>
            ) : null}

            {!error && activeQuizId && activeQuiz && !detailLoading ? (
              <section className="report-shell">
                <div className="report-hero">
                  <div>
                    <p className="eyebrow">Latest Attempt</p>
                    <h1>{activeQuiz.note_topic}</h1>
                    <p className="report-sub">
                      {difficultyText(activeQuiz.difficulty)} ·{" "}
                      {activeQuiz.num_questions} questions
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cta-btn"
                    onClick={() => handleRetake(activeQuiz)}
                  >
                    Reattempt Quiz
                  </button>
                </div>

                <div className="report-grid">
                  {[
                    {
                      label: "Best Score",
                      value: formatScore(activeQuiz.best_score),
                    },
                    {
                      label: "Average Score",
                      value: formatScore(activeQuiz.avg_score),
                    },
                    {
                      label: "Attempts",
                      value: String(activeQuiz.num_attempts || 0),
                    },
                  ].map((item) => (
                    <div key={item.label} className="report-stat">
                      <span className="report-stat__label">{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div className="report-panel">
                  <div className="report-panel__head">
                    <h2>Attempt Summary</h2>
                  </div>
                  {activeQuiz.concepts?.length ? (
                    <div className="concept-row">
                      {activeQuiz.concepts.map((concept) => (
                        <span key={concept} className="concept-chip">
                          {concept}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="attempt-list">
                    {activeQuiz.attempts?.length ? (
                      activeQuiz.attempts.map((attempt, index) => {
                        const tone = scoreTone(attempt.score);
                        return (
                          <div
                            key={`${attempt.quiz_id}-${attempt.attempted_at || index}`}
                            className="attempt-card"
                          >
                            <div className="attempt-card__head">
                              <span className="attempt-card__index">
                                Attempt {activeQuiz.attempts.length - index}
                              </span>
                              <span
                                className="attempt-card__grade"
                                style={{ color: tone.color }}
                              >
                                {formatScore(attempt.score)}
                              </span>
                            </div>
                            <div className="attempt-card__body">
                              <span>
                                {attempt.correct}/{attempt.total} correct
                              </span>
                              <span>
                                {formatDateTime(attempt.attempted_at)}
                              </span>
                              <span>
                                {Math.round(
                                  Number(attempt.avg_time_per_question || 0),
                                )}{" "}
                                sec / question
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="attempt-card">No attempts yet.</div>
                    )}
                  </div>
                </div>
              </section>
            ) : null}
          </main>
        </div>
      </Sidebar>

      <style jsx>{`
        .quiz-card {
          position: relative;
          padding-bottom: 28px;
        }

        .quiz-card__time {
          position: absolute;
          bottom: 8px;
          right: 12px;
          font-size: 0.8rem;
          opacity: 0.7;
        }
        .screen {
          min-height: 100vh;
          color: #f8fbff;
          font-family: "Sora", sans-serif;
          background:
            radial-gradient(
              circle at 15% 10%,
              rgba(91, 208, 255, 0.1),
              transparent 24%
            ),
            radial-gradient(
              circle at 85% 16%,
              rgba(126, 162, 255, 0.08),
              transparent 18%
            ),
            linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
        }
        .hdr {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          position: sticky;
          top: 0;
          z-index: 10;
          background: rgba(5, 8, 18, 0.82);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .back-btn {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: #e7edff;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .hdr-title {
          display: block;
          font-size: 16px;
          font-weight: 800;
        }
        .hdr-sub {
          display: block;
          font-size: 12px;
          color: #8e98bc;
          margin-top: 2px;
        }
        .body {
          max-width: 1180px;
          margin: 0 auto;
          padding: 28px 18px 40px;
        }
        .state-card {
          padding: 24px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: #cfd8ff;
        }
        .subject-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .subject-card {
          position: relative;
          overflow: hidden;
          text-align: left;
          padding: 20px 18px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #f7f8ff;
          cursor: pointer;
          min-height: 138px;
          background: rgba(255, 255, 255, 0.03);
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease;
          animation: cardUp 0.35s ease both;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .subject-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 255, 255, 0.16);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
        }
        .subject-card::before {
          content: "";
          position: absolute;
          inset: auto -20% -35% auto;
          width: 120px;
          height: 120px;
          border-radius: 999px;
          filter: blur(10px);
          opacity: 0.72;
        }
        .subject-icon {
          position: relative;
          font-size: 24px;
        }
        .subject-name {
          position: relative;
          display: block;
          font-size: 20px;
          font-weight: 800;
        }
        .subject-meta {
          position: relative;
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #d9dfff;
        }
        .quiz-list,
        .attempt-list {
          display: grid;
          gap: 12px;
        }
        .quiz-card {
          position: relative;
          text-align: left;
          padding: 18px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(
            180deg,
            rgba(18, 23, 44, 0.92),
            rgba(8, 11, 22, 0.96)
          );
          color: #eff3ff;
          cursor: pointer;
        }
        .quiz-card__delete {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.05);
          color: #eef3ff;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
          z-index: 1;
        }
        .quiz-card__head,
        .report-panel__head,
        .attempt-card__head,
        .report-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .quiz-card__topic {
          display: block;
          font-size: 18px;
          font-weight: 800;
        }
        .quiz-card__meta,
        .attempt-card__body,
        .report-sub,
        .eyebrow,
        .report-stat__label {
          font-size: 12px;
          color: #98a5cf;
        }
        .quiz-card__time {
          font-size: 12px;
          color: #98a5cf;
          white-space: nowrap;
        }
        .quiz-card__stats {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 14px;
          color: #dfe6ff;
          font-size: 13px;
        }
        .report-shell {
          display: grid;
          gap: 16px;
        }
        .report-hero,
        .report-panel,
        .report-stat {
          padding: 20px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(
            180deg,
            rgba(18, 23, 44, 0.92),
            rgba(8, 11, 22, 0.96)
          );
        }
        .report-hero h1 {
          font-size: 30px;
          line-height: 1.04;
          margin: 4px 0 8px;
        }
        .eyebrow {
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .cta-btn {
          min-height: 48px;
          padding: 0 18px;
          border: none;
          border-radius: 16px;
          background: linear-gradient(135deg, #ffb95e, #ff8b6b);
          color: #071019;
          font-weight: 900;
          cursor: pointer;
        }
        .report-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .report-stat strong {
          display: block;
          margin-top: 8px;
          font-size: 28px;
          font-family: "JetBrains Mono", monospace;
        }
        .report-panel h2 {
          font-size: 20px;
        }
        .concept-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 14px 0 2px;
        }
        .concept-chip {
          padding: 7px 11px;
          border-radius: 999px;
          background: rgba(126, 162, 255, 0.12);
          border: 1px solid rgba(126, 162, 255, 0.24);
          color: #dfe8ff;
          font-size: 12px;
          font-weight: 700;
        }
        .attempt-card {
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #dfe6ff;
        }
        .attempt-card__index {
          font-weight: 700;
        }
        .attempt-card__grade {
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
        }
        .attempt-card__body {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        .tone-physics {
          background: linear-gradient(
            160deg,
            rgba(16, 34, 63, 0.96),
            rgba(9, 18, 36, 0.96)
          );
        }
        .tone-physics::before {
          background: rgba(91, 208, 255, 0.3);
        }
        .tone-chemistry {
          background: linear-gradient(
            160deg,
            rgba(18, 43, 30, 0.96),
            rgba(8, 23, 17, 0.96)
          );
        }
        .tone-chemistry::before {
          background: rgba(147, 255, 120, 0.28);
        }
        .tone-mathematics {
          background: linear-gradient(
            160deg,
            rgba(39, 26, 62, 0.96),
            rgba(17, 10, 30, 0.96)
          );
        }
        .tone-mathematics::before {
          background: rgba(199, 155, 255, 0.28);
        }
        .tone-biology {
          background: linear-gradient(
            160deg,
            rgba(63, 37, 16, 0.96),
            rgba(28, 17, 7, 0.96)
          );
        }
        .tone-biology::before {
          background: rgba(255, 198, 109, 0.28);
        }
        .tone-history {
          background: linear-gradient(
            160deg,
            rgba(64, 24, 15, 0.96),
            rgba(28, 10, 7, 0.96)
          );
        }
        .tone-history::before {
          background: rgba(255, 139, 107, 0.28);
        }
        .tone-geography {
          background: linear-gradient(
            160deg,
            rgba(12, 54, 48, 0.96),
            rgba(6, 24, 22, 0.96)
          );
        }
        .tone-geography::before {
          background: rgba(89, 240, 194, 0.28);
        }
        .tone-english {
          background: linear-gradient(
            160deg,
            rgba(61, 21, 40, 0.96),
            rgba(28, 9, 20, 0.96)
          );
        }
        .tone-english::before {
          background: rgba(255, 143, 179, 0.26);
        }
        .tone-computer {
          background: linear-gradient(
            160deg,
            rgba(19, 30, 70, 0.96),
            rgba(9, 14, 32, 0.96)
          );
        }
        .tone-computer::before {
          background: rgba(126, 162, 255, 0.28);
        }
        .tone-general {
          background: linear-gradient(
            160deg,
            rgba(34, 39, 56, 0.96),
            rgba(15, 18, 29, 0.96)
          );
        }
        .tone-general::before {
          background: rgba(240, 243, 255, 0.18);
        }
        @keyframes cardUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (max-width: 900px) {
          .subject-grid,
          .report-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .report-hero {
            flex-direction: column;
            align-items: flex-start;
          }
        }
        @media (max-width: 620px) {
          .subject-grid,
          .report-grid {
            grid-template-columns: 1fr;
          }
          .body {
            padding: 20px 14px 30px;
          }
        }
      `}</style>
    </>
  );
}

// frontend/pages/quiz.jsx — Upgraded Quiz with timers, dashboard & history

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  getQuiz,
  getQuizHistoryByNote,
  loadExistingQuiz,
  submitQuiz,
  chatWithBot,
} from "../services/api";

// ── Constants ─────────────────────────────────────────────────
const HISTORY_KEY = "gyaani_quiz_history";

// ── Helpers ───────────────────────────────────────────────────
function diffBadge(s) {
  if (s < 0.35)
    return { label: "Easy", color: "#37e6bf", bg: "rgba(55,230,191,0.12)" };
  if (s < 0.65)
    return { label: "Medium", color: "#ffb95e", bg: "rgba(255,185,94,0.12)" };
  return { label: "Hard", color: "#ff6b6b", bg: "rgba(255,107,107,0.12)" };
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function fmtTime(secs) {
  if (secs >= 3600)
    return `${Math.floor(secs / 3600)}h ${pad(Math.floor((secs % 3600) / 60))}m`;
  if (secs >= 60) return `${Math.floor(secs / 60)}m ${pad(secs % 60)}s`;
  return `${secs}s`;
}
function saveHistory(entry) {
  try {
    const prev = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([entry, ...prev].slice(0, 50)),
    );
  } catch {}
}
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
function grade(pct) {
  if (pct >= 90) return { label: "A+", color: "#37e6bf" };
  if (pct >= 75) return { label: "A", color: "#37e6bf" };
  if (pct >= 60) return { label: "B", color: "#7ea2ff" };
  if (pct >= 45) return { label: "C", color: "#ffb95e" };
  return { label: "F", color: "#ff6b6b" };
}

function buildResultsFromAttempt(quizEntry, latestAttempt, noteId, quizId) {
  const questions = Array.isArray(quizEntry?.quiz_data)
    ? quizEntry.quiz_data
    : [];
  const responses = Array.isArray(latestAttempt?.user_responses)
    ? latestAttempt.user_responses
    : [];

  const results = (responses.length ? responses : questions).map(
    (item, index) => {
      const question = questions[index] || {};
      const selected = item?.selected_option_index ?? item?.user_answer ?? null;
      const correct = item?.correct_answer ?? question.correct ?? 0;
      const options = item?.options || question.options || [];

      return {
        question:
          item?.question || question.question || `Question ${index + 1}`,
        options,
        selected,
        correct,
        isCorrect:
          item?.is_correct ?? (selected !== null && selected === correct),
        timeUp: selected == null,
        timeTaken: Math.round(
          ((latestAttempt?.time_spent_seconds || 0) * 1000) /
            Math.max(questions.length || responses.length || 1, 1),
        ),
        difficulty: item?.difficulty ?? question.confusion_score ?? 0.5,
        explanation:
          question.explanation ||
          `Concept tested: ${question.concept || item?.concept || ""}`,
      };
    },
  );

  return {
    score:
      latestAttempt?.correct ??
      results.filter((result) => result.isCorrect).length,
    results,
    totalMs: Math.round((latestAttempt?.time_spent_seconds || 0) * 1000),
    opts: {
      difficulty: latestAttempt?.difficulty || quizEntry?.difficulty || "mixed",
      time_per_question: Math.round(latestAttempt?.avg_time_per_question || 30),
      total_quiz_time: 0,
    },
    questions,
    forced: false,
    quizId,
    noteId,
    timeSpent: Math.round(latestAttempt?.time_spent_seconds || 0),
    readOnly: true,
  };
}

function SummaryLoadingScreen({ message = "Loading saved summary..." }) {
  return (
    <div className="summary-loading-screen">
      <div className="summary-loading-orb">
        <div className="summary-loading-ring summary-loading-ring--outer" />
        <div className="summary-loading-ring summary-loading-ring--inner" />
        <div className="summary-loading-core" />
      </div>
      <p>{message}</p>
      <style jsx>{`
        .summary-loading-screen {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at 18% 0%,
              rgba(91, 208, 255, 0.12),
              transparent 32%
            ),
            radial-gradient(
              circle at 84% 12%,
              rgba(108, 99, 255, 0.12),
              transparent 28%
            ),
            linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
          color: #f8fbff;
          font-family: "Sora", sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
        }
        .summary-loading-orb {
          position: relative;
          width: 78px;
          height: 78px;
        }
        .summary-loading-ring {
          position: absolute;
          border-radius: 999px;
        }
        .summary-loading-ring--outer {
          inset: 0;
          border: 2px solid transparent;
          border-top-color: #6c63ff;
          animation: spin 0.9s linear infinite;
        }
        .summary-loading-ring--inner {
          inset: 12px;
          border: 2px solid transparent;
          border-top-color: #5bd0ff;
          animation: spin 1.35s linear infinite reverse;
        }
        .summary-loading-core {
          position: absolute;
          inset: 26px;
          border-radius: 999px;
          background: radial-gradient(
            circle,
            rgba(108, 99, 255, 0.5),
            transparent 72%
          );
        }
        p {
          margin: 0;
          color: #9b95ff;
          font-size: 15px;
          font-weight: 800;
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

// ── Markdown + Math renderer ──────────────────────────────────
let _katexLoaded = false;
let _markedLoaded = false;

function ensureChatLibs() {
  if (typeof window === "undefined") return;
  if (!document.querySelector('link[href*="katex"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css";
    document.head.appendChild(link);
  }
  if (!window.katex && !document.querySelector('script[src*="katex.min.js"]')) {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js";
    s.onload = () => {
      _katexLoaded = true;
    };
    document.head.appendChild(s);
  } else if (window.katex) {
    _katexLoaded = true;
  }
  if (
    !window.marked &&
    !document.querySelector('script[src*="marked.min.js"]')
  ) {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js";
    s.onload = () => {
      _markedLoaded = true;
    };
    document.head.appendChild(s);
  } else if (window.marked) {
    _markedLoaded = true;
  }
}

function applyMath(html) {
  if (!window.katex) return html;
  // Display math $$...$$ or \[...\]
  html = html.replace(/\$\$([^$]+?)\$\$|\\\[([^\]]+?)\\\]/gs, (_, a, b) => {
    try {
      return `<span class="math-display">${window.katex.renderToString((a || b).trim(), { displayMode: true, throwOnError: false })}</span>`;
    } catch {
      return _;
    }
  });
  // Inline math $...$ or \(...\)
  html = html.replace(/\$([^$\n]+?)\$|\\\(([^)]+?)\\\)/g, (_, a, b) => {
    try {
      return `<span class="math-inline">${window.katex.renderToString((a || b).trim(), { displayMode: false, throwOnError: false })}</span>`;
    } catch {
      return _;
    }
  });
  return html;
}

function ChatMessage({ content }) {
  const ref = useRef(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    ensureChatLibs();
    const iv = setInterval(() => {
      if (window.katex && window.marked) {
        clearInterval(iv);
        setTick((n) => n + 1);
      }
    }, 150);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    let html = window.marked
      ? (() => {
          window.marked.setOptions({ breaks: true, gfm: true });
          return window.marked.parse(String(content || ""));
        })()
      : `<p>${String(content || "").replace(/\n/g, "<br/>")}</p>`;
    html = applyMath(html);
    ref.current.innerHTML = html;
  });

  return <div ref={ref} className="chat-md" />;
}

function AudioMessage({ audioUrl }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    if (audioRef.current && !hasPlayedRef.current) {
      hasPlayedRef.current = true;
      audioRef.current.load();
      audioRef.current.currentTime = 0;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [audioUrl]);

  return (
    <div
      style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}
    >
      <span
        onClick={() => {
          if (!audioRef.current) return;
          if (isPlaying) audioRef.current.pause();
          else audioRef.current.play();
        }}
        style={{
          cursor: "pointer",
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: isPlaying
            ? "linear-gradient(135deg, #6c63ff, #8b5cf6)"
            : "rgba(255,255,255,0.08)",
          color: "#fff",
          border: isPlaying ? "none" : "1px solid rgba(255,255,255,0.15)",
          boxShadow: isPlaying ? "0 2px 10px rgba(108,99,255,0.45)" : "none",
          transition: "all 0.2s ease",
        }}
      >
        {isPlaying ? "⏸" : "▶"}
      </span>
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        controls={false}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      {isPlaying && (
        <span style={{ fontSize: 10, opacity: 0.7 }}>Speaking...</span>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────
const commonStyles = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  .screen{
    min-height:100vh;color:#f8fbff;font-family:'Sora',sans-serif;
    background:
      radial-gradient(circle at 15% 10%, rgba(91,208,255,0.1), transparent 24%),
      radial-gradient(circle at 85% 16%, rgba(126,162,255,0.08), transparent 18%),
      linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
  }
  .hdr{
    display:flex;align-items:center;gap:12px;padding:14px 20px;
    position:sticky;top:0;z-index:40;
    background:rgba(5,8,18,0.82);backdrop-filter:blur(20px);
    border-bottom:1px solid rgba(255,255,255,0.06)
  }
  .back-btn{
    width:38px;height:38px;border-radius:12px;
    border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);
    color:#e7edff;cursor:pointer;font-size:16px;
    display:flex;align-items:center;justify-content:center;flex-shrink:0;
    transition:all 0.18s ease
  }
  .back-btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.18)}
  .hdr-title{display:block;font-size:16px;font-weight:800;color:#f5f8ff}
  .hdr-sub{display:block;font-size:12px;color:#8e98bc;margin-top:2px}
  .section-label{
    display:block;margin-bottom:14px;
    font-size:10px;font-weight:800;letter-spacing:0.28em;text-transform:uppercase;color:#62739f
  }
`;

// ── SCREEN 1: Config ──────────────────────────────────────────
function ConfigScreen({
  noteId,
  onStart,
  isExistingQuiz = false,
  existingQuizId = null,
  onBack,
}) {
  const router = useRouter();
  const [opts, setOpts] = useState({
    num_questions: 5,
    difficulty: "mixed",
    user_message: "",
    time_per_question: 30,
    total_quiz_time: 0,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    if (!noteId) {
      setErr("No note ID. Go back and try again.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      let data;
      let capturedQuizId = existingQuizId;
      if (isExistingQuiz && existingQuizId) {
        data = await loadExistingQuiz(noteId, existingQuizId);
      } else {
        data = await getQuiz(noteId, {
          num_questions: opts.num_questions,
          difficulty: opts.difficulty,
          user_message: opts.user_message,
        });
      }
      if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        data.quiz_id
      ) {
        capturedQuizId = data.quiz_id;
      }
      const questions = Array.isArray(data) ? data : data.quiz;
      if (!questions?.length) throw new Error("empty");
      onStart(questions, opts, capturedQuizId);
    } catch (err) {
      setErr(`Could not load questions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const diffColors = {
    easy: "#37e6bf",
    medium: "#ffb95e",
    hard: "#ff6b6b",
    mixed: "#c79bff",
  };

  return (
    <div className="screen cfg-page">
      <header className="hdr">
        <button
          className="back-btn"
          onClick={() => (onBack ? onBack() : router.back())}
        >
          ←
        </button>
        <div>
          <span className="hdr-title">
            {isExistingQuiz ? "Retake Quiz" : "Configure Quiz"}
          </span>
          <span className="hdr-sub">GYAANI AI</span>
        </div>
      </header>

      <div className="cfg-body">
        {/* Hero card */}
        <div className="cfg-hero">
          <div className="cfg-hero-glow" />
          <div className="cfg-icon-wrap">
            <span className="cfg-icon">🎯</span>
          </div>
          <h2 className="cfg-title">
            {isExistingQuiz ? "Retake Quiz" : "Configure Quiz"}
          </h2>
          <p className="cfg-sub">
            {isExistingQuiz
              ? "Retake your quiz to improve your score"
              : "Set up your quiz preferences before starting"}
          </p>
        </div>

        {!isExistingQuiz && (
          <div className="cfg-fields">
            {/* Questions */}
            <div className="cfg-field">
              <label className="section-label">Number of Questions</label>
              <div className="cfg-stepper">
                <button
                  onClick={() =>
                    setOpts((o) => ({
                      ...o,
                      num_questions: Math.max(3, o.num_questions - 1),
                    }))
                  }
                >
                  −
                </button>
                <span>{opts.num_questions}</span>
                <button
                  onClick={() =>
                    setOpts((o) => ({
                      ...o,
                      num_questions: Math.min(20, o.num_questions + 1),
                    }))
                  }
                >
                  +
                </button>
              </div>
            </div>

            {/* Difficulty */}
            <div className="cfg-field">
              <label className="section-label">Difficulty</label>
              <div className="cfg-chips">
                {["easy", "medium", "hard", "mixed"].map((d) => (
                  <button
                    key={d}
                    className={`cfg-chip ${opts.difficulty === d ? "cfg-chip--on" : ""}`}
                    style={
                      opts.difficulty === d
                        ? {
                            borderColor: diffColors[d],
                            color: diffColors[d],
                            background: `${diffColors[d]}18`,
                          }
                        : {}
                    }
                    onClick={() => setOpts((o) => ({ ...o, difficulty: d }))}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Total quiz time */}
            <div className="cfg-field">
              <label className="section-label">Total Quiz Time Limit</label>
              <div className="cfg-chips">
                {[
                  [0, "None"],
                  [5 * 60, "5 min"],
                  [10 * 60, "10 min"],
                  [15 * 60, "15 min"],
                  [30 * 60, "30 min"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={`cfg-chip ${opts.total_quiz_time === v ? "cfg-chip--on cfg-chip--time" : ""}`}
                    onClick={() =>
                      setOpts((o) => ({ ...o, total_quiz_time: v }))
                    }
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Focus */}
            <div className="cfg-field">
              <label className="section-label">
                Focus Area <span className="cfg-opt">optional</span>
              </label>
              <input
                className="cfg-input"
                placeholder="e.g. focus on formulas, derivations…"
                value={opts.user_message}
                onChange={(e) =>
                  setOpts((o) => ({ ...o, user_message: e.target.value }))
                }
              />
            </div>
          </div>
        )}

        {err && <p className="cfg-err">{err}</p>}

        <button className="cfg-start" onClick={start} disabled={loading}>
          {loading ? <span className="cfg-spinner" /> : "🚀 Start Quiz"}
        </button>
      </div>

      <style jsx>{`
        ${commonStyles}
        .cfg-page {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        .cfg-body {
          max-width: 480px;
          margin: 0 auto;
          width: 100%;
          padding: 28px 20px 60px;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .cfg-hero {
          position: relative;
          overflow: hidden;
          padding: 32px 24px;
          border-radius: 28px;
          background:
            radial-gradient(
              circle at top left,
              rgba(126, 162, 255, 0.16),
              transparent 40%
            ),
            radial-gradient(
              circle at bottom right,
              rgba(199, 155, 255, 0.14),
              transparent 30%
            ),
            linear-gradient(
              180deg,
              rgba(17, 22, 45, 0.97),
              rgba(7, 10, 23, 0.98)
            );
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
        }
        .cfg-hero-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(
            circle at 50% 0%,
            rgba(126, 162, 255, 0.12),
            transparent 60%
          );
        }
        .cfg-icon-wrap {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          background: linear-gradient(
            160deg,
            rgba(126, 162, 255, 0.18),
            rgba(199, 155, 255, 0.12)
          );
          border: 1px solid rgba(126, 162, 255, 0.22);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 28px rgba(126, 162, 255, 0.14);
        }
        .cfg-icon {
          font-size: 30px;
        }
        .cfg-title {
          font-size: 24px;
          font-weight: 800;
          color: #f5f8ff;
          line-height: 1.1;
        }
        .cfg-sub {
          font-size: 13px;
          color: #8e98bc;
          line-height: 1.6;
          max-width: 32ch;
        }
        .cfg-fields {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .cfg-field {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .cfg-opt {
          font-size: 10px;
          color: #7ea2ff;
          background: rgba(126, 162, 255, 0.1);
          border: 1px solid rgba(126, 162, 255, 0.2);
          padding: 2px 8px;
          border-radius: 20px;
          text-transform: none;
          letter-spacing: 0;
          font-weight: 600;
        }
        .cfg-stepper {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 14px;
          overflow: hidden;
          width: fit-content;
        }
        .cfg-stepper button {
          background: none;
          border: none;
          color: #9ea8c7;
          font-size: 22px;
          width: 48px;
          height: 48px;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.15s;
        }
        .cfg-stepper button:hover {
          background: rgba(126, 162, 255, 0.12);
          color: #fff;
        }
        .cfg-stepper span {
          font-size: 20px;
          font-weight: 800;
          color: #f5f8ff;
          min-width: 48px;
          text-align: center;
          font-family: "JetBrains Mono", monospace;
        }
        .cfg-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .cfg-chip {
          padding: 9px 18px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #8e98bc;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.18s ease;
        }
        .cfg-chip:hover {
          border-color: rgba(255, 255, 255, 0.2);
          color: #dce6ff;
          background: rgba(255, 255, 255, 0.07);
        }
        .cfg-chip--on {
          background: rgba(126, 162, 255, 0.12) !important;
          border-color: rgba(126, 162, 255, 0.4) !important;
          color: #7ea2ff !important;
        }
        .cfg-chip--time {
          background: rgba(55, 230, 191, 0.1) !important;
          border-color: rgba(55, 230, 191, 0.35) !important;
          color: #37e6bf !important;
        }
        .cfg-input {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 14px;
          padding: 13px 16px;
          color: #dce6ff;
          font-size: 14px;
          font-family: "Sora", sans-serif;
          outline: none;
          transition: border-color 0.2s;
        }
        .cfg-input:focus {
          border-color: rgba(126, 162, 255, 0.4);
          background: rgba(126, 162, 255, 0.04);
        }
        .cfg-input::placeholder {
          color: #3a4460;
        }
        .cfg-err {
          font-size: 12px;
          color: #ff6b6b;
          text-align: center;
          background: rgba(255, 107, 107, 0.08);
          border: 1px solid rgba(255, 107, 107, 0.2);
          padding: 10px 16px;
          border-radius: 12px;
        }
        .cfg-start {
          width: 100%;
          padding: 17px;
          background: linear-gradient(135deg, #7ea2ff, #c79bff);
          color: #05070f;
          border: none;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 800;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          box-shadow: 0 8px 28px rgba(126, 162, 255, 0.28);
          transition:
            transform 0.2s,
            box-shadow 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .cfg-start:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .cfg-start:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 36px rgba(126, 162, 255, 0.38);
        }
        .cfg-spinner {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid rgba(5, 7, 15, 0.3);
          border-top-color: #05070f;
          animation: spin 0.7s linear infinite;
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

// ── SCREEN 2: Quiz ────────────────────────────────────────────
function QuizScreen({ questions, opts, quizId, noteId, onFinish, onBack }) {
  const router = useRouter();
  const qTimerRef = useRef(null);
  const totalTimerRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [qTimeLeft, setQTimeLeft] = useState(opts.time_per_question);
  const [totalLeft, setTotalLeft] = useState(opts.total_quiz_time || null);
  const [qTimeTaken, setQTimeTaken] = useState([]);
  const qStartRef = useRef(Date.now());

  useEffect(() => {
    if (answered) return;
    setQTimeLeft(opts.time_per_question);
    qStartRef.current = Date.now();
    clearInterval(qTimerRef.current);
    qTimerRef.current = setInterval(() => {
      setQTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(qTimerRef.current);
          handleAnswer(null);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(qTimerRef.current);
  }, [current, answered]);

  useEffect(() => {
    if (!opts.total_quiz_time) return;
    clearInterval(totalTimerRef.current);
    totalTimerRef.current = setInterval(() => {
      setTotalLeft((t) => {
        if (t <= 1) {
          clearInterval(totalTimerRef.current);
          forceFinish();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(totalTimerRef.current);
  }, []);

  function forceFinish() {
    const totalMs = Date.now() - startTimeRef.current;
    onFinish({
      score,
      results,
      totalMs,
      opts,
      questions,
      forced: true,
      quizId,
      noteId,
      timeSpent: Math.round(totalMs / 1000),
    });
  }

  function handleAnswer(optIdx) {
    if (answered) return;
    clearInterval(qTimerRef.current);
    const taken = Date.now() - qStartRef.current;
    const q = questions[current];
    const isCorrect = optIdx !== null && optIdx === q.correct;
    setSelected(optIdx);
    setAnswered(true);
    if (isCorrect) setScore((s) => s + 1);
    setQTimeTaken((prev) => [...prev, taken]);
    setResults((r) => [
      ...r,
      {
        question: q.question,
        options: q.options,
        selected: optIdx,
        correct: q.correct,
        isCorrect,
        timeUp: optIdx === null,
        timeTaken: taken,
        difficulty: q.confusion_score,
        explanation: q.explanation,
      },
    ]);
  }

  function next() {
    if (current + 1 >= questions.length) {
      clearInterval(totalTimerRef.current);
      const totalMs = Date.now() - startTimeRef.current;
      onFinish({
        score,
        results: [...results],
        totalMs,
        opts,
        questions,
        forced: false,
        quizId,
        noteId,
        timeSpent: Math.round(totalMs / 1000),
      });
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
      setAnswered(false);
    }
  }

  const q = questions[current];
  const timerPct =
    ((opts.time_per_question - qTimeLeft) / opts.time_per_question) * 100;
  const qColor =
    qTimeLeft > opts.time_per_question * 0.5
      ? "#37e6bf"
      : qTimeLeft > opts.time_per_question * 0.25
        ? "#ffb95e"
        : "#ff6b6b";
  const progressPct = (current / questions.length) * 100;

  return (
    <div className="screen quiz-page">
      {/* HEADER */}
      <header className="hdr">
        <button
          className="back-btn"
          onClick={() => (onBack ? onBack() : router.back())}
        >
          ←
        </button>
        <div className="quiz-progress-info">
          <span className="quiz-q-count">
            {current + 1} <span style={{ color: "#3a4460" }}>/</span>{" "}
            {questions.length}
          </span>
          {totalLeft !== null && (
            <span
              className={`total-timer ${totalLeft < 60 ? "total-timer--warn" : ""}`}
            >
              ⏱ {fmtTime(totalLeft)} left
            </span>
          )}
        </div>
        <div className="quiz-score-pill">
          <span className="score-val">{score}</span>
          <span className="score-lbl">pts</span>
        </div>
      </header>

      {/* Progress bar */}
      <div className="prog-bar-wrap">
        <div className="prog-bar">
          <div className="prog-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Progress dots */}
      <div className="dot-row">
        {questions.map((_, i) => {
          const r = results[i];
          return (
            <div
              key={i}
              className={`qdot ${i === current ? "qdot--active" : ""} ${r ? (r.isCorrect ? "qdot--ok" : "qdot--fail") : ""}`}
            />
          );
        })}
      </div>

      <div className="quiz-body">
        {/* Timer row */}
        <div className="q-timer-row">
          <div
            className="q-timer-ring"
            style={{ "--color": qColor, "--pct": `${100 - timerPct}%` }}
          >
            <span className="q-timer-num" style={{ color: qColor }}>
              {qTimeLeft}
            </span>
          </div>
          <div className="q-timer-label">
            <span className="q-timer-caption">Time per question</span>
            <div className="q-timer-track">
              <div
                className="q-timer-bar"
                style={{ width: `${100 - timerPct}%`, background: qColor }}
              />
            </div>
          </div>
        </div>

        {/* Question card */}
        <div className="q-card">
          {q.confusion_score !== undefined && (
            <span
              className="diff-badge"
              style={{
                color: diffBadge(q.confusion_score).color,
                background: diffBadge(q.confusion_score).bg,
              }}
            >
              {diffBadge(q.confusion_score).label}
            </span>
          )}
          <p className="q-text">{q.question}</p>
        </div>

        {/* Options */}
        <div className="opts-list">
          {q.options?.map((opt, i) => {
            const isSelected = selected === i;
            const isCorrect = i === q.correct;
            let cls = "opt";
            if (answered) {
              if (isCorrect) cls += " opt--correct";
              else if (isSelected && !isCorrect) cls += " opt--wrong";
              else cls += " opt--dim";
            }
            return (
              <button
                key={i}
                className={cls}
                disabled={answered}
                onClick={() => handleAnswer(i)}
              >
                <span className="opt-letter">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="opt-text">
                  {typeof opt === "object" ? opt.en || opt : opt}
                </span>
                {answered && isCorrect && (
                  <span className="opt-icon opt-icon--ok">✓</span>
                )}
                {answered && isSelected && !isCorrect && (
                  <span className="opt-icon opt-icon--x">✗</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Time-up */}
        {answered && selected === null && (
          <div className="timeup">
            ⏰ Time&apos;s up! The correct answer is shown above.
          </div>
        )}

        {/* Explanation */}
        {answered && q.explanation && (
          <div
            className={`exp-panel ${results[results.length - 1]?.isCorrect ? "exp--ok" : "exp--fail"}`}
          >
            <p className="exp-verdict">
              {results[results.length - 1]?.isCorrect
                ? "✅ Correct!"
                : "❌ Incorrect"}
            </p>
            <p className="exp-text">{q.explanation}</p>
          </div>
        )}

        {/* Next */}
        {answered && (
          <button className="next-btn" onClick={next}>
            {current + 1 >= questions.length
              ? "See Results →"
              : "Next Question →"}
          </button>
        )}
      </div>

      <style jsx>{`
        ${commonStyles}
        .quiz-page {
          display: flex;
          flex-direction: column;
        }
        .quiz-progress-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .quiz-q-count {
          font-size: 15px;
          font-weight: 800;
          color: #f5f8ff;
          font-family: "JetBrains Mono", monospace;
        }
        .total-timer {
          font-size: 12px;
          font-weight: 700;
          color: #7ea2ff;
          background: rgba(126, 162, 255, 0.1);
          border: 1px solid rgba(126, 162, 255, 0.25);
          padding: 4px 12px;
          border-radius: 20px;
          font-family: "JetBrains Mono", monospace;
        }
        .total-timer--warn {
          color: #ff6b6b !important;
          background: rgba(255, 107, 107, 0.1) !important;
          border-color: rgba(255, 107, 107, 0.3) !important;
          animation: blink 0.8s ease-in-out infinite alternate;
        }
        @keyframes blink {
          from {
            opacity: 1;
          }
          to {
            opacity: 0.45;
          }
        }
        .quiz-score-pill {
          display: flex;
          align-items: baseline;
          gap: 4px;
          background: rgba(55, 230, 191, 0.1);
          border: 1px solid rgba(55, 230, 191, 0.25);
          padding: 5px 14px;
          border-radius: 20px;
        }
        .score-val {
          font-size: 15px;
          font-weight: 800;
          color: #37e6bf;
          font-family: "JetBrains Mono", monospace;
        }
        .score-lbl {
          font-size: 10px;
          color: #37e6bf;
          font-weight: 700;
          opacity: 0.7;
        }

        .prog-bar-wrap {
          padding: 0 20px 4px;
        }
        .prog-bar {
          height: 3px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 2px;
          overflow: hidden;
          max-width: 620px;
          margin: 0 auto;
        }
        .prog-fill {
          height: 100%;
          background: linear-gradient(90deg, #7ea2ff, #c79bff);
          border-radius: 2px;
          transition: width 0.4s ease;
        }

        .dot-row {
          display: flex;
          justify-content: center;
          gap: 6px;
          padding: 10px 20px;
          flex-wrap: wrap;
        }
        .qdot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          transition: all 0.3s;
        }
        .qdot--active {
          background: #7ea2ff;
          transform: scale(1.6);
          box-shadow: 0 0 8px rgba(126, 162, 255, 0.6);
        }
        .qdot--ok {
          background: #37e6bf;
        }
        .qdot--fail {
          background: #ff6b6b;
        }

        .quiz-body {
          max-width: 580px;
          margin: 0 auto;
          padding: 16px 20px 48px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }

        /* Timer */
        .q-timer-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .q-timer-ring {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          flex-shrink: 0;
          border: 3px solid rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background: conic-gradient(
            var(--color) var(--pct),
            rgba(255, 255, 255, 0.05) 0
          );
          transition: background 0.5s;
        }
        .q-timer-ring::before {
          content: "";
          position: absolute;
          inset: 5px;
          border-radius: 50%;
          background: linear-gradient(180deg, #090d1b, #05070f);
        }
        .q-timer-num {
          font-size: 16px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          position: relative;
          z-index: 1;
          transition: color 0.3s;
        }
        .q-timer-label {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .q-timer-caption {
          font-size: 11px;
          color: #3a4460;
          font-weight: 600;
        }
        .q-timer-track {
          height: 4px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 2px;
          overflow: hidden;
        }
        .q-timer-bar {
          height: 100%;
          border-radius: 2px;
          transition:
            width 0.9s linear,
            background 0.3s;
        }

        /* Question card */
        .q-card {
          background:
            radial-gradient(
              circle at top right,
              rgba(126, 162, 255, 0.07),
              transparent 50%
            ),
            linear-gradient(
              180deg,
              rgba(17, 22, 45, 0.9),
              rgba(7, 10, 23, 0.92)
            );
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 22px;
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22);
        }
        .diff-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 12px;
          border-radius: 20px;
          width: fit-content;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .q-text {
          font-size: 17px;
          font-weight: 600;
          color: #dce6ff;
          line-height: 1.65;
        }

        /* Options */
        .opts-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .opt {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 15px 18px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: linear-gradient(
            180deg,
            rgba(17, 22, 45, 0.7),
            rgba(9, 13, 26, 0.8)
          );
          cursor: pointer;
          text-align: left;
          font-family: "Sora", sans-serif;
          transition: all 0.2s ease;
          width: 100%;
        }
        .opt:not(:disabled):hover {
          border-color: rgba(126, 162, 255, 0.45);
          background: linear-gradient(
            180deg,
            rgba(22, 34, 66, 0.85),
            rgba(12, 18, 36, 0.9)
          );
          transform: translateX(5px);
          box-shadow: 0 8px 24px rgba(126, 162, 255, 0.1);
        }
        .opt:disabled {
          cursor: default;
        }
        .opt-letter {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          flex-shrink: 0;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          color: #62739f;
          transition: all 0.2s;
        }
        .opt-text {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
          color: #c8d3ee;
          line-height: 1.45;
        }
        .opt-icon {
          font-size: 16px;
          font-weight: 900;
          flex-shrink: 0;
        }
        .opt-icon--ok {
          color: #37e6bf;
        }
        .opt-icon--x {
          color: #ff6b6b;
        }

        .opt--correct {
          border-color: #37e6bf !important;
          background: linear-gradient(
            180deg,
            rgba(55, 230, 191, 0.1),
            rgba(55, 230, 191, 0.06)
          ) !important;
          animation: popIn 0.4s ease;
          box-shadow: 0 6px 20px rgba(55, 230, 191, 0.12) !important;
        }
        .opt--correct .opt-letter {
          background: #37e6bf !important;
          color: #05070f !important;
        }
        @keyframes popIn {
          0% {
            transform: scale(1);
          }
          40% {
            transform: scale(1.025);
          }
          100% {
            transform: scale(1);
          }
        }

        .opt--wrong {
          border-color: #ff6b6b !important;
          background: linear-gradient(
            180deg,
            rgba(255, 107, 107, 0.1),
            rgba(255, 107, 107, 0.06)
          ) !important;
          animation: shake 0.4s ease;
          box-shadow: 0 6px 20px rgba(255, 107, 107, 0.1) !important;
        }
        .opt--wrong .opt-letter {
          background: #ff6b6b !important;
          color: #fff !important;
        }
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20%,
          60% {
            transform: translateX(-6px);
          }
          40%,
          80% {
            transform: translateX(6px);
          }
        }
        .opt--dim {
          opacity: 0.22;
        }

        .timeup {
          text-align: center;
          font-size: 13px;
          color: #ff6b6b;
          font-weight: 600;
          background: rgba(255, 107, 107, 0.07);
          border: 1px solid rgba(255, 107, 107, 0.2);
          padding: 12px;
          border-radius: 12px;
        }

        /* Explanation */
        .exp-panel {
          border-radius: 18px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          animation: slideUp 0.35s ease;
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .exp--ok {
          background: rgba(55, 230, 191, 0.07);
          border: 1px solid rgba(55, 230, 191, 0.2);
        }
        .exp--fail {
          background: rgba(255, 107, 107, 0.07);
          border: 1px solid rgba(255, 107, 107, 0.2);
        }
        .exp-verdict {
          font-size: 15px;
          font-weight: 800;
          color: #f5f8ff;
        }
        .exp-text {
          font-size: 13px;
          color: #8e98bc;
          line-height: 1.75;
          font-weight: 400;
        }

        .next-btn {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #7ea2ff, #c79bff);
          color: #05070f;
          border: none;
          border-radius: 16px;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          box-shadow: 0 6px 24px rgba(126, 162, 255, 0.28);
          transition:
            transform 0.18s,
            box-shadow 0.18s;
        }
        .next-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(126, 162, 255, 0.38);
        }
      `}</style>
    </div>
  );
}

// ── SCREEN 3: Results Dashboard (Upgraded Theme) ───────────────────────────
function ResultsDashboard({ data, noteId, onRetry, onHome, onBack }) {
  const router = useRouter();
  const {
    score,
    results,
    totalMs,
    opts,
    questions,
    forced,
    quizId,
    timeSpent,
    readOnly,
  } = data;
  const total = questions.length;
  const pct = Math.round((score / total) * 100);
  const g = grade(pct);
  const avgQTime = results.length
    ? Math.round(
        results.reduce((a, r) => a + r.timeTaken, 0) / results.length / 1000,
      )
    : 0;

  const [doubtMsgs, setDoubtMsgs] = useState([
    {
      role: "ai",
      text: "Review complete. Your learning DNA has been updated. Ask me to explain the concepts you missed! 🎯",
    },
  ]);
  const [doubtInput, setDoubtInput] = useState("");
  const [doubtLoading, setDoubtLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const tutorChatRef = useRef(null);

  const DOUBT_CHIPS = [
    "Explain wrong answers",
    "Key concepts to revise",
    "Score improvement tips",
  ];

  useEffect(() => {
    const chatPane = tutorChatRef.current;
    if (chatPane) {
      chatPane.scrollTop = chatPane.scrollHeight;
    }
  }, [doubtMsgs, doubtLoading]);

  async function sendBackendDoubt(text, options = {}) {
    const msg = text || doubtInput.trim();
    if (!msg) return;
    setDoubtInput("");
    setDoubtMsgs((prev) => [...prev, { role: "user", text: msg }]);
    setDoubtLoading(true);
    try {
      const json = await chatWithBot({
        message: msg,
        noteId,
        contextType: "quiz",
        is_audio: !!options.isAudio,
      });
      setDoubtMsgs((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            json.response || "I'm analyzing your request. Try again shortly.",
          audio_url: json.audio_url || null,
        },
      ]);
    } catch {
      setDoubtMsgs((prev) => [
        ...prev,
        {
          role: "ai",
          text: "Connection to neural network failed. Please check your network.",
        },
      ]);
    }
    setDoubtLoading(false);
  }

  function handleTutorVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input not supported in this browser.");
      return;
    }
    if (isListening || doubtLoading) return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    setIsListening(true);
    rec.onresult = async (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || "";
      if (!transcript.trim()) return;
      setDoubtInput(transcript);
      await sendBackendDoubt(transcript, { isAudio: true });
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  }

  // Tracking logic preserved
  useEffect(() => {
    if (readOnly) return;
    saveHistory({
      date: new Date().toISOString(),
      score,
      total,
      pct,
      totalMs,
      avgQTime,
      difficulty: opts.difficulty,
      timePerQ: opts.time_per_question,
      grade: g.label,
    });
    const attempts = parseInt(localStorage.getItem("quiz_attempts") || "0");
    localStorage.setItem("quiz_attempts", String(attempts + 1));
    localStorage.setItem("avg_quiz_score", String(pct));

    async function submitToBackend() {
      if (!quizId || !noteId) return;
      try {
        const answers = {};
        results.forEach((result, idx) => {
          answers[String(questions[idx].id || idx)] = result.selected;
        });
        await submitQuiz(
          noteId,
          quizId,
          answers,
          timeSpent || Math.round(totalMs / 1000),
        );
      } catch (err) {
        console.error("Sync failed:", err);
      }
    }
    submitToBackend();
  }, [readOnly]);

  return (
    <div className="dash-screen" style={{ "--status-color": g.color }}>
      <div className="nebula nebula-a" />
      <div className="nebula nebula-b" />

      <header className="hdr dash-hdr">
        <button className="back-btn" onClick={onBack}>
          {" "}
          ←{" "}
        </button>
        <div className="hdr-center">
          <span className="hdr-kicker">PERFORMANCE REPORT</span>
          <h2 className="hdr-title">Knowledge Analysis</h2>
        </div>
        <div className="dash-actions">
          <button className="pill-btn retry" onClick={onRetry}>
            {" "}
            🔄 Retake{" "}
          </button>
        </div>
      </header>

      <div className="dash-container">
        <div className="dash-stats-col">
          <section className="identity-hero">
            <div className="grade-orb">
              <div className="orb-inner">{g.label}</div>
              <div className="orb-ring" />
              <div className="orb-glow" />
            </div>
            <div className="hero-text">
              <h3>
                {score} of {total} Correct
              </h3>
              <p className="hero-pct">{pct}% Accuracy</p>
              {forced && (
                <span className="warning-tag">Time Limit Exceeded</span>
              )}
            </div>
          </section>

          <div className="metrics-grid">
            <MetricCard
              icon="⏱"
              label="Duration"
              val={fmtTime(Math.round(totalMs / 1000))}
              color="#7ea2ff"
            />
            <MetricCard
              icon="⚡"
              label="Speed"
              val={`${avgQTime}s/q`}
              color="#ffb95e"
            />
            <MetricCard
              icon="🎯"
              label="Difficulty"
              val={opts.difficulty}
              color="#c79bff"
            />
          </div>

          <label className="section-label">Neural Breakdown</label>
          <div className="breakdown-list">
            {results.map((r, i) => (
              <div
                key={i}
                className={`bq-item ${r.isCorrect ? "pass" : "fail"}`}
              >
                <div className="bq-status-line" />
                <div className="bq-content">
                  <p className="bq-q">{r.question}</p>
                  <div className="bq-meta">
                    <span>⏱ {(r.timeTaken / 1000).toFixed(1)}s</span>
                    {!r.isCorrect && (
                      <span className="bq-ans">
                        Correct: {r.options?.[r.correct]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ai-tutor-panel">
          <div className="tutor-head">
            <span className="tutor-avatar">🤖</span>
            <div>
              <h4>Neural Tutor</h4>
              <p>Ready to explain your mistakes</p>
            </div>
          </div>

          <div className="tutor-chat" ref={tutorChatRef}>
            {doubtMsgs.map((m, i) => (
              <div
                key={i}
                className={`msg-row ${m.role === "user" ? "me" : "ai"}`}
              >
                <div className="msg-bubble">
                  {m.role === "ai" ? (
                    <>
                      <ChatMessage content={m.text} />
                      {m.audio_url && <AudioMessage audioUrl={m.audio_url} />}
                    </>
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            ))}
            {doubtLoading && (
              <div className="msg-row ai">
                <div className="msg-bubble loading-dots">...</div>
              </div>
            )}
          </div>

          <div className="tutor-chips">
            {DOUBT_CHIPS.map((c) => (
              <button key={c} onClick={() => sendBackendDoubt(c)}>
                {c}
              </button>
            ))}
          </div>

          <div className="tutor-input-area">
            <input
              placeholder="Ask GYAANI about these results..."
              value={doubtInput}
              onChange={(e) => setDoubtInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendBackendDoubt()}
            />
            <button
              className="send-btn"
              onClick={handleTutorVoice}
              title="Voice input"
              disabled={doubtLoading || isListening}
              style={{
                background: isListening
                  ? "linear-gradient(135deg, #6c63ff, #8b5cf6)"
                  : undefined,
              }}
            >
              🎙️
            </button>
            <button className="send-btn" onClick={() => sendBackendDoubt()}>
              →
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .dash-screen {
          min-height: 100vh;
          background: #05070f;
          color: #fff;
          position: relative;
          overflow: hidden;
        }
        .nebula {
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.35;
        }
        .nebula-a {
          background: radial-gradient(
            circle at 0% 0%,
            var(--status-color),
            transparent 40%
          );
        }
        .nebula-b {
          background: radial-gradient(
            circle at 100% 100%,
            #1a1a2e,
            transparent 40%
          );
        }

        .dash-hdr {
          padding: 15px 25px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .hdr-center {
          flex: 1;
          margin-left: 20px;
        }
        .hdr-kicker {
          font-size: 9px;
          letter-spacing: 2px;
          color: #7ea2ff;
          font-weight: 800;
        }
        .hdr-title {
          font-size: 18px;
          font-weight: 800;
          margin: 0;
        }

        .pill-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          padding: 8px 18px;
          border-radius: 20px;
          cursor: pointer;
          font-weight: 700;
          transition: 0.2s;
        }
        .pill-btn.retry {
          background: var(--status-color);
          color: #05070f;
          border: none;
        }
        .pill-btn:hover {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }

        .dash-container {
          max-width: 1300px;
          margin: 0 auto;
          height: calc(100vh - 72px);
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 24px;
          padding: 24px;
        }
        .dash-stats-col {
          overflow-y: auto;
          padding-right: 8px;
        }
        .dash-stats-col::-webkit-scrollbar {
          width: 4px;
        }
        .dash-stats-col::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }

        .identity-hero {
          display: flex;
          align-items: center;
          gap: 30px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 32px;
          border-radius: 28px;
          margin-bottom: 24px;
        }
        .grade-orb {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .orb-inner {
          font-size: 38px;
          font-weight: 900;
          z-index: 2;
          color: var(--status-color);
          font-family: "JetBrains Mono";
        }
        .orb-ring {
          position: absolute;
          inset: -6px;
          border: 2px dashed var(--status-color);
          border-radius: 50%;
          opacity: 0.3;
          animation: spin 12s linear infinite;
        }
        .orb-glow {
          position: absolute;
          inset: 0;
          background: var(--status-color);
          filter: blur(30px);
          opacity: 0.15;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .hero-text h3 {
          font-size: 24px;
          font-weight: 800;
          margin: 0;
        }
        .hero-pct {
          font-size: 15px;
          color: var(--status-color);
          font-weight: 700;
          margin-top: 4px;
        }
        .warning-tag {
          font-size: 10px;
          background: rgba(255, 107, 107, 0.1);
          color: #ff6b6b;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 800;
          margin-top: 8px;
          display: inline-block;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 30px;
        }
        .breakdown-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 16px;
        }
        .bq-item {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 18px;
          display: flex;
          gap: 16px;
        }
        .bq-status-line {
          width: 4px;
          border-radius: 10px;
          flex-shrink: 0;
        }
        .pass .bq-status-line {
          background: #37e6bf;
          box-shadow: 0 0 10px rgba(55, 230, 191, 0.3);
        }
        .fail .bq-status-line {
          background: #ff6b6b;
          box-shadow: 0 0 10px rgba(255, 107, 107, 0.3);
        }
        .bq-q {
          font-size: 14px;
          font-weight: 600;
          color: #dce6ff;
          margin-bottom: 8px;
        }
        .bq-meta {
          display: flex;
          gap: 15px;
          font-size: 11px;
          color: #62739f;
          font-weight: 700;
        }

        .ai-tutor-panel {
          background: rgba(7, 10, 23, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 30px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          backdrop-filter: blur(20px);
        }
        .tutor-head {
          padding: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .tutor-avatar {
          font-size: 24px;
          background: rgba(126, 162, 255, 0.1);
          padding: 8px;
          border-radius: 14px;
        }
        .tutor-head h4 {
          font-size: 15px;
          font-weight: 800;
          margin: 0;
        }
        .tutor-head p {
          font-size: 11px;
          color: #62739f;
          margin: 0;
        }

        .tutor-chat {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .msg-row {
          display: flex;
          flex-direction: column;
        }
        .msg-bubble {
          max-width: 90%;
          padding: 14px 18px;
          border-radius: 20px;
          font-size: 13px;
          line-height: 1.6;
        }
        .ai .msg-bubble {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-bottom-left-radius: 4px;
          color: #dce6ff;
        }
        .me .msg-bubble {
          background: #7ea2ff;
          color: #05070f;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
          font-weight: 600;
        }

        .tutor-chips {
          padding: 10px 20px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .tutor-chips button {
          background: rgba(126, 162, 255, 0.08);
          border: 1px solid rgba(126, 162, 255, 0.2);
          color: #7ea2ff;
          font-size: 10px;
          padding: 7px 14px;
          border-radius: 15px;
          cursor: pointer;
          font-weight: 700;
          transition: 0.2s;
        }
        .tutor-chips button:hover {
          background: rgba(126, 162, 255, 0.15);
          border-color: #7ea2ff;
        }

        .tutor-input-area {
          padding: 18px 20px;
          background: rgba(0, 0, 0, 0.25);
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .tutor-input-area input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #fff;
          font-size: 13px;
          font-family: "Sora", sans-serif;
        }
        .send-btn {
          background: #7ea2ff;
          border: none;
          color: #05070f;
          width: 36px;
          height: 36px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 800;
          transition: 0.2s;
        }
        .send-btn:hover {
          transform: scale(1.05);
          background: #5bd0ff;
        }

        @media (max-width: 950px) {
          .dash-container {
            grid-template-columns: 1fr;
            height: auto;
            overflow: visible;
          }
          .ai-tutor-panel {
            height: 500px;
            margin-top: 20px;
          }
          .dash-stats-col {
            overflow: visible;
          }
        }
      `}</style>
    </div>
  );
}

function MetricCard({ icon, label, val, color }) {
  return (
    <div className="m-card" style={{ borderColor: color + "22" }}>
      <span className="m-icon">{icon}</span>
      <div className="m-text">
        <p className="m-label">{label}</p>
        <p className="m-val" style={{ color }}>
          {val}
        </p>
      </div>
      <style jsx>{`
        .m-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid;
          padding: 15px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .m-icon {
          font-size: 20px;
          opacity: 0.7;
        }
        .m-label {
          font-size: 9px;
          color: #62739f;
          text-transform: uppercase;
          font-weight: 800;
          letter-spacing: 1px;
        }
        .m-val {
          font-size: 15px;
          font-weight: 800;
          font-family: "JetBrains Mono";
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}

// ── SCREEN 4: History ─────────────────────────────────────────
function HistoryScreen({ onBack }) {
  const [history] = useState(loadHistory);

  function clearHistory() {
    if (confirm("Clear all quiz history?"))
      (localStorage.removeItem(HISTORY_KEY), window.location.reload());
  }

  return (
    <div className="screen hist-page">
      <header className="hdr">
        <button className="back-btn" onClick={onBack}>
          ←
        </button>
        <div>
          <span className="hdr-title">Quiz History</span>
          <span className="hdr-sub">Your past attempts</span>
        </div>
        {history.length > 0 && (
          <button className="hist-clear" onClick={clearHistory}>
            Clear All
          </button>
        )}
      </header>

      <div className="hist-body">
        {history.length === 0 ? (
          <div className="hist-empty">
            <div className="hist-empty-icon">📊</div>
            <p className="hist-empty-title">No quiz history yet</p>
            <p className="hist-empty-sub">
              Complete a quiz to see your data here
            </p>
          </div>
        ) : (
          <>
            <div className="hist-summary">
              {[
                {
                  label: "Quizzes Taken",
                  val: history.length,
                  icon: "📋",
                  accent: "#7ea2ff",
                },
                {
                  label: "Avg Score",
                  val: `${Math.round(history.reduce((a, h) => a + h.pct, 0) / history.length)}%`,
                  icon: "📈",
                  accent: "#c79bff",
                },
                {
                  label: "Best Score",
                  val: `${Math.max(...history.map((h) => h.pct))}%`,
                  icon: "🏆",
                  accent: "#37e6bf",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="hs-card"
                  style={{ borderColor: `${s.accent}20` }}
                >
                  <span className="hs-icon">{s.icon}</span>
                  <span className="hs-val" style={{ color: s.accent }}>
                    {s.val}
                  </span>
                  <span className="hs-lbl">{s.label}</span>
                </div>
              ))}
            </div>

            <span className="section-label">Recent Attempts</span>

            {history.map((h, i) => {
              const g = grade(h.pct);
              return (
                <div
                  key={i}
                  className="hist-entry"
                  style={{ borderColor: `${g.color}14` }}
                >
                  <div
                    className="he-grade"
                    style={{
                      color: g.color,
                      borderColor: g.color,
                      boxShadow: `0 0 16px ${g.color}20`,
                    }}
                  >
                    {g.label}
                  </div>
                  <div className="he-info">
                    <div className="he-top">
                      <span className="he-score" style={{ color: g.color }}>
                        {h.pct}%
                      </span>
                      <span className="he-meta">
                        {h.score}/{h.total} · {h.difficulty} · {h.timePerQ}s/q
                      </span>
                    </div>
                    <div className="he-bottom">
                      <span className="he-time">
                        ⏱ {fmtTime(Math.round(h.totalMs / 1000))}
                      </span>
                      <span className="he-date">
                        {new Date(h.date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <style jsx>{`
        ${commonStyles}
        .hist-page {
          min-height: 100vh;
        }
        .hist-clear {
          margin-left: auto;
          font-size: 12px;
          color: #ff6b6b;
          background: rgba(255, 107, 107, 0.07);
          border: 1px solid rgba(255, 107, 107, 0.2);
          padding: 7px 14px;
          border-radius: 20px;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          font-weight: 700;
          transition: all 0.15s;
        }
        .hist-clear:hover {
          background: rgba(255, 107, 107, 0.14);
        }
        .hist-body {
          max-width: 580px;
          margin: 0 auto;
          padding: 24px 20px 48px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .hist-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 60px 20px;
          text-align: center;
        }
        .hist-empty-icon {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          font-size: 30px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hist-empty-title {
          font-size: 16px;
          font-weight: 700;
          color: #62739f;
        }
        .hist-empty-sub {
          font-size: 13px;
          color: #3a4460;
        }
        .hist-summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 4px;
        }
        .hs-card {
          background: linear-gradient(
            180deg,
            rgba(17, 22, 45, 0.8),
            rgba(7, 10, 23, 0.85)
          );
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 18px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          transition: transform 0.18s;
        }
        .hs-card:hover {
          transform: translateY(-2px);
        }
        .hs-icon {
          font-size: 20px;
        }
        .hs-val {
          font-size: 22px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
        }
        .hs-lbl {
          font-size: 10px;
          color: #3a4460;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-align: center;
        }
        .hist-entry {
          display: flex;
          align-items: center;
          gap: 14px;
          background: linear-gradient(
            180deg,
            rgba(17, 22, 45, 0.75),
            rgba(9, 13, 26, 0.8)
          );
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 18px;
          padding: 16px;
          transition:
            transform 0.18s,
            border-color 0.18s;
        }
        .hist-entry:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.1);
        }
        .he-grade {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 2px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          flex-shrink: 0;
        }
        .he-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }
        .he-top {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .he-score {
          font-size: 19px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
        }
        .he-meta {
          font-size: 12px;
          color: #3a4460;
        }
        .he-bottom {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .he-time {
          font-size: 11px;
          color: #2a3250;
          font-family: "JetBrains Mono", monospace;
        }
        .he-date {
          font-size: 11px;
          color: #2a3250;
          margin-left: auto;
        }
      `}</style>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────
export default function Quiz() {
  const router = useRouter();
  const { noteId, quizId, from, view } = router.query;
  const [screen, setScreen] = useState("config");
  const [questions, setQuestions] = useState([]);
  const [opts, setOpts] = useState(null);
  const [results, setResults] = useState(null);
  const [currentQuizId, setCurrentQuizId] = useState(null);
  const [restoringSummary, setRestoringSummary] = useState(false);
  const [loadingSavedQuiz, setLoadingSavedQuiz] = useState(false);
  const [restoreError, setRestoreError] = useState("");

  useEffect(() => {
    if (!router.isReady || view !== "summary" || !noteId || !quizId) return;
    let cancelled = false;

    async function restoreSummary() {
      setRestoringSummary(true);
      setRestoreError("");
      try {
        const history = await getQuizHistoryByNote(noteId);
        const quizEntry = (history.quizzes || []).find(
          (item) => item.quiz_id === quizId,
        );
        const latestAttempt = quizEntry?.attempts?.[0];

        if (!quizEntry || !latestAttempt) {
          throw new Error("No saved attempt found for this quiz.");
        }

        if (cancelled) return;
        setQuestions(
          Array.isArray(quizEntry.quiz_data) ? quizEntry.quiz_data : [],
        );
        setCurrentQuizId(quizId);
        setResults(
          buildResultsFromAttempt(quizEntry, latestAttempt, noteId, quizId),
        );
        setScreen("results");
      } catch (error) {
        if (cancelled) return;
        setRestoreError(error.message || "Failed to restore saved summary.");
        setScreen("config");
      } finally {
        if (!cancelled) setRestoringSummary(false);
      }
    }

    restoreSummary();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, view, noteId, quizId]);

  useEffect(() => {
    if (!router.isReady || view === "summary" || !noteId || !quizId) return;
    let cancelled = false;

    async function restoreQuiz() {
      setLoadingSavedQuiz(true);
      setRestoreError("");
      try {
        const data = await loadExistingQuiz(noteId, quizId);
        const restoredQuestions = Array.isArray(data) ? data : data?.quiz;
        if (!restoredQuestions?.length) {
          throw new Error("No saved quiz questions found.");
        }
        if (cancelled) return;
        setQuestions(restoredQuestions);
        setOpts({
          num_questions: restoredQuestions.length,
          difficulty: "mixed",
          user_message: "",
          time_per_question: 30,
          total_quiz_time: 0,
        });
        setCurrentQuizId(data?.quiz_id || quizId);
        setScreen("quiz");
      } catch (error) {
        if (cancelled) return;
        setRestoreError(error.message || "Failed to restore saved quiz.");
        setScreen("config");
      } finally {
        if (!cancelled) setLoadingSavedQuiz(false);
      }
    }

    restoreQuiz();
    return () => {
      cancelled = true;
    };
  }, [router.isReady, view, noteId, quizId]);

  function handleStart(qs, o, qId) {
    setQuestions(qs);
    setOpts(o);
    setCurrentQuizId(qId || null);
    setScreen("quiz");
  }
  function handleFinish(data) {
    setResults(data);
    setScreen("results");
  }
  function handleRetry() {
    if (!results) return;
    setQuestions(results.questions || []);
    setOpts(results.opts || null);
    setCurrentQuizId(results.quizId || null);
    setScreen("quiz");
  }
  function handleHistory() {
    if (from === "quiz-history") {
      router.push("/quiz-history");
      return;
    }
    setScreen("history");
  }
  function handleBackNavigation() {
    if (from === "quiz-history") {
      router.push("/quiz-history");
      return;
    }
    router.back();
  }

  if (restoringSummary || loadingSavedQuiz) {
    return <SummaryLoadingScreen />;
  }

  return (
    <>
      <Head>
        <title>Quiz — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      {screen === "config" &&
        !(router.isReady && quizId && view !== "summary") && (
          <ConfigScreen
            noteId={noteId}
            onStart={handleStart}
            isExistingQuiz={!!quizId}
            existingQuizId={quizId}
            onBack={handleBackNavigation}
          />
        )}
      {restoreError && screen === "config" && (
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 100,
            background: "rgba(255,107,107,0.12)",
            border: "1px solid rgba(255,107,107,0.3)",
            color: "#ffb3b3",
            padding: "12px 14px",
            borderRadius: 12,
            fontFamily: "Sora, sans-serif",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {restoreError}
        </div>
      )}
      {screen === "quiz" && (
        <QuizScreen
          questions={questions}
          opts={opts}
          quizId={currentQuizId}
          noteId={noteId}
          onFinish={handleFinish}
          onBack={handleBackNavigation}
        />
      )}
      {screen === "results" && (
        <ResultsDashboard
          data={results}
          noteId={noteId}
          onRetry={handleRetry}
          onHome={handleHistory}
          onBack={handleBackNavigation}
        />
      )}
      {screen === "history" && (
        <HistoryScreen onBack={() => setScreen("results")} />
      )}
    </>
  );
}

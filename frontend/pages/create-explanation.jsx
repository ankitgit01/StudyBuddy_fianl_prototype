import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { createPromptNote } from "../services/api";
import { addCustomSubject, getAllSubjects } from "../services/subjects";

export default function CreateExplanationPage() {
  const router = useRouter();
  const addInputRef = useRef(null);
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("hi-en");
  const [customPrompt, setCustomPrompt] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [addError, setAddError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSubjects(getAllSubjects());
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (typeof router.query.subject === "string")
      setSubject(router.query.subject);
    if (typeof router.query.prompt === "string")
      setCustomPrompt(router.query.prompt);
  }, [router.isReady, router.query.prompt, router.query.subject]);

  const selectedMeta = useMemo(
    () => subjects.find((item) => item.name === subject),
    [subject, subjects],
  );

  async function handleSubmit() {
    if (!subject || !customPrompt.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      const signals = {}; // Your existing signals logic
      const result = await createPromptNote(
        subject || "General",
        language,
        customPrompt.trim(),
        signals,
      );
      if (result.status === "processed") {
        router.push(`/explanation?noteId=${result.note_id}`);
      } else {
        router.push(`/processing?noteId=${result.note_id}`);
      }
    } catch (err) {
      setError(err.message || "Synthesis failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="synthesis-root">
      <Head>
        <title>Synthesis Engine | GYAANI AI</title>
      </Head>

      {/* Ambient background layers */}
      <div className="nebula nebula-a" />
      <div className="nebula nebula-b" />
      <div className="star-field" />

      <header className="hdr">
        <button className="back-btn" onClick={() => router.back()}>
          ←
        </button>
        <div className="hdr-center">
          <span className="hdr-kicker">NEURAL SYNTHESIS ENGINE</span>
          <h2 className="hdr-title">Create AI Explanation</h2>
        </div>
        <div className="engine-status">
          <span className="status-dot" /> LIVE
        </div>
      </header>

      <main className="body">
        {error && <div className="error-card">⚠️ {error}</div>}

        <div className="dashboard-grid">
          {/* Left Column: Intelligence Config */}
          <div className="config-panel">
            <section className="glass-card">
              <div className="card-head">
                <span className="step">01</span>
                <h3>Subjects</h3>
              </div>

              <div className="subject-grid">
                {subjects.map((item) => (
                  <button
                    key={item.name}
                    className={`subject-pill ${subject === item.name ? "active" : ""}`}
                    onClick={() => setSubject(item.name)}
                  >
                    <span className="pill-icon">{item.icon}</span>
                    <span className="pill-label">{item.name}</span>
                  </button>
                ))}
                <button
                  className="subject-pill add-btn"
                  onClick={() => setShowAddInput(true)}
                >
                  <span>＋</span> Add Subject
                </button>
              </div>
            </section>

            <section className="glass-card">
              <div className="card-head">
                <span className="step">02</span>
                <h3>Output Language</h3>
              </div>
              <p className="card-sub">
                Select from the 6 supported neural languages
              </p>
              <div className="lang-grid">
                {[
                  { code: "hi-en", label: "हि + EN" },
                  { code: "en", label: "English" },
                  { code: "hi", label: "हिंदी" },
                  { code: "ta", label: "தமிழ்" },
                  { code: "te", label: "తెలుగు" },
                  { code: "bn", label: "বাংলা" },
                ].map((item) => (
                  <button
                    key={item.code}
                    className={`lang-chip ${language === item.code ? "on" : ""}`}
                    onClick={() => setLanguage(item.code)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Prompt Engine */}
          <div className="prompt-panel">
            <section className="glass-card prompt-card">
              <div className="card-head">
                <span className="step">03</span>
                <h3>Cognitive Prompt</h3>
                <span className="char-counter">{customPrompt.length}/900</span>
              </div>

              <div className="input-wrap">
                <textarea
                  className="neural-input"
                  placeholder={`Explain ${subject || "your topic"} with high-fidelity intuition...`}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  maxLength={900}
                />
                <div
                  className="glow-bar"
                  style={{ width: `${(customPrompt.length / 900) * 100}%` }}
                />
              </div>

              <div className="tag-row">
                {[
                  "Explain intuition",
                  "Step-by-step",
                  "Common mistakes",
                  "Exam summary",
                ].map((t) => (
                  <button
                    key={t}
                    className="tag-btn"
                    onClick={() =>
                      setCustomPrompt((p) => (p ? `${p}\n${t}` : t))
                    }
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </section>

            <button
              className="submit-btn"
              onClick={handleSubmit}
              disabled={submitting || !subject || !customPrompt.trim()}
            >
              {submitting ? (
                <div className="loader-inline">
                  <div className="spin-wrap">
                    <div className="spin-o" />
                    <div className="spin-i" />
                  </div>
                  Synthesizing Neural Guide...
                </div>
              ) : (
                <>🚀 BEGIN SYNTHESIS</>
              )}
            </button>
          </div>
        </div>
      </main>

      <style jsx>{`
        .synthesis-root {
          min-height: 100vh;
          background: #05070f;
          color: #f8fbff;
          font-family: "Sora", sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        .nebula {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .nebula-a {
          background: radial-gradient(
            ellipse 80% 50% at 20% 30%,
            rgba(108, 99, 255, 0.06),
            transparent 55%
          );
        }
        .nebula-b {
          background: radial-gradient(
            ellipse 60% 40% at 80% 70%,
            rgba(67, 233, 123, 0.05),
            transparent 50%
          );
        }

        .hdr {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 15px 25px;
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(5, 8, 18, 0.85);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .back-btn {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: #fff;
          cursor: pointer;
        }
        .hdr-kicker {
          font-size: 9px;
          letter-spacing: 2px;
          color: #6c63ff;
          font-weight: 800;
          display: block;
        }
        .hdr-title {
          font-size: 16px;
          font-weight: 800;
          margin: 0;
        }

        .engine-status {
          margin-left: auto;
          font-size: 10px;
          font-weight: 800;
          color: #43e97b;
          padding: 6px 12px;
          background: rgba(67, 233, 123, 0.1);
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          background: #43e97b;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .body {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
          position: relative;
          z-index: 1;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 20px;
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 28px;
          padding: 25px;
          margin-bottom: 20px;
          transition: 0.3s;
        }
        .card-head {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        .step {
          font-size: 10px;
          font-weight: 800;
          color: #6c63ff;
          background: rgba(108, 99, 255, 0.1);
          padding: 4px 8px;
          border-radius: 8px;
        }
        .glass-card h3 {
          font-size: 17px;
          font-weight: 800;
          margin: 0;
        }
        .card-sub {
          font-size: 11px;
          color: #62739f;
          margin-bottom: 20px;
        }

        .subject-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
          gap: 10px;
        }
        .subject-pill {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 12px;
          border-radius: 16px;
          cursor: pointer;
          color: #fff;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: 0.2s;
          font-size: 13px;
        }
        .subject-pill.active {
          background: #fff;
          color: #000;
          border-color: #fff;
          transform: translateY(-3px);
        }
        .subject-pill:hover:not(.active) {
          border-color: #6c63ff;
          background: rgba(108, 99, 255, 0.05);
        }

        .lang-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .lang-chip {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 12px;
          border-radius: 14px;
          cursor: pointer;
          color: #8e98bc;
          font-weight: 800;
          font-size: 12px;
          transition: 0.2s;
        }
        .lang-chip.on {
          background: #6c63ff;
          color: #fff;
          border-color: #6c63ff;
          box-shadow: 0 0 15px rgba(108, 99, 255, 0.3);
        }

        .input-wrap {
          position: relative;
          background: #080d15;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }
        .neural-input {
          width: 100%;
          min-height: 320px;
          background: transparent;
          border: none;
          padding: 22px;
          color: #fff;
          font-family: inherit;
          font-size: 15px;
          outline: none;
          resize: none;
          line-height: 1.6;
        }
        .glow-bar {
          position: absolute;
          bottom: 0;
          height: 3px;
          background: #6c63ff;
          box-shadow: 0 0 10px #6c63ff;
          transition: width 0.3s ease;
        }

        .tag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 15px;
        }
        .tag-btn {
          background: rgba(108, 99, 255, 0.05);
          border: 1px solid rgba(108, 99, 255, 0.2);
          color: #9ea9ff;
          padding: 7px 14px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .submit-btn {
          width: 100%;
          padding: 22px;
          border-radius: 24px;
          font-size: 15px;
          font-weight: 900;
          background: linear-gradient(135deg, #6c63ff, #4facfe);
          border: none;
          color: #fff;
          cursor: pointer;
          box-shadow: 0 15px 35px rgba(79, 172, 254, 0.2);
          transition: 0.3s;
          letter-spacing: 1px;
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-4px);
          box-shadow: 0 20px 45px rgba(79, 172, 254, 0.4);
        }
        .submit-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .loader-inline {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .spin-wrap {
          position: relative;
          width: 22px;
          height: 22px;
        }
        .spin-o {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }
        .spin-i {
          position: absolute;
          inset: 4px;
          border-radius: 50%;
          border: 1.5px solid rgba(255, 255, 255, 0.1);
          border-bottom-color: #fff;
          animation: spin 1.2s linear infinite reverse;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }

        @media (max-width: 900px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

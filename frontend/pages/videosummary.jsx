// frontend/pages/videosummary.jsx
// GYAANI AI — YouTube Video Summariser
// UI redesigned to match Constellation design language

import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import Sidebar from "../components/Sidebar";
import { useRouter } from "next/router";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("token") || ""
    : "";
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be"))
      return u.pathname.slice(1).split("?")[0];
    return u.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

function isValidYTUrl(url) {
  return url.includes("youtube.com/watch") || url.includes("youtu.be/");
}

function diffColor(d) {
  if (d === "easy")
    return {
      bg: "rgba(67,233,123,0.08)",
      border: "rgba(67,233,123,0.22)",
      text: "#43E97B",
    };
  if (d === "medium")
    return {
      bg: "rgba(255,179,0,0.08)",
      border: "rgba(255,179,0,0.22)",
      text: "#FFB300",
    };
  return {
    bg: "rgba(255,80,80,0.08)",
    border: "rgba(255,80,80,0.22)",
    text: "#FF5050",
  };
}

// ── MOCK DATA ──────────────────────────────────────────────
const USE_MOCK = false;
const MOCK = {
  video_id: "xxxxxxxxxxx",
  title: "Newton's Laws of Motion — Complete Chapter | Class 11 Physics",
  channel: "Physics Wallah - Alakh Pandey",
  thumbnail: "",
  transcript_method: "assemblyai",
  detected_language: "hi-en",
  subject_tags: ["Physics", "Class 11", "JEE", "NEET", "Mechanics"],
  overall_summary:
    "This lecture is a complete walkthrough of Newton's three laws of motion, designed for Class 11 students preparing for JEE and NEET. The instructor builds intuition from everyday observations before introducing mathematical formulations, making abstract concepts concrete and memorable.\n\nThe session covers the law of inertia in depth — explaining why objects resist changes to their state of motion and how mass is the measure of this resistance. This is followed by a rigorous treatment of F = ma, including dimensional analysis and worked problems involving multiple forces on a single body.\n\nThe third law is explained with special emphasis on the common misconception that action-reaction forces cancel each other. The instructor uses rocket propulsion, swimming, and gun recoil as examples to cement the principle. The lecture closes with exam-specific tips and the most commonly tested problem types.",
  key_takeaways: [
    "Inertia is not a force — it is the property of matter that resists change in motion.",
    "F = ma holds only in inertial (non-accelerating) reference frames.",
    "Action and reaction forces act on different objects — they never cancel each other.",
    "The SI unit of force is Newton (N) = kg·m/s².",
    "Impulse = Force × time = Change in momentum (J = FΔt = Δp).",
    "In free-body diagrams, always isolate one object and draw all forces on it alone.",
  ],
  topics: [
    {
      id: 1,
      title: "Introduction & Historical Context",
      summary:
        "The instructor sets the stage by explaining why Newton's laws remain the foundation of classical mechanics.",
      key_points: [
        "Aristotle wrongly believed constant force is needed.",
        "Galileo's inclined plane showed objects keep moving.",
        "Newton unified observations into three laws.",
      ],
      key_formula: null,
      difficulty: "easy",
      duration_hint: "0–8 min",
    },
    {
      id: 2,
      title: "First Law — Law of Inertia",
      summary:
        "The first law is explained both qualitatively and quantitatively with real-world examples.",
      key_points: [
        "Object stays at rest or uniform motion unless net force acts.",
        "Mass is the quantitative measure of inertia.",
        "Net force = 0 means acceleration = 0.",
      ],
      key_formula: "ΣF = 0  ⟹  a = 0",
      difficulty: "easy",
      duration_hint: "8–28 min",
    },
    {
      id: 3,
      title: "Second Law — F = ma",
      summary:
        "The second law is derived from momentum change and demonstrated with numerical problems.",
      key_points: [
        "More force → more acceleration; more mass → less acceleration.",
        "Force and acceleration are always in the same direction.",
        "Net force is the vector sum of all individual forces.",
      ],
      key_formula: "F = ma = dp/dt",
      difficulty: "medium",
      duration_hint: "28–54 min",
    },
    {
      id: 4,
      title: "Third Law — Action & Reaction",
      summary:
        "The third law is the most commonly misunderstood. Action-reaction pairs act on different objects.",
      key_points: [
        "Every action has an equal and opposite reaction.",
        "Action-reaction pairs act on DIFFERENT objects.",
        "Rocket: exhaust down (action) → rocket up (reaction).",
      ],
      key_formula: "F₁₂ = −F₂₁",
      difficulty: "medium",
      duration_hint: "54–76 min",
    },
    {
      id: 5,
      title: "Impulse & Momentum",
      summary:
        "This section bridges the second and third laws through the impulse-momentum theorem.",
      key_points: [
        "Impulse J = F × Δt equals change in momentum Δp.",
        "Longer collision time → smaller average force.",
        "Airbags increase collision time, reducing injury.",
      ],
      key_formula: "J = FΔt = Δp = m(v − u)",
      difficulty: "medium",
      duration_hint: "76–92 min",
    },
    {
      id: 6,
      title: "Exam Tips & Common Mistakes",
      summary:
        "Rapid-fire exam preparation with the five most common Newton's law mistakes.",
      key_points: [
        "Always draw FBD before writing any equation.",
        "Pseudo-force only in accelerating reference frames.",
        "Normal force ≠ weight on accelerating surfaces.",
      ],
      key_formula: null,
      difficulty: "easy",
      duration_hint: "92–102 min",
    },
  ],
};

async function fetchSummary(url) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 3500));
    return { ...MOCK, video_id: extractVideoId(url) || MOCK.video_id };
  }
  const res = await fetch(`${BASE_URL}/api/video-summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.detail || e.message || `Error ${res.status}`);
  }
  return res.json();
}

const STAGES = [
  { icon: "🔗", label: "Validating URL", desc: "Checking YouTube link format" },
  {
    icon: "📡",
    label: "Fetching video info",
    desc: "Getting title, channel & metadata",
  },
  {
    icon: "🎙️",
    label: "Extracting transcript",
    desc: "Captions or AssemblyAI speech-to-text",
  },
  {
    icon: "🧹",
    label: "Cleaning transcript",
    desc: "Removing filler words and noise",
  },
  {
    icon: "🧠",
    label: "AI summarisation",
    desc: "Claude analysing content structure",
  },
  {
    icon: "📚",
    label: "Building topic breakdown",
    desc: "Splitting into topics with key points",
  },
  {
    icon: "✨",
    label: "Formatting summary",
    desc: "Structuring for easy reading",
  },
];

// shared constellation-style CSS base
const commonStyles = `
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0}
  .screen{
    min-height:100vh;width:100%;color:#f8fbff;font-family:'Sora',sans-serif;
    background:
      radial-gradient(circle at 15% 10%, rgba(91,208,255,0.10), transparent 24%),
      radial-gradient(circle at 85% 16%, rgba(199,155,255,0.09), transparent 18%),
      radial-gradient(circle at 50% 80%, rgba(255,123,172,0.06), transparent 28%),
      linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
  }
  .hdr{
    display:flex;align-items:center;gap:12px;padding:14px 16px;position:sticky;top:0;z-index:40;width:100%;
    background:rgba(5,8,18,0.82);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.06)
  }
  .back-btn{
    width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);
    color:#e7edff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;
    transition:background 0.15s,border-color 0.15s;
  }
  .back-btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.18)}
  .hdr-title{display:block;font-size:16px;font-weight:800}
  .hdr-sub{display:block;font-size:12px;color:#8e98bc;margin-top:2px}
  .body{max-width:1120px;width:100%;margin:0 auto;padding:28px 16px 40px}
  .section-label{
    display:block;margin-bottom:14px;font-size:10px;font-weight:800;letter-spacing:0.28em;text-transform:uppercase;color:#62739f
  }
  .eyebrow{font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#7dd3fc;margin-bottom:10px}
`;

// ════════════════════════════════════════════════════════════
// SCREEN 1 — URL INPUT
// ════════════════════════════════════════════════════════════
function InputScreen({ onSubmit, recentVideos = [], historyLoading = false }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const videoId = extractVideoId(url);
  const isValid = isValidYTUrl(url);
  const thumbUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : "";

  function handleSubmit() {
    if (!url.trim()) {
      setError("Paste a YouTube link first.");
      return;
    }
    if (!isValid) {
      setError("Please paste a valid YouTube URL (youtube.com or youtu.be).");
      return;
    }
    setError("");
    onSubmit(url.trim());
  }

  return (
    <div className="screen">
      <header className="hdr">
        <div>
          <span className="hdr-title">Video Summariser</span>
          <span className="hdr-sub">Paste · Summarise · Study</span>
        </div>
      </header>

      <div className="body">
        {/* Hero */}
        <section className="hero-card">
          <p className="eyebrow">AI-Powered Study Tool</p>
          <h1>Turn any lecture into structured notes.</h1>
          <p>
            Paste a YouTube link — GYAANI extracts the transcript and gives you
            a structured study summary
          </p>
          <div className="hero-pills">
            {[
              "📚 Topic breakdown",
              "⚡ Key points",
              "𝑓 Formulas extracted",
            ].map((b) => (
              <span key={b} className="hero-pill">
                {b}
              </span>
            ))}
          </div>
        </section>

        {/* Input Card */}
        <p className="section-label">YouTube URL</p>
        <div className="input-card">
          <div
            className={`url-wrap ${isValid ? "url-valid" : ""} ${error ? "url-err" : ""}`}
          >
            <div className="yt-icon">▶</div>
            <input
              ref={inputRef}
              className="url-input"
              placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            {url && (
              <button
                className="url-clear"
                onClick={() => {
                  setUrl("");
                  setError("");
                }}
              >
                ×
              </button>
            )}
          </div>
          {error && <p className="err-msg">⚠ {error}</p>}

          {thumbUrl && isValid && (
            <div className="thumb-preview">
              <img src={thumbUrl} alt="" className="thumb-img" />
              <div className="thumb-overlay">
                <div className="thumb-play">▶</div>
              </div>
              <div className="thumb-ok">✓ Valid YouTube link</div>
            </div>
          )}

          <button
            className={`go-btn ${isValid ? "go-ready" : ""}`}
            onClick={handleSubmit}
            disabled={!url.trim()}
          >
            {isValid ? "🧠 Summarise This Video" : "Paste a YouTube URL above"}
          </button>
          <p className="hint-text">
            Works with any public YouTube video — lectures, documentaries,
            tutorials.
          </p>
        </div>

        {/* Recent */}
        {(historyLoading || recentVideos.length > 0) && (
          <>
            <p className="section-label" style={{ marginTop: 32 }}>
              Recent Summaries
            </p>
            {historyLoading ? (
              <div className="recent-list">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="recent-card"
                    style={{ opacity: 0.4, pointerEvents: "none" }}
                  >
                    <div
                      style={{
                        width: 72,
                        height: 42,
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.06)",
                        flexShrink: 0,
                      }}
                    />
                    <div className="recent-info">
                      <div
                        style={{
                          height: 12,
                          width: "70%",
                          borderRadius: 6,
                          background: "rgba(255,255,255,0.06)",
                          marginBottom: 6,
                        }}
                      />
                      <div
                        style={{
                          height: 10,
                          width: "40%",
                          borderRadius: 6,
                          background: "rgba(255,255,255,0.04)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="recent-list">
                {recentVideos.map((v, i) => (
                  <div
                    key={i}
                    className="recent-card"
                    onClick={() => onSubmit(v.url, v)}
                  >
                    {v.thumbnail && (
                      <img src={v.thumbnail} alt="" className="recent-thumb" />
                    )}
                    <div className="recent-info">
                      <p className="recent-title">
                        {v.title || "Untitled Video"}
                      </p>
                      <p className="recent-ch">{v.channel || ""}</p>
                    </div>
                    <span className="recent-arr">›</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        ${commonStyles}
        .body {
          max-width: 680px;
          width: 100%;
          margin: 0 auto;
          padding: 32px 20px 60px;
        }

        /* Hero */
        .hero-card {
          position: relative;
          overflow: hidden;
          padding: 28px 28px 26px;
          border-radius: 28px;
          margin-bottom: 28px;
          background:
            radial-gradient(
              circle at top left,
              rgba(91, 208, 255, 0.14),
              transparent 34%
            ),
            radial-gradient(
              circle at bottom right,
              rgba(255, 123, 172, 0.14),
              transparent 30%
            ),
            linear-gradient(
              180deg,
              rgba(17, 22, 45, 0.96),
              rgba(7, 10, 23, 0.98)
            );
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.32);
        }
        .hero-card h1 {
          font-size: 28px;
          line-height: 1.1;
          margin-bottom: 12px;
          max-width: 18ch;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .hero-card p {
          font-size: 13px;
          line-height: 1.75;
          color: #9ea8c7;
          max-width: 58ch;
          margin-bottom: 16px;
        }
        .hero-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .hero-pill {
          font-size: 11px;
          font-weight: 700;
          padding: 5px 12px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #6a7a9f;
          transition: all 0.15s;
        }

        /* Input card */
        .input-card {
          position: relative;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 8px;
        }
        .input-card::before {
          content: "";
          position: absolute;
          top: 0;
          right: 0;
          width: 200px;
          height: 200px;
          background: radial-gradient(
            circle at 100% 0%,
            rgba(91, 208, 255, 0.07),
            transparent 60%
          );
          pointer-events: none;
        }

        .url-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 13px 16px;
          transition:
            border-color 0.2s,
            box-shadow 0.2s;
        }
        .url-wrap:focus-within {
          border-color: rgba(91, 208, 255, 0.4);
          box-shadow: 0 0 0 3px rgba(91, 208, 255, 0.07);
        }
        .url-valid {
          border-color: rgba(67, 233, 123, 0.35) !important;
          box-shadow: 0 0 0 3px rgba(67, 233, 123, 0.06) !important;
        }
        .url-err {
          border-color: rgba(255, 80, 80, 0.4) !important;
        }
        .yt-icon {
          width: 22px;
          height: 16px;
          background: #ff0000;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 9px;
          flex-shrink: 0;
        }
        .url-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: #e0e0f0;
          font-family: "Sora", sans-serif;
          font-size: 13px;
        }
        .url-input::placeholder {
          color: #7e7eab;
        }
        .url-clear {
          background: none;
          border: none;
          color: #444;
          font-size: 18px;
          cursor: pointer;
          flex-shrink: 0;
          transition: color 0.15s;
        }
        .url-clear:hover {
          color: #888;
        }
        .err-msg {
          font-size: 12px;
          color: #ff5050;
          font-weight: 600;
        }

        .thumb-preview {
          position: relative;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(67, 233, 123, 0.2);
          aspect-ratio: 16/9;
          animation: fadeUp 0.3s ease;
        }
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: scale(0.98);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .thumb-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .thumb-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.22);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .thumb-play {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          color: #111;
          padding-left: 3px;
        }
        .thumb-ok {
          position: absolute;
          bottom: 10px;
          left: 10px;
          background: rgba(67, 233, 123, 0.92);
          color: #001a0a;
          font-size: 11px;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 20px;
        }

        .go-btn {
          width: 100%;
          padding: 16px;
          border-radius: 14px;
          border: none;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #2a2a40;
          font-size: 15px;
          font-weight: 800;
          cursor: not-allowed;
          font-family: "Sora", sans-serif;
          transition: all 0.2s;
        }
        .go-ready {
          background: linear-gradient(135deg, #5bd0ff, #c79bff) !important;
          border-color: transparent !important;
          color: white !important;
          cursor: pointer !important;
          box-shadow: 0 6px 28px rgba(91, 208, 255, 0.28);
        }
        .go-ready:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 36px rgba(91, 208, 255, 0.38);
        }
        .hint-text {
          font-size: 11px;
          color: #7e7eab;
          text-align: center;
          line-height: 1.6;
        }

        /* Recent */
        .recent-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .recent-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 12px 16px;
          cursor: pointer;
          transition:
            border-color 0.2s,
            background 0.2s;
        }
        .recent-card:hover {
          border-color: rgba(91, 208, 255, 0.25);
          background: rgba(91, 208, 255, 0.04);
        }
        .recent-thumb {
          width: 72px;
          height: 42px;
          border-radius: 8px;
          object-fit: cover;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .recent-info {
          flex: 1;
          min-width: 0;
        }
        .recent-title {
          font-size: 12px;
          font-weight: 700;
          color: #c0c0d8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .recent-ch {
          font-size: 11px;
          color: #444;
          margin-top: 3px;
        }
        .recent-arr {
          font-size: 20px;
          color: #7e7eab;
          flex-shrink: 0;
        }

        /* Related Videos — polished grid */
        .related-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 14px;
          width: 100%;
        }
        .rv-card {
          display: flex;
          flex-direction: column;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          overflow: hidden;
          text-decoration: none;
          color: inherit;
          transition:
            transform 0.2s,
            border-color 0.2s,
            box-shadow 0.2s;
        }
        .rv-card:hover {
          transform: translateY(-4px);
          border-color: rgba(91, 208, 255, 0.4);
          box-shadow:
            0 12px 32px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(91, 208, 255, 0.1);
        }
        .rv-thumb-wrap {
          position: relative;
          width: 100%;
          padding-bottom: 56.25%;
          overflow: hidden;
          background: #0a0a14;
          flex-shrink: 0;
        }
        .rv-thumb {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.35s ease;
        }
        .rv-card:hover .rv-thumb {
          transform: scale(1.06);
        }
        .rv-play-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0);
          transition: background 0.2s;
        }
        .rv-card:hover .rv-play-overlay {
          background: rgba(0, 0, 0, 0.45);
        }
        .rv-play-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.92);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          color: #111;
          padding-left: 3px;
          opacity: 0;
          transform: scale(0.75);
          transition:
            opacity 0.2s,
            transform 0.2s;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
        }
        .rv-card:hover .rv-play-btn {
          opacity: 1;
          transform: scale(1);
        }
        .rv-duration-badge {
          position: absolute;
          bottom: 8px;
          right: 8px;
          background: rgba(5, 8, 18, 0.82);
          backdrop-filter: blur(6px);
          color: #5bd0ff;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 8px;
          border: 1px solid rgba(91, 208, 255, 0.2);
          letter-spacing: 0.3px;
        }
        .rv-info {
          padding: 12px 14px 14px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          flex: 1;
        }
        .rv-title {
          font-size: 13px;
          font-weight: 700;
          color: #dde0f0;
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .rv-channel {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #7a80a0;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .rv-channel-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #5bd0ff;
          flex-shrink: 0;
          opacity: 0.7;
        }
        @media (max-width: 600px) {
          .related-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 600px) {
          .hero-card h1 {
            font-size: 22px;
          }
        }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SCREEN 2 — PROCESSING
// ════════════════════════════════════════════════════════════
function ProcessingScreen({ videoId }) {
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed((p) => p + 1);
      setStage((p) => (p < STAGES.length - 1 ? p + 1 : p));
    }, 550);
    return () => clearInterval(t);
  }, []);

  const progress = Math.round((stage / (STAGES.length - 1)) * 100);
  const thumbUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : "";

  return (
    <div className="screen proc-screen">
      <div className="proc-center">
        <div className="orb-wrap">
          <div className="orb-ring r1" />
          <div className="orb-ring r2" />
          <div className="orb-ring r3" />
          <span className="orb-em">🧠</span>
        </div>

        <p className="eyebrow" style={{ textAlign: "center" }}>
          AI Pipeline Running
        </p>
        <h2 className="proc-title">Summarising Video</h2>
        <p className="proc-sub">{elapsed}s elapsed</p>

        <div className="bar-wrap">
          <div className="bar">
            <div className="bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="bar-pct">{progress}%</span>
        </div>

        {thumbUrl && (
          <div className="proc-thumb-wrap">
            <img src={thumbUrl} alt="" className="proc-thumb" />
            <div className="scan-line" />
            <div className="proc-thumb-overlay" />
          </div>
        )}

        <div className="stages">
          {STAGES.map((s, i) => {
            const done = i < stage,
              active = i === stage;
            return (
              <div
                key={i}
                className={`stage ${done ? "s-done" : active ? "s-active" : "s-pend"}`}
              >
                <div
                  className={`sdot ${done ? "sd-done" : active ? "sd-act" : "sd-pend"}`}
                >
                  {done ? "✓" : active ? <span className="spulse" /> : i + 1}
                </div>
                <div className="sbody">
                  <div className="shead">
                    <span style={{ fontSize: 14 }}>{s.icon}</span>
                    <span className="slabel">{s.label}</span>
                  </div>
                  {(done || active) && <p className="sdesc">{s.desc}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        ${commonStyles}
        .proc-screen {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
        }
        .proc-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          width: 100%;
          max-width: 460px;
          margin: 0 auto;
        }
        .orb-wrap {
          position: relative;
          width: 100px;
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }
        .orb-em {
          font-size: 42px;
          position: relative;
          z-index: 2;
        }
        .orb-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(91, 208, 255, 0.28);
          animation: ripple 2.4s ease-out infinite;
        }
        .r1 {
          width: 64px;
          height: 64px;
          animation-delay: 0s;
        }
        .r2 {
          width: 84px;
          height: 84px;
          animation-delay: 0.45s;
        }
        .r3 {
          width: 104px;
          height: 104px;
          animation-delay: 0.9s;
        }
        @keyframes ripple {
          0% {
            transform: scale(0.8);
            opacity: 1;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
        .proc-title {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.4px;
          margin: 0;
        }
        .proc-sub {
          font-size: 12px;
          color: #444;
          font-family: "JetBrains Mono", monospace;
          margin: 0;
        }

        .bar-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
        }
        .bar {
          flex: 1;
          height: 4px;
          background: rgba(255, 255, 255, 0.07);
          border-radius: 3px;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #5bd0ff, #c79bff);
          border-radius: 3px;
          transition: width 0.55s ease;
        }
        .bar-pct {
          font-size: 11px;
          font-weight: 700;
          color: #555;
          font-family: "JetBrains Mono", monospace;
          width: 34px;
        }

        .proc-thumb-wrap {
          position: relative;
          width: 100%;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(91, 208, 255, 0.18);
          aspect-ratio: 16/9;
        }
        .proc-thumb {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .proc-thumb-overlay {
          position: absolute;
          inset: 0;
          background: rgba(5, 8, 18, 0.55);
        }
        .scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #5bd0ff, transparent);
          animation: scan 1.8s ease-in-out infinite;
          z-index: 2;
        }
        @keyframes scan {
          0% {
            top: 0;
          }
          100% {
            top: calc(100% - 2px);
          }
        }

        .stages {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stage {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 14px;
          transition: all 0.3s ease;
        }
        .s-done {
          background: rgba(67, 233, 123, 0.04);
        }
        .s-active {
          background: rgba(91, 208, 255, 0.07);
          border: 1px solid rgba(91, 208, 255, 0.2);
        }
        .s-pend {
          opacity: 0.25;
        }
        .sdot {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .sd-done {
          background: rgba(67, 233, 123, 0.14);
          color: #43e97b;
          border: 1px solid rgba(67, 233, 123, 0.3);
        }
        .sd-act {
          background: rgba(91, 208, 255, 0.15);
          color: #5bd0ff;
          border: 1px solid rgba(91, 208, 255, 0.5);
        }
        .sd-pend {
          background: rgba(255, 255, 255, 0.04);
          color: #333;
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 10px;
        }
        .spulse {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #5bd0ff;
          animation: blink 0.7s ease-in-out infinite alternate;
          display: block;
        }
        @keyframes blink {
          from {
            transform: scale(0.7);
            opacity: 0.5;
          }
          to {
            transform: scale(1.2);
            opacity: 1;
          }
        }
        .sbody {
          flex: 1;
        }
        .shead {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 3px;
        }
        .slabel {
          font-size: 13px;
          font-weight: 700;
          color: #ddd;
        }
        .sdesc {
          font-size: 11px;
          color: #555;
          line-height: 1.4;
        }
        .stik {
          font-size: 10px;
          color: #43e97b;
          font-family: "JetBrains Mono", monospace;
          white-space: nowrap;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SCREEN 3 — SUMMARY RESULT
// ════════════════════════════════════════════════════════════
function SummaryScreen({ data, onBack }) {
  const [open, setOpen] = useState({ 0: true });
  const [copied, setCopied] = useState(false);

  function toggle(i) {
    setOpen((p) => ({ ...p, [i]: !p[i] }));
  }

  function copyAll() {
    const lines = [
      `# ${data.title}`,
      `Channel: ${data.channel}`,
      ``,
      `## Summary`,
      data.overall_summary,
      ``,
      `## Key Takeaways`,
      ...data.key_takeaways.map((t, i) => `${i + 1}. ${t}`),
      ``,
      `## Topics`,
      ...data.topics.map((t) =>
        [
          `### ${t.title}`,
          t.summary,
          t.key_formula ? `Formula: ${t.key_formula}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ].join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const methodLabel =
    data.transcript_method === "assemblyai"
      ? "🎙️ Transcribed by AssemblyAI"
      : data.transcript_method === "captions"
        ? "📄 YouTube captions used"
        : "🎙️ AI transcribed";

  return (
    <div className="screen res-screen">
      {/* Sticky header */}
      <header className="hdr">
        <button className="back-btn" onClick={onBack}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <span className="hdr-title">Video Summary</span>
          <span className="hdr-sub">
            {data.title?.slice(0, 48)}
            {data.title?.length > 48 ? "…" : ""}
          </span>
        </div>
        <button className="copy-btn" onClick={copyAll}>
          {copied ? "✓ Copied" : "📋 Copy"}
        </button>
      </header>

      <div className="res-body">
        {/* ── Video meta card ── */}
        <div className="meta-card">
          <div className="meta-card__glow" />
          {data.thumbnail && (
            <img src={data.thumbnail} alt="" className="meta-thumb" />
          )}
          <div className="meta-info">
            <div className="meta-tags">
              {data.subject_tags?.map((t) => (
                <span key={t} className="meta-tag">
                  {t}
                </span>
              ))}
            </div>
            <h1 className="meta-title">{data.title}</h1>
            <p className="meta-channel">📺 {data.channel}</p>
            <div className="meta-pills">
              <span className="mpill method">{methodLabel}</span>
              <span className="mpill">{data.topics?.length} topics</span>
              <span className="mpill">
                🌐{" "}
                {data.detected_language === "hi-en"
                  ? "Hindi + English"
                  : data.detected_language || "English"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="stats-strip">
          {[
            { label: "Topics", value: data.topics?.length ?? 0 },
            { label: "Key Takeaways", value: data.key_takeaways?.length ?? 0 },
            {
              label: "Formulas",
              value: data.topics?.filter((t) => t.key_formula).length ?? 0,
            },
            {
              label: "Difficulty Levels",
              value: [...new Set(data.topics?.map((t) => t.difficulty) ?? [])]
                .length,
            },
          ].map((s) => (
            <div key={s.label} className="stat-item">
              <span className="stat-val">{s.value}</span>
              <span className="stat-lbl">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Overall Summary ── */}
        <section className="sec-block">
          <div className="sec-hd">
            <span style={{ fontSize: 18 }}>📝</span>
            <h2 className="sec-title">Overall Summary</h2>
          </div>
          <div className="sum-wrap">
            {/* Add (data.overall_summary || "") to ensure split never runs on undefined */}
            {(data.overall_summary || "").split("\n\n").map((p, i) => (
              <p key={i} className="sum-para">
                {p}
              </p>
            ))}
          </div>
        </section>

        {/* ── Key Takeaways ── */}
        <section className="sec-block">
          <div className="sec-hd">
            <span style={{ fontSize: 18 }}>⚡</span>
            <h2 className="sec-title">Key Takeaways</h2>
            <span className="sec-count">
              {data.key_takeaways?.length ?? 0} points
            </span>
          </div>
          <div className="tklist">
            {(data.key_takeaways ?? []).map((pt, i) => (
              <div key={i} className="tkrow">
                <div className="tknum">{String(i + 1).padStart(2, "0")}</div>
                <p className="tktext">{pt}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Topic Breakdown ── */}
        <section className="sec-block">
          <div className="sec-hd">
            <span style={{ fontSize: 18 }}>📚</span>
            <h2 className="sec-title">Topic-by-Topic Breakdown</h2>
            <span className="sec-count">{data.topics?.length ?? 0} topics</span>
          </div>
          <div className="topics-list">
            {(data.topics ?? []).map((topic, i) => {
              const isOpen = open[i];
              const dc = diffColor(topic.difficulty);
              return (
                <div
                  key={topic.id}
                  className={`tcard ${isOpen ? "tcard-open" : ""}`}
                >
                  <div className="thead" onClick={() => toggle(i)}>
                    <div className={`tnum ${isOpen ? "tnum-open" : ""}`}>
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="thead-info">
                      <div className="thead-row">
                        <span className="ttitle">{topic.title}</span>
                        {topic.duration_hint && (
                          <span className="tdur">⏱ {topic.duration_hint}</span>
                        )}
                      </div>
                      <div className="thead-meta">
                        <span
                          className="tdiff"
                          style={{
                            background: dc.bg,
                            border: `1px solid ${dc.border}`,
                            color: dc.text,
                          }}
                        >
                          {topic.difficulty}
                        </span>
                        {topic.key_formula && (
                          <span className="tformula-badge">
                            𝑓 {topic.key_formula}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`tchev ${isOpen ? "tchev-open" : ""}`}>
                      ›
                    </span>
                  </div>

                  {isOpen && (
                    <div className="tbody">
                      <p className="tsummary">{topic.summary}</p>
                      {topic.key_points?.length > 0 && (
                        <div className="kpoints-wrap">
                          <p className="kpoints-lbl">Key Points</p>
                          {topic.key_points.map((kp, j) => (
                            <div key={j} className="kpoint">
                              <span className="kpdot" />
                              <span className="kptext">{kp}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {topic.key_formula && (
                        <div className="formula-box">
                          <span className="flbl">Key Formula</span>
                          <code className="fcode">{topic.key_formula}</code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Related Videos ── */}
        {data.related_videos?.length > 0 && (
          <section className="sec-block">
            <div className="sec-hd">
              <span style={{ fontSize: 18 }}>🎬</span>
              <h2 className="sec-title">Watch More on This Topic</h2>
              <span className="sec-count">
                {data.related_videos.length} videos
              </span>
            </div>
            <div className="related-grid">
              {data.related_videos.map((v) => (
                <a
                  key={v.video_id}
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rv-card"
                >
                  <div className="rv-thumb-wrap">
                    <img src={v.thumbnail} alt={v.title} className="rv-thumb" />
                    <div className="rv-play-overlay">
                      <div className="rv-play-btn">▶</div>
                    </div>
                    <div className="rv-duration-badge">▶ Watch</div>
                  </div>
                  <div className="rv-info">
                    <p className="rv-title">{v.title}</p>
                    <p className="rv-channel">
                      <span className="rv-channel-dot" />
                      {v.channel}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ── Inline Quiz ── */}
        <InlineQuiz summaryData={data} />
      </div>

      <style jsx>{`
        ${commonStyles}
        .res-screen {
          min-height: 100vh;
          width: 100%;
          font-family: "Sora", sans-serif;
          color: #f0f0f8;
        }
        .copy-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #8e98bc;
          font-family: "Sora", sans-serif;
          font-size: 12px;
          font-weight: 700;
          padding: 7px 14px;
          border-radius: 10px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
        }
        .copy-btn:hover {
          border-color: rgba(255, 255, 255, 0.18);
          color: #ccc;
        }

        .res-body {
          max-width: 800px;
          width: 100%;
          margin: 0 auto;
          padding: 28px 20px 60px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Meta */
        .meta-card {
          position: relative;
          overflow: hidden;
          display: flex;
          gap: 20px;
          align-items: flex-start;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 22px;
        }
        .meta-card__glow {
          position: absolute;
          top: 0;
          right: 0;
          width: 200px;
          height: 200px;
          background: radial-gradient(
            circle at 100% 0%,
            rgba(91, 208, 255, 0.09),
            transparent 60%
          );
          pointer-events: none;
        }
        .meta-thumb {
          width: 160px;
          height: 90px;
          border-radius: 12px;
          object-fit: cover;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .meta-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .meta-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .meta-tag {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 20px;
          background: rgba(91, 208, 255, 0.09);
          border: 1px solid rgba(91, 208, 255, 0.22);
          color: #5bd0ff;
        }
        .meta-title {
          font-size: 16px;
          font-weight: 800;
          color: #f0f0f8;
          line-height: 1.3;
        }
        .meta-channel {
          font-size: 12px;
          color: #444;
          font-weight: 600;
        }
        .meta-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }
        .mpill {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #444;
        }
        .method {
          color: #43e97b !important;
          background: rgba(67, 233, 123, 0.07) !important;
          border-color: rgba(67, 233, 123, 0.2) !important;
        }

        /* Stats strip */
        .stats-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .stat-item {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 16px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          transition: border-color 0.2s;
        }
        .stat-item:hover {
          border-color: rgba(91, 208, 255, 0.2);
        }
        .stat-val {
          font-size: 22px;
          font-weight: 800;
          color: #5bd0ff;
          font-family: "JetBrains Mono", monospace;
        }
        .stat-lbl {
          font-size: 10px;
          font-weight: 700;
          color: #444;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Section blocks */
        .sec-block {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 22px;
          padding: 22px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .sec-hd {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sec-title {
          font-size: 16px;
          font-weight: 800;
          color: #e0e0f0;
          flex: 1;
          letter-spacing: -0.2px;
        }
        .sec-count {
          font-size: 11px;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #444;
        }

        /* Summary */
        .sum-wrap {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sum-para {
          font-size: 14px;
          color: #9aa6cb;
          line-height: 1.8;
          font-weight: 300;
        }

        /* Takeaways */
        .tklist {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tkrow {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.06);
          transition: border-color 0.2s;
        }
        .tkrow:hover {
          border-color: rgba(91, 208, 255, 0.18);
        }
        .tknum {
          font-size: 11px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          color: #5bd0ff;
          flex-shrink: 0;
          margin-top: 1px;
          min-width: 22px;
        }
        .tktext {
          font-size: 13px;
          color: #c0c0d8;
          line-height: 1.65;
        }

        /* Topics accordion */
        .topics-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tcard {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.02);
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .tcard-open {
          border-color: rgba(91, 208, 255, 0.22) !important;
          background: rgba(91, 208, 255, 0.025) !important;
        }
        .thead {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .thead:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .tnum {
          font-size: 12px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          color: #7e7eab;
          width: 28px;
          height: 28px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s;
        }
        .tnum-open {
          color: #5bd0ff !important;
          border-color: rgba(91, 208, 255, 0.3) !important;
          background: rgba(91, 208, 255, 0.08) !important;
        }
        .thead-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .thead-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ttitle {
          font-size: 14px;
          font-weight: 700;
          color: #e0e0f0;
          flex: 1;
        }
        .tdur {
          font-size: 11px;
          color: #7e7eab;
          font-family: "JetBrains Mono", monospace;
          flex-shrink: 0;
        }
        .thead-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tdiff {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 9px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .tformula-badge {
          font-size: 11px;
          font-weight: 700;
          color: #ffb300;
          background: rgba(255, 179, 0, 0.08);
          border: 1px solid rgba(255, 179, 0, 0.2);
          padding: 2px 9px;
          border-radius: 20px;
          font-family: "JetBrains Mono", monospace;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tchev {
          font-size: 20px;
          color: #7e7eab;
          flex-shrink: 0;
          transition:
            transform 0.25s,
            color 0.2s;
        }
        .tchev-open {
          transform: rotate(90deg);
          color: #5bd0ff;
        }
        .tbody {
          padding: 0 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          animation: sd 0.25s ease;
        }
        @keyframes sd {
          from {
            opacity: 0;
            transform: translateY(-5px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .tsummary {
          font-size: 13px;
          color: #9aa6cb;
          line-height: 1.8;
          font-weight: 300;
          padding-top: 16px;
        }
        .kpoints-wrap {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .kpoints-lbl {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #7e7eab;
        }
        .kpoint {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .kpdot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #5bd0ff;
          flex-shrink: 0;
          margin-top: 6px;
        }
        .kptext {
          font-size: 13px;
          color: #9aa6cb;
          line-height: 1.65;
        }
        .formula-box {
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(255, 179, 0, 0.05);
          border: 1px solid rgba(255, 179, 0, 0.16);
          border-radius: 12px;
          padding: 12px 16px;
        }
        .flbl {
          font-size: 10px;
          font-weight: 800;
          color: #ffb300;
          text-transform: uppercase;
          letter-spacing: 1px;
          white-space: nowrap;
        }
        .fcode {
          font-family: "JetBrains Mono", monospace;
          font-size: 15px;
          color: #ffd700;
          font-weight: 700;
        }

        @media (max-width: 600px) {
          .meta-card {
            flex-direction: column;
          }
          .meta-thumb {
            width: 100%;
            height: auto;
            aspect-ratio: 16/9;
          }
          .stats-strip {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// INLINE QUIZ COMPONENT
// ════════════════════════════════════════════════════════════
function InlineQuiz({ summaryData }) {
  const router = useRouter();

  const [phase, setPhase] = useState("cta"); // cta | generating | active | results
  const [numQ, setNumQ] = useState(10);
  const [quiz, setQuiz] = useState(null); // { quiz_title, questions[] }
  const [answers, setAnswers] = useState({}); // { [qId]: number (index 0-3) }
  const [current, setCurrent] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // The API returns questions[] directly (from quiz_generator.py normalize step):
  // { id, question, options: ["..","..","..",".."], correct: 0-3, difficulty, concept, explanation }
  async function generateQuiz() {
    setError("");
    try {
      // 1. Save the summary data for the next page
      sessionStorage.setItem("active_summary", JSON.stringify(summaryData));

      // 2. Redirect to your new file video_quiz.jsx
      // Note: ensure the filename in /pages is exactly video_quiz.jsx
      router.push(`/video_quiz?id=${summaryData.video_id}`);
    } catch (err) {
      setError("Transition failed. Please try again.");
    }
  }

  function selectAnswer(qId, idx) {
    if (submitted) return;
    setAnswers((p) => ({ ...p, [qId]: idx }));
  }

  function submitQuiz() {
    if (Object.keys(answers).length < quiz.questions.length) return;
    setSubmitted(true);
    setPhase("results");
  }

  function calcScore() {
    if (!quiz) return 0;
    return quiz.questions.filter((q) => answers[q.id] === q.correct).length;
  }

  const score = calcScore();
  const total = quiz?.questions?.length || 0;
  const pct = total ? Math.round((score / total) * 100) : 0;
  const answered = Object.keys(answers).length;

  function gradeColor(p) {
    if (p >= 80) return "#43E97B";
    if (p >= 50) return "#FFB300";
    return "#FF5050";
  }

  const diffColor2 = diffColor; // reuse existing helper

  // ── CTA phase ─────────────────────────────────────────────
  if (phase === "cta")
    return (
      <div className="iq-wrap">
        <div className="iq-cta">
          <div className="iq-cta-glow" />
          <div className="iq-cta-left">
            <span className="iq-cta-icon">🎯</span>
            <div>
              <p className="iq-cta-title">Test Your Understanding</p>
              <p className="iq-cta-sub">
                AI-generated MCQs from this video's content
              </p>
            </div>
          </div>
          <div className="iq-cta-right">
            <button className="iq-gen-btn" onClick={generateQuiz}>
              Generate Quiz →
            </button>
          </div>
        </div>
        {error && <p className="iq-error">⚠ {error}</p>}
        <style jsx>{`
          .iq-wrap {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .iq-cta {
            position: relative;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
            background:
              radial-gradient(
                circle at top left,
                rgba(91, 208, 255, 0.1),
                transparent 40%
              ),
              radial-gradient(
                circle at bottom right,
                rgba(199, 155, 255, 0.1),
                transparent 40%
              ),
              rgba(255, 255, 255, 0.025);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 22px;
            padding: 22px 24px;
          }
          .iq-cta-glow {
            position: absolute;
            inset: 0;
            background: radial-gradient(
              circle at 0% 100%,
              rgba(91, 208, 255, 0.06),
              transparent 50%
            );
            pointer-events: none;
          }
          .iq-cta-left {
            display: flex;
            align-items: center;
            gap: 14px;
            position: relative;
          }
          .iq-cta-icon {
            font-size: 28px;
          }
          .iq-cta-title {
            font-size: 15px;
            font-weight: 800;
            color: #e0e0f0;
            margin-bottom: 3px;
          }
          .iq-cta-sub {
            font-size: 12px;
            color: #444;
          }
          .iq-cta-right {
            display: flex;
            flex-direction: column;
            gap: 10px;
            position: relative;
            align-items: flex-end;
          }
          .iq-numq-row {
            display: flex;
            gap: 8px;
          }
          .iq-numq-btn {
            padding: 6px 14px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.04);
            color: #666;
            font-family: "Sora", sans-serif;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s;
          }
          .iq-numq-sel {
            background: rgba(91, 208, 255, 0.12) !important;
            border-color: rgba(91, 208, 255, 0.4) !important;
            color: #5bd0ff !important;
          }
          .iq-gen-btn {
            background: linear-gradient(135deg, #5bd0ff, #c79bff);
            color: #05070f;
            border: none;
            border-radius: 14px;
            padding: 12px 24px;
            font-size: 14px;
            font-weight: 800;
            cursor: pointer;
            font-family: "Sora", sans-serif;
            white-space: nowrap;
            box-shadow: 0 4px 20px rgba(91, 208, 255, 0.25);
            transition:
              transform 0.15s,
              box-shadow 0.15s;
          }
          .iq-gen-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 28px rgba(91, 208, 255, 0.35);
          }
          .iq-error {
            font-size: 12px;
            color: #ff5050;
            font-weight: 600;
            padding: 0 4px;
          }
          @media (max-width: 600px) {
            .iq-cta {
              flex-direction: column;
              align-items: flex-start;
            }
            .iq-cta-right {
              align-items: flex-start;
              width: 100%;
            }
            .iq-gen-btn {
              width: 100%;
              text-align: center;
            }
          }
        `}</style>
      </div>
    );

  // ── Generating phase ───────────────────────────────────────
  if (phase === "generating")
    return (
      <div className="iq-gen-wrap">
        <div className="iq-spinner" />
        <div>
          <p className="iq-gen-title">Generating {numQ} Questions…</p>
          <p className="iq-gen-sub">
            AI is crafting MCQs from this video's content
          </p>
        </div>
        <style jsx>{`
          .iq-gen-wrap {
            display: flex;
            align-items: center;
            gap: 18px;
            background: rgba(255, 255, 255, 0.025);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 22px;
            padding: 28px 24px;
          }
          .iq-spinner {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            flex-shrink: 0;
            border: 3px solid rgba(91, 208, 255, 0.15);
            border-top-color: #5bd0ff;
            animation: iqspin 0.8s linear infinite;
          }
          @keyframes iqspin {
            to {
              transform: rotate(360deg);
            }
          }
          .iq-gen-title {
            font-size: 15px;
            font-weight: 800;
            color: #e0e0f0;
            margin-bottom: 4px;
          }
          .iq-gen-sub {
            font-size: 12px;
            color: #444;
          }
        `}</style>
      </div>
    );

  // ── Active quiz phase ──────────────────────────────────────
  if (phase === "active" && quiz) {
    const q = quiz.questions[current];
    const userAns = answers[q.id]; // number (0-3) or undefined
    const isAnswered = userAns !== undefined;

    return (
      <div className="iq-active-wrap">
        {/* Header */}
        <div className="iq-active-hdr">
          <div>
            <p className="iq-active-title">🎯 Video Quiz</p>
            <p className="iq-active-prog">
              {answered} of {total} answered
            </p>
          </div>
          <div className="iq-prog-bar-wrap">
            <div className="iq-prog-bar">
              <div
                className="iq-prog-fill"
                style={{ width: `${(answered / total) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Question nav pills */}
        <div className="iq-qnav">
          {quiz.questions.map((qq, i) => (
            <button
              key={qq.id}
              className={`iq-qpill ${i === current ? "iq-qpill-cur" : ""} ${answers[qq.id] !== undefined ? "iq-qpill-done" : ""}`}
              onClick={() => setCurrent(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {/* Question card */}
        <div className="iq-qcard">
          <div className="iq-qmeta">
            <span className="iq-qnum">
              Q{current + 1} / {total}
            </span>
            <span
              className="iq-qdiff"
              style={{
                background: diffColor2(q.difficulty).bg,
                border: `1px solid ${diffColor2(q.difficulty).border}`,
                color: diffColor2(q.difficulty).text,
              }}
            >
              {q.difficulty}
            </span>
            <span className="iq-qtopic">{q.concept}</span>
          </div>
          <p className="iq-qtext">{q.question}</p>

          <div className="iq-options">
            {q.options.map((optText, idx) => (
              <button
                key={idx}
                className={`iq-opt ${userAns === idx ? "iq-opt-sel" : ""}`}
                onClick={() => selectAnswer(q.id, idx)}
              >
                <span className="iq-opt-key">{["A", "B", "C", "D"][idx]}</span>
                <span className="iq-opt-val">{optText}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Nav + submit */}
        <div className="iq-footer">
          <button
            className="iq-nav-btn"
            onClick={() => setCurrent((p) => Math.max(0, p - 1))}
            disabled={current === 0}
          >
            ← Prev
          </button>

          {current < total - 1 ? (
            <button
              className="iq-nav-btn iq-nav-next"
              onClick={() => setCurrent((p) => p + 1)}
              disabled={!isAnswered}
            >
              Next →
            </button>
          ) : (
            <button
              className={`iq-submit-btn ${answered === total ? "iq-submit-ready" : ""}`}
              onClick={submitQuiz}
              disabled={answered < total}
            >
              {answered < total
                ? `Answer all ${total - answered} remaining`
                : "Submit Quiz ✓"}
            </button>
          )}
        </div>

        <style jsx>{`
          .iq-active-wrap {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 22px;
            padding: 22px;
            display: flex;
            flex-direction: column;
            gap: 18px;
          }
          .iq-active-hdr {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
          }
          .iq-active-title {
            font-size: 15px;
            font-weight: 800;
            color: #e0e0f0;
            margin-bottom: 4px;
          }
          .iq-active-prog {
            font-size: 11px;
            color: #555;
            font-family: "JetBrains Mono", monospace;
          }
          .iq-prog-bar-wrap {
            flex: 1;
            max-width: 200px;
            display: flex;
            align-items: center;
          }
          .iq-prog-bar {
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.07);
            border-radius: 3px;
            overflow: hidden;
          }
          .iq-prog-fill {
            height: 100%;
            background: linear-gradient(90deg, #5bd0ff, #c79bff);
            border-radius: 3px;
            transition: width 0.4s ease;
          }

          .iq-qnav {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }
          .iq-qpill {
            width: 30px;
            height: 30px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.03);
            color: #444;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.15s;
            font-family: "JetBrains Mono", monospace;
          }
          .iq-qpill-cur {
            border-color: rgba(91, 208, 255, 0.5) !important;
            color: #5bd0ff !important;
            background: rgba(91, 208, 255, 0.1) !important;
          }
          .iq-qpill-done {
            border-color: rgba(67, 233, 123, 0.3) !important;
            color: #43e97b !important;
            background: rgba(67, 233, 123, 0.07) !important;
          }

          .iq-qcard {
            background: rgba(255, 255, 255, 0.025);
            border: 1px solid rgba(255, 255, 255, 0.07);
            border-radius: 16px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .iq-qmeta {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }
          .iq-qnum {
            font-size: 11px;
            font-weight: 800;
            font-family: "JetBrains Mono", monospace;
            color: #5bd0ff;
          }
          .iq-qdiff {
            font-size: 10px;
            font-weight: 800;
            padding: 2px 9px;
            border-radius: 20px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .iq-qtopic {
            font-size: 11px;
            color: #444;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 200px;
          }
          .iq-qtext {
            font-size: 15px;
            font-weight: 700;
            color: #e8e8f0;
            line-height: 1.6;
          }

          .iq-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .iq-opt {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 13px 16px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.07);
            background: rgba(255, 255, 255, 0.025);
            cursor: pointer;
            text-align: left;
            transition: all 0.15s;
            width: 100%;
            font-family: "Sora", sans-serif;
          }
          .iq-opt:hover {
            border-color: rgba(91, 208, 255, 0.3);
            background: rgba(91, 208, 255, 0.05);
          }
          .iq-opt-sel {
            border-color: rgba(91, 208, 255, 0.55) !important;
            background: rgba(91, 208, 255, 0.1) !important;
          }
          .iq-opt-key {
            width: 24px;
            height: 24px;
            border-radius: 7px;
            flex-shrink: 0;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(255, 255, 255, 0.05);
            color: #666;
            font-size: 11px;
            font-weight: 800;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: "JetBrains Mono", monospace;
          }
          .iq-opt-sel .iq-opt-key {
            border-color: #5bd0ff;
            background: rgba(91, 208, 255, 0.2);
            color: #5bd0ff;
          }
          .iq-opt-val {
            font-size: 13px;
            color: #c0c0d8;
            line-height: 1.5;
            padding-top: 2px;
          }

          .iq-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
          }
          .iq-nav-btn {
            padding: 10px 20px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.04);
            color: #666;
            font-family: "Sora", sans-serif;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.15s;
          }
          .iq-nav-btn:disabled {
            opacity: 0.25;
            cursor: not-allowed;
          }
          .iq-nav-btn:not(:disabled):hover {
            border-color: rgba(255, 255, 255, 0.2);
            color: #aaa;
          }
          .iq-nav-next {
            color: #5bd0ff !important;
            border-color: rgba(91, 208, 255, 0.3) !important;
          }
          .iq-submit-btn {
            padding: 11px 24px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.04);
            color: #444;
            font-family: "Sora", sans-serif;
            font-size: 13px;
            font-weight: 800;
            cursor: not-allowed;
            transition: all 0.2s;
          }
          .iq-submit-ready {
            background: linear-gradient(135deg, #5bd0ff, #c79bff) !important;
            border-color: transparent !important;
            color: #05070f !important;
            cursor: pointer !important;
            box-shadow: 0 4px 20px rgba(91, 208, 255, 0.28);
          }
          .iq-submit-ready:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 28px rgba(91, 208, 255, 0.38);
          }
        `}</style>
      </div>
    );
  }

  // ── Results phase ──────────────────────────────────────────
  if (phase === "results" && quiz) {
    const gc = gradeColor(pct);
    return (
      <div className="iq-res-wrap">
        {/* Score banner */}
        <div className="iq-score-banner">
          <div className="iq-score-ring" style={{ borderColor: gc }}>
            <span className="iq-score-pct" style={{ color: gc }}>
              {pct}%
            </span>
          </div>
          <div>
            <p className="iq-score-label" style={{ color: gc }}>
              {pct >= 80
                ? "Excellent! 🌟"
                : pct >= 50
                  ? "Good effort 👍"
                  : "Keep revising 📖"}
            </p>
            <p className="iq-score-sub">
              {score} correct out of {total} questions
            </p>
          </div>
          <button className="iq-regen-btn" onClick={generateQuiz}>
            🔄 New Questions
          </button>
        </div>

        {/* Per-question review */}
        <div className="iq-review-list">
          {quiz.questions.map((q, i) => {
            const userAns = answers[q.id]; // index 0-3
            const isCorrect = userAns === q.correct;
            const dc = diffColor2(q.difficulty);
            return (
              <div
                key={q.id}
                className={`iq-rcard ${isCorrect ? "iq-rcard-ok" : "iq-rcard-fail"}`}
              >
                <div className="iq-rcard-hdr">
                  <span className="iq-rcard-num">
                    {isCorrect ? "✓" : "✗"} Q{i + 1}
                  </span>
                  <span
                    className="iq-qdiff"
                    style={{
                      background: dc.bg,
                      border: `1px solid ${dc.border}`,
                      color: dc.text,
                    }}
                  >
                    {q.difficulty}
                  </span>
                  <span className="iq-qtopic">{q.concept}</span>
                </div>
                <p className="iq-rcard-q">{q.question}</p>
                <div className="iq-rcard-opts">
                  {q.options.map((optText, idx) => {
                    const isCorrectOpt = idx === q.correct;
                    const isUserOpt = idx === userAns;
                    let cls = "iq-ropt";
                    if (isCorrectOpt) cls += " iq-ropt-correct";
                    else if (isUserOpt) cls += " iq-ropt-wrong";
                    return (
                      <div key={idx} className={cls}>
                        <span className="iq-ropt-key">
                          {["A", "B", "C", "D"][idx]}
                        </span>
                        <span className="iq-ropt-val">{optText}</span>
                        {isCorrectOpt && (
                          <span className="iq-ropt-badge">✓ Correct</span>
                        )}
                        {isUserOpt && !isCorrectOpt && (
                          <span className="iq-ropt-badge iq-ropt-badge-wrong">
                            ✗ Your answer
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="iq-explanation">
                  <span className="iq-expl-lbl">💡 Explanation</span>
                  <p className="iq-expl-text">{q.explanation}</p>
                </div>
              </div>
            );
          })}
        </div>

        <style jsx>{`
          .iq-res-wrap {
            display: flex;
            flex-direction: column;
            gap: 14px;
          }

          .iq-score-banner {
            display: flex;
            align-items: center;
            gap: 18px;
            flex-wrap: wrap;
            background: rgba(255, 255, 255, 0.025);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 22px;
            padding: 22px 24px;
          }
          .iq-score-ring {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            border: 3px solid;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .iq-score-pct {
            font-size: 20px;
            font-weight: 800;
            font-family: "JetBrains Mono", monospace;
          }
          .iq-score-label {
            font-size: 16px;
            font-weight: 800;
            margin-bottom: 4px;
          }
          .iq-score-sub {
            font-size: 12px;
            color: #555;
          }
          .iq-regen-btn {
            margin-left: auto;
            padding: 11px 20px;
            border-radius: 14px;
            border: 1px solid rgba(91, 208, 255, 0.3);
            background: rgba(91, 208, 255, 0.08);
            color: #5bd0ff;
            font-family: "Sora", sans-serif;
            font-size: 13px;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.15s;
            white-space: nowrap;
          }
          .iq-regen-btn:hover {
            background: rgba(91, 208, 255, 0.15);
            transform: translateY(-1px);
          }

          .iq-review-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .iq-rcard {
            border-radius: 16px;
            padding: 18px;
            border: 1px solid;
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .iq-rcard-ok {
            border-color: rgba(67, 233, 123, 0.2);
            background: rgba(67, 233, 123, 0.03);
          }
          .iq-rcard-fail {
            border-color: rgba(255, 80, 80, 0.2);
            background: rgba(255, 80, 80, 0.03);
          }
          .iq-rcard-hdr {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }
          .iq-rcard-num {
            font-size: 12px;
            font-weight: 800;
            font-family: "JetBrains Mono", monospace;
            min-width: 36px;
          }
          .iq-rcard-ok .iq-rcard-num {
            color: #43e97b;
          }
          .iq-rcard-fail .iq-rcard-num {
            color: #ff5050;
          }
          .iq-rcard-q {
            font-size: 14px;
            font-weight: 700;
            color: #e0e0f0;
            line-height: 1.55;
          }

          .iq-rcard-opts {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .iq-ropt {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            background: rgba(255, 255, 255, 0.02);
          }
          .iq-ropt-correct {
            border-color: rgba(67, 233, 123, 0.35) !important;
            background: rgba(67, 233, 123, 0.07) !important;
          }
          .iq-ropt-wrong {
            border-color: rgba(255, 80, 80, 0.35) !important;
            background: rgba(255, 80, 80, 0.07) !important;
          }
          .iq-ropt-key {
            width: 22px;
            height: 22px;
            border-radius: 6px;
            flex-shrink: 0;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.04);
            color: #555;
            font-size: 10px;
            font-weight: 800;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: "JetBrains Mono", monospace;
          }
          .iq-ropt-correct .iq-ropt-key {
            border-color: #43e97b;
            background: rgba(67, 233, 123, 0.15);
            color: #43e97b;
          }
          .iq-ropt-wrong .iq-ropt-key {
            border-color: #ff5050;
            background: rgba(255, 80, 80, 0.15);
            color: #ff5050;
          }
          .iq-ropt-val {
            font-size: 13px;
            color: #c0c0d8;
            flex: 1;
            line-height: 1.4;
          }
          .iq-ropt-badge {
            font-size: 10px;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 20px;
            white-space: nowrap;
            background: rgba(67, 233, 123, 0.15);
            color: #43e97b;
            border: 1px solid rgba(67, 233, 123, 0.3);
          }
          .iq-ropt-badge-wrong {
            background: rgba(255, 80, 80, 0.12) !important;
            color: #ff5050 !important;
            border-color: rgba(255, 80, 80, 0.3) !important;
          }

          .iq-explanation {
            background: rgba(255, 179, 0, 0.05);
            border: 1px solid rgba(255, 179, 0, 0.15);
            border-radius: 10px;
            padding: 12px 14px;
            display: flex;
            flex-direction: column;
            gap: 5px;
          }
          .iq-expl-lbl {
            font-size: 10px;
            font-weight: 800;
            color: #ffb300;
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          .iq-expl-text {
            font-size: 13px;
            color: #b0a070;
            line-height: 1.6;
          }

          .iq-qdiff {
            font-size: 10px;
            font-weight: 800;
            padding: 2px 9px;
            border-radius: 20px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          .iq-qtopic {
            font-size: 11px;
            color: #444;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 200px;
          }
          @media (max-width: 600px) {
            .iq-score-banner {
              flex-direction: column;
              align-items: flex-start;
            }
            .iq-regen-btn {
              margin-left: 0;
              width: 100%;
              text-align: center;
            }
          }
        `}</style>
      </div>
    );
  }

  return null;
}

// ════════════════════════════════════════════════════════════
// MAIN — orchestrates the 3 screens
// ════════════════════════════════════════════════════════════
export default function VideoSummaryPage() {
  const [screen, setScreen] = useState("input");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [user, setUser] = useState({ name: "Student", streak: 0 });
  const [mounted, setMounted] = useState(false);
  const [recentVideos, setRV] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // 1. Fetch from Cloud instead of LocalStorage
  // ─── MODIFIED USEEFFECT ───
  useEffect(() => {
    setMounted(true);

    // Restore User Info
    try {
      const s = JSON.parse(localStorage.getItem("gyaani_user") || "{}");
      if (s.name) setUser((p) => ({ ...p, name: s.name }));
      setUser((p) => ({
        ...p,
        streak: parseInt(localStorage.getItem("login_streak") || "0"),
      }));
    } catch {}

    // 1. Fetch from Cloud instead of LocalStorage
    async function loadCloudHistory() {
      const token = getToken();
      if (!token) {
        setHistoryLoading(false);
        return;
      }
      try {
        const res = await fetch(`${BASE_URL}/api/video-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          console.log("[VideoHistory] fetched", data.length, "items");
          setRV(Array.isArray(data) ? data : []);
        } else {
          console.warn("[VideoHistory] API returned", res.status);
        }
      } catch (err) {
        console.error("[VideoHistory] fetch failed:", err);
      } finally {
        setHistoryLoading(false);
      }
    }
    loadCloudHistory();

    // Session Restore (Returning from Quiz)
    // Only restore if we came back via router.back() from the quiz page
    try {
      const savedSummary = sessionStorage.getItem("active_summary");
      const cameFromQuiz = sessionStorage.getItem("came_from_quiz");
      if (savedSummary && cameFromQuiz) {
        setSummary(JSON.parse(savedSummary));
        setScreen("result");
        sessionStorage.removeItem("came_from_quiz"); // clear the flag
      }
    } catch {}
  }, []);

  // 2. Load full data instantly when clicking a recent item
  function handleRecentClick(videoData) {
    setSummary(videoData);
    sessionStorage.setItem("active_summary", JSON.stringify(videoData));
    setScreen("result");
  }

  // ─── MODIFIED HANDLESUBMIT ───
  async function handleSubmit(videoUrl, cachedData = null) {
    // If we passed cachedData from clicking a "Recent" item, use it immediately
    if (cachedData) {
      handleRecentClick(cachedData);
      return;
    }

    // Otherwise, check if the URL exists in our fetched recentVideos list first
    const videoId = extractVideoId(videoUrl);
    const existing = recentVideos.find((v) => v.video_id === videoId);
    if (existing) {
      handleRecentClick(existing);
      return;
    }

    // If truly new, proceed with API call
    setUrl(videoUrl);
    setScreen("processing");
    setError("");
    try {
      const data = await fetchSummary(videoUrl);

      // Save to session for the Quiz page
      sessionStorage.setItem("active_summary", JSON.stringify(data));

      setSummary(data);
      setScreen("result");

      // Refresh the history list so the new summary appears in "Recent"
      try {
        const token = getToken();
        const res = await fetch(`${BASE_URL}/api/video-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const hist = await res.json();
          setRV(Array.isArray(hist) ? hist : []);
        }
      } catch {}
    } catch (err) {
      setError(err.message || "Failed to summarise video.");
      setScreen("input");
    }
  }

  return (
    <>
      <Head>
        <title>Video Summariser — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Sidebar user={user}>
        <div className={`page ${mounted ? "mounted" : ""}`}>
          {error && (
            <div className="err-banner">
              ⚠ {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {screen === "input" && (
            <InputScreen
              onSubmit={handleSubmit}
              recentVideos={recentVideos}
              historyLoading={historyLoading}
            />
          )}
          {screen === "processing" && (
            <ProcessingScreen videoId={extractVideoId(url)} />
          )}
          {screen === "result" && summary && (
            <SummaryScreen
              data={summary}
              onBack={() => {
                sessionStorage.removeItem("active_summary");
                sessionStorage.removeItem("came_from_quiz");
                setScreen("input");
                setSummary(null);
                setUrl("");
              }}
            />
          )}
        </div>
      </Sidebar>
      <style jsx>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        .page {
          min-height: 100vh;
          width: 100%;
          background:
            radial-gradient(
              circle at 15% 10%,
              rgba(91, 208, 255, 0.1),
              transparent 24%
            ),
            radial-gradient(
              circle at 85% 16%,
              rgba(199, 155, 255, 0.09),
              transparent 18%
            ),
            radial-gradient(
              circle at 50% 80%,
              rgba(255, 123, 172, 0.05),
              transparent 28%
            ),
            linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
          color: #f0f0f8;
          font-family: "Sora", sans-serif;
          opacity: 0;
          transform: translateY(8px);
          transition:
            opacity 0.4s ease,
            transform 0.4s ease;
        }
        .page.mounted {
          opacity: 1;
          transform: none;
        }
        .err-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
          background: rgba(255, 80, 80, 0.09);
          border-bottom: 1px solid rgba(255, 80, 80, 0.2);
          font-size: 13px;
          color: #ff5050;
          font-weight: 600;
        }
        .err-banner button {
          background: none;
          border: none;
          color: #ff5050;
          font-size: 18px;
          cursor: pointer;
        }
      `}</style>
    </>
  );
}

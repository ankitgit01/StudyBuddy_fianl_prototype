// frontend/pages/index.jsx

import { useRouter } from "next/router";
import Head from "next/head";
import Sidebar from "../components/Sidebar";
import { chatWithBot, getNotes } from "../services/api";
import { useEffect, useRef, useState } from "react";

// ─── ADVANCED CHAT CONTENT RENDERING ──────────────────────────
function processBoldText(text) {
  if (!text) return "";
  // Handles **bold**, $latex$, and basic variables
  const parts = text.split(/(\*\*.*?\*\*|\$.*?\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ color: "#fff", fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("$") && part.endsWith("$")) {
      return (
        <code
          key={i}
          style={{
            color: "#5bd0ff",
            fontFamily: "'JetBrains Mono', monospace",
            padding: "0 4px",
            background: "rgba(91,208,255,0.05)",
            borderRadius: "4px",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderChatContent(content) {
  if (!content) return null;

  const lines = String(content).split(/\n/);
  const elements = [];

  for (let i = 0; i < lines.length; i++) {
    let text = lines[i].trim();
    if (!text) continue;

    // 1. Handle Headings (### or ##)
    if (text.startsWith("###")) {
      elements.push(
        <h3
          key={i}
          style={{
            color: "#fff",
            fontSize: "16px",
            fontWeight: 800,
            marginTop: "18px",
            marginBottom: "8px",
            borderLeft: "3px solid #6C63FF",
            paddingLeft: "10px",
          }}
        >
          {processBoldText(text.replace(/^###\s*/, ""))}
        </h3>,
      );
      continue;
    }

    // 2. Handle Blockquotes (>)
    if (text.startsWith(">")) {
      elements.push(
        <blockquote
          key={i}
          style={{
            margin: "10px 0",
            padding: "12px 16px",
            background: "rgba(108,99,255,0.06)",
            borderLeft: "4px solid #6C63FF",
            borderRadius: "4px",
            fontStyle: "italic",
            color: "#dbe2ff",
            fontSize: "13px",
            lineHeight: "1.5",
          }}
        >
          {processBoldText(text.replace(/^>\s*/, ""))}
        </blockquote>,
      );
      continue;
    }

    // 3. Handle List Items (•, -, *, 1.)
    if (/^(\d+\.|\*|-|•)\s/.test(text)) {
      elements.push(
        <div
          key={i}
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "8px",
            paddingLeft: "12px",
            alignItems: "flex-start",
          }}
        >
          <span
            style={{ color: "#6C63FF", fontSize: "14px", lineHeight: "1.4" }}
          >
            •
          </span>
          <span
            style={{ fontSize: "13.5px", color: "#c8c8d8", lineHeight: "1.5" }}
          >
            {processBoldText(text.replace(/^(\d+\.|\*|-|•)\s*/, ""))}
          </span>
        </div>,
      );
      continue;
    }

    // 4. Handle Formulas or Centered Variables (Indented lines)
    if (text.includes("=") && text.length < 30) {
      elements.push(
        <div
          key={i}
          style={{
            textAlign: "center",
            margin: "12px 0",
            padding: "10px",
            background: "rgba(255,255,255,0.03)",
            borderRadius: "8px",
            fontFamily: "'JetBrains Mono', monospace",
            color: "#5bd0ff",
            fontWeight: 600,
          }}
        >
          {text}
        </div>,
      );
      continue;
    }

    // 5. Handle Section Dividers
    if (text === "---") {
      elements.push(
        <hr
          key={i}
          style={{
            border: "none",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            margin: "20px 0",
          }}
        />,
      );
      continue;
    }

    // 6. Regular Paragraphs
    elements.push(
      <p
        key={i}
        style={{
          marginBottom: "10px",
          fontSize: "13.5px",
          color: "#d9d9eb",
          lineHeight: "1.7",
          fontWeight: 400,
        }}
      >
        {processBoldText(text)}
      </p>,
    );
  }

  return elements;
}

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState({
    name: "Friend",
    streak: 0,
    totalNotes: 0,
    avgConfusion: 0.5,
  });
  const [now, setNow] = useState(new Date());
  const [askQuery, setAskQuery] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function applyProfile(profile = {}) {
      setUser((prev) => ({
        ...prev,
        name: profile.name || prev.name,
        streak: Number(
          profile.days_since_last_break ??
            profile.predict_params?.days_since_last_break ??
            prev.streak,
        ),
      }));
    }

    function handleProfileUpdate(event) {
      applyProfile(event.detail || {});
    }

    window.addEventListener("gyaani:user-profile-updated", handleProfileUpdate);
    return () => {
      window.removeEventListener(
        "gyaani:user-profile-updated",
        handleProfileUpdate,
      );
    };
  }, []);

  useEffect(() => {
    setMounted(true);
    try {
      const storedUser = JSON.parse(
        localStorage.getItem("gyaani_user") || "{}",
      );
      const profile = JSON.parse(
        localStorage.getItem("gyaani_user_profile") || "{}",
      );
      setUser((prev) => ({
        ...prev,
        name: storedUser.name || profile.name || prev.name,
        streak: Number(
          profile.days_since_last_break ??
            profile.predict_params?.days_since_last_break ??
            0,
        ),
      }));
    } catch (_) {}

    getNotes()
      .then((notes) => {
        if (!Array.isArray(notes)) return;
        const totalNotes = notes.length;
        const withConf = notes.filter((n) => n.mean_confusion != null);
        const avgConf = withConf.length
          ? withConf.reduce((a, n) => a + n.mean_confusion, 0) / withConf.length
          : 0.5;
        setUser((prev) => ({ ...prev, totalNotes, avgConfusion: avgConf }));
      })
      .catch(() => {});
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const greetEmoji = hour < 12 ? "🌅" : hour < 17 ? "☀️" : "🌙";
  const timeStr = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const dateStr = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  async function sendHomeChat(prefill) {
    console.log("prefill:", prefill);
    const text = (prefill ?? askQuery).trim();
    if (!text || chatLoading) return;

    setChatMessages((prev) => [...prev, { role: "user", content: text }]);
    setAskQuery("");
    setChatLoading(true);

    const isAudio = !!prefill; // 👈 IMPORTANT

    try {
      const data = await chatWithBot({
        message: text,
        is_audio: isAudio,
      });

      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response || "I couldn't generate a reply right now.",
          audio_url: data.audio_url, // 👈 ADD THIS
        },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, couldn't connect right now. Please try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function handleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input not supported in this browser.");
      return;
    }
    if (isListening) return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    setIsListening(true);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setAskQuery(transcript);
      setIsListening(false);
      setTimeout(() => sendHomeChat(transcript), 100);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  }

  function handleAskKey(e) {
    if (e.key === "Enter" && e.target.value.trim()) {
      e.preventDefault();
      sendHomeChat(e.target.value);
    }
  }

  return (
    <>
      <Head>
        <title>GYAANI AI — Your Learning Companion</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <Sidebar user={user}>
        <div className={`page ${mounted ? "mounted" : ""}`}>
          <header className="topbar">
            <div className="topbar-left">
              <p className="topbar-greeting">
                {greetEmoji} {greeting}, {user.name}!
              </p>
              <p className="topbar-date">{dateStr}</p>
            </div>
            <div className="topbar-right">
              <div className="time-pill">{mounted ? timeStr : ""}</div>
            </div>
          </header>

          <div className="content-area">
            <div className="hero-stats-row">
              <div className="hero">
                <h1 className="hero-title">
                  Turn your notes into{" "}
                  <span className="hero-accent">intelligence</span>
                </h1>
                <p className="hero-sub">
                  Upload a photo of your handwritten notes — GYAANI AI reads
                  them, finds your confusion points and teaches you in your own
                  language.
                </p>
                <div className="hero-actions">
                  <button
                    className="cta-btn"
                    onClick={() => router.push("/upload")}
                  >
                    <span>📸</span> Upload Notes
                  </button>
                  <button
                    className="cta-btn cta-btn--ghost"
                    onClick={() => router.push("/create-explanation")}
                  >
                    <span>✨</span> Create AI Explanation
                  </button>
                </div>
              </div>

              <div className="stats-col">
                <div className="stat-card" style={{ "--accent": "#6C63FF" }}>
                  <span className="stat-card-icon">📝</span>
                  <span className="stat-num">{user.totalNotes}</span>
                  <span className="stat-label">Notes scanned</span>
                </div>
              </div>
            </div>

            <div className="ask-section">
              <div className="ask-box-wrap">
                <svg
                  className="ask-cartoon"
                  viewBox="0 0 160 230"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <ellipse
                    cx="80"
                    cy="173"
                    rx="28"
                    ry="5"
                    fill="#000"
                    opacity="0.2"
                  />
                  <path
                    d="M54,170 Q50,174 47,180"
                    stroke="#f9c98a"
                    strokeWidth="13"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M47,180 Q43,194 42,210"
                    stroke="#f9c98a"
                    strokeWidth="11"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <ellipse cx="41" cy="215" rx="15" ry="9" fill="#4a4aaa" />
                  <ellipse cx="37" cy="212" rx="9" ry="6" fill="#6060cc" />
                  <path
                    d="M28,219 Q41,223 54,219"
                    stroke="#3a3a88"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M106,170 Q110,174 113,180"
                    stroke="#f9c98a"
                    strokeWidth="13"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M113,180 Q117,194 118,210"
                    stroke="#f9c98a"
                    strokeWidth="11"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <ellipse cx="119" cy="215" rx="15" ry="9" fill="#4a4aaa" />
                  <ellipse cx="123" cy="212" rx="9" ry="6" fill="#6060cc" />
                  <path
                    d="M110,219 Q119,223 132,219"
                    stroke="#3a3a88"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <ellipse cx="80" cy="134" rx="31" ry="36" fill="#7B6FFF" />
                  <path
                    d="M67,149 Q80,156 93,149 Q93,163 80,163 Q67,163 67,149Z"
                    fill="#6355ee"
                  />
                  <line
                    x1="76"
                    y1="109"
                    x2="73"
                    y2="124"
                    stroke="#5244dd"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                  <line
                    x1="84"
                    y1="109"
                    x2="87"
                    y2="124"
                    stroke="#5244dd"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                  <circle cx="73" cy="125" r="2.2" fill="#5244dd" />
                  <circle cx="87" cy="125" r="2.2" fill="#5244dd" />
                  <rect
                    x="74"
                    y="97"
                    width="12"
                    height="12"
                    rx="5"
                    fill="#f9c98a"
                  />
                  <circle cx="80" cy="79" r="33" fill="#fad49a" />
                  <path d="M49,71 Q52,44 80,40 Q108,44 111,71" fill="#2a1a0a" />
                  <circle cx="80" cy="37" r="12" fill="#2a1a0a" />
                  <circle cx="80" cy="35" r="9" fill="#3d2810" />
                  <path d="M49,64 Q42,54 46,46 Q49,55 54,59" fill="#2a1a0a" />
                  <path
                    d="M111,64 Q118,54 114,46 Q111,55 106,59"
                    fill="#2a1a0a"
                  />
                  <ellipse cx="48" cy="79" rx="7" ry="9.5" fill="#f0c080" />
                  <ellipse cx="48" cy="79" rx="4" ry="6" fill="#e8a86a" />
                  <ellipse cx="112" cy="79" rx="7" ry="9.5" fill="#f0c080" />
                  <ellipse cx="112" cy="79" rx="4" ry="6" fill="#e8a86a" />
                  <ellipse cx="69" cy="77" rx="10.5" ry="11.5" fill="white" />
                  <ellipse cx="91" cy="77" rx="10.5" ry="11.5" fill="white" />
                  <circle cx="70" cy="78" r="8" fill="#3a2a60" />
                  <circle cx="92" cy="78" r="8" fill="#3a2a60" />
                  <circle cx="71" cy="79" r="5" fill="#110a1a" />
                  <circle cx="93" cy="79" r="5" fill="#110a1a" />
                  <circle cx="68" cy="74" r="3" fill="white" />
                  <circle cx="74" cy="80" r="1.4" fill="white" />
                  <circle cx="90" cy="74" r="3" fill="white" />
                  <circle cx="96" cy="80" r="1.4" fill="white" />
                  <path
                    d="M61,64 Q70,58 79,64"
                    stroke="#2a1a0a"
                    strokeWidth="2.8"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M83,64 Q92,58 101,64"
                    stroke="#2a1a0a"
                    strokeWidth="2.8"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <ellipse
                    cx="57"
                    cy="88"
                    rx="9.5"
                    ry="6"
                    fill="#ff9999"
                    opacity="0.33"
                  />
                  <ellipse
                    cx="103"
                    cy="88"
                    rx="9.5"
                    ry="6"
                    fill="#ff9999"
                    opacity="0.33"
                  />
                  <ellipse cx="80" cy="86" rx="3.2" ry="2.2" fill="#e8a06a" />
                  <path
                    d="M68,95 Q80,109 92,95"
                    stroke="#c07030"
                    strokeWidth="2.6"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M71,96 Q80,104 89,96 Q89,101 80,101 Q71,101 71,96Z"
                    fill="white"
                    opacity="0.6"
                  />
                  <path
                    d="M51,120 Q34,129 22,140"
                    stroke="#f9c98a"
                    strokeWidth="10"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <circle cx="19" cy="142" r="9" fill="#f9c98a" />
                  <circle cx="12" cy="137" r="5.5" fill="#f9c98a" />
                  <circle cx="11" cy="146" r="5.5" fill="#f9c98a" />
                  <path
                    d="M109,120 Q122,136 124,154"
                    stroke="#f9c98a"
                    strokeWidth="10"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <circle cx="125" cy="157" r="9" fill="#f9c98a" />
                  <g transform="translate(-16,116) rotate(-11)">
                    <rect
                      x="2"
                      y="2"
                      width="54"
                      height="68"
                      rx="6"
                      fill="#2a1040"
                      opacity="0.22"
                    />
                    <rect
                      x="0"
                      y="0"
                      width="54"
                      height="68"
                      rx="6"
                      fill="#9B7FFF"
                    />
                    <rect
                      x="5"
                      y="4"
                      width="45"
                      height="60"
                      rx="4"
                      fill="#fafaf8"
                    />
                    <rect
                      x="0"
                      y="0"
                      width="11"
                      height="68"
                      rx="6"
                      fill="#7B5FDD"
                    />
                    <circle cx="5.5" cy="13" r="2.8" fill="#9B7FFF" />
                    <circle cx="5.5" cy="23" r="2.8" fill="#9B7FFF" />
                    <circle cx="5.5" cy="33" r="2.8" fill="#9B7FFF" />
                    <circle cx="5.5" cy="43" r="2.8" fill="#9B7FFF" />
                    <circle cx="5.5" cy="53" r="2.8" fill="#9B7FFF" />
                    <line
                      x1="16"
                      y1="14"
                      x2="50"
                      y2="14"
                      stroke="#e0ddf0"
                      strokeWidth="1.2"
                    />
                    <line
                      x1="16"
                      y1="22"
                      x2="50"
                      y2="22"
                      stroke="#e0ddf0"
                      strokeWidth="1.2"
                    />
                    <line
                      x1="16"
                      y1="30"
                      x2="50"
                      y2="30"
                      stroke="#e0ddf0"
                      strokeWidth="1.2"
                    />
                    <line
                      x1="16"
                      y1="38"
                      x2="48"
                      y2="38"
                      stroke="#e0ddf0"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M34,17 L36,23 L42,23 L37.5,26.5 L39.5,32.5 L34,28.8 L28.5,32.5 L30.5,26.5 L26,23 L32,23Z"
                      fill="#FFD700"
                    />
                    <path
                      d="M18,50 Q19,47 22,47 Q25,47 25,50 Q28,47 31,47 Q34,47 34,50 Q34,55 24,60 Q14,55 18,50Z"
                      fill="#FF7BAC"
                      opacity="0.72"
                    />
                    <rect
                      x="48"
                      y="-7"
                      width="5.5"
                      height="24"
                      rx="2.5"
                      fill="#FFB300"
                    />
                    <rect x="48" y="15" width="5.5" height="5" fill="#f9c98a" />
                    <polygon points="48,-7 53.5,-7 50.5,-15" fill="#ffd060" />
                  </g>
                  <path
                    d="M122,30 L123.5,35 L129,35 L124.5,38 L126.5,43.5 L122,40 L117.5,43.5 L119.5,38 L115,35 L120.5,35Z"
                    fill="#FFD700"
                    opacity="0.88"
                  />
                  <circle
                    cx="133"
                    cy="48"
                    r="3.5"
                    fill="#FFD700"
                    opacity="0.5"
                  />
                  <circle cx="127" cy="42" r="2" fill="white" opacity="0.45" />
                  <circle
                    cx="136"
                    cy="56"
                    r="2.2"
                    fill="#9B7FFF"
                    opacity="0.65"
                  />
                  <path
                    d="M136,66 Q136,63 139,63 Q142,63 142,66 Q145,63 148,63 Q151,63 151,66 Q151,71 141,75 Q131,71 136,66Z"
                    fill="#FF7BAC"
                    opacity="0.5"
                  />
                </svg>

                <div className="ask-box">
                  <div className="ask-header">
                    <div className="ask-header-left">
                      <span className="ask-icon">🤖 Ask Me Anything</span>
                    </div>
                  </div>

                  <div className="ask-chips">
                    {[
                      "Explain Newton's laws",
                      "What is DNA?",
                      "Solve integration",
                      "French Revolution",
                    ].map((q) => (
                      <button
                        key={q}
                        className="ask-chip"
                        onClick={() => sendHomeChat(q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  <div className="ask-messages">
                    {chatMessages.length === 0 && (
                      <div className="ask-empty"></div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`ask-bubble-row ${msg.role === "user" ? "ask-bubble-row--user" : "ask-bubble-row--ai"}`}
                      >
                        <div
                          className={`ask-bubble ${msg.role === "user" ? "ask-bubble--user" : "ask-bubble--ai"}`}
                        >
                          {msg.role === "assistant"
                            ? renderChatContent(msg.content)
                            : msg.content}

                          {/* 🔊 AUDIO SECTION */}
                          {msg.role === "assistant" && msg.audio_url && (
                            <AudioMessage audioUrl={msg.audio_url} />
                          )}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="ask-bubble-row ask-bubble-row--ai">
                        <div className="ask-bubble ask-bubble--ai ask-bubble--typing">
                          <span className="ask-dot" />
                          <span className="ask-dot" />
                          <span className="ask-dot" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="ask-input-row">
                    <input
                      className="ask-input"
                      placeholder="Ask anything about your studies…"
                      value={askQuery}
                      onChange={(e) => setAskQuery(e.target.value)}
                      onKeyDown={handleAskKey}
                    />
                    <button
                      className={`ask-icon-btn ask-voice-btn ${isListening ? "ask-voice-btn--listening" : ""}`}
                      title="Voice input"
                      onClick={handleVoice}
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </button>
                    <button
                      className="ask-send-btn"
                      disabled={!askQuery.trim() || chatLoading}
                      onClick={() => sendHomeChat()}
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Sidebar>

      <style jsx>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        @keyframes pulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.6);
          }
          70% {
            transform: scale(1.15);
            box-shadow: 0 0 0 6px rgba(79, 70, 229, 0);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(79, 70, 229, 0);
          }
        }
        .page {
          height: 100vh;
          background:
            radial-gradient(
              circle at 15% 10%,
              rgba(91, 208, 255, 0.09),
              transparent 26%
            ),
            radial-gradient(
              circle at 85% 16%,
              rgba(199, 155, 255, 0.08),
              transparent 22%
            ),
            linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
          color: #f0f0f5;
          font-family: "Sora", sans-serif;
          opacity: 0;
          transform: translateY(8px);
          transition:
            opacity 0.4s ease,
            transform 0.4s ease;
          display: flex;
          flex-direction: column;
        }
        .page.mounted {
          opacity: 1;
          transform: none;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          flex-shrink: 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(8, 8, 16, 0.85);
          backdrop-filter: blur(12px);
        }
        .topbar-greeting {
          font-size: 15px;
          font-weight: 700;
          color: #e0e0f0;
        }
        .topbar-date {
          font-size: 11px;
          color: #555;
          margin-top: 2px;
        }
        .time-pill {
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #888;
          font-family: "JetBrains Mono", monospace;
        }
        .content-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 20px 24px 20px;
          gap: 14px;
          overflow: hidden;
          min-height: 0;
        }
        .hero-stats-row {
          display: flex;
          align-items: flex-start;
          gap: 20px;
          flex-shrink: 0;
        }
        .hero {
          flex: 1;
          min-width: 0;
          padding: 26px 28px;
          position: relative;
        }
        .hero-title {
          font-size: 34px;
          font-weight: 800;
          line-height: 1.05;
          margin-bottom: 12px;
          letter-spacing: -1px;
          max-width: 22ch;
        }
        .hero-accent {
          background: linear-gradient(90deg, #5bd0ff, #c79bff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-sub {
          font-size: 13px;
          color: #9ea8c7;
          line-height: 1.7;
          margin-bottom: 22px;
          font-weight: 400;
          max-width: 42ch;
        }
        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: linear-gradient(135deg, #6c63ff, #5bd0ff);
          color: white;
          border: none;
          border-radius: 14px;
          padding: 13px 22px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          box-shadow: 0 6px 24px rgba(91, 208, 255, 0.25);
          transition:
            transform 0.2s,
            box-shadow 0.2s;
        }
        .cta-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 32px rgba(91, 208, 255, 0.4);
        }
        .cta-btn--ghost {
          background: rgba(255, 255, 255, 0.06);
          box-shadow: none;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .stats-col {
          display: flex;
          flex-direction: column;
          gap: 10px;
          flex-shrink: 0;
          width: 150px;
        }
        .stat-card {
          position: relative;
          overflow: hidden;
          background: linear-gradient(
            160deg,
            rgba(19, 30, 70, 0.96),
            rgba(9, 14, 32, 0.96)
          );
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          padding: 16px 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .stat-num {
          font-size: 26px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          color: #5bd0ff;
        }
        .stat-label {
          font-size: 10px;
          color: #62739f;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .ask-section {
          flex: 1;
          display: flex;
          min-height: 0;
        }
        .ask-box-wrap {
          flex: 1;
          display: flex;
          min-height: 0;
          position: relative;
        }
        .ask-cartoon {
          position: absolute;
          right: 24px;
          bottom: 100%;
          margin-bottom: -38px;
          width: 88px;
          height: auto;
          z-index: 10;
          pointer-events: none;
          overflow: visible;
        }
        .ask-box {
          flex: 1;
          display: flex;
          flex-direction: column;
          background:
            radial-gradient(
              circle at 80% 0%,
              rgba(199, 155, 255, 0.07),
              transparent 40%
            ),
            linear-gradient(
              180deg,
              rgba(17, 22, 45, 0.95),
              rgba(7, 10, 23, 0.98)
            );
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 22px;
          overflow: hidden;
          min-height: 0;
        }
        .ask-header {
          padding: 14px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
        }
        .ask-title {
          font-size: 14px;
          font-weight: 700;
          color: #e0e0f0;
        }
        .ask-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          padding: 11px 18px;
          flex-shrink: 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .ask-chip {
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(91, 208, 255, 0.07);
          border: 1px solid rgba(91, 208, 255, 0.18);
          color: #7dd3fc;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .ask-messages {
          flex: 1;
          overflow-y: auto;
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ask-bubble-row {
          display: flex;
          width: 100%;
        }
        .ask-bubble-row--user {
          justify-content: flex-end;
        }
        .ask-bubble {
          max-width: 78%;
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 12px;
          line-height: 1.6;
        }
        .ask-bubble--user {
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          color: #fff;
          border-top-right-radius: 4px;
        }
        .ask-bubble--ai {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #d9d9eb;
          border-top-left-radius: 4px;
        }

        .ask-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #6c63ff;
          animation: askTyping 1s ease-in-out infinite;
        }
        @keyframes askTyping {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
        .ask-input-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.03);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .ask-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: #e0e0f0;
          font-size: 14px;
        }
        .ask-icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #555;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ask-voice-btn--listening {
          background: rgba(67, 233, 123, 0.15) !important;
          border-color: #43e97b !important;
          color: #43e97b !important;
          animation: voicePulse 0.8s ease-in-out infinite alternate;
        }
        @keyframes voicePulse {
          from {
            box-shadow: 0 0 0 0 rgba(67, 233, 123, 0.4);
          }
          to {
            box-shadow: 0 0 0 6px rgba(67, 233, 123, 0);
          }
        }
        .ask-send-btn {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          color: #fff;
          border: none;
          cursor: pointer;
        }

        @media (max-width: 900px) {
          .hero-stats-row {
            flex-direction: column;
          }
          .stats-col {
            width: 100%;
            flex-direction: row;
          }
          .stat-card {
            flex: 1;
            border-left: none;
            border-top: 3px solid var(--accent);
          }
          .page {
            height: auto;
            min-height: 100vh;
          }
          .content-area {
            overflow: auto;
          }
        }
      `}</style>
    </>
  );
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
      style={{
        marginTop: "6px",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      }}
    >
      {/* 🔊 ICON */}
      <span
        onClick={() => {
          if (!audioRef.current) return;

          if (isPlaying) {
            audioRef.current.pause();
          } else {
            audioRef.current.play();
          }
        }}
        style={{
          cursor: "pointer",
          fontSize: "13px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "28px",
          height: "28px",
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

      {/* hidden audio */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        controls={false}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* speaking text */}
      {isPlaying && (
        <span style={{ fontSize: "10px", opacity: 0.7 }}>Speaking...</span>
      )}
    </div>
  );
}

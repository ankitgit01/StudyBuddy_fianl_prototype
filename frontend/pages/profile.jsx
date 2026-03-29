import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { getNotes, getDNA, getWellness } from "../services/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEFAULT_TOKEN = "prototype_default_token";

// ─── DNA Theme Mapping (Matches GYAANI Intelligence Palette) ───
const DNA_CONFIG = {
  "The Achiever": { accent: "#FFD700", glow: "rgba(255,215,0,0.25)" },
  "The Hustler": { accent: "#43E97B", glow: "rgba(67,233,123,0.25)" },
  "The Curious Mind": { accent: "#4FACFE", glow: "rgba(79,172,254,0.25)" },
  "The Comeback Kid": { accent: "#FF6B6B", glow: "rgba(255,107,107,0.25)" },
  "The Deep Thinker": { accent: "#A78BFA", glow: "rgba(167,139,250,0.25)" },
  "The Consistent Scholar": {
    accent: "#38f9d7",
    glow: "rgba(56,249,215,0.25)",
  },
  "The Explorer": { accent: "#6C63FF", glow: "rgba(108,99,255,0.25)" },
};

// ─── Loading Component (Exact Sync with notes.jsx) ───
function LoadingScreen({
  message = "Synthesizing Profile...",
  subMessage = "Syncing your neural data",
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
        {/* Layer 1: Static Outer Ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1.5px solid rgba(108,99,255,0.15)",
          }}
        />
        {/* Layer 2: Fast Outer Spin */}
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
        {/* Layer 3: Static Mid Ring */}
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1.5px solid rgba(91,208,255,0.2)",
          }}
        />
        {/* Layer 4: Reverse Inner Spin */}
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1.5px solid transparent",
            borderTopColor: "#5bd0ff",
            animation: "spin 1.4s linear infinite reverse",
          }}
        />
        {/* Layer 5: Inner Core Glow */}
        <div
          style={{
            position: "absolute",
            inset: 20,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(108,99,255,0.4), transparent)",
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

function toIsoDateFromDays(daysToExam) {
  const days = Math.max(1, Number(daysToExam || 0));
  if (!days) return "";
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDaysToExamFromDate(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exam = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(exam.getTime())) return null;
  return Math.max(1, Math.round((exam - today) / 86400000));
}

function cacheUserProfileSnapshot(profile = {}) {
  try {
    const currentProfile = JSON.parse(
      localStorage.getItem("gyaani_user_profile") || "{}",
    );
    const nextProfile = { ...currentProfile, ...profile };
    localStorage.setItem("gyaani_user_profile", JSON.stringify(nextProfile));

    const currentUser = JSON.parse(localStorage.getItem("gyaani_user") || "{}");
    localStorage.setItem(
      "gyaani_user",
      JSON.stringify({
        ...currentUser,
        ...nextProfile,
        user_id: nextProfile.user_id || currentUser.user_id,
      }),
    );
    window.dispatchEvent(
      new CustomEvent("gyaani:user-profile-updated", { detail: nextProfile }),
    );
  } catch {}
}

export default function AdvancedProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [user, setUser] = useState({ name: "Learner" });
  const [data, setData] = useState({ notes: [], dna: null, wellness: null });
  const [examDate, setExamDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    setVisible(true);
    const stored = JSON.parse(localStorage.getItem("gyaani_user") || "{}");
    const storedProfile = JSON.parse(
      localStorage.getItem("gyaani_user_profile") || "{}",
    );
    if (stored.name) setUser({ name: stored.name });

    const initialExamDate =
      storedProfile.days_to_exam != null
        ? toIsoDateFromDays(storedProfile.days_to_exam)
        : storedProfile.predict_params?.days_to_exam != null
          ? toIsoDateFromDays(storedProfile.predict_params.days_to_exam)
          : storedProfile.exam_date || "";
    if (initialExamDate) setExamDate(initialExamDate);

    const token = localStorage.getItem("token") || DEFAULT_TOKEN;

    Promise.allSettled([
      getNotes(),
      getDNA(),
      getWellness(),
      fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => (res.ok ? res.json() : null)),
    ]).then(([n, d, w, profileResult]) => {
      if (cancelled) return;
      const profile =
        profileResult.status === "fulfilled" ? profileResult.value : null;
      if (profile) {
        cacheUserProfileSnapshot(profile);
        const profileExamDate =
          profile.days_to_exam != null
            ? toIsoDateFromDays(profile.days_to_exam)
            : profile.predict_params?.days_to_exam != null
              ? toIsoDateFromDays(profile.predict_params.days_to_exam)
              : profile.exam_date || "";
        if (profileExamDate) setExamDate(profileExamDate);
        if (profile.name) {
          setUser((prev) => ({ ...prev, name: profile.name }));
        }
      }

      setData({
        notes: n.status === "fulfilled" ? n.value : [],
        dna: d.status === "fulfilled" ? d.value : null,
        wellness: w.status === "fulfilled" ? w.value : null,
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExamDate = async (date) => {
    setExamDate(date);
    const daysToExam = getDaysToExamFromDate(date);
    if (daysToExam == null) return;

    const profile = JSON.parse(localStorage.getItem("gyaani_user_profile") || "{}");
    const token = localStorage.getItem("token") || DEFAULT_TOKEN;

    try {
      const res = await fetch(`${API_BASE_URL}/auth/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subjects: profile.subjects || [],
          language: profile.language || "hi-en",
          exam_date: date,
          days_to_exam: daysToExam,
        }),
      });

      if (!res.ok) throw new Error("Failed to update exam date");

      const payload = await res.json();
      cacheUserProfileSnapshot({
        ...profile,
        exam_date: payload.exam_date || date,
        days_to_exam: payload.days_to_exam ?? daysToExam,
        predict_params: {
          ...(profile.predict_params || {}),
          days_to_exam: payload.days_to_exam ?? daysToExam,
        },
      });
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return <LoadingScreen />;

  const theme = DNA_CONFIG[data.dna?.profile] || DNA_CONFIG["The Explorer"];
  const daysLeft = getDaysToExamFromDate(examDate);

  return (
    <div
      className={`screen ${visible ? "screen--in" : ""}`}
      style={{ "--active-accent": theme.accent, "--active-glow": theme.glow }}
    >
      <Head>
        <title>Intelligence Profile | GYAANI AI</title>
      </Head>

      {/* Ambient layers (Synced with notes.jsx) */}
      <div className="nebula nebula-a" />
      <div className="nebula nebula-b" />
      <div className="subject-aura" />

      {/* ══ HEADER ══ */}
      <header className="hdr">
        <button className="back-btn" onClick={() => router.back()}>
          ←
        </button>
        <div className="hdr-center">
          <h2 className="hdr-title">Intelligence Profile</h2>
        </div>
        <div className="hdr-status">
          <span className="status-dot" />
          LIVE
        </div>
      </header>

      <div className="body">
        {/* ══ IDENTITY HERO ══ */}
        <section className="identity-card">
          <div className="identity-orb">
            <span className="orb-emoji">{data.dna?.emoji || "🧬"}</span>
            <div className="orb-pulse" />
          </div>
          <div className="identity-info">
            <div className="dna-tag-row">
              <span className="dna-tag">
                {data.dna?.profile || "Mapping Mind..."}
              </span>
              {data.wellness?.streak_days > 0 && (
                <span className="streak-tag">
                  🔥 {data.wellness.streak_days}D Streak
                </span>
              )}
            </div>
            <h1 className="display-name">{user.name}</h1>
            <p className="display-sub">
              Neural Architecture: {data.dna?.dominant_style || "Standard"}{" "}
              Learner
            </p>
          </div>
        </section>

        {/* ══ ANALYTICS GRID ══ */}
        <div className="metrics-row">
          <MetricBox
            label="Library Size"
            val={data.notes.length}
            unit="Notes"
            color="#6C63FF"
          />
          <MetricBox
            label="Learning Focus"
            val={`${Math.round(data.wellness?.avg_quiz_score || 0)}%`}
            unit="Score"
            color="#43E97B"
          />
          <MetricBox
            label="Clarity Level"
            val={
              data.wellness?.confusion_score
                ? `${Math.round((1 - data.wellness.confusion_score) * 100)}%`
                : "80%"
            }
            unit="Clear"
            color="#FFB300"
          />
        </div>

        {/* ══ EXAM ENGINE ══ */}
        <div className="feature-card exam-engine">
          <div className="card-overlay" />
          <div className="exam-text">
            <h3>Exam Date</h3>
            <input
              type="date"
              className="advanced-input"
              value={examDate}
              onChange={(e) => handleExamDate(e.target.value)}
            />
          </div>
          <div className="exam-countdown">
            <span className="cd-val">
              {daysLeft !== null ? daysLeft : "--"}
            </span>
            <span className="cd-key">Days Left</span>
          </div>
        </div>

        {/* ══ MODULE NAVIGATION (The "Advanced" Features) ══ */}
        <p className="section-label">Active Modules</p>
        <div className="module-grid">
          <ModuleBtn
            icon="🧬"
            label="Study DNA"
            sub="Mental mapping"
            path="/dna"
            color="#4FACFE"
          />
          <ModuleBtn
            icon="🔥"
            label="Heatmaps"
            sub="Confusion zones"
            path="/heatmap"
            color="#FF6B6B"
          />
          <ModuleBtn
            icon="🧘"
            label="Wellness"
            sub="Stress scores"
            path="/wellness"
            color="#38f9d7"
          />
          <ModuleBtn
            icon="🌌"
            label="Constellation"
            sub="Map Graphs"
            path="/constellation"
            color="#A78BFA"
          />
        </div>

        {/* ══ SUBJECT DOMAINS ══ */}
        <section className="domains-section">
          <p className="section-label">Knowledge Domains</p>
          <div className="domain-chips">
            {[...new Set(data.notes.map((n) => n.subject))]
              .filter(Boolean)
              .map((sub) => (
                <span key={sub} className="domain-chip">
                  <span className="dot" /> {sub}
                </span>
              ))}
          </div>
        </section>
      </div>

      <style jsx>{`
        .screen {
          position: relative;
          min-height: 100vh;
          background: #05070f;
          font-family: "Sora", sans-serif;
          color: #f8fbff;
          opacity: 0;
          transform: translateY(14px);
          transition: all 0.4s;
          padding-bottom: 60px;
        }
        .screen--in {
          opacity: 1;
          transform: none;
        }

        /* Ambient (Shared with notes.jsx) */
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
        .subject-aura {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background: radial-gradient(
            ellipse 55% 28% at 50% 0%,
            var(--active-glow),
            transparent 70%
          );
        }

        .hdr {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 14px 20px;
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(5, 8, 18, 0.85);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .hdr-center {
          flex: 1;
        }
        .hdr-kicker {
          font-size: 9px;
          letter-spacing: 2px;
          color: var(--active-accent);
          font-weight: 800;
          display: block;
        }
        .hdr-title {
          font-size: 16px;
          font-weight: 800;
        }
        .back-btn {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: white;
          cursor: pointer;
        }
        .hdr-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 800;
          color: #43e97b;
          padding: 6px 12px;
          background: rgba(67, 233, 123, 0.1);
          border-radius: 20px;
        }
        .status-dot {
          width: 6px;
          height: 6px;
          background: #43e97b;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .body {
          max-width: 800px;
          margin: 0 auto;
          padding: 30px 20px;
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* Hero */
        .identity-card {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 20px 0;
        }
        .identity-orb {
          width: 85px;
          height: 85px;
          background: rgba(255, 255, 255, 0.03);
          border: 2.5px solid var(--active-accent);
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          box-shadow: 0 0 30px var(--active-glow);
        }
        .orb-emoji {
          font-size: 44px;
          z-index: 2;
        }
        .orb-pulse {
          position: absolute;
          inset: -5px;
          border: 1px dashed var(--active-accent);
          border-radius: 28px;
          opacity: 0.3;
          animation: spin 15s linear infinite;
        }

        .dna-tag-row {
          display: flex;
          gap: 10px;
          margin-bottom: 6px;
        }
        .dna-tag {
          font-size: 10px;
          font-weight: 800;
          color: var(--active-accent);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .streak-tag {
          font-size: 10px;
          font-weight: 800;
          color: #ffb300;
          background: rgba(255, 179, 0, 0.1);
          padding: 2px 8px;
          border-radius: 10px;
        }
        .display-name {
          font-size: 34px;
          font-weight: 800;
          letter-spacing: -1px;
          margin-bottom: 4px;
        }
        .display-sub {
          font-size: 12px;
          color: #62739f;
        }

        /* Metrics */
        .metrics-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }

        /* Action Center */
        .feature-card {
          position: relative;
          background: #0c0e18;
          border-radius: 24px;
          padding: 25px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .card-overlay {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            circle at 100% 50%,
            var(--active-glow),
            transparent 60%
          );
          pointer-events: none;
        }
        .exam-text h3 {
          font-size: 18px;
          margin-bottom: 4px;
        }
        .exam-text p {
          font-size: 12px;
          color: #62739f;
          margin-bottom: 15px;
        }
        .advanced-input {
          background: #121520;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 10px 15px;
          color: white;
          font-family: inherit;
          color-scheme: dark;
          outline: none;
        }
        .exam-countdown {
          text-align: center;
          background: rgba(255, 255, 255, 0.03);
          padding: 15px;
          border-radius: 18px;
          min-width: 90px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .cd-val {
          display: block;
          font-size: 30px;
          font-weight: 800;
          font-family: "JetBrains Mono";
          line-height: 1;
          color: var(--active-accent);
        }
        .cd-key {
          font-size: 9px;
          font-weight: 700;
          color: #555;
          text-transform: uppercase;
          margin-top: 5px;
        }

        .module-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }
        .section-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 2px;
          color: #404058;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        /* Domains */
        .domain-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .domain-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 8px 14px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
        }
        .chip-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--active-accent);
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
            opacity: 0.5;
          }
        }

        @media (max-width: 600px) {
          .metrics-row {
            grid-template-columns: 1fr;
          }
          .module-grid {
            grid-template-columns: 1fr;
          }
          .display-name {
            font-size: 26px;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-Components ───

function MetricBox({ label, val, unit, color }) {
  return (
    <div className="met-box" style={{ "--c": color }}>
      <p className="met-label">{label}</p>
      <h3 className="met-val">
        {val} <span className="met-unit">{unit}</span>
      </h3>
      <style jsx>{`
        .met-box {
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.04),
            rgba(255, 255, 255, 0.01)
          );
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 20px;
          border-radius: 20px;
          border-top: 3px solid var(--c);
        }
        .met-label {
          font-size: 10px;
          font-weight: 700;
          color: #62739f;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .met-val {
          font-size: 24px;
          font-weight: 800;
          font-family: "JetBrains Mono";
          color: var(--c);
        }
        .met-unit {
          font-size: 10px;
          color: #404058;
          margin-left: 2px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

function ModuleBtn({ icon, label, sub, path, color }) {
  const router = useRouter();
  return (
    <button
      className="mod-btn"
      onClick={() => router.push(path)}
      style={{ "--c": color }}
    >
      <div className="mod-icon">{icon}</div>
      <div className="mod-content">
        <p className="mod-label">{label}</p>
        <p className="mod-sub">{sub}</p>
      </div>
      <span className="mod-arrow">→</span>
      <style jsx>{`
        .mod-btn {
          display: flex;
          align-items: center;
          gap: 14px;
          text-align: left;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          padding: 16px;
          border-radius: 20px;
          cursor: pointer;
          transition: 0.2s;
          position: relative;
          overflow: hidden;
        }
        .mod-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          transform: translateY(-3px);
          border-color: var(--c);
        }
        .mod-icon {
          font-size: 24px;
          filter: drop-shadow(0 0 10px var(--c));
        }
        .mod-label {
          font-size: 14px;
          font-weight: 800;
          color: white;
          margin: 0;
        }
        .mod-sub {
          font-size: 10px;
          color: #62739f;
          margin: 0;
        }
        .mod-arrow {
          margin-left: auto;
          font-weight: 800;
          color: var(--c);
          opacity: 0.5;
        }
      `}</style>
    </button>
  );
}

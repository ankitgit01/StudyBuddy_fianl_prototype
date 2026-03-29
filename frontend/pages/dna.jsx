// ─────────────────────────────────────────────────────────────
//  GYAANI AI — Study DNA Page
//  File: frontend/pages/dna.jsx
//  Theme: pixel-perfect match with constellation.jsx
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { getAllHeatmaps } from "../services/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEFAULT_TOKEN = "prototype_default_token";
const DEFAULT_USER_ID = "2b871b4a-fb6b-49be-82ca-d7aa244fdc65";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("token") || DEFAULT_TOKEN
    : DEFAULT_TOKEN;
}
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ── Profile color → glow ──────────────────────────────────────
const GLOW_MAP = {
  "#FFD700": "rgba(255,215,0,0.32)",
  "#43E97B": "rgba(67,233,123,0.32)",
  "#4FACFE": "rgba(79,172,254,0.32)",
  "#FF6B6B": "rgba(255,107,107,0.32)",
  "#A78BFA": "rgba(167,139,250,0.32)",
  "#38f9d7": "rgba(56,249,215,0.32)",
  "#6C63FF": "rgba(108,99,255,0.32)",
};

const PROFILE_COLORS = {
  "The Achiever": "#FFD700",
  "The Hustler": "#43E97B",
  "The Curious Mind": "#4FACFE",
  "The Comeback Kid": "#FF6B6B",
  "The Deep Thinker": "#A78BFA",
  "The Consistent Scholar": "#38f9d7",
  "The Explorer": "#6C63FF",
};

// ── Signal display config ─────────────────────────────────────
const SIGNAL_CONFIG = [
  {
    key: "avg_quiz_score",
    label: "Quiz Score",
    fmt: (v) => `${Math.round(v)}%`,
    icon: "🎯",
  },
  { key: "login_streak", label: "Streak", fmt: (v) => `${v}d`, icon: "🔥" },
  {
    key: "total_study_minutes",
    label: "Study Time",
    fmt: (v) => `${Math.round(v)}m`,
    icon: "⏱️",
  },
  { key: "upload_count", label: "Notes", fmt: (v) => v, icon: "📝" },
  { key: "audio_replays", label: "Audio", fmt: (v) => `${v}×`, icon: "🎙️" },
  { key: "quiz_attempts", label: "Quizzes", fmt: (v) => v, icon: "📋" },
  { key: "heatmap_views", label: "Heatmaps", fmt: (v) => v, icon: "🔥" },
  { key: "subjects_count", label: "Subjects", fmt: (v) => v, icon: "📚" },
  {
    key: "concepts_completed",
    label: "Concepts Done",
    fmt: (v) => v,
    icon: "✅",
  },
  // {
  //   key: "mean_confusion",
  //   label: "Clarity",
  //   fmt: (v) => `${Math.round((1 - v) * 100)}%`,
  //   icon: "💡",
  // },
];

export default function DNAPage() {
  const router = useRouter();
  const [dna, setDNA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("profile");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const uid = localStorage.getItem("user_id") || DEFAULT_USER_ID;
    Promise.all([
      fetch(`${BASE_URL}/notes/dna/${uid}`, { headers: authHeaders() }).then((r) =>
        r.json(),
      ),
      getAllHeatmaps(uid).catch(() => []),
    ])
      .then(([d, heatmaps]) => {
        const heatmapCount = Array.isArray(heatmaps) ? heatmaps.length : 0;
        const nextDNA = {
          ...d,
          signals_used: {
            ...(d?.signals_used || {}),
            heatmap_views: heatmapCount,
          },
        };
        setDNA(nextDNA);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (!mounted || loading) return <Spinner />;
  if (!dna) return <Empty onBack={() => router.back()} />;

  const color = dna.color || "#6C63FF";
  const glow = GLOW_MAP[color] || "rgba(108,99,255,0.28)";
  const probs = dna.probabilities || {};
  const signals = dna.signals_used || {};
  const topFeats = dna.top_features ? Object.entries(dna.top_features) : [];
  const sortedProbs = Object.entries(probs).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <Head>
        <title>Study DNA — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="screen">
        {/* ── HEADER ─────────────────────────────────────── */}
        <header className="hdr">
          <button className="back-btn" onClick={() => router.back()}>
            ←
          </button>
          <div style={{ flex: 1 }}>
            <span className="hdr-title">Study DNA</span>
            <span className="hdr-sub">Your personalised learning identity</span>
          </div>
          <div className="subject-chip" style={{ borderColor: glow, color }}>
            {dna.emoji} {dna.profile}
          </div>
        </header>

        <div className="body">
          {/* ── HERO CARD ──────────────────────────────────── */}
          <section
            className="hero-card"
            style={{
              borderColor: `${color}33`,
              boxShadow: `0 30px 90px ${glow}`,
            }}
          >
            {/* nebula glow behind orb */}
            <div
              className="hero-nebula"
              style={{
                background: `radial-gradient(circle at 50% 30%, ${glow}, transparent 60%)`,
              }}
            />

            {/* Floating orb */}
            <div className="orb-scene">
              {/* rings */}
              <div
                className="ring ring-1"
                style={{ borderColor: `${color}28` }}
              />
              <div
                className="ring ring-2"
                style={{ borderColor: `${color}1a` }}
              />
              <div
                className="ring ring-3"
                style={{ borderColor: `${color}10` }}
              />
              {/* satellite orbit */}
              <div
                className="satellite-track"
                style={{ borderColor: `${color}30` }}
              >
                <div
                  className="satellite-dot"
                  style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                />
              </div>
              {/* core */}
              <div
                className="orb-core"
                style={{
                  background: `radial-gradient(circle at 35% 35%, ${color}40, ${color}15 55%, transparent)`,
                  boxShadow: `0 0 40px ${glow}, 0 0 80px ${glow}`,
                  border: `1px solid ${color}55`,
                }}
              >
                <span className="orb-emoji">{dna.emoji}</span>
              </div>
            </div>

            {/* Text */}
            <div className="hero-copy">
              <p className="hero-kicker">YOUR DNA PROFILE</p>
              <h1 className="hero-name" style={{ color }}>
                {dna.profile}
              </h1>
              <p className="hero-tagline">{dna.tagline}</p>
            </div>

            {/* Confidence / beginner pill */}
            {dna.is_beginner ? (
              <div
                className="info-pill"
                style={{ borderColor: `${color}33`, color: "#8e98bc" }}
              >
                🌱 Upload 3+ notes to unlock your true profile
              </div>
            ) : (
              <div
                className="info-pill"
                style={{ borderColor: `${color}44`, color }}
              >
                <span className="pulse-dot" style={{ background: color }} />
                {Math.round((dna.confidence || 0) * 100)}% match confidence
              </div>
            )}
          </section>

          {/* ── TABS ───────────────────────────────────────── */}
          <div className="tabs-strip">
            {[
              { id: "profile", label: "Profile", icon: "🧬" },
              { id: "breakdown", label: "Breakdown", icon: "📊" },
              { id: "tips", label: "Tips", icon: "💡" },
            ].map((t) => (
              <button
                key={t.id}
                className={`tab-pill ${tab === t.id ? "tab-pill--on" : ""}`}
                style={
                  tab === t.id
                    ? {
                        background: `${color}18`,
                        borderColor: `${color}44`,
                        color,
                      }
                    : {}
                }
                onClick={() => setTab(t.id)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ── TAB: PROFILE ───────────────────────────────── */}
          {tab === "profile" && (
            <div className="tab-body">
              {/* Strengths */}
              <div className="panel">
                <p className="section-label">✦ Your Strengths</p>
                <div className="strengths-grid">
                  {(dna.strengths || []).map((s, i) => (
                    <div
                      key={i}
                      className="strength-card"
                      style={{
                        animationDelay: `${i * 0.07}s`,
                        background: `radial-gradient(circle at top left, ${color}0d, transparent 50%), rgba(255,255,255,0.02)`,
                        borderColor: `${color}22`,
                      }}
                    >
                      <div
                        className="strength-num"
                        style={{ background: `${color}22`, color }}
                      >
                        {i + 1}
                      </div>
                      <p className="strength-text">{s}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Study signals */}
              {Object.keys(signals).length > 0 && (
                <div className="panel">
                  <p className="section-label">✦ Your Study Signals</p>
                  <div className="signals-grid">
                    {SIGNAL_CONFIG.filter(
                      (c) => signals[c.key] !== undefined,
                    ).map((c) => (
                      <div
                        key={c.key}
                        className="signal-card"
                        style={{ borderColor: `${color}18` }}
                      >
                        <span className="signal-icon">{c.icon}</span>
                        <span className="signal-val" style={{ color }}>
                          {c.fmt(signals[c.key])}
                        </span>
                        <span className="signal-label">{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: BREAKDOWN ─────────────────────────────── */}
          {tab === "breakdown" && (
            <div className="tab-body">
              <div className="panel">
                <p className="section-label">✦ Profile Match Scores</p>
                <p className="panel-sub">
                  How strongly you match each DNA profile
                </p>
                <div className="probs-list">
                  {sortedProbs.map(([name, val], i) => {
                    const pc = PROFILE_COLORS[name] || "#6C63FF";
                    const isOn = name === dna.profile;
                    const pct = Math.round(val * 100);
                    return (
                      <div
                        key={name}
                        className={`prob-row ${isOn ? "prob-row--on" : ""}`}
                        style={
                          isOn
                            ? { borderColor: `${pc}33`, background: `${pc}0a` }
                            : {}
                        }
                      >
                        <div className="prob-left">
                          <span className="prob-emoji">
                            {["🏆", "💪", "🔭", "🔥", "🧠", "⭐", "🌱"][i] ||
                              "●"}
                          </span>
                          <span
                            className="prob-name"
                            style={isOn ? { color: pc } : {}}
                          >
                            {name}
                          </span>
                          {isOn && (
                            <span
                              className="prob-you"
                              style={{ background: `${pc}22`, color: pc }}
                            >
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="prob-track">
                          <div
                            className="prob-fill"
                            style={{
                              width: `${pct}%`,
                              background: isOn
                                ? `linear-gradient(90deg, ${pc}, ${pc}88)`
                                : "rgba(255,255,255,0.10)",
                              boxShadow: isOn ? `0 0 10px ${pc}66` : "none",
                            }}
                          />
                        </div>
                        <span
                          className="prob-pct"
                          style={{ color: isOn ? pc : "#62739f" }}
                        >
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top features */}
              {topFeats.length > 0 && (
                <div className="panel">
                  <p className="section-label">✦ What Shaped Your Profile</p>
                  <p className="panel-sub">Top signals we analysed</p>
                  <div className="feats-list">
                    {topFeats.map(([feat, imp], i) => (
                      <div
                        key={feat}
                        className="feat-row"
                        style={{ animationDelay: `${i * 0.08}s` }}
                      >
                        <div
                          className="feat-rank"
                          style={{ background: `${color}22`, color }}
                        >
                          #{i + 1}
                        </div>
                        <div className="feat-info">
                          <p className="feat-name">
                            {feat
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase())}
                          </p>
                          <div className="feat-track">
                            <div
                              className="feat-fill"
                              style={{
                                width: `${Math.min(100, Math.round(imp * 600))}%`,
                                background: color,
                                boxShadow: `0 0 6px ${color}88`,
                              }}
                            />
                          </div>
                        </div>
                        <span className="feat-pct" style={{ color }}>
                          {(imp * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: TIPS ──────────────────────────────────── */}
          {tab === "tips" && (
            <div className="tab-body">
              <div className="panel">
                <p className="section-label">✦ Personalised Tips</p>
                <p className="panel-sub">
                  AI-generated based on your real study data
                </p>
                <div className="tips-list">
                  {(dna.tips || []).map((tip, i) => (
                    <div
                      key={i}
                      className="tip-card"
                      style={{
                        animationDelay: `${i * 0.08}s`,
                        background: `radial-gradient(circle at top left, ${color}0d, transparent 50%), rgba(255,255,255,0.02)`,
                        borderColor: `${color}28`,
                      }}
                    >
                      <div
                        className="tip-num"
                        style={{ background: `${color}22`, color }}
                      >
                        {i + 1}
                      </div>
                      <p className="tip-text">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA buttons */}
              <div
                className="cta-grid"
                style={{ display: "flex", justifyContent: "center" }}
              >
                <button
                  className="cta-btn"
                  style={{
                    background: `linear-gradient(160deg, rgba(${color === "#FFD700" ? "255,215,0" : color === "#43E97B" ? "67,233,123" : "108,99,255"},0.18), rgba(6,9,18,0.96))`,
                    borderColor: `${color}44`,
                    color,
                    boxShadow: `0 16px 34px ${glow}`,
                  }}
                  onClick={() => router.push("/upload")}
                >
                  <span className="cta-icon">📸</span>
                  <span className="cta-label">Upload a Note</span>
                  <span className="cta-sub">Improve your DNA accuracy</span>
                </button>
              </div>
            </div>
          )}

          {/* Updated at */}
          {dna.updated_at && (
            <p className="updated-at">
              Last updated ·{" "}
              {new Date(dna.updated_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </div>

      <style jsx>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .screen {
          min-height: 100vh;
          color: #f8fbff;
          font-family: "Sora", sans-serif;
          background:
            radial-gradient(
              circle at 15% 10%,
              rgba(91, 208, 255, 0.12),
              transparent 24%
            ),
            radial-gradient(
              circle at 85% 16%,
              rgba(199, 155, 255, 0.1),
              transparent 18%
            ),
            linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
          padding-bottom: 60px;
        }

        /* Header — identical to constellation */
        .hdr {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          position: sticky;
          top: 0;
          z-index: 40;
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
        .subject-chip {
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }

        /* Body */
        .body {
          max-width: 680px;
          margin: 0 auto;
          padding: 28px 16px 40px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Hero card */
        .hero-card {
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          padding: 36px 24px 28px;
          background:
            radial-gradient(
              circle at top left,
              rgba(91, 208, 255, 0.1),
              transparent 34%
            ),
            radial-gradient(
              circle at bottom right,
              rgba(199, 155, 255, 0.12),
              transparent 28%
            ),
            linear-gradient(
              180deg,
              rgba(17, 22, 45, 0.96),
              rgba(7, 10, 23, 0.98)
            );
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          text-align: center;
        }
        .hero-nebula {
          position: absolute;
          inset: 0;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0.65;
        }

        /* Orb */
        .orb-scene {
          position: relative;
          width: 140px;
          height: 140px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid;
          animation: ringPulse 3s ease-in-out infinite;
        }
        .ring-1 {
          width: 80px;
          height: 80px;
          animation-delay: 0s;
        }
        .ring-2 {
          width: 108px;
          height: 108px;
          animation-delay: 0.6s;
        }
        .ring-3 {
          width: 136px;
          height: 136px;
          animation-delay: 1.2s;
        }
        @keyframes ringPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.05);
            opacity: 1;
          }
        }
        .satellite-track {
          position: absolute;
          width: 124px;
          height: 124px;
          border-radius: 50%;
          border: 1px dashed;
          animation: spinSat 7s linear infinite;
        }
        @keyframes spinSat {
          to {
            transform: rotate(360deg);
          }
        }
        .satellite-dot {
          position: absolute;
          top: -5px;
          left: 50%;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          transform: translateX(-50%);
        }
        .orb-core {
          width: 74px;
          height: 74px;
          border-radius: 50%;
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: floatCore 4s ease-in-out infinite;
        }
        @keyframes floatCore {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-7px);
          }
        }
        .orb-emoji {
          font-size: 34px;
          position: relative;
          z-index: 1;
        }

        /* Hero copy */
        .hero-copy {
          position: relative;
          z-index: 1;
        }
        .hero-kicker {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #62739f;
          margin-bottom: 10px;
        }
        .hero-name {
          font-size: 32px;
          font-weight: 900;
          letter-spacing: -0.5px;
          line-height: 1.05;
          margin-bottom: 12px;
        }
        .hero-tagline {
          font-size: 14px;
          color: #9aa7cf;
          line-height: 1.7;
          max-width: 38ch;
          margin: 0 auto;
        }

        /* Pill */
        .info-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 999px;
          border: 1px solid;
          font-size: 12px;
          font-weight: 700;
          position: relative;
          z-index: 1;
          background: rgba(255, 255, 255, 0.03);
        }
        .pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          animation: blink 1.4s ease-in-out infinite;
        }
        @keyframes blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }

        /* Tabs */
        .tabs-strip {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tab-pill {
          flex: 1;
          padding: 11px 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: #62739f;
          font-family: "Sora", sans-serif;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .tab-pill:hover {
          border-color: rgba(255, 255, 255, 0.16);
          color: #dbe2ff;
        }
        .tab-pill--on {
          font-weight: 800;
        }

        /* Tab body */
        .tab-body {
          display: flex;
          flex-direction: column;
          gap: 14px;
          animation: fadeUp 0.3s ease both;
        }
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        /* Panel — matches constellation composer/visual panels */
        .panel {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 22px;
          background: linear-gradient(
            180deg,
            rgba(12, 16, 33, 0.96),
            rgba(6, 9, 18, 0.98)
          );
          box-shadow: 0 24px 72px rgba(0, 0, 0, 0.28);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .section-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #62739f;
        }
        .panel-sub {
          font-size: 12px;
          color: #62739f;
          margin-top: -10px;
        }

        /* Strengths */
        .strengths-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .strength-card {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 16px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          animation: cardUp 0.35s ease both;
          transition:
            transform 0.16s ease,
            border-color 0.16s ease;
        }
        .strength-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.16);
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
        .strength-num {
          width: 30px;
          height: 30px;
          border-radius: 10px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 900;
        }
        .strength-text {
          font-size: 14px;
          color: #dbe2ff;
          line-height: 1.6;
          font-weight: 500;
        }

        /* Signals */
        .signals-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        @media (max-width: 460px) {
          .signals-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .signal-card {
          border-radius: 18px;
          padding: 14px 12px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.03);
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
          text-align: center;
          transition:
            transform 0.16s ease,
            border-color 0.16s ease;
        }
        .signal-card:hover {
          transform: translateY(-3px) scale(1.01);
          border-color: rgba(255, 255, 255, 0.14);
        }
        .signal-icon {
          font-size: 18px;
        }
        .signal-val {
          font-size: 20px;
          font-weight: 900;
          font-family: "JetBrains Mono", monospace;
        }
        .signal-label {
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #62739f;
        }

        /* Probabilities */
        .probs-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .prob-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid transparent;
          transition:
            background 0.15s,
            border-color 0.15s;
        }
        .prob-row--on {
        }
        .prob-left {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 200px;
          flex-shrink: 0;
        }
        .prob-emoji {
          font-size: 14px;
          flex-shrink: 0;
        }
        .prob-name {
          font-size: 12px;
          font-weight: 700;
          color: #9aa7cf;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .prob-you {
          font-size: 9px;
          font-weight: 900;
          padding: 2px 7px;
          border-radius: 999px;
          letter-spacing: 1px;
          flex-shrink: 0;
        }
        .prob-track {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 3px;
          overflow: hidden;
        }
        .prob-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .prob-pct {
          font-size: 11px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          width: 36px;
          text-align: right;
          flex-shrink: 0;
        }

        /* Top features */
        .feats-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .feat-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          animation: cardUp 0.35s ease both;
        }
        .feat-rank {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 900;
        }
        .feat-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .feat-name {
          font-size: 13px;
          font-weight: 700;
          color: #dbe2ff;
        }
        .feat-track {
          height: 4px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 2px;
          overflow: hidden;
        }
        .feat-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.6s ease;
        }
        .feat-pct {
          font-size: 11px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          flex-shrink: 0;
        }

        /* Tips */
        .tips-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .tip-card {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 16px;
          border-radius: 20px;
          border: 1px solid;
          animation: cardUp 0.35s ease both;
          transition: transform 0.16s ease;
        }
        .tip-card:hover {
          transform: translateY(-2px);
        }
        .tip-num {
          width: 30px;
          height: 30px;
          border-radius: 10px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 900;
        }
        .tip-text {
          font-size: 14px;
          color: #dbe2ff;
          line-height: 1.65;
          font-weight: 500;
        }

        /* CTA grid — matches constellation subject-card style */
        .cta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 460px) {
          .cta-grid {
            grid-template-columns: 1fr;
          }
        }
        .cta-btn {
          position: relative;
          overflow: hidden;
          text-align: left;
          padding: 20px 18px;
          border-radius: 22px;
          border: 1px solid;
          cursor: pointer;
          min-height: 110px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease;
          animation: cardUp 0.35s ease both;
        }
        .cta-btn:hover {
          transform: translateY(-4px) scale(1.01);
        }
        .cta-btn::before {
          content: "";
          position: absolute;
          inset: auto -20% -35% auto;
          width: 120px;
          height: 120px;
          border-radius: 999px;
          filter: blur(10px);
          opacity: 0.6;
          background: currentColor;
        }
        .cta-icon {
          font-size: 24px;
          position: relative;
          z-index: 1;
        }
        .cta-label {
          font-size: 15px;
          font-weight: 800;
          position: relative;
          z-index: 1;
        }
        .cta-sub {
          font-size: 11px;
          color: #9aa7cf;
          position: relative;
          z-index: 1;
          font-weight: 500;
        }

        /* Updated at */
        .updated-at {
          font-size: 11px;
          color: #62739f;
          text-align: center;
          font-family: "JetBrains Mono", monospace;
        }
      `}</style>
    </>
  );
}

function Spinner() {
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
        {/* Layer 1: Static Outer Subtle Ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1.5px solid rgba(108,99,255,0.15)",
          }}
        />
        {/* Layer 2: Fast Outer Primary Spin */}
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
            border: "1.5px solid rgba(91,231,162,0.2)",
          }}
        />
        {/* Layer 4: Reverse Inner Wellness Spin */}
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1.5px solid transparent",
            borderTopColor: "#5BE7A2",
            animation: "spin 1.4s linear infinite reverse",
          }}
        />
        {/* Layer 5: Inner Core Wellness Glow */}
        <div
          style={{
            position: "absolute",
            inset: 20,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(91,231,162,0.4), transparent)",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          textAlign: "center",
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
          Loading your DNA...
        </p>
        <p
          style={{ fontSize: 12, color: "#333360", fontWeight: 600, margin: 0 }}
        >
          Synthesizing cognitive load patterns
        </p>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function Empty({ onBack }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg,#05070f,#090d1b 38%,#060913 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        fontFamily: "Sora,sans-serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      <span style={{ fontSize: 52 }}>🧬</span>
      <p
        style={{
          fontSize: 16,
          color: "#dbe2ff",
          fontWeight: 700,
          maxWidth: "28ch",
          lineHeight: 1.5,
        }}
      >
        Upload 3+ notes to unlock your Study DNA profile
      </p>
      <p
        style={{
          fontSize: 13,
          color: "#62739f",
          maxWidth: "32ch",
          lineHeight: 1.6,
        }}
      >
        GYAANI AI will analyse your study behaviour and classify your unique
        learning identity.
      </p>
      <button
        onClick={onBack}
        style={{
          marginTop: 8,
          padding: "13px 28px",
          borderRadius: 14,
          background: "linear-gradient(135deg,#6C63FF,#8B5CF6)",
          color: "#fff",
          border: "none",
          fontFamily: "Sora,sans-serif",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(108,99,255,0.35)",
        }}
      >
        ← Go Back
      </button>
    </div>
  );
}

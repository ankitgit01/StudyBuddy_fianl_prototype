import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Make sure this path correctly points to your API service file
import { getWellness } from "../services/api";

const STRESS_CONFIG = {
  low: {
    color: "#5BE7A2",
    glow: "rgba(91,231,162,0.32)",
    label: "Calm momentum",
    summary:
      "Your pattern looks stable right now. The best move is to protect consistency instead of forcing extra intensity.",
    emoji: "🌱",
  },
  moderate: {
    color: "#FFBE55",
    glow: "rgba(255,190,85,0.32)",
    label: "Manageable pressure",
    summary:
      "Pressure is real, but still manageable. A tighter plan and a small reset should bring this down.",
    emoji: "⚖️",
  },
  high: {
    color: "#FF6B88",
    glow: "rgba(255,107,136,0.32)",
    label: "Recovery needed",
    summary:
      "Your signals show elevated pressure. Reduce load first, then work in shorter, clearer blocks.",
    emoji: "🔋",
  },
};

const FEATURE_LABELS = {
  days_to_exam: "Exam timeline",
  pending_subjects_count: "Pending subjects",
  subjects_active_today: "Context switching",
  total_study_minutes: "Study load",
  study_minutes_vs_7day_avg: "Cramming pressure",
  sessions_count: "Session volume",
  night_sessions: "Night study",
  early_morning_sessions: "Early study",
  days_since_last_break: "Break debt",
  notes_uploaded_today: "New note intake",
  total_notes_uploaded: "Material volume",
  reread_count: "Re-reading loop",
  avg_quiz_score: "Quiz accuracy",
  quiz_attempts_today: "Quiz repetition",
  quiz_difficulty_drop: "Difficulty drop",
  quiz_avg_time_per_question: "Slow questions",
  quiz_correct_streak_broken: "Streak break",
  quiz_llm_stress_signal: "Quiz stress tone",
  quiz_llm_confusion_keywords: "Quiz confusion language",
  confusion_score_today: "Note confusion",
  heatmap_red_ratio: "Heatmap intensity",
  max_page_confusion_score: "Hardest page",
  unvisited_topic_ratio: "Untouched syllabus",
  stale_constellation_topics: "Open backlog",
  chatbot_questions_today: "Chat usage",
  repeated_question_ratio: "Repeated doubts",
  chatbot_llm_stress_signal: "Chat stress tone",
  chatbot_llm_confusion_keywords: "Chat confusion language",
  explanation_revisit_count: "Explanation revisits",
  explanation_llm_stress_signal: "Explanation stress tone",
  explanation_llm_confusion_keywords: "Explanation confusion language",
  translation_used: "Translation reliance",
  audio_playback_loops: "Audio loops",
};

// Custom Tooltip for Recharts
function HistoryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="history-tooltip">
      <strong>{Number(point.score || 0).toFixed(2)}</strong>
      <br />
      <span>{point.label || point.day}</span>
      {"  "}
      <small>{point.time || "Daily aggregate"}</small>
    </div>
  );
}

// Enhanced SVG Gauge Component
function Gauge({ score, color, glow }) {
  const radius = 78;
  const arc = Math.PI * radius;
  const fill = Math.min(score / 100, 1) * arc;
  return (
    <div className="gauge-container" style={{ position: "relative" }}>
      <div
        className="gauge-glow"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${glow}, transparent 70%)`,
        }}
      />
      <svg
        width="220"
        height="130"
        viewBox="0 0 200 122"
        style={{ position: "relative", zIndex: 2 }}
      >
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5BE7A2" />
            <stop offset="50%" stopColor="#FFBE55" />
            <stop offset="100%" stopColor="#FF6B88" />
          </linearGradient>
          <filter id="gaugeBlur">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <path
          d={`M 22 100 A ${radius} ${radius} 0 0 1 178 100`}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <path
          d={`M 22 100 A ${radius} ${radius} 0 0 1 178 100`}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth="15"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${arc}`}
          style={{
            transition: "stroke-dasharray 1.4s cubic-bezier(.34,1.56,.64,1)",
          }}
        />
        <path
          d={`M 22 100 A ${radius} ${radius} 0 0 1 178 100`}
          fill="none"
          stroke={color}
          strokeOpacity="0.35"
          strokeWidth="22"
          strokeLinecap="round"
          filter="url(#gaugeBlur)"
          strokeDasharray={`${fill} ${arc}`}
          style={{
            transition: "stroke-dasharray 1.4s cubic-bezier(.34,1.56,.64,1)",
          }}
        />
        <text
          x="100"
          y="78"
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: 44,
            fontWeight: 800,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {Number(score || 0).toFixed(1)}
        </text>
        <text
          x="100"
          y="100"
          textAnchor="middle"
          fill="#8e98bc"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          stress score
        </text>
      </svg>
    </div>
  );
}

export default function WellnessPage() {
  const router = useRouter();
  const [wellness, setWellness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedPoint, setSelectedPoint] = useState(null);
  // const [visibleCount, setVisibleCount] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    getWellness()
      .then((data) => {
        setWellness(data);
        const firstDriver =
          Object.keys(data.feature_contributions || {})[0] ||
          data.top_stressor ||
          "";
        setSelectedDriver(firstDriver);
        const lastPoint = (data.stress_history || []).slice(-1)[0] || null;
        setSelectedPoint(lastPoint);
        setLoading(false);
      })
      .catch(() => {
        setError(
          "Could not load wellness data yet. Upload notes and engage with the platform to generate insights.",
        );
        setLoading(false);
      });
  }, []);

  const history = useMemo(
    () =>
      (wellness?.stress_history || []).map((item, index) => ({
        ...item,
        key: item.checked_at || `${item.day}-${index}`,
        chart_label: item.chart_label || item.label || item.day,
      })),
    [wellness],
  );
  // const visibleHistory = useMemo(() => {
  //   const total = history.length;
  //   const windowSize = Math.max(1, Math.min(visibleCount || total || 1, total || 1));
  //   return history.slice(-windowSize);
  // }, [history, visibleCount]);

  // useEffect(() => {
  //   setVisibleCount(history.length || 1);
  // }, [history.length]);

  useEffect(() => {
    const lastPoint = history.slice(-1)[0] || null;
    if (!lastPoint) return;
    if (
      !selectedPoint ||
      !history.some((item) => item.key === selectedPoint.key)
    ) {
      setSelectedPoint(lastPoint);
    }
  }, [selectedPoint, history]);

  if (!mounted || loading) return <Spinner />;
  if (error || !wellness)
    return (
      <Empty
        error={error}
        onBack={() => router.back()}
        onUpload={() => router.push("/upload")}
      />
    );

  function formatIntervalLabel(seconds) {
    if (!seconds) return `${visibleHistory.length}/${history.length}`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  }

  function zoomInHistory() {
    setZoomLevel((current) => Math.min(10, current * 1.5)); // 10 is the max zoom limit
  }

  function zoomOutHistory() {
    setZoomLevel((current) => Math.max(1, current / 1.5)); // 1 is the default 100% width
  }

  // Config mapping
  const cfg = STRESS_CONFIG[wellness.stress_label] || STRESS_CONFIG.moderate;
  const { color, glow } = cfg;

  // Driver calculations
  const driverEntries = Object.entries(
    wellness.feature_contributions || {},
  ).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxDriverVal =
    driverEntries.length > 0
      ? Math.max(...driverEntries.map((e) => Math.abs(e[1])))
      : 1;
  const activeDriver = selectedDriver || driverEntries[0]?.[0] || "";
  const activeDriverLabel =
    FEATURE_LABELS[activeDriver] || activeDriver || "Primary driver";

  const trackingStudy = wellness.tracking_summary?.study || {};
  const studyStreakDays = Math.round(
    Number(
      wellness.predict_params?.days_since_last_break ??
        wellness.streak_days ??
        0,
    ),
  );
  const burnoutScore = Math.round(
    Math.min(
      100,
      (wellness.stress_score || 0) * 0.58 +
        (wellness.confusion_score || 0) * 24 +
        Math.max(0, 14 - studyStreakDays * 1.7) +
        Math.max(0, 16 - (wellness.avg_quiz_score || 50) * 0.15),
    ),
  );

  return (
    <>
      <Head>
        <title>Wellness — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800;900&family=JetBrains+Mono:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="screen">
        {/* ── HEADER (DNA Match) ────────────────────────── */}
        <header className="hdr">
          <button className="back-btn" onClick={() => router.back()}>
            ←
          </button>
          <div style={{ flex: 1 }}>
            <span className="hdr-title">Wellness Status</span>
            <span className="hdr-sub">AI-driven cognitive load tracker</span>
          </div>
        </header>

        <div className="body">
          {/* ── TABS ──────────────────────────────────────── */}
          <div className="tabs-strip">
            {[
              { id: "overview", label: "Overview", icon: "✨" },
              { id: "trends", label: "Trends", icon: "📈" },
              { id: "drivers", label: "Drivers", icon: "🧠" },
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

          {/* ── TAB: OVERVIEW ─────────────────────────────── */}
          {tab === "overview" && (
            <div className="tab-body">
              {/* Hero Card */}
              <section
                className="hero-card"
                style={{
                  borderColor: `${color}33`,
                  boxShadow: `0 30px 90px ${glow}`,
                }}
              >
                <div
                  className="hero-nebula"
                  style={{
                    background: `radial-gradient(circle at 50% 30%, ${glow}, transparent 65%)`,
                  }}
                />

                <Gauge
                  score={wellness.stress_score || 0}
                  color={color}
                  glow={glow}
                />

                <div className="hero-copy">
                  <p className="hero-kicker">CURRENT STATE</p>
                  <h1 className="hero-name" style={{ color }}>
                    {cfg.emoji} {cfg.label}
                  </h1>
                  <p className="hero-tagline">{cfg.summary}</p>
                </div>

                {wellness.wellness_message && (
                  <div
                    className="hero-message"
                    style={{ borderColor: `${color}22` }}
                  >
                    {wellness.wellness_message}
                  </div>
                )}
              </section>

              {/* Signals Grid */}
              <div className="panel">
                <p className="section-label">✦ Current Vital Signs</p>
                <div className="signals-grid">
                  <div className="signal-card">
                    <span className="signal-icon">🔥</span>
                    <span className="signal-val" style={{ color: "#5BE7A2" }}>
                      {studyStreakDays}d
                    </span>
                    <span className="signal-label">Study Streak</span>
                  </div>
                  <div className="signal-card">
                    <span className="signal-icon">🎯</span>
                    <span className="signal-val" style={{ color: "#FFBE55" }}>
                      {Math.round(wellness.avg_quiz_score || 0)}%
                    </span>
                    <span className="signal-label">Avg Accuracy</span>
                  </div>
                  <div className="signal-card">
                    <span className="signal-icon">💡</span>
                    <span className="signal-val" style={{ color: "#FF6B88" }}>
                      {Math.round((wellness.confusion_score || 0) * 100)}%
                    </span>
                    <span className="signal-label">Confusion</span>
                  </div>
                  <div className="signal-card">
                    <span className="signal-icon">⏱️</span>
                    <span className="signal-val" style={{ color: "#4FACFE" }}>
                      {Math.round(trackingStudy.today_minutes || 0)}m
                    </span>
                    <span className="signal-label">Study Load</span>
                  </div>
                </div>
              </div>

              {/* Tips Insight */}
              {wellness.tip && (
                <div
                  className="panel"
                  style={{
                    background: `linear-gradient(160deg, rgba(${color === "#5BE7A2" ? "91,231,162" : color === "#FFBE55" ? "255,190,85" : "255,107,136"},0.08), rgba(6,9,18,0.96))`,
                  }}
                >
                  <p className="section-label" style={{ color }}>
                    ✦ AI Recommended Action
                  </p>
                  <p
                    style={{
                      fontSize: 14,
                      color: "#dbe2ff",
                      lineHeight: 1.6,
                      marginTop: -4,
                    }}
                  >
                    {wellness.tip}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── TAB: TRENDS ───────────────────────────────── */}
          {tab === "trends" && (
            <div className="tab-body">
              <div className="panel">
                <div className="panel-hdr-row">
                  <div>
                    <p className="section-label">✦ Weekly Trajectory</p>
                    <h3 className="panel-title">Stress History</h3>
                  </div>
                  <div className="trend-controls">
                    <div
                      className="zoom-controls"
                      aria-label="Stress graph zoom controls"
                    >
                      <button
                        type="button"
                        className="zoom-btn"
                        onClick={zoomOutHistory}
                        disabled={zoomLevel <= 1}
                      >
                        -
                      </button>
                      <span className="zoom-label">Zoom</span>
                      <button
                        type="button"
                        className="zoom-btn"
                        onClick={zoomInHistory}
                        disabled={zoomLevel >= 10}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scrollable Container */}
                <div
                  className="chart-wrapper"
                  style={{ overflowX: "auto", overflowY: "hidden" }}
                >
                  <div
                    style={{
                      width: `${zoomLevel * 100}%`,
                      minWidth: "100%",
                      height: 260,
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      {/* Note: data is now set to 'history' instead of 'visibleHistory' */}
                      <AreaChart
                        data={history}
                        margin={{ top: 10, right: 0, left: -24, bottom: 0 }}
                        onClick={(state) => {
                          const point = state?.activePayload?.[0]?.payload;
                          if (point) setSelectedPoint(point);
                        }}
                      >
                        <defs>
                          <linearGradient
                            id="historyFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={color}
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="100%"
                              stopColor={color}
                              stopOpacity={0.0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="rgba(255,255,255,0.04)"
                          strokeDasharray="4 4"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="chart_label"
                          tick={{ fill: "#62739f", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={28}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: "#62739f", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={<HistoryTooltip />}
                          cursor={{
                            stroke: "rgba(255,255,255,0.1)",
                            strokeWidth: 1,
                            strokeDasharray: "4 4",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke={color}
                          strokeWidth={3}
                          fill="url(#historyFill)"
                          activeDot={{
                            r: 6,
                            stroke: "#070a13",
                            strokeWidth: 3,
                            fill: color,
                          }}
                          dot={{
                            r: 4,
                            stroke: "#070a13",
                            strokeWidth: 2,
                            fill: color,
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: DRIVERS ──────────────────────────────── */}
          {tab === "drivers" && (
            <div className="tab-body">
              <div className="panel">
                <p className="section-label">✦ Cognitive Drivers</p>
                <p className="panel-sub">
                  Factors currently influencing your wellness score
                </p>

                <div className="probs-list">
                  {driverEntries.map(([key, val], i) => {
                    const isOn = key === activeDriver;
                    const impactPct = (Math.abs(val) / maxDriverVal) * 100;
                    const isPositive = val < 0; // Assuming negative stress contribution is "good/calming"
                    const barColor = isPositive ? "#5BE7A2" : color;

                    return (
                      <div
                        key={key}
                        className={`prob-row ${isOn ? "prob-row--on" : ""}`}
                        style={
                          isOn
                            ? {
                                borderColor: `${barColor}33`,
                                background: `${barColor}0a`,
                              }
                            : { cursor: "pointer" }
                        }
                        onClick={() => setSelectedDriver(key)}
                      >
                        <div className="prob-left">
                          <span
                            className="prob-name"
                            style={isOn ? { color: barColor } : {}}
                          >
                            {FEATURE_LABELS[key] || key.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="prob-track">
                          <div
                            className="prob-fill"
                            style={{
                              width: `${Math.max(5, impactPct)}%`,
                              background: isOn
                                ? `linear-gradient(90deg, ${barColor}, ${barColor}88)`
                                : "rgba(255,255,255,0.15)",
                              boxShadow: isOn
                                ? `0 0 10px ${barColor}66`
                                : "none",
                            }}
                          />
                        </div>
                        <span
                          className="prob-pct"
                          style={{ color: isOn ? barColor : "#62739f" }}
                        >
                          {Math.abs(Number(val)).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Active Driver Deep Dive */}
              <div
                className="panel"
                style={{
                  borderColor: `${color}33`,
                  background: `radial-gradient(circle at top right, ${glow}, transparent 60%), rgba(12,16,33,0.96)`,
                }}
              >
                <p className="section-label">✦ Focus Area</p>
                <h3
                  style={{
                    fontSize: 18,
                    margin: "-4px 0 8px",
                    color: "#dbe2ff",
                  }}
                >
                  {activeDriverLabel}
                </h3>
                <div className="signals-grid">
                  <div
                    className="signal-card"
                    style={{ background: "rgba(0,0,0,0.2)" }}
                  >
                    <span className="signal-val">
                      {Math.round(
                        Number(wellness.predict_params?.sessions_count || 0),
                      )}
                    </span>
                    <span className="signal-label">Sessions</span>
                  </div>
                  <div
                    className="signal-card"
                    style={{ background: "rgba(0,0,0,0.2)" }}
                  >
                    <span className="signal-val">
                      {Math.round(
                        Number(
                          wellness.predict_params?.chatbot_questions_today || 0,
                        ),
                      )}
                    </span>
                    <span className="signal-label">Chat Qs</span>
                  </div>
                  <div
                    className="signal-card"
                    style={{ background: "rgba(0,0,0,0.2)" }}
                  >
                    <span className="signal-val">
                      {Math.round(
                        Number(
                          wellness.predict_params?.explanation_revisit_count ||
                            0,
                        ),
                      )}
                    </span>
                    <span className="signal-label">Revisits</span>
                  </div>
                  <div
                    className="signal-card"
                    style={{ background: "rgba(0,0,0,0.2)" }}
                  >
                    <span className="signal-val">
                      {Math.round(
                        Number(
                          wellness.predict_params?.audio_playback_loops || 0,
                        ),
                      )}
                    </span>
                    <span className="signal-label">Audio Loops</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {wellness.updated_at && (
            <p className="updated-at">
              Status calculated at ·{" "}
              {new Date(wellness.updated_at).toLocaleTimeString("en-IN", {
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
              rgba(91, 231, 162, 0.08),
              transparent 24%
            ),
            radial-gradient(
              circle at 85% 16%,
              rgba(255, 107, 136, 0.08),
              transparent 18%
            ),
            linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
          padding-bottom: 60px;
        }

        /* ── HEADER (DNA Match) ────────────────────────── */
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
          transition:
            background 0.2s,
            border-color 0.2s;
        }
        .back-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
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

        /* ── BODY ──────────────────────────────────────── */
        .body {
          max-width: 720px;
          margin: 0 auto;
          padding: 28px 16px 40px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* ── HERO CARD (DNA Match) ─────────────────────── */
        .hero-card {
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          padding: 36px 24px 28px;
          background:
            radial-gradient(
              circle at top left,
              rgba(255, 255, 255, 0.03),
              transparent 34%
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
          gap: 16px;
          text-align: center;
          animation: cardUp 0.4s ease both;
        }
        .hero-nebula {
          position: absolute;
          inset: 0;
          pointer-events: none;
          mix-blend-mode: screen;
          opacity: 0.65;
        }
        .gauge-container {
          position: relative;
          display: flex;
          justify-content: center;
          margin-bottom: 10px;
        }
        .gauge-glow {
          position: absolute;
          inset: -20%;
          border-radius: 50%;
          filter: blur(25px);
          z-index: 1;
        }
        .hero-copy {
          position: relative;
          z-index: 2;
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
          max-width: 44ch;
          margin: 0 auto;
        }
        .hero-message {
          position: relative;
          z-index: 2;
          margin-top: 10px;
          padding: 14px 20px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #dbe2ff;
          font-size: 13px;
          line-height: 1.6;
          max-width: 90%;
        }

        /* ── TABS (DNA Match) ──────────────────────────── */
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
        .tab-body {
          display: flex;
          flex-direction: column;
          gap: 14px;
          animation: fadeUp 0.3s ease both;
        }

        /* ── PANELS (DNA Match) ────────────────────────── */
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
        .panel-hdr-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .trend-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .panel-title {
          font-size: 20px;
          color: #dbe2ff;
          margin-top: 6px;
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
        .point-readout {
          text-align: right;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 10px 14px;
          border-radius: 16px;
        }
        .point-readout span {
          display: block;
          font-size: 11px;
          font-weight: 700;
        }
        .point-readout strong {
          display: block;
          font-size: 22px;
          font-family: "JetBrains Mono", monospace;
          margin-top: 4px;
        }
        .zoom-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .zoom-btn {
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          color: #f8fbff;
          font-size: 18px;
          font-weight: 800;
          cursor: pointer;
        }
        .zoom-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .zoom-label {
          min-width: 72px;
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          color: #9ea8c7;
        }

        /* ── SIGNALS GRID (DNA Match) ──────────────────── */
        .signals-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        @media (max-width: 600px) {
          .signals-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .signal-card {
          border-radius: 18px;
          padding: 16px 12px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.03);
          display: flex;
          flex-direction: column;
          gap: 6px;
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
          font-size: 22px;
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

        /* ── CHART TOOLTIP ─────────────────────────────── */
        .chart-wrapper {
          margin-top: 10px;
        }
        .history-tooltip {
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(9, 16, 29, 0.96);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
        }
        .history-tooltip span,
        .history-tooltip small {
          display: block;
          color: #98aac6;
          font-size: 11px;
        }
        .history-tooltip strong {
          display: block;
          margin: 4px 0;
          font-size: 22px;
          color: #fff;
          font-family: "JetBrains Mono", monospace;
        }

        /* ── PROBABILITIES / DRIVERS LIST (DNA Match) ──── */
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
          background: rgba(255, 255, 255, 0.02);
        }
        .prob-row:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .prob-left {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 200px;
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
          font-size: 12px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          width: 44px;
          text-align: right;
          flex-shrink: 0;
        }

        .updated-at {
          font-size: 11px;
          color: #62739f;
          text-align: center;
          font-family: "JetBrains Mono", monospace;
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
      `}</style>
    </>
  );
}

// ── Shared UI States ──────────────────────────────────────
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
          Analysing vital signs…
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

function Empty({ error, onBack, onUpload }) {
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
      <span style={{ fontSize: 52 }}>🔋</span>
      <p
        style={{
          fontSize: 16,
          color: "#dbe2ff",
          fontWeight: 700,
          maxWidth: "32ch",
          lineHeight: 1.5,
        }}
      >
        {error || "Your wellness baseline is building"}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "#62739f",
          maxWidth: "36ch",
          lineHeight: 1.6,
        }}
      >
        Upload study material or engage with quizzes to generate your AI
        cognitive load and stress insights.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button
          onClick={onBack}
          style={{
            padding: "13px 24px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#e7edff",
            fontFamily: "Sora,sans-serif",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <button
          onClick={onUpload}
          style={{
            padding: "13px 24px",
            borderRadius: 14,
            background: "linear-gradient(135deg,#5BE7A2,#36CFC9)",
            color: "#05070f",
            border: "none",
            fontFamily: "Sora,sans-serif",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(91,231,162,0.35)",
          }}
        >
          Upload Note
        </button>
      </div>
    </div>
  );
}

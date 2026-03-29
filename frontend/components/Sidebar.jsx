// frontend/components/Sidebar.jsx — Advanced redesign

import { useRouter } from "next/router";
import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { icon: "🏠", label: "Home", route: "/", accent: "#5bd0ff" },
  { icon: "📚", label: "Notes", route: "/notes", accent: "#c79bff" },
  { icon: "🔥", label: "Heatmap", route: "/heatmap", accent: "#ff8b6b" },
  {
    icon: "🌌",
    label: "Constellation",
    route: "/constellation",
    accent: "#7ea2ff",
  },
  {
    icon: "🎬",
    label: "Video Summary",
    route: "/videosummary",
    accent: "#FF7BAC",
  },
  { icon: "❤️", label: "Wellness", route: "/wellness", accent: "#ff8fb3" },
  { icon: "🧬", label: "Study DNA", route: "/dna", accent: "#93ff78" },
];

function gradeInfo(pct) {
  if (pct >= 90) return { label: "A+", color: "#43E97B" };
  if (pct >= 75) return { label: "A", color: "#43E97B" };
  if (pct >= 60) return { label: "B", color: "#4FACFE" };
  if (pct >= 45) return { label: "C", color: "#FFB300" };
  return { label: "F", color: "#FF5050" };
}

function fmtTime(secs) {
  if (!secs) return "—";
  if (secs >= 60)
    return `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s`;
  return `${secs}s`;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

// ── Quiz Result Modal ────────────────────────────────────────
function QuizResultModal({ entry, onClose }) {
  const g = gradeInfo(entry.pct);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr">
          <span className="modal-title">Quiz Result</span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-hero">
          <div
            className="modal-grade"
            style={{ color: g.color, borderColor: g.color }}
          >
            {g.label}
          </div>
          <p className="modal-score" style={{ color: g.color }}>
            {entry.pct}%
          </p>
          <p className="modal-fraction">
            {entry.score} / {entry.total} correct
          </p>
        </div>
        <div className="modal-stats">
          {[
            {
              icon: "⏱",
              label: "Total Time",
              val: fmtTime(Math.round((entry.totalMs || 0) / 1000)),
            },
            { icon: "⚡", label: "Avg / Q", val: `${entry.avgQTime || 0}s` },
            { icon: "🎯", label: "Difficulty", val: entry.difficulty || "—" },
            { icon: "📋", label: "Questions", val: entry.total },
          ].map((s) => (
            <div key={s.label} className="modal-stat">
              <span className="ms-icon">{s.icon}</span>
              <span className="ms-val">{s.val}</span>
              <span className="ms-lbl">{s.label}</span>
            </div>
          ))}
        </div>
        <p className="modal-date">
          {new Date(entry.date).toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {" · "}
          {new Date(entry.date).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}
        </p>
        <button
          className="modal-retake"
          onClick={() => {
            onClose();
            window.location.href = "/quiz";
          }}
        >
          🔄 Retake Quiz
        </button>
      </div>
      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .modal {
          background: linear-gradient(
            160deg,
            rgba(13, 16, 38, 0.99),
            rgba(6, 8, 20, 0.99)
          );
          border: 1px solid rgba(108, 99, 255, 0.25);
          border-radius: 24px;
          padding: 24px;
          width: 100%;
          max-width: 340px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: popIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-family: "Sora", sans-serif;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04) inset,
            0 40px 80px rgba(0, 0, 0, 0.7),
            0 0 60px rgba(108, 99, 255, 0.08);
        }
        @keyframes popIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .modal-hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .modal-title {
          font-size: 16px;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.2px;
        }
        .modal-close {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #888;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-close:hover {
          background: rgba(255, 80, 80, 0.15);
          border-color: rgba(255, 80, 80, 0.3);
          color: #ff6b6b;
        }
        .modal-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 20px 16px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.025),
            rgba(255, 255, 255, 0.01)
          );
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }
        .modal-grade {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          border: 2.5px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          box-shadow:
            0 0 20px currentColor,
            0 0 40px rgba(0, 0, 0, 0.4);
          filter: drop-shadow(0 0 8px currentColor);
        }
        .modal-score {
          font-size: 36px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          line-height: 1.1;
          text-shadow: 0 0 30px currentColor;
        }
        .modal-fraction {
          font-size: 13px;
          color: #555;
        }
        .modal-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .modal-stat {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.04),
            rgba(255, 255, 255, 0.01)
          );
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 14px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          transition: border-color 0.2s;
        }
        .modal-stat:hover {
          border-color: rgba(108, 99, 255, 0.3);
        }
        .ms-icon {
          font-size: 18px;
        }
        .ms-val {
          font-size: 15px;
          font-weight: 800;
          color: #fff;
          font-family: "JetBrains Mono", monospace;
        }
        .ms-lbl {
          font-size: 10px;
          color: #484868;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .modal-date {
          font-size: 11px;
          color: #383858;
          text-align: center;
          font-family: "JetBrains Mono", monospace;
        }
        .modal-retake {
          width: 100%;
          padding: 13px;
          background: linear-gradient(
            135deg,
            #6c63ff 0%,
            #8b5cf6 50%,
            #a78bfa 100%
          );
          color: #fff;
          border: none;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.2s;
          box-shadow: 0 4px 20px rgba(108, 99, 255, 0.4);
          position: relative;
          overflow: hidden;
        }
        .modal-retake::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.1),
            transparent
          );
          opacity: 0;
          transition: opacity 0.2s;
        }
        .modal-retake:hover {
          box-shadow: 0 6px 30px rgba(108, 99, 255, 0.6);
          transform: translateY(-1px);
        }
        .modal-retake:hover::after {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}

// ── Quiz History Panel ───────────────────────────────────────
function QuizHistoryPanel({ onClose }) {
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  return (
    <>
      <div className="qh-panel">
        <div className="qh-header">
          <span className="qh-title">Quiz History</span>
          <button className="qh-close" onClick={onClose}>
            ✕
          </button>
        </div>
        {history.length === 0 ? (
          <div className="qh-empty">
            <span style={{ fontSize: 32 }}>🎯</span>
            <p>No attempts yet</p>
            <button
              className="qh-start"
              onClick={() => (window.location.href = "/quiz")}
            >
              Start a Quiz
            </button>
          </div>
        ) : (
          <div className="qh-list">
            {history.map((h, i) => {
              const g = gradeInfo(h.pct);
              const d = new Date(h.date);
              return (
                <div
                  key={i}
                  className="qh-entry"
                  onClick={() => setSelected(h)}
                >
                  <div
                    className="qhe-grade"
                    style={{ color: g.color, borderColor: g.color }}
                  >
                    {g.label}
                  </div>
                  <div className="qhe-info">
                    <div className="qhe-top">
                      <span className="qhe-pct" style={{ color: g.color }}>
                        {h.pct}%
                      </span>
                      <span className="qhe-score">
                        {h.score}/{h.total}
                      </span>
                      <span className="qhe-diff">{h.difficulty}</span>
                    </div>
                    <div className="qhe-bottom">
                      <span className="qhe-date">
                        {d.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        ·{" "}
                        {d.toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </span>
                      <span className="qhe-time">
                        ⏱ {fmtTime(Math.round((h.totalMs || 0) / 1000))}
                      </span>
                    </div>
                  </div>
                  <span className="qhe-arrow">›</span>
                </div>
              );
            })}
          </div>
        )}
        <button
          className="qh-new"
          onClick={() => (window.location.href = "/quiz")}
        >
          + New Quiz
        </button>
      </div>
      {selected && (
        <QuizResultModal entry={selected} onClose={() => setSelected(null)} />
      )}
      <style jsx>{`
        .qh-panel {
          position: absolute;
          left: 220px;
          top: 0;
          bottom: 0;
          width: 268px;
          background: linear-gradient(
            180deg,
            rgba(10, 12, 28, 0.99) 0%,
            rgba(5, 7, 18, 0.99) 100%
          );
          border-right: 1px solid rgba(108, 99, 255, 0.18);
          border-left: 1px solid rgba(108, 99, 255, 0.12);
          display: flex;
          flex-direction: column;
          z-index: 99;
          animation: slideIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-family: "Sora", sans-serif;
          box-shadow:
            4px 0 30px rgba(0, 0, 0, 0.5),
            inset -1px 0 0 rgba(255, 255, 255, 0.02);
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .qh-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 16px 16px;
          border-bottom: 1px solid rgba(108, 99, 255, 0.15);
          background: linear-gradient(
            180deg,
            rgba(108, 99, 255, 0.06),
            transparent
          );
        }
        .qh-title {
          font-size: 14px;
          font-weight: 800;
          color: #d0d0f0;
          letter-spacing: -0.2px;
        }
        .qh-close {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #555;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qh-close:hover {
          background: rgba(255, 80, 80, 0.12);
          border-color: rgba(255, 80, 80, 0.25);
          color: #ff6b6b;
        }
        .qh-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #3a3a5a;
          font-size: 13px;
        }
        .qh-start {
          padding: 10px 22px;
          border-radius: 12px;
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          color: #fff;
          border: none;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          margin-top: 4px;
          box-shadow: 0 4px 16px rgba(108, 99, 255, 0.4);
          transition: all 0.2s;
        }
        .qh-start:hover {
          box-shadow: 0 6px 24px rgba(108, 99, 255, 0.5);
          transform: translateY(-1px);
        }
        .qh-list {
          flex: 1;
          overflow-y: auto;
          padding: 10px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .qh-list::-webkit-scrollbar {
          width: 0;
        }
        .qh-entry {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 12px;
          border-radius: 14px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.025),
            rgba(255, 255, 255, 0.01)
          );
          border: 1px solid rgba(255, 255, 255, 0.07);
          cursor: pointer;
          transition: all 0.18s;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .qh-entry:hover {
          background: linear-gradient(
            135deg,
            rgba(108, 99, 255, 0.1),
            rgba(108, 99, 255, 0.04)
          );
          border-color: rgba(108, 99, 255, 0.3);
          transform: translateX(2px);
          box-shadow:
            inset 0 1px 0 rgba(108, 99, 255, 0.1),
            0 4px 16px rgba(0, 0, 0, 0.2);
        }
        .qhe-grade {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 2px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          flex-shrink: 0;
          box-shadow: 0 0 12px currentColor;
          filter: drop-shadow(0 0 4px currentColor);
        }
        .qhe-info {
          flex: 1;
          min-width: 0;
        }
        .qhe-top {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 3px;
        }
        .qhe-pct {
          font-size: 14px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
        }
        .qhe-score {
          font-size: 11px;
          color: #555;
        }
        .qhe-diff {
          font-size: 10px;
          color: #484868;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 5px;
          padding: 1px 6px;
        }
        .qhe-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .qhe-date {
          font-size: 10px;
          color: #383858;
          font-family: "JetBrains Mono", monospace;
        }
        .qhe-time {
          font-size: 10px;
          color: #383858;
        }
        .qhe-arrow {
          color: #2a2a4a;
          font-size: 20px;
          flex-shrink: 0;
          transition: color 0.18s;
        }
        .qh-entry:hover .qhe-arrow {
          color: #6c63ff;
        }
        .qh-new {
          margin: 10px;
          padding: 13px;
          border-radius: 14px;
          background: linear-gradient(
            135deg,
            rgba(108, 99, 255, 0.12),
            rgba(139, 92, 246, 0.06)
          );
          border: 1px solid rgba(108, 99, 255, 0.28);
          color: #9b95ff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.2s;
          box-shadow: inset 0 1px 0 rgba(108, 99, 255, 0.1);
        }
        .qh-new:hover {
          background: linear-gradient(
            135deg,
            rgba(108, 99, 255, 0.22),
            rgba(139, 92, 246, 0.14)
          );
          border-color: rgba(108, 99, 255, 0.45);
          box-shadow:
            0 4px 20px rgba(108, 99, 255, 0.2),
            inset 0 1px 0 rgba(108, 99, 255, 0.15);
        }
      `}</style>
    </>
  );
}

// ── Main Sidebar ─────────────────────────────────────────────
export default function Sidebar({ user = {}, children }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const initial = (user.name || "G").charAt(0).toUpperCase();
  const streak = user.streak || 0;

  return (
    <div className={`layout ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        {/* Ambient glow */}
        <div className="sidebar-glow" />
        <div className="sidebar-glow-bottom" />

        {/* Header */}
        <div className="sidebar-header">
          {!collapsed && (
            <div className="logo">
              <span className="logo-g">G</span>YAANI
              <span className="logo-ai"> AI</span>
            </div>
          )}
          <button
            className="collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        {/* User card */}
        {!collapsed ? (
          <div className="user-card" onClick={() => router.push("/profile")}>
            <div className="user-avatar">{initial}</div>
            <div className="user-info">
              <span className="user-name">{user.name || "Student"}</span>
              {streak > 0 && (
                <span className="user-streak">🔥 {streak} day streak</span>
              )}
            </div>
            <span className="user-arrow">›</span>
          </div>
        ) : (
          <div
            className="user-avatar-sm"
            onClick={() => router.push("/profile")}
            title="Profile"
          >
            {initial}
          </div>
        )}

        {/* Nav section label */}
        {!collapsed && <p className="nav-section-label"> </p>}

        {/* Nav items */}
        <nav className="nav-list">
          {NAV_ITEMS.map((item) => {
            const isActive = router.pathname === item.route;
            return (
              <button
                key={item.route}
                className={`nav-item ${isActive ? "nav-item--active" : ""}`}
                style={isActive ? { "--item-accent": item.accent } : {}}
                onClick={() => router.push(item.route)}
                title={collapsed ? item.label : ""}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span
                    className="nav-active-bar"
                    style={{ background: item.accent }}
                  />
                )}

                <span className="nav-item-icon">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="nav-item-label">{item.label}</span>
                    {isActive && (
                      <span
                        className="nav-item-dot"
                        style={{ background: item.accent }}
                      />
                    )}
                  </>
                )}
              </button>
            );
          })}

          {/* Quiz History */}
          <button
            className={`nav-item ${router.pathname === "/quiz-history" ? "nav-item--active" : ""}`}
            style={
              router.pathname === "/quiz-history"
                ? { "--item-accent": "#FFB300" }
                : {}
            }
            onClick={() => router.push("/quiz-history")}
            title={collapsed ? "Quiz History" : ""}
          >
            {router.pathname === "/quiz-history" && (
              <span
                className="nav-active-bar"
                style={{ background: "#FFB300" }}
              />
            )}
            <span className="nav-item-icon">🎯</span>
            {!collapsed && (
              <>
                <span className="nav-item-label">Quiz History</span>
              </>
            )}
          </button>
        </nav>

        {/* Upload shortcut */}

        {/* Footer */}
        {!collapsed && (
          <div className="sidebar-footer">
            <span className="version">v1.0 · GYAANI AI</span>
          </div>
        )}
      </aside>

      {/* Backdrop */}

      {/* Main content */}
      <main className="main-content">{children}</main>

      <style jsx>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .layout {
          display: flex;
          min-height: 100vh;
          background: linear-gradient(
            160deg,
            #04060e 0%,
            #080c1c 40%,
            #050810 100%
          );
          font-family: "Sora", sans-serif;
        }

        /* ── SIDEBAR ── */
        .sidebar {
          width: 220px;
          min-height: 100vh;
          background:
            radial-gradient(
              ellipse at 50% 0%,
              rgba(108, 99, 255, 0.14) 0%,
              transparent 65%
            ),
            radial-gradient(
              ellipse at 0% 100%,
              rgba(91, 208, 255, 0.06) 0%,
              transparent 50%
            ),
            linear-gradient(
              180deg,
              rgba(10, 12, 26, 0.99) 0%,
              rgba(5, 7, 16, 0.99) 100%
            );
          border-right: 1px solid rgba(189, 189, 189, 0.2);
          display: flex;
          flex-direction: column;
          padding: 0 0 20px;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          z-index: 100;
          transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: visible;
          box-shadow:
            1px 0 0 rgba(108, 99, 255, 0.08),
            4px 0 40px rgba(0, 0, 0, 0.4),
            inset -1px 0 0 rgba(255, 255, 255, 0.025);
        }
        .layout.collapsed .sidebar {
          width: 64px;
        }

        /* Ambient glow at top */
        .sidebar-glow {
          position: absolute;
          top: -30px;
          left: 50%;
          transform: translateX(-50%);
          width: 160px;
          height: 160px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(108, 99, 255, 0.2),
            rgba(91, 208, 255, 0.05) 50%,
            transparent 70%
          );
          filter: blur(32px);
          pointer-events: none;
          z-index: 0;
        }
        .sidebar-glow-bottom {
          position: absolute;
          bottom: 60px;
          left: 50%;
          transform: translateX(-50%);
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(91, 208, 255, 0.08),
            transparent 70%
          );
          filter: blur(24px);
          pointer-events: none;
          z-index: 0;
        }

        /* ── HEADER ── */
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 14px 16px;
          border-bottom: 2px solid rgba(108, 99, 255, 0.15);
          background: linear-gradient(
            180deg,
            rgba(108, 99, 255, 0.07) 0%,
            transparent 100%
          );
          min-height: 64px;
          position: relative;
          z-index: 1;
        }
        .logo {
          font-size: 20px;
          font-weight: 800;
          color: #e0e0f8;
          letter-spacing: -0.3px;
          white-space: nowrap;
          text-shadow: 0 0 20px rgba(108, 99, 255, 0.3);
        }
        .logo-g {
          color: #5bd0ff;
          text-shadow: 0 0 12px rgba(91, 208, 255, 0.6);
        }
        .logo-ai {
          color: #43e97b;
          font-size: 13px;
          text-shadow: 0 0 10px rgba(67, 233, 123, 0.5);
        }
        .collapse-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(108, 99, 255, 0.2);
          color: #555;
          border-radius: 8px;
          width: 28px;
          height: 28px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s;
          position: relative;
          z-index: 1;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .collapse-btn:hover {
          background: rgba(91, 208, 255, 0.12);
          color: #5bd0ff;
          border-color: rgba(91, 208, 255, 0.4);
          box-shadow:
            0 0 12px rgba(91, 208, 255, 0.15),
            inset 0 1px 0 rgba(91, 208, 255, 0.1);
        }

        /* ── USER CARD ── */
        .user-card {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 12px 10px 4px;
          padding: 10px 12px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.04),
            rgba(255, 255, 255, 0.015)
          );
          border: 1px solid rgba(172, 173, 173, 0.18);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          z-index: 1;
          overflow: hidden;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            0 2px 12px rgba(0, 0, 0, 0.3);
        }
        .user-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(
            circle at 0% 50%,
            rgba(91, 208, 255, 0.08),
            transparent 70%
          );
          pointer-events: none;
        }
        .user-card:hover {
          background: linear-gradient(
            135deg,
            rgba(91, 208, 255, 0.08),
            rgba(199, 155, 255, 0.04)
          );
          border-color: rgba(91, 208, 255, 0.35);
          box-shadow:
            inset 0 1px 0 rgba(91, 208, 255, 0.1),
            0 4px 20px rgba(0, 0, 0, 0.3),
            0 0 20px rgba(91, 208, 255, 0.06);
        }
        .user-avatar {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: linear-gradient(135deg, #5bd0ff 0%, #a78bfa 100%);
          color: #05070f;
          font-size: 13px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow:
            0 2px 14px rgba(91, 208, 255, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.1);
        }
        .user-avatar-sm {
          width: 36px;
          height: 36px;
          border-radius: 11px;
          background: linear-gradient(135deg, #5bd0ff 0%, #a78bfa 100%);
          color: #05070f;
          font-size: 13px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 12px auto 4px;
          cursor: pointer;
          flex-shrink: 0;
          box-shadow:
            0 2px 14px rgba(91, 208, 255, 0.35),
            0 0 0 1px rgba(255, 255, 255, 0.1);
          position: relative;
          z-index: 1;
          transition: box-shadow 0.2s;
        }
        .user-avatar-sm:hover {
          box-shadow:
            0 4px 20px rgba(91, 208, 255, 0.5),
            0 0 0 1px rgba(91, 208, 255, 0.3);
        }
        .user-info {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex: 1;
        }
        .user-name {
          font-size: 15px;
          font-weight: 700;
          color: #d8d8f0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .user-streak {
          font-size: 10px;
          color: #959595;
          margin-top: 2px;
        }
        .user-arrow {
          font-size: 16px;
          color: #515155;
          flex-shrink: 0;
          transition: color 0.2s;
        }
        .user-card:hover .user-arrow {
          color: #5bd0ff;
        }

        /* ── NAV SECTION LABEL ── */
        .nav-section-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #22223a;
          padding: 12px 16px 4px;
          position: relative;
          z-index: 1;
        }

        /* ── NAV LIST ── */
        .nav-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 4px 8px;
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          position: relative;
          z-index: 1;
        }
        .nav-list::-webkit-scrollbar {
          width: 0;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 13px;
          background: none;
          border: 1px solid transparent;
          color: #50506b;
          font-family: "Sora", sans-serif;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          text-align: left;
          white-space: nowrap;
          position: relative;
          transition:
            background 0.18s,
            color 0.18s,
            border-color 0.18s,
            transform 0.15s;
        }
        .nav-item:hover {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.05),
            rgba(255, 255, 255, 0.02)
          );
          color: #9ea8c7;
          border-color: rgba(255, 255, 255, 0.08);
          transform: translateX(1px);
        }
        .nav-item--active {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.06) 0%,
            rgba(255, 255, 255, 0.02) 100%
          ) !important;
          color: var(--item-accent, #5bd0ff) !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.07),
            0 2px 10px rgba(0, 0, 0, 0.2) !important;
        }

        /* Left active indicator bar */
        .nav-active-bar {
          position: absolute;
          left: 0;
          top: 18%;
          bottom: 18%;
          width: 3px;
          border-radius: 0 4px 4px 0;
          transition: opacity 0.2s;
          filter: blur(0.5px);
          box-shadow: 0 0 8px currentColor;
        }

        .nav-item-icon {
          font-size: 16px;
          flex-shrink: 0;
        }
        .nav-item-label {
          flex: 1;
        }
        .nav-item-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          flex-shrink: 0;
          box-shadow: 0 0 8px currentColor;
        }
        .qh-chevron {
          font-size: 14px;
          color: #333;
          transition: transform 0.2s;
        }
        .qh-chevron--open {
          transform: rotate(90deg);
          color: #ffb300;
        }

        /* ── UPLOAD SHORTCUT ── */
        .upload-shortcut {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 6px 10px;
          padding: 11px 14px;
          background: linear-gradient(
            135deg,
            rgba(91, 208, 255, 0.08),
            rgba(199, 155, 255, 0.05)
          );
          border: 1px solid rgba(91, 208, 255, 0.22);
          border-radius: 14px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          color: #7dd3fc;
          transition: all 0.2s;
          position: relative;
          z-index: 1;
          box-shadow:
            inset 0 1px 0 rgba(91, 208, 255, 0.08),
            0 4px 16px rgba(91, 208, 255, 0.06);
        }
        .upload-shortcut:hover {
          background: linear-gradient(
            135deg,
            rgba(91, 208, 255, 0.14),
            rgba(199, 155, 255, 0.1)
          );
          border-color: rgba(91, 208, 255, 0.4);
          box-shadow:
            inset 0 1px 0 rgba(91, 208, 255, 0.12),
            0 4px 20px rgba(91, 208, 255, 0.12);
        }
        .upload-arrow {
          margin-left: auto;
          font-size: 14px;
        }
        .upload-icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(91, 208, 255, 0.07);
          border: 1px solid rgba(91, 208, 255, 0.22);
          font-size: 18px;
          cursor: pointer;
          margin: 6px auto;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
          transition: all 0.2s;
          box-shadow: inset 0 1px 0 rgba(91, 208, 255, 0.08);
        }
        .upload-icon-btn:hover {
          background: rgba(91, 208, 255, 0.14);
          border-color: rgba(91, 208, 255, 0.4);
          box-shadow: 0 0 16px rgba(91, 208, 255, 0.15);
        }

        /* ── BACKDROP ── */
        .qh-backdrop {
          position: fixed;
          inset: 0;
          z-index: 98;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(4px);
        }

        /* ── FOOTER ── */
        .sidebar-footer {
          padding: 12px 16px 0;
          border-top: 2px solid rgba(57, 56, 84, 0.12);
          background: linear-gradient(
            0deg,
            rgba(108, 99, 255, 0.03),
            transparent
          );
          margin-top: 6px;
          position: relative;
          z-index: 1;
        }
        .version {
          font-size: 9px;
          color: #535357;
          letter-spacing: 0.06em;
        }

        /* ── MAIN CONTENT ── */
        .main-content {
          flex: 1;
          margin-left: 220px;
          min-height: 100vh;
          transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          overflow-x: hidden;
        }
        .layout.collapsed .main-content {
          margin-left: 64px;
        }

        /* ── MOBILE ── */
        @media (max-width: 768px) {
          .sidebar {
            width: 100% !important;
            height: 62px;
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            flex-direction: row;
            border-right: none;
            border-top: 1px solid rgba(108, 99, 255, 0.2);
            padding: 0 8px;
            overflow: visible;
            min-height: unset;
            background: rgba(6, 8, 18, 0.97);
            box-shadow:
              0 -1px 0 rgba(108, 99, 255, 0.1),
              0 -8px 30px rgba(0, 0, 0, 0.4);
          }
          .sidebar-glow,
          .sidebar-glow-bottom,
          .sidebar-header,
          .user-card,
          .user-avatar-sm,
          .nav-section-label,
          .sidebar-footer,
          .upload-shortcut,
          .upload-icon-btn {
            display: none;
          }
          .nav-list {
            flex-direction: row;
            padding: 0;
            gap: 0;
            align-items: center;
            justify-content: space-around;
            overflow: visible;
          }
          .nav-item {
            flex-direction: column;
            gap: 3px;
            padding: 8px 4px;
            font-size: 9px;
            border: none !important;
            border-radius: 8px;
            transform: none !important;
          }
          .nav-active-bar {
            display: none;
          }
          .nav-item-dot {
            display: none;
          }
          .nav-item-label {
            display: block !important;
          }
          .nav-item-icon {
            font-size: 19px;
          }
          .main-content {
            margin-left: 0 !important;
            margin-bottom: 62px;
          }
          .collapse-btn {
            display: none;
          }
          .qh-chevron {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

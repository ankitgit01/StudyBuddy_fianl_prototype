// ─────────────────────────────────────────────────────────────
//  GYAANI AI — Heatmap Page
//  Matches notes.jsx UI perfectly while keeping Heatmap features
//  File: frontend/pages/heatmap.jsx
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { getAllHeatmaps, getHeatmap, getNotes } from "../services/api";

const DEFAULT_USER_ID = "2b871b4a-fb6b-49be-82ca-d7aa244fdc65";

// ─── Subject Palette (from notes.jsx) ────────────────────────
const SUBJECT_TONES = {
  Physics: {
    tone: "tone-physics",
    accent: "#5bd0ff",
    glow: "rgba(91,208,255,0.34)",
  },
  Chemistry: {
    tone: "tone-chemistry",
    accent: "#93ff78",
    glow: "rgba(147,255,120,0.32)",
  },
  Mathematics: {
    tone: "tone-mathematics",
    accent: "#c79bff",
    glow: "rgba(199,155,255,0.34)",
  },
  Biology: {
    tone: "tone-biology",
    accent: "#ffc66d",
    glow: "rgba(255,198,109,0.34)",
  },
  History: {
    tone: "tone-history",
    accent: "#ff8b6b",
    glow: "rgba(255,139,107,0.33)",
  },
  Geography: {
    tone: "tone-geography",
    accent: "#59f0c2",
    glow: "rgba(89,240,194,0.33)",
  },
  English: {
    tone: "tone-english",
    accent: "#ff8fb3",
    glow: "rgba(255,143,179,0.32)",
  },
  Computer: {
    tone: "tone-computer",
    accent: "#7ea2ff",
    glow: "rgba(126,162,255,0.34)",
  },
  General: {
    tone: "tone-general",
    accent: "#f0f3ff",
    glow: "rgba(240,243,255,0.24)",
  },
};

function getSubjectTone(name) {
  return (
    SUBJECT_TONES[name] || {
      tone: "tone-general",
      accent: "#f0f3ff",
      glow: "rgba(240,243,255,0.24)",
    }
  );
}

function getSubjectIcon(name) {
  const icons = {
    Physics: "⚛️",
    Chemistry: "🧪",
    Mathematics: "📐",
    Biology: "🧬",
    History: "📜",
    Geography: "🌍",
    English: "📖",
    Computer: "💻",
    General: "📂",
  };
  return icons[name] || "📂";
}

// ─── Date Helpers ────────────────────────────────────────────
const dayLabel = (v) => {
  const d = new Date(v || 0);
  return Number.isNaN(d.getTime())
    ? "Older"
    : d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
};
const dayValue = (v) => {
  const d = new Date(v || 0);
  return Number.isNaN(d.getTime())
    ? 0
    : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

// ─── Score & Color Helpers ───────────────────────────────────
function confusionColor(score) {
  if (score < 0.3)
    return {
      text: "#43E97B",
      bg: "rgba(67,233,123,0.12)",
      border: "rgba(67,233,123,0.3)",
      label: "Confident",
    };
  if (score < 0.6)
    return {
      text: "#FFB300",
      bg: "rgba(255,179,0,0.12)",
      border: "rgba(255,179,0,0.3)",
      label: "Medium confidence",
    };
  return {
    text: "#FF5050",
    bg: "rgba(255,80,80,0.12)",
    border: "rgba(255,80,80,0.3)",
    label: "Confused",
  };
}

function ClarityRing({ score, size = 42 }) {
  const c = confusionColor(score);
  const pct = Math.round((1 - score) * 100);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = ((1 - score) * circ).toFixed(1);
  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={c.text}
          strokeWidth={4}
          strokeDasharray={`${dash} ${circ.toFixed(1)}`}
          strokeLinecap="round"
          style={{
            transition: "stroke-dasharray 0.8s ease",
            filter: `drop-shadow(0 0 4px ${c.text})`,
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <span
          style={{
            fontSize: size < 50 ? 11 : 14,
            fontWeight: 800,
            color: c.text,
            fontFamily: "'JetBrains Mono',monospace",
            lineHeight: 1,
          }}
        >
          {pct}
        </span>
        <span
          style={{
            fontSize: 7,
            color: "rgba(255,255,255,0.4)",
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          CLR
        </span>
      </div>
    </div>
  );
}

// ─── Heatmap Card (Matches NoteCard from notes.jsx) ──────────
function HeatmapCard({ note, index, onClick }) {
  const noteId = note.note_id || note.id;
  const thumbSrc = note.heatmap_url;
  const score = note.mean_confusion || 0;
  const cc = confusionColor(score);
  const clarity = Math.round((1 - score) * 100);

  return (
    <article
      role="button"
      tabIndex={0}
      style={{
        animationDelay: `${index * 0.04}s`,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: 150,
        height: 190,
        flexShrink: 0,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 12,
        padding: 7,
        cursor: "pointer",
        overflow: "hidden",
        animation: "fadeUp 0.3s ease both",
      }}
      onClick={() => onClick(noteId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(noteId);
        }
      }}
    >
      {/* Delete button (mocked) */}
      {/* <button
        type="button"
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          zIndex: 4,
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(10,10,18,0.85)",
          color: "#fff",
          fontSize: 13,
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        ×
      </button> */}

      {/* Thumbnail */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 105,
          flexShrink: 0,
          borderRadius: 8,
          overflow: "hidden",
          background: thumbSrc ? "#fff" : "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt="heatmap thumbnail"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              color: "#9b9bb1",
            }}
          >
            📄
          </div>
        )}
      </div>

      {/* Info Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          minWidth: 0,
          padding: "2px 2px 0",
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: "#f0f0f6",
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {note.file_name || noteId}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 4,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "#a9a9bb",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {note.subject || "General"}
          </span>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: 99,
              flexShrink: 0,
              background: cc.bg,
              border: `1px solid ${cc.border}`,
              color: cc.text,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 0.8,
            }}
          >
            {clarity}% CLR
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── Loading Screen ──────────────────────────────────────────
function LoadingScreen() {
  return (
    <>
      <Head>
        <title>Heatmaps - GYAANI AI</title>
      </Head>
      <div
        style={{
          minHeight: "100vh",
          background:
            "linear-gradient(180deg,#05070f,#090d1b 38%,#060913 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          fontFamily: "Sora,sans-serif",
        }}
      >
        <div style={{ position: "relative", width: 52, height: 52 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "3px solid rgba(255,80,80,0.15)",
              borderTopColor: "#FF5050",
              animation: "spin 1s linear infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 8,
              borderRadius: "50%",
              border: "3px solid rgba(255,179,0,0.15)",
              borderTopColor: "#FFB300",
              animation: "spin .8s linear infinite reverse",
            }}
          />
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#9ea8c7" }}>
            Analyzing confusion…
          </p>
          <p style={{ fontSize: 12, color: "#404058", marginTop: 4 }}>
            Loading your heatmaps
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function HeatmapPage() {
  const router = useRouter();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [activeSubject, setActiveSubject] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [expandedDetail, setExpandedDetail] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadHeatmaps() {
      setVisible(true);
      try {
        const uid = localStorage.getItem("user_id") || DEFAULT_USER_ID;
        const [heatmaps, allNotes] = await Promise.all([
          getAllHeatmaps(uid),
          getNotes(),
        ]);

        const notesById = new Map(
          (allNotes || []).map((note) => [note.id, note]),
        );
        const merged = (heatmaps || [])
          .map((item) => {
            const noteMeta = notesById.get(item.note_id) || {};
            return {
              ...item,
              subject: noteMeta.subject || "General",
              mean_confusion: noteMeta.mean_confusion ?? 0.5,
              topic: noteMeta.topic || null,
              file_name: item.file_name || noteMeta.file_name || null,
            };
          })
          .filter((item) => item.heatmap_url);

        if (!cancelled) {
          setNotes(merged);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setNotes([]);
          setLoading(false);
        }
      }
    }

    loadHeatmaps();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!expanded) {
      setExpandedDetail(null);
      return;
    }

    let cancelled = false;
    async function loadExpandedHeatmap() {
      try {
        const detail = await getHeatmap(expanded);
        const meta = notes.find((note) => note.note_id === expanded) || {};
        if (!cancelled) {
          setExpandedDetail({
            ...meta,
            ...detail,
            file_name: meta.file_name || null,
          });
        }
      } catch {
        if (!cancelled) {
          setExpandedDetail(null);
        }
      }
    }

    loadExpandedHeatmap();
    return () => {
      cancelled = true;
    };
  }, [expanded, notes]);

  useEffect(() => {
    if (router.isReady && router.query.noteId && notes.length > 0) {
      const note = notes.find((n) => n.note_id === router.query.noteId);
      if (note) {
        setActiveSubject(note.subject || "General");
        setExpanded(router.query.noteId);
      }
    }
  }, [router.isReady, router.query.noteId, notes]);

  const subjectMap = useMemo(() => {
    const out = {};
    notes.forEach((n) => {
      const s = n.subject || "General";
      if (!out[s]) out[s] = [];
      out[s].push(n);
    });
    return out;
  }, [notes]);

  const subjects = Object.keys(subjectMap).sort();
  const totalNotes = notes.length;

  const globalAvgConfusion = totalNotes
    ? notes.reduce((a, n) => a + (n.mean_confusion || 0), 0) / totalNotes
    : 0;

  const activeNotes = activeSubject
    ? (subjectMap[activeSubject] || []).filter(
        (n) =>
          !search.trim() ||
          (n.file_name || n.note_id || "")
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
    : [];

  const grouped = useMemo(() => {
    const bucket = activeNotes.reduce((acc, note) => {
      const key = dayLabel(note.createdAt);
      if (!acc[key]) acc[key] = [];
      acc[key].push(note);
      return acc;
    }, {});
    return Object.entries(bucket)
      .sort(
        (a, b) => dayValue(b[1][0]?.createdAt) - dayValue(a[1][0]?.createdAt),
      )
      .map(([day, items]) => ({
        day,
        items: [...items].sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
        ),
      }));
  }, [activeNotes]);

  const expandedNote =
    expandedDetail || notes.find((n) => n.note_id === expanded);

  const activeMeta = activeSubject
    ? { icon: getSubjectIcon(activeSubject) }
    : null;
  const activeTone = activeSubject ? getSubjectTone(activeSubject) : null;
  const activeAccent = activeTone?.accent || "#6C63FF";
  const activeGlow = activeTone?.glow || "rgba(108,99,255,0.34)";

  function handleBack() {
    if (expanded) {
      setExpanded(null);
      return;
    }
    if (activeSubject) {
      setActiveSubject(null);
      setSearch("");
      return;
    }
    router.back();
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Head>
        <title>Heatmaps - GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={`screen ${visible ? "screen--in" : ""}`}>
        {/* Ambient background matching notes.jsx */}
        <div className="nebula nebula-a" aria-hidden="true" />
        <div className="nebula nebula-b" aria-hidden="true" />
        <div className="star star-a" aria-hidden="true" />
        <div className="star star-b" aria-hidden="true" />
        <div className="star star-c" aria-hidden="true" />
        {activeSubject && (
          <div
            className="subject-aura"
            style={{
              background: `radial-gradient(ellipse 55% 28% at 50% 0%,${activeGlow},transparent 70%)`,
            }}
            aria-hidden="true"
          />
        )}

        {/* ══ STICKY HEADER ════════════ */}
        <header className="hdr">
          {expanded ? (
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <button className="detail-top-btn" onClick={handleBack}>
                ← Back
              </button>
              <button
                className="detail-top-btn detail-top-btn-accent"
                onClick={() => router.push(`/explanation?noteId=${expanded}`)}
              >
                ✨ Go to Explanation
              </button>
            </div>
          ) : (
            <button className="back-btn" onClick={handleBack}>
              {activeSubject ? "←" : "← Back"}
            </button>
          )}

          <div className="hdr-center">
            {activeSubject && !expanded && (
              <>
                <span className="hdr-icon">{activeMeta?.icon}</span>
                <span className="hdr-title" style={{ color: activeAccent }}>
                  {activeSubject}
                </span>
              </>
            )}
            {!activeSubject && !expanded && (
              <>
                <span className="hdr-title">Heatmaps</span>
              </>
            )}
          </div>
        </header>

        {/* ══════════════════════════════════════════════
            VIEW 1 — Top Hero + Subject Grid
        ══════════════════════════════════════════════ */}
        {!activeSubject && !expanded && (
          <div className="body">
            <section className="hero-card">
              <div className="hero-glow" aria-hidden="true" />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 8,
                  position: "relative",
                }}
              >
                <span style={{ fontSize: 32 }}>🔥</span>
                <h1 className="hero-heading" style={{ marginBottom: 0 }}>
                  Confusion Analysis
                </h1>
              </div>
              <p className="hero-body">
                See exactly where your handwriting breaks down — each heatmap
                reveals your toughest areas by topic.
              </p>
            </section>

            {totalNotes === 0 ? (
              <div className="empty">
                <div className="empty-orb">🗺️</div>
                <p className="empty-title">No heatmaps yet</p>
                <p className="empty-sub">
                  Upload a note in the Notes section to generate your first
                  confusion heatmap.
                </p>
              </div>
            ) : (
              <>
                <p className="section-label">SELECT A SUBJECT</p>
                <div className="subject-grid">
                  {subjects.map((subjectName, i) => {
                    const st = getSubjectTone(subjectName);
                    const count = subjectMap[subjectName]?.length || 0;
                    const sAvg =
                      (subjectMap[subjectName] || []).reduce(
                        (a, n) => a + (n.mean_confusion || 0),
                        0,
                      ) / count;
                    const clarity = Math.round((1 - sAvg) * 100);

                    return (
                      <div
                        key={subjectName}
                        className={`subject-card ${st.tone}`}
                        style={{ animationDelay: `${i * 0.04}s` }}
                        onClick={() => setActiveSubject(subjectName)}
                      >
                        <div className="sc-top">
                          <span className="sc-icon">
                            {getSubjectIcon(subjectName)}
                          </span>
                          <span className="sc-name">{subjectName}</span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            className="sc-count"
                            style={{ color: st.accent }}
                          >
                            {count} {count === 1 ? "note" : "notes"}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              color: confusionColor(sAvg).text,
                              fontWeight: 700,
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            {clarity}% avg
                          </span>
                        </div>
                        {/* <span className="sc-arrow" style={{ color: st.accent }}>
                          →
                        </span> */}
                      </div>
                    );
                  })}

                  <div
                    className="subject-card add-card"
                    style={{ animationDelay: `${subjects.length * 0.04}s` }}
                  >
                    <span
                      className="sc-name add-label"
                      style={{ fontSize: 22 }}
                    >
                      ＋
                    </span>
                    <span className="sc-count add-label">Add Subject</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            VIEW 2 — Note List / Gallery
        ══════════════════════════════════════════════ */}
        {activeSubject && !expanded && (
          <div className="body">
            <section
              className="subject-banner"
              style={{ borderColor: `${activeAccent}28` }}
            >
              <div
                className="sb-glow"
                style={{
                  background: `radial-gradient(ellipse 70% 60% at 0% 50%,${activeGlow},transparent 65%)`,
                }}
              />
              <div className="sb-left">
                <span className="sb-icon">{activeMeta?.icon}</span>
                <div>
                  <p className="sb-label">Subject · Notes</p>
                  <h2 className="sb-title" style={{ color: activeAccent }}>
                    {activeSubject}
                  </h2>
                </div>
              </div>
              <div className="sb-right">
                <span className="sb-count-val" style={{ color: activeAccent }}>
                  {subjectMap[activeSubject]?.length || 0}
                </span>
                <span className="sb-count-key">notes</span>
              </div>
            </section>

            {/* <div className="search-wrap">
              <span className="search-icon">⌕</span>
              <input
                className="search-input"
                placeholder={`Search in ${activeSubject}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? (
                <button
                  className="clear-btn"
                  type="button"
                  onClick={() => setSearch("")}
                >
                  ×
                </button>
              ) : null}
            </div> */}

            <div className="gallery-groups">
              {grouped.map((group, groupIndex) => (
                <section key={group.day} className="gallery-group">
                  <div className="group-head">
                    <h3 className="group-title">{group.day}</h3>
                    <span className="group-count">
                      {group.items.length}{" "}
                      {group.items.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <div className="notes-grid">
                    {group.items.map((note, i) => (
                      <HeatmapCard
                        key={note.note_id}
                        note={note}
                        index={groupIndex * 12 + i}
                        onClick={(id) => setExpanded(id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            VIEW 3 — Detail View
        ══════════════════════════════════════════════ */}
        {expanded && expandedNote && (
          <div className="body" style={{ maxWidth: 800 }}>
            {(() => {
              const eScore = expandedNote.mean_confusion || 0;
              const ec = confusionColor(eScore);
              return (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 24 }}
                >
                  {/* Expanded Banner */}
                  <div
                    className="exp-banner"
                    style={{ borderColor: ec.border }}
                  >
                    <div
                      className="exp-banner-glow"
                      style={{
                        background: `radial-gradient(ellipse 70% 80% at 50% 0%, ${ec.bg}, transparent 65%)`,
                      }}
                    />
                    <ClarityRing score={eScore} size={64} />
                    <div style={{ flex: 1 }}>
                      <p className="exp-kicker">Confusion Score</p>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          flexWrap: "wrap",
                        }}
                      >
                        <p
                          className="exp-val"
                          style={{ color: ec.text, marginBottom: 0 }}
                        >
                          {Math.round(eScore * 100)}% confused
                        </p>
                        {/* Legend */}
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            padding: "8px 12px",
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.07)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#43E97B",
                                boxShadow: "0 0 6px rgba(67,233,123,0.7)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#43E97B",
                                fontFamily: "'JetBrains Mono', monospace",
                                whiteSpace: "nowrap",
                              }}
                            >
                              &lt; 0.30
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#FFB300",
                                boxShadow: "0 0 6px rgba(255,179,0,0.7)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#FFB300",
                                fontFamily: "'JetBrains Mono', monospace",
                                whiteSpace: "nowrap",
                              }}
                            >
                              0.30 – 0.70
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#FF5050",
                                boxShadow: "0 0 6px rgba(255,80,80,0.7)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#FF5050",
                                fontFamily: "'JetBrains Mono', monospace",
                                whiteSpace: "nowrap",
                              }}
                            >
                              &gt; 0.70
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="exp-sub" style={{ marginTop: 6 }}>
                        {ec.label} — {Math.round((1 - eScore) * 100)}%
                        readability
                      </p>
                    </div>
                  </div>

                  {/* Heatmap image — single image or PDF pages */}
                  <div className="heatmap-canvas">
                    {expandedNote.heatmap_urls?.length > 0 ? (
                      expandedNote.heatmap_urls
                        .sort((a, b) => a.page - b.page)
                        .map((item) => (
                          <div key={item.page} style={{ marginBottom: 16 }}>
                            <p
                              style={{
                                fontSize: 11,
                                color: "#555",
                                fontWeight: 700,
                                padding: "0 4px 6px",
                                textTransform: "uppercase",
                                letterSpacing: 1,
                              }}
                            >
                              Page {item.page}
                            </p>
                            <img
                              src={item.url}
                              className="heatmap-image"
                              alt={`page ${item.page} heatmap`}
                            />
                          </div>
                        ))
                    ) : (
                      <img
                        src={expandedNote.heatmap_url || expandedNote.image_url}
                        className="heatmap-image"
                        alt="confusion heatmap"
                      />
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <style jsx global>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        html,
        body {
          background: #05070f;
        }
        button,
        input {
          font-family: "Sora", sans-serif;
        }
      `}</style>

      <style jsx>{`
        /* ══ SCREEN SHELL & AMBIENT (Matches notes.jsx) ════════════════════ */
        .screen {
          position: relative;
          overflow-x: hidden;
          width: 100%;
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
              rgba(199, 155, 255, 0.09),
              transparent 18%
            ),
            linear-gradient(180deg, #05070f, #090d1b 38%, #060913 100%);
          opacity: 0;
          transform: translateY(14px);
          transition:
            opacity 0.4s,
            transform 0.4s;
          padding-bottom: 80px;
        }
        .screen--in {
          opacity: 1;
          transform: none;
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
        .star {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .star::before,
        .star::after {
          content: "";
          position: absolute;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.85);
        }
        .star-a::before {
          width: 3px;
          height: 3px;
          left: 16%;
          top: 22%;
          box-shadow:
            220px 110px 0 rgba(255, 255, 255, 0.65),
            460px 46px 0 rgba(255, 255, 255, 0.55),
            720px 180px 0 rgba(255, 255, 255, 0.7),
            1100px 64px 0 rgba(255, 255, 255, 0.42);
        }
        .star-b::before {
          width: 2px;
          height: 2px;
          left: 10%;
          top: 65%;
          box-shadow:
            180px -210px 0 rgba(255, 255, 255, 0.45),
            540px -120px 0 rgba(255, 255, 255, 0.65),
            860px -200px 0 rgba(255, 255, 255, 0.35),
            1280px -80px 0 rgba(255, 255, 255, 0.5);
        }
        .star-c::before {
          width: 2px;
          height: 2px;
          left: 42%;
          top: 78%;
          box-shadow:
            110px -260px 0 rgba(255, 255, 255, 0.45),
            320px -90px 0 rgba(255, 255, 255, 0.32),
            540px -290px 0 rgba(255, 255, 255, 0.68),
            900px -170px 0 rgba(255, 255, 255, 0.38);
        }
        .subject-aura {
          position: fixed;
          left: 0;
          right: 0;
          top: 0;
          height: 260px;
          pointer-events: none;
          mix-blend-mode: screen;
          z-index: 0;
        }

        /* ══ HEADER ═════════════════════════════════════════════════════════ */
        .hdr {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(5, 8, 18, 0.82);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .back-btn {
          padding: 0 16px;
          height: 38px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: #e7edff;
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition:
            background 0.18s,
            border-color 0.18s,
            transform 0.15s;
          white-space: nowrap;
        }
        .back-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateX(-2px);
        }

        .hdr-center {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .hdr-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
        .hdr-badge {
          font-size: 11px;
          font-weight: 800;
          padding: 4px 12px;
          border-radius: 20px;
          background: rgba(255, 80, 80, 0.1);
          border: 1px solid rgba(255, 80, 80, 0.25);
          color: #ff6b6b;
          white-space: nowrap;
        }
        .hdr-title {
          display: block;
          font-size: 16px;
          font-weight: 800;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .global-clarity-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.03);
          font-size: 11px;
          font-weight: 700;
          font-family: "JetBrains Mono", monospace;
        }
        .gcp-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        /* ══ BODY SHELL ═════════════════════════════════════════════════════ */
        .body {
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
          padding: 28px 20px 40px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .section-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #62739f;
          margin-bottom: -8px;
        }

        /* ══ HERO CARD ══════════════════════════════════════════════════════ */
        .hero-card {
          position: relative;
          overflow: hidden;
          padding: 28px 26px;
          border-radius: 28px;
          background:
            radial-gradient(
              circle at top left,
              rgba(91, 208, 255, 0.16),
              transparent 34%
            ),
            radial-gradient(
              circle at bottom right,
              rgba(199, 155, 255, 0.18),
              transparent 28%
            ),
            linear-gradient(
              180deg,
              rgba(17, 22, 45, 0.97),
              rgba(7, 10, 23, 0.99)
            );
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.34);
        }
        .hero-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(
            ellipse 100% 80% at 50% -20%,
            rgba(108, 99, 255, 0.12),
            transparent 55%
          );
        }
        .hero-heading {
          font-size: 30px;
          line-height: 1.08;
          font-weight: 800;
          position: relative;
        }
        .hero-body {
          font-size: 13px;
          line-height: 1.75;
          color: #9ea8c7;
          max-width: 55ch;
          position: relative;
        }

        /* ══ EXACT SUBJECT GRID (from notes.jsx) ════════════════════════════ */
        .subject-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        @media (max-width: 600px) {
          .subject-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 380px) {
          .subject-grid {
            grid-template-columns: 1fr;
          }
        }

        .subject-card {
          position: relative;
          overflow: hidden;
          text-align: left;
          padding: 20px 18px 16px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #f7f8ff;
          cursor: pointer;
          min-height: 118px;
          transition:
            transform 0.18s,
            border-color 0.18s,
            box-shadow 0.18s;
          animation: cardUp 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .subject-card:hover {
          transform: translateY(-5px) scale(1.015);
          border-color: rgba(255, 255, 255, 0.16);
          box-shadow: 0 22px 52px rgba(0, 0, 0, 0.3);
        }
        .subject-card::before {
          content: "";
          position: absolute;
          inset: auto -20% -35% auto;
          width: 130px;
          height: 130px;
          border-radius: 999px;
          filter: blur(14px);
          opacity: 0.72;
          pointer-events: none;
        }
        @keyframes cardUp {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        .sc-top {
          display: flex;
          align-items: center;
          gap: 8px;
          position: relative;
        }
        .sc-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
        .sc-name {
          font-size: 16px;
          font-weight: 800;
          flex: 1;
        }
        .sc-count {
          font-size: 12px;
          font-weight: 700;
          position: relative;
        }
        .sc-arrow {
          font-size: 16px;
          font-weight: 700;
          opacity: 0.55;
          transition: opacity 0.18s;
          position: relative;
          margin-top: auto;
        }
        .subject-card:hover .sc-arrow {
          opacity: 1;
        }

        .add-card {
          background: rgba(108, 99, 255, 0.05) !important;
          border: 1.5px dashed rgba(108, 99, 255, 0.35) !important;
        }
        .add-label {
          color: #6c63ff !important;
        }

        /* Tone classes */
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

        /* ══ SUBJECT BANNER (view 2) ════════════════════════════════════════ */
        .subject-banner {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 22px;
          border-radius: 24px;
          background: linear-gradient(
            160deg,
            rgba(17, 22, 45, 0.96),
            rgba(7, 10, 23, 0.97)
          );
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.26);
        }
        .sb-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .sb-left {
          display: flex;
          align-items: center;
          gap: 14px;
          position: relative;
        }
        .sb-icon {
          font-size: 36px;
        }
        .sb-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #62739f;
          margin-bottom: 4px;
        }
        .sb-title {
          font-size: 24px;
          font-weight: 800;
          line-height: 1;
        }
        .sb-right {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          position: relative;
          flex-shrink: 0;
        }
        .sb-count-val {
          font-size: 28px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          line-height: 1;
        }
        .sb-count-key {
          font-size: 10px;
          color: #62739f;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        /* ══ SEARCH ═════════════════════════════════════════════════════════ */
        .search-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 12px 16px;
          transition: border-color 0.2s;
        }
        .search-wrap:focus-within {
          border-color: rgba(108, 99, 255, 0.4);
        }
        .search-icon {
          font-size: 15px;
          color: #7a7a94;
        }
        .search-input {
          flex: 1;
          background: none;
          border: none;
          color: #e0e0e8;
          font: inherit;
          font-size: 14px;
          outline: none;
        }
        .clear-btn {
          background: none;
          border: none;
          color: #555;
          font-size: 20px;
          cursor: pointer;
          line-height: 1;
          padding: 0;
        }

        /* ══ GALLERY GROUPS (EXACTLY from notes.jsx) ════════════════════════ */
        .gallery-groups {
          display: flex;
          flex-direction: column;
          gap: 32px;
        }
        .gallery-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-top: 6px;
        }
        .group-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .group-title {
          font-size: 26px;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.03em;
        }
        .group-count {
          font-size: 11px;
          color: #555;
          text-transform: uppercase;
          letter-spacing: 1.3px;
          font-weight: 700;
        }
        .notes-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        /* ══ EXPANDED DETAIL VIEW (Top Action Buttons) ═════════════════════ */
        .detail-top-btn {
          padding: 8px 16px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition:
            background 0.2s,
            transform 0.2s;
        }
        .detail-top-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-2px);
        }
        .detail-top-btn-accent {
          background: rgba(108, 99, 255, 0.1);
          color: #b9b5ff;
          border-color: rgba(108, 99, 255, 0.3);
        }
        .detail-top-btn-accent:hover {
          background: rgba(108, 99, 255, 0.2);
          border-color: rgba(108, 99, 255, 0.5);
        }

        /* ══ EXPANDED DETAIL VIEW ═══════════════════════════════════════════ */
        .exp-banner {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 24px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
          overflow: hidden;
        }
        .exp-banner-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .exp-kicker {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #62739f;
          margin-bottom: 6px;
          display: block;
        }
        .exp-val {
          font-size: 24px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
          margin-bottom: 4px;
          display: block;
        }
        .exp-sub {
          font-size: 12px;
          color: #9ea8c7;
          display: block;
        }

        .heatmap-canvas {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .page-label {
          font-size: 10px;
          color: #62739f;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          padding-bottom: 4px;
        }
        .heatmap-img {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
        }

        /* ══ EMPTY STATE ════════════════════════════════════════════════════ */
        .empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 72px 24px;
          text-align: center;
        }
        .empty-orb {
          font-size: 60px;
          filter: drop-shadow(0 0 20px rgba(108, 99, 255, 0.4));
          animation: floatOrb 3s ease-in-out infinite;
        }
        @keyframes floatOrb {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        .empty-title {
          font-size: 20px;
          font-weight: 800;
          color: #d0d4e8;
        }
        .empty-sub {
          font-size: 13px;
          color: #62739f;
          max-width: 320px;
          line-height: 1.7;
        }
      `}</style>
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { deleteNote, getNotes } from "../services/api";
import {
  addCustomSubject,
  deleteCustomSubject,
  getAllSubjects,
  getSubjectMeta,
} from "../services/subjects";

// ─── Subject palette (unchanged) ─────────────────────────────
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

// ─── Date helpers (unchanged) ─────────────────────────────────
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

// ─── Local cleanup (unchanged) ────────────────────────────────
function cleanupLocal(noteId) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`gyaani_stickies_${noteId}`);
  localStorage.removeItem(`constellation_done_${noteId}`);
  try {
    const notes = JSON.parse(localStorage.getItem("gyaani_notes") || "[]");
    localStorage.setItem(
      "gyaani_notes",
      JSON.stringify(notes.filter((n) => n.id !== noteId)),
    );
  } catch {}
}

// ─────────────────────────────────────────────────────────────
//  NoteCard — COMPLETELY UNCHANGED from original
//  (preview window size, layout, logic, styles — all identical)
// ─────────────────────────────────────────────────────────────
function NoteCard({ note, index, deleting, onDelete, onOpen }) {
  const noteId = note.note_id || note.id;
  const isPdf = note.file_type === "pdf";
  const previewSrc = note.previewUrl || (!isPdf ? note.imageUrl : null);
  const pdfSrc = isPdf ? note.imageUrl || null : null;
  const [pdfThumb, setPdfThumb] = useState(null);

  useEffect(() => {
    if (!isPdf || previewSrc || !pdfSrc) return;
    let cancelled = false;
    async function renderFirstPage() {
      try {
        if (!window.pdfjsLib) {
          await new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            s.onload = res;
            s.onerror = rej;
            document.head.appendChild(s);
          });
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const resp = await fetch(
          `/api/pdf-proxy?url=${encodeURIComponent(pdfSrc)}`,
        );
        if (!resp.ok) throw new Error("proxy failed");
        const buf = await resp.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({
          data: new Uint8Array(buf),
        }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.6 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport })
          .promise;
        if (!cancelled) setPdfThumb(canvas.toDataURL("image/jpeg", 0.8));
      } catch (e) {}
    }
    renderFirstPage();
    return () => {
      cancelled = true;
    };
  }, [isPdf, previewSrc, pdfSrc]);

  const thumbSrc = previewSrc || pdfThumb;

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
      onClick={() => onOpen(note.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(note.id);
        }
      }}
    >
      {/* Delete button */}
      <button
        type="button"
        disabled={deleting}
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
          onDelete(note);
        }}
      >
        {deleting ? "…" : "×"}
      </button>

      {/* Thumbnail — strictly 105px tall, hard clipped */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 105,
          flexShrink: 0,
          borderRadius: 8,
          overflow: "hidden",
          background: thumbSrc
            ? "#fff"
            : isPdf
              ? "rgba(255,80,80,0.08)"
              : "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {thumbSrc && (
          <img
            src={thumbSrc}
            alt=""
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
        )}
        {!thumbSrc && (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              color: isPdf ? "#ff9d9d" : "#9b9bb1",
            }}
          >
            {isPdf ? "📄" : "📝"}
          </div>
        )}
        {isPdf && (
          <span
            style={{
              position: "absolute",
              bottom: 6,
              left: 6,
              zIndex: 2,
              padding: "2px 7px",
              borderRadius: 99,
              background: "rgba(255,80,80,0.92)",
              color: "#fff",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 0.8,
            }}
          >
            PDF
          </span>
        )}
      </div>

      {/* Info */}
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
              background: isPdf
                ? "rgba(255,80,80,0.12)"
                : "rgba(79,172,254,0.12)",
              border: `1px solid ${isPdf ? "rgba(255,80,80,0.25)" : "rgba(79,172,254,0.25)"}`,
              color: isPdf ? "#ff9d9d" : "#8dc9ff",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 0.8,
            }}
          >
            {isPdf ? "PDF" : "IMG"}
          </span>
        </div>
      </div>
    </article>
  );
}

// ─── Add Subject Modal (unchanged) ───────────────────────────
function AddSubjectModal({ onAdd, onClose }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  function handleAdd() {
    const result = addCustomSubject(name);
    if (!result) {
      setError(
        name.trim() ? "Subject already exists!" : "Please enter a name.",
      );
      return;
    }
    onAdd(result);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add New Subject</span>
          <button className="modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="modal-hint">
          This subject will appear in Notes and Upload pages.
        </p>
        <input
          ref={inputRef}
          className="modal-input"
          placeholder="e.g. Economics, Sanskrit, Art..."
          value={name}
          maxLength={30}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="modal-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-add"
            type="button"
            onClick={handleAdd}
            disabled={!name.trim()}
          >
            Add Subject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading screen ───────────────────────────────────────────
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

// ─── Main Page ────────────────────────────────────────────────
export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSubject, setActiveSubject] = useState(null);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // ── Data fetch (unchanged) ──
  useEffect(() => {
    setVisible(true);
    setSubjects(getAllSubjects());
    getNotes()
      .then((d) => {
        setNotes(d || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (router.query.subject) setActiveSubject(router.query.subject);
  }, [router.query.subject]);

  // ── Derived data (unchanged) ──
  const subjectMap = useMemo(() => {
    const out = {};
    notes.forEach((n) => {
      const s = n.subject || "General";
      if (!out[s]) out[s] = [];
      out[s].push(n);
    });
    return out;
  }, [notes]);

  const allSubjects = [
    ...subjects,
    ...Object.keys(subjectMap)
      .filter((s) => !subjects.find((x) => x.name === s))
      .map((s) => getSubjectMeta(s)),
  ];

  const activeNotes = activeSubject
    ? (subjectMap[activeSubject] || []).filter(
        (n) =>
          !search.trim() ||
          (n.topic || "").toLowerCase().includes(search.toLowerCase()),
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

  const activeMeta = activeSubject ? getSubjectMeta(activeSubject) : null;
  const activeTone = activeSubject ? getSubjectTone(activeSubject) : null;
  const activeAccent = activeTone?.accent || "#6C63FF";
  const activeGlow = activeTone?.glow || "rgba(108,99,255,0.34)";

  // ── Handlers (unchanged) ──
  function handleAddSubject() {
    setSubjects(getAllSubjects());
    setShowModal(false);
  }

  function handleDeleteSubject(e, name) {
    e.stopPropagation();
    if (!confirm(`Delete subject "${name}"? Notes in it won't be deleted.`))
      return;
    deleteCustomSubject(name);
    setSubjects(getAllSubjects());
    if (activeSubject === name) setActiveSubject(null);
  }

  async function handleDeleteNote(note) {
    if (deletingId) return;
    const title = note.topic || `${note.subject || "General"} note`;
    if (
      !confirm(
        `Delete "${title}"? This will remove it from local storage and Cosmos DB.`,
      )
    )
      return;
    setDeletingId(note.id);
    try {
      await deleteNote(note.id);
      cleanupLocal(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (err) {
      alert(err.message || "Failed to delete note");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <Head>
        <title>My Notes - GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={`screen ${visible ? "screen--in" : ""}`}>
        {/* ── Ambient nebula + stars ── */}
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

        {/* ══ STICKY HEADER ══════════════════════════════════════ */}
        <header className="hdr">
          <button
            className="back-btn"
            type="button"
            onClick={() => {
              if (activeSubject) {
                setActiveSubject(null);
                setSearch("");
              } else router.back();
            }}
          >
            ←
          </button>

          <div className="hdr-center">
            {activeSubject ? (
              <>
                <span className="hdr-icon">
                  {activeMeta?.icon || getSubjectIcon(activeSubject)}
                </span>
                <div>
                  <span className="hdr-title" style={{ color: activeAccent }}>
                    {activeSubject}
                  </span>
                  <span className="hdr-sub">
                    {subjectMap[activeSubject]?.length || 0} notes
                  </span>
                </div>
              </>
            ) : (
              <div>
                <span className="hdr-title">My Notes</span>
                <span className="hdr-sub">
                  {notes.length} total · {allSubjects.length} subjects
                </span>
              </div>
            )}
          </div>

          <button
            className="upload-btn"
            type="button"
            onClick={() =>
              router.push(
                activeSubject ? `/upload?subject=${activeSubject}` : "/upload",
              )
            }
          >
            + Upload
          </button>
        </header>

        {/* ══════════════════════════════════════════════
            VIEW 1 — Subject Grid
        ══════════════════════════════════════════════ */}
        {!activeSubject && (
          <div className="body">
            {/* Hero card */}
            <section className="hero-card">
              <div className="hero-glow" aria-hidden="true" />
              <h1 className="hero-kicker"></h1>
              <h1 className="hero-heading">📚 Study Library</h1>
              <p className="hero-body">
                All your handwritten and typed notes in one place — sorted, and
                ready to study.
              </p>
              <div className="hero-stats">
                {[
                  { val: notes.length, key: "Total Notes", color: "#f8fbff" },
                  {
                    val: allSubjects.length,
                    key: "Subjects",
                    color: "#f8fbff",
                  },
                  {
                    val: notes.filter((n) => n.file_type === "pdf").length,
                    key: "PDFs",
                    color: "#ff9d9d",
                  },
                  {
                    val: notes.filter((n) => n.file_type !== "pdf").length,
                    key: "Images",
                    color: "#8dc9ff",
                  },
                ].map(({ val, key, color }, i, arr) => (
                  <div key={key} style={{ display: "contents" }}>
                    <div className="hero-stat">
                      <span className="hero-stat-val" style={{ color }}>
                        {val}
                      </span>
                      <span className="hero-stat-key">{key}</span>
                    </div>
                    {i < arr.length - 1 && <div className="hero-divider" />}
                  </div>
                ))}
              </div>
            </section>

            <p className="section-label">Select a Subject</p>
            <div className="subject-grid">
              {allSubjects.map((s, i) => {
                const count = subjectMap[s.name]?.length || 0;
                const st = getSubjectTone(s.name);
                return (
                  <div
                    key={s.name}
                    className={`subject-card ${st.tone}`}
                    style={{ animationDelay: `${i * 0.04}s` }}
                    onClick={() => setActiveSubject(s.name)}
                  >
                    {s.custom ? (
                      <button
                        className="delete-badge"
                        type="button"
                        onClick={(e) => handleDeleteSubject(e, s.name)}
                      >
                        ×
                      </button>
                    ) : null}
                    <div className="sc-top">
                      <span className="sc-icon">{getSubjectIcon(s.name)}</span>
                      <span className="sc-name">{s.name}</span>
                    </div>
                    <span className="sc-count" style={{ color: st.accent }}>
                      {count} {count === 1 ? "note" : "notes"}
                    </span>
                    {/* <span className="sc-arrow" style={{ color: st.accent }}>→</span> */}
                  </div>
                );
              })}

              {/* Add subject card */}
              <div
                className="subject-card add-card"
                style={{ animationDelay: `${allSubjects.length * 0.04}s` }}
                onClick={() => setShowModal(true)}
              >
                <span className="sc-name add-label" style={{ fontSize: 22 }}>
                  ＋
                </span>
                <span className="sc-count add-label">Add Subject</span>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            VIEW 2 — Notes Gallery
        ══════════════════════════════════════════════ */}
        {activeSubject && (
          <div className="body">
            {/* Subject banner */}
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
                <span className="sb-icon">
                  {activeMeta?.icon || getSubjectIcon(activeSubject)}
                </span>
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

            {/* Search */}
            {/* <div className="search-wrap">
              <span className="search-icon">⌕</span>
              <input
                className="search-input"
                placeholder={`Search in ${activeSubject}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? <button className="clear-btn" type="button" onClick={() => setSearch("")}>×</button> : null}
            </div> */}

            {/* Empty state */}
            {activeNotes.length === 0 && (
              <div className="empty">
                <div className="empty-orb">
                  {activeMeta?.icon || getSubjectIcon(activeSubject)}
                </div>
                <p className="empty-title">
                  {search
                    ? `No results for "${search}"`
                    : `No ${activeSubject} notes yet`}
                </p>
                <p className="empty-sub">
                  Upload a note to start building your study library for this
                  subject.
                </p>
                <button
                  className="upload-cta"
                  type="button"
                  onClick={() =>
                    router.push(`/upload?subject=${activeSubject}`)
                  }
                >
                  📤 Upload {activeSubject} Note
                </button>
              </div>
            )}

            {/* Gallery groups */}
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
                      <NoteCard
                        key={note.id}
                        note={note}
                        index={groupIndex * 12 + i}
                        deleting={deletingId === note.id}
                        onDelete={handleDeleteNote}
                        onOpen={(id) =>
                          router.push(`/explanation?noteId=${id}`)
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>

      {showModal ? (
        <AddSubjectModal
          onAdd={handleAddSubject}
          onClose={() => setShowModal(false)}
        />
      ) : null}

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
        button {
          font-family: "Sora", sans-serif;
        }
      `}</style>

      <style jsx>{`
        /* ══ SCREEN SHELL ═══════════════════════════════════════════════════ */
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

        /* Ambient layers */
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
            background 0.18s,
            border-color 0.18s,
            transform 0.15s;
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
          font-size: 22px;
          flex-shrink: 0;
        }
        .hdr-title {
          display: block;
          font-size: 16px;
          font-weight: 800;
          transition: color 0.3s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .hdr-sub {
          display: block;
          font-size: 11px;
          color: #8e98bc;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .upload-btn {
          padding: 9px 16px;
          border-radius: 11px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          color: #fff;
          border: none;
          box-shadow: 0 6px 18px rgba(108, 99, 255, 0.35);
          transition:
            transform 0.15s,
            box-shadow 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .upload-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(108, 99, 255, 0.45);
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
        .hero-kicker {
          font-size: 11px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #7dd3fc;
          margin-bottom: 12px;
          position: relative;
        }
        .hero-heading {
          font-size: 30px;
          line-height: 1.08;
          font-weight: 800;
          margin-bottom: 12px;
          position: relative;
        }
        .hero-body {
          font-size: 13px;
          line-height: 1.75;
          color: #9ea8c7;
          max-width: 52ch;
          margin-bottom: 26px;
          position: relative;
        }
        .hero-stats {
          display: flex;
          align-items: center;
          position: relative;
          flex-wrap: wrap;
          gap: 0;
        }
        .hero-stat {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 0 18px;
        }
        .hero-stat:first-child {
          padding-left: 0;
        }
        .hero-stat-val {
          font-size: 22px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
        }
        .hero-stat-key {
          font-size: 10px;
          color: #62739f;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .hero-divider {
          width: 1px;
          height: 34px;
          background: rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }

        /* ══ SUBJECT GRID ═══════════════════════════════════════════════════ */
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

        .delete-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 2;
          background: rgba(255, 80, 80, 0.15);
          border: 1px solid rgba(255, 80, 80, 0.3);
          color: #ff6b6b;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          font-size: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.18s;
        }
        .subject-card:hover .delete-badge {
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

        /* ══ GALLERY ════════════════════════════════════════════════════════ */
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
          color: #555;
          max-width: 300px;
          line-height: 1.7;
        }
        .upload-cta {
          margin-top: 6px;
          padding: 13px 30px;
          border-radius: 14px;
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          color: white;
          border: none;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 14px 30px rgba(108, 99, 255, 0.35);
          transition:
            transform 0.16s,
            box-shadow 0.16s;
        }
        .upload-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 36px rgba(108, 99, 255, 0.45);
        }

        /* ══ MODAL ══════════════════════════════════════════════════════════ */
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .modal {
          background: #12121e;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 24px;
          width: 100%;
          max-width: 360px;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .modal-title {
          font-size: 17px;
          font-weight: 800;
          color: #fff;
        }
        .modal-close {
          background: none;
          border: none;
          color: #555;
          font-size: 18px;
          cursor: pointer;
        }
        .modal-hint {
          font-size: 12px;
          color: #555;
          margin-bottom: 18px;
        }
        .modal-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 13px 16px;
          color: #e0e0e8;
          font-size: 15px;
          outline: none;
          margin-bottom: 6px;
        }
        .modal-input:focus {
          border-color: #6c63ff;
        }
        .modal-error {
          font-size: 12px;
          color: #ff5050;
          margin-bottom: 8px;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          margin-top: 18px;
        }
        .modal-cancel {
          flex: 1;
          padding: 13px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #888;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .modal-add {
          flex: 2;
          padding: 13px;
          border-radius: 12px;
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          color: #fff;
          border: none;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .modal-add:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        @media (max-width: 760px) {
          .group-title {
            font-size: 20px;
          }
          .hero-heading {
            font-size: 24px;
          }
          .hero-stat {
            padding: 0 12px;
          }
          .hero-stat-val {
            font-size: 18px;
          }
        }
      `}</style>
    </>
  );
}

// ────────────────────────────────────────────────────────────
//  GYAANI AI — Explanation Screen (Screen 7)
//  Mangesh — Day 2
//  File: frontend/pages/explanation.jsx
//
//  Shows after processing completes.
//  Tabs: Explanation | Listen | Quiz | Heatmap | Sticky Notes
//  Bilingual: Hindi + English side by side
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  chatWithBot,
  getExplanation,
  generateAudio,
  trackNoteInteraction,
} from "../services/api";

// ── Confusion color helper ─────────────────────────────────────
function confusionColor(score) {
  if (score < 0.3)
    return {
      bg: "rgba(67,233,123,0.12)",
      border: "rgba(67,233,123,0.3)",
      text: "#43E97B",
      label: "Confident",
    };
  if (score < 0.6)
    return {
      bg: "rgba(255,179,0,0.12)",
      border: "rgba(255,179,0,0.3)",
      text: "#FFB300",
      label: "Needs review",
    };
  return {
    bg: "rgba(255,80,80,0.12)",
    border: "rgba(255,80,80,0.3)",
    text: "#FF5050",
    label: "Confused",
  };
}
function normalizeConceptKey(value) {
  return (value || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

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
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js";
    script.onload = () => {
      _katexLoaded = true;
    };
    document.head.appendChild(script);
  } else if (window.katex) {
    _katexLoaded = true;
  }
  if (
    !window.marked &&
    !document.querySelector('script[src*="marked.min.js"]')
  ) {
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js";
    script.onload = () => {
      _markedLoaded = true;
    };
    document.head.appendChild(script);
  } else if (window.marked) {
    _markedLoaded = true;
  }
}

function applyMath(html) {
  if (!window.katex) return html;
  html = html.replace(/\$\$([^$]+?)\$\$|\\\[([^\]]+?)\\\]/gs, (match, a, b) => {
    try {
      return `<span class="math-display">${window.katex.renderToString((a || b).trim(), { displayMode: true, throwOnError: false })}</span>`;
    } catch {
      return match;
    }
  });
  html = html.replace(/\$([^$\n]+?)\$|\\\(([^)]+?)\\\)/g, (match, a, b) => {
    try {
      return `<span class="math-inline">${window.katex.renderToString((a || b).trim(), { displayMode: false, throwOnError: false })}</span>`;
    } catch {
      return match;
    }
  });
  return html;
}

function ChatMessage({ content }) {
  const ref = useRef(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    ensureChatLibs();
    const interval = setInterval(() => {
      if (window.katex && window.marked) {
        clearInterval(interval);
        setTick((value) => value + 1);
      }
    }, 150);
    return () => clearInterval(interval);
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

// ── Helper for Audio Duration ──────────────────────────────────
const formatTime = (time) => {
  if (!time || isNaN(time)) return "0:00";
  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
};

// ── TABS ──────────────────────────────────────────────────────
const TABS = [
  { id: "explain", icon: "✨", label: "Explanation" },
  { id: "listen", icon: "🎙️", label: "Listen" },
  { id: "quiz", icon: "🎯", label: "Quiz" },
  { id: "heatmap", icon: "🔥", label: "Heatmap" },
  { id: "stickynotes", icon: "📌", label: "Sticky Notes" },
];

// ── Sticky note helpers ────────────────────────────────────────
const STICKY_COLORS = [
  { id: "yellow", bg: "#FFF176", border: "#F9A825", text: "#3a3000" },
  { id: "purple", bg: "#E1BEE7", border: "#9C27B0", text: "#1a0028" },
  { id: "green", bg: "#C8E6C9", border: "#388E3C", text: "#003300" },
  { id: "blue", bg: "#BBDEFB", border: "#1976D2", text: "#001a33" },
  { id: "orange", bg: "#FFE0B2", border: "#E65100", text: "#3a1900" },
  { id: "pink", bg: "#F8BBD9", border: "#C2185B", text: "#3a0018" },
];
const STICKY_FONT_SIZES = [
  { id: "xs", label: "XS", px: 10 },
  { id: "sm", label: "S", px: 12 },
  { id: "md", label: "M", px: 14 },
  { id: "lg", label: "L", px: 17 },
  { id: "xl", label: "XL", px: 21 },
];
function makeSticky() {
  return {
    id: `sn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: "",
    colorId: "yellow",
    fontSizeId: "sm",
    x: 40 + Math.floor(Math.random() * 120),
    y: 40 + Math.floor(Math.random() * 80),
  };
}
function loadStickies(noteId) {
  try {
    return JSON.parse(
      localStorage.getItem(`gyaani_stickies_${noteId}`) || "[]",
    );
  } catch {
    return [];
  }
}
function saveStickies(noteId, arr) {
  try {
    localStorage.setItem(`gyaani_stickies_${noteId}`, JSON.stringify(arr));
  } catch {}
}

export function getNoteHasStickies(noteId) {
  try {
    const arr = JSON.parse(
      localStorage.getItem(`gyaani_stickies_${noteId}`) || "[]",
    );
    return arr.length > 0;
  } catch {
    return false;
  }
}

export default function Explanation() {
  const router = useRouter();
  const { noteId, concept } = router.query;

  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("explain");
  const [lang, setLang] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [mounted, setMounted] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Audio State
  const [playing, setPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const audioRef = useRef(null);
  const isScrubbing = useRef(false);
  const wasPlayingBeforeScrub = useRef(false);

  // Chat State
  const [doubtInput, setDoubtInput] = useState("");
  const [doubtMessages, setDoubtMessages] = useState([]);
  const [doubtLoading, setDoubtLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const doubtBottomRef = useRef(null);

  const trackedLangRef = useRef(null);
  const conceptRefs = useRef({});

  // Sticky Notes State
  const [stickies, setStickies] = useState([]);
  const [activeSticky, setActiveSticky] = useState(null);
  const stickyBoardRef = useRef(null);
  const dragRef = useRef(null);
  const textareaRefs = useRef({});
  const [pdfPages, setPdfPages] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [stickyBackgroundSrc, setStickyBackgroundSrc] = useState("");
  const pageWrapRef = useRef(null);

  // Quiz State
  const [quizzes, setQuizzes] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [deletingQuizId, setDeletingQuizId] = useState(null);

  const trackAudioStart = (audio, targetLang) => {
    if (!audio || !noteId) return;
    if ((audio.currentTime || 0) > 0.75) return;
    const replays = parseInt(localStorage.getItem("audio_replays") || "0");
    localStorage.setItem("audio_replays", String(replays + 1));
    trackNoteInteraction(noteId, "audio_playback_loop", targetLang).catch(
      (err) => {
        console.error("Failed to track audio replay", err);
      },
    );
  };

  useEffect(() => {
    if (!router.isReady) return;
    setMounted(true);
    setData(null);
    const id = noteId || "mock";
    let pollInterval = null;

    async function fetchWithRetry() {
      try {
        const statusRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/notes/${id}/status`,
        );
        const status = await statusRes.json();

        if (status.processing_status === "processing") {
          setProcessing(true);
          return;
        }

        if (status.processing_status === "blocked") {
          clearInterval(pollInterval);
          router.replace(
            `/upload?error=${encodeURIComponent(
              status.user_message ||
                status.error ||
                "The uploaded content goes against our safety guidelines. Please try a different file.",
            )}`,
          );
          return;
        }

        clearInterval(pollInterval);
        setProcessing(false);
        const result = await getExplanation(id);
        setData(result);
        if (result.language) {
          setLang(result.language === "hi-en" ? "both" : result.language);
        }
      } catch (err) {
        console.error(err);
        clearInterval(pollInterval);
      }
    }

    fetchWithRetry();
    pollInterval = setInterval(fetchWithRetry, 3000);
    return () => clearInterval(pollInterval);
  }, [router.isReady, noteId]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlaying(false);
      setAudioProgress(0);
      setAudioDuration(0);
      setAudioReady(false);
    }
  }, [lang]);

  useEffect(() => {
    if (!noteId || !data || !lang) return;
    if (trackedLangRef.current === null) {
      trackedLangRef.current = lang;
      return;
    }
    if (trackedLangRef.current !== lang && lang !== "en" && lang !== "both") {
      trackNoteInteraction(noteId, "translation_used", lang).catch((err) => {
        console.error("Failed to track translation usage", err);
      });
    }
    trackedLangRef.current = lang;
  }, [lang, noteId, data]);

  useEffect(() => {
    if (!data) return;
    const allowed = new Set(
      TABS.filter((tab) => {
        if (tab.id === "heatmap") return data.has_source_file === true;
        if (tab.id === "stickynotes") return data.has_source_file !== false;
        return true;
      }).map((tab) => tab.id),
    );
    if (!allowed.has(activeTab)) {
      setActiveTab("explain");
    }
  }, [activeTab, data]);

  // Signal Tracking
  useEffect(() => {
    if (!data) return;
    const startTime = Date.now();
    return () => {
      const seconds = Math.round((Date.now() - startTime) / 1000);
      const minutes = parseFloat((seconds / 60).toFixed(2));
      const prevSecs = parseInt(
        localStorage.getItem("total_study_seconds") || "0",
      );
      localStorage.setItem("total_study_seconds", String(prevSecs + seconds));
      const prevExp = parseFloat(
        localStorage.getItem("time_on_explanation") || "0",
      );
      localStorage.setItem(
        "time_on_explanation",
        String(parseFloat((prevExp + minutes).toFixed(2))),
      );

      if (noteId && minutes > 0) {
        trackNoteInteraction(
          noteId,
          "time_on_explanation",
          null,
          minutes,
        ).catch(console.error);
      }
    };
  }, [data, noteId]);

  const formatQuizScore = (score) => {
    const pct = Math.max(0, Math.min(100, Number(score || 0)));
    const rounded = Math.round(pct * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
  };

  const getQuizScoreColor = (score) => {
    const pct = Math.max(0, Math.min(100, Number(score || 0)));
    if (pct >= 90) return "#43E97B";
    if (pct >= 75) return "#43E97B";
    if (pct >= 60) return "#4FACFE";
    if (pct >= 45) return "#FFB300";
    return "#FF6B6B";
  };

  const formatQuizDateTime = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const fetchQuizzes = async () => {
    if (!noteId) return;
    try {
      const BASE_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("token") || "prototype_default_token"
          : "prototype_default_token";
      const resp = await fetch(`${BASE_URL}/quiz/by_note/${noteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const result = await resp.json();
        setQuizzes(
          (result.quizzes || []).filter(
            (quiz) => Number(quiz?.num_attempts || 0) > 0,
          ),
        );
        return;
      }
    } catch (err) {
      console.error("Failed to fetch quizzes:", err);
    }
    setQuizzes([]);
  };

  useEffect(() => {
    fetchQuizzes();
  }, [noteId]);

  const generateNewQuiz = () => {
    if (!noteId) return;
    router.push(`/quiz?noteId=${noteId}`);
  };

  const startQuiz = (quizId) => {
    router.push(`/quiz?noteId=${noteId}&quizId=${quizId}`);
  };

  const viewQuizSummary = (quizId) => {
    router.push(`/quiz?noteId=${noteId}&quizId=${quizId}&view=summary`);
  };

  const deleteQuiz = async (quizId) => {
    if (!noteId || !quizId || deletingQuizId) return;
    if (!window.confirm("Delete this saved quiz?")) return;
    try {
      setDeletingQuizId(quizId);
      const BASE_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("token") || "prototype_default_token"
          : "prototype_default_token";
      const resp = await fetch(`${BASE_URL}/quiz/${noteId}/${quizId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Failed to delete quiz");
      setQuizzes((prev) => prev.filter((quiz) => quiz.quiz_id !== quizId));
    } catch (err) {
      console.error("Failed to delete quiz:", err);
    } finally {
      setDeletingQuizId(null);
    }
  };

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  useEffect(() => {
    if (!data || !concept) return;
    const target = normalizeConceptKey(concept);
    if (!target) return;
    const matchedSection = (data.sections || []).find(
      (section) =>
        section.type === "concept" &&
        normalizeConceptKey(section.english) === target,
    );
    if (!matchedSection) return;
    setExpanded((prev) => ({ ...prev, [matchedSection.id]: true }));
    const timer = setTimeout(() => {
      conceptRefs.current[matchedSection.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [concept, data]);

  useEffect(() => {
    doubtBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [doubtMessages, doubtLoading]);

  async function sendDoubt(prefill = null, options = {}) {
    const text = (prefill ?? doubtInput).trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const userMsg = { role: "user", content: text, time };
    setDoubtMessages([...doubtMessages, userMsg]);
    setDoubtInput("");
    setDoubtLoading(true);

    try {
      const aiTime = new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const d = await chatWithBot({
        message: text,
        noteId: data?.note_id || noteId || null,
        contextType: "explanation",
        is_audio: !!options.isAudio,
      });
      setDoubtMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            d.response || d.reply || d.content || "I'll help you with that!",
          audio_url: d.audio_url || null,
          time: aiTime,
        },
      ]);
    } catch {
      const aiTime = new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      setDoubtMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, couldn't connect right now. Please try again.",
          time: aiTime,
        },
      ]);
    } finally {
      setDoubtLoading(false);
    }
  }

  function handleDoubtVoice() {
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
      await sendDoubt(transcript, { isAudio: true });
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  }

  // Audio Playback Setup & Progress Handling
  const setupAudioTracking = (audioEl) => {
    if (!audioEl) return;

    const syncProgress = () => {
      // Only sync the progress bar if the user isn't holding the slider
      if (!isScrubbing.current) {
        setAudioProgress(audioEl.currentTime || 0);
      }
    };
    const syncDuration = () => {
      setAudioDuration(
        Number.isFinite(audioEl.duration) ? audioEl.duration : 0,
      );
      setAudioReady(true);
    };
    const handleEnded = () => {
      setPlaying(false);
      setAudioProgress(0);
      setAudioReady(true);
    };
    const handlePause = () => setPlaying(false);
    const handlePlay = () => setPlaying(true);

    audioEl.addEventListener("timeupdate", syncProgress);
    audioEl.addEventListener("loadedmetadata", syncDuration);
    audioEl.addEventListener("durationchange", syncDuration);
    audioEl.addEventListener("canplay", syncDuration);
    audioEl.addEventListener("ended", handleEnded);
    audioEl.addEventListener("pause", handlePause);
    audioEl.addEventListener("play", handlePlay);
  };

  const handleSeekStart = () => {
    const audio = audioRef.current;
    isScrubbing.current = true;
    wasPlayingBeforeScrub.current = Boolean(audio && !audio.paused);
  };

  const handleAudioScrub = (e) => {
    const nextTime = Number(e.target.value) || 0;
    if (audioRef.current && Number.isFinite(nextTime)) {
      audioRef.current.currentTime = nextTime;
    }
    setAudioProgress(nextTime);
  };

  const handleSeekEnd = async (e) => {
    const nextTime = Number(e.target.value) || 0;
    const audio = audioRef.current;

    if (audio) {
      audio.currentTime = nextTime;
      setAudioProgress(nextTime);

      if (wasPlayingBeforeScrub.current) {
        try {
          await audio.play();
        } catch (err) {
          console.error("Audio resume after seek failed", err);
        }
      }
    }

    isScrubbing.current = false;
    wasPlayingBeforeScrub.current = false;
  };

  useEffect(() => {
    if (!router.isReady) return;
    setStickies(loadStickies(noteId || "mock"));
  }, [router.isReady, noteId]);

  useEffect(() => {
    if (!data || data.file_type !== "pdf" || !data.image_url) return;
    if (activeTab !== "stickynotes") return;
    if (pdfPages.length > 0) return;
    setPdfPages([]);
    setPdfLoading(true);

    async function renderPdf() {
      try {
        if (!window.pdfjsLib) {
          await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        let arrayBuf = null;
        const proxyUrl = `/api/pdf-proxy?url=${encodeURIComponent(data.image_url)}`;
        try {
          const resp = await fetch(proxyUrl);
          if (resp.ok) arrayBuf = await resp.arrayBuffer();
        } catch (_) {}

        if (!arrayBuf) {
          try {
            const resp = await fetch(data.image_url);
            if (resp.ok) arrayBuf = await resp.arrayBuffer();
          } catch (_) {}
        }

        let pdf;
        if (arrayBuf) {
          pdf = await window.pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuf),
          }).promise;
        } else {
          pdf = await window.pdfjsLib.getDocument(data.image_url).promise;
        }

        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;
          pages.push(canvas.toDataURL("image/jpeg", 0.92));
        }
        setPdfPages(pages);
      } catch (err) {
        console.error("PDF render failed:", err);
        setPdfPages(["error"]);
      } finally {
        setPdfLoading(false);
      }
    }
    renderPdf();
  }, [data?.image_url, data?.file_type, activeTab]);

  useEffect(() => {
    if (
      activeTab !== "stickynotes" ||
      data?.file_type === "pdf" ||
      !data?.image_url
    ) {
      setStickyBackgroundSrc("");
      return;
    }

    let cancelled = false;
    async function preloadStickyImage() {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous"; // ✅ critical
        img.src = data.image_url;

        img.onload = () => {
          if (!cancelled) {
            setStickyBackgroundSrc(data.image_url);
          }
        };

        img.onerror = (err) => {
          console.error("Sticky background preload failed:", err);
          if (!cancelled) setStickyBackgroundSrc("");
        };
      } catch (err) {
        console.error("Sticky background preload failed:", err);
        if (!cancelled) setStickyBackgroundSrc("");
      }
    }

    preloadStickyImage();
    return () => {
      cancelled = true;
    };
  }, [activeTab, data?.file_type, data?.image_url]);

  async function downloadAnnotated() {
    const wrap = pageWrapRef.current;
    if (!wrap) return;
    try {
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src =
            "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const captureBackground =
        data?.file_type === "pdf"
          ? ""
          : stickyBackgroundSrc || data?.image_url || "";
      const backgroundImage = wrap.querySelector(".sn-bg-img");
      if (
        backgroundImage &&
        captureBackground &&
        backgroundImage.src !== captureBackground
      ) {
        backgroundImage.src = captureBackground;
        await new Promise((resolve) => {
          if (backgroundImage.complete) return resolve();
          backgroundImage.onload = () => resolve();
          backgroundImage.onerror = () => resolve();
        });
      }

      const canvas = await window.html2canvas(wrap, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: null,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `gyaani_notes_${noteId || "note"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Download failed:", err);
      alert("Download failed. Please take a screenshot instead.");
    }
  }

  useEffect(() => {
    stickies.forEach((s) => {
      const el = textareaRefs.current[s.id];
      if (!el) return;
      el.style.height = "0";
      el.style.height = el.scrollHeight + "px";
    });
  }, [stickies]);

  function stickyPersist(next) {
    setStickies(next);
    saveStickies(noteId || "mock", next);
  }
  function stickyAdd() {
    const note = makeSticky();
    stickyPersist([...stickies, note]);
    setActiveSticky(note.id);
  }
  function stickyUpdate(id, patch) {
    stickyPersist(stickies.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function stickyDelete(id) {
    stickyPersist(stickies.filter((s) => s.id !== id));
    if (activeSticky === id) setActiveSticky(null);
  }
  function stickyBringFront(id) {
    const note = stickies.find((s) => s.id === id);
    if (!note) return;
    stickyPersist([...stickies.filter((s) => s.id !== id), note]);
  }
  function stickyStartDrag(e, id) {
    e.preventDefault();
    const sticky = stickies.find((s) => s.id === id);
    if (!sticky) return;
    stickyBringFront(id);
    setActiveSticky(id);
    const board = stickyBoardRef.current;
    const boardRect = board
      ? board.getBoundingClientRect()
      : { left: 0, top: 0 };
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = {
      id,
      offX: cx - boardRect.left - sticky.x,
      offY: cy - boardRect.top - sticky.y,
    };

    function onMove(ev) {
      if (!dragRef.current) return;
      const b = stickyBoardRef.current;
      const rect = b
        ? b.getBoundingClientRect()
        : { left: 0, top: 0, width: 600, height: 800 };
      const mx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const my = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const nx = Math.max(0, mx - rect.left - dragRef.current.offX);
      const ny = Math.max(0, my - rect.top - dragRef.current.offY);
      stickyUpdate(dragRef.current.id, { x: nx, y: ny });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  }

  if (processing) return <ProcessingScreen />;
  if (!data) return <LoadingScreen />;

  const overallColor = confusionColor(
    typeof data.overall_confusion === "number"
      ? data.overall_confusion
      : (data.mean_confusion ?? 0.5),
  );

  const availableTabs = TABS.filter((tab) => {
    if (tab.id === "heatmap") return data.has_source_file === true;
    if (tab.id === "stickynotes") return data.has_source_file !== false;
    return true;
  });

  return (
    <>
      <Head>
        <title>{data.topic} — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div className={`page ${mounted ? "mounted" : ""}`}>
        {/* ── HEADER ── */}
        <header className="header">
          <button className="back-btn" onClick={() => router.push("/")}>
            ← Home
          </button>
          <div className="header-center">
            {data.subject && (
              <span className="header-subject-chip">{data.subject}</span>
            )}
            <span className="header-sep">·</span>
            <span className="header-main-title">
              {data.topic || "AI Explanation"}
            </span>
          </div>
          <div className="header-right-group">
            {data.has_heatmap !== false && (
              <div
                className="header-conf-pill"
                style={{
                  background: overallColor.bg,
                  border: `1px solid ${overallColor.border}`,
                  color: overallColor.text,
                }}
              >
                <span
                  className="header-conf-dot"
                  style={{ background: overallColor.text }}
                />
                <span>
                  {Math.round(
                    (typeof data.overall_confusion === "number"
                      ? data.overall_confusion
                      : (data.mean_confusion ?? 0.5)) * 100,
                  )}
                  % confused
                </span>
              </div>
            )}
            {activeTab === "explain" || activeTab === "listen" ? (
              <div className="lang-dropdown-wrap">
                <select
                  className="lang-dropdown"
                  value={lang ?? "both"}
                  onChange={(e) => setLang(e.target.value)}
                >
                  <option value="both">हि + EN</option>
                  <option value="hi">हिंदी</option>
                  <option value="en">English</option>
                  <option value="ta">தமிழ்</option>
                  <option value="te">తెలుగు</option>
                  <option value="bn">বাংলা</option>
                </select>
              </div>
            ) : null}
          </div>
        </header>

        {/* ── TABS ── */}
        <div className="tabs-bar tabs-bar--center">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? "tab-active" : ""}`}
              onClick={() => {
                if (tab.id === "heatmap") {
                  // This redirects to the heatmap page with the specific note ID
                  router.push(`/heatmap?noteId=${noteId}`);
                } else {
                  setActiveTab(tab.id);
                }
              }}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="tab-content">
          {/* ── DOUBT SIDEBAR — shown for explain + listen tabs ── */}
          {activeTab === "explain" || activeTab === "listen" ? (
            <div className="content-with-doubt">
              {/* LEFT — main content (2/3) */}
              <div className="content-main">
                {/* ══ EXPLANATION TAB ══ */}
                {activeTab === "explain" && (
                  <div className="explain-list">
                    {/* ───────── MAIN EXPLANATION ───────── */}
                    <div key="main-explanation">
                      <div className="main-explanation">
                        <h2 className="main-title">Main Explanation</h2>
                        <div className="main-text">
                          {(() => {
                            const effectiveLang = lang ?? "both";
                            const t = data.translations || {};

                            // Simplified rendering for hi-en without Page splitting
                            if (effectiveLang === "both") {
                              return (
                                <div className="page-block">
                                  <div className="page-hi">
                                    {t.hi_en || t.hi || t.en}
                                  </div>
                                </div>
                              );
                            }

                            const text =
                              t[effectiveLang] ||
                              t.en ||
                              "No explanation available.";
                            return <div>{text}</div>;
                          })()}
                        </div>
                      </div>
                      <h2 className="concepts-heading">Concepts Used</h2>
                    </div>

                    {/* ───────── CONCEPTS ───────── */}
                    {(data.sections || [])
                      .filter((sec) => sec.type === "concept")
                      .map((sec) => {
                        const secId = sec.id;
                        const open = expanded[secId];
                        function pick(base) {
                          const effectiveLang = lang ?? "both";
                          const en = sec[`${base}_en`] || "";
                          const hi = sec[`${base}_hi`] || "";
                          const hiEn = sec[`${base}_hi_en`] || "";
                          const loc =
                            effectiveLang !== "en" && effectiveLang !== "both"
                              ? sec[`${base}_${effectiveLang}`] || ""
                              : "";
                          if (effectiveLang === "both")
                            return {
                              primary: hiEn || hi || en,
                              secondary: "",
                            };
                          if (effectiveLang === "en")
                            return { primary: en, secondary: "" };
                          return {
                            primary: loc || en,
                            secondary: loc ? en : "",
                          };
                        }
                        const termVals = pick("term");

                        return (
                          <div
                            key={secId}
                            className="concept-card"
                            ref={(el) => {
                              conceptRefs.current[secId] = el;
                            }}
                          >
                            <div
                              className="concept-header"
                              onClick={() => toggleExpand(secId)}
                            >
                              <span className="concept-name">
                                <span style={{ display: "block" }}>
                                  {termVals.primary}
                                </span>
                                {termVals.secondary && (
                                  <span
                                    style={{
                                      display: "block",
                                      fontSize: 11,
                                      color: "#555",
                                      fontWeight: 400,
                                      marginTop: 2,
                                    }}
                                  >
                                    {termVals.secondary}
                                  </span>
                                )}
                              </span>
                              <span
                                className={`difficulty-badge diff-${sec.difficulty}`}
                              >
                                {sec.difficulty}
                              </span>
                            </div>
                            {open && (
                              <div className="concept-body">
                                {(() => {
                                  const v = pick("definition");
                                  return v.primary || v.secondary ? (
                                    <div className="concept-section">
                                      <h4>Definition</h4>
                                      {v.primary && (
                                        <p className="explanation-text">
                                          {v.primary}
                                        </p>
                                      )}
                                      {v.secondary && (
                                        <p
                                          className="explanation-text"
                                          style={{
                                            color: "#555",
                                            fontSize: 12,
                                            marginTop: 6,
                                          }}
                                        >
                                          {v.secondary}
                                        </p>
                                      )}
                                    </div>
                                  ) : null;
                                })()}
                                {(() => {
                                  const v = pick("example");
                                  return v.primary || v.secondary ? (
                                    <div className="concept-section">
                                      <h4>Example</h4>
                                      {v.primary && (
                                        <p className="explanation-text">
                                          {v.primary}
                                        </p>
                                      )}
                                      {v.secondary && (
                                        <p
                                          className="explanation-text"
                                          style={{
                                            color: "#555",
                                            fontSize: 12,
                                            marginTop: 6,
                                          }}
                                        >
                                          {v.secondary}
                                        </p>
                                      )}
                                    </div>
                                  ) : null;
                                })()}
                                {(() => {
                                  const v = pick("context");
                                  return v.primary || v.secondary ? (
                                    <div className="concept-section">
                                      <h4>Context</h4>
                                      {v.primary && (
                                        <p className="explanation-text">
                                          {v.primary}
                                        </p>
                                      )}
                                      {v.secondary && (
                                        <p
                                          className="explanation-text"
                                          style={{
                                            color: "#555",
                                            fontSize: 12,
                                            marginTop: 6,
                                          }}
                                        >
                                          {v.secondary}
                                        </p>
                                      )}
                                    </div>
                                  ) : null;
                                })()}
                                {sec.related_topics?.length > 0 && (
                                  <div className="concept-section">
                                    <h4>Related Topics</h4>
                                    <div className="chip-row">
                                      {sec.related_topics.map((topic) => (
                                        <span
                                          key={topic}
                                          className="topic-chip"
                                        >
                                          {topic}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {sec.prerequisites?.length > 0 && (
                                  <div className="concept-section">
                                    <h4>Prerequisites</h4>
                                    <div className="chip-row">
                                      {sec.prerequisites.map((topic) => (
                                        <span
                                          key={topic}
                                          className="topic-chip"
                                        >
                                          {topic}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="concept-section">
                                  <h4>Learn More</h4>
                                  <div style={{ display: "flex", gap: "10px" }}>
                                    {sec.visual_link && (
                                      <a
                                        href={sec.visual_link}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        🖼 Visual Aid
                                      </a>
                                    )}
                                    {sec.wikipedia_link && (
                                      <a
                                        href={sec.wikipedia_link}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        📖 Wikipedia
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* ══ LISTEN TAB ══ */}
                {activeTab === "listen" && (
                  <div
                    className="listen-section"
                    style={{ justifyContent: "center", minHeight: "60vh" }}
                  >
                    <div className="audio-hero">
                      <div
                        className={`audio-orb ${playing ? "orb-playing" : ""}`}
                      >
                        {/* CHANGED TO MIC SYMBOL */}
                        <span className="audio-orb-icon">
                          {playing ? "🎙️" : "🎙️"}
                        </span>
                        <div className="orb-wave w1" />
                        <div className="orb-wave w2" />
                        <div className="orb-wave w3" />
                      </div>
                      <p className="audio-title">Audio Explanation</p>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        maxWidth: "400px",
                        margin: "0 auto",
                      }}
                    >
                      <button
                        className={`play-btn ${playing ? "pause-btn" : ""}`}
                        onClick={async () => {
                          if (audioLoading) return;
                          if (!audioRef.current) {
                            const targetLang = lang === "both" ? "hi_en" : lang;
                            let audioUrl = data?.audio_urls?.[targetLang];
                            if (!audioUrl) {
                              try {
                                setAudioLoading(true);
                                const result = await generateAudio(
                                  noteId,
                                  targetLang,
                                );
                                setData((prev) => ({
                                  ...prev,
                                  audio_urls: {
                                    ...prev.audio_urls,
                                    ...result.audio_urls,
                                  },
                                }));
                                audioUrl = result.audio_urls?.[targetLang];
                              } catch (err) {
                                console.error("Audio generation failed", err);
                              } finally {
                                setAudioLoading(false);
                              }
                            }
                            if (!audioUrl) return;
                            const nextAudio = new Audio(audioUrl);
                            nextAudio.preload = "auto";
                            setAudioReady(false);
                            setAudioProgress(0);
                            setAudioDuration(0);
                            audioRef.current = nextAudio;
                            setupAudioTracking(nextAudio);
                            await nextAudio.play();
                            trackAudioStart(nextAudio, targetLang);
                            setPlaying(true);
                          } else {
                            if (playing) {
                              audioRef.current.pause();
                              setPlaying(false);
                            } else {
                              await audioRef.current.play();
                              trackAudioStart(
                                audioRef.current,
                                lang === "both" ? "hi_en" : lang,
                              );
                              setPlaying(true);
                            }
                          }
                        }}
                      >
                        {audioLoading ? (
                          <>
                            <span className="audio-spinner" />
                            Generating audio...
                          </>
                        ) : playing ? (
                          "⏸ Pause"
                        ) : (
                          "🎙️ Listen Now"
                        )}
                      </button>

                      {/* Progress Bar */}
                      {(audioReady || audioDuration > 0 || audioProgress > 0) &&
                        !audioLoading && (
                          <div style={{ marginTop: "20px", width: "100%" }}>
                            <input
                              type="range"
                              min="0"
                              max={audioDuration || 100}
                              step="any"
                              value={audioProgress}
                              onMouseDown={handleSeekStart}
                              onTouchStart={handleSeekStart}
                              onChange={handleAudioScrub}
                              onMouseUp={handleSeekEnd}
                              onTouchEnd={handleSeekEnd}
                              className="audio-slider"
                              style={{
                                backgroundSize: `${
                                  audioDuration
                                    ? Math.min(
                                        100,
                                        (audioProgress / audioDuration) * 100,
                                      )
                                    : 0
                                }% 100%`,
                              }}
                            />
                            <div className="audio-time">
                              <span>{formatTime(audioProgress)}</span>
                              <span>{formatTime(audioDuration)}</span>
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT — doubt chat panel (1/3) */}
              <div className="doubt-panel">
                <div className="doubt-header">
                  <span className="doubt-header-icon">💬</span>
                  <div>
                    <p className="doubt-header-title">Ask a Doubt</p>
                    <p className="doubt-header-sub">
                      Ask anything about this topic
                    </p>
                  </div>
                </div>
                {/* Messages */}
                <div className="doubt-messages">
                  {doubtMessages.length === 0 && (
                    <div className="doubt-empty">
                      <span style={{ fontSize: 32 }}>🤖</span>
                      <p className="doubt-empty-text">
                        Ask any doubt about <strong>{data.topic}</strong>
                      </p>
                      <div className="doubt-chips">
                        {[
                          `What is ${data.topic}?`,
                          "Explain with an example",
                          "Why is this important?",
                          "What are prerequisites?",
                        ].map((q) => (
                          <button
                            key={q}
                            className="doubt-chip"
                            onClick={() => setDoubtInput(q)}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {doubtMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`doubt-bubble-row ${msg.role === "user" ? "doubt-bubble-row--user" : "doubt-bubble-row--ai"}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="doubt-ai-avatar">🤖</div>
                      )}
                      <div
                        className={`doubt-bubble ${msg.role === "user" ? "doubt-bubble--user" : "doubt-bubble--ai"}`}
                      >
                        {msg.role === "assistant" ? (
                          <div className="doubt-bubble-text">
                            <ChatMessage content={msg.content} />
                            {msg.audio_url && (
                              <AudioMessage audioUrl={msg.audio_url} />
                            )}
                          </div>
                        ) : (
                          <p className="doubt-bubble-text">{msg.content}</p>
                        )}
                        <span className="doubt-bubble-time">{msg.time}</span>
                      </div>
                    </div>
                  ))}
                  {doubtLoading && (
                    <div className="doubt-bubble-row doubt-bubble-row--ai">
                      <div className="doubt-ai-avatar">🤖</div>
                      <div className="doubt-bubble doubt-bubble--ai doubt-typing">
                        <span className="dt" />
                        <span className="dt" />
                        <span className="dt" />
                      </div>
                    </div>
                  )}
                  <div ref={doubtBottomRef} />
                </div>
                {/* Input */}
                <div className="doubt-input-row">
                  <input
                    className="doubt-input"
                    placeholder="Type your doubt here…"
                    value={doubtInput}
                    onChange={(e) => setDoubtInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendDoubt();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="doubt-send-btn"
                    title="Voice input"
                    disabled={doubtLoading || isListening}
                    onClick={handleDoubtVoice}
                    style={{
                      background: isListening
                        ? "linear-gradient(135deg, #6c63ff, #8b5cf6)"
                        : undefined,
                    }}
                  >
                    🎙️
                  </button>
                  <button
                    className="doubt-send-btn"
                    disabled={doubtLoading || !doubtInput.trim()}
                    onClick={() => sendDoubt()}
                  >
                    {doubtLoading ? <span className="doubt-spinner" /> : "↑"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* NON-DOUBT TABS — full width */
            <div className="non-doubt-tabs">
              {/* ══ QUIZ TAB — CENTERED & CLEAN ══ */}
              {activeTab === "quiz" && (
                <div className="quiz-advanced-shell">
                  <div className="quiz-hero-card-advanced">
                    <span className="quiz-big-icon">🎯</span>
                    <h2 className="quiz-hero-title">Knowledge Challenge</h2>
                    <p className="quiz-hero-sub">
                      Let's test your understanding of{" "}
                      <strong>{data.topic}</strong>. Adaptive questions
                      generated based on your confusion heatmap.
                    </p>
                    <button
                      className="quiz-prime-btn"
                      onClick={generateNewQuiz}
                      disabled={quizLoading}
                    >
                      {quizLoading ? "Analyzing..." : "Generate New Quiz →"}
                    </button>
                  </div>

                  {quizzes.length > 0 && (
                    <div className="quiz-history-section">
                      <h3 className="history-label">Previous Attempts</h3>
                      <div className="quiz-grid-advanced">
                        {quizzes.map((quiz) => (
                          <div
                            key={quiz.quiz_id}
                            className="quiz-card-advanced"
                          >
                            <div className="quiz-card-top">
                              <span className="quiz-card-qs">
                                {quiz.num_questions} Questions
                              </span>
                              <button
                                className="quiz-card-del"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteQuiz(quiz.quiz_id);
                                }}
                              >
                                ×
                              </button>
                            </div>
                            <div className="quiz-card-scores">
                              <div className="score-item">
                                <span className="s-label">Best</span>
                                <span
                                  className="s-val"
                                  style={{
                                    color: getQuizScoreColor(quiz.best_score),
                                  }}
                                >
                                  {formatQuizScore(quiz.best_score)}
                                </span>
                              </div>
                              <div className="score-sep" />
                              <div className="score-item">
                                <span className="s-label">Avg</span>
                                <span
                                  className="s-val"
                                  style={{
                                    color: getQuizScoreColor(quiz.avg_score),
                                  }}
                                >
                                  {formatQuizScore(quiz.avg_score)}
                                </span>
                              </div>
                            </div>
                            <div className="quiz-card-meta">
                              {formatQuizDateTime(
                                quiz.attempts?.[0]?.attempted_at ||
                                  quiz.generated_at,
                              )}
                            </div>
                            <div className="quiz-card-actions">
                              <button
                                className="quiz-card-btn quiz-card-btn--primary"
                                onClick={() => startQuiz(quiz.quiz_id)}
                              >
                                Start Quiz
                              </button>
                              <button
                                className="quiz-card-btn quiz-card-btn--ghost"
                                onClick={() => viewQuizSummary(quiz.quiz_id)}
                              >
                                View Summary
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ══ HEATMAP TAB — DIRECT IMAGE FOCUS ══ */}
              {activeTab === "heatmap" && (
                <div className="heatmap-preview">
                  <div
                    className="heatmap-hero-card"
                    style={{ maxWidth: "1000px", width: "100%" }}
                  >
                    <div style={{ textAlign: "center", marginBottom: "20px" }}>
                      <span className="heatmap-hero-icon">🔥</span>
                      <h2 className="heatmap-hero-title">Confusion Heatmap</h2>
                      <p className="heatmap-hero-sub">
                        Visual overlay showing zones where GYAANI AI detected
                        gaps in clarity.
                      </p>
                    </div>

                    {/* DIRECT IMAGE VIEW */}
                    <div className="heatmap-main-view">
                      <div className="heatmap-img-wrap">
                        <img
                          src={
                            data.heatmap_url ||
                            data.heatmap_image_url ||
                            data.image_url
                          }
                          alt="Confusion Heatmap Overlay"
                          className="heatmap-img-actual"
                        />
                        <div className="heatmap-badge">AI Analysis Layer</div>
                      </div>
                    </div>

                    <div
                      className="heatmap-stats"
                      style={{ marginTop: "24px" }}
                    >
                      <div className="heatmap-stat">
                        <span
                          className="heatmap-stat-num"
                          style={{ color: overallColor.text }}
                        >
                          {Math.round(data.overall_confusion * 100)}%
                        </span>
                        <span className="heatmap-stat-label">Confusion</span>
                      </div>
                      <div className="heatmap-stat">
                        <span
                          className="heatmap-stat-num"
                          style={{ color: "#43E97B" }}
                        >
                          {Math.round((1 - data.overall_confusion) * 100)}%
                        </span>
                        <span className="heatmap-stat-label">Clarity</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══ STICKY NOTES TAB ══ */}
              {activeTab === "stickynotes" && (
                <div className="sn-split-layout">
                  <div className="sn-left-panel">
                    <div className="sn-toolbar">
                      <button className="sn-add-btn" onClick={stickyAdd}>
                        + Add Note
                      </button>
                      <span className="sn-count">
                        {stickies.length} note{stickies.length !== 1 ? "s" : ""}
                      </span>
                      {stickies.length > 0 && (
                        <button
                          className="sn-clear-btn"
                          onClick={() => {
                            if (!confirm("Delete all sticky notes?")) return;
                            stickyPersist([]);
                            setActiveSticky(null);
                          }}
                        >
                          Clear all
                        </button>
                      )}
                      <div className="sn-toolbar-right">
                        <span className="sn-hint">
                          Drag · click to edit · × to delete
                        </span>
                        <button
                          className="sn-download-btn"
                          onClick={downloadAnnotated}
                          title="Download annotated note"
                        >
                          ↓ Download
                        </button>
                      </div>
                    </div>
                    <div
                      className="sn-board"
                      ref={stickyBoardRef}
                      onClick={() => setActiveSticky(null)}
                    >
                      <div className="sn-page-wrap" ref={pageWrapRef}>
                        {data.image_url && data.file_type !== "pdf" && (
                          <img
                            src={stickyBackgroundSrc || data.image_url}
                            className="sn-bg-img"
                            alt="Uploaded note"
                            draggable={false}
                          />
                        )}
                        {data.file_type === "pdf" && (
                          <div className="sn-pdf-pages">
                            {pdfLoading && (
                              <div className="sn-pdf-loading">
                                <div className="sn-pdf-spinner" />
                                <p>Rendering PDF pages…</p>
                              </div>
                            )}
                            {!pdfLoading && pdfPages[0] === "error" && (
                              <div className="sn-pdf-fallback">
                                <div className="sn-pdf-fallback-header">
                                  <span style={{ fontSize: 28 }}>📄</span>
                                  <div>
                                    <p className="sn-fb-title">
                                      PDF Preview Unavailable
                                    </p>
                                    <p className="sn-fb-sub">
                                      Your sticky notes are still saved below
                                    </p>
                                  </div>
                                </div>
                                {data.extracted_text && (
                                  <div className="sn-pdf-ocr-preview">
                                    <p className="sn-ocr-label">
                                      📖 Note Content (OCR)
                                    </p>
                                    <pre className="sn-ocr-text">
                                      {data.extracted_text}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                            {!pdfLoading &&
                              pdfPages.length > 0 &&
                              pdfPages[0] !== "error" &&
                              pdfPages.map((dataUrl, i) => (
                                <img
                                  key={i}
                                  src={dataUrl}
                                  className="sn-bg-img sn-pdf-page"
                                  alt={`Page ${i + 1}`}
                                  draggable={false}
                                />
                              ))}
                          </div>
                        )}
                        {!data.image_url && (
                          <div className="sn-no-file">
                            <span style={{ fontSize: 40 }}>📄</span>
                            <p>Original file not available</p>
                          </div>
                        )}
                        {stickies.length === 0 && data.image_url && (
                          <div className="sn-board-hint">
                            Tap <strong>+ Add Note</strong> to annotate your
                            notes
                          </div>
                        )}
                        {stickies.map((s) => {
                          const col =
                            STICKY_COLORS.find((c) => c.id === s.colorId) ||
                            STICKY_COLORS[0];
                          const fontSize =
                            STICKY_FONT_SIZES.find(
                              (f) => f.id === s.fontSizeId,
                            ) || STICKY_FONT_SIZES[1];
                          const isActive = activeSticky === s.id;
                          return (
                            <div
                              key={s.id}
                              className={`sn-note${isActive ? " sn-note--active" : ""}`}
                              style={{
                                left: s.x,
                                top: s.y,
                                background: col.bg,
                                border: `1.5px solid ${isActive ? col.border : "rgba(0,0,0,0.08)"}`,
                                boxShadow: isActive
                                  ? `2px 4px 16px rgba(0,0,0,0.4), 0 0 0 2px ${col.border}66`
                                  : "2px 3px 8px rgba(0,0,0,0.28)",
                                zIndex: isActive ? 200 : 10,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                stickyBringFront(s.id);
                                setActiveSticky(s.id);
                              }}
                            >
                              <div
                                className="sn-handle"
                                style={{ background: col.border + "22" }}
                                onMouseDown={(e) => stickyStartDrag(e, s.id)}
                                onTouchStart={(e) => stickyStartDrag(e, s.id)}
                              >
                                <span
                                  className="sn-grip"
                                  style={{ color: col.text }}
                                >
                                  ⠿
                                </span>
                                {isActive && (
                                  <div
                                    className="sn-controls"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="sn-colors">
                                      {STICKY_COLORS.map((c) => (
                                        <button
                                          key={c.id}
                                          className="sn-dot"
                                          title={c.id}
                                          style={{
                                            background: c.bg,
                                            border: `1.5px solid ${s.colorId === c.id ? c.border : "rgba(0,0,0,0.18)"}`,
                                            transform:
                                              s.colorId === c.id
                                                ? "scale(1.3)"
                                                : "scale(1)",
                                          }}
                                          onClick={() =>
                                            stickyUpdate(s.id, {
                                              colorId: c.id,
                                            })
                                          }
                                        />
                                      ))}
                                    </div>
                                    <div className="sn-sizes">
                                      {STICKY_FONT_SIZES.map((f) => (
                                        <button
                                          key={f.id}
                                          className={`sn-size-pill${s.fontSizeId === f.id ? " sn-size-pill--on" : ""}`}
                                          style={{
                                            color:
                                              s.fontSizeId === f.id
                                                ? col.text
                                                : col.text + "88",
                                            background:
                                              s.fontSizeId === f.id
                                                ? col.border + "33"
                                                : "transparent",
                                            borderColor:
                                              s.fontSizeId === f.id
                                                ? col.border
                                                : "transparent",
                                          }}
                                          onClick={() =>
                                            stickyUpdate(s.id, {
                                              fontSizeId: f.id,
                                            })
                                          }
                                        >
                                          {f.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <button
                                  className="sn-x"
                                  style={{ color: col.text }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    stickyDelete(s.id);
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                              <textarea
                                ref={(el) => {
                                  textareaRefs.current[s.id] = el;
                                  if (el) {
                                    el.style.height = "0";
                                    el.style.height = el.scrollHeight + "px";
                                  }
                                }}
                                className="sn-text"
                                style={{
                                  color: col.text,
                                  fontSize: fontSize.px,
                                }}
                                placeholder="Write here…"
                                value={s.text}
                                onChange={(e) => {
                                  const el = e.target;
                                  el.style.height = "0";
                                  el.style.height = el.scrollHeight + "px";
                                  stickyUpdate(s.id, { text: e.target.value });
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="doubt-panel sn-chat-panel">
                    <div className="doubt-header">
                      <span className="doubt-header-icon">💬</span>
                      <div>
                        <p className="doubt-header-title">Ask a Doubt</p>
                        <p className="doubt-header-sub">
                          Ask anything about this note
                        </p>
                      </div>
                    </div>
                    <div className="doubt-messages">
                      {doubtMessages.length === 0 && (
                        <div className="doubt-empty">
                          <span style={{ fontSize: 32 }}>🤖</span>
                          <p className="doubt-empty-text">
                            Ask any doubt about <strong>{data.topic}</strong>
                          </p>
                          <div className="doubt-chips">
                            {[
                              `Summarise this note`,
                              `What are key concepts?`,
                              `Explain with an example`,
                              `What should I revise?`,
                            ].map((q) => (
                              <button
                                key={q}
                                className="doubt-chip"
                                onClick={() => setDoubtInput(q)}
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {doubtMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`doubt-bubble-row ${msg.role === "user" ? "doubt-bubble-row--user" : "doubt-bubble-row--ai"}`}
                        >
                          {msg.role === "assistant" && (
                            <div className="doubt-ai-avatar">🤖</div>
                          )}
                          <div
                            className={`doubt-bubble ${msg.role === "user" ? "doubt-bubble--user" : "doubt-bubble--ai"}`}
                          >
                            {msg.role === "assistant" ? (
                              <div className="doubt-bubble-text">
                                <ChatMessage content={msg.content} />
                                {msg.audio_url && (
                                  <AudioMessage audioUrl={msg.audio_url} />
                                )}
                              </div>
                            ) : (
                              <p className="doubt-bubble-text">{msg.content}</p>
                            )}
                            <span className="doubt-bubble-time">
                              {msg.time}
                            </span>
                          </div>
                        </div>
                      ))}
                      {doubtLoading && (
                        <div className="doubt-bubble-row doubt-bubble-row--ai">
                          <div className="doubt-ai-avatar">🤖</div>
                          <div className="doubt-bubble doubt-bubble--ai doubt-typing">
                            <span className="dt" />
                            <span className="dt" />
                            <span className="dt" />
                          </div>
                        </div>
                      )}
                      <div ref={doubtBottomRef} />
                    </div>
                    <div className="doubt-input-row">
                      <input
                        className="doubt-input"
                        placeholder="Ask about this note…"
                        value={doubtInput}
                        onChange={(e) => setDoubtInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendDoubt();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="doubt-send-btn"
                        title="Voice input"
                        disabled={doubtLoading || isListening}
                        onClick={handleDoubtVoice}
                        style={{
                          background: isListening
                            ? "linear-gradient(135deg, #6c63ff, #8b5cf6)"
                            : undefined,
                        }}
                      >
                        🎙️
                      </button>
                      <button
                        className="doubt-send-btn"
                        disabled={doubtLoading || !doubtInput.trim()}
                        onClick={sendDoubt}
                      >
                        {doubtLoading ? (
                          <span className="doubt-spinner" />
                        ) : (
                          "↑"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
        /* ── 1. The Main Track ────────────────────────────────────────── */
        .audio-slider {
          -webkit-appearance: none; /* Strip default WebKit styles */
          appearance: none;
          width: 100%;
          height: 6px; /* Sleek, thin track */
          background-color: rgba(255, 255, 255, 0.1); /* Empty track color */
          border-radius: 8px;
          outline: none;
          cursor: pointer;

          /* The gradient for the filled part - pairs with your inline backgroundSize */
          background-image: linear-gradient(90deg, #00c6ff, #0072ff);
          background-repeat: no-repeat;

          /* Smoothly animate the background size when dragging stops */
          transition: background-size 0.1s ease-in-out;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .audio-slider:hover {
          /* Brighten slightly on hover */
          background-image: linear-gradient(90deg, #1ad1ff, #1a85ff);
        }

        /* ── 2. WebKit Thumb (Chrome, Safari, Edge) ───────────────────── */
        .audio-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #0072ff;
          box-shadow:
            0 0 10px rgba(0, 114, 255, 0.5),
            0 2px 4px rgba(0, 0, 0, 0.2);
          margin-top: -5px; /* Centers the thumb vertically on the 6px track */
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease,
            background 0.15s ease;
        }

        .audio-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2); /* Pop out slightly */
          box-shadow:
            0 0 15px rgba(0, 114, 255, 0.8),
            0 2px 6px rgba(0, 0, 0, 0.3);
        }

        .audio-slider:active::-webkit-slider-thumb {
          transform: scale(0.9); /* Squish slightly when clicked */
          background: #e6f0ff;
        }

        /* ── 3. Firefox Thumb & Track Fixes ───────────────────────────── */
        .audio-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #0072ff;
          box-shadow:
            0 0 10px rgba(0, 114, 255, 0.5),
            0 2px 4px rgba(0, 0, 0, 0.2);
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease,
            background 0.15s ease;
        }

        .audio-slider::-moz-range-thumb:hover {
          transform: scale(1.2);
          box-shadow:
            0 0 15px rgba(0, 114, 255, 0.8),
            0 2px 6px rgba(0, 0, 0, 0.3);
        }

        .audio-slider:active::-moz-range-thumb {
          transform: scale(0.9);
          background: #e6f0ff;
        }

        /* Strip default Firefox dotted borders and progress fill so our custom background shows */
        .audio-slider::-moz-focus-outer {
          border: 0;
        }
        .audio-slider::-moz-range-progress {
          background-color: transparent;
        }
        .page {
          height: 100vh;
          background:
            radial-gradient(
              ellipse at 15% 0%,
              rgba(91, 208, 255, 0.1) 0%,
              transparent 38%
            ),
            radial-gradient(
              ellipse at 85% 8%,
              rgba(199, 155, 255, 0.09) 0%,
              transparent 30%
            ),
            radial-gradient(
              ellipse at 50% 100%,
              rgba(67, 233, 123, 0.06) 0%,
              transparent 40%
            ),
            linear-gradient(180deg, #04060e 0%, #060913 45%, #04070f 100%);
          color: #f0f0f8;
          font-family: "Sora", sans-serif;
          opacity: 0;
          transform: translateY(10px);
          transition:
            opacity 0.45s ease,
            transform 0.45s ease;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }
        .page.mounted {
          opacity: 1;
          transform: translateY(0);
        }

        .page::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(
              1px 1px at 12% 18%,
              rgba(255, 255, 255, 0.55),
              transparent
            ),
            radial-gradient(
              1px 1px at 34% 7%,
              rgba(255, 255, 255, 0.35),
              transparent
            ),
            radial-gradient(
              1px 1px at 67% 22%,
              rgba(255, 255, 255, 0.45),
              transparent
            ),
            radial-gradient(
              1px 1px at 82% 4%,
              rgba(255, 255, 255, 0.5),
              transparent
            ),
            radial-gradient(
              1px 1px at 94% 31%,
              rgba(255, 255, 255, 0.3),
              transparent
            ),
            radial-gradient(
              1px 1px at 23% 44%,
              rgba(255, 255, 255, 0.25),
              transparent
            ),
            radial-gradient(
              1px 1px at 55% 55%,
              rgba(255, 255, 255, 0.2),
              transparent
            ),
            radial-gradient(
              1px 1px at 8% 72%,
              rgba(255, 255, 255, 0.3),
              transparent
            ),
            radial-gradient(
              1px 1px at 74% 80%,
              rgba(255, 255, 255, 0.2),
              transparent
            ),
            radial-gradient(
              1px 1px at 41% 91%,
              rgba(255, 255, 255, 0.25),
              transparent
            );
          pointer-events: none;
          z-index: 0;
        }
        .page > * {
          position: relative;
          z-index: 1;
        }

        /* HEADER */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 24px;
          background: rgba(4, 6, 14, 0.88);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          position: sticky;
          top: 0;
          z-index: 100;
          flex-shrink: 0;
        }
        .back-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #6c63ff;
          font-family: "Sora", sans-serif;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          padding: 8px 16px;
          border-radius: 10px;
          transition: all 0.15s;
        }
        .back-btn:hover {
          background: rgba(108, 99, 255, 0.12);
          border-color: rgba(108, 99, 255, 0.3);
        }
        .header-right-group {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .header-subject-chip {
          font-size: 11px;
          font-weight: 800;
          padding: 4px 12px;
          border-radius: 20px;
          background: rgba(91, 208, 255, 0.08);
          border: 1px solid rgba(91, 208, 255, 0.2);
          color: #5bd0ff;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }
        .header-sep {
          color: #1e1e38;
          font-size: 14px;
        }
        .header-conf-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }
        .header-conf-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          animation: blink 1.4s ease-in-out infinite;
          flex-shrink: 0;
        }
        .header-main-title {
          font-size: 15px;
          font-weight: 800;
          color: #e8e8f8;
          letter-spacing: -0.3px;
        }

        .lang-dropdown-wrap {
          position: relative;
        }
        .lang-dropdown {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #9b95ff;
          font-family: "Sora", sans-serif;
          font-size: 12px;
          font-weight: 700;
          padding: 8px 14px;
          border-radius: 10px;
          cursor: pointer;
          outline: none;
          appearance: none;
          min-width: 90px;
          transition: border-color 0.15s;
        }
        .lang-dropdown:focus {
          border-color: rgba(108, 99, 255, 0.4);
        }

        /* TABS BAR */
        .tabs-bar {
          display: flex;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding: 0 20px;
          gap: 2px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          flex-shrink: 0;
          background: rgba(4, 6, 14, 0.7);
          backdrop-filter: blur(12px);
          justify-content: flex-start;
        }
        .tabs-bar::-webkit-scrollbar {
          display: none;
        }
        .tab-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          background: none;
          border: none;
          color: #333360;
          font-family: "Sora", sans-serif;
          font-size: 12px;
          font-weight: 700;
          padding: 13px 14px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          white-space: nowrap;
          transition:
            color 0.15s,
            border-color 0.15s;
          letter-spacing: 0.2px;
        }
        .tab-btn:hover {
          color: #8080b0;
        }
        .tab-active {
          color: #9b95ff !important;
          border-bottom-color: #6c63ff !important;
        }
        .tab-icon {
          font-size: 14px;
        }

        /* TAB CONTENT SHELL */
        .tab-content {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .content-with-doubt {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .content-main {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          scrollbar-width: thin;
          scrollbar-color: rgba(108, 99, 255, 0.2) transparent;
        }
        .content-main::-webkit-scrollbar {
          width: 4px;
        }
        .content-main::-webkit-scrollbar-thumb {
          background: rgba(108, 99, 255, 0.2);
          border-radius: 2px;
        }
        .non-doubt-tabs {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 24px;
        }

        /* MAIN EXPLANATION BLOCK */
        .main-explanation {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 8px;
          position: relative;
          overflow: hidden;
        }
        .main-explanation::before {
          content: "";
          position: absolute;
          top: 0;
          right: 0;
          width: 200px;
          height: 200px;
          background: radial-gradient(
            circle at 100% 0%,
            rgba(108, 99, 255, 0.12),
            transparent 60%
          );
          pointer-events: none;
        }
        .main-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #333360;
          margin-bottom: 16px;
        }
        .main-text {
          font-size: 14px;
          color: #c8c8e0;
          line-height: 1.8;
          font-weight: 300;
        }
        .page-block {
          margin-bottom: 16px;
        }
        .page-hi {
          font-family: "Noto Sans Devanagari", "Sora", sans-serif;
          font-size: 14px;
          color: #b0b0d0;
          line-height: 1.8;
          margin-bottom: 10px;
          padding: 12px 16px;
          background: rgba(108, 99, 255, 0.06);
          border: 1px solid rgba(108, 99, 255, 0.12);
          border-radius: 12px;
        }
        .page-en {
          font-size: 14px;
          color: #c8c8e0;
          line-height: 1.8;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
        }
        .concepts-heading {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #333360;
          padding: 8px 0 4px;
        }

        /* SECTION / CONCEPT CARDS */
        .explain-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        .concept-card {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 18px;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .concept-card:hover {
          border-color: rgba(255, 255, 255, 0.12);
        }
        .concept-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          cursor: pointer;
          gap: 12px;
        }
        .concept-name {
          font-size: 14px;
          font-weight: 700;
          color: #e0e0f0;
        }
        .difficulty-badge {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 20px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          flex-shrink: 0;
        }
        .diff-easy {
          background: rgba(67, 233, 123, 0.1);
          color: #43e97b;
          border: 1px solid rgba(67, 233, 123, 0.25);
        }
        .diff-medium {
          background: rgba(255, 179, 0, 0.1);
          color: #ffb300;
          border: 1px solid rgba(255, 179, 0, 0.25);
        }
        .diff-hard {
          background: rgba(255, 80, 80, 0.1);
          color: #ff5050;
          border: 1px solid rgba(255, 80, 80, 0.25);
        }
        .concept-body {
          padding: 0 18px 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          animation: fadeIn 0.25s ease;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .concept-section h4 {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #333360;
          margin-bottom: 8px;
          margin-top: 14px;
        }
        .concept-section p {
          font-size: 13px;
          color: #b0b0cc;
          line-height: 1.7;
        }
        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }
        .topic-chip {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 20px;
          background: rgba(108, 99, 255, 0.1);
          border: 1px solid rgba(108, 99, 255, 0.2);
          color: #9b95ff;
        }
        .concept-section a {
          font-size: 12px;
          color: #6c63ff;
          text-decoration: none;
          font-weight: 700;
          padding: 6px 14px;
          border: 1px solid rgba(108, 99, 255, 0.25);
          border-radius: 20px;
          background: rgba(108, 99, 255, 0.07);
          transition: all 0.15s;
        }
        .concept-section a:hover {
          background: rgba(108, 99, 255, 0.15);
        }
        .explanation-text {
          font-size: 14px;
          color: #c0c0d8;
          line-height: 1.75;
          font-weight: 300;
        }

        /* LISTEN TAB */
        .listen-section {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .audio-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .audio-orb {
          position: relative;
          width: 96px;
          height: 96px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .audio-orb-icon {
          font-size: 42px; /* INCREASED SIZE FOR MIC */
          position: relative;
          z-index: 2;
          cursor: pointer;
        }
        .orb-wave {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(108, 99, 255, 0.3);
          animation: ripple 2.2s ease-out infinite;
        }
        .w1 {
          width: 62px;
          height: 62px;
          animation-delay: 0s;
        }
        .w2 {
          width: 80px;
          height: 80px;
          animation-delay: 0.45s;
        }
        .w3 {
          width: 96px;
          height: 96px;
          animation-delay: 0.9s;
        }
        @keyframes ripple {
          0% {
            transform: scale(0.8);
            opacity: 1;
          }
          100% {
            transform: scale(1.4);
            opacity: 0;
          }
        }
        .orb-playing .orb-wave {
          border-color: rgba(67, 233, 123, 0.4);
        }
        .audio-title {
          font-size: 16px;
          font-weight: 800;
          color: #e0e0f0;
        }
        .play-btn {
          width: 100%;
          background: linear-gradient(
            135deg,
            rgba(108, 99, 255, 0.2),
            rgba(108, 99, 255, 0.1)
          );
          border: 1px solid rgba(108, 99, 255, 0.35);
          color: #9b95ff;
          border-radius: 16px;
          padding: 16px;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.2s;
        }
        .play-btn:hover {
          background: rgba(108, 99, 255, 0.25);
          border-color: rgba(108, 99, 255, 0.5);
        }
        .pause-btn {
          background: linear-gradient(
            135deg,
            rgba(67, 233, 123, 0.15),
            rgba(67, 233, 123, 0.08)
          );
          border-color: rgba(67, 233, 123, 0.35);
          color: #43e97b;
        }
        .audio-spinner {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-top-color: #9b95ff;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }

        .audio-slider {
          width: 100%;
          margin: 15px 0;
          accent-color: #6c63ff;
          cursor: pointer;
        }
        .audio-time {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #888;
          font-family: "JetBrains Mono", monospace;
          width: 100%;
        }

        /* ══ ADVANCED QUIZ TAB STYLES ══ */
        .quiz-advanced-shell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 40px;
          padding: 40px 20px;
          min-height: 100%;
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
        }
        .quiz-hero-card-advanced {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 28px 24px;
          text-align: center;
          width: 100%;
          backdrop-filter: blur(10px);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
        }
        .quiz-big-icon {
          font-size: 42px;
          display: block;
          margin-bottom: 14px;
        }
        .quiz-hero-title {
          font-size: 24px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }
        .quiz-hero-sub {
          font-size: 14px;
          color: #888;
          line-height: 1.5;
          max-width: 420px;
          margin: 0 auto 18px;
        }
        .quiz-prime-btn {
          background: linear-gradient(135deg, #6c63ff 0%, #4facfe 100%);
          color: white;
          border: none;
          padding: 14px 28px;
          font-size: 15px;
          font-weight: 800;
          border-radius: 100px;
          cursor: pointer;
          transition:
            transform 0.2s,
            box-shadow 0.2s;
          box-shadow: 0 10px 30px rgba(108, 99, 255, 0.4);
        }
        .quiz-prime-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 15px 40px rgba(108, 99, 255, 0.6);
        }
        .quiz-history-section {
          width: 100%;
        }
        .history-label {
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: #333360;
          margin-bottom: 20px;
          text-align: center;
        }
        .quiz-grid-advanced {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 16px;
          width: 100%;
        }
        .quiz-card-advanced {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .quiz-card-advanced:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(108, 99, 255, 0.3);
          transform: translateY(-4px);
        }
        .quiz-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .quiz-card-qs {
          font-size: 13px;
          font-weight: 700;
          color: #9b95ff;
        }
        .quiz-card-del {
          background: none;
          border: none;
          color: #444;
          font-size: 18px;
          cursor: pointer;
          padding: 4px;
        }
        .quiz-card-del:hover {
          color: #ff5050;
        }
        .quiz-card-scores {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .score-item {
          display: flex;
          flex-direction: column;
        }
        .s-label {
          font-size: 10px;
          color: #444;
          text-transform: uppercase;
          font-weight: 800;
        }
        .s-val {
          font-size: 18px;
          font-weight: 800;
        }
        .score-sep {
          width: 1px;
          height: 24px;
          background: rgba(255, 255, 255, 0.06);
        }
        .quiz-card-meta {
          font-size: 11px;
          color: #444;
          font-weight: 600;
        }
        .quiz-card-actions {
          display: flex;
          gap: 10px;
          margin-top: 16px;
        }
        .quiz-card-btn {
          flex: 1;
          border-radius: 14px;
          padding: 11px 14px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition:
            transform 0.18s,
            border-color 0.18s,
            background 0.18s;
        }
        .quiz-card-btn:hover {
          transform: translateY(-1px);
        }
        .quiz-card-btn--primary {
          border: none;
          color: #fff;
          background: linear-gradient(135deg, #6c63ff 0%, #4facfe 100%);
          box-shadow: 0 10px 24px rgba(108, 99, 255, 0.28);
        }
        .quiz-card-btn--ghost {
          border: 1px solid rgba(108, 99, 255, 0.26);
          color: #bdb9ff;
          background: rgba(108, 99, 255, 0.1);
        }

        /* ══ HEATMAP TAB STYLES — DIRECT IMAGE FOCUS ══ */
        .heatmap-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 24px;
        }
        .heatmap-main-view {
          width: 100%;
          background: #000;
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid rgba(255, 80, 80, 0.3);
          box-shadow: 0 30px 100px rgba(255, 80, 80, 0.15);
        }
        .heatmap-img-wrap {
          position: relative;
          width: 100%;
          line-height: 0;
        }
        .heatmap-img-actual {
          width: 100%;
          height: auto;
          display: block;
        }
        .heatmap-badge {
          position: absolute;
          top: 20px;
          right: 20px;
          background: rgba(255, 80, 80, 0.9);
          color: #fff;
          padding: 6px 14px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          backdrop-filter: blur(10px);
        }

        .heatmap-hero-card {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          width: 100%;
          animation: slideUp 0.4s ease forwards;
        }
        .heatmap-hero-icon {
          font-size: 40px;
          display: block;
          margin-bottom: 8px;
        }
        .heatmap-hero-title {
          font-size: 26px;
          font-weight: 800;
          color: #e0e0f0;
          margin-bottom: 8px;
        }
        .heatmap-hero-sub {
          font-size: 15px;
          color: #666;
          line-height: 1.6;
          max-width: 600px;
          margin: 0 auto;
        }
        .heatmap-stats {
          display: flex;
          gap: 20px;
          padding: 20px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 16px;
          justify-content: space-around;
        }
        .heatmap-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .heatmap-stat-num {
          font-size: 28px;
          font-weight: 800;
          font-family: "JetBrains Mono", monospace;
        }
        .heatmap-stat-label {
          font-size: 11px;
          color: #444;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        /* DOUBT / CHAT PANEL */
        .doubt-panel {
          width: 33.33%;
          min-width: 280px;
          max-width: 380px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-left: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(4, 6, 14, 0.5);
          height: 100%;
          overflow: hidden;
        }
        .doubt-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
          background:
            radial-gradient(
              ellipse at 100% 0%,
              rgba(108, 99, 255, 0.1),
              transparent 50%
            ),
            rgba(4, 6, 14, 0.9);
        }
        .doubt-header-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
        .doubt-header-title {
          font-size: 14px;
          font-weight: 800;
          color: #e0e0f0;
        }
        .doubt-header-sub {
          font-size: 11px;
          color: #a29f9f;
          margin-top: 1px;
        }
        .doubt-messages {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 16px 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
          scrollbar-width: thin;
          scrollbar-color: rgba(108, 99, 255, 0.15) transparent;
        }
        .doubt-messages::-webkit-scrollbar {
          width: 3px;
        }
        .doubt-messages::-webkit-scrollbar-thumb {
          background: rgba(108, 99, 255, 0.2);
          border-radius: 2px;
        }
        .doubt-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 28px 10px;
          text-align: center;
        }
        .doubt-empty-text {
          font-size: 12px;
          color: #a09d9d;
          line-height: 1.5;
        }
        .doubt-empty-text strong {
          color: #9b95ff;
        }
        .doubt-chips {
          display: flex;
          flex-direction: column;
          gap: 7px;
          width: 100%;
        }
        .doubt-chip {
          padding: 9px 14px;
          border-radius: 12px;
          text-align: left;
          background: rgba(108, 99, 255, 0.07);
          border: 1px solid rgba(108, 99, 255, 0.15);
          color: #9b95ff;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.15s;
        }
        .doubt-chip:hover {
          background: rgba(108, 99, 255, 0.15);
          border-color: rgba(108, 99, 255, 0.3);
        }
        .doubt-bubble-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          width: 100%;
        }
        .doubt-bubble-row--user {
          flex-direction: row-reverse;
        }
        .doubt-bubble-row--ai {
          flex-direction: row;
        }
        .doubt-ai-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          flex-shrink: 0;
          background: rgba(108, 99, 255, 0.12);
          border: 1px solid rgba(108, 99, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
        }
        .doubt-bubble {
          max-width: 82%;
          padding: 10px 14px;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          animation: dbIn 0.2s ease;
        }
        @keyframes dbIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        .doubt-bubble--user {
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          border-radius: 16px 4px 16px 16px;
        }
        .doubt-bubble--ai {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 4px 16px 16px 16px;
        }
        .doubt-bubble-text {
          font-size: 12px;
          line-height: 1.6;
          color: #e0e0f0;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .doubt-bubble--user .doubt-bubble-text {
          color: #fff;
        }
        .chat-md :global(p) {
          margin: 0 0 10px;
        }
        .chat-md :global(p:last-child) {
          margin-bottom: 0;
        }
        .chat-md :global(ul),
        .chat-md :global(ol) {
          margin: 0 0 10px 18px;
          padding: 0;
        }
        .chat-md :global(li) {
          margin-bottom: 6px;
        }
        .chat-md :global(h2),
        .chat-md :global(h3),
        .chat-md :global(h4) {
          margin: 0 0 10px;
          color: #fff;
          line-height: 1.35;
        }
        .chat-md :global(blockquote) {
          margin: 0 0 10px;
          padding-left: 12px;
          border-left: 3px solid rgba(108, 99, 255, 0.7);
          color: #d8d2ff;
        }
        .chat-md :global(code) {
          font-family: "JetBrains Mono", monospace;
          font-size: 0.95em;
        }
        .chat-md :global(.katex) {
          color: inherit;
          font-size: 1.02em;
        }
        .doubt-bubble-time {
          font-size: 9px;
          color: rgba(255, 255, 255, 0.25);
          align-self: flex-end;
          font-family: "JetBrains Mono", monospace;
        }
        .doubt-bubble--ai .doubt-bubble-time {
          color: #333360;
        }
        .doubt-typing {
          display: flex !important;
          flex-direction: row !important;
          gap: 5px !important;
          padding: 14px 16px;
          align-items: center;
        }
        .dt {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #444;
          animation: dtt 1.2s ease-in-out infinite;
        }
        .dt:nth-child(2) {
          animation-delay: 0.2s;
        }
        .dt:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes dtt {
          0%,
          80%,
          100% {
            transform: scale(0.8);
            opacity: 0.3;
          }
          40% {
            transform: scale(1.1);
            opacity: 1;
          }
        }
        .doubt-input-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          flex-shrink: 0;
          background: rgba(4, 6, 14, 0.9);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .doubt-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 10px 14px;
          color: #e0e0f0;
          font-family: "Sora", sans-serif;
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s;
        }
        .doubt-input:focus {
          border-color: rgba(179, 177, 215, 0.4);
        }
        .doubt-input::placeholder {
          color: #c2c2e8;
        }
        .doubt-send-btn {
          width: 36px;
          height: 36px;
          border-radius: 11px;
          flex-shrink: 0;
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          border: none;
          color: #fff;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 12px rgba(108, 99, 255, 0.35);
          transition:
            transform 0.15s,
            opacity 0.2s;
        }
        .doubt-send-btn:hover:not(:disabled) {
          transform: scale(1.08);
        }
        .doubt-send-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .doubt-spinner {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }

        /* STICKY NOTES TAB */
        .sn-split-layout {
          display: flex;
          flex-direction: row;
          height: 100%;
          overflow: hidden;
        }
        .sn-left-panel {
          flex: 2;
          min-width: 0;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          border-right: 1px solid rgba(255, 255, 255, 0.06);
        }
        .sn-chat-panel {
          flex: 1 0 280px;
          max-width: 360px;
          border-left: none !important;
        }
        .sn-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          padding: 10px 18px;
          flex-shrink: 0;
          background: rgba(4, 6, 14, 0.9);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .sn-toolbar-right {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sn-add-btn {
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          font-family: "Sora", sans-serif;
        }
        .sn-count {
          font-size: 12px;
          color: #444;
          font-weight: 700;
        }
        .sn-clear-btn {
          background: rgba(255, 80, 80, 0.08);
          border: 1px solid rgba(255, 80, 80, 0.2);
          color: #ff5050;
          padding: 6px 12px;
          border-radius: 9px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
        }
        .sn-hint {
          font-size: 11px;
          color: #333360;
        }
        .sn-download-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #666;
          padding: 7px 14px;
          border-radius: 9px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.15s;
        }
        .sn-download-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #aaa;
        }
        .sn-board {
          flex: 1;
          overflow: auto;
          position: relative;
          min-height: 0;
        }
        .sn-page-wrap {
          position: relative;
          min-height: 100%;
        }
        .sn-bg-img {
          display: block;
          width: 100%;
          height: auto;
        }
        .sn-pdf-page {
          display: block;
          width: 100%;
          margin-bottom: 4px;
        }
        .sn-pdf-pages {
          display: flex;
          flex-direction: column;
        }
        .sn-pdf-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 60px 20px;
          color: #555;
          font-size: 13px;
        }
        .sn-pdf-spinner {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 3px solid rgba(255, 255, 255, 0.05);
          border-top-color: #6c63ff;
          animation: spin 0.8s linear infinite;
        }
        .sn-pdf-fallback {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .sn-pdf-fallback-header {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .sn-fb-title {
          font-size: 15px;
          font-weight: 700;
          color: #e0e0f0;
        }
        .sn-fb-sub {
          font-size: 12px;
          color: #444;
          margin-top: 3px;
        }
        .sn-pdf-ocr-preview {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 14px;
          padding: 16px;
        }
        .sn-ocr-label {
          font-size: 11px;
          font-weight: 700;
          color: #444;
          margin-bottom: 10px;
        }
        .sn-ocr-text {
          font-family: "JetBrains Mono", monospace;
          font-size: 12px;
          color: #888;
          line-height: 1.8;
          white-space: pre-wrap;
        }
        .sn-no-file {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 60px 20px;
          color: #444;
          font-size: 13px;
        }
        .sn-board-hint {
          position: absolute;
          top: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(4, 6, 14, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 10px 20px;
          font-size: 13px;
          color: #555;
          white-space: nowrap;
        }
        .sn-board-hint strong {
          color: #9b95ff;
        }
        .sn-note {
          position: absolute;
          min-width: 160px;
          max-width: 240px;
          border-radius: 10px;
          overflow: hidden;
          z-index: 10;
          cursor: default;
        }
        .sn-note--active {
          z-index: 200;
        }
        .sn-handle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          cursor: move;
          min-height: 32px;
        }
        .sn-grip {
          font-size: 14px;
          opacity: 0.5;
          cursor: grab;
        }
        .sn-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        .sn-colors {
          display: flex;
          gap: 5px;
        }
        .sn-dot {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.15s;
        }
        .sn-sizes {
          display: flex;
          gap: 3px;
        }
        .sn-size-pill {
          padding: 2px 6px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid transparent;
          font-family: "Sora", sans-serif;
          background: none;
        }
        .sn-x {
          margin-left: auto;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          opacity: 0.5;
          transition: opacity 0.15s;
        }
        .sn-x:hover {
          opacity: 1;
        }
        .sn-text {
          width: 100%;
          min-height: 60px;
          resize: none;
          overflow: hidden;
          background: none;
          border: none;
          outline: none;
          font-family: "Sora", sans-serif;
          font-size: 12px;
          line-height: 1.6;
          padding: 6px 10px 10px;
          cursor: text;
        }

        @media (max-width: 768px) {
          .content-with-doubt {
            flex-direction: column;
          }
          .doubt-panel {
            width: 100%;
            max-width: 100%;
            min-width: unset;
            border-left: none;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            height: 300px;
          }
          .quiz-top-row {
            flex-direction: column;
          }
          .quiz-score-card {
            width: 100%;
          }
          .quiz-how-grid {
            grid-template-columns: 1fr;
          }
          .sn-split-layout {
            flex-direction: column;
          }
          .sn-left-panel {
            flex: none;
            height: 60%;
            border-right: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          }
          .sn-chat-panel {
            max-width: 100%;
            height: 40%;
          }
        }
      `}</style>
    </>
  );
}

// ── Loading State ──────────────────────────────────────────────
function LoadingScreen() {
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
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1.5px solid rgba(108,99,255,0.15)",
          }}
        />
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
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1.5px solid rgba(91,208,255,0.2)",
          }}
        />
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
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <p
          style={{
            fontSize: 15,
            color: "#9b95ff",
            fontWeight: 800,
            letterSpacing: "-0.3px",
          }}
        >
          Loading explanation
        </p>
        <p style={{ fontSize: 12, color: "#333360", fontWeight: 600 }}>
          Fetching your personalised content…
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Processing State ───────────────────────────────────────────
function ProcessingScreen() {
  const stages = [
    "Reading handwriting",
    "Scoring confusion zones",
    "Generating explanation",
    "Preparing audio",
  ];
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setActive((p) => (p + 1) % stages.length),
      1800,
    );
    return () => clearInterval(t);
  }, []);

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
        gap: 28,
        fontFamily: "Sora, sans-serif",
        padding: "0 24px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 90,
          height: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1px solid rgba(108,99,255,0.2)",
            animation: "rpulse 2s ease-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: -10,
            borderRadius: "50%",
            border: "1px solid rgba(108,99,255,0.1)",
            animation: "rpulse 2s ease-out infinite 0.5s",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: -20,
            borderRadius: "50%",
            border: "1px solid rgba(108,99,255,0.06)",
            animation: "rpulse 2s ease-out infinite 1s",
          }}
        />
        <div
          style={{
            width: 70,
            height: 70,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 35%, rgba(199,155,255,0.3), rgba(108,99,255,0.15))",
            border: "1px solid rgba(108,99,255,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
          }}
        >
          🧠
        </div>
      </div>
      <div
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <p
          style={{
            fontSize: 20,
            color: "#e0e0f0",
            fontWeight: 800,
            letterSpacing: "-0.4px",
          }}
        >
          Processing your note
        </p>
        <p style={{ fontSize: 13, color: "#333360", lineHeight: 1.6 }}>
          GYAANI is running a 9-stage intelligence pipeline
        </p>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "100%",
          maxWidth: 340,
        }}
      >
        {stages.map((s, i) => (
          <div
            key={s}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 16px",
              borderRadius: 14,
              background:
                i < active
                  ? "rgba(67,233,123,0.05)"
                  : i === active
                    ? "rgba(108,99,255,0.1)"
                    : "transparent",
              border: `1px solid ${i < active ? "rgba(67,233,123,0.2)" : i === active ? "rgba(108,99,255,0.3)" : "rgba(255,255,255,0.04)"}`,
              opacity: i > active ? 0.35 : 1,
              transition: "all 0.4s ease",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 800,
                background:
                  i < active
                    ? "rgba(67,233,123,0.2)"
                    : i === active
                      ? "rgba(108,99,255,0.3)"
                      : "rgba(255,255,255,0.04)",
                color:
                  i < active ? "#43E97B" : i === active ? "#9b95ff" : "#333360",
                border: `1px solid ${i < active ? "rgba(67,233,123,0.4)" : i === active ? "#6C63FF" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {i < active ? (
                "✓"
              ) : i === active ? (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#6C63FF",
                    display: "block",
                    animation: "dtpulse 0.8s ease-in-out infinite alternate",
                  }}
                />
              ) : (
                i + 1
              )}
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color:
                  i < active ? "#43E97B" : i === active ? "#c8c8f0" : "#333360",
              }}
            >
              {s}
            </span>
            {i < active && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  color: "#43E97B",
                  fontFamily: "monospace",
                  fontWeight: 700,
                }}
              >
                done
              </span>
            )}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rpulse { 0%{transform:scale(0.9);opacity:1} 100%{transform:scale(1.5);opacity:0} }
        @keyframes dtpulse { from{transform:scale(0.8);opacity:0.6} to{transform:scale(1.2);opacity:1} }
      `}</style>
    </div>
  );
}

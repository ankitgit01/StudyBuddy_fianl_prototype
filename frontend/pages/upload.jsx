// frontend/pages/upload.jsx

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { createPromptNote, uploadNote } from "../services/api";
import {
  addCustomSubject,
  getMergedSubjects,
  persistSubjectToProfile,
} from "../services/subjects";

// ── Subject color palette matching Notes page exactly ──
const SUBJECT_PALETTE = {
  Physics: {
    bg: "linear-gradient(135deg,#0e2a44 0%,#071828 100%)",
    accent: "#4a9edd",
    border: "#1a4a7a",
    text: "#7dc4ff",
  },
  Chemistry: {
    bg: "linear-gradient(135deg,#0e3018 0%,#071a0c 100%)",
    accent: "#5aad2e",
    border: "#1a5a20",
    text: "#88dd60",
  },
  Mathematics: {
    bg: "linear-gradient(135deg,#1e1260 0%,#100a38 100%)",
    accent: "#8b7fe8",
    border: "#2e1e8a",
    text: "#b0a8ff",
  },
  Biology: {
    bg: "linear-gradient(135deg,#3a2008 0%,#1e1004 100%)",
    accent: "#d4882a",
    border: "#6a3a10",
    text: "#f0a84a",
  },
  History: {
    bg: "linear-gradient(135deg,#3a1008 0%,#1e0804 100%)",
    accent: "#d4632a",
    border: "#6a2814",
    text: "#f08858",
  },
  Geography: {
    bg: "linear-gradient(135deg,#082e20 0%,#041810 100%)",
    accent: "#1fb87a",
    border: "#105c3c",
    text: "#3de8a0",
  },
  English: {
    bg: "linear-gradient(135deg,#38102a 0%,#1e0816 100%)",
    accent: "#d45a8e",
    border: "#5a1440",
    text: "#f07ab4",
  },
  Computer: {
    bg: "linear-gradient(135deg,#12103a 0%,#0a0820 100%)",
    accent: "#5a52c8",
    border: "#1e1a6a",
    text: "#8880f0",
  },
  General: {
    bg: "linear-gradient(135deg,#1e2238 0%,#10121e 100%)",
    accent: "#f5c542",
    border: "#3a3c60",
    text: "#f5d570",
  },
};
const DEFAULT_PALETTE = {
  bg: "linear-gradient(135deg,#1e2238 0%,#10121e 100%)",
  accent: "#6c63ff",
  border: "#2e2880",
  text: "#9b95ff",
};
function getPalette(name) {
  return SUBJECT_PALETTE[name] || DEFAULT_PALETTE;
}

function SubjectLoadingState() {
  const message = "Preparing for Upload...";
  const subMessage = "Let's begin our journey";

  return (
    // ── Update this specific div in SubjectLoadingState ──
    <div
      style={{
        position: "fixed", // Changed from relative/static to fixed
        top: 0, // Align to top
        left: 0, // Align to left
        width: "100vw", // Full viewport width
        height: "100vh", // Full viewport height
        zIndex: 9999, // Ensure it sits above the header and other elements
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
      {/* Multi-layered Animated Loader */}
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

      {/* Text Content */}
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
          style={{
            fontSize: 12,
            color: "#333360",
            fontWeight: 600,
            margin: 0,
          }}
        >
          {subMessage}
        </p>
      </div>

      {/* Inline Animation Definition */}
      <style>{`
        @keyframes spin { 
          to { transform: rotate(360deg); } 
        }
      `}</style>
    </div>
  );
}

export default function Upload() {
  const router = useRouter();
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [step, setStep] = useState(1);
  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("hi-en");
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewType, setPreviewType] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [addError, setAddError] = useState("");
  const [userPrompt, setUserPrompt] = useState("");
  const [uploadError, setUploadError] = useState("");
  const addInputRef = useRef(null);

  const isPromptMode = router.query.mode === "prompt";
  const pageTitle = isPromptMode ? "Create Explanation" : "Upload Notes";
  const promptPreset =
    typeof router.query.prompt === "string" ? router.query.prompt : "";

  useEffect(() => {
    let cancelled = false;

    async function loadSubjects() {
      if (!cancelled) setSubjectsLoading(true);
      const nextSubjects = await getMergedSubjects();
      if (!cancelled) {
        setSubjects(nextSubjects);
        setSubjectsLoading(false);
      }
    }

    loadSubjects();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (router.query.subject) {
      setSubject(router.query.subject);
      setStep(2);
    }
  }, [router.query.subject]);
  useEffect(() => {
    if (!router.isReady) return;
    if (promptPreset) setUserPrompt(promptPreset);
  }, [router.isReady, promptPreset]);
  useEffect(() => {
    if (showAddInput) setTimeout(() => addInputRef.current?.focus(), 100);
  }, [showAddInput]);
  useEffect(() => {
    if (!router.isReady) return;
    setUploadError(
      typeof router.query.error === "string" ? router.query.error : "",
    );
  }, [router.isReady, router.query.error]);

  async function handleAddSubject() {
    const result = addCustomSubject(newSubject);
    if (!result) {
      setAddError(newSubject.trim() ? "Already exists!" : "Enter a name.");
      return;
    }
    setSubjectsLoading(true);
    await persistSubjectToProfile(result.name);
    setSubjects(await getMergedSubjects());
    setSubjectsLoading(false);
    setSubject(result.name);
    setNewSubject("");
    setAddError("");
    setShowAddInput(false);
  }

  function isPdfFile(f) {
    return f?.type === "application/pdf" || /\.pdf$/i.test(f?.name || "");
  }
  function revokePreview(url) {
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  }
  function handleFile(file) {
    if (!file) return;
    const isImage = file.type.startsWith("image/"),
      isPdf = isPdfFile(file);
    if (!isImage && !isPdf) {
      alert("Please choose an image or PDF file.");
      return;
    }
    revokePreview(preview);
    setSelectedFile(file);
    setFileName(file.name);
    setPreviewType(isPdf ? "pdf" : "image");
    setPreview(URL.createObjectURL(file));
  }
  function clearPreview() {
    revokePreview(preview);
    setPreview(null);
    setPreviewType(null);
    setFileName(null);
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  useEffect(
    () => () => {
      revokePreview(preview);
      if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
    },
    [preview, cameraStream],
  );

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      setCameraStream(stream);
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 150);
    } catch {
      alert(
        "Camera not accessible. Please allow camera permission or use gallery.",
      );
    }
  }
  function capturePhoto() {
    const video = videoRef.current,
      canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        handleFile(
          new File([blob], "camera_capture.jpg", { type: "image/jpeg" }),
        );
        closeCamera();
      },
      "image/jpeg",
      0.92,
    );
  }
  function closeCamera() {
    if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setCameraOpen(false);
  }

  async function handleUpload() {
    if (!isPromptMode && !selectedFile) return;
    setUploadError("");
    if (isPromptMode && !userPrompt.trim()) {
      setUploadError(
        "Please enter a custom prompt to generate the explanation.",
      );
      return;
    }
    setUploading(true);
    try {
      const signals = {
        audio_replays: parseInt(localStorage.getItem("audio_replays") || "0"),
        quiz_attempts: parseInt(localStorage.getItem("quiz_attempts") || "0"),
        avg_quiz_score: parseFloat(
          localStorage.getItem("avg_quiz_score") || "50",
        ),
        notes_viewed: parseInt(localStorage.getItem("notes_viewed") || "0"),
        days_since_last: parseInt(
          localStorage.getItem("days_since_last") || "1",
        ),
        total_study_minutes: Math.round(
          parseInt(localStorage.getItem("total_study_seconds") || "0") / 60,
        ),
        login_streak: parseInt(localStorage.getItem("login_streak") || "0"),
        heatmap_views: parseInt(localStorage.getItem("heatmap_views") || "0"),
        red_zone_clicks: parseInt(
          localStorage.getItem("red_zone_clicks") || "0",
        ),
        quiz_retry_rate: parseFloat(
          localStorage.getItem("quiz_retry_rate") || "0",
        ),
        quiz_improvement: parseFloat(
          localStorage.getItem("quiz_improvement") || "0",
        ),
        time_on_explanation: parseFloat(
          localStorage.getItem("time_on_explanation") || "0",
        ),
      };
      const result = isPromptMode
        ? await createPromptNote(
            subject || "General",
            language,
            userPrompt.trim(),
            signals,
          )
        : await uploadNote(
            selectedFile,
            subject || "General",
            language,
            signals,
            userPrompt.trim() || null,
          );
      if (result.status === "blocked") {
        setUploadError(
          result.message || "The request goes against our safety guidelines.",
        );
        setUploading(false);
        return;
      }
      [
        "audio_replays",
        "quiz_attempts",
        "total_study_seconds",
        "notes_viewed",
        "heatmap_views",
        "red_zone_clicks",
        "quiz_retry_rate",
        "quiz_improvement",
        "time_on_explanation",
      ].forEach((k) => localStorage.setItem(k, "0"));

      // Restored routing back to /processing
      router.push(`/processing?noteId=${result.note_id}`);
    } catch (err) {
      setUploadError(
        err.message ||
          (isPromptMode
            ? "Could not create the explanation."
            : "Upload failed. Please try again."),
      );
      setUploading(false);
    }
  }

  const selectedMeta = subjects.find((s) => s.name === subject);
  const pal = getPalette(subject);

  return (
    <>
      <Head>
        <title>{pageTitle} — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="page">
        {/* ── HEADER ── */}
        <header className="header">
          <button
            className="back-btn"
            onClick={() => {
              if (step === 2 && !router.query.subject) {
                setStep(1);
                clearPreview();
              } else router.back();
            }}
          >
            ← Back
          </button>
          <div className="header-center">
            <span className="brand">
              GYAANI <span className="brand-ai">AI</span>
            </span>
            <span className="header-sep">·</span>
            <span className="header-sub">
              {step === 1 ? "Choose Subject" : subject}
            </span>
          </div>
          <div className="step-pills">
            <div className={`spill ${step >= 1 ? "spill--on" : ""}`}>1</div>
            <div
              className={`spill-line ${step >= 2 ? "spill-line--on" : ""}`}
            />
            <div className={`spill ${step >= 2 ? "spill--on" : ""}`}>2</div>
          </div>
        </header>

        {uploadError && (
          <div className="error-banner">
            <span>⚠️</span>
            {uploadError}
          </div>
        )}

        {/* ══ STEP 1 — SUBJECT PICKER ══ */}
        {step === 1 && (
          <div className="step1-wrap">
            <h2 className="step1-title">SELECT A SUBJECT</h2>
            {subjectsLoading ? (
              <SubjectLoadingState />
            ) : (
              <div className="subject-grid">
                {subjects.map((s) => {
                  const p = getPalette(s.name);
                  const isActive = subject === s.name;
                  return (
                    <button
                      key={s.name}
                      className={`subject-card ${isActive ? "subject-card--active" : ""}`}
                      style={
                        isActive
                          ? {
                              background: p.bg,
                              borderColor: p.accent,
                              boxShadow: `0 4px 24px ${p.accent}55, inset 0 1px 0 rgba(255,255,255,0.08)`,
                              "--accent-color": p.accent,
                            }
                          : {
                              background: p.bg,
                              "--accent-color": p.accent,
                            }
                      }
                      onClick={() => setSubject(s.name)}
                    >
                      <div className="s-header">
                        <span className="s-icon" style={{ color: p.text }}>
                          {s.icon}
                        </span>
                        <span className="s-name" style={{ color: p.text }}>
                          {s.name}
                        </span>
                      </div>
                      {isActive && (
                        <span
                          className="s-check"
                          style={{ background: p.accent }}
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}

                {!showAddInput ? (
                  <button
                    className="subject-card add-card"
                    onClick={() => setShowAddInput(true)}
                  >
                    <div className="s-header">
                      <span className="s-icon" style={{ color: "#6c63ff" }}>
                        ＋
                      </span>
                      <span className="s-name" style={{ color: "#6c63ff" }}>
                        Add Subject
                      </span>
                    </div>
                  </button>
                ) : (
                  <div className="add-inline">
                    <input
                      ref={addInputRef}
                      className="add-input"
                      placeholder="Subject name…"
                      value={newSubject}
                      onChange={(e) => {
                        setNewSubject(e.target.value);
                        setAddError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddSubject();
                        if (e.key === "Escape") {
                          setShowAddInput(false);
                          setNewSubject("");
                        }
                      }}
                      maxLength={30}
                    />
                    {addError && <p className="add-error">{addError}</p>}
                    <div className="add-btns">
                      <button
                        className="add-cancel"
                        onClick={() => {
                          setShowAddInput(false);
                          setNewSubject("");
                          setAddError("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="add-confirm"
                        onClick={handleAddSubject}
                        disabled={!newSubject.trim()}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              className="next-btn"
              disabled={!subject}
              onClick={() => setStep(2)}
              style={
                subject
                  ? {
                      background: `linear-gradient(135deg, ${pal.accent}cc, #6c63ff)`,
                      boxShadow: `0 8px 28px ${pal.accent}44`,
                    }
                  : {}
              }
            >
              {subject
                ? `Continue with ${subject} →`
                : "Select a subject to continue"}
            </button>
          </div>
        )}

        {/* ══ STEP 2 — UPLOAD + OPTIONS ══ */}
        {step === 2 && (
          <div className="step2-wrap">
            {/* Subject banner */}
            <div
              className="subject-banner"
              style={{ background: pal.bg, borderColor: pal.border }}
            >
              <div className="banner-left">
                <span className="banner-icon">
                  {selectedMeta?.icon || "📄"}
                </span>
                <div>
                  <p className="banner-label">UPLOADING FOR</p>
                  <p className="banner-subject" style={{ color: pal.text }}>
                    {subject}
                  </p>
                </div>
              </div>
              {!router.query.subject && (
                <button
                  className="banner-change"
                  onClick={() => {
                    setStep(1);
                    clearPreview();
                  }}
                >
                  ← Change
                </button>
              )}
            </div>

            <div className="step2-grid">
              {/* LEFT — Upload area */}
              <div className="upload-col">
                <div className="col-label">
                  <span
                    className="col-dot"
                    style={{ background: pal.accent }}
                  />
                  NOTE FILE
                </div>

                <div
                  className={`drop-zone ${dragOver ? "drag-over" : ""} ${preview ? "has-preview" : ""}`}
                  style={
                    dragOver
                      ? {
                          borderColor: pal.accent,
                          background: `${pal.accent}12`,
                        }
                      : {}
                  }
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFile(e.dataTransfer.files[0]);
                  }}
                  onClick={() => !preview && fileRef.current.click()}
                >
                  {preview ? (
                    <div className="preview-wrap">
                      {previewType === "pdf" ? (
                        <div className="preview-pdf">
                          <div className="preview-pdf-badge">PDF</div>
                          <iframe
                            src={preview}
                            title="PDF preview"
                            className="preview-pdf-frame"
                          />
                        </div>
                      ) : (
                        <img
                          src={preview}
                          alt="Note preview"
                          className="preview-img"
                        />
                      )}
                      <div className="preview-actions">
                        <button
                          className="pv-btn pv-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearPreview();
                          }}
                        >
                          ✕ Remove
                        </button>
                        <button
                          className="pv-btn pv-replace"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileRef.current.click();
                          }}
                        >
                          ↺ Replace
                        </button>
                      </div>
                      {fileName && (
                        <div className="filename-bar">📄 {fileName}</div>
                      )}
                    </div>
                  ) : (
                    <div className="drop-content">
                      <div
                        className="drop-ring"
                        style={{ borderColor: `${pal.accent}55` }}
                      >
                        <span className="drop-icon">📸</span>
                      </div>
                      <p className="drop-title">Drop your note here</p>
                      <p className="drop-sub">
                        Image or PDF · drag & drop or click
                      </p>
                      <div className="drop-tips">
                        <span>✅ Full page visible</span>
                        <span>✅ Good lighting</span>
                        <span>✅ Flat surface</span>
                      </div>
                    </div>
                  )}
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />

                <div className="source-btns">
                  <button
                    className="src-btn"
                    onClick={() => fileRef.current.click()}
                  >
                    <span>🖼️</span>
                    <span>Gallery / File</span>
                  </button>
                  <button className="src-btn src-btn-cam" onClick={openCamera}>
                    <span>📷</span>
                    <span>Take Photo</span>
                  </button>
                </div>
              </div>

              {/* RIGHT — Options */}
              <div className="options-col">
                <div className="col-label">
                  <span className="col-dot" style={{ background: "#1fb87a" }} />
                  AI OPTIONS
                </div>

                {/* Custom Prompt */}
                <div className="option-card">
                  <div className="option-card-hdr">
                    <span className="ocard-icon" style={{ color: pal.accent }}>
                      ✨
                    </span>
                    <div className="ocard-text">
                      <p className="ocard-title">Custom Prompt</p>
                      <p className="ocard-sub">
                        Tell AI how to explain your note
                      </p>
                    </div>
                    <span className="optional-tag">Optional</span>
                  </div>
                  <textarea
                    className="prompt-textarea"
                    placeholder={`e.g. "Explain like I'm a beginner"\n"Focus on formulas only"\n"Use simple Hindi examples"`}
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    maxLength={400}
                    rows={3}
                  />
                  <div className="chips-row">
                    {[
                      "Explain simply",
                      "Key points only",
                      "Use examples",
                      "Beginner friendly",
                      "Show formulas",
                      "Step by step",
                    ].map((s) => (
                      <button
                        key={s}
                        className="prompt-chip"
                        onClick={() =>
                          setUserPrompt((p) =>
                            p ? `${p}, ${s.toLowerCase()}` : s,
                          )
                        }
                      >
                        {s}
                      </button>
                    ))}
                    <span className="prompt-count">
                      {userPrompt.length}/400
                    </span>
                  </div>
                </div>

                {/* Language */}
                <div className="option-card">
                  <div className="option-card-hdr">
                    <span className="ocard-icon" style={{ color: "#1fb87a" }}>
                      🌐
                    </span>
                    <div className="ocard-text">
                      <p className="ocard-title">Explanation Language</p>
                      <p className="ocard-sub">
                        Choose your preferred language
                      </p>
                    </div>
                  </div>
                  <div className="lang-grid">
                    {[
                      { code: "hi-en", label: "Hindi + English" },
                      { code: "en", label: "English only" },
                      { code: "hi", label: "Hindi only" },
                      { code: "ta", label: "Tamil" },
                      { code: "te", label: "Telugu" },
                      { code: "bn", label: "Bengali" },
                    ].map((l) => (
                      <button
                        key={l.code}
                        className={`lang-chip ${language === l.code ? "lang-active" : ""}`}
                        onClick={() => setLanguage(l.code)}
                      >
                        <span>{l.flag}</span>
                        {l.label}
                        {language === l.code && (
                          <span className="lang-check">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <button
                  className={`submit-btn ${uploading ? "loading" : ""}`}
                  onClick={handleUpload}
                  disabled={uploading || (!preview && !isPromptMode)}
                  style={
                    (preview || isPromptMode) && !uploading
                      ? {
                          background: `linear-gradient(135deg, ${pal.accent}, #6c63ff)`,
                          boxShadow: `0 8px 28px ${pal.accent}44`,
                        }
                      : {}
                  }
                >
                  {uploading ? (
                    <span className="spinner-row">
                      <span className="spinner" /> Doing Sanity Check..
                    </span>
                  ) : !preview && !isPromptMode ? (
                    " Upload a note first"
                  ) : (
                    ` Analyse ${subject} Note`
                  )}
                </button>
                {(preview || isPromptMode) && !uploading && (
                  <p className="submit-hint">
                    AI processes your note into a personalized explanation
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CAMERA MODAL ── */}
        {cameraOpen && (
          <div className="camera-modal">
            <div className="camera-header">
              <button className="camera-close" onClick={closeCamera}>
                ✕ Cancel
              </button>
              <span className="camera-title">📷 Take Photo</span>
              <div style={{ width: 80 }} />
            </div>
            <div className="camera-body">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video"
              />
            </div>
            <div className="camera-footer">
              <p className="camera-hint">Position your note clearly in frame</p>
              <button className="capture-btn" onClick={capturePhoto}>
                <span className="capture-inner" />
              </button>
              <p className="camera-hint" style={{ opacity: 0 }}>
                _
              </p>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .page {
          min-height: 100vh;
          background: #0d0f1a;
          color: #e8eaf2;
          font-family: "Sora", sans-serif;
        }

        /* HEADER */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(10, 11, 20, 0.97);
          backdrop-filter: blur(14px);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .back-btn {
          background: none;
          border: none;
          color: #6c63ff;
          font-family: "Sora", sans-serif;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          padding: 6px 12px;
          border-radius: 8px;
          transition: background 0.15s;
        }
        .back-btn:hover {
          background: rgba(108, 99, 255, 0.1);
        }
        .header-center {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .brand {
          font-size: 15px;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.5px;
        }
        .brand-ai {
          color: #6c63ff;
        }
        .header-sep {
          color: rgba(255, 255, 255, 0.18);
        }
        .header-sub {
          font-size: 13px;
          font-weight: 600;
          color: #5a6280;
        }
        .step-pills {
          display: flex;
          align-items: center;
        }
        .spill {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          border: 1.5px solid rgba(255, 255, 255, 0.1);
          color: #3a4060;
          font-size: 11px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
        }
        .spill--on {
          background: #6c63ff;
          border-color: #6c63ff;
          color: #fff;
          box-shadow: 0 0 14px rgba(108, 99, 255, 0.5);
        }
        .spill-line {
          width: 36px;
          height: 2px;
          background: rgba(255, 255, 255, 0.07);
          transition: background 0.3s;
        }
        .spill-line--on {
          background: #6c63ff;
        }

        .error-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 16px 24px;
          border-radius: 12px;
          padding: 14px 16px;
          border: 1px solid rgba(255, 107, 107, 0.28);
          background: rgba(255, 107, 107, 0.07);
          color: #ffb3b3;
          font-size: 13px;
          font-weight: 600;
        }

        /* STEP 1 */
        .step1-wrap {
          max-width: 800px;
          margin: 0 auto;
          padding: 28px 24px;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .step1-title {
          font-size: 12px;
          font-weight: 800;
          color: #7a849a;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .subject-loading {
          min-height: 280px;
          border-radius: 26px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background:
            radial-gradient(
              circle at 50% 0%,
              rgba(108, 99, 255, 0.14),
              transparent 58%
            ),
            linear-gradient(
              180deg,
              rgba(14, 17, 31, 0.96),
              rgba(10, 12, 22, 0.96)
            );
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .subject-loader {
          position: relative;
          width: 74px;
          height: 74px;
        }
        .subject-loader__ring {
          position: absolute;
          border-radius: 999px;
        }
        .subject-loader__ring--outer {
          inset: 0;
          border: 2px solid transparent;
          border-top-color: #6c63ff;
          animation: spin 0.9s linear infinite;
        }
        .subject-loader__ring--inner {
          inset: 11px;
          border: 2px solid transparent;
          border-top-color: #5bd0ff;
          animation: spin 1.3s linear infinite reverse;
        }
        .subject-loader__core {
          position: absolute;
          inset: 24px;
          border-radius: 999px;
          background: radial-gradient(
            circle,
            rgba(108, 99, 255, 0.5),
            transparent 72%
          );
        }
        .subject-loading__title {
          font-size: 15px;
          color: #9b95ff;
          font-weight: 800;
          margin: 0;
        }
        .subject-loading__sub {
          font-size: 12px;
          color: #49507e;
          font-weight: 600;
          margin: 0;
        }

        .subject-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 650px) {
          .subject-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 450px) {
          .subject-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Smaller boxes in step 1 without arrows */
        .subject-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          padding: 14px 18px;
          border-radius: 18px;
          min-height: 90px;
          background: rgba(255, 255, 255, 0.03);
          border: 1.5px solid rgba(255, 255, 255, 0.04);
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            border-color 0.2s;
          position: relative;
          overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        /* Glowing blob on cards */
        .subject-card::after {
          content: "";
          position: absolute;
          right: -15px;
          bottom: -15px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: var(--accent-color, transparent);
          filter: blur(25px);
          opacity: 0.15;
          transition: opacity 0.3s ease;
        }
        .subject-card:hover {
          transform: translateY(-2px);
          box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .subject-card:hover::after {
          opacity: 0.3;
        }
        .subject-card--active {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.2) !important;
        }
        .s-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .s-icon {
          font-size: 18px;
        }
        .s-name {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          word-break: break-word;
        }
        .s-check {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          font-size: 11px;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .add-card {
          border: 1.5px dashed rgba(108, 99, 255, 0.3) !important;
          background: rgba(108, 99, 255, 0.04) !important;
          box-shadow: none !important;
        }
        .add-card:hover {
          border-color: rgba(108, 99, 255, 0.6) !important;
          background: rgba(108, 99, 255, 0.09) !important;
        }
        .add-card::after {
          display: none;
        }

        .add-inline {
          grid-column: 1/-1;
          background: rgba(108, 99, 255, 0.05);
          border: 1.5px solid rgba(108, 99, 255, 0.22);
          border-radius: 16px;
          padding: 14px;
        }
        .add-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          padding: 10px 14px;
          color: #e8eaf2;
          font-size: 14px;
          font-family: "Sora", sans-serif;
          outline: none;
          margin-bottom: 8px;
          transition: border-color 0.15s;
        }
        .add-input:focus {
          border-color: #6c63ff;
        }
        .add-input::placeholder {
          color: #252840;
        }
        .add-error {
          font-size: 11px;
          color: #ff6b6b;
          margin-bottom: 8px;
        }
        .add-btns {
          display: flex;
          gap: 8px;
        }
        .add-cancel {
          flex: 1;
          padding: 9px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #5a6280;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
        }
        .add-confirm {
          flex: 2;
          padding: 9px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          border: none;
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
        }
        .add-confirm:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .next-btn {
          width: 100%;
          padding: 15px;
          background: rgba(108, 99, 255, 0.2);
          color: #fff;
          border: none;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.25s;
          margin-top: 20px;
        }
        .next-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .next-btn:hover:not(:disabled) {
          transform: translateY(-2px);
        }

        /* STEP 2 */
        .step2-wrap {
          max-width: 1000px;
          margin: 0 auto;
          padding: 24px 24px 60px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .subject-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 22px;
          border-radius: 18px;
          border: 1px solid;
        }
        .banner-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .banner-icon {
          font-size: 34px;
        }
        .banner-label {
          font-size: 10px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.3);
          letter-spacing: 1.2px;
          text-transform: uppercase;
        }
        .banner-subject {
          font-size: 22px;
          font-weight: 800;
          margin-top: 2px;
        }
        .banner-change {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.45);
          font-size: 12px;
          font-weight: 600;
          padding: 8px 16px;
          border-radius: 20px;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.15s;
        }
        .banner-change:hover {
          color: #fff;
          border-color: rgba(255, 255, 255, 0.25);
        }

        .step2-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 700px) {
          .step2-grid {
            grid-template-columns: 1fr;
          }
        }

        .col-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          font-weight: 800;
          color: #4a5270;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .col-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        /* Drop zone made bigger to match right side */
        .drop-zone {
          border: 2px dashed rgba(255, 255, 255, 0.1);
          border-radius: 18px;
          min-height: 360px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          background: rgba(255, 255, 255, 0.02);
          position: relative;
          overflow: hidden;
        }
        .drop-zone:hover:not(.has-preview) {
          border-color: rgba(108, 99, 255, 0.4);
          background: rgba(108, 99, 255, 0.04);
        }
        .drag-over {
          border-style: solid !important;
        }
        .has-preview {
          cursor: default;
          min-height: auto;
          border-style: solid;
          border-color: rgba(255, 255, 255, 0.08);
        }
        .drop-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 36px 20px;
        }
        .drop-ring {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 2px dashed;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }
        .drop-icon {
          font-size: 34px;
        }
        .drop-title {
          font-size: 15px;
          font-weight: 700;
          color: #c0c4d8;
        }
        .drop-sub {
          font-size: 12px;
          color: #3a4060;
        }
        .drop-tips {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .drop-tips span {
          font-size: 10px;
          color: #3a4060;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 3px 10px;
          border-radius: 20px;
        }

        .preview-wrap {
          width: 100%;
        }
        .preview-img {
          width: 100%;
          border-radius: 16px;
          display: block;
          max-height: 400px;
          object-fit: contain;
        }
        .preview-pdf {
          width: 100%;
          min-height: 380px;
          position: relative;
          background: #0d0f1a;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          overflow: hidden;
        }
        .preview-pdf-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 1;
          padding: 5px 10px;
          border-radius: 20px;
          background: rgba(255, 80, 80, 0.14);
          border: 1px solid rgba(255, 80, 80, 0.22);
          color: #ff8b8b;
          font-size: 11px;
          font-weight: 800;
        }
        .preview-pdf-frame {
          width: 100%;
          height: 380px;
          border: none;
          display: block;
          background: #fff;
        }
        .preview-actions {
          display: flex;
          gap: 8px;
          padding: 10px 0 4px;
        }
        .pv-btn {
          flex: 1;
          border-radius: 10px;
          padding: 7px 14px;
          font-size: 12px;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          font-weight: 600;
          border: 1px solid;
          transition: background 0.15s;
        }
        .pv-remove {
          background: rgba(255, 80, 80, 0.08);
          color: #ff8b8b;
          border-color: rgba(255, 80, 80, 0.18);
        }
        .pv-remove:hover {
          background: rgba(255, 80, 80, 0.16);
        }
        .pv-replace {
          background: rgba(255, 255, 255, 0.04);
          color: #9aa3b8;
          border-color: rgba(255, 255, 255, 0.1);
        }
        .pv-replace:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .filename-bar {
          font-size: 11px;
          color: #3a4060;
          font-family: "JetBrains Mono", monospace;
          padding: 6px 2px;
        }

        .source-btns {
          display: flex;
          gap: 10px;
          margin-top: 12px;
        }
        .src-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 10px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          font-size: 12px;
          font-weight: 600;
          color: #6a7090;
          transition: all 0.15s;
        }
        .src-btn:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #c0c4d8;
          border-color: rgba(255, 255, 255, 0.16);
        }
        .src-btn span:first-child {
          font-size: 18px;
        }
        .src-btn-cam {
          border-color: rgba(31, 184, 122, 0.2);
          color: #2a9068;
        }
        .src-btn-cam:hover {
          border-color: rgba(31, 184, 122, 0.45);
          color: #1fb87a;
          background: rgba(31, 184, 122, 0.06);
        }

        /* Options column */
        .options-col {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .option-card {
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .option-card-hdr {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .ocard-icon {
          font-size: 20px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .ocard-text {
          flex: 1;
        }
        .ocard-title {
          font-size: 14px;
          font-weight: 700;
          color: #c8cce0;
        }
        .ocard-sub {
          font-size: 11px;
          color: #4a5270;
          margin-top: 2px;
        }
        .optional-tag {
          font-size: 10px;
          font-weight: 700;
          color: #6c63ff;
          background: rgba(108, 99, 255, 0.12);
          border: 1px solid rgba(108, 99, 255, 0.2);
          padding: 3px 10px;
          border-radius: 20px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .prompt-textarea {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 12px 14px;
          color: #c8cce0;
          font-size: 13px;
          font-family: "Sora", sans-serif;
          line-height: 1.65;
          resize: none;
          outline: none;
          transition: border-color 0.2s;
        }
        .prompt-textarea:focus {
          border-color: rgba(108, 99, 255, 0.4);
        }
        .prompt-textarea::placeholder {
          color: #989dbd;
          line-height: 1.65;
        }
        .chips-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .prompt-chip {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #5a6280;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 11px;
          border-radius: 20px;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.15s;
        }
        .prompt-chip:hover {
          border-color: rgba(108, 99, 255, 0.4);
          color: #9b95ff;
          background: rgba(108, 99, 255, 0.1);
        }
        .prompt-count {
          margin-left: auto;
          font-size: 10px;
          color: #2a2e44;
          font-family: "JetBrains Mono", monospace;
        }

        .lang-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .lang-chip {
          display: flex;
          align-items: center;
          gap: 7px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #5a6280;
          border-radius: 12px;
          padding: 9px 13px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.15s;
        }
        .lang-chip:hover {
          border-color: rgba(31, 184, 122, 0.35);
          color: #c0c4d8;
        }
        .lang-active {
          background: rgba(31, 184, 122, 0.08) !important;
          border-color: rgba(31, 184, 122, 0.45) !important;
          color: #1fb87a !important;
        }
        .lang-check {
          margin-left: auto;
          font-size: 12px;
        }

        .submit-btn {
          width: 100%;
          padding: 17px;
          background: rgba(108, 99, 255, 0.18);
          color: rgba(255, 255, 255, 0.5);
          border: none;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.25s;
          letter-spacing: 0.2px;
        }
        .submit-btn:not(:disabled):not(.loading) {
          color: #fff;
        }
        .submit-btn:hover:not(:disabled):not(.loading) {
          transform: translateY(-2px);
        }
        .submit-btn:disabled {
          cursor: not-allowed;
        }
        .loading {
          opacity: 0.7 !important;
        }
        .submit-hint {
          font-size: 11px;
          color: #2a2e44;
          text-align: center;
          line-height: 1.5;
          margin-top: -8px;
        }
        .spinner-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .spinner {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: #fff;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Camera */
        .camera-modal {
          position: fixed;
          inset: 0;
          z-index: 999;
          background: #000;
          display: flex;
          flex-direction: column;
        }
        .camera-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: rgba(0, 0, 0, 0.85);
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 10;
        }
        .camera-close {
          background: rgba(255, 255, 255, 0.08);
          border: none;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          padding: 7px 14px;
          border-radius: 20px;
        }
        .camera-title {
          font-size: 15px;
          font-weight: 700;
          color: #fff;
        }
        .camera-body {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .camera-video {
          width: 100%;
          height: 100vh;
          object-fit: cover;
        }
        .camera-footer {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 24px 20px 48px;
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .camera-hint {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
          font-family: "Sora", sans-serif;
          text-align: center;
        }
        .capture-btn {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.12);
          border: 3px solid white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.1s;
        }
        .capture-btn:hover {
          transform: scale(1.05);
        }
        .capture-btn:active {
          transform: scale(0.92);
        }
        .capture-inner {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          background: white;
        }
      `}</style>
    </>
  );
}

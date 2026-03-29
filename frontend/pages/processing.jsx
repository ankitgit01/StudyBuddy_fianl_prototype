import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { getNoteStatus } from "../services/api";

const STAGES = [
  { id: 1, icon: "📸", label: "Capture & Upload", desc: "Saving your note to cloud storage" },
  { id: 2, icon: "👁️", label: "Vision OCR", desc: "Reading Hindi + English handwriting" },
  { id: 3, icon: "🔥", label: "Confusion Heatmap", desc: "Detecting confusion zones in writing" },
  { id: 4, icon: "🧬", label: "Study DNA Profiling", desc: "Updating your learning style profile" },
  { id: 5, icon: "🌌", label: "Knowledge Graph", desc: "Mapping concepts and connections" },
  { id: 6, icon: "✨", label: "Personalised Content", desc: "Generating explanations for your DNA" },
  { id: 7, icon: "🌐", label: "Bilingual Delivery", desc: "Translating to Hindi + regional language" },
  { id: 8, icon: "🎙️", label: "Voice Preparation", desc: "Generating audio explanations" },
  { id: 9, icon: "🎯", label: "Adaptive Quiz Ready", desc: "Preparing personalised quiz questions" },
];

export default function Processing() {
  const router = useRouter();
  const { noteId } = router.query;

  const [currentStage, setCurrentStage] = useState(0);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady || !noteId) return;

    let active = true;

    const redirectToUpload = (message) => {
      if (!active) return;
      setError(message);
      router.replace(`/upload?error=${encodeURIComponent(message)}`);
    };

    const poll = async () => {
      try {
        const status = await getNoteStatus(noteId);
        if (!active) return;

        if (status.processing_status === "blocked") {
          redirectToUpload(
            status.user_message ||
              status.error ||
              "The uploaded content goes against our safety guidelines. Please try a different file.",
          );
          return;
        }

        if (status.processing_status === "processed") {
          setCurrentStage(STAGES.length);
          setDone(true);
          setTimeout(() => {
            if (active) router.push(`/explanation?noteId=${noteId}`);
          }, 800);
          return;
        }

        setElapsed((prev) => prev + 1);
        setCurrentStage((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
      } catch (err) {
        redirectToUpload("We couldn't process this file right now. Please try again.");
      }
    };

    poll();
    const interval = setInterval(poll, 1500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [router.isReady, noteId, router]);

  const progress = Math.round((currentStage / STAGES.length) * 100);

  return (
    <>
      <Head>
        <title>Processing → GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="page">
        <div className="top-section">
          <div className={`brain-orb ${done ? "orb-done" : "orb-active"}`}>
            <span className="orb-emoji">{done ? "🎉" : "🧠"}</span>
            <div className="orb-ring ring1" />
            <div className="orb-ring ring2" />
            <div className="orb-ring ring3" />
          </div>

          <h1 className="proc-title">
            {done ? "Analysis Complete!" : "Analysing Your Notes"}
          </h1>
          <p className="proc-sub">
            {done
              ? "Your personalised explanation is ready"
              : error
                ? error
                : `Running 9-stage intelligence pipeline · ${elapsed}s`}
          </p>

          <div className="progress-wrap">
            <div className="progress-bar">
              <div
                className={`progress-fill ${done ? "fill-done" : ""}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="progress-pct">{progress}%</span>
          </div>
        </div>

        <div className="stages-list">
          {STAGES.map((stage, i) => {
            const isDone = i < currentStage;
            const isActive = i === currentStage - 1;
            const isPending = i >= currentStage;

            return (
              <div
                key={stage.id}
                className={`stage-row ${isDone ? "stage-done" : ""} ${isActive ? "stage-active" : ""} ${isPending ? "stage-pending" : ""}`}
              >
                <div className={`stage-status ${isDone ? "status-done" : isActive ? "status-active" : "status-pending"}`}>
                  {isDone ? "✓" : isActive ? <span className="pulse-dot" /> : stage.id}
                </div>

                <div className="stage-content">
                  <div className="stage-header">
                    <span className="stage-icon">{stage.icon}</span>
                    <span className="stage-label">{stage.label}</span>
                  </div>
                  {(isDone || isActive) && (
                    <p className="stage-desc">{stage.desc}</p>
                  )}
                </div>

                {/* {isDone && (
                  <div className="stage-time">
                    ~{(0.1 + Math.random() * 0.3).toFixed(1)}s
                  </div>
                )} */}
              </div>
            );
          })}
        </div>

        {done && (
          <div className="done-cta">
            <button
              className="done-btn"
              onClick={() => router.push(`/explanation?noteId=${noteId || "mock"}`)}
            >
              View My Explanation →
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .page { min-height: 100vh; background: #0a0a0f; color: #f0f0f5; font-family: 'Sora', sans-serif; padding-bottom: 40px; }
        .top-section { display: flex; flex-direction: column; align-items: center; padding: 48px 24px 32px; background: radial-gradient(ellipse at 50% 0%, rgba(108,99,255,0.2) 0%, transparent 65%); }
        .brain-orb { position: relative; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
        .orb-emoji { font-size: 44px; position: relative; z-index: 2; }
        .orb-ring { position: absolute; border-radius: 50%; border: 1px solid rgba(108,99,255,0.4); animation: ripple 2s ease-out infinite; }
        .ring1 { width: 70px; height: 70px; animation-delay: 0s; }
        .ring2 { width: 90px; height: 90px; animation-delay: 0.4s; }
        .ring3 { width: 110px; height: 110px; animation-delay: 0.8s; }
        @keyframes ripple { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
        .orb-done .orb-ring { border-color: rgba(67,233,123,0.4); }
        .proc-title { font-size: 24px; font-weight: 800; text-align: center; margin-bottom: 8px; letter-spacing: -0.5px; }
        .proc-sub { font-size: 13px; color: #666; font-family: 'JetBrains Mono', monospace; margin-bottom: 24px; }
        .progress-wrap { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 340px; }
        .progress-bar { flex: 1; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #6C63FF, #8B5CF6); border-radius: 3px; transition: width 0.3s ease; }
        .fill-done { background: linear-gradient(90deg, #43E97B, #38f9d7); }
        .progress-pct { font-size: 12px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #888; width: 36px; }
        .stages-list { padding: 0 20px; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: 4px; }
        .stage-row { display: flex; align-items: flex-start; gap: 14px; padding: 12px 14px; border-radius: 14px; transition: all 0.3s ease; }
        .stage-done { background: rgba(67,233,123,0.05); }
        .stage-active { background: rgba(108,99,255,0.1); border: 1px solid rgba(108,99,255,0.25); }
        .stage-pending { opacity: 0.35; }
        .stage-status { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
        .status-done { background: rgba(67,233,123,0.2); color: #43E97B; border: 1px solid rgba(67,233,123,0.4); }
        .status-active { background: rgba(108,99,255,0.3); color: #6C63FF; border: 1px solid #6C63FF; }
        .status-pending { background: rgba(255,255,255,0.05); color: #555; border: 1px solid rgba(255,255,255,0.1); font-size: 11px; }
        .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #6C63FF; animation: pulse 0.8s ease-in-out infinite alternate; }
        @keyframes pulse { from { transform: scale(0.8); opacity: 0.6; } to { transform: scale(1.2); opacity: 1; } }
        .stage-content { flex: 1; }
        .stage-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .stage-icon { font-size: 16px; }
        .stage-label { font-size: 14px; font-weight: 600; color: #ddd; }
        .stage-desc { font-size: 12px; color: #666; line-height: 1.4; }
        .stage-time { font-size: 11px; color: #43E97B; font-family: 'JetBrains Mono', monospace; white-space: nowrap; margin-top: 4px; }
        .done-cta { padding: 28px 20px 0; max-width: 480px; margin: 0 auto; animation: fadeUp 0.5s ease forwards; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .done-btn { width: 100%; background: linear-gradient(135deg, #43E97B, #38f9d7); color: #0a0a0f; border: none; border-radius: 14px; padding: 18px; font-size: 17px; font-weight: 800; cursor: pointer; font-family: 'Sora', sans-serif; box-shadow: 0 8px 24px rgba(67,233,123,0.35); transition: transform 0.2s, box-shadow 0.2s; }
        .done-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(67,233,123,0.45); }
      `}</style>
    </>
  );
}

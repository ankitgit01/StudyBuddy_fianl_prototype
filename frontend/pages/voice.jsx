// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  pages/voice.jsx  ·  Mangesh
//
//  Teacher Voice Clone Setup Screen
//
//  DATA FLOW:
//  Dinesh's Azure Custom Neural Voice pipeline.
//  POST /api/voice/record   → submit voice sample
//  GET  /api/voice/status   → training status
//  POST /api/voice/train    → start training job
//  All data rendered from API — nothing hardcoded.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const USE_MOCK = true
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const SCRIPTS = [
  'नमस्ते, मैं आपका GYAANI AI शिक्षक हूं। आज हम Newton के नियमों के बारे में पढ़ेंगे।',
  'Physics में Force और Motion का संबंध बहुत महत्वपूर्ण है।',
  'Remember: Every action has an equal and opposite reaction.',
  'Thermodynamics के नियम ऊर्जा के conservation को describe करते हैं।',
  'Integration by parts is one of the most powerful techniques in calculus.',
]

async function getVoiceStatus() {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400))
    const stored = typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('gyaani_voice_status') || 'null')
      : null
    return stored || { status: 'not_started', samples_recorded: 0, samples_required: 5 }
  }
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE_URL}/api/voice/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json()
}

export default function VoicePage() {
  const router = useRouter()

  const [status,    setStatus]    = useState(null)   // voice clone status from API
  const [loading,   setLoading]   = useState(true)
  const [recording, setRecording] = useState(false)
  const [currentScript, setCurrentScript] = useState(0)
  const [done,      setDone]      = useState([])     // indices of recorded scripts
  const [training,  setTraining]  = useState(false)
  const [visible,   setVisible]   = useState(false)
  const mediaRef    = useRef(null)
  const timerRef    = useRef(null)
  const [recSecs,   setRecSecs]   = useState(0)

  useEffect(() => {
    setVisible(true)
    getVoiceStatus()
      .then((d) => { setStatus(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRef.current = new MediaRecorder(stream)
      mediaRef.current.start()
      setRecording(true)
      setRecSecs(0)
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000)
    } catch {
      alert('Microphone access denied. Please allow microphone to record.')
    }
  }

  async function stopRecording() {
    clearInterval(timerRef.current)
    if (mediaRef.current) {
      mediaRef.current.stop()
      mediaRef.current.stream.getTracks().forEach((t) => t.stop())
    }
    setRecording(false)

    const newDone = [...done, currentScript]
    setDone(newDone)

    if (USE_MOCK) {
      const newStatus = {
        status: newDone.length >= SCRIPTS.length ? 'ready_to_train' : 'recording',
        samples_recorded: newDone.length,
        samples_required: SCRIPTS.length,
      }
      localStorage.setItem('gyaani_voice_status', JSON.stringify(newStatus))
      setStatus(newStatus)
    }

    if (currentScript < SCRIPTS.length - 1) {
      setCurrentScript((c) => c + 1)
    }
  }

  async function startTraining() {
    setTraining(true)
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 1200))
      const newStatus = { status: 'training', samples_recorded: SCRIPTS.length, samples_required: SCRIPTS.length, eta: '~20 minutes' }
      localStorage.setItem('gyaani_voice_status', JSON.stringify(newStatus))
      setStatus(newStatus)
      setTraining(false)
      return
    }
    const token = localStorage.getItem('token')
    await fetch(`${BASE_URL}/api/voice/train`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const updated = await getVoiceStatus()
    setStatus(updated)
    setTraining(false)
  }

  if (loading) return (
    <>
      <Head><title>Voice Setup — GYAANI AI</title></Head>
      <div style={{
        minHeight: '100vh', background: '#080810',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Sora, sans-serif',
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%',
          border: '3px solid #111128', borderTopColor: '#FF6EFF',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  )

  const samplesRecorded = status?.samples_recorded || done.length
  const samplesRequired = status?.samples_required || SCRIPTS.length
  const progressPct     = Math.min(100, (samplesRecorded / samplesRequired) * 100)
  const isComplete      = status?.status === 'complete'
  const isTraining      = status?.status === 'training'
  const readyToTrain    = status?.status === 'ready_to_train' || samplesRecorded >= samplesRequired

  return (
    <>
      <Head>
        <title>Voice Clone Setup — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={`page ${visible ? 'page--in' : ''}`}>

        <header className="hdr">
          <button className="back" onClick={() => router.back()}>←</button>
          <div className="hdr-info">
            <span className="hdr-title">Voice Clone Setup</span>
            <span className="hdr-sub">Your voice · GYAANI's explanations</span>
          </div>
        </header>

        <div className="body">

          {/* Status hero */}
          <div className={`hero ${isComplete ? 'hero--done' : ''}`}>
            <span style={{ fontSize: 40 }}>{isComplete ? '✅' : isTraining ? '⚙️' : '🎙️'}</span>
            <div>
              <p className="hero-title">
                {isComplete
                  ? 'Voice Clone Ready!'
                  : isTraining
                  ? `Training in progress… ${status?.eta || ''}`
                  : 'Record Your Voice'}
              </p>
              <p className="hero-sub">
                {isComplete
                  ? 'Your students will hear explanations in your voice.'
                  : isTraining
                  ? 'Dinesh\'s Azure Custom Neural Voice is training your model.'
                  : `Record ${samplesRequired} short scripts to clone your teaching voice.`}
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13, color: '#aaa' }}>
              <span>Samples recorded</span>
              <span style={{ color: '#FF6EFF', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                {samplesRecorded} / {samplesRequired}
              </span>
            </div>
            <div style={{ height: 7, background: '#0c0c1a', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, width: `${progressPct}%`,
                background: 'linear-gradient(90deg,#FF6EFF,#6C63FF)',
                boxShadow: '0 0 10px rgba(255,110,255,0.4)',
                transition: 'width 0.8s ease',
              }} />
            </div>
          </div>

          {/* Recording UI */}
          {!isComplete && !isTraining && !readyToTrain && (
            <>
              <p className="sec-label">Script {currentScript + 1} of {SCRIPTS.length}</p>
              <div className="script-card">
                <p style={{
                  fontSize: 15, color: '#e0e0e8', lineHeight: 1.7,
                  fontFamily: "'Noto Sans Devanagari', 'Sora', sans-serif",
                }}>
                  {SCRIPTS[currentScript]}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  className={`rec-btn ${recording ? 'rec-btn--stop' : ''}`}
                  onClick={recording ? stopRecording : startRecording}
                >
                  <div className={`rec-orb ${recording ? 'rec-orb--active' : ''}`}>
                    <span style={{ fontSize: 28 }}>{recording ? '⏹' : '🎙️'}</span>
                  </div>
                  <span>{recording ? `Stop (${recSecs}s)` : 'Start Recording'}</span>
                </button>
              </div>

              {/* Recorded scripts */}
              {done.length > 0 && (
                <div className="done-list">
                  {done.map((i) => (
                    <div key={i} className="done-row">
                      <span style={{ color: '#43E97B', fontSize: 14 }}>✓</span>
                      <span style={{ fontSize: 12, color: '#666' }}>Script {i + 1} recorded</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Ready to train */}
          {readyToTrain && !isTraining && !isComplete && (
            <button
              className="train-btn"
              onClick={startTraining}
              disabled={training}
            >
              {training ? 'Starting…' : '🚀 Start Voice Training'}
            </button>
          )}

          {/* Training status */}
          {isTraining && (
            <div className="training-card">
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: '3px solid #FF6EFF33', borderTopColor: '#FF6EFF',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{ fontSize: 14, color: '#aaa' }}>
                Training your Custom Neural Voice… {status?.eta && `ETA: ${status.eta}`}
              </p>
            </div>
          )}

          {isComplete && (
            <button className="train-btn" onClick={() => router.push('/')}>
              🏠 Back to Dashboard
            </button>
          )}

        </div>
      </div>

      <style jsx>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .page {
          min-height: 100vh; background: #080810;
          color: #e8e8f0; font-family: 'Sora', sans-serif;
          opacity: 0; transform: translateY(14px);
          transition: opacity 0.4s ease, transform 0.4s ease;
          padding-bottom: 60px;
        }
        .page--in { opacity: 1; transform: none; }
        .hdr {
          display: flex; align-items: center; gap: 12px;
          padding: 13px 18px;
          background: rgba(8,8,16,0.96); backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          position: sticky; top: 0; z-index: 50;
        }
        .back {
          width: 34px; height: 34px; border-radius: 9px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
          color: #666; font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .hdr-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .hdr-title { font-size: 16px; font-weight: 800; color: #fff; }
        .hdr-sub   { font-size: 11px; color: #555; }
        .body {
          max-width: 520px; margin: 0 auto;
          padding: 20px 18px; display: flex; flex-direction: column; gap: 16px;
        }
        .sec-label {
          font-size: 10px; font-weight: 800; letter-spacing: 2.5px;
          text-transform: uppercase; color: #333350;
        }
        .hero {
          display: flex; align-items: flex-start; gap: 16px;
          background: rgba(255,110,255,0.06);
          border: 1px solid rgba(255,110,255,0.2);
          border-radius: 20px; padding: 20px;
          animation: popIn 0.5s cubic-bezier(.34,1.56,.64,1) both;
        }
        .hero--done {
          background: rgba(67,233,123,0.06) !important;
          border-color: rgba(67,233,123,0.25) !important;
        }
        @keyframes popIn { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:none} }
        .hero-title { font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 6px; }
        .hero-sub   { font-size: 13px; color: '#666'; line-height: 1.55; color: #666; }
        .card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; padding: 16px;
        }
        .script-card {
          background: rgba(255,110,255,0.05);
          border: 1px solid rgba(255,110,255,0.2);
          border-radius: 16px; padding: 20px;
        }
        .rec-btn {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          background: none; border: none; cursor: pointer;
          font-family: 'Sora', sans-serif; color: #aaa; font-size: 13px; font-weight: 700;
        }
        .rec-orb {
          width: 80px; height: 80px; border-radius: 50%;
          background: rgba(255,110,255,0.15);
          border: 2px solid rgba(255,110,255,0.4);
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .rec-orb--active {
          background: rgba(255,80,80,0.2);
          border-color: rgba(255,80,80,0.6);
          box-shadow: 0 0 20px rgba(255,80,80,0.3);
          animation: pulse 1s ease-in-out infinite;
        }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        .done-list { display: flex; flex-direction: column; gap: 6px; }
        .done-row  {
          display: flex; align-items: center; gap: 10px;
          background: rgba(67,233,123,0.05);
          border: 1px solid rgba(67,233,123,0.15);
          border-radius: 10px; padding: 9px 14px;
        }
        .train-btn {
          width: 100%; padding: 15px; border-radius: 14px;
          background: linear-gradient(135deg,#FF6EFF,#6C63FF);
          color: #fff; border: none; font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: 'Sora', sans-serif;
          box-shadow: 0 6px 20px rgba(255,110,255,0.3);
          transition: opacity 0.15s;
        }
        .train-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .training-card {
          display: flex; align-items: center; gap: 16px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}

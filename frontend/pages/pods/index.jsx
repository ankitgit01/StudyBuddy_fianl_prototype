// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  pages/pods/index.jsx  ·  Mangesh
//
//  Collaborative Learning Pods — Pod List Screen
//
//  DATA FLOW:
//  Dinesh's pod_manager.py matches students with similar
//  confusion patterns on shared subjects into anonymous pods.
//  Ankit exposes them at GET /api/pods.
//  This page renders whatever that returns — pods are
//  derived from the user's actual uploaded subjects.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { getPods } from '../../services/api'

// ── Confusion → colour ────────────────────────────────────────
function confColor(score) {
  if (score < 0.35) return '#43E97B'
  if (score < 0.65) return '#FFB300'
  return '#FF5050'
}

// ── Pod card ──────────────────────────────────────────────────
function PodCard({ pod, delay, onClick }) {
  const cc = confColor(pod.avg_confusion)
  return (
    <div
      className="pod-card"
      style={{ animationDelay: `${delay}s` }}
      onClick={() => onClick(pod.id)}
    >
      {/* Active indicator */}
      {pod.active && <div className="active-dot" />}

      <div className="pod-header">
        <div className="pod-icon">{pod.subject.charAt(0)}</div>
        <div className="pod-info">
          <p className="pod-subject">{pod.subject}</p>
          <p className="pod-meta">
            {pod.member_count} members · {pod.last_activity}
          </p>
        </div>
        <span className="pod-arrow">›</span>
      </div>

      <div className="pod-stats">
        <div className="pod-stat">
          <span className="stat-val" style={{ fontFamily: 'JetBrains Mono, monospace', color: cc }}>
            {Math.round(pod.avg_confusion * 100)}%
          </span>
          <span className="stat-label">Avg Confusion</span>
        </div>
        <div className="stat-divider" />
        <div className="pod-stat">
          <span className="stat-val" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#6C63FF' }}>
            {pod.shared_notes}
          </span>
          <span className="stat-label">Shared Notes</span>
        </div>
        <div className="stat-divider" />
        <div className="pod-stat">
          <span className="stat-val" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#aaa' }}>
            {pod.member_count}
          </span>
          <span className="stat-label">Students</span>
        </div>
      </div>

      {pod.top_confused_topic && (
        <div className="confused-topic">
          <span style={{ color: '#555', fontSize: 11 }}>Most confused: </span>
          <span style={{ color: cc, fontSize: 11, fontWeight: 700 }}>{pod.top_confused_topic}</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function PodsPage() {
  const router = useRouter()

  const [pods,    setPods]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    getPods()
      .then((d) => { setPods(d); setLoading(false) })
      .catch((err) => {
        console.error(err)
        setError('Could not load pods. Upload a note to be matched into a pod.')
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <>
      <Head>
        <title>Learning Pods — GYAANI AI</title>
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{
        minHeight: '100vh', background: '#080810',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 18, fontFamily: 'Sora, sans-serif',
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%',
          border: '3px solid #111128', borderTopColor: '#00C9FF',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontSize: 13, color: '#444' }}>Finding your study pods…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  )

  if (error || pods.length === 0) return (
    <>
      <Head><title>Learning Pods — GYAANI AI</title></Head>
      <div style={{
        minHeight: '100vh', background: '#080810',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, fontFamily: 'Sora, sans-serif',
        padding: '0 24px', textAlign: 'center',
      }}>
        <span style={{ fontSize: 52 }}>🫂</span>
        <p style={{ fontSize: 15, color: '#bbb', fontWeight: 700, maxWidth: 300 }}>
          {error || 'No pods yet. Upload notes to be matched with students studying the same topics.'}
        </p>
        <button onClick={() => router.push('/upload')} style={{
          padding: '13px 32px', borderRadius: 12,
          background: 'linear-gradient(135deg,#00C9FF,#6C63FF)',
          color: '#fff', border: 'none', fontSize: 15,
          fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif',
        }}>Upload a Note</button>
      </div>
    </>
  )

  return (
    <>
      <Head>
        <title>Learning Pods — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={`page ${visible ? 'page--in' : ''}`}>

        {/* ── HEADER ── */}
        <header className="hdr">
          <button className="back" onClick={() => router.back()}>←</button>
          <div className="hdr-info">
            <span className="hdr-title">Learning Pods</span>
            <span className="hdr-sub">{pods.length} pod{pods.length !== 1 ? 's' : ''} matched to your subjects</span>
          </div>
        </header>

        <div className="body">

          {/* ── EXPLAINER ── */}
          <div className="explainer">
            <span style={{ fontSize: 20 }}>🫂</span>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
              You're anonymously matched with students who uploaded notes on the same subjects
              and share similar confusion patterns. Learn together.
            </p>
          </div>

          {/* ── POD LIST — renders whatever the API returned ── */}
          <p className="sec-label">Your Pods</p>
          {pods.map((pod, i) => (
            <PodCard
              key={pod.id}
              pod={pod}
              delay={i * 0.08}
              onClick={(id) => router.push(`/pods/${id}`)}
            />
          ))}

          <button className="btn-full" onClick={() => router.push('/')}>
            🏠 Back to Dashboard
          </button>

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
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          color: #666; font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .back:hover { color: #ccc; }
        .hdr-info  { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .hdr-title { font-size: 16px; font-weight: 800; color: #fff; }
        .hdr-sub   { font-size: 11px; color: #555; }

        .body {
          max-width: 520px; margin: 0 auto;
          padding: 20px 18px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .sec-label {
          font-size: 10px; font-weight: 800;
          letter-spacing: 2.5px; text-transform: uppercase;
          color: #333350; margin-top: 4px;
        }

        .explainer {
          display: flex; align-items: flex-start; gap: 12px;
          background: rgba(0,201,255,0.05);
          border: 1px solid rgba(0,201,255,0.15);
          border-radius: 16px; padding: 16px;
        }

        /* pod card */
        .pod-card {
          position: relative;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 18px; padding: 18px;
          cursor: pointer;
          animation: slideUp 0.4s ease both;
          transition: border-color 0.2s, background 0.2s;
          display: flex; flex-direction: column; gap: 14px;
        }
        .pod-card:hover {
          border-color: rgba(108,99,255,0.3);
          background: rgba(108,99,255,0.04);
        }
        @keyframes slideUp {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:none; }
        }

        .active-dot {
          position: absolute; top: 14px; right: 14px;
          width: 8px; height: 8px; border-radius: 50%;
          background: #43E97B;
          box-shadow: 0 0 8px #43E97B;
          animation: blink 1.4s ease-in-out infinite;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .pod-header { display: flex; align-items: center; gap: 12px; }
        .pod-icon {
          width: 40px; height: 40px; border-radius: 12px;
          background: linear-gradient(135deg,#6C63FF22,#00C9FF22);
          border: 1px solid rgba(108,99,255,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; font-weight: 800; color: #6C63FF;
          flex-shrink: 0;
        }
        .pod-info    { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .pod-subject { font-size: 16px; font-weight: 700; color: #e0e0e8; }
        .pod-meta    { font-size: 12px; color: #555; }
        .pod-arrow   { color: #333; font-size: 22px; }

        .pod-stats {
          display: flex; align-items: center;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 12px; padding: 12px;
          gap: 0;
        }
        .pod-stat {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; gap: 4px;
        }
        .stat-val   { font-size: 18px; font-weight: 700; }
        .stat-label { font-size: 9px; color: #444; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
        .stat-divider { width: 1px; height: 30px; background: rgba(255,255,255,0.06); }

        .confused-topic { font-size: 11px; }

        .btn-full {
          width: 100%; padding: 13px; border-radius: 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          color: #555; font-size: 13px; font-weight: 700;
          cursor: pointer; font-family: 'Sora', sans-serif;
          transition: color 0.15s; margin-top: 4px;
        }
        .btn-full:hover { color: #aaa; }
      `}</style>
    </>
  )
}

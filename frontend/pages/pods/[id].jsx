// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  pages/pods/[id].jsx  ·  Mangesh
//
//  Learning Pod Detail Screen
//
//  DATA FLOW:
//  podId comes from the URL (set by pods/index.jsx when user
//  taps a pod). getPod(podId) fetches full pod detail from
//  GET /api/pods/:podId — members, shared notes, confusion trend.
//  Everything rendered here comes from that response.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { getPod } from '../../services/api'

function confColor(score) {
  if (score < 0.35) return '#43E97B'
  if (score < 0.65) return '#FFB300'
  return '#FF5050'
}
function confLabel(score) {
  if (score < 0.35) return 'Clear'
  if (score < 0.65) return 'Medium'
  return 'Confused'
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value
  return (
    <div style={{
      background: '#0d0d1a', border: '1px solid #1e1e30',
      borderRadius: 10, padding: '9px 13px',
      fontSize: 12, fontFamily: 'Sora, sans-serif',
    }}>
      <p style={{ color: '#555', marginBottom: 4 }}>{label}</p>
      <p style={{ color: confColor(val), fontWeight: 700 }}>
        Confusion: {Math.round(val * 100)}%
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function PodDetailPage() {
  const router = useRouter()
  const { id: podId } = router.query

  const [pod,     setPod]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [visible, setVisible] = useState(false)
  const [tab,     setTab]     = useState('members') // 'members' | 'notes' | 'trend'

  useEffect(() => {
    if (!router.isReady || !podId) return
    setVisible(true)
    getPod(podId)
      .then((d) => { setPod(d); setLoading(false) })
      .catch((err) => {
        console.error(err)
        setError('Could not load pod details.')
        setLoading(false)
      })
  }, [router.isReady, podId])

  if (loading) return (
    <>
      <Head>
        <title>Pod — GYAANI AI</title>
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
        <p style={{ fontSize: 13, color: '#444' }}>Loading pod…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  )

  if (error || !pod) return (
    <>
      <Head><title>Pod — GYAANI AI</title></Head>
      <div style={{
        minHeight: '100vh', background: '#080810',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, fontFamily: 'Sora, sans-serif',
        padding: '0 24px', textAlign: 'center',
      }}>
        <span style={{ fontSize: 52 }}>🫂</span>
        <p style={{ fontSize: 15, color: '#bbb', fontWeight: 700 }}>{error || 'Pod not found.'}</p>
        <button onClick={() => router.push('/pods')} style={{
          padding: '13px 32px', borderRadius: 12,
          background: 'linear-gradient(135deg,#00C9FF,#6C63FF)',
          color: '#fff', border: 'none', fontSize: 15,
          fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif',
        }}>Back to Pods</button>
      </div>
    </>
  )

  // Everything below renders from pod API response
  const {
    subject,
    member_count,
    active,
    last_activity,
    shared_notes,
    avg_confusion,
    top_confused_topic,
    members,
    shared_notes_list,
    group_confusion_trend,
  } = pod

  const cc = confColor(avg_confusion)

  const TABS = [
    { id: 'members', label: `Members (${member_count})` },
    { id: 'notes',   label: `Notes (${shared_notes})` },
    { id: 'trend',   label: 'Confusion Trend' },
  ]

  return (
    <>
      <Head>
        <title>{subject} Pod — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={`page ${visible ? 'page--in' : ''}`}>

        {/* ── HEADER ── */}
        <header className="hdr">
          <button className="back" onClick={() => router.push('/pods')}>←</button>
          <div className="hdr-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="hdr-title">{subject} Pod</span>
              {active && <span className="active-badge">● Live</span>}
            </div>
            <span className="hdr-sub">{member_count} members · {last_activity}</span>
          </div>
        </header>

        <div className="body">

          {/* ── HERO STATS ── */}
          <div className="hero">
            <div className="stat-block">
              <span className="stat-num" style={{ color: cc, fontFamily: 'JetBrains Mono, monospace' }}>
                {Math.round(avg_confusion * 100)}%
              </span>
              <span className="stat-label">Group Confusion</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-block">
              <span className="stat-num" style={{ color: '#6C63FF', fontFamily: 'JetBrains Mono, monospace' }}>
                {shared_notes}
              </span>
              <span className="stat-label">Shared Notes</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-block">
              <span className="stat-num" style={{ color: '#aaa', fontFamily: 'JetBrains Mono, monospace' }}>
                {member_count}
              </span>
              <span className="stat-label">Students</span>
            </div>
          </div>

          {top_confused_topic && (
            <div className="confused-banner" style={{ borderColor: `${cc}30`, background: `${cc}07` }}>
              <span style={{ fontSize: 15 }}>🔴</span>
              <p style={{ fontSize: 13, color: '#aaa' }}>
                Group struggles most with{' '}
                <strong style={{ color: cc }}>{top_confused_topic}</strong>
                {' '}in {subject}
              </p>
            </div>
          )}

          {/* ── TABS ── */}
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab-btn ${tab === t.id ? 'tab--on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── MEMBERS TAB ── */}
          {tab === 'members' && members && members.length > 0 && (
            <div className="list">
              {members.map((m, i) => {
                const mc = confColor(m.confusion_score)
                return (
                  <div key={m.id} className="list-row" style={{ animationDelay: `${i * 0.06}s` }}>
                    <div className="member-avatar">{m.alias.charAt(m.alias.length - 1)}</div>
                    <div className="member-info">
                      <p className="member-name">{m.alias}</p>
                      <p className="member-meta">
                        {m.notes_shared} note{m.notes_shared !== 1 ? 's' : ''} shared · {m.streak} day streak
                      </p>
                    </div>
                    <div className="member-conf">
                      <span style={{ color: mc, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700 }}>
                        {Math.round(m.confusion_score * 100)}%
                      </span>
                      <span style={{ fontSize: 9, color: '#444', textAlign: 'right', display: 'block' }}>
                        {confLabel(m.confusion_score)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── NOTES TAB ── */}
          {tab === 'notes' && shared_notes_list && shared_notes_list.length > 0 && (
            <div className="list">
              {shared_notes_list.map((note, i) => {
                const nc = confColor(note.confusion)
                return (
                  <div key={note.id} className="list-row" style={{ animationDelay: `${i * 0.06}s` }}>
                    <div className="note-icon">📄</div>
                    <div className="member-info">
                      <p className="member-name">{note.title}</p>
                      <p className="member-meta">
                        by {note.shared_by} · {note.uploaded_at}
                      </p>
                    </div>
                    <div className="member-conf">
                      <span style={{ color: nc, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700 }}>
                        {Math.round(note.confusion * 100)}%
                      </span>
                      <span style={{ fontSize: 9, color: '#444', textAlign: 'right', display: 'block' }}>
                        {confLabel(note.confusion)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── TREND TAB ── */}
          {tab === 'trend' && group_confusion_trend && group_confusion_trend.length > 1 && (
            <div className="card">
              <p className="sec-label" style={{ marginBottom: 14 }}>Group Confusion This Week</p>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart
                  data={group_confusion_trend}
                  margin={{ top: 4, right: 6, left: -26, bottom: 0 }}
                >
                  <CartesianGrid stroke="#0e0e1c" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: '#444', fontSize: 10, fontFamily: 'Sora' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#444', fontSize: 10, fontFamily: 'Sora' }}
                    axisLine={false} tickLine={false}
                    domain={[0, 1]}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone" dataKey="avg"
                    stroke={cc} strokeWidth={2}
                    dot={false} activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── ACTIONS ── */}
          <button className="btn-primary" onClick={() => router.push('/upload')}>
            📤 Share a Note to this Pod
          </button>
          <button className="btn-ghost" onClick={() => router.push('/pods')}>
            ← All Pods
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
        .hdr-info  { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .hdr-title { font-size: 16px; font-weight: 800; color: #fff; }
        .hdr-sub   { font-size: 11px; color: #555; }
        .active-badge {
          font-size: 10px; font-weight: 700; color: #43E97B;
          animation: blink 1.4s ease-in-out infinite;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .body {
          max-width: 520px; margin: 0 auto;
          padding: 20px 18px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .sec-label {
          font-size: 10px; font-weight: 800;
          letter-spacing: 2.5px; text-transform: uppercase;
          color: #333350;
        }

        /* hero stats */
        .hero {
          display: flex; align-items: center;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px; padding: 18px;
          animation: popIn 0.5s cubic-bezier(.34,1.56,.64,1) both;
        }
        @keyframes popIn {
          from { opacity:0; transform:scale(.95) translateY(10px); }
          to   { opacity:1; transform:none; }
        }
        .stat-block { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .stat-num   { font-size: 26px; font-weight: 800; }
        .stat-label { font-size: 9px; color: #444; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
        .stat-divider { width: 1px; height: 36px; background: rgba(255,255,255,0.06); }

        .confused-banner {
          display: flex; align-items: center; gap: 10px;
          border: 1px solid; border-radius: 14px; padding: 14px;
        }

        /* tabs */
        .tabs {
          display: flex; gap: 4px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px; padding: 4px;
        }
        .tab-btn {
          flex: 1; background: none; border: none;
          color: #555; font-family: 'Sora', sans-serif;
          font-size: 11px; font-weight: 700;
          padding: 8px 4px; border-radius: 9px;
          cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
        }
        .tab--on {
          background: rgba(108,99,255,0.2);
          color: #9b95ff;
        }

        /* list */
        .list { display: flex; flex-direction: column; gap: 10px; }
        .list-row {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px; padding: 14px;
          animation: slideUp 0.35s ease both;
        }
        @keyframes slideUp {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:none; }
        }
        .member-avatar {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg,#6C63FF22,#43E97B22);
          border: 1px solid rgba(108,99,255,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 800; color: #6C63FF;
          flex-shrink: 0;
        }
        .note-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; flex-shrink: 0;
        }
        .member-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .member-name { font-size: 14px; font-weight: 700; color: #e0e0e8; }
        .member-meta { font-size: 11px; color: #555; }
        .member-conf { text-align: right; flex-shrink: 0; }

        /* card */
        .card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px; padding: 18px;
        }

        /* buttons */
        .btn-primary {
          width: 100%; padding: 14px; border-radius: 14px;
          background: linear-gradient(135deg,#00C9FF,#6C63FF);
          color: #fff; border: none; font-size: 14px;
          font-weight: 700; cursor: pointer;
          font-family: 'Sora', sans-serif;
          transition: transform 0.15s, opacity 0.15s;
        }
        .btn-primary:hover { transform: translateY(-2px); opacity: 0.9; }
        .btn-ghost {
          width: 100%; padding: 13px; border-radius: 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          color: #555; font-size: 13px; font-weight: 700;
          cursor: pointer; font-family: 'Sora', sans-serif;
          transition: color 0.15s;
        }
        .btn-ghost:hover { color: #aaa; }
      `}</style>
    </>
  )
}

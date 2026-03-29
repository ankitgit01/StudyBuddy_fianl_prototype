// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  pages/teacher.jsx  ·  Mangesh
//
//  Teacher Analytics Dashboard
//
//  DATA FLOW:
//  Dinesh's Azure Synapse aggregates class-wide confusion data.
//  Ankit exposes it at GET /api/teacher/analytics
//  This page renders class performance — all data from API.
//  Mock: builds realistic class data from seed.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

const USE_MOCK = true
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function seed(str) {
  return (str || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

function buildMockTeacher() {
  const subjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology']
  return {
    class_name: 'Class XII — Science',
    total_students: 38,
    active_this_week: 31,
    avg_confusion: 0.47,
    notes_uploaded_this_week: 94,
    subject_breakdown: subjects.map((s) => ({
      subject: s,
      avg_confusion: parseFloat((0.3 + (seed(s) % 6) * 0.07).toFixed(2)),
      student_count: 20 + (seed(s) % 18),
      notes_count:   8  + (seed(s) % 12),
    })),
    top_confused_topics: [
      { topic: 'Thermodynamics — Entropy', subject: 'Physics',     confusion: 0.82, students_affected: 24 },
      { topic: 'Integration by Parts',     subject: 'Mathematics', confusion: 0.74, students_affected: 19 },
      { topic: 'Organic Reactions',        subject: 'Chemistry',   confusion: 0.69, students_affected: 17 },
      { topic: 'Cell Division — Meiosis',  subject: 'Biology',     confusion: 0.61, students_affected: 14 },
      { topic: 'Newton\'s Laws — Friction', subject: 'Physics',    confusion: 0.55, students_affected: 12 },
    ],
    weekly_activity: [
      { day: 'Mon', notes: 18, students: 22 },
      { day: 'Tue', notes: 14, students: 18 },
      { day: 'Wed', notes: 22, students: 28 },
      { day: 'Thu', notes: 16, students: 20 },
      { day: 'Fri', notes: 24, students: 31 },
      { day: 'Sat', notes: 8,  students: 12 },
      { day: 'Sun', notes: 4,  students: 6  },
    ],
    dna_distribution: {
      visual:      42,
      auditory:    31,
      kinesthetic: 27,
    },
  }
}

async function getTeacherAnalytics() {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600))
    return buildMockTeacher()
  }
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''
  const res = await fetch(`${BASE_URL}/api/teacher/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch analytics')
  return res.json()
}

function confColor(score) {
  if (score < 0.35) return '#43E97B'
  if (score < 0.65) return '#FFB300'
  return '#FF5050'
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0d0d1a', border: '1px solid #1e1e30',
      borderRadius: 10, padding: '9px 13px',
      fontSize: 12, fontFamily: 'Sora, sans-serif',
    }}>
      <p style={{ color: '#555', marginBottom: 4 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.fill || '#6C63FF', margin: '2px 0' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

export default function TeacherPage() {
  const router = useRouter()

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [visible, setVisible] = useState(false)
  const [tab,     setTab]     = useState('overview') // 'overview' | 'topics' | 'dna'

  useEffect(() => {
    setVisible(true)
    getTeacherAnalytics()
      .then((d) => { setData(d); setLoading(false) })
      .catch((err) => { setError(err.message); setLoading(false) })
  }, [])

  if (loading) return (
    <>
      <Head>
        <title>Teacher Dashboard — GYAANI AI</title>
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
          border: '3px solid #111128', borderTopColor: '#43E97B',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontSize: 13, color: '#444' }}>Loading class analytics…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  )

  if (error || !data) return (
    <>
      <Head><title>Teacher Dashboard — GYAANI AI</title></Head>
      <div style={{
        minHeight: '100vh', background: '#080810',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, fontFamily: 'Sora, sans-serif',
        padding: '0 24px', textAlign: 'center',
      }}>
        <span style={{ fontSize: 48 }}>📊</span>
        <p style={{ fontSize: 14, color: '#bbb', fontWeight: 700 }}>
          {error || 'No analytics available yet.'}
        </p>
        <button onClick={() => router.push('/')} style={{
          padding: '12px 28px', borderRadius: 12,
          background: 'linear-gradient(135deg,#43E97B,#00C9FF)',
          color: '#080810', border: 'none', fontSize: 14,
          fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif',
        }}>Go to Dashboard</button>
      </div>
    </>
  )

  const {
    class_name, total_students, active_this_week,
    avg_confusion, notes_uploaded_this_week,
    subject_breakdown, top_confused_topics,
    weekly_activity, dna_distribution,
  } = data

  const TABS = ['overview', 'topics', 'dna']

  return (
    <>
      <Head>
        <title>Teacher Dashboard — GYAANI AI</title>
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
            <span className="hdr-title">Teacher Dashboard</span>
            <span className="hdr-sub">{class_name}</span>
          </div>
          <div style={{
            background: 'rgba(67,233,123,0.1)',
            border: '1px solid rgba(67,233,123,0.25)',
            color: '#43E97B', borderRadius: 8,
            padding: '4px 10px', fontSize: 11, fontWeight: 700,
          }}>
            TEACHER
          </div>
        </header>

        <div className="body">

          {/* ── TOP STATS ── */}
          <div className="stats-grid">
            {[
              { val: total_students,           label: 'Total Students',    color: '#6C63FF' },
              { val: active_this_week,          label: 'Active This Week',  color: '#43E97B' },
              { val: `${Math.round(avg_confusion * 100)}%`, label: 'Avg Confusion', color: confColor(avg_confusion) },
              { val: notes_uploaded_this_week,  label: 'Notes This Week',  color: '#00C9FF' },
            ].map(({ val, label, color }) => (
              <div key={label} className="stat-card">
                <span style={{
                  fontSize: 24, fontWeight: 800, color,
                  fontFamily: 'JetBrains Mono, monospace',
                }}>{val}</span>
                <span style={{ fontSize: 9, color: '#444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* ── TABS ── */}
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t}
                className={`tab-btn ${tab === t ? 'tab--on' : ''}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW TAB ── */}
          {tab === 'overview' && (
            <>
              {/* Weekly activity chart */}
              <p className="sec-label">Weekly Activity</p>
              <div className="card">
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={weekly_activity} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
                    <CartesianGrid stroke="#0e0e1c" strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#444', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<BarTooltip />} />
                    <Bar dataKey="notes" name="Notes" fill="#6C63FF" radius={[4,4,0,0]} />
                    <Bar dataKey="students" name="Students" fill="#43E97B55" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Subject breakdown */}
              <p className="sec-label">By Subject</p>
              <div className="list">
                {subject_breakdown.map((s, i) => {
                  const cc = confColor(s.avg_confusion)
                  return (
                    <div key={s.subject} className="list-row" style={{ animationDelay: `${i * 0.06}s` }}>
                      <div className="subj-icon">{s.subject.charAt(0)}</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#e0e0e8' }}>{s.subject}</p>
                        <p style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                          {s.student_count} students · {s.notes_count} notes
                        </p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: cc, fontFamily: 'JetBrains Mono, monospace' }}>
                          {Math.round(s.avg_confusion * 100)}%
                        </p>
                        <p style={{ fontSize: 9, color: cc, fontWeight: 700, textTransform: 'uppercase' }}>confusion</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── TOPICS TAB — most confused topics in the class ── */}
          {tab === 'topics' && (
            <>
              <p className="sec-label">Most Confused Topics</p>
              <div className="list">
                {top_confused_topics.map((t, i) => {
                  const cc = confColor(t.confusion)
                  return (
                    <div key={i} className="list-row" style={{ animationDelay: `${i * 0.06}s` }}>
                      <div className="rank-badge" style={{ color: cc, borderColor: `${cc}40`, background: `${cc}10` }}>
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#e0e0e8' }}>{t.topic}</p>
                        <p style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                          {t.subject} · {t.students_affected} students affected
                        </p>
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: cc,
                        fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
                      }}>
                        {Math.round(t.confusion * 100)}%
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="insight-card">
                <span style={{ fontSize: 20 }}>💡</span>
                <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.65 }}>
                  <strong style={{ color: '#e0e0e8' }}>Recommendation:</strong> Focus your next class on{' '}
                  <strong style={{ color: '#FF5050' }}>{top_confused_topics[0]?.topic}</strong> —
                  it has the highest confusion score across the most students.
                </p>
              </div>
            </>
          )}

          {/* ── DNA TAB — class-wide learning style distribution ── */}
          {tab === 'dna' && (
            <>
              <p className="sec-label">Class Learning Style Distribution</p>
              <div className="card">
                {[
                  { type: 'visual',      label: 'Visual',      color: '#6C63FF', emoji: '👁️' },
                  { type: 'auditory',    label: 'Auditory',    color: '#43E97B', emoji: '👂' },
                  { type: 'kinesthetic', label: 'Kinesthetic', color: '#F7971E', emoji: '✋' },
                ].map((d) => {
                  const pct = dna_distribution[d.type] || 0
                  return (
                    <div key={d.type} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                        <span style={{ fontSize: 15 }}>{d.emoji}</span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#ccc', fontFamily: 'Sora, sans-serif' }}>
                          {d.label}
                        </span>
                        <span style={{ color: d.color, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                          {pct}% of class
                        </span>
                      </div>
                      <div style={{ height: 8, background: '#0c0c1a', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 4,
                          width: `${pct}%`,
                          background: `linear-gradient(90deg,${d.color}bb,${d.color})`,
                          boxShadow: `0 0 10px ${d.color}40`,
                          transition: 'width 1s ease',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="insight-card">
                <span style={{ fontSize: 20 }}>🎯</span>
                <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.65 }}>
                  <strong style={{ color: '#e0e0e8' }}>Teaching Tip:</strong> {
                    dna_distribution.visual >= dna_distribution.auditory &&
                    dna_distribution.visual >= dna_distribution.kinesthetic
                      ? 'Most of your class are Visual learners. Use diagrams, colour-coded boards, and visual mnemonics in your lessons.'
                      : dna_distribution.auditory >= dna_distribution.kinesthetic
                      ? 'Most of your class are Auditory learners. Verbal explanations, discussions, and recorded lectures will be most effective.'
                      : 'Most of your class are Kinesthetic learners. Use worked examples, practice problems, and hands-on demonstrations.'
                  }
                </p>
              </div>
            </>
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
          padding: 18px 18px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .sec-label {
          font-size: 10px; font-weight: 800;
          letter-spacing: 2.5px; text-transform: uppercase;
          color: #333350; margin-top: 4px;
        }

        .stats-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .stat-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 16px 14px;
          display: flex; flex-direction: column; gap: 6px;
          animation: popIn 0.5s cubic-bezier(.34,1.56,.64,1) both;
        }
        @keyframes popIn {
          from { opacity:0; transform:scale(.95) translateY(10px); }
          to   { opacity:1; transform:none; }
        }

        .tabs {
          display: flex; gap: 4px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px; padding: 4px;
        }
        .tab-btn {
          flex: 1; background: none; border: none;
          color: #555; font-family: 'Sora', sans-serif;
          font-size: 12px; font-weight: 700;
          padding: 9px 4px; border-radius: 9px;
          cursor: pointer; transition: all 0.15s;
        }
        .tab--on { background: rgba(108,99,255,0.2); color: #9b95ff; }

        .card {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px; padding: 18px;
        }

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
        .subj-icon {
          width: 38px; height: 38px; border-radius: 10px;
          background: linear-gradient(135deg,#6C63FF22,#43E97B22);
          border: 1px solid rgba(108,99,255,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 800; color: #6C63FF;
          flex-shrink: 0;
        }
        .rank-badge {
          width: 36px; height: 36px; border-radius: 10px;
          border: 1px solid; display: flex;
          align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800;
          fontFamily: 'JetBrains Mono, monospace';
          flex-shrink: 0;
        }

        .insight-card {
          display: flex; align-items: flex-start; gap: 12px;
          background: rgba(255,179,0,0.06);
          border: 1px solid rgba(255,179,0,0.2);
          border-radius: 16px; padding: 16px;
        }
      `}</style>
    </>
  )
}

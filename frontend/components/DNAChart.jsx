// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  components/DNAChart.jsx  ·  Mangesh
//
//  Reusable Study DNA visualisation.
//  Donut chart + optional weekly history line chart.
//  Used by dna.jsx and profile.jsx
//
//  Props:
//    scores   — { visual, auditory, kinesthetic }  (0–100 each)
//    dominant — 'visual' | 'auditory' | 'kinesthetic'
//    history  — optional array [{ week, visual, auditory, kinesthetic }]
//    size     — donut SVG size (default 136)
//    showHistory — bool (default true)
// ─────────────────────────────────────────────────────────────

import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const DNA_CONFIG = {
  visual:      { color: '#6C63FF', label: 'Visual',      hi: 'दृश्य',  emoji: '👁️' },
  auditory:    { color: '#43E97B', label: 'Auditory',    hi: 'श्रवण',  emoji: '👂' },
  kinesthetic: { color: '#F7971E', label: 'Kinesthetic', hi: 'गतिज',   emoji: '✋' },
}
const TYPE_ORDER = ['visual', 'auditory', 'kinesthetic']

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0d0d1a', border: '1px solid #1e1e30',
      borderRadius: 10, padding: '10px 14px',
      fontSize: 12, fontFamily: 'Sora, sans-serif',
    }}>
      <p style={{ color: '#555', marginBottom: 6, fontWeight: 700 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color, margin: '3px 0' }}>
          {DNA_CONFIG[p.dataKey]?.label}: <strong>{p.value}%</strong>
        </p>
      ))}
    </div>
  )
}

// SVG donut
function Donut({ scores, dominant, size }) {
  const R    = 52
  const CX   = 68
  const CY   = 68
  const CIRC = 2 * Math.PI * R
  const total = TYPE_ORDER.reduce((s, t) => s + (scores[t] || 0), 0) || 1

  let cursor = 0
  const segments = TYPE_ORDER.map((type) => {
    const frac = (scores[type] || 0) / total
    const dash = frac * CIRC
    const seg  = { type, dash, gap: CIRC - dash, offset: cursor }
    cursor    += dash
    return seg
  })

  return (
    <svg width={size} height={size} viewBox="0 0 136 136">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#0e0e1c" strokeWidth={14} />
      {segments.map((seg) => (
        <circle
          key={seg.type}
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={DNA_CONFIG[seg.type]?.color || '#555'}
          strokeWidth={14}
          strokeLinecap="butt"
          strokeDasharray={`${seg.dash} ${seg.gap}`}
          strokeDashoffset={-seg.offset}
          transform={`rotate(-90 ${CX} ${CY})`}
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.34,1.56,.64,1)' }}
        />
      ))}
      <text
        x={CX} y={CY + 10}
        textAnchor="middle"
        style={{ fontSize: 26, fontFamily: 'Sora, sans-serif' }}
      >
        {DNA_CONFIG[dominant]?.emoji || '🧬'}
      </text>
    </svg>
  )
}

export default function DNAChart({
  scores,
  dominant,
  history,
  size = 136,
  showHistory = true,
}) {
  if (!scores || !dominant) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Donut */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Donut scores={scores} dominant={dominant} size={size} />
      </div>

      {/* Bar breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TYPE_ORDER.map((type) => {
          const cfg = DNA_CONFIG[type]
          const pct = scores[type] ?? 0
          return (
            <div key={type}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>{cfg.emoji}</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#ccc', fontFamily: 'Sora, sans-serif' }}>
                  {cfg.label}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: cfg.color,
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  {pct}%
                </span>
              </div>
              <div style={{ height: 6, background: '#0c0c1a', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${pct}%`,
                  background: `linear-gradient(90deg,${cfg.color}bb,${cfg.color})`,
                  boxShadow: `0 0 8px ${cfg.color}40`,
                  transition: 'width 1.2s cubic-bezier(.34,1.56,.64,1)',
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* History chart */}
      {showHistory && history && history.length > 1 && (
        <div>
          <p style={{
            fontSize: 10, fontWeight: 800, letterSpacing: 2,
            textTransform: 'uppercase', color: '#333350',
            fontFamily: 'Sora, sans-serif', marginBottom: 10,
          }}>
            DNA Evolution
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={history} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid stroke="#101020" strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                tick={{ fill: '#444', fontSize: 10, fontFamily: 'Sora' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fill: '#444', fontSize: 10, fontFamily: 'Sora' }}
                axisLine={false} tickLine={false}
                domain={[0, 100]}
              />
              <Tooltip content={<ChartTooltip />} />
              {TYPE_ORDER.map((type) => (
                <Line
                  key={type}
                  type="monotone"
                  dataKey={type}
                  stroke={DNA_CONFIG[type].color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 8 }}>
            {TYPE_ORDER.map((type) => (
              <span key={type} style={{
                fontSize: 10, color: DNA_CONFIG[type].color,
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: 'Sora, sans-serif',
              }}>
                <span style={{
                  width: 16, height: 2,
                  background: DNA_CONFIG[type].color,
                  display: 'inline-block', borderRadius: 2,
                }} />
                {DNA_CONFIG[type].label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

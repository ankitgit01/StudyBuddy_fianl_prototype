// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  components/StressGauge.jsx  ·  Mangesh
//
//  Reusable SVG semicircle stress gauge.
//  Used by wellness.jsx
//
//  Props:
//    score  — 0–100 number
//    label  — 'low' | 'moderate' | 'high'
//    size   — optional width/height (default 180)
// ─────────────────────────────────────────────────────────────

const STRESS_CONFIG = {
  low:      { color: '#43E97B', emoji: '😌' },
  moderate: { color: '#FFB300', emoji: '😐' },
  high:     { color: '#FF5050', emoji: '😰' },
}

export default function StressGauge({ score = 0, label = 'moderate', size = 180 }) {
  const cfg   = STRESS_CONFIG[label] || STRESS_CONFIG.moderate
  const R     = 70
  const CX    = 90
  const CY    = 90

  const start  = { x: CX - R, y: CY }
  const end    = { x: CX + R, y: CY }
  const angle  = (Math.max(0, Math.min(100, score)) / 100) * Math.PI
  const fillX  = CX - R * Math.cos(angle)
  const fillY  = CY - R * Math.sin(angle)
  const largeArc = score > 50 ? 1 : 0

  return (
    <svg
      width={size}
      height={size * (100 / 180)}
      viewBox="0 0 180 100"
      style={{ overflow: 'visible' }}
    >
      {/* Track */}
      <path
        d={`M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`}
        fill="none" stroke="#111122" strokeWidth={14} strokeLinecap="round"
      />
      {/* Fill */}
      {score > 0 && (
        <path
          d={`M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${fillX} ${fillY}`}
          fill="none"
          stroke={cfg.color}
          strokeWidth={14}
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 6px ${cfg.color})`,
            transition: 'all 1s cubic-bezier(.34,1.56,.64,1)',
          }}
        />
      )}
      {/* Needle tip */}
      <circle
        cx={fillX} cy={fillY} r={7}
        fill={cfg.color}
        style={{ filter: `drop-shadow(0 0 8px ${cfg.color})` }}
      />
      {/* Emoji */}
      <text x={CX} y={CY - 12} textAnchor="middle"
        style={{ fontSize: 28, fontFamily: 'Sora, sans-serif' }}>
        {cfg.emoji}
      </text>
      {/* Score number */}
      <text x={CX} y={CY + 6} textAnchor="middle"
        fill={cfg.color}
        style={{ fontSize: 20, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>
        {score}
      </text>
      {/* /100 */}
      <text x={CX} y={CY + 20} textAnchor="middle"
        fill="#444"
        style={{ fontSize: 9, fontFamily: 'Sora, sans-serif', fontWeight: 700, letterSpacing: 1 }}>
        / 100
      </text>
    </svg>
  )
}

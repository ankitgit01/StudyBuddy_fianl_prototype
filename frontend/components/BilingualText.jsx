// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  components/BilingualText.jsx  ·  Mangesh
//
//  Reusable bilingual text renderer.
//  Used across explanation.jsx, quiz.jsx, heatmap.jsx, dna.jsx
//
//  Props:
//    hindi    — Hindi string (Devanagari)
//    english  — English string
//    mode     — 'both' | 'hi' | 'en'   (default: 'both')
//    size     — 'sm' | 'md' | 'lg'     (default: 'md')
//    hiFirst  — bool, show Hindi on top (default: true)
// ─────────────────────────────────────────────────────────────

export default function BilingualText({
  hindi,
  english,
  mode = 'both',
  size = 'md',
  hiFirst = true,
}) {
  const showHi = mode === 'both' || mode === 'hi'
  const showEn = mode === 'both' || mode === 'en'

  const sizes = {
    sm: { hi: 13, en: 12 },
    md: { hi: 15, en: 13 },
    lg: { hi: 18, en: 15 },
  }
  const s = sizes[size] || sizes.md

  const hiEl = showHi && hindi && (
    <span
      style={{
        display: 'block',
        fontSize: s.hi,
        fontFamily: "'Noto Sans Devanagari', 'Sora', sans-serif",
        fontWeight: 600,
        color: '#e0e0e8',
        lineHeight: 1.65,
      }}
    >
      {hindi}
    </span>
  )

  const enEl = showEn && english && (
    <span
      style={{
        display: 'block',
        fontSize: s.en,
        fontFamily: "'Sora', sans-serif",
        fontWeight: mode === 'both' ? 400 : 500,
        color: mode === 'both' ? '#888' : '#ccc',
        lineHeight: 1.6,
        marginTop: showHi && hindi && mode === 'both' ? 3 : 0,
      }}
    >
      {english}
    </span>
  )

  return (
    <span style={{ display: 'block' }}>
      {hiFirst ? (
        <>{hiEl}{enEl}</>
      ) : (
        <>{enEl}{hiEl}</>
      )}
    </span>
  )
}

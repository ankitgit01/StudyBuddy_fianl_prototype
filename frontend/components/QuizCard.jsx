// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  components/QuizCard.jsx  ·  Mangesh
//
//  Renders one quiz question — handles all 4 types:
//    mcq       — multiple choice (4 options)
//    truefalse — True / False
//    fillin    — fill in the blank (options shown as buttons)
//    match     — coming soon (reserved)
//
//  Props:
//    question   — question object from getQuiz() API
//    lang       — 'both' | 'hi' | 'en'
//    index      — 0-based card index (for animation delay)
//    onAnswer   — callback(questionId, isCorrect)
// ─────────────────────────────────────────────────────────────

import { useState } from 'react'

function confColor(score) {
  if (!score) return '#555'
  if (score < 0.35) return '#43E97B'
  if (score < 0.65) return '#FFB300'
  return '#FF5050'
}

export default function QuizCard({ question, lang = 'both', index = 0, onAnswer }) {
  const [selected,  setSelected]  = useState(null)   // index of chosen option
  const [revealed,  setRevealed]  = useState(false)

  if (!question) return null

  const {
    id,
    type,
    confusion,
    question:    qText,
    hindi_question,
    options,
    hindi_options,
    correct,
    explanation,
    hindi_explanation,
  } = question

  const showHi = lang === 'both' || lang === 'hi'
  const showEn = lang === 'both' || lang === 'en'
  const cc     = confColor(confusion)

  function handleSelect(idx) {
    if (revealed) return
    setSelected(idx)
    setRevealed(true)
    const isCorrect = idx === correct
    onAnswer && onAnswer(id, isCorrect)
  }

  function optionState(idx) {
    if (!revealed) return 'idle'
    if (idx === correct)   return 'correct'
    if (idx === selected)  return 'wrong'
    return 'dim'
  }

  const stateStyle = {
    idle:    { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc' },
    correct: { background: 'rgba(67,233,123,0.12)',  border: '1px solid rgba(67,233,123,0.4)',   color: '#43E97B' },
    wrong:   { background: 'rgba(255,80,80,0.12)',   border: '1px solid rgba(255,80,80,0.4)',    color: '#FF5050' },
    dim:     { background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', color: '#444'   },
  }

  const typeLabel = {
    mcq:       'Multiple Choice',
    truefalse: 'True / False',
    fillin:    'Fill in the Blank',
    match:     'Match the Following',
  }

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${cc}22`,
        borderRadius: 18,
        padding: 20,
        fontFamily: 'Sora, sans-serif',
        animation: `slideUp 0.4s ease ${index * 0.08}s both`,
      }}
    >
      {/* Type + confusion badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
          textTransform: 'uppercase', color: '#444',
        }}>
          {typeLabel[type] || type}
        </span>
        {confusion && (
          <span style={{
            fontSize: 9, fontWeight: 700,
            background: `${cc}18`, border: `1px solid ${cc}40`,
            color: cc, borderRadius: 6, padding: '2px 7px',
            marginLeft: 'auto',
          }}>
            {Math.round(confusion * 100)}% confused
          </span>
        )}
      </div>

      {/* Question text */}
      <div style={{ marginBottom: 16 }}>
        {showHi && hindi_question && (
          <p style={{
            fontSize: 15, fontWeight: 600, color: '#e0e0e8',
            fontFamily: "'Noto Sans Devanagari', 'Sora', sans-serif",
            lineHeight: 1.65, marginBottom: 4,
          }}>
            {hindi_question}
          </p>
        )}
        {showEn && qText && (
          <p style={{
            fontSize: lang === 'both' ? 13 : 15,
            color: lang === 'both' ? '#888' : '#ccc',
            lineHeight: 1.6,
          }}>
            {qText}
          </p>
        )}
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(options || []).map((opt, i) => {
          const state = optionState(i)
          const hiOpt = hindi_options?.[i]
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              style={{
                ...stateStyle[state],
                borderRadius: 12,
                padding: '12px 14px',
                textAlign: 'left',
                cursor: revealed ? 'default' : 'pointer',
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}
            >
              {showHi && hiOpt && lang !== 'en' && (
                <span style={{
                  fontSize: 13,
                  fontFamily: "'Noto Sans Devanagari', 'Sora', sans-serif",
                  fontWeight: 600,
                  color: state === 'idle' ? '#ccc' : 'inherit',
                }}>
                  {hiOpt}
                </span>
              )}
              {showEn && (
                <span style={{
                  fontSize: lang === 'both' ? 12 : 13,
                  color: lang === 'both' && state === 'idle' ? '#777' : 'inherit',
                }}>
                  {opt}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Explanation — shown after answer */}
      {revealed && (
        <div style={{
          marginTop: 14,
          background: 'rgba(255,179,0,0.07)',
          border: '1px solid rgba(255,179,0,0.2)',
          borderRadius: 12, padding: 14,
          animation: 'fadeIn 0.25s ease',
        }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: '#FFB300', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>
            💡 Explanation
          </p>
          {showHi && hindi_explanation && (
            <p style={{
              fontSize: 13,
              fontFamily: "'Noto Sans Devanagari', 'Sora', sans-serif",
              color: '#ddd', lineHeight: 1.65, marginBottom: 4,
            }}>
              {hindi_explanation}
            </p>
          )}
          {showEn && explanation && (
            <p style={{ fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
              {explanation}
            </p>
          )}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:none; }
        }
        @keyframes fadeIn {
          from { opacity:0; } to { opacity:1; }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  components/AudioPlayer.jsx  ·  Mangesh
//
//  Full-featured audio player for Hindi/English explanations.
//  Used inside explanation.jsx Listen tab.
//  Wires to Ankit's audio URL from GET /api/notes/:id/audio
//
//  Props:
//    audioUrl   — URL string from Ankit's Azure Blob
//    title      — display title (e.g. "Newton's Laws")
//    duration   — optional duration string (e.g. "~3 min")
//    sections   — optional [{ id, english, duration }] for jump-to
//    lang       — 'both' | 'hi' | 'en'
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'

const VOICES  = ['Teacher (Default)', 'Slow & Clear', 'Fast Revision']
const SPEEDS  = [0.75, 1, 1.25, 1.5, 2]

export default function AudioPlayer({
  audioUrl,
  title = 'Audio Explanation',
  duration = '~3 min',
  sections = [],
  lang = 'both',
}) {
  const audioRef   = useRef(null)
  const [playing,  setPlaying]  = useState(false)
  const [progress, setProgress] = useState(0)      // 0–100
  const [elapsed,  setElapsed]  = useState(0)      // seconds
  const [total,    setTotal]    = useState(0)       // seconds
  const [speed,    setSpeed]    = useState(1)
  const [voice,    setVoice]    = useState(VOICES[0])
  const [loadedPct, setLoadedPct] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isSeeking, setIsSeeking] = useState(false)

// Wire real audio element when URL provided
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
  
    function onTimeUpdate() {
      if (!isSeeking) {
        setElapsed(audio.currentTime)
        setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0)
      }
    }
  
    function onLoaded() {
      setTotal(audio.duration || 0)
    }
  
    function onEnded() {
      setPlaying(false)
      setProgress(100)
    }
  
    function onProgress() {
      if (!audio.duration || audio.buffered.length === 0) return
    
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1)
      const percent = (bufferedEnd / audio.duration) * 100
    
      setLoadedPct(percent)
    
      if (percent > 95) {
        setLoading(false)
      }
    }
  
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('progress', onProgress)
  
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('progress', onProgress)
    }
  
}, [audioUrl, isSeeking])

  function togglePlay() {
    const audio = audioRef.current
    if (audioUrl && audio) {
      playing ? audio.pause() : audio.play()
    }
    setPlaying((p) => !p)
  }

  function handleSeekMove(e, forceSeek = false) {
    if (!isSeeking && !forceSeek) return

    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)

    setProgress(pct * 100)
  }

  function handleSeekEnd(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)

    const audio = audioRef.current
    if (audio && audio.duration) {
      audio.currentTime = pct * audio.duration
    }

    setIsSeeking(false)
  }

  function changeSpeed(s) {
    setSpeed(s)
    const audio = audioRef.current
    if (audioUrl && audio) audio.playbackRate = s
  }

  function fmt(secs) {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div style={{ fontFamily: 'Sora, sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Hidden real audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {/* Orb + title */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            position: 'relative', width: 88, height: 88,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={togglePlay}
        >
          {/* Pulse rings */}
          {[60, 76, 92].map((d, i) => (
            <div key={d} style={{
              position: 'absolute',
              width: d, height: d,
              borderRadius: '50%',
              border: '1px solid rgba(108,99,255,0.3)',
              animation: playing ? `wave 1.2s ease-in-out ${i * 0.2}s infinite` : 'none',
            }} />
          ))}
          <span style={{ fontSize: 32, position: 'relative', zIndex: 2 }}>
            {loading ? `${Math.round(loadedPct)}%` : (playing ? '⏸' : '▶')}
          </span>
        </div>
        <p style={{ fontSize: 16, fontWeight: 700, color: '#e0e0e8' }}>{title}</p>
        <p style={{ fontSize: 12, color: '#555' }}>
          {lang === 'hi' ? 'हिंदी' : lang === 'en' ? 'English' : 'Hindi + English'} · {duration}
        </p>
      </div>

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        style={{
          width: '100%', padding: 15,
          background: playing
            ? 'linear-gradient(135deg,#FF5050,#FF8C00)'
            : 'linear-gradient(135deg,#6C63FF,#8B5CF6)',
          color: '#fff', border: 'none', borderRadius: 14,
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'Sora, sans-serif',
          boxShadow: playing
            ? '0 6px 20px rgba(255,80,80,0.35)'
            : '0 6px 20px rgba(108,99,255,0.35)',
          transition: 'all 0.2s',
        }}
      >
        {playing ? '⏸  Pause' : '▶  Play Audio Explanation'}
      </button>

      {/* Progress bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          onMouseDown={(e) => {
            setIsSeeking(true)
            handleSeekMove(e, true)   
          }}
          onMouseMove={handleSeekMove}
          onMouseUp={handleSeekEnd}
          onMouseLeave={handleSeekEnd}
          style={{
            height: 5, background: '#111122',
            borderRadius: 3, cursor: 'pointer',
            overflow: 'hidden', position: 'relative',
          }}
        >
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${progress}%`,
            background: 'linear-gradient(90deg,#6C63FF,#8B5CF6)',
            transition: isSeeking ? 'none' : 'width 0.3s linear',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {total ? fmt(elapsed) : '0:00'}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {total ? fmt(total) : duration}
          </span>
        </div>
      </div>

      {/* Speed control */}
      <div>
        <p style={{ fontSize: 11, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Speed
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => changeSpeed(s)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 9,
                background: speed === s ? 'rgba(108,99,255,0.2)' : 'rgba(255,255,255,0.04)',
                border: speed === s ? '1px solid rgba(108,99,255,0.4)' : '1px solid rgba(255,255,255,0.07)',
                color: speed === s ? '#9b95ff' : '#555',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'Sora, sans-serif', transition: 'all 0.15s',
              }}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Voice selector */}
      <div>
        <p style={{ fontSize: 11, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Narrator Voice
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {VOICES.map((v) => (
            <button
              key={v}
              onClick={() => setVoice(v)}
              style={{
                background: voice === v ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.04)',
                border: voice === v ? '1px solid rgba(108,99,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
                color: voice === v ? '#9b95ff' : '#777',
                borderRadius: 20, padding: '7px 14px',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'Sora, sans-serif', transition: 'all 0.15s',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Jump to section */}
      {sections.length > 0 && (
        <div>
          <p style={{ fontSize: 11, color: '#555', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Jump to Section
          </p>
          {sections.map((sec, i) => (
            <div
              key={sec.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer',
              }}
              onClick={() => {
                const audio = audioRef.current
                if (audioUrl && audio && sec.startTime) {
                  audio.currentTime = sec.startTime
                  audio.play()
                  setPlaying(true)
                }
              }}
            >
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12, color: '#444', width: 20,
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: '#aaa' }}>{sec.english}</span>
              <span style={{ fontSize: 12, color: '#444', fontFamily: 'JetBrains Mono, monospace' }}>
                {sec.duration || `~${45 + i * 15}s`}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes wave {
          0%,100% { transform: scale(1);    opacity: 0.5; }
          50%      { transform: scale(1.15); opacity: 1;   }
        }
      `}</style>
    </div>
  )
}

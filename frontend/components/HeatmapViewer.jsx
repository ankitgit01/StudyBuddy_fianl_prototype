// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  components/HeatmapViewer.jsx  ·  Mangesh
//
//  Reusable note image viewer with heatmap overlay toggle.
//  Used by heatmap.jsx
//
//  Props:
//    imageUrl      — original note image URL (from Blob Storage)
//    heatmapUrl    — heatmap overlay image URL (from Mayank's CNN)
//    regions       — array of region objects from getHeatmap()
//    showOverlay   — bool — controlled from parent
//    onToggle      — callback to toggle overlay on/off
//    activeRegion  — id of highlighted region (optional)
//    onRegionClick — callback(region)
// ─────────────────────────────────────────────────────────────

import { useState } from 'react'

const CONF_COLORS = {
  confused: '#FF5050',
  medium:   '#FFB300',
  clean:    '#43E97B',
}

export default function HeatmapViewer({
  imageUrl,
  heatmapUrl,
  regions = [],
  showOverlay = false,
  onToggle,
  activeRegion = null,
  onRegionClick,
}) {
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Toggle row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: 'Sora, sans-serif',
      }}>
        <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>
          {showOverlay ? '🔴 Heatmap Overlay ON' : '📄 Original Note'}
        </span>
        <button
          onClick={onToggle}
          style={{
            background: showOverlay
              ? 'rgba(255,80,80,0.15)'
              : 'rgba(108,99,255,0.15)',
            border: showOverlay
              ? '1px solid rgba(255,80,80,0.35)'
              : '1px solid rgba(108,99,255,0.35)',
            color: showOverlay ? '#FF5050' : '#9b95ff',
            borderRadius: 10, padding: '7px 14px',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Sora, sans-serif',
            transition: 'all 0.2s',
          }}
        >
          {showOverlay ? 'Show Original' : 'Show Heatmap'}
        </button>
      </div>

      {/* Image container */}
      <div
        style={{
          position: 'relative',
          background: '#0e0e1c',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16,
          overflow: 'hidden',
          minHeight: 240,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Placeholder when no real image yet */}
        {!imageUrl && !heatmapUrl ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 10,
            padding: 40, fontFamily: 'Sora, sans-serif',
          }}>
            <span style={{ fontSize: 40 }}>📝</span>
            <p style={{ fontSize: 13, color: '#444' }}>Note image will appear here</p>
          </div>
        ) : (
          <>
            {/* Original image */}
            <img
              src={imageUrl || heatmapUrl}
              alt="Note"
              onLoad={() => setImgLoaded(true)}
              style={{
                width: '100%',
                display: 'block',
                opacity: (!showOverlay || !heatmapUrl) && imgLoaded ? 1 : 0,
                transition: 'opacity 0.3s ease',
                borderRadius: 14,
              }}
            />
            {/* Heatmap overlay image */}
            {heatmapUrl && (
              <img
                src={heatmapUrl}
                alt="Heatmap"
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  opacity: showOverlay ? 1 : 0,
                  transition: 'opacity 0.35s ease',
                  borderRadius: 14,
                  mixBlendMode: 'screen',
                }}
              />
            )}
          </>
        )}

        {/* Region overlays — CSS absolute boxes from API */}
        {showOverlay && regions.map((region) => {
          const isActive = activeRegion === region.id
          const color = CONF_COLORS[region.label] || '#FFB300'
          return (
            <div
              key={region.id}
              onClick={() => onRegionClick && onRegionClick(region)}
              style={{
                position: 'absolute',
                top:    `${region.top}%`,
                left:   `${region.left}%`,
                width:  `${region.width}%`,
                height: `${region.height}%`,
                border: `2px solid ${color}`,
                borderRadius: 6,
                background: isActive ? `${color}25` : `${color}10`,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxSizing: 'border-box',
              }}
            >
              {/* Score badge */}
              <span style={{
                position: 'absolute', top: 4, right: 4,
                background: color,
                color: '#080810',
                fontSize: 9, fontWeight: 800,
                padding: '2px 5px', borderRadius: 4,
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                {Math.round(region.score * 100)}%
              </span>
            </div>
          )
        })}

        {/* Loading shimmer */}
        {!imgLoaded && (imageUrl || heatmapUrl) && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, #0e0e1c 25%, #161626 50%, #0e0e1c 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: 14,
          }} />
        )}
      </div>

      {/* Region legend */}
      {showOverlay && regions.length > 0 && (
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap',
          fontFamily: 'Sora, sans-serif',
        }}>
          {Object.entries(CONF_COLORS).map(([label, color]) => (
            <span key={label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: '#666',
            }}>
              <span style={{
                width: 10, height: 10, borderRadius: 3,
                background: color, display: 'inline-block',
              }} />
              {label.charAt(0).toUpperCase() + label.slice(1)}
            </span>
          ))}
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          from { background-position: 200% 0; }
          to   { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

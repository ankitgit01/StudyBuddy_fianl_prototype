// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  pages/search.jsx  ·  Mangesh
//
//  Cognitive Search Screen
//
//  DATA FLOW:
//  Dinesh sets up Azure Cognitive Search index.
//  Ankit exposes GET /api/search?q=query
//  Returns matching notes, concepts, explanations.
//  Mock: filters user's real localStorage notes by query.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const USE_MOCK = true
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function seed(str) {
  return (str || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

async function searchNotes(query) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 500))
    if (!query.trim()) return []

    let notes = []
    try { notes = JSON.parse(localStorage.getItem('gyaani_notes') || '[]') } catch (_) {}

    const q = query.toLowerCase()
    const matched = notes.filter((n) =>
      (n.subject || '').toLowerCase().includes(q) ||
      (n.topic   || '').toLowerCase().includes(q)
    )

    // Add some synthetic concept hits derived from seed
    const concepts = ['Newton\'s Laws', 'Thermodynamics', 'Integration', 'Cell Division', 'French Revolution', 'Organic Chemistry', 'Probability', 'Genetics']
    const conceptHits = concepts
      .filter((c) => c.toLowerCase().includes(q))
      .map((c) => ({
        type: 'concept',
        id: `concept_${seed(c)}`,
        title: c,
        subject: ['Physics','Chemistry','Mathematics','Biology','History'][seed(c) % 5],
        snippet: `Concept found across ${1 + seed(c) % 4} of your notes. Tap to review.`,
        score: parseFloat((0.6 + (seed(c) % 4) * 0.08).toFixed(2)),
      }))

    const noteHits = matched.map((n) => ({
      type: 'note',
      id: n.id,
      title: n.topic || n.subject || 'Uploaded Note',
      subject: n.subject,
      snippet: `Uploaded ${n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'recently'}.`,
      score: 0.95,
      noteId: n.id,
    }))

    return [...noteHits, ...conceptHits].slice(0, 8)
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''
  const res = await fetch(`${BASE_URL}/api/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}

const SUGGESTIONS = ['Newton', 'Thermodynamics', 'Integration', 'Cell Division', 'Organic', 'Probability']

export default function SearchPage() {
  const router = useRouter()

  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [visible, setVisible] = useState(false)
  const inputRef  = useRef(null)
  const debounce  = useRef(null)

  useEffect(() => {
    setVisible(true)
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  useEffect(() => {
    clearTimeout(debounce.current)
    if (!query.trim()) { setResults([]); setSearched(false); return }
    debounce.current = setTimeout(() => {
      setLoading(true)
      searchNotes(query)
        .then((r) => { setResults(r); setSearched(true); setLoading(false) })
        .catch(() => setLoading(false))
    }, 400)
  }, [query])

  function handleResultClick(result) {
    if (result.type === 'note') {
      router.push(`/explanation?noteId=${result.noteId || result.id}`)
    } else {
      router.push(`/constellation`)
    }
  }

  return (
    <>
      <Head>
        <title>Search — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={`page ${visible ? 'page--in' : ''}`}>

        {/* ── HEADER ── */}
        <header className="hdr">
          <button className="back" onClick={() => router.back()}>←</button>
          <div className="search-bar">
            <span style={{ fontSize: 15 }}>🔍</span>
            <input
              ref={inputRef}
              className="search-input"
              placeholder="Search notes, topics, concepts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' }}
              >×</button>
            )}
          </div>
        </header>

        <div className="body">

          {/* ── SUGGESTIONS (empty state) ── */}
          {!query && (
            <>
              <p className="sec-label">Try Searching For</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="suggestion-chip"
                    onClick={() => setQuery(s)}
                  >
                    🔍 {s}
                  </button>
                ))}
              </div>

              <p className="sec-label" style={{ marginTop: 8 }}>Quick Links</p>
              <div className="quick-links">
                {[
                  { icon: '📝', label: 'All Notes',    path: '/notes'         },
                  { icon: '🌌', label: 'Constellation', path: '/constellation' },
                  { icon: '🧬', label: 'Study DNA',     path: '/dna'           },
                  { icon: '🫂', label: 'Learning Pods', path: '/pods'          },
                ].map((l) => (
                  <button
                    key={l.path}
                    className="quick-link"
                    onClick={() => router.push(l.path)}
                  >
                    <span style={{ fontSize: 20 }}>{l.icon}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── LOADING ── */}
          {loading && (
            <div style={{
              display: 'flex', justifyContent: 'center', padding: 40,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                border: '3px solid #111128', borderTopColor: '#6C63FF',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          )}

          {/* ── RESULTS ── */}
          {!loading && searched && results.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 12, padding: '40px 20px',
              textAlign: 'center', fontFamily: 'Sora, sans-serif',
            }}>
              <span style={{ fontSize: 40 }}>🔍</span>
              <p style={{ fontSize: 14, color: '#555', fontWeight: 700 }}>
                No results for "{query}"
              </p>
              <p style={{ fontSize: 12, color: '#444' }}>
                Upload a note on this topic to add it to your knowledge base.
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <>
              <p className="sec-label">{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</p>
              <div className="results-list">
                {results.map((result, i) => (
                  <div
                    key={result.id}
                    className="result-card"
                    style={{ animationDelay: `${i * 0.05}s` }}
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="result-icon">
                      {result.type === 'note' ? '📝' : '💡'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#6C63FF', fontWeight: 800 }}>
                          {result.subject || 'Concept'}
                        </span>
                        <span style={{
                          fontSize: 9, color: result.type === 'note' ? '#43E97B' : '#FFB300',
                          background: result.type === 'note' ? 'rgba(67,233,123,0.1)' : 'rgba(255,179,0,0.1)',
                          border: `1px solid ${result.type === 'note' ? 'rgba(67,233,123,0.25)' : 'rgba(255,179,0,0.25)'}`,
                          padding: '2px 6px', borderRadius: 5, fontWeight: 700, textTransform: 'uppercase',
                        }}>
                          {result.type === 'note' ? 'NOTE' : 'CONCEPT'}
                        </span>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#e0e0e8', marginBottom: 3 }}>
                        {result.title}
                      </p>
                      <p style={{ fontSize: 12, color: '#555' }}>{result.snippet}</p>
                    </div>
                    <span style={{ color: '#333', fontSize: 20, flexShrink: 0 }}>›</span>
                  </div>
                ))}
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
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px;
          background: rgba(8,8,16,0.96); backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          position: sticky; top: 0; z-index: 50;
        }
        .back {
          width: 34px; height: 34px; border-radius: 9px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
          color: #666; font-size: 16px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .search-bar {
          flex: 1; display: flex; align-items: center; gap: 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 12px; padding: 10px 14px;
        }
        .search-input {
          flex: 1; background: none; border: none;
          color: #e0e0e8; font-family: 'Sora', sans-serif;
          font-size: 14px; outline: none;
        }
        .search-input::placeholder { color: #444; }

        .body {
          max-width: 520px; margin: 0 auto;
          padding: 18px 18px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .sec-label {
          font-size: 10px; font-weight: 800;
          letter-spacing: 2.5px; text-transform: uppercase; color: #333350;
        }

        .suggestions { display: flex; flex-wrap: wrap; gap: 8px; }
        .suggestion-chip {
          padding: 7px 14px; border-radius: 20px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: #777; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: 'Sora', sans-serif;
          transition: all 0.15s;
        }
        .suggestion-chip:hover {
          border-color: rgba(108,99,255,0.4); color: #9b95ff;
        }

        .quick-links { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .quick-link {
          display: flex; align-items: center; gap: 10px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px; padding: 14px;
          cursor: pointer; font-family: 'Sora', sans-serif;
          font-size: 13px; font-weight: 600; color: #888;
          transition: all 0.15s;
        }
        .quick-link:hover { border-color: rgba(108,99,255,0.3); color: #ccc; }

        .results-list { display: flex; flex-direction: column; gap: 10px; }
        .result-card {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 14px;
          cursor: pointer;
          animation: slideUp 0.3s ease both;
          transition: border-color 0.2s, background 0.2s;
        }
        .result-card:hover {
          border-color: rgba(108,99,255,0.3);
          background: rgba(108,99,255,0.04);
        }
        @keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        .result-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}

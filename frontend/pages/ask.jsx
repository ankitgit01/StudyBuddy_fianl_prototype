// frontend/pages/ask.jsx
// Full AI Chat — text, voice input, file/document attachment

import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEFAULT_TOKEN = "prototype_default_token";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") || DEFAULT_TOKEN : DEFAULT_TOKEN;
}

async function sendMessageToAPI(messages, attachedFile) {
  if (attachedFile) {
    const form = new FormData();
    form.append("file", attachedFile);
    form.append("messages", JSON.stringify(messages));
    const res = await fetch(`${BASE_URL}/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    if (!res.ok) throw new Error("API error");
    return res.json();
  }
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error("API error");
  return res.json();
}

// ── Math node renderers — render KaTeX server-safe via span with data attrs ──
// After mount, useEffect walks the DOM and calls window.katex.render()
function InlineMath({ value }) {
  return <span className="math-inline" data-math={value} data-display="false" />;
}
function BlockMath({ value }) {
  return <span className="math-block" data-math={value} data-display="true" />;
}

// ── MarkdownBubble ────────────────────────────────────────────────────────────
function MarkdownBubble({ content }) {
  const ref = useRef(null);

  // After every render, find all math placeholders and render with KaTeX
  useEffect(() => {
    if (!ref.current) return;
    const render = () => {
      if (!window.katex) return;
      ref.current.querySelectorAll("[data-math]").forEach((el) => {
        if (el.dataset.rendered) return;
        try {
          window.katex.render(el.dataset.math, el, {
            displayMode: el.dataset.display === "true",
            throwOnError: false,
            output: "html",
          });
          el.dataset.rendered = "1";
        } catch (_) {}
      });
    };
    // KaTeX loads async via CDN — retry until available
    if (window.katex) render();
    else {
      const t = setInterval(() => { if (window.katex) { render(); clearInterval(t); } }, 100);
      return () => clearInterval(t);
    }
  }, [content]);

  return (
    <div ref={ref} className="bubble-md">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        components={{
          // Math nodes from remark-math
          math:       ({ value }) => <BlockMath  value={value} />,
          inlineMath: ({ value }) => <InlineMath value={value} />,
          // Styled markdown elements
          h2:         ({ node, ...p }) => <h2         className="md-h2"         {...p} />,
          h3:         ({ node, ...p }) => <h3         className="md-h3"         {...p} />,
          p:          ({ node, ...p }) => <p          className="md-p"          {...p} />,
          ul:         ({ node, ...p }) => <ul         className="md-ul"         {...p} />,
          ol:         ({ node, ...p }) => <ol         className="md-ol"         {...p} />,
          li:         ({ node, ...p }) => <li         className="md-li"         {...p} />,
          strong:     ({ node, ...p }) => <strong     className="md-strong"     {...p} />,
          em:         ({ node, ...p }) => <em         className="md-em"         {...p} />,
          blockquote: ({ node, ...p }) => <blockquote className="md-blockquote" {...p} />,
          code({ node, inline, children, ...p }) {
            return inline
              ? <code className="md-code-inline" {...p}>{children}</code>
              : <pre className="md-pre"><code className="md-code" {...p}>{children}</code></pre>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`bubble-row ${isUser ? "bubble-row--user" : "bubble-row--ai"}`}>
      {isUser
        ? <div className="user-avatar">Me</div>
        : <div className="ai-avatar">🤖</div>
      }
      <div className={`bubble ${isUser ? "bubble--user" : "bubble--ai"}`}>
        {msg.file && (
          <div className="bubble-file">
            <span>{msg.file.type === "pdf" ? "📄" : "🖼️"}</span>
            <span className="bubble-file-name">{msg.file.name}</span>
          </div>
        )}
        {isUser
          ? <p className="bubble-text">{msg.content}</p>
          : <MarkdownBubble content={msg.content} />
        }
        <span className="bubble-time">{msg.time}</span>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="bubble-row bubble-row--ai">
      <div className="ai-avatar">🤖</div>
      <div className="bubble bubble--ai bubble--typing">
        <span className="dot" /><span className="dot" /><span className="dot" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AskPage() {
  const router      = useRouter();
  const fileRef     = useRef(null);
  const bottomRef   = useRef(null);
  const inputRef    = useRef(null);
  const recRef      = useRef(null);

  const [messages,    setMessages]  = useState([]);
  const [input,       setInput]     = useState("");
  const [loading,     setLoading]   = useState(false);
  const [attached,    setAttached]  = useState(null);
  const [isListening, setListening] = useState(false);
  const [visible,     setVisible]   = useState(false);

  useEffect(() => {
    setVisible(true);
    if (router.query.q)      { setInput(router.query.q); setTimeout(() => inputRef.current?.focus(), 300); }
    if (router.query.attach)   setTimeout(() => fileRef.current?.click(), 400);
    if (router.query.voice)    setTimeout(() => startVoice(), 400);
  }, [router.isReady]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // ── File attach ──────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImg = file.type.startsWith("image/");
    if (!isPdf && !isImg) { alert("Please attach an image or PDF."); return; }
    const preview = isImg ? URL.createObjectURL(file) : null;
    setAttached({ file, name: file.name, type: isPdf ? "pdf" : "image", preview });
    if (fileRef.current) fileRef.current.value = "";
  }
  function removeAttachment() {
    if (attached?.preview) URL.revokeObjectURL(attached.preview);
    setAttached(null);
  }

  // ── Voice ────────────────────────────────────────────────────
  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported in this browser."); return; }
    const rec = new SR();
    rec.lang = "en-IN"; rec.interimResults = true;
    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = () => setListening(false);
    rec.onresult = (e) => setInput(Array.from(e.results).map((r) => r[0].transcript).join(""));
    rec.start(); recRef.current = rec;
  }
  function stopVoice() { recRef.current?.stop(); setListening(false); }

  // ── Send ─────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text && !attached) return;
    const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const userMsg = {
      role: "user",
      content: text || `[Attached: ${attached.name}]`,
      time,
      file: attached ? { name: attached.name, type: attached.type, preview: attached.preview } : null,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    const fileToSend = attached?.file || null;
    removeAttachment();
    setLoading(true);
    try {
      const apiMsgs = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const data = await sendMessageToAPI(apiMsgs, fileToSend);
      const aiTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      setMessages((prev) => [...prev, { role: "assistant", content: data.response, time: aiTime }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "Sorry, I couldn't connect to the server right now. Please try again.",
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
      }]);
    } finally { setLoading(false); }
  }

  return (
    <>
      <Head>
        <title>Ask Me Anything — GYAANI AI</title>
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
        {/* KaTeX via CDN — no npm package needed for rendering */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossOrigin="anonymous" />
        <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" crossOrigin="anonymous" />
      </Head>

      <div className={`page ${visible ? "page--in" : ""}`}>

        {/* HEADER */}
        <header className="hdr">
          <button className="back-btn" onClick={() => router.back()}>←</button>
          <div className="hdr-center">
            <div className="ai-dot" />
            <div>
              <span className="hdr-title">GYAANI AI Tutor</span>
              <span className="hdr-sub">Text · Voice · Files</span>
            </div>
          </div>
          <button className="hdr-clear" onClick={() => setMessages([])} title="Clear chat">🗑</button>
        </header>

        {/* MESSAGES */}
        <div className="msgs">
          {messages.length === 0 && (
            <div className="empty">
              <div className="empty-orb">🤖</div>
              <p className="empty-title">Hi! I'm your GYAANI AI Tutor</p>
              <p className="empty-sub">Ask anything about your studies — type, speak, or attach a PDF or image.</p>
              <div className="empty-chips">
                {["Explain Newton's 3rd law","What is photosynthesis?","Summarise French Revolution","Integrate x² dx","What is DNA replication?","Explain Ohm's law"].map((q) => (
                  <button key={q} className="empty-chip" onClick={() => { setInput(q); inputRef.current?.focus(); }}>{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
          {loading && <TypingDots />}
          <div ref={bottomRef} />
        </div>

        {/* ATTACHMENT PREVIEW */}
        {attached && (
          <div className="att-bar">
            {attached.type === "image"
              ? <img src={attached.preview} alt="" className="att-img" />
              : <div className="att-pdf"><span>📄</span><span className="att-name">{attached.name}</span></div>
            }
            <button className="att-remove" onClick={removeAttachment}>✕</button>
          </div>
        )}

        {/* INPUT */}
        <div className="input-area">
          <div className={`input-bar ${isListening ? "listening" : ""}`}>
            <button className="icon-btn attach-btn" title="Attach file or image" onClick={() => fileRef.current.click()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              {attached && <span className="attach-dot" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*,.pdf,application/pdf" style={{ display:"none" }} onChange={handleFileChange} />

            <input
              ref={inputRef}
              className="text-input"
              placeholder={isListening ? "🎙 Listening…" : "Ask anything about your studies…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              disabled={isListening}
            />

            <button
              className={`icon-btn voice-btn ${isListening ? "voice-active" : ""}`}
              title={isListening ? "Stop" : "Voice input"}
              onClick={isListening ? stopVoice : startVoice}
            >
              {isListening
                ? <span className="voice-pulse" />
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
              }
            </button>

            <button className="send-btn" onClick={sendMessage} disabled={loading || (!input.trim() && !attached)}>
              {loading ? <span className="spinner" /> : "↑"}
            </button>
          </div>
          <p className="hint">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>

      <style jsx global>{`
        /* KaTeX math spans */
        .math-block  { display: block; text-align: center; margin: 10px 0; overflow-x: auto; }
        .math-inline { display: inline; }
        .bubble-md .katex { color: #e0d9ff; font-size: 1.05em; }
      `}</style>

      <style jsx>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        .page{height:100vh;background:#080810;color:#e8e8f0;font-family:'Sora',sans-serif;display:flex;flex-direction:column;opacity:0;transition:opacity 0.3s ease;}
        .page--in{opacity:1}

        /* HEADER */
        .hdr{display:flex;align-items:center;gap:10px;padding:13px 16px;flex-shrink:0;background:rgba(8,8,16,0.97);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,0.06);}
        .back-btn{width:34px;height:34px;border-radius:9px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);color:#666;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:color 0.2s;}
        .back-btn:hover{color:#ccc}
        .hdr-center{flex:1;display:flex;align-items:center;gap:10px}
        .ai-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;background:#43E97B;box-shadow:0 0 8px rgba(67,233,123,0.6);animation:pulse-dot 2s ease-in-out infinite;}
        @keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:0.4}}
        .hdr-title{font-size:15px;font-weight:800;color:#fff;display:block}
        .hdr-sub{font-size:11px;color:#555;display:block;margin-top:1px}
        .hdr-clear{background:none;border:none;font-size:16px;cursor:pointer;color:#444;padding:6px;border-radius:8px;transition:color 0.2s}
        .hdr-clear:hover{color:#ff6b6b}

        /* MESSAGES */
        .msgs{flex:1;overflow-y:auto;padding:20px 16px 12px;display:flex;flex-direction:column;gap:16px;scroll-behavior:smooth;}
        .msgs::-webkit-scrollbar{width:4px}
        .msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}

        /* EMPTY */
        .empty{display:flex;flex-direction:column;align-items:center;gap:14px;padding:30px 20px;text-align:center;max-width:480px;margin:0 auto}
        .empty-orb{font-size:52px;animation:float 3s ease-in-out infinite}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        .empty-title{font-size:18px;font-weight:800;color:#e0e0f0}
        .empty-sub{font-size:13px;color:#555;line-height:1.6}
        .empty-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
        .empty-chip{padding:8px 16px;border-radius:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#777;font-size:12px;font-weight:600;cursor:pointer;font-family:'Sora',sans-serif;transition:all 0.15s;}
        .empty-chip:hover{border-color:rgba(108,99,255,0.4);color:#9b95ff;background:rgba(108,99,255,0.08)}

        /* BUBBLES */
        .bubble-row{display:flex;align-items:flex-end;gap:10px;width:100%;}
        .bubble-row--user{flex-direction:row-reverse;justify-content:flex-start;}
        .bubble-row--ai{flex-direction:row;justify-content:flex-start;}
        .ai-avatar{width:32px;height:32px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,rgba(108,99,255,0.25),rgba(67,233,123,0.15));border:1.5px solid rgba(108,99,255,0.3);display:flex;align-items:center;justify-content:center;font-size:15px;margin-bottom:2px;}
        .user-avatar{width:32px;height:32px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#6C63FF,#8B5CF6);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;margin-bottom:2px;}
        .bubble{max-width:72%;padding:12px 16px;border-radius:18px;display:flex;flex-direction:column;gap:6px;animation:bubbleIn 0.25s ease;word-break:break-word;}
        @keyframes bubbleIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .bubble--user{background:linear-gradient(135deg,#6C63FF,#8B5CF6);border-radius:18px 4px 18px 18px;box-shadow:0 4px 16px rgba(108,99,255,0.25);}
        .bubble--ai{background:rgba(20,20,35,0.9);border:1.5px solid rgba(108,99,255,0.2);border-radius:4px 18px 18px 18px;box-shadow:0 4px 16px rgba(0,0,0,0.3);}
        .bubble-file{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.12);border-radius:8px;padding:6px 10px;}
        .bubble-file-name{font-size:11px;color:rgba(255,255,255,0.85);font-family:'JetBrains Mono',monospace}
        .bubble-text{font-size:14px;line-height:1.65;white-space:pre-wrap;color:#fff;}

        /* MARKDOWN BUBBLE */
        .bubble-md{font-size:14px;line-height:1.75;color:#d8d8ee;}

        .bubble-time{font-size:10px;align-self:flex-end;font-family:'JetBrains Mono',monospace;margin-top:2px;}
        .bubble--user .bubble-time{color:rgba(255,255,255,0.4);}
        .bubble--ai   .bubble-time{color:#444;}

        /* TYPING */
        .bubble--typing{display:flex !important;flex-direction:row !important;gap:5px !important;padding:14px 18px;align-items:center}
        .dot{width:7px;height:7px;border-radius:50%;background:#555;animation:typing 1.2s ease-in-out infinite}
        .dot:nth-child(2){animation-delay:0.2s}
        .dot:nth-child(3){animation-delay:0.4s}
        @keyframes typing{0%,80%,100%{transform:scale(0.8);opacity:0.4}40%{transform:scale(1.1);opacity:1}}

        /* ATTACHMENT BAR */
        .att-bar{display:flex;align-items:center;gap:10px;margin:0 16px 8px;padding:10px 14px;flex-shrink:0;background:rgba(108,99,255,0.08);border:1px solid rgba(108,99,255,0.2);border-radius:12px;}
        .att-img{width:48px;height:48px;object-fit:cover;border-radius:8px}
        .att-pdf{display:flex;align-items:center;gap:8px}
        .att-name{font-size:12px;color:#9b95ff;font-family:'JetBrains Mono',monospace}
        .att-remove{margin-left:auto;background:none;border:none;color:#555;font-size:16px;cursor:pointer;transition:color 0.2s}
        .att-remove:hover{color:#ff6b6b}

        /* INPUT */
        .input-area{flex-shrink:0;padding:8px 16px 20px;background:rgba(8,8,16,0.97);border-top:1px solid rgba(255,255,255,0.06)}
        .input-bar{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,0.09);border-radius:16px;padding:8px 10px;transition:border-color 0.2s,box-shadow 0.2s;}
        .input-bar:focus-within{border-color:rgba(108,99,255,0.5);box-shadow:0 0 0 3px rgba(108,99,255,0.1)}
        .listening{border-color:rgba(67,233,123,0.5) !important;box-shadow:0 0 0 3px rgba(67,233,123,0.1) !important}
        .text-input{flex:1;background:none;border:none;outline:none;color:#e0e0f0;font-family:'Sora',sans-serif;font-size:14px;min-width:0}
        .text-input::placeholder{color:#3a3a52}
        .text-input:disabled{opacity:0.6}
        .icon-btn{width:34px;height:34px;border-radius:9px;flex-shrink:0;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);color:#555;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;position:relative;}
        .icon-btn:hover{background:rgba(255,255,255,0.1);color:#aaa}
        .attach-btn:hover{background:rgba(108,99,255,0.1);border-color:rgba(108,99,255,0.3);color:#9b95ff}
        .attach-dot{position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:#6C63FF;border:1.5px solid #080810;}
        .voice-btn:hover{background:rgba(67,233,123,0.1);border-color:rgba(67,233,123,0.3);color:#43E97B}
        .voice-active{background:rgba(67,233,123,0.15) !important;border-color:#43E97B !important;color:#43E97B !important}
        .voice-pulse{width:12px;height:12px;border-radius:50%;background:#43E97B;animation:vring 0.8s ease-in-out infinite alternate}
        @keyframes vring{from{transform:scale(0.8);opacity:0.6}to{transform:scale(1.3);opacity:1}}
        .send-btn{width:36px;height:36px;border-radius:10px;flex-shrink:0;background:linear-gradient(135deg,#6C63FF,#8B5CF6);border:none;color:#fff;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.15s,opacity 0.2s;box-shadow:0 4px 12px rgba(108,99,255,0.35);}
        .send-btn:disabled{opacity:0.35;cursor:not-allowed;transform:none}
        .send-btn:hover:not(:disabled){transform:scale(1.08)}
        .spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;animation:spin 0.7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .hint{font-size:10px;color:#2a2a40;text-align:center;margin-top:6px;font-family:'JetBrains Mono',monospace}
      `}</style>

      {/* Markdown element styles injected globally so ReactMarkdown children get them */}
      <style jsx global>{`
        .bubble-md h2{font-size:15px;font-weight:700;color:#b8b0ff;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid rgba(108,99,255,0.25);}
        .bubble-md h3{font-size:13.5px;font-weight:700;color:#9b95ff;margin:10px 0 4px;}
        .bubble-md p{margin:4px 0;color:#d8d8ee;}
        .bubble-md ul,.bubble-md ol{padding-left:20px;margin:6px 0;display:flex;flex-direction:column;gap:4px;}
        .bubble-md li{color:#ccc8f0;}
        .bubble-md strong{color:#fff;font-weight:700;}
        .bubble-md em{color:#c4b5fd;font-style:italic;}
        .bubble-md blockquote{border-left:3px solid #6C63FF;padding:6px 12px;margin:8px 0;background:rgba(108,99,255,0.08);border-radius:0 8px 8px 0;color:#b0abf0;font-style:italic;}
        .bubble-md code{background:rgba(108,99,255,0.15);color:#c4b5fd;padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:12px;}
        .bubble-md pre{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;margin:8px 0;overflow-x:auto;}
        .bubble-md pre code{background:none;padding:0;color:#a5f3fc;font-size:12px;}
        .bubble-md .katex{color:#e0d9ff;font-size:1.05em;}
        .bubble-md .math-block{display:block;text-align:center;margin:10px 0;overflow-x:auto;}
        .bubble-md .math-inline{display:inline;}
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  GYAANI AI  ·  pages/login.jsx  ·  Mangesh
//
//  Login + Onboarding Screen
//
//  DATA FLOW (when Ankit's auth is ready):
//    POST /api/auth/login   → { token, user }
//    POST /api/auth/signup  → { token, user }
//  Token saved to localStorage → all other pages read it via authHeaders()
//
//  MOCK: saves a mock token + user to localStorage so all other
//  pages work immediately without a real backend.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const USE_MOCK = false; // ← flip to false when Ankit's auth is ready
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SUBJECTS = [
  "Physics",
  "Chemistry",
  "Mathematics",
  "Biology",
  "History",
  "Geography",
  "Computer Science",
  "Economics",
  "English",
];

const LANGUAGES = [
  { id: "hi-en", label: "हिंदी + English", emoji: "🇮🇳" },
  { id: "en", label: "English only", emoji: "🇬🇧" },
  { id: "hi", label: "हिंदी only", emoji: "🇮🇳" },
];

export default function LoginPage() {
  const router = useRouter();

  const [step, setStep] = useState("auth"); // 'auth' | 'onboard'
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [language, setLanguage] = useState("hi-en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    router.replace("/");
  }, []);

  function toggleSubject(s) {
    setSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  async function handleAuth() {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }

    setLoading(true);

    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 900));
      localStorage.setItem("token", "mock_token_gyaani_123");
      localStorage.setItem(
        "gyaani_user",
        JSON.stringify({
          name: name || email.split("@")[0],
          email,
          language: "hi-en",
          subjects: [],
        }),
      );
      setLoading(false);
      if (mode === "signup") {
        setStep("onboard");
      } else {
        router.replace("/");
      }
      return;
    }

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/signup";
      const body =
        mode === "login" ? { email, password } : { name, email, password };

      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Authentication failed");

      localStorage.setItem("token", data.token);
      localStorage.setItem("gyaani_user", JSON.stringify(data.user));
      localStorage.setItem("user_id", data.user.user_id);

      setLoading(false);
      if (mode === "signup") {
        setStep("onboard");
      } else {
        router.replace("/");
      }
    } catch (err) {
      setLoading(false);
      setError(err.message);
    }
  }

  async function handleOnboard() {
    setLoading(true);

    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 600));
      const user = JSON.parse(localStorage.getItem("gyaani_user") || "{}");
      localStorage.setItem(
        "gyaani_user",
        JSON.stringify({ ...user, subjects, language }),
      );
      setLoading(false);
      router.replace("/");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await fetch(`${BASE_URL}/auth/preferences`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subjects, language }),
      });
      setLoading(false);
      router.replace("/");
    } catch (err) {
      setLoading(false);
      setError(err.message);
    }
  }

  return (
    <>
      <Head>
        <title>Welcome — GYAANI AI</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={`page ${visible ? "page--in" : ""}`}>
        {/* Background glow */}
        <div className="bg-glow" />

        <div className="container">
          {/* Logo */}
          <div className="logo">
            <span className="logo-g">G</span>YAANI
            <span className="logo-ai"> AI</span>
          </div>

          {/* ── STEP 1: AUTH ── */}
          {step === "auth" && (
            <div className="card">
              <h1 className="card-title">
                {mode === "login" ? "Welcome back 👋" : "Create account ✨"}
              </h1>
              <p className="card-sub">
                {mode === "login"
                  ? "Sign in to continue learning"
                  : "Start your GYAANI journey"}
              </p>

              {/* Mode toggle */}
              <div className="mode-toggle">
                <button
                  className={`mode-btn ${mode === "login" ? "mode-btn--on" : ""}`}
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                >
                  Sign In
                </button>
                <button
                  className={`mode-btn ${mode === "signup" ? "mode-btn--on" : ""}`}
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                >
                  Sign Up
                </button>
              </div>

              {/* Fields */}
              <div className="fields">
                {mode === "signup" && (
                  <input
                    className="field"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
                <input
                  className="field"
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className="field"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                />
              </div>

              {error && <p className="error">{error}</p>}

              <button
                className="submit-btn"
                onClick={handleAuth}
                disabled={loading}
              >
                {loading
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign In →"
                    : "Create Account →"}
              </button>

              <p className="switch-hint">
                {mode === "login"
                  ? "Don't have an account? "
                  : "Already have an account? "}
                <span
                  className="switch-link"
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setError(null);
                  }}
                >
                  {mode === "login" ? "Sign Up" : "Sign In"}
                </span>
              </p>
            </div>
          )}

          {/* ── STEP 2: ONBOARDING ── */}
          {step === "onboard" && (
            <div className="card">
              <h1 className="card-title">Let's set you up 🎓</h1>
              <p className="card-sub">
                Pick your subjects and preferred language
              </p>

              <p className="section-label">Your Subjects</p>
              <div className="chips">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    className={`chip ${subjects.includes(s) ? "chip--on" : ""}`}
                    onClick={() => toggleSubject(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <p className="section-label" style={{ marginTop: 20 }}>
                Preferred Language
              </p>
              <div className="lang-opts">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.id}
                    className={`lang-opt ${language === l.id ? "lang-opt--on" : ""}`}
                    onClick={() => setLanguage(l.id)}
                  >
                    <span style={{ fontSize: 20 }}>{l.emoji}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>

              {error && <p className="error">{error}</p>}

              <button
                className="submit-btn"
                onClick={handleOnboard}
                disabled={loading}
                style={{ marginTop: 20 }}
              >
                {loading ? "Saving…" : "Start Learning →"}
              </button>

              <button className="skip-btn" onClick={() => router.replace("/")}>
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .page {
          min-height: 100vh;
          background: #080810;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: "Sora", sans-serif;
          opacity: 0;
          transform: translateY(14px);
          transition:
            opacity 0.4s ease,
            transform 0.4s ease;
          padding: 24px 18px;
          position: relative;
          overflow: hidden;
        }
        .page--in {
          opacity: 1;
          transform: none;
        }

        .bg-glow {
          position: absolute;
          top: -200px;
          left: 50%;
          transform: translateX(-50%);
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(
            ellipse,
            rgba(108, 99, 255, 0.12) 0%,
            transparent 70%
          );
          pointer-events: none;
        }

        .container {
          width: 100%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
          position: relative;
          z-index: 1;
        }

        .logo {
          font-size: 28px;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.5px;
        }
        .logo-g {
          color: #6c63ff;
        }
        .logo-ai {
          color: #43e97b;
          font-size: 18px;
        }

        .card {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 28px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes popIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(16px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }

        .card-title {
          font-size: 22px;
          font-weight: 800;
          color: #fff;
          text-align: center;
        }
        .card-sub {
          font-size: 13px;
          color: #555;
          text-align: center;
          margin-top: -8px;
        }

        .mode-toggle {
          display: flex;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 3px;
          gap: 3px;
        }
        .mode-btn {
          flex: 1;
          background: none;
          border: none;
          color: #555;
          font-family: "Sora", sans-serif;
          font-size: 13px;
          font-weight: 700;
          padding: 9px;
          border-radius: 9px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .mode-btn--on {
          background: rgba(108, 99, 255, 0.22);
          color: #9b95ff;
        }

        .fields {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .field {
          width: 100%;
          padding: 13px 16px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 12px;
          color: #e0e0e8;
          font-family: "Sora", sans-serif;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s;
        }
        .field:focus {
          border-color: rgba(108, 99, 255, 0.5);
        }
        .field::placeholder {
          color: #444;
        }

        .error {
          font-size: 12px;
          color: #ff5050;
          background: rgba(255, 80, 80, 0.08);
          border: 1px solid rgba(255, 80, 80, 0.2);
          border-radius: 10px;
          padding: 10px 14px;
          text-align: center;
        }

        .submit-btn {
          width: 100%;
          padding: 15px;
          background: linear-gradient(135deg, #6c63ff, #8b5cf6);
          color: #fff;
          border: none;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          box-shadow: 0 6px 20px rgba(108, 99, 255, 0.35);
          transition:
            opacity 0.15s,
            transform 0.15s;
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          opacity: 0.92;
        }
        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .switch-hint {
          font-size: 13px;
          color: #555;
          text-align: center;
        }
        .switch-link {
          color: #6c63ff;
          font-weight: 700;
          cursor: pointer;
        }
        .switch-link:hover {
          text-decoration: underline;
        }

        /* onboarding */
        .section-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #333350;
        }

        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .chip {
          padding: 7px 14px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: #777;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.15s;
        }
        .chip--on {
          background: rgba(108, 99, 255, 0.18);
          border-color: rgba(108, 99, 255, 0.4);
          color: #9b95ff;
        }

        .lang-opts {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .lang-opt {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 16px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #888;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: all 0.15s;
          text-align: left;
        }
        .lang-opt--on {
          background: rgba(67, 233, 123, 0.1);
          border-color: rgba(67, 233, 123, 0.3);
          color: #43e97b;
        }

        .skip-btn {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          background: none;
          border: none;
          color: #444;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: "Sora", sans-serif;
          transition: color 0.15s;
        }
        .skip-btn:hover {
          color: #777;
        }
      `}</style>
    </>
  );
}

// frontend/pages/_app.js

import "../styles/globals.css";
import { Toaster } from "react-hot-toast";
import { useEffect } from "react";
import { useRouter } from "next/router";

const DEFAULT_USER_ID = "2b871b4a-fb6b-49be-82ca-d7aa244fdc65";
const DEFAULT_TOKEN = "prototype_default_token";
const DEFAULT_USER = {
  user_id: DEFAULT_USER_ID,
  name: "Ankit",
  email: "ankit_k2@mfs.iitr.ac.in",
  language: "hi-en",
  subjects: [],
};
let sessionBootstrapped = false;

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      localStorage.setItem("token", DEFAULT_TOKEN);
    }
    if (!localStorage.getItem("user_id")) {
      localStorage.setItem("user_id", DEFAULT_USER_ID);
    }
    try {
      const existing = JSON.parse(localStorage.getItem("gyaani_user") || "{}");
      localStorage.setItem(
        "gyaani_user",
        JSON.stringify({ ...DEFAULT_USER, ...existing, user_id: DEFAULT_USER_ID }),
      );
    } catch {
      localStorage.setItem("gyaani_user", JSON.stringify(DEFAULT_USER));
    }
  }, []);

  useEffect(() => {
    if (sessionBootstrapped) return;
    sessionBootstrapped = true;
    const token = localStorage.getItem("token") || DEFAULT_TOKEN;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    async function bootstrapUserSession() {
      try {
        const res = await fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        localStorage.setItem("gyaani_user_profile", JSON.stringify(data));
        localStorage.setItem(
          "gyaani_user",
          JSON.stringify({
            ...DEFAULT_USER,
            ...data,
            user_id: data.user_id || DEFAULT_USER_ID,
          }),
        );
        localStorage.setItem(
          "login_streak",
          String(
            data.days_since_last_break ??
              data.predict_params?.days_since_last_break ??
              0,
          ),
        );
        localStorage.setItem(
          "sessions_count",
          String(
            data.sessions_count ??
              data.predict_params?.sessions_count ??
              0,
          ),
        );
        window.dispatchEvent(
          new CustomEvent("gyaani:user-profile-updated", { detail: data }),
        );
      } catch (_) {}
    }

    bootstrapUserSession();
  }, []);

  useEffect(() => {
    function trackNoteOpen() {
      if (
        router.pathname === "/explanation" ||
        router.pathname === "/heatmap"
      ) {
        const viewed = parseInt(localStorage.getItem("notes_viewed") || "0");
        localStorage.setItem("notes_viewed", String(viewed + 1));
      }
    }

    trackNoteOpen();
  }, [router.pathname]);

  return (
    <>
      <Component {...pageProps} />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#1a1a2e",
            color: "#e2e2ee",
            border: "1px solid #2a2a40",
            borderRadius: "10px",
            fontSize: "14px",
            fontFamily: "Sora, sans-serif",
          },
        }}
      />
    </>
  );
}

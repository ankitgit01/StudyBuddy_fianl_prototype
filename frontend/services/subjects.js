// frontend/services/subjects.js
// Single source of truth for subjects — shared by notes.jsx and upload.jsx
// Custom subjects are persisted in localStorage so they survive page reloads.

export const DEFAULT_SUBJECTS = [
  { name: "Physics",     icon: "⚛️",  cls: "c-phys" },
  { name: "Chemistry",   icon: "🧪",  cls: "c-chem" },
  { name: "Mathematics", icon: "📐",  cls: "c-math" },
  { name: "Biology",     icon: "🧬",  cls: "c-bio"  },
  { name: "History",     icon: "📜",  cls: "c-hist" },
  { name: "Geography",   icon: "🌍",  cls: "c-geo"  },
  { name: "English",     icon: "📖",  cls: "c-eng"  },
  { name: "Computer",    icon: "💻",  cls: "c-cs"   },
  { name: "General",     icon: "📝",  cls: "c-gen"  },
];

// Color classes cycle for custom subjects
const CUSTOM_COLORS = ["c-phys","c-chem","c-math","c-bio","c-hist","c-geo","c-eng","c-cs","c-gen"];
const CUSTOM_ICONS  = ["📘","📗","📙","📕","📓","📔","📒","📃","🗒️"];

const STORAGE_KEY = "gyaani_custom_subjects";

export function getCustomSubjects() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

export function getAllSubjects() {
  const custom = getCustomSubjects();
  return [...DEFAULT_SUBJECTS, ...custom];
}

function getToken() {
  if (typeof window === "undefined") return "prototype_default_token";
  return localStorage.getItem("token") || "prototype_default_token";
}

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

function getAuthHeaders(extraHeaders = {}) {
  const token = getToken();
  return token
    ? { ...extraHeaders, Authorization: `Bearer ${token}` }
    : extraHeaders;
}

function getStoredProfile() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("gyaani_user_profile") || "{}");
  } catch {
    return {};
  }
}

function storeProfileSnapshot(profile = {}) {
  if (typeof window === "undefined") return;
  const currentProfile = getStoredProfile();
  const nextProfile = { ...currentProfile, ...profile };
  localStorage.setItem("gyaani_user_profile", JSON.stringify(nextProfile));

  try {
    const currentUser = JSON.parse(localStorage.getItem("gyaani_user") || "{}");
    localStorage.setItem(
      "gyaani_user",
      JSON.stringify({
        ...currentUser,
        ...nextProfile,
        user_id: nextProfile.user_id || currentUser.user_id,
      }),
    );
  } catch {
    localStorage.setItem("gyaani_user", JSON.stringify(nextProfile));
  }

  window.dispatchEvent(
    new CustomEvent("gyaani:user-profile-updated", { detail: nextProfile }),
  );
}

function mergeSubjectNames(...collections) {
  const subjectMap = new Map();

  collections.flat().forEach((entry) => {
    const name =
      typeof entry === "string"
        ? entry
        : entry?.name || entry?.subject || "";
    const trimmed = (name || "").toString().trim();
    if (!trimmed) return;

    const key = trimmed.toLowerCase();
    if (!subjectMap.has(key)) {
      subjectMap.set(key, getSubjectMeta(trimmed));
    }
  });

  return [...subjectMap.values()];
}

export async function getMergedSubjects() {
  const baseSubjects = getAllSubjects();
  const profileSubjects = getStoredProfile().subjects || [];
  const baseUrl = getApiBaseUrl();

  try {
    const [notesRes, graphsRes] = await Promise.all([
      fetch(`${baseUrl}/notes/`, {
        headers: getAuthHeaders(),
      }).catch(() => null),
      fetch(`${baseUrl}/topic-graph/`, {
        headers: getAuthHeaders(),
      }).catch(() => null),
    ]);

    const notes = notesRes?.ok ? await notesRes.json() : [];
    const graphs = graphsRes?.ok ? await graphsRes.json() : [];

    return mergeSubjectNames(
      baseSubjects,
      profileSubjects,
      Array.isArray(notes) ? notes.map((note) => note?.subject) : [],
      Array.isArray(graphs) ? graphs.map((graph) => graph?.subject) : [],
    );
  } catch {
    return mergeSubjectNames(baseSubjects, profileSubjects);
  }
}

export async function persistSubjectToProfile(name) {
  const trimmed = (name || "").trim();
  if (!trimmed || typeof window === "undefined") return null;

  const profile = getStoredProfile();
  const nextSubjects = mergeSubjectNames(profile.subjects || [], [trimmed]).map(
    (item) => item.name,
  );

  try {
    const res = await fetch(`${getApiBaseUrl()}/auth/preferences`, {
      method: "PATCH",
      headers: getAuthHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        subjects: nextSubjects,
        language: profile.language || "hi-en",
        exam_date: profile.exam_date || null,
        days_to_exam:
          profile.days_to_exam ??
          profile.predict_params?.days_to_exam ??
          30,
      }),
    });

    if (res.ok) {
      const payload = await res.json();
      storeProfileSnapshot({
        ...profile,
        subjects: nextSubjects,
        exam_date: payload.exam_date ?? profile.exam_date ?? null,
        days_to_exam: payload.days_to_exam ?? profile.days_to_exam ?? 30,
        predict_params: {
          ...(profile.predict_params || {}),
          days_to_exam:
            payload.days_to_exam ??
            profile.predict_params?.days_to_exam ??
            profile.days_to_exam ??
            30,
        },
      });
      return payload;
    }
  } catch {}

  storeProfileSnapshot({
    ...profile,
    subjects: nextSubjects,
  });
  return null;
}

export function addCustomSubject(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const all = getAllSubjects();
  if (all.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return null; // already exists
  const custom = getCustomSubjects();
  const idx = custom.length % CUSTOM_COLORS.length;
  const newSubject = {
    name: trimmed,
    icon: CUSTOM_ICONS[idx],
    cls:  CUSTOM_COLORS[idx],
    custom: true,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...custom, newSubject]));
  return newSubject;
}

export function deleteCustomSubject(name) {
  const custom = getCustomSubjects();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom.filter((s) => s.name !== name)));
}

export function getSubjectMeta(name) {
  return getAllSubjects().find((s) => s.name === name) || { name, icon: "📄", cls: "c-gen" };
}

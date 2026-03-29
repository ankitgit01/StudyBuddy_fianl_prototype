// frontend/services/api.js

const USE_MOCK = false;

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEFAULT_USER_ID = "2b871b4a-fb6b-49be-82ca-d7aa244fdc65";
const DEFAULT_TOKEN = "prototype_default_token";

// attach auth header
function authHeaders() {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("token") || DEFAULT_TOKEN
      : DEFAULT_TOKEN;
  return {
    Authorization: `Bearer ${token}`,
  };
}

// seed helper for mock mode
function seed(noteId) {
  return (noteId || "default")
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
}

function inferFileType(url, fallback = "image") {
  if (!url) return fallback;
  return /\.pdf(?:$|[?#])/i.test(url) ? "pdf" : fallback;
}

function pickFirstLink(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// ─────────────────────────────────────────
// UPLOAD NOTE
// ─────────────────────────────────────────
export async function uploadNote(
  file,
  subject,
  language,
  signals = {},
  customPrompt = null,
) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 1200));
    const noteId = `note_${Date.now()}`;

    let notes = [];
    try {
      notes = JSON.parse(localStorage.getItem("gyaani_notes") || "[]");
    } catch (_) {}

    notes.unshift({
      id: noteId,
      subject: subject || "General",
      language: language || "hi-en",
      status: "ready",
      createdAt: new Date().toISOString(),
      imageUrl: URL.createObjectURL(file),
      file_type:
        file.type === "application/pdf" || /\.pdf$/i.test(file.name)
          ? "pdf"
          : "image",
    });

    localStorage.setItem("gyaani_notes", JSON.stringify(notes));
    return { note_id: noteId };
  }

  const form = new FormData();

  // IMPORTANT: backend expects "file"
  form.append("file", file);
  form.append("subject", subject || "General");
  form.append("language", language || "hi-en");
  form.append("signals", JSON.stringify(signals));
  if (customPrompt) form.append("custom_prompt", customPrompt);

  const res = await fetch(`${BASE_URL}/notes/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    let message = "Upload failed";
    try {
      const payload = await res.json();
      message = payload?.detail?.message || payload?.detail || message;
    } catch (_) {}
    throw new Error(message);
  }

  return res.json();
}

export async function createPromptNote(
  subject,
  language,
  customPrompt,
  signals = {},
  topic = null,
) {
  const res = await fetch(`${BASE_URL}/notes/prompt`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: subject || "General",
      topic,
      language: language || "hi-en",
      custom_prompt: customPrompt,
      signals,
    }),
  });

  if (!res.ok) {
    let message = "Prompt note creation failed";
    try {
      const payload = await res.json();
      message = payload?.detail?.message || payload?.detail || message;
    } catch (_) {}
    throw new Error(message);
  }

  return res.json();
}

// ─────────────────────────────────────────
// GET NOTE STATUS
// ─────────────────────────────────────────
export async function getNoteStatus(noteId) {
  if (USE_MOCK) {
    return { status: "processing", current_stage: 1 };
  }

  const res = await fetch(`${BASE_URL}/notes/${noteId}/status`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error("Status check failed");

  return res.json();
}

// ─────────────────────────────────────────
// GET ALL NOTES
// ─────────────────────────────────────────
export async function getNotes() {
  if (USE_MOCK) {
    try {
      return JSON.parse(localStorage.getItem("gyaani_notes") || "[]");
    } catch (_) {
      return [];
    }
  }

  const res = await fetch(`${BASE_URL}/notes/`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error("Failed to fetch notes");

  const data = await res.json();

  // Normalize backend shape → what notes.jsx expects
  return data.map((n) => ({
    id: n.note_id,
    subject: n.subject || "General",
    language: n.language || "hi-en",
    file_name: n.file_name || null,
    topic: n.topic || null,
    status: n.status,
    imageUrl: n.image_url || null,
    previewUrl: n.preview_url || n.image_url || null,
    file_type: n.file_type || inferFileType(n.image_url),
    heatmap_url: n.heatmap_url || null,
    source_mode: n.source_mode || "upload",
    has_source_file: n.has_source_file ?? Boolean(n.image_url),
    has_heatmap: n.has_heatmap ?? Boolean(n.heatmap_url),
    mean_confusion: n.mean_confusion,
    overall_confusion: n.overall_confusion ?? n.mean_confusion,
    createdAt: n.created_at || null,
  }));
}

export async function deleteNote(noteId) {
  if (USE_MOCK) {
    let notes = [];
    try {
      notes = JSON.parse(localStorage.getItem("gyaani_notes") || "[]");
    } catch (_) {}

    localStorage.setItem(
      "gyaani_notes",
      JSON.stringify(notes.filter((note) => note.id !== noteId)),
    );
    return { status: "deleted", note_id: noteId };
  }

  const res = await fetch(`${BASE_URL}/notes/${noteId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!res.ok) {
    let message = "Failed to delete note";
    try {
      const payload = await res.json();
      message = payload?.detail || message;
    } catch (_) {}
    throw new Error(message);
  }

  return res.json();
}

// ─────────────────────────────────────────
// GET EXPLANATION
// ─────────────────────────────────────────
export async function getExplanation(noteId) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 500));
    return buildMockExplanation(noteId);
  }

  const res = await fetch(`${BASE_URL}/notes/${noteId}`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error("Failed to fetch explanation");

  const backend = await res.json();

  const sections = [];

  const mainPages = Array.isArray(backend.explanation?.main)
    ? backend.explanation.main
    : [];
  const concepts = Array.isArray(backend.explanation?.concepts)
    ? backend.explanation.concepts
    : [];
  const backendTranslations = backend.translations || {};
  const mainExplanationEn =
    backendTranslations.en ||
    mainPages.map((page) => page?.explanation || "").filter(Boolean).join("\n\n");
  const mainExplanationHiEn =
    backendTranslations.hi_en ||
    mainPages
      .map((page) => page?.explanation_hi_en || page?.explanation || "")
      .filter(Boolean)
      .join("\n\n");

  // ───────── MAIN EXPLANATION ─────────
  if (mainPages.length || mainExplanationEn || mainExplanationHiEn) {
    sections.push({
      id: 0,
      type: "main",
      english: "Main Explanation",
      explanation_en: mainExplanationEn,
      explanation_hi_en: mainExplanationHiEn,
      explanation_hi: backendTranslations.hi || "",
      explanation_ta: backendTranslations.ta || "",
      explanation_te: backendTranslations.te || "",
      explanation_bn: backendTranslations.bn || "",
    });
  }
  // ─────────────────────────────
  // Section 0 — Main explanation
  // ─────────────────────────────
  // if (mainExplanation) {
  //   sections.push({
  //     id: 0,
  //     confusion: 0.35,

  //     hindi: "मुख्य व्याख्या",
  //     english: "Main Explanation",

  //     explanation_hi: backend.translations?.hi || "",
  //     explanation_en: mainExplanation,
  //     explanation_ta: backend.translations?.ta || "",
  //     explanation_te: backend.translations?.te || "",
  //     explanation_bn: backend.translations?.bn || "",

  //     tip: "This explanation summarizes the entire note.",
  //     confusion_label: "medium",
  //   });
  // }

  // ─────────────────────────────
  // Concept cards
  // ─────────────────────────────
  concepts.forEach((c, i) => {
    sections.push({
      id: i + 1,
      type: "concept",
      difficulty: c.difficulty || "beginner",

      // English (always present — generated by AI)
      // For hi-en notes the AI returns term_en/definition_en etc., not plain term/definition
      term_en: c.term || c.term_en || "",
      term_hi_en: c.term_hi_en || "",
      definition_en: c.definition || c.definition_en || "",
      definition_hi_en: c.definition_hi_en || "",
      example_en: c.example || c.example_en || "",
      example_hi_en: c.example_hi_en || "",
      context_en: c.context || c.context_en || "",
      context_hi_en: c.context_hi_en || "",

      // Translated fields (stored by translator in process_ocr)
      term_hi: c.term_hi || "",
      term_ta: c.term_ta || "",
      term_te: c.term_te || "",
      term_bn: c.term_bn || "",

      definition_hi: c.definition_hi || "",
      definition_ta: c.definition_ta || "",
      definition_te: c.definition_te || "",
      definition_bn: c.definition_bn || "",

      example_hi: c.example_hi || "",
      example_ta: c.example_ta || "",
      example_te: c.example_te || "",
      example_bn: c.example_bn || "",

      context_hi: c.context_hi || "",
      context_ta: c.context_ta || "",
      context_te: c.context_te || "",
      context_bn: c.context_bn || "",

      visual_link: pickFirstLink(c, [
        "visual_link",
        "image_link",
        "image_url",
        "visual_url",
        "visualLink",
        "imageLink",
        "imageUrl",
      ]),
      wikipedia_link: pickFirstLink(c, [
        "wikipedia_link",
        "wiki_link",
        "wikipedia_url",
        "wiki_url",
        "wikipedia",
        "wiki",
        "wikipediaLink",
        "wikipediaUrl",
      ]),
      related_topics: Array.isArray(c.related_topics) ? c.related_topics : [],
      prerequisites: Array.isArray(c.prerequisites) ? c.prerequisites : [],
    });
  });

  return {
    note_id: backend.note_id,
    subject: backend.subject || "Study Notes",
    topic:
      backend.topic ||
      backend.explanation?.concepts?.[0]?.term ||
      backend.explanation?.concepts?.[0]?.term_en ||
      "AI Explanation",
    language: backend.language || "hi-en",
    scanned_at: "just now",
    overall_confusion: backend.mean_confusion ?? 0.35,
    ocr_text: backend.extracted_text || "",
    sections: sections,
    quiz_ready: true,
    quiz_count: 5,
    audio_urls: backend.audio_urls || {},
    translations: {
      en: backendTranslations.en || mainExplanationEn,
      hi_en: backendTranslations.hi_en || mainExplanationHiEn,
      hi: backendTranslations.hi || "",
      ta: backendTranslations.ta || "",
      te: backendTranslations.te || "",
      bn: backendTranslations.bn || "",
    },
    image_url: backend.image_url || "",
    preview_url: backend.preview_url || backend.image_url || "",
    file_type: backend.file_type || inferFileType(backend.image_url),
    source_mode: backend.source_mode || "upload",
    has_source_file: backend.has_source_file ?? Boolean(backend.image_url),
    has_heatmap: backend.has_heatmap ?? Boolean(backend.heatmap_url),
  };
}

// Helper — filter + position paragraphs cleanly
function buildRegions(paragraphs) {
  // Filter out noise — very short text, page numbers, headers
  const meaningful = paragraphs.filter((p) => {
    const t = (p.text || "").trim();
    return (
      t.length > 8 && // skip "Page No." etc
      !/^page\s*no/i.test(t) && // skip page numbers
      !/^\d+$/.test(t) && // skip lone numbers
      (p.confusion_score ?? 0.5) !== undefined
    );
  });

  // Only show top 8 most confused regions — most useful for student
  const top8 = [...meaningful]
    .sort((a, b) => (b.confusion_score ?? 0) - (a.confusion_score ?? 0))
    .slice(0, 8)
    .sort((a, b) => meaningful.indexOf(a) - meaningful.indexOf(b)); // restore order

  const total = top8.length || 1;
  const height = Math.floor(86 / total);

  return top8.map((p, i) => ({
    id: i + 1,
    score: p.confusion_score ?? 0.5,
    label: p.confusion_label ?? "medium",
    top: 4 + i * (height + 0.5),
    left: 8,
    width: 84,
    height: Math.max(4, height - 1),
    text: p.text,
  }));
}

// ─────────────────────────────────────────
// GET HEATMAP
// ─────────────────────────────────────────
export async function getHeatmap(noteId) {
  // if (USE_MOCK) {
  //   await new Promise((r) => setTimeout(r, 400));
  //   return buildMockHeatmap(noteId);
  // }

  const res = await fetch(`${BASE_URL}/notes/${noteId}/heatmap`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error("Failed to fetch heatmap");

  const data = await res.json();

  // Map backend paragraphs → regions with position estimates
  const paragraphs =
    data.paragraphs || data.structured_content?.paragraphs || [];

  const regions = buildRegions(paragraphs);

  return {
    note_id: data.note_id,
    image_url: data.image_url || null,
    heatmap_url: data.heatmap_url || null,
    heatmap_urls: Array.isArray(data.heatmap_urls) ? data.heatmap_urls : [],
    file_type: data.file_type || inferFileType(data.image_url),
    mean_confusion: data.mean_confusion ?? 0.5,
    overall_confusion: data.overall_confusion ?? null,
    paragraphs,
    regions,
  };
}
// ─────────────────────────────────────────
// GET ALL HEATMAPS (all notes for user)
// ─────────────────────────────────────────
export async function getAllHeatmaps(userId) {
  const uid =
    userId ||
    (typeof window !== "undefined" ? localStorage.getItem("user_id") : null) ||
    DEFAULT_USER_ID;

  const res = await fetch(`${BASE_URL}/notes/heatmaps/${uid}`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error("Failed to fetch all heatmaps");

  const data = await res.json();

  return data.map((n) => ({
    note_id: n.note_id,
    file_name: n.file_name || null,
    createdAt: n.created_at || null,
    heatmap_url: n.heatmap_url || null,
  }));
}

// ─────────────────────────────────────────
// GET QUIZ (mock for now)
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// GENERATE QUIZ
// ─────────────────────────────────────────
export async function getQuiz(noteId, options = {}) {
  const {
    num_questions = 5,
    difficulty = "mixed",
    user_message = null,
  } = options;

  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400));
    return buildMockQuiz(noteId);
  }

  const res = await fetch(`${BASE_URL}/quiz/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      note_id: noteId,
      num_questions,
      difficulty,
      user_message,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Quiz generation error:", res.status, errorText);
    throw new Error(`Quiz generation failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();

  console.log("RAW QUIZ API RESPONSE:", data);

  const quiz = data.quiz;
  const quizId = data.quiz_id;

  if (!Array.isArray(quiz)) {
    console.error("Quiz format incorrect:", quiz);
    return { quiz_id: quizId, quiz: [] };
  }

  // normalize format for quiz.jsx and return with quiz_id
  return {
    quiz_id: quizId,
    quiz: quiz.map((q, i) => ({
      id: q.id ?? i + 1,
      type: q.type || "mcq",

      confusion: 0.5,

      question: q.question,
      hindi_question: null,

      options: q.options || [],
      hindi_options: null,

      correct: q.correct ?? 0,

      explanation: q.explanation || `Concept tested: ${q.concept || ""}`,
      hindi_explanation: null,
    })),
  };
}

// ─────────────────────────────────────────
// LOAD EXISTING QUIZ (for retaking)
// ─────────────────────────────────────────
export async function loadExistingQuiz(noteId, quizId) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 300));
    return buildMockQuiz(noteId);
  }

  const res = await fetch(`${BASE_URL}/quiz/load/${noteId}/${quizId}`, {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Load quiz error:", res.status, errorText);
    throw new Error(`Failed to load quiz: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  const quiz = data.quiz;

  if (!Array.isArray(quiz)) {
    console.error("Quiz format incorrect:", quiz);
    return { quiz_id: quizId, quiz: [] };
  }

  // normalize format for quiz.jsx and return with quiz_id
  return {
    quiz_id: quizId,
    quiz: quiz.map((q, i) => ({
      id: q.id ?? i + 1,
      type: q.type || "mcq",
      confusion: 0.5,
      question: q.question,
      hindi_question: null,
      options: q.options || [],
      hindi_options: null,
      correct: q.correct ?? 0,
      explanation: q.explanation || `Concept tested: ${q.concept || ""}`,
      hindi_explanation: null,
    })),
  };
}

// ─────────────────────────────────────────
// SUBMIT QUIZ RESULT
// ─────────────────────────────────────────
export async function getQuizHistoryByNote(noteId) {
  if (USE_MOCK) {
    return {
      note_id: noteId,
      quizzes: [],
      total_quizzes_generated: 0,
      total_quiz_attempts: 0,
      predict_params: {},
    };
  }

  const res = await fetch(`${BASE_URL}/quiz/by_note/${noteId}`, {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch quiz history: ${res.status} ${errorText}`);
  }

  return res.json();
}

export async function getAllQuizHistory() {
  if (USE_MOCK) {
    return {
      user_id: "mock-user",
      quizzes: [],
      total_quizzes: 0,
      subjects_count: 0,
    };
  }

  const res = await fetch(`${BASE_URL}/quiz/all`, {
    headers: {
      ...authHeaders(),
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch all quiz history: ${res.status} ${errorText}`);
  }

  return res.json();
}

export async function submitQuiz(noteId, quizId, answers, timeSpentSeconds = 0) {
  if (USE_MOCK) {
    return { score: 0, correct: 0, total: answers.length };
  }

  const user_id =
    typeof window !== "undefined" ? localStorage.getItem("user_id") || DEFAULT_USER_ID : DEFAULT_USER_ID;

  const res = await fetch(`${BASE_URL}/quiz/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      note_id: noteId,
      user_id,
      quiz_id: quizId,
      answers,
      time_spent_seconds: timeSpentSeconds,
    }),
  });

  if (!res.ok) throw new Error("Quiz submission failed");

  return res.json();
}

export async function chatWithBot({
  message,
  noteId = null,
  contextType = null,
  is_audio = false,  
}) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 400));
    return {
      response: contextType
        ? `Mock ${contextType} reply for note ${noteId || "none"}: ${message}`
        : `Mock home reply: ${message}`,
    };
  }

  const payload = { message, is_audio };
  if (noteId) payload.note_id = noteId;
  if (contextType) payload.context_type = contextType;

  const res = await fetch(`${BASE_URL}/chat/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Chat request failed");

  return res.json();
}

// ─────────────────────────────────────────────────────────────
// MOCK DATA BUILDERS
// Each builder uses seed(noteId) so every uploaded note
// produces different content — simulates real per-note responses
// ─────────────────────────────────────────────────────────────

function buildMockExplanation(noteId) {
  const s = seed(noteId);
  const subjects = [
    "Physics",
    "Chemistry",
    "Mathematics",
    "Biology",
    "History",
  ];
  const topics = [
    "Newton's Laws of Motion",
    "Thermodynamics",
    "Integration by Parts",
    "Cell Division (Mitosis)",
    "French Revolution",
  ];
  const idx = s % subjects.length;

  return {
    note_id: noteId,
    subject: subjects[idx],
    topic: topics[idx],
    language: "hi-en",
    scanned_at: "just now",
    overall_confusion: parseFloat((0.3 + (s % 5) * 0.08).toFixed(2)),
    ocr_text:
      `Yeh note ${topics[idx]} ke baare mein hai.\n` +
      `Is chapter mein ${subjects[idx]} ke main concepts cover kiye gaye hain.\n` +
      `Formulas aur definitions exam ke liye important hain.\n` +
      `Practice problems zaroor solve karo.`,
    sections: [
      {
        id: 1,
        confusion: 0.72,
        hindi: `${topics[idx]} — मुख्य अवधारणा`,
        english: `${topics[idx]} — Core Concept`,
        explanation_hi: `${topics[idx]} ${subjects[idx]} की एक मौलिक अवधारणा है। आपके नोट्स में इस भाग में सबसे अधिक confusion दिखा। इसे दोबारा पढ़ें और उदाहरणों से समझें।`,
        explanation_en: `${topics[idx]} is a fundamental concept in ${subjects[idx]}. Your notes show the highest confusion here — re-read this section and connect it to examples.`,
        tip: `💡 Trick: Relate this to something you already see in daily life.`,
        confusion_label: "confused",
      },
      {
        id: 2,
        confusion: 0.38,
        hindi: `${topics[idx]} — सूत्र और नियम`,
        english: `${topics[idx]} — Formulas & Rules`,
        explanation_hi: `इस भाग में मुख्य सूत्र और उनके उपयोग हैं। आपके नोट्स में यह भाग ठीक था, बस थोड़ा और अभ्यास करें।`,
        explanation_en: `This covers the key formulas. Your notes are fairly clear here — just needs a bit more practice with worked problems.`,
        tip: `💡 Write each formula once by hand before sleeping. Memory sticks overnight.`,
        confusion_label: "medium",
      },
      {
        id: 3,
        confusion: 0.12,
        hindi: `${topics[idx]} — व्यावहारिक उदाहरण`,
        english: `${topics[idx]} — Practical Examples`,
        explanation_hi: `वास्तविक जीवन के उदाहरण। आपने यह हिस्सा अच्छी तरह लिखा है। यह परीक्षा में सबसे अधिक पूछा जाता है।`,
        explanation_en: `Real-world applications. Your notes are very clear here — well done! This section is the most commonly examined.`,
        tip: `💡 Draw a labelled diagram — visual recall is strongest for examples.`,
        confusion_label: "clean",
      },
    ],
    quiz_ready: true,
    quiz_count: 5,
  };
}

function buildMockHeatmap(noteId) {
  const s = seed(noteId);
  const topics = [
    "Newton's Laws",
    "Thermodynamics",
    "Integration",
    "Cell Division",
    "French Revolution",
  ];
  return {
    note_id: noteId,
    subject: "Science",
    topic: topics[s % topics.length],
    page_count: 1,
    overall_score: parseFloat((0.3 + (s % 4) * 0.1).toFixed(2)),
    regions: [
      {
        id: 1,
        score: 0.1,
        label: "clean",
        top: 4,
        left: 8,
        width: 84,
        height: 10,
        lines: 3,
        preview: "Introduction lines — basic definitions...",
        hindi: "परिचय",
        english: "Introduction",
      },
      {
        id: 2,
        score: 0.72,
        label: "confused",
        top: 17,
        left: 8,
        width: 84,
        height: 13,
        lines: 4,
        preview: "Main formula derivation — complex area...",
        hindi: "मुख्य सूत्र",
        english: "Main Formula",
      },
      {
        id: 3,
        score: 0.4,
        label: "medium",
        top: 33,
        left: 8,
        width: 84,
        height: 9,
        lines: 2,
        preview: "Application example — moderate clarity...",
        hindi: "उपयोग",
        english: "Application",
      },
      {
        id: 4,
        score: 0.85,
        label: "confused",
        top: 45,
        left: 8,
        width: 84,
        height: 15,
        lines: 5,
        preview: "Derivation steps — most confusion here...",
        hindi: "व्युत्पत्ति",
        english: "Derivation",
      },
      {
        id: 5,
        score: 0.15,
        label: "clean",
        top: 63,
        left: 8,
        width: 84,
        height: 9,
        lines: 3,
        preview: "Summary and conclusion — clear writing...",
        hindi: "सारांश",
        english: "Summary",
      },
    ],
  };
}

function buildMockQuiz(noteId) {
  const s = seed(noteId);
  const topics = [
    "Newton's Laws",
    "Thermodynamics",
    "Integration",
    "Cell Division",
    "French Revolution",
  ];
  const topic = topics[s % topics.length];

  return [
    {
      id: 1,
      type: "mcq",
      confusion: 0.72,
      question: `Which best describes the core principle of ${topic}?`,
      hindi_question: `${topic} के मुख्य सिद्धांत का सबसे अच्छा वर्णन कौन सा है?`,
      options: [
        "Depends on conditions",
        "A fundamental law",
        "Only theoretical",
        "Recently disproved",
      ],
      hindi_options: [
        "परिस्थितियों पर निर्भर",
        "मौलिक नियम",
        "केवल सैद्धांतिक",
        "हाल में अस्वीकृत",
      ],
      correct: 1,
      explanation: `${topic} is a fundamental law — universal and unchanging. Your notes show confusion here, review this section.`,
      hindi_explanation: `${topic} एक मौलिक नियम है जो सर्वत्र सत्य है। अपने नोट्स का यह भाग दोबारा पढ़ें।`,
    },
    {
      id: 2,
      type: "truefalse",
      confusion: 0.4,
      question: `${topic} can be applied to solve real-world engineering problems.`,
      hindi_question: `${topic} का उपयोग वास्तविक इंजीनियरिंग समस्याओं के लिए किया जा सकता है।`,
      options: ["True", "False"],
      hindi_options: ["सच", "गलत"],
      correct: 0,
      explanation: `True! ${topic} has direct engineering applications. This is exactly why it is important to understand deeply.`,
      hindi_explanation: `सच! ${topic} के सीधे इंजीनियरिंग अनुप्रयोग हैं।`,
    },
    {
      id: 3,
      type: "mcq",
      confusion: 0.85,
      question: `What happens when the key variable in ${topic} is doubled?`,
      hindi_question: `${topic} में मुख्य चर दोगुना होने पर क्या होता है?`,
      options: [
        "Nothing changes",
        "Result doubles",
        "Result halves",
        "Result squares",
      ],
      hindi_options: [
        "कुछ नहीं बदलता",
        "परिणाम दोगुना",
        "परिणाम आधा",
        "परिणाम वर्गाकार",
      ],
      correct: 1,
      explanation: `Doubling the key variable doubles the result — this is a direct linear relationship. High confusion zone in your notes!`,
      hindi_explanation: `मुख्य चर दोगुना होने पर परिणाम भी दोगुना होता है — यह एक रैखिक संबंध है।`,
    },
    {
      id: 4,
      type: "mcq",
      confusion: 0.35,
      question: `${topic} is primarily studied under which subject?`,
      hindi_question: `${topic} मुख्यतः किस विषय के अंतर्गत पढ़ा जाता है?`,
      options: ["Arts", "Science", "Commerce", "Literature"],
      hindi_options: ["कला", "विज्ञान", "वाणिज्य", "साहित्य"],
      correct: 1,
      explanation: `${topic} is a core Science topic. Your notes show good clarity here!`,
      hindi_explanation: `${topic} विज्ञान का मुख्य विषय है। आपके नोट्स यहाँ स्पष्ट हैं।`,
    },
    {
      id: 5,
      type: "fillin",
      confusion: 0.55,
      question: `The study of ${topic} helps us understand _____ in nature.`,
      hindi_question: `${topic} का अध्ययन प्रकृति में _____ को समझने में मदद करता है।`,
      options: [
        "Art patterns",
        "Fundamental laws",
        "Commerce trends",
        "Political systems",
      ],
      hindi_options: [
        "कला के पैटर्न",
        "मौलिक नियम",
        "व्यापार के रुझान",
        "राजनीतिक प्रणाली",
      ],
      correct: 1,
      explanation: `${topic} helps us understand the fundamental laws that govern the natural world around us.`,
      hindi_explanation: `${topic} हमें प्रकृति के मौलिक नियमों को समझने में मदद करता है।`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// GET DNA PROFILE  (used by dna.jsx)
//
// REAL: GET /api/user/dna
// Returns Mayank's LSTM output — scores computed from ALL notes
// the user has uploaded. Nothing is fixed — every field comes
// from the model analysing the user's actual handwriting patterns.
//
// MOCK: derives scores from the user's real notes in localStorage
// using seed() so the data varies per user's actual note history.
// ─────────────────────────────────────────────────────────────
export async function getDNA(userId) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return buildMockDNA();
  }

  // userId from localStorage token or passed directly
  const uid =
    userId ||
    (typeof window !== "undefined" ? localStorage.getItem("user_id") : null) ||
    DEFAULT_USER_ID;

  const res = await fetch(`${BASE_URL}/notes/dna/${uid}`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error("Failed to fetch DNA profile");

  const data = await res.json();

  // Normalize backend response to what dna.jsx expects
  const probs = data.probabilities || {};

  return {
    dominant: (data.dominant_style || "Visual").toLowerCase(),
    scores: {
      visual: Math.round((probs.Visual || 0.33) * 100),
      auditory: Math.round((probs.Auditory || 0.33) * 100),
      kinesthetic: Math.round((probs.Kinesthetic || 0.34) * 100),
    },
    history: data.history || [],
    tips: data.tips || [],
    total_notes_analysed: data.total_notes_analysed || 0,
    last_updated: data.last_updated || new Date().toISOString(),
    message: data.message || null,
  };
}

// ─────────────────────────────────────────────────────────────
// MOCK: buildMockDNA
// Reads user's actual notes from localStorage.
// Uses seed() on all note IDs so scores vary per real user data.
// ─────────────────────────────────────────────────────────────
function buildMockDNA() {
  // Read actual notes the user has uploaded
  let notes = [];
  try {
    notes = JSON.parse(localStorage.getItem("gyaani_notes") || "[]");
  } catch (_) {}

  // Compute a combined seed from all note IDs
  const combinedSeed = notes.reduce(
    (acc, n) => acc + seed(n.id),
    notes.length + 1,
  );
  const s = combinedSeed || 42;

  // Derive scores from seed — totals to 100
  const visualBase = 30 + (s % 40); // 30–69
  const auditoryBase = 15 + ((s * 3) % 35); // 15–49
  const remaining = 100 - visualBase - auditoryBase;
  const kinesthetic = Math.max(5, remaining); // at least 5

  // Normalise to 100
  const total = visualBase + auditoryBase + kinesthetic;
  const visual = Math.round((visualBase / total) * 100);
  const auditory = Math.round((auditoryBase / total) * 100);
  const kinestheticFinal = 100 - visual - auditory;

  // Dominant type
  const scores = { visual, auditory, kinesthetic: kinestheticFinal };
  const dominant = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];

  // History — 6-week evolution derived from seed
  const history = Array.from({ length: 6 }, (_, i) => {
    const weekSeed = s + i * 7;
    const v = Math.round(visual * (0.6 + (weekSeed % 5) * 0.08));
    const a = Math.round(auditory * (0.7 + (weekSeed % 4) * 0.07));
    const k = 100 - v - a;
    return {
      week: `W${i + 1}`,
      visual: v,
      auditory: a,
      kinesthetic: Math.max(0, k),
    };
  });

  // Tips — GPT-4o will generate these in real mode. Mock uses subject-aware tips.
  const subjects = notes.map((n) => n.subject).filter(Boolean);
  const subjectLine = subjects.length
    ? `for ${[...new Set(subjects)].slice(0, 2).join(" & ")}`
    : "for your subjects";

  const allTips = {
    visual: [
      `Draw a labelled diagram ${subjectLine} before reading the text`,
      "Use colour-coded notes — one colour per concept",
      "Watch video explanations; you absorb visuals best",
      "Sketch a mind-map connecting all topics you have uploaded",
      "Use GYAANI's Heatmap overlay — it highlights your weak visual zones",
    ],
    auditory: [
      `Read your ${subjectLine} notes aloud while revising`,
      "Record yourself explaining a topic and replay it",
      "Discuss concepts with a study partner before solving problems",
      "Use GYAANI's Hindi/English audio explanation feature",
      "Study with soft instrumental music — it helps auditory learners focus",
    ],
    kinesthetic: [
      `Solve 3 practice problems ${subjectLine} before reading theory`,
      "Write out derivations and proofs by hand — don't just read them",
      "Take short 5-minute movement breaks every 25 minutes",
      "Build physical models or use objects to represent abstract concepts",
      "Type your notes into GYAANI immediately after class — action helps retention",
    ],
  };

  return {
    dominant,
    scores,
    history,
    tips: allTips[dominant],
    total_notes_analysed: notes.length,
    last_updated: notes[0]?.createdAt || new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// GET CONSTELLATION  (used by constellation.jsx)
//
// REAL: GET /api/user/constellation
// Returns Ankit's knowledge graph — nodes are concepts extracted
// from ALL notes the user has uploaded, edges are connections
// GPT-4o found between them. Positions come from Dinesh's
// graph layout algorithm.
//
// MOCK: derives nodes + edges from user's actual notes in
// localStorage — subject and topic names come from real uploads.
// ─────────────────────────────────────────────────────────────
export async function getConstellation() {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 700));
    return buildMockConstellation();
  }
  const res = await fetch(`${BASE_URL}/api/user/constellation`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch constellation");
  return res.json();
  // Real response shape:
  // {
  //   nodes: [
  //     { id, label, subject, confidence: 0-1, x, y, z }
  //   ],
  //   edges: [
  //     { from, to, strength: 0-1 }
  //   ]
  // }
}

// ─────────────────────────────────────────────────────────────
// MOCK: buildMockConstellation
// Reads user's real notes from localStorage and builds a graph
// of concept nodes derived from their actual subjects + topics.
// ─────────────────────────────────────────────────────────────
function buildMockConstellation() {
  let notes = [];
  try {
    notes = JSON.parse(localStorage.getItem("gyaani_notes") || "[]");
  } catch (_) {}

  // Map each subject to a set of concept nodes
  const conceptMap = {
    Physics: ["Force", "Motion", "Energy", "Waves", "Optics", "Gravity"],
    Chemistry: ["Atoms", "Bonds", "Reactions", "Acids", "Metals", "Organic"],
    Mathematics: [
      "Algebra",
      "Calculus",
      "Geometry",
      "Trigonometry",
      "Matrices",
      "Probability",
    ],
    Biology: [
      "Cells",
      "DNA",
      "Photosynthesis",
      "Evolution",
      "Genetics",
      "Ecology",
    ],
    History: [
      "Empires",
      "Revolutions",
      "Wars",
      "Trade",
      "Civilisation",
      "Nationalism",
    ],
    General: [
      "Concepts",
      "Definitions",
      "Formulas",
      "Examples",
      "Applications",
      "Review",
    ],
  };

  // Collect subjects from real uploaded notes
  const subjects = notes.length
    ? [...new Set(notes.map((n) => n.subject || "General"))]
    : ["Physics", "Mathematics", "Chemistry"]; // fallback if no notes yet

  // Build nodes — one cluster per subject
  const nodes = [];
  let nodeId = 0;

  subjects.forEach((subject, si) => {
    const concepts = conceptMap[subject] || conceptMap["General"];
    const s = seed(subject);
    const clusterAngle = (si / subjects.length) * Math.PI * 2;
    const clusterR = 3.5;

    // Central hub node for the subject
    const hubId = nodeId++;
    nodes.push({
      id: hubId,
      label: subject,
      subject,
      isHub: true,
      confidence: 1,
      x: Math.cos(clusterAngle) * clusterR,
      y: (s % 3) * 0.5 - 0.5,
      z: Math.sin(clusterAngle) * clusterR,
    });

    // Concept nodes around the hub
    concepts.forEach((concept, ci) => {
      const angle = (ci / concepts.length) * Math.PI * 2;
      const r = 1.4 + (seed(concept) % 3) * 0.2;
      const cSeed = seed(concept + subject);
      nodes.push({
        id: nodeId++,
        label: concept,
        subject,
        isHub: false,
        confidence: parseFloat((0.4 + (cSeed % 6) * 0.1).toFixed(2)),
        x: Math.cos(clusterAngle) * clusterR + Math.cos(angle) * r,
        y: (s % 3) * 0.5 - 0.5 + (cSeed % 3) * 0.4 - 0.4,
        z: Math.sin(clusterAngle) * clusterR + Math.sin(angle) * r,
      });
    });
  });

  // Build edges
  const edges = [];

  // Spoke edges: hub → concept nodes
  let cursor = 0;
  subjects.forEach((subject) => {
    const concepts = conceptMap[subject] || conceptMap["General"];
    const hubId = cursor;
    cursor++; // skip hub
    for (let ci = 0; ci < concepts.length; ci++) {
      edges.push({ from: hubId, to: cursor + ci, strength: 0.8 });
    }
    cursor += concepts.length;
  });

  // Cross-subject edges (between hubs) — 1 per subject pair
  const hubIds = subjects.map((_, si) => {
    let off = 0;
    for (let i = 0; i < si; i++) {
      off += 1 + (conceptMap[subjects[i]] || conceptMap["General"]).length;
    }
    return off;
  });
  for (let i = 0; i < hubIds.length - 1; i++) {
    edges.push({ from: hubIds[i], to: hubIds[i + 1], strength: 0.35 });
  }

  return { nodes, edges };
}

// ─────────────────────────────────────────────────────────────
// GET WELLNESS  (used by wellness.jsx)
//
// REAL: GET /api/user/wellness
// Returns Dinesh's daily stress signals + Mayank's stress model
// output. All fields come from the user's behavioural data —
// upload frequency, session lengths, quiz performance trends.
//
// MOCK: derives scores from user's real notes in localStorage
// ─────────────────────────────────────────────────────────────
export async function getWellness(userId) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 500));
    return buildMockWellness();
  }

  const uid =
    userId ||
    (typeof window !== "undefined" ? localStorage.getItem("user_id") : null) ||
    DEFAULT_USER_ID;

  const res = await fetch(`${BASE_URL}/notes/wellness/${uid}`, {
    headers: authHeaders(),
  });

  if (!res.ok) throw new Error("Failed to fetch wellness data");

  const data = await res.json();
  const historyBlock =
    data.stress_history &&
    typeof data.stress_history === "object" &&
    !Array.isArray(data.stress_history)
      ? data.stress_history
      : null;
  const plotHistory = Array.isArray(historyBlock?.plot_points)
    ? historyBlock.plot_points
    : [];

  return {
    stress_score: Number(data.current_assessment?.stress_score ?? data.stress_score ?? 0),
    stress_label: data.current_assessment?.stress_label || data.stress_label,
    stress_alert: Boolean(data.current_assessment?.stress_alert ?? data.stress_alert),
    streak_days: Number(data.predict_params?.days_since_last_break ?? data.streak_days ?? 0),
    streak_goal: data.streak_goal,
    mood_history: data.mood_history,
    stress_history: plotHistory,
    stress_history_meta: historyBlock?.range || null,
    stress_history_raw: Array.isArray(historyBlock?.raw_points) ? historyBlock.raw_points : [],
    current_assessment: data.current_assessment || null,
    tip: data.tip,
    top_stressor: data.current_assessment?.top_stressor || data.top_stressor || "",
    wellness_message: data.current_assessment?.wellness_message || data.wellness_message || "",
    feature_contributions: data.feature_contributions || {},
    predict_params: data.predict_params || {},
    tracking_summary: data.tracking_summary || {},
    last_checkin: data.last_checkin,
    stress_history_saved: Boolean(data.stress_history_saved),
    days_to_exam: data.days_to_exam,
    avg_quiz_score: data.avg_quiz_score ?? 50, // ← ADD
    confusion_score: data.confusion_score ?? 0.5, // ← ADD
  };
}

function buildMockWellness() {
  let notes = [];
  try {
    notes = JSON.parse(localStorage.getItem("gyaani_notes") || "[]");
  } catch (_) {}

  const s = notes.reduce((acc, n) => acc + seed(n.id), notes.length + 3);

  // Stress derived from upload frequency — more notes = lower stress (studying = prepared)
  const baseStress = Math.max(10, 80 - notes.length * 8);
  const stressScore = Math.min(95, baseStress + (s % 20) - 10);
  const stressLabel =
    stressScore < 35 ? "low" : stressScore < 65 ? "moderate" : "high";

  const streakDays =
    notes.length > 0 ? Math.min(notes.length * 2 + (s % 4), 30) : 0;

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const moodHistory = days.map((day, i) => ({
    day,
    score: Math.max(10, Math.min(95, stressScore + (seed(day + s) % 30) - 15)),
  }));

  const tips = {
    low: "You're in a great headspace! Lock in your revision schedule for the next 7 days.",
    moderate:
      "Take a 10-minute break every hour. Upload your toughest topic note — clarity reduces stress.",
    high: "Focus on one subject at a time. Use GYAANI's audio mode — passive listening reduces cognitive load.",
  };

  return {
    stress_score: stressScore,
    stress_label: stressLabel,
    streak_days: streakDays,
    streak_goal: 7,
    mood_history: moodHistory,
    tip: tips[stressLabel],
    last_checkin: notes[0]?.createdAt || new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// GET PODS  (used by pods/index.jsx)
//
// REAL: GET /api/pods
// Returns Dinesh's pod matching result — anonymised groups of
// students with similar confusion patterns on shared subjects.
// ─────────────────────────────────────────────────────────────
export async function getPods() {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 500));
    return buildMockPods();
  }
  const res = await fetch(`${BASE_URL}/api/pods`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch pods");
  return res.json();
  // Real response shape: array of pod objects (see getPod for full shape)
}

function buildMockPods() {
  let notes = [];
  try {
    notes = JSON.parse(localStorage.getItem("gyaani_notes") || "[]");
  } catch (_) {}

  const subjects = notes.length
    ? [...new Set(notes.map((n) => n.subject || "General"))]
    : ["Physics", "Mathematics"];

  return subjects.map((subject, i) => {
    const s = seed(subject);
    return {
      id: `pod_${subject.toLowerCase().replace(/\s/g, "_")}`,
      subject,
      member_count: 3 + (s % 5),
      active: i === 0,
      last_activity: i === 0 ? "2 hours ago" : `${i + 1} days ago`,
      shared_notes: 2 + (s % 4),
      avg_confusion: parseFloat((0.35 + (s % 5) * 0.07).toFixed(2)),
      top_confused_topic: [
        "Derivations",
        "Formulas",
        "Applications",
        "Proofs",
        "Diagrams",
      ][s % 5],
    };
  });
}

// ─────────────────────────────────────────────────────────────
// GET POD DETAIL  (used by pods/[id].jsx)
//
// REAL: GET /api/pods/:podId
// Returns full pod with members, shared notes, group heatmap.
// ─────────────────────────────────────────────────────────────
export async function getPod(podId) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 500));
    return buildMockPodDetail(podId);
  }
  const res = await fetch(`${BASE_URL}/api/pods/${podId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch pod");
  return res.json();
}

function buildMockPodDetail(podId) {
  const s = seed(podId);
  const subject =
    podId
      .replace("pod_", "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "General";

  const memberNames = [
    "Student A",
    "Student B",
    "Student C",
    "Student D",
    "Student E",
  ];
  const memberCount = 3 + (s % 3);

  return {
    id: podId,
    subject,
    member_count: memberCount,
    active: true,
    last_activity: "2 hours ago",
    shared_notes: 2 + (s % 4),
    avg_confusion: parseFloat((0.35 + (s % 5) * 0.07).toFixed(2)),
    top_confused_topic: [
      "Derivations",
      "Formulas",
      "Applications",
      "Proofs",
      "Diagrams",
    ][s % 5],
    members: Array.from({ length: memberCount }, (_, i) => ({
      id: `member_${i}`,
      alias: memberNames[i],
      confusion_score: parseFloat(
        (0.3 + (seed(memberNames[i]) % 6) * 0.1).toFixed(2),
      ),
      notes_shared: 1 + (seed(memberNames[i] + podId) % 3),
      streak: 1 + (seed(memberNames[i]) % 7),
    })),
    shared_notes_list: Array.from({ length: 2 + (s % 3) }, (_, i) => ({
      id: `note_shared_${i}`,
      title: `${subject} — Topic ${i + 1}`,
      shared_by: memberNames[i % memberCount],
      confusion: parseFloat(
        (0.3 + (seed(`note${i}${podId}`) % 5) * 0.08).toFixed(2),
      ),
      uploaded_at: `${i + 1} day${i > 0 ? "s" : ""} ago`,
    })),
    group_confusion_trend: [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ].map((day) => ({
      day,
      avg: parseFloat((0.3 + (seed(day + podId) % 5) * 0.08).toFixed(2)),
    })),
  };
}

export async function generateAudio(noteId, lang) {
  const res = await fetch(`${BASE_URL}/notes/${noteId}/generate-audio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ lang }),
  });

  if (!res.ok) throw new Error("Audio generation failed");

  return res.json();
}

export async function trackNoteInteraction(noteId, eventType, lang = null, value = null) {
  const res = await fetch(`${BASE_URL}/notes/${noteId}/interaction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      event_type: eventType,
      lang,
      value,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to track interaction");
  }

  return res.json();
}

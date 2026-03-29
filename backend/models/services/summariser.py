# backend/services/summariser.py
# GYAANI AI — Video Summarisation using Azure OpenAI (GPT-4.1)

import os
import json
from openai import AzureOpenAI

SYSTEM_PROMPT = """You are GYAANI AI — a study assistant for Indian students (Class 9–12, JEE, NEET, UPSC).

Analyse a YouTube video transcript and return a structured JSON study summary.

RULES:
- Do NOT copy transcript word for word. Write your own summaries.
- Keep summaries concise — students should understand the topic, not re-read the transcript.
- Split into 4–8 logical topics based on topic shifts.
- If Hindi or mixed Hindi-English, write summaries helpfully for both.
- Identify exam-relevant formulas, concepts, tips.
- Return ONLY valid JSON — no markdown, no explanation, no extra text."""

USER_PROMPT = """Analyse this transcript and return a structured JSON study summary.

Return exactly this JSON:
{{
  "title_guess": "Best guess at video title from content",
  "overall_summary": "2-3 paragraph prose summary. No bullet points here.",
  "key_takeaways": [
    "Important point 1 — specific and actionable",
    "Important point 2",
    "Important point 3",
    "Important point 4",
    "Important point 5",
    "Important point 6"
  ],
  "topics": [
    {{
      "id": 1,
      "title": "Short topic title",
      "summary": "2-4 sentence summary of this section and why it matters for exams.",
      "key_points": [
        "Specific point 1",
        "Specific point 2",
        "Specific point 3"
      ],
      "key_formula": "Most important formula here, or null",
      "difficulty": "easy | medium | hard",
      "duration_hint": "e.g. 0-10 min"
    }}
  ],
  "subject_tags": ["Subject", "Class level", "JEE/NEET/Board"],
  "exam_relevance": "Specific exam tips or null",
  "estimated_read_time_mins": 5
}}

Video Title: {title}
Language: {language}
Word Count: {word_count}

TRANSCRIPT:
{transcript}"""


def _truncate_transcript(text: str, max_words: int = 12000) -> tuple[str, bool]:
    words = text.split()
    if len(words) <= max_words:
        return text, False
    return " ".join(words[:max_words]) + "\n[Transcript truncated]", True


def summarise_transcript(
    transcript_text: str,
    word_count: int,
    video_title: str = "",
    detected_language: str = "en",
) -> dict:
    """Send transcript to Azure OpenAI GPT-4 and return structured summary."""

    transcript_text, was_truncated = _truncate_transcript(transcript_text)
    if was_truncated:
        print(f"[Summariser] Truncated to 12,000 words (original: {word_count})")

    # ── Azure OpenAI client ────────────────────────────────────
    azure_key      = os.environ.get("AZURE_OPENAI_KEY", "")
    azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "")

    if not azure_key or not azure_endpoint:
        raise ValueError(
            "AZURE_OPENAI_KEY or AZURE_OPENAI_ENDPOINT not set in .env"
        )

    client = AzureOpenAI(
        api_key=azure_key,
        azure_endpoint=azure_endpoint,
        api_version="2024-02-01",
    )

    lang_names = {
        "en": "English", "hi": "Hindi", "ta": "Tamil",
        "te": "Telugu", "bn": "Bengali", "mr": "Marathi",
        "gu": "Gujarati", "hi-en": "Hindi + English",
    }
    lang_display = lang_names.get(detected_language, detected_language)

    user_message = USER_PROMPT.format(
        title=video_title or "Unknown — infer from content",
        language=lang_display,
        word_count=word_count,
        transcript=transcript_text,
    )

    print(f"[Summariser] Sending to Azure OpenAI...")

    # ── Get deployment name from env or use default ────────────
    # In Azure OpenAI, the model name is the deployment name you created
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

    response = client.chat.completions.create(
        model=deployment,
        max_tokens=4096,
        temperature=0.3,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_message},
        ],
    )

    raw = response.choices[0].message.content.strip()

    try:
        result = json.loads(raw)
        print(f"[Summariser] ✓ Done — {len(result.get('topics', []))} topics")
        return result
    except json.JSONDecodeError as e:
        print(f"[Summariser] JSON parse error: {e}")
        raise Exception("Azure OpenAI returned invalid JSON. Please retry.")

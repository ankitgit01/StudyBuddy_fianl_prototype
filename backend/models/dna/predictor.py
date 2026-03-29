import json
from dataclasses import asdict, dataclass
from pathlib import Path

import joblib
import numpy as np
from openai import AzureOpenAI

from config import AZURE_OPENAI_API_VERSION, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY

MODEL_DIR = Path(__file__).parent / "outputs"

_model = None
_scaler = None
_le = None
_features = None


def _load():
    global _model, _scaler, _le, _features
    if _model is not None:
        return
    try:
        _model = joblib.load(MODEL_DIR / "dna_model.pkl")
        _scaler = joblib.load(MODEL_DIR / "dna_scaler.pkl")
        _le = joblib.load(MODEL_DIR / "dna_label_encoder.pkl")
        with open(MODEL_DIR / "dna_features.json", "r", encoding="utf-8") as f:
            _features = json.load(f)
        print("DNA model loaded")
    except Exception as exc:
        print(f"DNA model load failed: {exc}")
        _model = None


PROFILE_BASE = {
    "The Achiever": {"emoji": "🏆", "color": "#FFD700"},
    "The Hustler": {"emoji": "💪", "color": "#43E97B"},
    "The Curious Mind": {"emoji": "🔭", "color": "#4FACFE"},
    "The Comeback Kid": {"emoji": "🔥", "color": "#FF6B6B"},
    "The Deep Thinker": {"emoji": "🧠", "color": "#A78BFA"},
    "The Consistent Scholar": {"emoji": "⭐", "color": "#38f9d7"},
}

BEGINNER_PROFILE = {
    "profile": "The Explorer",
    "emoji": "🌱",
    "color": "#6C63FF",
    "tagline": "Your journey to greatness begins now - every note shapes your DNA.",
    "strengths": [
        "Fresh start with clean study momentum",
        "Every new note teaches GYAANI your pattern",
        "Your DNA becomes sharper with each session",
    ],
    "tips": [
        "Upload at least 3 notes to unlock your real profile",
        "Attempt one quiz after each note today",
        "Visit your constellation and mark progress",
    ],
    "probabilities": {profile: round(1 / 6, 4) for profile in PROFILE_BASE},
    "confidence": 0.0,
    "is_beginner": True,
}

_ai_client = None
if AZURE_OPENAI_KEY and AZURE_OPENAI_ENDPOINT:
    try:
        _ai_client = AzureOpenAI(
            api_key=AZURE_OPENAI_KEY,
            api_version=AZURE_OPENAI_API_VERSION,
            azure_endpoint=AZURE_OPENAI_ENDPOINT,
        )
    except Exception as exc:
        print(f"DNA insight client init failed: {exc}")


@dataclass
class DNAFeatureSnapshot:
    audio_replays: float = 0.0
    quiz_attempts: float = 0.0
    avg_quiz_score: float = 50.0
    notes_viewed: float = 0.0
    heatmap_views: float = 0.0
    red_zone_clicks: float = 0.0
    login_streak: float = 0.0
    days_since_last: float = 1.0
    total_study_minutes: float = 0.0
    quiz_retry_rate: float = 0.0
    quiz_improvement: float = 0.0
    time_on_explanation: float = 0.0
    upload_count: float = 0.0
    mean_confusion: float = 0.0
    subjects_count: float = 1.0
    concepts_total: float = 0.0
    concepts_completed: float = 0.0
    concept_completion_rate: float = 0.0

    @classmethod
    def from_dict(cls, signals: dict) -> "DNAFeatureSnapshot":
        values = {}
        for field_name in cls.__dataclass_fields__:
            raw_value = signals.get(field_name, getattr(cls, field_name, 0.0))
            try:
                values[field_name] = float(raw_value or 0.0)
            except Exception:
                values[field_name] = float(getattr(cls, field_name, 0.0))
        concepts_total = max(0.0, values["concepts_total"])
        concepts_completed = max(0.0, values["concepts_completed"])
        values["concept_completion_rate"] = round(
            concepts_completed / concepts_total,
            4,
        ) if concepts_total > 0 else 0.0
        return cls(**values)

    def model_input(self, features: list[str]) -> list[float]:
        data = asdict(self)
        return [float(data.get(feature, 0.0) or 0.0) for feature in features]

    def prompt_dict(self) -> dict:
        return {key: round(float(value), 4) for key, value in asdict(self).items()}


@dataclass
class DNAResult:
    profile: str
    emoji: str
    color: str
    tagline: str
    strengths: list
    tips: list
    probabilities: dict
    confidence: float
    is_beginner: bool = False
    top_features: dict | None = None


def _clean_json(content: str) -> dict | None:
    if not content:
        return None
    cleaned = content.strip().replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except Exception:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except Exception:
                return None
    return None


def _static_fallback(profile: str, snapshot: DNAFeatureSnapshot) -> dict:
    score = snapshot.avg_quiz_score
    streak = snapshot.login_streak
    uploads = snapshot.upload_count
    confusion = snapshot.mean_confusion
    improvement = snapshot.quiz_improvement
    audio = snapshot.audio_replays
    subjects = snapshot.subjects_count
    completion = snapshot.concept_completion_rate
    mappings = {
        "The Achiever": {
            "tagline": f"{score:.0f}% average shows you study with precision.",
            "strengths": [
                f"Strong {score:.0f}% quiz average",
                f"Low confusion at {confusion:.0%}",
                f"{streak:.0f}-day rhythm is paying off",
            ],
            "tips": [
                "Push one harder quiz today",
                "Finish one pending constellation topic",
                "Turn one strong concept into a revision card",
            ],
        },
        "The Hustler": {
            "tagline": f"{snapshot.total_study_minutes:.0f} study minutes show relentless effort.",
            "strengths": [
                f"{snapshot.total_study_minutes:.0f} minutes of work logged",
                f"{uploads:.0f} notes uploaded so far",
                f"{streak:.0f}-day study streak is solid",
            ],
            "tips": [
                "Shorten one session and add a break",
                "Review one weak heatmap zone next",
                "Attempt one medium quiz to convert effort into accuracy",
            ],
        },
        "The Curious Mind": {
            "tagline": f"You explore {subjects:.0f} subjects with real curiosity.",
            "strengths": [
                f"{subjects:.0f} subjects keep your learning wide",
                f"{audio:.0f} audio replays show flexible learning",
                f"{snapshot.heatmap_views:.0f} heatmap visits show reflection",
            ],
            "tips": [
                "Choose one subject to go deeper today",
                "Close one concept loop in your constellation",
                "Use one quiz to test breadth with focus",
            ],
        },
        "The Comeback Kid": {
            "tagline": f"{improvement:+.0f} quiz improvement shows strong recovery energy.",
            "strengths": [
                f"{improvement:+.0f} points of score improvement",
                f"{snapshot.quiz_retry_rate:.0%} retry rate shows persistence",
                "You keep returning to hard concepts",
            ],
            "tips": [
                "Retake one saved quiz today",
                "Revisit one topic that improved recently",
                "Lock in progress with a short review block",
            ],
        },
        "The Deep Thinker": {
            "tagline": f"{audio:.0f} audio replays and deep revisits shape your style.",
            "strengths": [
                f"{audio:.0f} audio replays show layered learning",
                f"{snapshot.time_on_explanation:.0f} minutes spent on explanations",
                "You stay with concepts until they make sense",
            ],
            "tips": [
                "Convert one explanation into your own words",
                "Attempt a quick quiz before re-reading again",
                "Mark one fully understood concept done",
            ],
        },
        "The Consistent Scholar": {
            "tagline": f"{streak:.0f} active days reflect reliable momentum.",
            "strengths": [
                f"{streak:.0f}-day streak is steady",
                f"{completion:.0%} concept completion shows follow-through",
                f"{uploads:.0f} uploads are building a strong base",
            ],
            "tips": [
                "Protect your streak with one focused session",
                "Finish one more concept today",
                "Use one saved quiz as a consistency check",
            ],
        },
    }
    return mappings.get(profile, {
        "tagline": f"{profile} energy is visible in your study pattern.",
        "strengths": ["You are engaging consistently", "Your data shows effort", "Your pattern is becoming clearer"],
        "tips": ["Keep studying today", "Attempt one quiz", "Review one explanation carefully"],
    })


def _generate_ai_insights(
    *,
    raw_profile: str,
    confidence: float,
    probabilities: dict,
    top_features: dict,
    snapshot: DNAFeatureSnapshot,
) -> dict:
    fallback = _static_fallback(raw_profile, snapshot)
    if _ai_client is None:
        return {"rectified_profile": raw_profile, **fallback}

    prompt = f"""
You are GYAANI's study DNA coach.

An ML classifier predicted the student's study persona. Your job is to:
1. sanity-check whether the predicted profile looks realistic from the actual feature snapshot
2. keep the profile if it looks plausible
3. switch to a better-fitting profile only if the ML output seems clearly unrealistic
4. write personalized motivational copy grounded in the student's real behavior

Allowed profiles only:
{json.dumps(list(PROFILE_BASE.keys()), ensure_ascii=True)}

ML output:
- raw_profile: {raw_profile}
- confidence: {round(confidence, 4)}
- class_probabilities: {json.dumps(probabilities, ensure_ascii=True)}
- top_model_features: {json.dumps(top_features, ensure_ascii=True)}

Student feature snapshot:
{json.dumps(snapshot.prompt_dict(), ensure_ascii=True)}

Feature meaning reminders:
- audio_replays: replaying generated audio from the start
- quiz_attempts: total quiz submissions
- notes_viewed: explanation opens
- heatmap_views: times the heatmap was opened
- login_streak: consecutive active study days
- days_since_last: inactivity gap in days
- quiz_retry_rate: ratio of saved-quiz restarts among quiz starts
- quiz_improvement: later quiz performance minus earlier quiz performance
- mean_confusion: average note confusion from 0 to 1
- concepts_completed: only concepts both present in uploaded notes and marked done

Return strict JSON only with exactly these keys:
{{
  "rectified_profile": "One allowed profile name",
  "tagline": "max 15 words, vivid and personal",
  "strengths": ["3 short strengths, each under 16 words"],
  "tips": ["3 short actionable tips, each under 16 words"]
}}

Rules:
- Keep the raw profile unless the snapshot strongly contradicts it.
- Use real numbers from the snapshot in at least two strengths.
- Tips should be practical for today.
- No markdown. No extra keys. No emojis.
"""

    try:
        response = _ai_client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {
                    "role": "system",
                    "content": "You analyze study behavior, lightly correct unrealistic classifications, and return valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            max_tokens=320,
        )
        parsed = _clean_json(response.choices[0].message.content or "") or {}
        rectified_profile = str(parsed.get("rectified_profile") or raw_profile).strip()
        if rectified_profile not in PROFILE_BASE:
            rectified_profile = raw_profile
        strengths = parsed.get("strengths")
        tips = parsed.get("tips")
        if not isinstance(strengths, list) or len(strengths) < 3:
            strengths = fallback["strengths"]
        if not isinstance(tips, list) or len(tips) < 3:
            tips = fallback["tips"]
        return {
            "rectified_profile": rectified_profile,
            "tagline": str(parsed.get("tagline") or fallback["tagline"]).strip(),
            "strengths": [str(item).strip() for item in strengths[:3]],
            "tips": [str(item).strip() for item in tips[:3]],
        }
    except Exception as exc:
        print(f"[DNA] AI insight generation failed: {exc}")
        return {"rectified_profile": raw_profile, **fallback}


def predict_dna(signals: dict) -> DNAResult:
    _load()
    snapshot = DNAFeatureSnapshot.from_dict(signals or {})

    if snapshot.upload_count < 3 or _model is None or _scaler is None or _le is None or not _features:
        beginner = BEGINNER_PROFILE
        return DNAResult(
            profile=beginner["profile"],
            emoji=beginner["emoji"],
            color=beginner["color"],
            tagline=beginner["tagline"],
            strengths=beginner["strengths"],
            tips=beginner["tips"],
            probabilities=beginner["probabilities"],
            confidence=beginner["confidence"],
            is_beginner=True,
            top_features={},
        )

    try:
        x = np.array([snapshot.model_input(_features)], dtype=float)
        x_scaled = _scaler.transform(x)
        pred = _model.predict(x_scaled)[0]
        proba = _model.predict_proba(x_scaled)[0]
        raw_profile = _le.inverse_transform([pred])[0]
        confidence = float(proba.max())
        probabilities = {
            _le.inverse_transform([i])[0]: round(float(probability), 4)
            for i, probability in enumerate(proba)
        }
        importances = _model.feature_importances_
        top_idx = np.argsort(importances)[::-1][:4]
        top_features = {
            _features[i]: round(float(importances[i]), 4)
            for i in top_idx
        }

        insights = _generate_ai_insights(
            raw_profile=raw_profile,
            confidence=confidence,
            probabilities=probabilities,
            top_features=top_features,
            snapshot=snapshot,
        )
        final_profile = insights.get("rectified_profile") or raw_profile
        if final_profile not in PROFILE_BASE:
            final_profile = raw_profile
        base = PROFILE_BASE.get(final_profile, PROFILE_BASE[raw_profile])

        return DNAResult(
            profile=final_profile,
            emoji=base["emoji"],
            color=base["color"],
            tagline=insights["tagline"],
            strengths=insights["strengths"],
            tips=insights["tips"],
            probabilities=probabilities,
            confidence=round(confidence, 4),
            is_beginner=False,
            top_features=top_features,
        )
    except Exception as exc:
        print(f"[DNA] prediction error: {exc}")
        beginner = BEGINNER_PROFILE
        return DNAResult(
            profile=beginner["profile"],
            emoji=beginner["emoji"],
            color=beginner["color"],
            tagline=beginner["tagline"],
            strengths=beginner["strengths"],
            tips=beginner["tips"],
            probabilities=beginner["probabilities"],
            confidence=beginner["confidence"],
            is_beginner=True,
            top_features={},
        )

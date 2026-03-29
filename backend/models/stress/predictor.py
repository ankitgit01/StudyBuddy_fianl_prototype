import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path

import joblib
import numpy as np
import xgboost as xgb

from services.azure_openai import client as _wellness_client


BASE_DIR = Path(__file__).resolve().parents[2]
XGB_PATH = BASE_DIR / "models" / "outputs" / "stress" / "stress_xgb.json"
SCALER_PATH = BASE_DIR / "models" / "outputs" / "stress" / "stress_scaler.pkl"

STRESS_FEATURES = [
    "days_to_exam",
    "pending_subjects_count",
    "subjects_active_today",
    "total_study_minutes",
    "study_minutes_vs_7day_avg",
    "sessions_count",
    "night_sessions",
    "early_morning_sessions",
    "days_since_last_break",
    "notes_uploaded_today",
    "total_notes_uploaded",
    "reread_count",
    "avg_quiz_score",
    "quiz_attempts_today",
    "quiz_difficulty_drop",
    "quiz_avg_time_per_question",
    "quiz_correct_streak_broken",
    "quiz_llm_stress_signal",
    "quiz_llm_confusion_keywords",
    "confusion_score_today",
    "heatmap_red_ratio",
    "max_page_confusion_score",
    "unvisited_topic_ratio",
    "stale_constellation_topics",
    "chatbot_questions_today",
    "repeated_question_ratio",
    "chatbot_llm_stress_signal",
    "chatbot_llm_confusion_keywords",
    "explanation_revisit_count",
    "explanation_llm_stress_signal",
    "explanation_llm_confusion_keywords",
    "translation_used",
    "audio_playback_loops",
    "upload_modalities_today",
]

N_FEATURES = len(STRESS_FEATURES)


print("Loading Stress Predictor...")
_xgb_model = xgb.XGBRegressor()
_xgb_model.load_model(str(XGB_PATH))
_scaler = joblib.load(str(SCALER_PATH))
print(f"Stress Predictor ready! ({N_FEATURES} features)")


@dataclass
class StressFeatureSnapshot:
    days_to_exam: float = 30
    pending_subjects_count: float = 0
    subjects_active_today: float = 1
    total_study_minutes: float = 0
    study_minutes_vs_7day_avg: float = 1.0
    sessions_count: float = 0
    night_sessions: float = 0
    early_morning_sessions: float = 0
    days_since_last_break: float = 1
    notes_uploaded_today: float = 0
    total_notes_uploaded: float = 0
    reread_count: float = 0
    avg_quiz_score: float = 50.0
    quiz_attempts_today: float = 0
    quiz_difficulty_drop: float = 0
    quiz_avg_time_per_question: float = 30.0
    quiz_correct_streak_broken: float = 0
    quiz_llm_stress_signal: float = 0.0
    quiz_llm_confusion_keywords: float = 0
    confusion_score_today: float = 0.5
    heatmap_red_ratio: float = 0.0
    max_page_confusion_score: float = 0.5
    unvisited_topic_ratio: float = 0.5
    stale_constellation_topics: float = 0
    chatbot_questions_today: float = 0
    repeated_question_ratio: float = 0.0
    chatbot_llm_stress_signal: float = 0.0
    chatbot_llm_confusion_keywords: float = 0
    explanation_revisit_count: float = 0
    explanation_llm_stress_signal: float = 0.0
    explanation_llm_confusion_keywords: float = 0
    translation_used: float = 0
    audio_playback_loops: float = 0
    upload_modalities_today: float = 0

    def to_dict(self) -> dict:
        return asdict(self)

    def to_array(self) -> np.ndarray:
        return np.array(
            [[float(self.to_dict()[feature]) for feature in STRESS_FEATURES]],
            dtype=np.float32,
        )


@dataclass
class StressPrediction:
    stress_score: float
    risk_level: str
    alert_needed: bool
    wellness_message: str
    top_stressor: str
    advice: str
    feature_contributions: dict


def _stress_label(score: float) -> str:
    if score < 35:
        return "low"
    if score < 65:
        return "moderate"
    return "high"


def _clean_json(content: str) -> dict | None:
    cleaned = re.sub(r"```json|```", "", content or "").strip()
    try:
        return json.loads(cleaned)
    except Exception:
        try:
            start = cleaned.find("{")
            end = cleaned.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(cleaned[start:end])
        except Exception:
            return None
    return None


def _fallback_wellness_copy(risk: str, top_stressor: str, score: float) -> tuple[str, str, float]:
    messages = {
        "low": "Your study pattern looks stable today, so protect this rhythm and keep your momentum calm.",
        "moderate": "Pressure is building a bit today, but a small reset and tighter focus can steady things quickly.",
        "high": "Your stress signals are elevated today, so reduce load, recover first, and study in shorter blocks.",
    }
    advice_map = {
        "days_to_exam": "Shrink today into two must-win tasks so exam pressure feels manageable.",
        "pending_subjects_count": "Pick one pending subject and create a simple first note to restart progress.",
        "subjects_active_today": "Limit yourself to two subjects today so your attention stops scattering.",
        "total_study_minutes": "Ease the next session and protect recovery so long hours do not backfire.",
        "study_minutes_vs_7day_avg": "Spread the remaining work across smaller blocks instead of forcing another heavy push.",
        "sessions_count": "Merge smaller sessions into a few focused blocks with a clear goal each.",
        "night_sessions": "Wrap study earlier tonight so sleep can help memory and mood.",
        "early_morning_sessions": "Recover sleep first before stacking another early session.",
        "days_since_last_break": "Take a genuine break block soon because rest helps retention.",
        "notes_uploaded_today": "Turn today's uploads into a short revision list before moving on.",
        "total_notes_uploaded": "Revise from the material you already have instead of collecting more.",
        "reread_count": "Switch from rereading to self-testing on the same topic for one round.",
        "avg_quiz_score": "Review the mistakes behind your score before attempting another quiz.",
        "quiz_attempts_today": "Pause repeated attempts and spend one cycle understanding the error pattern first.",
        "quiz_difficulty_drop": "Rebuild confidence on easier questions, then step back up gradually.",
        "quiz_avg_time_per_question": "Target the slowest concept with one focused explanation review.",
        "quiz_correct_streak_broken": "Revisit the concept that broke your streak and summarise it in your own words.",
        "quiz_llm_stress_signal": "Your quiz activity sounds tense, so slow down and take one short reset first.",
        "quiz_llm_confusion_keywords": "Your quiz questions still look confused, so try one worked example before retrying.",
        "confusion_score_today": "Start with the most confusing section and resolve just that first.",
        "heatmap_red_ratio": "Too many confusing regions are active, so narrow today to one note or one chapter.",
        "max_page_confusion_score": "Return to the single most confusing page and rebuild it from basics.",
        "unvisited_topic_ratio": "Choose one untouched constellation topic today so progress feels visible again.",
        "stale_constellation_topics": "Close one open topic today instead of opening something new.",
        "chatbot_questions_today": "Turn one chatbot answer into your own note so the learning sticks.",
        "repeated_question_ratio": "You are looping on the same doubt, so switch medium and try audio or a simpler explanation.",
        "chatbot_llm_stress_signal": "Break your doubt into one smaller question at a time to reduce overload.",
        "chatbot_llm_confusion_keywords": "Ask for one concrete example next instead of a broad explanation.",
        "explanation_revisit_count": "After reopening the explanation, write a two-line summary from memory.",
        "explanation_llm_stress_signal": "Slow the pace and tackle one paragraph or concept at a time.",
        "explanation_llm_confusion_keywords": "Pin down the exact sentence or term causing confusion before continuing.",
        "translation_used": "Keep using the language that helps comprehension, then restate the idea once in English.",
        "audio_playback_loops": "Pause after each replay and note the one point you still want clarified.",
        "upload_modalities_today": "Keep inputs simple today and focus on learning from what you already uploaded.",
    }
    return (
        messages.get(risk, messages["moderate"]),
        advice_map.get(top_stressor, "Keep the next study block small, specific, and well-rested."),
        round(float(score), 2),
    )


def _normalize_rectified_score(raw_score: float, candidate_score: float | None) -> float:
    if candidate_score is None:
        return round(float(raw_score), 2)

    bounded_candidate = max(0.0, min(100.0, float(candidate_score)))
    max_shift = 18.0
    lower_bound = max(0.0, raw_score - max_shift)
    upper_bound = min(100.0, raw_score + max_shift)
    adjusted = min(max(bounded_candidate, lower_bound), upper_bound)
    return round(float(adjusted), 2)


def _generate_wellness_copy(
    *,
    raw_score: float,
    risk: str,
    top_stressor: str,
    feature_contributions: dict,
    feature_snapshot: StressFeatureSnapshot,
) -> tuple[str, str, float]:
    fallback_message, fallback_advice, fallback_score = _fallback_wellness_copy(risk, top_stressor, raw_score)

    if _wellness_client is None:
        return fallback_message, fallback_advice, fallback_score

    prompt = f"""
You are GYAANI's wellness coach, and you also sanity-check model outputs when they look too extreme or unreal.

You are given:
1. A raw stress score predicted by a trained model.
2. The exact feature values used by that model.
3. The top weighted stress contributors.

Your job:
- Write a realistic wellness_message.
- Write a realistic advice line.
- Return a rectified_stress_score only if the raw score feels too extreme or clearly inconsistent with the feature profile.

Rules for rectified_stress_score:
- Keep it between 0 and 100.
- Stay close to the raw model score unless the score looks obviously too low or too high for the features.
- Use the feature values, not vibes.
- A student with many zero-like stress indicators can stay low.
- Strong exam pressure, sleep disruption, confusion, quiz struggle, repeated doubts, and backlog should push the score upward.
- Do not over-correct. Small or moderate adjustments are preferred.

Student snapshot:
- raw_stress_score: {raw_score}
- raw_risk_level: {risk}
- top_stressor: {top_stressor}
- top_feature_contributions: {json.dumps(feature_contributions, ensure_ascii=True)}
- full_feature_values: {json.dumps(feature_snapshot.to_dict(), ensure_ascii=True)}

Return strict JSON with exactly these keys:
{{
  "rectified_stress_score": 0,
  "wellness_message": "...",
  "advice": "..."
}}

Writing rules:
- wellness_message: 16 to 28 words, warm and reflective, no advice.
- advice: 12 to 24 words, one practical action for the next hour or two.
- No markdown, no preamble, no extra keys, no emojis.
"""

    try:
        response = _wellness_client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {
                    "role": "system",
                    "content": "You write concise, empathetic student wellness guidance and return valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=260,
        )
        content = response.choices[0].message.content or ""
        parsed = _clean_json(content) or {}
        message = str(parsed.get("wellness_message") or "").strip()
        advice = str(parsed.get("advice") or "").strip()
        rectified_score = _normalize_rectified_score(
            raw_score,
            parsed.get("rectified_stress_score"),
        )
        if message and advice:
            return message, advice, rectified_score
    except Exception as exc:
        print(f"Stress wellness copy generation failed: {exc}")

    return fallback_message, fallback_advice, fallback_score


CONFUSION_KEYWORDS = [
    "don't understand", "dont understand", "confused", "confusing",
    "no idea", "totally lost", "help me", "i'm lost", "im lost",
    "makes no sense", "hard", "difficult", "struggling", "can't follow",
    "cant follow", "what does", "explain again", "i give up",
    "too much", "overwhelming", "stressed", "anxiety", "panic",
]

# Legacy hardcoded prompt-text extractors are intentionally disabled.
# GPT-4.1 now returns llm_stress_signal and llm_confusion_keywords directly
# in the quiz, chatbot, and explanation flows.
#
# def extract_llm_stress_signal(prompt: str) -> tuple[float, float]:
#     ...
#
# def extract_quiz_llm_stress_signal(prompt: str) -> tuple[float, float]:
#     ...
#
# def extract_chatbot_llm_stress_signal(prompt: str) -> tuple[float, float]:
#     ...
#
# def extract_explanation_llm_stress_signal(prompt: str) -> tuple[float, float]:
#     ...


def predict(
    days_to_exam: float = 30,
    pending_subjects_count: float = 0,
    subjects_active_today: float = 1,
    total_study_minutes: float = 0,
    study_minutes_vs_7day_avg: float = 1.0,
    sessions_count: float = 0,
    night_sessions: float = 0,
    early_morning_sessions: float = 0,
    days_since_last_break: float = 1,
    notes_uploaded_today: float = 0,
    total_notes_uploaded: float = 0,
    reread_count: float = 0,
    avg_quiz_score: float = 50.0,
    quiz_attempts_today: float = 0,
    quiz_difficulty_drop: float = 0,
    quiz_avg_time_per_question: float = 30.0,
    quiz_correct_streak_broken: float = 0,
    quiz_llm_stress_signal: float = 0.0,
    quiz_llm_confusion_keywords: float = 0,
    confusion_score_today: float = 0.5,
    heatmap_red_ratio: float = 0.0,
    max_page_confusion_score: float = 0.5,
    unvisited_topic_ratio: float = 0.5,
    stale_constellation_topics: float = 0,
    chatbot_questions_today: float = 0,
    repeated_question_ratio: float = 0.0,
    chatbot_llm_stress_signal: float = 0.0,
    chatbot_llm_confusion_keywords: float = 0,
    explanation_revisit_count: float = 0,
    explanation_llm_stress_signal: float = 0.0,
    explanation_llm_confusion_keywords: float = 0,
    translation_used: float = 0,
    audio_playback_loops: float = 0,
    upload_modalities_today: float = 0,
) -> StressPrediction:
    total_notes_uploaded = 0 # Intentionally added
    snapshot = StressFeatureSnapshot(
        days_to_exam=days_to_exam,
        pending_subjects_count=pending_subjects_count,
        subjects_active_today=subjects_active_today,
        total_study_minutes=total_study_minutes,
        study_minutes_vs_7day_avg=study_minutes_vs_7day_avg,
        sessions_count=sessions_count,
        night_sessions=night_sessions,
        early_morning_sessions=early_morning_sessions,
        days_since_last_break=days_since_last_break,
        notes_uploaded_today=notes_uploaded_today,
        total_notes_uploaded=total_notes_uploaded,
        reread_count=reread_count,
        avg_quiz_score=avg_quiz_score,
        quiz_attempts_today=quiz_attempts_today,
        quiz_difficulty_drop=quiz_difficulty_drop,
        quiz_avg_time_per_question=quiz_avg_time_per_question,
        quiz_correct_streak_broken=quiz_correct_streak_broken,
        quiz_llm_stress_signal=quiz_llm_stress_signal,
        quiz_llm_confusion_keywords=quiz_llm_confusion_keywords,
        confusion_score_today=confusion_score_today,
        heatmap_red_ratio=heatmap_red_ratio,
        max_page_confusion_score=max_page_confusion_score,
        unvisited_topic_ratio=unvisited_topic_ratio,
        stale_constellation_topics=stale_constellation_topics,
        chatbot_questions_today=chatbot_questions_today,
        repeated_question_ratio=repeated_question_ratio,
        chatbot_llm_stress_signal=chatbot_llm_stress_signal,
        chatbot_llm_confusion_keywords=chatbot_llm_confusion_keywords,
        explanation_revisit_count=explanation_revisit_count,
        explanation_llm_stress_signal=explanation_llm_stress_signal,
        explanation_llm_confusion_keywords=explanation_llm_confusion_keywords,
        translation_used=translation_used,
        audio_playback_loops=audio_playback_loops,
        upload_modalities_today=upload_modalities_today,
    )

    features = snapshot.to_array()
    scaled = _scaler.transform(features)
    raw_score = float(np.clip(_xgb_model.predict(scaled)[0], 0, 100))
    raw_score = round(raw_score, 2)

    importances = _xgb_model.feature_importances_
    weighted = features[0] * importances
    top_idx = int(np.argmax(weighted))
    top_stressor = STRESS_FEATURES[top_idx]

    contrib_pairs = sorted(
        zip(STRESS_FEATURES, weighted.tolist()),
        key=lambda item: abs(item[1]),
        reverse=True,
    )
    feature_contributions = {key: round(value, 4) for key, value in contrib_pairs[:5]}
    raw_risk = _stress_label(raw_score)
    wellness_message, advice, final_score = _generate_wellness_copy(
        raw_score=raw_score,
        risk=raw_risk,
        top_stressor=top_stressor,
        feature_contributions=feature_contributions,
        feature_snapshot=snapshot,
    )
    final_risk = _stress_label(final_score)

    return StressPrediction(
        stress_score=final_score,
        risk_level=final_risk,
        alert_needed=final_score >= 65,
        wellness_message=wellness_message,
        top_stressor=top_stressor,
        advice=advice,
        feature_contributions=feature_contributions,
    )


def predict_from_dict(signals: dict) -> StressPrediction:
    defaults = StressFeatureSnapshot().to_dict()
    merged = {**defaults, **signals}
    return predict(**merged)


if __name__ == "__main__":
    result = predict(
        days_to_exam=7,
        avg_quiz_score=42.0,
        confusion_score_today=0.78,
        days_since_last_break=5,
        night_sessions=2,
        quiz_llm_stress_signal=0.85,
        quiz_llm_confusion_keywords=3,
        chatbot_llm_stress_signal=0.87,
        chatbot_llm_confusion_keywords=6,
        explanation_llm_stress_signal=0.91,
        explanation_llm_confusion_keywords=5,
        unvisited_topic_ratio=0.65,
        chatbot_questions_today=14,
        repeated_question_ratio=0.4,
        study_minutes_vs_7day_avg=2.1,
    )
    print(f"Score        : {result.stress_score}")
    print(f"Risk         : {result.risk_level}")
    print(f"Alert        : {result.alert_needed}")
    print(f"Top stressor : {result.top_stressor}")
    print(f"Message      : {result.wellness_message}")
    print(f"Advice       : {result.advice}")
    print(f"Contributions: {result.feature_contributions}")

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import hashlib
import hmac
import time
import base64
import datetime
from zoneinfo import ZoneInfo

from services.cosmos_db import (
    create_user,
    get_user_by_id,
    update_user,
    get_notes_by_user,
    get_signals,
    get_topic_graphs_by_user,
    upsert_signals_document,
)
from models.stress.predictor import STRESS_FEATURES

router = APIRouter()
security = HTTPBearer(auto_error=False)

SECRET_KEY = "gyaani_secret_key_change_in_production"
DEFAULT_USER_ID = "2b871b4a-fb6b-49be-82ca-d7aa244fdc65"
DEFAULT_USER_EMAIL = "ankit_k2@mfs.iitr.ac.in"
DEFAULT_USER_NAME = "Guest"
DEFAULT_TOKEN = "prototype_default_token"
LOCAL_TIMEZONE = ZoneInfo("Asia/Kolkata")
SESSION_INACTIVITY_TIMEOUT = datetime.timedelta(hours=1)


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class PreferencesRequest(BaseModel):
    subjects: Optional[List[str]] = []
    language: Optional[str] = "hi-en"
    days_to_exam: Optional[int] = 30
    exam_date: Optional[str] = None


def _hash_password(password: str) -> str:
    return hashlib.sha256(f"{password}{SECRET_KEY}".encode()).hexdigest()


def _create_token(user_id: str, email: str) -> str:
    if user_id == DEFAULT_USER_ID and email == DEFAULT_USER_EMAIL:
        return DEFAULT_TOKEN
    payload = f"{user_id}:{email}:{int(time.time())}"
    signature = hmac.new(
        SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    raw = f"{payload}:{signature}"
    return base64.b64encode(raw.encode()).decode()


def _verify_token(token: str) -> Optional[dict]:
    if token == DEFAULT_TOKEN:
        return {"user_id": DEFAULT_USER_ID, "email": DEFAULT_USER_EMAIL}
    try:
        raw = base64.b64decode(token.encode()).decode()
        parts = raw.split(":")
        if len(parts) != 4:
            return None
        user_id, email, ts, sig = parts
        payload = f"{user_id}:{email}:{ts}"
        expected = hmac.new(
            SECRET_KEY.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()[:16]
        if sig != expected:
            return None
        return {"user_id": user_id, "email": email}
    except Exception:
        return None


def _days_to_exam_from_date(exam_date_str: str) -> int:
    try:
        exam_date = datetime.date.fromisoformat(exam_date_str)
        today = datetime.date.today()
        delta = (exam_date - today).days
        return max(1, delta)
    except Exception:
        return 30


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _local_now() -> datetime.datetime:
    return _utc_now().astimezone(LOCAL_TIMEZONE)


def _to_local_datetime(value: datetime.datetime) -> datetime.datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(LOCAL_TIMEZONE)


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=datetime.timezone.utc)
        return parsed.astimezone(datetime.timezone.utc)
    except Exception:
        return None


def _default_signal_document(user_id: str) -> dict:
    return {
        "id": f"signals_{user_id}",
        "user_id": user_id,
        "audio_replays": 0,
        "notes_viewed": 0,
        "heatmap_views": 0,
        "red_zone_clicks": 0,
        "total_study_minutes": 0,
        "time_on_explanation": 0.0,
        "reread_count": 0,
        "reread_events": [],
        "explanation_events": [],
        "chatbot_events": [],
        "quiz_load_events": [],
        "session_events": [],
        "daily_study_minutes": {},
        "last_activity_at": None,
        "last_session_started_at": None,
        "last_updated": None,
    }


def _save_signals(signals: dict) -> dict:
    signals["last_updated"] = _utc_now().isoformat()
    return upsert_signals_document(signals)


def _apply_stress_predict_overrides(user_id: str, predict_params: dict) -> dict:
    if not user_id:
        return predict_params

    signals = get_signals(user_id) or {}
    overrides = signals.get("stress_predict_overrides") or {}
    if not isinstance(overrides, dict):
        return predict_params

    merged = dict(predict_params)
    for key, value in overrides.items():
        if key in STRESS_FEATURES:
            try:
                merged[key] = float(value)
            except Exception:
                continue
    return merged


def _normalize_session_events(values: list[str]) -> list[str]:
    parsed_events = sorted(
        item for item in (_parse_iso_datetime(value) for value in values) if item
    )
    normalized_events: list[datetime.datetime] = []
    for event_time in parsed_events:
        if not normalized_events:
            normalized_events.append(event_time)
            continue
        if event_time - normalized_events[-1] > SESSION_INACTIVITY_TIMEOUT:
            normalized_events.append(event_time)
    return [item.isoformat() for item in normalized_events[-500:]]


def _touch_session_signal(user_id: str) -> dict:
    signals = get_signals(user_id) or _default_signal_document(user_id)
    now = _utc_now()
    normalized_session_events = _normalize_session_events(
        list(signals.get("session_events", []))
    )
    last_activity = (
        _parse_iso_datetime(signals.get("last_activity_at"))
        or _parse_iso_datetime(signals.get("last_updated"))
        or _parse_iso_datetime(signals.get("last_session_started_at"))
    )

    if not last_activity or now - last_activity > SESSION_INACTIVITY_TIMEOUT:
        normalized_session_events.append(now.isoformat())
        normalized_session_events = _normalize_session_events(normalized_session_events)
        signals["last_session_started_at"] = normalized_session_events[-1]
    elif normalized_session_events and not signals.get("last_session_started_at"):
        signals["last_session_started_at"] = normalized_session_events[-1]

    signals["session_events"] = normalized_session_events
    signals["last_activity_at"] = now.isoformat()
    _save_signals(signals)
    return signals


def _normalize_subject_statuses(user: dict) -> dict:
    statuses = user.get("subject_statuses") or {}
    normalized = {}

    for subject in user.get("subjects", []) or []:
        entry = statuses.get(subject) or {}
        normalized[subject] = {
            "status": entry.get("status", "pending"),
            "last_activity_at": entry.get("last_activity_at"),
            "last_activity_date": entry.get("last_activity_date"),
        }

    for subject, entry in statuses.items():
        if subject not in normalized:
            normalized[subject] = {
                "status": entry.get("status", "pending"),
                "last_activity_at": entry.get("last_activity_at"),
                "last_activity_date": entry.get("last_activity_date"),
            }

    return normalized


def record_subject_activity(user_id: str, subject: Optional[str]) -> None:
    if not user_id or not subject:
        return

    user = get_user_by_id(user_id)
    if not user:
        return

    subject = subject.strip()
    if not subject:
        return

    now = _utc_now()
    local_now = _to_local_datetime(now)
    subject_statuses = _normalize_subject_statuses(user)
    current = subject_statuses.get(subject) or {
        "status": "pending",
        "last_activity_at": None,
        "last_activity_date": None,
    }
    current["status"] = "active"
    current["last_activity_at"] = now.isoformat()
    current["last_activity_date"] = local_now.date().isoformat()
    subject_statuses[subject] = current

    subjects = list(user.get("subjects", []) or [])
    if subject not in subjects:
        subjects.append(subject)

    update_user(user_id, {
        "subjects": subjects,
        "subject_statuses": subject_statuses,
    })


def _days_since_last_break(active_dates: set[datetime.date], today: datetime.date) -> float:
    if not active_dates:
        return 0.0

    cursor = today
    streak = 0
    while cursor in active_dates:
        streak += 1
        cursor -= datetime.timedelta(days=1)

    if streak == 0:
        cursor = today - datetime.timedelta(days=1)
        while cursor in active_dates:
            streak += 1
            cursor -= datetime.timedelta(days=1)

    return float(streak)


def _difficulty_rank(value: Optional[str]) -> int:
    mapping = {
        "beginner": 1,
        "easy": 1,
        "mixed": 2,
        "medium": 2,
        "hard": 3,
        "advanced": 3,
    }
    return mapping.get((value or "").strip().lower(), 2)


def _extract_quiz_metrics(notes: list[dict], today: datetime.date) -> tuple[dict, dict]:
    quiz_entries = {}
    attempts = []

    for note in notes:
        for quiz_entry in (note.get("quizzes_generated", []) or []):
            if isinstance(quiz_entry, dict) and quiz_entry.get("quiz_id"):
                quiz_entries[quiz_entry["quiz_id"]] = quiz_entry

        raw_attempts = note.get("quiz_attempts", []) or []
        if isinstance(raw_attempts, list):
            for attempt in raw_attempts:
                if isinstance(attempt, dict):
                    attempts.append(attempt)

    attempts.sort(
        key=lambda item: _parse_iso_datetime(item.get("attempted_at")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
    )
    deduped_attempts = []
    seen = set()
    for attempt in attempts:
        signature = (
            attempt.get("quiz_id"),
            attempt.get("user_id"),
            round(float(attempt.get("score", 0) or 0), 4),
            int(attempt.get("correct", 0) or 0),
            int(attempt.get("total", 0) or 0),
            int(attempt.get("time_spent_seconds", 0) or 0),
            (_parse_iso_datetime(attempt.get("attempted_at")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)).replace(microsecond=0),
        )
        if signature in seen:
            continue
        seen.add(signature)
        deduped_attempts.append(attempt)
    attempts = deduped_attempts

    all_scores = []
    today_scores = []
    today_attempts = 0
    all_time_per_question = []
    today_time_per_question = []
    difficulty_drop = 0.0
    today_difficulty_drop = 0.0
    streak_broken = 0.0
    today_streak_broken = 0.0
    llm_stress_values = []
    today_llm_stress_values = []
    llm_confusion_values = []
    today_llm_confusion_values = []
    previous_rank = None
    previous_score = None
    previous_rank_today = None
    previous_score_today = None

    for attempt in attempts:
        score = float(attempt.get("score", 0) or 0)
        all_scores.append(score)

        attempted_at = _parse_iso_datetime(attempt.get("attempted_at"))
        is_today = bool(attempted_at and _to_local_datetime(attempted_at).date() == today)
        if is_today:
            today_attempts += 1
            today_scores.append(score)

        avg_time = float(attempt.get("avg_time_per_question", 0) or 0)
        if avg_time > 0:
            all_time_per_question.append(avg_time)
            if is_today:
                today_time_per_question.append(avg_time)

        difficulty = attempt.get("difficulty")
        if not difficulty:
            difficulty = (quiz_entries.get(attempt.get("quiz_id")) or {}).get("difficulty")
        current_rank = _difficulty_rank(difficulty)
        if previous_rank is not None and current_rank < previous_rank:
            difficulty_drop += float(previous_rank - current_rank)
        previous_rank = current_rank
        if is_today:
            if previous_rank_today is not None and current_rank < previous_rank_today:
                today_difficulty_drop += float(previous_rank_today - current_rank)
            previous_rank_today = current_rank

        responses = attempt.get("user_responses", []) or []
        run = 0
        broken_here = False
        for response in responses:
            if response.get("is_correct"):
                run += 1
            else:
                if run >= 2:
                    broken_here = True
                run = 0
        if broken_here or (previous_score is not None and previous_score >= 80 and score < 60):
            streak_broken += 1.0
        previous_score = score
        if is_today and (
            broken_here
            or (previous_score_today is not None and previous_score_today >= 80 and score < 60)
        ):
            today_streak_broken += 1.0
        if is_today:
            previous_score_today = score

        llm_stress = attempt.get("quiz_llm_stress_signal")
        llm_confusion = attempt.get("quiz_llm_confusion_keywords")
        if llm_stress is None or llm_confusion is None:
            quiz_entry = quiz_entries.get(attempt.get("quiz_id")) or {}
            llm_stress = quiz_entry.get("llm_stress_signal", llm_stress)
            llm_confusion = quiz_entry.get("llm_confusion_keywords", llm_confusion)
        if llm_stress is not None:
            llm_stress_values.append(float(llm_stress or 0))
            if is_today:
                today_llm_stress_values.append(float(llm_stress or 0))
        if llm_confusion is not None:
            llm_confusion_values.append(float(llm_confusion or 0))
            if is_today:
                today_llm_confusion_values.append(float(llm_confusion or 0))

    quiz_improvement = 0.0
    if len(all_scores) >= 2:
        window = min(3, len(all_scores))
        early_avg = sum(all_scores[:window]) / window
        late_avg = sum(all_scores[-window:]) / window
        quiz_improvement = round(late_avg - early_avg, 4)

    metrics = {
        "avg_quiz_score": round(sum(all_scores) / len(all_scores), 4) if all_scores else 50.0,
        "avg_quiz_score_today": round(sum(today_scores) / len(today_scores), 4) if today_scores else 50.0,
        "quiz_attempts_today": float(today_attempts),
        "quiz_attempts_total": float(len(attempts)),
        "quiz_generated_total": float(len(quiz_entries)),
        "quiz_improvement": float(quiz_improvement),
        "quiz_difficulty_drop": float(difficulty_drop),
        "quiz_difficulty_drop_today": float(today_difficulty_drop),
        "quiz_avg_time_per_question": round(
            sum(all_time_per_question) / len(all_time_per_question), 4
        ) if all_time_per_question else 30.0,
        "quiz_avg_time_per_question_today": round(
            sum(today_time_per_question) / len(today_time_per_question), 4
        ) if today_time_per_question else 30.0,
        "quiz_correct_streak_broken": float(streak_broken),
        "quiz_correct_streak_broken_today": float(today_streak_broken),
        "quiz_llm_stress_signal": round(
            sum(llm_stress_values) / len(llm_stress_values), 4
        ) if llm_stress_values else 0.0,
        "quiz_llm_stress_signal_today": round(
            sum(today_llm_stress_values) / len(today_llm_stress_values), 4
        ) if today_llm_stress_values else 0.0,
        "quiz_llm_confusion_keywords": float(sum(llm_confusion_values)),
        "quiz_llm_confusion_keywords_today": float(sum(today_llm_confusion_values)),
    }

    summary = {
        "attempts_recorded": len(attempts),
        "generated_total": len(quiz_entries),
        "attempts_today": today_attempts,
        "avg_score": metrics["avg_quiz_score"],
        "quiz_improvement": metrics["quiz_improvement"],
        "avg_time_per_question": metrics["quiz_avg_time_per_question"],
        "difficulty_drop": metrics["quiz_difficulty_drop"],
        "correct_streak_broken": metrics["quiz_correct_streak_broken"],
    }
    return metrics, summary


def _normalize_chatbot_text(value: Optional[str]) -> str:
    return " ".join((value or "").strip().lower().split())


def _extract_chatbot_metrics(signals: dict, today: datetime.date) -> tuple[dict, dict]:
    today_events = []
    for event in (signals.get("chatbot_events") or []):
        if not isinstance(event, dict):
            continue
        asked_at = _parse_iso_datetime(event.get("asked_at"))
        if asked_at and _to_local_datetime(asked_at).date() == today:
            today_events.append(event)

    normalized_messages = [
        _normalize_chatbot_text(event.get("message"))
        for event in today_events
        if _normalize_chatbot_text(event.get("message"))
    ]
    repeated_count = max(0, len(normalized_messages) - len(set(normalized_messages)))
    repeated_ratio = (repeated_count / len(normalized_messages)) if normalized_messages else 0.0
    llm_stress_values = [
        float(event.get("llm_stress_signal", 0) or 0)
        for event in today_events
    ]
    llm_confusion_values = [
        float(event.get("llm_confusion_keywords", 0) or 0)
        for event in today_events
    ]

    metrics = {
        "chatbot_questions_today": float(len(today_events)),
        "repeated_question_ratio": round(repeated_ratio, 4),
        "chatbot_llm_stress_signal": round(
            sum(llm_stress_values) / len(llm_stress_values), 4
        ) if llm_stress_values else 0.0,
        "chatbot_llm_confusion_keywords": float(sum(llm_confusion_values)),
    }
    summary = {
        "questions_today": len(today_events),
        "repeated_question_ratio": metrics["repeated_question_ratio"],
    }
    return metrics, summary


def _extract_constellation_metrics(user_id: str, notes: list[dict]) -> tuple[dict, dict]:
    graphs = get_topic_graphs_by_user(user_id)
    total_nodes = 0
    unvisited_nodes = 0
    stale_nodes = 0
    completed_nodes = 0

    note_topics = set()
    for note in notes:
        for concept in (note.get("concepts", []) or []):
            key = _normalize_chatbot_text(concept)
            if key:
                note_topics.add(key)
        for concept in ((note.get("explanation_structured") or {}).get("concepts", []) or []):
            key = _normalize_chatbot_text(concept.get("term") or concept.get("term_en"))
            if key:
                note_topics.add(key)
        raw_topic = note.get("topic")
        if isinstance(raw_topic, str):
            for topic in raw_topic.split(","):
                key = _normalize_chatbot_text(topic)
                if key:
                    note_topics.add(key)

    for graph in graphs:
        graph_data = graph.get("graph", {}) or {}
        stored_states = graph.get("node_states") or {}
        labels = set(stored_states.keys())
        for topic, dependents in graph_data.items():
            if topic:
                labels.add(topic)
            if isinstance(dependents, list):
                for child in dependents:
                    if child:
                        labels.add(child)

        for label in labels:
            node = stored_states.get(label) or {}
            if not isinstance(node, dict):
                node = {}
            normalized_label = _normalize_chatbot_text(label)
            is_in_uploaded_notes = bool(normalized_label in note_topics)
            is_marked_done = bool(node.get("is_marked_done"))
            total_nodes += 1
            if is_marked_done and is_in_uploaded_notes:
                completed_nodes += 1
            if (not is_marked_done) and (not is_in_uploaded_notes):
                unvisited_nodes += 1
            if not is_marked_done:
                stale_nodes += 1

    metrics = {
        "unvisited_topic_ratio": round(unvisited_nodes / total_nodes, 4) if total_nodes else 0.0,
        "stale_constellation_topics": float(stale_nodes),
        "concepts_total": float(total_nodes),
        "concepts_completed": float(completed_nodes),
        "concept_completion_rate": round(completed_nodes / total_nodes, 4) if total_nodes else 0.0,
    }
    summary = {
        "total_topics": total_nodes,
        "unvisited_topics": unvisited_nodes,
        "stale_topics": stale_nodes,
        "completed_topics": completed_nodes,
    }
    return metrics, summary


def _extract_explanation_metrics(signals: dict, notes: list[dict], today: datetime.date) -> tuple[dict, dict]:
    today_events = []
    for event in (signals.get("explanation_events") or []):
        if not isinstance(event, dict):
            continue
        occurred_at = _parse_iso_datetime(event.get("occurred_at"))
        if occurred_at and _to_local_datetime(occurred_at).date() == today:
            today_events.append(event)

    revisit_count = sum(1 for event in today_events if event.get("type") == "explanation_revisit")
    translation_used = sum(1 for event in today_events if event.get("type") == "translation_used")
    audio_loops = sum(1 for event in today_events if event.get("type") == "audio_playback_loop")

    today_notes = []
    for note in notes:
        created_at = _parse_iso_datetime(note.get("created_at"))
        if created_at and _to_local_datetime(created_at).date() == today:
            today_notes.append(note)

    llm_stress_values = [
        float(note.get("llm_stress_signal", 0) or 0)
        for note in today_notes
        if note.get("llm_stress_signal") is not None
    ]
    llm_confusion_keywords = sum(
        float(note.get("llm_confusion_keywords", 0) or 0)
        for note in today_notes
    )

    metrics = {
        "explanation_revisit_count": float(revisit_count),
        "explanation_llm_stress_signal": round(
            sum(llm_stress_values) / len(llm_stress_values), 4
        ) if llm_stress_values else 0.0,
        "explanation_llm_confusion_keywords": float(llm_confusion_keywords),
        "translation_used": float(translation_used),
        "audio_playback_loops": float(audio_loops),
    }
    summary = {
        "revisits_today": revisit_count,
        "translations_today": translation_used,
        "audio_loops_today": audio_loops,
    }
    return metrics, summary


def _extract_dna_metrics(
    *,
    signals: dict,
    notes: list[dict],
    subject_statuses: dict,
    today: datetime.date,
    activity_dates: set[datetime.date],
    constellation_metrics: dict,
    quiz_metrics: dict,
) -> tuple[dict, dict]:
    note_confusions = [
        float(note.get("mean_confusion", 0) or 0)
        for note in notes
        if note.get("mean_confusion") is not None
    ]
    latest_activity = max(activity_dates) if activity_dates else today
    days_since_last = max(0, (today - latest_activity).days)

    quiz_load_events = []
    for event in (signals.get("quiz_load_events") or []):
        if not isinstance(event, dict):
            continue
        loaded_at = _parse_iso_datetime(event.get("loaded_at"))
        if loaded_at:
            quiz_load_events.append({
                **event,
                "_loaded_at": loaded_at,
            })
    retry_loads = sum(1 for event in quiz_load_events if event.get("is_retry"))
    total_starts = int(quiz_metrics.get("quiz_generated_total", 0) or 0) + retry_loads
    quiz_retry_rate = round(retry_loads / total_starts, 4) if total_starts else 0.0

    metrics = {
        "audio_replays": float(signals.get("audio_replays", 0) or 0),
        "quiz_attempts": float(quiz_metrics.get("quiz_attempts_total", 0) or 0),
        "avg_quiz_score": float(quiz_metrics.get("avg_quiz_score", 50.0) or 50.0),
        "notes_viewed": float(signals.get("notes_viewed", 0) or 0),
        "heatmap_views": float(signals.get("heatmap_views", 0) or 0),
        "red_zone_clicks": float(signals.get("red_zone_clicks", 0) or 0),
        "login_streak": float(_days_since_last_break(activity_dates, today)),
        "days_since_last": float(days_since_last),
        "total_study_minutes": float(sum(
            float(value or 0)
            for value in (signals.get("daily_study_minutes") or {}).values()
        )),
        "quiz_retry_rate": float(quiz_retry_rate),
        "quiz_improvement": float(quiz_metrics.get("quiz_improvement", 0.0) or 0.0),
        "time_on_explanation": float(signals.get("time_on_explanation", 0.0) or 0.0),
        "upload_count": float(len(notes)),
        "mean_confusion": round(sum(note_confusions) / len(note_confusions), 4) if note_confusions else 0.0,
        "subjects_count": float(len(subject_statuses)),
        "concepts_total": float(constellation_metrics.get("concepts_total", 0) or 0),
        "concepts_completed": float(constellation_metrics.get("concepts_completed", 0) or 0),
        "concept_completion_rate": float(constellation_metrics.get("concept_completion_rate", 0.0) or 0.0),
    }
    summary = {
        "quiz_retries": retry_loads,
        "quiz_retry_rate": metrics["quiz_retry_rate"],
        "days_since_last": metrics["days_since_last"],
        "login_streak": metrics["login_streak"],
        "subjects_count": metrics["subjects_count"],
        "concept_completion_rate": metrics["concept_completion_rate"],
    }
    return metrics, summary


def build_predict_params_for_user(user_id: str, *, touch_session: bool = False) -> dict:
    signals = _touch_session_signal(user_id) if touch_session else (
        get_signals(user_id) or _default_signal_document(user_id)
    )
    signals["session_events"] = _normalize_session_events(
        list(signals.get("session_events", []))
    )
    if signals["session_events"] and not signals.get("last_session_started_at"):
        signals["last_session_started_at"] = signals["session_events"][-1]
    notes = get_notes_by_user(user_id)
    user = get_user_by_id(user_id) or {}
    today = _local_now().date()
    today_iso = today.isoformat()

    subject_statuses = _normalize_subject_statuses(user)
    notes_by_subject = {}
    for note in notes:
        subject = (note.get("subject") or "").strip()
        if not subject:
            continue
        created_at = _parse_iso_datetime(note.get("created_at"))
        previous = notes_by_subject.get(subject)
        if created_at and (previous is None or created_at > previous):
            notes_by_subject[subject] = created_at

    if notes_by_subject:
        changed = False
        for subject, last_seen in notes_by_subject.items():
            existing = subject_statuses.get(subject)
            if not existing:
                subject_statuses[subject] = {
                    "status": "active",
                    "last_activity_at": last_seen.isoformat(),
                    "last_activity_date": last_seen.date().isoformat(),
                }
                changed = True
            elif not existing.get("last_activity_at"):
                existing["last_activity_at"] = last_seen.isoformat()
                existing["last_activity_date"] = last_seen.date().isoformat()
                changed = True
        if changed:
            subjects = sorted(set((user.get("subjects") or []) + list(subject_statuses.keys())))
            update_user(user_id, {"subjects": subjects, "subject_statuses": subject_statuses})
            user = get_user_by_id(user_id) or user
            subject_statuses = _normalize_subject_statuses(user)

    session_events = [
        item for item in (
            _parse_iso_datetime(value)
            for value in (signals.get("session_events") or [])
        )
        if item
    ]
    local_session_events = [_to_local_datetime(item) for item in session_events]
    today_session_events = [item for item in local_session_events if item.date() == today]
    session_dates = {item.date() for item in local_session_events}
    explanation_event_dates = {
        _to_local_datetime(item).date()
        for item in (
            _parse_iso_datetime(event.get("occurred_at"))
            for event in (signals.get("explanation_events") or [])
            if isinstance(event, dict)
        )
        if item
    }
    quiz_event_dates = {
        _to_local_datetime(item).date()
        for item in (
            _parse_iso_datetime(event.get("loaded_at"))
            for event in (signals.get("quiz_load_events") or [])
            if isinstance(event, dict)
        )
        if item
    }

    daily_study_minutes = {}
    for day, minutes in (signals.get("daily_study_minutes") or {}).items():
        try:
            daily_study_minutes[str(day)] = float(minutes or 0)
        except Exception:
            daily_study_minutes[str(day)] = 0.0

    total_study_minutes = round(sum(daily_study_minutes.values()), 2)
    today_study_minutes = float(daily_study_minutes.get(today_iso, 0.0))
    history_days = [
        (today - datetime.timedelta(days=offset)).isoformat()
        for offset in range(1, 8)
    ]
    history_values = [float(daily_study_minutes.get(day, 0.0)) for day in history_days]
    history_avg = (sum(history_values) / len(history_values)) if history_values else 0.0
    if history_avg > 0:
        study_minutes_vs_7day_avg = round(today_study_minutes / history_avg, 4)
    elif today_study_minutes > 0:
        study_minutes_vs_7day_avg = 1.0
    else:
        study_minutes_vs_7day_avg = 0.0

    notes_uploaded_today = 0
    confusion_scores_today = []
    paragraph_confusion_scores = []
    red_paragraphs = 0
    all_paragraphs = 0
    note_dates = set()

    for note in notes:
        created_at = _parse_iso_datetime(note.get("created_at"))
        is_today_note = False
        if created_at:
            local_created_at = _to_local_datetime(created_at)
            note_dates.add(local_created_at.date())
            if local_created_at.date() == today:
                is_today_note = True
                notes_uploaded_today += 1
                if note.get("mean_confusion") is not None:
                    confusion_scores_today.append(float(note.get("mean_confusion") or 0))
        raw_quiz_attempts = note.get("quiz_attempts") or []
        if not isinstance(raw_quiz_attempts, list):
            raw_quiz_attempts = []
        for attempt in raw_quiz_attempts:
            if not isinstance(attempt, dict):
                continue
            attempted_at = _parse_iso_datetime(attempt.get("attempted_at"))
            if attempted_at:
                quiz_event_dates.add(_to_local_datetime(attempted_at).date())

        if not is_today_note:
            continue

        for para in ((note.get("structured_content") or {}).get("paragraphs", []) or []):
            all_paragraphs += 1
            confusion_label = str(para.get("confusion_label") or "").strip().lower()
            confusion_color = str(para.get("confusion_color") or "").strip().lower()
            confusion_score = para.get("confusion_score")
            is_red_zone = (
                confusion_label in {"red", "confused", "high"}
                or confusion_color in {"#ff4f4f", "#ff5050"}
            )
            if not is_red_zone and confusion_score is not None:
                try:
                    is_red_zone = float(confusion_score or 0) >= 0.35
                except Exception:
                    is_red_zone = False
            if is_red_zone:
                red_paragraphs += 1
            if confusion_score is not None:
                try:
                    paragraph_confusion_scores.append(float(confusion_score or 0))
                except Exception:
                    pass

    reread_events_today = [
        item for item in (
            _parse_iso_datetime(value)
            for value in (signals.get("reread_events") or [])
        )
        if item and _to_local_datetime(item).date() == today
    ]

    quiz_metrics, quiz_summary = _extract_quiz_metrics(notes, today)
    chatbot_metrics, chatbot_summary = _extract_chatbot_metrics(signals, today)
    constellation_metrics, constellation_summary = _extract_constellation_metrics(user_id, notes)
    explanation_metrics, explanation_summary = _extract_explanation_metrics(signals, notes, today)
    activity_dates = session_dates | note_dates | explanation_event_dates | quiz_event_dates
    dna_metrics, dna_summary = _extract_dna_metrics(
        signals=signals,
        notes=notes,
        subject_statuses=subject_statuses,
        today=today,
        activity_dates=activity_dates,
        constellation_metrics=constellation_metrics,
        quiz_metrics=quiz_metrics,
    )

    exam_date = user.get("exam_date")
    days_to_exam = _days_to_exam_from_date(exam_date) if exam_date else user.get("days_to_exam", 30)
    subject_entries = [
        {
            "subject": subject,
            "status": entry.get("status", "pending"),
            "last_activity_date": entry.get("last_activity_date"),
        }
        for subject, entry in sorted(subject_statuses.items())
    ]

    predict_params = {
        "days_to_exam": float(days_to_exam),
        "pending_subjects_count": float(sum(1 for entry in subject_statuses.values() if entry.get("status") == "pending")),
        "subjects_active_today": float(sum(1 for entry in subject_statuses.values() if entry.get("last_activity_date") == today_iso)),
        "total_study_minutes": float(today_study_minutes),
        "study_minutes_vs_7day_avg": float(study_minutes_vs_7day_avg),
        "sessions_count": float(len(today_session_events)),
        "night_sessions": float(sum(1 for item in today_session_events if item.hour >= 22)),
        "early_morning_sessions": float(sum(1 for item in today_session_events if item.hour < 6)),
        "days_since_last_break": float(dna_metrics["login_streak"]),
        "notes_uploaded_today": float(notes_uploaded_today),
        "total_notes_uploaded": float(len(notes)),
        "reread_count": float(len(reread_events_today)),
        "avg_quiz_score": float(quiz_metrics["avg_quiz_score_today"]),
        "quiz_attempts_today": float(quiz_metrics["quiz_attempts_today"]),
        "quiz_difficulty_drop": float(quiz_metrics["quiz_difficulty_drop_today"]),
        "quiz_avg_time_per_question": float(quiz_metrics["quiz_avg_time_per_question_today"]),
        "quiz_correct_streak_broken": float(quiz_metrics["quiz_correct_streak_broken_today"]),
        "quiz_llm_stress_signal": float(quiz_metrics["quiz_llm_stress_signal_today"]),
        "quiz_llm_confusion_keywords": float(quiz_metrics["quiz_llm_confusion_keywords_today"]),
        "confusion_score_today": float(
            round(sum(confusion_scores_today) / len(confusion_scores_today), 4)
            if confusion_scores_today else 0.0
        ),
        "heatmap_red_ratio": float(
            round(red_paragraphs / all_paragraphs, 4) if all_paragraphs else 0.0
        ),
        "max_page_confusion_score": float(
            round(max(paragraph_confusion_scores or confusion_scores_today or [0.0]), 4)
        ),
        "unvisited_topic_ratio": float(constellation_metrics["unvisited_topic_ratio"]),
        "stale_constellation_topics": float(constellation_metrics["stale_constellation_topics"]),
        "chatbot_questions_today": float(chatbot_metrics["chatbot_questions_today"]),
        "repeated_question_ratio": float(chatbot_metrics["repeated_question_ratio"]),
        "chatbot_llm_stress_signal": float(chatbot_metrics["chatbot_llm_stress_signal"]),
        "chatbot_llm_confusion_keywords": float(chatbot_metrics["chatbot_llm_confusion_keywords"]),
        "explanation_revisit_count": float(explanation_metrics["explanation_revisit_count"]),
        "explanation_llm_stress_signal": float(explanation_metrics["explanation_llm_stress_signal"]),
        "explanation_llm_confusion_keywords": float(explanation_metrics["explanation_llm_confusion_keywords"]),
        "translation_used": float(explanation_metrics["translation_used"]),
        "audio_playback_loops": float(explanation_metrics["audio_playback_loops"]),
    }
    predict_params = _apply_stress_predict_overrides(user_id, predict_params)
    days_to_exam = int(round(float(predict_params.get("days_to_exam", days_to_exam) or days_to_exam)))

    dna_params = {
        "audio_replays": float(dna_metrics["audio_replays"]),
        "quiz_attempts": float(dna_metrics["quiz_attempts"]),
        "avg_quiz_score": float(dna_metrics["avg_quiz_score"]),
        "notes_viewed": float(dna_metrics["notes_viewed"]),
        "heatmap_views": float(dna_metrics["heatmap_views"]),
        "red_zone_clicks": float(dna_metrics["red_zone_clicks"]),
        "login_streak": float(dna_metrics["login_streak"]),
        "days_since_last": float(dna_metrics["days_since_last"]),
        "total_study_minutes": float(dna_metrics["total_study_minutes"]),
        "quiz_retry_rate": float(dna_metrics["quiz_retry_rate"]),
        "quiz_improvement": float(dna_metrics["quiz_improvement"]),
        "time_on_explanation": float(dna_metrics["time_on_explanation"]),
        "upload_count": float(dna_metrics["upload_count"]),
        "mean_confusion": float(dna_metrics["mean_confusion"]),
        "subjects_count": float(dna_metrics["subjects_count"]),
        "concepts_total": float(dna_metrics["concepts_total"]),
        "concepts_completed": float(dna_metrics["concepts_completed"]),
        "concept_completion_rate": float(dna_metrics["concept_completion_rate"]),
    }

    return {
        "days_to_exam": days_to_exam,
        "predict_params": predict_params,
        "dna_params": dna_params,
        "subject_statuses": subject_entries,
        "tracking_summary": {
            "study": {
                "today_minutes": today_study_minutes,
                "daily_minutes_last_7_days": {
                    day: round(float(daily_study_minutes.get(day, 0.0)), 2)
                    for day in sorted(history_days + [today_iso])
                },
                "sessions_count": len(local_session_events),
                "last_session_started_at": signals.get("last_session_started_at"),
            },
            "notes": {
                "notes_uploaded_today": notes_uploaded_today,
                "total_notes_uploaded": len(notes),
                "reread_events_today": len(reread_events_today),
            },
            "quiz": quiz_summary,
            "constellation": constellation_summary,
            "chatbot": chatbot_summary,
            "explanation": explanation_summary,
            "dna": dna_summary,
        },
    }


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Optional[dict]:
    return ensure_default_user()


def get_optional_user_from_auth_header(authorization: Optional[str]) -> Optional[dict]:
    return ensure_default_user()


def require_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    return ensure_default_user()


def ensure_default_user() -> dict:
    existing = get_user_by_id(DEFAULT_USER_ID)
    if not existing:
        create_user({
            "id": DEFAULT_USER_ID,
            "name": DEFAULT_USER_NAME,
            "email": DEFAULT_USER_EMAIL,
            "password_hash": _hash_password("prototype-default"),
            "subjects": [],
            "subject_statuses": {},
            "language": "hi-en",
            "days_to_exam": 30,
            "exam_date": None,
            "created_at": time.time(),
        })
    return {"user_id": DEFAULT_USER_ID, "email": DEFAULT_USER_EMAIL}


@router.post("/signup")
def signup(req: SignupRequest):
    ensure_default_user()
    user = get_user_by_id(DEFAULT_USER_ID) or {}
    return {
        "token": DEFAULT_TOKEN,
        "user": {
            "user_id": DEFAULT_USER_ID,
            "name": user.get("name", DEFAULT_USER_NAME),
            "email": user.get("email", DEFAULT_USER_EMAIL),
            "subjects": user.get("subjects", []),
            "language": user.get("language", "hi-en"),
            "exam_date": user.get("exam_date"),
        },
    }


@router.post("/login")
def login(req: LoginRequest):
    user = get_user_by_id(DEFAULT_USER_ID)
    if not user:
        ensure_default_user()
        user = get_user_by_id(DEFAULT_USER_ID)
    return {
        "token": DEFAULT_TOKEN,
        "user": {
            "user_id": DEFAULT_USER_ID,
            "name": user.get("name", DEFAULT_USER_NAME),
            "email": user.get("email", DEFAULT_USER_EMAIL),
            "subjects": user.get("subjects", []),
            "language": user.get("language", "hi-en"),
            "exam_date": user.get("exam_date"),
        },
    }


@router.get("/me")
def get_me(current_user: dict = Depends(require_user)):
    user = get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    snapshot = build_predict_params_for_user(current_user["user_id"], touch_session=True)

    return {
        "user_id": user["id"],
        "name": user.get("name"),
        "email": user["email"],
        "language": user.get("language", "hi-en"),
        "exam_date": user.get("exam_date"),
        "days_to_exam": snapshot["days_to_exam"],
        "days_since_last_break": snapshot["predict_params"].get("days_since_last_break", 0),
        "sessions_count": snapshot["predict_params"].get("sessions_count", 0),
        "subjects": user.get("subjects", []),
        "subject_statuses": snapshot["subject_statuses"],
        "predict_params": snapshot["predict_params"],
        "tracking_summary": snapshot["tracking_summary"],
    }


@router.patch("/preferences")
def update_preferences(
    req: PreferencesRequest,
    current_user: dict = Depends(require_user),
):
    user = get_user_by_id(current_user["user_id"]) or {}
    subject_statuses = _normalize_subject_statuses(user)
    next_subject_statuses = {}
    for subject in req.subjects or []:
        existing = subject_statuses.get(subject) or {}
        next_subject_statuses[subject] = {
            "status": existing.get("status", "pending"),
            "last_activity_at": existing.get("last_activity_at"),
            "last_activity_date": existing.get("last_activity_date"),
        }

    exam_date = req.exam_date
    days_to_exam = _days_to_exam_from_date(exam_date) if exam_date else req.days_to_exam

    update_user(current_user["user_id"], {
        "subjects": req.subjects,
        "subject_statuses": next_subject_statuses,
        "language": req.language,
        "days_to_exam": days_to_exam,
        "exam_date": exam_date,
    })
    return {
        "status": "ok",
        "days_to_exam": days_to_exam,
        "exam_date": exam_date,
    }

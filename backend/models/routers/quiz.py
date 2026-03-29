from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from services.quiz_generator import generate_quiz
from services.cosmos_db import (
    get_note,
    update_note,
    get_user_by_id,
    get_notes_by_user,
    get_signals,
    upsert_signals_document,
)
import uuid
import time
import datetime
from routers.users import get_current_user
from routers.notes import _explanation_translation_map

router = APIRouter()


# ═══════════════════════════════════════
# Request Models
# ═══════════════════════════════════════

class QuizRequest(BaseModel):
    note_id: str
    num_questions: int = 5
    difficulty: str = "mixed"
    user_message: str | None = None


class QuizSubmit(BaseModel):
    note_id: str
    user_id: str
    quiz_id: str
    answers: dict  # {question_id: selected_option_index}
    time_spent_seconds: int = 0  # Time spent on quiz


def _coerce_datetime(value: str | None) -> datetime.datetime:
    if not value:
        return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=datetime.timezone.utc)
        return parsed.astimezone(datetime.timezone.utc)
    except Exception:
        return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)


def _attempt_signature(attempt: dict) -> tuple:
    return (
        attempt.get("quiz_id"),
        attempt.get("user_id"),
        round(float(attempt.get("score", 0) or 0), 4),
        int(attempt.get("correct", 0) or 0),
        int(attempt.get("total", 0) or 0),
        int(attempt.get("time_spent_seconds", 0) or 0),
    )


def _dedupe_attempts(attempts: list[dict]) -> list[dict]:
    deduped = []
    seen = set()
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        try:
            attempted_at = datetime.datetime.fromisoformat(
                attempt.get("attempted_at", "").replace("Z", "+00:00")
            ).replace(microsecond=0)
        except Exception:
            attempted_at = None
        signature = _attempt_signature(attempt) + (attempted_at,)
        if signature in seen:
            continue
        seen.add(signature)
        deduped.append(attempt)
    return deduped


def _extract_note_concepts(note: dict) -> list[str]:
    raw_concepts = (note.get("explanation_structured", {}) or {}).get("concepts", [])
    if not isinstance(raw_concepts, list):
        return []
    concepts = []
    seen = set()
    for item in raw_concepts:
        if isinstance(item, dict):
            value = item.get("name") or item.get("concept") or item.get("title")
        else:
            value = item
        if not value:
            continue
        normalized = str(value).strip()
        lowered = normalized.lower()
        if not normalized or lowered in seen:
            continue
        seen.add(lowered)
        concepts.append(normalized)
    return concepts[:12]


def _quiz_concepts_payload(note: dict) -> list[dict]:
    raw_concepts = (note.get("explanation_structured", {}) or {}).get("concepts", [])
    if not isinstance(raw_concepts, list):
        return []

    normalized = []
    for item in raw_concepts:
        if not isinstance(item, dict):
            continue
        concept = dict(item)
        concept["term"] = concept.get("term") or concept.get("term_en") or ""
        concept["definition"] = concept.get("definition") or concept.get("definition_en") or ""
        concept["example"] = concept.get("example") or concept.get("example_en") or ""
        concept["context"] = concept.get("context") or concept.get("context_en") or ""
        normalized.append(concept)
    return normalized


def _attempts_for_quiz(note: dict, quiz_id: str) -> list[dict]:
    quiz_attempts = note.get("quiz_attempts", [])
    if not isinstance(quiz_attempts, list):
        return []
    attempts = [
        attempt for attempt in _dedupe_attempts(quiz_attempts)
        if isinstance(attempt, dict) and attempt.get("quiz_id") == quiz_id
    ]
    attempts.sort(key=lambda item: _coerce_datetime(item.get("attempted_at")), reverse=True)
    return attempts


def _build_quiz_history_summary(note: dict, quiz_entry: dict, attempts_for_quiz: list[dict]) -> dict:
    scores = [
        float(attempt.get("score", 0) or 0)
        for attempt in attempts_for_quiz
        if isinstance(attempt, dict)
    ]
    latest_attempt = attempts_for_quiz[0] if attempts_for_quiz else None
    return {
        "quiz_id": quiz_entry.get("quiz_id"),
        "note_id": note.get("id"),
        "subject": note.get("subject") or "General",
        "note_topic": note.get("topic") or note.get("file_name") or note.get("id") or "Untitled Note",
        "generated_at": quiz_entry.get("generated_at"),
        "difficulty": quiz_entry.get("difficulty") or "mixed",
        "num_questions": int(quiz_entry.get("num_questions") or len(quiz_entry.get("quiz_data", []) or [])),
        "concepts": _extract_note_concepts(note),
        "num_attempts": len(attempts_for_quiz),
        "best_score": max(scores) if scores else 0.0,
        "avg_score": (sum(scores) / len(scores)) if scores else 0.0,
        "latest_score": float((latest_attempt or {}).get("score", 0) or 0),
        "latest_attempted_at": (latest_attempt or {}).get("attempted_at"),
    }


def _prune_zero_attempt_quizzes(note: dict) -> tuple[list[dict], list[dict], bool]:
    quizzes_generated = note.get("quizzes_generated", [])
    if not isinstance(quizzes_generated, list):
        quizzes_generated = []
    quiz_attempts = note.get("quiz_attempts", [])
    if not isinstance(quiz_attempts, list):
        quiz_attempts = []
    quiz_attempts = _dedupe_attempts(quiz_attempts)

    kept_quizzes = []
    kept_ids = set()
    for quiz_entry in quizzes_generated:
        if not isinstance(quiz_entry, dict):
            continue
        quiz_id = quiz_entry.get("quiz_id")
        if not quiz_id:
            continue
        attempts_for_quiz = [
            attempt for attempt in quiz_attempts
            if isinstance(attempt, dict) and attempt.get("quiz_id") == quiz_id
        ]
        if not attempts_for_quiz:
            continue
        kept_quizzes.append(quiz_entry)
        kept_ids.add(quiz_id)

    kept_attempts = [
        attempt for attempt in quiz_attempts
        if isinstance(attempt, dict) and attempt.get("quiz_id") in kept_ids
    ]
    changed = len(kept_quizzes) != len(quizzes_generated) or len(kept_attempts) != len(quiz_attempts)
    return kept_quizzes, kept_attempts, changed


def _persist_pruned_note(note: dict) -> dict:
    quizzes_generated, quiz_attempts, changed = _prune_zero_attempt_quizzes(note)
    if not changed:
        return note

    updates = {
        "quizzes_generated": quizzes_generated,
        "quiz_attempts": quiz_attempts,
        "quiz_attempts_count": len(quiz_attempts),
    }
    replacement = quizzes_generated[-1] if quizzes_generated else {}
    updates["last_quiz_id"] = replacement.get("quiz_id")
    updates["last_quiz_data"] = replacement.get("quiz_data")
    updated = update_note(note.get("id"), updates)
    return updated or {**note, **updates}


def _sorted_quiz_history_items(items: list[dict]) -> list[dict]:
    return sorted(
        [item for item in items if isinstance(item, dict) and item.get("quiz_id")],
        key=lambda item: max(
            _coerce_datetime(item.get("latest_attempted_at")),
            _coerce_datetime(item.get("generated_at")),
        ),
        reverse=True,
    )


def _sync_quiz_history_for_user(user_id: str, notes: list[dict] | None = None) -> list[dict]:
    notes = notes if notes is not None else get_notes_by_user(user_id)
    history = []
    for note in notes or []:
        if not isinstance(note, dict):
            continue
        note = _persist_pruned_note(note)
        quizzes_generated = note.get("quizzes_generated", [])
        if not isinstance(quizzes_generated, list):
            continue
        for quiz_entry in quizzes_generated:
            if not isinstance(quiz_entry, dict) or not quiz_entry.get("quiz_id"):
                continue
            attempts_for_quiz = _attempts_for_quiz(note, quiz_entry["quiz_id"])
            history.append(_build_quiz_history_summary(note, quiz_entry, attempts_for_quiz))

    history = _sorted_quiz_history_items(history)
    signals = get_signals(user_id) or {
        "id": f"signals_{user_id}",
        "user_id": user_id,
    }
    signals["quiz_history"] = history
    upsert_signals_document(signals)
    return history


def _upsert_quiz_history_entry(user_id: str, summary_entry: dict) -> None:
    if not user_id or not summary_entry.get("quiz_id"):
        return
    signals = get_signals(user_id) or {
        "id": f"signals_{user_id}",
        "user_id": user_id,
    }
    history = [
        item for item in list(signals.get("quiz_history", []))
        if isinstance(item, dict) and item.get("quiz_id") != summary_entry.get("quiz_id")
    ]
    history.append(summary_entry)
    signals["quiz_history"] = _sorted_quiz_history_items(history)
    upsert_signals_document(signals)


def _remove_quiz_history_entry(user_id: str, quiz_id: str) -> None:
    if not user_id or not quiz_id:
        return
    signals = get_signals(user_id) or {
        "id": f"signals_{user_id}",
        "user_id": user_id,
    }
    signals["quiz_history"] = [
        item for item in list(signals.get("quiz_history", []))
        if isinstance(item, dict) and item.get("quiz_id") != quiz_id
    ]
    upsert_signals_document(signals)


# ═══════════════════════════════════════
# Generate Quiz
# ═══════════════════════════════════════

@router.post("/generate")
def generate_quiz_endpoint(req: QuizRequest):

    note = get_note(req.note_id)

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    explanation = _explanation_translation_map(note.get("explanation_structured")).get("en")
    concepts = _quiz_concepts_payload(note)

    if not explanation:
        raise HTTPException(status_code=400, detail="Explanation not available yet")

    quiz = generate_quiz(
        explanation=explanation,
        concepts=concepts,
        num_questions=req.num_questions,
        difficulty=req.difficulty,
        user_message=req.user_message,
    )

    quiz_id = str(uuid.uuid4())
    
    # Store quiz in a list of generated quizzes - ensure it's a list (defend against old data format)
    existing_quizzes = note.get("quizzes_generated", [])
    if not isinstance(existing_quizzes, list):
        existing_quizzes = []
    llm_stress_signal = float(note.get("llm_stress_signal", 0.0) or 0.0)
    llm_confusion_keywords = float(note.get("llm_confusion_keywords", 0.0) or 0.0)

    new_quiz_entry = {
        "quiz_id": quiz_id,
        "quiz_data": quiz,
        "generated_at": datetime.datetime.now().isoformat(),
        "difficulty": req.difficulty,
        "num_questions": req.num_questions,
        "user_message": req.user_message,
        "llm_stress_signal": llm_stress_signal,
        "llm_confusion_keywords": llm_confusion_keywords,
    }
    existing_quizzes.append(new_quiz_entry)

    update_note(
        req.note_id,
        {
            "quizzes_generated": existing_quizzes,
            "last_quiz_id": quiz_id,  # For backward compatibility
            "last_quiz_data": quiz,  # For backward compatibility
        },
    )

    user_id = note.get("user_id")
    if user_id:
        _upsert_quiz_history_entry(
            user_id,
            _build_quiz_history_summary(note, new_quiz_entry, []),
        )

    return {
        "quiz_id": quiz_id,
        "quiz": quiz,
    }


# ═══════════════════════════════════════
# Get Specific Quiz by Quiz ID
# ═══════════════════════════════════════

@router.get("/load/{note_id}/{quiz_id}")
def load_quiz(
    note_id: str,
    quiz_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Load an existing quiz by its ID so users can retake it.
    Returns the quiz data and metadata.
    """
    note = get_note(note_id)
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note = _persist_pruned_note(note)
    
    quizzes_generated = note.get("quizzes_generated", [])
    if not isinstance(quizzes_generated, list):
        quizzes_generated = []
    
    # Find the quiz with matching quiz_id
    quiz_entry = None
    for q in quizzes_generated:
        if isinstance(q, dict) and q.get("quiz_id") == quiz_id:
            quiz_entry = q
            break
    
    if not quiz_entry:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # quiz_data is a list of questions, not a dict
    quiz_data = quiz_entry.get("quiz_data", [])
    if not isinstance(quiz_data, list):
        quiz_data = []
    questions = quiz_data
    
    # Find attempts for this quiz to show past performance
    quiz_attempts = note.get("quiz_attempts", [])
    if not isinstance(quiz_attempts, list):
        quiz_attempts = []
    quiz_attempts = _dedupe_attempts(quiz_attempts)
    quiz_attempts = _dedupe_attempts(quiz_attempts)

    attempts_for_quiz = [att for att in quiz_attempts if isinstance(att, dict) and att.get("quiz_id") == quiz_id]
    attempts_for_quiz.sort(key=lambda item: _coerce_datetime(item.get("attempted_at")), reverse=True)
    attempt_scores = [att.get("score", 0) for att in attempts_for_quiz if isinstance(att, dict)]

    user_id = note.get("user_id") or (current_user["user_id"] if current_user else None)
    if user_id:
        try:
            signals = get_signals(user_id) or {
                "id": f"signals_{user_id}",
                "user_id": user_id,
                "quiz_load_events": [],
            }
            quiz_load_events = list(signals.get("quiz_load_events", []))
            quiz_load_events.append({
                "quiz_id": quiz_id,
                "note_id": note_id,
                "loaded_at": datetime.datetime.utcnow().isoformat(),
                "is_retry": bool(attempts_for_quiz),
            })
            signals["quiz_load_events"] = quiz_load_events[-500:]
            upsert_signals_document(signals)
        except Exception as exc:
            print(f"[QUIZ LOAD TRACK] failed: {exc}")
    
    return {
        "quiz_id": quiz_id,
        "quiz": questions,
        "difficulty": quiz_entry.get("difficulty"),
        "num_questions": quiz_entry.get("num_questions"),
        "generated_at": quiz_entry.get("generated_at"),
        "previous_attempts": len(attempts_for_quiz),
        "best_score": max(attempt_scores) if attempt_scores else 0,
        "avg_score": sum(attempt_scores) / len(attempt_scores) if attempt_scores else 0,
    }


# ═══════════════════════════════════════
# Submit Quiz
# ═══════════════════════════════════════

@router.post("/submit")
def submit_quiz(req: QuizSubmit):

    note = get_note(req.note_id)

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Find the quiz with the given quiz_id
    quizzes_generated = note.get("quizzes_generated", [])
    quiz_entry = None
    for q in quizzes_generated:
        if q.get("quiz_id") == req.quiz_id:
            quiz_entry = q
            break
    
    if not quiz_entry:
        # Fallback for backward compatibility
        if note.get("last_quiz_id") == req.quiz_id:
            quiz_entry = {"quiz_data": note.get("last_quiz_data", [])}
        else:
            raise HTTPException(status_code=400, detail="Quiz not found")

    # quiz_data is a list of questions
    quiz_data = quiz_entry.get("quiz_data", [])
    if not isinstance(quiz_data, list):
        quiz_data = []
    questions = quiz_data

    # Calculate score
    correct = 0
    total = 0
    user_responses = []  # Track each response with correctness

    for q in questions:
        qid = str(q.get("id", total))
        total += 1
        user_answer = req.answers.get(qid)
        correct_answer = q.get("correct")
        options = q.get("options", []) if isinstance(q.get("options", []), list) else []
        selected_option_text = (
            options[user_answer]
            if isinstance(user_answer, int) and 0 <= user_answer < len(options)
            else None
        )
        correct_option_text = (
            options[correct_answer]
            if isinstance(correct_answer, int) and 0 <= correct_answer < len(options)
            else None
        )
        
        is_correct = user_answer == correct_answer
        if is_correct:
            correct += 1
        
        user_responses.append({
            "question_id": q.get("id"),
            "question": q.get("question"),
            "user_answer": user_answer,
            "selected_option_index": user_answer,
            "selected_option_text": selected_option_text,
            "correct_answer": correct_answer,
            "correct_option_text": correct_option_text,
            "options": options,
            "is_correct": is_correct,
            "difficulty": q.get("difficulty"),
            "concept": q.get("concept"),
        })

    score = (correct / total) * 100 if total > 0 else 0
    
    # Calculate quiz behavior signals for stress prediction
    avg_time_per_question = req.time_spent_seconds / total if total > 0 else 0
    
    # Create quiz attempt record
    quiz_attempt = {
        "quiz_id": req.quiz_id,
        "attempted_at": datetime.datetime.now().isoformat(),
        "user_id": req.user_id,
        "score": score,
        "correct": correct,
        "total": total,
        "time_spent_seconds": req.time_spent_seconds,
        "avg_time_per_question": avg_time_per_question,
        "difficulty": quiz_entry.get("difficulty"),
        "quiz_llm_stress_signal": quiz_entry.get("llm_stress_signal", 0.0),
        "quiz_llm_confusion_keywords": quiz_entry.get("llm_confusion_keywords", 0),
        "user_responses": user_responses,
    }
    
    # Store quiz attempt - ensure it's a list (defend against old data format)
    existing_attempts = note.get("quiz_attempts", [])
    if not isinstance(existing_attempts, list):
        existing_attempts = []
    existing_attempts = _dedupe_attempts(existing_attempts)

    latest_attempt = existing_attempts[-1] if existing_attempts else None
    latest_ts = None
    if isinstance(latest_attempt, dict):
        try:
            latest_ts = datetime.datetime.fromisoformat(
                latest_attempt.get("attempted_at", "").replace("Z", "+00:00")
            )
        except Exception:
            latest_ts = None

    should_append = True
    if latest_ts and _attempt_signature(latest_attempt) == _attempt_signature(quiz_attempt):
        current_ts = datetime.datetime.fromisoformat(quiz_attempt["attempted_at"])
        if abs((current_ts - latest_ts).total_seconds()) <= 10:
            should_append = False

    if should_append:
        existing_attempts.append(quiz_attempt)

    # Calculate quiz average for predict function
    all_scores = [att.get("score", 0) for att in existing_attempts if isinstance(att, dict)]
    avg_quiz_score = sum(all_scores) / len(all_scores) if all_scores else 0

    # Save result in note
    update_note(
        req.note_id,
        {
            "quiz_attempts": existing_attempts,
            "last_quiz_score": score,
            "last_quiz_correct": correct,
            "last_quiz_total": total,
            "avg_quiz_score": avg_quiz_score,
            "quiz_attempts_count": len(existing_attempts),
        },
    )

    user_id = note.get("user_id") or req.user_id
    if user_id:
        note_snapshot = dict(note)
        note_snapshot["quiz_attempts"] = existing_attempts
        _upsert_quiz_history_entry(
            user_id,
            _build_quiz_history_summary(note_snapshot, quiz_entry, _attempts_for_quiz(note_snapshot, req.quiz_id)),
        )

    return {
        "quiz_id": req.quiz_id,
        "score": score,
        "correct": correct,
        "total": total,
        "avg_time_per_question": avg_time_per_question,
    }


# ═══════════════════════════════════════
# Get All Quizzes for a Note (List + Predict Data)
# ═══════════════════════════════════════

@router.get("/by_note/{note_id}")
def get_quiz_by_noteid(note_id: str):
    """
    Get all generated quizzes for a note along with attempt history and predict-ready data.
    
    Returns list of quizzes with:
    - Quiz metadata and questions
    - Attempt history for each quiz
    - Predict function parameters
    """
    note = get_note(note_id)
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Ensure we have lists (defend against old data format where these might be integers/scalars)
    quizzes_generated = note.get("quizzes_generated", [])
    if not isinstance(quizzes_generated, list):
        quizzes_generated = []
    
    quiz_attempts = note.get("quiz_attempts", [])
    if not isinstance(quiz_attempts, list):
        quiz_attempts = []
    quiz_attempts = _dedupe_attempts(quiz_attempts)
    
    # Build response with quiz data and predict parameters
    quizzes_list = []
    
    for quiz_entry in quizzes_generated:
        if not isinstance(quiz_entry, dict):
            continue
            
        quiz_id = quiz_entry.get("quiz_id")
        
        # Find attempts for this quiz
        attempts_for_quiz = [att for att in quiz_attempts if isinstance(att, dict) and att.get("quiz_id") == quiz_id]
        attempts_for_quiz.sort(key=lambda item: _coerce_datetime(item.get("attempted_at")), reverse=True)
        
        # Calculate metrics for this quiz
        quiz_scores = [att.get("score", 0) for att in attempts_for_quiz if isinstance(att, dict)]
        quiz_item = {
            "quiz_id": quiz_id,
            "quiz_data": quiz_entry.get("quiz_data"),
            "generated_at": quiz_entry.get("generated_at"),
            "difficulty": quiz_entry.get("difficulty"),
            "num_questions": quiz_entry.get("num_questions"),
            "attempts": attempts_for_quiz,
            "num_attempts": len(attempts_for_quiz),
            "best_score": max(quiz_scores) if quiz_scores else 0,
            "avg_score": sum(quiz_scores) / len(quiz_scores) if quiz_scores else 0,
        }
        quizzes_list.append(quiz_item)

    quizzes_list.sort(
        key=lambda item: max(
            _coerce_datetime((item.get("attempts") or [{}])[0].get("attempted_at") if item.get("attempts") else None),
            _coerce_datetime(item.get("generated_at")),
        ),
        reverse=True,
    )
    
    # Aggregate predict function parameters from all attempts
    all_quiz_attempts = quiz_attempts
    all_scores = [att.get("score", 0) for att in all_quiz_attempts if isinstance(att, dict)]
    all_times = [att.get("avg_time_per_question", 30) for att in all_quiz_attempts if isinstance(att, dict)]
    
    # Extract confusion and stress signals from note
    user_id = note.get("user_id")
    user = get_user_by_id(user_id) if user_id else None
    
    predict_params = {
        "quiz_attempts_today": len([att for att in all_quiz_attempts 
                                   if isinstance(att, dict) and att.get("attempted_at", "").startswith(datetime.date.today().isoformat())]),
        "avg_quiz_score": sum(all_scores) / len(all_scores) if all_scores else 50.0,
        "quiz_avg_time_per_question": sum(all_times) / len(all_times) if all_times else 30.0,
        "confusion_score_today": note.get("mean_confusion", 0.5),
        "heatmap_red_regions": len([p for p in note.get("structured_content", {}).get("paragraphs", []) 
                                   if isinstance(p, dict) and p.get("confusion_label") == "red"]),
        "days_to_exam": user.get("days_to_exam", 30) if user else 30,
        "llm_stress_signal": note.get("llm_stress_signal", 0.0),
        "llm_confusion_keywords": note.get("llm_confusion_keywords", 0),
    }
    
    return {
        "note_id": note_id,
        "subject": note.get("subject") or "General",
        "note_topic": note.get("topic") or note.get("file_name") or note.get("id") or "Untitled Note",
        "quizzes": quizzes_list,
        "total_quizzes_generated": len(quizzes_generated),
        "total_quiz_attempts": len(quiz_attempts),
        "predict_params": predict_params,
    }


@router.get("/all")
def get_all_quiz(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user_id"]
    history = _sync_quiz_history_for_user(user_id)

    return {
        "user_id": user_id,
        "quizzes": history,
        "total_quizzes": len(history),
        "subjects_count": len({(item.get("subject") or "General") for item in history if isinstance(item, dict)}),
    }


@router.delete("/{note_id}/{quiz_id}")
def delete_saved_quiz(note_id: str, quiz_id: str):
    note = get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    quizzes_generated = note.get("quizzes_generated", [])
    if not isinstance(quizzes_generated, list):
        quizzes_generated = []

    quiz_attempts = note.get("quiz_attempts", [])
    if not isinstance(quiz_attempts, list):
        quiz_attempts = []
    quiz_attempts = _dedupe_attempts(quiz_attempts)
    quiz_attempts = _dedupe_attempts(quiz_attempts)

    next_quizzes = [
        quiz for quiz in quizzes_generated
        if isinstance(quiz, dict) and quiz.get("quiz_id") != quiz_id
    ]
    if len(next_quizzes) == len(quizzes_generated):
        raise HTTPException(status_code=404, detail="Quiz not found")

    next_attempts = [
        attempt for attempt in quiz_attempts
        if isinstance(attempt, dict) and attempt.get("quiz_id") != quiz_id
    ]

    updates = {
        "quizzes_generated": next_quizzes,
        "quiz_attempts": next_attempts,
    }

    if note.get("last_quiz_id") == quiz_id:
        replacement = next_quizzes[-1] if next_quizzes else {}
        updates["last_quiz_id"] = replacement.get("quiz_id")
        updates["last_quiz_data"] = replacement.get("quiz_data")

    update_note(note_id, updates)
    user_id = note.get("user_id")
    if user_id:
        _remove_quiz_history_entry(user_id, quiz_id)
    return {"status": "deleted", "note_id": note_id, "quiz_id": quiz_id}

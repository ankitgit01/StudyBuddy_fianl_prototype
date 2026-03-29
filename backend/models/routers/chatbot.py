from typing import Optional
import datetime
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from routers.users import DEFAULT_USER_ID
from routers.notes import _explanation_translation_map
from services.chatbot_service import get_chat_response_with_signals
from services.azure_speech import generate_audio_for_chat
from services.cosmos_db import get_note, get_signals, upsert_signals_document

router = APIRouter(prefix="/chat", tags=["chatbot"])


class ChatRequest(BaseModel):
    message: str
    note_id: Optional[str] = None
    context_type: Optional[str] = None
    is_audio: bool = False


def _build_quiz_context(note: dict) -> str:
    quizzes_generated = note.get("quizzes_generated") or []
    if not isinstance(quizzes_generated, list):
        quizzes_generated = []

    quiz_attempts = note.get("quiz_attempts") or []
    if not isinstance(quiz_attempts, list):
        quiz_attempts = []

    latest_attempt = None
    for attempt in quiz_attempts:
        if isinstance(attempt, dict):
            latest_attempt = attempt

    latest_quiz_id = latest_attempt.get("quiz_id") if isinstance(latest_attempt, dict) else note.get("last_quiz_id")
    quiz_entry = None
    if latest_quiz_id:
        for item in quizzes_generated:
            if isinstance(item, dict) and item.get("quiz_id") == latest_quiz_id:
                quiz_entry = item
                break

    quiz_data = []
    if isinstance(quiz_entry, dict) and isinstance(quiz_entry.get("quiz_data"), list):
        quiz_data = quiz_entry.get("quiz_data") or []
    elif isinstance(note.get("last_quiz_data"), list):
        quiz_data = note.get("last_quiz_data") or []

    context_payload = {
        "note_subject": note.get("subject"),
        "note_topic": note.get("topic"),
        "quiz_id": latest_quiz_id,
        "quiz_data": quiz_data,
        "latest_attempt": latest_attempt or {},
    }
    return json.dumps(context_payload, ensure_ascii=False)


def _append_chatbot_event(
    user_id: str,
    *,
    message: str,
    note_id: Optional[str],
    context_type: Optional[str],
    llm_stress_signal: float,
    llm_confusion_keywords: float,
):
    signals = get_signals(user_id) or {
        "id": f"signals_{user_id}",
        "user_id": user_id,
        "chatbot_events": [],
    }
    chatbot_events = list(signals.get("chatbot_events", []))
    chatbot_events.append({
        "asked_at": datetime.datetime.utcnow().isoformat(),
        "message": message,
        "note_id": note_id,
        "context_type": context_type,
        "llm_stress_signal": llm_stress_signal,
        "llm_confusion_keywords": llm_confusion_keywords,
    })
    signals["chatbot_events"] = chatbot_events[-500:]
    upsert_signals_document(signals)


@router.post("/")
def chat(req: ChatRequest):
    context = None
    user_id = DEFAULT_USER_ID
    audio_url = None

    if not req.note_id:
        result = get_chat_response_with_signals(req.message)

        is_audio = getattr(req, "is_audio", False)
        print("is_audio:", getattr(req, "is_audio", False))

        if is_audio:
            audio_url = generate_audio_for_chat(result["answer"])

        _append_chatbot_event(
            user_id,
            message=req.message,
            note_id=None,
            context_type=req.context_type,
            llm_stress_signal=result["llm_stress_signal"],
            llm_confusion_keywords=result["llm_confusion_keywords"],
        )
        return {
            "response": result["answer"],
            "chatbot_llm_stress_signal": result["llm_stress_signal"],
            "chatbot_llm_confusion_keywords": result["llm_confusion_keywords"],
            "audio_url": audio_url,
        }

    note = get_note(req.note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    user_id = note.get("user_id") or DEFAULT_USER_ID

    if req.context_type == "explanation":
        context = _explanation_translation_map(note.get("explanation_structured")).get("en") or ""
    elif req.context_type == "quiz":
        context = _build_quiz_context(note)

    result = get_chat_response_with_signals(req.message, context=context)
    if getattr(req, "is_audio", False):
        audio_url = generate_audio_for_chat(result["answer"])
    _append_chatbot_event(
        user_id,
        message=req.message,
        note_id=req.note_id,
        context_type=req.context_type,
        llm_stress_signal=result["llm_stress_signal"],
        llm_confusion_keywords=result["llm_confusion_keywords"],
    )

    return {
        "response": result["answer"],
        "chatbot_llm_stress_signal": result["llm_stress_signal"],
        "chatbot_llm_confusion_keywords": result["llm_confusion_keywords"],
        "audio_url": audio_url,
    }

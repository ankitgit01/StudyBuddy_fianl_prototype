# backend/routers/video_quiz.py
# GYAANI AI — Video Quiz Generation API Route
#
# POST /api/video-quiz
# Body: { "summary": { ...full summary dict... }, "num_questions": 10, "difficulty": "mixed" }
#
# The frontend already has the summary in memory after /api/video-summary,
# so we accept it directly — no transcript re-fetch needed.
# Uses the shared generate_quiz_from_video_summary() from quiz_generator.py.

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator, model_validator
from typing import Any

from services.quiz_generator import generate_quiz_from_video_summary
from routers.users import get_current_user   # require auth — same as video_summary

router = APIRouter(prefix="/api", tags=["video-quiz"])


# ── Request / Response models ──────────────────────────────────

class VideoQuizRequest(BaseModel):
    summary: dict[str, Any]
    num_questions: int = 10
    difficulty: str = "mixed"

    @field_validator("num_questions")
    @classmethod
    def clamp_questions(cls, v: int) -> int:
        if v not in (5, 10, 15):
            raise ValueError("num_questions must be 5, 10, or 15")
        return v

    @field_validator("difficulty")
    @classmethod
    def validate_difficulty(cls, v: str) -> str:
        allowed = ("easy", "medium", "hard", "mixed")
        if v not in allowed:
            raise ValueError(f"difficulty must be one of: {', '.join(allowed)}")
        return v

    @field_validator("summary")
    @classmethod
    def validate_summary(cls, v: dict) -> dict:
        if not v.get("overall_summary") and not v.get("topics"):
            raise ValueError("summary must contain overall_summary or topics")
        return v


class VideoQuizResponse(BaseModel):
    total_questions: int
    questions: list[dict[str, Any]]


# ── Route ──────────────────────────────────────────────────────

@router.post(
    "/video-quiz",
    response_model=VideoQuizResponse,
    summary="Generate an MCQ quiz from a video summary",
    description=(
        "Accepts the structured summary already computed by /api/video-summary "
        "and returns a fresh MCQ quiz. Call again to regenerate entirely new questions."
    ),
)
async def create_video_quiz(
    request: VideoQuizRequest,
    current_user: dict = Depends(get_current_user),  # require authentication
):
    try:
        questions = generate_quiz_from_video_summary(
            summary=request.summary,
            num_questions=request.num_questions,
            difficulty=request.difficulty,
        )
    except ValueError as e:
        # Client-side error (bad summary data, missing config, etc.)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {str(e)}")

    if not questions:
        raise HTTPException(
            status_code=500,
            detail="No questions were generated. Please retry."
        )

    return {
        "total_questions": len(questions),
        "questions":       questions,
    }

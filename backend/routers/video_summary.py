# backend/routers/video_summary.py
# GYAANI AI — Video Summary API Route
#
# POST /api/video-summary
# Body: { "url": "https://youtube.com/watch?v=..." }

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, validator
from typing import Any

from services.transcript import extract_video_id, get_transcript
from services.summariser import summarise_transcript
from services.video_metadata import get_video_metadata
from services.youtube_service import search_related_videos

# NEW IMPORTS FOR PERSISTENCE
from routers.users import get_current_user
from services import cosmos_db

router = APIRouter(prefix="/api", tags=["video-summary"])


# ── Models ─────────────────────────────────────────────────────

class VideoSummaryRequest(BaseModel):
    url: str

    @validator("url")
    def validate_youtube_url(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("URL cannot be empty")
        if "youtube.com" not in v and "youtu.be" not in v:
            raise ValueError(
                "Please provide a valid YouTube URL "
                "(youtube.com/watch?v=... or youtu.be/...)"
            )
        return v


class VideoSummaryResponse(BaseModel):
    video_id: str
    url: str
    title: str
    channel: str
    thumbnail: str
    transcript_method: str
    detected_language: str
    transcript_word_count: int
    title_guess: str | None
    overall_summary: str
    key_takeaways: list[str]
    topics: list[dict]
    subject_tags: list[str]
    exam_relevance: str | None
    estimated_read_time_mins: int | None
    related_videos: list[dict]


# ── Routes ──────────────────────────────────────────────────────

@router.post(
    "/video-summary",
    response_model=VideoSummaryResponse,
    summary="Summarise a YouTube video",
    description=(
        "Takes a YouTube URL, extracts transcript via captions or AssemblyAI, "
        "then summarises with GPT-4.1."
    ),
)
async def create_video_summary(
    request: VideoSummaryRequest, 
    current_user: dict = Depends(get_current_user) # Require authentication
):
    url = request.url

    # Step 1 — Extract video ID
    try:
        video_id = extract_video_id(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not video_id:
        raise HTTPException(status_code=400, detail="Could not extract video ID from URL.")

    # Step 2 — Fetch video metadata
    try:
        metadata = await get_video_metadata(video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Route] Metadata fetch failed: {e}")
        metadata = {"title": "", "channel": "", "thumbnail": ""}

    # Step 3 — Get transcript
    try:
        transcript_data = get_transcript(video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not extract transcript: {str(e)}")

    if transcript_data["word_count"] < 30:
        raise HTTPException(
            status_code=422,
            detail="Transcript too short. This video may have no speech content."
        )

    # Step 4 — Summarise with GPT-4.1
    try:
        summary = summarise_transcript(
            transcript_text=transcript_data["text"],
            word_count=transcript_data["word_count"],
            video_title=metadata.get("title", ""),
            detected_language=transcript_data.get("detected_language", "en"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI summarisation failed: {str(e)}")

    # Step 5 — Fetch related video suggestions
    related_videos = search_related_videos(
        title=metadata.get("title") or summary.get("title_guess", ""),
        subject_tags=summary.get("subject_tags", []),
        max_results=4,
    )

    # Step 6 — Prepare result object
    summary_result = {
        "video_id":                 video_id,
        "url":                      url,
        "title":                    metadata.get("title") or summary.get("title_guess", ""),
        "channel":                  metadata.get("channel", ""),
        "thumbnail":                metadata.get("thumbnail", ""),
        "transcript_method":        transcript_data["method"],
        "detected_language":        transcript_data.get("detected_language", "en"),
        "transcript_word_count":    transcript_data["word_count"],
        "title_guess":              summary.get("title_guess"),
        "overall_summary":          summary.get("overall_summary", ""),
        "key_takeaways":            summary.get("key_takeaways", []),
        "topics":                   summary.get("topics", []),
        "subject_tags":             summary.get("subject_tags", []),
        "exam_relevance":           summary.get("exam_relevance"),
        "estimated_read_time_mins": summary.get("estimated_read_time_mins"),
        "related_videos":           related_videos,
    }

    # Step 7 — NEW: Persistent storage in Cosmos DB
    try:
        user_id = current_user.get("id") or current_user.get("user_id") or current_user.get("sub") or current_user.get("email", "unknown")
        cosmos_db.save_video_summary(summary_result, user_id)
    except Exception as e:
        import traceback
        print(f"⚠️  [video_summary] Cosmos DB save FAILED:")
        traceback.print_exc()

    return summary_result


@router.get("/video-history")
async def get_video_history(current_user: dict = Depends(get_current_user)):
    COSMOS_INTERNAL = {"_rid", "_self", "_etag", "_attachments", "_ts"}
    user_id = current_user.get("id") or current_user.get("user_id") or current_user.get("sub") or current_user.get("email", "unknown")
    print(f"[DEBUG history] user_id={user_id}")  # ADD THIS
    history = cosmos_db.get_summaries_by_user(user_id)
    print(f"[DEBUG history] found {len(history)} items")  # ADD THIS
    try:
        user_id = current_user.get("id") or current_user.get("user_id") or current_user.get("sub") or current_user.get("email", "unknown")
        history = cosmos_db.get_summaries_by_user(user_id)
        result = []
        for item in history:
            doc = {k: v for k, v in item.items() if k not in COSMOS_INTERNAL}
            doc.setdefault("title",           doc.get("title_guess") or "")
            doc.setdefault("channel",         "")
            doc.setdefault("thumbnail",       "")
            doc.setdefault("url",             f"https://www.youtube.com/watch?v={doc.get('video_id','')}")
            doc.setdefault("overall_summary", "")
            doc.setdefault("key_takeaways",   [])
            doc.setdefault("topics",          [])
            doc.setdefault("subject_tags",    [])
            doc.setdefault("related_videos",  [])
            doc.setdefault("transcript_method",  "")
            doc.setdefault("detected_language",  "en")
            if not isinstance(doc["key_takeaways"], list): doc["key_takeaways"] = []
            if not isinstance(doc["topics"], list):        doc["topics"] = []
            if not isinstance(doc["subject_tags"], list):  doc["subject_tags"] = []
            if not isinstance(doc["related_videos"], list):doc["related_videos"] = []
            result.append(doc)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")
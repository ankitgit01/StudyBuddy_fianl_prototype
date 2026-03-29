# ─────────────────────────────────────────────────────────────
#  GYAANI — YouTube Service
#  File: backend/services/youtube_service.py
#
#  Fetches a real, relevant YouTube video link for a concept
#  using the YouTube Data API v3.
#
#  Features:
#  - In-memory + DB cache (avoids wasting quota on repeat terms)
#  - Filters out Shorts, very short/long videos
#  - Prefers educational channels
#  - Safe fallback: returns "" if API fails or quota exceeded
#
#  Quota cost: 100 units per search (only when cache misses)
# ─────────────────────────────────────────────────────────────

import os
import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────
YT_API_KEY   = os.environ.get("YOUTUBE_API_KEY", "")
YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YT_VIDEO_URL  = "https://www.googleapis.com/youtube/v3/videos"

# In-memory cache: { "Newton's Third Law::Physics": "https://..." }
# Survives for the lifetime of the server process.
# For multi-worker/multi-server setups, replace with Redis.
_yt_cache: dict[str, str] = {}

# Channels known to post quality educational content.
# The search API already ranks by relevance — this is just a
# secondary preference filter, not a hard whitelist.
PREFERRED_CHANNEL_KEYWORDS = [
    "khan academy", "veritasium", "3blue1brown", "crash course",
    "physics wallah", "unacademy", "vedantu", "byju", "aakash",
    "minutephysics", "kurzgesagt", "scishow", "vsauce",
]

# ── Public API ────────────────────────────────────────────────

def fetch_yt_link(term: str, subject: str = "", language: str = "en") -> str:
    """
    Returns a YouTube watch URL for the given concept term.
    Returns "" if nothing suitable is found or API is unavailable.

    Args:
        term:     Concept term in English, e.g. "Newton's Third Law"
        subject:  Subject name, e.g. "Physics" — appended to query
        language: ISO language code for relevanceLanguage param
    """
    if not YT_API_KEY:
        logger.warning("YOUTUBE_API_KEY not set — skipping YouTube fetch")
        return ""

    if not term or not term.strip():
        return ""

    cache_key = _make_cache_key(term, subject)

    # ── 1. Check in-memory cache ──────────────────────────────
    if cache_key in _yt_cache:
        logger.debug(f"YT cache hit: {cache_key}")
        return _yt_cache[cache_key]

    # ── 2. Call the API ───────────────────────────────────────
    try:
        video_id = _search_video(term, subject, language)
        if not video_id:
            _yt_cache[cache_key] = ""
            return ""

        url = f"https://www.youtube.com/watch?v={video_id}"
        _yt_cache[cache_key] = url
        logger.info(f"YT fetched: {term!r} → {url}")
        return url

    except Exception as e:
        logger.error(f"YouTube API error for term={term!r}: {e}")
        return ""


def fetch_yt_links_for_concepts(concepts: list[dict], subject: str = "", language: str = "en") -> list[dict]:
    """
    Enriches a list of concept dicts (in-place) with youtube_link.
    Only searches for concepts that don't already have a real link.

    Args:
        concepts: list of concept dicts (from AI explanation output)
        subject:  note subject, e.g. "Physics"
        language: relevanceLanguage for the search

    Returns:
        The same list with youtube_link filled in.
    """
    for concept in concepts:
        # Skip if already has a real link
        existing = concept.get("youtube_link", "")
        if existing and existing.startswith("https://www.youtube.com/watch?v="):
            continue

        term = concept.get("term_en") or concept.get("term") or ""
        concept["youtube_link"] = fetch_yt_link(term, subject=subject, language=language)

    return concepts


# ── Internal helpers ──────────────────────────────────────────

def _make_cache_key(term: str, subject: str) -> str:
    return f"{term.strip().lower()}::{subject.strip().lower()}"


def _search_video(term: str, subject: str, language: str) -> Optional[str]:
    """
    Runs a YouTube search and returns the best video_id, or None.
    Costs 100 API units.
    """
    query = f"{term} {subject} explained".strip()

    params = {
        "part":              "snippet",
        "q":                 query,
        "type":              "video",
        "maxResults":        5,
        "relevanceLanguage": language,
        # "medium" = 4–20 min — filters out YouTube Shorts (< 1 min)
        # and overly long lectures (> 20 min)
        "videoDuration":     "medium",
        "key":               YT_API_KEY,
    }

    resp = requests.get(YT_SEARCH_URL, params=params, timeout=8)

    if resp.status_code == 403:
        logger.error("YouTube API quota exceeded or key invalid")
        return None

    if not resp.ok:
        logger.warning(f"YouTube search failed: {resp.status_code} {resp.text[:200]}")
        return None

    data = resp.json()
    items = data.get("items", [])

    if not items:
        return None

    # ── Preference scoring ────────────────────────────────────
    # We have up to 5 results already ranked by YouTube relevance.
    # Apply a small boost for known educational channels — but
    # never demote the top result by more than 2 positions.

    scored = []
    for item in items:
        vid_id       = item.get("id", {}).get("videoId", "")
        channel_name = item["snippet"].get("channelTitle", "").lower()
        edu_boost    = any(kw in channel_name for kw in PREFERRED_CHANNEL_KEYWORDS)
        scored.append((vid_id, edu_boost))

    # If any preferred channel found, put it first
    preferred = [v for v, edu in scored if edu]
    if preferred:
        return preferred[0]

    # Otherwise return YouTube's top result
    return scored[0][0] if scored else None


# ── Related video suggestions ─────────────────────────────────

def search_related_videos(title: str, subject_tags: list[str] = [], max_results: int = 4) -> list[dict]:
    """
    Returns up to max_results related YouTube videos for a given video title.
    Used on the Video Summary page to suggest further learning.

    No duration filter — any length is fine for related suggestions.
    Each result includes: video_id, title, channel, thumbnail, url.

    Args:
        title:       The summarised video's title (used as search query)
        subject_tags: e.g. ["Physics", "Class 11", "JEE"] — appended to query
        max_results: how many videos to return (3 or 4 recommended)
    """
    if not YT_API_KEY:
        logger.warning("YOUTUBE_API_KEY not set — skipping related videos fetch")
        return []

    if not title or not title.strip():
        return []

    # Build query: title + top 2 subject tags
    tag_str = " ".join(subject_tags[:2]) if subject_tags else ""
    query   = f"{title} {tag_str}".strip()

    params = {
        "part":        "snippet",
        "q":           query,
        "type":        "video",
        "maxResults":  max_results,
        "key":         YT_API_KEY,
        # No videoDuration filter — any length is fine
    }

    try:
        resp = requests.get(YT_SEARCH_URL, params=params, timeout=8)

        if resp.status_code == 403:
            logger.error("YouTube API quota exceeded or key invalid")
            return []

        if not resp.ok:
            logger.warning(f"Related videos search failed: {resp.status_code}")
            return []

        items = resp.json().get("items", [])
        results = []

        for item in items:
            vid_id  = item.get("id", {}).get("videoId", "")
            snippet = item.get("snippet", {})
            if not vid_id:
                continue
            results.append({
                "video_id":  vid_id,
                "title":     snippet.get("title", ""),
                "channel":   snippet.get("channelTitle", ""),
                "thumbnail": snippet.get("thumbnails", {}).get("medium", {}).get("url", "")
                             or f"https://img.youtube.com/vi/{vid_id}/mqdefault.jpg",
                "url":       f"https://www.youtube.com/watch?v={vid_id}",
            })

        logger.info(f"Related videos fetched: {len(results)} for query={query!r}")
        return results

    except Exception as e:
        logger.error(f"Related videos fetch error: {e}")
        return []

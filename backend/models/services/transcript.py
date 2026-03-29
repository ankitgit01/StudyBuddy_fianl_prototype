# backend/services/transcript.py
# GYAANI AI — Transcript extraction
#
# Strategy:
#   1. Try YouTube captions (fast, free) via youtube-transcript-api
#   2. On TranscriptsDisabled / NoTranscriptFound → download audio with yt-dlp
#      and transcribe with AssemblyAI (requires ASSEMBLYAI_API_KEY in .env)

import os
import re
import time
import logging
import tempfile
import subprocess
from typing import Optional
from urllib.parse import urlparse, parse_qs

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY", "")
ASSEMBLYAI_UPLOAD_URL  = "https://api.assemblyai.com/v2/upload"
ASSEMBLYAI_TRANSCRIPT_URL = "https://api.assemblyai.com/v2/transcript"

# ── youtube-transcript-api v1.1+ ─────────────────────────────
# v1.1.0 switched from HTML scraping to the innertube API.
# The library now requires instance-based calls: YouTubeTranscriptApi().fetch()
# and YouTubeTranscriptApi().list()  — class-level calls no longer work.
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import (
        TranscriptsDisabled,
        NoTranscriptFound,
        VideoUnavailable,
    )
    # PoTokenRequired was added in v1.1.0 — guard for older installs
    try:
        from youtube_transcript_api._errors import PoTokenRequired
    except ImportError:
        PoTokenRequired = Exception

    YT_TRANSCRIPT_AVAILABLE = True
except ImportError:
    YT_TRANSCRIPT_AVAILABLE = False
    PoTokenRequired = Exception
    logger.warning("youtube-transcript-api not installed")


# ── Language preference ───────────────────────────────────────
LANGUAGE_PREFERENCE = [
    "en", "en-US", "en-GB",
    "hi", "hi-IN",
    "ta", "te", "bn", "mr", "gu",
]


# ═════════════════════════════════════════════════════════════
# PUBLIC — Video ID extractor
# ═════════════════════════════════════════════════════════════

def extract_video_id(url: str) -> str:
    """
    Extracts the YouTube video ID from any valid YouTube URL format.

    Supports:
      - https://www.youtube.com/watch?v=VIDEO_ID
      - https://youtu.be/VIDEO_ID
      - https://youtube.com/shorts/VIDEO_ID
      - https://www.youtube.com/embed/VIDEO_ID

    Raises ValueError if no valid video ID can be found.
    """
    if not url or not url.strip():
        raise ValueError("URL is empty.")

    url = url.strip()

    if "youtu.be/" in url:
        path = urlparse(url).path
        vid = path.lstrip("/").split("?")[0].split("/")[0]
        if vid:
            return vid

    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    if "v" in qs:
        return qs["v"][0]

    path_parts = parsed.path.lstrip("/").split("/")
    if len(path_parts) >= 2 and path_parts[0] in ("shorts", "embed", "v"):
        return path_parts[1]

    match = re.search(r"(?:v=|vi/|v/|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})", url)
    if match:
        return match.group(1)

    raise ValueError(f"Could not extract a valid YouTube video ID from: {url}")


# ═════════════════════════════════════════════════════════════
# PUBLIC — Main transcript fetcher
# ═════════════════════════════════════════════════════════════

def get_transcript(video_id: str) -> dict:
    """
    Fetches the transcript for a YouTube video.

    Attempt order:
      1. YouTube captions (youtube-transcript-api)
      2. AssemblyAI speech-to-text (yt-dlp audio download → AssemblyAI)

    Returns:
    {
        "text":              str,
        "word_count":        int,
        "method":            str,   # "youtube_captions" | "assemblyai"
        "detected_language": str,
        "segments":          list,
    }

    Raises:
        ValueError  — unrecoverable client error (private video, etc.)
        Exception   — unexpected failure after all fallbacks exhausted
    """

    # ── Attempt 1: YouTube captions ───────────────────────────
    if YT_TRANSCRIPT_AVAILABLE:
        try:
            return _fetch_youtube_captions(video_id)

        except VideoUnavailable:
            raise ValueError("This video is unavailable or private.")

        except PoTokenRequired:
            logger.info(
                f"[Transcript] PoToken required for {video_id} "
                f"— YouTube is rate-limiting this IP. Falling back to AssemblyAI."
            )
            # Fall through to AssemblyAI below

        except (TranscriptsDisabled, NoTranscriptFound) as e:
            logger.info(
                f"[Transcript] Captions unavailable for {video_id} "
                f"({type(e).__name__}). Falling back to AssemblyAI."
            )
            # Fall through to AssemblyAI below

        except ValueError:
            raise  # re-raise clean client errors

        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "too many requests" in error_msg.lower():
                raise Exception("YouTube rate-limited the request. Please wait and retry.")
            if "no element found" in error_msg.lower():
                # This is the old HTML-scraping XML parse error — means the library
                # is outdated. Instruct user to upgrade.
                raise ValueError(
                    "Transcript parsing failed. Please upgrade the library: "
                    "pip install --upgrade youtube-transcript-api"
                )
            logger.warning(f"[Transcript] YouTube captions failed unexpectedly: {e}. Trying AssemblyAI.")
            # Fall through to AssemblyAI below

    # ── Attempt 2: AssemblyAI ─────────────────────────────────
    if not ASSEMBLYAI_API_KEY:
        raise ValueError(
            "Transcripts are disabled for this video and no ASSEMBLYAI_API_KEY "
            "is set — cannot fall back to speech-to-text."
        )

    logger.info(f"[Transcript] Starting AssemblyAI pipeline for {video_id}")
    return _fetch_assemblyai_transcript(video_id)


# ═════════════════════════════════════════════════════════════
# PRIVATE — YouTube captions path
# ═════════════════════════════════════════════════════════════

def _fetch_youtube_captions(video_id: str) -> dict:
    transcript_list = _list_transcripts(video_id)
    transcript      = _pick_best_transcript(transcript_list)
    detected_lang   = transcript.language_code

    fetched = transcript.fetch()

    # v1.1+ returns a FetchedTranscript object with .to_raw_data()
    # v1.0  returned a list of dicts directly
    # Handle both shapes safely.
    if hasattr(fetched, "to_raw_data"):
        segments = fetched.to_raw_data()
    elif hasattr(fetched, "snippets"):
        # FetchedTranscript.snippets is a list of FetchedTranscriptSnippet objects
        segments = [
            {"text": s.text, "start": s.start, "duration": s.duration}
            for s in fetched.snippets
        ]
    elif isinstance(fetched, list):
        segments = fetched
    else:
        # Last resort — iterate whatever it is
        segments = list(fetched)

    text = " ".join(
        (seg["text"] if isinstance(seg, dict) else seg.text).strip()
        for seg in segments
        if (seg["text"] if isinstance(seg, dict) else seg.text).strip()
    )
    text = _clean_transcript_text(text)

    logger.info(f"[Transcript] YouTube captions OK — {len(text.split())} words, lang={detected_lang}")

    return {
        "text":              text,
        "word_count":        len(text.split()),
        "method":            "youtube_captions",
        "detected_language": detected_lang,
        "segments":          segments,
    }


# ═════════════════════════════════════════════════════════════
# PRIVATE — AssemblyAI path
# ═════════════════════════════════════════════════════════════

def _fetch_assemblyai_transcript(video_id: str) -> dict:
    """
    Downloads audio with yt-dlp into a temp file, uploads to AssemblyAI,
    polls until complete, and returns the transcript dict.
    """
    audio_path = _download_audio(video_id)
    try:
        upload_url = _upload_to_assemblyai(audio_path)
        result     = _submit_and_poll_assemblyai(upload_url)
    finally:
        # Always clean up the temp audio file
        try:
            os.remove(audio_path)
        except OSError:
            pass

    text = _clean_transcript_text(result.get("text", ""))
    detected_lang = (result.get("language_code") or "en").split("-")[0]  # "en-us" → "en"

    # AssemblyAI returns words list; build minimal segments for compatibility
    words    = result.get("words", [])
    segments = _words_to_segments(words) if words else [{"text": text, "start": 0, "duration": 0}]

    logger.info(f"[Transcript] AssemblyAI OK — {len(text.split())} words, lang={detected_lang}")

    return {
        "text":              text,
        "word_count":        len(text.split()),
        "method":            "assemblyai",
        "detected_language": detected_lang,
        "segments":          segments,
    }


def _download_audio(video_id: str) -> str:
    """
    Uses yt-dlp to download the best available audio track into a
    named temp file. Returns the file path.

    Raises Exception if yt-dlp is not installed or download fails.
    """
    # Check yt-dlp is available
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        raise Exception(
            "yt-dlp is not installed. Install it with: pip install yt-dlp"
        )

    # Use a named temp file so AssemblyAI can read it after yt-dlp writes it
    tmp = tempfile.NamedTemporaryFile(suffix=".m4a", delete=False)
    tmp.close()
    audio_path = tmp.name

    url = f"https://www.youtube.com/watch?v={video_id}"
    cmd = [
        "yt-dlp",
        "--format", "bestaudio[ext=m4a]/bestaudio/best",
        "--output", audio_path,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        # Overwrite the temp file path exactly (yt-dlp may add extension)
        "--no-part",
        url,
    ]

    logger.info(f"[Transcript] Downloading audio for {video_id} …")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip()
        # yt-dlp sometimes writes the actual file with an extension appended
        raise Exception(f"yt-dlp failed to download audio: {err}")

    # yt-dlp may have written to audio_path or audio_path + extension
    # Find the actual file
    actual_path = _find_yt_dlp_output(audio_path)
    if not actual_path or not os.path.exists(actual_path):
        raise Exception("yt-dlp ran but no audio file was created.")

    logger.info(f"[Transcript] Audio downloaded: {actual_path} ({os.path.getsize(actual_path)} bytes)")
    return actual_path


def _find_yt_dlp_output(base_path: str) -> Optional[str]:
    """
    yt-dlp sometimes appends the real extension (e.g. .m4a, .webm).
    Checks the base path and common variations.
    """
    if os.path.exists(base_path) and os.path.getsize(base_path) > 0:
        return base_path

    directory = os.path.dirname(base_path)
    stem      = os.path.basename(base_path)

    for fname in os.listdir(directory):
        if fname.startswith(stem):
            candidate = os.path.join(directory, fname)
            if os.path.getsize(candidate) > 0:
                return candidate

    return None


def _upload_to_assemblyai(audio_path: str) -> str:
    """
    Uploads the audio file to AssemblyAI and returns the upload URL.
    """
    headers = {"authorization": ASSEMBLYAI_API_KEY}

    logger.info("[Transcript] Uploading audio to AssemblyAI …")
    with open(audio_path, "rb") as f:
        response = requests.post(ASSEMBLYAI_UPLOAD_URL, headers=headers, data=f, timeout=120)

    if response.status_code != 200:
        raise Exception(f"AssemblyAI upload failed ({response.status_code}): {response.text}")

    upload_url = response.json().get("upload_url")
    if not upload_url:
        raise Exception("AssemblyAI upload returned no URL.")

    logger.info(f"[Transcript] AssemblyAI upload OK: {upload_url}")
    return upload_url


def _submit_and_poll_assemblyai(upload_url: str) -> dict:
    """
    Submits a transcription job to AssemblyAI and polls until complete.
    Returns the full result dict.
    """
    headers = {
        "authorization": ASSEMBLYAI_API_KEY,
        "content-type":  "application/json",
    }

    # Submit job with language detection enabled
    payload = {
        "audio_url":           upload_url,
        "language_detection":  True,
        "punctuate":           True,
        "format_text":         True,
    }

    logger.info("[Transcript] Submitting AssemblyAI transcription job …")
    resp = requests.post(ASSEMBLYAI_TRANSCRIPT_URL, json=payload, headers=headers, timeout=30)

    if resp.status_code != 200:
        raise Exception(f"AssemblyAI job submission failed ({resp.status_code}): {resp.text}")

    job_id = resp.json().get("id")
    if not job_id:
        raise Exception("AssemblyAI returned no job ID.")

    logger.info(f"[Transcript] AssemblyAI job submitted: {job_id}. Polling …")

    # Poll until status is completed or error
    poll_url    = f"{ASSEMBLYAI_TRANSCRIPT_URL}/{job_id}"
    max_wait    = 600   # 10 minutes max
    poll_every  = 5     # seconds between polls
    elapsed     = 0

    while elapsed < max_wait:
        time.sleep(poll_every)
        elapsed += poll_every

        poll_resp = requests.get(poll_url, headers={"authorization": ASSEMBLYAI_API_KEY}, timeout=30)
        if poll_resp.status_code != 200:
            logger.warning(f"[Transcript] Poll error {poll_resp.status_code}, retrying …")
            continue

        data   = poll_resp.json()
        status = data.get("status")

        logger.info(f"[Transcript] AssemblyAI status: {status} ({elapsed}s elapsed)")

        if status == "completed":
            return data

        if status == "error":
            raise Exception(f"AssemblyAI transcription failed: {data.get('error', 'unknown error')}")

        # status is "queued" or "processing" — keep polling

    raise Exception(f"AssemblyAI transcription timed out after {max_wait}s.")


# ═════════════════════════════════════════════════════════════
# PRIVATE — Helpers
# ═════════════════════════════════════════════════════════════

def _pick_best_transcript(transcript_list) -> object:
    for lang in LANGUAGE_PREFERENCE:
        try:
            return transcript_list.find_manually_created_transcript([lang])
        except Exception:
            pass

    for lang in LANGUAGE_PREFERENCE:
        try:
            return transcript_list.find_generated_transcript([lang])
        except Exception:
            pass

    transcripts = list(transcript_list)
    if transcripts:
        return transcripts[0]

    raise NoTranscriptFound([], [], {})


def _list_transcripts(video_id: str):
    """
    Compatible with youtube-transcript-api v1.1+.
    v1.1.0 dropped class-level methods — must instantiate the class first.
    """
    ytt = YouTubeTranscriptApi()

    # v1.1+: instance method is .list(video_id)
    if hasattr(ytt, "list"):
        return ytt.list(video_id)

    # Fallback for any older v1.0.x installs that used list_transcripts
    if hasattr(ytt, "list_transcripts"):
        return ytt.list_transcripts(video_id)

    # Last resort: class-level (pre-v1.0 behaviour)
    if hasattr(YouTubeTranscriptApi, "list_transcripts"):
        return YouTubeTranscriptApi.list_transcripts(video_id)

    raise Exception(
        "youtube-transcript-api version is incompatible. "
        "Please upgrade: pip install --upgrade youtube-transcript-api"
    )


def _clean_transcript_text(text: str) -> str:
    text = re.sub(r"\[.*?\]", "", text)
    text = re.sub(r"\(.*?\)", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _words_to_segments(words: list) -> list:
    """
    Converts AssemblyAI word-level data into segment dicts
    compatible with the format your summariser expects.
    Groups words into ~10-second chunks.
    """
    if not words:
        return []

    segments = []
    chunk_words  = []
    chunk_start  = words[0].get("start", 0) / 1000  # ms → s
    chunk_end    = chunk_start
    CHUNK_DURATION = 10  # seconds

    for word in words:
        start_s = word.get("start", 0) / 1000
        end_s   = word.get("end",   0) / 1000
        text    = word.get("text",  "")

        if start_s - chunk_start > CHUNK_DURATION and chunk_words:
            segments.append({
                "text":     " ".join(chunk_words),
                "start":    chunk_start,
                "duration": chunk_end - chunk_start,
            })
            chunk_words = []
            chunk_start = start_s

        chunk_words.append(text)
        chunk_end = end_s

    if chunk_words:
        segments.append({
            "text":     " ".join(chunk_words),
            "start":    chunk_start,
            "duration": chunk_end - chunk_start,
        })

    return segments
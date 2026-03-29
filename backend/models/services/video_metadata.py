# backend/services/video_metadata.py
# Fetches YouTube video title, channel, thumbnail
# Uses oEmbed API — completely free, no API key needed.
#
# pip install httpx

import httpx


async def get_video_metadata(video_id: str) -> dict:
    """Fetch video metadata using YouTube oEmbed (free, no API key)."""
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

    try:
        oembed_url = (
            f"https://www.youtube.com/oembed"
            f"?url=https://www.youtube.com/watch?v={video_id}&format=json"
        )
        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.get(oembed_url)
            response.raise_for_status()
            data = response.json()

        return {
            "title":     data.get("title", ""),
            "channel":   data.get("author_name", ""),
            "thumbnail": thumbnail_url,
        }

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise ValueError("This video is private or age-restricted.")
        if e.response.status_code == 404:
            raise ValueError("This video does not exist.")
        return {"title": "", "channel": "", "thumbnail": thumbnail_url}

    except Exception as e:
        print(f"[Metadata] Could not fetch metadata: {e}")
        return {"title": "", "channel": "", "thumbnail": thumbnail_url}

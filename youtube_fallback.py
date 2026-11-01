"""Conservative YouTube 403 recovery for the ReelSave download engine.

Only source-stream HTTP 403 errors are retried with the Android client. The
ordinary extractor remains the first attempt so higher-quality streams work.
"""

import re
from urllib.parse import urlsplit


VIDEO_QUALITY_HEIGHTS = {"sd": 480, "hd": 1080, "2k": 1440, "4k": 2160, "8k": 4320}
_HTTP_403 = re.compile(r"\b(?:HTTP\s+(?:Error\s+)?403|403\s+Forbidden)\b", re.IGNORECASE)


def is_youtube_url(url: str) -> bool:
    try:
        parsed = urlsplit(url.strip())
        hostname = (parsed.hostname or "").rstrip(".").lower()
    except (ValueError, AttributeError):
        return False
    return (parsed.scheme.lower() in {"http", "https"}
            and (hostname in {"youtu.be", "youtube.com", "youtube-nocookie.com"}
                 or hostname.endswith((".youtube.com", ".youtube-nocookie.com"))))


def should_retry_android(url: str, error_message: str) -> bool:
    return is_youtube_url(url) and bool(_HTTP_403.search(error_message))


def android_fallback_format(audio: bool, quality: str) -> list[str]:
    """Use verified fallback formats, not the stricter default MP4 selectors.

    The Android client can expose only a combined stream (often format 18).
    Audio extraction can still convert its audio track to MP3.
    """
    if audio:
        return ["--format", "ba/b"]
    options = ["--format", "bv*+ba/b"]
    if quality in VIDEO_QUALITY_HEIGHTS:
        options += ["--format-sort", f"res:{VIDEO_QUALITY_HEIGHTS[quality]}"]
    return options

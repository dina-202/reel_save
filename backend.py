"""ReelSave desktop download engine powered by yt-dlp and FFmpeg."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from typing import Literal
from pydantic import BaseModel
import json
import os
import shutil
import subprocess
import sys
import tempfile
from updater import router as updater_router, operation_lock, begin_transfer, finish_transfer

app = FastAPI(title="ReelSave Engine", docs_url=None, redoc_url=None)
app.include_router(updater_router)

# ---------- startup check: ffmpeg required for audio conversion ----------
if not shutil.which("ffmpeg"):
    print("WARNING: ffmpeg not found — audio conversion will fail")
    print("Install from: https://ffmpeg.org/download.html")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PLATFORM_MAP = {
    "instagram": "Instagram",
    "tiktok": "TikTok",
    "youtube": "YouTube",
    "youtu.be": "YouTube",
    "facebook": "Facebook",
    "fb.watch": "Facebook",
}


def detect_platform(url: str) -> str:
    """Return a human-readable platform name for the given URL."""
    url_lower = url.lower()
    for key, name in PLATFORM_MAP.items():
        if key in url_lower:
            return name
    return "Unknown"


def run_ytdlp(args: list[str], timeout: int = 120):
    if not operation_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A download or update is running. Please retry when it finishes.")
    try:
        return _run_ytdlp(args, timeout)
    finally:
        operation_lock.release()


def _run_ytdlp(args: list[str], timeout: int = 120):
    cmd = [sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-playlist",
           "--socket-timeout", "30"]
    if shutil.which("node"):
        cmd += ["--js-runtimes", "node"]
    try:
        result = subprocess.run(cmd + args, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=timeout,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="The download timed out. Try again or choose a shorter video.")
    if result.returncode != 0:
        detail = result.stderr.strip() or "yt-dlp could not download this video."
        raise HTTPException(status_code=400, detail=detail[-1500:])
    return result


def video_options(quality: str) -> list[str]:
    # res ranks the shorter edge, so 1080x1920 is treated as 1080p.
    # Sorting prefers the target size without excluding unknown dimensions or
    # sources that have no smaller rendition. Final fallback supports silent video.
    resolution = 480 if quality == "sd" else 1080
    return ["--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best/bestvideo",
            "--format-sort", f"res:{resolution}"]


def extract_info(url: str, fmt: str = "video", quality: str = "hd") -> dict:
    # Metadata can describe separate video/audio streams; yt-dlp merges them
    # when the user downloads, instead of sending a fragile CDN URL to the UI.
    options = ["--format", "bestaudio/best"] if fmt == "audio" else video_options(quality)
    result = run_ytdlp(["-J", *options, "--", url])

    # ---------- parse JSON ----------
    try:
        info = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Failed to parse yt-dlp JSON output.",
        )

    download_url = url

    title = info.get("title", "Untitled")

    # filesize — try exact first, fall back to approximate
    filesize = None
    raw_size = info.get("filesize") or info.get("filesize_approx")
    if raw_size is not None:
        try:
            filesize = int(raw_size)
        except (ValueError, TypeError):
            filesize = None

    # duration — prefer the pre-formatted string, build from seconds if missing
    duration = info.get("duration_string")
    if not duration:
        dur_secs = info.get("duration")
        if dur_secs is not None:
            try:
                dur_secs = float(dur_secs)
                mins = int(dur_secs // 60)
                secs = int(dur_secs % 60)
                duration = f"{mins}:{secs:02d}"
            except (ValueError, TypeError):
                duration = None

    platform = detect_platform(url)

    return {
        "download_url": download_url,
        "title": title,
        "platform": platform,
        "filesize": filesize,
        "duration": duration,
        "width": info.get("width"),
        "height": info.get("height"),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


class DownloadRequest(BaseModel):
    url: str
    format: Literal["video", "audio"] = "video"
    quality: Literal["hd", "sd", "hi", "lo"] = "hd"


class DownloadResponse(BaseModel):
    download_url: str
    title: str
    platform: str
    filesize: int | None = None
    duration: str | None = None
    width: int | None = None
    height: int | None = None


@app.get("/")
def root():
    return {"status": "ok", "service": "ReelSave Backend"}


@app.post("/download", response_model=DownloadResponse)
def download(req: DownloadRequest):
    """
    Accept a video URL and return the direct download link, title, platform,
    filesize, and duration.
    """
    if not req.url.strip():
        raise HTTPException(status_code=400, detail="URL is required.")

    info = extract_info(req.url.strip(), fmt=req.format, quality=req.quality)
    return info


def download_file(req: DownloadRequest, audio: bool):
    if not req.url.strip():
        raise HTTPException(status_code=400, detail="URL is required.")
    if shutil.which("ffmpeg") is None:
        raise HTTPException(status_code=503, detail="The bundled FFmpeg tool is missing. Reinstall ReelSave to repair it.")

    tmpdir = tempfile.TemporaryDirectory()
    begin_transfer()
    def cleanup_download():
        try:
            tmpdir.cleanup()
        finally:
            finish_transfer()
    try:
        args = ["-o", os.path.join(tmpdir.name, "download.%(ext)s")]
        if audio:
            args += ["--format", "bestaudio/best", "--extract-audio", "--audio-format", "mp3",
                     "--audio-quality", "128K" if req.quality == "lo" else "320K"]
        else:
            args += [*video_options(req.quality), "--merge-output-format", "mp4",
                     "--recode-video", "mp4"]
        run_ytdlp(args + ["--", req.url.strip()], timeout=600)
        ext = "mp3" if audio else "mp4"
        path = os.path.join(tmpdir.name, f"download.{ext}")
        if not os.path.isfile(path):
            raise HTTPException(status_code=502, detail=f"No {ext.upper()} file was produced.")
        # Keep the temporary file alive until the response has finished streaming.
        return FileResponse(path, media_type="audio/mpeg" if audio else "video/mp4",
                            filename=f"download.{ext}", background=BackgroundTask(cleanup_download))
    except Exception:
        cleanup_download()
        raise


@app.post("/download-audio")
def download_audio(req: DownloadRequest):
    return download_file(req, audio=True)


@app.post("/download-video")
def download_video(req: DownloadRequest):
    return download_file(req, audio=False)

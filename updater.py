"""Local-only yt-dlp updates, isolated from running downloads."""
from importlib.metadata import version, PackageNotFoundError
import secrets
import subprocess
import sys
import threading
import time
import os

from fastapi import APIRouter, HTTPException, Request
import httpx
from packaging.version import Version

router = APIRouter(prefix="/updates")
operation_lock = threading.Lock()
state_lock = threading.Lock()
token = secrets.token_urlsafe(32)
restart_reserved = False
active_transfers = 0


def begin_transfer():
    global active_transfers
    with state_lock:
        if restart_reserved:
            raise HTTPException(409, 'ReelSave is restarting to install an app update.')
        active_transfers += 1


def finish_transfer():
    global active_transfers
    with state_lock:
        active_transfers -= 1
state = {"status": "idle", "latest": None, "error": None, "checked_at": 0, "current": version("yt-dlp")}


def local_only(request: Request):
    if not request.client or request.client.host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(403, "Updates are only available on this PC.")
    if request.url.hostname not in {"localhost", "127.0.0.1", "::1", "testserver"}:
        raise HTTPException(403, "Open ReelSave using its localhost address to update.")


def snapshot():
    with state_lock:
        current = state["current"]
        if state["status"] != "updating":
            try:
                current = version("yt-dlp")
                state["current"] = current
            except PackageNotFoundError:
                state.update(status="failed", error="The previous installation was interrupted. Retry the update to repair yt-dlp.")
        return {**state, "current": current,
                "available": bool(state["latest"] and Version(state["latest"]) > Version(current)),
                "can_update": os.environ.get('REELSAVE_BUNDLED_PYTHON') == '1',
                "token": token}


@router.get("")
def check(request: Request, refresh: bool = False):
    local_only(request)
    with state_lock:
        should_check = state["status"] != "updating" and (refresh or time.time() - state["checked_at"] > 3600)
    if should_check:
        try:
            response = httpx.get("https://pypi.org/pypi/yt-dlp/json", timeout=15)
            response.raise_for_status()
            latest = str(Version(response.json()["info"]["version"]))
            with state_lock:
                state.update(latest=latest, checked_at=time.time())
                if state["status"] == "check_failed":
                    state.update(status="idle", error=None)
        except (httpx.HTTPError, ValueError, KeyError):
            with state_lock:
                if state["status"] != "updating":
                    state.update(status="check_failed", error="Could not check for updates. Check your internet connection and retry.")
    return snapshot()


def install(latest):
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "--isolated", "install", "--upgrade",
             "--disable-pip-version-check", "--no-input", "--index-url", "https://pypi.org/simple",
             f"yt-dlp[default]=={latest}"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout)[-1200:])
        verified = subprocess.run([sys.executable, "-m", "yt_dlp", "--version"],
                                  capture_output=True, text=True, timeout=30,
                                  creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if verified.returncode or Version(verified.stdout.strip()) != Version(latest):
            raise RuntimeError("The installed version could not be verified. Retry the update.")
        with state_lock:
            state.update(status="updated", error=None)
    except Exception as exc:
        message = "Update timed out. Check your connection and retry." if isinstance(exc, subprocess.TimeoutExpired) else str(exc)
        with state_lock:
            state.update(status="failed", error=message)
    finally:
        operation_lock.release()


@router.post("")
def update(request: Request):
    local_only(request)
    if not secrets.compare_digest(request.headers.get("x-reelsave-update-token", ""), token):
        raise HTTPException(403, "Refresh ReelSave before updating.")
    if os.environ.get('REELSAVE_BUNDLED_PYTHON') != '1':
        raise HTTPException(409, "Open the installed ReelSave app to enable downloader updates.")
    if not operation_lock.acquire(blocking=False):
        raise HTTPException(409, "A download or update is running. Wait for it to finish, then retry.")
    try:
        status = check(request, refresh=True)
        if status["status"] == "check_failed":
            raise HTTPException(503, status["error"])
        if not status["available"] and status["status"] != "failed":
            operation_lock.release()
            return status
        with state_lock:
            state.update(status="updating", error=None)
        threading.Thread(target=install, args=(status["latest"],), daemon=True).start()
    except Exception:
        operation_lock.release()
        raise
    return snapshot()


@router.get('/activity')
def activity(request: Request):
    local_only(request)
    with state_lock:
        return {'busy': operation_lock.locked() or active_transfers > 0}


@router.post('/prepare-restart')
def prepare_restart(request: Request):
    global restart_reserved
    local_only(request)
    if not secrets.compare_digest(request.headers.get('x-reelsave-update-token', ''), token):
        raise HTTPException(403, 'Refresh ReelSave before installing the app update.')
    with state_lock:
        if active_transfers or not operation_lock.acquire(blocking=False):
            raise HTTPException(409, 'Finish the current download or yt-dlp update before restarting.')
        restart_reserved = True
    return {'ready': True}


@router.post('/cancel-restart')
def cancel_restart(request: Request):
    global restart_reserved
    local_only(request)
    if not secrets.compare_digest(request.headers.get('x-reelsave-update-token', ''), token):
        raise HTTPException(403, 'Refresh ReelSave before retrying.')
    with state_lock:
        if restart_reserved:
            restart_reserved = False
            operation_lock.release()
    return {'ready': False}

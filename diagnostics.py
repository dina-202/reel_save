"""Emit only fixed diagnostic fields to the desktop host, never raw errors."""
from contextlib import contextmanager
from importlib.metadata import PackageNotFoundError, version
import json
import os
from urllib.parse import urlsplit


def platform_name(url):
    try:
        host = (urlsplit(url).hostname or '').lower()
    except ValueError:
        return 'other'
    for name, domains in {
        'youtube': ('youtube.com', 'youtu.be'), 'instagram': ('instagram.com',),
        'facebook': ('facebook.com', 'fb.watch'), 'tiktok': ('tiktok.com',),
        'reddit': ('reddit.com', 'redd.it'),
    }.items():
        if any(host == domain or host.endswith('.' + domain) for domain in domains):
            return name
    return 'other'


def error_code(error):
    # Classify locally. The message itself never leaves this function.
    message = str(getattr(error, 'detail', error)).lower()
    for fragments, code in (
        (('requested format is not available',), 'format_unavailable'),
        (('timed out', 'timeout'), 'timeout'),
        (('sign in', 'log in', 'login', 'cookies'), 'login_required'),
        (('429', 'too many requests', 'rate limit'), 'rate_limited'),
        (('403', 'forbidden'), 'access_denied'),
        (('404', 'unavailable', 'removed', 'private video'), 'media_unavailable'),
        (('ffmpeg', 'ffprobe'), 'conversion_failed'),
        (('unsupported url',), 'unsupported_url'),
        (('connection', 'network', 'resolve host', 'name resolution'), 'network_error'),
        (('no mp4 file', 'no mp3 file'), 'output_missing'),
    ):
        if any(fragment in message for fragment in fragments):
            return code
    return 'engine_error'


def emit_report(stage, error, request=None):
    if not os.environ.get('REELSAVE_DESKTOP_TOKEN'):
        return
    try:
        try:
            downloader = version('yt-dlp')
        except PackageNotFoundError:
            downloader = 'unknown'
        status = getattr(error, 'status_code', 0)
        if status in (409, 422):
            return  # Expected busy state or invalid input, not a product failure.
        payload = {'stage': stage, 'code': error_code(error), 'downloader': downloader,
                   'http_status': status if isinstance(status, int) else 0}
        if request is not None:
            payload.update(platform=platform_name(request.url), format=request.format, quality=request.quality)
        print('REELSAVE_DIAGNOSTIC=' + json.dumps(payload), flush=True)
    except Exception:
        pass  # Diagnostic storage must never interfere with downloads or updates.


@contextmanager
def diagnostic_operation(stage, request):
    try:
        yield
    except Exception as error:
        emit_report(stage, error, request)
        raise

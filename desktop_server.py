"""Private desktop backend; binds an OS-assigned loopback port."""
import os
from pathlib import Path
import socket
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from backend import app

secret = os.environ['REELSAVE_DESKTOP_TOKEN']

SECURITY_HEADERS = {
    'Content-Security-Policy': (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; connect-src 'self'; object-src 'none'; "
        "base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    ),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
}


@app.middleware('http')
async def desktop_auth(request, call_next):
    if request.headers.get('x-reelsave-desktop-token') != secret:
        return JSONResponse({'detail': 'This endpoint belongs to the ReelSave desktop app.'}, status_code=403)
    return await call_next(request)


# Electron serves its renderer and authenticated download engine together.
from fastapi import FastAPI
desktop = FastAPI()


@desktop.middleware('http')
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response


desktop.mount('/api', app)
desktop.mount('/', StaticFiles(directory=os.environ['REELSAVE_UI_DIR'], html=True), name='ui')

if __name__ == '__main__':
    connection = socket.socket()
    connection.bind(('127.0.0.1', 0))
    print(f'REELSAVE_PORT={connection.getsockname()[1]}', flush=True)
    uvicorn.Server(uvicorn.Config(desktop, log_level='warning')).run(sockets=[connection])

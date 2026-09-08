"""Exercise the packaged server using only its bundled interpreter and tools."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request

root = Path(__file__).resolve().parents[1]
resources = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root
packaged = resources != root
runtime = resources / ('runtime' if packaged else 'build/runtime')
backend = resources / 'backend' if packaged else root
ui = resources / 'frontend' if packaged else root / 'frontend/dist'
token = secrets.token_hex(32)
env = {**os.environ, 'REELSAVE_DESKTOP_TOKEN': token, 'REELSAVE_BUNDLED_PYTHON': '1',
       'REELSAVE_UI_DIR': str(ui), 'PATH': str(runtime / 'bin') + os.pathsep + os.environ.get('SystemRoot', r'C:\Windows') + r'\System32'}
python = runtime / 'python/python.exe'
process = subprocess.Popen([str(python), str(backend / 'desktop_server.py')], cwd=backend,
                           env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    line = process.stdout.readline().strip()
    if not line.startswith('REELSAVE_PORT='):
        raise RuntimeError('Server did not start: ' + process.stderr.read())
    base = 'http://127.0.0.1:' + line.split('=')[1]
    def request(route, data=None, authenticated=True):
        headers = {'X-ReelSave-Desktop-Token': token} if authenticated else {}
        if data is not None:
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(base + route, data=json.dumps(data).encode() if data is not None else None, headers=headers)
        return urllib.request.urlopen(req, timeout=180)
    for attempt in range(30):
        try:
            with request('/api/') as response:
                assert json.load(response)['status'] == 'ok'
            break
        except urllib.error.URLError:
            time.sleep(.2)
    else:
        raise RuntimeError('Server health check failed.')
    try:
        request('/api/', authenticated=False)
        raise AssertionError('Unauthenticated API request was allowed.')
    except urllib.error.HTTPError as error:
        assert error.code == 403
    with request('/') as response:
        assert b'ReelSave' in response.read()
    with request('/api/updates') as response:
        status = json.load(response)
        assert status['can_update']
        print('Bundled updater:', status['current'], status['status'], flush=True)
    for tool in ['ffmpeg.exe', 'ffprobe.exe', 'node.exe']:
        result = subprocess.run([str(runtime / 'bin' / tool), '-version' if tool != 'node.exe' else '--version'], capture_output=True, timeout=15)
        assert result.returncode == 0, tool
    print('Bundled Python, tools, UI, and authenticated API passed.', flush=True)
    if '--live' in sys.argv:
        for route, mime in [('/download-audio', 'audio/mpeg'), ('/download-video', 'video/mp4')]:
            with request('/api' + route, {'url': 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'quality': 'sd'}) as response:
                body = response.read()
                assert response.headers['Content-Type'].startswith(mime)
                assert len(body) > 1000
                print(route, len(body), 'bytes: passed', flush=True)
finally:
    process.terminate()
    process.wait(timeout=15)

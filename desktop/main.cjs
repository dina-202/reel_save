const { app, BrowserWindow, ipcMain, dialog, session, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const readline = require('node:readline');
const { createUpdater } = require('./app-updater.cjs');

let backend;
let window;
let baseUrl;
let quitting = false;
let restartApproved = false;
const token = crypto.randomBytes(32).toString('hex');
if (process.env.REELSAVE_DATA_DIR) app.setPath('userData', path.resolve(process.env.REELSAVE_DATA_DIR));
app.setAppUserModelId('com.dina202.reelsave');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('ReelSave could not start', error.message); app.quit(); });
}

async function api(route, options = {}) {
  const response = await fetch(`${baseUrl}/api${route}`, {
    ...options, headers: { ...options.headers, 'X-ReelSave-Desktop-Token': token }, signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || `ReelSave server error ${response.status}`);
  return body;
}

async function start() {
  await fs.promises.mkdir(app.getPath('userData'), { recursive: true });
  const desktopLog = message => fs.appendFileSync(path.join(app.getPath('userData'), 'desktop.log'), `${new Date().toISOString()} ${message}\n`);
  const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const runtime = app.isPackaged ? path.join(resources, 'runtime') : path.join(resources, 'build/runtime');
  const pythonDir = path.join(app.getPath('userData'), 'runtime', app.getVersion(), 'python');
  if (!fs.existsSync(path.join(pythonDir, '.ready'))) {
    await fs.promises.mkdir(pythonDir, { recursive: true });
    await fs.promises.cp(path.join(runtime, 'python'), pythonDir, { recursive: true });
    await fs.promises.writeFile(path.join(pythonDir, '.ready'), app.getVersion());
  }
  const backendDir = app.isPackaged ? path.join(resources, 'backend') : resources;
  const log = fs.createWriteStream(path.join(app.getPath('userData'), 'backend.log'), { flags: 'a' });
  backend = spawn(path.join(pythonDir, 'python.exe'), [path.join(backendDir, 'desktop_server.py')], {
    cwd: backendDir, windowsHide: true,
    env: { ...process.env, REELSAVE_DESKTOP_TOKEN: token, REELSAVE_BUNDLED_PYTHON: '1',
      REELSAVE_UI_DIR: app.isPackaged ? path.join(resources, 'frontend') : path.join(resources, 'frontend/dist'),
      PATH: `${path.join(runtime, 'bin')}${path.delimiter}${process.env.PATH || ''}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stderr.pipe(log, { end: false });
  backend.on('exit', code => {
    if (!quitting) { dialog.showErrorBox('ReelSave server stopped', `Please reopen ReelSave. Server exit: ${code}. Log: ${path.join(app.getPath('userData'), 'backend.log')}`); app.quit(); }
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The local engine did not start within 45 seconds.')), 45000);
    backend.once('error', error => { clearTimeout(timer); reject(error); });
    backend.once('exit', () => { clearTimeout(timer); reject(new Error('The bundled engine exited during startup.')); });
    readline.createInterface({ input: backend.stdout }).on('line', line => {
      const match = /^REELSAVE_PORT=(\d+)$/.exec(line);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); } else log.write(`${line}\n`);
    });
  });
  baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await api('/'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  if (!ready) throw new Error('ReelSave could not connect to its bundled engine.');

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${baseUrl}/*`] }, (details, callback) => {
    details.requestHeaders['X-ReelSave-Desktop-Token'] = token;
    callback({ requestHeaders: details.requestHeaders });
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save your download', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
  });

  const updater = createUpdater(app, async () => {
    const status = await api('/updates');
    await api('/updates/prepare-restart', { method: 'POST', headers: { 'X-ReelSave-Update-Token': status.token } });
    restartApproved = true;
    return async () => {
      restartApproved = false;
      await api('/updates/cancel-restart', { method: 'POST', headers: { 'X-ReelSave-Update-Token': status.token } });
    };
  });
  ipcMain.handle('clipboard:read', event => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(`${baseUrl}/`)) throw new Error('Clipboard access is only available in ReelSave.');
    return clipboard.readText();
  });
  for (const [name, handler] of Object.entries({ status: updater.status, check: updater.check, download: updater.download, install: updater.install })) {
    ipcMain.handle(`app-update:${name}`, async event => {
      if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(`${baseUrl}/`)) {
        throw new Error('This operation is only available in the ReelSave window.');
      }
      return handler();
    });
  }
  window = new BrowserWindow({ width: 1120, height: 850, minWidth: 430, minHeight: 600,
    title: 'ReelSave', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#faf5ff', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('did-fail-load', (_event, code, description) => desktopLog(`UI load failed ${code}: ${description}`));
  window.webContents.on('render-process-gone', (_event, details) => desktopLog(`UI stopped: ${details.reason}`));
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`${baseUrl}/`)) event.preventDefault(); });
  window.on('close', async event => {
    if (quitting || restartApproved) return;
    event.preventDefault();
    try {
      const activity = await api('/updates/activity');
      if (activity.busy) {
        const choice = await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep running', 'Close anyway'], defaultId: 0, cancelId: 0,
          message: 'A download or update is still running.', detail: 'Closing ReelSave will interrupt it.' });
        if (choice.response !== 1) return;
      }
    } catch { /* The engine may already have stopped. */ }
    quitting = true;
    app.quit();
  });
  await window.loadURL(baseUrl);
  desktopLog(`Desktop window loaded successfully; bundled engine listening on ${baseUrl}.`);
  updater.check();
  const timer = setInterval(() => updater.check(), 60 * 60 * 1000);
  timer.unref();
}

app.on('before-quit', () => {
  quitting = true;
  if (backend?.pid) {
    // Terminate only the process tree we spawned, including any ffmpeg worker.
    spawnSync('taskkill', ['/pid', String(backend.pid), '/T', '/F'], { windowsHide: true });
    backend = null;
  }
});
app.on('window-all-closed', () => app.quit());

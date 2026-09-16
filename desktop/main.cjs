const { app, BrowserWindow, ipcMain, dialog, session, clipboard, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const readline = require('node:readline');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createUpdater } = require('./app-updater.cjs');
const { createDiagnostics } = require('./diagnostics.cjs');
const { createDownloadSettings, filenameFromDisposition, friendlyDownloadError } = require('./download-settings.cjs');
const { ensureRuntime, runtimeReady, cleanupLegacyRuntimes, RUNTIME_SCHEMA } = require('./runtime-manager.cjs');
const { ensureStableShortcut } = require('./shortcut-manager.cjs');
const { createUpdateHealth } = require('./update-health.cjs');

let backend;
let window;
let baseUrl;
let quitting = false;
let restartApproved = false;
let diagnostics;
let downloadSettings;
const token = crypto.randomBytes(32).toString('hex');
if (process.env.REELSAVE_DATA_DIR) app.setPath('userData', path.resolve(process.env.REELSAVE_DATA_DIR));
app.setAppUserModelId('com.dina202.reelsave');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(start).catch(error => {
    diagnostics?.capture({ stage: 'startup', code: 'startup_failed' });
    dialog.showErrorBox('ReelSave could not start', error.message);
    quitting = true;
    app.quit();
  });
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
  const updateHealth = createUpdateHealth(app.getPath('userData'), app.getVersion());
  diagnostics = createDiagnostics({ directory: app.getPath('userData'), appVersion: app.getVersion(),
    electronVersion: process.versions.electron, windowsVersion: require('node:os').release(), arch: process.arch,
    openExternal: url => shell.openExternal(url) });
  downloadSettings = createDownloadSettings({ dataDir: app.getPath('userData'), defaultFolder: app.getPath('downloads') });
  const desktopLog = message => fs.appendFileSync(path.join(app.getPath('userData'), 'desktop.log'), `${new Date().toISOString()} ${message}\n`);
  const resources = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  let runtime = path.join(resources, 'build/runtime');
  let runtimeWindow;
  if (app.isPackaged) {
    const sharedRuntime = path.join(app.getPath('userData'), 'runtime', `shared-v${RUNTIME_SCHEMA}`);
    if (!runtimeReady(sharedRuntime)) {
      runtimeWindow = new BrowserWindow({ width: 540, height: 480, resizable: false, maximizable: false,
        title: 'Preparing ReelSave', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#faf5ff', autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'runtime-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
      window = runtimeWindow;
      runtimeWindow.on('close', event => { if (!quitting && !runtimeReady(sharedRuntime)) event.preventDefault(); });
      await runtimeWindow.loadFile(path.join(__dirname, 'runtime-setup.html'));
    }
    while (true) {
      try {
        runtime = await ensureRuntime({ dataDir: app.getPath('userData'), publicKey: fs.readFileSync(path.join(__dirname, 'update-public-key.pem')),
          onProgress: progress => runtimeWindow?.webContents.send('runtime-progress', progress) });
        break;
      } catch (error) {
        const choice = await dialog.showMessageBox(runtimeWindow, { type: 'error', buttons: ['Retry', 'Close ReelSave'], defaultId: 0, cancelId: 1,
          message: 'ReelSave could not prepare its download engine.', detail: `${error.message}\n\nCheck your internet connection and try again.` });
        if (choice.response !== 0) throw error;
      }
    }
  }
  const pythonDir = path.join(runtime, 'python');
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
    if (!quitting) {
      diagnostics.capture({ stage: 'engine', code: 'engine_stopped' });
      dialog.showErrorBox('ReelSave server stopped', `Please reopen ReelSave. Server exit: ${code}. Log: ${path.join(app.getPath('userData'), 'backend.log')}`); app.quit();
    }
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The local engine did not start within 45 seconds.')), 45000);
    backend.once('error', error => { clearTimeout(timer); reject(error); });
    backend.once('exit', () => { clearTimeout(timer); reject(new Error('The bundled engine exited during startup.')); });
    readline.createInterface({ input: backend.stdout }).on('line', line => {
      if (line.startsWith('REELSAVE_DIAGNOSTIC=')) {
        try { diagnostics.capture(JSON.parse(line.slice('REELSAVE_DIAGNOSTIC='.length))); } catch { /* Ignore malformed diagnostics. */ }
        return;
      }
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
  const updater = createUpdater(app, async targetVersion => {
    const status = await api('/updates');
    await api('/updates/prepare-restart', { method: 'POST', headers: { 'X-ReelSave-Update-Token': status.token } });
    updateHealth.markPending(targetVersion);
    restartApproved = true;
    return async () => {
      restartApproved = false;
      updateHealth.cancelPending();
      await api('/updates/cancel-restart', { method: 'POST', headers: { 'X-ReelSave-Update-Token': status.token } });
    };
  }, event => diagnostics.capture(event), { completedUpdate: updateHealth.completedUpdate });
  ipcMain.handle('clipboard:read', event => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(`${baseUrl}/`)) throw new Error('Clipboard access is only available in ReelSave.');
    return clipboard.readText();
  });
  const fromReelSave = event => event.sender === window?.webContents && event.senderFrame === window.webContents.mainFrame
    && event.senderFrame.url.startsWith(`${baseUrl}/`);
  ipcMain.handle('download-location:get', event => {
    if (!fromReelSave(event)) throw new Error('Download settings are only available in ReelSave.');
    return downloadSettings.get();
  });
  ipcMain.handle('download-location:set', async (event, folder) => {
    if (!fromReelSave(event)) throw new Error('Download settings are only available in ReelSave.');
    return downloadSettings.save(folder);
  });
  ipcMain.handle('download-location:browse', async event => {
    if (!fromReelSave(event)) throw new Error('Download settings are only available in ReelSave.');
    const selection = await dialog.showOpenDialog(window, { title: 'Choose ReelSave download folder',
      defaultPath: downloadSettings.get().folder, properties: ['openDirectory', 'createDirectory'] });
    return selection.canceled ? { ...downloadSettings.get(), canceled: true } : downloadSettings.save(selection.filePaths[0]);
  });
  ipcMain.handle('download-location:open', async event => {
    if (!fromReelSave(event)) throw new Error('Download settings are only available in ReelSave.');
    const error = await shell.openPath(downloadSettings.get().folder);
    if (error) throw new Error('Windows could not open the download folder.');
    return { opened: true };
  });
  ipcMain.handle('media:download', async (event, request) => {
    if (!fromReelSave(event)) throw new Error('Downloads are only available in ReelSave.');
    const format = request?.format === 'audio' ? 'audio' : request?.format === 'video' ? 'video' : null;
    const qualities = format === 'audio' ? ['hi', 'lo'] : ['hd', 'sd'];
    if (!format || !qualities.includes(request?.quality)) throw new Error('Choose a valid format and quality.');
    let source;
    try { source = new URL(request?.url); } catch { throw new Error('Enter a valid video link.'); }
    if (!['http:', 'https:'].includes(source.protocol) || source.href.length > 5000) throw new Error('Enter a valid video link.');
    let response;
    try {
      response = await fetch(`${baseUrl}/api/download-${format}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ReelSave-Desktop-Token': token },
        body: JSON.stringify({ url: source.href, format, quality: request.quality }), signal: AbortSignal.timeout(15 * 60 * 1000),
      });
    } catch {
      diagnostics.capture({ stage: 'engine', code: 'network_error' });
      throw new Error('ReelSave lost its connection to the download engine. Reopen the app and try again.');
    }
    if (!response.ok) {
      let message = `Download failed (${response.status}).`;
      try { const body = await response.json(); if (typeof body.detail === 'string') message = body.detail; } catch { /* Keep generic error. */ }
      throw new Error(friendlyDownloadError(message, response.status));
    }
    const extension = format === 'audio' ? 'mp3' : 'mp4';
    const filename = filenameFromDisposition(response.headers.get('content-disposition'), `download.${extension}`);
    const destination = await downloadSettings.destination(filename, `download.${extension}`);
    try {
      if (!response.body) throw new Error('The download returned no file data.');
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination, { flags: 'wx' }));
      return { filename: path.basename(destination), folder: path.dirname(destination) };
    } catch {
      diagnostics.capture({ stage: 'save', code: 'save_interrupted' });
      try { await fs.promises.unlink(destination); } catch { /* No partial file to remove. */ }
      throw new Error('ReelSave could not save the file. Check the folder access and available disk space.');
    } finally { downloadSettings.release(destination); }
  });
  for (const [name, handler] of Object.entries({
    list: () => diagnostics.list(), clear: () => diagnostics.clear(), open: id => diagnostics.open(id),
    capture: input => {
      // The renderer can only signal these two generic failures; it cannot submit raw text.
      if (input === 'engine_unreachable') diagnostics.capture({ stage: 'engine', code: 'network_error' });
      else if (input === 'renderer_error') diagnostics.capture({ stage: 'renderer', code: 'renderer_error' });
    },
  })) {
    ipcMain.handle(`diagnostics:${name}`, (event, input) => {
      if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(`${baseUrl}/`)) {
        throw new Error('Diagnostic reports are only available in ReelSave.');
      }
      return handler(input);
    });
  }
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
  window.webContents.on('did-fail-load', (_event, code, description) => {
    desktopLog(`UI load failed ${code}: ${description}`);
    diagnostics.capture({ stage: 'renderer', code: 'renderer_error' });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    desktopLog(`UI stopped: ${details.reason}`);
    diagnostics.capture({ stage: 'renderer', code: 'renderer_error' });
  });
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
  if (runtimeWindow && !runtimeWindow.isDestroyed()) runtimeWindow.close();
  await ensureStableShortcut({ app, shell, sourceIcon: path.join(__dirname, 'icon.ico') }).catch(error => desktopLog(`Shortcut refresh failed: ${error.message}`));
  updateHealth.markHealthy();
  cleanupLegacyRuntimes(app.getPath('userData')).then(count => {
    if (count) desktopLog(`Removed ${count} legacy runtime director${count === 1 ? 'y' : 'ies'}.`);
  }).catch(error => desktopLog(`Legacy runtime cleanup failed: ${error.message}`));
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

const fs = require('node:fs');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');
const { verifyUpdate } = require('./verify-update.cjs');

function createUpdater(app, beforeInstall) {
  let state = { current: app.getVersion(), status: 'idle', latest: null, progress: 0, error: null };
  let checking = false;
  let verified = false;
  let releaseRestart;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  const fail = error => {
    state = { ...state, status: 'error', error: error.message.slice(0, 600) };
    if (releaseRestart) { const release = releaseRestart; releaseRestart = null; release().catch(() => {}); }
  };
  autoUpdater.on('error', fail);
  autoUpdater.on('update-available', info => { verified = false; state = { ...state, status: 'available', latest: info.version, error: null }; });
  autoUpdater.on('update-not-available', () => { state = { ...state, status: 'current', error: null }; });
  autoUpdater.on('download-progress', progress => { state = { ...state, status: 'downloading', progress: Math.round(progress.percent) }; });
  autoUpdater.on('update-downloaded', async info => {
    state = { ...state, status: 'verifying' };
    try {
      if (!/^\d+\.\d+\.\d+$/.test(info.version)) throw new Error('Invalid release version.');
      const base = `https://github.com/dina-202/reel_save/releases/download/v${info.version}`;
      const responses = await Promise.all(['release-manifest.json', 'release-manifest.sig'].map(name => fetch(`${base}/${name}`, { signal: AbortSignal.timeout(30000) })));
      if (responses.some(response => !response.ok)) throw new Error('This release is missing its signed update files.');
      const [manifestBytes, signature] = await Promise.all([responses[0].arrayBuffer(), responses[1].text()]);
      await verifyUpdate({ file: info.downloadedFile, manifestBytes: Buffer.from(manifestBytes), signature,
        publicKey: fs.readFileSync(path.join(__dirname, 'update-public-key.pem')), version: info.version });
      verified = true;
      state = { ...state, status: 'ready', error: null };
    } catch (error) { verified = false; fail(error); }
  });
  return {
    status: () => ({ ...state }),
    async check() {
      if (!app.isPackaged) { state = { ...state, status: 'development', error: 'App updates are enabled in the installed Windows edition.' }; return state; }
      if (checking || ['downloading', 'verifying', 'ready', 'installing'].includes(state.status)) return state;
      checking = true;
      state = { ...state, status: 'checking', error: null };
      try { await autoUpdater.checkForUpdates(); }
      catch (error) { fail(new Error(/404|latest release|Unable to find/i.test(error.message)
        ? 'No public app release is available yet. GitHub updates will work after the repository is public and a release is published.' : error.message)); }
      finally { checking = false; }
      return state;
    },
    async download() {
      if (state.status !== 'available') return state;
      state = { ...state, status: 'downloading', error: null, progress: 0 };
      autoUpdater.downloadUpdate().catch(fail);
      return state;
    },
    async install() {
      if (!verified || state.status !== 'ready') throw new Error('Download and verify the app update first.');
      releaseRestart = await beforeInstall();
      state = { ...state, status: 'installing' };
      setImmediate(() => { try { autoUpdater.quitAndInstall(false, true); } catch (error) { fail(error); } });
      return state;
    },
  };
}
module.exports = { createUpdater };

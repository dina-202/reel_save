const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SESSION_BROWSERS = Object.freeze(['chrome', 'edge', 'firefox', 'brave', 'chromium', 'opera', 'vivaldi']);

function cleanFolder(value) {
  if (typeof value !== 'string') throw new Error('Enter a download folder path.');
  const trimmed = value.trim().replace(/^"(.*)"$/, '$1');
  if (!path.win32.isAbsolute(trimmed) || /^\\\\[?.]\\/.test(trimmed)) {
    throw new Error('Enter a full Windows folder path, such as C:\\Users\\Name\\Downloads.');
  }
  return path.win32.normalize(trimmed);
}

function cleanFilename(value, fallback = 'download.mp4') {
  let name = path.win32.basename(typeof value === 'string' ? value : '');
  name = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim();
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) name = fallback;
  if (name.length > 180) {
    const extension = path.win32.extname(name).slice(0, 20);
    name = name.slice(0, 180 - extension.length).replace(/[. ]+$/g, '') + extension;
  }
  return name;
}

function filenameFromDisposition(header, fallback) {
  if (typeof header !== 'string') return cleanFilename('', fallback);
  const encoded = /filename\*=utf-8''([^;]+)/i.exec(header);
  if (encoded) {
    try { return cleanFilename(decodeURIComponent(encoded[1]), fallback); } catch { /* Use regular filename. */ }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  return cleanFilename(quoted?.[1], fallback);
}

function friendlyDownloadError(value, status = 0) {
  const message = typeof value === 'string' ? value.toLowerCase() : '';
  if (status === 499 || message.includes('download stopped')) return 'Download stopped.';
  if (message.includes('requested format is not available')) return 'That quality is unavailable for this video. Try another quality setting.';
  if ((message.includes('could not copy') && message.includes('cookie')) || message.includes('cookie database') || message.includes('failed to decrypt')) return 'ReelSave could not read the browser session. Close the selected browser completely, check the profile name, and try again.';
  if (message.includes('sign in') || message.includes('log in') || message.includes('login') || message.includes('cookies')) return 'This video requires sign-in. Enable Signed-in access, choose the browser where you are signed in, close it completely, and try again.';
  if (message.includes('unsupported url')) return 'This link or website is not supported by the current downloader.';
  if (message.includes('private video') || message.includes('video unavailable') || message.includes('has been removed') || status === 404) return 'This video is unavailable, private, or has been removed.';
  if (message.includes('timed out') || message.includes('timeout')) return 'The download timed out. Check your connection and try again.';
  if (message.includes('unable to download webpage') || message.includes('connection') || message.includes('network') || message.includes('resolve host')) return 'ReelSave could not reach the source website. Check your connection and try again.';
  if (message.includes('ffmpeg') || message.includes('ffprobe')) return 'The audio/video conversion failed. Update the downloader and try again.';
  if (status === 409) return 'Another download or update is still finishing. This item will need to be tried again.';
  return 'This download failed. Use Report a problem to share privacy-filtered diagnostic details.';
}

function cleanBrowserSession(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose valid signed-in access settings.');
  const enabled = value.enabled === true;
  const browser = typeof value.browser === 'string' ? value.browser.trim().toLowerCase() : 'chrome';
  if (!SESSION_BROWSERS.includes(browser)) throw new Error('Choose a supported browser.');
  const profile = typeof value.profile === 'string' ? value.profile.trim() : '';
  if (profile.length > 100 || /[\\/:\x00-\x1f]/.test(profile) || profile === '.' || profile === '..') {
    throw new Error('Use a browser profile name such as Default or Profile 1, not a folder path.');
  }
  return { enabled, browser, profile };
}

function createDownloadSettings({ dataDir, defaultFolder }) {
  const settingsFile = path.join(dataDir, 'settings.json');
  const reserved = new Set();
  let folder = cleanFolder(defaultFolder);
  let browserSession = cleanBrowserSession();
  try {
    if (fs.existsSync(settingsFile) && fs.statSync(settingsFile).size < 16384) {
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      try { folder = cleanFolder(saved.downloadFolder); } catch { /* Keep the default folder. */ }
      try { browserSession = cleanBrowserSession(saved.browserSession); } catch { /* Keep signed-in access disabled. */ }
    }
  } catch { /* A damaged setting falls back to Downloads. */ }

  async function persist() {
    await fs.promises.mkdir(dataDir, { recursive: true });
    await fs.promises.writeFile(settingsFile, JSON.stringify({ downloadFolder: folder, browserSession }), 'utf8');
  }

  async function ensureWritable(candidate) {
    const normalized = cleanFolder(candidate);
    try {
      await fs.promises.mkdir(normalized, { recursive: true });
      if (!(await fs.promises.stat(normalized)).isDirectory()) throw new Error('not a directory');
      const probe = path.join(normalized, `.reelsave-write-test-${crypto.randomUUID()}.tmp`);
      await fs.promises.writeFile(probe, '', { flag: 'wx' });
      await fs.promises.unlink(probe);
    } catch {
      throw new Error('ReelSave cannot write to that folder. Choose another location.');
    }
    return normalized;
  }

  async function save(candidate) {
    folder = await ensureWritable(candidate);
    await persist();
    return { folder };
  }

  async function saveSession(candidate) {
    browserSession = cleanBrowserSession(candidate);
    await persist();
    return { ...browserSession };
  }

  async function destination(suggested, fallback) {
    const current = await ensureWritable(folder);
    const safe = cleanFilename(suggested, fallback);
    const extension = path.extname(safe);
    const stem = path.basename(safe, extension);
    for (let copy = 0; copy < 10000; copy++) {
      const candidate = path.join(current, `${stem}${copy ? ` (${copy})` : ''}${extension}`);
      if (!reserved.has(candidate) && !fs.existsSync(candidate)) {
        reserved.add(candidate);
        return candidate;
      }
    }
    throw new Error('Too many files with the same name exist in the download folder.');
  }

  return {
    get: () => ({ folder }), save, destination,
    session: () => ({ ...browserSession }), saveSession,
    release: candidate => reserved.delete(candidate),
  };
}

module.exports = { createDownloadSettings, cleanFolder, cleanFilename, filenameFromDisposition, friendlyDownloadError,
  cleanBrowserSession, SESSION_BROWSERS };

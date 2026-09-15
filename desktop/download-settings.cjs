const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
  if (message.includes('requested format is not available')) return 'That quality is unavailable for this video. Try the other quality setting.';
  if (message.includes('sign in') || message.includes('log in') || message.includes('login') || message.includes('cookies')) return 'This video requires a signed-in session that ReelSave cannot access.';
  if (message.includes('unsupported url')) return 'This link or website is not supported by the current downloader.';
  if (message.includes('private video') || message.includes('video unavailable') || message.includes('has been removed') || status === 404) return 'This video is unavailable, private, or has been removed.';
  if (message.includes('timed out') || message.includes('timeout')) return 'The download timed out. Check your connection and try again.';
  if (message.includes('unable to download webpage') || message.includes('connection') || message.includes('network') || message.includes('resolve host')) return 'ReelSave could not reach the source website. Check your connection and try again.';
  if (message.includes('ffmpeg') || message.includes('ffprobe')) return 'The audio/video conversion failed. Update the downloader and try again.';
  if (status === 409) return 'Another download or update is still finishing. This item will need to be tried again.';
  return 'This download failed. Use Report a problem to share privacy-filtered diagnostic details.';
}

function createDownloadSettings({ dataDir, defaultFolder }) {
  const settingsFile = path.join(dataDir, 'settings.json');
  const reserved = new Set();
  let folder = cleanFolder(defaultFolder);
  try {
    if (fs.existsSync(settingsFile) && fs.statSync(settingsFile).size < 16384) {
      const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      folder = cleanFolder(saved.downloadFolder);
    }
  } catch { /* A damaged setting falls back to Downloads. */ }

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
    await fs.promises.mkdir(dataDir, { recursive: true });
    await fs.promises.writeFile(settingsFile, JSON.stringify({ downloadFolder: folder }), 'utf8');
    return { folder };
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
    release: candidate => reserved.delete(candidate),
  };
}

module.exports = { createDownloadSettings, cleanFolder, cleanFilename, filenameFromDisposition, friendlyDownloadError };

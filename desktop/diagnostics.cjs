const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STAGES = ['metadata', 'download', 'save', 'engine', 'renderer', 'app_update', 'downloader_update', 'startup', 'general'];
const CODES = ['format_unavailable', 'timeout', 'login_required', 'rate_limited', 'access_denied',
  'media_unavailable', 'conversion_failed', 'unsupported_url', 'network_error', 'output_missing',
  'engine_error', 'engine_stopped', 'renderer_error', 'app_update_failed', 'startup_failed', 'save_interrupted', 'user_reported'];
const pick = (value, values, fallback) => values.includes(value) ? value : fallback;
const version = value => typeof value === 'string' && /^\d{1,5}(\.\d{1,5}){1,3}$/.test(value) ? value : 'unknown';

function sanitize(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  // Build a fresh object: never forward unknown fields, messages, stack traces or URLs.
  return {
    stage: pick(input.stage, STAGES, 'engine'), code: pick(input.code, CODES, 'engine_error'),
    platform: pick(input.platform, ['youtube', 'instagram', 'facebook', 'tiktok', 'reddit'], 'other'),
    format: pick(input.format, ['video', 'audio'], 'unknown'),
    quality: pick(input.quality, ['hd', 'sd', 'hi', 'lo'], 'unknown'),
    downloader: version(input.downloader),
    http_status: Number.isInteger(input.http_status) && input.http_status >= 400 && input.http_status <= 599 ? input.http_status : 0,
  };
}

function reportText(report) {
  const safe = sanitize(report);
  const fields = { 'App version': version(report.app), 'Electron version': version(report.electron),
    'Windows version': version(report.windows), Architecture: pick(report.arch, ['x64', 'arm64', 'ia32'], 'unknown'),
    'yt-dlp version': safe.downloader, Stage: safe.stage, 'Error category': safe.code,
    Platform: safe.platform, Format: safe.format, Quality: safe.quality,
    'HTTP status': safe.http_status || 'not available' };
  return 'Privacy-filtered diagnostic report from ReelSave.\n\n' +
    Object.entries(fields).map(([key, value]) => `- ${key}: ${value}`).join('\n') +
    '\n\nNo video links, titles, account names, file paths, cookies, tokens or raw logs are included.\n' +
    '\nOptional: describe what happened without adding private information.\n';
}

function createDiagnostics({ directory, appVersion, electronVersion, windowsVersion, arch, openExternal }) {
  const file = path.join(directory, 'diagnostics.json');
  const environment = { app: version(appVersion), electron: version(electronVersion), windows: version(windowsVersion),
    arch: pick(arch, ['x64', 'arm64', 'ia32'], 'unknown') };
  let records = [];
  const general = { ...sanitize({ stage: 'general', code: 'user_reported' }), ...environment, id: 'general' };
  let storageError = false;
  try {
    if (fs.existsSync(file) && fs.statSync(file).size <= 64000) {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(saved)) records = saved.slice(0, 20).filter(r => r && typeof r === 'object').map(r => ({
        ...sanitize(r), app: version(r.app), electron: version(r.electron), windows: version(r.windows),
        arch: pick(r.arch, ['x64', 'arm64', 'ia32'], 'unknown'), id: crypto.randomUUID(),
      }));
    }
  } catch { storageError = true; }
  function persist() {
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(records));
      fs.renameSync(file + '.tmp', file);
      storageError = false;
    } catch { storageError = true; }
  }
  return {
    capture(input) {
      const clean = { ...sanitize(input), ...environment };
      const match = records.find(r => Object.keys(clean).every(key => r[key] === clean[key]));
      records = [match || { ...clean, id: crypto.randomUUID() }, ...records.filter(r => r !== match)].slice(0, 20);
      persist();
    },
    list() { return { records: [...records, general].map(r => ({ id: r.id, stage: r.stage, code: r.code, text: reportText(r) })), storageError }; },
    clear() { records = []; persist(); return this.list(); },
    async open(id) {
      const record = id === 'general' ? general : records.find(r => r.id === id);
      if (!record) throw new Error('Select a saved diagnostic report first.');
      const url = new URL('https://github.com/dina-202/reel_save/issues/new');
      url.searchParams.set('title', `[ReelSave ${version(record.app)}] ${record.stage}: ${record.code}`);
      url.searchParams.set('body', reportText(record));
      await openExternal(url.href);
      return { opened: true }; // Opening the form is not submitting an issue.
    },
  };
}
module.exports = { createDiagnostics, sanitize, reportText };

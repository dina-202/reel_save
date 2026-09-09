const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDiagnostics, sanitize } = require('./diagnostics.cjs');

function fixture(t, directory) {
  directory ||= fs.mkdtempSync(path.join(os.tmpdir(), 'reelsave-reports-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const opened = [];
  const options = { directory, appVersion: '1.0.3', electronVersion: '44.2.0', windowsVersion: '10.0.26100',
    arch: 'x64', openExternal: async url => opened.push(url) };
  return { reports: createDiagnostics(options), options, opened, directory };
}

test('raw secrets and unknown fields never reach storage, preview or GitHub; opening is explicit', async t => {
  const { reports, opened, directory } = fixture(t);
  reports.capture({ stage: 'metadata', code: 'format_unavailable', platform: 'instagram', quality: 'hd',
    downloader: '2026.8.19', format: 'video', http_status: 400, url: 'https://instagram.com/private',
    error: 'C:\\Users\\SECRET_USER token=SECRET_COOKIE', title: 'SECRET_TITLE', stack: 'SECRET_TRACE' });
  assert.equal(opened.length, 0);
  const { records } = reports.list();
  assert.equal(records.length, 2); // Saved failure + general report.
  assert.match(records[0].text, /format_unavailable/);
  const stored = fs.readFileSync(path.join(directory, 'diagnostics.json'), 'utf8');
  assert.doesNotMatch(stored + records[0].text, /SECRET|instagram\.com|C:\\/);
  await reports.open(records[0].id);
  const url = new URL(opened[0]);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/dina-202/reel_save/issues/new');
  assert.equal(url.searchParams.get('body'), records[0].text);
  assert.doesNotMatch(url.href, /SECRET/);
  await assert.rejects(reports.open('https://evil.test'), /Select/);
  assert.equal(opened.length, 1);
});

test('all variable fields reject private strings, including malicious version and platform values', () => {
  const output = sanitize(Object.fromEntries(['stage', 'code', 'platform', 'format', 'quality', 'downloader', 'http_status']
    .map(key => [key, 'SECRET@example.com'])));
  assert.doesNotMatch(JSON.stringify(output), /SECRET/);
  assert.equal(output.http_status, 0);
  assert.doesNotThrow(() => sanitize(null));
});

test('history survives restart, deduplicates, is bounded and can be cleared', t => {
  const { reports, options } = fixture(t);
  const event = { stage: 'download', code: 'timeout', downloader: '2026.8.19' };
  reports.capture(event);
  reports.capture(event);
  assert.equal(reports.list().records.length, 2);
  for (let i = 0; i < 30; i++) reports.capture({ ...event, http_status: 400 + i });
  assert.equal(reports.list().records.length, 21);
  const restarted = createDiagnostics(options);
  assert.equal(restarted.list().records.length, 21);
  assert.equal(restarted.clear().records.length, 1);
  assert.equal(createDiagnostics(options).list().records.length, 1);
});

test('tampered local history cannot add private content to outgoing reports', async t => {
  const { options, directory, opened } = fixture(t);
  fs.writeFileSync(path.join(directory, 'diagnostics.json'), JSON.stringify([{ app: 'SECRET', electron: 'SECRET',
    windows: 'SECRET', arch: 'SECRET', code: 'SECRET', id: 'SECRET', stage: 'SECRET', body: 'SECRET' }]));
  const reports = createDiagnostics(options);
  const record = reports.list().records[0];
  await reports.open(record.id);
  assert.doesNotMatch(record.text + opened[0], /SECRET/);
});

test('storage failure keeps diagnostics usable and never interrupts the app', t => {
  const { directory, options } = fixture(t);
  const blocked = path.join(directory, 'file-not-directory');
  fs.writeFileSync(blocked, 'test');
  const reports = createDiagnostics({ ...options, directory: blocked });
  assert.doesNotThrow(() => reports.capture({ code: 'timeout' }));
  assert.equal(reports.list().storageError, true);
  assert.equal(reports.list().records.length, 2);
});

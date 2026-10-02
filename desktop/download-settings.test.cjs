const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDownloadSettings, cleanFolder, cleanFilename, filenameFromDisposition, friendlyDownloadError,
  cleanBrowserSession, cleanCookieFile } = require('./download-settings.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reelsave-downloads-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data');
  const defaultFolder = path.join(root, 'downloads');
  return { root, dataDir, defaultFolder, settings: createDownloadSettings({ dataDir, defaultFolder }) };
}

test('saves and reloads a writable absolute download folder', async t => {
  const { root, dataDir, defaultFolder, settings } = fixture(t);
  assert.equal(settings.get().folder, defaultFolder);
  const chosen = path.join(root, 'My Videos');
  assert.equal((await settings.save(chosen)).folder, chosen);
  assert.equal(createDownloadSettings({ dataDir, defaultFolder }).get().folder, chosen);
  assert.equal(fs.existsSync(chosen), true);
});

test('rejects relative paths, device paths, and files', async t => {
  const { root, settings } = fixture(t);
  assert.throws(() => cleanFolder('relative\\downloads'), /full Windows/);
  assert.throws(() => cleanFolder('\\\\?\\C:\\private'), /full Windows/);
  const file = path.join(root, 'not-a-folder');
  fs.writeFileSync(file, 'x');
  await assert.rejects(settings.save(file), /cannot write/);
});

test('saves signed-in browser choice without storing cookies', async t => {
  const { dataDir, defaultFolder, settings } = fixture(t);
  const saved = await settings.saveSession({ enabled: true, browser: 'edge', profile: 'Profile 1' });
  assert.deepEqual(saved, { enabled: true, method: 'browser', browser: 'edge', profile: 'Profile 1', cookieFile: '' });
  assert.deepEqual(createDownloadSettings({ dataDir, defaultFolder }).session(), saved);
  const contents = fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8');
  assert.doesNotMatch(contents, /SECRET_COOKIE|token|password/i);
});

test('saves a readable cookies file path without copying its contents', async t => {
  const { root, dataDir, settings } = fixture(t);
  const cookieFile = path.join(root, 'cookies.txt');
  fs.writeFileSync(cookieFile, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tSECRET_COOKIE');
  const saved = await settings.saveSession({ enabled: true, method: 'cookies', browser: 'chrome',
    profile: '', cookieFile });
  assert.equal(saved.cookieFile, cookieFile);
  const contents = fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8');
  assert.match(contents, /cookies\.txt/);
  assert.doesNotMatch(contents, /SECRET_COOKIE/);
});

test('rejects missing and relative cookies files', async t => {
  const { settings } = fixture(t);
  assert.throws(() => cleanCookieFile('cookies.txt'), /full path/);
  await assert.rejects(settings.saveSession({ enabled: true, method: 'cookies', browser: 'chrome',
    profile: '', cookieFile: 'C:\\Missing\\cookies.txt' }), /readable cookies/);
});

test('rejects unsupported browsers and profile paths', () => {
  assert.throws(() => cleanBrowserSession({ enabled: true, browser: 'unknown', profile: '' }), /supported browser/);
  assert.throws(() => cleanBrowserSession({ enabled: true, browser: 'chrome', profile: 'C:\\Private' }), /profile name/);
  assert.throws(() => cleanBrowserSession({ enabled: true, browser: 'chrome', profile: '..' }), /profile name/);
});

test('sanitizes response filenames and decodes UTF-8 content disposition', () => {
  assert.equal(cleanFilename('..\\CON.mp4'), 'download.mp4');
  assert.equal(cleanFilename('..\\bad<name>.mp4'), 'bad_name_.mp4');
  assert.equal(cleanFilename(`${'a'.repeat(220)}.mp4`).length, 180);
  assert.match(cleanFilename(`${'a'.repeat(220)}.mp4`), /\.mp4$/);
  assert.equal(filenameFromDisposition("attachment; filename*=utf-8''My%20Reel%20%F0%9F%8E%AC.mp4", 'download.mp4'), 'My Reel 🎬.mp4');
  assert.equal(filenameFromDisposition('attachment; filename="video.mp4"', 'download.mp4'), 'video.mp4');
});

test('never overwrites existing files and reserves concurrent names', async t => {
  const { defaultFolder, settings } = fixture(t);
  await settings.save(defaultFolder);
  fs.writeFileSync(path.join(defaultFolder, 'video.mp4'), 'existing');
  const first = await settings.destination('video.mp4', 'download.mp4');
  const second = await settings.destination('video.mp4', 'download.mp4');
  assert.equal(path.basename(first), 'video (1).mp4');
  assert.equal(path.basename(second), 'video (2).mp4');
  settings.release(first);
  assert.equal(path.basename(await settings.destination('video.mp4', 'download.mp4')), 'video (1).mp4');
});

test('download errors are useful and never expose raw private text', () => {
  assert.equal(friendlyDownloadError('Download stopped.', 499), 'Download stopped.');
  assert.match(friendlyDownloadError('ERROR: Requested format is not available SECRET_TOKEN'), /quality is unavailable/);
  assert.match(friendlyDownloadError('Unable to download webpage C:\\Users\\Private SECRET_TOKEN'), /could not reach/);
  assert.match(friendlyDownloadError('ERROR: Sign in to confirm your age'), /Enable Signed-in access/);
  assert.match(friendlyDownloadError('Could not copy Chrome cookie database'), /Close the selected browser/);
  assert.match(friendlyDownloadError('unknown failure SECRET_TOKEN'), /Report a problem/);
  for (const message of [
    friendlyDownloadError('ERROR: Requested format is not available SECRET_TOKEN'),
    friendlyDownloadError('Unable to download webpage C:\\Users\\Private SECRET_TOKEN'),
    friendlyDownloadError('unknown failure SECRET_TOKEN'),
  ]) assert.doesNotMatch(message, /SECRET|Private|C:\\/);
});

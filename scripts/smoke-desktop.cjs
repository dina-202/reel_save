// Run with: node_modules/.bin/electron scripts/smoke-desktop.cjs
// Uses an isolated profile and intercepts browser opening; never submits an issue.
const { app, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
const profile = fs.mkdtempSync(path.join(root, 'build', 'desktop-smoke-'));
const downloadFolder = path.join(profile, 'downloads');
process.env.REELSAVE_DATA_DIR = profile;
app.getVersion = () => require('../package.json').version;
const opened = [];
let saveDialogs = 0;
shell.openExternal = async url => { opened.push(url); };
dialog.showSaveDialog = async () => { saveDialogs++; throw new Error('Unexpected save dialog'); };
const timeout = setTimeout(() => { console.error('Desktop smoke test timed out'); process.exitCode = 1; app.quit(); }, 240000);
app.on('browser-window-created', (_event, window) => {
  window.hide();
  window.webContents.once('did-finish-load', async () => {
    const run = code => window.webContents.executeJavaScript(code, true);
    async function until(code, attempts = 80) {
      for (let i = 0; i < attempts; i++) {
        if (await run(code)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Condition timed out: ${code}`);
    }
    try {
      await until('!!document.querySelector(".rs-report__trigger")');
      // This fails before running yt-dlp or contacting a video platform.
      assert.equal(await run(`fetch('/api/download-video', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:''})}).then(r => r.status)`), 400);
      await until(`window.reelSaveDesktop.diagnosticReports().then(r => r.records.some(x => x.stage === 'download'))`);
      await run('document.querySelector(".rs-report__trigger").click()');
      await until('!!document.querySelector(".rs-report[open] #report-choice option")');
      const preview = await run('document.querySelector(".rs-report__preview").textContent');
      assert.match(preview, /App version: 1\.0\./);
      assert.match(preview, /No video links/);
      assert.equal(opened.length, 0);
      await run('document.querySelector(".rs-report__actions .rs-btn").click()');
      await until('document.querySelector(".rs-report").textContent.includes("nothing has been submitted yet")');
      assert.equal(opened.length, 1);
      assert.equal(new URL(opened[0]).searchParams.get('body'), preview);
      assert.equal(new URL(opened[0]).pathname, '/dina-202/reel_save/issues/new');
      window.setSize(1120, 850);
      await new Promise(resolve => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(root, 'build', 'report-preview.png'), (await window.webContents.capturePage()).toPNG());
      window.setSize(430, 850);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(await run('document.querySelector(".rs-report").scrollWidth <= document.querySelector(".rs-report").clientWidth'), true);
      fs.writeFileSync(path.join(root, 'build', 'report-preview-narrow.png'), (await window.webContents.capturePage()).toPNG());
      await run('document.querySelector(".rs-report__actions .rs-updater__details").click()');
      await until('document.querySelectorAll("#report-choice option").length === 1');
      await run('document.querySelector(".rs-report__close").click()');
      await until('!document.querySelector(".rs-report").open');
      await run(`(() => {
        const input = document.querySelector('#download-folder');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(downloadFolder)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await until('!document.querySelector(".rs-location .rs-btn--purple").disabled');
      await run('document.querySelector(".rs-location .rs-btn--purple").click()');
      await until(`window.reelSaveDesktop.downloadLocation().then(value => value.folder === ${JSON.stringify(downloadFolder)})`);
      window.setSize(1120, 850);
      const paste = value => run(`(() => {
        const event = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: { getData: () => ${JSON.stringify(value)} } });
        document.querySelector('[aria-label="Video links"]').dispatchEvent(event);
      })()`);
      await paste('https://www.youtube.com/watch?v=jNQXAC9IVRw');
      await until('document.querySelectorAll(".rs-queue__item").length === 1');
      assert.equal(await run('document.querySelector("textarea").value'), '');
      await until('!!document.querySelector(".rs-queue__item.is-saved")', 1800);
      const files = fs.readdirSync(downloadFolder);
      assert.equal(files.length, 1);
      assert.match(files[0], /\.mp4$/i);
      assert.notEqual(files[0].toLowerCase(), 'download.mp4');
      assert.ok(fs.statSync(path.join(downloadFolder, files[0])).size > 1000);
      assert.equal(saveDialogs, 0);
      await paste('http://127.0.0.1:9/bulk-one\nhttp://127.0.0.1:9/bulk-two');
      await until('document.querySelectorAll(".rs-queue__item").length === 3');
      await until('document.querySelectorAll(".rs-queue__item.is-error").length === 2', 900);
      await run(`(() => {
        const input = document.querySelector('textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'http://127.0.0.1:9/manual-link');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await run('document.querySelector(".rs-input-row > .rs-btn").click()');
      await until('document.querySelectorAll(".rs-queue__item").length === 4');
      await until('document.querySelectorAll(".rs-queue__item.is-error").length === 3', 450);
      await run('document.querySelector(".rs-queue").scrollIntoView({block:"start"})');
      await new Promise(resolve => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(root, 'build', 'download-queue.png'), (await window.webContents.capturePage()).toPNG());
      window.setSize(430, 850);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(await run('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), true);
      fs.writeFileSync(path.join(root, 'build', 'download-queue-narrow.png'), (await window.webContents.capturePage()).toPNG());
      console.log('Desktop diagnostics, saved folder, paste-to-download, no save dialog, filenames, bulk queue, and narrow layout passed.');
    } catch (error) { console.error(error); process.exitCode = 1; }
    finally { clearTimeout(timeout); app.quit(); }
  });
});
require('../desktop/main.cjs');

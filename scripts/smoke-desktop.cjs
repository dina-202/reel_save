// Run with: node_modules/.bin/electron scripts/smoke-desktop.cjs
// Uses an isolated profile and intercepts browser opening; never submits an issue.
const { app, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
process.env.REELSAVE_DATA_DIR = fs.mkdtempSync(path.join(root, 'build', 'desktop-smoke-'));
app.getVersion = () => require('../package.json').version;
const opened = [];
shell.openExternal = async url => { opened.push(url); };
const timeout = setTimeout(() => { console.error('Desktop smoke test timed out'); process.exitCode = 1; app.quit(); }, 60000);
app.on('browser-window-created', (_event, window) => {
  window.hide();
  window.webContents.once('did-finish-load', async () => {
    const run = code => window.webContents.executeJavaScript(code, true);
    async function until(code) {
      for (let i = 0; i < 80; i++) {
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
      console.log('Desktop IPC, backend diagnostic capture, preview, manual report URL, clearing and narrow layout passed.');
    } catch (error) { console.error(error); process.exitCode = 1; }
    finally { clearTimeout(timeout); app.quit(); }
  });
});
require('../desktop/main.cjs');

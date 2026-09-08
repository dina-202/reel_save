const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { EventEmitter } = require('node:events');

function harness({ valid = true, beforeInstall = async () => async () => {} } = {}) {
  const engine = new EventEmitter();
  let installed = 0;
  engine.checkForUpdates = async () => engine.emit('update-available', { version: '1.0.1' });
  engine.downloadUpdate = async () => {};
  engine.quitAndInstall = () => installed++;
  const context = { module: { exports: {} }, __dirname, Buffer, setImmediate, AbortSignal,
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0), text: async () => 'signature' }),
    require(name) {
      if (name === 'electron-updater') return { autoUpdater: engine };
      if (name === 'node:fs') return { readFileSync: () => 'public-key' };
      if (name === './verify-update.cjs') return { verifyUpdate: async () => { if (!valid) throw new Error('Invalid signature'); } };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'app-updater.cjs'), 'utf8'), context);
  const updater = context.module.exports.createUpdater({ getVersion: () => '1.0.0', isPackaged: true }, beforeInstall);
  return { engine, updater, installed: () => installed };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('app update only installs after download, verification, and restart reservation', async () => {
  let reserved = 0;
  const { updater, engine, installed } = harness({ beforeInstall: async () => { reserved++; return async () => {}; } });
  assert.equal(engine.autoDownload, false);
  assert.equal(engine.autoInstallOnAppQuit, false);
  assert.equal(engine.allowDowngrade, false);
  await assert.rejects(updater.install(), /verify/);
  await updater.check();
  assert.equal(updater.status().status, 'available');
  await updater.download();
  engine.emit('update-downloaded', { version: '1.0.1', downloadedFile: 'test.exe' });
  await tick();
  assert.equal(updater.status().status, 'ready');
  await updater.install();
  await tick();
  assert.equal(reserved, 1);
  assert.equal(installed(), 1);
});

test('invalid signature blocks app installation', async () => {
  const { updater, engine, installed } = harness({ valid: false });
  await updater.check();
  await updater.download();
  engine.emit('update-downloaded', { version: '1.0.1', downloadedFile: 'test.exe' });
  await tick();
  assert.equal(updater.status().status, 'error');
  await assert.rejects(updater.install(), /verify/);
  assert.equal(installed(), 0);
});

test('running download prevents restart and keeps verified update ready', async () => {
  const { updater, engine, installed } = harness({ beforeInstall: async () => { throw new Error('Download running'); } });
  await updater.check();
  engine.emit('update-downloaded', { version: '1.0.1', downloadedFile: 'test.exe' });
  await tick();
  await assert.rejects(updater.install(), /Download running/);
  assert.equal(updater.status().status, 'ready');
  assert.equal(installed(), 0);
});

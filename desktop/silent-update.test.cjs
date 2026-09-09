const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({ verify = async () => {}, beforeInstall = async () => () => Promise.resolve() } = {}) {
  const listeners = {};
  const calls = [];
  const reports = [];
  const updater = { on: (name, fn) => { listeners[name] = fn; }, quitAndInstall: (...args) => calls.push(args) };
  const context = { module: { exports: {} }, __dirname, Buffer, AbortSignal, setImmediate,
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0), text: async () => 'signature' }),
    require: name => name === 'electron-updater' ? { autoUpdater: updater }
      : name === './verify-update.cjs' ? { verifyUpdate: verify } : require(name) };
  vm.runInNewContext(fs.readFileSync(require.resolve('./app-updater.cjs'), 'utf8'), context);
  const app = context.module.exports.createUpdater({ getVersion: () => '1.0.3', isPackaged: true }, beforeInstall,
    event => reports.push(event));
  return { app, listeners, calls, reports, updater };
}

test('only a verified update installs silently and forces app restart', async () => {
  let reserved = false;
  const { app, listeners, calls } = fixture({ beforeInstall: async () => { reserved = true; } });
  await assert.rejects(app.install(), /verify/);
  assert.equal(calls.length, 0);
  await listeners['update-downloaded']({ version: '1.0.4', downloadedFile: 'test.exe' });
  await app.install();
  await new Promise(setImmediate);
  assert.equal(reserved, true);
  assert.deepEqual(calls, [[true, true]]);
});

test('signature failure prevents installation and reports no private error text', async () => {
  const { app, listeners, calls, reports } = fixture({ verify: async () => { throw new Error('SECRET local path signature failure'); } });
  await listeners['update-downloaded']({ version: '1.0.4', downloadedFile: 'test.exe' });
  await assert.rejects(app.install(), /verify/);
  assert.equal(calls.length, 0);
  assert.doesNotMatch(JSON.stringify(reports), /SECRET/);
  assert.equal(reports[0].code, 'app_update_failed');
});

test('active transfers prevent silent install; installer failure releases restart reservation', async () => {
  const busy = fixture({ beforeInstall: async () => { throw new Error('download active'); } });
  await busy.listeners['update-downloaded']({ version: '1.0.4' });
  await assert.rejects(busy.app.install(), /download active/);
  assert.equal(busy.calls.length, 0);
  let released = false;
  const failure = fixture({ beforeInstall: async () => async () => { released = true; } });
  failure.updater.quitAndInstall = () => { throw new Error('installer failed'); };
  await failure.listeners['update-downloaded']({ version: '1.0.4' });
  await failure.app.install();
  await new Promise(setImmediate);
  assert.equal(released, true);
  assert.equal(failure.app.status().status, 'error');
});

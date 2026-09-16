const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureStableShortcut } = require('./shortcut-manager.cjs');

test('installed app creates a shortcut backed by an icon outside the install folder', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reelsave-shortcut-'));
  const sourceIcon = path.join(root, 'source.ico');
  await fs.promises.writeFile(sourceIcon, 'icon');
  const calls = [];
  const app = { isPackaged: true, getPath: name => path.join(root, name) };
  const result = await ensureStableShortcut({ app, shell: { writeShortcutLink: (...args) => { calls.push(args); return true; } },
    sourceIcon, executable: 'C:\\Program Files\\ReelSave\\ReelSave.exe' });
  assert.equal(result.managed, true);
  assert.equal(calls[0][1], 'create');
  assert.match(calls[0][2].icon, /assets[\\/]reelsave\.ico$/);
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('a deliberately deleted managed shortcut stays deleted', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reelsave-shortcut-'));
  const sourceIcon = path.join(root, 'source.ico');
  await fs.promises.writeFile(sourceIcon, 'icon');
  await fs.promises.mkdir(path.join(root, 'userData', 'assets'), { recursive: true });
  await fs.promises.writeFile(path.join(root, 'userData', 'assets', 'desktop-shortcut.json'), '{}');
  let calls = 0;
  await ensureStableShortcut({ app: { isPackaged: true, getPath: name => path.join(root, name) },
    shell: { writeShortcutLink: () => { calls++; return true; } }, sourceIcon });
  assert.equal(calls, 0);
  await fs.promises.rm(root, { recursive: true, force: true });
});

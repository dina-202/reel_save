const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runtimeReady, verifyManifest, RUNTIME_FILE } = require('./runtime-manager.cjs');
const { spawnSync } = require('node:child_process');

test('runtime readiness requires the marker and every executable', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reelsave-runtime-'));
  assert.equal(runtimeReady(root), false);
  for (const file of ['.ready.json', 'python/python.exe', 'bin/ffmpeg.exe', 'bin/ffprobe.exe', 'bin/node.exe']) {
    await fs.promises.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.promises.writeFile(path.join(root, file), 'test');
  }
  assert.equal(runtimeReady(root), true);
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('runtime manifest must be signed and name the fixed package', () => {
  const keys = crypto.generateKeyPairSync('ed25519');
  const bytes = Buffer.from(JSON.stringify({ runtime: { schema: 1, file: RUNTIME_FILE, sha256: 'a'.repeat(64) } }));
  const signature = crypto.sign(null, bytes, keys.privateKey).toString('base64');
  assert.equal(verifyManifest(bytes, signature, keys.publicKey).file, RUNTIME_FILE);
  assert.throws(() => verifyManifest(Buffer.from('{}'), signature, keys.publicKey), /signature/);
});

test('signed runtime package downloads, verifies, and expands atomically', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reelsave-runtime-package-'));
  const source = path.join(root, 'source');
  for (const file of ['python/python.exe', 'bin/ffmpeg.exe', 'bin/ffprobe.exe', 'bin/node.exe']) {
    await fs.promises.mkdir(path.dirname(path.join(source, file)), { recursive: true });
    await fs.promises.writeFile(path.join(source, file), file);
  }
  const archive = path.join(root, RUNTIME_FILE);
  const zipped = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Compress-Archive -Path "$env:REELSAVE_TEST_SOURCE\\*" -DestinationPath $env:REELSAVE_TEST_ARCHIVE'],
  { windowsHide: true, encoding: 'utf8', env: { ...process.env, REELSAVE_TEST_SOURCE: source, REELSAVE_TEST_ARCHIVE: archive } });
  assert.equal(zipped.status, 0, zipped.stderr);
  const archiveBytes = await fs.promises.readFile(archive);
  const keys = crypto.generateKeyPairSync('ed25519');
  const digest = crypto.createHash('sha256').update(archiveBytes).digest('hex');
  const manifestBytes = Buffer.from(JSON.stringify({ runtime: { schema: 1, file: RUNTIME_FILE, sha256: digest } }));
  const signature = crypto.sign(null, manifestBytes, keys.privateKey).toString('base64');
  const { ensureRuntime } = require('./runtime-manager.cjs');
  const fetchImpl = async url => url.endsWith('release-manifest.json') ? new Response(manifestBytes)
    : url.endsWith('release-manifest.sig') ? new Response(signature)
      : new Response(archiveBytes, { headers: { 'content-length': String(archiveBytes.length) } });
  const installed = await ensureRuntime({ dataDir: path.join(root, 'data'), publicKey: keys.publicKey, fetchImpl });
  assert.equal(runtimeReady(installed), true);
  assert.equal(await fs.promises.readFile(path.join(installed, 'bin', 'node.exe'), 'utf8'), 'bin/node.exe');
  assert.equal((await fs.promises.readdir(path.join(root, 'data', 'runtime'))).some(name => name.startsWith('.runtime-')), false);
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('legacy versioned runtime copies are removed after migration', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reelsave-runtime-cleanup-'));
  const legacy = path.join(root, 'runtime', '1.0.4', 'python');
  await fs.promises.mkdir(legacy, { recursive: true });
  await fs.promises.writeFile(path.join(legacy, '.ready'), '1.0.4');
  await fs.promises.writeFile(path.join(legacy, 'python.exe'), 'test');
  await fs.promises.mkdir(path.join(root, 'runtime', 'shared-v1'), { recursive: true });
  const { cleanupLegacyRuntimes } = require('./runtime-manager.cjs');
  assert.equal(await cleanupLegacyRuntimes(root), 1);
  assert.equal(fs.existsSync(path.join(root, 'runtime', '1.0.4')), false);
  assert.equal(fs.existsSync(path.join(root, 'runtime', 'shared-v1')), true);
  await fs.promises.rm(root, { recursive: true, force: true });
});

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const RUNTIME_SCHEMA = 1;
const RUNTIME_FILE = 'ReelSave-Runtime-Windows-x64-v1.zip';
const RUNTIME_RELEASE = 'v1.0.5';
const RELEASE_BASE = `https://github.com/dina-202/reel_save/releases/download/${RUNTIME_RELEASE}`;

function runtimeReady(directory) {
  return fs.existsSync(path.join(directory, '.ready.json'))
    && fs.existsSync(path.join(directory, 'python', 'python.exe'))
    && fs.existsSync(path.join(directory, 'bin', 'ffmpeg.exe'))
    && fs.existsSync(path.join(directory, 'bin', 'ffprobe.exe'))
    && fs.existsSync(path.join(directory, 'bin', 'node.exe'));
}

function verifyManifest(bytes, signature, publicKey) {
  const cleanSignature = String(signature).trim();
  if (!cleanSignature || !crypto.verify(null, bytes, publicKey, Buffer.from(cleanSignature, 'base64'))) {
    throw new Error('The runtime package signature is invalid.');
  }
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('The runtime package manifest is invalid.'); }
  const runtime = manifest?.runtime;
  if (runtime?.schema !== RUNTIME_SCHEMA || runtime?.file !== RUNTIME_FILE || !/^[a-f0-9]{64}$/.test(runtime?.sha256 || '')) {
    throw new Error('The signed runtime package details are invalid.');
  }
  return runtime;
}

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function downloadFile(response, destination, onProgress) {
  if (!response.ok || !response.body) throw new Error('The ReelSave download engine could not be downloaded.');
  const total = Number(response.headers.get('content-length')) || 0;
  let received = 0;
  let lastPercent = -1;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      const percent = total ? Math.min(99, Math.floor((received / total) * 100)) : 0;
      if (percent !== lastPercent) { lastPercent = percent; onProgress({ phase: 'downloading', percent }); }
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(destination, { flags: 'wx' }));
}

function expandArchive(archive, destination, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', 'Expand-Archive -LiteralPath $env:REELSAVE_RUNTIME_ARCHIVE -DestinationPath $env:REELSAVE_RUNTIME_DESTINATION -Force'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env,
      REELSAVE_RUNTIME_ARCHIVE: archive, REELSAVE_RUNTIME_DESTINATION: destination } });
    let errorText = '';
    child.stderr?.on('data', chunk => { errorText += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(errorText.trim() || 'Windows could not unpack the download engine.')));
  });
}

async function ensureRuntime({ dataDir, publicKey, fetchImpl = fetch, onProgress = () => {}, spawnProcess = spawn }) {
  const runtimeRoot = path.join(dataDir, 'runtime');
  const destination = path.join(runtimeRoot, `shared-v${RUNTIME_SCHEMA}`);
  if (runtimeReady(destination)) return destination;

  await fs.promises.mkdir(runtimeRoot, { recursive: true });
  const unique = crypto.randomUUID();
  const archive = path.join(runtimeRoot, `.runtime-${unique}.zip`);
  const staging = path.join(runtimeRoot, `.runtime-${unique}`);
  try {
    onProgress({ phase: 'checking', percent: 0 });
    const [manifestResponse, signatureResponse] = await Promise.all([
      fetchImpl(`${RELEASE_BASE}/release-manifest.json`, { signal: AbortSignal.timeout(30000) }),
      fetchImpl(`${RELEASE_BASE}/release-manifest.sig`, { signal: AbortSignal.timeout(30000) }),
    ]);
    if (!manifestResponse.ok || !signatureResponse.ok) throw new Error('The signed runtime package is unavailable.');
    const manifestBytes = Buffer.from(await manifestResponse.arrayBuffer());
    const runtime = verifyManifest(manifestBytes, await signatureResponse.text(), publicKey);
    const packageResponse = await fetchImpl(`${RELEASE_BASE}/${runtime.file}`, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    await downloadFile(packageResponse, archive, onProgress);
    onProgress({ phase: 'verifying', percent: 100 });
    if (await sha256(archive) !== runtime.sha256) throw new Error('The runtime package checksum does not match the signed release.');
    onProgress({ phase: 'installing', percent: 100 });
    await fs.promises.mkdir(staging, { recursive: true });
    await expandArchive(archive, staging, spawnProcess);
    if (!fs.existsSync(path.join(staging, 'python', 'python.exe'))
      || !fs.existsSync(path.join(staging, 'bin', 'ffmpeg.exe'))
      || !fs.existsSync(path.join(staging, 'bin', 'ffprobe.exe'))
      || !fs.existsSync(path.join(staging, 'bin', 'node.exe'))) {
      throw new Error('The downloaded runtime package is incomplete.');
    }
    await fs.promises.writeFile(path.join(staging, '.ready.json'), JSON.stringify({ schema: RUNTIME_SCHEMA, installedAt: new Date().toISOString() }));
    if (fs.existsSync(destination)) await fs.promises.rm(destination, { recursive: true, force: true });
    await fs.promises.rename(staging, destination);
    onProgress({ phase: 'ready', percent: 100 });
    return destination;
  } finally {
    await fs.promises.rm(archive, { force: true }).catch(() => {});
    await fs.promises.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

async function cleanupLegacyRuntimes(dataDir) {
  const runtimeRoot = path.join(dataDir, 'runtime');
  let entries = [];
  try { entries = await fs.promises.readdir(runtimeRoot, { withFileTypes: true }); } catch { return 0; }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+\.\d+\.\d+$/.test(entry.name)) continue;
    const legacy = path.join(runtimeRoot, entry.name);
    if (!fs.existsSync(path.join(legacy, 'python', '.ready')) || !fs.existsSync(path.join(legacy, 'python', 'python.exe'))) continue;
    await fs.promises.rm(legacy, { recursive: true, force: true });
    removed++;
  }
  return removed;
}

module.exports = { ensureRuntime, runtimeReady, verifyManifest, cleanupLegacyRuntimes,
  RUNTIME_FILE, RUNTIME_SCHEMA, RUNTIME_RELEASE };

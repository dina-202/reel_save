const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { verifyUpdate, sha256 } = require('./verify-update.cjs');

test('accepts signed release; rejects tampering, wrong versions, and different signing keys', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'reelsave-signature-'));
  const file = path.join(directory, 'installer.exe');
  try {
    await fs.writeFile(file, 'test installer bytes');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const manifestBytes = Buffer.from(JSON.stringify({ version: '1.0.1', installer: 'ReelSave-Setup-1.0.1.exe', sha256: await sha256(file) }));
    const signature = crypto.sign(null, manifestBytes, privateKey).toString('base64');
    const options = { file, manifestBytes, signature, publicKey, version: '1.0.1' };
    assert.equal(await verifyUpdate(options), true);
    await assert.rejects(verifyUpdate({ ...options, version: '1.0.2' }), /does not match/);
    await assert.rejects(verifyUpdate({ ...options, publicKey: crypto.generateKeyPairSync('ed25519').publicKey }), /signature/);
    await assert.rejects(verifyUpdate({ ...options, manifestBytes: Buffer.from('{}') }), /signature/);
    await fs.writeFile(file, 'tampered installer bytes');
    await assert.rejects(verifyUpdate(options), /checksum/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sha256, verifyUpdate } = require('../desktop/verify-update.cjs');
const root = path.join(__dirname, '..');
const privateFile = path.join(root, '.release-keys/update-private.pem');
const publicFile = path.join(root, 'desktop/update-public-key.pem');

async function main() {
  if (process.argv.includes('--init')) {
    if (fs.existsSync(publicFile) || fs.existsSync(privateFile)) throw new Error('Signing key already exists. Keep it; do not regenerate it for a new release.');
    const keys = crypto.generateKeyPairSync('ed25519');
    fs.mkdirSync(path.dirname(privateFile), { recursive: true });
    fs.writeFileSync(privateFile, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    fs.writeFileSync(publicFile, keys.publicKey.export({ type: 'spki', format: 'pem' }));
    console.log('Update signing key created. Back up .release-keys privately; never commit it.');
    return;
  }
  const version = require('../package.json').version;
  const installer = `ReelSave-Setup-${version}.exe`;
  const file = path.join(root, 'release', installer);
  const privateKey = process.env.REELSAVE_UPDATE_PRIVATE_KEY || fs.readFileSync(privateFile);
  const bytes = Buffer.from(JSON.stringify({ version, installer, sha256: await sha256(file) }));
  const signature = crypto.sign(null, bytes, privateKey).toString('base64');
  await verifyUpdate({ file, manifestBytes: bytes, signature, publicKey: fs.readFileSync(publicFile), version });
  fs.writeFileSync(path.join(root, 'release/release-manifest.json'), bytes);
  fs.writeFileSync(path.join(root, 'release/release-manifest.sig'), signature);
  console.log(`Signed and verified ${installer}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

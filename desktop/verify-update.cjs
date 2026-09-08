const crypto = require('node:crypto');
const fs = require('node:fs');

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyUpdate({ file, manifestBytes, signature, publicKey, version }) {
  if (!crypto.verify(null, manifestBytes, publicKey, Buffer.from(signature.trim(), 'base64'))) {
    throw new Error('The update signature is invalid. Installation was blocked.');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.version !== version || manifest.installer !== `ReelSave-Setup-${version}.exe`) {
    throw new Error('The signed update does not match this release.');
  }
  if (await sha256(file) !== manifest.sha256) throw new Error('The installer checksum does not match the signed release.');
  return true;
}
module.exports = { verifyUpdate, sha256 };

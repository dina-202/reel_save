const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const source = path.join(root, 'assets', 'brand', 'reelsave-logo-source.png');
const publicMark = path.join(root, 'frontend', 'public', 'assets', 'logo-mark.png');
const desktopPng = path.join(root, 'desktop', 'icon.png');
const desktopIco = path.join(root, 'desktop', 'icon.ico');
let trimmedSource;

function sourceBytes() {
  if (!trimmedSource) trimmedSource = sharp(source)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return trimmedSource;
}

async function iconPng(size) {
  const padding = Math.max(1, Math.round(size * 0.065));
  const content = size - (padding * 2);
  return sharp(await sourceBytes())
    .resize(content, content, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: padding, bottom: padding, left: padding, right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function createIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6 + (count * 16));
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = header.length;
  images.forEach(({ size, bytes }, index) => {
    const entry = 6 + (index * 16);
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(bytes.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  });
  return Buffer.concat([header, ...images.map(image => image.bytes)]);
}

async function main() {
  if (!fs.existsSync(source)) throw new Error(`Missing source logo: ${source}`);
  await fs.promises.mkdir(path.dirname(publicMark), { recursive: true });
  await fs.promises.writeFile(publicMark, await iconPng(512));
  await fs.promises.writeFile(desktopPng, await iconPng(256));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(async size => ({ size, bytes: await iconPng(size) })));
  await fs.promises.writeFile(desktopIco, createIco(images));
  console.log('Generated ReelSave web, window, shortcut, and installer icons.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });

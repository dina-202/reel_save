const fs = require('node:fs');
const path = require('node:path');

async function ensureStableShortcut({ app, shell, sourceIcon, executable = process.execPath }) {
  if (!app.isPackaged || process.platform !== 'win32') return { managed: false };
  const dataDir = app.getPath('userData');
  const assetsDir = path.join(dataDir, 'assets');
  const stableIcon = path.join(assetsDir, 'reelsave.ico');
  const marker = path.join(assetsDir, 'desktop-shortcut.json');
  const shortcut = path.join(app.getPath('desktop'), 'ReelSave.lnk');
  await fs.promises.mkdir(assetsDir, { recursive: true });
  await fs.promises.copyFile(sourceIcon, stableIcon);
  const shortcutExists = fs.existsSync(shortcut);
  const hasPreference = fs.existsSync(marker);
  let written = false;
  if (shortcutExists || !hasPreference) {
    written = shell.writeShortcutLink(shortcut, shortcutExists ? 'update' : 'create', {
      target: executable,
      cwd: path.dirname(executable),
      description: 'Download videos and audio with ReelSave',
      icon: stableIcon,
      iconIndex: 0,
      appUserModelId: 'com.dina202.reelsave',
    });
  }
  await fs.promises.writeFile(marker, JSON.stringify({ managed: true, updatedAt: new Date().toISOString() }));
  return { managed: written, shortcut, stableIcon };
}

module.exports = { ensureStableShortcut };

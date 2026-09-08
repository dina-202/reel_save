const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, [path.join(__dirname, '../frontend/node_modules/vite/bin/vite.js'), 'build'], {
  cwd: path.join(__dirname, '../frontend'), stdio: 'inherit',
});
process.exit(result.status ?? 1);

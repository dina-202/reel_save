const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUpdateHealth } = require('./update-health.cjs');

test('records a pending update and confirms it after the new version starts', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reelsave-health-'));
  const oldApp = createUpdateHealth(root, '1.0.4');
  oldApp.markPending('1.0.5');
  const newApp = createUpdateHealth(root, '1.0.5');
  assert.deepEqual(newApp.completedUpdate, { fromVersion: '1.0.4', toVersion: '1.0.5' });
  newApp.markHealthy();
  const state = JSON.parse(await fs.promises.readFile(path.join(root, 'update-health.json'), 'utf8'));
  assert.equal(state.launch.status, 'healthy');
  assert.equal(state.lastUpdate.toVersion, '1.0.5');
  assert.equal(state.pending, undefined);
  await fs.promises.rm(root, { recursive: true, force: true });
});

const fs = require('node:fs');
const path = require('node:path');

function createUpdateHealth(dataDir, version) {
  const file = path.join(dataDir, 'update-health.json');
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* First launch. */ }
  const completedUpdate = previous.pending?.toVersion === version
    ? { fromVersion: previous.pending.fromVersion, toVersion: version } : null;
  const write = value => fs.writeFileSync(file, JSON.stringify(value, null, 2));
  write({ ...previous, launch: { version, status: 'starting', startedAt: new Date().toISOString() } });
  return {
    completedUpdate,
    markPending(toVersion) {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      write({ ...state, pending: { fromVersion: version, toVersion, startedAt: new Date().toISOString() } });
    },
    cancelPending() {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      delete state.pending;
      write(state);
    },
    markHealthy() {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      const lastUpdate = completedUpdate ? { ...completedUpdate, completedAt: new Date().toISOString() } : state.lastUpdate;
      write({ ...state, pending: undefined, lastUpdate, launch: { ...state.launch, status: 'healthy', healthyAt: new Date().toISOString() } });
    },
  };
}

module.exports = { createUpdateHealth };

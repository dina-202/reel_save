const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('reelSaveDesktop', Object.freeze({
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  updateStatus: () => ipcRenderer.invoke('app-update:status'),
  checkUpdate: () => ipcRenderer.invoke('app-update:check'),
  downloadUpdate: () => ipcRenderer.invoke('app-update:download'),
  installUpdate: () => ipcRenderer.invoke('app-update:install'),
  diagnosticReports: () => ipcRenderer.invoke('diagnostics:list'),
  clearDiagnosticReports: () => ipcRenderer.invoke('diagnostics:clear'),
  openDiagnosticReport: id => ipcRenderer.invoke('diagnostics:open', id),
  recordDiagnostic: kind => ipcRenderer.invoke('diagnostics:capture', kind),
}));
window.addEventListener('error', () => { ipcRenderer.invoke('diagnostics:capture', 'renderer_error').catch(() => {}); });
window.addEventListener('unhandledrejection', () => { ipcRenderer.invoke('diagnostics:capture', 'renderer_error').catch(() => {}); });

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('reelSaveDesktop', Object.freeze({
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  downloadMedia: request => ipcRenderer.invoke('media:download', request),
  inspectPlaylist: request => ipcRenderer.invoke('media:playlist', request),
  cancelDownload: () => ipcRenderer.invoke('media:cancel'),
  downloadLocation: () => ipcRenderer.invoke('download-location:get'),
  saveDownloadLocation: folder => ipcRenderer.invoke('download-location:set', folder),
  browseDownloadLocation: () => ipcRenderer.invoke('download-location:browse'),
  openDownloadLocation: () => ipcRenderer.invoke('download-location:open'),
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

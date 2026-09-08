const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('reelSaveDesktop', Object.freeze({
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  updateStatus: () => ipcRenderer.invoke('app-update:status'),
  checkUpdate: () => ipcRenderer.invoke('app-update:check'),
  downloadUpdate: () => ipcRenderer.invoke('app-update:download'),
  installUpdate: () => ipcRenderer.invoke('app-update:install'),
}));

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('runtimeSetup', Object.freeze({
  onProgress: callback => ipcRenderer.on('runtime-progress', (_event, value) => callback(value)),
}));

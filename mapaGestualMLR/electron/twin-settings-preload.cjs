const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cameraSettings', {
  get: () => ipcRenderer.invoke('twin-settings-get'),
  save: preferences => ipcRenderer.invoke('twin-settings-save', preferences),
  close: () => ipcRenderer.send('twin-settings-close'),
  onData: callback => ipcRenderer.on('twin-settings-data', (_event,data) => callback(data))
});

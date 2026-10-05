const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  click: point => ipcRenderer.invoke('map-click', point),
  reportSmoke: report => ipcRenderer.send('smoke-result', report)
});

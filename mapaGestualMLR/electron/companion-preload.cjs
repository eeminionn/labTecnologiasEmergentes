const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  onCompanionState(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('companion-state', listener);
    return () => ipcRenderer.removeListener('companion-state', listener);
  },
  requestCompanionState: () => ipcRenderer.invoke('companion-state-request'),
  showCurrentSession: () => ipcRenderer.send('companion-current-session')
});

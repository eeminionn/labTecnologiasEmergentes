const { contextBridge, ipcRenderer } = require('electron');
const twinBridge = process.argv.includes('--mlr-twin-projection');
let leaseEpoch;
contextBridge.exposeInMainWorld('desktop', {
  click: point => ipcRenderer.invoke('map-click', point, leaseEpoch),
  reportSmoke: report => ipcRenderer.send('smoke-result', report),
  twinBridge,
  onTwinControl: callback => {
    if (!twinBridge || typeof callback !== 'function') return;
    ipcRenderer.on('twin-control', (_event, state) => { leaseEpoch = state.epoch; callback(state); });
    ipcRenderer.send('twin-ready');
  },
  reportTwinState: state => { if (twinBridge) ipcRenderer.send('twin-renderer-state', { ...state, epoch: leaseEpoch }); },
  reportTwinPreview: frame => { if(twinBridge)ipcRenderer.send('twin-preview-frame',{...frame,epoch:leaseEpoch}); },
  loadTwinConfig: () => twinBridge ? ipcRenderer.invoke('twin-config-load') : Promise.resolve({}),
  reportTwinCameras: devices => { if(twinBridge)ipcRenderer.send('twin-camera-devices',devices); },
  onTwinPreferences: callback => { if(twinBridge && typeof callback==='function')ipcRenderer.on('twin-preferences',(_event,preferences)=>callback(preferences)); }
});

const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('cameraPreview',{
  onFrame:callback=>{if(typeof callback==='function')ipcRenderer.on('twin-preview-frame',(_event,frame)=>callback(frame));},
  onStatus:callback=>{if(typeof callback==='function')ipcRenderer.on('twin-preview-status',(_event,state)=>callback(state));}
});

// Test entry: isolate preferences from the user's running application and
// verify the production preference IPC and non-focusing camera preview.
const {app}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mlr-presentation-'));
app.setPath('appData',profile);
fs.mkdirSync(path.join(profile,'MapaGestualMLR-Twin'));
fs.writeFileSync(path.join(profile,'MapaGestualMLR-Twin/twin-camera.json'),JSON.stringify({mirror:false}));
const results={savedMirrorBeforeLaunch:false};
let mapWindow;
function write(){if(process.env.TWIN_PRESENTATION_PROBE)fs.writeFileSync(process.env.TWIN_PRESENTATION_PROBE,JSON.stringify(results));}
app.on('browser-window-created',(_event,win)=>{
  if(win.webContents.isOffscreen())mapWindow=win;
  if(win.getTitle()==='Cámara de la mesa'){win.show=()=>{};win.focus=()=>{};}
  win.webContents.once('did-finish-load',async()=>{
    try {
      const url=win.webContents.getURL();
      if(win===mapWindow){
        results.startup=await win.webContents.executeJavaScript(`(async()=>{
          const preferences=await window.desktop.loadTwinConfig();
          document.getElementById('settings-open').click();
          const checked=document.getElementById('mirror').checked;
          document.getElementById('settings').returnValue='cancel';document.getElementById('settings').close();
          return {preferencesMirror:preferences.mirror,checkboxMirror:checked};
        })()`);write();
      } else if(url.endsWith('/twin-preview.html')){
        let attempts=0;
        const timer=setInterval(async()=>{
          try {
            if(win.isDestroyed() || ++attempts>100){clearInterval(timer);return;}
            const image=await win.webContents.executeJavaScript(`(()=>{const image=document.getElementById('camera');return {width:image.naturalWidth,height:image.naturalHeight,loaded:image.complete && image.naturalWidth>0};})()`);
            if(!image.loaded)return;
            results.preview={...image,focused:win.isFocused(),focusable:win.focusable,alwaysOnTop:win.isAlwaysOnTop()};
            if(process.env.TWIN_PREVIEW_CAPTURE)fs.writeFileSync(process.env.TWIN_PREVIEW_CAPTURE,(await win.webContents.capturePage()).toPNG());
            write();clearInterval(timer);
          } catch {clearInterval(timer);}
        },150);
      } else if(url.endsWith('/twin-settings.html')){
        results.toggle=await win.webContents.executeJavaScript(`(async()=>{
          const state=await window.cameraSettings.get();
          const accepted=await window.cameraSettings.save({...state.preferences,mirror:false});
          return {accepted,originalMirror:state.preferences.mirror};
        })()`);
        await new Promise(resolve=>setTimeout(resolve,150));
        results.frontAfterToggle=await mapWindow.webContents.executeJavaScript(`(()=>{
          document.getElementById('settings-open').click();const checked=document.getElementById('mirror').checked;
          document.getElementById('settings').returnValue='cancel';document.getElementById('settings').close();return {checkboxMirror:checked};
        })()`);write();win.close();
      }
    } catch(error){results.error=error.message;write();}
  });
});
require(path.resolve(__dirname,'../electron/main.cjs'));

// Integration-test entry only. It loads the unchanged production main process
// and observes an application-local Chromium input event in a hidden window.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
let active, inactive;
app.on('browser-window-created', (_event, win) => {
  let running=false;
  const poll=setInterval(async()=>{
    if(win.isDestroyed()){clearInterval(poll);return;}
    if(running)return;
    running=true;
    try {
      const result=await win.webContents.executeJavaScript(`(async()=>{
        if(!window.desktop?.twinBridge || !document.getElementById('map'))return null;
        let target=document.getElementById('twin-native-test-target');
        if(!target){
          target=document.createElement('button');target.id='twin-native-test-target';
          Object.assign(target.style,{position:'fixed',left:'320px',top:'430px',width:'80px',height:'80px',zIndex:99999});
          target.addEventListener('click',event=>{target.dataset.trusted=String(event.isTrusted);});
          document.body.append(target);
        }
        delete target.dataset.trusted;
        const accepted=await window.desktop.click({x:360,y:470});
        await new Promise(resolve=>setTimeout(resolve,70));
        return {accepted,trusted:target.dataset.trusted==='true',documentFocused:document.hasFocus()};
      })()`);
      if(!result)return;
      if(result.accepted)active=result;
      else if(active)inactive=result;
      if(active && process.env.TWIN_CLICK_PROBE)fs.writeFileSync(process.env.TWIN_CLICK_PROBE,JSON.stringify({active,inactive}));
    } catch {}
    finally {running=false;}
  },400);
});
require(path.resolve(__dirname,'../electron/main.cjs'));

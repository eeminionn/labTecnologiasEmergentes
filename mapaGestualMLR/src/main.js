import './style.css';
import { GestureEngine, classifyHand } from './gestures.js';
import { orientation, homography, project } from './calibration.js';
import { createMap } from './map.js';

const $ = id => document.getElementById(id);
const smoke = new URLSearchParams(location.search).has('smoke');
const defaults = { cameraId:'', mirror:false, rotation:0, provider:'osm', googleKey:'', confidence:.7, showPreview:false, corners:null };
let config;
try { config = { ...defaults, ...JSON.parse(localStorage.getItem('mlr-config') || '{}') }; } catch { config={...defaults}; }
if (smoke) config={...defaults};
let matrix; try { matrix=config.corners ? homography(config.corners) : null; } catch { config.corners=null; }
let map, worker, workerReady=false, busy=false, stream, active=false, paused=false, latestHands=[], calibrating=null, samplePoints=[], previousPan=null, lastFrame=-1;
let engine = new GestureEngine();
const timings=[], inferenceTimes=[];
const counters={frames:0,clicks:0,panEvents:0,zoomEvents:0,markedFalseClicks:0};
const startedAt=new Date().toISOString();
const linePairs=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const labels={idle:'En reposo',point:'Apuntando','click-pending':'Preparando clic',navigate:'Moviendo y ampliando mapa'};
let noticeTimer;
let telemetryBlocked=false;
const resultTimes=[];
let lastFreshResult=0;
let smokeStage='empty',emptyFrameResult;
let cameraGeneration=0;
function notify(message) { $('notice').textContent=message; $('notice').hidden=false; clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>$('notice').hidden=true,7500); }
function save() { localStorage.setItem('mlr-config',JSON.stringify(config)); }
function updateStatus() {
  $('status').className=active ? (paused?'paused':'active') : '';
  $('status').innerHTML=`<i></i>${active ? (paused?'Control pausado':'Cámara activa') : 'Cámara detenida'}`;
  $('camera-toggle').textContent=active?'Detener cámara':'Iniciar cámara';
  $('diagnostics').hidden=!config.showPreview || !active;
}
function cancelGesture() { engine.reset(); previousPan=null; $('cursor').style.display='none'; $('click-ripple').classList.remove('play'); }
function isBlocked() { return paused || !document.hasFocus() || $('settings').open || $('help').open || !!calibrating; }
function mapPoint(p) { return project(orientation(p,config.rotation,config.mirror),matrix); }
function within(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.y>=0 && p.x<=1 && p.y<=1; }
async function loadMap() {
  map?.destroy(); $('map').replaceChildren();
  map=await createMap($('map'),{...config,offline:smoke},notify,provider=>$('provider-label').textContent=provider);
  $('provider-label').textContent=map.provider;
}
function initializeWorker() {
  worker?.terminate(); workerReady=false; busy=false;
  worker=new Worker(new URL('./vision.worker.js',import.meta.url));
  worker.onmessage=event=>{
    const data=event.data;
    if(data.type==='ready') { workerReady=true; telemetryBlocked=data.telemetryBlocked; if(smoke) smokeFrame(); }
    else if(data.type==='error') { busy=false; notify(`Detector: ${data.message}`); if(smoke) window.desktop.reportSmoke({ok:false,error:data.message}); else stopCamera(); }
    else if(data.type==='result') {
      busy=false;
      if(smoke) {
        if(smokeStage==='empty') {
          emptyFrameResult={hands:data.landmarks.length,inferenceMs:data.inferenceMs};smokeStage='positive';smokePositive();
        } else {
          const before=map.info().zoom;$('zoom-in').click();const zoomWorks=map.info().zoom>before;$('home').click();
          $('map').querySelector('.leaflet-marker-icon')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
          const button=$('map').querySelector('.demo-popup button');const popupWorks=!!button;button?.click();const selectionWorks=button?.textContent==='Punto seleccionado';
          const pointerFeedback=verifyPointerFeedback();
          const navigationFeedback=verifyNavigationFeedback();
          window.desktop.reportSmoke({ok:emptyFrameResult.hands===0 && data.landmarks.length===1 && telemetryBlocked===true && zoomWorks && popupWorks && selectionWorks && Object.values(pointerFeedback).every(Boolean) && Object.values(navigationFeedback).every(Boolean),provider:map.provider,wasmLoaded:true,telemetryBlockedByWorkerCsp:telemetryBlocked,emptyFrame:emptyFrameResult,positiveFixture:{hands:data.landmarks.length,landmarks:data.landmarks[0]?.length,inferenceMs:data.inferenceMs},zoomWorks,popupWorks,selectionWorks,pointerFeedback,navigationFeedback,mapView:map.info()});
        }
        return;
      }
      if(!active) return;
      lastFreshResult=performance.now();
      if(performance.now()-data.capturedAt>150) { samplePoints=[];cancelGesture();return; }
      counters.frames++; timings.push(performance.now()-data.capturedAt); inferenceTimes.push(data.inferenceMs);
      if(timings.length>10000) { timings.shift(); inferenceTimes.shift(); }
      latestHands=data.landmarks.map(landmarks=>({landmarks}));
      drawSkeleton(data.landmarks);
      $('hands-metric').textContent=`${data.landmarks.length} ${data.landmarks.length===1?'mano':'manos'}`;
      $('latency-metric').textContent=`${Math.round(data.inferenceMs)} ms inferencia`;
      resultTimes.push(performance.now());while(resultTimes.length && resultTimes[0]<performance.now()-2000)resultTimes.shift();
      $('fps-metric').textContent=`${resultTimes.length>1?Math.round(1000*(resultTimes.length-1)/(resultTimes.at(-1)-resultTimes[0])):'—'} FPS`;
      if(calibrating) {
        const hand=latestHands.length===1 && latestHands[0];
        if(hand && classifyHand(hand,{aspectRatio:$('video').videoWidth/$('video').videoHeight})?.point) {
          samplePoints.push(orientation(hand.landmarks[8],config.rotation,config.mirror));
          if(samplePoints.length>12) samplePoints.shift();
        } else samplePoints=[];
      }
      if(isBlocked()) { cancelGesture(); return; }
      const inArea=latestHands.filter(hand=>{
        const shape=classifyHand(hand,{aspectRatio:$('video').videoWidth/$('video').videoHeight});
        return shape && within(mapPoint(shape.center));
      });
      // Both detected hands must be inside the calibrated area to navigate.
      // A second hand outside it must not turn the first into a click gesture.
      const result=engine.update(latestHands.length===2 && inArea.length!==2 ? [] : inArea,data.timestamp);
      renderGesture(result);
    }
  };
  worker.onerror=event=>{ notify(`No se pudo iniciar el detector: ${event.message}`); if(smoke) window.desktop.reportSmoke({ok:false,error:event.message}); stopCamera(); };
  worker.postMessage({type:'init',origin:location.origin,confidence:+config.confidence,probe:smoke});
}
async function smokeFrame() {
  const canvas=document.createElement('canvas'); canvas.width=640;canvas.height=480;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#777';ctx.fillRect(0,0,640,480);
  const bitmap=await createImageBitmap(canvas); busy=true;
  worker.postMessage({type:'frame',bitmap,timestamp:performance.now(),capturedAt:performance.now()},[bitmap]);
}
async function smokePositive() {
  try {
    const response=await fetch('/fixtures/thumbs-up.png');const bitmap=await createImageBitmap(await response.blob());busy=true;
    worker.postMessage({type:'frame',bitmap,timestamp:performance.now(),capturedAt:performance.now()},[bitmap]);
  } catch(error) {window.desktop.reportSmoke({ok:false,error:error.message});}
}
async function startCamera() {
  if(active) return;
  const generation=++cameraGeneration;
  $('camera-toggle').disabled=true;
  try {
    const acquired=await navigator.mediaDevices.getUserMedia({video:{ deviceId:config.cameraId?{exact:config.cameraId}:undefined,width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}},audio:false});
    if(generation!==cameraGeneration){acquired.getTracks().forEach(track=>track.stop());return;}
    stream=acquired;
    $('video').srcObject=stream;await $('video').play();
    const aspect=$('video').videoWidth/$('video').videoHeight;
    engine=new GestureEngine({aspectRatio:aspect});
    active=true;paused=false;lastFrame=-1;lastFreshResult=performance.now();resultTimes.length=0;initializeWorker();
    stream.getVideoTracks()[0].addEventListener('ended',()=>{stopCamera();notify('La cámara se desconectó. Vuelve a conectarla y pulsa Iniciar cámara.');});
    updateStatus(); enumerateCameras(); frameLoop(generation);
  } catch(error) { stopCamera(); notify(error.name==='NotAllowedError'?'Autoriza la cámara en Ajustes del Sistema → Privacidad y seguridad → Cámara.':`No se pudo abrir la cámara USB: ${error.message}`); }
  finally { $('camera-toggle').disabled=false; }
}
function stopCamera() {
  cameraGeneration++;
  active=false; stream?.getTracks().forEach(track=>track.stop());stream=null;
  $('video').srcObject=null; worker?.terminate();worker=null;workerReady=false;busy=false;latestHands=[];
  cancelGesture();updateStatus();
}
async function frameLoop(generation) {
  if(!active || generation!==cameraGeneration) return;
  const video=$('video');
  if(performance.now()-lastFreshResult>180) {samplePoints=[];cancelGesture();}
  if(workerReady && !busy && video.readyState>=2 && video.currentTime!==lastFrame) {
    busy=true;lastFrame=video.currentTime;
    const capturedAt=performance.now();
    try {
      const bitmap=await createImageBitmap(video,{resizeWidth:640,resizeHeight:Math.round(640*video.videoHeight/video.videoWidth)});
      if(!active || !worker || generation!==cameraGeneration) { bitmap.close();return; }
      worker.postMessage({type:'frame',bitmap,timestamp:capturedAt,capturedAt},[bitmap]);
    } catch { busy=false; }
  }
  requestAnimationFrame(()=>frameLoop(generation));
}
function drawSkeleton(hands) {
  if(!config.showPreview) return;
  const canvas=$('skeleton'), video=$('video');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d');ctx.lineWidth=2;ctx.strokeStyle='#58a6ff';ctx.fillStyle='#a5d6ff';
  for(const hand of hands) {
    for(const [a,b] of linePairs) {ctx.beginPath();ctx.moveTo(hand[a].x*canvas.width,hand[a].y*canvas.height);ctx.lineTo(hand[b].x*canvas.width,hand[b].y*canvas.height);ctx.stroke();}
    for(const p of hand) {ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,3,0,Math.PI*2);ctx.fill();}
  }
}
function renderGesture(result,detectedHands=latestHands.length) {
  const rect=$('map').getBoundingClientRect();
  const p=result.cursor && mapPoint(result.cursor);
  $('gesture-metric').textContent=labels[result.mode]||result.mode;
  const singleHand=detectedHands===1;
  $('cursor').style.display=singleHand && within(p)?'block':'none';
  if(!singleHand) $('click-ripple').classList.remove('play');
  if(within(p)) { $('cursor').style.left=`${p.x*rect.width}px`;$('cursor').style.top=`${p.y*rect.height}px`; }
  $('cursor').querySelector('circle').style.strokeDashoffset=138.23*(1-result.progress);
  if(result.mode!=='navigate') previousPan=null;
  for(const event of result.events) {
    if(event.type==='click') {
      const at=mapPoint(event);if(!within(at)) continue;
      const x=at.x*rect.width,y=at.y*rect.height;
      window.desktop.click({x:rect.left+x,y:rect.top+y}).then(ok=>{
        if(ok) { counters.clicks++;if(active && !isBlocked() && latestHands.length===1)pulse(x,y); }
      });
    } else if(event.type==='pan' && result.cursor) {
      const current=mapPoint(result.cursor), old=previousPan || mapPoint({x:result.cursor.x-event.dx,y:result.cursor.y-event.dy});
      if(within(current) && within(old)) { map.pan((current.x-old.x)*rect.width,(current.y-old.y)*rect.height);counters.panEvents++; }
      previousPan=current;
    } else if(event.type==='zoom') {
      const at=mapPoint(event);if(!within(at))continue;
      map.zoom(event.delta,at.x*rect.width,at.y*rect.height);counters.zoomEvents++;
    }
  }
}
function pulse(x,y) { const ripple=$('click-ripple');ripple.style.left=`${x}px`;ripple.style.top=`${y}px`;ripple.classList.remove('play');void ripple.offsetWidth;ripple.classList.add('play'); }
function verifyPointerFeedback() {
  const sample={mode:'idle',cursor:{x:.5,y:.5},progress:0,events:[],hands:1};
  renderGesture(sample,1);const oneHand=$('cursor').style.display==='block';
  pulse(50,50);renderGesture({...sample,mode:'navigate',hands:2},2);
  const twoHands=$('cursor').style.display==='none',clearedRipple=!$('click-ripple').classList.contains('play');
  renderGesture(sample,2);const twoDetectedOneEligible=$('cursor').style.display==='none';
  renderGesture({...sample,cursor:null,hands:0},0);const noHands=$('cursor').style.display==='none';
  cancelGesture();
  return {oneHand,twoHands,twoDetectedOneEligible,noHands,clearedRipple};
}
function verifyNavigationFeedback() {
  map.home();cancelGesture();const before=map.info();
  renderGesture({mode:'navigate',cursor:{x:.54,y:.48},progress:1,hands:2,events:[{type:'pan',dx:.04,dy:-.02}]},2);
  const afterPan=map.info();
  const panWorks=afterPan.center.lng<before.center.lng && afterPan.center.lat<before.center.lat && afterPan.zoom===before.zoom;
  renderGesture({mode:'navigate',cursor:{x:.56,y:.46},progress:1,hands:2,events:[{type:'pan',dx:.02,dy:-.02},{type:'zoom',delta:.2,x:.56,y:.46}]},2);
  const combinedZoomWorks=map.info().zoom>afterPan.zoom;
  const hiddenDuringNavigation=$('cursor').style.display==='none';
  map.home();cancelGesture();
  return {panWorks,combinedZoomWorks,hiddenDuringNavigation};
}
async function enumerateCameras() {
  const devices=await navigator.mediaDevices.enumerateDevices();
  $('camera-select').replaceChildren(new Option('Cámara predeterminada',''));
  devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>$('camera-select').add(new Option(d.label||`Cámara ${i+1}`,d.deviceId)));
  $('camera-select').value=config.cameraId;
}
function openSettings() {
  cancelGesture();enumerateCameras();
  $('mirror').checked=config.mirror;$('rotation').value=config.rotation;$('provider').value=config.provider;$('google-key').value=config.googleKey;$('confidence').value=config.confidence;$('show-preview').checked=config.showPreview;
  $('settings').showModal();
}
$('camera-toggle').onclick=()=>active?stopCamera():startCamera();
$('settings-open').onclick=openSettings;
$('help-open').onclick=()=>{cancelGesture();$('help').showModal();};$('help-close').onclick=()=>$('help').close();
$('preview-close').onclick=()=>{config.showPreview=false;save();updateStatus();};
$('settings').addEventListener('close',async()=>{
  if($('settings').returnValue!=='save')return;
  const wasActive=active;stopCamera();
  const oldKey=config.googleKey,oldProvider=config.provider,oldRotation=config.rotation,oldMirror=config.mirror,oldCamera=config.cameraId;
  Object.assign(config,{cameraId:$('camera-select').value,mirror:$('mirror').checked,rotation:+$('rotation').value,provider:$('provider').value,googleKey:$('google-key').value.trim(),confidence:+$('confidence').value,showPreview:$('show-preview').checked});
  if(oldRotation!==config.rotation || oldMirror!==config.mirror || oldCamera!==config.cameraId) {config.corners=null;matrix=null;}
  save();
  // Reload clears Google SDK and credentials when switching/changing key.
  if(oldKey!==config.googleKey || oldProvider!==config.provider) { location.reload();return; }
  if(wasActive)startCamera();
});
$('zoom-in').onclick=()=>map.zoom(.5,$('map').clientWidth/2,$('map').clientHeight/2);
$('zoom-out').onclick=()=>map.zoom(-.5,$('map').clientWidth/2,$('map').clientHeight/2);
$('home').onclick=()=>map.home();
$('calibrate').onclick=()=>{
  if(!active) {notify('Inicia la cámara antes de calibrar.');return;}
  $('settings').close('cancel');cancelGesture();config.showPreview=true;updateStatus();
  calibrating=[];samplePoints=[];$('calibration').hidden=false;showCalibrationStep();
};
function showCalibrationStep() {const names=['superior izquierda','superior derecha','inferior derecha','inferior izquierda'];$('calibration-title').textContent=`${calibrating.length+1}/4 · Esquina ${names[calibrating.length]}`;}
function captureCorner() {
  if(samplePoints.length<8){notify('Apunta con solo el índice y mantén la mano estable.');return;}
  const mean=samplePoints.reduce((sum,p)=>({x:sum.x+p.x/samplePoints.length,y:sum.y+p.y/samplePoints.length}),{x:0,y:0});
  if(samplePoints.some(p=>Math.hypot(p.x-mean.x,p.y-mean.y)>.025)){notify('Mantén el índice quieto para registrar esta esquina.');return;}
  calibrating.push(mean);samplePoints=[];
  if(calibrating.length<4){showCalibrationStep();return;}
  try{matrix=homography(calibrating);config.corners=calibrating;save();notify('Área calibrada. Prueba el cursor en las cuatro esquinas.');}
  catch(error){notify(`No se guardó la calibración: ${error.message}`);}
  endCalibration();
}
function endCalibration(){calibrating=null;samplePoints=[];$('calibration').hidden=true;cancelGesture();}
$('calibration-cancel').onclick=endCalibration;
$('reset-calibration').onclick=()=>{matrix=null;config.corners=null;save();notify('Área de cámara completa restablecida.');};
function percentile(values,q) {if(!values.length)return null;return [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(q*values.length))];}
$('mark-false-click').onclick=()=>{counters.markedFalseClicks++;$('false-click-count').textContent=`${counters.markedFalseClicks} marcados`;};
$('export-metrics').onclick=()=>{
  const report={version:'0.1.1',startedAt,exportedAt:new Date().toISOString(),...counters,configuration:{confidence:config.confidence,cameraResolution:[$('video').videoWidth,$('video').videoHeight],calibrated:!!matrix},inferenceMs:{p50:percentile(inferenceTimes,.5),p95:percentile(inferenceTimes,.95)},captureToResultMs:{p50:percentile(timings,.5),p95:percentile(timings,.95)},notes:'Captura a resultado excluye buffer de cámara y presentación de pantalla; no es latencia extremo a extremo. Falsos positivos requieren etiquetado humano. Máximo 10000 muestras recientes.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`sesion-gestual-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(event.code==='Space' && !$('settings').open && !$('help').open) {event.preventDefault();if(calibrating)captureCorner();else if(active){paused=!paused;cancelGesture();updateStatus();}}
  if(event.key==='Escape'){cancelGesture();if(calibrating)endCalibration();}
});
window.addEventListener('blur',()=>{if(active){paused=true;cancelGesture();updateStatus();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden && active){paused=true;cancelGesture();updateStatus();}});
await loadMap();
updateStatus();
if(smoke)initializeWorker();

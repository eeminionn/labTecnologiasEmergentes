import './style.css';
import { GestureEngine, classifyHand } from './gestures.js';
import { cameraToMap } from './mapping.js';
import { FrameQualityGate, analyzeFrameQuality } from './frame-quality.js';
import { getCameraControls, applyCameraControls } from './camera-quality.js';
import { createMap } from './map.js';
import { SelectionFeedback } from './selection.js';

const $ = id => document.getElementById(id);
const smoke = new URLSearchParams(location.search).has('smoke');
const defaults = { cameraId:'', mirror:false, rotation:0, provider:'osm', googleKey:'', confidence:.7, cameraAuto:true, cameraControls:{} };
let config;
try { config = { ...defaults, ...JSON.parse(localStorage.getItem('mlr-config') || '{}') }; } catch { config={...defaults}; }
if (smoke) config={...defaults};
// Full-frame mapping replaces saved table calibration in every session.
delete config.corners;
delete config.showPreview;
let qualityGate=new FrameQualityGate(),qualityState={allowActions:true,state:'good',reasons:[]};
let cameraControlsAvailable={ranges:{}},cameraControlReport=null,qualityWarningShown=false;
let map, worker, workerReady=false, busy=false, stream, active=false, paused=false, latestHands=[], previousPan=null, lastFrame=-1;
let engine = new GestureEngine();
const selection=new SelectionFeedback();
let hoverElement;
const controlIds=new WeakMap();let nextControlId=0;
const timings=[], inferenceTimes=[],qualityTimes=[];
const counters={frames:0,clicks:0,panEvents:0,zoomEvents:0,markedFalseClicks:0};
const startedAt=new Date().toISOString();
const linePairs=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const labels={idle:'En reposo',point:'Apuntando','click-pending':'Mantén OK · 1,5 s','click-confirmed':'Seleccionado',navigate:'Navegación'};
let noticeTimer,noticeKind;
let telemetryBlocked=false;
const resultTimes=[];
let lastFreshResult=0;
let smokeStage='empty',emptyFrameResult,smokeFixtureDimensions;
let cameraGeneration=0;
let hasFreshCameraResult=false;
function notify(message,kind='general') { noticeKind=kind;$('notice').textContent=message; $('notice').hidden=false; clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>$('notice').hidden=true,7500); }
function save() { localStorage.setItem('mlr-config',JSON.stringify(config)); }
function updateStatus() {
  $('status').className=active ? (paused?'paused':'active') : '';
  $('status').innerHTML=`<i></i>${active ? (paused?'Control pausado':'Cámara activa') : 'Cámara detenida'}`;
  $('camera-toggle').textContent=active?'Detener cámara':'Iniciar cámara';
  $('diagnostics').hidden=false;
  $('camera-preview-state').hidden=active;
  if(!active)clearTrackingPreview();
}
function highlightTarget(target) { const element=target?.element;if(hoverElement!==element){hoverElement?.classList.remove('gesture-target');element?.classList.add('gesture-target');hoverElement=element;} }
function cancelGesture(hide=true) { engine.cancelInteraction();engine.cancelClick();selection.reset();highlightTarget(null);previousPan=null;for(const cursor of [$('cursor'),$('cursor-secondary')]){if(hide)cursor.style.display='none';cursor.dataset.state='idle';cursor.querySelector('.cursor-progress').style.strokeDashoffset=213.63;} $('click-ripple').classList.remove('play'); }
function isBlocked() { return paused || !document.hasFocus() || $('settings').open || $('help').open; }
function mapPoint(p) { return cameraToMap(p,config); }
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
          emptyFrameResult={hands:data.landmarks.length,inferenceMs:data.inferenceMs,qualityValid:data.quality?.valid};smokeStage='positive';smokePositive();
        } else {
          finishSmoke(data).catch(error=>window.desktop.reportSmoke({ok:false,error:error.message}));
        }
        return;
      }
      if(!active) return;
      lastFreshResult=performance.now();
      if(performance.now()-data.capturedAt>150) {if(hasFreshCameraResult)cancelGesture();clearTrackingPreview();return;}
      hasFreshCameraResult=true;
      counters.frames++; timings.push(performance.now()-data.capturedAt); inferenceTimes.push(data.inferenceMs);qualityTimes.push(data.qualityMs);
      if(timings.length>10000) { timings.shift(); inferenceTimes.shift();qualityTimes.shift(); }
      latestHands=data.landmarks.map((landmarks,index)=>({landmarks,worldLandmarks:data.worldLandmarks?.[index]}));
      drawSkeleton(data.landmarks);
      $('hands-metric').textContent=`${data.landmarks.length} ${data.landmarks.length===1?'mano':'manos'}`;
      $('latency-metric').textContent=`${Math.round(data.inferenceMs)} ms inferencia`;
      resultTimes.push(performance.now());while(resultTimes.length && resultTimes[0]<performance.now()-2000)resultTimes.shift();
      $('fps-metric').textContent=`${resultTimes.length>1?Math.round(1000*(resultTimes.length-1)/(resultTimes.at(-1)-resultTimes[0])):'—'} FPS`;
      if(data.quality)qualityState=qualityGate.update(data.quality,data.timestamp);
      showQuality(data.quality,qualityState);
      const blocked=isBlocked() || !qualityState.allowActions;
      if(blocked)cancelGesture(false);
      let result=engine.update(latestHands,data.timestamp);
      // A second observed hand can never become an individual click merely
      // because its geometry was rejected by the gesture interpreter.
      if(blocked || (latestHands.length!==result.hands && latestHands.length>1)) {
        engine.cancelInteraction();engine.cancelClick();
        result={...result,mode:'idle',progress:0,events:[],navigationKind:null};
      }
      renderGesture(result,latestHands.length,{blocked});
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
    const response=await fetch('/fixtures/thumbs-up.png');const source=await createImageBitmap(await response.blob());
    smokeFixtureDimensions={width:source.width,height:source.height};
    // Static PNG has transparency; a camera supplies opaque RGB. Composite
    // only this smoke fixture on a matte background before passing it through
    // the unchanged production worker, including its quality measurement.
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#777';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0);source.close();
    const bitmap=await createImageBitmap(canvas);busy=true;
    worker.postMessage({type:'frame',bitmap,timestamp:performance.now(),capturedAt:performance.now()},[bitmap]);
  } catch(error) {window.desktop.reportSmoke({ok:false,error:error.message});}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(test,timeoutMs=2000,label='condición') {
  const since=performance.now();while(!test()){if(performance.now()-since>timeoutMs)throw new Error(`Smoke: ${label} no observado`);await sleep(20);}
}
async function finishSmoke(data) {
  await waitFor(()=>document.hasFocus(),2000,'foco de ventana');
  const before=map.info().zoom;$('zoom-in').click();const zoomWorks=map.info().zoom>before;map.home();
  const pointerFeedback=verifyPointerFeedback(),navigationFeedback=await verifyNavigationFeedback();
  const fistViewsFeedback=await verifyFistViewsFeedback(data);
  const previewFeedback=verifyPreviewFeedback(data);
  renderGesture({mode:'navigate',navigationKind:'zoom',cursor:{x:.5,y:.5},pointers:[{id:1,x:.3,y:.4},{id:2,x:.7,y:.6}],hands:2,progress:1,events:[]},2);
  // Let Chromium paint both halos before capturing this transient test state.
  await sleep(150);
  window.desktop.reportSmoke({phase:'navigation'});await sleep(150);cancelGesture();
  const qualityFeedback=await verifyQualityFeedback();
  const nativeSelection=await verifyNativeSelection();
  const ok=emptyFrameResult.hands===0 && emptyFrameResult.qualityValid && data.quality?.valid && data.landmarks.length===1 && telemetryBlocked===true && zoomWorks
    && Object.values(pointerFeedback).every(Boolean) && Object.values(navigationFeedback).every(Boolean)
    && nativeSelection.popupOpened && nativeSelection.selectionWorks && nativeSelection.gestureClickAccepted
    && nativeSelection.buttonClickAccepted && nativeSelection.trustedClicks===4 && nativeSelection.sequenceCompleted && nativeSelection.advancesOnlyOnPoint && nativeSelection.sequenceHolds.every(h=>h.clickAccepted && h.elapsedMs>=1500 && h.clicks===1 && h.noEarlyClick && h.cursorLocked)
    && Object.values(qualityFeedback).every(Boolean) && Object.values(previewFeedback).every(Boolean) && map.info().boundaryLoaded && nativeSelection.holdElapsedMs>=1500
    && Object.values(fistViewsFeedback).every(Boolean)
    && nativeSelection.cursorLocked && nativeSelection.ringHalfVisible && nativeSelection.noEarlyClick && nativeSelection.oneClickWhileHeld;
  window.desktop.reportSmoke({version:'0.1.5',ok,provider:map.provider,wasmLoaded:true,telemetryBlockedByWorkerCsp:telemetryBlocked,emptyFrame:emptyFrameResult,positiveFixture:{hands:data.landmarks.length,landmarks:data.landmarks[0]?.length,worldLandmarks:data.worldLandmarks?.[0]?.length,inferenceMs:data.inferenceMs,qualityValid:data.quality?.valid,qualityMs:data.qualityMs},zoomWorks,popupWorks:nativeSelection.popupOpened,selectionWorks:nativeSelection.selectionWorks,pointerFeedback,navigationFeedback,fistViewsFeedback,qualityFeedback,previewFeedback,nativeSelection,mapView:map.info()});
}
async function verifyNativeSelection() {
  map.resetSequence();map.home();map.pan(180,90);cancelGesture();
  const target=map.targets()[0];
  const fixture=await (await fetch('/fixtures/selection-poses.json')).json();
  let trustedClicks=0;const observe=event=>{if(event.isTrusted)trustedClicks++;};$('map').addEventListener('click',observe,true);
  const pointHold=await verifyHoldAt(target,fixture,()=>trustedClicks,true);
  await waitFor(()=>$('map').querySelector('.demo-popup button'),2000,`popup (clicks=${pointHold.clicks}, accepted=${pointHold.clickAccepted})`);
  const button=$('map').querySelector('.demo-popup button');
  cancelGesture();
  const buttonTarget=selectionTargets($('map').getBoundingClientRect()).find(t=>t.element===button);
  if(!buttonTarget)throw new Error('Smoke: botón de popup no disponible');
  const buttonHold=await verifyHoldAt(buttonTarget,fixture,()=>trustedClicks);
  await waitFor(()=>button.textContent==='Punto seleccionado',2000,'selección de botón');
  const advancesOnlyOnPoint=map.info().sequence.completedCount===1;
  const sequenceHolds=[];
  for(let index=1;index<3;index++){
    $('map').querySelector('.leaflet-popup-close-button')?.click();cancelGesture();
    const nextTarget=map.targets()[0];
    if(!nextTarget || nextTarget.id!==`point-${index}`)throw new Error('Smoke: orden de recorrido inválido');
    sequenceHolds.push(await verifyHoldAt(nextTarget,fixture,()=>trustedClicks));
    await waitFor(()=>map.info().sequence.completedCount===index+1,2000,'avance de recorrido');
  }
  const sequenceCompleted=map.info().sequence.completed && map.targets().length===0;
  $('map').removeEventListener('click',observe,true);
  const result={gestureClickAccepted:pointHold.clickAccepted,popupOpened:true,buttonClickAccepted:buttonHold.clickAccepted,selectionWorks:button.textContent==='Punto seleccionado',trustedClicks,advancesOnlyOnPoint,sequenceCompleted,sequenceHolds,holdElapsedMs:Math.min(pointHold.elapsedMs,buttonHold.elapsedMs),cursorLocked:pointHold.cursorLocked&&buttonHold.cursorLocked,ringHalfVisible:pointHold.ringHalfVisible&&buttonHold.ringHalfVisible,noEarlyClick:pointHold.noEarlyClick&&buttonHold.noEarlyClick,oneClickWhileHeld:pointHold.clicks===1&&buttonHold.clicks===1,pointHold,buttonHold};
  cancelGesture();map.resetSequence();map.home();
  return result;
}
async function verifyHoldAt(target,fixture,trustedCount,captureProgress=false) {
  const rect=$('map').getBoundingClientRect();
  const dx=target.x/rect.width-fixture.poses.point[8].x,dy=target.y/rect.height-fixture.poses.point[8].y;
  const hand=pose=>({id:'smoke-hand',landmarks:fixture.poses[pose].map(p=>({...p,x:p.x+dx,y:p.y+dy}))});
  const synthetic=new GestureEngine();
  await renderGesture(synthetic.update([hand('point')],performance.now()),1);
  await sleep(40);
  const start=performance.now(),beforeClicks=trustedCount();
  let cursorLocked=true,ringHalfVisible=false,noEarlyClick=true,clicks=0,elapsedMs=0,clickAccepted=false,progressCaptured=false;
  const anchor={x:target.x,y:target.y};
  while(performance.now()-start<1800){
    const now=performance.now(),result=synthetic.update([hand('ok')],now);
    const accepted=await renderGesture(result,1);
    cursorLocked &&= Math.abs(parseFloat($('cursor').style.left)-anchor.x)<.5 && Math.abs(parseFloat($('cursor').style.top)-anchor.y)<.5;
    if(result.progress>=.45 && result.progress<=.65){
      const ring=$('cursor').querySelector('.cursor-progress'),style=getComputedStyle(ring);
      ringHalfVisible ||= style.opacity==='1' && Math.abs(parseFloat(style.strokeDashoffset)-213.63*(1-result.progress))<.2;
      if(captureProgress && !progressCaptured){progressCaptured=true;window.desktop.reportSmoke({phase:'progress',progress:result.progress});}
    }
    if(now-start<1500 && (result.events.length || trustedCount()!==beforeClicks))noEarlyClick=false;
    if(result.events.some(event=>event.type==='click')){clicks++;elapsedMs=now-start;clickAccepted=accepted[0]===true;}
    await sleep(40);
  }
  return {clickAccepted,elapsedMs,cursorLocked,ringHalfVisible,noEarlyClick,clicks};
}
async function verifyQualityFeedback() {
  const image=value=>({width:4,height:4,data:Uint8ClampedArray.from(Array.from({length:16},()=>[value,value,value,255]).flat())});
  const gate=new FrameQualityGate();
  const normal=analyzeFrameQuality(image(120)),dark=analyzeFrameQuality(image(0));
  const initial=gate.update(normal,0);
  const rejected=gate.update(dark,40);
  const held=gate.update(dark,240);
  const recovery=gate.update(normal,280);
  gate.update(normal,480);gate.update(normal,680);
  const recovered=gate.update(normal,880);
  const before=counters.clicks;
  const result=await renderGesture({mode:'click-confirmed',cursor:{x:.5,y:.5},pointers:[{id:1,x:.5,y:.5}],progress:1,hands:1,events:[{type:'click',x:.5,y:.5}]},1,{blocked:true});
  const noBlockedInput=result.length===0 && counters.clicks===before && $('cursor').style.display==='block' && $('cursor').dataset.blocked==='true';
  const gapGate=new FrameQualityGate();gapGate.update(normal,0);
  qualityWarningShown=false;
  showQuality(dark,gapGate.update(dark,300));
  showQuality(dark,gapGate.update(dark,400));
  const warning=gapGate.update(dark,500);showQuality(dark,warning);
  const warningAfterGap=warning.showWarning && !warning.changed && !$('notice').hidden && noticeKind==='quality';
  showQuality(normal,initial);cancelGesture();
  // Check actual CSS visibility inside an open dialog, not only the hidden flag.
  populateCameraControls();$('settings').showModal();
  const rows=Object.values(cameraRangeIds).map(id=>$(id+'-label'));
  const unavailableHidden=rows.every(row=>getComputedStyle(row).display==='none');
  rows[0].hidden=false;
  const availableVisible=getComputedStyle(rows[0]).display!=='none';
  populateCameraControls();$('settings').close();
  return {normalAllows:initial.allowActions,darkCancels:!rejected.allowActions&&rejected.cancelInteraction,heldBlocks:held.state==='blocked',recoveryWaits:!recovery.allowActions,recovered:recovered.allowActions,noBlockedInput,warningAfterGap,conditionalCameraControls:unavailableHidden&&availableVisible};
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
    if(generation!==cameraGeneration){acquired.getTracks().forEach(track=>track.stop());return;}
    const controls=cameraControlReport=await applyCameraControls(stream.getVideoTracks()[0],config.cameraControls,{continuous:config.cameraAuto});
    if(generation!==cameraGeneration){acquired.getTracks().forEach(track=>track.stop());return;}
    if(['failed','invalid','mismatch'].includes(controls.status))notify('La cámara no confirmó los ajustes solicitados. Revisa el diagnóstico.');
    const aspect=$('video').videoWidth/$('video').videoHeight;
    $('video').parentElement.style.aspectRatio=String(aspect);
    engine=new GestureEngine({aspectRatio:aspect});
    qualityGate=new FrameQualityGate();qualityState={allowActions:true,state:'good',reasons:[]};qualityWarningShown=false;
    active=true;paused=false;lastFrame=-1;hasFreshCameraResult=false;lastFreshResult=performance.now();resultTimes.length=0;initializeWorker();
    stream.getVideoTracks()[0].addEventListener('ended',()=>{stopCamera();notify('La cámara se desconectó. Vuelve a conectarla y pulsa Iniciar cámara.');});
    updateStatus(); enumerateCameras(); frameLoop(generation);
  } catch(error) { stopCamera(); notify(error.name==='NotAllowedError'?'Autoriza la cámara en Ajustes del Sistema → Privacidad y seguridad → Cámara.':`No se pudo abrir la cámara USB: ${error.message}`); }
  finally { $('camera-toggle').disabled=false; }
}
function stopCamera() {
  cameraGeneration++;
  active=false;hasFreshCameraResult=false;stream?.getTracks().forEach(track=>track.stop());stream=null;
  $('video').srcObject=null; worker?.terminate();worker=null;workerReady=false;busy=false;latestHands=[];
  cancelGesture();updateStatus();
}
async function frameLoop(generation) {
  if(!active || generation!==cameraGeneration) return;
  const video=$('video');
  if(hasFreshCameraResult && performance.now()-lastFreshResult>180) {cancelGesture();clearTrackingPreview();}
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
function clearTrackingPreview() {
  const canvas=$('skeleton');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  $('hands-metric').textContent='0 manos';$('fps-metric').textContent='— FPS';
}
function drawSkeleton(hands,width=$('video').videoWidth||640,height=$('video').videoHeight||480) {
  const canvas=$('skeleton');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');ctx.lineWidth=2;ctx.strokeStyle='#58a6ff';ctx.fillStyle='#a5d6ff';
  for(const hand of hands) {
    if(!Array.isArray(hand) || hand.length!==21 || hand.some(p=>!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)))continue;
    for(const [a,b] of linePairs) {ctx.beginPath();ctx.moveTo(hand[a].x*canvas.width,hand[a].y*canvas.height);ctx.lineTo(hand[b].x*canvas.width,hand[b].y*canvas.height);ctx.stroke();}
    for(const p of hand) {ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,3,0,Math.PI*2);ctx.fill();}
  }
}
function displayPointers(result,detectedHands) {
  if(result.pointers?.length===detectedHands)return result.pointers;
  if(detectedHands===1 && result.cursor)return [{id:'single',...result.cursor}];
  // Fresh model landmarks can remain visible while a pose is ineligible for
  // actions. These fallback positions never arm a click or navigation.
  return latestHands.slice(0,2).flatMap((hand,index)=>{
    const points=hand.landmarks;
    if(!Array.isArray(points) || points.length!==21 || points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return [];
    const shape=classifyHand(hand,engine.options);
    const p=shape?(shape.point?shape.pointer:shape.ok?shape.pinch:shape.center):
      [0,5,9,13,17].reduce((a,i)=>({x:a.x+points[i].x/5,y:a.y+points[i].y/5}),{x:0,y:0});
    return [{id:`detected-${index}`,...p}];
  });
}
function renderGesture(result,detectedHands=latestHands.length,{blocked=false}={}) {
  const rect=$('map').getBoundingClientRect();
  const p=result.cursor && mapPoint(result.cursor);
  const navigation=result.mode==='navigate'?result.navigationKind||'ready':null;
  $('gesture-metric').textContent=blocked?'Control en espera':navigation==='pan'?'Desplazando':navigation==='zoom'?'Zoom':labels[result.mode]||result.mode;
  const singleHand=detectedHands===1 && !blocked;
  let feedback={point:null,target:null,cancel:false};
  if(singleHand && within(p))feedback=selection.update({x:p.x*rect.width,y:p.y*rect.height},result.mode,selectionTargets(rect),rect);
  else {selection.reset();if(result.mode==='click-pending')engine.cancelClick();}
  if(feedback.cancel){engine.cancelClick();selection.reset();}
  const pointers=displayPointers(result,detectedHands);
  for(const [index,cursor] of [$('cursor'),$('cursor-secondary')].entries()) {
    const point=pointers[index] && mapPoint(pointers[index]);
    const visible=within(point);
    cursor.style.display=visible?'block':'none';
    if(visible){const displayed=index===0 && feedback.point?feedback.point:{x:point.x*rect.width,y:point.y*rect.height};cursor.style.left=`${displayed.x}px`;cursor.style.top=`${displayed.y}px`;}
    cursor.dataset.hand=pointers[index]?.id??'';
    cursor.dataset.navigation=navigation||'';
    cursor.dataset.blocked=String(blocked);
    cursor.dataset.state=index===0 && singleHand && !feedback.cancel?
      result.mode==='click-pending'?'loading':result.mode==='click-confirmed'?'confirmed':feedback.target?'hover':'idle':'idle';
    cursor.querySelector('.cursor-progress').style.strokeDashoffset=213.63*(1-(index===0 && singleHand && !feedback.cancel?result.progress:0));
  }
  if(!singleHand)$('click-ripple').classList.remove('play');
  highlightTarget(singleHand && !feedback.cancel?feedback.target:null);
  if(navigation!=='pan')previousPan=null;
  const actions=[];
  if(blocked)return Promise.resolve(actions);
  for(const event of result.events) {
    if(event.type==='click') {
      if(!singleHand || !feedback.point || feedback.cancel)continue;
      const {x,y}=feedback.point;
      actions.push(window.desktop.click({x:rect.left+x,y:rect.top+y}).then(ok=>{
        if(ok){counters.clicks++;if(smoke || (active && !isBlocked() && latestHands.length===1))pulse(x,y);}
        else{engine.cancelClick();selection.reset();$('cursor').dataset.state='idle';}
        return ok;
      }).catch(error=>{engine.cancelClick();selection.reset();if(smoke)throw error;notify(`No se pudo seleccionar: ${error.message}`);return false;}));
    } else if(event.type==='pan' && navigation==='pan' && detectedHands===2 && result.cursor) {
      const current=mapPoint(result.cursor),old=previousPan || mapPoint({x:result.cursor.x-event.dx,y:result.cursor.y-event.dy});
      if(within(current) && within(old)){map.pan((current.x-old.x)*rect.width,(current.y-old.y)*rect.height);counters.panEvents++;}
      previousPan=current;
    } else if(event.type==='zoom' && navigation==='zoom' && detectedHands===2) {
      const at=mapPoint(event);if(!within(at))continue;
      map.zoom(event.delta,at.x*rect.width,at.y*rect.height);counters.zoomEvents++;
    }
  }
  return Promise.all(actions);
}
function showQuality(analysis,state) {
  const metric=$('quality-metric');metric.dataset.state=state.state;
  const dark=(state.reasons||[]).includes('too-dark');
  const warnings=analysis?.warnings||[];
  metric.textContent=!state.allowActions?(state.state==='recovering'?'Imagen: recuperando':dark?'Imagen: demasiado oscura':'Imagen: revisar exposición'):
    warnings.includes('dark')?'Imagen: poca luz':warnings.includes('bright')?'Imagen: mucho brillo':warnings.includes('low-contrast')?'Imagen: contraste bajo':
      analysis?.metrics?`Luz ${Math.round(analysis.metrics.meanLuma)} · contraste ${Math.round(analysis.metrics.contrast)}`:'Imagen: —';
  if(state.showWarning && !qualityWarningShown){qualityWarningShown=true;notify('La imagen no permite controlar el mapa. Revisa la luz o la exposición.','quality');}
  if(state.allowActions)qualityWarningShown=false;
  if(state.allowActions && noticeKind==='quality'){$('notice').hidden=true;clearTimeout(noticeTimer);noticeKind=null;}
}

function selectionTargets(rect) {
  const targets=map.targets();
  $('workspace').querySelectorAll('.map-tools button,.demo-popup button,.leaflet-popup-close-button').forEach(element=>{
    if(element.disabled || !element.getClientRects().length)return;
    if(!controlIds.has(element))controlIds.set(element,`control-${++nextControlId}`);
    const box=element.getBoundingClientRect();
    targets.push({id:controlIds.get(element),x:box.left+box.width/2-rect.left,y:box.top+box.height/2-rect.top,width:box.width,height:box.height,element,priority:1});
  });
  return targets.filter(target=>{
    if(target.x<0 || target.y<0 || target.x>rect.width || target.y>rect.height)return false;
    const top=document.elementFromPoint(rect.left+target.x,rect.top+target.y);
    return target.element?target.element.contains(top):$('map').contains(top);
  });
}
function pulse(x,y) { const ripple=$('click-ripple');ripple.style.left=`${x}px`;ripple.style.top=`${y}px`;ripple.classList.remove('play');void ripple.offsetWidth;ripple.classList.add('play'); }
function verifyPointerFeedback() {
  const sample={mode:'idle',cursor:{x:.5,y:.5},pointers:[{id:1,x:.5,y:.5}],progress:0,events:[],hands:1};
  renderGesture(sample,1);const oneHand=$('cursor').style.display==='block' && $('cursor-secondary').style.display==='none';
  const dual={...sample,cursor:{x:.5,y:.5},pointers:[{id:1,x:.3,y:.4},{id:2,x:.7,y:.6}],hands:2};
  pulse(50,50);renderGesture(dual,2);
  const twoHands=[$('cursor'),$('cursor-secondary')].every(c=>c.style.display==='block');
  const clearedRipple=!$('click-ripple').classList.contains('play');
  renderGesture({...dual,mode:'navigate',navigationKind:'pan'},2);
  const panColor=[$('cursor'),$('cursor-secondary')].every(c=>c.dataset.navigation==='pan' && getComputedStyle(c).getPropertyValue('--cursor-color').trim()==='137,87,229');
  renderGesture({...dual,mode:'navigate',navigationKind:'zoom'},2);
  const zoomColor=[$('cursor'),$('cursor-secondary')].every(c=>c.dataset.navigation==='zoom' && getComputedStyle(c).getPropertyValue('--cursor-color').trim()==='212,143,0');
  renderGesture(dual,2,{blocked:true});const blockedVisible=[$('cursor'),$('cursor-secondary')].every(c=>c.style.display==='block' && c.dataset.blocked==='true');
  renderGesture({...sample,cursor:null,pointers:[],hands:0},0);const noHands=[$('cursor'),$('cursor-secondary')].every(c=>c.style.display==='none');
  renderGesture({...sample,cursor:{x:0,y:1},pointers:[{id:1,x:0,y:1}]},1);
  const fullFrameEdges=parseFloat($('cursor').style.left)===0 && parseFloat($('cursor').style.top)===$('map').clientHeight;
  cancelGesture();return {oneHand,twoHands,panColor,zoomColor,blockedVisible,noHands,fullFrameEdges,clearedRipple};
}
function sameMapView(a,b) {return a.zoom===b.zoom && Math.abs(a.center.lat-b.center.lat)<1e-8 && Math.abs(a.center.lng-b.center.lng)<1e-8;}
async function verifyFistViewsFeedback(data) {
  const worldLandmarksLoaded=Array.isArray(data.worldLandmarks) && data.worldLandmarks.length===data.landmarks.length
    && data.worldLandmarks.every(points=>points.length===21 && points.every(p=>['x','y','z'].every(key=>Number.isFinite(p[key]))));
  const detected=classifyHand({landmarks:data.landmarks[0],worldLandmarks:data.worldLandmarks?.[0]},
    {aspectRatio:smokeFixtureDimensions.width/smokeFixtureDimensions.height});
  const worldGeometryUsed=detected?.fistGeometrySource==='world';
  const fixture=await (await fetch('/fixtures/selection-poses.json')).json();
  if(!Array.isArray(fixture.handViews) || fixture.handViews.length<3)throw new Error('Smoke: faltan vistas 3D del puño');
  const feedback={worldLandmarksLoaded,worldGeometryUsed};
  for(const view of fixture.handViews) {
    const shape=classifyHand(view);
    if(!shape?.fist || shape.fistGeometrySource!=='world')throw new Error(`Smoke: puño ${view.name} no reconocido`);
    const hand=(id,x,y)=>({...view,id,landmarks:view.landmarks.map(p=>({...p,x:p.x+x-shape.center.x,y:p.y+y-shape.center.y}))});
    // Each hand keeps its own local world origin. Only image-space positions
    // change when moving across the map; world centers never drive pan.
    const pair=dx=>[hand('left',.35+dx,.5),hand('right',.65+dx,.5)];
    const synthetic=new GestureEngine();map.home();cancelGesture();const before=map.info();
    for(const time of [0,100,180])await renderGesture(synthetic.update(pair(0),time),2);
    const moved=synthetic.update(pair(.04),220);await renderGesture(moved,2);
    feedback[view.name]=moved.navigationKind==='pan' && moved.events.some(e=>e.type==='pan')
      && moved.events.every(e=>e.type!=='zoom') && map.info().zoom===before.zoom && map.info().center.lng<before.center.lng;
  }
  // Different orientations of the two fists must also acquire the same mode.
  const views=fixture.handViews.slice(0,2),shapes=views.map(view=>classifyHand(view));
  const pair=views.map((view,i)=>({...view,id:`mixed-view-${i}`,landmarks:view.landmarks.map(p=>({...p,
    x:p.x+(i===0?.35:.65)-shapes[i].center.x,y:p.y+.5-shapes[i].center.y}))}));
  const mixed=new GestureEngine();let acquired;
  for(const time of [0,100,180])acquired=mixed.update(pair,time);
  feedback.mixedOrientationsPan=acquired.mode==='navigate' && acquired.navigationKind==='pan';
  map.home();cancelGesture();return feedback;
}
async function verifyNavigationFeedback() {
  const fixture=await (await fetch('/fixtures/selection-poses.json')).json();
  const hand=(pose,id,x,y)=>{
    const shape=classifyHand({landmarks:fixture.poses[pose]});
    if(!shape || (pose==='fist'?!shape.fist:!shape.ok))throw new Error(`Smoke: pose ${pose} inválida`);
    const source=pose==='fist'?shape.center:shape.pinch;
    return {id,landmarks:fixture.poses[pose].map(p=>({...p,x:p.x+x-source.x,y:p.y+y-source.y}))};
  };
  const pair=(pose,dx=0,spread=0)=>[hand(pose,'left',.35+dx-spread,.5),hand(pose,'right',.65+dx+spread,.5)];
  const panEngine=new GestureEngine();map.home();cancelGesture();
  const beforePan=map.info();
  for(const t of [0,100,180])await renderGesture(panEngine.update(pair('fist'),t),2);
  const panResult=panEngine.update(pair('fist',.04),220);await renderGesture(panResult,2);
  const afterPan=map.info();
  const panWorks=panResult.navigationKind==='pan' && panResult.events.some(e=>e.type==='pan') && afterPan.center.lng<beforePan.center.lng;
  const panSpread=panEngine.update(pair('fist',.04,.03),260);await renderGesture(panSpread,2);
  const noZoomDuringPan=[...panResult.events,...panSpread.events].every(e=>e.type!=='zoom') && map.info().zoom===beforePan.zoom;
  const visibleDuringNavigation=[$('cursor'),$('cursor-secondary')].every(c=>c.style.display==='block');
  const zoomEngine=new GestureEngine();map.home();cancelGesture();const beforeZoom=map.info();
  for(const t of [1000,1100,1180])await renderGesture(zoomEngine.update(pair('ok'),t),2);
  const translation=zoomEngine.update(pair('ok',.03),1220);await renderGesture(translation,2);
  const translationInZoomIgnored=translation.events.length===0 && sameMapView(beforeZoom,map.info());
  const zoomResult=zoomEngine.update(pair('ok',.03,.04),1260);await renderGesture(zoomResult,2);
  const zoomWorks=zoomResult.navigationKind==='zoom' && zoomResult.events.some(e=>e.type==='zoom') && map.info().zoom>beforeZoom.zoom;
  const noPanDuringZoom=[...translation.events,...zoomResult.events].every(e=>e.type!=='pan');
  const switched=zoomEngine.update(pair('fist',.03),1300);await renderGesture(switched,2);
  const stillWaiting=zoomEngine.update(pair('fist',.03),1400);await renderGesture(stillWaiting,2);
  const acquired=zoomEngine.update(pair('fist',.03),1480);await renderGesture(acquired,2);
  const modeSwitchReacquires=switched.mode!=='navigate' && stillWaiting.mode!=='navigate' && acquired.mode==='navigate' && acquired.navigationKind==='pan' && [switched,stillWaiting,acquired].every(r=>r.events.length===0);
  const mixedEngine=new GestureEngine();let mixed;
  for(const t of [1600,1700,1780])mixed=mixedEngine.update([hand('fist','left',.35,.5),hand('ok','right',.65,.5)],t);
  const mixedPosesIdle=mixed.mode!=='navigate' && mixed.events.length===0;
  const beforeGuard=map.info(),pointers=[{id:1,x:.3,y:.4},{id:2,x:.7,y:.6}];
  await renderGesture({mode:'navigate',navigationKind:'pan',cursor:{x:.5,y:.5},pointers,hands:2,progress:1,events:[{type:'zoom',delta:.2,x:.5,y:.5}]},2);
  await renderGesture({mode:'navigate',navigationKind:'zoom',cursor:{x:.5,y:.5},pointers,hands:2,progress:1,events:[{type:'pan',dx:.05,dy:0}]},2);
  const crossModeEventsIgnored=sameMapView(beforeGuard,map.info());
  map.home();cancelGesture();
  return {panWorks,zoomWorks,noZoomDuringPan,translationInZoomIgnored,noPanDuringZoom,modeSwitchReacquires,mixedPosesIdle,visibleDuringNavigation,crossModeEventsIgnored};
}
function verifyPreviewFeedback(data) {
  const saved={active,paused};active=false;paused=false;updateStatus();
  const visible=()=>!$('diagnostics').hidden && getComputedStyle($('diagnostics')).display!=='none';
  const previewVisibleStopped=visible() && !$('camera-preview-state').hidden;
  active=true;updateStatus();const previewVisibleActive=visible() && $('camera-preview-state').hidden;
  paused=true;updateStatus();const previewVisiblePaused=visible();
  const panel=$('diagnostics').getBoundingClientRect(),workspace=$('workspace').getBoundingClientRect();
  const compactPlacement=panel.width<=200 && panel.left-workspace.left===12 && panel.top-workspace.top===12;
  drawSkeleton(data.landmarks,smokeFixtureDimensions.width,smokeFixtureDimensions.height);
  const canvas=$('skeleton'),ctx=canvas.getContext('2d');
  const hasTracking=()=>ctx.getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3 && value>0);
  const trackingDrawn=hasTracking();clearTrackingPreview();const staleTrackingCleared=!hasTracking();
  const noPreviewToggle=!$('show-preview') && !$('preview-close');
  active=saved.active;paused=saved.paused;updateStatus();
  return {previewVisibleStopped,previewVisibleActive,previewVisiblePaused,compactPlacement,trackingDrawn,staleTrackingCleared,noPreviewToggle};
}
async function enumerateCameras() {
  const devices=await navigator.mediaDevices.enumerateDevices();
  $('camera-select').replaceChildren(new Option('Cámara predeterminada',''));
  devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>$('camera-select').add(new Option(d.label||`Cámara ${i+1}`,d.deviceId)));
  $('camera-select').value=config.cameraId;
}
function openSettings() {
  cancelGesture();enumerateCameras();
  $('mirror').checked=config.mirror;$('rotation').value=config.rotation;$('provider').value=config.provider;$('google-key').value=config.googleKey;$('confidence').value=config.confidence;
  $('camera-auto').checked=config.cameraAuto;populateCameraControls();$('settings').showModal();
}
$('camera-toggle').onclick=()=>active?stopCamera():startCamera();
$('settings-open').onclick=openSettings;
$('help-open').onclick=()=>{cancelGesture();$('help').showModal();};$('help-close').onclick=()=>$('help').close();
$('settings').addEventListener('close',async()=>{
  if($('settings').returnValue!=='save')return;
  const wasActive=active;stopCamera();
  const oldKey=config.googleKey,oldProvider=config.provider,oldCamera=config.cameraId;
  Object.assign(config,{cameraId:$('camera-select').value,mirror:$('mirror').checked,rotation:+$('rotation').value,provider:$('provider').value,googleKey:$('google-key').value.trim(),confidence:+$('confidence').value,cameraAuto:$('camera-auto').checked,cameraControls:readCameraControls()});
  if(oldCamera!==config.cameraId)config.cameraControls={};
  save();
  // Reload clears Google SDK and credentials when switching/changing key.
  if(oldKey!==config.googleKey || oldProvider!==config.provider) { location.reload();return; }
  if(wasActive)startCamera();
});
$('zoom-in').onclick=()=>map.zoom(.5,$('map').clientWidth/2,$('map').clientHeight/2);
$('zoom-out').onclick=()=>map.zoom(-.5,$('map').clientWidth/2,$('map').clientHeight/2);
$('home').onclick=()=>map.home();
$('reset-sequence').onclick=()=>{cancelGesture();map.resetSequence();notify('Recorrido reiniciado en el punto 1.');};
const cameraRangeIds={contrast:'camera-contrast',brightness:'camera-brightness',exposureCompensation:'camera-exposure'};
function populateCameraControls() {
  const track=stream?.getVideoTracks()[0];cameraControlsAvailable=track?getCameraControls(track):{ranges:{}};
  const settings=track?.getSettings?.()||{};
  let count=0;
  for(const [key,id] of Object.entries(cameraRangeIds)) {
    const range=cameraControlsAvailable.ranges[key];$(id+'-label').hidden=!range;
    if(!range)continue;
    count++;const input=$(id);input.min=range.min;input.max=range.max;input.step=range.step||1;
    input.value=config.cameraControls[key]??settings[key]??(range.min+range.max)/2;
    $(id+'-value').textContent=input.value;input.oninput=()=>$(id+'-value').textContent=input.value;
  }
  $('camera-controls-note').textContent=!track?'Inicia la cámara para ver sus controles disponibles.':count?(cameraControlReport?.status==='unverified'?'La cámara ofrece controles, pero no confirma todos los valores solicitados.':cameraControlReport?.status==='mismatch'?'La cámara no confirmó los últimos ajustes. Revisa la imagen.':'Se muestran sólo los controles que ofrece esta cámara.'):'Esta cámara no ofrece controles de contraste o exposición al programa.';
}
function readCameraControls() {return Object.fromEntries(Object.entries(cameraRangeIds).filter(([key])=>cameraControlsAvailable.ranges[key]).map(([key,id])=>[key,+$(id).value]));}
function percentile(values,q) {if(!values.length)return null;return [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(q*values.length))];}
$('mark-false-click').onclick=()=>{counters.markedFalseClicks++;$('false-click-count').textContent=`${counters.markedFalseClicks} marcados`;};
$('export-metrics').onclick=()=>{
  const report={version:'0.1.5',startedAt,exportedAt:new Date().toISOString(),...counters,configuration:{confidence:config.confidence,cameraResolution:[$('video').videoWidth,$('video').videoHeight],mapping:'full-frame',rotation:config.rotation,mirror:config.mirror,cameraControls:config.cameraControls,qualityProtection:true},qualityMs:{p50:percentile(qualityTimes,.5),p95:percentile(qualityTimes,.95)},inferenceMs:{p50:percentile(inferenceTimes,.5),p95:percentile(inferenceTimes,.95)},captureToResultMs:{p50:percentile(timings,.5),p95:percentile(timings,.95)},notes:'Captura a resultado excluye buffer de cámara y presentación de pantalla; no es latencia extremo a extremo. Falsos positivos requieren etiquetado humano. Máximo 10000 muestras recientes.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`sesion-gestual-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(event.code==='Space' && !$('settings').open && !$('help').open) {event.preventDefault();if(active){paused=!paused;cancelGesture();updateStatus();}}
  if(event.key==='Escape')cancelGesture();
});
window.addEventListener('blur',()=>{if(active){paused=true;cancelGesture();updateStatus();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden && active){paused=true;cancelGesture();updateStatus();}});
await loadMap();
updateStatus();
if(smoke)initializeWorker();

import './style.css';
import { GestureEngine, classifyHand, pointerReference } from './gestures.js';
import { cameraToMap } from './mapping.js';
import { FrameQualityGate, analyzeFrameQuality } from './frame-quality.js';
import { getCameraControls, applyCameraControls } from './camera-quality.js';
import { createMap } from './map.js';
import { SelectionFeedback, hoverTarget } from './selection.js';

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
let map, worker, workerReady=false, busy=false, stream, active=false, paused=false, latestHands=[], lastFrame=-1;
let engine = new GestureEngine();
const selection=new SelectionFeedback();
let renderedSelectionHandId=null;
let hoverElement;
const controlIds=new WeakMap();let nextControlId=0;
const timings=[], inferenceTimes=[],qualityTimes=[];
const counters={frames:0,clicks:0,panEvents:0,zoomEvents:0,markedFalseClicks:0};
const startedAt=new Date().toISOString();
const linePairs=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const labels={idle:'En reposo',point:'Apuntando','click-pending':'Índice sobre el punto · 1,5 s','click-confirmed':'Seleccionado',navigate:'Navegación'};
const selectionReasonLabels={'release-required':'Sal del punto para seleccionar otra vez','invalid-geometry':'Seguimiento no válido para actuar'};
let lastActiveSelectionState=null,lastSelectionReason=null;
const selectionReasonCounts={};
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
function cancelGesture(hide=true) { engine.cancelInteraction();engine.cancelClick(true);selection.reset();renderedSelectionHandId=null;highlightTarget(null);for(const cursor of [$('cursor'),$('cursor-secondary')]){if(hide)cursor.style.display='none';cursor.dataset.state='idle';cursor.querySelector('.cursor-progress').style.strokeDashoffset=213.63;} $('click-ripple').classList.remove('play'); }
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
      let result=engine.update(latestHands,data.timestamp,blocked?{}:selectionContext(engine));
      // The engine validates each participating hand. A free hand must not
      // cancel an otherwise valid action by changing the observed count.
      if(blocked) {
        engine.cancelInteraction();engine.cancelClick(true);
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
  const selectionRecoveryFeedback=await verifySelectionRecoveryFeedback();
  const selectionToleranceFeedback=await verifySelectionToleranceFeedback();
  const indexTrackingFeedback=await verifyIndexTrackingFeedback(data);
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
    && nativeSelection.buttonClickAccepted && nativeSelection.trustedClicks===4 && nativeSelection.sequenceCompleted && nativeSelection.advancesOnlyOnPoint
    && nativeSelection.pointHold.companionContinuity && nativeSelection.buttonHold.companionContinuity
    && [nativeSelection.pointHold,nativeSelection.buttonHold,...nativeSelection.sequenceHolds].every(h=>h.clickAccepted && h.elapsedMs>=1500 && h.clicks===1 && h.noEarlyClick && h.cursorLocked && h.postureIndependent && h.tremorTolerated && h.emptySpaceNoClick && h.targetAcquiredAtIndex)
    && Object.values(qualityFeedback).every(Boolean) && Object.values(previewFeedback).every(Boolean) && map.info().boundaryLoaded && nativeSelection.holdElapsedMs>=1500
    && Object.values(fistViewsFeedback).every(Boolean)
    && Object.values(indexTrackingFeedback).every(Boolean)
    && Object.values(selectionRecoveryFeedback).every(Boolean)
    && Object.values(selectionToleranceFeedback).every(Boolean)
    && nativeSelection.cursorLocked && nativeSelection.ringHalfVisible && nativeSelection.noEarlyClick && nativeSelection.oneClickWhileHeld;
  window.desktop.reportSmoke({version:'0.1.13',ok,provider:map.provider,wasmLoaded:true,telemetryBlockedByWorkerCsp:telemetryBlocked,emptyFrame:emptyFrameResult,positiveFixture:{hands:data.landmarks.length,landmarks:data.landmarks[0]?.length,worldLandmarks:data.worldLandmarks?.[0]?.length,inferenceMs:data.inferenceMs,qualityValid:data.quality?.valid,qualityMs:data.qualityMs},zoomWorks,popupWorks:nativeSelection.popupOpened,selectionWorks:nativeSelection.selectionWorks,pointerFeedback,navigationFeedback,fistViewsFeedback,indexTrackingFeedback,selectionRecoveryFeedback,selectionToleranceFeedback,qualityFeedback,previewFeedback,nativeSelection,mapView:map.info()});
}
async function verifySelectionRecoveryFeedback(){
  map.resetSequence();map.home();cancelGesture();
  const fixture=await (await fetch('/fixtures/selection-poses.json')).json(),saved=engine;
  const rect=$('map').getBoundingClientRect(),target=map.targets()[0];
  const hand=(pose,id='recovery',dx=0,dy=0)=>({id,landmarks:fixture.poses[pose].map(p=>({...p,
    x:p.x+target.x/rect.width-fixture.poses[pose][8].x+dx,
    y:p.y+target.y/rect.height-fixture.poses[pose][8].y+dy}))});
  const tick=async(h,t)=>{const result=engine.update(h,t,selectionContext(engine));await renderGesture(result,h.length);return result;};
  try {
    engine=new GestureEngine();let zoom;
    for(const time of [0,100,180])zoom=await tick([hand('ok'),hand('ok','other',-.30)],time);
    const navigationLabel=$('gesture-metric').textContent==='Zoom';
    const one=await tick([hand('index')],220);
    const releaseHint=one.selectionBlockedReason==='release-required' && $('gesture-metric').textContent.includes('Sal del punto');
    const noClickAfterZoom=one.events.length===0 && one.progress===0 && one.mode!=='click-pending';
    await renderGesture(one,1,{blocked:true});
    const hintSurvivesDialog=$('gesture-metric').textContent.includes('último estado: Sal del punto');
    for(const time of [260,340,420])await tick([hand('index','recovery',0,.12)],time);
    const rearmed=await tick([hand('point')],460);
    const leavingTargetRearms=rearmed.mode==='click-pending' && rearmed.progress===0 && !rearmed.selectionBlockedReason;
    cancelGesture();engine=new GestureEngine();
    const world=await tick([{...hand('point'),worldLandmarks:[]}],0);
    const worldDoesNotVetoHover=world.mode==='click-pending' && world.progress===0 && !world.selectionBlockedReason;
    cancelGesture();engine=new GestureEngine();
    const corrupt=hand('index');corrupt.landmarks[8].x=NaN;
    const rejected=await tick([corrupt],0);
    const invalidImageHint=rejected.selectionBlockedReason==='invalid-geometry' && $('gesture-metric').textContent.includes('Seguimiento no válido');
    return {navigationLabel,releaseHint,noClickAfterZoom,hintSurvivesDialog,leavingTargetRearms,worldDoesNotVetoHover,invalidImageHint};
  } finally {cancelGesture();engine=saved;cancelGesture();}
}
async function verifySelectionToleranceFeedback(){
  map.resetSequence();map.home();cancelGesture();
  const saved=engine,fixture=await (await fetch('/fixtures/selection-poses.json')).json();
  const rect=$('map').getBoundingClientRect(),target=map.targets()[0];
  const hand=(pose,x=target.x,y=target.y)=>({id:'tolerance',landmarks:fixture.poses[pose].map(p=>({...p,x:p.x+x/rect.width-fixture.poses[pose][8].x,y:p.y+y/rect.height-fixture.poses[pose][8].y}))});
  const tick=async(h,t)=>{const result=engine.update([h],t,selectionContext(engine));await renderGesture(result,1);return result;};
  const feedback={};
  try {
    engine=new GestureEngine();await tick(hand('index'),0);
    for(const time of [100,200,300,400,500])await tick(hand('index',target.x+42*Math.sin(time),target.y+30*Math.cos(time)),time);
    const outside=await tick(hand('index',target.x+target.width/2+37),600);
    feedback.outsideRegionCancels=$('cursor').dataset.state==='idle' && !$('map').querySelector('.gesture-target') && outside.events.length===0;
    const returned=await tick(hand('index'),640);
    feedback.returnStartsFullDwell=returned.mode==='click-pending' && returned.progress===0 && !returned.selectionBlockedReason && $('cursor').dataset.state==='loading';
    const victory=hand('index');
    for(let i=1;i<=3;i++)victory.landmarks[9+i]={...victory.landmarks[9+i],x:victory.landmarks[9].x,y:victory.landmarks[9].y+fixture.poses.index[5+i].y-fixture.poses.index[5].y,z:0};
    const extra=await tick(victory,740);
    feedback.extraFingerKeepsDwell=extra.mode==='click-pending' && extra.progress>0 && extra.events.length===0 && $('cursor').dataset.state==='loading';
    for(const time of [800,880,960])await tick(victory,time);
    const continued=await tick(hand('point'),1000);
    feedback.thumbAndPostureKeepTimer=continued.mode==='click-pending' && Math.abs(continued.progress-360/1500)<1e-8 && continued.events.length===0;
    cancelGesture();engine=new GestureEngine();
    const thumb=await tick(hand('point'),0);
    feedback.extendedThumbAccepted=thumb.mode==='click-pending' && thumb.progress===0 && $('cursor').dataset.state==='loading';
    cancelGesture();engine=new GestureEngine();
    const empty=hand('index',rect.width*.85,rect.height*.20);
    let emptyEvents=0;
    for(const time of [40,140,240,340,440,540])emptyEvents+=(await tick(empty,time)).events.length;
    feedback.emptySpaceNoLoading=$('cursor').dataset.state==='idle' && !$('map').querySelector('.gesture-target') && emptyEvents===0;
    let acquired=null;
    for(let step=1;step<=12;step++){
      const x=rect.width*.85+(target.x-rect.width*.85)*step/12,y=rect.height*.20+(target.y-rect.height*.20)*step/12;
      const result=await tick(hand('point',x,y),540+step*40);
      if($('cursor').dataset.state==='loading' && acquired===null)acquired=result;
    }
    feedback.targetAcquiresFreshTimer=!!acquired && acquired.progress===0 && acquired.events.length===0;
  } finally {cancelGesture();engine=saved;cancelGesture();map.home();}
  return feedback;
}
async function verifyNativeSelection() {
  map.resetSequence();map.home();map.pan(180,90);cancelGesture();
  const target=map.targets()[0];
  const fixture=await (await fetch('/fixtures/selection-poses.json')).json();
  let trustedClicks=0;const observe=event=>{if(event.isTrusted)trustedClicks++;};$('map').addEventListener('click',observe,true);
  const pointHold=await verifyHoldAt(target,fixture,()=>trustedClicks,true,'changing');
  await waitFor(()=>$('map').querySelector('.demo-popup button'),2000,`popup (clicks=${pointHold.clicks}, accepted=${pointHold.clickAccepted})`);
  const button=$('map').querySelector('.demo-popup button');
  cancelGesture();
  const buttonTarget=selectionTargets($('map').getBoundingClientRect()).find(t=>t.element===button);
  if(!buttonTarget)throw new Error('Smoke: botón de popup no disponible');
  const buttonHold=await verifyHoldAt(buttonTarget,fixture,()=>trustedClicks,false,'always');
  await waitFor(()=>button.textContent==='Punto seleccionado',2000,`selección de botón (accepted=${buttonHold.clickAccepted}, clicks=${buttonHold.clicks}, elapsed=${buttonHold.elapsedMs}, locked=${buttonHold.cursorLocked}, trusted=${trustedClicks})`);
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
async function verifyHoldAt(target,fixture,trustedCount,captureProgress=false,companionMode=null) {
  const rect=$('map').getBoundingClientRect();
  const dx=target.x/rect.width-fixture.poses.index[8].x,dy=target.y/rect.height-fixture.poses.index[8].y;
  const hand=(pose,jx=0,jy=0)=>({id:'smoke-hand',landmarks:fixture.poses[pose].map(p=>({...p,x:p.x+dx+jx/rect.width,y:p.y+dy+jy/rect.height}))});
  const saved=engine,synthetic=new GestureEngine();engine=synthetic;selection.reset();
  const freeX=target.x/rect.width<.5?.8:.2;
  const companion=pose=>({id:'free-hand',landmarks:fixture.poses[pose].map(p=>({...p,x:p.x+freeX-fixture.poses[pose][8].x,y:p.y+.5-fixture.poses[pose][8].y}))});
  const currentCursor=result=>[$('cursor'),$('cursor-secondary')].find(cursor=>cursor.dataset.hand===String(result.selectionHandId))||$('cursor');
  let companionFrames=0,companionFistFrames=0,selectionOnSecondary=false,companionExited=false,hadCompanion=false,lastProgress=0,continued=true,orderReversedDuringHold=false;
  const frame=async (selected,time,elapsed=0)=>{
    const present=companionMode==='always' || (companionMode==='changing' && elapsed>=250 && !(elapsed>=900 && elapsed<1200));
    const pose=companionMode==='always' || elapsed>=650?'fist':'point';
    const reverse=companionMode==='changing' && elapsed>=450 && elapsed<650;
    const hands=present?(reverse?[selected,companion(pose)]:[companion(pose),selected]):[selected];
    const result=synthetic.update(hands,time,selectionContext(synthetic)),accepted=await renderGesture(result,hands.length);
    if(present){companionFrames++;companionFistFrames+=pose==='fist';hadCompanion=true;}
    else if(hadCompanion)companionExited=true;
    selectionOnSecondary ||= currentCursor(result)===$('cursor-secondary') && result.mode==='click-pending';
    if(result.mode==='click-pending' || result.mode==='click-confirmed'){
      orderReversedDuringHold ||= present && reverse;
      continued &&= result.progress>=lastProgress && !result.events.some(event=>event.type==='pan'||event.type==='zoom');
      lastProgress=result.progress;
    }
    return {result,accepted,cursor:currentCursor(result)};
  };
  const beforeClicks=trustedCount();let emptySpaceNoClick=true;
  for(let warmupFrame=0;warmupFrame<5;warmupFrame++){
    const {result}=await frame(hand('point',0,-100),performance.now());
    emptySpaceNoClick &&= result.mode!=='click-pending' && result.events.every(e=>e.type!=='click') && trustedCount()===beforeClicks;
    await sleep(40);
  }
  const start=performance.now(),initial=await frame(hand('point'),start);
  if(initial.result.mode!=='click-pending' || initial.result.progress!==0)throw new Error('Smoke: índice sobre objetivo no inició mantenimiento completo');
  const targetAcquiredAtIndex=Math.abs(parseFloat(initial.cursor.style.left)-target.x)<.5 && Math.abs(parseFloat(initial.cursor.style.top)-target.y)<.5;
  let cursorLocked=true,ringHalfVisible=false,noEarlyClick=true,clicks=0,elapsedMs=0,clickAccepted=false,progressCaptured=false,tremorFrames=0,maxTremorPx=0,thumbOutFrames=0,extraFingerFrames=0,invalidWorldFrames=0;
  const anchor={x:target.x,y:target.y};
  while(performance.now()-start<1800){
    const now=performance.now(),elapsed=now-start;
    // Raw landmark motion exceeds the old narrow hover area. The fixed hold
    // region must retain the same target and clock while the ring stays put.
    const jx=elapsed<80?0:42*Math.sin(elapsed/180),jy=elapsed<80?0:32*Math.cos(elapsed/170);
    const selected=hand(elapsed<500?'index':'point',jx,jy);
    if(elapsed>=850){
      for(const mcp of [9,13,17])for(let i=1;i<=3;i++)selected.landmarks[mcp+i]={...selected.landmarks[mcp+i],
        x:selected.landmarks[mcp].x,y:selected.landmarks[mcp].y+fixture.poses.index[5+i].y-fixture.poses.index[5].y,z:0};
      // World estimates of non-index fingers must not gate index hover.
      selected.worldLandmarks=[];
    }
    const {result,accepted,cursor}=await frame(selected,now,elapsed);
    if(elapsed>=500)thumbOutFrames++;
    if(elapsed>=850){extraFingerFrames++;invalidWorldFrames++;}
    continued &&= result.mode==='click-pending' || result.mode==='click-confirmed';
    tremorFrames++;maxTremorPx=Math.max(maxTremorPx,Math.hypot(jx,jy));
    cursorLocked &&= Math.abs(parseFloat(cursor.style.left)-anchor.x)<.5 && Math.abs(parseFloat(cursor.style.top)-anchor.y)<.5;
    if(result.progress>=.45 && result.progress<=.65){
      const ring=cursor.querySelector('.cursor-progress'),style=getComputedStyle(ring);
      ringHalfVisible ||= style.opacity==='1' && Math.abs(parseFloat(style.strokeDashoffset)-213.63*(1-result.progress))<.2;
      if(captureProgress && !progressCaptured){progressCaptured=true;window.desktop.reportSmoke({phase:'progress',progress:result.progress});}
    }
    if(elapsed<1500 && (result.events.length || trustedCount()!==beforeClicks))noEarlyClick=false;
    if(result.events.some(event=>event.type==='click')){clicks++;elapsedMs=elapsed;clickAccepted=accepted[0]===true;}
    await sleep(40);
  }
  const companionContinuity=!companionMode || (continued && companionFrames>0 && companionFistFrames>0 && selectionOnSecondary
    && (companionMode!=='changing' || (companionExited && orderReversedDuringHold)) && clicks===1 && clickAccepted);
  engine=saved;
  return {clickAccepted,elapsedMs,cursorLocked,ringHalfVisible,noEarlyClick,clicks,postureIndependent:continued && thumbOutFrames>0 && extraFingerFrames>0 && invalidWorldFrames>0 && clicks===1,thumbOutFrames,extraFingerFrames,invalidWorldFrames,emptySpaceNoClick,targetAcquiredAtIndex,tremorTolerated:continued&&maxTremorPx>40&&clicks===1,tremorFrames,maxTremorPx,companionMode,companionContinuity,companionFrames,companionFistFrames,selectionOnSecondary,companionExited,orderReversedDuringHold};
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
  const pointers=[...(result.pointers||[])];
  const represented=new Set(pointers.map(pointer=>pointer.handIndex));
  return [...pointers,...latestHands.slice(0,2).flatMap((hand,index)=>{
    if(represented.has(index))return [];
    const points=hand.landmarks;
    if(!Array.isArray(points) || points.length!==21 || points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return [];
    const shape=classifyHand(hand,engine.options);
    const p=shape?pointerReference(shape):points[8];
    return [{id:`detected-${index}`,handIndex:index,...p}];
  })].slice(0,2);
}
function renderGesture(result,detectedHands=latestHands.length,{blocked=false}={}) {
  const rect=$('map').getBoundingClientRect();
  if(result.resetSelection){selection.reset();highlightTarget(null);$('click-ripple').classList.remove('play');}
  const selectionCursor=result.selectionCursor??result.cursor;
  const p=selectionCursor && mapPoint(selectionCursor);
  const live=result.selectionLiveCursor?mapPoint(result.selectionLiveCursor):p;
  const navigation=result.mode==='navigate'?result.navigationKind||'ready':null;
  const reason=result.selectionBlockedReason||null;
  const stateLabel=navigation==='pan'?'Desplazando':navigation==='zoom'?'Zoom':selectionReasonLabels[reason]||labels[result.mode]||result.mode;
  // Opening settings pauses input. Preserve the preceding live reason instead
  // of replacing every diagnostic with the dialog's own pause state.
  if(!blocked){
    lastActiveSelectionState={mode:result.mode,reason,hands:detectedHands,at:new Date().toISOString()};
    if(reason && reason!==lastSelectionReason)selectionReasonCounts[reason]=(selectionReasonCounts[reason]||0)+1;
    lastSelectionReason=reason;
  }
  $('gesture-metric').textContent=blocked?`Control en espera${lastActiveSelectionState?.reason?` · último estado: ${selectionReasonLabels[lastActiveSelectionState.reason]||lastActiveSelectionState.reason}`:''}`:stateLabel;
  const pointers=displayPointers(result,detectedHands);
  const selectionHandId=result.selectionHandId??null;
  if(selectionHandId!==renderedSelectionHandId){selection.reset();renderedSelectionHandId=selectionHandId;}
  const selecting=selectionHandId!==null && selectionHandId!==undefined && !blocked && !navigation && !result.navigationCandidateKind
    && pointers.some(pointer=>pointer.id===selectionHandId);
  let feedback={point:null,target:null,cancel:false};
  if(selecting && within(live))feedback=selection.update({x:live.x*rect.width,y:live.y*rect.height},result.mode,selectionTargets(rect),rect);
  else {selection.reset();if(result.mode==='click-pending')engine.cancelClick();}
  if(feedback.cancel){engine.cancelClick(false);selection.reset();}
  for(const [index,cursor] of [$('cursor'),$('cursor-secondary')].entries()) {
    const selectionPointer=selecting && pointers[index]?.id===selectionHandId;
    const point=pointers[index] && mapPoint(pointers[index]);
    const visible=within(point);
    cursor.style.display=visible?'block':'none';
    if(visible){const displayed=selectionPointer && feedback.point?feedback.point:{x:point.x*rect.width,y:point.y*rect.height};cursor.style.left=`${displayed.x}px`;cursor.style.top=`${displayed.y}px`;}
    cursor.dataset.hand=pointers[index]?.id??'';
    const contributes=!Array.isArray(result.navigationHandIds) || result.navigationHandIds.includes(pointers[index]?.id);
    cursor.dataset.navigation=contributes?navigation||'':'';
    cursor.dataset.blocked=String(blocked);
    cursor.dataset.state=selectionPointer && !feedback.cancel?
      result.mode==='click-pending'?'loading':result.mode==='click-confirmed'?'confirmed':feedback.target?'hover':'idle':'idle';
    const showingDwell=result.mode==='click-pending' || result.mode==='click-confirmed';
    cursor.querySelector('.cursor-progress').style.strokeDashoffset=213.63*(1-(selectionPointer && !feedback.cancel && showingDwell?result.progress:0));
  }
  if(!selecting)$('click-ripple').classList.remove('play');
  highlightTarget(selecting && !feedback.cancel?feedback.target:null);
  const actions=[];
  if(blocked)return Promise.resolve(actions);
  for(const event of result.events) {
    if(event.type==='click') {
      if(!selecting || !feedback.point || !feedback.target || feedback.cancel)continue;
      const {x,y}=feedback.point;
      actions.push(window.desktop.click({x:rect.left+x,y:rect.top+y}).then(ok=>{
        if(ok){counters.clicks++;if(smoke || (active && !isBlocked()))pulse(x,y);}
        else{engine.cancelClick();selection.reset();for(const cursor of [$('cursor'),$('cursor-secondary')])cursor.dataset.state='idle';}
        return ok;
      }).catch(error=>{engine.cancelClick();selection.reset();for(const cursor of [$('cursor'),$('cursor-secondary')])cursor.dataset.state='idle';if(smoke)throw error;notify(`No se pudo seleccionar: ${error.message}`);return false;}));
    } else if(event.type==='pan' && navigation==='pan' && (detectedHands===1 || detectedHands===2) && result.cursor
      && result.navigationHandIds?.length && result.navigationHandIds.every(id=>pointers.some(pointer=>pointer.id===id))) {
      // The visual halo can ease from index to knuckles independently of the
      // navigation baseline. Only physical movement supplied by the engine pans.
      const current=mapPoint(result.cursor),old=mapPoint({x:result.cursor.x-event.dx,y:result.cursor.y-event.dy});
      if(within(current) && within(old)){map.pan((current.x-old.x)*rect.width,(current.y-old.y)*rect.height);counters.panEvents++;}
    } else if(event.type==='zoom' && navigation==='zoom' && detectedHands===2 && result.navigationHandIds?.length===2
      && result.navigationHandIds.every(id=>pointers.some(pointer=>pointer.id===id))) {
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
function selectionContext(interpreter) {
  const rect=$('map').getBoundingClientRect(),targets=selectionTargets(rect);
  const ownerId=interpreter.selectionHandId;
  return {selectionTargetForHand:({trackId,pointer})=>{
    const mapped=mapPoint(pointer);
    if(!within(mapped))return null;
    const point={x:mapped.x*rect.width,y:mapped.y*rect.height};
    if(trackId===ownerId){
      const retained=selection.retainedTargetId(point,targets,rect);
      if(retained)return retained;
    }
    return hoverTarget(point,targets,trackId===ownerId?selection.hoverId:null)?.id??null;
  }};
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
async function verifyIndexTrackingFeedback(data) {
  const fixture=await (await fetch('/fixtures/selection-poses.json')).json();
  const clone=points=>points.map(p=>({...p}));
  const open=clone(fixture.poses.point);
  for(const mcp of [9,13,17])for(let offset=1;offset<4;offset++)for(const axis of ['x','y','z'])
    open[mcp+offset][axis]=open[mcp][axis]+open[5+offset][axis]-open[5][axis];
  const neutral=clone(fixture.poses.fist);
  for(let index=1;index<=4;index++)neutral[index]={...fixture.poses.point[index]};
  const shapes={point:{landmarks:fixture.poses.point},open:{landmarks:open},neutral:{landmarks:neutral},ok:{landmarks:fixture.poses.ok},
    fist:{landmarks:fixture.poses.fist},model:{landmarks:data.landmarks[0],worldLandmarks:data.worldLandmarks[0]}};
  if(!classifyHand(shapes.open)?.open || classifyHand(shapes.neutral)?.fist)throw new Error('Smoke: referencias de reposo inválidas');
  const pair=(hand,dx=0)=>[.35,.65].map((x,index)=>({...hand,id:`index-${index}`,landmarks:hand.landmarks.map(p=>({...p,x:p.x+x-.5+dx}))}));
  const shownAt=(result,hands,fist=false)=>{
    const rect=$('map').getBoundingClientRect();
    return [$('cursor'),$('cursor-secondary')].every((cursor,index)=>{
      const points=hands[index].landmarks;
      const reference=fist?[5,9,13,17].reduce((p,i)=>({x:p.x+points[i].x/4,y:p.y+points[i].y/4}),{x:0,y:0}):points[8];
      const point=mapPoint(reference);
      return cursor.style.display==='block' && Math.abs(parseFloat(cursor.style.left)-point.x*rect.width)<.5
        && Math.abs(parseFloat(cursor.style.top)-point.y*rect.height)<.5;
    });
  };
  const feedback={};
  for(const [name,hand] of Object.entries(shapes)) {
    const hands=pair(hand),synthetic=new GestureEngine();
    const result=synthetic.update(hands,0);await renderGesture(result,2);
    feedback[`${name}Reference`]=shownAt(result,hands,name==='fist');
  }
  const synthetic=new GestureEngine(),initial=synthetic.update(pair(shapes.open),0);await renderGesture(initial,2);
  const before=initial.pointers.map(p=>({...p}));
  const closed=synthetic.update(pair(shapes.fist),40);await renderGesture(closed,2);
  feedback.closeWithoutJump=closed.pointers.every((p,i)=>Math.hypot(p.x-before[i].x,p.y-before[i].y)<1e-8);
  let held;
  for(const time of [140,240,340]){held=synthetic.update(pair(shapes.fist),time);await renderGesture(held,2);}
  feedback.stationaryFistConverges=shownAt(held,pair(shapes.fist),true) && held.navigationKind==='pan';
  const beforeOpen=held.pointers.map(p=>({...p}));
  const opened=synthetic.update(pair(shapes.open),380);await renderGesture(opened,2);
  feedback.openWithoutJump=opened.pointers.every((p,i)=>Math.hypot(p.x-beforeOpen[i].x,p.y-beforeOpen[i].y)<1e-8) && opened.events.length===0;
  let settled;
  for(const time of [480,580,680]){settled=synthetic.update(pair(shapes.open),time);await renderGesture(settled,2);}
  feedback.stationaryIndexConverges=shownAt(settled,pair(shapes.open));
  const saved=latestHands;
  try {
    latestHands=pair(shapes.open);const empty={mode:'idle',cursor:null,pointers:[],hands:0,events:[],progress:0};
    await renderGesture(empty,2,{blocked:true});feedback.fallbackIndex=shownAt(empty,latestHands);
    latestHands=pair(shapes.fist);await renderGesture(empty,2,{blocked:true});feedback.fallbackKnuckles=shownAt(empty,latestHands,true);
    latestHands=pair(shapes.open).map(hand=>({...hand,landmarks:hand.landmarks.map(p=>({...p,z:NaN}))}));
    await renderGesture(empty,2,{blocked:true});
    const rect=$('map').getBoundingClientRect();
    feedback.unknownGeometryUsesIndex=[$('cursor'),$('cursor-secondary')].every((cursor,i)=>{
      const point=mapPoint(latestHands[i].landmarks[8]);
      return Math.abs(parseFloat(cursor.style.left)-point.x*rect.width)<.5 && Math.abs(parseFloat(cursor.style.top)-point.y*rect.height)<.5;
    });
  } finally {latestHands=saved;cancelGesture();}
  return feedback;
}
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
    const single=new GestureEngine();map.home();cancelGesture();const beforeSingle=map.info();
    for(const time of [0,100,180])await renderGesture(single.update([hand('single',.5,.5)],time),1);
    const singleMoved=single.update([hand('single',.54,.5)],220);await renderGesture(singleMoved,1);
    feedback[`single-${view.name}`]=singleMoved.navigationKind==='pan' && singleMoved.events.some(e=>e.type==='pan')
      && singleMoved.events.every(e=>e.type==='pan') && map.info().zoom===beforeSingle.zoom && map.info().center.lng<beforeSingle.center.lng;
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
    if(!shape || (pose==='fist'&&!shape.fist) || (pose==='ok'&&!shape.ok))throw new Error(`Smoke: pose ${pose} inválida`);
    const source=pose==='ok'?shape.pinch:shape.center;
    return {id,landmarks:fixture.poses[pose].map(p=>({...p,x:p.x+x-source.x,y:p.y+y-source.y}))};
  };
  const pair=(pose,dx=0,spread=0)=>[hand(pose,'left',.35+dx-spread,.5),hand(pose,'right',.65+dx+spread,.5)];
  const single=(pose,dx=0)=>[hand(pose,'left',.35+dx,.5)];
  const singleEngine=new GestureEngine();map.home();cancelGesture();const beforeSingle=map.info();
  const entry=[];let candidateDoesNotSelect=true;
  for(const t of [0,100,180]){const r=singleEngine.update(single('fist'),t);entry.push(r);await renderGesture(r,1);candidateDoesNotSelect&&=$('cursor').dataset.state==='idle' && !$('map').querySelector('.gesture-target') && Number($('cursor').querySelector('.cursor-progress').style.strokeDashoffset)===213.63;}
  const singlePanWaits=entry[0].mode!=='navigate' && entry[1].mode!=='navigate' && entry[2].navigationKind==='pan' && entry.every(r=>r.events.length===0) && sameMapView(beforeSingle,map.info());
  const movedSingle=singleEngine.update(single('fist',.04),220);await renderGesture(movedSingle,1);
  const singlePanWorks=movedSingle.navigationKind==='pan' && movedSingle.events.some(e=>e.type==='pan') && map.info().center.lng<beforeSingle.center.lng;
  const singlePanNoZoomOrClick=movedSingle.events.every(e=>e.type==='pan') && map.info().zoom===beforeSingle.zoom;
  const singlePanColor=$('cursor').style.display==='block' && $('cursor-secondary').style.display==='none' && $('cursor').dataset.navigation==='pan' && getComputedStyle($('cursor')).getPropertyValue('--cursor-color').trim()==='137,87,229';
  const singlePanNoSelection=$('cursor').dataset.state==='idle' && !$('map').querySelector('.gesture-target') && Number($('cursor').querySelector('.cursor-progress').style.strokeDashoffset)===213.63;
  const beforeTwo=map.info(),toTwo=[];
  for(const t of [260,360,440]){const r=singleEngine.update(pair('fist',.04),t);toTwo.push(r);await renderGesture(r,2);}
  const oneToTwoReacquires=toTwo[0].mode!=='navigate' && toTwo[1].mode!=='navigate' && toTwo[2].navigationKind==='pan' && toTwo.every(r=>r.events.length===0) && sameMapView(beforeTwo,map.info());
  await renderGesture(singleEngine.update(pair('fist',.08),480),2);
  const beforeOne=map.info(),toOne=[];
  for(const t of [520,620,700]){const r=singleEngine.update(single('fist',.08),t);toOne.push(r);await renderGesture(r,1);}
  const twoToOneReacquires=toOne[0].mode!=='navigate' && toOne[1].mode!=='navigate' && toOne[2].navigationKind==='pan' && toOne.every(r=>r.events.length===0) && sameMapView(beforeOne,map.info());
  const beforeOpen=map.info(),opened=singleEngine.update(single('point',.08),740);await renderGesture(opened,1);
  const openingStopsSinglePan=opened.mode!=='navigate' && opened.events.length===0 && sameMapView(beforeOpen,map.info());
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
  const mixedEngine=new GestureEngine();let mixed;map.home();cancelGesture();
  for(const t of [1600,1700,1780]){mixed=mixedEngine.update([hand('fist','left',.35,.5),hand('point','right',.65,.5)],t);await renderGesture(mixed,2);}
  const mixedFistPan=mixed.mode==='navigate' && mixed.navigationKind==='pan' && mixed.events.length===0;
  const fistPointer=mixed.pointers.find(p=>p.id===mixed.navigationHandIds?.[0]);
  const mixedColors=[$('cursor'),$('cursor-secondary')].map(c=>({id:c.dataset.hand,kind:c.dataset.navigation,color:getComputedStyle(c).getPropertyValue('--cursor-color').trim()}));
  const freeHandStaysBlue=!!fistPointer && mixedColors.find(c=>c.id===String(fistPointer.id))?.color==='137,87,229' && mixedColors.find(c=>c.id!==String(fistPointer.id))?.color==='33,139,255';
  const beforeFree=map.info(),freeMoved=mixedEngine.update([hand('fist','left',.35,.5),hand('point','right',.75,.5)],1820);await renderGesture(freeMoved,2);
  const freeHandMovementIgnored=freeMoved.navigationKind==='pan' && freeMoved.events.length===0 && sameMapView(beforeFree,map.info());
  const fistMoved=mixedEngine.update([hand('fist','left',.39,.5),hand('point','right',.75,.5)],1860);await renderGesture(fistMoved,2);
  const mixedPanFollowsFist=fistMoved.events.some(e=>e.type==='pan') && fistMoved.events.every(e=>e.type==='pan') && map.info().center.lng<beforeFree.center.lng && map.info().zoom===beforeFree.zoom;
  const indexPriorityEngine=new GestureEngine(),beforeIndexPriority=map.info();
  const target=map.targets()[0],rect=$('map').getBoundingClientRect();
  const selecting={id:'right',landmarks:fixture.poses.index.map(p=>({...p,x:p.x+target.x/rect.width-fixture.poses.index[8].x,y:p.y+target.y/rect.height-fixture.poses.index[8].y}))};
  const indexPriority=indexPriorityEngine.update([hand('fist','left',.35,.5),selecting],2000,selectionContext(indexPriorityEngine));
  await renderGesture(indexPriority,2);
  const indexWithFistSelects=indexPriority.mode==='click-pending' && indexPriority.navigationKind===null
    && $('cursor-secondary').dataset.hand===String(indexPriority.selectionHandId) && $('cursor-secondary').dataset.state==='loading'
    && $('cursor').dataset.state==='idle' && sameMapView(beforeIndexPriority,map.info());
  const beforeGuard=map.info(),pointers=[{id:1,x:.3,y:.4},{id:2,x:.7,y:.6}];
  await renderGesture({mode:'navigate',navigationKind:'pan',cursor:{x:.5,y:.5},pointers,hands:2,progress:1,events:[{type:'zoom',delta:.2,x:.5,y:.5}]},2);
  await renderGesture({mode:'navigate',navigationKind:'zoom',cursor:{x:.5,y:.5},pointers,hands:2,progress:1,events:[{type:'pan',dx:.05,dy:0}]},2);
  const crossModeEventsIgnored=sameMapView(beforeGuard,map.info());
  await renderGesture({mode:'navigate',navigationKind:'pan',navigationHandIds:[2],cursor:{x:.5,y:.5},pointers:[pointers[0]],hands:1,progress:1,events:[{type:'pan',dx:.05,dy:0}]},2);
  const missingParticipantCannotPan=sameMapView(beforeGuard,map.info());
  map.home();cancelGesture();
  const width=$('map').getBoundingClientRect().width;
  // Verify the adapter's physical pixel deltas before Leaflet rounds them.
  // Quantized geography after fitBounds varies with the desktop viewport.
  const originalPan=map.pan,panCalls=[];
  map.pan=(dx,dy)=>{panCalls.push({dx,dy});return originalPan(dx,dy);};
  try {
    for(const x of [.3,.7])await renderGesture({mode:'navigate',navigationKind:'pan',navigationHandIds:[1],cursor:{x,y:.5},pointers:[{id:1,x,y:.5}],hands:1,progress:1,events:[{type:'pan',dx:.01,dy:0}]},1);
  } finally {map.pan=originalPan;}
  const panIgnoresVisualShift=panCalls.length===2 && panCalls.every(p=>Math.abs(p.dx-.01*width)<1e-6 && Math.abs(p.dy)<1e-6);
  map.home();cancelGesture();
  return {singlePanWorks,singlePanWaits,candidateDoesNotSelect,singlePanColor,singlePanNoSelection,singlePanNoZoomOrClick,oneToTwoReacquires,twoToOneReacquires,openingStopsSinglePan,panWorks,zoomWorks,noZoomDuringPan,translationInZoomIgnored,noPanDuringZoom,modeSwitchReacquires,mixedFistPan,freeHandStaysBlue,freeHandMovementIgnored,mixedPanFollowsFist,indexWithFistSelects,visibleDuringNavigation,crossModeEventsIgnored,missingParticipantCannotPan,panIgnoresVisualShift};
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
  const report={version:'0.1.13',startedAt,exportedAt:new Date().toISOString(),...counters,selectionDiagnostics:{lastActiveState:lastActiveSelectionState,reasonCounts:selectionReasonCounts},configuration:{confidence:config.confidence,cameraResolution:[$('video').videoWidth,$('video').videoHeight],mapping:'full-frame',rotation:config.rotation,mirror:config.mirror,cameraControls:config.cameraControls,qualityProtection:true},qualityMs:{p50:percentile(qualityTimes,.5),p95:percentile(qualityTimes,.95)},inferenceMs:{p50:percentile(inferenceTimes,.5),p95:percentile(inferenceTimes,.95)},captureToResultMs:{p50:percentile(timings,.5),p95:percentile(timings,.95)},notes:'Captura a resultado excluye buffer de cámara y presentación de pantalla; no es latencia extremo a extremo. Falsos positivos requieren etiquetado humano. Máximo 10000 muestras recientes.'};
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

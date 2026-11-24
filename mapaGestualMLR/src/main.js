import './style.css';
import './twin-projection.css';
import './map-credits.css';
import './glass-ui.css';
import './traffic-ui.css';
import './analysis-ui.css';
import { version as appVersion } from '../package.json';
import { GestureEngine, classifyHand, pointerReference } from './gestures.js';
import { cameraToMap } from './mapping.js';
import { FrameQualityGate, analyzeFrameQuality } from './frame-quality.js';
import { getCameraControls, applyCameraControls } from './camera-quality.js';
import { createMap } from './map.js';
import { createContentViewer } from './content-viewer.js';
import { SelectionFeedback, hoverTarget } from './selection.js';
import { createCouncilAgenda } from './council-agenda.js';
import { createCompanionPublisher } from './companion-channel.js';
import { MAP_TOPICS } from './map-topics.js';
import { PREVIOUS_COUNCIL_SESSION } from './previous-council-session.js';

const $ = id => document.getElementById(id);
const councilAgenda = createCouncilAgenda(document.querySelector('.map-intro'));
const smoke = new URLSearchParams(location.search).has('smoke');
const trafficCheck = new URLSearchParams(location.search).has('traffic-check');
const analysisCheck = new URLSearchParams(location.search).has('analysis-check');
const twinProjection = window.desktop?.twinBridge === true;
const companionEnabled = !twinProjection && !smoke && !trafficCheck && !analysisCheck;
const companion = createCompanionPublisher({ enabled: companionEnabled, onCurrentSession: showCurrentSession });
const previousSession = {mode:'previous-session',session:PREVIOUS_COUNCIL_SESSION};
let awaitingCurrentSession=companionEnabled;
let previousSessionVisible=companionEnabled;
let currentCompanionState={mode:'idle'};
setPreviousSessionVisible(previousSessionVisible);
if(previousSessionVisible)companion.publish(previousSession);
let lastAgendaIndex=councilAgenda.getState().index;
document.addEventListener('council-agenda-change', event => {
  if(event.detail.index!==lastAgendaIndex){
    lastAgendaIndex=event.detail.index;
    setPreviousSessionVisible(false);
  }
  if(!document.body.classList.contains('analysis-open')&&!document.body.classList.contains('experience-open'))publishMapAgenda();
});
$('council-previous-session').onclick=()=>{
  if(previousSessionVisible)showCurrentSession();
  else {
    setPreviousSessionVisible(true);
    publishMapAgenda();
  }
};
$('companion-open').hidden = twinProjection;
$('companion-open').onclick = () => {
  Promise.resolve(companion.open()).catch(()=>notify('No se pudo abrir la ficha técnica. Vuelve a intentarlo.'));
};
let twinLeaseActive = false, twinError = '';
if(twinProjection)document.body.classList.add('twin-projection');
if(trafficCheck && !twinProjection)$('mode-experiences').hidden=false;
const defaults = { cameraId:'', cameraLabel:'', mirror:true, rotation:0, provider:'osm', googleKey:'', confidence:.7, cameraAuto:true, cameraControls:{} };
let config;
try { config = { ...defaults, ...JSON.parse(localStorage.getItem('mlr-config') || '{}') }; } catch { config={...defaults}; }
if(twinProjection)config={...defaults,...await window.desktop.loadTwinConfig()};
if (smoke) config={...defaults};
// Each launch starts mirrored; adjustments remain editable for this session.
config.mirror=true;
// Full-frame mapping replaces saved table calibration in every session.
delete config.corners;
delete config.showPreview;
let qualityGate=new FrameQualityGate(),qualityState={allowActions:true,state:'good',reasons:[]};
let cameraControlsAvailable={ranges:{}},cameraControlReport=null,qualityWarningShown=false;
let map, contentViewer, worker, workerReady=false, busy=false, stream, active=false, paused=false, latestHands=[], lastFrame=-1;
let trafficExperience, experienceLoading = false, experienceGeneration = 0;
let analysisView, analysisLoading = false, analysisGeneration = 0;
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
let cameraStarting=false;
let hasFreshCameraResult=false;
let twinPreviewCanvas,twinPreviewContext,lastTwinPreview=0;
function notify(message,kind='general') { if(twinProjection && kind==='camera')return;noticeKind=kind;$('notice').textContent=message; $('notice').hidden=false; clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>$('notice').hidden=true,7500); }
function save() { localStorage.setItem('mlr-config',JSON.stringify(config)); }
function updateStatus() {
  const status=$('status'),toggle=$('camera-toggle'),pause=$('pause-gestures');
  const text=cameraStarting?'Conectando cámara…':active?(paused?'Gestos en pausa · cámara encendida':workerReady?'Gestos activos':'Preparando gestos…'):'Gestos desactivados';
  status.className=active ? (paused?'paused':'active') : '';
  if(status.textContent!==text)status.replaceChildren(document.createElement('i'),text);
  toggle.textContent=cameraStarting?'Conectando…':active?'Desactivar gestos':'Activar gestos';
  toggle.disabled=cameraStarting;
  toggle.classList.toggle('primary',!active);
  pause.hidden=!active||twinProjection;
  pause.textContent=paused?'Reanudar gestos':'Pausar gestos';
  pause.classList.toggle('primary',paused);
  $('diagnostics').hidden=!active&&!twinProjection;
  $('camera-preview-state').hidden=active;
  if(!active)clearTrackingPreview();
  reportTwinState();
}
function reportTwinState() {
  if(twinProjection)window.desktop.reportTwinState({cameraActive:active && twinLeaseActive,hands:latestHands.length,error:twinError,detectorReady:workerReady,inferenceFrames:counters.frames,cameraLabel:stream?.getVideoTracks()[0]?.label || ''});
}
function highlightTarget(target) { const element=target?.element;if(hoverElement!==element){hoverElement?.classList.remove('gesture-target');element?.classList.add('gesture-target');hoverElement=element;} }
function cancelGesture(hide=true) { analysisView?.clearHover();engine.cancelInteraction();engine.cancelClick(true);selection.reset();renderedSelectionHandId=null;highlightTarget(null);for(const cursor of [$('cursor'),$('cursor-secondary')]){if(hide)cursor.style.display='none';cursor.dataset.state='idle';cursor.querySelector('.cursor-progress').style.strokeDashoffset=213.63;} $('click-ripple').classList.remove('play'); }
function isBlocked() { return paused || (twinProjection ? !twinLeaseActive : !document.hasFocus()) || $('settings').open || $('help').open; }
function mapPoint(p) { return cameraToMap(p,config); }
function within(p) { return p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=0 && p.y>=0 && p.x<=1 && p.y<=1; }
async function loadMap() {
  analysisGeneration++; analysisLoading = false; analysisView?.destroy(); analysisView = null;
  experienceGeneration++; experienceLoading = false;
  trafficExperience?.destroy(); trafficExperience = null;
  showSurfaceMode('map');
  contentViewer?.destroy();
  map?.destroy(); $('map').replaceChildren();
  map=await createMap($('map'),{...config,offline:smoke},notify,undefined,openPointContent);
  $('mode-analysis').disabled=false;
  contentViewer=createContentViewer($('map'),{onChange:state=>{
    if(!['open','close','slide'].includes(state.reason))return;
    // A page change consumes this dwell. Keeping the same index on an arrow
    // must never turn into a second click on the new page.
    engine.cancelClick(true);selection.reset();highlightTarget(null);
    $('click-ripple').classList.remove('play');
  }});
  try {
    await contentViewer.ready;
    $('map-graphics-shortcut').disabled=false;
  } catch(error) {notify(error.message);}
}
function openPointContent(item) {
  if(trafficExperience?.isOpen || experienceLoading || analysisView?.isOpen || analysisLoading)return;
  setPreviousSessionVisible(false);
  councilAgenda.selectPoint(item.id);
  publishMapAgenda();
  if(item.id!=='point-0')return;
  const slides=contentViewer?.manifest?.slides;
  if(!slides?.length){notify('No se pudieron cargar los gráficos.');return;}
  contentViewer.open(slides,0);
}
function currentSurface(){return analysisView?.isOpen?analysisView:trafficExperience?.isOpen?trafficExperience:contentViewer?.isOpen?contentViewer:map;}
function setPreviousSessionVisible(visible) {
  if(!visible&&awaitingCurrentSession)return;
  previousSessionVisible=visible;
  const button=$('council-previous-session');
  button.setAttribute('aria-pressed',String(visible));
  button.textContent=visible?'Sesión actual':'Sesión pasada';
}
function showCurrentSession() {
  awaitingCurrentSession=false;
  setPreviousSessionVisible(false);
  companion.publish(currentCompanionState);
}
function publishCurrentState(state) {
  currentCompanionState=state;
  companion.publish(previousSessionVisible?previousSession:state);
}
function publishMapAgenda() {
  const agenda=councilAgenda.getState();
  publishCurrentState({mode:'agenda',agenda,points:MAP_TOPICS,selectedPointId:agenda.topic.pointId ?? null});
}
function showSurfaceMode(mode) {
  if(mode!=='map')setPreviousSessionVisible(false);
  document.body.classList.toggle('experience-open', mode==='experience');
  document.body.classList.toggle('analysis-open', mode==='analysis');
  $('mode-map').setAttribute('aria-pressed', String(mode==='map'));
  $('mode-experiences').setAttribute('aria-pressed', String(mode==='experience'));
  $('mode-analysis').setAttribute('aria-pressed', String(mode==='analysis'));
  if(mode==='map')publishMapAgenda();
  else publishCurrentState({mode:'idle'});
}
function showExperienceMode(enabled) { showSurfaceMode(enabled?'experience':'map'); }
function leaveExperience() {
  experienceGeneration++; experienceLoading = false;
  trafficExperience?.destroy(); trafficExperience = null;
  $('mode-experiences').disabled = false;
  showExperienceMode(false); cancelGesture(); map?.home();
}
async function enterExperience({ animate = true } = {}) {
  if(!trafficCheck || twinProjection || experienceLoading || trafficExperience?.isOpen)return;
  if(analysisView || analysisLoading)leaveAnalysis();
  const generation=++experienceGeneration;
  experienceLoading=true; contentViewer?.close(); cancelGesture(); showExperienceMode(true);
  $('mode-experiences').disabled=true;
  let instance;
  try {
    const [module, response]=await Promise.all([import('./traffic-experience.js'),fetch('/traffic/scene.json')]);
    if(!response.ok)throw new Error('No se pudo cargar el sector de muestra.');
    const scene=await response.json();
    if(generation!==experienceGeneration)return;
    await map.focus(scene.center,19,{animate});
    if(generation!==experienceGeneration)return;
    instance=await module.createTrafficExperience($('map'),{
      notify,onChange:()=>cancelGesture(),onExit:leaveExperience,
      ...(trafficCheck?{initialVehicleCount:5,persistVehicleCount:false}:{})
    });
    if(generation!==experienceGeneration){instance.destroy();return;}
    trafficExperience=instance;
    await instance.ready;
    if(generation!==experienceGeneration){instance.destroy();return;}
    cancelGesture();
  } catch(error) {
    instance?.destroy();
    if(generation===experienceGeneration){leaveExperience();notify(error.message || 'No se pudo abrir la experiencia.');}
    if(trafficCheck)throw error;
  } finally {
    if(generation===experienceGeneration){experienceLoading=false;$('mode-experiences').disabled=false;}
  }
}
function leaveAnalysis() {
  analysisGeneration++; analysisLoading=false;
  analysisView?.destroy(); analysisView=null; map?.setAnalysisLayer(null); map?.setAnalysisMode(false);
  $('mode-analysis').disabled=false; showSurfaceMode('map'); cancelGesture(); map?.home();
}
async function enterAnalysis({ focusFilters = false } = {}) {
  if(!map || twinProjection || analysisLoading || analysisView?.isOpen)return;
  if(trafficExperience || experienceLoading)leaveExperience();
  const generation=++analysisGeneration;
  analysisLoading=true; contentViewer?.close(); cancelGesture(); showSurfaceMode('analysis');
  map.setAnalysisMode(true); $('mode-analysis').disabled=true;
  let instance;
  try {
    const module=await import('./analysis-view.js');
    if(generation!==analysisGeneration)return;
    instance=await module.createAnalysisView($('map'),{map,notify,
      onChange:({automatic=false}={})=>{if(!automatic)cancelGesture();},
      onCompanion:state=>{if(generation===analysisGeneration)publishCurrentState(state);}
    });
    if(generation!==analysisGeneration){instance.destroy();return;}
    analysisView=instance; await instance.ready;
    if(generation!==analysisGeneration){instance.destroy();return;}
    cancelGesture();
    if(focusFilters&&[document.body,$('mode-analysis')].includes(document.activeElement)){
      $('analysis-category-security')?.focus({preventScroll:true});
    }
  } catch(error) {
    instance?.destroy();
    if(generation===analysisGeneration){leaveAnalysis();notify(error.message || 'No se pudo abrir Análisis.');}
    if(analysisCheck)throw error;
  } finally {
    if(generation===analysisGeneration){analysisLoading=false;$('mode-analysis').disabled=false;}
    else if(focusFilters&&document.activeElement===document.body&&$('mode-map').getAttribute('aria-pressed')==='true'){
      $('mode-analysis').focus({preventScroll:true});
    }
  }
}
function initializeWorker() {
  worker?.terminate(); workerReady=false; busy=false;
  const workerGeneration=cameraGeneration;
  worker=new Worker(new URL('./vision.worker.js',import.meta.url));
  worker.onmessage=event=>{
    if(!smoke && workerGeneration!==cameraGeneration)return;
    const data=event.data;
    if(data.type==='ready') { workerReady=true; telemetryBlocked=data.telemetryBlocked; if(smoke) smokeFrame();else updateStatus(); }
    else if(data.type==='error') { busy=false; if(twinProjection)twinError=`Detector: ${data.message}`;notify(`Detector: ${data.message}`); if(smoke) window.desktop.reportSmoke({ok:false,error:data.message}); else stopCamera(); }
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
      const handCount=data.landmarks.length;
      const handStatus=paused&&!twinProjection?'Gestos en pausa':handCount===0&&!twinProjection?'Muestra una mano a la cámara':`${handCount} ${handCount===1?'mano':'manos'}`;
      if($('hands-metric').textContent!==handStatus)$('hands-metric').textContent=handStatus;
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
  worker.onerror=event=>{if(!smoke && workerGeneration!==cameraGeneration)return;if(twinProjection)twinError=`No se pudo iniciar el detector: ${event.message}`;notify(`No se pudo iniciar el detector: ${event.message}`); if(smoke) window.desktop.reportSmoke({ok:false,error:event.message}); stopCamera(); };
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
  const startupMirrorEnabled=config.mirror===true;
  // The fixed test poses use an explicit unmirrored camera coordinate frame.
  config.mirror=false;
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
  const ok=startupMirrorEnabled && emptyFrameResult.hands===0 && emptyFrameResult.qualityValid && data.quality?.valid && data.landmarks.length===1 && telemetryBlocked===true && zoomWorks
    && Object.values(pointerFeedback).every(Boolean) && Object.values(navigationFeedback).every(Boolean)
    && nativeSelection.contentOpened && nativeSelection.selectionWorks && nativeSelection.gestureClickAccepted
    && nativeSelection.buttonClickAccepted && nativeSelection.trustedClicks===nativeSelection.expectedNativeClicks && nativeSelection.sequenceCompleted
    && nativeSelection.firstBoundary && nativeSelection.lastBoundary && Object.values(nativeSelection.contentGestures).every(Boolean)
    && nativeSelection.pointHold.companionContinuity && nativeSelection.buttonHold.companionContinuity
    && nativeSelection.holds.every(h=>h.clickAccepted && h.elapsedMs>=1500 && h.clicks===1 && h.noEarlyClick && h.cursorLocked && h.postureIndependent && h.tremorTolerated && h.emptySpaceNoClick && h.targetAcquiredAtIndex)
    && Object.values(qualityFeedback).every(Boolean) && Object.values(previewFeedback).every(Boolean) && map.info().boundaryLoaded && nativeSelection.holdElapsedMs>=1500
    && Object.values(fistViewsFeedback).every(Boolean)
    && Object.values(indexTrackingFeedback).every(Boolean)
    && Object.values(selectionRecoveryFeedback).every(Boolean)
    && Object.values(selectionToleranceFeedback).every(Boolean)
    && nativeSelection.cursorLocked && nativeSelection.ringHalfVisible && nativeSelection.noEarlyClick && nativeSelection.oneClickWhileHeld;
  window.desktop.reportSmoke({version:appVersion,ok,startupMirrorEnabled,provider:map.provider,wasmLoaded:true,telemetryBlockedByWorkerCsp:telemetryBlocked,emptyFrame:emptyFrameResult,positiveFixture:{hands:data.landmarks.length,landmarks:data.landmarks[0]?.length,worldLandmarks:data.worldLandmarks?.[0]?.length,inferenceMs:data.inferenceMs,qualityValid:data.quality?.valid,qualityMs:data.qualityMs},zoomWorks,contentWorks:nativeSelection.contentOpened,selectionWorks:nativeSelection.selectionWorks,pointerFeedback,navigationFeedback,fistViewsFeedback,indexTrackingFeedback,selectionRecoveryFeedback,selectionToleranceFeedback,qualityFeedback,previewFeedback,nativeSelection,mapView:map.info()});
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
  contentViewer.close();map.resetSequence();map.home();map.pan(180,90);cancelGesture();
  const fixture=await (await fetch('/fixtures/selection-poses.json')).json();
  let trustedClicks=0;
  const observe=event=>{if(event.isTrusted)trustedClicks++;};$('map').addEventListener('click',observe,true);
  const holds=[];
  const hold=async(target,capture=false,companion=null)=>{
    if(!target)throw new Error('Smoke: falta objetivo visible de contenido');
    const result=await verifyHoldAt(target,fixture,()=>trustedClicks,capture,companion);holds.push(result);return result;
  };
  const control=id=>selectionTargets($('map').getBoundingClientRect()).find(target=>target.id===id);
  try {
    const beforeMap=map.info();
    const pointHold=await hold(map.targets().find(target=>target.id==='point-0'),true,'changing');
    await waitFor(()=>contentViewer.isOpen && $('map').querySelector('.content-image')?.naturalWidth>0,2000,'primer gráfico');
    const contentOpened=contentViewer.info().sourcePage===2 && contentViewer.info().slideCount===5;
    const firstBoundary=!!$('content-previous')?.disabled && !control('content-previous');
    cancelGesture();
    const buttonHold=await hold(control('content-next'),false,'always');
    await waitFor(()=>contentViewer.info().sourcePage===3,2000,'segundo gráfico');
    const pages=[2,3];
    for(let page=4;page<=6;page++) {
      cancelGesture();await hold(control('content-next'));
      await waitFor(()=>contentViewer.info().sourcePage===page,2000,'secuencia de gráficos');pages.push(page);
    }
    const lastBoundary=!!$('content-next')?.disabled && !control('content-next');
    const sequenceCompleted=pages.join(',')==='2,3,4,5,6';
    cancelGesture();await hold(control('content-previous'));
    const previousWorks=contentViewer.info().sourcePage===5;
    const contentGestures=await verifyContentGestures(fixture);
    cancelGesture();await hold(control('content-close'));
    const closeWorks=!contentViewer.isOpen && sameMapView(beforeMap,map.info());
    cancelGesture();await hold(map.targets().find(target=>target.id==='point-0'));
    const reopenWorks=contentViewer.isOpen && contentViewer.info().sourcePage===2;
    cancelGesture();await hold(control('content-close'));
    const shortcut=$('map-graphics-shortcut');
    shortcut.focus();shortcut.click();
    const shortcutOpened=contentViewer.isOpen && $('content-title')?.textContent===contentViewer.info().title
      && document.activeElement===$('content-close');
    contentViewer.close();
    const shortcutRestoresFocus=document.activeElement===shortcut;
    return {contentOpened,selectionWorks:contentOpened&&sequenceCompleted&&previousWorks&&closeWorks&&reopenWorks&&shortcutOpened&&shortcutRestoresFocus,
      firstBoundary,lastBoundary,previousWorks,closeWorks,reopenWorks,pages,sequenceCompleted,contentGestures,
      shortcutOpened,shortcutRestoresFocus,
      gestureClickAccepted:pointHold.clickAccepted,buttonClickAccepted:buttonHold.clickAccepted,
      trustedClicks,expectedNativeClicks:holds.length,holds,pointHold,buttonHold,
      holdElapsedMs:Math.min(...holds.map(result=>result.elapsedMs)),
      cursorLocked:holds.every(result=>result.cursorLocked),ringHalfVisible:holds.every(result=>result.ringHalfVisible),
      noEarlyClick:holds.every(result=>result.noEarlyClick),oneClickWhileHeld:holds.every(result=>result.clicks===1)};
  } finally {$('map').removeEventListener('click',observe,true);contentViewer.close();cancelGesture();map.resetSequence();map.home();}
}
async function verifyContentGestures(fixture) {
  const saved=engine, beforeMap=map.info();engine=new GestureEngine();
  const hands=(pose,positions)=>positions.map(([x,y],index)=>({id:`content-${index}`,landmarks:fixture.poses[pose].map(p=>({...p,
    x:p.x+x-fixture.poses[pose][8].x,y:p.y+y-fixture.poses[pose][8].y}))}));
  const tick=async(pose,positions,time)=>{const frame=hands(pose,positions),result=engine.update(frame,time,selectionContext(engine));await renderGesture(result,frame.length);return result;};
  try {
    contentViewer.home();
    for(const time of [0,90,180])await tick('ok',[[.38,.48],[.62,.48]],time);
    const initialScale=contentViewer.info().scale;
    for(const [time,separation] of [[220,.15],[260,.19],[300,.23]])await tick('ok',[[.5-separation,.48],[.5+separation,.48]],time);
    const zoomInWorks=contentViewer.info().scale>initialScale;
    const enlarged=contentViewer.info().scale;
    for(const [time,separation] of [[340,.20],[380,.17],[420,.14]])await tick('ok',[[.5-separation,.48],[.5+separation,.48]],time);
    const zoomOutWorks=contentViewer.info().scale<enlarged;
    contentViewer.zoom(2,.5*$('map').clientWidth,.5*$('map').clientHeight);
    engine=new GestureEngine();
    for(const time of [500,590,680])await tick('fist',[[.44,.45]],time);
    const beforePan=contentViewer.info().offset;
    for(const [time,x] of [[720,.46],[760,.49],[800,.52]])await tick('fist',[[x,.45]],time);
    const afterPan=contentViewer.info().offset;
    const panWorks=Math.hypot(afterPan.x-beforePan.x,afterPan.y-beforePan.y)>1;
    const mapUnchanged=sameMapView(beforeMap,map.info());
    const buttonsFixed=contentViewer.targets().every(target=>target.element.getBoundingClientRect().width>=44);
    contentViewer.home();return {zoomInWorks,zoomOutWorks,panWorks,mapUnchanged,buttonsFixed};
  } finally {engine=saved;cancelGesture();}
}
async function verifyHoldAt(target,fixture,trustedCount,captureProgress=false,companionMode=null) {
  const rect=$('map').getBoundingClientRect();
  const dx=target.x/rect.width-fixture.poses.index[8].x,dy=target.y/rect.height-fixture.poses.index[8].y;
  const hand=(pose,jx=0,jy=0)=>({id:'smoke-hand',landmarks:fixture.poses[pose].map(p=>({...p,x:p.x+dx+jx/rect.width,y:p.y+dy+jy/rect.height}))});
  const saved=engine,synthetic=new GestureEngine();engine=synthetic;selection.reset();
  const freeX=target.x/rect.width<.5?.8:.2;
  const companion=pose=>({id:'free-hand',landmarks:fixture.poses[pose].map(p=>({...p,x:p.x+freeX-fixture.poses[pose][8].x,y:p.y+.5-fixture.poses[pose][8].y}))});
  const currentCursor=result=>[$('cursor'),$('cursor-secondary')].find(cursor=>cursor.dataset.hand===String(result.selectionHandId))||$('cursor');
  let clicks=0,maxFrameGapMs=0,previousFrameTime=null;
  let companionFrames=0,companionFistFrames=0,selectionOnSecondary=false,companionExited=false,hadCompanion=false,lastProgress=0,continued=true,orderReversedDuringHold=false;
  const frame=async (selected,time,elapsed=0)=>{
    if(previousFrameTime!==null)maxFrameGapMs=Math.max(maxFrameGapMs,time-previousFrameTime);
    previousFrameTime=time;
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
      if(!clicks)continued &&= result.progress>=lastProgress && !result.events.some(event=>event.type==='pan'||event.type==='zoom');
      lastProgress=result.progress;
    }
    return {result,accepted,cursor:currentCursor(result)};
  };
  const beforeClicks=trustedCount();let emptySpaceNoClick=true;
  const targets=selectionTargets(rect);
  const emptyPoint=[.2,.4,.6,.8].flatMap(x=>[.15,.3,.45,.6].map(y=>({x:x*rect.width,y:y*rect.height})))
    .find(point=>!hoverTarget(point,targets) && Math.hypot(point.x-target.x,point.y-target.y)>100);
  if(!emptyPoint)throw new Error('Smoke: no hay espacio libre para comprobar el inicio del mantenimiento');
  for(let warmupFrame=0;warmupFrame<5;warmupFrame++){
    const {result}=await frame(hand('point',emptyPoint.x-target.x,emptyPoint.y-target.y),performance.now());
    emptySpaceNoClick &&= result.mode!=='click-pending' && result.events.every(e=>e.type!=='click') && trustedCount()===beforeClicks;
    await sleep(40);
  }
  const start=performance.now(),initial=await frame(hand('point'),start);
  if(initial.result.mode!=='click-pending' || initial.result.progress!==0)throw new Error('Smoke: índice sobre objetivo no inició mantenimiento completo');
  const targetAcquiredAtIndex=Math.abs(parseFloat(initial.cursor.style.left)-target.x)<.5 && Math.abs(parseFloat(initial.cursor.style.top)-target.y)<.5;
  let cursorLocked=true,ringHalfVisible=false,noEarlyClick=true,elapsedMs=0,clickAccepted=false,progressCaptured=false,tremorFrames=0,maxTremorPx=0,thumbOutFrames=0,extraFingerFrames=0,invalidWorldFrames=0;
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
    if(!clicks)continued &&= result.mode==='click-pending' || result.mode==='click-confirmed';
    tremorFrames++;maxTremorPx=Math.max(maxTremorPx,Math.hypot(jx,jy));
    if(!clicks)cursorLocked &&= Math.abs(parseFloat(cursor.style.left)-anchor.x)<.5 && Math.abs(parseFloat(cursor.style.top)-anchor.y)<.5;
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
  return {clickAccepted,elapsedMs,cursorLocked,ringHalfVisible,noEarlyClick,clicks,maxFrameGapMs,postureIndependent:continued && thumbOutFrames>0 && extraFingerFrames>0 && invalidWorldFrames>0 && clicks===1,thumbOutFrames,extraFingerFrames,invalidWorldFrames,emptySpaceNoClick,targetAcquiredAtIndex,tremorTolerated:continued&&maxTremorPx>40&&clicks===1,tremorFrames,maxTremorPx,companionMode,companionContinuity,companionFrames,companionFistFrames,selectionOnSecondary,companionExited,orderReversedDuringHold};
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
  populateCameraControls();$('settings').showModal();$('settings-advanced').open=true;
  const rows=Object.values(cameraRangeIds).map(id=>$(id+'-label'));
  const unavailableHidden=rows.every(row=>!row.getClientRects().length);
  rows[0].hidden=false;
  const availableVisible=!!rows[0].getClientRects().length;
  populateCameraControls();$('settings-advanced').open=false;$('settings').close();
  return {normalAllows:initial.allowActions,darkCancels:!rejected.allowActions&&rejected.cancelInteraction,heldBlocks:held.state==='blocked',recoveryWaits:!recovery.allowActions,recovered:recovered.allowActions,noBlockedInput,warningAfterGap,conditionalCameraControls:unavailableHidden&&availableVisible};
}
async function startCamera({ startPaused = false } = {}) {
  if(active || cameraStarting || (twinProjection && !twinLeaseActive)) return;
  const generation=++cameraGeneration;
  cameraStarting=true;updateStatus();
  try {
    // Device IDs are salted per web origin, which changes with Unity's random
    // loopback port. A saved device label resolves the current ID each launch.
    let cameraId=config.cameraId;
    if(twinProjection) {
      const devices=await navigator.mediaDevices.enumerateDevices();
      cameraId=config.cameraLabel?devices.find(device=>device.kind==='videoinput' && device.label===config.cameraLabel)?.deviceId:'';
    }
    const constraints=id=>({video:{deviceId:id?{exact:id}:undefined,width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}},audio:false});
    let acquired=await navigator.mediaDevices.getUserMedia(constraints(cameraId));
    if(twinProjection && config.cameraLabel && generation===cameraGeneration) {
      const devices=await navigator.mediaDevices.enumerateDevices();
      const wanted=devices.find(device=>device.kind==='videoinput' && device.label===config.cameraLabel);
      if(wanted && wanted.deviceId!==acquired.getVideoTracks()[0].getSettings().deviceId) {
        acquired.getTracks().forEach(track=>track.stop());
        acquired=await navigator.mediaDevices.getUserMedia(constraints(wanted.deviceId));
      }
    }
    if(generation!==cameraGeneration){acquired.getTracks().forEach(track=>track.stop());return;}
    stream=acquired;
    $('video').srcObject=stream;await $('video').play();
    if(generation!==cameraGeneration){acquired.getTracks().forEach(track=>track.stop());return;}
    const controls=cameraControlReport=await applyCameraControls(stream.getVideoTracks()[0],config.cameraControls,{continuous:config.cameraAuto});
    if(generation!==cameraGeneration){acquired.getTracks().forEach(track=>track.stop());return;}
    if(['failed','invalid','mismatch'].includes(controls.status))notify('La cámara no confirmó los ajustes solicitados. Revisa el diagnóstico.','camera');
    const aspect=$('video').videoWidth/$('video').videoHeight;
    $('video').parentElement.style.aspectRatio=String(aspect);
    engine=new GestureEngine({aspectRatio:aspect});
    qualityGate=new FrameQualityGate();qualityState={allowActions:true,state:'good',reasons:[]};qualityWarningShown=false;
    active=true;paused=startPaused;lastFrame=-1;hasFreshCameraResult=false;lastFreshResult=performance.now();resultTimes.length=0;initializeWorker();
    cameraStarting=false;
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(generation!==cameraGeneration)return;if(twinProjection)twinError='La cámara se desconectó.';stopCamera();notify('La cámara se desconectó. Vuelve a conectarla y pulsa Activar gestos.');});
    updateStatus(); enumerateCameras(); frameLoop(generation);
  } catch(error) {
    if(generation!==cameraGeneration)return;
    const message=cameraErrorMessage(error);
    if(twinProjection)twinError=message;
    stopCamera();notify(message);
  }
  finally { if(generation===cameraGeneration){cameraStarting=false;updateStatus();} }
}
function cameraErrorMessage(error) {
  switch(error.name){
    case 'NotAllowedError':
      return 'Autoriza el acceso a la cámara en los ajustes de privacidad del equipo y vuelve a pulsar Activar gestos.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No se encontró la cámara seleccionada. Elige otra en Ajustes y vuelve a pulsar Activar gestos.';
    case 'NotReadableError':
      return 'No se pudo iniciar la cámara. Cierra otras apps que la estén usando o elige otra cámara en Ajustes.';
    default:
      return 'No se pudo iniciar la cámara. Revisa la conexión o elige otra cámara en Ajustes.';
  }
}
function stopCamera() {
  cameraGeneration++;
  cameraStarting=false;active=false;hasFreshCameraResult=false;stream?.getTracks().forEach(track=>track.stop());stream=null;
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
  $('hands-metric').textContent=active&&!twinProjection?'Muestra una mano a la cámara':'0 manos';$('fps-metric').textContent='— FPS';
}
function drawSkeleton(hands,width=$('video').videoWidth||640,height=$('video').videoHeight||480) {
  const canvas=$('skeleton');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');ctx.lineWidth=2;ctx.strokeStyle='#58a6ff';ctx.fillStyle='#a5d6ff';
  for(const hand of hands) {
    if(!Array.isArray(hand) || hand.length!==21 || hand.some(p=>!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)))continue;
    for(const [a,b] of linePairs) {ctx.beginPath();ctx.moveTo(hand[a].x*canvas.width,hand[a].y*canvas.height);ctx.lineTo(hand[b].x*canvas.width,hand[b].y*canvas.height);ctx.stroke();}
    for(const p of hand) {ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,3,0,Math.PI*2);ctx.fill();}
  }
  if(twinProjection)sendTwinPreview(hands.length);
}
function sendTwinPreview(hands) {
  const now=performance.now(),video=$('video');
  if(!twinLeaseActive || !active || video.readyState<2 || now-lastTwinPreview<100)return;
  lastTwinPreview=now;
  const scale=Math.min(320/video.videoWidth,240/video.videoHeight);
  const width=Math.max(1,Math.round(video.videoWidth*scale)),height=Math.max(1,Math.round(video.videoHeight*scale));
  if(!twinPreviewCanvas) {twinPreviewCanvas=document.createElement('canvas');twinPreviewContext=twinPreviewCanvas.getContext('2d');}
  if(twinPreviewCanvas.width!==width || twinPreviewCanvas.height!==height){twinPreviewCanvas.width=width;twinPreviewCanvas.height=height;}
  twinPreviewContext.clearRect(0,0,width,height);
  twinPreviewContext.save();
  if(config.mirror){twinPreviewContext.translate(width,0);twinPreviewContext.scale(-1,1);}
  twinPreviewContext.drawImage(video,0,0,width,height);
  twinPreviewContext.drawImage($('skeleton'),0,0,width,height);
  twinPreviewContext.restore();
  window.desktop.reportTwinPreview({jpeg:twinPreviewCanvas.toDataURL('image/jpeg',.72),width,height,hands});
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
  if(analysisView?.isOpen){
    const pointer=pointers.find(item=>item.id===selectionHandId)||pointers[0];
    const point=pointer && mapPoint(pointer);
    analysisView.setHoverPoint(!blocked && !navigation && !result.navigationCandidateKind && within(point)
      ? {x:point.x*rect.width,y:point.y*rect.height,source:'hand'} : null);
  }
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
      if(within(current) && within(old)){currentSurface().pan((current.x-old.x)*rect.width,(current.y-old.y)*rect.height);counters.panEvents++;}
    } else if(event.type==='zoom' && navigation==='zoom' && detectedHands===2 && result.navigationHandIds?.length===2
      && result.navigationHandIds.every(id=>pointers.some(pointer=>pointer.id===id))) {
      const at=mapPoint(event);if(!within(at))continue;
      currentSurface().zoom(event.delta,at.x*rect.width,at.y*rect.height);counters.zoomEvents++;
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
  // Only the visible layer is actionable. Hidden map pins cannot steal a
  // selection or open a popup while the person is reading a graph.
  const targets=currentSurface().targets();
  $('workspace').querySelectorAll('.map-tools button,.demo-popup button,.leaflet-popup-close-button,#experience-mode-switcher button,.map-intro button,.council-timer-notice button').forEach(element=>{
    if(element.hidden || element.disabled || element.getAttribute('aria-disabled')==='true' || !element.getClientRects().length)return;
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
  const panColor=[$('cursor'),$('cursor-secondary')].every(c=>c.dataset.navigation==='pan' && getComputedStyle(c).getPropertyValue('--cursor-color').trim()===(twinProjection?'137,87,229':'110,38,99'));
  renderGesture({...dual,mode:'navigate',navigationKind:'zoom'},2);
  const zoomColor=[$('cursor'),$('cursor-secondary')].every(c=>c.dataset.navigation==='zoom' && getComputedStyle(c).getPropertyValue('--cursor-color').trim()===(twinProjection?'212,143,0':'0,106,133'));
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
  const singlePanColor=$('cursor').style.display==='block' && $('cursor-secondary').style.display==='none' && $('cursor').dataset.navigation==='pan' && getComputedStyle($('cursor')).getPropertyValue('--cursor-color').trim()===(twinProjection?'137,87,229':'110,38,99');
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
  const freeHandStaysBlue=!!fistPointer && mixedColors.find(c=>c.id===String(fistPointer.id))?.color===(twinProjection?'137,87,229':'110,38,99') && mixedColors.find(c=>c.id!==String(fistPointer.id))?.color===(twinProjection?'33,139,255':'0,173,178');
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
  const previewHiddenStopped=!visible();
  active=true;updateStatus();const previewVisibleActive=visible() && $('camera-preview-state').hidden;
  paused=true;updateStatus();const previewVisiblePaused=visible();
  const panel=$('diagnostics').getBoundingClientRect(),workspace=$('workspace').getBoundingClientRect();
  const compactPlacement=panel.width<=200 && (twinProjection ? panel.left-workspace.left===12 && panel.top-workspace.top===12 : Math.abs(panel.left-workspace.left-18)<1 && Math.abs(workspace.bottom-panel.bottom-(innerHeight<780?14:18))<1);
  drawSkeleton(data.landmarks,smokeFixtureDimensions.width,smokeFixtureDimensions.height);
  const canvas=$('skeleton'),ctx=canvas.getContext('2d');
  const hasTracking=()=>ctx.getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3 && value>0);
  const trackingDrawn=hasTracking();clearTrackingPreview();const staleTrackingCleared=!hasTracking();
  const noPreviewToggle=!$('show-preview') && !$('preview-close');
  active=saved.active;paused=saved.paused;updateStatus();
  return {previewHiddenStopped,previewVisibleActive,previewVisiblePaused,compactPlacement,trackingDrawn,staleTrackingCleared,noPreviewToggle};
}
async function enumerateCameras() {
  const select=$('camera-select'),note=$('camera-device-note');
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    const cameras=devices.filter(device=>device.kind==='videoinput');
    if(twinProjection)window.desktop.reportTwinCameras(cameras.map(({deviceId,label})=>({deviceId,label})));
    const selected=$('settings').open?select.value:config.cameraId;
    const available=cameras.filter(camera=>camera.deviceId);
    select.replaceChildren(new Option('Cámara predeterminada',''));
    available.forEach(({label,deviceId},index)=>select.add(new Option(label||`Cámara ${index+1}`,deviceId)));
    const unavailable=selected&&!available.some(camera=>camera.deviceId===selected);
    if(unavailable)select.add(new Option('Cámara guardada · no disponible',selected));
    select.value=selected;
    note.textContent=unavailable?'Elige otra cámara para usar gestos.':cameras.length?'':'Conecta una cámara o revisa el permiso de cámara del equipo.';
  }catch{
    note.textContent='No se pudo leer la lista de cámaras. Revisa el permiso de cámara del equipo.';
  }
}
function openSettings() {
  cancelGesture();
  const settings=$('settings');
  settings.returnValue='';
  $('settings-framing').open=false;$('settings-advanced').open=false;
  settings.querySelector('.tracking-details').open=false;
  const select=$('camera-select');
  if(config.cameraId&&![...select.options].some(option=>option.value===config.cameraId))select.add(new Option('Cámara guardada',config.cameraId));
  select.value=config.cameraId;
  $('mirror').checked=config.mirror;$('rotation').value=config.rotation;$('provider').value=config.provider;$('google-key').value=config.googleKey;$('confidence').value=config.confidence;
  updateProviderOptions();
  $('camera-auto').checked=config.cameraAuto;populateCameraControls();settings.showModal();enumerateCameras();
}
function updateProviderOptions(){ $('google-options').hidden=$('provider').value!=='google'; }
function setGesturePause(next) {
  if(!active||paused===next)return;
  paused=next;cancelGesture();updateStatus();
}
$('camera-toggle').onclick=()=>active?stopCamera():startCamera();
$('pause-gestures').onclick=()=>setGesturePause(!paused);
$('settings-open').onclick=openSettings;
$('provider').onchange=updateProviderOptions;
$('help-open').onclick=()=>{cancelGesture();$('help').querySelectorAll('details').forEach(detail=>{detail.open=false;});$('help').showModal();};$('help-close').onclick=()=>$('help').close();
$('settings').addEventListener('close',async()=>{
  if($('settings').returnValue!=='save')return;
  const wasActive=active,wasPaused=paused;stopCamera();
  const oldKey=config.googleKey,oldProvider=config.provider,oldCamera=config.cameraId;
  Object.assign(config,{cameraId:$('camera-select').value,mirror:$('mirror').checked,rotation:+$('rotation').value,provider:$('provider').value,googleKey:$('google-key').value.trim(),confidence:+$('confidence').value,cameraAuto:$('camera-auto').checked,cameraControls:readCameraControls()});
  if(oldCamera!==config.cameraId)config.cameraControls={};
  save();
  // Reload clears Google SDK and credentials when switching/changing key.
  if(oldKey!==config.googleKey || oldProvider!==config.provider) { location.reload();return; }
  if(wasActive)startCamera({startPaused:wasPaused});
  else notify('Ajustes guardados.');
});
$('zoom-in').onclick=()=>currentSurface().zoom(.5,$('map').clientWidth/2,$('map').clientHeight/2);
$('zoom-out').onclick=()=>currentSurface().zoom(-.5,$('map').clientWidth/2,$('map').clientHeight/2);
$('home').onclick=()=>currentSurface().home();
$('mode-map').onclick=event=>{
  if(analysisView || analysisLoading)leaveAnalysis();
  else if(trafficExperience || experienceLoading)leaveExperience();
  else return;
  if(event.detail===0)councilAgenda.focus();
};
$('mode-experiences').onclick=()=>enterExperience();
$('mode-analysis').onclick=event=>enterAnalysis({focusFilters:event.detail===0});
$('map-graphics-shortcut').onclick=()=>{
  const marker=$('map').querySelector('.sequence-marker[data-marker-id="point-0"]');
  if(marker)marker.click();
  else openPointContent({id:'point-0'});
};
$('reset-sequence').onclick=()=>{contentViewer?.close();cancelGesture();map.resetSequence();notify('Recorrido reiniciado en el punto 1.');};
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
  const report={version:appVersion,startedAt,exportedAt:new Date().toISOString(),...counters,selectionDiagnostics:{lastActiveState:lastActiveSelectionState,reasonCounts:selectionReasonCounts},configuration:{confidence:config.confidence,cameraResolution:[$('video').videoWidth,$('video').videoHeight],mapping:'full-frame',rotation:config.rotation,mirror:config.mirror,cameraControls:config.cameraControls,qualityProtection:true},qualityMs:{p50:percentile(qualityTimes,.5),p95:percentile(qualityTimes,.95)},inferenceMs:{p50:percentile(inferenceTimes,.5),p95:percentile(inferenceTimes,.95)},captureToResultMs:{p50:percentile(timings,.5),p95:percentile(timings,.95)},notes:'Captura a resultado excluye buffer de cámara y presentación de pantalla; no es latencia extremo a extremo. Falsos positivos requieren etiquetado humano. Máximo 10000 muestras recientes.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`sesion-gestual-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented)return;
  if(event.key==='Escape')cancelGesture();
  if(event.target.closest?.('button,[role="button"],a[href],summary,input,select,textarea,[contenteditable="true"]'))return;
  if(event.code==='Space' && !$('settings').open && !$('help').open) {
    event.preventDefault();
    if(trafficExperience?.isOpen)trafficExperience.setPaused(!trafficExperience.info().paused);
    else setGesturePause(!paused);
  }
});
window.addEventListener('blur',()=>{if(!twinProjection)setGesturePause(true);});
document.addEventListener('visibilitychange',()=>{if(!twinProjection && document.hidden)setGesturePause(true);});
await loadMap();
updateStatus();
if(twinProjection) {
  window.desktop.onTwinPreferences(preferences=>{
    stopCamera();Object.assign(config,preferences);twinError='';
    if(twinLeaseActive)startCamera();
  });
  window.desktop.onTwinControl(state=>{
    const enabled=state.active===true && state.chair==='Chair_10';
    if(enabled===twinLeaseActive)return;
    twinLeaseActive=enabled;
    twinError='';
    if(enabled) { paused=false;cancelGesture();startCamera(); }
    else { stopCamera(); }
  });
  setInterval(reportTwinState,500);
  window.addEventListener('pagehide',stopCamera);
}
if(smoke)initializeWorker();
if(trafficCheck)verifyTrafficExperience().catch(error=>window.desktop.reportSmoke({version:appVersion,ok:false,error:error.stack || error.message}));
if(analysisCheck)verifyAnalysis().catch(error=>window.desktop.reportSmoke({version:appVersion,ok:false,error:error.stack || error.message}));

async function verifyAnalysis() {
  const checks={},snapshots={},holds=[],fixture=await(await fetch('/fixtures/selection-poses.json')).json();
  const [{parseSecurityCSV},{parseCameraCSV}]=await Promise.all([import('./analysis-data.js'),import('./camera-analysis-data.js')]);
  const [securityCSV,cameraCSV]=await Promise.all([fetch('/analysis/seguridad-simulada.csv').then(r=>r.text()),fetch('/analysis/camaras-seguridad.csv').then(r=>r.text())]);
  const sourceIncidents=parseSecurityCSV(securityCSV),sourceCameras=parseCameraCSV(cameraCSV);
  const expectedCameraAt=date=>sourceCameras.filter(record=>record.fecha_instalacion<=date).length;
  const expectedCameras2024=expectedCameraAt('2024-12-31'),expectedCamerasJuly2024=expectedCameraAt('2024-07-31');
  const expectedDomo=sourceCameras.filter(record=>record.tipo_camara==='Domo').length;
  const expectedFija=sourceCameras.filter(record=>record.tipo_camara==='Fija').length;
  const expectedIntimidacion=sourceIncidents.filter(record=>record.tipo_incidente==='Robo con intimidación').length;
  const expectedSorpresa=sourceIncidents.filter(record=>record.tipo_incidente==='Robo por sorpresa').length;
  const originalMapNode=$('map').querySelector('.leaflet-map-pane');
  let trustedClicks=0;
  const observe=event=>{if(event.isTrusted)trustedClicks++;};
  $('workspace').addEventListener('click',observe,true);
  const capture=async name=>{cancelGesture();await sleep(300);window.desktop.reportSmoke({phase:`analysis-${name}`});await sleep(100);};
  const hold=async id=>{
    const control=$(id);
    if(control?.closest('.analysis-body')&&control.getClientRects().length)control.scrollIntoView({block:'nearest'});
    const target=selectionTargets($('map').getBoundingClientRect()).find(item=>item.element.id===id);
    if(!target)throw new Error(`Análisis: control no visible ${id}`);
    if(!document.hasFocus())await window.desktop.click({x:-1,y:-1});
    await waitFor(()=>document.hasFocus(),12000,'ventana del mapa en primer plano');
    const result=await verifyHoldAt(target,fixture,()=>trustedClicks);holds.push({id,...result});
    if(!result.clickAccepted || result.clicks!==1 || !result.noEarlyClick || result.elapsedMs<1500)throw new Error(`Selección de Análisis no completada: ${id} ${JSON.stringify(result)}`);
  };
  const waitLayer=()=>waitFor(()=>map.info().analysisLayerLoaded,5000,'raster de calor visible');
  try {
    config.mirror=false;
    await hold('mode-analysis');
    await waitFor(()=>analysisView?.info().ready,18000,'CSV y análisis listos');await analysisView.ready;await waitLayer();
    const initial=analysisView.info();snapshots.general=initial;
    checks.datasetComplete=initial.datasetCount===60000 && initial.filteredCount===60000;
    checks.originalMap=originalMapNode===$('map').querySelector('.leaflet-map-pane') && map.provider==='OpenStreetMap';
    checks.headerSimplified=!$('provider-label') && !document.querySelector('.topbar').textContent.includes('OpenStreetMap');
    const attribution=$('map').querySelector('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]');
    checks.creditsRemain=!!attribution?.getClientRects().length;
    checks.experiencesHidden=$('mode-experiences').hidden && !$('mode-experiences').getClientRects().length
      && !selectionTargets($('map').getBoundingClientRect()).some(target=>target.element.id==='mode-experiences');
    checks.mapNavigation=$('mode-map').textContent==='Mapa' && $('mode-analysis').getAttribute('aria-pressed')==='true';
    checks.playbackDuration=initial.playback.durationMs===8000;
    checks.boundary=map.info().boundaryLoaded && map.info().analysisMode && map.info().analysisLayerVisible;
    checks.pinsInactive=map.targets().length===0 && !contentViewer.isOpen;
    checks.interfaceClear=[...document.querySelectorAll('.analysis-security-panel,.analysis-camera-panel')]
      .every(panel=>!/simulad|fictici|publicad|demostraci/i.test(panel.textContent));
    checks.robberyControlsSimplified=!document.querySelector('.analysis-filter-resolution,#analysis-export,#analysis-exit')
      && !/resuelt|exportar csv|ver mapa/i.test(document.querySelector('.analysis-experience').textContent);
    checks.progressiveDateControls=initial.temporalMode==='all' && !analysisView.targets().some(target=>/^analysis-year-20|analysis-month-\d/.test(target.id));
    const heat=$('map').querySelector('img[alt="Concentración de incidentes de seguridad"]');
    await heat.decode();
    const canvas=document.createElement('canvas');canvas.width=heat.naturalWidth;canvas.height=heat.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(heat,0,0);
    const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let colored=0,green=0,red=0;const colors=new Set();
    for(let i=0;i<rgba.length;i+=4)if(rgba[i+3]>240){colored++;green+=rgba[i+1]>rgba[i]*1.2;red+=rgba[i]>rgba[i+1]*1.15;colors.add(`${rgba[i]},${rgba[i+1]},${rgba[i+2]}`);}
    checks.clippedToCommune=colored/(canvas.width*canvas.height)>.4 && colored/(canvas.width*canvas.height)<.9 && rgba[3]===0;
    checks.fullColorRamp=green>0 && red>0 && colors.size>200;
    await capture('general');
    analysisView.setFilters({year:'2024',month:'07',robbery:['sorpresa']});await waitLayer();
    await hold('analysis-playback');await waitLayer();
    const playing=analysisView.info();
    checks.playbackStarts=playing.playback.playing && playing.playback.position>0
      && $('analysis-playback').getAttribute('aria-pressed')==='true';
    await sleep(650);
    const fading=[...$('map').querySelectorAll('img[alt="Concentración de incidentes de seguridad"]')].map(image=>Number(getComputedStyle(image).opacity));
    checks.playbackGradualTransition=map.info().analysisTransitioning && fading.length===2
      && fading.every(opacity=>opacity>0&&opacity<.62) && Math.abs(fading[0]+fading[1]-fading[0]*fading[1]-.62)<.005;
    checks.playbackProgress=analysisView.info().playback.position>playing.playback.position
      && Number($('analysis-timeline').value)>0;
    await capture('timelapse');
    await hold('analysis-playback');
    const pausedPosition=analysisView.info().playback.position;await sleep(350);
    checks.playbackPauses=!analysisView.info().playback.playing && analysisView.info().playback.position===pausedPosition
      && $('analysis-playback').getAttribute('aria-pressed')==='false';
    await hold('analysis-time-18');await waitLayer();
    checks.playbackGestureSeek=analysisView.info().playback.position===.75 && analysisView.info().filters.period==='noche';
    const timeline=$('analysis-timeline').getBoundingClientRect();
    await window.desktop.click({x:timeline.left+timeline.width*.375,y:timeline.top+timeline.height/2});await waitLayer();
    const nativeSeek=analysisView.info().playback;
    checks.playbackNativeSeek=!nativeSeek.playing && nativeSeek.position>.25 && nativeSeek.position<.5
      && Math.abs(Number($('analysis-timeline').value)/1000-nativeSeek.position)<.002;
    analysisView.seekPlayback(.375);await waitLayer();
    const morning=analysisView.info();snapshots.timelapse=morning;
    const expectedMorning=sourceIncidents.filter(record=>record.year==='2024'&&record.month==='07'&&record.robberyType==='sorpresa'&&record.hour>=6&&record.hour<12).length;
    checks.playbackFilters=morning.filteredCount===expectedMorning && morning.filters.year==='2024'
      && morning.filters.month==='07' && morning.filters.robbery[0]==='sorpresa';
    checks.playbackExactSeek=morning.playback.mix===.5 && $('analysis-timeline').value==='375';
    analysisView.setFilters({robbery:['intimidacion']});await waitLayer();
    const filteredTimeline=analysisView.info();
    checks.playbackFilterKeepsPosition=filteredTimeline.playback.position===.375 && $('analysis-timeline').value==='375'
      && filteredTimeline.filters.robbery[0]==='intimidacion' && filteredTimeline.playback.mix===.5
      && map.info().analysisTransitioning && !filteredTimeline.playback.playing;
    analysisView.seekPlayback(.125);await waitLayer();
    checks.playbackBackwards=analysisView.info().playback.position===.125 && analysisView.info().filters.period==='madrugada';
    await capture('lineatiempo');
    analysisView.togglePlayback();analysisView.setFilters({period:'tarde'});await waitLayer();
    checks.playbackManualOverride=!analysisView.info().playback.playing && analysisView.info().filters.period==='tarde'
      && analysisView.info().playback.position===.5;
    await hold('analysis-reset');await waitLayer();
    await hold('analysis-robbery-picker');
    checks.robberyPicker=analysisView.info().picker==='robbery';
    await hold('analysis-robbery-intimidacion');await waitLayer();
    checks.robberySingleType=analysisView.info().filteredCount===expectedIntimidacion
      && analysisView.info().picker==='robbery';
    await hold('analysis-robbery-sorpresa');await waitLayer();
    const robberyUnion=analysisView.info();
    checks.robberyTypesUnion=robberyUnion.filteredCount===expectedIntimidacion+expectedSorpresa
      && Array.isArray(robberyUnion.filters.robbery) && robberyUnion.filters.robbery.length===2
      && robberyUnion.filters.robbery.includes('intimidacion') && robberyUnion.filters.robbery.includes('sorpresa');
    await hold('analysis-robbery-intimidacion');await waitLayer();
    checks.robberyTypeDeselect=analysisView.info().filteredCount===expectedSorpresa
      && analysisView.info().filters.robbery.length===1 && analysisView.info().filters.robbery[0]==='sorpresa';
    await capture('tiposrobo');
    await hold('analysis-robbery-all');await waitLayer();
    checks.robberyAllRestored=analysisView.info().filteredCount===60000 && analysisView.info().filters.robbery==='all';
    await hold('analysis-date-close');
    await hold('analysis-mode-year');
    checks.directYears=analysisView.info().picker===null && ['2023','2024','2025'].every(year=>
      analysisView.targets().some(target=>target.id==='analysis-year-'+year));
    await hold('analysis-year-2024');await waitLayer();
    checks.yearFilter=analysisView.info().filteredCount===20066;
    await hold('analysis-mode-month');
    checks.monthPicker=analysisView.info().picker==='month';
    await hold('analysis-month-07');await waitLayer();
    const monthly=analysisView.info();snapshots.mensual=monthly;
    checks.monthFilter=monthly.filteredCount===1697 && monthly.dateRange.start==='2024-07-01' && monthly.dateRange.end==='2024-07-31';
    await capture('mes');
    await hold('analysis-period-picker');
    const hourOptions=[...document.querySelectorAll('.analysis-date-grid[data-grid="period"] button')];
    checks.timeLabelsFit=analysisView.info().picker==='period' && hourOptions.length===5 && hourOptions.every(button=>{
      const label=[...button.childNodes].find(child=>child.nodeType===Node.TEXT_NODE && child.textContent.trim());
      if(!label || button.scrollWidth>button.clientWidth)return false;
      const range=document.createRange(),box=button.getBoundingClientRect(),hours=button.querySelector('small');
      return [label,...(hours?[hours]:[])].every(node=>{
        range.selectNodeContents(node);
        const text=range.getBoundingClientRect();
        return text.width>0 && text.left>=box.left+5 && text.right<=box.right-5;
      });
    });
    await hold('analysis-period-noche');await waitLayer();
    const filtered=analysisView.info();snapshots.filtrado=filtered;
    checks.timeFilter=filtered.filteredCount>0 && filtered.filteredCount<monthly.filteredCount && filtered.picker===null;
    checks.rasterChanges=heat!==$('map').querySelector('img[alt="Concentración de incidentes de seguridad"]');
    await capture('filtrado');
    const local={lat:-33.448,lng:-70.548},screen=map.locationToScreen(local),roundtrip=map.screenToLocation(screen.x,screen.y);
    snapshots.proyeccion={local,screen,roundtrip};
    checks.mapProjection=Math.abs(roundtrip.lat-local.lat)<.00003 && Math.abs(roundtrip.lng-local.lng)<.00003
      && map.screenToLocation(NaN,10)===null && map.locationToScreen({lat:Infinity,lng:0})===null;
    const viewport=$('map').getBoundingClientRect();
    const moveOver=(x,y)=>{
      const bounds=$('map').getBoundingClientRect(),clientX=bounds.left+x,clientY=bounds.top+y;
      document.elementFromPoint(clientX,clientY)?.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX,clientY}));
    };
    moveOver(screen.x,screen.y);await sleep(210);
    checks.hoverPreview=analysisView.info().hover?.source==='mouse' && !analysisView.info().hover?.pinned;
    const inspector=document.querySelector('.analysis-inspector');
    const box=inspector.getBoundingClientRect();
    moveOver(box.left-viewport.left+12,box.top-viewport.top+14);await sleep(210);
    checks.hoverReadable=inspector.dataset.state==='preview' && analysisView.info().hover?.source==='mouse'
      && !!inspector.closest('.analysis-panel') && !document.querySelector('.analysis-map-tooltip');
    const shown=analysisView.info().hover;
    await window.desktop.click({x:viewport.left+screen.x,y:viewport.top+screen.y});await sleep(240);
    const chosen=analysisView.info();
    checks.mouseSelectsQuadrant=shown?.quadrantIds.length===1 && chosen.quadrantIds[0]===shown.quadrantIds[0]
      && chosen.filteredCount===shown.total && chosen.surface.coverage==='cuadrantes seleccionados';
    moveOver(160,200);
    checks.quadrantPersists=analysisView.info().quadrantIds[0]===shown?.quadrantIds[0];
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    checks.escapeDismissesDetail=inspector.dataset.state==='idle' && analysisView.info().hover===null;
    analysisView.setQuadrants(null);
    const handPointer={id:'analysis-hand',x:screen.x/viewport.width,y:screen.y/viewport.height};
    await renderGesture({mode:'point',cursor:handPointer,pointers:[handPointer],selectionHandId:null,events:[],progress:0},1);
    await sleep(500);
    const detail=analysisView.info().hover;snapshots.detalle=detail;
    checks.handDetails=detail?.source==='hand' && detail.quadrantIds.length===1 && Number.isInteger(detail.total)
      && detail.security?.period.includes('Noche');
    checks.weekUsesSelectedPeriod=detail?.referenceDate==='2024-07-31' && detail.last7DaysRange.start==='2024-07-25' && detail.last7Days<=detail.total;
    window.desktop.reportSmoke({phase:'analysis-detalle'});await sleep(150);
    const before=map.info();analysisView.pan(90,35);
    checks.panWorks=!sameMapView(before,map.info());checks.detailsClearOnPan=analysisView.info().hover===null;
    const zoom=map.info().zoom;analysisView.zoom(.35,600,300);
    checks.zoomWorks=map.info().zoom>zoom && map.info().analysisLayerVisible;
    await hold('analysis-reset');await waitLayer();
    checks.resetFilters=analysisView.info().filteredCount===60000 && analysisView.info().temporalMode==='all' && analysisView.info().filters.month==='all';
    analysisView.home();
    const targets=analysisView.targets(),rect=$('map').getBoundingClientRect();
    const basicControls=['analysis-category-security','analysis-mode-year','analysis-mode-month','analysis-robbery-picker','analysis-period-picker','analysis-playback','analysis-cross'];
    const missingControls=basicControls.filter(id=>!targets.some(target=>target.id===id));
    const obstructedControls=targets.filter(target=>target.width<30 || target.height<32 || !target.element.contains(document.elementFromPoint(rect.left+target.x,rect.top+target.y))).map(target=>target.id);
    snapshots.controles={missingControls,obstructedControls};
    checks.controlsReachable=!missingControls.length && !obstructedControls.length;
    const waitCameras=()=>waitFor(()=>map.info().cameraAnalysisLoaded&&map.info().cameraAnalysisVisible,5000,'capa de cámaras visible');
    checks.directCategories=['security','cameras','fixed','alarms']
      .every(layer=>analysisView.targets().some(target=>target.id===`analysis-category-${layer}`));
    await capture('catalogo');
    await hold('analysis-category-cameras');await waitCameras();
    const cameras=analysisView.info();snapshots.camaras=cameras;
    checks.playbackOnlySecurity=!analysisView.targets().some(target=>target.id==='analysis-playback')
      && !document.querySelector('.analysis-camera-panel .analysis-playback') && !cameras.playback.playing;
    checks.cameraDatasetComplete=cameras.activeCategory==='cameras' && !cameras.crossed && cameras.datasetCount===320 && cameras.filteredCount===320
      && cameras.summary.published===11 && cameras.summary.simulated===309;
    checks.cameraPointsSeparate=map.info().cameraAnalysisMode==='points' && map.info().cameraAnalysisPointCount===320 && !map.info().analysisLayerVisible;
    await capture('camaras');
    await hold('camera-analysis-type-picker');
    checks.cameraTypePicker=analysisView.info().picker==='type';
    await hold('camera-analysis-type-1');await waitCameras();
    checks.cameraTypeSingle=analysisView.info().filteredCount===expectedDomo && analysisView.info().picker==='type';
    await hold('camera-analysis-type-2');await waitCameras();
    const combinedTypes=analysisView.info();
    checks.cameraTypesUnion=combinedTypes.filteredCount===expectedDomo+expectedFija
      && Array.isArray(combinedTypes.filters.type) && combinedTypes.filters.type.length===2
      && combinedTypes.filters.type.includes('Domo') && combinedTypes.filters.type.includes('Fija');
    await hold('camera-analysis-type-1');await waitCameras();
    checks.cameraTypeDeselect=analysisView.info().filteredCount===expectedFija
      && analysisView.info().filters.type.length===1 && analysisView.info().filters.type[0]==='Fija';
    await hold('camera-analysis-type-1');await waitCameras();
    checks.cameraTypeReselect=analysisView.info().filteredCount===expectedDomo+expectedFija;
    await capture('tiposcamara');
    await hold('camera-analysis-type-3');await waitCameras();
    checks.cameraAllTypesCollapse=analysisView.info().filteredCount===320 && analysisView.info().filters.type==='all';
    await hold('camera-analysis-date-close');
    await hold('camera-analysis-state-picker');await hold('camera-analysis-state-1');await waitCameras();
    checks.cameraStateFilter=analysisView.info().filteredCount===240 && analysisView.info().summary.operational===240;
    await hold('camera-analysis-state-picker');await hold('camera-analysis-state-0');await waitCameras();
    checks.cameraAllStates=analysisView.info().filteredCount===320 && analysisView.info().filters.state==='all';
    await hold('camera-analysis-display-heatmap');await waitCameras();
    const cameraHeat=$('map').querySelector('img[alt="Concentración de ubicaciones de cámaras de seguridad"]');
    if(cameraHeat)await cameraHeat.decode();
    checks.cameraHeatmap=!!cameraHeat && map.info().cameraAnalysisMode==='heatmap' && !map.info().analysisLayerVisible;
    if(cameraHeat){
      const imageCanvas=document.createElement('canvas');imageCanvas.width=cameraHeat.naturalWidth;imageCanvas.height=cameraHeat.naturalHeight;
      const imageContext=imageCanvas.getContext('2d',{willReadFrequently:true});imageContext.drawImage(cameraHeat,0,0);
      const imageData=imageContext.getImageData(0,0,imageCanvas.width,imageCanvas.height).data;let blue=0,transparent=0;
      for(let i=0;i<imageData.length;i+=4){if(imageData[i+3]>100 && imageData[i+2]>imageData[i])blue++;if(imageData[i+3]===0)transparent++;}
      checks.cameraBlueRamp=blue>100 && transparent>0;
    }else checks.cameraBlueRamp=false;
    await capture('camarascalor');
    await hold('camera-analysis-display-points');await waitCameras();
    await hold('camera-analysis-mode-year');await hold('camera-analysis-year-2024');await waitCameras();
    checks.cameraYearInventory=analysisView.info().filteredCount===expectedCameras2024;
    await hold('camera-analysis-mode-month');await hold('camera-analysis-month-07');await waitCameras();
    checks.cameraMonthlyInventory=analysisView.info().filteredCount===expectedCamerasJuly2024 && analysisView.info().dateRange.end==='2024-07-31';
    await hold('camera-analysis-cross');
    checks.duplicateHiddenFromCompare=$('analysis-layer-cameras').disabled && !analysisView.targets().some(t=>t.id==='analysis-layer-cameras');
    await hold('analysis-layer-security');await waitLayer();await waitCameras();
    checks.crossSelection=analysisView.info().compareCategory==='security' && $('analysis-cross-close').textContent==='Quitar comparación';
    const cameraPanel=document.querySelector('.analysis-camera-panel'),securityPanel=document.querySelector('.analysis-security-panel');
    checks.crossPanelsSeparate=analysisView.info().crossed && !cameraPanel.hidden && !securityPanel.hidden
      && cameraPanel.dataset.side==='left' && securityPanel.dataset.side==='right'
      && cameraPanel.getBoundingClientRect().right<securityPanel.getBoundingClientRect().left;
    checks.crossLayersVisible=map.info().analysisLayerVisible && map.info().cameraAnalysisVisible && map.info().cameraAnalysisPointCount===expectedCamerasJuly2024;
    checks.crossRejectsSameCategory=analysisView.setCrossDataset('cameras')===false && analysisView.info().crossed;
    analysisView.setFilters({year:'2023'});await waitLayer();await waitCameras();
    const securityAtCross=analysisView.info().datasets.security;
    snapshots.paneles=[cameraPanel,securityPanel].map(panel=>{
      const body=panel.querySelector('.analysis-body');
      return {category:panel.dataset.kind,visibleHeight:body.clientHeight,contentHeight:body.scrollHeight};
    });
    checks.controlsReachable=checks.controlsReachable && snapshots.paneles.every(panel=>panel.contentHeight<=panel.visibleHeight+1);
    checks.crossSecurityIndependent=securityAtCross.filteredCount===20009 && analysisView.info().datasets.cameras.filteredCount===expectedCamerasJuly2024;
    analysisView.setCameraFilters({state:'Operativa',type:'Domo'});await waitCameras();
    const filteredCameras=analysisView.info().datasets.cameras;
    checks.crossCamerasIndependent=analysisView.info().datasets.security.filteredCount===20009
      && filteredCameras.filteredCount<expectedCamerasJuly2024 && filteredCameras.summary.operational===filteredCameras.filteredCount
      && filteredCameras.filters.year==='2024' && filteredCameras.filters.month==='07'
      && map.info().cameraAnalysisPointCount===filteredCameras.filteredCount;
    analysisView.setCameraFilters({state:'all',type:'all'});await waitCameras();
    await hold('camera-analysis-opacity-less');
    checks.cameraOpacityIndependent=Math.abs(map.info().cameraAnalysisOpacity-.8)<.001 && Math.abs(map.info().analysisOpacity-.45)<.001;
    analysisView.setOpacity('security',.35);
    checks.securityOpacityIndependent=Math.abs(map.info().analysisOpacity-.35)<.001 && Math.abs(map.info().cameraAnalysisOpacity-.8)<.001;
    analysisView.setCameraDisplay('heatmap');await waitCameras();await waitLayer();
    checks.crossHeatmaps=map.info().cameraAnalysisMode==='heatmap' && map.info().cameraAnalysisVisible && map.info().analysisLayerVisible;
    analysisView.setCameraDisplay('points');await waitCameras();await waitLayer();
    const crossViewport=$('map').getBoundingClientRect(),crossPoint=map.locationToScreen(local);
    moveOver(crossPoint.x,crossPoint.y);await sleep(240);
    checks.crossMouseDetails=analysisView.info().hover?.source==='mouse' && !!analysisView.info().hover?.security && !!analysisView.info().hover?.cameras;
    analysisView.dismissDetails();
    const crossHand={id:'analysis-cross-hand',x:crossPoint.x/crossViewport.width,y:crossPoint.y/crossViewport.height};
    await renderGesture({mode:'point',cursor:crossHand,pointers:[crossHand],selectionHandId:null,events:[],progress:0},1);await sleep(500);
    const crossDetail=analysisView.info().hover;snapshots.cruce={...analysisView.info(),map:map.info()};
    checks.crossHandDetails=crossDetail?.source==='hand' && crossDetail.security?.referenceDate==='2023-12-31'
      && crossDetail.quadrantIds.length===1 && crossDetail.cameras?.total<=expectedCamerasJuly2024;
    window.desktop.reportSmoke({phase:'analysis-cruce'});await sleep(150);
    const fixedCameras=JSON.stringify(analysisView.info().datasets.cameras),fixedCameraLayer=$('map').querySelector('.leaflet-analysis-cameras-pane').firstChild;
    await hold('analysis-playback');await waitLayer();
    await sleep(450);await waitLayer();
    checks.crossPlaybackKeepsCameras=analysisView.info().playback.playing && analysisView.info().crossed
      && fixedCameras===JSON.stringify(analysisView.info().datasets.cameras)
      && fixedCameraLayer===$('map').querySelector('.leaflet-analysis-cameras-pane').firstChild;
    await capture('timelapsecruce');
    await hold('analysis-cross-close');await waitCameras();
    checks.playbackStopsWhenSecurityHidden=!analysisView.info().playback.playing;
    checks.returnToSeparate=!analysisView.info().crossed && analysisView.info().activeCategory==='cameras'
      && !map.info().analysisLayerVisible && map.info().cameraAnalysisVisible && map.info().cameraAnalysisPointCount===expectedCamerasJuly2024;
    await hold('camera-analysis-category-security');await waitLayer();
    analysisView.setFilters({period:'all'});await waitLayer();
    checks.restoreSecurityFilters=analysisView.info().activeCategory==='security' && analysisView.info().filteredCount===20009 && !map.info().cameraAnalysisVisible;
    analysisView.setFilters({period:'all'});await waitLayer();
    await hold('analysis-cross');await hold('analysis-layer-fixed');await waitLayer();
    const fixedInfo=analysisView.info().datasets.fixed;
    checks.fixedInComparison=analysisView.info().compareCategory==='fixed' && fixedInfo.summary.documented>=3 && fixedInfo.summary.simulated>0
      && $('map').querySelectorAll('.analysis-resource-marker[data-kind="fixed"]').length===fixedInfo.filteredCount
      && !map.info().cameraAnalysisVisible;
    await hold('fixed-analysis-locations-toggle');await hold('fixed-analysis-loc-centro-fidias');
    await waitFor(()=>analysisView.info().hover?.record?.id==='centro-fidias',2500,'ficha de ubicación documentada');
    checks.resourceDetail=analysisView.info().hover?.pinned && analysisView.info().hover.resources.fixed.total>=1
      && inspector.textContent.includes('Fidias con Leonardo da Vinci');
    await capture('puntosfijos');
    await hold('analysis-sector-close');
    await hold('fixed-analysis-layers');await hold('analysis-layer-alarms');await waitLayer();
    checks.switchComparison=analysisView.info().compareCategory==='alarms' && !$('map').querySelector('.analysis-resource-marker[data-kind="fixed"]')
      && $('map').querySelectorAll('.analysis-resource-marker[data-kind="alarms"]').length>=1
      && analysisView.info().filteredCount===20009;
    checks.alarmsMapOnly=!document.querySelector('.analysis-alarms-panel .analysis-resource-list');
    analysisView.home();
    const alarmMarker='analysis-resource-alarms-boton-paradero-pd308';
    await waitFor(()=>analysisView.targets().some(target=>target.id===alarmMarker),2500,'marcador de emergencia');
    await hold(alarmMarker);
    checks.alarmOpensDetails=analysisView.info().hover?.record?.id==='boton-paradero-pd308'
      && analysisView.info().quadrantIds===null;
    await capture('botones');
    await hold('mode-map');
    checks.returnToMap=!analysisView && !map.info().analysisMode && !map.info().analysisLayerVisible
      && map.targets().length===3 && $('mode-map').textContent==='Mapa';
    checks.originalGraphics=contentViewer.manifest.slides.length===5;
    await enterAnalysis();await analysisView.ready;await waitLayer();
    checks.reopen=analysisView.info().datasetCount===60000 && document.querySelectorAll('.analysis-experience').length===1;
    const closingAnalysis=analysisView;closingAnalysis.togglePlayback();
    await hold('mode-map');
    checks.playbackCleanup=!closingAnalysis.info().playback.playing;
    checks.cleanup=!document.querySelector('.analysis-experience') && !document.querySelector('.traffic-experience');
    window.desktop.reportSmoke({version:appVersion,ok:Object.values(checks).every(Boolean),checks,snapshots,holds,trustedClicks,gestureSelections:holds.length,cameraOpened:false});
  } finally {$('workspace').removeEventListener('click',observe,true);}
}

async function verifyTrafficExperience() {
  const checks={}, snapshots={}, holds=[], fixture=await (await fetch('/fixtures/selection-poses.json')).json();
  let trustedClicks=0;
  const observe=event=>{if(event.isTrusted)trustedClicks++;};
  $('workspace').addEventListener('click',observe,true);
  const capture=async name=>{cancelGesture();await sleep(450);window.desktop.reportSmoke({phase:`traffic-${name}`});await sleep(100);};
  const hold=async target=>{
    if(!target)throw new Error('La experiencia no expone el control gestual esperado.');
    await waitFor(()=>document.hasFocus(),12000,'ventana del mapa en primer plano para comprobar la entrada nativa');
    const beforeView=trafficExperience?.info();
    const result=await verifyHoldAt(target,fixture,()=>trustedClicks);
    holds.push({target:target.id,...result,visibleTilesLoaded:beforeView?.visibleTilesLoaded,cameraMoving:beforeView?.cameraMoving,
      rendering:trafficExperience?.info().rendering});
    if(!result.clickAccepted || result.elapsedMs<1500 || !result.noEarlyClick || result.clicks!==1)throw new Error(`El control ${target.id} no completó la selección gestual de 1,5 segundos: ${JSON.stringify(holds.at(-1))}`);
    return result;
  };
  try {
    config.mirror=false;
    checks.originalPins=map.targets().length===3;
    checks.originalGraphics=contentViewer.manifest.slides.length===5;
    await hold(selectionTargets($('map').getBoundingClientRect()).find(target=>target.element.id==='mode-experiences'));
    await waitFor(()=>trafficExperience?.info().ready,14000,'escena 3D lista');
    await trafficExperience.ready;
    await waitFor(()=>trafficExperience.info().rasterTilesLoaded && trafficExperience.info().pitch>45,10000,'cartografía del barrio visible');
    const initial=trafficExperience.info();
    checks.modelsLoaded=initial.buildingCount>=5 && initial.vehicleMeshCount===5 && initial.carModelCount>=2;
    checks.fiveVehicles=initial.vehicles.length===5 && initial.renderedVehicleCount===5;
    checks.fiveRoutes=initial.guideRoutes===5;
    checks.metricScale=initial.vehicleModels.every(model=>model.length>=3.5 && model.length<=4.6);
    checks.originalCartography=initial.originalCartography===true && initial.baseMap==='OpenStreetMap' && initial.projection==='mercator';
    checks.baseMapLoaded=initial.rasterTilesLoaded && initial.rasterTileLoadCount>0 && initial.tileErrors===0;
    checks.residentialDensity=initial.buildingCount>=40 && initial.buildings.every(item=>item.height>=4 && item.height<=7)
      && initial.buildings.reduce((sum,item)=>sum+item.width*item.depth,0)/initial.buildingCount>60;
    checks.landscapingLoaded=initial.propCount>=20 && initial.gardenCount>=40;
    checks.renderingHealthy=!initial.renderError && initial.rendering.staticInstancedMeshes>0;
    const before=initial.vehicles.map(vehicle=>[vehicle.x,vehicle.z]);
    await sleep(900);
    checks.vehiclesAdvance=trafficExperience.info().vehicles.some((vehicle,i)=>Math.hypot(vehicle.x-before[i][0],vehicle.z-before[i][1])>.2);
    snapshots.normal=trafficExperience.info();await capture('normal');
    const modeView=map.info();
    const saved=engine;engine=new GestureEngine();
    const hands=(pose,positions)=>positions.map(([x,y],i)=>({id:`transito-${i}`,landmarks:fixture.poses[pose].map(p=>({...p,x:p.x+x-fixture.poses[pose][8].x,y:p.y+y-fixture.poses[pose][8].y}))}));
    const gesture=async(pose,positions,t)=>{const frame=hands(pose,positions);await renderGesture(engine.update(frame,t,selectionContext(engine)),frame.length);};
    try {
      for(const t of [0,90,180])await gesture('fist',[[.58,.75]],t);
      const start=trafficExperience.info().camera.target;
      for(const [t,x] of [[220,.61],[260,.65],[300,.7]])await gesture('fist',[[x,.75]],t);
      const moved=trafficExperience.info().camera.target;
      checks.gesturePan=Math.hypot(moved[0]-start[0],moved[2]-start[2])>1;
      engine=new GestureEngine();
      for(const t of [400,490,580])await gesture('ok',[[.4,.72],[.6,.72]],t);
      const scale=trafficExperience.info().scale;
      for(const [t,d] of [[620,.14],[660,.18],[700,.23]])await gesture('ok',[[.5-d,.72],[.5+d,.72]],t);
      checks.gestureZoom=trafficExperience.info().scale>scale;
      checks.mapUnderneathUnchanged=sameMapView(modeView,map.info());
    } finally {engine=saved;cancelGesture();trafficExperience.home();}
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-scenario-punta'));
    checks.peakSelected=trafficExperience.info().scenario==='punta' && !trafficExperience.info().night;
    snapshots.punta=trafficExperience.info();await capture('punta');
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-toggle'));
    const pausedState=trafficExperience.info();await sleep(350);
    checks.pauseFreezes=pausedState.paused && trafficExperience.info().elapsed===pausedState.elapsed;
    trafficExperience.reset();checks.restartAtZero=trafficExperience.info().elapsed===0;
    trafficExperience.setPaused(false);
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-scenario-madrugada'));
    snapshots.madrugada=trafficExperience.info();
    checks.nightSelected=snapshots.madrugada.night && snapshots.madrugada.scenario==='madrugada';
    await capture('madrugada');
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-view'));
    await waitFor(()=>trafficExperience.info().viewMode==='2d' && trafficExperience.info().pitch<1,3000,'vista de planta');
    checks.planView=trafficExperience.info().originalCartography && trafficExperience.info().pitch<1;
    snapshots.planta=trafficExperience.info();await capture('planta');
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-view'));
    await waitFor(()=>trafficExperience.info().viewMode==='3d' && trafficExperience.info().pitch>45,3000,'vista tridimensional');
    checks.restore3d=trafficExperience.info().pitch>45 && trafficExperience.info().buildingCount===initial.buildingCount;
    const allTargets=trafficExperience.targets();
    checks.controlsReachable=allTargets.every(target=>target.width>=32 && target.height>=30 && document.elementFromPoint($('map').getBoundingClientRect().left+target.x,$('map').getBoundingClientRect().top+target.y)?.closest('button,input')===target.element);
    $('traffic-guides').click();checks.guidesHide=!trafficExperience.info().guidesVisible;
    $('traffic-guides').click();checks.guidesRestore=trafficExperience.info().guidesVisible;
    trafficExperience.setScenario('normal');trafficExperience.home();
    const countBefore=trafficExperience.info();
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-count-50'));
    checks.gestureSlider=trafficExperience.info().vehicleCount===50;
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-count-increase'));
    checks.increaseOne=trafficExperience.info().vehicleCount===51;
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-count-decrease'));
    checks.decreaseOne=trafficExperience.info().vehicleCount===50;
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-count-100'));
    await sleep(500);
    const maximum=trafficExperience.info();snapshots.cantidad=maximum;await capture('cantidad');
    checks.oneHundred=maximum.vehicleCount===100 && maximum.activeCount+maximum.queuedCount===100
      && maximum.renderedVehicleCount===maximum.activeCount && maximum.vehiclePoolCapacity===100 && !maximum.renderError;
    checks.countKeepsClock=maximum.elapsed>countBefore.elapsed;
    trafficExperience.setPaused(true);const pausedCount=trafficExperience.info();
    trafficExperience.setVehicleCount(25);await sleep(250);
    checks.countKeepsPause=trafficExperience.info().paused && trafficExperience.info().elapsed===pausedCount.elapsed;
    trafficExperience.setScenario('punta');
    checks.countKeepsScenario=trafficExperience.info().vehicleCount===25 && trafficExperience.info().scenario==='punta';
    trafficExperience.reset();checks.countKeepsReset=trafficExperience.info().vehicleCount===25;
    await hold(trafficExperience.targets().find(target=>target.id==='traffic-count-0'));
    const empty=trafficExperience.info();
    checks.zeroVehicles=empty.vehicleCount===0 && empty.vehicles.length===0 && empty.renderedVehicleCount===0 && empty.queuedCount===0;
    checks.rangeLimits=$('traffic-count-decrease').disabled && $('traffic-vehicle-count').min==='0' && $('traffic-vehicle-count').max==='100' && $('traffic-vehicle-count').step==='1';
    trafficExperience.setVehicleCount(5);trafficExperience.setScenario('normal');trafficExperience.setPaused(false);
    await hold(allTargets.find(target=>target.id==='traffic-exit'));
    checks.returnToMap=!trafficExperience && !document.querySelector('.traffic-canvas') && map.targets().length===3;
    await capture('mapa');
    await enterExperience({animate:false});
    checks.reopen=trafficExperience.info().ready && trafficExperience.info().vehicleMeshCount===5 && document.querySelectorAll('.traffic-canvas').length===1;
    leaveExperience();
    checks.cleanup=!document.querySelector('.traffic-experience');
    await openSettings();await waitFor(()=>$('settings').open,3000,'diálogo de ajustes');
    checks.settingsOpen=$('settings').open && !document.querySelector('.traffic-canvas');
    await capture('ajustes');$('settings').close();
    window.desktop.reportSmoke({version:appVersion,ok:Object.values(checks).every(Boolean),checks,snapshots,holds,trustedClicks,cameraOpened:false});
  } finally {$('workspace').removeEventListener('click',observe,true);}
}

import './analysis-ui.css';
import boundaryText from '../assets/la-reina.geojson?raw';
import { parseSecurityCSV, filterSecurityRecords, buildDensitySurface, boundaryPolygons, projectSecurityPoint, heatColor, pointInsideBoundary, createSecuritySpatialIndex, getSecurityDateRange, normalizeSecurityRobberyTypes, toggleSecurityRobberyType } from './analysis-data.js';
import { parseCameraCSV, filterCameraRecords, summarizeCameraRecords, cameraHeatColor, createCameraSpatialIndex, normalizeCameraTypes, toggleCameraType } from './camera-analysis-data.js';
import { createAnalysisPanel, SECURITY_CHOICES, CAMERA_CHOICES } from './analysis-panel.js';
import { createAnalysisPlayback } from './analysis-playback.js';

const boundary=JSON.parse(boundaryText),number=value=>new Intl.NumberFormat('es-CL').format(value);
const defaults={security:{year:'all',month:'all',period:'all',robbery:'all'},cameras:{year:'all',month:'all',state:'all',type:'all'}};
const names={security:'Robos',cameras:'Cámaras'};
function densityImage(surface,camera=false) {
  const source=document.createElement('canvas');source.width=surface.width;source.height=surface.height;
  const small=source.getContext('2d'),pixels=small.createImageData(surface.width,surface.height);
  for(let i=0;i<surface.values.length;i++) {
    const value=surface.max>0?Math.pow(Math.max(0,surface.values[i])/surface.max,.65):0;
    const rgb=camera?cameraHeatColor(Math.min(1,value)):heatColor(Math.min(1,value));
    pixels.data.set([...rgb,camera?Math.round(255*Math.min(1,value*1.7)):255],i*4);
  }
  small.putImageData(pixels,0,0);
  const image=document.createElement('canvas');image.width=1024;image.height=512;
  const context=image.getContext('2d'),[west,south,east,north]=surface.projectedBounds,shape=new Path2D();
  for(const polygon of boundaryPolygons(boundary))for(const ring of polygon) {
    ring.forEach(([lng,lat],i)=>{const p=projectSecurityPoint(lng,lat),x=(p[0]-west)/(east-west)*image.width,y=(north-p[1])/(north-south)*image.height;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);});shape.closePath();
  }
  context.clip(shape,'evenodd');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(source,0,0,image.width,image.height);return image.toDataURL('image/png');
}
export async function createAnalysisView(container,{map,notify=()=>{},onChange=()=>{}}={}) {
  let destroyed=false,loaded=false,failure='',activeCategory='security',crossed=false,hoverTimer=null,hoverAnchor=null,hoverDetails=null;
  let timelineFrames=null,timelineActive=false,suppressTimelineFrame=false;
  const abort=new AbortController(),datasets={},panels={};
  for(const kind of ['security','cameras'])datasets[kind]={records:[],filtered:[],metadata:null,filters:{...defaults[kind]},summary:{total:0},surface:null,image:null,index:null,dateRange:null,temporalMode:'all',selectedYear:'2025',selectedMonth:'12',display:kind==='cameras'?'points':'heatmap',opacity:kind==='cameras'?.9:.62};
  const overlay=document.createElement('section');overlay.className='analysis-experience';overlay.dataset.state='loading';overlay.setAttribute('aria-label','Análisis territorial de robos y cámaras');container.append(overlay);
  for(const kind of ['security','cameras'])panels[kind]=createAnalysisPanel(overlay,container,kind,{
    category:setCategory,filters:values=>setDatasetFilters(kind,values),mode:mode=>setTemporalMode(mode,kind),reset:()=>setDatasetFilters(kind,defaults[kind]),cameraType:value=>setDatasetFilters('cameras',{type:toggleCameraType(datasets.cameras.filters.type,value)},{keepPicker:true}),robbery:value=>setDatasetFilters('security',{robbery:toggleSecurityRobberyType(datasets.security.filters.robbery,value)},{keepPicker:true}),display:setCameraDisplay,cross:()=>setCrossDataset(kind==='security'?'cameras':'security'),opacity:value=>setOpacity(kind,value),clearHover,playback:togglePlayback,seek:seekPlayback
  });
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
  const crossBar=el('div','analysis-cross-bar');crossBar.hidden=true;const crossClose=el('button');crossClose.type='button';crossClose.id='analysis-cross-close';crossClose.onclick=closeCross;crossBar.append(el('span',null,'Robos y cámaras'),crossClose);overlay.append(crossBar);
  const tooltip=el('aside','analysis-map-tooltip');tooltip.hidden=true;tooltip.setAttribute('role','tooltip');tooltip.setAttribute('aria-label','Información del sector seleccionado');
  const securityTip=el('section','analysis-tooltip-security'),securityContext=el('p','analysis-tooltip-context'),securityTotal=el('div','analysis-tooltip-total'),securityWeek=el('p','analysis-tooltip-week'),securityDates=el('small'),securityLatest=el('p'),securityAddress=el('p','analysis-tooltip-address');securityTip.append(securityContext,securityTotal,securityWeek,securityDates,securityLatest,securityAddress);
  const cameraTip=el('section','analysis-tooltip-cameras'),cameraContext=el('p','analysis-tooltip-context'),cameraTotal=el('div','analysis-tooltip-total'),cameraStates=el('p'),cameraNearest=el('p');cameraTip.append(cameraContext,cameraTotal,cameraStates,cameraNearest);
  tooltip.append(el('strong',null,'En este sector'),securityTip,cameraTip,el('small','analysis-tooltip-note','Consulta en un radio de 250 m'));
  const hoverRing=el('div','analysis-hover-ring');hoverRing.hidden=true;overlay.append(hoverRing,tooltip);
  const playback=createAnalysisPlayback({
    onFrame:renderTimelineFrame,
    onStateChange:()=>{if(!destroyed&&!suppressTimelineFrame){updatePanels();onChange({reason:'playback',...info()});}}
  });
  function visible(kind){return crossed||activeCategory===kind;}
  function updatePanels(){
    overlay.dataset.crossed=String(crossed);
    overlay.dataset.category=activeCategory;
    crossBar.hidden=!crossed;
    crossClose.textContent=`Ver solo ${names[activeCategory].toLowerCase()}`;
    for(const [kind,panel] of Object.entries(panels))panel.update({...datasets[kind],loaded,error:failure,visible:visible(kind),side:activeCategory===kind?'left':'right',crossed,datasetCount:datasets[kind].records.length,playback:kind==='security'?playback.info():null});
  }
  function closeAllPickers(){Object.values(panels).forEach(p=>p.closePicker());}
  const pointerMove=event=>{if(event.pointerType&&event.pointerType!=='mouse')return;if(event.buttons){clearHover();return;}const b=container.getBoundingClientRect();setHoverPoint({x:event.clientX-b.left,y:event.clientY-b.top,source:'mouse'});};
  const pointerLeave=()=>clearHover(),outsidePicker=event=>{if(event.target.closest?.('.analysis-date-popover,.analysis-date-selection,.analysis-filter-date,.analysis-camera-filters,.analysis-robbery-filter'))return;closeAllPickers();},keyDown=event=>{if(event.key==='Escape'){closeAllPickers();clearHover();}};
  container.addEventListener('pointermove',pointerMove,true);container.addEventListener('pointerleave',pointerLeave);document.addEventListener('pointerdown',outsidePicker,true);document.addEventListener('keydown',keyDown);
  const visibilityChange=()=>{if(document.hidden)playback.pause();};
  document.addEventListener('visibilitychange',visibilityChange);
  const unsubscribeView=map.onViewChange?.(()=>{clearHover();closeAllPickers();});map.setAnalysisMode(true);updatePanels();map.home();
  const ready=(async()=>{
    const resource=async(url,format)=>{const r=await fetch(url,{signal:abort.signal});if(!r.ok)throw new Error('No se pudo cargar la base de análisis.');return format==='json'?r.json():r.text();};
    const [securityCSV,securityMeta,cameraCSV,cameraMeta]=await Promise.all([resource('/analysis/seguridad-simulada.csv'),resource('/analysis/metadata.json','json'),resource('/analysis/camaras-seguridad.csv'),resource('/analysis/camaras-metadata.json','json')]);
    if(destroyed)return;datasets.security.records=parseSecurityCSV(securityCSV);datasets.security.metadata=securityMeta;datasets.cameras.records=parseCameraCSV(cameraCSV);datasets.cameras.metadata=cameraMeta;
    for(const d of Object.values(datasets))if(d.records.length!==d.metadata.cantidad)throw new Error('La base está incompleta.');
    loaded=true;setDatasetFilters('security',defaults.security);setDatasetFilters('cameras',defaults.cameras);onChange({reason:'ready',...info()});
  })().catch(error=>{if(destroyed||error.name==='AbortError')return;failure=error.message||'No se pudo preparar el análisis.';overlay.dataset.state='error';updatePanels();notify(failure);throw error;});ready.catch(()=>{});
  function datasetInfo(kind){const d=datasets[kind],s=d.surface;return{ready:loaded,error:failure,datasetCount:d.records.length,filteredCount:d.summary.total,filters:Object.fromEntries(Object.entries(d.filters).map(([key,value])=>[key,Array.isArray(value)?[...value]:value])),temporalMode:d.temporalMode,picker:panels[kind].picker,dateRange:d.dateRange,category:names[kind],display:d.display,opacity:d.opacity,summary:{...d.summary},surface:s?{width:s.width,height:s.height,max:s.max,bounds:s.bounds,projectedBounds:s.projectedBounds,includedCount:s.includedCount,excludedCount:s.excludedCount,bandwidthMetres:s.bandwidthMetres,colorExponent:.65,imageWidth:1024,imageHeight:512,coverage:'límite comunal completo'}:null};}
  function info(){return{...datasetInfo(activeCategory),isOpen:!destroyed,activeCategory,crossed,simulated:true,playback:playback.info(),hover:hoverDetails?{...hoverDetails}:null,datasets:{security:datasetInfo('security'),cameras:datasetInfo('cameras')}};}
  function prepareTimelineFrames(){
    if(timelineFrames)return;
    const d=datasets.security;
    timelineFrames=Object.fromEntries(SECURITY_CHOICES.period.slice(1).map(([period])=>{
      const filtered=filterSecurityRecords(d.records,{...d.filters,period}),surface=buildDensitySurface(filtered,boundary,{width:256,height:128});
      return [period,{filtered,summary:{total:filtered.length},index:createSecuritySpatialIndex(filtered),surface,image:densityImage(surface)}];
    }));
  }
  function renderTimelineFrame(state){
    if(destroyed||!loaded||suppressTimelineFrame||!visible('security'))return;
    prepareTimelineFrames();
    const d=datasets.security,frame=timelineFrames[state.period],changed=!timelineActive||d.filters.period!==state.period;
    timelineActive=true;d.filters={...d.filters,period:state.period};Object.assign(d,frame);
    renderLayers('security');
    if(changed){clearHover();updatePanels();onChange({reason:'timeline',automatic:true,...info()});}
    else panels.security.updatePlayback(state);
  }
  function renderLayers(changedKind=null,transitionMs=0){
    const s=datasets.security,c=datasets.cameras;
    if(changedKind!=='cameras'){
      if(visible('security')&&timelineActive&&timelineFrames){
        const state=playback.info(),from=timelineFrames[state.period],to=timelineFrames[state.nextPeriod];
        map.setAnalysisFrame({from:{url:from.image,bounds:from.surface.bounds},to:{url:to.image,bounds:to.surface.bounds},opacity:s.opacity,progress:state.mix});
      }else map.setAnalysisLayer(visible('security')&&s.image?{url:s.image,bounds:s.surface.bounds,opacity:s.opacity,transitionMs}:null);
    }
    if(changedKind!=='security'){if(visible('cameras')&&c.surface)map.setCameraAnalysisLayer({url:c.display==='heatmap'?c.image:null,bounds:c.surface.bounds,points:c.filtered,mode:c.display,opacity:c.opacity});else map.clearCameraAnalysisLayer();}
  }
  function togglePlayback(){if(!loaded||destroyed||!visible('security'))return false;closeAllPickers();clearHover();prepareTimelineFrames();return playback.toggle();}
  function seekPlayback(position){if(!loaded||destroyed||!visible('security'))return false;clearHover();prepareTimelineFrames();return playback.seek(position);}
  function setDatasetFilters(kind,values={}, {keepPicker=false}={}) {
    if(!loaded||destroyed||!datasets[kind])return false;
    const d=datasets[kind],next={...d.filters},options=kind==='security'?SECURITY_CHOICES:CAMERA_CHOICES;
    try {
      for(const key of Object.keys(defaults[kind]))if(values[key]!==undefined){
        if(kind==='cameras'&&key==='type'){next.type=normalizeCameraTypes(values.type);continue;}
        if(kind==='security'&&key==='robbery'){next.robbery=normalizeSecurityRobberyTypes(values.robbery);continue;}
        const value=String(values[key]);
        if(key==='year'?value!=='all'&&!['2023','2024','2025'].includes(value):key==='month'?value!=='all'&&!/^(0[1-9]|1[0-2])$/.test(value):!options[key].some(o=>o[0]===value))return false;
        next[key]=value;
      }
    } catch {return false;}
    const retainTimeline=kind==='security'&&timelineActive&&values.period===undefined;
    const transitionMs=kind==='security'&&next.period!==d.filters.period?2200:0;
    if(kind==='security'){
      suppressTimelineFrame=true;
      try{playback.pause();if(retainTimeline)next.period=playback.info().period;else playback.reset(next.period);}
      finally{suppressTimelineFrame=false;}
      timelineFrames=null;timelineActive=false;
    }
    if(next.month!=='all'&&next.year==='all')next.year=d.selectedYear;
    d.temporalMode=next.month!=='all'?'month':next.year!=='all'?'year':'all';
    if(next.year!=='all')d.selectedYear=next.year;if(next.month!=='all')d.selectedMonth=next.month;
    clearHover();if(!keepPicker)panels[kind].closePicker();d.filters=next;d.dateRange=getSecurityDateRange(next,d.metadata);
    d.filtered=kind==='security'?filterSecurityRecords(d.records,next):filterCameraRecords(d.records,next,d.metadata);
    d.summary=kind==='security'?{total:d.filtered.length}:summarizeCameraRecords(d.filtered);
    d.index=kind==='security'?createSecuritySpatialIndex(d.filtered):createCameraSpatialIndex(d.filtered);
    d.surface=buildDensitySurface(d.filtered,boundary,{width:256,height:128});d.image=densityImage(d.surface,kind==='cameras');
    if(retainTimeline)renderTimelineFrame(playback.info());else renderLayers(kind,transitionMs);
    updatePanels();overlay.dataset.state='ready';onChange({reason:'filters',dataset:kind,...info()});return true;
  }
  function setTemporalMode(mode,kind='security'){if(!loaded||!['all','year','month'].includes(mode)||!datasets[kind])return false;const d=datasets[kind];setDatasetFilters(kind,{year:mode==='all'?'all':d.selectedYear,month:mode==='month'?d.selectedMonth:'all'});if(mode!=='all')panels[kind].openPicker(mode);return true;}
  function setCategory(kind){if(!loaded||destroyed||!datasets[kind])return false;if(!crossed&&kind==='cameras')playback.pause();clearHover();closeAllPickers();activeCategory=kind;updatePanels();renderLayers();map.home();onChange({reason:'category',...info()});return true;}
  function setCameraDisplay(display){if(!loaded||!['points','heatmap'].includes(display))return false;clearHover();datasets.cameras.display=display;if(!datasets.cameras.customOpacity)datasets.cameras.opacity=display==='points'?.9:crossed?.55:.62;renderLayers();updatePanels();onChange({reason:'display',...info()});return true;}
  function setOpacity(kind,value){if(!loaded||!datasets[kind]||!Number.isFinite(value))return false;datasets[kind].customOpacity=true;datasets[kind].opacity=Math.round(Math.max(.1,Math.min(1,value))*100)/100;if(kind==='security')map.setAnalysisOpacity(datasets[kind].opacity);else map.setCameraAnalysisOpacity(datasets[kind].opacity);updatePanels();onChange({reason:'opacity',dataset:kind,...info()});return true;}
  function setCrossDataset(kind){if(!loaded||destroyed||!Object.hasOwn(datasets,kind)||kind===activeCategory)return false;clearHover();closeAllPickers();crossed=true;datasets.security.customOpacity=false;datasets.cameras.customOpacity=false;datasets.security.opacity=.45;datasets.cameras.opacity=datasets.cameras.display==='points'?.9:.55;updatePanels();renderLayers();map.home();onChange({reason:'cross',...info()});return true;}
  function closeCross(){if(activeCategory==='cameras')playback.pause();clearHover();closeAllPickers();crossed=false;datasets.security.customOpacity=false;datasets.cameras.customOpacity=false;datasets.security.opacity=.62;datasets.cameras.opacity=datasets.cameras.display==='points'?.9:.62;updatePanels();renderLayers();map.home();onChange({reason:'uncross',...info()});return true;}
  function clearHover(){clearTimeout(hoverTimer);hoverTimer=null;hoverAnchor=null;hoverDetails=null;tooltip.hidden=true;hoverRing.hidden=true;}
  function setHoverPoint(point){if(!loaded||destroyed||!point||Object.values(panels).some(p=>p.picker)){clearHover();return false;}const {x,y}=point,b=container.getBoundingClientRect();if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>b.width||y>b.height){clearHover();return false;}const top=document.elementFromPoint(b.left+x,b.top+y);if(!top||!container.contains(top)||top.closest('.analysis-panel,.analysis-date-popover,.analysis-cross-bar,.analysis-timeline-bar,.map-tools,#diagnostics,button,a,input,select')){clearHover();return false;}const location=map.screenToLocation(x,y);if(!location||!pointInsideBoundary(location.lng,location.lat,boundary)){clearHover();return false;}if(hoverAnchor&&hoverAnchor.source===point.source&&Math.hypot(hoverAnchor.x-x,hoverAnchor.y-y)<18)return true;clearTimeout(hoverTimer);hoverAnchor={x,y,source:point.source||'mouse',...location};hoverTimer=setTimeout(()=>showHover(hoverAnchor),point.source==='hand'?420:140);return true;}
  function showHover(anchor){
    if(!anchor||destroyed||!loaded)return;
    const s=datasets.security,c=datasets.cameras;
    let security=null;
    if(visible('security')){
      const {total,lastIncident,last7Days,last7DaysRange,last7DaysLabel,referenceDate,radiusMetres}=s.index.query({...anchor,radiusMetres:250,referenceDate:s.dateRange.end});
      let last=null;
      if(lastIncident){
        const {id,fecha,hora,direccion,tipo_incidente,lat,lng}=lastIncident;
        last={id,fecha,hora,direccion,tipo_incidente,lat,lng};
      }
      security={total,lastIncident:last,last7Days,last7DaysRange,last7DaysLabel,referenceDate,radiusMetres};
    }
    const cameras=visible('cameras')?c.index.query({...anchor,radiusMetres:250}):null;
    hoverDetails={...(security||cameras),security,cameras,source:anchor.source,lat:anchor.lat,lng:anchor.lng};securityTip.hidden=!security;cameraTip.hidden=!cameras;
    if(security){
      const [,periodLabel,periodHours]=SECURITY_CHOICES.period.find(([value])=>value===s.filters.period);
      securityContext.textContent=`Robos · ${s.dateRange.label}`;
      securityTotal.textContent=`${number(security.total)} ${security.total===1?'robo':'robos'} · ${periodLabel}${periodHours?` (${periodHours})`:''}`;
      securityWeek.textContent=`Últimos 7 días del período: ${number(security.last7Days)}`;
      securityDates.textContent=security.last7DaysRange?.label||'';
      const last=security.lastIncident;
      securityLatest.textContent=last?`Último registro: ${last.fecha.split('-').reverse().join('/')} · ${last.hora}`:'Sin registros para estos filtros.';
      securityAddress.textContent=last?`${last.tipo_incidente} · ${last.direccion.replace(' (numeración simulada)','')}`:'';
    }
    if(cameras){cameraContext.textContent=`Cámaras · al ${c.dateRange.end.split('-').reverse().join('/')}`;cameraTotal.textContent=`${number(cameras.total)} ${cameras.total===1?'cámara':'cámaras'}`;cameraStates.textContent=`Operativas: ${number(cameras.operational)} · otras: ${number(cameras.maintenance+cameras.inactive)}`;const near=cameras.nearest;cameraNearest.textContent=near?`Más cercana: ${near.direccion.replace(' (numeración simulada)','')} · ${Math.round(near.distanceMetres)} m`:'Sin cámaras en este radio para los filtros elegidos.';}
    tooltip.hidden=false;const outer=container.getBoundingClientRect(),tip=tooltip.getBoundingClientRect(),leftPanel=Object.values(panels).find(p=>p.isVisible&&p.element.dataset.side==='left')?.element.getBoundingClientRect(),rightPanel=Object.values(panels).find(p=>p.isVisible&&p.element.dataset.side==='right')?.element.getBoundingClientRect(),min=leftPanel?leftPanel.right-outer.left+12:12,max=rightPanel?rightPanel.left-outer.left-12:outer.width-12;let left=anchor.x+22;if(left+tip.width>max)left=anchor.x-tip.width-22;tooltip.style.left=`${Math.max(min,Math.min(max-tip.width,left))}px`;tooltip.style.top=`${Math.max(68,Math.min(outer.height-tip.height-12,anchor.y-tip.height/2))}px`;const east=map.locationToScreen({lat:anchor.lat,lng:anchor.lng+250/(111320*Math.cos(anchor.lat*Math.PI/180))}),radius=east?Math.hypot(east.x-anchor.x,east.y-anchor.y):28;Object.assign(hoverRing.style,{left:`${anchor.x}px`,top:`${anchor.y}px`,width:`${radius*2}px`,height:`${radius*2}px`});hoverRing.hidden=false;
  }
  function targets(){
    if(destroyed)return[];
    const result=Object.values(panels).flatMap(p=>p.targets());
    if(crossed && crossClose.getClientRects().length){
      const b=container.getBoundingClientRect(),r=crossClose.getBoundingClientRect();
      result.push({id:crossClose.id,x:r.left+r.width/2-b.left,y:r.top+r.height/2-b.top,width:r.width,height:r.height,element:crossClose,priority:30});
    }
    return result;
  }
  return{ready,get isOpen(){return!destroyed;},info,togglePlayback,seekPlayback,setFilters:values=>setDatasetFilters('security',values),setCameraFilters:values=>setDatasetFilters('cameras',values),setTemporalMode,setCategory,setCameraDisplay,setCrossDataset,closeCross,setOpacity,setHoverPoint,clearHover,targets,pan(dx,dy){if(!destroyed)map.pan(dx,dy);},zoom(delta,x,y){if(!destroyed)map.zoom(delta,x,y);},home(){if(!destroyed)map.home();},destroy(){if(destroyed)return;destroyed=true;playback.destroy();timelineFrames=null;clearHover();abort.abort();unsubscribeView?.();container.removeEventListener('pointermove',pointerMove,true);container.removeEventListener('pointerleave',pointerLeave);document.removeEventListener('pointerdown',outsidePicker,true);document.removeEventListener('keydown',keyDown);document.removeEventListener('visibilitychange',visibilityChange);map.setAnalysisLayer(null);map.clearCameraAnalysisLayer();map.setAnalysisMode(false);overlay.remove();for(const d of Object.values(datasets)){d.records=[];d.filtered=[];d.index=null;d.surface=null;d.image=null;}}};
}

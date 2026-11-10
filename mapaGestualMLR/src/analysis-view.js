import './analysis-ui.css';
import boundaryText from '../assets/la-reina.geojson?raw';
import { parseSecurityCSV, filterSecurityRecords, buildDensitySurface, boundaryPolygons, projectSecurityPoint, heatColor, pointInsideBoundary, createSecuritySpatialIndex, getSecurityDateRange, normalizeSecurityRobberyTypes, toggleSecurityRobberyType } from './analysis-data.js';
import { parseCameraCSV, filterCameraRecords, summarizeCameraRecords, cameraHeatColor, createCameraSpatialIndex, normalizeCameraTypes, toggleCameraType } from './camera-analysis-data.js';
import { createAnalysisPanel, SECURITY_CHOICES, CAMERA_CHOICES } from './analysis-panel.js';
import { createAnalysisPlayback } from './analysis-playback.js';
import { ANALYSIS_LAYERS, ANALYSIS_YEARS, getAnalysisLayer, chooseAnalysisLayer, parseSimulatedSecurityResources, parseAlarmUsage, mostUsedAlarmButtons, readSecurityResources, nearbySecurityResources } from './analysis-catalog.js';
import { createLayerPicker } from './analysis-layer-picker.js';
import { createResourceMarkers } from './analysis-resource-markers.js';

const boundary=JSON.parse(boundaryText),number=value=>new Intl.NumberFormat('es-CL').format(value);
const defaults={security:{year:'all',month:'all',period:'all',robbery:'all'},cameras:{year:'all',month:'all',state:'all',type:'all'}};
const inside=(lng,lat)=>pointInsideBoundary(lng,lat,boundary);
const radiusMetres=250;
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
  let destroyed=false,loaded=false,failure='',activeCategory='security',compareCategory=null,hoverTimer=null,hoverAnchor=null,hoverDetails=null;
  let pinned=false,displayedAnchor=null,restoreFocus=null,dismissedAnchor=null,resourceError='',resourcesReady=false;
  let timelineFrames=null,timelineActive=false,suppressTimelineFrame=false;
  const abort=new AbortController(),datasets={},panels={};
  const crossed=()=>compareCategory!==null, selection=()=>({primary:activeCategory,compare:compareCategory});
  const defaultOpacity=(kind, compare=false)=>kind==='security'?(compare ? .45 : .62):kind==='cameras'&&datasets.cameras?.display==='heatmap'?(compare ? .55 : .62):.9;
  for(const layer of ANALYSIS_LAYERS){
    const kind=layer.id;
    datasets[kind]={records:[],filtered:[],metadata:null,filters:kind==='alarms'?{year:null,usage:'all'}:{...defaults[kind]},summary:{total:0},surface:null,image:null,index:null,dateRange:null,temporalMode:'all',selectedYear:'2025',selectedMonth:'12',display:kind==='security'?'heatmap':'points',opacity:defaultOpacity(kind)};
  }
  const overlay=document.createElement('section');overlay.className='analysis-experience';overlay.dataset.state='loading';overlay.setAttribute('aria-label','Análisis territorial');container.append(overlay);
  for(const layer of ANALYSIS_LAYERS){
    const kind=layer.id;
    panels[kind]=createAnalysisPanel(overlay,container,layer,{
      filters:values=>setDatasetFilters(kind,values),mode:mode=>setTemporalMode(mode,kind),reset:()=>setDatasetFilters(kind,defaults[kind]),cameraType:value=>setDatasetFilters('cameras',{type:toggleCameraType(datasets.cameras.filters.type,value)},{keepPicker:true}),robbery:value=>setDatasetFilters('security',{robbery:toggleSecurityRobberyType(datasets.security.filters.robbery,value)},{keepPicker:true}),display:setCameraDisplay,alarmFilters:setAlarmFilters,catalog:openCatalog,locate:locateResource,opacity:value=>setOpacity(kind,value),clearHover:()=>{catalog.close();for(const [id,panel] of Object.entries(panels))if(id!==kind)panel.closePicker();clearHover();},playback:togglePlayback,seek:seekPlayback
    });
  }
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
  const catalog=createLayerPicker(overlay,container,{selection,onSelect:(kind,role)=>{
    if(role==='compare')setCrossDataset(kind);else setCategory(kind);
    const prefix=getAnalysisLayer(activeCategory).prefix;
    return document.getElementById(`${prefix}-${role==='compare'?'cross':'layers'}`);
  }});
  const crossBar=el('div','analysis-cross-bar');crossBar.hidden=true;const crossClose=el('button');crossClose.type='button';crossClose.id='analysis-cross-close';crossClose.textContent='Quitar comparación';crossClose.onclick=()=>{
    closeCross();document.getElementById(`${getAnalysisLayer(activeCategory).prefix}-cross`)?.focus({preventScroll:true});
  };crossBar.append(el('span',null,'Comparación activa'),crossClose);overlay.append(crossBar);
  const tooltip=el('aside','analysis-map-tooltip');tooltip.hidden=true;tooltip.setAttribute('role','region');tooltip.setAttribute('aria-labelledby','analysis-sector-title');
  const tipHeader=el('header','analysis-tooltip-heading'),tipTitle=el('h2',null,'En este sector'),tipRadius=el('p',null,'Radio de 250 m');
  tipTitle.id='analysis-sector-title';tipTitle.tabIndex=-1;const tipHeading=el('div');tipHeading.append(tipTitle,tipRadius);
  const tipClose=el('button',null,'×');tipClose.id='analysis-sector-close';tipClose.type='button';tipClose.setAttribute('aria-label','Cerrar ficha del sector');tipClose.onclick=()=>dismissDetails();
  tipHeader.append(tipHeading,tipClose);
  const securityTip=el('section','analysis-tooltip-security'),securityContext=el('p','analysis-tooltip-context'),securityTotal=el('div','analysis-tooltip-total'),securityHours=el('p','analysis-tooltip-hours'),securityWeek=el('p','analysis-tooltip-week'),securityDates=el('small'),securityLatest=el('p'),securityAddress=el('p','analysis-tooltip-address');securityTip.append(securityContext,securityTotal,securityHours,securityWeek,securityDates,securityLatest,securityAddress);
  const cameraTip=el('section','analysis-tooltip-cameras'),cameraContext=el('p','analysis-tooltip-context'),cameraTotal=el('div','analysis-tooltip-total'),cameraStates=el('p'),cameraNearest=el('p');cameraTip.append(cameraContext,cameraTotal,cameraStates,cameraNearest);
  const resourcesTip=el('div','analysis-tooltip-resources');
  const pinTip=el('button','analysis-pin-tip','Fijar ficha');pinTip.type='button';pinTip.id='analysis-sector-pin';
  pinTip.onclick=()=>{
    if(!displayedAnchor)return;
    const trigger=displayedAnchor.trigger || panels[activeCategory].element.querySelector('.analysis-layer-trigger');
    pinSector(displayedAnchor,trigger);
  };
  tooltip.append(tipHeader,securityTip,cameraTip,resourcesTip,pinTip);
  for(const event of ['pointerdown','mousedown','touchstart','click','dblclick','wheel'])tooltip.addEventListener(event,e=>e.stopPropagation());
  const hoverRing=el('div','analysis-hover-ring');hoverRing.hidden=true;overlay.append(hoverRing,tooltip);
  const resourceMarkers=createResourceMarkers(container,{map,onSelect:(record,event)=>showResource(record,{pin:true,anchor:event.currentTarget}),
    onHover:(record,event)=>{if(!pinned&&!catalog.isOpen)showResource(record,{anchor:event.currentTarget});}});
  const playback=createAnalysisPlayback({
    onFrame:renderTimelineFrame,
    onStateChange:()=>{if(!destroyed&&!suppressTimelineFrame){updatePanels();onChange({reason:'playback',...info()});}}
  });
  function visible(kind){return activeCategory===kind||compareCategory===kind;}
  function updatePanels(){
    overlay.dataset.crossed=String(crossed());
    overlay.dataset.category=activeCategory;
    crossBar.hidden=!crossed();
    for(const [kind,panel] of Object.entries(panels)){
      const resource=getAnalysisLayer(kind).resource;
      const dataset=datasets[kind];
      panel.update({...dataset,loaded:resource?resourcesReady:loaded,error:resource?resourceError:failure,canChoose:loaded,visible:visible(kind),side:activeCategory===kind?'left':'right',crossed:crossed(),datasetCount:dataset.records.length,playback:kind==='security'?playback.info():null});
    }
  }
  function closeAllPickers(){Object.values(panels).forEach(p=>p.closePicker());}
  function openCatalog(role,anchor){closeAllPickers();clearHover();catalog.open(role,anchor);}
  const pointerMove=event=>{
    if(event.pointerType&&event.pointerType!=='mouse'||pinned)return;
    if(event.buttons){clearHover();return;}
    if(tooltip.contains(event.target)||event.target.closest?.('.analysis-resource-marker')){clearTimeout(hoverTimer);hoverTimer=null;return;}
    const b=container.getBoundingClientRect();
    setHoverPoint({x:event.clientX-b.left,y:event.clientY-b.top,source:'mouse'});
  };
  const pointerLeave=()=>clearHover({keepPinned:true}),outsidePicker=event=>{
    const target=event.target;
    if(!target.closest?.('.analysis-layer-picker,.analysis-layer-trigger,.analysis-compare'))catalog.close(false);
    if(!target.closest?.('.analysis-date-popover,.analysis-date-selection,.analysis-filter-date,.analysis-camera-filters,.analysis-robbery-filter'))closeAllPickers();
  },keyDown=event=>{if(event.key==='Escape'){if(catalog.close())return;closeAllPickers();dismissDetails();}};
  const mapClick=event=>{
    if(!loaded||event.button!==0||event.defaultPrevented||!event.target.closest?.('#map')||isMapControl(event.target))return;
    const b=container.getBoundingClientRect(),x=event.clientX-b.left,y=event.clientY-b.top;
    const location=map.screenToLocation(x,y);
    if(location&&inside(location.lng,location.lat))pinSector({x,y,source:'mouse',...location});
  };
  container.addEventListener('pointermove',pointerMove,true);container.addEventListener('pointerleave',pointerLeave);document.addEventListener('pointerdown',outsidePicker,true);document.addEventListener('keydown',keyDown);
  container.addEventListener('click',mapClick);
  const visibilityChange=()=>{if(document.hidden)playback.pause();};
  document.addEventListener('visibilitychange',visibilityChange);
  const unsubscribeView=map.onViewChange?.(()=>{clearHover();closeAllPickers();catalog.close();});map.setAnalysisMode(true);updatePanels();map.home();
  const ready=(async()=>{
    const resource=async(url,format)=>{const r=await fetch(url,{signal:abort.signal});if(!r.ok)throw new Error('No se pudo cargar la base de análisis.');return format==='json'?r.json():r.text();};
    const [securityCSV,securityMeta,cameraCSV,cameraMeta,usageByYear,resources]=await Promise.all([resource('/analysis/seguridad-simulada.csv'),resource('/analysis/metadata.json','json'),resource('/analysis/camaras-seguridad.csv'),resource('/analysis/camaras-metadata.json','json'),
      resource('/analysis/pulsaciones-botones.csv').then(parseAlarmUsage).catch(()=>new Map()),
      Promise.all([
        resource('/analysis/recursos-seguridad.json','json').then(value=>readSecurityResources(value,inside)),
        resource('/analysis/recursos-simulados.csv').then(parseSimulatedSecurityResources).catch(()=>[])
      ]).then(([documented, simulated])=>{
        try { return readSecurityResources([...documented,...simulated],inside); }
        catch { return documented; }
      }).catch(error=>{resourceError=error.message;return [];})]);
    if(destroyed)return;datasets.security.records=parseSecurityCSV(securityCSV);datasets.security.metadata=securityMeta;datasets.cameras.records=parseCameraCSV(cameraCSV);datasets.cameras.metadata=cameraMeta;
    for(const kind of ['security','cameras'])if(datasets[kind].records.length!==datasets[kind].metadata.cantidad)throw new Error('La base está incompleta.');
    for(const layer of ANALYSIS_LAYERS.filter(layer=>layer.resource)){
      const d=datasets[layer.id];
      d.records=resources.filter(record=>record.kind===layer.id);
      d.filtered=d.records;
      if(layer.id==='alarms'){
        d.usageByYear=usageByYear;
        d.filters.year=ANALYSIS_YEARS.findLast(year=>usageByYear.has(year))??null;
        if(d.filters.year)d.temporalMode='year';
        filterAlarms(d);
      }
      summarizeResources(d);
    }
    resourcesReady=!resourceError;
    loaded=true;setDatasetFilters('security',defaults.security);setDatasetFilters('cameras',defaults.cameras);onChange({reason:'ready',...info()});
  })().catch(error=>{if(destroyed||error.name==='AbortError')return;failure=error.message||'No se pudo preparar el análisis.';overlay.dataset.state='error';updatePanels();notify(failure);throw error;});ready.catch(()=>{});
  function datasetInfo(kind){const d=datasets[kind],s=d.surface,layer=getAnalysisLayer(kind);return{ready:layer.resource?resourcesReady:loaded,error:layer.resource?resourceError:failure,datasetCount:d.records.length,filteredCount:d.summary.total,filters:Object.fromEntries(Object.entries(d.filters).map(([key,value])=>[key,Array.isArray(value)?[...value]:value])),temporalMode:d.temporalMode,picker:panels[kind].picker,dateRange:d.dateRange,category:layer.label,display:d.display,opacity:d.opacity,summary:{...d.summary},surface:s?{width:s.width,height:s.height,max:s.max,bounds:s.bounds,projectedBounds:s.projectedBounds,includedCount:s.includedCount,excludedCount:s.excludedCount,bandwidthMetres:s.bandwidthMetres,colorExponent:.65,imageWidth:1024,imageHeight:512,coverage:'límite comunal completo'}:null};}
  function info(){return{...datasetInfo(activeCategory),isOpen:!destroyed,activeCategory,compareCategory,crossed:crossed(),simulated:true,playback:playback.info(),hover:hoverDetails?{...hoverDetails,pinned}:null,datasets:Object.fromEntries(ANALYSIS_LAYERS.map(layer=>[layer.id,datasetInfo(layer.id)]))};}
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
    if(!changedKind||getAnalysisLayer(changedKind)?.resource)renderResources();
  }
  function renderResources(){
    const points=ANALYSIS_LAYERS.filter(layer=>layer.resource&&visible(layer.id)).flatMap(({id})=>{
      const {filtered,opacity}=datasets[id];return filtered.map(record=>({...record,opacity}));
    });
    resourceMarkers.render(points);
  }
  function summarizeResources(dataset){
    const simulated=dataset.filtered.filter(record=>record.simulated).length;
    dataset.summary={total:dataset.filtered.length,documented:dataset.filtered.length-simulated,simulated};
  }
  function filterAlarms(dataset){
    const counts=dataset.usageByYear.get(dataset.filters.year);
    const points=dataset.records.map(record=>({...record,activations:counts?.get(record.id)??null}));
    dataset.mostUsed=mostUsedAlarmButtons(points);
    if(!dataset.mostUsed.length)dataset.filters.usage='all';
    dataset.filtered=dataset.filters.usage==='top'?dataset.mostUsed:points;
  }
  function setAlarmFilters(values){
    const dataset=datasets.alarms;
    if(destroyed||!resourcesReady)return;
    const {year,usage}={...dataset.filters,...values};
    if((year!==null&&!dataset.usageByYear.has(year))||!['all','top'].includes(usage)
      ||year===dataset.filters.year&&usage===dataset.filters.usage)return;
    clearHover();
    dataset.filters={year,usage};
    filterAlarms(dataset);
    summarizeResources(dataset);
    renderResources();
    updatePanels();
    onChange({reason:'filters',dataset:'alarms',...info()});
  }
  function togglePlayback(){if(!loaded||destroyed||!visible('security'))return false;closeAllPickers();clearHover();prepareTimelineFrames();return playback.toggle();}
  function seekPlayback(position){if(!loaded||destroyed||!visible('security'))return false;clearHover();prepareTimelineFrames();return playback.seek(position);}
  function setDatasetFilters(kind,values={}, {keepPicker=false}={}) {
    if(!loaded||destroyed||!defaults[kind])return false;
    const d=datasets[kind],next={...d.filters},options=kind==='security'?SECURITY_CHOICES:CAMERA_CHOICES;
    try {
      for(const key of Object.keys(defaults[kind]))if(values[key]!==undefined){
        if(kind==='cameras'&&key==='type'){next.type=normalizeCameraTypes(values.type);continue;}
        if(kind==='security'&&key==='robbery'){next.robbery=normalizeSecurityRobberyTypes(values.robbery);continue;}
        const value=String(values[key]);
        if(key==='year'?value!=='all'&&!ANALYSIS_YEARS.includes(value):key==='month'?value!=='all'&&!/^(0[1-9]|1[0-2])$/.test(value):!options[key].some(o=>o[0]===value))return false;
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
  function setTemporalMode(mode,kind='security'){if(!loaded||!['all','year','month'].includes(mode)||!defaults[kind])return false;const d=datasets[kind];setDatasetFilters(kind,{year:mode==='all'?'all':d.selectedYear,month:mode==='month'?d.selectedMonth:'all'});if(mode!=='all')panels[kind].openPicker(mode);return true;}
  function changeSelection(next,reason){
    if(!loaded||destroyed||!next)return false;
    const layoutChanged=crossed()!==(next.compare!==null);
    clearHover();closeAllPickers();catalog.close();
    activeCategory=next.primary;compareCategory=next.compare;
    if(!visible('security'))playback.pause();
    for(const [kind,d] of Object.entries(datasets)){
      if(!crossed())d.customOpacity=false;
      if(!d.customOpacity)d.opacity=defaultOpacity(kind,crossed());
    }
    updatePanels();renderLayers();
    if(layoutChanged)map.home();
    onChange({reason,...info()});return true;
  }
  function setCategory(kind){return changeSelection(chooseAnalysisLayer(selection(),kind,'primary'),'category');}
  function setCrossDataset(kind){return changeSelection(chooseAnalysisLayer(selection(),kind,'compare'),'cross');}
  function closeCross(){return crossed()&&changeSelection({...selection(),compare:null},'uncross');}
  function setCameraDisplay(display){if(!loaded||!['points','heatmap'].includes(display))return false;clearHover();datasets.cameras.display=display;if(!datasets.cameras.customOpacity)datasets.cameras.opacity=defaultOpacity('cameras',crossed());renderLayers();updatePanels();onChange({reason:'display',...info()});return true;}
  function setOpacity(kind,value){
    if(!loaded||!datasets[kind]||!Number.isFinite(value))return false;
    const d=datasets[kind];d.customOpacity=true;d.opacity=Math.round(Math.max(.1,Math.min(1,value))*100)/100;
    if(kind==='security')map.setAnalysisOpacity(d.opacity);else if(kind==='cameras')map.setCameraAnalysisOpacity(d.opacity);else renderResources();
    updatePanels();onChange({reason:'opacity',dataset:kind,...info()});return true;
  }
  function clearHover({keepPinned=false}={}){
    if(keepPinned&&pinned)return;
    clearTimeout(hoverTimer);hoverTimer=null;hoverAnchor=null;displayedAnchor=null;hoverDetails=null;pinned=false;restoreFocus=null;tooltip.hidden=true;hoverRing.hidden=true;
  }
  function dismissDetails(){
    if(displayedAnchor)dismissedAnchor={...displayedAnchor};
    const focus=tooltip.contains(document.activeElement)?restoreFocus:null;
    clearHover();
    if(focus?.getClientRects().length)focus.focus({preventScroll:true});
  }
  function isMapControl(element){return Boolean(element.closest('.analysis-panel,.analysis-date-popover,.analysis-cross-bar,.analysis-timeline-bar,.analysis-map-tooltip,.map-tools,#diagnostics,button,a,input,select'));}
  function setHoverPoint(point){
    if(!loaded||destroyed||pinned)return false;
    if(!point){if(hoverAnchor?.source==='hand')clearHover();return false;}
    if(catalog.isOpen||Object.values(panels).some(p=>p.picker))return false;
    const {x,y}=point,b=container.getBoundingClientRect(),source=point.source||'mouse';
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>b.width||y>b.height){clearHover();return false;}
    if(dismissedAnchor){
      if(dismissedAnchor.source===source&&Math.hypot(dismissedAnchor.x-x,dismissedAnchor.y-y)<26)return false;
      dismissedAnchor=null;
    }
    const top=document.elementFromPoint(b.left+x,b.top+y);
    if(top?.closest('.analysis-map-tooltip'))return true;
    if(!top||!container.contains(top)||isMapControl(top)){if(!top?.closest('.analysis-resource-marker'))clearHover();return false;}
    const location=map.screenToLocation(x,y);
    if(!location||!inside(location.lng,location.lat)){clearHover();return false;}
    if(hoverAnchor?.source===source&&Math.hypot(hoverAnchor.x-x,hoverAnchor.y-y)<(tooltip.hidden?18:32))return true;
    clearTimeout(hoverTimer);hoverAnchor={x,y,source,...location};
    hoverTimer=setTimeout(()=>{hoverTimer=null;showHover(hoverAnchor);},source==='hand'?420:170);return true;
  }
  function pinSector(anchor,trigger=null){
    if(playback.info().playing)playback.pause();
    clearTimeout(hoverTimer);hoverTimer=null;dismissedAnchor=null;pinned=true;restoreFocus=trigger;hoverAnchor=anchor;
    showHover(anchor);
    if(trigger)tipTitle.focus({preventScroll:true});
  }
  async function locateResource(record,trigger){
    clearHover();await map.focus(record,16,{animate:false});if(!destroyed&&visible(record.kind))showResource(record,{pin:true,anchor:trigger});
  }
  function showResource(record,{pin=false,anchor=null}={}){
    if(!visible(record.kind)||(!pin&&document.activeElement===anchor&&dismissedAnchor?.record?.id===record.id))return;
    const point=map.locationToScreen(record);
    if(!point)return;
    const next={...point,lat:record.lat,lng:record.lng,source:'point',record,trigger:anchor};
    if(pin)pinSector(next,anchor);
    else {clearTimeout(hoverTimer);hoverTimer=null;hoverAnchor=next;showHover(next);}
  }
  function showHover(anchor){
    if(!anchor||destroyed||!loaded)return;
    displayedAnchor=anchor;
    const s=datasets.security,c=datasets.cameras;
    let security=null;
    if(visible('security')){
      const {total,lastIncident,last7Days,last7DaysRange,last7DaysLabel,referenceDate}=s.index.query({...anchor,radiusMetres,referenceDate:s.dateRange.end});
      let last=null;
      if(lastIncident){
        const {id,fecha,hora,direccion,tipo_incidente,lat,lng}=lastIncident;
        last={id,fecha,hora,direccion,tipo_incidente,lat,lng};
      }
      security={total,lastIncident:last,last7Days,last7DaysRange,last7DaysLabel,referenceDate,radiusMetres};
    }
    const cameras=visible('cameras')?c.index.query({...anchor,radiusMetres}):null;
    const resources=Object.fromEntries(ANALYSIS_LAYERS.filter(layer=>layer.resource&&visible(layer.id)).map(({id})=>[id,nearbySecurityResources(datasets[id].filtered,anchor,radiusMetres)]));
    hoverDetails={...(security||cameras),security,cameras,resources,record:anchor.record??null,radiusMetres,source:anchor.source,lat:anchor.lat,lng:anchor.lng};
    securityTip.hidden=!security;cameraTip.hidden=!cameras;
    tipTitle.textContent=anchor.record?.title||'En este sector';
    tipRadius.textContent=anchor.record?(pinned?'Ubicación seleccionada · radio de 250 m':'Ubicación · radio de 250 m'):(pinned?'Ficha fijada · radio de 250 m':'Radio de 250 m');
    pinTip.hidden=pinned;
    if(security){
      const [,periodLabel,periodHours]=SECURITY_CHOICES.period.find(([value])=>value===s.filters.period);
      securityContext.textContent=`Robos · ${s.dateRange.label}`;
      securityTotal.textContent=`${number(security.total)} ${security.total===1?'robo':'robos'}`;
      securityHours.textContent=periodHours?`${periodLabel} · ${periodHours}`:periodLabel;
      securityWeek.textContent=`Últimos 7 días del período: ${number(security.last7Days)}`;
      securityDates.textContent=security.last7DaysRange?.label||'';
      const last=security.lastIncident;
      securityLatest.textContent=last?`Último registro: ${last.fecha.split('-').reverse().join('/')} · ${last.hora}`:'Sin registros para estos filtros.';
      securityAddress.textContent=last?`${last.tipo_incidente} · ${last.direccion.replace(' (numeración simulada)','')}`:'';
    }
    if(cameras){cameraContext.textContent=`Cámaras · inventario al ${c.dateRange.end.split('-').reverse().join('/')}`;cameraTotal.textContent=`${number(cameras.total)} ${cameras.total===1?'cámara':'cámaras'}`;cameraStates.textContent=`Operativas: ${number(cameras.operational)} · otras: ${number(cameras.maintenance+cameras.inactive)}`;const near=cameras.nearest;cameraNearest.textContent=near?`Más cercana: ${near.direccion.replace(' (numeración simulada)','')} · ${Math.round(near.distanceMetres)} m`:'Sin cámaras en este radio para los filtros elegidos.';}
    resourcesTip.replaceChildren();
    for(const [kind,detail] of Object.entries(resources)){
      const section=el('section','analysis-tooltip-resource'),layer=getAnalysisLayer(kind);
      section.dataset.tone=layer.tone;
      section.append(el('p','analysis-tooltip-context',layer.label));
      const point=anchor.record?.kind===kind?anchor.record:detail.nearest;
      if(!anchor.record||anchor.record.kind!==kind){
        section.append(el('div','analysis-tooltip-total',`${number(detail.total)} ${detail.total===1?'ubicación':'ubicaciones'}`));
      }
      if(point){
        if(point!==anchor.record)section.append(el('strong','analysis-resource-title',point.title));
        section.append(el('p',null,point.address));
        if(kind==='alarms'){
          const count=point.activations;
          if(Number.isInteger(count)){
            const caption=count===1?'Pulsación de referencia':'Pulsaciones de referencia';
            section.append(el('div','analysis-tooltip-total',number(count)),el('p','analysis-alarm-usage-label',`${caption} · ${datasets.alarms.filters.year}`));
          }else section.append(el('p',null,'Sin datos de pulsaciones.'));
        }
        if(point!==anchor.record)section.append(el('small',null,`${Math.round(point.distanceMetres)} m desde el punto consultado`));
      }else section.append(el('p',null,'Sin ubicaciones visibles en este radio.'));
      resourcesTip.append(section);
    }
    resourcesTip.hidden=!resourcesTip.childElementCount;
    tooltip.hidden=false;
    const {min,max}=cardBounds();
    tooltip.style.width=`${Math.max(190,Math.min(310,max-min))}px`;
    const timeline=panels.security.timeline;
    const outer=container.getBoundingClientRect(),bottom=timeline&&!timeline.hidden?timeline.getBoundingClientRect().top-outer.top-10:outer.height-52;
    tooltip.style.maxHeight=`${Math.max(170,bottom-76)}px`;
    const tip=tooltip.getBoundingClientRect();
    let left=anchor.x+16;if(left+tip.width>max)left=anchor.x-tip.width-16;
    left=Math.max(min,Math.min(max-tip.width,left));
    let top=Math.max(68,Math.min(bottom-tip.height,anchor.y-tip.height/2));
    if(anchor.x>left-4&&anchor.x<left+tip.width+4){
      if(anchor.y+14+tip.height<=bottom)top=anchor.y+14;
      else if(anchor.y-14-tip.height>=68)top=anchor.y-14-tip.height;
    }
    tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
    const east=map.locationToScreen({lat:anchor.lat,lng:anchor.lng+radiusMetres/(111320*Math.cos(anchor.lat*Math.PI/180))});
    const radius=east?Math.hypot(east.x-anchor.x,east.y-anchor.y):28;
    Object.assign(hoverRing.style,{left:`${anchor.x}px`,top:`${anchor.y}px`,width:`${radius*2}px`,height:`${radius*2}px`});hoverRing.hidden=false;
  }
  function cardBounds(){
    const outer=container.getBoundingClientRect(),left=panels[activeCategory].element.getBoundingClientRect(),right=compareCategory?panels[compareCategory].element.getBoundingClientRect():null;
    const tools=container.parentElement.querySelector('.map-tools')?.getBoundingClientRect();
    const min=left.right-outer.left+10,panelLimit=right?right.left-outer.left-10:outer.width-12;
    const toolsLimit=tools?.width?tools.left-outer.left-10:panelLimit;
    return {min,max:toolsLimit-min>=190?Math.min(panelLimit,toolsLimit):panelLimit};
  }
  function targets(){
    if(destroyed)return[];
    const b=container.getBoundingClientRect();
    const buttons=catalog.isOpen?catalog.targets():[crossClose,tipClose,pinTip].filter(button=>button.getClientRects().length);
    const extras=buttons.map(element=>{const r=element.getBoundingClientRect();return{id:element.id,x:r.left+r.width/2-b.left,y:r.top+r.height/2-b.top,width:r.width,height:r.height,element,priority:30};});
    return catalog.isOpen?extras:[...Object.values(panels).flatMap(p=>p.targets()),...resourceMarkers.targets(),...extras];
  }
  return{ready,get isOpen(){return!destroyed;},info,togglePlayback,seekPlayback,setFilters:values=>setDatasetFilters('security',values),setCameraFilters:values=>setDatasetFilters('cameras',values),setTemporalMode,setCategory,setCameraDisplay,setCrossDataset,closeCross,setOpacity,setHoverPoint,clearHover:()=>clearHover({keepPinned:true}),dismissDetails,targets,pan(dx,dy){if(!destroyed)map.pan(dx,dy);},zoom(delta,x,y){if(!destroyed)map.zoom(delta,x,y);},home(){if(!destroyed)map.home();},destroy(){if(destroyed)return;destroyed=true;playback.destroy();timelineFrames=null;clearHover();abort.abort();unsubscribeView?.();resourceMarkers.destroy();container.removeEventListener('pointermove',pointerMove,true);container.removeEventListener('pointerleave',pointerLeave);container.removeEventListener('click',mapClick);document.removeEventListener('pointerdown',outsidePicker,true);document.removeEventListener('keydown',keyDown);document.removeEventListener('visibilitychange',visibilityChange);map.setAnalysisLayer(null);map.clearCameraAnalysisLayer();map.setAnalysisMode(false);overlay.remove();for(const d of Object.values(datasets)){d.records=[];d.filtered=[];d.index=null;d.surface=null;d.image=null;}}};
}

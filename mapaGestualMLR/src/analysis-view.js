import './analysis-ui.css';
import boundaryText from '../assets/la-reina.geojson?raw';
import neighborsText from '../assets/la-reina-neighborhoods.geojson?raw';
import { parseSecurityCSV, filterSecurityRecords, buildDensitySurface, boundaryPolygons, projectSecurityPoint, heatColor, pointInsideBoundary, summarizeSecurityArea, getSecurityDateRange, normalizeSecurityRobberyTypes, toggleSecurityRobberyType, SECURITY_ROBBERY_TYPES } from './analysis-data.js';
import { parseCameraCSV, filterCameraRecords, summarizeCameraRecords, cameraHeatColor, normalizeCameraTypes, toggleCameraType } from './camera-analysis-data.js';
import { createAnalysisPanel, SECURITY_CHOICES, CAMERA_CHOICES } from './analysis-panel.js';
import { createAnalysisPlayback } from './analysis-playback.js';
import { ANALYSIS_LAYERS, ANALYSIS_YEARS, ALARM_RANK_DEFAULT, ALARM_RANK_MAX, MONITORING_STATUS_LABELS, getAnalysisLayer, chooseAnalysisLayer, parseSimulatedSecurityResources, parseAlarmUsage, parseFixedPointHistory, mostUsedAlarmButtons, readSecurityResources } from './analysis-catalog.js';
import { createLayerPicker } from './analysis-layer-picker.js';
import { createResourceMarkers } from './analysis-resource-markers.js';
import { createForecastView } from './analysis-forecast-view.js';
import { createAnalysisQuadrants, classifyAnalysisQuadrant, normalizeAnalysisQuadrants, toggleAnalysisArea } from './analysis-quadrants.js';
import { createAnalysisQuadrantSelector } from './analysis-quadrant-selector.js';
import { createAnalysisInspector } from './analysis-inspector.js';
import { buildCompanionAnalysis, resolveCompanionRanking } from './companion-analysis-data.js';
import { analysisBlendOpacity } from './analysis-transition.js';
import { assetUrl } from './asset-url.js';

const boundary=JSON.parse(boundaryText),number=value=>new Intl.NumberFormat('es-CL').format(value);
const defaults={security:{year:'all',month:'all',period:'all',robbery:'all'},cameras:{year:'all',month:'all',state:'all',type:'all'}};
const resourceDefaults={fixed:{year:null},alarms:{year:null,usage:'all',limit:ALARM_RANK_DEFAULT}};
const inside=(lng,lat)=>pointInsideBoundary(lng,lat,boundary);
const district=createAnalysisQuadrants(JSON.parse(neighborsText),boundary);
const allQuadrantIds=district.quadrants.map(({id})=>id);
const unitIds=ids=>new Set(ids.map(id=>district.byId.get(id).unit));
const shortDate=value=>value.split('-').reverse().join('/');
const totalActivations=records=>records.reduce((sum,record)=>sum+(record.activations??0),0);
const robberyHeatPalette=Array.from({length:256},(_,index)=>heatColor(index/255));
const cameraHeatPalette=Array.from({length:256},(_,index)=>cameraHeatColor(index/255));
const excludedAreaColor=[92,97,104];
function companionFilters(kind,filters) {
  if(kind==='security')return Array.isArray(filters.robbery)
    ? SECURITY_ROBBERY_TYPES.filter(({value})=>filters.robbery.includes(value)).map(({label})=>label) : [];
  if(kind==='cameras')return [
    ...(Array.isArray(filters.type)?filters.type:[]),
    ...(filters.state!=='all'?[CAMERA_CHOICES.state.find(([state])=>state===filters.state)?.[1]].filter(Boolean):[])
  ];
  return filters.usage==='top'?[`Hasta ${filters.limit} botones más usados`]:[];
}
function companionCut(kind,filters,dateRange) {
  if(kind==='security' && dateRange){
    const [,label,hours]=SECURITY_CHOICES.period.find(([period])=>period===filters.period);
    return {dateRange,period:[dateRange.label,label,hours].filter(Boolean).join(' · ')};
  }
  if(kind==='cameras' && dateRange)return {dateRange,period:`Inventario al ${shortDate(dateRange.end)}`};
  if(filters.year && filters.year!=='all'){
    const end=`${filters.year}-12-31`;
    return {dateRange:{start:`${filters.year}-01-01`,end},period:kind==='alarms'
      ? `Pulsaciones de ${filters.year}` : `Estado al ${shortDate(end)}`};
  }
  return {dateRange:null,period:'Sin corte definido'};
}
function companionPoints(records) {
  return records.map(({id,lat,lng,title,outsideArea,rank,scenario,quadrantId})=>({
    id,lat,lng,label:title,inArea:!outsideArea,highlighted:Boolean(rank),scenario,quadrantId
  }));
}
function spatialLabel(ids) {
  if(ids===null)return 'Toda la comuna';
  if(!ids.length)return 'Ningún subcuadrante';
  if(ids.length<=4)return ids.join(' · ');
  const count=unitIds(ids).size;
  return `${ids.length} subcuadrantes · ${count} ${count===1?'unidad':'unidades'}`;
}
function areaTitle(ids) {
  if(!ids.length)return 'Ningún subcuadrante seleccionado';
  if(ids.length===1)return `Subcuadrante ${ids[0]}`;
  const units=unitIds(ids);
  const [unit]=units;
  if(units.size===1&&district.byUnit.get(unit).children.length===ids.length)return `Unidad vecinal ${unit}`;
  return 'Subcuadrantes seleccionados';
}
function densityPixels(surface,camera,max,muted=false) {
  const source=document.createElement('canvas');source.width=surface.width;source.height=surface.height;
  const small=source.getContext('2d'),pixels=small.createImageData(surface.width,surface.height);
  const palette=camera?cameraHeatPalette:robberyHeatPalette;
  for(let i=0;i<surface.values.length;i++) {
    const value=max>0?Math.min(1,Math.pow(Math.max(0,surface.values[i])/max,surface.colorExponent??.65)):0;
    const offset=i*4;
    pixels.data.set(muted?excludedAreaColor:palette[Math.round(value*255)],offset);
    pixels.data[offset+3]=muted?(camera?0:18)+148*value
      :camera?255*Math.min(1,value*1.7):155+100*value;
  }
  small.putImageData(pixels,0,0);
  return source;
}
function densityImage(surface,camera=false,quadrantIds=null,communeSurface=surface,max=communeSurface.max) {
  const image=document.createElement('canvas');image.width=1024;image.height=512;
  const context=image.getContext('2d'),[west,south,east,north]=surface.projectedBounds,shape=new Path2D();
  const pixel=(lng,lat)=>{
    const [x,y]=projectSecurityPoint(lng,lat);
    return [(x-west)/(east-west)*image.width,(north-y)/(north-south)*image.height];
  };
  function addRings(path,polygons) {
    for(const polygon of polygons)for(const ring of polygon) {
      ring.forEach(([lng,lat],i)=>{const [x,y]=pixel(lng,lat);if(i===0)path.moveTo(x,y);else path.lineTo(x,y);});
      path.closePath();
    }
  }
  addRings(shape,boundaryPolygons(boundary));
  context.clip(shape,'evenodd');
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  const draw=(data,muted=false)=>context.drawImage(densityPixels(data,camera,max,muted),0,0,image.width,image.height);
  if(quadrantIds===null){
    draw(surface);
  }else{
    if(communeSurface.includedCount)draw(communeSurface,true);
    const mask=new Path2D();
    for(const id of quadrantIds)addRings(mask,district.byId.get(id).polygons);
    context.clip(mask,'evenodd');
    if(quadrantIds.length){
      context.clearRect(0,0,image.width,image.height);
      draw(surface);
    }
  }
  return image.toDataURL('image/png');
}
export async function createAnalysisView(container,{map,onChange=()=>{},onCompanion=()=>{}}={}) {
  let destroyed=false,loaded=false,failure='',activeCategory='security',compareCategory=null,hoverTimer=null,hoverAnchor=null,hoverDetails=null;
  let pinned=false,displayedAnchor=null,restoreFocus=null,dismissedAnchor=null,resourceError='',resourcesReady=false;
  let timelineFrames=null,timelineActive=false,suppressTimelineFrame=false;
  let forecastTrigger=null, forecastPointerDown=null, forecastViewport=null;
  let forecastRasters=null, companionContext=null, companionAnalysis=null;
  let rankingSettings={}, rankingSource=null, rankingView=null;
  let quadrantIds=null, mapPointerStart=null;
  const quadrantCache=new WeakMap();
  const recordQuadrant=record=>{
    if(!quadrantCache.has(record))quadrantCache.set(record,classifyAnalysisQuadrant(record,district));
    return quadrantCache.get(record);
  };
  const withinScope=(record,selected)=>selected===null||selected.has(recordQuadrant(record));
  function inQuadrants(records,ids=quadrantIds) {
    if(ids===null)return records;
    if(!ids.length)return [];
    const selected=new Set(ids);
    return records.filter(record=>withinScope(record,selected));
  }
  const abort=new AbortController(),datasets={},panels={};
  const crossed=()=>compareCategory!==null, selection=()=>({primary:activeCategory,compare:compareCategory});
  const defaultOpacity=(kind, compare=false)=>kind==='security'?(compare ? .45 : .62):kind==='cameras'&&datasets.cameras?.display==='heatmap'?(compare ? .55 : .62):.9;
  for(const layer of ANALYSIS_LAYERS){
    const kind=layer.id;
    datasets[kind]={records:[],filtered:[],mapPoints:[],metadata:null,filters:{...(resourceDefaults[kind]??defaults[kind])},summary:{total:0},surface:null,image:null,dateRange:null,areaDetails:new Map(),communeCache:new Map(),temporalMode:'all',selectedYear:'2025',selectedMonth:'12',display:kind==='security'?'heatmap':'points',opacity:defaultOpacity(kind)};
  }
  const overlay=document.createElement('section');overlay.className='analysis-experience';overlay.dataset.theme='seguridad';overlay.dataset.state='loading';overlay.setAttribute('aria-label','Análisis territorial');container.append(overlay);
  for(const layer of ANALYSIS_LAYERS){
    const kind=layer.id;
    panels[kind]=createAnalysisPanel(overlay,container,layer,{
      filters:values=>setDatasetFilters(kind,values),mode:mode=>setTemporalMode(mode,kind),forecast:openForecast,
      reset:()=>setDatasetFilters('security',{year:'all',month:'all',period:'all'}),
      toggleQuadrant,toggleUnit,clearQuadrants:()=>setQuadrants(null),emptyQuadrants:()=>setQuadrants([]),
      category:(next,anchor)=>{
        const focused=document.activeElement===anchor;
        if(setCategory(next)&&focused){
          document.getElementById(`${getAnalysisLayer(next).prefix}-category-${next}`)?.focus({preventScroll:true});
        }
      },
      cameraType:value=>setDatasetFilters('cameras',{type:toggleCameraType(datasets.cameras.filters.type,value)},{keepPicker:true}),robbery:value=>setDatasetFilters('security',{robbery:toggleSecurityRobberyType(datasets.security.filters.robbery,value)},{keepPicker:true}),display:setCameraDisplay,resourceFilters:values=>setResourceFilters(kind,values),catalog:openCatalog,locate:locateResource,opacity:value=>setOpacity(kind,value),clearHover:key=>{
        if(key==='area'||key==='companion')playback.pause();
        catalog.close();
        for(const [id,panel] of Object.entries(panels))if(id!==kind)panel.closePicker();
        clearHover();
      },playback:togglePlayback,seek:seekPlayback,companionRanking:setCompanionRanking
    });
  }
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
  const catalog=createLayerPicker(overlay,container,{selection,onSelect:(kind,role)=>{
    if(role==='compare')setCrossDataset(kind);else setCategory(kind);
    const layer=role==='compare'?compareCategory:activeCategory;
    return document.getElementById(`${getAnalysisLayer(layer).prefix}-layers`);
  }});
  const crossClose=el('button','analysis-comparison-close','Quitar comparación');crossClose.type='button';crossClose.id='analysis-cross-close';crossClose.onclick=()=>{
    closeCross();document.getElementById(`${getAnalysisLayer(activeCategory).prefix}-cross`)?.focus({preventScroll:true});
  };
  const inspector=createAnalysisInspector(dismissDetails);
  const quadrantSelector=createAnalysisQuadrantSelector(container,{map,quadrants:district,
    resourceAnchors:()=>resourceMarkers.labelObstacles()});
  const resourceMarkers=createResourceMarkers(container,{map,onLayout:()=>quadrantSelector.refreshLabels(),onSelect:(record,event)=>{
      if(forecast.active){
        if(forecast.isPlacing||forecast.isSelectingScope)return;
        forecast.remove(record.id);
        if(event.detail===0)forecast.panel.querySelector(`#forecast-add-${record.kind}`)?.focus({preventScroll:true});
      }else showResource(record,{pin:true,anchor:event.currentTarget});
    },
    onHover:(record,event)=>{
      if(forecast.active){forecast.inspect(record);return;}
      if(catalog.isOpen)return;
      const anchor=event.currentTarget;
      if(event.type==='focus'&&anchor.matches(':focus-visible')){
        const rect=anchor.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
        if(!anchor.contains(document.elementFromPoint(x,y))){
          const outer=container.getBoundingClientRect(),{min,max}=visibleMapBounds();
          const visibleHeight=outer.width<=760
            ? panels[activeCategory].element.getBoundingClientRect().top-outer.top : outer.height;
          map.pan(outer.left+(min+max)/2-x,outer.top+visibleHeight/2-y);
          requestAnimationFrame(()=>{
            if(!destroyed&&document.activeElement===anchor){
              showResource(record,{anchor});
            }
          });
          return;
        }
      }
      if(!pinned)showResource(record,{anchor});
    }});
  const forecastImages=new WeakMap();
  function forecastLayer(surface, ids){
    if(ids?.length===0)return null;
    let images=forecastImages.get(surface);
    if(!images){images=new Map();forecastImages.set(surface,images);}
    const key=ids===null?'commune':ids.join(',');
    if(!images.has(key)){
      if(images.size>=8)images.delete(images.keys().next().value);
      images.set(key,{url:densityImage(surface,false,ids),bounds:surface.bounds,opacity:.66});
    }
    return images.get(key);
  }
  function forecastAreaLabel(ids){
    const title=ids?.length?areaTitle(ids):'';
    return title&&title!=='Subcuadrantes seleccionados'?title:spatialLabel(ids);
  }
  const forecast=createForecastView(overlay,container,{
    map,signal:abort.signal,inside,quadrantOf:recordQuadrant,units:district.units,
    normalizeArea:ids=>normalizeAnalysisQuadrants(ids,district),areaLabel:forecastAreaLabel,
    onExit:closeForecast,onScopeChange:()=>paintQuadrants(),onChange:publishForecastCompanion,
    renderSurface:(before,after,ids,showAfter)=>{
      forecastRasters={before:forecastLayer(before,ids),after:forecastLayer(after,ids)};
      const raster=showAfter?forecastRasters.after:forecastRasters.before;
      map.setAnalysisLayer(raster&&{...raster,transitionMs:200});
    },
    renderPlacements:points=>resourceMarkers.render(points)
  });
  const playback=createAnalysisPlayback({
    onFrame:renderTimelineFrame,
    onStateChange:()=>{if(!destroyed&&!suppressTimelineFrame){updatePanels();onChange({reason:'playback',...info()});}}
  });
  function visible(kind){return activeCategory===kind||compareCategory===kind;}
  function showsResourcePoints(kind){
    return kind!=='security'&&datasets[kind].display==='points';
  }
  function visibleUnitRobberies(){
    return loaded&&!forecast.active&&visible('security')?datasets.security.unitRobberies??null:null;
  }
  function unitRobberyLabel(quadrant){
    const unit=district.byId.get(quadrant)?.unit;
    const count=visibleUnitRobberies()?.[unit];
    return unit&&Number.isFinite(count)?`Unidad ${unit} · ${number(count)} ${count===1?'robo':'robos'}`:'';
  }
  function paintQuadrants(preview=null){
    quadrantSelector.update({selected:forecast.active?forecast.scopeIds:quadrantIds,visible:loaded,preview});
  }
  function updatePanels(){
    const robberyUnits=visibleUnitRobberies(),security=datasets.security;
    const robberyTotals=robberyUnits?{units:robberyUnits,parts:security.quadrantRobberies,
      areaTotal:security.summary.total,period:companionCut('security',security.filters,security.dateRange).period}:null;
    overlay.dataset.crossed=String(!forecast.active&&crossed());
    overlay.dataset.category=activeCategory;
    for(const [kind,panel] of Object.entries(panels)){
      const resource=getAnalysisLayer(kind).resource;
      const dataset=datasets[kind];
      panel.update({...dataset,units:district.units,robberyTotals,quadrantIds,spatialLabel:spatialLabel(quadrantIds),loaded:resource?resourcesReady:loaded,error:resource?resourceError:failure,canChoose:loaded,visible:!forecast.active&&visible(kind),side:activeCategory===kind?'left':'right',crossed:crossed(),datasetCount:dataset.records.length,playback:kind==='security'?playback.info():null});
    }
    const dock=panels[activeCategory].inspectorSlot;
    if(inspector.element.parentNode!==dock)dock.append(inspector.element);
    if(crossed()){
      const slot=panels[compareCategory].comparisonSlot;
      if(crossClose.parentNode!==slot)slot.append(crossClose);
    }else crossClose.remove();
    paintQuadrants();
    publishCompanion();
  }
  function openForecast(trigger){
    if(!loaded||destroyed||forecast.active)return;
    forecastTrigger=trigger;
    const {center,zoom}=map.info();
    if(center&&Number.isFinite(zoom))forecastViewport={center,zoom};
    playback.pause();clearHover();closeAllPickers();catalog.close();
    forecastRasters=null;map.setAnalysisLayer(null);map.clearCameraAnalysisLayer();resourceMarkers.render([]);
    forecast.open(quadrantIds);updatePanels();
    if(quadrantIds===null)map.home();
    forecast.panel.querySelector('h1').focus({preventScroll:true});
  }
  function closeForecast(){
    forecast.close();forecastPointerDown=null;
    updatePanels();renderLayers();
    if(forecastViewport)map.focus(forecastViewport.center,forecastViewport.zoom,{animate:false});
    else map.home();
    forecastViewport=null;
    forecastTrigger?.focus({preventScroll:true});forecastTrigger=null;
  }
  function closeAllPickers(){Object.values(panels).forEach(p=>p.closePicker());}
  function openCatalog(role,anchor){closeAllPickers();clearHover();catalog.open(role,anchor);}
  function cancelPendingHover(){
    clearTimeout(hoverTimer);hoverTimer=null;hoverAnchor=displayedAnchor;
  }
  const pointerMove=event=>{
    if(event.pointerType&&event.pointerType!=='mouse'||pinned)return;
    if(event.buttons){clearHover();return;}
    if(isMapControl(event.target)||event.target.closest?.('.analysis-resource-marker')){cancelPendingHover();return;}
    const b=container.getBoundingClientRect();
    setHoverPoint({x:event.clientX-b.left,y:event.clientY-b.top,source:'mouse'});
  };
  const pointerLeave=()=>{
    cancelPendingHover();
    if(forecast.active){paintQuadrants();forecast.inspect(null);}
  },outsidePicker=event=>{
    const target=event.target;
    if(!target.closest?.('.analysis-layer-picker,.analysis-layer-trigger,.analysis-compare'))catalog.close(false);
    if(!target.closest?.('.analysis-date-popover,.analysis-quadrant-filter,.analysis-date-selection,.analysis-filter-date,.analysis-camera-filters,.analysis-robbery-filter,.analysis-companion-trigger'))closeAllPickers();
  },keyDown=event=>{
    if(event.key!=='Escape')return;
    if(forecast.active){forecast.cancel();paintQuadrants();return;}
    if(catalog.close())return;
    closeAllPickers();dismissDetails();
  };
  const mapPointerDown=event=>{
    if(isMapControl(event.target))return;
    const point={x:event.clientX,y:event.clientY};
    if(forecast.active)forecastPointerDown=point;
    else mapPointerStart=point;
  };
  const mapClick=event=>{
    if(!loaded||event.button!==0||event.defaultPrevented||!event.target.closest?.('#map')||isMapControl(event.target))return;
    const b=container.getBoundingClientRect(),x=event.clientX-b.left,y=event.clientY-b.top;
    const location=map.screenToLocation(x,y);
    if(forecast.active){
      const start=forecastPointerDown;
      forecastPointerDown=null;
      if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)<8)forecast.click(location);
      return;
    }
    const start=mapPointerStart;
    mapPointerStart=null;
    if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>=8)return;
    const quadrant=location&&classifyAnalysisQuadrant(location,district);
    if(quadrant)toggleQuadrant(quadrant);
  };
  container.addEventListener('pointermove',pointerMove,true);container.addEventListener('pointerleave',pointerLeave);document.addEventListener('pointerdown',outsidePicker,true);document.addEventListener('keydown',keyDown);
  container.addEventListener('pointerdown',mapPointerDown);container.addEventListener('click',mapClick);
  const visibilityChange=()=>{if(document.hidden)playback.pause();};
  document.addEventListener('visibilitychange',visibilityChange);
  const unsubscribeView=map.onViewChange?.(()=>{clearHover({keepPinned:true});closeAllPickers();catalog.close();});map.setAnalysisMode(true);updatePanels();map.home();
  const ready=(async()=>{
    const resource=async(url,format)=>{const r=await fetch(assetUrl(url),{signal:abort.signal});if(!r.ok)throw new Error('No se pudo cargar la base de análisis.');return format==='json'?r.json():r.text();};
    const [securityCSV,securityMeta,cameraCSV,cameraMeta,usageByYear,fixedHistory,resources]=await Promise.all([resource('/analysis/seguridad-simulada.csv'),resource('/analysis/metadata.json','json'),resource('/analysis/camaras-seguridad.csv'),resource('/analysis/camaras-metadata.json','json'),
      resource('/analysis/pulsaciones-botones.csv').then(parseAlarmUsage).catch(()=>new Map()),
      resource('/analysis/estado-puntos-fijos.csv').then(parseFixedPointHistory).catch(()=>new Map()),
      Promise.all([
        resource('/analysis/recursos-seguridad.json','json').then(value=>readSecurityResources(value,inside)),
        resource('/analysis/recursos-simulados.csv').then(parseSimulatedSecurityResources).catch(()=>[])
      ]).then(([documented, simulated])=>{
        try { return readSecurityResources([...documented,...simulated],inside); }
        catch { return documented; }
      }).catch(error=>{
        if(error.name!=='AbortError')console.error('No se pudieron cargar las ubicaciones.',error);
        resourceError='No se pudieron cargar las ubicaciones.';
        return [];
      })]);
    if(destroyed)return;datasets.security.records=parseSecurityCSV(securityCSV);datasets.security.metadata=securityMeta;datasets.cameras.records=parseCameraCSV(cameraCSV);datasets.cameras.metadata=cameraMeta;
    for(const kind of ['security','cameras']){
      const d=datasets[kind];
      if(d.records.length!==d.metadata.cantidad)throw new Error('La base está incompleta.');
      d.records.forEach(recordQuadrant);
    }
    for(const layer of ANALYSIS_LAYERS.filter(layer=>layer.resource)){
      const d=datasets[layer.id];
      d.historyByYear=layer.id==='alarms'?usageByYear:fixedHistory;
      d.records=resources.filter(record=>record.kind===layer.id).map(record=>({
        ...record,firstInventoryYear:ANALYSIS_YEARS.find(year=>d.historyByYear.get(year)?.has(record.id))
      }));
      d.filters.year=latestResourceYear(d);
      if(d.filters.year)d.temporalMode='year';
      filterResources(layer.id,d);
    }
    resourcesReady=!resourceError;
    loaded=true;setDatasetFilters('security',defaults.security);setDatasetFilters('cameras',defaults.cameras);onChange({reason:'ready',...info()});
  })().catch(error=>{if(destroyed||error.name==='AbortError')return;failure='No se pudieron cargar los datos.';overlay.dataset.state='error';updatePanels();throw error;});ready.catch(()=>{});
  function datasetInfo(kind){const d=datasets[kind],s=d.surface,layer=getAnalysisLayer(kind);return{ready:layer.resource?resourcesReady:loaded,error:layer.resource?resourceError:failure,datasetCount:d.records.length,filteredCount:d.summary.total,filters:Object.fromEntries(Object.entries(d.filters).map(([key,value])=>[key,Array.isArray(value)?[...value]:value])),temporalMode:d.temporalMode,picker:panels[kind].picker,dateRange:d.dateRange,category:layer.label,display:d.display,opacity:d.opacity,summary:{...d.summary},surface:s?{width:s.width,height:s.height,max:s.max,bounds:s.bounds,projectedBounds:s.projectedBounds,includedCount:s.includedCount,excludedCount:s.excludedCount,bandwidthMetres:s.bandwidthMetres,colorExponent:.65,imageWidth:1024,imageHeight:512,coverage:quadrantIds===null?'límite comunal completo':quadrantIds.length?'cuadrantes seleccionados':'ningún subcuadrante'}:null};}
  function info(){return{...datasetInfo(activeCategory),isOpen:!destroyed,activeCategory,compareCategory,crossed:crossed(),quadrantIds:quadrantIds===null?null:[...quadrantIds],simulated:true,playback:playback.info(),hover:hoverDetails?{...hoverDetails,pinned}:null,datasets:Object.fromEntries(ANALYSIS_LAYERS.map(layer=>[layer.id,datasetInfo(layer.id)]))};}
  function securityArea(d,ids=quadrantIds) {
    const key=ids===null?'commune':ids.join(',');
    if(!d.areaDetails.has(key)){
      const details=summarizeSecurityArea(inQuadrants(d.filtered,ids),d.dateRange.end);
      const [,hoursLabel]=SECURITY_CHOICES.period.find(([value])=>value===d.filters.period);
      let lastIncident=null;
      if(details.lastIncident){
        const {id,fecha,hora,direccion,tipo_incidente,lat,lng}=details.lastIncident;
        lastIncident={id,fecha,hora,direccion,tipo_incidente,lat,lng};
      }
      d.areaDetails.set(key,{...details,lastIncident,communeTotal:d.communeTotal,
        period:`${d.dateRange.label} · ${hoursLabel}`,areaLabel:spatialLabel(ids)});
    }
    return d.areaDetails.get(key);
  }
  function areaDetails(ids){
    return {
      label:spatialLabel(ids),quadrantIds:ids===null?null:[...ids],
      security:visible('security')&&datasets.security.dateRange?securityArea(datasets.security,ids):null,
      cameras:visible('cameras')?summarizeCameraRecords(inQuadrants(datasets.cameras.filtered,ids)):null,
      resources:Object.fromEntries(ANALYSIS_LAYERS.filter(layer=>layer.resource&&visible(layer.id)).map(({id})=>{
        const dataset=datasets[id],points=ids===quadrantIds?dataset.filtered:inQuadrants(dataset.filtered,ids);
        const detail=id==='fixed'?{monitoring:points.filter(record=>record.monitoringStatus==='monitoreando').length}
          :dataset.historyByYear?.has(dataset.filters.year)?{activations:totalActivations(points)}:{};
        return [id,{total:points.length,...detail}];
      }))
    };
  }
  function companionLayer(kind){
    const dataset=datasets[kind],layer=getAnalysisLayer(kind);
    return {kind,title:layer.label,...companionCut(kind,dataset.filters,dataset.dateRange),
      records:dataset.filtered,filters:dataset.filters,filterLabels:companionFilters(kind,dataset.filters),
      display:dataset.display==='heatmap'?'Mapa de calor':'Puntos',opacity:dataset.opacity,
      summary:dataset.summary,ready:layer.resource?resourcesReady:Boolean(dataset.dateRange),
      error:layer.resource?resourceError:failure};
  }
  function contextFor(layer){
    const kind=layer.kind==='security'?'cameras':'security';
    const reference=layer.kind==='security' || layer.kind==='cameras'
      ? {year:layer.filters.year,month:layer.filters.month} : {year:layer.filters.year??'all',month:'all'};
    const filters={...defaults[kind],...reference};
    const dataset=datasets[kind];
    if(!dataset.dateRange)return null;
    const key=JSON.stringify([kind,reference,quadrantIds]);
    if(companionContext?.key===key)return companionContext.layer;
    const filtered=kind==='cameras'?filterCameraRecords(dataset.records,filters,dataset.metadata)
      :filterSecurityRecords(dataset.records,filters);
    const context={kind,context:true,records:inQuadrants(filtered),filters,ready:true,
      ...companionCut(kind,filters,getSecurityDateRange(filters,dataset.metadata))};
    companionContext={key,layer:context};
    return context;
  }
  function companionInsights(layers){
    const reference=layers.length===1&&layers[0].ready?contextFor(layers[0]):null;
    const inputs=reference?[...layers,reference]:layers;
    const unchanged=companionAnalysis?.ids===quadrantIds&&companionAnalysis.layers.length===inputs.length
      &&inputs.every((layer,index)=>{
        const before=companionAnalysis.layers[index];
        return layer.kind===before.kind&&layer.records===before.records&&layer.period===before.period&&layer.ready===before.ready;
      });
    if(!unchanged)companionAnalysis={ids:quadrantIds,layers:inputs,value:buildCompanionAnalysis({
      layers:inputs.map(layer=>({...layer,filtered:Boolean(layer.filterLabels?.length)
        ||layer.kind==='security'&&layer.filters.period!=='all'})),
      quadrantIds,allQuadrantIds,quadrantOf:recordQuadrant,quadrantAreaM2:id=>district.byId.get(id)?.areaM2
    })};
    return companionAnalysis.value;
  }
  function territoryLayer(kind){
    const {display,image,surface,opacity,mapPoints}=datasets[kind];
    if(kind==='security'&&timelineActive&&timelineFrames){
      const {period,nextPeriod,mix,durationMs,playing}=playback.info();
      const {previous,next}=analysisBlendOpacity(opacity,mix);
      const rasters=[[timelineFrames[period],previous],[timelineFrames[nextPeriod],next]].map(([frame,alpha])=>({
        url:frame.image,bounds:frame.surface.bounds,opacity:alpha
      }));
      return {kind,mode:display,opacity,rasters,blend:{opacity,mix,durationMs:durationMs/4,playing,startedAt:Date.now()}};
    }
    const rasters=display==='heatmap'&&image&&surface?[{url:image,bounds:surface.bounds,opacity}]:[];
    return {kind,mode:display,opacity,rasters,points:showsResourcePoints(kind)?companionPoints(mapPoints):[]};
  }
  function publishForecastCompanion(state){
    if(destroyed)return;
    const infrastructure=Object.entries({camera:'cámaras',fixed:'casetas'}).flatMap(([kind,label])=>{
      const points=companionPoints(state.placements.filter(point=>point.kind===kind)
        .map(point=>({...point,scenario:true,title:label})));
      return points.length?[{kind:kind==='camera'?'cameras':kind,mode:'points',points}]:[];
    });
    const heat=raster=>raster?[{kind:'security',mode:'heatmap',rasters:[raster]}]:[];
    const territory={quadrantIds:forecast.scopeIds,areaLabel:state.areaLabel,
      before:heat(forecastRasters?.before),after:[...heat(forecastRasters?.after),...infrastructure],
      focusQuadrantId:state.local?.id};
    onCompanion({mode:'forecast',forecast:state,territory});
  }
  function resolveRanking(){
    rankingView=resolveCompanionRanking(rankingSource,rankingSettings);
  }
  function setCompanionRanking(change){
    clearHover({keepCompanion:true});
    rankingSettings={...rankingSettings,...change};
    resolveRanking();
    publishCompanion();
  }
  function companionRanking(insights){
    const source=insights.cross??insights.ranking;
    if(source!==rankingSource){
      rankingSource=source;
      rankingSettings={...rankingSettings,page:0};
      resolveRanking();
    }
    for(const [kind,panel] of Object.entries(panels))panel.setCompanionRanking(kind===activeCategory?rankingView:null);
    if(!rankingView)return null;
    const {level,order,page}=rankingView;
    return {level,order,page};
  }
  function publishCompanion() {
    if(destroyed)return;
    if(forecast.active){publishForecastCompanion(forecast.info());return;}
    if(!loaded){onCompanion({mode:'idle'});return;}
    const record=hoverDetails?.record;
    const kind=record?.kind??activeCategory;
    const dataset=datasets[kind];
    const ids=compareCategory?[activeCategory,compareCategory]:[activeCategory];
    const layers=ids.map(companionLayer);
    const scope=areaDetails(quadrantIds);
    const sector=hoverDetails??(quadrantIds===null?null:scope);
    const title=quadrantIds===null?getAnalysisLayer(activeCategory).label:areaTitle(quadrantIds);
    const territory={quadrantIds,areaLabel:scope.label,layers:ids.map(territoryLayer),
      focus:record?{lat:record.lat,lng:record.lng,label:record.title}:null,
      focusQuadrantId:hoverDetails?.quadrantIds?.[0]??null};
    const insights=companionInsights(layers);
    onCompanion({
      mode:record?'resource':sector?'sector':'summary',kind,title,
      period:record?(dataset.dateRange?.label??dataset.filters.year):crossed()?null:layers[0].period,
      resource:record,sector,inspected:Boolean(hoverDetails),overview:scope,
      filters:dataset.filters,dateRange:dataset.dateRange,summary:dataset.summary,
      layers:layers.map(({records,...layer})=>layer),territory,insights,ranking:companionRanking(insights)
    });
  }
  function prepareTimelineFrames(){
    if(timelineFrames)return;
    const d=datasets.security;
    timelineFrames=Object.fromEntries(SECURITY_CHOICES.period.slice(1).map(([period])=>{
      return [period,mapDataset('security',{...d.filters,period},false)];
    }));
    const frames=Object.values(timelineFrames),max=Math.max(...frames.map(frame=>frame.communeSurface.max));
    for(const frame of frames){
      frame.image=densityImage(frame.surface,false,quadrantIds,frame.communeSurface,max);
    }
  }
  function renderTimelineFrame(state){
    if(destroyed||!loaded||forecast.active||suppressTimelineFrame||!visible('security'))return;
    prepareTimelineFrames();
    const d=datasets.security,frame=timelineFrames[state.period],changed=!timelineActive||d.filters.period!==state.period;
    timelineActive=true;d.filters={...d.filters,period:state.period};Object.assign(d,frame);
    renderLayers('security');
    if(changed){clearHover();updatePanels();onChange({reason:'timeline',automatic:true,...info()});}
    else panels.security.updatePlayback(state);
  }
  function renderLayers(changedKind=null,transitionMs=0){
    if(forecast.active)return;
    const s=datasets.security,c=datasets.cameras;
    if(changedKind!=='cameras'){
      if(visible('security')&&timelineActive&&timelineFrames){
        const state=playback.info(),from=timelineFrames[state.period],to=timelineFrames[state.nextPeriod];
        map.setAnalysisFrame({from:{url:from.image,bounds:from.surface.bounds},to:{url:to.image,bounds:to.surface.bounds},opacity:s.opacity,progress:state.mix});
      }else map.setAnalysisLayer(visible('security')&&s.image?{url:s.image,bounds:s.surface.bounds,opacity:s.opacity,transitionMs}:null);
    }
    if(changedKind!=='security'){if(visible('cameras')&&c.surface)map.setCameraAnalysisLayer({url:c.display==='heatmap'?c.image:null,bounds:c.surface.bounds,points:c.filtered,mode:c.display,opacity:c.opacity});else map.clearCameraAnalysisLayer();}
    if(changedKind!=='security')renderResources();
  }
  function renderResources(){
    const points=ANALYSIS_LAYERS.filter(({id})=>visible(id)&&showsResourcePoints(id)).flatMap(({id})=>{
      const {mapPoints,opacity}=datasets[id];return mapPoints.map(record=>({...record,opacity}));
    });
    resourceMarkers.render(points);
  }
  function latestResourceYear(dataset){
    return ANALYSIS_YEARS.findLast(year=>dataset.historyByYear.has(year))??null;
  }
  function filterResources(kind,dataset){
    const history=dataset.historyByYear.get(dataset.filters.year);
    const locations=history?dataset.records.filter(record=>history.has(record.id)):dataset.records;
    const selected=quadrantIds===null?null:new Set(quadrantIds);
    const points=locations.map(record=>({
      ...record,
      outsideArea:!withinScope(record,selected),
      quadrantId:recordQuadrant(record),
      ...(kind==='fixed'?{monitoringStatus:history?.get(record.id)}:{activations:history?.get(record.id)??null})
    }));
    const included=points.filter(record=>!record.outsideArea);
    dataset.filtered=included;
    dataset.mapPoints=points;
    if(kind==='alarms'){
      const ranked=mostUsedAlarmButtons(included,ALARM_RANK_MAX);
      dataset.rankCount=ranked.length;
      if(dataset.filters.usage==='top'){
        dataset.filtered=ranked.slice(0,dataset.filters.limit).map((record,index)=>({...record,rank:index+1}));
        const outside=mostUsedAlarmButtons(points.filter(record=>record.outsideArea),dataset.filters.limit);
        dataset.mapPoints=[...dataset.filtered,...outside];
      }
    }
    const simulated=dataset.filtered.filter(record=>record.simulated).length;
    dataset.summary={total:dataset.filtered.length,documented:dataset.filtered.length-simulated,simulated};
    if(kind==='fixed')dataset.summary.monitoring=dataset.filtered.filter(record=>record.monitoringStatus==='monitoreando').length;
    if(kind==='alarms'&&history)dataset.summary.activations=totalActivations(dataset.filtered);
  }
  function mapDataset(kind,filters,withImage=true){
    const dataset=datasets[kind],camera=kind==='cameras',cache=dataset.communeCache;
    const key=JSON.stringify(filters);
    if(!cache.has(key)){
      const records=camera?filterCameraRecords(dataset.records,filters,dataset.metadata):filterSecurityRecords(dataset.records,filters);
      let unitRobberies=null,quadrantRobberies=null;
      if(!camera){
        unitRobberies=Object.fromEntries(district.units.map(unit=>[unit.id,0]));
        quadrantRobberies=Object.fromEntries(allQuadrantIds.map(id=>[id,0]));
        for(const record of records){
          const quadrant=district.byId.get(recordQuadrant(record));
          if(!quadrant)continue;
          unitRobberies[quadrant.unit]++;
          quadrantRobberies[quadrant.id]++;
        }
      }
      if(cache.size>=5)cache.delete(cache.keys().next().value);
      cache.set(key,{records,unitRobberies,quadrantRobberies,communeSurface:buildDensitySurface(records,boundary)});
    }
    const {records,unitRobberies,quadrantRobberies,communeSurface}=cache.get(key);
    const filtered=inQuadrants(records);
    const surface=filtered.length===records.length?communeSurface:buildDensitySurface(filtered,boundary);
    const selected=quadrantIds===null?null:new Set(quadrantIds);
    const mapPoints=camera?records.map(record=>({
      ...record,kind:'cameras',title:'Cámara '+record.tipo_camara.toLowerCase(),address:record.direccion,
      outsideArea:!withinScope(record,selected),quadrantId:recordQuadrant(record)
    })):[];
    return {filtered,communeTotal:records.length,summary:camera?summarizeCameraRecords(filtered):{total:filtered.length},
      areaDetails:new Map(),surface,communeSurface,mapPoints,
      image:withImage?densityImage(surface,camera,quadrantIds,communeSurface):null,unitRobberies,quadrantRobberies};
  }
  function refreshMapDataset(kind){
    const d=datasets[kind];
    Object.assign(d,mapDataset(kind,d.filters));
  }
  function setQuadrants(ids){
    if(!loaded||destroyed||forecast.active)return false;
    let next;
    try{next=normalizeAnalysisQuadrants(ids,district);}catch{return false;}
    if(next?.join(',')===quadrantIds?.join(','))return false;
    quadrantIds=next;
    clearHover({keepCompanion:true});
    for(const panel of Object.values(panels))if(panel.picker!=='area')panel.closePicker();
    const resume=playback.info().playing;
    const keepTimeline=timelineActive;
    suppressTimelineFrame=true;
    try{playback.pause();}finally{suppressTimelineFrame=false;}
    timelineFrames=null;timelineActive=false;
    refreshMapDataset('security');
    refreshMapDataset('cameras');
    for(const {id,resource} of ANALYSIS_LAYERS)if(resource)filterResources(id,datasets[id]);
    updatePanels();renderLayers();
    if(resume&&visible('security'))playback.start();
    else if(keepTimeline&&visible('security'))renderTimelineFrame(playback.info());
    onChange({reason:'quadrants',...info()});
    return true;
  }
  function toggleQuadrant(id){
    return district.byId.has(id)&&setQuadrants(toggleAnalysisArea(quadrantIds,[id]));
  }
  function toggleUnit(id){
    const unit=district.byUnit.get(id);
    return Boolean(unit?.children.length)&&setQuadrants(toggleAnalysisArea(quadrantIds,unit.children.map(part=>part.id)));
  }
  function setResourceFilters(kind,values,{redraw=true}={}){
    const dataset=datasets[kind];
    if(destroyed||!resourcesReady)return;
    const next={...dataset.filters,...values};
    if(next.year!==null&&!dataset.historyByYear.has(next.year))return;
    if(kind==='alarms'){
      if(!['all','top'].includes(next.usage)||!Number.isInteger(next.limit))return;
      next.limit=Math.max(1,Math.min(ALARM_RANK_MAX,next.limit));
    }
    if(Object.keys(next).every(key=>next[key]===dataset.filters[key]))return;
    clearHover();
    dataset.filters=next;
    filterResources(kind,dataset);
    if(redraw){
      renderResources();
      updatePanels();
      onChange({reason:'filters',dataset:kind,...info()});
    }
  }
  function togglePlayback(){if(!loaded||destroyed||!visible('security'))return false;closeAllPickers();clearHover();prepareTimelineFrames();return playback.toggle();}
  function seekPlayback(position){if(!loaded||destroyed||!visible('security'))return false;clearHover();prepareTimelineFrames();return playback.seek(position);}
  function setDatasetFilters(kind,values={}, {keepPicker=false,redraw=true}={}) {
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
    refreshMapDataset(kind);
    if(redraw){
      if(retainTimeline)renderTimelineFrame(playback.info());else renderLayers(kind,transitionMs);
      updatePanels();overlay.dataset.state='ready';onChange({reason:'filters',dataset:kind,...info()});
    }
    return true;
  }
  function setTemporalMode(mode,kind='security'){
    if(!loaded||!['all','year','month'].includes(mode)||!defaults[kind])return false;
    const dataset=datasets[kind];
    if(dataset.temporalMode!==mode)setDatasetFilters(kind,{
      year:mode==='all'?'all':dataset.selectedYear,
      month:mode==='month'?dataset.selectedMonth:'all'
    });
    if(mode==='month')panels[kind].openPicker('month');
    return true;
  }
  function changeSelection(next,reason){
    if(!loaded||destroyed||!next)return false;
    const layoutChanged=crossed()!==(next.compare!==null);
    if(next.compare&&next.compare!==compareCategory&&next.compare!==activeCategory){
      const year=datasets[next.primary].filters.year;
      if(ANALYSIS_YEARS.includes(year)&&datasets[next.compare].filters.year!==year){
        if(getAnalysisLayer(next.compare).resource)setResourceFilters(next.compare,{year},{redraw:false});
        else setDatasetFilters(next.compare,{year},{redraw:false});
      }
    }
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
    if(kind==='security')map.setAnalysisOpacity(d.opacity);
    else {
      if(kind==='cameras')map.setCameraAnalysisOpacity(d.opacity);
      renderResources();
    }
    updatePanels();onChange({reason:'opacity',dataset:kind,...info()});return true;
  }
  function clearHover({keepPinned=false,keepCompanion=false}={}){
    if(keepPinned&&pinned)return;
    const hadDetails=Boolean(hoverDetails);
    clearTimeout(hoverTimer);hoverTimer=null;hoverAnchor=null;displayedAnchor=null;hoverDetails=null;pinned=false;restoreFocus=null;dismissedAnchor=null;
    if(hadDetails)resourceMarkers.select(null);
    if(inspector.element.dataset.state!=='idle')inspector.update();
    if(!destroyed)paintQuadrants();
    if(hadDetails&&!keepCompanion)publishCompanion();
  }
  function dismissDetails(){
    const dismissed=displayedAnchor;
    const focus=inspector.element.contains(document.activeElement)?restoreFocus:null;
    clearHover();
    dismissedAnchor=dismissed;
    if(focus?.getClientRects().length)focus.focus({preventScroll:true});
  }
  function isMapControl(element){return Boolean(element?.closest?.('.analysis-panel,.analysis-date-popover,.analysis-timeline-bar,.forecast-readout,.map-tools,#diagnostics,button,a,input,select'));}
  function setHoverPoint(point){
    if(!loaded||destroyed||pinned)return false;
    if(!point){if(hoverAnchor?.source==='hand')cancelPendingHover();return false;}
    if(catalog.isOpen||Object.values(panels).some(p=>p.picker))return false;
    const {x,y}=point,b=container.getBoundingClientRect(),source=point.source||'mouse';
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>b.width||y>b.height){clearHover({keepCompanion:true});return false;}
    const top=document.elementFromPoint(b.left+x,b.top+y);
    if(forecast.active){
      const point=top&&container.contains(top)&&!isMapControl(top)?map.screenToLocation(x,y):null;
      if(forecast.isSelectingScope)paintQuadrants(point&&recordQuadrant(point));
      else forecast.inspect(point);
      return false;
    }
    if(dismissedAnchor){
      if(dismissedAnchor.source===source&&Math.hypot(dismissedAnchor.x-x,dismissedAnchor.y-y)<26)return false;
      dismissedAnchor=null;
    }
    const marker=source==='hand'?resourceMarkers.recordFor(top):null;
    if(marker){
      if(hoverAnchor?.record?.id===marker.id&&hoverAnchor.source===source)return true;
      clearTimeout(hoverTimer);hoverAnchor={x,y,source,record:marker};
      hoverTimer=setTimeout(()=>showResource(marker,{source}),420);
      return true;
    }
    if(!top||!container.contains(top)||isMapControl(top)){cancelPendingHover();return false;}
    const location=map.screenToLocation(x,y);
    const quadrant=location&&classifyAnalysisQuadrant(location,district);
    if(!quadrant){clearHover();return false;}
    if(quadrantIds!==null&&!quadrantIds.includes(quadrant)){
      if(displayedAnchor?.quadrant!==quadrant||hoverDetails){
        clearHover();
        displayedAnchor=hoverAnchor={x,y,source,quadrant,...location};
        inspector.update({type:'preview',label:unitRobberyLabel(quadrant)||'Fuera de la selección',name:areaTitle([quadrant]),detail:'Haz clic para añadirlo.'});
        paintQuadrants(quadrant);
      }
      return true;
    }
    if(hoverAnchor?.source===source&&hoverAnchor.quadrant===quadrant
      &&Math.hypot(hoverAnchor.x-x,hoverAnchor.y-y)<12)return true;
    clearTimeout(hoverTimer);hoverAnchor={x,y,source,quadrant,...location};
    hoverTimer=setTimeout(()=>{
      hoverTimer=null;
      showHover(hoverAnchor);
    },source==='hand'?420:170);return true;
  }
  function pinSector(anchor,trigger=null){
    if(playback.info().playing)playback.pause();
    clearTimeout(hoverTimer);hoverTimer=null;dismissedAnchor=null;pinned=true;restoreFocus=trigger;hoverAnchor=anchor;
    showHover(anchor);
    if(trigger&&trigger.matches(':focus-visible'))inspector.title.focus({preventScroll:true});
  }
  async function locateResource(record,trigger){
    clearHover();
    await map.focus(record,Math.max(16,map.info().zoom||0),{animate:false});
    if(!destroyed&&visible(record.kind))showResource(record,{pin:true,anchor:trigger});
  }
  function showResource(record,{pin=false,anchor=null,source='point'}={}){
    if(!visible(record.kind)||(!pin&&document.activeElement===anchor&&dismissedAnchor?.record?.id===record.id))return;
    const point=map.locationToScreen(record);
    if(!point)return;
    const next={...point,lat:record.lat,lng:record.lng,source,quadrant:recordQuadrant(record),record,trigger:anchor};
    if(pin){
      resourceMarkers.select(record);
      pinSector(next,anchor);
    }
    else {clearTimeout(hoverTimer);hoverTimer=null;hoverAnchor=next;showHover(next);}
  }
  function showHover(anchor){
    if(!anchor||destroyed||!loaded)return;
    if(!anchor.record&&hoverDetails&&!hoverDetails.record&&displayedAnchor?.quadrant===anchor.quadrant){
      displayedAnchor=anchor;
      return;
    }
    displayedAnchor=anchor;
    const area=areaDetails(anchor.quadrant?[anchor.quadrant]:[]);
    hoverDetails={...(area.security||area.cameras),...area,record:anchor.record??null,source:anchor.source,lat:anchor.lat,lng:anchor.lng};
    const point=anchor.record;
    if(point){
      const address=String(point.address??'').replace(' (numeración simulada)','');
      const status=point.kind==='cameras'?point.estado
        :point.kind==='fixed'?MONITORING_STATUS_LABELS[point.monitoringStatus]
        :Number.isInteger(point.activations)?number(point.activations)+' pulsaciones':'';
      const label=point.outsideArea?'Fuera del área seleccionada':pinned?'Ubicación seleccionada':'Vista previa de ubicación';
      inspector.update({type:pinned?'selected':'preview',label,
        name:point.title,detail:[status,address].filter(Boolean).join(' · ')});
    }else{
      const counts=[
        ['security',area.security],['cameras',area.cameras],...Object.entries(area.resources)
      ].filter(([,data])=>data).map(([id,data])=>{
        const layer=getAnalysisLayer(id);
        return number(data.total)+' '+(data.total===1?layer.singular:layer.count);
      });
      inspector.update({type:'preview',label:unitRobberyLabel(anchor.quadrant)||'Vista previa',
        name:areaTitle(area.quadrantIds),detail:counts.join(' · ')});
    }
    paintQuadrants(anchor.quadrant);
    publishCompanion();
  }
  function visibleMapBounds(){
    if (container.clientWidth <= 760) return {min:12,max:container.clientWidth-12};
    const outer=container.getBoundingClientRect(),left=panels[activeCategory].element.getBoundingClientRect(),right=compareCategory?panels[compareCategory].element.getBoundingClientRect():null;
    const tools=container.parentElement.querySelector('.map-tools')?.getBoundingClientRect();
    const min=left.right-outer.left+10,panelLimit=right?right.left-outer.left-10:outer.width-12;
    const toolsLimit=tools?.width?tools.left-outer.left-10:panelLimit;
    return {min,max:toolsLimit-min>=190?Math.min(panelLimit,toolsLimit):panelLimit};
  }
  function targets(){
    if(destroyed)return[];
    if(forecast.active)return[...forecast.targets(),...resourceMarkers.targets()];
    const b=container.getBoundingClientRect();
    const buttons=catalog.isOpen?catalog.targets():[crossClose,inspector.close].filter(button=>button.getClientRects().length);
    const extras=buttons.map(element=>{const r=element.getBoundingClientRect();return{id:element.id,x:r.left+r.width/2-b.left,y:r.top+r.height/2-b.top,width:r.width,height:r.height,element,priority:30};});
    return catalog.isOpen?extras:[...Object.values(panels).flatMap(p=>p.targets()),...resourceMarkers.targets(),...extras];
  }
  return{ready,get isOpen(){return!destroyed;},info,togglePlayback,seekPlayback,setFilters:values=>setDatasetFilters('security',values),setCameraFilters:values=>setDatasetFilters('cameras',values),setTemporalMode,setCategory,setCameraDisplay,setCrossDataset,closeCross,setOpacity,setQuadrants,setHoverPoint,clearHover:()=>clearHover({keepPinned:true,keepCompanion:true}),dismissDetails,targets,pan(dx,dy){if(!destroyed)map.pan(dx,dy);},zoom(delta,x,y){if(!destroyed)map.zoom(delta,x,y);},home(){if(!destroyed)map.home();},destroy(){if(destroyed)return;destroyed=true;forecast.close();playback.destroy();timelineFrames=null;clearHover();abort.abort();unsubscribeView?.();quadrantSelector.destroy();resourceMarkers.destroy();container.removeEventListener('pointermove',pointerMove,true);container.removeEventListener('pointerleave',pointerLeave);container.removeEventListener('pointerdown',mapPointerDown);container.removeEventListener('click',mapClick);document.removeEventListener('pointerdown',outsidePicker,true);document.removeEventListener('keydown',keyDown);document.removeEventListener('visibilitychange',visibilityChange);map.setAnalysisLayer(null);map.clearCameraAnalysisLayer();map.setAnalysisMode(false);overlay.remove();for(const d of Object.values(datasets)){d.records=[];d.filtered=[];d.areaDetails.clear();d.surface=null;d.image=null;}}};
}

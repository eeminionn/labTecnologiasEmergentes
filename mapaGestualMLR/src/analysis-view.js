import './analysis-ui.css';
import boundaryText from '../assets/la-reina.geojson?raw';
import neighborsText from '../assets/la-reina-neighborhoods.geojson?raw';
import { parseSecurityCSV, filterSecurityRecords, buildDensitySurface, boundaryPolygons, projectSecurityPoint, heatColor, pointInsideBoundary, summarizeSecurityArea, getSecurityDateRange, normalizeSecurityRobberyTypes, toggleSecurityRobberyType } from './analysis-data.js';
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

const boundary=JSON.parse(boundaryText),number=value=>new Intl.NumberFormat('es-CL').format(value);
const defaults={security:{year:'all',month:'all',period:'all',robbery:'all'},cameras:{year:'all',month:'all',state:'all',type:'all'}};
const resourceDefaults={fixed:{year:null},alarms:{year:null,usage:'all',limit:ALARM_RANK_DEFAULT}};
const inside=(lng,lat)=>pointInsideBoundary(lng,lat,boundary);
const district=createAnalysisQuadrants(JSON.parse(neighborsText),boundary);
const unitIds=ids=>new Set(ids.map(id=>district.byId.get(id).unit));
function spatialLabel(ids) {
  if(!ids.length)return 'Toda la comuna';
  if(ids.length<=4)return ids.join(' · ');
  const count=unitIds(ids).size;
  return `${ids.length} subcuadrantes · ${count} ${count===1?'unidad':'unidades'}`;
}
function areaTitle(ids) {
  if(ids.length===1)return `Subcuadrante ${ids[0]}`;
  const units=unitIds(ids);
  const [unit]=units;
  if(units.size===1&&district.byUnit.get(unit).children.length===ids.length)return `Unidad vecinal ${unit}`;
  return 'Subcuadrantes seleccionados';
}
function densityImage(surface,camera=false,quadrantIds=[]) {
  const source=document.createElement('canvas');source.width=surface.width;source.height=surface.height;
  const small=source.getContext('2d'),pixels=small.createImageData(surface.width,surface.height);
  for(let i=0;i<surface.values.length;i++) {
    const value=surface.max>0?Math.pow(Math.max(0,surface.values[i])/surface.max,surface.colorExponent??.65):0;
    const rgb=camera?cameraHeatColor(Math.min(1,value)):heatColor(Math.min(1,value));
    pixels.data.set([...rgb,camera?Math.round(255*Math.min(1,value*1.7)):255],i*4);
  }
  small.putImageData(pixels,0,0);
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
  if(quadrantIds.length) {
    const mask=new Path2D();
    for(const id of quadrantIds)addRings(mask,district.byId.get(id).polygons);
    context.clip(mask,'evenodd');
  }
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(source,0,0,image.width,image.height);return image.toDataURL('image/png');
}
export async function createAnalysisView(container,{map,notify=()=>{},onChange=()=>{},onCompanion=()=>{}}={}) {
  let destroyed=false,loaded=false,failure='',activeCategory='security',compareCategory=null,hoverTimer=null,hoverAnchor=null,hoverDetails=null;
  let pinned=false,displayedAnchor=null,restoreFocus=null,dismissedAnchor=null,resourceError='',resourcesReady=false;
  let timelineFrames=null,timelineActive=false,suppressTimelineFrame=false;
  let forecastTrigger=null, forecastPointerDown=null, forecastViewport=null;
  let quadrantIds=[], mapPointerStart=null;
  const quadrantCache=new WeakMap();
  const recordQuadrant=record=>{
    if(!quadrantCache.has(record))quadrantCache.set(record,classifyAnalysisQuadrant(record,district));
    return quadrantCache.get(record);
  };
  function inQuadrants(records,ids=quadrantIds) {
    if(!ids.length)return records;
    const selected=new Set(ids);
    return records.filter(record=>selected.has(recordQuadrant(record)));
  }
  const abort=new AbortController(),datasets={},panels={};
  const crossed=()=>compareCategory!==null, selection=()=>({primary:activeCategory,compare:compareCategory});
  const defaultOpacity=(kind, compare=false)=>kind==='security'?(compare ? .45 : .62):kind==='cameras'&&datasets.cameras?.display==='heatmap'?(compare ? .55 : .62):.9;
  for(const layer of ANALYSIS_LAYERS){
    const kind=layer.id;
    datasets[kind]={records:[],filtered:[],metadata:null,filters:{...(resourceDefaults[kind]??defaults[kind])},summary:{total:0},surface:null,image:null,dateRange:null,areaDetails:new Map(),temporalMode:'all',selectedYear:'2025',selectedMonth:'12',display:kind==='security'?'heatmap':'points',opacity:defaultOpacity(kind)};
  }
  const overlay=document.createElement('section');overlay.className='analysis-experience';overlay.dataset.state='loading';overlay.setAttribute('aria-label','Análisis territorial');container.append(overlay);
  for(const layer of ANALYSIS_LAYERS){
    const kind=layer.id;
    panels[kind]=createAnalysisPanel(overlay,container,layer,{
      filters:values=>setDatasetFilters(kind,values),mode:mode=>setTemporalMode(mode,kind),forecast:openForecast,
      reset:()=>layer.resource?setResourceFilters(kind,{year:latestResourceYear(datasets[kind])})
        :setDatasetFilters(kind,kind==='security'?{year:'all',month:'all',period:'all'}:{year:'all',month:'all'}),
      toggleQuadrant,toggleUnit,clearQuadrants:()=>setQuadrants([]),
      cameraType:value=>setDatasetFilters('cameras',{type:toggleCameraType(datasets.cameras.filters.type,value)},{keepPicker:true}),robbery:value=>setDatasetFilters('security',{robbery:toggleSecurityRobberyType(datasets.security.filters.robbery,value)},{keepPicker:true}),display:setCameraDisplay,resourceFilters:values=>setResourceFilters(kind,values),catalog:openCatalog,locate:locateResource,opacity:value=>setOpacity(kind,value),clearHover:()=>{catalog.close();for(const [id,panel] of Object.entries(panels))if(id!==kind)panel.closePicker();clearHover();},playback:togglePlayback,seek:seekPlayback
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
  const quadrantSelector=createAnalysisQuadrantSelector(container,{map,quadrants:district});
  const resourceMarkers=createResourceMarkers(container,{map,onSelect:(record,event)=>{
      if(forecast.active){
        if(forecast.isPlacing)return;
        forecast.remove(record.id);
        if(event.detail===0)forecast.panel.querySelector(`#forecast-add-${record.kind}`)?.focus({preventScroll:true});
      }else if(record.kind==='fixed')showResource(record,{pin:true,anchor:event.currentTarget});
      else toggleQuadrant(recordQuadrant(record));
    },
    onHover:(record,event)=>{
      if(forecast.active){forecast.inspect(record);return;}
      if(catalog.isOpen)return;
      const anchor=event.currentTarget;
      if(event.type==='focus'&&anchor.matches(':focus-visible')){
        const rect=anchor.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
        if(!anchor.contains(document.elementFromPoint(x,y))){
          const outer=container.getBoundingClientRect(),{min,max}=visibleMapBounds();
          map.pan(outer.left+(min+max)/2-x,outer.top+outer.height/2-y);
          requestAnimationFrame(()=>{
            if(!destroyed&&document.activeElement===anchor){
              if(record.kind==='fixed')showResource(record,{anchor});
              else showResourceQuadrant(record);
            }
          });
          return;
        }
      }
      if(!pinned) {
        if(record.kind==='fixed')showResource(record,{anchor});
        else showResourceQuadrant(record);
      }
    }});
  const forecastImages=new WeakMap();
  const forecast=createForecastView(overlay,container,{
    map,signal:abort.signal,inside,onExit:closeForecast,
    onChange:state=>onCompanion({mode:'forecast',forecast:state}),
    renderSurface:surface=>{
      if(!forecastImages.has(surface))forecastImages.set(surface,densityImage(surface));
      map.setAnalysisLayer({url:forecastImages.get(surface),bounds:surface.bounds,opacity:.66,transitionMs:200});
    },
    renderPlacements:points=>resourceMarkers.render(points)
  });
  const playback=createAnalysisPlayback({
    onFrame:renderTimelineFrame,
    onStateChange:()=>{if(!destroyed&&!suppressTimelineFrame){updatePanels();onChange({reason:'playback',...info()});}}
  });
  function visible(kind){return activeCategory===kind||compareCategory===kind;}
  function visibleUnitRobberies(){
    return loaded&&!forecast.active&&visible('security')?datasets.security.unitRobberies??null:null;
  }
  function unitRobberyLabel(quadrant){
    const unit=district.byId.get(quadrant)?.unit;
    const count=visibleUnitRobberies()?.[unit];
    return unit&&Number.isFinite(count)?`Unidad ${unit} · ${number(count)} ${count===1?'robo':'robos'}`:'';
  }
  function paintQuadrants(preview=null){
    quadrantSelector.update({selected:quadrantIds,visible:loaded&&!forecast.active,preview,
      unitRobberies:visibleUnitRobberies(),unitRobberyMax:datasets.security.unitRobberyMax});
  }
  function updatePanels(){
    overlay.dataset.crossed=String(!forecast.active&&crossed());
    overlay.dataset.category=activeCategory;
    for(const [kind,panel] of Object.entries(panels)){
      const resource=getAnalysisLayer(kind).resource;
      const dataset=datasets[kind];
      panel.update({...dataset,units:district.units,unitRobberies:visibleUnitRobberies(),quadrantIds,spatialLabel:spatialLabel(quadrantIds),loaded:resource?resourcesReady:loaded,error:resource?resourceError:failure,canChoose:loaded,visible:!forecast.active&&visible(kind),side:activeCategory===kind?'left':'right',crossed:crossed(),datasetCount:dataset.records.length,playback:kind==='security'?playback.info():null});
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
    map.setAnalysisLayer(null);map.clearCameraAnalysisLayer();resourceMarkers.render([]);
    forecast.open();updatePanels();map.home();
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
  const pointerLeave=cancelPendingHover,outsidePicker=event=>{
    const target=event.target;
    if(!target.closest?.('.analysis-layer-picker,.analysis-layer-trigger,.analysis-compare'))catalog.close(false);
    if(!target.closest?.('.analysis-date-popover,.analysis-quadrant-filter,.analysis-date-selection,.analysis-filter-date,.analysis-camera-filters,.analysis-robbery-filter'))closeAllPickers();
  },keyDown=event=>{
    if(event.key!=='Escape')return;
    if(forecast.active){forecast.stopPlacing();return;}
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
    const camera=cameraAtScreen(x,y);
    if(camera){showResource(camera,{pin:true});return;}
    const quadrant=location&&classifyAnalysisQuadrant(location,district);
    if(quadrant)toggleQuadrant(quadrant);
  };
  container.addEventListener('pointermove',pointerMove,true);container.addEventListener('pointerleave',pointerLeave);document.addEventListener('pointerdown',outsidePicker,true);document.addEventListener('keydown',keyDown);
  container.addEventListener('pointerdown',mapPointerDown);container.addEventListener('click',mapClick);
  const visibilityChange=()=>{if(document.hidden)playback.pause();};
  document.addEventListener('visibilitychange',visibilityChange);
  const unsubscribeView=map.onViewChange?.(()=>{clearHover({keepPinned:true});closeAllPickers();catalog.close();});map.setAnalysisMode(true);updatePanels();map.home();
  const ready=(async()=>{
    const resource=async(url,format)=>{const r=await fetch(url,{signal:abort.signal});if(!r.ok)throw new Error('No se pudo cargar la base de análisis.');return format==='json'?r.json():r.text();};
    const [securityCSV,securityMeta,cameraCSV,cameraMeta,usageByYear,fixedHistory,resources]=await Promise.all([resource('/analysis/seguridad-simulada.csv'),resource('/analysis/metadata.json','json'),resource('/analysis/camaras-seguridad.csv'),resource('/analysis/camaras-metadata.json','json'),
      resource('/analysis/pulsaciones-botones.csv').then(parseAlarmUsage).catch(()=>new Map()),
      resource('/analysis/estado-puntos-fijos.csv').then(parseFixedPointHistory).catch(()=>new Map()),
      Promise.all([
        resource('/analysis/recursos-seguridad.json','json').then(value=>readSecurityResources(value,inside)),
        resource('/analysis/recursos-simulados.csv').then(parseSimulatedSecurityResources).catch(()=>[])
      ]).then(([documented, simulated])=>{
        try { return readSecurityResources([...documented,...simulated],inside); }
        catch { return documented; }
      }).catch(error=>{resourceError=error.message;return [];})]);
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
  })().catch(error=>{if(destroyed||error.name==='AbortError')return;failure=error.message||'No se pudo preparar el análisis.';overlay.dataset.state='error';updatePanels();notify(failure);throw error;});ready.catch(()=>{});
  function datasetInfo(kind){const d=datasets[kind],s=d.surface,layer=getAnalysisLayer(kind);return{ready:layer.resource?resourcesReady:loaded,error:layer.resource?resourceError:failure,datasetCount:d.records.length,filteredCount:d.summary.total,filters:Object.fromEntries(Object.entries(d.filters).map(([key,value])=>[key,Array.isArray(value)?[...value]:value])),temporalMode:d.temporalMode,picker:panels[kind].picker,dateRange:d.dateRange,category:layer.label,display:d.display,opacity:d.opacity,summary:{...d.summary},surface:s?{width:s.width,height:s.height,max:s.max,bounds:s.bounds,projectedBounds:s.projectedBounds,includedCount:s.includedCount,excludedCount:s.excludedCount,bandwidthMetres:s.bandwidthMetres,colorExponent:.65,imageWidth:1024,imageHeight:512,coverage:quadrantIds.length?'cuadrantes seleccionados':'límite comunal completo'}:null};}
  function info(){return{...datasetInfo(activeCategory),isOpen:!destroyed,activeCategory,compareCategory,crossed:crossed(),quadrantIds:[...quadrantIds],simulated:true,playback:playback.info(),hover:hoverDetails?{...hoverDetails,pinned}:null,datasets:Object.fromEntries(ANALYSIS_LAYERS.map(layer=>[layer.id,datasetInfo(layer.id)]))};}
  function securityArea(d,ids=quadrantIds) {
    const key=ids.join(',');
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
      label:spatialLabel(ids),quadrantIds:[...ids],
      security:visible('security')?securityArea(datasets.security,ids):null,
      cameras:visible('cameras')?summarizeCameraRecords(inQuadrants(datasets.cameras.filtered,ids)):null,
      resources:Object.fromEntries(ANALYSIS_LAYERS.filter(layer=>layer.resource&&visible(layer.id)).map(({id})=>{
        const points=inQuadrants(datasets[id].filtered,ids);
        const detail=id==='fixed'?{monitoring:points.filter(record=>record.monitoringStatus==='monitoreando').length}
          :{activations:points.reduce((sum,point)=>sum+(point.activations??0),0)};
        return [id,{total:points.length,...detail}];
      }))
    };
  }
  function publishCompanion() {
    if(destroyed)return;
    if(forecast.active){onCompanion({mode:'forecast',forecast:forecast.info()});return;}
    if(!loaded){onCompanion({mode:'idle'});return;}
    const kind=hoverDetails?.record?.kind ?? activeCategory;
    const d=datasets[kind] ?? datasets[activeCategory];
    const period=d.dateRange?.label ?? d.filters.year ?? 'Todos los años';
    const layers=[activeCategory,...(compareCategory?[compareCategory]:[])].map(id=>({
      kind:id,title:getAnalysisLayer(id).label,
      period:datasets[id].dateRange?.label ?? datasets[id].filters.year ?? 'Todos los años',
      summary:{...datasets[id].summary}
    }));
    if(hoverDetails&&(!quadrantIds.length||pinned&&hoverDetails.record)){
      onCompanion({
        mode:hoverDetails.record?'resource':'sector',kind,period:crossed()&&!hoverDetails.record?null:period,
        title:hoverDetails.quadrantIds.length?areaTitle(hoverDetails.quadrantIds):'Área consultada',
        resource:hoverDetails.record,sector:hoverDetails,
        filters:{...d.filters},dateRange:d.dateRange,layers
      });
      return;
    }
    if(quadrantIds.length){
      const area=areaDetails(quadrantIds);
      onCompanion({mode:'sector',kind,title:areaTitle(quadrantIds),
        period:crossed()?null:period,sector:area,layers});
      return;
    }
    onCompanion({mode:'summary',kind:activeCategory,title:getAnalysisLayer(activeCategory).label,
      period,summary:{...d.summary},layers});
  }
  function prepareTimelineFrames(){
    if(timelineFrames)return;
    const d=datasets.security;
    timelineFrames=Object.fromEntries(SECURITY_CHOICES.period.slice(1).map(([period])=>{
      return [period,mapDataset('security',filterSecurityRecords(d.records,{...d.filters,period}),false)];
    }));
    const frames=Object.values(timelineFrames),max=Math.max(...frames.map(frame=>frame.surface.max));
    const unitRobberyMax=Math.max(...frames.map(frame=>frame.unitRobberyMax));
    for(const frame of frames){
      frame.image=densityImage({...frame.surface,max},false,quadrantIds);
      frame.unitRobberyMax=unitRobberyMax;
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
    if(!changedKind||getAnalysisLayer(changedKind)?.resource)renderResources();
  }
  function renderResources(){
    const points=ANALYSIS_LAYERS.filter(layer=>layer.resource&&visible(layer.id)).flatMap(({id})=>{
      const {filtered,opacity}=datasets[id];return filtered.map(record=>({...record,opacity}));
    });
    resourceMarkers.render(points);
  }
  function latestResourceYear(dataset){
    return ANALYSIS_YEARS.findLast(year=>dataset.historyByYear.has(year))??null;
  }
  function filterResources(kind,dataset){
    const history=dataset.historyByYear.get(dataset.filters.year);
    const locations=inQuadrants(history?dataset.records.filter(record=>history.has(record.id)):dataset.records);
    if(kind==='fixed'){
      dataset.filtered=locations.map(record=>({...record,monitoringStatus:history?.get(record.id)}));
    }else{
      const points=locations.map(record=>({...record,activations:history?.get(record.id)??null}));
      const ranked=mostUsedAlarmButtons(points,ALARM_RANK_MAX);
      dataset.rankCount=ranked.length;
      if(dataset.filters.usage==='top'){
        dataset.filtered=ranked.slice(0,dataset.filters.limit).map((record,index)=>({...record,rank:index+1}));
      }else dataset.filtered=points;
    }
    const simulated=dataset.filtered.filter(record=>record.simulated).length;
    dataset.summary={total:dataset.filtered.length,documented:dataset.filtered.length-simulated,simulated};
    if(kind==='fixed')dataset.summary.monitoring=dataset.filtered.filter(record=>record.monitoringStatus==='monitoreando').length;
  }
  function mapDataset(kind,records,withImage=true){
    const filtered=inQuadrants(records), camera=kind==='cameras';
    const surface=buildDensitySurface(filtered,boundary,{width:256,height:128});
    let unitRobberies=null,unitRobberyMax=0;
    if(!camera){
      unitRobberies=Object.fromEntries(district.units.map(unit=>[unit.id,0]));
      for(const record of records){
        const unit=district.byId.get(recordQuadrant(record))?.unit;
        if(unit)unitRobberies[unit]++;
      }
      unitRobberyMax=Math.max(...Object.values(unitRobberies));
    }
    return {filtered,communeTotal:records.length,summary:camera?summarizeCameraRecords(filtered):{total:filtered.length},
      areaDetails:new Map(),surface,image:withImage?densityImage(surface,camera,quadrantIds):null,unitRobberies,unitRobberyMax};
  }
  function refreshMapDataset(kind){
    const d=datasets[kind];
    const records=kind==='security'?filterSecurityRecords(d.records,d.filters):filterCameraRecords(d.records,d.filters,d.metadata);
    Object.assign(d,mapDataset(kind,records));
  }
  function setQuadrants(ids){
    if(!loaded||destroyed||forecast.active)return false;
    let next;
    try{next=normalizeAnalysisQuadrants(ids,district);}catch{return false;}
    if(next.join(',')===quadrantIds.join(','))return false;
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
  function setTemporalMode(mode,kind='security'){if(!loaded||!['all','year','month'].includes(mode)||!defaults[kind])return false;const d=datasets[kind];setDatasetFilters(kind,{year:mode==='all'?'all':d.selectedYear,month:mode==='month'?d.selectedMonth:'all'});if(mode!=='all')panels[kind].openPicker(mode);return true;}
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
    if(kind==='security')map.setAnalysisOpacity(d.opacity);else if(kind==='cameras')map.setCameraAnalysisOpacity(d.opacity);else renderResources();
    updatePanels();onChange({reason:'opacity',dataset:kind,...info()});return true;
  }
  function clearHover({keepPinned=false,keepCompanion=false}={}){
    if(keepPinned&&pinned)return;
    const hadDetails=Boolean(hoverDetails);
    clearTimeout(hoverTimer);hoverTimer=null;hoverAnchor=null;displayedAnchor=null;hoverDetails=null;pinned=false;restoreFocus=null;dismissedAnchor=null;
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
      if(top&&container.contains(top)&&!isMapControl(top))forecast.inspect(map.screenToLocation(x,y));
      return false;
    }
    if(dismissedAnchor){
      if(dismissedAnchor.source===source&&Math.hypot(dismissedAnchor.x-x,dismissedAnchor.y-y)<26)return false;
      dismissedAnchor=null;
    }
    if(!top||!container.contains(top)||isMapControl(top)){cancelPendingHover();return false;}
    const location=map.screenToLocation(x,y);
    const quadrant=location&&classifyAnalysisQuadrant(location,district);
    if(!quadrant){clearHover();return false;}
    if(quadrantIds.length&&!quadrantIds.includes(quadrant)){
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
      const camera=cameraAtScreen(hoverAnchor.x,hoverAnchor.y);
      if(camera)showResource(camera,{source});
      else showHover(hoverAnchor);
    },source==='hand'?420:170);return true;
  }
  function pinSector(anchor,trigger=null){
    if(playback.info().playing)playback.pause();
    clearTimeout(hoverTimer);hoverTimer=null;dismissedAnchor=null;pinned=true;restoreFocus=trigger;hoverAnchor=anchor;
    showHover(anchor);
    if(trigger&&trigger.matches(':focus-visible'))inspector.title.focus({preventScroll:true});
  }
  async function locateResource(record,trigger){
    clearHover();await map.focus(record,16,{animate:false});if(!destroyed&&visible(record.kind))showResource(record,{pin:true,anchor:trigger});
  }
  function cameraAtScreen(x,y){
    if(!visible('cameras'))return null;
    let candidate=null,distance=12;
    for(const camera of datasets.cameras.filtered){
      const point=map.locationToScreen(camera);
      if(!point)continue;
      const delta=Math.hypot(point.x-x,point.y-y);
      if(delta<distance){candidate=camera;distance=delta;}
    }
    return candidate?{...candidate,kind:'cameras',title:`Cámara ${candidate.tipo_camara.toLowerCase()}`,address:candidate.direccion}:null;
  }
  function showResourceQuadrant(record){
    const point=map.locationToScreen(record),quadrant=recordQuadrant(record);
    if(!point||!quadrant)return;
    clearTimeout(hoverTimer);hoverTimer=null;
    hoverAnchor={...point,lat:record.lat,lng:record.lng,source:'point',quadrant,alarm:record};
    showHover(hoverAnchor);
  }
  function showResource(record,{pin=false,anchor=null,source='point'}={}){
    if(!visible(record.kind)||(!pin&&document.activeElement===anchor&&dismissedAnchor?.record?.id===record.id))return;
    const point=map.locationToScreen(record);
    if(!point)return;
    const next={...point,lat:record.lat,lng:record.lng,source,quadrant:recordQuadrant(record),record,trigger:anchor};
    if(pin)pinSector(next,anchor);
    else {clearTimeout(hoverTimer);hoverTimer=null;hoverAnchor=next;showHover(next);}
  }
  function showHover(anchor){
    if(!anchor||destroyed||!loaded)return;
    displayedAnchor=anchor;
    const area=areaDetails(anchor.quadrant?[anchor.quadrant]:[]);
    hoverDetails={...(area.security||area.cameras),...area,record:anchor.record??null,source:anchor.source,lat:anchor.lat,lng:anchor.lng};
    const point=anchor.record??anchor.alarm;
    if(point){
      const address=String(point.address??'').replace(' (numeración simulada)','');
      const status=point.kind==='cameras'?point.estado
        :point.kind==='fixed'?MONITORING_STATUS_LABELS[point.monitoringStatus]
        :Number.isInteger(point.activations)?number(point.activations)+' pulsaciones':'';
      const label=pinned?'Ubicación seleccionada':anchor.alarm?'Botón · clic selecciona su subcuadrante':'Vista previa de ubicación';
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

import './analysis-ui.css';
import boundaryText from '../assets/la-reina.geojson?raw';
import { parseSecurityCSV, filterSecurityRecords, summarizeSecurityRecords, buildDensitySurface, boundaryPolygons, projectSecurityPoint, heatColor, pointInsideBoundary, createSecuritySpatialIndex, getSecurityDateRange, normalizeSecurityRobberyTypes, toggleSecurityRobberyType } from './analysis-data.js';
import { parseCameraCSV, filterCameraRecords, summarizeCameraRecords, cameraHeatColor, createCameraSpatialIndex, normalizeCameraTypes, toggleCameraType } from './camera-analysis-data.js';
import { createAnalysisPanel, SECURITY_CHOICES, CAMERA_CHOICES } from './analysis-panel.js';

const boundary=JSON.parse(boundaryText),number=value=>new Intl.NumberFormat('es-CL').format(value);
const defaults={security:{year:'all',month:'all',resolution:'all',period:'all',robbery:'all'},cameras:{year:'all',month:'all',state:'all',type:'all'}};
const names={security:'Seguridad',cameras:'Cámaras'};
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
export async function createAnalysisView(container,{map,notify=()=>{},onChange=()=>{},onExit=()=>{}}={}) {
  let destroyed=false,loaded=false,failure='',activeCategory='security',crossed=false,hoverTimer=null,hoverAnchor=null,hoverDetails=null,crossPickerFor=null;
  const abort=new AbortController(),datasets={},panels={};
  for(const kind of ['security','cameras'])datasets[kind]={records:[],filtered:[],metadata:null,filters:{...defaults[kind]},summary:{total:0},surface:null,image:null,index:null,dateRange:null,temporalMode:'all',selectedYear:'2025',selectedMonth:'12',display:kind==='cameras'?'points':'heatmap',opacity:kind==='cameras'?.9:.62,exportCount:0};
  const overlay=document.createElement('section');overlay.className='analysis-experience';overlay.dataset.state='loading';overlay.setAttribute('aria-label','Análisis territorial de seguridad y cámaras');container.append(overlay);
  for(const kind of ['security','cameras'])panels[kind]=createAnalysisPanel(overlay,container,kind,{
    category:setCategory,filters:values=>setDatasetFilters(kind,values),mode:mode=>setTemporalMode(mode,kind),reset:()=>setDatasetFilters(kind,defaults[kind]),cameraType:value=>setDatasetFilters('cameras',{type:toggleCameraType(datasets.cameras.filters.type,value)},{keepPicker:true}),robbery:value=>setDatasetFilters('security',{robbery:toggleSecurityRobberyType(datasets.security.filters.robbery,value)},{keepPicker:true}),display:setCameraDisplay,cross:openCrossPicker,opacity:value=>setOpacity(kind,value),export:()=>exportCSV(kind),exit:onExit,clearHover
  });
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
  const crossPicker=el('section','analysis-date-popover analysis-cross-picker');crossPicker.hidden=true;crossPicker.setAttribute('role','dialog');crossPicker.setAttribute('aria-label','Seleccionar otra base de datos');
  const crossHeading=el('div','analysis-date-heading'),crossTitle=el('strong',null,'Cruzar con otra base'),crossCancel=el('button',null,'×');
  crossCancel.id='analysis-cross-cancel';crossCancel.type='button';crossCancel.setAttribute('aria-label','Cerrar selección de base');crossCancel.onclick=closeCrossPicker;crossHeading.append(crossTitle,crossCancel);
  const crossDescription=el('p','analysis-cross-description','Elige una categoría distinta para superponer sus datos.'),crossOptions=el('div','analysis-cross-options');
  const crossButtons=['security','cameras'].map(kind=>{const e=el('button');e.type='button';e.id=`analysis-cross-${kind}`;e.append(el('strong',null,names[kind]),el('small',null,kind==='security'?'CSV de incidentes':'CSV de cámaras de seguridad'));e.onclick=()=>setCrossDataset(kind);crossOptions.append(e);return e;});
  crossPicker.append(crossHeading,crossDescription,crossOptions);overlay.append(crossPicker);
  for(const type of ['pointerdown','mousedown','touchstart','click','dblclick','wheel'])crossPicker.addEventListener(type,event=>event.stopPropagation());
  const crossBar=el('div','analysis-cross-bar');crossBar.hidden=true;const crossClose=el('button',null,'Ver por separado');crossClose.type='button';crossClose.id='analysis-cross-close';crossClose.onclick=closeCross;crossBar.append(el('span',null,'Seguridad + Cámaras'),crossClose);overlay.append(crossBar);
  const tooltip=el('aside','analysis-map-tooltip');tooltip.hidden=true;tooltip.setAttribute('role','tooltip');tooltip.setAttribute('aria-label','Información del sector seleccionado');
  const securityTip=el('section','analysis-tooltip-security'),securityContext=el('p','analysis-tooltip-context'),securityTotal=el('div','analysis-tooltip-total'),securityResolution=el('p'),securityWeek=el('p','analysis-tooltip-week'),securityDates=el('small'),securityLatest=el('p'),securityAddress=el('p','analysis-tooltip-address');securityTip.append(securityContext,securityTotal,securityResolution,securityWeek,securityDates,securityLatest,securityAddress);
  const cameraTip=el('section','analysis-tooltip-cameras'),cameraContext=el('p','analysis-tooltip-context'),cameraTotal=el('div','analysis-tooltip-total'),cameraStates=el('p'),cameraNearest=el('p');cameraTip.append(cameraContext,cameraTotal,cameraStates,cameraNearest);
  tooltip.append(el('strong',null,'En este sector'),securityTip,cameraTip,el('small','analysis-tooltip-note','Consulta en un radio de 250 m'));
  const hoverRing=el('div','analysis-hover-ring');hoverRing.hidden=true;overlay.append(hoverRing,tooltip);
  function visible(kind){return crossed||activeCategory===kind;}
  function updatePanels(){overlay.dataset.crossed=String(crossed);overlay.dataset.category=activeCategory;crossBar.hidden=!crossed;for(const [kind,panel] of Object.entries(panels))panel.update({...datasets[kind],loaded,error:failure,visible:visible(kind),side:activeCategory===kind?'left':'right',crossed,datasetCount:datasets[kind].records.length});}
  function closeAllPickers(){Object.values(panels).forEach(p=>p.closePicker());closeCrossPicker();}
  const pointerMove=event=>{if(event.pointerType&&event.pointerType!=='mouse')return;if(event.buttons){clearHover();return;}const b=container.getBoundingClientRect();setHoverPoint({x:event.clientX-b.left,y:event.clientY-b.top,source:'mouse'});};
  const pointerLeave=()=>clearHover(),outsidePicker=event=>{if(event.target.closest?.('.analysis-date-popover,.analysis-date-selection,.analysis-filter-date,.analysis-camera-filters'))return;closeAllPickers();},keyDown=event=>{if(event.key==='Escape'){closeAllPickers();clearHover();}};
  container.addEventListener('pointermove',pointerMove,true);container.addEventListener('pointerleave',pointerLeave);document.addEventListener('pointerdown',outsidePicker,true);document.addEventListener('keydown',keyDown);
  const unsubscribeView=map.onViewChange?.(()=>{clearHover();closeAllPickers();});map.setAnalysisMode(true);updatePanels();map.home();
  const ready=(async()=>{
    const resource=async(url,format)=>{const r=await fetch(url,{signal:abort.signal});if(!r.ok)throw new Error('No se pudo cargar la base de análisis.');return format==='json'?r.json():r.text();};
    const [securityCSV,securityMeta,cameraCSV,cameraMeta]=await Promise.all([resource('/analysis/seguridad-simulada.csv'),resource('/analysis/metadata.json','json'),resource('/analysis/camaras-seguridad.csv'),resource('/analysis/camaras-metadata.json','json')]);
    if(destroyed)return;datasets.security.records=parseSecurityCSV(securityCSV);datasets.security.metadata=securityMeta;datasets.cameras.records=parseCameraCSV(cameraCSV);datasets.cameras.metadata=cameraMeta;
    for(const d of Object.values(datasets))if(d.records.length!==d.metadata.cantidad)throw new Error('La base está incompleta.');
    loaded=true;setDatasetFilters('security',defaults.security);setDatasetFilters('cameras',defaults.cameras);onChange({reason:'ready',...info()});
  })().catch(error=>{if(destroyed||error.name==='AbortError')return;failure=error.message||'No se pudo preparar el análisis.';overlay.dataset.state='error';updatePanels();notify(failure);throw error;});ready.catch(()=>{});
  function datasetInfo(kind){const d=datasets[kind],s=d.surface;return{ready:loaded,error:failure,datasetCount:d.records.length,filteredCount:d.summary.total,resolvedCount:d.summary.resolved||0,unresolvedCount:d.summary.unresolved||0,filters:Object.fromEntries(Object.entries(d.filters).map(([key,value])=>[key,Array.isArray(value)?[...value]:value])),temporalMode:d.temporalMode,picker:panels[kind].picker,dateRange:d.dateRange,exportCount:d.exportCount,category:names[kind],display:d.display,opacity:d.opacity,summary:{...d.summary},surface:s?{width:s.width,height:s.height,max:s.max,bounds:s.bounds,projectedBounds:s.projectedBounds,includedCount:s.includedCount,excludedCount:s.excludedCount,bandwidthMetres:s.bandwidthMetres,colorExponent:.65,imageWidth:1024,imageHeight:512,coverage:'límite comunal completo'}:null};}
  function info(){return{...datasetInfo(activeCategory),isOpen:!destroyed,activeCategory,crossed,crossPicker:crossPickerFor,simulated:true,hover:hoverDetails?{...hoverDetails}:null,datasets:{security:datasetInfo('security'),cameras:datasetInfo('cameras')}};}
  function renderLayers(){const s=datasets.security,c=datasets.cameras;map.setAnalysisLayer(visible('security')&&s.image?{url:s.image,bounds:s.surface.bounds,opacity:s.opacity}:null);if(visible('cameras')&&c.surface)map.setCameraAnalysisLayer({url:c.display==='heatmap'?c.image:null,bounds:c.surface.bounds,points:c.filtered,mode:c.display,opacity:c.opacity});else map.clearCameraAnalysisLayer();}
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
    if(next.month!=='all'&&next.year==='all')next.year=d.selectedYear;
    d.temporalMode=next.month!=='all'?'month':next.year!=='all'?'year':'all';
    if(next.year!=='all')d.selectedYear=next.year;if(next.month!=='all')d.selectedMonth=next.month;
    clearHover();if(!keepPicker)panels[kind].closePicker();d.filters=next;d.dateRange=getSecurityDateRange(next,d.metadata);
    d.filtered=kind==='security'?filterSecurityRecords(d.records,next):filterCameraRecords(d.records,next,d.metadata);
    d.summary=kind==='security'?summarizeSecurityRecords(d.filtered):summarizeCameraRecords(d.filtered);
    d.index=kind==='security'?createSecuritySpatialIndex(d.filtered):createCameraSpatialIndex(d.filtered);
    d.surface=buildDensitySurface(d.filtered,boundary,{width:256,height:128});d.image=densityImage(d.surface,kind==='cameras');
    renderLayers();updatePanels();overlay.dataset.state='ready';onChange({reason:'filters',dataset:kind,...info()});return true;
  }
  function setTemporalMode(mode,kind='security'){if(!loaded||!['all','year','month'].includes(mode)||!datasets[kind])return false;const d=datasets[kind];setDatasetFilters(kind,{year:mode==='all'?'all':d.selectedYear,month:mode==='month'?d.selectedMonth:'all'});if(mode!=='all')panels[kind].openPicker(mode);return true;}
  function setCategory(kind){if(!loaded||destroyed||!datasets[kind])return false;clearHover();closeAllPickers();activeCategory=kind;updatePanels();renderLayers();map.home();onChange({reason:'category',...info()});return true;}
  function setCameraDisplay(display){if(!loaded||!['points','heatmap'].includes(display))return false;clearHover();datasets.cameras.display=display;if(!datasets.cameras.customOpacity)datasets.cameras.opacity=display==='points'?.9:crossed?.55:.62;renderLayers();updatePanels();onChange({reason:'display',...info()});return true;}
  function setOpacity(kind,value){if(!loaded||!datasets[kind]||!Number.isFinite(value))return false;datasets[kind].customOpacity=true;datasets[kind].opacity=Math.round(Math.max(.1,Math.min(1,value))*100)/100;if(kind==='security')map.setAnalysisOpacity(datasets[kind].opacity);else map.setCameraAnalysisOpacity(datasets[kind].opacity);updatePanels();onChange({reason:'opacity',dataset:kind,...info()});return true;}
  function closeCrossPicker(){crossPickerFor=null;crossPicker.hidden=true;}
  function openCrossPicker(kind){if(!loaded)return false;clearHover();closeAllPickers();crossPickerFor=kind;crossPicker.hidden=false;crossButtons.forEach((e,i)=>{e.hidden=['security','cameras'][i]===kind;});const outer=container.getBoundingClientRect(),r=panels[kind].element.getBoundingClientRect(),p=crossPicker.getBoundingClientRect();crossPicker.style.left=`${Math.max(12,Math.min(outer.width-p.width-12,r.right-outer.left+10))}px`;crossPicker.style.top=`${Math.max(70,Math.min(outer.height-p.height-12,r.bottom-outer.top-p.height))}px`;return true;}
  function setCrossDataset(kind){const primary=crossPickerFor||activeCategory;if(!loaded||!datasets[kind]||kind===primary)return false;clearHover();closeAllPickers();activeCategory=primary;crossed=true;datasets.security.customOpacity=false;datasets.cameras.customOpacity=false;datasets.security.opacity=.45;datasets.cameras.opacity=datasets.cameras.display==='points'?.9:.55;updatePanels();renderLayers();map.home();onChange({reason:'cross',...info()});return true;}
  function closeCross(){clearHover();closeAllPickers();crossed=false;datasets.security.customOpacity=false;datasets.cameras.customOpacity=false;datasets.security.opacity=.62;datasets.cameras.opacity=datasets.cameras.display==='points'?.9:.62;updatePanels();renderLayers();map.home();onChange({reason:'uncross',...info()});return true;}
  function clearHover(){clearTimeout(hoverTimer);hoverTimer=null;hoverAnchor=null;hoverDetails=null;tooltip.hidden=true;hoverRing.hidden=true;}
  function setHoverPoint(point){if(!loaded||destroyed||!point||crossPickerFor||Object.values(panels).some(p=>p.picker)){clearHover();return false;}const {x,y}=point,b=container.getBoundingClientRect();if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>b.width||y>b.height){clearHover();return false;}const top=document.elementFromPoint(b.left+x,b.top+y);if(!top||!container.contains(top)||top.closest('.analysis-panel,.analysis-date-popover,.analysis-cross-bar,.map-tools,#diagnostics,button,a,input,select')){clearHover();return false;}const location=map.screenToLocation(x,y);if(!location||!pointInsideBoundary(location.lng,location.lat,boundary)){clearHover();return false;}if(hoverAnchor&&hoverAnchor.source===point.source&&Math.hypot(hoverAnchor.x-x,hoverAnchor.y-y)<18)return true;clearTimeout(hoverTimer);hoverAnchor={x,y,source:point.source||'mouse',...location};hoverTimer=setTimeout(()=>showHover(hoverAnchor),point.source==='hand'?420:140);return true;}
  function showHover(anchor){
    if(!anchor||destroyed||!loaded)return;const s=datasets.security,c=datasets.cameras,security=visible('security')?s.index.query({...anchor,radiusMetres:250,referenceDate:s.dateRange.end}):null,cameras=visible('cameras')?c.index.query({...anchor,radiusMetres:250}):null;
    hoverDetails={...(security||cameras),security,cameras,source:anchor.source,lat:anchor.lat,lng:anchor.lng};securityTip.hidden=!security;cameraTip.hidden=!cameras;
    if(security){securityContext.textContent=`Seguridad · ${s.dateRange.label}`;securityTotal.textContent=`${number(security.total)} ${security.total===1?'incidente':'incidentes'}`;securityResolution.textContent=`${number(security.resolved)} resueltos · ${number(security.unresolved)} sin resolver`;securityWeek.textContent=`Últimos 7 días del período: ${number(security.last7Days)}`;securityDates.textContent=security.last7DaysRange?.label||'';const last=security.lastIncident;securityLatest.textContent=last?`Último registro: ${last.fecha.split('-').reverse().join('/')} · ${last.hora}`:'Sin registros para estos filtros.';securityAddress.textContent=last?`${last.tipo_incidente} · ${last.direccion.replace(' (numeración simulada)','')}`:'';}
    if(cameras){cameraContext.textContent=`Cámaras · al ${c.dateRange.end.split('-').reverse().join('/')}`;cameraTotal.textContent=`${number(cameras.total)} ${cameras.total===1?'cámara':'cámaras'}`;cameraStates.textContent=`Operativas: ${number(cameras.operational)} · otras: ${number(cameras.maintenance+cameras.inactive)}`;const near=cameras.nearest;cameraNearest.textContent=near?`Más cercana: ${near.direccion.replace(' (numeración simulada)','')} · ${Math.round(near.distanceMetres)} m`:'Sin cámaras en este radio para los filtros elegidos.';}
    tooltip.hidden=false;const outer=container.getBoundingClientRect(),tip=tooltip.getBoundingClientRect(),leftPanel=Object.values(panels).find(p=>p.isVisible&&p.element.dataset.side==='left')?.element.getBoundingClientRect(),rightPanel=Object.values(panels).find(p=>p.isVisible&&p.element.dataset.side==='right')?.element.getBoundingClientRect(),min=leftPanel?leftPanel.right-outer.left+12:12,max=rightPanel?rightPanel.left-outer.left-12:outer.width-12;let left=anchor.x+22;if(left+tip.width>max)left=anchor.x-tip.width-22;tooltip.style.left=`${Math.max(min,Math.min(max-tip.width,left))}px`;tooltip.style.top=`${Math.max(68,Math.min(outer.height-tip.height-12,anchor.y-tip.height/2))}px`;const east=map.locationToScreen({lat:anchor.lat,lng:anchor.lng+250/(111320*Math.cos(anchor.lat*Math.PI/180))}),radius=east?Math.hypot(east.x-anchor.x,east.y-anchor.y):28;Object.assign(hoverRing.style,{left:`${anchor.x}px`,top:`${anchor.y}px`,width:`${radius*2}px`,height:`${radius*2}px`});hoverRing.hidden=false;
  }
  function exportCSV(kind='security'){if(!loaded||destroyed)return;const e=document.createElement('a');e.href=kind==='security'?'/analysis/seguridad-simulada.csv':'/analysis/camaras-seguridad.csv';e.download=kind==='security'?'La-Reina-seguridad-2023-2025.csv':'La-Reina-camaras-seguridad.csv';document.body.append(e);e.click();e.remove();datasets[kind].exportCount++;onChange({reason:'export',...info()});}
  function targets(){if(destroyed)return[];const result=Object.values(panels).flatMap(p=>p.targets()),b=container.getBoundingClientRect();for(const e of [crossCancel,...crossButtons,crossClose])if(e.getClientRects().length){const r=e.getBoundingClientRect();result.push({id:e.id,x:r.left+r.width/2-b.left,y:r.top+r.height/2-b.top,width:r.width,height:r.height,element:e,priority:30});}return result;}
  return{ready,get isOpen(){return!destroyed;},info,setFilters:values=>setDatasetFilters('security',values),setCameraFilters:values=>setDatasetFilters('cameras',values),setTemporalMode,setCategory,setCameraDisplay,setCrossDataset,closeCross,setOpacity,setHoverPoint,clearHover,targets,pan(dx,dy){if(!destroyed)map.pan(dx,dy);},zoom(delta,x,y){if(!destroyed)map.zoom(delta,x,y);},home(){if(!destroyed)map.home();},destroy(){if(destroyed)return;destroyed=true;clearHover();abort.abort();unsubscribeView?.();container.removeEventListener('pointermove',pointerMove,true);container.removeEventListener('pointerleave',pointerLeave);document.removeEventListener('pointerdown',outsidePicker,true);document.removeEventListener('keydown',keyDown);map.setAnalysisLayer(null);map.clearCameraAnalysisLayer();map.setAnalysisMode(false);overlay.remove();for(const d of Object.values(datasets)){d.records=[];d.filtered=[];d.index=null;d.surface=null;d.image=null;}}};
}

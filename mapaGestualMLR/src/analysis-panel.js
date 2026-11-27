import { SECURITY_ROBBERY_TYPES, HEAT_COLOR_STOPS } from './analysis-data.js';
import { ANALYSIS_LAYERS, ANALYSIS_YEARS, ALARM_RANK_DEFAULT, ALARM_RANK_MAX, MONITORING_STATUS_LABELS } from './analysis-catalog.js';
import { CAMERA_HEAT_COLOR_STOPS } from './camera-analysis-data.js';
import { unitNeighborhoodColor } from './analysis-quadrants.js';
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const fullNumber = new Intl.NumberFormat('es-CL');
const compactNumber = new Intl.NumberFormat('es-CL', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 1 });
const number = value => fullNumber.format(value);
const visibleTotal = value => value < 100000000 ? number(value) : compactNumber.format(value);
const hasCount = value => Number.isSafeInteger(value) && value >= 0;
const HIGH_ROBBERY_THRESHOLD = .9;
const MAX_HIGHLIGHTED_UNITS = 3;
export const CAMERA_CHOICES = {
  state: [['all','Todos'],['Operativa','Operativas'],['Mantención','Mantención'],['Inactiva','Inactivas']],
  type: [['all','Todos'],['Domo','Domo'],['Fija','Fija'],['Lectora de patentes','Lectora de patentes']]
};
export const SECURITY_CHOICES = {
  period: [['all','Todo el día'],['madrugada','Madrugada','00–06 h'],['manana','Mañana','06–12 h'],['tarde','Tarde','12–18 h'],['noche','Noche','18–24 h']]
};

/** Shared progressive controls; each dataset owns its filters and popover. */
export function createAnalysisPanel(overlay, container, layer, callbacks) {
  const { id: kind, prefix, resource, label, tone } = layer, camera = kind === 'cameras';
  const controls = [], filterButtons = [], modeButtons = [];
  let state = null, picker = null, companionState = null;
  const el = (tag, cls, text) => { const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e; };
  const panel=el('section',`analysis-panel analysis-${tone}-panel`);
  panel.setAttribute('aria-label',label);
  panel.dataset.kind=kind;
  panel.dataset.theme='seguridad';
  function button(parent,id,label,callback,cls='') {
    const e=el('button',cls,label);e.id=id;e.type='button';e.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(e.getAttribute('aria-disabled')!=='true')callback(event,e);});parent.append(e);controls.push(e);return e;
  }
  const header=el('header','analysis-heading');
  const titleRow=el('div','analysis-title-row'),title=el('h1',null,'Análisis');
  title.id=`${prefix}-title`;
  panel.setAttribute('aria-labelledby',title.id);
  const comparisonSlot=el('div','analysis-comparison-slot');
  titleRow.append(title,comparisonSlot);
  const category=button(header,`${prefix}-layers`,label,(_,anchor)=>callbacks.catalog(state.side==='right'?'compare':'primary',anchor),'analysis-layer-trigger');
  category.dataset.tone=tone;category.setAttribute('aria-haspopup','dialog');category.setAttribute('aria-expanded','false');
  category.setAttribute('aria-controls','analysis-layer-picker');
  const categoryOptions=el('div','analysis-category-choices');
  categoryOptions.setAttribute('role','group');
  categoryOptions.setAttribute('aria-label','Datos de análisis');
  const categoryButtons=ANALYSIS_LAYERS.map(option=>{
    const caption=option.id==='fixed'?'Casetas':option.label;
    const choice=button(categoryOptions,`${prefix}-category-${option.id}`,null,(_,anchor)=>{
      if(option.id!==kind)callbacks.category(option.id,anchor);
    },'analysis-category-choice');
    choice.append(el('span','analysis-category-label',caption));
    choice.dataset.tone=option.tone;
    choice.setAttribute('aria-pressed',String(option.id===kind));
    if(option.id==='fixed')choice.setAttribute('aria-label','Casetas de seguridad ciudadana');
    return choice;
  });
  header.append(titleRow,categoryOptions,category);
  const body=el('div','analysis-body'),stats=el('section','analysis-stats');stats.setAttribute('aria-label','Resultados de la consulta');
  const resultLabel=el('p','analysis-result-label','Total del área');
  const totalRow=el('div','analysis-total-row'),total=el('strong',null,'—');total.id=`${prefix}-total`;
  const totalLabel=el('span','analysis-total-label',layer.count);totalRow.append(total,totalLabel);
  const selectedPeriod=el('p','analysis-selected-period','Cargando datos…');
  const spatialContext=el('p','analysis-spatial-context');
  stats.setAttribute('role','status');stats.setAttribute('aria-atomic','true');
  const empty=el('p','analysis-empty','Sin resultados. Cambia el período o el área.');empty.hidden=true;
  const heatKey=el('div','analysis-heat-key');heatKey.hidden=true;
  heatKey.setAttribute('role','img');
  heatKey.setAttribute('aria-label',`Concentración local de ${layer.count}, de baja a alta`);
  const heatRamp=el('span','analysis-heat-ramp');
  const stops=camera?CAMERA_HEAT_COLOR_STOPS:HEAT_COLOR_STOPS;
  heatRamp.style.background=`linear-gradient(90deg,${stops.map(stop=>`rgb(${stop.color.join(',')}) ${stop.value*100}%`).join(',')})`;
  heatKey.append(el('span','analysis-heat-label','Concentración local'),el('span',null,'Baja'),heatRamp,el('span',null,'Alta'));
  stats.append(resultLabel,totalRow,selectedPeriod,empty);
  const monitoring=kind==='fixed'?el('p','analysis-monitoring-count'):null;
  if(monitoring)stats.append(monitoring);
  const area=el('fieldset','analysis-filter analysis-quadrant-filter');
  const areaLegend=el('legend',null,'Área');
  const areaTrigger=button(area,`${prefix}-area-picker`,'Unidades vecinales',()=>openPicker('area'),'analysis-area-trigger');
  areaTrigger.setAttribute('aria-haspopup','dialog');areaTrigger.setAttribute('aria-expanded','false');
  const scopeActions=el('div','analysis-area-actions');
  const whole=button(scopeActions,`${prefix}-quadrant-all`,'Toda la comuna',()=>callbacks.clearQuadrants(),'analysis-quadrant-reset');
  const noSelection=button(scopeActions,`${prefix}-quadrant-empty`,'Quitar selección',()=>callbacks.emptyQuadrants(),'analysis-quadrant-reset');
  const mapKey=el('div','analysis-boundary-key');mapKey.setAttribute('aria-label','Límites en el mapa');
  mapKey.append(el('span','analysis-boundary-unit','Unidad vecinal'),el('span','analysis-boundary-part','Subcuadrante'));
  const outsideKey=el('span','analysis-boundary-outside','Fuera del área elegida');outsideKey.hidden=true;
  mapKey.append(outsideKey);
  area.prepend(areaLegend,spatialContext);area.append(scopeActions,mapKey);
  const filters=el('section','analysis-query-filters');filters.setAttribute('aria-label','Filtros');
  body.append(area,filters);
  const resourceList=kind==='fixed'?el('div','analysis-resource-list'):null;
  let currentRecords=null;
  function group(key,label,options,callback) {
    const f=el('fieldset',`analysis-filter analysis-filter-${key}`),legend=el('legend',null,label),g=el('div','analysis-options');
    g.setAttribute('role','group');g.setAttribute('aria-label',label);
    for(const [value,text,detail] of options) {
      const e=button(g,`${prefix}-${key}-${value}`,text,()=>callback(value));e.dataset.filter=key;e.dataset.value=value;
      if(detail)e.append(el('small',null,detail));filterButtons.push(e);
    }
    f.append(legend,g);filters.append(f);return f;
  }
  if(resource)group('year','Año',ANALYSIS_YEARS.map(year=>[year,year]),year=>callbacks.resourceFilters({year}));
  let ranking, rankRange, rankValue, rankLess, rankMore;
  if(kind==='alarms'){
    group('usage','Uso de los botones',[['all','Todos'],['top','Más usados']],usage=>callbacks.resourceFilters({usage}));
    ranking=el('div','analysis-ranking');ranking.hidden=true;
    const rankHeading=el('div','analysis-ranking-heading');
    const rankLabel=el('label',null,'Cantidad de botones');
    rankRange=el('input');rankRange.type='range';rankRange.min='1';rankRange.max=String(ALARM_RANK_MAX);rankRange.value=String(ALARM_RANK_DEFAULT);
    rankRange.id=`${prefix}-rank-limit`;rankLabel.htmlFor=rankRange.id;
    rankValue=el('span','analysis-ranking-value');
    rankHeading.append(rankLabel,rankValue);
    const rankControls=el('div','analysis-ranking-controls');
    rankLess=button(rankControls,`${prefix}-rank-less`,'−',()=>callbacks.resourceFilters({limit:rankRange.valueAsNumber-1}));
    rankLess.setAttribute('aria-label','Mostrar un botón menos');
    rankRange.addEventListener('input',()=>callbacks.resourceFilters({limit:rankRange.valueAsNumber}));
    rankControls.append(rankRange);
    rankMore=button(rankControls,`${prefix}-rank-more`,'+',()=>callbacks.resourceFilters({limit:rankRange.valueAsNumber+1}));
    rankMore.setAttribute('aria-label','Mostrar un botón más');
    ranking.append(rankHeading,rankControls);filters.append(ranking);
  }
  const timeField=el('div','analysis-filter analysis-filter-date');
  const timeHeading=el('div','analysis-date-heading-row'),timeLabel=el('span',null,'Período');
  timeLabel.id=`${prefix}-period-label`;
  timeField.setAttribute('role','group');timeField.setAttribute('aria-labelledby',timeLabel.id);
  const timeModes=el('div','analysis-options');
  ['all','year','month'].forEach((mode,i)=>modeButtons.push(button(timeModes,`${prefix}-mode-${mode}`,['Todo','Año','Mes'][i],()=>callbacks.mode(mode))));
  const dateSelection=el('div','analysis-date-selection');dateSelection.hidden=true;
  const yearOptions=el('div','analysis-options analysis-year-options');
  yearOptions.setAttribute('role','group');yearOptions.setAttribute('aria-label','Año');
  const yearButtons=resource?[]:ANALYSIS_YEARS.map(year=>button(yearOptions,`${prefix}-year-${year}`,year,()=>{
    if(state.filters.year!==year)callbacks.filters({year});
    else if(state.temporalMode==='year'){
      callbacks.mode('all');
      modeButtons[0].focus({preventScroll:true});
    }
  }));
  dateSelection.append(yearOptions);
  const monthPicker=button(timeHeading,`${prefix}-month-picker`,'Diciembre',()=>openPicker('month'),'analysis-month-picker');
  timeHeading.prepend(timeLabel);
  monthPicker.setAttribute('aria-haspopup','dialog');monthPicker.setAttribute('aria-expanded','false');
  timeField.append(timeHeading,timeModes,dateSelection);if(!resource)filters.append(timeField);
  const reset=kind==='security'?button(timeField,`${prefix}-reset`,'Limpiar fecha y horario',()=>{
    callbacks.reset();
    modeButtons[0].focus({preventScroll:true});
  },'analysis-reset'):null;
  const cameraFilters=el('div','analysis-camera-filters'),cameraTriggers={};
  if(camera) {
    for(const [key,label] of [['type','Tipo de cámara'],['state','Estado']]) {
      const e=button(cameraFilters,`${prefix}-${key}-picker`,label,()=>openPicker(key));e.setAttribute('aria-haspopup','dialog');cameraTriggers[key]=e;
    }
    filters.append(cameraFilters);
  } else if(!resource) {
    const robberyFilters=el('div','analysis-robbery-filter');
    const trigger=button(robberyFilters,`${prefix}-robbery-picker`,'Tipo de robo: Todos ▾',()=>openPicker('robbery'));
    const periodTrigger=button(robberyFilters,`${prefix}-period-picker`,'Horario: Todo el día ▾',()=>openPicker('period'));
    trigger.setAttribute('aria-haspopup','dialog');periodTrigger.setAttribute('aria-haspopup','dialog');
    cameraTriggers.robbery=trigger;cameraTriggers.period=periodTrigger;filters.append(robberyFilters);
  }
  if(camera)group('display','Vista del mapa',[['points','Puntos'],['heatmap','Mapa de calor']],value=>callbacks.display(value));
  let resourceToggle=null;
  if(resourceList){
    resourceList.id=`${prefix}-locations`;resourceList.hidden=true;
    resourceToggle=button(body,`${prefix}-locations-toggle`,'Ver ubicaciones',()=>{
      resourceList.hidden=!resourceList.hidden;resourceToggle.setAttribute('aria-expanded',String(!resourceList.hidden));
      resourceToggle.textContent=resourceList.hidden?'Ver ubicaciones':'Ocultar ubicaciones';
    },'analysis-location-toggle');
    resourceToggle.setAttribute('aria-expanded','false');resourceToggle.setAttribute('aria-controls',resourceList.id);
    body.append(resourceList);
  }
  const footer=el('footer','analysis-footer');
  const inspectorSlot=el('div','analysis-inspector-slot');
  const actions=el('div','analysis-actions');
  const compare=button(actions,`${prefix}-cross`,'Comparar con…',(_,anchor)=>callbacks.catalog('compare',anchor),'analysis-compare');
  const forecast=button(actions,`${prefix}-forecast`,'Simular inversión',(_,anchor)=>callbacks.forecast(anchor),'forecast-entry');
  const companionTrigger=button(actions,`${prefix}-companion-options`,'Tabla complementaria',()=>openPicker('companion'),'analysis-companion-trigger');
  companionTrigger.hidden=true;
  companionTrigger.setAttribute('aria-haspopup','dialog');companionTrigger.setAttribute('aria-expanded','false');
  compare.setAttribute('aria-haspopup','dialog');compare.setAttribute('aria-expanded','false');
  compare.setAttribute('aria-controls','analysis-layer-picker');
  const opacityRow=el('div','analysis-opacity'),opacityLabel=el('label',null,'Visibilidad'),opacityValue=el('output',null,'100%');
  const slider=document.createElement('input');slider.type='range';slider.min='10';slider.max='100';slider.step='5';slider.id=`${prefix}-opacity`;slider.setAttribute('aria-label',`Visibilidad: ${label}`);opacityLabel.htmlFor=slider.id;
  slider.addEventListener('input',()=>callbacks.opacity(Number(slider.value)/100));
  const less=button(opacityRow,`${prefix}-opacity-less`,'−',()=>callbacks.opacity(Math.max(.1,(state?.opacity||1)-.1)));
  opacityRow.prepend(opacityLabel);opacityRow.append(slider,opacityValue);
  button(opacityRow,`${prefix}-opacity-more`,'+',()=>callbacks.opacity(Math.min(1,(state?.opacity||1)+.1))).setAttribute('aria-label','Aumentar visibilidad');
  less.setAttribute('aria-label','Disminuir visibilidad');
  footer.append(stats,heatKey,inspectorSlot,opacityRow,actions);panel.append(header,body,footer);
  let timeline=null,playbackButton=null,timelineSlider=null,timelineOutput=null,playIcon=null,pauseIcon=null;
  if(kind==='security') {
    timeline=el('section','analysis-timeline-bar');timeline.hidden=true;timeline.setAttribute('aria-label','Línea de tiempo de robos');
    playbackButton=button(timeline,'analysis-playback','',()=>callbacks.playback(),'analysis-playback');
    playbackButton.setAttribute('aria-label','Reproducir recorrido del día');playbackButton.setAttribute('aria-pressed','false');
    const icon=path=>{
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
      const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d',path);svg.append(shape);return svg;
    };
    playIcon=icon('M8 5 19 12 8 19Z');pauseIcon=icon('M7 5H10V19H7ZM14 5H17V19H14Z');pauseIcon.setAttribute('hidden','');
    playbackButton.append(playIcon,pauseIcon);
    const timelineHeading=el('div','analysis-timeline-heading');timelineOutput=el('output',null,'Todo el día');timelineOutput.setAttribute('aria-live','off');
    timelineHeading.append(el('strong',null,'Recorrido del día'),timelineOutput);
    timelineSlider=el('input','analysis-timeline-slider');timelineSlider.type='range';timelineSlider.id='analysis-timeline';timelineSlider.min='0';timelineSlider.max='1000';timelineSlider.step='1';timelineSlider.value='0';
    timelineSlider.setAttribute('aria-label','Posición en el recorrido del día');timelineSlider.setAttribute('aria-valuetext','Todo el día. Elige una hora en el recorrido.');
    timelineSlider.title='Arrastra para volver o ir a un momento del día.';
    const seek=()=>callbacks.seek(Number(timelineSlider.value)/1000);
    timelineSlider.addEventListener('pointerdown',seek);timelineSlider.addEventListener('input',seek);
    const ticks=el('div','analysis-timeline-ticks');
    for(const hour of [0,6,12,18,24]) {
      const tick=button(ticks,`analysis-time-${hour}`,`${String(hour).padStart(2,'0')} h`,()=>callbacks.seek(hour/24));
      tick.setAttribute('aria-label',hour===24?'Ir al final del día':`Ir a las ${String(hour).padStart(2,'0')}:00`);
    }
    timeline.append(timelineHeading,timelineSlider,ticks);
    stats.after(timeline);
    for(const type of ['pointerdown','mousedown','touchstart','click','dblclick','wheel'])timeline.addEventListener(type,event=>event.stopPropagation());
  }
  const popover=el('section','analysis-date-popover');popover.id=`${prefix}-filter-popover`;popover.hidden=true;popover.setAttribute('role','dialog');popover.setAttribute('aria-labelledby',`${prefix}-picker-title`);
  for(const control of [areaTrigger,monthPicker,companionTrigger,...Object.values(cameraTriggers)])control.setAttribute('aria-controls',popover.id);
  const popoverHeading=el('div','analysis-date-heading'),popoverTitle=el('strong');popoverTitle.id=`${prefix}-picker-title`;popoverHeading.append(popoverTitle);
  const close=button(popoverHeading,`${prefix}-date-close`,'×',closePicker);close.setAttribute('aria-label','Cerrar opciones');
  const grids={};
  const areaPicker=el('div','analysis-area-picker');grids.area=areaPicker;
  const areaSummary=el('p','analysis-area-summary');
  areaSummary.setAttribute('role','status');
  const rankingToolbar=el('div','analysis-area-order');
  rankingToolbar.hidden=true;
  const rankingPeriod=el('p','analysis-area-ranking-period');
  const orderChoices=el('div','analysis-options');
  orderChoices.setAttribute('role','group');
  orderChoices.setAttribute('aria-label','Orden de las zonas');
  let areaOrder='most';
  const orderButtons=new Map([
    ['most','Más robos'],['least','Menos robos'],['number','Por número']
  ].map(([order,text])=>[order,button(orderChoices,`${prefix}-area-sort-${order}`,text,()=>{
    areaOrder=order;
    updateAreaSelection();
  })]));
  rankingToolbar.append(rankingPeriod,orderChoices);
  const totalsHeading=el('div','analysis-area-totals-heading');
  const totalsZone=el('span',null,'Unidad');
  totalsHeading.append(totalsZone,el('span',null,'Total de robos'));
  const unitGrid=el('div','analysis-unit-grid');
  unitGrid.setAttribute('role','group');
  unitGrid.setAttribute('aria-label','Unidades vecinales');
  const unitDetail=el('div','analysis-unit-detail');unitDetail.hidden=true;
  const unitBack=button(unitDetail,`${prefix}-unit-back`,'‹ Otras unidades',()=>showAreaUnit(null),'analysis-unit-back');
  const unitAll=button(unitDetail,`${prefix}-unit-all`,'Seleccionar toda la unidad',()=>callbacks.toggleUnit(activeUnitId),'analysis-unit-all');
  const childGrid=el('div','analysis-subquadrant-grid');childGrid.setAttribute('role','group');
  unitDetail.append(childGrid);
  const areaRobberyTotal=el('div','analysis-area-robbery-summary');
  const areaTotalValue=el('strong');
  areaRobberyTotal.append(el('span',null,'Total del área'),areaTotalValue);
  areaPicker.append(areaSummary,unitBack,unitAll,rankingToolbar,totalsHeading,unitGrid,unitDetail,areaRobberyTotal);
  popover.append(areaPicker);
  const unitButtonsById=new Map(),areaButtonsById=new Map();
  let areaUnits=[],unitsSource=null,activeUnitId=null;
  function showAreaUnit(id,focus=true) {
    const previous=activeUnitId;
    activeUnitId=id;
    const unit=areaUnits.find(item=>item.id===id);
    unitGrid.hidden=Boolean(unit);
    unitBack.hidden=unitAll.hidden=unitDetail.hidden=!unit;
    if(unit)unitDetail.style.setProperty('--unit-color',unitNeighborhoodColor(unit.id));
    for(const [childId,{control}] of areaButtonsById)control.hidden=!unit?.children.some(child=>child.id===childId);
    popoverTitle.textContent=unit?`Unidad vecinal ${unit.label}`:'Unidades vecinales';
    childGrid.setAttribute('aria-label',unit?`Subcuadrantes de la unidad vecinal ${unit.label}`:'Subcuadrantes');
    updateAreaSelection();
    if(focus) {
      positionPicker(areaTrigger);
      const row=unit?unitAll:unitButtonsById.get(previous)?.control||unitGrid.querySelector('button');
      row?.focus();
    }
  }
  function updateAreaUnits(units) {
    if(units===unitsSource)return;
    unitsSource=units;areaUnits=units;
    for(const {control} of [...unitButtonsById.values(),...areaButtonsById.values()]) controls.splice(controls.indexOf(control),1);
    unitButtonsById.clear();areaButtonsById.clear();unitGrid.replaceChildren();childGrid.replaceChildren();
    for(const unit of units) {
      const control=button(unitGrid,`${prefix}-unit-${unit.id}`,'',()=>showAreaUnit(unit.id),'analysis-unit-option');
      control.style.setProperty('--unit-color',unitNeighborhoodColor(unit.id));
      const total=el('span','analysis-unit-robbery-total'),selection=el('span','analysis-unit-count');
      control.append(el('span','analysis-unit-number',unit.label),selection,total);
      unitButtonsById.set(unit.id,{control,total,selection});
      for(const child of unit.children) {
        const item=button(childGrid,`${prefix}-quadrant-${child.id}`,'',()=>callbacks.toggleQuadrant(child.id),'analysis-subquadrant-option');
        const count=el('span','analysis-unit-robbery-total');
        item.append(el('span','analysis-subquadrant-number',child.label),count);
        areaButtonsById.set(child.id,{control:item,total:count});
      }
    }
    if(!areaUnits.some(unit=>unit.id===activeUnitId))activeUnitId=null;
    showAreaUnit(activeUnitId,false);
  }
  function orderAreaRows(list,areas,buttons,counts) {
    const canRank=Boolean(counts)&&areaOrder!=='number';
    const direction=areaOrder==='least'?1:-1;
    const ordered=canRank?[...areas].sort((a,b)=>direction*((counts[a.id]??0)-(counts[b.id]??0))):areas;
    for(const [index,area] of ordered.entries()){
      const {control}=buttons.get(area.id),atIndex=list.children.item(index);
      if(control!==atIndex)list.insertBefore(control,atIndex);
    }
  }
  function updateCount({control,total},value,high=false) {
    const valid=hasCount(value);
    const raw=valid?number(value):'';
    total.hidden=!valid;
    total.textContent=valid?visibleTotal(value):'';
    total.dataset.highRobberies=String(high);
    if(valid)control.dataset.robberyTotal=String(value);
    else delete control.dataset.robberyTotal;
    return raw?`, ${raw} ${value===1?'robo':'robos'}`:'';
  }
  function updateAreaSelection() {
    const selected=new Set(state?.quadrantIds??[]);
    const robberyTotals=state?.robberyTotals;
    const units=robberyTotals?.units,parts=robberyTotals?.parts;
    const unit=areaUnits.find(item=>item.id===activeUnitId);
    const scopeCounts=unit?parts:units;
    const shownAreas=unit?.children??areaUnits;
    const canInspect=Boolean(scopeCounts);
    const most=shownAreas.reduce((highest,area)=>Math.max(highest,scopeCounts?.[area.id]??0),0);
    const highlighted=new Set(shownAreas.filter(area=>most>0&&scopeCounts[area.id]>=most*HIGH_ROBBERY_THRESHOLD)
      .sort((a,b)=>scopeCounts[b.id]-scopeCounts[a.id]).slice(0,MAX_HIGHLIGHTED_UNITS).map(area=>area.id));
    rankingToolbar.hidden=most<=0;
    totalsHeading.hidden=!canInspect;
    totalsZone.textContent=unit?'Subcuadrante':'Unidad';
    rankingPeriod.textContent=robberyTotals?.period??'';
    for(const [order,button] of orderButtons)button.setAttribute('aria-pressed',String(order===areaOrder));
    unitGrid.dataset.totals=childGrid.dataset.totals=String(canInspect);
    orderAreaRows(unitGrid,areaUnits,unitButtonsById,units);
    if(unit)orderAreaRows(childGrid,unit.children,areaButtonsById,parts);
    for(const area of areaUnits) {
      const entry=unitButtonsById.get(area.id),{control,selection}=entry;
      const count=area.children.filter(child=>selected.has(child.id)).length;
      const high=!unit&&highlighted.has(area.id);
      const robbery=updateCount(entry,units?.[area.id],high);
      control.disabled=!state?.canChoose;
      control.dataset.selection=count===0?'none':count===area.children.length?'all':'partial';
      const scope=state?.quadrantIds===null?'incluida en toda la comuna':`${count} de ${area.children.length} subcuadrantes seleccionados`;
      const description=`Unidad vecinal ${area.label}${robbery}${high?', entre las de mayor cantidad':''}, ${scope}`;
      control.setAttribute('aria-label',description);control.title=description;
      selection.textContent=count?`${count}/${area.children.length}`:'';
    }
    for(const [id,entry] of areaButtonsById) {
      const {control}=entry;
      const active=selected.has(id);
      const robbery=updateCount(entry,parts?.[id],Boolean(unit)&&highlighted.has(id));
      control.disabled=!state?.canChoose;
      control.setAttribute('aria-pressed',String(active));
      control.setAttribute('aria-label',`Subcuadrante ${id}${robbery}`);
      control.title=`Subcuadrante ${id}${robbery}`;
    }
    const all=Boolean(unit?.children.length)&&unit.children.every(child=>selected.has(child.id));
    unitAll.disabled=!state?.canChoose;unitBack.disabled=!state?.canChoose;
    unitAll.setAttribute('aria-pressed',String(all));
    unitAll.textContent=all?'Quitar toda la unidad':'Seleccionar toda la unidad';
    const scope=state?.spatialLabel??'Toda la comuna';
    if(areaSummary.textContent!==scope)areaSummary.textContent=scope;
    const count=robberyTotals?.areaTotal;
    areaRobberyTotal.hidden=!hasCount(count);
    if(!areaRobberyTotal.hidden){
      const noun=count===1?'robo':'robos';
      areaTotalValue.textContent=`${visibleTotal(count)} ${noun}`;
      areaTotalValue.title=`${number(count)} ${noun}`;
    }
  }
  const companionPicker=el('div','analysis-companion-options');
  grids.companion=companionPicker;
  const levelOptions=el('fieldset','analysis-companion-choice');
  const levelChoices=el('div','analysis-options');
  const levelButtons=new Map([
    ['','Según el área'],['unit','Unidades'],['part','Subcuadrantes']
  ].map(([level,label])=>[level,button(levelChoices,`${prefix}-companion-level-${level||'auto'}`,label,()=>{
    callbacks.companionRanking({level,page:0});
  })]));
  levelOptions.append(el('legend',null,'Nivel territorial'),levelChoices);
  const sortOptions=el('fieldset','analysis-companion-choice');
  const sortChoices=el('div','analysis-options');
  sortOptions.append(el('legend',null,'Orden'),sortChoices);
  let sortButtons=new Map(),sortSignature='';
  const pages=el('div','analysis-companion-pages');
  pages.setAttribute('role','group');pages.setAttribute('aria-label','Página de la tabla complementaria');
  const previousPage=button(pages,`${prefix}-companion-page-previous`,'Anterior',()=>{
    callbacks.companionRanking({page:companionState.page-1});
  });
  const pagePosition=el('output');pagePosition.setAttribute('aria-live','polite');
  pages.append(pagePosition);
  const nextPage=button(pages,`${prefix}-companion-page-next`,'Siguiente',()=>{
    callbacks.companionRanking({page:companionState.page+1});
  });
  companionPicker.append(levelOptions,sortOptions,pages);
  popover.append(companionPicker);

  function setCompanionRanking(next){
    if(companionState===next)return;
    companionState=next;
    companionTrigger.hidden=!next;
    if(!next){
      if(picker==='companion')closePicker();
      return;
    }
    const signature=JSON.stringify(next.options);
    if(signature!==sortSignature){
      sortSignature=signature;
      for(const control of sortButtons.values())controls.splice(controls.indexOf(control),1);
      sortChoices.replaceChildren();
      sortButtons=new Map(next.options.map(([order,label])=>[order,button(sortChoices,`${prefix}-companion-order-${order.replace(':','-')}`,label,()=>{
        callbacks.companionRanking({order,page:0});
      })]));
    }
    for(const [level,control] of levelButtons)control.setAttribute('aria-pressed',String(level===(next.automatic?'':next.level)));
    for(const [order,control] of sortButtons)control.setAttribute('aria-pressed',String(order===next.order));
    previousPage.setAttribute('aria-disabled',String(next.page===0));
    nextPage.setAttribute('aria-disabled',String(next.page+1>=next.pageCount));
    const position=`${number(next.first)}–${number(next.last)} de ${number(next.total)}`;
    if(pagePosition.textContent!==position)pagePosition.textContent=position;
  }
  for(const [key,items] of resource?[]:[['month',MONTHS.map((m,i)=>[String(i+1).padStart(2,'0'),m])],...(camera?Object.entries(CAMERA_CHOICES):[['robbery',[['all','Todos'],...SECURITY_ROBBERY_TYPES.map(type=>[type.value,type.label])]],['period',SECURITY_CHOICES.period]])]) {
    const grid=el('div','analysis-date-grid');grid.dataset.grid=key;grids[key]=grid;
    for(const [value,label,detail] of items) {
      const idValue=['month','robbery','period'].includes(key)?value:items.findIndex(item=>item[0]===value);
      const e=button(grid,`${prefix}-${key}-${idValue}`,label,()=>{
        if(key==='type')callbacks.cameraType(value);
        else if(key==='robbery')callbacks.robbery(value);
        else {callbacks.filters({[key]:value});closePicker();}
      });e.dataset.option=key;e.dataset.value=value;
      if(detail)e.append(el('small',null,detail));
    }
    popover.append(grid);
  }
  popover.prepend(popoverHeading);overlay.append(panel,popover);
  for(const area of [panel,popover])for(const type of ['pointerdown','mousedown','touchstart','click','dblclick','wheel'])area.addEventListener(type,event=>event.stopPropagation());
  function pickerAnchor(key){
    if(key==='area')return areaTrigger;
    if(key==='month')return monthPicker;
    if(key==='companion')return companionTrigger;
    return cameraTriggers[key];
  }
  function closePicker(){
    const anchor=pickerAnchor(picker);
    if(popover.contains(document.activeElement)&&anchor?.getClientRects().length)anchor.focus({preventScroll:true});
    picker=null;popover.hidden=true;
    for(const e of [areaTrigger,monthPicker,companionTrigger,...Object.values(cameraTriggers)])e.setAttribute('aria-expanded','false');
  }
  function positionPicker(anchor) {
    const outer=container.getBoundingClientRect(),a=anchor.getBoundingClientRect(),p=popover.getBoundingClientRect(),r=panel.getBoundingClientRect();
    const left=panel.dataset.side==='right'?r.left-outer.left-p.width-10:r.right-outer.left+10;
    popover.style.left=`${Math.max(12,Math.min(outer.width-p.width-12,left))}px`;
    popover.style.top=`${Math.max(68,Math.min(outer.height-p.height-12,a.top-outer.top))}px`;
  }
  function openPicker(key) {
    if(!state?.loaded || !grids[key] || key==='area'&&!state.canChoose
      || key==='month'&&state.temporalMode!=='month' || key==='companion'&&!companionState)return;
    if(picker===key){closePicker();return;}
    callbacks.clearHover(key);picker=key;popover.dataset.picker=key;popover.hidden=false;
    for(const e of [areaTrigger,monthPicker,companionTrigger,...Object.values(cameraTriggers)])e.setAttribute('aria-expanded','false');
    for(const [name,grid] of Object.entries(grids))grid.hidden=name!==key;
    popoverTitle.textContent={area:'Unidades vecinales',companion:'Tabla complementaria',month:`Elige el mes · ${state.selectedYear}`,state:'Estado de las cámaras',type:'Tipos de cámara',robbery:'Tipos de robo',period:'Horario del día'}[key];
    if(key==='area')showAreaUnit(null,false);
    const anchor=pickerAnchor(key);anchor.setAttribute('aria-expanded','true');
    positionPicker(anchor);
    const first=key==='area'?(rankingToolbar.hidden?unitGrid.querySelector('button'):orderButtons.get(areaOrder)):(grids[key].querySelector('[aria-pressed="true"]')||grids[key].querySelector('button'));
    first?.focus({preventScroll:true});
  }
  function update(next) {
    state=next;panel.hidden=!next.visible;panel.dataset.side=next.side;
    const primary=next.side==='left';
    title.textContent=primary?'Análisis':'Comparación';
    categoryOptions.hidden=next.crossed;category.hidden=!next.crossed;
    category.setAttribute('aria-label',`${primary?'Cambiar análisis':'Cambiar comparación'}: ${label}`);
    forecast.hidden=!primary;
    controls.forEach(e=>{e.disabled=!next.loaded;});
    category.disabled=compare.disabled=!next.canChoose;
    categoryButtons.forEach(choice=>{choice.disabled=!next.canChoose;});
    forecast.disabled=!next.canChoose;
    comparisonSlot.hidden=primary||!next.crossed;
    areaLegend.textContent=next.crossed?'Área compartida':'Área';
    areaTrigger.hidden=scopeActions.hidden=!primary;
    mapKey.hidden=!primary;
    outsideKey.hidden=next.quadrantIds===null;
    updateAreaUnits(next.units??[]);updateAreaSelection();
    areaTrigger.disabled=!next.canChoose||areaUnits.length===0;
    whole.setAttribute('aria-pressed',String(next.quadrantIds===null));
    noSelection.setAttribute('aria-pressed',String(next.quadrantIds?.length===0));
    whole.disabled=noSelection.disabled=!next.canChoose;
    const scopeText=next.spatialLabel??'Toda la comuna';
    if(spatialContext.textContent!==scopeText)spatialContext.textContent=scopeText;
    heatKey.hidden=!next.loaded||Boolean(next.error)||next.summary.total===0||resource||camera&&next.display!=='heatmap';
    if(timeline){timeline.hidden=!next.visible;timeline.dataset.crossed=String(next.crossed);timelineSlider.disabled=!next.loaded;updatePlayback(next.playback);}
    const f=next.filters;
    filterButtons.forEach(e=>{
      e.setAttribute('aria-pressed',String((e.dataset.filter==='display'?next.display:f[e.dataset.filter])===e.dataset.value));
      if(e.dataset.filter==='year')e.disabled=!next.loaded||!next.historyByYear?.has(e.dataset.value);
      if(e.dataset.filter==='usage'&&e.dataset.value==='top')e.disabled=!next.loaded||!next.rankCount;
    });
    if(ranking){
      ranking.hidden=f.usage!=='top';
      const max=Math.max(1,next.rankCount||0);
      const shown=Math.min(f.limit,max);
      rankRange.max=String(max);rankRange.value=String(shown);rankRange.disabled=!next.loaded||!next.rankCount;
      const count=next.rankCount?`${shown} ${shown===1?'botón':'botones'}`:'Sin botones';
      rankValue.textContent=count;rankRange.setAttribute('aria-valuetext',count);
      rankLess.setAttribute('aria-disabled',String(shown<=1));
      rankMore.setAttribute('aria-disabled',String(shown>=max));
    }
    modeButtons.forEach((e,i)=>e.setAttribute('aria-pressed',String(['all','year','month'][i]===next.temporalMode)));
    dateSelection.hidden=next.temporalMode==='all';monthPicker.hidden=next.temporalMode!=='month';
    yearButtons.forEach((e,i)=>e.setAttribute('aria-pressed',String(f.year===ANALYSIS_YEARS[i])));
    const monthName=MONTHS[Number(next.selectedMonth)-1];
    monthPicker.textContent=`${monthName} ▾`;
    monthPicker.setAttribute('aria-label',`Cambiar mes · ${monthName}`);
    if(reset)reset.hidden=f.period==='all';
    for(const e of popover.querySelectorAll('[data-option]')){
      const value=e.dataset.option==='month'?next.selectedMonth:f[e.dataset.option];
      e.setAttribute('aria-pressed',String(Array.isArray(value)?value.includes(e.dataset.value):value===e.dataset.value));
    }
    const resultTotal=next.loaded?visibleTotal(next.summary.total):'—';
    if(total.textContent!==resultTotal)total.textContent=resultTotal;
    if(next.loaded)total.title=number(next.summary.total);else total.removeAttribute('title');
    const hour=SECURITY_CHOICES.period.find(item=>item[0]===f.period);
    const date=next.dateRange?.label||'2023–2025';
    const cutoff=next.dateRange?.end?.split('-').reverse().join('/');
    const context=next.error?'No se pudieron cargar los datos.':!next.loaded?'Cargando datos…'
      :kind==='alarms'?(f.year?`Pulsaciones en ${f.year}`:'Sin datos de pulsaciones')
        :resource?(f.year?`Estado al cierre de ${f.year}`:'Sin historial de estado')
        :camera?`Inventario al ${cutoff||date}`:`${date} · ${hour?.[2]?`${hour[1]} (${hour[2]})`:hour?.[1]||'Todo el día'}`;
    if(selectedPeriod.textContent!==context)selectedPeriod.textContent=context;
    selectedPeriod.dataset.error=String(Boolean(next.error));empty.hidden=!next.loaded||Boolean(next.error)||next.summary.total!==0;
    if(monitoring){
      monitoring.hidden=!next.loaded||!f.year;
      const active=next.summary.monitoring;
      const status=`${number(active||0)} monitoreando · ${number(next.summary.total-(active||0))} fuera de servicio`;
      if(monitoring.textContent!==status)monitoring.textContent=status;
    }
    for(const [key,trigger] of Object.entries(cameraTriggers)){
      const label={robbery:'Tipo de robo',period:'Horario',type:'Tipo de cámara',state:'Estado'}[key];
      const selected=f[key],options=key==='robbery'?SECURITY_ROBBERY_TYPES.map(t=>[t.value,t.label]):key==='period'?SECURITY_CHOICES.period:CAMERA_CHOICES[key];
      const detail=selected==='all'?'Todos':Array.isArray(selected)?selected.length===1?options.find(c=>c[0]===selected[0])?.[1]:`${selected.length} seleccionados`:options.find(c=>c[0]===selected)?.[1];
      trigger.textContent=`${label}: ${key==='period'?hour?.[1]||'Todo el día':detail||'Todos'} ▾`;
    }
    if(resourceList&&currentRecords!==next.filtered){
      currentRecords=next.filtered;
      for(const e of resourceList.querySelectorAll('button'))controls.splice(controls.indexOf(e),1);
      resourceList.replaceChildren();
      for(const record of currentRecords||[]){
        const item=button(resourceList,`${prefix}-loc-${record.id}`,record.title,(_,anchor)=>callbacks.locate(record,anchor),'analysis-resource-location');
        if(record.monitoringStatus)item.append(el('span','analysis-monitoring-status',MONITORING_STATUS_LABELS[record.monitoringStatus]));
        item.append(el('small',null,record.address));
      }
    }
    if(resourceToggle)resourceToggle.disabled=!next.loaded||!next.summary.total;
    const unit=next.summary.total===1?(kind==='fixed'?'ubicación':layer.singular):layer.count;
    if(totalLabel.textContent!==unit)totalLabel.textContent=unit;
    opacityRow.hidden=!next.crossed;compare.hidden=!primary||next.crossed;
    slider.value=String(Math.round(next.opacity*100));opacityValue.textContent=`${Math.round(next.opacity*100)}%`;
    if(!next.visible)closePicker();
  }
  function updatePlayback(playback={}) {
    if(!timeline)return;
    const playing=playback?.playing===true,position=Math.max(0,Math.min(1,Number(playback?.position)||0)),minutes=Math.round(position*24*60);
    const clock=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    const allDay=state?.filters.period==='all'&&!playing;
    stats.setAttribute('aria-busy',String(playing));
    playIcon.toggleAttribute('hidden',playing);pauseIcon.toggleAttribute('hidden',!playing);playbackButton.setAttribute('aria-pressed',String(playing));
    playbackButton.setAttribute('aria-label',playing?'Pausar recorrido del día':'Reproducir recorrido del día');
    playbackButton.title=playing?'Pausar el recorrido':'Reproducir el recorrido del día';
    timelineSlider.value=String(Math.round(position*1000));timelineSlider.style.setProperty('--timeline-progress',`${position*100}%`);
    timelineSlider.setAttribute('aria-valuetext',allDay?'Todo el día. Elige una hora en el recorrido.':`${clock} de 24:00`);timelineOutput.textContent=allDay?'Todo el día':`${clock} / 24:00`;
  }
  function targets(){
    if(panel.hidden)return[];
    const outer=container.getBoundingClientRect(),p=panel.getBoundingClientRect(),b=body.getBoundingClientRect();
    return controls.filter(e=>{
      if(e.disabled||e.getAttribute('aria-disabled')==='true'||!e.getClientRects().length)return false;
      const r=e.getBoundingClientRect();
      const inside=c=>r.top>=c.top-1&&r.bottom<=c.bottom+1&&r.left>=c.left-1&&r.right<=c.right+1;
      if(popover.contains(e))return inside(popover.getBoundingClientRect());
      return inside(p)&&(!body.contains(e)||inside(b));
    })
      .map(e=>{const r=e.getBoundingClientRect();return{id:e.id,x:r.left+r.width/2-outer.left,y:r.top+r.height/2-outer.top,width:r.width,height:r.height,element:e,priority:25};});
  }
  return {element:panel,body,popover,timeline,inspectorSlot,comparisonSlot,controls,update,updatePlayback,setCompanionRanking,openPicker,closePicker,targets,get picker(){return picker;},get isVisible(){return !panel.hidden;}};
}

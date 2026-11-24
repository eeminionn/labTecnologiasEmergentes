import { SECURITY_ROBBERY_TYPES } from './analysis-data.js';
import { ANALYSIS_YEARS, ALARM_RANK_DEFAULT, ALARM_RANK_MAX, MONITORING_STATUS_LABELS } from './analysis-catalog.js';
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const number = value => new Intl.NumberFormat('es-CL').format(value);
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
  let state = null, picker = null;
  const el = (tag, cls, text) => { const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e; };
  const panel=el('section',`analysis-panel analysis-${tone}-panel`);
  panel.setAttribute('aria-label',label);
  panel.dataset.kind=kind;
  function button(parent,id,label,callback,cls='') {
    const e=el('button',cls,label);e.id=id;e.type='button';e.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(e.getAttribute('aria-disabled')!=='true')callback(event,e);});parent.append(e);controls.push(e);return e;
  }
  const header=el('header','analysis-heading');
  const titleRow=el('div','analysis-title-row'),title=el('h1',null,'Análisis del mapa');
  titleRow.append(title);
  const categoryLabel=el('p','analysis-category-label','Qué ver en el mapa');
  const category=button(header,`${prefix}-layers`,label,(_,anchor)=>callbacks.catalog(state.side==='right'?'compare':'primary',anchor),'analysis-layer-trigger');
  category.dataset.tone=tone;category.setAttribute('aria-haspopup','dialog');category.setAttribute('aria-expanded','false');
  const forecast=button(header,`${prefix}-forecast`,'Simular inversión',(_,anchor)=>callbacks.forecast(anchor),'forecast-entry');
  header.append(titleRow,categoryLabel,category,forecast);
  const body=el('div','analysis-body'),stats=el('section','analysis-stats');stats.setAttribute('aria-label','Resultados de la consulta');
  const resultLabel=el('p','analysis-result-label','Resultados de la consulta');
  const totalRow=el('div','analysis-total-row'),total=el('strong',null,'—');total.id=`${prefix}-total`;
  const totalLabel=el('span','analysis-total-label',layer.count);totalRow.append(total,totalLabel);
  const selectedPeriod=el('p','analysis-selected-period','Cargando datos…');
  const spatialContext=el('p','analysis-spatial-context');
  (resource?stats:selectedPeriod).setAttribute('role','status');
  const empty=el('p','analysis-empty',resource?'No hay ubicaciones para mostrar.':`No hay ${layer.count} con estos filtros. Prueba con otro período o restablece los filtros.`);empty.hidden=true;
  stats.append(resultLabel,totalRow,spatialContext,selectedPeriod,empty);
  const monitoring=kind==='fixed'?el('p','analysis-monitoring-count'):null;
  if(monitoring)stats.append(monitoring);
  body.append(stats);
  const area=el('fieldset','analysis-filter analysis-quadrant-filter');
  const areaTrigger=button(area,`${prefix}-area-picker`,'Unidades vecinales',()=>openPicker('area'),'analysis-area-trigger');
  areaTrigger.setAttribute('aria-haspopup','dialog');areaTrigger.setAttribute('aria-expanded','false');
  const whole=button(area,`${prefix}-quadrant-all`,'Toda la comuna',()=>callbacks.clearQuadrants(),'analysis-quadrant-reset');
  area.prepend(el('legend',null,'Área del análisis'));
  body.append(area);
  if(!resource)body.append(el('h2','analysis-filter-title','Ajusta los filtros'));
  const resourceList=kind==='fixed'?el('div','analysis-resource-list'):null;
  let currentRecords=null;
  function group(key,label,options,callback) {
    const f=el('fieldset',`analysis-filter analysis-filter-${key}`),legend=el('legend',null,label),g=el('div','analysis-options');
    g.setAttribute('role','group');g.setAttribute('aria-label',label);
    for(const [value,text,detail] of options) {
      const e=button(g,`${prefix}-${key}-${value}`,text,()=>callback(value));e.dataset.filter=key;e.dataset.value=value;
      if(detail)e.append(el('small',null,detail));filterButtons.push(e);
    }
    f.append(legend,g);body.append(f);return f;
  }
  if(resource)group('year','Año',ANALYSIS_YEARS.map(year=>[year,year]),year=>callbacks.resourceFilters({year}));
  if(resourceList)body.append(el('h2','analysis-filter-title','Ubicaciones en el mapa'),resourceList);
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
    ranking.append(rankHeading,rankControls);body.append(ranking);
  }
  const timeField=el('fieldset','analysis-filter analysis-filter-date'),timeLegend=el('legend',null,'Período'),timeModes=el('div','analysis-options');
  ['all','year','month'].forEach((mode,i)=>modeButtons.push(button(timeModes,`${prefix}-mode-${mode}`,['Todo','Año','Mes'][i],()=>callbacks.mode(mode))));
  const dateSelection=el('div','analysis-date-selection');dateSelection.hidden=true;
  const yearPicker=button(dateSelection,`${prefix}-year-picker`,'2025',()=>openPicker('year'));
  const monthPicker=button(dateSelection,`${prefix}-month-picker`,'Diciembre',()=>openPicker('month'));
  yearPicker.setAttribute('aria-label',camera?'Elegir año de cámaras':'Elegir año');monthPicker.setAttribute('aria-label',camera?'Elegir mes de cámaras':'Elegir mes');
  for(const e of [yearPicker,monthPicker]){e.setAttribute('aria-haspopup','dialog');e.setAttribute('aria-expanded','false');}
  timeField.append(timeLegend,timeModes,dateSelection);if(!resource)body.append(timeField);
  if(camera)group('display','Cómo ver las cámaras',[['points','Puntos'],['heatmap','Concentración']],value=>callbacks.display(value));
  const cameraFilters=el('div','analysis-camera-filters'),cameraTriggers={};
  if(camera) {
    for(const [key,label] of [['type','Tipo de cámara'],['state','Estado']]) {
      const e=button(cameraFilters,`${prefix}-${key}-picker`,label,()=>openPicker(key));e.setAttribute('aria-haspopup','dialog');cameraTriggers[key]=e;
    }
    body.append(cameraFilters);
  } else if(!resource) {
    const robberyFilters=el('div','analysis-robbery-filter');
    const trigger=button(robberyFilters,`${prefix}-robbery-picker`,'Tipo de robo: Todos ▾',()=>openPicker('robbery'));
    const periodTrigger=button(robberyFilters,`${prefix}-period-picker`,'Horario: Todo el día ▾',()=>openPicker('period'));
    trigger.setAttribute('aria-haspopup','dialog');periodTrigger.setAttribute('aria-haspopup','dialog');
    cameraTriggers.robbery=trigger;cameraTriggers.period=periodTrigger;body.append(robberyFilters);
  }
  const footer=el('footer','analysis-footer');
  const actions=el('div','analysis-actions');
  button(actions,`${prefix}-reset`,'Restablecer filtros',()=>callbacks.reset(),'analysis-reset');
  const compare=button(actions,`${prefix}-cross`,'Añadir comparación',(_,anchor)=>callbacks.catalog('compare',anchor),'analysis-compare');
  compare.setAttribute('aria-haspopup','dialog');compare.setAttribute('aria-expanded','false');
  const opacityRow=el('div','analysis-opacity'),opacityLabel=el('label',null,'Visibilidad'),opacityValue=el('output',null,'100%');
  const slider=document.createElement('input');slider.type='range';slider.min='10';slider.max='100';slider.step='5';slider.id=`${prefix}-opacity`;slider.setAttribute('aria-label',`Visibilidad: ${label}`);opacityLabel.htmlFor=slider.id;
  slider.addEventListener('input',()=>callbacks.opacity(Number(slider.value)/100));
  const less=button(opacityRow,`${prefix}-opacity-less`,'−',()=>callbacks.opacity(Math.max(.1,(state?.opacity||1)-.1)));
  opacityRow.prepend(opacityLabel);opacityRow.append(slider,opacityValue);
  button(opacityRow,`${prefix}-opacity-more`,'+',()=>callbacks.opacity(Math.min(1,(state?.opacity||1)+.1))).setAttribute('aria-label','Aumentar visibilidad');
  less.setAttribute('aria-label','Disminuir visibilidad');
  footer.append(opacityRow,actions);panel.append(header,body,footer);
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
    const timelineHeading=el('div','analysis-timeline-heading');timelineOutput=el('output',null,'00:00 / 24:00');timelineOutput.setAttribute('aria-live','off');
    timelineHeading.append(el('strong',null,'Recorrido del día'),timelineOutput);
    timelineSlider=el('input','analysis-timeline-slider');timelineSlider.type='range';timelineSlider.id='analysis-timeline';timelineSlider.min='0';timelineSlider.max='1000';timelineSlider.step='1';timelineSlider.value='0';
    timelineSlider.setAttribute('aria-label','Posición en el recorrido del día');timelineSlider.setAttribute('aria-valuetext','00:00 de 24:00');
    timelineSlider.title='Arrastra para volver o ir a un momento del día.';
    const seek=()=>callbacks.seek(Number(timelineSlider.value)/1000);
    timelineSlider.addEventListener('pointerdown',seek);timelineSlider.addEventListener('input',seek);
    const ticks=el('div','analysis-timeline-ticks');
    for(const hour of [0,6,12,18,24]) {
      const tick=button(ticks,`analysis-time-${hour}`,`${String(hour).padStart(2,'0')} h`,()=>callbacks.seek(hour/24));
      tick.setAttribute('aria-label',hour===24?'Ir al final del día':`Ir a las ${String(hour).padStart(2,'0')}:00`);
    }
    timeline.append(timelineHeading,timelineSlider,ticks);
    overlay.append(timeline);
    for(const type of ['pointerdown','mousedown','touchstart','click','dblclick','wheel'])timeline.addEventListener(type,event=>event.stopPropagation());
  }
  const popover=el('section','analysis-date-popover');popover.id=`${prefix}-filter-popover`;popover.hidden=true;popover.setAttribute('role','dialog');popover.setAttribute('aria-labelledby',`${prefix}-picker-title`);
  areaTrigger.setAttribute('aria-controls',popover.id);
  const popoverHeading=el('div','analysis-date-heading'),popoverTitle=el('strong');popoverTitle.id=`${prefix}-picker-title`;popoverHeading.append(popoverTitle);
  const close=button(popoverHeading,`${prefix}-date-close`,'×',closePicker);close.setAttribute('aria-label','Cerrar opciones');
  const grids={};
  const areaPicker=el('div','analysis-area-picker');grids.area=areaPicker;
  const areaSummary=el('p','analysis-area-summary');areaSummary.setAttribute('role','status');
  const unitGrid=el('div','analysis-unit-grid');unitGrid.setAttribute('role','group');unitGrid.setAttribute('aria-label','Unidades vecinales');
  const unitDetail=el('div','analysis-unit-detail');unitDetail.hidden=true;
  const unitBack=button(unitDetail,`${prefix}-unit-back`,'‹ Otras unidades',()=>showAreaUnit(null),'analysis-unit-back');
  const unitAll=button(unitDetail,`${prefix}-unit-all`,'Seleccionar toda la unidad',()=>callbacks.toggleUnit(activeUnitId),'analysis-unit-all');
  const childGrid=el('div','analysis-subquadrant-grid');childGrid.setAttribute('role','group');
  unitDetail.append(childGrid);areaPicker.append(areaSummary,unitGrid,unitDetail);popover.append(areaPicker);
  const unitButtonsById=new Map(),areaButtonsById=new Map();
  let areaUnits=[],unitsSource=null,unitsSignature='',activeUnitId=null;
  function showAreaUnit(id,focus=true) {
    const previous=activeUnitId;activeUnitId=id;
    const unit=areaUnits.find(item=>item.id===id);
    unitGrid.hidden=id!==null;unitDetail.hidden=id===null;
    for(const [childId,control] of areaButtonsById)control.hidden=!unit?.children.some(child=>child.id===childId);
    popoverTitle.textContent=unit?`Unidad vecinal ${unit.label}`:'Unidades vecinales';
    childGrid.setAttribute('aria-label',unit?`Subcuadrantes de la unidad vecinal ${unit.label}`:'Subcuadrantes');
    updateAreaSelection();
    if(focus) {
      positionPicker(areaTrigger);
      (unit?unitAll:unitButtonsById.get(previous)||unitGrid.querySelector('button'))?.focus({preventScroll:true});
    }
  }
  function updateAreaUnits(units) {
    if(units===unitsSource)return;
    unitsSource=units;
    const signature=JSON.stringify(units.map(unit=>[unit.id,unit.label,unit.children.map(child=>[child.id,child.label])]));
    if(signature===unitsSignature)return;
    unitsSignature=signature;areaUnits=units;
    for(const e of [...unitButtonsById.values(),...areaButtonsById.values()])controls.splice(controls.indexOf(e),1);
    unitButtonsById.clear();areaButtonsById.clear();unitGrid.replaceChildren();childGrid.replaceChildren();
    for(const unit of units) {
      const control=button(unitGrid,`${prefix}-unit-${unit.id}`,unit.label,()=>showAreaUnit(unit.id),'analysis-unit-option');
      control.append(el('small','analysis-unit-count'));unitButtonsById.set(unit.id,control);
      for(const child of unit.children) {
        const item=button(childGrid,`${prefix}-quadrant-${child.id}`,child.label,()=>callbacks.toggleQuadrant(child.id),'analysis-subquadrant-option');
        item.setAttribute('aria-label',`Subcuadrante ${child.label}`);areaButtonsById.set(child.id,item);
      }
    }
    if(!areaUnits.some(unit=>unit.id===activeUnitId))activeUnitId=null;
    showAreaUnit(activeUnitId,false);
  }
  function updateAreaSelection() {
    const selected=state?.quadrantIds??[];
    for(const unit of areaUnits) {
      const control=unitButtonsById.get(unit.id),count=unit.children.filter(child=>selected.includes(child.id)).length;
      control.disabled=!state?.canChoose;
      control.dataset.selection=count===0?'none':count===unit.children.length?'all':'partial';
      control.setAttribute('aria-label',`Unidad vecinal ${unit.label}, ${count} de ${unit.children.length} subcuadrantes seleccionados`);
      control.querySelector('small').textContent=count?`${count}/${unit.children.length}`:'';
    }
    for(const [id,control] of areaButtonsById) {
      control.disabled=!state?.canChoose;control.setAttribute('aria-pressed',String(selected.includes(id)));
    }
    const unit=areaUnits.find(unit=>unit.id===activeUnitId),all=Boolean(unit?.children.length)&&unit.children.every(child=>selected.includes(child.id));
    unitAll.disabled=!state?.canChoose;unitBack.disabled=!state?.canChoose;
    unitAll.setAttribute('aria-pressed',String(all));
    unitAll.textContent=all?'Quitar toda la unidad':'Seleccionar toda la unidad';
    const scope=state?.spatialLabel??'Toda la comuna';
    if(areaSummary.textContent!==scope)areaSummary.textContent=scope;
  }
  for(const [key,items] of resource?[]:[['year',ANALYSIS_YEARS.map(year=>[year,year])],['month',MONTHS.map((m,i)=>[String(i+1).padStart(2,'0'),m])],...(camera?Object.entries(CAMERA_CHOICES):[['robbery',[['all','Todos'],...SECURITY_ROBBERY_TYPES.map(type=>[type.value,type.label])]],['period',SECURITY_CHOICES.period]])]) {
    const grid=el('div','analysis-date-grid');grid.dataset.grid=key;grids[key]=grid;
    for(const [value,label,detail] of items) {
      const idValue=['year','month','robbery','period'].includes(key)?value:items.findIndex(item=>item[0]===value);
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
  function pickerAnchor(key){return key==='area'?areaTrigger:key==='year'?yearPicker:key==='month'?monthPicker:cameraTriggers[key];}
  function closePicker(){
    const anchor=pickerAnchor(picker);
    if(popover.contains(document.activeElement)&&anchor?.getClientRects().length)anchor.focus({preventScroll:true});
    picker=null;popover.hidden=true;
    for(const e of [areaTrigger,yearPicker,monthPicker,...Object.values(cameraTriggers)])e.setAttribute('aria-expanded','false');
  }
  function positionPicker(anchor) {
    const outer=container.getBoundingClientRect(),a=anchor.getBoundingClientRect(),p=popover.getBoundingClientRect(),r=panel.getBoundingClientRect();
    const left=panel.dataset.side==='right'?r.left-outer.left-p.width-10:r.right-outer.left+10;
    popover.style.left=`${Math.max(12,Math.min(outer.width-p.width-12,left))}px`;
    popover.style.top=`${Math.max(68,Math.min(outer.height-p.height-12,a.top-outer.top))}px`;
  }
  function openPicker(key) {
    if(!state?.loaded || !grids[key] || key==='area'&&!state.canChoose || key==='year'&&state.temporalMode==='all' || key==='month'&&state.temporalMode!=='month')return;
    if(picker===key){closePicker();return;}
    callbacks.clearHover();picker=key;popover.hidden=false;
    for(const e of [areaTrigger,yearPicker,monthPicker,...Object.values(cameraTriggers)])e.setAttribute('aria-expanded','false');
    for(const [name,grid] of Object.entries(grids))grid.hidden=name!==key;
    popoverTitle.textContent={area:'Unidades vecinales',year:'Elige el año',month:`Elige el mes · ${state.selectedYear}`,state:'Estado de las cámaras',type:'Tipos de cámara',robbery:'Tipos de robo',period:'Horario del día'}[key];
    if(key==='area')showAreaUnit(null,false);
    const anchor=pickerAnchor(key);anchor.setAttribute('aria-expanded','true');
    positionPicker(anchor);
    const first=key==='area'?(unitGrid.querySelector('[data-selection="all"]')||unitGrid.querySelector('[data-selection="partial"]')||unitGrid.querySelector('button')):(grids[key].querySelector('[aria-pressed="true"]')||grids[key].querySelector('button'));
    first?.focus({preventScroll:true});
  }
  function update(next) {
    state=next;panel.hidden=!next.visible;panel.dataset.side=next.side;
    const primary=next.side==='left';
    title.textContent=primary?'Análisis del mapa':'Comparación';
    categoryLabel.textContent=next.crossed?(primary?'Capa izquierda':'Capa derecha'):'Qué ver en el mapa';
    category.setAttribute('aria-label',`${categoryLabel.textContent}. Cambiar ${label}`);
    forecast.hidden=!primary;
    controls.forEach(e=>{e.disabled=!next.loaded;});
    category.disabled=compare.disabled=!next.canChoose;
    forecast.disabled=!next.canChoose;
    area.hidden=!primary;
    updateAreaUnits(next.units??[]);updateAreaSelection();
    areaTrigger.disabled=!next.canChoose||areaUnits.length===0;
    const quadrantIds=next.quadrantIds??[];
    whole.setAttribute('aria-pressed',String(quadrantIds.length===0));
    whole.disabled=!next.canChoose;
    const scopeText=next.spatialLabel??'Toda la comuna';
    if(spatialContext.textContent!==scopeText)spatialContext.textContent=scopeText;
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
    yearPicker.textContent=`${next.selectedYear} ▾`;monthPicker.textContent=`${MONTHS[Number(next.selectedMonth)-1]} ▾`;
    for(const e of popover.querySelectorAll('[data-option]')){
      const value=e.dataset.option==='year'?next.selectedYear:e.dataset.option==='month'?next.selectedMonth:f[e.dataset.option];
      e.setAttribute('aria-pressed',String(Array.isArray(value)?value.includes(e.dataset.value):value===e.dataset.value));
    }
    const resultTotal=next.loaded?number(next.summary.total):'—';
    if(total.textContent!==resultTotal)total.textContent=resultTotal;
    const hour=SECURITY_CHOICES.period.find(item=>item[0]===f.period);
    const date=next.dateRange?.label||'2023–2025';
    const cutoff=next.dateRange?.end?.split('-').reverse().join('/');
    const context=next.error?'No se pudieron cargar los datos de esta capa.':!next.loaded?'Cargando datos…'
      :kind==='alarms'?(f.year?`Pulsaciones de referencia · ${f.year}`:'Sin datos de pulsaciones')
        :resource?(f.year?`Estado de referencia al cierre de ${f.year}`:'Sin historial de estado')
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
    if(resource){
      const unit=next.summary.total===1?(kind==='alarms'?'botón':'ubicación'):layer.count;
      if(totalLabel.textContent!==unit)totalLabel.textContent=unit;
    }
    opacityRow.hidden=!next.crossed;compare.hidden=!primary||next.crossed;
    slider.value=String(Math.round(next.opacity*100));opacityValue.textContent=`${Math.round(next.opacity*100)}%`;
    if(!next.visible)closePicker();
  }
  function updatePlayback(playback={}) {
    if(!timeline)return;
    const playing=playback?.playing===true,position=Math.max(0,Math.min(1,Number(playback?.position)||0)),minutes=Math.round(position*24*60);
    const clock=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    playIcon.toggleAttribute('hidden',playing);pauseIcon.toggleAttribute('hidden',!playing);playbackButton.setAttribute('aria-pressed',String(playing));
    playbackButton.setAttribute('aria-label',playing?'Pausar recorrido del día':'Reproducir recorrido del día');
    playbackButton.title=playing?'Pausar el recorrido':'Reproducir el recorrido del día';
    timelineSlider.value=String(Math.round(position*1000));timelineSlider.style.setProperty('--timeline-progress',`${position*100}%`);
    timelineSlider.setAttribute('aria-valuetext',`${clock} de 24:00`);timelineOutput.textContent=`${clock} / 24:00`;
  }
  function targets(){
    if(panel.hidden)return[];
    const outer=container.getBoundingClientRect(),p=panel.getBoundingClientRect(),b=body.getBoundingClientRect();
    return controls.filter(e=>{if(e.disabled||e.getAttribute('aria-disabled')==='true'||!e.getClientRects().length)return false;const r=e.getBoundingClientRect(),c=timeline?.contains(e)?timeline.getBoundingClientRect():popover.contains(e)?popover.getBoundingClientRect():body.contains(e)?b:p;return r.top>=c.top-1&&r.bottom<=c.bottom+1&&r.left>=c.left-1&&r.right<=c.right+1;})
      .map(e=>{const r=e.getBoundingClientRect();return{id:e.id,x:r.left+r.width/2-outer.left,y:r.top+r.height/2-outer.top,width:r.width,height:r.height,element:e,priority:25};});
  }
  return {element:panel,body,popover,timeline,controls,update,updatePlayback,openPicker,closePicker,targets,get picker(){return picker;},get isVisible(){return !panel.hidden;}};
}

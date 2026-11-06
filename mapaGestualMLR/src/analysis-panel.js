import { SECURITY_ROBBERY_TYPES } from './analysis-data.js';
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const number = value => new Intl.NumberFormat('es-CL').format(value);
export const CAMERA_CHOICES = {
  state: [['all','Todos'],['Operativa','Operativas'],['Mantención','Mantención'],['Inactiva','Inactivas']],
  type: [['all','Todos'],['Domo','Domo'],['Fija','Fija'],['Lectora de patentes','Lectora de patentes']]
};
export const SECURITY_CHOICES = {
  resolution: [['all','Todos'],['yes','Resueltos'],['no','Sin resolver']],
  period: [['all','Todo el día'],['madrugada','Madrugada','00–06 h'],['manana','Mañana','06–12 h'],['tarde','Tarde','12–18 h'],['noche','Noche','18–24 h']]
};

/** Shared progressive controls; each dataset owns its filters and popover. */
export function createAnalysisPanel(overlay, container, kind, callbacks) {
  const camera = kind === 'cameras', prefix = camera ? 'camera-analysis' : 'analysis';
  const controls = [], filterButtons = [], modeButtons = [], categoryButtons = [];
  let state = null, picker = null;
  const el = (tag, cls, text) => { const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e; };
  const panel=el('section',`analysis-panel ${camera?'analysis-camera-panel':'analysis-security-panel'}`);
  panel.setAttribute('aria-label',camera?'Filtros del análisis de cámaras':'Filtros del análisis de seguridad');
  panel.dataset.kind=kind;
  function button(parent,id,label,callback,cls='') {
    const e=el('button',cls,label);e.id=id;e.type='button';e.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();callback();});parent.append(e);controls.push(e);return e;
  }
  const header=el('header','analysis-heading'),eyebrow=el('p','analysis-eyebrow','LA REINA · ANÁLISIS');
  const titleRow=el('div','analysis-title-row'),title=el('h1',null,'Análisis');
  titleRow.append(title);
  const category=el('div','analysis-category analysis-category-tabs');
  for(const [key,label] of [['security','Seguridad'],['cameras','Cámaras']]) {
    const e=button(category,`${prefix}-category-${key==='security'?'security':'cameras'}`,label,()=>callbacks.category(key));
    e.dataset.category=key;categoryButtons.push(e);
  }
  header.append(eyebrow,titleRow,category);
  const body=el('div','analysis-body'),stats=el('section','analysis-stats');stats.setAttribute('aria-label','Resumen de registros filtrados');
  const totalRow=el('div','analysis-total-row'),total=el('strong',null,'—');total.id=`${prefix}-total`;
  const totalLabel=el('span','analysis-total-label',camera?'cámaras al corte':'incidentes');totalRow.append(total,totalLabel);
  const counts=el('div','analysis-resolution-stats'),resolved=el('span',null,'—'),unresolved=el('span',null,'—');
  resolved.id=`${prefix}-resolved`;unresolved.id=`${prefix}-unresolved`;counts.append(resolved,unresolved);
  const selectedPeriod=el('p','analysis-selected-period','Preparando la base…');stats.append(totalRow,counts,selectedPeriod);
  body.append(stats);
  function group(key,label,options,callback) {
    const f=el('fieldset',`analysis-filter analysis-filter-${key}`),legend=el('legend',null,label),g=el('div','analysis-options');
    g.setAttribute('role','group');g.setAttribute('aria-label',label);
    for(const [value,text,detail] of options) {
      const e=button(g,`${prefix}-${key}-${value}`,text,()=>callback(value));e.dataset.filter=key;e.dataset.value=value;
      if(detail)e.append(el('small',null,detail));filterButtons.push(e);
    }
    f.append(legend,g);body.append(f);return f;
  }
  if(camera)group('display','Ver cámaras',[['points','Puntos'],['heatmap','Mapa de calor']],value=>callbacks.display(value));
  const timeField=el('fieldset','analysis-filter analysis-filter-date'),timeLegend=el('legend',null,'Ver período'),timeModes=el('div','analysis-options');
  ['all','year','month'].forEach((mode,i)=>modeButtons.push(button(timeModes,`${prefix}-mode-${mode}`,['Todo','Año','Mes'][i],()=>callbacks.mode(mode))));
  const dateSelection=el('div','analysis-date-selection');dateSelection.hidden=true;
  const yearPicker=button(dateSelection,`${prefix}-year-picker`,'2025',()=>openPicker('year'));
  const monthPicker=button(dateSelection,`${prefix}-month-picker`,'Diciembre',()=>openPicker('month'));
  yearPicker.setAttribute('aria-label',camera?'Elegir año de cámaras':'Elegir año');monthPicker.setAttribute('aria-label',camera?'Elegir mes de cámaras':'Elegir mes');
  for(const e of [yearPicker,monthPicker]){e.setAttribute('aria-haspopup','dialog');e.setAttribute('aria-expanded','false');}
  timeField.append(timeLegend,timeModes,dateSelection);body.append(timeField);
  if(!camera)for(const [key,label] of [['resolution','Resolución'],['period','Horario']])group(key,label,SECURITY_CHOICES[key],value=>callbacks.filters({[key]:value}));
  const cameraFilters=el('div','analysis-camera-filters'),cameraTriggers={};
  if(camera) {
    for(const [key,label] of [['state','Estado'],['type','Tipos']]) {
      const e=button(cameraFilters,`${prefix}-${key}-picker`,label,()=>openPicker(key));e.setAttribute('aria-haspopup','dialog');cameraTriggers[key]=e;
    }
    body.append(cameraFilters);
  } else {
    const robberyFilters=el('div','analysis-robbery-filter');
    const trigger=button(robberyFilters,`${prefix}-robbery-picker`,'Tipo de robo: Todos ▾',()=>openPicker('robbery'));
    trigger.setAttribute('aria-haspopup','dialog');cameraTriggers.robbery=trigger;body.append(robberyFilters);
  }
  const footer=el('footer','analysis-footer'),legend=el('section','analysis-legend');
  legend.setAttribute('aria-label',camera?'Representación de cámaras':'Escala de concentración, de verde a rojo');
  const legendTitle=el('strong',null,camera?'Emplazamientos de cámaras':'Concentración de incidentes');
  const ramp=el('div','analysis-color-ramp'),labels=el('div','analysis-legend-labels');labels.append(el('span',null,'Menor'),el('span',null,'Mayor'));
  const pointLegend=el('p','analysis-point-legend','Cada punto representa una cámara');legend.append(legendTitle,ramp,labels,pointLegend);
  const actions=el('div','analysis-actions');
  button(actions,`${prefix}-reset`,'Restablecer',()=>callbacks.reset());
  const download=button(actions,`${prefix}-export`,'CSV',()=>callbacks.export());download.setAttribute('aria-label',camera?'Descargar CSV de cámaras':'Descargar CSV de seguridad');
  button(actions,`${prefix}-cross`,'Cruzar datos',()=>callbacks.cross(kind));
  const note=el('p','analysis-dataset-note',camera?'Base de cámaras':'Base completa: 60.000 registros · 2023–2025');
  const opacityRow=el('div','analysis-opacity'),opacityLabel=el('label',null,'Visibilidad'),opacityValue=el('output',null,'100%');
  const slider=document.createElement('input');slider.type='range';slider.min='10';slider.max='100';slider.step='5';slider.id=`${prefix}-opacity`;slider.setAttribute('aria-label',camera?'Visibilidad de cámaras':'Visibilidad de seguridad');opacityLabel.htmlFor=slider.id;
  slider.addEventListener('input',()=>callbacks.opacity(Number(slider.value)/100));
  const less=button(opacityRow,`${prefix}-opacity-less`,'−',()=>callbacks.opacity(Math.max(.1,(state?.opacity||1)-.1)));
  opacityRow.prepend(opacityLabel);opacityRow.append(slider,opacityValue);
  button(opacityRow,`${prefix}-opacity-more`,'+',()=>callbacks.opacity(Math.min(1,(state?.opacity||1)+.1)));
  less.setAttribute('aria-label','Disminuir visibilidad');
  const exit=button(actions,`${prefix}-exit`,'Mapa',()=>callbacks.exit(),'analysis-exit');exit.setAttribute('aria-label','Volver al mapa');
  footer.prepend(legend,actions,note,opacityRow);panel.append(header,body,footer);
  let timeline=null,playbackButton=null,timelineSlider=null,timelineOutput=null,playIcon=null,pauseIcon=null;
  if(!camera) {
    timeline=el('section','analysis-timeline-bar');timeline.hidden=true;timeline.setAttribute('aria-label','Línea de tiempo de robos');
    playbackButton=button(timeline,'analysis-playback','',()=>callbacks.playback(),'analysis-playback');
    playbackButton.setAttribute('aria-label','Reproducir timelapse de robos');playbackButton.setAttribute('aria-pressed','false');
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
    timeline.append(timelineHeading,timelineSlider,ticks);overlay.append(timeline);
    for(const type of ['pointerdown','mousedown','touchstart','click','dblclick','wheel'])timeline.addEventListener(type,event=>event.stopPropagation());
  }
  const popover=el('section','analysis-date-popover');popover.hidden=true;popover.setAttribute('role','dialog');popover.setAttribute('aria-label',camera?'Elegir filtros de cámaras':'Elegir período');
  const popoverHeading=el('div','analysis-date-heading'),popoverTitle=el('strong');popoverHeading.append(popoverTitle);
  const close=button(popoverHeading,`${prefix}-date-close`,'×',closePicker);close.setAttribute('aria-label','Cerrar selección de período');
  const multiHint=el('p','analysis-picker-hint','Selecciona uno o varios tipos.');multiHint.hidden=true;
  const grids={};
  const years=['2023','2024','2025'];
  for(const [key,items] of [['year',years.map(year=>[year,year])],['month',MONTHS.map((m,i)=>[String(i+1).padStart(2,'0'),m])],...(camera?Object.entries(CAMERA_CHOICES):[['robbery',[['all','Todos'],...SECURITY_ROBBERY_TYPES.map(type=>[type.value,type.label])]]])]) {
    const grid=el('div','analysis-date-grid');grid.dataset.grid=key;grids[key]=grid;
    for(const [value,label] of items) {
      const idValue=['year','month','robbery'].includes(key)?value:items.indexOf(items.find(item=>item[0]===value));
      const e=button(grid,`${prefix}-${key}-${idValue}`,label,()=>{
        if(key==='type')callbacks.cameraType(value);
        else if(key==='robbery')callbacks.robbery(value);
        else {callbacks.filters({[key]:value});closePicker();}
      });e.dataset.option=key;e.dataset.value=value;
    }
    popover.append(grid);
  }
  popover.prepend(popoverHeading,multiHint);overlay.append(panel,popover);
  for(const area of [panel,popover])for(const type of ['pointerdown','mousedown','touchstart','click','dblclick','wheel'])area.addEventListener(type,event=>event.stopPropagation());
  function closePicker(){picker=null;popover.hidden=true;for(const e of [yearPicker,monthPicker,...Object.values(cameraTriggers)])e.setAttribute('aria-expanded','false');}
  function openPicker(key) {
    if(!state?.loaded || !grids[key] || key==='year'&&state.temporalMode==='all' || key==='month'&&state.temporalMode!=='month')return;
    if(picker===key){closePicker();return;}
    callbacks.clearHover();picker=key;popover.hidden=false;
    for(const [name,grid] of Object.entries(grids))grid.hidden=name!==key;
    popoverTitle.textContent={year:'Elige el año',month:`Elige el mes · ${state.selectedYear}`,state:'Estado de las cámaras',type:'Tipos de cámara',robbery:'Tipos de robo'}[key];
    multiHint.hidden=!['type','robbery'].includes(key);
    const anchor=key==='year'?yearPicker:key==='month'?monthPicker:cameraTriggers[key];anchor.setAttribute('aria-expanded','true');
    const outer=container.getBoundingClientRect(),a=anchor.getBoundingClientRect(),p=popover.getBoundingClientRect(),r=panel.getBoundingClientRect();
    const left=panel.dataset.side==='right'?r.left-outer.left-p.width-10:r.right-outer.left+10;
    popover.style.left=`${Math.max(12,Math.min(outer.width-p.width-12,left))}px`;
    popover.style.top=`${Math.max(68,Math.min(outer.height-p.height-12,a.top-outer.top))}px`;
  }
  function update(next) {
    state=next;panel.hidden=!next.visible;panel.dataset.side=next.side;
    title.textContent=next.crossed?(camera?'Cámaras':'Seguridad'):'Análisis';category.hidden=next.crossed;
    categoryButtons.forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.category===kind)));
    controls.forEach(e=>{e.disabled=!next.loaded;});exit.disabled=false;
    if(timeline){timeline.hidden=!next.visible;timeline.dataset.crossed=String(next.crossed);timelineSlider.disabled=!next.loaded;updatePlayback(next.playback);}
    const f=next.filters;
    filterButtons.forEach(e=>e.setAttribute('aria-pressed',String((e.dataset.filter==='display'?next.display:f[e.dataset.filter])===e.dataset.value)));
    modeButtons.forEach((e,i)=>e.setAttribute('aria-pressed',String(['all','year','month'][i]===next.temporalMode)));
    dateSelection.hidden=next.temporalMode==='all';monthPicker.hidden=next.temporalMode!=='month';
    yearPicker.textContent=`${next.selectedYear} ▾`;monthPicker.textContent=`${MONTHS[Number(next.selectedMonth)-1]} ▾`;
    for(const e of popover.querySelectorAll('[data-option]')){
      const value=e.dataset.option==='year'?next.selectedYear:e.dataset.option==='month'?next.selectedMonth:f[e.dataset.option];
      e.setAttribute('aria-pressed',String(Array.isArray(value)?value.includes(e.dataset.value):value===e.dataset.value));
    }
    total.textContent=next.loaded?number(next.summary.total):'—';
    resolved.textContent=camera?`${number(next.summary.operational||0)} operativas`:`${number(next.summary.resolved||0)} resueltos`;
    unresolved.textContent=camera?`${number(next.summary.maintenance||0)} en mantención · ${number(next.summary.inactive||0)} inactivas`:`${number(next.summary.unresolved||0)} sin resolver`;
    selectedPeriod.textContent=next.error||`${camera?'Inventario al cierre':'Período'} · ${next.dateRange?.label||'2023–2025'}`;
    for(const [key,trigger] of Object.entries(cameraTriggers)){
      const label=key==='robbery'?'Tipo de robo':key==='type'?'Tipos':'Estado';
      const selected=f[key],options=key==='robbery'?SECURITY_ROBBERY_TYPES.map(t=>[t.value,t.label]):CAMERA_CHOICES[key];
      const detail=selected==='all'?'Todos':Array.isArray(selected)?selected.length===1?options.find(c=>c[0]===selected[0])?.[1]:`${selected.length} seleccionados`:options.find(c=>c[0]===selected)?.[1];
      trigger.textContent=`${label}: ${detail||'Todos'} ▾`;
    }
    const points=camera&&next.display==='points';pointLegend.hidden=!points;ramp.hidden=points;labels.hidden=points;
    legendTitle.textContent=camera?(points?'Puntos de cámaras':'Densidad de emplazamientos'):'Concentración de incidentes';
    note.textContent=camera?`Base completa: ${number(next.datasetCount)} cámaras`:'Base completa: 60.000 registros · 2023–2025';
    opacityRow.hidden=!next.crossed;exit.hidden=next.crossed;
    slider.value=String(Math.round(next.opacity*100));opacityValue.textContent=`${Math.round(next.opacity*100)}%`;
    if(!next.visible)closePicker();
  }
  function updatePlayback(playback={}) {
    if(!timeline)return;
    const playing=playback?.playing===true,position=Math.max(0,Math.min(1,Number(playback?.position)||0)),minutes=Math.round(position*24*60);
    const clock=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    playIcon.toggleAttribute('hidden',playing);pauseIcon.toggleAttribute('hidden',!playing);playbackButton.setAttribute('aria-pressed',String(playing));
    playbackButton.setAttribute('aria-label',playing?'Pausar timelapse de robos':'Reproducir timelapse de robos');
    playbackButton.title=playing?'Pausar el recorrido':'Reproducir el recorrido del día';
    timelineSlider.value=String(Math.round(position*1000));timelineSlider.style.setProperty('--timeline-progress',`${position*100}%`);
    timelineSlider.setAttribute('aria-valuetext',`${clock} de 24:00`);timelineOutput.textContent=`${clock} / 24:00`;
  }
  function targets(){
    if(panel.hidden)return[];
    const outer=container.getBoundingClientRect(),p=panel.getBoundingClientRect(),b=body.getBoundingClientRect();
    return controls.filter(e=>{if(e.disabled||!e.getClientRects().length)return false;const r=e.getBoundingClientRect(),c=timeline?.contains(e)?timeline.getBoundingClientRect():popover.contains(e)?popover.getBoundingClientRect():body.contains(e)?b:p;return r.top>=c.top-1&&r.bottom<=c.bottom+1&&r.left>=c.left-1&&r.right<=c.right+1;})
      .map(e=>{const r=e.getBoundingClientRect();return{id:e.id,x:r.left+r.width/2-outer.left,y:r.top+r.height/2-outer.top,width:r.width,height:r.height,element:e,priority:25};});
  }
  return {element:panel,body,popover,timeline,controls,update,updatePlayback,openPicker,closePicker,targets,get picker(){return picker;},get isVisible(){return !panel.hidden;}};
}

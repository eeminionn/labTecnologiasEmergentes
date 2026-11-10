import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANALYSIS_LAYERS, ANALYSIS_YEARS, chooseAnalysisLayer, mostUsedAlarmButtons, nearbySecurityResources, parseAlarmUsage, parseSimulatedSecurityResources, readSecurityResources } from '../src/analysis-catalog.js';
import { createSecuritySpatialIndex, filterSecurityRecords, parseSecurityCSV, pointInsideBoundary } from '../src/analysis-data.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const geometry = json('../assets/la-reina.geojson');
const source = json('../public/analysis/recursos-seguridad.json');
const simulated = parseSimulatedSecurityResources(readFileSync(new URL('../public/analysis/recursos-simulados.csv',import.meta.url),'utf8'));
const inside = (lng,lat) => pointInsideBoundary(lng,lat,geometry);

test('cada capa puede compararse con otra, sin superponer la misma dos veces', () => {
  for (const {id:primary} of ANALYSIS_LAYERS) for (const {id:compare} of ANALYSIS_LAYERS) {
    const initial = {primary, compare:null}, result = chooseAnalysisLayer(initial,compare,'compare');
    if (primary===compare) assert.equal(result,null);
    else {
      assert.deepEqual(result,{primary,compare});
      assert.equal(chooseAnalysisLayer(result,compare,'primary'),null);
    }
  }
});

test('el catastro valida las coordenadas y distingue las fuentes de la simulación', () => {
  const records=readSecurityResources([...source,...simulated],inside);
  assert.ok(records.some(record=>record.id==='boton-paradero-pd308'&&!record.simulated));
  assert.ok(records.some(record=>record.id==='proyecto-seguridad-las-perdices'&&!record.simulated));
  assert.ok(records.filter(record=>!record.simulated).every(record=>record.source?.url.startsWith('https:')));
  assert.ok(records.filter(record=>record.simulated).every(record=>record.source===null));
  assert.throws(()=>readSecurityResources([...source,source[0]],inside));
  assert.throws(()=>readSecurityResources([{...source[0],lat:0}],inside));
  assert.throws(()=>readSecurityResources([{...source[0],source:{label:'Fuente',url:'http://lareina.cl/'}}],inside));
  assert.throws(()=>readSecurityResources([{...simulated[0],source:source[0].source}],inside));
});

test('la consulta devuelve solo ubicaciones del radio y distingue capas', () => {
  const records=readSecurityResources(source,inside);
  const alarm=records.find(record=>record.id==='boton-paradero-pd308');
  const result=nearbySecurityResources(records.filter(record=>record.kind==='alarms'),alarm);
  assert.equal(result.total,1);
  assert.equal(result.nearest.id,alarm.id);
  assert.equal(result.nearest.distanceMetres,0);
  assert.equal(nearbySecurityResources(records.filter(record=>record.kind==='alarms'),{lat:-33.459,lng:-70.54}).total,0);
});

test('las pulsaciones cubren los botones de cada año y los más usados en 2024 coinciden con sectores de más robos', () => {
  const read = file => readFileSync(new URL(`../public/analysis/${file}`,import.meta.url),'utf8');
  const usageByYear = parseAlarmUsage(read('pulsaciones-botones.csv'));
  const buttons = [...source, ...simulated].filter(record=>record.kind==='alarms');
  const rankings = new Map();
  assert.deepEqual([...usageByYear.keys()].sort(),ANALYSIS_YEARS);
  for(const [year,usage] of usageByYear){
    assert.equal(usage.size,buttons.length);
    const records = buttons.map(record=>({...record,activations:usage.get(record.id)}));
    assert.ok(records.every(record=>Number.isInteger(record.activations)));
    const top = mostUsedAlarmButtons(records);
    assert.equal(top.length,10);
    assert.deepEqual(top.map(record=>record.activations),[...usage.values()].sort((a,b)=>b-a).slice(0,10));
    rankings.set(year,top);
  }
  const highlighted = rankings.get('2024');
  const highlightedIds = new Set(highlighted.map(record=>record.id));
  assert.ok(rankings.get('2025').some(record=>!highlightedIds.has(record.id)));
  const robberies = createSecuritySpatialIndex(filterSecurityRecords(parseSecurityCSV(read('seguridad-simulada.csv')),{year:'2024'}));
  const averageRobberies = locations => locations.reduce((total,location)=>total+robberies.query({...location,radiusMetres:250,referenceDate:'2024-12-31'}).total,0)/locations.length;
  assert.ok(averageRobberies(highlighted)>2*averageRobberies(buttons.filter(record=>!highlightedIds.has(record.id))));
  assert.equal(mostUsedAlarmButtons([{id:'sin-uso',activations:0},{id:'sin-datos',activations:null}]).length,0);
  assert.throws(()=>parseAlarmUsage('id,anio,pulsaciones\nboton,2024,1\nboton,2024,2'));
  assert.throws(()=>parseAlarmUsage('id,anio,pulsaciones\nboton,2024,-1'));
});

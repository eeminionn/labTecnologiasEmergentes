import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANALYSIS_LAYERS, chooseAnalysisLayer, nearbySecurityResources, readSecurityResources } from '../src/analysis-catalog.js';
import { pointInsideBoundary } from '../src/analysis-data.js';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const geometry = json('../assets/la-reina.geojson');
const source = json('../public/analysis/recursos-seguridad.json');
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

test('el catastro solo admite puntos georreferenciados y fuentes seguras', () => {
  const records=readSecurityResources(source,inside);
  assert.equal(records.filter(record=>record.kind==='fixed').length,3);
  assert.ok(records.some(record=>record.id==='boton-paradero-pd308'));
  assert.throws(()=>readSecurityResources([...source,source[0]],inside));
  assert.throws(()=>readSecurityResources([{...source[0],lat:0}],inside));
  assert.throws(()=>readSecurityResources([{...source[0],source:{label:'Fuente',url:'http://lareina.cl/'}}],inside));
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

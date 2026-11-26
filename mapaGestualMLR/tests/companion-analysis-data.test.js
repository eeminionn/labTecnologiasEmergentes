import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompanionAnalysis } from '../src/companion-analysis-data.js';

const allQuadrantIds = ['1-A', '1-B', '4-A', '10-B'];
const build = (layers, quadrantIds = null) => buildCompanionAnalysis({
  layers, quadrantIds, allQuadrantIds, quadrantOf: record => record.quadrant
});
const robberies = (records, extra = {}) => ({
  kind: 'security', period: '2024 · Todo el día', dateRange: { end: '2024-12-31' },
  records, ...extra
});
const incident = (quadrant, hour = 3, type = 'Robo con intimidación') => ({
  quadrant, hour, tipo_incidente: type
});

test('cruza las consultas visibles por cuadrante, conserva los cortes y separa los registros sin ubicar', () => {
  const camera = {
    kind: 'cameras', period: 'Inventario al 31/12/2023', dateRange: { end: '2023-12-31' },
    filters: { type: ['Domo'] }, records: ['1-A', '4-A'].map(quadrant => ({
      quadrant, estado: 'Operativa', tipo_camara: 'Domo'
    }))
  };
  const data = build([robberies([
    incident('1-B'), incident('1-B', 8, 'Robo de vehículo'),
    incident('1-A'), incident(null)
  ]), camera]);
  assert.equal(data.scopeCount, 4);
  assert.equal(data.layers[0].total, 4);
  assert.equal(data.layers[0].unassignedTotal, 1);
  assert.deepEqual(data.layers[0].topQuadrants, [{id:'1-B', total:2}, {id:'1-A', total:1}]);
  assert.equal(data.layers[0].breakdown.find(row => row.label === 'De vehículos').total, 1);
  assert.equal(data.layers[0].breakdown.find(row => row.group === 'Horario').total, 3);
  assert.deepEqual(data.cross.withoutEquipment, {id:'1-B', primary:2, secondary:0});
  assert.equal(data.cross.primaryLocated, 3);
  assert.equal(data.cross.primaryUnmatched, 2);
  assert.equal(data.cross.secondaryUnmatched, 1);
  assert.equal(data.cross.sharedQuadrants, 1);
  assert.equal(data.cross.onlyPrimary, 1);
  assert.equal(data.cross.onlySecondary, 1);
  assert.equal(data.cross.neither, 1);
  assert.equal(data.cross.differentCutoffs, true);
  assert.equal(data.cross.secondary.filtered, true);
});

test('mantiene la orientación del cruce de contexto y distingue pulsaciones, botones y ausencia de registro', () => {
  const data = build([
    { kind:'alarms', period:'2024 · Año completo', records:[
      {quadrant:'1-B', activations:41}, {quadrant:'4-A', activations:0}, {quadrant:'4-A', activations:null}
    ] },
    robberies([incident('1-B'), incident('4-A'), incident('4-A')], {context:true})
  ], ['1-B', '4-A']);
  assert.equal(data.scopeCount, 2);
  assert.equal(data.layers.length, 1);
  assert.equal(data.layers[0].total, 3);
  assert.deepEqual(data.layers[0].breakdown.map(row => [row.label, row.total, row.unit]), [
    ['Pulsaciones informadas', 41, 'pulsaciones'], ['Botones con pulsaciones', 1, undefined],
    ['Botones sin pulsaciones', 1, undefined], ['Botones sin registro de uso', 1, undefined]
  ]);
  assert.equal(data.cross.contextual, true);
  assert.equal(data.cross.primary.kind, 'alarms');
  assert.equal(data.cross.secondary.kind, 'security');
  assert.deepEqual(data.cross.rows, [{id:'4-A', primary:2, secondary:2}, {id:'1-B', primary:1, secondary:1}]);
  assert.equal(data.cross.withoutEquipment, null);
});

test('distingue un área vacía de información no disponible y compara inventarios sin mezclar unidades', () => {
  const camera = {kind:'cameras', period:'2025', records:[{quadrant:'1-A', estado:'Operativa'}]};
  const fixed = {kind:'fixed', period:'2025', records:[
    {quadrant:'1-A', monitoringStatus:'monitoreando'}, {quadrant:'4-A'}
  ]};
  const overview = build([camera, fixed]);
  assert.deepEqual(overview.cross.rows, [{id:'1-A', primary:1, secondary:1}, {id:'4-A', primary:0, secondary:1}]);
  assert.equal(overview.layers[1].breakdown.find(row => row.label === 'Sin estado informado').total, 1);
  const empty = build([{...camera, records:[]}, {...fixed,records:[]}], []);
  assert.equal(empty.scopeCount, 0);
  assert.deepEqual(empty.cross.rows, []);
  assert.equal(empty.layers[1].total, 0);
  const unavailable = build([camera, {...fixed, ready:false}]);
  assert.equal(unavailable.layers[1].total, null);
  assert.equal(unavailable.cross, null);
});

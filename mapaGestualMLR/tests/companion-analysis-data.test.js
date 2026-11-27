import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompanionAnalysis, resolveCompanionRanking, sortCompanionQuadrants, summarizeCompanionUnits } from '../src/companion-analysis-data.js';

const allQuadrantIds = ['1-A', '1-B', '4-A', '10-B'];
const build = (layers, quadrantIds = null, quadrantAreaM2) => buildCompanionAnalysis({
  layers, quadrantIds, allQuadrantIds, quadrantOf: record => record.quadrant, quadrantAreaM2
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
  assert.deepEqual(data.cross.rows.map(({ id, primary }) => [id, primary]), [['1-B', 2], ['1-A', 1], ['4-A', 0], ['10-B', 0]]);
  assert.equal(data.layers[0].breakdown.find(row => row.label === 'De vehículos').total, 1);
  assert.equal(data.layers[0].breakdown.find(row => row.group === 'Horario').total, 3);
  assert.equal(data.cross.withoutEquipment.id, '1-B');
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
  assert.deepEqual(data.cross.rows.map(({ id, primary, secondary }) => [id, primary, secondary]), [['4-A', 2, 2], ['1-B', 1, 1]]);
  assert.equal(data.cross.withoutEquipment, null);
});

test('distingue un área vacía de información no disponible y compara inventarios sin mezclar unidades', () => {
  const camera = {kind:'cameras', period:'2025', records:[{quadrant:'1-A', estado:'Operativa'}]};
  const fixed = {kind:'fixed', period:'2025', records:[
    {quadrant:'1-A', monitoringStatus:'monitoreando'}, {quadrant:'4-A'}
  ]};
  const overview = build([camera, fixed]);
  assert.deepEqual(overview.cross.rows.map(({ id }) => id), ['1-A', '1-B', '4-A', '10-B']);
  assert.equal(overview.layers[1].breakdown.find(row => row.label === 'Sin estado informado').total, 1);
  const empty = build([{...camera, records:[]}, {...fixed,records:[]}], []);
  assert.equal(empty.scopeCount, 0);
  assert.deepEqual(empty.cross.rows, []);
  assert.equal(empty.layers[1].total, 0);
  const unavailable = build([camera, {...fixed, ready:false}]);
  assert.equal(unavailable.layers[1].total, null);
  assert.equal(unavailable.cross, null);
  assert.equal(unavailable.ranking.rows.length, 4);
});

test('ordena totales y densidades de forma independiente y conserva el total al agrupar subcuadrantes', () => {
  const counts = [['1-A', 10], ['1-B', 8], ['4-A', 6]];
  const records = counts.flatMap(([id, count]) => Array.from({length: count}, () => incident(id)));
  const areas = { '1-A': 2_000_000, '1-B': 1_000_000, '4-A': 100_000 };
  const { ranking } = build([robberies(records)], null, id => areas[id]);
  const { robberyAxis, rows } = ranking;
  const by = (values, metric, ascending = false) => sortCompanionQuadrants(values, { metric, ascending }).map(row => row.id);
  assert.deepEqual(by(rows, 'primary'), ['1-A', '1-B', '4-A', '10-B']);
  assert.deepEqual(by(rows, 'primary', true), ['10-B', '4-A', '1-B', '1-A']);
  assert.deepEqual(by(rows, 'density'), ['4-A', '1-B', '1-A', '10-B']);
  assert.deepEqual(by(rows, 'density', true), ['1-A', '1-B', '4-A', '10-B']);
  assert.deepEqual(by(rows, 'id'), ['1-A', '1-B', '4-A', '10-B']);
  const units = summarizeCompanionUnits(rows, robberyAxis);
  assert.deepEqual(units.find(row => row.id === '1'), { id:'1', primary:18, secondary:null, areaM2:3_000_000, density:6 });
  assert.equal(units.reduce((sum, row) => sum + row.primary, 0), ranking.primary.locatedTotal);
  assert.equal(summarizeCompanionUnits(rows.filter(row => row.id !== '1-A'), robberyAxis)[0].density, 8);
});

test('resuelve la página enviada por Análisis sin cambiar los totales y conserva el orden al invertir las capas', () => {
  const ids = Array.from({length:7}, (_, index) => `${index + 1}-A`);
  const security = robberies([incident('7-A'), incident('7-A'), incident('1-A')]);
  const cameras = { kind:'cameras', period:'2025', records:[{quadrant:'3-A'}] };
  const input = layers => ({ layers, allQuadrantIds:ids, quadrantOf:record=>record.quadrant,
    quadrantAreaM2:id=>id==='1-A' ? 250_000 : 1_000_000 });
  const {cross} = buildCompanionAnalysis(input([security, cameras]));
  const defaultView = resolveCompanionRanking(cross);
  assert.equal(defaultView.order, 'security:desc');
  assert.equal(defaultView.level, 'unit');
  assert.equal(defaultView.visibleRows[0].id, '7');
  assert.equal(resolveCompanionRanking(cross,{order:'density:desc'}).visibleRows[0].id,'1');
  const next = resolveCompanionRanking(cross,{level:'part',order:'id:asc',page:100});
  assert.deepEqual([next.page,next.first,next.last,next.total], [1,6,7,7]);
  assert.deepEqual(next.visibleRows.map(row=>row.id), ['6-A','7-A']);
  assert.equal(cross.primary.locatedTotal, 3);
  const reversed = buildCompanionAnalysis(input([cameras,security])).cross;
  assert.equal(resolveCompanionRanking(reversed,{order:'security:desc'}).visibleRows[0].id,'7');
  const contextual = buildCompanionAnalysis(input([cameras,{...security, context:true}])).cross;
  assert.equal(resolveCompanionRanking(contextual).order,'cameras:desc');
  assert.equal(resolveCompanionRanking({ rows:[] }),null);
});

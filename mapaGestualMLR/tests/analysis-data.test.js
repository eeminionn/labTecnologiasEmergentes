import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSecurityCSV, filterSecurityRecords, summarizeSecurityRecords, buildDensitySurface,
  projectSecurityPoint, pointInsideBoundary, boundaryPolygons, heatColor } from '../src/analysis-data.js';

const header = 'id,categoria,tipo_incidente,direccion,latitud,longitud,fecha,hora,dia_semana,resuelto,origen';
const csv = '\uFEFF' + header + '\r\n1,Seguridad,Robo,"Cruce, calle ""Sur""",-33.45,-70.55,2024-02-29,00:00,jueves,sí,simulado\r\n'
  + '2,Seguridad,Robo,Calle 12,-33.451,-70.552,2025-01-01,06:00,miércoles,no,simulado\n'
  + '3,Seguridad,Robo,Calle 15,-33.452,-70.553,2025-12-31,23:59,miércoles,no,simulado\n';
test('El CSV conserva comas y comillas, acepta BOM y convierte coordenadas, hora y resolución', () => {
  const rows = parseSecurityCSV(csv);
  assert.equal(rows.length, 3); assert.equal(rows[0].direccion, 'Cruce, calle "Sur"');
  assert.equal(rows[0].lat, -33.45); assert.equal(rows[0].lng, -70.55);
  assert.equal(rows[0].resolved, true); assert.equal(rows[1].resolved, false);
  assert.deepEqual(summarizeSecurityRecords(rows), { total: 3, resolved: 1, unresolved: 2,
    byHour: Array.from({ length: 24 }, (_, hour) => [0, 6, 23].includes(hour) ? 1 : 0), years: ['2024', '2025'] });
});
test('Los filtros son acumulativos y los cortes horarios no cuentan dos veces la medianoche ni las seis', () => {
  const rows = parseSecurityCSV(csv);
  assert.deepEqual(filterSecurityRecords(rows, { year: '2025', resolution: 'no' }).map(row => row.id), ['2', '3']);
  for (const [period, ids] of [['madrugada', ['1']], ['manana', ['2']], ['tarde', []], ['noche', ['3']]])
    assert.deepEqual(filterSecurityRecords(rows, { period }).map(row => row.id), ids);
  assert.equal(filterSecurityRecords(rows, { year: '2023' }).length, 0);
  assert.throws(() => filterSecurityRecords(rows, { resolution: 'maybe' }));
});
test('El parser rechaza datos incompletos, duplicados, fecha inexistente y estados o coordenadas inválidos', () => {
  for (const broken of [csv.replace('2024-02-29', '2023-02-29'), csv.replace('06:00', '24:00'),
    csv.replace('simulado', 'observado'), csv.replace('jueves,sí', 'jueves,tal vez'), csv.replace('-33.45', 'NaN'),
    csv.replace('\n2,Seguridad', '\n1,Seguridad'), csv.replace('Cruce, calle ""Sur"""', 'Cruce, calle ""Sur""')])
    assert.throws(() => parseSecurityCSV(broken));
  assert.throws(() => parseSecurityCSV('id,fecha\n1,2024-01-01'));
});

const outer = [[-.01, -.01], [.01, -.01], [.01, .01], [-.01, .01], [-.01, -.01]];
const square = { type: 'Polygon', coordinates: [outer] };
test('La pertenencia comunal contempla huecos, bordes y polígonos múltiples', () => {
  const hole = [[-.002, -.002], [.002, -.002], [.002, .002], [-.002, .002], [-.002, -.002]];
  const boundary = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[outer, hole],
    [[[.02, .02], [.03, .02], [.03, .03], [.02, .03], [.02, .02]]]] } }] };
  assert.equal(boundaryPolygons(boundary).length, 2);
  assert.equal(pointInsideBoundary(.005, .005, boundary), true);
  assert.equal(pointInsideBoundary(0, 0, boundary), false);
  assert.equal(pointInsideBoundary(.002, 0, boundary), false);
  assert.equal(pointInsideBoundary(.01, 0, boundary), true);
  assert.equal(pointInsideBoundary(.025, .025, boundary), true);
  assert.equal(pointInsideBoundary(.015, 0, boundary), false);
});
test('La superficie acumula duplicados, suaviza concentraciones y excluye puntos fuera del límite', () => {
  const records = [{ lng: 0, lat: 0 }, { lng: 0, lat: 0 }, { lng: .5, lat: .5 }];
  const surface = buildDensitySurface(records, square, { width: 64, height: 64, bandwidthMetres: 100 });
  assert.equal(surface.includedCount, 2); assert.equal(surface.excludedCount, 1);
  assert.deepEqual(surface.bounds, [[-.01, -.01], [.01, .01]]);
  assert.equal(surface.values.length, 4096); assert.ok(surface.max > 0);
  assert.ok(surface.values.every(Number.isFinite));
  assert.ok(surface.values[32 * 64 + 32] > surface.values[20 * 64 + 20]);
  assert.ok(Math.abs(surface.values.reduce((sum, value) => sum + value, 0) - 2) < .001);
  const zero = buildDensitySurface([], square); assert.equal(zero.max, 0); assert.ok(zero.values.every(value => value === 0));
});
test('Web Mercator usa metros y la fila superior corresponde al norte', () => {
  assert.deepEqual(projectSecurityPoint(0, 0).map(x => Math.round(x)), [0, 0]);
  assert.ok(Math.abs(projectSecurityPoint(1, 0)[0] - 111319.490793) < .001);
  const north = buildDensitySurface([{ lng: 0, lat: .006 }], square, { width: 64, height: 64, bandwidthMetres: 50 });
  let highest = 0; north.values.forEach((value, index) => { if (value > north.values[highest]) highest = index; });
  assert.ok(Math.floor(highest / 64) < 32);
  assert.throws(() => projectSecurityPoint(0, 90));
});
test('El degradé usa tintes institucionales de rosado con valores RGB válidos', () => {
  assert.deepEqual(heatColor(0), [253, 234, 242]); assert.deepEqual(heatColor(1), [232, 45, 129]);
  assert.deepEqual(heatColor(-2), heatColor(0)); assert.deepEqual(heatColor(2), heatColor(1));
  for (let i = 0; i < 100; i++) assert.ok(heatColor(i / 100).every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255));
  assert.deepEqual(heatColor(.5), [244, 150, 192]);
});
test('Los 60.000 registros del archivo entregado se pueden filtrar y quedan dentro de La Reina', () => {
  const rows = parseSecurityCSV(readFileSync(new URL('../public/analysis/seguridad-simulada.csv', import.meta.url), 'utf8'));
  const boundary = JSON.parse(readFileSync(new URL('../assets/la-reina.geojson', import.meta.url), 'utf8'));
  assert.equal(rows.length, 60000);
  const summary = summarizeSecurityRecords(rows); assert.equal(summary.resolved, 22920); assert.equal(summary.unresolved, 37080);
  const surface = buildDensitySurface(rows, boundary);
  assert.equal(surface.includedCount, 60000); assert.equal(surface.excludedCount, 0);
  assert.ok(surface.max > 0); assert.ok(surface.values.every(Number.isFinite));
  assert.equal(filterSecurityRecords(rows, { year: '2024' }).length, 20066);
});

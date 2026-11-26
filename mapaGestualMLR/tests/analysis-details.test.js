import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSecurityCSV, filterSecurityRecords, createSecuritySpatialIndex, getSecurityDateRange, summarizeSecurityArea } from '../src/analysis-data.js';

const header = 'id,categoria,tipo_incidente,direccion,latitud,longitud,fecha,hora,dia_semana,resuelto,origen';
const csv = header + '\n'
  + '1,Seguridad,Robo,Calle A,-33.45,-70.55,2023-01-01,00:00,domingo,sí,simulado\n'
  + '2,Seguridad,Robo,Calle B,-33.45,-70.55,2024-01-31,18:00,miércoles,no,simulado\n'
  + '3,Seguridad,Robo,Calle C,-33.45,-70.55,2024-02-29,23:59,jueves,no,simulado\n'
  + '4,Seguridad,Robo,Calle D,-33.45,-70.55,2025-02-28,06:00,viernes,sí,simulado\n';

test('La consulta de cuadrantes resume un conjunto sin duplicar el conteo ni cambiar el corte temporal', () => {
  const records = filterSecurityRecords(parseSecurityCSV(csv), { year: '2024' });
  const selection = summarizeSecurityArea(records, '2024-02-29');
  assert.equal(selection.total, 2);
  assert.equal(selection.last7Days, 1);
  assert.equal(selection.last7DaysRange.start, '2024-02-23');
  assert.equal(selection.lastIncident.id, '3');
  assert.equal(summarizeSecurityArea([], '2024-02-29').lastIncident, null);
});

test('El mes se acumula con año, resolución y horario sin incluir otro año por accidente', () => {
  const records = parseSecurityCSV(csv);
  assert.equal(records[0].month, '01');
  assert.deepEqual(filterSecurityRecords(records, { month: '01' }).map(row => row.id), ['1', '2']);
  assert.deepEqual(filterSecurityRecords(records, { year: '2024', month: '02', resolution: 'no', period: 'noche' }).map(row => row.id), ['3']);
  assert.deepEqual(filterSecurityRecords(records, { year: '2025', month: '01' }), []);
  for (const month of ['00', '13', '2', 'January', '']) assert.throws(() => filterSecurityRecords(records, { month }));
});

test('El período mensual respeta febrero bisiesto y no depende de la fecha actual del equipo', () => {
  assert.deepEqual(getSecurityDateRange({ year: '2024', month: '02' }), {
    start: '2024-02-01', end: '2024-02-29', label: 'febrero de 2024'
  });
  assert.equal(getSecurityDateRange({ year: '2025', month: '02' }).end, '2025-02-28');
  assert.deepEqual(getSecurityDateRange({ year: '2023' }), { start: '2023-01-01', end: '2023-12-31', label: '2023' });
  assert.deepEqual(getSecurityDateRange({}, { periodo: { desde: '2023-03-10', hasta: '2025-10-15' } }), {
    start: '2023-03-10', end: '2025-10-15', label: '2023–2025'
  });
  assert.deepEqual(getSecurityDateRange({ month: '01' }), { start: '2023-01-01', end: '2025-01-31', label: 'enero de 2023–2025' });
  assert.throws(() => getSecurityDateRange({}, { periodo: { desde: '2025-01-01', hasta: '2024-01-01' } }));
});

const centre = { lng: -70.55, lat: -33.45 };
function destination(distance, bearing = 0, origin = centre) {
  const radius = 6371008.8, radians = Math.PI / 180, a = origin.lat * radians, b = origin.lng * radians, d = distance / radius;
  const latitude = Math.asin(Math.sin(a) * Math.cos(d) + Math.cos(a) * Math.sin(d) * Math.cos(bearing));
  const longitude = b + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(a), Math.cos(d) - Math.sin(a) * Math.sin(latitude));
  return { lng: ((longitude / radians + 540) % 360) - 180, lat: latitude / radians };
}
function record(id, point, fecha = '2024-02-29', hora = '18:00', resolved = false) {
  return { id: String(id), ...point, fecha, hora, resolved, resuelto: resolved ? 'sí' : 'no', direccion: `Calle ${id}`,
    tipo_incidente: 'Robo por sorpresa', year: fecha.slice(0, 4), month: fecha.slice(5, 7), hour: Number(hora.slice(0, 2)) };
}

test('El resumen local usa un radio real de 250 metros y conserva los incidentes repetidos en el mismo lugar', () => {
  const records = [record(1, centre, '2024-02-01', '01:00', true), record(2, centre),
    record(3, destination(249.99, Math.PI / 2)), record(4, destination(250)),
    record(5, destination(250.01)), record(6, destination(800, Math.PI))];
  const index = createSecuritySpatialIndex(records), summary = index.query({ ...centre, radiusMetres: 250, referenceDate: '2024-02-29' });
  assert.equal(index.size, 6); assert.equal(summary.total, 4);
  assert.equal(summary.resolved, 1); assert.equal(summary.unresolved, 3);
  assert.equal(summary.last7Days, 3);
  assert.equal(summary.lastIncident.direccion, 'Calle 2');
  assert.equal(summary.lastIncident.tipo_incidente, 'Robo por sorpresa');
});

test('Últimos siete días incluye ambos extremos del cierre de período y excluye el día anterior', () => {
  const records = [record(1, centre, '2024-02-22', '23:59'), record(2, centre, '2024-02-23', '00:00'),
    record(3, centre, '2024-02-29', '23:59', true), record(4, centre, '2024-03-01', '00:00')];
  const summary = createSecuritySpatialIndex(records).query({ ...centre, referenceDate: '2024-02-29' });
  assert.equal(summary.total, 4); assert.equal(summary.last7Days, 2);
  assert.deepEqual(summary.last7DaysRange, { start: '2024-02-23', end: '2024-02-29', label: 'Del 23/02/2024 al 29/02/2024' });
  assert.equal(summary.last7DaysLabel, summary.last7DaysRange.label);
  const fallback = createSecuritySpatialIndex(records).query(centre);
  assert.equal(fallback.referenceDate, '2024-03-01');
  assert.equal(fallback.last7DaysRange.start, '2024-02-24');
});

test('El índice se construye del filtro activo y el último incidente se determina por fecha y hora', () => {
  const all = parseSecurityCSV(csv), selected = filterSecurityRecords(all, { year: '2024', resolution: 'no', period: 'noche' });
  const summary = createSecuritySpatialIndex(selected).query({ ...centre, referenceDate: '2024-12-31' });
  assert.equal(summary.total, 2); assert.equal(summary.resolved, 0); assert.equal(summary.unresolved, 2);
  assert.equal(summary.lastIncident.id, '3'); assert.equal(summary.lastIncident.hora, '23:59');
  assert.equal(summary.last7Days, 0);
});

test('El lugar vacío devuelve cero y no inventa un incidente ni una semana si no hay fecha de referencia', () => {
  const empty = createSecuritySpatialIndex([]).query(centre);
  assert.equal(empty.total, 0); assert.equal(empty.resolved, 0); assert.equal(empty.unresolved, 0);
  assert.equal(empty.lastIncident, null); assert.equal(empty.last7DaysRange, null); assert.equal(empty.last7Days, 0);
  const dated = createSecuritySpatialIndex([]).query({ ...centre, referenceDate: '2025-12-31' });
  assert.equal(dated.last7DaysRange.start, '2025-12-25');
  assert.equal(dated.last7DaysRange.end, '2025-12-31');
  assert.throws(() => createSecuritySpatialIndex([]).query({ ...centre, radiusMetres: NaN }));
  assert.throws(() => createSecuritySpatialIndex([]).query({ ...centre, referenceDate: '2025-02-29' }));
});

test('Los buckets no pierden puntos al cruzar el antimeridiano', () => {
  const origin = { lng: 179.999, lat: -33.45 };
  const records = [record(1, origin), record(2, destination(200, Math.PI / 2, origin)), record(3, destination(600, Math.PI / 2, origin))];
  assert.equal(createSecuritySpatialIndex(records).query({ ...origin, radiusMetres: 250 }).total, 2);
});

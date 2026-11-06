import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCameraCSV, filterCameraRecords, summarizeCameraRecords, cameraHeatColor,
  createCameraSpatialIndex } from '../src/camera-analysis-data.js';
import { buildDensitySurface } from '../src/analysis-data.js';

const fields = ['id', 'categoria', 'tipo_camara', 'direccion', 'latitud', 'longitud', 'fecha_instalacion',
  'estado', 'origen_ubicacion', 'precision_ubicacion', 'fuente_url', 'fuente_fecha', 'datos_operativos', 'observacion'];
const escapeCSV = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
const row = (values = {}) => ({ id: '1', categoria: 'Cámaras', tipo_camara: 'Domo', direccion: 'Calle A / Calle B',
  latitud: '-33.45', longitud: '-70.55', fecha_instalacion: '2023-01-01', estado: 'Operativa',
  origen_ubicacion: 'simulada', precision_ubicacion: 'simulada', fuente_url: '', fuente_fecha: '',
  datos_operativos: 'simulados', observacion: 'Ubicación y datos operativos simulados.', ...values });
const csv = rows => fields.join(',') + '\r\n' + rows.map(record => fields.map(field => escapeCSV(record[field])).join(',')).join('\r\n') + '\r\n';
const centre = { lng: -70.55, lat: -33.45 };
function destination(distance, bearing = 0, origin = centre) {
  const radians = Math.PI / 180, a = origin.lat * radians, b = origin.lng * radians, d = distance / 6371008.8;
  const latitude = Math.asin(Math.sin(a) * Math.cos(d) + Math.cos(a) * Math.sin(d) * Math.cos(bearing));
  const longitude = b + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(a), Math.cos(d) - Math.sin(a) * Math.sin(latitude));
  return { longitud: ((longitude / radians + 540) % 360) - 180, latitud: latitude / radians };
}

test('El CSV de cámaras conserva las comillas, las fuentes y el carácter demostrativo', () => {
  const records = parseCameraCSV('\uFEFF' + csv([row({ direccion: 'Cruce "La Reina", sector norte',
    origen_ubicacion: 'publicada', precision_ubicacion: 'aproximada', fuente_url: 'https://lareina.cl/ejemplo/',
    fuente_fecha: '2024-02-29', observacion: 'Cruce publicado.\nCoordenadas aproximadas.' })]));
  assert.equal(records.length, 1);
  assert.equal(records[0].direccion, 'Cruce "La Reina", sector norte');
  assert.equal(records[0].lat, -33.45); assert.equal(records[0].lng, -70.55);
  assert.equal(records[0].state, 'operational'); assert.equal(records[0].type, 'domo');
  assert.equal(records[0].published, true); assert.equal(records[0].datos_operativos, 'simulados');
  assert.equal(records[0].precision_ubicacion, 'aproximada');
  assert.equal(records[0].observacion, 'Cruce publicado.\nCoordenadas aproximadas.');
});

test('El parser rechaza filas incompletas, duplicadas o con información no válida', () => {
  for (const values of [
    { categoria: 'Seguridad' }, { latitud: '' }, { latitud: 'NaN' }, { latitud: '85.1' }, { longitud: '181' },
    { fecha_instalacion: '2025-02-29' }, { fecha_instalacion: '2024-2-01' }, { estado: 'Desconocida' },
    { tipo_camara: 'Radar' }, { origen_ubicacion: 'confirmada' }, { datos_operativos: 'reales' },
    { origen_ubicacion: 'publicada', precision_ubicacion: 'aproximada', fuente_url: '' },
    { origen_ubicacion: 'publicada', precision_ubicacion: 'aproximada', fuente_url: 'javascript:alert(1)' },
    { precision_ubicacion: 'exacta' }, { fuente_fecha: '2023-02-29' }
  ]) assert.throws(() => parseCameraCSV(csv([row(values)])), /no válida/);
  assert.throws(() => parseCameraCSV(csv([row(), row()])), /no válida/);
  assert.throws(() => parseCameraCSV('id,id\n1,1'), /columnas/);
  assert.throws(() => parseCameraCSV(csv([row()]).replace(/,simulados,/, ',')), /columnas/);
  assert.throws(() => parseCameraCSV(csv([row()]) + '"sin cerrar'), /sin cerrar/);
});

const records = parseCameraCSV(csv([
  row({ id: '1', fecha_instalacion: '2023-01-01' }),
  row({ id: '2', fecha_instalacion: '2024-02-29', estado: 'Mantención', tipo_camara: 'Fija',
    origen_ubicacion: 'publicada', precision_ubicacion: 'aproximada', fuente_url: 'https://lareina.cl/camaras/' }),
  row({ id: '3', fecha_instalacion: '2024-03-01', estado: 'Inactiva', tipo_camara: 'Lectora de patentes' }),
  row({ id: '4', fecha_instalacion: '2025-01-01' })
]));

test('El período mensual devuelve el inventario acumulado al corte, no solo las altas del mes', () => {
  assert.deepEqual(filterCameraRecords(records, { year: '2024', month: '02' }).map(record => record.id), ['1', '2']);
  assert.deepEqual(filterCameraRecords(records, { year: '2024', month: '01' }).map(record => record.id), ['1']);
  assert.deepEqual(filterCameraRecords(records, { year: '2024' }).map(record => record.id), ['1', '2', '3']);
  assert.equal(filterCameraRecords(records).length, 4);
  assert.deepEqual(filterCameraRecords(records, {}, { periodo: { desde: '2023-01-01', hasta: '2024-02-28' } }).map(record => record.id), ['1']);
  assert.throws(() => filterCameraRecords(records, { month: '02' }), /Elige un año/);
  for (const year of ['202', '', 'ayer']) assert.throws(() => filterCameraRecords(records, { year }));
  for (const month of ['00', '13', '2']) assert.throws(() => filterCameraRecords(records, { year: '2024', month }));
});

test('Los filtros operativos, de tipo y de procedencia se combinan sin alterar la otra base', () => {
  assert.deepEqual(filterCameraRecords(records, { year: '2024', state: 'maintenance', type: 'fija', origin: 'publicada' }).map(record => record.id), ['2']);
  assert.deepEqual(filterCameraRecords(records, { state: 'Operativa', type: 'Domo', origin: 'simulada' }).map(record => record.id), ['1', '4']);
  assert.deepEqual(filterCameraRecords(records, { type: 'lectora', state: 'inactive' }).map(record => record.id), ['3']);
  for (const values of [{ state: 'sin conexión' }, { type: 'sensor' }, { origin: 'verificada' }, { state: 'constructor' }]) {
    assert.throws(() => filterCameraRecords(records, values));
  }
  assert.deepEqual(summarizeCameraRecords(records), { total: 4, operational: 2, maintenance: 1, inactive: 1, published: 1, simulated: 3 });
  assert.deepEqual(summarizeCameraRecords([]), { total: 0, operational: 0, maintenance: 0, inactive: 0, published: 0, simulated: 0 });
});

test('La consulta cuenta cámaras dentro de 250 metros e identifica la más cercana', () => {
  const local = parseCameraCSV(csv([
    row({ id: '1', ...destination(249.99), estado: 'Mantención' }),
    row({ id: '2', ...destination(250, Math.PI / 2), estado: 'Inactiva' }),
    row({ id: '3', ...destination(250.01, Math.PI) }),
    row({ id: '4', ...destination(10, Math.PI / 4), origen_ubicacion: 'publicada', precision_ubicacion: 'aproximada', fuente_url: 'https://lareina.cl/camaras/' })
  ]));
  const index = createCameraSpatialIndex(local), result = index.query(centre);
  assert.equal(index.size, 4); assert.equal(result.total, 3);
  assert.equal(result.operational, 1); assert.equal(result.maintenance, 1); assert.equal(result.inactive, 1);
  assert.equal(result.published, 1); assert.equal(result.simulated, 2);
  assert.equal(result.nearest.id, '4'); assert.ok(Math.abs(result.nearest.distanceMetres - 10) < .00001);
  assert.equal(result.nearest.precision_ubicacion, 'aproximada');
  assert.equal(result.radiusMetres, 250);
  assert.equal(createCameraSpatialIndex(filterCameraRecords(local, { state: 'operational' })).query(centre).total, 1);
});

test('La consulta vacía no sugiere una cámara y las coordenadas no se convierten en cobertura', () => {
  assert.deepEqual(createCameraSpatialIndex([]).query(centre), {
    total: 0, operational: 0, maintenance: 0, inactive: 0, published: 0, simulated: 0, nearest: null, radiusMetres: 250
  });
  const origin = { lng: 179.999, lat: -33.45 };
  const index = createCameraSpatialIndex(parseCameraCSV(csv([
    row({ id: '1', ...destination(200, Math.PI / 2, origin) }),
    row({ id: '2', ...destination(600, Math.PI / 2, origin) })
  ])));
  assert.equal(index.query(origin).total, 1);
  assert.throws(() => index.query({ ...centre, radiusMetres: NaN }));
  assert.throws(() => index.query({ ...centre, radiusMetres: 0 }));
  assert.throws(() => index.query({ lng: NaN, lat: -33.45 }));
});

test('La rampa mantiene un azul eléctrico continuo y funciona con la superficie geográfica existente', () => {
  assert.deepEqual(cameraHeatColor(0), [67, 217, 255]);
  assert.deepEqual(cameraHeatColor(.55), [22, 174, 255]);
  assert.deepEqual(cameraHeatColor(1), [0, 102, 255]);
  assert.deepEqual(cameraHeatColor(-1), cameraHeatColor(0));
  assert.deepEqual(cameraHeatColor(2), cameraHeatColor(1));
  assert.deepEqual(cameraHeatColor(NaN), cameraHeatColor(0));
  assert.ok(cameraHeatColor(.549).every((value, i) => Math.abs(value - cameraHeatColor(.551)[i]) < 2));
  const boundary = { type: 'Polygon', coordinates: [[[-70.56,-33.46],[-70.54,-33.46],[-70.54,-33.44],[-70.56,-33.44],[-70.56,-33.46]]] };
  const surface = buildDensitySurface(records, boundary, { width: 32, height: 16 });
  assert.equal(surface.includedCount, 4); assert.equal(surface.excludedCount, 0);
  assert.ok(surface.max > 0); assert.deepEqual(surface.bounds, [[-33.46,-70.56],[-33.44,-70.54]]);
});

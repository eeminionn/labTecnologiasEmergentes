import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCameraCSV, filterCameraRecords, createCameraSpatialIndex } from '../src/camera-analysis-data.js';
import { parseSecurityCSV, createSecuritySpatialIndex } from '../src/analysis-data.js';

const cameras = parseCameraCSV(readFileSync(new URL('../public/analysis/camaras-seguridad.csv', import.meta.url), 'utf8'));
const metadata = JSON.parse(readFileSync(new URL('../public/analysis/camaras-metadata.json', import.meta.url), 'utf8'));
const scenario = metadata.escenario_2024;
const security = parseSecurityCSV(readFileSync(new URL('../public/analysis/seguridad-simulada.csv', import.meta.url), 'utf8'));
const cameraIndex = createCameraSpatialIndex(filterCameraRecords(cameras, { year: '2024' }, metadata));
const securityIndex = createSecuritySpatialIndex(security.filter(row => row.year === '2024'));

test('El escenario 2024 modifica fechas y conserva íntegros los otros campos de las 320 cámaras', () => {
  // Baseline 0.6.0: all source columns except the editable installation date.
  const baseline = '3ad1c01eefb1fea9a836a4c40743ba1966ce907d901650562811643ac01dd23e';
  const values = cameras.map(row => scenario.campos_conservados.map(field => row[field]));
  assert.equal(createHash('sha256').update(JSON.stringify(values)).digest('hex'), baseline);
  assert.equal(scenario.sha256_campos_conservados, baseline);
  assert.equal(cameras.length, 320);
  assert.deepEqual(scenario.campos_modificados, ['fecha_instalacion']);
  assert.equal(scenario.cantidad_fechas_retrasadas, 49);
  assert.equal(new Set(scenario.fechas_retrasadas.map(row => row.id)).size, 49);
  for (const change of scenario.fechas_retrasadas) {
    assert.ok(change.antes <= '2024-12-31');
    assert.ok(change.despues.startsWith('2025-'));
    assert.equal(cameras.find(row => row.id === change.id).fecha_instalacion, change.despues);
  }
});

test('Los tres focos concentran incidentes de 2024 y muestran pocas cámaras al mismo corte', () => {
  assert.equal(scenario.zonas.length, 3);
  for (const zone of scenario.zonas) {
    const location = { lng: zone.longitud, lat: zone.latitud, radiusMetres: zone.radio_metros };
    const incidents = securityIndex.query({ ...location, referenceDate: '2024-12-31' });
    const sites = cameraIndex.query(location);
    assert.equal(zone.radio_metros, 650);
    assert.equal(incidents.total, zone.incidentes_2024);
    assert.ok(incidents.total >= 1200);
    assert.equal(sites.total, zone.camaras_2024_despues);
    assert.equal(sites.total, 2);
    assert.ok(zone.camaras_2024_antes >= 10);
    assert.ok(zone.camaras_2025 >= 20);
  }
});

test('El escenario preserva un inventario distribuido fuera de los focos y las altas de 2025', () => {
  assert.equal(filterCameraRecords(cameras, { year: '2023' }, metadata).length, 101);
  assert.equal(filterCameraRecords(cameras, { year: '2024', month: '07' }, metadata).length, 143);
  assert.equal(filterCameraRecords(cameras, { year: '2024' }, metadata).length, 172);
  assert.equal(filterCameraRecords(cameras, { year: '2025' }, metadata).length, 320);
  assert.equal(filterCameraRecords(cameras, { year: '2024', origin: 'publicada' }, metadata).length, 11);
  assert.ok(cameraIndex.size - scenario.zonas.reduce((sum, zone) => sum + zone.camaras_2024_despues, 0) >= 100);
});

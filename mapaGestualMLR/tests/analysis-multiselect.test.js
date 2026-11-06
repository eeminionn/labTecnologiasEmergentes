import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECURITY_ROBBERY_TYPES, classifySecurityRobbery, normalizeSecurityRobberyTypes,
  toggleSecurityRobberyType, parseSecurityCSV, filterSecurityRecords } from '../src/analysis-data.js';
import { normalizeCameraTypes, toggleCameraType, filterCameraRecords } from '../src/camera-analysis-data.js';

test('La selección múltiple de cámaras conserva orden, admite aliases y no modifica la selección recibida', () => {
  const chosen = ['Fija', 'Domo', 'Domo'];
  assert.deepEqual(normalizeCameraTypes(chosen), ['Domo', 'Fija']);
  assert.deepEqual(chosen, ['Fija', 'Domo', 'Domo']);
  assert.deepEqual(normalizeCameraTypes('lectora'), ['Lectora de patentes']);
  assert.deepEqual(normalizeCameraTypes(['fija', 'domo']), ['Domo', 'Fija']);
  assert.equal(normalizeCameraTypes([]), 'all');
  assert.equal(normalizeCameraTypes(['Fija', 'Domo', 'Lectora de patentes']), 'all');
  for (const invalid of ['Radar', 'constructor', ['Domo', 'otra'], null, {}]) {
    assert.throws(() => normalizeCameraTypes(invalid), /tipo de cámara/);
  }
});

test('Pulsar tipos de cámara agrega, quita y vuelve a Todos al completar los tres o quitar el último', () => {
  let chosen = toggleCameraType('all', 'Domo');
  assert.deepEqual(chosen, ['Domo']);
  chosen = toggleCameraType(chosen, 'Fija');
  assert.deepEqual(chosen, ['Domo', 'Fija']);
  assert.deepEqual(toggleCameraType(chosen, 'Domo'), ['Fija']);
  assert.equal(toggleCameraType(chosen, 'Lectora de patentes'), 'all');
  assert.equal(toggleCameraType(['Domo'], 'Domo'), 'all');
  assert.equal(toggleCameraType(chosen, 'all'), 'all');
});

test('La unión de tipos de cámara sigue respetando el inventario al corte y los filtros propios', () => {
  const cameras = [
    { id: '1', fecha_instalacion: '2023-01-01', estado: 'Operativa', tipo_camara: 'Domo', origen_ubicacion: 'simulada' },
    { id: '2', fecha_instalacion: '2024-02-29', estado: 'Mantención', tipo_camara: 'Fija', origen_ubicacion: 'publicada' },
    { id: '3', fecha_instalacion: '2024-03-01', estado: 'Inactiva', tipo_camara: 'Lectora de patentes', origen_ubicacion: 'simulada' },
    { id: '4', fecha_instalacion: '2025-01-01', estado: 'Operativa', tipo_camara: 'Domo', origen_ubicacion: 'simulada' }
  ];
  assert.deepEqual(filterCameraRecords(cameras, { year: '2024', type: ['Domo', 'Fija'] }).map(r => r.id), ['1', '2']);
  assert.deepEqual(filterCameraRecords(cameras, { year: '2024', month: '01', type: ['Domo', 'Fija'] }).map(r => r.id), ['1']);
  assert.deepEqual(filterCameraRecords(cameras, { year: '2024', state: 'Operativa', type: ['Domo', 'Fija'] }).map(r => r.id), ['1']);
  assert.deepEqual(filterCameraRecords(cameras, { type: ['Domo', 'Fija'], origin: 'publicada' }).map(r => r.id), ['2']);
  assert.equal(filterCameraRecords(cameras, { type: ['Domo', 'Fija', 'Lectora de patentes'] }).length, cameras.length);
});

test('Los cuatro grupos de robo preservan la figura original y agrupan los dos lugares en inmuebles', () => {
  assert.deepEqual(SECURITY_ROBBERY_TYPES.map(option => option.value), ['intimidacion', 'sorpresa', 'vehiculo', 'inmuebles']);
  for (const [description, expected] of [
    ['Robo con intimidación', 'intimidacion'], ['Robo con violencia', 'intimidacion'],
    ['Robo con violencia o intimidación', 'intimidacion'], ['Robo por sorpresa', 'sorpresa'],
    ['Robo de vehículo', 'vehiculo'], ['Robo de vehículo motorizado', 'vehiculo'],
    ['Robo en lugar habitado', 'inmuebles'], ['Robo en lugar no habitado', 'inmuebles']
  ]) {
    const record = { tipo_incidente: description };
    assert.equal(classifySecurityRobbery(record), expected);
    assert.equal(record.tipo_incidente, description);
  }
  assert.equal(classifySecurityRobbery({ tipo_incidente: 'Hurto' }), null);
  assert.equal(classifySecurityRobbery(null), null);
});

test('La selección de robos valida las opciones, alterna cada grupo y vuelve a Todos al completar', () => {
  assert.deepEqual(normalizeSecurityRobberyTypes(['vehiculo', 'sorpresa', 'sorpresa']), ['sorpresa', 'vehiculo']);
  let chosen = toggleSecurityRobberyType('all', 'intimidacion');
  assert.deepEqual(chosen, ['intimidacion']);
  chosen = toggleSecurityRobberyType(chosen, 'vehiculo');
  assert.deepEqual(chosen, ['intimidacion', 'vehiculo']);
  assert.deepEqual(toggleSecurityRobberyType(chosen, 'intimidacion'), ['vehiculo']);
  assert.equal(toggleSecurityRobberyType(['vehiculo'], 'vehiculo'), 'all');
  assert.equal(toggleSecurityRobberyType(['intimidacion', 'sorpresa', 'vehiculo'], 'inmuebles'), 'all');
  assert.equal(normalizeSecurityRobberyTypes([]), 'all');
  for (const invalid of ['armas', 'constructor', ['sorpresa', 'otra'], null, {}]) {
    assert.throws(() => normalizeSecurityRobberyTypes(invalid), /tipo de robo/);
  }
});

const incidentCSV = 'id,categoria,tipo_incidente,direccion,latitud,longitud,fecha,hora,dia_semana,resuelto,origen\n'
  + [
    ['1', 'Robo con intimidación', '2024-07-10', '20:10', 'no'],
    ['2', 'Robo por sorpresa', '2024-07-11', '05:10', 'sí'],
    ['3', 'Robo de vehículo', '2024-07-12', '20:10', 'no'],
    ['4', 'Robo en lugar habitado', '2023-07-13', '20:10', 'no'],
    ['5', 'Robo en lugar no habitado', '2024-07-13', '20:10', 'no'],
    ['6', 'Robo por sorpresa', '2025-07-14', '20:10', 'no'],
    ['7', 'Robo', '2024-07-14', '20:10', 'no']
  ].map(([id, type, day, time, resolved]) => `${id},Seguridad,${type},Calle A,-33.45,-70.55,${day},${time},lunes,${resolved},simulado`).join('\n');

test('Filtrar por uno o varios robos combina año, mes, horario y resolución sin duplicar registros', () => {
  const rows = parseSecurityCSV(incidentCSV);
  assert.equal(rows[0].robberyType, 'intimidacion');
  assert.equal(rows[4].tipo_incidente, 'Robo en lugar no habitado');
  assert.deepEqual(filterSecurityRecords(rows, { robbery: ['intimidacion', 'vehiculo'] }).map(r => r.id), ['1', '3']);
  assert.deepEqual(filterSecurityRecords(rows, { robbery: 'inmuebles' }).map(r => r.id), ['4', '5']);
  assert.deepEqual(filterSecurityRecords(rows, { year: '2024', month: '07', period: 'noche', resolution: 'no', robbery: ['sorpresa', 'inmuebles'] }).map(r => r.id), ['5']);
  assert.equal(filterSecurityRecords(rows).length, 7);
  assert.equal(filterSecurityRecords(rows, { robbery: SECURITY_ROBBERY_TYPES.map(o => o.value) }).length, 7);
  assert.throws(() => filterSecurityRecords(rows, { robbery: 'otro' }), /tipo de robo/);
});

test('Los cuatro grupos cubren cada registro de la base entregada una sola vez', () => {
  const rows = parseSecurityCSV(readFileSync(new URL('../public/analysis/seguridad-simulada.csv', import.meta.url), 'utf8'));
  const groups = SECURITY_ROBBERY_TYPES.map(option => filterSecurityRecords(rows, { robbery: option.value }));
  assert.equal(groups.flat().length, 60000);
  assert.equal(new Set(groups.flat().map(record => record.id)).size, 60000);
  assert.ok(groups.every(group => group.length > 0));
  assert.deepEqual(new Set(groups[3].map(record => record.tipo_incidente)), new Set(['Robo en lugar habitado', 'Robo en lugar no habitado']));
});

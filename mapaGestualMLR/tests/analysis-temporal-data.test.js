import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSecurityCSV, buildDensitySurface } from '../src/analysis-data.js';

const records = parseSecurityCSV(readFileSync(new URL('../public/analysis/seguridad-simulada.csv', import.meta.url), 'utf8'));
const boundary = JSON.parse(readFileSync(new URL('../assets/la-reina.geojson', import.meta.url), 'utf8'));
const metadata = JSON.parse(readFileSync(new URL('../public/analysis/metadata.json', import.meta.url), 'utf8'));

function distribution(rows) {
  const surface = buildDensitySurface(rows, boundary, { width: 96, height: 48 });
  assert.equal(surface.excludedCount, 0);
  const total = surface.values.reduce((sum, value) => sum + value, 0);
  return Array.from(surface.values, value => value / total);
}
const difference = (a, b) => a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / 2;

test('La revisión temporal conserva el volumen, calendario y resolución de la muestra entregada', () => {
  assert.equal(records.length, 60000);
  assert.deepEqual(metadata.por_ano, { 2023: 20009, 2024: 20066, 2025: 19925 });
  assert.deepEqual(metadata.resuelto, { 'sí': 22920, no: 37080 });
  assert.equal(Object.keys(metadata.por_mes).length, 36);
  assert.equal(Object.values(metadata.por_mes).reduce((sum, value) => sum + value, 0), 60000);
  assert.ok(records.every((row, index) => row.id === String(index + 1) && row.origen === 'simulado'));
});

test('Cada año simulado presenta una distribución de focos distinta sobre la misma comuna', () => {
  const surfaces = ['2023', '2024', '2025'].map(year => distribution(records.filter(row => row.year === year)));
  for (const [first, second] of [[0, 1], [0, 2], [1, 2]]) {
    assert.ok(difference(surfaces[first], surfaces[second]) > .3,
      'Los focos anuales deben variar más que el ruido de muestreo de un patrón espacial único.');
  }
});

test('Los meses consecutivos tienen focos diferenciados en los tres años de demostración', () => {
  for (const year of ['2023', '2024', '2025']) {
    const surfaces = Array.from({ length: 12 }, (_, month) => distribution(records.filter(row =>
      row.fecha.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))));
    for (let month = 1; month < 12; month++) {
      assert.ok(difference(surfaces[month - 1], surfaces[month]) > .15,
        `${year}, meses ${month}/${month + 1}: la base debe permitir observar el cambio mensual.`);
    }
  }
});

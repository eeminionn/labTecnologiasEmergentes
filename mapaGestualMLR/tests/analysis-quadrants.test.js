import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAnalysisQuadrants, classifyAnalysisQuadrant, normalizeAnalysisQuadrants,
  toggleAnalysisArea } from '../src/analysis-quadrants.js';
import { parseSecurityCSV } from '../src/analysis-data.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const areas = JSON.parse(read('../assets/la-reina-neighborhoods.geojson'));
const district = createAnalysisQuadrants(areas);

test('Las 15 unidades mantienen su numeración y la unidad 13 tiene cuatro partes', () => {
  assert.deepEqual(district.units.map(unit => unit.id), Array.from({ length: 15 }, (_, index) => String(index + 1)));
  const unit13 = district.byUnit.get('13');
  assert.deepEqual(unit13.children.map(part => part.id), ['13-A', '13-B', '13-C', '13-D']);
  assert.ok(district.units.every(unit => unit.children.length > 0));
  assert.equal(district.byId.size, areas.features.length);
  for (const unit of district.units) {
    assert.ok(unit.labelPoint);
    assert.equal(district.byId.get(classifyAnalysisQuadrant(unit.labelPoint, district))?.unit, unit.id);
    const sizes = unit.children.map(part => part.areaM2);
    assert.ok(Math.min(...sizes) > 0);
    assert.ok(Math.max(...sizes) / Math.min(...sizes) < 1.03);
  }
});

test('Permite combinar unidades y partes con un orden estable y sin duplicar áreas', () => {
  const unit = district.byUnit.get('13').children.map(part => part.id);
  assert.deepEqual(normalizeAnalysisQuadrants(['14-A', '13-A', '13-A'], district), ['13-A', '14-A']);
  assert.deepEqual(normalizeAnalysisQuadrants([], district), []);
  assert.equal(normalizeAnalysisQuadrants('all', district), null);
  assert.equal(normalizeAnalysisQuadrants(null, district), null);
  assert.deepEqual(toggleAnalysisArea(null, ['13-A']), ['13-A']);
  assert.deepEqual(toggleAnalysisArea(['13-A'], ['13-A']), []);
  assert.throws(() => normalizeAnalysisQuadrants(['13-ZZZ'], district), /no es válido/);
  const expanded = normalizeAnalysisQuadrants(toggleAnalysisArea(['13-A', '14-A'], unit), district);
  assert.deepEqual(expanded, [...unit, '14-A']);
  assert.deepEqual(toggleAnalysisArea(expanded, unit), ['14-A']);
});

test('Los límites y los huecos se leen de la geometría vecinal', () => {
  const box = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]];
  const west = [box(-4, -4, 0, 4), box(-2, -1, -1, 1)];
  const east = [[box(0, -4, 4, 4)], [box(7, -1, 8, 1)]];
  const feature = (id, unit, geometry) => ({ type: 'Feature', properties: { id, unit }, geometry });
  const atlas = createAnalysisQuadrants({
    units: { features: [
      feature('1', null, { type: 'Polygon', coordinates: west }),
      feature('2', null, { type: 'MultiPolygon', coordinates: east })
    ] },
    features: [
      feature('1-A', '1', { type: 'Polygon', coordinates: west }),
      feature('2-A', '2', { type: 'MultiPolygon', coordinates: east })
    ]
  });
  assert.equal(classifyAnalysisQuadrant({ lng: 0, lat: 0 }, atlas), '1-A');
  assert.equal(classifyAnalysisQuadrant({ lng: -1.5, lat: 0 }, atlas), null);
  assert.equal(classifyAnalysisQuadrant({ lng: 6, lat: 0 }, atlas), null);
  assert.equal(classifyAnalysisQuadrant({ longitud: '7.5', latitud: '0.5' }, atlas), '2-A');
  assert.equal(classifyAnalysisQuadrant({ lng: ' ', lat: 0 }, atlas), null);
});

test('Los 60.000 incidentes se asignan a las nuevas áreas', () => {
  const records = parseSecurityCSV(read('../public/analysis/seguridad-simulada.csv'));
  const counts = new Map();
  for (const row of records) {
    const id = classifyAnalysisQuadrant(row, district);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  assert.equal(records.length, 60000);
  assert.ok((counts.get(null) ?? 0) < 10);
  assert.ok(district.byUnit.get('13').children.every(part => counts.get(part.id) > 0));
});

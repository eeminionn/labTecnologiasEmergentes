import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANALYSIS_QUADRANT_IDS, createAnalysisQuadrants, classifyAnalysisQuadrant, normalizeAnalysisQuadrants,
  toggleAnalysisQuadrant, filterAnalysisQuadrants, groupAnalysisQuadrants } from '../src/analysis-quadrants.js';
import { pointInsideBoundary, parseSecurityCSV } from '../src/analysis-data.js';

const square = { type: 'Polygon', coordinates: [[[-4, -4], [4, -4], [4, 4], [-4, 4], [-4, -4]]] };
const definition = createAnalysisQuadrants(square);

test('Los cuatro cuadrantes usan el centro del límite calculado y no un bbox externo obsoleto', () => {
  const quad = createAnalysisQuadrants({ type: 'Feature', bbox: [-100, -100, 100, 100], geometry: square });
  assert.deepEqual(quad.center, { lng: 0, lat: 0 });
  assert.deepEqual(quad.bounds, [[-4, -4], [4, 4]]);
  assert.deepEqual(quad.quadrants.map(item => item.id), ANALYSIS_QUADRANT_IDS);
  assert.deepEqual(quad.quadrants.map(item => item.bounds), [
    [[0, -4], [4, 0]], [[0, 0], [4, 4]], [[-4, -4], [0, 0]], [[-4, 0], [0, 4]]
  ]);
  assert.ok(quad.quadrants.every(item => item.rectangle.type === 'Polygon' && item.rectangle.coordinates[0].length === 5));
});

test('Los ejes pertenecen al norte y al este sin duplicar registros', () => {
  const samples = [
    [{ lng: -1, lat: 1 }, 'noroeste'], [{ lng: 1, lat: 1 }, 'noreste'],
    [{ lng: -1, lat: -1 }, 'suroeste'], [{ lng: 1, lat: -1 }, 'sureste'],
    [{ lng: 0, lat: 1 }, 'noreste'], [{ lng: 0, lat: -1 }, 'sureste'],
    [{ lng: -1, lat: 0 }, 'noroeste'], [{ lng: 1, lat: 0 }, 'noreste'], [{ lng: 0, lat: 0 }, 'noreste'],
    [{ longitud: '-1', latitud: '-1' }, 'suroeste']
  ];
  for (const [point, expected] of samples) assert.equal(classifyAnalysisQuadrant(point, definition), expected);
  const points = samples.map(([point]) => point), { groups, outside } = groupAnalysisQuadrants(points, definition);
  assert.equal(outside.length, 0);
  assert.equal(Object.values(groups).reduce((sum, values) => sum + values.length, 0), points.length);
  assert.equal(new Set(Object.values(groups).flat()).size, points.length);
  assert.equal(classifyAnalysisQuadrant({ lng: 9, lat: 1 }, definition), null);
  assert.equal(classifyAnalysisQuadrant({ lng: NaN, lat: 1 }, definition), null);
  assert.equal(classifyAnalysisQuadrant({ lng: '', lat: 1 }, definition), null);
});

test('Una comuna cóncava conserva sus vacíos y no conecta artificialmente componentes del recorte', () => {
  const concave = { type: 'Polygon', coordinates: [[[-4, -4], [4, -4], [4, -2], [-2, -2], [-2, 4], [-4, 4], [-4, -4]]] };
  const quad = createAnalysisQuadrants(concave);
  assert.equal(classifyAnalysisQuadrant({ lng: 1, lat: 1 }, quad), null);
  assert.equal(classifyAnalysisQuadrant({ lng: -3, lat: 2 }, quad), 'noroeste');
  assert.equal(classifyAnalysisQuadrant({ lng: 3, lat: -3 }, quad), 'sureste');
  assert.deepEqual(quad.boundaryPolygons, [concave.coordinates]);
  assert.equal(quad.quadrants.find(item => item.id === 'noreste').labelPoint, null);
});

test('El recorte compartido conserva huecos y todos los polígonos de una comuna discontinua', () => {
  const outer = square.coordinates[0], hole = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  const second = [[[7, -1], [8, -1], [8, 1], [7, 1], [7, -1]]];
  const geometry = { type: 'MultiPolygon', coordinates: [[outer, hole], second] };
  const quad = createAnalysisQuadrants({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry }] });
  assert.equal(quad.boundaryPolygons.length, 2); assert.equal(quad.boundaryPolygons[0].length, 2);
  assert.equal(classifyAnalysisQuadrant({ lng: 0, lat: 0 }, quad), null);
  assert.equal(classifyAnalysisQuadrant({ lng: 6, lat: 0 }, quad), null);
  assert.equal(classifyAnalysisQuadrant({ lng: 7.5, lat: .5 }, quad), 'noreste');
  for (const item of quad.quadrants) if (item.labelPoint) {
    assert.equal(pointInsideBoundary(item.labelPoint.lng, item.labelPoint.lat, quad.boundary), true);
    assert.equal(classifyAnalysisQuadrant(item.labelPoint, quad), item.id);
  }
});

test('Las selecciones múltiples son canónicas y filtran la unión exacta de los cuadrantes', () => {
  assert.equal(normalizeAnalysisQuadrants(), 'all'); assert.equal(normalizeAnalysisQuadrants([]), 'all');
  assert.deepEqual(normalizeAnalysisQuadrants(['sureste', 'noroeste', 'sureste']), ['noroeste', 'sureste']);
  assert.deepEqual(normalizeAnalysisQuadrants(ANALYSIS_QUADRANT_IDS), ANALYSIS_QUADRANT_IDS);
  assert.deepEqual(toggleAnalysisQuadrant(ANALYSIS_QUADRANT_IDS, 'noreste'), ['noroeste', 'suroeste', 'sureste']);
  assert.throws(() => normalizeAnalysisQuadrants(['sector-1']));
  assert.deepEqual(toggleAnalysisQuadrant('all', 'noreste'), ['noreste']);
  assert.equal(toggleAnalysisQuadrant(['noreste'], 'noreste'), 'all');
  const records = [{ lng: -2, lat: 2 }, { lng: 2, lat: 2 }, { lng: -2, lat: -2 }, { lng: 2, lat: -2 }, { lng: 7, lat: 7 }];
  assert.deepEqual(filterAnalysisQuadrants(records, ['noroeste', 'sureste'], definition), [records[0], records[3]]);
  assert.deepEqual(filterAnalysisQuadrants(records, 'all', definition), records.slice(0, 4));
  assert.deepEqual(groupAnalysisQuadrants(records, definition).outside, [records[4]]);
});

test('Los 60.000 incidentes simulados de La Reina se asignan una sola vez y las etiquetas quedan dentro', () => {
  const boundary = JSON.parse(readFileSync(new URL('../assets/la-reina.geojson', import.meta.url), 'utf8'));
  const records = parseSecurityCSV(readFileSync(new URL('../public/analysis/seguridad-simulada.csv', import.meta.url), 'utf8'));
  const quad = createAnalysisQuadrants(boundary), { groups, outside } = groupAnalysisQuadrants(records, quad);
  assert.equal(outside.length, 0);
  assert.equal(Object.values(groups).reduce((sum, values) => sum + values.length, 0), 60000);
  assert.ok(Object.values(groups).every(values => values.length > 0));
  assert.equal(new Set(Object.values(groups).flat().map(record => record.id)).size, 60000);
  for (const item of quad.quadrants) {
    assert.ok(item.labelPoint);
    assert.equal(classifyAnalysisQuadrant(item.labelPoint, quad), item.id);
  }
});

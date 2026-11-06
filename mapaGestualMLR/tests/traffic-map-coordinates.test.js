import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localToLngLat, lngLatToLocal } from '../src/traffic-map-coordinates.js';

const sector = JSON.parse(readFileSync(new URL('../public/traffic/scene.json', import.meta.url), 'utf8'));

test('El vértice de José Zapiola conserva su posición real al pasar del plano métrico al mapa', () => {
  // OSM node 12421414542 in fuentes-transito/sector-caracci.osm. The local
  // point comes from the independent WGS84 ECEF preparation, rounded to mm.
  const reference = { lng: -70.5481741, lat: -33.4488677, x: 70.393, z: -1.797 };
  const actual = lngLatToLocal(reference.lng, reference.lat, sector.center);
  assert.ok(Math.hypot(actual.x - reference.x, actual.z - reference.z) < .03);
  const [longitude, latitude] = localToLngLat(reference.x, reference.z, sector.center);
  assert.ok(Math.abs(longitude - reference.lng) < 3e-7);
  assert.ok(Math.abs(latitude - reference.lat) < 3e-7);
});

test('Los recorridos del cruce en T no se prolongan hacia el acceso privado del sur', () => {
  assert.equal(sector.name, 'José Caracci / José Zapiola');
  for (const route of sector.routes) {
    assert.ok(route.points.every(([x, south]) => south < 5), `${route.id}: ingreso al acceso privado`);
  }
});

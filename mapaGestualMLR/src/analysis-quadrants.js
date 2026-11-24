import { boundaryPolygons, pointInsideBoundary } from './analysis-data.js';

export const STREET_DETAIL_ZOOM = 15.5;
export const UNIT_ROBBERY_COLORS = ['#13764b', '#647b1f', '#9d7200', '#ae4b23', '#b12634'];

function coordinates(record) {
  const number = value => typeof value === 'string' && value.trim() ? Number(value) : value;
  const lng = number(record?.lng ?? record?.longitud), lat = number(record?.lat ?? record?.latitud);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

function boundsFor(polygons) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const polygon of polygons) for (const ring of polygon) for (const [lng, lat] of ring) {
    west = Math.min(west, lng); south = Math.min(south, lat);
    east = Math.max(east, lng); north = Math.max(north, lat);
  }
  return [[south, west], [north, east]];
}

function insideBounds({ lng, lat }, [[south, west], [north, east]]) {
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

function areaGeometry(feature) {
  const polygons = boundaryPolygons(feature);
  return { geometry: feature.geometry, polygons, bounds: boundsFor(polygons) };
}

export function createAnalysisQuadrants(collection, communeBoundary) {
  const parents = collection?.units?.features;
  if (!Array.isArray(parents) || !parents.length || !Array.isArray(collection.features)) {
    throw new Error('No se encontraron las unidades vecinales de La Reina.');
  }
  const units = parents.map(feature => {
    const id = String(feature.properties.id);
    const [lng, lat] = feature.properties.labelPoint ?? [];
    return { id, label: id, ...areaGeometry(feature), labelPoint: coordinates({ lng, lat }), children: [] };
  }).sort((a, b) => Number(a.id) - Number(b.id));
  const byUnit = new Map(units.map(unit => [unit.id, unit]));
  const quadrants = collection.features.map(feature => {
    const { id, unit, areaM2 } = feature.properties;
    const parent = byUnit.get(String(unit));
    if (!parent || typeof id !== 'string' || !id.startsWith(`${parent.id}-`)) {
      throw new Error('Un subcuadrante no tiene una unidad vecinal válida.');
    }
    return { id, unit: parent.id, label: id, areaM2, ...areaGeometry(feature) };
  }).sort((a, b) => Number(a.unit) - Number(b.unit) || a.id.localeCompare(b.id));
  const byId = new Map();
  for (const quadrant of quadrants) {
    if (byId.has(quadrant.id)) throw new Error('Hay un subcuadrante duplicado.');
    byId.set(quadrant.id, quadrant);
    byUnit.get(quadrant.unit).children.push(quadrant);
  }
  return { units, quadrants, byId, byUnit,
    boundaryPolygons: communeBoundary ? boundaryPolygons(communeBoundary) : units.flatMap(unit => unit.polygons) };
}

/** Shared edges belong to the first matching ID in numeric unit order. */
export function classifyAnalysisQuadrant(record, district) {
  const point = coordinates(record);
  if (!point) return null;
  for (const unit of district.units) {
    if (!insideBounds(point, unit.bounds)) continue;
    for (const part of unit.children) {
      if (insideBounds(point, part.bounds) && pointInsideBoundary(point.lng, point.lat, part.geometry)) return part.id;
    }
  }
  return null;
}

export function normalizeAnalysisQuadrants(selection, district) {
  const values = Array.isArray(selection) ? selection : [selection];
  const ids = new Set(values);
  for (const id of ids) {
    if (id !== 'all' && !district.byId.has(id)) throw new Error('El subcuadrante seleccionado no es válido.');
  }
  return ids.has('all') ? [] : district.quadrants.filter(part => ids.has(part.id)).map(part => part.id);
}

export function toggleAnalysisArea(selection, ids) {
  const chosen = new Set(selection);
  if (ids.every(id => chosen.has(id))) ids.forEach(id => chosen.delete(id));
  else ids.forEach(id => chosen.add(id));
  return [...chosen];
}

import { boundaryPolygons, pointInsideBoundary, projectSecurityPoint } from './analysis-data.js';

export const ANALYSIS_QUADRANTS = Object.freeze([
  Object.freeze({ id: 'noroeste', label: 'Noroeste', north: true, east: false }),
  Object.freeze({ id: 'noreste', label: 'Noreste', north: true, east: true }),
  Object.freeze({ id: 'suroeste', label: 'Suroeste', north: false, east: false }),
  Object.freeze({ id: 'sureste', label: 'Sureste', north: false, east: true })
]);
export const ANALYSIS_QUADRANT_IDS = Object.freeze(ANALYSIS_QUADRANTS.map(quadrant => quadrant.id));

/** The same canonical set is used by filters, the map overlay and its buttons. */
export function normalizeAnalysisQuadrants(selection = 'all') {
  const values = Array.isArray(selection) ? selection : [selection];
  if (values.some(value => value !== 'all' && !ANALYSIS_QUADRANT_IDS.includes(value))) throw new Error('El cuadrante seleccionado no es válido.');
  const selected = ANALYSIS_QUADRANT_IDS.filter(id => values.includes(id));
  return values.includes('all') || selected.length === 0 ? 'all' : selected;
}

export function toggleAnalysisQuadrant(selection, id) {
  if (id === 'all') return 'all';
  if (!ANALYSIS_QUADRANT_IDS.includes(id)) throw new Error('El cuadrante seleccionado no es válido.');
  const previous = normalizeAnalysisQuadrants(selection), next = previous === 'all' ? [] : [...previous];
  const index = next.indexOf(id);
  if (index < 0) next.push(id); else next.splice(index, 1);
  return normalizeAnalysisQuadrants(next);
}

function rectangle(bounds) {
  const [[south, west], [north, east]] = bounds;
  return { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
}

function coordinate(value) {
  if (typeof value === 'string' && value.trim()) value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pointCoordinates(record) {
  if (!record || typeof record !== 'object') return null;
  const lng = coordinate(record.lng ?? record.longitud), lat = coordinate(record.lat ?? record.latitud);
  return lng === null || lat === null ? null : { lng, lat };
}

function quadrantId(lng, lat, center) {
  // A shared axis belongs to the northern/eastern half. The centre therefore
  // belongs only to Noreste: no incident can be counted twice along an axis.
  return lat >= center.lat ? (lng >= center.lng ? 'noreste' : 'noroeste')
    : lng >= center.lng ? 'sureste' : 'suroeste';
}

function segmentDistanceSquared([x, y], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
}

function interiorLabelPoint(quadrant, boundary, projectedRings) {
  const [[south, west], [north, east]] = quadrant.bounds;
  const [westX, southY] = projectSecurityPoint(west, south), [eastX, northY] = projectSecurityPoint(east, north);
  let best = null, greatestClearance = -1;
  // Labels are optional, unlike geometry: if a very narrow component misses
  // this bounded sample, return null instead of placing text outside La Reina.
  const divisions = 25;
  for (let row = 0; row < divisions; row++) for (let column = 0; column < divisions; column++) {
    const lng = west + (east - west) * (column + .5) / divisions;
    const lat = south + (north - south) * (row + .5) / divisions;
    if (!pointInsideBoundary(lng, lat, boundary)) continue;
    const point = projectSecurityPoint(lng, lat), [x, y] = point;
    let clearance = Math.min((x - westX) ** 2, (eastX - x) ** 2, (y - southY) ** 2, (northY - y) ** 2);
    for (const ring of projectedRings) for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      clearance = Math.min(clearance, segmentDistanceSquared(point, ring[previous], ring[index]));
    }
    if (clearance > greatestClearance) { greatestClearance = clearance; best = { lng, lat }; }
  }
  return best;
}

/**
 * Four geographic rectangles intersected with the complete communal boundary.
 * `rectangle` is deliberately not presented as an already-clipped GeoJSON:
 * render it inside an evenodd clipPath made from `boundaryPolygons`. This exact
 * intersection preserves holes and disconnected parts of concave polygons,
 * without the false connecting edges a single-ring rectangle clip can create.
 */
export function createAnalysisQuadrants(boundary) {
  const polygons = boundaryPolygons(boundary);
  const coordinates = polygons.flat(2);
  if (!coordinates.length) throw new Error('El límite comunal no tiene coordenadas para dividirlo en cuadrantes.');
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const point of coordinates) {
    if (!Array.isArray(point) || point.length < 2) throw new Error('El límite comunal contiene coordenadas no válidas.');
    const [lng, lat] = point; projectSecurityPoint(lng, lat);
    west = Math.min(west, lng); east = Math.max(east, lng); south = Math.min(south, lat); north = Math.max(north, lat);
  }
  if (west >= east || south >= north) throw new Error('El límite comunal necesita una superficie válida para dividirlo en cuadrantes.');
  const center = { lng: (west + east) / 2, lat: (south + north) / 2 };
  const projectedRings = polygons.flatMap(polygon => polygon.map(ring => ring.map(([lng, lat]) => projectSecurityPoint(lng, lat))));
  const quadrants = ANALYSIS_QUADRANTS.map(option => {
    const bounds = [[option.north ? center.lat : south, option.east ? center.lng : west],
      [option.north ? north : center.lat, option.east ? east : center.lng]];
    const quadrant = { ...option, bounds, rectangle: rectangle(bounds) };
    quadrant.labelPoint = interiorLabelPoint(quadrant, boundary, projectedRings);
    return quadrant;
  });
  return { center, bounds: [[south, west], [north, east]], boundary, boundaryPolygons: polygons, quadrants,
    axisOwnership: { latitude: 'north', longitude: 'east', center: 'noreste' } };
}

/** Exact membership in both the commune and one deterministic half of each axis. */
export function classifyAnalysisQuadrant(record, definition) {
  const point = pointCoordinates(record);
  if (!point || !definition?.center || !definition.boundary) return null;
  const { lng, lat } = point, [[south, west], [north, east]] = definition.bounds;
  if (lng < west || lng > east || lat < south || lat > north || !pointInsideBoundary(lng, lat, definition.boundary)) return null;
  return quadrantId(lng, lat, definition.center);
}

export function filterAnalysisQuadrants(records, selection, definition) {
  const selected = normalizeAnalysisQuadrants(selection);
  return records.filter(record => { const id = classifyAnalysisQuadrant(record, definition); return id !== null && (selected === 'all' || selected.includes(id)); });
}

export function groupAnalysisQuadrants(records, definition) {
  const groups = Object.fromEntries(ANALYSIS_QUADRANT_IDS.map(id => [id, []]));
  const outside = [];
  for (const record of records) { const id = classifyAnalysisQuadrant(record, definition); if (id === null) outside.push(record); else groups[id].push(record); }
  return { groups, outside };
}

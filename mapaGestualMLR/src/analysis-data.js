// Local, explicitly simulated incident data. Coordinates use WGS84 at input
// and Web Mercator metres for the density surface shared by map providers.
const EARTH_RADIUS = 6378137;
const DISTANCE_EARTH_RADIUS = 6371008.8;
const DAY_MS = 86400000;
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const FIELDS = ['id', 'categoria', 'tipo_incidente', 'direccion', 'latitud', 'longitud', 'fecha', 'hora', 'dia_semana', 'resuelto', 'origen'];
const PERIODS = Object.freeze({ madrugada: [0, 6], manana: [6, 12], tarde: [12, 18], noche: [18, 24] });

// Four display groups derived from the existing incident descriptions. The
// premises group combines inhabited and non-inhabited places for this view;
// it does not replace the source description or create a new legal category.
export const SECURITY_ROBBERY_TYPES = Object.freeze([
  Object.freeze({ value: 'intimidacion', label: 'Violencia o intimidación' }),
  Object.freeze({ value: 'sorpresa', label: 'Por sorpresa' }),
  Object.freeze({ value: 'vehiculo', label: 'De vehículos' }),
  Object.freeze({ value: 'inmuebles', label: 'En inmuebles' })
]);
const ROBBERY_GROUPS = Object.freeze({
  'Robo con intimidación': 'intimidacion',
  'Robo con violencia': 'intimidacion',
  'Robo con violencia o intimidación': 'intimidacion',
  'Robo por sorpresa': 'sorpresa',
  'Robo de vehículo': 'vehiculo',
  'Robo de vehículo motorizado': 'vehiculo',
  'Robo en lugar habitado': 'inmuebles',
  'Robo en lugar no habitado': 'inmuebles'
});

export function classifySecurityRobbery(record) {
  const description = typeof record === 'string' ? record : record?.tipo_incidente;
  return Object.hasOwn(ROBBERY_GROUPS, description) ? ROBBERY_GROUPS[description] : null;
}

/** Canonical multi-selection: 'all', or unique group IDs in display order. */
export function normalizeSecurityRobberyTypes(value = 'all') {
  const values = Array.isArray(value) ? value : [value];
  const allowed = SECURITY_ROBBERY_TYPES.map(option => option.value);
  if (values.some(option => option !== 'all' && !allowed.includes(option))) {
    throw new Error('El tipo de robo seleccionado no es válido.');
  }
  const selected = allowed.filter(option => values.includes(option));
  return values.includes('all') || selected.length === 0 || selected.length === allowed.length ? 'all' : selected;
}

export function toggleSecurityRobberyType(current, value) {
  const option = normalizeSecurityRobberyTypes(value);
  if (option === 'all') return 'all';
  if (option.length !== 1) throw new Error('Elige un tipo de robo por vez.');
  const previous = normalizeSecurityRobberyTypes(current), selected = previous === 'all' ? [] : [...previous];
  const index = selected.indexOf(option[0]);
  if (index < 0) selected.push(option[0]); else selected.splice(index, 1);
  return normalizeSecurityRobberyTypes(selected);
}

// Tintes de Seguridad y riesgos del Manual gráfico de La Reina.
export const HEAT_COLOR_STOPS = Object.freeze([
  Object.freeze({ value: 0, color: Object.freeze([253, 234, 242]) }),
  Object.freeze({ value: .25, color: Object.freeze([248, 192, 217]) }),
  Object.freeze({ value: .5, color: Object.freeze([244, 150, 192]) }),
  Object.freeze({ value: .75, color: Object.freeze([239, 108, 167]) }),
  Object.freeze({ value: 1, color: Object.freeze([232, 45, 129]) })
]);

export function csvRows(text) {
  if (typeof text !== 'string') throw new TypeError('El archivo CSV debe contener texto.');
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closedQuote = false;
  const finishField = () => { row.push(field); field = ''; closedQuote = false; };
  const finishRow = () => { finishField(); if (row.some(value => value.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else field += char;
      continue;
    }
    if (char === ',') { finishField(); continue; }
    if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; finishRow(); continue; }
    if (closedQuote) { if (char === ' ' || char === '\t') continue; throw new Error('El CSV contiene texto después del cierre de comillas.'); }
    if (char === '"') { if (field) throw new Error('El CSV contiene comillas sin escapar.'); quoted = true; }
    else field += char;
  }
  if (quoted) throw new Error('El CSV contiene comillas sin cerrar.');
  if (field || row.length || closedQuote) finishRow();
  return rows;
}

export function parseSecurityCSV(text) {
  const rows = csvRows(text), headers = rows.shift()?.map(value => value.trim()) || [];
  if (new Set(headers).size !== headers.length || FIELDS.some(name => !headers.includes(name))) throw new Error('El CSV no tiene las columnas de seguridad requeridas.');
  const ids = new Set();
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`La fila ${index + 2} del CSV no tiene todas las columnas.`);
    const record = Object.fromEntries(headers.map((name, column) => [name, cells[column].trim()]));
    const lng = Number(record.longitud), lat = Number(record.latitud);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(record.fecha) ? new Date(`${record.fecha}T00:00:00Z`) : null;
    const validDate = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === record.fecha;
    const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(record.hora);
    if (!record.id || ids.has(record.id) || !record.direccion || !record.tipo_incidente || record.categoria !== 'Seguridad'
      || record.origen !== 'simulado' || !['sí', 'no'].includes(record.resuelto) || !validDate || !time
      || Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3] || 0) > 59
      || !Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat <= -85 || lat >= 85) {
      throw new Error(`La fila ${index + 2} del CSV contiene un incidente no válido.`);
    }
    ids.add(record.id);
    return { ...record, latitud: lat, longitud: lng, lat, lng, year: record.fecha.slice(0, 4), month: record.fecha.slice(5, 7), hour: Number(time[1]), resolved: record.resuelto === 'sí', robberyType: classifySecurityRobbery(record) };
  });
}

export function filterSecurityRecords(records, { year = 'all', month = 'all', resolution = 'all', period = 'all', robbery = 'all' } = {}) {
  year = String(year);
  month = String(month);
  if (year !== 'all' && !/^\d{4}$/.test(year)) throw new Error('El año seleccionado no es válido.');
  if (month !== 'all' && !/^(0[1-9]|1[0-2])$/.test(month)) throw new Error('El mes seleccionado no es válido.');
  if (!['all', 'yes', 'no'].includes(resolution)) throw new Error('El estado de resolución no es válido.');
  if (period !== 'all' && !Object.hasOwn(PERIODS, period)) throw new Error('El horario seleccionado no es válido.');
  const range = PERIODS[period], robberyTypes = normalizeSecurityRobberyTypes(robbery);
  return records.filter(record => (year === 'all' || record.year === year)
    && (month === 'all' || (record.month ?? record.fecha?.slice(5, 7)) === month)
    && (resolution === 'all' || record.resolved === (resolution === 'yes'))
    && (!range || record.hour >= range[0] && record.hour < range[1])
    && (robberyTypes === 'all' || robberyTypes.includes(classifySecurityRobbery(record))));
}

function isoDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('La fecha del período no es válida.');
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('La fecha del período no es válida.');
  return time;
}

/** A calendar period, independent of the computer's current clock and timezone. */
export function getSecurityDateRange({ year = 'all', month = 'all' } = {}, metadata = {}) {
  year = String(year); month = String(month);
  if (year !== 'all' && !/^\d{4}$/.test(year)) throw new Error('El año seleccionado no es válido.');
  if (month !== 'all' && !/^(0[1-9]|1[0-2])$/.test(month)) throw new Error('El mes seleccionado no es válido.');
  const first = metadata.periodo?.desde ?? '2023-01-01', last = metadata.periodo?.hasta ?? '2025-12-31';
  if (isoDay(first) > isoDay(last)) throw new Error('El período de la base no es válido.');
  const firstYear = year === 'all' ? first.slice(0, 4) : year, lastYear = year === 'all' ? last.slice(0, 4) : year;
  const firstMonth = month === 'all' ? '01' : month, lastMonth = month === 'all' ? '12' : month;
  const start = `${firstYear}-${firstMonth}-01`;
  const endDate = new Date(isoDay(`${lastYear}-${lastMonth}-01`));
  endDate.setUTCMonth(endDate.getUTCMonth() + 1); endDate.setUTCDate(0);
  const end = endDate.toISOString().slice(0, 10);
  const span = firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`;
  const label = month === 'all' ? span : `${MONTH_NAMES[Number(month) - 1]} de ${span}`;
  return { start: year === 'all' && month === 'all' ? first : start,
    end: year === 'all' && month === 'all' ? last : end, label };
}

function incidentTime(record) {
  const day = isoDay(record.fecha), time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(record.hora);
  if (!time || Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3] || 0) > 59) throw new Error('La hora del incidente no es válida.');
  return day + Number(time[1]) * 3600000 + Number(time[2]) * 60000 + Number(time[3] || 0) * 1000;
}

function distanceMetres(lng1, lat1, lng2, lat2) {
  const radians = Math.PI / 180, a = lat1 * radians, b = lat2 * radians;
  const dlat = (lat2 - lat1) * radians, dlng = (lng2 - lng1) * radians;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(dlng / 2) ** 2;
  return 2 * DISTANCE_EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

const shortDate = value => value.split('-').reverse().join('/');

export function summarizeSecurityArea(records, referenceDate) {
  const end = isoDay(referenceDate);
  const start = new Date(end - 6 * DAY_MS).toISOString().slice(0, 10);
  const last7DaysRange = { start, end: referenceDate, label: `Del ${shortDate(start)} al ${shortDate(referenceDate)}` };
  let last7Days = 0, lastIncident = null;
  for (const record of records) {
    if (record.fecha >= start && record.fecha <= referenceDate) last7Days++;
    if (!lastIncident || record.fecha > lastIncident.fecha
      || record.fecha === lastIncident.fecha && record.hora > lastIncident.hora) lastIncident = record;
  }
  return { total: records.length, last7Days, last7DaysRange, last7DaysLabel: last7DaysRange.label, referenceDate, lastIncident };
}

/** Build once per filter change. Pointer movement only inspects nearby buckets. */
export function createSecuritySpatialIndex(records) {
  const cellSize = 400, buckets = new Map(); let latestDate = null;
  for (const record of records) {
    const lng = Number(record.lng ?? record.longitud), lat = Number(record.lat ?? record.latitud);
    const [x, y] = projectSecurityPoint(lng, lat), timestamp = incidentTime(record);
    const key = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ record, lng, lat, timestamp });
    if (latestDate === null || record.fecha > latestDate) latestDate = record.fecha;
  }
  return {
    size: records.length,
    query({ lng, lat, radiusMetres = 250, referenceDate = latestDate } = {}) {
      projectSecurityPoint(lng, lat);
      if (!Number.isFinite(radiusMetres) || radiusMetres <= 0 || radiusMetres > 25000) throw new Error('El radio de consulta no es válido.');
      const end = referenceDate === null ? null : isoDay(referenceDate);
      const start = end === null ? null : end - 6 * DAY_MS;
      const last7DaysRange = end === null ? null : { start: new Date(start).toISOString().slice(0, 10), end: referenceDate };
      if (last7DaysRange) last7DaysRange.label = `Del ${shortDate(last7DaysRange.start)} al ${shortDate(last7DaysRange.end)}`;
      const angular = radiusMetres / DISTANCE_EARTH_RADIUS, degrees = 180 / Math.PI;
      const latitudeDelta = angular * degrees;
      const longitudeDelta = Math.asin(Math.min(1, Math.sin(angular) / Math.cos(lat / degrees))) * degrees;
      const south = Math.max(-85.05112877, lat - latitudeDelta), north = Math.min(85.05112877, lat + latitudeDelta);
      const west = lng - longitudeDelta, east = lng + longitudeDelta;
      const longitudeRanges = west < -180 ? [[west + 360, 180], [-180, east]]
        : east > 180 ? [[west, 180], [-180, east - 360]] : [[west, east]];
      const southY = projectSecurityPoint(lng, south)[1], northY = projectSecurityPoint(lng, north)[1];
      let total = 0, resolved = 0, last7Days = 0, latest = null;
      for (const [minLng, maxLng] of longitudeRanges) {
        const westX = projectSecurityPoint(minLng, lat)[0], eastX = projectSecurityPoint(maxLng, lat)[0];
        for (let column = Math.floor(westX / cellSize); column <= Math.floor(eastX / cellSize); column++) {
          for (let row = Math.floor(southY / cellSize); row <= Math.floor(northY / cellSize); row++) {
            for (const entry of buckets.get(`${column},${row}`) || []) {
              if (distanceMetres(lng, lat, entry.lng, entry.lat) > radiusMetres + 1e-6) continue;
              total++; resolved += (entry.record.resolved ?? entry.record.resuelto === 'sí') ? 1 : 0;
              if (start !== null && entry.timestamp >= start && entry.timestamp < end + DAY_MS) last7Days++;
              if (!latest || entry.timestamp > latest.timestamp) latest = entry;
            }
          }
        }
      }
      const lastIncident = latest ? { id: latest.record.id, fecha: latest.record.fecha, hora: latest.record.hora,
        direccion: latest.record.direccion, tipo_incidente: latest.record.tipo_incidente,
        resuelto: latest.record.resuelto ?? (latest.record.resolved ? 'sí' : 'no'),
        resolved: latest.record.resolved ?? latest.record.resuelto === 'sí', lat: latest.lat, lng: latest.lng } : null;
      return { total, resolved, unresolved: total - resolved, lastIncident, last7Days, last7DaysRange,
        last7DaysLabel: last7DaysRange?.label ?? '', referenceDate, radiusMetres };
    }
  };
}

export function summarizeSecurityRecords(records) {
  let resolved = 0; const byHour = Array(24).fill(0), years = new Set();
  for (const record of records) { resolved += record.resolved ? 1 : 0; byHour[record.hour]++; years.add(record.year); }
  return { total: records.length, resolved, unresolved: records.length - resolved, byHour, years: [...years].sort() };
}

export function projectSecurityPoint(lng, lat) {
  if (![lng, lat].every(Number.isFinite) || Math.abs(lat) >= 85.05112878 || Math.abs(lng) > 180) throw new Error('La coordenada no se puede proyectar al mapa.');
  return [EARTH_RADIUS * lng * Math.PI / 180, EARTH_RADIUS * Math.asinh(Math.tan(lat * Math.PI / 180))];
}

export function boundaryPolygons(boundary) {
  if (!boundary) throw new Error('No se encontró el límite comunal.');
  if (boundary.type === 'FeatureCollection') return boundary.features.flatMap(boundaryPolygons);
  if (boundary.type === 'Feature') return boundaryPolygons(boundary.geometry);
  if (boundary.type === 'GeometryCollection') return boundary.geometries.flatMap(boundaryPolygons);
  if (boundary.type === 'Polygon') return [boundary.coordinates];
  if (boundary.type === 'MultiPolygon') return boundary.coordinates;
  throw new Error('El límite comunal necesita una geometría de polígono.');
}

// 0 outside, 1 inside, 2 on an edge. Outer edges are included; hole edges are not.
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j], [x2, y2] = ring[i], dx = x2 - x1, dy = y2 - y1;
    if (Math.abs((lng - x1) * dy - (lat - y1) * dx) < 1e-11
      && lng >= Math.min(x1, x2) - 1e-11 && lng <= Math.max(x1, x2) + 1e-11
      && lat >= Math.min(y1, y2) - 1e-11 && lat <= Math.max(y1, y2) + 1e-11) return 2;
    if ((y1 > lat) !== (y2 > lat) && lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside ? 1 : 0;
}

function insidePolygons(lng, lat, polygons) {
  return polygons.some(rings => rings.length && pointInRing(lng, lat, rings[0]) > 0 && rings.slice(1).every(ring => pointInRing(lng, lat, ring) === 0));
}

export function pointInsideBoundary(lng, lat, boundary) { return insidePolygons(lng, lat, boundaryPolygons(boundary)); }

function gaussianKernel(sigma) {
  const radius = Math.max(1, Math.ceil(3 * sigma)), kernel = new Float32Array(radius * 2 + 1); let sum = 0;
  for (let i = -radius; i <= radius; i++) { const value = Math.exp(-i * i / (2 * sigma * sigma)); kernel[i + radius] = value; sum += value; }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  return { kernel, radius };
}

export function buildDensitySurface(records, boundary, { width = 256, height = 128, bandwidthMetres = 240 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 2048 || height > 2048
    || !Number.isFinite(bandwidthMetres) || bandwidthMetres <= 0 || bandwidthMetres > 2000) throw new Error('La resolución del mapa de calor no es válida.');
  const polygons = boundaryPolygons(boundary), coordinates = polygons.flat(2);
  if (!coordinates.length) throw new Error('El límite comunal no tiene coordenadas.');
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const [lng, lat] of coordinates) { projectSecurityPoint(lng, lat); west = Math.min(west, lng); east = Math.max(east, lng); south = Math.min(south, lat); north = Math.max(north, lat); }
  const [westX, southY] = projectSecurityPoint(west, south), [eastX, northY] = projectSecurityPoint(east, north);
  if (eastX <= westX || northY <= southY) throw new Error('El límite comunal no tiene una superficie válida.');
  const stepX = (eastX - westX) / width, stepY = (northY - southY) / height;
  const counts = new Float32Array(width * height); let includedCount = 0;
  for (const record of records) {
    const lng = record.lng ?? record.longitud, lat = record.lat ?? record.latitud;
    if (![lng, lat].every(Number.isFinite) || !insidePolygons(lng, lat, polygons)) continue;
    const [x, y] = projectSecurityPoint(lng, lat);
    const column = Math.min(width - 1, Math.max(0, Math.floor((x - westX) / stepX)));
    const row = Math.min(height - 1, Math.max(0, Math.floor((northY - y) / stepY)));
    counts[row * width + column]++; includedCount++;
  }
  // EPSG:3857 stretches ground distances by sec(latitude). Compensate once,
  // keeping the same ground-distance smoothing when the map is zoomed.
  const mercatorBandwidth = bandwidthMetres / Math.cos((north + south) * Math.PI / 360);
  const horizontal = gaussianKernel(mercatorBandwidth / stepX), vertical = gaussianKernel(mercatorBandwidth / stepY);
  const temporary = new Float32Array(counts.length), values = new Float32Array(counts.length);
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    let value = 0;
    for (let k = -horizontal.radius; k <= horizontal.radius; k++) {
      const x = column + k; if (x >= 0 && x < width) value += counts[row * width + x] * horizontal.kernel[k + horizontal.radius];
    }
    temporary[row * width + column] = value;
  }
  let max = 0;
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    let value = 0;
    for (let k = -vertical.radius; k <= vertical.radius; k++) {
      const y = row + k; if (y >= 0 && y < height) value += temporary[y * width + column] * vertical.kernel[k + vertical.radius];
    }
    values[row * width + column] = value; max = Math.max(max, value);
  }
  return { values, width, height, bounds: [[south, west], [north, east]], max,
    projectedBounds: [westX, southY, eastX, northY], includedCount, excludedCount: records.length - includedCount, bandwidthMetres };
}

// Values are relative to the selected dataset's maximum, not a risk estimate.
export function heatColor(value) {
  value = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  for (let i = 1; i < HEAT_COLOR_STOPS.length; i++) {
    const high = HEAT_COLOR_STOPS[i], low = HEAT_COLOR_STOPS[i - 1];
    if (value <= high.value) { const t = (value - low.value) / (high.value - low.value); return low.color.map((channel, index) => Math.round(channel + (high.color[index] - channel) * t)); }
  }
  return [...HEAT_COLOR_STOPS.at(-1).color];
}

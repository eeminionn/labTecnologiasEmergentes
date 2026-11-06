import { getSecurityDateRange, projectSecurityPoint } from './analysis-data.js';

// A demonstration inventory: published locations may be approximate, while
// installation dates, equipment types and operational states remain simulated.
const FIELDS = ['id', 'categoria', 'tipo_camara', 'direccion', 'latitud', 'longitud',
  'fecha_instalacion', 'estado', 'origen_ubicacion', 'precision_ubicacion', 'fuente_url',
  'fuente_fecha', 'datos_operativos', 'observacion'];
const STATES = Object.freeze({ operational: 'Operativa', maintenance: 'Mantención', inactive: 'Inactiva' });
const TYPES = Object.freeze({ domo: 'Domo', fija: 'Fija', lectora: 'Lectora de patentes' });
const EARTH_RADIUS = 6371008.8;

export const CAMERA_HEAT_COLOR_STOPS = Object.freeze([
  Object.freeze({ value: 0, color: Object.freeze([67, 217, 255]) }),
  Object.freeze({ value: .55, color: Object.freeze([22, 174, 255]) }),
  Object.freeze({ value: 1, color: Object.freeze([0, 102, 255]) })
]);

function csvRows(text) {
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

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validSource(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname; }
  catch { return false; }
}

export function parseCameraCSV(text) {
  const rows = csvRows(text), headers = rows.shift()?.map(value => value.trim()) || [];
  if (new Set(headers).size !== headers.length || FIELDS.some(name => !headers.includes(name))) {
    throw new Error('El CSV no tiene las columnas de cámaras requeridas.');
  }
  const ids = new Set();
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`La fila ${index + 2} del CSV no tiene todas las columnas.`);
    const record = Object.fromEntries(headers.map((name, column) => [name, cells[column].trim()]));
    const lat = Number(record.latitud), lng = Number(record.longitud), published = record.origen_ubicacion === 'publicada';
    if (!record.id || ids.has(record.id) || record.categoria !== 'Cámaras' || !record.direccion
      || !Object.values(TYPES).includes(record.tipo_camara) || !Object.values(STATES).includes(record.estado)
      || !validDate(record.fecha_instalacion) || record.datos_operativos !== 'simulados'
      || !['publicada', 'simulada'].includes(record.origen_ubicacion)
      || !(published ? ['aproximada', 'exacta'] : ['simulada']).includes(record.precision_ubicacion)
      || (published && !validSource(record.fuente_url)) || (record.fuente_url && !validSource(record.fuente_url))
      || (record.fuente_fecha && !validDate(record.fuente_fecha))
      || !record.latitud || !record.longitud || !Number.isFinite(lat) || !Number.isFinite(lng)
      || Math.abs(lng) > 180 || Math.abs(lat) >= 85.05112878) {
      throw new Error(`La fila ${index + 2} del CSV contiene una cámara de demostración no válida.`);
    }
    ids.add(record.id);
    return { ...record, latitud: lat, longitud: lng, lat, lng,
      year: record.fecha_instalacion.slice(0, 4), month: record.fecha_instalacion.slice(5, 7),
      operational: record.estado === STATES.operational,
      state: Object.keys(STATES).find(key => STATES[key] === record.estado),
      type: Object.keys(TYPES).find(key => TYPES[key] === record.tipo_camara), published };
  });
}

function filterValue(value, values, description) {
  if (value === 'all') return null;
  const resolved = Object.hasOwn(values, value) ? values[value] : Object.values(values).includes(value) ? value : null;
  if (!resolved) throw new Error(`El ${description} seleccionado no es válido.`);
  return resolved;
}

/** Retain legacy aliases at the boundary; store selected labels in UI order. */
export function normalizeCameraTypes(value = 'all') {
  const values = Array.isArray(value) ? value : [value];
  const resolved = values.map(option => option === 'all' ? 'all' : filterValue(option, TYPES, 'tipo de cámara'));
  const selected = Object.values(TYPES).filter(option => resolved.includes(option));
  return resolved.includes('all') || selected.length === 0 || selected.length === Object.keys(TYPES).length ? 'all' : selected;
}

export function toggleCameraType(current, value) {
  const option = normalizeCameraTypes(value);
  if (option === 'all') return 'all';
  if (option.length !== 1) throw new Error('Elige un tipo de cámara por vez.');
  const previous = normalizeCameraTypes(current), selected = previous === 'all' ? [] : [...previous];
  const index = selected.indexOf(option[0]);
  if (index < 0) selected.push(option[0]); else selected.splice(index, 1);
  return normalizeCameraTypes(selected);
}

/** Inventory installed by the period's final day, rather than only new cameras. */
export function filterCameraRecords(records, { year = 'all', month = 'all', state = 'all', type = 'all', origin = 'all' } = {}, metadata = {}) {
  year = String(year); month = String(month);
  if (month !== 'all' && year === 'all') throw new Error('Elige un año para consultar el inventario al cierre de un mes.');
  const stateLabel = filterValue(state, STATES, 'estado'), typeLabels = normalizeCameraTypes(type);
  if (!['all', 'publicada', 'simulada'].includes(origin)) throw new Error('El origen de ubicación seleccionado no es válido.');
  const { end } = getSecurityDateRange({ year, month }, metadata);
  return records.filter(record => record.fecha_instalacion <= end
    && (!stateLabel || record.estado === stateLabel) && (typeLabels === 'all' || typeLabels.includes(record.tipo_camara))
    && (origin === 'all' || record.origen_ubicacion === origin));
}

export function summarizeCameraRecords(records) {
  let operational = 0, maintenance = 0, inactive = 0, published = 0, simulated = 0;
  for (const record of records) {
    if (record.estado === STATES.operational) operational++;
    else if (record.estado === STATES.maintenance) maintenance++;
    else if (record.estado === STATES.inactive) inactive++;
    else throw new Error('La cámara contiene un estado operativo no válido.');
    if (record.origen_ubicacion === 'publicada') published++;
    else if (record.origen_ubicacion === 'simulada') simulated++;
    else throw new Error('La cámara contiene un origen de ubicación no válido.');
  }
  return { total: records.length, operational, maintenance, inactive, published, simulated };
}

// A relative concentration scale, not an assertion of visibility or coverage.
export function cameraHeatColor(value) {
  value = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  for (let index = 1; index < CAMERA_HEAT_COLOR_STOPS.length; index++) {
    const low = CAMERA_HEAT_COLOR_STOPS[index - 1], high = CAMERA_HEAT_COLOR_STOPS[index];
    if (value <= high.value) {
      const amount = (value - low.value) / (high.value - low.value);
      return low.color.map((channel, channelIndex) => Math.round(channel + (high.color[channelIndex] - channel) * amount));
    }
  }
  return [...CAMERA_HEAT_COLOR_STOPS.at(-1).color];
}

function distanceMetres(lng1, lat1, lng2, lat2) {
  const radians = Math.PI / 180, a = lat1 * radians, b = lat2 * radians;
  const h = Math.sin((lat2 - lat1) * radians / 2) ** 2
    + Math.cos(a) * Math.cos(b) * Math.sin((lng2 - lng1) * radians / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The small inventory can be queried directly; no camera coverage is inferred. */
export function createCameraSpatialIndex(records) {
  const entries = records.map(record => {
    const lng = Number(record.lng ?? record.longitud), lat = Number(record.lat ?? record.latitud);
    projectSecurityPoint(lng, lat);
    return { record, lng, lat };
  });
  return {
    size: entries.length,
    query({ lng, lat, radiusMetres = 250 } = {}) {
      projectSecurityPoint(lng, lat);
      if (!Number.isFinite(radiusMetres) || radiusMetres <= 0 || radiusMetres > 25000) throw new Error('El radio de consulta no es válido.');
      const local = []; let nearest = null;
      for (const entry of entries) {
        const distance = distanceMetres(lng, lat, entry.lng, entry.lat);
        if (distance > radiusMetres + 1e-6) continue;
        local.push(entry.record);
        if (!nearest || distance < nearest.distanceMetres) nearest = { ...entry.record, lat: entry.lat, lng: entry.lng, distanceMetres: distance };
      }
      return { ...summarizeCameraRecords(local), nearest, radiusMetres };
    }
  };
}

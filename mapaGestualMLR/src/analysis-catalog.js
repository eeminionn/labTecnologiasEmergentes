import { csvRows } from './analysis-data.js';

const group = (title, layers) => Object.freeze({ title, layers: Object.freeze(layers.map(layer => Object.freeze(layer))) });

export const ANALYSIS_GROUPS = Object.freeze([
  group('Incidentes y vigilancia', [
    { id: 'security', label: 'Robos', count: 'robos', singular: 'robo', prefix: 'analysis', tone: 'security', description: 'Concentración por fecha y horario' },
    { id: 'cameras', label: 'Cámaras', count: 'cámaras', singular: 'cámara', prefix: 'camera-analysis', tone: 'camera', description: 'Puntos o concentración de cámaras' }
  ]),
  group('Recursos de seguridad', [
    { id: 'fixed', label: 'Puntos fijos de seguridad ciudadana', count: 'ubicaciones', singular: 'punto fijo', prefix: 'fixed-analysis', tone: 'fixed', description: 'Centros y sedes de seguridad', resource: true },
    { id: 'alarms', label: 'Botones de emergencia', count: 'botones', singular: 'botón', prefix: 'alarms-analysis', tone: 'alarms', description: 'Botones en paraderos y recintos', resource: true }
  ])
]);

export const ANALYSIS_LAYERS = Object.freeze(ANALYSIS_GROUPS.flatMap(({ layers }) => layers));
export const getAnalysisLayer = id => ANALYSIS_LAYERS.find(layer => layer.id === id);

export function chooseAnalysisLayer(selection, id, role) {
  if (!getAnalysisLayer(id) || !['primary', 'compare'].includes(role)) return null;
  if (role === 'compare') return id === selection.primary ? null : { ...selection, compare: id };
  if (id === selection.compare) return null;
  return { ...selection, primary: id };
}

export function parseSimulatedSecurityResources(text) {
  const [header, ...rows] = csvRows(text);
  if (header?.join(',') !== 'id,kind,address,lat,lng') {
    throw new Error('El CSV de recursos simulados no tiene las columnas requeridas.');
  }
  return rows.map((row, index) => {
    const [id, kind, address, lat, lng] = row;
    if (row.length !== header.length || !lat.trim() || !lng.trim()) {
      throw new Error(`La fila ${index + 2} del CSV contiene una ubicación simulada no válida.`);
    }
    return {
      id, kind, address, lat: Number(lat), lng: Number(lng), simulated: true,
      title: kind === 'fixed' ? 'Punto fijo de seguridad ciudadana' : 'Botón de emergencia',
      status: 'Referencia territorial',
      note: 'Ubicación de referencia para análisis.'
    };
  });
}

export function parseAlarmUsage(text) {
  const [header, ...rows] = csvRows(text);
  if (header?.join(',') !== 'id,pulsaciones') {
    throw new Error('El archivo de pulsaciones no tiene las columnas requeridas.');
  }
  const usage = new Map();
  for (const [index, row] of rows.entries()) {
    const [id, count] = row;
    if (row.length !== header.length || !/^[a-z0-9-]+$/.test(id) || !/^\d+$/.test(count)
      || !Number.isSafeInteger(Number(count)) || usage.has(id)) {
      throw new Error(`La fila ${index + 2} del archivo de pulsaciones no es válida.`);
    }
    usage.set(id, Number(count));
  }
  return usage;
}

export function mostUsedAlarmButtons(records) {
  return records.filter(record => record.activations > 0)
    .sort((a, b) => b.activations - a.activations || a.id.localeCompare(b.id))
    .slice(0, 10);
}

/** Documented and demonstration locations are validated together. */
export function readSecurityResources(data, inside) {
  if (!Array.isArray(data)) throw new Error('No se pudo leer el catastro de seguridad.');
  const ids = new Set();
  return data.map(record => {
    const { id, kind, title, address, lat, lng, status, note, source, simulated = false } = record ?? {};
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id) || ids.has(id) || !getAnalysisLayer(kind)?.resource
      || typeof simulated !== 'boolean' || ![title, address, status, note].every(text => typeof text === 'string' && text.trim())
      || !Number.isFinite(lat) || !Number.isFinite(lng) || !inside(lng, lat)) {
      throw new Error('El catastro contiene una ubicación no válida.');
    }
    if (simulated ? source != null : typeof source?.label !== 'string' || !source.label.trim() || typeof source.url !== 'string') {
      throw new Error('El catastro contiene una fuente no válida.');
    }
    const url = simulated ? null : new URL(source.url);
    if (url && url.protocol !== 'https:') throw new Error('El catastro contiene una fuente no válida.');
    ids.add(id);
    return { id, kind, title, address, lat, lng, status, note, simulated, source: url ? { label: source.label, url: url.href } : null };
  });
}

export function nearbySecurityResources(records, { lat, lng }, radiusMetres = 250) {
  const rad = Math.PI / 180;
  const nearby = [];
  for (const record of records) {
    const dLat = (record.lat - lat) * rad, dLng = (record.lng - lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(record.lat * rad) * Math.sin(dLng / 2) ** 2;
    const distanceMetres = 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
    if (distanceMetres <= radiusMetres) nearby.push({ ...record, distanceMetres });
  }
  nearby.sort((a, b) => a.distanceMetres - b.distanceMetres);
  const simulated = nearby.filter(record => record.simulated).length;
  return { total: nearby.length, documented: nearby.length - simulated, simulated, nearest: nearby[0] ?? null, radiusMetres };
}

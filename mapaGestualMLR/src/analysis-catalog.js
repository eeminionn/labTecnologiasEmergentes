const group = (title, layers) => Object.freeze({ title, layers: Object.freeze(layers.map(layer => Object.freeze(layer))) });

export const ANALYSIS_GROUPS = Object.freeze([
  group('Incidentes y vigilancia', [
    { id: 'security', label: 'Robos', count: 'robos', singular: 'robo', prefix: 'analysis', tone: 'security', description: 'Concentración por fecha y horario' },
    { id: 'cameras', label: 'Cámaras', count: 'cámaras', singular: 'cámara', prefix: 'camera-analysis', tone: 'camera', description: 'Puntos o concentración de cámaras' }
  ]),
  group('Recursos de seguridad', [
    { id: 'fixed', label: 'Puntos fijos de seguridad ciudadana', count: 'ubicaciones', singular: 'punto fijo', prefix: 'fixed-analysis', tone: 'fixed', description: 'Centros y sedes de seguridad', resource: true },
    { id: 'alarms', label: 'Botones de emergencia', count: 'ubicaciones', singular: 'botón', prefix: 'alarms-analysis', tone: 'alarms', description: 'Instalaciones con ubicación documentada', resource: true }
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

/** Catalogue includes only publicly documented locations, not a live inventory. */
export function readSecurityResources(data, inside) {
  if (!Array.isArray(data)) throw new Error('No se pudo leer el catastro de seguridad.');
  const ids = new Set();
  return data.map(record => {
    const { id, kind, title, address, lat, lng, status, note, source } = record ?? {};
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id) || ids.has(id) || !getAnalysisLayer(kind)?.resource
      || ![title, address, status, note, source?.label].every(text => typeof text === 'string' && text.trim())
      || !Number.isFinite(lat) || !Number.isFinite(lng) || !inside(lng, lat)) {
      throw new Error('El catastro contiene una ubicación no válida.');
    }
    const url = new URL(source.url);
    if (url.protocol !== 'https:') throw new Error('El catastro contiene una fuente no válida.');
    ids.add(id);
    return { id, kind, title, address, lat, lng, status, note, source: { label: source.label, url: url.href } };
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
  return { total: nearby.length, nearest: nearby[0] ?? null, radiusMetres };
}

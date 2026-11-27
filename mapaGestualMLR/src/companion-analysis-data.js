import { classifySecurityRobbery, SECURITY_ROBBERY_TYPES } from './analysis-data.js';

const TIMES = ['Madrugada · 00–06 h', 'Mañana · 06–12 h', 'Tarde · 12–18 h', 'Noche · 18–24 h'];
const CAMERA_STATES = [
  ['Operativa', 'Operativas'], ['Mantención', 'En mantención'], ['Inactiva', 'Inactivas']
];
const CAMERA_TYPES = ['Domo', 'Fija', 'Lectora de patentes'];
const FIXED_STATES = [['monitoreando', 'Monitoreando'], ['fuera_de_servicio', 'Fuera de servicio']];
const FILTER_KEYS = ['robbery', 'period', 'state', 'type', 'usage'];
const quadrantIds = new Intl.Collator('es-CL', { numeric: true });
const rankingNames = { security: 'robos', cameras: 'cámaras', fixed: 'casetas', alarms: 'botones' };
const rankingPageSize = 5;

function series(group, entries, counts, includeZero = false) {
  return entries.map(([key, label]) => ({ group, label, total: counts.get(key) ?? 0 }))
    .filter(row => includeZero || row.total > 0);
}

function frequency(counts, value) {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

function breakdown(kind, records) {
  const states = new Map();
  const types = new Map();
  let activations = 0;
  for (const record of records) {
    if (kind === 'security') {
      if (Number.isInteger(record.hour) && record.hour >= 0 && record.hour < 24) {
        frequency(states, Math.floor(record.hour / 6));
      }
      frequency(types, record.robberyType ?? classifySecurityRobbery(record));
    } else if (kind === 'cameras') {
      frequency(states, record.estado);
      frequency(types, record.tipo_camara);
    } else if (kind === 'fixed') {
      frequency(states, record.monitoringStatus);
    } else if (kind === 'alarms') {
      const known = Number.isSafeInteger(record.activations) && record.activations >= 0;
      frequency(states, known ? (record.activations > 0 ? 'used' : 'unused') : 'unknown');
      if (known) activations += record.activations;
    }
  }

  if (kind === 'security') {
    return [
      ...series('Horario', TIMES.map((label, index) => [index, label]), states, true),
      ...series('Tipo de robo', SECURITY_ROBBERY_TYPES.map(({ value, label }) => [value, label]), types)
    ];
  }
  if (kind === 'cameras') {
    return [
      ...series('Estado', CAMERA_STATES, states, true),
      ...series('Tipo de cámara', CAMERA_TYPES.map(type => [type, type]), types)
    ];
  }
  if (kind === 'fixed') {
    const known = FIXED_STATES.reduce((sum, [key]) => sum + (states.get(key) ?? 0), 0);
    states.set('unknown', records.length - known);
    return series('Estado', [...FIXED_STATES, ['unknown', 'Sin estado informado']], states);
  }
  const usage = series('Uso', [
    ['used', 'Botones con pulsaciones'], ['unused', 'Botones sin pulsaciones'],
    ['unknown', 'Botones sin registro de uso']
  ], states);
  if (records.length > (states.get('unknown') ?? 0)) {
    usage.unshift({ group: 'Uso', label: 'Pulsaciones informadas', total: activations, unit: 'pulsaciones' });
  }
  return usage;
}

function summarizeLayer(layer, scope, quadrantOf) {
  const { kind, period, filters = {}, dateRange, context = false, ready = true, records = [] } = layer;
  const counts = new Map();
  let locatedTotal = 0;
  if (ready) {
    for (const record of records) {
      const id = quadrantOf(record);
      if (!scope.has(id)) continue;
      frequency(counts, id);
      locatedTotal++;
    }
  }
  const filtered = Boolean(layer.filtered ?? FILTER_KEYS.some(key => filters[key] && filters[key] !== 'all'));
  const summary = {
    kind, period, ready, filtered,
    total: ready ? records.length : null,
    locatedTotal: ready ? locatedTotal : null,
    unassignedTotal: ready ? records.length - locatedTotal : null
  };
  return { summary, counts, context, cutoff: dateRange?.end, records };
}

function quadrantRows(first, second, scope, areaOf) {
  const robberyAxis = first.summary.kind === 'security' ? 'primary'
    : second?.summary.kind === 'security' ? 'secondary' : null;
  const rows = Array.from(scope, id => {
    const primary = first.counts.get(id) ?? 0;
    const secondary = second ? second.counts.get(id) ?? 0 : null;
    const area = areaOf(id);
    const areaM2 = Number.isFinite(area) && area > 0 ? area : null;
    const robberies = robberyAxis === 'primary' ? primary : secondary;
    const density = robberyAxis && areaM2 ? robberies / (areaM2 / 1_000_000) : null;
    return { id, primary, secondary, areaM2, density: Number.isFinite(density) ? density : null };
  });
  return { rows, robberyAxis };
}

/** Missing surface data stays below measured density in either direction. */
export function sortCompanionQuadrants(rows, { metric = 'primary', ascending = false } = {}) {
  return [...rows].sort((a, b) => {
    if (metric === 'id') return quadrantIds.compare(a.id, b.id);
    const left = a[metric], right = b[metric];
    if (Number.isFinite(left) !== Number.isFinite(right)) return Number.isFinite(left) ? -1 : 1;
    const order = Number.isFinite(left) ? (ascending ? left - right : right - left) : 0;
    return order || quadrantIds.compare(a.id, b.id);
  });
}

/** Combine only the selected parts. The denominator must cover all their geometry. */
export function summarizeCompanionUnits(rows, robberyAxis) {
  const units = new Map();
  for (const { id, primary, secondary, areaM2 } of rows) {
    const unitId = id.split('-')[0];
    const unit = units.get(unitId) ?? { id: unitId, primary: 0, secondary: secondary === null ? null : 0, areaM2: 0 };
    unit.primary += primary;
    if (secondary !== null) unit.secondary += secondary;
    unit.areaM2 = unit.areaM2 === null || areaM2 === null ? null : unit.areaM2 + areaM2;
    units.set(unitId, unit);
  }
  return Array.from(units.values(), unit => {
    const density = robberyAxis && unit.areaM2 > 0 ? unit[robberyAxis] / (unit.areaM2 / 1_000_000) : null;
    return { ...unit, density: Number.isFinite(density) ? density : null };
  });
}

/** Resolve the same projected table in the analysis controls and the display. */
export function resolveCompanionRanking(source, settings = {}) {
  if (!source?.rows?.length) return null;
  const { primary, secondary, robberyAxis } = source;
  const groups = source.rows.map(row => row.id.split('-')[0]);
  const defaultLevel = new Set(groups).size > 1 ? 'unit' : 'part';
  const level = ['unit', 'part'].includes(settings.level) ? settings.level : defaultLevel;
  const rows = level === 'unit' ? summarizeCompanionUnits(source.rows, robberyAxis) : source.rows;
  const hasDensity = Boolean(robberyAxis) && rows.some(row => row.density !== null);
  const axes = [['primary', primary], ...(secondary ? [['secondary', secondary]] : [])];
  const options = axes.flatMap(([, { kind }]) => [
    [`${kind}:desc`, `Más ${rankingNames[kind] || 'registros'}`],
    [`${kind}:asc`, `Menos ${rankingNames[kind] || 'registros'}`]
  ]);
  if (hasDensity) options.push(['density:desc', 'Más robos por km²'], ['density:asc', 'Menos robos por km²']);
  options.push(['id:asc', 'Por número']);
  const defaultOrder = `${(robberyAxis === 'secondary' ? secondary : primary).kind}:desc`;
  const order = options.some(([value]) => value === settings.order) ? settings.order : defaultOrder;
  const [orderKind, direction] = order.split(':');
  const metric = axes.find(([, layer]) => layer.kind === orderKind)?.[0] ?? orderKind;
  const ascending = direction === 'asc';
  const sorted = sortCompanionQuadrants(rows, { metric, ascending });
  const pageCount = Math.ceil(sorted.length / rankingPageSize);
  const page = Number.isInteger(settings.page) ? Math.max(0, Math.min(settings.page, pageCount - 1)) : 0;
  const offset = page * rankingPageSize;
  const visibleRows = sorted.slice(offset, offset + rankingPageSize);
  return { level, order, page, pageSize: rankingPageSize, pageCount,
    first: offset + 1, last: offset + visibleRows.length, total: sorted.length,
    options, rows, visibleRows, hasDensity, metric, ascending };
}

function crossAnalysis(first, second, scope, areaOf) {
  if (!first?.summary.ready || !second?.summary.ready || first.summary.kind === second.summary.kind) return null;
  const { rows, robberyAxis } = quadrantRows(first, second, scope, areaOf);
  let sharedQuadrants = 0, onlyPrimary = 0, onlySecondary = 0;
  let primaryUnmatched = 0, secondaryUnmatched = 0;
  for (const { primary, secondary } of rows) {
    if (primary && secondary) sharedQuadrants++;
    else if (primary) { onlyPrimary++; primaryUnmatched += primary; }
    else if (secondary) { onlySecondary++; secondaryUnmatched += secondary; }
  }

  const sorted = sortCompanionQuadrants(rows, { metric: robberyAxis ?? 'primary' });
  const equipmentAxis = robberyAxis === 'primary' ? 'secondary' : 'primary';
  const withoutEquipment = robberyAxis ? sorted.find(row => row[robberyAxis] > 0 && row[equipmentAxis] === 0) ?? null : null;
  return {
    primary: first.summary, secondary: second.summary, rows: sorted, robberyAxis, withoutEquipment,
    sharedQuadrants, onlyPrimary, onlySecondary, neither: scope.size - sharedQuadrants - onlyPrimary - onlySecondary,
    primaryLocated: first.summary.locatedTotal, primaryUnmatched,
    secondaryLocated: second.summary.locatedTotal, secondaryUnmatched,
    contextual: second.context,
    differentCutoffs: Boolean(first.cutoff && second.cutoff && first.cutoff !== second.cutoff)
  };
}

/** Aggregate the visible records once. An absent location or feed never establishes a coverage gap. */
export function buildCompanionAnalysis({ layers, quadrantIds, allQuadrantIds, quadrantOf, quadrantAreaM2 = () => null }) {
  const scope = new Set(quadrantIds ?? allQuadrantIds);
  const summaries = layers.map(layer => summarizeLayer(layer, scope, quadrantOf));
  const visible = summaries.filter(layer => !layer.context);
  const context = summaries.find(layer => layer.context);
  const first = visible[0];
  const cross = crossAnalysis(first, visible[1] ?? context, scope, quadrantAreaM2);
  const ranking = !cross && first?.summary.ready
    ? { primary: first.summary, ...quadrantRows(first, null, scope, quadrantAreaM2) }
    : null;
  return {
    scopeCount: scope.size,
    layers: visible.map(({ summary, records }) => ({
      ...summary,
      breakdown: summary.ready ? breakdown(summary.kind, records) : []
    })),
    cross,
    ranking
  };
}

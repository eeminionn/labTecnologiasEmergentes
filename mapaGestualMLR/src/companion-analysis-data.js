import { classifySecurityRobbery, SECURITY_ROBBERY_TYPES } from './analysis-data.js';

const TIMES = ['Madrugada · 00–06 h', 'Mañana · 06–12 h', 'Tarde · 12–18 h', 'Noche · 18–24 h'];
const CAMERA_STATES = [
  ['Operativa', 'Operativas'], ['Mantención', 'En mantención'], ['Inactiva', 'Inactivas']
];
const CAMERA_TYPES = ['Domo', 'Fija', 'Lectora de patentes'];
const FIXED_STATES = [['monitoreando', 'Monitoreando'], ['fuera_de_servicio', 'Fuera de servicio']];
const FILTER_KEYS = ['robbery', 'period', 'state', 'type', 'usage'];
const sortByCount = (a, b) => b.total - a.total;

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

function crossAnalysis(first, second, scope) {
  if (!first?.summary.ready || !second?.summary.ready || first.summary.kind === second.summary.kind) return null;
  let sharedQuadrants = 0, onlyPrimary = 0, onlySecondary = 0;
  let primaryUnmatched = 0, secondaryUnmatched = 0;
  const populated = [];
  for (const id of scope) {
    const primary = first.counts.get(id) ?? 0;
    const secondary = second.counts.get(id) ?? 0;
    if (!primary && !secondary) continue;
    if (primary && secondary) sharedQuadrants++;
    else if (primary) { onlyPrimary++; primaryUnmatched += primary; }
    else { onlySecondary++; secondaryUnmatched += secondary; }
    populated.push({id, primary, secondary});
  }

  const robberyKey = first.summary.kind === 'security' ? 'primary'
    : second.summary.kind === 'security' ? 'secondary' : null;
  let withoutEquipment = null;
  if (robberyKey) {
    const equipmentKey = robberyKey === 'primary' ? 'secondary' : 'primary';
    populated.sort((a, b) => b[robberyKey] - a[robberyKey] || b[equipmentKey] - a[equipmentKey]);
    withoutEquipment = populated.find(row => row[robberyKey] > 0 && row[equipmentKey] === 0) ?? null;
  } else {
    // Rank by each inventory's share within its own total, not by combining raw counts.
    const weight = row => (row.primary > 0 && row.secondary > 0 ? 2 : 0)
      + row.primary / Math.max(1, first.summary.locatedTotal)
      + row.secondary / Math.max(1, second.summary.locatedTotal);
    populated.sort((a, b) => weight(b) - weight(a));
  }
  const rows = populated.slice(0, 5);
  if (withoutEquipment && !rows.includes(withoutEquipment)) rows[rows.length - 1] = withoutEquipment;
  return {
    primary: first.summary, secondary: second.summary, rows, withoutEquipment,
    sharedQuadrants, onlyPrimary, onlySecondary, neither: scope.size - populated.length,
    primaryLocated: first.summary.locatedTotal, primaryUnmatched,
    secondaryLocated: second.summary.locatedTotal, secondaryUnmatched,
    contextual: second.context,
    differentCutoffs: Boolean(first.cutoff && second.cutoff && first.cutoff !== second.cutoff)
  };
}

/** Aggregate the visible records once. An absent location or feed never establishes a coverage gap. */
export function buildCompanionAnalysis({ layers, quadrantIds, allQuadrantIds, quadrantOf }) {
  const scope = new Set(quadrantIds ?? allQuadrantIds);
  const summaries = layers.map(layer => summarizeLayer(layer, scope, quadrantOf));
  const visible = summaries.filter(layer => !layer.context);
  const context = summaries.find(layer => layer.context);
  return {
    scopeCount: scope.size,
    layers: visible.map(({ summary, counts, records }) => ({
      ...summary,
      breakdown: summary.ready ? breakdown(summary.kind, records) : [],
      topQuadrants: [...counts].map(([id, total]) => ({ id, total })).sort(sortByCount).slice(0, 5)
    })),
    cross: crossAnalysis(visible[0], visible[1] ?? context, scope)
  };
}

// Illustrative planning allowances in Chilean pesos, including VAT.
// These are demonstration assumptions, not municipal contracts or market quotes.
// SII Circular 43/2026. A dated reference keeps the offline budget reproducible.
export const UF_REFERENCE = Object.freeze({ pesos: 41371.05, date: '2026-11-20' });

const investmentProfiles = Object.freeze({
  camera: Object.freeze({
    label: 'Cámara de seguridad', plural: 'cámaras',
    equipment: 2900000, infrastructure: 1700000, installation: 1350000,
    integration: 650000, reserve: 600000, annualOperation: 960000,
    installationDays: 6, crewCapacity: 4, deliveryToOperation: 9, lead: 'Camila Rojas',
    unit: 'Dirección de Seguridad',
    exampleProcurementId: 'Ejemplo 01',
    exampleDelayReason: 'Ajuste de la conexión eléctrica antes de las pruebas finales.',
  }),
  fixed: Object.freeze({
    label: 'Caseta de seguridad', plural: 'casetas',
    equipment: 20000000, infrastructure: 6000000, installation: 4500000,
    integration: 1000000, reserve: 3000000, annualOperation: 36000000,
    installationDays: 18, crewCapacity: 2, deliveryToOperation: 26, lead: 'Diego Muñoz',
    unit: 'Dirección de Seguridad',
    exampleProcurementId: 'Ejemplo 02',
    exampleDelayReason: 'Adecuación de la acometida eléctrica y del enlace de monitoreo.',
  }),
  alarms: Object.freeze({
    label: 'Botón de emergencia', plural: 'botones',
    equipment: 450000, infrastructure: 360000, installation: 220000,
    integration: 150000, reserve: 120000, annualOperation: 240000,
    installationDays: 3, crewCapacity: 6, deliveryToOperation: 5, lead: 'Valentina Soto',
    unit: 'Dirección de Seguridad',
    exampleProcurementId: 'Ejemplo 03',
    exampleDelayReason: 'Reprogramación de las pruebas de comunicación con la central.',
  }),
});

const costFields = [
  ['equipment', 'Equipamiento'], ['infrastructure', 'Obras y conexión'],
  ['installation', 'Instalación'], ['integration', 'Puesta en marcha'],
  ['reserve', 'Reserva presupuestaria'],
];

const DAY_MS = 86400000;

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function shiftDate(value, days) {
  return value ? new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10) : null;
}

function daysBetween(start, end) {
  return start && end && start <= end ? (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS : null;
}

function resourceProcurement(record, profile, budget, milestones, illustrative) {
  const data = record.procurement || {};
  const modeled = illustrative && !record.procurement;
  // The existing example's delivery milestone represents the promised
  // operational delivery. Its planning dates are never municipal records.
  const promisedDelivery = calendarDate(modeled ? milestones.delivery : data.promisedDelivery);
  const operation = calendarDate(modeled ? milestones.operation : data.operation);
  const purchaseDays = budget.timeline.find(step => step.label === 'Compra y entrega').days;
  const closeValue = modeled ? shiftDate(promisedDelivery, -purchaseDays) : data.close;
  const close = calendarDate(closeValue);
  const plannedDays = daysBetween(close, promisedDelivery);
  const elapsedDays = daysBetween(close, operation);
  const coherentClose = !closeValue || (plannedDays !== null && elapsedDays !== null);
  const delayDays = promisedDelivery && operation && coherentClose
    ? (Date.parse(`${operation}T00:00:00Z`) - Date.parse(`${promisedDelivery}T00:00:00Z`)) / DAY_MS : null;
  let reasonSource = null;
  if (data.reasonSource?.url) {
    try {
      const url = new URL(data.reasonSource.url);
      if (url.protocol === 'https:') reasonSource = { url: url.href, label: data.reasonSource.label || 'Antecedente del proyecto' };
    } catch {}
  }
  const example = illustrative || data.illustrative === true;
  const reason = modeled && delayDays > 0
    ? profile.exampleDelayReason
    : typeof data.reason === 'string' && data.reason.trim() && (reasonSource || example) ? data.reason.trim() : null;
  return {
    name: data.name || (modeled ? `Implementación de ${profile.plural}` : null),
    id: data.id || (modeled ? [profile.exampleProcurementId, record.id].filter(Boolean).join(' · ') : null),
    lead: data.lead || (modeled ? profile.lead : null),
    close, promisedDelivery, operation, plannedDays, elapsedDays, delayDays,
    compliance: delayDays === null ? 'Por confirmar' : delayDays > 0 ? 'Fuera de plazo' : 'En plazo',
    reason, reasonSource: reason ? reasonSource : null,
    illustrative: example,
  };
}

export function buildInvestmentSummary(placements = []) {
  const counts = { camera: 0, fixed: 0, alarms: 0 };
  for (const item of placements) if (Object.hasOwn(counts, item?.kind)) counts[item.kind]++;
  const breakdown = costFields.map(([key, label]) => ({
    key, label,
    value: Object.entries(counts).reduce((sum, [kind, count]) => sum + investmentProfiles[kind][key] * count, 0),
  }));
  const initial = breakdown.reduce((sum, item) => sum + item.value, 0);
  const annualOperation = Object.entries(counts).reduce((sum, [kind, count]) => sum + investmentProfiles[kind].annualOperation * count, 0);
  const installationDays = Math.max(0, ...Object.entries(counts).map(([kind, count]) => {
    const profile = investmentProfiles[kind];
    return Math.ceil(count / profile.crewCapacity) * profile.installationDays;
  }));
  const quantity = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const timeline = [
    { label: 'Diseño y permisos', days: quantity ? 10 : 0 },
    { label: 'Compra y entrega', days: quantity ? 25 : 0 },
    { label: 'Instalación y pruebas', days: installationDays },
  ];
  return {
    counts, quantity, breakdown, initial, annualOperation,
    firstYear: initial + annualOperation,
    timeline, totalDays: timeline.reduce((sum, step) => sum + step.days, 0),
    lead: 'Camila Rojas', unit: 'Dirección de Seguridad',
  };
}

export function buildResourceSheet(kind, record = {}, context = {}) {
  kind = kind === 'cameras' ? 'camera' : kind;
  const profile = investmentProfiles[kind];
  if (!profile) return null;
  const budget = buildInvestmentSummary([{ kind }]);
  const monitoring = { monitoreando: 'Monitoreando', fuera_de_servicio: 'Fuera de servicio' };
  const installed = calendarDate(record.fecha_instalacion || record.installationDate);
  const illustrative = record.datos_operativos === 'simulados' || record.simulated === true;
  // Only example records have modeled milestone dates. Inventory years alone
  // do not establish when a documented municipal asset was commissioned.
  const operationDate = record.datos_operativos === 'simulados'
    ? installed
    : record.simulated && /^\d{4}$/.test(String(record.firstInventoryYear))
      ? calendarDate(`${record.firstInventoryYear}-03-15`)
      : null;
  const milestones = {
    delivery: shiftDate(operationDate, -profile.deliveryToOperation),
    operation: operationDate,
    elapsedDays: operationDate ? profile.deliveryToOperation : null
  };
  const procurement = resourceProcurement(record, profile, budget, milestones, illustrative);
  return {
    kind, id: record.id || '',
    name: record.title || record.tipo_camara || profile.label,
    address: String(record.address || record.direccion || 'Ubicación consultada').replace(' (numeración simulada)', ''),
    state: monitoring[record.monitoringStatus] || record.estado || record.status || 'En inventario',
    installed,
    milestones, procurement,
    type: record.tipo_camara || profile.label,
    activations: Number.isInteger(record.activations) ? record.activations : null,
    rank: record.rank || null,
    period: context.period || context.dateRange?.label || '',
    lead: procurement.lead || 'Por confirmar',
    unit: record.unit || (illustrative ? profile.unit : 'Por confirmar'), budget,
  };
}

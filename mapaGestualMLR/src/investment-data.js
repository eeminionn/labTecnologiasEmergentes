// Illustrative planning allowances in Chilean pesos, including VAT.
// These are demonstration assumptions, not municipal contracts or market quotes.
const investmentProfiles = Object.freeze({
  camera: Object.freeze({
    label: 'Cámara de seguridad', plural: 'cámaras',
    equipment: 2900000, infrastructure: 1700000, installation: 1350000,
    integration: 650000, reserve: 600000, annualOperation: 960000,
    installationDays: 6, crewCapacity: 4, lead: 'Camila Rojas',
    unit: 'Dirección de Seguridad',
  }),
  fixed: Object.freeze({
    label: 'Caseta de seguridad', plural: 'casetas',
    equipment: 20000000, infrastructure: 6000000, installation: 4500000,
    integration: 1000000, reserve: 3000000, annualOperation: 36000000,
    installationDays: 18, crewCapacity: 2, lead: 'Diego Muñoz',
    unit: 'Dirección de Seguridad',
  }),
  alarms: Object.freeze({
    label: 'Botón de emergencia', plural: 'botones',
    equipment: 450000, infrastructure: 360000, installation: 220000,
    integration: 150000, reserve: 120000, annualOperation: 240000,
    installationDays: 3, crewCapacity: 6, lead: 'Valentina Soto',
    unit: 'Dirección de Seguridad',
  }),
});

const costFields = [
  ['equipment', 'Equipamiento'], ['infrastructure', 'Obras y conexión'],
  ['installation', 'Instalación'], ['integration', 'Puesta en marcha'],
  ['reserve', 'Reserva presupuestaria'],
];

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
  return {
    kind, id: record.id || '',
    name: record.title || record.tipo_camara || profile.label,
    address: String(record.address || record.direccion || 'Ubicación consultada').replace(' (numeración simulada)', ''),
    state: monitoring[record.monitoringStatus] || record.estado || record.status || 'En inventario',
    installed: record.fecha_instalacion || record.installationDate || null,
    type: record.tipo_camara || profile.label,
    activations: Number.isInteger(record.activations) ? record.activations : null,
    rank: record.rank || null,
    period: context.period || context.dateRange?.label || '',
    lead: profile.lead, unit: profile.unit, budget,
  };
}

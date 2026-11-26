import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildInvestmentSummary, buildResourceSheet } from '../src/investment-data.js';
import { readSecurityResources } from '../src/analysis-catalog.js';

test('las fichas de ejemplo distinguen cierre, entrega comprometida y operación real', () => {
  const samples = [
    ['cameras', { datos_operativos: 'simulados', fecha_instalacion: '2023-03-21' }, 'CAM', 9],
    ['fixed', { simulated: true, firstInventoryYear: '2023' }, 'CAS', 26],
    ['alarms', { simulated: true, firstInventoryYear: '2023', activations: 31 }, 'BOT', 5],
  ];
  for (const [kind, record, code, delay] of samples) {
    const sheet = buildResourceSheet(kind, record);
    const procurement = sheet.procurement;
    assert.equal(procurement.illustrative, true);
    assert.match(procurement.id, new RegExp(`^LR-${code}-[A-Z0-9]{7}$`));
    assert(procurement.name && procurement.lead && procurement.reason);
    assert(procurement.close < procurement.promisedDelivery);
    assert(procurement.promisedDelivery < procurement.operation);
    assert.equal(procurement.plannedDays, 25);
    assert.equal(procurement.elapsedDays, 25 + delay);
    assert.equal(procurement.delayDays, delay);
    assert.equal(procurement.compliance, 'Fuera de plazo');
    assert.equal(procurement.reasonSource, null);
    assert.equal(sheet.milestones.delivery, procurement.promisedDelivery);
    assert.equal(sheet.milestones.operation, procurement.operation);
    assert.deepEqual(sheet.budget, buildInvestmentSummary([{ kind: kind === 'cameras' ? 'camera' : kind }]));
  }
});

test('las ubicaciones documentadas reciben un ID local y conservan sus antecedentes pendientes', () => {
  const documented = JSON.parse(readFileSync(new URL('../public/analysis/recursos-seguridad.json', import.meta.url), 'utf8'));
  for (const record of documented) {
    const sheet = buildResourceSheet(record.kind, { ...record, firstInventoryYear: '2023' });
    for (const field of ['name', 'lead', 'close', 'promisedDelivery', 'operation', 'plannedDays', 'elapsedDays', 'delayDays', 'reason']) {
      assert.equal(sheet.procurement[field], null, `${record.id}: ${field}`);
    }
    assert.match(sheet.procurement.id, /^LR-(CAS|BOT)-[A-Z0-9]{7}$/);
    assert.equal(sheet.procurement.illustrative, false);
    assert.equal(sheet.procurement.compliance, 'Por confirmar');
    assert.equal(sheet.lead, 'Por confirmar');
    assert.deepEqual(sheet.milestones, { delivery: null, operation: null, elapsedDays: null });
  }
});

test('los plazos documentados se calculan en días corridos incluso al cruzar febrero bisiesto', () => {
  const source = {
    name: 'Nombre consignado en el antecedente', id: 'Identificador del antecedente', lead: 'Responsable consignado',
    close: '2024-02-01', promisedDelivery: '2024-02-28', operation: '2024-03-01',
    reason: 'Motivo indicado en el documento',
    reasonSource: { label: 'Antecedente municipal', url: 'https://www.lareina.cl/antecedente' },
  };
  const { procurement } = buildResourceSheet('fixed', { procurement: source });
  assert.equal(procurement.name, source.name);
  assert.equal(procurement.id, source.id);
  assert.equal(procurement.lead, source.lead);
  assert.equal(procurement.plannedDays, 27);
  assert.equal(procurement.elapsedDays, 29);
  assert.equal(procurement.delayDays, 2);
  assert.equal(procurement.compliance, 'Fuera de plazo');
  assert.equal(procurement.reason, source.reason);
  assert.deepEqual(procurement.reasonSource, source.reasonSource);
});

test('entregas anticipadas y a tiempo se diferencian del atraso', () => {
  for (const [operation, expected] of [['2024-02-28', 0], ['2024-02-26', -2]]) {
    const { procurement } = buildResourceSheet('camera', { procurement: {
      close: '2024-02-01', promisedDelivery: '2024-02-28', operation,
    } });
    assert.equal(procurement.delayDays, expected);
    assert.equal(procurement.compliance, 'En plazo');
    assert.equal(procurement.reason, null);
  }
});

test('la comparación de entrega y operación funciona cuando el cierre no está publicado', () => {
  const { procurement } = buildResourceSheet('camera', { procurement: {
    promisedDelivery: '2024-02-28', operation: '2024-03-01',
  } });
  assert.equal(procurement.close, null);
  assert.equal(procurement.plannedDays, null);
  assert.equal(procurement.elapsedDays, null);
  assert.equal(procurement.delayDays, 2);
  assert.equal(procurement.compliance, 'Fuera de plazo');
});

test('el catastro conserva antecedentes existentes para una ficha de ejemplo en plazo', () => {
  const [documented] = JSON.parse(readFileSync(new URL('../public/analysis/recursos-seguridad.json', import.meta.url), 'utf8'));
  const data = {
    illustrative: true, name: 'Implementación de casetas', id: 'LR-CAS-0000001', lead: 'Encargado de seguridad',
    promisedDelivery: '2024-03-01', operation: '2024-03-01',
  };
  const [normalized] = readSecurityResources([{ ...documented, procurement: data }], () => true);
  assert.deepEqual(normalized.procurement, data);
  const { procurement } = buildResourceSheet(normalized.kind, normalized);
  assert.equal(procurement.illustrative, true);
  assert.equal(procurement.delayDays, 0);
  assert.equal(procurement.compliance, 'En plazo');
  assert.equal(procurement.name, data.name);
  assert.equal(procurement.id, data.id);
  const [withoutData] = readSecurityResources([documented], () => true);
  assert.equal(Object.hasOwn(withoutData, 'procurement'), false);
});

test('el ID local es estable para el mismo recurso y distingue recursos y categorías', () => {
  const procurementFor = (kind, record, context) => buildResourceSheet(kind, record, context).procurement;
  const resource = { id: 'cabina-simulada-01' };
  const first = procurementFor('fixed', resource).id;
  assert.equal(first, procurementFor('fixed', { ...resource, monitoringStatus: 'monitoreando' }, { period: '2024' }).id);
  assert.equal(first, procurementFor('fixed', { ...resource, procurement: { id: 'Ejemplo 02' } }).id);
  assert.notEqual(first, procurementFor('fixed', { id: 'cabina-simulada-02' }).id);
  assert.notEqual(first, procurementFor('alarms', resource).id);
  assert.equal(procurementFor('cameras', { id: 1 }).id, procurementFor('camera', { id: '1' }).id);
});

test('fechas incompletas o imposibles no producen una evaluación de cumplimiento', () => {
  for (const procurement of [
    { close: '2024-02-30', promisedDelivery: '2024-03-01', operation: '2024-03-05' },
    { close: '2024-03-06', promisedDelivery: '2024-03-01', operation: '2024-03-05' },
    { close: '2024-02-01', promisedDelivery: '2024-03-01' },
    { close: '2024-03-03', promisedDelivery: '2024-03-01', operation: '2024-03-02' },
    { close: '2024-02-30', promisedDelivery: '2024-03-01', operation: '2024-03-02' },
  ]) {
    const sheet = buildResourceSheet('alarms', { procurement });
    assert.equal(sheet.procurement.delayDays, null);
    assert.equal(sheet.procurement.compliance, 'Por confirmar');
  }
  const sample = buildResourceSheet('fixed', { simulated: true, firstInventoryYear: 'desconocido' });
  assert.equal(sample.procurement.operation, null);
  assert.equal(sample.procurement.delayDays, null);
});

test('los motivos de recursos documentados necesitan un antecedente identificable', () => {
  for (const reasonSource of [undefined, { url: 'javascript:alert(1)' }, { url: 'dato no válido' }]) {
    const sheet = buildResourceSheet('fixed', { procurement: { reason: 'Motivo sin respaldo', reasonSource } });
    assert.equal(sheet.procurement.reason, null);
    assert.equal(sheet.procurement.reasonSource, null);
  }
  assert.equal(buildResourceSheet('security'), null);
});

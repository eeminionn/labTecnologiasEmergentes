import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSelectedResources } from '../src/analysis-resource-selection.js';

test('adds registered pulsations for selected buttons and keeps zero distinct from missing data', () => {
  const [group] = summarizeSelectedResources([
    { kind: 'alarms', id: 'one', activations: 1448 },
    { kind: 'alarms', id: 'two', activations: 0 },
    { kind: 'alarms', id: 'three', activations: null },
    { kind: 'alarms', id: 'one', activations: 1448 }
  ]).groups;
  assert.deepEqual(group, { kind: 'alarms', count: 3, activations: 1448, withActivationCount: 2, statuses: [] });
  assert.equal(summarizeSelectedResources([{ kind: 'alarms', id: 'one', activations: 0 }]).groups[0].activations, 0);
  assert.equal(summarizeSelectedResources([{ kind: 'alarms', id: 'one' }]).groups[0].activations, null);
});

test('counts multiple equipment types and their statuses separately even when IDs coincide', () => {
  const result = summarizeSelectedResources([
    { kind: 'cameras', id: 'one', estado: 'Operativa' },
    { kind: 'cameras', id: 'two', estado: 'Inactiva' },
    { kind: 'fixed', id: 'one', monitoringStatus: 'monitoreando' },
    { kind: 'fixed', id: 'two' },
  ]);
  assert.equal(result.total, 4);
  assert.deepEqual(result.groups.map(group => group.statuses), [
    [{ label: 'Operativa', count: 1 }, { label: 'Mantención', count: 0 }, { label: 'Inactiva', count: 1 }],
    [{ label: 'Monitoreando', count: 1 }, { label: 'Fuera de servicio', count: 0 }, { label: 'Sin estado registrado', count: 1 }]
  ]);
});

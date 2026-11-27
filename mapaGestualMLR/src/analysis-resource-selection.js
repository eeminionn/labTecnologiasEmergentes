import { MONITORING_STATUS_LABELS } from './analysis-catalog.js';
import { CAMERA_STATUS_LABELS } from './camera-analysis-data.js';

const statusLabels = {
  cameras: Object.values(CAMERA_STATUS_LABELS),
  fixed: Object.values(MONITORING_STATUS_LABELS),
  alarms: [],
};

export function summarizeSelectedResources(records) {
  const selectedByKind = new Map();
  for (const record of records) {
    if (!record?.id || !Object.hasOwn(statusLabels, record.kind)) continue;
    if (!selectedByKind.has(record.kind)) selectedByKind.set(record.kind, new Map());
    selectedByKind.get(record.kind).set(record.id, record);
  }

  const groups = [];
  for (const [kind, selected] of selectedByKind) {
    const counts = new Map(statusLabels[kind].map(label => [label, 0]));
    let activations = null;
    let withActivationCount = 0;
    for (const record of selected.values()) {
      if (kind === 'alarms') {
        if (Number.isSafeInteger(record.activations) && record.activations >= 0) {
          activations = (activations ?? 0) + record.activations;
          withActivationCount += 1;
        }
      } else {
        const reported = kind === 'cameras' ? record.estado : MONITORING_STATUS_LABELS[record.monitoringStatus];
        const status = counts.has(reported) ? reported : 'Sin estado registrado';
        counts.set(status, (counts.get(status) ?? 0) + 1);
      }
    }
    groups.push({
      kind, count: selected.size, activations, withActivationCount,
      statuses: [...counts].map(([label, count]) => ({ label, count }))
    });
  }
  return { total: groups.reduce((total, group) => total + group.count, 0), groups };
}

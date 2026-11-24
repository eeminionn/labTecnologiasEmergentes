import './analysis-resource-markers.css';
import { MONITORING_STATUS_LABELS } from './analysis-catalog.js';

const icons = {
  camera: {
    path: 'M3 6h13v10H3zM16 9l5-3v10l-5-3M8 16v4m-4 0h8'
  },
  fixed: {
    path: 'M3 21h18M5 21V10l7-5 7 5v11M10 21v-6h4v6M12 5V2m0 1h5'
  },
  alarms: {
    path: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'
  }
};
const svgNamespace = 'http://www.w3.org/2000/svg';
const cameraDetailZoom = 18;
const markerId = record => `analysis-resource-${record.kind}-${record.id}`;

function markerIcon(kind) {
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(svgNamespace, 'path');
  path.setAttribute('d', icons[kind === 'cameras' ? 'camera' : kind].path);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

export function createResourceMarkers(container, { map, onSelect = () => {}, onHover = () => {}, onLayout = () => {} }) {
  const layer = document.createElement('div');
  layer.className = 'analysis-resource-markers';
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', 'Ubicaciones de seguridad en el mapa');
  layer.hidden = true;
  container.append(layer);

  const markers = new Map(), groups = new Map();
  let selected = null, expandedGroupId = null;
  let frame = null;
  let destroyed = false;

  function place(element, location, width, height) {
    const point = map.locationToScreen(location);
    const visible = point && point.x >= 0 && point.x < width && point.y >= 0 && point.y < height;
    element.hidden = !visible;
    if (visible) Object.assign(element.style, { left: point.x + 'px', top: point.y + 'px' });
  }

  function position() {
    if (destroyed) return;
    if (layer.parentElement !== container) container.append(layer);
    const width = container.clientWidth, height = container.clientHeight;
    for (const { element, record, groupId } of markers.values()) {
      if (groupId && groupId !== expandedGroupId) {
        element.hidden = true;
      } else {
        place(element, record, width, height);
      }
    }
    for (const group of groups.values()) {
      place(group.element, group.location, width, height);
    }
  }

  function setScope(element, record) {
    const opacity = Number.isFinite(record.opacity) ? Math.max(0, Math.min(1, record.opacity)) : 1;
    element.dataset.outsideArea = String(Boolean(record.outsideArea));
    element.style.opacity = String(opacity);
  }

  function stopMapInput(element) {
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'dblclick']) {
      element.addEventListener(type, event => event.stopPropagation());
    }
  }

  function setGroupLabel(group) {
    const count = group.entries.length;
    const expanded = expandedGroupId === group.element.id;
    group.element.setAttribute('aria-expanded', String(expanded));
    const unit = group.element.dataset.unit;
    const location = unit ? ' en la unidad vecinal ' + unit : '';
    const scope = group.entries[0].record.outsideArea ? ', fuera del área elegida' : '';
    const label = (expanded ? 'Volver a agrupar ' : 'Ver ') + count + ' cámaras' + location + scope;
    group.element.title = label;
    group.element.setAttribute('aria-label', label);
    group.count.textContent = expanded ? '−' : String(count);
    group.element.dataset.count = String(count);
  }

  async function focusGroup(group, keyboard) {
    const groupId = group.element.id;
    const previous = groups.get(expandedGroupId);
    expandedGroupId = expandedGroupId === groupId ? null : groupId;
    if (previous && previous !== group) setGroupLabel(previous);
    setGroupLabel(group);
    position();
    onLayout();
    if (!expandedGroupId) return;

    const bounds = container.getBoundingClientRect();
    const left = container.querySelector('.analysis-panel[data-side="left"]:not([hidden])')?.getBoundingClientRect().right ?? bounds.left;
    const right = container.querySelector('.analysis-panel[data-side="right"]:not([hidden])')?.getBoundingClientRect().left ?? bounds.right;
    const projected = group.entries.map(entry => map.locationToScreen(entry.record)).filter(Boolean);
    if (projected.length) {
      const xs = projected.map(point => point.x), ys = projected.map(point => point.y);
      const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
      const fit = Math.min(Math.max(32, right - left - 64) / Math.max(1, width),
        Math.max(32, bounds.height - 84) / Math.max(1, height));
      const currentZoom = map.info()?.zoom ?? 14;
      const goal = Math.min(cameraDetailZoom, Math.max(16, currentZoom + 1.5));
      const zoom = Math.min(goal, currentZoom + Math.log2(fit));
      await map.focus(group.location, zoom, { animate: false });
      if (destroyed || expandedGroupId !== groupId) return;
      const center = map.locationToScreen(group.location);
      if (center && right > left) {
        const dx = (left + right) / 2 - bounds.left - center.x, dy = bounds.height / 2 - center.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) map.pan(dx, dy);
      }
      position();
    }

    if (keyboard) {
      const first = targets().find(target => markers.get(target.id)?.groupId === groupId);
      first?.element.focus({ preventScroll: true });
    }
  }

  function addGroup(id) {
    const element = document.createElement('button');
    element.id = id;
    element.type = 'button';
    element.className = 'analysis-resource-marker analysis-resource-group';
    element.dataset.kind = 'cameras';
    const count = document.createElement('span');
    count.setAttribute('aria-hidden', 'true');
    element.append(markerIcon('cameras'), count);
    const group = { element, count, entries: [], location: null };
    stopMapInput(element);
    element.addEventListener('click', event => {
      event.stopPropagation();
      focusGroup(group, event.detail === 0 && element.matches(':focus-visible'));
    });
    layer.append(element);
    groups.set(id, group);
    return group;
  }

  function updateGroups() {
    const byArea = new Map();
    for (const entry of markers.values()) {
      entry.groupId = null;
      const { record } = entry;
      if (record.kind !== 'cameras') continue;
      const unit = record.quadrantId?.split('-')[0];
      const location = unit ?? [record.lat, record.lng].map(value => Math.floor(value / .004)).join('-');
      const key = record.outsideArea ? location + '-outside' : location;
      const entries = byArea.get(key) || [];
      entries.push(entry);
      byArea.set(key, entries);
    }

    const retained = new Set();
    for (const [key, entries] of byArea) {
      if (entries.length < 2) continue;
      const id = 'analysis-camera-group-' + key;
      const group = groups.get(id) || addGroup(id);
      group.entries = entries;
      const latitudes = entries.map(({ record }) => record.lat);
      const longitudes = entries.map(({ record }) => record.lng);
      group.location = {
        lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
        lng: (Math.min(...longitudes) + Math.max(...longitudes)) / 2
      };
      group.element.dataset.unit = entries[0].record.quadrantId?.split('-')[0] ?? '';
      setGroupLabel(group);
      setScope(group.element, entries[0].record);
      for (const entry of entries) entry.groupId = id;
      retained.add(id);
    }

    for (const [id, group] of groups) {
      if (retained.has(id)) continue;
      group.element.remove();
      groups.delete(id);
    }
    if (!retained.has(expandedGroupId)) expandedGroupId = null;
  }

  function schedulePosition() {
    if (destroyed || !markers.size || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      position();
    });
  }
  const unsubscribe = map.onPositionChange(schedulePosition);

  function addMarker(id, record) {
    const element = document.createElement('button');
    element.id = id;
    element.type = 'button';
    element.className = 'analysis-resource-marker';
    element.dataset.kind = record.kind;
    if (record.scenario) element.dataset.scenario = '';
    const badge=document.createElement('span');
    badge.className='analysis-resource-badge';badge.hidden=true;badge.setAttribute('aria-hidden','true');
    element.append(markerIcon(record.kind),badge);
    const entry = { element, badge, record, groupId: null };
    stopMapInput(element);
    element.addEventListener('click', event => {
      event.stopPropagation();
      onSelect(entry.record, event);
    });
    element.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') onHover(entry.record, event);
    });
    element.addEventListener('focus', event => onHover(entry.record, event));
    layer.append(element);
    markers.set(id, entry);
    return entry;
  }

  function render(points) {
    if (destroyed) return;
    const present = new Set();
    for (const record of points) {
      if (record.kind !== 'cameras' && !Object.hasOwn(icons, record.kind)) continue;
      const id = markerId(record);
      present.add(id);
      const entry = markers.get(id) || addMarker(id, record);
      entry.record = record;
      const count = record.activations;
      const usage = Number.isInteger(count) ? ` · ${count} ${count === 1 ? 'pulsación' : 'pulsaciones'} de referencia` : '';
      const monitoring = MONITORING_STATUS_LABELS[record.monitoringStatus];
      const detail = record.rank ? ` · Puesto ${record.rank}` : monitoring ? ` · ${monitoring}` : '';
      const scope = record.outsideArea ? ' · Fuera del área seleccionada' : '';
      entry.element.setAttribute('aria-label', `${record.title} · ${record.address}${usage}${detail}${scope}`);
      entry.badge.textContent = monitoring ? record.monitoringStatus === 'monitoreando' ? '✓' : '–' : '';
      entry.badge.hidden = !entry.badge.textContent;
      entry.element.dataset.selected = String(id === selected);
      setScope(entry.element, record);
    }
    for (const [id, { element }] of markers) {
      if (present.has(id)) continue;
      element.remove();
      markers.delete(id);
    }
    updateGroups();
    layer.hidden = !markers.size;
    position();
    onLayout();
  }

  function labelObstacles() {
    const individuals = [...markers.values()].filter(entry => !entry.groupId || entry.groupId === expandedGroupId);
    return [
      ...individuals.map(entry => ({ location: entry.record, halfWidth: 15, halfHeight: 15 })),
      ...[...groups.values()].map(group => ({ location: group.location, halfWidth: 23, halfHeight: 15 }))
    ];
  }

  function targets() {
    if (destroyed || layer.hidden) return [];
    const outer = container.getBoundingClientRect();
    const result = [];
    for (const [id, { element }] of [...markers, ...groups]) {
      if (element.hidden || !element.getClientRects().length) continue;
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      if (!element.contains(document.elementFromPoint(x,y))) continue;
      result.push({
        id, element, x: x - outer.left, y: y - outer.top,
        width: rect.width, height: rect.height, priority: 18
      });
    }
    return result;
  }

  function recordFor(element) {
    const button = element?.closest?.('.analysis-resource-marker');
    return button && layer.contains(button) ? markers.get(button.id)?.record ?? null : null;
  }

  function select(record) {
    const next = record ? markerId(record) : null;
    if (selected === next) return;
    const previousMarker = markers.get(selected);
    if (previousMarker) previousMarker.element.dataset.selected = 'false';
    selected = next;
    const selectedMarker = markers.get(next);
    if (selectedMarker) selectedMarker.element.dataset.selected = 'true';
    position();
  }

  return {
    render, targets, position, select, recordFor, labelObstacles,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe();
      layer.remove();
      markers.clear();
      groups.clear();
    }
  };
}

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
const markerOffsets = [[0,0],[42,0],[-42,0],[0,42],[0,-42],[38,38],[-38,38],[38,-38],[-38,-38]];
const markerRadius = 16;
const cameraGroupDistance = 42;
const cameraGroupZoom = 17;
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

export function createResourceMarkers(container, { map, onSelect = () => {}, onHover = () => {} }) {
  const layer = document.createElement('div');
  layer.className = 'analysis-resource-markers';
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', 'Ubicaciones de seguridad en el mapa');
  layer.hidden = true;
  container.append(layer);

  const markers = new Map(), groups = new Map();
  let selected = null, expandedGroup = null;
  let frame = null;
  let destroyed = false;

  function position() {
    if (destroyed) return;
    if (layer.parentElement !== container) container.append(layer);
    const width = container.clientWidth, height = container.clientHeight;
    const zoom = map.info()?.zoom ?? 14;
    if (expandedGroup && zoom < expandedGroup.zoom - .01) expandedGroup = null;
    const toPlace = [], cameraGroups = [];
    for (const [id, entry] of markers) {
      const { element, stem, record } = entry;
      const point = map.locationToScreen(record);
      const visible = point && point.x >= 0 && point.x < width && point.y >= 0 && point.y < height;
      element.hidden = !visible;
      stem.hidden = true;
      if (!visible) continue;
      if (record.kind !== 'cameras' || zoom >= cameraGroupZoom || id === selected || expandedGroup?.ids.has(id)) {
        toPlace.push({ ...entry, point, radius: record.kind === 'cameras' ? 13 : markerRadius });
        continue;
      }
      const group = cameraGroups.find(candidate => Boolean(candidate.record.outsideArea) === Boolean(record.outsideArea)
        && Math.hypot(candidate.point.x - point.x, candidate.point.y - point.y) < cameraGroupDistance);
      if (group) group.entries.push({ id, entry, point });
      else cameraGroups.push({ record, point, entries: [{ id, entry, point }] });
    }

    const present = new Set();
    for (const { point, entries, record } of cameraGroups) {
      const first = entries[0];
      if (entries.length === 1) {
        toPlace.push({ ...first.entry, point, radius: 13 });
        continue;
      }
      const id = `analysis-camera-group-${first.entry.record.id}`;
      const group = groups.get(id) || addGroup(id);
      present.add(id);
      group.entries = entries;
      const count = String(entries.length);
      if (group.element.dataset.count !== count) {
        group.element.dataset.count = count;
        group.element.textContent = count;
      }
      const outside = Boolean(record.outsideArea);
      const label = `${entries.length} cámaras${outside ? ' fuera del área seleccionada' : ''} · Acercar al grupo`;
      group.element.setAttribute('aria-label', label);
      group.element.title = label;
      setScope(group.element, group.stem, record);
      for (const item of entries) item.entry.element.hidden = true;
      const centroid = {
        x: entries.reduce((total, item) => total + item.point.x, 0) / entries.length,
        y: entries.reduce((total, item) => total + item.point.y, 0) / entries.length
      };
      toPlace.push({ ...group, point: centroid, record, radius: markerRadius });
    }
    for (const [id, { element, stem }] of groups) {
      if (present.has(id)) continue;
      element.remove();
      stem.remove();
      groups.delete(id);
    }

    // Keep markers in scope on their geographic positions whenever possible.
    // Stems make displacement visible when a close neighbour needs room.
    toPlace.sort((a, b) => Number(b.element.id === selected) - Number(a.element.id === selected)
      || Number(Boolean(a.record.outsideArea)) - Number(Boolean(b.record.outsideArea))
      || Number(a.record.kind === 'cameras') - Number(b.record.kind === 'cameras'));
    const placed = [];
    for (const { element, stem, point, radius } of toPlace) {
      const [dx, dy] = markerOffsets.find(([dx, dy], index) => {
        const x = point.x + dx, y = point.y + dy;
        return (index === 0 || x >= radius && x <= width - radius && y >= radius && y <= height - radius)
          && placed.every(other => Math.max(Math.abs(other.x - x), Math.abs(other.y - y)) >= other.radius + radius + 3);
      }) ?? markerOffsets[0];
      const x = point.x + dx, y = point.y + dy;
      placed.push({ x, y, radius });
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      stem.hidden = !dx && !dy;
      if (!stem.hidden) Object.assign(stem.style, {
        left: `${point.x}px`, top: `${point.y}px`, width: `${Math.hypot(dx, dy)}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)`
      });
    }
  }

  function setScope(element, stem, record) {
    const opacity = Number.isFinite(record.opacity) ? Math.max(0, Math.min(1, record.opacity)) : 1;
    element.dataset.outsideArea = stem.dataset.outsideArea = String(Boolean(record.outsideArea));
    element.style.opacity = stem.style.opacity = String(opacity);
  }

  function stopMapInput(element) {
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'dblclick']) {
      element.addEventListener(type, event => event.stopPropagation());
    }
  }

  async function focusGroup(group, keyboard) {
    const entries = group.entries;
    const records = entries.map(({ entry }) => entry.record);
    const latitudes = records.map(record => record.lat), longitudes = records.map(record => record.lng);
    const location = {
      lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      lng: (Math.min(...longitudes) + Math.max(...longitudes)) / 2
    };
    // Frame all members in the unobstructed portion of the map, including
    // narrow comparison views. Open this group even if its points are close.
    const bounds = container.getBoundingClientRect();
    const left = container.querySelector('.analysis-panel[data-side="left"]:not([hidden])')?.getBoundingClientRect().right ?? bounds.left;
    const right = container.querySelector('.analysis-panel[data-side="right"]:not([hidden])')?.getBoundingClientRect().left ?? bounds.right;
    const xs = entries.map(({ point }) => point.x), ys = entries.map(({ point }) => point.y);
    const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
    const fit = Math.min(Math.max(32, right - left - 72) / Math.max(1, width), Math.max(32, bounds.height - 96) / Math.max(1, height));
    const currentZoom = map.info()?.zoom ?? 14;
    const goal = Math.max(16, currentZoom + 1.5);
    const zoom = Math.min(cameraGroupZoom, Math.max(currentZoom + .25, Math.min(goal, currentZoom + Math.log2(fit))));
    await map.focus(location, zoom, { animate: false });
    if (destroyed) return;
    expandedGroup = { ids: new Set(entries.map(item => item.id)), zoom: map.info()?.zoom ?? zoom };
    const center = map.locationToScreen(location);
    if (center && right > left) {
      const dx = (left + right) / 2 - bounds.left - center.x, dy = bounds.height / 2 - center.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) map.pan(dx, dy);
    }
    position();
    if (keyboard) {
      const first = targets().find(target => expandedGroup.ids.has(target.id));
      first?.element.focus({ preventScroll: true });
    }
  }

  function addGroup(id) {
    const element = document.createElement('button'), stem = document.createElement('span');
    element.id = id;
    element.type = 'button';
    element.className = 'analysis-resource-marker analysis-resource-group';
    element.dataset.kind = 'cameras';
    stem.className = 'analysis-resource-stem';
    stem.hidden = true;
    stem.setAttribute('aria-hidden', 'true');
    const group = { element, stem, entries: [] };
    stopMapInput(element);
    element.addEventListener('click', event => {
      event.stopPropagation();
      focusGroup(group, event.detail === 0 && element.matches(':focus-visible'));
    });
    layer.append(stem, element);
    groups.set(id, group);
    return group;
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
    const stem=document.createElement('span');
    stem.className='analysis-resource-stem';stem.hidden=true;stem.setAttribute('aria-hidden','true');
    const entry = { element, stem, badge, record };
    stopMapInput(element);
    element.addEventListener('click', event => {
      event.stopPropagation();
      onSelect(entry.record, event);
    });
    element.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') onHover(entry.record, event);
    });
    element.addEventListener('focus', event => onHover(entry.record, event));
    layer.append(stem,element);
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
      entry.badge.textContent = record.rank ?? (monitoring ? record.monitoringStatus === 'monitoreando' ? '✓' : '–' : '');
      entry.badge.hidden = !entry.badge.textContent;
      entry.element.dataset.selected = String(id === selected);
      setScope(entry.element, entry.stem, record);
    }
    for (const [id, { element, stem }] of markers) {
      if (present.has(id)) continue;
      element.remove();stem.remove();
      markers.delete(id);
    }
    if (!markers.size) expandedGroup = null;
    layer.hidden = !markers.size;
    position();
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
    render, targets, position, select, recordFor,
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

const icons = {
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

function markerIcon(kind) {
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(svgNamespace, 'path');
  path.setAttribute('d', icons[kind].path);
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

  const markers = new Map();
  let frame = null;
  let destroyed = false;

  function position() {
    if (destroyed) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const placed = [];
    for (const { element, stem, record } of markers.values()) {
      const point = map.locationToScreen(record);
      const visible = point && point.x >= 0 && point.x < width && point.y >= 0 && point.y < height;
      element.hidden = !visible;
      stem.hidden = true;
      if (!visible) continue;
      const offset = markerOffsets.find(([dx,dy],index) => {
        const x=point.x+dx,y=point.y+dy;
        return (index===0||x>=markerRadius&&x<=width-markerRadius&&y>=markerRadius&&y<=height-markerRadius)
          && placed.every(other=>Math.max(Math.abs(other.x-x),Math.abs(other.y-y))>markerRadius*2);
      }) ?? markerOffsets[0];
      const [dx,dy]=offset,x=point.x+dx,y=point.y+dy;
      placed.push({x,y});
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      if(dx||dy){
        stem.hidden=false;
        Object.assign(stem.style,{left:`${point.x}px`,top:`${point.y}px`,width:`${Math.hypot(dx,dy)}px`,transform:`rotate(${Math.atan2(dy,dx)}rad)`});
      }
    }
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
    element.append(markerIcon(record.kind));
    const stem=document.createElement('span');
    stem.className='analysis-resource-stem';stem.hidden=true;stem.setAttribute('aria-hidden','true');
    const entry = { element, stem, record };
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'dblclick']) {
      element.addEventListener(type, event => event.stopPropagation());
    }
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
      if (!Object.hasOwn(icons, record.kind)) continue;
      const id = `analysis-resource-${record.kind}-${record.id}`;
      present.add(id);
      const entry = markers.get(id) || addMarker(id, record);
      entry.record = record;
      const count = record.activations;
      const usage = Number.isInteger(count) ? ` · ${count} ${count === 1 ? 'pulsación' : 'pulsaciones'} de referencia` : '';
      entry.element.setAttribute('aria-label', `${record.title} · ${record.address}${usage}`);
      const opacity = Number.isFinite(record.opacity) ? Math.max(0, Math.min(1, record.opacity)) : 1;
      entry.element.style.opacity = String(opacity);
      entry.stem.style.opacity = String(opacity);
    }
    for (const [id, { element, stem }] of markers) {
      if (present.has(id)) continue;
      element.remove();stem.remove();
      markers.delete(id);
    }
    layer.hidden = !markers.size;
    position();
  }

  function targets() {
    if (destroyed || layer.hidden) return [];
    const outer = container.getBoundingClientRect();
    const result = [];
    for (const [id, { element }] of markers) {
      if (element.hidden || !element.getClientRects().length) continue;
      const rect = element.getBoundingClientRect();
      result.push({
        id, element, x: rect.left + rect.width / 2 - outer.left,
        y: rect.top + rect.height / 2 - outer.top,
        width: rect.width, height: rect.height, priority: 18
      });
    }
    return result;
  }

  return {
    render, targets, position,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe();
      layer.remove();
      markers.clear();
    }
  };
}

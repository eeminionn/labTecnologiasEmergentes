import { STREET_DETAIL_ZOOM, UNIT_ROBBERY_COLORS } from './analysis-quadrants.js';
import { pointInsideBoundary, projectSecurityPoint } from './analysis-data.js';
import './analysis-quadrant-selector.css';

const svgNamespace = 'http://www.w3.org/2000/svg';
let instanceNumber = 0;
const robberyPalette = UNIT_ROBBERY_COLORS.map(color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)));

function robberyColor(ratio) {
  const position = Math.max(0, Math.min(1, ratio)) * (robberyPalette.length - 1);
  const low = Math.floor(position), high = Math.min(robberyPalette.length - 1, low + 1), blend = position - low;
  const channels = robberyPalette[low].map((channel, index) => Math.round(channel + (robberyPalette[high][index] - channel) * blend));
  return `rgb(${channels.join(', ')})`;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function attribute(element, name, value) {
  const text = String(value);
  if (element.getAttribute(name) !== text) element.setAttribute(name, text);
}

function display(element, visible) {
  const value = visible ? '' : 'none';
  if (element.style.display !== value) element.style.display = value;
}

function geographicBounds(polygons) {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const polygon of polygons) for (const ring of polygon) for (const [lng, lat] of ring) {
    west = Math.min(west, lng); east = Math.max(east, lng);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return Number.isFinite(west) ? { west, east, south, north } : null;
}

function projectedPath(polygons, project) {
  const paths = [];
  for (const polygon of polygons) for (const ring of polygon) {
    const points = ring.map(([lng, lat]) => project({ lng, lat }));
    if (!points.length || points.some(point => !point)) return null;
    paths.push(points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join('') + 'Z');
  }
  return paths.join('');
}

function segmentDistanceSquared([x, y], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const along = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
  return (x - ax - along * dx) ** 2 + (y - ay - along * dy) ** 2;
}

function labelCandidates(unit, polygons, box, commune) {
  if (!box) return [];
  const geometry = { type: 'MultiPolygon', coordinates: polygons };
  const preferred = unit.labelPoint ?? { lng: (box.west + box.east) / 2, lat: (box.south + box.north) / 2 };
  const preferredWorld = projectSecurityPoint(preferred.lng, preferred.lat);
  const rings = [...polygons, ...commune].flatMap(polygon => polygon.map(ring => ring.map(([lng, lat]) => projectSecurityPoint(lng, lat))));
  const communeGeometry = { type: 'MultiPolygon', coordinates: commune };
  const points = [preferred];
  for (let row = 0; row < 13; row++) for (let column = 0; column < 13; column++) {
    points.push({ lng: box.west + (box.east - box.west) * (column + .5) / 13, lat: box.south + (box.north - box.south) * (row + .5) / 13 });
  }
  return points.flatMap(location => {
    if (!pointInsideBoundary(location.lng, location.lat, geometry) || !pointInsideBoundary(location.lng, location.lat, communeGeometry)) return [];
    const world = projectSecurityPoint(location.lng, location.lat);
    let clearanceSquared = Infinity;
    for (const ring of rings) for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      clearanceSquared = Math.min(clearanceSquared, segmentDistanceSquared(world, ring[previous], ring[index]));
    }
    return [{ ...location, clearance: Math.sqrt(clearanceSquared), distance: Math.hypot(world[0] - preferredWorld[0], world[1] - preferredWorld[1]) }];
  }).sort((left, right) => left.distance - right.distance || right.clearance - left.clearance);
}

/**
 * Passive territorial overlay. The map and the accessible panel own selection
 * events, so neither its polygons nor its number badges intercept map input.
 */
export function createAnalysisQuadrantSelector(container, { map, quadrants: definition } = {}) {
  if (!container || typeof map?.locationToScreen !== 'function') throw new Error('El selector necesita el contenedor y la proyección del mapa.');
  if (!Array.isArray(definition?.quadrants) || !Array.isArray(definition.units) || !Array.isArray(definition.boundaryPolygons)) {
    throw new Error('El selector necesita las unidades vecinales, sus subdivisiones y el límite comunal.');
  }
  const options = definition.quadrants;
  const units = definition.units;
  const identifiers = new Set(options.map(option => option.id));
  const bounds = geographicBounds(definition.boundaryPolygons);
  const prefix = `analysis-quadrants-${++instanceNumber}`;
  const layer = document.createElement('div');
  layer.className = 'analysis-quadrant-selector';
  layer.hidden = true;
  const svg = svgElement('svg', {
    role: 'img', focusable: 'false',
    'aria-labelledby': `${prefix}-title`, 'aria-describedby': `${prefix}-description ${prefix}-robberies`,
    preserveAspectRatio: 'none'
  });
  const title = svgElement('title', { id: `${prefix}-title` });
  title.textContent = 'Unidades vecinales y subdivisiones de La Reina';
  const description = svgElement('desc', { id: `${prefix}-description` });
  const robberyDescription = svgElement('desc', { id: `${prefix}-robberies` });
  const definitions = svgElement('defs');
  const communeClip = svgElement('clipPath', { id: `${prefix}-commune`, clipPathUnits: 'userSpaceOnUse' });
  const communeClipPath = svgElement('path', { 'clip-rule': 'evenodd', 'fill-rule': 'evenodd' });
  communeClip.append(communeClipPath);
  definitions.append(communeClip);
  const surface = svgElement('g', { 'clip-path': `url(#${prefix}-commune)` });
  // One compound stroke per level keeps shared edges from becoming darker
  // through repeated transparent strokes on adjacent geographic polygons.
  const subdivisionUnderlay = svgElement('path', { class: 'analysis-subdivision-underlay' });
  const subdivisions = svgElement('path', { class: 'analysis-subdivision-boundaries' });
  const parentUnderlay = svgElement('path', { class: 'analysis-unit-underlay' });
  const parentBoundaries = svgElement('path', { class: 'analysis-unit-boundaries' });
  const communeUnderlay = svgElement('path', { class: 'analysis-commune-underlay' });
  const communeBoundary = svgElement('path', { class: 'analysis-commune-boundary' });
  const highlights = svgElement('g', { class: 'analysis-quadrant-highlights' });
  surface.append(subdivisionUnderlay, subdivisions, parentUnderlay, parentBoundaries, communeUnderlay, communeBoundary, highlights);
  const labels = svgElement('g', { class: 'analysis-unit-labels', 'aria-hidden': 'true' });
  const entries = new Map();
  const parents = new Map();

  for (const option of options) {
    const group = svgElement('g', { class: 'analysis-quadrant', 'data-quadrant': option.id });
    const fill = svgElement('path', { class: 'analysis-quadrant-fill', 'fill-rule': 'evenodd' });
    const underlay = svgElement('path', { class: 'analysis-quadrant-underlay' });
    const edge = svgElement('path', { class: 'analysis-quadrant-edge' });
    group.append(fill, underlay, edge);
    highlights.append(group);
    entries.set(option.id, { option, polygons: option.polygons, group, fill, underlay, edge });
  }
  for (const unit of units) {
    const polygons = unit.polygons, label = svgElement('g', { class: 'analysis-unit-label', 'data-unit': unit.id });
    const textValue = String(unit.label ?? unit.id);
    const halo = svgElement('circle', { class: 'analysis-unit-number-halo', r: '11.5' });
    const badge = svgElement('circle', { class: 'analysis-unit-number-border', r: '11.5' });
    const selectionDot = svgElement('circle', { class: 'analysis-unit-selection-dot', cy: '7', r: '1.35' });
    const text = svgElement('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    text.textContent = textValue;
    label.append(halo, badge, selectionDot, text);
    labels.append(label);
    const box = geographicBounds(polygons);
    const candidates = labelCandidates(unit, polygons, box, definition.boundaryPolygons);
    parents.set(String(unit.id), {
      unit, polygons, bounds: box, label, halo, badge, selectionDot, text, candidates,
      clearance: Math.max(0, ...candidates.map(candidate => candidate.clearance)),
      children: options.filter(option => String(option.unit) === String(unit.id)).map(option => option.id)
    });
  }

  svg.append(title, description, robberyDescription, definitions, surface, labels);
  layer.append(svg);
  container.append(layer);
  let selection = 'all', selected = new Set(), preview = null;
  let unitRobberies = null, unitRobberyMax = null, robberiesKey = 'none';
  let visible = false, destroyed = false, frame = null, projectionSignature = null;

  function position() {
    if (destroyed || !visible) return;
    // Position subscriptions survive a late provider fallback that replaces the
    // map DOM. Restore this layer without requiring a map-adapter special case.
    if (layer.parentElement !== container) container.append(layer);
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height || !bounds) { svg.style.visibility = 'hidden'; projectionSignature = null; return; }
    const cache = new Map();
    const project = location => {
      const key = `${location.lng},${location.lat}`;
      if (!cache.has(key)) {
        const point = map.locationToScreen(location);
        cache.set(key, point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null);
      }
      return cache.get(key);
    };
    const anchors = [
      { lng: bounds.west, lat: bounds.south },
      { lng: bounds.east, lat: bounds.north },
      { lng: bounds.east, lat: bounds.south }
    ].map(project);
    if (anchors.some(point => !point)) { svg.style.visibility = 'hidden'; projectionSignature = null; return; }
    const zoom = map.info?.()?.zoom;
    const atStreet = Number.isFinite(zoom) && zoom >= STREET_DETAIL_ZOOM;
    const signature = `${width},${height},${atStreet},${anchors.map(point => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(',')}`;
    if (signature === projectionSignature) return;
    const boundaryPath = projectedPath(definition.boundaryPolygons, project);
    if (!boundaryPath) { svg.style.visibility = 'hidden'; projectionSignature = null; return; }
    attribute(svg, 'viewBox', `0 0 ${width} ${height}`);
    attribute(layer, 'data-scale', atStreet ? 'street' : 'overview');
    svg.style.visibility = '';
    attribute(communeClipPath, 'd', boundaryPath);
    attribute(communeUnderlay, 'd', boundaryPath);
    attribute(communeBoundary, 'd', boundaryPath);
    const subdivisionPaths = [];
    for (const entry of entries.values()) {
      const path = projectedPath(entry.polygons, project) ?? '';
      subdivisionPaths.push(path);
      for (const element of [entry.fill, entry.underlay, entry.edge]) attribute(element, 'd', path);
    }
    const subdivisionPath = subdivisionPaths.join('');
    attribute(subdivisionUnderlay, 'd', subdivisionPath);
    attribute(subdivisions, 'd', subdivisionPath);
    const parentPaths = [...parents.values()].map(parent => projectedPath(parent.polygons, project) ?? '').join('');
    attribute(parentUnderlay, 'd', parentPaths);
    attribute(parentBoundaries, 'd', parentPaths);
    display(labels, !atStreet);
    if (!atStreet) {
      const placed = [];
      const [westWorld, southWorld] = projectSecurityPoint(bounds.west, bounds.south);
      const [eastWorld, northWorld] = projectSecurityPoint(bounds.east, bounds.north);
      const pixelsPerMetre = Math.min(
        Math.hypot(anchors[2].x - anchors[0].x, anchors[2].y - anchors[0].y) / (eastWorld - westWorld),
        Math.hypot(anchors[1].x - anchors[2].x, anchors[1].y - anchors[2].y) / (northWorld - southWorld)
      );
      // Give the narrow units their interior space first. Larger units can use
      // an alternate interior point when a nearby number would overlap.
      for (const parent of [...parents.values()].sort((left, right) => left.clearance - right.clearance)) {
        let placement = null;
        for (const radius of [11.5, 9.5]) {
          for (const candidate of parent.candidates) {
            if (candidate.clearance * pixelsPerMetre < radius + 3.5) continue;
            const point = project(candidate);
            if (!point || point.x < radius + 4 || point.x > width - radius - 4 || point.y < radius + 4 || point.y > height - radius - 4) continue;
            if (placed.some(other => Math.hypot(point.x - other.x, point.y - other.y) < radius + other.radius + 7)) continue;
            placement = { ...point, radius }; break;
          }
          if (placement) break;
        }
        display(parent.label, Boolean(placement));
        if (!placement) continue;
        attribute(parent.label, 'transform', `translate(${placement.x.toFixed(2)},${placement.y.toFixed(2)})`);
        attribute(parent.label, 'data-compact', placement.radius < 11);
        attribute(parent.badge, 'r', placement.radius);
        attribute(parent.halo, 'r', placement.radius);
        attribute(parent.selectionDot, 'cy', placement.radius - 4.5);
        placed.push(placement);
      }
    }
    projectionSignature = signature;
  }

  function schedulePosition() {
    if (destroyed || !visible || frame !== null) return;
    frame = requestAnimationFrame(() => { frame = null; position(); });
  }

  function paintState() {
    layer.hidden = !visible;
    attribute(layer, 'data-all', selection === 'all');
    for (const [id, entry] of entries) {
      attribute(entry.group, 'data-selected', selected.has(id));
      attribute(entry.group, 'data-preview', preview === id);
    }
    const observedMaximum = unitRobberies ? Math.max(0, ...Object.values(unitRobberies).filter(Number.isFinite)) : 0;
    const scaleMaximum = unitRobberyMax ?? observedMaximum;
    for (const [id, parent] of parents) {
      const count = parent.children.filter(id => selected.has(id)).length;
      const state = count === 0 ? 'neutral' : count === parent.children.length ? 'full' : 'partial';
      attribute(parent.label, 'data-selected', count > 0);
      attribute(parent.label, 'data-selection-state', state);
      attribute(parent.label, 'data-preview', parent.children.includes(preview));
      const robberies = unitRobberies?.[id] ?? null;
      const available = robberies !== null;
      const ratio = available ? scaleMaximum > 0 ? robberies / scaleMaximum : robberies > 0 ? 1 : 0 : null;
      const color = available ? robberyColor(ratio) : 'var(--analysis-unit-ink)';
      attribute(parent.label, 'data-robberies', available ? robberies : '');
      attribute(parent.label, 'data-robberies-available', available);
      if (parent.label.style.getPropertyValue('--unit-robbery-color') !== color) parent.label.style.setProperty('--unit-robbery-color', color);
    }
    // Draw selected subdivisions last to keep their shared edges readable.
    const ordered = [...entries.entries()].sort(([left], [right]) =>
      Number(selected.has(left)) * 2 + Number(preview === left) - Number(selected.has(right)) * 2 - Number(preview === right));
    ordered.forEach(([, entry], index) => {
      if (highlights.children[index] !== entry.group) highlights.insertBefore(entry.group, highlights.children[index] ?? null);
    });
    const hierarchy = 'Las líneas continuas oscuras con halo blanco delimitan las unidades vecinales. Las líneas discontinuas más finas separan sus subdivisiones. Los círculos numerados identifican las unidades vecinales. Su borde representa la cantidad de robos y es independiente de la selección: un punto interior indica selección parcial y el interior oscuro indica selección completa. Los números se ocultan al acercarse a las calles. La selección territorial se indica con un contorno más grueso, sin modificar los colores del mapa de calor.';
    const text = selection === 'all'
      ? `Se muestran todas las unidades vecinales y sus subdivisiones. ${hierarchy}`
      : `Subdivisiones seleccionadas: ${[...selected].join(', ')}. ${hierarchy} La selección se cambia desde los controles del análisis o sobre el mapa.`;
    if (description.textContent !== text) description.textContent = text;
    const countsIntro = scaleMaximum === 0
      ? 'Todas las unidades registran cero robos con estos filtros.'
      : `El borde va de verde para cero robos a rojo para ${scaleMaximum.toLocaleString('es-CL')} robos, el máximo de referencia.`;
    const countsText = unitRobberies === null
      ? 'Los bordes de los números son neutros porque Robos no está visible.'
      : `${countsIntro} Los conteos corresponden a los filtros temporales y de tipo, independientemente de la selección territorial. ${[...parents.keys()].map(id => `Unidad ${id}: ${unitRobberies[id] === null ? 'sin conteo disponible' : `${unitRobberies[id].toLocaleString('es-CL')} robos`}`).join('. ')}.`;
    if (robberyDescription.textContent !== countsText) robberyDescription.textContent = countsText;
    if (!visible && frame !== null) { cancelAnimationFrame(frame); frame = null; }
  }

  const subscribe = map.onPositionChange ?? map.onViewChange;
  const unsubscribe = typeof subscribe === 'function' ? subscribe.call(map, schedulePosition) : () => {};
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedulePosition) : null;
  resizeObserver?.observe(container);
  paintState();

  function update(state = {}) {
    if (destroyed) return;
    let changed = false, becameVisible = false;
    if (Object.hasOwn(state, 'unitRobberies')) {
      const next = state.unitRobberies && typeof state.unitRobberies === 'object'
        ? Object.fromEntries([...parents.keys()].map(id => {
          const value = state.unitRobberies[id];
          return [id, Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null];
        })) : null;
      const key = next === null ? 'none' : [...parents.keys()].map(id => `${id}:${next[id]}`).join(',');
      if (key !== robberiesKey) { unitRobberies = next; robberiesKey = key; changed = true; }
    }
    if (Object.hasOwn(state, 'unitRobberyMax')) {
      const maximum = Number.isFinite(state.unitRobberyMax) && state.unitRobberyMax >= 0 ? state.unitRobberyMax : null;
      if (maximum !== unitRobberyMax) { unitRobberyMax = maximum; changed = true; }
    }
    if (Object.hasOwn(state, 'selected')) {
      const values = state.selected instanceof Set ? [...state.selected] : Array.isArray(state.selected) ? state.selected : [state.selected];
      const valid = options.filter(option => values.includes(option.id)).map(option => option.id);
      const nextSelection = values.includes('all') || !valid.length ? 'all' : valid;
      const previousKey = selection === 'all' ? 'all' : selection.join(',');
      const nextKey = nextSelection === 'all' ? 'all' : nextSelection.join(',');
      if (previousKey !== nextKey) {
        selection = nextSelection; selected = new Set(selection === 'all' ? [] : selection); changed = true;
      }
    }
    if (Object.hasOwn(state, 'preview')) {
      const id = typeof state.preview === 'object' ? state.preview?.id : state.preview;
      const nextPreview = identifiers.has(id) ? id : null;
      if (preview !== nextPreview) { preview = nextPreview; changed = true; }
    }
    if (Object.hasOwn(state, 'visible') && visible !== Boolean(state.visible)) {
      visible = Boolean(state.visible); becameVisible = visible; changed = true;
    }
    if (changed) paintState();
    if (becameVisible) schedulePosition();
  }

  return {
    update,
    setVisible(value) { update({ visible: value }); },
    info() { return { visible, selected: selection === 'all' ? 'all' : [...selected], preview, unitRobberies: unitRobberies && { ...unitRobberies }, unitRobberyMax }; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe?.(); resizeObserver?.disconnect(); layer.remove();
    }
  };
}

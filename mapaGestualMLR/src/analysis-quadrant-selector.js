import { STREET_DETAIL_ZOOM } from './analysis-quadrants.js';
import './analysis-quadrant-selector.css';

const svgNamespace = 'http://www.w3.org/2000/svg';
let instanceNumber = 0;

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
    'aria-labelledby': `${prefix}-title`, 'aria-describedby': `${prefix}-description`,
    preserveAspectRatio: 'none'
  });
  const title = svgElement('title', { id: `${prefix}-title` });
  title.textContent = 'Unidades vecinales y subdivisiones de La Reina';
  const description = svgElement('desc', { id: `${prefix}-description` });
  const definitions = svgElement('defs');
  const communeClip = svgElement('clipPath', { id: `${prefix}-commune`, clipPathUnits: 'userSpaceOnUse' });
  const communeClipPath = svgElement('path', { 'clip-rule': 'evenodd', 'fill-rule': 'evenodd' });
  communeClip.append(communeClipPath);
  definitions.append(communeClip);
  const surface = svgElement('g', { 'clip-path': `url(#${prefix}-commune)` });
  // One compound stroke per level keeps shared edges from becoming darker
  // through repeated transparent strokes on adjacent geographic polygons.
  const subdivisions = svgElement('path', { class: 'analysis-subdivision-boundaries' });
  const parentUnderlay = svgElement('path', { class: 'analysis-unit-underlay' });
  const parentBoundaries = svgElement('path', { class: 'analysis-unit-boundaries' });
  const communeBoundary = svgElement('path', { class: 'analysis-commune-boundary' });
  const highlights = svgElement('g', { class: 'analysis-quadrant-highlights' });
  surface.append(subdivisions, parentUnderlay, parentBoundaries, communeBoundary, highlights);
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
    const badgeWidth = Math.max(22, textValue.length * 6 + 10);
    const badge = svgElement('rect', { x: -badgeWidth / 2, y: '-10', width: badgeWidth, height: '20', rx: '6' });
    const text = svgElement('text', { 'text-anchor': 'middle', y: '3.5' });
    text.textContent = textValue;
    label.append(badge, text);
    labels.append(label);
    parents.set(String(unit.id), {
      unit, polygons, bounds: geographicBounds(polygons), label, badgeWidth,
      children: options.filter(option => String(option.unit) === String(unit.id)).map(option => option.id)
    });
  }

  svg.append(title, description, definitions, surface, labels);
  layer.append(svg);
  container.append(layer);
  let selection = 'all', selected = new Set(), preview = null;
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
    attribute(communeBoundary, 'd', boundaryPath);
    const subdivisionPaths = [];
    for (const entry of entries.values()) {
      const path = projectedPath(entry.polygons, project) ?? '';
      subdivisionPaths.push(path);
      for (const element of [entry.fill, entry.underlay, entry.edge]) attribute(element, 'd', path);
    }
    attribute(subdivisions, 'd', subdivisionPaths.join(''));
    const parentPaths = [...parents.values()].map(parent => projectedPath(parent.polygons, project) ?? '').join('');
    attribute(parentUnderlay, 'd', parentPaths);
    attribute(parentBoundaries, 'd', parentPaths);
    display(labels, !atStreet);
    if (!atStreet) {
      const placed = [];
      for (const parent of parents.values()) {
        const { unit, label, badgeWidth, bounds: box } = parent;
        const point = unit.labelPoint && project(unit.labelPoint);
        const southwest = box && project({ lat: box.south, lng: box.west });
        const northeast = box && project({ lat: box.north, lng: box.east });
        const spanX = southwest && northeast ? Math.abs(northeast.x - southwest.x) : 0;
        const spanY = southwest && northeast ? Math.abs(northeast.y - southwest.y) : 0;
        const showLabel = point && spanX > badgeWidth + 8 && spanY > 28
          && point.x >= badgeWidth / 2 + 4 && point.x <= width - badgeWidth / 2 - 4 && point.y >= 14 && point.y <= height - 14
          && placed.every(other => Math.abs(point.x - other.x) > (badgeWidth + other.width) / 2 + 4 || Math.abs(point.y - other.y) > 25);
        display(label, Boolean(showLabel));
        if (!showLabel) continue;
        attribute(label, 'transform', `translate(${point.x.toFixed(2)},${point.y.toFixed(2)})`);
        placed.push({ x: point.x, y: point.y, width: badgeWidth });
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
    for (const parent of parents.values()) {
      attribute(parent.label, 'data-selected', parent.children.some(id => selected.has(id)));
      attribute(parent.label, 'data-preview', parent.children.includes(preview));
    }
    // Draw selected subdivisions last to keep their shared edges readable.
    const ordered = [...entries.entries()].sort(([left], [right]) =>
      Number(selected.has(left)) * 2 + Number(preview === left) - Number(selected.has(right)) * 2 - Number(preview === right));
    ordered.forEach(([, entry], index) => {
      if (highlights.children[index] !== entry.group) highlights.insertBefore(entry.group, highlights.children[index] ?? null);
    });
    const text = selection === 'all'
      ? 'Se muestran todas las unidades vecinales y sus subdivisiones. Los números identifican las unidades vecinales.'
      : `Subdivisiones seleccionadas: ${[...selected].join(', ')}. La selección se cambia desde los controles del análisis o sobre el mapa.`;
    if (description.textContent !== text) description.textContent = text;
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
    info() { return { visible, selected: selection === 'all' ? 'all' : [...selected], preview }; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe?.(); resizeObserver?.disconnect(); layer.remove();
    }
  };
}

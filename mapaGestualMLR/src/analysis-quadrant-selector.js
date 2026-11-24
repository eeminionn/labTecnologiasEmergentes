import { createAnalysisQuadrants } from './analysis-quadrants.js';
import './analysis-quadrant-selector.css';

const svgNamespace = 'http://www.w3.org/2000/svg';
let instanceNumber = 0;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function projectedPath(rings, project) {
  const paths = [];
  for (const ring of rings) {
    const points = ring.map(([lng, lat]) => project({ lng, lat }));
    if (!points.length || points.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
    paths.push(points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join('') + 'Z');
  }
  return paths.join('');
}

/**
 * Geographic decoration only: the map and the accessible panel own selection
 * events. Keeping every SVG descendant passive preserves drag and marker input.
 */
export function createAnalysisQuadrantSelector(container, { map, boundary, quadrants } = {}) {
  if (!container || typeof map?.locationToScreen !== 'function') throw new Error('El selector necesita el contenedor y la proyección del mapa.');
  const definition = Array.isArray(quadrants)
    ? { ...createAnalysisQuadrants(boundary), quadrants }
    : quadrants?.quadrants ? quadrants : createAnalysisQuadrants(boundary);
  const options = definition.quadrants;
  const identifiers = new Set(options.map(option => option.id));
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
  title.textContent = 'Cuadrantes de La Reina';
  const description = svgElement('desc', { id: `${prefix}-description` });
  const definitions = svgElement('defs');
  const communeClip = svgElement('clipPath', { id: `${prefix}-commune`, clipPathUnits: 'userSpaceOnUse' });
  const communeClipPath = svgElement('path', { 'clip-rule': 'evenodd', 'fill-rule': 'evenodd' });
  communeClip.append(communeClipPath);
  definitions.append(communeClip);
  const surface = svgElement('g', { 'clip-path': `url(#${prefix}-commune)` });
  const labels = svgElement('g', { class: 'analysis-quadrant-labels', 'aria-hidden': 'true' });
  const entries = new Map();

  for (const option of options) {
    const group = svgElement('g', { class: 'analysis-quadrant', 'data-quadrant': option.id });
    const fill = svgElement('path', { class: 'analysis-quadrant-fill' });
    const underlay = svgElement('path', { class: 'analysis-quadrant-underlay' });
    const edge = svgElement('path', { class: 'analysis-quadrant-edge' });
    const selectedBoundary = svgElement('path', {
      class: 'analysis-quadrant-selected-boundary',
      'clip-path': `url(#${prefix}-${option.id})`
    });
    const rectangleClip = svgElement('clipPath', { id: `${prefix}-${option.id}`, clipPathUnits: 'userSpaceOnUse' });
    const rectangleClipPath = svgElement('path');
    rectangleClip.append(rectangleClipPath);
    definitions.append(rectangleClip);
    group.append(fill, underlay, edge, selectedBoundary);
    surface.append(group);
    const label = svgElement('g', { class: 'analysis-quadrant-label', 'data-quadrant': option.id });
    const badge = svgElement('rect', { x: '-52', y: '-15', width: '104', height: '30', rx: '10' });
    const text = svgElement('text', { 'text-anchor': 'middle', y: '4' });
    text.textContent = option.label;
    label.append(badge, text);
    labels.append(label);
    entries.set(option.id, { option, group, fill, underlay, edge, selectedBoundary, rectangleClipPath, label, badge, text });
  }

  const boundaryUnderlay = svgElement('path', { class: 'analysis-quadrant-boundary-underlay' });
  const boundaryEdge = svgElement('path', { class: 'analysis-quadrant-boundary', 'fill-rule': 'evenodd' });
  svg.append(title, description, definitions, surface, boundaryUnderlay, boundaryEdge, labels);
  layer.append(svg);
  container.append(layer);
  let selection = 'all';
  let selected = new Set();
  let preview = null;
  let visible = false;
  let destroyed = false;
  let frame = null;

  function position() {
    if (destroyed || !visible) return;
    // A late map-provider fallback replaces the map DOM, but its position
    // subscriptions survive. Restore our own passive layer at that boundary.
    if (layer.parentElement !== container) container.append(layer);
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) { svg.style.visibility = 'hidden'; return; }
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const project = location => map.locationToScreen(location);
    const boundaryPath = projectedPath(definition.boundaryPolygons.flatMap(polygon => polygon), project);
    if (!boundaryPath) { svg.style.visibility = 'hidden'; return; }
    svg.style.visibility = '';
    for (const path of [communeClipPath, boundaryUnderlay, boundaryEdge]) path.setAttribute('d', boundaryPath);
    for (const entry of entries.values()) {
      const { option, label, badge, text } = entry;
      const rectanglePath = projectedPath(option.rectangle.coordinates, project);
      for (const path of [entry.fill, entry.underlay, entry.edge, entry.rectangleClipPath]) path.setAttribute('d', rectanglePath || '');
      entry.selectedBoundary.setAttribute('d', boundaryPath);
      const point = option.labelPoint && project(option.labelPoint);
      const [[south, west], [north, east]] = option.bounds;
      const southwest = project({ lat: south, lng: west }), northeast = project({ lat: north, lng: east });
      const spanX = southwest && northeast ? Math.abs(northeast.x - southwest.x) : 0;
      const spanY = southwest && northeast ? Math.abs(northeast.y - southwest.y) : 0;
      const textWidth = typeof text.getComputedTextLength === 'function' ? text.getComputedTextLength() : text.textContent.length * 7;
      const badgeWidth = Math.max(94, Math.ceil(textWidth) + 24);
      const showLabel = point && spanX > badgeWidth + 16 && spanY > 46
        && point.x >= badgeWidth / 2 && point.x <= width - badgeWidth / 2 && point.y >= 20 && point.y <= height - 20;
      label.style.display = showLabel ? '' : 'none';
      if (!showLabel) continue;
      label.setAttribute('transform', `translate(${point.x.toFixed(2)},${point.y.toFixed(2)})`);
      badge.setAttribute('x', String(-badgeWidth / 2));
      badge.setAttribute('width', String(badgeWidth));
    }
  }

  function schedulePosition() {
    if (destroyed || !visible || frame !== null) return;
    frame = requestAnimationFrame(() => { frame = null; position(); });
  }

  function paintState() {
    layer.hidden = !visible;
    layer.dataset.all = String(selection === 'all');
    for (const [id, entry] of entries) {
      const chosen = selected.has(id), previewed = preview === id;
      for (const element of [entry.group, entry.label]) {
        element.dataset.selected = String(chosen);
        element.dataset.preview = String(previewed);
      }
      entry.text.textContent = `${chosen ? '✓ ' : ''}${entry.option.label}`;
    }
    // Adjacent rectangles share edges. Paint a selection last so a later
    // unselected neighbour cannot cover its solid border with a dashed one.
    const ordered = [...entries.entries()].sort(([left], [right]) =>
      Number(selected.has(left)) * 2 + Number(preview === left) - Number(selected.has(right)) * 2 - Number(preview === right));
    surface.append(...ordered.map(([, entry]) => entry.group));
    const names = options.filter(option => selected.has(option.id)).map(option => option.label);
    description.textContent = selection === 'all'
      ? 'La comuna está dividida en Noroeste, Noreste, Suroeste y Sureste. Se muestran todos los cuadrantes.'
      : `Cuadrantes seleccionados: ${names.join(', ')}. La selección se puede cambiar en los controles del análisis o sobre el mapa.`;
    if (visible) schedulePosition();
    else if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
  }

  const subscribe = map.onPositionChange ?? map.onViewChange;
  const unsubscribe = typeof subscribe === 'function' ? subscribe.call(map, schedulePosition) : () => {};
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedulePosition) : null;
  resizeObserver?.observe(container);
  paintState();

  return {
    update(state = {}) {
      if (destroyed) return;
      let changed = false;
      if (Object.hasOwn(state, 'selected')) {
        const values = state.selected instanceof Set ? [...state.selected] : Array.isArray(state.selected) ? state.selected : [state.selected];
        const valid = options.filter(option => values.includes(option.id)).map(option => option.id);
        const nextSelection = values.includes('all') || !valid.length ? 'all' : valid;
        const previousKey = selection === 'all' ? 'all' : selection.join(',');
        const nextKey = nextSelection === 'all' ? 'all' : nextSelection.join(',');
        if (previousKey !== nextKey) {
          selection = nextSelection;
          selected = new Set(selection === 'all' ? [] : selection);
          changed = true;
        }
      }
      if (Object.hasOwn(state, 'preview')) {
        const id = typeof state.preview === 'object' ? state.preview?.id : state.preview;
        const nextPreview = identifiers.has(id) ? id : null;
        if (preview !== nextPreview) { preview = nextPreview; changed = true; }
      }
      if (Object.hasOwn(state, 'visible') && visible !== Boolean(state.visible)) { visible = Boolean(state.visible); changed = true; }
      if (changed) paintState();
    },
    setVisible(value) { this.update({ visible: value }); },
    info() { return { visible, selected: selection === 'all' ? 'all' : [...selected], preview }; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe?.();
      resizeObserver?.disconnect();
      layer.remove();
    }
  };
}

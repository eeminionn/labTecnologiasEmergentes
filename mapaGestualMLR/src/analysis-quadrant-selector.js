import { STREET_DETAIL_ZOOM, unitNeighborhoodColor } from './analysis-quadrants.js';
import { pointInsideBoundary, projectSecurityPoint } from './analysis-data.js';
import { placeCompanionUnitNumber } from './companion-unit-labels.js';
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
export function createAnalysisQuadrantSelector(container, {
  map, quadrants: definition, resourceAnchors = () => [], projectionNumbers = false, labelChrome = () => []
} = {}) {
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
  function clipGeometry(name) {
    const id = `${prefix}-${name}`;
    const clip = svgElement('clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
    const path = svgElement('path', { 'clip-rule': 'evenodd', 'fill-rule': 'evenodd' });
    clip.append(path);
    definitions.append(clip);
    return { path, reference: `url(#${id})` };
  }
  const communeClip = clipGeometry('commune');
  const outsideSelection = clipGeometry('outside-selection');
  const movingSurface = svgElement('g');
  const surface = svgElement('g', { 'clip-path': communeClip.reference });
  // One compound stroke per level keeps shared edges from becoming darker
  // through repeated transparent strokes on adjacent geographic polygons.
  const subdivisionUnderlay = svgElement('path', { class: 'analysis-subdivision-underlay' });
  const subdivisions = svgElement('path', { class: 'analysis-subdivision-boundaries' });
  const subdivisionLines = svgElement('g', { 'clip-path': outsideSelection.reference });
  subdivisionLines.append(subdivisionUnderlay, subdivisions);
  const unitFills = svgElement('g');
  const selectionFills = svgElement('g');
  const selectionOutlines = svgElement('g', { 'clip-path': outsideSelection.reference });
  const parentUnderlay = svgElement('path', { class: 'analysis-unit-underlay' });
  const parentBoundaries = svgElement('g');
  const communeUnderlay = svgElement('path', { class: 'analysis-commune-underlay' });
  const communeBoundary = svgElement('path', { class: 'analysis-commune-boundary' });
  const highlights = svgElement('g', { class: 'analysis-quadrant-highlights' });
  surface.append(unitFills, subdivisionLines, selectionFills, selectionOutlines, highlights, parentUnderlay, parentBoundaries, communeUnderlay, communeBoundary);
  movingSurface.append(surface);
  const labels = svgElement('g', { class: 'analysis-unit-labels', 'aria-hidden': 'true' });
  const entries = new Map();
  const parents = new Map();

  for (const option of options) {
    const clip = clipGeometry(`part-${option.id}`);
    const group = svgElement('g', {
      class: 'analysis-quadrant', 'data-quadrant': option.id, 'data-unit': option.unit, 'clip-path': clip.reference
    });
    group.style.setProperty('--unit-color', unitNeighborhoodColor(option.unit));
    const underlay = svgElement('path', { class: 'analysis-quadrant-underlay' });
    const edge = svgElement('path', { class: 'analysis-quadrant-edge' });
    group.append(underlay, edge);
    highlights.append(group);
    entries.set(option.id, { unit: option.unit, polygons: option.polygons, group, clipPath: clip.path, underlay, edge });
  }
  for (const unit of units) {
    const polygons = unit.polygons, label = svgElement('g', { class: 'analysis-unit-label', 'data-unit': unit.id });
    const clip = clipGeometry(`unit-${unit.id}`);
    const color = unitNeighborhoodColor(unit.id);
    const fill = svgElement('path', { class: 'analysis-unit-fill', 'fill-rule': 'evenodd' });
    const selectionFill = svgElement('path', { class: 'analysis-selection-fill', 'fill-rule': 'evenodd' });
    const selectionOutline = svgElement('path', { class: 'analysis-selection-outline', 'data-unit': unit.id });
    const boundary = svgElement('path', {
      class: 'analysis-unit-boundaries', 'data-unit': unit.id, 'clip-path': clip.reference
    });
    for (const element of [fill, boundary, selectionFill, selectionOutline]) element.style.setProperty('--unit-color', color);
    unitFills.append(fill);
    selectionFills.append(selectionFill);
    selectionOutlines.append(selectionOutline);
    parentBoundaries.append(boundary);
    const territoryName = svgElement('text', {
      class: 'analysis-unit-name', 'text-anchor': 'middle', 'dominant-baseline': 'central'
    });
    const number = String(projectionNumbers ? unit.id : unit.label ?? unit.id);
    const name = 'Unidad ' + number;
    territoryName.textContent = projectionNumbers ? number : name;
    label.append(territoryName);
    labels.append(label);
    const box = geographicBounds(polygons);
    const candidates = labelCandidates(unit, polygons, box, definition.boundaryPolygons);
    parents.set(String(unit.id), {
      polygons, geometry: unit.geometry, label, fill, boundary, clipPath: clip.path, candidates, selectionFill, selectionOutline,
      territoryName, name, number,
      clearance: Math.max(0, ...candidates.map(candidate => candidate.clearance))
    });
  }

  const orderedParents = [...parents.values()].sort((left, right) => left.clearance - right.clearance);
  svg.append(title, description, definitions, movingSurface, labels);
  layer.append(svg);
  container.append(layer);
  let selected = null, preview = null;
  let visible = false, destroyed = false, frame = null, projectionSignature = null;
  let projectedAnchors = null;

  function paintSelection() {
    const pathsByUnit = new Map();
    for (const id of selected ?? []) {
      const { unit, clipPath } = entries.get(id);
      const path = clipPath.getAttribute('d') ?? '';
      pathsByUnit.set(unit, (pathsByUnit.get(unit) ?? '') + path);
    }
    // Clip the strokes to the outside of the combined selection. A shared edge
    // has selected area on both sides, so neither its stroke nor its dashes show.
    const boundary = communeClip.path.getAttribute('d') ?? '';
    attribute(outsideSelection.path, 'd', boundary + [...pathsByUnit.values()].join(''));
    for (const [id, parent] of parents) {
      const path = pathsByUnit.get(id) ?? '';
      attribute(parent.selectionFill, 'd', path);
      attribute(parent.selectionOutline, 'd', path);
    }
  }

  function position() {
    if (destroyed || !visible) return;
    // Position subscriptions survive a late provider fallback that replaces the
    // map DOM. Restore this layer without requiring a map-adapter special case.
    if (layer.parentElement !== container) {
      container.append(layer);
      projectionSignature = projectedAnchors = null;
    }
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
    const { zoom, wheelZooming } = map.info?.() ?? {};
    const atStreet = Number.isFinite(zoom) && zoom >= STREET_DETAIL_ZOOM;
    const signature = `${width},${height},${atStreet},${anchors.map(point => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(',')}`;
    if (!wheelZooming && signature === projectionSignature && !movingSurface.hasAttribute('transform')) return;
    attribute(svg, 'viewBox', `0 0 ${width} ${height}`);
    attribute(layer, 'data-scale', atStreet ? 'street' : 'overview');
    svg.style.visibility = '';
    display(labels, projectionNumbers || !atStreet);

    const labelHalfHeight = 8;
    const obstacles = atStreet && !projectionNumbers ? [] : resourceAnchors().flatMap(({ location, halfWidth, halfHeight }) => {
      const point = project(location);
      return point ? [{ ...point, halfWidth, halfHeight }] : [];
    });
    const placed = [];
    const labelFits = (point, halfWidth) => point && point.x >= halfWidth + 4 && point.x <= width - halfWidth - 4
      && point.y >= labelHalfHeight + 4 && point.y <= height - labelHalfHeight - 4
      && !placed.some(other => Math.abs(point.x - other.x) < halfWidth + other.halfWidth + 5
        && Math.abs(point.y - other.y) < labelHalfHeight * 2 + 4)
      && !obstacles.some(other => Math.abs(point.x - other.x) < halfWidth + other.halfWidth + 3
        && Math.abs(point.y - other.y) < labelHalfHeight + other.halfHeight + 3);
    function showLabel(parent, placement) {
      display(parent.label, Boolean(placement));
      if (!placement) return;
      attribute(parent.label, 'transform', `translate(${placement.x.toFixed(2)},${placement.y.toFixed(2)})`);
      placed.push(placement);
    }

    // Trackpad frames share the same Mercator projection. Transform the existing
    // paths and clips together, then rebuild them once at the settled view.
    if (!projectionNumbers && wheelZooming && projectedAnchors) {
      const [baseWest, baseNorth, baseEast] = projectedAnchors;
      const [west, north, east] = anchors;
      const scaleX = (east.x - west.x) / (baseEast.x - baseWest.x);
      const scaleY = (north.y - east.y) / (baseNorth.y - baseEast.y);
      if (Number.isFinite(scaleX) && Number.isFinite(scaleY) && scaleX > 0 && scaleY > 0) {
        const x = west.x - baseWest.x * scaleX, y = east.y - baseEast.y * scaleY;
        attribute(movingSurface, 'transform', `matrix(${scaleX} 0 0 ${scaleY} ${x} ${y})`);
        if (!atStreet) for (const parent of orderedParents) {
          const placement = parent.placement;
          const point = placement && project(placement.location);
          showLabel(parent, placement && labelFits(point, placement.halfWidth) ? { ...point, halfWidth: placement.halfWidth } : null);
        }
        return;
      }
    }

    movingSurface.removeAttribute('transform');
    const boundaryPath = projectedPath(definition.boundaryPolygons, project);
    if (!boundaryPath) { svg.style.visibility = 'hidden'; projectionSignature = null; return; }
    attribute(communeClip.path, 'd', boundaryPath);
    attribute(communeUnderlay, 'd', boundaryPath);
    attribute(communeBoundary, 'd', boundaryPath);
    const subdivisionPaths = [];
    for (const entry of entries.values()) {
      const path = projectedPath(entry.polygons, project) ?? '';
      subdivisionPaths.push(path);
      for (const element of [entry.clipPath, entry.underlay, entry.edge]) attribute(element, 'd', path);
    }
    const subdivisionPath = subdivisionPaths.join('');
    attribute(subdivisionUnderlay, 'd', subdivisionPath);
    attribute(subdivisions, 'd', subdivisionPath);
    const parentPaths = [];
    for (const parent of parents.values()) {
      const path = projectedPath(parent.polygons, project) ?? '';
      parentPaths.push(path);
      for (const element of [parent.clipPath, parent.fill, parent.boundary]) attribute(element, 'd', path);
    }
    attribute(parentUnderlay, 'd', parentPaths.join(''));
    paintSelection();
    if (projectionNumbers) {
      const chrome = labelChrome();
      for (const parent of orderedParents) {
        const preferred = parent.candidates.map(project);
        const rings = () => parent.polygons.map(([ring]) => ring.map(([lng, lat]) => project({ lng, lat })).filter(Boolean));
        const inside = point => {
          const location = map.screenToLocation?.(point.x, point.y);
          return location && pointInsideBoundary(location.lng, location.lat, parent.geometry);
        };
        showLabel(parent, placeCompanionUnitNumber(preferred, rings, {
          width, height, halfWidth: parent.number.length === 1 ? 5 : 9, placed, resources: obstacles, chrome, inside
        }));
      }
    } else if (!atStreet) {
      const [westWorld, southWorld] = projectSecurityPoint(bounds.west, bounds.south);
      const [eastWorld, northWorld] = projectSecurityPoint(bounds.east, bounds.north);
      const pixelsPerMetre = Math.min(
        Math.hypot(anchors[2].x - anchors[0].x, anchors[2].y - anchors[0].y) / (eastWorld - westWorld),
        Math.hypot(anchors[1].x - anchors[2].x, anchors[1].y - anchors[2].y) / (northWorld - southWorld)
      );
      // Give the narrow units their interior space first. Larger units can use
      // an alternate interior point when a nearby number would overlap.
      for (const parent of orderedParents) {
        let placement = null;
        const forms = [[parent.name, parent.number.length === 1 ? 25 : 28], [parent.number, 9]];
        for (const [name, halfWidth] of forms) {
          for (const candidate of parent.candidates) {
            if (candidate.clearance * pixelsPerMetre < labelHalfHeight + 3.5) continue;
            const point = project(candidate);
            if (!labelFits(point, halfWidth)) continue;
            if (map.screenToLocation && ![-halfWidth, halfWidth].every(dx => {
              const edge = map.screenToLocation(point.x + dx, point.y);
              return edge && pointInsideBoundary(edge.lng, edge.lat, parent.geometry);
            })) continue;
            placement = { ...point, location: candidate, halfWidth, name }; break;
          }
          if (placement) break;
        }
        parent.placement = placement;
        showLabel(parent, placement);
        if (placement && parent.territoryName.textContent !== placement.name) parent.territoryName.textContent = placement.name;
      }
    }
    projectedAnchors = anchors;
    projectionSignature = signature;
  }

  function schedulePosition() {
    if (destroyed || !visible || frame !== null) return;
    frame = requestAnimationFrame(() => { frame = null; position(); });
  }

  function refreshLabels() {
    projectionSignature = null;
    schedulePosition();
  }

  function paintState() {
    layer.hidden = !visible;
    attribute(layer, 'data-scope', selected === null ? 'commune' : selected.size ? 'selected' : 'empty');
    for (const [id, entry] of entries) {
      attribute(entry.group, 'data-selected', selected?.has(id) ?? false);
      attribute(entry.group, 'data-preview', preview === id);
    }
    const hierarchy = projectionNumbers
      ? 'El número y el color de los límites identifican cada unidad vecinal visible. Las líneas discontinuas separan sus subdivisiones.'
      : 'El rótulo y el color de los límites identifican cada unidad vecinal. Las líneas continuas separan las unidades y las discontinuas sus subdivisiones. Los rótulos se ocultan al acercarse a las calles. Las subdivisiones seleccionadas muestran un contorno común en el color de su unidad.';
    const text = selected === null
      ? `Se muestran todas las unidades vecinales y sus subdivisiones. ${hierarchy}`
      : selected.size ? `Subdivisiones seleccionadas: ${[...selected].join(', ')}. ${hierarchy}`
        : `No hay subdivisiones seleccionadas. ${hierarchy}`;
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
    let changed = false, needsPosition = false;
    if (Object.hasOwn(state, 'selected')) {
      const values = Array.isArray(state.selected) || state.selected instanceof Set ? new Set(state.selected) : new Set([state.selected]);
      const next = values.has(null) || values.has('all') ? null : new Set(options.filter(option => values.has(option.id)).map(option => option.id));
      const key = selection => selection === null ? 'all' : [...selection].join(',');
      if (key(selected) !== key(next)) {
        selected = next;
        paintSelection();
        changed = true;
      }
    }
    if (Object.hasOwn(state, 'preview')) {
      const id = typeof state.preview === 'object' ? state.preview?.id : state.preview;
      const nextPreview = identifiers.has(id) ? id : null;
      if (preview !== nextPreview) { preview = nextPreview; changed = true; }
    }
    if (Object.hasOwn(state, 'visible') && visible !== Boolean(state.visible)) {
      visible = Boolean(state.visible); needsPosition = visible; changed = true;
    }
    if (changed) paintState();
    if (needsPosition) schedulePosition();
  }

  return {
    update, refreshLabels,
    setVisible(value) { update({ visible: value }); },
    info() { return { visible, selected: selected === null ? null : [...selected], preview }; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe?.(); resizeObserver?.disconnect(); layer.remove();
    }
  };
}

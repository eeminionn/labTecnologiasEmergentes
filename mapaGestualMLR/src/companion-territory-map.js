import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import boundaryText from '../assets/la-reina.geojson?raw';
import neighborhoodsText from '../assets/la-reina-neighborhoods.geojson?raw';
import { HEAT_COLOR_STOPS } from './analysis-data.js';
import { CAMERA_HEAT_COLOR_STOPS } from './camera-analysis-data.js';
import { createAnalysisQuadrants, STREET_DETAIL_ZOOM } from './analysis-quadrants.js';
import { createAnalysisQuadrantSelector } from './analysis-quadrant-selector.js';
import { analysisBlendOpacity } from './analysis-transition.js';
import './companion-territory-map.css';

const boundary = JSON.parse(boundaryText);
const district = createAnalysisQuadrants(JSON.parse(neighborhoodsText), boundary);
const communeBounds = L.geoJSON(boundary).getBounds();
const tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileCredit = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const boundaryCredit = '<span title="Autorizada su circulación por Resolución Nº50 del 2019 de la Dirección Nacional de Fronteras y Límites del Estado">Límite: SUBDERE · IDE Chile · DPA 2023</span>';
const layerNames = { security: 'Robos', cameras: 'Cámaras', fixed: 'Casetas', alarms: 'Botones de emergencia' };
const markerPaths = {
  cameras: 'M3 6h13v10H3zM16 9l5-3v10l-5-3M8 16v4m-4 0h8',
  fixed: 'M3 21h18M5 21V10l7-5 7 5v11M10 21v-6h4v6M12 5V2m0 1h5',
  alarms: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'
};
const svgNamespace = 'http://www.w3.org/2000/svg';
const kindOf = kind => kind === 'camera' ? 'cameras' : kind;
const isLocation = point => Number.isFinite(point?.lat) && Number.isFinite(point?.lng);
const opacity = (value, fallback) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

function node(tag, className, label) {
  const element = document.createElement(tag);
  element.className = className;
  if (label) element.textContent = label;
  return element;
}

function pointIcon(kind, point) {
  const symbol = node('span', 'companion-territory-marker');
  symbol.dataset.kind = kind;
  symbol.dataset.outside = String(point.inArea === false);
  symbol.dataset.scenario = String(Boolean(point.scenario));
  symbol.dataset.highlighted = String(Boolean(point.highlighted));
  if (point.count) symbol.dataset.group = '';
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNamespace, 'path');
  path.setAttribute('d', markerPaths[kind]);
  svg.append(path);
  symbol.append(svg);
  if (point.count) symbol.append(node('span', 'companion-territory-count', String(point.count)));
  return L.divIcon({ className: 'companion-territory-symbol', html: symbol, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function cameraGroups(points) {
  const groups = new Map(), markers = [];
  for (const point of points) {
    if (point.scenario || point.highlighted) { markers.push(point); continue; }
    const area = point.quadrantId?.split('-')[0] ?? `${Math.floor(point.lat / .004)}-${Math.floor(point.lng / .004)}`;
    const key = `${area}:${point.inArea !== false}`;
    const group = groups.get(key) ?? [];
    group.push(point);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length === 1) { markers.push(group[0]); continue; }
    const latitudes = group.map(point => point.lat), longitudes = group.map(point => point.lng);
    markers.push({
      lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      lng: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      count: group.length, label: `${group.length} cámaras`, inArea: group[0].inArea
    });
  }
  return markers;
}

function fitScope(map, ids) {
  const bounds = L.latLngBounds([]);
  for (const id of ids ?? []) bounds.extend(district.byId.get(id).bounds);
  const target = bounds.isValid() ? bounds : communeBounds;
  map.fitBounds(target, {
    paddingTopLeft: [16, 16], paddingBottomRight: [16, 40], maxZoom: 18, animate: false
  });
}

export function createCompanionTerritoryMap() {
  const element = node('div', 'companion-territory-map');
  const viewport = node('div', 'companion-territory-viewport');
  viewport.setAttribute('role', 'group');
  viewport.setAttribute('aria-label', 'Mapa del área en análisis');
  const legend = node('div', 'companion-territory-legend');
  legend.setAttribute('aria-label', 'Simbología del mapa');
  legend.hidden = true;
  const unavailable = node('span', 'companion-territory-unavailable', 'Mapa de calles no disponible');
  unavailable.hidden = true;
  element.append(viewport, legend, unavailable);

  let state, map, tiles, quadrantOverlay, frame = null, blendFrame = null, destroyed = false;
  let lastSize, lastScope, lastPoints, lastLegend, focusMarker;
  const rasters = new Map(), anchors = [];
  let markers;

  function startMap() {
    map = L.map(viewport, {
      zoomControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, zoomAnimation: false, markerZoomAnimation: false, trackResize: false,
      minZoom: 11, maxZoom: 19, zoomSnap: 0
    });
    map.attributionControl.setPrefix(false).addAttribution(boundaryCredit);
    L.control.scale({ position: 'topright', maxWidth: 85, imperial: false }).addTo(map);
    for (const [kind, zIndex] of [['security', 350], ['cameras', 360], ['focus', 625]]) {
      const pane = map.createPane(`companion-${kind}`);
      pane.style.zIndex = String(zIndex);
      pane.style.pointerEvents = 'none';
    }
    markers = L.layerGroup().addTo(map);
    quadrantOverlay = createAnalysisQuadrantSelector(viewport, {
      quadrants: district,
      resourceAnchors: () => anchors,
      map: {
        locationToScreen: location => map.latLngToContainerPoint(location),
        screenToLocation: (x, y) => map.containerPointToLatLng([x, y]),
        info: () => ({ zoom: map.getZoom() }),
        onPositionChange(callback) {
          map.on('moveend', callback);
          return () => map.off('moveend', callback);
        }
      }
    });
  }

  function syncTiles(offline) {
    if (offline) {
      tiles?.remove();
      tiles = null;
      unavailable.hidden = false;
      return;
    }
    if (tiles) return;
    unavailable.hidden = true;
    let loaded = false;
    tiles = L.tileLayer(tileUrl, { minZoom: 11, maxZoom: 19, keepBuffer: 1, attribution: tileCredit });
    tiles.on('tileload', () => { loaded = true; unavailable.hidden = true; });
    tiles.on('loading', () => { loaded = false; });
    tiles.on('load', () => { unavailable.hidden = loaded || Boolean(viewport.querySelector('.leaflet-tile-loaded')); });
    tiles.addTo(map);
  }

  function syncRasters(layers) {
    const retainedKinds = new Set();
    for (const layer of layers) {
      const kind = kindOf(layer.kind);
      if (!['security', 'cameras'].includes(kind)) continue;
      const previous = rasters.get(kind) ?? [];
      const available = new Set(previous);
      const next = (layer.rasters ?? []).filter(item => typeof item?.url === 'string' && item.bounds).map(item => {
        const bounds = item.bounds.flat().join(',');
        const old = [...available].find(entry => entry.url === item.url && entry.bounds === bounds);
        const alpha = opacity(item.opacity, .62);
        if (old) {
          available.delete(old);
          old.overlay.setOpacity(alpha);
          return old;
        }
        const overlay = L.imageOverlay(item.url, item.bounds, { opacity: alpha, pane: `companion-${kind}`,
          alt: `Concentración de ${layerNames[kind].toLowerCase()}` }).addTo(map);
        return { url: item.url, bounds, overlay };
      });
      for (const entry of available) entry.overlay.remove();
      if (next.some((entry, index) => previous[index] !== entry)) next.forEach(entry => entry.overlay.bringToFront());
      rasters.set(kind, next);
      retainedKinds.add(kind);
    }
    for (const [kind, entries] of rasters) {
      if (retainedKinds.has(kind)) continue;
      entries.forEach(entry => entry.overlay.remove());
      rasters.delete(kind);
    }
    if (blendFrame !== null) cancelAnimationFrame(blendFrame);
    blendFrame = null;
    const blend = layers.find(layer => layer.kind === 'security')?.blend;
    const pair = rasters.get('security');
    if (!blend?.playing || !blend.durationMs || pair?.length !== 2) return;
    const tick = () => {
      const mix = Math.min(1, blend.mix + Math.max(0, Date.now() - blend.startedAt) / blend.durationMs);
      const weights = analysisBlendOpacity(blend.opacity, mix);
      pair[0].overlay.setOpacity(weights.previous);
      pair[1].overlay.setOpacity(weights.next);
      blendFrame = mix < 1 ? requestAnimationFrame(tick) : null;
    };
    tick();
  }

  function syncPoints(layers) {
    const detail = map.getZoom() >= STREET_DETAIL_ZOOM;
    const inputs = layers.filter(layer => Object.hasOwn(markerPaths, kindOf(layer.kind)) && layer.points?.length)
      .map(layer => ({ kind: kindOf(layer.kind), opacity: opacity(layer.opacity, .9), points: layer.points }));
    const key = JSON.stringify([detail, inputs]);
    if (key === lastPoints) return;
    lastPoints = key;
    anchors.length = 0;
    markers.clearLayers();
    for (const layer of inputs) {
      const valid = layer.points.filter(isLocation);
      const points = layer.kind === 'cameras' && !detail ? cameraGroups(valid) : valid;
      // Gray context remains visible under the points contributing to the result.
      for (const point of [...points.filter(point => point.inArea === false), ...points.filter(point => point.inArea !== false)]) {
        markers.addLayer(L.marker(point, {
          icon: pointIcon(layer.kind, point), interactive: false, keyboard: false,
          title: point.label ?? layerNames[layer.kind], alt: '',
          opacity: layer.opacity, zIndexOffset: point.inArea === false ? 0 : 500
        }));
        anchors.push({ location: point, halfWidth: point.count ? 19 : 9, halfHeight: 9 });
      }
    }
    quadrantOverlay.refreshLabels();
  }

  function syncLegend(layers) {
    const entries = layers.map(layer => ({ kind: kindOf(layer.kind), mode: layer.mode, label: layer.label }))
      .filter(layer => Object.hasOwn(layerNames, layer.kind));
    const key = JSON.stringify(entries);
    if (key === lastLegend) return;
    lastLegend = key;
    legend.replaceChildren();
    legend.hidden = entries.length === 0;
    for (const layer of entries) {
      const row = node('span', 'companion-territory-key-item');
      const sample = node('span', 'companion-territory-sample');
      sample.dataset.kind = layer.kind;
      sample.setAttribute('aria-hidden', 'true');
      if (layer.mode === 'heatmap') {
        const stops = layer.kind === 'security' ? HEAT_COLOR_STOPS : CAMERA_HEAT_COLOR_STOPS;
        sample.dataset.heat = '';
        sample.style.background = `linear-gradient(90deg, ${stops.map(stop => `rgb(${stop.color.join(',')}) ${stop.value * 100}%`).join(', ')})`;
      }
      row.append(sample, node('span', '', layer.label || layerNames[layer.kind]));
      legend.append(row);
    }
  }

  function render() {
    frame = null;
    if (destroyed || !state || !viewport.clientWidth || !viewport.clientHeight) return;
    if (!map) startMap();
    const ids = Array.isArray(state.quadrantIds) ? state.quadrantIds.filter(id => district.byId.has(id)) : null;
    const scope = ids === null ? 'commune' : ids.length ? 'selected' : 'empty';
    const scopeKey = ids === null ? 'commune' : ids.join(',');
    const size = `${viewport.clientWidth}x${viewport.clientHeight}`;
    syncTiles(state.offline);
    if (size !== lastSize || scopeKey !== lastScope) {
      if (size !== lastSize) map.invalidateSize({ pan: false });
      fitScope(map, ids);
      lastSize = size;
      lastScope = scopeKey;
      element.dataset.scope = scope;
      element.dataset.zoom = String(map.getZoom());
    }
    viewport.setAttribute('aria-label', `Mapa del área en análisis · ${state.areaLabel ||
      (scope === 'commune' ? 'Toda la comuna' : scope === 'empty' ? 'Sin cuadrantes seleccionados' : ids.join(', '))}`);
    quadrantOverlay.update({ visible: true, selected: ids, preview: state.focusQuadrantId });
    const layers = state.layers ?? [];
    syncRasters(layers);
    syncPoints(layers);
    syncLegend(layers);
    if (isLocation(state.focus)) {
      if (!focusMarker) {
        focusMarker = L.marker(state.focus, { pane: 'companion-focus', interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'companion-territory-focus', iconSize: [24, 24] }) }).addTo(map);
      } else focusMarker.setLatLng(state.focus);
    } else {
      focusMarker?.remove();
      focusMarker = null;
    }
  }

  function schedule() {
    if (!destroyed && frame === null) frame = requestAnimationFrame(render);
  }
  const resize = new ResizeObserver(schedule);
  resize.observe(viewport);

  return {
    element,
    update(territory) {
      state = territory ?? { quadrantIds: null, layers: [] };
      schedule();
    },
    destroy() {
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      if (blendFrame !== null) cancelAnimationFrame(blendFrame);
      resize.disconnect();
      quadrantOverlay?.destroy();
      map?.remove();
      element.remove();
    }
  };
}

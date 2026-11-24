import L from 'leaflet';
import boundaryText from '../assets/la-reina.geojson?raw';
import { PointSequence } from './sequence.js';
import { createAnalysisRasterTransition } from './analysis-transition.js';
import { MAP_TOPICS } from './map-topics.js';

const boundary = JSON.parse(boundaryText);
const boundaryStyle = { color: '#0f766e', weight: 3, opacity: .9, fillColor: '#0f766e', fillOpacity: .05 };
const boundaryCredit = 'Límite: SUBDERE · IDE Chile · DPA 2023';
const circulationLegend = 'Autorizada su circulación por Resolución Nº50 del 2019 de la Dirección Nacional de Fronteras y Límites del Estado';
const center = { lat: -33.442, lng: -70.536 };
const markerSize = 88;
const markerHeight = 112;
const markerAnchor = [markerSize / 2, markerHeight];
const markerNumberY = markerHeight * .292;
const categoryLegend = [
  { id: 'territorio', label: 'Territorio, movilidad y entorno', color: '#afc439' },
  { id: 'gobernanza', label: 'Gobernanza y recursos municipales', color: '#00adb2' },
  { id: 'seguridad', label: 'Seguridad y riesgos', color: '#e82d81' }
];
const samples = MAP_TOPICS;

const popup = item => {
  const div = document.createElement('div'); div.className = 'demo-popup';
  const heading = document.createElement('strong'); heading.textContent = item.title;
  const note = document.createElement('p'); note.textContent = item.description;
  div.append(heading, note); return div;
};

function addLegend(container) {
  const legend = document.createElement('aside');
  legend.className = 'map-category-legend';
  legend.setAttribute('aria-label', 'Temas del mapa');
  const isProjection = document.body.classList.contains('twin-projection');
  const categories = isProjection ? categoryLegend : samples.map(item => categoryLegend.find(category => category.id === item.category));
  for (const [index, category] of categories.entries()) {
    const row = document.createElement('div'); row.className = 'map-category-legend-row';
    row.style.setProperty('--category-color', category.color);
    if (!isProjection) {
      const number = document.createElement('span');
      number.className = 'map-category-legend-number';
      number.textContent = String(samples[index].number);
      row.append(number);
    }
    row.append(category.label);
    legend.append(row);
  }
  container.append(legend);
  return legend;
}

function updateMarker(element, item, sequence) {
  if (!element) return;
  const state = sequence.state(item.id);
  element.dataset.markerId = item.id;
  element.dataset.state = state;
  element.dataset.category = item.category;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', `Punto ${item.number}: ${item.title}`);
  // The numbered route is a guide, never a lock: any topic can be revisited.
  element.setAttribute('aria-disabled', 'false');
  element.tabIndex = 0;
  const dot = element.querySelector('.demo-dot');
  if (dot) {
    dot.className = `demo-dot category-pin${item.number === 1 ? ' is-featured' : ''}`;
    dot.dataset.state = state;
    dot.setAttribute('aria-hidden', 'true');
  }
}

function markerElement(item, sequence) {
  const element = document.createElement('div');
  element.className = 'demo-marker sequence-marker';
  // The hit area remains fixed while only pin 1's artwork gently changes size.
  Object.assign(element.style, { width: `${markerSize}px`, height: `${markerHeight}px` });
  const dot = document.createElement('span'); dot.className = 'demo-dot category-pin';
  const image = document.createElement('img'); image.src = `/content/pins/${item.category}.svg`;
  image.alt = ''; image.draggable = false;
  const number = document.createElement('span'); number.className = 'pin-number'; number.textContent = String(item.number);
  dot.append(image, number); element.append(dot); updateMarker(element, item, sequence);
  return element;
}

function markerTarget(item, element, tip) {
  return { id: item.id, x: tip.x, y: tip.y - markerHeight + markerNumberY,
    width: markerSize, height: markerSize, element };
}

function diagnostics(sequence, featureCount) {
  return { sequence: sequence.snapshot(), boundaryLoaded: featureCount > 0, boundaryFeatureCount: featureCount };
}

function analysisLayerSpec(value) {
  if (value === null || value === undefined) return null;
  const bounds = value.bounds;
  if (typeof value.url !== 'string' || !value.url || !Array.isArray(bounds) || bounds.length !== 2
    || bounds.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
    || bounds[0][0] >= bounds[1][0] || bounds[0][1] >= bounds[1][1]
    || bounds[0][0] < -85.051129 || bounds[1][0] > 85.051129 || bounds[0][1] < -180 || bounds[1][1] > 180)
    throw new Error('La capa de análisis necesita una imagen y límites geográficos válidos.');
  return { url: value.url, bounds: bounds.map(point => [...point]),
    opacity: Number.isFinite(value.opacity) ? Math.max(0, Math.min(1, value.opacity)) : .62,
    transitionMs: Number.isFinite(value.transitionMs) ? Math.max(0, Math.min(3000, value.transitionMs)) : 0 };
}

function analysisFrameSpec(value) {
  if (value === null || value === undefined) return null;
  const opacity = Number.isFinite(value.opacity) ? Math.max(0, Math.min(1, value.opacity)) : .62;
  const from = analysisLayerSpec({ ...value.from, opacity, transitionMs: 0 });
  const to = analysisLayerSpec({ ...value.to, opacity, transitionMs: 0 });
  if (!from || !to || JSON.stringify(from.bounds) !== JSON.stringify(to.bounds) || !Number.isFinite(value.progress))
    throw new Error('La mezcla de análisis necesita dos imágenes sobre los mismos límites y una posición válida.');
  return { from, to, opacity, progress: Math.max(0, Math.min(1, value.progress)) };
}

function cameraLayerSpec(value) {
  if (value === null || value === undefined) return null;
  const mode = value.mode ?? 'points';
  if (!['points', 'heatmap'].includes(mode) || !Array.isArray(value.points ?? []))
    throw new Error('La capa de cámaras necesita una representación válida.');
  const points = (value.points ?? []).map(point => {
    if (!point || typeof point !== 'object') throw new Error('La capa de cámaras contiene una ubicación no válida.');
    const location = { lat: Number(point.lat ?? point.latitud), lng: Number(point.lng ?? point.longitud) };
    if (!validLocation(location)) throw new Error('La capa de cámaras contiene una ubicación no válida.');
    return { ...point, ...location };
  });
  const image = mode === 'heatmap' ? analysisLayerSpec(value) : null;
  return { mode, points, url: image?.url ?? null, bounds: image?.bounds ?? null,
    opacity: Number.isFinite(value.opacity) ? Math.max(0, Math.min(1, value.opacity)) : .85 };
}

function analysisPadding(container) {
  const padding = { top: 80, right: 70, bottom: 70, left: container.clientWidth <= 1000 ? 280 : 318 };
  const outer = container.getBoundingClientRect();
  for (const side of ['left', 'right']) {
    const panel = container.querySelector(`.analysis-panel[data-side="${side}"]:not([hidden])`);
    if (!panel) continue;
    const box = panel.getBoundingClientRect();
    if (!box.width || !box.height || box.right <= outer.left || box.left >= outer.right) continue;
    padding[side] = Math.ceil(side === 'left' ? box.right - outer.left + 12 : outer.right - box.left + 12);
  }
  return padding;
}

function analysisMarkerVisibility(element, visible) {
  if (!element) return;
  element.style.display = visible ? '' : 'none';
  element.setAttribute('aria-hidden', String(!visible));
  element.tabIndex = visible ? 0 : -1;
}

function validScreenPosition(container, x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && container.clientWidth > 0 && container.clientHeight > 0
    && x >= 0 && y >= 0 && x <= container.clientWidth && y <= container.clientHeight;
}

function validLocation(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) < 85.051129 && Math.abs(point.lng) <= 180;
}

export async function createMap(container, config, notify, providerChanged = () => {}, onPointSelected = () => {}) {
  const sequence = new PointSequence(samples.map(item => item.id));
  if (config.provider === 'google' && config.googleKey) {
    let current, savedAnalysisLayer = null, savedAnalysisFrame = null, savedCameraLayer = null, savedAnalysisMode = false;
    const mapSubscriptions = new Set();
    const detachMapSubscriptions = () => {
      for (const subscription of mapSubscriptions) { subscription.unsubscribe?.(); subscription.unsubscribe = null; }
    };
    const bindMapSubscriptions = () => {
      for (const subscription of mapSubscriptions) subscription.unsubscribe = current[subscription.method](subscription.callback);
    };
    const subscribeTo = (method, callback) => {
      if (typeof callback !== 'function') return () => {};
      const subscription = { method, callback, unsubscribe: current[method](callback) };
      mapSubscriptions.add(subscription);
      return () => { if (mapSubscriptions.delete(subscription)) subscription.unsubscribe?.(); };
    };
    let initializationFailed = false;
    const failureMessage = 'Google Maps no está disponible. Revisa la API key, Maps JavaScript API y facturación. Se muestra OpenStreetMap.';
    try {
      current = await googleMap(container, config.googleKey, () => {
        initializationFailed = true;
        if (!current) return;
        // A late provider failure must not remove an open graphic or its
        // fixed hand targets when the map underneath is replaced.
        const content = container.querySelector('.content-viewer');
        const experience = container.querySelector('.traffic-experience');
        const analysis = container.querySelector('.analysis-experience');
        const analysisResources = container.querySelector(':scope > .analysis-resource-markers');
        detachMapSubscriptions(); current.destroy(); container.replaceChildren();
        current = osmMap(container, notify, config.offline, sequence, onPointSelected);
        bindMapSubscriptions();
        current.setAnalysisMode(savedAnalysisMode);
        if (savedAnalysisFrame) current.setAnalysisFrame(savedAnalysisFrame);
        else current.setAnalysisLayer(savedAnalysisLayer);
        current.setCameraAnalysisLayer(savedCameraLayer);
        if (content) container.append(content);
        if (experience) container.append(experience);
        if (analysis) container.append(analysis);
        if (analysisResources) container.append(analysisResources);
        if (savedAnalysisMode) current.home();
        for (const subscription of mapSubscriptions) subscription.callback();
        notify(failureMessage); providerChanged(current.provider);
      }, notify, sequence, onPointSelected);
      if (initializationFailed) { current.destroy(); throw new Error('Google authentication'); }
      return {
        get provider() { return current.provider; },
        pan: (...args) => current.pan(...args), zoom: (...args) => current.zoom(...args),
        screenToLocation: (...args) => current.screenToLocation(...args),
        locationToScreen: (...args) => current.locationToScreen(...args),
        onViewChange: callback => subscribeTo('onViewChange', callback),
        onPositionChange: callback => subscribeTo('onPositionChange', callback),
        focus: (...args) => current.focus(...args),
        setAnalysisMode(value) { savedAnalysisMode = value === true; return current.setAnalysisMode(savedAnalysisMode); },
        setAnalysisLayer(value) { savedAnalysisFrame = null; savedAnalysisLayer = analysisLayerSpec(value); return current.setAnalysisLayer(savedAnalysisLayer); },
        setAnalysisFrame(value) { savedAnalysisLayer = null; savedAnalysisFrame = analysisFrameSpec(value); return current.setAnalysisFrame(savedAnalysisFrame); },
        clearAnalysisLayer() { savedAnalysisLayer = null; savedAnalysisFrame = null; return current.clearAnalysisLayer(); },
        setAnalysisOpacity(value) {
          const saved = savedAnalysisFrame || savedAnalysisLayer;
          if (!saved || !Number.isFinite(value)) return false;
          saved.opacity = Math.max(0, Math.min(1, value));
          return current.setAnalysisOpacity(saved.opacity);
        },
        setCameraAnalysisLayer(value) { savedCameraLayer = cameraLayerSpec(value); return current.setCameraAnalysisLayer(savedCameraLayer); },
        clearCameraAnalysisLayer() { savedCameraLayer = null; return current.clearCameraAnalysisLayer(); },
        setCameraAnalysisOpacity(value) {
          if (!savedCameraLayer || !Number.isFinite(value)) return false;
          savedCameraLayer.opacity = Math.max(0, Math.min(1, value));
          return current.setCameraAnalysisOpacity(savedCameraLayer.opacity);
        },
        home: () => current.home(), resetSequence: () => current.resetSequence(),
        destroy() { detachMapSubscriptions(); mapSubscriptions.clear(); current.destroy(); },
        info: () => current.info(), targets: () => current.targets()
      };
    } catch { container.replaceChildren(); notify(failureMessage); }
  } else if (config.provider === 'google') notify('Configura una API key para usar Google Maps. Se muestra OpenStreetMap.');
  return osmMap(container, notify, config.offline, sequence, onPointSelected);
}

function osmMap(container, notify, offline = false, sequence, onPointSelected) {
  const map = L.map(container, { zoomControl: false, zoomSnap: 0, zoomDelta: .5, zoomAnimation: false, fadeAnimation: false }).setView([center.lat, center.lng], 14);
  let analysisMode = false;
  const analysisRaster = createAnalysisRasterTransition({
    createLayer(spec, onLoad, onError) {
      const layer = L.imageOverlay(spec.url, spec.bounds, { pane: 'analysis-heatmap', opacity: 0,
        interactive: false, alt: 'Concentración de incidentes de seguridad' });
      layer.on('load', onLoad); layer.on('error', onError);
      return {
        setOpacity: value => layer.setOpacity(value),
        show() { if (!map.hasLayer(layer)) layer.addTo(map); },
        hide() { layer.remove(); },
        // Keep Leaflet's remove listener until its own map listeners detach.
        destroy() { layer.remove(); layer.off(); }
      };
    },
    onError: () => notify('No se pudo mostrar el mapa de calor.')
  });
  let cameraOverlay = null, cameraSpec = null, cameraLoaded = false;
  const analysisPane = map.createPane('analysis-heatmap');
  analysisPane.style.zIndex = '350'; analysisPane.style.pointerEvents = 'none';
  const cameraPane = map.createPane('analysis-cameras');
  cameraPane.style.zIndex = '360'; cameraPane.style.pointerEvents = 'none';
  map.attributionControl.setPrefix(false);
  if (!offline) L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, minZoom: 3, updateWhenIdle: true, keepBuffer: 1,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map).once('tileerror', () => notify('No se pudieron cargar algunas teselas. Comprueba la conexión a Internet.'));
  else container.style.background = 'repeating-linear-gradient(0deg,transparent 0 59px,#d1d9e0 60px),repeating-linear-gradient(90deg,#e9eef2 0 59px,#d1d9e0 60px)';
  map.attributionControl.addAttribution(`<span title="${circulationLegend}">${boundaryCredit}</span>`);
  const outline = L.geoJSON(boundary, { style: boundaryStyle, interactive: false }).addTo(map);
  const home = () => {
    const padding = analysisPadding(container);
    return map.fitBounds(outline.getBounds(), analysisMode
      ? { paddingTopLeft: [padding.left, padding.top], paddingBottomRight: [padding.right, padding.bottom], animate: false }
      : { padding: [64, 64], animate: false });
  };
  const legend = addLegend(container);
  const markers = samples.map(item => {
    const marker = L.marker([item.lat, item.lng], {
      title: item.title,
      icon: L.divIcon({ className: 'demo-marker sequence-marker', html: markerElement(item, sequence).innerHTML, iconSize: [markerSize, markerHeight], iconAnchor: markerAnchor })
    }).addTo(map);
    // Automatic popup listeners would bypass identity checks, including Enter.
    marker.off('click');
    marker.off('keypress');
    marker.on('click', () => {
      if (analysisMode) return;
      if (sequence.activate(item.id)) refreshMarkers();
      map.closePopup();
      if (item.number !== 1) L.popup().setLatLng(marker.getLatLng()).setContent(popup(item)).openOn(map);
      onPointSelected({ ...item });
    });
    marker.on('keydown', event => {
      if (event.originalEvent.key === 'Enter' || event.originalEvent.key === ' ') {
        L.DomEvent.stop(event.originalEvent); marker.fire('click');
      }
    });
    return marker;
  });
  const refreshMarkers = () => markers.forEach((marker, index) => {
    updateMarker(marker.getElement(), samples[index], sequence);
    analysisMarkerVisibility(marker.getElement(), !analysisMode);
  });
  function setAnalysisMode(value) {
    analysisMode = value === true;
    map.closePopup(); legend.style.display = analysisMode ? 'none' : '';
    refreshMarkers();
    analysisRaster.setVisible(analysisMode);
    if (cameraOverlay) {
      if (analysisMode && !map.hasLayer(cameraOverlay)) cameraOverlay.addTo(map);
      else if (!analysisMode && map.hasLayer(cameraOverlay)) map.removeLayer(cameraOverlay);
    }
    return analysisMode;
  }
  function setAnalysisLayer(value) {
    analysisRaster.set(analysisLayerSpec(value));
  }
  function setAnalysisFrame(value) { analysisRaster.setFrame(analysisFrameSpec(value)); }
  function setAnalysisOpacity(value) {
    return analysisRaster.setOpacity(value);
  }
  function clearCameraAnalysisLayer() {
    // Keep Leaflet's remove listener until it has detached the map listeners.
    if (cameraOverlay) { cameraOverlay.remove(); cameraOverlay.off(); cameraOverlay = null; }
    cameraSpec = null; cameraLoaded = false;
  }
  function setCameraAnalysisLayer(value) {
    const nextSpec = cameraLayerSpec(value);
    clearCameraAnalysisLayer(); cameraSpec = nextSpec;
    if (!cameraSpec) return;
    cameraPane.style.opacity = String(cameraSpec.opacity);
    if (cameraSpec.mode === 'points') {
      cameraLoaded = true;
      return;
    }
    const next = L.imageOverlay(cameraSpec.url, cameraSpec.bounds, { pane: 'analysis-cameras',
      opacity: 1, interactive: false, alt: 'Concentración de ubicaciones de cámaras de seguridad' });
    next.on('load', () => { if (cameraOverlay === next) cameraLoaded = true; });
    next.on('error', () => { if (cameraOverlay === next) { cameraLoaded = false; notify('No se pudo mostrar el mapa de cámaras.'); } });
    cameraOverlay = next;
    if (analysisMode) cameraOverlay.addTo(map);
  }
  function setCameraAnalysisOpacity(value) {
    if (!cameraSpec || !Number.isFinite(value)) return false;
    cameraSpec.opacity = Math.max(0, Math.min(1, value));
    cameraPane.style.opacity = String(cameraSpec.opacity); return true;
  }
  refreshMarkers(); home();
  return {
    provider: 'OpenStreetMap',
    screenToLocation(x, y) {
      if (!validScreenPosition(container, x, y)) return null;
      const point = map.containerPointToLatLng(L.point(x, y));
      return validLocation(point) ? { lat: point.lat, lng: point.lng } : null;
    },
    locationToScreen(location) {
      if (!validLocation(location)) return null;
      // Keep subpixel precision: latLngToContainerPoint rounds the projected
      // point, which shifts a query by a few metres at the commune zoom.
      const layerPoint = map.project([location.lat, location.lng], map.getZoom()).subtract(map.getPixelOrigin());
      const point = map.layerPointToContainerPoint(layerPoint);
      return Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
    },
    onViewChange(callback) {
      if (typeof callback !== 'function') return () => {};
      const handler = () => callback(); map.on('movestart zoomstart resize', handler);
      return () => map.off('movestart zoomstart resize', handler);
    },
    onPositionChange(callback) {
      if (typeof callback !== 'function') return () => {};
      const events = 'move zoom resize viewreset';
      map.on(events, callback);
      return () => map.off(events, callback);
    },
    pan(dx, dy) { map.panBy([-dx, -dy], { animate: false }); },
    zoom(delta, x, y) { map.setZoomAround(L.point(x, y), Math.min(19, Math.max(3, map.getZoom() + delta)), { animate: false }); },
    focus(point, zoom = 19, { animate = true } = {}) {
      map.stop();
      if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        map.setView([point.lat, point.lng], zoom, { animate: false }); return Promise.resolve();
      }
      return new Promise(resolve => {
        let timer;
        const finish = () => { clearTimeout(timer); map.off('moveend', finish); resolve(); };
        map.once('moveend', finish);
        timer = setTimeout(finish, 1900);
        map.flyTo([point.lat, point.lng], zoom, { animate: true, duration: 1.35 });
      });
    },
    home,
    setAnalysisMode, setAnalysisLayer, setAnalysisFrame, clearAnalysisLayer: () => setAnalysisLayer(null), setAnalysisOpacity,
    setCameraAnalysisLayer, clearCameraAnalysisLayer, setCameraAnalysisOpacity,
    resetSequence() { map.closePopup(); const state = sequence.reset(); refreshMarkers(); return state; },
    destroy() { analysisRaster.destroy(); clearCameraAnalysisLayer(); legend.remove(); map.remove(); container.style.background = ''; },
    info() { return { zoom: map.getZoom(), center: map.getCenter(), analysisMode,
      analysisLayerLoaded: analysisRaster.info().loaded, analysisLayerVisible: analysisRaster.info().visible,
      analysisTransitioning: analysisRaster.info().transitioning,
      analysisBounds: analysisRaster.info().spec?.bounds, analysisOpacity: analysisRaster.info().spec?.opacity ?? null,
      cameraAnalysisMode: cameraSpec?.mode ?? null, cameraAnalysisLoaded: analysisMode && cameraLoaded,
      cameraAnalysisVisible: analysisMode && !!cameraSpec, cameraAnalysisPointCount: cameraSpec?.points.length ?? 0,
      cameraAnalysisOpacity: cameraSpec?.opacity ?? null,
      ...diagnostics(sequence, outline.getLayers().length) }; },
    targets() {
      if (analysisMode) return [];
      return markers.map((marker, index) => {
        const tip = map.latLngToContainerPoint(marker.getLatLng());
        return markerTarget(samples[index], marker.getElement(), tip);
      });
    }
  };
}

async function googleMap(container, key, onFatal, notify, sequence, onPointSelected) {
  if (!window.google?.maps) await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('Google timeout')), 12000);
    window.gm_authFailure = () => { clearTimeout(timer); reject(new Error('Google authentication')); };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=quarterly`;
    script.onload = () => { clearTimeout(timer); window.gm_authFailure = onFatal; resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error('Google network')); };
    document.head.append(script);
  });
  const { Map, InfoWindow, RenderingType, OverlayView, GroundOverlay } = await google.maps.importLibrary('maps');
  const map = new Map(container, { center, zoom: 14, disableDefaultUI: true, clickableIcons: true, renderingType: RenderingType.VECTOR, isFractionalZoomEnabled: true, gestureHandling: 'greedy', tilt: 0, heading: 0 });
  const mapChangeCleanup = new Set();
  function subscribe(events, callback) {
    if (typeof callback !== 'function') return () => {};
    const listeners = events.map(event => map.addListener(event, callback));
    const observer = new ResizeObserver(() => callback()); observer.observe(container);
    const cleanup = () => {
      if (!mapChangeCleanup.delete(cleanup)) return;
      listeners.forEach(listener => listener.remove());
      observer.disconnect();
    };
    mapChangeCleanup.add(cleanup);
    return cleanup;
  }
  let analysisMode = false;
  const analysisRaster = createAnalysisRasterTransition({
    createLayer(spec, onLoad, onError) {
      const [[south, west], [north, east]] = spec.bounds;
      const layer = new GroundOverlay(spec.url, { south, west, north, east }, { opacity: 0, clickable: false });
      // GroundOverlay has no public load event; probe the same local image.
      const image = new Image(); image.onload = onLoad; image.onerror = onError; image.src = spec.url;
      return {
        setOpacity: value => layer.setOpacity(value),
        show() { layer.setMap(map); },
        hide() { layer.setMap(null); },
        destroy() { layer.setMap(null); image.onload = null; image.onerror = null; image.src = ''; }
      };
    },
    onError: () => notify('No se pudo mostrar el mapa de calor.')
  });
  let cameraSpec = null, cameraGround = null, cameraLoaded = false, cameraImage = null;
  map.addListener('renderingtype_changed', () => { if (map.getRenderingType() === 'RASTER') notify('Este equipo usa Google Maps raster. El zoom puede tener menos fluidez que el mapa vectorial.'); });
  const features = map.data.addGeoJson(boundary);
  map.data.setStyle({ strokeColor: boundaryStyle.color, strokeWeight: boundaryStyle.weight, strokeOpacity: boundaryStyle.opacity, fillColor: boundaryStyle.fillColor, fillOpacity: boundaryStyle.fillOpacity, clickable: false });
  const bounds = new google.maps.LatLngBounds(
    { lat: boundary.bbox[1], lng: boundary.bbox[0] },
    { lat: boundary.bbox[3], lng: boundary.bbox[2] }
  );
  const home = () => map.fitBounds(bounds, analysisMode ? analysisPadding(container) : 64);
  const attribution = document.createElement('div');
  attribution.className = 'boundary-attribution'; attribution.textContent = `${boundaryCredit}`;
  attribution.title = circulationLegend; attribution.style.pointerEvents = 'none';
  // Keep the provider's own copyright and terms row visible below our credit.
  attribution.style.bottom = '26px';
  attribution.setAttribute('aria-label', `${boundaryCredit}. ${circulationLegend}`);
  container.append(attribution);
  const info = new InfoWindow();
  const legend = addLegend(container);

  // A public OverlayView keeps the same numbered DOM markers without a cloud Map ID.
  class SequenceMarker extends OverlayView {
    constructor(item) { super(); this.item = item; this.position = new google.maps.LatLng(item.lat, item.lng); this.element = null; }
    onAdd() {
      this.element = markerElement(this.item, sequence);
      this.element.style.position = 'absolute';
      analysisMarkerVisibility(this.element, !analysisMode);
      this.element.addEventListener('click', () => {
        if (analysisMode) return;
        if (sequence.activate(this.item.id)) refreshMarkers();
        info.close();
        if (this.item.number !== 1) { info.setContent(popup(this.item)); info.setPosition(this.position); info.open({ map }); }
        onPointSelected({ ...this.item });
      });
      this.element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); this.element.click(); }
      });
      OverlayView.preventMapHitsAndGesturesFrom(this.element);
      this.getPanes().overlayMouseTarget.append(this.element);
    }
    draw() {
      if (!this.element) return;
      const p = this.getProjection().fromLatLngToDivPixel(this.position);
      if (!p) return;
      this.element.style.left = `${p.x - markerAnchor[0]}px`;
      this.element.style.top = `${p.y - markerAnchor[1]}px`;
    }
    onRemove() { this.element?.remove(); this.element = null; }
  }
  const markers = samples.map(item => new SequenceMarker(item));
  const refreshMarkers = () => markers.forEach(marker => {
    updateMarker(marker.element, marker.item, sequence);
    analysisMarkerVisibility(marker.element, !analysisMode);
  });
  function setAnalysisMode(value) {
    analysisMode = value === true;
    info.close(); legend.style.display = analysisMode ? 'none' : '';
    refreshMarkers(); analysisRaster.setVisible(analysisMode);
    cameraGround?.setMap(analysisMode ? map : null);
    return analysisMode;
  }
  function setAnalysisLayer(value) {
    analysisRaster.set(analysisLayerSpec(value));
  }
  function setAnalysisFrame(value) { analysisRaster.setFrame(analysisFrameSpec(value)); }
  function setAnalysisOpacity(value) {
    return analysisRaster.setOpacity(value);
  }
  function clearCameraAnalysisImage() {
    if (cameraImage) { cameraImage.onload = null; cameraImage.onerror = null; cameraImage.src = ''; cameraImage = null; }
  }
  function clearCameraAnalysisLayer() {
    cameraGround?.setMap(null); cameraGround = null;
    clearCameraAnalysisImage(); cameraSpec = null; cameraLoaded = false;
  }
  function setCameraAnalysisLayer(value) {
    const nextSpec = cameraLayerSpec(value);
    clearCameraAnalysisLayer(); cameraSpec = nextSpec;
    if (!cameraSpec) return;
    const heatmap = cameraSpec.mode === 'heatmap';
    if (heatmap) {
      const [[south, west], [north, east]] = cameraSpec.bounds;
      cameraGround = new GroundOverlay(cameraSpec.url, { south, west, north, east }, { opacity: cameraSpec.opacity, clickable: false });
      const image = new Image(); cameraImage = image;
      image.onload = () => { if (cameraImage === image) cameraLoaded = true; };
      image.onerror = () => { if (cameraImage === image) { cameraLoaded = false; notify('No se pudo mostrar el mapa de cámaras.'); } };
      image.src = cameraSpec.url;
    }
    cameraLoaded = !heatmap;
    if (analysisMode) cameraGround?.setMap(map);
  }
  function setCameraAnalysisOpacity(value) {
    if (!cameraSpec || !Number.isFinite(value)) return false;
    cameraSpec.opacity = Math.max(0, Math.min(1, value));
    cameraGround?.setOpacity(cameraSpec.opacity);
    return true;
  }
  markers.forEach(marker => marker.setMap(map)); home();
  return {
    provider: 'Google Maps',
    screenToLocation(x, y) {
      if (!validScreenPosition(container, x, y)) return null;
      const projection = markers[0]?.getProjection();
      if (!projection) return null;
      const point = projection.fromContainerPixelToLatLng(new google.maps.Point(x, y));
      const location = point?.toJSON();
      return validLocation(location) ? location : null;
    },
    locationToScreen(location) {
      if (!validLocation(location)) return null;
      const projection = markers[0]?.getProjection();
      if (!projection) return null;
      const point = projection.fromLatLngToContainerPixel(new google.maps.LatLng(location.lat, location.lng));
      return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
    },
    onViewChange: callback => subscribe(['bounds_changed'], callback),
    onPositionChange: callback => subscribe(['bounds_changed', 'projection_changed', 'idle'], callback),
    pan(dx, dy) {
      const projection = map.getProjection(); if (!projection) return;
      const p = projection.fromLatLngToPoint(map.getCenter()), scale = 2 ** map.getZoom();
      map.setCenter(projection.fromPointToLatLng(new google.maps.Point(p.x - dx / scale, p.y - dy / scale)));
    },
    zoom(delta, x = container.clientWidth / 2, y = container.clientHeight / 2) {
      const projection = map.getProjection(); if (!projection) return;
      const old = map.getZoom(), next = Math.min(20, Math.max(3, old + delta));
      const p = projection.fromLatLngToPoint(map.getCenter()), offset = { x: x - container.clientWidth / 2, y: y - container.clientHeight / 2 };
      const anchor = { x: p.x + offset.x / 2 ** old, y: p.y + offset.y / 2 ** old };
      map.setZoom(next); const actual = map.getZoom();
      map.setCenter(projection.fromPointToLatLng(new google.maps.Point(anchor.x - offset.x / 2 ** actual, anchor.y - offset.y / 2 ** actual)));
    },
    home,
    setAnalysisMode, setAnalysisLayer, setAnalysisFrame, clearAnalysisLayer: () => setAnalysisLayer(null), setAnalysisOpacity,
    setCameraAnalysisLayer, clearCameraAnalysisLayer, setCameraAnalysisOpacity,
    resetSequence() { info.close(); const state = sequence.reset(); refreshMarkers(); return state; },
    focus(point, zoom = 19) { map.panTo(point); map.setZoom(zoom); return Promise.resolve(); },
    destroy() {
      for (const cleanup of [...mapChangeCleanup]) cleanup();
      analysisRaster.destroy(); clearCameraAnalysisLayer();
      info.close(); markers.forEach(marker => marker.setMap(null));
      features.forEach(feature => map.data.remove(feature));
      google.maps.event.clearInstanceListeners(map); window.gm_authFailure = () => {};
      attribution.remove(); legend.remove(); container.replaceChildren();
    },
    info() { return { zoom: map.getZoom(), center: map.getCenter()?.toJSON(), analysisMode,
      analysisLayerLoaded: analysisRaster.info().loaded, analysisLayerVisible: analysisRaster.info().visible,
      analysisTransitioning: analysisRaster.info().transitioning,
      analysisBounds: analysisRaster.info().spec?.bounds, analysisOpacity: analysisRaster.info().spec?.opacity ?? null,
      cameraAnalysisMode: cameraSpec?.mode ?? null, cameraAnalysisLoaded: analysisMode && cameraLoaded,
      cameraAnalysisVisible: analysisMode && !!cameraSpec, cameraAnalysisPointCount: cameraSpec?.points.length ?? 0,
      cameraAnalysisOpacity: cameraSpec?.opacity ?? null,
      ...diagnostics(sequence, features.length) }; },
    targets() {
      if (analysisMode) return [];
      return markers.flatMap(marker => {
        if (!marker.element) return [];
        const tip = marker.getProjection()?.fromLatLngToContainerPixel(marker.position);
        return tip ? [markerTarget(marker.item, marker.element, tip)] : [];
      });
    }
  };
}

import L from 'leaflet';
import boundaryText from '../assets/la-reina.geojson?raw';
import { PointSequence } from './sequence.js';

const boundary = JSON.parse(boundaryText);
const boundaryStyle = { color: '#0f766e', weight: 3, opacity: .9, fillColor: '#0f766e', fillOpacity: .05 };
const boundaryCredit = 'Límite: SUBDERE · IDE Chile · DPA 2023';
const circulationLegend = 'Autorizada su circulación por Resolución Nº50 del 2019 de la Dirección Nacional de Fronteras y Límites del Estado';
const center = { lat: -33.442, lng: -70.536 };
const markerSize = 56;
const samples = [
  { id: 'point-0', number: 1, lat: -33.4409, lng: -70.5381, title: 'Punto 1' },
  { id: 'point-1', number: 2, lat: -33.4453, lng: -70.5321, title: 'Punto 2' },
  { id: 'point-2', number: 3, lat: -33.4378, lng: -70.5308, title: 'Punto 3' }
];

const popup = item => {
  const div = document.createElement('div'); div.className = 'demo-popup';
  const heading = document.createElement('strong'); heading.textContent = item.title;
  const button = document.createElement('button'); button.textContent = 'Seleccionar punto';
  // The popup action never advances the marker sequence a second time.
  button.onclick = () => { button.textContent = 'Punto seleccionado'; button.disabled = true; };
  div.append(heading, button); return div;
};

function updateMarker(element, item, sequence) {
  if (!element) return;
  const state = sequence.state(item.id);
  const dot = element.querySelector('.demo-dot');
  element.dataset.markerId = item.id;
  element.dataset.state = state;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', `${item.title}, ${state === 'active' ? 'siguiente' : state === 'complete' ? 'completado' : 'pendiente'}`);
  element.setAttribute('aria-disabled', String(state !== 'active'));
  element.tabIndex = state === 'active' ? 0 : -1;
  if (dot) {
    dot.className = `demo-dot is-${state}`;
    dot.dataset.state = state;
    dot.textContent = String(item.number);
    dot.setAttribute('aria-hidden', 'true');
  }
}

function markerElement(item, sequence) {
  const element = document.createElement('div');
  element.className = 'demo-marker sequence-marker';
  // The containing hit area never pulses, changes size or moves with its visual.
  Object.assign(element.style, { width: `${markerSize}px`, height: `${markerSize}px`, display: 'grid', placeItems: 'center' });
  const dot = document.createElement('span'); dot.className = 'demo-dot';
  element.append(dot); updateMarker(element, item, sequence);
  return element;
}

function diagnostics(sequence, featureCount) {
  return { sequence: sequence.snapshot(), boundaryLoaded: featureCount > 0, boundaryFeatureCount: featureCount };
}

export async function createMap(container, config, notify, providerChanged = () => {}) {
  const sequence = new PointSequence(samples.map(item => item.id));
  if (config.provider === 'google' && config.googleKey) {
    let current;
    let initializationFailed = false;
    const failureMessage = 'Google Maps no está disponible. Revisa la API key, Maps JavaScript API y facturación. Se muestra OpenStreetMap.';
    try {
      current = await googleMap(container, config.googleKey, () => {
        initializationFailed = true;
        if (!current) return;
        current.destroy(); container.replaceChildren();
        current = osmMap(container, notify, config.offline, sequence);
        notify(failureMessage); providerChanged(current.provider);
      }, notify, sequence);
      if (initializationFailed) { current.destroy(); throw new Error('Google authentication'); }
      return {
        get provider() { return current.provider; },
        pan: (...args) => current.pan(...args), zoom: (...args) => current.zoom(...args),
        home: () => current.home(), resetSequence: () => current.resetSequence(),
        destroy: () => current.destroy(), info: () => current.info(), targets: () => current.targets()
      };
    } catch { container.replaceChildren(); notify(failureMessage); }
  } else if (config.provider === 'google') notify('Configura una API key para usar Google Maps. Se muestra OpenStreetMap.');
  return osmMap(container, notify, config.offline, sequence);
}

function osmMap(container, notify, offline = false, sequence) {
  const map = L.map(container, { zoomControl: false, zoomSnap: 0, zoomDelta: .5, zoomAnimation: false, fadeAnimation: false }).setView([center.lat, center.lng], 14);
  map.attributionControl.setPrefix(false);
  if (!offline) L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, minZoom: 3, updateWhenIdle: true, keepBuffer: 1,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map).once('tileerror', () => notify('No se pudieron cargar algunas teselas. Comprueba la conexión a Internet.'));
  else container.style.background = 'repeating-linear-gradient(0deg,transparent 0 59px,#d1d9e0 60px),repeating-linear-gradient(90deg,#e9eef2 0 59px,#d1d9e0 60px)';
  map.attributionControl.addAttribution(`Puntos ficticios · <span title="${circulationLegend}">${boundaryCredit}</span>`);
  const outline = L.geoJSON(boundary, { style: boundaryStyle, interactive: false }).addTo(map);
  const home = () => map.fitBounds(outline.getBounds(), { padding: [64, 64], animate: false });
  const markers = samples.map(item => {
    const marker = L.marker([item.lat, item.lng], {
      title: item.title,
      icon: L.divIcon({ className: 'demo-marker sequence-marker', html: markerElement(item, sequence).innerHTML, iconSize: [markerSize, markerSize], iconAnchor: [markerSize / 2, markerSize / 2] })
    }).addTo(map).bindPopup(popup(item));
    // Automatic popup listeners would bypass identity checks, including Enter.
    marker.off('click');
    marker.off('keypress');
    marker.on('click', () => {
      if (sequence.state(item.id) !== 'active') return;
      marker.setPopupContent(popup(item)).openPopup();
      if (sequence.activate(item.id)) refreshMarkers();
    });
    marker.on('keydown', event => {
      if (event.originalEvent.key === 'Enter' || event.originalEvent.key === ' ') {
        L.DomEvent.stop(event.originalEvent); marker.fire('click');
      }
    });
    return marker;
  });
  const refreshMarkers = () => markers.forEach((marker, index) => updateMarker(marker.getElement(), samples[index], sequence));
  refreshMarkers(); home();
  return {
    provider: 'OpenStreetMap',
    pan(dx, dy) { map.panBy([-dx, -dy], { animate: false }); },
    zoom(delta, x, y) { map.setZoomAround(L.point(x, y), Math.min(19, Math.max(3, map.getZoom() + delta)), { animate: false }); },
    home,
    resetSequence() { map.closePopup(); const state = sequence.reset(); refreshMarkers(); return state; },
    destroy() { map.remove(); container.style.background = ''; },
    info() { return { zoom: map.getZoom(), center: map.getCenter(), ...diagnostics(sequence, outline.getLayers().length) }; },
    targets() {
      const index = sequence.activeIndex;
      if (index === null) return [];
      const marker = markers[index], p = map.latLngToContainerPoint(marker.getLatLng());
      return [{ id: samples[index].id, x: p.x, y: p.y, width: markerSize, height: markerSize, element: marker.getElement() }];
    }
  };
}

async function googleMap(container, key, onFatal, notify, sequence) {
  if (!window.google?.maps) await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('Google timeout')), 12000);
    window.gm_authFailure = () => { clearTimeout(timer); reject(new Error('Google authentication')); };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=quarterly`;
    script.onload = () => { clearTimeout(timer); window.gm_authFailure = onFatal; resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error('Google network')); };
    document.head.append(script);
  });
  const { Map, InfoWindow, RenderingType, OverlayView } = await google.maps.importLibrary('maps');
  const map = new Map(container, { center, zoom: 14, disableDefaultUI: true, clickableIcons: true, renderingType: RenderingType.VECTOR, isFractionalZoomEnabled: true, gestureHandling: 'greedy', tilt: 0, heading: 0 });
  map.addListener('renderingtype_changed', () => { if (map.getRenderingType() === 'RASTER') notify('Este equipo usa Google Maps raster. El zoom puede tener menos fluidez que el mapa vectorial.'); });
  const features = map.data.addGeoJson(boundary);
  map.data.setStyle({ strokeColor: boundaryStyle.color, strokeWeight: boundaryStyle.weight, strokeOpacity: boundaryStyle.opacity, fillColor: boundaryStyle.fillColor, fillOpacity: boundaryStyle.fillOpacity, clickable: false });
  const bounds = new google.maps.LatLngBounds(
    { lat: boundary.bbox[1], lng: boundary.bbox[0] },
    { lat: boundary.bbox[3], lng: boundary.bbox[2] }
  );
  const home = () => map.fitBounds(bounds, 64);
  const attribution = document.createElement('div');
  attribution.className = 'boundary-attribution'; attribution.textContent = `Puntos ficticios · ${boundaryCredit}`;
  attribution.title = circulationLegend; attribution.style.pointerEvents = 'none';
  // Keep the provider's own copyright and terms row visible below our credit.
  attribution.style.bottom = '26px';
  attribution.setAttribute('aria-label', `${boundaryCredit}. ${circulationLegend}`);
  container.append(attribution);
  const info = new InfoWindow();

  // A public OverlayView keeps the same numbered DOM markers without a cloud Map ID.
  class SequenceMarker extends OverlayView {
    constructor(item) { super(); this.item = item; this.position = new google.maps.LatLng(item.lat, item.lng); this.element = null; }
    onAdd() {
      this.element = markerElement(this.item, sequence);
      this.element.style.position = 'absolute';
      this.element.addEventListener('click', () => {
        if (sequence.state(this.item.id) !== 'active') return;
        info.setContent(popup(this.item)); info.setPosition(this.position); info.open({ map });
        if (sequence.activate(this.item.id)) refreshMarkers();
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
      this.element.style.left = `${p.x - markerSize / 2}px`;
      this.element.style.top = `${p.y - markerSize / 2}px`;
    }
    onRemove() { this.element?.remove(); this.element = null; }
  }
  const markers = samples.map(item => new SequenceMarker(item));
  const refreshMarkers = () => markers.forEach(marker => updateMarker(marker.element, marker.item, sequence));
  markers.forEach(marker => marker.setMap(map)); home();
  return {
    provider: 'Google Maps',
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
    resetSequence() { info.close(); const state = sequence.reset(); refreshMarkers(); return state; },
    destroy() {
      info.close(); markers.forEach(marker => marker.setMap(null));
      features.forEach(feature => map.data.remove(feature));
      google.maps.event.clearInstanceListeners(map); window.gm_authFailure = () => {};
      attribution.remove(); container.replaceChildren();
    },
    info() { return { zoom: map.getZoom(), center: map.getCenter()?.toJSON(), ...diagnostics(sequence, features.length) }; },
    targets() {
      const index = sequence.activeIndex;
      if (index === null) return [];
      const marker = markers[index];
      if (!marker.element) return [];
      const p = marker.getProjection()?.fromLatLngToContainerPixel(marker.position);
      if (!p) return [];
      return [{ id: marker.item.id, x: p.x, y: p.y, width: markerSize, height: markerSize, element: marker.element }];
    }
  };
}

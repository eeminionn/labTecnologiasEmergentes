import L from 'leaflet';
const center = { lat: -33.442, lng: -70.536 };
const samples = [
  { lat: -33.4409, lng: -70.5381, title: 'Punto de prueba 01', detail: 'Selección de información territorial. Datos ficticios, sin conexión a sistemas municipales.' },
  { lat: -33.4453, lng: -70.5321, title: 'Punto de prueba 02', detail: 'Segundo marcador para evaluar desplazamiento, zoom y precisión de clic.' },
  { lat: -33.4378, lng: -70.5308, title: 'Punto de prueba 03', detail: 'Prueba de apertura y cierre de un popup mediante el gesto OK.' }
];
const popup = item => {
  const div = document.createElement('div'); div.className = 'demo-popup';
  const heading = document.createElement('strong'); heading.textContent = item.title;
  const text = document.createElement('p'); text.textContent = item.detail;
  const button = document.createElement('button'); button.textContent = 'Seleccionar punto';
  button.onclick = () => { button.textContent = 'Punto seleccionado'; button.disabled = true; };
  div.append(heading, text, button); return div;
};
export async function createMap(container, config, notify, providerChanged = () => {}) {
  if (config.provider === 'google' && config.googleKey) {
    let current;
    let initializationFailed=false;
    const failureMessage='Google Maps no está disponible. Revisa la API key, Maps JavaScript API y facturación. Se muestra el mapa de prueba.';
    try {
      current = await googleMap(container, config.googleKey, () => {
        initializationFailed=true;
        if(!current)return;
        current.destroy();container.replaceChildren();current=osmMap(container,notify,config.offline);notify(failureMessage);providerChanged(current.provider);
      }, notify);
      if(initializationFailed){current.destroy();throw new Error('Google authentication');}
      return { get provider(){return current.provider;},pan:(...args)=>current.pan(...args),zoom:(...args)=>current.zoom(...args),home:()=>current.home(),destroy:()=>current.destroy(),info:()=>current.info() };
    }
    catch { container.replaceChildren();notify(failureMessage); }
  } else if (config.provider === 'google') notify('Configura una API key para usar Google Maps. Se muestra el mapa de prueba.');
  return osmMap(container, notify, config.offline);
}
function osmMap(container, notify, offline = false) {
  const map = L.map(container, { zoomControl: false, zoomSnap: 0, zoomDelta: .5, zoomAnimation: false, fadeAnimation: false }).setView([center.lat, center.lng], 14);
  map.attributionControl.setPrefix(false);
  if (!offline) L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, minZoom: 3, updateWhenIdle: true, keepBuffer: 1, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Puntos ficticios' }).addTo(map).once('tileerror', () => notify('No se pudieron cargar algunas teselas. Comprueba la conexión a Internet.'));
  else { container.style.background='repeating-linear-gradient(0deg,transparent 0 59px,#d1d9e0 60px),repeating-linear-gradient(90deg,#e9eef2 0 59px,#d1d9e0 60px)'; map.attributionControl.addAttribution('Prueba automatizada sin cartografía'); }
  for (const item of samples) L.marker([item.lat, item.lng], { icon: L.divIcon({ className: '', html: '<div class="demo-dot"></div>', iconSize: [16,16], iconAnchor: [8,8] }) }).addTo(map).bindPopup(popup(item));
  return {
    provider: 'OpenStreetMap · prueba',
    pan(dx,dy) { map.panBy([-dx,-dy], { animate: false }); },
    zoom(delta,x,y) { map.setZoomAround(L.point(x,y), Math.min(19, Math.max(3, map.getZoom() + delta)), { animate: false }); },
    home() { map.setView([center.lat,center.lng],14,{animate:false}); },
    destroy() { map.remove(); },
    info() { return { zoom: map.getZoom(), center: map.getCenter() }; }
  };
}
async function googleMap(container,key,onFatal,notify) {
  if (!window.google?.maps) await new Promise((resolve,reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('Google timeout')), 12000);
    window.gm_authFailure = () => { clearTimeout(timer); reject(new Error('Google authentication')); };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=quarterly`;
    script.onload = () => { clearTimeout(timer); window.gm_authFailure=onFatal;resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error('Google network')); };
    document.head.append(script);
  });
  const { Map, InfoWindow, RenderingType } = await google.maps.importLibrary('maps');
  const { Marker } = await google.maps.importLibrary('marker');
  const map = new Map(container, { center, zoom:14, disableDefaultUI:true, clickableIcons:true, renderingType:RenderingType.VECTOR, isFractionalZoomEnabled:true, gestureHandling:'greedy',tilt:0,heading:0 });
  map.addListener('renderingtype_changed',()=>{if(map.getRenderingType()==='RASTER')notify('Este equipo usa Google Maps raster. El zoom puede tener menos fluidez que el mapa vectorial.');});
  // Classic markers support maps without a cloud Map ID. Replace with AdvancedMarkerElement when a Map ID exists.
  const info = new InfoWindow();
  const markers=[];
  for (const item of samples) {
    const marker = new Marker({ position:{lat:item.lat,lng:item.lng}, map, title:item.title });
    marker.addListener('click',() => { info.setContent(popup(item)); info.open({ map, anchor:marker }); });
    markers.push(marker);
  }
  return {
    provider:'Google Maps',
    pan(dx,dy) {
      const projection=map.getProjection();if(!projection)return;
      const p=projection.fromLatLngToPoint(map.getCenter()),scale=2**map.getZoom();
      map.setCenter(projection.fromPointToLatLng(new google.maps.Point(p.x-dx/scale,p.y-dy/scale)));
    },
    zoom(delta,x=container.clientWidth/2,y=container.clientHeight/2) {
      const projection=map.getProjection();if(!projection)return;
      const old=map.getZoom(),next=Math.min(20,Math.max(3,old+delta));
      const p=projection.fromLatLngToPoint(map.getCenter()),offset={x:x-container.clientWidth/2,y:y-container.clientHeight/2};
      const anchor={x:p.x+offset.x/2**old,y:p.y+offset.y/2**old};
      map.setZoom(next);const actual=map.getZoom();
      map.setCenter(projection.fromPointToLatLng(new google.maps.Point(anchor.x-offset.x/2**actual,anchor.y-offset.y/2**actual)));
    },
    home() { map.setCenter(center); map.setZoom(14); },
    destroy() { info.close();for(const marker of markers){google.maps.event.clearInstanceListeners(marker);marker.setMap(null);} google.maps.event.clearInstanceListeners(map);window.gm_authFailure=()=>{};container.replaceChildren(); },
    info() { return { zoom:map.getZoom(),center:map.getCenter().toJSON() }; }
  };
}

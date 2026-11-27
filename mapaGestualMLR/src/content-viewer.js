import { fitContentViewport, panContentViewport, zoomContentViewport } from './content-viewport.js';
import { assetUrl } from './asset-url.js';
import { CHART_SIZE, createCouncilChart } from './council-chart.js';

export function createContentViewer(container, { onChange = () => {}, manifestUrl = '/content/manifest.json' } = {}) {
  const standalone = !document.body.classList.contains('twin-projection');
  let manifest = null, slides = [], slideIndex = 0, opened = false, destroyed = false;
  let viewport = fitContentViewport({ width: 1, height: 1, imageWidth: 1, imageHeight: 1 });
  let drag = null, imageGeneration = 0, returnFocus = null;
  let chart = null;
  const mapElements = new Set();
  const overlay = document.createElement('section');
  overlay.className = 'content-viewer'; overlay.hidden = true;
  overlay.dataset.theme = 'seguridad';
  overlay.setAttribute('aria-label', 'Gráficos del tema seleccionado');
  const stage = document.createElement('div'); stage.className = 'content-stage';
  if (standalone) {
    stage.setAttribute('role', 'group');
    stage.setAttribute('aria-label', 'Desplazar el gráfico ampliado con las flechas');
    stage.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
  }
  const image = document.createElement('img'); image.className = 'content-image'; image.alt = ''; image.draggable = false;
  const vector = document.createElement('div'); vector.className = 'content-image content-vector'; vector.hidden = true;
  vector.setAttribute('role', 'img');
  const status = document.createElement('span'); status.className = 'content-page-status'; status.setAttribute('aria-live', 'polite');
  const heading = document.createElement('div');
  heading.className = 'content-heading';
  const topic = document.createElement('p');
  topic.className = 'content-topic';
  topic.textContent = 'Seguridad y riesgos';
  const title = document.createElement('h1');
  title.id = 'content-title';
  const detail = document.createElement('p'); detail.className = 'content-detail';
  const chartNote = document.createElement('span'); chartNote.className = 'content-note'; chartNote.hidden = true;
  detail.append(status, chartNote);
  heading.append(topic, title, detail);
  const unavailable = document.createElement('p');
  unavailable.className = 'content-unavailable';
  unavailable.hidden = true;
  unavailable.setAttribute('role', 'status');
  unavailable.textContent = 'No se pudo cargar este gráfico. Prueba con otro o vuelve al mapa.';
  stage.append(image, vector, unavailable);
  const controls = document.createElement('nav'); controls.className = 'content-controls'; controls.setAttribute('aria-label', 'Navegación de gráficos');
  const button = (id, label, symbol, action, caption = '', parent = controls) => {
    const element = document.createElement('button'); element.type = 'button'; element.id = id;
    element.className = 'content-control'; element.setAttribute('aria-label', label); element.title = label;
    const visual = document.createElement('span'); visual.className = 'content-control-symbol'; visual.setAttribute('aria-hidden', 'true'); visual.textContent = symbol;
    element.append(visual);
    if (standalone && caption) {
      const text = document.createElement('span');
      text.className = 'content-control-caption';
      text.setAttribute('aria-hidden', 'true');
      text.textContent = caption;
      element.append(text);
    }
    element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); action(); });
    parent.append(element); return element;
  };
  const closeButton = button('content-close', 'Volver al mapa', '×', close, 'Volver al mapa');
  const previous = button('content-previous', 'Gráfico anterior', '←', () => goTo(slideIndex - 1), 'Anterior');
  const next = button('content-next', 'Gráfico siguiente', '→', () => goTo(slideIndex + 1), 'Siguiente');
  closeButton.setAttribute('aria-keyshortcuts', 'Escape');
  previous.setAttribute('aria-keyshortcuts', 'ArrowLeft');
  next.setAttribute('aria-keyshortcuts', 'ArrowRight');
  const zoomButtons = [];
  if (standalone) {
    const zoomControls = document.createElement('div');
    zoomControls.className = 'content-zoom';
    zoomControls.setAttribute('role', 'group');
    zoomControls.setAttribute('aria-label', 'Tamaño del gráfico');
    zoomButtons.push(
      button('content-zoom-out', 'Reducir el gráfico', '−', () => zoom(-.5), '', zoomControls),
      button('content-fit', 'Ajustar el gráfico a la ventana', 'Ajustar', home, '', zoomControls),
      button('content-zoom-in', 'Ampliar el gráfico', '+', () => zoom(.5), '', zoomControls)
    );
    controls.append(zoomControls);
    overlay.setAttribute('aria-labelledby', title.id);
  }
  if (standalone) overlay.append(heading, controls, stage);
  else overlay.append(stage, controls, status);
  container.append(overlay);

  const ready = fetch(assetUrl(manifestUrl)).then(response => {
    if (!response.ok) throw new Error('No se pudo cargar el contenido gráfico.');
    return response.json();
  }).then(data => {
    if (!Array.isArray(data.slides) || !data.slides.length) throw new Error('El contenido gráfico no tiene páginas.');
    manifest = data; return data;
  });
  // The caller awaits ready to display any error. A second handler prevents an
  // unhandled rejection if the map is closed before the manifest is requested.
  ready.catch(() => {});

  function info() {
    const page = slides[slideIndex];
    return { isOpen: opened, slideIndex, slideCount: slides.length, count: slides.length,
      sourcePage: page?.sourcePage ?? null, title: page?.title ?? '', reading: chart?.takeaway ?? page?.reading ?? '',
      scale: viewport.scale, offset: { x: viewport.x, y: viewport.y },
      canPrevious: opened && slideIndex > 0, canNext: opened && slideIndex < slides.length - 1 };
  }
  function emit(reason) { onChange({ reason, ...info() }); }
  function paint() {
    const artwork = chart ? vector : image;
    artwork.style.width = `${viewport.imageWidth * viewport.fit}px`;
    artwork.style.height = `${viewport.imageHeight * viewport.fit}px`;
    artwork.style.transform = `translate(-50%, -50%) translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    stage.dataset.zoomed = String(viewport.scale > 1.001);
    if (standalone) {
      const [reduce, fit, enlarge] = zoomButtons;
      const zoomed = viewport.scale > 1;
      const focused = document.activeElement;
      reduce.disabled = !zoomed;
      fit.disabled = !zoomed;
      stage.tabIndex = zoomed ? 0 : -1;
      if (!zoomed && [reduce, fit, stage].includes(focused)) enlarge.focus({ preventScroll: true });
    }
  }
  function resize(reset = false) {
    if (!opened) return;
    const page = slides[slideIndex];
    const width = stage.clientWidth || 1, height = stage.clientHeight || 1;
    const chartSize = chart ? CHART_SIZE : page;
    viewport = fitContentViewport({ width, height, imageWidth: chartSize.width || image.naturalWidth || 1,
      imageHeight: chartSize.height || image.naturalHeight || 1,
      scale: reset ? 1 : viewport.scale, x: reset ? 0 : viewport.x, y: reset ? 0 : viewport.y });
    paint();
  }
  function setPage() {
    const page = slides[slideIndex], generation = ++imageGeneration;
    const pageTitle = page.title || `Gráfico ${slideIndex + 1}`;
    chart = standalone ? createCouncilChart(page.chart, pageTitle) : null;
    unavailable.hidden = true;
    image.hidden = Boolean(chart);
    vector.hidden = !chart;
    chartNote.hidden = !chart?.note;
    chartNote.textContent = chart?.note ?? '';
    if (chart) {
      vector.replaceChildren(chart.svg);
      vector.setAttribute('aria-label', chart.description);
      image.onload = image.onerror = null;
      image.removeAttribute('src');
    } else {
      vector.replaceChildren();
      image.alt = page.description || pageTitle;
      image.onload = () => { if (!destroyed && generation === imageGeneration) resize(true); };
      image.onerror = () => {
        if (destroyed || generation !== imageGeneration || !opened) return;
        image.hidden = true;
        unavailable.hidden = false;
      };
      image.src = assetUrl(page.src);
    }
    // Reset before the new artwork is painted, including slow raster assets.
    resize(true);
    const focused = document.activeElement;
    previous.disabled = slideIndex === 0; next.disabled = slideIndex === slides.length - 1;
    if (standalone && ((focused === previous && previous.disabled) || (focused === next && next.disabled))) {
      const destination = previous.disabled ? (next.disabled ? closeButton : next) : previous;
      destination.focus({ preventScroll: true });
    }
    title.textContent = pageTitle;
    status.textContent = standalone ? `Gráfico ${slideIndex + 1} de ${slides.length}` : `${slideIndex + 1} de ${slides.length}: ${pageTitle}`;
  }
  function open(pages = manifest?.slides, index = 0) {
    if (destroyed) return false;
    if (!Array.isArray(pages) || !pages.length || pages.some(page => !page?.src)) return false;
    if (standalone && !opened) {
      returnFocus = document.activeElement;
      for (const element of container.children) {
        if (element !== overlay && !element.inert) {
          element.inert = true;
          mapElements.add(element);
        }
      }
    }
    slides = [...pages]; slideIndex = Math.min(slides.length - 1, Math.max(0, Math.trunc(index) || 0));
    opened = true; overlay.hidden = false; document.body.classList.add('content-open');
    container.setAttribute('data-content-open', 'true'); setPage(); emit('open');
    if (standalone) closeButton.focus({ preventScroll: true });
    return true;
  }
  function close() {
    if (!opened) return;
    opened = false; drag = null; overlay.hidden = true; document.body.classList.remove('content-open');
    container.removeAttribute('data-content-open'); emit('close');
    for (const element of mapElements) element.inert = false;
    mapElements.clear();
    if (standalone && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  function goTo(index) {
    if (!opened || index < 0 || index >= slides.length || index === slideIndex) return false;
    slideIndex = index; drag = null; setPage(); emit('slide'); return true;
  }
  function pan(dx, dy) {
    if (!opened) return;
    viewport = panContentViewport(viewport, dx, dy); paint(); emit('pan');
  }
  function zoom(delta, x = container.clientWidth / 2, y = container.clientHeight / 2) {
    if (!opened) return;
    const stageBox = stage.getBoundingClientRect(), box = container.getBoundingClientRect();
    viewport = zoomContentViewport(viewport, delta, x - stageBox.left + box.left, y - stageBox.top + box.top);
    paint(); emit('zoom');
  }
  function home() { if (opened) { resize(true); emit('home'); } }
  function targets() {
    if (!opened) return [];
    const box = container.getBoundingClientRect();
    return [previous, closeButton, next, ...zoomButtons].filter(element => !element.disabled && element.getClientRects().length).map(element => {
      const target = element.getBoundingClientRect();
      return { id: element.id, x: target.left + target.width / 2 - box.left, y: target.top + target.height / 2 - box.top,
        width: target.width, height: target.height, element, priority: 20 };
    });
  }
  function onPointerDown(event) {
    if (!opened || event.button !== 0) return;
    event.stopPropagation(); event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; stage.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event) {
    if (!drag || drag.id !== event.pointerId) return;
    event.stopPropagation(); pan(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX; drag.y = event.clientY;
  }
  function onPointerUp(event) { if (drag?.id === event.pointerId) { drag = null; stage.releasePointerCapture(event.pointerId); } }
  function onWheel(event) {
    if (!opened) return; event.preventDefault(); event.stopPropagation();
    const box = container.getBoundingClientRect();
    zoom(Math.max(-.5, Math.min(.5, -event.deltaY / 500)), event.clientX - box.left, event.clientY - box.top);
  }
  function onKeyDown(event) {
    if (!opened || document.querySelector('dialog[open]') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (standalone && event.target === stage && viewport.scale > 1) {
      const step = 48;
      const offset = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
      if (offset) { event.preventDefault(); pan(...offset); return; }
    }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(slideIndex - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(slideIndex + 1); }
  }
  // Stop Leaflet's map handlers without making the image or controls opaque
  // to the public DOM target checks used by hand selection.
  for (const type of ['pointerdown', 'mousedown', 'touchstart']) overlay.addEventListener(type, event => event.stopPropagation());
  overlay.addEventListener('click', event => event.stopPropagation());
  overlay.addEventListener('dblclick', event => event.stopPropagation());
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  overlay.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKeyDown);
  const observer = new ResizeObserver(() => resize()); observer.observe(stage);

  return { ready, get manifest() { return manifest; }, get isOpen() { return opened; }, open, close, pan, zoom, home, targets, info,
    destroy() { if (destroyed) return; close(); destroyed = true; imageGeneration++; image.onload = null; image.onerror = null;
      observer.disconnect(); document.removeEventListener('keydown', onKeyDown); overlay.remove(); }
  };
}

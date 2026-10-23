import { fitContentViewport, panContentViewport, zoomContentViewport } from './content-viewport.js';

export function createContentViewer(container, { onChange = () => {}, manifestUrl = '/content/manifest.json' } = {}) {
  let manifest = null, slides = [], slideIndex = 0, opened = false, destroyed = false;
  let viewport = fitContentViewport({ width: 1, height: 1, imageWidth: 1, imageHeight: 1 });
  let drag = null, imageGeneration = 0;
  const overlay = document.createElement('section');
  overlay.className = 'content-viewer'; overlay.hidden = true;
  overlay.setAttribute('aria-label', 'Gráficos del tema seleccionado');
  const stage = document.createElement('div'); stage.className = 'content-stage';
  const image = document.createElement('img'); image.className = 'content-image'; image.alt = ''; image.draggable = false;
  const status = document.createElement('span'); status.className = 'content-page-status'; status.setAttribute('aria-live', 'polite');
  stage.append(image);
  const controls = document.createElement('nav'); controls.className = 'content-controls'; controls.setAttribute('aria-label', 'Navegación de gráficos');
  const button = (id, label, symbol, action) => {
    const element = document.createElement('button'); element.type = 'button'; element.id = id;
    element.className = 'content-control'; element.setAttribute('aria-label', label); element.title = label;
    const visual = document.createElement('span'); visual.setAttribute('aria-hidden', 'true'); visual.textContent = symbol;
    element.append(visual); element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); action(); });
    controls.append(element); return element;
  };
  const previous = button('content-previous', 'Gráfico anterior', '←', () => goTo(slideIndex - 1));
  const closeButton = button('content-close', 'Volver al mapa', '×', close);
  const next = button('content-next', 'Gráfico siguiente', '→', () => goTo(slideIndex + 1));
  overlay.append(stage, controls, status); container.append(overlay);

  const ready = fetch(manifestUrl).then(response => {
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
    return { isOpen: opened, slideIndex, slideCount: slides.length, count: slides.length,
      sourcePage: slides[slideIndex]?.sourcePage ?? null, title: slides[slideIndex]?.title ?? '',
      scale: viewport.scale, offset: { x: viewport.x, y: viewport.y },
      canPrevious: opened && slideIndex > 0, canNext: opened && slideIndex < slides.length - 1 };
  }
  function emit(reason) { onChange({ reason, ...info() }); }
  function paint() {
    image.style.width = `${viewport.imageWidth * viewport.fit}px`;
    image.style.height = `${viewport.imageHeight * viewport.fit}px`;
    image.style.transform = `translate(-50%, -50%) translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    stage.dataset.zoomed = String(viewport.scale > 1.001);
  }
  function resize(reset = false) {
    if (!opened) return;
    const page = slides[slideIndex];
    const width = stage.clientWidth || 1, height = stage.clientHeight || 1;
    viewport = fitContentViewport({ width, height, imageWidth: page.width || image.naturalWidth || 1,
      imageHeight: page.height || image.naturalHeight || 1,
      scale: reset ? 1 : viewport.scale, x: reset ? 0 : viewport.x, y: reset ? 0 : viewport.y });
    paint();
  }
  function setPage() {
    const page = slides[slideIndex], generation = ++imageGeneration;
    // Reset the page's transform before loading so dimensions cannot carry
    // over from the previous page, including a slow image decode.
    viewport = fitContentViewport({ width: stage.clientWidth || 1, height: stage.clientHeight || 1,
      imageWidth: page.width || 1, imageHeight: page.height || 1 });
    image.alt = page.title || `Gráfico ${slideIndex + 1}`;
    image.onload = () => { if (!destroyed && generation === imageGeneration) resize(true); };
    image.src = page.src; paint();
    previous.disabled = slideIndex === 0; next.disabled = slideIndex === slides.length - 1;
    status.textContent = `${slideIndex + 1} de ${slides.length}: ${image.alt}`;
  }
  function open(pages = manifest?.slides, index = 0) {
    if (destroyed) return false;
    if (!Array.isArray(pages) || !pages.length || pages.some(page => !page?.src)) return false;
    slides = [...pages]; slideIndex = Math.min(slides.length - 1, Math.max(0, Math.trunc(index) || 0));
    opened = true; overlay.hidden = false; document.body.classList.add('content-open');
    container.setAttribute('data-content-open', 'true'); setPage(); emit('open'); return true;
  }
  function close() {
    if (!opened) return;
    opened = false; drag = null; overlay.hidden = true; document.body.classList.remove('content-open');
    container.removeAttribute('data-content-open'); emit('close');
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
    return [previous, closeButton, next].filter(element => !element.disabled && element.getClientRects().length).map(element => {
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
    if (!opened || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
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
    destroy() { if (destroyed) return; close(); destroyed = true; imageGeneration++; image.onload = null;
      observer.disconnect(); document.removeEventListener('keydown', onKeyDown); overlay.remove(); }
  };
}

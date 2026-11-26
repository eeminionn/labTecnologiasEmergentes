const pinchPixelsPerLevel = 56;
const scrollPixelsPerLevel = 96;
const gesturePauseMs = 125;

export function attachMapWheelZoom(map, container) {
  let frame = null;
  let idle = null;
  let delta = 0;
  let cursor = null;
  let anchor = null;
  let active = false;

  function applyZoom() {
    frame = null;
    const current = map.getZoom();
    const next = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), current + delta));
    delta = 0;
    if (current === next) return;

    if (!active) {
      // Use Leaflet's live pinch lifecycle. setZoomAround resets the tile grid
      // on every intermediate zoom when CSS zoom animation is disabled.
      map._stop();
      active = true;
      map._moveStart(true);
    }
    anchor ??= map.containerPointToLatLng(cursor);
    const offset = cursor.subtract(map.getSize().divideBy(2));
    const center = map.unproject(map.project(anchor, next).subtract(offset), next);
    map._move(center, next, { pinch: true });
  }

  function finish() {
    clearTimeout(idle);
    idle = null;
    if (frame !== null) {
      cancelAnimationFrame(frame);
      applyZoom();
    }
    cursor = anchor = null;
    if (!active) return;
    active = false;
    // Finish with the current viewport so the grid can switch to its final
    // resolution and prune tiles without invalidating its existing levels.
    map.fire('zoom');
    map._moveEnd(true);
  }

  function onWheel(event) {
    if (event.defaultPrevented || !event.deltaY || !Number.isFinite(event.deltaY)
      || Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) return;
    event.preventDefault();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1;
    const pixelsPerLevel = event.ctrlKey ? pinchPixelsPerLevel : scrollPixelsPerLevel;
    delta += Math.max(-1, Math.min(1, -event.deltaY * units / pixelsPerLevel));

    const position = map.mouseEventToContainerPoint(event);
    if (!cursor?.equals(position)) {
      cursor = position;
      anchor = null;
    }
    if (frame === null) frame = requestAnimationFrame(applyZoom);
    clearTimeout(idle);
    idle = setTimeout(finish, gesturePauseMs);
  }

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('pointerdown', finish, true);
  map.on('resize', finish);
  return {
    get active() { return active; },
    finish,
    destroy() {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', finish, true);
      map.off('resize', finish);
      clearTimeout(idle);
      if (frame !== null) cancelAnimationFrame(frame);
    }
  };
}

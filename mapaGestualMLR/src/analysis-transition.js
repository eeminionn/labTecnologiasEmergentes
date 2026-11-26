const unit = value => Math.max(0, Math.min(1, value));

/** Source-over weights: the two images keep the requested combined opacity. */
export function analysisBlendOpacity(opacity, progress) {
  const alpha = unit(opacity), fraction = unit(progress), next = alpha * fraction;
  return { next, previous: next === 1 ? 0 : alpha * (1 - fraction) / (1 - next) };
}

export function createAnalysisTransition({ opacity, durationMs = 2200, onFrame, onComplete = () => {},
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, now = () => performance.now() }) {
  const duration = Math.max(0, Math.min(3000, durationMs)), started = now();
  let running = true, frame = null;
  const apply = progress => onFrame(analysisBlendOpacity(opacity, progress));
  function cancel() { if (!running) return; running = false; if (frame !== null) cancelFrame(frame); frame = null; }
  function finish() { if (!running) return; cancel(); apply(1); onComplete(); }
  function tick() {
    if (!running) return;
    frame = null;
    const progress = unit((now() - started) / duration);
    if (progress >= 1) { finish(); return; }
    apply(progress * progress * (3 - 2 * progress));
    if (running) frame = requestFrame(tick);
  }
  apply(0);
  if (duration === 0) finish(); else frame = requestFrame(tick);
  return { cancel, finish, get running() { return running; } };
}

/** Provider-independent ownership of at most two security raster layers. */
export function createAnalysisRasterTransition({ createLayer, onError = () => {}, frameOptions = {} }) {
  let visible = false, destroyed = false, generation = 0, current = null, previous = null, transition = null, spec = null, controlled = null;
  const remove = entry => { if (entry?.layer) { const layer = entry.layer; entry.layer = null; layer.destroy(); } };
  function cancelAnimation() { transition?.cancel(); transition = null; }
  function removePrevious() { remove(previous); previous = null; }
  function settleReplacement() {
    cancelAnimation();
    // If the incoming image is still loading, the previous ready image remains
    // the only useful starting point for a newer request.
    if (!current?.loaded && previous?.loaded) { remove(current); current = previous; previous = null; }
    else removePrevious();
    if (current?.layer) current.layer.setOpacity(current.spec.opacity);
  }
  function loaded(entry, token) {
    if (destroyed || generation !== token || current !== entry || !entry.layer) return;
    entry.loaded = true;
    if (!previous || !visible || !entry.spec.transitionMs) {
      entry.layer.setOpacity(entry.spec.opacity); removePrevious(); return;
    }
    const old = previous;
    transition = createAnalysisTransition({ ...frameOptions, opacity: entry.spec.opacity, durationMs: entry.spec.transitionMs,
      onFrame: weights => {
        if (destroyed || generation !== token || current !== entry) return;
        old.layer?.setOpacity(weights.previous); entry.layer?.setOpacity(weights.next);
      },
      onComplete: () => {
        if (destroyed || generation !== token || current !== entry) return;
        removePrevious(); transition = null;
      }
    });
  }
  function set(next) {
    if (destroyed) return;
    leaveControlled();
    generation++; settleReplacement(); spec = next;
    if (!spec) { remove(current); current = null; return; }
    if (current?.loaded) previous = current; else remove(current);
    const token = generation, entry = { spec, loaded: false, layer: null };
    current = entry;
    entry.layer = createLayer(spec, () => loaded(entry, token), () => {
      if (!destroyed && generation === token && current === entry) onError();
    });
    entry.layer.setOpacity(previous ? 0 : spec.opacity);
    previous?.layer?.setOpacity(spec.opacity);
    if (visible) entry.layer.show();
  }
  const sameSpec = (first, second) => first.url === second.url
    && first.bounds.every((point, i) => point.every((coordinate, j) => coordinate === second.bounds[i][j]));
  const sameRaster = (entry, value) => !!entry && sameSpec(entry.spec, value);
  const controlledEntries = () => controlled ? [...new Set([controlled.from, controlled.to, controlled.fallback].filter(Boolean))] : [];
  function leaveControlled() {
    if (!controlled) return;
    const entries = controlledEntries(), preferred = controlled.progress < .5 ? controlled.from : controlled.to;
    const keep = preferred?.loaded ? preferred : entries.find(entry => entry.loaded);
    const opacity = controlled.opacity;
    entries.forEach(entry => { if (entry !== keep) remove(entry); });
    controlled = null; current = keep || null; previous = null;
    if (current) { current.spec = { ...current.spec, opacity }; current.layer.setOpacity(opacity); }
  }
  function applyControlled() {
    if (!controlled) return;
    const c = controlled, ready = c.from?.loaded && c.to?.loaded;
    if (ready) {
      if (!c.ordered && visible) {
        // A backward seek can reuse the former bottom image as the top image.
        // Re-adding in order keeps source-over weights correct in both maps.
        c.from.layer.hide(); c.from.layer.show();
        if (c.to !== c.from) { c.to.layer.hide(); c.to.layer.show(); }
        c.ordered = true;
      }
      if (c.from === c.to) c.from.layer.setOpacity(c.opacity);
      else {
        const weights = analysisBlendOpacity(c.opacity, c.progress);
        c.from.layer.setOpacity(weights.previous); c.to.layer.setOpacity(weights.next);
      }
    } else {
      const shown = controlledEntries().find(entry => entry.loaded);
      controlledEntries().forEach(entry => entry.layer.setOpacity(entry === shown ? c.opacity : 0));
    }
  }
  function advanceControlled() {
    if (!controlled || destroyed) return;
    const c = controlled;
    if (c.fallback && (c.from?.loaded || c.to?.loaded)) { remove(c.fallback); c.fallback = null; }
    for (const key of ['from', 'to']) {
      if (c[key]) continue;
      const value = c[`${key}Spec`], match = controlledEntries().find(entry => sameRaster(entry, value));
      if (match) { c[key] = match; continue; }
      if (controlledEntries().length >= 2) continue;
      const entry = { spec: { ...value, opacity: c.opacity }, loaded: false, layer: null };
      c[key] = entry;
      entry.layer = createLayer(entry.spec, () => {
        if (destroyed || !entry.layer || !controlledEntries().includes(entry)) return;
        entry.loaded = true; advanceControlled();
      }, () => { if (!destroyed && entry.layer && controlledEntries().includes(entry)) onError(); });
      entry.layer.setOpacity(0); if (visible) entry.layer.show();
    }
    applyControlled();
  }
  function setFrame(value) {
    if (destroyed) return;
    if (!value) { set(null); return; }
    const opacity = unit(value.opacity ?? .62), progress = unit(value.progress ?? 0);
    spec = { ...value.to, opacity, transitionMs: 0 };
    if (controlled && sameSpec(controlled.fromSpec, value.from) && sameSpec(controlled.toSpec, value.to)) {
      controlled.opacity = opacity; controlled.progress = progress; applyControlled(); return;
    }
    generation++; cancelAnimation();
    const pool = controlled ? controlledEntries() : [current, previous].filter(Boolean);
    // Legacy pending loads carry callbacks for their old owner, so retain only
    // ready legacy images. Controlled pending loads can be reused safely.
    const usable = pool.filter(entry => entry.layer && (controlled || entry.loaded));
    const from = usable.find(entry => sameRaster(entry, value.from)) || null;
    const to = usable.find(entry => sameRaster(entry, value.to)) || null;
    const fallback = !from?.loaded && !to?.loaded ? usable.find(entry => entry.loaded && entry !== from && entry !== to) || null : null;
    const kept = new Set([from, to, fallback].filter(Boolean));
    pool.forEach(entry => { if (!kept.has(entry)) remove(entry); });
    current = null; previous = null;
    controlled = { fromSpec: value.from, toSpec: value.to, from, to, fallback, opacity, progress, ordered: false };
    advanceControlled();
  }
  function setVisible(value) {
    if (destroyed) return false;
    if (controlled) {
      visible = value === true;
      controlledEntries().forEach(entry => entry.layer[visible ? 'show' : 'hide']());
      controlled.ordered = false; applyControlled(); return visible;
    }
    visible = value === true; cancelAnimation(); removePrevious();
    if (current?.layer) {
      current.layer.setOpacity(current.spec.opacity);
      current.layer[visible ? 'show' : 'hide']();
    }
    return visible;
  }
  function setOpacity(value) {
    if (destroyed || !spec || !Number.isFinite(value)) return false;
    if (controlled) { controlled.opacity = spec.opacity = unit(value); applyControlled(); return true; }
    spec.opacity = unit(value); cancelAnimation();
    if (current?.loaded) { current.layer.setOpacity(spec.opacity); removePrevious(); }
    else {
      // An opacity edit must not let an old animation restore stale values.
      spec.transitionMs = 0;
      current?.layer?.setOpacity(previous ? 0 : spec.opacity);
      previous?.layer?.setOpacity(spec.opacity);
    }
    return true;
  }
  return {
    set, setFrame, setVisible, setOpacity,
    info() { if (controlled) { const ready = !!controlled.from?.loaded && !!controlled.to?.loaded;
      return { spec, loaded: visible && ready, visible: visible && controlledEntries().length > 0,
        transitioning: visible && ready && controlled.from !== controlled.to && controlled.progress > 0 && controlled.progress < 1 };
    } return { spec, loaded: visible && !!current?.loaded && !previous && !transition?.running,
      visible: visible && !!current?.layer, transitioning: visible && !!transition?.running }; },
    destroy() {
      if (destroyed) return;
      destroyed = true; generation++; cancelAnimation(); controlledEntries().forEach(remove); controlled = null;
      removePrevious(); remove(current); current = null; spec = null;
    }
  };
}

export const ANALYSIS_PLAYBACK_PERIODS = Object.freeze(['madrugada', 'manana', 'tarde', 'noche']);

/** A continuous, seekable day; one rendered cycle lasts twelve seconds. */
export function createAnalysisPlayback({
  onFrame = () => {}, onStateChange = () => {}, durationMs = 12000,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  now = () => performance.now()
} = {}) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError('La duración de reproducción debe ser positiva.');
  let playing = false, destroyed = false, position = 0, startedAt = 0, startedPosition = 0, frame = null, generation = 0;
  function info() {
    const phase = position === 1 ? 0 : position * ANALYSIS_PLAYBACK_PERIODS.length;
    const index = Math.floor(phase);
    return { playing, position, durationMs, period: ANALYSIS_PLAYBACK_PERIODS[index],
      nextPeriod: ANALYSIS_PLAYBACK_PERIODS[(index + 1) % ANALYSIS_PLAYBACK_PERIODS.length],
      mix: phase - index, elapsedMs: position * durationMs };
  }
  const current = token => !destroyed && playing && generation === token;
  function cancelPending() { if (frame !== null) cancelFrame(frame); frame = null; }
  function updateTime() {
    if (playing) position = (startedPosition + Math.max(0, now() - startedAt) / durationMs) % 1;
  }
  function schedule(token) {
    if (!current(token) || frame !== null) return;
    frame = requestFrame(() => {
      if (!current(token)) return;
      frame = null; updateTime(); onFrame(info()); schedule(token);
    });
  }
  function start(currentPeriod) {
    if (destroyed) return false;
    if (playing) return true;
    if (currentPeriod !== undefined) {
      const index = currentPeriod === 'all' ? 0 : ANALYSIS_PLAYBACK_PERIODS.indexOf(currentPeriod);
      if (index < 0) return false;
      position = index / ANALYSIS_PLAYBACK_PERIODS.length;
    }
    if (position === 1) position = 0;
    startedAt = now(); startedPosition = position; playing = true;
    const token = ++generation;
    onFrame(info());
    if (!current(token)) return false;
    onStateChange(info()); schedule(token); return current(token);
  }
  function pause() {
    if (destroyed || !playing) return false;
    updateTime(); playing = false; generation++; cancelPending();
    onFrame(info());
    if (!destroyed) onStateChange(info());
    return true;
  }
  function seek(value) {
    if (destroyed || !Number.isFinite(value)) return false;
    playing = false; generation++; cancelPending(); position = Math.max(0, Math.min(1, value));
    onFrame(info());
    if (!destroyed) onStateChange(info());
    return true;
  }
  return {
    info, start, pause, seek,
    toggle() { return playing ? pause() : start(); },
    reset(currentPeriod = 'all') {
      const index = currentPeriod === 'all' ? 0 : ANALYSIS_PLAYBACK_PERIODS.indexOf(currentPeriod);
      return index < 0 ? false : seek(index / ANALYSIS_PLAYBACK_PERIODS.length);
    },
    destroy() {
      if (destroyed) return;
      updateTime(); destroyed = true; playing = false; generation++; cancelPending();
    }
  };
}

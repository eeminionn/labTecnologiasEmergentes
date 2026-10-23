const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// All values are CSS pixels. Zoom 1 always displays the entire source page.
export function fitContentViewport({ width, height, imageWidth, imageHeight, scale = 1, x = 0, y = 0 }) {
  const valid = [width, height, imageWidth, imageHeight].every(value => Number.isFinite(value) && value > 0);
  const fit = valid ? Math.min(width / imageWidth, height / imageHeight) : 1;
  return constrainContentViewport({ width, height, imageWidth, imageHeight, fit, scale, x, y });
}

export function constrainContentViewport(state) {
  const scale = clamp(Number.isFinite(state.scale) ? state.scale : 1, 1, 6);
  const horizontal = Math.max(0, (state.imageWidth * state.fit * scale - state.width) / 2);
  const vertical = Math.max(0, (state.imageHeight * state.fit * scale - state.height) / 2);
  return { ...state, scale, x: clamp(state.x || 0, -horizontal, horizontal), y: clamp(state.y || 0, -vertical, vertical) };
}

export function panContentViewport(state, dx, dy) {
  if (![dx, dy].every(Number.isFinite)) return state;
  return constrainContentViewport({ ...state, x: state.x + dx, y: state.y + dy });
}

export function zoomContentViewport(state, delta, anchorX = state.width / 2, anchorY = state.height / 2) {
  if (![delta, anchorX, anchorY].every(Number.isFinite)) return state;
  const scale = clamp(state.scale * 2 ** delta, 1, 6);
  const factor = scale / state.scale;
  const relativeX = anchorX - state.width / 2;
  const relativeY = anchorY - state.height / 2;
  return constrainContentViewport({ ...state, scale,
    x: relativeX - (relativeX - state.x) * factor,
    y: relativeY - (relativeY - state.y) * factor });
}

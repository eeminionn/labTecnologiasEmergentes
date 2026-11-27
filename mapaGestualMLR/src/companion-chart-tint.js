// Preserve the manual's discrete tint steps and keep smaller bars legible on white.
export function chartTint(value, maximum, family = 'tema') {
  const ratio = maximum > 0 ? Math.max(0, Math.min(1, value / maximum)) : 0;
  const step = Math.round(4 + 6 * ratio) * 10;
  return `var(--${family}-${step})`;
}

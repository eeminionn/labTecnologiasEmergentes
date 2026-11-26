import { projectSecurityPoint } from './analysis-data.js';

export const FORECAST_YEARS = Object.freeze(['2027']);
export const FORECAST_ASSUMPTIONS = Object.freeze({
  none: Object.freeze({ label: 'Sin efecto', camera: 0, fixed: 0, cap: 0 }),
  conservative: Object.freeze({ label: 'Conservador', camera: .12, fixed: .10, cap: .25 }),
  illustrative: Object.freeze({ label: 'Ilustrativo', camera: .30, fixed: .38, cap: .62 })
});
export const FORECAST_METHODS = Object.freeze({
  previous: 'Persistencia del último año',
  average: 'Promedio de los últimos dos años',
  network: 'Red neuronal espaciotemporal',
  smoothed: 'Promedio histórico suavizado'
});

export const FORECAST_REACH_METRES = Object.freeze({ camera: 350, fixed: 550 });
const isCount = value => Number.isFinite(value) && value >= 0;

export function readForecastArtifact(artifact) {
  const { schema, width, height, bounds, projectedBounds, mask, years, max, validation } = artifact ?? {};
  const validDimensions = [width, height].every(size => Number.isInteger(size) && size >= 2 && size <= 256);
  const isCoordinatePair = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
  if (schema !== 1 || !validDimensions || !Array.isArray(bounds) || bounds.length !== 2
    || !bounds.every(isCoordinatePair) || !Array.isArray(projectedBounds) || projectedBounds.length !== 4
    || !projectedBounds.every(Number.isFinite) || !Number.isFinite(max) || max <= 0
    || projectedBounds[0] >= projectedBounds[2] || projectedBounds[1] >= projectedBounds[3]
    || !Array.isArray(mask) || mask.length !== width * height || !mask.every(value => value === 0 || value === 1)
    || !Object.hasOwn(FORECAST_METHODS, validation?.selectedMethod)) {
    throw new Error('El modelo territorial no tiene el formato esperado.');
  }
  for (const year of FORECAST_YEARS) {
    const counts = years?.[year];
    if (!Array.isArray(counts) || counts.length !== mask.length || !counts.every(isCount)) {
      throw new Error(`Falta la estimación territorial de ${year}.`);
    }
  }
  const methods = new Set(['previous', 'average', 'network', validation.selectedMethod]);
  if (validation.metrics?.smoothed) methods.add('smoothed');
  for (const method of methods) {
    const metrics = validation.metrics?.[method];
    if (![metrics?.mae, metrics?.wape, metrics?.hotspotRecall].every(isCount)) {
      throw new Error('Faltan resultados de validación del modelo territorial.');
    }
  }
  return artifact;
}

/** Smooths only the displayed heat. The quantitative estimates remain counts per cell. */
export function smoothForecastCounts(counts, width, height) {
  const values = new Float32Array(counts.length);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      let weighted = 0, weights = 0;
      for (let y = Math.max(0, row - 1); y <= Math.min(height - 1, row + 1); y++) {
        for (let x = Math.max(0, column - 1); x <= Math.min(width - 1, column + 1); x++) {
          const weight = (x === column ? 2 : 1) * (y === row ? 2 : 1);
          weighted += counts[y * width + x] * weight;
          weights += weight;
        }
      }
      values[row * width + column] = weighted / weights;
    }
  }
  return values;
}

function projectedPoint({ lat, lng } = {}) {
  return [lng, lat].every(Number.isFinite) && Math.abs(lat) < 85.05112878 && Math.abs(lng) <= 180
    ? projectSecurityPoint(lng, lat) : null;
}

export function buildForecastSurface(model, { year, placements = [], assumption = 'illustrative' } = {}) {
  const { width, height, bounds, projectedBounds, max, mask, years } = model;
  if (!Object.hasOwn(years, year) || !Object.hasOwn(FORECAST_ASSUMPTIONS, assumption)) {
    throw new Error('El escenario de proyección no es válido.');
  }
  const baseline = years[year];
  const preset = FORECAST_ASSUMPTIONS[assumption];
  const [west, south, east, north] = projectedBounds;
  const stepX = (east - west) / width, stepY = (north - south) / height;
  const groundScale = Math.cos((bounds[0][0] + bounds[1][0]) * Math.PI / 360);
  const remaining = new Float64Array(baseline.length).fill(1);
  const minimumRemaining = 1 - preset.cap;
  // Visit only the cells within reach of each placement. This keeps repeated
  // installations from multiplying a full-grid pass per placement.
  for (const placement of placements) {
    const { kind } = placement;
    if (!Object.hasOwn(FORECAST_REACH_METRES, kind) || !preset[kind]) continue;
    const coordinate = projectedPoint(placement);
    if (!coordinate) continue;
    const [x, y] = coordinate;
    if (x < west || x > east || y < south || y > north) continue;
    const radius = FORECAST_REACH_METRES[kind] / groundScale;
    const firstColumn = Math.max(0, Math.ceil((x - radius - west) / stepX - .5));
    const lastColumn = Math.min(width - 1, Math.floor((x + radius - west) / stepX - .5));
    const firstRow = Math.max(0, Math.ceil((north - y - radius) / stepY - .5));
    const lastRow = Math.min(height - 1, Math.floor((north - y + radius) / stepY - .5));
    for (let row = firstRow; row <= lastRow; row++) {
      const dy = (north - (row + .5) * stepY - y) / radius;
      for (let column = firstColumn; column <= lastColumn; column++) {
        const index = row * width + column;
        if (!baseline[index] || remaining[index] <= minimumRemaining) continue;
        const dx = (west + (column + .5) * stepX - x) / radius;
        const weight = Math.max(0, 1 - dx ** 2 - dy ** 2) ** 2;
        remaining[index] = Math.max(minimumRemaining, remaining[index] * (1 - preset[kind] * weight));
      }
    }
  }
  const scenario = baseline.map((count, index) => count * remaining[index]);
  const baselineTotal = baseline.reduce((sum, count) => sum + count, 0);
  const scenarioTotal = scenario.reduce((sum, count) => sum + count, 0);
  return {
    values: smoothForecastCounts(scenario, width, height), width, height, bounds, projectedBounds, max, mask,
    colorExponent: 1.25,
    baseline, scenario, baselineTotal, scenarioTotal,
    reduction: baselineTotal ? (baselineTotal - scenarioTotal) / baselineTotal : 0
  };
}

export function forecastAt(surface, point) {
  const coordinate = projectedPoint(point);
  if (!coordinate) return null;
  const [x, y] = coordinate;
  const [west, south, east, north] = surface.projectedBounds;
  if (x < west || x > east || y < south || y > north) return null;
  const column = Math.min(surface.width - 1, Math.floor((x - west) / (east - west) * surface.width));
  const row = Math.min(surface.height - 1, Math.floor((north - y) / (north - south) * surface.height));
  const index = row * surface.width + column;
  if (!surface.mask[index]) return null;
  const baseline = surface.baseline[index], scenario = surface.scenario[index];
  return { baseline, scenario, reduction: baseline ? (baseline - scenario) / baseline : 0 };
}

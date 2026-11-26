import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDensitySurface, parseSecurityCSV, pointInsideBoundary, projectSecurityPoint } from '../src/analysis-data.js';
import { FORECAST_YEARS, smoothForecastCounts } from '../src/analysis-forecast.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const boundary = JSON.parse(read('../assets/la-reina.geojson'));
const records = parseSecurityCSV(read('../public/analysis/seguridad-simulada.csv'));
const geometry = buildDensitySurface([], boundary, { width: 36, height: 16 });
const { width, height, bounds, projectedBounds } = geometry;
const [west, south, east, north] = projectedBounds;
const stepX = (east - west) / width, stepY = (north - south) / height;
const latitude = y => Math.atan(Math.sinh(y / 6378137)) * 180 / Math.PI;
const longitude = x => x / 6378137 * 180 / Math.PI;
const cellCount = width * height;
const mask = Array.from({ length: cellCount }, (_, index) => {
  const row = Math.floor(index / width), column = index % width;
  return [0, .5, 1].some(dx => [0, .5, 1].some(dy =>
    pointInsideBoundary(longitude(west + (column + dx) * stepX), latitude(north - (row + dy) * stepY), boundary)));
});
const cells = mask.flatMap((inside, index) => inside ? [index] : []);
const months = Array.from({ length: 36 }, () => Array(cellCount).fill(0));
for (const { fecha, lat, lng } of records) {
  const month = (Number(fecha.slice(0, 4)) - 2023) * 12 + Number(fecha.slice(5, 7)) - 1;
  const counts = months[month];
  if (!counts || !pointInsideBoundary(lng, lat, boundary)) continue;
  const [x, y] = projectSecurityPoint(lng, lat);
  const column = Math.min(width - 1, Math.max(0, Math.floor((x - west) / stepX)));
  const row = Math.min(height - 1, Math.max(0, Math.floor((north - y) / stepY)));
  const index = row * width + column;
  if (!mask[index]) throw new Error(`La celda ${index} con incidentes quedó fuera de la máscara.`);
  counts[index]++;
}

const sum = values => values.reduce((total, value) => total + value, 0);
const countsByYear = Object.fromEntries([2023, 2024, 2025].map((year, index) => {
  const yearMonths = months.slice(index * 12, (index + 1) * 12);
  return [year, Array.from({ length: cellCount }, (_, cell) => yearMonths.reduce((total, month) => total + month[cell], 0))];
}));
const [first, second, heldOut] = [2023, 2024, 2025].map(year => countsByYear[year]);
const annualTotals = Object.fromEntries(Object.entries(countsByYear).map(([year, counts]) => [year, sum(counts)]));
const trainer = fileURLToPath(new URL('./train-spatiotemporal-forecast.py', import.meta.url));
const trained = JSON.parse(execFileSync(process.env.MLR_PYTHON || 'python3', [trainer], {
  input: JSON.stringify({ width, height, months, mask, years: FORECAST_YEARS }),
  encoding: 'utf8'
}));
const average = (a, b) => a.map((value, index) => (value + b[index]) / 2);
const withTotal = (values, total) => {
  const scale = total / sum(values);
  return values.map(value => value * scale);
};
const smoothed = counts => withTotal(Array.from(smoothForecastCounts(counts, width, height), (count, index) =>
  mask[index] ? count : 0), sum(counts));
const pooled = average(first, second);
const validationBaseline = {
  previous: second,
  average: pooled,
  smoothed: smoothed(pooled),
  network: trained.heldOut
};
function accuracy(predicted, actual) {
  const errors = cells.map(index => Math.abs(predicted[index] - actual[index]));
  const topCount = Math.ceil(cells.length * .1);
  const highest = values => [...cells].sort((a, b) => values[b] - values[a] || a - b).slice(0, topCount);
  const actualHotspots = new Set(highest(actual));
  return {
    mae: Number((sum(errors) / cells.length).toFixed(2)),
    wape: Number((sum(errors) / sum(actual)).toFixed(4)),
    hotspotRecall: Number((highest(predicted).filter(index => actualHotspots.has(index)).length / topCount).toFixed(4))
  };
}
const metrics = Object.fromEntries(Object.entries(validationBaseline).map(([id, prediction]) => [id, accuracy(prediction, heldOut)]));
const selectedMethod = Object.keys(metrics).reduce((best, id) => metrics[id].mae < metrics[best].mae ? id : best, 'previous');
// The 2025 observations enter only after the backtest, for deployment.
const deployment = {
  previous: heldOut,
  average: average(second, heldOut),
  smoothed: smoothed(average(second, heldOut))
};
const precision = value => Number(value.toFixed(4));
const years = Object.fromEntries(FORECAST_YEARS.map(year => [
  year, (selectedMethod === 'network' ? trained.future[year] : deployment[selectedMethod]).map(precision)
]));
const max = Math.max(...Object.values(years).flatMap(counts => Array.from(smoothForecastCounts(counts, width, height))));
const artifact = {
  schema: 1, width, height, bounds, projectedBounds, mask: mask.map(Number), max: precision(max), years,
  validation: {
    trainingYears: [2023, 2024], heldOutYear: 2025, cells: cells.length, annualTotals,
    selectedMethod, metrics
  },
  network: trained.network
};
writeFileSync(new URL('../public/analysis/pronostico-robos.json', import.meta.url), JSON.stringify(artifact) + '\n');
console.log(JSON.stringify(artifact.validation, null, 2));

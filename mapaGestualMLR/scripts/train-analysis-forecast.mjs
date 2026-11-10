import { readFileSync, writeFileSync } from 'node:fs';
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
const countsByYear = Object.fromEntries([2023, 2024, 2025].map(year => [year, Array(cellCount).fill(0)]));
for (const { fecha, lat, lng } of records) {
  const counts = countsByYear[fecha.slice(0, 4)];
  if (!counts || !pointInsideBoundary(lng, lat, boundary)) continue;
  const [x, y] = projectSecurityPoint(lng, lat);
  const column = Math.min(width - 1, Math.max(0, Math.floor((x - west) / stepX)));
  const row = Math.min(height - 1, Math.max(0, Math.floor((north - y) / stepY)));
  const index = row * width + column;
  if (!mask[index]) throw new Error(`La celda ${index} con incidentes quedó fuera de la máscara.`);
  counts[index]++;
}

const sum = values => values.reduce((total, value) => total + value, 0);
function localMean(counts, index, radius) {
  const row = Math.floor(index / width), column = index % width;
  let total = 0, n = 0;
  for (let y = Math.max(0, row - radius); y <= Math.min(height - 1, row + radius); y++) {
    for (let x = Math.max(0, column - radius); x <= Math.min(width - 1, column + radius); x++) {
      const neighbor = y * width + x;
      if (mask[neighbor]) { total += counts[neighbor]; n++; }
    }
  }
  return total / n;
}
function features(counts, index) {
  // All inputs are available before the year being predicted.
  return [counts[index], localMean(counts, index, 1), localMean(counts, index, 2)]
    .map(count => Math.log1p(count) / 7);
}
function trainNetwork(inputs, targets) {
  const hiddenSize = 8;
  let seed = 715234;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296 - .5) * .6;
  const weights = Array.from({ length: hiddenSize }, () => Array.from({ length: inputs[0].length + 1 }, random));
  const outputWeights = Array.from({ length: hiddenSize + 1 }, random);
  const meanTarget = sum(targets) / targets.length;
  outputWeights[hiddenSize] = meanTarget;
  function forward(input) {
    const activations = weights.map(row => Math.tanh(row[0] * input[0] + row[1] * input[1] + row[2] * input[2] + row[3]));
    return [activations, outputWeights[hiddenSize] + sum(activations.map((value, index) => value * outputWeights[index]))];
  }
  // Squared error in log count limits the influence of the largest hotspots.
  // Fixed architecture, learning rate and seed keep the fit reproducible.
  for (let epoch = 0; epoch < 1200; epoch++) {
    const outputGradient = outputWeights.map(() => 0);
    const hiddenGradient = weights.map(row => row.map(() => 0));
    for (const [i, input] of inputs.entries()) {
      const [activations, predicted] = forward(input);
      const error = predicted - targets[i];
      outputGradient[hiddenSize] += error;
      for (let unit = 0; unit < hiddenSize; unit++) {
        const activation = activations[unit];
        outputGradient[unit] += error * activation;
        const gradient = error * outputWeights[unit] * (1 - activation ** 2);
        for (let j = 0; j < input.length; j++) hiddenGradient[unit][j] += gradient * input[j];
        hiddenGradient[unit][input.length] += gradient;
      }
    }
    const rate = .06 / inputs.length;
    outputWeights.forEach((weight, i) => { outputWeights[i] = weight - rate * outputGradient[i]; });
    weights.forEach((row, i) => row.forEach((weight, j) => { row[j] = weight - rate * hiddenGradient[i][j]; }));
  }
  return {
    weights, outputWeights,
    predict: input => Math.max(0, Math.expm1(forward(input)[1] * 7))
  };
}

const [first, second, heldOut] = [2023, 2024, 2025].map(year => countsByYear[year]);
const annualTotals = Object.fromEntries(Object.entries(countsByYear).map(([year, counts]) => [year, sum(counts)]));
if (Object.values(annualTotals).some(total => total === 0)) throw new Error('Falta un año de entrenamiento o validación.');
const network = trainNetwork(cells.map(index => features(first, index)), cells.map(index => Math.log1p(second[index]) / 7));
const forecastNetwork = counts => mask.map((inside, index) => inside ? network.predict(features(counts, index)) : 0);
const average = (a, b) => a.map((value, index) => (value + b[index]) / 2);
const growth = Math.max(.97, Math.min(1.03, annualTotals[2024] / annualTotals[2023]));
const withTotal = (values, total) => {
  const scale = total / sum(values);
  return values.map(value => value * scale);
};
const validationBaseline = {
  previous: second,
  average: average(first, second),
  network: withTotal(forecastNetwork(second), annualTotals[2024] * growth)
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
// The 2025 observations enter only after the backtest, as the latest input.
const deployment = {
  previous: heldOut,
  average: average(second, heldOut),
  network: forecastNetwork(heldOut)
};
const precision = value => Number(value.toFixed(4));
const years = Object.fromEntries(FORECAST_YEARS.map(year => [
  year, withTotal(deployment[selectedMethod], annualTotals[2025] * growth ** (Number(year) - 2025)).map(precision)
]));
const max = Math.max(...Object.values(years).flatMap(counts => Array.from(smoothForecastCounts(counts, width, height))));
const artifact = {
  schema: 1, width, height, bounds, projectedBounds, mask: mask.map(Number), max: precision(max), years,
  validation: {
    trainingYears: [2023, 2024], heldOutYear: 2025, cells: cells.length, annualTotals,
    selectedMethod, metrics, growth: Number(growth.toFixed(8))
  },
  network: { inputs: ['count', 'mean3x3', 'mean5x5'], hidden: 'tanh', epochs: 1200, weights: network.weights, outputWeights: network.outputWeights }
};
writeFileSync(new URL('../public/analysis/pronostico-robos.json', import.meta.url), JSON.stringify(artifact) + '\n');
console.log(JSON.stringify(artifact.validation, null, 2));

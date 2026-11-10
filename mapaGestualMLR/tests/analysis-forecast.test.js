import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FORECAST_ASSUMPTIONS, FORECAST_YEARS, buildForecastSurface, forecastAt, readForecastArtifact
} from '../src/analysis-forecast.js';

const source = JSON.parse(readFileSync(new URL('../public/analysis/pronostico-robos.json', import.meta.url), 'utf8'));
const model = readForecastArtifact(source);
const year = '2027';
function cellCenter(index) {
  const [west, south, east, north] = model.projectedBounds;
  const x = west + (index % model.width + .5) * (east - west) / model.width;
  const y = north - (Math.floor(index / model.width) + .5) * (north - south) / model.height;
  return { lng: x / 6378137 * 180 / Math.PI, lat: Math.atan(Math.sinh(y / 6378137)) * 180 / Math.PI };
}

test('la evaluación reserva 2025 y activa el método con menor error por celda', () => {
  const { trainingYears, heldOutYear, selectedMethod, metrics } = model.validation;
  assert.deepEqual(trainingYears, [2023, 2024]);
  assert.equal(heldOutYear, 2025);
  assert.equal(metrics[selectedMethod].mae, Math.min(...Object.values(metrics).map(result => result.mae)));
  assert.equal(model.network.developmentCutoff, '2023-12');
  assert.equal(model.network.trainedThrough, '2025-12');
  assert.deepEqual(Object.keys(model.years), [year]);
  assert.throws(() => readForecastArtifact({ ...source, years: {} }));
});

test('el escenario mantiene la escala cromática y admite un control sin efecto', () => {
  const baseline = buildForecastSurface(model, { year });
  const hotspot = baseline.baseline.indexOf(Math.max(...baseline.baseline));
  const point = cellCenter(hotspot);
  const placements = [{ ...point, kind: 'camera' }, { ...point, kind: 'fixed' }];
  const noEffect = buildForecastSurface(model, { year, placements, assumption: 'none' });
  assert.deepEqual(noEffect.values, baseline.values);
  assert.equal(noEffect.reduction, 0);
  assert.equal(forecastAt(noEffect, point).baseline, forecastAt(noEffect, point).scenario);
  assert.deepEqual(FORECAST_YEARS, [year]);
  assert.equal(noEffect.max, baseline.max);
  assert.equal(forecastAt(baseline, { lat: 0, lng: 0 }), null);
});

test('la intervención actúa localmente y varias instalaciones respetan el límite', () => {
  const baseline = buildForecastSurface(model, { year });
  const hotspot = baseline.baseline.indexOf(Math.max(...baseline.baseline));
  const point = cellCenter(hotspot), placement = { ...point, kind: 'fixed' };
  const one = buildForecastSurface(model, { year, placements: [placement] });
  const many = buildForecastSurface(model, { year, placements: Array(10).fill(placement) });
  assert.equal(many.max, baseline.max);
  assert.ok(one.scenarioTotal < baseline.scenarioTotal);
  assert.ok(many.scenarioTotal < one.scenarioTotal);
  assert.ok(Math.abs(forecastAt(many, point).reduction - FORECAST_ASSUMPTIONS.illustrative.cap) < 1e-9);
  assert.ok(many.scenario.every((value, index) => value >= 0 && value <= baseline.baseline[index]));
  assert.ok(baseline.baseline.some((value, index) => value > 0 && many.scenario[index] === value));
});

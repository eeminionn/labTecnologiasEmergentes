export const CHART_SIZE = { width: 920, height: 470 };

const svgNamespace = 'http://www.w3.org/2000/svg';
const number = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 });
const scientific = new Intl.NumberFormat('es-CL', { notation: 'scientific', maximumSignificantDigits: 3 });
const ink = 'var(--tinta)';
const secondary = 'var(--tinta-suave)';
const primary = 'var(--tema-texto)';
const strongTint = 'var(--tema-100)';
const mediumTint = 'var(--tema-60)';
const softTint = 'var(--tema-40)';
const paleTint = 'var(--tema-10)';
const guide = 'var(--azul-20)';

function format(value, unit, concise = false) {
  const magnitude = Math.abs(value);
  const formatter = magnitude >= 1e12 ? scientific : concise && magnitude >= 10000 ? compact : number;
  const digits = formatter.format(value);
  return unit === '%' ? `${digits}%` : [digits, unit].filter(Boolean).join(' ');
}

function abbreviate(label, length) {
  return label.length > length ? `${label.slice(0, length - 1).trimEnd()}…` : label;
}

function append(svg, tag, attributes, content) {
  const node = document.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (content !== undefined) node.textContent = content;
  svg.append(node);
  return node;
}

function text(svg, x, y, content, { size = 23, fill = ink, weight = 500, anchor = 'start' } = {}) {
  return append(svg, 'text', { x, y, fill, 'font-size': size, 'font-weight': weight, 'text-anchor': anchor }, content);
}

function bar(svg, x, y, width, height, fill) {
  return append(svg, 'rect', { x, y, width, height, rx: Math.min(7, width / 2), fill });
}

function validChart(chart) {
  if (!chart || !['bars', 'comparison', 'composition', 'line'].includes(chart.type)) return false;
  const size = chart.type === 'comparison' ? 3 : 2;
  return Array.isArray(chart.rows) && chart.rows.length > 0 && chart.rows.length <= 12 &&
    (chart.type !== 'comparison' || (chart.series?.length === 2 && Array.isArray(chart.series) && chart.series.every(label => typeof label === 'string'))) &&
    typeof chart.unit === 'string' && chart.rows.every(row => Array.isArray(row) && row.length === size &&
      typeof row[0] === 'string' && row[0].length > 0 && row.slice(1).every(value => Number.isFinite(value) && value >= 0));
}

const maximum = rows => Math.max(...rows.flatMap(row => row.slice(1)), 0);

function renderBars(svg, { rows, unit }) {
  const max = unit === '%' ? Math.max(100, maximum(rows)) : maximum(rows) || 1;
  const tallest = maximum(rows);
  const rowHeight = 396 / rows.length;
  const thickness = Math.min(40, rowHeight * .52);
  rows.forEach(([label, value], i) => {
    const y = 29 + (i + .5) * rowHeight;
    const highlight = value === tallest && value > 0;
    text(svg, 35, y + 8, abbreviate(label, 22), { weight: highlight ? 700 : 500 });
    bar(svg, 322, y - thickness / 2, 422, thickness, paleTint);
    bar(svg, 322, y - thickness / 2, value / max * 422, thickness, highlight ? strongTint : mediumTint);
    text(svg, 875, y + 9, format(value, unit, true), { size: 26, weight: 700, anchor: 'end' });
  });
}

function renderComparison(svg, { rows, unit, series }) {
  const max = maximum(rows) || 1;
  const rowHeight = 370 / rows.length;
  const thickness = Math.min(28, rowHeight * .27);
  series.forEach((name, i) => {
    const x = 252 + i * 299;
    bar(svg, x, 26, 26, 18, i ? strongTint : mediumTint);
    text(svg, x + 36, 42, abbreviate(name, 27), { size: 19 });
  });
  rows.forEach(([label, before, after], i) => {
    const y = 70 + (i + .5) * rowHeight;
    text(svg, 44, y + 9, abbreviate(label, 14), { size: 27, weight: 700 });
    [before, after].forEach((value, index) => {
      const barY = y - thickness - 4 + index * (thickness + 8);
      const width = value / max * 500;
      bar(svg, 252, barY, width, thickness, index ? strongTint : mediumTint);
      text(svg, 264 + width, barY + thickness * .76, format(value, unit, true), { size: Math.min(21, rowHeight * .51), weight: 700 });
    });
  });
}

function renderComposition(svg, { rows, unit, highlight, groupLabel }) {
  const divisor = maximum(rows) || 1;
  const total = rows.reduce((sum, [, value]) => sum + value / divisor, 0);
  const values = [strongTint, mediumTint, softTint];
  const radius = 143;
  const circumference = Math.PI * 2 * radius;
  const circle = { cx: 227, cy: 234, r: radius, fill: 'none', 'stroke-width': 60 };
  let offset = 0;
  append(svg, 'circle', { ...circle, stroke: paleTint });
  rows.forEach(([label, value], index) => {
    const length = total ? value / divisor / total * circumference : 0;
    const tone = values[index % values.length];
    if (length > 0) append(svg, 'circle', { ...circle, stroke: tone, transform: 'rotate(-90 227 234)',
      'stroke-dasharray': `${Math.max(0, length - 4)} ${circumference}`, 'stroke-dashoffset': -offset });
    offset += length;
    const y = 34 + (index + .5) * 392 / rows.length;
    bar(svg, 460, y - 18, 27, 27, tone);
    text(svg, 500, y + 5, abbreviate(label, 22));
    text(svg, 871, y + 5, format(value, unit, true), { size: 26, weight: 700, anchor: 'end' });
  });
  const highlighted = Array.isArray(highlight) ? rows.filter(([label]) => highlight.includes(label)) : [];
  if (highlighted.length && total > 0) {
    const sum = highlighted.reduce((result, [, value]) => result + value, 0);
    if (Number.isFinite(sum)) text(svg, 227, 232, format(sum, unit, true), { size: 52, weight: 700, anchor: 'middle' });
    if (typeof groupLabel === 'string') text(svg, 227, 269, abbreviate(groupLabel, 23), { size: 16, fill: secondary, anchor: 'middle' });
  }
}

function renderLine(svg, { rows, unit }) {
  const max = maximum(rows);
  const scaledMax = max > 0 && max < 1e15 ? Math.ceil(max) || max : max || 1;
  const bottom = 385;
  const plotX = 118;
  const plotWidth = 690;
  const yFor = value => bottom - value / scaledMax * 294;
  text(svg, plotX, 40, `Caudal (${unit})`, { fill: secondary });
  [0, .5, 1].forEach(division => {
    const value = scaledMax * division;
    append(svg, 'line', { x1: plotX, x2: plotX + plotWidth, y1: yFor(value), y2: yFor(value), stroke: guide, 'stroke-width': 2 });
    text(svg, plotX - 12, yFor(value) + 7, format(value, '', true), { size: 18, fill: secondary, anchor: 'end' });
  });
  const points = rows.map(([, value], index) => ({ x: plotX + 28 + index * (plotWidth - 56) / Math.max(1, rows.length - 1), y: yFor(value) }));
  const shape = points.map(({ x, y }) => `${x},${y}`).join(' ');
  append(svg, 'polygon', { points: `${points[0].x},${bottom} ${shape} ${points.at(-1).x},${bottom}`, fill: paleTint });
  append(svg, 'polyline', { points: shape, fill: 'none', stroke: primary, 'stroke-width': 4, 'stroke-linejoin': 'round' });
  const labelEvery = Math.ceil(rows.length / 8);
  rows.forEach(([label, value], index) => {
    const { x, y } = points[index];
    const peak = value === max && value > 0;
    append(svg, 'circle', { cx: x, cy: y, r: peak ? 8 : 5, fill: primary, stroke: 'var(--superficie)', 'stroke-width': 2 });
    if (index % labelEvery === 0 || index === rows.length - 1) {
      text(svg, x, y - 15, format(value, '', true), { size: 20, weight: peak ? 700 : 500, anchor: 'middle' });
      text(svg, x, 424, label, { size: 18, fill: secondary, anchor: 'middle' });
    }
  });
}

const render = { bars: renderBars, comparison: renderComparison, composition: renderComposition, line: renderLine };

function takeaway({ type, unit, rows, highlight, groupLabel }) {
  if (type === 'comparison') {
    const changes = rows.map(([label, from, to]) => ({ label, change: to - from }));
    const largest = Math.max(...changes.map(item => item.change));
    const largestRoutes = changes.filter(item => item.change === largest);
    if (largest <= 0) return 'Ninguna ruta registra una demora mayor durante la emergencia.';
    if (largestRoutes.length !== 1) return `El mayor aumento de demora es de ${format(largest, unit)}.`;
    return `${largestRoutes[0].label} registra el mayor aumento (${format(largest, unit)}).`;
  }
  if (type === 'line') {
    const max = maximum(rows);
    const peakTimes = rows.filter(([, value]) => value === max);
    if (peakTimes.length === rows.length) return `El caudal se mantiene en ${format(max, unit)}.`;
    if (peakTimes.length !== 1) return `El caudal alcanza ${format(max, unit)} en más de un momento.`;
    return `El caudal alcanza ${format(max, unit)} a las ${peakTimes[0][0]}.`;
  }
  if (type === 'composition') {
    const selected = Array.isArray(highlight) ? rows.filter(([label]) => highlight.includes(label)) : [];
    const total = selected.reduce((sum, [, value]) => sum + value, 0);
    return selected.length && Number.isFinite(total) ? `${groupLabel || selected.map(([label]) => label).join(' y ')} · ${format(total, unit)}.` : '';
  }
  const ranked = [...rows].sort((left, right) => right[1] - left[1]);
  const [label, largest] = ranked[0];
  if (!largest) return '';
  if (unit === '%' && ranked.length > 1) {
    const [other, second] = ranked[1];
    if (Number.isFinite(largest + second)) return `${label} y ${other.toLowerCase()} reúnen el ${format(largest + second, unit)}.`;
  }
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  return !unit && Number.isFinite(total) ? `${format(largest, '')} de ${format(total, '')} elementos corresponden a ${label.toLowerCase()}.` : '';
}

export function createCouncilChart(chart, title) {
  if (!validChart(chart)) return null;
  const { width, height } = CHART_SIZE;
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  render[chart.type](svg, chart);
  const details = chart.rows.map(([label, ...values]) => `${label}: ${values.map((value, index) =>
    [chart.series?.[index], format(value, chart.unit)].filter(Boolean).join(' ')).join(', ')}`).join('. ');
  const source = chart.approximate ? 'Valores aproximados. ' : '';
  return { svg, description: `${title}. ${source}${details}.`, note: source.trim(), takeaway: takeaway(chart) };
}

import './robbery-share-ui.css';

const number = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
const percentage = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function countMetric(label, value, valid) {
  const metric = element('div');
  metric.append(element('dt', null, label), element('dd', null, valid ? number.format(value) : '—'));
  return metric;
}

/** The total must cover La Reina with the same period and active filters. */
export function createRobberyShare({ count, total, period, area } = {}) {
  const validCount = Number.isFinite(count) && count >= 0;
  const validTotal = Number.isFinite(total) && total >= 0;
  const comparable = validCount && validTotal && total > 0 && count <= total;
  const share = comparable ? count / total : null;
  const percentLabel = share === null ? '—' : share > 0 && share < .001 ? '< 0,1 %' : percentage.format(share);

  const section = element('section', 'robbery-share');
  section.dataset.state = comparable ? 'ready' : 'empty';
  section.dataset.theme = 'seguridad';
  section.setAttribute('aria-label', 'Proporción de robos del área consultada respecto de La Reina');
  const heading = element('header', 'robbery-share-heading');
  heading.append(element('h2', null, area ? 'Robos en el área consultada' : 'Robos en este sector'));
  if (period) heading.append(element('p', 'robbery-share-period', period));

  const visual = element('div', 'robbery-share-visual');
  const matrix = element('div', 'robbery-share-matrix');
  matrix.setAttribute('aria-hidden', 'true');
  const cells = document.createDocumentFragment();
  for (let index = 0; index < 100; index++) {
    const cell = element('span', 'robbery-share-cell');
    const fill = Math.max(0, Math.min(1, (share ?? 0) * 100 - index));
    if (fill > 0) {
      const color = element('span', 'robbery-share-cell-fill');
      color.style.width = `${fill * 100}%`;
      cell.append(color);
    }
    cells.append(cell);
  }
  matrix.append(cells);

  const result = element('div', 'robbery-share-result');
  result.append(element('strong', 'robbery-share-percentage', percentLabel));
  const description = comparable ? 'del total comunal' : validCount && validTotal && count === 0 && total === 0 ? 'sin robos en la selección' : 'sin base de comparación';
  result.append(element('p', 'robbery-share-caption', description));
  const counts = element('dl', 'robbery-share-counts');
  counts.append(countMetric(area || 'Sector', count, validCount), countMetric('La Reina', total, validTotal));
  result.append(counts);
  visual.append(matrix, result);
  const note = element('p', 'robbery-share-note', 'Mismo período y filtros activos · cada cuadro representa el 1 %');
  section.append(heading, visual, note);
  return section;
}

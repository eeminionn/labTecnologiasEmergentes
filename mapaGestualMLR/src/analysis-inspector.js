import './analysis-inspector.css';

export function createAnalysisInspector(onClose) {
  const element = document.createElement('section');
  element.className = 'analysis-inspector';
  element.setAttribute('aria-label', 'Consulta en el mapa');

  const copy = document.createElement('div');
  copy.className = 'analysis-inspector-copy';
  const status = document.createElement('p');
  status.className = 'analysis-inspector-status';
  const title = document.createElement('h2');
  title.id = 'analysis-sector-title';
  title.tabIndex = -1;
  const metric = document.createElement('div');
  metric.className = 'analysis-inspector-metric';
  metric.id = 'analysis-sector-metric';
  metric.setAttribute('role', 'status');
  const metricValue = document.createElement('strong');
  const metricLabel = document.createElement('span');
  metric.append(metricValue, metricLabel);
  const summary = document.createElement('p');
  summary.className = 'analysis-inspector-summary';
  summary.id = 'analysis-sector-summary';
  title.setAttribute('aria-describedby', `${metric.id} ${summary.id}`);
  copy.append(status, title, metric, summary);

  const close = document.createElement('button');
  close.id = 'analysis-sector-close';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Quitar selección de recursos');
  close.addEventListener('click', onClose);
  element.append(copy, close);

  function update({
    type = 'idle', label = 'Consulta en el mapa', name = '', detail = 'Señala un subcuadrante o un marcador.',
    value = '', measure = '', kind = ''
  } = {}) {
    element.dataset.state = type;
    element.dataset.kind = kind;
    status.textContent = label;
    title.textContent = name;
    title.title = name;
    title.hidden = !name;
    metric.hidden = !value;
    if (metricValue.textContent !== value) metricValue.textContent = value;
    if (metricLabel.textContent !== measure) metricLabel.textContent = measure;
    summary.textContent = detail;
    summary.title = detail;
    summary.hidden = !detail;
    close.hidden = type !== 'selected';
  }
  update();
  return { element, title, close, update };
}

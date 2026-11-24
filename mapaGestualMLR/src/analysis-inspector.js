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
  const summary = document.createElement('p');
  summary.className = 'analysis-inspector-summary';
  summary.id = 'analysis-sector-summary';
  title.setAttribute('aria-describedby', summary.id);
  copy.append(status, title, summary);

  const close = document.createElement('button');
  close.id = 'analysis-sector-close';
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Cerrar la ubicación seleccionada');
  close.addEventListener('click', onClose);
  element.append(copy, close);

  function update({ type = 'idle', label = 'Consulta en el mapa', name = '', detail = 'Señala un subcuadrante o un marcador.' } = {}) {
    element.dataset.state = type;
    status.textContent = label;
    title.textContent = name;
    title.title = name;
    title.hidden = !name;
    summary.textContent = detail;
    summary.title = detail;
    close.hidden = type !== 'selected';
  }
  update();
  return { element, title, close, update };
}

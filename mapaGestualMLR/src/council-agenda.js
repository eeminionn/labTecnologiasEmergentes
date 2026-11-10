const priorities = { urgente: 'Urgente', prioritario: 'Prioritario', programado: 'Programado' };

const topics = [
  {
    time: '09:00', priority: 'urgente', pointId: 'point-0',
    title: 'Anegamientos y drenaje',
    description: 'Sectores afectados, desvíos y limpieza de sumideros.'
  },
  {
    time: '09:20', priority: 'urgente',
    title: 'Cámaras y casetas de seguridad',
    description: 'Cobertura actual y sectores que requieren refuerzo.'
  },
  {
    time: '09:40', priority: 'prioritario', pointId: 'point-2',
    title: 'Congestión en hora punta',
    description: 'Cruces con demoras y alternativas de circulación.'
  },
  {
    time: '10:00', priority: 'prioritario',
    title: 'Iluminación en cruces peatonales',
    description: 'Cruces con baja visibilidad y luminarias por renovar.'
  },
  {
    time: '10:20', priority: 'programado',
    title: 'Sombra en recorridos peatonales',
    description: 'Tramos expuestos y ubicaciones para incorporar arbolado.'
  },
  {
    time: '10:40', priority: 'programado', pointId: 'point-1',
    title: 'Presupuesto y seguimiento de acuerdos',
    description: 'Recursos disponibles, compromisos y próximos plazos.'
  }
];

export function createCouncilAgenda(panel) {
  const list = panel.querySelector('#council-agenda-list');
  const time = panel.querySelector('#council-current-time');
  const priority = panel.querySelector('#council-current-priority');
  const title = panel.querySelector('#council-current-topic');
  const description = panel.querySelector('#council-current-description');
  const graphics = panel.querySelector('#map-graphics-shortcut');
  const previous = panel.querySelector('#council-agenda-prev');
  const next = panel.querySelector('#council-agenda-next');
  const progress = panel.querySelector('#council-agenda-progress');
  let current = -1;

  const choices = topics.map((topic, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'council-agenda-choice';
    const scheduledTime = document.createElement('time');
    scheduledTime.dateTime = topic.time;
    scheduledTime.textContent = topic.time;
    const name = document.createElement('span');
    name.className = 'council-agenda-name';
    name.textContent = topic.title;
    const state = document.createElement('small');
    state.className = 'council-agenda-choice-state';
    state.textContent = priorities[topic.priority];
    button.append(scheduledTime, name, state);
    button.addEventListener('click', () => select(index));
    item.append(button);
    list.append(item);
    return { button, state };
  });

  function revealCurrent() {
    if (!list.clientHeight) return;
    const row = choices[current].button.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (row.top < viewport.top) list.scrollTop += row.top - viewport.top;
    else if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
  }

  function select(index) {
    const topic = topics[index];
    if (!topic || index === current) return;
    if (current >= 0) {
      choices[current].button.removeAttribute('aria-current');
      choices[current].state.textContent = priorities[topics[current].priority];
    }
    current = index;
    choices[index].button.setAttribute('aria-current', 'true');
    choices[index].state.textContent = 'En curso';
    time.dateTime = topic.time;
    time.textContent = topic.time;
    priority.dataset.priority = topic.priority;
    priority.textContent = priorities[topic.priority];
    title.textContent = topic.title;
    description.textContent = topic.description;
    graphics.hidden = topic.pointId !== 'point-0';
    progress.textContent = `${index + 1} de ${topics.length}`;
    previous.setAttribute('aria-disabled', String(index === 0));
    next.setAttribute('aria-disabled', String(index === topics.length - 1));
    revealCurrent();
  }

  previous.addEventListener('click', () => select(current - 1));
  next.addEventListener('click', () => select(current + 1));
  select(0);

  return {
    selectPoint: pointId => select(topics.findIndex(topic => topic.pointId === pointId)),
    focus() {
      revealCurrent();
      choices[current].button.focus({ preventScroll: true });
    }
  };
}

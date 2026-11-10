import { ANALYSIS_GROUPS, chooseAnalysisLayer } from './analysis-catalog.js';

export function createLayerPicker(overlay, container, { selection, onSelect }) {
  const el = (tag, cls, content) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content) node.textContent = content;
    return node;
  };
  const picker = el('section', 'analysis-date-popover analysis-layer-picker');
  picker.hidden = true;
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-labelledby', 'analysis-layer-picker-title');
  const head = el('header', 'analysis-date-heading');
  const title = el('strong');
  title.id = 'analysis-layer-picker-title';
  const closeButton = el('button', null, '×');
  closeButton.type = 'button';
  closeButton.id = 'analysis-layer-picker-close';
  closeButton.setAttribute('aria-label', 'Cerrar selector de capas');
  closeButton.onclick = () => close();
  head.append(title, closeButton);
  picker.append(head);
  let role, anchor;
  const choices = [];
  for (const group of ANALYSIS_GROUPS) {
    const section = el('section', 'analysis-layer-group');
    section.append(el('h3', null, group.title));
    for (const layer of group.layers) {
      const choice = el('button', 'analysis-layer-option');
      choice.type = 'button';
      choice.id = `analysis-layer-${layer.id}`;
      choice.dataset.tone = layer.tone;
      const text = el('span');
      const description = el('small', null, layer.description);
      text.append(el('strong', null, layer.label), description);
      choice.append(text);
      choice.onclick = () => {
        if (!chooseAnalysisLayer(selection(), layer.id, role)) return;
        const chosenRole = role, hadFocus = picker.contains(document.activeElement);
        close(false);
        const focusTarget = onSelect(layer.id, chosenRole);
        if (hadFocus) focusTarget?.focus({ preventScroll: true });
      };
      section.append(choice);
      choices.push({ layer, choice, description });
    }
    picker.append(section);
  }
  for (const event of ['pointerdown','mousedown','touchstart','click','dblclick','wheel']) picker.addEventListener(event, e => e.stopPropagation());
  overlay.append(picker);
  function close(restoreFocus = true) {
    if (picker.hidden) return false;
    if (restoreFocus && picker.contains(document.activeElement)) anchor?.focus({ preventScroll: true });
    anchor?.setAttribute('aria-expanded', 'false');
    picker.hidden = true;
    anchor = null; role = null;
    return true;
  }
  function open(nextRole, trigger) {
    if (anchor === trigger && !picker.hidden) { close(); return; }
    close(false);
    role = nextRole; anchor = trigger;
    const state = selection();
    title.textContent = state.compare
      ? (role === 'compare' ? 'Cambiar capa derecha' : 'Cambiar capa izquierda')
      : (role === 'compare' ? '¿Con qué quieres comparar?' : 'Elige una capa');
    const otherLayer = role === 'compare' ? state.primary : state.compare;
    for (const {layer, choice, description} of choices) {
      const selected = state[role] === layer.id;
      choice.disabled = !chooseAnalysisLayer(state, layer.id, role);
      choice.setAttribute('aria-pressed', String(selected));
      choice.title = choice.disabled ? 'Esta capa ya está en el mapa' : '';
      description.textContent = state.compare && layer.id === otherLayer ? 'Intercambiar capas' : layer.description;
    }
    picker.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    const outer = container.getBoundingClientRect(), row = anchor.getBoundingClientRect();
    const panel = anchor.closest('.analysis-panel'), rect = panel.getBoundingClientRect(), box = picker.getBoundingClientRect();
    const left = panel.dataset.side === 'right' ? rect.left - box.width - 12 : rect.right + 12;
    picker.style.left = `${Math.max(12, Math.min(outer.width - box.width - 12, left - outer.left))}px`;
    picker.style.top = `${Math.max(66, Math.min(outer.height - box.height - 12, row.top - outer.top))}px`;
    (choices.find(({choice}) => choice.getAttribute('aria-pressed') === 'true')?.choice || choices.find(({choice}) => !choice.disabled)?.choice)?.focus({ preventScroll: true });
  }
  return {
    element: picker, close, open, get isOpen() { return !picker.hidden; },
    targets: () => picker.hidden ? [] : [closeButton, ...choices.map(({choice}) => choice)].filter(button => !button.disabled)
  };
}

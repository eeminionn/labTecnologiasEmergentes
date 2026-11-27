import { ANALYSIS_LAYERS, chooseAnalysisLayer } from './analysis-catalog.js';

export function createLayerPicker(overlay, container, { selection, onSelect }) {
  const el = (tag, cls, content) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content) node.textContent = content;
    return node;
  };
  const picker = el('section', 'analysis-date-popover analysis-layer-picker');
  picker.id = 'analysis-layer-picker';
  picker.hidden = true;
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-labelledby', 'analysis-layer-picker-title');
  const head = el('header', 'analysis-date-heading');
  const title = el('strong');
  title.id = 'analysis-layer-picker-title';
  const closeButton = el('button', null, '×');
  closeButton.type = 'button';
  closeButton.id = 'analysis-layer-picker-close';
  closeButton.setAttribute('aria-label', 'Cerrar selector de datos');
  closeButton.onclick = () => close();
  head.append(title, closeButton);
  picker.append(head);
  let role, anchor;
  const list = el('div', 'analysis-layer-choices');
  const choices = ANALYSIS_LAYERS.map(layer => {
    const choice = el('button', 'analysis-layer-option');
    choice.type = 'button';
    choice.id = `analysis-layer-${layer.id}`;
    choice.dataset.tone = layer.tone;
    const text = el('span');
    const action = el('small', null, 'Intercambiar posiciones');
    action.hidden = true;
    text.append(el('strong', null, layer.label), action);
    choice.append(text);
    choice.onclick = () => {
      const current = selection();
      if (!chooseAnalysisLayer(current, layer.id, role)) return;
      if (current[role] === layer.id) { close(); return; }
      const chosenRole = role, hadFocus = picker.contains(document.activeElement);
      close(false);
      const focusTarget = onSelect(layer.id, chosenRole);
      if (hadFocus) focusTarget?.focus({ preventScroll: true });
    };
    list.append(choice);
    return { layer, choice, action };
  });
  picker.append(list);
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
    title.textContent = role === 'primary' ? 'Cambiar análisis'
      : state.compare ? 'Cambiar comparación' : 'Comparar con';
    const otherLayer = role === 'compare' ? state.primary : state.compare;
    for (const {layer, choice, action} of choices) {
      const selected = state[role] === layer.id;
      choice.disabled = !chooseAnalysisLayer(state, layer.id, role);
      choice.hidden = choice.disabled;
      choice.setAttribute('aria-pressed', String(selected));
      action.hidden = !state.compare || layer.id !== otherLayer;
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

import './companion-web.css';

export function createWebCompanionView(companion, trigger) {
  const dialog = document.createElement('dialog');
  dialog.id = 'web-companion';
  dialog.setAttribute('aria-labelledby', 'web-companion-title');

  const toolbar = document.createElement('header');
  toolbar.className = 'web-companion-toolbar';
  const title = document.createElement('strong');
  title.id = 'web-companion-title';
  title.textContent = 'Ficha técnica';

  const close = document.createElement('button');
  close.id = 'web-companion-close';
  close.type = 'button';
  close.textContent = '← Volver al mapa';
  close.onclick = () => dialog.close();

  const openTab = document.createElement('button');
  openTab.id = 'web-companion-tab';
  openTab.type = 'button';
  openTab.textContent = 'Abrir en otra pestaña ↗';
  toolbar.append(close, title, openTab);

  const notice = document.createElement('p');
  notice.className = 'web-companion-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;

  const frame = document.createElement('iframe');
  frame.id = 'web-companion-frame';
  frame.title = 'Información complementaria del mapa';
  dialog.append(toolbar, notice, frame);
  document.body.append(dialog);

  trigger.textContent = 'Ficha técnica';
  trigger.title = 'Mostrar información complementaria';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', dialog.id);
  trigger.setAttribute('aria-expanded', 'false');

  openTab.onclick = () => {
    notice.hidden = true;
    if (companion.open()) {
      dialog.close();
      return;
    }
    notice.textContent = 'El navegador bloqueó la pestaña. ';
    if (companion.href) {
      const link = document.createElement('a');
      link.href = companion.href;
      link.target = companion.target;
      link.rel = 'opener';
      link.textContent = 'Abrir ficha mediante enlace';
      notice.append(link);
    } else {
      notice.append('Puedes seguir consultando la ficha aquí.');
    }
    notice.hidden = false;
  };

  let returnFocus;
  dialog.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
    returnFocus?.focus({ preventScroll: true });
  });

  return {
    open() {
      if (dialog.open) return;
      returnFocus = document.activeElement;
      companion.attachFrame(frame, { onClose: () => dialog.close() });
      notice.hidden = true;
      dialog.showModal();
      trigger.setAttribute('aria-expanded', 'true');
      close.focus({ preventScroll: true });
    },
  };
}

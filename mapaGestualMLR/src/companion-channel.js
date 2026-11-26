import { assetUrl } from './asset-url.js';

export function createCompanionPublisher({ enabled = true, onCurrentSession = () => {} } = {}) {
  let latest = { mode: 'idle' };
  let popup = null;
  let channel = null;
  let lastSerialized = '';
  const native = typeof window.desktop?.publishCompanionState === 'function';
  const session = crypto.randomUUID();
  const channelName = `mlr-council-companion-${session}`;
  const href = `${assetUrl('/companion.html')}?session=${session}`;

  if (enabled && native) {
    window.desktop.onCompanionCurrentSession?.(onCurrentSession);
  } else if (enabled && typeof BroadcastChannel === 'function') {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = event => {
      if (event.data?.type === 'ready') channel.postMessage({ type: 'state', state: latest });
      else if (event.data?.type === 'current-session') onCurrentSession();
    };
  }

  function publish(state) {
    if (!enabled) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    latest = state;
    if (native) window.desktop.publishCompanionState(state);
    else channel?.postMessage({ type: 'state', state });
  }

  function open() {
    if (!enabled) return false;
    if (native) return window.desktop.openCompanionWindow();
    if (!channel) return false;
    if (popup && !popup.closed) { popup.focus(); return true; }
    popup = window.open(href, channelName);
    return Boolean(popup);
  }

  window.addEventListener('pagehide', event => {
    if (native) window.desktop.publishCompanionState({ mode: 'idle' });
    else channel?.postMessage({ type: 'state', state: { mode: 'idle' } });
    if(!event.persisted)channel?.close();
  });
  window.addEventListener('pageshow', event => {
    if(event.persisted)channel?.postMessage({type:'state',state:latest});
  });

  return { publish, open, href: channel ? href : null, target: channelName };
}

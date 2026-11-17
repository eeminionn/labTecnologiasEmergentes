export function createCompanionPublisher({ enabled = true } = {}) {
  let latest = { mode: 'idle' };
  let popup = null;
  let channel = null;
  let lastSerialized = '';
  const native = typeof window.desktop?.publishCompanionState === 'function';
  const session = crypto.randomUUID();
  const channelName = `mlr-council-companion-${session}`;

  if (enabled && !native && typeof BroadcastChannel === 'function') {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = event => {
      if (event.data?.type === 'ready') channel.postMessage({ type: 'state', state: latest });
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
    if (!enabled) return;
    if (native) return window.desktop.openCompanionWindow();
    if (popup && !popup.closed) { popup.focus(); return; }
    popup = window.open(`/companion.html?session=${session}`, channelName, 'popup,width=1280,height=850');
  }

  window.addEventListener('pagehide', event => {
    if (native) window.desktop.publishCompanionState({ mode: 'idle' });
    else channel?.postMessage({ type: 'state', state: { mode: 'idle' } });
    if(!event.persisted)channel?.close();
  });
  window.addEventListener('pageshow', event => {
    if(event.persisted)channel?.postMessage({type:'state',state:latest});
  });

  if(enabled && !native)queueMicrotask(open);
  return { publish, open };
}

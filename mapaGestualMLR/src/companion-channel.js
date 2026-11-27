import { assetUrl } from './asset-url.js';

const protocol = 'mlr-council-companion';
const channelFor = session => `${protocol}-${session}`;

function openBroadcastChannel(session) {
  if (typeof BroadcastChannel !== 'function') return null;
  try { return new BroadcastChannel(channelFor(session)); }
  catch { return null; }
}

function post(target, session, payload) {
  target.postMessage({ protocol, session, ...payload }, location.origin);
}

function scopedMessage(event, session) {
  const message = event.data;
  return event.origin === location.origin && message?.protocol === protocol && message.session === session
    ? message
    : null;
}

export function createCompanionPublisher({ enabled = true, onCurrentSession = () => {} } = {}) {
  let latest = { mode: 'idle' };
  let popup = null;
  let popupReady = false;
  let frame = null;
  let channel = null;
  let broadcastReady = false;
  let lastSerialized = '';
  const native = typeof window.desktop?.publishCompanionState === 'function';
  const session = crypto.randomUUID();
  const channelName = channelFor(session);
  const href = `${assetUrl('/companion.html')}?session=${session}`;
  const viewerUrl = new URL(href, location.href).href;

  function isLinkedViewer(source) {
    try { return source?.opener === window && source.location.href === viewerUrl; }
    catch { return false; }
  }

  if (enabled && native) {
    window.desktop.onCompanionCurrentSession?.(onCurrentSession);
  } else if (enabled) {
    window.addEventListener('message', event => {
      const message = scopedMessage(event, session);
      if (!message || !event.source) return;
      const activeFrame = frame && event.source === frame.iframe.contentWindow;
      if (!activeFrame && event.source !== popup) {
        // A regular link may succeed after window.open is blocked.
        if (message.type !== 'ready' || !isLinkedViewer(event.source)) return;
        popup = event.source;
      }
      if (message.type === 'ready') {
        if (activeFrame) frame.ready = true;
        else popupReady = true;
        post(event.source, session, { type: 'state', state: latest });
      } else if (message.type === 'current-session') onCurrentSession();
      else if (message.type === 'close' && activeFrame) frame.onClose?.();
    });

    channel = openBroadcastChannel(session);
    channel?.addEventListener('message', event => {
      if (event.data?.type === 'ready') {
        broadcastReady = true;
        channel.postMessage({ type: 'state', state: latest });
      } else if (event.data?.type === 'current-session') onCurrentSession();
    });
  }

  function sendState(state) {
    if (native) {
      window.desktop.publishCompanionState(state);
      return;
    }
    const update = { type: 'state', state };
    if (frame?.ready && frame.iframe.contentWindow) post(frame.iframe.contentWindow, session, update);
    if (popupReady && popup && !popup.closed) post(popup, session, update);
    if (broadcastReady) channel?.postMessage(update);
  }

  function publish(state) {
    if (!enabled) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    latest = state;
    sendState(state);
  }

  function attachFrame(iframe, { onClose } = {}) {
    if (!enabled || native) return false;
    if (frame?.iframe === iframe) {
      frame.onClose = onClose;
      if (frame.ready && iframe.contentWindow) post(iframe.contentWindow, session, { type: 'state', state: latest });
    } else {
      frame = { iframe, onClose, ready: false };
      iframe.src = `${href}&embed=1`;
    }
    return true;
  }

  function open({ focus = true } = {}) {
    if (!enabled) return false;
    if (native) return window.desktop.openCompanionWindow(focus);
    if (popup && !popup.closed) { popup.focus(); return true; }
    popupReady = false;
    popup = window.open(href, channelName);
    return Boolean(popup);
  }

  window.addEventListener('pagehide', event => {
    if (enabled) sendState({ mode: 'idle' });
    if (!event.persisted) channel?.close();
  });
  window.addEventListener('pageshow', event => {
    if (enabled && event.persisted && !native) sendState(latest);
  });

  return { publish, attachFrame, open, href: enabled && !native ? href : null, target: channelName };
}

export function connectCompanionViewer(onState) {
  const params = new URLSearchParams(location.search);
  const session = params.get('session');
  if (!session) return null;
  const embedded = params.get('embed') === '1' && window.parent !== window;
  const source = embedded ? window.parent : window.opener;
  const channel = embedded ? null : openBroadcastChannel(session);
  if (!source && !channel) return null;

  let directReady = false;
  let fallbackTimer;
  window.addEventListener('message', event => {
    if (event.source !== source) return;
    const message = scopedMessage(event, session);
    if (message?.type !== 'state' || typeof message.state?.mode !== 'string') return;
    directReady = true;
    clearTimeout(fallbackTimer);
    onState(message.state);
  });
  channel?.addEventListener('message', event => {
    if (!directReady && event.data?.type === 'state' && typeof event.data.state?.mode === 'string') {
      onState(event.data.state);
    }
  });

  function ready() {
    directReady = false;
    clearTimeout(fallbackTimer);
    if (source && !source.closed) {
      post(source, session, { type: 'ready' });
      if (channel) fallbackTimer = setTimeout(() => channel.postMessage({ type: 'ready' }), 600);
    } else channel?.postMessage({ type: 'ready' });
  }

  if (embedded) window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    post(source, session, { type: 'close' });
  });
  window.addEventListener('pagehide', event => {
    clearTimeout(fallbackTimer);
    if (!event.persisted) channel?.close();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) ready();
  });
  ready();

  return {
    embedded,
    requestCurrentSession() {
      const request = { type: 'current-session' };
      if (source && (directReady || embedded)) post(source, session, request);
      else channel?.postMessage(request);
    }
  };
}

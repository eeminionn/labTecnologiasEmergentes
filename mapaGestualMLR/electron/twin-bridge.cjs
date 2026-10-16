const crypto = require('node:crypto');

// A short lease belongs to the Unity visitor, not to the camera or renderer.
// If Unity stops renewing it, every input and frame endpoint closes first.
function createTwinBridge({ token, onState = () => {}, onSettings = () => {}, getPresentationState = () => ({}), now = Date.now, leaseMs = 3000 }) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token || '')) throw new Error('Invalid twin token');
  const secret = Buffer.from(`Bearer ${token}`);
  let active = false, expiresAt = 0, epoch = 0, ready = false, lastControlSequence = -1;
  let frame = null, frameSequence = 0, renderer = { cameraActive: false, hands: 0, error: '' };
  function deactivate() {
    if (!active) return;
    active = false; expiresAt = 0; epoch++; frame = null;
    renderer = { cameraActive: false, hands: 0, error: '' };
    onState({ active: false, epoch, chair: 'Chair_10' });
  }
  function expire() { if (active && now() >= expiresAt) deactivate(); }
  function isActive(candidateEpoch) {
    expire(); return active && (candidateEpoch === undefined || candidateEpoch === epoch);
  }
  function status() {
    expire();
    const presentation=getPresentationState();
    return { version: 1, ready, active, epoch, chair: 'Chair_10', width: 720, height: 950,
      fps: 15, leaseMs, cameraActive: active && renderer.cameraActive, hands: active ? renderer.hands : 0,
      detectorReady: active && renderer.detectorReady === true, inferenceFrames: active ? renderer.inferenceFrames || 0 : 0,
      cameraLabel: active ? renderer.cameraLabel || '' : '',
      mirror:active && presentation.mirror===true,previewVisible:active && presentation.previewVisible===true,
      previewFrames:active ? Math.max(0,Number(presentation.previewFrames)||0) : 0,
      frameSequence, error: renderer.error || '' };
  }
  function rendererReady() {
    ready = true; onState({ active: isActive(), epoch, chair: 'Chair_10' });
  }
  function rendererState(data) {
    if (!data || data.epoch !== epoch) return;
    renderer = { cameraActive: isActive() && data.cameraActive === true,
      hands: Math.max(0, Math.min(2, Number(data.hands) || 0)), error: String(data.error || '').slice(0, 300),
      detectorReady: data.detectorReady === true, inferenceFrames: Math.max(0, Number(data.inferenceFrames) || 0),
      cameraLabel: String(data.cameraLabel || '').slice(0,256) };
  }
  function pushFrame(bytes) { if (isActive() && Buffer.isBuffer(bytes)) { frame = bytes; frameSequence++; } }
  function authorized(req) {
    const provided = Buffer.from(req.headers.authorization || '');
    return provided.length === secret.length && crypto.timingSafeEqual(provided, secret);
  }
  function json(res, code, body) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  }
  async function route(req, res, pathname) {
    if (!pathname.startsWith('/bridge/')) return false;
    if (!authorized(req)) { json(res, 401, { error: 'Unauthorized' }); return true; }
    expire();
    if (req.method === 'GET' && pathname === '/bridge/status') json(res, 200, status());
    else if (req.method === 'GET' && pathname === '/bridge/frame') {
      if (!active || !frame) { res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); }
      else {
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store',
          'Content-Length': frame.length, 'X-Frame-Sequence': String(frameSequence), 'X-Lease-Epoch': String(epoch) });
        res.end(frame);
      }
    } else if (req.method === 'POST' && pathname === '/bridge/settings') {
      if (!active) json(res, 409, { error: 'Seat required' });
      else { onSettings(); json(res, 200, status()); }
    }
    else if (req.method === 'POST' && ['/bridge/lease','/bridge/stop'].includes(pathname)) {
      let bytes = 0, text = '';
      try {
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 512) throw new Error('Request too large');
          text += chunk;
        }
        const body = JSON.parse(text);
        if (!Number.isSafeInteger(body.sequence) || body.sequence < 0) throw new Error('Invalid sequence');
        // A late heartbeat must never undo a newer stand-up/stop request.
        if (body.sequence <= lastControlSequence) { json(res, 409, { error: 'Stale control sequence' }); return true; }
        lastControlSequence = body.sequence;
        if (pathname === '/bridge/stop' || body.chair !== 'Chair_10' || body.seated !== true) deactivate();
        else {
          expiresAt = now() + leaseMs;
          if (!active) {
            active = true; epoch++; frame = null;
            renderer = { cameraActive: false, hands: 0, error: '' };
            onState({ active: true, epoch, chair: 'Chair_10' });
          }
        }
        json(res, 200, status());
      } catch { deactivate(); json(res, 400, { error: 'Invalid lease' }); }
    } else json(res, 404, { error: 'Not found' });
    return true;
  }
  return { route, isActive, expire, deactivate, rendererReady, rendererState, pushFrame, status };
}

module.exports = { createTwinBridge };

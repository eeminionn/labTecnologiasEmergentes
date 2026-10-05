import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
let model;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      model?.close();
      const files = await FilesetResolver.forVisionTasks(`${data.origin}/wasm`);
      model = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${data.origin}/models/hand_landmarker.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: data.confidence,
        minHandPresenceConfidence: data.confidence,
        minTrackingConfidence: data.confidence
      });
      let telemetryBlocked = null;
      if (data.probe) {
        let violation = false;
        self.addEventListener('securitypolicyviolation', event => { if (event.blockedURI.startsWith('https://odml.pa.googleapis.com')) violation = true; });
        try { await fetch('https://odml.pa.googleapis.com/v1/log', { method: 'OPTIONS' }); } catch {}
        await new Promise(resolve => setTimeout(resolve, 30));
        telemetryBlocked = violation;
      }
      self.postMessage({ type: 'ready', telemetryBlocked });
    } else if (data.type === 'frame') {
      const started = performance.now();
      try {
        const result = model.detectForVideo(data.bitmap, data.timestamp);
        self.postMessage({ type: 'result', landmarks: result.landmarks, timestamp: data.timestamp, inferenceMs: performance.now() - started, capturedAt: data.capturedAt });
      } finally { data.bitmap.close(); }
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message || String(error) }); }
};

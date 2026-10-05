import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
// Model version 1 is immutable. Verify bytes after download and on every build.
const expectedSha = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
await mkdir('public/models', { recursive: true });
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/wasm', { recursive: true });
await mkdir('public/fixtures', { recursive: true });
await cp('tests/fixtures/thumbs-up.png','public/fixtures/thumbs-up.png');
await cp('tests/fixtures/selection-poses.json','public/fixtures/selection-poses.json');
let bytes;
try { bytes = await readFile('public/models/hand_landmarker.task'); }
catch {
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`No se pudo descargar el modelo: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  await writeFile('public/models/hand_landmarker.task', bytes);
}
const sha = createHash('sha256').update(bytes).digest('hex');
if (sha !== expectedSha) throw new Error('El SHA-256 del modelo no coincide');
console.log(`Modelo local: ${bytes.length} bytes; SHA-256 ${sha}`);

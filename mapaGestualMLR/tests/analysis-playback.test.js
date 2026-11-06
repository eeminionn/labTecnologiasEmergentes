import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisPlayback } from '../src/analysis-playback.js';

function clock() {
  let now = 0, id = 0;
  const pending = new Map(), callbacks = [];
  return {
    now: () => now,
    requestFrame(callback) { const key = id++; pending.set(key, callback); callbacks.push(callback); return key; },
    cancelFrame(key) { pending.delete(key); },
    advance(milliseconds, render = true) {
      now += milliseconds;
      if (render) { const ready = [...pending]; pending.clear(); ready.forEach(([, callback]) => callback(now)); }
    },
    get size() { return pending.size; },
    get lastCallback() { return callbacks.at(-1); }
  };
}
function fixture(options = {}) {
  const time = clock(), frames = [], states = [];
  const playback = createAnalysisPlayback({ onFrame: frame => frames.push(frame), onStateChange: state => states.push(state),
    requestFrame: time.requestFrame, cancelFrame: time.cancelFrame, now: time.now, ...options });
  return { playback, time, frames, states };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);

test('El día avanza continuamente con mezclas entre los cuatro horarios y vuelve a madrugada', () => {
  const { playback, time, frames, states } = fixture();
  assert.deepEqual(playback.info(), { playing: false, position: 0, durationMs: 12000,
    period: 'madrugada', nextPeriod: 'manana', mix: 0, elapsedMs: 0 });
  playback.start(); time.advance(1500);
  close(playback.info().position, .125); close(playback.info().mix, .5);
  assert.equal(playback.info().period, 'madrugada'); assert.equal(playback.info().nextPeriod, 'manana');
  time.advance(1500); assert.equal(playback.info().period, 'manana'); assert.equal(playback.info().mix, 0);
  time.advance(4500); assert.equal(playback.info().period, 'tarde'); close(playback.info().mix, .5);
  time.advance(1500); assert.equal(playback.info().period, 'noche'); assert.equal(playback.info().nextPeriod, 'madrugada');
  time.advance(3000); close(playback.info().position, 0); assert.equal(playback.info().period, 'madrugada');
  assert.equal(frames.length, 6); assert.equal(states.length, 1); assert.equal(time.size, 1);
});

test('El avance usa tiempo real entre cuadros, incluso si pasan varios ciclos sin renderizar', () => {
  const { playback, time, frames } = fixture();
  playback.start('manana'); time.advance(27500);
  close(playback.info().position, .25 + 3500 / 12000);
  close(playback.info().elapsedMs, 6500); assert.equal(frames.length, 2);
  assert.equal(playback.info().period, 'tarde'); close(playback.info().mix, 1 / 6);
});

test('Pausar captura la posición exacta entre cuadros y reanuda sin incluir la espera', () => {
  const { playback, time, frames, states } = fixture();
  playback.toggle(); time.advance(1700, false); playback.pause();
  const paused = playback.info().position;
  close(paused, 1700 / 12000); assert.equal(time.size, 0); assert.equal(playback.info().playing, false);
  assert.equal(frames.at(-1).playing, false);
  time.advance(20000); close(playback.info().position, paused);
  playback.toggle(); time.advance(300);
  close(playback.info().position, 2000 / 12000); assert.equal(states.length, 3);
});

test('Buscar un punto permite retroceder y mezclas arbitrarias, pausa y publica el cuadro inmediatamente', () => {
  const { playback, time, frames } = fixture();
  playback.start(); time.advance(6000); playback.seek(.8125);
  assert.equal(playback.info().playing, false); assert.equal(time.size, 0);
  assert.equal(playback.info().period, 'noche'); close(playback.info().mix, .25);
  assert.equal(frames.at(-1).position, .8125);
  playback.seek(.0625); assert.equal(playback.info().period, 'madrugada'); close(playback.info().mix, .25);
  playback.seek(-10); assert.equal(playback.info().position, 0);
  playback.seek(10); assert.equal(playback.info().position, 1);
  assert.equal(playback.info().period, 'madrugada'); assert.equal(playback.info().mix, 0);
  assert.equal(playback.info().elapsedMs, 12000);
  playback.start(); assert.equal(playback.info().position, 0);
});

test('Inicio por horario y reset ubican correctamente el comienzo de cada tramo', () => {
  const { playback, time, states } = fixture();
  for (const [period, position] of [['all', 0], ['madrugada', 0], ['manana', .25], ['tarde', .5], ['noche', .75]]) {
    playback.start(period); assert.equal(playback.info().position, position);
    time.advance(400); playback.reset(period);
    assert.equal(playback.info().playing, false); assert.equal(playback.info().position, position);
    assert.equal(time.size, 0);
  }
  const count = states.length;
  assert.equal(playback.start('otro'), false); assert.equal(playback.reset('otro'), false);
  assert.equal(playback.seek(NaN), false); assert.equal(states.length, count);
  assert.throws(() => createAnalysisPlayback({ durationMs: 0, requestFrame: time.requestFrame, cancelFrame: time.cancelFrame }), /duración/);
});

test('Repetir inicio no duplica los cuadros ni cambia la posición de reproducción', () => {
  const { playback, time, frames, states } = fixture();
  playback.start('manana'); playback.start('noche'); playback.start();
  assert.equal(playback.info().position, .25); assert.equal(time.size, 1);
  assert.equal(frames.length, 1); assert.equal(states.length, 1);
  time.advance(3000); assert.equal(playback.info().position, .5); assert.equal(time.size, 1);
});

test('Un cuadro antiguo no mueve la nueva reproducción tras pausar o buscar otro punto', () => {
  const { playback, time, frames } = fixture();
  playback.start(); const stale = time.lastCallback;
  playback.seek(.75); playback.start();
  const count = frames.length;
  stale(); assert.equal(frames.length, count); assert.equal(time.size, 1); assert.equal(playback.info().position, .75);
  time.advance(1500); close(playback.info().position, .875);
});

test('Destruir elimina el reloj, bloquea callbacks antiguos y no admite nuevas acciones', () => {
  const { playback, time, frames, states } = fixture();
  playback.start(); const stale = time.lastCallback;
  playback.destroy(); playback.destroy();
  const counts = [frames.length, states.length];
  stale(); time.advance(10000);
  assert.deepEqual([frames.length, states.length], counts); assert.equal(time.size, 0);
  assert.equal(playback.info().playing, false);
  assert.equal(playback.start(), false); assert.equal(playback.toggle(), false); assert.equal(playback.seek(.5), false); assert.equal(playback.reset(), false);
});

test('Los callbacks pueden pausar durante un cuadro o destruir durante el cambio de estado', () => {
  const time = clock(); let playback;
  playback = createAnalysisPlayback({ ...time, onFrame(frame) { if (frame.playing && frame.position > 0) playback.pause(); } });
  playback.start(); time.advance(500);
  assert.equal(playback.info().playing, false); assert.equal(time.size, 0); close(playback.info().position, 500 / 12000);
  let destroyedOnState;
  destroyedOnState = createAnalysisPlayback({ ...time, onStateChange() { destroyedOnState.destroy(); } });
  assert.equal(destroyedOnState.start(), false); assert.equal(time.size, 0);
});

test('Pausar o destruir desde el primer cuadro impide rearmar el reloj', () => {
  const time = clock(); let paused, destroyed;
  paused = createAnalysisPlayback({ ...time, onFrame(frame) { if (frame.playing) paused.pause(); } });
  assert.equal(paused.start(), false); assert.equal(time.size, 0);
  destroyed = createAnalysisPlayback({ ...time, onFrame() { destroyed.destroy(); } });
  assert.equal(destroyed.start(), false); assert.equal(time.size, 0);
});

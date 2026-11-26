import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisBlendOpacity, createAnalysisTransition, createAnalysisRasterTransition } from '../src/analysis-transition.js';

function frames() {
  let now = 0, next = 0;
  const pending = new Map(), callbacks = [];
  return {
    now: () => now,
    requestFrame(callback) { const id = next++; pending.set(id, callback); callbacks.push(callback); return id; },
    cancelFrame(id) { pending.delete(id); },
    step(milliseconds) { now += milliseconds; const ready = [...pending]; pending.clear(); ready.forEach(([, callback]) => callback(now)); },
    get size() { return pending.size; },
    get lastCallback() { return callbacks.at(-1); }
  };
}

function layers() {
  const clock = frames(), created = [], errors = [];
  const controller = createAnalysisRasterTransition({ frameOptions: clock, onError: () => errors.push('error'),
    createLayer(spec, loaded, failed) {
      const layer = { url: spec.url, opacity: null, shown: false, destroyed: false, loaded, failed,
        setOpacity(value) { assert.equal(this.destroyed, false); this.opacity = value; },
        show() { assert.equal(this.destroyed, false); this.shown = true; },
        hide() { this.shown = false; },
        destroy() { assert.equal(this.destroyed, false); this.destroyed = true; this.shown = false; }
      };
      created.push(layer); return layer;
    }
  });
  return { controller, clock, created, errors, live: () => created.filter(layer => !layer.destroyed) };
}
const spec = (url, transitionMs = 2200, opacity = .62) => ({ url, transitionMs, opacity, bounds: [[-34, -71], [-33, -70]] });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);

test('La mezcla de imágenes conserva el alfa total y las contribuciones de ambos colores', () => {
  for (const alpha of [0, .1, .45, .62, .9, 1]) for (const progress of [0, .001, .25, .5, .9, .999, 1]) {
    const weights = analysisBlendOpacity(alpha, progress);
    close(weights.next + weights.previous * (1 - weights.next), alpha);
    close(weights.next, alpha * progress);
    close(weights.previous * (1 - weights.next), alpha * (1 - progress));
    assert.ok(Number.isFinite(weights.previous) && weights.previous >= 0 && weights.previous <= 1);
  }
  assert.deepEqual(analysisBlendOpacity(1, 1), { next: 1, previous: 0 });
});

test('La animación ofrece colores intermedios y completa exactamente una vez a los 2,2 segundos', () => {
  const clock = frames(), values = []; let complete = 0;
  const transition = createAnalysisTransition({ ...clock, opacity: .62, durationMs: 2200, onFrame: value => values.push(value), onComplete: () => complete++ });
  assert.deepEqual(values[0], { next: 0, previous: .62 });
  clock.step(1100);
  close(values.at(-1).next, .31);
  assert.ok(values.at(-1).previous > 0);
  assert.equal(transition.running, true);
  clock.step(1100);
  assert.deepEqual(values.at(-1), { next: .62, previous: 0 });
  assert.equal(transition.running, false); assert.equal(complete, 1); assert.equal(clock.size, 0);
  transition.finish(); transition.cancel(); clock.lastCallback();
  assert.equal(complete, 1);
});

test('Cancelar bloquea frames antiguos sin completar ni cambiar la opacidad', () => {
  const clock = frames(), values = []; let complete = 0;
  const transition = createAnalysisTransition({ ...clock, opacity: .62, onFrame: value => values.push(value), onComplete: () => complete++ });
  clock.step(500); const stale = clock.lastCallback, count = values.length;
  transition.cancel(); stale(); clock.step(5000);
  assert.equal(values.length, count); assert.equal(complete, 0); assert.equal(clock.size, 0);
});

test('Mantiene el raster anterior mientras carga el nuevo y conserva solo dos durante la transición', () => {
  const { controller, clock, created, live } = layers();
  controller.setVisible(true); controller.set(spec('primero')); created[0].loaded();
  assert.equal(controller.info().loaded, true);
  controller.set(spec('segundo'));
  assert.equal(created[0].destroyed, false); assert.equal(created[0].opacity, .62); assert.equal(created[1].opacity, 0);
  assert.equal(controller.info().loaded, false); assert.equal(live().length, 2);
  created[1].loaded();
  assert.equal(controller.info().transitioning, true); assert.equal(controller.info().loaded, false);
  clock.step(1100);
  close(created[1].opacity, .31);
  close(created[1].opacity + created[0].opacity * (1 - created[1].opacity), .62);
  clock.step(1100);
  assert.equal(created[0].destroyed, true); assert.equal(live().length, 1);
  assert.equal(controller.info().loaded, true); assert.equal(controller.info().transitioning, false);
});

test('Una actualización nueva retira la carga pendiente y descarta sus callbacks tardíos', () => {
  const { controller, created, errors, live } = layers();
  controller.setVisible(true); controller.set(spec('primero')); created[0].loaded();
  controller.set(spec('pendiente')); const abandoned = created[1];
  controller.set(spec('tercero'));
  assert.equal(abandoned.destroyed, true); assert.equal(live().length, 2);
  abandoned.loaded(); abandoned.failed();
  assert.equal(controller.info().transitioning, false); assert.deepEqual(errors, []);
  assert.equal(created[0].destroyed, false); assert.equal(created[0].opacity, .62);
});

test('Un filtro manual interrumpe la animación y reemplaza el raster sin dejar capas anteriores', () => {
  const { controller, clock, created, live } = layers();
  controller.setVisible(true); controller.set(spec('primero')); created[0].loaded();
  controller.set(spec('segundo')); created[1].loaded(); clock.step(400);
  const stale = clock.lastCallback;
  controller.set(spec('manual', 0));
  assert.equal(created[0].destroyed, true); assert.equal(created[1].opacity, .62);
  stale(); created[2].loaded();
  assert.equal(live().length, 1); assert.equal(created[1].destroyed, true);
  assert.equal(controller.info().loaded, true); assert.equal(controller.info().transitioning, false);
  assert.equal(clock.size, 0);
});

test('Modificar visibilidad durante la mezcla finaliza con la opacidad actual y sin reloj pendiente', () => {
  const { controller, clock, created, live } = layers();
  controller.setVisible(true); controller.set(spec('primero')); created[0].loaded();
  controller.set(spec('segundo')); created[1].loaded(); clock.step(700);
  const stale = clock.lastCallback;
  controller.setOpacity(.35); stale();
  assert.equal(created[1].opacity, .35); assert.equal(created[0].destroyed, true);
  assert.equal(controller.info().loaded, true); assert.equal(controller.info().transitioning, false); assert.equal(live().length, 1);
  assert.equal(clock.size, 0);
});

test('La opacidad cambiada durante una carga se conserva al aparecer el nuevo raster', () => {
  const { controller, created, clock } = layers();
  controller.setVisible(true); controller.set(spec('primero')); created[0].loaded();
  controller.set(spec('segundo')); controller.setOpacity(.3);
  assert.equal(created[0].opacity, .3); assert.equal(created[1].opacity, 0);
  created[1].loaded();
  assert.equal(created[1].opacity, .3); assert.equal(created[0].destroyed, true);
  assert.equal(controller.info().loaded, true); assert.equal(clock.size, 0);
});

test('Ocultar o destruir cancela la mezcla y limpia todas las capas anteriores', () => {
  const { controller, clock, created, live } = layers();
  controller.setVisible(true); controller.set(spec('primero')); created[0].loaded();
  controller.set(spec('segundo')); created[1].loaded(); clock.step(700);
  const stale = clock.lastCallback;
  controller.setVisible(false); stale();
  assert.equal(controller.info().visible, false); assert.equal(controller.info().loaded, false);
  assert.equal(created[0].destroyed, true); assert.equal(created[1].shown, false); assert.equal(live().length, 1);
  controller.setVisible(true);
  assert.equal(controller.info().loaded, true); assert.equal(created[1].opacity, .62);
  controller.destroy(); controller.destroy(); stale();
  assert.equal(live().length, 0); assert.equal(clock.size, 0);
});

test('Una capa nula retira tanto la imagen de salida como la entrante y sus callbacks no la recuperan', () => {
  const { controller, clock, created, live } = layers();
  controller.setVisible(true); controller.set(spec('primero')); created[0].loaded();
  controller.set(spec('segundo')); const pending = created[1];
  controller.set(null); pending.loaded(); pending.failed(); clock.step(5000);
  assert.equal(live().length, 0); assert.equal(controller.info().visible, false); assert.equal(controller.info().spec, null);
});

const blend = (from, to, progress = .5, opacity = .62) => ({ from: spec(from), to: spec(to), progress, opacity });

test('El slider aplica posiciones 0, intermedia y 1 sin crear rasters nuevos para cada frame', () => {
  const { controller, created, live, clock } = layers();
  controller.setVisible(true); controller.setFrame(blend('madrugada', 'manana', 0));
  assert.equal(created.length, 2); assert.equal(controller.info().loaded, false);
  created[0].loaded(); assert.equal(created[0].opacity, .62);
  assert.equal(controller.info().loaded, false);
  created[1].loaded(); assert.equal(controller.info().loaded, true);
  close(created[0].opacity, .62); close(created[1].opacity, 0);
  controller.setFrame(blend('madrugada', 'manana', .5));
  close(created[1].opacity, .31);
  close(created[0].opacity * (1-created[1].opacity), .31);
  assert.equal(controller.info().transitioning, true);
  assert.equal(controller.info().loaded, true);
  controller.setFrame(blend('madrugada', 'manana', 1));
  close(created[0].opacity, 0); close(created[1].opacity, .62);
  assert.equal(controller.info().transitioning, false);
  assert.equal(created.length, 2); assert.equal(live().length, 2); assert.equal(clock.size, 0);
});

test('Avanzar y retroceder reutiliza el raster compartido y mantiene solo dos capas', () => {
  const { controller, created, live } = layers();
  controller.setVisible(true); controller.setFrame(blend('madrugada', 'manana'));
  created[0].loaded(); created[1].loaded(); const morning = created[1];
  controller.setFrame(blend('manana', 'tarde', .2));
  assert.equal(created.length, 3); assert.equal(created[0].destroyed, true); assert.equal(live().length, 2);
  created[2].loaded(); close(morning.opacity * (1-created[2].opacity), .62*.8);
  controller.setFrame(blend('madrugada', 'manana', .75));
  assert.equal(created[2].destroyed, true); assert.equal(live().length, 2);
  created[3].loaded();
  close(morning.opacity, .62*.75); close(created[3].opacity*(1-morning.opacity), .62*.25);
  assert.equal(controller.info().loaded, true); assert.equal(created.length, 4);
});

test('Un seek a otro par mantiene una imagen lista mientras cargan las siguientes, sin superar dos capas', () => {
  const { controller, created, live } = layers();
  controller.setVisible(true); controller.setFrame(blend('madrugada', 'manana'));
  created[0].loaded(); created[1].loaded();
  controller.setFrame(blend('tarde', 'noche', .3));
  assert.equal(live().length, 2); assert.equal(live().some(layer=>layer.url==='madrugada'||layer.url==='manana'), true);
  assert.equal(controller.info().loaded, false);
  const afternoon = created.at(-1); afternoon.loaded();
  assert.equal(live().length, 2); assert.equal(live().some(layer=>layer.url==='madrugada'||layer.url==='manana'), false);
  const night = created.at(-1); assert.equal(night.url, 'noche'); night.loaded();
  assert.equal(controller.info().loaded, true);
  close(night.opacity, .62*.3); close(afternoon.opacity*(1-night.opacity), .62*.7);
});

test('Una carga pendiente reutilizada tras retroceder acepta su resultado sin recuperar pares abandonados', () => {
  const { controller, created, live, errors } = layers();
  controller.setVisible(true); controller.setFrame(blend('madrugada', 'manana'));
  created[0].loaded(); const pendingMorning = created[1];
  controller.setFrame(blend('manana', 'tarde', .25));
  assert.equal(live().length, 2); assert.equal(created[0].destroyed, false);
  pendingMorning.loaded();
  assert.equal(created[0].destroyed, true); assert.equal(live().length, 2);
  const afternoon = created.at(-1); afternoon.loaded();
  controller.setFrame(blend('noche', 'madrugada', .5));
  afternoon.loaded(); afternoon.failed();
  assert.deepEqual(errors, []); assert.equal(live().length, 2);
});

test('Opacidad y visibilidad conservan la posición del slider y no crean relojes', () => {
  const { controller, created, clock } = layers();
  controller.setVisible(true); controller.setFrame(blend('madrugada', 'manana', .4));
  created.forEach(layer=>layer.loaded());
  controller.setOpacity(.3);
  close(created[1].opacity, .3*.4); close(created[0].opacity*(1-created[1].opacity), .3*.6);
  controller.setVisible(false); assert.equal(created.every(layer=>!layer.shown), true);
  assert.equal(controller.info().loaded, false); assert.equal(controller.info().transitioning, false);
  controller.setVisible(true); assert.equal(controller.info().loaded, true);
  close(created[1].opacity, .3*.4); assert.equal(clock.size, 0);
});

test('Un filtro, null o destroy limpia pares controlados y descarta callbacks antiguos', () => {
  const { controller, created, live, errors, clock } = layers();
  controller.setVisible(true); controller.setFrame(blend('madrugada', 'manana', .7));
  created.forEach(layer=>layer.loaded());
  controller.set(spec('manual', 0));
  assert.equal(live().length, 2); created.at(-1).loaded();
  assert.equal(live().length, 1); assert.equal(controller.info().loaded, true);
  controller.setFrame(blend('tarde', 'noche'));
  const pending = created.at(-1); controller.set(null); pending.loaded(); pending.failed();
  assert.equal(live().length, 0); assert.deepEqual(errors, []);
  controller.setFrame(blend('madrugada', 'manana'));
  const stale = [...created.slice(-2)]; controller.destroy(); controller.destroy();
  stale.forEach(layer=>{layer.loaded();layer.failed();});
  assert.equal(live().length, 0); assert.equal(clock.size, 0); assert.deepEqual(errors, []);
});

test('El extremo de 24 horas con una sola imagen no duplica capas ni mezcla transparencias', () => {
  const { controller, created } = layers();
  controller.setVisible(true); controller.setFrame(blend('madrugada', 'madrugada', 1));
  assert.equal(created.length, 1); created[0].loaded();
  assert.equal(controller.info().loaded, true); assert.equal(controller.info().transitioning, false);
  close(created[0].opacity, .62);
});

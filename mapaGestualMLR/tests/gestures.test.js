import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureEngine, OneEuroFilter, classifyHand } from '../src/gestures.js';

// Synthetic landmarks exercise the interpreter; they are not detector accuracy
// measurements. Camera recordings and user trials remain necessary for that.
function hand(pose = 'neutral', { id = 'a', x = 0, y = 0, angle = 0, scale = 1, pinchRatio = 0.15 } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
  points[0] = { x: 0.5, y: 0.72, z: 0 };
  points[1] = { x: 0.45, y: 0.67, z: 0 };
  points[2] = { x: 0.40, y: 0.64, z: 0 };
  points[3] = { x: 0.36, y: 0.61, z: 0 };
  points[4] = { x: 0.34, y: 0.60, z: 0 };
  const bases = [[0.43, 0.57], [0.49, 0.55], [0.55, 0.57], [0.61, 0.61]];
  bases.forEach(([bx, by], finger) => {
    const index = 5 + finger * 4;
    const extended = pose === 'open' || (pose === 'point' && finger === 0) || (pose === 'ok' && finger > 0);
    points[index] = { x: bx, y: by, z: 0 };
    points[index + 1] = { x: bx, y: by - (extended ? 0.08 : 0.055), z: 0 };
    points[index + 2] = { x: bx + (extended ? 0 : 0.01), y: by - (extended ? 0.14 : 0.045), z: 0 };
    points[index + 3] = { x: bx + (extended ? 0 : 0.02), y: by + (extended ? -0.19 : 0.015), z: 0 };
  });
  if (pose === 'ok') {
    const palmSize = Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y);
    points[4] = { x: points[8].x - pinchRatio * palmSize, y: points[8].y, z: 0 };
  }
  return {
    ...(id === undefined ? {} : { id }),
    landmarks: points.map(p => {
      const px = (p.x - 0.5) * scale;
      const py = (p.y - 0.6) * scale;
      return { x: 0.5 + x + px * Math.cos(angle) - py * Math.sin(angle),
        y: 0.6 + y + px * Math.sin(angle) + py * Math.cos(angle), z: p.z * scale };
    }),
  };
}

function frames(engine, hands, from, until, step = 20) {
  const results = [];
  for (let time = from; time <= until; time += step) results.push(engine.update(hands, time));
  return results;
}
const events = results => results.flatMap(result => result.events);
const clicks = results => events(results).filter(event => event.type === 'click');
function armedEngine(options = {}) {
  const engine = new GestureEngine(options);
  frames(engine, [hand('point')], 0, 140);
  return engine;
}
function okPair({ x = 0, y = 0, separation = 0.30 } = {}) {
  return [hand('ok', { id: 'a', x: x - separation / 2, y }),
    hand('ok', { id: 'b', x: x + separation / 2, y })];
}
function navigationEngine(options = {}) {
  const engine = new GestureEngine(options);
  frames(engine, okPair(), 0, 200);
  return engine;
}

test('geometry recognizes poses under in-plane rotation, translation and size changes', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.7]) {
    for (const scale of [0.65, 1, 1.4]) {
      for (const pose of ['point', 'open', 'ok']) {
        const shape = classifyHand(hand(pose, { angle, scale, x: 0.05, y: -0.08 }));
        assert.equal(shape[pose], true, `${pose}, angle=${angle}, scale=${scale}`);
      }
    }
  }
});

test('camera aspect correction preserves geometry and leaves output coordinates raw', () => {
  for (const aspectRatio of [4 / 3, 16 / 9, 9 / 16]) {
    for (const pose of ['point', 'open', 'ok']) {
      const original = hand(pose, { angle: Math.PI / 4 });
      const projected = { ...original, landmarks: original.landmarks.map(p => ({
        x: 0.5 + (p.x - 0.5) / aspectRatio, y: p.y, z: p.z / aspectRatio,
      })) };
      const expected = classifyHand(original);
      const actual = classifyHand(projected, { aspectRatio });
      assert.equal(actual[pose], true);
      assert.ok(Math.abs(expected.pinchRatio - actual.pinchRatio) < 1e-12);
      assert.deepEqual(actual.pointer, { x: projected.landmarks[8].x, y: projected.landmarks[8].y });
      const result = new GestureEngine({ aspectRatio }).update([projected], 0);
      if (pose === 'point') assert.deepEqual(result.cursor, actual.pointer);
    }
  }
  assert.equal(classifyHand(hand(), { aspectRatio: 0 }), null);
  assert.throws(() => new GestureEngine({ aspectRatio: 0 }), RangeError);
});

test('hand appearing already in OK cannot click, regardless of hold duration', () => {
  const engine = new GestureEngine();
  const results = frames(engine, [hand('ok')], 0, 600);
  results.push(...frames(engine, [hand('neutral')], 620, 680));
  assert.equal(clicks(results).length, 0);
  assert.ok(results.every(result => result.mode !== 'click-pending'));
});

test('a stable OK produces exactly one click on release, using the pointed target', () => {
  const engine = armedEngine();
  const target = engine.update([hand('point')], 160).cursor;
  const hold = frames(engine, [hand('ok')], 180, 440);
  assert.equal(hold.at(-1).mode, 'click-pending');
  assert.equal(hold.at(-1).progress, 1);
  assert.deepEqual(hold.at(-1).cursor, target);
  assert.equal(clicks(hold).length, 0);
  const release = frames(engine, [hand('point')], 460, 520);
  assert.deepEqual(clicks(release), [{ type: 'click', ...target }]);
  const unarmedRepeat = frames(engine, [hand('ok')], 540, 900);
  unarmedRepeat.push(engine.update([hand('point')], 920));
  assert.equal(clicks(unarmedRepeat).length, 0);
});

test('dwell progress is temporal and the click anchor stays fixed', () => {
  const engine = armedEngine();
  const start = engine.update([hand('ok')], 160);
  const first = engine.update([hand('ok', { x: 0.005 })], 215);
  const middle = engine.update([hand('ok', { x: -0.005 })], 270);
  assert.equal(start.progress, 0);
  assert.equal(first.progress, 0.25);
  assert.equal(middle.progress, 0.5);
  assert.deepEqual(start.cursor, middle.cursor);
  assert.equal(engine.update([hand('point')], 290).events.length, 0);
});

test('a release sample cannot prove a mature OK that was never observed', () => {
  const engine = armedEngine();
  frames(engine, [hand('ok')], 160, 340);
  // Less than the gap limit, but only 180 ms of stable OK was observed.
  assert.equal(engine.update([hand('point')], 400).events.length, 0);
});

test('moving a pending pinch cancels the click until explicit release/rearm', () => {
  const engine = armedEngine();
  frames(engine, [hand('ok')], 160, 400);
  assert.equal(engine.update([hand('ok', { x: 0.07 })], 420).mode, 'idle');
  const results = frames(engine, [hand('ok', { x: 0.07 })], 440, 720);
  results.push(engine.update([hand('neutral', { x: 0.07 })], 740));
  assert.equal(clicks(results).length, 0);
});

test('pinch hysteresis tolerates enter-boundary noise and fires only beyond exit', () => {
  const engine = armedEngine();
  const results = [engine.update([hand('ok', { pinchRatio: 0.25 })], 160)];
  for (let time = 180; time <= 420; time += 20) {
    results.push(engine.update([hand('ok', { pinchRatio: time % 40 === 0 ? 0.32 : 0.27 })], time));
  }
  assert.ok(results.every(result => result.mode === 'click-pending'));
  assert.equal(clicks(results).length, 0);
  const release = engine.update([hand('ok', { pinchRatio: 0.45 })], 440);
  assert.equal(release.events[0]?.type, 'click');
  assert.equal(engine.update([hand('ok', { pinchRatio: 0.25 })], 460).events.length, 0);
});

test('loss of tracking or invalid landmarks never releases a click', () => {
  for (const lost of [[], [{ landmarks: [] }], [{ landmarks: Array(21).fill({ x: NaN, y: 0 }) }]]) {
    const engine = armedEngine();
    frames(engine, [hand('ok')], 160, 420);
    const result = engine.update(lost, 440);
    assert.equal(result.mode, 'idle');
    assert.equal(result.cursor, null);
    assert.equal(result.events.length, 0);
    const results = frames(engine, [hand('ok')], 460, 800);
    results.push(engine.update([hand('point')], 820));
    assert.equal(clicks(results).length, 0);
  }
});

test('a long inference pause cancels mature dwell, including exactly 180 ms', () => {
  for (const gap of [180, 500, 5000]) {
    const engine = armedEngine();
    frames(engine, [hand('ok')], 160, 420);
    const release = engine.update([hand('point')], 420 + gap);
    assert.equal(clicks([release]).length, 0);
  }
});

test('folding the other fingers while still pinching is cancellation', () => {
  const engine = armedEngine();
  frames(engine, [hand('ok')], 160, 420);
  const closed = hand('ok');
  const neutral = hand('neutral');
  for (let index = 9; index < 21; index++) closed.landmarks[index] = neutral.landmarks[index];
  assert.equal(engine.update([closed], 440).events.length, 0);
  assert.equal(engine.update([hand('point')], 460).events.length, 0);
});

test('two OK hands acquire navigation after dwell; order changes and removal never click', () => {
  const engine = armedEngine();
  frames(engine, [hand('ok')], 160, 320);
  const pair = [hand('ok', { id: 'a', x: -0.15 }), hand('ok', { id: 'b', x: 0.15 })];
  const results = frames(engine, pair, 340, 560);
  assert.equal(results.at(-1).mode, 'navigate');
  assert.equal(events(results).length, 0);
  const spread = [hand('ok', { id: 'b', x: 0.23 }), hand('ok', { id: 'a', x: -0.23 })];
  results.push(...frames(engine, spread, 580, 660));
  assert.ok(events(results).some(event => event.type === 'zoom' && event.delta > 0));
  assert.equal(clicks(results).length, 0);
  const one = [hand('ok', { id: 'a', x: -0.23 })];
  results.push(...frames(engine, one, 680, 1020));
  results.push(engine.update([hand('point', { id: 'a', x: -0.23 })], 1040));
  assert.equal(clicks(results).length, 0);
});

test('a lost or changed navigation track restarts dwell without a pan or scale jump', () => {
  const engine = new GestureEngine();
  const pair = [hand('ok', { id: 'a', x: -0.15 }), hand('ok', { id: 'b', x: 0.15 })];
  frames(engine, pair, 0, 220);
  const changed = [hand('ok', { id: 'a', x: -0.15 }), hand('ok', { id: 'new', x: 0.22 })];
  const result = engine.update(changed, 240);
  assert.equal(result.mode, 'idle');
  assert.equal(result.progress, 0);
  assert.equal(result.events.length, 0);
  const restarted = frames(engine, changed, 260, 440);
  assert.equal(restarted.at(-1).mode, 'navigate');
  assert.equal(events(restarted).length, 0);
});

test('opposing fingertip outliers with unchanged palms and IDs cancel navigation safely', () => {
  for (const anonymous of [false, true]) {
    const pair = () => okPair().map(value => {
      if (anonymous) delete value.id;
      return value;
    });
    const engine = new GestureEngine();
    frames(engine, pair(), 0, 200);
    const outlier = pair();
    outlier.forEach((value, i) => {
      const before = classifyHand(value);
      for (const index of [4, 8]) value.landmarks[index].x += i === 0 ? 0.30 : -0.30;
      const after = classifyHand(value);
      assert.equal(after.ok, true);
      assert.deepEqual(after.center, before.center);
    });
    const cancelled = engine.update(outlier, 220);
    assert.equal(cancelled.mode, 'idle');
    assert.equal(cancelled.events.length, 0);
    // Recovery must also reject the inverse jump back to normal positions.
    const recovered = frames(engine, pair(), 240, 660);
    assert.equal(recovered.at(-1).mode, 'navigate');
    assert.equal(events(recovered).length, 0);
    const moved = okPair({ x: 0.04 });
    if (anonymous) moved.forEach(value => { delete value.id; });
    assert.equal(engine.update(moved, 680).events[0]?.type, 'pan');
  }
});

test('filtered separation below the safe minimum cancels instead of taking log2', () => {
  const engine = navigationEngine();
  const crossing = okPair();
  crossing.forEach((value, i) => {
    // Each jump is below the tracking cap. Raw separation stays above .10,
    // while the old-to-new filters temporarily bring the pinches too close.
    for (const index of [4, 8]) value.landmarks[index].x += i === 0 ? 0.21 : -0.21;
  });
  const raw = crossing.map(value => classifyHand(value));
  assert.ok(raw.every(shape => shape.ok));
  assert.ok(Math.abs(raw[0].pinch.x - raw[1].pinch.x) >= 0.10);
  const cancelled = engine.update(crossing, 220);
  assert.equal(cancelled.mode, 'idle');
  assert.equal(cancelled.events.length, 0);
  const recovered = frames(engine, okPair(), 240, 660);
  assert.equal(recovered.at(-1).mode, 'navigate');
  assert.equal(events(recovered).length, 0);
});

test('adding any second hand cancels a pending click even without a zoom pose', () => {
  const engine = armedEngine();
  frames(engine, [hand('ok')], 160, 420);
  engine.update([hand('ok'), hand('neutral', { id: 'b', x: 0.25 })], 440);
  const results = frames(engine, [hand('ok')], 460, 740);
  results.push(engine.update([hand('point')], 760));
  assert.equal(clicks(results).length, 0);
});

test('one moving palm or neutral hand never pans or zooms', () => {
  for (const pose of ['open', 'neutral', 'ok', 'point']) {
    const engine = new GestureEngine();
    const results = [];
    for (let time = 0; time <= 600; time += 20) {
      results.push(engine.update([hand(pose, { x: time * 0.0001 })], time));
    }
    assert.ok(results.every(result => result.cursor), pose);
    assert.equal(events(results).length, 0, pose);
    assert.ok(results.every(result => result.mode !== 'navigate'), pose);
  }
});

test('two OK hands pan by common midpoint movement without changing zoom', () => {
  const engine = navigationEngine();
  const results = frames(engine, okPair({ x: 0.04, y: -0.02 }), 220, 340);
  const movements = events(results);
  assert.ok(movements.some(event => event.type === 'pan' && event.dx > 0 && event.dy < 0));
  assert.ok(movements.every(event => event.type === 'pan'));
  assert.equal(results.at(-1).mode, 'navigate');
});

test('symmetric separation zooms around the current midpoint without panning', () => {
  const engine = navigationEngine();
  const results = frames(engine, okPair({ separation: 0.42 }), 220, 340);
  assert.ok(events(results).length > 0);
  assert.ok(events(results).every(event => event.type === 'zoom' && event.delta > 0));
  for (const result of results) {
    for (const event of result.events) {
      assert.equal(event.x, result.cursor.x);
      assert.equal(event.y, result.cursor.y);
    }
  }
});

test('common translation and separation produce pan then zoom in the same frame', () => {
  const engine = navigationEngine();
  const result = engine.update(okPair({ x: 0.06, y: 0.04, separation: 0.42 }), 220);
  assert.deepEqual(result.events.map(event => event.type), ['pan', 'zoom']);
  const [pan, zoom] = result.events;
  assert.ok(pan.dx > 0 && pan.dy > 0 && zoom.delta > 0);
  assert.equal(zoom.x, result.cursor.x);
  assert.equal(zoom.y, result.cursor.y);
});

test('two open palms or one OK plus another pose never acquire navigation', () => {
  for (const poses of [['open', 'open'], ['ok', 'open'], ['ok', 'point'], ['ok', 'neutral']]) {
    const engine = new GestureEngine();
    const results = [];
    for (let time = 0; time <= 600; time += 20) {
      results.push(engine.update(poses.map((pose, i) => hand(pose, {
        id: i === 0 ? 'a' : 'b', x: (i === 0 ? -0.15 : 0.15) + time * 0.0001,
      })), time));
    }
    assert.equal(events(results).length, 0, poses.join('/'));
    assert.ok(results.every(result => result.mode === 'idle'), poses.join('/'));
  }
});

test('opening either hand clutches navigation and reacquisition starts without jumps', () => {
  for (const openedIndex of [0, 1]) {
    const engine = navigationEngine();
    engine.update(okPair({ x: 0.04, separation: 0.36 }), 220);
    const released = okPair({ x: 0.04, separation: 0.36 });
    released[openedIndex] = hand('open', { id: openedIndex === 0 ? 'a' : 'b', x: openedIndex === 0 ? -0.14 : 0.22 });
    const clutch = engine.update(released, 240);
    assert.equal(clutch.mode, 'idle');
    assert.equal(clutch.events.length, 0);
    const repositioned = okPair({ x: -0.03, y: -0.03, separation: 0.24 });
    const readquire = frames(engine, repositioned, 260, 660);
    assert.equal(readquire.at(-1).mode, 'navigate');
    assert.equal(events(readquire).length, 0);
  }
});

test('a single hand cursor follows pose geometry without moving the map', () => {
  for (const [pose, key] of [['point', 'pointer'], ['ok', 'pinch'], ['open', 'center'], ['neutral', 'center']]) {
    const engine = new GestureEngine();
    const value = hand(pose);
    const result = engine.update([value], 0);
    assert.deepEqual(result.cursor, classifyHand(value)[key]);
    assert.equal(result.events.length, 0);
    const moved = engine.update([hand(pose, { x: 0.02 })], 20);
    assert.ok(moved.cursor.x > result.cursor.x);
    assert.equal(moved.events.length, 0);
  }
});

test('navigation is inactive until 180 ms of two observed OK hands', () => {
  const engine = new GestureEngine();
  const initial = frames(engine, okPair(), 0, 160);
  assert.equal(events(initial).length, 0);
  assert.ok(initial.every(result => result.mode === 'idle'));
  const ready = engine.update(okPair(), 180);
  assert.equal(ready.mode, 'navigate');
  assert.equal(ready.events.length, 0);
});

test('resting two OK hands with small detector jitter do not move the map', () => {
  const engine = new GestureEngine();
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const results = [];
  for (let time = 0; time <= 3000; time += 1000 / 30) {
    results.push(engine.update([hand('ok', { id: 'a', x: -0.15 + (random() - 0.5) * 0.004,
      y: (random() - 0.5) * 0.004 }), hand('ok', { id: 'b', x: 0.15 + (random() - 0.5) * 0.004,
      y: (random() - 0.5) * 0.004 })], time));
  }
  assert.equal(results.at(-1).mode, 'navigate');
  assert.equal(events(results).length, 0);
  const intentional = engine.update(okPair({ x: 0.04 }), 3020);
  assert.equal(intentional.events[0]?.type, 'pan');
});

test('sub-deadband intentional movements accumulate instead of being discarded', () => {
  const engine = navigationEngine();
  const results = [];
  for (let time = 220; time <= 620; time += 20) {
    results.push(engine.update(okPair({ x: (time - 200) * 0.00005 }), time));
  }
  const movement = events(results).filter(event => event.type === 'pan');
  assert.ok(movement.length > 0);
  assert.ok(movement.every(event => event.dx > 0));
  assert.ok(movement.reduce((sum, event) => sum + event.dx, 0) > 0.01);
});

test('the same timed interaction clicks once at 15, 30 and 60 FPS', () => {
  for (const fps of [15, 30, 60]) {
    const engine = new GestureEngine();
    const results = [];
    const step = 1000 / fps;
    for (let time = 0; time < 1000; time += step) {
      const pose = time < 200 ? 'point' : time < 600 ? 'ok' : 'point';
      results.push(engine.update([hand(pose)], time));
    }
    assert.equal(clicks(results).length, 1, `FPS=${fps}`);
  }
});

test('two-hand navigation dwell and combined movement work at 15, 30 and 60 FPS', () => {
  for (const fps of [15, 30, 60]) {
    const engine = new GestureEngine();
    const step = 1000 / fps;
    const results = [];
    let acquiredAt;
    for (let time = 0; time <= 900; time += step) {
      const movement = Math.max(0, Math.min(1, (time - 400) / 300));
      const result = engine.update(okPair({ x: movement * 0.06,
        y: movement * -0.03, separation: 0.30 + movement * 0.12 }), time);
      if (result.mode === 'navigate' && acquiredAt === undefined) acquiredAt = time;
      results.push(result);
    }
    assert.ok(acquiredAt >= 180 && acquiredAt <= 180 + step, `FPS=${fps}`);
    assert.ok(events(results).some(event => event.type === 'pan'), `pan FPS=${fps}`);
    assert.ok(events(results).some(event => event.type === 'zoom'), `zoom FPS=${fps}`);
    assert.equal(clicks(results).length, 0, `click FPS=${fps}`);
  }
});

test('occlusion cancels navigation; returning with both OK or one OK never jumps or clicks', () => {
  const engine = navigationEngine();
  engine.update(okPair({ x: 0.04, separation: 0.40 }), 220);
  const lost = engine.update([], 240);
  assert.equal(lost.cursor, null);
  assert.equal(lost.events.length, 0);
  const repositioned = okPair({ x: -0.04, y: -0.03, separation: 0.24 });
  const returning = frames(engine, repositioned, 260, 660);
  assert.equal(returning.at(-1).mode, 'navigate');
  assert.equal(events(returning).length, 0);
  const one = frames(engine, [repositioned[0]], 680, 940);
  one.push(engine.update([hand('point', { x: -0.16, y: -0.03 })], 960));
  assert.equal(events(one).length, 0);
  assert.ok(one.every(result => result.cursor));
});

test('identity replacement cannot inherit dwell or create a pan jump', () => {
  const engine = armedEngine();
  frames(engine, [hand('ok')], 160, 420);
  const results = frames(engine, [hand('ok', { id: 'new' })], 440, 740);
  results.push(engine.update([hand('point', { id: 'new' })], 760));
  assert.equal(clicks(results).length, 0);
  engine.reset();
  frames(engine, okPair(), 0, 200);
  const changed = okPair({ x: 0.04 });
  changed[0].id = 'new';
  assert.equal(engine.update(changed, 220).events.length, 0);
});

test('unlabelled hands match spatially; a large relocation cancels navigation', () => {
  const engine = new GestureEngine();
  const anonymousPair = options => okPair(options).map(value => { delete value.id; return value; });
  frames(engine, anonymousPair(), 0, 200);
  assert.equal(engine.update(anonymousPair({ x: 0.02 }), 220).events[0]?.type, 'pan');
  assert.equal(engine.update(anonymousPair({ x: -0.3 }), 240).events.length, 0);
});

test('explicit rearm and cooldown permit a second deliberate click', () => {
  const engine = armedEngine();
  const first = frames(engine, [hand('ok')], 160, 400);
  first.push(engine.update([hand('point')], 420));
  assert.equal(clicks(first).length, 1);
  frames(engine, [hand('point')], 440, 840);
  const second = frames(engine, [hand('ok')], 860, 1100);
  second.push(engine.update([hand('point')], 1120));
  assert.equal(clicks(second).length, 1);
});

test('One Euro smooths static jitter and follows intentional motion', () => {
  const filter = new OneEuroFilter();
  assert.equal(filter.update(0.5, 0), 0.5);
  const smoothed = filter.update(0.51, 16);
  assert.ok(smoothed > 0.5 && smoothed < 0.51);
  let value;
  for (let time = 32; time <= 320; time += 16) value = filter.update(0.7, time);
  assert.ok(value > 0.69);
  filter.reset();
  assert.equal(filter.update(0.2, 400), 0.2);
});

test('invalid timestamps reset the interpreter; three hands produce no events', () => {
  const engine = armedEngine();
  frames(engine, [hand('ok')], 160, 400);
  assert.equal(engine.update([hand('point')], NaN).events.length, 0);
  assert.equal(engine.update([hand('open'), hand('open', { id: 'b' }), hand('open', { id: 'c' })], 420).events.length, 0);
  assert.throws(() => new GestureEngine({ pinchExit: 0.1 }), RangeError);
  assert.throws(() => new GestureEngine({ clickDwellMs: -1 }), TypeError);
});

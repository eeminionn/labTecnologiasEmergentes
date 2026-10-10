import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GestureEngine } from '../src/gestures.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/selection-poses.json', import.meta.url))).poses;

// MediaPipe does not give our interpreter stable hand IDs. These fixtures
// deliberately contain no `id`: matching must preserve the actual actor.
function hand(kind, x = 0) {
  const points = kind === 'point' ? fixtures.index : fixtures[kind] || fixtures.point;
  const landmarks = points.map(point => ({ ...point }));
  if (kind === 'open') {
    for (let index = 9; index < 21; index++) landmarks[index] = { ...fixtures.ok[index] };
  } else if (kind === 'neutral') {
    for (let index = 5; index < 9; index++) landmarks[index] = { ...fixtures.ok[index] };
  }
  const result = { landmarks: landmarks.map(point => ({ ...point, x: point.x + x })) };
  if (kind === 'invalid-world') result.worldLandmarks = [];
  if (kind === 'invalid-image') result.landmarks[8].x = NaN;
  return result;
}

function frames(engine, hands, from, until, context = {}) {
  const results = [];
  for (let time = from; time <= until; time += 20) {
    results.push(engine.update(typeof hands === 'function' ? hands(time) : hands, time, context));
  }
  return results;
}

const events = results => results.flatMap(result => result.events);
const clicks = results => events(results).filter(event => event.type === 'click');
const leftTarget = { selectionTargetForHand: ({ pointer }) => pointer.x < 0.5 ? 'left-target' : null };
const rightTarget = { selectionTargetForHand: ({ pointer }) => pointer.x > 0.5 ? 'right-target' : null };

test('one anonymous hand over a target selects in either array position beside open, OK, fist or invalid companions', () => {
  for (const kind of ['open', 'ok', 'neutral', 'fist', 'invalid-world', 'invalid-image']) {
    for (const actorSecond of [false, true]) {
      const engine = new GestureEngine();
      const actor = hand('point', -0.17), companion = hand(kind, 0.17);
      const pair = actorSecond ? [companion, actor] : [actor, companion];
      assert.ok(pair.every(value => !Object.hasOwn(value, 'id')));
      const start = engine.update(pair, 0, leftTarget);
      assert.equal(start.mode, 'click-pending', `${kind}, second=${actorSecond}`);
      assert.equal(start.progress, 0);
      assert.equal(start.pointers.find(pointer => pointer.id === start.selectionHandId).handIndex, actorSecond ? 1 : 0);
      const beforeDeadline = frames(engine, pair, 20, 1480, leftTarget);
      assert.equal(events(beforeDeadline).length, 0);
      assert.ok(beforeDeadline.every(result => result.mode === 'click-pending'));
      const confirmation = engine.update(pair, 1500, leftTarget);
      assert.deepEqual(confirmation.events, [{ type: 'click', ...start.cursor }]);
      assert.equal(confirmation.selectionHandId, start.selectionHandId);
      assert.equal(confirmation.mode, 'click-confirmed');
      assert.equal(events(frames(engine, pair, 1520, 2000, leftTarget)).length, 0);
    }
  }
});

test('a free anonymous hand entering, leaving and reversing order does not reset the hover actor or target', () => {
  const engine = new GestureEngine();
  const pointed = frames(engine, [hand('open', -0.17)], 0, 140).at(-1).cursor;
  const actor = hand('point', -0.17);
  const start = engine.update([actor], 160, leftTarget);
  assert.deepEqual(start.cursor, pointed);
  const results = frames(engine, time => {
    if (time < 420 || time >= 1300) return [actor];
    const kind = time < 700 ? 'open' : time < 900 ? 'fist'
      : time < 1100 ? 'invalid-world' : 'invalid-image';
    const companion = hand(kind, 0.17);
    return time % 80 === 20 ? [companion, actor] : [actor, companion];
  }, 180, 1660, leftTarget);
  assert.ok(results.every(result => result.selectionHandId === start.selectionHandId));
  assert.ok(results.every(result => result.resetSelection === false));
  assert.ok(results.every(result => result.cursor.x === pointed.x && result.cursor.y === pointed.y));
  for (let index = 0; index < results.length - 1; index++) {
    assert.equal(results[index].mode, 'click-pending');
    assert.ok(Math.abs(results[index].progress - (20 + index * 20) / 1500) < 1e-12);
    assert.equal(results[index].events.length, 0);
  }
  assert.deepEqual(clicks(results), [{ type: 'click', ...pointed }]);
  assert.equal(results.at(-1).mode, 'click-confirmed');
});

test('pan keeps the same anonymous fist contributor while a free hand changes or disappears', () => {
  const engine = new GestureEngine();
  const fist = hand('fist', -0.17);
  const acquired = frames(engine, [fist, hand('open', 0.17)], 0, 200).at(-1);
  assert.equal(acquired.navigationKind, 'pan');
  const participants = acquired.navigationHandIds;
  const schedule = (time, actor) => {
    if (time >= 500 && time < 700) return [actor];
    const kind = time < 400 ? 'ok' : time < 800 ? 'open'
      : time < 1000 ? 'invalid-world' : 'invalid-image';
    const companion = hand(kind, 0.17 + (time % 60) / 2000);
    return time % 80 === 20 ? [companion, actor] : [actor, companion];
  };
  const still = frames(engine, time => schedule(time, fist), 220, 1200);
  assert.equal(events(still).length, 0, 'the free hand cannot move a stationary pan actor');
  assert.ok(still.every(result => result.mode === 'navigate' && result.navigationKind === 'pan'));
  assert.ok(still.every(result => JSON.stringify(result.navigationHandIds) === JSON.stringify(participants)));
  const moving = frames(engine, time => schedule(time, hand('fist', -0.17 + (time - 1200) / 10000)), 1220, 1600);
  assert.ok(moving.every(result => result.mode === 'navigate' && result.navigationKind === 'pan'));
  assert.ok(moving.every(result => JSON.stringify(result.navigationHandIds) === JSON.stringify(participants)));
  assert.ok(events(moving).length > 0);
  assert.ok(events(moving).every(event => event.type === 'pan' && event.dx > 0 && Math.abs(event.dy) < 1e-12));
});

test('losing or changing an anonymous selection actor never transfers its elapsed hold to the other hand', () => {
  for (const previousActorRemains of [false, true]) {
    const engine = new GestureEngine();
    const actor = hand('point', -0.17), companion = hand('open', 0.17);
    const initial = engine.update([actor, companion], 0, leftTarget);
    const history = frames(engine, [actor, companion], 20, 1000, leftTarget);
    assert.equal(events(history).length, 0);
    const companionPointer = history.at(-1).pointers.find(pointer => pointer.handIndex === 1);
    const nextPair = previousActorRemains ? [hand('open', -0.17), hand('point', 0.17)] : [hand('point', 0.17)];
    const switched = engine.update(nextPair, 1020, rightTarget);
    assert.equal(switched.mode, 'click-pending');
    assert.equal(switched.progress, 0);
    assert.notEqual(switched.selectionHandId, initial.selectionHandId);
    assert.equal(switched.selectionHandId, companionPointer.id);
    assert.deepEqual(switched.cursor, { x: companionPointer.x, y: companionPointer.y });
    assert.equal(events(frames(engine, nextPair, 1040, 2500, rightTarget)).length, 0);
    assert.deepEqual(engine.update(nextPair, 2520, rightTarget).events, [{ type: 'click', ...switched.cursor }]);
  }
});

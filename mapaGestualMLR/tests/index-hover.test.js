import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GestureEngine } from '../src/gestures.js';

const poses = JSON.parse(readFileSync(new URL('./fixtures/selection-poses.json', import.meta.url))).poses;
const clone = points => points.map(point => ({ ...point }));

// These are synthetic landmark/API regressions, not recognition accuracy or
// camera trials. No hand.id is supplied unless a test explicitly needs one.
function hand(kind = 'open', tipX = 0.35, tipY = 0.35) {
  const points = clone(kind === 'point' ? poses.index : poses[kind] || poses.point);
  if (kind === 'open') {
    for (let index = 9; index < 21; index++) points[index] = { ...poses.ok[index] };
    for (let index = 5; index < 9; index++) points[index] = { ...poses.index[index] };
  } else if (kind === 'neutral') {
    for (let index = 5; index < 9; index++) points[index] = { ...poses.ok[index] };
  }
  const dx = tipX - points[8].x, dy = tipY - points[8].y;
  return { landmarks: points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) };
}

function withWorld(value) {
  const center = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis,
    value.landmarks.reduce((sum, point) => sum + point[axis] / 21, 0)]));
  return { ...value, worldLandmarks: value.landmarks.map(point => Object.fromEntries(
    ['x', 'y', 'z'].map(axis => [axis, (point[axis] - center[axis]) * 0.45]))) };
}

function frames(engine, hands, from, until, context) {
  const results = [];
  for (let time = from; time <= until; time += 20) results.push(engine.update(
    typeof hands === 'function' ? hands(time) : hands, time,
    typeof context === 'function' ? context(time) : context));
  return results;
}
const clicks = results => results.flatMap(result => result.events).filter(event => event.type === 'click');
const events = results => results.flatMap(result => result.events);
const target = id => ({ selectionTargetForHand: () => id });
const leftTarget = { selectionTargetForHand: ({ pointer }) => pointer.x < 0.5 ? 'left-target' : null };
const pointer = value => ({ x: value.landmarks[8].x, y: value.landmarks[8].y });

test('hover selection is disabled without an explicit visible-target callback', () => {
  for (const kind of ['open', 'neutral', 'point', 'thumb-out', 'ok']) {
    const results = frames(new GestureEngine(), [hand(kind)], 0, 2200);
    assert.equal(clicks(results).length, 0, kind);
    assert.ok(results.every(result => !result.mode.startsWith('click-')), kind);
    assert.ok(results.every(result => result.progress === 0), kind);
    assert.ok(results.every(result => result.selectionTargetId === null), kind);
  }
});

test('every non-fist posture selects by its actual index over a target after a full 1500 ms', () => {
  for (const kind of ['open', 'neutral', 'point', 'thumb-out', 'ok']) {
    const actor = hand(kind), engine = new GestureEngine();
    const start = engine.update([actor], 0, target('poi'));
    assert.equal(start.mode, 'click-pending', kind);
    assert.equal(start.progress, 0);
    assert.equal(start.selectionTargetId, 'poi');
    assert.deepEqual(start.selectionLiveCursor, pointer(actor));
    assert.deepEqual(start.selectionCursor, pointer(actor));
    const before = frames(engine, [actor], 20, 1480, target('poi'));
    assert.equal(clicks(before).length, 0, kind);
    assert.ok(before.every(result => result.mode === 'click-pending'));
    const completed = engine.update([actor], 1500, target('poi'));
    assert.equal(completed.mode, 'click-confirmed', kind);
    assert.equal(completed.progress, 1);
    assert.equal(clicks([completed]).length, 1);
    assert.equal(completed.selectionHandId, start.selectionHandId);
    assert.equal(completed.selectionTargetId, 'poi');
    assert.equal(clicks(frames(engine, [actor], 1520, 2500, target('poi'))).length, 0);
  }
});

test('non-index world damage and extra extended fingers cannot veto a usable index hover', () => {
  const original = withWorld(hand('open'));
  const collapsed = { ...original, worldLandmarks: clone(original.worldLandmarks) };
  collapsed.worldLandmarks[14] = { ...collapsed.worldLandmarks[13] };
  const nonfinite = { ...original, worldLandmarks: clone(original.worldLandmarks) };
  nonfinite.worldLandmarks[14].z = NaN;
  for (const actor of [original, collapsed, nonfinite, { ...original, worldLandmarks: [] }]) {
    const engine = new GestureEngine();
    const results = frames(engine, [actor], 0, 1500, target('poi'));
    assert.equal(results[0].mode, 'click-pending');
    assert.equal(results[0].progress, 0);
    assert.equal(clicks(results).length, 1);
    assert.deepEqual(results.at(-1).selectionLiveCursor, pointer(actor));
  }
});

test('an estimated world fist cannot override a positively extended image index over a target', () => {
  // The image index is visibly straight, while the thumb stays out. It is not
  // the old strict index-only pose. A coherent monocular world estimate of a
  // fist must not turn that positive image evidence into pan or suppress dwell.
  const actor = hand('thumb-out');
  actor.worldLandmarks = withWorld(hand('fist')).worldLandmarks;
  const engine = new GestureEngine();
  const results = frames(engine, [actor], 0, 1500, target('poi'));
  assert.equal(results[0].mode, 'click-pending');
  assert.equal(results[0].progress, 0);
  assert.ok(results.every(result => result.navigationKind === null));
  assert.deepEqual(results[0].selectionLiveCursor, pointer(actor));
  assert.equal(clicks(results).length, 1);
  assert.ok(events(results).every(event => event.type === 'click'));
});

test('empty space contributes no dwell before the index reaches a visible target', () => {
  const actor = hand('open'), engine = new GestureEngine();
  const empty = frames(engine, [actor], 0, 1000, target(null));
  assert.equal(clicks(empty).length, 0);
  assert.ok(empty.every(result => result.progress === 0 && !result.mode.startsWith('click-')));
  const start = engine.update([actor], 1020, target('poi'));
  assert.equal(start.mode, 'click-pending');
  assert.equal(start.progress, 0);
  assert.equal(clicks(frames(engine, [actor], 1040, 2500, target('poi'))).length, 0);
  assert.equal(clicks([engine.update([actor], 2520, target('poi'))]).length, 1);
});

test('the target callback receives each tracked hand and does not assume array position zero', () => {
  for (const reversed of [false, true]) {
    const engine = new GestureEngine(), calls = [];
    const actor = hand('open', 0.35), companion = hand('neutral', 0.70);
    const pair = reversed ? [companion, actor] : [actor, companion];
    const context = { selectionTargetForHand: args => {
      calls.push(args);
      assert.ok(Number.isFinite(args.trackId));
      assert.ok(Number.isInteger(args.handIndex));
      assert.deepEqual(args.pointer, pointer(pair[args.handIndex]));
      return args.pointer.x < 0.5 ? 'left-target' : null;
    } };
    const start = engine.update(pair, 0, context);
    assert.equal(start.mode, 'click-pending');
    assert.equal(start.selectionTargetId, 'left-target');
    const selected = start.pointers.find(value => value.id === start.selectionHandId);
    assert.equal(selected.handIndex, reversed ? 1 : 0);
    assert.ok(calls.some(call => call.handIndex === 0));
    assert.ok(calls.some(call => call.handIndex === 1));
    assert.equal(clicks(frames(engine, pair, 20, 1500, leftTarget)).length, 1);
  }
});

test('anonymous companions entering, leaving, changing posture and reversing order preserve actor and dwell', () => {
  const engine = new GestureEngine(), actor = hand('open', 0.35);
  const start = engine.update([actor], 0, leftTarget);
  const results = frames(engine, time => {
    if (time < 200 || time >= 1300 || time >= 600 && time < 800) return [actor];
    const kind = time < 500 ? 'fist' : time < 1000 ? 'ok' : 'neutral';
    const companion = hand(kind, 0.70);
    if (time >= 1100) companion.worldLandmarks = [];
    return time % 40 ? [companion, actor] : [actor, companion];
  }, 20, 1500, leftTarget);
  assert.ok(results.every(result => result.selectionHandId === start.selectionHandId));
  assert.ok(results.every(result => result.selectionTargetId === 'left-target'));
  assert.ok(results.every(result => !result.resetSelection));
  assert.ok(results.every(result => result.navigationKind === null));
  assert.ok(results.every(result => result.selectionCursor.x === start.selectionCursor.x
    && result.selectionCursor.y === start.selectionCursor.y));
  for (let index = 0; index < results.length; index++) assert.equal(results[index].progress, (index + 1) * 20 / 1500);
  assert.equal(clicks(results).length, 1);
});

test('changing the targeted hand gives the next actor its own origin and full deadline', () => {
  const engine = new GestureEngine(), a = hand('open', 0.35), b = hand('ok', 0.70);
  const start = engine.update([a, b], 0, leftTarget);
  const before = frames(engine, [a, b], 20, 1000, leftTarget);
  assert.equal(clicks(before).length, 0);
  const rightTarget = { selectionTargetForHand: ({ pointer: p }) => p.x > 0.5 ? 'right-target' : null };
  const next = engine.update([b, a], 1020, rightTarget);
  assert.equal(next.mode, 'click-pending');
  assert.equal(next.progress, 0);
  assert.equal(next.selectionTargetId, 'right-target');
  assert.equal(next.resetSelection, true);
  assert.notEqual(next.selectionHandId, start.selectionHandId);
  assert.deepEqual(next.selectionCursor, pointer(b));
  assert.equal(clicks(frames(engine, [a, b], 1040, 2500, rightTarget)).length, 0);
  assert.equal(clicks([engine.update([a, b], 2520, rightTarget)]).length, 1);
});

test('losing an anonymous actor cannot transfer its elapsed hover to an already tracked companion', () => {
  const engine = new GestureEngine(), a = hand('open', 0.35), b = hand('neutral', 0.70);
  const start = engine.update([a, b], 0, leftTarget);
  const history = frames(engine, [a, b], 20, 1000, leftTarget);
  const bId = history.at(-1).pointers.find(value => value.handIndex === 1).id;
  const next = engine.update([b], 1020, target('right-target'));
  assert.equal(next.mode, 'click-pending');
  assert.equal(next.progress, 0);
  assert.equal(next.selectionHandId, bId);
  assert.equal(next.selectionTargetId, 'right-target');
  assert.notEqual(next.selectionHandId, start.selectionHandId);
  assert.deepEqual(next.selectionCursor, pointer(b));
  assert.equal(clicks(frames(engine, [b], 1040, 2500, target('right-target'))).length, 0);
  assert.equal(clicks([engine.update([b], 2520, target('right-target'))]).length, 1);
});

test('leaving or changing an unfinished target discards all accumulated time', () => {
  for (const withExit of [false, true]) {
    const engine = new GestureEngine(), actor = hand('open');
    frames(engine, [actor], 0, 1000, target('a'));
    let start = 1020;
    if (withExit) {
      const empty = frames(engine, [actor], 1020, 1160, target(null));
      assert.equal(clicks(empty).length, 0);
      assert.ok(empty.every(result => result.progress === 0));
      start = 1180;
    }
    const pending = engine.update([actor], start, target(withExit ? 'a' : 'b'));
    assert.equal(pending.mode, 'click-pending');
    assert.equal(pending.progress, 0);
    assert.equal(pending.selectionTargetId, withExit ? 'a' : 'b');
    if (!withExit) assert.equal(pending.resetSelection, true);
    assert.equal(clicks(frames(engine, [actor], start + 20, start + 1480, target(withExit ? 'a' : 'b'))).length, 0);
    assert.equal(clicks([engine.update([actor], start + 1500, target(withExit ? 'a' : 'b'))]).length, 1);
  }
});

test('bounded live-index jitter retains the same hover origin and deadline', () => {
  const engine = new GestureEngine(), actor = hand('open');
  const start = engine.update([actor], 0, target('poi'));
  const results = frames(engine, time => [hand('open', 0.35 + Math.sin(time / 300) * 0.06,
    0.35 + Math.cos(time / 310) * 0.03)], 20, 1500, target('poi'));
  assert.ok(results.every(result => result.selectionHandId === start.selectionHandId));
  assert.ok(results.every(result => result.selectionCursor.x === start.selectionCursor.x
    && result.selectionCursor.y === start.selectionCursor.y));
  assert.ok(results.some(result => Math.abs(result.selectionLiveCursor.x - start.selectionCursor.x) > 0.05));
  assert.equal(clicks(results).length, 1);
});

test('confirmation never repeats on the same target and a different target receives a new full dwell', () => {
  const engine = new GestureEngine(), actor = hand('open');
  assert.equal(clicks(frames(engine, [actor], 0, 1500, target('a'))).length, 1);
  const held = frames(engine, [actor], 1520, 2500, target('a'));
  assert.equal(clicks(held).length, 0);
  assert.ok(held.every(result => result.mode === 'click-confirmed'));
  const next = engine.update([actor], 2520, target('b'));
  assert.equal(next.mode, 'click-pending');
  assert.equal(next.progress, 0);
  assert.equal(next.selectionTargetId, 'b');
  assert.equal(clicks(frames(engine, [actor], 2540, 4000, target('b'))).length, 0);
  assert.equal(clicks([engine.update([actor], 4020, target('b'))]).length, 1);
  const returned = engine.update([actor], 4040, target('a'));
  assert.equal(returned.mode, 'click-pending', '1500 ms away from a rearms that target independently');
  assert.equal(returned.progress, 0);
  assert.equal(returned.selectionTargetId, 'a');
});

test('a confirmed target cannot be rearmed by a brief visit to a different target', () => {
  const engine = new GestureEngine(), actor = hand('open');
  assert.equal(clicks(frames(engine, [actor], 0, 1500, target('a'))).length, 1);
  const b = engine.update([actor], 1520, target('b'));
  assert.equal(b.mode, 'click-pending');
  frames(engine, [actor], 1540, 1580, target('b'));
  const early = engine.update([actor], 1600, target('a'));
  assert.notEqual(early.mode, 'click-pending');
  assert.equal(clicks(frames(engine, [actor], 1620, 2200, target('a'))).length, 0);
  frames(engine, [actor], 2220, 2340, target(null));
  const fresh = engine.update([actor], 2360, target('a'));
  assert.equal(fresh.mode, 'click-pending');
  assert.equal(fresh.progress, 0);
  assert.equal(clicks(frames(engine, [actor], 2380, 3840, target('a'))).length, 0);
  assert.equal(clicks([engine.update([actor], 3860, target('a'))]).length, 1);
});

test('a fist never selects its target; one or two fists retain exclusive pan events', () => {
  for (const count of [1, 2]) {
    const engine = new GestureEngine();
    const fists = Array.from({ length: count }, (_, index) => hand('fist', count === 1 ? 0.5 : index ? 0.70 : 0.35));
    const acquisition = frames(engine, fists, 0, 200, target('poi'));
    assert.equal(acquisition.at(-1).navigationKind, 'pan');
    assert.equal(clicks(acquisition).length, 0);
    const moved = fists.map(value => ({ ...value, landmarks: value.landmarks.map(point => ({ ...point, x: point.x + 0.04 })) }));
    const navigation = frames(engine, moved, 220, 1800, target('poi'));
    assert.ok(events(navigation).length > 0);
    assert.ok(events(navigation).every(event => event.type === 'pan'));
    assert.ok(navigation.every(result => result.navigationKind === 'pan'));
  }
});

test('two OK hands reserve zoom even when both index tips are over selectable targets', () => {
  const engine = new GestureEngine();
  const pair = [hand('ok', 0.35), hand('ok', 0.70)];
  const acquisition = frames(engine, pair, 0, 200, target('poi'));
  assert.equal(acquisition.at(-1).navigationKind, 'zoom');
  assert.ok(acquisition.every(result => !result.mode.startsWith('click-')));
  const widened = [hand('ok', 0.31), hand('ok', 0.74)];
  const navigation = frames(engine, widened, 220, 1800, target('poi'));
  assert.ok(events(navigation).length > 0);
  assert.ok(events(navigation).every(event => event.type === 'zoom'));
  assert.equal(clicks(navigation).length, 0);
});

// Set rows and the pre-fill carry-over (spec 6.3): "changing the weight on one set pre-fills it into the remaining sets".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suggestExercise } from '../app/js/engine/index.js';
import { buildRows, canLog, inputsFor, pickValues } from '../app/js/logging/index.js';
import { atLevel, carry, lift, makeLog } from '../test-support/engine-log.mjs';

const today = '2026-10-05';
const suggest = (log, exerciseId, templateCode, slot) => suggestExercise(log.state(), { exerciseId, templateCode, slot, today });
const fresh = () => makeLog();
const gobletFresh = () => suggest(fresh(), 'goblet-squat', 'A', 1); // starting weight 20
const set = (n, extra = {}) => ({ id: `set_${n}`, sessionId: 's', exerciseId: 'goblet-squat', setNumber: n, weightLbs: 20, reps: 10, suggestedWeightLbs: 20, suggestedLevel: null, ...extra });
const weights = (rows) => rows.map((r) => r.weightLbs);

describe('which boxes an exercise shows', () => {
  const inputs = (log, ...args) => inputsFor(suggest(log, ...args));
  test('weight and reps, level and reps, distance and weight, nothing', () => {
    const log = fresh();
    assert.deepEqual(inputs(log, 'goblet-squat', 'A', 1), { weight: true, level: false, reps: true, distance: false, hold: false });
    assert.deepEqual(inputs(log, 'trx-squat', 'A', 1), { weight: false, level: true, reps: true, distance: false, hold: false });
    assert.deepEqual(inputs(log, 'pushup', 'B', 5), { weight: false, level: true, reps: true, distance: false, hold: false });
    assert.deepEqual(inputs(log, 'farmer-carry', 'C', 5), { weight: true, level: false, reps: false, distance: true, hold: false });
    assert.deepEqual(inputs(log, 'dead-bug', 'A', 5), { weight: false, level: false, reps: true, distance: false, hold: false });
    assert.deepEqual(inputs(log, 'back-extension-45', 'B', 6), { weight: true, level: false, reps: true, distance: false, hold: false });
    assert.deepEqual(inputs(log, 'trx-plank', 'A', 5), { weight: false, level: false, reps: false, distance: false, hold: true });
    assert.deepEqual(inputs(log, 'band-pull-apart', 'A', 6), { weight: false, level: false, reps: true, distance: false, hold: false });
  });
});

describe('a fresh exercise', () => {
  test('one todo row per set of the slot, weight and reps pre-filled with the recommendation, ready to log', () => {
    const s = gobletFresh(); // week 1: the full 3 sets
    const rows = buildRows({ suggestion: s, planned: s.sets });
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => [r.setNumber, r.status, r.weightLbs, r.reps, r.canLog]), [[1, 'todo', 20, 8, true], [2, 'todo', 20, 8, true], [3, 'todo', 20, 8, true]]);
    assert.ok(rows.every((r) => !r.weightChanged));
  });

  test('a row can be logged once its reps are in', () => {
    const s = suggest(fresh(), 'leg-press', 'B', 1);
    const [row] = buildRows({ suggestion: s, planned: 1, draftRows: { 1: { reps: 10 } } });
    assert.equal(row.weightLbs, 50, 'no history: the first-loaded weight, not 0 (v1.14)');
    assert.equal(row.canLog, true);
  });

  test('weight 0 counts as a weight: bodyweight back extension, or a set logged at 0', () => {
    const [row] = buildRows({ suggestion: suggest(fresh(), 'back-extension-45', 'B', 6), planned: 1, draftRows: { 1: { reps: 10 } } });
    assert.equal(row.weightLbs, 0);
    assert.equal(row.canLog, true);
    const [typed] = buildRows({ suggestion: suggest(fresh(), 'leg-press', 'B', 1), planned: 1, draftRows: { 1: { weightLbs: 0, reps: 10 } } });
    assert.equal(typed.weightLbs, 0);
    assert.equal(typed.canLog, true);
  });

  test('a cleared weight box cannot be logged', () => {
    const [row] = buildRows({ suggestion: gobletFresh(), planned: 1, draftRows: { 1: { weightLbs: null, reps: 10 } } });
    assert.equal(row.weightLbs, null);
    assert.equal(row.canLog, false);
  });
});

describe('carry-over of weight to the remaining sets', () => {
  const s = () => suggest(fresh(), 'goblet-squat', 'A', 1);
  const three = { planned: 3 };

  test('changing set 1 pre-fills sets 2 and 3', () => {
    const rows = buildRows({ suggestion: s(), ...three, draftRows: { 1: { weightLbs: 25 } } });
    assert.deepEqual(weights(rows), [25, 25, 25]);
    assert.deepEqual(rows.map((r) => r.weightChanged), [true, true, true]);
  });

  test('changing set 2 pre-fills set 3 only, never set 1', () => {
    const rows = buildRows({ suggestion: s(), ...three, draftRows: { 2: { weightLbs: 30 } } });
    assert.deepEqual(weights(rows), [20, 30, 30]);
  });

  test('a value typed into a later row stops the carry from the earlier one', () => {
    const rows = buildRows({ suggestion: s(), ...three, draftRows: { 1: { weightLbs: 25 }, 2: { weightLbs: 22.5 } } });
    assert.deepEqual(weights(rows), [25, 22.5, 22.5]);
  });

  test('a logged weight carries to the rows after it', () => {
    const rows = buildRows({ suggestion: s(), ...three, logged: [set(1, { weightLbs: 27.5 })] });
    assert.deepEqual(weights(rows), [27.5, 27.5, 27.5]);
    assert.equal(rows[0].status, 'done');
    assert.equal(rows[0].weightChanged, true); // 27.5 against the 20 that was suggested when it was logged
    assert.equal(rows[0].suggestedWeightLbs, 20);
  });

  test('clearing a box carries the empty box forward (it has to be filled in)', () => {
    const rows = buildRows({ suggestion: s(), ...three, draftRows: { 1: { weightLbs: null } } });
    assert.deepEqual(weights(rows), [null, null, null]);
  });

  test('reps start at the recommended number and follow the row before, like the weight', () => {
    const target = s().targetReps;
    assert.deepEqual(buildRows({ suggestion: s(), ...three }).map((r) => r.reps), [target, target, target]);
    assert.deepEqual(buildRows({ suggestion: s(), ...three, logged: [set(1, { reps: 12 })] }).map((r) => r.reps), [12, 12, 12]);
    assert.deepEqual(buildRows({ suggestion: s(), ...three, draftRows: { 2: { reps: 9 } } }).map((r) => r.reps), [target, 9, 9]);
  });

  test('levels carry the same way (TRX and the pushup ladder)', () => {
    const trx = suggest(fresh(), 'trx-squat', 'A', 1);
    assert.equal(trx.level, 2);
    assert.deepEqual(buildRows({ suggestion: trx, planned: 3, draftRows: { 2: { levelNumber: 4 } } }).map((r) => r.levelNumber), [2, 4, 4]);
    const pushup = suggest(fresh(), 'pushup', 'B', 5);
    assert.deepEqual(buildRows({ suggestion: pushup, planned: 3, draftRows: { 1: { levelNumber: 3 } } }).map((r) => r.levelNumber), [3, 3, 3]);
  });

  test('an exercise with no weight suggestion (an unseeded swap) starts empty and carries what is typed', () => {
    const swapped = suggest(fresh(), 'bulgarian-split-squat', 'C', 1);
    assert.equal(swapped.weightLbs, null);
    assert.deepEqual(weights(buildRows({ suggestion: swapped, planned: 3 })), [null, null, null]);
    assert.deepEqual(weights(buildRows({ suggestion: swapped, planned: 3, draftRows: { 1: { weightLbs: 15 } } })), [15, 15, 15]);
  });
});

describe('done, editing and undone rows', () => {
  const s = () => suggest(fresh(), 'goblet-squat', 'A', 1);

  test('logged sets are done rows; the rest are todo, in set order', () => {
    const rows = buildRows({ suggestion: s(), planned: 3, logged: [set(2)] });
    assert.deepEqual(rows.map((r) => [r.setNumber, r.status]), [[1, 'todo'], [2, 'done'], [3, 'todo']]);
    assert.equal(rows[1].canLog, false);
    assert.equal(rows[1].setId, 'set_2');
  });

  test('an undone set (gone from state) is a todo row again, and the number can be logged again', () => {
    const rows = buildRows({ suggestion: s(), planned: 2, logged: [set(1)] });
    assert.equal(rows[1].status, 'todo');
  });

  test('an editing row shows what was typed over what was logged, and is dirty only when it differs', () => {
    const logged = [set(1, { weightLbs: 25 })];
    const same = buildRows({ suggestion: s(), planned: 1, logged, editing: true })[0];
    assert.deepEqual([same.status, same.weightLbs, same.dirty], ['editing', 25, false]);
    const typed = buildRows({ suggestion: s(), planned: 1, logged, editing: true, draftRows: { 1: { weightLbs: 27.5, reps: 8 } } })[0];
    assert.deepEqual([typed.weightLbs, typed.reps, typed.dirty], [27.5, 8, true]);
    assert.equal(typed.canLog, true);
  });

  test('typed values are ignored on a done row that is not being edited', () => {
    const row = buildRows({ suggestion: s(), planned: 1, logged: [set(1, { weightLbs: 25 })], draftRows: { 1: { weightLbs: 99 } } })[0];
    assert.equal(row.weightLbs, 25);
  });

  test('extra sets add rows; sets logged beyond the plan keep their rows', () => {
    assert.equal(buildRows({ suggestion: s(), planned: 2, extra: 1 }).length, 3);
    const rows = buildRows({ suggestion: s(), planned: 2, logged: [set(1), set(2), set(3), set(4)] });
    assert.deepEqual(rows.map((r) => r.setNumber), [1, 2, 3, 4]);
    assert.ok(rows.every((r) => r.status === 'done'));
  });

  test('two devices that logged the same set number both show, in id order', () => {
    const rows = buildRows({ suggestion: s(), planned: 2, logged: [set(1, { id: 'set_b' }), set(1, { id: 'set_a' })] });
    assert.deepEqual(rows.map((r) => [r.setNumber, r.id]), [[1, 'set_a'], [1, 'set_b'], [2, 'goblet-squat:2']]);
  });

  test('an exercise no longer in the plan (planned 0) shows only what was logged', () => {
    assert.equal(buildRows({ suggestion: s(), planned: 0, logged: [set(1)] }).length, 1);
    assert.equal(buildRows({ suggestion: s(), planned: 0 }).length, 0);
  });
});

describe('other kinds of exercise', () => {
  test('carries: weight and distance, distance pre-filled with the 40 m target', () => {
    const c = suggest(fresh(), 'farmer-carry', 'C', 5);
    const [row] = buildRows({ suggestion: c, planned: 1 });
    assert.equal(row.weightLbs, 35);
    assert.equal(row.distanceM, 40);
    assert.equal(row.canLog, true);
    assert.equal(buildRows({ suggestion: c, planned: 2, draftRows: { 1: { distanceM: 30 } } })[1].distanceM, 30, 'and follows the row before');
  });

  test('holds log completion only', () => {
    const plank = suggest(fresh(), 'trx-plank', 'A', 5);
    const [row] = buildRows({ suggestion: plank, planned: 2 });
    assert.equal(row.canLog, true);
    assert.equal(row.weightLbs, null);
  });

  test('dead bug needs reps only, pre-filled with its 8 per side', () => {
    const bug = suggest(fresh(), 'dead-bug', 'A', 5);
    const rows = buildRows({ suggestion: bug, planned: 2 });
    assert.deepEqual(rows.map((r) => [r.reps, r.weightLbs, r.canLog]), [[8, null, true], [8, null, true]]);
    assert.equal(buildRows({ suggestion: bug, planned: 1, draftRows: { 1: { reps: null } } })[0].canLog, false, 'a cleared box has to be filled in');
  });

  test('the pushup ladder pre-fills the bottom of the level\'s range', () => {
    const p = suggest(fresh(), 'pushup', 'B', 5);
    const ladder = (level) => (level === 1 ? 10 : 8);
    assert.deepEqual(buildRows({ suggestion: p, planned: 2, targetRepsFor: ladder }).map((r) => r.reps), [10, 10]);
    assert.equal(buildRows({ suggestion: p, planned: 1, draftRows: { 1: { levelNumber: 3 } }, targetRepsFor: ladder })[0].reps, 8);
  });

  test('history changes the suggestion, and so the pre-fill', () => {
    const log = fresh();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 30, [12, 12])]);
    const s = suggest(log, 'goblet-squat', 'A', 1);
    assert.deepEqual(weights(buildRows({ suggestion: s, planned: 2 })), [30, 30]);
    const c = fresh();
    c.session('2026-09-28', 'B', [atLevel('trx-row', 3, [10, 10])]);
    assert.equal(suggest(c, 'trx-row', 'A', 4).level, 3);
    const d = fresh();
    d.session('2026-09-28', 'C', [carry('farmer-carry', 40, [40, 40, 40])]);
    assert.equal(buildRows({ suggestion: suggest(d, 'farmer-carry', 'C', 5), planned: 1 })[0].weightLbs, 40);
  });
});

describe('canLog and pickValues', () => {
  test('levels must be whole numbers 1 to 5', () => {
    const inputs = { weight: false, level: true, reps: true, distance: false, hold: false };
    assert.equal(canLog({ levelNumber: 3, reps: 10 }, inputs), true);
    for (const bad of [0, 6, 2.5, null, undefined]) assert.equal(canLog({ levelNumber: bad, reps: 10 }, inputs), false, String(bad));
  });

  test('pickValues drops what the exercise does not show', () => {
    const inputs = inputsFor(suggest(fresh(), 'dead-bug', 'A', 5));
    assert.deepEqual(pickValues({ weightLbs: 20, levelNumber: 2, reps: 8, distanceM: 40, rir: 2 }, inputs), { weightLbs: null, levelNumber: null, reps: 8, distanceM: null });
  });
});

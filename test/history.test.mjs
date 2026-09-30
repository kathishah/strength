// What counts as history for the engine (plan section 14, decision 4).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveExercise } from '../app/js/engine/config.js';
import { exerciseHistory } from '../app/js/engine/history.js';
import { pacificMs, makeLog, lift, carry, atLevel, ramp } from '../test-support/engine-log.mjs';

const hist = (log, exerciseId, opts = {}) => exerciseHistory(log.state(), resolveExercise(exerciseId, { settings: log.state().settings, ...opts }));

describe('which sessions and sets count', () => {
  test('only finished sessions', () => {
    const log = makeLog()
      .session('2026-09-28', 'A', [lift('goblet-squat', 20, [10, 10])])
      .session('2026-10-05', 'A', [lift('goblet-squat', 25, [10, 10])], { finished: false });
    assert.deepEqual(hist(log, 'goblet-squat').map((h) => h.date), ['2026-09-28']);
  });

  test('ramp-up sets and sets marked not completed are left out; so are sets with nothing recorded', () => {
    const log = makeLog().session('2026-09-28', 'A', [
      ramp('goblet-squat', [{ weightLbs: 10, reps: 8 }, { weightLbs: 15, reps: 4 }]),
      lift('goblet-squat', 25, [12, 11]),
      lift('goblet-squat', 25, [9], { completed: false }),
    ]);
    const [h] = hist(log, 'goblet-squat');
    assert.deepEqual(h.sets.map((s) => s.reps), [12, 11]);
  });

  test('a set with no reps recorded is left out', () => {
    const log = makeLog().session('2026-09-28', 'A', [{ exerciseId: 'goblet-squat', weightLbs: 25, reps: [12] }]);
    log.session('2026-10-05', 'A', [{ exerciseId: 'goblet-squat', weightLbs: 25, distances: [null] }]);
    assert.equal(hist(log, 'goblet-squat').length, 1);
  });

  test('a session with only ramp-up sets of the exercise is not history for it', () => {
    const log = makeLog().session('2026-09-28', 'A', [ramp('goblet-squat', [{ weightLbs: 10, reps: 8 }])]);
    assert.deepEqual(hist(log, 'goblet-squat'), []);
  });

  test('each exercise has its own history (a swap does not merge them)', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 25, [10]), lift('leg-press', 50, [10])]);
    assert.equal(hist(log, 'goblet-squat')[0].baseLoad, 25);
    assert.equal(hist(log, 'leg-press')[0].baseLoad, 50);
    assert.deepEqual(hist(log, 'db-bench-press'), []);
  });
});

describe('base load', () => {
  test('the heaviest weight used; only the sets at that weight are judged (spec 5.2)', () => {
    const log = makeLog().session('2026-09-28', 'A', [
      lift('goblet-squat', 20, [12]),
      lift('goblet-squat', 25, [12, 9]),
      lift('goblet-squat', 20, [12]),
    ]);
    const [h] = hist(log, 'goblet-squat');
    assert.equal(h.baseLoad, 25);
    assert.deepEqual(h.atBase.map((s) => s.reps), [12, 9]);
    assert.equal(h.sets.length, 4);
  });

  test('a set with no weight is a 0-lb set', () => {
    const log = makeLog().session('2026-09-28', 'B', [{ exerciseId: 'back-extension-45', reps: [15, 15] }]);
    assert.equal(hist(log, 'back-extension-45')[0].baseLoad, 0);
  });

  test('suspension: the highest level; sets with no level do not count', () => {
    const log = makeLog().session('2026-09-28', 'A', [atLevel('trx-row', 2, [15]), atLevel('trx-row', 3, [12, 11]), { exerciseId: 'trx-row', reps: [15] }]);
    const [h] = hist(log, 'trx-row');
    assert.equal(h.baseLevel, 3);
    assert.deepEqual(h.atBase.map((s) => s.reps), [12, 11]);
    assert.equal(h.sets.length, 3);
  });

  test('a carry is judged by distance, not reps', () => {
    const log = makeLog().session('2026-09-28', 'C', [carry('farmer-carry', 35, [40, 40, 30])]);
    const [h] = hist(log, 'farmer-carry');
    assert.deepEqual(h.atBase.map((s) => s.distanceM), [40, 40, 30]);
  });

  test('pushup: base level; below level 5 there is no load', () => {
    const log = makeLog().session('2026-09-28', 'B', [atLevel('pushup', 1, [20, 20]), atLevel('pushup', 2, [8])]);
    const [h] = hist(log, 'pushup');
    assert.deepEqual([h.baseLevel, h.baseLoad], [2, null]);
  });
});

describe('dates and order', () => {
  test('the date is the Pacific date of startedAt, not the UTC date', () => {
    const log = makeLog().session('2026-10-01', 'A', [lift('goblet-squat', 20, [10])], { time: '23:30' }); // 06:30 UTC on 10-02
    assert.equal(hist(log, 'goblet-squat')[0].date, '2026-10-01');
  });

  test('sessions are ordered by instant: 01:15 PST after 01:30 PDT on the fall-back day', () => {
    const log = makeLog()
      .session('2026-11-01', 'A', [lift('goblet-squat', 25, [10])], { id: 'first', startMs: Date.parse('2026-11-01T01:30:00.000-07:00') })
      .session('2026-11-01', 'A', [lift('goblet-squat', 30, [10])], { id: 'second', startMs: Date.parse('2026-11-01T01:15:00.000-08:00') });
    assert.deepEqual(hist(log, 'goblet-squat').map((h) => h.sessionId), ['first', 'second']);
    assert.ok('2026-11-01T01:15:00.000-08:00' < '2026-11-01T01:30:00.000-07:00', 'as strings they sort the other way');
  });

  test('pacificMs finds the wall-clock time', () => {
    assert.equal(new Date(pacificMs('2026-12-15', '08:00')).toISOString(), '2026-12-15T16:00:00.000Z');
    assert.equal(new Date(pacificMs('2026-10-01', '08:00')).toISOString(), '2026-10-01T15:00:00.000Z');
  });
});

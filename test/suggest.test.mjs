// Suggestions beyond the spec examples: the rules' edges, the 5.12 precedence in every combination, invariants over
// random histories, and independence from event order. The spec's own examples are in spec-examples.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suggestExercise } from '../app/js/engine/suggest.js';
import { firstSlotFor } from '../app/js/engine/config.js';
import { replay } from '../app/js/store/replay.js';
import { RULES } from '../app/js/seed/rules.js';
import { atLevel, carry, lift, makeLog, rng, shuffled } from '../test-support/engine-log.mjs';

const sug = (log, exerciseId, today, extra = {}) =>
  suggestExercise(log.state(), { exerciseId, ...firstSlotFor(exerciseId), today, ...extra });

describe('double progression (5.2)', () => {
  test('top of the range on every set at the base load: +1 increment, bottom of the range', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12, 12])]);
    const s = sug(log, 'goblet-squat', '2026-10-05');
    assert.deepEqual([s.weightLbs, s.targetReps, s.source, s.fromWeightLbs, s.increased], [40, 8, 'earned', 35, true]);
  });

  test('rule 1 judges only the sets at the heaviest weight', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 30, [8]), lift('goblet-squat', 35, [12, 12])]);
    assert.equal(sug(log, 'goblet-squat', '2026-10-05').weightLbs, 40);
  });

  test('hold: same load, aim for one more rep than the weakest set, inside the range', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 11, 10])]);
    const s = sug(log, 'goblet-squat', '2026-10-05');
    assert.deepEqual([s.weightLbs, s.source, s.targetReps, s.increased], [35, 'hold', 11, false]);
  });

  test('one session below the range does not reduce; two do', () => {
    const one = makeLog().session('2026-09-28', 'B', [lift('lat-pulldown', 100, [12, 8])]);
    assert.equal(sug(one, 'lat-pulldown', '2026-10-05').source, 'hold');
    const two = makeLog()
      .session('2026-09-28', 'B', [lift('lat-pulldown', 100, [12, 8])])
      .session('2026-10-05', 'B', [lift('lat-pulldown', 100, [11, 9])]);
    const s = sug(two, 'lat-pulldown', '2026-10-12');
    assert.deepEqual([s.weightLbs, s.source, s.increased], [90, 'reduction', false]);
  });

  test('the two weak sessions do not have to be at the same load: the reduction is from the latest base', () => {
    const log = makeLog()
      .session('2026-09-28', 'B', [lift('lat-pulldown', 90, [9])])
      .session('2026-10-05', 'B', [lift('lat-pulldown', 100, [9])]);
    assert.equal(sug(log, 'lat-pulldown', '2026-10-12').weightLbs, 90);
  });

  test('a good session between weak ones stops the reduction', () => {
    const log = makeLog()
      .session('2026-09-28', 'B', [lift('lat-pulldown', 100, [8])])
      .session('2026-10-05', 'B', [lift('lat-pulldown', 100, [10, 10])])
      .session('2026-10-12', 'B', [lift('lat-pulldown', 100, [8])]);
    assert.equal(sug(log, 'lat-pulldown', '2026-10-19').source, 'hold');
  });

  test('reduction is at least one increment: 25 lb dumbbells drop to 20, not back to 25', () => {
    const log = makeLog()
      .session('2026-09-28', 'A', [lift('goblet-squat', 25, [6])])
      .session('2026-10-05', 'A', [lift('goblet-squat', 25, [7])]);
    assert.equal(sug(log, 'goblet-squat', '2026-10-12').weightLbs, 20);
  });

  test('a reduction never goes below 0, and a load already at 0 stays at 0', () => {
    const log = makeLog()
      .session('2026-09-28', 'B', [lift('hip-thrust', 0, [6])])
      .session('2026-10-05', 'B', [lift('hip-thrust', 0, [7])]);
    const s = sug(log, 'hip-thrust', '2026-10-12');
    assert.deepEqual([s.weightLbs, s.source], [0, 'reduction']);
  });

  test('a reduction below the first-loaded weight goes to 0 (5.4): hip thrust 45 -> 0', () => {
    const log = makeLog()
      .session('2026-09-28', 'B', [lift('hip-thrust', 45, [8])])
      .session('2026-10-05', 'B', [lift('hip-thrust', 45, [8])]);
    assert.equal(sug(log, 'hip-thrust', '2026-10-12').weightLbs, 0);
  });

  test('progression uses the logged weight, not the suggested one', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12, 12], { suggestedWeightLbs: 40, suggestionSource: 'earned' })]);
    assert.equal(sug(log, 'goblet-squat', '2026-10-05').weightLbs, 40);
    assert.equal(sug(log, 'goblet-squat', '2026-10-05').fromWeightLbs, 35);
  });

  test('a fixed rep count (repMin = repMax = 8) is at the top when reached and never below it then', () => {
    const log = makeLog().session('2026-09-28', 'C', [lift('reverse-lunge', 10, [8, 8])]);
    assert.deepEqual([sug(log, 'reverse-lunge', '2026-10-05').weightLbs, sug(log, 'reverse-lunge', '2026-10-05').targetReps], [15, 8]);
    const weak = makeLog().session('2026-09-28', 'C', [lift('reverse-lunge', 10, [8, 7])]);
    assert.equal(sug(weak, 'reverse-lunge', '2026-10-05').source, 'hold');
  });

  test('a carry is judged by distance: full distance on every set -> +5 lbs (5.3)', () => {
    const full = makeLog().session('2026-09-28', 'C', [carry('farmer-carry', 35, [40, 40, 40])]);
    const s = sug(full, 'farmer-carry', '2026-10-05');
    assert.deepEqual([s.weightLbs, s.source, s.targetReps, s.targetDistanceM], [40, 'earned', null, 40]);
    const short = makeLog().session('2026-09-28', 'C', [carry('farmer-carry', 35, [40, 40, 35])]);
    assert.equal(sug(short, 'farmer-carry', '2026-10-05').weightLbs, 35);
  });

  test('the load increment setting is used', () => {
    const log = makeLog().setting('loadIncrement:goblet-squat', 2.5).session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12])]);
    assert.equal(sug(log, 'goblet-squat', '2026-10-05').weightLbs, 37.5);
  });
});

describe('first session and starting weights (5.6)', () => {
  test('no history: the seeded starting weight, source starting, bottom of the range', () => {
    const s = sug(makeLog(), 'lat-pulldown', '2026-09-28');
    assert.deepEqual([s.weightLbs, s.source, s.targetReps, s.fromWeightLbs, s.last], [60, 'starting', 10, null, null]);
  });

  test('the trap bar starts at trapBarWeightLbs (default 45)', () => {
    assert.equal(sug(makeLog(), 'trap-bar-deadlift', '2026-09-28').weightLbs, 45);
    assert.equal(sug(makeLog().setting('trapBarWeightLbs', 55), 'trap-bar-deadlift', '2026-09-28').weightLbs, 55);
  });

  test('a startingWeight setting overrides the seed (and the trap bar setting)', () => {
    assert.equal(sug(makeLog().setting('startingWeight:goblet-squat', 25), 'goblet-squat', '2026-09-28').weightLbs, 25);
    assert.equal(sug(makeLog().setting('startingWeight:trap-bar-deadlift', 65), 'trap-bar-deadlift', '2026-09-28').weightLbs, 65);
  });

  test('a cleared startingWeight (null) falls back to the seed', () => {
    assert.equal(sug(makeLog().setting('startingWeight:goblet-squat', null), 'goblet-squat', '2026-09-28').weightLbs, 20);
  });

  test('a swapped-in alternative with no seeded value: no pre-fill and a prompt', () => {
    const s = sug(makeLog(), 'machine-row', '2026-09-28', { templateCode: 'A', slot: 4 });
    assert.deepEqual([s.weightLbs, s.source, s.hints.map((h) => h.code)], [null, null, ['enter-weight']]);
  });

  test('a swapped-in alternative takes the slot rep range and set count', () => {
    const s = sug(makeLog(), 'machine-row', '2026-12-14', { templateCode: 'A', slot: 4 });
    assert.deepEqual([s.repMin, s.repMax, s.sets], [10, 12, 3]);
    const carrySwap = sug(makeLog(), 'suitcase-carry', '2026-12-14', { templateCode: 'C', slot: 5 });
    assert.deepEqual([carrySwap.targetDistanceM, carrySwap.repMin, carrySwap.weightLbs], [40, null, null]);
  });

  test('a swapped-in alternative with history progresses from it', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('machine-row', 80, [12, 12, 12])]);
    assert.equal(sug(log, 'machine-row', '2026-10-05', { templateCode: 'A', slot: 4 }).weightLbs, 90);
  });
});

describe('deload weeks use the base load unchanged (5.8)', () => {
  const earnedLog = () => makeLog().session('2026-11-02', 'A', [lift('goblet-squat', 35, [12, 12, 12])]);

  test('week 11: base load, source deload, no increase even when earned', () => {
    const s = sug(earnedLog(), 'goblet-squat', '2026-12-07');
    assert.deepEqual([s.weightLbs, s.source, s.increased, s.sets], [35, 'deload', false, 2]);
  });

  test('week 11: no reduction either', () => {
    const log = makeLog()
      .session('2026-11-02', 'B', [lift('lat-pulldown', 100, [8])])
      .session('2026-11-09', 'B', [lift('lat-pulldown', 100, [8])]);
    const s = sug(log, 'lat-pulldown', '2026-12-07');
    assert.deepEqual([s.weightLbs, s.source], [100, 'deload']);
  });

  test('deload sessions are not history; the week after they change nothing', () => {
    const log = earnedLog().session('2026-12-07', 'A', [lift('goblet-squat', 35, [8])], { isDeload: true });
    const s = sug(log, 'goblet-squat', '2026-12-14');
    assert.deepEqual([s.weightLbs, s.source], [40, 'earned']);
  });

  test('a new exercise in a deload week gets its starting weight, marked deload, and no calibration', () => {
    const s = sug(makeLog(), 'goblet-squat', '2026-12-07');
    assert.deepEqual([s.weightLbs, s.source, s.isCalibration], [20, 'deload', false]);
  });
});

describe('back pain gate (5.9)', () => {
  const earned = () => makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12, 12])]);

  test('above 3 on a loadsBack exercise holds an earned increase, source gated', () => {
    const s = sug(earned(), 'goblet-squat', '2026-10-05', { backPainBefore: 4 });
    assert.deepEqual([s.weightLbs, s.source, s.hints.map((h) => h.code)], [35, 'gated', ['back-pain-gate']]);
  });

  test('3 or below, or not entered: no gate', () => {
    assert.equal(sug(earned(), 'goblet-squat', '2026-10-05', { backPainBefore: 3 }).weightLbs, 40);
    assert.equal(sug(earned(), 'goblet-squat', '2026-10-05', { backPainBefore: null }).weightLbs, 40);
    assert.equal(sug(earned(), 'goblet-squat', '2026-10-05').weightLbs, 40);
  });

  test('exercises that do not load the back are not gated', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('db-bench-press', 30, [12, 12, 12])]);
    assert.equal(sug(log, 'db-bench-press', '2026-10-05', { backPainBefore: 9 }).weightLbs, 35);
  });

  test('reductions still apply when gated', () => {
    const log = makeLog()
      .session('2026-09-28', 'A', [lift('goblet-squat', 30, [6])])
      .session('2026-10-05', 'A', [lift('goblet-squat', 30, [7])]);
    const s = sug(log, 'goblet-squat', '2026-10-12', { backPainBefore: 8 });
    assert.deepEqual([s.weightLbs, s.source], [25, 'reduction']);
  });

  test('a gated exercise that would only hold is a hold, with the note', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [10, 10, 10])]);
    const s = sug(log, 'goblet-squat', '2026-10-05', { backPainBefore: 9 });
    assert.deepEqual([s.source, s.hints.map((h) => h.code)], ['hold', ['back-pain-gate']]);
  });

  test('the gate does not apply to a 0 first session (nothing to increase)', () => {
    const s = sug(makeLog(), 'goblet-squat', '2026-09-28', { backPainBefore: 9 });
    assert.deepEqual([s.weightLbs, s.source], [20, 'starting']);
  });
});

describe('scheduled increases (5.12)', () => {
  // Lat pulldown: 60, 60 (calibration ended Oct 13), then 70 on Oct 20, reps in range but not at the top.
  const pulldown = () => makeLog()
    .session('2026-10-06', 'B', [lift('lat-pulldown', 60, [11, 10, 10])])
    .session('2026-10-13', 'B', [lift('lat-pulldown', 60, [11, 10, 10])])
    .session('2026-10-20', 'B', [lift('lat-pulldown', 70, [11, 10, 10])]);

  test('the timer runs from the last increase (Oct 20): due on Nov 10, not on Nov 9', () => {
    assert.equal(sug(pulldown(), 'lat-pulldown', '2026-11-09').source, 'hold');
    const due = sug(pulldown(), 'lat-pulldown', '2026-11-10');
    assert.deepEqual([due.weightLbs, due.source, due.targetReps, due.increased], [80, 'scheduled', 10, true]);
    assert.equal(due.lastIncreaseDate, '2026-10-20');
    assert.equal(due.nextScheduledDate, '2026-11-10');
  });

  test('with no increase yet the timer runs from the second calibration session', () => {
    const log = makeLog()
      .session('2026-10-06', 'B', [lift('lat-pulldown', 60, [11, 10, 10])])
      .session('2026-10-13', 'B', [lift('lat-pulldown', 60, [11, 10, 10])]);
    assert.equal(sug(log, 'lat-pulldown', '2026-11-02').source, 'hold');
    assert.equal(sug(log, 'lat-pulldown', '2026-11-03').source, 'scheduled');
    assert.equal(sug(log, 'lat-pulldown', '2026-11-03').lastIncreaseDate, null);
  });

  test('not during calibration: one session done, however long ago', () => {
    const log = makeLog().session('2026-09-28', 'B', [lift('lat-pulldown', 60, [11, 10, 10])]);
    const s = sug(log, 'lat-pulldown', '2027-01-04');
    assert.deepEqual([s.source, s.nextScheduledDate], ['hold', null]);
  });

  test('the interval setting is used, and the global and per-exercise switches', () => {
    assert.equal(sug(pulldown().setting('scheduledIncreaseDays', 14), 'lat-pulldown', '2026-11-03').source, 'scheduled');
    assert.equal(sug(pulldown().setting('scheduledIncreasesEnabled', false), 'lat-pulldown', '2026-12-01').source, 'hold');
    assert.equal(sug(pulldown().setting('scheduledIncrease:lat-pulldown', false), 'lat-pulldown', '2026-12-01').source, 'hold');
    assert.equal(sug(pulldown().setting('scheduledIncrease:lat-pulldown', false), 'lat-pulldown', '2026-12-01').scheduledIncrease, 'off');
    // Another exercise's switch does not matter; a switch set back to true is on.
    assert.equal(sug(pulldown().setting('scheduledIncrease:leg-press', false), 'lat-pulldown', '2026-11-10').source, 'scheduled');
    assert.equal(sug(pulldown().setting('scheduledIncrease:lat-pulldown', false).setting('scheduledIncrease:lat-pulldown', true), 'lat-pulldown', '2026-11-10').source, 'scheduled');
  });

  test('turned off, an earned increase still applies', () => {
    const log = makeLog().session('2026-10-06', 'B', [lift('lat-pulldown', 60, [12, 12, 12])]).setting('scheduledIncreasesEnabled', false);
    assert.equal(sug(log, 'lat-pulldown', '2026-10-13').source, 'earned');
  });

  test('a manual override to a heavier weight resets the timer', () => {
    const log = pulldown().session('2026-11-03', 'B', [lift('lat-pulldown', 75, [11, 10, 10])]);
    assert.equal(sug(log, 'lat-pulldown', '2026-11-10').source, 'hold');
    assert.equal(sug(log, 'lat-pulldown', '2026-11-24').weightLbs, 85);
  });

  test('a lighter session does not reset the timer', () => {
    const log = pulldown().session('2026-10-27', 'B', [lift('lat-pulldown', 60, [11, 10, 10])]);
    assert.equal(sug(log, 'lat-pulldown', '2026-11-10').source, 'scheduled');
  });

  test('not applied to bodyweight, the pushup ladder, holds or unseeded swaps without history', () => {
    const log = makeLog()
      .session('2026-09-28', 'A', [{ exerciseId: 'dead-bug', reps: [8, 8] }])
      .session('2026-10-05', 'A', [{ exerciseId: 'dead-bug', reps: [8, 8] }])
      .session('2026-09-30', 'B', [atLevel('pushup', 1, [15, 15]), atLevel('trx-plank', 1, [30])])
      .session('2026-10-07', 'B', [atLevel('pushup', 1, [15, 15])]);
    for (const id of ['dead-bug', 'pushup', 'trx-plank']) {
      const s = sug(log, id, '2027-01-04');
      assert.notEqual(s.source, 'scheduled', id);
      assert.equal(s.nextScheduledDate, null, id);
    }
  });

  test('hip thrust and back extension at 0 lb are loads: the scheduled increase applies', () => {
    const log = makeLog()
      .session('2026-10-06', 'B', [lift('back-extension-45', 0, [12, 12])])
      .session('2026-10-13', 'B', [lift('back-extension-45', 0, [12, 12])]);
    assert.deepEqual([sug(log, 'back-extension-45', '2026-11-03').weightLbs, sug(log, 'back-extension-45', '2026-11-03').source], [5, 'scheduled']);
  });
});

describe('5.12 precedence in every combination', () => {
  // Goblet squat (loadsBack), base 25, out of calibration after two sessions (Oct 6 and Oct 13).
  // Flags: history ('hold' | 'earned' | 'reduction' after the last two sessions), due (Nov 3, 21 days after Oct 13, else
  // Oct 27), gate (back pain 5), deload (a manual deload in the week of that day: week 6 when due, week 5 when not).
  for (const deload of [false, true]) {
    for (const history of ['hold', 'earned', 'reduction']) {
      for (const due of [false, true]) {
        for (const gate of [false, true]) {
          test(`deload=${deload} history=${history} due=${due} gate=${gate}`, () => {
            const log = makeLog()
              .session('2026-10-06', 'A', [lift('goblet-squat', 25, history === 'reduction' ? [7, 9, 9] : [10, 10, 10])])
              .session('2026-10-13', 'A', [lift('goblet-squat', 25, { hold: [10, 10, 10], earned: [12, 12, 12], reduction: [7, 9, 9] }[history])]);
            const today = due ? '2026-11-03' : '2026-10-27';
            if (deload) log.deload(due ? 6 : 5);
            const s = suggestExercise(log.state(), { exerciseId: 'goblet-squat', templateCode: 'A', slot: 1, today, backPainBefore: gate ? 5 : null });

            const want = (() => {
              if (deload) return { weightLbs: 25, source: 'deload' };
              if (history === 'reduction') return { weightLbs: 20, source: 'reduction' };
              const increaseDue = history === 'earned' || due;
              if (increaseDue && gate) return { weightLbs: 25, source: 'gated' };
              if (history === 'earned') return { weightLbs: 30, source: 'earned' };
              if (due) return { weightLbs: 30, source: 'scheduled' };
              return { weightLbs: 25, source: 'hold' };
            })();
            assert.deepEqual({ weightLbs: s.weightLbs, source: s.source }, want);
          });
        }
      }
    }
  }
  test('a due increase deferred by a deload is applied at the first session after it', () => {
    const log = makeLog()
      .session('2026-10-06', 'A', [lift('goblet-squat', 25, [10, 10, 10])])
      .session('2026-10-13', 'A', [lift('goblet-squat', 25, [10, 10, 10])])
      .deload(6);
    const during = suggestExercise(log.state(), { exerciseId: 'goblet-squat', templateCode: 'A', slot: 1, today: '2026-11-03' });
    const after = suggestExercise(log.state(), { exerciseId: 'goblet-squat', templateCode: 'A', slot: 1, today: '2026-11-09' });
    assert.deepEqual([during.source, after.source, after.weightLbs], ['deload', 'scheduled', 30]);
  });
});

describe('suspension levels (5.4)', () => {
  test('never below level 1 or above level 5', () => {
    const low = makeLog()
      .session('2026-09-28', 'A', [atLevel('trx-row', 1, [8])])
      .session('2026-10-05', 'A', [atLevel('trx-row', 1, [9])]);
    assert.deepEqual([sug(low, 'trx-row', '2026-10-12').level, sug(low, 'trx-row', '2026-10-12').source], [1, 'reduction']);
    const high = makeLog().session('2026-09-28', 'A', [atLevel('trx-row', 5, [15, 15, 15])]);
    const s = sug(high, 'trx-row', '2026-10-05');
    assert.deepEqual([s.level, s.source, s.hints.map((h) => h.code), s.increased], [5, 'hold', ['slower-lowering'], false]);
  });

  test('a scheduled +1 level, never past 5', () => {
    const log = makeLog().session('2026-09-28', 'A', [atLevel('trx-row', 5, [12])]);
    assert.equal(sug(log, 'trx-row', '2027-01-04').level, 5);
    assert.equal(sug(log, 'trx-row', '2027-01-04').nextScheduledDate, null);
  });

  test('a drop by one level, from the latest base', () => {
    const log = makeLog()
      .session('2026-09-28', 'A', [atLevel('trx-row', 3, [8])])
      .session('2026-10-05', 'A', [atLevel('trx-row', 3, [9])]);
    assert.equal(sug(log, 'trx-row', '2026-10-12').level, 2);
  });

  test('no ramp-up, no calibration, not gated', () => {
    const log = makeLog().session('2026-09-28', 'A', [atLevel('trx-row', 2, [15, 15])]);
    const s = sug(log, 'trx-row', '2026-10-05', { backPainBefore: 9 });
    assert.deepEqual([s.rampUp, s.isCalibration, s.level, s.weightLbs], [[], false, 3, null]);
  });
});

describe('pushup ladder (5.4)', () => {
  test('starts at level 1 with 10 reps', () => {
    const s = sug(makeLog(), 'pushup', '2026-09-28');
    assert.deepEqual([s.level, s.targetReps, s.source, s.repMin, s.repMax, s.weightLbs], [1, 10, 'starting', 10, 20, null]);
  });

  test('a level carries its own range: level 2 is 8-15', () => {
    const s = sug(makeLog().session('2026-09-28', 'B', [atLevel('pushup', 1, [20, 20, 20])]), 'pushup', '2026-10-05');
    assert.deepEqual([s.level, s.repMin, s.repMax, s.targetReps], [2, 8, 15, 8]);
  });

  test('level 0 is the floor and level 5 the ceiling of the variations', () => {
    // The registry accepts levelNumber 1-5 only (spec question / open item), so this history is built without validation.
    const down = makeLog({ validate: false }).session('2026-09-28', 'B', [atLevel('pushup', 0, [9])]).session('2026-10-05', 'B', [atLevel('pushup', 0, [9])]);
    assert.equal(sug(down, 'pushup', '2026-10-12').level, 0);
    const up = makeLog().session('2026-09-28', 'B', [atLevel('pushup', 4, [15, 15, 15])]);
    assert.equal(sug(up, 'pushup', '2026-10-05').level, 5);
  });

  test('level 5 adds load in 5-lb steps, and a reduction takes the load off before the level', () => {
    const top = makeLog().session('2026-09-28', 'B', [{ ...atLevel('pushup', 5, [15, 15]), weightLbs: 0 }]);
    const s = sug(top, 'pushup', '2026-10-05');
    assert.deepEqual([s.level, s.weightLbs, s.source], [5, 5, 'earned']);
    const weak = makeLog()
      .session('2026-09-28', 'B', [{ ...atLevel('pushup', 5, [7]), weightLbs: 10 }])
      .session('2026-10-05', 'B', [{ ...atLevel('pushup', 5, [7]), weightLbs: 10 }]);
    const r = sug(weak, 'pushup', '2026-10-12');
    assert.deepEqual([r.level, r.weightLbs, r.source], [5, 5, 'reduction']);
  });

  test('deload: the same level', () => {
    const log = makeLog().session('2026-11-02', 'B', [atLevel('pushup', 2, [15, 15])]);
    const s = sug(log, 'pushup', '2026-12-07');
    assert.deepEqual([s.level, s.source, s.sets], [2, 'deload', 2]);
  });
});

describe('unloaded exercises', () => {
  test('dead bug: no load, a hint at the top of the range', () => {
    const log = makeLog().session('2026-09-28', 'A', [{ exerciseId: 'dead-bug', reps: [8, 8] }]);
    const s = sug(log, 'dead-bug', '2026-10-05');
    assert.deepEqual([s.weightLbs, s.source, s.hints.map((h) => h.code), s.perSide], [null, null, ['harder-variation'], true]);
    const weak = makeLog().session('2026-09-28', 'A', [{ exerciseId: 'dead-bug', reps: [8, 6] }]);
    assert.deepEqual(sug(weak, 'dead-bug', '2026-10-05').hints, []);
  });

  test('holds and guidance-only alternatives carry sets, not a suggestion', () => {
    const plank = sug(makeLog(), 'trx-plank', '2026-12-14', { templateCode: 'A', slot: 5 });
    assert.deepEqual([plank.weightLbs, plank.level, plank.source, plank.targetReps, plank.holdSeconds, plank.sets], [null, null, null, null, { min: 20, max: 40 }, 2]);
    const band = sug(makeLog(), 'band-pull-apart', '2026-12-14', { templateCode: 'A', slot: 6 });
    assert.deepEqual([band.weightLbs, band.source, band.targetReps, band.repMin, band.repMax], [null, null, 12, 12, 15]);
  });

  test('an id with no rules is an error, not a guess', () => {
    assert.throws(() => sug(makeLog(), 'bird-dog', '2026-10-05'), /no progression rules/);
  });
});

describe('invariants', () => {
  const ids = Object.keys(RULES).filter((id) => firstSlotFor(id));
  const SOURCES = ['starting', 'calibration', 'hold', 'earned', 'scheduled', 'reduction', 'deload', 'gated', null];

  function randomLog(random, exerciseId) {
    const r = RULES[exerciseId];
    const log = makeLog();
    const sessions = Math.floor(random() * 6);
    let day = 0;
    let w = r.startingWeightLbs ?? 20;
    let lv = r.startingLevel ?? 1;
    for (let i = 0; i < sessions; i++) {
      day += 3 + Math.floor(random() * 12);
      const date = new Date(Date.UTC(2026, 8, 28 + day)).toISOString().slice(0, 10);
      const hi = r.repMax ?? 12;
      const lo = r.repMin ?? 8;
      const reps = Array.from({ length: 1 + Math.floor(random() * 3) }, () => lo - 2 + Math.floor(random() * (hi - lo + 5)));
      if (random() < 0.3) w += r.loadIncrementLbs ?? 5;
      if (random() < 0.15) w = Math.max(0, w - (r.loadIncrementLbs ?? 5));
      if (random() < 0.3) lv = Math.min(5, lv + 1);
      const entry = r.progression === 'suspension' || r.progression === 'ladder'
        ? atLevel(exerciseId, r.progression === 'ladder' ? Math.min(lv, 4) : lv, reps.map((x) => Math.max(0, x)))
        : r.type === 'carry'
          ? carry(exerciseId, w, reps.map((x) => (x > 10 ? 40 : 30)))
          : lift(exerciseId, w, reps.map((x) => Math.max(0, x)));
      log.session(date, 'A', [entry], { isDeload: random() < 0.1 });
    }
    return { log, lastDay: day };
  }

  test('random histories: no negative load, levels 1-5, one increment at most, known source, no NaN', () => {
    const random = rng(2026);
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const exerciseId = ids[Math.floor(random() * ids.length)];
      const { log, lastDay } = randomLog(random, exerciseId);
      const today = new Date(Date.UTC(2026, 8, 28 + lastDay + Math.floor(random() * 60))).toISOString().slice(0, 10);
      const s = suggestExercise(log.state(), { exerciseId, ...firstSlotFor(exerciseId), today, backPainBefore: random() < 0.3 ? 6 : null });
      const r = RULES[exerciseId];
      assert.ok(SOURCES.includes(s.source), `${exerciseId} source ${s.source}`);
      if (s.weightLbs !== null) {
        assert.ok(Number.isFinite(s.weightLbs) && s.weightLbs >= 0, `${exerciseId} weight ${s.weightLbs}`);
        if (s.fromWeightLbs !== null) {
          assert.ok(s.weightLbs <= s.fromWeightLbs + Math.max(s.incrementLbs, s.firstLoadedWeightLbs ?? 0), `${exerciseId}: two increments at once`);
        }
      }
      if (s.level !== null) assert.ok(Number.isInteger(s.level) && s.level >= (r.progression === 'ladder' ? 0 : 1) && s.level <= 5, `${exerciseId} level ${s.level}`);
      if (s.targetReps !== null) assert.ok(Number.isFinite(s.targetReps) && s.targetReps >= 0);
      if (s.fromLevel !== null && s.level !== null) assert.ok(Math.abs(s.level - s.fromLevel) <= 1, `${exerciseId}: level jumped`);
      assert.equal(s.increased === true, s.increased, 'increased is a boolean');
      checked++;
    }
    assert.equal(checked, 400);
  });

  test('the result does not depend on the order events arrive in', () => {
    const random = rng(7);
    for (let i = 0; i < 60; i++) {
      const exerciseId = ids[Math.floor(random() * ids.length)];
      const { log, lastDay } = randomLog(random, exerciseId);
      log.setting('scheduledIncreaseDays', 14).swap('A', 3, 'hip-thrust');
      const today = new Date(Date.UTC(2026, 8, 28 + lastDay + 20)).toISOString().slice(0, 10);
      const args = { exerciseId, ...firstSlotFor(exerciseId), today, backPainBefore: 5 };
      const want = suggestExercise(log.state(), args);
      for (let k = 0; k < 4; k++) {
        assert.deepEqual(suggestExercise(replay(shuffled(log.events, random)), args), want, `${exerciseId} shuffle ${k}`);
      }
    }
  });

  test('duplicated events (a retried upload) change nothing', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12, 12])]);
    const args = { exerciseId: 'goblet-squat', templateCode: 'A', slot: 1, today: '2026-10-05' };
    assert.deepEqual(suggestExercise(replay([...log.events, ...log.events]), args), suggestExercise(log.state(), args));
  });
});

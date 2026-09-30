// Suggestions beyond the spec examples (those are in spec-examples.test.mjs). v1.13: a load changes only through the
// scheduled increase (5.12); bodyweight-based exercises never change.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suggestExercise } from '../app/js/engine/suggest.js';
import { firstSlotFor } from '../app/js/engine/config.js';
import { replay } from '../app/js/store/replay.js';
import { RULES } from '../app/js/seed/rules.js';
import { addDays } from '../app/js/time.js';
import { atLevel, carry, lift, makeLog, rng, shuffled } from '../test-support/engine-log.mjs';

const sug = (log, exerciseId, today, extra = {}) =>
  suggestExercise(log.state(), { exerciseId, ...firstSlotFor(exerciseId), today, ...extra });

describe('last time and the pre-filled suggestion', () => {
  test('no history: the seeded starting weight, source starting, no "last"', () => {
    const s = sug(makeLog(), 'lat-pulldown', '2026-09-28');
    assert.deepEqual([s.weightLbs, s.source, s.targetReps, s.fromWeightLbs, s.last, s.increased], [60, 'starting', 10, null, null, false]);
  });

  test('later: the heaviest weight of the last session, and the sets are listed for "Last: 35 × 12, 12, 11"', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 30, [12]), lift('goblet-squat', 35, [12, 11])]);
    const s = sug(log, 'goblet-squat', '2026-10-05');
    assert.deepEqual([s.weightLbs, s.fromWeightLbs, s.source], [35, 35, 'hold']);
    assert.deepEqual(s.last, {
      date: '2026-09-28',
      sets: [30, 35, 35].map((w, i) => ({ weightLbs: w, reps: [12, 12, 11][i], levelNumber: null, distanceM: null })),
    });
  });

  test('the most recent session decides, not the heaviest ever', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 40, [10])]).session('2026-10-05', 'A', [lift('goblet-squat', 35, [10])]);
    assert.equal(sug(log, 'goblet-squat', '2026-10-12').weightLbs, 35);
  });

  test('reps never change the load: all at the top, or far below the bottom, it holds', () => {
    for (const reps of [[12, 12, 12], [3, 2, 1], [8, 8, 8]]) {
      const log = makeLog()
        .session('2026-09-28', 'A', [lift('goblet-squat', 35, reps)])
        .session('2026-10-05', 'A', [lift('goblet-squat', 35, reps)]);
      const s = sug(log, 'goblet-squat', '2026-10-12');
      assert.deepEqual([s.weightLbs, s.source], [35, 'hold'], String(reps));
    }
  });

  test('hold target: one more rep than the weakest set, inside the range', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 11, 10])]);
    assert.equal(sug(log, 'goblet-squat', '2026-10-05').targetReps, 11);
    const top = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12])]);
    assert.equal(sug(top, 'goblet-squat', '2026-10-05').targetReps, 12);
  });

  test('progression uses the logged weight, not the suggested one', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12, 12], { suggestedWeightLbs: 40, suggestionSource: 'scheduled' })]);
    assert.deepEqual([sug(log, 'goblet-squat', '2026-10-05').weightLbs, sug(log, 'goblet-squat', '2026-10-05').fromWeightLbs], [35, 35]);
  });

  test('a carry: its load, and the distance target instead of reps', () => {
    const log = makeLog().session('2026-09-28', 'C', [carry('farmer-carry', 35, [40, 40, 30])]);
    const s = sug(log, 'farmer-carry', '2026-10-05');
    assert.deepEqual([s.weightLbs, s.targetDistanceM, s.targetReps, s.last.sets.map((x) => x.distanceM)], [35, 40, null, [40, 40, 30]]);
  });

  test('unfinished sessions are not "last time"', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12])], { finished: false });
    assert.deepEqual([sug(log, 'goblet-squat', '2026-10-05').weightLbs, sug(log, 'goblet-squat', '2026-10-05').source], [20, 'starting']);
  });
});

describe('starting weights (5.6)', () => {
  test('the trap bar starts at trapBarWeightLbs (default 45)', () => {
    assert.equal(sug(makeLog(), 'trap-bar-deadlift', '2026-09-28').weightLbs, 45);
    assert.equal(sug(makeLog().setting('trapBarWeightLbs', 55), 'trap-bar-deadlift', '2026-09-28').weightLbs, 55);
  });

  test('a startingWeight setting overrides the seed (and the trap bar setting); null clears it', () => {
    assert.equal(sug(makeLog().setting('startingWeight:goblet-squat', 25), 'goblet-squat', '2026-09-28').weightLbs, 25);
    assert.equal(sug(makeLog().setting('startingWeight:trap-bar-deadlift', 65), 'trap-bar-deadlift', '2026-09-28').weightLbs, 65);
    assert.equal(sug(makeLog().setting('startingWeight:goblet-squat', null), 'goblet-squat', '2026-09-28').weightLbs, 20);
  });

  test('a swapped-in alternative with no seeded value: no pre-fill and a prompt', () => {
    const s = sug(makeLog(), 'machine-row', '2026-09-28', { templateCode: 'A', slot: 4 });
    assert.deepEqual([s.weightLbs, s.source, s.hints.map((h) => h.code)], [null, null, ['enter-weight']]);
  });

  test('a swapped-in alternative takes the slot rep range and set count; a carry swap takes the distance', () => {
    const s = sug(makeLog(), 'machine-row', '2026-12-14', { templateCode: 'A', slot: 4 });
    assert.deepEqual([s.repMin, s.repMax, s.sets], [10, 12, 3]);
    const c = sug(makeLog(), 'suitcase-carry', '2026-12-14', { templateCode: 'C', slot: 5 });
    assert.deepEqual([c.targetDistanceM, c.repMin, c.weightLbs], [40, null, null]);
  });

  test('a swapped-in alternative with history continues from it', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('machine-row', 80, [12, 12, 12])]);
    assert.equal(sug(log, 'machine-row', '2026-10-05', { templateCode: 'A', slot: 4 }).weightLbs, 80);
  });

  test('an id with no rules is an error, not a guess', () => {
    assert.throws(() => sug(makeLog(), 'bird-dog', '2026-10-05'), /no progression rules/);
  });
});

describe('scheduled increases (5.12)', () => {
  // Lat pulldown: 60, 60, then 70 on Oct 20 (the last increase).
  const pulldown = () => makeLog()
    .session('2026-10-06', 'B', [lift('lat-pulldown', 60, [11, 10, 10])])
    .session('2026-10-13', 'B', [lift('lat-pulldown', 60, [11, 10, 10])])
    .session('2026-10-20', 'B', [lift('lat-pulldown', 70, [11, 10, 10])]);

  test('the timer runs from the last increase: due on Nov 10, not on Nov 9', () => {
    assert.equal(sug(pulldown(), 'lat-pulldown', '2026-11-09').source, 'hold');
    const due = sug(pulldown(), 'lat-pulldown', '2026-11-10');
    assert.deepEqual([due.weightLbs, due.source, due.targetReps, due.increased, due.fromWeightLbs], [80, 'scheduled', 10, true, 70]);
    assert.deepEqual([due.lastIncreaseDate, due.nextScheduledDate], ['2026-10-20', '2026-11-10']);
  });

  test('it stays due until a heavier weight is logged, however late', () => {
    assert.deepEqual([sug(pulldown(), 'lat-pulldown', '2026-12-30').weightLbs, sug(pulldown(), 'lat-pulldown', '2026-12-30').source], [80, 'scheduled']);
  });

  test('with no increase yet the timer runs from the first completed session', () => {
    const log = makeLog().session('2026-10-06', 'B', [lift('lat-pulldown', 60, [11, 10, 10])]);
    assert.equal(sug(log, 'lat-pulldown', '2026-10-26').source, 'hold');
    const due = sug(log, 'lat-pulldown', '2026-10-27');
    assert.deepEqual([due.weightLbs, due.source, due.lastIncreaseDate, due.nextScheduledDate], [70, 'scheduled', null, '2026-10-27']);
  });

  test('no history, no increase', () => {
    const s = sug(makeLog(), 'lat-pulldown', '2030-01-01');
    assert.deepEqual([s.source, s.nextScheduledDate], ['starting', null]);
  });

  test('the interval setting is used, and the global and per-exercise switches', () => {
    assert.equal(sug(pulldown().setting('scheduledIncreaseDays', 14), 'lat-pulldown', '2026-11-03').source, 'scheduled');
    assert.equal(sug(pulldown().setting('scheduledIncreasesEnabled', false), 'lat-pulldown', '2026-12-01').source, 'hold');
    const off = sug(pulldown().setting('scheduledIncrease:lat-pulldown', false), 'lat-pulldown', '2026-12-01');
    assert.deepEqual([off.source, off.scheduledIncrease, off.nextScheduledDate, off.weightLbs], ['hold', 'off', null, 70]);
    assert.equal(sug(pulldown().setting('scheduledIncrease:leg-press', false), 'lat-pulldown', '2026-11-10').source, 'scheduled');
    assert.equal(sug(pulldown().setting('scheduledIncrease:lat-pulldown', false).setting('scheduledIncrease:lat-pulldown', true), 'lat-pulldown', '2026-11-10').source, 'scheduled');
  });

  test('a manual override to a heavier weight resets the timer; a lighter session does not', () => {
    const heavier = pulldown().session('2026-11-03', 'B', [lift('lat-pulldown', 75, [11, 10, 10])]);
    assert.equal(sug(heavier, 'lat-pulldown', '2026-11-10').source, 'hold');
    assert.equal(sug(heavier, 'lat-pulldown', '2026-11-24').weightLbs, 85);
    const lighter = pulldown().session('2026-10-27', 'B', [lift('lat-pulldown', 60, [11, 10, 10])]);
    assert.equal(sug(lighter, 'lat-pulldown', '2026-11-10').source, 'scheduled');
    assert.equal(sug(lighter, 'lat-pulldown', '2026-11-10').weightLbs, 70, 'one increment over the last session (60)');
  });

  test('exactly one increment, by exercise (5.3, v1.13)', () => {
    const rise = (id, w, template = 'A') => {
      const log = makeLog().session('2026-10-06', template, [lift(id, w, [10])]);
      return sug(log, id, '2026-10-27').weightLbs - w;
    };
    assert.equal(rise('goblet-squat', 20), 5, 'one dumbbell');
    assert.equal(rise('box-squat', 20), 5, 'one dumbbell');
    for (const id of ['db-bench-press', 'db-romanian-deadlift', 'chest-supported-row', 'seated-db-shoulder-press', 'incline-db-press']) {
      assert.equal(rise(id, 20), 2.5, `${id}: two dumbbells`);
    }
    assert.equal(rise('trap-bar-deadlift', 45), 10);
    assert.equal(rise('lat-pulldown', 60), 10);
    assert.equal(rise('face-pull', 20), 5);
    assert.equal(rise('leg-press', 50), 10);
    const carryLog = makeLog().session('2026-10-06', 'C', [carry('farmer-carry', 35, [40, 40, 40])]);
    assert.equal(sug(carryLog, 'farmer-carry', '2026-10-27').weightLbs, 40);
  });

  test('the load increment setting is used', () => {
    const log = makeLog().setting('loadIncrement:goblet-squat', 2.5).session('2026-10-06', 'A', [lift('goblet-squat', 35, [12, 12])]);
    assert.equal(sug(log, 'goblet-squat', '2026-10-27').weightLbs, 37.5);
  });

  test('from 0 the first-loaded weight, not one increment (5.4)', () => {
    const thrust = makeLog().session('2026-10-06', 'B', [lift('hip-thrust', 0, [11, 11])]);
    assert.equal(sug(thrust, 'hip-thrust', '2026-10-27').weightLbs, 45);
    const press = makeLog().session('2026-10-06', 'B', [lift('leg-press', 0, [11])]);
    assert.equal(sug(press, 'leg-press', '2026-10-27').weightLbs, 50);
    const lunge = makeLog().session('2026-10-06', 'C', [lift('reverse-lunge', 0, [8, 8])]);
    assert.equal(sug(lunge, 'reverse-lunge', '2026-10-27').weightLbs, 10);
    const settings = makeLog().setting('firstLoadedWeight:hip-thrust', 25).session('2026-10-06', 'B', [lift('hip-thrust', 0, [11])]);
    assert.equal(sug(settings, 'hip-thrust', '2026-10-27').weightLbs, 25);
  });
});

describe('bodyweight-based exercises never change (5.4, v1.13)', () => {
  test('dead bug: nothing to suggest', () => {
    const log = makeLog().session('2026-09-28', 'A', [{ exerciseId: 'dead-bug', reps: [8, 8] }]);
    const s = sug(log, 'dead-bug', '2027-06-01');
    assert.deepEqual([s.weightLbs, s.level, s.source, s.hints, s.nextScheduledDate, s.scheduledIncrease, s.perSide], [null, null, null, [], null, 'n/a', true]);
  });

  test('back extension: pre-filled with last time\'s weight, however good the reps and however long ago', () => {
    assert.deepEqual([sug(makeLog(), 'back-extension-45', '2026-09-28').weightLbs, sug(makeLog(), 'back-extension-45', '2026-09-28').source], [0, 'starting']);
    const log = makeLog().session('2026-09-28', 'B', [lift('back-extension-45', 10, [15, 15])]);
    const s = sug(log, 'back-extension-45', '2027-06-01');
    assert.deepEqual([s.weightLbs, s.source, s.increased, s.nextScheduledDate], [10, 'hold', false, null]);
  });

  test('TRX: starting level 2, then last time\'s level, whatever the reps', () => {
    assert.deepEqual([sug(makeLog(), 'trx-row', '2026-09-28').level, sug(makeLog(), 'trx-row', '2026-09-28').source], [2, 'starting']);
    const log = makeLog().session('2026-09-28', 'A', [atLevel('trx-row', 3, [15, 15, 15])]).session('2026-10-05', 'A', [atLevel('trx-row', 3, [5])]);
    const s = sug(log, 'trx-row', '2027-01-04');
    assert.deepEqual([s.level, s.weightLbs, s.source, s.nextScheduledDate], [3, null, 'hold', null]);
    assert.equal(sug(log, 'trx-row', '2027-01-04').last.sets[0].levelNumber, 3);
  });

  test('pushup: level 1 (10-20) at the start, then last time\'s level with that level\'s range', () => {
    const s0 = sug(makeLog(), 'pushup', '2026-09-28');
    assert.deepEqual([s0.level, s0.repMin, s0.repMax, s0.targetReps, s0.weightLbs], [1, 10, 20, 10, null]);
    const log = makeLog().session('2026-09-28', 'B', [atLevel('pushup', 2, [15, 15, 15])]);
    const s = sug(log, 'pushup', '2026-10-05');
    assert.deepEqual([s.level, s.repMin, s.repMax, s.source, s.increased], [2, 8, 15, 'hold', false]);
  });

  test('holds and band pull-apart: sets, not a suggestion', () => {
    const plank = sug(makeLog(), 'trx-plank', '2026-12-14', { templateCode: 'A', slot: 5 });
    assert.deepEqual([plank.weightLbs, plank.level, plank.source, plank.targetReps, plank.holdSeconds, plank.sets], [null, null, null, null, { min: 20, max: 40 }, 2]);
    const band = sug(makeLog(), 'band-pull-apart', '2026-12-14', { templateCode: 'A', slot: 6 });
    assert.deepEqual([band.weightLbs, band.source, band.targetReps, band.repMin, band.repMax], [null, null, 12, 12, 15]);
  });
});

describe('invariants', () => {
  const ids = Object.keys(RULES).filter((id) => firstSlotFor(id));
  const SOURCES = ['starting', 'hold', 'scheduled', null];

  function randomLog(random, exerciseId) {
    const r = RULES[exerciseId];
    const log = makeLog();
    let day = 0;
    let w = r.startingWeightLbs ?? 20;
    let lv = r.startingLevel ?? 1;
    for (let i = 0, n = Math.floor(random() * 6); i < n; i++) {
      day += 3 + Math.floor(random() * 12);
      const date = addDays('2026-09-28', day);
      const reps = Array.from({ length: 1 + Math.floor(random() * 3) }, () => Math.floor(random() * 20));
      if (random() < 0.3) w += r.loadIncrementLbs ?? 5;
      if (random() < 0.15) w = Math.max(0, w - (r.loadIncrementLbs ?? 5));
      if (random() < 0.3) lv = Math.min(5, lv + 1);
      const entry = r.progression === 'suspension' || r.progression === 'ladder'
        ? atLevel(exerciseId, r.progression === 'ladder' ? Math.min(lv, 4) : lv, reps)
        : r.type === 'carry' ? carry(exerciseId, w, reps.map((x) => (x > 10 ? 40 : 30))) : lift(exerciseId, w, reps);
      log.session(date, 'A', [entry]);
    }
    return { log, lastDay: day };
  }

  test('random histories: never a negative load, at most one increment, known source, exercises without progression unchanged', () => {
    const random = rng(2026);
    for (let i = 0; i < 400; i++) {
      const exerciseId = ids[Math.floor(random() * ids.length)];
      const { log, lastDay } = randomLog(random, exerciseId);
      const today = addDays('2026-09-28', lastDay + Math.floor(random() * 60));
      const s = sug(log, exerciseId, today);
      const r = RULES[exerciseId];
      assert.ok(SOURCES.includes(s.source), `${exerciseId} source ${s.source}`);
      if (s.weightLbs !== null) {
        assert.ok(Number.isFinite(s.weightLbs) && s.weightLbs >= 0, `${exerciseId} weight ${s.weightLbs}`);
        if (s.fromWeightLbs !== null) {
          assert.ok(s.weightLbs >= s.fromWeightLbs, `${exerciseId}: a load went down`);
          assert.ok(s.weightLbs - s.fromWeightLbs <= Math.max(s.incrementLbs, s.firstLoadedWeightLbs ?? 0), `${exerciseId}: two increments`);
        }
      }
      if (r.progression !== 'load') {
        assert.equal(s.increased, false);
        assert.ok(s.source === null || s.source === 'starting' || s.source === 'hold');
        assert.equal(s.weightLbs, s.fromWeightLbs ?? s.weightLbs, `${exerciseId} changed`);
        if (s.level !== null && s.fromLevel !== null) assert.equal(s.level, s.fromLevel);
      }
    }
  });

  test('the result does not depend on the order events arrive in, and duplicates change nothing', () => {
    const random = rng(7);
    for (let i = 0; i < 60; i++) {
      const exerciseId = ids[Math.floor(random() * ids.length)];
      const { log, lastDay } = randomLog(random, exerciseId);
      log.setting('scheduledIncreaseDays', 14).swap('A', 3, 'hip-thrust');
      const args = { exerciseId, ...firstSlotFor(exerciseId), today: addDays('2026-09-28', lastDay + 20) };
      const want = suggestExercise(log.state(), args);
      for (let k = 0; k < 4; k++) assert.deepEqual(suggestExercise(replay(shuffled(log.events, random)), args), want, `${exerciseId} shuffle ${k}`);
      assert.deepEqual(suggestExercise(replay([...log.events, ...log.events]), args), want);
    }
  });
});

test('each suggestion has its own hints array (a hint added to one never shows on another)', () => {
  const a = sug(makeLog(), 'dead-bug', '2026-09-28');
  const b = sug(makeLog(), 'trx-row', '2026-09-28');
  a.hints.push({ code: 'x' });
  assert.deepEqual(b.hints, []);
  assert.deepEqual(sug(makeLog(), 'dead-bug', '2026-09-28').hints, []);
});

// Closed loop: a simulated lifter follows the engine's plan for 26 weeks (Mon A, Wed B, Fri C), logging what the plan
// says with the reps its policy gives, and the next plan is made from that log. Checks the rules working together.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loggedDefaults, planSession } from '../app/js/engine/index.js';
import { addDays } from '../app/js/time.js';
import { atLevel, carry, lift, makeLog } from '../test-support/engine-log.mjs';

// policy(exercise) -> reps for every set. Returns the plans.
function simulate(reps, { weeks = 26 } = {}) {
  const log = makeLog();
  const plans = [];
  let n = 0;
  for (let w = 0; w < weeks; w++) {
    for (const offset of [0, 2, 4]) {
      const date = addDays('2026-09-28', w * 7 + offset);
      const templateCode = ['A', 'B', 'C'][n++ % 3];
      const plan = planSession(log.state(), { today: date, templateCode });
      const entries = [];
      for (const e of plan.exercises) {
        const defaults = loggedDefaults(e);
        const perSet = Array.from({ length: e.sets }, () => reps(e));
        if (e.targetDistanceM) entries.push(carry(e.exerciseId, e.weightLbs ?? 35, perSet.map(() => 40), defaults));
        else if (e.progression === 'load' || e.progression === 'loadable') entries.push(lift(e.exerciseId, e.weightLbs ?? 20, perSet, defaults));
        else if (e.level !== null) entries.push(atLevel(e.exerciseId, Math.max(1, e.level), perSet, defaults));
        else if (e.progression === 'bodyweight') entries.push({ exerciseId: e.exerciseId, reps: perSet, ...defaults });
      }
      log.session(date, templateCode, entries);
      plans.push({ date, templateCode, plan });
    }
  }
  return plans;
}

const series = (plans, exerciseId) =>
  plans.flatMap(({ date, plan }) => plan.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => ({ date, ...e })));

const strong = simulate((e) => e.repMax ?? 10); // always the top of the range
const weak = simulate((e) => Math.max(0, (e.repMin ?? 10) - 3)); // always far below the bottom

describe('a load rises only through the scheduled increase, whatever the reps', () => {
  test('lat pulldown: 60 at the start, then +10 every 21 days from the first session', () => {
    for (const plans of [strong, weak]) {
      const byDate = Object.fromEntries(series(plans, 'lat-pulldown').map((e) => [e.date, [e.weightLbs, e.source]]));
      assert.deepEqual(byDate['2026-09-30'], [60, 'starting']);
      assert.deepEqual(byDate['2026-10-14'], [60, 'hold']);
      assert.deepEqual(byDate['2026-10-21'], [70, 'scheduled']); // 21 days after Sep 30
      assert.deepEqual(byDate['2026-11-04'], [70, 'hold']);
      assert.deepEqual(byDate['2026-11-11'], [80, 'scheduled']);
      assert.deepEqual(byDate['2026-12-02'], [90, 'scheduled']);
      assert.deepEqual(byDate['2027-01-13'], [110, 'scheduled']);
    }
  });

  test('two lifters with opposite reps get identical suggestions for every weighted exercise', () => {
    const weights = (plans) => plans.map(({ plan }) => plan.exercises.filter((e) => e.progression === 'load').map((e) => [e.exerciseId, e.weightLbs, e.source]));
    assert.deepEqual(weights(strong), weights(weak));
  });

  test('goblet squat +5 and dumbbell bench +2.5 every third week', () => {
    const step = (id) => series(strong, id).map((e, i, all) => (i ? e.weightLbs - all[i - 1].weightLbs : 0)).filter(Boolean);
    assert.ok(step('goblet-squat').length >= 5 && step('goblet-squat').every((x) => x === 5));
    assert.ok(step('db-bench-press').length >= 5 && step('db-bench-press').every((x) => x === 2.5));
  });

  test('hip thrust: 0 until 21 days after its first session, then 45, then +10', () => {
    const w = series(strong, 'hip-thrust').map((e) => e.weightLbs);
    assert.deepEqual(w.slice(0, 4), [0, 0, 0, 45]);
    assert.equal(w[4], 45);
    assert.equal(w[7], 55);
  });

  test('every step is one increment, and nothing ever goes down or negative', () => {
    for (const plans of [strong, weak]) {
      for (const { plan } of plans) {
        for (const e of plan.exercises.filter((x) => x.progression === 'load')) {
          assert.ok(['starting', 'hold', 'scheduled'].includes(e.source) || e.source === null);
          if (e.weightLbs !== null) assert.ok(e.weightLbs >= 0);
          if (e.fromWeightLbs !== null) assert.ok(e.weightLbs >= e.fromWeightLbs && e.weightLbs - e.fromWeightLbs <= Math.max(e.incrementLbs, e.firstLoadedWeightLbs ?? 0));
        }
      }
    }
  });
});

describe('bodyweight-based exercises never change', () => {
  test('back extension, dead bug and pushup show the same value all 26 weeks', () => {
    for (const plans of [strong, weak]) {
      assert.deepEqual([...new Set(series(plans, 'back-extension-45').map((e) => e.weightLbs))], [0]);
      assert.deepEqual([...new Set(series(plans, 'pushup').map((e) => e.level))], [1]);
      assert.deepEqual([...new Set(series(plans, 'dead-bug').map((e) => e.weightLbs))], [null]);
      for (const e of series(plans, 'pushup')) assert.equal(e.increased, false);
    }
  });
});

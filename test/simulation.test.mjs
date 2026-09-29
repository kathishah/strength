// Closed loop: a simulated lifter follows the engine's plan for 26 weeks (Mon A, Wed B, Fri C), logging what the plan
// says with the reps its policy gives, and the next plan is made from that log. Checks the rules working together.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loggedDefaults, planSession } from '../app/js/engine/index.js';
import { addDays } from '../app/js/time.js';
import { atLevel, carry, lift, makeLog, ramp } from '../test-support/engine-log.mjs';

const SOURCES = ['starting', 'calibration', 'hold', 'earned', 'scheduled', 'reduction', 'deload', 'gated', null];

// policy(exercise) -> reps for each set. Returns the plans and the log.
function simulate(policy, { weeks = 26, backPain = () => null } = {}) {
  const log = makeLog();
  const plans = [];
  const rotation = ['A', 'B', 'C'];
  let n = 0;
  for (let w = 0; w < weeks; w++) {
    for (const offset of [0, 2, 4]) {
      const date = addDays('2026-09-28', w * 7 + offset);
      const templateCode = rotation[n++ % 3];
      const backPainBefore = backPain(n);
      const plan = planSession(log.state(), { today: date, templateCode, backPainBefore });
      const entries = [];
      for (const e of plan.exercises) {
        if (e.rampUp.length) entries.push(ramp(e.exerciseId, e.rampUp));
        const defaults = loggedDefaults(e);
        const reps = Array.from({ length: e.sets }, (_, i) => policy(e, i));
        if (e.progression === 'load' && e.targetDistanceM) entries.push(carry(e.exerciseId, e.weightLbs ?? 35, reps.map(() => policy.distance(e)), defaults));
        else if (e.progression === 'load') entries.push(lift(e.exerciseId, e.weightLbs ?? 20, reps, defaults));
        // The registry cannot log ladder level 0 (a spec/registry gap noted in plan section 14); log level 1 instead.
        else if (e.progression === 'ladder') {
          const suggestedLevel = defaults.suggestedLevel === null ? null : Math.max(1, defaults.suggestedLevel);
          entries.push(atLevel(e.exerciseId, Math.max(1, e.level), reps, { ...defaults, suggestedLevel }));
        }
        else if (e.progression === 'suspension') entries.push(atLevel(e.exerciseId, e.level, reps, defaults));
        else if (e.progression === 'bodyweight') entries.push({ exerciseId: e.exerciseId, reps, ...defaults });
      }
      log.session(date, templateCode, entries, { isDeload: plan.calendar.isDeload, backPainBefore });
      plans.push({ date, templateCode, plan });
    }
  }
  return { log, plans };
}

const lastTop = (e) => e.repMax ?? e.repMin;
const steady = Object.assign((e) => Math.max(e.repMin, lastTop(e) - 1), { distance: () => 40 }); // in the range, never at the top
const strong = Object.assign((e) => lastTop(e), { distance: () => 40 });
const weak = Object.assign((e) => Math.max(0, e.repMin - 2), { distance: () => 30 });

const series = (plans, exerciseId) =>
  plans.flatMap(({ date, plan }) => plan.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => ({ date, ...e })));

describe('a lifter who stays inside the range', () => {
  const { plans } = simulate(steady);
  const pulldown = series(plans, 'lat-pulldown');

  test('lat pulldown: 60 for calibration, then +10 every third week, held through the deload', () => {
    const byDate = Object.fromEntries(pulldown.map((e) => [e.date, [e.weightLbs, e.source]]));
    assert.deepEqual(byDate['2026-09-30'], [60, 'starting']);
    assert.deepEqual(byDate['2026-10-21'], [60, 'hold']);
    assert.deepEqual(byDate['2026-10-28'], [70, 'scheduled']); // 21 days after the second calibration session (Oct 7)
    assert.deepEqual(byDate['2026-11-11'], [70, 'hold']);
    assert.deepEqual(byDate['2026-11-18'], [80, 'scheduled']);
    assert.deepEqual(byDate['2026-12-09'], [80, 'deload']); // week 11: the increase due today waits
    assert.deepEqual(byDate['2026-12-16'], [90, 'scheduled']); // the first session after the deload
    assert.deepEqual(byDate['2026-12-30'], [90, 'hold']); // the timer restarted on Dec 16
    assert.deepEqual(byDate['2027-01-06'], [100, 'scheduled']); // 21 days later
  });

  test('every exercise: no reduction, never two increments at once, valid values, sets by phase', () => {
    for (const { plan } of plans) {
      for (const e of plan.exercises) {
        assert.ok(SOURCES.includes(e.source));
        assert.notEqual(e.source, 'reduction', e.exerciseId);
        assert.equal(e.stalled, false);
        if (e.weightLbs !== null) assert.ok(e.weightLbs >= 0 && Number.isFinite(e.weightLbs));
        if (e.weightLbs !== null && e.fromWeightLbs !== null) assert.ok(e.weightLbs - e.fromWeightLbs <= Math.max(e.incrementLbs, e.firstLoadedWeightLbs ?? 0));
        if (plan.calendar.isDeload) assert.ok(e.sets <= 2 && e.increased === false, `${e.exerciseId} in a deload week`);
      }
    }
  });

  test('deload weeks are 11, 18 and 25 and their sessions were logged as deloads', () => {
    const weeks = [...new Set(plans.filter((p) => p.plan.calendar.isDeload).map((p) => p.plan.calendar.programWeek))];
    assert.deepEqual(weeks, [11, 18, 25]);
  });
});

describe('a lifter who always reaches the top', () => {
  const { plans } = simulate(strong);

  test('goblet squat rises 5 lbs every session, never more, and holds through deloads', () => {
    const goblet = series(plans, 'goblet-squat');
    goblet.forEach((e, i) => {
      if (i === 0) return;
      const step = e.weightLbs - goblet[i - 1].weightLbs;
      assert.ok(step === 0 || step === 5, `${e.date}: step ${step}`);
      if (e.source === 'deload') assert.equal(step, 0);
    });
    assert.ok(goblet.at(-1).weightLbs > 100);
  });

  test('no stall and no reduction', () => {
    for (const { plan } of plans) for (const e of plan.exercises) assert.ok(e.source !== 'reduction' && !e.stalled);
  });

  test('the pushup climbs the ladder one level at a time', () => {
    const levels = series(plans, 'pushup').map((e) => e.level);
    levels.forEach((lv, i) => i && assert.ok(lv - levels[i - 1] <= 1 && lv >= levels[i - 1]));
    assert.ok(levels.at(-1) >= 4);
  });
});

describe('a lifter who always falls short', () => {
  const { plans } = simulate(weak);

  test('loads come down after two weak sessions, never below 0, and the exercise is flagged stalled', () => {
    const pulldown = series(plans, 'lat-pulldown');
    assert.ok(pulldown.some((e) => e.source === 'reduction'));
    assert.ok(pulldown.every((e) => e.weightLbs >= 0));
    assert.ok(pulldown.at(-1).weightLbs < 60);
    assert.ok(pulldown.some((e) => e.stalled));
    // No load rises after the calibration: every reduction skips the scheduled increase (5.12 precedence).
    pulldown.forEach((e, i) => i && assert.ok(e.weightLbs <= pulldown[i - 1].weightLbs || e.source === 'starting'));
  });

  test('a reduction is at least one increment', () => {
    const goblet = series(plans, 'goblet-squat');
    goblet.forEach((e, i) => {
      if (i && e.source === 'reduction' && e.fromWeightLbs > 0) assert.ok(e.weightLbs <= e.fromWeightLbs - 5, `${e.date}`);
    });
  });
});

describe('back pain', () => {
  test('a sore back every session holds the loadsBack exercises and only those', () => {
    const { plans } = simulate(strong, { weeks: 8, backPain: () => 6 });
    const goblet = series(plans, 'goblet-squat');
    assert.ok(goblet.every((e) => e.weightLbs === 20), 'the goblet squat never leaves the starting weight');
    assert.ok(goblet.some((e) => e.source === 'gated'));
    const bench = series(plans, 'db-bench-press');
    assert.ok(bench.at(-1).weightLbs > 20);
  });
});

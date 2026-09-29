// Ramp-up sets, calibration pre-fills, stall detection, expected pace and the session plan (spec 5.5, 5.6, 5.10, 5.11, 4.3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calibrationPrefill, expectedPace, planSession, rampUpSets, stallInfo, suggestExercise, loggedDefaults, DELOAD_BANNER } from '../app/js/engine/index.js';
import { firstSlotFor, resolveExercise } from '../app/js/engine/config.js';
import { atLevel, lift, makeLog } from '../test-support/engine-log.mjs';
import { validateEvent } from '../lambda/events/registry.mjs';
import { WORKOUTS } from '../app/js/seed/program.js';

const sug = (log, exerciseId, today, extra = {}) =>
  suggestExercise(log.state(), { exerciseId, ...firstSlotFor(exerciseId), today, ...extra });
const ex = (id, settings = {}) => resolveExercise(id, { settings });

describe('ramp-up sets (5.5)', () => {
  const ramp = (id, weightLbs, slot = 1, isCalibration = false) => rampUpSets({ weightLbs, exercise: ex(id), slot, isCalibration });

  test('rounds to the nearest increment; an exact tie goes up', () => {
    assert.deepEqual(ramp('goblet-squat', 25), [{ weightLbs: 15, reps: 8 }, { weightLbs: 20, reps: 4 }]); // 12.5 -> 15, 18.75 -> 20
    assert.deepEqual(ramp('trap-bar-deadlift', 55), [{ weightLbs: 30, reps: 8 }, { weightLbs: 40, reps: 4 }]); // 27.5 -> 30, 41.25 -> 40
    assert.deepEqual(ramp('trap-bar-deadlift', 45), [{ weightLbs: 20, reps: 8 }, { weightLbs: 30, reps: 4 }]); // 22.5 -> 20, 33.75 -> 30
  });

  test('a ramp set that rounds to 0 or to the working weight is left out', () => {
    assert.deepEqual(ramp('goblet-squat', 5), []); // 2.5 -> 5 and 3.75 -> 5 equal the working weight
    assert.deepEqual(ramp('goblet-squat', 10), [{ weightLbs: 5, reps: 8 }]); // 7.5 -> 10 equals the working weight
    assert.deepEqual(ramp('trap-bar-deadlift', 10), []); // 5 -> 10 (a tie goes up) and 7.5 -> 10 equal it
  });

  test('only slots 1 and 3', () => {
    for (const slot of [2, 4, 5, 6, null]) assert.deepEqual(ramp('goblet-squat', 40, slot), [], `slot ${slot}`);
    assert.equal(ramp('goblet-squat', 40, 3).length, 2);
  });

  test('none for a working weight of 0, unloaded types, loadable bodyweight, carries, TRX or during calibration', () => {
    assert.deepEqual(ramp('hip-thrust', 0), []);
    assert.deepEqual(ramp('dead-bug', 0), []);
    assert.deepEqual(ramp('pushup', 0), []);
    assert.deepEqual(ramp('back-extension-45', 20), []);
    assert.deepEqual(ramp('farmer-carry', 35), []);
    assert.deepEqual(ramp('trx-squat', 2), []);
    assert.deepEqual(ramp('goblet-squat', 40, 1, true), []);
    assert.deepEqual(ramp('goblet-squat', null), []);
  });

  test('the increment setting is used for rounding', () => {
    const r = rampUpSets({ weightLbs: 40, exercise: ex('goblet-squat', { 'loadIncrement:goblet-squat': 2.5 }), slot: 1 });
    assert.deepEqual(r, [{ weightLbs: 20, reps: 8 }, { weightLbs: 30, reps: 4 }]);
  });

  test('in a suggestion: from the increased weight, in a deload from the base load, none in the first two sessions', () => {
    const log = makeLog()
      .session('2026-10-06', 'A', [lift('goblet-squat', 40, [10, 10, 10])])
      .session('2026-10-13', 'A', [lift('goblet-squat', 40, [10, 10, 10])]);
    const scheduled = sug(log, 'goblet-squat', '2026-11-03');
    assert.deepEqual([scheduled.weightLbs, scheduled.source], [45, 'scheduled']);
    assert.deepEqual(scheduled.rampUp, [{ weightLbs: 25, reps: 8 }, { weightLbs: 35, reps: 4 }]); // 22.5 -> 25, 33.75 -> 35
    const deload = makeLog().session('2026-11-02', 'A', [lift('goblet-squat', 40, [12, 12])]).session('2026-11-09', 'A', [lift('goblet-squat', 40, [12, 12])]);
    const d = sug(deload, 'goblet-squat', '2026-12-07');
    assert.deepEqual([d.source, d.weightLbs, d.rampUp.length], ['deload', 40, 2]);
    const early = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 40, [10])]);
    assert.deepEqual(sug(early, 'goblet-squat', '2026-10-05').rampUp, []);
    assert.equal(sug(makeLog(), 'goblet-squat', '2026-09-28').rampUp.length, 0, 'first session is calibration');
  });

  test('an exercise viewed outside a slot (history page) gets no ramp-up sets', () => {
    const log = makeLog().session('2026-10-06', 'A', [lift('goblet-squat', 40, [10])]).session('2026-10-13', 'A', [lift('goblet-squat', 40, [10])]);
    assert.deepEqual(suggestExercise(log.state(), { exerciseId: 'goblet-squat', today: '2026-10-20' }).rampUp, []);
  });
});

describe('calibration pre-fills (5.6)', () => {
  const s = (id) => suggestExercise(makeLog().state(), { exerciseId: id, ...firstSlotFor(id), today: '2026-09-28' });

  test('too easy +1 increment, about right same, too hard -1 increment, skipped same', () => {
    const goblet = s('goblet-squat');
    assert.deepEqual(calibrationPrefill(goblet, { weightLbs: 20, feel: 'too_easy' }), { weightLbs: 25, source: 'calibration' });
    assert.deepEqual(calibrationPrefill(goblet, { weightLbs: 20, feel: 'about_right' }), { weightLbs: 20, source: 'starting' });
    assert.deepEqual(calibrationPrefill(goblet, { weightLbs: 20, feel: null }), { weightLbs: 20, source: 'starting' });
    assert.deepEqual(calibrationPrefill(goblet, { weightLbs: 20, feel: 'too_hard' }), { weightLbs: 15, source: 'calibration' });
  });

  test('from 0 too easy goes to the first-loaded weight; too hard stops at 0', () => {
    const thrust = s('hip-thrust');
    assert.equal(calibrationPrefill(thrust, { weightLbs: 0, feel: 'too_easy' }).weightLbs, 45);
    assert.equal(calibrationPrefill(thrust, { weightLbs: 0, feel: 'too_hard' }).weightLbs, 0);
    assert.equal(calibrationPrefill(thrust, { weightLbs: 45, feel: 'too_hard' }).weightLbs, 0, 'a step below the first-loaded weight goes to 0');
    assert.equal(calibrationPrefill(s('goblet-squat'), { weightLbs: 5, feel: 'too_hard' }).weightLbs, 0);
  });

  test('a stepper after the user changed the weight: the rating applies to the weight just logged', () => {
    assert.equal(calibrationPrefill(s('goblet-squat'), { weightLbs: 30, feel: 'too_easy' }).weightLbs, 35);
  });

  test('unloaded types are left alone', () => {
    assert.equal(calibrationPrefill(s('trx-row'), { weightLbs: 0, feel: 'too_easy' }).weightLbs, 0);
  });

  test('calibration is the first two sessions of a weighted exercise, and only those', () => {
    const log = makeLog();
    assert.deepEqual([sug(log, 'goblet-squat', '2026-09-28').isCalibration, sug(log, 'goblet-squat', '2026-09-28').calibrationSession], [true, 1]);
    log.session('2026-09-28', 'A', [lift('goblet-squat', 20, [10])]);
    assert.deepEqual([sug(log, 'goblet-squat', '2026-10-05').isCalibration, sug(log, 'goblet-squat', '2026-10-05').calibrationSession], [true, 2]);
    log.session('2026-10-05', 'A', [lift('goblet-squat', 20, [10])]);
    assert.deepEqual([sug(log, 'goblet-squat', '2026-10-12').isCalibration, sug(log, 'goblet-squat', '2026-10-12').calibrationSession], [false, null]);
    for (const id of ['dead-bug', 'pushup', 'trx-row', 'trx-plank']) assert.equal(sug(makeLog(), id, '2026-09-28', firstSlotFor(id)).isCalibration, false, id);
  });

  test('deload sessions do not count toward calibration', () => {
    const log = makeLog().session('2026-12-07', 'A', [lift('goblet-squat', 20, [10])], { isDeload: true });
    assert.equal(sug(log, 'goblet-squat', '2026-12-14').calibrationSession, 1);
  });
});

describe('stall detection (5.10)', () => {
  const reduced = (date) => ({ date, reductionLogged: true });
  const normal = (date) => ({ date, reductionLogged: false });

  test('two reductions within 9 weeks', () => {
    assert.equal(stallInfo([reduced('2026-11-16'), reduced('2026-12-28')], '2027-01-04').stalled, true);
    assert.equal(stallInfo([reduced('2026-12-28'), normal('2027-01-04')], '2027-01-11').stalled, false);
  });

  test('a reduction older than 9 weeks (63 days) has cleared', () => {
    assert.equal(stallInfo([reduced('2026-11-02'), reduced('2027-01-04')], '2027-01-04').recentReductions, 1); // 63 days ago
    assert.equal(stallInfo([reduced('2026-11-03'), reduced('2027-01-04')], '2027-01-04').recentReductions, 2); // 62 days ago
  });

  test('the suggestion made now counts as a firing', () => {
    assert.deepEqual(stallInfo([reduced('2026-12-28')], '2027-01-04', { reducingNow: true }), { stalled: true, recentReductions: 2 });
    assert.equal(stallInfo([], '2027-01-04', { reducingNow: true }).stalled, false);
  });

  test('from the log: two sessions logged under a reduction, and it clears after 9 weeks', () => {
    const log = makeLog()
      .session('2026-11-17', 'B', [lift('lat-pulldown', 90, [11, 10], { suggestionSource: 'reduction' })])
      .session('2026-12-29', 'B', [lift('lat-pulldown', 80, [11, 10], { suggestionSource: 'reduction' })]);
    assert.equal(sug(log, 'lat-pulldown', '2027-01-05').stalled, true);
    assert.equal(sug(log, 'lat-pulldown', '2027-02-02').stalled, false); // Nov 17 is 77 days back
    assert.equal(sug(log, 'lat-pulldown', '2027-02-02').recentReductions, 1);
  });

  test('deload sessions never count', () => {
    const log = makeLog()
      .session('2026-11-17', 'B', [lift('lat-pulldown', 90, [11, 10], { suggestionSource: 'reduction' })])
      .session('2026-12-07', 'B', [lift('lat-pulldown', 80, [11, 10], { suggestionSource: 'reduction' })], { isDeload: true });
    assert.equal(sug(log, 'lat-pulldown', '2026-12-14').stalled, false);
  });
});

describe('expected pace (5.11)', () => {
  test('groups from the spec table', () => {
    const text = (id) => expectedPace(id)?.text;
    assert.equal(text('leg-press'), 'Every 1–3 weeks');
    assert.equal(text('trap-bar-deadlift'), 'Every 1–3 weeks');
    assert.equal(text('hip-thrust'), 'Every 1–3 weeks');
    assert.equal(text('lat-pulldown'), 'Every 2–4 weeks');
    assert.equal(text('seated-cable-row'), 'Every 2–4 weeks');
    assert.equal(text('face-pull'), 'Every 2–4 weeks');
    assert.equal(text('goblet-squat'), 'Every 3–5 weeks');
    assert.equal(text('db-bench-press'), 'Every 3–5 weeks');
    assert.equal(text('back-extension-45'), 'Every 3–6 weeks');
    assert.equal(text('farmer-carry'), 'Every 3–6 weeks');
    assert.equal(expectedPace('pushup'), null);
    assert.equal(expectedPace('trx-row'), null);
    assert.match(expectedPace('goblet-squat').note, /Adding reps counts as progress too/);
  });

  test('is part of a suggestion', () => {
    assert.equal(sug(makeLog(), 'lat-pulldown', '2026-09-28').pace.group, 'machine-cable-upper');
  });
});

describe('planning a workout day', () => {
  const plan = (log, template, today, extra = {}) => planSession(log.state(), { today, templateCode: template, ...extra });
  const setsOf = (p) => p.exercises.map((e) => e.sets);

  test('set counts by phase: Phase 1 is 2 everywhere; Phase 2 the table; a deload halves and rounds up', () => {
    const log = makeLog();
    assert.deepEqual(setsOf(plan(log, 'A', '2026-10-06')), [2, 2, 2, 2, 2, 2]);
    assert.deepEqual(setsOf(plan(log, 'A', '2026-10-26')), [3, 3, 3, 3, 2, 2]);
    assert.deepEqual(setsOf(plan(log, 'B', '2026-10-26')), [3, 3, 3, 3, 3, 2]);
    assert.deepEqual(setsOf(plan(log, 'C', '2026-10-26')), [3, 3, 2, 3, 3]);
    assert.deepEqual(setsOf(plan(log, 'A', '2026-12-07')), [2, 2, 2, 2, 1, 1]);
    assert.deepEqual(setsOf(plan(log, 'B', '2026-12-07')), [2, 2, 2, 2, 2, 1]);
    assert.deepEqual(setsOf(plan(log, 'C', '2026-12-07')), [2, 2, 1, 2, 2]);
  });

  test('the banner appears in a deload week only', () => {
    assert.equal(plan(makeLog(), 'A', '2026-12-07').banner, DELOAD_BANNER);
    assert.equal(plan(makeLog(), 'A', '2026-12-14').banner, null);
    assert.equal(plan(makeLog(), 'A', '2026-12-07').calendar.isDeload, true);
  });

  test('a swap replaces the slot exercise; the slot keeps its sets; the default stays visible', () => {
    const log = makeLog().swap('A', 1, 'leg-press');
    const p = plan(log, 'A', '2026-10-26');
    const first = p.exercises[0];
    assert.deepEqual([first.exerciseId, first.defaultExerciseId, first.swapped, first.sets, first.slot], ['leg-press', 'goblet-squat', true, 3, 1]);
    assert.equal(first.weightLbs, 0);
    assert.equal(p.exercises[1].swapped, false);
  });

  test('a swap that is not one of the slot options is ignored', () => {
    const log = makeLog().swap('A', 1, 'lat-pulldown');
    assert.equal(plan(log, 'A', '2026-10-26').exercises[0].exerciseId, 'goblet-squat');
  });

  test('two TRX exercises in one superset get the tip; one does not', () => {
    const both = plan(makeLog().swap('A', 4, 'trx-row').swap('A', 3, 'trx-hamstring-curl'), 'A', '2026-10-26');
    assert.deepEqual(both.exercises.filter((e) => e.hints.some((h) => h.code === 'trx-pair')).map((e) => e.slot), [3, 4]);
    const one = plan(makeLog().swap('A', 4, 'trx-row'), 'A', '2026-10-26');
    assert.equal(one.exercises.some((e) => e.hints.some((h) => h.code === 'trx-pair')), false);
  });

  test('back pain applies to the loadsBack exercises only', () => {
    const log = makeLog().session('2026-10-06', 'A', [lift('db-romanian-deadlift', 25, [10, 10, 10]), lift('db-bench-press', 30, [12, 12, 12])]);
    const p = plan(log, 'A', '2026-10-13', { backPainBefore: 5 });
    const by = (id) => p.exercises.find((e) => e.exerciseId === id);
    assert.deepEqual([by('db-romanian-deadlift').source, by('db-bench-press').source], ['gated', 'earned']);
  });

  test('ramp-up sets only on slots 1 and 3, and never on face pull or pushup', () => {
    const log = makeLog();
    const sets = () => [lift('goblet-squat', 40, [10]), lift('db-bench-press', 30, [10]), lift('db-romanian-deadlift', 30, [10]), lift('face-pull', 30, [12])];
    log.session('2026-10-13', 'A', sets()).session('2026-10-20', 'A', sets());
    const p = plan(log, 'A', '2026-10-27');
    assert.deepEqual(p.exercises.map((e) => e.rampUp.length > 0), [true, false, true, false, false, false]);
  });

  test('before the start date the plan is week 1 and says so', () => {
    const p = plan(makeLog(), 'A', '2026-09-20');
    assert.deepEqual([p.calendar.programWeek, p.calendar.beforeStart, p.calendar.phase], [1, true, 1]);
  });

  test('an unknown workout is an error', () => assert.throws(() => plan(makeLog(), 'D', '2026-10-06'), RangeError));

  test('loggedDefaults are valid set.logged fields', () => {
    const log = makeLog();
    const s = sug(log, 'goblet-squat', '2026-09-28');
    const fields = loggedDefaults(s);
    assert.deepEqual(fields, { suggestedWeightLbs: 20, suggestedLevel: null, suggestionSource: 'starting', isCalibration: true });
    const level = loggedDefaults(sug(log, 'trx-row', '2026-09-28'));
    assert.deepEqual(level, { suggestedWeightLbs: null, suggestedLevel: 2, suggestionSource: 'starting', isCalibration: false });
    for (const f of [fields, level]) {
      const ev = { id: '01J9Z000000000000000000001', ts: '2026-10-05T11:00:00.000Z-0001-d_7f3a', v: 1, type: 'set.logged', entityId: 's_1',
        payload: { sessionId: 'sess_1', exerciseId: 'goblet-squat', setNumber: 1, isRampUp: false, ...f } };
      assert.deepEqual(validateEvent(ev, Date.parse('2026-10-06T00:00:00Z')), []);
    }
  });

  test('every alternative of every slot can be swapped in and planned, in every week type', () => {
    for (const [templateCode, w] of Object.entries(WORKOUTS)) {
      for (const slot of w.slots) {
        for (const id of [slot.exercise, ...slot.alternatives, ...slot.trxAlternatives]) {
          for (const today of ['2026-10-06', '2026-10-26', '2026-12-07']) {
            const p = planSession(makeLog().swap(templateCode, slot.slot, id).state(), { today, templateCode });
            const e = p.exercises.find((x) => x.slot === slot.slot);
            assert.equal(e.exerciseId, id);
            assert.ok(e.sets >= 1, `${templateCode}${slot.slot} ${id} sets`);
            if (e.progression === 'load' || e.progression === 'none') {
              assert.ok(e.targetDistanceM !== null || e.repMin !== null, `${id} in ${templateCode}${slot.slot} has no rep range`);
            }
          }
        }
      }
    }
  });
});

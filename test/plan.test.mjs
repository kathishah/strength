// Planning a workout day: set counts by phase, swaps, TRX tip, the fields written to a set (spec 4.3, 4.5, 5.1).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loggedDefaults, planSession, suggestExercise } from '../app/js/engine/index.js';
import { firstSlotFor } from '../app/js/engine/config.js';
import { WORKOUTS } from '../app/js/seed/program.js';
import { validateEvent } from '../lambda/events/registry.mjs';
import { lift, makeLog } from '../test-support/engine-log.mjs';

const plan = (log, template, today) => planSession(log.state(), { today, templateCode: template });
const setsOf = (p) => p.exercises.map((e) => e.sets);

describe('planning a workout day', () => {
  test('set counts: Phase 1 is 2 everywhere; from week 5 the table; week 11 is an ordinary week', () => {
    const log = makeLog();
    assert.deepEqual(setsOf(plan(log, 'A', '2026-10-06')), [2, 2, 2, 2, 2, 2]);
    assert.deepEqual(setsOf(plan(log, 'A', '2026-10-26')), [3, 3, 3, 3, 2, 2]);
    assert.deepEqual(setsOf(plan(log, 'B', '2026-10-26')), [3, 3, 3, 3, 3, 2]);
    assert.deepEqual(setsOf(plan(log, 'C', '2026-10-26')), [3, 3, 2, 3, 3]);
    assert.deepEqual(setsOf(plan(log, 'A', '2026-12-07')), [3, 3, 3, 3, 2, 2]);
  });

  test('nothing about deloads, ramp-up sets or calibration is planned', () => {
    const p = plan(makeLog().session('2026-10-06', 'A', [lift('goblet-squat', 40, [10])]), 'A', '2026-12-07');
    assert.deepEqual(Object.keys(p).sort(), ['calendar', 'exercises', 'templateCode', 'today']);
    for (const e of p.exercises) for (const k of ['rampUp', 'isCalibration', 'stalled', 'pace']) assert.equal(k in e, false, k);
  });

  test('a swap replaces the slot exercise; the slot keeps its sets; the default stays visible', () => {
    const p = plan(makeLog().swap('A', 1, 'leg-press'), 'A', '2026-10-26');
    const first = p.exercises[0];
    assert.deepEqual([first.exerciseId, first.defaultExerciseId, first.swapped, first.sets, first.slot], ['leg-press', 'goblet-squat', true, 3, 1]);
    assert.equal(first.weightLbs, 0);
    assert.equal(p.exercises[1].swapped, false);
  });

  test('a swap that is not one of the slot options is ignored', () => {
    assert.equal(plan(makeLog().swap('A', 1, 'lat-pulldown'), 'A', '2026-10-26').exercises[0].exerciseId, 'goblet-squat');
  });

  test('swapping Chest-supported row for TRX row pre-fills level 2 (no weight)', () => {
    const row = plan(makeLog().swap('A', 4, 'trx-row'), 'A', '2026-10-26').exercises[3];
    assert.deepEqual([row.exerciseId, row.level, row.weightLbs, row.source], ['trx-row', 2, null, 'starting']);
  });

  test('two TRX exercises in one superset get the tip; one does not', () => {
    const both = plan(makeLog().swap('A', 4, 'trx-row').swap('A', 3, 'trx-hamstring-curl'), 'A', '2026-10-26');
    assert.deepEqual(both.exercises.filter((e) => e.hints.some((h) => h.code === 'trx-pair')).map((e) => e.slot), [3, 4]);
    const one = plan(makeLog().swap('A', 4, 'trx-row'), 'A', '2026-10-26');
    assert.equal(one.exercises.some((e) => e.hints.some((h) => h.code === 'trx-pair')), false);
  });

  test('before the start date the plan is week 1 and says so', () => {
    const p = plan(makeLog(), 'A', '2026-09-20');
    assert.deepEqual([p.calendar.programWeek, p.calendar.beforeStart, p.calendar.phase], [1, true, 1]);
  });

  test('an unknown workout is an error', () => assert.throws(() => plan(makeLog(), 'D', '2026-10-06'), RangeError));

  test('loggedDefaults are valid set.logged fields', () => {
    const log = makeLog();
    const fields = loggedDefaults(suggestExercise(log.state(), { exerciseId: 'goblet-squat', ...firstSlotFor('goblet-squat'), today: '2026-09-28' }));
    assert.deepEqual(fields, { suggestedWeightLbs: 20, suggestedLevel: null, suggestionSource: 'starting' });
    const level = loggedDefaults(suggestExercise(log.state(), { exerciseId: 'trx-row', ...firstSlotFor('trx-row'), today: '2026-09-28' }));
    assert.deepEqual(level, { suggestedWeightLbs: null, suggestedLevel: 2, suggestionSource: 'starting' });
    for (const f of [fields, level]) {
      const ev = { id: '01J9Z000000000000000000001', ts: '2026-10-05T11:00:00.000Z-0001-d_7f3a', v: 1, type: 'set.logged', entityId: 's_1',
        payload: { sessionId: 'sess_1', exerciseId: 'goblet-squat', setNumber: 1, isRampUp: false, isCalibration: false, ...f } };
      assert.deepEqual(validateEvent(ev, Date.parse('2026-10-06T00:00:00Z')), []);
    }
  });

  test('every alternative of every slot can be swapped in and planned', () => {
    for (const [templateCode, w] of Object.entries(WORKOUTS)) {
      for (const slot of w.slots) {
        for (const id of [slot.exercise, ...slot.alternatives, ...slot.trxAlternatives]) {
          for (const today of ['2026-10-06', '2026-10-26']) {
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

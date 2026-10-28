// Each set starts from what was lifted last time (spec 5.2, v1.21; the examples A-1 to A-9 of
// journal/2026-10-28-1138-workout-changes-spec-draft.md), from the engine through the rows the screen draws to the events written.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suggestExercise } from '../app/js/engine/index.js';
import { firstSlotFor } from '../app/js/engine/config.js';
import { valueAt, valuesBySet, valuesForPlan } from '../app/js/engine/prefill.js';
import { emptyDraft, sessionView, setRowField, summaryView } from '../app/js/logging/index.js';
import { levelSets, liftSets, lift, makeLog } from '../test-support/engine-log.mjs';
import { doWorkout, makeWorld } from '../test-support/logging-world.mjs';

const NOW = Date.parse('2026-10-05T11:00:00-07:00');
const RAMP = [[25, 12], [30, 12], [35, 11]];
const card = (view, id) => view.cards.find((c) => c.exerciseId === id);
const weights = (c) => c.rows.map((r) => r.weightLbs);
const levels = (c) => c.rows.map((r) => r.levelNumber);

// Workout A last done on Sep 28 with `sets` on the goblet squat; Workout A now open on `date`.
function squatLog(sets, date = '2026-10-05') {
  const log = makeLog().session('2026-09-28', 'A', [liftSets('goblet-squat', sets)]);
  log.session(date, 'A', [], { finished: false, id: 'sess_open' });
  return log;
}
const squat = (log, draft = emptyDraft('sess_open')) => card(sessionView(log.state(), 'sess_open', draft, NOW), 'goblet-squat');
// A draft with weights typed into sets: typed([1, 30], [2, 35]).
const typed = (...changes) => changes.reduce((d, [n, value]) => setRowField(d, 'goblet-squat', n, 'weightLbs', value), emptyDraft('sess_open'));

describe('the pre-fill lists', () => {
  const sets = (...numbers) => numbers.map((setNumber, i) => ({ setNumber, weightLbs: 10 * (i + 1) }));
  const pick = (s) => s.weightLbs;

  test('one value per set number; a gap takes the set before it, a leading gap the first value; nothing gives null', () => {
    assert.deepEqual(valuesBySet(sets(1, 2, 3), pick), [10, 20, 30]);
    assert.deepEqual(valuesBySet(sets(1, 3), pick), [10, 10, 20]);
    assert.deepEqual(valuesBySet(sets(2, 3), pick), [10, 10, 20]);
    assert.equal(valuesBySet([], pick), null);
  });

  test('a set number logged twice: the later one wins', () => {
    assert.deepEqual(valuesBySet([{ setNumber: 1, weightLbs: 30 }, { setNumber: 1, weightLbs: 35 }, { setNumber: 2, weightLbs: 35 }], pick), [35, 35]);
  });

  test('valueAt: the set\'s own value, else the nearest earlier one, else the fallback', () => {
    assert.equal(valueAt([25, 30, 35], 2), 30);
    assert.equal(valueAt([25, 30], 4), 30);
    assert.equal(valueAt([25, null, 35], 2), 25);
    assert.equal(valueAt(null, 1, 20), 20);
    assert.equal(valueAt(undefined, 3), null);
  });

  test('valuesForPlan: today\'s set count, shorter or longer than last time', () => {
    assert.deepEqual(valuesForPlan([25, 30, 35, 35], 3), [25, 30, 35]);
    assert.deepEqual(valuesForPlan([25, 30], 3), [25, 30, 30]);
    assert.deepEqual(valuesForPlan([25, 30], null), [25, 30]);
    assert.equal(valuesForPlan(null, 3), null);
  });
});

describe('the examples of the draft spec', () => {
  test('A-1: last time 25 / 30 / 35, the dials open at 25 / 30 / 35, not 35 / 35 / 35', () => {
    const log = squatLog(RAMP);
    const s = suggestExercise(log.state(), { exerciseId: 'goblet-squat', ...firstSlotFor('goblet-squat'), today: '2026-10-05' });
    assert.deepEqual([s.weightLbs, s.setWeightsLbs, s.source, s.increased], [35, [25, 30, 35], 'hold', false]);
    const c = squat(log);
    assert.deepEqual(weights(c), [25, 30, 35]);
    assert.deepEqual(c.rows.map((r) => [r.suggestedWeightLbs, r.weightChanged]), [[25, false], [30, false], [35, false]]);
    assert.equal(c.suggestionText, 'Suggested: 25 / 30 / 35 lbs');
    assert.equal(c.setsDiffer, true);
    assert.equal(c.lastText, 'Last (Mon, Sep 28): 25 × 12 · 30 × 12 · 35 × 11');
  });

  test('A-2: last time flat, a change on set 1 still moves the sets after it (35 / 35 / 35, set 1 to 40)', () => {
    const log = squatLog([[35, 10], [35, 10], [35, 10]]);
    assert.deepEqual(weights(squat(log)), [35, 35, 35]);
    assert.equal(squat(log).suggestionText, 'Suggested: 35 lbs');
    assert.deepEqual(weights(squat(log, typed([1, 40]))), [40, 40, 40]);
    assert.deepEqual(weights(squat(log, typed([2, 40]))), [35, 40, 40], 'never the sets before');
  });

  test('A-3: last time a ramp, a change on set 1 leaves the sets that started different alone', () => {
    const log = squatLog(RAMP);
    assert.deepEqual(weights(squat(log, typed([1, 30]))), [30, 30, 35]);
    assert.deepEqual(weights(squat(log, typed([2, 35]))), [25, 35, 35]);
    assert.deepEqual(weights(squat(log, typed([3, 40]))), [25, 30, 40]);
    assert.deepEqual(squat(log, typed([1, 30])).rows.map((r) => r.weightChanged), [true, false, false]);
  });

  test('A-3 (partly equal): sets that started equal stay linked, the others keep their own', () => {
    const log = squatLog([[25, 10], [30, 10], [30, 10]]);
    assert.deepEqual(weights(squat(log, typed([2, 35]))), [25, 35, 35], 'set 3 started equal to set 2');
    assert.deepEqual(weights(squat(log, typed([1, 20]))), [20, 30, 30], 'set 2 started different from set 1');
  });

  test('A-4: last time two sets, today three: the missing set follows the one before', () => {
    const c = squat(squatLog([[25, 10], [30, 10]]));
    assert.deepEqual(weights(c), [25, 30, 30]);
    assert.equal(c.suggestionText, 'Suggested: 25 / 30 / 30 lbs');
  });

  test('A-5: last time set 2 was skipped, it takes the weight of set 1', () => {
    const log = squatLog([[25, 12], [35, 12, 3]]);
    assert.deepEqual(weights(squat(log)), [25, 25, 35]);
  });

  test('A-6: last time four sets, today three: the extra set is ignored', () => {
    const c = squat(squatLog([[25, 12], [30, 12], [35, 12], [35, 10]]));
    assert.deepEqual(weights(c), [25, 30, 35]);
    assert.equal(c.suggestionText, 'Suggested: 25 / 30 / 35 lbs');
  });

  test('A-7: levels follow too (TRX row 2 / 3 / 3), and are linked while equal', () => {
    const log = makeLog().swap('A', 4, 'trx-row').session('2026-09-28', 'A', [levelSets('trx-row', [[2, 12], [3, 10], [3, 10]])]);
    log.session('2026-10-05', 'A', [], { finished: false, id: 'sess_open' });
    const c = card(sessionView(log.state(), 'sess_open', emptyDraft('sess_open'), NOW), 'trx-row');
    assert.deepEqual(levels(c), [2, 3, 3]);
    assert.equal(c.suggestionText, 'Suggested: level 2 / 3 / 3');
    const moved = card(sessionView(log.state(), 'sess_open', setRowField(emptyDraft('sess_open'), 'trx-row', 2, 'levelNumber', 4), NOW), 'trx-row');
    assert.deepEqual(levels(moved), [2, 4, 4]);
  });

  test('A-8: an increase that is due applies to every set (25 / 30 / 35 becomes 30 / 35 / 40)', () => {
    const log = squatLog(RAMP, '2026-10-26'); // 28 days after the first session
    const s = suggestExercise(log.state(), { exerciseId: 'goblet-squat', ...firstSlotFor('goblet-squat'), today: '2026-10-26' });
    assert.deepEqual([s.weightLbs, s.setWeightsLbs, s.source, s.fromWeightLbs, s.increased], [40, [30, 35, 40], 'scheduled', 35, true]);
    const c = squat(log);
    assert.deepEqual(weights(c), [30, 35, 40]);
    assert.deepEqual(c.rows.map((r) => r.suggestedWeightLbs), [30, 35, 40]);
    assert.equal(c.increaseText, '↑ +5 lbs on each set · Scheduled');
    assert.equal(c.suggestionText, 'Suggested: 30 / 35 / 40 lbs');
  });

  test('A-8 (flat weights): the increase text is unchanged', () => {
    const c = squat(squatLog([[25, 10], [25, 10], [25, 10]], '2026-10-26'));
    assert.deepEqual(weights(c), [30, 30, 30]);
    assert.equal(c.increaseText, '↑ +5 lbs from 25 · Scheduled');
  });

  test('A-8 (the summary): the callout lists every set\'s weight', () => {
    const log = makeLog()
      .session('2026-09-28', 'A', [liftSets('goblet-squat', RAMP)])
      .session('2026-10-12', 'A', [liftSets('goblet-squat', RAMP)]);
    const next = summaryView(log.state(), 'sess_2026-10-12_A').callouts.map((c) => c.text);
    assert.deepEqual(next, ['Goblet Squat: 30 / 35 / 40 lbs next time (+5 each set), scheduled']);
    const flat = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 25, [10, 10, 10])]).session('2026-10-12', 'A', [lift('goblet-squat', 25, [10, 10, 10])]);
    assert.deepEqual(summaryView(flat.state(), 'sess_2026-10-12_A').callouts.map((c) => c.text), ['Goblet Squat: 30 lbs next time (+5), scheduled']);
  });

  test('exercises that take no weight or level keep no per-set lists', () => {
    const log = makeLog().session('2026-09-28', 'A', [lift('dead-bug', 0, [8, 8])]);
    const s = suggestExercise(log.state(), { exerciseId: 'dead-bug', ...firstSlotFor('dead-bug'), today: '2026-10-05' });
    assert.deepEqual([s.setWeightsLbs, s.setLevels], [null, null]);
    const start = suggestExercise(makeLog().state(), { exerciseId: 'goblet-squat', ...firstSlotFor('goblet-squat'), today: '2026-10-05' });
    assert.deepEqual([start.weightLbs, start.setWeightsLbs], [20, null], 'no history: the starting weight on every set');
  });
});

describe('A-9: what is logged, not what was suggested, drives the next pre-fill; each set records its own suggestion (A6)', () => {
  test('through the real actions, over seven workouts in two weeks', async () => {
    const w = await makeWorld();
    const squatOf = (id) => card(w.view(id), 'goblet-squat');
    const logSquat = (id) => {
      const c = squatOf(id);
      return w.actions.saveExercise(id, { exerciseId: 'goblet-squat', rows: c.rows, suggestion: c.suggestion });
    };
    const setsOf = (id) => Object.values(w.state.sets).filter((s) => s.sessionId === id && s.exerciseId === 'goblet-squat').sort((a, b) => a.setNumber - b.setNumber);

    // Workout A, first time: no history, the starting weight on every dial; the ramp is typed in.
    const a1 = await w.actions.startSession();
    assert.deepEqual(weights(squatOf(a1)), [20, 20, 20]);
    [25, 30, 35].forEach((lbs, i) => w.actions.setValue(a1, 'goblet-squat', i + 1, 'weightLbs', lbs));
    await logSquat(a1);
    assert.deepEqual(setsOf(a1).map((s) => [s.weightLbs, s.suggestedWeightLbs]), [[25, 20], [30, 20], [35, 20]]);
    await w.actions.finish(a1, {});
    for (let i = 0; i < 2; i++) { w.advance(2 * 86400); await doWorkout(w); } // B and C

    // Workout A again: each dial at its own weight from last time; set 2 is logged at 32.5.
    w.advance(2 * 86400);
    const a2 = await w.actions.startSession();
    assert.deepEqual(weights(squatOf(a2)), [25, 30, 35]);
    w.actions.setValue(a2, 'goblet-squat', 2, 'weightLbs', 32.5);
    assert.deepEqual(weights(squatOf(a2)), [25, 32.5, 35]);
    await logSquat(a2);
    assert.deepEqual(setsOf(a2).map((s) => [s.weightLbs, s.suggestedWeightLbs, s.suggestionSource]), [[25, 25, 'hold'], [32.5, 30, 'hold'], [35, 35, 'hold']]);
    await w.actions.finish(a2, {});
    for (let i = 0; i < 2; i++) { w.advance(2 * 86400); await doWorkout(w); }

    // The next Workout A starts from what was logged.
    w.advance(2 * 86400);
    const a3 = await w.actions.startSession();
    const c = squatOf(a3);
    assert.deepEqual(weights(c), [25, 32.5, 35]);
    assert.deepEqual(c.rows.map((r) => r.suggestedWeightLbs), [25, 32.5, 35]);
    w.assertValid();
  });
});

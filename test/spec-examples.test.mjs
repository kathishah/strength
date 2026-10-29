// The examples in spec 5.7 (40 bullets) and the test cases in 5.12 (9 bullets) that v1.13 did not strike, one numbered
// test each: `5.7 #12: ...`, `5.12 #8: ...`. The number is the bullet's position in the spec, struck bullets included, so
// numbers stay stable. The fingerprint (third argument to `example`) is a hash of the bullet's text;
// test/spec-coverage.test.mjs fails when the spec gains, loses or edits a bullet, or strikes one that still has a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loggedDefaults, planSession, suggestExercise } from '../app/js/engine/index.js';
import { firstSlotFor } from '../app/js/engine/config.js';
import { emptyDraft, sessionView, setRowField } from '../app/js/logging/index.js';
import { levelSets, lift, liftSets, makeLog } from '../test-support/engine-log.mjs';
import { doWorkout, makeWorld } from '../test-support/logging-world.mjs';

const spec = readFileSync(new URL('../docs/SPEC-strength.md', import.meta.url), 'utf8');
const bullets = (from, to) => {
  const a = spec.indexOf(from);
  return spec.slice(a, spec.indexOf(to, a)).split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
};
const B57 = bullets('### 5.7 Examples', '### ~~5.8 Deload');
const B512 = bullets('Test cases:', '\n---');

// example('5.7', 12, 'fingerprint', () => { ... })
const example = (section, n, _fingerprint, fn) => {
  const text = (section === '5.7' ? B57 : B512)[n - 1] ?? '(missing from the spec)';
  return test(`${section} #${n}: ${text.length > 78 ? `${text.slice(0, 78)}…` : text}`, fn);
};

const sug = (log, exerciseId, today, extra = {}) =>
  suggestExercise(log.state(), { exerciseId, ...firstSlotFor(exerciseId), today, ...extra });
const plan = (log, templateCode, today) => planSession(log.state(), { today, templateCode });
const bySlot = (p, slot) => p.exercises.find((e) => e.slot === slot);

// ---------------------------------------------------------------- 5.7

example('5.7', 2, '7a2e1d3a', () => {
  const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 11, 10])]);
  const s = sug(log, 'goblet-squat', '2026-10-05');
  assert.deepEqual([s.weightLbs, s.source, s.increased], [35, 'hold', false]);
  assert.ok(s.targetReps > 10, 'aim to add reps');
});

example('5.7', 5, '67cb7c0d', () => {
  const p = plan(makeLog(), 'A', '2026-10-06');
  assert.deepEqual([p.calendar.programWeek, p.calendar.phase], [2, 1]);
  assert.deepEqual(p.exercises.map((e) => e.sets), [3, 3, 3, 3, 2, 2]);
});

example('5.7', 12, '1835e184', () => {
  const s = sug(makeLog(), 'goblet-squat', '2026-10-26');
  assert.deepEqual([s.weightLbs, s.source, s.sets], [20, 'starting', 3]); // one pre-fill, used for every set
  // The user logs 25 instead; the log keeps 25 as the actual weight and 20 as the suggestion.
  const log = makeLog().session('2026-10-26', 'A', [lift('goblet-squat', 25, [10, 10, 10], loggedDefaults(s))]);
  const sets = Object.values(log.state().sets).filter((x) => x.exerciseId === 'goblet-squat');
  assert.equal(sets.length, 3);
  for (const set of sets) assert.deepEqual([set.weightLbs, set.suggestedWeightLbs, set.suggestionSource], [25, 20, 'starting']);
  assert.equal(sug(log, 'goblet-squat', '2026-11-02').fromWeightLbs, 25, 'progression uses what was logged');
});

example('5.7', 28, '459723ef', () => {
  const pushupSets = (today) => bySlot(plan(makeLog(), 'B', today), 5);
  assert.deepEqual([pushupSets('2026-10-06').exerciseId, pushupSets('2026-10-06').sets], ['pushup', 3]);
  assert.equal(pushupSets('2026-10-26').sets, 3);
});

example('5.7', 34, '9008ac2b', () => {
  const row = bySlot(plan(makeLog().swap('A', 4, 'trx-row'), 'A', '2026-10-26'), 4);
  assert.deepEqual([row.exerciseId, row.defaultExerciseId, row.swapped, row.level, row.weightLbs, row.source], ['trx-row', 'chest-supported-row', true, 2, null, 'starting']);
});

// Each set starts from what was lifted last time (v1.21). The card of `exerciseId` in Workout A opened on `date`, with `draft` typed in.
const openCard = (log, date, exerciseId, draft = emptyDraft('sess_open')) => {
  log.session(date, 'A', [], { finished: false, id: 'sess_open' });
  return sessionView(log.state(), 'sess_open', draft, Date.parse(`${date}T11:00:00-07:00`)).cards.find((c) => c.exerciseId === exerciseId);
};
const squatWas = (sets) => makeLog().session('2026-09-28', 'A', [liftSets('goblet-squat', sets)]);
const typedWeight = (setNumber, value) => setRowField(emptyDraft('sess_open'), 'goblet-squat', setNumber, 'weightLbs', value);
const weightsOf = (card) => card.rows.map((r) => r.weightLbs);

example('5.7', 35, '5ec6df49', () => {
  const card = openCard(squatWas([[25, 12], [30, 12], [35, 11]]), '2026-10-05', 'goblet-squat');
  assert.deepEqual(weightsOf(card), [25, 30, 35]);
  assert.equal(card.suggestionText, 'Suggested: 25 / 30 / 35 lbs');
});

example('5.7', 36, '678be5ef', () => {
  const flat = () => squatWas([[35, 10], [35, 10], [35, 10]]);
  assert.deepEqual(weightsOf(openCard(flat(), '2026-10-05', 'goblet-squat', typedWeight(1, 40))), [40, 40, 40]);
  const ramp = () => squatWas([[25, 10], [30, 10], [35, 10]]);
  assert.deepEqual(weightsOf(openCard(ramp(), '2026-10-05', 'goblet-squat', typedWeight(1, 30))), [30, 30, 35]);
});

example('5.7', 37, '55180ac0', () => {
  assert.deepEqual(weightsOf(openCard(squatWas([[25, 10], [30, 10]]), '2026-10-05', 'goblet-squat')), [25, 30, 30]);
  assert.deepEqual(weightsOf(openCard(squatWas([[25, 12], [35, 12, 3]]), '2026-10-05', 'goblet-squat')), [25, 25, 35]);
  assert.deepEqual(weightsOf(openCard(squatWas([[25, 12], [30, 12], [35, 12], [35, 10]]), '2026-10-05', 'goblet-squat')), [25, 30, 35]);
});

example('5.7', 38, '97c82eb2', () => {
  const log = makeLog().swap('A', 4, 'trx-row').session('2026-09-28', 'A', [levelSets('trx-row', [[2, 12], [3, 10], [3, 10]])]);
  assert.deepEqual(openCard(log, '2026-10-05', 'trx-row').rows.map((r) => r.levelNumber), [2, 3, 3]);
});

example('5.7', 39, '36f955e9', () => {
  const card = openCard(squatWas([[25, 12], [30, 12], [35, 11]]), '2026-10-26', 'goblet-squat'); // 28 days after the first session
  assert.deepEqual(weightsOf(card), [30, 35, 40]);
  assert.equal(card.increaseText, '↑ +5 lbs on each set · Scheduled');
});

example('5.7', 40, 'f0b78e56', async () => {
  const w = await makeWorld();
  const squat = (id) => w.view(id).cards.find((c) => c.exerciseId === 'goblet-squat');
  const logSquat = (id) => w.actions.saveExercise(id, { exerciseId: 'goblet-squat', rows: squat(id).rows, suggestion: squat(id).suggestion });
  const sets = (id) => Object.values(w.state.sets).filter((s) => s.sessionId === id && s.exerciseId === 'goblet-squat').sort((a, b) => a.setNumber - b.setNumber);
  const workoutA = async (type) => { // a Workout A with the squat logged as typed, then B and C so that A comes round again
    w.advance(2 * 86400);
    const id = await w.actions.startSession();
    type?.(id);
    await logSquat(id);
    const logged = sets(id).map((s) => [s.weightLbs, s.suggestedWeightLbs]);
    await w.actions.finish(id, {});
    for (let i = 0; i < 2; i++) { w.advance(2 * 86400); await doWorkout(w); }
    return logged;
  };
  await workoutA((id) => [25, 30, 35].forEach((lbs, i) => w.actions.setValue(id, 'goblet-squat', i + 1, 'weightLbs', lbs)));
  const second = await workoutA((id) => w.actions.setValue(id, 'goblet-squat', 2, 'weightLbs', 32.5));
  assert.deepEqual(second, [[25, 25], [32.5, 30], [35, 35]]); // [logged, that set's own suggestion]
  w.advance(2 * 86400);
  assert.deepEqual(weightsOf(squat(await w.actions.startSession())), [25, 32.5, 35]);
});

// ---------------------------------------------------------------- 5.12

// Lat pulldown as in the first test case: 60, 60, then 70 on Oct 1 (the last increase), reps in range but not at the top.
const pulldown70 = () => makeLog()
  .session('2026-09-17', 'B', [lift('lat-pulldown', 60, [11, 10, 10])])
  .session('2026-09-24', 'B', [lift('lat-pulldown', 60, [11, 10, 10])])
  .session('2026-10-01', 'B', [lift('lat-pulldown', 70, [11, 10, 10])]);

example('5.12', 1, '498b4b91', () => {
  const s = sug(pulldown70(), 'lat-pulldown', '2026-10-22');
  assert.deepEqual([s.weightLbs, s.source, s.increased], [80, 'scheduled', true]);
});

example('5.12', 2, '37b8484d', () => {
  const s = sug(pulldown70(), 'lat-pulldown', '2026-10-20');
  assert.deepEqual([s.weightLbs, s.source], [70, 'hold']);
});

example('5.12', 7, '13bd5b1a', () => {
  const log = pulldown70();
  const suggested = sug(log, 'lat-pulldown', '2026-10-22');
  assert.deepEqual([suggested.weightLbs, suggested.source], [80, 'scheduled']);
  log.session('2026-10-22', 'B', [lift('lat-pulldown', 70, [11, 10, 10], loggedDefaults(suggested))]); // the user logs 70
  const next = sug(log, 'lat-pulldown', '2026-10-29');
  assert.deepEqual([next.weightLbs, next.source], [80, 'scheduled']);
  assert.equal(next.lastIncreaseDate, '2026-10-01', 'the timer did not reset');
});

example('5.12', 8, 'e37a88fa', () => {
  const log = makeLog().session('2026-10-06', 'B', [lift('hip-thrust', 0, [11, 11])]);
  assert.equal(sug(log, 'hip-thrust', '2026-10-26').weightLbs, 0);
  const s = sug(log, 'hip-thrust', '2026-10-27'); // 21 days since its first completed session
  assert.deepEqual([s.weightLbs, s.source], [45, 'scheduled']);
});

example('5.12', 9, '982da99b', () => {
  const log = () => makeLog().session('2026-10-06', 'A', [lift('goblet-squat', 25, [12, 12, 12])]);
  assert.equal(sug(log(), 'goblet-squat', '2026-11-03').source, 'scheduled');
  const off = log().setting('scheduledIncrease:goblet-squat', false);
  const s = sug(off, 'goblet-squat', '2026-11-03');
  assert.deepEqual([s.weightLbs, s.source], [25, 'hold']);
});

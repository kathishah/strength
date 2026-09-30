// The examples in spec 5.7 (34 bullets) and the test cases in 5.12 (9 bullets) that v1.13 did not strike, one numbered
// test each: `5.7 #12: ...`, `5.12 #8: ...`. The number is the bullet's position in the spec, struck bullets included, so
// numbers stay stable. The fingerprint (third argument to `example`) is a hash of the bullet's text;
// test/spec-coverage.test.mjs fails when the spec gains, loses or edits a bullet, or strikes one that still has a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loggedDefaults, planSession, suggestExercise } from '../app/js/engine/index.js';
import { firstSlotFor } from '../app/js/engine/config.js';
import { lift, makeLog } from '../test-support/engine-log.mjs';

const spec = readFileSync(new URL('../SPEC-strength.md', import.meta.url), 'utf8');
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

example('5.7', 5, '58c16824', () => {
  const p = plan(makeLog(), 'A', '2026-10-06');
  assert.deepEqual([p.calendar.programWeek, p.calendar.phase], [2, 1]);
  assert.deepEqual(p.exercises.map((e) => e.sets), [2, 2, 2, 2, 2, 2]);
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

example('5.7', 28, '8221b8de', () => {
  const pushupSets = (today) => bySlot(plan(makeLog(), 'B', today), 5);
  assert.deepEqual([pushupSets('2026-10-06').exerciseId, pushupSets('2026-10-06').sets], ['pushup', 2]);
  assert.equal(pushupSets('2026-10-26').sets, 3);
});

example('5.7', 34, '9008ac2b', () => {
  const row = bySlot(plan(makeLog().swap('A', 4, 'trx-row'), 'A', '2026-10-26'), 4);
  assert.deepEqual([row.exerciseId, row.defaultExerciseId, row.swapped, row.level, row.weightLbs, row.source], ['trx-row', 'chest-supported-row', true, 2, null, 'starting']);
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

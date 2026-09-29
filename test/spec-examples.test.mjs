// Every example in spec 5.7 (34 bullets) and every test case in 5.12 (9 bullets), one numbered test each.
// A test is named `5.7 #12: ...` with the start of the spec bullet it checks. The fingerprint (second argument to
// `example`) is a hash of the bullet's text; test/spec-coverage.test.mjs fails when the spec gains, loses or edits a
// bullet, so an edited spec cannot leave an example untested. Unless a bullet says otherwise, no scheduled increase is due.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calendarFor, calibrationPrefill, deloadWeeks, isDeloadWeek, loggedDefaults, nextDeloadWeek, planSession, rampUpSets, suggestExercise,
} from '../app/js/engine/index.js';
import { firstSlotFor, resolveExercise } from '../app/js/engine/config.js';
import { RULES } from '../app/js/seed/rules.js';
import { atLevel, lift, makeLog } from '../test-support/engine-log.mjs';

const spec = readFileSync(new URL('../SPEC-strength.md', import.meta.url), 'utf8');
const bullets = (from, to) => {
  const a = spec.indexOf(from);
  const b = spec.indexOf(to, a);
  return spec.slice(a, b).split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
};
const B57 = bullets('### 5.7 Examples', '### 5.8 Deload');
const B512 = bullets('Test cases:', '\n---');

// example('5.7', 12, 'fingerprint', () => { ... })
const example = (section, n, _fingerprint, fn) => {
  const text = (section === '5.7' ? B57 : B512)[n - 1] ?? '(missing from the spec)';
  return test(`${section} #${n}: ${text.length > 78 ? `${text.slice(0, 78)}…` : text}`, fn);
};

const sug = (log, exerciseId, today, extra = {}) =>
  suggestExercise(log.state(), { exerciseId, ...firstSlotFor(exerciseId), today, ...extra });
const plan = (log, templateCode, today, extra = {}) => planSession(log.state(), { today, templateCode, ...extra });
const bySlot = (p, slot) => p.exercises.find((e) => e.slot === slot);

// ---------------------------------------------------------------- 5.7

example('5.7', 1, 'a6c2ee65', () => {
  const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12, 12])]);
  const s = sug(log, 'goblet-squat', '2026-10-05');
  assert.deepEqual([s.repMin, s.repMax, s.weightLbs, s.targetReps, s.source], [8, 12, 40, 8, 'earned']);
});

example('5.7', 2, '7a2e1d3a', () => {
  const log = makeLog().session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 11, 10])]);
  const s = sug(log, 'goblet-squat', '2026-10-05');
  assert.deepEqual([s.weightLbs, s.source, s.increased], [35, 'hold', false]);
  assert.ok(s.targetReps > 10, 'aim to add reps');
});

example('5.7', 3, '040290b3', () => {
  const log = makeLog()
    .session('2026-09-28', 'B', [lift('lat-pulldown', 100, [12, 10, 8])])
    .session('2026-10-05', 'B', [lift('lat-pulldown', 100, [11, 10, 8])]);
  const s = sug(log, 'lat-pulldown', '2026-10-12');
  assert.deepEqual([s.repMin, s.repMax, s.weightLbs, s.source], [10, 12, 90, 'reduction']);
});

example('5.7', 4, 'b905e94a', () => {
  const log = makeLog().session('2026-09-28', 'C', [lift('reverse-lunge', 10, [8, 8])]);
  const s = sug(log, 'reverse-lunge', '2026-10-05');
  assert.deepEqual([s.repMin, s.repMax, s.perSide, s.weightLbs], [8, 8, true, 15]);
  assert.equal(s.weightLbs - s.fromWeightLbs, 5);
});

example('5.7', 5, '58c16824', () => {
  const p = plan(makeLog(), 'A', '2026-10-06');
  assert.deepEqual([p.calendar.programWeek, p.calendar.phase], [2, 1]);
  assert.deepEqual(p.exercises.map((e) => e.sets), [2, 2, 2, 2, 2, 2]);
});

example('5.7', 6, 'af22cfe4', () => {
  const log = makeLog().session('2026-09-28', 'B', [lift('back-extension-45', 0, [15, 15])]);
  const s = sug(log, 'back-extension-45', '2026-10-05');
  assert.deepEqual([s.weightLbs, s.targetReps], [5, 10]);
});

example('5.7', 7, 'f8e60fa6', () => {
  const log = makeLog()
    .session('2026-09-28', 'B', [lift('back-extension-45', 5, [12, 9])])
    .session('2026-10-05', 'B', [lift('back-extension-45', 5, [10, 8])]);
  const s = sug(log, 'back-extension-45', '2026-10-12');
  assert.deepEqual([s.weightLbs, s.source], [0, 'reduction']);
});

example('5.7', 8, 'a4d912f7', () => {
  assert.deepEqual(
    rampUpSets({ weightLbs: 135, exercise: resolveExercise('trap-bar-deadlift'), slot: 1 }),
    [{ weightLbs: 70, reps: 8 }, { weightLbs: 100, reps: 4 }],
  );
  // The same through a workout plan: two finished sessions at 135 lbs, so the exercise is past calibration.
  const log = makeLog()
    .session('2026-10-08', 'C', [lift('trap-bar-deadlift', 135, [8, 8, 8])])
    .session('2026-10-15', 'C', [lift('trap-bar-deadlift', 135, [8, 8, 8])]);
  const first = bySlot(plan(log, 'C', '2026-10-22'), 1);
  assert.deepEqual([first.weightLbs, first.rampUp], [135, [{ weightLbs: 70, reps: 8 }, { weightLbs: 100, reps: 4 }]]);
});

example('5.7', 9, 'ef14bd16', () => {
  assert.deepEqual(
    rampUpSets({ weightLbs: 15, exercise: resolveExercise('goblet-squat'), slot: 1 }),
    [{ weightLbs: 10, reps: 8 }, { weightLbs: 10, reps: 4 }],
  );
  const log = makeLog()
    .session('2026-10-06', 'A', [lift('goblet-squat', 15, [8, 8])])
    .session('2026-10-13', 'A', [lift('goblet-squat', 15, [8, 8])]);
  assert.deepEqual(bySlot(plan(log, 'A', '2026-10-20'), 1).rampUp, [{ weightLbs: 10, reps: 8 }, { weightLbs: 10, reps: 4 }]);
});

example('5.7', 10, '3ac46278', () => {
  const p = plan(makeLog(), 'B', '2026-10-26');
  const thrust = bySlot(p, 3);
  assert.deepEqual([thrust.exerciseId, thrust.weightLbs, thrust.rampUp], ['hip-thrust', 0, []]);
});

example('5.7', 11, 'd3f1ce60', () => {
  const sets = () => [lift('face-pull', 40, [15, 15])];
  const log = makeLog().session('2026-10-06', 'A', sets()).session('2026-10-13', 'A', sets());
  const face = bySlot(plan(log, 'A', '2026-10-20'), 6);
  assert.deepEqual([face.exerciseId, face.weightLbs, face.rampUp], ['face-pull', 45, []]);
  // Even if it were swapped into slot 1 or 3 the rule is per slot; slot 6 is what never gets them.
  assert.deepEqual(rampUpSets({ weightLbs: 40, exercise: resolveExercise('face-pull'), slot: 6 }), []);
});

example('5.7', 12, '1835e184', () => {
  const s = sug(makeLog(), 'goblet-squat', '2026-10-26');
  assert.deepEqual([s.weightLbs, s.source, s.sets], [20, 'starting', 3]); // one pre-fill, used for every set
  // The user logs 25 instead; the log keeps 25 as the actual weight and 20 as the suggestion.
  const log = makeLog().session('2026-10-26', 'A', [lift('goblet-squat', 25, [10, 10, 10], loggedDefaults(s))]);
  const sets = Object.values(log.state().sets).filter((x) => x.exerciseId === 'goblet-squat');
  assert.equal(sets.length, 3);
  for (const set of sets) assert.deepEqual([set.weightLbs, set.suggestedWeightLbs, set.suggestionSource], [25, 20, 'starting']);
  assert.equal(sug(log, 'goblet-squat', '2026-11-02').fromWeightLbs, 25);
});

example('5.7', 13, 'e2137f9b', () => {
  const s = sug(makeLog(), 'goblet-squat', '2026-09-28');
  assert.deepEqual([s.isCalibration, s.weightLbs], [true, 20]);
  assert.deepEqual(calibrationPrefill(s, { weightLbs: 20, feel: 'too_easy' }), { weightLbs: 25, source: 'calibration' });
});

example('5.7', 14, '8cc51678', () => {
  const s = sug(makeLog(), 'db-romanian-deadlift', '2026-09-28');
  assert.deepEqual([s.isCalibration, s.weightLbs], [true, 15]);
  assert.deepEqual(calibrationPrefill(s, { weightLbs: 15, feel: 'too_hard' }), { weightLbs: 10, source: 'calibration' });
});

example('5.7', 15, 'a1113e04', () => {
  const log = makeLog().session('2026-09-28', 'B', [lift('hip-thrust', 0, [12, 12])]);
  const s = sug(log, 'hip-thrust', '2026-10-05');
  assert.deepEqual([s.repMin, s.repMax, s.weightLbs, s.targetReps], [10, 12, 45, 10]);
});

example('5.7', 16, '24aff4f9', () => {
  const log = makeLog().session('2026-09-28', 'C', [lift('reverse-lunge', 0, [8, 8])]);
  assert.equal(sug(log, 'reverse-lunge', '2026-10-05').weightLbs, 10);
});

example('5.7', 17, '652cb20d', () => {
  const log = makeLog().session('2026-09-28', 'A', [
    lift('goblet-squat', 35, [12, 12, 12], { suggestedWeightLbs: 40, suggestionSource: 'earned' }),
  ]);
  const s = sug(log, 'goblet-squat', '2026-10-05');
  assert.deepEqual([s.fromWeightLbs, s.weightLbs], [35, 40]);
});

example('5.7', 18, 'b3d5adbd', () => {
  const week11 = '2026-12-07';
  const done = (exerciseId, w, reps) => lift(exerciseId, w, reps);
  const sets = () => [
    done('goblet-squat', 35, [12, 12, 12]), done('db-bench-press', 30, [12, 12, 12]), done('db-romanian-deadlift', 25, [10, 10, 10]),
    done('chest-supported-row', 30, [12, 12, 12]), { exerciseId: 'dead-bug', reps: [8, 8] }, done('face-pull', 30, [15, 15]),
  ];
  const log = makeLog().session('2026-11-02', 'A', sets()).session('2026-11-09', 'A', sets());
  const p = plan(log, 'A', week11);
  assert.deepEqual([p.calendar.programWeek, p.calendar.isDeload, p.banner !== null], [11, true, true]);
  assert.deepEqual(p.exercises.map((e) => e.sets), [2, 2, 2, 2, 1, 1]);
  for (const e of p.exercises.filter((x) => x.progression === 'load')) {
    assert.deepEqual([e.source, e.weightLbs, e.increased], ['deload', e.fromWeightLbs, false], e.exerciseId);
  }
  assert.deepEqual(p.calendar.targetRir, { min: 3, max: 4 });
});

example('5.7', 19, 'a39f2909', () => {
  assert.deepEqual([11, 18].map((w) => isDeloadWeek({}, w)), [true, true]);
  assert.deepEqual([10, 12].map((w) => isDeloadWeek({}, w)), [false, false]);
  assert.deepEqual(deloadWeeks({}, 20), [11, 18]);
  // ... and from a date: 2026-12-07 is week 11, 2027-01-25 is week 18.
  assert.deepEqual(['2026-12-06', '2026-12-07', '2027-01-24', '2027-01-25'].map((d) => calendarFor({ settings: {}, deloads: {}, today: d }).isDeload), [false, true, false, true]);
});

example('5.7', 20, 'af30fe51', () => {
  const state = makeLog().deload(9, 'manual').state();
  assert.equal(nextDeloadWeek(state.deloads, 9), 16);
  assert.deepEqual(deloadWeeks(state.deloads, 24), [9, 16, 23]);
  const c = calendarFor({ settings: {}, deloads: state.deloads, today: '2026-11-23' }); // week 9
  assert.deepEqual([c.programWeek, c.isDeload, c.nextDeloadWeek], [9, true, 16]);
});

example('5.7', 21, '0cc5c77d', () => {
  const log = makeLog().session('2026-10-06', 'A', [lift('db-romanian-deadlift', 25, [10, 10, 10]), lift('db-bench-press', 30, [12, 12, 12])]);
  const p = plan(log, 'A', '2026-10-13', { backPainBefore: 5 });
  const rdl = p.exercises.find((e) => e.exerciseId === 'db-romanian-deadlift');
  const bench = p.exercises.find((e) => e.exerciseId === 'db-bench-press');
  assert.deepEqual([rdl.weightLbs, rdl.source], [25, 'gated']);
  assert.deepEqual([bench.weightLbs, bench.source], [35, 'earned']);
});

example('5.7', 22, 'e44d9dbb', () => {
  const log = makeLog().session('2026-10-06', 'A', [lift('db-romanian-deadlift', 25, [10, 10, 10])]);
  for (const backPainBefore of [null, undefined]) {
    const s = sug(log, 'db-romanian-deadlift', '2026-10-13', { backPainBefore });
    assert.deepEqual([s.weightLbs, s.source], [30, 'earned']);
  }
});

example('5.7', 23, 'd0d28468', () => {
  // Week 8 starts 2026-11-16 and week 14 starts 2026-12-28.
  const log = makeLog()
    .session('2026-11-17', 'B', [lift('lat-pulldown', 90, [11, 10, 10], { suggestionSource: 'reduction' })])
    .session('2026-12-29', 'B', [lift('lat-pulldown', 80, [11, 10, 10], { suggestionSource: 'reduction' })]);
  const s = sug(log, 'lat-pulldown', '2027-01-05');
  assert.deepEqual([s.stalled, s.recentReductions], [true, 2]);
  const one = makeLog().session('2026-12-29', 'B', [lift('lat-pulldown', 80, [11, 10, 10], { suggestionSource: 'reduction' })]);
  assert.equal(sug(one, 'lat-pulldown', '2027-01-05').stalled, false);
});

example('5.7', 24, '91e8c00f', () => {
  const log = makeLog().session('2026-09-28', 'B', [atLevel('pushup', 1, [20, 20, 20])]);
  const s = sug(log, 'pushup', '2026-10-05');
  assert.deepEqual([s.level, s.targetReps, s.source, s.increased, s.fromLevel], [2, 8, 'earned', true, 1]);
});

example('5.7', 25, '9094a90b', () => {
  const log = makeLog().session('2026-09-28', 'B', [atLevel('pushup', 1, [14, 12, 10])]);
  const s = sug(log, 'pushup', '2026-10-05');
  assert.deepEqual([s.level, s.source, s.increased], [1, 'hold', false]);
});

example('5.7', 26, 'c5798788', () => {
  const log = makeLog()
    .session('2026-09-28', 'B', [atLevel('pushup', 2, [10, 8, 7])])
    .session('2026-10-05', 'B', [atLevel('pushup', 2, [9, 7, 8])]);
  const s = sug(log, 'pushup', '2026-10-12');
  assert.deepEqual([s.level, s.source], [1, 'reduction']);
});

example('5.7', 27, '1cafc55e', () => {
  const log = makeLog();
  for (const d of ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']) log.session(d, 'B', [atLevel('pushup', 1, [20, 20, 18])]);
  const s = sug(log, 'pushup', '2026-11-02');
  assert.deepEqual([s.level, s.source, s.nextScheduledDate, s.scheduledIncrease], [1, 'hold', null, 'n/a']);
});

example('5.7', 28, 'a45faeb6', () => {
  const pushupSets = (today) => bySlot(plan(makeLog(), 'B', today), 5);
  assert.deepEqual([pushupSets('2026-10-06').exerciseId, pushupSets('2026-10-06').sets], ['pushup', 2]);
  assert.equal(pushupSets('2026-10-26').sets, 3);
  assert.equal(pushupSets('2026-12-07').sets, 2);
});

example('5.7', 29, 'f3e7e5a7', () => {
  assert.equal(RULES.pushup.loadsBack, false);
  const sets = () => [atLevel('pushup', 1, [15, 15, 15])];
  const log = makeLog().session('2026-10-06', 'B', sets()).session('2026-10-13', 'B', sets());
  const s = plan(log, 'B', '2026-10-20', { backPainBefore: 9 }).exercises.find((e) => e.exerciseId === 'pushup');
  assert.deepEqual([s.rampUp, s.hints.map((h) => h.code), s.source], [[], [], 'hold']);
  assert.deepEqual(rampUpSets({ weightLbs: 20, exercise: resolveExercise('pushup'), slot: 1 }), []);
  assert.deepEqual(rampUpSets({ weightLbs: 20, exercise: resolveExercise('pushup'), slot: 3 }), []);
});

example('5.7', 30, 'ada09c02', () => {
  const log = makeLog().session('2026-09-28', 'A', [atLevel('trx-row', 2, [15, 15, 15])]);
  const s = sug(log, 'trx-row', '2026-10-05');
  assert.deepEqual([s.level, s.targetReps, s.source, s.increased], [3, 10, 'earned', true]);
});

example('5.7', 31, '37c3c725', () => {
  const log = makeLog()
    .session('2026-10-06', 'A', [atLevel('trx-row', 2, [12, 12, 12])])
    .session('2026-10-13', 'A', [atLevel('trx-row', 3, [12, 12, 12])]) // the level increase
    .session('2026-10-20', 'A', [atLevel('trx-row', 3, [12, 12, 12])]);
  assert.equal(sug(log, 'trx-row', '2026-11-02').level, 3); // 20 days after the increase
  const s = sug(log, 'trx-row', '2026-11-03'); // 21 days after
  assert.deepEqual([s.level, s.source, s.increased, s.lastIncreaseDate], [4, 'scheduled', true, '2026-10-13']);
});

example('5.7', 32, '5ab2e7b5', () => {
  const log = makeLog()
    .session('2026-09-28', 'A', [atLevel('trx-chest-press', 1, [9, 8])])
    .session('2026-10-05', 'A', [atLevel('trx-chest-press', 1, [10, 9])]);
  const s = sug(log, 'trx-chest-press', '2026-10-12');
  assert.deepEqual([s.level, s.increased], [1, false]);
  assert.ok(s.level >= 1);
});

example('5.7', 33, '2cfd6d22', () => {
  const log = makeLog().session('2026-09-28', 'A', [atLevel('trx-row', 5, [15, 15, 15])]);
  const s = sug(log, 'trx-row', '2026-10-05');
  assert.deepEqual([s.level, s.increased, s.hints.map((h) => h.code)], [5, false, ['slower-lowering']]);
});

example('5.7', 34, 'a97c3929', () => {
  const log = makeLog().swap('A', 4, 'trx-row');
  const p = plan(log, 'A', '2026-10-26');
  const row = bySlot(p, 4);
  assert.deepEqual([row.exerciseId, row.defaultExerciseId, row.swapped, row.level, row.weightLbs, row.source], ['trx-row', 'chest-supported-row', true, 2, null, 'starting']);
  assert.deepEqual(row.rampUp, []);
  // A slot that would get ramp-up sets: swapping the RDL (slot 3) for a TRX exercise gives none either.
  assert.deepEqual(bySlot(plan(makeLog().swap('A', 3, 'trx-hamstring-curl'), 'A', '2026-10-26'), 3).rampUp, []);
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

example('5.12', 3, '873674dc', () => {
  const log = makeLog()
    .session('2026-10-06', 'A', [lift('goblet-squat', 25, [12, 12, 12])])
    .session('2026-10-13', 'A', [lift('goblet-squat', 25, [12, 12, 12])]);
  const s = sug(log, 'goblet-squat', '2026-11-03'); // 21 days after the second calibration session: also due
  assert.deepEqual([s.weightLbs, s.source, s.weightLbs - s.fromWeightLbs], [30, 'earned', 5]);
});

example('5.12', 4, '8bf322e2', () => {
  const log = makeLog()
    .session('2026-10-06', 'B', [lift('lat-pulldown', 60, [12, 9, 8])])
    .session('2026-10-13', 'B', [lift('lat-pulldown', 60, [11, 9, 9])]);
  const s = sug(log, 'lat-pulldown', '2026-11-03'); // due, but the reduction rule fires
  assert.deepEqual([s.weightLbs, s.source], [50, 'reduction']);
});

example('5.12', 5, 'ef052a45', () => {
  const log = makeLog()
    .session('2026-10-06', 'A', [lift('goblet-squat', 25, [10, 10, 10])])
    .session('2026-10-13', 'A', [lift('goblet-squat', 25, [10, 10, 10])]);
  const today = suggestExercise(log.state(), { exerciseId: 'goblet-squat', templateCode: 'A', slot: 1, today: '2026-11-03', backPainBefore: 5 });
  assert.deepEqual([today.weightLbs, today.source], [25, 'gated']);
  // The next session, with no back pain, gets the increase.
  const next = suggestExercise(log.state(), { exerciseId: 'goblet-squat', templateCode: 'A', slot: 1, today: '2026-11-10', backPainBefore: 2 });
  assert.deepEqual([next.weightLbs, next.source], [30, 'scheduled']);
});

example('5.12', 6, 'f8c7edd8', () => {
  const log = makeLog()
    .session('2026-10-06', 'B', [lift('lat-pulldown', 60, [11, 10, 10])])
    .session('2026-10-13', 'B', [lift('lat-pulldown', 60, [11, 10, 10])])
    .session('2026-11-02', 'B', [lift('lat-pulldown', 60, [11, 10, 10])]);
  // An increase is due (Nov 3 and later). Week 11 starts 2026-12-07 and is a deload; week 12 starts 2026-12-14.
  const during = sug(log, 'lat-pulldown', '2026-12-07');
  assert.deepEqual([during.weightLbs, during.source], [60, 'deload']);
  const after = sug(log, 'lat-pulldown', '2026-12-14');
  assert.deepEqual([after.weightLbs, after.source], [70, 'scheduled']);
});

example('5.12', 7, '13bd5b1a', () => {
  const log = pulldown70();
  const suggested = sug(log, 'lat-pulldown', '2026-10-22');
  assert.deepEqual([suggested.weightLbs, suggested.source], [80, 'scheduled']);
  // The user logs 70 instead.
  log.session('2026-10-22', 'B', [lift('lat-pulldown', 70, [11, 10, 10], loggedDefaults(suggested))]);
  const next = sug(log, 'lat-pulldown', '2026-10-29');
  assert.deepEqual([next.weightLbs, next.source], [80, 'scheduled']);
  assert.equal(next.lastIncreaseDate, '2026-10-01', 'the timer did not reset');
});

example('5.12', 8, '66101c18', () => {
  const log = makeLog()
    .session('2026-10-06', 'B', [lift('hip-thrust', 0, [11, 11])])
    .session('2026-10-13', 'B', [lift('hip-thrust', 0, [11, 11])]);
  assert.equal(sug(log, 'hip-thrust', '2026-11-02').weightLbs, 0);
  const s = sug(log, 'hip-thrust', '2026-11-03'); // 21 days since calibration ended
  assert.deepEqual([s.weightLbs, s.source], [45, 'scheduled']);
});

example('5.12', 9, 'c6ac98b8', () => {
  const due = () => makeLog()
    .session('2026-10-06', 'A', [lift('goblet-squat', 25, [10, 10, 10])])
    .session('2026-10-13', 'A', [lift('goblet-squat', 25, [10, 10, 10])]);
  assert.equal(sug(due(), 'goblet-squat', '2026-11-03').source, 'scheduled');
  const off = due().setting('scheduledIncrease:goblet-squat', false);
  assert.deepEqual([sug(off, 'goblet-squat', '2026-11-03').weightLbs, sug(off, 'goblet-squat', '2026-11-03').source], [25, 'hold']);
  // Only earned increases apply.
  const earned = makeLog()
    .setting('scheduledIncrease:goblet-squat', false)
    .session('2026-10-06', 'A', [lift('goblet-squat', 25, [12, 12, 12])]);
  assert.deepEqual([sug(earned, 'goblet-squat', '2026-10-13').weightLbs, sug(earned, 'goblet-squat', '2026-10-13').source], [30, 'earned']);
});

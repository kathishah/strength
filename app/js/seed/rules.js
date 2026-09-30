// Structured rules per exercise: the numeric fields spec section 8 lists, which the v0.2 display
// catalog (catalog.js) does not have. Same exercise ids as catalog.js and program.js, which stay
// untouched so their parity test with the frozen viewer keeps working (DEPLOYMENT-PLAN.md section 14).
//
// Values come from spec 4.3 (reps), 4.5.1 (TRX reps and levels), 5.3 (increments) and the 5.6 table
// (starting and first-loaded weights). test/rules.test.mjs reads those tables out of
// SPEC-strength.md and compares. A null where a value would be is "the spec gives none":
//   - repMin/repMax/perSide/targetDistanceM null: an alternative with no range of its own uses the range of the
//     slot it is swapped into (spec question in plan section 14).
//   - startingWeightLbs null: no pre-fill; the user is asked for a weight (spec 5.6, swapped-in alternatives).

// How the engine treats an exercise:
//   load        weight: pre-filled with last time's heaviest weight, raised one increment when a scheduled increase is
//               due (spec 5.12): dumbbell, barbell, machine, cable, carry
//   loadable    45° back extension: pre-filled with last time's weight, never changed (no progression, spec 5.4)
//   bodyweight  dead bug: no load, no progression
//   ladder      pushup: pre-filled with last time's level, never changed
//   suspension  TRX: pre-filled with last time's level (start 2), never changed
//   hold        completion only (TRX plank, weighted bird dog)
//   none        sets and reps only (band pull-apart)
const base = {
  progression: 'load',
  repMin: null,
  repMax: null,
  perSide: null,
  holdSeconds: null,
  targetDistanceM: null,
  loadIncrementLbs: null,
  startingWeightLbs: null,
  firstLoadedWeightLbs: null,
  startingLevel: null,
};
const ex = (type, fields) => ({ ...base, type, ...fields });
const reps = (repMin, repMax, perSide = false) => ({ repMin, repMax, perSide });

// Increments (spec 5.3): one dumbbell (goblet squat, box squat) 5; two dumbbells 2.5 per dumbbell; barbell/trap bar 10;
// machine/cable 10 (face pull 5); carry 5 per hand.
const DB1 = 5;
const DB = 2.5;
const BB = 10;
const MC = 10;

export const RULES = {
  // ---- Workout A ----
  'goblet-squat': ex('dumbbell', { ...reps(8, 12), loadIncrementLbs: DB1, startingWeightLbs: 20 }),
  'db-bench-press': ex('dumbbell', { ...reps(8, 12), loadIncrementLbs: DB, startingWeightLbs: 20 }),
  'db-romanian-deadlift': ex('dumbbell', { ...reps(8, 10), loadIncrementLbs: DB, startingWeightLbs: 15 }),
  'chest-supported-row': ex('dumbbell', { ...reps(10, 12), loadIncrementLbs: DB, startingWeightLbs: 20 }),
  'dead-bug': ex('bodyweight', { progression: 'bodyweight', ...reps(8, 8, true), startingWeightLbs: 0 }),
  'face-pull': ex('cable', { ...reps(12, 15), loadIncrementLbs: 5, startingWeightLbs: 20 }),

  // ---- Workout B ----
  'leg-press': ex('machine', { ...reps(10, 12), loadIncrementLbs: MC, startingWeightLbs: 0, firstLoadedWeightLbs: 50 }),
  'lat-pulldown': ex('cable', { ...reps(10, 12), loadIncrementLbs: MC, startingWeightLbs: 60 }),
  'hip-thrust': ex('barbell', { ...reps(10, 12), loadIncrementLbs: BB, startingWeightLbs: 0, firstLoadedWeightLbs: 45 }),
  'seated-db-shoulder-press': ex('dumbbell', { ...reps(8, 12), loadIncrementLbs: DB, startingWeightLbs: 15 }),
  // Level 1 range (standard, 10-20); the other levels are in PUSHUP_LADDER (display only).
  pushup: ex('bodyweight_ladder', { progression: 'ladder', ...reps(10, 20), startingWeightLbs: 0, startingLevel: 1 }),
  // Bodyweight-based: no progression (spec 5.4); the box is pre-filled with last time's weight.
  'back-extension-45': ex('bodyweight_loadable', { progression: 'loadable', ...reps(10, 15), startingWeightLbs: 0 }),

  // ---- Workout C ----
  // The trap bar starts at the bar's own weight: the trapBarWeightLbs setting (default 45).
  'trap-bar-deadlift': ex('barbell', { ...reps(6, 10), loadIncrementLbs: BB, startingWeightLbs: null }),
  'incline-db-press': ex('dumbbell', { ...reps(8, 12), loadIncrementLbs: DB, startingWeightLbs: 20 }),
  'reverse-lunge': ex('dumbbell', { ...reps(8, 8, true), loadIncrementLbs: DB, startingWeightLbs: 0, firstLoadedWeightLbs: 10 }),
  'seated-cable-row': ex('cable', { ...reps(10, 12), loadIncrementLbs: MC, startingWeightLbs: 60 }),
  'farmer-carry': ex('carry', { targetDistanceM: 40, loadIncrementLbs: 5, startingWeightLbs: 35 }),

  // ---- Back-friendly alternatives (spec 4.5) ----
  'box-squat': ex('dumbbell', { loadIncrementLbs: DB1 }),
  'cable-pull-through': ex('cable', { loadIncrementLbs: MC }),
  'bulgarian-split-squat': ex('dumbbell', { loadIncrementLbs: DB }),
  'split-squat': ex('dumbbell', { loadIncrementLbs: DB }),
  'step-up': ex('dumbbell', { loadIncrementLbs: DB }),
  'machine-row': ex('machine', { loadIncrementLbs: MC }),
  'machine-shoulder-press': ex('machine', { loadIncrementLbs: MC }),
  'landmine-press': ex('barbell', { loadIncrementLbs: BB }),
  'suitcase-carry': ex('carry', { loadIncrementLbs: 5 }),
  'machine-chest-press': ex('machine', { loadIncrementLbs: MC }),
  'reverse-pec-deck': ex('machine', { loadIncrementLbs: MC }),
  'band-pull-apart': ex('mobility', { progression: 'none' }),
  'machine-back-extension': ex('machine', { loadIncrementLbs: MC }),
  'bird-dog-weighted-hold': ex('bodyweight_loadable', { progression: 'hold' }),
  // The catalog gives the pallof press "10 / side"; the spec table gives only its starting weight (10).
  'pallof-press': ex('cable', { ...reps(10, 10, true), loadIncrementLbs: MC, startingWeightLbs: 10 }),

  // ---- TRX alternatives (spec 4.5.1): level 1-5 instead of a load, starting level 2 ----
  'trx-squat': ex('suspension', { progression: 'suspension', ...reps(12, 15), startingLevel: 2 }),
  'trx-bulgarian-split-squat': ex('suspension', { progression: 'suspension', ...reps(8, 12, true), startingLevel: 2 }),
  'trx-reverse-lunge': ex('suspension', { progression: 'suspension', ...reps(8, 12, true), startingLevel: 2 }),
  'trx-chest-press': ex('suspension', { progression: 'suspension', ...reps(10, 15), startingLevel: 2 }),
  'trx-row': ex('suspension', { progression: 'suspension', ...reps(10, 15), startingLevel: 2 }),
  'trx-high-row': ex('suspension', { progression: 'suspension', ...reps(10, 15), startingLevel: 2 }),
  'trx-face-pull': ex('suspension', { progression: 'suspension', ...reps(12, 15), startingLevel: 2 }),
  'trx-hip-thrust': ex('suspension', { progression: 'suspension', ...reps(10, 15), startingLevel: 2 }),
  'trx-hamstring-curl': ex('suspension', { progression: 'suspension', ...reps(8, 12), startingLevel: 2 }),
  // "2 x 20-40 s hold; hold type, no levels". The spec's holdSeconds is one number; 4.5.1 gives a range.
  'trx-plank': ex('suspension', { progression: 'hold', holdSeconds: { min: 20, max: 40 } }),
};

// Catalog ids with no rules: recovery-routine items (spec 4.6), guidance only, never progressed and never
// a slot or alternative. (band-pull-apart is also a recovery item but is a face pull alternative, so it has rules.)
export const GUIDANCE_ONLY = [
  'bird-dog', 'glute-bridge', 'hip-flexor-stretch', 'mcgill-curl-up', 'side-plank', 'open-book', 'dowel-hip-hinge',
];

// Working sets per template slot in Phase 2 (spec 4.3), by slot number 1..n. A swapped-in exercise keeps the slot's count.
export const SLOT_SETS = {
  A: [3, 3, 3, 3, 2, 2],
  B: [3, 3, 3, 3, 3, 2],
  C: [3, 3, 2, 3, 3],
};

// Pushup ladder (spec 5.4): rep range per level. Level 0 is a regression only.
export const PUSHUP_LADDER = [
  { level: 0, repMin: 10, repMax: 20 },
  { level: 1, repMin: 10, repMax: 20 },
  { level: 2, repMin: 8, repMax: 15 },
  { level: 3, repMin: 8, repMax: 15 },
  { level: 4, repMin: 8, repMax: 15 },
  { level: 5, repMin: 8, repMax: 15 },
];

// Program-wide numbers (spec 5.1, 5.12 and the UserProfile defaults of spec 8).
export const PROGRAM = {
  defaultProgramStartDate: '2026-09-28',
  defaultTrapBarWeightLbs: 45,
  defaultScheduledIncreaseDays: 21,
  phase1Weeks: 4,
};

// Structured rules per exercise: the numeric fields spec section 8 lists, which the v0.2 display
// catalog (catalog.js) does not have. Same exercise ids as catalog.js and program.js, which stay
// untouched so their parity test with the frozen viewer keeps working (DEPLOYMENT-PLAN.md section 14).
//
// Values come from spec 4.3 (reps), 4.5.1 (TRX reps and levels), 5.3 (increments) and the 5.6 table
// (starting and first-loaded weights, loadsBack). test/rules.test.mjs reads those tables out of
// SPEC-strength.md and compares. A null where a value would be is "the spec gives none":
//   - repMin/repMax/perSide/targetDistanceM null: an alternative with no range of its own uses the range of the
//     slot it is swapped into (spec question in plan section 14).
//   - startingWeightLbs null: no pre-fill; the user is asked for a weight (spec 5.6, swapped-in alternatives).

// How the engine treats an exercise:
//   load        weight is progressed by double progression (dumbbell, barbell, machine, cable, loadable, carry)
//   bodyweight  no load, no progression, a hint when every set reaches the top (dead bug)
//   ladder      pushup: level by reps, then variation (spec 5.4)
//   suspension  TRX: level 1-5 instead of a load
//   hold        completion only (TRX plank, weighted bird dog)
//   none        no progression and no suggestion beyond sets and reps (band pull-apart)
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
  loadsBack: false,
};
const ex = (type, fields) => ({ ...base, type, ...fields });
const reps = (repMin, repMax, perSide = false) => ({ repMin, repMax, perSide });

// Increments by type (spec 5.3): dumbbell 5 per dumbbell, barbell/trap bar 10, machine/cable 10, carry 5, loadable 5.
const DB = 5;
const BB = 10;
const MC = 10;

export const RULES = {
  // ---- Workout A ----
  'goblet-squat': ex('dumbbell', { ...reps(8, 12), loadIncrementLbs: DB, startingWeightLbs: 20, loadsBack: true }),
  'db-bench-press': ex('dumbbell', { ...reps(8, 12), loadIncrementLbs: DB, startingWeightLbs: 20 }),
  'db-romanian-deadlift': ex('dumbbell', { ...reps(8, 10), loadIncrementLbs: DB, startingWeightLbs: 15, loadsBack: true }),
  'chest-supported-row': ex('dumbbell', { ...reps(10, 12), loadIncrementLbs: DB, startingWeightLbs: 20 }),
  'dead-bug': ex('bodyweight', { progression: 'bodyweight', ...reps(8, 8, true), startingWeightLbs: 0 }),
  'face-pull': ex('cable', { ...reps(12, 15), loadIncrementLbs: 5, startingWeightLbs: 20 }),

  // ---- Workout B ----
  'leg-press': ex('machine', { ...reps(10, 12), loadIncrementLbs: MC, startingWeightLbs: 0, firstLoadedWeightLbs: 50 }),
  'lat-pulldown': ex('cable', { ...reps(10, 12), loadIncrementLbs: MC, startingWeightLbs: 60 }),
  'hip-thrust': ex('barbell', { ...reps(10, 12), loadIncrementLbs: BB, startingWeightLbs: 0, firstLoadedWeightLbs: 45 }),
  'seated-db-shoulder-press': ex('dumbbell', { ...reps(8, 12), loadIncrementLbs: DB, startingWeightLbs: 15 }),
  // Level 1 range (standard, 10-20); the other levels are in PUSHUP_LADDER. Level 5 adds load in 5-lb steps (spec 5.4).
  pushup: ex('bodyweight_ladder', {
    progression: 'ladder', ...reps(10, 20), loadIncrementLbs: 5, startingWeightLbs: 0, startingLevel: 1,
  }),
  'back-extension-45': ex('bodyweight_loadable', {
    ...reps(10, 15), loadIncrementLbs: 5, startingWeightLbs: 0, loadsBack: true,
  }),

  // ---- Workout C ----
  // The trap bar starts at the bar's own weight: the trapBarWeightLbs setting (default 45).
  'trap-bar-deadlift': ex('barbell', { ...reps(6, 10), loadIncrementLbs: BB, startingWeightLbs: null, loadsBack: true }),
  'incline-db-press': ex('dumbbell', { ...reps(8, 12), loadIncrementLbs: DB, startingWeightLbs: 20 }),
  'reverse-lunge': ex('dumbbell', { ...reps(8, 8, true), loadIncrementLbs: DB, startingWeightLbs: 0, firstLoadedWeightLbs: 10 }),
  'seated-cable-row': ex('cable', { ...reps(10, 12), loadIncrementLbs: MC, startingWeightLbs: 60 }),
  'farmer-carry': ex('carry', { targetDistanceM: 40, loadIncrementLbs: 5, startingWeightLbs: 35, loadsBack: true }),

  // ---- Back-friendly alternatives (spec 4.5) ----
  'box-squat': ex('dumbbell', { loadIncrementLbs: DB }),
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

// Program-wide numbers (spec 5.1, 5.8, 5.12 and the UserProfile defaults of spec 8).
export const PROGRAM = {
  defaultProgramStartDate: '2026-09-28',
  defaultTrapBarWeightLbs: 45,
  defaultScheduledIncreaseDays: 21,
  phase1Weeks: 4,
  phase1Sets: 2,
  firstDeloadWeek: 11,
  deloadGapWeeks: 7,
  // Suggested reduction after two weak sessions (spec 5.2 rule 2): about 10%.
  reductionPercent: 10,
  // Reductions within this many weeks make an exercise stalled (spec 5.10).
  stallWeeks: 9,
  stallReductions: 2,
  // Back pain before above this holds loadsBack exercises at the base load (spec 5.9).
  backPainGate: 3,
  // Ramp-up sets (spec 5.5): a share of the working weight, and the reps.
  rampUp: [{ share: 0.5, reps: 8 }, { share: 0.75, reps: 4 }],
  rampUpSlots: [1, 3],
  // Calibration lasts an exercise's first sessions (spec 5.6).
  calibrationSessions: 2,
  maxLevel: 5,
  minLevel: 1,
};

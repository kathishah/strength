// Program data, copied verbatim from the frozen v0.2 viewer (root index.html, spec 0.C):
// the sitting recovery routine (spec 4.6), the A/B/C templates with their alternatives
// (4.3, 4.5, 4.5.1) and the recovery label. Set counts are the Phase 2 counts, as text.
// The viewer's fixed weekday mapping is not copied: v1 rotates by last completed workout (spec 4.1).

export const RECOVERY = [
  { exercise: "hip-flexor-stretch", prescription: "30 s per side" },
  { exercise: "glute-bridge",       prescription: "12 reps" },
  { exercise: "mcgill-curl-up",     prescription: "5 holds × 8–10 s" },
  { exercise: "side-plank",         prescription: "15–20 s per side" },
  { exercise: "bird-dog",           prescription: "5 per side, 8–10 s hold" },
  { exercise: "open-book",          prescription: "5 per side" },
  { exercise: "band-pull-apart",    prescription: "15 reps" },
  { exercise: "dowel-hip-hinge",    prescription: "5 reps" }
];

export const WORKOUTS = {
  A: {
    label: "Workout A – Full body",
    slots: [
      { slot: 1, superset: 1, exercise: "goblet-squat",         sets: "3", reps: "8–12",     alternatives: ["leg-press", "box-squat"],            trxAlternatives: ["trx-squat"] },
      { slot: 2, superset: 1, exercise: "db-bench-press",       sets: "3", reps: "8–12",     alternatives: [],                                   trxAlternatives: ["trx-chest-press"] },
      { slot: 3, superset: 2, exercise: "db-romanian-deadlift", sets: "3", reps: "8–10",     alternatives: ["hip-thrust", "cable-pull-through"], trxAlternatives: ["trx-hamstring-curl"] },
      { slot: 4, superset: 2, exercise: "chest-supported-row",  sets: "3", reps: "10–12",    alternatives: ["seated-cable-row", "machine-row"],  trxAlternatives: ["trx-row"] },
      { slot: 5, superset: 3, exercise: "dead-bug",             sets: "2", reps: "8 / side", alternatives: [],                                   trxAlternatives: ["trx-plank"] },
      { slot: 6, superset: 3, exercise: "face-pull",            sets: "2", reps: "12–15",    alternatives: ["reverse-pec-deck", "band-pull-apart"], trxAlternatives: ["trx-face-pull"] }
    ]
  },
  B: {
    label: "Workout B – Full body",
    slots: [
      { slot: 1, superset: 1, exercise: "leg-press",                sets: "3", reps: "10–12",  alternatives: [],                                            trxAlternatives: ["trx-bulgarian-split-squat"] },
      { slot: 2, superset: 1, exercise: "lat-pulldown",             sets: "3", reps: "10–12",  alternatives: [],                                            trxAlternatives: ["trx-high-row"] },
      { slot: 3, superset: 2, exercise: "hip-thrust",               sets: "3", reps: "10–12",  alternatives: [],                                            trxAlternatives: ["trx-hip-thrust"] },
      { slot: 4, superset: 2, exercise: "seated-db-shoulder-press", sets: "3", reps: "8–12",   alternatives: ["machine-shoulder-press", "landmine-press"],  trxAlternatives: [] },
      { slot: 5, superset: 3, exercise: "pushup",                   sets: "3", reps: "10–20",  alternatives: ["machine-chest-press", "pallof-press"],       trxAlternatives: ["trx-chest-press"] },
      { slot: 6, superset: 3, exercise: "back-extension-45",        sets: "2", reps: "10–15",  alternatives: ["machine-back-extension", "bird-dog-weighted-hold"], trxAlternatives: [] }
    ]
  },
  C: {
    label: "Workout C – Full body",
    slots: [
      { slot: 1, superset: 1,    exercise: "trap-bar-deadlift", sets: "3", reps: "6–10",    alternatives: ["bulgarian-split-squat", "leg-press"], trxAlternatives: [] },
      { slot: 2, superset: 1,    exercise: "incline-db-press",  sets: "3", reps: "8–12",    alternatives: [],                                   trxAlternatives: ["trx-chest-press"] },
      { slot: 3, superset: 2,    exercise: "reverse-lunge",     sets: "2", reps: "8 / leg", alternatives: ["split-squat", "step-up"],           trxAlternatives: ["trx-reverse-lunge"] },
      { slot: 4, superset: 2,    exercise: "seated-cable-row",  sets: "3", reps: "10–12",   alternatives: [],                                   trxAlternatives: ["trx-row"] },
      { slot: 5, superset: null, exercise: "farmer-carry",      sets: "3", reps: "40 m",    alternatives: ["suitcase-carry"],                   trxAlternatives: [] }
    ]
  }
};

export const RECOVERY_LABEL = "Sitting recovery · ~10 min, 2 rounds";

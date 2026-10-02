// Program data: the sitting recovery routine (spec 4.6), the A/B/C templates with their alternatives (4.3, 4.5, 4.5.1) and the
// recovery label. It began as a copy of the v0.2 viewer's data and has since diverged (spec 0.C, v1.19): more alternatives and
// no supersets. Set counts are the Phase 2 counts, as text. There is no fixed weekday mapping: v1 rotates by last completed
// workout (spec 4.1). Exercises are done one at a time, in slot order.

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
      { slot: 1, exercise: "goblet-squat",         sets: "3", reps: "8–12",     alternatives: ["leg-press", "box-squat", "hack-squat", "leg-extension"],                               trxAlternatives: ["trx-squat"] },
      { slot: 2, exercise: "db-bench-press",       sets: "3", reps: "8–12",     alternatives: ["machine-chest-press", "pushup", "cable-chest-press", "pec-deck-fly"],                  trxAlternatives: ["trx-chest-press"] },
      { slot: 3, exercise: "db-romanian-deadlift", sets: "3", reps: "8–10",     alternatives: ["hip-thrust", "cable-pull-through", "seated-leg-curl"],                                 trxAlternatives: ["trx-hamstring-curl"] },
      { slot: 4, exercise: "chest-supported-row",  sets: "3", reps: "10–12",    alternatives: ["seated-cable-row", "machine-row", "one-arm-db-row", "single-arm-cable-row"],           trxAlternatives: ["trx-row"] },
      { slot: 5, exercise: "dead-bug",             sets: "2", reps: "8 / side", alternatives: ["pallof-press", "plank", "side-plank", "bird-dog-weighted-hold"],                       trxAlternatives: ["trx-plank"] },
      { slot: 6, exercise: "face-pull",            sets: "2", reps: "12–15",    alternatives: ["reverse-pec-deck", "band-pull-apart", "cable-reverse-fly", "chest-supported-rear-delt-raise"], trxAlternatives: ["trx-face-pull"] }
    ]
  },
  B: {
    label: "Workout B – Full body",
    slots: [
      { slot: 1, exercise: "leg-press",                sets: "3", reps: "10–12",  alternatives: ["hack-squat", "goblet-squat", "split-squat", "leg-extension"],                        trxAlternatives: ["trx-bulgarian-split-squat"] },
      { slot: 2, exercise: "lat-pulldown",             sets: "3", reps: "10–12",  alternatives: ["machine-high-row"],                                                                   trxAlternatives: ["trx-high-row"] },
      { slot: 3, exercise: "hip-thrust",               sets: "3", reps: "10–12",  alternatives: ["cable-pull-through", "cable-glute-kickback"],                                         trxAlternatives: ["trx-hip-thrust"] },
      { slot: 4, exercise: "seated-db-shoulder-press", sets: "3", reps: "8–12",   alternatives: ["machine-shoulder-press", "landmine-press", "db-lateral-raise"],                       trxAlternatives: [] },
      { slot: 5, exercise: "pushup",                   sets: "3", reps: "10–20",  alternatives: ["machine-chest-press", "pallof-press", "cable-chest-press", "pec-deck-fly"],           trxAlternatives: ["trx-chest-press"] },
      { slot: 6, exercise: "back-extension-45",        sets: "2", reps: "10–15",  alternatives: ["machine-back-extension", "bird-dog-weighted-hold", "cable-pull-through", "plank"],     trxAlternatives: [] }
    ]
  },
  C: {
    label: "Workout C – Full body",
    slots: [
      { slot: 1, exercise: "trap-bar-deadlift", sets: "3", reps: "6–10",    alternatives: ["bulgarian-split-squat", "leg-press", "hack-squat", "db-romanian-deadlift"],            trxAlternatives: [] },
      { slot: 2, exercise: "incline-db-press",  sets: "3", reps: "8–12",    alternatives: ["incline-machine-press", "landmine-press", "machine-chest-press"],                     trxAlternatives: ["trx-chest-press"] },
      { slot: 3, exercise: "reverse-lunge",     sets: "2", reps: "8 / leg", alternatives: ["split-squat", "step-up"],                                                             trxAlternatives: ["trx-reverse-lunge"] },
      { slot: 4, exercise: "seated-cable-row",  sets: "3", reps: "10–12",   alternatives: ["machine-row", "chest-supported-row", "single-arm-cable-row", "one-arm-db-row"],        trxAlternatives: ["trx-row"] },
      { slot: 5, exercise: "farmer-carry",      sets: "3", reps: "40 m",    alternatives: ["suitcase-carry", "goblet-carry", "trap-bar-carry"],                                   trxAlternatives: [] }
    ]
  }
};

export const RECOVERY_LABEL = "Sitting recovery · ~10 min, 2 rounds";

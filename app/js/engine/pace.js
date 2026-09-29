// Expected pace of load increases (spec 5.11), display only. Pure.
// Each exercise is done about once a week, so "every N weeks" is N sessions. The spec table names some exercises;
// the alternatives it does not name are placed in the group of their kind (see the spec questions in plan section 14).

const GROUPS = {
  'legs-hinge': { min: 1, max: 3, label: 'Leg press, trap bar deadlift, hip thrust', ids: ['leg-press', 'trap-bar-deadlift', 'hip-thrust'] },
  'machine-cable-upper': {
    min: 2, max: 4, label: 'Machine and cable upper body',
    ids: ['lat-pulldown', 'seated-cable-row', 'machine-row', 'face-pull', 'machine-chest-press', 'machine-shoulder-press', 'reverse-pec-deck'],
  },
  dumbbell: {
    min: 3, max: 5, label: 'Dumbbell exercises',
    ids: [
      'goblet-squat', 'db-bench-press', 'db-romanian-deadlift', 'chest-supported-row', 'seated-db-shoulder-press', 'incline-db-press',
      'reverse-lunge', 'box-squat', 'bulgarian-split-squat', 'split-squat', 'step-up',
    ],
  },
  'back-extension-carry': {
    min: 3, max: 6, label: 'Back extension and carries',
    ids: ['back-extension-45', 'machine-back-extension', 'farmer-carry', 'suitcase-carry'],
  },
};

export const PACE_NOTE = 'Progress slows after the first few months. Adding reps counts as progress too.';

const BY_ID = new Map(Object.entries(GROUPS).flatMap(([group, g]) => g.ids.map((id) => [id, group])));

// { group, label, everyWeeks: { min, max }, text, note } for an exercise the table covers, else null.
export function expectedPace(exerciseId) {
  const group = BY_ID.get(exerciseId);
  if (!group) return null;
  const { min, max, label } = GROUPS[group];
  return { group, label, everyWeeks: { min, max }, text: `Every ${min}–${max} weeks`, note: PACE_NOTE };
}

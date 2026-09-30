// The set rows of one exercise in one session, with pre-fill carry-over (spec 6.3). Pure.
//
// A row is 'done' (a logged set), 'editing' (a logged set being changed) or 'todo'. The weight and the level of a
// row that has not been logged come from, in order: what the person typed into it, the row before it (logged or
// typed), else the suggestion. So a change on one set pre-fills the remaining sets and never the earlier ones.
// Reps, distance and RIR are never pre-filled: they are what the person did, not a target.

// Which boxes an exercise's rows show, from the engine's suggestion (its `progression` and `type`).
export function inputsFor(suggestion) {
  switch (suggestion.progression) {
    case 'load': return suggestion.type === 'carry'
      ? { weight: true, level: false, reps: false, distance: true, hold: false }
      : { weight: true, level: false, reps: true, distance: false, hold: false };
    case 'loadable': return { weight: true, level: false, reps: true, distance: false, hold: false };
    case 'ladder':
    case 'suspension': return { weight: false, level: true, reps: true, distance: false, hold: false };
    case 'hold': return { weight: false, level: false, reps: false, distance: false, hold: true };
    default: return { weight: false, level: false, reps: true, distance: false, hold: false }; // bodyweight, none
  }
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Can a row with these values be logged? Every box the exercise shows needs a value; a weight of 0 counts.
export function canLog(values, inputs) {
  if (inputs.weight && !isNum(values.weightLbs)) return false;
  if (inputs.level && !(Number.isInteger(values.levelNumber) && values.levelNumber >= 1 && values.levelNumber <= 5)) return false;
  if (inputs.reps && !isNum(values.reps)) return false;
  if (inputs.distance && !isNum(values.distanceM)) return false;
  return true;
}

const FIELDS = ['weightLbs', 'levelNumber', 'reps', 'distanceM', 'rir'];
const has = (obj, key) => obj !== undefined && Object.hasOwn(obj, key);
const orNull = (x) => (x === undefined ? null : x);

// suggestion: the engine's suggestExercise result. logged: this exercise's sets in this session (replay records, deleted
// ones already gone). draftRows: { [setNumber]: { weightLbs?, levelNumber?, reps?, distanceM?, rir?, editing? } }.
// planned: the slot's set count for the phase (0 for an exercise that is no longer in the plan). extra: sets added.
//
// Returns rows in set-number order:
//   { id, setNumber, status, setId, weightLbs, levelNumber, reps, distanceM, rir,
//     suggestedWeightLbs, suggestedLevel,          // what "changed from" compares with
//     weightChanged, levelChanged, canLog, dirty } // dirty: an editing row that differs from the logged set
export function buildRows({ suggestion, logged = [], draftRows = {}, planned = 0, extra = 0 }) {
  const inputs = inputsFor(suggestion);
  const sortedLogged = [...logged].sort((a, b) => a.setNumber - b.setNumber || (a.id < b.id ? -1 : 1));
  const taken = new Set(sortedLogged.map((s) => s.setNumber));
  const highest = sortedLogged.reduce((m, s) => Math.max(m, s.setNumber), 0);
  const count = Math.max(planned + extra, highest);

  const slots = sortedLogged.map((set) => ({ setNumber: set.setNumber, set }));
  for (let n = 1; n <= count; n++) if (!taken.has(n)) slots.push({ setNumber: n, set: null });
  slots.sort((a, b) => a.setNumber - b.setNumber || (a.set ? (b.set ? (a.set.id < b.set.id ? -1 : 1) : -1) : 1));

  const rows = [];
  let carryWeight = suggestion.weightLbs ?? null;
  let carryLevel = suggestion.level ?? null;
  for (const { setNumber, set } of slots) {
    const draft = draftRows[setNumber];
    const editing = set !== null && draft?.editing === true;
    const status = set === null ? 'todo' : editing ? 'editing' : 'done';

    // A value the person typed wins; a logged set keeps its values; a todo row takes the carried value.
    const pick = (field, carried) => {
      if (status !== 'done' && has(draft, field)) return draft[field];
      if (set !== null) return orNull(set[field]);
      return carried;
    };
    const values = {
      weightLbs: inputs.weight ? pick('weightLbs', carryWeight) : null,
      levelNumber: inputs.level ? pick('levelNumber', carryLevel) : null,
      reps: inputs.reps ? pick('reps', null) : null,
      distanceM: inputs.distance ? pick('distanceM', null) : null,
      rir: pick('rir', null),
    };
    carryWeight = values.weightLbs;
    carryLevel = values.levelNumber;

    const suggestedWeightLbs = set ? orNull(set.suggestedWeightLbs) : suggestion.weightLbs;
    const suggestedLevel = set ? orNull(set.suggestedLevel) : suggestion.level;
    const dirty = editing && FIELDS.some((f) => values[f] !== orNull(set[f]));
    rows.push({
      id: set ? set.id : `${suggestion.exerciseId}:${setNumber}`,
      setNumber,
      status,
      setId: set ? set.id : null,
      ...values,
      suggestedWeightLbs,
      suggestedLevel,
      weightChanged: inputs.weight && values.weightLbs !== null && suggestedWeightLbs !== null && values.weightLbs !== suggestedWeightLbs,
      levelChanged: inputs.level && values.levelNumber !== null && suggestedLevel !== null && values.levelNumber !== suggestedLevel,
      canLog: status === 'done' ? false : canLog(values, inputs),
      dirty,
    });
  }
  return rows;
}

// Only the values the exercise's boxes show (a dead bug has no weight, a carry has no reps), plus RIR.
export function pickValues(values, inputs) {
  return {
    weightLbs: inputs.weight ? values.weightLbs ?? null : null,
    levelNumber: inputs.level ? values.levelNumber ?? null : null,
    reps: inputs.reps ? values.reps ?? null : null,
    distanceM: inputs.distance ? values.distanceM ?? null : null,
    rir: values.rir ?? null,
  };
}

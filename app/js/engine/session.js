// The plan for a workout day: the calendar and one suggestion per slot, with swaps applied. Pure.

import { RULES } from '../seed/rules.js';
import { WORKOUTS } from '../seed/program.js';
import { calendarFor } from './calendar.js';
import { valueAt } from './prefill.js';
import { suggestExercise } from './suggest.js';

// The exercise in a slot: the user's swap if it is one of the slot's options, else the default.
export function exerciseForSlot(state, templateCode, slotNumber) {
  const slot = WORKOUTS[templateCode].slots.find((s) => s.slot === slotNumber);
  const swapped = state.swaps?.[`${templateCode}:${slotNumber}`];
  const options = [...slot.alternatives, ...slot.trxAlternatives];
  return swapped && options.includes(swapped) && Object.hasOwn(RULES, swapped)
    ? { exerciseId: swapped, swapped: true, defaultExerciseId: slot.exercise, slot }
    : { exerciseId: slot.exercise, swapped: false, defaultExerciseId: slot.exercise, slot };
}

// state: replay(events). today: Pacific "yyyy-mm-dd".
export function planSession(state, { today, templateCode }) {
  if (!Object.hasOwn(WORKOUTS, templateCode)) throw new RangeError(`unknown workout "${templateCode}"`);
  const calendar = calendarFor({ settings: state.settings, today });
  const exercises = WORKOUTS[templateCode].slots.map((s) => {
    const { exerciseId, swapped, defaultExerciseId } = exerciseForSlot(state, templateCode, s.slot);
    const suggestion = suggestExercise(state, { exerciseId, templateCode, slot: s.slot, today });
    return { slot: s.slot, defaultExerciseId, swapped, ...suggestion };
  });

  return { templateCode, today, calendar, exercises };
}

// The fields a set.logged event carries about the suggestion it was made under (spec 8: SetLog). With a set number, the
// suggestion is that set's own pre-fill (spec 5.2); without one, the exercise's single suggested weight or level.
export function loggedDefaults(suggestion, setNumber = null) {
  const own = (list, single) => (setNumber === null ? single : valueAt(list, setNumber, single));
  return {
    suggestedWeightLbs: own(suggestion.setWeightsLbs, suggestion.weightLbs),
    suggestedLevel: own(suggestion.setLevels, suggestion.level),
    suggestionSource: suggestion.source,
  };
}

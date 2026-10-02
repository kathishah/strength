// The plan for a workout day: the calendar and one suggestion per slot, with swaps applied. Pure.

import { RULES } from '../seed/rules.js';
import { WORKOUTS } from '../seed/program.js';
import { calendarFor } from './calendar.js';
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

// The fields a set.logged event carries about the suggestion it was made under (spec 8: SetLog).
export function loggedDefaults(suggestion) {
  return {
    suggestedWeightLbs: suggestion.weightLbs,
    suggestedLevel: suggestion.level,
    suggestionSource: suggestion.source,
  };
}

// The plan for a workout day: the calendar, the banner and one suggestion per slot, with swaps applied. Pure.

import { RULES } from '../seed/rules.js';
import { WORKOUTS } from '../seed/program.js';
import { calendarFor } from './calendar.js';
import { hint, suggestExercise } from './suggest.js';

export const DELOAD_BANNER = 'Deload week: same weights, half the sets. Let your joints and back catch up.';

// The exercise in a slot: the user's swap if it is one of the slot's options, else the default.
export function exerciseForSlot(state, templateCode, slotNumber) {
  const slot = WORKOUTS[templateCode].slots.find((s) => s.slot === slotNumber);
  const swapped = state.swaps?.[`${templateCode}:${slotNumber}`];
  const options = [...slot.alternatives, ...slot.trxAlternatives];
  return swapped && options.includes(swapped) && Object.hasOwn(RULES, swapped)
    ? { exerciseId: swapped, swapped: true, defaultExerciseId: slot.exercise, slot }
    : { exerciseId: slot.exercise, swapped: false, defaultExerciseId: slot.exercise, slot };
}

// state: replay(events). today: Pacific "yyyy-mm-dd". backPainBefore: 0-10 or null (not entered).
export function planSession(state, { today, templateCode, backPainBefore = null }) {
  if (!Object.hasOwn(WORKOUTS, templateCode)) throw new RangeError(`unknown workout "${templateCode}"`);
  const calendar = calendarFor({ settings: state.settings, deloads: state.deloads, today });
  const exercises = WORKOUTS[templateCode].slots.map((s) => {
    const { exerciseId, swapped, defaultExerciseId, slot } = exerciseForSlot(state, templateCode, s.slot);
    const suggestion = suggestExercise(state, { exerciseId, templateCode, slot: s.slot, today, backPainBefore });
    return { slot: s.slot, superset: slot.superset, defaultExerciseId, swapped, ...suggestion };
  });

  // Two TRX exercises in one superset: a tip to alternate with the dumbbell version (spec 4.5.1).
  const trxBySuperset = new Map();
  for (const e of exercises) {
    if (e.superset !== null && e.type === 'suspension') trxBySuperset.set(e.superset, [...(trxBySuperset.get(e.superset) ?? []), e]);
  }
  for (const group of trxBySuperset.values()) if (group.length >= 2) group.forEach((e) => e.hints.push(hint('trx-pair')));

  return {
    templateCode,
    today,
    calendar,
    banner: calendar.isDeload ? DELOAD_BANNER : null,
    backPainBefore: Number.isInteger(backPainBefore) ? backPainBefore : null,
    exercises,
  };
}

// The fields a set.logged event carries about the suggestion it was made under (spec 8: SetLog).
export function loggedDefaults(suggestion) {
  return {
    suggestedWeightLbs: suggestion.weightLbs,
    suggestedLevel: suggestion.level,
    suggestionSource: suggestion.source,
    isCalibration: suggestion.isCalibration,
  };
}

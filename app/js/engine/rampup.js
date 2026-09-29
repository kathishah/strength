// Ramp-up sets (spec 5.5). Pure.
//
// Before the first exercise of superset 1 and superset 2 (slots 1 and 3) when it has a working weight: 50% x 8, then
// 75% x 4, each rounded to the exercise's load increment (nearest, an exact tie rounds up). A ramp set is left out if
// it rounds to 0 or equals the working weight. None for unloaded exercises, loadable bodyweight and carries, at a
// working weight of 0, or during the exercise's calibration sessions.

import { PROGRAM } from '../seed/rules.js';
import { roundToIncrement } from './load.js';

const NO_RAMP_TYPES = ['bodyweight', 'bodyweight_loadable', 'carry'];

// exercise: { progression, type, incrementLbs } (a suggestion or the resolved config); weightLbs: the working weight.
export function rampUpSets({ weightLbs, exercise, slot, isCalibration = false }) {
  if (!PROGRAM.rampUpSlots.includes(slot) || isCalibration) return [];
  if (exercise.progression !== 'load' || NO_RAMP_TYPES.includes(exercise.type)) return [];
  if (!(weightLbs > 0) || !(exercise.incrementLbs > 0)) return [];
  return PROGRAM.rampUp
    .map(({ share, reps }) => ({ weightLbs: roundToIncrement(weightLbs * share, exercise.incrementLbs), reps }))
    .filter((r) => r.weightLbs > 0 && r.weightLbs !== weightLbs);
}

// Calibration pre-fills (spec 5.6). Pure.
//
// During an exercise's first two sessions a weighted exercise asks "How did that feel?" after each working set:
//   too_easy   -> the next set's weight goes up one increment (or to the first-loaded weight from 0)
//   about_right-> no change
//   too_hard   -> down one increment (minimum 0; a step below the first-loaded weight goes to 0, as in 5.4)
// The prompt can be skipped: no feel means no change.

import { decreaseLoad, increaseLoad } from './load.js';

// suggestion: a suggestExercise result; weightLbs: the weight just logged; feel: too_easy | about_right | too_hard | null.
// source is 'calibration' when the pre-fill differs from what the exercise was suggested.
export function calibrationPrefill(suggestion, { weightLbs, feel = null }) {
  const cfg = { incrementLbs: suggestion.incrementLbs, firstLoadedWeightLbs: suggestion.firstLoadedWeightLbs };
  let next = weightLbs;
  if (suggestion.progression === 'load' && suggestion.incrementLbs > 0) {
    if (feel === 'too_easy') next = increaseLoad(weightLbs, cfg);
    else if (feel === 'too_hard') next = decreaseLoad(weightLbs, cfg);
  }
  return { weightLbs: next, source: next === suggestion.weightLbs ? suggestion.source : 'calibration' };
}

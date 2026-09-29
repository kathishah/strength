// Load arithmetic shared by the suggestion, ramp-up and calibration code (spec 5.2 to 5.6). Pure.

import { PROGRAM } from '../seed/rules.js';

// Nearest multiple of the increment; an exact tie rounds up (spec 5.5).
export const roundToIncrement = (x, inc) => Math.floor(x / inc + 0.5 + 1e-9) * inc;

// One increase: from 0 an exercise with a first-loaded weight jumps to it (spec 5.4), otherwise +one increment.
export function increaseLoad(base, cfg) {
  if (base <= 0 && cfg.firstLoadedWeightLbs > 0) return cfg.firstLoadedWeightLbs;
  return base + cfg.incrementLbs;
}

// The load never goes negative, and a step down that lands below the first-loaded weight goes to 0 (spec 5.4).
function floorLoad(x, cfg) {
  if (x <= 0) return 0;
  if (cfg.firstLoadedWeightLbs > 0 && x < cfg.firstLoadedWeightLbs) return 0;
  return x;
}

// One increment down (calibration "too hard").
export const decreaseLoad = (base, cfg) => floorLoad(base - cfg.incrementLbs, cfg);

// The reduction of spec 5.2 rule 2: about 10%, rounded to the increment, and at least one increment. (At least one,
// because 10% of a light load rounds back to the same load: 5 lbs would stay 5. Spec example: 5 lbs -> 0.)
export function reduceLoad(base, cfg) {
  const tenPercent = roundToIncrement((base * (100 - PROGRAM.reductionPercent)) / 100, cfg.incrementLbs);
  return floorLoad(Math.min(tenPercent, base - cfg.incrementLbs), cfg);
}

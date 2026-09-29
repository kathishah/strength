// The progression engine (spec section 5). Pure functions over the replayed state; see DEPLOYMENT-PLAN.md section 14.
export { calendarFor, deloadWeeks, isDeloadWeek, nextDeloadWeek, phaseOf, postponement, programWeek, programWeekInfo, targetRir } from './calendar.js';
export { calibrationPrefill } from './calibration.js';
export { resolveExercise, setsFor } from './config.js';
export { exerciseHistory } from './history.js';
export { expectedPace, PACE_NOTE } from './pace.js';
export { rampUpSets } from './rampup.js';
export { DELOAD_BANNER, exerciseForSlot, loggedDefaults, planSession } from './session.js';
export { stallInfo } from './stall.js';
export { suggestExercise } from './suggest.js';

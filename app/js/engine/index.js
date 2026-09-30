// The progression engine (spec section 5 as cut in v1.13). Pure functions over the replayed state; see DEPLOYMENT-PLAN.md section 14.
export { calendarFor, phaseOf, programWeek, programWeekInfo, targetRir } from './calendar.js';
export { resolveExercise, setsFor } from './config.js';
export { exerciseHistory } from './history.js';
export { exerciseForSlot, loggedDefaults, planSession } from './session.js';
export { suggestExercise } from './suggest.js';

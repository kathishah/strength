// Workout logging: the pure parts of Phase D (archive/DEPLOYMENT-PLAN-history.md section 15). No DOM, no storage, no clock.
export { createActions } from './actions.js';
export { addExtraSet, clearExercise, clearRow, createDraftStore, emptyDraft, parseDraft, serializeDraft, setRowField, startEditing } from './draft.js';
export { PENDING, dayName, dayPills, dayView, editView, recoveryCards } from './day-view.js';
export { WEIGHT_NOTCH, dialNotches, formatNumber, notches, parseDistance, parseNumber, parseReps, parseWeight, stepValue } from './input.js';
export { buildRows, canLog, inputsFor, pickValues } from './rows.js';
export { consecutiveDayWarning, dayKind, finishedSessions, inProgressSessions, isRecoveryDay, listSessions, nextTemplate } from './rotation.js';
export { dateGroupLabel, exerciseDetail, historyByDate, historyByExercise } from './history-view.js';
export { buildView, sessionView, swapOptions } from './session-view.js';
export { summaryView } from './summary.js';
export { exerciseName, formatDay, formatTime } from './text.js';

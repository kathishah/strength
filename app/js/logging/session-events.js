// The event each action writes (plan section 15). Pure: a payload in, `{ type, entityId?, payload }` out. Every payload here
// is accepted by the server's validator (test/logging-events.test.mjs runs each one through it).

import { pacificIso } from '../time.js';
import { loggedDefaults } from '../engine/index.js';

const present = (x) => x !== null && x !== undefined;

// session.started. calendar: planSession(...).calendar.
export function sessionStarted({ templateCode, nowMs, calendar }) {
  const payload = {
    templateCode,
    startedAt: pacificIso(nowMs),
    programWeek: calendar.programWeek,
    phase: calendar.phase,
    isDeload: false,
  };
  return { type: 'session.started', payload };
}

// set.logged. values: { weightLbs, levelNumber, reps, distanceM } (nulls are left out).
// suggestion: the engine's result for the exercise, so the set records what was suggested (spec 8: SetLog).
export function setLogged({ sessionId, exerciseId, setNumber, values, suggestion }) {
  const payload = { sessionId, exerciseId, setNumber, isRampUp: false, isCalibration: false, completed: true };
  const defaults = loggedDefaults(suggestion);
  for (const [k, v] of Object.entries({ ...defaults, ...values })) if (present(v)) payload[k] = v;
  return { type: 'set.logged', payload };
}

const EDITABLE = ['weightLbs', 'levelNumber', 'reps', 'distanceM'];

// set.edited with only what changed, or null if nothing did. A box that was emptied becomes null (cleared).
export function setEdited({ logged, values }) {
  const payload = {};
  for (const f of EDITABLE) {
    const now = values[f] ?? null;
    if (now !== (logged[f] ?? null)) payload[f] = now;
  }
  return Object.keys(payload).length === 0 ? null : { type: 'set.edited', payload };
}

export const setDeleted = () => ({ type: 'entity.deleted', payload: { entityType: 'set' } });
export const sessionDeleted = () => ({ type: 'entity.deleted', payload: { entityType: 'session' } });

export const sessionNotes = (text) => ({ type: 'session.notes', payload: { notes: text } });

export const sessionFinished = ({ nowMs }) => ({ type: 'session.finished', payload: { finishedAt: pacificIso(nowMs) } });

// swap.set, or swap.cleared when the default exercise is chosen again.
export function swapChanged({ templateCode, slotNumber, exerciseId, defaultExerciseId }) {
  const entityId = `swap_${templateCode}_${slotNumber}`;
  return exerciseId === defaultExerciseId
    ? { type: 'swap.cleared', entityId, payload: { templateCode, slotNumber } }
    : { type: 'swap.set', entityId, payload: { templateCode, slotNumber, exerciseId } };
}

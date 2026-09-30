// The map from what the person does to the events that get written (plan section 15). It works over the event store
// (store/events.js) and the draft store (draft.js); the clock and the id generator are passed in, so there is no hidden time
// here and the whole thing runs in tests against the real store, replay and engine.

import { planSession } from '../engine/index.js';
import { exerciseForSlot } from '../engine/session.js';
import { WORKOUTS } from '../seed/index.js';
import { pacificDate } from '../time.js';
import {
  addExtraSet, clearRest, clearRow, setBackPainAfter, setNotes, setRestLength, setRowField, startEdit, startRest,
} from './draft.js';
import { adjustedRestLength } from './rest-timer.js';
import { canLog, inputsFor, pickValues } from './rows.js';
import { inProgressSessions, nextTemplate } from './rotation.js';
import * as make from './session-events.js';
import { swapOptions } from './session-view.js';

const isWorking = (set) => set.isRampUp !== true && set.completed !== false;

// events: the event store. drafts: createDraftStore(...). now(): ms since the epoch. newId(ms): a ULID.
export function createActions({ events, drafts, now, newId }) {
  if (typeof now !== 'function' || typeof newId !== 'function') throw new TypeError('createActions needs now() and newId()');

  const write = (made, entityId) => events.append(made.type, entityId ?? made.entityId, made.payload);
  const draftOf = (sessionId) => drafts.load(sessionId);
  const update = (sessionId, fn) => {
    const next = fn(drafts.load(sessionId));
    drafts.save(next);
    return next;
  };

  function openSession(sessionId) {
    const session = events.state.sessions[sessionId];
    if (!session) throw new RangeError('That workout does not exist.');
    if (session.finishedAt) throw new RangeError('That workout is finished.');
    return session;
  }

  return {
    draft: draftOf,

    // ---- typing (draft only, nothing is written to the log) ----
    setValue: (sessionId, exerciseId, setNumber, field, value) => update(sessionId, (d) => setRowField(d, exerciseId, setNumber, field, value)),
    beginEdit: (sessionId, exerciseId, setNumber) => update(sessionId, (d) => startEdit(d, exerciseId, setNumber)),
    cancelEdit: (sessionId, exerciseId, setNumber) => update(sessionId, (d) => clearRow(d, exerciseId, setNumber)),
    addSet: (sessionId, exerciseId) => update(sessionId, (d) => addExtraSet(d, exerciseId)),
    typeNotes: (sessionId, text) => update(sessionId, (d) => setNotes(d, text)),
    setBackPainAfter: (sessionId, value) => update(sessionId, (d) => setBackPainAfter(d, value)),
    skipRest: (sessionId) => update(sessionId, clearRest),
    adjustRest(sessionId, delta) {
      return update(sessionId, (d) => setRestLength(d, adjustedRestLength(d, events.state.settings, delta)));
    },

    // ---- events ----

    // Start the next workout by rotation. Resolves with the new session id.
    async startSession({ backPainBefore = null } = {}) {
      const state = events.state;
      if (inProgressSessions(state).length > 0) throw new Error('A workout is already in progress.');
      const nowMs = now();
      const templateCode = nextTemplate(state);
      const { calendar } = planSession(state, { today: pacificDate(nowMs), templateCode });
      const sessionId = `sess_${newId(nowMs)}`;
      await write(make.sessionStarted({ templateCode, nowMs, calendar, backPainBefore }), sessionId);
      return sessionId;
    },

    // Done on a row: log the set and start the rest timer. Logging a number that already exists changes nothing
    // (a double tap, or the same tap on two screens), and resolves with that set's id.
    async logSet(sessionId, { exerciseId, setNumber, values, suggestion }) {
      openSession(sessionId);
      const inputs = inputsFor(suggestion);
      const picked = pickValues(values, inputs);
      if (!canLog(picked, inputs)) throw new RangeError('Fill in every box before logging the set.');
      const existing = Object.values(events.state.sets).find(
        (s) => s.sessionId === sessionId && s.exerciseId === exerciseId && s.setNumber === setNumber,
      );
      if (existing) return existing.id;
      const nowMs = now();
      const setId = `set_${newId(nowMs)}`;
      await write(make.setLogged({ sessionId, exerciseId, setNumber, values: picked, suggestion }), setId);
      update(sessionId, (d) => startRest(clearRow(d, exerciseId, setNumber), nowMs));
      return setId;
    },

    // Save after Edit: only the fields that changed are written; nothing changed, nothing written.
    async saveSet(sessionId, { setId, values, suggestion }) {
      openSession(sessionId);
      const logged = events.state.sets[setId];
      if (!logged || logged.sessionId !== sessionId) throw new RangeError('That set does not exist.');
      const inputs = inputsFor(suggestion);
      const picked = pickValues(values, inputs);
      if (!canLog(picked, inputs)) throw new RangeError('Fill in every box before saving the set.');
      const made = make.setEdited({ logged, values: picked });
      if (made) await write(made, setId);
      update(sessionId, (d) => clearRow(d, logged.exerciseId, logged.setNumber));
      return made !== null;
    },

    // Undo a logged set. The tombstone is final, so logging again makes a new set.
    async undoSet(sessionId, setId) {
      openSession(sessionId);
      const logged = events.state.sets[setId];
      if (!logged || logged.sessionId !== sessionId) throw new RangeError('That set does not exist.');
      await write(make.setDeleted(), setId);
      update(sessionId, (d) => clearRow(d, logged.exerciseId, logged.setNumber));
    },

    // Swap the exercise in a slot for good (until changed back). Not allowed once a set of the current exercise is logged
    // in this session. Choosing the default clears the swap.
    async swap(sessionId, { slotNumber, exerciseId }) {
      const session = openSession(sessionId);
      const { templateCode } = session;
      const slot = WORKOUTS[templateCode]?.slots.find((s) => s.slot === slotNumber);
      if (!slot) throw new RangeError('No such slot.');
      if (!swapOptions(templateCode, slotNumber, null).some((o) => o.exerciseId === exerciseId)) {
        throw new RangeError('That exercise is not an option for this slot.');
      }
      const state = events.state;
      const current = exerciseForSlot(state, templateCode, slotNumber);
      if (current.exerciseId === exerciseId) return false;
      const started = Object.values(state.sets).some((s) => s.sessionId === sessionId && s.exerciseId === current.exerciseId && isWorking(s));
      if (started) throw new Error('Undo the sets logged for this exercise before swapping it.');
      const made = make.swapChanged({ templateCode, slotNumber, exerciseId, defaultExerciseId: slot.exercise });
      await write(made);
      return true;
    },

    // Save the notes text if it differs from what the log has.
    async saveNotes(sessionId, text) {
      const session = openSession(sessionId);
      const trimmed = text.trim();
      if (trimmed !== (session.notes ?? '')) await write(make.sessionNotes(trimmed), sessionId);
      update(sessionId, (d) => setNotes(d, null));
    },

    // Finish: notes if changed, then session.finished. A workout with no logged set can only be discarded.
    async finish(sessionId, { backPainAfter = null, notes } = {}) {
      const session = openSession(sessionId);
      const logged = Object.values(events.state.sets).some((s) => s.sessionId === sessionId && isWorking(s));
      if (!logged) throw new Error('Log at least one set to finish, or discard the workout.');
      if (typeof notes === 'string' && notes.trim() !== (session.notes ?? '')) await write(make.sessionNotes(notes.trim()), sessionId);
      await write(make.sessionFinished({ nowMs: now(), backPainAfter }), sessionId);
      drafts.clear(sessionId);
    },

    // Throw the workout away: replay drops the session and its sets.
    async discard(sessionId) {
      openSession(sessionId);
      await write(make.sessionDeleted(), sessionId);
      drafts.clear(sessionId);
    },
  };
}

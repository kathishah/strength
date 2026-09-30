// The map from what the person does to the events that get written (plan section 15). It works over the event store
// (store/events.js) and the draft store (draft.js); the clock and the id generator are passed in, so there is no hidden time
// here and the whole thing runs in tests against the real store, replay and engine.

import { planSession } from '../engine/index.js';
import { exerciseForSlot } from '../engine/session.js';
import { WORKOUTS } from '../seed/index.js';
import { pacificDate } from '../time.js';
import {
  addExtraSet, clearExercise, clearRest, setBackPainAfter, setNotes, setRestLength, setRowField, startEditing, startRest,
} from './draft.js';
import { PENDING } from './day-view.js';
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

  function editableSession(sessionId) {
    const session = events.state.sessions[sessionId];
    if (!session) throw new RangeError('That workout does not exist.');
    return session;
  }
  function openSession(sessionId) {
    const session = editableSession(sessionId);
    if (session.finishedAt) throw new RangeError('That workout is finished.');
    return session;
  }

  // Starts the next workout by rotation. Resolves with the new session id.
  async function startSession({ backPainBefore = null, sessionId = `sess_${newId(now())}` } = {}) {
    const state = events.state;
    if (inProgressSessions(state).length > 0) throw new Error('A workout is already in progress.');
    const nowMs = now();
    const templateCode = nextTemplate(state);
    const { calendar } = planSession(state, { today: pacificDate(nowMs), templateCode });
    await write(make.sessionStarted({ templateCode, nowMs, calendar, backPainBefore }), sessionId);
    return sessionId;
  }

  // The workout an exercise is logged into: the open one, or a new one when the cards on screen are still the preview (no session
  // yet). What was typed into the preview (its draft, under PENDING) moves to the new session.
  async function ensureSession(sessionId, backPainBefore) {
    if (sessionId && sessionId !== PENDING) {
      editableSession(sessionId); // a finished workout takes ticks too (spec 6.3, v1.15)
      return sessionId;
    }
    // The typed values move to the new session's draft first, so the screen redraws with them when session.started lands.
    const typed = drafts.load(PENDING);
    const id = `sess_${newId(now())}`;
    drafts.save({ ...typed, sessionId: id });
    try {
      await startSession({ backPainBefore, sessionId: id });
    } catch (err) {
      drafts.save(typed);
      throw err;
    }
    return id;
  }

  return {
    draft: (sessionId) => draftOf(sessionId ?? PENDING),
    startSession,

    // ---- typing (draft only, nothing is written to the log). sessionId is null (or PENDING) before the workout has started ----
    setValue: (sessionId, exerciseId, setNumber, field, value) => update(sessionId ?? PENDING, (d) => setRowField(d, exerciseId, setNumber, field, value)),
    // One weight (or level) for every set of the exercise, from the shared box of the card.
    setAll: (sessionId, exerciseId, setNumbers, field, value) => update(sessionId ?? PENDING, (d) => setNumbers.reduce((acc, n) => setRowField(acc, exerciseId, n, field, value), d)),
    beginEdit: (sessionId, exerciseId) => update(sessionId, (d) => startEditing(d, exerciseId)),
    cancelEdit: (sessionId, exerciseId) => update(sessionId, (d) => clearExercise(d, exerciseId)),
    addSet: (sessionId, exerciseId) => update(sessionId ?? PENDING, (d) => addExtraSet(d, exerciseId)),
    typeNotes: (sessionId, text) => update(sessionId, (d) => setNotes(d, text)),
    setBackPainAfter: (sessionId, value) => update(sessionId, (d) => setBackPainAfter(d, value)),
    skipRest: (sessionId) => update(sessionId, clearRest),
    adjustRest(sessionId, delta) {
      return update(sessionId, (d) => setRestLength(d, adjustedRestLength(d, events.state.settings, delta)));
    },

    // ---- events ----

    // Done on an exercise (of an open or a finished workout, spec 6.3): log every set that has its numbers, or, for an exercise reopened with Edit, save the changes. rows: the card's
    // rows as on screen ({ setNumber, setId, weightLbs, levelNumber, reps, distanceM }). A set with no reps (or distance) is left out,
    // so doing two sets of three is fine; nothing is written unless at least one set is complete. The first Done of the day starts the
    // workout (sessionId null), with the back pain rating chosen in the header. Resolves with the session id.
    async saveExercise(sessionId, { exerciseId, rows, suggestion, backPainBefore = null }) {
      const inputs = inputsFor(suggestion);
      const edits = [];
      const adds = [];
      for (const row of rows) {
        const values = pickValues(row, inputs);
        if (row.setId) {
          if (!canLog(values, inputs)) throw new RangeError('Fill in every box before saving, or undo the exercise.');
          edits.push({ setId: row.setId, values });
        } else if (canLog(values, inputs)) {
          adds.push({ setNumber: row.setNumber, values });
        }
      }
      if (edits.length === 0 && adds.length === 0) throw new RangeError('Enter the reps for at least one set.');

      const id = await ensureSession(sessionId, backPainBefore);
      const state = events.state;
      let logged = 0;
      for (const { setNumber, values } of adds) {
        const exists = Object.values(state.sets).some((x) => x.sessionId === id && x.exerciseId === exerciseId && x.setNumber === setNumber);
        if (exists) continue; // the same tap twice, or the same set from another device
        const nowMs = now();
        await write(make.setLogged({ sessionId: id, exerciseId, setNumber, values, suggestion }), `set_${newId(nowMs)}`);
        logged++;
      }
      for (const { setId, values } of edits) {
        const set = events.state.sets[setId];
        if (!set || set.sessionId !== id) throw new RangeError('That set does not exist.');
        const made = make.setEdited({ logged: set, values });
        if (made) await write(made, setId);
      }
      const finished = Boolean(events.state.sessions[id]?.finishedAt); // a correction made afterwards has no rest
      update(id, (d) => {
        const cleared = clearExercise(d, exerciseId);
        return logged > 0 && !finished ? startRest(cleared, now()) : cleared;
      });
      return id;
    },

    // Undo an exercise: every set logged for it is deleted (the tombstones are final, so logging again makes new sets). Works on a
    // finished workout too.
    async undoExercise(sessionId, exerciseId) {
      editableSession(sessionId);
      const sets = Object.values(events.state.sets).filter((x) => x.sessionId === sessionId && x.exerciseId === exerciseId);
      for (const set of sets) await write(make.setDeleted(), set.id);
      update(sessionId, (d) => clearExercise(d, exerciseId));
    },

    // Swap the exercise in a slot for good (until changed back). Not allowed once a set of the current exercise is logged
    // in this session. Choosing the default clears the swap. With no workout started yet, `templateCode` names the workout on screen.
    async swap(sessionId, { slotNumber, exerciseId, templateCode: shown = null }) {
      const session = sessionId ? openSession(sessionId) : null;
      const templateCode = session ? session.templateCode : shown;
      const slot = WORKOUTS[templateCode]?.slots.find((s) => s.slot === slotNumber);
      if (!slot) throw new RangeError('No such slot.');
      if (!swapOptions(templateCode, slotNumber, null).some((o) => o.exerciseId === exerciseId)) {
        throw new RangeError('That exercise is not an option for this slot.');
      }
      const state = events.state;
      const current = exerciseForSlot(state, templateCode, slotNumber);
      if (current.exerciseId === exerciseId) return false;
      const started = sessionId && Object.values(state.sets).some((s) => s.sessionId === sessionId && s.exerciseId === current.exerciseId && isWorking(s));
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

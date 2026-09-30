// The UI-to-event mapping (plan sections 15 and 15b) run against the real event store, replay and engine, and, for the offline test,
// the real Lambda handler over a fake S3. Nothing here touches a DOM.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createActions, createDraftStore, dayView, emptyDraft, nextTemplate, PENDING, restStatus, sessionView } from '../app/js/logging/index.js';
import { planSession } from '../app/js/engine/index.js';
import { ulid } from '../app/js/ids.js';
import { createMemoryStorage } from '../app/js/store/memory.js';
import { validateBatch } from '../lambda/events/registry.mjs';
import { doWorkout, makeWorld } from '../test-support/logging-world.mjs';
import { createDevice, createServer, eventIds, settle } from '../test-support/harness.mjs';

const card = (view, id) => view.cards.find((c) => c.exerciseId === id);
const types = (w) => w.events.events().map((e) => e.type);
const sets = (w) => Object.values(w.state.sets);
const setsOf = (w, sessionId, exerciseId) => sets(w).filter((s) => s.sessionId === sessionId && s.exerciseId === exerciseId).sort((a, b) => a.setNumber - b.setNumber);

// Done on one exercise, the way the screen calls it.
const done = (w, id, exerciseId, extra = {}) => {
  const c = card(w.view(id), exerciseId);
  return w.actions.saveExercise(id, { exerciseId, rows: c.rows, suggestion: c.suggestion, ...extra });
};

describe('starting', () => {
  test('writes session.started for the next workout with week, phase and back pain', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession({ backPainBefore: 2 });
    assert.match(id, /^sess_[0-9A-Z]{26}$/);
    assert.deepEqual(w.state.sessions[id], {
      id, templateCode: 'A', startedAt: '2026-09-28T11:00:00.000-07:00', programWeek: 1, phase: 1, isDeload: false, backPainBefore: 2,
    });
    assert.equal(w.events.pendingCount(), 1);
    w.assertValid();
  });

  test('skipping back pain leaves it out', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    assert.equal(Object.hasOwn(w.state.sessions[id], 'backPainBefore'), false);
  });

  test('a second workout cannot start while one is open; after finishing, rotation moves on', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await assert.rejects(w.actions.startSession(), /already in progress/);
    await doWorkout(w, { sessionId: id });
    assert.equal(nextTemplate(w.state), 'B');
    w.advance(2 * 86400);
    const b = await w.actions.startSession();
    assert.equal(w.state.sessions[b].templateCode, 'B');
    assert.equal(w.state.sessions[b].programWeek, 1);
  });

  test('week and phase follow the program calendar', async () => {
    const w = await makeWorld({ start: '2026-11-02T11:00:00-08:00' });
    const id = await w.actions.startSession();
    assert.equal(w.state.sessions[id].programWeek, 6);
    assert.equal(w.state.sessions[id].phase, 2);
  });
});

describe('Done on an exercise', () => {
  test('logs every set with the pre-filled weight and recommended reps, records what was suggested, starts the rest', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    w.advance(120);
    await done(w, id, 'goblet-squat');
    const logged = setsOf(w, id, 'goblet-squat');
    assert.equal(logged.length, 3);
    assert.deepEqual(logged.map((s) => [s.setNumber, s.weightLbs, s.reps, s.suggestedWeightLbs, s.suggestionSource, s.completed]), [
      [1, 20, 8, 20, 'starting', true], [2, 20, 8, 20, 'starting', true], [3, 20, 8, 20, 'starting', true],
    ]);
    assert.ok(logged.every((s) => !Object.hasOwn(s, 'rir')));
    assert.equal(restStatus(w.actions.draft(id), w.clock.ms).remainingSec, 90);
    w.advance(30);
    assert.equal(restStatus(w.actions.draft(id), w.clock.ms).remainingSec, 60);
    w.assertValid();
  });

  test('a changed weight and reps are what is logged, and the card turns to done with a summary', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    const c = card(w.view(id), 'goblet-squat');
    w.actions.setAll(id, 'goblet-squat', [1, 2, 3], 'weightLbs', 25);
    w.actions.setValue(id, 'goblet-squat', 3, 'weightLbs', 27.5);
    w.actions.setAll(id, 'goblet-squat', [1, 2, 3], 'reps', 10);
    assert.deepEqual(card(w.view(id), 'goblet-squat').rows.map((r) => [r.weightLbs, r.reps]), [[25, 10], [25, 10], [27.5, 10]]);
    await w.actions.saveExercise(id, { exerciseId: 'goblet-squat', rows: card(w.view(id), 'goblet-squat').rows, suggestion: c.suggestion });
    const after = card(w.view(id), 'goblet-squat');
    assert.deepEqual([after.mode, after.done, after.summaryText, after.setsDiffer], ['done', true, '25 lbs × 10, 10 · 27.5 lbs × 10', true]);
    assert.deepEqual(setsOf(w, id, 'goblet-squat').map((s) => s.weightLbs), [25, 25, 27.5]);
    assert.equal(w.actions.draft(id).rows['goblet-squat'], undefined, 'the typed values became events');
  });

  test('the first Done of the day starts the workout, with the back pain chosen, and the typed values move over', async () => {
    const w = await makeWorld();
    w.actions.setAll(null, 'goblet-squat', [1, 2, 3], 'weightLbs', 25);
    w.actions.setAll(null, 'db-bench-press', [1, 2, 3], 'weightLbs', 22.5);
    assert.deepEqual(w.state.sessions, {});
    const preview = dayView(w.state, { today: '2026-09-28', nowMs: w.clock.ms, draftFor: (sid) => w.actions.draft(sid) });
    assert.deepEqual([preview.started, preview.cards[1].rows[0].weightLbs], [false, 22.5]);

    const c = preview.cards[0];
    const id = await w.actions.saveExercise(null, { exerciseId: 'goblet-squat', rows: c.rows, suggestion: c.suggestion, backPainBefore: 3 });
    assert.match(id, /^sess_/);
    assert.equal(w.state.sessions[id].backPainBefore, 3);
    assert.equal(w.state.sessions[id].templateCode, 'A');
    assert.deepEqual(setsOf(w, id, 'goblet-squat').map((s) => s.weightLbs), [25, 25, 25]);
    assert.equal(card(w.view(id), 'db-bench-press').rows[0].weightLbs, 22.5, 'the other exercise keeps what was typed');
    assert.equal(w.events.events().filter((e) => e.type === 'session.started').length, 1);
    w.assertValid();
  });

  test('when session.started lands, the typed values are already the new session\'s (no redraw with empty boxes)', async () => {
    const w = await makeWorld();
    w.actions.setAll(null, 'goblet-squat', [1, 2, 3], 'weightLbs', 25);
    let seen = null;
    const off = w.events.subscribe(({ event }) => {
      if (event?.type === 'session.started') seen = w.actions.draft(event.entityId).rows['goblet-squat']?.[1]?.weightLbs;
    });
    const preview = dayView(w.state, { today: '2026-09-28', nowMs: w.clock.ms, draftFor: (sid) => w.actions.draft(sid) });
    const c = preview.cards[0];
    await w.actions.saveExercise(null, { exerciseId: 'goblet-squat', rows: c.rows, suggestion: c.suggestion });
    off();
    assert.equal(seen, 25);
  });

  test('if the workout cannot start, what was typed stays on the preview', async () => {
    const w = await makeWorld();
    await w.actions.startSession();            // a workout is open, so a second start is refused
    w.actions.setAll(null, 'goblet-squat', [1, 2, 3], 'weightLbs', 25);
    const c = card(w.view(Object.keys(w.state.sessions)[0]), 'goblet-squat');
    await assert.rejects(w.actions.saveExercise(PENDING, { exerciseId: 'goblet-squat', rows: c.rows, suggestion: c.suggestion }), /already in progress/);
    assert.equal(w.actions.draft(null).rows['goblet-squat'][1].weightLbs, 25);
  });

  test('the second exercise goes into the same workout', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await done(w, id, 'goblet-squat');
    await done(w, id, 'db-bench-press');
    assert.equal(Object.keys(w.state.sessions).length, 1);
    assert.equal(w.view(id).exercisesDone, 2);
  });

  test('a set whose box was cleared is left out; the others are logged', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    w.actions.setValue(id, 'goblet-squat', 2, 'reps', null);
    assert.deepEqual(card(w.view(id), 'goblet-squat').rows.map((r) => r.canLog), [true, false, true]);
    await done(w, id, 'goblet-squat');
    assert.deepEqual(setsOf(w, id, 'goblet-squat').map((s) => s.setNumber), [1, 3]);
  });

  test('nothing to log writes nothing and says so', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    for (const n of [1, 2, 3]) w.actions.setValue(id, 'goblet-squat', n, 'reps', null);
    const before = w.events.eventCount();
    await assert.rejects(done(w, id, 'goblet-squat'), /Enter the reps for at least one set/);
    assert.equal(w.events.eventCount(), before);
  });

  test('a double tap logs each set once', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    const c = card(w.view(id), 'goblet-squat');
    await w.actions.saveExercise(id, { exerciseId: 'goblet-squat', rows: c.rows, suggestion: c.suggestion });
    await w.actions.saveExercise(id, { exerciseId: 'goblet-squat', rows: c.rows, suggestion: c.suggestion }); // the same rows again
    assert.equal(setsOf(w, id, 'goblet-squat').length, 3);
    assert.equal(w.events.events().filter((e) => e.type === 'set.logged').length, 3);
  });

  test('values the exercise does not show are not written', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    const bug = card(w.view(id), 'dead-bug');
    await w.actions.saveExercise(id, { exerciseId: 'dead-bug', rows: bug.rows.map((r) => ({ ...r, weightLbs: 20, levelNumber: 3, distanceM: 40 })), suggestion: bug.suggestion });
    const first = setsOf(w, id, 'dead-bug')[0];
    assert.deepEqual([first.reps, first.weightLbs, first.levelNumber, first.distanceM], [8, undefined, undefined, undefined]);
  });

  test('a hold logs completion only, one set per planned set', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await w.actions.swap(id, { slotNumber: 5, exerciseId: 'trx-plank' });
    await done(w, id, 'trx-plank');
    const plank = setsOf(w, id, 'trx-plank');
    assert.equal(plank.length, 2);
    assert.ok(plank.every((s) => s.completed === true && s.reps === undefined && s.weightLbs === undefined));
    w.assertValid();
  });

  test('a carry logs its weight and the 40 m distance, per set', async () => {
    const w = await makeWorld({ start: '2026-11-02T11:00:00-08:00' });
    await doWorkout(w);
    w.set('2026-11-04T11:00:00-08:00');
    await doWorkout(w);
    w.set('2026-11-06T11:00:00-08:00');
    const id = await w.actions.startSession();
    assert.equal(w.state.sessions[id].templateCode, 'C');
    w.actions.setValue(id, 'farmer-carry', 3, 'distanceM', 30);
    await done(w, id, 'farmer-carry');
    assert.deepEqual(setsOf(w, id, 'farmer-carry').map((s) => [s.weightLbs, s.distanceM, s.reps]), [[35, 40, undefined], [35, 40, undefined], [35, 30, undefined]]);
    w.assertValid();
  });

  test('an unknown workout takes no sets (a finished one does, spec 6.3 v1.15: see logging-edit-finished.test.mjs)', async () => {
    const w = await makeWorld();
    const id = await doWorkout(w);
    const c = card(w.view(id), 'goblet-squat');
    await assert.rejects(w.actions.saveExercise('sess_nope', { exerciseId: 'goblet-squat', rows: c.rows, suggestion: c.suggestion }), /does not exist/);
  });
});

describe('editing and undoing an exercise', () => {
  async function loggedSquat() {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await done(w, id, 'goblet-squat');
    return { w, id };
  }

  test('Edit reopens it; Save writes set.edited for only what changed', async () => {
    const { w, id } = await loggedSquat();
    const before = w.events.eventCount();
    w.actions.beginEdit(id, 'goblet-squat');
    const open = card(w.view(id), 'goblet-squat');
    assert.deepEqual([open.mode, open.rows.map((r) => r.status)], ['editing', ['editing', 'editing', 'editing']]);
    w.actions.setValue(id, 'goblet-squat', 3, 'weightLbs', 22.5);
    const c = card(w.view(id), 'goblet-squat');
    assert.deepEqual(c.rows.map((r) => r.dirty), [false, false, true]);
    await w.actions.saveExercise(id, { exerciseId: 'goblet-squat', rows: c.rows, suggestion: c.suggestion });
    const edits = w.events.events().slice(before);
    assert.deepEqual(edits.map((e) => [e.type, e.payload]), [['set.edited', { weightLbs: 22.5 }]]);
    assert.deepEqual(setsOf(w, id, 'goblet-squat').map((s) => s.weightLbs), [20, 20, 22.5]);
    assert.equal(card(w.view(id), 'goblet-squat').mode, 'done');
    w.assertValid();
  });

  test('Save with nothing changed writes nothing; Cancel drops the typing', async () => {
    const { w, id } = await loggedSquat();
    const before = w.events.eventCount();
    w.actions.beginEdit(id, 'goblet-squat');
    await done(w, id, 'goblet-squat');
    assert.equal(w.events.eventCount(), before);
    assert.equal(card(w.view(id), 'goblet-squat').mode, 'done');
    w.actions.beginEdit(id, 'goblet-squat');
    w.actions.setValue(id, 'goblet-squat', 1, 'reps', 99);
    w.actions.cancelEdit(id, 'goblet-squat');
    const after = card(w.view(id), 'goblet-squat');
    assert.deepEqual([after.mode, after.rows[0].reps], ['done', 8]);
  });

  test('a set that was left out can be added when the exercise is reopened', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    w.actions.setValue(id, 'goblet-squat', 3, 'reps', null);
    await done(w, id, 'goblet-squat');
    assert.equal(setsOf(w, id, 'goblet-squat').length, 2);
    w.actions.beginEdit(id, 'goblet-squat');
    w.actions.setValue(id, 'goblet-squat', 3, 'reps', 7);
    await done(w, id, 'goblet-squat');
    assert.deepEqual(setsOf(w, id, 'goblet-squat').map((s) => [s.setNumber, s.reps]), [[1, 8], [2, 8], [3, 7]]);
  });

  test('Undo deletes every set of the exercise; it can be logged again as new sets, and the log keeps the tombstones', async () => {
    const { w, id } = await loggedSquat();
    await w.actions.undoExercise(id, 'goblet-squat');
    assert.deepEqual(setsOf(w, id, 'goblet-squat'), []);
    assert.equal(card(w.view(id), 'goblet-squat').mode, 'input');
    assert.equal(w.events.events().filter((e) => e.type === 'entity.deleted').length, 3);
    await done(w, id, 'goblet-squat');
    assert.equal(setsOf(w, id, 'goblet-squat').length, 3);
    w.assertValid();
  });

  test('an undone workout cannot be finished', async () => {
    const { w, id } = await loggedSquat();
    await w.actions.undoExercise(id, 'goblet-squat');
    await assert.rejects(w.actions.finish(id, {}), /Log at least one set/);
  });
});

describe('swapping', () => {
  test('swap.set persists for the workout: the next session of it starts with the swap', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    assert.equal(await w.actions.swap(id, { slotNumber: 3, exerciseId: 'hip-thrust' }), true);
    const ev = w.events.events().at(-1);
    assert.deepEqual([ev.type, ev.entityId, ev.payload], ['swap.set', 'swap_A_3', { templateCode: 'A', slotNumber: 3, exerciseId: 'hip-thrust' }]);
    assert.equal(card(w.view(id), 'hip-thrust').swapped, true);
    assert.equal(card(w.view(id), 'db-romanian-deadlift'), undefined);
    await doWorkout(w, { sessionId: id });
    w.advance(6 * 86400);
    assert.equal(nextTemplate(w.state), 'B');
    w.assertValid();
  });

  test('before the workout has started, the template on screen is named', async () => {
    const w = await makeWorld();
    assert.equal(await w.actions.swap(null, { slotNumber: 1, exerciseId: 'leg-press', templateCode: 'A' }), true);
    assert.deepEqual(w.state.swaps, { 'A:1': 'leg-press' });
    await assert.rejects(w.actions.swap(null, { slotNumber: 1, exerciseId: 'box-squat' }), /No such slot/);
  });

  test('choosing the default again (Revert) clears the swap', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await w.actions.swap(id, { slotNumber: 3, exerciseId: 'hip-thrust' });
    assert.equal(await w.actions.swap(id, { slotNumber: 3, exerciseId: 'db-romanian-deadlift' }), true);
    assert.equal(w.events.events().at(-1).type, 'swap.cleared');
    assert.deepEqual(w.state.swaps, {});
    assert.ok(card(w.view(id), 'db-romanian-deadlift'));
    w.assertValid();
  });

  test('choosing what is already there writes nothing', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    const before = w.events.eventCount();
    assert.equal(await w.actions.swap(id, { slotNumber: 3, exerciseId: 'db-romanian-deadlift' }), false);
    assert.equal(w.events.eventCount(), before);
  });

  test('not an option for the slot, or after the exercise was logged: refused', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await assert.rejects(w.actions.swap(id, { slotNumber: 3, exerciseId: 'goblet-squat' }), /not an option/);
    await assert.rejects(w.actions.swap(id, { slotNumber: 9, exerciseId: 'hip-thrust' }), /No such slot/);
    await done(w, id, 'db-romanian-deadlift');
    await assert.rejects(w.actions.swap(id, { slotNumber: 3, exerciseId: 'hip-thrust' }), /Undo the sets/);
    await w.actions.swap(id, { slotNumber: 1, exerciseId: 'trx-squat' }); // other slots are free
    assert.equal(card(w.view(id), 'trx-squat').rows[0].levelNumber, 2);
  });
});

describe('finishing', () => {
  test('notes then session.finished, back pain after, and the draft is gone', async () => {
    const w = await makeWorld();
    const id = await doWorkout(w, { finish: false });
    w.actions.typeNotes(id, '  Back felt good.  ');
    w.actions.setBackPainAfter(id, 1);
    assert.equal(w.view(id).notes, '  Back felt good.  ');
    w.advance(30);
    await w.actions.finish(id, { backPainAfter: 1, notes: '  Back felt good.  ' });
    const [notes, finished] = w.events.events().slice(-2);
    assert.deepEqual([notes.type, notes.payload], ['session.notes', { notes: 'Back felt good.' }]);
    assert.deepEqual([finished.type, finished.payload.backPainAfter], ['session.finished', 1]);
    assert.equal(w.state.sessions[id].finishedAt, finished.payload.finishedAt);
    assert.equal(Date.parse(finished.payload.finishedAt), w.clock.ms, 'finishedAt is the moment Finish was tapped');
    assert.deepEqual(w.actions.draft(id).rows, {});
    assert.equal(w.actions.draft(id).notes, null);
    w.assertValid();
  });

  test('no notes event when the notes did not change', async () => {
    const w = await makeWorld();
    const id = await doWorkout(w, { finish: false });
    await w.actions.saveNotes(id, 'same');
    const count = types(w).filter((t) => t === 'session.notes').length;
    await w.actions.saveNotes(id, ' same ');
    await w.actions.finish(id, { notes: 'same' });
    assert.equal(types(w).filter((t) => t === 'session.notes').length, count);
  });

  test('cannot finish with no sets, or twice', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await assert.rejects(w.actions.finish(id, {}), /Log at least one set/);
    await doWorkout(w, { sessionId: id });
    await assert.rejects(w.actions.finish(id, {}), /finished/);
    assert.ok(w.state.sessions[id].finishedAt);
  });

  test('discard drops the session and its sets, and the next workout is A again', async () => {
    const w = await makeWorld();
    const id = await doWorkout(w, { finish: false });
    assert.ok(sets(w).length > 0);
    await w.actions.discard(id);
    assert.deepEqual(w.state.sessions, {});
    assert.deepEqual(sets(w), []);
    assert.equal(nextTemplate(w.state), 'A');
    assert.equal(w.events.events().at(-1).payload.entityType, 'session');
    w.assertValid();
  });

  test('a back pain rating chosen and then cleared is not saved; 0 out of 10 is a rating', async () => {
    const w = await makeWorld();
    const id = await doWorkout(w, { finish: false });
    w.actions.setBackPainAfter(id, 4);
    w.actions.setBackPainAfter(id, null);
    assert.equal(w.view(id).backPainAfter, null);
    await w.actions.finish(id, { backPainAfter: w.actions.draft(id).backPainAfter ?? null });
    assert.equal(Object.hasOwn(w.state.sessions[id], 'backPainAfter'), false);

    const id2 = await doWorkout(w, { finish: false });
    w.actions.setBackPainAfter(id2, 0);
    await w.actions.finish(id2, { backPainAfter: w.actions.draft(id2).backPainAfter ?? null });
    assert.equal(w.state.sessions[id2].backPainAfter, 0);
    w.assertValid();
  });
});

describe('draft safety', () => {
  const shimOf = (backend) => ({ getItem: (k) => backend.get(k) ?? null, setItem: (k, v) => void backend.set(k, v), removeItem: (k) => void backend.delete(k) });

  test('a reload mid-workout: exercises from the log, typed values, notes and the rest timer from the draft', async () => {
    const storage = createMemoryStorage({ persistent: true });
    const shim = shimOf(new Map());
    const a = await makeWorld({ storage, backend: shim });
    const id = await a.actions.startSession();
    await done(a, id, 'goblet-squat');
    a.actions.setAll(id, 'db-bench-press', [1, 2, 3], 'weightLbs', 22.5);
    a.actions.typeNotes(id, 'half typed');
    const before = a.view(id);

    const b = await makeWorld({ storage, backend: shim, start: '2026-09-28T11:01:00-07:00' });
    const after = b.view(id);
    const shape = (v) => v.cards.map((c) => [c.mode, c.rows.map((r) => [r.weightLbs, r.reps])]);
    assert.deepEqual(shape(after), shape(before));
    assert.equal(after.notes, 'half typed');
    assert.equal(after.rest.over, false);
    assert.equal(after.exercisesDone, 1);
  });

  test('values typed on the preview (no workout yet) survive a reload too', async () => {
    const storage = createMemoryStorage({ persistent: true });
    const shim = shimOf(new Map());
    const a = await makeWorld({ storage, backend: shim });
    a.actions.setAll(null, 'goblet-squat', [1, 2, 3], 'weightLbs', 25);
    const b = await makeWorld({ storage, backend: shim });
    assert.equal(b.actions.draft(null).rows['goblet-squat'][1].weightLbs, 25);
    assert.equal(b.actions.draft(null).sessionId, PENDING);
  });

  test('if the draft is lost (cleared storage) the logged sets are all still there', async () => {
    const storage = createMemoryStorage({ persistent: true });
    const a = await makeWorld({ storage });
    const id = await doWorkout(a, { finish: false });
    a.actions.setValue(id, 'goblet-squat', 1, 'weightLbs', 99);
    const b = await makeWorld({ storage, start: '2026-09-28T12:00:00-07:00' });
    assert.equal(b.view(id).loggedSets, a.view(id).loggedSets);
    assert.ok(b.view(id).canFinish);
  });
});

describe('progression through the screens', () => {
  const homeCard = (w, today, id) => dayView(w.state, { today, nowMs: w.clock.ms, draftFor: (sid) => emptyDraft(sid) }).cards.find((c) => c.exerciseId === id);

  test('three weeks on, the next Workout A shows the scheduled increase; logging it clears the highlight', async () => {
    const w = await makeWorld();
    await doWorkout(w, { plan: { 'goblet-squat': { weightLbs: 25, reps: 12 } } });
    w.set('2026-09-30T11:00:00-07:00');
    await doWorkout(w);
    w.set('2026-10-02T11:00:00-07:00');
    await doWorkout(w);
    w.set('2026-10-19T11:00:00-07:00');
    const id = await w.actions.startSession();
    const squat = card(w.view(id), 'goblet-squat');
    assert.equal(w.state.sessions[id].templateCode, 'A');
    assert.equal(squat.increaseText, '↑ +5 lbs from 25 · Scheduled');
    assert.deepEqual(squat.rows.map((r) => r.weightLbs), [30, 30, 30]);
    assert.equal(squat.lastText, 'Last (Mon, Sep 28): 25 × 12, 12, 12');
    await doWorkout(w, { sessionId: id, plan: { 'goblet-squat': { reps: 10 } } });
    w.assertValid();
    assert.ok(sets(w).some((s) => s.weightLbs === 30 && s.suggestedWeightLbs === 30 && s.suggestionSource === 'scheduled'));
    w.set('2026-10-21T11:00:00-07:00');
    await doWorkout(w);
    w.set('2026-10-23T11:00:00-07:00');
    await doWorkout(w);
    w.set('2026-10-26T11:00:00-07:00');
    const next = homeCard(w, '2026-10-26', 'goblet-squat');
    assert.equal(next.increaseText, null);
    assert.equal(next.suggestionText, 'Suggested: 30 lbs');
  });

  test('logging the old weight when an increase was suggested keeps suggesting it', async () => {
    const w = await makeWorld();
    await doWorkout(w, { plan: { 'goblet-squat': { weightLbs: 25, reps: 12 } } });
    w.set('2026-09-30T11:00:00-07:00'); await doWorkout(w);
    w.set('2026-10-02T11:00:00-07:00'); await doWorkout(w);
    w.set('2026-10-19T11:00:00-07:00');
    const id = await doWorkout(w, { plan: { 'goblet-squat': { weightLbs: 25 } } });
    const first = setsOf(w, id, 'goblet-squat')[0];
    assert.deepEqual([first.weightLbs, first.suggestedWeightLbs], [25, 30]);
    w.set('2026-10-21T11:00:00-07:00'); await doWorkout(w);
    w.set('2026-10-23T11:00:00-07:00'); await doWorkout(w);
    w.set('2026-10-26T11:00:00-07:00');
    assert.equal(homeCard(w, '2026-10-26', 'goblet-squat').increaseText, '↑ +5 lbs from 25 · Scheduled');
  });
});

describe('what is pre-filled with no history (v1.14)', () => {
  test('leg press starts at the first-loaded 50 lbs, hip thrust at 45, reverse lunge at 10; back extension stays at 0', async () => {
    const w = await makeWorld();
    const weight = (t, id) => planSession(w.state, { today: '2026-09-28', templateCode: t }).exercises.find((e) => e.exerciseId === id).weightLbs;
    assert.deepEqual([weight('B', 'leg-press'), weight('B', 'hip-thrust'), weight('C', 'reverse-lunge'), weight('B', 'back-extension-45')], [50, 45, 10, 0]);
  });

  test('what was logged last time wins, including a logged 0', async () => {
    const w = await makeWorld();
    await doWorkout(w, { plan: { 'goblet-squat': { weightLbs: 20 } } });
    w.set('2026-09-30T11:00:00-07:00');
    await doWorkout(w, { plan: { 'leg-press': { weightLbs: 60 }, 'hip-thrust': { weightLbs: 0 } } });
    w.set('2026-10-02T11:00:00-07:00');
    await doWorkout(w);
    w.set('2026-10-05T11:00:00-07:00');
    await doWorkout(w);
    w.set('2026-10-07T11:00:00-07:00');
    const id = await w.actions.startSession();
    assert.equal(w.state.sessions[id].templateCode, 'B');
    assert.equal(card(w.view(id), 'leg-press').rows[0].weightLbs, 60);
    assert.equal(card(w.view(id), 'hip-thrust').rows[0].weightLbs, 0);
  });

  test('RIR is not asked: a logged set never carries one', async () => {
    const w = await makeWorld();
    await doWorkout(w);
    assert.ok(sets(w).length > 0);
    assert.ok(sets(w).every((set) => !Object.hasOwn(set, 'rir')));
  });
});

describe('the Phase D done-when: a full Workout A is logged offline and syncs later', () => {
  test('offline all the way, then online: the server has it and another device sees the same workout', async () => {
    const server = createServer();
    const phone = await createDevice(server, 'phone', { wall: Date.parse('2026-09-28T18:00:00Z') });
    const desktop = await createDevice(server, 'desk', { wall: Date.parse('2026-09-28T18:00:00Z') });
    phone.api.down = true;

    const store = new Map();
    const drafts = createDraftStore({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) });
    const actions = createActions({ events: phone.events, drafts, now: () => phone.wall.now, newId: (ms) => ulid(ms) });
    const world = { actions, clock: { get ms() { return phone.wall.now; } }, view: (sid) => sessionView(phone.events.state, sid, actions.draft(sid), phone.wall.now), advance: (s) => { phone.wall.now += s * 1000; } };

    const id = await doWorkout(world, { plan: { 'goblet-squat': { weightLbs: 25, reps: [12, 11, 10] } } });
    await phone.sync.sync().catch(() => {}); // still offline: nothing is lost
    assert.equal(phone.events.pendingCount(), 1 + 16 + 1, 'session.started, sixteen sets, session.finished');
    assert.equal(desktop.events.eventCount(), 0);

    const batch = { deviceId: phone.deviceId, events: phone.events.pending() };
    assert.deepEqual(validateBatch(batch, phone.wall.now).errors, [], 'the server accepts every event');

    phone.api.down = false;
    await settle(phone, desktop);
    assert.equal(phone.events.pendingCount(), 0);
    assert.deepEqual(eventIds(desktop), eventIds(phone));
    assert.deepEqual(desktop.events.state, phone.events.state);
    const onDesktop = desktop.events.state;
    assert.equal(onDesktop.sessions[id].templateCode, 'A');
    assert.ok(onDesktop.sessions[id].finishedAt);
    assert.deepEqual(Object.values(onDesktop.sets).filter((s) => s.exerciseId === 'goblet-squat').map((s) => [s.weightLbs, s.reps]).sort(), [[25, 10], [25, 11], [25, 12]]);
    assert.equal(nextTemplate(onDesktop), 'B');
  });
});

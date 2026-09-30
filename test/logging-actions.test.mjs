// The UI-to-event mapping (plan section 15) run against the real event store, replay and engine, and, for the offline test,
// the real Lambda handler over a fake S3. Nothing here touches a DOM.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createActions, createDraftStore, homeView, nextTemplate, restStatus, sessionView } from '../app/js/logging/index.js';
import { ulid } from '../app/js/ids.js';
import { createMemoryStorage } from '../app/js/store/memory.js';
import { validateBatch } from '../lambda/events/registry.mjs';
import { doWorkout, makeWorld } from '../test-support/logging-world.mjs';
import { createDevice, createServer, eventIds, settle } from '../test-support/harness.mjs';

const cards = (view) => view.groups.flatMap((g) => g.cards);
const card = (view, id) => cards(view).find((c) => c.exerciseId === id);
const types = (w) => w.events.events().map((e) => e.type);
const sets = (w) => Object.values(w.state.sets);

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

describe('logging sets', () => {
  test('Done writes set.logged with the values, the suggestion it was made under, and starts the rest', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    const c = card(w.view(id), 'goblet-squat');
    w.advance(120);
    const setId = await w.actions.logSet(id, { exerciseId: 'goblet-squat', setNumber: 1, values: { weightLbs: 25, reps: 11, rir: 2 }, suggestion: c.suggestion });
    assert.match(setId, /^set_/);
    assert.deepEqual(w.state.sets[setId], {
      id: setId, sessionId: id, exerciseId: 'goblet-squat', setNumber: 1, isRampUp: false, isCalibration: false, completed: true,
      suggestedWeightLbs: 20, suggestionSource: 'starting', weightLbs: 25, reps: 11, rir: 2,
    });
    const rest = restStatus(w.actions.draft(id), w.clock.ms);
    assert.equal(rest.remainingSec, 90);
    w.advance(30);
    assert.equal(restStatus(w.actions.draft(id), w.clock.ms).remainingSec, 60);
    w.assertValid();
  });

  test('the row on screen becomes done and the next rows carry the weight', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    w.actions.setValue(id, 'goblet-squat', 1, 'weightLbs', 25);
    assert.deepEqual(card(w.view(id), 'goblet-squat').rows.map((r) => r.weightLbs), [25, 25]);
    await w.actions.logSet(id, { exerciseId: 'goblet-squat', setNumber: 1, values: { weightLbs: 25, reps: 10 }, suggestion: card(w.view(id), 'goblet-squat').suggestion });
    const rows = card(w.view(id), 'goblet-squat').rows;
    assert.deepEqual(rows.map((r) => [r.status, r.weightLbs, r.weightChanged]), [['done', 25, true], ['todo', 25, true]]);
    assert.equal(w.actions.draft(id).rows['goblet-squat'], undefined, 'the typed values became the event');
  });

  test('a set with a missing box is refused and writes nothing', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    const s = card(w.view(id), 'goblet-squat').suggestion;
    const before = w.events.eventCount();
    await assert.rejects(w.actions.logSet(id, { exerciseId: 'goblet-squat', setNumber: 1, values: { weightLbs: 25, reps: null }, suggestion: s }), /Fill in every box/);
    await assert.rejects(w.actions.logSet(id, { exerciseId: 'goblet-squat', setNumber: 1, values: { weightLbs: null, reps: 10 }, suggestion: s }), /Fill in/);
    assert.equal(w.events.eventCount(), before);
  });

  test('a double tap logs one set', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    const s = card(w.view(id), 'goblet-squat').suggestion;
    const args = { exerciseId: 'goblet-squat', setNumber: 1, values: { weightLbs: 20, reps: 10 }, suggestion: s };
    const first = await w.actions.logSet(id, args);
    const second = await w.actions.logSet(id, args); // the same tap again once the first has landed
    assert.equal(second, first);
    assert.equal(sets(w).length, 1);
    assert.equal(w.events.events().filter((e) => e.type === 'set.logged').length, 1);
  });

  test('values the exercise does not show are not written (dead bug has no weight, carry has no reps)', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    const bug = card(w.view(id), 'dead-bug').suggestion;
    const setId = await w.actions.logSet(id, { exerciseId: 'dead-bug', setNumber: 1, values: { weightLbs: 20, reps: 8, levelNumber: 3, distanceM: 40 }, suggestion: bug });
    assert.deepEqual([w.state.sets[setId].reps, w.state.sets[setId].weightLbs, w.state.sets[setId].levelNumber, w.state.sets[setId].distanceM], [8, undefined, undefined, undefined]);
  });

  test('only an open session takes sets', async () => {
    const w = await makeWorld();
    const id = await doWorkout(w);
    const s = { ...card(w.view(id), 'goblet-squat').suggestion };
    await assert.rejects(w.actions.logSet(id, { exerciseId: 'goblet-squat', setNumber: 9, values: { weightLbs: 20, reps: 10 }, suggestion: s }), /finished/);
    await assert.rejects(w.actions.logSet('sess_nope', { exerciseId: 'goblet-squat', setNumber: 1, values: { weightLbs: 20, reps: 10 }, suggestion: s }), /does not exist/);
  });
});

describe('editing, undoing and extra sets', () => {
  async function oneSet() {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    const s = card(w.view(id), 'goblet-squat').suggestion;
    const setId = await w.actions.logSet(id, { exerciseId: 'goblet-squat', setNumber: 1, values: { weightLbs: 20, reps: 10 }, suggestion: s });
    return { w, id, s, setId };
  }

  test('Edit then Save writes set.edited with only the changed fields', async () => {
    const { w, id, s, setId } = await oneSet();
    w.actions.beginEdit(id, 'goblet-squat', 1);
    w.actions.setValue(id, 'goblet-squat', 1, 'reps', 12);
    const row = card(w.view(id), 'goblet-squat').rows[0];
    assert.deepEqual([row.status, row.reps, row.dirty], ['editing', 12, true]);
    assert.equal(await w.actions.saveSet(id, { setId, values: row, suggestion: s }), true);
    const edit = w.events.events().at(-1);
    assert.equal(edit.type, 'set.edited');
    assert.deepEqual(edit.payload, { reps: 12 });
    assert.equal(w.state.sets[setId].reps, 12);
    assert.equal(w.state.sets[setId].weightLbs, 20);
    assert.equal(card(w.view(id), 'goblet-squat').rows[0].status, 'done');
    w.assertValid();
  });

  test('Save with nothing changed writes nothing', async () => {
    const { w, id, s, setId } = await oneSet();
    const before = w.events.eventCount();
    w.actions.beginEdit(id, 'goblet-squat', 1);
    const row = card(w.view(id), 'goblet-squat').rows[0];
    assert.equal(await w.actions.saveSet(id, { setId, values: row, suggestion: s }), false);
    assert.equal(w.events.eventCount(), before);
    assert.equal(card(w.view(id), 'goblet-squat').rows[0].status, 'done');
  });

  test('Cancel drops the typing', async () => {
    const { w, id } = await oneSet();
    w.actions.beginEdit(id, 'goblet-squat', 1);
    w.actions.setValue(id, 'goblet-squat', 1, 'reps', 99);
    w.actions.cancelEdit(id, 'goblet-squat', 1);
    const row = card(w.view(id), 'goblet-squat').rows[0];
    assert.deepEqual([row.status, row.reps], ['done', 10]);
  });

  test('Undo deletes the set; logging that number again makes a new set and the log keeps the tombstone', async () => {
    const { w, id, s, setId } = await oneSet();
    await w.actions.undoSet(id, setId);
    assert.deepEqual(sets(w), []);
    assert.equal(card(w.view(id), 'goblet-squat').rows[0].status, 'todo');
    assert.equal(w.events.events().at(-1).type, 'entity.deleted');
    assert.deepEqual(w.events.events().at(-1).payload, { entityType: 'set' });
    const again = await w.actions.logSet(id, { exerciseId: 'goblet-squat', setNumber: 1, values: { weightLbs: 20, reps: 9 }, suggestion: s });
    assert.notEqual(again, setId);
    assert.equal(sets(w).length, 1);
    w.assertValid();
  });

  test('an undone set does not count towards history or the summary', async () => {
    const { w, id, setId } = await oneSet();
    await w.actions.undoSet(id, setId);
    await assert.rejects(w.actions.finish(id, {}), /Log at least one set/);
  });

  test('an extra set adds a row and can be logged', async () => {
    const { w, id, s } = await oneSet();
    w.actions.addSet(id, 'goblet-squat');
    const rows = card(w.view(id), 'goblet-squat').rows;
    assert.equal(rows.length, 3);
    await w.actions.logSet(id, { exerciseId: 'goblet-squat', setNumber: 3, values: { weightLbs: 20, reps: 8 }, suggestion: s });
    assert.equal(card(w.view(id), 'goblet-squat').rows.length, 3);
    assert.equal(w.view(id).loggedSets, 2);
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
    const h = homeView(w.state, '2026-10-05');
    assert.equal(h.next.templateCode, 'B');
    w.assertValid();
  });

  test('choosing the default again clears the swap', async () => {
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

  test('not an option for the slot, or after a set was logged for the exercise: refused', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await assert.rejects(w.actions.swap(id, { slotNumber: 3, exerciseId: 'goblet-squat' }), /not an option/);
    await assert.rejects(w.actions.swap(id, { slotNumber: 9, exerciseId: 'hip-thrust' }), /No such slot/);
    const s = card(w.view(id), 'db-romanian-deadlift').suggestion;
    await w.actions.logSet(id, { exerciseId: 'db-romanian-deadlift', setNumber: 1, values: { weightLbs: 15, reps: 8 }, suggestion: s });
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

  test('cannot finish with no sets, or twice; the summary is there after', async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await assert.rejects(w.actions.finish(id, {}), /Log at least one set/);
    await doWorkout(w, { sessionId: id });
    await assert.rejects(w.actions.finish(id, {}), /finished/);
    assert.ok(w.state.sessions[id].finishedAt);
  });

  test('discard drops the session and its sets, and Start is offered again', async () => {
    const w = await makeWorld();
    const id = await doWorkout(w, { finish: false });
    assert.ok(sets(w).length > 0);
    await w.actions.discard(id);
    assert.deepEqual(w.state.sessions, {});
    assert.deepEqual(sets(w), []);
    assert.equal(homeView(w.state, '2026-09-28').next.templateCode, 'A');
    assert.equal(w.events.events().at(-1).payload.entityType, 'session');
    w.assertValid();
  });
});

describe('draft safety', () => {
  test('a reload mid-workout: sets from the log, typed values and the rest timer from the draft', async () => {
    const storage = createMemoryStorage({ persistent: true });
    const backend = new Map();
    const shim = { getItem: (k) => backend.get(k) ?? null, setItem: (k, v) => void backend.set(k, v), removeItem: (k) => void backend.delete(k) };
    const a = await makeWorld({ storage, backend: shim });
    const id = await a.actions.startSession();
    const s = card(a.view(id), 'goblet-squat').suggestion;
    await a.actions.logSet(id, { exerciseId: 'goblet-squat', setNumber: 1, values: { weightLbs: 25, reps: 10 }, suggestion: s });
    a.actions.setValue(id, 'goblet-squat', 2, 'reps', 9);
    a.actions.setValue(id, 'db-bench-press', 1, 'weightLbs', 22.5);
    a.actions.typeNotes(id, 'half typed');
    const before = a.view(id);

    // The page is closed and opened again: new store from the same IndexedDB, new draft store on the same localStorage.
    const b = await makeWorld({ storage, backend: shim, start: '2026-09-28T11:01:00-07:00' });
    const after = b.view(id);
    assert.deepEqual(after.groups.flatMap((g) => g.cards.map((c) => c.rows.map((r) => [r.status, r.weightLbs, r.reps]))),
      before.groups.flatMap((g) => g.cards.map((c) => c.rows.map((r) => [r.status, r.weightLbs, r.reps]))));
    assert.equal(after.notes, 'half typed');
    assert.equal(after.rest.over, false);
    assert.equal(after.loggedSets, 1);
    assert.equal(homeView(b.state, '2026-09-28').inProgress[0].sessionId, id, 'Home offers Resume');
  });

  test('if the draft is lost (cleared storage) the logged sets are still all there', async () => {
    const storage = createMemoryStorage({ persistent: true });
    const a = await makeWorld({ storage });
    const id = await doWorkout(a, { finish: false });
    a.actions.setValue(id, 'goblet-squat', 1, 'weightLbs', 99);
    const b = await makeWorld({ storage, start: '2026-09-28T12:00:00-07:00' }); // a fresh draft store, nothing saved
    assert.equal(b.view(id).loggedSets, a.view(id).loggedSets);
    assert.ok(b.view(id).canFinish);
  });
});

describe('progression through the screens', () => {
  test('three weeks on, the next Workout A shows the scheduled increase; logging it clears the highlight', async () => {
    const w = await makeWorld();
    // Week 1: A, B, C
    await doWorkout(w, { plan: { 'goblet-squat': { weightLbs: 25, reps: 12 } } });
    w.set('2026-09-30T11:00:00-07:00');
    await doWorkout(w);
    w.set('2026-10-02T11:00:00-07:00');
    await doWorkout(w);
    // Workout A on day 21: 25 lbs is suggested up to 30.
    w.set('2026-10-19T11:00:00-07:00');
    const id = await w.actions.startSession();
    const squat = card(w.view(id), 'goblet-squat');
    assert.equal(w.state.sessions[id].templateCode, 'A');
    assert.equal(squat.increaseText, '↑ +5 lbs from 25 · Scheduled');
    assert.deepEqual(squat.rows.map((r) => r.weightLbs), [30, 30]);
    assert.equal(squat.lastText, 'Last (Mon, Sep 28): 25 × 12, 12');
    // The person lifts 30. The summary has no callout for it, and the next A holds 30.
    await doWorkout(w, { sessionId: id, plan: { 'goblet-squat': { reps: 10 } } });
    w.assertValid();
    const done = w.state.sets;
    assert.ok(Object.values(done).some((s) => s.weightLbs === 30 && s.suggestedWeightLbs === 30 && s.suggestionSource === 'scheduled'));
    w.set('2026-10-21T11:00:00-07:00');
    await doWorkout(w);
    w.set('2026-10-23T11:00:00-07:00');
    await doWorkout(w);
    w.set('2026-10-26T11:00:00-07:00');
    const h = homeView(w.state, '2026-10-26');
    const next = h.next.exercises.find((e) => e.exerciseId === 'goblet-squat');
    assert.equal(next.increaseText, null);
    assert.equal(next.suggestionText, 'Suggested: 30 lbs');
  });

  test('logging the old weight when an increase was suggested keeps suggesting it', async () => {
    const w = await makeWorld();
    await doWorkout(w, { plan: { 'goblet-squat': { weightLbs: 25, reps: 12 } } });
    w.set('2026-09-30T11:00:00-07:00'); await doWorkout(w);
    w.set('2026-10-02T11:00:00-07:00'); await doWorkout(w);
    w.set('2026-10-19T11:00:00-07:00');
    const id = await doWorkout(w, { plan: { 'goblet-squat': { weightLbs: 25 } } }); // ignores the 30
    const set = sets(w).find((s) => s.sessionId === id && s.exerciseId === 'goblet-squat');
    assert.deepEqual([set.weightLbs, set.suggestedWeightLbs], [25, 30]);
    w.set('2026-10-21T11:00:00-07:00'); await doWorkout(w);
    w.set('2026-10-23T11:00:00-07:00'); await doWorkout(w);
    w.set('2026-10-26T11:00:00-07:00');
    assert.equal(homeView(w.state, '2026-10-26').next.exercises.find((e) => e.exerciseId === 'goblet-squat').increaseText, '↑ +5 lbs from 25 · Scheduled');
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

    const id = await doWorkout(world, { plan: { 'goblet-squat': { weightLbs: 25, reps: [12, 11] } } });
    await phone.sync.sync().catch(() => {}); // still offline: nothing is lost
    const waiting = phone.events.pendingCount();
    assert.equal(waiting, 1 + 12 + 1, 'session.started, twelve sets, session.finished');
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
    assert.deepEqual(Object.values(onDesktop.sets).filter((s) => s.exerciseId === 'goblet-squat').map((s) => [s.weightLbs, s.reps]).sort(), [[25, 11], [25, 12]]);
    assert.equal(nextTemplate(onDesktop), 'B');
  });
});

describe('back pain after', () => {
  test('a rating that was chosen and then cleared is not saved; the one left in the draft is', async () => {
    const w = await makeWorld();
    const id = await doWorkout(w, { finish: false });
    w.actions.setBackPainAfter(id, 4);
    w.actions.setBackPainAfter(id, null); // tapped again to clear
    assert.equal(w.view(id).backPainAfter, null);
    await w.actions.finish(id, { backPainAfter: w.actions.draft(id).backPainAfter ?? null });
    assert.equal(Object.hasOwn(w.state.sessions[id], 'backPainAfter'), false);

    const id2 = await doWorkout(w, { finish: false });
    w.actions.setBackPainAfter(id2, 0);
    await w.actions.finish(id2, { backPainAfter: w.actions.draft(id2).backPainAfter ?? null });
    assert.equal(w.state.sessions[id2].backPainAfter, 0, '0 out of 10 is a rating, not "skipped"');
    w.assertValid();
  });
});

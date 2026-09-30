// A device for the Phase D tests: the real event store over memory storage, the real replay and engine, and the real
// actions, with a clock the test moves. Every event the actions write is checked by the server's validator.

import { createMemoryStorage } from '../app/js/store/memory.js';
import { createEventStore } from '../app/js/store/events.js';
import { ulid } from '../app/js/ids.js';
import { createActions, createDraftStore, sessionView } from '../app/js/logging/index.js';
import { validateEvent } from '../lambda/events/registry.mjs';

export const at = (iso) => Date.parse(iso);

export async function makeWorld({ start = '2026-09-28T11:00:00-07:00', deviceId = 'd_test', storage = createMemoryStorage(), backend = null } = {}) {
  const clock = { ms: at(start) };
  const events = await createEventStore({ storage, deviceId, now: () => clock.ms, newId: (ms) => ulid(ms) });
  const store = new Map();
  const drafts = createDraftStore(backend ?? { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) });
  const actions = createActions({ events, drafts, now: () => clock.ms, newId: (ms) => ulid(ms) });
  const world = {
    clock, events, drafts, actions, storage,
    set(iso) { clock.ms = at(iso); },
    advance(seconds) { clock.ms += seconds * 1000; },
    get state() { return events.state; },
    view: (sessionId) => sessionView(events.state, sessionId, actions.draft(sessionId), clock.ms),
    // Every event held is one the server would accept.
    assertValid() {
      for (const ev of events.events()) {
        const errs = validateEvent(ev, clock.ms + 86_400_000);
        if (errs.length) throw new Error(`invalid ${ev.type}: ${JSON.stringify(errs)}`);
      }
    },
  };
  return world;
}

// Logs a whole workout the way the screen does: every card gets its typed changes, then one Done for the exercise. `plan` overrides
// per exercise: { weightLbs, level, reps: [..] per set | number, distanceM } (anything left out is the pre-filled value).
export async function doWorkout(world, { sessionId = null, plan = {}, backPainBefore = null, finish = true, secondsPerExercise = 180 } = {}) {
  const id = sessionId ?? (await world.actions.startSession({ backPainBefore }));
  for (const startCard of world.view(id).cards) {
    const { exerciseId } = startCard;
    const p = plan[exerciseId] ?? {};
    const numbers = startCard.rows.map((r) => r.setNumber);
    if (p.weightLbs !== undefined) world.actions.setAll(id, exerciseId, numbers, 'weightLbs', p.weightLbs);
    if (p.level !== undefined) world.actions.setAll(id, exerciseId, numbers, 'levelNumber', p.level);
    if (p.distanceM !== undefined) world.actions.setAll(id, exerciseId, numbers, 'distanceM', p.distanceM);
    if (typeof p.reps === 'number') world.actions.setAll(id, exerciseId, numbers, 'reps', p.reps);
    if (Array.isArray(p.reps)) p.reps.forEach((r, i) => world.actions.setValue(id, exerciseId, numbers[i], 'reps', r));
    const card = world.view(id).cards.find((c) => c.exerciseId === exerciseId);
    world.advance(secondsPerExercise);
    await world.actions.saveExercise(id, { exerciseId, rows: card.rows, suggestion: card.suggestion });
  }
  if (finish) {
    world.advance(60);
    await world.actions.finish(id, {});
  }
  return id;
}

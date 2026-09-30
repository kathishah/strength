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

// Logs a whole workout the way the screen does: every card, every row, Done on each. `plan` overrides per exercise:
//   { weightLbs, reps: [..] | number, level, distanceM }   (anything left out uses the box as pre-filled, reps = target)
export async function doWorkout(world, { sessionId = null, plan = {}, backPainBefore = null, finish = true, secondsPerSet = 90 } = {}) {
  const id = sessionId ?? (await world.actions.startSession({ backPainBefore }));
  const view = world.view(id);
  for (const group of view.groups) {
    for (const card of group.cards) {
      const p = plan[card.exerciseId] ?? {};
      const total = card.rows.length;
      for (let i = 0; i < total; i++) {
        if (p.weightLbs !== undefined) await world.actions.setValue(id, card.exerciseId, i + 1, 'weightLbs', p.weightLbs);
        if (p.level !== undefined) await world.actions.setValue(id, card.exerciseId, i + 1, 'levelNumber', p.level);
        const row = world.view(id).groups.flatMap((g) => g.cards).find((c) => c.exerciseId === card.exerciseId).rows.find((r) => r.setNumber === i + 1);
        const reps = Array.isArray(p.reps) ? p.reps[i] : p.reps ?? card.suggestion.targetReps;
        const values = {
          weightLbs: row.weightLbs, levelNumber: row.levelNumber,
          reps: card.inputs.reps ? reps : null,
          distanceM: card.inputs.distance ? p.distanceM ?? card.suggestion.targetDistanceM : null,
          rir: null,
        };
        world.advance(secondsPerSet);
        await world.actions.logSet(id, { exerciseId: card.exerciseId, setNumber: i + 1, values, suggestion: card.suggestion });
      }
    }
  }
  if (finish) {
    world.advance(60);
    await world.actions.finish(id, {});
  }
  return id;
}

// The local event log: every event this device knows, its outbox, and the state replayed from them
// (DEPLOYMENT-PLAN.md sections 4 and 5). Storage is behind the interface in open.js.
//
// Local first: append() writes the event to storage and updates state before anything touches the
// network. The sync code (outbox.js, sync.js) reads pending() and calls ingest() / markSent() / reject().

import { createClock, ulid } from '../ids.js';
import { compareParsedTs, parseTs } from '../time.js';
import { isEventLike, mergeEvent } from './merge.js';
import { replay } from './replay.js';

const byTs = (a, b) => compareParsedTs(a.ts, b.ts) || (a.ev.id < b.ev.id ? -1 : a.ev.id > b.ev.id ? 1 : 0);

// Events sorted by replay order (oldest first). Ones with an unusable ts are left out.
function sortEvents(list) {
  const keyed = [];
  for (const ev of list) {
    const ts = parseTs(ev.ts);
    if (ts) keyed.push({ ev, ts });
  }
  return keyed.sort(byTs).map((k) => k.ev);
}

// storage: an object from open.js. deviceId: like "d_7f3a". clock/now/newId are injectable for tests.
export async function createEventStore({ storage, deviceId, clock = createClock(), now = Date.now, newId = ulid }) {
  const loaded = await storage.loadAll();
  const byId = new Map(loaded.events.map((e) => [e.id, e]));
  const outbox = new Set(loaded.outbox);
  let cursor = loaded.cursor ?? null;
  const rejected = new Map(loaded.rejected.map((r) => [r.id, r]));
  const listeners = new Set();
  let cachedState = null;

  // The clock must not fall behind anything already in the log, e.g. after the wall clock stepped back.
  for (const ev of byId.values()) clock.observe(ev.ts, now());

  function changed(info) {
    cachedState = null;
    for (const fn of [...listeners]) {
      try { fn(info); } catch (err) { console.error('event store listener failed', err); }
    }
  }

  return {
    deviceId,
    persistent: storage.persistent,

    // The replayed state. Memoized until the log changes.
    get state() {
      return (cachedState ??= replay([...byId.values()]));
    },

    // Every event held, oldest first by replay order.
    events: () => sortEvents(byId.values()),
    eventCount: () => byId.size,
    cursor: () => cursor,
    rejected: () => [...rejected.values()].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)),

    // Writes a new event locally (storage first, then state). Resolves with the event once it is stored.
    async append(type, entityId, payload, { v = 1 } = {}) {
      const at = now();
      const event = { id: newId(at), ts: clock.next(deviceId, at), v, type, entityId, payload };
      await storage.appendLocal(event);
      byId.set(event.id, event);
      outbox.add(event.id);
      changed({ kind: 'append', event });
      return event;
    },

    // Events not yet acknowledged by the server, in replay order.
    pending: () => sortEvents([...outbox].map((id) => byId.get(id)).filter(Boolean)),
    pendingCount: () => outbox.size,

    async markSent(ids) {
      await storage.markSent(ids);
      for (const id of ids) outbox.delete(id);
      changed({ kind: 'sent', ids });
    },

    // The server will never accept these; keep them aside with the reason. entries: [{ id, reason }]
    async reject(entries) {
      const stamped = entries
        .map(({ id, reason }) => ({ event: byId.get(id), reason, at: now() }))
        .filter((e) => e.event);
      if (stamped.length === 0) return;
      await storage.reject(stamped);
      for (const { event, reason, at } of stamped) {
        byId.delete(event.id);
        outbox.delete(event.id);
        rejected.set(event.id, { id: event.id, event, reason, at });
      }
      changed({ kind: 'rejected', ids: stamped.map((e) => e.event.id) });
    },

    // Events from GET /events, stored together with the cursor they came with. De-duplicates by id
    // (the server can hold an event twice; see DEPLOYMENT-PLAN.md section 13). The cursor moves only
    // if the write succeeds. Resolves with how many events were new.
    async ingest(incoming, nextCursor) {
      const usable = incoming.filter(isEventLike);
      const { added } = await storage.ingest(usable, nextCursor ?? null);
      for (const ev of usable) {
        byId.set(ev.id, mergeEvent(byId.get(ev.id), ev));
        outbox.delete(ev.id); // the server has it
        clock.observe(ev.ts, now());
      }
      if (nextCursor) cursor = nextCursor;
      changed({ kind: 'ingest', added });
      return { added };
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

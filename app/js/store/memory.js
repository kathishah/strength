// In-memory storage with the same interface as idb.js (see open.js). Used by the tests, and as the
// fallback when IndexedDB is unavailable; then nothing survives a reload and `persistent` is false.
// Values are copied on the way in and out, like IndexedDB does, so callers cannot share objects with it.

import { isEventLike, mergeEvent } from './merge.js';

export function createMemoryStorage({ persistent = false } = {}) {
  const events = new Map();
  const outbox = new Set();
  const rejected = new Map();
  let cursor = null;
  return {
    persistent,

    async loadAll() {
      return {
        events: structuredClone([...events.values()]),
        outbox: [...outbox],
        cursor,
        rejected: structuredClone([...rejected.values()]),
      };
    },

    // A local write: the event and its outbox entry together, or neither.
    async appendLocal(event) {
      events.set(event.id, structuredClone(event));
      outbox.add(event.id);
    },

    // Events from the server, and the cursor they came with, together. Events we already hold are kept
    // (gaining recvAt if they lacked it); ones we sent are no longer outstanding. Returns how many were new.
    async ingest(incoming, nextCursor) {
      let added = 0;
      const batch = new Map(); // same folding as idb.js
      for (const ev of incoming) if (isEventLike(ev)) batch.set(ev.id, mergeEvent(batch.get(ev.id), ev));
      for (const ev of batch.values()) {
        const existing = events.get(ev.id);
        if (!existing) added++;
        events.set(ev.id, structuredClone(mergeEvent(existing, ev)));
        outbox.delete(ev.id);
      }
      if (nextCursor) cursor = nextCursor;
      return { added };
    },

    async markSent(ids) {
      for (const id of ids) outbox.delete(id);
    },

    // The server refused these events for good: take them out of the log and the outbox and keep them
    // (with the reason) where they can be looked at. entries: [{ event, reason, at }]
    async reject(entries) {
      for (const { event, reason, at } of entries) {
        events.delete(event.id);
        outbox.delete(event.id);
        rejected.set(event.id, structuredClone({ id: event.id, event, reason, at }));
      }
    },

    close() {},
  };
}

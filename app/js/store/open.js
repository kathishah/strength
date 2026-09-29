// Opens local storage: IndexedDB where it works, memory (not persistent) where it does not.
//
// Storage interface (idb.js and memory.js both implement it; test/storage.test.mjs runs the same
// cases against every implementation):
//   persistent                 true when data survives a reload
//   loadAll()                  -> { events, outbox: [id], cursor, rejected: [{ id, event, reason, at }] }
//   appendLocal(event)         event and outbox entry, atomically
//   ingest(events, cursor)     merge server events (keep ours, adopt recvAt), drop them from the outbox,
//                              save the cursor if given; atomically. -> { added }
//   markSent(ids)              drop from the outbox
//   reject(entries)            [{ event, reason, at }]: remove from events and outbox, record in rejected
//   close()

import { openIdb } from './idb.js';
import { createMemoryStorage } from './memory.js';

export async function openStorage({ name, factory } = {}) {
  try {
    const storage = await openIdb(name, factory);
    // Ask the browser not to evict this site's data under storage pressure (best effort; iOS may ignore it).
    try { Promise.resolve(globalThis.navigator?.storage?.persist?.()).catch(() => {}); } catch { /* not supported */ }
    return storage;
  } catch (err) {
    console.warn('IndexedDB unavailable; events are kept in memory only.', err);
    return createMemoryStorage({ persistent: false });
  }
}

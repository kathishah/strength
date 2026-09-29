// IndexedDB storage (DEPLOYMENT-PLAN.md section 5). Interface: see open.js.
//
//   events    every event this device knows, keyed by id (its own, and the server's)
//   outbox    { id } for events not yet acknowledged by the server
//   meta      { key: 'cursor', value } (the GET /events position)
//   rejected  { id, event, reason, at } for events the server refused for good
//
// Multi-store writes use one transaction, so a crash never leaves an event without its outbox entry,
// or a cursor ahead of the events it covers.

import { isEventLike, mergeEvent } from './merge.js';

const DB_VERSION = 1;

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const finished = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

export function openIdb(name = 'strength', factory = globalThis.indexedDB) {
  if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
  return new Promise((resolve, reject) => {
    const opening = factory.open(name, DB_VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      db.createObjectStore('events', { keyPath: 'id' });
      db.createObjectStore('outbox', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'key' });
      db.createObjectStore('rejected', { keyPath: 'id' });
    };
    opening.onblocked = () => reject(new Error('IndexedDB open is blocked by another tab'));
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      db.onversionchange = () => db.close(); // let a newer version of the app upgrade
      resolve(wrap(db));
    };
  });
}

function wrap(db) {
  return {
    persistent: true,

    async loadAll() {
      const tx = db.transaction(['events', 'outbox', 'meta', 'rejected'], 'readonly');
      const [events, outbox, meta, rejected] = await Promise.all(
        ['events', 'outbox', 'meta', 'rejected'].map((s) => request(tx.objectStore(s).getAll())),
      );
      return {
        events,
        outbox: outbox.map((o) => o.id),
        cursor: meta.find((m) => m.key === 'cursor')?.value ?? null,
        rejected,
      };
    },

    async appendLocal(event) {
      // strict durability: a set the user just logged must survive a crash or a killed app.
      const tx = db.transaction(['events', 'outbox'], 'readwrite', { durability: 'strict' });
      tx.objectStore('events').put(event);
      tx.objectStore('outbox').put({ id: event.id });
      await finished(tx);
    },

    async ingest(incoming, nextCursor) {
      const tx = db.transaction(['events', 'outbox', 'meta'], 'readwrite');
      const events = tx.objectStore('events');
      const outbox = tx.objectStore('outbox');
      let added = 0;
      // Fold repeats within the batch first: the reads below all run before any write, so two copies of
      // one id would both look new.
      const batch = new Map();
      for (const ev of incoming) if (isEventLike(ev)) batch.set(ev.id, mergeEvent(batch.get(ev.id), ev));
      for (const ev of batch.values()) {
        const get = events.get(ev.id);
        get.onsuccess = () => {
          const existing = get.result;
          if (!existing) added++;
          const merged = mergeEvent(existing, ev);
          if (merged !== existing) events.put(merged);
          outbox.delete(ev.id);
        };
      }
      if (nextCursor) tx.objectStore('meta').put({ key: 'cursor', value: nextCursor });
      await finished(tx);
      return { added };
    },

    async markSent(ids) {
      const tx = db.transaction(['outbox'], 'readwrite');
      for (const id of ids) tx.objectStore('outbox').delete(id);
      await finished(tx);
    },

    async reject(entries) {
      const tx = db.transaction(['events', 'outbox', 'rejected'], 'readwrite');
      for (const { event, reason, at } of entries) {
        tx.objectStore('events').delete(event.id);
        tx.objectStore('outbox').delete(event.id);
        tx.objectStore('rejected').put({ id: event.id, event, reason, at });
      }
      await finished(tx);
    },

    close() {
      db.close();
    },
  };
}

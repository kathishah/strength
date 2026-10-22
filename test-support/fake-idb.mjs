// A small in-memory IndexedDB, just enough for app/js/store/idb.js (open with an upgrade, transactions over object stores with
// get/getAll/put/delete, close) and for clearProfile (deleteDatabase, blocked while a connection is open). Node has no IndexedDB.
// One factory is one browser profile: its databases survive "page loads" (installFakeDom calls), as a real browser's do.
//   const idb = createFakeIdb();  idb.databases() -> names;  idb.openConnections(name) -> how many are open.

export function createFakeIdb() {
  const dbs = new Map(); // name -> { stores: Map(storeName -> { keyPath, rows: Map }), version, open: Set }
  const later = (fn) => queueMicrotask(fn);

  function makeStore(def) {
    const key = (row) => row[def.keyPath];
    return {
      put(row) { const req = {}; def.rows.set(key(row), structuredClone(row)); later(() => { req.result = key(row); req.onsuccess?.(); }); return req; },
      delete(id) { const req = {}; def.rows.delete(id); later(() => req.onsuccess?.()); return req; },
      get(id) { const req = {}; later(() => { req.result = structuredClone(def.rows.get(id)); req.onsuccess?.(); }); return req; },
      getAll() { const req = {}; later(() => { req.result = [...def.rows.values()].map((r) => structuredClone(r)); req.onsuccess?.(); }); return req; },
    };
  }

  function connection(db) {
    const conn = {
      closed: false,
      transaction(names) {
        if (conn.closed) throw new Error('The database connection is closed');
        const tx = {};
        // Every operation above runs at once; the transaction completes after the microtasks they queue (an onsuccess may queue more).
        setImmediate(() => tx.oncomplete?.());
        tx.objectStore = (name) => {
          if (!names.includes(name)) throw new Error(`store ${name} is not in this transaction`);
          return makeStore(db.stores.get(name));
        };
        return tx;
      },
      close() { conn.closed = true; db.open.delete(conn); },
    };
    db.open.add(conn);
    return conn;
  }

  return {
    databases: () => [...dbs.keys()],
    openConnections: (name) => dbs.get(name)?.open.size ?? 0,
    open(name, version = 1) {
      const req = {};
      later(() => {
        let db = dbs.get(name);
        if (!db) {
          db = { stores: new Map(), version, open: new Set() };
          dbs.set(name, db);
          req.result = { createObjectStore: (store, { keyPath }) => db.stores.set(store, { keyPath, rows: new Map() }) };
          req.onupgradeneeded?.();
        }
        req.result = connection(db);
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase(name) {
      const req = {};
      later(() => {
        if (dbs.get(name)?.open.size > 0) { req.onblocked?.(); return; } // a real browser waits until the connections close
        dbs.delete(name);
        req.onsuccess?.();
      });
      return req;
    },
  };
}

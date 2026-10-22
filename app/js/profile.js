// Storage profiles (docs/SHOWCASE-AND-SELF-HOST-SPEC.md, "App modes"): the names an app mode keeps its data under.
//   dbName     the IndexedDB database (store/open.js)
//   keyPrefix  the prefix of every localStorage key the app writes: deviceId, draft, and anything a mode adds (store/auth.js keeps
//              its own refresh-token key and is only ever loaded in synced mode; the theme key "strengthTheme" is shared on purpose)
// Synced and local-only use are the same profile, so events logged locally stay in the upload queue for a later synced boot.
// The demo has its own, so a demo reset can never touch real data.

export const DEFAULT_PROFILE = Object.freeze({ dbName: 'strength', keyPrefix: 'strength.' });
export const DEMO_PROFILE = Object.freeze({ dbName: 'strength-demo', keyPrefix: 'strength-demo.' });

export const MODES = Object.freeze(['synced', 'local', 'demo']);

export function storageProfile(mode) {
  if (mode === 'demo') return DEMO_PROFILE;
  if (mode === 'synced' || mode === 'local') return DEFAULT_PROFILE;
  throw new RangeError(`unknown app mode "${mode}"`);
}

// Deletes everything a profile stored: its IndexedDB database and every localStorage key under its prefix. Shared by local-only
// "Clear data on this device" and the demo's "Reset demo". storage is the open storage (closed first, or the delete would wait for it).
// Other profiles and the theme key are never touched: the prefix ends in "." and "strengthTheme" has none.
export async function clearProfile(profile, { storage, indexedDB = globalThis.indexedDB, localStorage: ls } = {}) {
  try { await storage?.close?.(); } catch { /* already closed */ }
  if (indexedDB) {
    await new Promise((resolve) => {
      let req;
      try { req = indexedDB.deleteDatabase(profile.dbName); } catch { resolve(); return; }
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
  try {
    const backend = ls ?? globalThis.localStorage;
    const keys = [];
    for (let i = 0; i < backend.length; i++) keys.push(backend.key(i));
    for (const key of keys) if (key.startsWith(profile.keyPrefix)) backend.removeItem(key);
  } catch { /* storage blocked: nothing stored */ }
}

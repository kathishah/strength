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

// Storage profiles (app/js/profile.js): synced and local-only use keep today's names; the demo has its own, and the
// functions that used to hard-code "strength" and "strength." take the profile.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE, DEMO_PROFILE, MODES, storageProfile } from '../app/js/profile.js';
import { getDeviceId } from '../app/js/ids.js';
import { createDraftStore, setRowField } from '../app/js/logging/draft.js';
import { openStorage } from '../app/js/store/open.js';

function memoryLocalStorage() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => void map.delete(k) };
}

describe('profiles', () => {
  test('synced and local use the same names as before; the demo has separate ones', () => {
    assert.deepEqual({ ...DEFAULT_PROFILE }, { dbName: 'strength', keyPrefix: 'strength.' });
    assert.deepEqual({ ...DEMO_PROFILE }, { dbName: 'strength-demo', keyPrefix: 'strength-demo.' });
    assert.equal(storageProfile('synced'), DEFAULT_PROFILE);
    assert.equal(storageProfile('local'), DEFAULT_PROFILE);
    assert.equal(storageProfile('demo'), DEMO_PROFILE);
    assert.deepEqual([...MODES], ['synced', 'local', 'demo']);
    assert.throws(() => storageProfile('other'), RangeError);
  });
});

describe('getDeviceId', () => {
  test('defaults to strength.deviceId; a profile moves it; each profile keeps its own id', () => {
    const saved = globalThis.localStorage;
    const ls = (globalThis.localStorage = memoryLocalStorage());
    try {
      const a = getDeviceId();
      assert.equal(ls.map.get('strength.deviceId'), a);
      assert.equal(getDeviceId(), a);
      const d = getDeviceId(DEMO_PROFILE);
      assert.equal(ls.map.get('strength-demo.deviceId'), d);
      assert.equal(getDeviceId(DEMO_PROFILE), d);
      assert.equal(ls.map.get('strength.deviceId'), a, 'the demo never touches the other id');
      assert.deepEqual([...ls.map.keys()].sort(), ['strength-demo.deviceId', 'strength.deviceId']);
    } finally {
      globalThis.localStorage = saved;
    }
  });

  test('with blocked storage it still returns a stable id per profile', () => {
    const saved = globalThis.localStorage;
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    try {
      const a = getDeviceId({ keyPrefix: 'blocked-a.' });
      const b = getDeviceId({ keyPrefix: 'blocked-b.' });
      assert.match(a, /^d_[0-9a-f]{4}$/);
      assert.equal(getDeviceId({ keyPrefix: 'blocked-a.' }), a);
      assert.equal(getDeviceId({ keyPrefix: 'blocked-b.' }), b);
    } finally {
      globalThis.localStorage = saved;
    }
  });
});

describe('createDraftStore', () => {
  test('defaults to strength.draft; a profile moves it', () => {
    const ls = memoryLocalStorage();
    const plain = createDraftStore(ls);
    plain.save(setRowField(plain.load('s1'), 'a', 1, 'reps', 7));
    const demo = createDraftStore(ls, DEMO_PROFILE);
    demo.save(setRowField(demo.load('s1'), 'a', 1, 'reps', 9));
    assert.deepEqual([...ls.map.keys()].sort(), ['strength-demo.draft', 'strength.draft']);
    assert.equal(createDraftStore(ls, DEMO_PROFILE).load('s1').rows.a[1].reps, 9);
    assert.equal(createDraftStore(ls).load('s1').rows.a[1].reps, 7);
  });
});

describe('openStorage', () => {
  // A factory whose open() only records the name and fails, so openStorage falls back to memory.
  const recording = () => {
    const names = [];
    return { names, factory: { open(name) { names.push(name); const req = {}; queueMicrotask(() => req.onerror?.()); Object.defineProperty(req, 'error', { value: new Error('no') }); return req; } } };
  };

  test('opens "strength" by default, a name or a profile when given', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const r = recording();
      await openStorage({ factory: r.factory });
      await openStorage({ profile: DEMO_PROFILE, factory: r.factory });
      await openStorage({ name: 'x', factory: r.factory });
      assert.deepEqual(r.names, ['strength', 'strength-demo', 'x']);
    } finally {
      console.warn = warn;
    }
  });
});

describe('clearProfile', () => {
  test('deletes the profile database and its keys only; the other profile and the theme stay', async () => {
    const { clearProfile } = await import('../app/js/profile.js');
    const ls = memoryLocalStorage();
    Object.defineProperty(ls, 'length', { get: () => ls.map.size });
    ls.key = (i) => [...ls.map.keys()][i] ?? null;
    for (const k of ['strength-demo.deviceId', 'strength-demo.draft', 'strength.deviceId', 'strengthTheme']) ls.setItem(k, 'x');
    const deleted = [];
    const indexedDB = { deleteDatabase(name) { const req = {}; deleted.push(name); queueMicrotask(() => req.onsuccess()); return req; } };
    let closed = false;
    await clearProfile(DEMO_PROFILE, { storage: { close: () => { closed = true; } }, indexedDB, localStorage: ls });
    assert.ok(closed);
    assert.deepEqual(deleted, ['strength-demo']);
    assert.deepEqual([...ls.map.keys()].sort(), ['strength.deviceId', 'strengthTheme']);
    await clearProfile(DEFAULT_PROFILE, { indexedDB, localStorage: ls });
    assert.deepEqual(deleted, ['strength-demo', 'strength']);
    assert.deepEqual([...ls.map.keys()], ['strengthTheme']);
  });
});

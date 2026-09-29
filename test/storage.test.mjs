// The storage interface, against the in-memory implementation. The IndexedDB implementation runs the
// same cases in a browser (test-support/storage-contract.mjs has no Node imports); Node has no IndexedDB.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../app/js/store/memory.js';
import { openStorage } from '../app/js/store/open.js';
import { storageCases } from '../test-support/storage-contract.mjs';

describe('memory storage', () => {
  for (const [name, run] of storageCases) {
    test(name, () => {
      const make = () => {
        const storage = createMemoryStorage({ persistent: true });
        return { storage, reopen: async () => storage };
      };
      return run({ make }, assert);
    });
  }
});

describe('opening storage', () => {
  test('without IndexedDB it falls back to memory and says it is not persistent', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const storage = await openStorage({ factory: undefined });
      assert.equal(storage.persistent, false);
      await storage.appendLocal({ id: 'E1', ts: 't', v: 1, type: 'x', entityId: 'x', payload: {} });
      assert.equal((await storage.loadAll()).events.length, 1);
    } finally {
      console.warn = warn;
    }
  });
});

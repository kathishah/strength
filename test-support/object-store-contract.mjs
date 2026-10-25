// Cases every ObjectStore (lambda/events/object-store.mjs) must pass. Anyone adding a deployment target with its
// own storage runs these against their implementation (docs/PORTING.md). No Node imports, so the same file can run
// inside a Worker or any other runtime.
//
//   objectStoreCases: [[name, async ({ make }, assert) => void]]
//   make() -> an ObjectStore that is empty for the keys the case uses. Real buckets can return a store
//             that prefixes every key with a fresh random string, as long as list() strips nothing.
//   assert: { equal, deepEqual, ok } (node:assert/strict in Node)
//
// A failed condition must throw an error with `status` 404, 409 or 412 (StoreError in object-store.mjs). The
// handler retries on any of the three, so a store that cannot tell them apart may use 412 throughout.

const status = (promise) => promise.then(() => 0, (err) => (err && typeof err.status === 'number' ? err.status : -1));

export const objectStoreCases = [
  ['get on a missing key returns null', async ({ make }, assert) => {
    assert.equal(await make().get('u/a/events/2026-10.json'), null);
  }],

  ['put with ifNoneMatch creates the key; get returns the body and the etag put returned', async ({ make }, assert) => {
    const store = make();
    const { etag } = await store.put('k', '["é"]', { ifNoneMatch: '*' });
    assert.ok(typeof etag === 'string' && etag !== '');
    assert.deepEqual(await store.get('k'), { body: '["é"]', etag });
  }],

  ['ifNoneMatch on an existing key fails with 412 and leaves it unchanged', async ({ make }, assert) => {
    const store = make();
    await store.put('k', '[1]', { ifNoneMatch: '*' });
    assert.equal(await status(store.put('k', '[2]', { ifNoneMatch: '*' })), 412);
    assert.equal((await store.get('k')).body, '[1]');
  }],

  ['ifMatch on a missing key fails with 404', async ({ make }, assert) => {
    assert.equal(await status(make().put('k', '[1]', { ifMatch: '"nope"' })), 404);
  }],

  ['ifMatch with a stale etag fails with 412; with the current etag it replaces the body and returns a new etag', async ({ make }, assert) => {
    const store = make();
    const first = await store.put('k', '[1]', { ifNoneMatch: '*' });
    assert.equal(await status(store.put('k', '[2]', { ifMatch: '"stale"' })), 412);
    assert.equal((await store.get('k')).body, '[1]');
    const second = await store.put('k', '[1,2]', { ifMatch: first.etag });
    assert.ok(second.etag !== first.etag);
    assert.deepEqual(await store.get('k'), { body: '[1,2]', etag: second.etag });
    assert.equal(await status(store.put('k', '[3]', { ifMatch: first.etag })), 412); // the old etag is stale now
  }],

  ['two overlapping writes with the same etag: exactly one wins, the other fails with 409 or 412', async ({ make }, assert) => {
    const store = make();
    const { etag } = await store.put('k', '[]', { ifNoneMatch: '*' });
    const results = await Promise.all([
      status(store.put('k', '["a"]', { ifMatch: etag })),
      status(store.put('k', '["b"]', { ifMatch: etag })),
    ]);
    assert.equal(results.filter((s) => s === 0).length, 1, `one write must win, got ${results}`);
    assert.ok(results.some((s) => s === 409 || s === 412), `the loser must report 409 or 412, got ${results}`);
    assert.ok(['["a"]', '["b"]'].includes((await store.get('k')).body));
  }],

  ['list returns the keys under a prefix and no others', async ({ make }, assert) => {
    const store = make();
    for (const key of ['u/a/events/2026-09.json', 'u/a/events/2026-10.json', 'u/b/events/2026-10.json']) {
      await store.put(key, '[]', { ifNoneMatch: '*' });
    }
    assert.deepEqual((await store.list('u/a/')).sort(), ['u/a/events/2026-09.json', 'u/a/events/2026-10.json']);
    assert.deepEqual(await store.list('u/zzz/'), []);
  }],
];

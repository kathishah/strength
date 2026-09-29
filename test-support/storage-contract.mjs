// Cases every storage implementation (app/js/store/open.js) must pass. Self-contained and free of
// Node imports so the same file can run in a browser against the real IndexedDB adapter.
//
//   storageCases: [[name, async ({ make }, assert) => void]]
//   make() -> { storage, reopen() }  a fresh, empty store; reopen() closes it and opens the same data
//                                    again (returns the same object for non-persistent storage).
//   assert: { equal, deepEqual, ok } (node:assert/strict in Node)

const event = (n, extra = {}) => ({
  id: `E${String(n).padStart(3, '0')}`,
  ts: `2026-09-29T12:${String(n % 60).padStart(2, '0')}:00.000-07:00-0000-d_a`,
  v: 1,
  type: 'session.notes',
  entityId: `sess_${n}`,
  payload: { notes: `note ${n}` },
  ...extra,
});
const ids = (list) => list.map((e) => e.id).sort();

export const storageCases = [
  ['starts empty', async ({ make }, assert) => {
    const { storage } = await make();
    assert.deepEqual(await storage.loadAll(), { events: [], outbox: [], cursor: null, rejected: [] });
  }],

  ['appendLocal stores the event and queues it, and both survive a reopen', async ({ make }, assert) => {
    const { storage, reopen } = await make();
    await storage.appendLocal(event(1));
    await storage.appendLocal(event(2));
    const again = await (await reopen()).loadAll();
    assert.deepEqual(ids(again.events), ['E001', 'E002']);
    assert.deepEqual([...again.outbox].sort(), ['E001', 'E002']);
    assert.deepEqual(again.events.find((e) => e.id === 'E001'), event(1));
  }],

  ['ingest stores events and the cursor together, and counts only new ones', async ({ make }, assert) => {
    const { storage, reopen } = await make();
    assert.deepEqual(await storage.ingest([event(1, { recvAt: 'r1' }), event(2, { recvAt: 'r2' })], '2026-09:2'), { added: 2 });
    assert.deepEqual(await storage.ingest([event(2, { recvAt: 'r2' }), event(3, { recvAt: 'r3' })], '2026-09:3'), { added: 1 });
    const all = await (await reopen()).loadAll();
    assert.deepEqual(ids(all.events), ['E001', 'E002', 'E003']);
    assert.equal(all.cursor, '2026-09:3');
  }],

  ['ingest without a cursor leaves the saved cursor alone', async ({ make }, assert) => {
    const { storage } = await make();
    await storage.ingest([event(1)], '2026-09:1');
    await storage.ingest([event(2)], null);
    assert.equal((await storage.loadAll()).cursor, '2026-09:1');
  }],

  ['an event we sent comes back: it keeps our copy, gains recvAt, and leaves the outbox', async ({ make }, assert) => {
    const { storage } = await make();
    await storage.appendLocal(event(1));
    await storage.appendLocal(event(2));
    const { added } = await storage.ingest([event(1, { recvAt: '2026-09-29T12:01:00.000-07:00' })], '2026-09:1');
    assert.equal(added, 0);
    const all = await storage.loadAll();
    assert.deepEqual(all.events.find((e) => e.id === 'E001'), event(1, { recvAt: '2026-09-29T12:01:00.000-07:00' }));
    assert.deepEqual(all.outbox, ['E002']);
  }],

  ['a copy we already hold with recvAt is not overwritten by a later copy', async ({ make }, assert) => {
    const { storage } = await make();
    await storage.ingest([event(1, { recvAt: 'first' })], null);
    await storage.ingest([event(1, { recvAt: 'second' })], null);
    assert.equal((await storage.loadAll()).events[0].recvAt, 'first');
  }],

  ['the same event twice in one batch is stored once', async ({ make }, assert) => {
    const { storage } = await make();
    const { added } = await storage.ingest([event(1), event(1), event(1)], null);
    assert.equal(added, 1);
    assert.equal((await storage.loadAll()).events.length, 1);
  }],

  ['ingest ignores junk that is not an event', async ({ make }, assert) => {
    const { storage } = await make();
    await storage.ingest([null, 'x', 7, [], {}, { id: 5 }, event(1)], null);
    assert.deepEqual(ids((await storage.loadAll()).events), ['E001']);
  }],

  ['markSent drops outbox entries and keeps the events', async ({ make }, assert) => {
    const { storage, reopen } = await make();
    for (const n of [1, 2, 3]) await storage.appendLocal(event(n));
    await storage.markSent(['E001', 'E003', 'E999']);
    const all = await (await reopen()).loadAll();
    assert.deepEqual(all.outbox, ['E002']);
    assert.equal(all.events.length, 3);
  }],

  ['reject removes the event and its outbox entry and records why', async ({ make }, assert) => {
    const { storage, reopen } = await make();
    for (const n of [1, 2]) await storage.appendLocal(event(n));
    await storage.reject([{ event: event(1), reason: 'payload.weightLbs must be between 0 and 1000', at: 1234 }]);
    const all = await (await reopen()).loadAll();
    assert.deepEqual(ids(all.events), ['E002']);
    assert.deepEqual(all.outbox, ['E002']);
    assert.deepEqual(all.rejected, [{ id: 'E001', event: event(1), reason: 'payload.weightLbs must be between 0 and 1000', at: 1234 }]);
  }],

  ['what loadAll returns is a copy', async ({ make }, assert) => {
    const { storage } = await make();
    await storage.appendLocal(event(1));
    const first = await storage.loadAll();
    first.events[0].payload.notes = 'changed';
    first.outbox.push('X');
    const second = await storage.loadAll();
    assert.equal(second.events[0].payload.notes, 'note 1');
    assert.deepEqual(second.outbox, ['E001']);
  }],

  ['what was passed in is copied, not kept', async ({ make }, assert) => {
    const { storage } = await make();
    const ev = event(1);
    await storage.appendLocal(ev);
    ev.payload.notes = 'changed after the fact';
    assert.equal((await storage.loadAll()).events[0].payload.notes, 'note 1');
  }],

  ['a thousand events round trip', async ({ make }, assert) => {
    const { storage, reopen } = await make();
    const batch = Array.from({ length: 1000 }, (_, i) => event(i + 1, { recvAt: 'r' }));
    assert.deepEqual(await storage.ingest(batch, '2026-09:1000'), { added: 1000 });
    const all = await (await reopen()).loadAll();
    assert.equal(all.events.length, 1000);
    assert.equal(all.cursor, '2026-09:1000');
  }],
];

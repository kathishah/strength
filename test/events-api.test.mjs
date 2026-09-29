import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BODY_BYTES } from '../lambda/events/registry.mjs';
import { OWNER, NOW, makeEvent, makeRequest, post, get, setup, monthKey, ulid } from '../test-support/util.mjs';

const ids = (events) => events.map((e) => e.id);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => makeEvent(from + i));
const stored = (events, recvAt) => events.map((e) => ({ ...e, recvAt }));

// Walks GET /events pages until more=false; returns every event and the page count.
async function readAll(call, { since, limit }) {
  const all = [];
  let cursor = since;
  let pages = 0;
  for (;;) {
    const res = await call(get({ ...(cursor ? { since: cursor } : {}), limit: String(limit) }));
    assert.equal(res.statusCode, 200);
    all.push(...res.json.events);
    if (res.json.cursor) cursor = res.json.cursor;
    pages++;
    if (!res.json.more) return { all, pages, cursor };
    assert.ok(pages < 1000, 'pagination did not terminate');
  }
}

describe('POST /events: storage', () => {
  test('stores events in the receive-month file, stamped with recvAt', async () => {
    const { call, store } = setup();
    const events = range(1, 3);
    const res = await call(post(events));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json, { accepted: 3, duplicates: 0 });
    assert.deepEqual(store.json(monthKey('2026-10')), stored(events, '2026-10-05T12:00:00.000Z'));
  });

  test('first event of a month creates the file with If-None-Match; later posts use If-Match', async () => {
    const { call, store, clock } = setup();
    await call(post(range(1, 1)));
    let puts = store.calls('put');
    assert.deepEqual(puts[0].cond, { ifNoneMatch: '*' });

    const etagAfterFirst = store.objects.get(monthKey('2026-10')).etag;
    await call(post(range(2, 2)));
    puts = store.calls('put');
    assert.equal(puts[1].cond.ifMatch, etagAfterFirst);
    assert.equal(puts[1].cond.ifNoneMatch, undefined);

    // Next month: a fresh file, again created with If-None-Match; October is untouched.
    clock.now = Date.parse('2026-11-01T00:00:01.000Z');
    const octBefore = store.objects.get(monthKey('2026-10')).body;
    await call(post(range(3, 3)));
    assert.deepEqual(store.calls('put')[2].cond, { ifNoneMatch: '*' });
    assert.deepEqual(ids(store.json(monthKey('2026-11'))), [ulid(3)]);
    assert.equal(store.objects.get(monthKey('2026-10')).body, octBefore);
  });

  test('the file is chosen by receive time (UTC), not by the month in ts', async () => {
    const { call, store } = setup();
    const late = makeEvent(1, { ts: '2026-09-28T18:00:00.000Z-0001-d_7f3a' });
    await call(post([late]));
    assert.equal(store.json(monthKey('2026-09')), undefined);
    assert.deepEqual(ids(store.json(monthKey('2026-10'))), [late.id]);
  });

  test('users are kept under their own prefix', async () => {
    const { call, store } = setup();
    await call(post(range(1, 1)));
    assert.deepEqual([...store.objects.keys()], [`u/${OWNER}/events/2026-10.json`]);
  });
});

describe('POST /events: idempotence', () => {
  test('re-posting the same batch is a no-op that counts duplicates', async () => {
    const { call, store } = setup();
    const events = range(1, 3);
    await call(post(events));
    const before = store.objects.get(monthKey('2026-10'));
    const res = await call(post(events));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json, { accepted: 0, duplicates: 3 });
    assert.equal(store.objects.get(monthKey('2026-10')).body, before.body);
    assert.equal(store.calls('put').length, 1, 'no second write when nothing is new');
  });

  test('a partly overlapping batch appends only the new events, in order', async () => {
    const { call, store } = setup();
    await call(post(range(1, 2)));
    const res = await call(post(range(2, 4)));
    assert.deepEqual(res.json, { accepted: 2, duplicates: 1 });
    assert.deepEqual(ids(store.json(monthKey('2026-10'))), [ulid(1), ulid(2), ulid(3), ulid(4)]);
  });

  test('the same id twice in one batch is stored once', async () => {
    const { call, store } = setup();
    const res = await call(post([makeEvent(1), makeEvent(1), makeEvent(2)]));
    assert.deepEqual(res.json, { accepted: 2, duplicates: 1 });
    assert.equal(store.json(monthKey('2026-10')).length, 2);
  });

  test('a retry never overwrites the recvAt of the stored copy', async () => {
    const { call, store, clock } = setup();
    await call(post(range(1, 1)));
    clock.now += 60_000;
    await call(post(range(1, 2)));
    assert.deepEqual(
      store.json(monthKey('2026-10')).map((e) => e.recvAt),
      ['2026-10-05T12:00:00.000Z', '2026-10-05T12:01:00.000Z'],
    );
  });
});

describe('POST /events: validation', () => {
  test('one bad event rejects the whole batch with a per-event reason; nothing is stored', async () => {
    const { call, store } = setup();
    const res = await call(post([makeEvent(1), makeEvent(2, { type: 'set.exploded' }), makeEvent(3)]));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error, 'validation');
    assert.deepEqual(
      res.json.errors.map((e) => [e.index, e.id, e.field]),
      [[1, ulid(2), 'type']],
    );
    assert.equal(store.objects.size, 0);
    assert.equal(store.log.length, 0, 'validation happens before any S3 call');
  });

  test('invalid JSON is a 400', async () => {
    const { call } = setup();
    const res = await call(makeRequest({ rawBody: '{nope' }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error, 'bad_json');
  });

  test('more than 200 events is a 400', async () => {
    const { call } = setup();
    const res = await call(post(range(1, 201)));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.errors[0].field, 'events');
  });

  test('an event with ts more than a day ahead is rejected', async () => {
    const { call } = setup();
    const res = await call(post([makeEvent(1, { ts: '2026-10-07T12:00:00.000Z-0001-d_7f3a' })]));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.errors[0].field, 'ts');
  });
});

describe('POST /events: size limit', () => {
  const padded = (chars, ch = 'x') => ({ deviceId: 'd_1', events: [makeEvent(1, { payload: { ...makeEvent(1).payload, note: ch.repeat(chars) } })] });

  test('a body over 256 KB is a 413 before any parsing or S3 call', async () => {
    const { call, store } = setup();
    const res = await call(makeRequest({ body: padded(MAX_BODY_BYTES) }));
    assert.equal(res.statusCode, 413);
    assert.equal(res.json.error, 'too_large');
    assert.equal(store.log.length, 0);
  });

  test('the limit counts bytes, not characters', async () => {
    const { call } = setup();
    const body = padded(150_000, 'é'); // 150k characters, 300k bytes
    assert.ok(JSON.stringify(body).length < MAX_BODY_BYTES);
    assert.equal((await call(makeRequest({ body }))).statusCode, 413);
  });

  test('base64 bodies are measured after decoding', async () => {
    const { call } = setup();
    const res = await call(makeRequest({ body: padded(MAX_BODY_BYTES), base64: true }));
    assert.equal(res.statusCode, 413);
  });

  test('a base64 body under the limit is decoded and accepted', async () => {
    const { call } = setup();
    const res = await call(post([makeEvent(1)], { base64: true }));
    assert.equal(res.statusCode, 200);
  });
});

describe('POST /events: concurrent writers', () => {
  test('412: another device wrote first; we re-read and append on top without losing its event', async () => {
    const { call, store, sleeps } = setup();
    const theirs = makeEvent(99);
    let interfered = false;
    store.seed(monthKey('2026-10'), stored([makeEvent(50)], 'x'));
    store.beforePut = async (key) => {
      if (interfered) return;
      interfered = true;
      // The other device's write lands between our GET and our PUT.
      store.seed(key, [...store.json(key), { ...theirs, recvAt: 'x' }]);
    };
    const res = await call(post([makeEvent(1)]));
    assert.deepEqual(res.json, { accepted: 1, duplicates: 0 });
    assert.deepEqual(store.rejected, [412]);
    assert.deepEqual(ids(store.json(monthKey('2026-10'))), [ulid(50), theirs.id, ulid(1)]);
    assert.equal(sleeps.length, 1, 'one short delay before the retry');
    assert.ok(sleeps[0] >= 25 && sleeps[0] < 100);
  });

  test('412 while creating: the other device created the file first, so we retry with If-Match', async () => {
    const { call, store } = setup();
    let interfered = false;
    store.beforePut = async (key) => {
      if (interfered) return;
      interfered = true;
      store.seed(key, stored([makeEvent(99)], 'x'));
    };
    const res = await call(post([makeEvent(1)]));
    assert.equal(res.statusCode, 200);
    const puts = store.calls('put');
    assert.deepEqual(puts[0].cond, { ifNoneMatch: '*' });
    assert.ok(puts[1].cond.ifMatch);
    assert.deepEqual(ids(store.json(monthKey('2026-10'))), [ulid(99), ulid(1)]);
  });

  test('409: a write in flight; retried until it succeeds', async () => {
    const { call, store } = setup();
    store.failPuts(monthKey('2026-10'), 409, 2);
    const res = await call(post([makeEvent(1)]));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(store.rejected, [409, 409]);
    assert.equal(store.json(monthKey('2026-10')).length, 1);
  });

  test('404 on If-Match (file vanished) is retried too', async () => {
    const { call, store } = setup();
    store.failPuts(monthKey('2026-10'), 404, 1);
    assert.equal((await call(post([makeEvent(1)]))).statusCode, 200);
  });

  test('two simultaneous requests both land exactly once', async () => {
    const { call, store } = setup();
    store.seed(monthKey('2026-10'), stored([makeEvent(50)], 'x'));
    const [a, b] = await Promise.all([call(post([makeEvent(1)])), call(post([makeEvent(2)]))]);
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);
    assert.ok(store.rejected.includes(409), 'the overlapping write was refused with 409');
    assert.deepEqual(ids(store.json(monthKey('2026-10'))).sort(), [ulid(1), ulid(2), ulid(50)]);
  });

  test('many simultaneous requests: no lost updates, no duplicates', async () => {
    const { call, store } = setup();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => call(post([makeEvent(i + 1)]))));
    // With 6 writers on one file some may run out of retries; those return 503 and must not have written.
    const okIds = results.flatMap((r, i) => (r.statusCode === 200 ? [ulid(i + 1)] : []));
    assert.ok(results.every((r) => r.statusCode === 200 || r.statusCode === 503));
    assert.deepEqual(ids(store.json(monthKey('2026-10'))).sort(), okIds.sort());
  });

  test('after 5 retries the request gets 503 with Retry-After and nothing is written', async () => {
    const { call, store, sleeps } = setup();
    store.failPuts(monthKey('2026-10'), 412, 100);
    const res = await call(post([makeEvent(1)]));
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['retry-after'], '1');
    assert.equal(res.json.error, 'busy');
    assert.equal(store.calls('put').length, 6, 'first try plus 5 retries');
    assert.equal(sleeps.length, 5);
    assert.equal(store.objects.size, 0);
  });

  test('a retry after 503 succeeds and the earlier failed attempt left no trace', async () => {
    const { call, store } = setup();
    store.failPuts(monthKey('2026-10'), 412, 6);
    assert.equal((await call(post([makeEvent(1)]))).statusCode, 503);
    assert.equal((await call(post([makeEvent(1)]))).statusCode, 200);
    assert.equal(store.json(monthKey('2026-10')).length, 1);
  });

  test('an unexpected storage error is a 500 that does not leak details', async () => {
    const { call, store } = setup();
    store.put = async () => {
      throw new Error('AccessDenied: arn:aws:s3:::secret-bucket');
    };
    const orig = console.error;
    console.error = () => {};
    try {
      const res = await call(post([makeEvent(1)]));
      assert.equal(res.statusCode, 500);
      assert.ok(!res.body.includes('secret-bucket'));
    } finally {
      console.error = orig;
    }
  });
});

describe('access control', () => {
  test('empty OWNER_SUB fails closed: 403 on both endpoints, and S3 is never touched', async () => {
    const { call, store } = setup({ ownerSub: '' });
    assert.equal((await call(post([makeEvent(1)]))).statusCode, 403);
    assert.equal((await call(get())).statusCode, 403);
    assert.equal(store.log.length, 0);
  });

  test('unset OWNER_SUB fails closed too', async () => {
    const { call } = setup({ ownerSub: null });
    assert.equal((await call(post([makeEvent(1)]))).statusCode, 403);
  });

  test('a token whose sub is not the owner gets 403', async () => {
    const { call, store } = setup();
    const other = 'ffffffff-0000-4000-8000-000000000009';
    assert.equal((await call(post([makeEvent(1)], { sub: other }))).statusCode, 403);
    assert.equal((await call(get(undefined, { sub: other }))).statusCode, 403);
    assert.equal(store.log.length, 0);
  });

  test('no sub claim at all is a 401', async () => {
    const { call } = setup();
    assert.equal((await call(post([makeEvent(1)], { sub: null }))).statusCode, 401);
    assert.equal((await call(get(undefined, { sub: '' }))).statusCode, 401);
  });

  test('an owner sub that is not a safe key segment is refused', async () => {
    const evil = '../other';
    const { call, store } = setup({ ownerSub: evil });
    assert.equal((await call(post([makeEvent(1)], { sub: evil }))).statusCode, 403);
    assert.equal(store.log.length, 0);
  });

  test('unknown routes are 404', async () => {
    const { call } = setup();
    assert.equal((await call(makeRequest({ method: 'DELETE' }))).statusCode, 404);
    assert.equal((await call(get(undefined, { path: '/other' }))).statusCode, 404);
  });
});

describe('GET /events: cursor and reads', () => {
  test('no since: everything in month order, cursor just past the last event', async () => {
    const { call, store } = setup();
    store.seed(monthKey('2026-09'), stored(range(1, 3), 'a'));
    store.seed(monthKey('2026-10'), stored(range(4, 5), 'b'));
    const res = await call(get());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(ids(res.json.events), range(1, 5).map((e) => e.id));
    assert.equal(res.json.cursor, '2026-10:2');
    assert.equal(res.json.more, false);
    assert.equal(res.json.events[0].recvAt, 'a', 'events are returned as stored, with recvAt');
  });

  test('empty store: no events, null cursor', async () => {
    const { call } = setup();
    const res = await call(get());
    assert.deepEqual(res.json, { events: [], cursor: null, more: false });
  });

  test('a cursor returns only what follows it, in this month and later months', async () => {
    const { call, store } = setup();
    store.seed(monthKey('2026-09'), stored(range(1, 3), 'a'));
    store.seed(monthKey('2026-10'), stored(range(4, 6), 'b'));
    const res = await call(get({ since: '2026-09:2' }));
    assert.deepEqual(ids(res.json.events), range(3, 6).map((e) => e.id));
    assert.equal(res.json.cursor, '2026-10:3');
  });

  test('nothing new: empty events and the same cursor', async () => {
    const { call, store } = setup();
    store.seed(monthKey('2026-10'), stored(range(1, 3), 'a'));
    const res = await call(get({ since: '2026-10:3' }));
    assert.deepEqual(res.json, { events: [], cursor: '2026-10:3', more: false });
  });

  test('a cursor at the end of an older month picks up the first event of the next month', async () => {
    const { call, store, clock } = setup();
    store.seed(monthKey('2026-09'), stored(range(1, 3), 'a'));
    assert.deepEqual((await call(get({ since: '2026-09:3' }))).json.events, []);
    clock.now = Date.parse('2026-10-01T00:00:05.000Z');
    const first = await call(post([makeEvent(4, { ts: '2026-10-01T00:00:04.000Z-0001-d_7f3a' })]));
    assert.equal(first.statusCode, 200);
    const res = await call(get({ since: '2026-09:3' }));
    assert.deepEqual(ids(res.json.events), [ulid(4)]);
    assert.equal(res.json.cursor, '2026-10:1');
  });

  test('only files at or after the cursor month are read', async () => {
    const { call, store } = setup();
    store.seed(monthKey('2026-08'), stored(range(1, 2), 'a'));
    store.seed(monthKey('2026-09'), stored(range(3, 4), 'a'));
    store.seed(monthKey('2026-10'), stored(range(5, 6), 'b'));
    await call(get({ since: '2026-09:1' }));
    assert.deepEqual(
      store.calls('get').map((c) => c.key),
      [monthKey('2026-09'), monthKey('2026-10')],
    );
  });

  test('other users\' data and stray keys are never returned', async () => {
    const { call, store } = setup();
    store.seed(monthKey('2026-10'), stored(range(1, 1), 'a'));
    store.seed(monthKey('2026-10', 'someone-else'), stored(range(2, 2), 'a'));
    store.seed(`u/${OWNER}/events/notes.txt`, 'x');
    store.seed(`u/${OWNER}/events/2026-13.json`, '[]');
    assert.deepEqual(ids((await call(get())).json.events), [ulid(1)]);
  });

  test('bad query parameters are 400s', async () => {
    const { call } = setup();
    for (const since of ['garbage', '2026-13:1', '2026-10', '2026-10:-1', '2026-10:1;drop']) {
      assert.equal((await call(get({ since }))).json.error, 'bad_cursor', since);
    }
    for (const limit of ['0', '-5', 'abc', '1.5', '']) {
      assert.equal((await call(get({ limit }))).json.error, 'bad_limit', limit);
    }
  });
});

describe('GET /events: limit', () => {
  test('defaults to 2,000 and reports more', async () => {
    const { call, store } = setup();
    store.seed(monthKey('2026-10'), stored(range(1, 2005), 'a'));
    const res = await call(get());
    assert.equal(res.json.events.length, 2000);
    assert.equal(res.json.more, true);
    assert.equal(res.json.cursor, '2026-10:2000');
  });

  test('is capped at 5,000', async () => {
    const { call, store } = setup();
    store.seed(monthKey('2026-10'), stored(range(1, 5005), 'a'));
    const res = await call(get({ limit: '99999' }));
    assert.equal(res.json.events.length, 5000);
    assert.equal(res.json.more, true);
  });

  test('a page that ends exactly at the end of the data says more=false', async () => {
    const { call, store } = setup();
    store.seed(monthKey('2026-10'), stored(range(1, 4), 'a'));
    const res = await call(get({ limit: '4' }));
    assert.equal(res.json.more, false);
    assert.equal(res.json.cursor, '2026-10:4');
  });
});

describe('GET /events: pagination across file boundaries', () => {
  function seedThreeMonths(store) {
    store.seed(monthKey('2026-08'), stored(range(1, 5), 'a'));
    store.seed(monthKey('2026-09'), stored(range(6, 12), 'b'));
    store.seed(monthKey('2026-10'), stored(range(13, 15), 'c'));
    return range(1, 15).map((e) => e.id);
  }

  test('every page size from 1 to 20 returns each event exactly once, in order', async () => {
    for (let limit = 1; limit <= 20; limit++) {
      const { call, store } = setup();
      const expected = seedThreeMonths(store);
      const { all, cursor } = await readAll(call, { limit });
      assert.deepEqual(ids(all), expected, `limit ${limit}`);
      assert.equal(cursor, '2026-10:3', `limit ${limit}`);
    }
  });

  test('pages that end on a file boundary carry on into the next file', async () => {
    const { call, store } = setup();
    seedThreeMonths(store);
    const p1 = (await call(get({ limit: '5' }))).json; // exactly all of August
    assert.deepEqual([p1.cursor, p1.more, p1.events.length], ['2026-08:5', true, 5]);
    const p2 = (await call(get({ since: p1.cursor, limit: '5' }))).json;
    assert.deepEqual(ids(p2.events), range(6, 10).map((e) => e.id));
    assert.deepEqual([p2.cursor, p2.more], ['2026-09:5', true]);
    const p3 = (await call(get({ since: p2.cursor, limit: '5' }))).json;
    assert.deepEqual(ids(p3.events), range(11, 15).map((e) => e.id));
    assert.deepEqual([p3.cursor, p3.more], ['2026-10:3', false]);
  });

  test('a page spanning two files continues mid-file on the next call', async () => {
    const { call, store } = setup();
    seedThreeMonths(store);
    const p1 = (await call(get({ limit: '8' }))).json;
    assert.deepEqual(ids(p1.events), range(1, 8).map((e) => e.id));
    assert.equal(p1.cursor, '2026-09:3');
    const p2 = (await call(get({ since: p1.cursor, limit: '8' }))).json;
    assert.deepEqual(ids(p2.events), range(9, 15).map((e) => e.id));
    assert.equal(p2.more, false);
  });

  test('events appended while paging show up at the end, with no repeats', async () => {
    const { call, store } = setup();
    const expected = seedThreeMonths(store);
    const p1 = (await call(get({ limit: '10' }))).json;
    await call(post([makeEvent(16), makeEvent(17)])); // lands in 2026-10 (clock is in October)
    const rest = await readAll(call, { since: p1.cursor, limit: 4 });
    assert.deepEqual(ids([...p1.events, ...rest.all]), [...expected, ulid(16), ulid(17)]);
  });
});

describe('late events reach devices with a later cursor', () => {
  test('a September workout uploaded in October is found by a device already at the end of September', async () => {
    const { call, store, clock } = setup();
    // September: device B (the desktop) has synced everything so far.
    clock.now = Date.parse('2026-09-30T20:00:00.000Z');
    await call(post([makeEvent(1, { ts: '2026-09-30T19:00:00.000Z-0001-d_desk' })]));
    const b1 = (await call(get())).json;
    assert.equal(b1.cursor, '2026-09:1');

    // Device A did a workout offline on Sept 28 and only uploads it on Oct 5.
    clock.now = NOW;
    const late = makeEvent(2, { ts: '2026-09-28T18:00:00.000Z-0007-d_phone' });
    await call(post([late]));
    assert.deepEqual(ids(store.json(monthKey('2026-10'))), [late.id], 'stored by receive month');

    const b2 = (await call(get({ since: b1.cursor }))).json;
    assert.deepEqual(ids(b2.events), [late.id]);
    assert.equal(b2.events[0].ts, '2026-09-28T18:00:00.000Z-0007-d_phone', 'ts is kept for replay ordering');
    assert.equal(b2.cursor, '2026-10:1');
  });

  test('a device whose cursor is already inside October gets the late event at its position', async () => {
    const { call } = setup();
    await call(post([makeEvent(1), makeEvent(2)]));
    const c = (await call(get())).json.cursor;
    assert.equal(c, '2026-10:2');

    const late = makeEvent(3, { ts: '2026-09-20T09:00:00.000Z-0001-d_phone' });
    await call(post([late]));
    const res = (await call(get({ since: c }))).json;
    assert.deepEqual(ids(res.events), [late.id]);
    assert.equal(res.cursor, '2026-10:3');
  });

  test('a device at a September cursor keeps getting new events after the month rolls over', async () => {
    const { call, clock } = setup();
    const at = (n, iso) => makeEvent(n, { ts: `${iso}-0001-d_7f3a` });
    clock.now = Date.parse('2026-09-30T23:59:00.000Z');
    assert.equal((await call(post([at(1, '2026-09-30T23:58:00.000Z')]))).statusCode, 200);
    const c = (await call(get())).json.cursor;
    clock.now = Date.parse('2026-10-01T00:01:00.000Z');
    assert.equal((await call(post([at(2, '2026-10-01T00:00:30.000Z')]))).statusCode, 200);
    clock.now = Date.parse('2026-11-01T00:01:00.000Z');
    assert.equal((await call(post([at(3, '2026-11-01T00:00:30.000Z')]))).statusCode, 200);
    const res = await readAll(call, { since: c, limit: 1 });
    assert.deepEqual(ids(res.all), [ulid(2), ulid(3)]);
  });
});

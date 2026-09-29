// Two (or three) devices and one server: the real Lambda handler over a fake S3, and the real app store,
// outbox and sync over in-memory storage. Covers the Phase B done-when: an event written on one device
// appears on another, and devices that have seen the same events agree, whatever order they arrived in.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../app/js/store/api.js';
import { createClock } from '../app/js/ids.js';
import { compareTs } from '../app/js/time.js';
import { replay } from '../app/js/store/replay.js';
import { attachSyncTriggers, isRetryable } from '../app/js/store/sync.js';
import { AuthError } from '../app/js/store/auth.js';
import { at, connect, createDevice, createServer, eventIds, monthKey, settle } from '../test-support/harness.mjs';

const startPayload = (extra = {}) => ({
  templateCode: 'A', startedAt: '2026-09-29T12:00:00.000-07:00', programWeek: 1, phase: 1, isDeload: false, ...extra,
});
const setPayload = (sessionId, extra = {}) => ({
  sessionId, exerciseId: 'goblet-squat', setNumber: 1, isRampUp: false, isCalibration: false, weightLbs: 25, reps: 10, ...extra,
});
const setting = (device, key, value) => device.events.append('setting.changed', 'settings', { key, value });

// The two devices agree on everything a screen could show.
function assertConverged(...devices) {
  const [first, ...rest] = devices;
  for (const d of rest) {
    assert.deepEqual(eventIds(d), eventIds(first), `${d.name} holds the same events as ${first.name}`);
    assert.deepEqual(d.events.state, first.events.state, `${d.name} has the same state as ${first.name}`);
    assert.equal(d.events.pendingCount(), 0, `${d.name} has nothing left to send`);
  }
  assert.equal(first.events.pendingCount(), 0);
}

// A session with two sets, written on `device` at 12:00 PDT and synced, so every device has it.
async function seedSession(server, ...devices) {
  const [a] = devices;
  a.at('2026-09-29T12:00:00-07:00');
  await a.events.append('session.started', 'sess_1', startPayload());
  a.at('2026-09-29T12:01:00-07:00');
  await a.events.append('set.logged', 's_1', setPayload('sess_1', { setNumber: 1 }));
  a.at('2026-09-29T12:02:00-07:00');
  await a.events.append('set.logged', 's_2', setPayload('sess_1', { setNumber: 2, reps: 9 }));
  await settle(...devices);
}

describe('an event written on one device appears on another', () => {
  test('locally first, then the server, then the other device', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');

    await a.events.append('session.started', 'sess_1', startPayload());
    const set = await a.events.append('set.logged', 's_1', setPayload('sess_1'));
    assert.equal(a.events.state.sets.s_1.reps, 10, 'visible on A at once, before any network');
    assert.equal(a.events.pendingCount(), 2);
    assert.deepEqual(b.events.state.sessions, {}, 'B knows nothing yet');

    await a.sync.sync();
    assert.equal(a.events.pendingCount(), 0);
    assert.equal(server.store.json(monthKey('2026-10')).length, 2);

    await b.sync.sync();
    assert.deepEqual(b.events.state.sets.s_1, a.events.state.sets.s_1);
    assert.equal(b.events.pendingCount(), 0, 'B did not send back what it received');
    const onB = b.events.events().find((e) => e.id === set.id);
    assert.equal(onB.ts, set.ts);
    assert.equal(onB.recvAt, '2026-10-05T05:00:00.000-07:00', 'stamped by the server, in Pacific time');
    assert.equal(b.events.cursor(), '2026-10:2');
  });

  test('A gets the server stamp on its own events when it syncs again', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const ev = await a.events.append('session.notes', 'sess_1', { notes: 'x' });
    assert.equal(a.events.events()[0].recvAt, undefined);
    await a.sync.sync();
    assert.equal(a.events.events().find((e) => e.id === ev.id).recvAt, '2026-10-05T05:00:00.000-07:00');
    assert.equal(a.events.eventCount(), 1);
  });

  test('a device that joins later receives everything', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    await seedSession(server, a);
    const late = await createDevice(server, 'late');
    await late.sync.sync();
    assertConverged(a, late);
    assert.deepEqual(Object.keys(late.events.state.sets).sort(), ['s_1', 's_2']);
  });

  test('a test note from the spike is stored and synced but never becomes a session', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');
    await a.events.append('session.notes', 'spike_01J9Z0', { notes: 'Spike test from d_a' });
    await settle(a, b);
    assert.equal(b.events.eventCount(), 1);
    assert.deepEqual(b.events.state.sessions, {});
    assert.deepEqual(b.events.state.skipped, []);
  });
});

describe('out-of-order arrival', () => {
  test('events that reach the server later but happened earlier are ordered by ts, not by arrival', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');

    // A is offline at the gym and logs a workout, including a setting change at 12:00.
    a.api.down = true;
    a.at('2026-09-29T12:00:00-07:00');
    await setting(a, 'restTimerDefaultSec', 90);
    await a.events.append('session.started', 'sess_1', startPayload());
    a.at('2026-09-29T12:05:00-07:00');
    await a.events.append('set.logged', 's_1', setPayload('sess_1'));
    a.at('2026-09-29T12:10:00-07:00');
    await a.events.append('session.finished', 'sess_1', { finishedAt: '2026-09-29T12:10:00.000-07:00' });
    await assert.rejects(a.sync.sync(), (e) => e instanceof ApiError && e.status === 0);
    assert.equal(a.events.pendingCount(), 4, 'nothing lost while offline');

    // B, online, changes the same setting at 12:20 and syncs first.
    b.at('2026-09-29T12:20:00-07:00');
    await setting(b, 'restTimerDefaultSec', 120);
    await b.sync.sync();

    // A regains signal at 12:30.
    a.api.down = false;
    a.at('2026-09-29T12:30:00-07:00');
    await settle(a, b);

    const file = server.store.json(monthKey('2026-10'));
    assert.equal(file[0].payload.value, 120, "B's event is first in the log");
    assert.deepEqual(file.slice(1).map((e) => e.type), ['setting.changed', 'session.started', 'set.logged', 'session.finished']);
    assert.equal(file[1].payload.value, 90, "A's older event arrived after it");

    assertConverged(a, b);
    assert.equal(b.events.state.settings.restTimerDefaultSec, 120, 'the later ts wins, not the later arrival');
    assert.equal(b.events.state.sessions.sess_1.finishedAt, '2026-09-29T12:10:00.000-07:00');
    assert.equal(b.events.state.sets.s_1.reps, 10);
  });

  test('pages of one event each, arriving in server order, converge to the same state', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b', { pageLimit: 1 });
    await seedSession(server, a);
    a.at('2026-09-29T12:10:00-07:00');
    await a.events.append('set.edited', 's_1', { reps: 12 });
    await a.sync.sync();
    await b.sync.sync();
    assert.equal(b.api.calls.filter((c) => c.method === 'GET').length, 4, 'four events, one per page');
    assertConverged(a, b);
    assert.equal(b.events.state.sets.s_1.reps, 12);
  });

  test('a patch stored on the server before the event it patches is held until that event arrives', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const raw = connect(server);
    const set = { id: '01J9Z0000000000000000000A1', ts: '2026-09-29T12:01:00.000-07:00-0000-d_x', v: 1, type: 'set.logged', entityId: 's_1', payload: setPayload('sess_1') };
    const session = { id: '01J9Z0000000000000000000A0', ts: '2026-09-29T12:00:00.000-07:00-0000-d_x', v: 1, type: 'session.started', entityId: 'sess_1', payload: startPayload() };
    const edit = { id: '01J9Z0000000000000000000A2', ts: '2026-09-29T12:02:00.000-07:00-0000-d_y', v: 1, type: 'set.edited', entityId: 's_1', payload: { reps: 14 } };
    await raw.postEvents('d_y', [edit]);
    await a.sync.sync();
    assert.deepEqual(a.events.state.sets, {}, 'nothing to attach the edit to yet');
    await raw.postEvents('d_x', [session, set]);
    await a.sync.sync();
    assert.equal(a.events.state.sets.s_1.reps, 14);
  });
});

describe('late events', () => {
  test('a workout written in September and uploaded in October reaches a device that is already up to date', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');

    // Sept 30, 21:00 PDT: B writes a setting and syncs. Its cursor now points into September's file.
    server.clock.now = at('2026-10-01T04:00:00Z');
    b.at('2026-09-30T21:00:00-07:00');
    await setting(b, 'restTimerDefaultSec', 100);
    await b.sync.sync();
    assert.equal(b.events.cursor(), '2026-09:1');

    // A's workout was logged at 18:00 with no signal, and uploads three days later.
    a.api.down = true;
    a.at('2026-09-30T18:00:00-07:00');
    await a.events.append('session.started', 'sess_1', startPayload({ startedAt: '2026-09-30T18:00:00.000-07:00' }));
    a.at('2026-09-30T18:05:00-07:00');
    await a.events.append('set.logged', 's_1', setPayload('sess_1'));
    a.at('2026-09-30T18:40:00-07:00');
    await a.events.append('session.finished', 'sess_1', { finishedAt: '2026-09-30T18:40:00.000-07:00' });
    await assert.rejects(a.sync.sync());

    server.clock.now = at('2026-10-03T19:00:00Z');
    a.api.down = false;
    a.at('2026-10-03T12:00:00-07:00');
    await a.sync.sync();
    assert.equal(server.store.json(monthKey('2026-09')).length, 1, "September's file did not change");
    assert.equal(server.store.json(monthKey('2026-10')).length, 3, 'the late events are in the month they were received');

    await b.sync.sync();
    assert.equal(b.events.cursor(), '2026-10:3');
    assert.equal(b.events.state.sessions.sess_1.finishedAt, '2026-09-30T18:40:00.000-07:00');
    assertConverged(a, b);
  });

  test('the month a late event lands in follows Pacific midnight, not UTC', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    // 2026-10-01T05:30Z is still September 30 in Pacific time (22:30 PDT).
    server.clock.now = at('2026-10-01T05:30:00Z');
    a.at('2026-09-30T22:30:00-07:00');
    await a.events.append('session.notes', 'sess_1', { notes: 'x' });
    await a.sync.sync();
    assert.equal(server.store.json(monthKey('2026-09')).length, 1);
    assert.equal(server.store.json(monthKey('2026-10')), undefined);
  });
});

describe('duplicates: the client de-duplicates by event id', () => {
  test('a reply lost after the server stored the batch: the retry finds the event already there and does not add it twice', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');
    await a.events.append('session.started', 'sess_1', startPayload());
    a.api.dropAck = 1;
    a.api.failGets = true; // and the pull fails too, so A cannot see its own event come back
    await assert.rejects(a.sync.sync());
    assert.equal(a.events.pendingCount(), 1, 'A does not know it was stored');
    assert.equal(server.store.json(monthKey('2026-10')).length, 1);

    a.api.failGets = false;
    const result = await a.sync.sync();
    assert.deepEqual([result.pushed.sent, result.pushed.duplicates], [0, 1], 'the server counted it as a duplicate');
    assert.equal(a.events.pendingCount(), 0);
    assert.equal(server.store.json(monthKey('2026-10')).length, 1, 'still one copy on the server');
    await b.sync.sync();
    assertConverged(a, b);
    assert.equal(b.events.eventCount(), 1);
  });

  test('if the pull works, a lost reply resolves itself: the event comes back and leaves the outbox', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    await a.events.append('session.started', 'sess_1', startPayload());
    a.api.dropAck = 1;
    await assert.rejects(a.sync.sync()); // the push failed, but the pull in the same sync fetched the event
    assert.equal(a.events.pendingCount(), 0);
    assert.equal(a.events.eventCount(), 1);
    const before = a.api.calls.filter((c) => c.method === 'POST').length;
    await a.sync.sync();
    assert.equal(a.api.calls.filter((c) => c.method === 'POST').length, before, 'nothing left to send');
  });

  test('the known server gap: a retry that crosses Pacific midnight on the 1st is stored twice, and both copies are one event here', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    server.clock.now = at('2026-10-01T06:59:59Z'); // 23:59:59 PDT on Sept 30
    a.at('2026-09-30T23:59:58-07:00');
    await a.events.append('session.started', 'sess_1', startPayload({ startedAt: '2026-09-30T23:59:58.000-07:00' }));
    const set = await a.events.append('set.logged', 's_1', setPayload('sess_1'));
    a.api.dropAck = 1;
    a.api.failGets = true;
    await assert.rejects(a.sync.sync());
    assert.equal(server.store.json(monthKey('2026-09')).length, 2);

    server.clock.now = at('2026-10-01T07:00:05Z'); // 00:00:05 PDT on Oct 1
    a.api.failGets = false;
    await a.sync.sync();
    const sept = server.store.json(monthKey('2026-09')).map((e) => e.id);
    const oct = server.store.json(monthKey('2026-10')).map((e) => e.id);
    assert.deepEqual(sept, oct, 'the server holds each event twice (DEPLOYMENT-PLAN.md section 13)');

    assert.equal(a.events.eventCount(), 2, 'the client holds each once');
    assert.equal(Object.keys(a.events.state.sets).length, 1);
    const fresh = await createDevice(server, 'fresh');
    await fresh.sync.sync();
    assert.equal(fresh.events.eventCount(), 2);
    assert.equal(fresh.events.state.sets.s_1.reps, set.payload.reps);
    assert.equal(fresh.events.events().find((e) => e.id === set.id).recvAt, '2026-09-30T23:59:59.000-07:00', 'the first copy is the one kept');
  });
});

describe('deleted entities', () => {
  for (const order of ['ab', 'ba']) {
    test(`a set deleted on A and edited later on B is gone on both, whoever syncs first (${order})`, async () => {
      const server = createServer();
      const a = await createDevice(server, 'a');
      const b = await createDevice(server, 'b');
      await seedSession(server, a, b);

      a.api.down = b.api.down = true;
      a.at('2026-09-29T12:10:00-07:00');
      await a.events.append('entity.deleted', 's_1', { entityType: 'set' });
      b.at('2026-09-29T12:20:00-07:00'); // later than the delete, so the edit "wins" if tombstones were ordinary patches
      await b.events.append('set.edited', 's_1', { reps: 15 });
      a.api.down = b.api.down = false;

      const [first, second] = order === 'ab' ? [a, b] : [b, a];
      await first.sync.sync();
      await second.sync.sync();
      await settle(a, b);
      assertConverged(a, b);
      assert.deepEqual(Object.keys(a.events.state.sets), ['s_2']);
    });
  }

  test('a session deleted on A takes its sets with it, including one B logs afterwards', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');
    await seedSession(server, a, b);
    a.api.down = b.api.down = true;
    a.at('2026-09-29T12:10:00-07:00');
    await a.events.append('entity.deleted', 'sess_1', { entityType: 'session' });
    b.at('2026-09-29T12:20:00-07:00');
    await b.events.append('set.logged', 's_3', setPayload('sess_1', { setNumber: 3 }));
    a.api.down = b.api.down = false;
    await settle(a, b);
    assertConverged(a, b);
    assert.deepEqual([a.events.state.sessions, a.events.state.sets], [{}, {}]);
  });

  test('a tombstone is kept in the log: another device that syncs later never sees the entity', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    await seedSession(server, a);
    a.at('2026-09-29T12:10:00-07:00');
    await a.events.append('entity.deleted', 's_2', { entityType: 'set' });
    await a.sync.sync();
    const late = await createDevice(server, 'late');
    await late.sync.sync();
    assert.deepEqual(Object.keys(late.events.state.sets), ['s_1']);
    assert.equal(late.events.eventCount(), 4, 'the log itself is append-only; state hides the deleted set');
  });
});

describe('per-field patches', () => {
  test('edits to different fields of one set, made offline on two devices, both survive', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');
    await seedSession(server, a, b);
    a.api.down = b.api.down = true;
    a.at('2026-09-29T12:10:00-07:00');
    await a.events.append('set.edited', 's_1', { reps: 12 });
    b.at('2026-09-29T12:11:00-07:00');
    await b.events.append('set.edited', 's_1', { weightLbs: 30 });
    a.at('2026-09-29T12:12:00-07:00');
    await a.events.append('session.finished', 'sess_1', { finishedAt: '2026-09-29T12:12:00.000-07:00', backPainAfter: 2 });
    b.at('2026-09-29T12:13:00-07:00');
    await b.events.append('session.notes', 'sess_1', { notes: 'left hip tight' });
    a.api.down = b.api.down = false;
    await settle(a, b);
    assertConverged(a, b);
    const { sets, sessions } = a.events.state;
    assert.deepEqual([sets.s_1.reps, sets.s_1.weightLbs], [12, 30]);
    assert.deepEqual(
      [sessions.sess_1.finishedAt, sessions.sess_1.backPainAfter, sessions.sess_1.notes, sessions.sess_1.templateCode],
      ['2026-09-29T12:12:00.000-07:00', 2, 'left hip tight', 'A'],
    );
  });

  for (const syncFirst of ['a', 'b']) {
    test(`two edits to the same field: the later ts wins whichever device syncs last (${syncFirst} first)`, async () => {
      const server = createServer();
      const a = await createDevice(server, 'a');
      const b = await createDevice(server, 'b');
      await seedSession(server, a, b);
      a.api.down = b.api.down = true;
      a.at('2026-09-29T12:20:00-07:00');
      await a.events.append('set.edited', 's_1', { reps: 11 });
      b.at('2026-09-29T12:25:00-07:00');
      await b.events.append('set.edited', 's_1', { reps: 13 });
      a.api.down = b.api.down = false;
      for (const d of syncFirst === 'a' ? [a, b] : [b, a]) await d.sync.sync();
      await settle(a, b);
      assertConverged(a, b);
      assert.equal(a.events.state.sets.s_1.reps, 13);
    });
  }

  test('null clears a field on every device', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');
    await seedSession(server, a, b);
    b.at('2026-09-29T12:10:00-07:00');
    await b.events.append('set.edited', 's_1', { weightLbs: null });
    await settle(a, b);
    assert.equal(a.events.state.sets.s_1.weightLbs, null);
    assert.equal(a.events.state.sets.s_1.reps, 10);
  });
});

describe('clock skew', () => {
  // A logs a set and edits it at 12:05. B's wall clock runs slow: it reads 11:56 when it edits again.
  async function scenario(bClock) {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b', { clock: bClock });
    await seedSession(server, a, b);
    a.at('2026-09-29T12:05:00-07:00');
    const first = await a.events.append('set.edited', 's_1', { reps: 12 });
    await a.sync.sync();
    await b.sync.sync(); // B reads A's edit
    b.at('2026-09-29T11:56:00-07:00');
    const second = await b.events.append('set.edited', 's_1', { reps: 13 });
    await settle(a, b);
    assertConverged(a, b);
    return { first, second, reps: a.events.state.sets.s_1.reps };
  }

  test('an edit made after reading another device\'s edit sorts after it, even on a slow clock', async () => {
    const { first, second, reps } = await scenario(undefined);
    assert.equal(compareTs(first.ts, second.ts), -1);
    assert.equal(reps, 13, "B's edit was made later, so it wins");
  });

  test('without observing remote ts (what the plain wall clock would do) the slow device loses', async () => {
    const naive = createClock();
    const { first, second, reps } = await scenario({ next: naive.next, observe() {} });
    assert.equal(compareTs(second.ts, first.ts), -1, "B's newer edit got an older ts");
    assert.equal(reps, 12, 'and lost');
  });

  test('after a restart the clock is still ahead of everything in the log', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    a.at('2026-09-29T12:00:00-07:00');
    const before = await a.events.append('session.notes', 'sess_1', { notes: 'x' });
    a.at('2026-09-29T11:00:00-07:00'); // the wall clock stepped back an hour
    const restarted = await createDevice(server, 'a', { storage: a.storage, wall: at('2026-09-29T18:00:00Z') });
    const after = await restarted.events.append('session.notes', 'sess_1', { notes: 'y' });
    assert.equal(compareTs(before.ts, after.ts), -1);
  });
});

describe('daylight saving', () => {
  test('across the fall-back hour the later instant wins even though its string sorts earlier', async () => {
    const server = createServer({ now: at('2026-11-01T10:00:00Z') });
    const a = await createDevice(server, 'a', { wall: at('2026-11-01T08:30:00Z') }); // 01:30 PDT
    const b = await createDevice(server, 'b', { wall: at('2026-11-01T09:15:00Z') }); // 01:15 PST, 45 minutes later
    const first = await setting(a, 'restTimerDefaultSec', 60);
    const second = await setting(b, 'restTimerDefaultSec', 75);
    assert.match(first.ts, /^2026-11-01T01:30:00\.000-07:00-/);
    assert.match(second.ts, /^2026-11-01T01:15:00\.000-08:00-/);
    assert.ok(second.ts < first.ts, 'plain string order says the opposite');
    await settle(a, b);
    assertConverged(a, b);
    assert.equal(a.events.state.settings.restTimerDefaultSec, 75);
  });
});

describe('events the server refuses', () => {
  test('one invalid event is set aside; the others still upload, and other devices never see it', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');
    await a.events.append('session.started', 'sess_1', startPayload());
    const bad = await a.events.append('set.logged', 's_1', setPayload('sess_1', { weightLbs: 5000 }));
    await a.events.append('set.logged', 's_2', setPayload('sess_1', { setNumber: 2 }));

    const result = await a.sync.sync();
    assert.deepEqual(result.pushed, { sent: 2, duplicates: 0, rejected: 1, rttMs: 1 });
    assert.equal(a.events.pendingCount(), 0);
    const [rejected] = a.events.rejected();
    assert.equal(rejected.id, bad.id);
    assert.match(rejected.reason, /payload\.weightLbs must be between 0 and 1000/);
    assert.deepEqual(rejected.event, bad, 'kept whole, so nothing is lost');
    assert.deepEqual(Object.keys(a.events.state.sets), ['s_2'], 'and it no longer affects state');

    await b.sync.sync();
    assertConverged(a, b);
  });

  test('a rejection survives a restart', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    await a.events.append('session.started', 'sess_1', startPayload());
    await a.events.append('set.logged', 's_1', setPayload('sess_1', { reps: 9999 }));
    await a.sync.sync();
    const again = await createDevice(server, 'a', { storage: a.storage });
    assert.equal(again.events.rejected().length, 1);
    assert.equal(again.events.pendingCount(), 0);
  });

  test('an error that names no event (a bad device id) rejects nothing and keeps the outbox', async () => {
    const server = createServer();
    const bad = await createDevice(server, 'a');
    await bad.events.append('session.started', 'sess_1', startPayload());
    bad.events.deviceId = 'has space'; // the events are fine; the request's deviceId is not
    await assert.rejects(bad.sync.sync(), (e) => e instanceof ApiError && e.status === 400);
    assert.equal(bad.events.pendingCount(), 1);
    assert.equal(bad.events.rejected().length, 0);
    assert.deepEqual(bad.timers.pending, [], 'not retried: it would fail the same way');
  });

  test('a batch too large for the server is halved until it fits', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    for (let i = 0; i < 6; i++) await a.events.append('session.notes', `sess_${i}`, { notes: 'n'.repeat(3900) });
    let calls = 0;
    const post = a.api.postEvents;
    a.api.postEvents = async (deviceId, events) => {
      calls++;
      if (events.length > 2) throw new ApiError(413, { error: 'too_large' });
      return post(deviceId, events);
    };
    await a.sync.sync();
    assert.equal(a.events.pendingCount(), 0);
    assert.equal(server.store.json(monthKey('2026-10')).length, 6);
    assert.ok(calls >= 4, `${calls} calls: 6 (rejected), 3 (rejected), then batches of 1 or 2`);
  });
});

describe('going offline and coming back', () => {
  test('failed syncs retry with growing delays, then succeed and clear the retry', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');
    a.api.down = true;
    for (let i = 0; i < 3; i++) await a.events.append('session.notes', `sess_${i}`, { notes: `n${i}` });
    await assert.rejects(a.sync.sync());
    assert.deepEqual(a.timers.pending, [5_000]);
    assert.equal(a.sync.status().lastError instanceof ApiError, true);
    await a.timers.fire();
    assert.deepEqual(a.timers.pending, [15_000]);
    await a.timers.fire();
    assert.deepEqual(a.timers.pending, [45_000]);

    a.api.down = false;
    await a.timers.fire();
    assert.equal(a.events.pendingCount(), 0);
    assert.deepEqual(a.timers.pending, []);
    assert.equal(a.sync.status().lastError, null);
    await b.sync.sync();
    assertConverged(a, b);
    assert.equal(b.events.eventCount(), 3);
  });

  test('outbox order is preserved: events go up in the order they were written', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    a.api.down = true;
    await a.events.append('session.started', 'sess_1', startPayload());
    a.wall.now += 1000;
    await a.events.append('set.logged', 's_1', setPayload('sess_1'));
    a.wall.now += 1000;
    await a.events.append('session.finished', 'sess_1', { finishedAt: '2026-09-29T12:00:02.000-07:00' });
    a.api.down = false;
    await a.sync.sync();
    assert.deepEqual(server.store.json(monthKey('2026-10')).map((e) => e.type), ['session.started', 'set.logged', 'session.finished']);
  });

  test('a page that could not be stored is fetched again; the cursor never moves past unstored events', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    await seedSession(server, a);
    const c = await createDevice(server, 'c');
    const ingest = c.storage.ingest.bind(c.storage);
    let failures = 1;
    c.storage.ingest = async (...args) => {
      if (failures-- > 0) throw new Error('QuotaExceededError');
      return ingest(...args);
    };
    await assert.rejects(c.sync.sync(), /QuotaExceededError/);
    assert.equal(c.events.cursor(), null);
    assert.equal(c.events.eventCount(), 0);
    assert.deepEqual(c.timers.pending, [], 'a storage error is not retried blindly');
    await c.sync.sync();
    assertConverged(a, c);
  });

  test('two devices syncing at the same moment both end up with everything, once', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');
    for (let i = 0; i < 5; i++) {
      await a.events.append('session.notes', `sess_a${i}`, { notes: `a${i}` });
      await b.events.append('session.notes', `sess_b${i}`, { notes: `b${i}` });
    }
    await Promise.all([a.sync.sync(), b.sync.sync()]);
    await settle(a, b);
    assertConverged(a, b);
    const ids = server.store.json(monthKey('2026-10')).map((e) => e.id);
    assert.equal(ids.length, 10);
    assert.equal(new Set(ids).size, 10);
  });
});

describe('when syncs run', () => {
  // Waits for any sync in progress (a trigger started it, so there is no promise to await).
  const idle = async (device) => {
    do await new Promise((r) => setImmediate(r)); while (device.sync.status().syncing);
  };
  const targets = () => ({ doc: Object.assign(new EventTarget(), { visibilityState: 'hidden' }), win: new EventTarget() });

  test('writes are batched: a burst of events is one request after a quiet 2 seconds', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const { doc, win } = targets();
    const detach = attachSyncTriggers({ sync: a.sync, events: a.events, doc, win });
    for (let i = 0; i < 3; i++) await a.events.append('session.notes', `sess_${i}`, { notes: `n${i}` });
    assert.deepEqual(a.timers.pending, [2000], 'one timer, restarted by each write');
    assert.equal(a.api.calls.length, 0, 'nothing sent yet');
    await a.timers.fire();
    assert.deepEqual(a.api.calls.filter((c) => c.method === 'POST'), [{ method: 'POST', count: 3 }]);
    assert.equal(a.events.pendingCount(), 0);
    detach();
  });

  test('app open, visibilitychange to visible, and online each sync; hidden does not', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const { doc, win } = targets();
    attachSyncTriggers({ sync: a.sync, events: a.events, doc, win });
    const gets = () => a.api.calls.filter((c) => c.method === 'GET').length;

    doc.dispatchEvent(new Event('visibilitychange')); // still hidden
    await idle(a);
    assert.equal(gets(), 0);

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await idle(a);
    assert.equal(gets(), 1);

    win.dispatchEvent(new Event('online'));
    await idle(a);
    assert.equal(gets(), 2);
  });

  test('nothing is triggered while signed out, and detaching removes the triggers', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const { doc, win } = targets();
    let signedIn = false;
    const detach = attachSyncTriggers({ sync: a.sync, events: a.events, enabled: () => signedIn, doc, win });
    await a.events.append('session.notes', 'sess_1', { notes: 'x' });
    win.dispatchEvent(new Event('online'));
    assert.deepEqual(a.timers.pending, []);
    await new Promise((r) => setImmediate(r));
    assert.equal(a.api.calls.length, 0);

    signedIn = true;
    detach();
    await a.events.append('session.notes', 'sess_2', { notes: 'y' });
    win.dispatchEvent(new Event('online'));
    assert.deepEqual(a.timers.pending, []);
  });

  test('requests made while a sync runs are folded into one more pass', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    await Promise.all([a.sync.sync(), a.sync.sync(), a.sync.sync()]);
    assert.equal(a.api.calls.filter((c) => c.method === 'GET').length, 2);
  });

  test('status: syncing flag, last sync time, last error', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const seen = [];
    a.sync.subscribe((s) => seen.push(s.syncing));
    a.at('2026-09-29T12:00:00-07:00');
    await a.sync.sync();
    assert.deepEqual(seen, [true, false]);
    assert.equal(a.sync.status().lastSyncAt, a.wall.now);
    assert.equal(a.sync.status().lastError, null);
    a.api.down = true;
    await assert.rejects(a.sync.sync());
    assert.equal(a.sync.status().lastError.status, 0);
    assert.equal(a.sync.status().lastSyncAt, a.wall.now, 'the last success is kept');
  });
});

describe('which failures are worth retrying', () => {
  test('network, throttling and server errors yes; sign-in problems and rejections no', () => {
    for (const status of [0, 408, 429, 500, 502, 503]) assert.equal(isRetryable(new ApiError(status, null)), true, String(status));
    for (const status of [400, 401, 403, 404, 413]) assert.equal(isRetryable(new ApiError(status, null)), false, String(status));
    for (const kind of ['network', 'throttled', 'error']) assert.equal(isRetryable(new AuthError(kind, 'x')), true, kind);
    for (const kind of ['signed_out', 'unavailable', 'not_authorized']) assert.equal(isRetryable(new AuthError(kind, 'x')), false, kind);
    assert.equal(isRetryable(new Error('QuotaExceededError')), false);
  });

  test('signing in again: the next sync starts with no error, so the form is not shown a second time', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    await a.events.append('session.notes', 'sess_1', { notes: 'x' });
    const real = { post: a.api.postEvents, get: a.api.getEvents };
    a.api.postEvents = a.api.getEvents = async () => { throw new AuthError('signed_out', 'Your session expired.'); };
    await assert.rejects(a.sync.sync(), (e) => e.kind === 'signed_out');
    assert.equal(a.sync.status().lastError.kind, 'signed_out');

    a.api.postEvents = real.post;
    a.api.getEvents = real.get;
    const seen = [];
    a.sync.subscribe((s) => seen.push({ syncing: s.syncing, error: s.lastError }));
    await a.sync.sync();
    assert.deepEqual(seen.map((s) => s.error), [null, null], 'no update of the new sync carries the old error');
    assert.equal(a.events.pendingCount(), 0, 'and the outbox kept through the sign-out went up');
  });

  test('a signed-out sync keeps the outbox and does not retry', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    await a.events.append('session.notes', 'sess_1', { notes: 'x' });
    a.api.postEvents = async () => { throw new AuthError('signed_out', 'Your session expired.'); };
    a.api.getEvents = async () => { throw new AuthError('signed_out', 'Your session expired.'); };
    await assert.rejects(a.sync.sync(), (e) => e.kind === 'signed_out');
    assert.equal(a.events.pendingCount(), 1);
    assert.deepEqual(a.timers.pending, []);
  });
});

describe('state comes from the log alone', () => {
  test('rebuilding state from the events a device holds gives the state it shows', async () => {
    const server = createServer();
    const a = await createDevice(server, 'a');
    const b = await createDevice(server, 'b');
    await seedSession(server, a, b);
    b.at('2026-09-29T12:10:00-07:00');
    await b.events.append('set.edited', 's_1', { reps: 8 });
    await settle(a, b);
    assert.deepEqual(replay(a.events.events()), a.events.state);
    assert.deepEqual(replay([...a.events.events()].reverse()), b.events.state);
  });
});

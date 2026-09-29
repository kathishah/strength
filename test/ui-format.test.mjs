// The text the screens show, and the page's test note. No DOM needed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { describeError, describeEvent, describeRoundTrip, describeState, describeSync, needsSignIn, timeOfDay } from '../app/js/ui/format.js';
import { AuthError } from '../app/js/store/auth.js';
import { ApiError } from '../app/js/store/api.js';
import { testNote } from '../app/js/store/events.js';
import { validateBatch } from '../lambda/events/registry.mjs';
import { replay } from '../app/js/store/replay.js';
import { createClock, ulid } from '../app/js/ids.js';

describe('errors', () => {
  test('sign-in errors', () => {
    assert.equal(describeError(new AuthError('not_authorized', '')), 'Incorrect email or PIN.');
    assert.match(describeError(new AuthError('network', '')), /Cannot reach the sign-in service/);
    assert.match(describeError(new AuthError('signed_out', '')), /Sign in again/);
  });

  test('API errors say what to do, and never claim events were lost', () => {
    assert.match(describeError(new ApiError(0, null)), /saved on this device/);
    assert.match(describeError(new ApiError(403, null)), /OwnerSub/);
    assert.match(describeError(new ApiError(503, null)), /again shortly/);
    assert.equal(describeError(new ApiError(400, { errors: [{ field: 'payload.reps', reason: 'must be a number' }] })), 'Rejected: payload.reps must be a number');
    assert.match(describeError(new Error('QuotaExceededError')), /on this device/);
  });

  test('only a lost session or an unusable account sends the person to the form', () => {
    assert.equal(needsSignIn(new AuthError('signed_out', '')), true);
    assert.equal(needsSignIn(new AuthError('unavailable', '')), true);
    assert.equal(needsSignIn(new AuthError('network', '')), false);
    assert.equal(needsSignIn(new ApiError(403, null)), false);
    assert.equal(needsSignIn(new Error('x')), false);
  });
});

describe('sync line', () => {
  const idle = { syncing: false, lastSyncAt: null, lastError: null, retryAt: null };
  const at = Date.parse('2026-09-29T19:30:15Z');

  test('states', () => {
    assert.deepEqual(describeSync(idle), { text: 'Not synced yet.', kind: 'info' });
    assert.deepEqual(describeSync({ ...idle, syncing: true }), { text: 'Syncing…', kind: 'info' });
    assert.deepEqual(describeSync({ ...idle, lastSyncAt: at }), { text: 'Up to date at 12:30:15 PM.', kind: 'ok' });
    assert.equal(describeSync({ ...idle, lastSyncAt: at }, { pending: 2 }).text, 'Synced at 12:30:15 PM; 2 still waiting.');
  });

  test('an error shows the retry countdown', () => {
    const line = describeSync({ ...idle, lastError: new ApiError(0, null), retryAt: at + 15_000 }, { now: at });
    assert.equal(line.kind, 'error');
    assert.equal(line.text, 'Not synced. Cannot reach the server. Your events are saved on this device. Retrying in 15 s.');
  });

  test('times are Pacific', () => {
    assert.equal(timeOfDay(Date.parse('2026-12-15T20:05:00Z')), '12:05:00 PM'); // PST, UTC-8
  });

  test('round trip text flags a likely cold start', () => {
    assert.equal(describeRoundTrip({ rttMs: null }), 'none yet');
    assert.equal(describeRoundTrip({ rttMs: 120, lastRttLabel: 'GET /events' }), 'GET /events 120 ms (warm)');
    assert.match(describeRoundTrip({ rttMs: 800, lastRttLabel: 'POST /events' }), /800 ms \(slow: probably a Lambda cold start\)/);
  });
});

describe('summaries', () => {
  test('event and state descriptions', () => {
    assert.equal(describeEvent({ payload: { notes: 'hello' } }), 'hello');
    assert.equal(describeEvent({ payload: { reps: 5 } }), '{"reps":5}');
    assert.equal(describeEvent({ payload: { notes: undefined, x: 'y'.repeat(200) } }).length, 120);
    assert.equal(describeState({ sessions: { a: 1 }, sets: {}, settings: { x: 1, y: 2 } }), '1 session, 0 sets, 2 settings');
  });
});

describe('the test note', () => {
  test('is accepted by the server, and never shows up as a session', () => {
    const note = testNote('d_7f3a');
    assert.match(note.entityId, /^spike_[0-9A-Z]{26}$/);
    const clock = createClock();
    const ev = { id: ulid(), ts: clock.next('d_7f3a'), v: 1, ...note };
    assert.deepEqual(validateBatch({ deviceId: 'd_7f3a', events: [ev] }).errors, []);
    const state = replay([ev]);
    assert.deepEqual([state.sessions, state.skipped], [{}, []]);
  });
});

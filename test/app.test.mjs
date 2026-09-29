// Client-side modules that have no DOM dependency: ids, the test event, and the Cognito flows.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ulid, nextTs } from '../app/js/ids.js';
import { buildTestEvent } from '../app/js/api.js';
import { validateBatch } from '../lambda/events/registry.mjs';
import { AuthError, getIdToken, hasRefreshToken, signIn, signOut } from '../app/js/auth.js';

describe('ids', () => {
  test('ulid is 26 Crockford characters, sortable by time', () => {
    const a = ulid(Date.parse('2026-10-05T12:00:00Z'));
    const b = ulid(Date.parse('2026-10-05T12:00:01Z'));
    assert.match(a, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    assert.ok(a.slice(0, 10) < b.slice(0, 10));
  });

  test('nextTs never repeats or goes backwards, even when the clock stalls or steps back', () => {
    const t = Date.now(); // module state is shared, so stay near the real clock
    const seq = [t, t, t, t - 5000, t + 1].map((now) => nextTs('d_1', now));
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i] > seq[i - 1], `${seq[i - 1]} < ${seq[i]}`);
  });

  test('the test event passes the server validators (as a batch, at the current time)', () => {
    const { errors } = validateBatch({ deviceId: 'd_7f3a', events: [buildTestEvent('d_7f3a'), buildTestEvent('d_7f3a')] });
    assert.deepEqual(errors, []);
  });
});

// ---- auth.js against a scripted fetch and an in-memory localStorage ----
function installBrowserStubs() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  const calls = [];
  const script = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, target: init.headers['X-Amz-Target'].split('.').pop(), body });
    const next = script.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status === 200, status: next.status, json: async () => next.json };
  };
  const reply = (status, json) => script.push({ status, json });
  return { store, calls, reply, script };
}

describe('auth', () => {
  let env;
  beforeEach(async () => {
    env = installBrowserStubs();
    await signOut(); // reset module state (no refresh token, so no network call)
    env.calls.length = 0;
  });

  const ok = (extra = {}) => ({
    AuthenticationResult: { IdToken: 'id-1', AccessToken: 'acc-1', RefreshToken: 'ref-1', ExpiresIn: 3600, ...extra },
  });

  test('signIn uses USER_PASSWORD_AUTH, keeps the refresh token in localStorage', async () => {
    env.reply(200, ok());
    await signIn('me@example.com', 'pw');
    assert.equal(env.calls[0].target, 'InitiateAuth');
    assert.equal(env.calls[0].body.AuthFlow, 'USER_PASSWORD_AUTH');
    assert.deepEqual(env.calls[0].body.AuthParameters, { USERNAME: 'me@example.com', PASSWORD: 'pw' });
    assert.equal(env.calls[0].url, 'https://cognito-idp.us-west-2.amazonaws.com/');
    assert.equal(env.store.get('strength.refreshToken'), 'ref-1');
    assert.equal(await getIdToken(), 'id-1', 'served from memory, no second request');
    assert.equal(env.calls.length, 1);
  });

  test('a challenge is "unavailable" and nothing is stored', async () => {
    env.reply(200, { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's' });
    await assert.rejects(signIn('me@example.com', 'pw'), (e) => e instanceof AuthError && e.kind === 'unavailable');
    assert.equal(hasRefreshToken(), false);
  });

  test('wrong password is not_authorized; a dead network is "network"', async () => {
    env.reply(400, { __type: 'NotAuthorizedException', message: 'Incorrect username or password.' });
    await assert.rejects(signIn('me@example.com', 'bad'), (e) => e.kind === 'not_authorized');
    env.script.push(new TypeError('Failed to fetch'));
    await assert.rejects(signIn('me@example.com', 'pw'), (e) => e.kind === 'network');
  });

  test('refresh: REFRESH_TOKEN_AUTH when the ID token is near expiry; one request for concurrent callers', async () => {
    env.reply(200, ok({ ExpiresIn: 30 })); // already inside the 60 s early-refresh window
    await signIn('me@example.com', 'pw');
    env.reply(200, { AuthenticationResult: { IdToken: 'id-2', ExpiresIn: 3600 } });
    const [a, b] = await Promise.all([getIdToken(), getIdToken()]);
    assert.deepEqual([a, b], ['id-2', 'id-2']);
    assert.equal(env.calls.length, 2);
    assert.equal(env.calls[1].body.AuthFlow, 'REFRESH_TOKEN_AUTH');
    assert.equal(env.calls[1].body.AuthParameters.REFRESH_TOKEN, 'ref-1');
    assert.equal(env.store.get('strength.refreshToken'), 'ref-1', 'kept when Cognito does not rotate it');
  });

  test('a rejected refresh token signs out; a network failure keeps it', async () => {
    env.reply(200, ok({ ExpiresIn: 30 }));
    await signIn('me@example.com', 'pw');

    env.script.push(new TypeError('offline'));
    await assert.rejects(getIdToken(), (e) => e.kind === 'network');
    assert.equal(hasRefreshToken(), true);

    env.reply(400, { __type: 'NotAuthorizedException' });
    await assert.rejects(getIdToken(), (e) => e.kind === 'signed_out');
    assert.equal(hasRefreshToken(), false);
  });

  test('getIdToken with no refresh token is signed_out without any request', async () => {
    await assert.rejects(getIdToken(), (e) => e.kind === 'signed_out');
    assert.equal(env.calls.length, 0);
  });

  test('signOut clears the token and revokes it (best effort)', async () => {
    env.reply(200, ok());
    await signIn('me@example.com', 'pw');
    env.reply(200, {});
    await signOut();
    assert.equal(hasRefreshToken(), false);
    assert.equal(env.calls.at(-1).target, 'RevokeToken');
    assert.equal(env.calls.at(-1).body.Token, 'ref-1');
  });
});

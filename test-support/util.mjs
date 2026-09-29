// Builders for tests: valid events, API Gateway HTTP API (v2) requests, a handler with a fake store.

import { createHandler } from '../lambda/events/index.mjs';
import { FakeS3 } from './fake-s3.mjs';

export const OWNER = 'a1b2c3d4-0000-4000-8000-000000000001';
export const NOW = Date.parse('2026-10-05T12:00:00.000Z');

// Crockford base32 excludes I, L, O, U; decimal digits are all valid, so use them.
export const ulid = (n) => `01J9Z0${String(n).padStart(20, '0')}`;

export function makeEvent(n, overrides = {}) {
  return {
    id: ulid(n),
    ts: `2026-10-05T11:${String(n % 60).padStart(2, '0')}:00.000Z-${String(n % 10000).padStart(4, '0')}-d_7f3a`,
    v: 1,
    type: 'set.logged',
    entityId: `s_${n}`,
    payload: {
      sessionId: 'sess_1',
      exerciseId: 'goblet-squat',
      setNumber: 1,
      weightLbs: 25,
      suggestedWeightLbs: 20,
      reps: 12,
      isRampUp: false,
      isCalibration: true,
    },
    ...overrides,
  };
}

export function makeRequest({ method = 'POST', path = '/events', sub = OWNER, body, rawBody, query, base64 = false } = {}) {
  const text = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
  return {
    rawPath: path,
    queryStringParameters: query,
    isBase64Encoded: base64,
    body: base64 && text !== undefined ? Buffer.from(text).toString('base64') : text,
    requestContext: {
      http: { method, path },
      authorizer: sub === null ? undefined : { jwt: { claims: { sub } } },
    },
  };
}

export const post = (events, extra = {}) =>
  makeRequest({ method: 'POST', body: { deviceId: 'd_7f3a', events }, ...extra });
export const get = (query, extra = {}) => makeRequest({ method: 'GET', query, ...extra });

// A handler wired to a fresh FakeS3 with a controllable clock and no real sleeping.
export function setup({ ownerSub = OWNER, now = NOW } = {}) {
  const store = new FakeS3();
  const clock = { now };
  const sleeps = [];
  const handler = createHandler({
    env: ownerSub === null ? {} : { OWNER_SUB: ownerSub }, // null = variable not set at all
    store,
    now: () => clock.now,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
  });
  const call = async (req) => {
    const res = await handler(req);
    return { ...res, json: JSON.parse(res.body) };
  };
  return { store, clock, sleeps, handler, call };
}

export const monthKey = (month, sub = OWNER) => `u/${sub}/events/${month}.json`;

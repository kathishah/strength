// Client for POST /events and GET /events (DEPLOYMENT-PLAN.md section 3).

import { config } from './config.js';
import { getIdToken } from './auth.js';
import { ulid, nextTs } from './ids.js';

export class ApiError extends Error {
  constructor(status, body, message) {
    super(message ?? body?.message ?? `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status; // 0 = never reached the server
    this.body = body;
  }
}

// Sends one request with the ID token. On 401 it refreshes the token once and retries.
// `ms` is the round trip of the final HTTP request only (token refresh is not included).
async function request(method, path, { query, body } = {}) {
  const url = new URL(path, config.apiUrl);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, v);

  for (let attempt = 0; ; attempt++) {
    const token = await getIdToken({ force: attempt > 0 });
    const started = performance.now();
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, null, 'Cannot reach the server.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty or non-JSON body */ }
    const ms = Math.round(performance.now() - started);

    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) throw new ApiError(res.status, data);
    return { data, ms };
  }
}

export const postEvents = (deviceId, events) => request('POST', '/events', { body: { deviceId, events } });
export const getEvents = ({ since, limit } = {}) => request('GET', '/events', { query: { since, limit } });

// The spike's test event: a note on an entity that is never created, so it cannot affect real
// state. Its entityId starts with "spike_" so it is easy to recognise and skip later.
export function buildTestEvent(deviceId, nowMs = Date.now()) {
  const id = ulid(nowMs);
  return {
    id,
    ts: nextTs(deviceId, nowMs),
    v: 1,
    type: 'session.notes',
    entityId: `spike_${id}`,
    payload: { notes: `Spike test from ${deviceId}` },
  };
}

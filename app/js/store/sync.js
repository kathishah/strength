// Background sync (DEPLOYMENT-PLAN.md section 5): push the outbox, then pull everything after the saved
// cursor. Never blocks logging: writes go through events.append() first and reach the server later.
//
//   - One sync at a time; a request made while one runs makes it go around once more.
//   - Triggers: app open, visibilitychange to visible, online, and 2 s after each local write
//     (attachSyncTriggers). iOS has no Background Sync, so a session finished offline uploads on next open.
//   - After a network or server failure it retries with growing delays while the app stays open.
//     It does not retry when the person has to act (signed out, not the owner, token rejected).
//   - The cursor is saved with the events it covers (events.ingest), so a page that failed to store is
//     fetched again, and events written by another device are never skipped.

import { AuthError } from './auth.js';
import { ApiError } from './api.js';
import { flushOutbox } from './outbox.js';

const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000];

const realTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle),
};

// Is it worth trying again later without the person doing anything?
export function isRetryable(err) {
  if (err instanceof AuthError) return err.kind === 'network' || err.kind === 'throttled' || err.kind === 'error';
  if (err instanceof ApiError) return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
  return false;
}

// events: from events.js. api: { postEvents, getEvents } (store/api.js). timers: { set, clear } for tests.
export function createSync({
  events, api, timers = realTimers, debounceMs = 2000, pageLimit = 500, maxPages = 200, backoffMs = BACKOFF_MS, now = Date.now,
}) {
  let running = null;
  let again = false;
  let debounceHandle = null;
  let retryHandle = null;
  let failures = 0;
  const listeners = new Set();
  const status = { syncing: false, lastSyncAt: null, lastError: null, retryAt: null, rttMs: null, lastRttLabel: null };

  const publish = () => {
    for (const fn of [...listeners]) {
      try { fn(status); } catch (err) { console.error('sync listener failed', err); }
    }
  };

  async function pull() {
    let cursor = events.cursor();
    let added = 0;
    for (let page = 0; page < maxPages; page++) {
      const { data, ms } = await api.getEvents({ since: cursor, limit: pageLimit });
      status.rttMs = ms;
      status.lastRttLabel = 'GET /events';
      const got = Array.isArray(data?.events) ? data.events : [];
      const next = typeof data?.cursor === 'string' ? data.cursor : null;
      if (got.length > 0 || (next && next !== cursor)) {
        added += (await events.ingest(got, next)).added;
        cursor = next ?? cursor;
      }
      if (!data?.more || got.length === 0) break;
    }
    return added;
  }

  // Push then pull. A failed push still lets the pull run (and the other way round); the first error is thrown.
  async function once() {
    let firstError = null;
    const result = { pushed: null, pulled: 0 };
    try {
      result.pushed = await flushOutbox({ events, api });
      if (result.pushed.rttMs !== null) {
        status.rttMs = result.pushed.rttMs;
        status.lastRttLabel = 'POST /events';
      }
    } catch (err) {
      firstError = err;
    }
    try {
      result.pulled = await pull();
    } catch (err) {
      firstError ??= err;
    }
    if (firstError) throw firstError;
    return result;
  }

  function scheduleRetry() {
    if (retryHandle !== null) timers.clear(retryHandle);
    const delay = backoffMs[Math.min(failures - 1, backoffMs.length - 1)];
    status.retryAt = now() + delay;
    retryHandle = timers.set(() => {
      retryHandle = null;
      status.retryAt = null;
      return sync().catch(() => {});
    }, delay);
  }

  async function loop() {
    let last = null;
    do {
      again = false;
      status.syncing = true;
      status.lastError = null; // a new attempt starts clean, so a stale "signed out" cannot bounce a fresh sign-in
      publish();
      try {
        last = await once();
        failures = 0;
        status.lastError = null;
        status.lastSyncAt = now();
        status.retryAt = null;
        if (retryHandle !== null) { timers.clear(retryHandle); retryHandle = null; }
      } catch (err) {
        status.lastError = err;
        if (isRetryable(err)) { failures++; scheduleRetry(); }
        else if (retryHandle !== null) { timers.clear(retryHandle); retryHandle = null; status.retryAt = null; }
        again = false;
        throw err;
      } finally {
        status.syncing = false;
        publish();
      }
    } while (again);
    return last;
  }

  // Runs a sync now. If one is already running, it runs once more when that one ends. Rejects with the
  // first error (an AuthError, ApiError or storage error) so the caller can tell the person.
  function sync() {
    if (running) {
      again = true;
      return running;
    }
    running = loop().finally(() => { running = null; });
    return running;
  }

  // Syncs after a short quiet spell (each call restarts the wait), so a burst of sets is one request.
  function request() {
    if (debounceHandle !== null) timers.clear(debounceHandle);
    debounceHandle = timers.set(() => {
      debounceHandle = null;
      return sync().catch(() => {});
    }, debounceMs);
  }

  function stop() {
    for (const h of [debounceHandle, retryHandle]) if (h !== null) timers.clear(h);
    debounceHandle = retryHandle = null;
    status.retryAt = null;
  }

  return {
    sync,
    request,
    stop,
    status: () => status,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// Wires the browser triggers. `enabled()` says whether anyone is signed in. Returns a function that removes them.
export function attachSyncTriggers({ sync, events, enabled = () => true, doc = globalThis.document, win = globalThis.window }) {
  const run = () => { if (enabled()) sync.sync().catch(() => {}); };
  const onVisible = () => { if (doc?.visibilityState === 'visible') run(); };
  doc?.addEventListener?.('visibilitychange', onVisible);
  win?.addEventListener?.('online', run);
  const unsubscribe = events.subscribe(({ kind }) => { if (kind === 'append' && enabled()) sync.request(); });
  return () => {
    doc?.removeEventListener?.('visibilitychange', onVisible);
    win?.removeEventListener?.('online', run);
    unsubscribe();
  };
}

// Lambda "events": POST /events and GET /events (DEPLOYMENT-PLAN.md section 3).
//
// Storage: u/<sub>/events/<yyyy-mm>.json, an append-only JSON array per RECEIVE
// month (US Pacific time, see time.mjs). The GET cursor is "<yyyy-mm>:<index>", a position in those files.

import { MAX_BODY_BYTES, validateBatch } from './registry.mjs';
import { StoreError, createS3ObjectStore } from './object-store.mjs';
import { pacificIso } from './time.mjs';

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 5000;
const MAX_RETRIES = 5; // after the first attempt, so up to 6 tries in all
const MAX_REPORTED_ERRORS = 100;
const SUB_RE = /^[A-Za-z0-9-]{1,64}$/;
const CURSOR_RE = /^(\d{4}-(?:0[1-9]|1[0-2])):(\d{1,9})$/;
const MONTH_FILE_RE = /^(\d{4}-(?:0[1-9]|1[0-2]))\.json$/;

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders },
  body: JSON.stringify(body),
});
const fail = (statusCode, error, message, extra = {}) => json(statusCode, { error, message, ...extra });

const eventsPrefix = (sub) => `u/${sub}/events/`;

function parseMonthFile(body, key) {
  const arr = JSON.parse(body);
  if (!Array.isArray(arr)) throw new Error(`${key} is not a JSON array`);
  return arr;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// deps: env (OWNER_SUB, DATA_BUCKET), store (ObjectStore), now() in ms, sleep(ms), random().
export function createHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  let s3Store;
  const getStore = () => deps.store ?? (s3Store ??= createS3ObjectStore(env.DATA_BUCKET));

  // ---- POST /events ----
  async function appendEvents(store, sub, events, recvAt) {
    const key = `${eventsPrefix(sub)}${recvAt.slice(0, 7)}.json`;
    for (let attempt = 0; ; attempt++) {
      try {
        const current = await store.get(key);
        const existing = current ? parseMonthFile(current.body, key) : [];
        const seen = new Set(existing.map((e) => e.id));
        const fresh = [];
        let duplicates = 0;
        for (const ev of events) {
          if (seen.has(ev.id)) {
            duplicates++;
          } else {
            seen.add(ev.id);
            fresh.push({ ...ev, recvAt });
          }
        }
        // Nothing new: the stored file already has every id, and files only grow.
        if (fresh.length === 0) return { accepted: 0, duplicates };
        await store.put(
          key,
          JSON.stringify(existing.concat(fresh)),
          current ? { ifMatch: current.etag } : { ifNoneMatch: '*' },
        );
        return { accepted: fresh.length, duplicates };
      } catch (err) {
        // 412: someone wrote first. 409: a concurrent conditional write is in flight.
        // 404: the file vanished between our read and an If-Match write; re-reading recreates it.
        if (!(err instanceof StoreError)) throw err;
        if (attempt >= MAX_RETRIES) return null;
        await sleep(25 + Math.floor(random() * 75));
      }
    }
  }

  async function postEvents(event, sub) {
    const raw = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8');
    if (raw.length > MAX_BODY_BYTES) {
      return fail(413, 'too_large', `request body is limited to ${MAX_BODY_BYTES / 1024} KB`);
    }
    let body;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return fail(400, 'bad_json', 'request body is not valid JSON');
    }
    const { errors } = validateBatch(body, now());
    if (errors.length > 0) {
      return fail(400, 'validation', 'batch rejected; nothing was stored', {
        errors: errors.slice(0, MAX_REPORTED_ERRORS),
      });
    }
    const recvAt = pacificIso(now()); // e.g. 2026-09-29T12:30:00.123-07:00; its yyyy-mm picks the file
    const result = await appendEvents(getStore(), sub, body.events, recvAt);
    if (!result) {
      const busy = fail(503, 'busy', 'concurrent writes; retry shortly');
      busy.headers['retry-after'] = '1';
      return busy;
    }
    return json(200, result);
  }

  // ---- GET /events ----
  async function getEvents(event, sub) {
    const qs = event.queryStringParameters ?? {};
    let since = null;
    if (qs.since !== undefined && qs.since !== '') {
      const m = CURSOR_RE.exec(qs.since);
      if (!m) return fail(400, 'bad_cursor', 'since must look like 2026-10:37');
      since = { month: m[1], index: Number(m[2]), raw: qs.since };
    }
    let limit = DEFAULT_LIMIT;
    if (qs.limit !== undefined) {
      if (!/^\d+$/.test(qs.limit) || Number(qs.limit) < 1) {
        return fail(400, 'bad_limit', 'limit must be a positive integer');
      }
      limit = Math.min(Number(qs.limit), MAX_LIMIT);
    }

    const store = getStore();
    const prefix = eventsPrefix(sub);
    const files = (await store.list(prefix))
      .filter((k) => k.startsWith(prefix))
      .map((key) => ({ key, m: MONTH_FILE_RE.exec(key.slice(prefix.length)) }))
      .filter((f) => f.m)
      .map((f) => ({ key: f.key, month: f.m[1] }))
      .filter((f) => !since || f.month >= since.month)
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

    const events = [];
    let cursor = since ? since.raw : null;
    let more = false;
    for (const file of files) {
      const room = limit - events.length;
      if (room <= 0) {
        more = true; // a later file exists and the page is full
        break;
      }
      const got = await store.get(file.key);
      if (!got) continue;
      const all = parseMonthFile(got.body, file.key);
      const start = since && file.month === since.month ? since.index : 0;
      const page = all.slice(start, start + room);
      if (page.length > 0) {
        events.push(...page);
        cursor = `${file.month}:${start + page.length}`;
      }
      if (start + page.length < all.length) {
        more = true;
        break;
      }
    }
    return json(200, { events, cursor, more });
  }

  // ---- entry point ----
  return async function handler(event) {
    try {
      const sub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
      if (typeof sub !== 'string' || sub === '') {
        return fail(401, 'unauthorized', 'missing or invalid token');
      }
      // Defence in depth behind the JWT authorizer. An unset OWNER_SUB denies everyone.
      const owner = env.OWNER_SUB;
      if (!owner || sub !== owner || !SUB_RE.test(sub)) {
        return fail(403, 'forbidden', 'this account is not the owner');
      }

      const method = event.requestContext?.http?.method;
      const path = (event.rawPath ?? '').replace(/\/+$/, '');
      if (path === '/events' && method === 'POST') return await postEvents(event, sub);
      if (path === '/events' && method === 'GET') return await getEvents(event, sub);
      return fail(404, 'not_found', 'no such route');
    } catch (err) {
      // Never log request bodies (health data); the error alone is enough to debug.
      console.error('events handler failed', err);
      return fail(500, 'internal', 'internal error');
    }
  };
}

export const handler = createHandler();

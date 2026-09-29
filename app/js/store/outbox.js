// Sends the outbox with POST /events (DEPLOYMENT-PLAN.md sections 3 and 5).
//
// The server stores a batch all or nothing and answers duplicates as success, so the whole outbox
// can be retried safely. One event the server will never accept would otherwise block every later
// one, so a 400 that names events takes those out of the outbox (they are kept, with the reason,
// in events.rejected()) and the rest is sent again. Errors that say nothing about the events
// (network, auth, 5xx, a bad request we cannot attribute) leave the outbox untouched and are thrown.

import { ApiError } from './api.js';

const MAX_EVENTS = 200; // server limit per request
const MAX_CHARS = 200 * 1024; // the server limit is 256 KB; leave room for the envelope and multi-byte text

function takeBatch(pending, count, maxChars) {
  const batch = [];
  let size = 0;
  for (const ev of pending) {
    size += JSON.stringify(ev).length;
    if (batch.length > 0 && (batch.length >= count || size > maxChars)) break;
    batch.push(ev);
  }
  return batch;
}

// Which events a 400 blames, as [{ id, reason }], or null when it does not blame any event.
function blamed(err, batch) {
  const errors = err.body?.errors;
  if (err.status !== 400 || !Array.isArray(errors) || errors.length === 0) return null;
  const reasons = new Map();
  for (const e of errors) {
    const id = e.id ?? (Number.isInteger(e.index) ? batch[e.index]?.id : undefined);
    if (!id) return null; // a batch-level error (say, the device id): not the events' fault
    if (!batch.some((ev) => ev.id === id)) return null;
    reasons.set(id, [...(reasons.get(id) ?? []), `${e.field} ${e.reason}`]);
  }
  return [...reasons].map(([id, list]) => ({ id, reason: list.join('; ') }));
}

// events: the store from events.js. api: { postEvents(deviceId, events) -> { data, ms } }.
// Resolves { sent, duplicates, rejected, rttMs } when the outbox is empty; throws if it cannot get there.
export async function flushOutbox({ events, api, maxRounds = 1000 }) {
  const result = { sent: 0, duplicates: 0, rejected: 0, rttMs: null };
  let count = MAX_EVENTS;
  for (let round = 0; round < maxRounds; round++) {
    const pending = events.pending();
    if (pending.length === 0) break;
    const batch = takeBatch(pending, count, MAX_CHARS);
    let reply;
    try {
      reply = await api.postEvents(events.deviceId, batch);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      const bad = blamed(err, batch);
      if (bad) {
        await events.reject(bad);
        result.rejected += bad.length;
        continue;
      }
      if (err.status === 413 && batch.length > 1) {
        count = Math.max(1, Math.floor(batch.length / 2));
        continue;
      }
      throw err;
    }
    await events.markSent(batch.map((e) => e.id));
    result.sent += reply.data?.accepted ?? 0;
    result.duplicates += reply.data?.duplicates ?? 0;
    result.rttMs = reply.ms;
  }
  return result;
}

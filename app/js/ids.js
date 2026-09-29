// Event ids and timestamps that satisfy the server's validators (lambda/events/registry.mjs).

import { pacificIso, parseTs } from './time.js';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// ULID: 10 characters of millisecond time, 16 of randomness.
export function ulid(nowMs = Date.now()) {
  let time = '';
  for (let t = nowMs, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = CROCKFORD[t % 32] + time;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let rand = '';
  for (const b of bytes) rand += CROCKFORD[b % 32]; // 256 is a multiple of 32, so no bias
  return time + rand;
}

// Hybrid logical clock. Each ts is <Pacific ISO time with offset>-<4-digit counter>-<deviceId>,
// e.g. 2026-09-29T12:30:00.123-07:00-0000-d_7f3a. The offset changes with daylight saving, so
// order timestamps by instant (compareTs in time.js), not as strings.
//
// next() never goes backwards, even if the wall clock does. observe() pulls the clock up to the
// newest ts seen from any device, so an event written after reading another device's events sorts
// after them even when this device's wall clock runs behind. Without that, an edit made on a slow
// clock would sort before the set it edits.
const MAX_OBSERVE_AHEAD_MS = 24 * 60 * 60 * 1000; // the server rejects a ts further ahead than this

export function createClock() {
  let lastMs = 0;
  let counter = 0;
  return {
    next(deviceId, nowMs = Date.now()) {
      if (nowMs > lastMs) {
        lastMs = nowMs;
        counter = 0;
      } else if (++counter > 9999) {
        lastMs += 1;
        counter = 0;
      }
      return `${pacificIso(lastMs)}-${String(counter).padStart(4, '0')}-${deviceId}`;
    },
    observe(ts, nowMs = Date.now()) {
      const seen = parseTs(ts);
      if (!seen || seen.ms > nowMs + MAX_OBSERVE_AHEAD_MS) return; // malformed, or one the server would refuse
      const seenCounter = /^\d+$/.test(seen.counter) ? Number(seen.counter) : 0;
      if (seen.ms > lastMs) {
        lastMs = seen.ms;
        counter = seenCounter;
      } else if (seen.ms === lastMs && seenCounter > counter) {
        counter = seenCounter;
      }
    },
  };
}

// The page-wide clock.
const pageClock = createClock();
export const nextTs = (deviceId, nowMs) => pageClock.next(deviceId, nowMs);

// A stable per-install id like "d_7f3a". Falls back to a fresh one if storage is unavailable.
const DEVICE_KEY = 'strength.deviceId';
let memoryDeviceId = null;
export function getDeviceId() {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
  } catch { /* storage blocked */ }
  if (!memoryDeviceId) {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => b.toString(16).padStart(2, '0')).join('');
    memoryDeviceId = `d_${hex}`;
    try { localStorage.setItem(DEVICE_KEY, memoryDeviceId); } catch { /* keep it in memory */ }
  }
  return memoryDeviceId;
}

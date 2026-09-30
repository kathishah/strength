// The rest timer (spec 6.3, 9). It stores when the rest started and how long it is, and works out what is left from the
// current time on every look, so a locked screen or a background tab cannot make it drift. Pure.

export const DEFAULT_REST_SEC = 90;
export const MIN_REST_SEC = 15;
export const MAX_REST_SEC = 600;
export const REST_STEP_SEC = 15;
const HIDE_AFTER_OVER_MS = 10 * 60 * 1000; // a rest that ended ten minutes ago is not shown any more

const clamp = (n) => Math.min(MAX_REST_SEC, Math.max(MIN_REST_SEC, n));

// How long the next rest is: this session's adjusted length, else the restTimerDefaultSec setting, else 90 s.
export function restLength(draft, settings = {}) {
  const chosen = draft?.restSec ?? settings?.restTimerDefaultSec ?? DEFAULT_REST_SEC;
  return Number.isFinite(chosen) ? clamp(Math.round(chosen)) : DEFAULT_REST_SEC;
}

// null when no rest is running. Otherwise { totalSec, remainingMs, remainingSec, over, overMs }.
export function restStatus(draft, nowMs, settings = {}) {
  const started = draft?.restStartedAtMs;
  if (!Number.isFinite(started) || started > nowMs + 60_000) return null; // no timer, or a clock that went back a lot
  const totalSec = restLength(draft, settings);
  const remainingMs = totalSec * 1000 - Math.max(0, nowMs - started);
  if (remainingMs < -HIDE_AFTER_OVER_MS) return null;
  return {
    totalSec,
    remainingMs: Math.max(0, remainingMs),
    remainingSec: Math.max(0, Math.ceil(remainingMs / 1000)),
    over: remainingMs <= 0,
    overMs: Math.max(0, -remainingMs),
  };
}

// 83 -> "1:23"
export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// -15 or +15 seconds on the length of this session's rests. Returns the new length.
export const adjustedRestLength = (draft, settings, delta) => clamp(restLength(draft, settings) + delta);

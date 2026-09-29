// Text for the screens. Pure functions, so they are tested without a DOM.

import { TIME_ZONE } from '../time.js';
import { AuthError } from '../store/auth.js';
import { ApiError } from '../store/api.js';

const COLD_START_MS = 400; // about where the plan's 0.3-1 s cold start begins

// Does this failure mean the person has to sign in again?
export const needsSignIn = (err) => err instanceof AuthError && (err.kind === 'signed_out' || err.kind === 'unavailable');

// One sentence for any failure from sign-in or sync.
export function describeError(err) {
  if (err instanceof AuthError) {
    switch (err.kind) {
      case 'not_authorized': return 'Incorrect email or PIN.';
      case 'unavailable': return 'Sign-in unavailable.';
      case 'throttled': return 'Too many attempts. Wait a minute and try again.';
      case 'network': return 'Cannot reach the sign-in service. Check your connection.';
      case 'signed_out': return 'Your session expired. Sign in again.';
      default: return 'Sign-in failed. Try again.';
    }
  }
  if (err instanceof ApiError) {
    const detail = err.body?.errors?.[0];
    if (err.status === 0) return 'Cannot reach the server. Your events are saved on this device.';
    if (err.status === 401) return 'The API rejected the sign-in token. Check the app client id and API URL in js/config.js.';
    if (err.status === 403) return 'This account is not allowed to use the API yet (OwnerSub is not set).';
    if (err.status === 429) return 'The server is busy. Trying again shortly.';
    if (err.status >= 500) return 'The server had a problem. Trying again shortly.';
    if (detail) return `Rejected: ${detail.field} ${detail.reason}`;
    return err.message;
  }
  return 'Something went wrong on this device.';
}

const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', second: '2-digit' });
export const timeOfDay = (ms) => clock.format(ms);

// The one-line sync state: { text, kind: 'info' | 'ok' | 'error' }.
export function describeSync(status, { pending = 0, now = Date.now() } = {}) {
  if (status.syncing) return { text: 'Syncing…', kind: 'info' };
  if (status.lastError) {
    const retry = status.retryAt ? ` Retrying in ${Math.max(1, Math.round((status.retryAt - now) / 1000))} s.` : '';
    return { text: `Not synced. ${describeError(status.lastError)}${retry}`, kind: 'error' };
  }
  if (status.lastSyncAt) {
    return { text: pending > 0 ? `Synced at ${timeOfDay(status.lastSyncAt)}; ${pending} still waiting.` : `Up to date at ${timeOfDay(status.lastSyncAt)}.`, kind: 'ok' };
  }
  return { text: 'Not synced yet.', kind: 'info' };
}

export function describeRoundTrip(status) {
  if (status.rttMs === null || status.rttMs === undefined) return 'none yet';
  const slow = status.rttMs >= COLD_START_MS ? ' (slow: probably a Lambda cold start)' : ' (warm)';
  return `${status.lastRttLabel} ${status.rttMs} ms${slow}`;
}

// A short description of an event's payload for the list.
export function describeEvent(ev) {
  const p = ev.payload ?? {};
  if (typeof p.notes === 'string') return p.notes;
  const s = JSON.stringify(p);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

// "3 sessions, 12 sets, 2 settings"
export function describeState(state) {
  const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return [
    n(Object.keys(state.sessions).length, 'session'),
    n(Object.keys(state.sets).length, 'set'),
    n(Object.keys(state.settings).length, 'setting'),
  ].join(', ');
}

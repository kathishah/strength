// Phase A spike page: sign in, send a test event, sync, and measure the round trip.
// No outbox, engine, or session screen yet (DEPLOYMENT-PLAN.md section 9, phase A).

import { isConfigured } from './config.js';
import { AuthError, hasRefreshToken, signIn, signOut } from './auth.js';
import { ApiError, buildTestEvent, getEvents, postEvents } from './api.js';
import { getDeviceId } from './ids.js';

const EVENTS_KEY = 'strength.spike.events';
const CURSOR_KEY = 'strength.cursor';
const COLD_START_MS = 400; // about where the plan's 0.3-1 s cold start begins
const PAGE_LIMIT = 500;
const MAX_PAGES = 200;
const MAX_LISTED = 30;

const $ = (id) => document.getElementById(id);
const el = {
  notice: $('notice'), signin: $('signin'), form: $('signin-form'), email: $('email'), password: $('password'),
  signinButton: $('signin-button'), app: $('app'), send: $('send-button'), sync: $('sync-button'),
  signout: $('signout-button'), rtt: $('rtt'), hint: $('rtt-hint'), cursor: $('cursor'), count: $('count'),
  empty: $('empty'), list: $('events'),
};

// ---- local storage (a cache only; the server is the source of truth) ----
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const loadEvents = () => load(EVENTS_KEY, []);
const loadCursor = () => {
  try { return localStorage.getItem(CURSOR_KEY) || null; } catch { return null; }
};
// Both return false if the browser refuses the write, so the caller can avoid advancing the cursor.
function saveEvents(events) {
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); return true; } catch { return false; }
}
function saveCursor(cursor) {
  try { localStorage.setItem(CURSOR_KEY, cursor); return true; } catch { return false; }
}

// ---- view ----
let busy = false;
let signedIn = false;
const rttHistory = [];

function notify(text, kind = 'info') {
  el.notice.textContent = text;
  el.notice.className = kind === 'info' ? 'notice' : `notice ${kind}`;
  el.notice.hidden = !text;
}

function setBusy(value) {
  busy = value;
  for (const b of [el.signinButton, el.send, el.sync]) b.disabled = value;
}

function showSignedIn(value) {
  signedIn = value;
  el.signin.hidden = value;
  el.app.hidden = !value;
  if (value) render();
}

function recordRoundTrip(label, ms) {
  rttHistory.unshift(`${label} ${ms} ms`);
  rttHistory.length = Math.min(rttHistory.length, 5);
  el.rtt.textContent = rttHistory[0];
  const slow = ms >= COLD_START_MS;
  el.hint.textContent =
    (slow
      ? 'Slow: probably a Lambda cold start (the first request after a quiet spell takes about 0.3-1 s). Press Sync again to compare.'
      : 'Fast: the Lambda is warm.') + (rttHistory.length > 1 ? ` Recent: ${rttHistory.join(', ')}.` : '');
}

function describe(ev) {
  const p = ev.payload ?? {};
  if (typeof p.notes === 'string') return p.notes;
  const s = JSON.stringify(p);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

function render() {
  const events = loadEvents().sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : a.id < b.id ? 1 : -1));
  el.cursor.textContent = loadCursor() ?? 'none';
  el.count.textContent = String(events.length);
  el.empty.hidden = events.length > 0;
  el.list.replaceChildren(
    ...events.slice(0, MAX_LISTED).map((ev) => {
      const li = document.createElement('li');
      const kind = document.createElement('div');
      kind.className = 'kind';
      kind.textContent = `${ev.type} · ${describe(ev)}`;
      const meta = document.createElement('div');
      meta.className = 'meta mono';
      meta.textContent = `${ev.entityId} · ${ev.ts}${ev.recvAt ? ` · received ${ev.recvAt}` : ''}`;
      li.append(kind, meta);
      return li;
    }),
  );
}

// ---- errors ----
function authMessage(err) {
  switch (err.kind) {
    case 'not_authorized': return 'Incorrect email or password.';
    case 'unavailable': return 'Sign-in unavailable.';
    case 'throttled': return 'Too many attempts. Wait a minute and try again.';
    case 'network': return 'Cannot reach the sign-in service. Check your connection.';
    case 'signed_out': return 'Your session expired. Sign in again.';
    default: return 'Sign-in failed. Try again.';
  }
}

// Turns any failure into a message; sends the user back to the form if the session is gone.
function handleFailure(err) {
  if (err instanceof AuthError) {
    if (err.kind === 'signed_out' || err.kind === 'unavailable') showSignedIn(false);
    notify(authMessage(err), 'error');
  } else if (err instanceof ApiError) {
    const detail = err.body?.errors?.[0];
    if (err.status === 401) notify('The API rejected the sign-in token. Check the app client id and API URL in js/config.js.', 'error');
    else if (err.status === 403) notify('This account is not allowed to use the API yet (OwnerSub is not set).', 'error');
    else if (detail) notify(`Rejected: ${detail.field} ${detail.reason}`, 'error');
    else notify(err.message, 'error');
  } else {
    console.error(err);
    notify('Something went wrong.', 'error');
  }
}

async function guarded(action) {
  if (busy) return;
  setBusy(true);
  try {
    await action();
  } catch (err) {
    handleFailure(err);
  } finally {
    setBusy(false);
  }
}

// ---- actions ----
// Pulls every page after the saved cursor. The cursor is saved only after the page's events
// are stored locally, so a failed write means the next sync fetches that page again.
async function syncNow() {
  let cursor = loadCursor();
  const byId = new Map(loadEvents().map((e) => [e.id, e]));
  let added = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, ms } = await getEvents({ since: cursor, limit: PAGE_LIMIT });
    recordRoundTrip('GET /events', ms);
    for (const ev of data.events) {
      if (!byId.has(ev.id)) { byId.set(ev.id, ev); added++; }
    }
    if (!saveEvents([...byId.values()])) throw new Error('Could not store events on this device.');
    if (data.cursor) {
      if (!saveCursor(data.cursor)) throw new Error('Could not save the sync position.');
      cursor = data.cursor;
    }
    render();
    if (!data.more) break;
  }
  return added;
}

async function sync() {
  const added = await syncNow();
  notify(added ? `Synced: ${added} new event${added === 1 ? '' : 's'}.` : 'Synced: nothing new.', 'ok');
}

async function sendTest() {
  const { data, ms } = await postEvents(getDeviceId(), [buildTestEvent(getDeviceId())]);
  recordRoundTrip('POST /events', ms);
  notify(`Sent: ${data.accepted} accepted, ${data.duplicates} duplicate. Press Sync to pull it back.`, 'ok');
}

// ---- wiring ----
el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  guarded(async () => {
    notify('');
    await signIn(el.email.value.trim(), el.password.value);
    el.password.value = '';
    showSignedIn(true);
    await sync();
  });
});
el.send.addEventListener('click', () => guarded(sendTest));
el.sync.addEventListener('click', () => guarded(sync));
el.signout.addEventListener('click', () => guarded(async () => {
  await signOut();
  showSignedIn(false);
  notify('Signed out.');
}));

// Opening the app is the warm-up (plan section 3): the normal sync doubles as the wake-up call.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && signedIn) guarded(sync);
});

function start() {
  if (!isConfigured()) {
    showSignedIn(false);
    el.signin.hidden = false;
    el.signinButton.disabled = true;
    notify('Not configured yet: fill in js/config.js (see BUILD.md).');
    return;
  }
  if (hasRefreshToken()) {
    showSignedIn(true);
    guarded(sync);
  } else {
    showSignedIn(false);
  }
}
start();

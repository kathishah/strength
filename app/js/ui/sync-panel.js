// The signed-in screen for now: what is stored on this device, what is waiting to upload, and buttons to
// write a test note and sync. Phase C to E replace this with Home, the session screen and history.

import { describeEvent, describeRoundTrip, describeState, describeSync, timeOfDay } from './format.js';

const MAX_LISTED = 30;

const $ = (id) => document.getElementById(id);

function row(kindText, metaText) {
  const li = document.createElement('li');
  const kind = document.createElement('div');
  kind.className = 'kind';
  kind.textContent = kindText;
  const meta = document.createElement('div');
  meta.className = 'meta mono';
  meta.textContent = metaText;
  li.append(kind, meta);
  return li;
}

// handlers: { onAddNote, onSync, onSignOut }. Returns { render }, which also runs on every change.
export function mountSyncPanel({ events, sync }, handlers) {
  const el = {
    addNote: $('note-button'), sync: $('sync-button'), signOut: $('signout-button'),
    syncState: $('sync-state'), pending: $('pending'), count: $('count'), stateSummary: $('state-summary'),
    storage: $('storage'), cursor: $('cursor'), rtt: $('rtt'),
    rejected: $('rejected'), rejectedList: $('rejected-list'),
    empty: $('empty'), list: $('events'),
  };
  el.addNote.addEventListener('click', handlers.onAddNote);
  el.sync.addEventListener('click', handlers.onSync);
  el.signOut.addEventListener('click', handlers.onSignOut);

  function render() {
    const status = sync.status();
    const pendingIds = new Set(events.pending().map((e) => e.id));
    const line = describeSync(status, { pending: pendingIds.size });
    el.syncState.textContent = line.text;
    el.syncState.dataset.kind = line.kind;
    el.pending.textContent = pendingIds.size === 0 ? 'nothing' : `${pendingIds.size} event${pendingIds.size === 1 ? '' : 's'}`;
    el.count.textContent = String(events.eventCount());
    el.stateSummary.textContent = describeState(events.state);
    el.storage.textContent = events.persistent
      ? 'IndexedDB'
      : 'memory only: IndexedDB is unavailable, so events will be lost when this page closes';
    el.cursor.textContent = events.cursor() ?? 'none';
    el.rtt.textContent = describeRoundTrip(status);
    el.sync.disabled = status.syncing;

    const rejected = events.rejected();
    el.rejected.hidden = rejected.length === 0;
    el.rejectedList.replaceChildren(
      ...rejected.map((r) => row(`${r.event.type} · ${r.reason}`, `${r.event.entityId} · ${r.event.ts} · set aside at ${timeOfDay(r.at)}`)),
    );

    // Newest first, in replay order (by instant, not by string).
    const all = events.events().reverse();
    el.empty.hidden = all.length > 0;
    el.list.replaceChildren(
      ...all.slice(0, MAX_LISTED).map((ev) => {
        const where = pendingIds.has(ev.id) ? 'waiting to upload' : ev.recvAt ? `received ${ev.recvAt}` : 'uploaded';
        return row(`${ev.type} · ${describeEvent(ev)}`, `${ev.entityId} · ${ev.ts} · ${where}`);
      }),
    );
  }

  events.subscribe(render);
  sync.subscribe(render);
  return { render };
}

// Settings in local-only mode (spec section 4, "Local-only design"): Storage, Export backup, the line about moving to AWS, and Clear data.
// Network-free on purpose (local mode never loads ui/format.js): it imports only dom.js, state-text.js, time.js and profile.js.

import { armedButton, h } from './dom.js';
import { describeState } from './state-text.js';
import { pacificDate } from '../time.js';
import { clearProfile } from '../profile.js';

export const NOT_SAVING_TEXT = "This browser isn't saving your workouts. They will be lost when you close the page. Export a backup before you leave.";
export const CLEAR_ARMED_TEXT = 'Tap again to delete all workouts on this device. Export first if you want a copy.';

// The backup file, in the format of scripts/export-data.mjs: { exportedAt, count, events }. `events` is every event this device holds in replay
// order, as stored (a local event has no recvAt). scripts/post-events.mjs reads it as it is.
export function buildBackup(events, now = Date.now()) {
  const list = events.events();
  return { exportedAt: new Date(now).toISOString(), count: list.length, events: list };
}

export const backupFileName = (now = Date.now()) => `strength-events-${pacificDate(now)}.json`;
export const backupText = (backup) => `${JSON.stringify(backup, null, 2)}\n`;

// Gives the browser a file to save: a Blob behind a temporary link that is clicked.
export function downloadFile(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Back to Home of an empty app: drop the route first, so the reload does not land on Settings.
function reloadToHome() {
  try { globalThis.history?.replaceState(null, '', `${location.pathname}${location.search}`); } catch { /* not allowed here: reload where we are */ }
  location.reload();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const finishedCount = (state) => Object.values(state.sessions).filter((s) => typeof s.finishedAt === 'string').length;

// ctx: the settings hook's ctx (events, storage, profile, persistent, notify). deps are for tests.
export function mountLocalSettings(ctx, host, { download = downloadFile, reload = reloadToHome, now = Date.now } = {}) {
  const saved = h('dd');
  const count = h('dd');
  const finished = h('dd');
  const exportButton = h('button', {
    type: 'button', class: 'btn primary',
    onclick() {
      const backup = buildBackup(ctx.events, now());
      download(backupFileName(now()), backupText(backup));
      ctx.notify(`Backup downloaded: ${plural(backup.count, 'event')}.`, 'ok');
    },
  }, 'Export backup');
  const exportNote = h('p', { class: 'muted small' });
  const clearButton = armedButton(h('button', { type: 'button', class: 'btn danger' }, 'Clear data on this device'), {
    armedText: CLEAR_ARMED_TEXT,
    ms: 8000,
    async onConfirm() {
      clearButton.disabled = true;
      await clearProfile(ctx.profile, { storage: ctx.storage });
      reload();
    },
  });

  host.append(
    h('section', { class: 'card', 'aria-label': 'Storage' },
      h('h3', { text: 'Storage' }),
      h('dl', { class: 'stats' },
        h('dt', { text: 'Saved on this device' }), saved,
        h('dt', { text: 'Events' }), count,
        h('dt', { text: 'Finished workouts' }), finished)),
    h('section', { class: 'card', 'aria-label': 'Export backup' },
      h('h3', { text: 'Export backup' }),
      h('p', { class: 'muted', text: 'Download everything this browser holds as one file. There is no import in the app.' }),
      h('div', { class: 'actions' }, exportButton),
      exportNote,
      h('p', { class: 'muted small' },
        'Moving to your own AWS deployment? Export a backup, then upload it with ', h('code', { text: 'scripts/post-events.mjs' }), ' (see the self-hosting guide).')),
    h('section', { class: 'card', 'aria-label': 'Clear data' },
      h('h3', { text: 'Clear data on this device' }),
      h('p', { class: 'muted', text: 'Deletes every workout saved in this browser. Your theme choice stays.' }),
      h('div', { class: 'actions' }, clearButton)),
  );

  function paint() {
    const n = ctx.events.eventCount();
    saved.textContent = ctx.persistent ? 'Yes, in this browser (IndexedDB)' : 'No. This browser is not keeping your workouts; they will be lost when the page closes.';
    saved.dataset.kind = ctx.persistent ? 'ok' : 'error';
    count.textContent = `${n} (${describeState(ctx.events.state)})`;
    finished.textContent = String(finishedCount(ctx.events.state));
    exportButton.disabled = n === 0;
    exportNote.textContent = n === 0 ? 'Nothing to back up yet.' : '';
    exportNote.hidden = n !== 0;
  }
  paint();
  return { update: paint };
}

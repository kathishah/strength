// Local-only mode's own screens and wording (spec section 4). boot.js needs no change.
// The hooks are described in boot.js ("Mode hooks"). Each is optional and unset hooks fall back to a plain default:
//   prepare(ctx)          async, once, after storage opens and before the first screen
//   saveChip(ctx)         -> { text, kind, pending, label? }   the header chip ("On this device") and the header panel's save line
//   strip(ctx)            -> Node | null    a strip above the header on every screen
//   notice(ctx)           -> Node | null    a notice that stays at the top of every screen (storage is not persistent)
//   homeNote(ctx)         -> Node | null    a note at the top of Home only (the one-time "saved in this browser only" note)
//   settings(ctx, host)   -> { update?, destroy? } | void    Settings content under the heading (Storage, Export backup, Clear)
// ctx: { mode, profile, events, actions, storage, persistent, notify, refresh, header }; settings also gets the screen's ctx fields.
// Call ctx.refresh() after something a hook depends on changes (a dismissed note) and boot.js asks the hooks again.
//
// Local mode uses saveChip, notice, homeNote and settings. It must stay network-free: import only modules that boot.js may reach.

import { h } from '../ui/dom.js';
import { NOT_SAVING_TEXT, mountLocalSettings } from '../ui/local-settings.js';

export const CHIP_LABEL = 'On this device';
export const CHIP_TEXT = 'Saved in this browser only. Not synced to other devices.';
export const HOME_NOTE_TEXT = 'Your workouts are saved in this browser only. Export a backup from Settings.';

const seenKey = (ctx) => `${ctx.profile.keyPrefix}localNoticeSeen`;

// Dismissals this page remembers even when localStorage is blocked (the note then returns on the next visit).
const dismissed = new WeakSet();

function noteSeen(ctx) {
  if (dismissed.has(ctx.profile)) return true;
  try { return localStorage.getItem(seenKey(ctx)) !== null; } catch { return false; }
}

export const localUi = {
  saveChip: (ctx) => (ctx.persistent
    ? { text: CHIP_TEXT, kind: 'info', pending: 0, label: CHIP_LABEL }
    : { text: `Not saved: this browser is not keeping your workouts. ${CHIP_TEXT}`, kind: 'warn', pending: 0, label: CHIP_LABEL }),

  notice: (ctx) => (ctx.persistent ? null : h('p', { class: 'notice', text: NOT_SAVING_TEXT })),

  homeNote(ctx) {
    if (noteSeen(ctx)) return null;
    return h('div', { class: 'notice note-row' },
      h('span', { text: HOME_NOTE_TEXT }),
      h('button', {
        type: 'button', class: 'btn quiet', 'aria-label': 'Dismiss this note',
        onclick() {
          dismissed.add(ctx.profile);
          try { localStorage.setItem(seenKey(ctx), '1'); } catch { /* storage blocked: gone for this visit only */ }
          ctx.refresh();
        },
      }, 'Dismiss'));
  },

  settings: (ctx, host) => mountLocalSettings(ctx, host),
};

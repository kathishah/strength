// Local-only mode's own screens and wording (spec section 4). This file is the one place the local-only task fills in; boot.js needs no change.
// The hooks are described in boot.js ("Mode hooks"). Each is optional and unset hooks fall back to a plain default:
//   prepare(ctx)          async, once, after storage opens and before the first screen
//   saveChip(ctx)         -> { text, kind, pending, label? }   the header chip ("On this device") and the header panel's save line
//   strip(ctx)            -> Node | null    a strip above the header on every screen
//   notice(ctx)           -> Node | null    a notice that stays at the top of every screen (storage is not persistent)
//   homeNote(ctx)         -> Node | null    a note at the top of Home only (the one-time "saved in this browser only" note)
//   settings(ctx, host)   -> { update?, destroy? } | void    Settings content under the heading (Storage, Export backup, Clear)
// ctx: { mode, profile, events, actions, storage, persistent, notify, refresh, header }; settings also gets the screen's ctx fields.
// Call ctx.refresh() after something a hook depends on changes (a dismissed note) and boot.js asks the hooks again.

export const localUi = {};

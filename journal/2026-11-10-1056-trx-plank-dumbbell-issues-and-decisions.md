# TRX removal, plank time per set, dumbbell upper-body options: issues and decisions (2026-11-10)

Three changes asked for by the owner in one message. This entry records the request, what the code showed, and the decisions made. The [draft spec](2026-11-10-1056-trx-plank-dumbbell-spec-draft.md) and the [implementation plan](2026-11-10-1056-trx-plank-dumbbell-implementation-plan.md) follow from it.

**Recorded late.** The project's order is journal first (draft spec and plan), then code. This entry, the draft and the plan were written after the TRX removal edits (change 1) had already been started in the working tree (uncommitted, branch `trx-removal-plank-time-db-options`). Nothing for changes 2 and 3 was written before this entry. The TRX edits are checked against the draft, not the other way round.

## The request

1. Remove the TRX alternatives ("we haven't needed them in a while") and the TRX button entirely.
2. Plank: save the time for each rep (set), starting at 45 seconds.
3. Upper-body exercises: add more dumbbell-based options. The list comes first; the owner expects new animated GIFs to be needed.

## What the code showed

**Change 1.** TRX is more than a button. `trxAlternatives` is a field of every slot in `app/js/seed/program.js`; 10 `trx-*` catalog entries (7 with Truman State GIF URLs in `scripts/image-sources.json`) and 10 rules; the `suspension` progression type (a level 1-5 box, also shared with the pushup `ladder`, which stays); `optionGroups.trx`, the fuchsia button and CSS in the app and in the landing-page phone preview; `docs/MEDIA-RIGHTS-AUDIT.md` counts (58 URLs, 6 domains, Truman row); spec 4.5.1 and its table, 5.4, 5.12, 5.7 examples, 6.x text. About 14 test files mention it.

**Change 2.** Plank (`hold`, 20-40 s) is "completion only": no input boxes, the card says "Do your sets, then tap the tick", and the set is logged with no value. There is no field on a set for seconds, so this needs a new optional field on `set.logged` and `set.edited` (`holdSeconds`), accepted by the server validator (`lambda/events/registry.mjs` rejects unknown fields), by replay, the draft and the docs. Local-only mode needs no server.

**Change 3.** Needs a list approved before any code or images. See the list in the chat and, once agreed, a new entry.

## Decisions

- **D1. Existing logs.** Sets already logged for a `trx-*` id stay in the log untouched. A `swap.set` event naming a TRX exercise is ignored (the slot falls back to its default; `exerciseForSlot` already does this). History views skip ids with no rules (existing guards in `history-view.js`, `session-view.js`). No migration, no event is rewritten or deleted.
- **D2. `suspension` goes too.** Nothing else uses it. `ladder` (pushup) keeps the level box.
- **D3. Plank time, per set.** Each plank set has its own seconds dial (5 s notches), not one shared dial, since "the time for each rep" differs set to set. It opens at 45 s with no history, then at what that set was last time (the v1.21 per-set rule). No progression: the number is never raised by the app.
- **D4. Plank only.** Side plank and bird-dog (weighted hold) stay completion-only. Side plank is 15-20 s, so a 45 s start would be wrong for it; the owner said "plank".
- **D5. 45 s replaces 20-40 s.** The card prescription for plank becomes "2 × 45 s hold" (spec 4.5.1's "20-40 s" disappears with the section).
- **D6. Deploy order.** The Lambda validator change (`holdSeconds`) must be deployed before the app that sends it, or plank sets fail to sync until it is.
- **D7. Images.** The 7 Truman GIFs were never in the default deploy; the audit doc and the image count drop by 7 (58 to 51).

## Open

- Side plank: add the same time box (start 20 s)? Not done.
- Change 3: the exercise list, and who makes the GIFs.

**Not covered:** nothing here has run when this was written.

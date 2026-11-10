# TRX removal and plank time, milestone 1: TRX removed (2026-11-10)

Result of milestone 1 of the [plan](2026-11-10-1056-trx-plank-dumbbell-implementation-plan.md). Not committed: the work is in the working tree of branch `trx-removal-plank-time-db-options`.

**Order, honestly.** The code edits for this milestone were made before the journal entries were written (see the note in [issues and decisions](2026-11-10-1056-trx-plank-dumbbell-issues-and-decisions.md)). Also, the spec text for TRX (the v1.22 changelog line, 4.5.1 reduced to a stub, the other mentions) was merged in this milestone and not milestone 3, because `test/rules.test.mjs` and `test/spec-examples.test.mjs` read the spec and would have gone red otherwise. Milestone 3 now only covers the plank text.

## What changed

- Seed: the 10 `trx-*` catalog entries and rules, `trxAlternatives` on every slot, 7 URLs in `scripts/image-sources.json`.
- Engine and logging: `suspension` progression and type, `optionGroups.trx`, `levelText`; `exerciseForSlot` offers only `alternatives`.
- UI: the TRX button, its colours and panel in `day-screen.js`, `app.css`, and the landing-page preview (`landing/phone-preview.js`, `.css`).
- Docs: `docs/MEDIA-RIGHTS-AUDIT.md` and `SELF-HOSTING.md` (58 to 51 URLs, six domains to five), spec v1.22 changelog, 4.5.1 stub, 5.7 examples 34 and 38 now use the pushup, section 8 type list.
- Tests: TRX cases rewritten to the pushup ladder or `side-plank`, the 4.5.1 spec test removed, the catalog count 65 to 55, the two 5.7 fingerprints updated.

## Found while checking: a real bug in my first pass

`summaryView` called `suggestExercise` for every exercise in a finished workout, and that throws for an id with no rules. A finished workout that contained an old TRX set would have broken its summary screen. Fixed with a guard in `app/js/logging/summary.js` (listed, no callout) and covered by "an old log with TRX in it" in `test/plank-time.test.mjs`. History, the exercise page, the CSV export and an open workout were checked the same way and were already safe.

## Checked

- `node --test`: 730 tests, all pass (baseline 734; the difference is the TRX tests removed or merged).
- `grep -rniE 'trx|suspension' app landing scripts lambda demo test-support`: nothing.
- Browser (local-only mode, `app/` served on port 4173): Workout A shows only **Options** (counts 4, 4, 3, 4, 4, 4), the Options panel opens with 4 items, no element with a `trx` class or `data-group`, no console errors.

**Not covered:** the landing page (`landing/`) was not opened in a browser; the `demo/` page was not opened (its test passes). The seven `app/img/trx-*.gif` files on this machine are untracked and were left alone.

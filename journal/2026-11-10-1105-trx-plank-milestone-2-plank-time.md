# TRX removal and plank time, milestone 2: plank time per set (2026-11-10)

Result of milestone 2 of the [plan](2026-11-10-1056-trx-plank-dumbbell-implementation-plan.md), against the [draft spec](2026-11-10-1056-trx-plank-dumbbell-spec-draft.md). Not committed.

## What changed

- New optional set field `holdSeconds` (whole seconds, 1-3600): `lambda/events/registry.mjs` (`set.logged` and `set.edited`), `store/replay.js`, `logging/draft.js`, `logging/session-events.js`, and a `holdSeconds` column in the CSV export (`scripts/export-lib.mjs`).
- New progression `timed` (plank): `rules.js` (`plank` is `timed`, `holdSeconds: 45`), `engine/history.js` (`setHolds`, performance in seconds), `engine/suggest.js`. `hold` (side plank, weighted bird dog) now shows no boxes; before it said `hold: true` but nothing drew it.
- Rows and card: `logging/rows.js` (pre-fill per set, linked while equal, a skipped set does not blank the next one, `canLog` wants whole seconds), `logging/input.js` (5 s notches, to at least 180), `ui/day-screen.js` (one seconds dial per set, skip by tapping the caption), `logging/text.js` ("45 s, 50 s"), `history-view.js` and `ui/exercise-screen.js` (kind `time`, "Longest (s)"), `summary.js`.
- Spec v1.22: second changelog bullet, 4.5, 4.5.2 table, 5.4 (timed hold), 6.3, 6.6, section 8 (SetLog `holdSeconds`).
- Tests: new `test/plank-time.test.mjs` (P-1 to P-6, rules, validator ranges, replay, draft, history, summary, CSV, the old-TRX-log cases), `holdSeconds` added to the registry range table, a `hold()` helper in `test-support/engine-log.mjs`. P-5 (swap plank in from the dead bug slot) is the existing "swap into an exercise added in v1.19" test; P-7 (side plank) is in `logging-actions` and `logging-rows`.

## Checked

- `node --test`: 753 tests, all pass.
- Browser (local-only): Workout A, Dead Bug, Options, Use this on Plank: the card reads "2 × 45 s hold", two dials "Plank set 1 / set 2 time held in seconds" both at 45. Tapping set 2's caption dims it; the tick logged only set 1 and the card read "45 s"; Undo restored both dials to 45. The test data was deleted from the preview browser afterwards.
- Gotcha for anyone testing by hand: the browser kept the old module files from its HTTP cache, which showed up as `no dial for "holdSeconds"`. It was the cache, not the code; fetching the files with `cache: 'reload'` and reloading cleared it.

## Deploy

The server validator changed. Deploy the stack (`scripts/deploy-stack.sh`) **before** the app (`scripts/deploy-app.sh`); an old server rejects a plank set with `unknown field`. Local-only mode needs nothing.

**Not covered:** no deploy, and no sync against a real server. Not run on a phone or in landscape. The weight and reps columns are unchanged. Typing a time with the dial on a touch device was not tried (the dial is the existing one).

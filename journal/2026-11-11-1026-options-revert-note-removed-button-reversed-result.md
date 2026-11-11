# Options list: note removed, Revert reversed: result (2026-11-11)

Result of the [decisions and plan](2026-11-11-1012-options-revert-note-removed-button-reversed.md), on branch `fix/alt-exercise`. Not committed when this was written (the earlier work on the branch is not committed either).

## What changed

- `app/js/ui/day-screen.js`: the "Swapped from <original> · Revert" line is gone from the card; the Revert row button has the class `alt-use revert`.
- `app/js/logging/session-view.js`, `day-view.js`: `swappedFromName` removed from the card model (nothing else read it).
- `app/css/app.css`: `.swap-note`, `.revert-btn` and the `--swap` colour removed (also from `landing/phone-preview.css`, where it was an unused token); new `--revert-bg`, `--revert-text`, `--revert-border` per theme and `.alt-use.revert`. The `.alt-use:disabled` rule went with it: no row is disabled any more.
- `test/logging-view.test.mjs`, `test/logging-edit-finished.test.mjs`: no longer assert `swappedFromName`; the first asserts the card does not have it.
- `docs/SPEC-strength.md`: the v1.23 bullet and the 6.3 Options list bullet say the note is removed and describe the Revert colours (W1, W2). No difference from the plan. S1 (reverse follows the theme) and S2 (nothing replaces the note) were taken as drafted and are not confirmed.

## Checked

- `node --test`: 755 tests, all pass, after the change.
- Browser, 375 × 812, local-only mode, Workout A, Goblet Squat swapped to Leg Press:
  - Light theme: no `.swap-note` or `.revert-btn` on the page; Options first row **Goblet Squat [Revert]** with a dark background (`rgb(15, 23, 42)`) and bright text (`rgb(248, 250, 252)`); the Use this rows keep their indigo tint and dark text. Seen in a screenshot.
  - Dark theme (after a reload): Revert is bright (`rgb(248, 250, 252)`) with dark text; Use this unchanged. Seen in a screenshot.
  - Pressing Revert: title back to Goblet Squat, no note, no Revert button in the list.
- The browser's service worker and HTTP cache had to be cleared to load the new files (as in the previous result).

## Not covered

- Contrast was judged by eye, not measured. The dark-theme choice (S1) is a bright button, not a dark one.
- Not opened: Workouts B and C, landscape, the landing page's phone preview (it has no swapped state; it only lost an unused colour token), and a mouse hover or keyboard focus on the Revert button (no new hover or focus style was added).
- No automated test draws the panel or checks colours.

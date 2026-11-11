# Options list: the original with Revert: result (2026-11-11)

Result of the [finding, spec and plan](2026-11-11-0947-options-list-revert.md), on branch `fix/alt-exercise`. Not committed when this was written.

## What changed

- `app/js/logging/session-view.js`: `optionGroups.alternatives` is now built by `listedOptions`: the choices that are not on the card, with the default (when it is not the current one) first and marked `revert: true`. `swapOptions` is unchanged, so `actions.swap` still accepts the default.
- `app/js/ui/day-screen.js`: the row button reads **Revert** for a `revert` row and **Use this** otherwise; the disabled "In use" state is gone. No action or event changed (Revert is the existing swap back to the default, which writes `swap.cleared`).
- `test/logging-view.test.mjs`: "Options is the one list" rewritten: unswapped list is the four alternatives with none current or `revert`; swapped to Box Squat, the list is Goblet Squat (`revert`), Leg Press, Hack Squat, Leg Extension, with Box Squat absent and the same length as before; `swapOptions` still holds the default and marks Box Squat current.
- `docs/SPEC-strength.md`: title v1.23, a v1.23 changelog bullet, and "What is listed (v1.23)" added to the 6.3 Options list bullet. Matches the draft text (V1, V3); 0.A.6 and 0.B.4 were not rewritten (V2). The decisions R1 (original first) and R2 (the "Swapped from … · Revert" note stays) were taken as drafted and are not confirmed by the owner.

No difference from the plan.

## Checked

- `node --test`: 755 tests, all pass, before and after the change (the one test was rewritten, not added).
- Browser, 375 × 812, local-only mode, Workout A:
  - Goblet Squat, Options (badge 4): Leg Press, Box Squat, Hack Squat, Leg Extension, all **Use this**. After **Use this** on Leg Press: title Leg Press, note "Swapped from Goblet Squat · Revert", badge still 4, list **Goblet Squat [Revert]**, Box Squat, Hack Squat, Leg Extension; Leg Press not listed. Pressing that Revert: title Goblet Squat, note gone, the list as at the start.
  - Dumbbell Bench Press (7) swapped to Pushup: badge 7, panel 185 px tall (three rows) with 426 px of content, **Dumbbell Bench Press [Revert]** the first row, then six with Use this. Reverted again.
- Before the change, the same steps showed Leg Press as a disabled "In use" row and no Goblet Squat (the finding).

## Not covered

- No automated test draws the panel: `day-screen.js` has no DOM test in the repository, so the button text is checked only in the browser.
- Workouts B and C, and the finished-workout view (no Options there, `day-view.js`), were not opened. Landscape and the landing page's phone preview were not looked at (the preview has no swapped state, so it is unaffected).
- The browser's service worker served the old modules until it was unregistered and the cache cleared. An installed copy of the app picks up the change only after the next deploy and service-worker update.

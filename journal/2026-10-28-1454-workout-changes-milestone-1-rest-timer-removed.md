# Workout changes, milestone 1: rest timer removed (2026-10-28)

Milestone 1 of the [implementation plan](2026-10-28-1138-workout-changes-implementation-plan.md), built on branch `claude/workout-timer-autofill-progression-u8mkdr`, which started at the tip of `main`. The evidence for the change is in the [rest timer evaluation](2026-10-28-1138-rest-timer-removal-evaluation.md); rules R1 to R4 of the [draft spec](2026-10-28-1138-workout-changes-spec-draft.md) are now true of the code. R5 and the spec text itself wait for milestone 3.

**Removed.**

- `app/js/logging/rest-timer.js` and its line in the `app/sw.js` precache list.
- In `ui/day-screen.js`: the rest bar element, the 250 ms interval and its cleanup, `updateRest`, the vibration and the screen-reader announcement, the `card.restText` line and its entry in the card's change key. The screen now mounts only `.day-body`.
- In `logging/actions.js`: `skipRest`, `adjustRest`, and the rest start after Done. The `logged` counter and the `finished` flag existed only for that, so they went too.
- In `logging/draft.js`: `restStartedAtMs`, `restSec`, `startRest`, `clearRest`, `setRestLength`. In `session-view.js`: `REST_TEXT`, `restText`, `rest`. In `day-view.js`: `rest: null`. In `logging/index.js`: the exports.
- In `app/css/app.css`: the `.rest-bar` rules, portrait and landscape. `.ex-rest`, a layout wrapper, and `.sr-only`, which the header still uses, stay.

**Left alone on purpose.** `lambda/events/registry.mjs` still accepts `restTimerDefaultSec`, so events already in a log stay valid and no Lambda deploy is needed; `test/merge.test.mjs` and `test/replay.test.mjs` use it only as an example setting key. `DRAFT_VERSION` is unchanged: `parseDraft` copies only known fields, so a draft saved with rest fields loads with them dropped.

**Tests.** `test/logging-draft-rest.test.mjs` became `test/logging-draft.test.mjs` (`git mv`, so the history follows) with its nine rest-timer tests removed. Also removed: "a correction starts no rest timer" and "every plan card has the rest line". Reworded: the Done test no longer says it starts the rest, the reload test and the view test no longer mention the timer, and the reopened-workout test no longer expects `rest`. New: a draft saved with `restStartedAtMs` and `restSec` is read with them ignored; a draft after Done has no rest fields; the view has no `rest` and no card has `restText`.

**Checks**, from the repository root:

```sh
node --test
grep -rniE 'rest-timer|restStatus|restSec|restStartedAt|rest-bar|skipRest|adjustRest|startRest|clearRest|REST_TEXT|restText|formatClock|REST_STEP' app test demo
```

Result: 711 tests, 710 pass, 1 skipped (baseline 721: 11 timer tests removed, 1 added). The search finds only the five lines of the new tests that assert the fields are absent.

**Browser check.** The app served from `app/` with `python3 -m http.server 4173 --directory app`, local-only mode, at 420 × 900 in the preinstalled Chromium driven by Playwright (scratch script, not committed). Six exercise cards on Workout A. Before and after ticking the first card: no `.rest-bar`, no `role=timer`, no Skip or ±15 buttons, no "Rest about 90" text, no "Rest 1:30" or "Rest over" text. The card shows its done state with "20 lbs × 8, 8, 8", Edit and Undo, and a screenshot shows nothing fixed at the bottom of the screen. No page errors. The browser logged 30 failed requests, all for `img/*`: exercise images are not in the repository and the app shows its placeholder (README, "Local preview").

**Not covered.**

- The demo page was not opened; it runs the same code, and milestone 3's exit check opens it.
- Locking the screen and a real phone were not tried, since the thing that made them matter is gone.
- `buildView` and `sessionView` still take a `nowMs` argument that `buildView` no longer uses. It is part of exported signatures called throughout the tests, and `dayView` still uses it for today's date, so it was left; removing it is a separate tidy-up.
- The spec, `docs/SELF-HOSTING.md:188` and the changelog still describe the timer until milestone 3.

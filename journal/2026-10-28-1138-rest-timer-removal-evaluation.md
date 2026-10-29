# Rest timer removal: evaluation against the code (2026-10-28)

Issue 1 of [workout changes: issues and decisions](2026-10-28-1138-workout-changes-issues-and-decisions.md). Confirmed, and self-contained: nothing else depends on the timer, so it can be removed cleanly.

**What exists.** The timer is pure math in `app/js/logging/rest-timer.js` (90 s default, 15 to 600 s, −15 / +15 steps), kept in the local draft as `restStartedAtMs` and `restSec` (`draft.js:13,18,54-55,98-101`). `saveExercise` starts it after every tick except on a finished workout (`actions.js:129-133`), and `skipRest` and `adjustRest` (`actions.js:87-90`) are the Skip and ±15 buttons. The session view carries `REST_TEXT`, `card.restText` and `view.rest` (`session-view.js:16,113,190`). The screen builds the `.rest-bar` element, a 250 ms `setInterval`, vibration and an aria-live announcement (`ui/day-screen.js:38-76,339,346`), and prints `card.restText` under each cue (`day-screen.js:114`). `app/css/app.css:343-349` and `519-521` style it; `.ex-rest` is an unrelated layout wrapper and stays. `app/sw.js:32` lists the file in the precache, and `test/sw.test.mjs` fails when that list and `app/` differ.

**Spec and docs.** 4.3 (line 308), 6.3 (705), 8 UserProfile (752), 9 (774) and the milestone 4 text in 10 (786) mention it. The struck mentions at lines 19 and 731 are history. `docs/SELF-HOSTING.md:188` says "The rest timer runs after each tick" in the manual test.

**Tests that touch it:** the timer half of `test/logging-draft-rest.test.mjs`, `logging-actions.test.mjs:57-70` and `384-399`, `logging-edit-finished.test.mjs:54-58` and `124-127`, and `logging-view.test.mjs:244-246` and `303-314`. `test/replay.test.mjs` and `test/merge.test.mjs` use `restTimerDefaultSec` only as an example setting key.

**Decision for the removal: leave the server key.** `lambda/events/registry.mjs:129` accepts `restTimerDefaultSec`. The event log is append-only and may already hold such events; removing the key would make a sync reject them and force a Lambda deploy. The app simply stops reading it.

**Old drafts.** `parseDraft` (`draft.js:36-57`) copies only known fields, so a phone holding a draft with the rest fields loads it without trouble. No `DRAFT_VERSION` bump is needed. A test should prove it.

**Not covered:** whether any other screen (History, summary) reads `view.rest`; a search found none, but it was by text, not by running the app.

# Workout changes: implementation plan (2026-10-28)

Plan for [the two changes](2026-10-28-1138-workout-changes-issues-and-decisions.md), against the [draft spec](2026-10-28-1138-workout-changes-spec-draft.md). Nothing is implemented. Work goes on branch `claude/workout-timer-autofill-progression-u8mkdr`.

Each milestone is one commit and ends with its exit check before the next starts. Milestone results are written as new entries named `YYYY-MM-DD-HHMM-workout-changes-milestone-N-<topic>.md`; this plan is not edited. The order puts the most independent change first and the spec edits last, so the spec-coupled tests (`test/spec-coverage.test.mjs`, `test/rules.test.mjs`) go red only when the matching behaviour exists.

Test command for every milestone, from the repository root (Node 22, no install step):

```sh
node --test
```

Baseline: 721 tests, 720 pass, 1 skipped.

| # | Milestone | Main work | Exit check |
| --- | --- | --- | --- |
| 1 | Rest timer removed | Delete `logging/rest-timer.js`, its line in `app/sw.js`, and the `.rest-bar` CSS (`app.css:343-349`, `519-521`). In `ui/day-screen.js` remove the rest imports, element, interval, `updateRest`, `clearInterval` and the `card.restText` line. In `actions.js` remove `skipRest`, `adjustRest` and the `startRest` branch; in `draft.js` remove the two fields and `startRest`, `clearRest`, `setRestLength`; in `session-view.js` remove `REST_TEXT`, `restText` and `rest`; in `day-view.js` the `rest: null`; in `logging/index.js` the re-export. Tests: delete the timer half of `logging-draft-rest.test.mjs` (rename the rest to `logging-draft.test.mjs`) and the rest assertions in `logging-actions`, `logging-edit-finished` and `logging-view`. Add: a draft holding `restStartedAtMs` and `restSec` loads and drops them. Leave `lambda/events/registry.mjs` alone | `node --test` green; `grep -rniE 'rest-timer\|restStatus\|restSec\|restStartedAt\|rest-bar\|skipRest\|adjustRest' app test` returns nothing; in a browser, ticking an exercise shows no bar and the cards carry no rest line |
| 2 | Per-set autofill | `engine/history.js` adds per-set weights and levels to each session record. `suggest.js`: a pre-fill helper for A2, used by `suggestLoad` and `suggestRepeat`, which return `setWeightsLbs` and `setLevels`; keep `weightLbs`, `fromWeightLbs` and `increased`; an existing suggested increase is applied to each pre-filled set (A5). `engine/session.js` `loggedDefaults` takes the set number (A6), passed from `session-events.js` `setLogged` and `actions.js` `saveExercise`. `rows.js`: per-set start values and the linked rule (A4). `text.js` `suggestionText` (A7); `day-screen.js` `dialColumn` includes every pre-filled weight in `dialNotches`. Tests: new `test/autofill.test.mjs` for A-1 to A-9 with a `liftSets()` helper in `test-support/engine-log.mjs`; update the "heaviest weight" expectations in `suggest.test.mjs` (lines 21-30), `logging-rows.test.mjs` and `logging-view.test.mjs` | `node --test` green; in a browser, log 25 / 30 / 35 on an exercise, open the next workout and see 25 / 30 / 35 on the dials; log with a changed set 1 and see the later sets keep their own values |
| 3 | Spec and docs | Merge the [draft spec](2026-10-28-1138-workout-changes-spec-draft.md) into `docs/SPEC-strength.md` as v1.21 (its last section lists every place); check that no 5.7 or 5.12 example breaks, and update the bullet counts in `spec-coverage.test.mjs` and the fingerprints in `spec-examples.test.mjs` only if a bullet changes (the failure message prints them). Edit `docs/SELF-HOSTING.md:188` | `node --test` green; open `demo/` in a browser: no rest bar after a tick, a card with different set weights opens at them |

**Deploy notes.** Static app only; it deploys as before (`docs/SELF-HOSTING.md`). No Lambda change and no new setting.

**Risks.**

- **Linked-sets rule (milestone 2).** The one design choice not made by the owner; see the open choice in the draft spec.
- **Spec-coupled tests (milestone 3).** The likeliest place for a red run; the failure messages say what to update.

**Not covered:** nothing here has run. Counts of changed tests are estimates from reading the files.

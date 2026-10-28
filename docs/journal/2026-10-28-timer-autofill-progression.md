# Journal, 2026-10-28: drop the rest timer, autofill each set from last time, raise weights only when they stand still

**Status:** planned, not implemented. Nothing in `app/`, `lambda/`, `test/` or `docs/SPEC-strength.md` has been changed.
**Baseline:** `node --test` on Node 22.22: 721 tests, 720 pass, 1 skipped, about 13 s.
**Spec this becomes:** v1.21 (section 3 below is the draft text, to be merged into `docs/SPEC-strength.md` when the work is done).

---

## 1. Journal entry

Three things came up while using the app in the gym.

1. **The rest timer between exercises.** After each exercise tick, a bar appears with a countdown, −15 / +15 and Skip. It is not wanted. It should be eliminated completely, not hidden.
2. **Autofill shows the maximum, not last time.** Each exercise card pre-fills every set's dial with the heaviest weight from the previous session. But the weight usually climbs set by set (say 25, 30, 35). The dials should open at exactly what was lifted last time, set by set.
3. **Weight increases are mechanical.** The app proposes an increase on a clock. It should propose one only when the weight for that exercise has stayed the same over 2 or 3 weeks. Raising the weight on my own must count as progress, and the app must not then push a further increase on top.

Decisions taken today, after questions:

| Question | Decision |
|---|---|
| What counts as "the weight stayed the same"? | The per-set pattern. If any set is heavier than the same-numbered set last time, that is progress. |
| How long before an increase is proposed? | 3 sessions in a row at the same weights (not calendar days). |
| When an increase is proposed and sets differ, which sets go up? | Every set, by one step, so the ramp keeps its shape. |
| The static line "Rest about 90 s between sets." | Remove it too. |

Assumptions I made and am flagging, so they can be overruled:

- Reps (and carry distance) keep their current autofill, the recommended number. Only weights, and the level of TRX and pushup exercises, follow last time per set.
- Rep performance still plays no part in progression (spec 5.2 as cut in v1.13). The gate is purely "did the weight change".
- "2 or 3 weeks" was read as 3, matching the 3-session choice. The setting stays adjustable, so 2 is one value away.

---

## 2. Evaluation against the code

### 2.1 Rest timer: confirmed, and self-contained

It exists exactly as described and is easy to remove cleanly. Nothing else depends on it.

| Where | What |
|---|---|
| `app/js/logging/rest-timer.js` (whole file) | Pure timer math: 90 s default, 15 to 600 s, −15 / +15 steps. |
| `app/js/logging/draft.js:13,18,54-55,98-101` | `restStartedAtMs`, `restSec` in the local draft; `startRest`, `clearRest`, `setRestLength`. |
| `app/js/logging/actions.js:10,13,87-90,129-133` | `skipRest`, `adjustRest`; `saveExercise` starts the rest after a tick (not for a finished workout). |
| `app/js/logging/session-view.js:10,16,113,190` | `REST_TEXT`, `card.restText`, `view.rest`. |
| `app/js/logging/day-view.js:60,82` | `rest: null` and comments about the edit view. |
| `app/js/logging/index.js:6` | Re-exports. |
| `app/js/ui/day-screen.js:13,38-76,114,339,346` | The `.rest-bar` element, the 250 ms `setInterval`, `updateRest`, vibration, the aria-live text, the `card.restText` line, cleanup. |
| `app/css/app.css:343-349,519-521` | `.rest-bar` rules (portrait and landscape). `.ex-rest` is an unrelated layout wrapper and stays. |
| `app/sw.js:32` | The file is in the precache list; `test/sw.test.mjs` fails if the list and `app/` differ. |
| `lambda/events/registry.mjs:129` | `restTimerDefaultSec` is an accepted setting key. |
| `docs/SPEC-strength.md` | 4.3 (line 308), 6.3 (705), 8 UserProfile (752), 9 (774), 10 milestone 4 (786); struck mentions at 19 and 731 are history. |
| `docs/SELF-HOSTING.md:188` | The manual test says "The rest timer runs after each tick". |
| Tests | `test/logging-draft-rest.test.mjs` (timer half), `logging-actions.test.mjs:57-70,384-399`, `logging-edit-finished.test.mjs:54-58,124-127`, `logging-view.test.mjs:244-246,303-314`. |

One decision for the removal: leave `restTimerDefaultSec` in the Lambda registry. The event log is append-only and may already hold such events. Removing the key would make a sync reject them, and would force a Lambda deploy. The app simply stops reading it. `test/replay.test.mjs` and `test/merge.test.mjs` use it only as an example key, so they keep passing.

Draft compatibility: `parseDraft` (`draft.js:36-57`) copies only known fields, so a phone holding an old draft with rest fields loads it without trouble. No `DRAFT_VERSION` bump needed. A test should prove it.

### 2.2 Autofill: confirmed, and the data is already there

The cause is one chain of "single number" decisions:

- `engine/history.js:51`: a session's `baseLoad` is the heaviest set (`max`).
- `engine/suggest.js:53-60`: the suggestion is that one number (`weightLbs: base`).
- `logging/rows.js:58-80`: `carryWeight` starts at `suggestion.weightLbs` and is copied to every set, so 25 / 30 / 35 opens as 35 / 35 / 35.
- `ui/day-screen.js` `dialColumn` already draws one dial per set, so the UI needs no new control.

The per-set data already exists: `suggest.js:122-125` returns `last.sets` with each set's weight and level, and `text.js` `lastText` already prints "Last: 25 × 12 · 30 × 12 · 35 × 11". Only the pre-fill ignores it.

There is a quiet side effect worth fixing: ticking through an exercise without touching the dials logs 35 / 35 / 35 and erases the ramp from history, so the problem feeds itself.

Things the change touches beyond the pre-fill:

- `loggedDefaults` (`engine/session.js:32-38`) records one `suggestedWeightLbs` for every set. It should record each set's own pre-fill, or "changed from suggested" (`rows.js:96`) misreads ramps.
- The "carry a changed dial to later sets" rule (spec 6.3, `rows.js` `pick`) would flatten a ramp the moment one dial is touched. It needs a new rule (see 3.2).
- `suggestRepeat` (`suggest.js:65-77`), used by back extension and by TRX and pushup levels, repeats `baseLoad` / `baseLevel`. These follow last time per set as well.
- `dialNotches` (`day-screen.js` `dialColumn`) includes `card.suggestion.weightLbs` in the dial range. It must include every pre-filled weight.

### 2.3 Progression: partly confirmed; it is narrower and different from how it was described

What the code does today (`suggest.js:40-61`, spec 5.12): the "timer" starts at the exercise's last increase, or at its first session. An increase is proposed once `daysBetween(timer, today) >= 21`. A session counts as an increase only when its heaviest set beats the previous session's heaviest set (`lastIncrease`, `suggest.js:23-26`).

Two things differ from how it was described:

- The interval is **21 days**, not 2 weeks (spec 5.12, `PROGRAM.defaultScheduledIncreaseDays`, `seed/rules.js:40`).
- It is not fully blind. Raising the top weight does reset the clock (`test/suggest.test.mjs:143`), so the complaint bites in the cases below, not in every case.

Where it really goes wrong:

| Case | What happens today | Why |
|---|---|---|
| **Ramp changes below the top.** 25 / 30 / 35, then 30 / 35 / 35 (progress on sets 1 and 2). | The clock is not reset. About 3 weeks after the last top-set change it proposes +5 on top of progress already made. | Only the max is compared. This is the case that matters once sets differ. |
| **Time passes without training.** Increase on Oct 1, then no session until Oct 22 (travel, illness). | One session at the new weight and it proposes another increase. | It counts calendar days, not sessions at the weight. |
| **First session.** | The clock starts at the first session, so with a gap it proposes an increase after a single session. | Same cause. |
| **Lighter session.** 60, 60, 50, then 60 again. | The 50 does not reset anything, and the clock keeps running. | A lighter session is deliberately ignored (`suggest.test.mjs:143`, "a lighter session does not"). |
| **Charts and callouts agree with the same flaw.** | The History chart marks an increase only when the top set rises (`history-view.js:111`), and the finish summary says "scheduled" (`summary.js:51`). | They reuse the top-set test and the clock idea. |

### 2.4 What other things the changes touch

- **The spec is test-coupled.** `test/spec-coverage.test.mjs` expects exactly 34 bullets in 5.7 and 9 in 5.12, each live bullet with a numbered test and a SHA-1 fingerprint in `test/spec-examples.test.mjs`. `test/rules.test.mjs` reads tables out of the spec. Editing `docs/SPEC-strength.md` requires updating those tests in the same change. This is why this journal holds the spec draft rather than editing the spec now: an edit now would turn the suite red with no implementation behind it.
- **The demo is built from the 21-day rule.** `demo/fixture.js` (header comment and `ALTERNATIVE` at session index 7) assumes every exercise is due 21 days after its first session. Under the new rule an exercise needs 3 sessions at one weight. Lat pulldown, which is replaced by machine high row in the B session at -10, would have only 2 sessions before the B at -3 and would no longer show its increase. `test/demo-fixture.test.mjs:61-72,168-169` asserts it does. The fixture needs a small adjustment (3.4).
- **Backend:** only one optional change touches the Lambda. A new setting key (`increaseAfterSessions`) must be added to `lambda/events/registry.mjs` and the Lambda deployed before the app writes it. The app does not write settings (the Settings screen for them is not built), so the app can ship first and the key is only needed the first time someone sets it by script.
- `suggestionSource: 'scheduled'` is stored in logged sets and accepted by the registry. Keep the stored value; change only what the screen says.

---

## 3. Specs (v1.21 draft)

### 3.1 No rest timer

- **R1.** No countdown, rest bar, Skip, −15 / +15, vibration or screen-reader announcement exists. Ticking an exercise starts nothing.
- **R2.** Cards no longer say "Rest about 90 s between sets." Spec 4.3 no longer says "Rest about 90 seconds between sets."
- **R3.** The local draft holds no rest fields. A draft saved by an older version loads normally; the rest fields are ignored.
- **R4.** `restTimerDefaultSec` is no longer read. The server still accepts the key so existing events stay valid. Remove it from UserProfile (8).
- **R5.** Nothing in 6.2, 6.3, 9 or 10 mentions a rest timer. The changelog gets an entry (history is not rewritten).

### 3.2 Each set starts from what you lifted last time

Applies to: weight (progression `load` and `loadable`) and level (`suspension`, `ladder`). Reps and carry distance keep the recommended value.

- **A1. Source.** "Last time" is the most recent finished session with the exercise (unchanged, 5.2). Its working sets are read by set number.
- **A2. Per-set pre-fill.** Set *n* opens at the weight (or level) logged for set *n* last time. A set number missing last time (skipped, or a shorter session) takes the value of the set before it; if there is none, the first logged set's value. Extra sets last time beyond today's plan are ignored.
- **A3. No history.** Unchanged: the starting weight, on every set (5.6).
- **A4. Linked sets.** A set follows the set before it when both were pre-filled with the same value; if they were pre-filled with different values, it keeps its own. Changing set 1 of a flat 35 / 35 / 35 still moves the rest, as today. Changing set 1 of 25 / 30 / 35 leaves sets 2 and 3 where last time put them.
- **A5. When an increase is due (3.3).** Every pre-filled set goes up one increment (a set at 0 goes to the first-loaded weight). The ramp keeps its shape.
- **A6. What is recorded.** Each logged set stores its own pre-fill as `suggestedWeightLbs` / `suggestedLevel`, so "changed from suggested" is per set.
- **A7. What the card says.** "Suggested: 25 / 30 / 35 lbs" when sets differ, "Suggested: 35 lbs" when they are the same. The increase badge reads "↑ +5 lbs on each set · Steady for 3 sessions" (or "from 25" when there is one weight).
- **A8. Reopened finished workouts** show that day's pre-fill (the planner already uses only sessions before it, `day-view.js:stateBefore`).
- **A9. Engine shape.** `suggestExercise` keeps `weightLbs` (heaviest pre-fill; used for `increased` and history) and adds `setWeightsLbs` and `setLevels`, arrays indexed by set number − 1.

Examples (each becomes a test):

| # | Last time | Today's dials | Note |
|---|---|---|---|
| A-1 | 25 / 30 / 35 | 25 / 30 / 35 | The reported case. |
| A-2 | 35 / 35 / 35, set 1 changed to 40 | 40 / 40 / 40 | Linked, as today. |
| A-3 | 25 / 30 / 35, set 1 changed to 30 | 30 / 30 / 35 | Sets 2 and 3 keep their own. |
| A-4 | 25 / 30, plan has 3 sets | 25 / 30 / 30 | Missing set follows the one before. |
| A-5 | 25, (set 2 skipped), 35 | 25 / 25 / 35 | Gap takes the earlier value. |
| A-6 | 4 sets last time, plan has 3 | first 3 | Extra set ignored. |
| A-7 | TRX row at level 2 / 3 / 3 | 2 / 3 / 3 | Levels follow too. |
| A-8 | Increase due, last 25 / 30 / 35 (dumbbell, +5) | 30 / 35 / 40 | See 3.3. |
| A-9 | 25 / 30 / 35 suggested, set 2 logged by hand as 32.5 | Next time set 2 opens at 32.5 | What was logged, not what was suggested, drives the next pre-fill. |

### 3.3 An increase is proposed only when the weight has stood still

Replaces 5.12 (and the intro of 5.2's last paragraph).

- **P1. Weight pattern.** A session's pattern for an exercise is its working-set weights by set number.
- **P2. Match.** Two sessions match when every set number logged in both has the same weight. Sets logged in only one of them are ignored. Two sessions that share no set number do not match.
- **P3. Run.** The run is the number of most recent sessions, ending with the latest, that each match the latest. With any history the run is at least 1. Calendar time plays no part: a gap of weeks does not count as steadiness.
- **P4. Due.** An increase is due when the exercise's scheduled increases are on and run ≥ `increaseAfterSessions` (default 3). It is then proposed at the next session, as in A5, with source `scheduled` and target reps = the bottom of the range.
- **P5. Resets.** Logging a heavier set, or a lighter one, makes the latest session's pattern differ from the earlier ones, so the run restarts at 1. An increase made by hand therefore counts as progress and starts a new wait. Logging the old weight when an increase was proposed lets the run keep growing, so it is proposed again next time (as today).
- **P6. Not applied to** bodyweight-based exercises (5.4), holds, or exercises with no starting weight and no history.
- **P7. Settings.** `scheduledIncreasesEnabled` and `scheduledIncrease:<exerciseId>` are unchanged. New `increaseAfterSessions` (integer 1 to 12, default 3). `scheduledIncreaseDays` is no longer read (still accepted by the server).
- **P8. History screen.** "Next increase" is no longer a date. By exercise detail shows "After 3 sessions at the same weight (2 of 3 so far)", "Due at your next session", "Off" or "Not used". The chart marks a session as an increase when at least one set it shares with the previous session is heavier; the "Last increase" date uses the same test. The "↑ due" badge stays.
- **P9. Summary callout.** "Goblet squat: 30 / 35 / 40 lbs next time (+5 each set), steady for 3 sessions" (single weight: "40 lbs next time (+5), steady for 3 sessions").
- **P10. Source labels.** The stored value stays `scheduled`. The screen says "Steady for 3 sessions" in place of "Scheduled increase".

Examples (these replace the live bullets of 5.12; each becomes a numbered test):

| # | History | Question | Result |
|---|---|---|---|
| P-1 | Lat pulldown 60 on Oct 6, 13, 20 | Suggestion on Oct 27 | 70, `scheduled` |
| P-2 | Same, but only Oct 6 and 13 | Suggestion on Oct 20 | 60, `hold` |
| P-3 | 60, 60, then 70 on Oct 20 | Suggestion on Dec 30 | 70, `hold` (run is 1; the date is irrelevant) |
| P-4 | Goblet squat 25 / 30 / 35, three sessions in a row | Next session | 30 / 35 / 40, `scheduled` |
| P-5 | 25 / 30 / 35, 25 / 30 / 35, then 30 / 35 / 35 | Next session | 30 / 35 / 35, `hold` (progress on sets 1 and 2 counts) |
| P-6 | 60 on Oct 6, next session Dec 1 | Suggestion | 60, `hold` (one session; time does not count) |
| P-7 | 60, 60, 60, suggested 70, user logs 60 | Next session | 70 again, `scheduled` |
| P-8 | 60, 60, 50 | Next session | 50, `hold` (the latest pattern differs, run is 1) |
| P-9 | Hip thrust at 0 for 3 sessions | Next session | 45 on every set |
| P-10 | Scheduled increases off for the exercise | After 3 steady sessions | `hold` |
| P-11 | `increaseAfterSessions` = 2 | After 2 steady sessions | `scheduled` |
| P-12 | Exercise logged in only one session | Any date | `hold` |

### 3.4 Spec text to change, and the demo

`docs/SPEC-strength.md`:

- Changelog: a v1.21 entry (three bullets, one per change).
- 4.3 line 308: drop the rest sentence.
- 5.2: last-time paragraph (per-set base, replaces "heaviest weight is the base load").
- 5.6 "No history" paragraph: unchanged, add a pointer to A2.
- 5.7: the examples that mention the base load or "heaviest" (check #2 and #12); keep the count and fingerprints in sync.
- 5.12: rewritten as 3.3, with the new examples as its test cases (the count of 9 in `spec-coverage.test.mjs` is updated).
- 6.3: delete the rest-timer bullet (705); rewrite the logging bullet (698) and the carry-to-later-sets bullet (699) per A2 and A4; the increase highlight bullet (701) per A7.
- 6.6: "next scheduled increase date" → P8.
- 8: UserProfile loses `restTimerDefaultSec`, `scheduledIncreaseDays` becomes `increaseAfterSessions`; SetLog notes per-set suggestions.
- 9: delete the rest-timer accuracy bullet (774).
- 10 and 11: delete "rest timer" from milestone 4; rewrite the acceptance line about "hasn't gone up in 3 weeks" (797).

Other docs: `docs/SELF-HOSTING.md:188` (remove the timer sentence; say each dial starts at last time's weight), `docs/SHOWCASE-AND-SELF-HOST-SPEC.md:124` ("scheduled increase" wording).

Demo (`demo/fixture.js`, `test/demo-fixture.test.mjs`): move the alternative-exercise session (`ALTERNATIVE.sessionIndex`) from 7 (the B at -10) to 10 (the B at -3). The test reads the constant, so nothing else is hard-coded to the old index.

- Today, lat pulldown has only 2 sessions before the B at -3, because machine high row replaces it at -10. Under the new rule that is too few, so its increase at -3 would disappear.
- With the swap at -3 instead, lat pulldown has sessions at -24, -17 and -10, all at one weight. Its increase becomes due at the next B and is simply not shown in the demo.
- The A and C exercises still show their increases at -5 and -1. Face pull is still the one increase due today: its sessions at -26, -19 and -12 were steady, and the A at -5 left it unticked.

That still meets the demo's promises ("at least two exercises with an increase marked" and "one exercise due today"). Update the fixture's header comment and the lat pulldown assertions (`demo-fixture.test.mjs:68-72`).

---

## 4. Implementation plan

Work on branch `claude/workout-timer-autofill-progression-u8mkdr`. Four commits, in this order, each ending with `node --test` green. The order puts the safest, most independent change first and the spec edits last, so the spec-coupled tests turn red only when the matching behaviour exists.

### Step 0: baseline (done)

`node --test`: 721 tests, 720 pass, 1 skipped.

### Step 1: remove the rest timer

Delete:
- `app/js/logging/rest-timer.js` and its entry in `app/sw.js` (line 32).
- `.rest-bar` CSS (`app.css:343-349`, `519-521`).

Edit:
- `ui/day-screen.js`: remove the rest imports, `restEl`, `restText`, `restLive`, `wasOver`, `ticker`, `adjustRest`, `updateRest`, the call in `render`, `clearInterval`, and the `card.restText` line in `description`. `container.replaceChildren(body)`. Check that nothing else uses `ticker` (it does not).
- `logging/actions.js`: remove `skipRest`, `adjustRest`, the imports, and the `startRest` branch in `saveExercise` (keep `clearExercise`).
- `logging/draft.js`: remove the two fields from `emptyDraft`, `parseDraft` and the doc comment; remove `startRest`, `clearRest`, `setRestLength`.
- `logging/session-view.js`: remove `REST_TEXT`, `restText`, `rest` and the import. `logging/day-view.js`: remove `rest: null` and the comments. `logging/index.js`: remove the re-export.
- Tests: delete the timer half of `logging-draft-rest.test.mjs` (keep the draft half, rename the file to `logging-draft.test.mjs`); drop the rest assertions in `logging-actions.test.mjs`, `logging-edit-finished.test.mjs` and `logging-view.test.mjs`; delete `logging-view.test.mjs:244-246`.
- Add: a draft saved with `restStartedAtMs` / `restSec` loads and drops them; a saved exercise leaves no rest state.
- Leave `lambda/events/registry.mjs` alone.

Check: `node --test`; `grep -rniE 'rest-timer|restStatus|restSec|restStartedAt|rest-bar|skipRest|adjustRest' app test` returns nothing.

### Step 2: per-set autofill

- `engine/history.js`: no change to `baseLoad`; add `weightsBySet` (and `levelsBySet`) to each session record, keyed by set number.
- `engine/suggest.js`: a helper `prefill(last, plannedSets)` implementing A2; `suggestLoad` and `suggestRepeat` return `setWeightsLbs` / `setLevels`. Keep `weightLbs`, `fromWeightLbs`, `increased` (compare heaviest pre-fill with last time's heaviest). Export the new fields in `suggestExercise`.
- `engine/session.js`: `loggedDefaults(suggestion, setNumber)` returns that set's own pre-fill (A6); `logging/session-events.js` `setLogged` and `logging/actions.js` `saveExercise` pass the set number.
- `logging/rows.js`: per-set start values (A2) and the linked rule (A4); `suggestedWeightLbs` per row.
- `logging/text.js`: `suggestionText` (A7). `ui/day-screen.js` `dialColumn`: include every pre-filled weight in `dialNotches`.
- Tests: new `test/autofill.test.mjs` with A-1 to A-9, using a new helper in `test-support/engine-log.mjs`, `liftSets(exerciseId, [[25, 12], [30, 12], [35, 11]])`, because `lift()` takes one weight per exercise. Update `suggest.test.mjs:21-30` (the "heaviest weight" expectations), `logging-rows.test.mjs`, `logging-view.test.mjs`.

Check: `node --test`; manual: in a browser, log 25 / 30 / 35, reopen the next day, see 25 / 30 / 35 on the dials.

### Step 3: increases follow steadiness

- `engine/history.js`: export `matches(a, b)` (P2) and `runLength(hist)` (P3), and `progressed(prev, cur)` for the chart (P8).
- `engine/suggest.js`: `suggestLoad` uses `runLength`; remove the `timer`, `lastIncrease` date clock, `nextScheduledDate`, `daysBetween` use. Return `stepsSinceChange` and `stepsNeeded` for the display. Per-set +1 increment (A5) through `increaseLoad` (`load.js`).
- `engine/config.js`: read `increaseAfterSessions` (default from `PROGRAM`, which replaces `defaultScheduledIncreaseDays`); stop reading `scheduledIncreaseDays`.
- `lambda/events/registry.mjs`: add `increaseAfterSessions: int(1, 12)` and leave the other keys. `test/registry.test.mjs`: add cases. **Deploy note:** deploy the Lambda (`scripts/deploy-stack.sh`) before anyone sets the key; the app itself works without this deploy.
- `logging/history-view.js`: `scheduledText` and the increase markers per P8; `logging/summary.js` and `logging/text.js` per P9 and P10.
- Tests: replace the 5.12 block of `test/spec-examples.test.mjs` with P-1 to P-12; rewrite `test/suggest.test.mjs:104-185` ("scheduled increases") and `test/simulation.test.mjs:41-70` (the 21-day simulations) around sessions; update `history-view.test.mjs`. Keep the invariants test (`suggest.test.mjs:225`): never a negative load, at most one increment, order-independent.

Check: `node --test`.

### Step 4: spec, docs, demo

- Merge section 3 of this journal into `docs/SPEC-strength.md` as v1.21 (list in 3.4). Update `test/spec-coverage.test.mjs` counts and the fingerprints in `spec-examples.test.mjs` (the failure message prints the new ones).
- `docs/SELF-HOSTING.md`, `docs/SHOWCASE-AND-SELF-HOST-SPEC.md`.
- `demo/fixture.js` and `test/demo-fixture.test.mjs` per 3.4.
- `README.md` last-reviewed line is untouched.

Check: `node --test` green; open `demo/` in a browser and confirm: no rest bar after a tick, a card with different set weights opens at them, face pull shows its increase badge, the History by-exercise detail shows the new "Next increase" text.

### Risks and open points

1. **Linked-sets rule (A4)** is my design. It keeps today's behaviour for flat weights and protects a ramp. Alternative: when you change a set, shift all later untouched sets by the same amount. Both are small; say if you prefer the shift.
2. **Demo fixture change** moves which exercise is replaced in the demo history. Cosmetic, but the demo text and two assertions change.
3. **`increaseAfterSessions` needs the Lambda deploy** before the first use. Skip the setting and keep N = 3 fixed if you would rather not touch the backend; that removes one registry edit and one deploy.
4. **Spec-coupled tests** make Step 4 the likely place for a red run; the failure messages say what to update.
5. **CONTRIBUTING.md** says progression rules are not accepted upstream from others; this is the owner's own change, so the spec and changelog update here is the right place.
6. Not covered: a Settings screen for any of this (still out of scope, spec 6.7), and anything about reps.

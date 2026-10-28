# Workout changes, milestone 2: per-set autofill (2026-10-28)

Milestone 2 of the [implementation plan](2026-10-28-1138-workout-changes-implementation-plan.md), on top of [milestone 1](2026-10-28-1454-workout-changes-milestone-1-rest-timer-removed.md), on branch `claude/workout-timer-autofill-progression-u8mkdr`. Rules A1 to A9 of the [draft spec](2026-10-28-1138-workout-changes-spec-draft.md) are now true of the code. The evidence for the change is in the [autofill evaluation](2026-10-28-1138-per-set-autofill-evaluation.md).

**Decision taken at the start of this milestone (2026-10-28).** The open choice in the draft spec, A4, was settled by the owner as *linked while equal*: a set follows the set before it when both were pre-filled with the same value, and keeps its own value when they were pre-filled differently. The alternative, shifting every later set by the same amount, was not built.

**What changed.**

- **`engine/prefill.js` (new).** `valuesBySet` turns last session's logged sets into one value per set number (a set not logged takes the one before it, leading gaps take the first value, a set number logged twice takes the later one). `valueAt` reads a set's own value, else the nearest earlier one, else a fallback. `valuesForPlan` makes the list today's set count, for text. It is also in the service worker's precache list, which `test/sw.test.mjs` requires.
- **`engine/history.js`.** Each session record gains `setWeights` and `setLevels`.
- **`engine/suggest.js`.** The suggestion gains `setWeightsLbs` and `setLevels`. `weightLbs`, `fromWeightLbs` and `increased` keep their meaning (`weightLbs` is the heaviest pre-fill). When the existing 21-day rule says an increase is due, every set goes up one increment (A5), so 25 / 30 / 35 becomes 30 / 35 / 40; when it is not due, the sets hold. Back extension, TRX and pushup levels follow last time per set as well. With no history the starting weight is on every set and the lists are null.
- **`engine/session.js` and `logging/session-events.js`.** `loggedDefaults(suggestion, setNumber)` records each set's own pre-fill as `suggestedWeightLbs` and `suggestedLevel` (A6); without a set number it still gives the single value, so every earlier caller is unchanged.
- **`logging/rows.js`.** Each todo row starts at its own pre-fill and follows the row before it only when the two pre-fills are equal (A4). `suggestedWeightLbs` and `suggestedLevel` per row are the row's own pre-fill.
- **`logging/text.js`, `logging/summary.js`.** "Suggested: 25 / 30 / 35 lbs" when the sets differ (A7), cut or extended to today's set count; "Suggested: 35 lbs" when they are the same. The increase badge reads "↑ +5 lbs on each set · Scheduled" for a ramp and is unchanged for flat weights ("↑ +5 lbs from 25 · Scheduled"). The finish-summary callout lists each set's weight for a ramp ("30 / 35 / 40 lbs next time (+5 each set), scheduled") and is unchanged for flat weights. These two wordings are small additions beyond the draft's A7; they follow from A5, since "from 35" would mislead on a ramp.
- **`ui/day-screen.js`.** A weight dial's range includes every pre-filled weight.

**Tests.** New `test/autofill.test.mjs`, 17 tests: the list helpers, then A-1 to A-8 of the draft spec (A-3 twice, A-8 three ways, plus a test that exercises with no weight or level keep no lists), then A-9 through the real actions over seven workouts in two weeks. New helpers `liftSets()` and `levelSets()` in `test-support/engine-log.mjs` log a ramp, with an optional set number to leave a gap. No existing test needed a change: the plan expected edits to the "heaviest weight" expectations in `suggest.test.mjs`, `logging-rows.test.mjs` and `logging-view.test.mjs`, but they all pass as written, and so do the nine 5.12 and the live 5.7 spec examples. That is the evidence for the claim made in the plan that autofill leaves flat-weight behaviour exactly as it was.

**Checks**, from the repository root:

```sh
node --test
```

Result: 728 tests, 727 pass, 1 skipped (711 after milestone 1, plus 17).

*Do the new tests fail on the old behaviour?* With `logging/rows.js` and `engine/suggest.js` put back to their previous versions for a moment, 11 of the 17 failed (A-1, A-3 twice, A-4 to A-7, the increase and summary cases, the no-lists case and A-9); the other 6 describe behaviour that did not change (the list helpers, A-2 and the flat-weight increase text). The new code was restored and all 17 pass.

**Browser check.** The app from `app/` (`python3 -m http.server 4173 --directory app`), local-only mode, 420 × 900 in the preinstalled Chromium driven by Playwright (scratch script, not committed), a fresh browser each run, the dials turned with the arrow keys:

1. First Workout A: the goblet squat opens at 20 / 20 / 20. Raising set 1 to 25 moves all three to 25 / 25 / 25; raising set 2 to 30 gives 25 / 30 / 30; raising set 3 to 35 gives 25 / 30 / 35. The ramp is entered set by set because the sets start equal, which is the linked rule working as designed. All six exercises ticked and the workout finished; Workouts B and C finished the same way.
2. Workout A again: the goblet squat opens at **25 / 30 / 35**, under "Last (Wed, Oct 28): 25 × 8 · 30 × 8 · 35 × 8" (a screenshot shows the three dials at those values). The dumbbell bench press, logged flat, opens at 20 / 20 / 20.
3. Linking: raising the squat's set 1 to 27.5 gives 27.5 / 30 / 35 (the ramp is kept). Raising the bench press's set 1 gives 22.5 / 22.5 / 22.5 (flat sets move together); raising its set 2 then gives 22.5 / 25 / 25 (only the sets after it).
4. Ticking the squat logs it as typed: "27.5 lbs × 9 · 30 lbs × 9 · 35 lbs × 9".

No page errors. The first run of the script gave 25 / 35 / 50 for the ramp because it pressed relative counts from values the linked rule had already moved; the script was wrong, not the app, and was corrected before the result above was taken.

**Not covered.**

- The increase on a ramp (A-8) is checked in the engine, the view and the summary, not in the browser, because it needs a session 21 days old.
- A phone's touch and flick on the dials; the browser check used the keyboard path of the same dial.
- Exercises whose per-set pre-fills mix 0 with a loaded weight when an increase is due: `weightLbs` is the heaviest per-set value there, which differs from the old single-number rule, and no real exercise has been seen to do it.
- Whether a skipped set (reps cleared) reads back as the draft spec says is covered by A-5 with set numbers left out of the log, not by skipping on screen.
- The spec text, `docs/SELF-HOSTING.md:188` and the changelog still describe the old behaviour until milestone 3.

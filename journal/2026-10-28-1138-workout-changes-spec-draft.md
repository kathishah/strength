# Workout changes: draft spec text for v1.21 (2026-10-28)

Draft wording for [the three changes](2026-10-28-1138-workout-changes-issues-and-decisions.md). This is a log entry, not the spec. When the work is implemented the text moves into `docs/SPEC-strength.md` as v1.21, with a changelog entry, in the same change as the code and tests (`CONTRIBUTING.md`); the spec is not edited now because `test/spec-coverage.test.mjs` counts and fingerprints its bullets and would fail with no code behind it. The evidence for each rule is in the evaluation entries linked from the issues entry.

## Rest timer removed

- **R1.** No countdown, rest bar, Skip, −15 / +15, vibration or screen-reader announcement exists. Ticking an exercise starts nothing.
- **R2.** Cards no longer say "Rest about 90 s between sets." Spec 4.3 no longer says "Rest about 90 seconds between sets."
- **R3.** The local draft holds no rest fields. A draft saved by an older version loads normally and the rest fields are ignored.
- **R4.** `restTimerDefaultSec` is no longer read, and leaves UserProfile (section 8). The server still accepts the key so events already in a log stay valid.
- **R5.** Sections 6.2, 6.3, 9 and 10 no longer mention a rest timer. The changelog records the removal; older entries are not rewritten.

## Each set starts from what was lifted last time

Applies to the weight (progression `load` and `loadable`) and the level (`suspension`, `ladder`). Reps and a carry's distance keep the recommended value.

- **A1. Source.** "Last time" is the most recent finished session containing the exercise (unchanged, 5.2). Its working sets are read by set number.
- **A2. Per-set pre-fill.** Set *n* opens at the weight or level logged for set *n* last time. A set number missing last time (skipped, or a shorter session) takes the value of the set before it, or the first logged set's value if there is none. Sets beyond today's plan are ignored.
- **A3. No history.** Unchanged: the starting weight on every set (5.6).
- **A4. Linked sets.** A set follows the set before it when both were pre-filled with the same value; when they were pre-filled differently it keeps its own. Changing set 1 of a flat 35 / 35 / 35 still moves the rest, as today; changing set 1 of 25 / 30 / 35 leaves sets 2 and 3 where last time put them.
- **A5. When an increase is due** (P4 below), every pre-filled set goes up one increment; a set at 0 goes to the first-loaded weight. The ramp keeps its shape.
- **A6. Recorded.** Each logged set stores its own pre-fill as `suggestedWeightLbs` and `suggestedLevel`, so "changed from suggested" is per set.
- **A7. Shown.** "Suggested: 25 / 30 / 35 lbs" when sets differ, "Suggested: 35 lbs" when they are the same. The increase badge reads "↑ +5 lbs on each set · Steady for 3 sessions", or "↑ +5 lbs from 25 · Steady for 3 sessions" with one weight.
- **A8. Reopened finished workouts** show that day's pre-fill (the planner already uses only the sessions before it).
- **A9. Engine shape.** `suggestExercise` keeps `weightLbs` (the heaviest pre-fill, used for `increased` and History) and adds `setWeightsLbs` and `setLevels`, arrays indexed by set number − 1.

| # | Last time | Dials today | Note |
| --- | --- | --- | --- |
| A-1 | 25 / 30 / 35 | 25 / 30 / 35 | The reported case |
| A-2 | 35 / 35 / 35, set 1 changed to 40 | 40 / 40 / 40 | Linked, as today |
| A-3 | 25 / 30 / 35, set 1 changed to 30 | 30 / 30 / 35 | Sets 2 and 3 keep their own |
| A-4 | 25 / 30, plan has 3 sets | 25 / 30 / 30 | A missing set follows the one before |
| A-5 | 25, (set 2 skipped), 35 | 25 / 25 / 35 | A gap takes the earlier value |
| A-6 | 4 sets last time, plan has 3 | the first 3 | The extra set is ignored |
| A-7 | TRX row at level 2 / 3 / 3 | 2 / 3 / 3 | Levels follow too |
| A-8 | Increase due, last 25 / 30 / 35 (dumbbell, +5) | 30 / 35 / 40 | See P4 |
| A-9 | 25 / 30 / 35 suggested, set 2 logged as 32.5 | next time set 2 opens at 32.5 | What was logged, not what was suggested, drives the pre-fill |

## An increase only when the weight has stood still

Replaces 5.12.

- **P1. Pattern.** A session's pattern for an exercise is its working-set weights by set number.
- **P2. Match.** Two sessions match when every set number logged in both has the same weight. Sets logged in only one are ignored. Two sessions sharing no set number do not match.
- **P3. Run.** The run is the number of most recent sessions, ending with the latest, that each match the latest. With any history it is at least 1. Calendar time plays no part: a gap of weeks is not steadiness.
- **P4. Due.** An increase is due when scheduled increases are on for the exercise and the run is at least `increaseAfterSessions` (default 3). It is proposed at the next session as in A5, with source `scheduled` and target reps at the bottom of the range.
- **P5. Resets.** Logging a heavier or a lighter set makes the latest pattern differ from the earlier ones, so the run restarts at 1. An increase made by hand therefore counts as progress and starts a new wait. Logging the old weight when an increase was proposed lets the run keep growing, so it is proposed again next time (as today).
- **P6. Not applied to** bodyweight-based exercises (5.4), holds, or an exercise with no starting weight and no history.
- **P7. Settings.** `scheduledIncreasesEnabled` and `scheduledIncrease:<exerciseId>` are unchanged. New `increaseAfterSessions`, an integer from 1 to 12, default 3. `scheduledIncreaseDays` is no longer read; the server still accepts it.
- **P8. History.** "Next scheduled increase" stops being a date. Exercise detail reads "After 3 sessions at the same weight (2 of 3 so far)", "Due at your next session", "Off" or "Not used". The chart and the "Last increase" date mark a session as an increase when at least one set it shares with the previous session is heavier. The "↑ due" badge stays.
- **P9. Summary.** "Goblet squat: 30 / 35 / 40 lbs next time (+5 each set), steady for 3 sessions"; with one weight, "40 lbs next time (+5), steady for 3 sessions".
- **P10. Labels.** The stored source value stays `scheduled`; the screen says "Steady for 3 sessions" in place of "Scheduled increase".

| # | History | Question | Result |
| --- | --- | --- | --- |
| P-1 | Lat pulldown 60 on Oct 6, 13 and 20 | Suggestion on Oct 27 | 70, `scheduled` |
| P-2 | The same, only Oct 6 and 13 | Suggestion on Oct 20 | 60, `hold` |
| P-3 | 60, 60, then 70 on Oct 20 | Suggestion on Dec 30 | 70, `hold` (the run is 1; the date is irrelevant) |
| P-4 | Goblet squat 25 / 30 / 35, three sessions in a row | Next session | 30 / 35 / 40, `scheduled` |
| P-5 | 25 / 30 / 35, 25 / 30 / 35, then 30 / 35 / 35 | Next session | 30 / 35 / 35, `hold` (progress on sets 1 and 2 counts) |
| P-6 | 60 on Oct 6, next session Dec 1 | Suggestion | 60, `hold` (one session; time does not count) |
| P-7 | 60, 60, 60, suggested 70, user logs 60 | Next session | 70 again, `scheduled` |
| P-8 | 60, 60, 50 | Next session | 50, `hold` (the latest pattern differs, the run is 1) |
| P-9 | Hip thrust at 0 for 3 sessions | Next session | 45 on every set |
| P-10 | Scheduled increases off for the exercise | After 3 steady sessions | `hold` |
| P-11 | `increaseAfterSessions` = 2 | After 2 steady sessions | `scheduled` |
| P-12 | Exercise logged in only one session | Any date | `hold` |

## Where it lands in `docs/SPEC-strength.md`

- **Changelog:** a v1.21 entry, one bullet per change.
- **4.3** (line 308): drop the rest sentence.
- **5.2:** the last-time paragraph (a per-set base replaces "the heaviest weight is the base load"). **5.6** "No history": unchanged, with a pointer to A2.
- **5.7:** the examples that mention the base load (#2 and #12); keep the bullet count and fingerprints in step.
- **5.12:** rewritten as P1 to P10, with P-1 to P-12 as its test cases; the count of 9 in `spec-coverage.test.mjs` becomes 12.
- **6.3:** delete the rest-timer bullet (705); rewrite the logging bullet (698) and the carry-to-later-sets bullet (699) per A2 and A4; the increase highlight (701) per A7.
- **6.6:** "next scheduled increase date" per P8.
- **8:** UserProfile loses `restTimerDefaultSec`, and `scheduledIncreaseDays` becomes `increaseAfterSessions`; SetLog notes the per-set suggestion.
- **9:** delete the rest-timer accuracy bullet (774). **10** and **11:** drop "rest timer" from milestone 4, and rewrite the acceptance line about a weight that "hasn't gone up in 3 weeks" (797).
- **Other docs:** `docs/SELF-HOSTING.md:188`, and the "scheduled increase" wording in `docs/SHOWCASE-AND-SELF-HOST-SPEC.md:124`.

**Open choice, not decided:** A4 is the author's design. The alternative is to shift every later untouched set by the amount a set was changed. Both are small; the linked rule was chosen because it leaves flat weights behaving as they do today.

**Not covered:** a Settings screen for any of this (out of scope, spec 6.7), and anything about reps.

# Workout changes: draft spec text for v1.21 (2026-10-28)

Draft wording for [the two changes](2026-10-28-1138-workout-changes-issues-and-decisions.md). This is a log entry, not the spec. When the work is implemented the text moves into `docs/SPEC-strength.md` as v1.21, with a changelog entry, in the same change as the code and tests (`CONTRIBUTING.md`); the spec is not edited now because `test/spec-coverage.test.mjs` counts and fingerprints its bullets and would fail with no code behind it. The evidence for each rule is in the evaluation entries linked from the issues entry.

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
- **A5. Existing suggested increase.** Where the app already suggests a higher weight (5.12, unchanged), the suggestion is applied to every pre-filled set, so a ramp keeps its shape; a set at 0 goes to the first-loaded weight.
- **A6. Recorded.** Each logged set stores its own pre-fill as `suggestedWeightLbs` and `suggestedLevel`, so "changed from suggested" is per set.
- **A7. Shown.** "Suggested: 25 / 30 / 35 lbs" when sets differ, "Suggested: 35 lbs" when they are the same.
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
| A-8 | Suggested increase applies, last 25 / 30 / 35 (dumbbell, +5) | 30 / 35 / 40 | See A5 |
| A-9 | 25 / 30 / 35 suggested, set 2 logged as 32.5 | next time set 2 opens at 32.5 | What was logged, not what was suggested, drives the pre-fill |

## Where it lands in `docs/SPEC-strength.md`

- **Changelog:** a v1.21 entry, one bullet per change.
- **4.3** (line 308): drop the rest sentence.
- **5.2:** the last-time paragraph (a per-set base replaces "the heaviest weight is the base load"). **5.6** "No history": unchanged, with a pointer to A2.
- **5.7** and **5.12:** check whether any example breaks; flat-weight examples should not, because A2 reproduces them. Keep the bullet counts and fingerprints in step with any text change.
- **6.3:** delete the rest-timer bullet (705); rewrite the logging bullet (698) and the carry-to-later-sets bullet (699) per A2 and A4; the increase highlight (701) per A5.
- **8:** UserProfile loses `restTimerDefaultSec`; SetLog notes the per-set suggestion.
- **9:** delete the rest-timer accuracy bullet (774). **10:** drop "rest timer" from milestone 4.
- **Other docs:** `docs/SELF-HOSTING.md:188`.

**Open choice, not decided:** A4 is the author's design. The alternative is to shift every later untouched set by the amount a set was changed. Both are small; the linked rule was chosen because it leaves flat weights behaving as they do today.

**Not covered:** a Settings screen for any of this (out of scope, spec 6.7), and anything about reps.

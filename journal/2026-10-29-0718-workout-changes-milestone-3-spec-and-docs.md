# Workout changes, milestone 3: spec and docs (2026-10-29)

Milestone 3, the last, of the [implementation plan](2026-10-28-1138-workout-changes-implementation-plan.md), after [milestone 1](2026-10-28-1454-workout-changes-milestone-1-rest-timer-removed.md) and [milestone 2](2026-10-28-1505-workout-changes-milestone-2-per-set-autofill.md), on branch `claude/workout-timer-autofill-progression-u8mkdr`. The [draft spec](2026-10-28-1138-workout-changes-spec-draft.md) has now moved into `docs/SPEC-strength.md` as v1.21, in the same branch as the code and tests it describes (`CONTRIBUTING.md`). The draft entry stays as the record of what was proposed.

**What changed in `docs/SPEC-strength.md`.**

- **Title and changelog.** v1.21, with two bullets: the rest timer removal and per-set autofill. The autofill bullet says that when increases are suggested (5.12) is unchanged.
- **4.3.** The sentence "Rest about 90 seconds between sets." is gone.
- **5.2.** The base load stays the heaviest weight of the last session, for history and for 5.12. New bullets: each set starts from what that set was last time (a set not logged takes the one before it; sets beyond today's plan are ignored; reps and distance are not pre-filled); the suggestion is that pre-fill, or that plus one increment on every set when an increase is due, with "Suggested: 25 / 30 / 35 lbs" when the sets differ; each logged set records its own pre-fill.
- **5.7.** Six new live examples, #35 to #40: a ramp opens as a ramp; flat weights follow set 1 and a ramp does not; a missing, skipped or extra set; TRX levels; an increase applied to every set; what is logged, not what was suggested, drives the next pre-fill.
- **5.12.** The trigger now says the suggestion is each set's weight last time plus one increment (a goblet squat at 25 / 30 / 35 becomes 30 / 35 / 40), and the hold is at last time's weights. When an increase is due is unchanged; its nine test cases are untouched.
- **6.3.** The rest line and the rest-timer bullet are removed; the logging bullet says the weight dial opens at that set's weight from last time; a new "linked while equal" bullet replaces "changing the weight on one set pre-fills the remaining sets"; the increase highlight also reads "↑ +5 lbs on each set · Scheduled" when sets differ; and the line about reopened finished workouts no longer says "the rest timer does not run".
- **6.7, 8, 9, 10, 11.** The struck settings line, `restTimerDefaultSec` in UserProfile, the rest-timer accuracy bullet and the rest timer in milestone 4's list are removed; SetLog says `suggestedWeightLbs` is that set's own pre-fill; a new acceptance line says a 25 / 30 / 35 ramp opens as 25 / 30 / 35 and changing one set does not flatten the others.

Mentions of the timer that remain are history, on purpose: older changelog entries (v1.14, v1.17, v1.19) and the v0.x release notes that say what those releases did not have.

**`docs/SELF-HOSTING.md`.** Step 2 of the manual test no longer says the rest timer runs after each tick, and says each set's weight starts at what that set was last time.

**Tests.** `test/spec-examples.test.mjs` gains `5.7 #35` to `#40`, one numbered test per new bullet, each with the SHA-1 fingerprint of its bullet; `#40` runs the real actions over seven workouts. `test/spec-coverage.test.mjs` expects 40 bullets in 5.7 instead of 34. The 5.12 count of 9 and every other fingerprint were left as they were, and nothing else in the suite needed changing: the edits to 5.2, 5.12 and 6.3 are outside the counted bullets, which is what the plan expected.

**Checks**, from the repository root:

```sh
node --test
```

Result: 734 tests, 733 pass, 1 skipped (728 after milestone 2, plus 6). *Does the spec meta-test guard the new bullets?* With one word of bullet #38 changed, `spec-coverage` failed with "5.7 #38 changed in the spec … set its fingerprint to '1c78c372'"; with the spec restored it passes.

**Browser check on the demo page.** The repository served with `python3 -m http.server 4174 --directory <repo>`, page `/demo/`, 420 × 900 in the preinstalled Chromium driven by Playwright (scratch script, not committed), a fresh browser:

1. The demo's Workout A opens with the goblet squat at 25 / 25 / 25 under "Last (Sat, Oct 24): 25 × 9, 9, 9". Raising each set in turn gives a ramp of 30 / 35 / 40.
2. After one tick: no rest bar, no `role=timer`, no Skip button and no "Rest …" text. The card shows "30 lbs × 10 · 35 lbs × 10 · 40 lbs × 10".
3. Workouts A, B and C finished; Workout A again opens the goblet squat at **30 / 35 / 40** under "Last (Thu, Oct 29): 30 × 10 · 35 × 10 · 40 × 10".

No page errors.

**State of the plan.** All three milestones are done; the branch holds the two changes, their tests, the spec and the journal. It has not been merged to `main` and no pull request has been opened.

**Not covered.**

- `docs/SHOWCASE-AND-SELF-HOST-SPEC.md` was not edited: the plan's mention of it was for the dropped increase change, and a search finds nothing about the timer or autofill there.
- The draft spec's pointer from 5.6 "No history" to the new pre-fill rule was not added; 5.2 states the rule and 5.6 is unchanged.
- No phone, touch input or screen lock was tried, and the increase on a ramp was checked in tests, not in a browser (it needs a 21-day-old session).

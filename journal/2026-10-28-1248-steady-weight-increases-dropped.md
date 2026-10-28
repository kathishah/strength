# Steady-weight increases dropped; plan reduced to two changes (2026-10-28)

**Decision (2026-10-28).** After seeing the evidence below, the owner is fine with how increases work today and asked for issue 3 of [workout changes: issues and decisions](2026-10-28-1138-workout-changes-issues-and-decisions.md) to be dropped. The scheduled-increase rule (spec 5.12: an increase is proposed 21 days after the exercise's last increase, or after its first session) stays as it is. This entry supersedes the parts of the [steady-weight evaluation](2026-10-28-1138-steady-weight-increases-evaluation.md), the [draft spec](2026-10-28-1138-workout-changes-spec-draft.md) and the [implementation plan](2026-10-28-1138-workout-changes-implementation-plan.md) that cover it; those entries are left as written.

**Evidence recorded for the decision.** The engine was run on built-up histories of goblet squat (sessions Oct 6 and Oct 13, `suggestExercise` with the real `makeLog` helper; the probe script was scratch and is not in the repository):

- *Top weight raised, 25 / 25 / 25 to 30 / 30 / 30:* the timer resets. On Nov 2 it suggests 30 (`hold`); on Nov 3, 21 days after the increase, it suggests 35 (`scheduled`).
- *Lower sets raised, top unchanged, 25 / 30 / 35 to 30 / 35 / 35:* the timer does not reset. "Last increase" is empty, and on Oct 27, 21 days after the first session, it suggests 40 (`scheduled`) although sets 1 and 2 had just gone up.

So the clock compares each session's heaviest weight with the previous session's heaviest weight (`suggest.js:23-26`, `history.js:51`), not set by set. This is accepted behaviour. If it is revisited, write a new entry rather than reopening the draft.

**What stays from the other two changes.**

- **Rest timer removal (milestone 1):** unchanged.
- **Per-set autofill (milestone 2):** unchanged, with one clarification. When the existing clock says an increase is due, every pre-filled set goes up one increment (draft rule A5, example A-8: 25 / 30 / 35 becomes 30 / 35 / 40 for a dumbbell exercise). That is autofill's own consequence of the owner's earlier answer that every set goes up, and it needs no new rule about when an increase is due.

**What is out.**

- Draft rules P1 to P10 and examples P-1 to P-12, the `increaseAfterSessions` setting, and the run, match and "progressed" helpers.
- The wording changes "Steady for 3 sessions" (A7, P10) and the History "next increase" text (P8): labels stay "Scheduled increase", "Next scheduled increase" stays a date, the finish-summary callout keeps "scheduled", and the History chart keeps marking an increase when the top set rises. Under autofill the increase badge and the callout say "+5 lbs on each set" when the sets differ, and nothing else changes in them.
- The registry line in `lambda/events/registry.mjs` and any Lambda deploy.
- The demo fixture change (`ALTERNATIVE.sessionIndex`) and the lat pulldown assertions; the demo is built on the 21-day rule, which stays.
- Spec 5.12 and its test cases are not rewritten. The nine bullets and their fingerprints in `test/spec-coverage.test.mjs` and `test/spec-examples.test.mjs` stay valid, because their examples use one weight per exercise, which autofill reproduces. 5.12 gets one added sentence: an increase applies to every set.

**Revised plan.** Three milestones, same conventions as the [original plan](2026-10-28-1138-workout-changes-implementation-plan.md) (one commit each, results in new `...-milestone-N-...` entries, `node --test` from the repository root, baseline 721 tests with 720 passing and 1 skipped).

| # | Milestone | Main work | Exit check |
| --- | --- | --- | --- |
| 1 | Rest timer removed | As in the original plan, unchanged | As in the original plan |
| 2 | Per-set autofill | As in the original plan, except: no change to when an increase is due; `suggestLoad` applies the existing due increase to each pre-filled set (A5) and keeps `weightLbs`, `fromWeightLbs`, `increased`; the increase badge and summary callout read "+5 lbs on each set" when sets differ and keep "Scheduled". The test helper `liftSets()` and `test/autofill.test.mjs` (A-1 to A-9) stand | `node --test` green; in a browser, a 25 / 30 / 35 session reopens at 25 / 30 / 35; a flat 35 / 35 / 35 with set 1 changed moves the rest; a due increase on a ramp raises every set |
| 3 | Spec and docs | Merge into `docs/SPEC-strength.md` as v1.21 only the rest-timer rules (R1 to R5) and autofill rules (A1 to A9): changelog; 4.3 (line 308); 5.2 last-time paragraph; one sentence in 5.12; 6.3 (698, 699, 701, 705); 8 (`restTimerDefaultSec` out; SetLog note); 9 (774); 10 and 11 (rest timer out of milestone 4). Edit `docs/SELF-HOSTING.md:188`. Check that no 5.7 or 5.12 example breaks; if the bullet text changes, update the fingerprints | `node --test` green; open `demo/` in a browser: no rest bar after a tick, a card with different set weights opens at them |

**Deploy.** Static app only. No Lambda change and no new setting.

**Not covered:** nothing here has run beyond the two probe cases above, and the claim that the 5.12 examples are unchanged by autofill is reasoned from their single-weight inputs, to be confirmed when milestone 2 runs the suite.

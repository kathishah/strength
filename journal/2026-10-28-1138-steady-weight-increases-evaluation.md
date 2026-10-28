# Steady-weight increases: evaluation against the code (2026-10-28)

Issue 3 of [workout changes: issues and decisions](2026-10-28-1138-workout-changes-issues-and-decisions.md). Partly confirmed: the app does raise weights on a clock, but the flaw is narrower than it felt, and the interval is not 2 weeks.

**What the code does.** The "timer" starts at the exercise's last increase, or at its first session if there has been none (`engine/suggest.js:40-61`, spec 5.12). Once `daysBetween(timer, today) >= 21` (`PROGRAM.defaultScheduledIncreaseDays`, `seed/rules.js:40`) it proposes one increment. A session counts as an increase only when its heaviest set beats the previous session's heaviest set (`lastIncrease`, `suggest.js:23-26`). Reps never matter.

**Two corrections to the report.** The interval is 21 days, not 2 weeks. And it is not fully blind: raising the top weight does reset the clock (`test/suggest.test.mjs:143`, "a manual override to a heavier weight resets the timer"). It misfires in the cases below.

**Where it goes wrong:**

- **Progress below the top set.** 25 / 30 / 35, then 30 / 35 / 35. The heaviest set is unchanged, so the clock is not reset, and about 3 weeks after the last top-set change it proposes +5 on top of progress already made. This is the case that matters once sets differ.
- **Time passes without training.** Increase on Oct 1, no session until Oct 22 (travel, illness): one session at the new weight and it proposes another increase, because it counts calendar days, not sessions at that weight. The first-session start has the same flaw.
- **A lighter session.** 60, 60, 50, then 60 again. The 50 resets nothing and the clock keeps running; this is deliberate in the tests ("a lighter session does not").
- **Charts and callouts share the flaw.** The History chart marks an increase only when the top set rises (`logging/history-view.js:111`), "next scheduled increase" is a date (`history-view.js:113-115`), and the finish summary ends "scheduled" (`logging/summary.js:51`).

**Other things this touches:**

- **The spec is test-coupled.** `test/spec-coverage.test.mjs` expects exactly 34 bullets in 5.7 and 9 in 5.12, each live bullet with a numbered test and a SHA-1 fingerprint in `test/spec-examples.test.mjs`, and `test/rules.test.mjs` reads tables out of the spec. Editing `docs/SPEC-strength.md` therefore means updating those tests in the same change, which is why the spec text is drafted in the journal for now.
- **The demo is built on the 21-day rule.** `demo/fixture.js` (header comment; `ALTERNATIVE` at session index 7) assumes every exercise is due 21 days after its first session. Machine high row replaces lat pulldown in the B at -10, so lat pulldown has only 2 sessions before the B at -3 and, under a 3-session rule, would not show its increase. `test/demo-fixture.test.mjs:61-72` and `168-169` assert that it does.
- **Backend.** A new setting `increaseAfterSessions` needs a line in `lambda/events/registry.mjs` and a Lambda deploy before the first time it is set. The app does not write settings (the Settings screen for them is not built), so the app can ship first.
- **Stored source value.** `suggestionSource: 'scheduled'` is stored in logged sets and accepted by the registry. Keep the stored value; only what the screen says changes.

**Not covered:** the history of real sessions. The scenarios above were traced through the code and its tests, not reproduced against the owner's logged data.

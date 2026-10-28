# Per-set autofill: evaluation against the code (2026-10-28)

Issue 2 of [workout changes: issues and decisions](2026-10-28-1138-workout-changes-issues-and-decisions.md). Confirmed, and the data needed is already in the suggestion.

**Cause.** One chain of single-number decisions. `engine/history.js:51` sets a session's `baseLoad` to its heaviest set. `engine/suggest.js:53-60` makes the suggestion that one number. `logging/rows.js:58-80` starts `carryWeight` at `suggestion.weightLbs` and copies it down every set, so 25 / 30 / 35 opens as 35 / 35 / 35. The screen already draws one dial per set (`ui/day-screen.js` `dialColumn`), so no new control is needed.

**The per-set data is already there.** `suggest.js:122-125` returns `last.sets` with each set's weight and level, and `lastText` (`logging/text.js`) already prints "Last (Mon, Sep 28): 25 × 12 · 30 × 12 · 35 × 11". Only the pre-fill ignores it.

**A side effect that feeds itself.** Ticking through an exercise without touching a dial logs 35 / 35 / 35, which erases the ramp from history, which makes the next pre-fill flat again.

**What else the change touches:**

- `loggedDefaults` (`engine/session.js:32-38`) records one `suggestedWeightLbs` for every set. It should record each set's own pre-fill, or "changed from suggested" (`rows.js:96`) misreads a ramp.
- The rule "a dial changed on a set carries to the sets after it" (spec 6.3; `pick` in `rows.js`) would flatten a ramp the moment one dial is touched. It needs a new rule; the draft is in the [spec draft](2026-10-28-1138-workout-changes-spec-draft.md), section A4.
- `suggestRepeat` (`suggest.js:65-77`) serves back extension and TRX and pushup levels and repeats `baseLoad` or `baseLevel`. These follow last time per set as well.
- `dialColumn` builds each dial's range from `card.suggestion.weightLbs`; it must include every pre-filled weight or a 35 could sit outside a dial that tops out lower.
- `test-support/engine-log.mjs` `lift()` takes one weight per exercise, so tests with a ramp need a new helper.

**Not covered:** how a skipped set (reps cleared by tapping its caption, `toggleSkip`) should read back next time. The draft spec takes the earlier set's weight; this was reasoned from the code, not tried.

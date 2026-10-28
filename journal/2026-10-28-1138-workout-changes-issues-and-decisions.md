# Workout changes: issues reported and decisions (2026-10-28)

Three things came up while using the app in the gym. Each is evaluated against the code in its own entry; the draft spec and the plan follow.

1. **Rest timer.** After each exercise tick a bar appears with a countdown, −15 / +15 and Skip. It is not wanted and should be eliminated completely, not hidden. Evaluation: [rest timer removal](2026-10-28-1138-rest-timer-removal-evaluation.md).
2. **Autofill shows the maximum.** Every set's dial opens at the heaviest weight from the previous session. The weight usually climbs set by set (say 25, 30, 35), so each dial should open at exactly what was lifted last time. Evaluation: [per-set autofill](2026-10-28-1138-per-set-autofill-evaluation.md).
3. **Increases are mechanical.** The app proposes an increase on a clock. It should propose one only when the weight for that exercise has stayed the same over 2 or 3 weeks, and raising the weight by hand must count as progress. Evaluation: [steady-weight increases](2026-10-28-1138-steady-weight-increases-evaluation.md).

Then: [draft spec (v1.21)](2026-10-28-1138-workout-changes-spec-draft.md) and [implementation plan](2026-10-28-1138-workout-changes-implementation-plan.md).

**Decisions (2026-10-28).** Four questions were put to the owner before anything was written; each answer is the recommended option except the last.

1. *What counts as "the weight stayed the same"?* The per-set pattern: a session counts as progress if any set is heavier than the same-numbered set last time. The alternatives were the top set only (what the code does today) and total weight lifted.
2. *How long before an increase is proposed?* 3 sessions in a row at the same weights, not calendar days. The alternatives were 2 sessions, and a calendar window that also requires the weights to be unchanged.
3. *When an increase is proposed and sets differ, which sets go up?* Every set, by one step, so the ramp keeps its shape. The alternative was the top set only.
4. *The static card line "Rest about 90 s between sets."* Remove it too. The recommendation was to keep it.

**Assumptions, not asked and open to correction:**

- Reps and a carry's distance keep their current autofill (the recommended number). Only weights, and the level of TRX and pushup exercises, follow last time set by set.
- Rep performance still plays no part in progression (spec 5.2 as cut in v1.13). The gate is only whether the weight changed.
- "2 or 3 weeks" was read as 3, to match the 3-session decision. The threshold is a setting, so 2 is one value away.

**Baseline.** From the repository root on Node 22.22:

```sh
node --test
```

Result: 721 tests, 720 pass, 1 skipped, about 13 s. Nothing in `app/`, `lambda/`, `test/`, `demo/` or `docs/SPEC-strength.md` has been changed.

**Not covered:** the design was not tried in a browser; no code has been written.

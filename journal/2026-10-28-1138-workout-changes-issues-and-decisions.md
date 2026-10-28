# Workout changes: issues reported and decisions (2026-10-28)

Two things came up while using the app in the gym. Each is evaluated against the code in its own entry; the draft spec and the plan follow.

1. **Rest timer.** After each exercise tick a bar appears with a countdown, −15 / +15 and Skip. It is not wanted and should be eliminated completely, not hidden. Evaluation: [rest timer removal](2026-10-28-1138-rest-timer-removal-evaluation.md).
2. **Autofill shows the maximum.** Every set's dial opens at the heaviest weight from the previous session. The weight usually climbs set by set (say 25, 30, 35), so each dial should open at exactly what was lifted last time. Evaluation: [per-set autofill](2026-10-28-1138-per-set-autofill-evaluation.md).

Then: [draft spec (v1.21)](2026-10-28-1138-workout-changes-spec-draft.md) and [implementation plan](2026-10-28-1138-workout-changes-implementation-plan.md).

**Decision (2026-10-28).** One question was put to the owner before anything was written: should the static card line "Rest about 90 s between sets." go too? Answer: yes, remove it. The recommendation had been to keep it.

**Assumption, not asked and open to correction:** reps and a carry's distance keep their current autofill (the recommended number). Only weights, and the level of TRX and pushup exercises, follow last time set by set.

**Baseline.** From the repository root on Node 22.22:

```sh
node --test
```

Result: 721 tests, 720 pass, 1 skipped, about 13 s. Nothing in `app/`, `lambda/`, `test/`, `demo/` or `docs/SPEC-strength.md` has been changed.

**Not covered:** the design was not tried in a browser; no code has been written.

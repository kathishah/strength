# journal

A dated development log: what was found or decided, and why, as it happened. Entries record the issues raised while using the app, how they were evaluated against the code, the plans made, and the results of carrying them out.

**Naming:** `YYYY-MM-DD-HHMM-topic.md`, e.g. `2026-10-28-1138-rest-timer-removal-evaluation.md`. The date and time are Pacific, as everywhere in the project, and are when the entry was first recorded. Entries written together for one piece of work share a timestamp.

**Rules:**

- One entry per unit of work or finding. Don't batch unrelated findings into one file. A piece of work usually has an issues-and-decisions entry, one evaluation per change, a draft spec, an implementation plan, and then one result entry per milestone.
- Not edited after the fact. If an old entry turns out wrong, or a plan changes, write a new entry saying so; the log stays an honest record of what was known at the time. A plan is not ticked off: its milestone results are new entries that link back to it.
- This is a log, not a spec. Durable behaviour belongs in [`docs/SPEC-strength.md`](../docs/SPEC-strength.md), which should link back here for the evidence. A draft spec written ahead of the code lives here until the code lands, and then moves into the spec with its changelog entry in the same change (`CONTRIBUTING.md`).
- Record exact commands and their results (test counts, what was checked in a browser), and say what was **not covered**.
- No workout data or credentials, as everywhere else in the repository (`CONTRIBUTING.md`).

## Entries

- 2026-10-28, workout changes (rest timer, per-set autofill): [issues and decisions](2026-10-28-1138-workout-changes-issues-and-decisions.md), evaluations of the [rest timer](2026-10-28-1138-rest-timer-removal-evaluation.md) and [autofill](2026-10-28-1138-per-set-autofill-evaluation.md), the [draft spec](2026-10-28-1138-workout-changes-spec-draft.md) and the [implementation plan](2026-10-28-1138-workout-changes-implementation-plan.md). Results: [milestone 1, rest timer removed](2026-10-28-1454-workout-changes-milestone-1-rest-timer-removed.md), [milestone 2, per-set autofill](2026-10-28-1505-workout-changes-milestone-2-per-set-autofill.md) and [milestone 3, spec and docs](2026-10-29-0718-workout-changes-milestone-3-spec-and-docs.md).
- 2026-11-10, TRX removal, plank time per set, dumbbell upper-body options: [issues and decisions](2026-11-10-1056-trx-plank-dumbbell-issues-and-decisions.md), the [draft spec](2026-11-10-1056-trx-plank-dumbbell-spec-draft.md) and the [implementation plan](2026-11-10-1056-trx-plank-dumbbell-implementation-plan.md). Written after the TRX edits had started. Results: [milestone 1, TRX removed](2026-11-10-1105-trx-plank-milestone-1-trx-removed.md), [milestone 2, plank time per set](2026-11-10-1105-trx-plank-milestone-2-plank-time.md); and the [dumbbell options proposal](2026-11-10-1105-dumbbell-upper-body-options-proposal.md).
- 2026-11-10, dumbbell options (six new upper-body exercises, with the owner's GIFs): [draft spec](2026-11-10-1228-dumbbell-options-spec-draft.md), [implementation plan](2026-11-10-1228-dumbbell-options-implementation-plan.md) (both written before the code) and the [result](2026-11-10-1230-dumbbell-options-milestone-1.md).
- 2026-11-10, Options lists: [no limit on alternatives, three rows that scroll](2026-11-10-1251-options-no-limit-and-scroll.md) (decision and plan, written before the change), and its [result](2026-11-10-1253-options-no-limit-and-scroll-result.md).

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

- 2026-10-28, workout changes (rest timer, per-set autofill): [issues and decisions](2026-10-28-1138-workout-changes-issues-and-decisions.md), evaluations of the [rest timer](2026-10-28-1138-rest-timer-removal-evaluation.md) and [autofill](2026-10-28-1138-per-set-autofill-evaluation.md), the [draft spec](2026-10-28-1138-workout-changes-spec-draft.md) and the [implementation plan](2026-10-28-1138-workout-changes-implementation-plan.md). Results: [milestone 1, rest timer removed](2026-10-28-1454-workout-changes-milestone-1-rest-timer-removed.md).

# TRX removal and plank time: draft spec text for v1.22 (2026-11-10)

Draft wording for [the decisions](2026-11-10-1056-trx-plank-dumbbell-issues-and-decisions.md). A log entry, not the spec: when the code lands it moves into `docs/SPEC-strength.md` as v1.22 with a changelog entry, in the same change as the code and tests. Change 3 (dumbbell options) has no text here until its list is agreed.

## TRX removed

- **T1.** No slot has TRX alternatives. The card has one list button, **Options**. There is no TRX button, count badge, colour or panel, in the app or in the landing-page preview.
- **T2.** The catalog and rules have no `trx-*` exercise and no `suspension` type. The level box (1-5) remains for the pushup ladder only.
- **T3.** Spec 4.5.1 (TRX alternatives) is removed and its table with it; the TRX mentions in 0.B, 4.5, 5.4, 5.7, 5.12 and 6.x are removed or struck through as the spec already does for removed rules. The changelog records the removal.
- **T4.** Events already in a log keep their meaning on replay: sets for a `trx-*` id are kept but are not offered or listed; a swap to one is ignored.
- **T5.** The seven Truman State image URLs leave `scripts/image-sources.json`; `docs/MEDIA-RIGHTS-AUDIT.md`, `docs/SELF-HOSTING.md` and spec 4.5.3 say 51 URLs, five domains.

## Plank: a time for each set

- **P1.** Plank logs `holdSeconds` (whole seconds, 1-3600) on each set. Event types `set.logged` and `set.edited` accept it; replay keeps it; the server validator accepts it (API contract and spec section 8 SetLog list it). Other exercises never carry it.
- **P2.** New progression `timed`: no progression, per-set pre-fill. Set *n* opens at set *n* of the last finished session's seconds (missing sets take the one before, as 5.2 v1.21), else 45. The suggestion carries `setHolds` and the start value.
- **P3.** The card shows one seconds dial per set (notches of 5 s from 5 up to at least 180, and any logged value), no reps dial. A set can be skipped as other sets can (its time is cleared and the tick leaves it out). The tick logs every set with a time.
- **P4.** Prescription text is "2 × 45 s hold". "Last (Mon, Sep 28): 45 s, 50 s".
- **P5.** History: plank is measured in seconds: the chart is the longest set, the table lists the times.
- **P6.** Side plank and bird dog (weighted hold) stay completion-only (`hold`).
- **P7.** Draft rows hold `holdSeconds` like the other values; an older draft loads.

| # | Case | Result |
| --- | --- | --- |
| P-1 | No plank history, 2 sets | Both dials open at 45 s |
| P-2 | Last time 45 / 60 | Dials open at 45 / 60 |
| P-3 | Last time 50, today 3 sets | 50 / 50 / 50 |
| P-4 | Edit a logged plank set to 55 | `set.edited` with `holdSeconds: 55` only |
| P-5 | Swap in plank from the dead bug slot | Time dials; sets from the slot |
| P-6 | Tick with set 2 skipped | Only set 1 logged |
| P-7 | Side plank | Completion only, as before |

# TRX removal, plank time, dumbbell options: implementation plan (2026-11-10)

Plan for [the decisions](2026-11-10-1056-trx-plank-dumbbell-issues-and-decisions.md) against the [draft spec](2026-11-10-1056-trx-plank-dumbbell-spec-draft.md). Branch `trx-removal-plank-time-db-options`. Milestone results go in new entries named `YYYY-MM-DD-HHMM-trx-plank-milestone-N-<topic>.md`; this plan is not edited.

Test command: `node --test` from the repository root. Baseline before any change: 734 tests, all pass.

| # | Milestone | Main work | Exit check |
| --- | --- | --- | --- |
| 1 | TRX removed | Seed: drop `trx-*` from catalog, rules, `trxAlternatives` from `program.js`, `trx-*` from `image-sources.json`. Engine and logging: `session.js`, `config.js`, `summary.js`, `session-view.js`, `day-view.js`, `rows.js`, `suggest.js`, `history.js`, `scripts/export-lib.mjs`. UI: `day-screen.js` (one Options button), `app.css`, `landing/phone-preview.*`. Docs: media audit, self-hosting count. Tests: drop or rewrite TRX cases (`rules`, `seed`, `plan`, `suggest`, `autofill`, `history`, `logging-*`, `spec-examples`); add: a log with a TRX swap and TRX sets replays and renders without error | `node --test` green; `grep -rniE 'trx\|suspension' app landing scripts lambda test` empty except the replay-compat test; in a browser, no TRX button and Options still swaps |
| 2 | Plank time per set | `holdSeconds` in `lambda/events/registry.mjs`, `store/replay.js`, `logging/draft.js`, `session-events.js`, `rows.js` (`timed` inputs, `canLog`, `pickValues`), `input.js` (`dialNotches`), `day-screen.js` (FIELD, seconds dials, skip), `text.js`, `history-view.js`, `engine/history.js` and `suggest.js` (`setHolds`), `rules.js` (plank `timed`, 45), `docs/API-CONTRACT.md`. Tests: P-1 to P-7, registry accepts and rejects, replay, draft | `node --test` green; in a browser, a plank card shows a dial per set at 45, tick, reload, next plank opens at what was logged |
| 3 | Spec and docs | Merge the draft into `docs/SPEC-strength.md` as v1.22; fix the spec-coupled tests (`rules`, `spec-coverage`, `spec-examples`; their failure messages print the new fingerprints) | `node --test` green |
| 4 | Dumbbell options | Not started. List first, owner approves, then catalog, rules, program and GIFs | List approved |

**Deploy notes.** Milestone 2 changes the Lambda validator: deploy the stack before the app (D6). Milestone 1 needs no server change.

**Risks.** Spec-coupled tests in milestone 3. The seconds dial reuses the per-set row machinery written for weight; the skip control is keyed to `reps` today and needs generalising.

**Not covered:** nothing here has run when this was written, except the baseline count.

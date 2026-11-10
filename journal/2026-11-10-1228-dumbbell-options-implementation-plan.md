# Dumbbell options: implementation plan (2026-11-10)

Plan for the [draft spec](2026-11-10-1228-dumbbell-options-spec-draft.md), on branch `trx-removal-plank-time-db-options` (the same branch as the TRX and plank work, which is still uncommitted). Milestone result: a new entry named `YYYY-MM-DD-HHMM-dumbbell-options-milestone-1.md`. This plan is not edited.

Test command: `node --test`. Baseline: 753 tests, all pass.

| # | Milestone | Main work | Exit check |
|---|---|---|---|
| 1 | Seed and spec | `catalog.js`: 6 entries (`original: true`, cue, muscles, `gifUrl` `img/<id>.gif`). `rules.js`: 6 rules. `program.js`: the alternatives of A2, B2, B4, B5, A6, C2. Spec v1.22: changelog, 4.5 prose and table, new 4.5.4, 5.3 note, 4.5.3. Tests: raise the cap in `seed.test.mjs` (1 to 8), catalog count 55 to 61, original-art rule for images, a `rules.test.mjs` block for 4.5.4 and the 5.3 exception, 4.5 table row count unchanged (17) | `node --test` green |
| 2 | Images | Copy the 6 GIFs to `demo/media/<id>.gif` and `app/img/<id>.gif` (git-ignored); add the ids to `DEMO_MEDIA`; `docs/MEDIA-RIGHTS-AUDIT.md` note that original art is not in the third-party inventory | `node --test` green; in a browser, the six cards show their GIF in the app and in the demo |

**Deploy notes.** No server change. The images reach the site only with `scripts/deploy-app.sh --include-images`.

**Risks.** Option lists of 7 and 8 are long on a phone; checked in a browser at phone width. The cap of 8 is a product decision to confirm (C1).

**Not covered:** nothing here has run.

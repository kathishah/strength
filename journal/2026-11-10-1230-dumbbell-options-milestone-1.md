# Dumbbell options, milestones 1 and 2: seed, spec and images (2026-11-10)

Result of the [plan](2026-11-10-1228-dumbbell-options-implementation-plan.md) against the [draft spec](2026-11-10-1228-dumbbell-options-spec-draft.md). The two milestones were done together and are not committed (branch `trx-removal-plank-time-db-options`, which also holds the TRX and plank work). This time the draft and the plan were written before the code.

## What changed

- **Catalog and rules:** six exercises (`db-floor-press`, `db-chest-fly`, `db-pullover`, `seated-arnold-press`, `half-kneeling-one-arm-db-press`, `incline-bench-db-y-raise`), marked `original`, with cue, muscles and start weight; the pullover is one dumbbell (+5), the others +2.5 per dumbbell, the one-arm press is per side.
- **Slots:** Dumbbell Bench Press (A2) 7 alternatives, Pushup (B5) 8, Incline Dumbbell Press (C2) 5, Lat Pulldown (B2) 3, Seated Dumbbell Shoulder Press (B4) 5, Face Pull (A6) 5. The cap is now 8 (choice C1 of the draft, still to be confirmed).
- **Spec v1.22:** changelog bullet, 4.5 prose and table rows, new 4.5.4 (table of the six), 5.3 exception, 4.5.3 note on original art.
- **Images:** the six GIFs are copied from `private/exercise-images/<name>/<name>.gif` to `demo/media/<id>.gif` (tracked; added to `DEMO_MEDIA`) and to the git-ignored `app/img/<id>.gif`. `docs/MEDIA-RIGHTS-AUDIT.md` says they are original art outside the third-party inventory.
- **Tests:** cap 1 to 8, catalog 55 to 61, an original-art rule for images, a block that reads the 4.5.4 table (names, types, starts, and that exactly the listed slots offer each one), the pullover in the 5.3 exceptions.

## Checked

- `node --test`: 755 tests, all pass (baseline of this work 753).
- Browser, phone width (375 × 812), local-only mode: the Options lists of Workout A show the new names; the six `img/<id>.gif` files return 200 `image/gif`; Dumbbell Floor Press, swapped in for Dumbbell Bench Press, shows its 640 × 400 GIF, no credit line, "3 × 8–12", dials at 20 / 20 / 20 and 8 reps. Test data was deleted from the preview browser.

## Not covered

- The demo page and the landing preview were not opened in a browser (the demo test, which checks that `demo/media` matches `DEMO_MEDIA`, passes).
- Not looked at in a browser: Workouts B and C (their new options are covered by the data tests), and the eight-item list of Pushup on a phone.
- The six `-poses.zip`, `-all-stages.png` and `poses/` files in `private/exercise-images/` were not used. The misspelt folder `luna-dumbbell-floor-presss/` was ignored.
- Nothing deployed. The images reach the site only with `scripts/deploy-app.sh --include-images`.

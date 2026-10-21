# Archived implementation notes for spec v1.19

Historical notes for the v1.19 implementation. This record is retained for context; its status and test counts are outdated. The current spec is [`docs/SPEC-strength.md`](../docs/SPEC-strength.md).

- Root `index.html`: a redirect to https://strength.logbook.me (the v0.2 viewer is retired; it stays in git history).
- `app/index.html`: Content-Security-Policy removed. `BUILD.md`, `DEPLOYMENT-PLAN.md` updated.
- Seed: 16 new exercises (`catalog.js`, `rules.js`), the alternatives of 4.5 (`program.js`), no `superset` field, side plank gets rules.
- No supersets: engine (no pairing tip), session view ("Exercise N of M", "Rest about 90 s between sets"), history, CSS.
- Tests: 528 pass. The seed-vs-viewer comparison is gone; new tests check the spec tables (4.5, 4.5.2) against the seed.
- Images: all 58 are downloaded unchanged into `app/img/` (160 MB, not in git) by `node scripts/fetch-images.mjs` (sources in `scripts/image-sources.json`); the catalog points at `img/<id>.<ext>`; the art credit under each is tiny. `scripts/deploy-app.sh` fetches any missing image and uploads `app/img/` with a week-long cache (dry run: 70 uploads, no deletes).
- Looked at in a browser with an in-memory store: cards read "Exercise 1 of 6", no coloured edge, images and Options thumbnails load from `img/`, a swap into hack squat shows 3 × 8–12 and a pre-filled 20.

The implementation was subsequently committed and deployed. Do not use this file as current deployment guidance; see [BUILD.md](../BUILD.md).

Optional, not in the spec: a GIF for suitcase carry (existing, currently the placeholder): `https://workoutlabs.com/train/wp-content/uploads/2023/05/Single_Arm_Dumbbell_Suitcase_Carry-1_anim-c.gif` (12 frames, checked; credit Workoutlabs, `https://workoutlabs.com/exercise-guide/single-arm-dumbbell-suitcase-carry/`).

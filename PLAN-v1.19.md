# Status of spec v1.19 (alternatives, straight sets, viewer retired)

The spec is `SPEC-strength.md` (changelog v1.19). Built and checked, not committed or deployed:

- Root `index.html`: a redirect to https://strength.logbook.me (the v0.2 viewer is retired; it stays in git history).
- `app/index.html`: Content-Security-Policy removed. `BUILD.md`, `DEPLOYMENT-PLAN.md` updated.
- Seed: 16 new exercises (`catalog.js`, `rules.js`), the alternatives of 4.5 (`program.js`), no `superset` field, side plank gets rules.
- No supersets: engine (no pairing tip), session view ("Exercise N of M", "Rest about 90 s between sets"), history, CSS.
- Tests: 528 pass. The seed-vs-viewer comparison is gone; new tests check the spec tables (4.5, 4.5.2) against the seed.
- Images: all 58 are downloaded unchanged into `app/img/` (160 MB, not in git) by `node scripts/fetch-images.mjs` (sources in `scripts/image-sources.json`); the catalog points at `img/<id>.<ext>`; the art credit under each is tiny. `scripts/deploy-app.sh` fetches any missing image and uploads `app/img/` with a week-long cache (dry run: 70 uploads, no deletes).
- Looked at in a browser with an in-memory store: cards read "Exercise 1 of 6", no coloured edge, images and Options thumbnails load from `img/`, a swap into hack squat shows 3 × 8–12 and a pre-filled 20.

To do:
1. Commit and push (the redirect goes live on GitHub Pages when `main` is pushed).
2. Deploy the app with `scripts/deploy-app.sh` (the first deploy uploads about 160 MB of images; no service worker change is needed: it is network first).
3. Phone check: Options on a card with 4 entries, swap, tick, undo; a workout reads one exercise at a time.

Optional, not in the spec: a GIF for suitcase carry (existing, currently the placeholder): `https://workoutlabs.com/train/wp-content/uploads/2023/05/Single_Arm_Dumbbell_Suitcase_Carry-1_anim-c.gif` (12 frames, checked; credit Workoutlabs, `https://workoutlabs.com/exercise-guide/single-arm-dumbbell-suitcase-carry/`).

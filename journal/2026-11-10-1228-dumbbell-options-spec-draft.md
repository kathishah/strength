# Dumbbell options for upper-body exercises: draft spec text for v1.22 (2026-11-10)

Draft wording for change 3 of [the request](2026-11-10-1056-trx-plank-dumbbell-issues-and-decisions.md), from the [proposal](2026-11-10-1105-dumbbell-upper-body-options-proposal.md). Written **before** the code this time. A log entry, not the spec: it moves into `docs/SPEC-strength.md` (v1.22) with the code and tests.

**Basis.** The owner took the proposal's six exercises as agreed (the table was only reworded: exercise names instead of slot codes) and made the six GIFs in `private/exercise-images/<exercise-name>/<exercise-name>.gif` (640 × 400, the same format as the existing art). The four open questions of the proposal were not answered, so the defaults below are my choices and are the things to confirm.

## Choices made without an answer (confirm or change)

- **C1. The cap is 8, not 6.** The proposal said "raise to 6" without counting. Adding everything proposed makes Dumbbell Bench Press 7 alternatives and Pushup 8. Spec 4.5 "1 to 4 per slot" becomes "1 to 8".
- **C2. Lat Pulldown gets both** Dumbbell Pullover and One-Arm Dumbbell Row.
- **C3. Side plank is not changed.**
- **C4. The folder `private/exercise-images/luna-dumbbell-floor-presss/`** (a misspelt earlier draft of the floor press, older than `dumbbell-floor-press/`) is ignored.

## New exercises

Catalog ids follow the existing short style (`db-`, not `dumbbell-`). Dumbbell weights are per hand. Reps and sets come from the slot (4.5), except the one-arm press, which is "per side".

| Id | Name | Type | Muscles | Alternative for (workout, slot) | Start |
|---|---|---|---|---|---|
| db-floor-press | Dumbbell Floor Press | dumbbell | Chest, Triceps | Dumbbell bench press (A2) · Pushup (B5) · Incline dumbbell press (C2) | 20 lbs |
| db-chest-fly | Dumbbell Chest Fly | dumbbell | Chest | Dumbbell bench press (A2) · Pushup (B5) | 10 lbs |
| db-pullover | Dumbbell Pullover | dumbbell | Lats, Chest | Lat pulldown (B2) | 20 lbs (one dumbbell) |
| seated-arnold-press | Seated Arnold Press | dumbbell | Shoulders | Seated dumbbell shoulder press (B4) | 15 lbs |
| half-kneeling-one-arm-db-press | Half-Kneeling One-Arm Dumbbell Press | dumbbell | Shoulders, Core | Seated dumbbell shoulder press (B4) | 10 lbs |
| incline-bench-db-y-raise | Incline-Bench Dumbbell Y Raise | dumbbell | Rear delts, Lower traps | Face pull (A6) | 5 lbs |

Existing exercises offered in more slots (no new art): Incline dumbbell press in A2 and B5; Dumbbell bench press in C2 and B5; One-arm dumbbell row in B2.

## Rules

- **D1.** All six are `dumbbell` / `load`. Increment 2.5 lbs per dumbbell, except the pullover, one dumbbell, +5 (like goblet squat). The pullover joins the 5.3 exceptions note.
- **D2.** Starts are the table's values; a swapped-in exercise takes the slot's sets and reps. Half-kneeling one-arm press is `perSide`.
- **D3.** All six are supported or low in spinal load, so they meet the back-friendly rule of 4.5.
- **D4.** The 4.5 table lists the new alternatives, in the order: the slot's current ones, then the new ones. Spec 4.5.2's sibling is a new section 4.5.4 "Exercises added in v1.22" with the table above; the catalog goes from 55 to 61.

## Images

- **I1.** The six GIFs are original art by the repository owner, MIT with the repository, like the demo's. They are **not** third-party: no entry in `scripts/image-sources.json`, no credit line, and the catalog marks them `original: true`. The 51-URL third-party count does not change.
- **I2.** In the repository they live in `demo/media/<id>.gif` and `DEMO_MEDIA` (the demo and the landing preview). Locally they are also copied to the git-ignored `app/img/<id>.gif` so the owner's own deploy (`--include-images`) shows them in the real app. The default deploy still ships no images.
- **I3.** `scripts/image-sources.json` and the 4.5.3 test change from "every catalog image has a source and a credit" to "every catalog image has a source and a credit, unless it is marked original".

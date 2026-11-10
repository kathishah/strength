# Dumbbell options for upper-body slots: proposal (2026-11-10)

Change 3 of [the request](2026-11-10-1056-trx-plank-dumbbell-issues-and-decisions.md). A list for the owner to approve before any catalog, rules or GIF work. Nothing is implemented.

**Today.** Dumbbell upper-body exercises already in the catalog: Dumbbell bench press (A2), Incline dumbbell press (C2), Seated dumbbell shoulder press (B4), Chest-supported row (A4, dumbbell), One-arm dumbbell row, Dumbbell lateral raise, Chest-supported rear delt raise. Several slots have no dumbbell alternative, and **A2, A4, A6 and B5 are already at 4 alternatives, the most spec 4.5 allows** (seed test: 1 to 4 per slot). B2 (lat pulldown) has one alternative.

## Proposed new exercises (6, each needs a new GIF)

| # | Exercise | Muscles | Goes in | Starts at (per hand) |
| --- | --- | --- | --- | --- |
| 1 | Dumbbell floor press | Chest, triceps | A2, B5, C2 | 20 lbs |
| 2 | Dumbbell chest fly (flat bench) | Chest | A2, B5 | 10 lbs |
| 3 | Dumbbell pullover (one dumbbell, across a bench) | Lats, chest | B2 | 20 lbs (one dumbbell, +5) |
| 4 | Seated Arnold press | Shoulders | B4 | 15 lbs |
| 5 | Half-kneeling one-arm dumbbell press | Shoulders, core | B4 | 10 lbs |
| 6 | Incline-bench dumbbell Y raise | Rear delts, lower traps | A6 | 5 lbs |

All six are supported or low in spinal load, so they meet the back-friendly rule of 4.5. Weights and increments follow the existing dumbbell rules (2.5 per dumbbell, 5 for one dumbbell).

## Existing exercises that would also be offered in more slots (no new GIF)

- Incline dumbbell press in A2 and B5.
- Dumbbell bench press in C2 and B5.
- One-arm dumbbell row in B2.

## Needs the owner's call

1. **The 4-alternative cap.** To add these, either raise the cap (to 6, a spec 4.5 and `seed.test.mjs` change) or swap out current alternatives at the full slots. Raising the cap is the smaller change.
2. **Pullover and one-arm row for the lat pulldown slot.** A dumbbell cannot do a vertical pull; both are the closest lat work. Accept, or leave B2 as it is?
3. **Who makes the GIFs.** The third-party GIFs are not cleared for redistribution (`docs/MEDIA-RIGHTS-AUDIT.md`). The app's own art is the original set in `demo/media/<id>.gif` (anatomical figures, worked muscles in red). The six would be made in that style; the demo needs them too if the demo should show them.
4. **Side plank** also gets a time box? (Open from change 2.)

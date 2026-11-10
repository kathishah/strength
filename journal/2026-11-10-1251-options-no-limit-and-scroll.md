# Options lists: no limit, three rows, scrolling (2026-11-10)

The owner's answer to choice C1 of the [dumbbell draft spec](2026-11-10-1228-dumbbell-options-spec-draft.md), which that entry (not edited) left open with a cap of 8. A decision and its plan in one entry; the change is small and the draft spec text is below.

## Decision

- There is **no limit** on how many alternatives a slot has. Spec 4.5's "1 to 4 per slot" (and the 1 to 8 of the dumbbell work) goes; every slot still has at least one.
- Opening **Options** on a card shows **three rows**, and the list **scrolls** inside its panel when it has more. A list of three or fewer is shown whole.

## Draft spec text

- **O1.** Spec 4.5: a slot has at least one alternative and no upper limit.
- **O2.** Spec 6.3 (Options): the open list is as tall as three rows; with more than three alternatives it scrolls inside the panel (touch scroll on a phone, wheel or scrollbar with a mouse) and the page behind does not scroll while the list is being scrolled to its end. Row height does not change.
- **O3.** The landing page's phone preview uses the same rule.

## Plan

One change, then check in a browser at phone width on a card with more than three alternatives (Pushup has 8):

1. `app/css/app.css` and `landing/phone-preview.css`: a height limit of three rows on `.alt-panel`, `overflow-y: auto`.
2. `test/seed.test.mjs`: the upper bound of 8 goes (the lower bound of 1 stays).
3. `docs/SPEC-strength.md`: the v1.22 changelog bullet, 4.5 prose, a 6.3 bullet.

No code outside CSS changes; the list is the same data. **Not covered by tests:** CSS cannot be checked by `node --test`; it is checked in a browser.

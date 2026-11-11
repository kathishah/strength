# Options list: the original with Revert, not the exercise in use (2026-11-11)

A finding from using the app, with its draft spec text and implementation plan in one entry (the change is small). Written **before** the code, on branch `fix/alt-exercise`. A log entry, not the spec: the spec text below moves into `docs/SPEC-strength.md` (v1.23) with the code and tests.

## What the owner reported

After choosing **Use this** on an alternative, the Options list still shows that alternative. The list should show the original exercise with a **Revert** button where **Use this** was.

## Checked: confirmed

Local-only mode in a browser at 375 × 812, Workout A, slot 1 (Goblet Squat):

- Before: Options lists Leg Press, Box Squat, Hack Squat, Leg Extension, each with **Use this**.
- After **Use this** on Leg Press: the card's title is Leg Press and the note reads "Swapped from Goblet Squat · Revert". Opening Options lists **Leg Press [In use]** (disabled), Box Squat, Hack Squat, Leg Extension, each other row **Use this**. **Goblet Squat, the original, is not in the list.** The only way back is the small Revert link in the note.

Cause, in code: `swapOptions` in `app/js/logging/session-view.js` returns the default, then the alternatives, each marked `current` when it is the exercise on the card. The card's `optionGroups.alternatives` keeps only the rows of kind `alternative`, so the default never appears, and the alternative in use does (`test/logging-view.test.mjs`, "Options is the one list", asserts exactly that: `box-squat` is in the list as current and `goblet-squat` is not). `app/js/ui/day-screen.js` draws the current row as a disabled "In use". The older spec text (0.A.6 and 0.B.4) said "the original stays reachable from the list it was swapped from"; the v1.22 list lost that.

## Decision

The Options list shows **every choice for the slot except the one on the card**, since the card already names that one:

- **Not swapped:** the slot's alternatives, each **Use this** (unchanged).
- **Swapped:** the original first, with **Revert**, then the other alternatives, each **Use this**. The exercise in use is not listed, so there is no "In use" row.

The count on the Options button is the number of rows in the list. A swap replaces one choice with another, so the count is the same before and after a swap.

Choices made without being asked (confirm or change):

- **R1. The original goes first** in the list, not in its place in the order, so Revert is always among the three visible rows (6.3 shows three rows and scrolls).
- **R2. The "Swapped from <original> · Revert" note stays.** It is a shortcut that needs no opening of the list, and nothing in the report asks to remove it. Both do the same thing.

## Draft spec text

- **V1.** Spec 6.3, Options list: the open list holds every choice for the slot except the exercise on the card. When the slot has been swapped, the first row is the original exercise with a **Revert** button (it clears the swap, 4.5), then the other alternatives with **Use this**. The exercise in use is never listed, and there is no "In use" row. The three-row height and scrolling are unchanged.
- **V2.** Spec 0.B.4 and 0.A.6 describe the retired viewers and are not rewritten (as for TRX in v1.22).
- **V3.** Spec changelog v1.23: the bullet for this change. No data, events or engine change: a swap and a revert are the same events as before (`swap.changed`, `swap.cleared`).

## Implementation plan

One change in two small pieces, then check in a browser at phone width. Test command: `node --test`. Baseline: 755 tests, all pass.

1. `app/js/logging/session-view.js` (`buildCard`): `optionGroups.alternatives` becomes the choices that are not current: the default (when it is not current) marked `revert: true`, listed first, then the alternatives that are not current. `swapOptions` itself does not change, because `actions.swap` validates against it and the default must stay accepted there.
2. `app/js/ui/day-screen.js` (`altPanel`): the button reads **Revert** when `o.revert`, otherwise **Use this**; the disabled "In use" state goes. A row already calls `ctx.actions.swap` with its exercise id, and choosing the default clears the swap, so no action changes.
3. `test/logging-view.test.mjs`: rewrite "Options is the one list": not swapped (alternatives only, none current, no `revert`), swapped (original first with `revert: true`, the one in use absent, the rest in order, same length as unswapped). A UI test in the style of the neighbours if `logging-view` or an existing DOM test can render the panel; otherwise the browser check below.
4. `docs/SPEC-strength.md`: title v1.22 to v1.23, changelog bullet, 6.3 Options list bullet.
5. Journal result entry with the commands run and what was not covered.

**Checked in a browser:** Workout A slot 1: swap to Leg Press, open Options (Goblet Squat with Revert first, Box Squat, Hack Squat, Leg Extension with Use this, Leg Press absent, badge 4), press Revert (title back to Goblet Squat, note gone, list as at the start). Also a slot with more than three alternatives (Dumbbell Bench Press, 7), to see Revert in the first of the three rows.

**Risks.** None to stored data. The card's key for re-rendering (`cardKey` in `day-screen.js`) already includes `swapped` and `exerciseId`, so the list rebuilds after a swap.

**Not covered by `node --test`:** the CSS and layout of the list; the browser check covers it.

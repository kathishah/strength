# Options list: drop the "Swapped from" note, reverse the Revert button (2026-11-11)

Two follow-up changes from the owner, after trying the [Options list with Revert](2026-11-11-0947-options-list-revert.md) and its [result](2026-11-11-0958-options-list-revert-result.md). Those entries are not edited; this one supersedes decision R2 of the first. Written **before** the code, on branch `fix/alt-exercise`. The spec text below moves into `docs/SPEC-strength.md` (v1.23, the same unreleased version) with the code.

## Decisions

1. **The "Swapped from <original> · Revert" note is removed** from the card, with its Revert link. The owner: the list now has the original with Revert, so the note only takes space. This reverses R2 ("the note stays"). After a swap the card shows nothing that says it was swapped; the way back is Options, first row.
2. **The Revert button is drawn in reverse colours**, so it stands out from the Use this rows: a dark background with bright text on the light theme.

Choices made without being asked (confirm or change):

- **S1. "Reverse" follows the theme.** On the dark theme the panel is already near-black, so a dark button would vanish; there Revert is a bright background with dark text. Use this keeps its indigo tint on both themes.
- **S2. Nothing replaces the note.** The card's title already names the exercise in use.

## Draft spec text

- **W1.** Spec changelog v1.23 and 6.3 Options list: remove the sentences about the card's "Swapped from <original> · Revert" note and say instead that after a swap the card has no note: the original is reached from Options.
- **W2.** Spec 6.3: the **Revert** button is drawn in reversed colours (dark with bright text on the light theme, bright with dark text on the dark theme), the Use this buttons are unchanged.
- **W3.** Sections 0.A.6, 0.B.4 and 4.5 prose that mention the note describe the retired viewers (0.A, 0.B) and are not rewritten.

## Implementation plan

Test command: `node --test`. Baseline: 755 tests, all pass.

1. `app/js/ui/day-screen.js`: drop the `swap-note` line in `buildCard`; the row button gets the class `revert` when `o.revert`.
2. `app/js/logging/session-view.js` and `day-view.js`: drop `swappedFromName` from the card model (nothing else reads it). `test/logging-view.test.mjs` and `test/logging-edit-finished.test.mjs` stop asserting it; the first keeps asserting that the swapped card lists the original first with `revert`.
3. `app/css/app.css`: delete `.swap-note`, `.revert-btn` and the `--swap` colour (used only by the note, in all three theme blocks and in `landing/phone-preview.css`); add `--revert-bg`, `--revert-text`, `--revert-border` per theme and `.alt-use.revert`.
4. `docs/SPEC-strength.md`: W1, W2.
5. A result entry with the commands run and what was not covered.

**Checked in a browser** at 375 × 812, light and dark: swap, no note on the card, Options first row Revert in reverse colours, Revert works, the card's height does not jump on a swap other than the note's rows going.

**Not covered by `node --test`:** colours and layout; the browser check covers them (contrast is read by eye, not measured).

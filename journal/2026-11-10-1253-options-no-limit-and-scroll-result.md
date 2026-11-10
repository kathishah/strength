# Options lists: no limit, three rows, scrolling: result (2026-11-10)

Result of the [decision and plan](2026-11-10-1251-options-no-limit-and-scroll.md). Not committed (same branch as the other work of the day).

## What changed

- The cap on alternatives per slot is gone: `test/seed.test.mjs` only requires at least one; spec 4.5 and the v1.22 changelog say no upper limit; a new 6.3 bullet describes the Options list.
- `app/js/ui/day-screen.js`: an open Options panel is as tall as its first three rows when it has more than three, and scrolls inside. **Different from the plan:** the plan said CSS only. A fixed three-row height clipped any row whose name wraps (Chest-Supported Row's third option, "One-Arm Dumbbell Row (bench-supported)", is 101 px tall against the usual 61), so the height is measured from the rows (`fitAltPanels`, redone by a `ResizeObserver` when the width changes). `app/css/app.css` and `landing/phone-preview.css` only make the panel scrollable (`overflow-y: auto`, `overscroll-behavior: contain`).

## Checked

- `node --test`: 755 tests, all pass.
- Browser, 375 × 812, local-only mode, Workout A: Dumbbell Bench Press (7 options): panel 185 px, three rows (Machine Chest Press, Pushup, Cable Chest Press), a scrollbar thumb visible, scrolled to the end it shows Dumbbell Floor Press, Dumbbell Chest Fly, Incline Dumbbell Press. Chest-Supported Row (4, with the tall third row): 225 px, not clipped. Face Pull (5, two wrapped rows after the third): 185 px. Goblet Squat (4): scrolls. Dumbbell Romanian Deadlift (3): no limit set, no scroll.

## Not covered

- Workouts B and C (Pushup has 8 options) were not opened; they use the same code.
- No mouse-wheel or real touch scroll was tried: the scroll position was set by script. Phone landscape and the landing page's preview were not looked at.
- The `ResizeObserver` path (rotating the phone with a list open) was not exercised.

# Recomp Tracker — Product Spec (v1.15)

A personal, mobile-first web app for logging gym workouts in a body recomposition program (build lean mass, reduce visceral fat, strengthen the back) and telling the user what to lift next. Used at the gym on a phone and at home on a desktop, with data synced across devices. Activity tracking (steps, Bollyx, hikes, mobility) and body metrics (DEXA, waist, weight) are out of scope: activity is tracked on an Apple Watch, and body metrics are not tracked in this app.

## Changelog
- **v1.15**
  - A finished workout can be reopened and corrected (6.2, 6.3): a missed tick, a wrong weight or rep count. Home lists the workouts finished in the last 7 days, and the summary screen has an edit button. Found when a Workout B was finished with the pushups not ticked and there was no way back to them.
- **v1.14**
  - Set counts: Phase 1 (weeks 1–4) uses the full set counts of Section 4.3 (it was 2 sets per exercise). The phases now differ only in target effort (5.1).
  - Exercises that start at 0 and have a first-loaded weight (leg press, hip thrust, reverse lunge) pre-fill that weight when there is no history (5.6). What was logged last time still wins.
  - Reps in reserve (RIR) is no longer asked per set. Target effort is shown in plain words ("stop each set with about 3 reps left"). The `rir` field stays in the data model, unused.
  - Session screen follows the v0.2 viewer: one horizontal swipe carousel of exercise cards, colour-coded supersets (6.3).
  - Home is that viewer's page (6.2): a slim header (status line, day pills, save state, theme, sign out) over the day's cards; no Start button, the workout starts when the first exercise is ticked.
  - Logging is one tick per exercise with a barrel dial per set for the weight (2.5 lb notches, at the suggested weight) and a shared reps dial (at the recommended reps); Edit and Undo after the tick; rest timer after each tick (6.3).
- **v1.13**
  - Progression scope cut to what the app needs: show the weights used last time, pre-fill an editable suggestion, and prompt an increase after a few weeks (scheduled increase, 5.12). Struck-through text in Section 5 (and where it is mentioned elsewhere) is removed and is not built; it is kept for reference.
  - Removed: ramp-up sets (5.5), calibration (5.6), earned increases and reductions (5.2 rules 1 and 2), deload weeks (5.8), back pain gate (5.9), stall detection (5.10), expected pace (5.11), and all progression for bodyweight-based exercises (5.4: bodyweight, loadable, TRX levels, pushup ladder). Those exercises still show sets, reps, last time and an editable box; nothing is suggested to change.
  - Load increments (5.3): dumbbell exercises that use two dumbbells go up 2.5 lbs per dumbbell; goblet squat and box squat (one dumbbell) go up 5 lbs. First-loaded weights stay.
  - Scheduled-increase timer with no increase yet now starts at the exercise's first completed session (there is no calibration to end).
- **v1.12**
  - Time zone: all dates and times use US Pacific time (`America/Los_Angeles`, PDT/PST), including days of the week, program weeks, and the monthly event-file boundary (Section 9, DEPLOYMENT-PLAN.md).
  - Sign-in is email plus a single permanent 6-digit PIN (Section 6.1).
  - Hosting: v1 is served at https://strength.logbook.me from a single stack (`strength-prod`); no dev stack (Section 0.C).
  - Program start date is seeded as 2026-09-28, the day of the first Workout A (Sections 5.1, 6.7, 8).
- **v1.11**
  - Gym warm-up (4.2) and post-lift cardio (4.4) dropped from the app: not shown, not logged. Their session fields and settings are removed.
  - Recovery routine (4.6) is guidance only: exercise cards with prescription and cues, no done state, no logging, no sync.
  - Custom exercise entry removed: the exercise catalog is fixed and ships with the app (4.5, 5.6, 7, 8).
  - Hosting (Section 0.C): the v0.2 viewer (`index.html`) is frozen on GitHub Pages; v1 is built in a separate `app/` directory and deployed to S3 + CloudFront.
- **v1.10**
  - Scope reduced to workout logging and exercise history. Removed: activity log (6.4), body metrics (6.5), weekly progress and reminders on Home (6.2), DEXA seed data and comparison (Sections 3, 8), the back pain trend chart. Steps, Bollyx, hikes, and mobility are tracked on the Apple Watch.
  - The Tue/Thu recovery routine stays as a checklist with local-only done state (4.6); it is no longer logged as an activity.
  - Data model trimmed (Section 8): ActivityLog, DexaScan, WaistMeasurement, BodyWeight removed; storage is an append-only event log.
  - Milestones renumbered (Section 10) and acceptance criteria trimmed (Section 11).
  - Deployment architecture (static site + one Lambda behind an HTTP API + Cognito + private S3 event log) is described in DEPLOYMENT-PLAN.md.
- **v1.9**
  - v0.2 header collapses again: the status line is a tap target with a chevron that shows or hides the day picker. Picking a day or scrolling down collapses it (0.B.1).
  - v0.2 carousel: Prev/Next buttons, progress dots, and the bottom bar removed; navigation is by swipe only (0.B.1).
- **v1.8**
  - App v0.2 shipped. Section 0 status updated; 0.B now describes what shipped.
  - v0.2 header simplified: one status line plus the day picker, with a small icon button that cycles the theme (System, Light, Dark). The title, date, phase chip, progress row and collapse behavior were removed (0.B.1).
  - Carousel swipe fix for iOS (cards no longer restrict horizontal touch panning).
  - Wording fixes: starting-weight prefix, glute bridge cue, pushup rationale, rest-card layout; the "(2 sets in weeks 1–4)" hint shows on every gym card.
  - Known issues listed in 0.B.8.
- **v1.7**
  - Section 0 (Releases) added: App v0.1 (shipped, built against the spec v1.0 program) with its gaps vs. v1.6, and the plan for App v0.2 (static viewer aligned to the v1.6 program).
  - Milestones (Section 10) include the static viewer releases.
- **v1.6**
  - TRX (suspension trainer) alternatives added to the swap list where a good match exists (Section 4.5.1).
  - New exercise type `suspension`: difficulty is a level 1–5 (body angle or foot position) instead of weight, with its own progression rule (Section 5.4).
  - Scheduled increases (5.12) apply to suspension exercises as +1 level.
- **v1.5**
  - Pushups moved from the Tue/Thu home session into Workout B (slot 5, supersetted with back extension), replacing the Pallof press (now an alternative). Reason: ACSM guidance for older adults recommends ≥48 h between training the same muscle group; the v1.4 plan pressed Mon–Fri consecutively.
  - Band rows removed (gym pulling volume is sufficient and the same 48 h logic applies).
  - Tue/Thu reverts to the mobility routine only (~10 min). Home-session strength logging removed.
  - Weekly progress now tracks at least one full rest day.
- **v1.4**
  - Pushups and band rows added to the Tuesday/Thursday home session as a strength block (Section 4.6 Part B). No pushups on gym days.
  - New exercise type `bodyweight_ladder` with a variation ladder for pushups (Section 5.4).
  - Home strength sets are logged with the same set-logging UI as the gym and appear in exercise history.
- **v1.3**
  - Scheduled increases: each exercise's suggested weight goes up automatically if its load hasn't increased in 3 weeks, regardless of rep performance (Section 5.12).
  - Any increased suggestion is visually highlighted, labeled "Earned" or "Scheduled" (Section 6.3).
  - Each suggestion records its source; exercise history shows the next scheduled increase date.
  - Stall detection redefined to catch increases that come too fast (Section 5.10).
- **v1.2**
  - Seeded starting weights per exercise, pre-filled as the default and always editable (Section 5.6).
  - Calibration: "How did that feel?" prompt during the first 2 sessions of each exercise adjusts the next set (Section 5.6).
  - First-loaded weight rule for exercises that start at bodyweight (hip thrust, reverse lunge, back extension).
  - Scheduled deload weeks, with manual trigger and postpone (Section 5.8).
  - Back pain gate: no load increases on back-loading exercises when back pain is above 3/10 (Section 5.9).
  - Stall detection and an expected-pace guide per exercise (Sections 5.10–5.11).
  - Suggested vs. actual weight stored on each set, so overrides are visible.
- **v1.1**
  - Gym warm-up is now 5 min of cardio + a 3-min back activation block (McGill Big 3). Mobility drills moved out of the gym warm-up.
  - New Tuesday/Thursday "sitting recovery" mobility routine, logged as a new activity type.
  - Ramp-up sets auto-calculated before the first exercise of Supersets 1 and 2.
  - Workout A: added face pull (supersetted with dead bug). Workout B: added 45° back extension (supersetted with Pallof press).
  - New exercise type `bodyweight_loadable` (back extension) with its own progression rule.
  - Optional post-lift cardio (incline walk) logged on the session.
- **v1.0** — Initial spec.

---

## 0. Releases

App release versions (v0.x) are separate from spec versions (v1.x in the Changelog). Static releases are stepping stones before v1 (Sections 6–11).

| App version | Status | Program it shows |
|---|---|---|
| v0.1 | Shipped (commit `543d99b`) | Spec v1.0 program |
| v0.2 | Shipped; frozen (bug fixes only) | Spec v1.6 program (Section 4) |
| v1 | In progress | Full app: logging, progression, history (Sections 5–6). Sync spike (milestone 1) is live at https://strength.logbook.me; see DEPLOYMENT-PLAN.md section 13 |

### 0.C Hosting of v0.x and v1
- **v0.2 viewer:** the single `index.html` at the repo root stays on GitHub Pages, frozen. Only bug fixes go in; no new features.
- **v1:** built in `app/` in the same repo (separate `index.html`, JS modules, PWA files) and deployed to S3 + CloudFront with the backend in DEPLOYMENT-PLAN.md. v1 starts from the v0.2 catalog data (copied into `app/js/seed/`) and then diverges.
- **v1 address:** https://strength.logbook.me (CloudFront alias; DNS is a CNAME at GoDaddy). One stack, `strength-prod`, while the app is unpublished and being tested.
- When v1 meets the acceptance criteria (Section 11), it replaces the viewer as the daily-use app; the viewer can stay up as a read-only guide.

### 0.A App v0.1 — Static program viewer (shipped)

A read-only guide to the **spec v1.0** program (the v1.0 text is in git at commit `543d99b`), shipped as a single static `index.html` (no build step, no backend, no sign-in). Hosted on GitHub Pages from `main`. Any state lives only in the browser's `localStorage` (per device, not synced).

#### 0.A.1 Weekly schedule (fixed by weekday)
| Day | Content |
|---|---|
| Monday | Workout A |
| Tuesday | Mobility circuit |
| Wednesday | Workout B |
| Thursday | Mobility circuit |
| Friday | Workout C |
| Saturday, Sunday | Rest / activity |

- The day selector defaults to today; any day can be opened. Gym days are marked with a green dot, mobility days with an indigo dot.
- v0.1 maps workouts to fixed weekdays. v1 rotates by last completed workout (Section 4.1).

#### 0.A.2 Gym days
- The 5 slots of each spec v1.0 workout, in order: **Superset 1** (slots 1+2), **Superset 2** (slots 3+4), **Finisher** (slot 5). Workout A has no face pull; Workout B slot 5 is the Pallof press. No warm-up cards on gym days.
- Each card shows the Phase 2 set count with the hint "(2 sets in weeks 1–4)", the rep target, a short back-friendly form cue, target muscles, and for superset slots "Alternate with <partner>; rest 60–90 s between rounds" (partner name reflects any swap).

#### 0.A.3 Mobility days (Tuesday, Thursday)
- The spec v1.0 per-session warm-up used as a stand-alone circuit: cat-cow 1 × 8–10, bird dog 1 × 6 / side, glute bridge 1 × 10, bodyweight squat 1 × 10.
- The header shows the next gym day, e.g. "Next: Wednesday – Workout B".

#### 0.A.4 Rest days (Saturday, Sunday)
- A rest card suggesting Bollyx, a longer hike, or 8,000–10,000 steps, plus the next gym day.

#### 0.A.5 Session navigation and progress
- One exercise card at a time with Prev/Next buttons, swipe, and progress dots.
- "Mark this exercise as done" checkbox per card. The header shows "Workout A: x/5" or "Mobility: x/4". Done state is stored per date and session (`localStorage` key `strengthV01Progress`).

#### 0.A.6 Alternatives
- Slots with alternatives in the spec v1.0 list show an **Alternatives (n)** button that opens a list with a GIF thumbnail, name, source credit, and **Use this** button for each option. The v1.0 list includes 45° back extension (light) as a Dumbbell Romanian deadlift alternative.
- A swap replaces the card's exercise (name, GIF, cue, tags); sets and reps stay the slot's. It persists for that workout and slot (`localStorage` key `strengthV01Swaps`). The card then shows "Swapped from <original> · Revert", and the original stays in the list.

#### 0.A.7 Exercise media
- Every exercise and alternative has an animated GIF, hotlinked from the publisher (not stored in the repo), with an "Art credit" link to the publisher's page for that exercise. Sources: StrengthLog (25), Spotebi (bird dog, split squat), Yoga Journal (cat-cow).
- If a GIF is missing or fails to load, a placeholder image is shown.
- Known gap: suitcase carry has no GIF (no free one-sided carry GIF was found); it shows the placeholder.

#### 0.A.8 Not in v0.1
Weight/rep logging, progression suggestions (Section 5), rest timer, sign-in and sync, exercise history, settings/export, PWA install. These arrive with the v1 milestones in Section 10.

#### 0.A.9 Gaps vs. spec v1.6
All closed by v0.2 (0.B) except the gym warm-up, which stays out by choice.

- Workout A has no face pull (slot 6); Workout B has the Pallof press in slot 5 instead of the pushup, and no 45° back extension (slot 6). Supersets are fixed at slots 1+2 / 3+4 / 5.
- Tue/Thu shows the old 4-item circuit instead of the sitting recovery routine (4.6).
- Alternatives follow the v1.0 list: no face pull, back extension, or pushup alternatives, no TRX alternatives (4.5.1), and back extension is still listed for the Dumbbell Romanian deadlift.
- The gym warm-up (4.2) is not shown. This stays out of v0.2 by choice.
- Progress dates use the UTC date (`toISOString()`), so checkmarks made after ~5 pm Pacific are stored under the next day.

### 0.B App v0.2 — Static viewer aligned to spec v1.6 (shipped)

Same delivery as v0.1: a single static `index.html` on GitHub Pages, no build step, no backend, no sign-in, state only in `localStorage`. Shows the spec v1.6 program (Section 4). Still no logging.

#### 0.B.1 Weekly schedule (fixed by weekday, as in v0.1)
| Day | Content |
|---|---|
| Monday | Workout A |
| Tuesday | Sitting recovery routine (4.6) |
| Wednesday | Workout B |
| Thursday | Sitting recovery routine (4.6) |
| Friday | Workout C |
| Saturday, Sunday | Rest / activity |

- **Header (sticky):** pinned to the top while scrolling. It has only two parts: a status line, e.g. "Mon · Workout A · 2/6 done", "Tue · Recovery · Round 1 · 3/8", or "Sat · Rest day"; and the day selector (v0.1 dots). It starts collapsed, showing only the status line with a chevron. Tapping the status line expands it to show the day selector. Picking a day collapses it, and so does scrolling down while it's expanded. A small icon button at the right end of the status line cycles the theme and is always visible. There is no title, date, phase chip, or progress row.
- **Card carousel:** all of a day's cards sit in one continuous horizontal swipe carousel (one card per swipe, neighbors peeking at the edges). Swiping past the second exercise of a superset continues into the next superset. Navigation is by swipe only: no Prev/Next buttons, dots, or position indicator. Replaces v0.1's one-card-at-a-time view.
- Rest card: Bollyx, a longer hike, or 8,000–10,000 steps, plus "Take at least one full rest day this week (an easy walk is fine)" and the next gym day.
- **Theme:** light and dark themes. A single small icon button (44 px tap area, 18 px icon) in the header cycles System → Light → Dark, showing a half-filled circle, a sun, or a moon. The default "System" follows the device setting and switches live when it changes. Stored per device (`localStorage` key `strengthTheme`) and applied before first paint, so there's no flash of the wrong theme.

#### 0.B.2 Gym days
**Workout slots only.** The gym warm-up (4.2 cardio and back activation) and the optional post-lift cardio (4.4) are not shown; the day opens directly on the first workout slot and ends on the last one.

Card order, grouped by superset (4.3):
- **A:** Superset 1 goblet squat + dumbbell bench press · Superset 2 dumbbell Romanian deadlift + chest-supported row · Superset 3 dead bug + face pull
- **B:** Superset 1 leg press + lat pulldown · Superset 2 hip thrust + seated dumbbell shoulder press · Superset 3 pushup + 45° back extension
- **C:** Superset 1 trap bar deadlift + incline dumbbell press · Superset 2 reverse lunge + seated cable row · Finisher farmer carry

Each workout card shows everything a v0.1 card shows (sets with the "(2 sets in weeks 1–4)" hint, reps, cue, target muscles, superset partner line), plus:
- **Superset marking:** the card label reads "Superset 1 · 1 of 2" / "Superset 1 · 2 of 2" ("Finisher" for Workout C slot 5), and each superset has its own accent color on the card's left edge (Superset 1 green, 2 indigo, 3 amber).
- **Alternatives:** two small buttons on one row, **Options** (cyan) and **TRX** (fuchsia), each with a count badge, opening the two groups defined in 0.B.4.
- **Starting weight** from 5.6, as display text only (e.g. "New to this? Start at 20 lbs per hand — one dumbbell"). Trap bar: "Empty trap bar (45–65 lbs, set by the bar)". Exercises starting at 0 show their note (e.g. hip thrust "Bodyweight first, then empty bar"). Pushup: "Level 1 (standard), 10 reps per set". Swapped-in alternatives without a seeded value show no starting weight; TRX alternatives show their starting level (0.B.4).
- **Ramp-up hint** on slots 1 and 3: "Before your first set: ~50% × 8, then ~75% × 4 of your working weight." Not shown for bodyweight, bodyweight_loadable, carry, or suspension (TRX) types. On exercises whose starting weight is 0 (leg press, hip thrust, reverse lunge) it reads "Once loaded: …".
- **Seeded cues** from 4.3 for face pull, 45° back extension, and pushup.

**Pushup card (B5):** level 1 (standard), target 10 reps, plus the rationale text from 4.3. An expandable **Pushup ladder** lists levels 0–5 with reps and cues (5.4); display only, no level tracking.

Header status line counts: "x/6 done" for A and B, "x/5 done" for C.

#### 0.B.3 Recovery days (Tuesday, Thursday)
- The 8 exercises from 4.6, one card each, with prescription and cue: half-kneeling hip flexor stretch, glute bridge, McGill curl-up, side plank, bird dog, open book thoracic rotation, band pull-apart, dowel hip hinge.
- A **Round 1 / Round 2** toggle; done state is stored per round, so the routine can be split into two chunks on the same day.
- Header status line: "Tue · Recovery · Round 1 · x/8".
- Equipment note: resistance band, mat, dowel/broomstick.

#### 0.B.4 Alternatives (two groups)
Each gym card can open two separate lists from a single row of small buttons: **Options** (the back-friendly swaps from 4.5) and **TRX** (4.5.1). Each button has its own color (Options cyan, TRX fuchsia), and the open list is edged in that color. Opening one closes the other. Each list works like v0.1: GIF thumbnail, name, source credit, and **Use this** per option. A button is hidden when its group is empty.

| Slot | Exercise | Alternatives | TRX alternatives |
|---|---|---|---|
| A1 | Goblet squat | Leg press, Box squat | TRX squat |
| A2 | Dumbbell bench press | — | TRX chest press |
| A3 | Dumbbell Romanian deadlift | Hip thrust, Cable pull-through | TRX hamstring curl |
| A4 | Chest-supported row | Seated cable row, Machine row | TRX row |
| A5 | Dead bug | — | TRX plank |
| A6 | Face pull | Reverse pec deck, Band pull-apart | TRX face pull |
| B1 | Leg press | — | TRX Bulgarian split squat |
| B2 | Lat pulldown | — | TRX high row |
| B3 | Hip thrust | — | TRX hip thrust |
| B4 | Seated dumbbell shoulder press | Machine shoulder press, Landmine press | — |
| B5 | Pushup | Machine chest press, Pallof press | TRX chest press |
| B6 | 45° back extension | Machine back extension, Bird dog (weighted hold) | — |
| C1 | Trap bar deadlift | Bulgarian split squat, Leg press | — |
| C2 | Incline dumbbell press | — | TRX chest press |
| C3 | Reverse lunge | Split squat, Step-up | TRX reverse lunge |
| C4 | Seated cable row | — | TRX row |
| C5 | Farmer carry | Suitcase carry (one side) | — |

- One active swap per slot, from either group. The card shows "Swapped from <original> · Revert", and the original stays reachable from the list it was swapped from.
- **Sets** always come from the slot. **Reps** come from the alternative when the spec gives it its own (all TRX alternatives per 4.5.1, e.g. TRX plank "2 × 20–40 s hold"; Pallof press 10 per side); otherwise they stay the slot's.
- TRX cards show "Level: start at 2 of 5" with the level description and cue from 4.5.1 (TRX plank: hold, no levels).
- When both exercises in a superset are TRX, show the pairing tip from 4.5.1.

#### 0.B.5 Storage and migration
- **Progress:** new key `strengthV02Progress`. v0.1 stores done state by card index, and the card lists change (A6, B5, B6, 8-item recovery routine), so v0.1 progress is not migrated.
- **Swaps:** keep `strengthV01Swaps` (keyed by workout + slot). On load, ignore any saved swap that is not in that slot's current Alternatives or TRX alternatives (e.g. a v0.1 A3 → 45° back extension swap is dropped).
- **Date fix:** use the local date for progress keys, not the UTC date (0.A.9).

#### 0.B.6 Exercise media
- Same rules as v0.1: GIFs hotlinked from the publisher with an "Art credit" link; placeholder when missing or failing to load.
- Reused from v0.1: all current workout exercises and alternatives, bird dog, glute bridge. Removed: cat-cow, bodyweight squat (no longer in the program).
- No media for the gym warm-up (not shown).
- **New GIFs:**
  - StrengthLog: face pull, pushup, machine chest press, reverse pec deck (reverse machine fly), band pull-apart. 45° back extension keeps its v0.1 GIF.
  - Spotebi: machine back extension, half-kneeling hip flexor stretch, side plank; bird dog (weighted hold) reuses the bird dog GIF.
  - Truman State Campus Rec (public TRX GIF pages): TRX row (low row), high row, squat, reverse lunge (backward lunge), Bulgarian split squat (rear foot in strap), chest press (standing pushup), plank (feet in straps).
- **Known gaps (placeholder):** TRX face pull, TRX hip thrust, TRX hamstring curl (no matching free GIF found; Planfit only offers video); McGill curl-up, open book thoracic rotation, dowel hip hinge; suitcase carry (as in v0.1).

#### 0.B.7 Not in v0.2
Weight/rep/level logging, progression, calibration, scheduled increases, deloads and program-week tracking (no program start date), back pain gate, rest timer, sign-in and sync, exercise history, settings/export, PWA install. These arrive with the v1 milestones in Section 10. The gym warm-up (4.2) and post-lift cardio (4.4) are not planned at all (dropped in v1.11).

#### 0.B.8 Known issues (accepted for v0.2)
- The default day uses the device's weekday name (`toLocaleDateString`), so a non-English locale falls back to Monday.
- Done state is stored under today's date, not the selected day's; ticking cards while viewing another day files them under today.
- Cards with no GIF show the placeholder image with the "Live form reference" label still on it.

---

## 1. Goals

**User goals the app serves**
1. Increase lean mass (especially appendicular lean mass).
2. Reduce visceral fat (VAT).
3. Strengthen the back and reduce sitting-related lower back pain.
4. Stay consistent with 3 gym sessions per week. (Other activity is tracked on the Apple Watch, not here.)

**What the app must do well**
- Make logging a gym session fast enough to do between sets on a phone.
- Tell the user what weight to use next time, based on the progression rules in Section 5.
- Show per-exercise history so progress is visible (6.6).

---

## 2. User profile (context only; store in UserProfile)

| Field | Value |
|---|---|
| Age | 50 |
| Height | 5 ft 11 in (71 in / 1.803 m) |
| Current weight | ~193 lbs (Sep 2026 DEXA) |
| Diet | Indian vegetarian, eats eggs, uses protein shakes |
| Medication | GLP-1 for ~1 year (lost ~30 lbs) |
| Limitation | Lower back pain from prolonged sitting |
| Other activity | Bollyx dance classes 3x/week; enjoys hiking (Redwood City, CA area) |
| Training history | HIIT ~3 years ago for a year; bodyweight/pushups for last 3 months. Pushup baseline: 4 sets of 15, 15, 10, 5 with good form, 60–90 s rest |
| Equipment | Full gym (including TRX suspension trainer); resistance band, mat, and dowel/broomstick at home |

Units throughout: **lbs** for mass.

---

## 3. Baseline DEXA data (context only; not stored in the app)

| Field | Dec 02, 2025 10:24am | Apr 26, 2026 1:24pm | Sep 15, 2026 7:39am |
|---|---|---|---|
| Body fat % | 35.0 | 30.8 | 32.6 |
| Total mass (lbs) | 193.5 | 188.7 | 193.2 |
| Fat mass (lbs) | 67.8 | 58.2 | 62.9 |
| Lean mass (lbs) | 119.1 | 123.9 | 123.6 |
| Bone mass (lbs) | 6.6 | 6.6 | 6.7 |
| Visceral fat (lbs) | 2.5 | 1.9 | 2.5 |
| Visceral fat percentile | 64 | 51 | 65 |
| Lean mass index (kg/m²) | 16.6 | 17.3 | 17.2 |
| Lean mass index percentile | 9 | 17 | 16 |
| ALMI (kg/m²) | 8.89 | 9.10 | 9.16 |
| ALMI percentile | 36 | 43 | 45 |

---

## 4. Training program

### 4.1 Weekly structure
- 3 full-body gym sessions per week, rotating **A → B → C → A …**. Rotation is by last completed workout, not by weekday.
- No gym sessions on consecutive days. If the user starts a gym session the day after a previous gym session, show a non-blocking warning.
- Tuesday and Thursday: sitting recovery mobility routine only (Section 4.6), done at home. These are recovery days for the upper body: no pushups or other resistance work.
- Recovery rule: each muscle group gets at least 48 hours between resistance sessions (ACSM guidance for older adults). The Mon/Wed/Fri gym schedule satisfies this; pushups live in Workout B for this reason.
- At least one full rest day per week (an easy walk is fine).
- Bollyx 3x/week, 1 longer hike per week, and daily steps are tracked on the Apple Watch, outside this app.
- Target gym session length: ~45 minutes.

### 4.2 Gym warm-up — not in the app
A warm-up (about 5 min of easy-to-brisk cardio, then the McGill Big 3: curl-up, side plank, bird dog) is still recommended, but the app does not show, time, or log it. ~~Ramp-up sets (5.5) are part of the workout, not the warm-up.~~

### 4.3 Workouts

Exercises are grouped as supersets: slots with the same superset group are alternated. Rest 60–90 seconds between rounds.

**Workout A**
| Slot | Superset | Exercise | Sets | Reps | Type |
|---|---|---|---|---|---|
| 1 | 1 | Goblet squat | 3 | 8–12 | dumbbell |
| 2 | 1 | Dumbbell bench press | 3 | 8–12 | dumbbell |
| 3 | 2 | Dumbbell Romanian deadlift | 3 | 8–10 | dumbbell |
| 4 | 2 | Chest-supported row | 3 | 10–12 | dumbbell/machine |
| 5 | 3 | Dead bug | 2 | 8 per side | bodyweight |
| 6 | 3 | Face pull | 2 | 12–15 | cable |

**Workout B**
| Slot | Superset | Exercise | Sets | Reps | Type |
|---|---|---|---|---|---|
| 1 | 1 | Leg press | 3 | 10–12 | machine |
| 2 | 1 | Lat pulldown | 3 | 10–12 | cable |
| 3 | 2 | Hip thrust | 3 | 10–12 | barbell/machine |
| 4 | 2 | Seated dumbbell shoulder press | 3 | 8–12 | dumbbell |
| 5 | 3 | Pushup | 3 | per ladder level (standard: 10–20) | bodyweight_ladder |
| 6 | 3 | 45° back extension | 2 | 10–15 | bodyweight_loadable |

**Workout C**
| Slot | Superset | Exercise | Sets | Reps | Type |
|---|---|---|---|---|---|
| 1 | 1 | Trap bar deadlift | 3 | 6–10 | barbell |
| 2 | 1 | Incline dumbbell press | 3 | 8–12 | dumbbell |
| 3 | 2 | Reverse lunge | 2 | 8 per leg | dumbbell |
| 4 | 2 | Seated cable row | 3 | 10–12 | cable |
| 5 | — | Farmer carry | 3 | 40 m | carry (load + distance) |

**Exercise cues to seed (shown on tap):**
- 45° back extension: "Start bodyweight only. Move slowly, pause 1 s at the top. Go only as low as comfortable. Stop when the body forms a straight line; don't arch or swing."
- Face pull: "Rope at face height, pull toward forehead, elbows high, squeeze shoulder blades."
- Pushup: "Body in a straight line from head to heels, like a moving plank. Stop 2–3 reps short of failure." Starting point: level 1 (standard), target 10 reps per set. Rationale to display in exercise info: "Baseline was 15, 15, 10, 5 over 4 sets, so later sets reached failure. Starting at 10 reps with 2–3 in reserve keeps quality high and leaves room to progress." Pushups double as core (anti-extension) work, replacing the Pallof press.

### 4.4 Post-lift cardio — not in the app
An optional 10–15 min incline walk after lifting is still fine, but the app does not show or log it.

### 4.5 Back-friendly substitutions
Each slot must support swapping the exercise for an alternative. Swaps persist for future sessions of that workout until changed back. Seed these alternatives:

| Exercise | Alternatives |
|---|---|
| Goblet squat | Leg press, Box squat |
| Dumbbell Romanian deadlift | Hip thrust, Cable pull-through |
| Trap bar deadlift | Bulgarian split squat, Leg press |
| Reverse lunge | Split squat, Step-up |
| Chest-supported row | Seated cable row, Machine row |
| Seated dumbbell shoulder press | Machine shoulder press, Landmine press |
| Farmer carry | Suitcase carry (one side) |
| Face pull | Reverse pec deck, Band pull-apart |
| 45° back extension | Machine back extension, Bird dog (weighted hold) |
| Pushup | Machine chest press, Pallof press (for sessions where pressing should be skipped, e.g. shoulder discomfort) |

The exercise catalog is fixed: it ships with the app, and there is no UI to add custom exercises. Changing the catalog is a code change.

#### 4.5.1 TRX alternatives
Add these as additional swap options for the listed slot exercises. TRX exercises use the `suspension` type (Section 5.4): difficulty is logged as a level from 1 (easiest) to 5 (hardest) instead of a weight. Default starting level: 2. Exercises with no good TRX equivalent (shoulder press, trap bar deadlift, back extension, farmer carry) have none.

| Slot exercise | TRX alternative | Reps | What the levels mean | Cue to display |
|---|---|---|---|---|
| Goblet squat | TRX squat | 12–15 | Level 1: lean back, arms assist heavily. Level 5: minimal arm assist, full depth with 3 s lowering. | Hold straps lightly; sit back and down. Use arms only as needed. |
| Leg press | TRX Bulgarian split squat (rear foot in strap) | 8–12 per leg | Level 1: shallow depth. Level 5: full depth with slow lowering. | Keep front knee tracking over toes; torso tall. |
| Reverse lunge | TRX reverse lunge (hands on straps for balance) | 8–12 per leg | Level 1: hands assist. Level 5: no assist, 3 s lowering. | Step back, lower straight down. |
| Dumbbell bench press | TRX chest press | 10–15 | Level 1: nearly upright. Level 5: body angle close to 45°. Change by walking feet back. | Straight line from head to heels; don't let hips sag. |
| Incline dumbbell press | TRX chest press | 10–15 | As above. | As above. |
| Pushup | TRX chest press | 10–15 | As above. | As above. |
| Chest-supported row | TRX row | 10–15 | Level 1: nearly upright. Level 5: body close to horizontal. Change by walking feet forward. | Squeeze glutes and brace; pull handles to ribs. Less back support than the chest-supported row; use a more upright level on sore-back days. |
| Seated cable row | TRX row | 10–15 | As above. | As above. |
| Lat pulldown | TRX high row | 10–15 | Level 1: nearly upright. Level 5: steep lean. | Pull with elbows high toward face level. |
| Face pull | TRX face pull (or TRX reverse fly) | 12–15 | Level 1: nearly upright. Level 5: steep lean. | Elbows high; squeeze shoulder blades together. |
| Hip thrust | TRX hip thrust (heels in straps) | 10–15 | Level 1: two legs, partial range. Level 5: single leg, full range. | Drive hips up through heels; no lower-back arch at the top. |
| Dumbbell Romanian deadlift | TRX hamstring curl (heels in straps) | 8–12 | Level 1: hips stay down. Level 5: single leg with hips held up. | Keep hips up throughout if possible; slow return. |
| Dead bug | TRX plank (feet in straps) | 2 × 20–40 s hold | Hold type; no levels. | Body straight; don't let hips sag or pike. |

Pairing note: when a swap puts two TRX exercises in the same superset (e.g., TRX row + TRX chest press), show a tip: "Both use the TRX; if the station is shared, alternate with the dumbbell version."


### 4.6 Tuesday/Thursday sitting recovery routine (~10 min, at home)
2 rounds. Shown as guidance only: one card per exercise with prescription and cue. Nothing is checked off, logged, or synced.

| Exercise | Prescription | Cue to display |
|---|---|---|
| Half-kneeling hip flexor stretch | 30 s per side | Squeeze the glute of the back leg. |
| Glute bridge | 12 reps | Pause at the top. |
| McGill curl-up | 5 holds × 8–10 s | One knee bent, hands under lower back; lift head and shoulders only slightly. |
| Side plank | 15–20 s per side | From knees if needed. |
| Bird dog | 5 per side, 8–10 s hold | Hips level. |
| Open book thoracic rotation | 5 per side | Lying on side, rotate top arm open. |
| Band pull-apart | 15 reps | Arms straight, squeeze shoulder blades. |
| Dowel hip hinge | 5 reps | Dowel touches head, upper back, and tailbone throughout. |

Band pull-aparts here are light activation, not a training stimulus; no progression.

---

## 5. Progression rules (the core logic)

Implement as **pure functions** with unit tests. These rules drive the "suggested weight" and "suggested sets" shown when a session starts, next to the weights used last time.

**v1.13 scope.** The app shows last session's sets, pre-fills the suggestion in an editable box, and after a few weeks prompts a load increase (5.12). Struck-through text is removed and not built.

### 5.1 Phases
- **Phase 1 (program weeks 1–4):** the full set counts from Section 4.3 (v1.14; it was 2 working sets per exercise). Target effort: stop with ~3 reps left (RIR 3).
- **Phase 2 (week 5 onward):** the same set counts. Target effort: 1–2 reps left (RIR 1–2).
- Program week = weeks elapsed since `programStartDate` (stored on UserProfile; user-editable), counted in Pacific-time calendar days. Initial value: **2026-09-28** (a Monday, the first Workout A), so that day is program week 1, Phase 1.
- Display the current phase and target effort on the session screen, in plain words ("stop each set with about 3 reps left").

### 5.2 Base load and suggestion (weighted exercises)
For each exercise, look at the most recent completed session containing that exercise (working sets only). If that session's working sets used different weights (e.g. a manual override), the heaviest weight used is the base load.
- The suggestion is the base load (hold), or the base load plus one increment when a scheduled increase is due (5.12). The screen shows last session's sets ("Last: 35 × 12, 12, 11") next to the suggestion, and the weight box is editable.
- ~~1. If **every working set** reached the **top of the rep range** → suggest increasing the load next time and target the bottom of the rep range.~~
- ~~2. Else if reps fell **below the bottom of the range** on at least one set in **each of the last 2 sessions** → suggest reducing load ~10% (rounded to available increment).~~
- ~~3. Else → suggest the same load, and aim to add reps.~~

For per-side exercises (reverse lunge, Pallof press, dead bug), reps are per side.

### 5.3 Load increments (defaults, user-editable per exercise)
| Type | Increment |
|---|---|
| Dumbbell, one dumbbell (goblet squat, box squat) | +5 lbs |
| Dumbbell, one in each hand (all other dumbbell exercises) | +2.5 lbs per dumbbell |
| Barbell / trap bar | +10 lbs total |
| Machine / cable | +10 lbs (or next stack plate); face pull +5 lbs |
| Carry | +5 lbs per hand |
| ~~Bodyweight loadable~~ | ~~+5 lbs (plate held to chest)~~ (no progression, see 5.4) |

### 5.4 Bodyweight exercises
**v1.13: no progression logic for bodyweight-based exercises** (dead bug, 45° back extension, TRX/suspension levels, pushup ladder). They show sets, reps and last time, and the weight or level box is pre-filled with the last value used (or the starting value) and stays editable; the app never suggests a change. The rules below are struck except first-loaded weights (which apply to the weighted exercises that start empty) and the recovery routine note.
- ~~**Bodyweight (dead bug):** no load. When all sets hit the top of the range, show a text hint suggesting a harder variation or slower tempo (no auto-change).~~
- ~~**Bodyweight loadable (45° back extension):** load starts at 0 (bodyweight). Apply double progression (5.2); when all sets hit the top of the range, suggest adding the increment (0 → 5 lbs → 10 lbs …). Never suggest a negative load; a reduction from 5 lbs goes to 0.~~
- **First-loaded weight:** any exercise whose current load is 0 and has `firstLoadedWeightLbs` set jumps to that value on its first increase instead of the normal increment (e.g. hip thrust 0 → 45 lb empty bar; reverse lunge 0 → 10 lbs per hand). ~~A reduction below `firstLoadedWeightLbs` goes to 0.~~
- **Recovery routine items** are guidance only; no progression.
- ~~**Suspension (TRX):** load is the level (1–5), not weight. Apply double progression (5.2) with levels in place of load: when every working set reaches the top of the rep range, suggest the next level (max 5) at the bottom of the range; if reps fall below the bottom of the range on a set in each of the last 2 sessions, suggest dropping one level (min 1). At level 5 and top of range, show a hint to add slower lowering (3 s) or switch back to the loaded gym exercise. The level field replaces the weight field in the set-logging UI (stepper 1–5), pre-filled with the suggested level and always editable. No ramp-up sets, no calibration prompts, not affected by the back pain gate (not flagged loadsBack). Suspension holds (TRX plank) follow the hold rules: completion only.~~
- ~~**Bodyweight ladder (pushup):** progress by reps, then by variation. Each variation has its own rep range. When every working set reaches the top of the current level's range, suggest moving up one level at the bottom of the next level's range, with the increase highlight from 6.3 (label "↑ Next level · Earned"). If reps fall below the bottom of the range in each of the last 2 sessions at a new level, suggest dropping back one level. Scheduled increases (5.12) do not apply. The user can pick any level manually.~~

  | Level | Variation | Reps | Cue |
  |---|---|---|---|
  | 0 | Incline pushup (hands on bench) | 10–20 | Regression only; used if dropping back from level 1. |
  | 1 | Standard pushup (start here) | 10–20 | |
  | 2 | Tempo pushup | 8–15 | 3 s lowering, 1 s pause at the bottom. |
  | 3 | Feet-elevated pushup | 8–15 | Feet on a step or bench, 12–18 in. |
  | 4 | Deficit pushup | 8–15 | Hands on pushup handles or dumbbells; chest below hand level. |
  | 5 | Weighted pushup | 8–15 | Weight vest or loaded backpack; then progress load by +5 lbs using double progression (5.2). |


### ~~5.5 Ramp-up sets~~ — removed (v1.13)

Not built. The original text is kept for reference.

- ~~Generated before the **first exercise of Superset 1 and Superset 2** (slots 1 and 3) when that exercise has a suggested working weight.~~
- ~~Ramp set 1: 50% of working weight × 8 reps. Ramp set 2: 75% × 4 reps.~~
- ~~Round each to the exercise's load increment (nearest; exact ties round up). Omit a ramp set if it rounds to 0 or equals the working weight.~~
- ~~No ramp sets for bodyweight, bodyweight_loadable, or carry types, when the working weight is 0, or during an exercise's calibration sessions (5.6).~~
- ~~Ramp sets are logged with `isRampUp = true` and excluded from progression and volume stats.~~

### 5.6 Starting weights ~~and calibration~~

**Starting weights.** Every exercise has a seeded `startingWeightLbs`, used as the suggested weight when the exercise has no history. The suggestion is **pre-filled as the default in every set's weight field, and the user can always log a different weight**. The logged (actual) weight, not the suggestion, drives all future progression. Starting weights are editable in Settings. Values are conservative for a detrained 50-year-old with a sensitive lower back; back-loading hinges start lightest on purpose.

Dumbbell values are per hand. Leg press values are added plates, excluding the sled.

| Exercise | startingWeightLbs | firstLoadedWeightLbs | Note to display |
|---|---|---|---|
| Goblet squat | 20 | — | One dumbbell |
| Dumbbell bench press | 20 | — | |
| Dumbbell Romanian deadlift | 15 | — | Learn the hinge first |
| Chest-supported row | 20 | — | |
| Dead bug | 0 | — | Bodyweight |
| Face pull | 20 | — | Cable stacks vary by machine |
| Leg press | 0 | 50 | Empty sled; next step one 25-lb plate per side |
| Lat pulldown | 60 | — | |
| Hip thrust | 0 | 45 | Bodyweight first, then empty bar |
| Seated dumbbell shoulder press | 15 | — | |
| Pushup | 0 (ladder level 1, standard) | — | Target 10 reps per set to start |
| Pallof press (alternative) | 10 | — | |
| 45° back extension | 0 | — | Bodyweight |
| Trap bar deadlift | = `trapBarWeightLbs` (default 45) | — | Empty trap bar; bar weight varies 45–65 lbs, set in Settings |
| Incline dumbbell press | 20 | — | |
| Reverse lunge | 0 | 10 | Bodyweight first |
| Seated cable row | 60 | — | |
| Farmer carry | 35 | — | |

**No history (v1.14).** An exercise whose `startingWeightLbs` is 0 and that has a `firstLoadedWeightLbs` (leg press 50, hip thrust 45, reverse lunge 10) pre-fills its first-loaded weight instead of 0, and the person can still log less. Once a weight has been logged, the pre-fill is that (5.2), including a logged 0.

Swapped-in alternatives without a seeded value: no pre-fill; prompt the user to enter a weight they could lift for the top of the range with ~3 reps to spare.

~~Calibration~~ — removed (v1.13). The first sessions of an exercise are not special; the starting weight is only a pre-fill. Original text, struck:

~~**Calibration.** An exercise's first 2 completed sessions are calibration sessions (`isCalibration` on its SetLogs). During calibration, after each working set of a weighted exercise, show a one-tap prompt: "How did that feel?"~~
- ~~**Too easy** (could do 5+ more reps than the top of the range) → next set's pre-filled weight goes up one increment (or to `firstLoadedWeightLbs` from 0).~~
- ~~**About right** → no change.~~
- ~~**Too hard** (couldn't reach the bottom of the range with good form) → next set's pre-filled weight goes down one increment (minimum 0).~~

~~The prompt is skippable. After calibration ends, normal double progression (5.2) applies.~~

### 5.7 Examples (use as unit test cases)
Struck examples belong to removed rules (v1.13). Unless stated otherwise, assume no scheduled increase (5.12) is due.

- ~~Goblet squat, range 8–12, last session 3×12 at 35 lbs → suggest 40 lbs, target 8 reps.~~
- Goblet squat, last session 12, 11, 10 at 35 lbs → suggest 35 lbs, add reps.
- ~~Lat pulldown, range 10–12, last two sessions each had a set of 8 at 100 lbs → suggest 90 lbs.~~
- ~~Reverse lunge 8 per leg (repMin = repMax = 8), 2×8 achieved → suggest +5 lbs.~~
- Phase 1 week 2 → Workout A shows its full set counts (3, 3, 3, 3, 2, 2).
- ~~Back extension, last session 2×15 at 0 lbs → suggest 5 lbs, target 10 reps.~~
- ~~Back extension at 5 lbs, below 10 reps on a set in each of the last 2 sessions → suggest 0 lbs.~~
- ~~Trap bar deadlift working weight 135 lbs (increment 10) → ramp sets 70 × 8 (67.5 rounds to 70) and 100 × 4 (101.25 rounds to 100).~~
- ~~Goblet squat working weight 15 lbs (increment 5) → ramp sets 10 × 8 (7.5 rounds to 10) and 10 × 4 (11.25 rounds to 10); both kept since neither is 0 or 15.~~
- ~~Hip thrust with no history → no ramp sets.~~
- ~~Face pull (slot 6) → never gets ramp sets.~~
- Goblet squat, no history → pre-filled 20 lbs on every set; user logs 25 instead → 25 is stored as actual, 20 as suggested.
- ~~Goblet squat calibration, set 1 at 20 lbs rated "Too easy" → set 2 pre-filled at 25 lbs.~~
- ~~Dumbbell RDL calibration, set 1 at 15 lbs rated "Too hard" → set 2 pre-filled at 10 lbs.~~
- ~~Hip thrust, last session 2×12 at 0 lbs (range 10–12) → suggest 45 lbs, target 10 reps.~~
- ~~Reverse lunge, last session 2×8 at 0 lbs → suggest 10 lbs.~~
- ~~Goblet squat suggested 40, user logs 35 and completes 3×12 → next suggestion is 40 (progression uses actual weight).~~
- ~~Program week 11 → deload: Workout A shows 2 sets for 3-set exercises and 1 set for 2-set exercises, at the base load, no increases.~~
- ~~Program weeks 11 and 18 are scheduled deloads; weeks 10 and 12 are not.~~
- ~~Manual deload started in program week 9 → next scheduled deload is week 16.~~
- ~~Back pain before = 5; Dumbbell RDL base 25 lbs with all sets at top of range → suggest 25 (gated); Dumbbell bench press in the same session still progresses normally.~~
- ~~Back pain before not entered → no gate applied.~~
- ~~Lat pulldown with the reduction rule firing in week 8 and again in week 14 → "stalled" flag (2 reductions within 9 weeks).~~
- ~~Pushup level 1, last session 20, 20, 20 → suggest level 2 (tempo), target 8 reps, highlighted "Next level".~~
- ~~Pushup level 1, last session 14, 12, 10 → stay at level 1.~~
- ~~Pushup level 2, below 8 reps on a set in each of the last 2 sessions → suggest level 1.~~
- ~~Pushup at level 1 for 5 weeks without reaching 3×20 → no scheduled increase (ladder exercises excluded).~~
- Workout B in Phase 1 → pushups show 3 sets, and 3 sets in Phase 2 too; ~~in a deload week, 2 sets~~.
- ~~Pushup is never flagged loadsBack and never gets ramp-up sets.~~
- ~~TRX row at level 2, last session 3×15 → suggest level 3, target 10 reps, highlighted "↑ Level 3 · Earned".~~
- ~~TRX row at level 3, reps not at top, 21 days since last level increase → suggest level 4, "Scheduled".~~
- ~~TRX chest press at level 1, below the bottom of the range in each of the last 2 sessions → stays at level 1 (minimum).~~
- ~~TRX row at level 5 with 3×15 → stays at level 5; show the slower-lowering hint.~~
- Swapping Chest-supported row → TRX row pre-fills level 2 with no history; ~~no ramp-up sets~~.

### ~~5.8 Deload weeks~~ — removed (v1.13)

Not built; there are no deload weeks, banners or controls. The original text is kept for reference.

- ~~Schedule: the first deload is program week 11 (after Phase 1 plus 6 Phase 2 weeks). After any deload, the next is scheduled 7 program weeks later (6 training weeks + 1 deload). Phase 1 has no deload.~~
- ~~In a deload week, every session uses: working sets = ceil(normal set count ÷ 2); weight = the exercise's base load (no increase); target RIR 3–4. Ramp-up sets still apply. No calibration prompts.~~
- ~~Deload sessions are stored with `isDeload = true` and excluded from progression (5.2), stall detection (5.10), and the "weight increase next time" callouts.~~
- ~~User controls on Home and in Settings: **Start deload week now** (marks the current program week as a deload; the schedule restarts from it) and **Postpone 1 week** (allowed once per scheduled deload).~~
- ~~Show a banner on Home and the session screen during a deload week: "Deload week: same weights, half the sets. Let your joints and back catch up."~~

### ~~5.9 Back pain gate~~ — removed (v1.13)

Not built. Back pain before/after stay as optional session fields (6.3) and change no suggestion. The original text is kept for reference.

- ~~At session start, prompt for back pain before (0–10, one tap, skippable).~~
- ~~Exercises flagged `loadsBack = true` (seed: goblet squat, dumbbell Romanian deadlift, trap bar deadlift, 45° back extension, farmer carry): if back pain before is **above 3**, the suggestion never increases load for that session; it stays at the base load (reductions still apply). Show a note on those exercises offering the back-friendly swap (4.5).~~
- ~~Other exercises progress normally.~~

### ~~5.10 Stall detection~~ — removed (v1.13)

Not built. The original text is kept for reference.

- ~~Because scheduled increases (5.12) raise load at least every 3 weeks, a stall shows up as repeated reductions rather than a flat load.~~
- ~~An exercise is **stalled** if the reduction rule (5.2 rule 2) has fired **2 or more times within the last 9 weeks**.~~
- ~~Show a "stalled" badge on the exercise and in exercise history with tips: "Weight is going up faster than your reps can follow. Check sleep and protein, or consider turning off scheduled increases for this exercise." No automatic change.~~
- ~~Clears after 9 weeks without a reduction.~~

### ~~5.11 Expected pace~~ — removed (v1.13)

Not built. The original text is kept for reference.

~~Each exercise is performed about once a week (A/B/C rotation). "Earned" increases come from performance (5.2); scheduled increases (5.12) fill in every 3 weeks otherwise. Show this guide in exercise history so the user can judge progress:~~

| ~~Exercise group~~ | ~~Typical load increase in the first 3 months~~ |
|---|---|
| ~~Leg press, trap bar deadlift, hip thrust~~ | ~~Every 1–3 weeks~~ |
| ~~Machine/cable upper body (pulldown, rows, face pull)~~ | ~~Every 2–4 weeks~~ |
| ~~Dumbbell exercises (a 5-lb jump is a large % change)~~ | ~~Every 3–5 weeks~~ |
| ~~Back extension, carries~~ | ~~Every 3–6 weeks~~ |

~~Note to display: "Progress slows after the first few months. Adding reps counts as progress too."~~

### 5.12 Scheduled increases (every 3 weeks, per exercise)
Tracked independently for each exercise.
- **Timer start:** the date of the exercise's last load increase (a session whose heaviest weight is above the previous session's, whether it followed a suggestion or a manual override to a heavier weight). If there has been no increase yet, the timer starts on the date of its first completed session.
- **Trigger:** at the first session on or after timer start + `scheduledIncreaseDays` (default 21), the suggested weight = base load + one increment (or `firstLoadedWeightLbs` from 0). Readiness is not checked and no warning is shown. Target reps = bottom of the rep range.
- ~~If an earned increase (5.2 rule 1) is already due, apply only that one increase (never two increments at once).~~ An increase is always exactly one increment.
- **Precedence:** a due scheduled increase is applied; otherwise the suggestion holds at the base load. (Removed: ~~1. deload week~~, ~~2. reduction~~, ~~3. back pain gate~~.)
- The increase applies to the suggestion only. The weight field stays editable; if the user logs the old weight instead, the timer does not reset (it resets only when a heavier weight is actually logged), so the next session suggests the increase again.
- Not applied to bodyweight-based exercises (5.4: no progression), holds, or exercises with no starting weight and no history. ~~For suspension exercises, a scheduled increase is +1 level (max 5).~~
- ~~Ramp-up sets (5.5) are calculated from the increased weight.~~
- Settings: global on/off and interval (days); per-exercise on/off.

Test cases:
- Lat pulldown last increased on Oct 1 to 70 lbs, reps not at top of range; next session Oct 22 → suggest 80 lbs, source "scheduled".
- Same exercise, session on Oct 20 → suggest 70 lbs (hold).
- ~~Goblet squat all sets at top of range and scheduled increase also due → suggest +5 only, source "earned".~~
- ~~Scheduled increase due but reduction rule fires → suggest the reduced weight, source "reduction".~~
- ~~Scheduled increase due, back pain before = 5 on a loadsBack exercise → hold this session, increase suggested next session.~~
- ~~Scheduled increase due in program week 11 (deload) → no increase; applied at first session of week 12.~~
- Suggested 80 (scheduled), user logs 70 → next session suggests 80 again.
- Hip thrust at 0 lbs, 21 days since its first completed session → suggest 45 lbs.
- Scheduled increases turned off for an exercise → no increase is suggested; the suggestion holds at the base load.

---

## 6. Features (v1 scope)

### 6.1 Authentication and sync
- Sign-in required (single user today, but data model is per-user). The user signs in with an email address and a single permanent **6-digit PIN** (Cognito's minimum password length is 6, so a shorter PIN is not possible).
- Data syncs across phone and desktop via the backend.

### 6.2 Home / Today screen
- Home is the v0.2 viewer's page (v1.14, 0.B.1): a slim header (one status line such as "Wed · Workout B · 0/6 done", which opens to the day pills Monday to Sunday, the save state, the back pain rating for the workout about to start, and sign out; a dot for whether the work is saved; a theme button) over the day's swipe carousel of cards. There is no Start button: the next workout (A/B/C by rotation) is shown as cards, and it starts when the first exercise is marked done. The no-consecutive-days warning shows above the cards if applicable.
- On Tuesdays and Thursdays the cards are the recovery routine (4.6), with a last card to show the workout instead (a workout is never blocked). Picking a day pill shows that day's cards.
- **Finished workouts (v1.15).** Below the cards, a "Finished workouts" card lists the workouts finished in the last 7 days (Pacific dates), newest first: workout, day, exercises done of the total, and an **Edit** button that opens the workout as in 6.3. It is hidden when there are none. A finished workout never changes which workout is next (rotation, 4.1).
- ~~Deload banner during a deload week (5.8), and the Start deload / Postpone controls.~~

### 6.3 Workout session (most important screen; phone-first)
- **Exercises in one horizontal swipe carousel, as in the v0.2 viewer (0.B.1)** (v1.14): one card per swipe with the neighbours peeking, ordered by superset, each superset with its own accent colour on the card's left edge (Superset 1 green, 2 indigo, 3 amber, Finisher none) and a label such as "Superset 1 · 1 of 2". Each card shows: suggested weight, target reps, set count for the current phase, and last session's result (e.g. "Last: 35 × 12, 12, 11"). ~~Ramp-up sets shown above the first working set for slots 1 and 3, visually distinct.~~
- **Logging (v1.14): one tick per exercise.** At the bottom of the card, where the viewer had "mark this exercise as done", a barrel dial per set holds the weight and one shared dial holds the reps; each shows one value, already at the suggested weight and the recommended reps, and turns in 2.5 lb notches (drag up for more, down for less, or tap its upper or lower half). One tick logs every set of the exercise at once; after that the card shows a one-line summary with Edit and Undo. A weight that differs between sets is set on that set's dial; a dial changed on a set carries to the sets after it. Levels (TRX, pushups) use dials of 1 to 5, carries a distance dial. No RIR. The layout follows what was asked for: the GIF is the hero at the top of the card, with the cue, muscles and the Options and TRX lists above the dials.
- Changing the weight (or TRX level) on one set pre-fills it into the remaining sets of the same exercise in this session.
- For suspension exercises, the weight field is replaced by a level stepper (1–5) with the exercise's level description shown on tap.
- **Increase highlight:** when the suggested weight is higher than the previous session's base load, the weight field and exercise header use a distinct accent color and bold weight, with an up-arrow badge and text such as "↑ +5 lbs from 25 · Scheduled". Meaning must not rely on color alone (arrow + text always shown). The highlight stays for that session only.
- ~~Calibration prompt after each working set during an exercise's first 2 sessions (5.6).~~
- Back pain before is an optional field asked at session start (one tap, skippable); it changes no suggestion.
- ~~Deload banner and halved set counts during deload weeks (5.8).~~
- Rest timer (default 90 s, adjustable) that starts when an exercise is marked done.
- Swap exercise (Section 4.5). Tap exercise name for cues.
- Optional session fields: back pain rating 0–10 (before and after), notes.
- **Draft safety:** an in-progress session must survive a page refresh, app switch, or dropped gym Wi-Fi. Persist the draft locally and save to the backend on finish (and opportunistically during the session).
- Finish → summary screen showing total working sets, session duration, and any "weight increase next time" callouts. The summary has an **Edit workout** button (6.3, v1.15).
- **Editing a finished workout (v1.15).** A finished workout can be reopened from Home (6.2) or its summary. It shows the same cards as during the workout, for that workout's day: the same exercises (swaps as they were), what was ticked with its summary line and Edit and Undo, and the rest with their dials at what was suggested for that day. Ticking an exercise logs its sets into the workout; Edit and Undo change or remove the logged sets. The workout keeps its date, start and finish times, back pain and notes; the rest timer does not run; swapping an exercise, Finish and Discard are not offered (a swap is for the next workout, and a finished workout is not deleted). Weights and reps logged this way count for the next suggestions like any others (5.2, 5.12), because they are sets of that workout.

### 6.4 Activity log — removed
Steps, Bollyx, hikes, and mobility are tracked on the Apple Watch. Nothing is logged in this app.

### 6.5 Body metrics — removed
DEXA, waist, and body weight are not tracked in this app.

### 6.6 Exercise history
- Per exercise: table of past sessions and a chart of top-set weight and working-set volume over time (ramp sets excluded). Each past session in the table opens that workout for editing (6.3, v1.15).
- Shows date of last increase, next scheduled increase date (or "off"), and marks each increase on the chart.

### 6.7 Settings
- Program start date (initially 2026-09-28), rest timer default, recovery days (default Tue/Thu), units display (lbs fixed for v1).
- Per exercise: starting weight, first-loaded weight, load increment.
- Trap bar weight (default 45 lbs).
- ~~Deload: show next scheduled deload week; Start deload week now; Postpone 1 week.~~
- Scheduled increases: on/off, interval in days (default 21); per-exercise on/off.
- Export all data as JSON (and CSV of logged sets).

---

## 7. Out of scope for v1
- Protein / nutrition tracking (planned for v2).
- Activity tracking (steps, Bollyx, hikes, mobility logs) and body metrics (DEXA, waist, weight): not tracked in this app (v1.10).
- Wearable integrations (Apple Health, Google Fit, Garmin). Steps and other activity are not tracked in this app at all.
- Push notifications.
- Program builder UI beyond swaps; custom exercise entry (the catalog is fixed, v1.11).
- Social or multi-user features, AI coaching.

---

## 8. Data model (logical; adapt to the chosen backend)

All records belong to an owner (the signed-in user). Storage is an append-only event log (one event per change, edits are later events on the same entity, state is derived by replaying events); see DEPLOYMENT-PLAN.md. The static seed data below ships with the app code; only user-generated records (sessions, set logs, settings, swaps, deloads) are stored as events.

- **UserProfile**: programStartDate (initial value 2026-09-28), restTimerDefaultSec, recoveryDays (default [Tue, Thu]), trapBarWeightLbs (default 45), scheduledIncreasesEnabled (default true), scheduledIncreaseDays (default 21)
- **Exercise**: name, type (dumbbell | barbell | machine | cable | bodyweight | bodyweight_loadable | bodyweight_ladder | suspension | carry | hold | mobility), repMin, repMax, perSide (bool), holdSeconds (nullable), loadIncrementLbs, startingWeightLbs (nullable), firstLoadedWeightLbs (nullable), startingNote (nullable), startingLevel (nullable; suspension, default 2), levelDescription (nullable; suspension), ~~loadsBack (bool)~~, scheduledIncreasesEnabled (default true), cues (optional text)
- **WorkoutTemplate**: code (A | B | C), name
- **TemplateSlot**: templateId, slotNumber (1–6), supersetGroup (1 | 2 | 3 | null), exerciseId, phase2Sets, alternativeExerciseIds[]
- **SlotOverride**: templateSlotId, exerciseId (the user's persistent swap)
- **Routine**: code (SITTING_RECOVERY), name, rounds
- **RoutineItem**: routineId, order, exerciseId, prescription (text), sets/holds, reps, holdSeconds, perSide
- **WorkoutSession**: date, templateCode, startedAt, finishedAt, phase, programWeek, isDeload, backPainBefore, backPainAfter, notes
- **ExerciseLevel** (for bodyweight_ladder): exerciseId, level, name, repMin, repMax, cue
- **SetLog**: sessionId, exerciseId, levelNumber (nullable; ladder and suspension exercises), suggestedLevel (nullable), setNumber, isRampUp, isCalibration, suggestedWeightLbs (nullable), suggestionSource (starting | hold | scheduled | null in v1.13; the registry still accepts calibration, earned, reduction, deload and gated), weightLbs (nullable; actual, drives progression), reps (nullable), distanceM (nullable, carries), rir (nullable; not asked in the UI since v1.14), calibrationFeel (too_easy | about_right | too_hard | null), completed
- ~~**DeloadWeek**: programWeek, source (scheduled | manual), postponedFromWeek (nullable)~~ (removed, v1.13; the event types stay in the registry, unused)

Seed data: exercise catalog with cues, starting weights, first-loaded weights, and ~~loadsBack flags~~ (Sections 4 and 5), templates A/B/C with slots and alternatives (including TRX alternatives with starting levels and level descriptions, Section 4.5.1), the recovery routine (Section 4.6), and pushup ladder levels (Section 5.4). Seed data is bundled with the app, so there is nothing to seed into storage.

---

## 9. Non-functional requirements
- Mobile-first responsive UI; fully usable one-handed on a phone. Works well on desktop too.
- **Time zone:** all dates and times are US Pacific (`America/Los_Angeles`), stored with an explicit UTC offset (for example `2026-09-28T11:00:00.000-07:00`). Weekdays, the Tuesday/Thursday recovery day, program weeks, and the "date" of a session are Pacific. Timestamps are compared by instant, not as strings, because the offset changes at daylight saving.
- Installable as a PWA (home screen icon, standalone display).
- Light and dark mode.
- Fast: session screen interactive in under 2 seconds on a phone over mobile data.
- The rest timer must stay accurate if the screen locks or the app is backgrounded (compute from timestamps, not intervals).
- Accessible: 44px minimum tap targets, labeled inputs, sufficient contrast.
- Privacy: health data is personal. No third-party analytics or trackers. All data access requires auth.

---

## 10. Milestones (build in order; each ends deployable)

0. **Static viewer releases (Section 0):** App v0.1 program viewer (done, 0.A); App v0.2 viewer aligned to spec v1.6 (done, 0.B).
1. **Scaffold + auth + deploy:** sign-in, empty home screen, event sync endpoints, deployed and reachable from phone (see DEPLOYMENT-PLAN.md).
2. **Event store + seed data:** local outbox, sync, replay into state, catalog/templates/routines bundled in the app.
3. **Progression engine:** pure functions for Section 5 as cut in v1.13 (starting weights, last-time data, first-loaded weight, scheduled increases) with unit tests covering every example in 5.7 and 5.12 that is not struck.
4. **Workout logging:** pushup ladder in Workout B, session screen, rest timer, draft safety, swaps, summary, rotation logic, recovery routine guidance cards. Reopening a finished workout to correct it (v1.15) follows as a small addition before milestone 5.
5. **Exercise history, settings, data export, PWA polish.**

## 11. Acceptance criteria (v1 done when)
- I can sign in on my phone and desktop and see the same data.
- I can complete a full gym session (Workout A) on my phone without the app losing data, and the next Workout A shows correct suggested weights per Section 5.
- On a Tuesday, the home screen offers the recovery routine.
- Pushups appear in Workout B (no progression suggestions, v1.13).
- If I finish a workout and find an exercise was not ticked or was logged wrongly, I can reopen that workout from Home or its summary and fix it, and the next suggestions use the corrected numbers (6.3, v1.15).
- On a new exercise, the starting weight is pre-filled, I can log a different weight, and the next session's suggestion is based on what I actually lifted.
- An exercise whose weight hasn't gone up in 3 weeks shows an increased, clearly highlighted suggestion labeled "Scheduled" at its next session.
- Export produces a complete JSON file of my data.

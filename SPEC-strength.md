# Recomp Tracker — Product Spec (v1)

A personal, mobile-first web app to track a body recomposition program: build lean mass and reduce visceral fat. Used at the gym on a phone and at home on a desktop, with data synced across devices.

---

## 0. v0.1 — Static program viewer (current release)

A stepping stone before v1: a read-only guide to the program in Section 4, shipped as a single static `index.html` (no build step, no backend, no sign-in). Hosted on GitHub Pages from `main`. Any state lives only in the browser's `localStorage` (per device, not synced).

### 0.1 Weekly schedule (fixed by weekday)
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

### 0.2 Gym days
- Only the 5 slots from Section 4.3, in order: **Superset 1** (slots 1+2), **Superset 2** (slots 3+4), **Finisher** (slot 5). No warm-up cards on gym days.
- Each card shows the Phase 2 set count with the hint "(2 sets in weeks 1–4)", the rep target, a short back-friendly form cue, target muscles, and for superset slots "Alternate with <partner>; rest 60–90 s between rounds" (partner name reflects any swap).

### 0.3 Mobility days (Tuesday, Thursday)
- The Section 4.2 exercises as a stand-alone circuit instead of a per-session warm-up: cat-cow 1 × 8–10, bird dog 1 × 6 / side, glute bridge 1 × 10, bodyweight squat 1 × 10.
- The header shows the next gym day, e.g. "Next: Wednesday – Workout B".

### 0.4 Rest days (Saturday, Sunday)
- A rest card suggesting Bollyx, a longer hike, or 8,000–10,000 steps, plus the next gym day.

### 0.5 Session navigation and progress
- One exercise card at a time with Prev/Next buttons, swipe, and progress dots.
- "Mark this exercise as done" checkbox per card. The header shows "Workout A: x/5" or "Mobility: x/4". Done state is stored per date and session (`localStorage` key `strengthV01Progress`).

### 0.6 Alternatives
- Slots with alternatives in Section 4.4 show an **Alternatives (n)** button that opens a list with a GIF thumbnail, name, source credit, and **Use this** button for each option.
- A swap replaces the card's exercise (name, GIF, cue, tags); sets and reps stay the slot's. It persists for that workout and slot (`localStorage` key `strengthV01Swaps`). The card then shows "Swapped from <original> · Revert", and the original stays in the list.

### 0.7 Exercise media
- Every exercise and alternative has an animated GIF, hotlinked from the publisher (not stored in the repo), with an "Art credit" link to the publisher's page for that exercise. Sources: StrengthLog (25), Spotebi (bird dog, split squat), Yoga Journal (cat-cow).
- If a GIF is missing or fails to load, a placeholder image is shown.
- Known gap: suitcase carry has no GIF (no free one-sided carry GIF was found); it shows the placeholder.

### 0.8 Not in v0.1
Weight/rep logging, progression suggestions (Section 5), rest timer, sign-in and sync, activity log, body metrics, exercise history, settings/export, PWA install. These arrive with the v1 milestones in Section 10.

---

## 1. Goals

**User goals the app serves**
1. Increase lean mass (especially appendicular lean mass).
2. Reduce visceral fat (VAT).
3. Stay consistent: 3 gym sessions, 3 Bollyx dance classes, and 1 longer hike per week, plus 8,000–10,000 daily steps.

**What the app must do well**
- Make logging a gym session fast enough to do between sets on a phone.
- Tell the user what weight to use next time, based on the progression rules in Section 5.
- Show whether body composition is trending the right way across DEXA scans and monthly waist measurements.

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
| Training history | HIIT ~3 years ago for a year; bodyweight/pushups for last 3 months |
| Equipment | Full gym |

Units throughout: **lbs** for mass, **inches** for waist, **kg/m²** for lean mass indices (as reported by the DEXA provider).

---

## 3. Baseline DEXA data (seed these three records)

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

**Notes for the app**
- Scans were taken at different times of day. Store `scanTime` and a `fasted` boolean on every scan. Morning fasted scans are the comparable standard. When comparing two scans where one is not a morning/fasted scan, show a small note: "Scan conditions differ; lean mass changes may partly reflect food and water."
- Percentiles are for display only (from the provider); lower VAT percentile is better, higher lean mass/ALMI percentile is better. Color trend arrows accordingly (e.g. VAT going down = good/green).
- Next DEXA is due ~3–4 months after the most recent scan (Sep 15, 2026 → mid-Dec 2026 to mid-Jan 2027). Show a "next scan due" indicator computed from the latest scan date + 90 days.

---

## 4. Training program

### 4.1 Weekly structure
- 3 full-body gym sessions per week, rotating **A → B → C → A …**. Rotation is by last completed workout, not by weekday.
- No gym sessions on consecutive days. If the user starts a gym session the day after a previous gym session, show a non-blocking warning.
- Bollyx 3x/week and 1 longer hike per week are logged as activities (Section 6.4).
- Target session length: 30–45 minutes.

### 4.2 Warm-up (every session, ~5 min; single checkbox)
Cat-cow, bird dogs, glute bridges, bodyweight squats.

### 4.3 Workouts

Exercises are paired as supersets: slots 1+2 are Superset 1, slots 3+4 are Superset 2, slot 5 is done alone. Rest 60–90 seconds between rounds.

**Workout A**
| Slot | Exercise | Sets (Phase 2) | Reps | Type |
|---|---|---|---|---|
| 1 | Goblet squat | 3 | 8–12 | dumbbell |
| 2 | Dumbbell bench press | 3 | 8–12 | dumbbell |
| 3 | Dumbbell Romanian deadlift | 3 | 10 (range 8–10) | dumbbell |
| 4 | Chest-supported row | 3 | 10–12 | dumbbell/machine |
| 5 | Dead bug | 2 | 8 per side | bodyweight |

**Workout B**
| Slot | Exercise | Sets (Phase 2) | Reps | Type |
|---|---|---|---|---|
| 1 | Leg press | 3 | 10–12 | machine |
| 2 | Lat pulldown | 3 | 10–12 | cable |
| 3 | Hip thrust | 3 | 10–12 | barbell/machine |
| 4 | Seated dumbbell shoulder press | 3 | 8–12 | dumbbell |
| 5 | Pallof press | 2 | 10 per side | cable |

**Workout C**
| Slot | Exercise | Sets (Phase 2) | Reps | Type |
|---|---|---|---|---|
| 1 | Trap bar deadlift | 3 | 6–10 | barbell |
| 2 | Incline dumbbell press | 3 | 8–12 | dumbbell |
| 3 | Reverse lunge | 2 | 8 per leg | dumbbell |
| 4 | Seated cable row | 3 | 10–12 | cable |
| 5 | Farmer carry | 3 | 40 m | carry (load + distance) |

Note: Slots 3 and 4 in Workout B/C are listed in the order they should be superset; keep this order in the UI.

### 4.4 Back-friendly substitutions
The user has lower back pain. Each slot must support swapping the exercise for an alternative. Swaps persist for future sessions of that workout until changed back. Seed these alternatives:

| Exercise | Alternatives |
|---|---|
| Goblet squat | Leg press, Box squat |
| Dumbbell Romanian deadlift | Hip thrust, Cable pull-through, 45° back extension (light) |
| Trap bar deadlift | Bulgarian split squat, Leg press |
| Reverse lunge | Split squat, Step-up |
| Chest-supported row | Seated cable row, Machine row |
| Seated dumbbell shoulder press | Machine shoulder press, Landmine press |
| Farmer carry | Suitcase carry (one side) |

The exercise catalog must be user-extendable (add custom exercise with type and rep range).

---

## 5. Progression rules (the core logic)

Implement as **pure functions** with unit tests. These rules drive the "suggested weight" and "suggested sets" shown when a session starts.

### 5.1 Phases
- **Phase 1 (program weeks 1–4):** 2 working sets per exercise. Target effort: stop with ~3 reps in reserve (RIR 3).
- **Phase 2 (week 5 onward):** full set counts from Section 4.3. Target effort: RIR 1–2.
- Program week = weeks elapsed since `programStartDate` (stored on UserProfile; user-editable).
- Display the current phase and target RIR on the session screen.

### 5.2 Double progression (weighted exercises)
For each exercise, look at the most recent completed session containing that exercise:
1. If **every working set** reached the **top of the rep range** → suggest increasing the load next time and target the bottom of the rep range.
2. Else if reps fell **below the bottom of the range** on at least one set in **each of the last 2 sessions** → suggest reducing load ~10% (rounded to available increment).
3. Else → suggest the same load, and aim to add reps.

For per-side exercises (reverse lunge, Pallof press, dead bug), reps are per side.

### 5.3 Load increments (defaults, user-editable per exercise)
| Type | Increment |
|---|---|
| Dumbbell | +5 lbs (per dumbbell) |
| Barbell / trap bar | +10 lbs total |
| Machine / cable | +10 lbs (or next stack plate) |
| Carry | +5 lbs per hand, when all sets completed at full distance |

### 5.4 Bodyweight exercises (dead bug)
No load. When all sets hit the top of the range, suggest a harder variation or slower tempo (show text hint; no auto-change).

### 5.5 First session with an exercise
No history → no suggestion; prompt the user to pick a conservative starting weight they can do for the top of the range with RIR 3.

### 5.6 Examples (use as unit test cases)
- Goblet squat, range 8–12, last session 3×12 at 35 lbs → suggest 40 lbs, target 8 reps.
- Goblet squat, last session 12, 11, 10 at 35 lbs → suggest 35 lbs, add reps.
- Lat pulldown, range 10–12, last two sessions each had a set of 8 at 100 lbs → suggest 90 lbs.
- Reverse lunge 8 per leg, only range value 8 → top of range is 8; 2×8 achieved → suggest +5 lbs.
- Phase 1 week 2 → Workout A shows 2 sets for all exercises.

---

## 6. Features (v1 scope)

### 6.1 Authentication and sync
- Sign-in required (single user today, but data model is per-user).
- Data syncs across phone and desktop via the backend.

### 6.2 Home / Today screen
- Next workout (A/B/C) with a "Start" button and the no-consecutive-days warning if applicable.
- This week's progress (Mon–Sun): gym sessions x/3, Bollyx x/3, hikes x/1, average steps vs 8,000 target.
- Reminders shown inline (not push notifications in v1): waist measurement due (30+ days since last), DEXA due.
- Quick-add buttons: log steps, log Bollyx, log hike.

### 6.3 Workout session (most important screen; phone-first)
- Warm-up checkbox.
- Exercises grouped by superset, each showing: suggested weight, target reps, set count for the current phase, and last session's result (e.g. "Last: 35 × 12, 12, 11").
- Per set: weight (pre-filled with suggestion) and reps; optional RIR. Large tap targets; numeric keypad inputs.
- Rest timer (default 90 s, adjustable) that starts when a set is marked done.
- Swap exercise (Section 4.4).
- Optional session fields: back pain rating 0–10 (before and after), notes.
- **Draft safety:** an in-progress session must survive a page refresh, app switch, or dropped gym Wi-Fi. Persist the draft locally and save to the backend on finish (and opportunistically during the session).
- Finish → summary screen showing total sets and any "weight increase next time" callouts.

### 6.4 Activity log
| Type | Fields |
|---|---|
| Steps | date, step count (manual entry; one record per day, editable) |
| Bollyx | date, duration (min, default 60), optional effort 1–10 |
| Hike | date, trail name, duration (min), distance (mi), elevation gain (ft), optional notes |

- Weekly and monthly views. Hike duration trend (goal: build toward 90–120 min hikes).

### 6.5 Body metrics
- **DEXA scans:** list, add, edit. All fields from Section 3 plus `scanTime`, `fasted`, provider, notes.
- **Charts over time:** fat mass, lean mass, visceral fat, ALMI (each its own small chart; mark non-fasted scans).
- **Scan comparison:** pick two scans → table of deltas with good/bad coloring and the scan-conditions note from Section 3.
- **Waist:** date, inches (measured at navel, morning). Line chart. Reminder when 30+ days since last entry.
- Optional body weight log (date, lbs) — simple, same chart style as waist.

### 6.6 Exercise history
- Per exercise: table of past sessions and a chart of top-set weight and estimated volume over time.

### 6.7 Settings
- Program start date, rest timer default, load increments per exercise, units display (lbs fixed for v1).
- Export all data as JSON (and CSV per table).

---

## 7. Out of scope for v1
- Protein / nutrition tracking (planned for v2).
- Wearable integrations (Apple Health, Google Fit, Garmin); steps are manual in v1.
- Push notifications.
- Program builder UI beyond swaps and custom exercises.
- Social or multi-user features, AI coaching.

---

## 8. Data model (logical; adapt to the chosen backend)

All records belong to an owner (the signed-in user).

- **UserProfile**: heightIn, birthYear, programStartDate, restTimerDefaultSec, stepTarget (default 8000)
- **Exercise**: name, type (dumbbell | barbell | machine | cable | bodyweight | carry), repMin, repMax, perSide (bool), loadIncrementLbs, isCustom, cues (optional text)
- **WorkoutTemplate**: code (A | B | C), name
- **TemplateSlot**: templateId, slotNumber (1–5), supersetGroup (1 | 2 | null), exerciseId, phase2Sets, alternativeExerciseIds[]
- **SlotOverride**: templateSlotId, exerciseId (the user's persistent swap)
- **WorkoutSession**: date, templateCode, startedAt, finishedAt, warmupDone, phase, backPainBefore, backPainAfter, notes
- **SetLog**: sessionId, exerciseId, setNumber, weightLbs (nullable), reps (nullable), distanceM (nullable, carries), rir (nullable), completed
- **ActivityLog**: date, kind (steps | bollyx | hike), steps, durationMin, effort, trailName, distanceMi, elevationFt, notes
- **DexaScan**: scanDateTime, fasted, bodyFatPct, totalMassLbs, fatMassLbs, leanMassLbs, boneMassLbs, vatLbs, vatPercentile, lmi, lmiPercentile, almi, almiPercentile, provider, notes
- **WaistMeasurement**: date, inches
- **BodyWeight**: date, lbs

Seed data: exercise catalog (Section 4), templates A/B/C with slots and alternatives, the three DEXA scans (Section 3). Seeding must be idempotent.

---

## 9. Non-functional requirements
- Mobile-first responsive UI; fully usable one-handed on a phone. Works well on desktop too.
- Installable as a PWA (home screen icon, standalone display).
- Light and dark mode.
- Fast: session screen interactive in under 2 seconds on a phone over mobile data.
- Accessible: 44px minimum tap targets, labeled inputs, sufficient contrast.
- Privacy: health data is personal. No third-party analytics or trackers. All data access requires auth.

---

## 10. Milestones (build in order; each ends deployable)

0. **v0.1 static program viewer (done):** see Section 0.
1. **Scaffold + auth + deploy:** project setup, sign-in, empty home screen, deployed to AWS and reachable from phone.
2. **Data model + seed:** all models, seed script, exercise catalog and templates visible in app.
3. **Progression engine:** pure functions for Section 5 with unit tests covering every example in 5.6.
4. **Workout logging:** session screen, rest timer, draft safety, swaps, summary, rotation logic.
5. **Activity log + home weekly progress.**
6. **Body metrics:** DEXA list/add/compare, charts, waist and weight, reminders.
7. **Exercise history, settings, data export, PWA polish.**

## 11. Acceptance criteria (v1 done when)
- I can sign in on my phone and desktop and see the same data.
- I can complete Workout A on my phone in the gym without the app losing data, and the next Workout A shows correct suggested weights per Section 5.
- Home shows correct weekly counts for gym, Bollyx, hikes, and steps.
- All three baseline DEXA scans appear with trend charts, and adding a fourth updates charts and comparisons.
- Waist reminder appears 30 days after the last measurement.
- Export produces a complete JSON file of my data.

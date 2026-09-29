// Exercise catalog, copied verbatim from the frozen v0.2 viewer (root index.html, spec 0.C).
// Display data only: name, media, cue, muscle tags, type and a starting-weight hint as text.
// The structured fields spec section 8 lists for the engine (rep ranges, increments, numeric
// starting weights, loadsBack) are not here yet; they arrive with the engine (phase C).
// The catalog is fixed (spec 4.5): there are no events for creating exercises.

export const PLACEHOLDER_GIF =
    "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
        <rect width="640" height="400" fill="#0b1020"/>
        <g fill="none" stroke="#334155" stroke-width="3">
          <circle cx="320" cy="150" r="26"/>
          <path d="M320 176 v70 M320 200 l-42 34 M320 200 l42 34 M320 246 l-34 66 M320 246 l34 66" stroke-linecap="round"/>
        </g>
        <text x="320" y="350" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="#64748b">No demo available</text>
      </svg>`
    );

export const EXERCISES = {
  "bird-dog": {
    name: "Bird Dog",
    gifUrl: "https://spotebi.com/wp-content/uploads/2014/10/bird-dogs-exercise-illustration.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/bird-dogs/" },
    notes: "Reach opposite arm and leg long while keeping hips level and back flat.",
    tags: ["Core", "Glutes"],
    type: "bodyweight"
  },
  "glute-bridge": {
    name: "Glute Bridge",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2025/09/glutebridge.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/glute-bridge/" },
    notes: "Pause at the top. Drive through your heels and squeeze your glutes without arching your low back.",
    tags: ["Glutes", "Hamstrings"],
    type: "bodyweight"
  },
  "goblet-squat": {
    name: "Goblet Squat",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/02/Goblet-squat.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/goblet-squat/" },
    notes: "Hold the dumbbell tall at your chest, squat between your heels, and keep your torso upright.",
    tags: ["Quads", "Glutes", "Core"],
    type: "dumbbell",
    start: "20 lbs per hand — one dumbbell"
  },
  "db-bench-press": {
    name: "Dumbbell Bench Press",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/03/Dumbbell-Chest-Press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dumbbell-chest-press/" },
    notes: "Keep shoulder blades tucked into the bench and lower the dumbbells under control to chest level.",
    tags: ["Chest", "Triceps", "Shoulders"],
    type: "dumbbell",
    start: "20 lbs per hand"
  },
  "db-romanian-deadlift": {
    name: "Dumbbell Romanian Deadlift",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2022/09/romanian-deadlift-with-dumbbells.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dumbbell-romanian-deadlift/" },
    notes: "Soft knees, push hips back, and slide the dumbbells down your thighs with a flat back.",
    tags: ["Hamstrings", "Glutes", "Lower back"],
    type: "dumbbell",
    start: "15 lbs per hand — learn the hinge first"
  },
  "chest-supported-row": {
    name: "Chest-Supported Row",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2024/11/chest-supported-dumbbell-row.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/chest-supported-dumbbell-row/" },
    notes: "Let the bench support your chest so your low back stays relaxed; pull elbows toward your hips.",
    tags: ["Back", "Lats", "Biceps"],
    type: "dumbbell",
    start: "20 lbs per hand"
  },
  "dead-bug": {
    name: "Dead Bug",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2023/01/deadbug.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dead-bug/" },
    notes: "Press your low back gently into the floor and move opposite arm and leg slowly.",
    tags: ["Core", "Spine-friendly"],
    type: "bodyweight",
    start: "Bodyweight"
  },
  "leg-press": {
    name: "Leg Press",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2025/11/leg-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/leg-press/" },
    notes: "Keep your lower back on the pad and lower the sled only as far as your hips stay planted.",
    tags: ["Quads", "Glutes"],
    type: "machine",
    start: "Empty sled; next step one 25-lb plate per side",
    startsAtZero: true
  },
  "lat-pulldown": {
    name: "Lat Pulldown",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/03/lat-pulldown-with-pronated-grip.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/lat-pulldown/" },
    notes: "Pull the bar to your upper chest and think elbows down, not behind your neck.",
    tags: ["Lats", "Back", "Biceps"],
    type: "cable",
    start: "60 lbs"
  },
  "hip-thrust": {
    name: "Hip Thrust",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/02/Hip-thrust.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/hip-thrust/" },
    notes: "Drive through your heels to full hip extension without over-arching your low back at the top.",
    tags: ["Glutes", "Hamstrings"],
    type: "barbell",
    start: "Bodyweight first, then empty bar (45 lbs)",
    startsAtZero: true
  },
  "seated-db-shoulder-press": {
    name: "Seated Dumbbell Shoulder Press",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/11/Seated-dumbbell-shoulder-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/seated-dumbbell-shoulder-press/" },
    notes: "Sit tall with back support, ribs down, and press the dumbbells up without shrugging.",
    tags: ["Shoulders", "Triceps"],
    type: "dumbbell",
    start: "15 lbs per hand"
  },
  "pallof-press": {
    name: "Pallof Press",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2025/10/pallof-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/pallof-press/" },
    notes: "Stand tall and resist the cable pulling you sideways as you press straight out from your chest.",
    tags: ["Core", "Anti-rotation"],
    type: "cable",
    start: "10 lbs",
    reps: "10 / side"
  },
  "trap-bar-deadlift": {
    name: "Trap Bar Deadlift",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/03/Trap-Bar-Deadlift-With-High-Handles.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/trap-bar-deadlift/" },
    notes: "Use the high handles, push the floor away, and keep a long neutral spine.",
    tags: ["Glutes", "Quads", "Back"],
    type: "barbell",
    start: "Empty trap bar (45–65 lbs, set by the bar)"
  },
  "incline-db-press": {
    name: "Incline Dumbbell Press",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/03/Dumbbell-Incline-Press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dumbbell-incline-press/" },
    notes: "Set the bench low-to-moderate incline and press the dumbbells up and slightly together.",
    tags: ["Chest", "Shoulders", "Triceps"],
    type: "dumbbell",
    start: "20 lbs per hand"
  },
  "reverse-lunge": {
    name: "Reverse Lunge",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2025/01/reverse-dumbbell-lunge.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/lunge/" },
    notes: "Step back softly, lower straight down, and drive through the front foot to stand.",
    tags: ["Quads", "Glutes", "Balance"],
    type: "dumbbell",
    start: "Bodyweight first, then 10 lbs per hand",
    startsAtZero: true
  },
  "seated-cable-row": {
    name: "Seated Cable Row",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2023/03/cable-row-seated-narrow-grip.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/cable-close-grip-seated-row/" },
    notes: "Sit tall, pull the handle to your ribs, and avoid rocking your torso back and forth.",
    tags: ["Back", "Lats", "Biceps"],
    type: "cable",
    start: "60 lbs"
  },
  "farmer-carry": {
    name: "Farmer Carry",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2021/01/Farmers-walk.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/farmers-walk/" },
    notes: "Walk tall with heavy dumbbells, shoulders down and core braced, with calm breathing.",
    tags: ["Grip", "Core", "Traps"],
    type: "carry",
    start: "35 lbs per hand"
  },
  "box-squat": {
    name: "Box Squat",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/10/Box-Squat.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/box-squat/" },
    notes: "Sit back to lightly touch the box, keep tension, then drive up without rocking forward.",
    tags: ["Quads", "Glutes"],
    type: "dumbbell"
  },
  "cable-pull-through": {
    name: "Cable Pull-Through",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/04/cable-pull-through.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/cable-pull-through/" },
    notes: "Hinge at the hips with soft knees, then squeeze your glutes to pull the rope through.",
    tags: ["Glutes", "Hamstrings"],
    type: "cable"
  },
  "back-extension-45": {
    name: "45° Back Extension",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/05/back-extension-frontloaded.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/back-extension/" },
    notes: "Start bodyweight only. Move slowly, pause 1 s at the top. Go only as low as comfortable. Stop when the body forms a straight line; don't arch or swing.",
    tags: ["Lower back", "Glutes", "Hamstrings"],
    type: "bodyweight_loadable",
    start: "Bodyweight"
  },
  "bulgarian-split-squat": {
    name: "Bulgarian Split Squat",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/02/Bulgarian-split-squat.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/bulgarian-split-squat/" },
    notes: "Rest your back foot on a bench, stay tall, and lower straight down over the front foot.",
    tags: ["Quads", "Glutes", "Balance"],
    type: "dumbbell"
  },
  "split-squat": {
    name: "Split Squat",
    gifUrl: "https://spotebi.com/wp-content/uploads/2015/04/split-squat-exercise-illustration.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/split-squat/" },
    notes: "Hold a staggered stance and lower straight down, keeping most weight on the front leg.",
    tags: ["Quads", "Glutes"],
    type: "dumbbell"
  },
  "step-up": {
    name: "Step-Up",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2021/03/step-up-exercise.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/step-up/" },
    notes: "Use a low box, drive through the whole top foot, and step down under control.",
    tags: ["Quads", "Glutes", "Balance"],
    type: "dumbbell"
  },
  "machine-row": {
    name: "Machine Row",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/04/seated-machine-row.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/seated-machine-row/" },
    notes: "Keep your chest on the pad, pull elbows back, and squeeze your shoulder blades together.",
    tags: ["Back", "Lats", "Biceps"],
    type: "machine"
  },
  "machine-shoulder-press": {
    name: "Machine Shoulder Press",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/03/machine-shoulder-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/machine-shoulder-press/" },
    notes: "Set the seat so handles start at ear level and press up without arching your back.",
    tags: ["Shoulders", "Triceps"],
    type: "machine"
  },
  "landmine-press": {
    name: "Landmine Press",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2025/03/landmine-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/landmine-press/" },
    notes: "Press the bar up and slightly forward while staying tall and braced through your core.",
    tags: ["Shoulders", "Chest", "Triceps"],
    type: "barbell"
  },
  "suitcase-carry": {
    name: "Suitcase Carry (one side)",
    gifUrl: "",
    attribution: { label: "", url: "" },
    notes: "Carry a weight in one hand and resist leaning — walk tall like a moving side plank.",
    tags: ["Core", "Obliques", "Grip"],
    type: "carry"
  },
  "face-pull": {
    name: "Face Pull",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/05/face-pull.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/face-pull/" },
    notes: "Rope at face height, pull toward forehead, elbows high, squeeze shoulder blades.",
    tags: ["Rear delts", "Upper back"],
    type: "cable",
    start: "20 lbs — cable stacks vary by machine"
  },
  "pushup": {
    name: "Pushup",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/02/Push-up.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/push-up/" },
    notes: "Body in a straight line from head to heels, like a moving plank. Stop 2–3 reps short of failure.",
    tags: ["Chest", "Triceps", "Core"],
    type: "bodyweight_ladder",
    start: "Level 1 (standard), 10 reps per set",
    rationale: "Baseline was 15, 15, 10, 5 over 4 sets, so later sets reached failure. Starting at 10 reps with 2–3 in reserve keeps quality high and leaves room to progress.",
    // SPEC §5.4 pushup ladder (levels 0–5)
    ladder: [
      { level: 0, variation: "Incline pushup (hands on bench)", reps: "10–20", cue: "Regression only; used if dropping back from level 1." },
      { level: 1, variation: "Standard pushup (start here)",    reps: "10–20", cue: "" },
      { level: 2, variation: "Tempo pushup",                    reps: "8–15",  cue: "3 s lowering, 1 s pause at the bottom." },
      { level: 3, variation: "Feet-elevated pushup",            reps: "8–15",  cue: "Feet on a step or bench, 12–18 in." },
      { level: 4, variation: "Deficit pushup",                  reps: "8–15",  cue: "Hands on pushup handles or dumbbells; chest below hand level." },
      { level: 5, variation: "Weighted pushup",                 reps: "8–15",  cue: "Weight vest or loaded backpack; then progress load by +5 lbs." }
    ]
  },
  "machine-chest-press": {
    name: "Machine Chest Press",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/03/machine-chest-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/machine-chest-press/" },
    notes: "Set the seat so the handles sit at mid-chest and press without flaring your ribs.",
    tags: ["Chest", "Shoulders", "Triceps"],
    type: "machine"
  },
  "reverse-pec-deck": {
    name: "Reverse Pec Deck",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2025/11/reverse-machine-fly.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/reverse-machine-fly/" },
    notes: "Face the machine, keep a soft elbow bend, and squeeze your shoulder blades together.",
    tags: ["Rear delts", "Upper back"],
    type: "machine"
  },
  "band-pull-apart": {
    name: "Band Pull-Apart",
    gifUrl: "https://www.strengthlog.com/wp-content/uploads/2020/04/Band-Pull-Apart.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/band-pull-apart/" },
    notes: "Arms straight, pull the band apart until it touches your chest, and squeeze your shoulder blades.",
    tags: ["Rear delts", "Upper back"],
    type: "mobility"
  },
  "machine-back-extension": {
    name: "Machine Back Extension",
    gifUrl: "https://spotebi.com/wp-content/uploads/2014/10/back-extensions-exercise-illustration.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/back-extensions/" },
    notes: "Set the pad just below your hips, rise to a straight line, and lower slowly without rounding.",
    tags: ["Lower back", "Glutes"],
    type: "machine"
  },
  "bird-dog-weighted-hold": {
    name: "Bird Dog (Weighted Hold)",
    gifUrl: "https://spotebi.com/wp-content/uploads/2014/10/bird-dogs-exercise-illustration.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/bird-dogs/" },
    notes: "Hold a light plate or dumbbell in the reaching hand; keep hips level and the hold steady.",
    tags: ["Core", "Lower back", "Glutes"],
    type: "bodyweight_loadable"
  },
  "trx-squat": {
    name: "TRX Squat",
    gifUrl: "https://recreation.truman.edu/files/2019/03/squat.gif",
    attribution: { label: "Truman State Campus Rec", url: "https://recreation.truman.edu/trx-suspension-trainer-lower-body-gifs/" },
    notes: "Hold straps lightly; sit back and down. Use arms only as needed.",
    tags: ["Quads", "Glutes"],
    type: "suspension",
    reps: "12–15",
    trx: { levels: "Level 1: lean back, arms assist heavily. Level 5: minimal arm assist, full depth with 3 s lowering." }
  },
  "trx-bulgarian-split-squat": {
    name: "TRX Bulgarian Split Squat (rear foot in strap)",
    gifUrl: "https://recreation.truman.edu/files/2019/03/Foot-in-Band-Back-Lunge.gif",
    attribution: { label: "Truman State Campus Rec", url: "https://recreation.truman.edu/trx-suspension-trainer-suspended-exercises-gifs/" },
    notes: "Keep front knee tracking over toes; torso tall.",
    tags: ["Quads", "Glutes", "Balance"],
    type: "suspension",
    reps: "8–12 per leg",
    trx: { levels: "Level 1: shallow depth. Level 5: full depth with slow lowering." }
  },
  "trx-reverse-lunge": {
    name: "TRX Reverse Lunge (hands on straps for balance)",
    gifUrl: "https://recreation.truman.edu/files/2019/05/backwards-lunge.gif",
    attribution: { label: "Truman State Campus Rec", url: "https://recreation.truman.edu/trx-suspension-trainer-lower-body-gifs/" },
    notes: "Step back, lower straight down.",
    tags: ["Quads", "Glutes"],
    type: "suspension",
    reps: "8–12 per leg",
    trx: { levels: "Level 1: hands assist. Level 5: no assist, 3 s lowering." }
  },
  "trx-chest-press": {
    name: "TRX Chest Press",
    gifUrl: "https://recreation.truman.edu/files/2019/03/standing-push-up.gif",
    attribution: { label: "Truman State Campus Rec", url: "https://recreation.truman.edu/trx-suspension-exercises-upper-body-gifs/" },
    notes: "Straight line from head to heels; don't let hips sag.",
    tags: ["Chest", "Triceps", "Core"],
    type: "suspension",
    reps: "10–15",
    trx: { levels: "Level 1: nearly upright. Level 5: body angle close to 45°. Change by walking feet back." }
  },
  "trx-row": {
    name: "TRX Row",
    gifUrl: "https://recreation.truman.edu/files/2019/03/pull-to-chest.gif",
    attribution: { label: "Truman State Campus Rec", url: "https://recreation.truman.edu/trx-suspension-exercises-upper-body-gifs/" },
    notes: "Squeeze glutes and brace; pull handles to ribs. Less back support than the chest-supported row; use a more upright level on sore-back days.",
    tags: ["Back", "Lats", "Biceps"],
    type: "suspension",
    reps: "10–15",
    trx: { levels: "Level 1: nearly upright. Level 5: body close to horizontal. Change by walking feet forward." }
  },
  "trx-high-row": {
    name: "TRX High Row",
    gifUrl: "https://recreation.truman.edu/files/2019/03/pull-to-chest-wide.gif",
    attribution: { label: "Truman State Campus Rec", url: "https://recreation.truman.edu/trx-suspension-exercises-upper-body-gifs/" },
    notes: "Pull with elbows high toward face level.",
    tags: ["Lats", "Upper back"],
    type: "suspension",
    reps: "10–15",
    trx: { levels: "Level 1: nearly upright. Level 5: steep lean." }
  },
  "trx-face-pull": {
    name: "TRX Face Pull (or TRX reverse fly)",
    gifUrl: "",
    attribution: { label: "", url: "" },
    notes: "Elbows high; squeeze shoulder blades together.",
    tags: ["Rear delts", "Upper back"],
    type: "suspension",
    reps: "12–15",
    trx: { levels: "Level 1: nearly upright. Level 5: steep lean." }
  },
  "trx-hip-thrust": {
    name: "TRX Hip Thrust (heels in straps)",
    gifUrl: "",
    attribution: { label: "", url: "" },
    notes: "Drive hips up through heels; no lower-back arch at the top.",
    tags: ["Glutes", "Hamstrings"],
    type: "suspension",
    reps: "10–15",
    trx: { levels: "Level 1: two legs, partial range. Level 5: single leg, full range." }
  },
  "trx-hamstring-curl": {
    name: "TRX Hamstring Curl (heels in straps)",
    gifUrl: "",
    attribution: { label: "", url: "" },
    notes: "Keep hips up throughout if possible; slow return.",
    tags: ["Hamstrings", "Glutes"],
    type: "suspension",
    reps: "8–12",
    trx: { levels: "Level 1: hips stay down. Level 5: single leg with hips held up." }
  },
  "trx-plank": {
    name: "TRX Plank (feet in straps)",
    gifUrl: "https://recreation.truman.edu/files/2019/06/Plank-feet-in-straps.gif",
    attribution: { label: "Truman State Campus Rec", url: "https://recreation.truman.edu/trx-suspension-trainer-suspended-exercises-gifs-2/" },
    notes: "Body straight; don't let hips sag or pike.",
    tags: ["Core"],
    type: "suspension",
    reps: "20–40 s hold",
    trx: { hold: true }
  },
  "hip-flexor-stretch": {
    name: "Half-Kneeling Hip Flexor Stretch",
    gifUrl: "https://spotebi.com/wp-content/uploads/2015/03/hip-flexor-stretch-exercise-illustration.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/hip-flexor-stretch/" },
    notes: "Squeeze the glute of the back leg.",
    tags: ["Hip flexors", "Mobility"],
    type: "mobility"
  },
  "mcgill-curl-up": {
    name: "McGill Curl-Up",
    gifUrl: "",
    attribution: { label: "", url: "" },
    notes: "One knee bent, hands under lower back; lift head and shoulders only slightly.",
    tags: ["Core", "Spine-friendly"],
    type: "mobility"
  },
  "side-plank": {
    name: "Side Plank",
    gifUrl: "https://spotebi.com/wp-content/uploads/2014/10/side-plank-exercise-illustration.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/side-plank/" },
    notes: "From knees if needed.",
    tags: ["Core", "Obliques"],
    type: "hold"
  },
  "open-book": {
    name: "Open Book Thoracic Rotation",
    gifUrl: "",
    attribution: { label: "", url: "" },
    notes: "Lying on side, rotate top arm open.",
    tags: ["Thoracic spine", "Mobility"],
    type: "mobility"
  },
  "dowel-hip-hinge": {
    name: "Dowel Hip Hinge",
    gifUrl: "",
    attribution: { label: "", url: "" },
    notes: "Dowel touches head, upper back, and tailbone throughout.",
    tags: ["Hinge pattern", "Mobility"],
    type: "mobility"
  }
};

// Exercise catalog. It began as a copy of the v0.2 viewer's catalog and has since diverged (spec 0.C): v1.19 adds 16 exercises
// (4.5.2). Display data only: name, media, cue, muscle tags, type and a starting-weight hint as text.
// Optional image paths point to files supplied locally by the operator. Third-party images are not included or deployed by default;
// check docs/MEDIA-RIGHTS-AUDIT.md before downloading or redistributing any asset. `attribution` links to the source page.
// The structured fields (rep ranges, increments, numeric starting weights) are in rules.js.
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
    gifUrl: "img/bird-dog.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/bird-dogs/" },
    notes: "Reach opposite arm and leg long while keeping hips level and back flat.",
    tags: ["Core", "Glutes"],
    type: "bodyweight"
  },
  "glute-bridge": {
    name: "Glute Bridge",
    gifUrl: "img/glute-bridge.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/glute-bridge/" },
    notes: "Pause at the top. Drive through your heels and squeeze your glutes without arching your low back.",
    tags: ["Glutes", "Hamstrings"],
    type: "bodyweight"
  },
  "goblet-squat": {
    name: "Goblet Squat",
    gifUrl: "img/goblet-squat.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/goblet-squat/" },
    notes: "Hold the dumbbell tall at your chest, squat between your heels, and keep your torso upright.",
    tags: ["Quads", "Glutes", "Core"],
    type: "dumbbell",
    start: "20 lbs per hand — one dumbbell"
  },
  "db-bench-press": {
    name: "Dumbbell Bench Press",
    gifUrl: "img/db-bench-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dumbbell-chest-press/" },
    notes: "Keep shoulder blades tucked into the bench and lower the dumbbells under control to chest level.",
    tags: ["Chest", "Triceps", "Shoulders"],
    type: "dumbbell",
    start: "20 lbs per hand"
  },
  "db-romanian-deadlift": {
    name: "Dumbbell Romanian Deadlift",
    gifUrl: "img/db-romanian-deadlift.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dumbbell-romanian-deadlift/" },
    notes: "Soft knees, push hips back, and slide the dumbbells down your thighs with a flat back.",
    tags: ["Hamstrings", "Glutes", "Lower back"],
    type: "dumbbell",
    start: "15 lbs per hand — learn the hinge first"
  },
  "chest-supported-row": {
    name: "Chest-Supported Row",
    gifUrl: "img/chest-supported-row.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/chest-supported-dumbbell-row/" },
    notes: "Let the bench support your chest so your low back stays relaxed; pull elbows toward your hips.",
    tags: ["Back", "Lats", "Biceps"],
    type: "dumbbell",
    start: "20 lbs per hand"
  },
  "dead-bug": {
    name: "Dead Bug",
    gifUrl: "img/dead-bug.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dead-bug/" },
    notes: "Press your low back gently into the floor and move opposite arm and leg slowly.",
    tags: ["Core", "Spine-friendly"],
    type: "bodyweight",
    start: "Bodyweight"
  },
  "leg-press": {
    name: "Leg Press",
    gifUrl: "img/leg-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/leg-press/" },
    notes: "Keep your lower back on the pad and lower the sled only as far as your hips stay planted.",
    tags: ["Quads", "Glutes"],
    type: "machine",
    start: "Empty sled; next step one 25-lb plate per side",
    startsAtZero: true
  },
  "lat-pulldown": {
    name: "Lat Pulldown",
    gifUrl: "img/lat-pulldown.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/lat-pulldown/" },
    notes: "Pull the bar to your upper chest and think elbows down, not behind your neck.",
    tags: ["Lats", "Back", "Biceps"],
    type: "cable",
    start: "60 lbs"
  },
  "hip-thrust": {
    name: "Hip Thrust",
    gifUrl: "img/hip-thrust.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/hip-thrust/" },
    notes: "Drive through your heels to full hip extension without over-arching your low back at the top.",
    tags: ["Glutes", "Hamstrings"],
    type: "barbell",
    start: "Bodyweight first, then empty bar (45 lbs)",
    startsAtZero: true
  },
  "seated-db-shoulder-press": {
    name: "Seated Dumbbell Shoulder Press",
    gifUrl: "img/seated-db-shoulder-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/seated-dumbbell-shoulder-press/" },
    notes: "Sit tall with back support, ribs down, and press the dumbbells up without shrugging.",
    tags: ["Shoulders", "Triceps"],
    type: "dumbbell",
    start: "15 lbs per hand"
  },
  "pallof-press": {
    name: "Pallof Press",
    gifUrl: "img/pallof-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/pallof-press/" },
    notes: "Stand tall and resist the cable pulling you sideways as you press straight out from your chest.",
    tags: ["Core", "Anti-rotation"],
    type: "cable",
    start: "10 lbs",
    reps: "10 / side"
  },
  "trap-bar-deadlift": {
    name: "Trap Bar Deadlift",
    gifUrl: "img/trap-bar-deadlift.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/trap-bar-deadlift/" },
    notes: "Use the high handles, push the floor away, and keep a long neutral spine.",
    tags: ["Glutes", "Quads", "Back"],
    type: "barbell",
    start: "Empty trap bar (45–65 lbs, set by the bar)"
  },
  "incline-db-press": {
    name: "Incline Dumbbell Press",
    gifUrl: "img/incline-db-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dumbbell-incline-press/" },
    notes: "Set the bench low-to-moderate incline and press the dumbbells up and slightly together.",
    tags: ["Chest", "Shoulders", "Triceps"],
    type: "dumbbell",
    start: "20 lbs per hand"
  },
  "reverse-lunge": {
    name: "Reverse Lunge",
    gifUrl: "img/reverse-lunge.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/lunge/" },
    notes: "Step back softly, lower straight down, and drive through the front foot to stand.",
    tags: ["Quads", "Glutes", "Balance"],
    type: "dumbbell",
    start: "Bodyweight first, then 10 lbs per hand",
    startsAtZero: true
  },
  "seated-cable-row": {
    name: "Seated Cable Row",
    gifUrl: "img/seated-cable-row.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/cable-close-grip-seated-row/" },
    notes: "Sit tall, pull the handle to your ribs, and avoid rocking your torso back and forth.",
    tags: ["Back", "Lats", "Biceps"],
    type: "cable",
    start: "60 lbs"
  },
  "farmer-carry": {
    name: "Farmer Carry",
    gifUrl: "img/farmer-carry.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/farmers-walk/" },
    notes: "Walk tall with heavy dumbbells, shoulders down and core braced, with calm breathing.",
    tags: ["Grip", "Core", "Traps"],
    type: "carry",
    start: "35 lbs per hand"
  },
  "box-squat": {
    name: "Box Squat",
    gifUrl: "img/box-squat.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/box-squat/" },
    notes: "Sit back to lightly touch the box, keep tension, then drive up without rocking forward.",
    tags: ["Quads", "Glutes"],
    type: "dumbbell"
  },
  "cable-pull-through": {
    name: "Cable Pull-Through",
    gifUrl: "img/cable-pull-through.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/cable-pull-through/" },
    notes: "Hinge at the hips with soft knees, then squeeze your glutes to pull the rope through.",
    tags: ["Glutes", "Hamstrings"],
    type: "cable"
  },
  "back-extension-45": {
    name: "45° Back Extension",
    gifUrl: "img/back-extension-45.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/back-extension/" },
    notes: "Start bodyweight only. Move slowly, pause 1 s at the top. Go only as low as comfortable. Stop when the body forms a straight line; don't arch or swing.",
    tags: ["Lower back", "Glutes", "Hamstrings"],
    type: "bodyweight_loadable",
    start: "Bodyweight"
  },
  "bulgarian-split-squat": {
    name: "Bulgarian Split Squat",
    gifUrl: "img/bulgarian-split-squat.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/bulgarian-split-squat/" },
    notes: "Rest your back foot on a bench, stay tall, and lower straight down over the front foot.",
    tags: ["Quads", "Glutes", "Balance"],
    type: "dumbbell"
  },
  "split-squat": {
    name: "Split Squat",
    gifUrl: "img/split-squat.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/split-squat/" },
    notes: "Hold a staggered stance and lower straight down, keeping most weight on the front leg.",
    tags: ["Quads", "Glutes"],
    type: "dumbbell"
  },
  "step-up": {
    name: "Step-Up",
    gifUrl: "img/step-up.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/step-up/" },
    notes: "Use a low box, drive through the whole top foot, and step down under control.",
    tags: ["Quads", "Glutes", "Balance"],
    type: "dumbbell"
  },
  "machine-row": {
    name: "Machine Row",
    gifUrl: "img/machine-row.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/seated-machine-row/" },
    notes: "Keep your chest on the pad, pull elbows back, and squeeze your shoulder blades together.",
    tags: ["Back", "Lats", "Biceps"],
    type: "machine"
  },
  "machine-shoulder-press": {
    name: "Machine Shoulder Press",
    gifUrl: "img/machine-shoulder-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/machine-shoulder-press/" },
    notes: "Set the seat so handles start at ear level and press up without arching your back.",
    tags: ["Shoulders", "Triceps"],
    type: "machine"
  },
  "landmine-press": {
    name: "Landmine Press",
    gifUrl: "img/landmine-press.gif",
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
    gifUrl: "img/face-pull.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/face-pull/" },
    notes: "Rope at face height, pull toward forehead, elbows high, squeeze shoulder blades.",
    tags: ["Rear delts", "Upper back"],
    type: "cable",
    start: "20 lbs — cable stacks vary by machine"
  },
  "pushup": {
    name: "Pushup",
    gifUrl: "img/pushup.gif",
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
    gifUrl: "img/machine-chest-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/machine-chest-press/" },
    notes: "Set the seat so the handles sit at mid-chest and press without flaring your ribs.",
    tags: ["Chest", "Shoulders", "Triceps"],
    type: "machine"
  },
  "reverse-pec-deck": {
    name: "Reverse Pec Deck",
    gifUrl: "img/reverse-pec-deck.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/reverse-machine-fly/" },
    notes: "Face the machine, keep a soft elbow bend, and squeeze your shoulder blades together.",
    tags: ["Rear delts", "Upper back"],
    type: "machine"
  },
  "band-pull-apart": {
    name: "Band Pull-Apart",
    gifUrl: "img/band-pull-apart.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/band-pull-apart/" },
    notes: "Arms straight, pull the band apart until it touches your chest, and squeeze your shoulder blades.",
    tags: ["Rear delts", "Upper back"],
    type: "mobility"
  },
  "machine-back-extension": {
    name: "Machine Back Extension",
    gifUrl: "img/machine-back-extension.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/back-extensions/" },
    notes: "Set the pad just below your hips, rise to a straight line, and lower slowly without rounding.",
    tags: ["Lower back", "Glutes"],
    type: "machine"
  },
  "bird-dog-weighted-hold": {
    name: "Bird Dog (Weighted Hold)",
    gifUrl: "img/bird-dog-weighted-hold.gif",
    attribution: { label: "Spotebi", url: "https://www.spotebi.com/exercise-guide/bird-dogs/" },
    notes: "Hold a light plate or dumbbell in the reaching hand; keep hips level and the hold steady.",
    tags: ["Core", "Lower back", "Glutes"],
    type: "bodyweight_loadable"
  },
  // ---- Added in spec v1.19 (4.5.2); images from 4.5.3 ----
  "hack-squat": {
    name: "Hack Squat",
    gifUrl: "img/hack-squat.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/hack-squat/" },
    notes: "Back flat on the pad, feet shoulder-width, lower until your knees are comfortably bent and press through your whole foot.",
    tags: ["Quads", "Glutes"],
    type: "machine",
    start: "Empty sled first, then 20 lbs of plates"
  },
  "leg-extension": {
    name: "Leg Extension",
    gifUrl: "img/leg-extension.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/leg-extension/" },
    notes: "Set the pad on your lower shin, extend until your legs are straight without snapping, and lower slowly.",
    tags: ["Quads"],
    type: "machine",
    start: "30 lbs — stacks vary by machine"
  },
  "seated-leg-curl": {
    name: "Seated Leg Curl",
    gifUrl: "img/seated-leg-curl.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/seated-leg-curl/" },
    notes: "Sit back against the pad, curl your heels under you, and return slowly without letting the stack drop.",
    tags: ["Hamstrings"],
    type: "machine",
    start: "30 lbs — stacks vary by machine"
  },
  "cable-glute-kickback": {
    name: "Cable Glute Kickback",
    gifUrl: "img/cable-glute-kickback.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/cable-glute-kickback/" },
    notes: "Ankle strap on, hold the frame, and drive your leg back by squeezing the glute without arching your low back.",
    tags: ["Glutes"],
    type: "cable",
    start: "10 lbs"
  },
  "cable-chest-press": {
    name: "Cable Chest Press",
    gifUrl: "img/cable-chest-press.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/cable-chest-press/" },
    notes: "Handles at chest height, split stance for balance, press forward and bring the handles together without shrugging.",
    tags: ["Chest", "Triceps", "Shoulders"],
    type: "cable",
    start: "15 lbs per handle"
  },
  "pec-deck-fly": {
    name: "Pec Deck Fly",
    gifUrl: "img/pec-deck-fly.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/pec-deck/" },
    notes: "Back against the pad, soft elbows, bring the handles together in front of your chest and open slowly.",
    tags: ["Chest"],
    type: "machine",
    start: "40 lbs — stacks vary by machine"
  },
  "incline-machine-press": {
    name: "Incline Machine Press",
    gifUrl: "img/incline-machine-press.gif",
    attribution: { label: "Fitness Programer", url: "https://fitnessprogramer.com/exercise/incline-chest-press-machine/" },
    notes: "Set the seat so the handles start at upper-chest height and press up and forward without arching your back.",
    tags: ["Chest", "Shoulders", "Triceps"],
    type: "machine",
    start: "40 lbs — stacks vary by machine"
  },
  "machine-high-row": {
    name: "Machine High Row",
    gifUrl: "img/machine-high-row.gif",
    attribution: { label: "Fitness Programer", url: "https://fitnessprogramer.com/exercise/lever-high-row/" },
    notes: "Chest on the pad, pull the handles down and back toward your ribs, and squeeze your shoulder blades together.",
    tags: ["Lats", "Upper back"],
    type: "machine",
    start: "40 lbs — stacks vary by machine"
  },
  "one-arm-db-row": {
    name: "One-Arm Dumbbell Row (bench-supported)",
    gifUrl: "img/one-arm-db-row.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dumbbell-row/" },
    notes: "One hand and knee on the bench, flat back, pull the dumbbell to your hip and lower it under control.",
    tags: ["Back", "Lats", "Biceps"],
    type: "dumbbell",
    start: "20 lbs"
  },
  "single-arm-cable-row": {
    name: "Single-Arm Cable Row",
    gifUrl: "img/single-arm-cable-row.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/one-handed-cable-row/" },
    notes: "Sit tall, pull the handle to your ribs with your elbow close, and resist the cable twisting you.",
    tags: ["Back", "Lats", "Biceps"],
    type: "cable",
    start: "20 lbs"
  },
  "cable-reverse-fly": {
    name: "Cable Reverse Fly",
    gifUrl: "img/cable-reverse-fly.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/reverse-cable-fly/" },
    notes: "Cross the cables, soft elbows, and sweep your arms out and back, squeezing your shoulder blades.",
    tags: ["Rear delts", "Upper back"],
    type: "cable",
    start: "10 lbs per handle"
  },
  "chest-supported-rear-delt-raise": {
    name: "Chest-Supported Rear Delt Raise",
    gifUrl: "img/chest-supported-rear-delt-raise.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/reverse-dumbbell-flyes-on-incline-bench/" },
    notes: "Chest on an incline bench, light dumbbells, raise your arms out to the sides until they are level with your back.",
    tags: ["Rear delts", "Upper back"],
    type: "dumbbell",
    start: "5 lbs per hand"
  },
  "db-lateral-raise": {
    name: "Dumbbell Lateral Raise",
    gifUrl: "img/db-lateral-raise.gif",
    attribution: { label: "StrengthLog", url: "https://www.strengthlog.com/dumbbell-lateral-raise/" },
    notes: "Soft elbows, raise the dumbbells out to shoulder height without shrugging, and lower slowly.",
    tags: ["Shoulders"],
    type: "dumbbell",
    start: "5 lbs per hand"
  },
  "plank": {
    name: "Plank",
    gifUrl: "img/plank.gif",
    attribution: { label: "Jefit", url: "https://www.jefit.com/exercises/631/plank" },
    notes: "Forearms down, body in one straight line from head to heels; do not let your hips sag or pike.",
    tags: ["Core"],
    type: "hold",
    reps: "20–40 s hold"
  },
  "goblet-carry": {
    name: "Goblet Carry",
    gifUrl: "img/goblet-carry.webp",
    attribution: { label: "LoadMuscle", url: "https://loadmuscle.com/exercises/kettlebell-goblet-carry" },
    notes: "Hold one weight tight to your chest and walk tall, ribs down, with calm breathing.",
    tags: ["Core", "Grip", "Upper back"],
    type: "carry",
    start: "25 lbs — one dumbbell"
  },
  "trap-bar-carry": {
    name: "Trap Bar Carry (high handles)",
    gifUrl: "img/trap-bar-carry.webp",
    attribution: { label: "LoadMuscle", url: "https://loadmuscle.com/exercises/trap-bar-farmers-carry" },
    notes: "Stand inside the bar, lift with the high handles, and walk tall with your shoulders down.",
    tags: ["Grip", "Traps", "Core", "Glutes"],
    type: "carry",
    start: "Empty trap bar (45–65 lbs, set by the bar)"
  },
  // ---- Added in spec v1.22 (4.5.4): original art by the repository owner (no third-party source, no credit) ----
  "db-floor-press": {
    name: "Dumbbell Floor Press",
    gifUrl: "img/db-floor-press.gif",
    original: true,
    attribution: { label: "", url: "" },
    notes: "Lie on the floor with knees bent, lower your upper arms until they touch the floor, then press the dumbbells up over your chest.",
    tags: ["Chest", "Triceps"],
    type: "dumbbell",
    start: "20 lbs per hand"
  },
  "db-chest-fly": {
    name: "Dumbbell Chest Fly",
    gifUrl: "img/db-chest-fly.gif",
    original: true,
    attribution: { label: "", url: "" },
    notes: "Flat bench, soft elbows, open your arms wide in an arc until you feel a stretch across the chest, then bring the dumbbells back together over your chest.",
    tags: ["Chest"],
    type: "dumbbell",
    start: "10 lbs per hand"
  },
  "db-pullover": {
    name: "Dumbbell Pullover",
    gifUrl: "img/db-pullover.gif",
    original: true,
    attribution: { label: "", url: "" },
    notes: "Upper back across a bench, one dumbbell held in both hands over your chest. Lower it in an arc behind your head with soft elbows, then pull it back over your chest.",
    tags: ["Lats", "Chest"],
    type: "dumbbell",
    start: "20 lbs (one dumbbell)"
  },
  "seated-arnold-press": {
    name: "Seated Arnold Press",
    gifUrl: "img/seated-arnold-press.gif",
    original: true,
    attribution: { label: "", url: "" },
    notes: "Sit with your back supported, palms facing you at chest height. Rotate your palms to face forward as you press the dumbbells overhead, and reverse on the way down.",
    tags: ["Shoulders"],
    type: "dumbbell",
    start: "15 lbs per hand"
  },
  "half-kneeling-one-arm-db-press": {
    name: "Half-Kneeling One-Arm Dumbbell Press",
    gifUrl: "img/half-kneeling-one-arm-db-press.gif",
    original: true,
    attribution: { label: "", url: "" },
    notes: "Kneel on one knee with the other foot forward, ribs down and glutes tight on the kneeling side. Press the dumbbell overhead without leaning, then switch sides.",
    tags: ["Shoulders", "Core"],
    type: "dumbbell",
    start: "10 lbs"
  },
  "incline-bench-db-y-raise": {
    name: "Incline-Bench Dumbbell Y Raise",
    gifUrl: "img/incline-bench-db-y-raise.gif",
    original: true,
    attribution: { label: "", url: "" },
    notes: "Chest on an incline bench, thumbs up, raise light dumbbells forward and up in a Y shape, then lower slowly.",
    tags: ["Rear delts", "Lower traps"],
    type: "dumbbell",
    start: "5 lbs per hand"
  },
  "hip-flexor-stretch": {
    name: "Half-Kneeling Hip Flexor Stretch",
    gifUrl: "img/hip-flexor-stretch.gif",
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
    gifUrl: "img/side-plank.gif",
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

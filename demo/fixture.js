// The demo's sample history: a fictional lifter, four weeks of the A/B/C rotation, three sessions a week, 12 finished sessions.
// (docs/SHOWCASE-AND-SELF-HOST-SPEC.md, section 3, "Demo design".)
//
// The events are made by the app's real logging actions (app/js/logging) over a private, in-memory event store with a fixed clock,
// a fixed device id and a seeded random generator, so every event is valid and the same start date always gives the same events.
// Nothing here touches the page's storage: buildFixture() returns the events and demo-ui.js writes them into the demo's own storage.
//
// Session days are counted back from `today` (the Pacific day the demo is opened); the last session is the day before:
//
//   week 1     A -26     B -24     C -22          today (0) is the next workout in the rotation: A, with nothing logged
//   week 2     A -19     B -17     C -15
//   week 3     A -12     B -10     C  -8
//   week 4     A  -5     B  -3     C  -1
//
// How the engine makes the outcomes the demo shows (spec 5.12: a load rises only on schedule, 21 days after the exercise's last
// increase, or after its first session):
//   - Every weighted exercise is first logged in week 1, so each is due for an increase 21 days later: A at -5, B at -3, C at -1.
//     Each of those sessions logs the raised weight, so those points are marked as increases on the exercise history charts.
//   - Face pull is left unticked in the A session at -5 (History by date shows it as missing). Its timer therefore still runs from -26,
//     and the increase it missed is due in today's workout: its card shows the increase note.
//   - Slot 2 of workout B uses an alternative (machine high row) for the B session at -10, then goes back to the lat pulldown.

import { createClock } from '../app/js/ids.js';
import { createEventStore } from '../app/js/store/events.js';
import { createMemoryStorage } from '../app/js/store/memory.js';
import { createActions, createDraftStore, sessionView } from '../app/js/logging/index.js';
import { addDays } from '../app/js/time.js';

export const FIXTURE_DEVICE_ID = 'd_demo';
export const FIXTURE_SEED = 0x5eed2026;

const ROTATION = ['A', 'B', 'C'];
// Days back from today for the 12 sessions, in order (A, B, C, A, ...). The last one is the day before.
export const SESSION_OFFSETS = [-26, -24, -22, -19, -17, -15, -12, -10, -8, -5, -3, -1];
export const UNTICKED = { sessionIndex: 9, exerciseId: 'face-pull' }; // the A session at -5
export const ALTERNATIVE = { sessionIndex: 7, templateCode: 'B', slotNumber: 2, exerciseId: 'machine-high-row', defaultExerciseId: 'lat-pulldown' };
// A few session notes from the fictional lifter, by session index.
const NOTES = { 2: 'Felt a bit tired, kept the weights where they were.', 6: 'Good session. Squats moved well.', 11: 'Everything felt smooth.' };

// A small seeded generator (mulberry32): the same seed always gives the same numbers.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// ids.js's ulid() with the random part taken from the seeded generator.
function seededUlid(random) {
  return (nowMs) => {
    let time = '';
    for (let t = nowMs, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = CROCKFORD[t % 32] + time;
    let rand = '';
    for (let i = 0; i < 16; i++) rand += CROCKFORD[Math.floor(random() * 32)];
    return time + rand;
  };
}

// A Pacific day plus minutes after 17:00, as milliseconds. 17:00 to 18:59 stays on the same Pacific day in both PST and PDT,
// whichever offset the date really has (the -07:00 is only a starting point).
const atEvening = (date, minutes) => Date.parse(`${date}T17:00:00-07:00`) + minutes * 60_000;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Reps for each set of a card: around the recommended number, a little lower in later sets, always inside the range.
// null when the exercise has no rep range (holds, carries): the pre-filled values are right.
function repsFor(card, random) {
  const { repMin, repMax, targetReps } = card.suggestion;
  if (repMin === null || repMax === null || targetReps === null) return null;
  const top = clamp(targetReps + (random() < 0.4 ? 1 : 0), repMin, repMax);
  return card.rows.map((_, i) => clamp(top - (i === 0 ? 0 : Math.floor(random() * 2)), repMin, repMax));
}

// today: the Pacific day the demo opens, "yyyy-mm-dd". Resolves with the events, oldest first by replay order.
export async function buildFixture({ today, seed = FIXTURE_SEED } = {}) {
  const random = seededRandom(seed);
  const newId = seededUlid(random);
  const clock = { ms: atEvening(addDays(today, SESSION_OFFSETS[0]), 0) };
  const now = () => clock.ms;
  const events = await createEventStore({ storage: createMemoryStorage(), deviceId: FIXTURE_DEVICE_ID, clock: createClock(), now, newId });
  const backend = new Map();
  const drafts = createDraftStore({
    getItem: (k) => backend.get(k) ?? null, setItem: (k, v) => void backend.set(k, v), removeItem: (k) => void backend.delete(k),
  });
  const actions = createActions({ events, drafts, now, newId });
  const view = (sessionId) => sessionView(events.state, sessionId, actions.draft(sessionId), clock.ms);

  // The lifter's program starts with the first session, so the history opens in week 1 and today is in week 4.
  clock.ms -= 12 * 3600_000;
  await events.append('setting.changed', 'settings', { key: 'programStartDate', value: addDays(today, SESSION_OFFSETS[0]) });
  // The sessions fall on whatever weekdays the dates count back to, so no weekday is a recovery day: Home always opens on the workout.
  clock.ms += 1000;
  await events.append('setting.changed', 'settings', { key: 'recoveryDays', value: [] });

  for (const [index, offset] of SESSION_OFFSETS.entries()) {
    clock.ms = atEvening(addDays(today, offset), Math.floor(random() * 90));

    const useAlternative = index === ALTERNATIVE.sessionIndex;
    if (useAlternative) {
      await actions.swap(null, { slotNumber: ALTERNATIVE.slotNumber, exerciseId: ALTERNATIVE.exerciseId, templateCode: ALTERNATIVE.templateCode });
    }

    const sessionId = await actions.startSession();
    for (const { exerciseId, rows } of view(sessionId).cards) {
      if (index === UNTICKED.sessionIndex && exerciseId === UNTICKED.exerciseId) continue; // left unticked
      const reps = repsFor(view(sessionId).cards.find((c) => c.exerciseId === exerciseId), random);
      if (reps) reps.forEach((r, i) => actions.setValue(sessionId, exerciseId, rows[i].setNumber, 'reps', r));
      const card = view(sessionId).cards.find((c) => c.exerciseId === exerciseId);
      clock.ms += (150 + Math.floor(random() * 120)) * 1000;
      await actions.saveExercise(sessionId, { exerciseId, rows: card.rows, suggestion: card.suggestion });
    }
    clock.ms += 60_000;
    await actions.finish(sessionId, { notes: NOTES[index] });

    if (useAlternative) { // back to the lat pulldown for the next B
      clock.ms += 60_000;
      await actions.swap(null, { slotNumber: ALTERNATIVE.slotNumber, exerciseId: ALTERNATIVE.defaultExerciseId, templateCode: ALTERNATIVE.templateCode });
    }
  }
  return events.events();
}

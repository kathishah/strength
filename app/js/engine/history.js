// History: what an exercise's completed sessions were. Pure.
//
// A session is history when it has `finishedAt`; unfinished sessions never count. Its date is the Pacific date of
// `startedAt`. Only working sets count: not ramp-up sets (none are written since v1.13), not sets marked not completed,
// and not sets with nothing recorded (no reps, or no distance for a carry). Order is by instant, never by string.

import { parseInstant, pacificDate } from '../time.js';

const bySetNumber = (a, b) => a.setNumber - b.setNumber || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The finished sessions with a usable start time, each with its working sets grouped by exercise.
function index(state) {
  const sessions = new Map();
  for (const s of Object.values(state.sessions)) {
    const startedMs = parseInstant(s.startedAt);
    if (!s.finishedAt || Number.isNaN(startedMs)) continue;
    sessions.set(s.id, { session: s, startedMs, date: pacificDate(startedMs), byExercise: new Map() });
  }
  for (const set of Object.values(state.sets)) {
    const entry = sessions.get(set.sessionId);
    if (!entry || set.isRampUp === true || set.completed === false) continue;
    if (!entry.byExercise.has(set.exerciseId)) entry.byExercise.set(set.exerciseId, []);
    entry.byExercise.get(set.exerciseId).push(set);
  }
  return [...sessions.values()].sort((a, b) => a.startedMs - b.startedMs || (a.session.id < b.session.id ? -1 : 1));
}

// What one set achieved: reps, or the distance walked for a carry; null if nothing was recorded.
export const performance = (set, cfg) => (cfg.targetDistanceM !== null ? set.distanceM : set.reps) ?? null;

const max = (xs) => xs.reduce((a, b) => (b > a ? b : a), -Infinity);

// exerciseHistory: the exercise's completed sessions, oldest first:
//   { sessionId, startedMs, date, templateCode, sets, baseLoad, baseLevel, atBase }
//   sets:      working sets by set number
//   baseLoad:  heaviest weight used (spec 5.2); null for exercises with no weight
//   baseLevel: highest level used (suspension and the pushup ladder); null otherwise
//   atBase:    the sets at the base load / level
export function exerciseHistory(state, cfg) {
  const out = [];
  for (const entry of index(state)) {
    let sets = (entry.byExercise.get(cfg.exerciseId) ?? []).filter((set) => performance(set, cfg) !== null);
    if (cfg.progression === 'suspension') sets = sets.filter((s) => s.levelNumber != null);
    if (sets.length === 0) continue;
    sets.sort(bySetNumber);

    let baseLoad = null;
    let baseLevel = null;
    let atBase = sets;
    if (cfg.progression === 'load' || cfg.progression === 'loadable') {
      baseLoad = max(sets.map((s) => s.weightLbs ?? 0));
      atBase = sets.filter((s) => (s.weightLbs ?? 0) === baseLoad);
    } else if (cfg.progression === 'suspension' || cfg.progression === 'ladder') {
      baseLevel = max(sets.map((s) => s.levelNumber ?? cfg.startingLevel));
      atBase = sets.filter((s) => (s.levelNumber ?? cfg.startingLevel) === baseLevel);
    }
    out.push({
      sessionId: entry.session.id,
      startedMs: entry.startedMs,
      date: entry.date,
      templateCode: entry.session.templateCode ?? null,
      sets,
      baseLoad,
      baseLevel,
      atBase,
    });
  }
  return out;
}

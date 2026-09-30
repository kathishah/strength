// The words the screens show, as pure functions (no DOM), so they can be tested. Weights are pounds ("lbs", spec 6.7).

import { EXERCISES } from '../seed/catalog.js';
import { TIME_ZONE, dayNumber } from '../time.js';

export const exerciseName = (exerciseId) => EXERCISES[exerciseId]?.name ?? exerciseId;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "2026-09-28" -> "Mon, Sep 28"
export function formatDay(date) {
  const n = dayNumber(date);
  if (Number.isNaN(n)) return String(date);
  const [, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[(((n + 4) % 7) + 7) % 7]}, ${MONTHS[m - 1]} ${d}`;
}

const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
// 1789000000000 -> "12:30 PM" (Pacific)
export const formatTime = (ms) => clock.format(ms);

// 2820000 -> "47 min"; null for a missing or negative duration.
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.max(1, Math.round(ms / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

// 0 is an empty sled, an empty bar or bodyweight, depending on the exercise: say only that nothing is added.
export const weightText = (lbs) => (lbs === 0 ? 'no added weight' : `${lbs} lbs`);

// "8–12", "8 per side", "40 m", "20–40 s hold"
export function repsText({ repMin, repMax, perSide, holdSeconds, targetDistanceM }) {
  if (targetDistanceM) return `${targetDistanceM} m`;
  if (holdSeconds && typeof holdSeconds === 'object') return `${holdSeconds.min}–${holdSeconds.max} s hold`;
  if (typeof holdSeconds === 'number') return `${holdSeconds} s hold`;
  if (repMin === null || repMax === null) return null;
  const range = repMin === repMax ? String(repMin) : `${repMin}–${repMax}`;
  return perSide ? `${range} per side` : range;
}

// "3 × 8–12" (sets are null outside a slot)
export function setsRepsText(exercise) {
  const reps = repsText(exercise);
  if (exercise.sets === null || exercise.sets === undefined) return reps ?? '';
  return reps ? `${exercise.sets} × ${reps}` : `${exercise.sets} sets`;
}

export const SOURCE_LABELS = { starting: 'Starting weight', hold: 'Same as last time', scheduled: 'Scheduled increase' };
// A level exercise has a starting level, not a starting weight.
export const sourceLabel = (source, { level = false } = {}) => (source === 'starting' && level ? 'Starting level' : SOURCE_LABELS[source] ?? null);

// The line under the exercise name: what to put in the box.
export function suggestionText(s) {
  if (s.level !== null) return `Suggested: level ${s.level}`;
  if (s.weightLbs !== null) return `Suggested: ${weightText(s.weightLbs)}`;
  if (s.progression === 'load' || s.progression === 'loadable') return 'Enter a weight';
  return null;
}

// The increase highlight (spec 6.3): "↑ +5 lbs from 25 · Scheduled". Text as well as colour, always. null when not increased.
export function increaseText(s) {
  if (!s.increased) return null;
  const diff = Math.round((s.weightLbs - s.fromWeightLbs) * 100) / 100;
  return `↑ +${diff} lbs from ${s.fromWeightLbs} · ${s.source === 'scheduled' ? 'Scheduled' : 'Increase'}`;
}

// "35 × 12, 12, 11" for weights, "level 2 × 12, 12" for levels, "35 lbs × 40 m, 40 m" for carries, "8, 8" with neither.
// Consecutive sets at the same weight (or level) are joined; a different weight starts a new group after " · ".
// sets: [{ weightLbs, reps, levelNumber, distanceM }] in set order.
export function setsText(sets, { carry = false } = {}) {
  const groups = [];
  for (const set of sets) {
    let head = null;
    if (set.levelNumber !== null) head = `level ${set.levelNumber}`;
    else if (set.weightLbs !== null) head = `${set.weightLbs}${carry ? ' lbs' : ''}`;
    const done = carry ? `${set.distanceM} m` : String(set.reps);
    const prev = groups[groups.length - 1];
    if (prev && prev.head === head) prev.done.push(done);
    else groups.push({ head, done: [done] });
  }
  return groups.map((g) => (g.head === null ? g.done.join(', ') : `${g.head} × ${g.done.join(', ')}`)).join(' · ');
}

// "Last (Mon, Sep 28): 35 × 12, 12, 11"; null with no history.
export function lastText(s) {
  return s.last ? `Last (${formatDay(s.last.date)}): ${setsText(s.last.sets, { carry: s.type === 'carry' })}` : null;
}

// "Phase 1 · stop each set with about 3 reps left". targetRir is the engine's { min, max } reps in reserve.
export function phaseText(phase, targetRir) {
  const left = targetRir.min === targetRir.max ? `about ${targetRir.min}` : `${targetRir.min}–${targetRir.max}`;
  return `Phase ${phase} · stop each set with ${left} reps left`;
}

// The no-consecutive-days warning of Home (spec 4.1). w: { kind, templateCode }
export function warningText(w) {
  if (!w) return null;
  return w.kind === 'today'
    ? `You already finished Workout ${w.templateCode} today. Muscles need about 48 hours between resistance sessions, so a second workout today is not recommended.`
    : `You did Workout ${w.templateCode} yesterday. Muscles need about 48 hours between resistance sessions, so a workout today is not recommended. You can still start.`;
}

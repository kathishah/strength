// What the History screens draw (spec 6.6, plan section 15e), as plain data. Pure: replayed state and "today" in, view models out.
// A session counts when it is finished; only working sets count (not ramp-up, not `completed: false`).

import { exerciseForSlot, suggestExercise } from '../engine/index.js';
import { RULES, WORKOUTS } from '../seed/index.js';
import { addDays, daysBetween, parseInstant, weekdayOf } from '../time.js';
import { ROTATION, listSessions } from './rotation.js';
import { exerciseName, formatDay, formatDuration, setsText } from './text.js';

const isWorking = (set) => set.isRampUp !== true && set.completed !== false;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const max = (xs) => xs.reduce((a, b) => (b > a ? b : a), -Infinity);

// Every finished session's working sets, by exercise: Map(exerciseId -> [{ sessionId, startedMs, date, templateCode, sets }]), oldest first.
function sessionsByExercise(state) {
  const finished = new Map(listSessions(state).filter((s) => s.finished).map((s) => [s.id, s]));
  const bySession = new Map();
  for (const set of Object.values(state.sets)) {
    if (!finished.has(set.sessionId) || !isWorking(set)) continue;
    const key = `${set.sessionId}\u0000${set.exerciseId}`;
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(set);
  }
  const out = new Map();
  for (const [key, sets] of bySession) {
    const [sessionId, exerciseId] = key.split('\u0000');
    const s = finished.get(sessionId);
    sets.sort((a, b) => a.setNumber - b.setNumber || (a.id < b.id ? -1 : 1));
    if (!out.has(exerciseId)) out.set(exerciseId, []);
    out.get(exerciseId).push({ sessionId, startedMs: s.startedMs, date: s.date, templateCode: s.templateCode, sets });
  }
  for (const list of out.values()) list.sort((a, b) => a.startedMs - b.startedMs || (a.sessionId < b.sessionId ? -1 : 1));
  return out;
}

const plain = (sets) => sets.map((s) => ({ weightLbs: s.weightLbs ?? null, reps: s.reps ?? null, levelNumber: s.levelNumber ?? null, distanceM: s.distanceM ?? null }));

// How an exercise's sessions are measured, from what was logged: a level, a distance, reps (no weight), a weight, or just "done" (holds).
function kindOf(sessions) {
  const all = sessions.flatMap((x) => x.sets);
  if (all.some((s) => s.levelNumber != null)) return 'level';
  if (all.some((s) => s.distanceM != null)) return 'distance';
  if (!all.some((s) => s.reps != null)) return 'done';
  return all.some((s) => (s.weightLbs ?? 0) > 0) ? 'weight' : 'reps';
}

function measure(kind, sets) {
  const reps = (s) => s.reps ?? 0;
  switch (kind) {
    case 'level': return { top: max(sets.map((s) => s.levelNumber ?? 0)), volume: sum(sets.map(reps)) };
    case 'distance': return { top: max(sets.map((s) => s.distanceM ?? 0)), volume: sum(sets.map((s) => ((s.weightLbs ?? 0) > 0 ? s.weightLbs : 1) * (s.distanceM ?? 0))) };
    case 'reps': return { top: max(sets.map(reps)), volume: sum(sets.map(reps)) };
    case 'weight': return { top: max(sets.map((s) => s.weightLbs ?? 0)), volume: sum(sets.map((s) => ((s.weightLbs ?? 0) > 0 ? s.weightLbs : 1) * reps(s))) };
    default: return { top: sets.length, volume: sets.length };
  }
}

const linesOf = (kind, sets) => (kind === 'done' ? `${sets.length} ${sets.length === 1 ? 'set' : 'sets'} done` : setsText(plain(sets), { carry: kind === 'distance', unit: ' lbs' }));

// ---- By exercise ----

// [{ templateCode, label, rows: [{ exerciseId, name, lastText, lastDate, due }] }], workouts A, B, C. Each slot's current
// exercise (swaps applied), then any other exercise logged in a session of that workout.
export function historyByExercise(state, today) {
  const logged = sessionsByExercise(state);
  const row = (exerciseId, templateCode, slot) => {
    const sessions = logged.get(exerciseId) ?? [];
    const last = sessions[sessions.length - 1] ?? null;
    const kind = kindOf(sessions);
    return {
      exerciseId,
      name: exerciseName(exerciseId),
      lastText: last ? `${formatDay(last.date)} · ${linesOf(kind, last.sets)}` : 'Not logged yet',
      lastDate: last?.date ?? null,
      due: Object.hasOwn(RULES, exerciseId) ? suggestExercise(state, { exerciseId, templateCode, slot, today }).increased : false,
    };
  };
  return ROTATION.map((templateCode) => {
    const slots = WORKOUTS[templateCode].slots;
    const rows = [];
    const shown = new Set();
    for (const s of slots) {
      const { exerciseId } = exerciseForSlot(state, templateCode, s.slot);
      if (shown.has(exerciseId)) continue;
      shown.add(exerciseId);
      rows.push(row(exerciseId, templateCode, s.slot));
    }
    for (const [exerciseId, sessions] of logged) {
      if (shown.has(exerciseId) || !Object.hasOwn(RULES, exerciseId)) continue;
      if (sessions.some((x) => x.templateCode === templateCode)) { shown.add(exerciseId); rows.push(row(exerciseId, templateCode, null)); }
    }
    return { templateCode, label: WORKOUTS[templateCode].label, rows };
  });
}

// ---- Exercise detail ----

// null when the exercise is unknown. kind: 'weight' | 'level' | 'distance' | 'reps' | 'done' (no chart).
// points oldest first (the chart); rows newest first (the table). increase: the top is above the session before it (spec 5.12).
export function exerciseDetail(state, exerciseId, today) {
  if (!Object.hasOwn(RULES, exerciseId)) return null;
  const sessions = sessionsByExercise(state).get(exerciseId) ?? [];
  const kind = kindOf(sessions);
  const points = sessions.map((x, i) => {
    const { top, volume } = measure(kind, x.sets);
    return { sessionId: x.sessionId, date: x.date, templateCode: x.templateCode, top, volume, increase: false, text: linesOf(kind, x.sets), setCount: x.sets.length };
  });
  if (kind !== 'done') points.forEach((p, i) => { p.increase = i > 0 && p.top > points[i - 1].top; });
  const s = suggestExercise(state, { exerciseId, today });
  const lastIncrease = [...points].reverse().find((p) => p.increase)?.date ?? null;
  let scheduledText;
  if (s.scheduledIncrease === 'n/a') scheduledText = 'Not used';
  else if (s.scheduledIncrease === 'off') scheduledText = 'Off';
  else scheduledText = s.nextScheduledDate ? formatDay(s.nextScheduledDate) : 'After the first session';
  return {
    exerciseId,
    name: exerciseName(exerciseId),
    kind,
    topLabel: { weight: 'Top set (lbs)', level: 'Level', distance: 'Longest (m)', reps: 'Best set (reps)', done: 'Sets' }[kind],
    stats: { lastIncreaseText: lastIncrease ? formatDay(lastIncrease) : '—', scheduledText, due: s.increased },
    points,
    rows: [...points].reverse(),
  };
}

// ---- By date ----

const mondayOf = (date) => addDays(date, -((weekdayOf(date) + 6) % 7));

// "This week", "Last week", else the month ("September", with the year when it is not this year).
export function dateGroupLabel(date, today) {
  const weeks = Math.round(daysBetween(mondayOf(date), mondayOf(today)) / 7);
  if (weeks <= 0) return 'This week';
  if (weeks === 1) return 'Last week';
  const [y, m] = date.split('-').map(Number);
  return y === Number(today.slice(0, 4)) ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
}

// [{ label, rows: [{ sessionId, templateCode, dateText, exercisesDone, exerciseCount, missing, sets, durationText }] }], newest first.
export function historyByDate(state, today) {
  const counts = new Map();
  for (const set of Object.values(state.sets)) {
    if (!isWorking(set)) continue;
    if (!counts.has(set.sessionId)) counts.set(set.sessionId, { sets: 0, exercises: new Set() });
    const c = counts.get(set.sessionId);
    c.sets++;
    c.exercises.add(set.exerciseId);
  }
  const groups = [];
  for (const s of listSessions(state).filter((x) => x.finished).reverse()) {
    const c = counts.get(s.id) ?? { sets: 0, exercises: new Set() };
    const total = WORKOUTS[s.templateCode].slots.length;
    const label = dateGroupLabel(s.date, today);
    const row = {
      sessionId: s.id,
      templateCode: s.templateCode,
      dateText: formatDay(s.date),
      exercisesDone: c.exercises.size,
      exerciseCount: total,
      missing: Math.max(0, total - c.exercises.size),
      sets: c.sets,
      durationText: formatDuration(parseInstant(s.finishedAt) - s.startedMs),
    };
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else groups.push({ label, rows: [row] });
  }
  return groups;
}

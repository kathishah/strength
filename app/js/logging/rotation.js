// Which sessions exist and what comes next (spec 4.1, 6.2). Pure: state and "today" in, plain data out.
//
// A session is "finished" when it has finishedAt; "in progress" when it does not. Order is by the instant of
// startedAt (never as strings), ties by id. The day of a session is the Pacific date of startedAt.

import { pacificDate, parseInstant, addDays, weekdayOf } from '../time.js';

export const ROTATION = ['A', 'B', 'C'];
export const DEFAULT_RECOVERY_DAYS = [2, 4]; // Tuesday, Thursday (0 = Sunday)

const byStart = (a, b) => a.startedMs - b.startedMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Working sets logged in a session (not ramp-up, not marked not completed).
const isWorking = (set) => set.isRampUp !== true && set.completed !== false;

// Every session with a usable template and start time, oldest first:
//   { id, templateCode, startedAt, startedMs, date, finished, finishedAt, loggedSets }
export function listSessions(state) {
  const counts = new Map();
  for (const set of Object.values(state.sets)) {
    if (isWorking(set)) counts.set(set.sessionId, (counts.get(set.sessionId) ?? 0) + 1);
  }
  const out = [];
  for (const s of Object.values(state.sessions)) {
    const startedMs = parseInstant(s.startedAt);
    if (Number.isNaN(startedMs) || !ROTATION.includes(s.templateCode)) continue;
    out.push({
      id: s.id,
      templateCode: s.templateCode,
      startedAt: s.startedAt,
      startedMs,
      date: pacificDate(startedMs),
      finished: typeof s.finishedAt === 'string',
      finishedAt: s.finishedAt ?? null,
      loggedSets: counts.get(s.id) ?? 0,
    });
  }
  return out.sort(byStart);
}

export const finishedSessions = (state) => listSessions(state).filter((s) => s.finished);

// Unfinished sessions, newest first.
export const inProgressSessions = (state) => listSessions(state).filter((s) => !s.finished).reverse();

// Rotation is by the last completed workout, not by weekday (spec 4.1): A, B, C, A, ... and A when there is none.
export function nextTemplate(state) {
  const done = finishedSessions(state);
  if (done.length === 0) return 'A';
  const last = done[done.length - 1].templateCode;
  return ROTATION[(ROTATION.indexOf(last) + 1) % ROTATION.length];
}

// The non-blocking warning for starting a gym session (spec 4.1): a finished session yesterday (Pacific), or
// earlier today. null when there is none. { kind: 'yesterday' | 'today', templateCode, date }
export function consecutiveDayWarning(state, today) {
  const done = finishedSessions(state);
  const yesterday = addDays(today, -1);
  for (const [kind, date] of [['today', today], ['yesterday', yesterday]]) {
    const hit = [...done].reverse().find((s) => s.date === date);
    if (hit) return { kind, templateCode: hit.templateCode, date };
  }
  return null;
}

// Is `today` (Pacific yyyy-mm-dd) one of the recovery days? settings: replay(...).settings.
export function isRecoveryDay(settings, today) {
  const days = Array.isArray(settings?.recoveryDays) ? settings.recoveryDays : DEFAULT_RECOVERY_DAYS;
  return days.includes(weekdayOf(today));
}

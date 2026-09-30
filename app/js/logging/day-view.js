// What the Home page shows (spec 6.2, and the v0.2 viewer's layout, 0.B.1): the day pills of the header, and under them either the
// swipe carousel of the next workout's cards or, on a recovery day, the recovery routine's cards. Pure; every string is ready.
//
// There is no separate "start" step: the workout is the next one by rotation, or the one already open. The session is written when
// the first exercise is marked done (actions.saveExercise), so until then the cards are a preview with the day's suggestions.

import { EXERCISES, RECOVERY, RECOVERY_LABEL } from '../seed/index.js';
import { addDays, pacificDate, parseInstant, weekdayOf } from '../time.js';
import { emptyDraft } from './draft.js';
import { buildView } from './session-view.js';
import { consecutiveDayWarning, dayKind, inProgressSessions, listSessions, nextTemplate } from './rotation.js';
import { formatDay, formatTime, warningText } from './text.js';
import { WORKOUTS } from '../seed/index.js';

export const PENDING = 'pending'; // the draft's id before the session exists
export const FINISHED_DAYS = 7; // "Finished workouts" on Home: today and the six days before (spec 6.2)

const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first, as in the viewer
const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayName = (weekday) => NAMES[weekday];

// The seven pills of the header. kind: 'recovery' (indigo dot), 'gym' (green) or 'rest' (grey).
export function dayPills(settings, today) {
  const todayWeekday = weekdayOf(today);
  return WEEK.map((weekday) => ({ weekday, label: NAMES[weekday], kind: dayKind(settings, weekday), isToday: weekday === todayWeekday }));
}

// The recovery routine as cards (spec 4.6): guidance only.
export function recoveryCards() {
  return RECOVERY.map((item, i) => {
    const c = EXERCISES[item.exercise];
    return {
      exerciseId: item.exercise,
      name: c?.name ?? item.exercise,
      chipText: `Recovery · ${i + 1} of ${RECOVERY.length}`,
      prescription: item.prescription,
      notes: c?.notes ?? '',
      tags: c?.tags ?? [],
      gifUrl: c?.gifUrl || null,
      attribution: c?.attribution?.label ? c.attribution : null,
    };
  });
}

// What was known when a workout began: only the sessions that started before it. A reopened workout is planned from this, so its
// "Last: ..." line and its dials are what the person saw that day, not what the workout itself (or a later one) has since logged.
function stateBefore(state, startedMs) {
  const sessions = {};
  for (const [id, s] of Object.entries(state.sessions)) {
    const ms = parseInstant(s.startedAt);
    if (Number.isFinite(ms) && ms < startedMs) sessions[id] = s;
  }
  return { ...state, sessions };
}

// The view of a finished workout (spec 6.3): its own exercises and day, what was ticked, and dials at that day's suggestions.
const viewOfFinished = (state, s, draft, nowMs) => buildView(
  stateBefore(state, s.startedMs), { sessionId: s.id, session: state.sessions[s.id], templateCode: s.templateCode, date: s.date, startedMs: s.startedMs }, draft, nowMs,
);

// Home's "Finished workouts": finished in the last FINISHED_DAYS Pacific days, newest first.
export function finishedRecent(state, today, nowMs) {
  const from = addDays(today, -(FINISHED_DAYS - 1));
  return listSessions(state).filter((s) => s.finished && s.date >= from && s.date <= today).reverse().map((s) => {
    const v = viewOfFinished(state, s, emptyDraft(s.id), nowMs);
    return { sessionId: s.id, label: WORKOUTS[s.templateCode].label, dateText: formatDay(s.date), exercisesDone: v.exercisesDone, exerciseCount: v.exerciseCount };
  });
}

// A finished workout reopened (spec 6.3, v1.15). null when the id is unknown, not finished, or unusable. No swapping, no finish card,
// no rest timer: the cards are the open workout's, for that workout's day.
export function editView(state, { sessionId, nowMs, draftFor }) {
  const s = listSessions(state).find((x) => x.id === sessionId);
  if (!s || !s.finished) return null;
  const view = viewOfFinished(state, s, draftFor(sessionId), nowMs);
  for (const card of view.cards) {
    card.canSwap = false;
    card.swapOptions = [];
    card.optionGroups = { alternatives: [], trx: [] };
    card.swappedFromName = null;
    card.swapBlockedReason = null;
  }
  return {
    ...view,
    mode: 'edit',
    statusText: `Workout ${view.templateCode} · ${view.dateText} · editing`,
    pills: [],
    selectedWeekday: null,
    older: [],
    warning: null,
    warningText: null,
    finishedRecent: [],
    canTrainInstead: false,
    rest: null,
  };
}

// state: replay(events). today: Pacific yyyy-mm-dd. nowMs. draftFor(sessionId|PENDING): the draft of that workout.
// pickedWeekday: the pill chosen in the header (defaults to today); forceWorkout: "train instead" on a recovery day.
export function dayView(state, { today, nowMs, draftFor, pickedWeekday = null, forceWorkout = false }) {
  const weekday = pickedWeekday ?? weekdayOf(today);
  const kind = dayKind(state.settings, weekday);
  const open = inProgressSessions(state);
  const pills = dayPills(state.settings, today);

  // A workout that is open always shows, whatever pill is chosen: it must never be hidden while sets are logged in it.
  const recovery = kind === 'recovery' && !forceWorkout && open.length === 0;
  if (recovery) {
    return {
      mode: 'recovery',
      today,
      pills,
      selectedWeekday: weekday,
      statusText: `${NAMES[weekday]} · Recovery routine`,
      label: RECOVERY_LABEL,
      cards: recoveryCards(),
      older: [],
      finishedRecent: finishedRecent(state, today, nowMs),
      warning: null,
      warningText: null,
      canTrainInstead: true,
    };
  }

  let view;
  if (open.length > 0) {
    const s = open[0];
    view = buildView(state, { sessionId: s.id, session: state.sessions[s.id], templateCode: s.templateCode, date: s.date, startedMs: s.startedMs }, draftFor(s.id), nowMs);
  } else {
    view = buildView(state, { templateCode: nextTemplate(state), date: today }, draftFor(PENDING), nowMs);
  }
  const warning = view.started ? null : consecutiveDayWarning(state, today);
  return {
    ...view,
    mode: 'workout',
    today,
    pills,
    selectedWeekday: weekday,
    statusText: `${NAMES[weekday]} · Workout ${view.templateCode} · ${view.exercisesDone}/${view.exerciseCount} done`,
    older: open.slice(1).map((s) => ({
      sessionId: s.id, label: WORKOUTS[s.templateCode].label, dateText: formatDay(s.date), startedText: formatTime(s.startedMs), loggedSets: s.loggedSets,
    })),
    finishedRecent: finishedRecent(state, today, nowMs),
    warning,
    warningText: warningText(warning),
    canTrainInstead: false,
    todayText: formatDay(pacificDate(nowMs)),
  };
}

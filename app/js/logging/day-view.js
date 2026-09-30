// What the Home page shows (spec 6.2, and the v0.2 viewer's layout, 0.B.1): the day pills of the header, and under them either the
// swipe carousel of the next workout's cards or, on a recovery day, the recovery routine's cards. Pure; every string is ready.
//
// There is no separate "start" step: the workout is the next one by rotation, or the one already open. The session is written when
// the first exercise is marked done (actions.saveExercise), so until then the cards are a preview with the day's suggestions.

import { EXERCISES, RECOVERY, RECOVERY_LABEL } from '../seed/index.js';
import { pacificDate, weekdayOf } from '../time.js';
import { buildView } from './session-view.js';
import { consecutiveDayWarning, dayKind, inProgressSessions, nextTemplate } from './rotation.js';
import { formatDay, formatTime, warningText } from './text.js';
import { WORKOUTS } from '../seed/index.js';

export const PENDING = 'pending'; // the draft's id before the session exists

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
    warning,
    warningText: warningText(warning),
    canTrainInstead: false,
    todayText: formatDay(pacificDate(nowMs)),
  };
}

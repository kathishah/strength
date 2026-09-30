// What Home shows (spec 6.2). Pure. Every string is ready to display.

import { planSession } from '../engine/index.js';
import { WORKOUTS } from '../seed/index.js';
import { weekdayOf } from '../time.js';
import { consecutiveDayWarning, finishedSessions, inProgressSessions, isRecoveryDay, nextTemplate } from './rotation.js';
import { exerciseName, formatDay, formatTime, increaseText, phaseText, setsRepsText, suggestionText, warningText } from './text.js';

// state: replay(events). today: Pacific yyyy-mm-dd.
//   inProgress: unfinished sessions, newest first (Resume / Discard); while there is one, `next` is null
//   next:       the next workout by rotation with a preview, or null
//   recoveryFirst: today is a recovery day, so the recovery card leads (spec 6.2)
export function homeView(state, today) {
  const inProgress = inProgressSessions(state).map((s) => ({
    sessionId: s.id,
    templateCode: s.templateCode,
    label: WORKOUTS[s.templateCode].label,
    dateText: formatDay(s.date),
    startedText: formatTime(s.startedMs),
    loggedSets: s.loggedSets,
  }));

  let next = null;
  if (inProgress.length === 0) {
    const templateCode = nextTemplate(state);
    const plan = planSession(state, { today, templateCode });
    next = {
      templateCode,
      label: WORKOUTS[templateCode].label,
      programWeek: plan.calendar.programWeek,
      phase: plan.calendar.phase,
      phaseText: phaseText(plan.calendar.phase, plan.calendar.targetRir),
      beforeStart: plan.calendar.beforeStart,
      warning: consecutiveDayWarning(state, today),
      warningText: warningText(consecutiveDayWarning(state, today)),
      exercises: plan.exercises.map((e) => ({
        slot: e.slot,
        superset: e.superset,
        exerciseId: e.exerciseId,
        name: exerciseName(e.exerciseId),
        swapped: e.swapped,
        prescription: setsRepsText(e),
        suggestionText: suggestionText(e),
        increaseText: increaseText(e),
      })),
    };
  }

  const done = finishedSessions(state);
  const last = done.length ? done[done.length - 1] : null;
  return {
    today,
    dayText: formatDay(today),
    weekday: weekdayOf(today),
    recoveryFirst: isRecoveryDay(state.settings, today),
    inProgress,
    next,
    last: last && { sessionId: last.id, templateCode: last.templateCode, dateText: formatDay(last.date) },
  };
}

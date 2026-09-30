// The summary of a finished workout (spec 6.3): working sets, duration, and the "weight increase next time" callouts. Pure.

import { suggestExercise } from '../engine/index.js';
import { RULES, WORKOUTS } from '../seed/index.js';
import { addDays, pacificDate, parseInstant } from '../time.js';
import { exerciseName, formatDay, formatDuration, setsText } from './text.js';

// The next workout of a kind comes about a week later (three gym days a week, rotating A, B, C). The spec does not say
// when "next time" is, so the callouts look this far ahead (plan section 15, question 8).
export const NEXT_TIME_DAYS = 7;

const isWorking = (set) => set.isRampUp !== true && set.completed !== false;

// The template slot an exercise sits in (as the slot's exercise or one of its alternatives), or null.
function slotOf(templateCode, exerciseId) {
  const slot = WORKOUTS[templateCode].slots.find(
    (s) => s.exercise === exerciseId || s.alternatives.includes(exerciseId) || s.trxAlternatives.includes(exerciseId),
  );
  return slot ? slot.slot : null;
}

// state: replay(events). Returns null if the session is unknown or not finished yet.
export function summaryView(state, sessionId) {
  const session = state.sessions[sessionId];
  const startedMs = parseInstant(session?.startedAt);
  const finishedMs = parseInstant(session?.finishedAt);
  if (!session || Number.isNaN(startedMs) || Number.isNaN(finishedMs) || !Object.hasOwn(WORKOUTS, session.templateCode)) return null;
  const date = pacificDate(startedMs);

  const order = new Map();
  const sets = Object.values(state.sets).filter((s) => s.sessionId === sessionId && isWorking(s));
  for (const set of sets) {
    if (!order.has(set.exerciseId)) order.set(set.exerciseId, []);
    order.get(set.exerciseId).push(set);
  }
  // In workout order: slot number, then anything logged outside the plan.
  const ids = [...order.keys()].sort((a, b) => (slotOf(session.templateCode, a) ?? 99) - (slotOf(session.templateCode, b) ?? 99));

  const callouts = [];
  for (const exerciseId of ids) {
    const next = suggestExercise(state, {
      exerciseId, templateCode: session.templateCode, slot: slotOf(session.templateCode, exerciseId), today: addDays(date, NEXT_TIME_DAYS),
    });
    if (next.increased) {
      const diff = Math.round((next.weightLbs - next.fromWeightLbs) * 100) / 100;
      callouts.push({
        exerciseId,
        name: exerciseName(exerciseId),
        fromWeightLbs: next.fromWeightLbs,
        weightLbs: next.weightLbs,
        text: `${exerciseName(exerciseId)}: ${next.weightLbs} lbs next time (+${diff}), scheduled`,
      });
    }
  }

  return {
    sessionId,
    templateCode: session.templateCode,
    label: WORKOUTS[session.templateCode].label,
    dateText: formatDay(date),
    totalSets: sets.length,
    durationMs: finishedMs >= startedMs ? finishedMs - startedMs : null,
    durationText: formatDuration(finishedMs - startedMs),
    backPainBefore: session.backPainBefore ?? null,
    backPainAfter: session.backPainAfter ?? null,
    notes: session.notes ?? '',
    exercises: ids.map((exerciseId) => ({
      exerciseId,
      name: exerciseName(exerciseId),
      count: order.get(exerciseId).length,
      text: setsText(
        order.get(exerciseId).sort((a, b) => a.setNumber - b.setNumber).map((s) => ({
          weightLbs: s.weightLbs ?? null, reps: s.reps ?? null, levelNumber: s.levelNumber ?? null, distanceM: s.distanceM ?? null,
        })),
        { carry: RULES[exerciseId]?.type === 'carry' },
      ),
    })),
    callouts,
  };
}

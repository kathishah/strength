// Everything the session screen draws, as plain data (plan section 15). Pure: replayed state, the person's draft and the
// time in; a view model out. The suggestions come from the engine, planned for the Pacific day the session started, so a
// workout that runs past midnight keeps the suggestions it began with.

import { planSession, suggestExercise } from '../engine/index.js';
import { EXERCISES, PUSHUP_LADDER, RULES, WORKOUTS } from '../seed/index.js';
import { pacificDate, parseInstant } from '../time.js';
import { targetRir } from '../engine/calendar.js';
import { buildRows, inputsFor } from './rows.js';
import { restStatus } from './rest-timer.js';
import {
  exerciseName, formatDay, formatTime, increaseText, lastText, phaseText, repsText, setsRepsText, setsText, sourceLabel, suggestionText,
} from './text.js';

// The line under the cue on every exercise card (spec 6.3).
const REST_TEXT = 'Rest about 90 s between sets.';

const isWorking = (set) => set.isRampUp !== true && set.completed !== false;

// The slot's exercise choices (spec 4.5, 4.5.1): the default, its alternatives, then the TRX alternatives.
export function swapOptions(templateCode, slotNumber, currentId) {
  const slot = WORKOUTS[templateCode].slots.find((s) => s.slot === slotNumber);
  const list = [
    { exerciseId: slot.exercise, kind: 'default' },
    ...slot.alternatives.map((exerciseId) => ({ exerciseId, kind: 'alternative' })),
    ...slot.trxAlternatives.map((exerciseId) => ({ exerciseId, kind: 'trx' })),
  ];
  return list
    .filter((o) => Object.hasOwn(RULES, o.exerciseId))
    .map((o) => ({ ...o, name: exerciseName(o.exerciseId), current: o.exerciseId === currentId }));
}

function cuesFor(exerciseId) {
  const c = EXERCISES[exerciseId];
  return {
    notes: c?.notes ?? '',
    tags: c?.tags ?? [],
    gifUrl: c?.gifUrl || null,
    attribution: c?.attribution?.label ? c.attribution : null,
    startNote: c?.start ?? null,
    rationale: c?.rationale ?? null,
    levelText: c?.trx?.levels ?? null,
    ladder: c?.ladder ?? null,
  };
}

// "Standard pushup (start here)", or the TRX level text, for the level a row is on.
function levelInfo(suggestion, levelNumber) {
  const c = EXERCISES[suggestion.exerciseId];
  if (suggestion.progression === 'ladder') {
    const step = c?.ladder?.find((l) => l.level === levelNumber);
    return step ? `${step.variation}${step.cue ? `. ${step.cue}` : ''}` : null;
  }
  return c?.trx?.levels ?? null;
}

function buildCard({ state, sessionId, draft, e, slot, defaultExerciseId, swapped, templateCode, logged, planned }) {
  const inputs = inputsFor(e);
  const reopened = draft.editing?.[e.exerciseId] === true && logged.length > 0;
  const rows = buildRows({
    suggestion: e, logged, draftRows: draft.rows[e.exerciseId] ?? {}, planned, extra: draft.extra[e.exerciseId] ?? 0, editing: reopened,
    targetRepsFor: (level) => (e.progression === 'ladder' && level !== null ? PUSHUP_LADDER[level].repMin : e.targetReps ?? null),
  }).map((row) => {
    // The pushup range follows the level chosen for the row (spec 5.4 table); everything else has one range.
    const range = e.progression === 'ladder' && row.levelNumber !== null ? PUSHUP_LADDER[row.levelNumber] : e;
    return {
      ...row,
      targetText: repsText({ ...e, repMin: range.repMin, repMax: range.repMax }),
      placeholderReps: e.progression === 'ladder' && row.levelNumber !== null ? PUSHUP_LADDER[row.levelNumber].repMin : e.targetReps,
      placeholderDistance: e.targetDistanceM,
      levelInfo: inputs.level ? levelInfo(e, row.levelNumber) : null,
    };
  });
  const loggedCount = logged.length;
  const distinct = (field) => new Set(rows.map((r) => r[field]).filter((v) => v !== null)).size > 1;
  const options = slot === null ? [] : swapOptions(templateCode, slot, e.exerciseId);
  const swapBlocked = options.length > 1 && loggedCount > 0;
  return {
    key: e.exerciseId,
    exerciseId: e.exerciseId,
    name: exerciseName(e.exerciseId),
    slot,
    swapped: Boolean(swapped),
    defaultExerciseId,
    type: e.type,
    progression: e.progression,
    inputs,
    suggestion: e,
    prescription: setsRepsText(e),
    suggestionText: suggestionText(e),
    sourceLabel: sourceLabel(e.source, { level: e.level !== null }),
    lastText: lastText(e),
    increaseText: increaseText(e),
    increased: e.increased,
    hints: e.hints.map((h) => h.text),
    incrementLbs: e.incrementLbs,
    weightStep: e.incrementLbs ?? 5,
    cues: cuesFor(e.exerciseId),
    rows,
    loggedCount,
    plannedSets: planned,
    swapOptions: options,
    canSwap: options.length > 1 && !swapBlocked,
    swapBlockedReason: swapBlocked ? 'Undo the sets you logged for this exercise to swap it.' : null,
    // The two lists of the v0.2 viewer (spec 0.B.4): Options (back-friendly swaps) and TRX. The default is reached by Revert.
    optionGroups: {
      alternatives: options.filter((o) => o.kind === 'alternative'),
      trx: options.filter((o) => o.kind === 'trx'),
    },
    swappedFromName: swapped ? exerciseName(defaultExerciseId) : null,
    // The position label, filled in by labelCards once every card is known (spec 6.3).
    chipText: '',
    restText: REST_TEXT,
    // 'input': nothing logged yet; 'done': logged, shown as one summary line; 'editing': a logged exercise reopened.
    mode: loggedCount === 0 ? 'input' : reopened ? 'editing' : 'done',
    done: loggedCount > 0,
    // The weight (or level) differs between sets, so one shared box cannot show it: the card lists a box per set.
    setsDiffer: (inputs.weight && distinct('weightLbs')) || (inputs.level && distinct('levelNumber')),
    summaryText: logged.length
      ? setsText([...logged].sort((a, b) => a.setNumber - b.setNumber).map((s) => ({
        weightLbs: s.weightLbs ?? null, reps: s.reps ?? null, levelNumber: s.levelNumber ?? null, distanceM: s.distanceM ?? null,
      })), { carry: e.type === 'carry', unit: ' lbs' })
      : '',
  };
}

// "Exercise 2 of 6" on each plan card (spec 6.3, v1.19: one exercise at a time, no supersets); an exercise logged outside the plan is "Extra".
function labelCards(cards) {
  cards.forEach((card, i) => { card.chipText = `Exercise ${i + 1} of ${cards.length}`; });
}

// The view of one workout. `session` is the replayed record, or null for a workout that has not been started yet (Home shows
// the next workout's cards before anything is logged; the session is written when the first exercise is marked done).
export function buildView(state, { sessionId = null, session = null, templateCode, date, startedMs = null }, draft, nowMs) {
  const plan = planSession(state, { today: date, templateCode });

  const byExercise = new Map();
  if (sessionId !== null) {
    for (const set of Object.values(state.sets)) {
      if (set.sessionId !== sessionId || !isWorking(set)) continue;
      if (!byExercise.has(set.exerciseId)) byExercise.set(set.exerciseId, []);
      byExercise.get(set.exerciseId).push(set);
    }
  }

  const common = { state, sessionId, draft, templateCode };
  const cards = plan.exercises.map((e) => buildCard({
    ...common, e, slot: e.slot, defaultExerciseId: e.defaultExerciseId, swapped: e.swapped,
    logged: byExercise.get(e.exerciseId) ?? [], planned: e.sets,
  }));

  labelCards(cards);

  // Sets logged for an exercise that is not in the plan now (a swap made on another device, say) stay visible and editable.
  const inPlan = new Set(cards.map((c) => c.exerciseId));
  const orphans = [];
  for (const [exerciseId, logged] of byExercise) {
    if (inPlan.has(exerciseId) || !Object.hasOwn(RULES, exerciseId)) continue;
    const e = suggestExercise(state, { exerciseId, today: date });
    const card = buildCard({
      ...common, e, slot: null, defaultExerciseId: exerciseId, swapped: false, logged, planned: 0,
    });
    card.chipText = 'Extra exercise';
    orphans.push(card);
  }

  const loggedSets = [...byExercise.values()].reduce((n, list) => n + list.length, 0);
  const phase = session?.phase ?? plan.calendar.phase;
  return {
    sessionId,
    started: sessionId !== null,
    finished: typeof session?.finishedAt === 'string',
    templateCode,
    label: WORKOUTS[templateCode].label,
    date,
    dateText: formatDay(date),
    startedText: startedMs === null ? null : formatTime(startedMs),
    programWeek: session?.programWeek ?? plan.calendar.programWeek,
    phase,
    phaseText: phaseText(phase, targetRir(phase)),
    cards: [...cards, ...orphans],
    orphans,
    exerciseCount: cards.length,
    exercisesDone: cards.filter((c) => c.done).length,
    plannedSets: cards.reduce((n, c) => n + c.plannedSets, 0),
    loggedSets,
    canFinish: loggedSets > 0,
    notes: draft.notes ?? session?.notes ?? '',
    savedNotes: session?.notes ?? '',
    rest: restStatus(draft, nowMs, state.settings),
  };
}

// state: replay(events). draft: the session's draft (draft.js). nowMs: the current time.
// Returns null when the session is unknown. `finished` tells the screen to show the summary instead.
export function sessionView(state, sessionId, draft, nowMs) {
  const session = state.sessions[sessionId];
  const startedMs = parseInstant(session?.startedAt);
  if (!session || Number.isNaN(startedMs) || !Object.hasOwn(WORKOUTS, session.templateCode)) return null;
  return buildView(state, { sessionId, session, templateCode: session.templateCode, date: pacificDate(startedMs), startedMs }, draft, nowMs);
}

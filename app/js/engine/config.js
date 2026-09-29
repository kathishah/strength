// The effective rules for one exercise in one slot: the seed (rules.js) with the user's settings applied and,
// for an alternative that has no rep range of its own, the range of the slot it is swapped into. Pure.

import { PROGRAM, RULES, SLOT_SETS } from '../seed/rules.js';
import { WORKOUTS } from '../seed/program.js';

// Exercise ids in a slot: the default first, then its alternatives.
const slotOf = (templateCode, slot) => WORKOUTS[templateCode]?.slots.find((s) => s.slot === slot) ?? null;

export const slotDefaultId = (templateCode, slot) => slotOf(templateCode, slot)?.exercise ?? null;

// Where an exercise viewed outside a session (its history page) borrows its rep range from: the first slot that
// lists it as the exercise or as an alternative.
export function firstSlotFor(exerciseId) {
  for (const [templateCode, w] of Object.entries(WORKOUTS)) {
    for (const s of w.slots) {
      if (s.exercise === exerciseId || s.alternatives.includes(exerciseId) || s.trxAlternatives.includes(exerciseId)) {
        return { templateCode, slot: s.slot };
      }
    }
  }
  return null;
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

// Working sets in the current phase for a slot; Phase 1 has 2 sets everywhere (spec 5.1), a deload halves the count
// and rounds up (spec 5.8).
export function setsFor(templateCode, slot, phase, isDeload) {
  const full = SLOT_SETS[templateCode]?.[slot - 1];
  if (!full) return null;
  const normal = phase === 1 ? Math.min(PROGRAM.phase1Sets, full) : full;
  return isDeload ? Math.ceil(normal / 2) : normal;
}

// settings: replay(...).settings. templateCode/slot may be omitted (a history page); the exercise then borrows from
// the first slot it belongs to.
export function resolveExercise(exerciseId, { settings = {}, templateCode = null, slot = null } = {}) {
  const rules = Object.hasOwn(RULES, exerciseId) ? RULES[exerciseId] : null;
  if (!rules) throw new RangeError(`no progression rules for exercise "${exerciseId}"`);

  const where = templateCode && slot ? { templateCode, slot } : firstSlotFor(exerciseId);
  const defaultId = where ? slotDefaultId(where.templateCode, where.slot) : null;
  const slotRules = defaultId && Object.hasOwn(RULES, defaultId) ? RULES[defaultId] : null;

  // An alternative with no range of its own takes the slot's range (unloaded holds and TRX levels keep theirs).
  const inherits = rules.repMin === null && rules.targetDistanceM === null && ['load', 'none'].includes(rules.progression);
  const repMin = inherits ? slotRules?.repMin ?? null : rules.repMin;
  const repMax = inherits ? slotRules?.repMax ?? null : rules.repMax;
  const perSide = rules.perSide ?? (inherits ? slotRules?.perSide ?? false : false);
  const inheritsDistance = rules.progression === 'load' && rules.type === 'carry' && rules.targetDistanceM === null;
  const targetDistanceM = inheritsDistance ? slotRules?.targetDistanceM ?? null : rules.targetDistanceM;

  const setting = (name) => settings[`${name}:${exerciseId}`];
  const inc = num(setting('loadIncrement'));
  const first = num(setting('firstLoadedWeight'));
  const start = num(setting('startingWeight'));
  const trapBar = num(settings.trapBarWeightLbs) ?? PROGRAM.defaultTrapBarWeightLbs;
  // The trap bar starts at the bar's own weight (spec 5.6); a per-exercise starting weight overrides it.
  const seededStart = exerciseId === 'trap-bar-deadlift' ? trapBar : rules.startingWeightLbs;

  return {
    exerciseId,
    type: rules.type,
    progression: rules.progression,
    templateCode: where?.templateCode ?? null,
    slot: where?.slot ?? null,
    repMin,
    repMax,
    perSide,
    holdSeconds: rules.holdSeconds,
    targetDistanceM,
    incrementLbs: inc !== null && inc > 0 ? inc : rules.loadIncrementLbs,
    firstLoadedWeightLbs: first !== null ? (first > 0 ? first : null) : rules.firstLoadedWeightLbs,
    startingWeightLbs: start !== null && start >= 0 ? start : seededStart,
    startingLevel: rules.startingLevel,
    loadsBack: rules.loadsBack,
    scheduledOn: settings.scheduledIncreasesEnabled !== false && setting('scheduledIncrease') !== false,
    scheduledDays: num(settings.scheduledIncreaseDays) ?? PROGRAM.defaultScheduledIncreaseDays,
  };
}

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

// Working sets for a slot (spec 4.3). Since v1.14 every week has the full count; the phases differ only in target effort.
export function setsFor(templateCode, slot) {
  return SLOT_SETS[templateCode]?.[slot - 1] ?? null;
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
  const inherits = rules.repMin === null && rules.targetDistanceM === null && ['load', 'loadable', 'none'].includes(rules.progression);
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
  const firstLoaded = first !== null ? (first > 0 ? first : null) : rules.firstLoadedWeightLbs;
  // v1.14: an exercise whose seeded start is 0 and that has a first-loaded weight (leg press, hip thrust, reverse lunge)
  // pre-fills that weight when there is no history. A startingWeight setting, and anything already logged, still win.
  const seededPrefill = seededStart === 0 && firstLoaded !== null ? firstLoaded : seededStart;

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
    firstLoadedWeightLbs: firstLoaded,
    startingWeightLbs: start !== null && start >= 0 ? start : seededPrefill,
    startingLevel: rules.startingLevel,
    scheduledOn: settings.scheduledIncreasesEnabled !== false && setting('scheduledIncrease') !== false,
    scheduledDays: num(settings.scheduledIncreaseDays) ?? PROGRAM.defaultScheduledIncreaseDays,
  };
}

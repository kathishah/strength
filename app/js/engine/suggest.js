// The suggestion for one exercise (plan section 14; spec 5.2, 5.3, 5.6, 5.12 as cut in v1.13). Pure.
//
// Weighted exercises: the suggestion is last session's base load (its heaviest weight), or that plus one increment when
// a scheduled increase is due. Nothing else changes a load: not rep performance, not back pain, not the week.
// Bodyweight-based exercises (dead bug, back extension, TRX, pushup ladder) have no progression: the box is pre-filled
// with the last value used, or the starting value. What was logged decides everything, not what was suggested.

import { PUSHUP_LADDER } from '../seed/rules.js';
import { addDays, daysBetween } from '../time.js';
import { calendarFor } from './calendar.js';
import { resolveExercise, setsFor } from './config.js';
import { exerciseHistory, performance } from './history.js';
import { increaseLoad } from './load.js';

const HINTS = {
  'enter-weight': 'No starting weight for this exercise. Enter a weight you could lift for the top of the rep range with about 3 reps to spare.',
  'trx-pair': 'Both use the TRX; if the station is shared, alternate with the dumbbell version.',
};
export const hint = (code) => ({ code, text: HINTS[code] });

const lastOf = (xs) => xs[xs.length - 1];

// The date of the exercise's last increase: the latest session whose base is above the one before it (spec 5.12).
function lastIncrease(hist, key) {
  let date = null;
  for (let i = 1; i < hist.length; i++) if (hist[i][key] > hist[i - 1][key]) date = hist[i].date;
  return date;
}

// Next target reps when the load stays: one more than the weakest set at the base, kept inside the range.
function holdTarget(session, cfg) {
  if (cfg.repMin === null || cfg.repMax === null) return cfg.repMin;
  const weakest = Math.min(...session.atBase.map((s) => performance(s, cfg)));
  return Math.min(cfg.repMax, Math.max(cfg.repMin, weakest + 1));
}

const none = () => ({ hints: [], lastIncreaseDate: null, nextScheduledDate: null, scheduledIncrease: 'n/a' });

// ---- weighted exercises: dumbbell, barbell, machine, cable, carry ----

function suggestLoad({ cfg, hist, today }) {
  const hints = [];
  const lastIncreaseDate = lastIncrease(hist, 'baseLoad');
  const out = { hints, lastIncreaseDate, scheduledIncrease: cfg.scheduledOn ? 'on' : 'off', nextScheduledDate: null };

  if (hist.length === 0) {
    if (cfg.startingWeightLbs === null) {
      hints.push(hint('enter-weight'));
      return { ...out, weightLbs: null, source: null, targetReps: cfg.repMin };
    }
    return { ...out, weightLbs: cfg.startingWeightLbs, source: 'starting', targetReps: cfg.repMin };
  }

  const last = lastOf(hist);
  const base = last.baseLoad;
  // The timer (spec 5.12): the last increase, else the day of the first completed session.
  const timer = cfg.scheduledOn ? lastIncreaseDate ?? hist[0].date : null;
  out.nextScheduledDate = timer === null ? null : addDays(timer, cfg.scheduledDays);
  const due = timer !== null && daysBetween(timer, today) >= cfg.scheduledDays;
  if (due) return { ...out, fromWeightLbs: base, weightLbs: increaseLoad(base, cfg), source: 'scheduled', targetReps: cfg.repMin };
  return { ...out, fromWeightLbs: base, weightLbs: base, source: 'hold', targetReps: holdTarget(last, cfg) };
}

// ---- no progression: repeat the last value used (spec 5.4) ----

function suggestRepeat({ cfg, hist }) {
  const last = hist.length ? lastOf(hist) : null;
  const source = last ? 'hold' : 'starting';
  switch (cfg.progression) {
    case 'loadable':
      return { ...none(), weightLbs: last?.baseLoad ?? cfg.startingWeightLbs, fromWeightLbs: last?.baseLoad ?? null, source, targetReps: cfg.repMin };
    case 'suspension':
      return { ...none(), level: last?.baseLevel ?? cfg.startingLevel, fromLevel: last?.baseLevel ?? null, source, targetReps: cfg.repMin };
    case 'ladder': {
      const level = last?.baseLevel ?? cfg.startingLevel;
      const { repMin, repMax } = PUSHUP_LADDER[level];
      return { ...none(), level, fromLevel: last?.baseLevel ?? null, source, repMin, repMax, targetReps: repMin };
    }
    case 'bodyweight': // dead bug: no weight to show
      return { ...none(), source: null, targetReps: cfg.repMin };
    case 'none':
      return { ...none(), source: null, targetReps: cfg.repMin };
    default: // holds are completion only
      return { ...none(), source: null, targetReps: null };
  }
}

// Suggestion for one exercise in a slot, for a Pacific day `today`. See DEPLOYMENT-PLAN.md section 14 for the shape.
export function suggestExercise(state, { exerciseId, templateCode = null, slot = null, today }) {
  const cal = calendarFor({ settings: state.settings, today });
  const cfg = resolveExercise(exerciseId, { settings: state.settings, templateCode, slot });
  const hist = exerciseHistory(state, cfg);
  const r = (cfg.progression === 'load' ? suggestLoad : suggestRepeat)({ cfg, hist, today });

  const last = hist.length ? lastOf(hist) : null;
  const weightLbs = r.weightLbs ?? null;
  const level = r.level ?? null;
  const fromWeightLbs = r.fromWeightLbs ?? null;
  const fromLevel = r.fromLevel ?? null;
  return {
    exerciseId,
    type: cfg.type,
    progression: cfg.progression,
    sets: slot ? setsFor(templateCode, slot, cal.phase) : null,
    repMin: r.repMin ?? cfg.repMin,
    repMax: r.repMax ?? cfg.repMax,
    perSide: cfg.perSide,
    holdSeconds: cfg.holdSeconds,
    targetDistanceM: cfg.targetDistanceM,
    weightLbs,
    level,
    targetReps: r.targetReps ?? null,
    source: r.source ?? null,
    fromWeightLbs,
    fromLevel,
    increased: weightLbs !== null && fromWeightLbs !== null && weightLbs > fromWeightLbs,
    incrementLbs: cfg.incrementLbs,
    firstLoadedWeightLbs: cfg.firstLoadedWeightLbs,
    hints: r.hints,
    lastIncreaseDate: r.lastIncreaseDate,
    nextScheduledDate: r.nextScheduledDate,
    scheduledIncrease: r.scheduledIncrease,
    last: last && {
      date: last.date,
      sets: last.sets.map((s) => ({ weightLbs: s.weightLbs ?? null, reps: s.reps ?? null, levelNumber: s.levelNumber ?? null, distanceM: s.distanceM ?? null })),
    },
  };
}

// The suggestion for one exercise (spec 5.2 to 5.4, 5.6, 5.8, 5.9 and the 5.12 precedence). Pure.
//
// Precedence, highest first (spec 5.12):
//   1. deload week: the base load unchanged, no increase and no reduction
//   2. reduction (5.2 rule 2): wins over any increase
//   3. back pain gate (5.9): an increase due today is held at the base load
//   4. earned increase (5.2 rule 1), or else scheduled increase (5.12), never both
//   5. hold (5.2 rule 3)
// History decides everything: what was logged (heaviest weight, reps reached), not what was suggested.

import { PROGRAM, PUSHUP_LADDER } from '../seed/rules.js';
import { addDays, daysBetween } from '../time.js';
import { calendarFor } from './calendar.js';
import { resolveExercise, setsFor } from './config.js';
import { exerciseHistory, performance } from './history.js';
import { increaseLoad, reduceLoad } from './load.js';
import { expectedPace } from './pace.js';
import { rampUpSets } from './rampup.js';
import { stallInfo } from './stall.js';

const HINTS = {
  'enter-weight': 'No starting weight for this exercise. Enter a weight you could lift for the top of the rep range with about 3 reps to spare.',
  'back-pain-gate': 'Back pain before is above 3, so the load stays at the base weight today. A back-friendly swap is available.',
  'harder-variation': 'Every set reached the top of the range. Consider a harder variation or a slower tempo.',
  'slower-lowering': 'At the top level and the top of the range: add slower lowering (3 s) or switch back to the loaded gym exercise.',
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

// Next target reps when the load stays: one more than the weakest set at the base, kept inside the range (spec 5.2 rule 3).
function holdTarget(session, cfg, perf) {
  if (cfg.repMin === null || session === undefined) return cfg.repMin;
  const weakest = Math.min(...session.atBase.map(perf));
  return Math.min(cfg.repMax, Math.max(cfg.repMin, weakest + 1));
}

// ---- weighted exercises: dumbbell, barbell, machine, cable, loadable, carry ----

function suggestLoad(ctx) {
  const { cfg, cal, hist, today } = ctx;
  const n = hist.length;
  const perf = (s) => performance(s, cfg);
  const top = cfg.targetDistanceM ?? cfg.repMax;
  const bottom = cfg.targetDistanceM ?? cfg.repMin;
  const hasRange = top !== null && bottom !== null;
  const hints = [];
  const gate = cfg.loadsBack && ctx.backPainBefore !== null && ctx.backPainBefore > PROGRAM.backPainGate;
  if (gate) hints.push(hint('back-pain-gate'));

  const calibrating = !cal.isDeload && n < PROGRAM.calibrationSessions;
  const out = {
    hints,
    isCalibration: calibrating,
    calibrationSession: calibrating ? n + 1 : null,
    lastIncreaseDate: lastIncrease(hist, 'baseLoad'),
    scheduledIncrease: cfg.scheduledOn ? 'on' : 'off',
    nextScheduledDate: null,
  };

  if (n === 0) {
    if (cfg.startingWeightLbs === null) {
      hints.push(hint('enter-weight'));
      return { ...out, weightLbs: null, source: null, targetReps: cfg.repMin };
    }
    return { ...out, weightLbs: cfg.startingWeightLbs, source: cal.isDeload ? 'deload' : 'starting', targetReps: cfg.repMin };
  }

  const last = lastOf(hist);
  const base = last.baseLoad;
  const from = { fromWeightLbs: base };

  // The scheduled timer (spec 5.12): the last increase, else the day the second calibration session was done.
  const scheduleApplies = cfg.scheduledOn && n >= PROGRAM.calibrationSessions;
  const timer = scheduleApplies ? out.lastIncreaseDate ?? hist[PROGRAM.calibrationSessions - 1].date : null;
  const dueDate = timer === null ? null : addDays(timer, cfg.scheduledDays);
  out.nextScheduledDate = dueDate;

  if (cal.isDeload) return { ...out, ...from, weightLbs: base, source: 'deload', targetReps: holdTarget(last, cfg, perf) };

  const weak = (session) => hasRange && session.atBase.some((s) => perf(s) < bottom);
  if (n >= 2 && weak(last) && weak(hist[n - 2])) {
    return { ...out, ...from, weightLbs: reduceLoad(base, cfg), source: 'reduction', targetReps: cfg.repMin };
  }

  const earned = hasRange && last.atBase.every((s) => perf(s) >= top);
  const scheduled = !earned && dueDate !== null && daysBetween(timer, today) >= cfg.scheduledDays;
  if (!earned && !scheduled) return { ...out, ...from, weightLbs: base, source: 'hold', targetReps: holdTarget(last, cfg, perf) };
  if (gate) return { ...out, ...from, weightLbs: base, source: 'gated', targetReps: holdTarget(last, cfg, perf) };
  return { ...out, ...from, weightLbs: increaseLoad(base, cfg), source: earned ? 'earned' : 'scheduled', targetReps: cfg.repMin };
}

// ---- suspension (TRX): a level from 1 to 5 in place of a load (spec 5.4) ----

function suggestSuspension(ctx) {
  const { cfg, cal, hist, today } = ctx;
  const n = hist.length;
  const perf = (s) => performance(s, cfg);
  const hints = [];
  const out = {
    hints,
    isCalibration: false,
    calibrationSession: null,
    lastIncreaseDate: lastIncrease(hist, 'baseLevel'),
    scheduledIncrease: cfg.scheduledOn ? 'on' : 'off',
    nextScheduledDate: null,
  };
  if (n === 0) return { ...out, level: cfg.startingLevel, source: cal.isDeload ? 'deload' : 'starting', targetReps: cfg.repMin };

  const last = lastOf(hist);
  const level = last.baseLevel;
  const from = { fromLevel: level };
  // No calibration for TRX, so with no increase yet the timer starts at the exercise's first session.
  const timer = cfg.scheduledOn ? out.lastIncreaseDate ?? hist[0].date : null;
  out.nextScheduledDate = timer === null || level >= PROGRAM.maxLevel ? null : addDays(timer, cfg.scheduledDays);

  if (cal.isDeload) return { ...out, ...from, level, source: 'deload', targetReps: holdTarget(last, cfg, perf) };

  const weak = (session) => session.atBase.some((s) => perf(s) < cfg.repMin);
  if (n >= 2 && weak(last) && weak(hist[n - 2])) {
    return { ...out, ...from, level: Math.max(PROGRAM.minLevel, level - 1), source: 'reduction', targetReps: cfg.repMin };
  }
  const earned = last.atBase.every((s) => perf(s) >= cfg.repMax);
  const scheduled = !earned && out.nextScheduledDate !== null && daysBetween(timer, today) >= cfg.scheduledDays;
  if (level >= PROGRAM.maxLevel) {
    if (earned) hints.push(hint('slower-lowering'));
    return { ...out, ...from, level, source: 'hold', targetReps: holdTarget(last, cfg, perf) };
  }
  if (earned || scheduled) {
    return { ...out, ...from, level: level + 1, source: earned ? 'earned' : 'scheduled', targetReps: cfg.repMin };
  }
  return { ...out, ...from, level, source: 'hold', targetReps: holdTarget(last, cfg, perf) };
}

// ---- pushup ladder: progress by reps, then by variation (spec 5.4); level 5 adds load ----

const range = (level) => PUSHUP_LADDER[level];

function suggestLadder(ctx) {
  const { cfg, cal, hist } = ctx;
  const n = hist.length;
  const perf = (s) => performance(s, cfg);
  const out = {
    hints: [],
    isCalibration: false,
    calibrationSession: null,
    lastIncreaseDate: lastIncrease(hist, 'baseLevel'),
    scheduledIncrease: 'n/a', // scheduled increases do not apply to the ladder (spec 5.4, 5.12)
    nextScheduledDate: null,
  };
  if (n === 0) {
    const level = cfg.startingLevel;
    return { ...out, level, weightLbs: null, source: cal.isDeload ? 'deload' : 'starting', targetReps: range(level).repMin, ...range(level) };
  }

  const last = lastOf(hist);
  const level = last.baseLevel;
  const atFive = level === PROGRAM.maxLevel;
  const from = { fromLevel: level, fromWeightLbs: atFive ? last.baseLoad : null };
  const withRange = (lv, r) => ({ ...out, ...from, ...range(lv), ...r });
  const stay = (source, targetReps) => withRange(level, { level, weightLbs: atFive ? last.baseLoad : null, source, targetReps });

  if (cal.isDeload) return stay('deload', holdTarget(last, { ...cfg, ...range(level) }, perf));

  const weak = (session) => session.atBase.some((s) => perf(s) < range(session.baseLevel).repMin);
  if (n >= 2 && weak(last) && weak(hist[n - 2])) {
    // At level 5 with a load the load comes off first; otherwise back one level (level 0 is the floor).
    if (atFive && last.baseLoad > 0) {
      return withRange(level, { level, weightLbs: reduceLoad(last.baseLoad, cfg), source: 'reduction', targetReps: range(level).repMin });
    }
    const lower = Math.max(0, level - 1);
    return withRange(lower, { level: lower, weightLbs: null, source: 'reduction', targetReps: range(lower).repMin });
  }
  if (last.atBase.every((s) => perf(s) >= range(level).repMax)) {
    if (atFive) {
      return withRange(level, { level, weightLbs: increaseLoad(last.baseLoad, cfg), source: 'earned', targetReps: range(level).repMin });
    }
    return withRange(level + 1, { level: level + 1, weightLbs: null, source: 'earned', targetReps: range(level + 1).repMin });
  }
  return stay('hold', holdTarget(last, { ...cfg, ...range(level) }, perf));
}

// ---- unloaded exercises ----

// Dead bug: no load; a hint when every set reached the top of the range (spec 5.4).
function suggestBodyweight(ctx) {
  const { cfg, hist } = ctx;
  const last = hist.length ? lastOf(hist) : null;
  const hints = last && last.atBase.every((s) => performance(s, cfg) >= cfg.repMax) ? [hint('harder-variation')] : [];
  return {
    hints, isCalibration: false, calibrationSession: null, lastIncreaseDate: null, scheduledIncrease: 'n/a', nextScheduledDate: null,
    weightLbs: null, source: null, targetReps: cfg.repMin,
  };
}

// Holds (TRX plank, weighted bird dog) are completion only; "none" (band pull-apart) shows sets and reps.
function suggestPlain(ctx) {
  return {
    hints: [], isCalibration: false, calibrationSession: null, lastIncreaseDate: null, scheduledIncrease: 'n/a', nextScheduledDate: null,
    weightLbs: null, source: null, targetReps: ctx.cfg.progression === 'none' ? ctx.cfg.repMin : null,
  };
}

const SUGGESTERS = {
  load: suggestLoad,
  suspension: suggestSuspension,
  ladder: suggestLadder,
  bodyweight: suggestBodyweight,
  hold: suggestPlain,
  none: suggestPlain,
};

// Suggestion for one exercise in a slot, for a Pacific day `today`. See DEPLOYMENT-PLAN.md section 14 for the shape.
export function suggestExercise(state, { exerciseId, templateCode = null, slot = null, today, backPainBefore = null }) {
  const cal = calendarFor({ settings: state.settings, deloads: state.deloads, today });
  const cfg = resolveExercise(exerciseId, { settings: state.settings, templateCode, slot });
  const hist = exerciseHistory(state, cfg);
  const ctx = { state, cal, cfg, hist, today, backPainBefore: Number.isInteger(backPainBefore) ? backPainBefore : null };
  const r = SUGGESTERS[cfg.progression](ctx);

  const last = hist.length ? lastOf(hist) : null;
  const fromWeightLbs = r.fromWeightLbs ?? (last?.baseLoad ?? null);
  const fromLevel = r.fromLevel ?? (last?.baseLevel ?? null);
  const weightLbs = r.weightLbs ?? null;
  const level = r.level ?? null;
  const stall = stallInfo(hist, today, { reducingNow: r.source === 'reduction' });
  const increased = (weightLbs !== null && fromWeightLbs !== null && weightLbs > fromWeightLbs) ||
    (level !== null && fromLevel !== null && level > fromLevel);
  return {
    exerciseId,
    type: cfg.type,
    progression: cfg.progression,
    sets: slot ? setsFor(templateCode, slot, cal.phase, cal.isDeload) : null,
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
    increased,
    incrementLbs: cfg.incrementLbs,
    firstLoadedWeightLbs: cfg.firstLoadedWeightLbs,
    rampUp: rampUpSets({ weightLbs, exercise: cfg, slot, isCalibration: r.isCalibration }),
    isCalibration: r.isCalibration,
    calibrationSession: r.calibrationSession,
    hints: r.hints,
    stalled: stall.stalled,
    recentReductions: stall.recentReductions,
    lastIncreaseDate: r.lastIncreaseDate,
    nextScheduledDate: r.nextScheduledDate,
    scheduledIncrease: r.scheduledIncrease,
    pace: expectedPace(exerciseId),
    last: last && {
      date: last.date,
      sets: last.sets.map((s) => ({ weightLbs: s.weightLbs ?? null, reps: s.reps ?? null, levelNumber: s.levelNumber ?? null, distanceM: s.distanceM ?? null })),
    },
  };
}

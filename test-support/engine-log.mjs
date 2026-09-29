// Builds an event log for engine tests out of sessions, sets and settings, and replays it. Every event goes through
// the server's validator, so a test can only use events the app could really write.
//
//   const log = makeLog();
//   log.session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12, 12])]);
//   log.setting('programStartDate', '2026-09-28');
//   suggestExercise(log.state(), { exerciseId: 'goblet-squat', templateCode: 'A', slot: 1, today: '2026-10-05' });

import { pacificIso } from '../app/js/time.js';
import { replay } from '../app/js/store/replay.js';
import { validateEvent } from '../lambda/events/registry.mjs';
import { ulid } from './util.mjs';

const FAR_FUTURE = Date.parse('2035-01-01T00:00:00Z');

// Instant of a Pacific wall-clock time ("2026-10-05", "11:00"): try both offsets, keep the one that reads back the same.
export function pacificMs(date, time = '11:00') {
  for (const off of ['-07:00', '-08:00']) {
    const ms = Date.parse(`${date}T${time}:00.000${off}`);
    if (pacificIso(ms).startsWith(`${date}T${time}`)) return ms;
  }
  throw new Error(`no such Pacific time ${date} ${time}`);
}

// Working sets of one exercise: reps per set at one weight. extra: any set.logged field (suggestionSource, ...).
export const lift = (exerciseId, weightLbs, reps, extra = {}) => ({ exerciseId, weightLbs, reps, ...extra });
// Sets at a level (suspension, pushup ladder).
export const atLevel = (exerciseId, levelNumber, reps, extra = {}) => ({ exerciseId, levelNumber, reps, ...extra });
// Carry sets: distance walked per set.
export const carry = (exerciseId, weightLbs, distances, extra = {}) => ({ exerciseId, weightLbs, distances, ...extra });
// Ramp-up sets: [{ weightLbs, reps }].
export const ramp = (exerciseId, sets) => ({ exerciseId, rampUp: sets });

export function makeLog({ programStartDate = '2026-09-28', validate = true } = {}) {
  const events = [];
  let n = 100;
  let counter = 0;
  const push = (type, entityId, payload, ms) => {
    const ev = { id: ulid(++n), ts: `${pacificIso(ms)}-${String(++counter).padStart(4, '0')}-d_test`, v: 1, type, entityId, payload };
    const errs = validate ? validateEvent(ev, FAR_FUTURE) : [];
    if (errs.length) throw new Error(`invalid ${type}: ${JSON.stringify(errs)}`);
    events.push(ev);
    return ev;
  };

  const log = {
    events,

    // One session. sets: lift()/atLevel()/carry()/ramp() entries in order. opts: time, finished (default true),
    // isDeload, week, phase, backPainBefore, id, startMs.
    session(date, templateCode, sets = [], opts = {}) {
      const { time = '11:00', finished = true, isDeload = false, backPainBefore = null, id = `sess_${date}_${templateCode}` } = opts;
      const startMs = opts.startMs ?? pacificMs(date, time);
      const days = Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${programStartDate}T12:00:00Z`)) / 86400000);
      const week = opts.week ?? Math.max(1, Math.floor(days / 7) + 1);
      const payload = { templateCode, startedAt: pacificIso(startMs), programWeek: week, phase: opts.phase ?? (week <= 4 ? 1 : 2), isDeload };
      if (backPainBefore !== null) payload.backPainBefore = backPainBefore;
      push('session.started', id, payload, startMs);
      let t = startMs + 60_000;
      for (const entry of sets) {
        const setBase = { sessionId: id, exerciseId: entry.exerciseId, isCalibration: entry.isCalibration ?? false };
        const extra = { ...entry };
        for (const k of ['exerciseId', 'reps', 'distances', 'rampUp', 'weightLbs', 'levelNumber', 'isCalibration']) delete extra[k];
        const rows = entry.rampUp
          ? entry.rampUp.map((r) => ({ isRampUp: true, weightLbs: r.weightLbs, reps: r.reps }))
          : (entry.distances ?? entry.reps).map((v) => ({
              isRampUp: false,
              ...(entry.distances ? { distanceM: v } : { reps: v }),
              ...(entry.weightLbs !== undefined ? { weightLbs: entry.weightLbs } : {}),
              ...(entry.levelNumber !== undefined ? { levelNumber: entry.levelNumber } : {}),
            }));
        rows.forEach((row, i) => {
          const setId = `set_${id}_${entry.exerciseId}_${entry.rampUp ? 'r' : 'w'}${i + 1}_${++n}`;
          push('set.logged', setId, { ...setBase, setNumber: i + 1, ...row, ...extra }, t);
          t += 60_000;
        });
      }
      if (finished) push('session.finished', id, { finishedAt: pacificIso(t + 60_000) }, t + 60_000);
      return log;
    },

    setting(key, value) {
      push('setting.changed', 'settings', { key, value }, Date.parse('2026-09-01T12:00:00Z') + ++n * 1000);
      return log;
    },
    swap(templateCode, slotNumber, exerciseId) {
      push('swap.set', `swap_${templateCode}_${slotNumber}`, { templateCode, slotNumber, exerciseId }, Date.parse('2026-09-01T12:00:00Z') + ++n * 1000);
      return log;
    },
    deload(programWeek, source = 'manual') {
      push('deload.started', `deload_${programWeek}`, { programWeek, source }, Date.parse('2026-09-01T12:00:00Z') + ++n * 1000);
      return log;
    },
    postpone(programWeek, postponedFromWeek) {
      push('deload.postponed', `deload_${programWeek}`, { programWeek, postponedFromWeek }, Date.parse('2026-09-01T12:00:00Z') + ++n * 1000);
      return log;
    },

    state: () => replay(events),
  };
  return log;
}

// Small seeded generator for property-style tests (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle with a seeded generator; returns a new array.
export function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

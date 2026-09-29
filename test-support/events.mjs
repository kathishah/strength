// Small builders for events in replay and merge tests. Times are minutes after 12:00 PDT on 2026-09-29.
// These make well-formed events; they are not validated here (tests that need that use validateEvent).

import { pacificIso } from '../app/js/time.js';
import { ulid } from './util.mjs';

export const BASE = Date.parse('2026-09-29T19:00:00.000Z'); // 12:00 PDT
let seq = 5000;

export function tsAt(minutes, { counter = 0, device = 'd_a' } = {}) {
  return `${pacificIso(BASE + Math.round(minutes * 60_000))}-${String(counter).padStart(4, '0')}-${device}`;
}

// when: minutes after BASE, or a full ts string. opts: { counter, device, id, v }
export function ev(type, entityId, payload, when = 0, opts = {}) {
  return {
    id: opts.id ?? ulid(++seq),
    ts: typeof when === 'string' ? when : tsAt(when, opts),
    v: opts.v ?? 1,
    type,
    entityId,
    payload,
  };
}

export const startSession = (id, when, extra = {}, opts) =>
  ev('session.started', id, { templateCode: 'A', startedAt: tsAt(when).slice(0, 29), programWeek: 1, phase: 1, isDeload: false, ...extra }, when, opts);
export const finishSession = (id, when, extra = {}, opts) =>
  ev('session.finished', id, { finishedAt: tsAt(when).slice(0, 29), ...extra }, when, opts);
export const noteSession = (id, notes, when, opts) => ev('session.notes', id, { notes }, when, opts);
export const logSet = (id, sessionId, when, extra = {}, opts) =>
  ev('set.logged', id, { sessionId, exerciseId: 'goblet-squat', setNumber: 1, isRampUp: false, isCalibration: false, weightLbs: 25, reps: 10, ...extra }, when, opts);
export const editSet = (id, fields, when, opts) => ev('set.edited', id, fields, when, opts);
export const setting = (key, value, when, opts) => ev('setting.changed', 'settings', { key, value }, when, opts);
export const del = (entityId, when, entityType, opts) =>
  ev('entity.deleted', entityId, entityType ? { entityType } : {}, when, opts);

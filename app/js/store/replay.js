// Replay: the event log in, app state out (DEPLOYMENT-PLAN.md section 4). Pure: no DOM, no storage.
//
// replay(events) sorts by ts (by instant, ties by counter, device, then event id) and merges field
// patches per entity, the last ts winning per field. The result depends only on WHICH events exist,
// never on the order they arrived in, so every device that holds the same events has the same state.
//
//   - Creating events (session.started, set.logged) lay down an entity's fields first; every patch
//     for that entity (session.finished, session.notes, set.edited) is applied over them in ts order.
//     A patch is always causally after the creation, so it wins even when a slow clock gave it an
//     earlier ts. A patch whose entity is never created is dropped (Phase A's spike_ notes, or a set
//     whose session never arrived); it is applied if the creating event turns up later.
//   - entity.deleted is final: everything for a deleted entity is ignored, whatever its ts.
//   - Sets whose session does not exist (never arrived, or deleted) are left out.
//   - Events of an unknown type or version (written by a newer app) are skipped and listed in `skipped`.

import { compareParsedTs, parseTs } from '../time.js';

const SESSION_CREATE = ['templateCode', 'startedAt', 'programWeek', 'phase', 'isDeload', 'backPainBefore'];
const SET_VALUE_FIELDS = ['weightLbs', 'reps', 'rir', 'levelNumber', 'distanceM', 'calibrationFeel', 'completed'];
const SET_CREATE = [
  'sessionId', 'exerciseId', 'setNumber', 'isRampUp', 'isCalibration',
  'suggestedWeightLbs', 'suggestedLevel', 'suggestionSource', ...SET_VALUE_FIELDS,
];

// Entity events: which record they touch, whether they create it, and which payload fields they set.
const ENTITY_EVENTS = {
  'session.started': { kind: 'session', creates: true, fields: SESSION_CREATE },
  'session.finished': { kind: 'session', creates: false, fields: ['finishedAt', 'backPainAfter'] },
  'session.notes': { kind: 'session', creates: false, fields: ['notes'] },
  'set.logged': { kind: 'set', creates: true, fields: SET_CREATE },
  'set.edited': { kind: 'set', creates: false, fields: ['isRampUp', 'isCalibration', ...SET_VALUE_FIELDS] },
};
const OTHER_TYPES = ['setting.changed', 'swap.set', 'swap.cleared', 'deload.started', 'deload.postponed', 'entity.deleted'];
const KNOWN_VERSION = 1;

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const copy = (v) => (v !== null && typeof v === 'object' ? structuredClone(v) : v);

// Sets the fields the payload carries (absent = untouched; null = cleared) onto a record.
function patch(record, payload, fields) {
  for (const f of fields) if (Object.hasOwn(payload, f)) record[f] = copy(payload[f]);
}

export const emptyState = () => ({ sessions: {}, sets: {}, settings: {}, swaps: {}, deloads: {}, skipped: [] });

// events: any array, in any order, possibly with duplicates (same id) and events this version does
// not understand. Returns:
//   sessions: { [sessionId]: { id, templateCode, startedAt, programWeek, phase, isDeload, backPainBefore,
//                              finishedAt, backPainAfter, notes } }        (only the fields that were set)
//   sets:     { [setId]: { id, sessionId, exerciseId, setNumber, isRampUp, isCalibration, ...values } }
//   settings: { [key]: value }                       e.g. programStartDate, startingWeight:goblet-squat
//   swaps:    { 'A:3': exerciseId }                  templateCode:slotNumber; a cleared swap is absent
//   deloads:  { [programWeek]: { programWeek, source?, postponedFromWeek? } }
//   skipped:  [{ id, reason }]
export function replay(events) {
  const state = emptyState();

  // 1. De-duplicate by id (a retry after a lost acknowledgment can store an event twice).
  const unique = new Map();
  for (const ev of events) {
    if (isObject(ev) && typeof ev.id === 'string' && !unique.has(ev.id)) unique.set(ev.id, ev);
  }

  // 2. Keep what can be ordered and understood.
  const usable = [];
  for (const ev of unique.values()) {
    const ts = parseTs(ev.ts);
    const known = Object.hasOwn(ENTITY_EVENTS, ev.type) || OTHER_TYPES.includes(ev.type);
    if (!ts) state.skipped.push({ id: ev.id, reason: 'bad ts' });
    else if (!known) state.skipped.push({ id: ev.id, reason: 'unknown type' });
    else if (ev.v !== KNOWN_VERSION) state.skipped.push({ id: ev.id, reason: 'unsupported version' });
    else if (!isObject(ev.payload) || typeof ev.entityId !== 'string') state.skipped.push({ id: ev.id, reason: 'bad shape' });
    else usable.push({ ev, ts });
  }

  // 3. Replay order: instant, counter, device, then event id.
  usable.sort((a, b) => compareParsedTs(a.ts, b.ts) || (a.ev.id < b.ev.id ? -1 : a.ev.id > b.ev.id ? 1 : 0));

  const deleted = new Set();
  for (const { ev } of usable) if (ev.type === 'entity.deleted') deleted.add(ev.entityId);

  // 4. Entity events are grouped per entity (still in ts order); global events apply directly.
  const entities = { session: new Map(), set: new Map() };
  for (const { ev } of usable) {
    const def = Object.hasOwn(ENTITY_EVENTS, ev.type) ? ENTITY_EVENTS[ev.type] : null;
    if (def) {
      if (deleted.has(ev.entityId)) continue;
      let group = entities[def.kind].get(ev.entityId);
      if (!group) entities[def.kind].set(ev.entityId, (group = { creates: [], patches: [] }));
      (def.creates ? group.creates : group.patches).push({ ev, def });
    } else {
      applyGlobal(state, ev);
    }
  }

  for (const [kind, target] of [['session', state.sessions], ['set', state.sets]]) {
    for (const [id, group] of entities[kind]) {
      if (group.creates.length === 0) continue; // never created: its patches are dropped
      const record = { id };
      for (const { ev, def } of [...group.creates, ...group.patches]) patch(record, ev.payload, def.fields);
      target[id] = record;
    }
  }

  // 5. A set needs its session.
  for (const [id, set] of Object.entries(state.sets)) {
    if (!Object.hasOwn(state.sessions, set.sessionId)) delete state.sets[id];
  }
  return state;
}

function applyGlobal(state, { type, payload }) {
  switch (type) {
    case 'setting.changed':
      if (typeof payload.key === 'string' && payload.key !== '__proto__' && Object.hasOwn(payload, 'value')) {
        state.settings[payload.key] = copy(payload.value);
      }
      break;
    case 'swap.set':
    case 'swap.cleared': {
      if (typeof payload.templateCode !== 'string' || !Number.isInteger(payload.slotNumber)) break;
      const slot = `${payload.templateCode}:${payload.slotNumber}`;
      if (type === 'swap.set') state.swaps[slot] = payload.exerciseId;
      else delete state.swaps[slot];
      break;
    }
    case 'deload.started':
    case 'deload.postponed': {
      const week = payload.programWeek;
      if (!Number.isInteger(week)) break;
      const record = (state.deloads[week] ??= { programWeek: week });
      patch(record, payload, ['source', 'postponedFromWeek']);
      break;
    }
    default: // entity.deleted was handled above
  }
}

// The pure parts of scripts/export-data.mjs (plan section 15e): paging through GET /events, and turning events into a CSV of logged sets.

import { replay } from '../app/js/store/replay.js';
import { EXERCISES, WORKOUTS } from '../app/js/seed/index.js';
import { pacificDate, parseInstant } from '../app/js/time.js';

export const CSV_COLUMNS = [
  'date', 'workout', 'programWeek', 'phase', 'sessionId', 'exerciseId', 'exercise', 'setNumber', 'weightLbs', 'levelNumber', 'reps',
  'distanceM', 'suggestedWeightLbs', 'suggestionSource', 'setId',
];

const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const slotOrder = (templateCode, exerciseId) => {
  const slots = WORKOUTS[templateCode]?.slots ?? [];
  const i = slots.findIndex((s) => s.exercise === exerciseId || s.alternatives.includes(exerciseId) || s.trxAlternatives.includes(exerciseId));
  return i < 0 ? 99 : i;
};

// events: as stored (any order, duplicates allowed). One row per working set (not ramp-up, not marked not completed) of a session that
// exists, after replay, so edits are applied and deleted sets and sessions are gone. Oldest session first, then slot order, then set number.
export function eventsToCsv(events) {
  const state = replay(events);
  const rows = [];
  for (const set of Object.values(state.sets)) {
    const session = state.sessions[set.sessionId];
    if (!session || set.isRampUp === true || set.completed === false) continue;
    const startedMs = parseInstant(session.startedAt);
    rows.push({
      startedMs: Number.isNaN(startedMs) ? 0 : startedMs,
      slot: slotOrder(session.templateCode, set.exerciseId),
      values: [
        Number.isNaN(startedMs) ? '' : pacificDate(startedMs), session.templateCode, session.programWeek, session.phase, set.sessionId, set.exerciseId,
        EXERCISES[set.exerciseId]?.name ?? set.exerciseId, set.setNumber, set.weightLbs, set.levelNumber, set.reps, set.distanceM,
        set.suggestedWeightLbs, set.suggestionSource, set.id,
      ],
      setNumber: set.setNumber,
      id: set.id,
    });
  }
  rows.sort((a, b) => a.startedMs - b.startedMs || a.slot - b.slot || a.setNumber - b.setNumber || (a.id < b.id ? -1 : 1));
  return [CSV_COLUMNS.join(','), ...rows.map((r) => r.values.map(cell).join(','))].join('\n') + '\n';
}

// Every event the server holds, oldest first, de-duplicated by id. get(pathAndQuery) resolves with the parsed JSON body of a GET /events.
export async function fetchAllEvents(get, { limit = 5000 } = {}) {
  const seen = new Map();
  let cursor = null;
  for (let page = 0; page < 10_000; page++) {
    const body = await get(`/events?limit=${limit}${cursor ? `&since=${encodeURIComponent(cursor)}` : ''}`);
    for (const ev of body.events ?? []) if (!seen.has(ev.id)) seen.set(ev.id, ev);
    if (!body.more) break;
    if (!body.cursor || body.cursor === cursor) throw new Error('The server said there are more events but did not move the cursor.');
    cursor = body.cursor;
  }
  return [...seen.values()];
}

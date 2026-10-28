// The local draft of an in-progress session (spec 6.3 draft safety, archive/DEPLOYMENT-PLAN-history.md section 15). Pure functions over a plain object;
// the browser code saves and loads it (ui/draft-store.js).
//
// Logged sets are events and need no draft. The draft holds only what is not an event yet: values typed into rows that
// are not logged, the exercises being edited, notes text and extra sets added. Every function
// returns a new draft and leaves the old one alone.
//
//   { v: 1, sessionId,
//     rows: { [exerciseId]: { [setNumber]: { weightLbs?, levelNumber?, reps?, distanceM? } } },
//     editing: { [exerciseId]: true },     (a logged exercise reopened for changes)
//     extra: { [exerciseId]: number },
//     notes: string | null }

export const DRAFT_VERSION = 1;

export const emptyDraft = (sessionId) => ({
  v: DRAFT_VERSION, sessionId, rows: {}, editing: {}, extra: {}, notes: null,
});

const ROW_FIELDS = ['weightLbs', 'levelNumber', 'reps', 'distanceM'];
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isNumOrNull = (x) => x === null || (typeof x === 'number' && Number.isFinite(x));
const safeKey = (k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';

// Reads a saved draft. Anything wrong with it (not JSON, another session, another version, bad fields) gives an empty
// draft for `sessionId`, or the good parts of it; it never throws.
export function parseDraft(text, sessionId) {
  let raw;
  try { raw = typeof text === 'string' ? JSON.parse(text) : text; } catch { return emptyDraft(sessionId); }
  if (!isObject(raw) || raw.v !== DRAFT_VERSION || raw.sessionId !== sessionId) return emptyDraft(sessionId);
  const draft = emptyDraft(sessionId);
  if (isObject(raw.rows)) {
    for (const [exerciseId, sets] of Object.entries(raw.rows)) {
      if (!safeKey(exerciseId) || !isObject(sets)) continue;
      for (const [num, row] of Object.entries(sets)) {
        const setNumber = Number(num);
        if (!Number.isInteger(setNumber) || setNumber < 1 || !isObject(row)) continue;
        const clean = {};
        for (const f of ROW_FIELDS) if (Object.hasOwn(row, f) && isNumOrNull(row[f])) clean[f] = row[f];
        if (Object.keys(clean).length > 0) ((draft.rows[exerciseId] ??= {})[setNumber] = clean);
      }
    }
  }
  if (isObject(raw.editing)) {
    for (const [exerciseId, on] of Object.entries(raw.editing)) if (safeKey(exerciseId) && on === true) draft.editing[exerciseId] = true;
  }
  if (isObject(raw.extra)) {
    for (const [exerciseId, n] of Object.entries(raw.extra)) {
      if (safeKey(exerciseId) && Number.isInteger(n) && n > 0 && n <= 20) draft.extra[exerciseId] = n;
    }
  }
  if (typeof raw.notes === 'string') draft.notes = raw.notes.slice(0, 4000);
  return draft;
}

export const serializeDraft = (draft) => JSON.stringify(draft);

export const rowDraft = (draft, exerciseId) => draft.rows[exerciseId] ?? {};

// Sets one typed value (a number, or null for a cleared box) on a row.
export function setRowField(draft, exerciseId, setNumber, field, value) {
  if (!ROW_FIELDS.includes(field)) throw new RangeError(`unknown row field "${field}"`);
  const row = { ...(draft.rows[exerciseId]?.[setNumber] ?? {}), [field]: value };
  return { ...draft, rows: { ...draft.rows, [exerciseId]: { ...draft.rows[exerciseId], [setNumber]: row } } };
}

// Reopens a logged exercise for changes (its values then come from the logged sets until something is typed).
export const startEditing = (draft, exerciseId) => ({ ...draft, editing: { ...draft.editing, [exerciseId]: true } });

// Forgets everything typed for an exercise and closes its edit (after it is saved, undone or the edit is cancelled).
export function clearExercise(draft, exerciseId) {
  const rows = { ...draft.rows };
  delete rows[exerciseId];
  const editing = { ...draft.editing };
  delete editing[exerciseId];
  const extra = { ...draft.extra };
  delete extra[exerciseId];
  return { ...draft, rows, editing, extra };
}

// Forgets a row's typed values (after it is logged or saved, or an edit is cancelled).
export function clearRow(draft, exerciseId, setNumber) {
  const sets = { ...draft.rows[exerciseId] };
  delete sets[setNumber];
  const rows = { ...draft.rows };
  if (Object.keys(sets).length === 0) delete rows[exerciseId];
  else rows[exerciseId] = sets;
  return { ...draft, rows };
}

export const addExtraSet = (draft, exerciseId) => ({ ...draft, extra: { ...draft.extra, [exerciseId]: (draft.extra[exerciseId] ?? 0) + 1 } });

export const setNotes = (draft, text) => ({ ...draft, notes: text });

// ---- saving ----

// One draft is kept, for the session in progress, under `${keyPrefix}draft` ('strength.draft' by default; the demo passes its own
// prefix, see profile.js). backend: a key-value store with getItem, setItem and removeItem (the browser's local storage),
// or null/broken storage, in which case the draft lives in memory for as long as the page does.
// load(sessionId) always returns a usable draft; save and clear never throw.
export function createDraftStore(backend, { keyPrefix = 'strength.' } = {}) {
  const key = `${keyPrefix}draft`;
  let cached = null;
  return {
    load(sessionId) {
      if (cached?.sessionId === sessionId) return cached;
      let text = null;
      try { text = backend?.getItem(key) ?? null; } catch { /* storage blocked: start empty */ }
      cached = parseDraft(text, sessionId);
      return cached;
    },
    save(draft) {
      cached = draft;
      try { backend?.setItem(key, serializeDraft(draft)); } catch { /* kept in memory only */ }
    },
    clear(sessionId) {
      if (cached?.sessionId === sessionId) cached = null;
      try { backend?.removeItem(key); } catch { /* nothing to remove */ }
    },
  };
}

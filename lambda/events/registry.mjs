// Event type registry and validators (DEPLOYMENT-PLAN.md sections 3 and 4).
//
// Every stored event is { id, ts, v, type, entityId, payload, recvAt }. Clients
// send everything except recvAt. Payloads are field-level patches (section 4),
// so an optional field that is absent means "this event does not touch it".
//
// To add a field or type: edit REGISTRY below. Unknown payload fields are
// rejected, so a change in meaning of an existing field needs a new `v`.

export const MAX_EVENTS_PER_REQUEST = 200;
export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
// Hybrid logical clock: <ISO time with Z or +/-hh:mm offset>-<counter>-<deviceId>.
// The app writes US Pacific offsets ("...-07:00"). Because offsets change with daylight saving,
// compare timestamps with compareTs() below, never as plain strings.
const HLC_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2}))-([0-9a-z]{4,8})-([A-Za-z0-9_]{1,32})$/;
const DEVICE_ID_RE = /^[A-Za-z0-9_]{1,32}$/;
const ENTITY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const EXERCISE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- field checkers: each returns an error string, or null when valid ----

const isPlainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

const INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

// Milliseconds since the epoch for an ISO-8601 time with Z or a +/-hh:mm offset; NaN if it is
// malformed or impossible (Feb 30, 25:00, ...).
export function parseInstant(s) {
  const m = typeof s === 'string' ? INSTANT_RE.exec(s) : null;
  if (!m) return NaN;
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map(Number);
  const local = Date.UTC(y, mo - 1, d, h, mi, sec);
  const back = new Date(local);
  if (
    back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d ||
    back.getUTCHours() !== h || back.getUTCMinutes() !== mi || back.getUTCSeconds() !== sec
  ) return NaN;
  let offsetMin = 0;
  if (m[8] !== 'Z') {
    const oh = Number(m[8].slice(1, 3));
    const om = Number(m[8].slice(4, 6));
    if (oh > 23 || om > 59) return NaN;
    offsetMin = (m[8][0] === '-' ? -1 : 1) * (oh * 60 + om);
  }
  const millis = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
  return local + millis - offsetMin * 60000;
}

export const isIsoInstant = (s) => !Number.isNaN(parseInstant(s));

// Splits an event ts into { ms, counter, deviceId }, or null if it is not a valid ts.
export function parseTs(ts) {
  const m = typeof ts === 'string' ? HLC_RE.exec(ts) : null;
  if (!m) return null;
  const ms = parseInstant(m[1]);
  return Number.isNaN(ms) ? null : { ms, counter: m[2], deviceId: m[3] };
}

// Replay order: instant, then counter, then device id. Use this, not string comparison.
export function compareTs(a, b) {
  const x = parseTs(a);
  const y = parseTs(b);
  if (x.ms !== y.ms) return x.ms < y.ms ? -1 : 1;
  if (x.counter !== y.counter) {
    if (x.counter.length !== y.counter.length) return x.counter.length < y.counter.length ? -1 : 1;
    return x.counter < y.counter ? -1 : 1;
  }
  return x.deviceId === y.deviceId ? 0 : x.deviceId < y.deviceId ? -1 : 1;
}

const isoDate = (s) => {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return 'must be a date (yyyy-mm-dd)';
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return 'must be a real date';
  return null;
};

const num = (min, max, { int = false } = {}) => (x) => {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'must be a number';
  if (int && !Number.isInteger(x)) return 'must be an integer';
  if (x < min || x > max) return `must be between ${min} and ${max}`;
  return null;
};
const int = (min, max) => num(min, max, { int: true });
const bool = (x) => (typeof x === 'boolean' ? null : 'must be true or false');
const instant = (x) => (isIsoInstant(x) ? null : 'must be an ISO-8601 time with Z or an offset');
const oneOf = (...values) => (x) => (values.includes(x) ? null : `must be one of ${values.join(', ')}`);
const text = (maxLen) => (x) => {
  if (typeof x !== 'string') return 'must be a string';
  if (x.length > maxLen) return `must be at most ${maxLen} characters`;
  return null;
};
const exerciseId = (x) =>
  typeof x === 'string' && EXERCISE_ID_RE.test(x) ? null : 'must be an exercise id like "goblet-squat"';
const entityRef = (x) =>
  typeof x === 'string' && ENTITY_ID_RE.test(x) ? null : 'must be an entity id';

// Marks a field as nullable ("no value"), for optional patch fields such as reps.
const nullable = (check) => (x) => (x === null ? null : check(x));

const TEMPLATE_CODE = oneOf('A', 'B', 'C');
const WEIGHT = num(0, 1000);
const REPS = int(0, 500);
const LEVEL = int(1, 5);
const RIR = int(0, 10);
const BACK_PAIN = int(0, 10);
const PROGRAM_WEEK = int(1, 520);

// ---- set fields shared by set.logged and set.edited ----
const SET_VALUE_FIELDS = {
  weightLbs: nullable(WEIGHT),
  reps: nullable(REPS),
  rir: nullable(RIR),
  levelNumber: nullable(LEVEL),
  distanceM: nullable(num(0, 10000)),
  calibrationFeel: nullable(oneOf('too_easy', 'about_right', 'too_hard')),
  completed: bool,
};

// ---- setting keys (spec 6.7 and plan section 4) ----
// `startingWeight:<exerciseId>` style keys are matched by prefix.
const SETTING_CHECKS = {
  programStartDate: isoDate,
  restTimerDefaultSec: int(5, 3600),
  trapBarWeightLbs: WEIGHT,
  scheduledIncreasesEnabled: bool,
  scheduledIncreaseDays: int(1, 365),
  recoveryDays: (x) =>
    Array.isArray(x) && x.length <= 7 && x.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      ? null
      : 'must be a list of weekday numbers 0-6',
};
const PER_EXERCISE_SETTING_CHECKS = {
  startingWeight: nullable(WEIGHT),
  firstLoadedWeight: nullable(WEIGHT),
  loadIncrement: nullable(num(0, 100)),
  scheduledIncrease: bool,
};

function checkSettingKeyValue({ key, value }) {
  const [name, exId, ...rest] = key.split(':');
  let check;
  if (exId === undefined) {
    check = Object.hasOwn(SETTING_CHECKS, name) ? SETTING_CHECKS[name] : undefined;
  } else if (rest.length === 0 && Object.hasOwn(PER_EXERCISE_SETTING_CHECKS, name)) {
    if (exerciseId(exId)) return [{ field: 'payload.key', reason: `"${key}" has an invalid exercise id` }];
    check = PER_EXERCISE_SETTING_CHECKS[name];
  }
  if (!check) return [{ field: 'payload.key', reason: `unknown setting "${key}"` }];
  const reason = check(value);
  return reason ? [{ field: 'payload.value', reason }] : [];
}

// ---- registry ----
// fields: name -> checker. required: names that must be present.
// minFields: at least this many of the fields must be present (patch events).
// custom: extra cross-field validation returning [{field, reason}].
export const REGISTRY = {
  'session.started': {
    1: {
      fields: {
        templateCode: TEMPLATE_CODE,
        startedAt: instant,
        programWeek: PROGRAM_WEEK,
        phase: int(1, 2),
        isDeload: bool,
        backPainBefore: nullable(BACK_PAIN),
      },
      required: ['templateCode', 'startedAt', 'programWeek', 'phase', 'isDeload'],
    },
  },
  'session.finished': {
    1: {
      fields: { finishedAt: instant, backPainAfter: nullable(BACK_PAIN) },
      required: ['finishedAt'],
    },
  },
  'session.notes': {
    1: { fields: { notes: text(4000) }, required: ['notes'] },
  },
  'set.logged': {
    1: {
      fields: {
        sessionId: entityRef,
        exerciseId,
        setNumber: int(1, 50),
        isRampUp: bool,
        isCalibration: bool,
        suggestedWeightLbs: nullable(WEIGHT),
        suggestedLevel: nullable(LEVEL),
        suggestionSource: nullable(
          oneOf('starting', 'calibration', 'hold', 'earned', 'scheduled', 'reduction', 'deload', 'gated'),
        ),
        ...SET_VALUE_FIELDS,
      },
      required: ['sessionId', 'exerciseId', 'setNumber', 'isRampUp', 'isCalibration'],
    },
  },
  'set.edited': {
    1: {
      fields: { isRampUp: bool, isCalibration: bool, ...SET_VALUE_FIELDS },
      required: [],
      minFields: 1,
    },
  },
  'setting.changed': {
    1: {
      fields: { key: text(100), value: () => null },
      required: ['key', 'value'],
      custom: checkSettingKeyValue,
    },
  },
  'swap.set': {
    1: {
      fields: { templateCode: TEMPLATE_CODE, slotNumber: int(1, 6), exerciseId },
      required: ['templateCode', 'slotNumber', 'exerciseId'],
    },
  },
  'swap.cleared': {
    1: {
      fields: { templateCode: TEMPLATE_CODE, slotNumber: int(1, 6) },
      required: ['templateCode', 'slotNumber'],
    },
  },
  'deload.started': {
    1: {
      fields: { programWeek: PROGRAM_WEEK, source: oneOf('scheduled', 'manual') },
      required: ['programWeek', 'source'],
    },
  },
  'deload.postponed': {
    1: {
      fields: { programWeek: PROGRAM_WEEK, postponedFromWeek: PROGRAM_WEEK },
      required: ['programWeek', 'postponedFromWeek'],
    },
  },
  'entity.deleted': {
    1: { fields: { entityType: oneOf('session', 'set') }, required: [] },
  },
};

// ---- validation ----

function validatePayload(spec, payload) {
  const errs = [];
  if (!isPlainObject(payload)) return [{ field: 'payload', reason: 'must be an object' }];
  for (const name of Object.keys(payload)) {
    if (!Object.hasOwn(spec.fields, name)) {
      errs.push({ field: `payload.${name}`, reason: 'unknown field' });
    }
  }
  for (const name of spec.required) {
    if (!Object.hasOwn(payload, name) || payload[name] === undefined) {
      errs.push({ field: `payload.${name}`, reason: 'is required' });
    }
  }
  for (const [name, check] of Object.entries(spec.fields)) {
    if (!Object.hasOwn(payload, name)) continue;
    const reason = check(payload[name]);
    if (reason) errs.push({ field: `payload.${name}`, reason });
  }
  if (spec.minFields) {
    const present = Object.keys(payload).filter((k) => Object.hasOwn(spec.fields, k)).length;
    if (present < spec.minFields) {
      errs.push({ field: 'payload', reason: `must set at least ${spec.minFields} field` });
    }
  }
  if (errs.length === 0 && spec.custom) errs.push(...spec.custom(payload));
  return errs;
}

// Returns a list of { field, reason } (empty when the event is valid).
export function validateEvent(ev, now = Date.now()) {
  if (!isPlainObject(ev)) return [{ field: 'event', reason: 'must be an object' }];
  const errs = [];
  const allowed = new Set(['id', 'ts', 'v', 'type', 'entityId', 'payload']);
  for (const k of Object.keys(ev)) {
    if (!allowed.has(k)) errs.push({ field: k, reason: 'unknown field (recvAt is set by the server)' });
  }
  if (typeof ev.id !== 'string' || !ULID_RE.test(ev.id)) {
    errs.push({ field: 'id', reason: 'must be a ULID' });
  }
  const ts = parseTs(ev.ts);
  if (!ts) {
    errs.push({ field: 'ts', reason: 'must look like 2026-09-30T10:42:11.120-07:00-0003-d_7f3a' });
  } else if (ts.ms > now + MAX_FUTURE_MS) {
    errs.push({ field: 'ts', reason: 'is more than 1 day in the future' });
  }
  if (typeof ev.entityId !== 'string' || !ENTITY_ID_RE.test(ev.entityId)) {
    errs.push({ field: 'entityId', reason: 'must be an entity id (letters, digits, _ . : -)' });
  }
  const versions = typeof ev.type === 'string' && Object.hasOwn(REGISTRY, ev.type) ? REGISTRY[ev.type] : null;
  if (!versions) {
    errs.push({ field: 'type', reason: 'unknown event type' });
    return errs;
  }
  const spec = Number.isInteger(ev.v) ? versions[ev.v] : undefined;
  if (!spec) {
    errs.push({ field: 'v', reason: `unsupported version for ${ev.type}` });
    return errs;
  }
  errs.push(...validatePayload(spec, ev.payload));
  return errs;
}

// Validates a whole POST body. Returns { errors: [] } or { errors: [{index, id?, field, reason}] }.
// The caller rejects the whole batch with 400 if `errors` is not empty.
export function validateBatch(body, now = Date.now()) {
  if (!isPlainObject(body)) return { errors: [{ index: null, field: 'body', reason: 'must be a JSON object' }] };
  const errors = [];
  if (typeof body.deviceId !== 'string' || !DEVICE_ID_RE.test(body.deviceId)) {
    errors.push({ index: null, field: 'deviceId', reason: 'must be a device id like "d_7f3a"' });
  }
  if (!Array.isArray(body.events)) {
    errors.push({ index: null, field: 'events', reason: 'must be an array' });
    return { errors };
  }
  if (body.events.length === 0) {
    errors.push({ index: null, field: 'events', reason: 'must not be empty' });
  }
  if (body.events.length > MAX_EVENTS_PER_REQUEST) {
    errors.push({ index: null, field: 'events', reason: `at most ${MAX_EVENTS_PER_REQUEST} events per request` });
    return { errors };
  }
  body.events.forEach((ev, index) => {
    for (const e of validateEvent(ev, now)) {
      errors.push({ index, ...(isPlainObject(ev) && typeof ev.id === 'string' ? { id: ev.id } : {}), ...e });
    }
  });
  return { errors };
}

// Timestamps written by the app use US Pacific time (America/Los_Angeles: PST in winter, PDT in summer).
// Same formatter as lambda/events/time.mjs; test/time.test.mjs checks that the two agree.

export const TIME_ZONE = 'America/Los_Angeles';

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// 1789000000123 -> "2026-09-29T12:30:00.123-07:00"
export function pacificIso(ms) {
  const p = Object.fromEntries(parts.formatToParts(ms).map((x) => [x.type, x.value]));
  const wholeSecond = Math.floor(ms / 1000) * 1000;
  const localAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offsetMin = Math.round((localAsUtc - wholeSecond) / 60000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const millis = String(ms - wholeSecond).padStart(3, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${millis}${sign}${hh}:${mm}`;
}

// 1789000000123 -> "2026-09-29": the Pacific calendar day containing ms.
export const pacificDate = (ms) => pacificIso(ms).slice(0, 10);

// ---- calendar days ("yyyy-mm-dd" strings) ----
// Day arithmetic works on whole days from the calendar, with no clock or offset in it, so daylight saving cannot
// move a program week. Used by the progression engine (app/js/engine), which does no date handling of its own.

const DAY_MS = 86400000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Days since 1970-01-01 for a "yyyy-mm-dd" string; NaN if malformed or impossible (2026-02-30).
export function dayNumber(date) {
  const m = typeof date === 'string' ? DATE_RE.exec(date) : null;
  if (!m) return NaN;
  const [y, mo, d] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;
  return ms / DAY_MS;
}

// Whole days from one calendar day to another (negative if `to` is earlier).
export function daysBetween(from, to) {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError(`not a yyyy-mm-dd date: ${Number.isNaN(a) ? from : to}`);
  return b - a;
}

// "2026-09-28" plus 21 days -> "2026-10-19".
export function addDays(date, days) {
  const n = dayNumber(date);
  if (Number.isNaN(n)) throw new RangeError(`not a yyyy-mm-dd date: ${date}`);
  return new Date((n + days) * DAY_MS).toISOString().slice(0, 10);
}

// The Pacific calendar day of an ISO time with any offset ("2026-09-28T11:03:00.000-07:00" -> "2026-09-28");
// null if the time is malformed.
export function pacificDateOf(iso) {
  const ms = parseInstant(iso);
  return Number.isNaN(ms) ? null : pacificDate(ms);
}

// ---- parsing and ordering (same rules as lambda/events/registry.mjs; test/time.test.mjs checks parity) ----

const INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;
const HLC_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2}))-([0-9a-z]{4,8})-([A-Za-z0-9_]{1,32})$/;

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

// Splits an event ts like "2026-09-29T12:30:00.123-07:00-0003-d_7f3a" into { ms, counter, deviceId },
// or null if it is not a valid ts.
export function parseTs(ts) {
  const m = typeof ts === 'string' ? HLC_RE.exec(ts) : null;
  if (!m) return null;
  const ms = parseInstant(m[1]);
  return Number.isNaN(ms) ? null : { ms, counter: m[2], deviceId: m[3] };
}

// Order two parsed timestamps: instant, then counter, then device id.
export function compareParsedTs(x, y) {
  if (x.ms !== y.ms) return x.ms < y.ms ? -1 : 1;
  if (x.counter !== y.counter) {
    if (x.counter.length !== y.counter.length) return x.counter.length < y.counter.length ? -1 : 1;
    return x.counter < y.counter ? -1 : 1;
  }
  return x.deviceId === y.deviceId ? 0 : x.deviceId < y.deviceId ? -1 : 1;
}

// Replay order for two ts strings. Offsets change with daylight saving, so use this, never string
// comparison. Both arguments must be valid (parseTs not null), as on the server.
export const compareTs = (a, b) => compareParsedTs(parseTs(a), parseTs(b));

// Instant (ms) of an event ts; NaN if malformed.
export const tsMs = (ts) => parseTs(ts)?.ms ?? NaN;

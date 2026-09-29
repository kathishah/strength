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


// Instant (ms) of an event ts like "2026-09-29T12:30:00.123-07:00-0003-d_7f3a"; NaN if malformed.
// Offsets change with daylight saving, so sort by this, not by the string.
export function tsMs(ts) {
  const m = /^(.+?)-[0-9a-z]{4,8}-[A-Za-z0-9_]{1,32}$/.exec(String(ts));
  return m ? Date.parse(m[1]) : NaN;
}

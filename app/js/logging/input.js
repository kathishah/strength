// Typed numbers and the +/- buttons. Pure.

// Text from a box to a number in [min, max], or null if it is empty, not a plain number, or out of range.
// "22.", "22.5" and "7" are fine; "1e3", "-3", "12 lbs" and "" are not.
export function parseNumber(text, { min = 0, max = Infinity, integer = false } = {}) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!/^\d+(\.\d*)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  if (integer && !Number.isInteger(n)) return null;
  return n;
}

export const parseWeight = (text) => parseNumber(text, { min: 0, max: 1000 });
export const parseReps = (text) => parseNumber(text, { min: 0, max: 500, integer: true });
export const parseDistance = (text) => parseNumber(text, { min: 0, max: 10000 });

// A number as it appears in a box: 20 -> "20", 22.5 -> "22.5", null -> "".
export const formatNumber = (n) => (typeof n === 'number' && Number.isFinite(n) ? String(n) : '');

const round2 = (n) => Math.round(n * 100) / 100;

// One press of - or +. A box that is empty and has `emptyStartsAt` jumps to that value (reps start at the target);
// otherwise an empty box counts as 0. The result stays in [min, max].
export function stepValue(current, delta, { min = 0, max = Infinity, emptyStartsAt } = {}) {
  const from = current === null || current === undefined
    ? emptyStartsAt !== undefined && emptyStartsAt !== null ? emptyStartsAt - delta : 0
    : current;
  return Math.min(max, Math.max(min, round2(from + delta)));
}

// ---- barrel dials (ui/dial.js) ----

// Every notch of a range: start, start + step, ... end (rounded, so no 22.500000001), plus any extra values the range does not contain
// (a weight logged as 21), sorted.
export function notches({ start, end, step, include = [] }) {
  const out = new Set();
  for (let v = start; v <= end + 1e-9; v += step) out.add(Math.round(v * 100) / 100);
  for (const v of include) if (typeof v === 'number' && Number.isFinite(v)) out.add(v);
  return [...out].sort((a, b) => a - b);
}

export const WEIGHT_NOTCH = 2.5; // the smallest plate step: every weight dial turns in 2.5 lb notches, whatever the exercise's own increment

// The notches of one dial. field: weightLbs | levelNumber | reps | distanceM. used: values the dial has to be able to show (what the
// sets hold now, the suggestion). The range grows with them, so a 130 lb leg press and a 20 lb squat both get a sensible drum.
export function dialNotches(field, used = []) {
  const top = Math.max(0, ...used.filter((v) => typeof v === 'number' && Number.isFinite(v)));
  switch (field) {
    case 'weightLbs': return notches({ start: 0, end: Math.max(60, Math.ceil((top * 1.6 + 20) / 10) * 10), step: WEIGHT_NOTCH, include: used });
    case 'levelNumber': return notches({ start: 1, end: 5, step: 1 });
    case 'reps': return notches({ start: 1, end: Math.max(30, Math.ceil(top * 2)), step: 1, include: used });
    case 'distanceM': return notches({ start: 5, end: Math.max(200, Math.ceil(top * 2 / 5) * 5), step: 5, include: used });
    default: throw new RangeError(`no dial for "${field}"`);
  }
}

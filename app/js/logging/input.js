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

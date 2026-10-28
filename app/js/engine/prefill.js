// Per-set pre-fill (spec 5.2, v1.21): each set opens at what was lifted in that set last time. Pure.
//
// A pre-fill list holds one value per set number, from set 1 up to the highest set logged last time (index 0 is set 1).

const isValue = (x) => x !== null && x !== undefined;

// One value per set number from logged sets (sorted by set number): a set number that was not logged (skipped, or a
// shorter session) takes the value of the set before it, and leading gaps take the first logged value. If a set number
// was logged twice (another device), the later one wins. null when there are no sets.
export function valuesBySet(sets, pick) {
  const byNumber = new Map();
  for (const set of sets) byNumber.set(set.setNumber, pick(set));
  if (byNumber.size === 0) return null;
  const highest = Math.max(...byNumber.keys());
  const firstLogged = byNumber.get(Math.min(...byNumber.keys()));
  const out = [];
  for (let n = 1; n <= highest; n++) out.push(byNumber.has(n) ? byNumber.get(n) : out[n - 2] ?? firstLogged);
  return out;
}

// The value for set `setNumber` (1-based): that set's own entry, else the nearest earlier one (a set beyond what was
// logged last time follows the set before it), else `fallback`. `values` may be null or missing.
export function valueAt(values, setNumber, fallback = null) {
  if (Array.isArray(values)) {
    for (let i = Math.min(setNumber, values.length) - 1; i >= 0; i--) if (isValue(values[i])) return values[i];
  }
  return fallback;
}

// The values for the `count` sets of today's plan, for showing as text ("25 / 30 / 35"). Without a plan (count null) the list as it is.
export function valuesForPlan(values, count, fallback = null) {
  if (!Array.isArray(values)) return null;
  return Number.isInteger(count) && count > 0 ? Array.from({ length: count }, (_, i) => valueAt(values, i + 1, fallback)) : values;
}

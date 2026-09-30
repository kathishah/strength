import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, parseDistance, parseNumber, parseReps, parseWeight, stepValue } from '../app/js/logging/index.js';

describe('typed numbers', () => {
  test('plain numbers parse; trailing dot is fine while typing', () => {
    assert.equal(parseWeight('25'), 25);
    assert.equal(parseWeight(' 22.5 '), 22.5);
    assert.equal(parseWeight('22.'), 22);
    assert.equal(parseWeight('0'), 0);
  });

  test('anything else is null, never NaN or a guess', () => {
    for (const bad of ['', ' ', 'abc', '-3', '1e3', '12 lbs', '1,5', '.5', '1.2.3', null, undefined, 20]) {
      assert.equal(parseWeight(bad), null, JSON.stringify(bad));
    }
  });

  test('ranges match the server: weight 0-1000, reps 0-500 whole, distance 0-10000', () => {
    assert.equal(parseWeight('1000'), 1000);
    assert.equal(parseWeight('1001'), null);
    assert.equal(parseReps('500'), 500);
    assert.equal(parseReps('501'), null);
    assert.equal(parseReps('8.5'), null);
    assert.equal(parseDistance('40'), 40);
    assert.equal(parseDistance('10001'), null);
    assert.equal(parseNumber('5', { min: 6 }), null);
  });

  test('formatNumber round-trips what parse accepts', () => {
    for (const n of [0, 20, 22.5, 1000]) assert.equal(parseWeight(formatNumber(n)), n);
    assert.equal(formatNumber(null), '');
    assert.equal(formatNumber(undefined), '');
  });
});

describe('stepValue', () => {
  test('steps by the increment, stays inside the range, no float drift', () => {
    assert.equal(stepValue(20, 2.5), 22.5);
    assert.equal(stepValue(0.1, 0.2, { max: 10 }), 0.3);
    assert.equal(stepValue(1, -2.5), 0);
    assert.equal(stepValue(999, 5, { max: 1000 }), 1000);
    assert.equal(stepValue(3, 1, { max: 5 }), 4);
    assert.equal(stepValue(5, 1, { min: 1, max: 5 }), 5);
    assert.equal(stepValue(1, -1, { min: 1, max: 5 }), 1);
  });

  test('an empty box counts as 0, or jumps to the target when it has one (reps start at the target)', () => {
    assert.equal(stepValue(null, 2.5), 2.5);
    assert.equal(stepValue(null, -2.5), 0);
    assert.equal(stepValue(null, 1, { emptyStartsAt: 8 }), 8);
    assert.equal(stepValue(null, -1, { emptyStartsAt: 8 }), 8);
    assert.equal(stepValue(undefined, 1, { emptyStartsAt: null }), 1);
  });
});

import { WEIGHT_NOTCH, dialNotches, notches } from '../app/js/logging/index.js';
describe('barrel dial notches', () => {
  test('a range in steps, rounded, with extras included and sorted', () => {
    assert.deepEqual(notches({ start: 0, end: 10, step: 2.5 }), [0, 2.5, 5, 7.5, 10]);
    assert.deepEqual(notches({ start: 0, end: 5, step: 2.5, include: [3, 2.5, null, NaN] }), [0, 2.5, 3, 5]);
    assert.equal(notches({ start: 0, end: 1, step: 0.1 }).length, 11, 'no float drift');
  });

  test('weights turn in 2.5 lb notches from 0, and the range grows with what the sets hold', () => {
    const w = dialNotches('weightLbs', [20, 20]);
    assert.equal(WEIGHT_NOTCH, 2.5);
    assert.deepEqual(w.slice(0, 4), [0, 2.5, 5, 7.5]);
    assert.ok(w.includes(22.5) && w.includes(60) && w.at(-1) >= 60);
    const press = dialNotches('weightLbs', [130]);
    assert.ok(press.at(-1) >= 228, `leg press range reaches ${press.at(-1)}`);
    assert.ok(dialNotches('weightLbs', [21]).includes(21), 'a weight logged off the grid can still be shown');
  });

  test('levels are 1 to 5, reps start at 1, carries step by 5 m', () => {
    assert.deepEqual(dialNotches('levelNumber'), [1, 2, 3, 4, 5]);
    const reps = dialNotches('reps', [8]);
    assert.deepEqual([reps[0], reps[1], reps.at(-1)], [1, 2, 30]);
    assert.ok(dialNotches('reps', [40]).at(-1) >= 80);
    const d = dialNotches('distanceM', [40]);
    assert.deepEqual([d[0], d[1], d.includes(40)], [5, 10, true]);
    assert.throws(() => dialNotches('rir'), RangeError);
  });
});

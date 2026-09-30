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

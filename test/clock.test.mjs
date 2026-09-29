// The hybrid logical clock (app/js/ids.js): monotonic, and pulled forward by ts it has seen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../app/js/ids.js';
import { compareTs, tsMs } from '../app/js/time.js';

const at = (iso) => Date.parse(iso);
const T = at('2026-09-29T19:30:00.000Z');

describe('clock.next', () => {
  test('is strictly increasing when the wall clock stalls or steps back', () => {
    const clock = createClock();
    const seq = [T, T, T, T - 5000, T + 1].map((now) => clock.next('d_1', now));
    for (let i = 1; i < seq.length; i++) assert.equal(compareTs(seq[i - 1], seq[i]), -1, `${seq[i - 1]} < ${seq[i]}`);
  });

  test('rolls into the next millisecond after 9999 events in one', () => {
    const clock = createClock();
    let prev = clock.next('d_1', T);
    for (let i = 0; i < 10_002; i++) {
      const next = clock.next('d_1', T);
      assert.equal(compareTs(prev, next), -1);
      assert.match(next, /-\d{4}-d_1$/);
      prev = next;
    }
  });

  test('writes Pacific offsets', () => {
    assert.match(createClock().next('d_1', T), /^2026-09-29T12:30:00\.000-07:00-0000-d_1$/);
  });
});

describe('clock.observe', () => {
  test('a device whose clock is 10 minutes slow still sorts after what it has read', () => {
    const fast = createClock();
    const slow = createClock();
    const theirs = fast.next('d_fast', T);
    const slowNow = T - 10 * 60_000;
    assert.equal(compareTs(slow.next('d_slow', slowNow), theirs), -1, 'without observing, it would sort before');

    slow.observe(theirs, slowNow);
    const mine = slow.next('d_slow', slowNow);
    assert.equal(compareTs(theirs, mine), -1);
    assert.equal(tsMs(mine), tsMs(theirs), 'same millisecond, one counter step later');
  });

  test('keeps the counter ahead of an observed one in the same millisecond', () => {
    const clock = createClock();
    clock.observe('2026-09-29T12:30:00.000-07:00-0007-d_other', T);
    assert.equal(clock.next('d_me', T), '2026-09-29T12:30:00.000-07:00-0008-d_me');
  });

  test('observing older or equal ts changes nothing', () => {
    const clock = createClock();
    const first = clock.next('d_me', T);
    clock.observe('2026-09-29T12:29:59.000-07:00-0000-d_other', T);
    assert.equal(compareTs(first, clock.next('d_me', T)), -1);
    assert.match(clock.next('d_me', T), /-0002-d_me$/);
  });

  test('ignores a ts more than a day ahead (the server would refuse it) and malformed ones', () => {
    const clock = createClock();
    clock.observe('2026-10-01T12:30:00.001-07:00-0000-d_other', T); // just over 24 h ahead
    clock.observe('nope', T);
    assert.equal(clock.next('d_me', T), '2026-09-29T12:30:00.000-07:00-0000-d_me');
    clock.observe('2026-09-30T12:30:00.000-07:00-0000-d_other', T); // exactly 24 h ahead: accepted
    assert.match(clock.next('d_me', T), /^2026-09-30T12:30:00\.000-07:00-0001-d_me$/);
  });

  test('a counter with letters (allowed by the server) counts as zero', () => {
    const clock = createClock();
    clock.observe('2026-09-29T12:30:00.000-07:00-00a1-d_other', T);
    assert.equal(clock.next('d_me', T), '2026-09-29T12:30:00.000-07:00-0001-d_me');
  });
});

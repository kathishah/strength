import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pacificIso, pacificMonth, TIME_ZONE } from '../lambda/events/time.mjs';
import * as app from '../app/js/time.js';
import { pacificIso as appPacificIso, tsMs } from '../app/js/time.js';
import { compareTs, parseInstant, parseTs, validateEvent } from '../lambda/events/registry.mjs';
import { makeEvent } from '../test-support/util.mjs';

const at = (iso) => Date.parse(iso);

describe('Pacific formatting', () => {
  test('summer is PDT (-07:00), winter is PST (-08:00)', () => {
    assert.equal(TIME_ZONE, 'America/Los_Angeles');
    assert.equal(pacificIso(at('2026-09-29T19:30:00.123Z')), '2026-09-29T12:30:00.123-07:00');
    assert.equal(pacificIso(at('2026-12-15T08:00:00.000Z')), '2026-12-15T00:00:00.000-08:00');
  });

  test('spring forward (2026-03-08 10:00Z) and fall back (2026-11-01 09:00Z)', () => {
    assert.equal(pacificIso(at('2026-03-08T09:59:59.999Z')), '2026-03-08T01:59:59.999-08:00');
    assert.equal(pacificIso(at('2026-03-08T10:00:00.000Z')), '2026-03-08T03:00:00.000-07:00');
    assert.equal(pacificIso(at('2026-11-01T08:59:59.999Z')), '2026-11-01T01:59:59.999-07:00');
    assert.equal(pacificIso(at('2026-11-01T09:00:00.000Z')), '2026-11-01T01:00:00.000-08:00');
  });

  test('midnight is a whole hour: 00:00:00.000, never 24:00', () => {
    assert.equal(pacificIso(at('2026-10-01T07:00:00.000Z')), '2026-10-01T00:00:00.000-07:00');
  });

  test('month boundaries are Pacific midnight, not UTC midnight', () => {
    // 2026-10-01 00:00 PDT = 07:00Z
    assert.equal(pacificMonth(at('2026-10-01T06:59:59.999Z')), '2026-09');
    assert.equal(pacificMonth(at('2026-10-01T07:00:00.000Z')), '2026-10');
    // 2026-12-01 00:00 PST = 08:00Z (an hour later than in summer)
    assert.equal(pacificMonth(at('2026-12-01T07:59:59.999Z')), '2026-11');
    assert.equal(pacificMonth(at('2026-12-01T08:00:00.000Z')), '2026-12');
    // year boundary: 2027-01-01 00:00 PST = 08:00Z
    assert.equal(pacificMonth(at('2027-01-01T07:59:59.999Z')), '2026-12');
    assert.equal(pacificMonth(at('2027-01-01T08:00:00.000Z')), '2027-01');
  });

  test('the app formatter matches the server formatter across a year', () => {
    for (let ms = at('2026-01-01T00:00:00Z'); ms < at('2027-01-01T00:00:00Z'); ms += 37 * 60 * 1000 + 123) {
      assert.equal(appPacificIso(ms), pacificIso(ms));
    }
  });

  test('every formatted value parses back to the same instant', () => {
    for (const iso of ['2026-03-08T10:00:00.000Z', '2026-11-01T08:59:59.999Z', '2026-11-01T09:00:00.001Z', '2026-07-04T12:34:56.789Z']) {
      assert.equal(parseInstant(pacificIso(at(iso))), at(iso));
    }
  });
});

describe('timestamps with offsets', () => {
  test('parseInstant accepts Z and offsets, rejects impossible values', () => {
    assert.equal(parseInstant('2026-09-29T12:30:00.000-07:00'), at('2026-09-29T19:30:00.000Z'));
    assert.equal(parseInstant('2026-09-29T19:30:00Z'), at('2026-09-29T19:30:00.000Z'));
    for (const bad of ['2026-02-30T00:00:00.000-08:00', '2026-09-29T25:00:00.000Z', '2026-09-29T12:60:00Z', '2026-09-29T12:00:60Z', '2026-09-29T12:00:00+24:00', '2026-09-29T12:00:00', 'nope', 5]) {
      assert.ok(Number.isNaN(parseInstant(bad)), String(bad));
    }
  });

  test('the server accepts a Pacific-offset ts and still enforces the 1-day-ahead limit', () => {
    const now = at('2026-09-29T19:30:00.000Z');
    const ok = makeEvent(1, { ts: '2026-09-30T12:30:00.000-07:00-0001-d_7f3a' }); // exactly +24 h
    assert.deepEqual(validateEvent(ok, now), []);
    const late = makeEvent(1, { ts: '2026-09-30T12:30:00.001-07:00-0001-d_7f3a' });
    assert.deepEqual(validateEvent(late, now).map((e) => e.field), ['ts']);
  });

  test('session times may carry offsets too', () => {
    const ev = makeEvent(2, { ts: '2026-09-28T18:05:00.000-07:00-0001-d_7f3a', type: 'session.finished', entityId: 'sess_1', payload: { finishedAt: '2026-09-28T18:05:00.000-07:00' } });
    assert.deepEqual(validateEvent(ev, at('2026-09-29T19:30:00Z')), []);
  });

  test('compareTs orders by instant even when offsets differ (fall-back hour)', () => {
    const pdt = '2026-11-01T01:30:00.000-07:00-0000-d_1'; // 08:30Z
    const pst = '2026-11-01T01:15:00.000-08:00-0000-d_1'; // 09:15Z, later although the string sorts earlier
    assert.ok(pst < pdt, 'plain string order is wrong here');
    assert.equal(compareTs(pdt, pst), -1);
    assert.equal(compareTs(pst, pdt), 1);
    assert.equal(tsMs(pst) - tsMs(pdt), 45 * 60 * 1000);
  });

  test('compareTs breaks ties by counter, then device', () => {
    const t = '2026-09-29T12:30:00.000-07:00';
    assert.equal(compareTs(`${t}-0002-d_a`, `${t}-0010-d_a`), -1);
    assert.equal(compareTs(`${t}-0001-d_a`, `${t}-0001-d_b`), -1);
    assert.equal(compareTs(`${t}-0001-d_a`, `${t}-0001-d_a`), 0);
    assert.equal(parseTs(`${t}-0001-d_a`).deviceId, 'd_a');
  });
});

describe('the app parses and orders ts exactly like the server', () => {
  const samples = [
    '2026-09-29T12:30:00.000-07:00-0000-d_a',
    '2026-09-29T12:30:00.000-07:00-0001-d_a',
    '2026-09-29T12:30:00.000-07:00-0001-d_b',
    '2026-09-29T12:30:00.000-07:00-0010-d_a',
    '2026-09-29T19:30:00.000Z-0000-d_a', // the same instant written with Z
    '2026-11-01T01:30:00.000-07:00-0000-d_1', // fall-back hour, PDT
    '2026-11-01T01:15:00.000-08:00-0000-d_1', // later instant, earlier string
    '2026-03-08T01:59:59.999-08:00-0000-d_1',
    '2026-03-08T03:00:00.000-07:00-0000-d_1',
    '2026-09-29T12:30:00.000-07:00-00a1-d_a', // counter with a letter (accepted by the server)
    '2026-09-29T12:30:00.000-07:00-000000001-d_a', // 9 chars: too long
    '2026-02-30T00:00:00.000-08:00-0000-d_a', // impossible date
    '2026-09-29T12:30:00-07:00-0000-d_a', // no milliseconds in the hybrid clock
    'nope',
    '',
  ];

  test('parseTs agrees on every sample, valid or not', () => {
    for (const ts of samples) assert.deepEqual(app.parseTs(ts), parseTs(ts), ts);
  });

  test('compareTs agrees on every valid pair, in both directions', () => {
    const valid = samples.filter((ts) => parseTs(ts));
    assert.ok(valid.length >= 9);
    for (const a of valid) for (const b of valid) assert.equal(app.compareTs(a, b), compareTs(a, b), `${a} vs ${b}`);
  });

  test('parseInstant agrees, including impossible values', () => {
    for (const s of ['2026-09-29T12:30:00.123-07:00', '2026-09-29T19:30:00Z', '2026-02-30T00:00:00.000-08:00', '2026-09-29T12:00:00', '2026-09-29T12:00:00+24:00', 7]) {
      const a = app.parseInstant(s);
      const b = parseInstant(s);
      assert.ok(Object.is(a, b), String(s));
    }
  });

  test('tsMs is NaN for a malformed ts', () => {
    assert.ok(Number.isNaN(tsMs('nope')));
    assert.ok(Number.isNaN(tsMs('2026-02-30T00:00:00.000-08:00-0000-d_a')));
  });
});

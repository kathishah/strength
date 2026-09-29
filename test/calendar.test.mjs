// Program week, phase and deload weeks (spec 5.1, 5.8; plan section 14 decisions 2 and 8).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarFor, deloadWeeks, isDeloadWeek, nextDeloadWeek, phaseOf, postponement, programWeek, programWeekInfo, targetRir,
} from '../app/js/engine/calendar.js';
import { replay } from '../app/js/store/replay.js';
import { makeEvent } from '../test-support/util.mjs';

const START = '2026-09-28'; // a Monday, program week 1

describe('program week', () => {
  test('the start day is week 1; each seventh day starts the next week', () => {
    assert.equal(programWeek(START, '2026-09-28'), 1);
    assert.equal(programWeek(START, '2026-10-04'), 1);
    assert.equal(programWeek(START, '2026-10-05'), 2);
    assert.equal(programWeek(START, '2026-10-26'), 5);
    assert.equal(programWeek(START, '2026-12-07'), 11);
  });

  test('daylight saving does not move a week (both changes fall inside the first 40 weeks)', () => {
    // 2026-11-01 is the fall-back Sunday: day 34 -> still week 5; Monday 11-02 is week 6.
    assert.equal(programWeek(START, '2026-11-01'), 5);
    assert.equal(programWeek(START, '2026-11-02'), 6);
    // 2027-03-14 is the spring-forward Sunday: 167 days after the start -> week 24; Monday 03-15 is week 25.
    assert.equal(programWeek(START, '2027-03-14'), 24);
    assert.equal(programWeek(START, '2027-03-15'), 25);
  });

  test('a start date that is not a Monday still counts from itself', () => {
    assert.equal(programWeek('2026-10-01', '2026-10-07'), 1);
    assert.equal(programWeek('2026-10-01', '2026-10-08'), 2);
  });

  test('before the start date the week is 1 and beforeStart says so', () => {
    assert.deepEqual(programWeekInfo(START, '2026-09-27'), { week: 1, beforeStart: true });
    assert.deepEqual(programWeekInfo(START, '2026-08-01'), { week: 1, beforeStart: true });
    assert.deepEqual(programWeekInfo(START, START), { week: 1, beforeStart: false });
  });

  test('a bad date is an error, not a wrong week', () => {
    assert.throws(() => programWeek(START, '2026-9-28'), RangeError);
    assert.throws(() => programWeek('nope', '2026-09-28'), RangeError);
  });

  test('phase 1 is weeks 1-4, phase 2 from week 5', () => {
    assert.deepEqual([1, 4, 5, 11].map(phaseOf), [1, 1, 2, 2]);
  });

  test('target RIR: phase 1 about 3, phase 2 1-2, deload 3-4', () => {
    assert.deepEqual(targetRir(1, false), { min: 3, max: 3 });
    assert.deepEqual(targetRir(2, false), { min: 1, max: 2 });
    assert.deepEqual(targetRir(2, true), { min: 3, max: 4 });
  });
});

describe('deload weeks', () => {
  test('scheduled: 11, 18, 25, ... and nothing before week 11', () => {
    assert.deepEqual(deloadWeeks({}, 40), [11, 18, 25, 32, 39]);
    for (const w of [1, 5, 10, 12, 17, 19]) assert.equal(isDeloadWeek({}, w), false, `week ${w}`);
    for (const w of [11, 18, 25]) assert.equal(isDeloadWeek({}, w), true, `week ${w}`);
  });

  test('a manual deload restarts the schedule: week 9 manual -> 16, 23, not 11 or 18', () => {
    const deloads = { 9: { programWeek: 9, source: 'manual' } };
    assert.deepEqual(deloadWeeks(deloads, 30), [9, 16, 23, 30]);
    assert.equal(nextDeloadWeek(deloads, 9), 16);
    assert.equal(isDeloadWeek(deloads, 11), false);
  });

  test('a manual deload in phase 1 works too', () => {
    assert.deepEqual(deloadWeeks({ 3: { programWeek: 3, source: 'manual' } }, 20), [3, 10, 17]);
  });

  test('a manual deload in the scheduled week changes nothing', () => {
    assert.deepEqual(deloadWeeks({ 11: { programWeek: 11, source: 'manual' } }, 30), [11, 18, 25]);
  });

  test('a manual deload after a scheduled one restarts from it', () => {
    assert.deepEqual(deloadWeeks({ 14: { programWeek: 14, source: 'manual' } }, 30), [11, 14, 21, 28]);
  });

  test('postponing week 11 moves it to 12 and the next to 19', () => {
    const deloads = { 12: { programWeek: 12, postponedFromWeek: 11 } };
    assert.deepEqual(deloadWeeks(deloads, 30), [12, 19, 26]);
    assert.equal(isDeloadWeek(deloads, 11), false);
    assert.equal(nextDeloadWeek(deloads, 10), 12);
    assert.equal(nextDeloadWeek(deloads, 12), 19);
  });

  test('a postponement that is out of date (the schedule moved on) is ignored', () => {
    const deloads = {
      9: { programWeek: 9, source: 'manual' },
      12: { programWeek: 12, postponedFromWeek: 11 },
    };
    assert.deepEqual(deloadWeeks(deloads, 24), [9, 16, 23]);
  });

  test('a postponement to a week before the original is ignored', () => {
    assert.deepEqual(deloadWeeks({ 10: { programWeek: 10, postponedFromWeek: 11 } }, 20), [11, 18]);
  });

  test('a scheduled deload written as an event has the same effect as the computed one', () => {
    assert.deepEqual(deloadWeeks({ 11: { programWeek: 11, source: 'scheduled' } }, 30), [11, 18, 25]);
  });

  test('postponement is offered once: only for a scheduled deload of this week', () => {
    assert.deepEqual(postponement({}, 11), { programWeek: 12, postponedFromWeek: 11 });
    assert.equal(postponement({}, 10), null, 'not a deload week');
    assert.equal(postponement({ 9: { programWeek: 9, source: 'manual' } }, 9), null, 'a manual deload');
    const moved = { 12: { programWeek: 12, postponedFromWeek: 11 } };
    assert.equal(postponement(moved, 12), null, 'already postponed once');
    assert.equal(postponement(moved, 11), null, 'the original week is no longer a deload');
  });

  test('records from replay are read as they are (deload.started and deload.postponed events)', () => {
    const state = replay([
      makeEvent(1, { type: 'deload.started', entityId: 'deload_9', payload: { programWeek: 9, source: 'manual' } }),
      makeEvent(2, { type: 'deload.postponed', entityId: 'deload_17', payload: { programWeek: 17, postponedFromWeek: 16 } }),
    ]);
    assert.deepEqual(deloadWeeks(state.deloads, 30), [9, 17, 24]);
  });
});

describe('calendarFor', () => {
  const settings = { programStartDate: START };

  test('week 11: deload, phase 2, banner state, RIR 3-4, next deload 18', () => {
    const c = calendarFor({ settings, deloads: {}, today: '2026-12-07' });
    assert.deepEqual(
      { week: c.programWeek, phase: c.phase, isDeload: c.isDeload, next: c.nextDeloadWeek, post: c.canPostpone },
      { week: 11, phase: 2, isDeload: true, next: 18, post: true },
    );
    assert.deepEqual(c.targetRir, { min: 3, max: 4 });
  });

  test('week 2 is phase 1 and not a deload; the next deload is week 11', () => {
    const c = calendarFor({ settings, deloads: {}, today: '2026-10-06' });
    assert.deepEqual([c.programWeek, c.phase, c.isDeload, c.nextDeloadWeek, c.canPostpone], [2, 1, false, 11, false]);
  });

  test('without a programStartDate setting the spec initial value is used', () => {
    assert.equal(calendarFor({ settings: {}, deloads: {}, today: '2026-10-06' }).programWeek, 2);
  });
});

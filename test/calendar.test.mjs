// Program week and phase (spec 5.1; plan section 14 decision 8). Deload weeks were removed in v1.13.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calendarFor, phaseOf, programWeek, programWeekInfo, targetRir } from '../app/js/engine/calendar.js';

const START = '2026-09-28'; // a Monday, program week 1

describe('program week', () => {
  test('the start day is week 1; each seventh day starts the next week', () => {
    assert.equal(programWeek(START, '2026-09-28'), 1);
    assert.equal(programWeek(START, '2026-10-04'), 1);
    assert.equal(programWeek(START, '2026-10-05'), 2);
    assert.equal(programWeek(START, '2026-10-26'), 5);
    assert.equal(programWeek(START, '2026-12-07'), 11);
  });

  test('daylight saving does not move a week', () => {
    assert.equal(programWeek(START, '2026-11-01'), 5); // fall-back Sunday
    assert.equal(programWeek(START, '2026-11-02'), 6);
    assert.equal(programWeek(START, '2027-03-14'), 24); // spring-forward Sunday
    assert.equal(programWeek(START, '2027-03-15'), 25);
  });

  test('a start date that is not a Monday still counts from itself', () => {
    assert.equal(programWeek('2026-10-01', '2026-10-07'), 1);
    assert.equal(programWeek('2026-10-01', '2026-10-08'), 2);
  });

  test('before the start date the week is 1 and beforeStart says so', () => {
    assert.deepEqual(programWeekInfo(START, '2026-09-27'), { week: 1, beforeStart: true });
    assert.deepEqual(programWeekInfo(START, START), { week: 1, beforeStart: false });
  });

  test('a bad date is an error, not a wrong week', () => {
    assert.throws(() => programWeek(START, '2026-9-28'), RangeError);
    assert.throws(() => programWeek('nope', '2026-09-28'), RangeError);
  });

  test('phase 1 is weeks 1-4, phase 2 from week 5; RIR 3, then 1-2', () => {
    assert.deepEqual([1, 4, 5, 11].map(phaseOf), [1, 1, 2, 2]);
    assert.deepEqual(targetRir(1), { min: 3, max: 3 });
    assert.deepEqual(targetRir(2), { min: 1, max: 2 });
  });
});

describe('calendarFor', () => {
  test('uses the programStartDate setting, else the spec initial value', () => {
    assert.equal(calendarFor({ settings: { programStartDate: '2026-10-05' }, today: '2026-10-06' }).programWeek, 1);
    const c = calendarFor({ settings: {}, today: '2026-10-06' });
    assert.deepEqual([c.programWeek, c.phase, c.beforeStart, c.programStartDate], [2, 1, false, '2026-09-28']);
  });

  test('there are no deload weeks: week 11 is an ordinary Phase 2 week', () => {
    const c = calendarFor({ settings: {}, today: '2026-12-07' });
    assert.deepEqual([c.programWeek, c.phase, c.targetRir], [11, 2, { min: 1, max: 2 }]);
    assert.equal('isDeload' in c, false);
  });
});

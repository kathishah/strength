// Rotation, the no-consecutive-days warning and recovery days (spec 4.1, 6.2), over real replayed logs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { consecutiveDayWarning, finishedSessions, inProgressSessions, isRecoveryDay, listSessions, nextTemplate } from '../app/js/logging/index.js';
import { lift, makeLog, pacificMs } from '../test-support/engine-log.mjs';

const oneSet = [lift('goblet-squat', 20, [10])];

describe('nextTemplate: A, B, C by the last completed workout', () => {
  test('A with no history', () => assert.equal(nextTemplate(makeLog().state()), 'A'));

  test('successor of the last finished workout, wrapping C to A', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet);
    assert.equal(nextTemplate(log.state()), 'B');
    log.session('2026-09-30', 'B', oneSet);
    assert.equal(nextTemplate(log.state()), 'C');
    log.session('2026-10-02', 'C', oneSet);
    assert.equal(nextTemplate(log.state()), 'A');
  });

  test('by workout, not by weekday: a skipped Friday leaves C next on Monday', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet);
    log.session('2026-09-30', 'B', oneSet);
    assert.equal(nextTemplate(log.state()), 'C');
  });

  test('an unfinished session does not count', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet);
    log.session('2026-09-30', 'B', oneSet, { finished: false });
    assert.equal(nextTemplate(log.state()), 'B');
  });

  test('a deleted session does not count', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet);
    log.session('2026-09-30', 'B', oneSet);
    const state = log.state();
    delete state.sessions['sess_2026-09-30_B'];
    assert.equal(nextTemplate(state), 'B');
  });

  test('order is by instant: across the fall-back hour a string sort would pick the wrong last workout', () => {
    const log = makeLog();
    // 01:30 PDT is earlier than 01:15 PST the same night, although "01:15" < "01:30" as text.
    log.session('2026-11-01', 'A', oneSet, { startMs: Date.parse('2026-11-01T01:30:00-07:00'), id: 'first' });
    log.session('2026-11-01', 'B', oneSet, { startMs: Date.parse('2026-11-01T01:15:00-08:00'), id: 'second' });
    assert.equal(nextTemplate(log.state()), 'C');
  });
});

describe('consecutiveDayWarning', () => {
  test('a workout finished yesterday warns; two days ago does not', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet);
    assert.deepEqual(consecutiveDayWarning(log.state(), '2026-09-29'), { kind: 'yesterday', templateCode: 'A', date: '2026-09-28' });
    assert.equal(consecutiveDayWarning(log.state(), '2026-09-30'), null);
  });

  test('yesterday is the Pacific day: a 9 pm workout is yesterday next morning although UTC is already the next day', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet, { time: '21:00' }); // 2026-09-29T04:00Z
    assert.equal(consecutiveDayWarning(log.state(), '2026-09-29')?.date, '2026-09-28');
    assert.equal(consecutiveDayWarning(log.state(), '2026-09-28')?.kind, 'today');
  });

  test('a workout finished earlier today warns too (spec question 6); today wins over yesterday', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet);
    log.session('2026-09-29', 'B', oneSet, { time: '07:00' });
    assert.equal(consecutiveDayWarning(log.state(), '2026-09-29').kind, 'today');
  });

  test('an unfinished session is not a previous gym session', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet, { finished: false });
    assert.equal(consecutiveDayWarning(log.state(), '2026-09-29'), null);
  });

  test('month and year boundaries', () => {
    const log = makeLog();
    log.session('2026-12-31', 'A', oneSet);
    assert.equal(consecutiveDayWarning(log.state(), '2027-01-01')?.kind, 'yesterday');
  });
});

describe('recovery days', () => {
  test('Tuesday and Thursday by default', () => {
    const settings = {};
    const week = ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];
    assert.deepEqual(week.map((d) => isRecoveryDay(settings, d)), [false, false, true, false, true, false, false]);
  });

  test('the recoveryDays setting wins (0 = Sunday); a malformed setting falls back to the default', () => {
    assert.equal(isRecoveryDay({ recoveryDays: [0, 6] }, '2026-09-27'), true);
    assert.equal(isRecoveryDay({ recoveryDays: [0, 6] }, '2026-09-29'), false);
    assert.equal(isRecoveryDay({ recoveryDays: [] }, '2026-09-29'), false);
    assert.equal(isRecoveryDay({ recoveryDays: 'tue' }, '2026-09-29'), true);
  });
});

describe('listing sessions', () => {
  test('in progress: newest first, with the number of working sets logged', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet, { finished: false });
    log.session('2026-09-30', 'B', [lift('leg-press', 50, [10, 10])], { finished: false });
    const open = inProgressSessions(log.state());
    assert.deepEqual(open.map((s) => [s.templateCode, s.loggedSets]), [['B', 2], ['A', 1]]);
    assert.equal(finishedSessions(log.state()).length, 0);
  });

  test('sessions without a usable start time or template are left out', () => {
    const state = makeLog().state();
    state.sessions.x = { id: 'x', templateCode: 'A', startedAt: 'yesterday' };
    state.sessions.y = { id: 'y', templateCode: 'Z', startedAt: '2026-09-28T11:00:00.000-07:00' };
    assert.deepEqual(listSessions(state), []);
  });

  test('the date is the Pacific date of startedAt', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', oneSet, { startMs: pacificMs('2026-09-28', '23:30') });
    assert.equal(listSessions(log.state())[0].date, '2026-09-28');
  });
});

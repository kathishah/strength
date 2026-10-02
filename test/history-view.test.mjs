// The History screens' view models (plan section 15e): by exercise, exercise detail, by date. Built from real replayed logs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dateGroupLabel, exerciseDetail, historyByDate, historyByExercise } from '../app/js/logging/index.js';
import { atLevel, carry, lift, makeLog } from '../test-support/engine-log.mjs';

const A = (log, date, sets, extra = {}) => log.session(date, 'A', sets, { id: `sess_${date}`, ...extra });

describe('history by exercise', () => {
  test('lists workouts A, B, C with each slot\'s exercise, its last session, and "Not logged yet"', () => {
    const log = makeLog();
    A(log, '2026-09-28', [lift('goblet-squat', 25, [10, 10, 9]), lift('db-bench-press', 22.5, [8, 8, 8])]);
    const h = historyByExercise(log.state(), '2026-09-30');
    assert.deepEqual(h.map((g) => g.templateCode), ['A', 'B', 'C']);
    assert.deepEqual(h[0].rows.map((r) => r.name), ['Goblet Squat', 'Dumbbell Bench Press', 'Dumbbell Romanian Deadlift', 'Chest-Supported Row', 'Dead Bug', 'Face Pull']);
    assert.equal(h[0].rows[0].lastText, 'Mon, Sep 28 · 25 lbs × 10, 10, 9');
    assert.equal(h[0].rows[1].lastText, 'Mon, Sep 28 · 22.5 lbs × 8, 8, 8');
    assert.equal(h[0].rows[2].lastText, 'Not logged yet');
    assert.ok(h[1].rows.every((r) => r.lastText === 'Not logged yet'));
  });

  test('a swap shows the swapped-in exercise; one that was logged before the swap is still listed under its workout', () => {
    const log = makeLog();
    A(log, '2026-09-28', [lift('goblet-squat', 25, [10, 10, 10])]);
    log.swap('A', 1, 'box-squat');
    const rows = historyByExercise(log.state(), '2026-09-30')[0].rows;
    assert.equal(rows[0].exerciseId, 'box-squat');
    assert.equal(rows[0].lastText, 'Not logged yet');
    const extra = rows.find((r) => r.exerciseId === 'goblet-squat');
    assert.ok(extra, 'goblet squat is still there');
    assert.equal(extra.lastText, 'Mon, Sep 28 · 25 lbs × 10, 10, 10');
    assert.equal(rows.length, 7);
  });

  test('due: a scheduled increase is pending once the weight has sat for the interval', () => {
    const log = makeLog();
    A(log, '2026-09-28', [lift('goblet-squat', 20, [10, 10, 10])]);
    assert.equal(historyByExercise(log.state(), '2026-10-10')[0].rows[0].due, false);
    assert.equal(historyByExercise(log.state(), '2026-10-19')[0].rows[0].due, true);
  });

  test('unfinished sessions do not count', () => {
    const log = makeLog();
    A(log, '2026-09-28', [lift('goblet-squat', 25, [10])], { finished: false });
    assert.equal(historyByExercise(log.state(), '2026-09-30')[0].rows[0].lastText, 'Not logged yet');
  });
});

describe('exercise detail', () => {
  const squats = () => {
    const log = makeLog();
    A(log, '2026-09-28', [lift('goblet-squat', 20, [12, 12, 12])]);
    A(log, '2026-10-05', [lift('goblet-squat', 20, [12, 12, 12])]);
    A(log, '2026-10-12', [lift('goblet-squat', 25, [10, 10, 9])]);
    A(log, '2026-10-19', [lift('goblet-squat', 25, [10, 10, 10])]);
    A(log, '2026-10-26', [lift('goblet-squat', 30, [8, 8, 8])]);
    return log.state();
  };

  test('weighted: top set and volume per session, increases marked, the table newest first', () => {
    const d = exerciseDetail(squats(), 'goblet-squat', '2026-10-27');
    assert.equal(d.kind, 'weight');
    assert.deepEqual(d.points.map((p) => [p.date, p.top, p.volume, p.increase]), [
      ['2026-09-28', 20, 720, false], ['2026-10-05', 20, 720, false], ['2026-10-12', 25, 725, true], ['2026-10-19', 25, 750, false], ['2026-10-26', 30, 720, true],
    ]);
    assert.deepEqual(d.rows.map((r) => r.date), ['2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28']);
    assert.deepEqual(d.rows.map((r) => r.text).slice(0, 3), ['30 lbs × 8, 8, 8', '25 lbs × 10, 10, 10', '25 lbs × 10, 10, 9']);
    assert.equal(d.stats.lastIncreaseText, 'Mon, Oct 26');
    assert.equal(d.stats.scheduledText, 'Mon, Nov 16');
    assert.equal(d.name, 'Goblet Squat');
  });

  test('no sessions yet: no points, nothing to mark, the first session starts the timer', () => {
    const d = exerciseDetail(makeLog().state(), 'goblet-squat', '2026-09-28');
    assert.deepEqual([d.points, d.rows, d.stats.lastIncreaseText, d.stats.scheduledText], [[], [], '—', 'After the first session']);
  });

  test('a level exercise charts the level; bodyweight-based exercises have no scheduled increase', () => {
    const log = makeLog();
    log.session('2026-09-30', 'B', [atLevel('pushup', 1, [10, 10, 10])], { id: 'sess_b1' });
    log.session('2026-10-12', 'B', [atLevel('pushup', 2, [8, 8, 7])], { id: 'sess_b2' });
    const d = exerciseDetail(log.state(), 'pushup', '2026-10-13');
    assert.equal(d.kind, 'level');
    assert.deepEqual(d.points.map((p) => [p.top, p.volume, p.increase]), [[1, 30, false], [2, 23, true]]);
    assert.equal(d.rows[0].text, 'level 2 × 8, 8, 7');
    assert.equal(d.stats.scheduledText, 'Not used');
  });

  test('a carry charts distance; a no-weight exercise charts reps', () => {
    const log = makeLog();
    log.session('2026-09-28', 'C', [carry('farmer-carry', 35, [40, 40, 30])], { id: 'sess_c' });
    log.session('2026-09-28', 'A', [lift('dead-bug', 0, [8, 8])], { id: 'sess_a' });
    const c = exerciseDetail(log.state(), 'farmer-carry', '2026-09-29');
    assert.deepEqual([c.kind, c.points[0].top, c.points[0].volume, c.rows[0].text], ['distance', 40, 35 * 110, '35 lbs × 40 m, 40 m, 30 m']);
    const b = exerciseDetail(log.state(), 'dead-bug', '2026-09-29');
    assert.deepEqual([b.kind, b.points[0].top, b.points[0].volume, b.points[0].increase], ['reps', 8, 16, false]);
  });

  test('a set marked not completed and an unfinished session do not count; an unknown exercise is null', () => {
    const log = makeLog();
    A(log, '2026-09-28', [lift('goblet-squat', 25, [10, 10, 10], { completed: false })]);
    A(log, '2026-10-05', [lift('goblet-squat', 30, [10])], { finished: false });
    assert.deepEqual(exerciseDetail(log.state(), 'goblet-squat', '2026-10-06').points, []);
    assert.equal(exerciseDetail(log.state(), 'nope', '2026-10-06'), null);
  });
});

describe('history by date', () => {
  test('groups by week and month, newest first, with done, missing, sets and duration', () => {
    const log = makeLog();
    A(log, '2026-09-28', [lift('goblet-squat', 20, [10, 10, 10])]);
    log.session('2026-10-05', 'B', [lift('leg-press', 50, [10, 10, 10]), atLevel('pushup', 1, [10, 10, 10])], { id: 'sess_b' });
    log.session('2026-10-09', 'C', [lift('trap-bar-deadlift', 95, [8, 8, 8])], { id: 'sess_c' });
    A(log, '2026-10-12', ['goblet-squat', 'db-bench-press', 'db-romanian-deadlift', 'chest-supported-row', 'dead-bug', 'face-pull'].map((id) => lift(id, 10, [10, 10])));
    const g = historyByDate(log.state(), '2026-10-14');
    assert.deepEqual(g.map((x) => [x.label, x.rows.length]), [['This week', 1], ['Last week', 2], ['September', 1]]);
    const monday = g[0].rows[0];
    assert.deepEqual([monday.templateCode, monday.dateText, monday.exercisesDone, monday.exerciseCount, monday.missing, monday.sets], ['A', 'Mon, Oct 12', 6, 6, 0, 12]);
    assert.match(monday.durationText, /^\d+ min$/);
    assert.deepEqual(g[1].rows.map((r) => [r.templateCode, r.missing]), [['C', 4], ['B', 4]]);
    assert.deepEqual(g[2].rows.map((r) => [r.sessionId, r.missing]), [['sess_2026-09-28', 5]]);
  });

  test('open sessions are left out, a finished workout with nothing logged shows everything missing, and there is an empty list', () => {
    const log = makeLog();
    assert.deepEqual(historyByDate(log.state(), '2026-10-14'), []);
    A(log, '2026-10-12', [lift('goblet-squat', 20, [10])], { finished: false });
    assert.deepEqual(historyByDate(log.state(), '2026-10-14'), []);
    log.session('2026-10-13', 'B', [], { id: 'sess_empty' });
    assert.equal(historyByDate(log.state(), '2026-10-14')[0].rows[0].missing, 6);
  });

  test('week and month labels: Monday starts the week, and another year carries its year', () => {
    assert.equal(dateGroupLabel('2026-10-12', '2026-10-18'), 'This week');
    assert.equal(dateGroupLabel('2026-10-11', '2026-10-12'), 'Last week');
    assert.equal(dateGroupLabel('2026-10-05', '2026-10-12'), 'Last week');
    assert.equal(dateGroupLabel('2026-10-04', '2026-10-12'), 'October', 'Sunday belongs to the week before');
    assert.equal(dateGroupLabel('2026-09-28', '2026-10-14'), 'September');
    assert.equal(dateGroupLabel('2025-12-20', '2026-01-05'), 'December 2025');
    assert.equal(dateGroupLabel('2026-10-20', '2026-10-14'), 'This week', 'a date after today is not shown as older');
  });
});

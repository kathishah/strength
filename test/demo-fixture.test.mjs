// The demo's sample history (demo/fixture.js, spec section 3 "Demo design"): made by the real logging actions with a fixed clock and a
// seeded generator. Replaying it must give the outcomes the demo promises, for any day the demo can be opened on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../app/js/store/replay.js';
import { addDays, pacificDate, parseInstant } from '../app/js/time.js';
import { emptyDraft } from '../app/js/logging/draft.js';
import { buildView } from '../app/js/logging/session-view.js';
import { exerciseDetail, finishedSessions, historyByDate, inProgressSessions, nextTemplate } from '../app/js/logging/index.js';
import { RULES } from '../app/js/seed/index.js';
import { validateEvent } from '../lambda/events/registry.mjs';
import { ALTERNATIVE, FIXTURE_DEVICE_ID, SESSION_OFFSETS, UNTICKED, buildFixture, seededRandom } from '../demo/fixture.js';

const TODAY = '2026-10-22';
const fixture = await buildFixture({ today: TODAY });
const state = replay(fixture);

// Days across a year, including both daylight saving changes, a leap day and a year end.
const DAYS = ['2026-01-05', '2026-03-08', '2026-03-09', '2026-06-30', '2026-10-22', '2026-11-01', '2026-11-02', '2026-12-31', '2027-03-14', '2028-02-29'];

describe('the sample history', () => {
  test('12 finished sessions in the A/B/C rotation, none in progress, the last one the day before', () => {
    const done = finishedSessions(state);
    assert.equal(done.length, 12);
    assert.deepEqual(done.map((s) => s.templateCode), 'ABCABCABCABC'.split(''));
    assert.deepEqual(done.map((s) => s.date), SESSION_OFFSETS.map((o) => addDays(TODAY, o)));
    assert.equal(done.at(-1).date, addDays(TODAY, -1));
    assert.equal(done[0].date, addDays(TODAY, -26), 'four weeks back');
    assert.deepEqual(inProgressSessions(state), []);
    assert.equal(Object.keys(state.sessions).length, 12);
    assert.ok(done.every((s) => s.loggedSets > 0));
  });

  test('three sessions a week, every other day: week 4 holds the last three', () => {
    const days = finishedSessions(state).map((s) => s.date);
    for (let week = 0; week < 4; week++) {
      const [a, b, c] = days.slice(week * 3, week * 3 + 3);
      assert.equal(parseInstant(`${b}T12:00:00Z`) - parseInstant(`${a}T12:00:00Z`), 2 * 86_400_000);
      assert.equal(parseInstant(`${c}T12:00:00Z`) - parseInstant(`${b}T12:00:00Z`), 2 * 86_400_000);
    }
  });

  test('today is week 4 of the lifter\'s program, and no weekday is a recovery day', () => {
    assert.equal(state.settings.programStartDate, addDays(TODAY, -26));
    assert.deepEqual(state.settings.recoveryDays, []);
    const view = buildView(state, { templateCode: 'A', date: TODAY }, emptyDraft(null), Date.now());
    assert.equal(view.programWeek, 4);
    assert.equal(view.phase, 1);
  });

  test('every event is one the server would accept, with the fixed fictional device', () => {
    assert.ok(fixture.length > 200);
    for (const ev of fixture) {
      assert.deepEqual(validateEvent(ev, Date.parse(`${TODAY}T23:59:00-07:00`)), [], `${ev.type} ${ev.id}`);
      assert.ok(ev.ts.endsWith(`-${FIXTURE_DEVICE_ID}`), ev.ts);
    }
    assert.equal(new Set(fixture.map((e) => e.id)).size, fixture.length, 'unique ids');
    assert.deepEqual([...new Set(fixture.map((e) => e.type))].sort(), ['session.finished', 'session.notes', 'session.started', 'set.logged', 'setting.changed', 'swap.cleared', 'swap.set']);
  });

  test('at least two exercises have an increase marked on their history chart', () => {
    const withIncrease = Object.keys(RULES)
      .map((id) => exerciseDetail(state, id, TODAY))
      .filter((d) => d.points.some((p) => p.increase));
    assert.ok(withIncrease.length >= 2, `only ${withIncrease.length}`);
    const goblet = exerciseDetail(state, 'goblet-squat', TODAY);
    assert.deepEqual(goblet.points.map((p) => p.top), [20, 20, 20, 25]);
    assert.deepEqual(goblet.points.map((p) => p.increase), [false, false, false, true]);
    assert.equal(goblet.stats.lastIncreaseText, 'Sat, Oct 17');
    const pulldown = exerciseDetail(state, 'lat-pulldown', TODAY);
    assert.deepEqual(pulldown.points.map((p) => p.top), [60, 60, 70], 'the alternative session in between has no pulldown');
    assert.ok(pulldown.points[2].increase);
  });

  test('an increase is due in today\'s workout, and its card shows the increase note', () => {
    assert.equal(nextTemplate(state), 'A');
    const view = buildView(state, { templateCode: 'A', date: TODAY }, emptyDraft(null), Date.now());
    assert.equal(view.started, false, 'nothing logged today');
    assert.equal(view.exercisesDone, 0);
    const due = view.cards.filter((c) => c.increased);
    assert.deepEqual(due.map((c) => c.exerciseId), ['face-pull']);
    assert.equal(due[0].suggestion.weightLbs, 25);
    assert.equal(due[0].suggestion.fromWeightLbs, 20);
    assert.match(due[0].increaseText, /\+5 lbs from 20/);
    assert.equal(exerciseDetail(state, 'face-pull', TODAY).stats.due, true);
    assert.equal(Object.values(state.sessions).some((s) => pacificDate(parseInstant(s.startedAt)) === TODAY), false);
  });

  test('one finished session used an alternative exercise; the swap was put back afterwards', () => {
    const { templateCode, exerciseId, defaultExerciseId } = ALTERNATIVE;
    const sessionsWith = Object.values(state.sets).filter((s) => s.exerciseId === exerciseId).map((s) => s.sessionId);
    assert.equal(new Set(sessionsWith).size, 1);
    const session = state.sessions[sessionsWith[0]];
    assert.ok(session.finishedAt);
    assert.equal(session.templateCode, templateCode);
    assert.equal(Object.values(state.sets).some((s) => s.sessionId === session.id && s.exerciseId === defaultExerciseId), false, 'the default is not also logged');
    assert.deepEqual(state.swaps, {});
    assert.equal(fixture.filter((e) => e.type === 'swap.set').length, 1);
    assert.equal(fixture.filter((e) => e.type === 'swap.cleared').length, 1);
  });

  test('one finished session left an exercise unticked: History by date shows it missing', () => {
    const rows = historyByDate(state, TODAY).flatMap((g) => g.rows);
    assert.equal(rows.length, 12);
    const missing = rows.filter((r) => r.missing > 0);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].missing, 1);
    assert.equal(missing[0].templateCode, 'A');
    assert.equal(missing[0].exercisesDone, 5);
    assert.equal(Object.values(state.sets).some((s) => s.sessionId === missing[0].sessionId && s.exerciseId === UNTICKED.exerciseId), false);
  });

  test('reps stay inside each exercise\'s range and weights are never below the starting weight', () => {
    for (const set of Object.values(state.sets)) {
      const rules = RULES[set.exerciseId];
      assert.ok(rules, set.exerciseId);
      if (rules.repMin !== null && set.reps != null) assert.ok(set.reps >= rules.repMin && set.reps <= rules.repMax, `${set.exerciseId} ${set.reps}`);
      if (set.weightLbs != null) assert.ok(set.weightLbs >= 0);
    }
  });
});

describe('determinism', () => {
  test('the same start date always gives the same events, whatever the real clock says', async () => {
    const again = await buildFixture({ today: TODAY });
    assert.deepEqual(again, fixture);
    const realNow = Date.now;
    Date.now = () => 1_000_000_000_000; // the fixture runs on its own clock
    try {
      assert.deepEqual(await buildFixture({ today: TODAY }), fixture);
    } finally {
      Date.now = realNow;
    }
  });

  test('another start date gives the same history, moved: same shape, other dates', async () => {
    const later = await buildFixture({ today: '2027-01-15' });
    assert.notDeepEqual(later, fixture);
    assert.equal(later.length, fixture.length);
    assert.deepEqual(later.map((e) => e.type), fixture.map((e) => e.type));
    const dates = finishedSessions(replay(later)).map((s) => s.date);
    assert.deepEqual(dates, SESSION_OFFSETS.map((o) => addDays('2027-01-15', o)));
  });

  test('a different seed changes the reps, not the outcomes', async () => {
    const other = await buildFixture({ today: TODAY, seed: 7 });
    assert.notDeepEqual(other, fixture);
    assert.equal(finishedSessions(replay(other)).length, 12);
  });

  test('the generator is seeded', () => {
    const a = seededRandom(1);
    const b = seededRandom(1);
    assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
    assert.notEqual(seededRandom(2)(), seededRandom(1)());
  });

  for (const day of DAYS) {
    test(`the promised outcomes hold when the demo is opened on ${day} (daylight saving, leap day, year end)`, async () => {
      const events = await buildFixture({ today: day });
      const s = replay(events);
      const done = finishedSessions(s);
      assert.deepEqual(done.map((x) => x.date), SESSION_OFFSETS.map((o) => addDays(day, o)), 'every session lands on its Pacific day');
      assert.equal(done.length, 12);
      assert.equal(historyByDate(s, day).flatMap((g) => g.rows).filter((r) => r.missing > 0).length, 1);
      const view = buildView(s, { templateCode: nextTemplate(s), date: day }, emptyDraft(null), Date.now());
      assert.equal(view.templateCode, 'A');
      assert.deepEqual(view.cards.filter((c) => c.increased).map((c) => c.exerciseId), ['face-pull']);
      assert.ok(Object.keys(RULES).filter((id) => exerciseDetail(s, id, day).points.some((p) => p.increase)).length >= 2);
      for (const ev of events) assert.deepEqual(validateEvent(ev, Date.parse(`${day}T23:59:00-08:00`)), [], ev.type);
    });
  }
});

describe('synthetic only', () => {
  test('nothing in the fixture looks like real data: no addresses, links, phone numbers or account ids', () => {
    const text = JSON.stringify(fixture);
    assert.doesNotMatch(text, /@/, 'no email addresses');
    assert.doesNotMatch(text, /https?:|www\./i, 'no links');
    assert.doesNotMatch(text, /\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/, 'no phone numbers');
    assert.doesNotMatch(text, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'no UUIDs (Cognito subs)');
    assert.doesNotMatch(text, /backPain|bodyFat|bodyWeight|weightKg|height|birth|calibrationFeel/i, 'no health or profile fields');
  });

  test('the only free text is the lifter\'s three short session notes', () => {
    const notes = fixture.filter((e) => e.type === 'session.notes').map((e) => e.payload.notes);
    assert.equal(notes.length, 3);
    for (const note of notes) assert.match(note, /^[A-Z][A-Za-z ,.]{10,60}$/);
    // Every other string in a payload is a code, an id or a date: template codes, exercise ids, entity ids, Pacific times.
    for (const ev of fixture) {
      for (const [key, v] of Object.entries(ev.payload)) {
        if (typeof v !== 'string' || key === 'notes') continue;
        assert.match(v, /^([ABC]|[a-zA-Z]+(-[a-z0-9]+)*|\d{4}-\d{2}-\d{2}(T[\d:.+-]+)?|sess_[0-9A-Z]{26}|set_[0-9A-Z]{26})$/, `${ev.type}.${key}: ${v}`);
      }
    }
  });
});

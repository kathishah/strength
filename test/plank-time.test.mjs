// Plank: a time in seconds for each set (spec 4.5, 5.2 and 8, v1.22), and logs that still hold TRX (removed in v1.22).
// Real replay, engine, rows, actions and validator.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suggestExercise } from '../app/js/engine/index.js';
import { RULES } from '../app/js/seed/rules.js';
import { canLog, dialNotches, emptyDraft, exerciseDetail, historyByDate, historyByExercise, inputsFor, parseDraft, pickValues, serializeDraft, sessionView, setRowField, summaryView } from '../app/js/logging/index.js';
import { lastText, setsRepsText, setsText } from '../app/js/logging/text.js';
import { replay } from '../app/js/store/replay.js';
import { validateEvent } from '../lambda/events/registry.mjs';
import { eventsToCsv } from '../scripts/export-lib.mjs';
import { atLevel, hold, lift, makeLog } from '../test-support/engine-log.mjs';
import { makeWorld } from '../test-support/logging-world.mjs';
import { makeEvent, NOW } from '../test-support/util.mjs';

const NOW_MS = Date.parse('2026-10-05T11:00:00-07:00');
const suggest = (log, today = '2026-10-05', exerciseId = 'plank') => suggestExercise(log.state(), { exerciseId, templateCode: 'A', slot: 5, today });
// The plank in Workout A's slot 5, with `sets` logged on 2026-09-28, shown in an open session on 2026-10-05.
const planked = (sets, opts = {}) => {
  const log = makeLog().swap('A', 5, 'plank');
  if (sets) log.session('2026-09-28', 'A', [hold('plank', sets)]);
  log.session('2026-10-05', 'A', [], { finished: false, id: 'sess_open' });
  return { log, card: (draft = emptyDraft('sess_open')) => sessionView(log.state(), 'sess_open', draft, NOW_MS).cards.find((c) => c.exerciseId === 'plank') };
};
const secs = (c) => c.rows.map((r) => r.holdSeconds);

describe('rules', () => {
  test('plank is timed, starts at 45 s; side plank stays completion only', () => {
    assert.deepEqual([RULES.plank.progression, RULES.plank.holdSeconds], ['timed', 45]);
    assert.deepEqual([RULES['side-plank'].progression, RULES['side-plank'].holdSeconds], ['hold', { min: 15, max: 20 }]);
    assert.equal(setsRepsText({ sets: 2, ...RULES.plank }), '2 × 45 s hold');
  });
  test('the boxes: seconds only', () => {
    assert.deepEqual(inputsFor(suggest(makeLog().swap('A', 5, 'plank'))), { weight: false, level: false, reps: false, distance: false, hold: true });
  });
});

describe('what each set opens at', () => {
  test('P-1: no history, both dials at 45 s', () => {
    const { card } = planked(null);
    const c = card();
    assert.deepEqual(secs(c), [45, 45]);
    assert.equal(c.rows.every((r) => r.canLog), true);
    assert.equal(c.prescription, '2 × 45 s hold');
  });
  test('P-2: last time 45 / 60, the dials open at 45 / 60', () => {
    const { card } = planked([45, 60]);
    const c = card();
    assert.deepEqual(secs(c), [45, 60]);
    assert.equal(c.lastText, 'Last (Mon, Sep 28): 45 s, 60 s');
  });
  test('P-3: last time one set of 50, two sets today: 50 / 50', () => {
    assert.deepEqual(secs(planked([50]).card()), [50, 50]);
  });
  test('a set not logged last time takes the one before it; the app never raises the time', () => {
    assert.deepEqual(secs(planked([[40, 1], [90, 2]]).card()), [40, 90]);
    assert.deepEqual(suggest(planked([30, 30]).log).setHolds, [30, 30]);
  });
  test('a typed time moves the later sets only while they started equal', () => {
    const typed = (n, v) => setRowField(emptyDraft('sess_open'), 'plank', n, 'holdSeconds', v);
    assert.deepEqual(secs(planked([45, 45]).card(typed(1, 60))), [60, 60]);
    assert.deepEqual(secs(planked([45, 60]).card(typed(1, 50))), [50, 60]);
  });
  test('a skipped set (no seconds) leaves the tick out and does not blank the next set', () => {
    const c = planked([45, 45]).card(setRowField(emptyDraft('sess_open'), 'plank', 1, 'holdSeconds', null));
    assert.deepEqual(secs(c), [null, 45]);
    assert.deepEqual(c.rows.map((r) => r.canLog), [false, true]);
  });
});

describe('logging (P-4, P-6)', () => {
  const plankWorld = async () => {
    const w = await makeWorld();
    const id = await w.actions.startSession();
    await w.actions.swap(id, { slotNumber: 5, exerciseId: 'plank' });
    return { w, id };
  };
  const card = (w, id) => w.view(id).cards.find((c) => c.exerciseId === 'plank');
  const logged = (w, id) => Object.values(w.state.sets).filter((s) => s.sessionId === id && s.exerciseId === 'plank').sort((a, b) => a.setNumber - b.setNumber);

  test('the tick writes holdSeconds per set, nothing else, and the events are valid', async () => {
    const { w, id } = await plankWorld();
    w.actions.setValue(id, 'plank', 2, 'holdSeconds', 55);
    const c = card(w, id);
    await w.actions.saveExercise(id, { exerciseId: 'plank', rows: c.rows, suggestion: c.suggestion });
    assert.deepEqual(logged(w, id).map((s) => [s.holdSeconds, s.reps, s.weightLbs, s.levelNumber]), [[45, undefined, undefined, undefined], [55, undefined, undefined, undefined]]);
    assert.equal(card(w, id).summaryText, '45 s, 55 s');
    w.assertValid();
  });

  test('P-6: with set 2 skipped only set 1 is logged', async () => {
    const { w, id } = await plankWorld();
    w.actions.setValue(id, 'plank', 2, 'holdSeconds', null);
    const c = card(w, id);
    await w.actions.saveExercise(id, { exerciseId: 'plank', rows: c.rows, suggestion: c.suggestion });
    assert.deepEqual(logged(w, id).map((s) => [s.setNumber, s.holdSeconds]), [[1, 45]]);
  });

  test('P-4: editing a logged set writes set.edited with holdSeconds only', async () => {
    const { w, id } = await plankWorld();
    let c = card(w, id);
    await w.actions.saveExercise(id, { exerciseId: 'plank', rows: c.rows, suggestion: c.suggestion });
    w.actions.beginEdit(id, 'plank');
    w.actions.setValue(id, 'plank', 1, 'holdSeconds', 55);
    c = card(w, id);
    assert.equal(c.mode, 'editing');
    await w.actions.saveExercise(id, { exerciseId: 'plank', rows: c.rows, suggestion: c.suggestion });
    const edits = w.events.events().filter((e) => e.type === 'set.edited');
    assert.deepEqual(edits.map((e) => e.payload), [{ holdSeconds: 55 }]);
    assert.deepEqual(logged(w, id).map((s) => s.holdSeconds), [55, 45]);
    w.assertValid();
  });
});

describe('values, dials, text', () => {
  test('canLog wants whole seconds of at least 1; pickValues keeps holdSeconds only for a timed hold', () => {
    const inputs = { weight: false, level: false, reps: false, distance: false, hold: true };
    assert.equal(canLog({ holdSeconds: 45 }, inputs), true);
    for (const bad of [0, 2.5, null, undefined]) assert.equal(canLog({ holdSeconds: bad }, inputs), false, String(bad));
    assert.deepEqual(pickValues({ holdSeconds: 45, reps: 8 }, inputs), { weightLbs: null, levelNumber: null, reps: null, distanceM: null, holdSeconds: 45 });
    assert.equal(pickValues({ holdSeconds: 45 }, { weight: false, level: false, reps: true, distance: false, hold: false }).holdSeconds, null);
  });
  test('the dial turns in 5 s notches to at least 180 and always holds the logged value', () => {
    const n = dialNotches('holdSeconds', [45, 47]);
    assert.deepEqual([n[0], n[1], n.at(-1)], [5, 10, 180]);
    assert.ok(n.includes(45) && n.includes(47));
    assert.ok(dialNotches('holdSeconds', [400]).includes(400));
  });
  test('setsText and lastText read "45 s, 50 s"', () => {
    assert.equal(setsText([{ weightLbs: null, reps: null, levelNumber: null, distanceM: null, holdSeconds: 45 }, { weightLbs: null, reps: null, levelNumber: null, distanceM: null, holdSeconds: 50 }]), '45 s, 50 s');
    assert.equal(lastText(suggest(planked([45, 50]).log)), 'Last (Mon, Sep 28): 45 s, 50 s');
  });
  test('the draft keeps holdSeconds across a save and a load', () => {
    const d = setRowField(emptyDraft('s'), 'plank', 1, 'holdSeconds', 50);
    assert.deepEqual(parseDraft(serializeDraft(d), 's').rows, { plank: { 1: { holdSeconds: 50 } } });
  });
});

describe('history and export', () => {
  const log = () => makeLog().swap('A', 5, 'plank')
    .session('2026-09-28', 'A', [hold('plank', [45, 50])], { id: 'sess_a' })
    .session('2026-10-05', 'A', [hold('plank', [60, 40])], { id: 'sess_b' });
  test('measured in seconds: the longest set is the top, the sets are listed', () => {
    const d = exerciseDetail(log().state(), 'plank', '2026-10-06');
    assert.deepEqual([d.kind, d.topLabel], ['time', 'Longest (s)']);
    assert.deepEqual(d.points.map((p) => [p.top, p.volume, p.text, p.increase]), [[50, 95, '45 s, 50 s', false], [60, 100, '60 s, 40 s', true]]);
  });
  test('the finish summary lists the times', () => {
    const l = log();
    assert.equal(summaryView(l.state(), 'sess_b').exercises[0].text, '60 s, 40 s');
  });
  test('the CSV has a holdSeconds column', () => {
    const [head, row] = eventsToCsv(log().events).split('\n');
    const i = head.split(',').indexOf('holdSeconds');
    assert.ok(i > 0);
    assert.equal(row.split(',')[i], '45');
  });
});

describe('events', () => {
  test('the server accepts holdSeconds 1-3600 on set.logged and set.edited, and rejects the rest', () => {
    const ok = (payload) => validateEvent(makeEvent(1, { payload: { sessionId: 'sess_1', exerciseId: 'plank', setNumber: 1, isRampUp: false, isCalibration: false, ...payload } }), NOW);
    assert.deepEqual(ok({ holdSeconds: 45 }), []);
    assert.deepEqual(ok({ holdSeconds: null }), []);
    for (const bad of [0, 3601, 4.5, '45']) assert.equal(ok({ holdSeconds: bad }).length, 1, String(bad));
    const edited = validateEvent(makeEvent(2, { type: 'set.edited', entityId: 'set_1', payload: { holdSeconds: 50 } }), NOW);
    assert.deepEqual(edited, []);
  });
  test('replay keeps holdSeconds on a set and applies an edit over it', () => {
    const l = makeLog().session('2026-09-28', 'A', [hold('plank', [45])], { id: 'sess_a' });
    const [set] = Object.values(l.state().sets);
    assert.equal(set.holdSeconds, 45);
    const edit = { id: '01J9Z000000000000000000009', ts: '2030-01-01T00:00:00.000Z-0001-d_t', v: 1, type: 'set.edited', entityId: set.id, payload: { holdSeconds: 55 } };
    assert.equal(Object.values(replay([...l.events, edit]).sets)[0].holdSeconds, 55);
  });
});

// TRX was removed in v1.22: a log that still holds TRX sets and swaps must keep working on every screen that reads it.
describe('an old log with TRX in it', () => {
  const old = () => {
    const log = makeLog().swap('A', 4, 'trx-row')
      .session('2026-09-28', 'A', [lift('goblet-squat', 25, [10, 10, 10]), atLevel('trx-row', 3, [12, 12])], { id: 'sess_a' });
    return log;
  };
  test('the finish summary lists the TRX sets and gives no callout for them', () => {
    const s = summaryView(old().state(), 'sess_a');
    assert.deepEqual(s.exercises.map((x) => [x.exerciseId, x.text]), [['goblet-squat', '25 × 10, 10, 10'], ['trx-row', 'level 3 × 12, 12']]);
    assert.deepEqual(s.callouts, []);
  });
  test('History, the exercise page, the export and an open workout do not throw; the slot shows its default', () => {
    const log = old();
    assert.equal(historyByExercise(log.state(), '2026-10-01')[0].rows[3].exerciseId, 'chest-supported-row');
    assert.equal(historyByDate(log.state(), '2026-10-01').length, 1);
    assert.equal(exerciseDetail(log.state(), 'trx-row', '2026-10-01'), null);
    assert.equal(eventsToCsv(log.events).split('\n').length, 7);
    log.session('2026-10-06', 'A', [atLevel('trx-row', 2, [10])], { finished: false, id: 'sess_open' });
    const v = sessionView(log.state(), 'sess_open', emptyDraft('sess_open'), Date.parse('2026-10-06T11:00:00-07:00'));
    assert.deepEqual(v.cards.map((c) => c.exerciseId), ['goblet-squat', 'db-bench-press', 'db-romanian-deadlift', 'chest-supported-row', 'dead-bug', 'face-pull']);
  });
});

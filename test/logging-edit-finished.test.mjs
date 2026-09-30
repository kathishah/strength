// Reopening a finished workout to correct it (plan section 15c, spec 6.3 v1.15): the actions over the real event store, and the
// Home list and edit view over real logs. Nothing here touches a DOM.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dayView, editView, emptyDraft, finishedRecent, nextTemplate, restStatus } from '../app/js/logging/index.js';
import { planSession } from '../app/js/engine/index.js';
import { parseRoute } from '../app/js/ui/router.js';
import { atLevel, lift, makeLog } from '../test-support/engine-log.mjs';
import { doWorkout, makeWorld } from '../test-support/logging-world.mjs';

const NOW = Date.parse('2026-09-30T18:00:00-07:00');
const sets = (w) => Object.values(w.state.sets);
const setsOf = (w, sessionId, exerciseId) => sets(w).filter((s) => s.sessionId === sessionId && s.exerciseId === exerciseId).sort((a, b) => a.setNumber - b.setNumber);
const cardOf = (view, id) => view.cards.find((c) => c.exerciseId === id);
const edit = (w, id) => editView(w.state, { sessionId: id, nowMs: w.clock.ms, draftFor: (sid) => w.actions.draft(sid) });

// Workout A on Monday, then Workout B on Wednesday finished with the pushups not ticked (what happened on 2026-09-30).
async function bWithoutPushups() {
  const w = await makeWorld();
  await doWorkout(w);
  w.set('2026-09-30T11:00:00-07:00');
  const id = await w.actions.startSession();
  for (const c of w.view(id).cards) {
    if (c.exerciseId === 'pushup') continue;
    w.advance(120);
    await w.actions.saveExercise(id, { exerciseId: c.exerciseId, rows: c.rows, suggestion: c.suggestion });
  }
  w.advance(60);
  await w.actions.finish(id, { notes: 'Felt fine.' });
  return { w, id };
}

describe('ticking, editing and undoing in a finished workout', () => {
  test('the forgotten pushups can be ticked: sets go into the finished session, nothing else about it changes', async () => {
    const { w, id } = await bWithoutPushups();
    const before = { ...w.state.sessions[id] };
    assert.equal(nextTemplate(w.state), 'C');
    const v = edit(w, id);
    assert.equal(cardOf(v, 'pushup').mode, 'input');
    assert.equal(v.exercisesDone, 5);
    w.advance(3600);
    const c = cardOf(v, 'pushup');
    await w.actions.saveExercise(id, { exerciseId: 'pushup', rows: c.rows, suggestion: c.suggestion });
    const logged = setsOf(w, id, 'pushup');
    assert.equal(logged.length, 3);
    assert.ok(logged.every((s) => s.sessionId === id && s.completed === true && s.levelNumber === 1));
    assert.deepEqual(w.state.sessions[id], before, 'date, start and finish times and notes are as they were');
    assert.equal(nextTemplate(w.state), 'C', 'rotation does not move');
    assert.equal(edit(w, id).exercisesDone, 6);
    assert.equal(cardOf(edit(w, id), 'pushup').mode, 'done');
    w.assertValid();
  });

  test('a correction starts no rest timer', async () => {
    const { w, id } = await bWithoutPushups();
    const c = cardOf(edit(w, id), 'pushup');
    await w.actions.saveExercise(id, { exerciseId: 'pushup', rows: c.rows, suggestion: c.suggestion });
    assert.equal(restStatus(w.actions.draft(id), w.clock.ms), null);
  });

  test('Edit changes a logged set (set.edited) and Undo removes the exercise\'s sets, then it can be ticked again', async () => {
    const { w, id } = await bWithoutPushups();
    const before = setsOf(w, id, 'leg-press').map((s) => s.id);
    w.actions.beginEdit(id, 'leg-press');
    w.actions.setValue(id, 'leg-press', 2, 'weightLbs', 60);
    const c = cardOf(edit(w, id), 'leg-press');
    assert.equal(c.mode, 'editing');
    await w.actions.saveExercise(id, { exerciseId: 'leg-press', rows: c.rows, suggestion: c.suggestion });
    const after = setsOf(w, id, 'leg-press');
    assert.deepEqual(after.map((s) => s.id), before, 'the same sets, edited in place');
    assert.equal(after[1].weightLbs, 60);
    assert.equal(w.events.events().filter((e) => e.type === 'set.edited').length, 1, 'only the changed field of the changed set');

    await w.actions.undoExercise(id, 'leg-press');
    assert.equal(setsOf(w, id, 'leg-press').length, 0);
    const again = cardOf(edit(w, id), 'leg-press');
    assert.equal(again.mode, 'input');
    await w.actions.saveExercise(id, { exerciseId: 'leg-press', rows: again.rows, suggestion: again.suggestion });
    assert.equal(setsOf(w, id, 'leg-press').length, 3);
    w.assertValid();
  });

  test('swap, notes, finish and discard are still refused on a finished workout; an unknown one is refused by all', async () => {
    const { w, id } = await bWithoutPushups();
    await assert.rejects(w.actions.swap(id, { slotNumber: 5, exerciseId: 'machine-chest-press' }), /finished/);
    await assert.rejects(w.actions.saveNotes(id, 'more'), /finished/);
    await assert.rejects(w.actions.finish(id, {}), /finished/);
    await assert.rejects(w.actions.discard(id), /finished/);
    const c = cardOf(edit(w, id), 'pushup');
    await assert.rejects(w.actions.saveExercise('sess_nope', { exerciseId: 'pushup', rows: c.rows, suggestion: c.suggestion }), /does not exist/);
    await assert.rejects(w.actions.undoExercise('sess_nope', 'pushup'), /does not exist/);
  });

  test('what was ticked afterwards counts for the next suggestions', async () => {
    const { w, id } = await bWithoutPushups();
    const at = (today) => planSession(w.state, { today, templateCode: 'B' }).exercises.find((e) => e.defaultExerciseId === 'pushup');
    assert.equal(at('2026-10-07').fromLevel, null, 'no pushups logged yet');
    const c = cardOf(edit(w, id), 'pushup');
    w.actions.setAll(id, 'pushup', [1, 2, 3], 'levelNumber', 2);
    await w.actions.saveExercise(id, { exerciseId: 'pushup', rows: cardOf(edit(w, id), 'pushup').rows, suggestion: c.suggestion });
    const next = at('2026-10-07');
    assert.deepEqual([next.fromLevel, next.level, next.last.date], [2, 2, '2026-09-30']);
    w.assertValid();
  });
});

describe('the edit view', () => {
  const log = () => makeLog()
    .session('2026-09-28', 'A', [lift('goblet-squat', 20, [10, 10, 10])], { id: 'sess_a1' })
    .session('2026-10-05', 'A', [lift('goblet-squat', 25, [10, 10, 10])], { id: 'sess_a2' });
  const view = (l, id) => editView(l.state(), { sessionId: id, nowMs: NOW, draftFor: (sid) => emptyDraft(sid) });

  test('is planned from what was known that day: "Last" is the workout before it, not itself or a later one', () => {
    const l = log();
    const g = view(l, 'sess_a1').cards.find((c) => c.exerciseId === 'goblet-squat');
    assert.equal(g.lastText, null, 'the first Workout A had nothing before it');
    assert.equal(g.mode, 'done');
    assert.equal(g.summaryText, '20 lbs × 10, 10, 10');
    const second = view(l, 'sess_a2').cards.find((c) => c.exerciseId === 'goblet-squat');
    assert.equal(second.lastText, 'Last (Mon, Sep 28): 20 × 10, 10, 10');
    assert.equal(second.lastText.includes('25'), false);
  });

  test('has the workout\'s own day and exercises, no finish card state, no swapping and no rest', () => {
    const l = log().swap('A', 1, 'box-squat');
    const v = view(l, 'sess_a1');
    assert.deepEqual([v.mode, v.templateCode, v.finished, v.rest, v.older, v.warning], ['edit', 'A', true, null, [], null]);
    assert.equal(v.statusText, 'Workout A · Mon, Sep 28 · editing');
    assert.ok(v.cards.every((c) => !c.canSwap && c.swapOptions.length === 0 && c.optionGroups.alternatives.length === 0 && c.optionGroups.trx.length === 0 && c.swappedFromName === null));
  });

  test('is null for an unknown, open or deleted workout', () => {
    const l = log().session('2026-10-06', 'B', [], { finished: false, id: 'sess_open' });
    assert.equal(view(l, 'sess_none'), null);
    assert.equal(view(l, 'sess_open'), null);
  });
});

describe('Home lists the finished workouts of the last 7 days', () => {
  const home = (l, today) => dayView(l.state(), { today, nowMs: NOW, draftFor: (id) => emptyDraft(id) });

  test('newest first, today and the six days before, with exercises done; older, open and deleted ones are left out', () => {
    const l = makeLog()
      .session('2026-09-22', 'C', [lift('trap-bar-deadlift', 95, [8, 8, 8])], { id: 'sess_old' })       // 8 days before the 30th
      .session('2026-09-24', 'A', [lift('goblet-squat', 20, [10, 10, 10])], { id: 'sess_a' })           // 6 days before: in
      .session('2026-09-28', 'B', [lift('leg-press', 50, [10, 10, 10]), atLevel('pushup', 1, [10, 10, 10])], { id: 'sess_b' })
      .session('2026-09-30', 'C', [], { finished: false, id: 'sess_open' });
    const list = finishedRecent(l.state(), '2026-09-30', NOW);
    assert.deepEqual(list.map((f) => [f.sessionId, f.exercisesDone, f.exerciseCount]), [['sess_b', 2, 6], ['sess_a', 1, 6]]);
    assert.deepEqual(list.map((f) => f.label), ['Workout B – Full body', 'Workout A – Full body']);
    assert.deepEqual(home(l, '2026-09-30').finishedRecent, list);
  });

  test('is on the recovery-day page too, and empty when nothing is finished', () => {
    const l = makeLog().session('2026-09-29', 'A', [lift('goblet-squat', 20, [10, 10, 10])], { id: 'sess_a' });
    const tue = home(l, '2026-09-29');
    assert.equal(tue.mode, 'recovery');
    assert.equal(tue.finishedRecent.length, 1);
    assert.deepEqual(home(makeLog(), '2026-09-29').finishedRecent, []);
  });
});

test('the route #/workout/<id> is parsed like the summary route', () => {
  assert.deepEqual(parseRoute('#/workout/sess_01ABC'), { name: 'workout', id: 'sess_01ABC' });
  assert.deepEqual(parseRoute('#/workout/'), { name: 'home' });
  assert.deepEqual(parseRoute('#/workout/a b'), { name: 'home' });
  assert.deepEqual(parseRoute('#/summary/sess_1'), { name: 'summary', id: 'sess_1' });
});

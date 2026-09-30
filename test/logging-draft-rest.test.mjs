// The local draft and the rest timer (spec 6.3, 9): draft safety and a timer that works from timestamps.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addExtraSet, clearExercise, clearRest, clearRow, createDraftStore, emptyDraft, parseDraft, serializeDraft, setRowField, startEditing, startRest } from '../app/js/logging/draft.js';
import { adjustedRestLength, DEFAULT_REST_SEC, formatClock, restLength, restStatus } from '../app/js/logging/rest-timer.js';

describe('draft', () => {
  test('typed values, edits and extra sets are kept per exercise and set, without changing the old draft', () => {
    const d0 = emptyDraft('sess_1');
    const d1 = setRowField(d0, 'goblet-squat', 1, 'weightLbs', 25);
    const d2 = addExtraSet(startEditing(setRowField(d1, 'goblet-squat', 1, 'reps', null), 'goblet-squat'), 'face-pull');
    assert.deepEqual(d0.rows, {});
    assert.deepEqual(d1.rows, { 'goblet-squat': { 1: { weightLbs: 25 } } });
    assert.deepEqual(d2.rows['goblet-squat'], { 1: { weightLbs: 25, reps: null } });
    assert.deepEqual(d2.editing, { 'goblet-squat': true });
    assert.deepEqual(d2.extra, { 'face-pull': 1 });
    assert.throws(() => setRowField(d0, 'goblet-squat', 1, 'completed', true), RangeError);
  });

  test('clearRow forgets one row and tidies up', () => {
    const d = setRowField(setRowField(emptyDraft('s'), 'a', 1, 'reps', 5), 'a', 2, 'reps', 6);
    assert.deepEqual(clearRow(d, 'a', 1).rows, { a: { 2: { reps: 6 } } });
    assert.deepEqual(clearRow(clearRow(d, 'a', 1), 'a', 2).rows, {});
    assert.deepEqual(clearRow(d, 'zzz', 9).rows, d.rows);
  });

  test('clearExercise forgets typed values, the edit and extra sets of one exercise only', () => {
    let d = setRowField(emptyDraft('s'), 'a', 1, 'reps', 5);
    d = addExtraSet(startEditing(setRowField(d, 'b', 1, 'reps', 6), 'a'), 'a');
    const cleared = clearExercise(d, 'a');
    assert.deepEqual(cleared.rows, { b: { 1: { reps: 6 } } });
    assert.deepEqual([cleared.editing, cleared.extra], [{}, {}]);
  });

  test('it survives a save and a load', () => {
    let d = emptyDraft('sess_1');
    d = setRowField(d, 'goblet-squat', 2, 'weightLbs', 22.5);
    d = startRest(addExtraSet(d, 'goblet-squat'), 1_789_000_000_000);
    d = { ...d, notes: 'felt good', restSec: 120 };
    assert.deepEqual(parseDraft(serializeDraft(d), 'sess_1'), d);
  });

  test('a draft for another session, another version, or garbage gives an empty draft', () => {
    const d = setRowField(emptyDraft('sess_1'), 'a', 1, 'reps', 5);
    assert.deepEqual(parseDraft(serializeDraft(d), 'sess_2'), emptyDraft('sess_2'));
    assert.deepEqual(parseDraft(JSON.stringify({ ...d, v: 2 }), 'sess_1'), emptyDraft('sess_1'));
    for (const junk of [null, undefined, '', '{', '[]', '"x"', '123', 'null']) assert.deepEqual(parseDraft(junk, 's'), emptyDraft('s'), String(junk));
  });

  test('a draft saved before v1.16 with a back pain rating is read with the rating ignored', () => {
    const d = parseDraft(JSON.stringify({ v: 1, sessionId: 's', notes: 'hi', backPainAfter: 3 }), 's');
    assert.deepEqual(d, { ...emptyDraft('s'), notes: 'hi' });
    assert.equal(Object.hasOwn(d, 'backPainAfter'), false);
  });

  test('bad fields are dropped one by one and the good ones kept', () => {
    const text = JSON.stringify({
      v: 1, sessionId: 's',
      rows: { a: { 0: { reps: 5 }, 1: { reps: 'lots', weightLbs: 30 }, x: { reps: 1 } }, b: 'nope', __proto__: { c: 1 } },
      extra: { a: 2, b: -1, c: 1.5, d: 99 },
      notes: 12, restStartedAtMs: 'soon', restSec: null,
    });
    const d = parseDraft(text, 's');
    assert.deepEqual(d.rows, { a: { 1: { weightLbs: 30 } } });
    assert.deepEqual(d.extra, { a: 2 });
    assert.equal(d.notes, null);
    assert.equal(d.restStartedAtMs, null);
    assert.equal(Object.getPrototypeOf(d.rows), Object.prototype);
  });

  test('the store writes through to storage, reads it back after a reload, and forgets on clear', () => {
    const backend = new Map();
    const shim = { getItem: (k) => backend.get(k) ?? null, setItem: (k, v) => void backend.set(k, v), removeItem: (k) => void backend.delete(k) };
    const a = createDraftStore(shim);
    a.save(setRowField(a.load('s1'), 'a', 1, 'reps', 7));
    const b = createDraftStore(shim); // a page reload
    assert.equal(b.load('s1').rows.a[1].reps, 7);
    assert.deepEqual(b.load('s2'), emptyDraft('s2'));
    b.clear('s2');
    assert.equal(createDraftStore(shim).load('s1').rows.a, undefined);
  });

  test('blocked storage: the draft still works in memory and nothing throws', () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    const store = createDraftStore(broken);
    store.save(setRowField(store.load('s'), 'a', 1, 'reps', 3));
    assert.equal(store.load('s').rows.a[1].reps, 3);
    store.clear('s');
    assert.deepEqual(store.load('s'), emptyDraft('s'));
    assert.deepEqual(createDraftStore(null).load('s'), emptyDraft('s'));
  });
});

describe('rest timer', () => {
  const T0 = Date.parse('2026-09-28T11:00:00-07:00');
  const running = (extra = {}) => ({ ...startRest(emptyDraft('s'), T0), ...extra });

  test('no timer until a set is logged', () => assert.equal(restStatus(emptyDraft('s'), T0), null));

  test('counts down from 90 s using the timestamps only', () => {
    assert.deepEqual(restStatus(running(), T0), { totalSec: 90, remainingMs: 90_000, remainingSec: 90, over: false, overMs: 0 });
    assert.equal(restStatus(running(), T0 + 30_500).remainingSec, 60);
    assert.equal(restStatus(running(), T0 + 89_999).remainingSec, 1);
  });

  test('a locked screen: looking again 40 s later, or after a long gap, is right without any ticks in between', () => {
    const d = running();
    assert.equal(restStatus(d, T0 + 50_000).remainingSec, 40);
    const late = restStatus(d, T0 + 200_000);
    assert.equal(late.over, true);
    assert.equal(late.remainingSec, 0);
    assert.equal(late.overMs, 110_000);
  });

  test('it ends exactly at the length, and a rest that ended long ago is hidden', () => {
    assert.equal(restStatus(running(), T0 + 90_000).over, true);
    assert.equal(restStatus(running(), T0 + 90_000 + 599_000).over, true);
    assert.equal(restStatus(running(), T0 + 90_000 + 601_000), null);
  });

  test('a clock that went back a lot hides it; a small step back is treated as just started', () => {
    assert.equal(restStatus(running(), T0 - 5_000).remainingSec, 90);
    assert.equal(restStatus(running(), T0 - 120_000), null);
  });

  test('length: this session\'s adjusted length, else the setting, else 90 s; clamped to 15-600 s', () => {
    assert.equal(restLength(emptyDraft('s'), {}), DEFAULT_REST_SEC);
    assert.equal(restLength(emptyDraft('s'), { restTimerDefaultSec: 120 }), 120);
    assert.equal(restLength({ restSec: 45 }, { restTimerDefaultSec: 120 }), 45);
    assert.equal(restLength({ restSec: 5000 }, {}), 600);
    assert.equal(restLength({ restSec: 1 }, {}), 15);
    assert.equal(restLength({ restSec: NaN }, {}), 90);
  });

  test('+15 and -15 change the length of the running rest and stop at the limits', () => {
    assert.equal(adjustedRestLength(emptyDraft('s'), {}, 15), 105);
    assert.equal(adjustedRestLength({ restSec: 20 }, {}, -15), 15);
    assert.equal(adjustedRestLength({ restSec: 600 }, {}, 15), 600);
    const longer = { ...running(), restSec: 105 };
    assert.equal(restStatus(longer, T0 + 30_000).remainingSec, 75);
  });

  test('skipping clears it', () => assert.equal(restStatus(clearRest(running()), T0), null));

  test('the clock text', () => {
    assert.equal(formatClock(83), '1:23');
    assert.equal(formatClock(5), '0:05');
    assert.equal(formatClock(-3), '0:00');
    assert.equal(formatClock(600), '10:00');
  });
});

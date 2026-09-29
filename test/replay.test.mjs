// Field-level reducers and replay (DEPLOYMENT-PLAN.md section 4): the state depends on which events
// exist, never on the order they arrived in.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../app/js/store/replay.js';
import { validateEvent } from '../lambda/events/registry.mjs';
import { NOW } from '../test-support/util.mjs';
import { BASE, del, editSet, ev, finishSession, logSet, noteSession, setting, startSession, tsAt } from '../test-support/events.mjs';

describe('building state', () => {
  test('a session with sets, notes and a finish', () => {
    const state = replay([
      startSession('sess_1', 0, { backPainBefore: 2 }),
      logSet('s_1', 'sess_1', 1, { setNumber: 1, reps: 12 }),
      logSet('s_2', 'sess_1', 3, { setNumber: 2, reps: 11 }),
      noteSession('sess_1', 'felt good', 5),
      finishSession('sess_1', 6, { backPainAfter: 1 }),
    ]);
    assert.deepEqual(state.sessions.sess_1, {
      id: 'sess_1', templateCode: 'A', startedAt: '2026-09-29T12:00:00.000-07:00', programWeek: 1, phase: 1,
      isDeload: false, backPainBefore: 2, notes: 'felt good', finishedAt: '2026-09-29T12:06:00.000-07:00', backPainAfter: 1,
    });
    assert.deepEqual(state.sets.s_1, {
      id: 's_1', sessionId: 'sess_1', exerciseId: 'goblet-squat', setNumber: 1, isRampUp: false, isCalibration: false, weightLbs: 25, reps: 12,
    });
    assert.equal(state.sets.s_2.reps, 11);
    assert.deepEqual(state.skipped, []);
  });

  test('an empty log is an empty state', () => {
    assert.deepEqual(replay([]), { sessions: {}, sets: {}, settings: {}, swaps: {}, deloads: {}, skipped: [] });
  });

  test('replay does not modify its input or share objects with it', () => {
    const events = [setting('recoveryDays', [2, 4], 0), startSession('sess_1', 1)];
    const before = structuredClone(events);
    const state = replay(events);
    assert.deepEqual(events, before);
    state.settings.recoveryDays.push(9);
    assert.deepEqual(events[0].payload.value, [2, 4]);
  });
});

describe('per-field patches', () => {
  const base = () => [startSession('sess_1', 0), logSet('s_1', 'sess_1', 1, { reps: 10, weightLbs: 25, rir: 3 })];

  test('set.edited changes only the fields it carries', () => {
    const s = replay([...base(), editSet('s_1', { reps: 12 }, 2)]).sets.s_1;
    assert.deepEqual([s.reps, s.weightLbs, s.rir], [12, 25, 3]);
  });

  test('two edits to different fields both stick, in either arrival order', () => {
    const a = editSet('s_1', { reps: 12 }, 2, { device: 'd_a' });
    const b = editSet('s_1', { weightLbs: 30 }, 2.5, { device: 'd_b' });
    for (const events of [[...base(), a, b], [...base(), b, a]]) {
      const s = replay(events).sets.s_1;
      assert.deepEqual([s.reps, s.weightLbs], [12, 30]);
    }
  });

  test('two edits to the same field: the later ts wins, whichever arrived last', () => {
    const early = editSet('s_1', { reps: 11 }, 2, { device: 'd_a' });
    const late = editSet('s_1', { reps: 13 }, 3, { device: 'd_b' });
    assert.equal(replay([...base(), early, late]).sets.s_1.reps, 13);
    assert.equal(replay([...base(), late, early]).sets.s_1.reps, 13);
  });

  test('null clears a field; a field the patch leaves out is untouched', () => {
    const s = replay([...base(), editSet('s_1', { rir: null }, 2)]).sets.s_1;
    assert.equal(s.rir, null);
    assert.equal(s.reps, 10);
  });

  test('session.finished and session.notes in either order give the same session and erase nothing', () => {
    const fin = finishSession('sess_1', 30, { backPainAfter: 4 });
    const note = noteSession('sess_1', 'tight hamstrings', 20);
    const a = replay([startSession('sess_1', 0, { backPainBefore: 1 }), fin, note]).sessions.sess_1;
    const b = replay([note, fin, startSession('sess_1', 0, { backPainBefore: 1 })]).sessions.sess_1;
    assert.deepEqual(a, b);
    assert.deepEqual([a.backPainBefore, a.backPainAfter, a.notes], [1, 4, 'tight hamstrings']);
  });

  test('a later session.notes replaces an earlier one', () => {
    const state = replay([startSession('sess_1', 0), noteSession('sess_1', 'second', 6), noteSession('sess_1', 'first', 5)]);
    assert.equal(state.sessions.sess_1.notes, 'second');
  });

  test('equal instants are ordered by counter, then device, then event id', () => {
    const t = (counter, device) => tsAt(2, { counter, device });
    const w = (reps, when, id) => editSet('s_1', { reps }, when, { id });
    assert.equal(replay([...base(), w(1, t(1, 'd_a'), 'E1'), w(2, t(2, 'd_a'), 'E2')]).sets.s_1.reps, 2, 'counter');
    assert.equal(replay([...base(), w(1, t(1, 'd_b'), 'E1'), w(2, t(1, 'd_a'), 'E2')]).sets.s_1.reps, 1, 'device: d_b sorts after d_a');
    assert.equal(replay([...base(), w(9, t(1, 'd_a'), 'E2'), w(8, t(1, 'd_a'), 'E1')]).sets.s_1.reps, 9, 'event id: E2 sorts after E1');
  });
});

describe('patches that arrive before their entity', () => {
  test('a patch listed before its creating event is applied once the creation is there', () => {
    const state = replay([editSet('s_1', { reps: 14 }, 5), logSet('s_1', 'sess_1', 1, { reps: 10 }), startSession('sess_1', 0)]);
    assert.equal(state.sets.s_1.reps, 14);
  });

  test('a slow clock gave the patch an earlier ts than the creation: the patch still wins', () => {
    // The edit can only have been made after the set existed, so it is the later intent.
    const state = replay([startSession('sess_1', 0), logSet('s_1', 'sess_1', 10, { reps: 10 }), editSet('s_1', { reps: 14 }, 4)]);
    assert.equal(state.sets.s_1.reps, 14);
  });

  test('a patch for an entity that never appears is held, not applied, and shows up when the creation does', () => {
    const notes = noteSession('spike_1', 'Spike test from d_1', 0);
    const withoutCreation = replay([notes]);
    assert.deepEqual(withoutCreation.sessions, {});
    assert.deepEqual(withoutCreation.skipped, []);
    assert.equal(replay([notes, startSession('spike_1', 1)]).sessions.spike_1.notes, 'Spike test from d_1');
  });

  test('a set without its session is left out until the session arrives', () => {
    const set = logSet('s_1', 'sess_1', 1);
    assert.deepEqual(replay([set]).sets, {});
    assert.ok(replay([set, startSession('sess_1', 0)]).sets.s_1);
  });
});

describe('deleted entities', () => {
  const log = () => [startSession('sess_1', 0), logSet('s_1', 'sess_1', 1), logSet('s_2', 'sess_1', 2, { setNumber: 2 })];

  test('a deleted set is gone; its siblings stay', () => {
    const state = replay([...log(), del('s_1', 5, 'set')]);
    assert.deepEqual(Object.keys(state.sets), ['s_2']);
  });

  test('patches for a deleted entity are ignored, whatever their ts', () => {
    const state = replay([...log(), del('s_1', 5, 'set'), editSet('s_1', { reps: 99 }, 9), editSet('s_1', { reps: 98 }, 3)]);
    assert.equal(state.sets.s_1, undefined);
  });

  test('a tombstone with an earlier ts than the creation still wins', () => {
    const state = replay([...log(), del('s_1', -30, 'set')]);
    assert.equal(state.sets.s_1, undefined);
  });

  test('deleting a session removes it and its sets, including sets logged after the tombstone', () => {
    const state = replay([...log(), del('sess_1', 5, 'session'), logSet('s_3', 'sess_1', 9, { setNumber: 3 })]);
    assert.deepEqual([state.sessions, state.sets], [{}, {}]);
  });

  test('a tombstone for an entity that does not exist is harmless, and settings cannot be deleted', () => {
    const state = replay([...log(), del('s_404', 5), del('settings', 5), setting('trapBarWeightLbs', 45, 6)]);
    assert.equal(Object.keys(state.sets).length, 2);
    assert.equal(state.settings.trapBarWeightLbs, 45);
  });
});

describe('duplicates', () => {
  test('the same event id twice counts once', () => {
    const s1 = logSet('s_1', 'sess_1', 1);
    const state = replay([startSession('sess_1', 0), s1, { ...s1, recvAt: '2026-09-29T12:00:00.000-07:00' }, s1]);
    assert.equal(Object.keys(state.sets).length, 1);
  });
});

describe('settings, swaps, deloads', () => {
  test('a setting is last-writer-wins per key, and keys do not affect each other', () => {
    const state = replay([
      setting('restTimerDefaultSec', 120, 5),
      setting('restTimerDefaultSec', 90, 1),
      setting('startingWeight:goblet-squat', 20, 2),
      setting('recoveryDays', [2, 4], 3),
    ]);
    assert.deepEqual(state.settings, { restTimerDefaultSec: 120, 'startingWeight:goblet-squat': 20, recoveryDays: [2, 4] });
  });

  test('a setting key called __proto__ does not touch the prototype', () => {
    const state = replay([setting('__proto__', { polluted: true }, 0)]);
    assert.equal({}.polluted, undefined);
    assert.equal(state.settings.polluted, undefined);
  });

  test('swap.set then swap.cleared then swap.set again, per slot', () => {
    const swap = (t, slot, when, id) => ev('swap.set', `swap_${t}_${slot}`, { templateCode: t, slotNumber: slot, exerciseId: id }, when);
    const clear = (t, slot, when) => ev('swap.cleared', `swap_${t}_${slot}`, { templateCode: t, slotNumber: slot }, when);
    const log = [swap('A', 1, 1, 'leg-press'), swap('A', 3, 1, 'hip-thrust'), clear('A', 1, 2), swap('B', 1, 1, 'lat-pulldown')];
    assert.deepEqual(replay(log).swaps, { 'A:3': 'hip-thrust', 'B:1': 'lat-pulldown' });
    assert.deepEqual(replay([...log, swap('A', 1, 3, 'box-squat')]).swaps, { 'A:1': 'box-squat', 'A:3': 'hip-thrust', 'B:1': 'lat-pulldown' });
    assert.deepEqual(replay([...log].reverse()).swaps, replay(log).swaps);
  });

  test('deload events set the record for their program week', () => {
    const state = replay([
      ev('deload.postponed', 'deload_12', { programWeek: 12, postponedFromWeek: 11 }, 2),
      ev('deload.started', 'deload_12', { programWeek: 12, source: 'scheduled' }, 1),
      ev('deload.started', 'deload_18', { programWeek: 18, source: 'manual' }, 3),
    ]);
    assert.deepEqual(state.deloads, {
      12: { programWeek: 12, source: 'scheduled', postponedFromWeek: 11 },
      18: { programWeek: 18, source: 'manual' },
    });
  });
});

describe('time zones and daylight saving', () => {
  test('replay orders by instant across the fall-back hour, not by string', () => {
    const pdt = '2026-11-01T01:30:00.000-07:00-0000-d_a'; // 08:30Z
    const pst = '2026-11-01T01:15:00.000-08:00-0000-d_a'; // 09:15Z: later, though it sorts first as a string
    assert.ok(pst < pdt);
    assert.equal(replay([setting('restTimerDefaultSec', 60, pdt), setting('restTimerDefaultSec', 75, pst)]).settings.restTimerDefaultSec, 75);
    assert.equal(replay([setting('restTimerDefaultSec', 75, pst), setting('restTimerDefaultSec', 60, pdt)]).settings.restTimerDefaultSec, 75);
  });

  test('the same instant written with Z and with an offset ties, then the device decides', () => {
    const a = setting('restTimerDefaultSec', 60, '2026-09-29T12:00:00.000-07:00-0000-d_a');
    const b = setting('restTimerDefaultSec', 75, '2026-09-29T19:00:00.000Z-0000-d_b');
    assert.equal(replay([b, a]).settings.restTimerDefaultSec, 75);
  });
});

describe('events replay cannot use', () => {
  test('unknown types, unknown versions and unusable ts are skipped and reported, and do not stop the rest', () => {
    const good = startSession('sess_1', 0);
    const state = replay([
      good,
      ev('workout.teleported', 'x_1', {}, 1, { id: 'U1' }),
      { ...startSession('sess_2', 1), v: 2, id: 'U2' },
      { ...startSession('sess_3', 1), ts: 'garbage', id: 'U3' },
      { ...startSession('sess_4', 1), payload: null, id: 'U4' },
      null,
      'nonsense',
    ]);
    assert.deepEqual(Object.keys(state.sessions), ['sess_1']);
    assert.deepEqual(state.skipped, [
      { id: 'U1', reason: 'unknown type' },
      { id: 'U2', reason: 'unsupported version' },
      { id: 'U3', reason: 'bad ts' },
      { id: 'U4', reason: 'bad shape' },
    ]);
  });
});

describe('duplicates of events replay cannot use', () => {
  test('are reported once', () => {
    const odd = ev('workout.teleported', 'x_1', {}, 1, { id: 'U1' });
    assert.deepEqual(replay([odd, { ...odd }, odd]).skipped, [{ id: 'U1', reason: 'unknown type' }]);
  });
});

describe('order independence', () => {
  // A log that exercises every rule at once, with events from three devices.
  function richLog() {
    return [
      setting('programStartDate', '2026-09-28', -60),
      setting('restTimerDefaultSec', 90, -50, { device: 'd_a' }),
      setting('restTimerDefaultSec', 120, -49, { device: 'd_b' }),
      startSession('sess_1', 0, { backPainBefore: 2 }, { device: 'd_a' }),
      logSet('s_1', 'sess_1', 1, { setNumber: 1, reps: 12 }, { device: 'd_a' }),
      logSet('s_2', 'sess_1', 3, { setNumber: 2, reps: 11 }, { device: 'd_a' }),
      logSet('s_3', 'sess_1', 5, { setNumber: 3, reps: 10 }, { device: 'd_a' }),
      editSet('s_1', { reps: 13 }, 6, { device: 'd_b' }),
      editSet('s_1', { weightLbs: 30 }, 6.5, { device: 'd_c' }),
      editSet('s_1', { reps: 14 }, 6, { device: 'd_c', counter: 1 }),
      editSet('s_2', { rir: 2 }, 0.5, { device: 'd_b' }), // slow clock: earlier than its creation
      del('s_3', 7, 'set', { device: 'd_a' }),
      editSet('s_3', { reps: 1 }, 8, { device: 'd_b' }),
      noteSession('sess_1', 'first', 9, { device: 'd_a' }),
      noteSession('sess_1', 'second', 9, { device: 'd_b' }),
      finishSession('sess_1', 10, { backPainAfter: 3 }, { device: 'd_a' }),
      startSession('sess_2', 20, {}, { device: 'd_b' }),
      logSet('s_4', 'sess_2', 21, {}, { device: 'd_b' }),
      del('sess_2', 22, 'session', { device: 'd_c' }),
      noteSession('spike_1', 'spike', 3),
      logSet('s_5', 'sess_missing', 4),
      ev('swap.set', 'swap_A_1', { templateCode: 'A', slotNumber: 1, exerciseId: 'leg-press' }, 11),
      ev('swap.cleared', 'swap_A_1', { templateCode: 'A', slotNumber: 1 }, 12),
      ev('swap.set', 'swap_A_2', { templateCode: 'A', slotNumber: 2, exerciseId: 'db-bench-press' }, 11),
      ev('deload.started', 'deload_11', { programWeek: 11, source: 'scheduled' }, 13),
      ev('deload.postponed', 'deload_12', { programWeek: 12, postponedFromWeek: 11 }, 14),
    ];
  }

  // Small deterministic PRNG so a failure can be reproduced.
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  function shuffle(list, next) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  test('the rich log has the state we expect (so the shuffles below compare something real)', () => {
    const state = replay(richLog());
    assert.deepEqual(Object.keys(state.sessions), ['sess_1']);
    assert.deepEqual(Object.keys(state.sets).sort(), ['s_1', 's_2']);
    assert.deepEqual(
      [state.sets.s_1.reps, state.sets.s_1.weightLbs, state.sets.s_2.rir, state.sessions.sess_1.notes],
      [14, 30, 2, 'second'],
    );
    assert.equal(state.settings.restTimerDefaultSec, 120);
    assert.deepEqual(state.swaps, { 'A:2': 'db-bench-press' });
    assert.deepEqual(state.deloads, { 11: { programWeek: 11, source: 'scheduled' }, 12: { programWeek: 12, postponedFromWeek: 11 } });
  });

  test('300 random arrival orders, with duplicates thrown in, give the identical state', () => {
    const log = richLog();
    const expected = replay(log);
    const next = rng(42);
    for (let i = 0; i < 300; i++) {
      const dupes = log.filter(() => next() < 0.3);
      assert.deepEqual(replay(shuffle([...log, ...dupes], next)), expected, `shuffle ${i}`);
    }
  });
});

describe('what the tests build is what the server accepts', () => {
  test('the builders make valid events', () => {
    const now = NOW + 5 * 24 * 3600_000; // BASE is 2026-09-29; the test clock is 2026-10-05
    const events = [
      startSession('sess_1', 0), finishSession('sess_1', 1), noteSession('sess_1', 'x', 2),
      logSet('s_1', 'sess_1', 3), editSet('s_1', { reps: 5 }, 4), setting('trapBarWeightLbs', 45, 5), del('s_1', 6, 'set'),
    ];
    for (const e of events) assert.deepEqual(validateEvent(e, now), [], e.type);
    assert.ok(BASE < now);
  });
});

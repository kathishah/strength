// The events the actions write: each builder's output goes through the server's own validator.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { suggestExercise } from '../app/js/engine/index.js';
import * as make from '../app/js/logging/session-events.js';
import { validateEvent } from '../lambda/events/registry.mjs';
import { makeLog } from '../test-support/engine-log.mjs';
import { ulid } from '../test-support/util.mjs';

const NOW = Date.parse('2026-09-29T12:00:00-07:00');
let n = 0;
const valid = (made, entityId = 'sess_1') => {
  const ev = { id: ulid(++n), ts: '2026-09-29T12:00:00.000-07:00-0000-d_t', v: 1, type: made.type, entityId: made.entityId ?? entityId, payload: made.payload };
  assert.deepEqual(validateEvent(ev, NOW), [], JSON.stringify(made));
  return ev;
};
const suggest = (id, t, slot) => suggestExercise(makeLog().state(), { exerciseId: id, templateCode: t, slot, today: '2026-09-29' });
const calendar = { programWeek: 1, phase: 1 };

describe('session.started', () => {
  test('carries the template, Pacific start time, week, phase and isDeload false', () => {
    const { payload } = make.sessionStarted({ templateCode: 'A', nowMs: NOW, calendar });
    assert.deepEqual(payload, { templateCode: 'A', startedAt: '2026-09-29T12:00:00.000-07:00', programWeek: 1, phase: 1, isDeload: false });
    valid(make.sessionStarted({ templateCode: 'A', nowMs: NOW, calendar }));
  });

  test('back pain before is included when given (0 counts) and left out when skipped', () => {
    assert.equal(make.sessionStarted({ templateCode: 'B', nowMs: NOW, calendar, backPainBefore: 0 }).payload.backPainBefore, 0);
    assert.equal(Object.hasOwn(make.sessionStarted({ templateCode: 'B', nowMs: NOW, calendar }).payload, 'backPainBefore'), false);
    valid(make.sessionStarted({ templateCode: 'C', nowMs: NOW, calendar: { programWeek: 6, phase: 2 }, backPainBefore: 10 }));
  });
});

describe('set.logged', () => {
  const values = (extra) => ({ weightLbs: null, levelNumber: null, reps: null, distanceM: null, rir: null, ...extra });

  test('a weighted set records what was done and what was suggested', () => {
    const s = suggest('goblet-squat', 'A', 1);
    const { payload } = make.setLogged({ sessionId: 'sess_1', exerciseId: 'goblet-squat', setNumber: 2, values: values({ weightLbs: 25, reps: 11, rir: 2 }), suggestion: s });
    assert.deepEqual(payload, {
      sessionId: 'sess_1', exerciseId: 'goblet-squat', setNumber: 2, isRampUp: false, isCalibration: false, completed: true,
      suggestedWeightLbs: 20, suggestionSource: 'starting', weightLbs: 25, reps: 11, rir: 2,
    });
    valid(make.setLogged({ sessionId: 'sess_1', exerciseId: 'goblet-squat', setNumber: 2, values: values({ weightLbs: 25, reps: 11, rir: 2 }), suggestion: s }), 'set_1');
  });

  test('every kind of exercise produces a valid event: level, carry, bodyweight, hold, weight 0', () => {
    const cases = [
      ['trx-squat', 'A', 1, values({ levelNumber: 3, reps: 12 })],
      ['pushup', 'B', 5, values({ levelNumber: 1, reps: 10 })],
      ['farmer-carry', 'C', 5, values({ weightLbs: 35, distanceM: 40 })],
      ['dead-bug', 'A', 5, values({ reps: 8 })],
      ['trx-plank', 'A', 5, values()],
      ['leg-press', 'B', 1, values({ weightLbs: 0, reps: 12 })],
      ['back-extension-45', 'B', 6, values({ weightLbs: 0, reps: 12 })],
    ];
    for (const [id, t, slot, v] of cases) {
      const made = make.setLogged({ sessionId: 'sess_1', exerciseId: id, setNumber: 1, values: v, suggestion: suggest(id, t, slot) });
      valid(made, 'set_1');
      assert.equal(made.payload.isRampUp, false);
      assert.equal(made.payload.isCalibration, false);
      assert.equal(made.payload.completed, true);
    }
  });

  test('weight 0 is written, not dropped as empty', () => {
    const made = make.setLogged({ sessionId: 's', exerciseId: 'leg-press', setNumber: 1, values: values({ weightLbs: 0, reps: 10 }), suggestion: suggest('leg-press', 'B', 1) });
    assert.equal(made.payload.weightLbs, 0);
    assert.equal(made.payload.suggestedWeightLbs, 0);
  });
});

describe('set.edited', () => {
  const logged = { weightLbs: 25, reps: 10, levelNumber: undefined, distanceM: undefined, rir: undefined };
  test('only what changed; nothing changed is no event', () => {
    assert.deepEqual(make.setEdited({ logged, values: { weightLbs: 25, reps: 10, levelNumber: null, distanceM: null, rir: null } }), null);
    const made = make.setEdited({ logged, values: { weightLbs: 27.5, reps: 10, levelNumber: null, distanceM: null, rir: 1 } });
    assert.deepEqual(made.payload, { weightLbs: 27.5, rir: 1 });
    valid(made, 'set_1');
  });

  test('an emptied optional box is cleared with null', () => {
    const made = make.setEdited({ logged: { ...logged, rir: 2 }, values: { weightLbs: 25, reps: 10, rir: null } });
    assert.deepEqual(made.payload, { rir: null });
    valid(made, 'set_1');
  });
});

describe('the rest', () => {
  test('finish, notes, delete and swap events are valid', () => {
    const fin = make.sessionFinished({ nowMs: NOW, backPainAfter: 3 });
    assert.deepEqual(fin.payload, { finishedAt: '2026-09-29T12:00:00.000-07:00', backPainAfter: 3 });
    valid(fin);
    assert.deepEqual(make.sessionFinished({ nowMs: NOW }).payload, { finishedAt: '2026-09-29T12:00:00.000-07:00' });
    valid(make.sessionFinished({ nowMs: NOW, backPainAfter: 0 }));
    valid(make.sessionNotes('Knee felt fine.'));
    valid(make.sessionNotes(''));
    valid(make.setDeleted(), 'set_1');
    valid(make.sessionDeleted());
    valid(make.swapChanged({ templateCode: 'A', slotNumber: 3, exerciseId: 'hip-thrust', defaultExerciseId: 'db-romanian-deadlift' }));
    const cleared = make.swapChanged({ templateCode: 'A', slotNumber: 3, exerciseId: 'db-romanian-deadlift', defaultExerciseId: 'db-romanian-deadlift' });
    assert.equal(cleared.type, 'swap.cleared');
    assert.equal(cleared.entityId, 'swap_A_3');
    valid(cleared);
  });
});

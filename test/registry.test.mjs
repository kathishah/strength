import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent, validateBatch, REGISTRY, MAX_EVENTS_PER_REQUEST } from '../lambda/events/registry.mjs';
import { makeEvent, NOW, ulid } from '../test-support/util.mjs';

const fields = (errs) => errs.map((e) => e.field);
const withPayload = (patch, base = makeEvent(1)) => ({ ...base, payload: { ...base.payload, ...patch } });

describe('event envelope', () => {
  test('accepts the example set.logged event from the plan', () => {
    assert.deepEqual(validateEvent(makeEvent(1), NOW), []);
  });

  test('rejects an unknown type and an unknown version', () => {
    assert.deepEqual(fields(validateEvent(makeEvent(1, { type: 'set.exploded' }), NOW)), ['type']);
    assert.deepEqual(fields(validateEvent(makeEvent(1, { v: 2 }), NOW)), ['v']);
    assert.deepEqual(fields(validateEvent(makeEvent(1, { v: '1' }), NOW)), ['v']);
  });

  test('rejects ids that are not ULIDs', () => {
    for (const id of ['abc', ulid(1).slice(1), ulid(1).replace('0', 'U'), '8'.padEnd(26, '0'), 42, undefined]) {
      assert.deepEqual(fields(validateEvent(makeEvent(1, { id }), NOW)), ['id'], String(id));
    }
  });

  test('rejects malformed ts values', () => {
    for (const ts of ['2026-10-05', '2026-10-05T11:00:00.000Z', '2026-10-05T11:00:00.000Z-0003', '2026-02-30T11:00:00.000Z-0003-d_1', 5]) {
      assert.deepEqual(fields(validateEvent(makeEvent(1, { ts }), NOW)), ['ts'], String(ts));
    }
  });

  test('ts may be up to 1 day ahead, not more', () => {
    const at = (ms) => new Date(NOW + ms).toISOString() + '-0001-d_1';
    assert.deepEqual(validateEvent(makeEvent(1, { ts: at(24 * 3600 * 1000) }), NOW), []);
    assert.deepEqual(fields(validateEvent(makeEvent(1, { ts: at(24 * 3600 * 1000 + 1) }), NOW)), ['ts']);
  });

  test('clients may not set recvAt or other unknown envelope fields', () => {
    assert.deepEqual(fields(validateEvent(makeEvent(1, { recvAt: '2026-10-05T00:00:00.000Z' }), NOW)), ['recvAt']);
    assert.deepEqual(fields(validateEvent(makeEvent(1, { extra: 1 }), NOW)), ['extra']);
  });

  test('entityId is required and must be a plain id', () => {
    for (const entityId of [undefined, '', 'has space', 'a/b', 'x'.repeat(81)]) {
      assert.deepEqual(fields(validateEvent(makeEvent(1, { entityId }), NOW)), ['entityId'], String(entityId));
    }
  });

  test('non-objects are rejected without throwing', () => {
    for (const bad of [null, 5, 'x', [], undefined]) {
      assert.deepEqual(fields(validateEvent(bad, NOW)), ['event']);
    }
  });
});

describe('payload ranges (plan section 3)', () => {
  const cases = [
    ['weightLbs', 0, 1000, 1001],
    ['reps', 0, 500, 501],
    ['rir', 0, 10, 11],
    ['levelNumber', 1, 5, 6],
  ];
  for (const [name, lo, hi, over] of cases) {
    test(`${name}: ${lo} and ${hi} pass, ${over} and below ${lo} fail`, () => {
      assert.deepEqual(validateEvent(withPayload({ [name]: lo }), NOW), []);
      assert.deepEqual(validateEvent(withPayload({ [name]: hi }), NOW), []);
      assert.deepEqual(fields(validateEvent(withPayload({ [name]: over }), NOW)), [`payload.${name}`]);
      assert.deepEqual(fields(validateEvent(withPayload({ [name]: lo - 1 }), NOW)), [`payload.${name}`]);
    });
  }

  test('numbers must be numbers, integers where required', () => {
    assert.deepEqual(fields(validateEvent(withPayload({ reps: '12' }), NOW)), ['payload.reps']);
    assert.deepEqual(fields(validateEvent(withPayload({ reps: 12.5 }), NOW)), ['payload.reps']);
    assert.deepEqual(fields(validateEvent(withPayload({ weightLbs: NaN }), NOW)), ['payload.weightLbs']);
    assert.deepEqual(validateEvent(withPayload({ weightLbs: 27.5 }), NOW), []);
  });

  test('nullable fields accept null (bodyweight sets have no weight)', () => {
    assert.deepEqual(validateEvent(withPayload({ weightLbs: null, rir: null }), NOW), []);
  });

  test('back pain is 0-10 on session events', () => {
    const started = (backPainBefore) => ({
      ...makeEvent(2, { type: 'session.started', entityId: 'sess_1' }),
      payload: { templateCode: 'A', startedAt: '2026-10-05T11:00:00.000Z', programWeek: 2, phase: 1, isDeload: false, backPainBefore },
    });
    assert.deepEqual(validateEvent(started(0), NOW), []);
    assert.deepEqual(validateEvent(started(10), NOW), []);
    assert.deepEqual(fields(validateEvent(started(11), NOW)), ['payload.backPainBefore']);
    const finished = (backPainAfter) => makeEvent(3, { type: 'session.finished', entityId: 'sess_1', payload: { finishedAt: '2026-10-05T12:00:00.000Z', backPainAfter } });
    assert.deepEqual(fields(validateEvent(finished(-1), NOW)), ['payload.backPainAfter']);
  });
});

describe('required fields and unknown fields', () => {
  test('missing required payload fields are named', () => {
    const ev = makeEvent(1);
    delete ev.payload.sessionId;
    delete ev.payload.isRampUp;
    assert.deepEqual(fields(validateEvent(ev, NOW)).sort(), ['payload.isRampUp', 'payload.sessionId']);
  });

  test('unknown payload fields are rejected', () => {
    assert.deepEqual(fields(validateEvent(withPayload({ surprise: 1 }), NOW)), ['payload.surprise']);
  });

  test('payload must be an object', () => {
    assert.deepEqual(fields(validateEvent(makeEvent(1, { payload: null }), NOW)), ['payload']);
    assert.deepEqual(fields(validateEvent(makeEvent(1, { payload: [] }), NOW)), ['payload']);
  });

  test('set.edited must change at least one field', () => {
    const edited = (payload) => makeEvent(4, { type: 'set.edited', entityId: 's_1', payload });
    assert.deepEqual(validateEvent(edited({ reps: 11 }), NOW), []);
    assert.deepEqual(fields(validateEvent(edited({}), NOW)), ['payload']);
    // identity fields cannot be edited
    assert.deepEqual(fields(validateEvent(edited({ exerciseId: 'x' }), NOW)), ['payload.exerciseId', 'payload']);
  });

  test('every registered type has a v1 spec and the plan section 4 types are all present', () => {
    const expected = ['session.started', 'session.finished', 'set.logged', 'set.edited', 'session.notes', 'setting.changed', 'swap.set', 'swap.cleared', 'deload.started', 'deload.postponed', 'entity.deleted'];
    assert.deepEqual(Object.keys(REGISTRY).sort(), expected.sort());
    for (const t of expected) assert.ok(REGISTRY[t][1], t);
  });
});

describe('other event types', () => {
  const ev = (type, payload, entityId = 'e_1') => makeEvent(5, { type, entityId, payload });

  test('valid samples of the remaining types pass', () => {
    const samples = [
      ev('session.notes', { notes: 'felt fine' }),
      ev('swap.set', { templateCode: 'A', slotNumber: 3, exerciseId: 'bird-dog' }),
      ev('swap.cleared', { templateCode: 'A', slotNumber: 3 }),
      ev('deload.started', { programWeek: 11, source: 'scheduled' }),
      ev('deload.postponed', { programWeek: 12, postponedFromWeek: 11 }),
      ev('entity.deleted', {}),
      ev('entity.deleted', { entityType: 'set' }),
    ];
    for (const s of samples) assert.deepEqual(validateEvent(s, NOW), [], s.type);
  });

  test('invalid values fail', () => {
    assert.deepEqual(fields(validateEvent(ev('swap.set', { templateCode: 'D', slotNumber: 3, exerciseId: 'bird-dog' }), NOW)), ['payload.templateCode']);
    assert.deepEqual(fields(validateEvent(ev('swap.set', { templateCode: 'A', slotNumber: 7, exerciseId: 'bird-dog' }), NOW)), ['payload.slotNumber']);
    assert.deepEqual(fields(validateEvent(ev('deload.started', { programWeek: 11, source: 'whim' }), NOW)), ['payload.source']);
    assert.deepEqual(fields(validateEvent(ev('session.notes', { notes: 'x'.repeat(4001) }), NOW)), ['payload.notes']);
  });

  test('setting.changed checks the key and the value range', () => {
    const s = (key, value) => ev('setting.changed', { key, value });
    assert.deepEqual(validateEvent(s('startingWeight:goblet-squat', 20), NOW), []);
    assert.deepEqual(validateEvent(s('trapBarWeightLbs', 45), NOW), []);
    assert.deepEqual(validateEvent(s('programStartDate', '2026-09-28'), NOW), []);
    assert.deepEqual(validateEvent(s('scheduledIncreasesEnabled', false), NOW), []);
    assert.deepEqual(fields(validateEvent(s('startingWeight:goblet-squat', 1001), NOW)), ['payload.value']);
    assert.deepEqual(fields(validateEvent(s('programStartDate', '2026-02-30'), NOW)), ['payload.value']);
    assert.deepEqual(fields(validateEvent(s('nonsense', 1), NOW)), ['payload.key']);
    assert.deepEqual(fields(validateEvent(s('startingWeight:Bad Id', 1), NOW)), ['payload.key']);
    assert.deepEqual(fields(validateEvent(s('startingWeight', 1), NOW)), ['payload.key']);
    assert.deepEqual(fields(validateEvent(s('trapBarWeightLbs:goblet-squat', 1), NOW)), ['payload.key']);
  });
});

describe('batch validation', () => {
  const batch = (events, deviceId = 'd_7f3a') => ({ deviceId, events });

  test('accepts up to 200 events, rejects 201', () => {
    const many = (n) => Array.from({ length: n }, (_, i) => makeEvent(i + 1));
    assert.deepEqual(validateBatch(batch(many(MAX_EVENTS_PER_REQUEST)), NOW).errors, []);
    assert.equal(validateBatch(batch(many(MAX_EVENTS_PER_REQUEST + 1)), NOW).errors[0].field, 'events');
  });

  test('reports the index and id of each bad event', () => {
    const bad = makeEvent(2, { type: 'nope' });
    const { errors } = validateBatch(batch([makeEvent(1), bad, makeEvent(3, { v: 9 })]), NOW);
    assert.deepEqual(
      errors.map((e) => [e.index, e.field]),
      [[1, 'type'], [2, 'v']],
    );
    assert.equal(errors[0].id, bad.id);
  });

  test('deviceId and events are required, events non-empty', () => {
    assert.equal(validateBatch(batch([makeEvent(1)], null), NOW).errors[0].field, 'deviceId');
    assert.equal(validateBatch({ deviceId: 'd_1' }, NOW).errors[0].field, 'events');
    assert.equal(validateBatch(batch([]), NOW).errors[0].field, 'events');
    assert.equal(validateBatch(null, NOW).errors[0].field, 'body');
  });
});

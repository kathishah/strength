import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvents, pacificLocalToMs } from '../scripts/build-events.mjs';
import { pacificIso } from '../lambda/events/time.mjs';
import { validateBatch, compareTs } from '../lambda/events/registry.mjs';

test('pacificLocalToMs is right in summer, winter and around the changeovers', () => {
  assert.equal(pacificIso(pacificLocalToMs('2026-09-28', '11:00')), '2026-09-28T11:00:00.000-07:00');
  assert.equal(pacificIso(pacificLocalToMs('2026-12-15', '11:00')), '2026-12-15T11:00:00.000-08:00');
  assert.equal(pacificIso(pacificLocalToMs('2026-03-08', '12:00')), '2026-03-08T12:00:00.000-07:00');
  assert.equal(pacificIso(pacificLocalToMs('2026-11-01', '12:00')), '2026-11-01T12:00:00.000-08:00');
});

test('buildEvents makes a valid, chronological session with a settings event', () => {
  const spec = {
    date: '2026-06-01', startTime: '07:00', endTime: '07:30', templateCode: 'B', programWeek: 3, phase: 1,
    deviceId: 'd_test', programStartDate: '2026-05-18',
    exercises: [
      { exerciseId: 'leg-press', weightLbs: 50, suggestedWeightLbs: 50, reps: [10, 10] },
      { exerciseId: 'lat-pulldown', weightLbs: 60, suggestedWeightLbs: 60, reps: [12] },
    ],
  };
  const body = buildEvents(spec);
  assert.deepEqual(body.events.map((e) => e.type), ['setting.changed', 'session.started', 'set.logged', 'set.logged', 'set.logged', 'session.finished']);
  assert.deepEqual(validateBatch(body, Date.parse('2026-06-02T00:00:00Z')).errors, []);
  for (let i = 1; i < body.events.length; i++) assert.equal(compareTs(body.events[i - 1].ts, body.events[i].ts), -1);
  assert.equal(new Set(body.events.map((e) => e.id)).size, body.events.length);
  const sets = body.events.filter((e) => e.type === 'set.logged');
  assert.ok(sets.every((s) => s.payload.sessionId === body.events[1].entityId));
  assert.deepEqual(sets.map((s) => s.payload.setNumber), [1, 2, 1]);
});

test('rebuilding the same workout gives identical ids, so re-posting is a no-op on the server', () => {
  const spec = {
    date: '2026-06-01', startTime: '07:00', endTime: '07:30', templateCode: 'B', programWeek: 3, phase: 1,
    deviceId: 'd_test', exercises: [{ exerciseId: 'leg-press', weightLbs: 50, suggestedWeightLbs: 50, reps: [10, 10] }],
  };
  assert.deepEqual(buildEvents(spec), buildEvents(spec));
  const other = buildEvents({ ...spec, date: '2026-06-02' });
  assert.notEqual(other.events[0].id, buildEvents(spec).events[0].id);
});

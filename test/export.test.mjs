// The export script's pure parts (plan section 15e): CSV of logged sets and paging through GET /events.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_COLUMNS, eventsToCsv, fetchAllEvents } from '../scripts/export-lib.mjs';
import { del, editSet, finishSession, logSet, startSession } from '../test-support/events.mjs';

const parse = (csv) => csv.trimEnd().split('\n').map((l) => l.split(','));

describe('eventsToCsv', () => {
  const base = () => [
    startSession('sess_1', 0),
    logSet('set_1', 'sess_1', 1, { setNumber: 1, suggestedWeightLbs: 20, suggestionSource: 'starting', weightLbs: 20, reps: 12 }),
    logSet('set_2', 'sess_1', 2, { setNumber: 2, weightLbs: 20, reps: 11 }),
    logSet('set_3', 'sess_1', 3, { exerciseId: 'db-bench-press', setNumber: 1, weightLbs: 22.5, reps: 8 }),
    finishSession('sess_1', 30),
  ];

  test('has a header and one row per working set, in workout order', () => {
    const rows = parse(eventsToCsv(base()));
    assert.deepEqual(rows[0], CSV_COLUMNS);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[1].slice(0, 12), ['2026-09-29', 'A', '1', '1', 'sess_1', 'goblet-squat', 'Goblet Squat', '1', '20', '', '12', '']);
    assert.deepEqual(rows[1].slice(12), ['20', 'starting', 'set_1']);
    assert.deepEqual(rows.slice(1).map((r) => [r[5], r[7]]), [['goblet-squat', '1'], ['goblet-squat', '2'], ['db-bench-press', '1']]);
  });

  test('edits are applied, deleted sets and deleted sessions are gone, ramp-up and not-completed sets are left out', () => {
    const events = [
      ...base(),
      editSet('set_2', { weightLbs: 25, reps: 9 }, 40),
      del('set_3', 41, 'set'),
      logSet('set_4', 'sess_1', 42, { setNumber: 3, isRampUp: true, weightLbs: 10, reps: 5 }),
      logSet('set_5', 'sess_1', 43, { setNumber: 4, completed: false, weightLbs: 10, reps: 5 }),
      startSession('sess_2', 100),
      logSet('set_6', 'sess_2', 101, { setNumber: 1 }),
      del('sess_2', 102, 'session'),
    ];
    const rows = parse(eventsToCsv(events));
    assert.deepEqual(rows.slice(1).map((r) => [r[14], r[8], r[10]]), [['set_1', '20', '12'], ['set_2', '25', '9']]);
  });

  test('duplicated and shuffled events give the same file; cells with commas or quotes are quoted', () => {
    const events = base();
    const a = eventsToCsv(events);
    assert.equal(eventsToCsv([...events, ...events].reverse()), a);
    const odd = [startSession('sess_q', 0), logSet('set_q', 'sess_q', 1, { exerciseId: 'unknown, "odd"', weightLbs: 5, reps: 5 })];
    assert.match(eventsToCsv(odd), /"unknown, ""odd"""/);
  });

  test('an empty log is just the header', () => {
    assert.equal(eventsToCsv([]), `${CSV_COLUMNS.join(',')}\n`);
  });
});

describe('fetchAllEvents', () => {
  test('follows the cursor until there is nothing more and de-duplicates by id', async () => {
    const pages = {
      '': { events: [{ id: 'a' }, { id: 'b' }], cursor: '2026-09:2', more: true },
      '2026-09:2': { events: [{ id: 'b' }, { id: 'c' }], cursor: '2026-10:1', more: true },
      '2026-10:1': { events: [{ id: 'd' }], cursor: '2026-10:2', more: false },
    };
    const asked = [];
    const events = await fetchAllEvents(async (path) => {
      asked.push(path);
      const since = new URL(path, 'https://x').searchParams.get('since') ?? '';
      return pages[since];
    }, { limit: 2 });
    assert.deepEqual(events.map((e) => e.id), ['a', 'b', 'c', 'd']);
    assert.deepEqual(asked, ['/events?limit=2', '/events?limit=2&since=2026-09%3A2', '/events?limit=2&since=2026-10%3A1']);
  });

  test('an empty log, and a server that says "more" without moving the cursor', async () => {
    assert.deepEqual(await fetchAllEvents(async () => ({ events: [], cursor: null, more: false })), []);
    await assert.rejects(fetchAllEvents(async () => ({ events: [{ id: 'a' }], cursor: 'c', more: true })), /did not move the cursor/);
  });
});

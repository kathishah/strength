// The bundled seed data is a verbatim copy of the frozen v0.2 viewer's data (spec 0.C).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EXERCISES, PLACEHOLDER_GIF, RECOVERY, RECOVERY_LABEL, WORKOUTS } from '../app/js/seed/index.js';
import { validateEvent } from '../lambda/events/registry.mjs';
import { NOW, makeEvent } from '../test-support/util.mjs';

const viewer = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Pulls `  const NAME = <literal>;` out of the viewer's inline script and evaluates just the literal.
function viewerConst(name) {
  const m = new RegExp(`\\n  const ${name} =\\s*`).exec(viewer);
  assert.ok(m, `${name} not found in index.html`);
  const from = m.index + m[0].length;
  return vm.runInNewContext(`(${viewer.slice(from, viewer.indexOf(';\n', from))})`);
}
// The literal is evaluated in another realm; compare as plain JSON data.
const plain = (x) => JSON.parse(JSON.stringify(x));

describe('seed matches the frozen v0.2 viewer', () => {
  test('exercise catalog', () => assert.deepEqual(plain(EXERCISES), plain(viewerConst('EXERCISES'))));
  test('recovery routine', () => assert.deepEqual(plain(RECOVERY), plain(viewerConst('RECOVERY'))));
  test('workout templates', () => assert.deepEqual(plain(WORKOUTS), plain(viewerConst('WORKOUTS'))));
  test('recovery label and placeholder image', () => {
    assert.equal(RECOVERY_LABEL, viewerConst('RECOVERY_LABEL'));
    assert.equal(PLACEHOLDER_GIF, viewerConst('PLACEHOLDER_GIF'));
  });
});

describe('seed integrity', () => {
  const ids = Object.keys(EXERCISES);

  test('the catalog is the 49 exercises of the viewer', () => assert.equal(ids.length, 49));

  test('every id the templates and routine mention exists in the catalog', () => {
    const referenced = [];
    for (const w of Object.values(WORKOUTS)) {
      for (const s of w.slots) referenced.push(s.exercise, ...s.alternatives, ...s.trxAlternatives);
    }
    for (const r of RECOVERY) referenced.push(r.exercise);
    const missing = [...new Set(referenced)].filter((id) => !Object.hasOwn(EXERCISES, id));
    assert.deepEqual(missing, []);
  });

  test('templates are A, B, C with slots numbered 1..n in order', () => {
    assert.deepEqual(Object.keys(WORKOUTS), ['A', 'B', 'C']);
    for (const w of Object.values(WORKOUTS)) {
      assert.deepEqual(w.slots.map((s) => s.slot), w.slots.map((_, i) => i + 1));
    }
  });

  test('every exercise id is accepted by the server in set.logged and swap.set events', () => {
    for (const id of ids) {
      const set = makeEvent(1, { payload: { ...makeEvent(1).payload, exerciseId: id } });
      assert.deepEqual(validateEvent(set, NOW), [], `set.logged ${id}`);
      const swap = makeEvent(2, { type: 'swap.set', entityId: 'swap_A_1', payload: { templateCode: 'A', slotNumber: 1, exerciseId: id } });
      assert.deepEqual(validateEvent(swap, NOW), [], `swap.set ${id}`);
    }
  });
});

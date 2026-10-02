// The bundled seed data (spec 4.3, 4.5 to 4.5.3). It began as a copy of the v0.2 viewer's data; the viewer is retired (the root
// index.html redirects to the app, spec 0.C), so the seed is the only copy and nothing here compares against it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXERCISES, PLACEHOLDER_GIF, RECOVERY, RECOVERY_LABEL, WORKOUTS } from '../app/js/seed/index.js';
import { validateEvent } from '../lambda/events/registry.mjs';
import { NOW, makeEvent } from '../test-support/util.mjs';

describe('seed basics', () => {
  test('recovery routine, its label and the placeholder image', () => {
    assert.equal(RECOVERY.length, 8);
    assert.equal(RECOVERY_LABEL, 'Sitting recovery · ~10 min, 2 rounds');
    assert.match(PLACEHOLDER_GIF, /^data:image\/svg\+xml,/);
  });

  test('no slot has a superset (spec v1.19)', () => {
    for (const w of Object.values(WORKOUTS)) for (const s of w.slots) assert.equal('superset' in s, false, `slot ${s.slot}`);
  });

  test('every slot has 1 to 4 non-TRX alternatives, none repeated or equal to the slot exercise (spec 4.5)', () => {
    for (const [code, w] of Object.entries(WORKOUTS)) {
      for (const s of w.slots) {
        const all = [s.exercise, ...s.alternatives, ...s.trxAlternatives];
        assert.equal(new Set(all).size, all.length, `${code}${s.slot} has a repeated exercise`);
        assert.ok(s.alternatives.length >= 1 && s.alternatives.length <= 4, `${code}${s.slot} has ${s.alternatives.length} alternatives`);
      }
    }
  });

  test('every image is our own copy, img/<id>.gif or .webp, with a source in scripts/image-sources.json (spec 4.5.3)', () => {
    const sources = JSON.parse(readFileSync(new URL('../scripts/image-sources.json', import.meta.url), 'utf8'));
    for (const [id, e] of Object.entries(EXERCISES)) {
      if (!e.gifUrl) { assert.equal(Object.hasOwn(sources, id), false, `${id} has a source but no image`); continue; }
      assert.match(e.gifUrl, new RegExp(`^img/${id}\\.(gif|webp)$`), `${id} image path`);
      assert.match(sources[id] ?? '', /^https:\/\//, `${id} has no source URL`);
      assert.ok(e.attribution.label && e.attribution.url, `${id} has no credit`);
    }
  });

  test('images of the exercises added in v1.19 are set, with a credit (spec 4.5.3)', () => {
    const added = ['hack-squat', 'leg-extension', 'seated-leg-curl', 'cable-glute-kickback', 'cable-chest-press', 'pec-deck-fly',
      'incline-machine-press', 'machine-high-row', 'one-arm-db-row', 'single-arm-cable-row', 'cable-reverse-fly',
      'chest-supported-rear-delt-raise', 'db-lateral-raise', 'plank', 'goblet-carry', 'trap-bar-carry'];
    for (const id of added) {
      assert.match(EXERCISES[id].gifUrl, /^img\//, `${id} image`);
      assert.ok(EXERCISES[id].attribution.label && EXERCISES[id].attribution.url, `${id} credit`);
    }
  });
});

describe('seed integrity', () => {
  const ids = Object.keys(EXERCISES);

  test('the catalog has 65 exercises (49 of v1.6 and the 16 added in v1.19)', () => assert.equal(ids.length, 65));

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

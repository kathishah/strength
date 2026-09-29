// app/js/seed/rules.js against the spec: the tables are read out of SPEC-strength.md, so an edited spec fails here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXERCISES, WORKOUTS, RECOVERY } from '../app/js/seed/index.js';
import { GUIDANCE_ONLY, PROGRAM, PUSHUP_LADDER, RULES, SLOT_SETS } from '../app/js/seed/rules.js';

const spec = readFileSync(new URL('../SPEC-strength.md', import.meta.url), 'utf8');

// Text of a section: from a line starting with `heading` to the next heading of the same or higher level.
function section(heading) {
  const start = spec.indexOf(`\n${heading}`);
  assert.ok(start >= 0, `${heading} not found in the spec`);
  const level = /^#+/.exec(heading)[0].length;
  const rest = spec.slice(start + 1 + heading.length);
  const m = new RegExp(`\\n#{1,${level}} `).exec(rest);
  return m ? rest.slice(0, m.index) : rest;
}

// Rows of every markdown table in the text, as arrays of trimmed cells (header and separator rows dropped).
function tableRows(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const rows = [];
  lines.forEach((l, i) => {
    if (!l.startsWith('|') || /^\|[\s|:-]+\|?$/.test(l)) return;
    if (/^\|[\s|:-]+\|?$/.test(lines[i + 1] ?? '')) return; // header
    rows.push(l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  });
  return rows;
}

// Exercise name in the spec ("Dumbbell bench press", "TRX Bulgarian split squat (rear foot in strap)") -> catalog id.
const norm = (s) => s.replace(/\s*\(.*\)\s*$/, '').replace(/\s*\(one side\)/, '').toLowerCase();
const idByName = new Map(Object.entries(EXERCISES).map(([id, e]) => [norm(e.name), id]));
function idOf(name) {
  const id = idByName.get(norm(name));
  assert.ok(id, `no catalog exercise named "${name}"`);
  return id;
}

// "8–12" -> {repMin, repMax}; "8 per side" -> 8..8 per side; "8–12 per leg"; "2 × 20–40 s hold"; "40 m".
function parseReps(text) {
  const range = /(\d+)\s*[–-]\s*(\d+)/.exec(text);
  const perSide = /per (side|leg)/.test(text);
  if (/\d+ m$/.test(text)) return { distanceM: Number(/(\d+) m/.exec(text)[1]) };
  if (/s hold/.test(text)) return { holdSeconds: { min: Number(range[1]), max: Number(range[2]) } };
  if (range) return { repMin: Number(range[1]), repMax: Number(range[2]), perSide };
  const single = /^(\d+) per/.exec(text);
  return { repMin: Number(single[1]), repMax: Number(single[1]), perSide };
}

describe('rules.js covers the catalog', () => {
  test('every catalog id has rules, or is guidance only, never both', () => {
    for (const id of Object.keys(EXERCISES)) {
      const has = Object.hasOwn(RULES, id);
      const guidance = GUIDANCE_ONLY.includes(id);
      assert.ok(has !== guidance, `${id}: ${has ? 'has rules and is listed guidance-only' : 'no rules and not guidance-only'}`);
    }
    for (const id of Object.keys(RULES)) assert.ok(Object.hasOwn(EXERCISES, id), `rules for unknown exercise ${id}`);
  });

  test('guidance-only ids are recovery items and appear in no slot or alternatives', () => {
    const recovery = RECOVERY.map((r) => r.exercise);
    const inSlots = new Set();
    for (const w of Object.values(WORKOUTS)) {
      for (const s of w.slots) [s.exercise, ...s.alternatives, ...s.trxAlternatives].forEach((id) => inSlots.add(id));
    }
    for (const id of GUIDANCE_ONLY) {
      assert.ok(recovery.includes(id), `${id} is not in the recovery routine`);
      assert.ok(!inSlots.has(id), `${id} is a slot or alternative but has no rules`);
    }
  });

  test('every slot exercise and alternative has rules', () => {
    for (const w of Object.values(WORKOUTS)) {
      for (const s of w.slots) {
        for (const id of [s.exercise, ...s.alternatives, ...s.trxAlternatives]) assert.ok(RULES[id], `no rules for ${id}`);
      }
    }
  });

  test('each rules entry has the same type as the catalog, and a consistent progression', () => {
    for (const [id, r] of Object.entries(RULES)) {
      assert.equal(r.type, EXERCISES[id].type, `${id} type`);
      if (r.progression === 'load') {
        assert.ok(r.loadIncrementLbs > 0, `${id} needs a load increment`);
        assert.ok(['dumbbell', 'barbell', 'machine', 'cable', 'bodyweight_loadable', 'carry'].includes(r.type), `${id} load type`);
      }
      if (r.progression === 'suspension') {
        assert.equal(r.type, 'suspension');
        assert.equal(r.startingLevel, 2, `${id} starts at level 2 (spec 4.5.1)`);
      }
      if (r.repMin !== null) assert.ok(r.repMin <= r.repMax, `${id} rep range`);
    }
  });

  test('rules reference no field the spec section 8 does not know', () => {
    const allowed = new Set([
      'type', 'progression', 'repMin', 'repMax', 'perSide', 'holdSeconds', 'targetDistanceM', 'loadIncrementLbs',
      'startingWeightLbs', 'firstLoadedWeightLbs', 'startingLevel', 'loadsBack',
    ]);
    for (const [id, r] of Object.entries(RULES)) {
      for (const k of Object.keys(r)) assert.ok(allowed.has(k), `${id}.${k}`);
    }
  });
});

describe('rules.js matches spec 4.3 (slots, sets, reps)', () => {
  const s43 = section('### 4.3 Workouts');
  for (const code of ['A', 'B', 'C']) {
    test(`Workout ${code}`, () => {
      const block = s43.split(`**Workout ${code}**`)[1].split('**Workout')[0].split('**Exercise cues')[0];
      const rows = tableRows(block);
      assert.equal(rows.length, WORKOUTS[code].slots.length);
      rows.forEach(([slot, , name, sets, repsText], i) => {
        const s = WORKOUTS[code].slots[i];
        const id = idOf(name);
        assert.equal(Number(slot), s.slot);
        assert.equal(id, s.exercise, `${code} slot ${slot} exercise`);
        assert.equal(SLOT_SETS[code][i], Number(sets), `${code} slot ${slot} Phase 2 sets`);
        const r = RULES[id];
        if (/ladder/.test(repsText)) {
          const level1 = parseReps(/standard: ([^)]*)/.exec(repsText)[1]);
          assert.deepEqual([r.repMin, r.repMax], [level1.repMin, level1.repMax]);
        } else {
          const want = parseReps(repsText);
          if (want.distanceM) assert.equal(r.targetDistanceM, want.distanceM, `${id} distance`);
          else assert.deepEqual({ repMin: r.repMin, repMax: r.repMax, perSide: r.perSide }, want, `${id} reps`);
        }
      });
    });
  }

  test('SLOT_SETS has exactly the slots of the templates', () => {
    for (const code of ['A', 'B', 'C']) assert.equal(SLOT_SETS[code].length, WORKOUTS[code].slots.length);
  });
});

describe('rules.js matches spec 4.5.1 (TRX)', () => {
  const rows = tableRows(section('#### 4.5.1 TRX alternatives').split('Pairing note')[0]);
  test('every row has rules with the reps in the table, and starting level 2', () => {
    assert.equal(rows.length, 13);
    for (const [, name, repsText] of rows) {
      const id = idOf(name);
      const r = RULES[id];
      const want = parseReps(repsText);
      if (want.holdSeconds) assert.deepEqual(r.holdSeconds, want.holdSeconds, id);
      else assert.deepEqual({ repMin: r.repMin, repMax: r.repMax, perSide: r.perSide }, want, id);
    }
  });
  test('the spec says the default starting level is 2', () => {
    assert.match(section('#### 4.5.1 TRX alternatives'), /Default starting level: 2/);
    const trx = Object.entries(RULES).filter(([, r]) => r.progression === 'suspension');
    assert.equal(trx.length, 9);
    for (const [id, r] of trx) assert.equal(r.startingLevel, 2, id);
  });
  test('every TRX alternative of the templates is a suspension rules entry', () => {
    for (const w of Object.values(WORKOUTS)) {
      for (const s of w.slots) for (const id of s.trxAlternatives) assert.equal(RULES[id].type, 'suspension', id);
    }
  });
});

describe('rules.js matches spec 5.3 and 5.6', () => {
  test('load increments by type (5.3)', () => {
    const table = Object.fromEntries(tableRows(section('### 5.3 Load increments')).map(([type, inc]) => [type, inc]));
    const amount = (key) => Number(/\+(\d+)/.exec(table[key])[1]);
    const byType = {
      dumbbell: amount('Dumbbell'),
      barbell: amount('Barbell / trap bar'),
      machine: amount('Machine / cable'),
      cable: amount('Machine / cable'),
      carry: amount('Carry'),
      bodyweight_loadable: amount('Bodyweight loadable'),
    };
    assert.match(table['Machine / cable'], /face pull \+5 lbs/);
    for (const [id, r] of Object.entries(RULES)) {
      if (r.progression !== 'load') continue;
      const want = id === 'face-pull' ? 5 : byType[r.type];
      assert.equal(r.loadIncrementLbs, want, `${id} (${r.type})`);
    }
  });

  test('starting weights and first-loaded weights (5.6 table)', () => {
    const rows = tableRows(section('### 5.6 Starting weights and calibration'));
    assert.equal(rows.length, 18);
    for (const [name, start, first] of rows) {
      const r = RULES[idOf(name)];
      const wantStart = /trapBarWeightLbs/.test(start) ? null : Number(/^\d+/.exec(start)[0]);
      assert.equal(r.startingWeightLbs, wantStart, `${name} startingWeightLbs`);
      assert.equal(r.firstLoadedWeightLbs, first === '—' ? null : Number(first), `${name} firstLoadedWeightLbs`);
    }
    assert.equal(PROGRAM.defaultTrapBarWeightLbs, 45);
    assert.match(spec, /trapBarWeightLbs \(default 45\)/);
  });

  test('the pushup starts at ladder level 1', () => assert.equal(RULES.pushup.startingLevel, 1));

  test('exactly the exercises the spec names have loadsBack (5.9)', () => {
    const line = /flagged `loadsBack = true` \(seed: ([^)]*)\)/.exec(section('### 5.9 Back pain gate'));
    assert.ok(line, 'the 5.9 seed list was not found');
    const named = line[1].split(',').map((n) => idOf(n.trim()));
    const flagged = Object.keys(RULES).filter((id) => RULES[id].loadsBack);
    assert.deepEqual([...flagged].sort(), [...named].sort());
  });

  test('pushup ladder (5.4) has the spec ranges', () => {
    const rows = tableRows(section('### 5.4 Bodyweight exercises')).filter(([level]) => /^\d$/.test(level));
    assert.equal(rows.length, 6);
    for (const [level, , range] of rows) {
      const [, min, max] = /(\d+)–(\d+)/.exec(range);
      assert.deepEqual(PUSHUP_LADDER[Number(level)], { level: Number(level), repMin: Number(min), repMax: Number(max) });
    }
  });
});

describe('program constants match the spec', () => {
  test('phase, deload, gate, stall and ramp-up numbers', () => {
    assert.equal(PROGRAM.phase1Weeks, 4);
    assert.equal(PROGRAM.phase1Sets, 2);
    assert.equal(PROGRAM.firstDeloadWeek, 11);
    assert.equal(PROGRAM.deloadGapWeeks, 7);
    assert.equal(PROGRAM.defaultScheduledIncreaseDays, 21);
    assert.equal(PROGRAM.defaultProgramStartDate, '2026-09-28');
    assert.equal(PROGRAM.calibrationSessions, 2);
    assert.equal(PROGRAM.stallWeeks, 9);
    assert.equal(PROGRAM.stallReductions, 2);
    assert.equal(PROGRAM.backPainGate, 3);
    assert.deepEqual(PROGRAM.rampUp, [{ share: 0.5, reps: 8 }, { share: 0.75, reps: 4 }]);
    assert.deepEqual(PROGRAM.rampUpSlots, [1, 3]);
    assert.match(spec, /Initial value: \*\*2026-09-28\*\*/);
  });
});

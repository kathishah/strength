// Meta-test: every example in the spec has a numbered test, and the spec text has not changed under it.
// Reads SPEC-strength.md and test/spec-examples.test.mjs. If this fails after a spec edit, re-read the example, fix or
// add its test in spec-examples.test.mjs, and update the fingerprint (the message prints the new one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const spec = readFileSync(new URL('../SPEC-strength.md', import.meta.url), 'utf8');
const examples = readFileSync(new URL('./spec-examples.test.mjs', import.meta.url), 'utf8');

function bulletsBetween(from, to) {
  const a = spec.indexOf(from);
  assert.ok(a >= 0, `"${from}" not found in the spec`);
  const b = spec.indexOf(to, a);
  assert.ok(b > a, `"${to}" not found after "${from}"`);
  return spec.slice(a, b).split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
}

const fingerprint = (text) => createHash('sha1').update(text).digest('hex').slice(0, 8);

// Every `example('5.7', 12, 'abcd1234', ...)` in the examples file: { n, fingerprint }.
function registered(section) {
  const found = [];
  const re = new RegExp(`^example\\('${section.replace('.', '\\.')}', (\\d+), '([0-9a-f]*)',`, 'gm');
  for (const m of examples.matchAll(re)) found.push({ n: Number(m[1]), fingerprint: m[2] });
  return found;
}

for (const [section, bullets, expectedCount] of [
  ['5.7', bulletsBetween('### 5.7 Examples', '### 5.8 Deload'), 34],
  ['5.12', bulletsBetween('Test cases:', '\n---'), 9],
]) {
  test(`spec ${section}: every example bullet has exactly one numbered test`, () => {
    assert.equal(bullets.length, expectedCount, `the spec now has ${bullets.length} bullets in ${section} (was ${expectedCount}): add or remove tests, then update this count`);
    const numbers = registered(section).map((r) => r.n);
    const want = bullets.map((_, i) => i + 1);
    assert.deepEqual([...numbers].sort((a, b) => a - b), want, `numbered tests for ${section} do not match its ${bullets.length} bullets`);
  });

  test(`spec ${section}: the bullets are the ones the tests were written for`, () => {
    for (const { n, fingerprint: fp } of registered(section)) {
      const now = fingerprint(bullets[n - 1] ?? '');
      assert.equal(fp, now, `${section} #${n} changed in the spec: "${bullets[n - 1]}" — re-check its test, then set its fingerprint to '${now}'`);
    }
  });
}

test('the examples file has a test whose name starts with each number (5.7 #1 ... 5.7 #34, 5.12 #1 ... 5.12 #9)', () => {
  // The names are built from the spec at run time; this checks the naming rule the plan asks for.
  assert.match(examples, /test\(`\$\{section\} #\$\{n\}: /);
});

test('sections 5.7 and 5.12 are where the plan says: 34 and 9 bullets', () => {
  assert.equal(bulletsBetween('### 5.7 Examples', '### 5.8 Deload').length, 34);
  assert.equal(bulletsBetween('Test cases:', '\n---').length, 9);
});

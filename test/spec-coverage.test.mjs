// Meta-test: every live example in the spec has a numbered test, struck ones have none, and the spec text has not
// changed under a test. Reads SPEC-strength.md and test/spec-examples.test.mjs. If this fails after a spec edit, re-read
// the example, fix, add or remove its test in spec-examples.test.mjs, and update the fingerprint (the message prints it).
// A bullet starting with "~~" is struck (removed from the app, v1.13): it must have no test.
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
const isStruck = (bullet) => bullet.startsWith('~~');

// Every `example('5.7', 12, 'abcd1234', ...)` in the examples file: { n, fingerprint }.
function registered(section) {
  const re = new RegExp(`^example\\('${section.replace('.', '\\.')}', (\\d+), '([0-9a-f]*)',`, 'gm');
  return [...examples.matchAll(re)].map((m) => ({ n: Number(m[1]), fingerprint: m[2] }));
}

for (const [section, bullets, expectedCount] of [
  ['5.7', bulletsBetween('### 5.7 Examples', '### ~~5.8 Deload'), 34],
  ['5.12', bulletsBetween('Test cases:', '\n---'), 9],
]) {
  test(`spec ${section}: every live bullet has exactly one numbered test, and struck bullets have none`, () => {
    assert.equal(bullets.length, expectedCount, `the spec now has ${bullets.length} bullets in ${section} (was ${expectedCount}): add or remove tests, then update this count`);
    const numbers = registered(section).map((r) => r.n).sort((a, b) => a - b);
    const live = bullets.map((b, i) => (isStruck(b) ? null : i + 1)).filter(Boolean);
    assert.ok(live.length > 0);
    assert.deepEqual(numbers, live, `numbered tests for ${section} do not match its live (not struck) bullets`);
  });

  test(`spec ${section}: the live bullets are the ones the tests were written for`, () => {
    for (const { n, fingerprint: fp } of registered(section)) {
      const now = fingerprint(bullets[n - 1] ?? '');
      assert.equal(fp, now, `${section} #${n} changed in the spec: "${bullets[n - 1]}" — re-check its test, then set its fingerprint to '${now}'`);
    }
  });
}

test('test names are built as "<section> #<n>: ..." so each starts with its number', () => {
  assert.match(examples, /test\(`\$\{section\} #\$\{n\}: /);
});

// The logging modules are pure: no clock, DOM, storage or network. The time, the ids and the storage backends are passed in
// (plan section 15), so every one of them runs in Node and in tests without stubs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../app/js/logging/', import.meta.url);
const BANNED = /\b(Date|document|window|localStorage|sessionStorage|fetch|indexedDB|navigator|setTimeout|setInterval|Math\.random|crypto)\b/;
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));

test('no file in app/js/logging uses a clock, the DOM, storage, the network or randomness', () => {
  assert.ok(files.length >= 10);
  for (const f of files) {
    readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
      assert.ok(!BANNED.test(line), `${f}:${i + 1} mentions ${BANNED.exec(line)?.[0]}: ${line.trim()}`);
    });
  }
});

test('logging files import only from logging, the engine, the seed and time.js (not the store, ids or ui)', () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/from '([^']+)'/g)) {
      assert.match(m[1], /^(\.\/[a-z-]+\.js|\.\.\/engine\/[a-z-]+\.js|\.\.\/seed\/[a-z-]+\.js|\.\.\/time\.js)$/, `${f} imports ${m[1]}`);
    }
  }
});

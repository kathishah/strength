// The engine is pure: no clock, DOM, storage or network (DEPLOYMENT-PLAN.md section 14). Today and everything else
// arrive as arguments; calendar-day arithmetic lives in app/js/time.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../app/js/engine/', import.meta.url);
const BANNED = /\b(Date|document|window|localStorage|fetch|indexedDB)\b/;

test('no file in app/js/engine mentions Date, document, window, localStorage, fetch or indexedDB', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0);
  for (const f of files) {
    readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
      assert.ok(!BANNED.test(line), `${f}:${i + 1} mentions ${BANNED.exec(line)?.[0]}: ${line.trim()}`);
    });
  }
});

test('engine files import only from the engine, the seed rules and time.js', () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/from '([^']+)'/g)) {
      assert.match(m[1], /^(\.\/[a-z-]+\.js|\.\.\/seed\/(rules|index|program|catalog)\.js|\.\.\/time\.js)$/, `${f} imports ${m[1]}`);
    }
  }
});

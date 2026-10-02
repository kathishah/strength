// The service worker's shell list must be every file of the app (plan section 15e), or an offline first load would miss one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const app = new URL('../app/', import.meta.url).pathname;
const source = readFileSync(join(app, 'sw.js'), 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('the shell list in sw.js is exactly the files under app/ (except sw.js itself and the exercise images in img/)', () => {
  const shell = new Function(`return ${/const SHELL = (\[[\s\S]*?\]);/.exec(source)[1]}`)();
  const files = walk(app).map((p) => relative(app, p)).filter((p) => p !== 'sw.js' && !p.startsWith('img/') && !p.endsWith('.DS_Store'));
  assert.deepEqual([...shell].sort(), files.sort());
  assert.equal(new Set(shell).size, shell.length, 'no duplicates');
});

test('it only handles same-origin GETs, answers network first, and takes over at once', () => {
  assert.match(source, /req\.method !== 'GET' \|\| new URL\(req\.url\)\.origin !== self\.location\.origin\) return;/);
  assert.match(source, /fetch\(req\)[\s\S]*\.catch\(\(\) => caches\.match/);
  assert.match(source, /skipWaiting/);
  assert.match(source, /clients\.claim/);
});

test('the page registers it', () => {
  assert.match(readFileSync(join(app, 'js/main.js'), 'utf8'), /serviceWorker\.register\('sw\.js'\)/);
});

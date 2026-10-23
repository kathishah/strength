// The demo page (demo/): no network code reachable, boot in demo mode with the sample history, the strip and Reset, Settings, the
// demo images, and the demo's storage names (spec section 3, "Demo design", Tests).
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { installFakeDom } from '../test-support/fake-dom.mjs';
import { doWorkout } from '../test-support/logging-world.mjs';
import { staticImports } from '../test-support/import-walk.mjs';
import { finishedSessions, inProgressSessions, nextTemplate, sessionView } from '../app/js/logging/index.js';
import { EXERCISES, PLACEHOLDER_GIF } from '../app/js/seed/index.js';
import { DEMO_MEDIA, LANDING_URL, STRIP_TEXT, createDemoUi, useDemoMedia } from '../demo/demo-ui.js';

const demoDir = new URL('../demo/', import.meta.url).pathname;
const appJs = new URL('../app/js/', import.meta.url).pathname;
const html = readFileSync(join(demoDir, 'index.html'), 'utf8');
const { startApp } = await import('../app/js/boot.js');

const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

let env = null;

// The fake page, a logged localStorage, a logged IndexedDB that cannot open (so storage falls back to memory) but can be deleted,
// and a fetch that fails the test if it is called. `storage` seeds localStorage (the real app's keys, to see they are left alone).
function setup({ storage = {} } = {}) {
  const dom = installFakeDom({ html });
  const store = new Map(Object.entries(storage));
  const log = { reads: [], writes: [], removes: [], opened: [], deleted: [], fetches: [], reloads: 0 };
  const saved = {
    local: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    idb: Object.getOwnPropertyDescriptor(globalThis, 'indexedDB'),
    fetch: globalThis.fetch,
    warn: console.warn,
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => { log.reads.push(k); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { log.writes.push(k); store.set(k, String(v)); },
      removeItem: (k) => { log.removes.push(k); store.delete(k); },
      key: (i) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    },
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open(name) { log.opened.push(name); const req = { error: new Error('no IndexedDB in tests') }; queueMicrotask(() => req.onerror?.()); return req; },
      deleteDatabase(name) { log.deleted.push(name); const req = {}; queueMicrotask(() => req.onsuccess?.()); return req; },
    },
  });
  globalThis.fetch = (url) => { log.fetches.push(String(url)); throw new Error(`fetch must not be called: ${url}`); };
  console.warn = () => {};
  env = {
    dom, store, log,
    restore() {
      console.warn = saved.warn;
      globalThis.fetch = saved.fetch;
      for (const [key, d] of [['localStorage', saved.local], ['indexedDB', saved.idb]]) {
        if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key];
      }
      dom.uninstall();
    },
  };
  return env;
}
afterEach(() => { env?.restore(); env = null; });

const boot = (log) => startApp({ mode: 'demo', ui: createDemoUi({ reload: () => { log.reloads++; } }) });
const all = (dom, pred) => dom.find(dom.document.body, pred);
const resetButtons = (dom) => all(dom, (e) => e.tagName === 'BUTTON' && e.className === 'demo-reset');
const imgs = (dom) => all(dom, (e) => e.tagName === 'IMG');

async function logWorkout(app) {
  return doWorkout({
    actions: app.actions,
    view: (id) => sessionView(app.events.state, id, app.actions.draft(id), Date.now()),
    advance() {},
  });
}

describe('the demo page has no network code', () => {
  const entry = join(demoDir, 'demo.js');
  const reached = [...staticImports(entry)];
  const rel = reached.map((p) => relative(appJs, p));

  test('following static imports from the demo entry script reaches boot.js and the demo files, and never the network code', () => {
    assert.ok(reached.includes(entry));
    assert.ok(reached.includes(join(appJs, 'boot.js')));
    assert.ok(reached.includes(join(demoDir, 'fixture.js')) && reached.includes(join(demoDir, 'demo-ui.js')));
    for (const forbidden of ['store/auth.js', 'store/api.js', 'store/sync.js', 'store/outbox.js', 'ui/format.js', 'ui/auth-screen.js', 'ui/sync-panel.js', 'config.js']) {
      assert.ok(!rel.includes(forbidden), `the demo reaches ${forbidden}`);
    }
  });

  test('every demo file only imports from the demo or from app/js; nothing is fetched by URL', () => {
    for (const name of readdirSync(demoDir).filter((n) => /\.(js|html|css)$/.test(n))) {
      const text = readFileSync(join(demoDir, name), 'utf8');
      assert.doesNotMatch(text, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/, `${name} makes requests`);
      assert.doesNotMatch(text, /https?:\/\/(?!www\.w3\.org\/)/, `${name} names an outside address`);
      assert.doesNotMatch(text, /cognito|execute-api|amazonaws|cloudfront|logbook\.me/i, `${name} names a deployment`);
    }
  });

  test('the page has no manifest, no service worker, no third-party script or style, and loads the app\'s own files', () => {
    assert.doesNotMatch(html, /manifest/i);
    assert.doesNotMatch(readFileSync(join(demoDir, 'demo.js'), 'utf8'), /serviceWorker/);
    assert.doesNotMatch(html, /serviceWorker/);
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const url of urls) assert.doesNotMatch(url, /^(https?:)?\/\//, url);
    for (const must of ['../app/css/app.css', '../app/js/theme-boot.js', 'demo.js']) assert.ok(urls.includes(must), must);
    assert.match(html, /<script type="module" src="demo\.js">/);
    assert.match(html, /id="app-header"/);
    assert.match(html, /id="screen"/);
  });

  test('demo/ is outside app/, so the app\'s deploy and its service worker file list never include it', () => {
    assert.ok(relative(new URL('../app/', import.meta.url).pathname, demoDir).startsWith('..'));
    assert.doesNotMatch(readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8'), /(^|[^\w.])(\.\.\/)?demo\//, 'the service worker caches nothing from demo/');
    assert.doesNotMatch(readFileSync(new URL('../scripts/deploy-app.sh', import.meta.url), 'utf8'), /(^|[^\w.])demo\//, 'deploy-app.sh never uploads demo/');
  });
});

describe('boot in demo mode', () => {
  test('writes the sample history, opens on today\'s workout, and never calls fetch', async () => {
    const { dom, log } = setup();
    const app = await boot(log);
    assert.equal(app.mode, 'demo');
    assert.equal(finishedSessions(app.events.state).length, 12);
    assert.deepEqual(inProgressSessions(app.events.state), []);
    assert.equal(nextTemplate(app.events.state), 'A');
    assert.equal(app.events.pendingCount(), 0, 'nothing waits to upload');
    assert.equal(dom.byId('app-header').hidden, false);
    assert.equal(dom.byId('app').hidden, false);
    const screen = dom.byId('screen').textContent;
    assert.match(screen, /Goblet Squat/);
    assert.match(screen, /Face Pull/);
    assert.match(screen, /\+5 lbs from 20/, 'the increase due today');
    assert.match(dom.byId('app-header').textContent, /Workout A · 0\/6 done/);
    assert.deepEqual(log.fetches, []);
  });

  test('a page that already has events keeps them: the history is written once, not on every open', async () => {
    const { log } = setup();
    const ui = createDemoUi({ reload: () => {} });
    const app = await startApp({ mode: 'demo', ui });
    const count = app.events.eventCount();
    await ui.prepare(app.ctx);
    assert.equal(app.events.eventCount(), count);
    assert.deepEqual(log.fetches, []);
  });

  test('log, tick and finish today\'s workout, look at History and Settings: still no fetch', async () => {
    const { dom, log } = setup();
    const app = await boot(log);
    const id = await logWorkout(app);
    await settle();
    assert.ok(app.events.state.sessions[id].finishedAt);
    assert.equal(finishedSessions(app.events.state).length, 13);
    for (const hash of ['#/history', '#/history/date', '#/history/exercise/goblet-squat', '#/settings', '#/']) {
      app.screens.navigate(hash);
      await settle();
      assert.ok(dom.byId('screen').textContent.length > 20, hash);
    }
    assert.deepEqual(log.fetches, []);
  });

  test('History by date shows the missing exercise and the exercise page shows the increase', async () => {
    const { dom, log } = setup();
    const app = await boot(log);
    app.screens.navigate('#/history/date');
    await settle();
    assert.match(dom.byId('screen').textContent, /1 missing/);
    app.screens.navigate('#/history/exercise/goblet-squat');
    await settle();
    assert.match(dom.byId('screen').textContent, /Last increase/);
    assert.match(dom.byId('screen').textContent, /Green lines mark an increase/);
  });

  test('the header chip reads "Demo"', async () => {
    const { dom, log } = setup();
    await boot(log);
    const chip = all(dom, (e) => e.className === 'save-chip')[0];
    assert.equal(chip.textContent, 'Demo');
    assert.equal(chip.dataset.kind, 'info');
    assert.match(chip.getAttribute('aria-label'), /^Demo\. /);
  });

  test('there is no sign-in, no sync card and no sign-out button', async () => {
    const { dom, log } = setup();
    await boot(log);
    assert.equal(dom.byId('signin'), null);
    assert.equal(dom.byId('device'), null);
    assert.deepEqual(all(dom, (e) => e.tagName === 'BUTTON' && e.getAttribute('aria-label') === 'Sign out'), []);
  });
});

describe('the demo strip and Reset demo', () => {
  test('the strip sits above the header with the label and a Reset demo button, on every screen', async () => {
    const { dom, log } = setup();
    const app = await boot(log);
    const strip = dom.byId('mode-strip');
    const parent = dom.byId('app-header').parentNode;
    assert.ok(parent.childNodes.indexOf(strip) < parent.childNodes.indexOf(dom.byId('app-header')), 'above the header');
    for (const hash of ['#/', '#/history', '#/history/date', '#/history/exercise/lat-pulldown', '#/settings']) {
      app.screens.navigate(hash);
      await settle();
      assert.equal(strip.hidden, false, hash);
      assert.match(strip.textContent, /^Demo · a fictional lifter · changes stay in this browser/);
      assert.equal(strip.querySelector('.demo-strip-text').textContent, STRIP_TEXT);
    }
    const [button] = resetButtons(dom).filter((b) => strip.querySelectorAll('button').includes(b));
    assert.ok(button, 'a button in the strip');
    assert.match(button.textContent, /Reset demo/);
    assert.equal(button.getAttribute('aria-label'), 'Reset demo');
  });

  test('two taps: the first only arms it ("Tap again to reset"), the second deletes the demo storage and reloads', async () => {
    const { dom, log, store } = setup({ storage: { 'strength.deviceId': 'd_real', 'strength.draft': '{"real":true}', 'strength.refreshToken': 'secret', strengthTheme: 'dark' } });
    const app = await boot(log);
    await logWorkout(app);
    assert.ok([...store.keys()].some((k) => k.startsWith('strength-demo.')));
    const [button] = resetButtons(dom);

    button.click();
    assert.match(button.textContent, /Tap again to reset/);
    assert.ok(button.classList.contains('armed'));
    assert.match(button.getAttribute('aria-label'), /tap again to confirm/);
    await settle();
    assert.deepEqual(log.deleted, [], 'one tap deletes nothing');
    assert.equal(log.reloads, 0);

    button.click();
    await settle();
    assert.deepEqual(log.deleted, ['strength-demo']);
    assert.equal(log.reloads, 1);
    assert.deepEqual([...store.keys()].filter((k) => k.startsWith('strength-demo.')), [], 'the demo keys are gone');
  });

  test('reset leaves strength, strength.* and the theme alone', async () => {
    const real = { 'strength.deviceId': 'd_real', 'strength.draft': '{"real":true}', 'strength.refreshToken': 'secret', 'strength.localNoticeSeen': '1', strengthTheme: 'dark' };
    const { dom, log, store } = setup({ storage: real });
    await boot(log);
    const [button] = resetButtons(dom);
    button.click();
    button.click();
    await settle();
    for (const [k, v] of Object.entries(real)) assert.equal(store.get(k), v, k);
    assert.ok(!log.deleted.includes('strength'));
    assert.deepEqual(log.removes.filter((k) => !k.startsWith('strength-demo.')), []);
  });

  test('a reload after a reset writes the sample history again, from empty storage', async () => {
    const first = setup();
    const app = await boot(first.log);
    await logWorkout(app);
    assert.equal(finishedSessions(app.events.state).length, 13);
    first.restore();
    env = null;
    const second = setup(); // a new page: empty memory storage, as after clearing the database
    const again = await boot(second.log);
    assert.equal(finishedSessions(again.events.state).length, 12, 'the 13th (my workout) is gone; the 12 sample sessions are back');
    assert.equal(nextTemplate(again.events.state), 'A');
  });
});

describe('Settings in the demo', () => {
  test('explains the demo, has the same Reset button and a link back to the landing page', async () => {
    const { dom, log } = setup();
    const app = await boot(log);
    app.screens.navigate('#/settings');
    await settle();
    const screen = dom.byId('screen');
    assert.match(screen.textContent, /About this demo/);
    assert.match(screen.textContent, /fictional lifter/);
    assert.match(screen.textContent, /Nothing leaves your browser/);
    assert.match(screen.textContent, /Reset demo deletes your changes/);
    const link = screen.querySelectorAll('a')[0];
    assert.equal(link.getAttribute('href'), LANDING_URL);
    assert.equal(LANDING_URL, '../');
    const [button] = screen.querySelectorAll('button').filter((b) => b.className === 'demo-reset');
    assert.ok(button);
    button.click();
    assert.match(button.textContent, /Tap again to reset/);
    button.click();
    await settle();
    assert.deepEqual(log.deleted, ['strength-demo']);
    assert.equal(log.reloads, 1);
  });
});

describe('images: the demo\'s own art, the placeholder for the rest', () => {
  const mediaDir = join(demoDir, 'media');

  test('useDemoMedia points the listed exercises at demo/media and drops every other image path and all art credits', () => {
    const credit = { label: 'x', url: 'y' };
    const sample = { a: { name: 'A', gifUrl: 'img/a.gif', attribution: credit, tags: [] }, b: { name: 'B', gifUrl: 'img/b.gif', attribution: credit, tags: [] }, c: { name: 'C', tags: [] } };
    useDemoMedia(sample, ['a', 'c']);
    assert.deepEqual(sample, { a: { name: 'A', gifUrl: 'media/a.gif', tags: [] }, b: { name: 'B', tags: [] }, c: { name: 'C', gifUrl: 'media/c.gif', tags: [] } });
  });

  test('every listed exercise is in the catalog and has its own GIF (640 x 400, under 700 KB); the folder holds nothing else', () => {
    assert.deepEqual([...DEMO_MEDIA].sort(), DEMO_MEDIA, 'the list is kept sorted');
    assert.deepEqual(readdirSync(mediaDir).filter((f) => f !== '.DS_Store').sort(), DEMO_MEDIA.map((id) => `${id}.gif`));
    for (const id of DEMO_MEDIA) {
      assert.ok(EXERCISES[id], `${id} is not in the catalog`);
      const bytes = readFileSync(join(mediaDir, `${id}.gif`));
      assert.match(bytes.subarray(0, 6).toString('latin1'), /^GIF8[79]a$/, `${id} is not a GIF`);
      assert.deepEqual([bytes.readUInt16LE(6), bytes.readUInt16LE(8)], [640, 400], `${id} size`);
      assert.ok(bytes.length < 700 * 1024, `${id} is ${bytes.length} bytes`);
    }
  });

  test('on Home, in the Options lists too, an image is the demo\'s own file or the built-in placeholder data URI, never a third-party path', async () => {
    const { dom, log } = setup();
    useDemoMedia();
    assert.ok(Object.values(EXERCISES).every((e) => !e.attribution));
    assert.ok(Object.entries(EXERCISES).every(([id, e]) => (DEMO_MEDIA.includes(id) ? e.gifUrl === `media/${id}.gif` : !e.gifUrl)));
    await boot(log);
    // Open the Options and TRX lists so their thumbnails are drawn too.
    for (const toggle of all(dom, (e) => e.tagName === 'BUTTON' && /alt-toggle/.test(e.className))) { toggle.click(); await settle(); }
    const pics = imgs(dom);
    assert.ok(pics.length >= 6, `${pics.length} images`);
    const sources = pics.map((img) => img.getAttribute('src'));
    for (const src of sources) assert.ok(src === PLACEHOLDER_GIF || /^media\/[\w-]+\.gif$/.test(src), src);
    assert.ok(sources.includes('media/goblet-squat.gif'), 'the first card shows the goblet squat art');
    assert.ok(sources.includes(PLACEHOLDER_GIF), 'an exercise without art shows the placeholder');
    assert.equal(all(dom, (e) => e.className === 'gif-attribution').length, 0, 'no art credit');
    assert.deepEqual(log.fetches, []);
  });
});

describe('storage: the demo uses its own names only', () => {
  test('log a set, finish, change the theme and reset: only strength-demo, strength-demo.* and strengthTheme are written or removed', async () => {
    const real = { 'strength.deviceId': 'd_real', 'strength.draft': '{"real":true}', 'strength.refreshToken': 'secret' };
    const { dom, log, store } = setup({ storage: real });
    const app = await boot(log);
    await logWorkout(app);
    all(dom, (e) => e.className === 'theme-btn')[0].click();
    const [button] = resetButtons(dom);
    button.click();
    button.click();
    await settle();
    assert.deepEqual(log.opened, ['strength-demo']);
    assert.deepEqual(log.deleted, ['strength-demo']);
    assert.ok(log.writes.length > 0);
    for (const key of [...log.writes, ...log.removes]) assert.match(key, /^(strength-demo\.|strengthTheme$)/, key);
    for (const key of log.reads) assert.doesNotMatch(key, /^strength\./, `the demo read ${key}`);
    for (const [k, v] of Object.entries(real)) assert.equal(store.get(k), v, k);
    assert.deepEqual(log.fetches, []);
  });
});

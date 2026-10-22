// Local-only mode (docs/SHOWCASE-AND-SELF-HOST-SPEC.md section 4): app/js/modes/local.js and app/js/ui/local-settings.js, booted by
// app/js/boot.js over the fake DOM (test-support/fake-dom.mjs), a fake IndexedDB and a fetch that fails the test if anything calls it.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom } from '../test-support/fake-dom.mjs';
import { createFakeIdb } from '../test-support/fake-idb.mjs';
import { doWorkout } from '../test-support/logging-world.mjs';
import { startSession, logSet, finishSession } from '../test-support/events.mjs';
import { sessionView } from '../app/js/logging/index.js';
import { replay } from '../app/js/store/replay.js';
import { localUi, CHIP_LABEL, CHIP_TEXT, HOME_NOTE_TEXT } from '../app/js/modes/local.js';
import { CLEAR_ARMED_TEXT, NOT_SAVING_TEXT, backupFileName, backupText, buildBackup } from '../app/js/ui/local-settings.js';
import { prepareEvents, planBatches } from '../scripts/post-events.mjs';
import { MAX_EVENTS_PER_REQUEST, validateBatch } from '../lambda/events/registry.mjs';

const appHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const { startApp } = await import('../app/js/boot.js');

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

let env = null;

// One browser profile (localStorage, IndexedDB) that lives across pages; `page()` installs a fresh document, as a reload does.
function browser({ persistent = true, storage = {} } = {}) {
  const store = new Map(Object.entries(storage));
  const log = { writes: [], removes: [], fetches: [], deleted: [] };
  const idb = createFakeIdb();
  const saved = {};
  const set = (key, value) => { saved[key] ??= Object.getOwnPropertyDescriptor(globalThis, key) ?? null; Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  set('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { log.writes.push(k); store.set(k, String(v)); },
    removeItem: (k) => { log.removes.push(k); store.delete(k); },
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  });
  set('indexedDB', persistent
    ? { open: (...a) => idb.open(...a), deleteDatabase: (name) => { log.deleted.push(name); return idb.deleteDatabase(name); } }
    : { open() { const req = { error: new Error('no IndexedDB') }; queueMicrotask(() => req.onerror?.()); return req; }, deleteDatabase: (name) => { log.deleted.push(name); return idb.deleteDatabase(name); } });
  set('fetch', (url) => { log.fetches.push(String(url)); throw new Error(`fetch must not be called: ${url}`); });
  set('console', { ...console, warn() {} });
  let dom = null;
  const blobs = [];
  const links = [];
  const savedCreate = URL.createObjectURL;
  URL.createObjectURL = (blob) => { blobs.push(blob); return savedCreate.call(URL, blob); };
  const b = {
    store, log, idb, blobs, links,
    get dom() { return dom; },
    page(html = appHtml) {
      dom?.uninstall();
      dom = installFakeDom({ html });
      const append = dom.document.body.append.bind(dom.document.body);
      dom.document.body.append = (...nodes) => { links.push(...nodes.filter((n) => n.tagName === 'A')); append(...nodes); };
      return dom;
    },
    restore() {
      dom?.uninstall();
      URL.createObjectURL = savedCreate;
      for (const [key, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key]; }
    },
  };
  env = b;
  b.page();
  return b;
}
afterEach(() => { env?.restore(); env = null; });

const logWorkout = (app) => doWorkout({
  actions: app.actions,
  view: (id) => sessionView(app.events.state, id, app.actions.draft(id), Date.now()),
  advance() {},
});
const byClass = (dom, className) => dom.find(dom.document.body, (e) => e.className === className);
const buttonNamed = (dom, text) => dom.find(dom.document.body, (e) => e.tagName === 'BUTTON' && e.textContent === text)[0];
const goTo = async (app, hash) => { app.screens.navigate(hash); await settle(); };

describe('what the person sees', () => {
  test('chip "On this device", header line, no sign-out; the page opens on Home with no sign-in', async () => {
    const b = browser();
    const app = await startApp({ mode: 'local' });
    const { dom } = b;
    assert.equal(app.events.persistent, true);
    assert.equal(byClass(dom, 'save-chip')[0].textContent, 'On this device');
    assert.equal(byClass(dom, 'save-chip')[0].dataset.kind, 'info');
    assert.equal(byClass(dom, 'save-line small')[0].textContent, 'Saved in this browser only. Not synced to other devices.');
    assert.equal(dom.find(dom.document.body, (e) => e.tagName === 'BUTTON' && /Sign out/.test(e.getAttribute('aria-label') ?? '')).length, 0);
    assert.equal(dom.byId('signin'), null);
    assert.equal(dom.byId('screen').children[0].className, 'screen screen-home');
    assert.equal(dom.byId('mode-notice').hidden, true, 'storage is persistent: no warning');
    assert.equal(dom.byId('mode-strip').hidden, true);
  });

  test('without IndexedDB the chip warns and a notice stays at the top of every screen', async () => {
    const b = browser({ persistent: false });
    const app = await startApp({ mode: 'local' });
    const { dom } = b;
    assert.equal(app.events.persistent, false);
    assert.equal(byClass(dom, 'save-chip')[0].textContent, 'On this device');
    assert.equal(byClass(dom, 'save-chip')[0].dataset.kind, 'warn');
    assert.match(byClass(dom, 'save-line small')[0].textContent, /^Not saved: this browser is not keeping your workouts\./);
    for (const hash of ['#/', '#/history', '#/settings']) {
      await goTo(app, hash);
      assert.equal(dom.byId('mode-notice').hidden, false, hash);
      assert.equal(dom.byId('mode-notice').textContent, "This browser isn't saving your workouts. They will be lost when you close the page. Export a backup before you leave.", hash);
    }
    assert.equal(NOT_SAVING_TEXT, dom.byId('mode-notice').textContent);
  });

  test('hooks: chip and notice depend only on persistence', () => {
    assert.deepEqual(localUi.saveChip({ persistent: true }), { text: CHIP_TEXT, kind: 'info', pending: 0, label: CHIP_LABEL });
    assert.equal(localUi.saveChip({ persistent: false }).kind, 'warn');
    assert.equal(localUi.notice({ persistent: true }), null);
  });
});

describe('the one-time Home note', () => {
  test('shows on Home with its words and a Dismiss control; dismissing sets strength.localNoticeSeen and it stays gone after a reload', async () => {
    const b = browser();
    const app = await startApp({ mode: 'local' });
    const { dom } = b;
    assert.equal(dom.byId('home-note').hidden, false);
    assert.equal(dom.byId('home-note').textContent, `${HOME_NOTE_TEXT}Dismiss`);
    assert.equal(HOME_NOTE_TEXT, 'Your workouts are saved in this browser only. Export a backup from Settings.');
    await goTo(app, '#/settings');
    assert.equal(dom.byId('home-note').hidden, true, 'Home only');
    await goTo(app, '#/');
    assert.equal(b.store.has('strength.localNoticeSeen'), false);
    buttonNamed(dom, 'Dismiss').click();
    assert.equal(dom.byId('home-note').hidden, true);
    assert.equal(b.store.has('strength.localNoticeSeen'), true);

    b.page(); // reload
    await startApp({ mode: 'local' });
    assert.equal(b.dom.byId('home-note').hidden, true);
  });

  test('with localStorage blocked the note still goes for this visit', async () => {
    const b = browser();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    await startApp({ mode: 'local' });
    assert.equal(b.dom.byId('home-note').hidden, false);
    buttonNamed(b.dom, 'Dismiss').click();
    assert.equal(b.dom.byId('home-note').hidden, true);
  });
});

describe('boot with no network', () => {
  test('log and finish a workout (persistent storage), reload, and it is still there; fetch is never called', async () => {
    const b = browser();
    const app = await startApp({ mode: 'local' });
    const id = await logWorkout(app);
    await settle();
    assert.ok(app.events.state.sessions[id].finishedAt);
    assert.equal(app.events.pendingCount(), app.events.eventCount(), 'everything waits in the upload queue');
    const count = app.events.eventCount();
    b.page(); // reload
    const again = await startApp({ mode: 'local' });
    assert.equal(again.events.eventCount(), count);
    assert.ok(again.events.state.sessions[id].finishedAt);
    assert.deepEqual(b.log.fetches, []);
    assert.deepEqual(b.idb.databases(), ['strength']);
    for (const key of [...b.log.writes, ...b.log.removes]) assert.match(key, /^(strength\.|strengthTheme$)/, key);
  });
});

describe('Settings', () => {
  test('Storage, Export backup, the AWS line (script name as code) and Clear; counts follow the log', async () => {
    const b = browser();
    const app = await startApp({ mode: 'local' });
    const { dom } = b;
    await goTo(app, '#/settings');
    const text = () => dom.byId('screen').textContent;
    assert.match(text(), /^Settings/);
    assert.match(text(), /Saved on this device.*Yes/);
    assert.match(text(), /Events0 \(/);
    assert.equal(buttonNamed(dom, 'Export backup').disabled, true, 'nothing to back up yet');
    await logWorkout(app);
    await settle();
    app.screens.update();
    assert.match(text(), new RegExp(`Events${app.events.eventCount()} \\(1 session,`));
    assert.match(text(), /Finished workouts1/);
    assert.equal(buttonNamed(dom, 'Export backup').disabled, false);
    assert.match(text(), /Moving to your own AWS deployment\? Export a backup, then upload it with scripts\/post-events\.mjs \(see the self-hosting guide\)\./);
    const code = dom.find(dom.byId('screen'), (e) => e.tagName === 'CODE');
    assert.deepEqual(code.map((c) => c.textContent), ['scripts/post-events.mjs']);
  });

  test('in memory-only storage Settings says nothing is being saved', async () => {
    const b = browser({ persistent: false });
    const app = await startApp({ mode: 'local' });
    await goTo(app, '#/settings');
    assert.match(b.dom.byId('screen').textContent, /Saved on this device.*No\. This browser is not keeping your workouts/);
  });

  test('Export backup downloads strength-events-<date>.json; it replays to the live state and has the export-data.mjs format', async () => {
    const b = browser();
    const app = await startApp({ mode: 'local' });
    const { dom } = b;
    await logWorkout(app);
    await settle();
    await goTo(app, '#/settings');
    buttonNamed(dom, 'Export backup').click();
    assert.equal(b.blobs.length, 1);
    assert.equal(b.links.length, 1);
    const name = b.links[0].getAttribute('download');
    assert.match(name, /^strength-events-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(name, backupFileName());
    assert.equal(b.blobs[0].type, 'application/json');
    const text = await b.blobs[0].text();
    const file = JSON.parse(text);

    // The shape scripts/export-data.mjs writes: { exportedAt, count, events }, pretty-printed with a trailing newline.
    assert.deepEqual(Object.keys(file), ['exportedAt', 'count', 'events']);
    assert.ok(!Number.isNaN(Date.parse(file.exportedAt)) && file.exportedAt.endsWith('Z'));
    assert.equal(file.count, app.events.eventCount());
    assert.equal(file.events.length, file.count);
    assert.equal(text, `${JSON.stringify(file, null, 2)}\n`);
    assert.ok(file.events.every((e) => !('recvAt' in e)), 'a local event has no recvAt');

    // Replaying it gives the state the app holds.
    assert.deepEqual(replay(file.events), app.events.state);
    assert.deepEqual(file.events, app.events.events(), 'in replay order, as stored');
    assert.match(dom.byId('notice').textContent, /^Backup downloaded: \d+ events\.$/);
  });

  test('the exported file is what scripts/post-events.mjs accepts: prepared, valid for the API, batched at 200', async () => {
    const b = browser();
    const app = await startApp({ mode: 'local' });
    await logWorkout(app);
    await settle();
    const file = JSON.parse(backupText(buildBackup(app.events)));
    const prepared = prepareEvents(file);
    assert.equal(prepared.problems, undefined);
    assert.equal(prepared.events.length, file.count);
    assert.equal(prepared.deviceId, app.events.deviceId);
    const batches = planBatches(prepared.events, prepared.deviceId);
    for (const batch of batches) assert.deepEqual(validateBatch({ deviceId: prepared.deviceId, events: batch }).errors, []);
    assert.deepEqual(b.log.fetches, []);

    // More than 200 events: the same shape, several batches, none over 200.
    const many = [startSession('s1', 0)];
    for (let i = 0; i < 449; i++) many.push(logSet(`set${i}`, 's1', 1 + i / 60, { setNumber: 1 + (i % 50), exerciseId: i % 2 ? 'goblet-squat' : 'chest-press' }));
    many.push(finishSession('s1', 600));
    const big = JSON.parse(backupText(buildBackup({ events: () => many }, Date.now())));
    assert.equal(big.count, 451);
    const prepBig = prepareEvents(big);
    assert.equal(prepBig.problems, undefined);
    const bigBatches = planBatches(prepBig.events, prepBig.deviceId);
    assert.deepEqual(bigBatches.map((x) => x.length), [200, 200, 51]);
    assert.ok(bigBatches.every((x) => x.length <= MAX_EVENTS_PER_REQUEST));
  });

  test('Clear needs two taps: the first only shows the warning; the second deletes the database and strength.* keys, keeps the theme, and reloads', async () => {
    const b = browser({ storage: { strengthTheme: 'dark' } });
    const app = await startApp({ mode: 'local' });
    const { dom } = b;
    await logWorkout(app);
    await settle();
    buttonNamed(dom, 'Dismiss').click();
    await goTo(app, '#/settings');
    assert.ok([...b.store.keys()].filter((k) => k.startsWith('strength.')).length >= 2, 'deviceId and the note flag at least');

    const clear = buttonNamed(dom, 'Clear data on this device');
    clear.click();
    assert.equal(clear.textContent, 'Tap again to delete all workouts on this device. Export first if you want a copy.');
    assert.equal(clear.textContent, CLEAR_ARMED_TEXT);
    await settle();
    assert.deepEqual(b.log.deleted, [], 'one tap deletes nothing');
    assert.deepEqual(b.idb.databases(), ['strength']);
    assert.ok(app.events.eventCount() > 0);

    clear.click();
    await settle();
    assert.deepEqual(b.log.deleted, ['strength']);
    assert.deepEqual(b.idb.databases(), [], 'the connection was closed first, so the delete went through');
    assert.deepEqual([...b.store.keys()].filter((k) => k.startsWith('strength.')), []);
    assert.equal(b.store.get('strengthTheme'), 'dark');
    assert.equal(dom.location.reloaded, 1);

    b.page(); // the reload
    const empty = await startApp({ mode: 'local' });
    assert.equal(empty.events.eventCount(), 0);
    assert.equal(b.dom.byId('home-note').hidden, false, 'an empty app shows the first-run note again');
    assert.deepEqual(b.log.fetches, []);
  });

  test('the armed Clear button disarms on its own, deleting nothing', async () => {
    const b = browser();
    const app = await startApp({ mode: 'local' });
    await goTo(app, '#/settings');
    const clear = buttonNamed(b.dom, 'Clear data on this device');
    clear.click();
    assert.equal(clear.dataset.armed, 'true');
    assert.deepEqual(b.log.deleted, []);
  });
});

describe('moving to synced mode at the same address', () => {
  test('events logged in local-only mode wait in the queue; a later synced boot reports them on the sign-in screen and fetches nothing', async () => {
    const b = browser();
    const app = await startApp({ mode: 'local' });
    await logWorkout(app);
    await settle();
    const waiting = app.events.pendingCount();
    assert.ok(waiting > 1);

    b.page(); // the sync settings were added: same storage, new page
    const calls = [];
    globalThis.fetch = async (url) => { calls.push(String(url)); throw new Error('no network in this test'); };
    const synced = await startApp({ mode: 'synced' });
    assert.equal(synced.events.pendingCount(), waiting);
    assert.equal(b.dom.byId('signin').hidden, false);
    assert.equal(b.dom.byId('signin-pending').hidden, false);
    assert.equal(b.dom.byId('signin-pending').textContent, `${waiting} events saved on this device will upload after you sign in.`);
    assert.deepEqual(calls, [], 'nothing is sent before sign-in');
  });
});

// app/js/boot.js in each mode, over the fake DOM (test-support/fake-dom.mjs) and the real screens, event store, replay and actions.
// Local and demo modes run with a fetch that fails the test if anything calls it, and with every storage name they use logged.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom, makeEvent } from '../test-support/fake-dom.mjs';
import { doWorkout } from '../test-support/logging-world.mjs';
import { sessionView } from '../app/js/logging/index.js';
import { useTestConfig } from '../test-support/test-config.mjs';

useTestConfig(); // app/js/config.js is empty in the repository

const appHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const { startApp } = await import('../app/js/boot.js');

// A page with only what the demo and local pages must provide.
const MINIMAL = '<header id="app-header" class="app-header" hidden></header><main class="page"><div id="screen"></div></main>';

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

let env = null;

// Installs the fake page, a logged localStorage, a logged IndexedDB that cannot open (so storage falls back to memory, which is silent
// about names), and a fetch that fails the test (or, with `network`, a scripted one).
function setup({ html = appHtml, network = null, storage = {} } = {}) {
  const dom = installFakeDom({ html });
  const store = new Map(Object.entries(storage));
  const log = { reads: [], writes: [], removes: [], dbNames: [], fetches: [] };
  const savedLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const savedIdb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const savedFetch = globalThis.fetch;
  const savedWarn = console.warn;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => { log.reads.push(k); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { log.writes.push(k); store.set(k, String(v)); },
      removeItem: (k) => { log.removes.push(k); store.delete(k); },
    },
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: { open(name) { log.dbNames.push(name); const req = { error: new Error('no IndexedDB in tests') }; queueMicrotask(() => req.onerror?.()); return req; } },
  });
  globalThis.fetch = network ?? ((url) => { log.fetches.push(String(url)); throw new Error(`fetch must not be called: ${url}`); });
  console.warn = () => {};
  env = {
    dom, store, log,
    restore() {
      console.warn = savedWarn;
      globalThis.fetch = savedFetch;
      for (const [key, d] of [['localStorage', savedLocal], ['indexedDB', savedIdb]]) {
        if (d) Object.defineProperty(globalThis, key, d); else delete globalThis[key];
      }
      dom.uninstall();
    },
  };
  return env;
}
afterEach(() => { env?.restore(); env = null; });

// Logs a whole workout through the real actions, as the screen does.
async function logWorkout(app) {
  const world = {
    actions: app.actions,
    view: (id) => sessionView(app.events.state, id, app.actions.draft(id), Date.now()),
    advance() {},
  };
  return doWorkout(world);
}

// Is `a` an earlier sibling of `b`?
const precedes = (a, b) => a.parentNode === b.parentNode && a.parentNode.childNodes.indexOf(a) < a.parentNode.childNodes.indexOf(b);

const buttons = (dom, label) => dom.find(dom.document.body, (e) => e.tagName === 'BUTTON' && e.getAttribute('aria-label') === label);

describe('local mode', () => {
  test('opens straight on Home: no sign-in, no sync card, no sign-out, a plain chip; nothing goes over the network', async () => {
    const { dom, log } = setup();
    const app = await startApp({ mode: 'local' });
    assert.equal(app.mode, 'local');
    assert.equal(dom.byId('signin'), null, 'no sign-in markup');
    assert.equal(dom.byId('device'), null, 'no sync card');
    assert.equal(dom.byId('app').hidden, false);
    assert.equal(dom.byId('app-header').hidden, false);
    assert.ok(dom.byId('screen').textContent.length > 50, 'Home is drawn');
    assert.equal(dom.byId('screen').children[0].className, 'screen screen-home');
    assert.deepEqual(buttons(dom, 'Sign out'), []);
    assert.equal(dom.find(dom.document.body, (e) => e.className === 'save-chip')[0].dataset.kind, 'warn', 'memory fallback: not persistent');
    assert.deepEqual(log.fetches, []);
  });

  test('log and finish a workout without a single fetch; the events stay in the upload queue', async () => {
    const { dom, log } = setup();
    const app = await startApp({ mode: 'local' });
    const id = await logWorkout(app);
    await settle();
    assert.ok(app.events.state.sessions[id].finishedAt, 'the workout is finished');
    assert.equal(Object.keys(app.events.state.sessions).length, 1);
    assert.ok(app.events.eventCount() > 1);
    assert.equal(app.events.pendingCount(), app.events.eventCount(), 'nothing is sent, so everything waits');
    assert.deepEqual(log.fetches, []);
    assert.deepEqual(log.dbNames, ['strength']);
    assert.ok(dom.byId('screen').textContent.length > 0);
  });

  test('storage: IndexedDB "strength" and keys "strength.*" only, the refresh token is never read', async () => {
    const { dom, log, store } = setup();
    const app = await startApp({ mode: 'local' });
    await logWorkout(app);
    // The theme button: the one shared key.
    dom.find(dom.document.body, (e) => e.className === 'theme-btn')[0].click();
    assert.deepEqual(log.dbNames, ['strength']);
    for (const key of [...log.writes, ...log.removes]) assert.match(key, /^(strength\.|strengthTheme$)/, key);
    assert.ok(store.has('strength.deviceId'));
    assert.ok(!log.reads.includes('strength.refreshToken'), 'auth.js is never loaded, so nothing reads the token');
  });

  test('regions: local mode has no strip; with no hooks (an override) all three stay hidden', async () => {
    const { dom } = setup();
    const app = await startApp({ mode: 'local', ui: { saveChip: undefined, notice: undefined, homeNote: undefined, settings: undefined } });
    for (const id of ['mode-strip', 'mode-notice', 'home-note']) assert.equal(dom.byId(id).hidden, true, id);
    assert.equal(app.ctx.mode, 'local');
    // Where they sit: the strip above the header; the notice and the Home note above the app.
    assert.ok(precedes(dom.byId('mode-strip'), dom.byId('app-header')));
    assert.ok(precedes(dom.byId('mode-notice'), dom.byId('app')) && precedes(dom.byId('home-note'), dom.byId('app')));
  });
});

describe('mode hooks', () => {
  const hooks = () => {
    const calls = [];
    let noteOn = true;
    const doc = () => globalThis.document;
    const node = (text) => { const n = doc().createElement('p'); n.textContent = text; return n; };
    return {
      calls,
      dismiss: () => { noteOn = false; },
      ui: {
        async prepare(ctx) { calls.push(['prepare', ctx.mode, ctx.profile.dbName, ctx.persistent]); },
        saveChip: (ctx) => ({ text: 'Saved in this browser only.', kind: 'ok', pending: ctx.events.pendingCount(), label: 'On this device' }),
        strip: () => node('STRIP'),
        notice: () => node('NOTICE'),
        homeNote: () => (noteOn ? node('HOME NOTE') : null),
        settings(ctx, host) {
          calls.push(['settings', ctx.mode, typeof ctx.header.setStatus]);
          host.append(node('SETTINGS SECTION'));
          return { update() { calls.push(['settings-update']); }, destroy() { calls.push(['settings-destroy']); } };
        },
      },
    };
  };

  test('prepare runs before the first screen; strip, notice and chip text come from the mode', async () => {
    const { dom } = setup();
    const h = hooks();
    const app = await startApp({ mode: 'demo', ui: h.ui });
    assert.deepEqual(h.calls[0], ['prepare', 'demo', 'strength-demo', false]);
    assert.equal(dom.byId('mode-strip').hidden, false);
    assert.equal(dom.byId('mode-strip').textContent, 'STRIP');
    assert.equal(dom.byId('mode-notice').textContent, 'NOTICE');
    assert.ok(precedes(dom.byId('mode-strip'), dom.byId('app-header')));
    const chip = dom.find(dom.document.body, (e) => e.className === 'save-chip')[0];
    assert.equal(chip.textContent, 'On this device');
    assert.equal(chip.getAttribute('aria-label'), 'On this device. Saved in this browser only.');
    assert.equal(dom.find(dom.document.body, (e) => e.className === 'save-line small')[0].textContent, 'Saved in this browser only.');
    assert.equal(app.ctx.header.setStatus.name, 'setStatus');
  });

  test('the Home note shows on Home only and goes when refresh() finds it dismissed', async () => {
    const { dom } = setup();
    const h = hooks();
    const app = await startApp({ mode: 'local', ui: h.ui });
    assert.equal(dom.byId('home-note').hidden, false);
    assert.equal(dom.byId('home-note').textContent, 'HOME NOTE');
    app.screens.navigate('#/settings');
    await settle();
    assert.equal(dom.byId('home-note').hidden, true, 'not on Settings');
    assert.equal(dom.byId('mode-notice').hidden, false, 'the notice stays on every screen');
    app.screens.navigate('#/');
    await settle();
    assert.equal(dom.byId('home-note').hidden, false);
    h.dismiss();
    app.ctx.refresh();
    assert.equal(dom.byId('home-note').hidden, true);
  });

  test('Settings: the heading, then the mode\'s section; it is updated and destroyed with the screen', async () => {
    const { dom } = setup();
    const h = hooks();
    const app = await startApp({ mode: 'local', ui: h.ui });
    app.screens.navigate('#/settings');
    await settle();
    const screen = dom.byId('screen');
    assert.equal(screen.textContent.startsWith('Settings'), true);
    assert.match(screen.textContent, /SETTINGS SECTION/);
    assert.deepEqual(h.calls.filter((c) => c[0] === 'settings')[0], ['settings', 'local', 'function']);
    app.screens.update();
    assert.ok(h.calls.some((c) => c[0] === 'settings-update'));
    app.screens.navigate('#/history');
    await settle();
    assert.ok(h.calls.some((c) => c[0] === 'settings-destroy'));
  });

  test('without a settings hook, Settings is just the heading', async () => {
    const { dom } = setup();
    const app = await startApp({ mode: 'local', ui: { settings: undefined } });
    app.screens.navigate('#/settings');
    await settle();
    assert.equal(dom.byId('screen').textContent, 'Settings');
  });
});

describe('demo mode', () => {
  test('boots from a minimal page (only #app-header and #screen), creates its own regions, no network', async () => {
    const { dom, log } = setup({ html: MINIMAL });
    const app = await startApp({ mode: 'demo' });
    assert.equal(app.mode, 'demo');
    assert.equal(dom.byId('app-header').hidden, false);
    assert.ok(dom.byId('screen').textContent.length > 50);
    assert.ok(dom.byId('notice') && dom.byId('mode-strip') && dom.byId('mode-notice') && dom.byId('home-note'));
    assert.ok(precedes(dom.byId('mode-strip'), dom.byId('app-header')));
    assert.ok(precedes(dom.byId('mode-notice'), dom.byId('screen')) && precedes(dom.byId('notice'), dom.byId('screen')));
    assert.deepEqual(log.fetches, []);
  });

  test('log a set and finish, then change theme: only strength-demo, strength-demo.* and strengthTheme are touched', async () => {
    const { dom, log, store } = setup({ html: MINIMAL, storage: { 'strength.deviceId': 'd_real', 'strength.draft': '{"real":true}', 'strength.refreshToken': 'secret' } });
    const app = await startApp({ mode: 'demo' });
    await logWorkout(app);
    dom.find(dom.document.body, (e) => e.className === 'theme-btn')[0].click();
    await settle();
    assert.deepEqual(log.dbNames, ['strength-demo']);
    assert.ok(log.writes.length > 0);
    for (const key of [...log.writes, ...log.removes]) assert.match(key, /^(strength-demo\.|strengthTheme$)/, key);
    for (const key of log.reads) assert.ok(!/^strength\./.test(key), `the demo read ${key}`);
    assert.equal(store.get('strength.deviceId'), 'd_real');
    assert.equal(store.get('strength.draft'), '{"real":true}');
    assert.equal(store.get('strength.refreshToken'), 'secret');
    assert.ok(store.has('strength-demo.deviceId'));
    assert.notEqual(store.get('strength-demo.deviceId'), 'd_real');
    assert.deepEqual(log.fetches, []);
  });

  test('demo has no sign-out button even when the page carries the sign-in markup', async () => {
    const { dom } = setup();
    await startApp({ mode: 'demo' });
    assert.deepEqual(buttons(dom, 'Sign out'), []);
    assert.equal(dom.byId('signin'), null);
  });
});

describe('startApp', () => {
  test('an unknown mode is refused', async () => {
    setup();
    await assert.rejects(startApp({ mode: 'other' }), RangeError);
    await assert.rejects(startApp({}), RangeError);
  });

  test('a page without #screen is refused with a clear message', async () => {
    setup({ html: '<header id="app-header"></header>' });
    await assert.rejects(startApp({ mode: 'local' }), /#app-header and #screen/);
  });
});

describe('synced mode (unchanged)', () => {
  // Cognito and the events API, scripted. Calls are recorded.
  const scripted = () => {
    const calls = [];
    const fn = async (url, init = {}) => {
      const u = String(url);
      calls.push({ url: u, target: init.headers?.['X-Amz-Target']?.split('.').pop() ?? null, method: init.method });
      if (u.includes('cognito-idp')) {
        return { ok: true, status: 200, json: async () => ({ AuthenticationResult: { IdToken: 'id', RefreshToken: 'refresh-1', ExpiresIn: 3600 } }) };
      }
      return { ok: true, status: 200, json: async () => ({ events: [], accepted: [], duplicates: [] }) };
    };
    return { calls, fn };
  };

  test('signed out: the sign-in form shows, the app and header stay hidden, and nothing is fetched', async () => {
    const net = scripted();
    const { dom, log } = setup({ network: net.fn });
    const app = await startApp({ mode: 'synced' });
    assert.equal(app.mode, 'synced');
    assert.equal(dom.byId('signin').hidden, false);
    assert.equal(dom.byId('app').hidden, true);
    assert.equal(dom.byId('app-header').hidden, true);
    assert.equal(dom.byId('signin-pending').hidden, true);
    assert.deepEqual(net.calls, []);
    assert.deepEqual(log.dbNames, ['strength']);
  });

  test('events waiting in the queue are announced on the sign-in screen (the prepare hook runs in synced mode too)', async () => {
    const net = scripted();
    const { dom } = setup({ network: net.fn });
    const { testNote } = await import('../app/js/store/events.js');
    await startApp({
      mode: 'synced',
      ui: { async prepare(ctx) { const n = testNote(ctx.events.deviceId); await ctx.events.append(n.type, n.entityId, n.payload); } },
    });
    assert.equal(dom.byId('signin-pending').hidden, false);
    assert.equal(dom.byId('signin-pending').textContent, '1 event saved on this device will upload after you sign in.');
    assert.deepEqual(net.calls, []);
  });

  test('sign in: the form posts to Cognito, then Home shows with a sign-out button, the sync card only on Settings, and the token is kept under strength.*', async () => {
    const net = scripted();
    const { dom, store } = setup({ network: net.fn });
    const app = await startApp({ mode: 'synced' });
    dom.byId('email').value = 'me@example.com';
    dom.byId('password').value = '123456';
    dom.byId('signin-form').dispatchEvent(makeEvent('submit'));
    await settle();
    assert.equal(net.calls[0].target, 'InitiateAuth');
    assert.equal(store.get('strength.refreshToken'), 'refresh-1');
    assert.equal(dom.byId('signin').hidden, true);
    assert.equal(dom.byId('app').hidden, false);
    assert.equal(dom.byId('app-header').hidden, false);
    assert.equal(dom.byId('device').hidden, true, 'the sync card is only on Settings');
    assert.equal(buttons(dom, 'Sign out').length, 1);
    assert.ok(net.calls.some((c) => c.method === 'GET'), 'a sync ran');
    app.screens.navigate('#/settings');
    await settle();
    assert.equal(dom.byId('device').hidden, false);
    assert.equal(dom.byId('screen').textContent, 'Settings');
    assert.equal(dom.byId('mode-strip').hidden, true);
  });

  test('a stored refresh token goes straight to Home and syncs; sign out returns to the form', async () => {
    const net = scripted();
    const { dom, store } = setup({ network: net.fn, storage: { 'strength.refreshToken': 'refresh-0' } });
    const app = await startApp({ mode: 'synced' });
    await settle();
    assert.equal(dom.byId('signin').hidden, true);
    assert.equal(dom.byId('app').hidden, false);
    assert.ok(net.calls.some((c) => c.method === 'GET'), 'a sync ran on open');
    const chip = dom.find(dom.document.body, (e) => e.className === 'save-chip')[0];
    assert.equal(chip.dataset.kind, 'ok');
    // Two taps on the sign-out button.
    const [signOut] = buttons(dom, 'Sign out').length ? buttons(dom, 'Sign out') : dom.find(dom.document.body, (e) => e.className.includes('signout'));
    signOut.click();
    signOut.click();
    await settle();
    assert.equal(dom.byId('signin').hidden, false);
    assert.equal(dom.byId('app-header').hidden, true);
    assert.equal(store.has('strength.refreshToken'), false);
    assert.equal(app.mode, 'synced');
  });
});

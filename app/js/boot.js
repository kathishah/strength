// Starting the app in one of three modes (docs/SHOWCASE-AND-SELF-HOST-SPEC.md, "App modes"). All three run the same screens, logging
// actions, engine and event log; they differ in where events are stored and whether anything goes over the network.
//
//   synced  Home after sign-in; uploads and downloads in the background (store/sync.js). Storage: IndexedDB "strength", keys "strength.*".
//   local   Home straight away, no account, no network. Same storage as synced, so events logged here wait in the upload queue.
//   demo    Like local, but its own storage ("strength-demo", "strength-demo.*") so a reset never touches real data.
//
// Everything that talks to Cognito or the API (store/auth.js, store/api.js, store/sync.js, and ui/format.js, ui/auth-screen.js and
// ui/sync-panel.js, which import or serve them) is loaded with import() in synced mode only. test/boot-imports.test.mjs walks the static imports
// from this file and fails if one of them is reachable. Keep it that way: no static import of those files here or in anything boot.js imports.
//
// startApp({ mode, ui }) -> Promise of { mode, profile, events, actions, screens, storage, ctx } (null if storage could not be opened).
// The entry page needs #app-header and #screen. #notice (short messages) and the mode strip, notice and home note are created when missing.
// #app (hidden until the app shows) is optional in local and demo modes, which work without it, but required in synced mode, which shows
// and hides it around sign-in and does not create it; both shipped pages (app/index.html, demo/index.html) have it. Synced mode also needs
// the sign-in and sync markup of app/index.html (#signin, #signin-form, #email, #password, #signin-button, #signin-pending, #device and
// the sync panel's ids). Local and demo modes remove #signin and #device if the page has them.
//
// Mode hooks. Each mode can supply these (modes/local.js, modes/demo.js, or startApp's `ui` option, which wins); all are optional:
//   prepare(ctx)          async, once, after storage opens and before the first screen (the demo writes its fixture here)
//   saveChip(ctx)         -> { text, kind: 'ok'|'info'|'warn'|'error', pending, label? }: the header chip's label ("Demo") and the
//                         header panel's save line. Default: "Saved on this device".
//   strip(ctx)            -> Node | null: fills #mode-strip, above the header on every screen
//   notice(ctx)           -> Node | null: fills #mode-notice, which stays at the top of every screen
//   homeNote(ctx)         -> Node | null: fills #home-note, at the top of Home only
//   settings(ctx, host)   -> { update?, destroy? } | void: draws under the Settings heading (ui/settings-screen.js)
// ctx = { mode, profile, events, actions, storage, persistent, notify, refresh(), header, screens }. ctx.refresh() asks strip, notice and
// homeNote again; call it after something they show changes. The sign-out button exists only in synced mode.

import { createEventStore, testNote } from './store/events.js';
import { openStorage } from './store/open.js';
import { getDeviceId, ulid } from './ids.js';
import { createActions, createDraftStore } from './logging/index.js';
import { storageProfile } from './profile.js';
import { mountScreens } from './ui/screens.js';
import { demoUi } from './modes/demo.js';
import { localUi } from './modes/local.js';

const MODE_UI = { synced: {}, local: localUi, demo: demoUi };

// The Phase A spike kept a copy of the events and the cursor in localStorage. Both were only a cache;
// the server has the events, so the first sync now fetches them again into IndexedDB.
const spikeCacheKeys = (profile) => [`${profile.keyPrefix}spike.events`, `${profile.keyPrefix}cursor`];

function dropSpikeCache(profile) {
  for (const key of spikeCacheKeys(profile)) {
    try { localStorage.removeItem(key); } catch { /* storage blocked: nothing to remove */ }
  }
}

// The page's elements. #app-header and #screen are required; the rest are looked up, or created when the entry page has none.
function findElements(synced) {
  const byId = (id) => document.getElementById(id);
  const create = (id, tag, className) => {
    const node = document.createElement(tag);
    node.id = id;
    if (className) node.className = className;
    return node;
  };
  const el = { app: byId('app'), screen: byId('screen'), header: byId('app-header'), notice: byId('notice') };
  if (!el.screen || !el.header) throw new Error('The page needs #app-header and #screen.');
  if (!el.notice) { el.notice = create('notice', 'p', 'notice'); el.notice.hidden = true; (el.app ?? el.screen).before(el.notice); }
  for (const [key, id] of [['strip', 'mode-strip'], ['modeNotice', 'mode-notice'], ['homeNote', 'home-note']]) {
    el[key] = byId(id) ?? create(id, 'div', null);
    el[key].hidden = true;
  }
  if (!el.strip.isConnected) el.header.before(el.strip);
  if (!el.modeNotice.isConnected) (el.app ?? el.screen).before(el.modeNotice);
  if (!el.homeNote.isConnected) (el.app ?? el.screen).before(el.homeNote);
  if (synced) {
    Object.assign(el, {
      signin: byId('signin'), signinPending: byId('signin-pending'), device: byId('device'),
      form: byId('signin-form'), email: byId('email'), pin: byId('password'), signinButton: byId('signin-button'),
    });
  } else {
    byId('signin')?.remove(); // no account here, so no sign-in or sync markup
    byId('device')?.remove();
  }
  return el;
}

function makeNotify(node) {
  return function notify(text, kind = 'info') {
    node.textContent = text;
    node.className = kind === 'info' ? 'notice' : `notice ${kind}`;
    node.hidden = !text;
    // The notice sits at the top of the page; an error from a button far down the session screen has to be seen.
    if (text && kind === 'error') node.scrollIntoView?.({ block: 'nearest' });
  };
}

const defaultSaveState = ({ persistent }) => (persistent
  ? { text: 'Saved on this device.', kind: 'ok', pending: 0 }
  : { text: 'Not saved: this browser is not keeping your workouts.', kind: 'warn', pending: 0 });

export async function startApp({ mode, ui: uiOverride = {} } = {}) {
  const profile = storageProfile(mode); // throws for an unknown mode
  const synced = mode === 'synced';
  const ui = { ...MODE_UI[mode], ...uiOverride };
  const el = findElements(synced);
  const notify = makeNotify(el.notice);

  // The network code, loaded only here (see the header comment).
  let net = null;
  if (synced) {
    try {
      const [auth, api, sync, format, authScreen, syncPanel] = await Promise.all([
        import('./store/auth.js'), import('./store/api.js'), import('./store/sync.js'),
        import('./ui/format.js'), import('./ui/auth-screen.js'), import('./ui/sync-panel.js'),
      ]);
      net = { ...auth, ...api, ...sync, ...format, ...authScreen, ...syncPanel };
    } catch (err) {
      console.error(err);
      notify('Could not load the app.', 'error');
      return null;
    }
  }

  dropSpikeCache(profile);
  let storage;
  let events;
  try {
    storage = await openStorage({ profile });
    events = await createEventStore({ storage, deviceId: getDeviceId(profile) });
  } catch (err) {
    console.error(err);
    notify('Could not open storage on this device.', 'error');
    return null;
  }

  // The in-progress draft (values typed but not logged yet, the rest timer) lives in localStorage; logged sets are events.
  let draftBackend = null;
  try { draftBackend = localStorage; } catch { /* storage blocked: the draft stays in memory */ }
  const actions = createActions({ events, drafts: createDraftStore(draftBackend, profile), now: Date.now, newId: ulid });

  const ctx = { mode, profile, events, actions, storage, persistent: events.persistent, notify, refresh: () => paintRegions(), header: null, screens: null };
  try { await ui.prepare?.(ctx); } catch (err) { console.error(err); notify('Could not set up this mode.', 'error'); }

  // Strip, persistent notice and Home note: the mode's hooks fill their regions, which are empty (hidden) otherwise.
  let route = { name: 'home' };
  function paintRegions() {
    const put = (region, make) => {
      const node = make?.(ctx) ?? null;
      region.replaceChildren(...(node ? [node] : []));
      region.hidden = !node;
    };
    put(el.strip, ui.strip);
    put(el.modeNotice, ui.notice);
    put(el.homeNote, route.name === 'home' ? ui.homeNote : null);
  }

  const synchronized = synced ? wireSynced({ net, el, events, notify }) : null;
  const screens = mountScreens({
    root: el.screen, headerRoot: el.header, events, actions, notify,
    handlers: synchronized ? { onSignOut: synchronized.signOutNow } : {},
    settingsSection: ui.settings ? (host, screenCtx) => ui.settings({ ...ctx, ...screenCtx }, host) : null,
    onRoute(next) {
      route = next;
      if (el.device) el.device.hidden = next.name !== 'settings';
      notify('');
      paintRegions();
    },
  });
  ctx.screens = screens;
  ctx.header = screens.header;

  // Whether the person's work is safe, in the header, on every screen.
  function paintSaveState() {
    if (synchronized) screens.header.setSave(synchronized.saveState());
    else screens.header.setSave({ pending: 0, ...(ui.saveChip ?? defaultSaveState)(ctx) });
  }
  events.subscribe(paintSaveState);

  if (synchronized) {
    synchronized.begin({ screens, paintSaveState });
  } else {
    if (el.app) el.app.hidden = false;
    screens.header.show(true);
    screens.start();
    paintSaveState();
  }
  paintRegions();
  return { mode, profile, events, actions, screens, storage, ctx };
}

// Synced mode: sign-in screen, sync, sign-out and the sync panel, exactly as main.js had them before the modes were split out.
function wireSynced({ net, el, events, notify }) {
  const sync = net.createSync({ events, api: net.defaultApi });
  let signedIn = false;
  let screensStarted = false;
  let screens = null;
  let paintSaveState = () => {};

  async function signOutNow() {
    sync.stop();
    await net.signOut();
    showSignedIn(false);
    notify('Signed out.');
  }

  function showSignedIn(value) {
    signedIn = value;
    el.signin.hidden = value;
    el.app.hidden = !value;
    screens.header.show(value);
    const waiting = events.pendingCount();
    el.signinPending.hidden = value || waiting === 0;
    el.signinPending.textContent = `${waiting} event${waiting === 1 ? '' : 's'} saved on this device will upload after you sign in.`;
    if (value) {
      panel.render();
      if (!screensStarted) { screensStarted = true; screens.start(); } else screens.update();
    } else {
      authScreen.focus();
    }
    paintSaveState();
  }

  const authScreen = net.mountAuthScreen(
    { form: el.form, email: el.email, pin: el.pin, button: el.signinButton },
    {
      notify,
      async onSubmit(email, pin) {
        authScreen.setBusy(true);
        try {
          await net.signIn(email, pin);
        } catch (err) {
          notify(net.describeError(err), 'error');
          return false;
        } finally {
          authScreen.setBusy(false);
        }
        notify('');
        showSignedIn(true);
        sync.sync().catch(() => {}); // the outcome shows in the sync line
        return true;
      },
    },
  );

  const panel = net.mountSyncPanel({ events, sync }, {
    async onAddNote() {
      const note = testNote(events.deviceId);
      await events.append(note.type, note.entityId, note.payload);
      notify('Test note saved on this device. It uploads in a couple of seconds.', 'ok');
    },
    onSync() {
      notify('');
      sync.sync().catch(() => {});
    },
  });

  // A session that cannot be refreshed sends the person back to the form; nothing is lost, the outbox stays.
  sync.subscribe((status) => {
    if (signedIn && status.lastError && net.needsSignIn(status.lastError)) {
      showSignedIn(false);
      notify(net.describeError(status.lastError), 'error');
    }
  });

  // Opening the app is the warm-up (docs/API-CONTRACT.md section 5): the normal sync wakes the Lambda before the first set.
  net.attachSyncTriggers({ sync, events, enabled: () => signedIn });

  return {
    signOutNow,
    // { text, kind, pending }: sync state in the header chip.
    saveState() {
      const pending = events.pendingCount();
      return { ...net.describeSaveState(sync.status(), pending), pending };
    },
    begin(deps) {
      ({ screens, paintSaveState } = deps);
      sync.subscribe(paintSaveState);
      if (net.hasRefreshToken()) {
        showSignedIn(true);
        sync.sync().catch(() => {});
      } else {
        showSignedIn(false);
      }
    },
  };
}

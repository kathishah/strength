// The page: sign in, then Home (the day's cards, in the v0.2 viewer's layout), the summary, History and Settings (DEPLOYMENT-PLAN.md
// sections 15, 15b and 15e), over the local event store. Everything the person does is written to IndexedDB first (store/events.js); uploading and
// downloading happen in the background (store/sync.js).

import { isConfigured } from './config.js';
import { hasRefreshToken, signIn, signOut } from './store/auth.js';
import { defaultApi } from './store/api.js';
import { openStorage } from './store/open.js';
import { createEventStore, testNote } from './store/events.js';
import { attachSyncTriggers, createSync } from './store/sync.js';
import { getDeviceId, ulid } from './ids.js';
import { createActions, createDraftStore } from './logging/index.js';
import { describeError, describeSaveState, needsSignIn } from './ui/format.js';
import { mountAuthScreen } from './ui/auth-screen.js';
import { mountScreens } from './ui/screens.js';
import { mountSyncPanel } from './ui/sync-panel.js';

// The Phase A spike kept a copy of the events and the cursor in localStorage. Both were only a cache;
// the server has the events, so the first sync now fetches them again into IndexedDB.
const SPIKE_CACHE_KEYS = ['strength.spike.events', 'strength.cursor'];

const $ = (id) => document.getElementById(id);
const el = {
  notice: $('notice'), signin: $('signin'), app: $('app'), signinPending: $('signin-pending'), screen: $('screen'),
  device: $('device'), header: $('app-header'),
  form: $('signin-form'), email: $('email'), pin: $('password'), signinButton: $('signin-button'),
};

function notify(text, kind = 'info') {
  el.notice.textContent = text;
  el.notice.className = kind === 'info' ? 'notice' : `notice ${kind}`;
  el.notice.hidden = !text;
  // The notice sits at the top of the page; an error from a button far down the session screen has to be seen.
  if (text && kind === 'error') el.notice.scrollIntoView?.({ block: 'nearest' });
}

function dropSpikeCache() {
  for (const key of SPIKE_CACHE_KEYS) {
    try { localStorage.removeItem(key); } catch { /* storage blocked: nothing to remove */ }
  }
}

async function start() {
  dropSpikeCache();
  if (!isConfigured()) {
    el.signin.hidden = false;
    el.signinButton.disabled = true;
    notify('Not configured yet: fill in js/config.js (see BUILD.md).');
    return;
  }

  let events;
  try {
    events = await createEventStore({ storage: await openStorage(), deviceId: getDeviceId() });
  } catch (err) {
    console.error(err);
    notify('Could not open storage on this device.', 'error');
    return;
  }
  const sync = createSync({ events, api: defaultApi });
  let signedIn = false;

  // The in-progress draft (values typed but not logged yet, the rest timer) lives in localStorage; logged sets are events.
  let draftBackend = null;
  try { draftBackend = localStorage; } catch { /* storage blocked: the draft stays in memory */ }
  const actions = createActions({ events, drafts: createDraftStore(draftBackend), now: Date.now, newId: ulid });
  let screensStarted = false;
  async function signOutNow() {
    sync.stop();
    await signOut();
    showSignedIn(false);
    notify('Signed out.');
  }
  const screens = mountScreens({
    root: el.screen, headerRoot: el.header, events, actions, notify, handlers: { onSignOut: signOutNow },
    onRoute(route) {
      el.device.hidden = route.name !== 'settings';
      notify('');
    },
  });

  // Whether the person's work is safe, in the header, on every screen.
  function paintSaveState() {
    const pending = events.pendingCount();
    screens.header.setSave({ ...describeSaveState(sync.status(), pending), pending });
  }
  events.subscribe(paintSaveState);
  sync.subscribe(paintSaveState);

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

  const authScreen = mountAuthScreen(
    { form: el.form, email: el.email, pin: el.pin, button: el.signinButton },
    {
      notify,
      async onSubmit(email, pin) {
        authScreen.setBusy(true);
        try {
          await signIn(email, pin);
        } catch (err) {
          notify(describeError(err), 'error');
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

  const panel = mountSyncPanel({ events, sync }, {
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
    if (signedIn && status.lastError && needsSignIn(status.lastError)) {
      showSignedIn(false);
      notify(describeError(status.lastError), 'error');
    }
  });

  // Opening the app is the warm-up (plan section 3): the normal sync wakes the Lambda before the first set.
  attachSyncTriggers({ sync, events, enabled: () => signedIn });

  if (hasRefreshToken()) {
    showSignedIn(true);
    sync.sync().catch(() => {});
  } else {
    showSignedIn(false);
  }
}

start();

// Offline load (plan section 15e): the worker caches the app shell. Sync and logging already work offline once the page is loaded.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch((err) => console.warn('No service worker:', err)); });
}

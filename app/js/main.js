// The app page (app/index.html). With the sync settings in config.js filled in it runs synced: sign in, then Home over the local event
// store, uploading and downloading in the background. Without them it runs local-only: no account, no network, events kept in this
// browser. The modes themselves are in boot.js.

import { isConfigured } from './config.js';
import { startApp } from './boot.js';

startApp({ mode: isConfigured() ? 'synced' : 'local' });

// Offline load (plan section 15e): the worker caches the app shell. Sync and logging already work offline once the page is loaded.
// (Here and not in boot.js: the demo registers no service worker.)
if ('serviceWorker' in navigator) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch((err) => console.warn('No service worker:', err)); });
}

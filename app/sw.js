// The service worker (spec 9, plan section 15e): the installed app opens with no network. Offline load only; sync is unchanged.
//
// Install caches the shell listed below. Every same-origin GET is answered network first, from the cache only when the network fails, and
// a good network answer refreshes the cache. So online you always get what was deployed (scripts/deploy-app.sh takes effect on the next
// load) and offline you get the last copy. Cognito and the API are other origins and are never touched here. The exercise images (img/, about 160 MB) are not
// in the list below: each is cached the first time it is shown, by the same network-first rule.
// test/sw.test.mjs fails if this list differs from the files in app/.

const CACHE = 'strength-shell-v1';
const SHELL = [
  'index.html',
  'css/app.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/config.js',
  'js/engine/calendar.js',
  'js/engine/config.js',
  'js/engine/history.js',
  'js/engine/index.js',
  'js/engine/load.js',
  'js/engine/session.js',
  'js/engine/suggest.js',
  'js/ids.js',
  'js/logging/actions.js',
  'js/logging/day-view.js',
  'js/logging/draft.js',
  'js/logging/history-view.js',
  'js/logging/index.js',
  'js/logging/input.js',
  'js/logging/rest-timer.js',
  'js/logging/rotation.js',
  'js/logging/rows.js',
  'js/logging/session-events.js',
  'js/logging/session-view.js',
  'js/logging/summary.js',
  'js/logging/text.js',
  'js/main.js',
  'js/seed/catalog.js',
  'js/seed/index.js',
  'js/seed/program.js',
  'js/seed/rules.js',
  'js/store/api.js',
  'js/store/auth.js',
  'js/store/events.js',
  'js/store/idb.js',
  'js/store/memory.js',
  'js/store/merge.js',
  'js/store/open.js',
  'js/store/outbox.js',
  'js/store/replay.js',
  'js/store/sync.js',
  'js/theme-boot.js',
  'js/time.js',
  'js/ui/app-header.js',
  'js/ui/auth-screen.js',
  'js/ui/chart.js',
  'js/ui/day-screen.js',
  'js/ui/dial.js',
  'js/ui/dom.js',
  'js/ui/exercise-screen.js',
  'js/ui/format.js',
  'js/ui/history-screen.js',
  'js/ui/router.js',
  'js/ui/screens.js',
  'js/ui/settings-screen.js',
  'js/ui/summary-screen.js',
  'js/ui/sync-panel.js',
  'js/ui/theme.js',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit ?? (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});

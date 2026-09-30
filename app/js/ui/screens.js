// Mounts the screen for the current route and keeps it up to date: every change to the event log (a set logged here, an event
// downloaded from another device) and every return to the page asks the current screen to redraw.

import { createRouter } from './router.js';
import { mountHome } from './home-screen.js';
import { mountRecovery } from './recovery-screen.js';
import { mountSession } from './session-screen.js';
import { mountSummary } from './summary-screen.js';

// root: the element the screens draw into. onRoute(route): called after each screen is shown.
export function mountScreens({ root, events, actions, notify, now = Date.now, onRoute }) {
  let current = null;
  let router = null;

  function show(route) {
    current?.destroy();
    current = null;
    const host = document.createElement('div');
    host.className = `screen screen-${route.name}`;
    root.replaceChildren(host);
    const ctx = { events, actions, now, notify, navigate: (hash) => router.navigate(hash) };
    switch (route.name) {
      case 'session': current = mountSession(host, ctx, route.id); break;
      case 'summary': current = mountSummary(host, ctx, route.id); break;
      case 'recovery': current = mountRecovery(host, ctx); break;
      default: current = mountHome(host, ctx);
    }
    if (route.name !== 'session') window.scrollTo(0, 0);
    onRoute?.(route);
  }

  router = createRouter({ onRoute: show });
  const update = () => current?.update();
  events.subscribe(update);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  return { start: router.start, navigate: router.navigate, update };
}

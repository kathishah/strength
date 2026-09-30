// Mounts the header and the screen for the current route and keeps them up to date: every change to the event log (an exercise done
// here, an event downloaded from another device) and every return to the page asks the current screen to redraw.
// Routes: #/ is Home (the day's cards, spec 6.2), #/summary/<id> is the summary after Finish and #/workout/<id> reopens a finished
// workout to correct it (spec 6.3). Older links (#/session/..,
// #/recovery) open Home.

import { createRouter } from './router.js';
import { mountHeader } from './app-header.js';
import { mountDay } from './day-screen.js';
import { mountSummary } from './summary-screen.js';

// headerRoot: the header element. handlers: { onSignOut }. onRoute(route): called after each screen is shown.
export function mountScreens({ root, headerRoot, events, actions, notify, handlers, now = Date.now, onRoute }) {
  let current = null;
  let router = null;
  // What the header chose: a weekday pill, and "show the workout" on a recovery day.
  const day = { picked: null, forceWorkout: false };

  const header = mountHeader({ root: headerRoot }, {
    onPickDay(weekday) { day.picked = weekday; day.forceWorkout = false; current?.update(); },
    onSignOut: handlers.onSignOut,
  });

  function show(route) {
    current?.destroy();
    current = null;
    const host = document.createElement('div');
    host.className = `screen screen-${route.name}`;
    root.replaceChildren(host);
    const ctx = { events, actions, now, notify, header, day, navigate: (hash) => router.navigate(hash) };
    current = route.name === 'summary' ? mountSummary(host, ctx, route.id) : mountDay(host, ctx, route.name === 'workout' ? route.id : null);
    window.scrollTo(0, 0);
    onRoute?.(route);
  }

  router = createRouter({ onRoute: show });
  const update = () => current?.update();
  events.subscribe(update);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  return { start: router.start, navigate: router.navigate, update, header };
}

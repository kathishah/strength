// The demo's own screens and wording (spec section 3, "Demo design"), as the mode hooks that boot.js's startApp({ mode: 'demo', ui })
// takes: prepare (write the sample history), saveChip ("Demo"), strip (the label and Reset demo) and settings (the explanation, the
// same Reset button and a link back to the landing page). Kept here, outside app/, so scripts/deploy-app.sh never uploads it.

import { clearProfile, DEMO_PROFILE } from '../app/js/profile.js';
import { EXERCISES } from '../app/js/seed/index.js';
import { pacificDate } from '../app/js/time.js';
import { armedIconButton, h, svgIcon } from '../app/js/ui/dom.js';
import { buildFixture } from './fixture.js';

export const STRIP_TEXT = 'Demo · a fictional lifter · changes stay in this browser';
export const LANDING_URL = '../';
const RESET_PATHS = ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'];

// The demo's own exercise art: original animated figures drawn for this project (demo/media/<exercise id>.gif, MIT with the repository).
// The catalog's gifUrl values ("img/<name>.gif") point at third-party files that are not published, so the page's copy of the catalog
// gets the demo's own file for each exercise listed here and no image path for the rest: those image slots show the app's built-in
// placeholder (PLACEHOLDER_GIF, a data: URI) without asking for a missing file. The art credit goes too, since the demo has no
// third-party art to credit. Only this page's copy of the catalog changes. Add an id here together with its file.
export const DEMO_MEDIA = [
  'db-bench-press',
  'db-romanian-deadlift',
  'farmer-carry',
  'goblet-squat',
  'incline-db-press',
  'leg-press',
  'reverse-lunge',
  'seated-cable-row',
];

// Relative to demo/index.html.
export const mediaUrl = (id) => `media/${id}.gif`;

export function useDemoMedia(exercises = EXERCISES, media = DEMO_MEDIA) {
  for (const [id, exercise] of Object.entries(exercises)) {
    if (media.includes(id)) exercise.gifUrl = mediaUrl(id);
    else delete exercise.gifUrl;
    delete exercise.attribution;
  }
}

// reload: how the page restarts after a reset (by default, the demo's Home: the same address without the #/route). now: the clock that
// decides "today" for a new fixture. Both can be replaced in tests.
export function createDemoUi({ reload = () => location.replace(location.pathname + location.search), now = Date.now } = {}) {
  // Two taps, then: delete the demo's database and keys, and reload. The reload opens empty storage, so the sample history is
  // written again before the first screen (prepare below), exactly as on a first visit.
  function resetButton(ctx) {
    return armedIconButton({
      label: 'Reset demo',
      armedText: 'Tap again to reset',
      className: 'demo-reset',
      icon: svgIcon(RESET_PATHS, 18),
      async onConfirm() {
        await clearProfile(DEMO_PROFILE, { storage: ctx.storage });
        reload();
      },
    });
  }
  // The button shows "Reset demo"; while armed, armedIconButton's own text ("Tap again to reset") takes its place (demo.css).
  function labelled(button) {
    const words = button.children[button.children.length - 1]; // the armed text, after the icon
    words.before(h('span', { class: 'demo-reset-label', text: 'Reset demo' }));
    return button;
  }

  return {
    // On a first visit (nothing stored yet) and after a reset, write the sample history. It is stored as if it had come from a
    // server: nothing waits to upload, and the demo has nowhere to upload to anyway.
    async prepare(ctx) {
      if (ctx.events.eventCount() > 0) return;
      const events = await buildFixture({ today: pacificDate(now()) });
      await ctx.events.ingest(events, null);
    },

    saveChip: () => ({ text: 'Demo: changes stay in this browser.', kind: 'info', pending: 0, label: 'Demo' }),

    strip(ctx) {
      return h('div', { class: 'demo-strip' },
        h('span', { class: 'demo-strip-text', text: STRIP_TEXT }),
        labelled(resetButton(ctx)));
    },

    settings(ctx, host) {
      host.append(h('section', { class: 'card demo-about', 'aria-labelledby': 'demo-about-title' },
        h('h3', { id: 'demo-about-title', text: 'About this demo' }),
        h('p', { text: 'This is a demo of Strength Training Tracker with a fictional lifter. The workouts, weights and dates are made up. You can tick exercises, change numbers and look through History.' }),
        h('p', { text: 'Nothing leaves your browser: there is no account, and the demo sends no data anywhere. Your changes are kept in this browser until you reset.' }),
        h('p', { text: 'Reset demo deletes your changes and restores the sample history.' }),
        h('div', { class: 'actions' },
          labelled(resetButton(ctx)),
          h('a', { class: 'btn', href: LANDING_URL, text: 'Back to the project page' }))));
    },
  };
}

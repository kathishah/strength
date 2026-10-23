// Phone previews for the landing page. They draw the app's real workout card and exercise-history screen at actual app size, with
// synthetic data (a made-up lifter, made-up weights, made-up dates). The pieces are the app's own: the exercise catalog and program,
// the text helpers, the barrel dial and the line chart. The card's markup follows buildCard in app/js/ui/day-screen.js and the
// history screen follows app/js/ui/exercise-screen.js; app.css is copied (scoped) into phone-preview.css.
//
// createPreview() returns a controller. mount() draws a workout or history screen into a container, and every mounted screen shows the
// same exercise and follows the same slide. The page calls go(i) when someone picks a lift in its list.
//
// Images. An exercise with original art (demo/media.js lists them) shows its animated figure from demo/media/; every other image slot
// shows the app's placeholder (PLACEHOLDER_GIF). No third-party image is requested, so the page looks the same everywhere.

import { h } from '../app/js/ui/dom.js';
import { createDial } from '../app/js/ui/dial.js';
import { lineChart } from '../app/js/ui/chart.js';
import { dialNotches, formatNumber } from '../app/js/logging/input.js';
import { formatDay, increaseText, lastText, phaseText, setsText } from '../app/js/logging/text.js';
import { EXERCISES, PLACEHOLDER_GIF } from '../app/js/seed/index.js';
import { WORKOUTS } from '../app/js/seed/program.js';
import { DEMO_MEDIA, mediaPath } from '../demo/media.js';

// Today in the story is Fri Oct 16. Workout A was done every Friday since Sep 4 (six sessions).
const DATES = ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09'];
const TODAY_DATE = '2026-10-16';
const SYNTHETIC = {
  'goblet-squat':         { weights: [15, 20, 20, 20, 25, 25], reps: [[12, 10, 10], [12, 11, 10], [12, 12, 11], [12, 12, 12], [10, 9, 8], [10, 10, 9]], next: 30, repsNow: 10, due: true },
  'db-bench-press':       { weights: [15, 15, 17.5, 17.5, 20, 20], reps: [[12, 10, 9], [12, 11, 10], [10, 9, 8], [11, 10, 9], [9, 8, 8], [10, 9, 8]], next: 20, repsNow: 10, due: false, nextDate: '2026-10-30' },
  'db-romanian-deadlift': { weights: [10, 12.5, 12.5, 15, 15, 15], reps: [[10, 10, 9], [9, 9, 8], [10, 10, 9], [9, 8, 8], [10, 9, 9], [10, 10, 9]], next: 17.5, repsNow: 8, due: true },
};
const OPEN_ALTS = { alternatives: true, trx: true }; // both lists open, so the preview shows what the buttons hold

const slots = WORKOUTS.A.slots.slice(0, 3);
const SLIDES = slots.map((slot, i) => {
  const ex = EXERCISES[slot.exercise];
  const syn = SYNTHETIC[slot.exercise];
  const lastW = syn.weights[syn.weights.length - 1];
  const increased = syn.next > lastW;
  const sessions = DATES.map((date, k) => ({
    date, top: syn.weights[k], increase: k > 0 && syn.weights[k] > syn.weights[k - 1],
    sets: syn.reps[k].map((reps) => ({ weightLbs: syn.weights[k], reps, levelNumber: null, distanceM: null })),
  }));
  return {
    id: slot.exercise, index: i, name: ex.name, notes: ex.notes, tags: ex.tags,
    prescription: `${slot.sets} × ${slot.reps}`, sets: Number(slot.sets),
    options: slot.alternatives, trx: slot.trxAlternatives,
    increased, next: syn.next, repsNow: syn.repsNow, sessions,
    increaseText: increased ? increaseText({ increased: true, weightLbs: syn.next, fromWeightLbs: lastW, source: 'scheduled' }) : null,
    lastText: lastText({ type: 'dumbbell', last: { date: DATES[DATES.length - 1], sets: sessions[sessions.length - 1].sets } }),
    lastIncrease: [...sessions].reverse().find((s) => s.increase)?.date ?? null,
    nextDate: syn.due ? TODAY_DATE : syn.nextDate, due: syn.due,
  };
});

// ---- images: the demo's own art, else the placeholder ----
// The path is relative to the landing page (the site root).
function image(id, props) {
  const img = h('img', { alt: '', loading: 'eager', decoding: 'async', referrerpolicy: 'no-referrer', ...props, src: DEMO_MEDIA.includes(id) ? `demo/${mediaPath(id)}` : PLACEHOLDER_GIF });
  img.addEventListener('error', () => { img.src = PLACEHOLDER_GIF; }, { once: true });
  return img;
}

// ---- pieces ----
const statusBar = () => h('div', { class: 'pp-status' }, h('span', { text: '9:41' }), h('i', { text: '▂▄▆ ◔' }));

function header(title) {
  return h('div', { class: 'pp-top' },
    h('div', { class: 'app-header' },
      h('div', { class: 'hdr-bar' },
        h('button', { type: 'button', class: 'hdr-status', tabindex: '-1' }, h('span', { class: 'hdr-text', text: title }), h('span', { class: 'chev', 'aria-hidden': 'true', text: '▾' })),
        h('span', { class: 'save-chip', 'data-kind': 'ok' }, h('span', { class: 'save-dot' })),
        h('button', { type: 'button', class: 'theme-btn', tabindex: '-1' }, '◐'))));
}

function altPanel(slide, group) {
  const ids = group === 'trx' ? slide.trx : slide.options;
  return h('div', { class: 'alt-panel', 'data-group': group === 'trx' ? 'trxAlternatives' : 'alternatives', role: 'group' },
    ids.map((id) => h('div', { class: 'alt-item' },
      h('div', { class: 'alt-thumb' }, image(id, { width: 56, height: 42 })),
      h('div', { class: 'alt-name', text: EXERCISES[id].name }),
      h('button', { type: 'button', class: 'alt-use', tabindex: '-1', text: 'Use this' }))));
}

function dialColumn(slide, dials, caption, field, value, { shared = false, increase = false } = {}) {
  const used = field === 'weightLbs' ? [slide.sessions[slide.sessions.length - 1].top, slide.next] : [value];
  const dial = createDial({
    values: dialNotches(field, used), format: field === 'weightLbs' ? formatNumber : String, label: `${slide.name} ${caption}`,
    className: increase ? 'increase' : '', onChange() {},
  });
  dials.push({ dial, value });
  const cap = shared ? h('span', { class: 'dcap', text: caption }) : h('button', { type: 'button', class: 'dcap skip', tabindex: '-1', text: caption });
  return h('div', { class: `dcol${shared ? ' shared' : ''}` }, cap, dial.el);
}

function workoutScreen(slide, dials) {
  const card = h('article', { class: `ex slide split${slide.increased ? ' increased' : ''}`, 'aria-label': slide.name },
    h('div', { class: 'ex-head' },
      h('div', { class: 'ex-header' },
        h('div', {}, h('h3', { class: 'ex-title', text: slide.name }), h('div', { class: 'phase-chip', text: `Exercise ${slide.index + 1} of ${WORKOUTS.A.slots.length}` })),
        h('div', { class: 'ex-meta' }, h('strong', { text: slide.prescription }), h('span', { text: 'Sets × Reps' }))),
      slide.increaseText ? h('p', { class: 'up', text: slide.increaseText }) : null),
    h('div', { class: 'ex-media' },
      h('div', { class: 'gif-wrapper' }, image(slide.id, { width: 640, height: 400, alt: `${slide.name} demonstration` }), h('div', { class: 'gif-label' }, h('span'), 'Live form reference'))),
    h('div', { class: 'ex-rest' },
      h('div', { class: 'exercise-body', text: slide.notes }),
      h('div', { class: 'tags' }, slide.tags.map((t) => h('span', { class: 'tag', text: t }))),
      h('div', { class: 'alt-row' },
        h('button', { type: 'button', class: 'alt-toggle opt', 'aria-expanded': String(OPEN_ALTS.alternatives), tabindex: '-1' }, 'Options ', h('span', { class: 'alt-badge', text: String(slide.options.length) })),
        h('button', { type: 'button', class: 'alt-toggle trx', 'aria-expanded': String(OPEN_ALTS.trx), tabindex: '-1' }, 'TRX ', h('span', { class: 'alt-badge', text: String(slide.trx.length) }))),
      altPanel(slide, 'options'),
      altPanel(slide, 'trx'),
      h('div', { class: 'log-area' },
        h('p', { class: 'last muted small', text: slide.lastText }),
        h('div', { class: 'logline' },
          [1, 2, 3].map((n) => dialColumn(slide, dials, `set ${n}`, 'weightLbs', slide.next, { increase: slide.increased })),
          h('span', { class: 'times', 'aria-hidden': 'true', text: '×' }),
          dialColumn(slide, dials, 'reps', 'reps', slide.repsNow, { shared: true }),
          h('button', { type: 'button', class: 'okbtn', tabindex: '-1', 'aria-label': `Done with ${slide.name}` }, '✓')))));
  return [
    statusBar(),
    header(`Fri · Workout A · 0/${WORKOUTS.A.slots.length} done`),
    h('div', { class: 'pp-scroll' }, h('div', { class: 'pp-scroll-inner' },
      h('main', { class: 'page' }, h('div', { class: 'day-body' },
        h('p', { class: 'phase-line muted small', text: `Week 6 · ${phaseText(2, { min: 2, max: 3 })}` }),
        h('div', { class: 'track' }, card))))),
  ];
}

function historyScreen(slide) {
  const points = slide.sessions.map((s) => ({ value: s.top, date: s.date, increase: s.increase }));
  const chart = lineChart({ points, label: `Top set over ${points.length} sessions, from ${points[0].value} to ${points[points.length - 1].value} (synthetic data)` });
  const rows = [...slide.sessions].reverse().slice(0, 5);
  return [
    statusBar(),
    header(slide.name),
    h('div', { class: 'pp-scroll' }, h('div', { class: 'pp-scroll-inner' },
      h('main', { class: 'page' },
        h('a', { class: 'back', href: '#', tabindex: '-1' }, '← History'),
        h('h2', { text: slide.name }),
        h('div', { class: 'stats2' },
          h('div', {}, h('span', { class: 'k', text: 'Last increase' }), h('span', { class: 'v', text: slide.lastIncrease ? formatDay(slide.lastIncrease) : '—' })),
          h('div', {}, h('span', { class: 'k', text: 'Next scheduled' }), h('span', { class: 'v' }, formatDay(slide.nextDate), slide.due ? [' ', h('span', { class: 'tag-due', text: '↑ due' })] : null))),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Chart' },
          h('button', { type: 'button', 'aria-pressed': 'true', tabindex: '-1', text: 'Top set' }),
          h('button', { type: 'button', 'aria-pressed': 'false', tabindex: '-1', text: 'Volume' })),
        h('section', { class: 'card' }, chart, h('p', { class: 'small muted', text: 'Green lines mark an increase.' })),
        h('section', { class: 'card' },
          h('table', { class: 'htable' },
            h('thead', {}, h('tr', {}, h('th', { text: 'Date' }), h('th', { text: 'Sets' }), h('th', { class: 'r', text: 'Top' }))),
            h('tbody', {}, rows.map((r) => h('tr', {},
              h('td', {}, h('a', { href: '#', tabindex: '-1' }, `${r.date.slice(5).replace('-', '/')} · A`)),
              h('td', {}, h('a', { href: '#', tabindex: '-1' }, setsText(r.sets))),
              h('td', { class: 'r' }, h('a', { href: '#', tabindex: '-1' }, `${r.top} ›`)))))),
          h('p', { class: 'small muted', text: 'Tap a row to open that workout and correct it.' }))))),
  ];
}

export function createPreview({ interval = 7500 } = {}) {
  const screens = []; // { el, kind, dials }
  const listeners = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, timer = 0, scrollTimer = 0;

  function render() {
    const slide = SLIDES[index];
    clearTimeout(scrollTimer);
    for (const s of screens) {
      s.dials.forEach(({ dial }) => dial.dispose());
      s.dials = [];
      s.el.replaceChildren(...(s.kind === 'history' ? historyScreen(slide) : workoutScreen(slide, s.dials)));
      // dials need a layout before they can sit on their value
      s.dials.forEach(({ dial, value }) => dial.init(value));
    }
    // Scroll each screen once, slowly, like a screen recording: the workout card shows its lists and then its dials.
    if (!reduced.matches) {
      scrollTimer = setTimeout(() => screens.forEach(({ el }) => {
        const inner = el.querySelector('.pp-scroll-inner'), box = el.querySelector('.pp-scroll');
        const extra = inner.scrollHeight - box.clientHeight;
        if (extra > 0) inner.style.transform = `translateY(${-extra}px)`;
      }), interval * 0.3);
    }
    listeners.forEach((fn) => fn(index, slide));
  }
  function restart() {
    clearInterval(timer);
    if (!reduced.matches) timer = setInterval(() => { if (!document.hidden) { index = (index + 1) % SLIDES.length; render(); } }, interval);
  }
  function go(i) {
    index = (i + SLIDES.length) % SLIDES.length;
    render();
    restart();
  }
  reduced.addEventListener('change', () => { restart(); render(); });

  return {
    slides: SLIDES,
    get index() { return index; },
    mount(container, kind = 'workout') {
      const device = h('div', { class: 'pp-device' });
      const screen = h('div', { class: 'pp-screen', role: 'img', 'aria-label': kind === 'history'
        ? 'The app’s exercise history screen with made-up data: last increase, a top-set chart with increases marked, and past sessions.'
        : 'The app’s workout screen with made-up data: the exercise, its form image, the Options and TRX alternatives, and the weight and rep dials.' });
      device.append(screen);
      container.append(device);
      screens.push({ el: screen, kind, dials: [] });
      return device;
    },
    onChange(fn) { listeners.push(fn); },
    async start() {
      render();
      restart();
    },
    go,
  };
}

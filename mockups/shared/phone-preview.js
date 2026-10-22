// Shared phone preview for the landing-page mockups: the first three Workout A exercises from app/js/seed/program.js, with
// synthetic history. create() returns a controller; mount() draws a workout or history screen into a container, and every
// mounted screen follows the same slide. Pages build their own exercise selectors and call go(i).
(() => {
  const SLIDES = [
    {
      key: 'goblet-squat', name: 'Goblet Squat', short: 'Goblet squat', sets: 3, reps: '8–12', gif: 'goblet-squat.gif',
      cue: 'Hold the dumbbell tall at your chest, squat between your heels, and keep your torso upright.',
      tags: ['Quads', 'Glutes', 'Core'], up: '↑ +5 lb from 25 · scheduled', last: 'Last time: 3 × 10 · 25 lb',
      options: ['Leg Press', 'Box Squat', 'Hack Squat', 'Leg Extension'], trx: ['TRX Squat'],
      load: 30, repsDone: 10, unit: 'lb', history: [20, 20, 25, 25, 25, 30], increases: [2, 5]
    },
    {
      key: 'db-bench-press', name: 'Dumbbell Bench Press', short: 'Dumbbell bench press', sets: 3, reps: '8–12', gif: 'db-bench-press.gif',
      cue: 'Keep shoulder blades tucked into the bench and lower the dumbbells under control to chest level.',
      tags: ['Chest', 'Triceps', 'Shoulders'], up: '↑ +2.5 lb per hand · scheduled', last: 'Last time: 3 × 10 · 20 lb per hand',
      options: ['Machine Chest Press', 'Pushup', 'Cable Chest Press', 'Pec Deck Fly'], trx: ['TRX Chest Press'],
      load: 22.5, repsDone: 10, unit: 'lb', history: [17.5, 17.5, 20, 20, 20, 22.5], increases: [2, 5]
    },
    {
      key: 'db-romanian-deadlift', name: 'Dumbbell Romanian Deadlift', short: 'Dumbbell Romanian deadlift', sets: 3, reps: '8–10', gif: 'db-romanian-deadlift.gif',
      cue: 'Soft knees, push hips back, and slide the dumbbells down your thighs with a flat back.',
      tags: ['Hamstrings', 'Glutes', 'Lower back'], up: '↑ +2.5 lb per hand · scheduled', last: 'Last time: 3 × 8 · 15 lb per hand',
      options: ['Hip Thrust', 'Cable Pull-Through', 'Seated Leg Curl'], trx: ['TRX Hamstring Curl'],
      load: 17.5, repsDone: 8, unit: 'lb', history: [12.5, 12.5, 15, 15, 15, 17.5], increases: [2, 5]
    }
  ];
  const DATES = ['Sep 4', 'Sep 11', 'Sep 18', 'Sep 25', 'Oct 2', 'Oct 9'];

  const status = '<div class="pp-status"><span>9:41</span><i>▂▄▆ ◔</i></div>';
  const num = (n) => String(n).replace('.5', '½');

  function workoutHTML(s, i, img) {
    const alt = (n) => `<div class="pp-alt"><span>${n}</span><span>Use this</span></div>`;
    const dial = (v, cls = '') => `<div class="pp-dial ${cls}"><i>${v - (typeof v === 'number' && v > 15 ? 2.5 : 1)}</i><b>${v}</b><i>${v + (typeof v === 'number' && v > 15 ? 2.5 : 1)}</i></div>`;
    return `${status}<div class="pp-scroll"><div class="pp-scroll-inner">
      <div class="pp-head"><b>Workout A <small>· 0/6 done ▾</small></b><span class="pp-dot"></span><span class="pp-theme">☼</span></div>
      <div class="pp-days"><span class="on">Workout A</span><span>B</span><span>C</span><span>Recovery</span></div>
      <div class="pp-page">
        <div class="pp-label">Exercise ${i + 1} of 6 · Full body</div>
        <article class="pp-card pp-in">
          <div class="pp-top"><div><h3 class="pp-title">${s.name}</h3><span class="pp-chip">Workout A</span></div>
            <div class="pp-meta"><strong>${s.sets} × ${s.reps}</strong>sets × reps</div></div>
          <div class="pp-up">${s.up}</div>
          <div class="pp-gif"><img src="${img}${s.gif}" alt="${s.name} demonstration"><span class="pp-gif-label"><span></span>Form reference</span></div>
          <p class="pp-cue">${s.cue}</p>
          <div class="pp-tags">${s.tags.map((t) => `<span>${t}</span>`).join('')}</div>
          <div class="pp-alt-btns"><span class="pp-opt">Options <em>${s.options.length}</em></span><span class="pp-trx">TRX <em>${s.trx.length}</em></span></div>
          <div class="pp-alts"><h4>Options</h4>${s.options.map(alt).join('')}<h4 class="trx">TRX alternatives</h4>${s.trx.map(alt).join('')}</div>
          <div class="pp-last">${s.last}</div>
          <div class="pp-dials">
            ${[1, 2, 3].map((n) => `<div class="pp-dcol"><span class="pp-dcap">set ${n}</span>${dial(s.load, 'pp-incr')}</div>`).join('')}
            <span class="pp-times">×</span>
            <div class="pp-dcol"><span class="pp-dcap">reps</span>${dial(s.repsDone)}</div>
            <span class="pp-ok">✓</span>
          </div>
        </article>
      </div></div></div>`;
  }

  function chartSVG(s) {
    const w = 320, h = 150, left = 34, right = 12, top = 18, bottom = 26;
    const min = Math.min(...s.history) - 2.5, max = Math.max(...s.history) + 2.5;
    const x = (k) => left + (k * (w - left - right)) / (s.history.length - 1);
    const y = (v) => top + ((max - v) * (h - top - bottom)) / (max - min);
    const ticks = [min + 2.5, (min + max) / 2, max - 2.5];
    const pts = s.history.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Synthetic top-set history for ${s.short}">
      ${ticks.map((t) => `<line x1="${left}" x2="${w - right}" y1="${y(t)}" y2="${y(t)}" stroke="#e2e8f0" stroke-dasharray="3 4"/><text x="4" y="${y(t) + 4}" fill="#64748b" font-size="11">${num(t)}</text>`).join('')}
      ${s.increases.map((k) => `<line x1="${x(k)}" x2="${x(k)}" y1="${top - 6}" y2="${h - bottom}" stroke="#16a34a" stroke-dasharray="3 3"/><text x="${x(k) + 4}" y="${top - 6}" fill="#14532d" font-size="11">↑ ${num(s.history[k])}</text>`).join('')}
      <polyline points="${pts}" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linejoin="round"/>
      ${s.history.map((v, k) => `<circle cx="${x(k)}" cy="${y(v)}" r="3.5" fill="#4f46e5"/>`).join('')}
      <text x="${left}" y="${h - 6}" fill="#64748b" font-size="11">${DATES[0]}</text><text x="${w - right}" y="${h - 6}" fill="#64748b" font-size="11" text-anchor="end">${DATES[DATES.length - 1]}</text>
    </svg>`;
  }

  function historyHTML(s) {
    const rows = [5, 4, 3].map((k) => `<div class="pp-row"><span>${DATES[k]} · Workout A</span><span>3 × ${s.repsDone} · ${num(s.history[k])} ${s.unit} ›</span></div>`).join('');
    return `${status}<div class="pp-scroll"><div class="pp-scroll-inner">
      <div class="pp-head"><b>‹ History</b><span class="pp-dot"></span><span class="pp-theme">☼</span></div>
      <div class="pp-hhead">${s.name}</div><div class="pp-hsub">6 sessions · Workout A, slot ${SLIDES.indexOf(s) + 1}</div>
      <div class="pp-stats"><div><small>Last increase</small><b>Oct 9 · +${num(s.history[5] - s.history[4])} ${s.unit}</b></div><div><small>Next scheduled</small><b>Due Oct 30</b></div></div>
      <div class="pp-chart"><div class="pp-seg"><span class="on">Top set</span><span>Volume</span></div>${chartSVG(s)}<div class="pp-note">Green markers show increases</div></div>
      <div class="pp-table"><b>Past sessions</b>${rows}</div>
    </div></div>`;
  }

  function create({ interval = 7000, img = 'img/', autoplay = true } = {}) {
    const screens = [];
    const listeners = [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let index = 0, timer = 0, scrollTimer = 0;

    function render() {
      const s = SLIDES[index];
      clearTimeout(scrollTimer);
      screens.forEach(({ el, kind }) => { el.innerHTML = kind === 'history' ? historyHTML(s) : workoutHTML(s, index, img); });
      // Scroll the workout card like a screen recording, so the expanded alternatives and the log dials both appear.
      if (!reduced) scrollTimer = setTimeout(() => screens.forEach(({ el }) => {
        const inner = el.querySelector('.pp-scroll-inner'), box = el.querySelector('.pp-scroll');
        const extra = inner.scrollHeight - box.clientHeight;
        if (extra > 0) inner.style.transform = `translateY(${-extra}px)`;
      }), interval * 0.38);
      listeners.forEach((fn) => fn(index, s));
    }
    function go(i) {
      index = (i + SLIDES.length) % SLIDES.length;
      render();
      restart();
    }
    function restart() {
      clearInterval(timer);
      if (autoplay && !reduced) timer = setInterval(() => { index = (index + 1) % SLIDES.length; render(); }, interval);
    }
    return {
      slides: SLIDES,
      get index() { return index; },
      mount(container, kind = 'workout') {
        const device = document.createElement('div');
        device.className = 'pp-device';
        device.innerHTML = '<div class="pp-screen"></div>';
        container.append(device);
        screens.push({ el: device.firstChild, kind });
        return device;
      },
      onChange(fn) { listeners.push(fn); },
      start() { render(); restart(); },
      go, next: () => go(index + 1), prev: () => go(index - 1),
      interval
    };
  }

  window.PhonePreview = { create, slides: SLIDES };
})();

// A barrel dial: a drum that shows one value. Drag it up and the value goes up a notch (or several, on a flick), drag it down and it
// goes down; tap its upper half for one notch up and its lower half for one notch down. It snaps to a notch (CSS scroll snap), so a
// set's weight is one flick or one tap away and no keyboard is needed. The neighbours tilt into view as it turns, like a barrel.
// Keyboard: arrow keys. Screen readers get a spin button.
//
//   const dial = createDial({ values: [20, 22.5, 25], format: String, label: 'Set 1 weight in pounds', onChange: (v) => ... });
//   dial.el; dial.set(25) moves it without calling onChange; dial.value; dial.dispose() when the dial leaves the page.

import { h } from './dom.js';

export const ITEM_PX = 44; // one notch, and the height of the dial (keep in step with .dial and .dial-item in app.css)

export function createDial({ values, format = String, label, onChange, className = '' }) {
  const n = values.length;
  const clampIndex = (i) => Math.max(0, Math.min(n - 1, i));
  const nearest = (v) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(values[i] - v) < Math.abs(values[best] - v)) best = i;
    return best;
  };

  let index = 0;
  let touching = false;
  let lastTouchAt = -Infinity; // the last time the person touched, wheeled or keyed this dial
  let lastUserScrollAt = -Infinity; // a scroll the person caused (not one this dial made itself)
  let ownScrollUntil = 0; // the dial's own programmatic scrolls, smooth ones included, run until then
  let retryTimer = null;
  let settleTimer = null;
  let frame = 0;
  let disposed = false;
  let drag = null; // a mouse drag in progress: phones turn the drum by touch natively, a mouse has to be told
  let swallowClick = false;

  const items = values.map((v) => h('li', { class: 'dial-item' }, format(v)));
  const scroller = h('div', { class: 'dial-scroll' }, h('ul', { class: 'dial-list' }, items));
  const el = h('div', {
    class: `dial ${className}`.trim(), role: 'spinbutton', tabindex: '0', 'aria-label': label, 'aria-valuemin': values[0], 'aria-valuemax': values[n - 1],
    // A tap (a drag does not click): the upper half steps up, the lower half steps down.
    onclick(e) {
      if (swallowClick) { swallowClick = false; return; }
      const box = el.getBoundingClientRect();
      choose(index + (e.clientY < box.top + box.height / 2 ? 1 : -1), true);
    },
    onkeydown(e) {
      lastTouchAt = performance.now();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        choose(index + (e.key === 'ArrowUp' ? 1 : -1), true);
      }
    },
  }, scroller, h('span', { class: 'dial-hint up', 'aria-hidden': 'true' }, '▴'), h('span', { class: 'dial-hint down', 'aria-hidden': 'true' }, '▾'));

  // The barrel: the nearer a row is to the middle, the flatter and brighter it is. Only rows in view are touched.
  function paint() {
    frame = 0;
    const f = scroller.scrollTop / ITEM_PX;
    for (let i = Math.max(0, Math.floor(f) - 1); i <= Math.min(n - 1, Math.ceil(f) + 1); i++) {
      const d = i - f;
      const a = Math.min(Math.abs(d), 1);
      const item = items[i];
      item.style.opacity = String(1 - a * 0.7);
      item.style.transform = `rotateX(${Math.round(-d * 55)}deg) scale(${(1 - a * 0.15).toFixed(2)})`;
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

  function announce() {
    el.setAttribute('aria-valuenow', String(values[index]));
    el.setAttribute('aria-valuetext', format(values[index]));
  }

  // Moves to a notch. user: it came from the person (a tap or key), so onChange runs and the drum scrolls smoothly.
  function choose(i, user) {
    const next = clampIndex(i);
    const changed = next !== index;
    index = next;
    announce();
    ownScrollUntil = performance.now() + (user ? 450 : 120);
    scroller.scrollTo({ top: next * ITEM_PX, behavior: user ? 'smooth' : 'instant' });
    if (user && changed) onChange(values[next]);
  }

  // A scroll the person did not cause (the dial was laid out late, the page moved under it) must never change the value.
  const byPerson = () => touching || performance.now() - lastTouchAt < 2500;

  function settle() {
    settleTimer = null;
    if (disposed || !el.isConnected || scroller.clientHeight === 0) return; // a dial that left the page reports nothing
    const i = clampIndex(Math.round(scroller.scrollTop / ITEM_PX));
    if (i !== index && !byPerson()) {
      scroller.scrollTop = index * ITEM_PX; // put it back where the value says it is
      schedule();
      return;
    }
    if (i !== index) {
      index = i;
      announce();
      onChange(values[i]);
    }
  }

  scroller.addEventListener('scroll', () => {
    if (performance.now() > ownScrollUntil) lastUserScrollAt = performance.now();
    schedule();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 110);
  }, { passive: true });
  scroller.addEventListener('scrollend', () => { clearTimeout(settleTimer); settle(); });
  scroller.addEventListener('pointerdown', (e) => {
    touching = true;
    lastTouchAt = performance.now();
    if (e.pointerType === 'mouse' && e.button === 0) {
      drag = { y: e.clientY, top: scroller.scrollTop, moved: false };
      el.classList.add('dragging');
      scroller.setPointerCapture?.(e.pointerId);
    }
  });
  scroller.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 4) drag.moved = true;
    scroller.scrollTop = drag.top - dy;
  });
  scroller.addEventListener('wheel', () => { lastTouchAt = performance.now(); }, { passive: true });
  const release = () => {
    touching = false;
    lastTouchAt = performance.now();
    if (drag) {
      swallowClick = drag.moved; // the click that ends a drag is not a tap
      drag = null;
      el.classList.remove('dragging');
      schedule();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 160);
    }
  };
  for (const type of ['pointerup', 'pointercancel']) addEventListener(type, release, { passive: true });

  return {
    el,
    dispose() {
      disposed = true;
      clearTimeout(retryTimer);
      for (const type of ['pointerup', 'pointercancel']) removeEventListener(type, release);
      clearTimeout(settleTimer);
      cancelAnimationFrame(frame);
    },
    get value() { return values[index]; },
    // Follows a value that changed elsewhere (a later set following the one before it). Never while the person is on this dial.
    set(value) {
      if (value === null || value === undefined) return;
      const i = nearest(value);
      if (i === index && Math.abs(scroller.scrollTop - i * ITEM_PX) < 1) return;
      // Never while the person is turning this dial; it catches up a moment later.
      if (touching || performance.now() - lastUserScrollAt < 250) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { if (!disposed) this.set(value); }, 300);
        return;
      }
      index = i;
      announce();
      ownScrollUntil = performance.now() + 120;
      scroller.scrollTop = i * ITEM_PX;
      schedule();
    },
    // Put in place after the dial is in the page (scrollTop only works once it has a layout).
    init(value) {
      index = nearest(value ?? values[0]);
      announce();
      ownScrollUntil = performance.now() + 120;
      scroller.scrollTop = index * ITEM_PX;
      paint();
    },
  };
}

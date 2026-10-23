// Landing page behaviour: the phone previews, the red circle and strike-throughs on the Today list, and the phone carousel's dots.
// Everything here is decoration over a page that already reads in full without it. No network requests are made except for the
// page's own files, and nothing is stored.

const NS = 'http://www.w3.org/2000/svg';
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const carousel = matchMedia('(max-width: 720px)');

const today = document.querySelector('.today');
const overlay = document.getElementById('overlay');
const items = [...document.querySelectorAll('#list li')];
const slides = document.getElementById('slides');
const panels = [...slides.children];
let current = 0;
let ctl = null;

// ---- the phone previews (they come from app code; if that is unavailable the rest of the page still works) ----
try {
  const { createPreview } = await import('./phone-preview.js');
  ctl = createPreview({ interval: 7500 });
  ctl.mount(document.getElementById('phone'));
  ctl.mount(document.getElementById('history-phone'), 'history');
} catch (error) {
  console.warn('Phone previews unavailable:', error);
  document.querySelectorAll('.phone-wrap').forEach((el) => { el.hidden = true; });
  document.querySelectorAll('button.nm').forEach((b) => { b.disabled = true; });
}

// ---- Today list: a marker loop round the lift on the phone, a line through the finished ones ----
// A hand-drawn ellipse: a little wobble, and it overshoots its start like a marker does.
function roughEllipse(cx, cy, rx, ry) {
  const pts = [];
  for (let k = 0; k <= 48; k++) {
    const t = -2.6 + (k / 48) * Math.PI * 2.15;
    const w = 1 + Math.sin(k * 1.3) * 0.025 + k * 0.0012;
    pts.push(`${(cx + Math.cos(t) * rx * w).toFixed(1)} ${(cy + Math.sin(t) * ry * w).toFixed(1)}`);
  }
  return 'M' + pts.join(' L');
}
function stroke(d, color, width, cls) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('stroke', color);
  p.setAttribute('stroke-width', width);
  if (cls) p.setAttribute('class', cls);
  overlay.append(p);
  return p;
}
function drawIn(p, ms) {
  if (motion.matches) return;
  const len = p.getTotalLength();
  p.style.strokeDasharray = len;
  p.style.strokeDashoffset = len;
  p.getBoundingClientRect();
  p.style.transition = `stroke-dashoffset ${ms}ms ease-out`;
  p.style.strokeDashoffset = 0;
}

function draw(animate) {
  overlay.replaceChildren();
  const base = today.getBoundingClientRect();
  const rel = (r) => ({ l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top });
  items.forEach((li, i) => {
    li.classList.toggle('done', i < current);
    if (i >= current) return;
    const r = rel(li.querySelector('.nm').getBoundingClientRect());
    const y = (r.t + r.b) / 2;
    const p = stroke(`M${r.l - 6} ${y + 3} C ${r.l + (r.r - r.l) / 2} ${y - 4}, ${r.r - 20} ${y + 2}, ${r.r + 8} ${y - 3}`, 'var(--mk-black)', 3.5);
    if (animate && i === current - 1) drawIn(p, 400);
  });
  const li = rel(items[current].getBoundingClientRect());
  const cx = (li.l + li.r) / 2, cy = (li.t + li.b) / 2;
  // inside the carousel the slide's edge would clip a wider loop
  const circle = stroke(roughEllipse(cx, cy, (li.r - li.l) / 2 + (carousel.matches ? 10 : 22), (li.b - li.t) / 2 + 12), 'var(--mk-red)', 4);
  if (animate) drawIn(circle, 650);
  // An arrow from the circled lift to the phone's card, only when the phone sits beside the list.
  const phone = document.querySelector('#phone .pp-device');
  if (!phone || carousel.matches) return;
  const ph = rel(phone.getBoundingClientRect());
  if (ph.l <= li.r) return;
  const sx = li.r + 26, sy = cy, ex = ph.l - 8, ey = cy + 56;
  const arrow = stroke(`M${sx} ${sy} C ${sx + 40} ${sy - 14}, ${ex - 46} ${ey - 6}, ${ex} ${ey}`, 'var(--mk-red)', 4, 'arrow');
  const head = stroke(`M${ex - 20} ${ey - 13} L${ex} ${ey} L${ex - 18} ${ey + 13}`, 'var(--mk-red)', 4, 'arrow');
  if (animate) { drawIn(arrow, 500); drawIn(head, 200); }
}

if (ctl) {
  items.slice(0, 3).forEach((li, i) => li.querySelector('button.nm').addEventListener('click', () => ctl.go(i)));
  ctl.onChange((i) => { current = i; requestAnimationFrame(() => draw(true)); });
}
addEventListener('resize', () => draw(false));

// ---- phone carousel: one tappable dot per slide, kept in step with the swipe ----
const dots = document.getElementById('dots');
const caption = document.createElement('span');
caption.setAttribute('aria-live', 'off');
const visible = panels.filter((p) => !p.hidden);
visible.forEach((panel) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', panel.dataset.label);
  b.addEventListener('click', () => slides.scrollTo({ left: panel.offsetLeft - slides.offsetLeft, behavior: motion.matches ? 'auto' : 'smooth' }));
  dots.append(b);
});
dots.append(caption);
function markSlide() {
  const i = Math.min(visible.length - 1, Math.round(slides.scrollLeft / slides.clientWidth) || 0);
  [...dots.querySelectorAll('button')].forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
  caption.textContent = visible[i].dataset.label.toLowerCase();
}
slides.addEventListener('scroll', () => requestAnimationFrame(markSlide), { passive: true });
// the swipe area is a keyboard-scrollable region only while it is a carousel
function markCarousel() {
  if (carousel.matches) { slides.tabIndex = 0; slides.setAttribute('role', 'region'); slides.setAttribute('aria-label', 'Screens, swipe sideways'); }
  else { slides.removeAttribute('tabindex'); slides.removeAttribute('role'); slides.removeAttribute('aria-label'); }
  markSlide();
}
carousel.addEventListener('change', markCarousel);
markCarousel();

document.fonts.ready.then(() => draw(false));
draw(false);
ctl?.start().catch((error) => console.warn('Phone previews unavailable:', error));

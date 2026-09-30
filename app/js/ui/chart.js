// A small line chart as inline SVG (spec 6.6): one value per session, evenly spaced, the increases marked with a dashed green line and
// the new value. No library. points: [{ value, date, increase }] oldest first. Returns the <svg> element.

import { formatDay } from '../logging/text.js';
import { formatNumber } from '../logging/index.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 170;
const M = { left: 38, right: 14, top: 22, bottom: 30 };

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

const short = (date) => formatDay(date).split(', ')[1] ?? date;

export function lineChart({ points, label }) {
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  if (points.length === 0) return root;
  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const x = (i) => (points.length === 1 ? (M.left + W - M.right) / 2 : M.left + ((W - M.left - M.right) * i) / (points.length - 1));
  const y = (v) => M.top + ((H - M.top - M.bottom) * (hi - v)) / (hi - lo);

  for (const v of [lo + pad, (lo + hi) / 2, hi - pad]) {
    root.append(svg('line', { class: 'grid', x1: M.left, x2: W - M.right, y1: y(v), y2: y(v) }));
    root.append(svg('text', { class: 'tick', x: 2, y: y(v) + 4 }, formatNumber(Math.round(v * 10) / 10)));
  }
  points.forEach((p, i) => {
    if (!p.increase) return;
    root.append(svg('line', { class: 'inc', x1: x(i), x2: x(i), y1: M.top - 8, y2: H - M.bottom }));
    root.append(svg('text', { class: 'inclabel', x: Math.min(x(i), W - 34), y: 10 }, `↑ ${formatNumber(p.value)}`));
  });
  root.append(svg('polyline', { class: 'line', points: points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ') }));
  points.forEach((p, i) => root.append(svg('circle', { class: 'dot', cx: x(i), cy: y(p.value), r: 3.5 })));
  root.append(svg('text', { class: 'axis', x: M.left - 4, y: H - 8 }, short(points[0].date)));
  if (points.length > 1) root.append(svg('text', { class: 'axis', x: W - M.right, y: H - 8, 'text-anchor': 'end' }, short(points[points.length - 1].date)));
  return root;
}

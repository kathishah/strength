// One exercise's history (spec 6.6): the last and next increase, a chart (top set or volume, increases marked) and the past sessions.
// A row of the table opens that workout for editing (spec 6.3).

import { exerciseDetail } from '../logging/index.js';
import { pacificDate } from '../time.js';
import { fill, h } from './dom.js';
import { lineChart } from './chart.js';

export function mountExercise(container, ctx, exerciseId) {
  const ui = { metric: 'top' }; // 'top' | 'volume'

  function render() {
    const d = exerciseDetail(ctx.events.state, exerciseId, pacificDate(ctx.now()));
    if (d === null) { ctx.navigate('#/history'); return; }
    ctx.header.setStatus(d.name);
    ctx.header.setDays([], null);

    const metricName = ui.metric === 'top' ? d.topLabel : 'Volume';
    const switcher = d.kind === 'done' ? null : h('div', { class: 'seg', role: 'group', 'aria-label': 'Chart' },
      h('button', { type: 'button', 'aria-pressed': String(ui.metric === 'top'), onclick() { ui.metric = 'top'; render(); } }, 'Top set'),
      h('button', { type: 'button', 'aria-pressed': String(ui.metric === 'volume'), onclick() { ui.metric = 'volume'; render(); } }, 'Volume'));
    const first = d.points[0];
    const last = d.points[d.points.length - 1];
    const chart = d.kind === 'done' || d.points.length === 0 ? null : lineChart({
      points: d.points.map((p) => ({ value: ui.metric === 'top' ? p.top : p.volume, date: p.date, increase: ui.metric === 'top' && p.increase })),
      label: `${metricName} over ${d.points.length} ${d.points.length === 1 ? 'session' : 'sessions'}, from ${ui.metric === 'top' ? first.top : first.volume} to ${ui.metric === 'top' ? last.top : last.volume}`,
    });

    fill(container,
      h('a', { class: 'back', href: '#/history' }, '← History'),
      h('h2', { text: d.name }),
      h('div', { class: 'stats2' },
        h('div', {}, h('span', { class: 'k', text: 'Last increase' }), h('span', { class: 'v', text: d.stats.lastIncreaseText })),
        h('div', {}, h('span', { class: 'k', text: 'Next scheduled' }), h('span', { class: 'v' }, d.stats.scheduledText, d.stats.due ? [' ', h('span', { class: 'tag-due', text: '↑ due' })] : null))),
      d.points.length === 0
        ? h('p', { class: 'empty-note', text: 'Nothing logged for this exercise yet. Its sessions and chart show up after your first one.' })
        : [
          switcher,
          chart ? h('section', { class: 'card' }, chart, d.kind === 'weight' || d.kind === 'level' || d.kind === 'distance' || d.kind === 'reps' ? h('p', { class: 'small muted', text: ui.metric === 'top' ? 'Green lines mark an increase.' : 'Weight times reps, added up over the sets.' }) : null) : null,
          h('section', { class: 'card' },
            h('table', { class: 'htable' },
              h('thead', {}, h('tr', {}, h('th', { text: 'Date' }), h('th', { text: 'Sets' }), h('th', { class: 'r', text: d.kind === 'level' ? 'Level' : 'Top' }))),
              h('tbody', {}, d.rows.map((r) => h('tr', {},
                h('td', {}, h('a', { href: `#/workout/${r.sessionId}` }, `${r.date.slice(5).replace('-', '/')} · ${r.templateCode}`)),
                h('td', {}, h('a', { href: `#/workout/${r.sessionId}` }, r.text)),
                h('td', { class: 'r' }, h('a', { href: `#/workout/${r.sessionId}`, 'aria-label': 'Open this workout' }, `${r.top} ›`)))))),
            h('p', { class: 'small muted', text: 'Tap a row to open that workout and correct it.' })),
        ]);
  }
  render();
  return { update: render, destroy() {} };
}

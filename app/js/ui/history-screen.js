// History (spec 6.6): a switch between By exercise and By date. By exercise lists the workouts' exercises with their last session and
// opens the exercise screen; By date lists every finished workout with Edit (the edit view, spec 6.3). The logic is in
// logging/history-view.js; this file only draws.

import { historyByDate, historyByExercise } from '../logging/index.js';
import { pacificDate } from '../time.js';
import { fill, h } from './dom.js';

export function mountHistory(container, ctx, view) {
  function switcher() {
    const link = (name, hash, on) => h('a', { href: hash, 'aria-current': on ? 'true' : null }, name);
    return h('nav', { class: 'seg', 'aria-label': 'History view' }, link('By exercise', '#/history', view === 'exercise'), link('By date', '#/history/date', view === 'date'));
  }

  function byExercise(today) {
    return historyByExercise(ctx.events.state, today).map((g) => [
      h('h3', { class: 'group-label', text: g.label }),
      h('section', { class: 'card hlist', 'aria-label': g.label },
        g.rows.map((r) => h('a', { class: 'hrow', href: `#/history/exercise/${r.exerciseId}` },
          h('span', { class: 'main' },
            h('span', { text: r.name }),
            h('span', { class: 'sub', text: r.lastText })),
          r.due ? h('span', { class: 'tag-due', text: '↑ due' }) : h('span', { class: 'sub', 'aria-hidden': 'true', text: '›' })))),
    ]);
  }

  function byDate(today) {
    const groups = historyByDate(ctx.events.state, today);
    if (groups.length === 0) return h('p', { class: 'empty-note', text: 'No finished workouts yet. Finish one and it shows up here.' });
    return groups.map((g) => [
      h('h3', { class: 'group-label', text: g.label }),
      h('section', { class: 'card hlist', 'aria-label': g.label },
        g.rows.map((r) => h('div', { class: 'hrow' },
          h('span', { class: 'main' },
            h('span', {}, h('span', { class: 'wk', 'aria-hidden': 'true', text: r.templateCode }), `Workout ${r.templateCode} · ${r.dateText}`),
            h('span', { class: 'sub', text: [`${r.exercisesDone}/${r.exerciseCount} done`, `${r.sets} ${r.sets === 1 ? 'set' : 'sets'}`, r.durationText].filter(Boolean).join(' · ') })),
          r.missing > 0 ? h('span', { class: 'tag-miss', text: `${r.missing} missing` }) : null,
          h('a', { class: 'btn', href: `#/workout/${r.sessionId}`, 'aria-label': `Edit Workout ${r.templateCode}, ${r.dateText}` }, 'Edit')))),
    ]);
  }

  function render() {
    ctx.header.setStatus('History');
    ctx.header.setDays([], null);
    const today = pacificDate(ctx.now());
    fill(container, h('h2', { text: 'History' }), switcher(), view === 'date' ? byDate(today) : byExercise(today));
  }
  render();
  return { update: render, destroy() {} };
}

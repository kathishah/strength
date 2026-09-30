// The summary after Finish (spec 6.3): total working sets, duration, and the "weight increase next time" callouts.

import { summaryView } from '../logging/index.js';
import { fill, h } from './dom.js';

export function mountSummary(container, ctx, sessionId) {
  function render() {
    const s = summaryView(ctx.events.state, sessionId);
    if (!s) {
      fill(container,
        h('a', { class: 'back', href: '#/' }, '← Home'),
        h('p', { class: 'card', text: 'That workout is not finished or does not exist on this device.' }),
      );
      return;
    }
    fill(container,
      h('h2', { text: 'Workout done' }),
      h('p', { class: 'muted', text: `${s.label} · ${s.dateText}` }),
      h('dl', { class: 'stats summary-stats' },
        h('dt', { text: 'Working sets' }), h('dd', { text: String(s.totalSets) }),
        h('dt', { text: 'Duration' }), h('dd', { text: s.durationText ?? 'unknown' }),
        s.backPainBefore !== null ? [h('dt', { text: 'Back pain before' }), h('dd', { text: `${s.backPainBefore} / 10` })] : null,
        s.backPainAfter !== null ? [h('dt', { text: 'Back pain after' }), h('dd', { text: `${s.backPainAfter} / 10` })] : null),
      s.callouts.length
        ? h('section', { class: 'card callouts', 'aria-labelledby': 'callouts-title' },
          h('h3', { id: 'callouts-title', text: 'Weight increase next time' }),
          h('ul', { class: 'plain' }, s.callouts.map((c) => h('li', {}, h('span', { class: 'up-badge', text: '↑' }), ` ${c.text}`))))
        : null,
      h('section', { class: 'card' },
        h('h3', { text: 'What you did' }),
        h('ul', { class: 'plain' }, s.exercises.map((e) => h('li', {}, h('strong', { text: e.name }), h('div', { class: 'muted', text: e.text }))))),
      s.notes ? h('section', { class: 'card' }, h('h3', { text: 'Notes' }), h('p', { class: 'notes-text', text: s.notes })) : null,
      h('a', { class: 'btn primary block', href: '#/', text: 'Back to Home' }),
    );
  }
  render();
  return { update: render, destroy() {} };
}

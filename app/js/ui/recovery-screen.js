// The Tuesday/Thursday sitting recovery routine (spec 4.6): guidance only. One card per exercise with the prescription, the cue and
// a demo. Nothing is checked off, logged or synced.

import { EXERCISES, PLACEHOLDER_GIF, RECOVERY, RECOVERY_LABEL } from '../seed/index.js';
import { fill, h } from './dom.js';

function demo(exerciseId, name) {
  const c = EXERCISES[exerciseId];
  if (!c?.gifUrl) return null;
  const img = h('img', {
    class: 'demo', src: c.gifUrl, alt: `${name} demonstration`, loading: 'lazy', referrerpolicy: 'no-referrer', width: 640, height: 400,
  });
  img.addEventListener('error', () => { img.src = PLACEHOLDER_GIF; }, { once: true });
  return img;
}

export function mountRecovery(container) {
  fill(container,
    h('a', { class: 'back', href: '#/' }, '← Home'),
    h('h2', { text: 'Recovery routine' }),
    h('p', { class: 'muted', text: `${RECOVERY_LABEL}. Guidance only: nothing to check off or log.` }),
    ...RECOVERY.map((item, i) => {
      const c = EXERCISES[item.exercise];
      const name = c?.name ?? item.exercise;
      return h('section', { class: 'card recovery-card' },
        h('h3', {}, h('span', { class: 'step', text: `${i + 1}` }), name),
        h('p', { class: 'prescription', text: item.prescription }),
        c?.notes ? h('p', { class: 'cue', text: c.notes }) : null,
        demo(item.exercise, name),
        c?.attribution?.label ? h('p', { class: 'muted small' }, 'Demo: ',
          h('a', { href: c.attribution.url, target: '_blank', rel: 'noopener noreferrer', text: c.attribution.label })) : null);
    }),
  );
  return { update() {}, destroy() {} };
}

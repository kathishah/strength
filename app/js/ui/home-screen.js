// Home (spec 6.2): resume an open workout, or the next workout by rotation with the no-consecutive-days warning; on a recovery
// day (Tuesday and Thursday by default) the recovery routine leads. The logic is in logging/home.js.

import { homeView } from '../logging/index.js';
import { pacificDate } from '../time.js';
import { armedButton, fill, h, painChips } from './dom.js';

// ctx: { events, actions, now(), navigate(hash), notify(text, kind) }
export function mountHome(container, ctx) {
  let backPainBefore = null; // chosen on this screen, written with session.started
  let busy = false;
  let lastKey = null;

  const recoveryCard = (primary) => h('section', { class: primary ? 'card lead' : 'card', 'aria-labelledby': 'recovery-title' },
    h('h2', { id: 'recovery-title', text: primary ? 'Today is a recovery day' : 'Recovery routine' }),
    h('p', { class: 'muted', text: 'Sitting recovery, about 10 minutes at home, 2 rounds. Mobility only: no pushups or other resistance work.' }),
    h('a', { class: primary ? 'btn primary block' : 'btn block', href: '#/recovery', text: 'Open the routine' }));

  const resumeCard = (r) => {
    const discard = armedButton(h('button', { type: 'button', class: 'btn quiet', text: 'Discard' }), {
      armedText: 'Tap again to discard',
      async onConfirm() {
        try { await ctx.actions.discard(r.sessionId); } catch (err) { ctx.notify(err.message, 'error'); }
      },
    });
    return h('section', { class: 'card lead', 'aria-label': `${r.label} in progress` },
      h('h2', { text: 'Workout in progress' }),
      h('p', {}, h('strong', { text: r.label }), h('br'), h('span', { class: 'muted', text: `${r.dateText}, started ${r.startedText} · ${r.loggedSets} ${r.loggedSets === 1 ? 'set' : 'sets'} logged` })),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary grow', href: `#/session/${r.sessionId}`, text: 'Resume' }), discard));
  };

  const nextCard = (next, leadIn) => {
    const chips = painChips({ label: 'Back pain now', value: backPainBefore, onChange(v) { backPainBefore = v; } });
    const start = h('button', {
      type: 'button', class: 'btn primary block',
      async onclick() {
        if (busy) return;
        busy = true;
        start.disabled = true;
        try {
          const id = await ctx.actions.startSession({ backPainBefore });
          backPainBefore = null;
          ctx.navigate(`#/session/${id}`);
        } catch (err) {
          ctx.notify(err.message, 'error');
        } finally {
          busy = false;
          start.disabled = false;
        }
      },
    }, `Start Workout ${next.templateCode}`);
    return h('section', { class: leadIn ? 'card' : 'card lead', 'aria-labelledby': 'next-title' },
      h('h2', { id: 'next-title', text: leadIn ? 'Or start a workout' : 'Next workout' }),
      h('p', {}, h('strong', { text: next.label }), h('br'),
        h('span', { class: 'muted', text: `Week ${next.programWeek}${next.beforeStart ? ' (before the program start date)' : ''} · ${next.phaseText}` })),
      next.warningText ? h('p', { class: 'notice', role: 'note', text: next.warningText }) : null,
      h('ul', { class: 'preview plain' }, next.exercises.map((e) => h('li', { class: e.superset ? `ss${e.superset}` : '' },
        h('span', { class: 'preview-name', text: e.name }), ' ', h('span', { class: 'muted', text: e.prescription }),
        e.suggestionText ? h('div', { class: 'muted small', text: e.suggestionText }) : null,
        e.increaseText ? h('div', { class: 'up small', text: e.increaseText }) : null))),
      h('p', { class: 'field-label', id: 'pain-label', text: 'Back pain right now (optional)' }),
      chips.el,
      start);
  };

  function render() {
    const view = homeView(ctx.events.state, pacificDate(ctx.now()));
    const key = JSON.stringify(view);
    if (key === lastKey) return;
    lastKey = key;
    fill(container,
      h('h2', { class: 'screen-title', text: view.dayText }),
      view.inProgress.map(resumeCard),
      view.recoveryFirst ? recoveryCard(true) : null,
      view.next ? nextCard(view.next, view.recoveryFirst) : null,
      view.recoveryFirst ? null : recoveryCard(false),
      view.last ? h('p', { class: 'muted', text: `Last workout: ${view.last.templateCode} on ${view.last.dateText}.` }) : null,
    );
  }
  render();
  return { update: render, destroy() {} };
}

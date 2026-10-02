// Home (spec 6.2, 6.3), laid out as the v0.2 viewer: one horizontal swipe carousel of cards, each superset with its own colour on the
// card's left edge. On a recovery day the cards are the recovery routine; otherwise they are the next workout's exercises, and the
// workout starts by itself when the first exercise is marked done.
//
// Each exercise card reads top to bottom: name and superset, the form GIF as the hero, the cue, muscles, the Options and TRX lists, and
// at the bottom where the viewer had "mark this exercise as done": one barrel dial per set for the weight (2.5 lb notches, each already
// at the suggested weight), one shared dial for the reps (already at the recommended number), and one tick for the whole exercise. The logic is in
// logging/day-view.js and logging/actions.js; this file only draws.
//
// Rendering. A change in structure (an exercise done, a swap, a list opening) rebuilds the carousel and puts it back where it was.
// Anything else only moves the dials. Typed values live in the draft, so a refresh loses nothing.

import { REST_STEP_SEC, dayView, dialNotches, editView, formatClock, formatNumber, restStatus } from '../logging/index.js';
import { EXERCISES, PLACEHOLDER_GIF } from '../seed/index.js';
import { pacificDate } from '../time.js';
import { createDial } from './dial.js';
import { armedButton, fill, h } from './dom.js';

const FIELD = {
  weightLbs: { caption: 'lbs', label: 'weight in pounds', format: (v) => formatNumber(v) },
  levelNumber: { caption: 'level', label: 'level', format: (v) => String(v) },
  reps: { caption: 'reps', label: 'reps', format: (v) => String(v) },
  distanceM: { caption: 'metres', label: 'distance in metres', format: (v) => String(v) },
};

const cardKey = (c) => [
  c.exerciseId, c.mode, c.swapped, c.canSwap, c.chipText, c.partnerName, c.increaseText, c.suggestionText, c.lastText, c.hints,
  c.swapBlockedReason, c.summaryText, c.rows.map((r) => [r.id, r.status, r.reps === null]),
];

// ctx: { events, actions, now(), navigate(hash), notify(text, kind), header, day: { picked, forceWorkout } }
// editId: the id of a finished workout reopened to correct it (#/workout/<id>); null for Home.
export function mountDay(container, ctx, editId = null) {
  const ui = { alt: new Map(), slide: 0 }; // alt: exercise id -> which list is open ('alternatives' | 'trx')
  let current = null; // the latest view
  let structure = null;
  let dials = []; // { dial, read() } for every dial on screen, so they follow the values
  let ticker = null;
  let wasOver = false;

  const body = h('div', { class: 'day-body' });
  const restEl = h('div', { class: 'rest-bar', role: 'timer', 'aria-label': 'Rest timer', hidden: true });
  const restText = h('span', { class: 'rest-time' });
  const restLive = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  restEl.append(
    restText, restLive,
    h('button', { type: 'button', class: 'btn', 'aria-label': 'Shorter rest by 15 seconds', onclick: () => adjustRest(-REST_STEP_SEC) }, '−15'),
    h('button', { type: 'button', class: 'btn', 'aria-label': 'Longer rest by 15 seconds', onclick: () => adjustRest(REST_STEP_SEC) }, '+15'),
    h('button', { type: 'button', class: 'btn', onclick() { ctx.actions.skipRest(current.sessionId); updateRest(); } }, 'Skip'),
  );
  container.replaceChildren(body, restEl);

  const guard = async (fn) => {
    try { return await fn(); } catch (err) { ctx.notify(err.message ?? 'Something went wrong.', 'error'); return undefined; } finally { render(); }
  };
  const findCard = (exerciseId) => current.cards.find((c) => c.exerciseId === exerciseId);

  // ---- the rest timer: recomputed from timestamps on every tick and when the page becomes visible ----
  function adjustRest(delta) {
    ctx.actions.adjustRest(current.sessionId, delta);
    updateRest();
  }
  function updateRest() {
    const status = current?.started && current.mode !== 'edit' ? restStatus(ctx.actions.draft(current.sessionId), ctx.now(), ctx.events.state.settings) : null;
    restEl.hidden = status === null;
    if (status === null) { wasOver = false; return; }
    restText.textContent = status.over ? 'Rest over. Ready for the next exercise.' : `Rest ${formatClock(status.remainingSec)}`;
    restEl.dataset.over = String(status.over);
    if (status.over && !wasOver) {
      restLive.textContent = 'Rest over';
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
    }
    if (!status.over) restLive.textContent = '';
    wasOver = status.over;
  }
  ticker = setInterval(() => { if (!document.hidden) updateRest(); }, 250);

  // ---- pieces of a card ----
  const thumb = (id, name) => {
    const img = h('img', { src: EXERCISES[id]?.gifUrl || PLACEHOLDER_GIF, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', width: 56, height: 42 });
    img.addEventListener('error', () => { img.src = PLACEHOLDER_GIF; }, { once: true });
    return h('div', { class: 'alt-thumb', 'aria-label': name }, img);
  };

  function altPanel(card, group) {
    return h('div', { class: 'alt-panel', 'data-group': group === 'trx' ? 'trxAlternatives' : 'alternatives', role: 'group', 'aria-label': `${group === 'trx' ? 'TRX' : 'Options'} for ${card.name}` },
      card.optionGroups[group].map((o) => h('div', { class: 'alt-item' },
        thumb(o.exerciseId, o.name),
        h('div', { class: 'alt-name', text: o.name }),
        h('button', {
          type: 'button', class: 'alt-use', disabled: o.current,
          onclick: () => guard(async () => {
            await ctx.actions.swap(current.sessionId, { slotNumber: card.slot, exerciseId: o.exerciseId, templateCode: current.templateCode });
            ui.alt.delete(card.exerciseId);
          }),
        }, o.current ? 'In use' : 'Use this'))));
  }

  // The hero: the form GIF, then the cue, the partner line, hints, levels and the muscles (spec 0.B.2).
  function hero(name, gifUrl, attribution) {
    const img = h('img', { src: gifUrl || PLACEHOLDER_GIF, alt: `${name} demonstration`, loading: 'lazy', referrerpolicy: 'no-referrer', width: 640, height: 400 });
    img.addEventListener('error', () => { img.src = PLACEHOLDER_GIF; }, { once: true });
    return [
      h('div', { class: 'gif-wrapper' }, img, h('div', { class: 'gif-label' }, h('span'), 'Live form reference')),
      attribution ? h('div', { class: 'gif-attribution' }, 'Art credit: ', h('a', { href: attribution.url, target: '_blank', rel: 'noopener noreferrer', text: attribution.label })) : null,
    ];
  }

  function description(card) {
    const c = card.cues;
    return [
      h('div', { class: 'exercise-body' },
        c.notes,
        card.partnerName ? ` Alternate with ${card.partnerName}; rest 60–90 s between rounds.` : '',
        card.hints.map((t) => h('div', { class: 'pairing-tip', text: t })),
        c.levelText ? h('div', { class: 'start-line', text: `Level: start at 2 of 5. ${c.levelText}` }) : null,
        c.rationale ? h('div', { class: 'start-line', text: c.rationale }) : null,
        c.ladder ? h('details', { class: 'ladder' }, h('summary', { text: 'Pushup ladder' }),
          h('ul', {}, c.ladder.map((l) => h('li', {}, h('strong', { text: `L${l.level}` }), ` ${l.variation} — ${l.reps}${l.cue ? ` · ${l.cue}` : ''}`)))) : null),
      c.tags.length ? h('div', { class: 'tags' }, c.tags.map((t) => h('span', { class: 'tag', text: t }))) : null,
    ];
  }

  // ---- the input line: a barrel dial per set, one shared dial for reps (or metres), and one tick ----
  // Skipping a set (tap its caption): its reps are cleared, so the tick leaves it out. Tapping again brings the reps back.
  function toggleSkip(card, setNumber) {
    const rows = findCard(card.exerciseId).rows;
    const row = rows.find((r) => r.setNumber === setNumber);
    const back = rows.find((r) => r.reps !== null)?.reps ?? row.placeholderReps;
    ctx.actions.setValue(current.sessionId, card.exerciseId, setNumber, 'reps', row.reps === null ? back : null);
    render();
  }

  function dialColumn(card, field, rowNumbers, caption, { skippable = false } = {}) {
    const { format, label } = FIELD[field];
    const first = card.rows.find((r) => r.setNumber === rowNumbers[0]);
    const used = [...card.rows.map((r) => r[field]), field === 'weightLbs' ? card.suggestion.weightLbs : null];
    const dial = createDial({
      values: dialNotches(field, used), format, label: `${card.name} ${rowNumbers.length > 1 ? 'all sets' : `set ${rowNumbers[0]}`} ${label}`,
      className: field === 'weightLbs' && card.increased ? 'increase' : '',
      onChange(value) {
        if (rowNumbers.length > 1) ctx.actions.setAll(current.sessionId, card.exerciseId, rowNumbers, field, value);
        else ctx.actions.setValue(current.sessionId, card.exerciseId, rowNumbers[0], field, value);
        render();
      },
    });
    const read = () => findCard(card.exerciseId)?.rows.find((r) => r.setNumber === rowNumbers[0])?.[field] ?? first[field];
    dials.push({ dial, read });
    const skipped = skippable && first.reps === null;
    const cap = skippable
      ? h('button', { type: 'button', class: 'dcap skip', 'aria-pressed': String(skipped), 'aria-label': `${skipped ? 'Include' : 'Skip'} ${caption}`, onclick: () => toggleSkip(card, rowNumbers[0]) }, caption)
      : h('span', { class: 'dcap', text: caption });
    return h('div', { class: `dcol${rowNumbers.length > 1 ? ' shared' : ''}${skipped ? ' skipped' : ''}` }, cap, dial.el);
  }

  function logLine(card) {
    const editing = card.mode === 'editing';
    const numbers = card.rows.map((r) => r.setNumber);
    const primary = card.inputs.weight ? 'weightLbs' : card.inputs.level ? 'levelNumber' : card.inputs.reps ? 'reps' : null;
    const secondary = primary === 'weightLbs' || primary === 'levelNumber' ? (card.inputs.distance ? 'distanceM' : card.inputs.reps ? 'reps' : null) : null;
    const cols = [];
    if (primary === null) cols.push(h('p', { class: 'hold-text', text: `${card.prescription}. Do your sets, then tap the tick.` }));
    else {
      // Not offered when reopening a logged exercise (that would be deleting a set: Undo does that) or with a single set.
      const skippable = card.mode === 'input' && card.inputs.reps && numbers.length > 1;
      for (const n of numbers) cols.push(dialColumn(card, primary, [n], `set ${n}`, { skippable }));
      if (secondary) cols.push(h('span', { class: 'times', 'aria-hidden': 'true' }, '×'), dialColumn(card, secondary, numbers, FIELD[secondary].caption));
    }
    const ok = h('button', {
      type: 'button', class: 'okbtn', 'aria-label': `${editing ? 'Save changes to' : 'Done with'} ${card.name}`,
      onclick: () => guard(() => ctx.actions.saveExercise(current.sessionId, {
        exerciseId: card.exerciseId, rows: findCard(card.exerciseId).rows, suggestion: card.suggestion,
      })),
    }, '✓');
    return [
      h('div', { class: 'logline' }, cols, ok),
      editing ? h('button', { type: 'button', class: 'linklike', onclick() { ctx.actions.cancelEdit(current.sessionId, card.exerciseId); render(); } }, 'Cancel changes') : null,
    ];
  }

  function doneLine(card) {
    const undo = armedButton(h('button', { type: 'button', class: 'btn quiet', text: 'Undo' }), {
      armedText: 'Tap again to undo',
      onConfirm: () => guard(() => ctx.actions.undoExercise(current.sessionId, card.exerciseId)),
    });
    return h('div', { class: 'doneline' },
      h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓'),
      h('span', { class: 'done-summary', text: card.summaryText || 'Done' }),
      h('button', { type: 'button', class: 'btn', 'aria-label': `Edit ${card.name}`, onclick() { ctx.actions.beginEdit(current.sessionId, card.exerciseId); render(); } }, 'Edit'),
      undo);
  }

  // ---- the cards ----
  function buildCard(card) {
    const open = ui.alt.get(card.exerciseId) ?? null;
    const toggle = (group) => () => { open === group ? ui.alt.delete(card.exerciseId) : ui.alt.set(card.exerciseId, group); render(); };
    const groups = card.optionGroups;
    const altButtons = [];
    if (groups.alternatives.length) altButtons.push(h('button', { type: 'button', class: 'alt-toggle opt', 'aria-expanded': String(open === 'alternatives'), disabled: !card.canSwap, onclick: toggle('alternatives') }, 'Options ', h('span', { class: 'alt-badge', text: String(groups.alternatives.length) })));
    if (groups.trx.length) altButtons.push(h('button', { type: 'button', class: 'alt-toggle trx', 'aria-expanded': String(open === 'trx'), disabled: !card.canSwap, onclick: toggle('trx') }, 'TRX ', h('span', { class: 'alt-badge', text: String(groups.trx.length) })));
    // head / media / rest: plain stacked in portrait (display: contents), two columns in phone landscape (app.css).
    return h('article', { class: `ex slide split ${card.ssClass}${card.increased ? ' increased' : ''}${card.done ? ' done' : ''}`, 'aria-label': card.name },
      h('div', { class: 'ex-head' },
        card.done ? h('div', { class: 'done-flag' }, h('span'), 'Done') : null,
        h('div', { class: 'ex-header' },
          h('div', {}, h('h3', { class: 'ex-title', text: card.name }), h('div', { class: 'phase-chip', text: card.chipText })),
          h('div', { class: 'ex-meta' }, h('strong', { text: card.prescription }), h('span', { text: 'Sets × Reps' }))),
        card.increaseText ? h('p', { class: 'up', text: card.increaseText }) : null),
      h('div', { class: 'ex-media' }, hero(card.name, card.cues.gifUrl, card.cues.attribution)),
      h('div', { class: 'ex-rest' },
        description(card),
        card.swappedFromName ? h('div', { class: 'swap-note' }, `Swapped from ${card.swappedFromName} · `, h('button', { type: 'button', class: 'revert-btn', onclick: () => guard(async () => { ui.alt.delete(card.exerciseId); await ctx.actions.swap(current.sessionId, { slotNumber: card.slot, exerciseId: card.defaultExerciseId, templateCode: current.templateCode }); }) }, 'Revert')) : null,
        altButtons.length ? h('div', { class: 'alt-row' }, altButtons) : null,
        card.swapBlockedReason && altButtons.length ? h('p', { class: 'small muted', text: card.swapBlockedReason }) : null,
        open && card.canSwap ? altPanel(card, open) : null,
        h('div', { class: 'log-area' },
          card.lastText ? h('p', { class: 'last muted small', text: card.lastText }) : null,
          card.mode === 'done' ? doneLine(card) : logLine(card))));
  }

  function buildRecoveryCard(card) {
    return h('article', { class: 'ex slide split rec', 'aria-label': card.name },
      h('div', { class: 'ex-head' },
        h('div', { class: 'ex-header' },
          h('div', {}, h('h3', { class: 'ex-title', text: card.name }), h('div', { class: 'phase-chip', text: card.chipText })),
          h('div', { class: 'ex-meta' }, h('strong', { text: card.prescription }), h('span', { text: 'Per round · 2 rounds' })))),
      h('div', { class: 'ex-media' }, hero(card.name, card.gifUrl, card.attribution)),
      h('div', { class: 'ex-rest' },
        h('div', { class: 'exercise-body', text: card.notes }),
        card.tags.length ? h('div', { class: 'tags' }, card.tags.map((t) => h('span', { class: 'tag', text: t }))) : null));
  }

  // The last card of a workout: notes and Finish (there is no separate Finish screen).
  function buildFinishCard(view) {
    const sid = view.sessionId;
    const notes = h('textarea', {
      id: 'session-notes', rows: 3, maxlength: 4000, placeholder: 'How did it go? (optional)',
      oninput() { ctx.actions.typeNotes(sid, notes.value); },
      onchange() { guard(() => ctx.actions.saveNotes(sid, notes.value)); },
    });
    notes.value = view.notes;
    const discard = armedButton(h('button', { type: 'button', class: 'btn quiet', text: 'Discard workout' }), {
      armedText: 'Tap again to discard',
      onConfirm: () => guard(() => ctx.actions.discard(sid)),
    });
    const left = Math.max(0, view.exerciseCount - view.exercisesDone);
    return h('article', { class: 'ex slide finish-card', 'aria-label': 'Finish workout' },
      h('div', { class: 'ex-header' }, h('div', {}, h('h3', { class: 'ex-title', text: 'Finish workout' }), h('div', { class: 'phase-chip', text: 'Last card' }))),
      h('p', { class: 'muted', text: `${view.exercisesDone} of ${view.exerciseCount} exercises done${left > 0 ? `. ${left} left; you can still finish.` : '.'}` }),
      h('label', { for: 'session-notes', text: 'Notes (optional)' }), notes,
      h('button', {
        type: 'button', class: 'btn primary block', disabled: !view.canFinish,
        onclick: () => guard(async () => {
          await ctx.actions.finish(sid, { notes: notes.value });
          ctx.navigate(`#/summary/${sid}`);
        }),
      }, 'Save and finish'),
      h('div', { class: 'actions finish-actions' }, discard));
  }

  function trainInsteadCard() {
    return h('article', { class: 'ex slide rec', 'aria-label': 'Train instead' },
      h('div', { class: 'ex-header' }, h('div', {}, h('h3', { class: 'ex-title', text: 'Prefer to lift today?' }))),
      h('p', { class: 'muted', text: 'Recovery days are for the upper body to rest, but a workout is never blocked.' }),
      h('button', { type: 'button', class: 'btn primary block', onclick() { ctx.day.forceWorkout = true; render(); } }, 'Show the workout'));
  }

  function olderCard(view) {
    return h('section', { class: 'card older', 'aria-label': 'Older unfinished workouts' },
      h('h3', { text: 'Older unfinished workouts' }),
      view.older.map((o) => h('div', { class: 'older-row' },
        h('span', { text: `${o.label}, ${o.dateText} ${o.startedText} · ${o.loggedSets} ${o.loggedSets === 1 ? 'set' : 'sets'}` }),
        armedButton(h('button', { type: 'button', class: 'btn quiet', text: 'Discard' }), { armedText: 'Tap again', onConfirm: () => guard(() => ctx.actions.discard(o.sessionId)) }))));
  }

  // ---- the whole page ----
  function build(view) {
    for (const { dial } of dials) dial.dispose(); // the old dials are leaving the page: none of them may report a value again
    dials = [];
    const slides = view.mode === 'recovery'
      ? [...view.cards.map(buildRecoveryCard), trainInsteadCard()]
      : [...view.cards.map(buildCard), view.started && view.mode !== 'edit' ? buildFinishCard(view) : null];
    const track = h('div', { class: 'track', role: 'region', tabindex: '0', 'aria-label': 'Exercises. Swipe sideways for the next one.' }, slides);
    // A swipe to another card returns the page to the top, so the new card starts at its title.
    let settle = null;
    track.addEventListener('scroll', () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const first = track.firstElementChild;
        if (!first) return;
        const index = Math.round(track.scrollLeft / (first.offsetWidth + 10));
        if (index === ui.slide) return;
        ui.slide = index;
        const top = track.getBoundingClientRect().top;
        if (top < 0) window.scrollBy({ top: top - 8 });
      }, 120);
    }, { passive: true });
    fill(body,
      view.warningText ? h('p', { class: 'notice day-notice', role: 'note', text: view.warningText }) : null,
      view.older.length ? olderCard(view) : null,
      view.mode === 'edit' ? h('div', { class: 'edit-bar' },
        h('a', { class: 'back', href: '#/history/date' }, '← History'),
        h('p', { class: 'muted small', text: `Finished workout. What you tick or change is added to it. Week ${view.programWeek} · ${view.phaseText}` })) : null,
      view.mode === 'workout' ? h('p', { class: 'phase-line muted small', text: `Week ${view.programWeek} · ${view.phaseText}` }) : null,
      view.mode === 'recovery' ? h('p', { class: 'phase-line muted small', text: `${view.label}. Guidance only: nothing to check off.` }) : null,
      track);
    return track;
  }

  function render() {
    const view = editId !== null
      ? editView(ctx.events.state, { sessionId: editId, nowMs: ctx.now(), draftFor: (id) => ctx.actions.draft(id) })
      : dayView(ctx.events.state, {
        today: pacificDate(ctx.now()), nowMs: ctx.now(), draftFor: (id) => ctx.actions.draft(id), pickedWeekday: ctx.day.picked, forceWorkout: ctx.day.forceWorkout,
      });
    if (view === null) { ctx.navigate('#/'); return; } // the workout is gone, or not finished: Home shows what there is
    current = view;
    ctx.header.setStatus(view.statusText);
    ctx.header.setDays(view.pills, view.selectedWeekday);

    const key = JSON.stringify([
      view.mode, view.started, view.canFinish, view.exercisesDone, view.warningText, view.older.map((o) => [o.sessionId, o.loggedSets]),
      view.mode === 'recovery' ? view.cards.length : view.cards.map(cardKey), [...ui.alt],
    ]);
    if (key !== structure) {
      const y = window.scrollY;
      const x = body.querySelector('.track')?.scrollLeft ?? 0;
      const active = document.activeElement;
      const restoreId = active && body.contains(active) && active.id ? active.id : null;
      structure = key;
      const track = build(view);
      track.scrollLeft = x;
      for (const { dial, read } of dials) dial.init(read());
      const target = restoreId ? document.getElementById(restoreId) : null;
      target?.focus({ preventScroll: true });
      window.scrollTo(0, y);
    }
    for (const { dial, read } of dials) dial.set(read());
    updateRest();
  }

  render();
  return {
    update: render,
    destroy() {
      clearInterval(ticker);
      for (const { dial } of dials) dial.dispose();
    },
  };
}

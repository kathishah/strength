// The session screen (spec 6.3): the most important screen, phone first. It draws the view model from logging/session-view.js and
// forwards taps to logging/actions.js; every rule (pre-fill, carry-over, what can be logged, what a tap writes) lives there.
//
// Rendering. A change in structure (a row becoming done, a swap, a panel opening) rebuilds the body. Anything else, such as typing
// or a +/- press, only patches values into the existing rows, so the box being typed in is never replaced. Typed values go to the
// draft on every keystroke, so a refresh loses nothing.

import {
  REST_STEP_SEC, formatClock, formatNumber, parseDistance, parseReps, parseWeight, restStatus, sessionView, stepValue,
} from '../logging/index.js';
import { PLACEHOLDER_GIF } from '../seed/index.js';
import { armedButton, fill, h, painChips } from './dom.js';

const FIELD = {
  weightLbs: { label: 'Weight (lbs)', short: 'weight in pounds', parse: parseWeight, mode: 'decimal', min: 0, max: 1000 },
  reps: { label: 'Reps', short: 'reps', parse: parseReps, mode: 'numeric', min: 0, max: 500 },
  distanceM: { label: 'Distance (m)', short: 'distance in metres', parse: parseDistance, mode: 'decimal', min: 0, max: 10000 },
};

const cardKey = (c) => [c.exerciseId, c.swapped, c.canSwap, c.increaseText, c.suggestionText, c.lastText, c.hints, c.swapBlockedReason, c.rows.map((r) => [r.id, r.status])];

// ctx: { events, actions, now(), navigate(hash), notify(text, kind) }
export function mountSession(container, ctx, sessionId) {
  const ui = { info: new Set(), swap: new Set(), finishOpen: false };
  const rowComps = new Map();
  let structure = null;
  let ticker = null;
  let wasOver = false;

  const body = h('div', { class: 'session-body' });
  const restEl = h('div', { class: 'rest-bar', role: 'timer', 'aria-label': 'Rest timer', hidden: true });
  const restText = h('span', { class: 'rest-time' });
  const restLive = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  restEl.append(
    restText, restLive,
    h('button', { type: 'button', class: 'btn', 'aria-label': 'Shorter rest by 15 seconds', onclick: () => adjustRest(-REST_STEP_SEC) }, '−15'),
    h('button', { type: 'button', class: 'btn', 'aria-label': 'Longer rest by 15 seconds', onclick: () => adjustRest(REST_STEP_SEC) }, '+15'),
    h('button', { type: 'button', class: 'btn', onclick() { ctx.actions.skipRest(sessionId); updateRest(); } }, 'Skip'),
  );
  container.replaceChildren(body, restEl);

  const currentView = () => sessionView(ctx.events.state, sessionId, ctx.actions.draft(sessionId), ctx.now());
  const changed = () => render();
  const guard = async (fn) => {
    try { return await fn(); } catch (err) { ctx.notify(err.message ?? 'Something went wrong.', 'error'); return undefined; } finally { changed(); }
  };

  function adjustRest(delta) {
    ctx.actions.adjustRest(sessionId, delta);
    updateRest();
  }

  // ---- the rest timer: recomputed from timestamps on every tick and when the page becomes visible ----
  function updateRest() {
    const status = restStatus(ctx.actions.draft(sessionId), ctx.now(), ctx.events.state.settings);
    restEl.hidden = status === null;
    if (status === null) { wasOver = false; return; }
    restText.textContent = status.over ? 'Rest over. Ready for the next set.' : `Rest ${formatClock(status.remainingSec)}`;
    restEl.dataset.over = String(status.over);
    if (status.over && !wasOver) {
      restLive.textContent = 'Rest over';
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
    }
    if (!status.over) restLive.textContent = '';
    wasOver = status.over;
  }
  ticker = setInterval(() => { if (!document.hidden) updateRest(); }, 250);
  const onVisible = () => { if (!document.hidden) { updateRest(); render(); } };
  document.addEventListener('visibilitychange', onVisible);

  // ---- one number box with - and + ----
  function numberBox(comp, field) {
    const def = FIELD[field];
    const id = `${comp.row.id}-${field}`;
    const input = h('input', {
      id, type: 'text', inputmode: def.mode, enterkeyhint: 'done', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      'aria-label': `${comp.card.name} set ${comp.row.setNumber} ${def.short}`,
      oninput() { setValue(comp, field, def.parse(input.value)); },
      onblur() { input.value = formatNumber(comp.row[field]); },
    });
    const step = (dir) => {
      const size = field === 'weightLbs' ? comp.card.weightStep : field === 'distanceM' ? 5 : 1;
      const start = field === 'reps' ? comp.row.placeholderReps : field === 'distanceM' ? comp.row.placeholderDistance : undefined;
      setValue(comp, field, stepValue(comp.row[field], dir * size, { min: def.min, max: def.max, emptyStartsAt: start }));
    };
    const box = h('div', { class: 'field' },
      h('label', { for: id, text: def.label }),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', class: 'btn step', 'aria-label': `Decrease ${def.short} for ${comp.card.name} set ${comp.row.setNumber}`, onclick: () => step(-1) }, '−'),
        input,
        h('button', { type: 'button', class: 'btn step', 'aria-label': `Increase ${def.short} for ${comp.card.name} set ${comp.row.setNumber}`, onclick: () => step(1) }, '+')));
    return {
      el: box,
      sync() {
        if (document.activeElement !== input) input.value = formatNumber(comp.row[field]);
        input.placeholder = field === 'reps' ? formatNumber(comp.row.placeholderReps) : field === 'distanceM' ? formatNumber(comp.row.placeholderDistance) : '';
        const accent = field === 'weightLbs' && comp.card.increased;
        box.classList.toggle('increase', Boolean(accent));
        box.classList.toggle('changed', field === 'weightLbs' && comp.row.weightChanged);
      },
    };
  }

  // The level (1-5) stepper for TRX and the pushup ladder; tapping the number shows what the level means.
  function levelBox(comp) {
    const info = h('p', { class: 'level-info small', hidden: true });
    const setLevel = (n) => setValue(comp, 'levelNumber', Math.min(5, Math.max(1, n)));
    const value = h('button', {
      type: 'button', class: 'btn level-value', 'aria-expanded': 'false',
      onclick() {
        info.hidden = !info.hidden;
        value.setAttribute('aria-expanded', String(!info.hidden));
      },
    });
    const box = h('div', { class: 'field' },
      h('span', { class: 'label', text: 'Level (1–5)' }),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', class: 'btn step', 'aria-label': `Lower level for ${comp.card.name} set ${comp.row.setNumber}`, onclick: () => setLevel((comp.row.levelNumber ?? 2) - 1) }, '−'),
        value,
        h('button', { type: 'button', class: 'btn step', 'aria-label': `Higher level for ${comp.card.name} set ${comp.row.setNumber}`, onclick: () => setLevel((comp.row.levelNumber ?? 1) + 1) }, '+')),
      info);
    return {
      el: box,
      sync() {
        value.textContent = comp.row.levelNumber === null ? '–' : String(comp.row.levelNumber);
        value.setAttribute('aria-label', `Set ${comp.row.setNumber} level ${comp.row.levelNumber ?? 'not set'}. Tap for what the levels mean.`);
        info.textContent = comp.row.levelInfo ?? '';
        box.classList.toggle('changed', comp.row.levelChanged);
      },
    };
  }

  function setValue(comp, field, value) {
    ctx.actions.setValue(sessionId, comp.card.exerciseId, comp.row.setNumber, field, value);
    render();
  }

  // ---- a set row ----
  function buildRow(card, row) {
    const comp = { card, row, el: null, sync: null };
    rowComps.set(row.id, comp);
    const head = h('div', { class: 'set-head' },
      h('span', { class: 'set-num', text: `Set ${row.setNumber}` }),
      h('span', { class: 'set-target muted', text: row.targetText ? `target ${row.targetText}` : '' }));
    const changedNote = h('p', { class: 'changed-note small', hidden: true });

    if (row.status === 'done') {
      const summary = h('span', { class: 'set-summary' });
      const edit = h('button', { type: 'button', class: 'btn', 'aria-label': `Edit ${card.name} set ${row.setNumber}`, onclick() { ctx.actions.beginEdit(sessionId, card.exerciseId, row.setNumber); render(); } }, 'Edit');
      const undo = h('button', { type: 'button', class: 'btn quiet', 'aria-label': `Undo ${card.name} set ${row.setNumber}`, onclick: () => guard(() => ctx.actions.undoSet(sessionId, comp.row.setId)) }, 'Undo');
      comp.el = h('li', { class: 'set done', 'data-status': 'done' }, head, h('div', { class: 'set-line' }, h('span', { class: 'tick', 'aria-hidden': 'true', text: '✓' }), summary), changedNote, h('div', { class: 'actions' }, edit, undo));
      comp.sync = () => {
        const r = comp.row;
        const parts = [];
        if (card.inputs.weight && r.weightLbs !== null) parts.push(r.weightLbs === 0 ? 'no added weight' : `${r.weightLbs} lbs`);
        if (card.inputs.level && r.levelNumber !== null) parts.push(`level ${r.levelNumber}`);
        if (card.inputs.reps && r.reps !== null) parts.push(`${r.reps} reps`);
        if (card.inputs.distance && r.distanceM !== null) parts.push(`${r.distanceM} m`);
        if (r.rir !== null) parts.push(`RIR ${r.rir}`);
        summary.textContent = parts.length ? parts.join(' × ').replace(' × RIR', ' · RIR') : 'done';
        setChangedNote(changedNote, r);
      };
      return comp;
    }

    const fields = [];
    if (card.inputs.weight) fields.push(numberBox(comp, 'weightLbs'));
    if (card.inputs.level) fields.push(levelBox(comp));
    if (card.inputs.reps) fields.push(numberBox(comp, 'reps'));
    if (card.inputs.distance) fields.push(numberBox(comp, 'distanceM'));
    const rir = h('select', {
      id: `${row.id}-rir`, 'aria-label': `${card.name} set ${row.setNumber} reps in reserve (optional)`,
      onchange() { setValue(comp, 'rir', rir.value === '' ? null : Number(rir.value)); },
    }, h('option', { value: '', text: 'RIR –' }), [0, 1, 2, 3, 4, 5].map((n) => h('option', { value: String(n), text: `RIR ${n}` })));
    const editing = row.status === 'editing';
    const main = h('button', {
      type: 'button', class: 'btn primary done-btn',
      onclick: () => guard(() => (editing
        ? ctx.actions.saveSet(sessionId, { setId: comp.row.setId, values: comp.row, suggestion: card.suggestion })
        : ctx.actions.logSet(sessionId, { exerciseId: card.exerciseId, setNumber: comp.row.setNumber, values: comp.row, suggestion: card.suggestion }))),
    }, editing ? 'Save' : 'Done');
    const cancel = editing
      ? h('button', { type: 'button', class: 'btn', onclick() { ctx.actions.cancelEdit(sessionId, card.exerciseId, row.setNumber); render(); } }, 'Cancel')
      : null;
    comp.el = h('li', { class: `set ${editing ? 'editing' : 'todo'}`, 'data-status': row.status },
      head, h('div', { class: 'set-fields' }, fields.map((f) => f.el)), changedNote,
      h('div', { class: 'set-actions' }, rir, cancel, main));
    comp.sync = () => {
      fields.forEach((f) => f.sync());
      if (document.activeElement !== rir) rir.value = comp.row.rir === null ? '' : String(comp.row.rir);
      main.disabled = !comp.row.canLog || (editing && !comp.row.dirty);
      setChangedNote(changedNote, comp.row);
    };
    return comp;
  }

  function setChangedNote(el, r) {
    const bits = [];
    if (r.weightChanged) bits.push(`weight changed from ${r.suggestedWeightLbs}`);
    if (r.levelChanged) bits.push(`level changed from ${r.suggestedLevel}`);
    el.textContent = bits.join(' · ');
    el.hidden = bits.length === 0;
  }

  // ---- an exercise card ----
  function infoPanel(card) {
    const c = card.cues;
    const img = c.gifUrl ? h('img', { class: 'demo', src: c.gifUrl, alt: `${card.name} demonstration`, loading: 'lazy', referrerpolicy: 'no-referrer', width: 640, height: 400 }) : null;
    img?.addEventListener('error', () => { img.src = PLACEHOLDER_GIF; }, { once: true });
    return h('div', { class: 'info' },
      c.tags.length ? h('p', { class: 'muted small', text: c.tags.join(' · ') }) : null,
      c.notes ? h('p', { class: 'cue', text: c.notes }) : null,
      c.startNote ? h('p', { class: 'small', text: `Start: ${c.startNote}` }) : null,
      c.rationale ? h('p', { class: 'small muted', text: c.rationale }) : null,
      c.levelText ? h('p', { class: 'small', text: c.levelText }) : null,
      c.ladder ? h('ul', { class: 'plain small' }, c.ladder.map((l) => h('li', { text: `Level ${l.level}: ${l.variation}, ${l.reps} reps${l.cue ? `. ${l.cue}` : ''}` }))) : null,
      img,
      c.attribution ? h('p', { class: 'muted small' }, 'Demo: ', h('a', { href: c.attribution.url, target: '_blank', rel: 'noopener noreferrer', text: c.attribution.label })) : null);
  }

  function swapPanel(card) {
    return h('div', { class: 'swap-panel', role: 'group', 'aria-label': `Swap ${card.name}` },
      h('p', { class: 'small muted', text: 'The swap stays for this workout until you change it back.' }),
      card.swapOptions.map((o) => h('button', {
        type: 'button', class: 'btn option', 'aria-pressed': String(o.current),
        onclick: () => guard(async () => { await ctx.actions.swap(sessionId, { slotNumber: card.slot, exerciseId: o.exerciseId }); ui.swap.delete(card.exerciseId); }),
      }, o.name, o.kind === 'trx' ? h('span', { class: 'muted small', text: ' (TRX)' }) : null, o.kind === 'default' ? h('span', { class: 'muted small', text: ' (default)' }) : null)));
  }

  function buildCard(card) {
    const toggle = (set) => () => { set.has(card.exerciseId) ? set.delete(card.exerciseId) : set.add(card.exerciseId); render(); };
    const rows = card.rows.map((r) => buildRow(card, r));
    return h('article', { class: `ex${card.increased ? ' increased' : ''}`, 'aria-label': card.name },
      h('header', { class: 'ex-head' },
        h('button', { type: 'button', class: 'ex-name', 'aria-expanded': String(ui.info.has(card.exerciseId)), onclick: toggle(ui.info) }, card.name, card.swapped ? h('span', { class: 'muted small', text: ' (swapped)' }) : null),
        card.swapOptions.length > 1 ? h('button', { type: 'button', class: 'btn quiet swap-btn', 'aria-expanded': String(ui.swap.has(card.exerciseId)), disabled: !card.canSwap, title: card.swapBlockedReason ?? 'Swap exercise', onclick: toggle(ui.swap) }, 'Swap') : null),
      h('p', { class: 'prescription', text: card.prescription }),
      card.suggestionText ? h('p', { class: 'suggest', text: [card.suggestionText, card.sourceLabel].filter(Boolean).join(' · ') }) : null,
      card.increaseText ? h('p', { class: 'up', text: card.increaseText }) : null,
      card.lastText ? h('p', { class: 'last muted', text: card.lastText }) : null,
      card.hints.map((t) => h('p', { class: 'hint small', text: t })),
      card.swapBlockedReason && ui.swap.has(card.exerciseId) ? h('p', { class: 'small muted', text: card.swapBlockedReason }) : null,
      ui.info.has(card.exerciseId) ? infoPanel(card) : null,
      ui.swap.has(card.exerciseId) && card.canSwap ? swapPanel(card) : null,
      h('ol', { class: 'sets' }, rows.map((c) => c.el)),
      h('button', { type: 'button', class: 'btn quiet add-set', onclick() { ctx.actions.addSet(sessionId, card.exerciseId); render(); } }, '+ Add set'));
  }

  // ---- the whole body ----
  function buildBody(view) {
    rowComps.clear();
    const unlogged = Math.max(0, view.plannedSets - view.loggedSets);
    const notes = h('textarea', {
      id: 'session-notes', rows: 3, maxlength: 4000, placeholder: 'How did it go? (optional)',
      oninput() { ctx.actions.typeNotes(sessionId, notes.value); },
      onchange() { guard(() => ctx.actions.saveNotes(sessionId, notes.value)); },
    });
    notes.value = view.notes;
    const pain = painChips({ label: 'Back pain after', value: view.backPainAfter, onChange(v) { ctx.actions.setBackPainAfter(sessionId, v); } });
    const discard = armedButton(h('button', { type: 'button', class: 'btn quiet', text: 'Discard workout' }), {
      armedText: 'Tap again to discard',
      async onConfirm() {
        try { await ctx.actions.discard(sessionId); ctx.navigate('#/'); } catch (err) { ctx.notify(err.message, 'error'); }
      },
    });
    const finishPanel = ui.finishOpen ? h('section', { class: 'card finish', 'aria-labelledby': 'finish-title' },
      h('h3', { id: 'finish-title', text: 'Finish workout' }),
      unlogged > 0 ? h('p', { class: 'muted', text: `${unlogged} planned ${unlogged === 1 ? 'set is' : 'sets are'} not logged. You can still finish.` }) : null,
      h('p', { class: 'field-label', text: 'Back pain after (optional)' }),
      pain.el,
      h('div', { class: 'actions' },
        h('button', {
          type: 'button', class: 'btn primary grow',
          onclick: () => guard(async () => {
            await ctx.actions.finish(sessionId, { backPainAfter: ctx.actions.draft(sessionId).backPainAfter ?? view.backPainAfter, notes: notes.value });
            ctx.navigate(`#/summary/${sessionId}`);
          }),
        }, 'Save and finish'),
        h('button', { type: 'button', class: 'btn', onclick() { ui.finishOpen = false; render(); } }, 'Keep going'))) : null;

    fill(body,
      h('a', { class: 'back', href: '#/' }, '← Home'),
      h('header', { class: 'card session-head' },
        h('h2', { text: view.label }),
        h('p', { class: 'muted', text: `${view.dateText} · started ${view.startedText}` }),
        h('p', { text: `Week ${view.programWeek} · ${view.phaseText}` }),
        view.backPainBefore !== null ? h('p', { class: 'muted small', text: `Back pain before: ${view.backPainBefore} / 10` }) : null,
        h('p', { class: 'progress-line' }, h('progress', { max: Math.max(1, view.plannedSets), value: Math.min(view.loggedSets, Math.max(1, view.plannedSets)), 'aria-label': 'Sets logged' }), h('span', { class: 'progress-text small muted' }))),
      view.groups.map((g) => h('section', { class: 'group', 'aria-label': g.superset === null ? 'Single exercise' : `Superset ${g.superset}` },
        g.superset !== null ? h('h3', { class: 'group-title', text: `Superset ${g.superset}` }) : null,
        g.cards.map(buildCard))),
      view.orphans.length ? h('section', { class: 'group', 'aria-label': 'Logged under another exercise' },
        h('h3', { class: 'group-title', text: 'Logged under another exercise' }), view.orphans.map(buildCard)) : null,
      h('section', { class: 'card' },
        h('label', { for: 'session-notes', text: 'Notes (optional)' }), notes,
        ui.finishOpen ? null : h('div', { class: 'actions finish-actions' },
          h('button', { type: 'button', class: 'btn primary grow', disabled: !view.canFinish, onclick() { ui.finishOpen = true; render(); } }, 'Finish workout'),
          discard),
        !view.canFinish && !ui.finishOpen ? h('p', { class: 'muted small', text: 'Log a set to finish, or discard the workout.' }) : null),
      finishPanel);
  }

  // ---- render: rebuild on structure change, otherwise patch ----
  function render() {
    const view = currentView();
    if (!view) {
      fill(body, h('a', { class: 'back', href: '#/' }, '← Home'), h('p', { class: 'card', text: 'That workout is not on this device.' }));
      restEl.hidden = true;
      structure = null;
      return;
    }
    if (view.finished) { ctx.navigate(`#/summary/${sessionId}`); return; }

    const key = JSON.stringify([ui.finishOpen, view.canFinish, view.orphans.map(cardKey), view.groups.map((g) => [g.superset, g.cards.map(cardKey)]), [...ui.info], [...ui.swap], view.label]);
    if (key !== structure) {
      const active = document.activeElement;
      const restoreId = active && body.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) ? active.id : null;
      const caret = restoreId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
      const y = window.scrollY;
      structure = key;
      buildBody(view);
      const target = restoreId ? document.getElementById(restoreId) : null;
      if (target) {
        target.focus({ preventScroll: true });
        if (caret) try { target.setSelectionRange(...caret); } catch { /* select has no caret */ }
      }
      window.scrollTo(0, y);
    }
    // Patch every row from the view (values, enabled buttons, "changed from" notes).
    for (const card of [...view.groups.flatMap((g) => g.cards), ...view.orphans]) {
      for (const row of card.rows) {
        const comp = rowComps.get(row.id);
        if (comp) { comp.card = card; comp.row = row; comp.sync(); }
      }
    }
    const text = body.querySelector('.progress-text');
    if (text) text.textContent = ` ${view.loggedSets} of ${view.plannedSets} sets logged`;
    const bar = body.querySelector('progress');
    if (bar) { bar.max = Math.max(1, view.plannedSets); bar.value = Math.min(view.loggedSets, bar.max); }
    updateRest();
  }

  render();
  return {
    update: render,
    destroy() {
      clearInterval(ticker);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}

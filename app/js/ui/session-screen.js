// The session screen (spec 6.3): the most important screen, phone first. The look is the v0.2 viewer's (spec 0.B.1): one horizontal
// swipe carousel, one card per exercise with the neighbours peeking, a colour on the card's left edge for each superset, and the
// Options and TRX buttons. It draws the view model from logging/session-view.js and forwards taps to logging/actions.js; every rule
// (pre-fill, carry-over, what can be logged, what a tap writes) lives there.
//
// Rendering. A change in structure (a row becoming done, a swap, an alternatives list opening) rebuilds the carousel and puts it back
// where it was. Anything else, such as typing or a +/- press, only patches values into the existing rows, so the box being typed in is
// never replaced. Typed values go to the draft on every keystroke, so a refresh loses nothing.

import {
  REST_STEP_SEC, formatClock, formatNumber, parseDistance, parseReps, parseWeight, restStatus, sessionView, stepValue,
} from '../logging/index.js';
import { EXERCISES, PLACEHOLDER_GIF } from '../seed/index.js';
import { armedButton, fill, h, painChips } from './dom.js';

const FIELD = {
  weightLbs: { label: 'Weight (lbs)', short: 'weight in pounds', parse: parseWeight, mode: 'decimal', min: 0, max: 1000 },
  reps: { label: 'Reps', short: 'reps', parse: parseReps, mode: 'numeric', min: 0, max: 500 },
  distanceM: { label: 'Distance (m)', short: 'distance in metres', parse: parseDistance, mode: 'decimal', min: 0, max: 10000 },
};

const cardKey = (c) => [c.exerciseId, c.swapped, c.canSwap, c.done, c.chipText, c.partnerName, c.increaseText, c.suggestionText, c.lastText, c.hints, c.swapBlockedReason, c.rows.map((r) => [r.id, r.status])];

// ctx: { events, actions, now(), navigate(hash), notify(text, kind) }
export function mountSession(container, ctx, sessionId) {
  const ui = { alt: new Map(), slide: 0 }; // alt: exercise id -> which list is open ('alternatives' | 'trx')
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
        summary.textContent = parts.length ? parts.join(' × ') : 'done';
        setChangedNote(changedNote, r);
      };
      return comp;
    }

    const fields = [];
    if (card.inputs.weight) fields.push(numberBox(comp, 'weightLbs'));
    if (card.inputs.level) fields.push(levelBox(comp));
    if (card.inputs.reps) fields.push(numberBox(comp, 'reps'));
    if (card.inputs.distance) fields.push(numberBox(comp, 'distanceM'));
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
      h('div', { class: 'set-actions' }, cancel, main));
    comp.sync = () => {
      fields.forEach((f) => f.sync());
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

  // ---- an exercise card (v0.2 layout; the sets sit right under the header so the logging is never below the fold) ----
  const thumb = (id, name) => {
    const url = EXERCISES[id]?.gifUrl || PLACEHOLDER_GIF;
    const img = h('img', { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', width: 56, height: 42 });
    img.addEventListener('error', () => { img.src = PLACEHOLDER_GIF; }, { once: true });
    return h('div', { class: 'alt-thumb', 'aria-label': name }, img);
  };

  function altPanel(card, group) {
    const items = card.optionGroups[group];
    return h('div', { class: 'alt-panel', 'data-group': group === 'trx' ? 'trxAlternatives' : 'alternatives', role: 'group', 'aria-label': `${group === 'trx' ? 'TRX' : 'Options'} for ${card.name}` },
      items.map((o) => h('div', { class: 'alt-item' },
        thumb(o.exerciseId, o.name),
        h('div', { class: 'alt-name', text: o.name }),
        h('button', {
          type: 'button', class: 'alt-use', disabled: o.current,
          onclick: () => guard(async () => { await ctx.actions.swap(sessionId, { slotNumber: card.slot, exerciseId: o.exerciseId }); ui.alt.delete(card.exerciseId); }),
        }, o.current ? 'In use' : 'Use this'))));
  }

  function formSection(card) {
    const c = card.cues;
    const img = h('img', { src: c.gifUrl || PLACEHOLDER_GIF, alt: `${card.name} demonstration`, loading: 'lazy', referrerpolicy: 'no-referrer', width: 640, height: 400 });
    img.addEventListener('error', () => { img.src = PLACEHOLDER_GIF; }, { once: true });
    return h('div', { class: 'form-section' },
      h('div', { class: 'gif-wrapper' }, img, h('div', { class: 'gif-label' }, h('span'), 'Live form reference')),
      c.attribution ? h('div', { class: 'gif-attribution' }, 'Art credit: ', h('a', { href: c.attribution.url, target: '_blank', rel: 'noopener noreferrer', text: c.attribution.label })) : null,
      h('div', { class: 'exercise-body' },
        c.notes,
        card.partnerName ? ` Alternate with ${card.partnerName}; rest 60–90 s between rounds.` : '',
        card.hints.map((t) => h('div', { class: 'pairing-tip', text: t })),
        c.levelText ? h('div', { class: 'start-line', text: `Level: start at 2 of 5. ${c.levelText}` }) : null,
        c.rationale ? h('div', { class: 'start-line', text: c.rationale }) : null,
        c.ladder ? h('details', { class: 'ladder' }, h('summary', { text: 'Pushup ladder' }),
          h('ul', {}, c.ladder.map((l) => h('li', {}, h('strong', { text: `L${l.level}` }), ` ${l.variation} — ${l.reps}${l.cue ? ` · ${l.cue}` : ''}`)))) : null,
        c.tags.length ? h('div', { class: 'tags' }, c.tags.map((t) => h('span', { class: 'tag', text: t }))) : null));
  }

  function buildCard(card) {
    const rows = card.rows.map((r) => buildRow(card, r));
    const open = ui.alt.get(card.exerciseId) ?? null;
    const toggle = (group) => () => { open === group ? ui.alt.delete(card.exerciseId) : ui.alt.set(card.exerciseId, group); render(); };
    const groups = card.optionGroups;
    const altButtons = [];
    if (groups.alternatives.length) altButtons.push(h('button', { type: 'button', class: 'alt-toggle opt', 'aria-expanded': String(open === 'alternatives'), disabled: !card.canSwap, onclick: toggle('alternatives') }, 'Options ', h('span', { class: 'alt-badge', text: String(groups.alternatives.length) })));
    if (groups.trx.length) altButtons.push(h('button', { type: 'button', class: 'alt-toggle trx', 'aria-expanded': String(open === 'trx'), disabled: !card.canSwap, onclick: toggle('trx') }, 'TRX ', h('span', { class: 'alt-badge', text: String(groups.trx.length) })));
    return h('article', { class: `ex slide ${card.ssClass}${card.increased ? ' increased' : ''}${card.done ? ' done' : ''}`, 'aria-label': card.name },
      card.done ? h('div', { class: 'done-flag' }, h('span'), 'Done') : null,
      h('div', { class: 'ex-header' },
        h('div', {}, h('h3', { class: 'ex-title', text: card.name }), h('div', { class: 'phase-chip', text: card.chipText })),
        h('div', { class: 'ex-meta' }, h('strong', { text: card.prescription }), h('span', { text: 'Sets × Reps' }))),
      card.suggestionText ? h('p', { class: 'suggest', text: [card.suggestionText, card.sourceLabel].filter(Boolean).join(' · ') }) : null,
      card.increaseText ? h('p', { class: 'up', text: card.increaseText }) : null,
      card.lastText ? h('p', { class: 'last muted', text: card.lastText }) : null,
      h('ol', { class: 'sets' }, rows.map((c) => c.el)),
      h('button', { type: 'button', class: 'btn quiet add-set', onclick() { ctx.actions.addSet(sessionId, card.exerciseId); render(); } }, '+ Add set'),
      formSection(card),
      card.swappedFromName ? h('div', { class: 'swap-note' }, `Swapped from ${card.swappedFromName} · `, h('button', { type: 'button', class: 'revert-btn', onclick: () => guard(async () => { ui.alt.delete(card.exerciseId); await ctx.actions.swap(sessionId, { slotNumber: card.slot, exerciseId: card.defaultExerciseId }); }) }, 'Revert')) : null,
      altButtons.length ? h('div', { class: 'alt-row' }, altButtons) : null,
      card.swapBlockedReason && altButtons.length ? h('p', { class: 'small muted', text: card.swapBlockedReason }) : null,
      open && card.canSwap ? altPanel(card, open) : null);
  }

  // The last slide: notes, back pain after, and Finish (there is no separate Finish screen).
  function buildFinishCard(view) {
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
    const unlogged = Math.max(0, view.plannedSets - view.loggedSets);
    return h('article', { class: 'ex slide finish-card', 'aria-label': 'Finish workout' },
      h('div', { class: 'ex-header' }, h('div', {}, h('h3', { class: 'ex-title', text: 'Finish workout' }), h('div', { class: 'phase-chip', text: 'Last card' }))),
      h('p', { class: 'muted', text: `${view.loggedSets} of ${view.plannedSets} sets logged${unlogged > 0 ? `. ${unlogged} not logged; you can still finish.` : '.'}` }),
      h('label', { for: 'session-notes', text: 'Notes (optional)' }), notes,
      h('p', { class: 'field-label', text: 'Back pain after (optional)' }), pain.el,
      h('button', {
        type: 'button', class: 'btn primary block', disabled: !view.canFinish,
        onclick: () => guard(async () => {
          await ctx.actions.finish(sessionId, { backPainAfter: ctx.actions.draft(sessionId).backPainAfter ?? null, notes: notes.value });
          ctx.navigate(`#/summary/${sessionId}`);
        }),
      }, 'Save and finish'),
      !view.canFinish ? h('p', { class: 'muted small', text: 'Log a set to finish, or discard the workout.' }) : null,
      h('div', { class: 'actions finish-actions' }, discard));
  }

  // ---- the whole body ----
  function buildBody(view) {
    rowComps.clear();
    const cards = [...view.groups.flatMap((g) => g.cards), ...view.orphans];
    const track = h('div', { class: 'track', role: 'region', tabindex: '0', 'aria-label': 'Exercises. Swipe sideways for the next one.' },
      cards.map(buildCard), buildFinishCard(view));
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
      h('a', { class: 'back', href: '#/' }, '← Home'),
      h('p', { class: 'status-line' }),
      h('p', { class: 'phase-line muted small' }),
      track);
    return track;
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

    const key = JSON.stringify([view.canFinish, view.label, view.orphans.map(cardKey), view.groups.map((g) => [g.superset, g.cards.map(cardKey)]), [...ui.alt]]);
    if (key !== structure) {
      const active = document.activeElement;
      const restoreId = active && body.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) ? active.id : null;
      const caret = restoreId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
      const y = window.scrollY;
      const x = body.querySelector('.track')?.scrollLeft ?? 0;
      structure = key;
      const track = buildBody(view);
      track.scrollLeft = x;
      const target = restoreId ? document.getElementById(restoreId) : null;
      if (target) {
        target.focus({ preventScroll: true });
        if (caret) try { target.setSelectionRange(...caret); } catch { /* select has no caret */ }
      }
      window.scrollTo(0, y);
    }
    // Patch every row from the view (values, enabled buttons, "changed from" notes) and the status lines.
    for (const card of [...view.groups.flatMap((g) => g.cards), ...view.orphans]) {
      for (const row of card.rows) {
        const comp = rowComps.get(row.id);
        if (comp) { comp.card = card; comp.row = row; comp.sync(); }
      }
    }
    const status = body.querySelector('.status-line');
    if (status) status.textContent = `${view.label.replace(' – Full body', '')} · ${view.exercisesDone}/${view.exerciseCount} done · ${view.loggedSets}/${view.plannedSets} sets`;
    const phase = body.querySelector('.phase-line');
    if (phase) phase.textContent = `${view.dateText} · started ${view.startedText} · Week ${view.programWeek} · ${view.phaseText}${view.backPainBefore !== null ? ` · back pain before ${view.backPainBefore}/10` : ''}`;
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

// The header of the v0.2 viewer (spec 0.B.1): collapsed it is one line (the status, for example "Wed · Workout B · 0/6 done", with a
// chevron, a dot for whether the work is saved, and the theme button); tapping the status opens the day pills, the save state and the
// sign-out icon after Sunday. Picking a day or scrolling down closes it again.

import { armedIconButton, h, svgIcon } from './dom.js';
import { THEME_ICONS, THEME_NAMES, cycleTheme, currentTheme } from './theme.js';

const LOGOUT_PATHS = ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'];

// handlers: { onPickDay(weekday), onSignOut() }. Returns the controls the screens use.
export function mountHeader({ root }, handlers) {
  let expanded = false;
  let lastY = 0;

  const text = h('span', { class: 'hdr-text' });
  const chev = h('span', { class: 'chev', 'aria-hidden': 'true' }, '▾');
  const status = h('button', { type: 'button', class: 'hdr-status', 'aria-expanded': 'false', 'aria-controls': 'hdr-panel', onclick: () => setExpanded(!expanded) }, text, chev);
  const dot = h('span', { class: 'save-dot', 'aria-hidden': 'true' });
  const count = h('span', { class: 'save-count' });
  const chip = h('span', { class: 'save-chip', role: 'status', 'data-kind': 'info' }, dot, count);
  const theme = h('button', { type: 'button', class: 'theme-btn', onclick() { cycleTheme(); paintTheme(); } });
  const pills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Day' });
  const saveLine = h('p', { class: 'save-line small' });
  const panel = h('div', { class: 'hdr-panel', id: 'hdr-panel', hidden: true }, pills, saveLine);
  root.replaceChildren(h('div', { class: 'hdr-bar' }, status, chip, theme), panel);

  function paintTheme() {
    const t = currentTheme();
    theme.textContent = THEME_ICONS[t];
    theme.setAttribute('aria-label', `Theme: ${THEME_NAMES[t]}. Tap to change.`);
  }
  paintTheme();

  function setExpanded(on) {
    expanded = on;
    panel.hidden = !on;
    status.setAttribute('aria-expanded', String(on));
    root.classList.toggle('open', on);
  }

  // Scrolling down while it is open closes it, as in the viewer.
  addEventListener('scroll', () => {
    const y = window.scrollY;
    if (expanded && y > lastY + 12) setExpanded(false);
    lastY = y;
  }, { passive: true });

  const signOut = armedIconButton({
    label: 'Sign out', armedText: 'Sign out?', className: 'pill signout', icon: svgIcon(LOGOUT_PATHS), onConfirm: () => handlers.onSignOut(),
  });

  return {
    collapse: () => setExpanded(false),
    setStatus(value) { text.textContent = value; },
    // pills: [{ weekday, label, kind, isToday }]. selected: the weekday chosen.
    setDays(list, selected) {
      pills.replaceChildren(
        ...list.map((p) => h('button', {
          type: 'button', class: `pill ${p.kind}${p.weekday === selected ? ' active' : ''}${p.isToday ? ' today' : ''}`, 'aria-pressed': String(p.weekday === selected),
          onclick() { setExpanded(false); handlers.onPickDay(p.weekday); },
        }, h('span', { class: 'dot', 'aria-hidden': 'true' }), p.label, p.isToday ? h('span', { class: 'sr-only', text: ' (today)' }) : null)),
        signOut,
      );
    },
    // { text, kind, pending }: the dot and count in the bar, the sentence in the panel.
    setSave({ text: sentence, kind, pending }) {
      chip.dataset.kind = kind;
      chip.setAttribute('aria-label', sentence);
      count.textContent = pending > 0 ? String(pending) : '';
      saveLine.textContent = sentence;
    },
    show(visible) { root.hidden = !visible; if (!visible) setExpanded(false); },
  };
}

// The header of the v0.2 viewer (spec 0.B.1): collapsed it is one line (the status, for example "Wed · Workout B · 0/6 done", with a
// chevron, a dot for whether the work is saved, and the theme button); tapping the status opens the day pills, then three icon buttons
// after a divider (History, Settings, sign out) and the save state. Picking a day or scrolling down closes it again.

import { armedIconButton, h, svgIcon } from './dom.js';
import { THEME_ICONS, THEME_NAMES, cycleTheme, currentTheme } from './theme.js';

const LOGOUT_PATHS = ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'];
const HISTORY_PATHS = ['M12 8v4l2 2', 'M3.05 11a9 9 0 1 1 .5 4', 'M3 20v-5h5'];
const SETTINGS_PATHS = [
  'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065z',
  'M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0',
];

// handlers: { onPickDay(weekday), onNavigate(hash), onSignOut() }. Returns the controls the screens use.
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

  const navButton = (label, paths, hash) => h('button', {
    type: 'button', class: 'pill iconbtn', 'aria-label': label, title: label,
    onclick() { setExpanded(false); handlers.onNavigate(hash); },
  }, svgIcon(paths));
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
        // One group, so on a narrow phone the three icons wrap together onto their own line.
        h('span', { class: 'pill-icons' }, h('span', { class: 'pill-sep', 'aria-hidden': 'true' }), navButton('History', HISTORY_PATHS, '#/history'), navButton('Settings', SETTINGS_PATHS, '#/settings'), signOut),
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

// The theme button (spec 9, and 0.B.1 of the v0.2 viewer): System, then Light, then Dark, then System again. The choice is kept in
// localStorage ("strengthTheme") and applied before first paint by js/theme-boot.js.

const KEY = 'strengthTheme';
const ORDER = ['system', 'light', 'dark'];
export const THEME_ICONS = { system: '◐', light: '☀', dark: '☾' };
export const THEME_NAMES = { system: 'System', light: 'Light', dark: 'Dark' };

export function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function applyTheme(theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch { /* storage blocked: applies until the page closes */ }
}

// Moves to the next theme and returns it.
export function cycleTheme() {
  const next = ORDER[(ORDER.indexOf(currentTheme()) + 1) % ORDER.length];
  applyTheme(next);
  return next;
}

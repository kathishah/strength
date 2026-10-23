// Text about events and replayed state. Pure and network-free, so every app mode may load it (ui/format.js re-exports these).

import { TIME_ZONE } from '../time.js';

const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', second: '2-digit' });
export const timeOfDay = (ms) => clock.format(ms);

// A short description of an event's payload for the list.
export function describeEvent(ev) {
  const p = ev.payload ?? {};
  if (typeof p.notes === 'string') return p.notes;
  const s = JSON.stringify(p);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

// "3 sessions, 12 sets, 2 settings"
export function describeState(state) {
  const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return [
    n(Object.keys(state.sessions).length, 'session'),
    n(Object.keys(state.sets).length, 'set'),
    n(Object.keys(state.settings).length, 'setting'),
  ].join(', ');
}

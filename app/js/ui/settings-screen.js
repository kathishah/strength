// Settings (spec 6.7, v1.17). The heading, then the mode's own content. Synced mode: the sync panel, which is the #device card in
// index.html (sync-panel.js); boot.js shows it on this route. Local-only and demo modes: ctx.settingsSection(host, ctx), supplied by
// the mode (boot.js, the "settings" hook), draws into a div under the heading; with none there is only the heading.
// Sign out is in the header.

import { fill, h } from './dom.js';

export function mountSettings(container, ctx) {
  ctx.header.setStatus('Settings');
  ctx.header.setDays([], null);
  fill(container, h('h2', { text: 'Settings' }));
  let section = null;
  if (ctx.settingsSection) {
    const host = h('div', { class: 'settings-section' });
    container.append(host);
    section = ctx.settingsSection(host, ctx) ?? null;
  }
  return { update() { section?.update?.(); }, destroy() { section?.destroy?.(); } };
}

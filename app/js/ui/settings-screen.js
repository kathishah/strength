// Settings (spec 6.7, v1.17): sync only. The sync panel itself is the #device card in index.html (sync-panel.js); main.js shows it on
// this route. This screen is the heading above it. Sign out is in the header.

import { fill, h } from './dom.js';

export function mountSettings(container, ctx) {
  ctx.header.setStatus('Settings');
  ctx.header.setDays([], null);
  fill(container, h('h2', { text: 'Settings' }));
  return { update() {}, destroy() {} };
}

// The checked-in app/js/config.js holds no deployment values (spec section 5), so a fork, a local preview and the GitHub Pages copy
// open in local-only mode. scripts/deploy-app.sh writes the real values into its staged copy only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { injectSiteConfig } from '../scripts/stack-config.mjs';

const source = readFileSync(new URL('../app/js/config.js', import.meta.url), 'utf8');

test('every value in the checked-in config is empty, so the app opens in local-only mode', async () => {
  const object = /export const config = \{([\s\S]*?)\n\};/.exec(source)[1];
  const values = [...object.matchAll(/^\s*\w+:\s*(.*?),?\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(values, ["''", "''", "''"]);
  assert.doesNotMatch(source, /amazonaws\.com|logbook\.me|cloudfront\.net|[a-z0-9]{26}/);
  const { isConfigured } = await import('../app/js/config.js');
  assert.equal(isConfigured(), false);
});

test('deploy-app can still write a stack\'s values into the empty file', () => {
  const out = injectSiteConfig(source, { region: 'eu-west-1', userPoolClientId: 'abc', apiUrl: 'https://x.execute-api.eu-west-1.amazonaws.com' });
  assert.match(out, /region: "eu-west-1"/);
  assert.match(out, /export const isConfigured/);
});

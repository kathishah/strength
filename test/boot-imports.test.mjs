// No network outside synced mode (spec section 3, App modes): the code that talks to Cognito and the API must not be reachable from
// boot.js by static imports, so a local-only or demo page never loads it. In synced mode boot.js loads it with import().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, relative } from 'node:path';
import { dynamicImports, staticImports } from '../test-support/import-walk.mjs';

const js = new URL('../app/js/', import.meta.url).pathname;
const rel = (set) => [...set].map((p) => relative(js, p)).sort();

// The network code, and the modules that import it or only serve it.
const NETWORK = ['store/auth.js', 'store/api.js', 'store/sync.js', 'store/outbox.js', 'ui/format.js', 'ui/auth-screen.js', 'ui/sync-panel.js', 'config.js'];

test('the walker follows static imports (sync.js reaches auth.js, format.js reaches api.js, api.js reaches config.js)', () => {
  assert.ok(rel(staticImports(join(js, 'store/sync.js'))).includes('store/auth.js'));
  assert.ok(rel(staticImports(join(js, 'ui/format.js'))).includes('store/api.js'));
  assert.ok(rel(staticImports(join(js, 'store/api.js'))).includes('config.js'));
});

test('boot.js reaches the screens, the event store and the logging actions, and none of the network code', () => {
  const reached = rel(staticImports(join(js, 'boot.js')));
  for (const wanted of ['boot.js', 'profile.js', 'store/events.js', 'store/open.js', 'ui/screens.js', 'ui/app-header.js', 'ui/settings-screen.js', 'logging/index.js', 'modes/demo.js', 'modes/local.js']) {
    assert.ok(reached.includes(wanted), `boot.js should reach ${wanted}`);
  }
  assert.deepEqual(reached.filter((p) => NETWORK.includes(p)), [], 'network code reachable by static imports from boot.js');
});

test('boot.js loads exactly the synced-only modules with import()', () => {
  const loaded = dynamicImports(join(js, 'boot.js')).map((p) => relative(js, p)).sort();
  assert.deepEqual(loaded, ['store/api.js', 'store/auth.js', 'store/sync.js', 'ui/auth-screen.js', 'ui/format.js', 'ui/sync-panel.js']);
});

test('main.js only adds config.js and boot.js; the demo entry will import boot.js alone', () => {
  const reached = rel(staticImports(join(js, 'main.js')));
  assert.ok(reached.includes('config.js') && reached.includes('boot.js'));
  assert.deepEqual(reached.filter((p) => ['store/auth.js', 'store/api.js', 'store/sync.js'].includes(p)), []);
});

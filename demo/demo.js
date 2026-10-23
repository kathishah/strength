// The demo page (demo/index.html): the app in demo mode, with a fictional lifter's sample history in its own storage
// ("strength-demo" and "strength-demo.*"). No account, no network, no service worker. Its only files besides code are its own exercise
// images (demo/media/).
// See docs/SHOWCASE-AND-SELF-HOST-SPEC.md, section 3. The hooks are in demo-ui.js and the sample history in fixture.js.

import { startApp } from '../app/js/boot.js';
import { createDemoUi, useDemoMedia } from './demo-ui.js';

useDemoMedia();
startApp({ mode: 'demo', ui: createDemoUi() });

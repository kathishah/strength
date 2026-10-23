// Demo mode's own screens and wording (spec section 3, "Demo design"). This file is the one place the demo task fills in; boot.js needs no
// change. The hooks are described in boot.js ("Mode hooks") and listed in modes/local.js; the demo uses prepare (write the fixture),
// saveChip ("Demo"), strip (the label and Reset demo) and settings (the explanation, Reset, a link back to the landing page).
// A demo entry script can also pass the same hooks as startApp({ mode: 'demo', ui }) to keep the demo's code outside app/.

export const demoUi = {};

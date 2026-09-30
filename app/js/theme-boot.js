// Runs before the page paints (a plain script in the head, not a module) so a chosen theme never flashes the other one first.
// The choice itself is made in the header (ui/theme.js). No choice means the device's own setting.
(function () {
  try {
    var t = localStorage.getItem('strengthTheme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the device */ }
})();

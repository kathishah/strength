// Hash routes: #/ (home), #/session/<id>, #/summary/<id>, #/recovery. A refresh keeps the route, so a refresh in the middle of
// a workout comes back to it, and the back button works.

export function parseRoute(hash) {
  const parts = String(hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const [name, id] = parts;
  if ((name === 'session' || name === 'summary') && /^[A-Za-z0-9_.:-]{1,80}$/.test(id ?? '')) return { name, id };
  if (name === 'recovery') return { name: 'recovery' };
  return { name: 'home' };
}

export function createRouter({ onRoute }) {
  const go = () => onRoute(parseRoute(location.hash));
  addEventListener('hashchange', go);
  return {
    start: go,
    navigate(hash) {
      if (location.hash === hash) go();
      else location.hash = hash;
    },
  };
}

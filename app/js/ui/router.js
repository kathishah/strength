// Hash routes: #/ (home: the day's cards) and #/summary/<id>. Anything else, including the old #/session/<id> and #/recovery, is
// home. A refresh keeps the route and the back button works.

export function parseRoute(hash) {
  const parts = String(hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const [name, id] = parts;
  if (name === 'summary' && /^[A-Za-z0-9_.:-]{1,80}$/.test(id ?? '')) return { name, id };
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

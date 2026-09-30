// Hash routes: #/ (home: the day's cards), #/summary/<id>, #/workout/<id> (a finished workout reopened to correct it, spec 6.3),
// #/history (by exercise), #/history/date, #/history/exercise/<id> and #/settings (spec 6.6, 6.7). Anything else, including the old
// #/session/<id> and #/recovery, is home. A refresh keeps the route and the back button works.
const ID = /^[A-Za-z0-9_.:-]{1,80}$/;

export function parseRoute(hash) {
  const parts = String(hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const [name, id, third] = parts;
  if ((name === 'summary' || name === 'workout') && ID.test(id ?? '')) return { name, id };
  if (name === 'history') {
    if (id === 'exercise' && ID.test(third ?? '')) return { name: 'exercise', id: third };
    return { name: 'history', view: id === 'date' ? 'date' : 'exercise' };
  }
  if (name === 'settings') return { name: 'settings' };
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

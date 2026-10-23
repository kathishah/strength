// scripts/post-events.mjs: uploads a backup in batches. The API is the real Lambda handler running in-process on an in-memory S3
// (test-support/util.mjs); sign-in and the network are replaced by a fake fetch.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_EVENTS_PER_REQUEST, compareTs } from '../lambda/events/registry.mjs';
import { StackConfigError } from '../scripts/stack-config.mjs';
import { main, planBatches, prepareEvents } from '../scripts/post-events.mjs';
import { NOW, makeEvent, makeRequest, monthKey, setup } from '../test-support/util.mjs';
import { OUTPUTS, REGION, STACK, createSandbox } from '../test-support/aws-sandbox.mjs';

const API = 'https://api.example.test';
const stack = {
  STACK, AWS_REGION: REGION, SITE_URL: 'https://site.example.test', API_URL: API,
  config: { region: REGION, userPoolClientId: 'client-1', apiUrl: API },
};

// Everything main() touches, in memory. `failBatch` (1-based) makes that POST answer 503 until `heal()`.
function world({ files = {}, answers = ['y'], failBatch = null } = {}) {
  const api = setup();
  const w = {
    api,
    files: new Map(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])),
    out: [], err: [], posts: [], prompts: [], fetches: [], failBatch,
    heal() { w.failBatch = null; },
  };
  const fetch = async (url, init) => {
    url = String(url);
    w.fetches.push(url);
    if (url.startsWith('https://cognito-idp.')) {
      const body = JSON.parse(init.body);
      const ok = body.AuthParameters.PASSWORD === '123456' && body.ClientId === 'client-1' && url.includes(`.${REGION}.`);
      return new Response(JSON.stringify(ok ? { AuthenticationResult: { IdToken: 'token-1' } } : { __type: 'NotAuthorizedException' }));
    }
    assert.equal(url, `${API}/events`);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer token-1');
    const body = JSON.parse(init.body);
    w.posts.push(body);
    if (w.failBatch === w.posts.length) return new Response('{"error":"busy"}', { status: 503 });
    const res = await api.call(makeRequest({ method: 'POST', body }));
    return new Response(res.body, { status: res.statusCode });
  };
  const queue = [...answers];
  w.deps = {
    fetch,
    loadStackConfig: () => stack,
    ask: async (q) => { w.prompts.push(`ask: ${q}\n${w.out.join('\n')}`); return queue.shift() ?? 'n'; },
    askHidden: async (q) => { w.prompts.push(`pin: ${q}`); return '123456'; },
    now: () => NOW,
    exists: (f) => w.files.has(f),
    readFile: (f) => {
      if (!w.files.has(f)) throw new Error(`ENOENT: ${f}`);
      return w.files.get(f);
    },
    writeFile: (f, text) => void w.files.set(f, text),
    out: (m) => void w.out.push(m),
    err: (m) => void w.err.push(m),
  };
  w.run = (argv = ['backup.json', 'me@example.com']) => main(argv, w.deps);
  w.stored = () => w.api.store.json(monthKey('2026-10')) ?? [];
  return w;
}

const events = (n, from = 1) => Array.from({ length: n }, (_, i) => makeEvent(from + i));
const shuffled = (list) => [...list].sort((a, b) => ((a.id.slice(-3) * 7919) % 1009) - ((b.id.slice(-3) * 7919) % 1009));

describe('post-events: batches', () => {
  test('more than 200 events go out in several batches, none over 200, oldest first', async () => {
    const all = events(450);
    const w = world({ files: { 'backup.json': { exportedAt: '2026-10-01T00:00:00Z', count: 450, events: shuffled(all) } } });
    assert.equal(await w.run(), 0, w.err.join('\n'));
    assert.deepEqual(w.posts.map((p) => p.events.length), [200, 200, 50]);
    assert.ok(w.posts.every((p) => p.events.length <= MAX_EVENTS_PER_REQUEST));
    const sent = w.posts.flatMap((p) => p.events);
    for (let i = 1; i < sent.length; i++) assert.ok(compareTs(sent[i - 1].ts, sent[i].ts) <= 0, 'replay order');
    assert.deepEqual(new Set(sent.map((e) => e.id)), new Set(all.map((e) => e.id)));
    assert.equal(w.stored().length, 450);
    assert.deepEqual(w.out.filter((l) => l.startsWith('Batch')), [
      'Batch 1 of 3 (events 1-200): accepted 200, duplicates 0',
      'Batch 2 of 3 (events 201-400): accepted 200, duplicates 0',
      'Batch 3 of 3 (events 401-450): accepted 50, duplicates 0',
    ]);
    assert.match(w.out.at(-1), /450 events sent in 3 batches; 450 accepted, 0 duplicates/);
    assert.ok(w.files.has('backup.json.posted'), 'marker after every batch succeeded');
  });

  test('shows the stack, the site address and the count, and asks, before signing in or sending anything', async () => {
    const w = world({ files: { 'backup.json': { events: events(3) } } });
    await w.run();
    const asked = w.prompts[0];
    assert.match(asked, /^ask: Send them to strength-testing\? \[y\/N\]/);
    assert.match(asked, /Stack: {2}strength-testing \(eu-west-2\)/);
    assert.match(asked, /Site: {3}https:\/\/site\.example\.test/);
    assert.match(asked, /Events: 3 in 1 batch /);
    assert.equal(w.prompts[1], 'pin: PIN: ');
  });

  test('answering anything but y sends nothing, asks for no PIN and writes no marker', async () => {
    for (const answer of ['', 'n', 'no', 'yes please']) {
      const w = world({ files: { 'backup.json': { events: events(3) } }, answers: [answer] });
      assert.equal(await w.run(), 0);
      assert.deepEqual(w.fetches, []);
      assert.equal(w.prompts.length, 1);
      assert.equal(w.files.has('backup.json.posted'), false);
    }
  });

  test('a batch is also kept under the API\'s body-size limit', () => {
    const big = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, pad: 'x'.repeat(1000) }));
    const batches = planBatches(big, 'd_x', { maxBytes: 3500 });
    assert.deepEqual(batches.map((b) => b.length), [3, 3, 3, 1]);
    assert.deepEqual(planBatches([], 'd_x'), []);
    assert.deepEqual(planBatches(events(401), 'd_x').map((b) => b.length), [200, 200, 1]);
  });
});

describe('post-events: failure and rerun', () => {
  test('a failure partway stops with a message, writes no marker, and says the same command can be rerun', async () => {
    const w = world({ files: { 'backup.json': { events: events(450) } }, failBatch: 2 });
    assert.equal(await w.run(), 1);
    assert.equal(w.posts.length, 2, 'the third batch is never sent');
    assert.equal(w.files.has('backup.json.posted'), false);
    assert.match(w.err[0], /Batch 2 of 3 \(events 201-400\) failed: the API answered 503/);
    assert.match(w.err[1], /200 of 450 events were sent before it \(200 accepted, 0 already there\)/);
    assert.match(w.err[1], /No \.posted marker was written/);
    assert.match(w.err[1], /run the same command again/);
    assert.equal(w.stored().length, 200);
  });

  test('rerunning after a failure sends the same events again and the server counts the ones it has as duplicates', async () => {
    const w = world({ files: { 'backup.json': { events: events(450) } }, answers: ['y', 'y'], failBatch: 2 });
    await w.run();
    w.heal();
    w.out.length = 0;
    w.posts.length = 0;
    assert.equal(await w.run(), 0, w.err.join('\n'));
    assert.deepEqual(w.posts.map((p) => p.events.length), [200, 200, 50], 'everything is sent again');
    assert.deepEqual(w.out.filter((l) => l.startsWith('Batch')).map((l) => l.replace(/ \(events.*\)/, '')), [
      'Batch 1 of 3: accepted 0, duplicates 200',
      'Batch 2 of 3: accepted 200, duplicates 0',
      'Batch 3 of 3: accepted 50, duplicates 0',
    ]);
    assert.equal(w.stored().length, 450, 'no event is stored twice');
    assert.ok(w.files.has('backup.json.posted'));
  });

  test('after a complete run the marker blocks a second run; --force sends again and every event is a duplicate', async () => {
    const w = world({ files: { 'backup.json': { events: events(250) } }, answers: ['y', 'y'] });
    assert.equal(await w.run(), 0);
    const marker = w.files.get('backup.json.posted');
    assert.match(marker, /"events":250,"batches":2,"accepted":250,"duplicates":0/);

    w.posts.length = 0;
    assert.equal(await w.run(), 1);
    assert.match(w.err.at(-1), /already posted .* use --force/);
    assert.equal(w.posts.length, 0);

    w.out.length = 0;
    assert.equal(await w.run(['backup.json', 'me@example.com', '--force']), 0);
    assert.match(w.out.at(-1), /250 events sent in 2 batches; 0 accepted, 250 duplicates/);
    assert.equal(w.stored().length, 250);
  });

  test('a network error is reported like a failed batch', async () => {
    const w = world({ files: { 'backup.json': { events: events(5) } } });
    const real = w.deps.fetch;
    w.deps.fetch = async (url, init) => {
      if (String(url).endsWith('/events')) throw new TypeError('fetch failed');
      return real(url, init);
    };
    assert.equal(await w.run(), 1);
    assert.match(w.err[0], /Batch 1 of 1 .* failed: fetch failed/);
    assert.equal(w.files.has('backup.json.posted'), false);
  });

  test('a wrong PIN stops before any event is sent', async () => {
    const w = world({ files: { 'backup.json': { events: events(5) } } });
    w.deps.askHidden = async () => '000000';
    assert.equal(await w.run(), 1);
    assert.match(w.err[0], /Sign-in failed: NotAuthorizedException/);
    assert.equal(w.posts.length, 0);
  });
});

describe('post-events: input files', () => {
  test('the local-only export, a server export (events carry recvAt) and a build-events file are all accepted', async () => {
    const stored = events(2).map((e) => ({ ...e, recvAt: '2026-10-05T05:00:00.000-07:00' }));
    const files = {
      'local.json': { exportedAt: '2026-10-05T12:00:00.000Z', count: 2, events: events(2) },
      'server.json': { exportedAt: '2026-10-05T12:00:00.000Z', count: 2, events: stored },
      'built.json': { deviceId: 'd_built', events: events(2) },
    };
    for (const [file, body] of Object.entries(files)) {
      const w = world({ files: { [file]: body } });
      assert.equal(await w.run([file, 'me@example.com']), 0, `${file}: ${w.err.join('\n')}`);
      assert.equal(w.stored().length, 2, file);
      assert.ok(w.posts.every((p) => p.events.every((e) => !('recvAt' in e))), `${file}: recvAt is never sent`);
      assert.equal(w.posts[0].deviceId, file === 'built.json' ? 'd_built' : 'd_7f3a', 'the file\'s device id, else the one in the first timestamp');
    }
  });

  test('a file that is not an events file is refused before anything is asked or sent', async () => {
    const bad = {
      'a.json': [1, 2], 'b.json': { events: 'no' }, 'c.json': { events: [] }, 'd.json': '{not json',
      'e.json': { events: [{ id: 'x', ts: 'yesterday' }] },
    };
    for (const [file, body] of Object.entries(bad)) {
      const w = world({ files: { [file]: body } });
      assert.equal(await w.run([file, 'me@example.com']), 1, file);
      assert.deepEqual(w.fetches, [], file);
      assert.equal(w.prompts.length, 0, file);
    }
    const missing = world();
    assert.equal(await missing.run(['nope.json', 'me@example.com']), 1);
    assert.match(missing.err[0], /Cannot read nope\.json/);
  });

  test('events the API would reject stop the run before the first batch, with the event named', async () => {
    const list = events(450);
    list[300] = { ...list[300], payload: { ...list[300].payload, reps: -3 } };
    const w = world({ files: { 'backup.json': { events: list } } });
    assert.equal(await w.run(), 1);
    assert.match(w.err[0], /nothing was sent/);
    assert.match(w.err[0], new RegExp(`${list[300].id}.*payload\\.reps|${list[300].id}.*reps`));
    assert.deepEqual(w.fetches, []);
  });

  test('prepareEvents puts events in replay order and keeps the originals', () => {
    const [a, b, c] = events(3);
    const out = prepareEvents({ events: [c, a, b] });
    assert.deepEqual(out.events.map((e) => e.id), [a.id, b.id, c.id]);
    assert.equal(out.deviceId, 'd_7f3a');
  });

  test('usage, and the same message as the shell scripts when deploy.env is missing', async () => {
    const w = world();
    assert.equal(await w.run(['only-a-file.json']), 2);
    assert.match(w.err[0], /^usage:/);
    w.deps.loadStackConfig = () => { throw new StackConfigError('private/deploy.env is missing: no stack is selected. Run scripts/init-deploy.sh to create it.'); };
    assert.equal(await w.run(), 2);
    assert.match(w.err.at(-1), /private\/deploy\.env is missing/);
  });
});

describe('post-events and export-data as programs', () => {
  const sandboxes = [];
  afterEach(() => {
    while (sandboxes.length) sandboxes.pop().cleanup();
  });
  const sandbox = (opts) => {
    const s = createSandbox({ nodeScripts: true, ...opts });
    sandboxes.push(s);
    return s;
  };

  for (const [script, args] of [['post-events.mjs', ['backup.json', 'me@example.com']], ['export-data.mjs', ['me@example.com']]]) {
    test(`${script} stops when private/deploy.env is missing or incomplete`, () => {
      const missing = sandbox({ deployEnv: null });
      missing.write('backup.json', JSON.stringify({ events: [makeEvent(1)] }));
      const r = missing.node([`scripts/${script}`, ...args]);
      assert.equal(r.status, 2, r.output);
      assert.match(r.stderr, /private\/deploy\.env is missing/);

      const incomplete = sandbox({ deployEnv: 'STACK=x\n' });
      incomplete.write('backup.json', JSON.stringify({ events: [makeEvent(1)] }));
      const r2 = incomplete.node([`scripts/${script}`, ...args]);
      assert.equal(r2.status, 2, r2.output);
      assert.match(r2.stderr, /incomplete; missing: AWS_REGION/);
      assert.equal(incomplete.calls().length, 0);
    });

    test(`${script} reads the stack named in deploy.env from the AWS CLI, and reports a stack that does not exist`, () => {
      const sb = sandbox({ scenario: { outputs: null } });
      sb.write('backup.json', JSON.stringify({ events: [makeEvent(1)] }));
      const r = sb.node([`scripts/${script}`, ...args]);
      assert.equal(r.status, 2, r.output);
      assert.match(r.stderr, new RegExp(`Could not read the outputs of stack ${STACK} in ${REGION}`));
      const [call] = sb.callsMatching('describe-stacks');
      assert.equal(call.args[call.args.indexOf('--stack-name') + 1], STACK);
    });
  }

  test('post-events.mjs shows the stack and site address and, answered no, sends nothing', () => {
    const sb = sandbox();
    sb.write('backup.json', JSON.stringify({ events: Array.from({ length: 450 }, (_, i) => makeEvent(i + 1)) }));
    const r = sb.node(['scripts/post-events.mjs', 'backup.json', 'me@example.com'], { input: 'n\n' });
    assert.equal(r.status, 0, r.output);
    assert.match(r.stdout, new RegExp(`Stack: {2}${STACK} \\(${REGION}\\)`));
    assert.match(r.stdout, new RegExp(`Site: {3}${OUTPUTS.SiteUrl}`));
    assert.match(r.stdout, /Events: 450 in 3 batches/);
    assert.match(r.stdout, /Not sent/);
    assert.equal(sb.exists('backup.json.posted'), false);
  });
});

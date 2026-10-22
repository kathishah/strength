// Uploads the events in a file to your stack's API. Use it to move local-only workouts to AWS (the backup exported from Settings) and to load
// workouts written with scripts/build-events.mjs.
//
//   node scripts/post-events.mjs <file> you@example.com [--force]
//
// <file> is any JSON file with an `events` array: the local-only export ({ exportedAt, count, events }), a file from export-data.mjs, or
// build-events.mjs output. It goes to the stack named in private/deploy.env (the script reads that stack's outputs with the AWS CLI), and it
// shows the stack, its site address and the event count and asks before sending anything. The PIN comes from a hidden prompt and is never
// written anywhere.
//
// Events are checked first, then sent in replay order in batches of at most 200 (the API's limit), with the accepted and duplicate counts
// reported after each batch. The API skips events it already has, so if a batch fails you can run the same command again. The
// <file>.posted marker is written only after every batch succeeded; with a marker present, --force sends the file again.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { askHidden } from './prompt.mjs';
import { signIn } from './cognito.mjs';
import { StackConfigError, loadStackConfig } from './stack-config.mjs';
import { MAX_BODY_BYTES, MAX_EVENTS_PER_REQUEST, compareTs, parseTs, validateBatch } from '../lambda/events/registry.mjs';

const USAGE = 'usage: node scripts/post-events.mjs <file> <email> [--force]';
const DEVICE_ID_RE = /^[A-Za-z0-9_]{1,32}$/;

// Event timestamps are checked and sorted into replay order (instant, counter, device). Returns { events, deviceId } or { problems }.
// `recvAt` is dropped: the server sets it, and rejects it from clients, so a file exported from a stack can be loaded into another one.
export function prepareEvents(file) {
  if (file === null || typeof file !== 'object' || !Array.isArray(file.events)) {
    return { problems: ['the file has no "events" array'] };
  }
  if (file.events.length === 0) return { problems: ['the file has no events'] };
  const problems = [];
  const events = [];
  file.events.forEach((ev, i) => {
    if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) {
      problems.push(`event ${i + 1}: must be an object`);
    } else if (!parseTs(ev.ts)) {
      problems.push(`event ${i + 1}: "ts" is missing or malformed`);
    } else {
      const { recvAt, ...rest } = ev; // eslint-disable-line no-unused-vars
      events.push(rest);
    }
  });
  if (problems.length > 0) return { problems };
  events.sort((a, b) => compareTs(a.ts, b.ts));
  // The API wants a device id with the batch; use the file's, else the one in the oldest event's timestamp.
  const deviceId = typeof file.deviceId === 'string' && DEVICE_ID_RE.test(file.deviceId) ? file.deviceId : parseTs(events[0].ts).deviceId;
  return { events, deviceId };
}

// Splits events into consecutive batches of at most `maxEvents` events whose request body stays under `maxBytes`.
export function planBatches(events, deviceId, { maxEvents = MAX_EVENTS_PER_REQUEST, maxBytes = Math.floor(MAX_BODY_BYTES * 0.9) } = {}) {
  const overhead = Buffer.byteLength(JSON.stringify({ deviceId, events: [] }));
  const batches = [];
  let current = [];
  let size = overhead;
  for (const ev of events) {
    const bytes = Buffer.byteLength(JSON.stringify(ev)) + 1;
    if (current.length > 0 && (current.length >= maxEvents || size + bytes > maxBytes)) {
      batches.push(current);
      current = [];
      size = overhead;
    }
    current.push(ev);
    size += bytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function defaultAsk(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

// Returns the exit code. `deps` lets tests replace the network, the prompts, the stack lookup and the files.
export async function main(argv, deps = {}) {
  const d = {
    fetch: globalThis.fetch,
    askHidden,
    ask: defaultAsk,
    loadStackConfig,
    now: Date.now,
    exists: existsSync,
    readFile: (f) => readFileSync(f, 'utf8'),
    writeFile: writeFileSync,
    out: (m) => console.log(m),
    err: (m) => console.error(m),
    ...deps,
  };

  const force = argv.includes('--force');
  const [file, email] = argv.filter((a) => !a.startsWith('--'));
  if (!file || !email) { d.err(USAGE); return 2; }

  let stack;
  try {
    stack = d.loadStackConfig();
  } catch (err) {
    if (!(err instanceof StackConfigError)) throw err;
    d.err(err.message);
    return 2;
  }

  const marker = `${file}.posted`;
  if (d.exists(marker) && !force) {
    d.err(`${file} was already posted (${marker}). The API skips events it already has, so sending it again is harmless; use --force to send anyway.`);
    return 1;
  }

  let parsed;
  try {
    parsed = JSON.parse(d.readFile(file));
  } catch (err) {
    d.err(`Cannot read ${file}: ${err.message}`);
    return 1;
  }
  const prepared = prepareEvents(parsed);
  if (prepared.problems) {
    d.err(`${file} cannot be sent:\n  ${prepared.problems.slice(0, 10).join('\n  ')}`);
    return 1;
  }
  const { events, deviceId } = prepared;
  const batches = planBatches(events, deviceId);

  // Check every batch the way the API will, so a bad event stops the run before anything is sent.
  const invalid = [];
  let offset = 0;
  for (const batch of batches) {
    for (const e of validateBatch({ deviceId, events: batch }, d.now()).errors) {
      invalid.push(`event ${(e.index ?? 0) + offset + 1}${e.id ? ` (${e.id})` : ''}: ${e.field} ${e.reason}`);
    }
    offset += batch.length;
  }
  if (invalid.length > 0) {
    d.err(`${file} has events the API would reject; nothing was sent:\n  ${invalid.slice(0, 10).join('\n  ')}`);
    if (invalid.length > 10) d.err(`  ... and ${invalid.length - 10} more`);
    return 1;
  }

  d.out(`Stack:  ${stack.STACK} (${stack.AWS_REGION})`);
  d.out(`Site:   ${stack.SITE_URL}`);
  d.out(`File:   ${file}`);
  d.out(`Events: ${events.length} in ${batches.length} ${batches.length === 1 ? 'batch' : 'batches'} (at most ${MAX_EVENTS_PER_REQUEST} each, oldest first)`);
  const answer = await d.ask(`Send them to ${stack.STACK}? [y/N] `);
  if (answer.trim().toLowerCase() !== 'y') { d.out('Not sent.'); return 0; }

  const pin = await d.askHidden('PIN: '); // not echoed
  let token;
  try {
    token = await signIn(stack.config, email, pin, d.fetch);
  } catch (err) {
    d.err(err.message);
    return 1;
  }

  const totals = { accepted: 0, duplicates: 0 };
  let sent = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const label = `Batch ${i + 1} of ${batches.length} (events ${sent + 1}-${sent + batch.length})`;
    let result;
    try {
      const res = await d.fetch(new URL('/events', stack.config.apiUrl), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, events: batch }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`the API answered ${res.status} ${text.slice(0, 300)}`);
      result = JSON.parse(text);
    } catch (err) {
      d.err(`${label} failed: ${err.message}`);
      d.err(`${sent} of ${events.length} events were sent before it (${totals.accepted} accepted, ${totals.duplicates} already there). ` +
        'No .posted marker was written. The API skips events it already has, so run the same command again to continue.');
      return 1;
    }
    sent += batch.length;
    totals.accepted += result.accepted ?? 0;
    totals.duplicates += result.duplicates ?? 0;
    d.out(`${label}: accepted ${result.accepted}, duplicates ${result.duplicates}`);
  }

  d.out(`Done: ${events.length} events sent in ${batches.length} ${batches.length === 1 ? 'batch' : 'batches'}; ${totals.accepted} accepted, ${totals.duplicates} duplicates.`);
  d.writeFile(marker, `${new Date(d.now()).toISOString()} ${JSON.stringify({ events: events.length, batches: batches.length, ...totals })}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}

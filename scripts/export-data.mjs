// Exports everything in your log (spec 6.7, v1.17: a script, not a screen). Signs in to Cognito, reads all events with GET /events, and
// writes two files into the output folder (default private/export/, git-ignored):
//   strength-events-<date>.json   { exportedAt, count, events }  (as stored; replaying them rebuilds everything)
//   strength-sets-<date>.csv      one row per logged working set, edits applied and deleted sets left out
//
//   node scripts/export-data.mjs you@example.com [out-dir]
//
// Read-only: it only calls GET /events. The PIN comes from a hidden prompt and is never written anywhere.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { askHidden } from './prompt.mjs';
import { config, isConfigured } from '../app/js/config.js';
import { pacificDate } from '../app/js/time.js';
import { eventsToCsv, fetchAllEvents } from './export-lib.mjs';

const [email, outDir = 'private/export'] = process.argv.slice(2);
if (!email) { console.error('usage: node scripts/export-data.mjs <email> [out-dir]'); process.exit(2); }
if (!isConfigured()) { console.error('Fill in app/js/config.js first (BUILD.md step 6).'); process.exit(2); }

const pin = await askHidden('PIN: ');
const auth = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
  body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: config.userPoolClientId, AuthParameters: { USERNAME: email, PASSWORD: pin } }),
}).then((r) => r.json());
const token = auth.AuthenticationResult?.IdToken;
if (!token) { console.error(`Sign-in failed: ${auth.__type ?? auth.ChallengeName ?? 'unknown'}`); process.exit(1); }

const events = await fetchAllEvents(async (path) => {
  const res = await fetch(new URL(path, config.apiUrl), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]} failed: ${res.status}`);
  return res.json();
});

mkdirSync(outDir, { recursive: true });
const day = pacificDate(Date.now());
const jsonFile = join(outDir, `strength-events-${day}.json`);
const csvFile = join(outDir, `strength-sets-${day}.csv`);
writeFileSync(jsonFile, `${JSON.stringify({ exportedAt: new Date().toISOString(), count: events.length, events }, null, 2)}\n`);
const csv = eventsToCsv(events);
writeFileSync(csvFile, csv);
console.log(`${events.length} events -> ${jsonFile}`);
console.log(`${csv.trimEnd().split('\n').length - 1} sets -> ${csvFile}`);

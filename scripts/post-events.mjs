// Signs in to Cognito and POSTs an events file (from build-events.mjs) to the API.
//   node scripts/post-events.mjs private/workout.events.json you@example.com
// Reads the PIN from a hidden prompt; it is never written anywhere. Asks before sending.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { config, isConfigured } from '../app/js/config.js';

const [file, email] = process.argv.slice(2);
if (!file || !email) { console.error('usage: node scripts/post-events.mjs <events.json> <email>'); process.exit(2); }
if (!isConfigured()) { console.error('Fill in app/js/config.js first (BUILD.md step 6).'); process.exit(2); }

const body = JSON.parse(readFileSync(file, 'utf8'));
const rl = createInterface({ input: process.stdin, output: process.stdout });
const stty = (arg) => spawnSync('stty', [arg], { stdio: ['inherit', 'ignore', 'ignore'] });

stty('-echo');
const pin = await rl.question('PIN: ');
stty('echo');
console.log();

const auth = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
  body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: config.userPoolClientId, AuthParameters: { USERNAME: email, PASSWORD: pin } }),
}).then((r) => r.json());
const token = auth.AuthenticationResult?.IdToken;
if (!token) { console.error(`Sign-in failed: ${auth.__type ?? auth.ChallengeName ?? 'unknown'}`); process.exit(1); }

const answer = await rl.question(`Post ${body.events.length} events to ${config.apiUrl}? [y/N] `);
rl.close();
if (answer.trim().toLowerCase() !== 'y') { console.log('Not sent.'); process.exit(0); }

const res = await fetch(new URL('/events', config.apiUrl), {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
console.log(res.status, await res.text());

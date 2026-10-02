#!/usr/bin/env node
// Downloads every exercise image listed in scripts/image-sources.json (exercise id -> source URL) into app/img/<id>.<ext>,
// unchanged, so the app serves them from its own site (spec 4.5.3). Re-run it to refresh or to fetch a newly added exercise.
// Usage: node scripts/fetch-images.mjs [--force]   (--force downloads files that already exist)
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const root = new URL('../', import.meta.url);
const sources = JSON.parse(readFileSync(new URL('scripts/image-sources.json', root), 'utf8'));
const dir = new URL('app/img/', root);
const force = process.argv.includes('--force');
mkdirSync(dir, { recursive: true });

let failed = 0;
for (const [id, url] of Object.entries(sources)) {
  const ext = extname(new URL(url).pathname).toLowerCase() || '.gif';
  const file = new URL(`${id}${ext}`, dir);
  if (!force && existsSync(file)) { console.log(`have  ${id}${ext}`); continue; }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) throw new Error(`${res.status} ${res.headers.get('content-type')}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, bytes);
    console.log(`saved ${id}${ext} (${Math.round(bytes.length / 1024)} KB)`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${id}: ${err.message}  ${url}`);
  }
}
process.exit(failed ? 1 : 0);

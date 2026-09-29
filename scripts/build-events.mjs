// Turns a workout description (JSON) into a POST /events body that passes the server's validators.
//   node scripts/build-events.mjs private/workout.json > private/workout.events.json
// Times in the description are US Pacific local times.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { pacificIso } from '../lambda/events/time.mjs';
import { validateBatch } from '../lambda/events/registry.mjs';
import { ulid } from '../app/js/ids.js';

// "2026-09-28" + "11:00" (Pacific) -> epoch ms, correct on either side of a daylight-saving change.
export function pacificLocalToMs(date, time) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  let guess = asUtc + 8 * 3600_000;
  for (let i = 0; i < 3; i++) {
    const off = pacificIso(guess).slice(-6); // "-07:00"
    const offMs = (off[0] === '-' ? -1 : 1) * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4, 6))) * 60_000;
    guess = asUtc - offMs;
  }
  return guess;
}

// spec: { date, startTime, endTime, templateCode, programWeek, phase, deviceId, programStartDate?,
//         exercises: [{ exerciseId, weightLbs, suggestedWeightLbs, reps: [..] }] }
export function buildEvents(spec) {
  const start = pacificLocalToMs(spec.date, spec.startTime);
  const end = pacificLocalToMs(spec.date, spec.endTime);
  let counter = 0;
  const events = [];
  const add = (ms, type, entityId, payload) => {
    events.push({
      id: ulid(ms),
      ts: `${pacificIso(ms)}-${String(counter++).padStart(4, '0')}-${spec.deviceId}`,
      v: 1, type, entityId, payload,
    });
    return events.at(-1);
  };

  if (spec.programStartDate) {
    add(start - 5 * 60_000, 'setting.changed', 'settings', { key: 'programStartDate', value: spec.programStartDate });
  }
  const session = add(start, 'session.started', `sess_${ulid(start)}`, {
    templateCode: spec.templateCode, startedAt: pacificIso(start), programWeek: spec.programWeek,
    phase: spec.phase, isDeload: false,
  });

  const totalSets = spec.exercises.reduce((n, e) => n + e.reps.length, 0);
  const step = (end - start - 4 * 60_000) / totalSets; // spread sets over the session
  let n = 0;
  for (const ex of spec.exercises) {
    ex.reps.forEach((reps, i) => {
      const ms = Math.round(start + 2 * 60_000 + step * n++);
      add(ms, 'set.logged', `set_${ulid(ms)}`, {
        sessionId: session.entityId, exerciseId: ex.exerciseId, setNumber: i + 1,
        isRampUp: false, isCalibration: true, weightLbs: ex.weightLbs, reps,
        suggestedWeightLbs: ex.suggestedWeightLbs, suggestionSource: 'starting', completed: true,
      });
    });
  }
  add(end, 'session.finished', session.entityId, { finishedAt: pacificIso(end) });

  const body = { deviceId: spec.deviceId, events };
  const { errors } = validateBatch(body, Date.now());
  if (errors.length) throw new Error(`invalid events: ${JSON.stringify(errors.slice(0, 5))}`);
  return body;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/build-events.mjs <workout.json>'); process.exit(2); }
  process.stdout.write(`${JSON.stringify(buildEvents(JSON.parse(readFileSync(file, 'utf8'))), null, 2)}\n`);
}

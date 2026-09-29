// Program calendar (spec 5.1 and 5.8): program week, phase, target effort and deload weeks. Pure.
//
// Scheduled deloads are computed, not stored (DEPLOYMENT-PLAN.md section 14, decision 2). Events record only
// choices: a manual start ("Start deload week now") and a postponement. The engine walks the weeks from 1 and
// applies them:
//   - the first deload is week 11; after any deload the next one is 7 weeks later;
//   - a `deload.started` record at week W makes W a deload and restarts the schedule (next = W + 7);
//   - a `deload.postponed` record moves the deload that was due in `postponedFromWeek` to `programWeek`
//     (next = that week + 7 once it happens); a record whose from-week is not the deload due is out of date and ignored.

import { PROGRAM } from '../seed/rules.js';
import { daysBetween } from '../time.js';

// Program week of a Pacific calendar day (spec 5.1): weeks elapsed since programStartDate, counted in calendar days,
// so the start day is week 1. Before the start date the spec is silent; the week is 1 and `beforeStart` is true.
export function programWeekInfo(programStartDate, today) {
  const days = daysBetween(programStartDate, today);
  return days < 0 ? { week: 1, beforeStart: true } : { week: Math.floor(days / 7) + 1, beforeStart: false };
}

export const programWeek = (programStartDate, today) => programWeekInfo(programStartDate, today).week;

export const phaseOf = (week) => (week <= PROGRAM.phase1Weeks ? 1 : 2);

// Target reps in reserve (spec 5.1, 5.8): Phase 1 about 3, Phase 2 1-2, deload 3-4.
export function targetRir(phase, isDeload) {
  if (isDeload) return { min: 3, max: 4 };
  return phase === 1 ? { min: 3, max: 3 } : { min: 1, max: 2 };
}

// What the deload records say, in a form the walk can use.
function readRecords(deloads) {
  const started = new Set(); // weeks a deload was started in (manual, or scheduled written as an event)
  const movedTo = new Map(); // postponedFromWeek -> the week it moved to
  for (const rec of Object.values(deloads ?? {})) {
    if (!Number.isInteger(rec?.programWeek)) continue;
    if (rec.source === 'manual' || rec.source === 'scheduled') started.add(rec.programWeek);
    if (Number.isInteger(rec.postponedFromWeek) && rec.programWeek > rec.postponedFromWeek) {
      movedTo.set(rec.postponedFromWeek, rec.programWeek);
    }
  }
  return { started, movedTo };
}

// The deload weeks among weeks 1..through, and the week of the deload due after them.
function walk(deloads, through) {
  const { started, movedTo } = readRecords(deloads);
  const weeks = [];
  let next = PROGRAM.firstDeloadWeek;
  for (let w = 1; w <= through; w++) {
    if (started.has(w)) {
      weeks.push(w);
      next = w + PROGRAM.deloadGapWeeks;
    } else if (w === next) {
      if (movedTo.has(w)) {
        next = movedTo.get(w);
      } else {
        weeks.push(w);
        next = w + PROGRAM.deloadGapWeeks;
      }
    }
  }
  while (movedTo.has(next)) next = movedTo.get(next); // a deload already moved before the walk got to it
  return { weeks, next, started, movedTo };
}

export const deloadWeeks = (deloads, throughWeek) => walk(deloads, throughWeek).weeks;

export const isDeloadWeek = (deloads, week) => walk(deloads, week).weeks.includes(week);

// The first deload week after `week` (spec 5.7: manual deload in week 9 -> next is week 16).
export function nextDeloadWeek(deloads, week) {
  const { next, started } = walk(deloads, week);
  const later = [...started].filter((w) => w > week);
  return Math.min(next, ...later);
}

// The scheduled deload that "Postpone 1 week" would move, or null (spec 5.8: allowed once per scheduled deload).
// Only the scheduled deload of the current week can be postponed: not one the user started, and not one that was
// already moved.
export function postponement(deloads, week) {
  const { weeks, started, movedTo } = walk(deloads, week);
  if (!weeks.includes(week) || started.has(week)) return null;
  for (const to of movedTo.values()) if (to === week) return null;
  return { programWeek: week + 1, postponedFromWeek: week }; // the deload.postponed payload
}

// Everything the screens need about the calendar for one day.
//   programStartDate: from the settings (or the spec's initial value); today: Pacific "yyyy-mm-dd".
export function calendarFor({ settings, deloads, today }) {
  const programStartDate = settings?.programStartDate ?? PROGRAM.defaultProgramStartDate;
  const { week, beforeStart } = programWeekInfo(programStartDate, today);
  const phase = phaseOf(week);
  const isDeload = isDeloadWeek(deloads, week);
  return {
    today,
    programStartDate,
    programWeek: week,
    beforeStart,
    phase,
    isDeload,
    targetRir: targetRir(phase, isDeload),
    nextDeloadWeek: nextDeloadWeek(deloads, week),
    canPostpone: postponement(deloads, week) !== null,
  };
}

// Program calendar (spec 5.1): program week, phase and target effort. Pure. (Deload weeks, spec 5.8, were removed in v1.13.)

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

// Target reps left at the end of a set (spec 5.1, "reps in reserve"): Phase 1 about 3, Phase 2 1-2. Shown in plain words.
export const targetRir = (phase) => (phase === 1 ? { min: 3, max: 3 } : { min: 1, max: 2 });

// settings: replay(...).settings; today: Pacific "yyyy-mm-dd".
export function calendarFor({ settings, today }) {
  const programStartDate = settings?.programStartDate ?? PROGRAM.defaultProgramStartDate;
  const { week, beforeStart } = programWeekInfo(programStartDate, today);
  const phase = phaseOf(week);
  return { today, programStartDate, programWeek: week, beforeStart, phase, targetRir: targetRir(phase) };
}

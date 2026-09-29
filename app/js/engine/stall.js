// Stall detection (spec 5.10). Pure.
//
// An exercise is stalled when the reduction rule (5.2 rule 2) has fired 2 or more times within the last 9 weeks.
// A firing is a completed session whose sets were logged with suggestionSource "reduction" (plan section 14, decision
// 5), plus the suggestion being made now if it is a reduction. The span is the 63 days before `today`, so a
// reduction clears after 9 weeks. Deload sessions are not history, so they never count.

import { PROGRAM } from '../seed/rules.js';
import { daysBetween } from '../time.js';

export function stallInfo(hist, today, { reducingNow = false } = {}) {
  const spanDays = PROGRAM.stallWeeks * 7;
  const logged = hist.filter((h) => h.reductionLogged && daysBetween(h.date, today) < spanDays).length;
  const recentReductions = logged + (reducingNow ? 1 : 0);
  return { stalled: recentReductions >= PROGRAM.stallReductions, recentReductions };
}

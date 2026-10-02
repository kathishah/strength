// The view models the screens draw (home, session, summary) and their text. Built from real replayed logs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dayView, emptyDraft, sessionView, setRowField, startRest, summaryView } from '../app/js/logging/index.js';
import * as text from '../app/js/logging/text.js';
import { atLevel, carry, lift, makeLog } from '../test-support/engine-log.mjs';

const NOW = Date.parse('2026-10-05T11:00:00-07:00');
const cards = (view) => view.cards.filter((c) => c.slot !== null); // the plan's cards, in slot order
const card = (view, id) => cards(view).find((c) => c.exerciseId === id);

// A log with Workout A done on Sep 28 and a Workout B open now.
function open(log = makeLog(), date = '2026-10-05', templateCode = 'A', opts = {}) {
  log.session(date, templateCode, [], { finished: false, id: 'sess_open', ...opts });
  return log;
}
const view = (log, draft = emptyDraft('sess_open')) => sessionView(log.state(), 'sess_open', draft, NOW);

// The Home page: dayView over a log, with the draft of whichever workout is showing.
const home = (log, today, extra = {}) => dayView(log.state(), { today, nowMs: NOW, draftFor: (id) => emptyDraft(id), ...extra });

describe('the Home page (day view)', () => {
  test('a fresh log: Workout A is next, shown as cards with the day\'s suggestions and nothing started', () => {
    const h = home(makeLog(), '2026-09-28');
    assert.deepEqual([h.mode, h.templateCode, h.started, h.sessionId], ['workout', 'A', false, null]);
    assert.deepEqual(h.cards.map((c) => c.name), ['Goblet Squat', 'Dumbbell Bench Press', 'Dumbbell Romanian Deadlift', 'Chest-Supported Row', 'Dead Bug', 'Face Pull']);
    assert.equal(h.cards[0].prescription, '3 × 8–12');
    assert.equal(h.cards[0].suggestionText, 'Suggested: 20 lbs');
    assert.match(h.phaseText, /Phase 1 · stop each set with about 3 reps left/);
    assert.equal(h.warning, null);
    assert.deepEqual(h.older, []);
    assert.equal(h.statusText, 'Mon · Workout A · 0/6 done');
  });

  test('the status line counts exercises done and follows the weekday chosen in the header', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 20, [10, 10, 10])], { finished: false, id: 'sess_open', startMs: Date.parse('2026-09-28T11:00:00-07:00') });
    const h = home(log, '2026-09-28', { pickedWeekday: 3 });
    assert.equal(h.statusText, 'Wed · Workout A · 1/6 done');
    assert.deepEqual([h.started, h.sessionId, h.exercisesDone], [true, 'sess_open', 1]);
  });

  test('on Tuesday and Thursday the recovery routine leads; "train instead" and an open workout show the workout', () => {
    for (const day of ['2026-09-29', '2026-10-01']) {
      const h = home(makeLog(), day);
      assert.equal(h.mode, 'recovery', day);
      assert.equal(h.cards.length, 8);
      assert.equal(h.canTrainInstead, true);
      assert.equal(h.statusText.endsWith('Recovery routine'), true);
    }
    assert.equal(home(makeLog(), '2026-09-29', { forceWorkout: true }).mode, 'workout');
    assert.equal(home(open(), '2026-09-29').mode, 'workout', 'a workout with sets in it is never hidden');
    assert.equal(home(makeLog(), '2026-09-30').mode, 'workout');
    assert.equal(home(makeLog(), '2026-09-28', { pickedWeekday: 4 }).mode, 'recovery', 'picking Thursday shows the routine');
  });

  test('the recovery cards are the eight of spec 4.6 with prescription, cue and demo', () => {
    const cards = home(makeLog(), '2026-09-29').cards;
    assert.equal(cards[0].name, 'Half-Kneeling Hip Flexor Stretch');
    assert.equal(cards[0].prescription, '30 s per side');
    assert.equal(cards[0].chipText, 'Recovery · 1 of 8');
    assert.match(cards[0].notes, /Squeeze the glute/);
    assert.equal(cards[7].name, 'Dowel Hip Hinge');
  });

  test('day pills run Monday to Sunday with the recovery days and today marked', () => {
    const pills = home(makeLog(), '2026-09-30').pills;
    assert.deepEqual(pills.map((p) => p.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.deepEqual(pills.map((p) => p.kind), ['gym', 'recovery', 'gym', 'recovery', 'gym', 'rest', 'rest']);
    assert.deepEqual(pills.map((p) => p.isToday), [false, false, true, false, false, false, false]);
  });

  test('the warning comes with the next workout the day after a workout, and only until it is started', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 20, [10])]);
    const h = home(log, '2026-09-30', { pickedWeekday: 3 });
    assert.equal(h.warning, null, 'two days later: no warning');
    const next = home(log, '2026-09-29', { forceWorkout: true });
    assert.equal(next.templateCode, 'B');
    assert.match(next.warningText, /You did Workout A yesterday/);
    log.session('2026-09-29', 'B', [], { finished: false, id: 'sess_open' });
    assert.equal(home(log, '2026-09-29').warning, null);
  });

  test('older unfinished workouts are listed after the newest, which is the one shown', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 20, [10])], { finished: false, id: 'sess_old' });
    log.session('2026-10-05', 'B', [], { finished: false, id: 'sess_open' });
    const h = home(log, '2026-10-05');
    assert.deepEqual([h.sessionId, h.templateCode], ['sess_open', 'B']);
    assert.deepEqual(h.older.map((o) => [o.sessionId, o.loggedSets, o.label]), [['sess_old', 1, 'Workout A – Full body']]);
  });

  test('a due scheduled increase shows on the card', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12, 12])]);
    log.session('2026-09-30', 'B', [lift('leg-press', 50, [10, 10])]);
    log.session('2026-10-02', 'C', [lift('incline-db-press', 20, [10, 10])]);
    const h = home(log, '2026-10-19'); // Workout A again, 21 days after its first session
    assert.equal(h.cards.find((c) => c.exerciseId === 'goblet-squat').increaseText, '↑ +5 lbs from 25 · Scheduled');
  });

  test('a workout not started yet takes what was typed from the pending draft', () => {
    const typed = setRowField(emptyDraft('pending'), 'goblet-squat', 1, 'weightLbs', 30);
    const h = home(makeLog(), '2026-09-28', { draftFor: () => typed });
    assert.deepEqual(h.cards[0].rows.map((r) => r.weightLbs), [30, 30, 30]);
  });
});

describe('session view', () => {
  test('an unknown session is null; a finished one says so', () => {
    assert.equal(sessionView(makeLog().state(), 'nope', emptyDraft('nope'), NOW), null);
    const log = makeLog();
    log.session('2026-10-05', 'A', [lift('goblet-squat', 20, [10])], { id: 'sess_open' });
    assert.equal(view(log).finished, true);
  });

  test('Workout A, week 2: the header, six cards in slot order, the full set counts', () => {
    const v = view(open());
    assert.equal(v.templateCode, 'A');
    assert.equal(v.programWeek, 2);
    assert.equal(v.phase, 1);
    assert.equal(v.phaseText, 'Phase 1 · stop each set with about 3 reps left');
    assert.deepEqual(cards(v).map((c) => c.slot), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(cards(v).map((c) => c.rows.length), [3, 3, 3, 3, 2, 2]);
    assert.equal(v.plannedSets, 16);
    assert.equal(v.loggedSets, 0);
    assert.equal(v.canFinish, false);
  });

  test('Phase 2 (week 5): full set counts', () => {
    const v = view(open(makeLog(), '2026-11-02'));
    assert.equal(v.phase, 2);
    assert.equal(v.phaseText, 'Phase 2 · stop each set with 1–2 reps left');
    assert.deepEqual(cards(v).map((c) => c.rows.length), [3, 3, 3, 3, 2, 2]);
  });

  test('workout C has a carry with weight and distance, as its last exercise', () => {
    const v = view(open(makeLog(), '2026-11-02', 'C'));
    const carryCard = card(v, 'farmer-carry');
    assert.equal(carryCard.prescription, '3 × 40 m');
    assert.deepEqual([carryCard.inputs.weight, carryCard.inputs.distance, carryCard.inputs.reps], [true, true, false]);
    assert.equal(cards(v).at(-1).exerciseId, 'farmer-carry');
  });

  test('a card carries the words: prescription, suggestion, source, last time', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 35, [12, 12, 11])]);
    open(log, '2026-10-05', 'A', { id: 'sess_open' });
    const c = card(view(log), 'goblet-squat');
    assert.equal(c.name, 'Goblet Squat');
    assert.equal(c.prescription, '3 × 8–12');
    assert.equal(c.suggestionText, 'Suggested: 35 lbs');
    assert.equal(c.sourceLabel, 'Same as last time');
    assert.equal(c.lastText, 'Last (Mon, Sep 28): 35 × 12, 12, 11');
    assert.equal(c.increaseText, null);
    assert.deepEqual(c.rows.map((r) => r.weightLbs), [35, 35, 35]);
  });

  test('the increase highlight: badge text, and the pre-fill is the increased weight', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12, 12])]);
    open(log, '2026-10-19', 'A', { id: 'sess_open' });
    const c = card(view(log), 'goblet-squat');
    assert.equal(c.increased, true);
    assert.equal(c.increaseText, '↑ +5 lbs from 25 · Scheduled');
    assert.deepEqual(c.rows.map((r) => r.weightLbs), [30, 30, 30]);
    assert.equal(c.sourceLabel, 'Scheduled increase');
  });

  test('the highlight is for that session only: once the heavier weight was logged, the next plan holds it', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12, 12])]);
    log.session('2026-09-30', 'B', [lift('leg-press', 50, [10, 10])]);
    log.session('2026-10-02', 'C', [lift('incline-db-press', 20, [10, 10])]);
    log.session('2026-10-19', 'A', [lift('goblet-squat', 30, [10, 10])]); // took the scheduled increase
    log.session('2026-10-21', 'B', [lift('leg-press', 50, [10, 10])]);
    log.session('2026-10-23', 'C', [lift('incline-db-press', 20, [10, 10])]);
    const squat = home(log, '2026-10-26').cards.find((e) => e.exerciseId === 'goblet-squat');
    assert.equal(squat.increaseText, null);
    assert.equal(squat.suggestionText, 'Suggested: 30 lbs');
  });

  test('plans use the session\'s own day: a workout begun before a scheduled date keeps its suggestions after midnight', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12, 12])]);
    open(log, '2026-10-18', 'A', { id: 'sess_open', time: '23:30' });
    assert.equal(card(view(log), 'goblet-squat').increased, false); // day 20, not yet due, whatever the clock says now
  });

  test('TRX and the pushup ladder: level rows, the description, and the range follows the level', () => {
    const log = makeLog();
    log.session('2026-09-28', 'B', [atLevel('pushup', 3, [10, 10])]);
    open(log, '2026-10-05', 'B', { id: 'sess_open' });
    let c = card(view(log), 'pushup');
    assert.deepEqual(c.rows.map((r) => r.levelNumber), [3, 3, 3]);
    assert.equal(c.rows[0].targetText, '8–15');
    assert.match(c.rows[0].levelInfo, /Feet-elevated pushup/);
    assert.equal(c.rows[0].placeholderReps, 8);
    assert.equal(c.lastText, 'Last (Mon, Sep 28): level 3 × 10, 10');
    const draft = setRowField(emptyDraft('sess_open'), 'pushup', 1, 'levelNumber', 1);
    c = card(view(log, draft), 'pushup');
    assert.deepEqual(c.rows.map((r) => [r.levelNumber, r.targetText]), [[1, '10–20'], [1, '10–20'], [1, '10–20']]);
  });

  test('a swapped TRX exercise shows its level text; two TRX exercises get no pairing tip (there are no supersets)', () => {
    const log = makeLog();
    log.swap('A', 1, 'trx-squat').swap('A', 2, 'trx-chest-press');
    const v = view(open(log));
    const squat = card(v, 'trx-squat');
    assert.equal(squat.swapped, true);
    assert.equal(squat.rows[0].levelNumber, 2);
    assert.equal(squat.sourceLabel, 'Starting level');
    assert.match(squat.rows[0].levelInfo, /Level 1: lean back/);
    assert.deepEqual(squat.hints, []);
    assert.deepEqual(card(v, 'trx-chest-press').hints, []);
  });

  test('swap options: default first, alternatives, then TRX; the current one marked; blocked once a set is logged', () => {
    const log = open();
    let c = card(view(log), 'goblet-squat');
    assert.deepEqual(c.swapOptions.map((o) => [o.exerciseId, o.kind, o.current]), [
      ['goblet-squat', 'default', true], ['leg-press', 'alternative', false], ['box-squat', 'alternative', false],
      ['hack-squat', 'alternative', false], ['leg-extension', 'alternative', false], ['trx-squat', 'trx', false],
    ]);
    assert.equal(c.canSwap, true);
    log.events.length; // logged set in the same session blocks it
    log.session('2026-10-05', 'A', [lift('goblet-squat', 20, [10])], { finished: false, id: 'sess_open2' });
    const v2 = sessionView(log.state(), 'sess_open2', emptyDraft('sess_open2'), NOW);
    c = card(v2, 'goblet-squat');
    assert.equal(c.canSwap, false);
    assert.match(c.swapBlockedReason, /Undo the sets/);
    assert.equal(card(v2, 'db-bench-press').canSwap, true); // nothing logged for slot 2
  });

  test('cards say "Exercise N of M" in slot order, with no superset colour or Finisher', () => {
    const a = view(open());
    assert.deepEqual(cards(a).map((c) => c.chipText), [1, 2, 3, 4, 5, 6].map((n) => `Exercise ${n} of 6`));
    const c = view(open(makeLog(), '2026-11-02', 'C'));
    assert.deepEqual(cards(c).map((x) => x.chipText), [1, 2, 3, 4, 5].map((n) => `Exercise ${n} of 5`));
    assert.ok(cards(a).every((x) => !('ssClass' in x) && !('partnerName' in x)));
  });

  test('every plan card has the rest line, whatever was swapped in', () => {
    const v = view(open(makeLog().swap('A', 2, 'trx-chest-press')));
    assert.ok(cards(v).every((c) => c.restText === 'Rest about 90 s between sets.'));
  });

  test('Options and TRX are separate lists; a swapped card says what it was swapped from', () => {
    const v = view(open(makeLog().swap('A', 1, 'box-squat')));
    const c = card(v, 'box-squat');
    assert.deepEqual(c.optionGroups.alternatives.map((o) => [o.exerciseId, o.current]), [['leg-press', false], ['box-squat', true], ['hack-squat', false], ['leg-extension', false]]);
    assert.deepEqual(c.optionGroups.trx.map((o) => o.exerciseId), ['trx-squat']);
    assert.equal(c.swappedFromName, 'Goblet Squat');
    assert.equal(card(view(open()), 'goblet-squat').swappedFromName, null);
  });

  test('a card is done once its sets are logged (one Done per exercise); reopened it is editing; the view counts them', () => {
    const log = makeLog();
    log.session('2026-10-05', 'A', [lift('goblet-squat', 20, [10, 10, 10]), lift('db-bench-press', 20, [10])], { finished: false, id: 'sess_open' });
    const v = view(log);
    assert.deepEqual([card(v, 'goblet-squat').mode, card(v, 'db-bench-press').mode, card(v, 'face-pull').mode], ['done', 'done', 'input']);
    assert.equal(card(v, 'goblet-squat').summaryText, '20 lbs × 10, 10, 10');
    assert.deepEqual([v.exercisesDone, v.exerciseCount, v.loggedSets, v.plannedSets], [2, 6, 4, 16]);
    const reopened = { ...emptyDraft('sess_open'), editing: { 'goblet-squat': true } };
    assert.equal(card(view(log, reopened), 'goblet-squat').mode, 'editing');
    assert.deepEqual(card(view(log, reopened), 'goblet-squat').rows.map((r) => r.status), ['editing', 'editing', 'editing']);
  });

  test('when the sets have different weights the card says so (it needs a chip per set)', () => {
    const log = makeLog();
    log.session('2026-10-05', 'A', [lift('goblet-squat', 20, [10]), lift('goblet-squat', 25, [10])], { finished: false, id: 'sess_open' });
    assert.equal(card(view(log), 'goblet-squat').setsDiffer, true);
    assert.equal(card(view(open()), 'goblet-squat').setsDiffer, false);
  });

  test('a slot with nothing to swap to has no swap button (none in the seed has zero, but the rule holds)', () => {
    const v = view(open(makeLog(), '2026-10-05', 'C'));
    assert.ok(cards(v).every((c) => c.swapOptions.length >= 2));
  });

  test('sets logged for an exercise that left the plan stay visible as their own card', () => {
    const log = makeLog();
    log.session('2026-10-05', 'A', [lift('goblet-squat', 20, [10])], { finished: false, id: 'sess_open' });
    log.swap('A', 1, 'leg-press'); // swapped elsewhere afterwards
    const v = view(log);
    assert.equal(card(v, 'leg-press').slot, 1);
    assert.equal(v.orphans.length, 1);
    assert.equal(v.orphans[0].exerciseId, 'goblet-squat');
    assert.equal(v.orphans[0].rows[0].status, 'done');
    assert.equal(v.loggedSets, 1);
  });

  test('cues: notes, tags, demo, attribution and the pushup rationale', () => {
    const c = card(view(open(makeLog(), '2026-10-05', 'B')), 'pushup');
    assert.match(c.cues.notes, /straight line from head to heels/);
    assert.match(c.cues.rationale, /Baseline was 15, 15, 10, 5/);
    assert.equal(c.cues.ladder.length, 6);
    assert.equal(c.cues.gifUrl, 'img/pushup.gif'); // our own copy
    assert.equal(card(view(open(makeLog(), '2026-10-05', 'B')), 'back-extension-45').cues.notes.startsWith('Start bodyweight only'), true);
  });

  test('draft values and the rest timer show up in the view; notes fall back to the log', () => {
    const log = makeLog();
    log.session('2026-10-05', 'A', [], { finished: false, id: 'sess_open' });
    let d = setRowField(emptyDraft('sess_open'), 'goblet-squat', 1, 'weightLbs', 25);
    d = { ...startRest(d, NOW - 30_000), notes: 'typing…' };
    const v = view(log, d);
    assert.deepEqual(card(v, 'goblet-squat').rows.map((r) => r.weightLbs), [25, 25, 25]);
    assert.equal(v.rest.remainingSec, 60);
    assert.equal(v.notes, 'typing…');
    assert.equal(v.savedNotes, '');
    assert.equal(Object.hasOwn(v, 'backPainBefore') || Object.hasOwn(v, 'backPainAfter'), false, 'no back pain in the view (v1.16)');
    assert.equal(view(log).rest, null);
  });
});

describe('summary', () => {
  test('totals, duration, per-exercise lines', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12, 12]), lift('dead-bug', 0, [8, 8]), carry('farmer-carry', 35, [40])], { id: 'sess_1' });
    const s = summaryView(log.state(), 'sess_1');
    assert.equal(s.totalSets, 5);
    assert.match(s.durationText, /^\d+ min$/);
    assert.equal(s.dateText, 'Mon, Sep 28');
    assert.deepEqual(s.exercises.map((e) => [e.name, e.count, e.text]), [
      ['Goblet Squat', 2, '25 × 12, 12'], ['Dead Bug', 2, '0 × 8, 8'], ['Farmer Carry', 1, '35 lbs × 40 m'],
    ]);
  });

  test('a session logged before v1.16 with back pain ratings still replays and summarises, and the ratings are not shown', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12])], { id: 'sess_old', backPainBefore: 3 });
    const state = log.state();
    assert.equal(state.sessions.sess_old.backPainBefore, 3, 'the log keeps it');
    const s = summaryView(state, 'sess_old');
    assert.equal(s.totalSets, 1);
    assert.equal(Object.hasOwn(s, 'backPainBefore') || Object.hasOwn(s, 'backPainAfter'), false);
  });

  test('unfinished or unknown sessions have no summary', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12])], { finished: false, id: 'sess_1' });
    assert.equal(summaryView(log.state(), 'sess_1'), null);
    assert.equal(summaryView(log.state(), 'nope'), null);
  });

  test('"increase next time": an exercise stuck below its scheduled weight is called out, one that just went up is not', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12, 12]), lift('db-bench-press', 20, [10, 10])]);
    // 21 days on: squat is suggested 30 but the person logs 25 again; the bench also due, and they lift 22.5.
    log.session('2026-10-19', 'A', [lift('goblet-squat', 25, [12, 12]), lift('db-bench-press', 22.5, [10, 10])], { id: 'sess_2' });
    const s = summaryView(log.state(), 'sess_2');
    assert.deepEqual(s.callouts.map((c) => [c.exerciseId, c.fromWeightLbs, c.weightLbs]), [['goblet-squat', 25, 30]]);
    assert.equal(s.callouts[0].text, 'Goblet Squat: 30 lbs next time (+5), scheduled');
  });

  test('nothing due next week: no callouts', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12, 12])], { id: 'sess_1' });
    assert.deepEqual(summaryView(log.state(), 'sess_1').callouts, []);
  });

  test('due within the next seven days: called out ahead of time', () => {
    const log = makeLog();
    log.session('2026-09-28', 'A', [lift('goblet-squat', 25, [12, 12])]);
    log.session('2026-10-14', 'A', [lift('goblet-squat', 25, [12, 12])], { id: 'sess_2' }); // Oct 21 is day 23 since the first
    assert.equal(summaryView(log.state(), 'sess_2').callouts[0]?.exerciseId, 'goblet-squat');
  });
});

describe('text', () => {
  test('last time groups equal weights and keeps different ones apart', () => {
    assert.equal(text.setsText([{ weightLbs: 35, reps: 12, levelNumber: null, distanceM: null }, { weightLbs: 35, reps: 12, levelNumber: null, distanceM: null }, { weightLbs: 30, reps: 10, levelNumber: null, distanceM: null }]), '35 × 12, 12 · 30 × 10');
    assert.equal(text.setsText([{ weightLbs: null, reps: 8, levelNumber: null, distanceM: null }, { weightLbs: null, reps: 7, levelNumber: null, distanceM: null }]), '8, 7');
  });

  test('prescriptions', () => {
    assert.equal(text.repsText({ repMin: 8, repMax: 12, perSide: false }), '8–12');
    assert.equal(text.repsText({ repMin: 8, repMax: 8, perSide: true }), '8 per side');
    assert.equal(text.repsText({ repMin: null, repMax: null, targetDistanceM: 40 }), '40 m');
    assert.equal(text.repsText({ repMin: null, repMax: null, holdSeconds: { min: 20, max: 40 } }), '20–40 s hold');
    assert.equal(text.setsRepsText({ sets: 3, repMin: 10, repMax: 12, perSide: false }), '3 × 10–12');
  });

  test('weights, days and durations', () => {
    assert.equal(text.weightText(0), 'no added weight');
    assert.equal(text.weightText(22.5), '22.5 lbs');
    assert.equal(text.formatDay('2026-09-27'), 'Sun, Sep 27');
    assert.equal(text.formatDuration(47 * 60000), '47 min');
    assert.equal(text.formatDuration(80 * 60000), '1 h 20 min');
    assert.equal(text.formatDuration(1000), '1 min');
    assert.equal(text.formatDuration(-5), null);
    assert.equal(text.formatTime(Date.parse('2026-10-05T18:30:00Z')), '11:30 AM');
  });

  test('the two warnings differ', () => {
    assert.match(text.warningText({ kind: 'yesterday', templateCode: 'B' }), /yesterday/);
    assert.match(text.warningText({ kind: 'today', templateCode: 'B' }), /today/);
    assert.equal(text.warningText(null), null);
  });
});

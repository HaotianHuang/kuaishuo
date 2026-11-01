// The assist ladder: how much a card helps, from A0 (a quicker clock, no pinyin, no English) to A5 (the line played
// first), A2 being v1 exactly (docs/v2/README.md §4, p1.md). A card takes the hardest rung at which the learner model
// (learner.js) expects its lines right first time τ of the time, a step at most from where the last card got to and two
// steps at most in any five cards; as it's played, a line that goes badly makes the rest a step easier and two quick
// wins in a row a step harder, never more than two steps from where the card began. Every knob is one v1 already had,
// so no rung needs a new recording. DOM-free (Node runs it in tools/assist-check.mjs): each format applies the knobs.
//   ask()             clockX ← clock (0: none, giveUpAfter ← giveUp), hint + free ← help, echo, no cue at 'mission'
//                     (askOpts() puts them together), and log { assist, free }: the line's row says its rung
//   text.cardHelp()   pinyin (none | model | new | all) and english (none | tap | show), where Settings say Auto
//   call.js           patience (× the caller's; Infinity never hangs up, as hangup says), nudges, peekFree, subtitles
//   chase.js          chaser (× its speed)          cards.js   leniency (Hanzi Writer's), traceTwice
//   audio.play()      rate, for the other characters' lines (pitch kept: stretch.js)
// Exports:
//   LADDER                                    A0 … A5, each { A, the knobs above }, frozen
//   choose(ids, { last, tau, mode, typed, predict })   the rung for lines (phrase ids) → 0–5
//   startAt(ids, { last, tau, mode, typed, predict })  the rung a card of them would begin at now (the budget too)
//   forCard(scn, { last, mode, tau, typed, hold })  { A, knobs, ids, after(row) }: a scenario's rung, live while it's played
//   forLines(ids, { mode, tau, typed, level })   { A, knobs, ids }: a card of phrases (a flash crisis, a run, the bonus
//                                             line) at the rung startAt() gives them now, moving nothing
//   lineRung(A, { level, seen, attempt, first })   a line's rung on a card at A (at L0, more help the first times it's
//                                             met; the phone's first lines ever, first: 1, 2, 3, FIRST_LINE and a step
//                                             down each, at least)
//   FIRST_LINE, FIRST_LINES                   the rung the phone's first line ever plays at, at least; how many step down
//   last()                                    the rung the next card starts from (ks.assist, so the next visit too)
//   askOpts(knobs, opts)                      a format's ask() opts at a rung;  init({ store }): a new visit (tests)
import { kv } from './store.js';
import { phraseId } from './content.js';
import * as learner from './learner.js';
import * as levels from './levels.js';

// Each rung is v1 with some knobs turned. clock multiplies the answer clock (0: none, and a silent line gives up after
// giveUp s); help is the hint a line starts at (1 the frame, 2 the whole answer) and whether it's free; echo plays the
// model answer first; prompt 'mission' shows the whole mission, not just the cue; patience multiplies a caller's
// (Infinity: they wait for ever) before each of nudges; chaser multiplies a chase's speed; leniency is Hanzi Writer's;
// rate slows the other characters' lines.
const V1 = { clock: 1, giveUp: 0, help: { hint: 0, free: false }, echo: false, prompt: 'cue', pinyin: 'new', english: 'tap', patience: 1, nudges: 2, hangup: true, peekFree: false, subtitles: false, chaser: 1, leniency: 1.2, traceTwice: false, rate: 1 };
const SHOWN = { prompt: 'mission', pinyin: 'all', english: 'show', peekFree: true };
const NO_CLOCK = { ...SHOWN, clock: 0, giveUp: 40, patience: Infinity, hangup: false, leniency: 1.5, rate: 0.85 };
const rung = (A, o) => Object.freeze({ A, ...V1, ...o, help: Object.freeze({ ...V1.help, ...o.help }) });
export const LADDER = Object.freeze([
  rung(0, { clock: 0.7, pinyin: 'none', english: 'none', patience: 0.6, nudges: 1, chaser: 1.4, leniency: 0.9 }),
  rung(1, { clock: 0.85, pinyin: 'model', patience: 0.8, chaser: 1.2, leniency: 1 }),
  rung(2, {}), // v1
  rung(3, { ...SHOWN, clock: 1.5, patience: 1.5, chaser: 0.75, leniency: 1.3 }),
  rung(4, { ...NO_CLOCK, help: { hint: 1, free: true }, chaser: 0.5 }),
  rung(5, { ...NO_CLOCK, help: { hint: 2, free: true }, echo: true, subtitles: true, chaser: 0.4, traceTwice: true }),
]);
const TOP = LADDER.length - 1;
// A step harder needs its lines right MARGIN more often than τ: the hardest rung whose estimate clears τ is the one
// likeliest to have been overestimated, and help taken away is felt more than help given. In any CARDS cards in a row
// the rung moves STEPS at most (p1.md), so a run of cards that differ in difficulty doesn't jerk it about.
export const MARGIN = 0.05, STEPS = 2, CARDS = 5;
const of = (A) => (Number.isInteger(A) && LADDER[A] ? A : null); // a rung, or null ('3', NaN, 7: none)
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
// the model has something to go on: an answer to the persona question, or a line heard
const known = () => learner.persona() != null || learner.level().n > 0;

// The hardest rung within a step of last (a step harder: MARGIN over tau) whose lines the model expects right first
// time, with no help beyond the rung's, tau of the time on average, answered the way the player will (mode, or
// mode(id) for each; a typed line as its sound, unless typed 'chars'). None of them: the easiest of the three. With no
// lines, or a model that knows nothing yet, last (v1's A2). predict: learner.predict, or learner.batch()'s (the same
// numbers, quicker over many cards: the ranker's); knows: whether the model knows anything yet (asked, unless given:
// the ranker asks once for all its cards).
export function choose(ids, { last, tau = 0.8, mode, typed = 'pinyin', predict = learner.predict, knows = known } = {}) {
  const from = of(last) ?? 2, ps = [...new Set(ids || [])];
  if (!ps.length || !(typeof knows === 'function' ? knows() : knows)) return from;
  const p = (A) => ps.reduce((t, id) => t + predict(id, { mode: typeof mode === 'function' ? mode(id) : mode, assist: A, typed }), 0) / ps.length;
  const lo = Math.max(0, from - 1), hi = Math.min(TOP, from + 1);
  for (let A = lo; A < hi; A++) if (p(A) >= tau + (A < from ? MARGIN : 0)) return A;
  return Number.isFinite(p(hi)) ? hi : from;
}

// The phone's first line ever (no line in the learner model, no srs entry: the hook story's first freeze, docs/v2/p3.md)
// plays at this rung at least, whatever its card's, so the first thing asked of a new player is one they can win: A4 (its
// frame free, no clock) if new learners win it 85% of the time there, else A5 (said for you first, the answer up). The
// simulator measures it (tools/sim.mjs): at A4 new learners win the airport's first line 43–69% of the time, at A5
// 72–88% (data/, p4b-2, p4b-3, seeds 1–3), so A5. And the help steps down from there over the phone's first
// FIRST_LINES lines, as an L0 line's does over its meetings: the second at A4 (its frame free, no clock), the third at
// A3 (the mission, the pinyin and the English shown, half as long again on the clock), then the card's rung. The card
// is dealt at the rung a blank model gives (A2: the model knows nothing of you yet), and a first line said for you
// tells the ladder little, so without the steps the second line fell from A5 to A2's clock in one (the hook's own lines
// went right a third of the time for new learners; p3.md's as-built section has the numbers).
export const FIRST_LINE = 5, FIRST_LINES = 3;
// A line's rung on a card at A: the card's, except at L0, where help steps down as the line is met (docs/v2/content.md):
// the first time, it's said for you and shown (A5's help), the next time its frame is free (A4's), and from then on
// it's the card's. seen: the times it's been met (srs), less the tries at it before this one (each recorded a meeting).
// first: the line's place among the phone's first lines ever (1, 2, 3; true: 1), its retries too (feed.js atRung() keeps
// the line, not the try): FIRST_LINE, a step down for each line before it, at least.
const firstRung = (k) => (k === true ? FIRST_LINE : k >= 1 && k <= FIRST_LINES ? FIRST_LINE - (k - 1) : 0);
export const lineRung = (A, { level, seen = 0, attempt = 1, first = false } = {}) => Math.max(levels.of(level) === 0 ? Math.max(A, [5, 4][Math.max(0, seen - attempt + 1)] ?? 0) : A, firstRung(first));
const EN = ['none', 'tap', 'show'];
// a rung's knobs with at least a level's English (levels.js: all of it at L0), whatever the rung
const dress = (k, l) => { const en = levels.LEVELS[levels.of(l)].english; return EN.indexOf(k.english) < EN.indexOf(en) ? { ...k, english: en } : k; };

// The rung the next card starts from: where the last one got to, a step at most from where it began, kept in
// ks.assist for the next visit. Only a step carries: a line that went badly is already in the learner model (a big
// surprise, so a big step), and carrying all of it would count it twice; two quick wins mostly aren't (right was
// expected, and how fast isn't counted past right), so that step is news to the next card. began: the rungs this
// visit's last few cards started at, for the budget.
let store = kv, mem, began = [];
export const last = () => (mem === undefined ? (mem = of(store.get('assist', null))) : mem);
const carry = (A) => { if (A !== last()) store.set('assist', (mem = A)); };
const steps = (as) => as.reduce((t, A, i) => t + (i ? Math.abs(A - as[i - 1]) : 0), 0);
export function init({ store: s = kv } = {}) { store = s; mem = undefined; began = []; }
// where a card that wants rung `want` begins: no further from where the last card began than leaves STEPS in CARDS cards
const budget = (want) => { const prev = began[began.length - 1], room = Math.max(0, STEPS - steps(began)); return prev == null ? want : prev + clamp(want - prev, -room, room); };
// The rung a card of these lines would begin at if it came on screen now (forCard()'s, the budget included), starting
// nothing: the ranker's estimate of the rung a card it deals will be played at. opts: choose()'s (last: last()'s).
export const startAt = (ids, o = {}) => budget(choose(ids, { ...o, last: of(o.last) ?? last() ?? 2 }));

// A scenario's say beats, every branch walked (ok, fail, miss, an or-branch's then), each once
function beats(scn) {
  const out = new Set();
  const walk = (list) => { for (const st of list || []) if (st.say && !out.has(st.say)) { const b = st.say; out.add(b); walk(b.ok); walk(b.fail); walk(b.miss); (b.alts || []).forEach((a) => walk(a.then)); } };
  walk(scn?.steps);
  return [...out];
}

// A scenario's rung, over every line it could ask (mode: one for all, or mode(beat)), decided the first time it's
// asked for (so as the card starts, not as the feed builds it a card ahead): choose() from last (the last card's,
// unless given), then no further from where the last card began than leaves STEPS in CARDS cards. after(row) hears
// line rows while the card is up (all of them: events.on, off as it goes), the card counting as begun at its first; a
// line set beside the story (a task: a call's type it back, a practice) isn't one. One of its lines that went badly
// (outcome under 0.3: out of time, the answer needed) makes the rest a step easier; two in a row right (0.9 or more)
// inside 40% of their clock, a step harder (a clockless line is timed against the clock it has at A2). Never more
// than two steps from where it began. after() → true when the rung moved. hold: a rung the card stays at (the content
// gate's #play), moving nothing, not even where the next card starts. A card shows at least its level's English
// (levels.js: all of it at L0), whatever the rung.
export function forCard(scn, { last: from, mode, tau, typed, hold } = {}) {
  const bs = beats(scn), modes = new Map(), secs = new Map();
  for (const b of bs) {
    modes.set(phraseId(scn, b), typeof mode === 'function' ? mode(b) : mode);
    // its rows' ids: a chase's again encounter is logged under the line it drills
    for (const id of [phraseId(scn, b), b.pid || phraseId(scn, b.again ? { id: b.again } : b)]) if (!secs.has(id)) secs.set(id, b.time ?? levels.patience(b.level ?? scn?.level));
  }
  const ids = Object.freeze([...modes.keys()]), lv = levels.of(scn?.level);
  let A = of(hold), start = A, wins = 0, on = false;
  const decide = () => {
    if (A != null) return A;
    return (start = A = budget(choose(ids, { last: of(from) ?? last() ?? 2, mode: (id) => modes.get(id), tau, typed })));
  };
  return {
    get A() { return decide(); },
    get knobs() { return dress(LADDER[decide()], lv); },
    ids,
    after(row) {
      if (of(hold) != null || row?.k !== 'line' || row.task || !secs.has(row.id)) return false;
      const was = decide();
      if (!on) { on = true; began = [...began, start].slice(1 - CARDS); carry(start); }
      const k = LADDER[of(row.assist) ?? was], y = learner.outcome({ free: k.help.free ? k.help.hint : 0, ...row }); // a row that doesn't say what was free: its rung's
      if (y == null) return false;
      // a line helped beyond the card's rung (an L0 line's first meetings, the phone's first line ever, its row marked
      // first: lineRung) says little by how fast it went: it neither counts as a quick win nor breaks a run of them
      wins = (lv === 0 || row.first) && k.A > was ? wins : y >= 0.9 && row.ms != null && row.ms <= 400 * (row.clock || secs.get(row.id)) ? wins + 1 : 0;
      const d = y < 0.3 ? 1 : wins >= 2 ? -1 : 0;
      if (d < 0) wins = 0;
      A = clamp(was + d, Math.max(0, start - 2), Math.min(TOP, start + 2));
      carry(clamp(A, start - 1, start + 1));
      return A !== was;
    },
  };
}

// A card of phrases rather than a story (a flash crisis, a run of them, the bonus line: their ids), at a rung where
// its dealer asks for one (p3.md: reviews at a rung, so a weak learner's come in reach): the one startAt() gives those
// lines now, answered the way the card will (mode) and aiming at tau, with its knobs (and at least the English of the
// card's level). It moves nothing: no step of the five-card budget spent, last() as it was, and nothing it hears moves
// it. Its rows say the rung (askOpts), as a story's do.
export function forLines(ids, { mode, tau, typed, level } = {}) {
  const A = startAt(ids, { mode, tau, typed });
  return { A, knobs: dress(LADDER[A], level), ids: Object.freeze([...new Set(ids || [])]) };
}

// ask()'s opts for a line at a rung: the format's own (opts), with the rung's clock, help, echo and prompt. Help the
// format gives beyond the rung's (a chase's answer after a time-out, a call's frame after a peek) stays paid for, so
// it's free only up to the rung's own. The row says the rung, and what was free (learner.js reads both).
export function askOpts(k, opts = {}) {
  const hint = Math.max(k.help.hint, opts.hint || 0), free = !!(opts.free || (k.help.free && hint <= k.help.hint));
  return { ...opts, clockX: k.clock, echo: k.echo, hint, free, ...(k.giveUp && opts.giveUpAfter == null ? { giveUpAfter: k.giveUp } : {}), ...(k.prompt === 'mission' ? { cue: '' } : {}), log: { ...opts.log, assist: k.A, ...(free && hint ? { free: hint } : {}) } };
}

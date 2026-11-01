#!/usr/bin/env node
// tools/assist-check.mjs: does the assist ladder (app/shared/assist.js) keep players winning about four lines in five
// without jerking the help about? First its parts: the ladder (A2 is v1 in every knob, the rest are README §4's),
// choose() (the hardest rung at τ, a step at most, v1's A2 with nothing to go on), forCard() (every line a story could
// ask, decided as the card starts, at most 2 steps in 5 cards), after() (a bad line a step easier, two quick wins a
// step harder, two steps at most, only this card's rows), the memory in ks.assist, askOpts(). Then synthetic players of
// each persona (tools/truth.mjs's, which tools/sim.mjs plays by too: true skills the persona's start + N(0, 0.6²), every line's true difficulty off its
// prior by N(0, 0.5²), the assists' true effects off by up to 30%, half the self-raters over-claiming by 0.1; and one in
// ten answering the persona question as another persona would, algorithm.md §6; and, reported but not held to the
// band, fluent players far above a Mandarin-at-home start who answer it so) play data/content.json's scenarios in
// the Mix's order, every card at the rung forCard() gives it and every line moving it through after(). Each answer is
// drawn from the TRUE model and logged as ask() logs it in that format (a scene's time-out and then its miss branch, a
// chat giving up after two silences, a caller's nudges and hang-up, a chaser closing in), and fed to learner.js. A line
// takes longer the harder it is for the player: a sure one in about a sixth of its A2 clock, a coin-flip in half
// (typing and tiles slower). With a microphone and without, per persona:
//   rungs     the share of cards started at A0 … A5
//   success   lines right first time with no help beyond the rung's: on every card (target 0.72–0.88), and on the
//             cards in reach (at A5 their lines go right τ of the time, the truth says), which is what the ladder
//             answers for; v1's (A2 throughout) beside them, and the mean outcome y the model reads
//   steps     the rung's moves from card to card in 5 cards in a row: on average, and the worst (≤ 2); and the share of
//             cards whose step the budget held back (choose() wanted one, 5 cards in a row would have moved 3)
//   moves     inside cards (after()), per card: a step easier, a step harder; and the share of cards lost
// Exit 1 if a part fails, any 5 cards in a row move more than 2 steps, or a persona's success on the cards in reach is
// outside 0.72–0.88.
//   node tools/assist-check.mjs [--n=200 players a persona] [--cards=20] [--seed=1] [--think=1: × every thinking time,
//   which decides how often two wins come quick]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const opt = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const S = await import(path.join(ROOT, 'app/shared/assist.js'));
const L = await import(path.join(ROOT, 'app/shared/learner.js'));
const levels = await import(path.join(ROOT, 'app/shared/levels.js'));
const { phraseId } = await import(path.join(ROOT, 'app/shared/content.js'));
const { truth, σ, wayOf, says, rowId, CONFIGS } = await import(path.join(ROOT, 'tools/truth.mjs'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content.json'), 'utf8'));
const { LADDER, MARGIN, STEPS, CARDS } = S, { SKILLS, WAYS, BETA, PERSONAS } = L;
const N = +opt('n', 200), RUN = +opt('cards', 20), THINK = +opt('think', 1), TAU = 0.8, BAND = [0.72, 0.88], WRONG = 0.1, SPREAD = 0.6;
const T0 = Date.parse('2026-11-02T08:00:00Z'), t0 = performance.now(), problems = [];
const fail = (m) => problems.push(m);
const fmt = (x, d = 2) => (x == null || Number.isNaN(x) ? '-' : x.toFixed(d));
const pct = (x) => `${Math.round(100 * x)}%`;

// a seeded generator (mulberry32), so a run can be repeated
let seed = +opt('seed', 1) >>> 0;
const rand = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const pick = (a) => a[Math.floor(rand() * a.length)];
const memory = () => { const m = new Map(); return { m, get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v) }; };
const twin = (p = 'studied') => { L.init(data, { store: memory(), now: () => T0 }); if (p) L.persona(p); S.init({ store: memory() }); };
const steps = (as) => as.reduce((t, A, i) => t + (i ? Math.abs(A - as[i - 1]) : 0), 0);
const windows = (as) => Array.from({ length: Math.max(0, as.length - CARDS + 1) }, (_, i) => steps(as.slice(i, i + CARDS)));
const scn0 = data.scenarios.find((s) => s.format === 'scene' && s.level === 2), b0 = scn0.steps.find((st) => st.say).say, id0 = phraseId(scn0, b0);
const lineRow = (o) => ({ k: 'line', id: id0, lv: 2, mode: 'speak', att: 1, hint: 0, hear: false, tries: 0, res: 'ok', perfect: true, stars: 3, alt: -1, ms: 9000, clock: 15, assist: 2, ...o });

// ---------- the ladder ----------
// v1, every knob as it plays today (docs/v2/v1-facts.md: two nudges then the hang-up, Hanzi Writer at 1.2, pinyin on
// new words, English a tap away, the cue up)
const V1 = { clock: 1, giveUp: 0, help: { hint: 0, free: false }, echo: false, prompt: 'cue', pinyin: 'new', english: 'tap', patience: 1, nudges: 2, hangup: true, peekFree: false, subtitles: false, chaser: 1, leniency: 1.2, traceTwice: false, rate: 1 };
// README §4 and p1.md, rung by rung (A0 … A5)
const SPEC = {
  clock: [0.7, 0.85, 1, 1.5, 0, 0], giveUp: [0, 0, 0, 0, 40, 40], 'help.hint': [0, 0, 0, 0, 1, 2], 'help.free': [0, 0, 0, 0, 1, 1], echo: [0, 0, 0, 0, 0, 1],
  prompt: ['cue', 'cue', 'cue', 'mission', 'mission', 'mission'], pinyin: ['none', 'model', 'new', 'all', 'all', 'all'], english: ['none', 'tap', 'tap', 'show', 'show', 'show'],
  patience: [0.6, 0.8, 1, 1.5, Infinity, Infinity], nudges: [1, 2, 2, 2, 2, 2], hangup: [1, 1, 1, 1, 0, 0], peekFree: [0, 0, 0, 1, 1, 1], subtitles: [0, 0, 0, 0, 0, 1],
  chaser: [1.4, 1.2, 1, 0.75, 0.5, 0.4], leniency: [0.9, 1, 1.2, 1.3, 1.5, 1.5], traceTwice: [0, 0, 0, 0, 0, 1], rate: [1, 1, 1, 1, 0.85, 0.85],
};
const knob = (r, k) => k.split('.').reduce((o, p) => o?.[p], r);
if (LADDER.length !== 6 || BETA.length !== LADDER.length) fail(`the ladder has ${LADDER.length} rungs and learner.js ${BETA.length} assist effects (6 each)`);
LADDER.forEach((r, A) => {
  if (r.A !== A || !Object.isFrozen(r) || !Object.isFrozen(r.help)) fail(`A${A} is ${r.A === A ? 'not frozen' : `labelled A${r.A}`}: a format could change every card's knobs`);
  const extra = Object.keys(r).filter((k) => k !== 'A' && !(k in V1));
  if (extra.length) fail(`A${A} has knobs nobody reads: ${extra.join(', ')}`);
  for (const [k, want] of Object.entries(SPEC)) { const got = knob(r, k), w = want[A]; if (typeof got === 'boolean' ? got !== !!w : got !== w) fail(`A${A}'s ${k} is ${got}, not ${w}`); }
});
const a2 = Object.entries(V1).filter(([k, v]) => JSON.stringify(LADDER[2][k]) !== JSON.stringify(v));
if (a2.length) fail(`A2 isn't v1: ${a2.map(([k, v]) => `${k} ${JSON.stringify(LADDER[2][k])} (v1 ${JSON.stringify(v)})`).join(', ')}`);
// v1's nudges are a call's silence lines, all of them: A2's 2 is v1 only while every call has two
const nudgeLines = data.scenarios.filter((s) => s.format === 'call').flatMap((s) => [s.call?.silence, ...says(s).map((b) => b.silence)].filter(Boolean).map((l) => [s.id, l.length]));
const odd = nudgeLines.filter(([, n]) => n !== V1.nudges);
console.log(`ladder: ${problems.length ? 'see problems' : 'every knob as README §4 says, A2 exactly v1'}${odd.length ? `; note: ${odd.map(([id, n]) => `${id} has ${n} nudge lines`).join(', ')} (A2's ${V1.nudges} isn't all of them)` : ''}`);

// ---------- choose() ----------
let n0 = problems.length;
twin(null);
const ids0 = S.forCard(scn0).ids;
for (const [ids, o, want] of [[ids0, {}, 2], [ids0, { last: 4 }, 4], [ids0, { last: 0 }, 0], [[], { last: 1 }, 1], [null, {}, 2], [ids0, { last: 7 }, 2], [ids0, { last: '3' }, 2]]) {
  const got = S.choose(ids, o);
  if (got !== want) fail(`choose(${ids ? `${ids.length} ids` : ids}, ${JSON.stringify(o)}) with nothing known gave ${got}, not ${want}`);
}
// with something known: within a step of last; a step harder only at τ + MARGIN; staying only where last itself makes
// τ (or is A5); a step easier only where last doesn't; a higher τ never a harder rung; a typed line as its sound
const modes = ['speak', 'self', 'type', 'tiles'];
let tried = 0;
for (let i = 0; i < 400; i++) {
  twin(pick(Object.keys(PERSONAS)));
  for (let j = Math.floor(rand() * 30); j--;) { const ph = pick(data.phrases); L.observe(lineRow({ id: ph.id, lv: ph.level, mode: pick(modes), assist: Math.floor(rand() * 6), ...(rand() < 0.4 ? { res: 'timeout', perfect: false, stars: 0 } : {}) })); }
  const scn = pick(data.scenarios), ids = S.forCard(scn).ids, last = Math.floor(rand() * 6), tau = pick([0.6, 0.7, 0.8, 0.9]), mode = pick(modes);
  const p = LADDER.map((_, A) => ids.reduce((t, id) => t + L.predict(id, { mode, assist: A, typed: 'pinyin' }), 0) / ids.length), got = S.choose(ids, { last, tau, mode });
  const why = `choose(${scn.id}, last ${last}, τ ${tau}, ${mode}) gave A${got} with p ${p.map((x) => fmt(x)).join(' ')}`;
  if (!(Math.abs(got - last) <= 1)) fail(`${why}: more than a step`);
  else if (got < last && !(p[got] >= tau + MARGIN)) fail(`${why}: a step harder under τ + ${MARGIN}`);
  else if (got === last && ((last > 0 && p[last - 1] >= tau + MARGIN) || (last < 5 && p[last] < tau))) fail(`${why}: stayed`);
  else if (got > last && p[last] >= tau) fail(`${why}: a step easier, though A${last} makes τ`);
  if (S.choose(ids, { last, tau: 0.9, mode }) < S.choose(ids, { last, tau: 0.6, mode })) fail(`${why}: τ 0.9 gave a harder rung than τ 0.6`);
  if (S.choose(ids, { last, tau, mode: 'type' }) !== S.choose(ids, { last, tau, mode: 'type', typed: 'pinyin' }) || S.choose(ids, { last, tau, mode: 'type', typed: 'chars' }) < S.choose(ids, { last, tau, mode: 'type' })) fail(`${why}: a typed line isn't judged by its sound, or its characters came out easier`);
  tried++;
}
console.log(`choose(): ${problems.length > n0 ? 'see problems' : `nothing known gives last (v1's A2); ${tried} learners, cards, rungs and τs: a step at most, harder only at τ + ${MARGIN}`}`);

// ---------- forCard() and after() ----------
n0 = problems.length;
for (const scn of data.scenarios) {
  const want = [...new Set(says(scn).map((b) => phraseId(scn, b)))], got = S.forCard(scn).ids, known = new Set(data.phrases.map((p) => p.id));
  if (JSON.stringify([...got].sort()) !== JSON.stringify([...want].sort())) fail(`forCard(${scn.id}) covers ${got.length} lines, not its ${want.length} (every branch's)`);
  if (got.some((id) => !known.has(id))) fail(`forCard(${scn.id}) asks the model about lines it doesn't know: ${got.filter((id) => !known.has(id)).join(', ')}`);
}
// a card starting at a rung, on a visit of its own: with nothing known, choose() keeps last, so forCard(…, { last })
// starts there
const at = (A, scn = scn0) => { S.init({ store: memory() }); const c = S.forCard(scn, { last: A }); if (c.A !== A) fail(`forCard(last ${A}) started at A${c.A}`); return c; };
const feed = (c, rows) => rows.map((r) => c.after(lineRow(r)));
const slow = { ms: 9000 }, quick = { ms: 5000 }, miss = { res: 'timeout', perfect: false, stars: 0 }, plain = { hint: 1, stars: 2 }; // plain: 0.55, no move
twin(null);
{
  const c = at(2);
  const other = data.scenarios.find((s) => s.id !== scn0.id);
  const ignored = [c.after(lineRow({ id: phraseId(other, other.steps.find((st) => st.say).say) })), c.after(lineRow({ ...miss, task: 'typeback' })), c.after(lineRow({ res: 'cancel' })), c.after({ k: 'card', id: scn0.id }), c.after(null)];
  if (ignored.some(Boolean) || c.A !== 2) fail(`after() moved on another card's line, a type it back, a cancel, a card row or nothing (now A${c.A})`);
  if (!feed(c, [miss])[0] || c.A !== 3 || c.knobs !== LADDER[3]) fail(`a line out of time moved A2 to A${c.A}, not A3 (knobs ${c.knobs?.A})`);
  feed(c, [miss, miss, miss]);
  if (c.A !== 4) fail(`four bad lines took A2 to A${c.A}: never more than two steps easier than the card began`);
  feed(c, [quick]);
  if (c.A !== 4) fail('one quick win moved it');
  feed(c, [slow, quick]);
  if (c.A !== 4) fail('quick, slow, quick moved it: two quick wins in a row, not two in all');
  feed(c, [quick]);
  if (c.A !== 3) fail(`two quick wins in a row moved A4 to A${c.A}, not A3`);
  feed(c, [quick, { ...quick, hint: 1, stars: 2 }]);
  if (c.A !== 3) fail('a quick line with the frame (0.65) counted as a win');
  feed(c, [quick, quick, quick, quick, quick, quick]);
  if (c.A !== 0) fail(`a run of quick wins from A3 reached A${c.A}, not A0`);
  const d = at(3);
  feed(d, [quick, quick, quick, quick, quick, quick, quick, quick]);
  if (d.A !== 1) fail(`quick wins took a card begun at A3 to A${d.A}: never more than two steps harder (A1)`);
  // a clockless line (a call's, a chase's, A4's) is quick against the clock it has at A2: 40% of its own time, or of its level's
  const e = at(4), t = (b0.time ?? levels.patience(scn0.level)) * 1000;
  feed(e, [{ clock: 0, ms: 0.35 * t, hint: 1, assist: 4 }, { clock: 0, ms: 0.35 * t, hint: 1, assist: 4 }]);
  if (e.A !== 3) fail(`two quick wins at A4 (clockless, the free frame up, a row that doesn't say it was free) left it at A${e.A}, not A3`);
  feed(e, [{ clock: 0, ms: 0.5 * t, assist: 3 }, { clock: 0, ms: 0.5 * t, assist: 3 }]);
  if (e.A !== 3) fail('two lines at half a clockless line\'s A2 time counted as quick');
  // a chase's again encounter is logged under the line it drills (chase.js), and counts on its card
  const ch = data.scenarios.find((s) => s.format === 'chase' && says(s).some((b) => b.again)), bA = says(ch).find((b) => b.again), f = at(2, ch);
  f.after(lineRow({ id: rowId(ch, bA), clock: 0, res: 'skip', perfect: false, stars: 0 }));
  if (f.A !== 3) fail(`a missed again encounter (${rowId(ch, bA)}) didn't move its chase`);
}
// the memory: none on a fresh phone; a card counts as begun at its first line; the next starts from where it got to,
// a step at most from where it began, this visit and the next (ks.assist); a card built ahead decides as it starts
{
  const st = memory();
  L.init(data, { store: memory(), now: () => T0 }); S.init({ store: st });
  if (S.last() !== null) fail(`a fresh phone's last() is ${S.last()}, not null`);
  const c = S.forCard(scn0, { last: 3 });
  if (c.A !== 3 || S.last() !== null) fail(`a card counted as begun before any line of it (A${c.A}, last() ${S.last()})`);
  feed(c, [miss]);
  if (c.A !== 4 || S.last() !== 4 || st.get('assist') !== 4) fail(`a card begun at A3 and a step easier left last() ${S.last()} and ks.assist ${st.get('assist')}, not 4`);
  feed(c, [miss]);
  if (c.A !== 5 || S.last() !== 4) fail(`a card begun at A3 and two steps easier carried A${S.last()}: only a step carries (A4)`);
  const ahead = S.forCard(scn0), d = S.forCard(scn0);
  if (d.A !== 4) fail(`the next card started at A${d.A}, not where the last got to (A4)`);
  feed(d, [quick, quick]);
  if (d.A !== 3 || S.last() !== 3) fail(`two quick wins on a card begun at A4 carried A${S.last()}, not A3`);
  if (ahead.A !== 3) fail(`a card built before the last one began started at A${ahead.A}, not where that one got to (A3)`);
  S.init({ store: st });
  if (S.last() !== 3) fail(`a new visit's last() is ${S.last()}, not the last visit's A3`);
}
// at most STEPS in CARDS cards. τ near 0 always wants a step harder, near 1 a step easier: a card begun at A2 that
// gets to A0 carries A1, and the next, a step harder still, starts at A0 (two steps from A2, the whole budget); the
// next three hold there however τ pulls; the fourth may move
{
  twin('studied');
  const c1 = S.forCard(scn0, { last: 3, tau: 0.01 }), as = [c1.A];
  feed(c1, [quick, quick, quick, quick]);
  for (let i = 0; i < 5; i++) { const c = S.forCard(scn0, { tau: i ? 0.999 : 0.01 }); as.push(c.A); feed(c, [plain]); }
  if (as.join('') !== '200001' || S.last() !== 1) fail(`the budget: cards began at ${as.join(' ')}, not 2 0 0 0 0 1`);
}
// and a model wanting a step every card (τ swung from 0.99 to 0.5 and back)
{
  twin('studied');
  const as = [];
  for (let i = 0; i < 24; i++) { const c = S.forCard(scn0, { tau: i % 4 < 2 ? 0.99 : 0.5 }); as.push(c.A); feed(c, [plain]); }
  if (Math.max(...windows(as)) > STEPS || steps(as) < 4) fail(`a model wanting a step every card went ${as.join('')}: more than ${STEPS} steps in ${CARDS} cards, or hardly moved`);
}
// askOpts(): what each rung asks of ask(), and what the row then says
{
  const own = { id: id0, cue: 'Too spicy!', hint: 0, log: { task: 'x' } }, o = LADDER.map((k) => S.askOpts(k, own)), sd = (x) => JSON.stringify(x);
  const want = [
    [o[2], { clockX: 1, echo: false, hint: 0, free: false, cue: 'Too spicy!', log: { task: 'x', assist: 2 } }],
    [o[0], { clockX: 0.7, cue: 'Too spicy!' }], [o[3], { clockX: 1.5, cue: '' }],
    [o[4], { clockX: 0, giveUpAfter: 40, hint: 1, free: true, cue: '', log: { task: 'x', assist: 4, free: 1 } }],
    [o[5], { echo: true, hint: 2, free: true, log: { task: 'x', assist: 5, free: 2 } }],
    [S.askOpts(LADDER[4], { hint: 2 }), { hint: 2, free: false, log: { assist: 4 } }], // a chase's answer after a time-out: paid
    [S.askOpts(LADDER[4], { giveUpAfter: 25 }), { giveUpAfter: 25 }], [S.askOpts(LADDER[2], {}), { cue: undefined, giveUpAfter: undefined }],
    [S.askOpts(LADDER[2], { hint: 1, cue: 'Hello?', time: 0 }), { hint: 1, free: false, cue: 'Hello?', time: 0, log: { assist: 2 } }], // A2 is v1: a call's peek, as it was
  ];
  for (const [got, w] of want) for (const [k, v] of Object.entries(w)) if (sd(got[k]) !== sd(v)) fail(`askOpts: ${k} ${sd(got[k])}, not ${sd(v)} (${sd(got)})`);
  if (L.outcome(lineRow({ hint: 1, ...o[4].log })) !== 1 || L.outcome(lineRow({ hint: 2, ...S.askOpts(LADDER[4], { hint: 2 }).log })) !== 0.2) fail('an A4 line\'s row doesn\'t read as its rung\'s help free and help beyond it paid');
}
// L0: a line's help steps down as it's met (lineRung), the card shows all its English whatever the rung, and a line
// helped beyond the card's rung neither counts as a quick win nor breaks a run of them; a held card (#play) moves nothing
{
  const lr = (A, o) => S.lineRung(A, o), want = [[lr(2, { level: 0 }), 5], [lr(2, { level: 0, seen: 1 }), 4], [lr(2, { level: 0, seen: 1, attempt: 2 }), 5], [lr(2, { level: 0, seen: 2 }), 2], [lr(5, { level: 0, seen: 1 }), 5], [lr(0, { level: 1 }), 0], [lr(1, { level: 2, seen: 0 }), 1]];
  for (const [got, w] of want) if (got !== w) fail(`lineRung: A${got}, not A${w} (${want.map(([g]) => g).join(' ')})`);
  const l0 = { ...scn0, level: 0 }, en = (scn, A) => (S.init({ store: memory() }), S.forCard(scn, { last: A, hold: A }).knobs.english);
  if ([0, 1, 2, 3].some((A) => en(l0, A) !== 'show') || en(scn0, 0) !== 'none' || en(scn0, 2) !== 'tap') fail(`an L0 card's English isn't all shown at every rung (A0 ${en(l0, 0)}, A2 ${en(l0, 2)}; L2 at A0 ${en(scn0, 0)})`);
  twin(null);
  const c = at(2, l0), rungs = [{ ...quick, assist: 5 }, { ...quick, assist: 5 }, { ...quick, assist: 4 }, quick, { ...quick, assist: 5 }, quick].map((r) => (c.after(lineRow(r)), c.A));
  if (rungs.join() !== '2,2,2,2,2,1') fail(`an L0 card's quick wins at its lines' own help moved it: ${rungs.join(' ')} (want 2 2 2 2 2 1: only the card's own rung's two count)`);
  S.init({ store: memory() });
  const h = S.forCard(scn0, { last: 1, hold: 4 }), moved = [miss, miss, quick, quick, quick].map((r) => h.after(lineRow({ ...r, assist: 4 })));
  if (h.A !== 4 || moved.some(Boolean) || S.last() != null) fail(`a held card moved: A${h.A}, after() ${moved.join(' ')}, last ${S.last()}`);
}
console.log(`forCard(), after(), the memory, askOpts(), L0, held: ${problems.length > n0 ? 'see problems' : 'all good'}`);

// ---------- the TRUE model (tools/truth.mjs, which tools/sim.mjs plays by too) ----------
const T = truth(data, { rand, normal, wrong: WRONG, spread: SPREAD }), { zOf } = T;
const player = (persona) => Object.assign(T.player(persona), { think: THINK });

// The Mix's v1 order (mix.js order()): the airport story first, then the formats in turn, each its easiest left, the
// ones played already after the rest
const FIRST = 'airport-esim', CYCLE = ['call', 'chat', 'chase', 'scene'], SOONER = { 'office-boss': 0.5 };
function order(done) {
  const first = done[FIRST] ? null : FIRST, rank = (s) => SOONER[s.id] ?? s.level, queues = {};
  for (const s of [...data.scenarios].sort((a, b) => (done[a.id] ? 1 : 0) - (done[b.id] ? 1 : 0) || rank(a) - rank(b))) if (s.id !== first) (queues[s.format] ||= []).push(s);
  const out = data.scenarios.filter((s) => s.id === first), turns = [...new Set([...CYCLE, ...Object.keys(queues)])];
  for (let i = 0, last = out[0]?.format; turns.some((f) => queues[f]?.length); i++) {
    const f = turns[i % turns.length], q = queues[f];
    if (!q?.length || (f === last && turns.some((g) => g !== f && queues[g]?.length))) continue;
    out.push(q.shift()); last = f;
  }
  return out;
}

// One card, played by the TRUE model at the card's rung (ladder: forCard() and after(); else v1, A2 throughout), as
// truth.mjs plays it: each answer panel right with p, from the rung's β and the help beyond what it gives free; the row
// as ask() logs it, at the rung the card is at by then.
function card(P, scn, mode, ladder, tally, clock) {
  const c = ladder ? S.forCard(scn, { mode: (b) => mode(scn, b) }) : { A: 2, knobs: LADDER[2], after: () => false }, all = says(scn);
  // the step choose() wants, before the budget has its say
  const want = ladder && S.choose(c.ids, { last: S.last() ?? 2, mode: (id) => mode(scn, all.find((b) => phraseId(scn, b) === id)) });
  const start = c.A;
  // in reach: at A5 its lines go right τ of the time, the truth says
  const reach = all.reduce((t, b) => t + σ(zOf(P, phraseId(scn, b), wayOf(mode(scn, b)), 5)), 0) / all.length >= TAU;
  const { out } = T.play(P, scn, c, { mode, clock, line(row, { att, right, moved }) {
    if (att === 1) { tally.lines++; tally.right += right; if (reach) { tally.rl++; tally.rr += right; } }
    tally.y += att === 1 ? L.outcome(row) ?? 0 : 0;
    if (moved) tally[moved]++;
  } });
  tally.cards++; tally.lost += out === 'lose'; tally.A[start]++; tally.held += ladder && want !== start;
  return { start, out };
}

function play(persona, mode, ladder) {
  const P = player(persona), clock = { t: T0 }, tally = { cards: 0, lost: 0, held: 0, lines: 0, right: 0, rl: 0, rr: 0, y: 0, easier: 0, harder: 0, A: LADDER.map(() => 0) }, starts = [], done = {};
  L.init(data, { store: memory(), now: () => clock.t });
  L.persona(P.told);
  S.init({ store: memory() });
  let deck = [];
  for (let i = 0; i < RUN; i++) {
    if (!deck.length) deck = order(done);
    const scn = deck.shift(), r = card(P, scn, mode, ladder, tally, clock);
    starts.push(r.start); done[scn.id] = { outcome: r.out === 'lose' ? 'lose' : 'win' };
    clock.t += 30e3;
  }
  return { tally, starts };
}

console.log(`\n${N} players a persona, ${RUN} cards each in the Mix's order, τ ${TAU}${THINK !== 1 ? `, thinking ×${THINK}` : ''} (success on cards in reach must be ${BAND.join('–')}; 5 cards in a row move ${STEPS} steps at most)`);
for (const [name, mode] of Object.entries(CONFIGS)) {
  console.log(`\n${name.padEnd(11)}${'cards started at A0 … A5'.padEnd(32)}${'success: all / in reach'.padEnd(30)}${'v1'.padEnd(13)}${'y'.padEnd(7)}${'steps/5: mean, worst, held'.padEnd(28)}moves/card: easier, harder   lost`);
  for (const persona of [...Object.keys(PERSONAS), 'fluent']) {
    const runs = Array.from({ length: N }, () => play(persona, mode, true)), v1 = Array.from({ length: N }, () => play(persona, mode, false));
    const sum = (rs) => rs.reduce((t, r) => { for (const [k, v] of Object.entries(r.tally)) t[k] = Array.isArray(v) ? v.map((x, i) => (t[k]?.[i] || 0) + x) : (t[k] || 0) + v; return t; }, {});
    const T = sum(runs), V = sum(v1), ws = runs.flatMap((r) => windows(r.starts)), mean = ws.reduce((a, b) => a + b, 0) / ws.length, worst = Math.max(...ws);
    const all = T.right / T.lines, reach = T.rr / T.rl, share = T.rl / T.lines;
    console.log(`  ${persona.padEnd(9)}${T.A.map((x) => pct(x / T.cards).padStart(5)).join('').padEnd(32)}${`${fmt(all)} / ${fmt(reach)} (${pct(share)} of lines)`.padEnd(30)}${`${fmt(V.right / V.lines)} / ${fmt(V.rr / V.rl)}`.padEnd(13)}${fmt(T.y / T.lines).padEnd(7)}${`${fmt(mean)}, ${worst}, ${pct(T.held / T.cards)}`.padEnd(28)}${`${fmt(T.easier / T.cards)}, ${fmt(T.harder / T.cards)}`.padEnd(28)}${pct(T.lost / T.cards)}`);
    if (worst > STEPS) fail(`${name}, ${persona}: ${worst} steps in ${CARDS} cards in a row (at most ${STEPS})`);
    if (persona === 'fluent') continue; // reported, not held to the band
    if (!(reach >= BAND[0] && reach <= BAND[1])) fail(`${name}, ${persona}: success on the cards in reach ${fmt(reach, 3)}, outside ${BAND.join('–')}`);
    if (!(all >= BAND[0] && all <= BAND[1])) console.log(`    ${persona}: success on every card ${fmt(all, 3)} is outside ${BAND.join('–')}: ${pct(1 - share)} of its lines are on cards out of reach even at A5 (content below L1 is P4's)`);
  }
}
for (const p of problems) console.log('PROBLEM ' + p);
console.log(`\n${problems.length ? `${problems.length} problems` : 'all good'} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(problems.length ? 1 : 0);

#!/usr/bin/env node
// tools/sim.mjs: 14 days of simulated learners, dealt For You (app/shared/rank.js) and as v1 dealt (deal-v1.js), so the
// ranker is measured before anyone plays it (docs/v2/p2.md, algorithm.md §6). Five personas (Mandarin at home, a dialect
// at home, studied, new, advanced) × 200 learners, each played by every dealer, paired: the same true learner and the
// same seeds, so the differences between dealers aren't noise.
//   The truth is tools/truth.mjs's (assist-check.mjs plays by it too), kept apart from the learner model: true skills a
//   persona's start + N(0, 0.6²) (advanced: assist-check's fluent players, answering Mandarin), one in ten answering
//   the persona question as another; every line's true difficulty off its prior by N(0, 0.5²); half the self-raters
//   over-claiming by 0.1. Each line said adds 0.01·w to the true skills (w: its way's loadings). A line met before is
//   remembered a while: right with R·σ(z + 1.2) + (1 − R)·σ(z), R = 2^(−t/h), h a day from the first meeting and doubled
//   at each success (memory helps while it lasts; forgotten, you're back to your skill, never below it).
//   Cards play as the app plays them: a story through the assist ladder (forCard, its after(), lineRung at L0) with the
//   truth's own player; a flash crisis and a line to shadow as one panel; a run as a chase through its phrases; a word
//   written from memory. Each answer is logged as ask() and events.js log it, srs recording it first, then the learner
//   model hears it, then the dealer, then the card's rung. Half the learners have a microphone (they speak), half don't
//   (say and check, a chase and every review typed).
//   Engagement is assumed, so it runs three ways: base (p2.md's), failure-averse (its failure terms twice as strong) and
//   boredom-averse (its boredom terms twice as strong, too easy from p̄ 0.95, a story seen before 0.15 likelier left):
//     P(leave a card) = 0.05 + 0.4·max(0, 0.6 − p̄) + 0.2·[the same format as the last]   (p̄: the true chance at its rung)
//     P(end the visit) = 0.04 + 0.25·[lost or 2+ misses] + 0.1·[p̄ > 0.97] + 0.01·minutes; at a recap ½; at an end card 1
//     P(back tomorrow) = 0.55 + 0.15·[ended on a win] + 0.1·[8+ minutes] − 0.15·[frustrated: under half the lines right, or
//     2 of the last 3 cards lost or left]. One visit a day; a learner who doesn't come back is gone.
//   Dealers: For You; v1 (deal-v1 at A2 throughout, no ladder: as it shipped, the baseline the thresholds compare with);
//   ladder (deal-v1 with the assist ladder: today's app after P1, so it shows what the ranker itself adds). The luck of a
//   visit (leaving a card, a lookup, a like, stopping, coming back) is drawn by day and by the card's place, the same
//   under every dealer (common random numbers), so a learner a dealer makes as likely to come back comes back alike.
// The report, review/sim/<data>-<seed>.md, is p2.md's done-when table filled in, judged on the four personas the content
// is for and the three assumptions, advanced beside them, then per persona and assumption with what lies behind each
// number (and the bounds no dealer or estimator could pass, compared on the learners they cover): the stories each
// dealer dealt by format (a rule that shuts a format out shows), For You's rematches and the rules that gave way, and
// whether each recap came straight after a win. The same seed gives the same report.
//   node tools/sim.mjs [--data=<dir>] [--seed=1] [--n=200 a persona] [--days=14] [--personas=a,b] [--assume=base,…]
//   [--dealers=foryou,v1,ladder] [--tau=ranker|0.8: the τ a story is played at: the item's (mix.js passing it to
//   assisted()) or forCard's own] [--audit: every pick held to the hard rules, tools/rules.mjs] [--out=review/sim]
//   [--quiet=0.1: the share of For You's visits in quiet mode] [--loops=off: For You as P3 left it, the what-if]
// The loops (p5.md, P5a), For You's alone (v1 and the ladder are P2's baselines, as they shipped): each learner's days.js
// (days.createDays over the learner's stores, hearing every row) hands the ranker released(), challenge() and endings();
// today's challenge is played as a story, its modifier taking a rung's help away in the truth (its lines a rung harder,
// and logged so); a tenth of the visits are quiet ("Can't talk now": every line typed, or tiles with a microphone, as
// feed.js answers in quiet mode), quiet() telling the ranker; the endings found are the rows' (the truth never takes an
// or-branch: a story's only ending of each outcome is all it finds).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const L = await import(path.join(ROOT, 'app/shared/learner.js'));
const S = await import(path.join(ROOT, 'app/shared/assist.js'));
const levels = await import(path.join(ROOT, 'app/shared/levels.js'));
const { over } = await import(path.join(ROOT, 'app/shared/store.js'));
const { what } = await import(path.join(ROOT, 'app/shared/events.js'));
const { createRanker, REVIEW } = await import(path.join(ROOT, 'app/shared/rank.js'));
const { dealV1 } = await import(path.join(ROOT, 'app/shared/deal-v1.js'));
const { linesToShadow, wordsToWrite } = await import(path.join(ROOT, 'app/shared/picks.js'));
const { truth, σ, wayOf, says, rowId, CONFIGS, SLOW } = await import(path.join(ROOT, 'tools/truth.mjs'));
const { tailor } = await import(path.join(ROOT, 'app/shared/content.js'));
const { createDays } = await import(path.join(ROOT, 'app/shared/days.js'));
// the say levels a story plays at: its own, and any beat's override keys (rank.js's)
export const levelsOf = (s) => [...new Set([s.level, ...says(s).flatMap((b) => Object.keys(b.levels || {}).map(Number))])].sort((a, b) => a - b);
const { referee } = await import(path.join(ROOT, 'tools/rules.mjs'));
const { SKILLS, WAYS } = L;

export const PERSONAS = ['mandarin', 'dialect', 'studied', 'new', 'advanced'];
export const ASSUME = {
  base: { fail: 1, bore: 1, easy: 0.97, seen: 0 },
  failure: { fail: 2, bore: 1, easy: 0.97, seen: 0 },
  boredom: { fail: 1, bore: 2, easy: 0.95, seen: 0.15 },
};
export const DEALERS = ['foryou', 'v1', 'ladder'];
const MEM = 1.2, H0 = 864e5, DAY = 864e5, MIN = 60e3, RECAP_STOP = 0.5, LIKE = 0.12, QUIET = 0.1;
const T0 = Date.parse('2026-11-02T18:00:00Z');

// seeded streams (mulberry32), each from a hash of what it's for, so no learner's draws depend on another's
export const stream = (s) => { s >>>= 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const hash = (...xs) => xs.reduce((h, x) => { for (const c of String(x)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return Math.imul(h ^ 0x9e3779b9, 2246822507) >>> 0; }, 2166136261);
export const memory = () => { const m = new Map(); return { m, get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v) }; };
// the same as a phone keeps it (store.js over localStorage): each value a string, parsed again at every read
export const strings = () => { const m = new Map(); return { m, get: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), set: (k, v) => m.set(k, JSON.stringify(v)) }; };
const mean = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : NaN);
const lvl = (t) => Math.min(5, Math.max(0, 1 + (t + 1 - Math.log(4)) / 0.67));
const pid = (scn, b) => b.pid || `${scn.id}/${b.id}`; // content.phraseId
// What the best estimator could know after those lines: its posterior sd in levels, from (Σ0⁻¹ + I)⁻¹ with Σ0 the true
// spread (0.6² a skill: it knows the persona's true mean, and every line's true difficulty), and the share of learners
// that sd puts within 0.6 of their level, 2Φ(0.6/sd) − 1, where the level isn't held at 0 or 5 (80% needs sd ≤ 0.47)
const inv = (A) => { const n = A.length, M = A.map((r, i) => [...r, ...r.map((_, j) => +(i === j))]); for (let i = 0; i < n; i++) { const p = M[i][i]; M[i] = M[i].map((x) => x / p); for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i]; M[r] = M[r].map((x, j) => x - f * M[i][j]); } } return M.map((r) => r.slice(n)); };
const Φ = (x) => { if (x === Infinity) return 1; if (x === -Infinity) return 0; const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2), q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - q : q; };
function bound(I, raw, tol = 0.6) {
  const C = inv(I.map((r, i) => r.map((x, j) => x + (i === j ? 1 / 0.36 : 0)))), sd = (a) => Math.sqrt(a.reduce((t, x, i) => t + x * a.reduce((u, y, j) => u + C[i][j] * y, 0), 0)) / 0.67;
  const say = sd(['L', 'S', 'V', 'T', 'R', 'W'].map((k) => ({ L: 0.1, S: 0.45, V: 0.3, T: 0.15 })[k] || 0)), listen = sd([1, 0, 0, 0, 0, 0]), read = sd([0, 0, 0, 0, 1, 0]);
  const away = (s, t) => (t > tol && t < 5 - tol ? 2 * Φ(tol / s) - 1 : null);
  return { sd: { say, listen, read }, say: away(say, raw.say), listen: away(listen, raw.listen), read: away(read, raw.read) };
}

export function load(dir = 'data') {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'content.json'), 'utf8'));
  data.byId = Object.fromEntries(data.scenarios.map((s) => [s.id, s]));
  data.phraseById = Object.fromEntries(data.phrases.map((p) => [p.id, p]));
  return data;
}

// The world: the content and its truth, drawn once, so every learner meets the same true lines: each line's difficulty,
// each word's to write from memory, each line of the cast's to say back.
// (listening: the truth's caller term, 0.5 logits a level of a call's listening above yours; 0 leaves it out, as P2's
// truth had none)
export function world(data, seed, { listening = 0.5 } = {}) {
  const cur = { r: stream(hash(seed, 'truth')) }, rand = () => cur.r(), normal = () => Math.sqrt(-2 * Math.log(1 - cur.r())) * Math.cos(2 * Math.PI * cur.r());
  const T = truth(data, { rand, normal, listening }), words = new Map(), echoes = new Map();
  for (const s of data.scenarios) for (const t of levelsOf(s).map((L) => (L === s.level ? s : tailor(s, L)))) { // each story as played at each level (picks.js takes it so)
    for (const w of wordsToWrite(data, t)) if (!words.has(w.word)) words.set(w.word, L.typical(2) + 0.5 * normal());
    for (const st of linesToShadow(t)) if (!echoes.has(s.id + ':' + st.zh)) echoes.set(s.id + ':' + st.zh, L.typical(s.level) + 0.5 * normal());
  }
  return { data, T, cur, words, echoes };
}
// one learner of a persona: the same whichever dealer plays them
export function person(W, persona, i, seed) {
  W.cur.r = stream(hash(seed, persona, i, 'who'));
  return Object.assign(W.T.player(persona === 'advanced' ? 'fluent' : persona), { name: persona, i, mic: i % 2 === 0 });
}
// how they answer: by voice where the phone listens (a chat as each line asks), else say and check, with a chase, a
// chat and every review typed (cards.js, chase.js, feed.js answering())
export const MODES = {
  mic: (scn, kind) => (kind === 'scn' ? (b) => CONFIGS.speech(scn, b) : 'speak'),
  'no mic': (scn, kind) => (kind === 'scn' ? (b) => CONFIGS['no mic'](scn, b) : 'type'),
};

// A learner's days with one dealer → everything the report needs from them.
// (rank-check.mjs's stress tests: setup({ srs, marks, clock, learner }) fills the stores before the first visit; endless:
// a visit ends only at an end card or after `cards` cards; onPick(p, place) sees every pick; stores: what spaced review,
// the marks and the arms are kept in (memory(), or strings() as a phone keeps them), and settings: mode() reading
// Settings as feed.js answering() does (two parses of a stored string), for the time a pick takes)
export function run(W, P0, { dealer, assume, seed, days = 14, tau: played = 'ranker', audit = false, setup = null, endless = false, cards: most = 60, onPick = null, stores = memory, settings = false, review: lever = REVIEW, hold = 3, about: meet = 'tap', loops = true, quiet: hushed = QUIET }) {
  const { data, T } = W, E = ASSUME[assume], key = [seed, P0.name, P0.i, assume];
  // Common random numbers: the learner's luck as a visit goes (leaving a card, looking a word up, a like, stopping,
  // coming back tomorrow) is drawn by day and by the card's place in the visit, the same whichever dealer deals, so
  // where two dealers make a learner equally likely to come back, the same draw decides both alike
  const rA = stream(hash(...key, 'answers')), rR = stream(hash(...key, 'rank')), luck = (...at) => stream(hash(...key, ...at));
  let rE = luck('card', 0, 0);
  W.cur.r = rA; // the truth's player draws its answers from here
  const normal = () => Math.sqrt(-2 * Math.log(1 - rA())) * Math.cos(2 * Math.PI * rA());
  const P = { ...P0, th: { ...P0.th } }, clock = { t: T0 }, now = () => clock.t, st = stores();
  // the persona question: For You asks it on the about card, after the hook (p3.md), of a phone that has never played;
  // v1 and the ladder (P2's baselines) were told it before the first card, and so was a phone with a past (a stress
  // case's), as Settings → Your Chinese would have been
  L.init(data, { store: memory(), now }); if (dealer !== 'foryou') L.persona(P.told); S.init({ store: memory() });
  const { srs, marks } = over(st, now), ladder = dealer !== 'v1', SET = JSON.stringify('auto');
  // (For You's loops: the learner's days.js, and quiet mode's visits: every line typed, or tiles with a microphone, a
  // chat's tiles beat in tiles; the same visits whatever else is dealt)
  const dy = dealer === 'foryou' && loops ? createDays({ data, store: st, now }) : null, hushWay = P.mic ? 'tiles' : 'type';
  let hush = false;
  const ways = (scn, kind) => (hush ? (kind === 'scn' ? (b) => (scn.format === 'chat' && b.reply === 'tiles' ? 'tiles' : hushWay) : hushWay) : MODES[P.mic ? 'mic' : 'no mic'](scn, kind));
  const mode = settings ? (scn, kind) => (JSON.parse(SET), JSON.parse(SET), ways(scn, kind)) : ways;
  setup?.({ srs, marks, clock, learner: L });
  if (dealer === 'foryou' && (srs.count() || L.level().n || Object.keys(marks.doneAll()).length)) L.persona(P.told);
  // each visit opens the Mix afresh (a phone keeps nothing in memory overnight): a new ranker, the arms kept (ks.arms)
  const P5 = dy ? { released: dy.released, quiet: () => hush, challenge: () => dy.challenge(), endings: (s) => dy.endings(s) } : {};
  const arms = stores(), ranker = () => createRanker({ data, learner: L, assist: S, srs, marks, store: arms, now, rng: rR, mode, runs: true, explain: audit, review: lever, hold, ...P5 });
  const ref = dealer === 'foryou' && audit ? referee({ data, learner: L, assist: S, srs, marks, store: arms, mode, review: lever, hold, quiet: () => hush, challenge: P5.challenge, loops: !!dy }) : null;
  let r = null, dv = null, sess = null, guess = null;
  const out = { name: P0.name, mic: P.mic, eps: [], sessions: [], cal: [], calR: [], calN: [], calM: [], calC: [], calUp: [], hard: [], place: null, placed: null, first: null, about: null, bonus: null, due: { ok: 0, late: 0, open: 0 }, gain: 0, gains: {}, calls3: 0, picks: 0, pickMs: 0, kinds: {}, fmts: {}, cls: {}, rules: {}, recaps: { win: 0, not: 0 }, sure: { recap: 0, not: 0 }, rungs: [0, 0, 0, 0, 0, 0], revRungs: [0, 0, 0, 0, 0, 0], firsts: [], placeTau: {}, quiet: 0, hushShadow: 0, chWon: 0 };

  // The true memory of each line and word met: { h, last }
  const mem = new Map();
  const recall = (k) => { const m = mem.get(k); return m ? 2 ** (-(clock.t - m.last) / m.h) : 0; };
  const met = (k, success) => { const m = mem.get(k); if (!m) mem.set(k, { h: H0, last: clock.t }); else { m.last = clock.t; if (success) m.h *= 2; } };
  // P(right) for a line, the truth's: while it's remembered, better; and the learner model's own chance, kept for the
  // calibration (at the first attempt: no help beyond the rung's)
  const chance = (keyOf) => (P_, id, way, A, help) => {
    const z = T.zOf(P_, id, way, A) + help, R = recall(keyOf(id)), p = R ? R * σ(z + MEM) + (1 - R) * σ(z) : σ(z);
    if (!help) { guess = L.predict(id, { mode: way === 'pinyin' ? 'type' : way, assist: A, typed: 'pinyin' }); told = [way, data.phraseById[id]?.format === 'call', p]; }
    return p;
  };
  // The Fisher information the first 12 lines carried about the six skills, at their true chances (each way's
  // loadings, a call's shift to listening, a say-and-check counted as learner.js counts it): what the best estimator,
  // knowing each persona's true spread (0.6 a skill) and every line's true difficulty, could make of them; and the same
  // over every line until the end of placement (infoP: P3's row). Not only lines: a story's chunks looked up or not
  // (line: false) are what the model hears of reading (or a call's listening) on its card row, so the bound has them too,
  // at a look-up's weight, until the 12th line (or placement's end)
  const info = SKILLS.map(() => SKILLS.map(() => 0)), infoP = SKILLS.map(() => SKILLS.map(() => 0));
  let told = null, infoLines = 0;
  const inform = (way, call, p, scale = 1, line = true) => {
    if (!WAYS[way]) return;
    const a = SKILLS.map((k) => { const w = WAYS[way][k] || 0; return call ? (k === 'L' ? w + 0.3 * (1 - w) : 0.7 * w) : w; }), h = WAYS[way].o * (way === 'self' ? 1 - L.SELF : 1) * scale * p * (1 - p);
    if (line ? infoLines < 12 : !out.place) { if (line) infoLines++; a.forEach((x, i) => a.forEach((y, j) => (info[i][j] += h * x * y))); }
    if (!out.placed) a.forEach((x, i) => a.forEach((y, j) => (infoP[i][j] += h * x * y)));
  };
  // the model's chance that a review comes right, at the rung it's played at (the line's own chance: rank.js drops
  // algorithm.md's R·p)
  const reviewGuess = (id, m, A = 2) => L.predict(id, { mode: m, assist: A, typed: 'pinyin' });
  // the rung a review card plays at: its item's, where it has one (assist.forLines(): the rung startAt() gives those
  // lines as the card starts, moving nothing), else v1's A2
  const forLines = S.forLines ?? ((ids, o) => { const A = S.startAt(ids, o); return { A, knobs: S.LADDER[A] }; });
  const rung = (item, ids, m) => (item.A != null ? forLines(ids, { mode: m, tau: item.tau }) : { A: 2, knobs: S.LADDER[2] });
  const learn = (way, call) => { for (const k of SKILLS) { const w = WAYS[way]?.[k] || 0; P.th[k] += 0.01 * (call ? (k === 'L' ? w + 0.3 * (1 - w) : 0.7 * w) : w); } };
  const raw = (t) => 1 + (t + 1 - Math.log(4)) / 0.67, rawLevels = () => ({ say: raw(SKILLS.reduce((t, k) => t + (WAYS.speak[k] || 0) * P.th[k], 0)), listen: raw(P.th.L), read: raw(P.th.R) });
  const trueLevels = () => Object.fromEntries(Object.entries(rawLevels()).map(([k, v]) => [k, Math.min(5, Math.max(0, v))]));

  // Due reviews: each one waits from its due time; a visit that ends with it still waiting counts one; served (answered
  // again, anywhere) within 2 visits or not
  const pending = new Map();
  const record = (id, stars) => { const was = pending.get(id); if (!was) sess.fresh++; else if (was.due <= clock.t) sess.served++; srs.record(id, stars); if (was && was.due <= clock.t && was.waited <= 1) out.due.ok++; const e = srs.get(id); pending.set(id, { due: e.due, waited: 0 }); };
  // every row the app logs, heard in the app's order: the learner model, then the dealer (a card's rung after them)
  // (and the placements: P2's after the model's 12th line, P3's as the ranker ends placement, each beside the best
  // estimator's bound after the same lines)
  const placeEnd = () => arms.get('arms', null)?.place?.end;
  const hear = (row) => {
    L.observe(row); dy?.hear(row); r?.after(row); ref?.hear(row);
    if (row.k === 'line' && !out.place && L.level().n >= 12) { const m = L.level(), tr = trueLevels(); out.place = { say: Math.abs(m.say - tr.say), listen: Math.abs(m.listen - tr.listen), read: Math.abs(m.read - tr.read), best: bound(info, rawLevels()) }; }
    if (r && !out.placed && placeEnd()) { const m = L.level(), tr = trueLevels(), pl = arms.get('arms', null).place; out.placed = { say: Math.abs(m.say - tr.say), listen: Math.abs(m.listen - tr.listen), read: Math.abs(m.read - tr.read), off: { say: m.say - tr.say, listen: m.listen - tr.listen, read: m.read - tr.read }, best: bound(infoP, rawLevels(), 1), lines: pl.n, call: !!pl.call, chat: !!pl.chat, bonus: !!pl.bonus, day: sess.day, sd: L.skills().g.s, home: out.about?.home == null ? 'skipped' : P.told === (P.persona === 'fluent' ? 'mandarin' : P.persona) ? 'right' : 'wrong' }; }
  };
  const lineRow = (o) => ({ k: 'line', at: clock.t, att: 1, hint: 0, hear: false, tries: 0, alt: -1, ...o });
  const tally = (ok) => { sess.lines++; sess.right += ok; };
  const leaving = (p, same, seen = false, lines = 1) => (rE() < 0.05 + 0.4 * E.fail * Math.max(0, 0.6 - p) + 0.2 * E.bore * same + E.seen * seen ? (lines > 1 && rE() >= 0.4 ? 1 + Math.floor(rE() * (lines - 1)) : 0) : Infinity);

  // ---------- the cards: each played to its end screen, its card row given back to be logged as it's left ----------
  // A story, through the ladder (v1: A2 throughout and no ladder, as it shipped)
  function story(item, prevFmt) {
    const scn = item.scn, base = data.byId[scn.id], all = says(scn), modeOf = (s, b) => mode(s, 'scn')(b), call = scn.format === 'call';
    const c = ladder ? S.forCard(scn, { last: S.last(), mode: (b) => modeOf(scn, b), ...(r && played === 'ranker' && item.tau ? { tau: item.tau } : {}) }) : { A: 2, knobs: S.LADDER[2], after: () => false };
    const keyOf = new Map(all.map((b) => [pid(scn, b), rowId(scn, b)])), ch = chance((id) => keyOf.get(id) ?? id);
    // the phone's first lines ever, on a For You card (mix.js: assisted()'s first): the card's first panels, on a phone
    // that has never played (no srs entry, no line in the model), at FIRST_LINE and a step down each, their retries too
    // (feed.js atRung: the first FIRST_LINES lines met, in the order the story plays them), their rows marked first
    const opening = r && !srs.count() && !L.level().n ? all.slice(0, S.FIRST_LINES ?? 1) : [], firstB = opening[0] || null;
    const rung0 = ladder ? (b, att) => { const A = S.lineRung(c.A, { level: b.level ?? scn.level, seen: srs.get(rowId(scn, b))?.seen, attempt: att, first: opening.indexOf(b) + 1 }); return A === c.A ? c.knobs : S.LADDER[A]; } : null;
    // (today's challenge: its modifier, a panic clock or no pinyin and English, takes a rung's help away: a rung harder)
    const knobs = rung0 && item.kind === 'challenge' ? (b, att) => S.LADDER[Math.max(0, rung0(b, att).A - 1)] : rung0;
    // how it feels: the true chance of its lines at the rung each starts at
    const pbar = mean(all.map((b) => ch(P, pid(scn, b), wayOf(modeOf(scn, b)), knobs ? knobs(b, 1).A : 2, 0)));
    out.rungs[c.A]++;
    // the first line's true chance at A4 and at A5 (the FIRST_LINE rule: A5 if new learners win it under 85% at A4)
    if (firstB) { const id = pid(scn, firstB), w = wayOf(modeOf(scn, firstB)); out.first = { scn: scn.id, A: knobs(firstB, 1).A, p4: σ(T.zOf(P, id, w, 4)), p5: σ(T.zOf(P, id, w, 5)), right: null, lines: 0, ok: 0 }; }
    const at = leaving(pbar, prevFmt === scn.format, !!marks.doneAll()[scn.id], all.length), npc = (base.secs || 100) / Math.max(1, all.length), t0 = clock.t;
    let right = 0, firsts = 0, asked = 0;
    const stars = [], say0 = Math.floor(L.level().say); // (a first meeting a level or more above the level you say at)
    const res = T.play(P, scn, c, { mode: modeOf, clock, knobs, chance: ch, chars: true, leave: (n) => n >= at,
      time: (think) => (clock.t += 1000 * (npc / (c.knobs.rate || 1) + think + 2)),
      emit(row) {
        asked++;
        const k = opening.findIndex((b) => rowId(scn, b) === row.id) + 1;
        if (k) row.first = k; // (atRung's log: the card's rung doesn't count how quick it was)
        if (row.res === 'ok') record(row.id, Math.min(row.free >= 2 ? 1 : row.free >= 1 ? 2 : 3, row.pinyin && row.perfect && !row.hint ? 3 : row.stars)); else if (row.res === 'timeout') record(row.id, 0);
        if (row.att === 1) { row._p = guess; if (told) inform(told[0], told[1], told[2]); }
        hear(row);
      },
      line(row, { att, right: ok }) {
        if (att === 1) { firsts++; right += ok; tally(ok); learn(wayOf(row.mode), call); out.cal.push([row._p, ok]); (srs.get(row.id)?.seen > 1 ? out.calM : out.calN).push([row._p, ok]); if (srs.get(row.id)?.seen <= 1 && (row.lv ?? scn.level) > say0) out.calUp.push([row._p, ok]); if (call) out.calC.push([row._p, ok]); out.hard.push(σ(T.zOf(P, row.id, wayOf(row.mode), 0))); }
        if (att === 1 && out.first && out.first.right == null && firstB && row.id === rowId(scn, firstB)) out.first.right = ok;
        if (att === 1 && firstB && out.first) { out.first.lines++; out.first.ok += ok; } // the hook's lines (session 1's, apart)
        met(row.id, att === 1 && ok); stars.push(row.stars || 0);
      } });
    // its end screen (marks.done); the other characters' lines looked up where they're beyond you (three chunks a
    // story, fewer needed once the rung shows the English); a like, now and then, for a win
    const left = res.out === 'left', outc = left ? null : res.out === 'lose' ? 'lose' : 'win', st0 = Math.round(mean(stars.length ? stars : [0]));
    if (!left) marks.done(scn.id, { stars: st0, outcome: outc });
    clock.t += 5000;
    const th = call ? P.th.L : P.th.R, bl = L.typical(scn.listen ?? base.listen ?? scn.level) - (c.A >= 3 ? 1 : 0);
    let gloss = 0;
    for (let i = 0; i < 3; i++) { gloss += rE() >= σ(th - bl); inform(call ? 'heard' : 'read', false, σ(th - bl), 0.3, false); }
    const like = outc === 'win' && rE() < LIKE;
    if (like) marks.toggle('liked', scn.id);
    const row = { k: 'card', at: clock.t, ...what(item), ms: clock.t - t0, state: left ? 'playing' : 'done', how: 'swipe', ...(left ? {} : { out: outc, stars: st0 }), ...(asked ? { asked } : {}), ...(gloss ? { gloss } : {}), ...(like ? { like: 1 } : {}) };
    return { kind: item.kind, fmt: scn.format, row, done: !left, out: left ? (asked ? 'left' : 'skip') : outc, win: outc === 'win', lost: outc === 'lose', misses: firsts - right, pbar, call3: call && (scn.listen ?? base.listen ?? Math.max(3, base.level + 1)) >= 3 };
  }
  // one answer panel off a story (a flash crisis, a line to shadow): right with the truth's chance
  function panel(z, k, m, clockS) {
    const R = recall(k), p = R ? R * σ(z + MEM) + (1 - R) * σ(z) : σ(z), u = rA(), ok = u < p, said = m === 'self' && P.over ? u < Math.min(1, p + 0.1) : ok;
    const think = (clockS || 15) * (0.15 + 0.7 * (1 - p)) * Math.exp(0.45 * normal()) * SLOW[m], ms = Math.round(1000 * (clockS ? Math.min(think, 0.95 * clockS) : think));
    clock.t += ms + 2000;
    return { p, ok, said, ms };
  }
  // A flash crisis: their line again, then yours from memory (typed without a microphone, on twice the clock); a miss
  // puts the answer up to say once (a practice, which nothing counts). At its item's rung where it has one (the
  // ranker's review lever: mix.js gives the card assist.forLines() as it starts, moving nothing): the rung's clock, its
  // help free (spaced review capped by it: a free frame 2★, the answer 1★), its line said first at A5
  // The bonus line (PL3) is played as one (cards.js: a review card, its row task 'bonus'), at v1's A2: a first meeting,
  // counted whole by the learner model, never remembered before.
  function review(item, prevFmt, task = 'review') {
    const p = item.p, scn = data.byId[p.scn], m = mode(scn, 'review'), lv = p.level ?? scn.level, { A, knobs: k } = rung(item, [p.id], m), t0 = clock.t;
    if (task === 'review') out.revRungs[A]++;
    const secs = Math.round((['type', 'tiles'].includes(m) ? 2 : 1) * levels.clock(lv) * k.clock), free = k.help.free ? k.help.hint : 0, cap = free >= 2 ? 1 : free ? 2 : 3;
    clock.t += 8000;
    if (leaving(0.6, prevFmt === 'review') < Infinity) return { kind: 'review', fmt: 'review', row: { k: 'card', at: clock.t, ...what(item), ms: clock.t - t0, state: 'playing', how: 'swipe' }, done: false, out: 'skip' };
    const g = reviewGuess(p.id, m, A), a = panel(T.zOf(P, p.id, wayOf(m), A), p.id, m, secs), up = lv > Math.floor(L.level().say);
    inform(wayOf(m), p.format === 'call', a.p, task === 'bonus' ? 1 : 0.5); // (the bonus a first meeting: the model counts it whole)
    const row = a.said ? lineRow({ id: p.id, lv, mode: m, ms: a.ms, clock: secs, assist: A, task, res: 'ok', stars: 3, ...(free ? { hint: free, free } : {}), ...(m === 'self' ? { self: true } : { perfect: true }) })
      : lineRow({ id: p.id, lv, mode: m, ms: secs ? secs * 1000 : k.giveUp ? 1000 * k.giveUp : a.ms, clock: secs, assist: A, task, res: secs ? 'timeout' : 'skip', stars: 0, ...(free ? { hint: free, free } : {}) });
    if (m === 'type' && row.res === 'ok' && rA() >= σ(T.zOf(P, p.id, 'chars', A))) Object.assign(row, rA() < 0.5 ? { pinyin: true } : { chars: 1 }, { stars: 2 });
    record(p.id, row.res === 'ok' ? Math.min(cap, row.pinyin ? 3 : row.stars) : 0); // a skipped review is forgotten (cards.js)
    hear(row); learn(wayOf(m), p.format === 'call'); met(p.id, a.ok); tally(a.ok); (task === 'review' ? out.calR : out.calN).push([g, a.ok]); out.cal.push([g, a.ok]);
    if (task === 'bonus') { out.bonus = { ok: a.ok, p: g, lv, day: sess.day }; if (up) out.calUp.push([g, a.ok]); }
    if (row.res !== 'ok') { clock.t += 10000; hear(lineRow({ id: p.id, lv, mode: 'self', ms: 6000, clock: 0, task: 'practice', res: 'ok', hint: 2, free: 2, stars: 1, self: true })); }
    clock.t += 3000;
    return { kind: item.kind, fmt: 'review', row: { k: 'card', at: clock.t, ...what(item), ms: clock.t - t0, state: 'done', how: 'swipe', asked: row.res === 'ok' ? 1 : 2 }, done: true, out: a.ok ? 'win' : 'miss', win: a.ok, felt: a.said, misses: task === 'bonus' ? 0 : +!a.ok, pbar: a.p };
  }
  // The about card (For You's, after the hook): 85% answer the home question (as told: one in ten as another persona
  // would), 15% skip it (the model starts from the four personas' average, wide); 1–2 goals at random (a heritage learner
  // leaning family), 15% none; a year, or rather not. Each answer saved as it's tapped (about.js): the persona, ks.goals,
  // ks.born. Done as it comes on screen, a swipe goes on. (meet: 'tap', so; or rank-check's stress cases, 'skip': every
  // question left and Done tapped, 'swipe': swiped past at once, nothing tapped either way)
  function about(item) {
    const u = luck('about'), t0 = clock.t, said = {};
    if (meet === 'tap' && item.ask.includes('home') && u() < 0.85) said.home = L.persona(P.told);
    if (meet === 'tap' && item.ask.includes('goals')) {
      const home = ['mandarin', 'dialect', 'advanced'].includes(P0.name), pool = ['family', 'travel', 'read', 'fun'], weight = (g) => (home && g === 'family' ? 3 : 1), gs = [];
      if (u() >= 0.15) for (let k = u() < 0.5 ? 1 : 2; k > 0; k--) { const left = pool.filter((g) => !gs.includes(g)), tot = left.reduce((t, g) => t + weight(g), 0); let x = u() * tot; gs.push(left.find((g) => (x -= weight(g)) < 0) || left[left.length - 1]); }
      arms.set('goals', (said.goals = gs));
    }
    if (meet === 'tap' && item.ask.includes('born')) arms.set('born', (said.born = u() < 0.2 ? 0 : 1960 + Math.floor(u() * 50)));
    out.about = { ...said, day: sess.day, place: sess.cards, how: meet };
    clock.t += 1000 * (meet === 'swipe' ? 1 : 6 + 4 * item.ask.length);
    return { kind: 'about', fmt: null, row: { k: 'card', at: clock.t, ...what(item), ms: clock.t - t0, state: 'done', how: 'swipe' }, done: true, out: null };
  }
  // The review run: chase.js createRun's chase through the phrases (no rung: v1's knobs), each said from memory
  function runCard(item, prevFmt) {
    const ps = item.ps, lv = Math.max(0, ...ps.map((p) => p.level ?? 1)), t0 = clock.t, m = mode(data.byId[ps[0].scn], 'run');
    const scn = { id: 'review-run', format: 'chase', review: true, level: lv, chase: { start: 18, close: 1, gain: 8, loss: 5, max: 23 },
      steps: [{ narr: '' }, ...ps.map((p, i) => ({ say: { id: `r${i}`, pid: p.id, answers: p.answers, need: p.need, level: p.level, again: true } })), { narr: '', finale: true }, { end: 'win' }] };
    const { A, knobs } = rung(item, ps.map((p) => p.id), m), c = { A, knobs, after: () => false }, ch = chance((id) => id);
    const pbar = mean(ps.map((p) => { const R = recall(p.id), z = T.zOf(P, p.id, wayOf(m), A); return R * σ(z + MEM) + (1 - R) * σ(z); }));
    const at = leaving(pbar, prevFmt === 'chase', false, ps.length);
    let right = 0, n = 0;
    const res = T.play(P, scn, c, { mode: () => m, clock, chance: ch, chars: true, leave: (k) => k >= at, time: (think) => (clock.t += 1000 * (4 + think)),
      emit(row) {
        row.task = 'review'; // a review run's line: recall after a while
        if (row.att === 1) { row._p = reviewGuess(row.id, m, A); if (told) inform(told[0], told[1], told[2], 0.5); }
        if (row.res === 'ok') record(row.id, Math.min(row.free >= 2 ? 1 : row.free >= 1 ? 2 : 3, row.pinyin && row.perfect && !(row.hint > (row.free || 0)) ? 3 : row.stars));
        hear(row);
      },
      line(row, { att, right: ok }) {
        if (att === 1) { n++; right += ok; tally(ok); learn(wayOf(m), data.phraseById[row.id]?.format === 'call'); out.calR.push([row._p, ok]); out.cal.push([row._p, ok]); }
        met(row.id, att === 1 && ok);
      } });
    const left = res.out === 'left', outc = left ? null : res.out === 'lose' ? 'lose' : 'win';
    if (!left) marks.done('review-run', { stars: 2, outcome: outc });
    clock.t += 5000;
    // the phrases it never reached are as due as before (mix.js's run leave(), for a run that got going)
    const unreached = ps.slice(n).map((p) => p.id);
    if (n && unreached.length) { r?.unsee(unreached); dv?.unsee(unreached); ref?.unsee(unreached); }
    return { kind: 'run', fmt: 'chase', row: { k: 'card', at: clock.t, ...what(item), ms: clock.t - t0, state: left ? 'playing' : 'done', how: 'swipe', ...(left ? {} : { out: outc }), ...(n ? { asked: n } : {}) }, done: !left, out: left ? (n ? 'left' : 'skip') : outc, win: outc === 'win', lost: outc === 'lose', misses: n - right, pbar };
  }
  // A word to write: traced, then from memory (again: from memory only), at the last card's rung (its leniency)
  function write(item, prevFmt) {
    const w = item.item, id = 'write:' + w.word, A = S.last() ?? 2, t0 = clock.t, n = [...w.word].length;
    if (leaving(0.6, prevFmt === 'write') < Infinity) { clock.t += 3000; return { kind: 'write', fmt: 'write', row: { k: 'card', at: clock.t, ...what(item), ms: 3000, state: 'idle', how: 'swipe' }, done: false, out: 'skip' }; }
    const z = SKILLS.reduce((t, k) => t + (WAYS.write[k] || 0) * P.th[k], -W.words.get(w.word) + P.beta[A]), R = recall(id), p = R ? R * σ(z + MEM) + (1 - R) * σ(z) : σ(z), ok = rA() < p;
    const stars = ok ? 3 : rA() < 0.5 ? 2 : 1;
    clock.t += 1000 * ((w.again ? 0 : 10 * n) + 12 * n + 6);
    record(id, stars); met(id, ok); learn('write', false);
    return { kind: 'write', fmt: 'write', row: { k: 'card', at: clock.t, ...what(item), ms: clock.t - t0, state: 'done', how: 'swipe', stars }, done: true, out: stars >= 2 ? 'win' : 'miss', win: stars >= 2, felt: true, misses: +!ok, pbar: p };
  }
  // A line of the cast to say back: the middle one once the story was seen through, else its first (mix.js heard())
  function shadow(item, prevFmt) {
    if (hush) out.hushShadow++; // (none should come: rank.js deals no shadow card in quiet mode)
    const it = marks.doneAll()[item.item.scn.id]?.outcome === 'win' ? item.item : { ...item.item, step: linesToShadow(item.item.scn)[0] };
    const scn = it.scn, m = P.mic ? 'speak' : 'self', t0 = clock.t, b = W.echoes.get(scn.id + ':' + it.step.zh) ?? L.typical(scn.level), secs = m === 'speak' ? 15 : 0;
    if (leaving(0.6, prevFmt === 'shadow') < Infinity) { clock.t += 3000; return { kind: 'shadow', fmt: 'shadow', row: { k: 'card', at: clock.t, ...what(item), ms: 3000, state: 'idle', how: 'swipe' }, done: false, out: 'skip' }; }
    clock.t += 8000;
    const a = panel(SKILLS.reduce((t, k) => t + (WAYS.shadow[k] || 0) * P.th[k], -b + P.beta[2]), 'shadow:' + scn.id + ':' + it.step.zh, m, secs);
    hear(lineRow({ id: `shadow:${scn.id}:${it.step.zh}`, task: 'shadow', lv: scn.level, mode: m, ms: a.ms, clock: secs, assist: 2, res: a.said || m === 'self' ? 'ok' : 'timeout', stars: a.said ? 3 : m === 'self' ? 1 : 0, ...(a.said ? (m === 'self' ? { self: true } : { perfect: true }) : m === 'self' ? { self: true, hint: 2, tries: 1 } : {}) }));
    met('shadow:' + scn.id + ':' + it.step.zh, a.ok); learn('shadow', false);
    clock.t += 3000;
    return { kind: 'shadow', fmt: 'shadow', row: { k: 'card', at: clock.t, ...what(item), ms: clock.t - t0, state: 'done', how: 'swipe', asked: 1 }, done: true, out: a.ok ? 'win' : 'miss', win: a.ok, felt: a.said, misses: +!a.ok, pbar: a.p };
  }
  const play = (item, prevFmt) => {
    out.kinds[item.kind] = (out.kinds[item.kind] || 0) + 1;
    if (item.kind === 'scn' || item.kind === 'challenge') return story(item, prevFmt);
    if (item.kind === 'review') return review(item, prevFmt);
    if (item.kind === 'bonus') return review(item, prevFmt, 'bonus');
    if (item.kind === 'about') return about(item);
    if (item.kind === 'run') return runCard(item, prevFmt);
    if (item.kind === 'write') return write(item, prevFmt);
    if (item.kind === 'shadow') return shadow(item, prevFmt);
    clock.t += item.kind === 'recap' ? 8000 : 3000;
    return { kind: item.kind, fmt: null, row: { k: 'card', at: clock.t, ...what(item), ms: 3000, state: 'done', how: 'swipe' }, done: true, out: null };
  };

  // ---------- the days: a visit each, while they keep coming back ----------
  const timed = (place) => { const t = performance.now(), p = r.next(), ms = performance.now() - t; out.pickMs += ms; out.picks++; if (p) { ref?.pick(p, place, clock.t); onPick?.(p, place, ms); } return p; };
  for (let day = 0; day < days; day++) {
    clock.t = T0 + day * DAY + Math.floor(luck('day', day)() * 4 * 3600e3);
    sess = { day, start: clock.t, cards: 0, lines: 0, right: 0, results: [], minutes: 0, win: false, frustrated: false, fresh: 0, served: 0, dueAt: [...pending.values()].filter((e) => e.due <= clock.t).length };
    hush = !!dy && luck('quiet', day)() < hushed; out.quiet += hush;
    ref?.visit();
    // For You: one card ahead, picked as the card before it comes on screen, and again once that card is done (mix.js);
    // v1: v1's more() as the feed asked it, three cards ahead (a batch as the card on screen is the third from last)
    // (prev: the card before, for what a recap followed; sure: a sure win just won, for what followed it; each as its rows
    // tell it (felt: a self-rater's claim taken at their word, a word written to its end done), all the ranker can know)
    let cur = null, place = 0, prevFmt = null, last = null, prev = null, sure = false;
    const queue = [];
    if (dealer === 'foryou') { r = ranker(); cur = timed(0); if (cur) out.firsts.push({ p: cur.why.p, rule: cur.why.rule, kind: cur.item.kind }); }
    else { dv = dealV1({ data, srs, marks, now, runs: true }); queue.push(...dv.more()); }
    for (let qi = 0; ; qi++) {
      let item, ahead = null;
      if (r) { if (!cur) break; item = cur.item; ahead = timed(place + 1); }
      else { if (qi >= queue.length) break; if (qi >= queue.length - 3) queue.push(...dv.more()); item = queue[qi]; }
      rE = luck('card', day, sess.cards);
      const res = play(item, prevFmt);
      if (item.kind === 'challenge' && res.win) out.chWon++;
      if (item.kind === 'scn') { out.fmts[item.scn.format] = (out.fmts[item.scn.format] || 0) + 1; if (r) out.cls[cur.why.cls || '?'] = (out.cls[cur.why.cls || '?'] || 0) + 1; }
      if (r) out.rules[cur.why.rule] = (out.rules[cur.why.rule] || 0) + 1;
      if (r && item.kind === 'scn' && cur.why.place && cur.why.rule !== 'hook') out.placeTau[cur.why.tau] = (out.placeTau[cur.why.tau] || 0) + 1; // (placing's stories, by the τ they were aimed at)
      const won = (x) => !!(x?.felt ?? x?.win);
      if (item.kind === 'recap') out.recaps[won(prev) ? 'win' : 'not']++;
      if (sure) out.sure[item.kind === 'recap' ? 'recap' : 'not']++;
      sure = !!r && cur.why.rule === 'sure win' && won(res);
      if (item.kind === 'scn' && item.scn.series && res.out !== 'skip' && !out.eps.includes(item.scn.series.ep)) out.eps.push(item.scn.series.ep); // episodes, as first played
      if (P0.name === 'new' && res.call3 && out.sessions.length < 3 && res.out !== 'skip') out.calls3++;
      if (r && res.done) ahead = timed(place + 1) ?? ahead; // its end screen up: the card after it picked again
      // and then it's left: swiped on, or, where they stop here (an end card always, a recap half the time, else p2.md's
      // chance), the phone put away on it, its row logged as the page goes ('hide': the card dealt below it never seen,
      // so an about card dealt there comes at the next visit's start)
      const stopU = luck('stop', day, sess.cards)(), minutes = (clock.t - sess.start) / MIN;
      const stops = item.kind === 'end' || (endless ? sess.cards + 1 >= most : item.kind === 'recap' ? stopU < RECAP_STOP : stopU < 0.04 + 0.25 * E.fail * (!!res.lost || res.misses >= 2) + 0.1 * E.bore * ((res.pbar ?? 0) > E.easy) + 0.01 * minutes);
      hear(stops ? { ...res.row, how: 'hide' } : res.row);
      sess.cards++; sess.results.push(res);
      // (the about card plays nothing, and the bonus line, missed, is no loss: neither is a card the end on a high counts)
      if (!['recap', 'end', 'about'].includes(item.kind)) prevFmt = res.fmt;
      if (!['recap', 'end', 'about', 'bonus'].includes(item.kind)) { prev = res; if (res.out !== 'skip') last = res; }
      if (r) { cur = ahead; place++; }
      if (stops) break;
    }
    // the visit ends: what it came to, and whether they come back tomorrow
    sess.minutes = (clock.t - sess.start) / MIN;
    sess.win = !!last?.win;
    const last3 = sess.results.filter((x) => x.kind !== 'recap' && x.kind !== 'end').slice(-3);
    sess.frustrated = (sess.lines >= 3 && sess.right / sess.lines < 0.5) || last3.filter((x) => x.lost || x.out === 'left' || x.out === 'skip').length >= 2;
    delete sess.results;
    out.sessions.push(sess);
    for (const [, e] of pending) if (e.due <= clock.t && ++e.waited === 2) out.due.late++;
    if (!endless && luck('back', day)() >= 0.55 + 0.15 * sess.win + 0.1 * (sess.minutes >= 8) - 0.15 * E.fail * sess.frustrated) break;
  }
  for (const [, e] of pending) if (e.due <= clock.t && e.waited < 2) out.due.open++;
  out.gains = Object.fromEntries(SKILLS.map((k) => [k, P.th[k] - P0.th[k]]));
  out.gain = mean(SKILLS.map((k) => out.gains[k]));
  if (ref) out.audit = { breaks: ref.breaks, forced: ref.forced, gave: ref.gave, picks: ref.picks, firsts: ref.firsts };
  return out;
}

// ---------- many learners, and what they come to ----------
export function simulate({ data, seed = 1, n = 200, days = 14, personas = PERSONAS, assumes = Object.keys(ASSUME), dealers = DEALERS, tau = 'ranker', audit = false, review = REVIEW, hold = 3, listening = 0.5, loops = true, quiet = QUIET, progress = () => {} }) {
  const W = world(data, seed, { listening }), res = {};
  for (const persona of personas) {
    for (let i = 0; i < n; i++) {
      const P = person(W, persona, i, seed);
      for (const assume of assumes) for (const dealer of dealers) (((res[persona] ||= {})[assume] ||= {})[dealer] ||= []).push(run(W, P, { dealer, assume, seed, days, tau, audit: audit && dealer === 'foryou', review, hold, loops, quiet }));
    }
    progress(persona);
  }
  return res;
}
// expected calibration error over deciles of the prediction
export function ece(pairs) {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const [p, y] of pairs) if (p != null) { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n++; b.p += p; b.y += +y; }
  const n = bins.reduce((t, b) => t + b.n, 0);
  return { ece: bins.reduce((t, b) => t + (b.n ? Math.abs(b.p - b.y) : 0), 0) / Math.max(1, n), n, bins };
}
export function summary(runs) {
  const ss = runs.flatMap((o) => o.sessions), s1 = runs.map((o) => o.sessions[0]).filter(Boolean), sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
  const placed = runs.filter((o) => o.place), share = (f) => placed.length ? placed.filter(f).length / placed.length : NaN;
  const due = runs.reduce((t, o) => ({ ok: t.ok + o.due.ok, late: t.late + o.due.late }), { ok: 0, late: 0 });
  const firsts = runs.flatMap((o) => o.firsts), audits = runs.filter((o) => o.audit);
  const sumOf = (k) => runs.reduce((t, o) => { for (const [x, v] of Object.entries(o[k])) t[x] = (t[x] || 0) + v; return t; }, {});
  // placed within 0.6, over the learners the best estimator's bound covers (a true level not held at 0 or 5), and how many
  const within = (k) => { const w = placed.filter((o) => o.place.best[k] != null); return { share: w.length ? w.filter((o) => o.place[k] < 0.6).length / w.length : NaN, n: w.length }; };
  return {
    learners: runs.length, success: sum(ss, (s) => s.right) / sum(ss, (s) => s.lines), success1: sum(s1, (s) => s.right) / sum(s1, (s) => s.lines),
    // session 1 without the hook's lines (p3.md fixes the hook: its story, level and rung), and the hook's own
    success1x: (sum(s1, (s) => s.right) - sum(runs, (o) => o.first?.ok || 0)) / (sum(s1, (s) => s.lines) - sum(runs, (o) => o.first?.lines || 0)), hookOk: sum(runs, (o) => o.first?.ok || 0) / Math.max(1, sum(runs, (o) => o.first?.lines || 0)),
    ece: ece(runs.flatMap((o) => o.cal)).ece, eceR: ece(runs.flatMap((o) => o.calR)), eceN: ece(runs.flatMap((o) => o.calN)), eceM: ece(runs.flatMap((o) => o.calM)), atA0: mean(runs.flatMap((o) => o.hard)), place: { say: share((o) => o.place.say < 0.6), listen: share((o) => o.place.listen < 0.6), read: share((o) => o.place.read < 0.6), all: share((o) => o.place.say < 0.6 && o.place.listen < 0.6 && o.place.read < 0.6), n: placed.length, within: { say: within('say'), listen: within('listen'), read: within('read') }, best: Object.fromEntries(['say', 'listen', 'read'].map((k) => [k, mean(placed.map((o) => o.place.best[k]).filter((x) => x != null))])), sd: Object.fromEntries(['say', 'listen', 'read'].map((k) => [k, mean(placed.map((o) => o.place.best.sd[k]))])) },
    due: due.ok / Math.max(1, due.ok + due.late), dueN: due.ok + due.late, wins: ss.filter((s) => s.win).length / ss.length, d7: runs.filter((o) => o.sessions.some((s) => s.day === 7)).length / runs.length,
    d1: runs.filter((o) => o.sessions.some((s) => s.day === 1)).length / runs.length, gain: mean(runs.map((o) => o.gain)), calls3: sum(runs, (o) => o.calls3),
    minutes: mean(ss.map((s) => s.minutes)), cards: mean(ss.map((s) => s.cards)), visits: mean(runs.map((o) => o.sessions.length)), lines: sum(ss, (s) => s.lines) / runs.length,
    pick: sum(runs, (o) => o.pickMs) / Math.max(1, sum(runs, (o) => o.picks)), picks: sum(runs, (o) => o.picks), rungs: runs.reduce((t, o) => t.map((x, i) => x + o.rungs[i]), [0, 0, 0, 0, 0, 0]),
    kinds: sumOf('kinds'), fmts: sumOf('fmts'), cls: sumOf('cls'), rules: sumOf('rules'), recaps: sumOf('recaps'), sure: sumOf('sure'), forced: firsts.filter((f) => f.rule === 'first*').length / Math.max(1, firsts.length), firstP: mean(firsts.map((f) => f.p).filter((p) => p != null)),
    breaks: audits.flatMap((o) => o.audit.breaks), audited: sum(audits, (o) => o.audit.picks), quiet: sum(runs, (o) => o.quiet), hushShadow: sum(runs, (o) => o.hushShadow), challengeWon: sum(runs, (o) => o.chWon) / Math.max(1, sum(runs, (o) => o.kinds.challenge || 0)),
    eps: { reached: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => runs.filter((o) => Math.max(0, ...o.eps) === k).length), order: runs.filter((o) => o.eps.some((e, i) => i && e < o.eps[i - 1])).length },
    ...first(runs),
  };
}
// The first session (p3.md), For You's: placement at its end (within one level of the true say, listen and read levels,
// over the learners whose placement ended; and over those the best estimator's bound covers, a true level not within
// one of 0 or 5, its share beside the model's on the same learners); the first line (right as played, at FIRST_LINE,
// and its true chance at A4 and at A5, the FIRST_LINE rule); the about card's answers; the bonus line; calls'
// calibration (the truth's listening term, which the model doesn't know)
function first(runs) {
  const sh = (a, f) => (a.length ? a.filter(f).length / a.length : NaN), K = ['say', 'listen', 'read'];
  const ended = runs.filter((o) => o.placed), fs = runs.filter((o) => o.first), ab = runs.filter((o) => o.about), bo = runs.filter((o) => o.bonus);
  const within1 = (k) => { const w = ended.filter((o) => o.placed.best[k] != null); return { share: sh(w, (o) => o.placed[k] < 1), n: w.length, best: mean(w.map((o) => o.placed.best[k])) }; };
  return {
    placed: { n: ended.length, of: fs.length, ...Object.fromEntries(K.map((k) => [k, sh(ended, (o) => o.placed[k] < 1)])), all: sh(ended, (o) => K.every((k) => o.placed[k] < 1)), within: Object.fromEntries(K.map((k) => [k, within1(k)])),
      off: Object.fromEntries(K.map((k) => [k, mean(ended.map((o) => o.placed.off[k]))])), lines: mean(ended.map((o) => o.placed.lines)), call: sh(ended, (o) => o.placed.call), chat: sh(ended, (o) => o.placed.chat), bonus: sh(ended, (o) => o.placed.bonus), later: sh(ended, (o) => o.placed.day > 0), sd: mean(ended.map((o) => o.placed.sd)),
      // by the home question's answer (the persona's prior): told as it is, told another, or left
      home: Object.fromEntries(['right', 'wrong', 'skipped'].map((h) => { const w = ended.filter((o) => o.placed.home === h); return [h, { n: w.length, ...Object.fromEntries(K.map((k) => [k, sh(w, (o) => o.placed[k] < 1)])) }]; })),
      tau: runs.reduce((t, o) => { for (const [x, v] of Object.entries(o.placeTau)) t[x] = (t[x] || 0) + v; return t; }, {}) },
    // first meetings a level or more above the level you say at (the bonus line among them): right, against the model's chance
    up: (() => { const a = runs.flatMap((o) => o.calUp); return { n: a.length, ok: mean(a.map((x) => +x[1])), p: mean(a.map((x) => x[0])) }; })(),
    first: { n: fs.length, played: fs.filter((o) => o.first.right != null).length, right: mean(fs.filter((o) => o.first.right != null).map((o) => +o.first.right)), p4: mean(fs.map((o) => o.first.p4)), p5: mean(fs.map((o) => o.first.p5)), at: fs.reduce((t, o) => ((t[o.first.A] = (t[o.first.A] || 0) + 1), t), {}) },
    about: { n: ab.length, home: sh(ab, (o) => o.about.home != null), none: sh(ab.filter((o) => o.about.goals), (o) => !o.about.goals.length), goals: ab.reduce((t, o) => { for (const g of o.about.goals || []) t[g] = (t[g] || 0) + 1; return t; }, {}), later: sh(ab, (o) => o.about.day > 0) },
    bonus: { n: bo.length, ok: sh(bo, (o) => o.bonus.ok), p: mean(bo.map((o) => o.bonus.p)), lv: bo.reduce((t, o) => ((t[o.bonus.lv] = (t[o.bonus.lv] || 0) + 1), t), {}) },
    eceC: ece(runs.flatMap((o) => o.calC)),
  };
}

// ---------- the report ----------
const hasSeries = (res) => Object.values(res).some((a) => Object.values(a).some((d) => (d.foryou || []).some((o) => o.eps.length)));
const f2 = (x, d = 2) => (x == null || Number.isNaN(x) ? '–' : x.toFixed(d)), pc = (x) => (x == null || Number.isNaN(x) ? '–' : `${Math.round(100 * x)}%`);
export function report({ res, dir, seed, n, days, tau, review = REVIEW, hold = 3, listening = 0.5, loops = true, quiet = QUIET }) {
  const ps = Object.keys(res), as = Object.keys(res[ps[0]]), sm = {};
  for (const p of ps) for (const a of as) for (const d of DEALERS) ((sm[p] ||= {})[a] ||= {})[d] = summary(res[p][a][d] || []); // a dealer not run: dashes
  const each = (f) => ps.flatMap((p) => as.map((a) => f(sm[p][a], p, a)));
  const fy = (p, a) => sm[p][a].foryou, v1 = (p, a) => sm[p][a].v1, ld = (p, a) => sm[p][a].ladder;
  const lines = [];
  lines.push(`# Simulator: ${dir}, seed ${seed}`, '', `${n} learners a persona × ${ps.length} personas (${ps.join(', ')}) × ${days} days × ${as.length} engagement assumptions (${as.join(', ')}); dealers For You (rank.js), v1 (deal-v1 at A2, no ladder: as it shipped) and ladder (deal-v1 with the assist ladder: today's app). Paired: each learner is the same true learner, with the same seeds, under every dealer. A story is played at ${tau === 'ranker' ? "the τ the ranker scored it at (mix.js passing the item's tau to assisted())" : `forCard's own τ ${tau}`}; the review levers ${leverName(review)}${leverName(review) === leverName(REVIEW) ? ' (as shipped)' : ` (shipped: ${leverName(REVIEW)})`}${hold !== 3 ? `; what-if: R7 held through ${hold} visits (3 as built)` : ''}${listening !== 0.5 ? `; what-if: the truth's caller term ${listening} logits a level (0.5 as built)` : ''}; ${loops ? `For You's loops (P5a) on: today's challenge (a rung harder in the truth), episodes a day at a time, endings to find, ${pc(quiet)} of its visits in quiet mode` : 'what-if: For You without P5a\'s loops (as P3 left it)'}. \`node tools/sim.mjs --data=${dir} --seed=${seed} --n=${n}${tau !== 'ranker' ? ` --tau=${tau}` : ''}${leverName(review) !== leverName(REVIEW) ? ` --review=${leverName(review).replace(/\+/g, ',')}` : ''}${hold !== 3 ? ` --hold=${hold}` : ''}${listening !== 0.5 ? ` --listening=${listening}` : ''}${!loops ? ' --loops=off' : quiet !== QUIET ? ` --quiet=${quiet}` : ''}\` (the same seed, the same report: nothing here is timed)`, '');
  // The done-when table: the worst over the four personas the content is for (Mandarin and dialect at home, studied,
  // new) and the three assumptions, and where; advanced beside it, judged apart (assist-check's fluent players: these
  // builds have no line hard enough for them, see "success had every line been at A0")
  const four = ps.filter((p) => p !== 'advanced'), adv = ps.includes('advanced') ? 'advanced' : null;
  const worst = (f, lo, who = four) => { const v = who.flatMap((p) => as.map((a) => [f(sm[p][a], p, a), `${p}/${a}`])).filter(([x]) => Number.isFinite(x)); return v.sort((x, y) => (lo ? x[0] - y[0] : y[0] - x[0]))[0] || [NaN, '']; };
  const at = (f, lo) => (adv ? worst(f, lo, [adv]) : [NaN, '']);
  const row = (check, thr, val, advVal, pass) => `| ${check} | ${thr} | ${val} | ${advVal} | ${pass ? 'pass' : '**fail**'} |`;
  lines.push(`## Done when (README §11, P2): For You, the worst of the ${four.length} personas the content is for and the ${as.length} assumptions`, '', '| Check | Threshold | For You (worst: where) | advanced (worst) | |', '|---|---|---|---|---|');
  const sl = worst((x, p, a) => fy(p, a).success, true), sh = worst((x, p, a) => fy(p, a).success, false), s1 = worst((x, p, a) => fy(p, a).success1, true);
  const asl = at((x, p, a) => fy(p, a).success, true), ash = at((x, p, a) => fy(p, a).success, false);
  lines.push(row('Line success, every persona and assumption', '0.72–0.88', `${f2(sl[0])} (${sl[1]}) – ${f2(sh[0])} (${sh[1]})`, `${f2(asl[0])}–${f2(ash[0])}`, sl[0] >= 0.72 && sh[0] <= 0.88));
  const s1x = worst((x, p, a) => fy(p, a).success1x, true), hk = worst((x, p, a) => fy(p, a).hookOk, true);
  lines.push(row('… in session 1', '≥ 0.65', `${f2(s1[0])} (${s1[1]}); without the hook's lines ${f2(s1x[0])} (${s1x[1]}), the hook's own ${f2(hk[0])} (${hk[1]})`, f2(at((x, p, a) => fy(p, a).success1, true)[0]), s1[0] >= 0.65));
  const audited = each((x, p, a) => fy(p, a).audited).reduce((t, x) => t + x, 0), breaks = each((x, p, a) => fy(p, a).breaks.length).reduce((t, x) => t + x, 0);
  lines.push(row('Hard-rule breaks (every persona)', '0 in 10,000 picks', audited ? `${breaks} in ${audited.toLocaleString('en')} picks (tools/rules.mjs)` : 'not audited (--audit)', '(in the count)', audited ? breaks === 0 : false));
  const ec = worst((x, p, a) => fy(p, a).ece, false), ecN = worst((x, p, a) => fy(p, a).eceN.ece, false);
  lines.push(row('Calibration error (ECE)', '≤ 0.05', `${f2(ec[0], 3)} (${ec[1]}); first meetings ${f2(ecN[0], 3)} (${ecN[1]})`, f2(at((x, p, a) => fy(p, a).ece, false)[0], 3), ec[0] <= 0.05));
  const pl = (k) => worst((x, p, a) => fy(p, a).place[k], true), bp = (k) => worst((x, p, a) => fy(p, a).place.best[k], false);
  // (over persona and assumption with 20 such learners at least: fewer say little)
  const pw = (k) => worst((x, p, a) => (fy(p, a).place.within[k].n >= 20 ? fy(p, a).place.within[k].share : NaN), true);
  lines.push(row('Placement error < 0.6 after 12 lines, say / listen / read', '80% of learners', `${['say', 'listen', 'read'].map((k) => `${pc(pl(k)[0])} (${pl(k)[1]})`).join(' / ')}; of the learners the bound covers (a level not held at 0 or 5; 20 of them at least) ${['say', 'listen', 'read'].map((k) => `${pc(pw(k)[0])} (${pw(k)[1]})`).join(' / ')}, the best estimator's ${['say', 'listen', 'read'].map((k) => pc(bp(k)[0])).join(' / ')} at most`, ['say', 'listen', 'read'].map((k) => pc(at((x, p, a) => fy(p, a).place[k], true)[0])).join(' / '), ['say', 'listen', 'read'].every((k) => pl(k)[0] >= 0.8)));
  const du = worst((x, p, a) => fy(p, a).due, true), dv = worst((x, p, a) => v1(p, a).due, false);
  lines.push(row('Due reviews served within 2 sessions', '≥ 85%', `${pc(du[0])} (${du[1]}); v1 ${pc(dv[0])} at best`, pc(at((x, p, a) => fy(p, a).due, true)[0]), du[0] >= 0.85));
  const wi = worst((x, p, a) => fy(p, a).wins, true);
  lines.push(row('Sessions ending on a win', '≥ 70%', `${pc(wi[0])} (${wi[1]})`, pc(at((x, p, a) => fy(p, a).wins, true)[0]), wi[0] >= 0.7));
  const d7 = worst((x, p, a) => fy(p, a).d7 / v1(p, a).d7, true);
  lines.push(row('D7 proxy (still playing on day 7)', '≥ v1 × 1.10', `× ${f2(d7[0])} (${d7[1]})`, `× ${f2(at((x, p, a) => fy(p, a).d7 / v1(p, a).d7, true)[0])}`, d7[0] >= 1.1));
  const ga = worst((x, p, a) => fy(p, a).gain - v1(p, a).gain, true);
  lines.push(row('True skill gain at day 14', '≥ v1', `${ga[0] >= 0 ? '+' : ''}${f2(ga[0], 3)} logits over v1 (${ga[1]})`, f2(at((x, p, a) => fy(p, a).gain - v1(p, a).gain, true)[0], 3), ga[0] >= 0));
  const c3 = ps.includes('new') ? as.reduce((t, a) => t + fy('new', a).calls3, 0) : NaN;
  lines.push(row('A new learner meets a listen-L3 call in the first 3 sessions', 'never', ps.includes('new') ? `${c3} times in ${as.length * sm.new[as[0]].foryou.learners} new learners' runs (v1: ${as.reduce((t, a) => t + v1('new', a).calls3, 0)})` : 'no new learners run', '–', c3 === 0));
  lines.push(`| A pick | under 2 ms on a phone | timed by tools/rank-check.mjs, not here (a report must be the same twice) | | |`, '');
  // P3's: placement at its end, the first line, and due reviews against v1 for every persona (the review levers' rule)
  lines.push(`## Done when (README §11, P3): For You, the worst of the ${four.length} personas and the ${as.length} assumptions`, '', '| Check | Threshold | For You (worst: where) | advanced (worst) | |', '|---|---|---|---|---|');
  const pe = (k) => worst((x, p, a) => fy(p, a).placed[k], true), pb = (k) => worst((x, p, a) => (fy(p, a).placed.within[k].n >= 20 ? fy(p, a).placed.within[k].share : NaN), true), pB = (k) => worst((x, p, a) => fy(p, a).placed.within[k].best, false);
  lines.push(row('Placed within one level at the end of placement, say / listen / read', '≥ 90%', `${['say', 'listen', 'read'].map((k) => `${pc(pe(k)[0])} (${pe(k)[1]})`).join(' / ')}; of the learners the bound covers (a level not within one of 0 or 5; 20 of them at least) ${['say', 'listen', 'read'].map((k) => `${pc(pb(k)[0])} (${pb(k)[1]})`).join(' / ')}, the best estimator's ${['say', 'listen', 'read'].map((k) => pc(pB(k)[0])).join(' / ')} at most`, ['say', 'listen', 'read'].map((k) => pc(at((x, p, a) => fy(p, a).placed[k], true)[0])).join(' / '), ['say', 'listen', 'read'].every((k) => pe(k)[0] >= 0.9)));
  lines.push(row('Within 0.6 after 12 lines (P2\'s row)', 'reported against the bound (80% wanted)', 'above, in P2\'s table', '', ['say', 'listen', 'read'].every((k) => pl(k)[0] >= 0.8)));
  const fr = worst((x, p, a) => fy(p, a).first.right, true), f4 = worst((x, p, a) => fy(p, a).first.p4, true), f5 = worst((x, p, a) => fy(p, a).first.p5, true);
  lines.push(row(`The first line right, at FIRST_LINE (A${S.FIRST_LINE})`, '≥ 85% of each persona\'s learners', `${pc(fr[0])} (${fr[1]}); its true chance at A4 ${pc(f4[0])} (${f4[1]}), at A5 ${pc(f5[0])} (${f5[1]})`, pc(at((x, p, a) => fy(p, a).first.right, true)[0]), fr[0] >= 0.85));
  const dr = worst((x, p, a) => fy(p, a).due - v1(p, a).due, true);
  lines.push(row('Due reviews served in 2 visits, against v1, every persona', 'at least v1\'s', `${pc(du[0])} worst; For You − v1 ${dr[0] >= 0 ? '+' : ''}${Math.round(100 * dr[0])} points (${dr[1]})`, '', dr[0] >= 0));
  lines.push(row('D7 against v1 (the review levers\' bar)', '≥ v1 × 1.25', `× ${f2(d7[0])} (${d7[1]})`, '', d7[0] >= 1.25), '');
  // per persona and assumption
  const table = (title, cols, f) => { lines.push(`### ${title}`, '', `| persona | assumption | ${cols.join(' | ')} |`, `|---|---|${cols.map(() => '---').join('|')}|`); for (const p of ps) for (const a of as) lines.push(`| ${p} | ${a} | ${f(sm[p][a], p, a).join(' | ')} |`); lines.push(''); };
  lines.push('## Per persona and assumption', '');
  table('Line success (first time, no help beyond the rung\'s)', ['For You', 'session 1', 'session 1 less the hook (its own)', 'v1', 'ladder', 'ladder, session 1'], (x) => [f2(x.foryou.success), f2(x.foryou.success1), `${f2(x.foryou.success1x)} (${f2(x.foryou.hookOk)})`, f2(x.v1.success), f2(x.ladder.success), f2(x.ladder.success1)]);
  table('Retention and learning', ['D1 For You / v1 / ladder', 'D7 For You / v1 / ladder', 'D7 ÷ v1', 'gain For You / v1 / ladder', 'visits', 'minutes a visit', 'cards a visit'], (x) => [`${pc(x.foryou.d1)} / ${pc(x.v1.d1)} / ${pc(x.ladder.d1)}`, `${pc(x.foryou.d7)} / ${pc(x.v1.d7)} / ${pc(x.ladder.d7)}`, f2(x.foryou.d7 / x.v1.d7), `${f2(x.foryou.gain, 3)} / ${f2(x.v1.gain, 3)} / ${f2(x.ladder.gain, 3)}`, `${f2(x.foryou.visits, 1)} / ${f2(x.v1.visits, 1)} / ${f2(x.ladder.visits, 1)}`, `${f2(x.foryou.minutes, 1)} / ${f2(x.v1.minutes, 1)} / ${f2(x.ladder.minutes, 1)}`, `${f2(x.foryou.cards, 1)} / ${f2(x.v1.cards, 1)} / ${f2(x.ladder.cards, 1)}`]);
  table('Sessions, reviews, calibration', ['ending on a win (For You / v1 / ladder)', 'due served in 2 (For You / v1 / ladder)', 'ECE all (For You)', 'first meetings', 'story lines met before', 'reviews (n)', 'first cards forced (no story at p̄ 0.85)', 'first card p̄', 'success had every line been at A0'], (x) => [`${pc(x.foryou.wins)} / ${pc(x.v1.wins)} / ${pc(x.ladder.wins)}`, `${pc(x.foryou.due)} / ${pc(x.v1.due)} / ${pc(x.ladder.due)}`, f2(x.foryou.ece, 3), f2(x.foryou.eceN.ece, 3), f2(x.foryou.eceM.ece, 3), `${f2(x.foryou.eceR.ece, 3)} (${x.foryou.eceR.n})`, pc(x.foryou.forced), f2(x.foryou.firstP), f2(x.foryou.atA0)]);
  table('Placement after 12 lines (share within 0.6 of the true level), and the best estimator\'s uncertainty after the same 12 lines (sd in levels; the share within 0.6 it allows where a level isn\'t at 0 or 5)', ['say', 'listen', 'read', 'all three', 'best sd: say / listen / read', 'its share within 0.6', 'the model\'s, of the same learners', 'learners placed'], (x) => [pc(x.foryou.place.say), pc(x.foryou.place.listen), pc(x.foryou.place.read), pc(x.foryou.place.all), ['say', 'listen', 'read'].map((k) => f2(x.foryou.place.sd[k])).join(' / '), ['say', 'listen', 'read'].map((k) => pc(x.foryou.place.best[k])).join(' / '), ['say', 'listen', 'read'].map((k) => `${pc(x.foryou.place.within[k].share)} of ${x.foryou.place.within[k].n}`).join(' / '), x.foryou.place.n]);
  table('What For You dealt (cards, all visits) and the rungs its stories started at', ['stories', 'reviews', 'runs', 'writes', 'shadows', 'recaps', 'end cards', 'A0 … A5'], (x) => { const k = x.foryou.kinds, t = x.foryou.rungs.reduce((a, b) => a + b, 0) || 1; return [k.scn || 0, k.review || 0, k.run || 0, k.write || 0, k.shadow || 0, k.recap || 0, k.end || 0, x.foryou.rungs.map((r) => pc(r / t)).join(' ')]; });
  // the formats each persona is dealt (a format one never meets is a rule shutting it out: R7 held calls for 14 days),
  // how many of its stories were rematches (the engagement model charges a story seen before only in boredom-averse),
  // and where a rule gave way so a visit could go on
  const F4 = ['scene', 'call', 'chat', 'chase'], fm = (f) => F4.map((k) => f[k] || 0).join(' / ');
  table('The stories each dealer dealt, by format (scene / call / chat / chase); For You\'s rematches, rules given way, and how its visits ended on a high', ['For You', 'v1', 'ladder', 'rematches (For You)', 'format* / surest*', 'recaps after a win', 'a sure win won, then the recap'], (x) => { const c = x.foryou.cls, n = Object.values(c).reduce((a, b) => a + b, 0), { recaps: rc, sure: su } = x.foryou; return [fm(x.foryou.fmts), fm(x.v1.fmts), fm(x.ladder.fmts), n ? `${c.rematch || 0} (${pc((c.rematch || 0) / n)})` : '–', `${x.foryou.rules['format*'] || 0} / ${x.foryou.rules['surest*'] || 0}`, `${rc.win} of ${rc.win + rc.not}`, `${su.recap} of ${su.recap + su.not}`]; });
  // the first session, per persona: placement at its end, the first line, the about card, the bonus line, calls
  table('Placement at its end (12 placement lines): within one level of the true level, and the best estimator\'s after the same lines (on the learners its bound covers: a level not within one of 0 or 5)', ['placed (of hooked)', 'say', 'listen', 'read', 'all three', 'the model\'s, of the bound\'s learners', 'the bound\'s', 'the model less the truth, on average', 'lines', 'a call / a chat / the bonus in it', 'ended on a later day', 'g\'s sd'], (x) => { const q = x.foryou.placed, K = ['say', 'listen', 'read']; return [`${q.n} of ${q.of}`, pc(q.say), pc(q.listen), pc(q.read), pc(q.all), K.map((k) => `${pc(q.within[k].share)} of ${q.within[k].n}`).join(' / '), K.map((k) => pc(q.within[k].best)).join(' / '), K.map((k) => f2(q.off[k])).join(' / '), f2(q.lines, 1), `${pc(q.call)} / ${pc(q.chat)} / ${pc(q.bonus)}`, pc(q.later), f2(q.sd)]; });
  const TAUS = ['0.7', '0.88', '0.9', '0.92'], tauShare = (t) => { const n = Object.values(t).reduce((a, b) => a + b, 0); return n ? TAUS.map((k) => pc((t[k] || 0) / n)).join(' / ') : '–'; };
  table('Placement at its end by the home question\'s answer (the persona prior: told as it is, told another, or left): within one level, say / listen / read (learners); and the τ placing\'s stories were aimed at, 0.70 (placing) / 0.88 (tired) / 0.90 (a visit\'s start) / 0.92 (a loss)', ['told right', 'told another', 'left', 'placing τ 0.70 / 0.88 / 0.90 / 0.92'], (x) => { const q = x.foryou.placed, K = ['say', 'listen', 'read'], h = (k) => (q.home[k].n ? `${K.map((s) => pc(q.home[k][s])).join(' / ')} (${q.home[k].n})` : '–'); return [h('right'), h('wrong'), h('skipped'), tauShare(q.tau)]; });
  table(`The first line (the hook's first freeze, its first try), the about card and the bonus line; calls' calibration`, [`first line right (at A${S.FIRST_LINE}, played)`, 'its true chance at A4 / A5', 'about card: home answered', 'no goal', 'goals family / travel / read / fun', 'about card on a later day', 'bonus dealt (of hooked)', 'bonus right', 'its predicted chance', 'first meetings a level or more up: right / predicted (n)', 'ECE on calls (n)'], (x) => { const q = x.foryou; return [`${pc(q.first.right)} (${q.first.played})`, `${pc(q.first.p4)} / ${pc(q.first.p5)}`, pc(q.about.home), pc(q.about.none), ['family', 'travel', 'read', 'fun'].map((g) => q.about.goals[g] || 0).join(' / '), pc(q.about.later), `${q.bonus.n} of ${q.first.n}`, pc(q.bonus.ok), f2(q.bonus.p), `${pc(q.up.ok)} / ${pc(q.up.p)} (${q.up.n})`, `${f2(q.eceC.ece, 3)} (${q.eceC.n})`]; });
  // the loops (P5a), For You's
  if (loops) table(`The loops (P5a), For You's: today's challenge (dealt and played as a story a day, after placement), stories dealt for an ending not found, the later about card, quiet mode's visits (${pc(quiet)} of them) and the shadow cards in them`, ['challenges a visit', 'challenges won', 'ending rematches a visit', 'visits quiet', 'shadow cards while quiet'], (x) => [f2((x.foryou.kinds.challenge || 0) / Math.max(1, x.foryou.visits * x.foryou.learners)), pc(x.foryou.challengeWon), f2((x.foryou.cls.ending || 0) / Math.max(1, x.foryou.visits * x.foryou.learners)), `${x.foryou.quiet}`, `${x.foryou.hushShadow}`]);
  if (hasSeries(res)) table('A series (its episodes as first played): how far learners got, and any played out of order', ['furthest episode: none / 1 / 2 / 3 / more', 'out of order'], (x) => [x.foryou.eps.reached.slice(0, 4).concat(x.foryou.eps.reached.slice(4).reduce((a, b) => a + b, 0)).join(' / '), x.foryou.eps.order]);
  if (audited) {
    const bs = each((x, p, a) => fy(p, a).breaks.map((b) => `${p}/${a}: ${b.rule} (${b.kind} at place ${b.place})`)).flat();
    lines.push('## Hard rules', '', `${audited.toLocaleString('en')} picks audited by tools/rules.mjs (facts recomputed with learner.predict): ${bs.length ? bs.length + ' breaks' : 'no breaks'}.`, ...bs.slice(0, 20).map((b) => `- ${b}`), '');
  }
  return lines.join('\n');
}

// the review levers by name (rank.js REVIEW's): run10 (runs of up to ten), rung (reviews at the ladder's rung), rematch
// (one a visit ahead of new stories); none: P2's as built
export const levers = (s) => ({ run: /run10/.test(s) ? 10 : 5, rung: /rung/.test(s), rematch: /rematch/.test(s) });
export const leverName = (r) => [r.run === 10 && 'run10', r.rung && 'rung', r.rematch && 'rematch'].filter(Boolean).join('+') || 'none';

// ---------- the command ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const has = (k) => process.argv.includes(`--${k}`);
  const dir = opt('data', 'data'), seed = +opt('seed', 1), n = +opt('n', 200), days = +opt('days', 14), tau = opt('tau', 'ranker');
  const personas = opt('personas', PERSONAS.join(',')).split(','), assumes = opt('assume', Object.keys(ASSUME).join(',')).split(','), dealers = opt('dealers', DEALERS.join(',')).split(',');
  // the review levers (rank.js REVIEW): run10, rung, rematch, comma-separated, or none (P2's as built)
  const lv = opt('review', null), review = lv == null ? REVIEW : levers(lv);
  // what-ifs, for the evidence (p3.md's as-built): --hold=0 lifts R7 (its visits), --listening=0 drops the truth's caller term
  const hold = +opt('hold', 3), listening = +opt('listening', 0.5);
  // the loops (P5a): --loops=off deals For You as P3 left it; --quiet= the share of its visits in quiet mode
  const loops = opt('loops', 'on') !== 'off', quiet = +opt('quiet', QUIET);
  const t0 = performance.now(), data = load(dir);
  const res = simulate({ data, seed, n, days, personas, assumes, dealers, tau, review, hold, listening, loops, quiet, audit: has('audit'), progress: (p) => process.stderr.write(`${p} done (${((performance.now() - t0) / 1000).toFixed(0)} s)\n`) });
  const md = report({ res, dir, seed, n, days, tau, review, hold, listening, loops, quiet });
  const outDir = path.resolve(ROOT, opt('out', 'review/sim')), name = `${dir.replace(/\/data$/, '').replace(/^review\/gate\//, '').replace(/[/]/g, '-')}-${seed}${tau !== 'ranker' ? `-tau${tau}` : ''}${lv != null ? `-review-${lv.replace(/,/g, '+')}` : ''}${hold !== 3 ? `-hold${hold}` : ''}${listening !== 0.5 ? `-listening${listening}` : ''}${!loops ? '-loops-off' : quiet !== QUIET ? `-quiet${quiet}` : ''}.md`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, name), md);
  console.log(md);
  console.log(`\nwritten: ${path.relative(ROOT, path.join(outDir, name))}`);
}

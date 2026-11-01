// The learner model: what this player can do in Chinese, kept on this phone (ks.model) and never sent anywhere (the
// daily totals, tally.js, count only the about card's answers). Six skills, listening L, speaking S, vocabulary V, tones T, reading R and writing (typing) W, each a general level g plus
// the skill's own lean (θk = g + δk), with how sure of them the model is; and how hard each line has turned out to be for
// this player. Every answer panel and card the app logs moves it (events.on), one Bayesian logistic step a row
// (docs/v2/algorithm.md §2, p1.md). The assist ladder asks it a line's chances; the Your Chinese panel shows it.
// DOM-free: Node runs it (tools/model-check.mjs), with the storage and the clock passed in.
//   init(data, { store, now })     the content (data.phrases, data.scenarios); loads ks.model; listens to events.js
//   persona(p)                     'mandarin' | 'dialect' | 'studied' | 'new' | null: where the skills start (persona() → it)
//   skills()                       { g, L, S, V, T, R, W }: each { m, s }, the mean and sd of θk = g + δk (g: of g alone)
//   predict(id, { mode, assist, typed })  P(right first time, with no help beyond the assist's) for phrase id
//   observe(row)                   a line or card row, as events.js logs it
//   level()                        { say, listen, read, n }: 0–5, the level of line it gets right 80% of the time; n lines
//   age(place)                     { say, listen }: your Chinese's age, in whole years (P5a), or null before placement
//                                  ends (place: rank.js's ks.arms.place, read from the store when not passed)
//   item(id)                       { b, s }: how hard the line is for this player, and how sure of that the model is
//   batch()                        predict() for many lines at once, against the model as it stands (the ranker's picks)
//   typical(level)                 a typical line of a level, in logits (a card's other lines, a word, a line to shadow)
//   outcome(row)                   what a line row says, 0–1 (null: nothing); flush(): save now, not in a second
//   hush(on)                       while on, rows go unheard (a story held at one rung on #play: trying its branches
//                                  for the content gate isn't playing for real)
import { kv } from './store.js';
import { now as clock } from './time.js';
import * as events from './events.js';
import * as levels from './levels.js';

export const SKILLS = ['L', 'S', 'V', 'T', 'R', 'W'];
// What each way of answering asks of each skill (the loadings add to 1), how much its verdict counts (o: a rating of
// your own 0.4) and how much easier or harder it makes a line (db: tiles lay the words out). A typed line is two of
// these: its sound (pinyin), then its characters given the sound (chars). You can't type the characters of a line you
// couldn't say, so P(right in characters) = P(sound) × P(characters | sound): 0.03 from algorithm.md's own row for it
// (W .45 V .35 R .20 at +0.5) on average over the personas' starts, levels 0–4 and assists (0.06 at most), and never
// above the sound's own chance.
export const WAYS = {
  speak: { L: 0.1, S: 0.45, V: 0.3, T: 0.15, o: 1, db: 0 },
  self: { L: 0.2, S: 0.4, V: 0.4, o: 0.4, db: -0.3 },
  pinyin: { V: 0.75, W: 0.25, o: 0.8, db: 0.2 },      // typed: the sound right
  chars: { R: 0.3, W: 0.7, o: 1, db: -1.2 },          // typed: the characters right, given the sound
  tiles: { V: 0.35, R: 0.55, W: 0.1, o: 0.5, db: -0.7 },
  write: { R: 0.3, W: 0.7, o: 0.8, db: 0 },           // a write card: characters from memory
  shadow: { L: 0.4, S: 0.4, T: 0.2, o: 0.3, db: 0 },  // another character's line, said back
  heard: { L: 1, o: 1, db: 0 },                       // a card's other lines, heard (a call) or read (the rest)
  read: { R: 1, o: 1, db: 0 },
};
// How much each rung of the assist ladder helps (assist.js: A0 the hardest, A5 the line played first), in logits. A2 is
// v1, the zero the others are learned against.
export const BETA = [-0.5, -0.25, 0, 0.5, 1.2, 2.5];
// Where the skills start, from "Growing up, did you hear Chinese at home?" (L S V T R W): heritage speakers hear far more
// than they read or write. g starts at the row's mean and each lean at the rest; a skill starts 1.0 either side
// (g 0.6² + its lean 0.8²), a heritage speaker's S and V 1.2 (some barely speak, some are fluent).
export const PERSONAS = {
  mandarin: [1.5, 0.8, 0.5, 0.3, -1.0, -1.5],
  dialect: [0.2, -0.3, 0.2, -0.5, 0.3, -0.8],
  studied: [-0.5, -0.5, -0.2, -0.3, 0, -0.5],
  new: [-1.5, -1.5, -1.5, -1.2, -1.5, -1.8],
};
const known = (p) => (Object.keys(PERSONAS).includes(p) ? p : null); // one of the four ('constructor' is on any object)
const G2 = 0.36, D2 = 0.64, HOME = 1.44 - G2;
const S0 = 0.7, RHO = 0.3, STEP = 0.02, DAY = 864e5, GROW = 0.01, CAP = 30 * 1024, HAN = /[一-鿿]/g;
// How far a say-and-check's y shrinks toward 0.5, since players flatter themselves: p1.md's 30%. tools/model-check.mjs
// measures it: with algorithm.md §6's raters (half over-claim by 0.1) it caps a rating at 0.85 and puts S half a logit
// low without a microphone (a Mandarin-at-home player's −0.53); 10% keeps every persona within 0.1.
export const SELF = 0.3;
const ANSWER = ['speak', 'self', 'type', 'tiles']; // the ways ask.js answers (mode)

const σ = (z) => 1 / (1 + Math.exp(-z));
const dot = (u, v) => u.reduce((t, x, i) => t + x * v[i], 0);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const diag = (v) => v.map((x, i) => v.map((_, j) => (i === j ? x : 0)));
// a small positive-definite matrix's inverse (Gauss-Jordan; its pivots stay positive), or null when it isn't one
function inv(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...r.map((_, j) => +(i === j))]);
  for (let i = 0; i < n; i++) {
    const p = M[i][i];
    if (!(p > 1e-12)) return null;
    M[i] = M[i].map((x) => x / p);
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i]; M[r] = M[r].map((x, j) => x - f * M[i][j]); }
  }
  return M.map((r) => r.slice(n));
}

// The starting point for an answer to the persona question: means and variances of [g, δL … δW]. No answer is all four
// at once: their average, as wide as they are far apart.
const PRIORS = {};
function prior(p) {
  if (PRIORS[p]) return PRIORS[p];
  if (!PERSONAS[p]) {
    const ps = Object.keys(PERSONAS).map(prior), avg = (f) => ps.reduce((t, q) => t + f(q), 0) / ps.length, m = ps[0].m.map((_, i) => avg((q) => q.m[i]));
    return (PRIORS[p] = { m, v: m.map((x, i) => avg((q) => q.v[i] + (q.m[i] - x) ** 2)) });
  }
  const row = PERSONAS[p], g = row.reduce((a, b) => a + b) / row.length, home = p === 'mandarin' || p === 'dialect';
  return (PRIORS[p] = { m: [g, ...row.map((x) => x - g)], v: [G2, ...SKILLS.map((k) => (home && (k === 'S' || k === 'V') ? HOME : D2))] });
}
// z = a·x: the general level counts whole, each lean by its loading. On a call, what you hear matters more: .3 of each
// loading moves to L.
const VEC = {};
const vec = (way, call) => (VEC[way + +!!call] ??= [1, ...SKILLS.map((k) => { const w = WAYS[way][k] || 0; return call ? (k === 'L' ? w + 0.3 * (1 - w) : 0.7 * w) : w; })]);

// How hard a line is before this player has said it, in logits, from what makes lines hard: build.py's f on each phrase
// (its level, Han characters in answers[0], need groups, the rarest need word's zipf), worked out here where it's
// missing, in whole or in part (a part left out would leave the line's b, and every prediction for it, NaN), with the
// words taken as everyday ones (zipf 4.5). A level is worth 0.67.
function prior0(p) {
  const f = { level: p.level, chars: ((p.answers?.[0] ?? p.zh ?? '').match(HAN) || []).length, needGroups: (p.need || []).length, ...p.f };
  return -1 + 0.67 * (levels.of(f.level) - 1) + 0.1 * (f.chars - 7) + 0.3 * (f.needGroups - 1) + 0.35 * Math.max(0, 4.5 - (f.zipf ?? 4.5));
}
// a typical line of a level (seven characters, one need group, everyday words): what a card's other lines are measured by
const ref = (l) => -1 + 0.67 * (levels.of(l) - 1);

let lines = new Map(), scns = new Map(), store = kv, now = clock, off = null, M = null, timer = 0, quiet = false;
// M: { v, persona, x: [g, δL … δW], C: their covariance (7×7), beta: [A0 … A5], items: { id: [b, s] } (lines met only),
//      at: when the variances last grew, n: lines heard, k: cards heard }
const fresh = (p) => { const P = prior(p); return { v: 1, persona: p, x: [...P.m], C: diag(P.v), beta: [...BETA], items: {}, at: now(), n: 0, k: 0 }; };
function read() { const s = store.get('model', null); return s?.v === 1 && s.x?.length === 7 && s.C?.length === 7 && s.beta?.length === 6 ? { items: {}, n: 0, k: 0, at: now(), ...s, persona: known(s.persona) } : fresh(null); }
const ready = () => (M ??= read());

export function init(data, { store: s = kv, now: n = clock } = {}) {
  if (timer) save(); // what the last store's model heard goes to it first
  store = s; now = n;
  lines = new Map((data?.phrases || []).map((p) => [p.id, { b0: prior0(p), call: p.format === 'call' }]));
  scns = new Map((data?.scenarios || []).map((x) => [x.id, x]));
  // a beat's level override the build didn't list as a phrase (every build so far lists them all) is still a line of
  // its own, played under its own id (content.tailor(): scn/beat@L): its prior from its own level, answers and need,
  // not a typical level-2 line's, and its rows heard rather than dropped
  for (const x of scns.values()) for (const b of overrides(x.steps)) for (const [L, o] of Object.entries(b.levels)) {
    const id = `${x.id}/${b.again || b.id}@${L}`;
    if (!lines.has(id) && !b.again) lines.set(id, { b0: prior0({ level: L, answers: o.answers || b.answers, need: o.need || b.need }), call: x.format === 'call' });
  }
  M = read();
  off?.(); off = events.on((r) => quiet || observe(r));
}

export const hush = (on) => { quiet = !!on; };
// the say beats that play at other levels too (their levels overrides), every branch walked
function overrides(steps, out = new Set()) {
  for (const st of steps || []) if (st.say && !out.has(st.say)) { const b = st.say; if (b.levels) out.add(b); [b.ok, b.fail, b.miss, ...(b.alts || []).map((a) => a.then)].forEach((l) => overrides(l, out)); }
  return out;
}

export function persona(p) {
  ready();
  if (p === undefined) return M.persona;
  p = known(p);
  if (p === M.persona) return p;
  const o = prior(M.persona), q = prior(p);
  if (!M.n && !M.k) Object.assign(M, { x: [...q.m], C: diag(q.v) });
  else swap(o, q);
  M.persona = p; soon();
  return p;
}
// An answer given after some lines: the evidence so far stays (its precision and information), the starting point under
// it changes. If time away has worn the evidence thinner than the old start (no inverse to take), only the means move,
// by the change in the start times the share of it still in them.
function swap(o, q) {
  const P = inv(M.C), C = P && inv(P.map((r, i) => r.map((c, j) => c + (i === j ? 1 / q.v[i] - 1 / o.v[i] : 0))));
  if (C) {
    const h = P.map((r, i) => dot(r, M.x) - o.m[i] / o.v[i] + q.m[i] / q.v[i]);
    Object.assign(M, { C, x: C.map((r) => dot(r, h)) });
  } else {
    const d = q.m.map((m, i) => (m - o.m[i]) / o.v[i]);
    M.x = M.x.map((x, i) => x + dot(M.C[i], d));
  }
}

// Time away: each variance grows by 0.01 a day (a skill drifts while nobody is looking), never past where it started.
function drift(t = now()) {
  const d = (t - M.at) / DAY;
  if (!(d > 0)) return;
  const v = prior(M.persona).v;
  M.C.forEach((r, i) => (r[i] = Math.max(r[i], Math.min(v[i], r[i] + GROW * d))));
  M.at = t;
}

export function skills() {
  ready(); drift();
  const { x, C } = M, one = (m, v) => ({ m: round(m), s: round(Math.sqrt(v)) });
  return { g: one(x[0], C[0][0]), ...Object.fromEntries(SKILLS.map((k, i) => [k, one(x[0] + x[i + 1], C[0][0] + C[i + 1][i + 1] + 2 * C[0][i + 1])])) };
}

// The chance of a line right first time, said the way the player will answer it (a typed one in characters, unless
// typed: 'pinyin'), at an assist level, averaged over what the model isn't sure of yet (MacKay's probit trick: an
// unsure model doesn't promise a sure win).
export function predict(id, { mode = 'self', assist = 2, typed = 'chars' } = {}) {
  ready(); drift();
  const P = lines.get(id), way = mode === 'type' ? (typed === 'pinyin' ? 'pinyin' : 'chars') : ANSWER.includes(mode) ? mode : 'self';
  const a = vec(way, !!P?.call), I = (P && M.items[id]) || [P ? P.b0 : ref(2), S0];
  const z = dot(a, M.x) - I[0] - WAYS[way].db + (M.beta[assist] ?? 0), v = dot(a, M.C.map((r) => dot(r, a))) + I[1] ** 2;
  const p = σ(z / Math.sqrt(1 + (Math.PI * v) / 8));
  return way === 'chars' ? p * predict(id, { mode, assist, typed: 'pinyin' }) : p;
}
// predict() for many lines at once, against the model as it stands now (the ranker scores some 150 cards over their
// lines a pick): the same numbers, with each way's a·x and a·C·a worked out once instead of for every line and rung.
// → fn(id, { mode, assist, typed }); fn.way(way, b, { assist, call }): a line of difficulty b answered that way, with a
// line's uncertainty (a word to write, another character's line to shadow: learner.js's own write and shadow steps);
// fn.spread(way, call): a·C·a, how unsure the model is of what a line answered that way asks (the ranker's placement
// weighs a line's information by it, p3.md)
export function batch() {
  ready(); drift();
  const memo = {};
  const part = (way, call) => { const m = (memo[way] ||= []); return (m[+call] ??= ((a) => [dot(a, M.x), dot(a, M.C.map((r) => dot(r, a)))])(vec(way, call))); };
  const chance = (way, call, I, A) => { const [ax, aCa] = part(way, call), z = ax - I[0] - WAYS[way].db + (M.beta[A] ?? 0), v = aCa + I[1] ** 2; return σ(z / Math.sqrt(1 + (Math.PI * v) / 8)); };
  const fn = (id, { mode = 'self', assist = 2, typed = 'chars' } = {}) => {
    const P = lines.get(id), way = mode === 'type' ? (typed === 'pinyin' ? 'pinyin' : 'chars') : ANSWER.includes(mode) ? mode : 'self';
    const I = (P && M.items[id]) || [P ? P.b0 : ref(2), S0], p = chance(way, !!P?.call, I, assist);
    return way === 'chars' ? p * fn(id, { mode, assist, typed: 'pinyin' }) : p;
  };
  fn.way = (way, b, { assist = 2, call = false } = {}) => chance(WAYS[way] ? way : 'self', !!call, [b, S0], assist);
  fn.spread = (way, call = false) => part(WAYS[way] ? way : 'self', !!call)[1];
  return fn;
}
// a typical line of a level, in logits: what a card's other lines, a word to write and a line to shadow are measured by
export const typical = (l) => ref(l);

// A skill as a level: the level of a typical line (b⁰ moves 0.67 a level) it would get right 80% of the time at A2.
// Say is a spoken line's mix of skills. The Mandarin-at-home start reads say 1.5, listen 2.7, read 0 (README §3:
// "listen 3, say 1, read 0"); Math.round or floor it for a badge.
const lvl = (t) => round(clamp(1 + (t + 1 - Math.log(4)) / 0.67, 0, 5), 2);
export function level() {
  ready(); drift();
  const th = (i) => M.x[0] + M.x[i + 1], say = SKILLS.reduce((t, k, i) => t + (WAYS.speak[k] || 0) * th(i), 0);
  return { say: lvl(say), listen: lvl(th(0)), read: lvl(th(4)), n: M.n };
}

// Your Chinese's age (p5.md P5a): a level as the age of a child who talks or understands like it, say and listen apart
// (level 0 is 2, 1 is 4, 2 is 6, 3 is 9, 4 is 12, 5 is 16, in between by the level, in whole years reached): "You
// understand like a 10-year-old and talk like a 5-year-old". null before placement ends (rank.js's ks.arms.place.end;
// a phone with no placement, one that played before P3, once the model has 12 lines), so a first guess is never shown
// as a measure.
const AGES = [2, 4, 6, 9, 12, 16], PLACED = 12;
const years = (l) => { const i = Math.min(AGES.length - 2, Math.floor(l)); return Math.floor(AGES[i] + (AGES[i + 1] - AGES[i]) * (l - i) + 1e-9); };
export function age(place = store.get('arms', null)?.place) {
  const l = level();
  return (place ? !place.end : l.n < PLACED) ? null : { say: years(l.say), listen: years(l.listen) };
}

export function item(id) {
  ready();
  const P = lines.get(id), I = M.items[id] || [P ? P.b0 : ref(2), S0];
  return { b: round(I[0]), s: round(I[1]) };
}

// What a line's result says, 0 to 1 (algorithm.md §2): right first time 1, a slip or not quite .8, the frame or another
// go .55, the answer shown or heard (or "That should count", or a third attempt) .2, wrong and then out of time .05,
// nothing said 0. Help the format gave free (the assist's frame) is the assist's, not the player's: only help beyond it
// counts. A quick answer gains .1, one at the buzzer loses .1. A say-and-check is rated by the player, who flatters: it
// counts SELF less as evidence (line(), below), not pulled toward 0.5, which read every self-checker half a level low.
// A card left mid-panel (cancel) says nothing, unless the verdict was up already. A caller who
// hangs up on the silence and a chaser who catches you are those formats' own clocks running out (ask.js logs them as
// hangup and caught): time-outs. → y, or null
export function outcome(r) {
  if (r.res === 'cancel' && !(r.perfect || r.self || r.slip || r.counted)) return null;
  if (r.res !== 'ok' && r.res !== 'cancel') return ['timeout', 'hangup', 'caught'].includes(r.res) ? (r.tried ? 0.05 : 0) : r.res === 'skip' ? 0 : null;
  const paid = r.hint > (r.free || 0) ? r.hint : 0, t = r.clock > 0 && r.ms != null ? r.ms / (r.clock * 1000) : 0.5;
  const y = r.counted || paid >= 2 || r.hear || r.att >= 3 ? 0.2 : paid || r.att === 2 || r.tries ? 0.55 : r.self ? (r.stars >= 3 ? 1 : r.stars ? 0.8 : 0.9) : r.perfect && !r.slip ? 1 : 0.8;
  const fast = clamp(y + (t < 0.35 ? 0.1 : t > 0.9 ? -0.1 : 0), 0, 1);
  return fast;
}

// One Bayesian logistic step (Elo with uncertainty, all seven parts at once, so they share the step instead of each
// taking a whole one): z = a·x − b − db + β, the outcome y counted o times. The learner moves along C·a by the surprise
// y − p; the line moves too, damped (ρ: one player is little evidence of how hard a line is) and within 1 of where it
// started (unless fixed: a typed line's characters say nothing of how hard it is to say); the assist's β drifts slowly,
// kept in order.
function step(way, y, { id, b = 0, call = false, A = 2, scale = 1, fixed = false } = {}) {
  const a = vec(way, call), W = WAYS[way], o = W.o * scale, I = id != null ? M.items[id] || [lines.get(id).b0, S0] : null;
  const Ca = M.C.map((r) => dot(r, a)), u = I ? RHO * I[1] ** 2 : 0, v = dot(a, Ca) + u;
  const p = σ(dot(a, M.x) - (I ? I[0] : b) - W.db + M.beta[A]), g = o * (y - p), H = o * p * (1 - p), D = 1 + v * H;
  if (Number.isNaN(g)) return; // a y or b that isn't a number (a card's 2.5 stars) would make every number NaN, saved so
  M.x.forEach((x, i) => (M.x[i] = x + (Ca[i] * g) / D));
  M.C.forEach((r, i) => r.forEach((c, j) => (r[j] = c - (Ca[i] * Ca[j] * H) / D)));
  if (I && !fixed) { const b0 = lines.get(id).b0; M.items[id] = [clamp(I[0] - (u * g) / D, b0 - 1, b0 + 1), Math.sqrt(I[1] ** 2 - (RHO * I[1] ** 4 * H) / D)]; }
  if (A !== 2) M.beta[A] = clamp(M.beta[A] + STEP * g, Math.max(BETA[A] - 0.5, M.beta[A - 1] ?? -9), Math.min(BETA[A] + 0.5, M.beta[A + 1] ?? 9));
}

// A line: one step in the way it was answered, at the assist it was asked at. A typed one is two: its sound, then, if
// that came right with no help beyond the assist's, its characters (right: not pinyin only, no homophone, no slip).
// That split tells a heritage speaker from a beginner. Another character's line said back (a shadow card, task shadow:
// cards.js logs it as shadow:<scenario>:<line>) has no line of the player's to calibrate. A line put in front of them
// first isn't theirs: a practice after a review's miss (the answer shown) says nothing, and a call's type it back (the
// line played first, as dictation) only how its characters went.
function line(r) {
  const P = lines.get(r.id), y = outcome(r), shadow = r.task === 'shadow', back = r.task === 'typeback';
  if (y == null || !(P || shadow) || !ANSWER.includes(r.mode)) return false;
  if (r.task === 'practice' || (back && (r.mode !== 'type' || y < 0.7))) return false;
  age(r.at);
  // a review (task review: a flash crisis, a run) mixes forgetting with skill, so it counts half
  const A = BETA[r.assist] != null ? +r.assist : 2, on = { id: r.id, call: P?.call, A, scale: r.task === 'review' ? 0.5 : 1 }; // a number: '2' isn't 2, and A2's β is the zero
  if (!P) step('shadow', y, { b: ref(r.lv), scale: r.mode === 'self' ? 0.4 : 1 });
  else if (r.mode === 'type') {
    if (!back) step('pinyin', y, on);
    if (y >= 0.7) step('chars', r.pinyin || r.chars || r.slip ? 0 : 1, { ...on, fixed: true }); // right unhelped: help or another go keeps y under 0.7
  }
  else step(r.mode, y, r.mode === 'self' ? { ...on, scale: on.scale * (1 - SELF) } : on); // a self-rating, counted less
  M.n++;
  return true;
}
// A card: its other characters' lines were heard (a call: L) or read (the rest: R). Each word looked up, English shown
// is a small miss (y 0, ω 0.3, three at most); a story finished without any, a small win (y 1, ω 0.1). (A call's peek
// is its line's own hint, already counted there.)
// A write card that says how it went (stars) is a character written from memory.
function card(r) {
  if (r.again) return false; // back on a card finished before: nothing new
  if (r.kind === 'write') {
    if (r.state !== 'done' || !r.stars) return false;
    age(r.at); step('write', [0, 0.2, 0.55, 1][Math.min(3, r.stars)], { b: ref(r.lv) });
  } else {
    const s = scns.get(r.id), way = (r.fmt || s?.format) === 'call' ? 'heard' : 'read', n = Math.min(3, (r.gloss || 0) + (r.reveal || 0)); // a call's peek is its line's hint already
    if (r.kind === 'end' || (!n && !(r.kind === 'scn' && r.state === 'done'))) return false;
    age(r.at);
    const b = ref(s?.listen ?? r.lv);
    for (let i = 0; i < n; i++) step(way, 0, { b, scale: 0.3 });
    if (!n) step(way, 1, { b, scale: 0.1 });
  }
  M.k++;
  return true;
}
export function observe(r) {
  if (!r) return;
  ready();
  if (r.k === 'line' ? line(r) : r.k === 'card' && card(r)) soon();
}

// Saved a second after the last change, and as the page goes: the learner's numbers and the lines this player has met
// (the rest are at their priors). Over 30 KB, the lines that have moved least from their priors are let go first.
function save() {
  clearTimeout(timer); timer = 0;
  if (!M) return;
  const out = { ...M, x: M.x.map((x) => round(x, 6)), C: M.C.map((r) => r.map((c) => round(c, 6))), beta: M.beta.map((b) => round(b, 4)), items: {} };
  const its = Object.entries(M.items).map(([id, [b, s]]) => [id, [round(b), round(s)]]), cost = ([id, v]) => JSON.stringify(id).length + JSON.stringify(v).length + 2;
  let size = JSON.stringify(out).length + its.reduce((t, e) => t + cost(e), 0);
  if (size > CAP) {
    const moved = ([id, [b]]) => Math.abs(b - (lines.get(id)?.b0 ?? b));
    its.sort((p, q) => moved(q) - moved(p));
    while (size > CAP && its.length) { const e = its.pop(); size -= cost(e); delete M.items[e[0]]; }
  }
  out.items = Object.fromEntries(its);
  store.set('model', out);
}
const soon = () => { if (!timer) { timer = setTimeout(save, 1000); timer.unref?.(); } };
export const flush = () => timer && save(); // now, not in a second (tests; a page about to go)

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  addEventListener('pagehide', flush);
}

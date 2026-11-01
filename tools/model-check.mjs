#!/usr/bin/env node
// tools/model-check.mjs: does the learner model (app/shared/learner.js) find out what a player can do? Synthetic players
// of each persona (true skills: the persona's start + N(0, 0.6²)) answer lines from data/content.json in random ways
// and at random assists, each answer drawn from the TRUE model: learner.js's own form, but with every line's true
// difficulty off its prior by N(0, 0.5²), the assists' true effects off by up to 30%, and half the players over-claiming
// by 0.1 when they rate themselves (algorithm.md §6). Each answer is logged as ask.js and events.js log it (the same
// fields) and fed to observe(). With a microphone and without (the claude.ai path), it reports for each skill:
//   RMSE        of θ after 50 and 150 lines (with the sd the model itself gives), and the mean error (bias) at 150
//   best        the Bayes-optimal error after 150, from the evidence those lines really carried and the TRUE spread of
//               players (no estimator does better); and the same with learner.js's own wider start (s 1.0)
//   ways        the error in what each way of answering measures (its mix of skills): what predict() stands on
//   calibration predict() against how often the line really went right first time, in deciles, and its ECE
// First, checks of the parts: the item prior, the outcome ladder, levels, cards, typing, a call's type it back, shadows,
// rows that say nothing, time away, the persona question, storage, events.on. Exit 1 if a part fails, predictions are off (ECE over 0.05), or an exercised skill is
// off on average by more than 0.35 (half a level: the model places players wrong) or more than 0.08 worse than the best
// its start allows (about three standard errors at 300 players, more with fewer: it wastes evidence). docs/v2/p1.md's own target, every exercised skill within 0.4 after 150 lines, is printed with
// what the evidence allows; --strict exits 1 on it too.
//   node tools/model-check.mjs [--n=300 players a persona] [--seed=1] [--strict] [--app: also play the ladder as the
//   app would, with retries, hints and honest misses, which isn't made to average the TRUE chance]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const opt = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const has = (k) => process.argv.includes(`--${k}`);
const L = await import(path.join(ROOT, 'app/shared/learner.js'));
const events = await import(path.join(ROOT, 'app/shared/events.js'));
const levels = await import(path.join(ROOT, 'app/shared/levels.js'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content.json'), 'utf8'));
const { SKILLS, WAYS, BETA, PERSONAS, SELF } = L;
const N = +opt('n', 300), AT = [50, 150], END = AT[AT.length - 1], TARGET = 0.4, ECE = 0.05, BIAS = 0.35, SPREAD = 0.6;
// how much worse than the evidence allows a skill may come out: about three standard errors of an RMSE over N players
const SLACK = +Math.max(0.08, 1.3 / Math.sqrt(N)).toFixed(2);
const T0 = Date.parse('2026-11-02T08:00:00Z'), DAY = 864e5, t0 = performance.now(), problems = [];
const fail = (m) => problems.push(m);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const fmt = (x, d = 2) => (x == null || Number.isNaN(x) ? '-' : x.toFixed(d));

// a seeded generator (mulberry32), so a run can be repeated
let seed = +opt('seed', 1) >>> 0;
const rand = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const pick = (a) => a[Math.floor(rand() * a.length)];
const σ = (z) => 1 / (1 + Math.exp(-z));
const memory = () => { const m = new Map(); return { m, get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v) }; };
// a small positive-definite matrix's inverse (Gauss-Jordan)
const inv = (A) => { const n = A.length, M = A.map((r, i) => [...r, ...r.map((_, j) => +(i === j))]); for (let i = 0; i < n; i++) { const p = M[i][i]; M[i] = M[i].map((x) => x / p); for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i]; M[r] = M[r].map((x, j) => x - f * M[i][j]); } } return M.map((r) => r.slice(n)); };
const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((t, x, k) => t + x * B[k][j], 0)));

// ---------- the TRUE model, written out again from algorithm.md (so a slip in learner.js's own shows) ----------
// a line's prior difficulty, and its true one, off it by N(0, 0.5²): the model starts wrong about every line
const B0 = new Map(data.phrases.map((p) => { const f = p.f || { level: p.level, chars: (p.answers[0].match(/[一-鿿]/g) || []).length, needGroups: p.need.length, zipf: 4.5 }; return [p.id, -1 + 0.67 * (f.level - 1) + 0.1 * (f.chars - 7) + 0.3 * (f.needGroups - 1) + 0.35 * Math.max(0, 4.5 - f.zipf)]; }));
const TRUE_B = new Map([...B0].map(([id, b]) => [id, b + 0.5 * normal()]));
const load = (way, k, call) => { const w = WAYS[way][k] || 0; return call ? (k === 'L' ? w + 0.3 * (1 - w) : 0.7 * w) : w; };
const zOf = (P, ph, way, A) => SKILLS.reduce((z, k) => z + load(way, k, ph.format === 'call') * P.th[k], -P.b.get(ph.id) - WAYS[way].db + P.beta[A]);
const player = (persona) => ({ persona, th: Object.fromEntries(SKILLS.map((k, i) => [k, PERSONAS[persona][i] + SPREAD * normal()])), beta: BETA.map((x) => x * (1 + 0.6 * (rand() - 0.5))), over: rand() < 0.5, b: TRUE_B });
// the assist's clock (README §4: A0 ×0.7 … A3 ×1.5, A4 and A5 none)
const clockAt = (ph, A) => (A >= 4 ? 0 : Math.round(levels.clock(ph.level) * [0.7, 0.85, 1, 1.5][A]));

// One answer panel's result, drawn from the TRUE model: right with probability p. Some rights are softened into the
// rungs just below (slow .9, not quite .8: .15 lost on average) and as many wrongs rescued into the rungs just above
// nothing (out of time after a try .05, the answer shown .2, the frame .55: .15 gained), each in proportion to p(1−p),
// so the y learner.js reads averages exactly p: this checks the model, not the ladder (--app plays the ladder).
function rung(ok, p, clock) {
  if (ok) return rand() >= 0.6 * (1 - p) ? 'right' : clock ? (rand() < 0.5 ? 'slow' : 'close') : rand() < 0.75 ? 'close' : 'right';
  if (rand() >= 0.6 * p) return 'nothing';
  const u = rand();
  return clock ? (u < 0.59 ? 'tried' : u < 0.89 ? 'shown' : 'frame') : u < 0.5364 ? 'nothing' : u < 0.8364 ? 'shown' : 'frame';
}
// the row events.js logs for it, as ask.js fills it in for that way of answering
function row(ph, mode, A, clock, r, at) {
  const self = mode === 'self', c = clock * 1000, ms = r === 'slow' ? c * (0.92 + 0.08 * rand()) : c ? c * (0.36 + 0.53 * rand()) : 2000 + 8000 * rand();
  const base = { k: 'line', at, id: ph.id, lv: ph.level, mode, att: 1, hint: 0, hear: false, tries: 0, alt: -1, ms: Math.round(ms), clock, assist: A };
  const right = self ? { self: true } : { perfect: true };
  if (r === 'right' || r === 'slow') return { ...base, res: 'ok', stars: mode === 'tiles' ? 2 : 3, ...right };
  if (r === 'close') return { ...base, res: 'ok', stars: mode === 'tiles' ? 1 : 2, ...(self ? { self: true } : mode === 'tiles' ? { slip: true } : {}) };
  if (r === 'frame') return { ...base, res: 'ok', hint: 1, stars: 2, ...right };
  if (r === 'shown') return { ...base, res: 'ok', hint: 2, stars: 1, ...right, ...(self ? { tries: 1 } : {}) }; // say-and-check: Missed it, then the answer
  if (r === 'tried') return { ...base, res: 'timeout', stars: 0, tries: 1, tried: true, ms: c };
  return { ...base, res: clock && rand() < 0.5 ? 'timeout' : 'skip', stars: 0 };
}
// One line, as the TRUE model plays it → [{ row, obs: [[way, true p, right first time?]] }]. A typed line is its sound
// as above, then (said right) its characters right or not: P(characters | sound), learner.js's chars, a logistic of its
// own. Say-and-check: the player's rating, over-claiming by 0.1 for half of them; the truth is what they really said.
function play(P, ph, mode, A, at) {
  const clock = clockAt(ph, A), way = mode === 'type' ? 'pinyin' : mode, p = σ(zOf(P, ph, way, A)), u = rand(), s = u < p;
  const said = mode === 'self' && P.over ? u < Math.min(1, p + 0.1) : s, r = row(ph, mode, A, clock, rung(said, p, clock), at), obs = [[way, p, s]];
  if (mode === 'type') {
    const q = σ(zOf(P, ph, 'chars', A)), c = rand() < q;
    if (r.res === 'ok' && !c) Object.assign(r, rand() < 0.5 ? { pinyin: true } : { chars: 1 }, { stars: Math.min(r.stars, 2) });
    if (r.res === 'ok' && r.hint === 0) obs.push(['chars', q, c]);
  }
  return [{ row: r, obs, first: true }];
}
// The app's own ladder (--app): each attempt right with the TRUE p, the frame (+1.2) on a second attempt and the answer
// (+2.5) on a third, a hint taken now and then, quick or slow at random; a say-and-check miss mostly owned up to
// (Missed it, then rated against the answer). The y ladder isn't made to average p here: this shows its own bias.
function playApp(P, ph, mode, A, at) {
  const out = [], clock = clockAt(ph, A), self = mode === 'self', way = mode === 'type' ? 'pinyin' : mode;
  for (let att = 1; att <= 3; att++) {
    const help = att === 1 ? (rand() < 0.1 ? 1 : 0) : att - 1, p = σ(zOf(P, ph, way, A) + [0, 1.2, 2.5][help]), u = rand(), s = u < p;
    const ok = self && P.over ? u < Math.min(1, p + 0.1) : s, c = clock * 1000, speed = rand();
    const r = { k: 'line', at, id: ph.id, lv: ph.level, mode, att, hint: help, hear: false, tries: 0, alt: -1, ms: Math.round(c ? c * (speed < 0.3 ? 0.2 : speed < 0.9 ? 0.6 : 0.95) : 4000), clock: att >= 3 ? 0 : clock, assist: A };
    const obs = att === 1 && !help ? [[way, p, s]] : [];
    if (ok) {
      const close = rand() < 0.15;
      Object.assign(r, { res: 'ok', stars: Math.max(1, 3 - help - (close ? 1 : 0)) }, self ? { self: true } : close ? (mode === 'tiles' ? { slip: true } : {}) : { perfect: true });
      if (mode === 'type') { const q = σ(zOf(P, ph, 'chars', A)), cr = rand() < q; if (!cr) Object.assign(r, rand() < 0.5 ? { pinyin: true } : { chars: 1 }); if (obs.length) obs.push(['chars', q, cr]); }
      out.push({ row: r, obs, first: att === 1 });
      return out;
    }
    if (self && rand() < 0.7) { out.push({ row: { ...r, res: 'ok', self: true, tries: 1, hint: 2, stars: 1 }, obs, first: att === 1 }); return out; }
    out.push({ row: { ...r, res: clock && att < 3 ? 'timeout' : 'skip', stars: 0, ...(rand() < 0.5 ? { tried: true, tries: 1 } : {}) }, obs, first: att === 1 });
  }
  return out;
}

// ---------- the parts ----------
let now = T0;
L.init(data, { store: memory(), now: () => now });
for (const p of data.phrases) if (!near(L.item(p.id).b, Math.round(B0.get(p.id) * 1000) / 1000, 1e-3)) fail(`item prior: ${p.id} ${L.item(p.id).b} vs algorithm.md's ${B0.get(p.id).toFixed(3)}`);
const LADDER = [
  [{ res: 'ok', perfect: true, stars: 3, ms: 8000, clock: 15 }, 1], [{ res: 'ok', perfect: true, stars: 3, ms: 14000, clock: 15 }, 0.9],
  [{ res: 'ok', slip: true, stars: 1, ms: 8000, clock: 15 }, 0.8], [{ res: 'ok', slip: true, stars: 1, ms: 2000, clock: 15 }, 0.9],
  [{ res: 'ok', perfect: true, hint: 1, stars: 2 }, 0.55], [{ res: 'ok', perfect: true, att: 2, hint: 1, stars: 2 }, 0.55],
  [{ res: 'ok', perfect: true, hint: 1, free: 1, stars: 3 }, 1], [{ res: 'ok', perfect: true, hint: 2, free: 1, stars: 1 }, 0.2],
  [{ res: 'ok', perfect: true, hear: true, stars: 1 }, 0.2], [{ res: 'ok', counted: true, stars: 1 }, 0.2], [{ res: 'ok', perfect: true, att: 3, hint: 2, stars: 1 }, 0.2],
  [{ res: 'timeout', tried: true, tries: 1 }, 0.05], [{ res: 'timeout' }, 0], [{ res: 'skip', tried: true }, 0], [{ res: 'cancel' }, null],
  [{ res: 'hangup', tried: true, tries: 1 }, 0.05], [{ res: 'caught' }, 0], // a call's and a chase's own clocks running out
  [{ res: 'cancel', perfect: true, stars: 0, ms: 5000, clock: 15 }, 1],
  // a say-and-check's, as rated (it counts SELF less as evidence, in learner.js line(), rather than being pulled to 0.5)
  [{ res: 'ok', self: true, stars: 3, ms: 8000, clock: 15 }, 1], [{ res: 'ok', self: true, stars: 2, ms: 8000, clock: 15 }, 0.8],
  [{ res: 'ok', self: true, stars: 1, hint: 2, tries: 1 }, 0.2],
];
for (const [r, y] of LADDER) { const got = L.outcome({ k: 'line', mode: 'speak', att: 1, hint: 0, tries: 0, ...r }); if (y === null ? got !== null : got == null || !near(got, y)) fail(`outcome ${JSON.stringify(r)} → ${got}, not ${y}`); } // (null − 0 is 0: a null isn't near 0)
L.persona('mandarin');
const lv0 = L.level();
if (!(near(lv0.say, 1.48, 0.01) && near(lv0.listen, 2.66, 0.01) && lv0.read === 0)) fail(`a Mandarin-at-home start reads ${JSON.stringify(lv0)}, not say 1.48 listen 2.66 read 0 (README: listen 3, say 1, read 0)`);
// ph0: an everyday level-2 line of common words (我手机没信号了), as these checks were written against: on a line of rare
// words (大娘您好，打扰一下) a beginner's characters were never expected, so missing them says little either way
const ph0 = data.phrases.find((p) => p.id === 'airport-esim/nosignal') || data.phrases.find((p) => p.format !== 'call' && p.level === 2), call0 = data.phrases.find((p) => p.format === 'call');
const byA = BETA.map((_, A) => L.predict(ph0.id, { mode: 'speak', assist: A }));
if (!byA.every((p, A) => !A || p > byA[A - 1])) fail(`predict isn't easier up the assist ladder: ${byA.map((p) => fmt(p)).join(' ')}`);
const twin = (p = 'studied') => { const st = memory(); L.init(data, { store: st, now: () => now }); L.persona(p); return st; };
twin();
const ways = ['tiles', 'self', 'speak', 'pinyin', 'chars'].map((w) => L.predict(ph0.id, w === 'pinyin' || w === 'chars' ? { mode: 'type', typed: w } : { mode: w }));
if (!ways.every((p, i) => !i || p < ways[i - 1])) fail(`ways aren't in order of difficulty (tiles, self, speak, pinyin, characters): ${ways.map((p) => fmt(p)).join(' ')}`);
const typedLine = (o) => ({ k: 'line', at: now, id: ph0.id, lv: 2, mode: 'type', att: 1, hint: 0, hear: false, tries: 0, res: 'ok', stars: 3, alt: -1, ms: 6000, clock: 15, perfect: true, ...o });
// a typed line said right in pinyin only: the sound was there (V up), the characters weren't (W down)
for (const p of Object.keys(PERSONAS)) {
  twin(p); const a = L.skills(); L.observe(typedLine({ pinyin: true, stars: 2 })); const b = L.skills();
  if (!(b.V.m > a.V.m && b.W.m < a.W.m)) fail(`${p}, pinyin only: V ${fmt(a.V.m, 3)} → ${fmt(b.V.m, 3)}, W ${fmt(a.W.m, 3)} → ${fmt(b.W.m, 3)} (V should rise, W fall)`);
  twin(p); L.observe(typedLine({})); const c = L.skills();
  if (!(c.W.m > b.W.m && c.V.m > a.V.m)) fail(`${p}: typed right in characters moved W to ${fmt(c.W.m, 3)} (should beat pinyin only's ${fmt(b.W.m, 3)})`);
}
twin();
if (!(L.predict(ph0.id, { mode: 'type' }) < L.predict(ph0.id, { mode: 'type', typed: 'pinyin' }))) fail('characters came out likelier than the sound they need');
// a call's type it back (the line played first, as dictation): the characters count, the sound it was given doesn't
{
  twin(); const a = L.skills(); L.observe(typedLine({})); const t = L.skills();
  twin(); L.observe(typedLine({ task: 'typeback' })); const b = L.skills();
  if (!(b.W.m > a.W.m && b.V.m - a.V.m < t.V.m - a.V.m)) fail(`typed back from dictation moved W ${fmt(a.W.m, 3)} → ${fmt(b.W.m, 3)} and V by ${fmt(b.V.m - a.V.m, 3)} (W up, V by less than a line typed from memory's ${fmt(t.V.m - a.V.m, 3)})`);
}
// another character's line said back, as cards.js logs it (shadow:<scenario>:<line>): L and S rise
twin(); const sh0 = L.skills(); L.observe({ k: 'line', at: now, id: `shadow:${ph0.scn}:${ph0.zh}`, task: 'shadow', lv: 2, mode: 'speak', att: 1, hint: 0, hear: false, tries: 0, res: 'ok', stars: 3, alt: -1, ms: 6000, clock: 15, perfect: true });
if (!(L.skills().L.m > sh0.L.m && L.skills().S.m > sh0.S.m)) fail(`a shadow said right moved L ${fmt(sh0.L.m, 3)} → ${fmt(L.skills().L.m, 3)}, S ${fmt(sh0.S.m, 3)} → ${fmt(L.skills().S.m, 3)} (both should rise)`);
// cards: a call finished with nothing looked up is a small win on L; a story's lookups are misses on R, three at most
const card = (o) => ({ k: 'card', at: now, kind: 'scn', id: o.scn, fmt: o.fmt, lv: 2, ms: 60000, state: 'done', how: 'swipe', ...o });
twin(); const c1 = L.skills();
L.observe(card({ scn: call0.scn, fmt: 'call' }));
const c2 = L.skills();
if (!(c2.L.m > c1.L.m && c2.L.m - c1.L.m < 0.1)) fail(`a call finished unhelped moved L ${fmt(c1.L.m, 3)} → ${fmt(c2.L.m, 3)} (a small rise)`);
twin(); L.observe(card({ scn: ph0.scn, fmt: ph0.format, gloss: 4, reveal: 1 })); const r5 = L.skills().R.m;
twin(); L.observe(card({ scn: ph0.scn, fmt: ph0.format, gloss: 3 })); const r3 = L.skills().R.m;
if (!(near(r5, r3) && r3 < PERSONAS.studied[4])) fail(`five lookups moved R to ${fmt(r5, 3)}, three to ${fmt(r3, 3)} (the same, and down)`);
twin(); const quiet = L.skills();
for (const r of [{ k: 'line', id: ph0.id, mode: 'speak', res: 'cancel' }, { k: 'line', id: 'nobody/knows', mode: 'speak', res: 'ok', perfect: true }, { k: 'sess' }, card({ scn: ph0.scn, state: 'playing' }), card({ scn: ph0.scn, again: true }), { k: 'card', kind: 'end', state: 'done' },
  typedLine({ mode: 'self', self: true, hint: 2, stars: 1, task: 'practice' }), typedLine({ mode: 'self', self: true, task: 'typeback' }), { k: 'card', at: now, kind: 'write', id: '借', lv: 2, state: 'done', stars: 2.5 }]) L.observe(r);
if (JSON.stringify(L.skills()) !== JSON.stringify(quiet)) fail('a cancel, an unknown line, a session row, a card left mid-story, one finished before, the end card, a practice with the answer up, a dictation said instead of typed or a write card of 2.5 stars moved the model');
// time away: ten days add 0.1 to g's variance (and each lean's), never past the start
twin();
for (const p of data.phrases.slice(0, 40)) L.observe({ k: 'line', at: now, id: p.id, lv: p.level, mode: 'speak', att: 1, hint: 0, tries: 0, res: 'ok', perfect: true, stars: 3, ms: 6000, clock: 15 });
const tight = L.skills();
now += 10 * DAY;
const grew = L.skills().g.s ** 2 - tight.g.s ** 2;
if (!(grew > 0.099 && grew < 0.101)) fail(`ten days away grew g's variance by ${fmt(grew, 4)}, not 0.1`);
now += 1000 * DAY;
if (SKILLS.some((k) => L.skills()[k].s > 1.001) || L.skills().g.s > 0.601) fail('a long time away grew the variances past where they started');
now = T0;
// the persona question: before any line, exactly its start; after some, the evidence stays and the start shifts under it
twin(null); L.persona('new');
if (SKILLS.some((k, i) => !near(L.skills()[k].m, PERSONAS.new[i], 1e-3))) fail(`answering "new" before any line didn't start at its row: ${JSON.stringify(L.skills())}`);
twin();
for (const p of data.phrases.slice(0, 30)) L.observe({ k: 'line', at: now, id: p.id, lv: p.level, mode: 'self', att: 1, hint: 0, tries: 0, res: 'ok', self: true, stars: 3, ms: 6000, clock: 15 });
const was = L.skills();
L.persona('mandarin');
const dL = L.skills().L.m - was.L.m, dW = L.skills().W.m - was.W.m;
if (!(dL > 0 && dL < PERSONAS.mandarin[0] - PERSONAS.studied[0] && dW < 0)) fail(`answering Mandarin after 30 lines moved L by ${fmt(dL)} and W by ${fmt(dW)} (L up by less than the start's change, W down)`);
// storage: every line met, ks.model is small; read back, the same model; a catalogue of 3,000 lines stays under 30 KB
const st2 = twin();
for (const p of data.phrases) L.observe({ k: 'line', at: now, id: p.id, lv: p.level, mode: 'tiles', att: 1, hint: 0, tries: 0, res: 'ok', perfect: true, stars: 2, ms: 6000, clock: 15 });
L.flush();
const bytes = JSON.stringify(st2.m.get('model')).length, kept = JSON.stringify(L.skills());
L.init(data, { store: st2, now: () => now });
if (JSON.stringify(L.skills()) !== kept) fail('ks.model read back gave a different model');
const big = { phrases: Array.from({ length: 3000 }, (_, i) => ({ ...data.phrases[i % data.phrases.length], id: `scenario-${String(i).padStart(4, '0')}/beat-name@${i % 6}` })), scenarios: data.scenarios };
const st3 = memory();
L.init(big, { store: st3, now: () => now });
for (const p of big.phrases) L.observe({ k: 'line', at: now, id: p.id, lv: p.level, mode: 'tiles', att: 1, hint: 0, tries: 0, res: rand() < 0.5 ? 'ok' : 'skip', perfect: true, stars: 2, ms: 6000, clock: 15 });
L.flush();
const bigBytes = JSON.stringify(st3.m.get('model')).length, bigKept = Object.keys(st3.m.get('model').items).length;
if (bigBytes > 30 * 1024) fail(`ks.model is ${bigBytes} bytes with 3,000 lines met (cap 30 KB)`);
// events.on: init listens, once however often it's called
const st4 = memory();
L.init(data, { store: st4, now: () => now }); L.init(data, { store: st4, now: () => now });
events.line({ id: ph0.id, lv: 2, mode: 'speak', att: 1, hint: 0, hear: false, tries: 0, res: 'ok', stars: 3, alt: -1, ms: 6000, clock: 15, perfect: true });
if (L.level().n !== 1) fail(`a line logged through events.js reached the model ${L.level().n} times, not once`);
console.log(`parts: ${problems.length ? `${problems.length} problems` : 'all good'} (ks.model ${bytes} bytes with all ${data.phrases.length} lines met; ${bigBytes} with 3,000 met, the ${bigKept} that moved most kept)`);

// ---------- recovery ----------
const CONFIGS = { speech: ['speak', 'self', 'type', 'tiles'], 'no mic': ['self', 'type', 'tiles'] };
const calls = data.phrases.some((p) => p.format === 'call');
const wayList = (modes) => modes.flatMap((m) => (m === 'type' ? ['pinyin', 'chars'] : [m]));
// what a set of ways exercises: a loading of 0.2 or more somewhere (on a call too)
const exercised = (modes) => SKILLS.filter((k) => wayList(modes).some((w) => load(w, k, false) >= 0.2 || (calls && load(w, k, true) >= 0.2)));
// a heritage start is wider on S and V: the learner model's own start, in θ-space (θk = g + δk)
const startCov = (persona) => { const home = persona === 'mandarin' || persona === 'dialect'; return SKILLS.map((a, i) => SKILLS.map((b, j) => 0.36 + (i === j ? (home && (a === 'S' || a === 'V') ? 1.08 : 0.64) : 0))); };

function run(modes, persona, app) {
  const P = player(persona), cal = [], I = SKILLS.map(() => SKILLS.map(() => 0)), snap = {};
  let at = T0, n = 0;
  L.init(data, { store: memory(), now: () => at });
  L.persona(persona);
  while (n < END) {
    const ph = pick(data.phrases), mode = pick(modes), A = Math.floor(rand() * 6), call = ph.format === 'call';
    at += 20e3 + (n && n % 40 === 0 ? DAY : 0);
    const pred = { [mode === 'type' ? 'pinyin' : mode]: L.predict(ph.id, { mode, assist: A, typed: 'pinyin' }), chars: mode === 'type' ? L.predict(ph.id, { mode, assist: A }) : 0 };
    for (const { row, obs, first } of (app ? playApp : play)(P, ph, mode, A, at)) {
      // the evidence it carried, at the TRUE chances (for the best-possible bound), and the calibration of predict()
      for (const [way, p] of obs) { const a = SKILLS.map((k) => load(way, k, call)), h = WAYS[way].o * p * (1 - p); a.forEach((x, i) => a.forEach((y, j) => (I[i][j] += h * x * y))); }
      if (first && obs.length) { cal.push([pred[obs[0][0]], obs[0][2]]); if (mode === 'type') cal.push([pred.chars, obs[0][2] && obs[1]?.[2] && true]); }
      L.observe(row);
      if (AT.includes(++n)) snap[n] = { s: L.skills(), I: I.map((r) => [...r]) };
      if (n >= END) break;
    }
  }
  return { P, snap, cal };
}
// the Bayes error after evidence I, for players spread Σt about the start, of the best estimator (start Σt) and of
// one starting at Σm instead: diag of P⁻¹(Λm Σt Λm + I)P⁻¹, P = Λm + I
function bayes(I, Sm, St) {
  const Lm = inv(Sm), P = inv(Lm.map((r, i) => r.map((x, j) => x + I[i][j]))), mid = mul(mul(Lm, St), Lm).map((r, i) => r.map((x, j) => x + I[i][j]));
  return mul(mul(P, mid), P).map((r, i) => Math.sqrt(r[i]));
}

const verdicts = [];
for (const app of has('app') ? [false, true] : [false]) {
  for (const [name, modes] of Object.entries(CONFIGS)) {
    const ex = exercised(modes), cal = [], St = SKILLS.map((_, i) => SKILLS.map((_, j) => (i === j ? SPREAD ** 2 : 0)));
    console.log(`\n${app ? 'THE APP’S LADDER' : 'TRUE MODEL'}, ${name} (${modes.join(', ')}): exercises ${ex.join(' ')}; ${N} players a persona`);
    console.log(`  ${'θ after 50/150 lines'.padEnd(22)}${SKILLS.map((k) => k.padStart(17)).join('')}`);
    for (const persona of Object.keys(PERSONAS)) {
      const runs = Array.from({ length: N }, () => run(modes, persona, app));
      runs.forEach((r) => cal.push(...r.cal));
      const rmse = (n, k) => Math.sqrt(runs.reduce((t, r) => t + (r.snap[n].s[k].m - r.P.th[k]) ** 2, 0) / N), sd = (n, k) => runs.reduce((t, r) => t + r.snap[n].s[k].s, 0) / N;
      const bias = (k) => runs.reduce((t, r) => t + r.snap[END].s[k].m - r.P.th[k], 0) / N;
      const Ibar = SKILLS.map((_, i) => SKILLS.map((_, j) => runs.reduce((t, r) => t + r.snap[END].I[i][j], 0) / N));
      const best = bayes(Ibar, St, St), mine = bayes(Ibar, startCov(persona), St);
      console.log(`  ${persona.padEnd(22)}${SKILLS.map((k) => `${fmt(rmse(AT[0], k))}/${fmt(rmse(END, k))} (${fmt(sd(END, k))})`.padStart(17)).join('')}`);
      console.log(`  ${'  bias at 150'.padEnd(22)}${SKILLS.map((k) => fmt(bias(k)).padStart(17)).join('')}`);
      console.log(`  ${'  best / this start'.padEnd(22)}${SKILLS.map((_, i) => `${fmt(best[i])} / ${fmt(mine[i])}`.padStart(17)).join('')}`);
      // what each way measures: its own mix of the skills (off a call)
      const mix = wayList(modes).map((w) => { const e = Math.sqrt(runs.reduce((t, r) => t + SKILLS.reduce((u, k) => u + load(w, k, false) * (r.snap[END].s[k].m - r.P.th[k]), 0) ** 2, 0) / N); return [w, e]; });
      console.log(`  ${'  ways after 150'.padEnd(22)}${mix.map(([w, e]) => `${w} ${fmt(e)}`).join('   ')}`);
      if (app) continue;
      SKILLS.forEach((k, i) => {
        verdicts.push({ name, persona, k, rmse: rmse(END, k), best: best[i], ex: ex.includes(k) });
        const why = k === 'S' && bias(k) < -0.2 && modes.includes('self') ? `: say-and-check counted less (learner.js SELF ${SELF})` : '';
        if (ex.includes(k) && Math.abs(bias(k)) > BIAS) fail(`${name}, ${persona}: ${k} comes out ${fmt(bias(k))} on average after ${END} lines (more than ${BIAS} either way)${why}`);
        else if (rmse(END, k) > mine[i] + SLACK) fail(`${name}, ${persona}: ${k} is off by ${fmt(rmse(END, k))} after ${END} lines, more than ${SLACK} worse than this start allows (${fmt(mine[i])}), with a bias of ${fmt(bias(k))}${why}`);
      });
    }
    // calibration: predicted chance against how often it really went right first time (deciles of the prediction)
    const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
    for (const [p, y] of cal) { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n++; b.p += p; b.y += +y; }
    const ece = bins.reduce((t, b) => t + (b.n ? Math.abs(b.p - b.y) : 0), 0) / cal.length;
    console.log(`  calibration, predicted → right first time (lines): ${bins.filter((b) => b.n).map((b) => `${fmt(b.p / b.n)}→${fmt(b.y / b.n)} (${b.n})`).join(' ')}; ECE ${fmt(ece, 3)}`);
    if (!app && ece > ECE) fail(`${name}: predictions are off, ECE ${fmt(ece, 3)} (target ${ECE})`);
  }
}

// docs/v2/p1.md's target: every exercised skill within 0.4 after 150 lines, for the four personas
const miss = verdicts.filter((v) => v.ex && v.rmse > TARGET), reach = verdicts.filter((v) => v.ex && v.best <= TARGET);
const worst = (vs) => Object.entries(Object.groupBy(vs, (v) => `${v.k} (${v.name})`)).map(([k, g]) => `${k} ${fmt(Math.max(...g.map((v) => v.rmse)))}, best possible ${fmt(Math.min(...g.map((v) => v.best)))}–${fmt(Math.max(...g.map((v) => v.best)))}`);
console.log(`\np1.md's target (each exercised skill within ${TARGET} after ${END} lines): ${miss.length ? `missed by ${worst(miss).join('; ')}` : 'met'}.`);
console.log(`  The evidence allows it for ${reach.length ? [...new Set(reach.map((v) => `${v.k} (${v.name}, ${v.persona})`))].join(', ') : 'no skill'}: each way of answering measures a weighted average of the skills (its loadings add to 1), so the differences between them, which a skill's own error needs, are barely seen.`);
const unseen = verdicts.filter((v) => !v.ex);
if (unseen.length) console.log(`  Not identified from these ways (no loading of 0.2): ${[...new Set(unseen.map((v) => v.k + ` (${v.name})`))].map((k) => `${k} ${fmt(Math.max(...unseen.filter((v) => `${v.k} (${v.name})` === k).map((v) => v.rmse)))}`).join('; ')}; the start alone is off by ${SPREAD.toFixed(2)}.`);
if (has('strict')) for (const v of miss) fail(`${v.name}, ${v.persona}: ${v.k} RMSE ${fmt(v.rmse)} after ${END} lines (p1.md's target ${TARGET}; best possible ${fmt(v.best)})`);
for (const p of problems) console.log('PROBLEM ' + p);
console.log(`\n${problems.length ? `${problems.length} problems` : 'all good'} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(problems.length ? 1 : 0);

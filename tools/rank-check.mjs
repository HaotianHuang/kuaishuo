#!/usr/bin/env node
// tools/rank-check.mjs: does the For You ranker (app/shared/rank.js) keep its rules, its wall and its time, and does
// deal-v1.js deal what the Mix dealt? Its parts:
//   deal-v1    the code mix.js dealt with at 3216e80 (P1, before the ranker), taken from git as it was, and deal-v1.js,
//              driven side by side over the same play, each batch asked for when v1's feed asked for one (as it opened,
//              as the card coming on screen was the third from the end, with nothing left to show): every card of the
//              same kind, story, phrase, word and line, and the same waiting() count, after each card, over hundreds of
//              random visits (stars, wins and losses, runs left part-way, time passing by minutes and days, the Mix
//              reopened); with and without runs; on data/ and a gate build. And deal-v1's next() on a third twin of the
//              stores, asked one card ahead as the Mix's feed asks: card for card what v1's feed showed
//   rules      every hard rule (rank.js's header: R1–R7, below an end card only reviews) on every pick of simulated
//              visits (tools/sim.mjs's learners, tools/truth.mjs's truth), each pick's facts worked out again by
//              tools/rules.mjs with learner.predict, and what a pick must be where something else was owed (no end card
//              while the visit could bring a story, a forced first card the surest, a rule giving way only when nothing
//              the rules allow is left, a rematch only when nothing new is allowed): first visits of every persona,
//              returning ones over 14 days, stories running out (all played, nothing due for days; all played long ago,
//              all due), everything due at once, a loss streak (a new learner who answered Mandarin), visits that never
//              stop, a learner far below every story (every line wrong), one format left (only the calls unplayed, or
//              only the chats); 10,000 picks at least. And over them all: every format dealt to every persona, every
//              recap straight after a win, every sure win won followed by its recap
//   E          the engagement draws: a story's E is 0.8 × its format's Thompson draw + 0.2 × its prior (data/ has no
//              topics), and over many fresh phones the draws spread as the format's arm says (the critics' prior,
//              weight 4: its mean and its sd)
//   wall       rank.js and deal-v1.js import nothing that touches the page (only DOM-free modules, each listed), and
//              rank.js nothing of econ.js or ads.js (nor days.js), at any depth; the same seed and history give the same picks, with
//              an ad economy's traces about (KS_AD, ks.econ and ks.ads in the store, ad rows in the log, and rows an ad
//              brought about, marked ad: a save's line asked again, the card it rescued) or none; P5a's options handed
//              in, days.js hearing the same rows
//   loops      P5a (p5.md): today's challenge dealt once a day as a story, rule 'challenge', the day's story, modifier
//              and number at the level nearest the say level, A and τ as why says; never first, after a loss, while
//              placing (it comes once placement ends), after its format; once on screen never again that day (swiped
//              past unplayed too), played from the menu never dealt, the next day's dealt; its story saved for it till
//              then; the same on two phones alike, each persona at its own level. An episode not a candidate the day
//              the one before is first finished (the recap: out false), one the next; no shadow card in quiet mode;
//              a story for an ending once a visit at most, none with every ending found; the countdown by the book
//   api        next() twice before a card is shown picks that place again (the same item when the choice stands),
//              again(), unsee(), waiting(), session(), every item's shape and every why's numbers; learner.batch() the
//              same numbers as learner.predict(); below an end card, every review waiting() counts comes when asked,
//              under the floor too; a re-pick that finds nothing keeps the card; a visit begun under a card still on
//              screen starts with it (its story and format not dealt next); time hidden isn't time spent (back()); the
//              Mix opened again inside a visit carries it on (resume); a card the ranker didn't deal moves the arms by
//              how far it got; a sure win won followed by its recap, though that quick card took fatigue back under
//              0.7; R2 against R3 (a word to write again owed straight after a word written)
//   time       a pick's time in Node over thousands of picks (warmed up), with the stores kept as a phone keeps them
//              (each value a string, parsed at every read) and mode() reading Settings as feed.js answering() does: its
//              mean, 95th percentile and worst, on the heaviest content (every level of every story) and with everything
//              due; a phone taken as 4× slower than this Mac (a mid-range phone's JavaScript against an M-series laptop's):
//              the 95th percentile × 4 under BUDGET (16 ms, a frame)
// Exit 1 on any problem.  node tools/rank-check.mjs [--picks=10000] [--seed=1]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const L = await import(path.join(ROOT, 'app/shared/learner.js'));
const S = await import(path.join(ROOT, 'app/shared/assist.js'));
const { over } = await import(path.join(ROOT, 'app/shared/store.js'));
const { what } = await import(path.join(ROOT, 'app/shared/events.js'));
const { createRanker } = await import(path.join(ROOT, 'app/shared/rank.js'));
const { createDays } = await import(path.join(ROOT, 'app/shared/days.js'));
const { dealV1 } = await import(path.join(ROOT, 'app/shared/deal-v1.js'));
const picks = await import(path.join(ROOT, 'app/shared/picks.js'));
const sim = await import(path.join(ROOT, 'tools/sim.mjs'));
const { says, rowId } = await import(path.join(ROOT, 'tools/truth.mjs'));
const { phraseId } = await import(path.join(ROOT, 'app/shared/content.js'));
// A pick's budget on a phone: one frame (60 Hz). It was 2 ms with 20 stories; with 119 (1 Nov 2026) a pick is 6–11 ms,
// most of it parsing ks.srs (p2.md says what would take it back down). A pick comes as a card settles, never mid-swipe.
const BUDGET = 16;
const PICKS = +opt('picks', 10000), SEED = +opt('seed', 1), DAY = 864e5, MIN = 60e3, V1 = '3216e80', LONG_MIN = 12;
// --only=first,rules,…: the parts to run (deal-v1, wall, api, visit, first, rules, E, determinism, time), all by default
const ONLY = opt('only', null)?.split(','), on = (k) => !ONLY || ONLY.includes(k);
const t0 = performance.now(), problems = [];
const fail = (m) => problems.push(m);
const f2 = (x, d = 2) => (x == null || Number.isNaN(x) ? '-' : x.toFixed(d));
const GATE = ['review/gate/p4b-2/data', 'review/gate/p4b-3/data', 'review/gate/p4b-5/data'].filter((d) => fs.existsSync(path.join(ROOT, d, 'content.json')));
const datas = Object.fromEntries(['data', ...GATE].map((d) => [d, sim.load(d)]));
// data/ cut to some of its stories (and their phrases), as a build of them alone would be
const only = (d, keep) => { const scenarios = d.scenarios.filter(keep), ids = new Set(scenarios.map((s) => s.id)), phrases = d.phrases.filter((q) => ids.has(q.scn)); return { ...d, scenarios, phrases, byId: Object.fromEntries(scenarios.map((s) => [s.id, s])), phraseById: Object.fromEntries(phrases.map((q) => [q.id, q])) }; };
// v1's twenty alone: for the checks of a mechanism that a small catalogue reaches in a few cards (a sure win, a word to
// write, a shadow), where with all of data/ a short visit is all new stories and the check would find nothing to check
const TWENTY = new Set(['hotpot-spicy', 'airport-esim', 'locked-out', 'taxi-airport', 'emei-monkey', 'meet-parents', 'farm-goose', 'office-boss', 'village-tiger', 'new-year-dodge', 'first-date', 'flat-flood', 'family-group', 'late-boss', 'rent-rise', 'courier-crabs', 'hotel-wakeup', 'mum-calling', 'landlord-leak', 'police-parcel']);
const twenty = only(datas.data, (s) => TWENTY.has(s.id));
const seeded = (s) => () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- deal-v1: the cards mix.js dealt, from the code as it was ----------
if (on('deal-v1')) {
  let src = null;
  try { src = execFileSync('git', ['show', `${V1}:app/protos/mix.js`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
  if (!src) console.log(`deal-v1: skipped (no git, or no ${V1} to read mix.js from)`);
  else {
    // order() and the dealing inside mount(), as they were, made a function of what they read (srs, marks, now,
    // chase.createRun, the pickers); and the run card's leave(), which gave a run's unreached phrases back
    const block = (head) => { const i = src.indexOf(head); let d = 0; for (let k = src.indexOf('{', i + head.length - 1); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); } throw new Error(`mix.js at ${V1}: ${head} not found`); };
    const consts = src.match(/^const FIRST = .*$/m)[0], body = src.slice(src.indexOf('  const data = app.data'), src.indexOf('  const f = feed(host, {'));
    const leave = src.match(/for \(const p of item\.ps\) if \(seen\.get\(p\.id\) === srs\.get\(p\.id\)\?\.due\) seen\.delete\(p\.id\);/)[0];
    const old = new Function('srs', 'marks', 'now', 'chase', 'wordsToWrite', 'linesToShadow', 'app', `${consts}\n${block('function order(scenarios) {')}\n${body}\nconst unsee = (item) => { ${leave} };\nreturn { more, waiting, unsee };`);
    const rand = seeded(SEED * 7 + 1);
    let items = 0, worlds = 0, given = 0;
    const kinds = {};
    for (const [dir, data] of Object.entries(datas).slice(0, 2)) {
      // every data object by name, so two cards compare by what they hold, not by being the same object
      const tags = new WeakMap();
      data.scenarios.forEach((s) => { tags.set(s, 'scn:' + s.id); const walk = (l, p) => (l || []).forEach((st, i) => { tags.set(st, `step:${s.id}:${p}.${i}`); if (st.say) { walk(st.say.ok, `${p}.${i}.ok`); walk(st.say.fail, `${p}.${i}.fail`); walk(st.say.miss, `${p}.${i}.miss`); (st.say.alts || []).forEach((a, k) => walk(a.then, `${p}.${i}.alt${k}`)); } }); walk(s.steps, ''); });
      data.phrases.forEach((p) => tags.set(p, 'p:' + p.id));
      const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && tags.has(v) ? tags.get(v) : v));
      for (let w = 0; w < 250; w++) {
        const runs = w % 5 !== 4, clock = { t: Date.parse('2026-11-02T08:00:00Z') + Math.floor(rand() * DAY) }, now = () => clock.t;
        const A = over(sim.memory(), now), B = over(sim.memory(), now), C = over(sim.memory(), now);
        let a, b, c, queue = [], handed = [], played = 0, bad = false;
        // a batch from each, as v1's feed asked for one: the same cards
        const deal = () => { const x = a.more(), y = b.more(); if (canon(x) !== canon(y)) { bad = true; fail(`deal-v1 (${dir}, visit ${w}, card ${played}): mix.js dealt ${canon(x).slice(0, 200)}, deal-v1 ${canon(y).slice(0, 200)}`); } queue.push(...x); items += x.length; x.forEach((it) => (kinds[it.kind] = (kinds[it.kind] || 0) + 1)); };
        // the Mix's feed asking deal-v1's next() for place k (one card ahead), if it has none there yet
        const give = (k) => { if (handed[k]) return; const z = c.next(); if (z) { handed[k] = z; given++; } };
        const open = () => { a = old(A.srs, A.marks, now, { createRun: runs ? () => {} : undefined }, picks.wordsToWrite, picks.linesToShadow, { data }); b = dealV1({ data, srs: B.srs, marks: B.marks, now, runs }); c = dealV1({ data, srs: C.srs, marks: C.marks, now, runs }); queue = []; handed = []; played = 0; deal(); give(0); };
        const all3 = (f) => { f(A); f(B); f(C); };
        worlds++; open();
        for (let k = 0; k < 70 && !bad; k++) {
          // nothing left to show: the end card's button, a while later (both feeds ask then)
          if (played >= queue.length) { clock.t += MIN * (1 + 30 * rand()); deal(); give(played); if (played >= queue.length) { clock.t += 20 * MIN; deal(); give(played); if (played >= queue.length) continue; } }
          // card i comes on screen: v1's feed asked for a batch if it was the third from the end, the Mix's asks for the card after it
          const i = played;
          if (i >= queue.length - 3) deal();
          give(i + 1);
          if (canon(handed[i]) !== canon(queue[i])) { bad = true; fail(`deal-v1 next() (${dir}, visit ${w}, card ${i}): the Mix's feed got ${canon(handed[i]).slice(0, 160)}, v1's showed ${canon(queue[i]).slice(0, 160)}`); }
          const it = queue[played++], stars = () => [0, 1, 2, 3, 3, 3][Math.floor(rand() * 6)];
          if (it.kind === 'scn') {
            for (const p of data.phrases.filter((p) => p.scn === it.scn.id)) if (rand() < 0.85) { const s = stars(); all3((W) => W.srs.record(p.id, s)); }
            if (rand() < 0.9) { const o = { outcome: rand() < 0.8 ? 'win' : 'lose', stars: Math.floor(rand() * 4) }; all3((W) => W.marks.done(it.scn.id, o)); }
            clock.t += MIN * (1.5 + 2 * rand());
          } else if (it.kind === 'review') { const s = stars(); all3((W) => W.srs.record(it.p.id, s)); clock.t += 30e3; }
          else if (it.kind === 'run') {
            const reach = rand() < 0.3 ? Math.floor(rand() * it.ps.length) : it.ps.length;
            it.ps.slice(0, reach).forEach((p) => { const s = stars(); all3((W) => W.srs.record(p.id, s)); });
            if (reach < it.ps.length) { a.unsee(it); b.unsee(it.ps.map((p) => p.id)); c.unsee(it.ps.map((p) => p.id)); }
            clock.t += MIN;
          } else if (it.kind === 'write') { if (rand() < 0.9) { const s = 1 + Math.floor(rand() * 3); all3((W) => W.srs.record('write:' + it.item.word, s)); } clock.t += 40e3; }
          else if (it.kind === 'end') clock.t += MIN * 20 * rand();
          else clock.t += 20e3;
          if (a.waiting() !== b.waiting() || b.waiting() !== c.waiting()) { bad = true; fail(`deal-v1 (${dir}, visit ${w}): waiting() ${a.waiting()} in mix.js, ${b.waiting()} in deal-v1, ${c.waiting()} one card at a time`); }
          const u = rand();
          if (u < 0.03) { clock.t += DAY * (1 + Math.floor(3 * rand())); open(); } else if (u < 0.06) { clock.t += 2 * 3600e3; open(); }
        }
      }
    }
    console.log(`deal-v1: ${problems.length ? 'see problems' : `the same ${items.toLocaleString('en')} cards as mix.js at ${V1} dealt (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}), and the same waiting(), over ${worlds} visits; next() one card ahead gave the same ${given.toLocaleString('en')} cards v1's feed showed, each batch asked for when v1's feed asked`}`);
  }
}

// ---------- the wall: what rank.js and deal-v1.js import, at any depth ----------
if (on('wall')) {
  const n0 = problems.length;
  // modules with no DOM in them at all, or only behind a typeof document guard (Node runs every one of them)
  const FREE = new Set(['content.js', 'files.js', 'picks.js', 'levels.js', 'store.js', 'time.js', 'deal-v1.js', 'rank.js']);
  const graph = (file, seen = new Map()) => {
    if (seen.has(file)) return seen;
    const src = fs.readFileSync(file, 'utf8'), deps = [...src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm), ...src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => path.resolve(path.dirname(file), m[1]));
    seen.set(file, deps);
    for (const d of deps) graph(d, seen);
    return seen;
  };
  for (const top of ['rank.js', 'deal-v1.js']) {
    const g = graph(path.join(ROOT, 'app/shared', top)), names = [...g.keys()].map((f) => path.relative(path.join(ROOT, 'app'), f));
    const ads = names.filter((n) => /(^|\/)(econ|ads)(-mock)?\.js$/.test(n)), dom = names.filter((n) => !FREE.has(path.basename(n)) || !n.startsWith('shared/'));
    if (top === 'rank.js' && ads.length) fail(`the wall: rank.js imports ${ads.join(', ')}`);
    // (nor days.js: it's handed released(), challenge() and endings(), P5a)
    if (top === 'rank.js' && names.some((n) => n.endsWith('days.js'))) fail('the wall: rank.js imports days.js');
    if (dom.length) fail(`${top} imports ${dom.join(', ')}, not on the DOM-free list`);
    console.log(`the wall: ${top} imports ${names.filter((n) => n !== 'shared/' + top).join(', ') || 'nothing'}: ${dom.length || ads.length ? 'see problems' : 'all DOM-free, no econ.js or ads.js'}`);
  }
  // no document, window, navigator or localStorage of its own (store.js's is in a try)
  const own = fs.readFileSync(path.join(ROOT, 'app/shared/rank.js'), 'utf8').replace(/\/\/.*$/gm, '');
  if (/\b(document|window|navigator|localStorage|econ|ads)\b/.test(own)) fail('rank.js mentions the page or the ad economy');
  if (problems.length > n0) console.log('the wall: see problems');
}

// A learner of a persona on a content build, its stores and clock, a ranker (more made over the same stores: the Mix
// opened again), and a card played as a player would: its lines (right, or how(beat, i) → 'ok' | 'timeout'), each
// recorded in spaced review and heard by the learner model, then the ranker, as events.js logs them (log keeps every row).
// fresh: a phone that has never played (the first session's: the hook, the about card, placement); else one that has
// played a story in the lab (a version's own feed, a story of none of these builds, done as the phone is picked up), so
// P2's checks see a visit open as P2 opened one, by R1, and has seen the about card (ks.arms.about), so none comes; before:
// one that played before P3 and never saw it (P5a's later about card is owed). loops: P5a's days.js over the phone's
// stores, hearing every row, its released(), challenge() and endings() handed to every ranker (quiet: P.hush)
function phone(data, persona = 'mandarin', { t = Date.parse('2026-11-02T18:00:00Z'), seed = 11, mic = true, explain = false, fresh = false, before = false, loops = false } = {}) {
  const clock = { t }, now = () => clock.t, store = sim.memory(), log = [], ms = sim.memory();
  L.init(data, { store: sim.memory(), now }); if (persona) L.persona(persona); S.init({ store: sim.memory() });
  const { srs, marks } = over(ms, now), rng = seeded(seed);
  if (!fresh) marks.done('lab-story', { outcome: 'win', stars: 3 });
  if (!fresh && !before) store.set('arms', { v: 1, fmt: {}, topic: {}, about: t });
  const days = loops ? createDays({ data, store: ms, now }) : null;
  const P5 = days ? { released: days.released, challenge: () => days.challenge(), endings: (s) => days.endings(s), quiet: () => P.hush } : {};
  const mk = (o = {}) => createRanker({ data, learner: L, assist: S, srs, marks, store, now, rng, mode: sim.MODES[mic ? 'mic' : 'no mic'], explain, ...P5, ...o });
  const P = { data, clock, now, store, log, srs, marks, days, hush: false, mk };
  P.r = mk();
  P.hear = (row) => { log.push(row); L.observe(row); days?.hear(row); P.r.after(row); };
  // its lines, and then (left: false) not yet its card row: the card done, its end screen up (ms: each right line's time)
  P.lines = (p, how = () => 'ok', ms = 4000) => {
    const it = p.item, ids = it.kind === 'scn' || it.kind === 'challenge' ? says(it.scn).filter((b) => !b.again).map((b) => rowId(it.scn, b)) : it.kind === 'review' || it.kind === 'bonus' ? [it.p.id] : it.kind === 'run' ? it.ps.map((q) => q.id) : [];
    ids.forEach((id, i) => { clock.t += 20e3; const ok = how(id, i) === 'ok'; srs.record(id, ok ? 3 : 0); P.hear({ k: 'line', at: clock.t, id, lv: data.phraseById[id]?.level, mode: 'speak', att: 1, hint: 0, hear: false, tries: 0, alt: -1, ms: ok ? ms : 15000, clock: 15, assist: it.A ?? 2, res: ok ? 'ok' : 'timeout', stars: ok ? 3 : 0, ...(ok ? { perfect: true } : {}), ...(it.kind === 'scn' || it.kind === 'challenge' ? {} : { task: it.kind === 'bonus' ? 'bonus' : 'review' }) }); });
    if (it.kind === 'scn' || it.kind === 'challenge') marks.done(it.scn.id, { outcome: ids.every((id, i) => how(id, i) === 'ok') ? 'win' : 'lose', stars: 3 });
    if (it.kind === 'write') srs.record('write:' + it.item.word, 3);
    return ids.length;
  };
  P.left = (p, o = {}) => { clock.t += 5000; P.hear({ k: 'card', at: clock.t, ...what(p.item), ms: 60000, state: 'done', how: 'swipe', ...o }); };
  P.play = (p, how) => { const n = P.lines(p, how); P.left(p, n ? { asked: n } : {}); };
  return P;
}

// ---------- api, items, why, and batch() ----------
if (on('api')) {
  const n0 = problems.length, data = datas.data, P = phone(data), { clock, srs, marks } = P, r = P.r;
  const WHY = ['score', 'E', 'F', 'V', 'N', 'tau', 'p', 'A', 'lv', 'rule', 'cls', 'prop', 'n'];
  const shape = (p, where) => {
    if (!p?.item?.kind || !p.why) return fail(`${where}: no { item, why }`);
    const { item: it, why } = p, missing = WHY.filter((k) => !(k in why));
    if (missing.length) fail(`${where}: why lacks ${missing.join(', ')}`);
    if (it.kind === 'scn') { if (!it.scn?.steps || it.lv !== it.scn.level || !Number.isInteger(it.A) || !(it.tau > 0) || it.A !== why.A || it.lv !== why.lv || !['new', 'level', 'rematch', 'ending'].includes(why.cls)) fail(`${where}: a story item ${JSON.stringify({ lv: it.lv, level: it.scn?.level, A: it.A, tau: it.tau, cls: why.cls })} isn't { scn tailored to lv, lv, A, tau } with why's A, lv and class`); for (const k of ['score', 'E', 'F', 'V', 'N', 'p']) if (!Number.isFinite(why[k])) fail(`${where}: why.${k} is ${why[k]}`); }
    if (it.kind === 'review' && !data.phraseById[it.p?.id]) fail(`${where}: a review of no phrase`);
    if (it.kind === 'run' && !(it.ps?.length >= 3 && it.ps.every((q) => data.phraseById[q.id]) && it.audio === it.ps[0].audio)) fail(`${where}: a run isn't { ps (3+ phrases), audio }`);
    if (it.kind === 'write' && !(it.item?.word && it.item.phrase && it.item.syl)) fail(`${where}: a write isn't { item: { word, phrase, syl } }`);
    if (it.kind === 'shadow' && !(it.item?.scn?.steps && it.item.step?.a)) fail(`${where}: a shadow isn't { item: { scn, step } }`);
    if (it.kind === 'recap' && !(Array.isArray(it.nailed) && Array.isArray(it.written) && Number.isInteger(it.back))) fail(`${where}: a recap isn't { said, nailed, written, back, next }`);
  };
  const p0 = r.next(), p1 = r.next(), p1b = r.next(), p1c = r.again();
  shape(p0, 'card 1'); shape(p1, 'card 2'); shape(p1b, 'card 2 again');
  if (p0?.why.rule !== 'first' && p0?.why.rule !== 'first*') fail(`a visit's first card came by rule ${p0?.why.rule}`);
  // card 2 dealt as card 1 comes on screen, then asked for again with nothing new: the same place, the same item
  if (p1b?.item !== p1?.item || p1c?.item !== p1?.item) fail('next() again before card 2 was shown, with nothing changed, gave another item (it should be the same place, and the same item)');
  if (r.session().cards.length !== 2) fail(`after a first card and three asks for the second, the visit has ${r.session().cards.length} cards, not 2`);
  // card 1 played and left: card 2 is on screen, and next() is card 3
  const it0 = p0.item;
  for (const q of data.phrases.filter((q) => q.scn === it0.scn?.id).slice(0, 3)) { clock.t += 20e3; srs.record(q.id, 3); P.hear({ k: 'line', at: clock.t, id: q.id, lv: q.level, mode: 'speak', att: 1, hint: 0, hear: false, tries: 0, alt: -1, ms: 4000, clock: 15, assist: it0.A, res: 'ok', stars: 3, perfect: true }); }
  marks.done(it0.scn.id, { outcome: 'win', stars: 3 });
  P.left(p0, { out: 'win', stars: 3, asked: 3 });
  if (r.again() !== null) fail('again() once card 2 is on screen (card 1 left) gave a pick');
  const p2 = r.next();
  shape(p2, 'card 3');
  if (r.session().cards.length !== 3) fail(`card 3 dealt, but the visit has ${r.session().cards.length} cards`);
  if (!(r.session().nailed.length === 3 && r.session().lines === 3)) fail(`session() after 3 lines nailed: ${JSON.stringify({ lines: r.session().lines, nailed: r.session().nailed.length })}`);
  if (typeof r.waiting() !== 'number') fail('waiting() isn\'t a number');
  // batch(): the same numbers as predict(), the ranker's every p̄ stands on them
  for (const [dir, d] of Object.entries(datas)) {
    L.init(d, { store: sim.memory(), now: P.now }); L.persona('dialect');
    for (const q of d.phrases.slice(0, 40)) L.observe({ k: 'line', at: P.now(), id: q.id, lv: q.level, mode: ['speak', 'self', 'type', 'tiles'][q.id.length % 4], att: 1, hint: 0, tries: 0, res: q.id.length % 3 ? 'ok' : 'timeout', perfect: true, stars: 3, ms: 6000, clock: 15 });
    const B = L.batch();
    let n = 0, off = 0;
    for (const q of d.phrases) for (const mode of ['speak', 'self', 'type', 'tiles']) for (let A = 0; A < 6; A++) for (const typed of ['chars', 'pinyin']) { n++; if (B(q.id, { mode, assist: A, typed }) !== L.predict(q.id, { mode, assist: A, typed })) off++; }
    if (off) fail(`learner.batch() differs from predict() on ${off} of ${n} (${dir})`);
  }
  console.log(`api: ${problems.length > n0 ? 'see problems' : 'next() twice before a card is shown is that place again (the same item), again() null once it is, session(), waiting(), every item\'s shape and why\'s numbers; batch() = predict() exactly'}`);
}

// ---------- the visit: below an end card, a re-pick with nothing, a visit begun under a card, time away, the Mix opened again ----------
if (on('visit')) {
  const n0 = problems.length, said = [];
  // A content build of two stories (an end card soon): a learner who timed out on 40 lines, so the model puts their
  // reviews under the floor; five phrases due. Below the end card, every one waiting() counts comes, one card at a time.
  {
    const d = datas.data, keep = new Set(['hotpot-spicy', 'farm-goose']), data = { ...d, scenarios: d.scenarios.filter((s) => keep.has(s.id)), phrases: d.phrases.filter((q) => keep.has(q.scn)) };
    data.byId = Object.fromEntries(data.scenarios.map((s) => [s.id, s])); data.phraseById = Object.fromEntries(data.phrases.map((q) => [q.id, q]));
    const P = phone(data, 'new'), { clock, srs } = P;
    for (let k = 0; k < 40; k++) { const q = data.phrases[k % data.phrases.length]; L.observe({ k: 'line', at: clock.t, id: q.id, lv: q.level, mode: 'speak', att: 1, hint: 0, tries: 0, res: 'timeout', stars: 0, ms: 15000, clock: 15 }); }
    const seq = [];
    for (let k = 0; k < 4; k++) { const p = P.r.next(); seq.push(p?.item.kind); if (!p || p.item.kind === 'end') break; P.play(p, () => 'timeout'); }
    // five of the phrases those cards put in review (not a level's own phrase the cards didn't deal: scn/beat@L)
    const due5 = data.phrases.filter((q) => srs.all()[q.id]).slice(0, 5);
    for (const q of due5) { const e = srs.all()[q.id]; e.due = clock.t - 60e3; } // (srs.all() is the store's own object)
    const under = due5.map((q) => L.predict(q.id, { mode: 'speak', assist: 2, typed: 'pinyin' }));
    clock.t += 60e3;
    const n = P.r.waiting();
    let got = 0, cards = 0, q;
    while ((q = P.r.next()) && cards < 12) { cards++; got += q.item.kind === 'run' ? q.item.ps.length : 1; if (!['review', 'run', 'write'].includes(q.item.kind)) { fail(`below an end card a ${q.item.kind} came`); break; } P.r.after({ k: 'card', at: clock.t, ...what(q.item), ms: 1000, state: 'idle', how: 'swipe' }); } // glanced past (no time passing, nothing else falls due): still due
    if (seq[seq.length - 1] !== 'end') fail(`two stories, played: no end card after them (${seq.join(', ')})`);
    else if (!(n > 0 && got === n)) fail(`below an end card, waiting() said ${n} and next() dealt ${got} (${cards} cards)`);
    else said.push(`below an end card, the ${n} reviews waiting() counts all come when asked, at p̄ ${f2(Math.min(...under))}–${f2(Math.max(...under))} under the floor too`);
  }
  // A re-pick that finds nothing to deal keeps the card the feed shows
  {
    const d = datas.data, keep = new Set(['hotpot-spicy', 'farm-goose']), data = { ...d, scenarios: d.scenarios.filter((s) => keep.has(s.id)), phrases: d.phrases.filter((q) => keep.has(q.scn)) };
    data.byId = Object.fromEntries(data.scenarios.map((s) => [s.id, s])); data.phraseById = Object.fromEntries(data.phrases.map((q) => [q.id, q]));
    const P = phone(data, 'mandarin'), { clock, srs } = P;
    let p = P.r.next();
    while (p && p.item.kind !== 'end') { P.play(p); p = P.r.next(); }
    // the end card on screen (not left): a phrase falls due, a review is dealt below it; then nothing is due after all
    const id = data.phrases[0].id; srs.all()[id].due = clock.t - 1000; clock.t += 1000;
    const rv = P.r.next(), n = P.r.session().cards.length;
    for (const e of Object.values(srs.all())) e.due = clock.t + DAY;
    const again = P.r.again();
    if (rv?.item.kind !== 'review' || again !== null || P.r.session().cards.length !== n) fail(`a re-pick with nothing to deal: ${JSON.stringify({ dealt: rv?.item.kind, again: again?.item.kind ?? null, before: n, after: P.r.session().cards.length })} (it should keep the review dealt)`);
    else said.push('a re-pick with nothing to deal keeps the card the feed shows');
  }
  // Back after half an hour with card 1 still up and card 2 dealt: card 2 picked again for the new visit, which starts
  // with card 1 (its story played, its format the last); and time hidden isn't time spent
  {
    const P = phone(datas.data, 'mandarin'), { clock } = P, p = P.r.next(), first = rowId(p.item.scn, says(p.item.scn)[0]);
    const line = () => P.hear({ k: 'line', at: clock.t, id: first, lv: p.item.scn.level, mode: 'speak', att: 1, hint: 0, tries: 0, res: 'ok', stars: 3, perfect: true, ms: 3000, clock: 15 });
    clock.t += 20e3; line(); // card 1 under way
    const before = P.r.next();
    clock.t += 31 * MIN;
    const after = P.r.again(), s = P.r.session();
    if (!after || after.item.scn?.id === p.item.scn.id || after.item.scn?.format === p.item.scn.format || s.cards[0]?.key !== `${p.item.scn.id}@${p.item.lv}` || s.cards.length !== 2) fail(`back after 31 minutes with card 1 up: card 2 ${before?.item.scn?.id} became ${after?.item.scn?.id} (${after?.why.rule}); the new visit's cards ${JSON.stringify(s.cards.map((c) => c.key))} (card 1 is ${p.item.scn.id}, a ${p.item.scn.format})`);
    else said.push('a visit begun under a card still on screen starts with it: the next card is neither its story nor its format');
    // hidden 10 minutes, back (back()), then a line: the time away isn't in the visit's minutes
    const m0 = s.minutes;
    clock.t += 60e3; line();
    clock.t += 10 * MIN; P.r.back(); clock.t += 20e3; line();
    const m1 = P.r.session().minutes;
    if (Math.abs(m1 - m0 - 80 / 60) > 0.01) fail(`ten minutes hidden counted as time spent: the visit went from ${f2(m0)} to ${f2(m1)} minutes (1.33 more)`);
    else said.push('ten minutes hidden, back(): not time spent');
  }
  // The Mix opened again inside a visit: a ranker made with resume() (the visit's rows) carries it on
  {
    const P = phone(datas.data, 'mandarin'), { clock } = P, start = clock.t, keys = [];
    for (let k = 0; k < 4; k++) { const p = P.r.next(); keys.push(p.item.scn ? p.item.scn.id : p.item.kind); P.play(p); clock.t += MIN; }
    const a = P.r.session(), r2 = P.mk({ resume: () => ({ start, rows: P.log }) }), b = r2.session(), nx = r2.next();
    const same = b && b.cards.length === a.cards.length && b.cards.every((c, i) => c.key === a.cards[i].key && c.out === a.cards[i].out) && Math.abs(b.minutes - a.minutes) < 0.01 && b.nailed.length === a.nailed.length && b.returning === a.returning && b.tau === a.tau;
    if (!same) fail(`the Mix opened again inside a visit didn't carry it on: before ${JSON.stringify({ cards: a.cards.map((c) => c.key), minutes: f2(a.minutes), nailed: a.nailed.length, tau: a.tau })}, after ${JSON.stringify(b && { cards: b.cards.map((c) => c.key), minutes: f2(b.minutes), nailed: b.nailed.length, tau: b.tau })}`);
    else if (keys.includes(nx?.item.scn?.id) || nx?.why.rule === 'first' || nx?.why.rule === 'first*') fail(`the Mix opened again inside a visit dealt ${nx?.item.scn?.id} (${nx?.why.rule}) after ${keys.join(', ')}`);
    else said.push(`the Mix opened again inside a visit carries it on: its ${a.cards.length} cards, ${f2(a.minutes, 1)} minutes, τ and lines, and deals none of its stories again`);
  }
  // A card the ranker didn't deal (another version's, v1's), left 4 lines into 5: +½ to β, not +1
  {
    const P = phone(datas.data, 'mandarin'), s = P.data.scenarios.find((x) => x.format === 'chat' && says(x).length === 5) || P.data.scenarios.find((x) => x.format === 'chat');
    P.r.next();
    const before = [...(P.store.get('arms').fmt.chat || [0, 0])], n = says(s).length, k = Math.ceil(0.8 * n);
    for (const b of says(s).slice(0, k)) { P.clock.t += 20e3; P.r.after({ k: 'line', at: P.clock.t, id: rowId(s, b), lv: s.level, mode: 'type', att: 1, hint: 0, tries: 0, res: 'ok', stars: 3, perfect: true, ms: 4000, clock: 15 }); }
    P.r.after({ k: 'card', at: (P.clock.t += 5000), kind: 'scn', id: s.id, fmt: 'chat', lv: s.level, ms: 60000, state: 'playing', how: 'swipe', asked: k });
    const after = P.store.get('arms').fmt.chat, dB = after[1] - before[1];
    if (Math.abs(dB - 0.5) > 1e-9) fail(`a chat the ranker didn't deal, left ${k} lines into ${n}: β moved ${f2(dB)}, not 0.5`);
    else said.push('a card it didn\'t deal, left most of the way: ½ to β, by its row\'s own count');
  }
  // A sure win won has its recap, even where that quick card took fatigue back under 0.7: a visit tired early (quick
  // lines, then slow ones, then cards swiped past: slowness and skips, under 12 minutes in), its sure win won (a swipe
  // past drops out of the last five cards), fatigue under 0.7 again: the recap. Phones are tried until one deals a sure
  // win so (data/'s many stories make it a matter of which come up; the rules' fortnight counts every sure win's recap)
  {
    let p = null, P = null, k = 0;
    for (let seed = 1; seed <= 60 && p?.why.rule !== 'sure win'; seed++) {
      P = phone(datas.data, ['mandarin', 'dialect', 'studied'][seed % 3], { seed });
      for (let j = 0; j < 2; j++) P.play(P.r.next());
      const slow = P.r.next(); P.left(slow, { asked: P.lines(slow, () => 'ok', 14000) });
      p = P.r.next(); k = 0;
      for (; k < 12 && p && p.why.rule !== 'sure win'; k++) { P.left(p, { state: 'idle' }); p = P.r.next(); }
    }
    if (p?.why.rule !== 'sure win') fail(`the sure win's recap: no sure win on 60 phones' tired visits (the check found nothing to check)`);
    else {
      P.play(p);
      const s = P.r.session(), q = P.r.next();
      if (!(s.fatigue <= 0.7 && s.minutes < LONG_MIN)) fail(`the sure win's recap: after the sure win, fatigue ${f2(s.fatigue)} and ${f2(s.minutes)} minutes in (the case wants it under 0.7, under ${LONG_MIN} minutes)`);
      else if (q?.why.rule !== 'recap') fail(`a sure win (${p.item.kind}) won, fatigue back to ${f2(s.fatigue)}: next() gave ${q ? `${q.item.kind} (${q.why.rule})` : 'nothing'}, not the recap`);
      else said.push(`a sure win won has its recap, fatigue back under 0.7 (${f2(s.fatigue)}) or not`);
    }
  }
  // R2 against R3: a word written, three cards since a review, and the only review due a word to write again (R2 holds
  // it back a card): a story comes, not an end card
  {
    let found = 0;
    for (let seed = 1; seed < 400 && found < 3; seed++) {
      const P = phone(twenty, 'studied', { seed, mic: false });
      for (let c = 0; c < 14; c++) {
        const p = P.r.next();
        if (!p || p.item.kind === 'end') break;
        P.play(p);
        const s = P.r.session(), cs = s.cards.filter((x) => x.kind !== 'recap' && x.kind !== 'end'), lastRev = cs.map((x, i) => [x, i]).filter(([x]) => x.kind === 'review' || x.kind === 'run').pop();
        if (cs[cs.length - 1].kind !== 'write' || cs.length - (lastRev ? lastRev[1] + 1 : 0) < 3) continue;
        const all = P.srs.all(), w = Object.keys(all).find((id) => id.startsWith('write:'));
        for (const id in all) all[id].due = P.clock.t + DAY;
        all[w].due = P.clock.t - 1000;
        const q = P.r.next();
        if (!q || q.item.kind === 'end' || q.item.kind === 'write') fail(`R2 against R3 (seed ${seed}): after a word written, with only ${w} owed, next() gave ${q ? `${q.item.kind} (${q.why.rule})` : 'nothing'}`);
        found++;
        break;
      }
    }
    if (found) said.push(`R2 against R3: a word to write again owed straight after a word written waits a card, a story comes (${found} visits)`);
    else fail('R2 against R3: no visit dealt a word to write after three cards with no review (the check found nothing to check)');
  }
  // An L0 chase's again encounter is logged under the line it drills (chase.js), and at L0 a line's help steps down as
  // it's met: once that line is met, the encounter is no first meeting, in the ranker's p̄ as in play (each line at
  // assist.lineRung of the meetings its rows go by, worked out here with learner.predict)
  {
    const d = datas['review/gate/p4b-2/data'], s = d?.scenarios.find((x) => x.level === 0 && x.format === 'chase' && says(x).some((b) => b.again));
    if (s) {
      const P = phone(d, 'new', { explain: true }), b = says(s).find((b) => b.again);
      P.srs.record(rowId(s, b), 3); P.clock.t += 60e3; P.srs.record(rowId(s, b), 3); // the line it drills met twice
      const p = P.r.next(), c = p.why.cands.find((c) => c.key === `${s.id}@0`), all = P.srs.all(), way = sim.MODES.mic(s, 'scn'), bs = new Map(says(s).map((x) => [phraseId(s, x), x]));
      const want = c && [...bs].reduce((t, [id, x]) => t + L.predict(id, { mode: way(x), assist: S.lineRung(c.A, { level: 0, seen: all[rowId(s, x)]?.seen || 0, attempt: 1 }), typed: 'pinyin' }), 0) / bs.size;
      if (!c || Math.abs(c.p - want) > 1e-9) fail(`an L0 chase's again encounter (${s.id}): the ranker's p̄ ${c?.p} against ${want} with its meetings counted under the line it drills`);
      else said.push(`an L0 chase's again encounter (${s.id}) is met as the line it drills is (p̄ ${f2(c.p, 3)})`);
    }
  }
  console.log(`the visit: ${problems.length > n0 ? 'see problems' : said.join('; ')}`);
}

// ---------- the first session (p3.md): the hook, the about card, placement, the bonus line, goals ----------
// Fresh phones (nothing in the model, in spaced review or done), driven card by card, on every build: card 1 the hook (a
// scenario marked first, else airport-esim, at its base level and the rung startAt() gives: A2 on a blank model),
// card 2 the about card asking what's unanswered, in its order (all three; two with the home question answered in
// Settings; none, and a story, with all three), never again once it's been on screen, whatever was tapped; a visit
// that ended under the hook (its row logged as the page went) opens the next on the about card, then R1's first card;
// placing, every story aimed at τ 0.70, placement ending at 12 placement lines and never again;
// with R7 lifted (hold 0) placement's call (PL1) and then its chat (PL2), where R7 holds a new learner's calls a story
// of another format; the bonus line once, after a card all right (a phrase never met, of a story not played), and
// missed it's no loss (the card after it isn't dealt for a loss's τ), and never a phrase met or of a story done (a
// build where every other story is played, done or met: no bonus at all); a phone that has played (not fresh) never
// sees the about card; goals: by the book (p3.md's table, not rank.js's), every format's and topic's prior and every
// skill's gap weight as the pick read them, each goal alone and all four; a goal's topics' arms start at 0.8 (E), and
// family weighs the gaps in L, S and V more (V)
if (on('first')) {
  const n0 = problems.length, said = [];
  const story = (q) => (q?.item.kind === 'scn' ? `${q.item.scn.id}@${q.item.lv}` : q?.item.kind) + ` (${q?.why.rule})`;
  for (const [dir, data] of Object.entries(datas)) {
    const hook = data.scenarios.find((s) => s.first) || data.byId['airport-esim'], tag = `${dir}:`;
    // the hook, the about card asking all three, then a story placing at τ 0.70; the about card on screen and swiped past
    // with nothing tapped: never again, next visit nor the one after
    {
      const P = phone(data, null, { fresh: true }), p0 = P.r.next(), p1 = P.r.next();
      if (!(p0?.item.kind === 'scn' && p0.item.scn.id === hook.id && p0.item.lv === hook.level && p0.why.rule === 'hook' && p0.item.A === 2 && p0.why.A === 2 && p0.item.tau === p0.why.tau)) fail(`${tag} a fresh phone's first card ${story(p0)} at A${p0?.item.A}, not the hook ${hook.id}@${hook.level} at A2`);
      if (!(p1?.item.kind === 'about' && p1.item.ask?.join() === 'home,goals,born' && p1.why.rule === 'about')) fail(`${tag} a fresh phone's card 2 is ${story(p1)} asking ${p1?.item.ask}, not the about card asking home, goals, born`);
      P.play(p0);
      const p2 = P.r.next();
      if (p2?.item.kind !== 'scn' || p2.why.tau !== 0.7 || p2.item.tau !== 0.7 || !P.r.session().placing) fail(`${tag} card 3, after the hook won and the about card: ${story(p2)} at τ ${p2?.why.tau}, placing ${P.r.session().placing} (a story at τ 0.70 wanted)`);
      P.left(p1);
      for (const gap of [31 * MIN, DAY]) { P.clock.t += gap; P.r = P.mk(); const q = [P.r.next(), P.r.next()]; if (q.some((x) => x?.item.kind === 'about')) fail(`${tag} the about card, swiped past with nothing tapped, dealt again ${gap === DAY ? 'the next day' : 'in a new visit'}`); }
    }
    // questions answered in Settings first: home answered, the card asks the other two; all three, no card (a story)
    {
      const P = phone(data, 'studied', { fresh: true }), p1 = (P.r.next(), P.r.next());
      if (!(p1?.item.kind === 'about' && p1.item.ask.join() === 'goals,born')) fail(`${tag} with the home question answered, card 2 is ${story(p1)} asking ${p1?.item.ask} (goals, born wanted)`);
      const Q = phone(data, 'dialect', { fresh: true }); Q.store.set('goals', []); Q.store.set('born', 0);
      const q1 = (Q.r.next(), Q.r.next());
      if (q1?.item.kind !== 'scn') fail(`${tag} with all three answered, card 2 is ${story(q1)}, not a story`);
    }
    // a phone that has played and seen the about card (a story in the lab), nothing answered: no about card, this visit
    // or the next; one that played before P3 and never saw it (P5a): the later card, card 2 (never a visit's first),
    // asking P3's three and 'soon', why.later; once on screen, never again, this visit or the next; a loss straight
    // before it puts it off (to card 3, after a win); with every question answered, none
    {
      const P = phone(data, null), q = [P.r.next(), P.r.next(), P.r.next()];
      P.clock.t += DAY; P.r = P.mk(); q.push(P.r.next(), P.r.next());
      if (q.some((x) => x?.item.kind === 'about')) fail(`${tag} a phone that has played and seen the about card, nothing answered, dealt it: ${q.map(story).join(', ')}`);
      const Q = phone(data, null, { before: true }), q0 = Q.r.next(), q1 = Q.r.next();
      if (q0?.item.kind === 'about' || !(q1?.item.kind === 'about' && q1.item.ask.join() === 'home,goals,born,soon' && q1.why.rule === 'about' && q1.why.later)) fail(`${tag} a phone that played before P3: ${story(q0)}, ${story(q1)} asking ${q1?.item.ask} (a story, then the later about card asking home, goals, born, soon)`);
      Q.play(q0); Q.left(q1);
      const later = [Q.r.next()]; Q.play(later[0]); later.push(Q.r.next());
      Q.clock.t += DAY; Q.r = Q.mk(); later.push(Q.r.next(), Q.r.next());
      if (later.some((x) => x?.item.kind === 'about')) fail(`${tag} the later about card on screen, dealt again: ${later.map(story).join(', ')}`);
      const R = phone(data, 'new', { before: true }), r0 = R.r.next(); R.play(r0, () => 'timeout');
      const r1 = R.r.next();
      if (r1?.item.kind === 'about') fail(`${tag} the later about card straight after a loss`);
      else { R.play(r1); const r2 = R.r.next(); if (R.marks.doneAll()[r1.item.scn?.id]?.outcome === 'win' && !(r2?.item.kind === 'about' && r2.item.ask.join() === 'goals,born,soon')) fail(`${tag} a loss, then a win: ${story(r2)}, not the later about card asking goals, born, soon`); }
      const A = phone(data, 'studied', { before: true }); for (const [k, v] of [['goals', []], ['born', 1990], ['soon', { what: 'none', day: null }]]) A.store.set(k, v);
      const a = [A.r.next(), A.r.next(), A.r.next()];
      if (a.some((x) => x?.item.kind === 'about')) fail(`${tag} every question answered, the later about card dealt`);
    }
    // a visit that ended under the hook (left as the page went: the about card below it never seen): the next visit opens
    // on the about card, then R1's first card
    {
      const P = phone(data, null, { fresh: true }), p0 = P.r.next(); P.r.next();
      P.lines(p0); P.left(p0, { how: 'hide' });
      P.clock.t += 40 * MIN; P.r = P.mk();
      const q0 = P.r.next(), q1 = P.r.next();
      if (!(q0?.item.kind === 'about' && q0.why.rule === 'about' && q1?.item.kind === 'scn' && ['first', 'first*'].includes(q1.why.rule))) fail(`${tag} after a visit that ended under the hook, the next opens ${story(q0)}, ${story(q1)} (the about card, then R1's first card, wanted)`);
    }
    // placing: every story dealt at τ 0.70 (all its lines right: no loss's τ), placement's lines counted on story cards
    // only, and ended at 12, never to start again; the bonus once on the way, after a card all right
    {
      const P = phone(data, null, { fresh: true });
      let p = P.r.next(), bonus = 0, bonusAt = -1, wrongTau = [], k = 0;
      for (; k < 30 && p && P.r.session().placing; k++) {
        if (p.item.kind === 'scn' && p.why.rule !== 'hook' && p.why.tau !== 0.7) wrongTau.push(`${story(p)} at τ ${p.why.tau}`);
        if (p.item.kind === 'bonus') { bonus++; bonusAt = k; if (!(data.phraseById[p.item.p?.id] && !P.srs.all()[p.item.p.id] && !P.marks.doneAll()[p.item.p.scn] && p.why.A === 2 && Number.isFinite(p.why.p))) fail(`${tag} the bonus ${p.item.p?.id}: not a phrase never met of a story not played, at A2 with its chance`); }
        P.play(p, () => (p.item.kind === 'bonus' ? 'timeout' : 'ok')); // the bonus missed
        const q = P.r.next();
        if (p.item.kind === 'bonus' && q?.why.tau === 0.92) fail(`${tag} a bonus missed dealt the next card for a loss (τ 0.92)`);
        p = q;
      }
      const pl = P.r.session().place;
      if (wrongTau.length) fail(`${tag} placing, stories aimed elsewhere than τ 0.70: ${wrongTau.slice(0, 3).join(', ')}`);
      if (!pl?.end || pl.n !== 12) fail(`${tag} placement ${JSON.stringify(pl)} after ${k} cards: not ended at 12 placement lines`);
      if (bonus !== 1) fail(`${tag} placing with every line right, the bonus came ${bonus} times`);
      P.clock.t += DAY; P.r = P.mk(); P.r.next();
      if (P.r.session().placing) fail(`${tag} placement started again on a later visit`);
      if (!problems.length) said.push(`${dir} placed in ${k} cards, the bonus at card ${bonusAt + 1}`);
    }
    // the bonus is a phrase never met, of a story neither done nor played this visit: on a build of four stories, the
    // hook and one in reach played (each all right), one done meanwhile (in the lab) and a call whose every line was met
    // there (not done; R7 holds it, so it isn't played): nothing is left to be the bonus, so none comes, though placing
    // owes it
    if (dir === 'data') {
      const keep = ['airport-esim', 'hotpot-spicy', 'emei-monkey', 'landlord-leak'], sub = { ...data, scenarios: data.scenarios.filter((s) => keep.includes(s.id)), phrases: data.phrases.filter((q) => keep.includes(q.scn)) };
      sub.byId = Object.fromEntries(sub.scenarios.map((s) => [s.id, s])); sub.phraseById = Object.fromEntries(sub.phrases.map((q) => [q.id, q]));
      const P = phone(sub, null, { fresh: true }), seen = [];
      let p = P.r.next();
      P.marks.done('emei-monkey', { outcome: 'win', stars: 2 }); for (const q of sub.phrases.filter((q) => q.scn === 'landlord-leak')) P.srs.record(q.id, 2);
      for (let k = 0; k < 8 && p && p.item.kind !== 'end'; k++) {
        seen.push(story(p));
        if (p.item.kind === 'bonus') { fail(`${tag} with every story played, done or met, a bonus came after ${seen.slice(0, -1).join(', ')}: ${p.item.p.id}${P.marks.doneAll()[p.item.p.scn] ? ' (its story done)' : ''}${P.srs.all()[p.item.p.id] ? ' (met)' : ''}`); break; }
        P.play(p); p = P.r.next();
      }
      if (!P.r.session().placing && !P.r.session().place?.end) fail(`${tag} the bonus-filter case never placed: ${seen.join(', ')}`);
    }
    // nor among the visit's lines that two misses in five make a loss's τ: the bonus missed, then three lines of the
    // story after it, the first missed, and the story left there: the card after it isn't dealt for a loss (τ 0.92)
    {
      const P = phone(data, null, { fresh: true });
      let p = P.r.next(), k = 0;
      for (; k < 12 && p && p.item.kind !== 'bonus'; k++) { P.play(p); p = P.r.next(); }
      if (p?.item.kind === 'bonus') {
        P.play(p, () => 'timeout');
        let q = P.r.next();
        for (let j = 0; j < 4 && q && q.item.kind !== 'scn'; j++) { P.play(q); q = P.r.next(); }
        if (q?.item.kind === 'scn') {
          says(q.item.scn).filter((b) => !b.again).slice(0, 3).forEach((b, i) => { const id = rowId(q.item.scn, b), ok = i > 0; P.clock.t += 20e3; P.srs.record(id, ok ? 3 : 0); P.hear({ k: 'line', at: P.clock.t, id, lv: data.phraseById[id]?.level, mode: 'speak', att: 1, hint: 0, hear: false, tries: 0, alt: -1, ms: ok ? 4000 : 15000, clock: 15, assist: q.item.A, res: ok ? 'ok' : 'timeout', stars: ok ? 3 : 0, ...(ok ? { perfect: true } : {}) }); });
          P.left(q, { state: 'playing', asked: 3 });
          const z = P.r.next();
          if (z?.why.tau === 0.92) fail(`${tag} the bonus missed and one line of the story after it: the next card ${story(z)} dealt for a loss (τ 0.92), the bonus's line counted`);
        } else fail(`${tag} the missed-bonus τ case: no story after the bonus`);
      } else fail(`${tag} the missed-bonus τ case: no bonus in ${k} cards`);
    }
    // a missed bonus is no loss for the end on a high either: a visit 12 minutes in as the bonus is missed (its line and
    // the practice after it, 5 minutes apiece), its end screen up: a sure win or the recap, on the win before it
    {
      const P = phone(data, null, { fresh: true });
      let p = P.r.next(), k = 0;
      for (; k < 12 && p && p.item.kind !== 'bonus'; k++) { P.play(p); p = P.r.next(); }
      if (p?.item.kind === 'bonus') {
        const id = p.item.p.id, row = (o) => ({ k: 'line', id, lv: data.phraseById[id]?.level, mode: 'speak', hint: 0, hear: false, tries: 0, alt: -1, ms: 15000, clock: 15, assist: 2, res: 'timeout', stars: 0, ...o });
        P.clock.t += 5 * MIN; P.srs.record(id, 0); P.hear(row({ at: P.clock.t, att: 1, task: 'bonus' }));
        P.clock.t += 5 * MIN; P.hear(row({ at: P.clock.t, att: 2, task: 'practice' }));
        const q = P.r.next();
        if (P.r.session().minutes < LONG_MIN) fail(`${tag} the missed-bonus case: the visit only ${f2(P.r.session().minutes)} minutes in`);
        else if (!['sure win', 'recap'].includes(q?.why.rule)) fail(`${tag} a bonus missed 12 minutes in, the win before it: ${story(q)}, not a sure win or the recap (the bonus counted as the last card)`);
      } else fail(`${tag} the missed-bonus case: no bonus in ${k} cards`);
    }
    // PL1, PL2: with R7 lifted (hold 0), a Mandarin-at-home answer: the story after the about card a call, and after that
    // call (one line missed: no bonus) a chat; R7 holding a new learner's calls, the story after it is no call
    {
      const P = phone(data, 'mandarin', { fresh: true }); P.r = P.mk({ hold: 0 });
      const p0 = P.r.next(); P.r.next(); P.play(p0);
      const p2 = P.r.next(); P.play(p2, (id, i) => (i ? 'ok' : 'timeout'));
      const p3 = P.r.next();
      if (data.scenarios.some((s) => s.format === 'call') && p2?.item.scn?.format !== 'call') fail(`${tag} PL1: with R7 lifted, the first placement story after the about card is ${story(p2)}, not a call`);
      if (data.scenarios.some((s) => s.format === 'chat') && p3?.item.scn?.format !== 'chat') fail(`${tag} PL2: after placement's call, ${story(p3)}, not a chat`);
      const Q = phone(data, 'new', { fresh: true });
      const q0 = Q.r.next(); Q.r.next(); Q.play(q0);
      const q2 = Q.r.next();
      if (q2?.item.scn?.format === 'call' && (q2.item.scn.listen ?? Math.max(3, q2.item.scn.base ?? q2.item.scn.level + 1)) > 1) fail(`${tag} PL1 against R7: a new learner's first placement story is the call ${story(q2)}`);
    }
  }
  // v1's warmup, with and without the review lever's rung: five cards into a visit with no review (every line right,
  // nothing due), the longest phrase met in it comes back as a flash crisis, once; at the rung (REVIEW.rung) the item
  // says the rung it was scored at, as a review does, and without it says none (v1's A2)
  for (const rung of [false, true]) {
    const P = phone(datas.data, 'mandarin'); P.r = P.mk({ review: { run: 5, rung, rematch: false } });
    const seen = [];
    for (let k = 0, p = P.r.next(); k < 16 && p && p.item.kind !== 'end'; k++, p = P.r.next()) { seen.push(p); P.play(p); } // (16: room for a second, were one dealt)
    const w = seen.filter((p) => p.why.rule === 'warmup');
    if (w.length !== 1) fail(`the warmup${rung ? ' (at the rung)' : ''}: ${w.length} in ${seen.length} cards (${seen.map((p) => p.why.rule).join(', ')})`);
    else if (rung ? !(Number.isInteger(w[0].item.A) && w[0].item.A === w[0].why.A && w[0].item.tau === w[0].why.tau) : w[0].item.A != null) fail(`the warmup${rung ? ' at the rung' : ''}: item A${w[0].item.A} τ ${w[0].item.tau}, why A${w[0].why.A} τ ${w[0].why.tau}`);
    else if (rung) said.push(`the warmup once in ${seen.length} cards, at the rung it was scored at (A${w[0].why.A}) with the lever, at none without`);
  }
  // goals by the book: p3.md's table here, not rank.js's (a check that read that would follow a slip in it): each goal
  // alone and all four, every format's prior lifted by what the goals give it (read: chat's and write's +0.08; fun:
  // scene's and chase's +0.05), every topic's 0.8 where a goal names it, else 0.7 (family: family, home, celebrations,
  // dating; travel: travel, food, shopping), and every skill's gap weight the most any goal gives it (family's L, S, V
  // ×1.3; read's R, W ×1.5), never under 1; as the pick read them (why.goals), on the build with topics
  {
    const BOOK = { family: { topics: ['family', 'home', 'celebrations', 'dating'], gap: { L: 1.3, S: 1.3, V: 1.3 } }, travel: { topics: ['travel', 'food', 'shopping'] }, read: { fmt: { chat: 0.08, write: 0.08 }, gap: { R: 1.5, W: 1.5 } }, fun: { fmt: { scene: 0.05, chase: 0.05 } } };
    const d = datas['review/gate/p4b-2/data'] || datas.data, read = (goals) => { const P = phone(d, 'mandarin', { explain: true }); P.store.set('goals', goals); P.r = P.mk(); return P.r.next()?.why.goals; };
    const none = read([]), bad = [], near = (a, b) => Math.abs(a - b) < 1e-9;
    if (!none) bad.push('no why.goals');
    else {
      for (const g in BOOK) for (const k of BOOK[g].topics || []) if (d !== datas.data && !(k in none.topic)) bad.push(`${g}'s topic ${k} on no story of the build`);
      for (const gs of [...Object.keys(BOOK).map((g) => [g]), Object.keys(BOOK)]) {
        const w = read(gs);
        if (!w) { bad.push(`${gs}: no why.goals`); continue; }
        for (const k in none.fmt) { const want = gs.reduce((t, g) => t + (BOOK[g].fmt?.[k] || 0), 0); if (!near(w.fmt[k] - none.fmt[k], want)) bad.push(`${gs}: ${k}'s prior up ${f2(w.fmt[k] - none.fmt[k], 3)} (${want} wanted)`); }
        for (const k in none.topic) { const want = gs.some((g) => BOOK[g].topics?.includes(k)) ? 0.8 : 0.7; if (!near(w.topic[k], want) || !near(none.topic[k], 0.7)) bad.push(`${gs}: topic ${k} at ${w.topic[k]} (${want} wanted), ${none.topic[k]} with no goal`); }
        for (const k in none.gap) { const want = Math.max(1, ...gs.map((g) => BOOK[g].gap?.[k] || 1)); if (!near(w.gap[k], want) || none.gap[k] !== 1) bad.push(`${gs}: ${k}'s gap weight ${w.gap[k]} (${want} wanted), ${none.gap[k]} with no goal`); }
      }
    }
    if (bad.length) fail(`goals by the book: ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` (and ${bad.length - 4} more)` : ''}`);
    else said.push(`the goals by the book (each alone and all four): ${Object.keys(none.fmt).length} formats' priors, ${Object.keys(none.topic).length} topics', ${Object.keys(none.gap).length} skills' gap weights`);
  }
  // goals: a goal's topics start their arms at 0.8, the rest at 0.7 (E: half the format's draw, 0.3 the topic's, 0.2 the
  // story's prior): on a build with topics, two scenes at card 2 (card 1 dealt, so R1 is past; one draw of the scene arm
  // for both), one a travel story and one not, E's gap between them 0.3 × 0.1 wider with travel among the goals than with none
  {
    const d = datas['review/gate/p4b-2/data'], a = d?.scenarios.find((x) => x.format === 'scene' && (x.topic || x.topics?.[0]) === 'travel'), b = d?.scenarios.find((x) => x.format === 'scene' && !['travel', 'food', 'shopping'].includes(x.topic || x.topics?.[0]) && x.level === a?.level);
    if (a && b) {
      const gap = (goals) => { const xs = []; for (let k = 0; k < 300; k++) { const P = phone(d, 'mandarin', { seed: 3000 + k, explain: true }); P.store.set('arms', { v: 1, fmt: {}, topic: {}, visits: 3, about: 1 }); P.store.set('goals', goals); P.r = P.mk(); const p = (P.r.next(), P.r.next()), c = (k) => p?.why.cands?.find((c) => c.key.startsWith(k.id + '@') && c.E != null); if (c(a) && c(b)) xs.push(c(a).E - c(b).E); } return { m: xs.reduce((t, x) => t + x, 0) / xs.length, n: xs.length }; };
      const g0 = gap([]), g1 = gap(['travel']), diff = g1.m - g0.m;
      if (g0.n < 50 || g1.n < 50 || Math.abs(diff - 0.03) > 0.012) fail(`goals: travel among them moved E's gap between ${a.id} (travel) and ${b.id} by ${f2(diff, 3)} (0.030 wanted; ${g0.n} and ${g1.n} phones)`);
      else said.push(`a goal's topic starts its arm at 0.8: E's gap between ${a.id} and ${b.id} ${f2(diff, 3)} wider with travel a goal (0.030)`);
    }
  }
  // family weighs the gaps in L, S and V ×1.3: on one model (a dialect learner after 40 lines), every new story's V at
  // least what it is with no goal, and most of them more
  {
    const P = phone(datas.data, 'dialect', { explain: true });
    for (const q of datas.data.phrases.slice(0, 40)) L.observe({ k: 'line', at: P.now(), id: q.id, lv: q.level, mode: 'speak', att: 1, hint: 0, tries: 0, res: q.id.length % 3 ? 'ok' : 'timeout', perfect: true, stars: 3, ms: 6000, clock: 15 });
    const Vs = (goals) => { P.store.set('goals', goals); const r = P.mk(), p = r.next(); return new Map(p.why.cands.filter((c) => c.kind === 'scn' && c.cls === 'new' && c.V != null).map((c) => [c.key, c.V])); };
    const v0 = Vs([]), v1 = Vs(['family']), keys = [...v0.keys()].filter((k) => v1.has(k)), less = keys.filter((k) => v1.get(k) < v0.get(k) - 1e-12), more = keys.filter((k) => v1.get(k) > v0.get(k) + 1e-12);
    if (less.length || more.length < keys.length / 2) fail(`goals: family's gap weights: of ${keys.length} new stories, V fell for ${less.length} and rose for ${more.length}`);
    else said.push(`family's gap weights raise V for ${more.length} of ${keys.length} new stories, lower it for none`);
  }
  console.log(`\nthe first session: ${problems.length > n0 ? 'see problems' : said.join('; ')}`);
}

// ---------- the loops (p5.md, P5a): today's challenge, episodes out a day at a time, quiet mode, endings, the countdown ----------
// Phones with days.js over their stores (phone()'s loops), visits played as the Mix plays them (a card picked as the one
// before it comes on screen and again once that one is done), each at a local hour of a day:
//   the challenge  dealt once a day as a story, rule 'challenge': { kind, scn (the story tailored to lv), lv (the level it
//                  has nearest the say level as the pick read it, the lower of two as near), A and tau (why's; τ a loss's, 0.92), mod, n,
//                  day (days.challenge()'s) }; never a visit's first card, straight after a loss (it comes once a card
//                  is won) or while placing (a fresh phone: it comes once placement ends), never after a card of its
//                  format (R2); once on screen, never again that day though swiped past unplayed, and played from the
//                  menu (days.challenge().played) never dealt; the next day's dealt; the same item on two phones alike;
//                  each persona's at its own level; till it's on screen, its story never dealt as itself
//   episodes       a series' episode 2 not a candidate the day episode 1 is first finished (the recap's next.out false),
//                  dealt the next day (a gate build with a series)
//   quiet          no shadow card while quiet() says so; shadows on the same phones when not
//   endings        every story played and won long ago, nothing due, only the win endings found: a story for an ending
//                  (cls ending) at most once a visit, and some visit has one; every ending found: none; never one by a
//                  rule giving way (format*, surest*), to a learner getting every line wrong
//   the countdown  by the book (p5.md's: a goal's weight rising inside 30 days): Lunar New Year 40 days out moves
//                  nothing, 30, 15 and 0 days out lift family's topics and its gaps, more as it nears, past the day
//                  nothing; a trip lifts travel's topics only; with family a goal too, the two compound
if (on('loops')) {
  const n0 = problems.length, said = [], all = [];
  const noon = (d, h = 12) => new Date(2026, 10, d, h).getTime(); // a local hour in November 2026
  const isStory = (p) => p.item.kind === 'scn' || p.item.kind === 'challenge';
  const fmtOf = (p) => (isStory(p) ? p.item.scn.format : p.item.kind === 'run' ? 'chase' : p.item.kind === 'bonus' ? 'review' : p.item.kind);
  const near = (s, say) => { const ls = sim.levelsOf(s), up = ls.some((l) => l >= 1) ? ls.filter((l) => l >= 1) : ls; return up.sort((a, b) => Math.abs(a - say) - Math.abs(b - say) || a - b)[0]; }; // (not L0: rank.js daily())
  const tag = (p) => (p ? (isStory(p) ? `${p.item.kind === 'challenge' ? '挑战 ' : ''}${p.item.scn.id}@${p.item.lv}` : p.item.kind) + ` (${p.why.rule})` : 'nothing');
  // a visit (a new ranker, as the Mix opens): each pick kept with the say level and placing as it read them; each card
  // played (how(p, i): a line → 'ok' | 'timeout') or, where pass(p, i), swiped past unplayed; its row naming its outcome
  const drive = (P, { cards = 14, how = () => () => 'ok', pass = () => false } = {}) => {
    P.r = P.mk();
    // (owed: the challenge's story while the challenge is owed, as the pick found things: saved for it)
    const owing = () => { const ch = P.days.challenge(), a = P.store.get('arms', null) || {}; return ch.id && !ch.played && a.challenge !== ch.day && !(a.place && !a.place.end) ? ch.id : null; };
    const out = [], pick = () => { const owed = owing(), p = P.r.next(); if (p) Object.assign(p, { say: L.level().say, placing: P.r.session().placing, owed }); return p; };
    let cur = pick();
    while (cur && out.length < cards) {
      const i = out.push(cur) - 1;
      let ahead = pick();
      if (pass(cur, i)) P.left(cur, { state: 'idle' });
      else if (['scn', 'challenge', 'review', 'bonus', 'run'].includes(cur.item.kind)) {
        const n = P.lines(cur, how(cur, i)), d = isStory(cur) && P.marks.doneAll()[cur.item.scn.id];
        cur.lost = d?.outcome === 'lose';
        ahead = pick() ?? ahead;
        P.left(cur, { ...(n ? { asked: n } : {}), ...(d ? { out: d.outcome } : {}) });
      } else P.left(cur);
      if (cur.item.kind === 'end') break;
      cur = ahead;
    }
    all.push(out);
    return out;
  };
  const chs = (v) => v.filter((p) => p.item.kind === 'challenge');
  // a story's endings' keys, every branch walked (as days.js keys them: an end step's zh, else en)
  const endsOf = (s) => { const out = [], seen = new Set(), go = (l) => { for (const st of l || []) { if ('end' in st) { const k = st.zh || st.en || st.end; if (!out.includes(k)) out.push(k); } else if (st.say && !seen.has(st.say)) { seen.add(st.say); go(st.say.ok); go(st.say.fail); go(st.say.miss); (st.say.alts || []).forEach((a) => go(a.then)); } } }; go(s.steps); return out; };
  // the challenge as dealt: the day's, its shape, its level the say level's nearest
  const item = (p, ch, where, data = datas.data) => {
    const it = p.item, s = data.byId[ch.id];
    if (!(p.why.rule === 'challenge' && it.scn?.id === ch.id && it.scn.level === it.lv && it.lv === near(s, p.say) && Number.isInteger(it.A) && it.A === p.why.A && it.tau === 0.92 && it.tau === p.why.tau && it.mod === ch.mod && it.n === ch.n && it.day === ch.day))
      fail(`${where}: the challenge dealt is ${JSON.stringify({ id: it.scn?.id, level: it.scn?.level, lv: it.lv, A: it.A, tau: it.tau, mod: it.mod, n: it.n, day: it.day, rule: p.why.rule, whyA: p.why.A, whyTau: p.why.tau })}, not ${ch.id} at L${near(s, p.say)} (say ${f2(p.say)}), ${ch.mod} #${ch.n} ${ch.day}`);
  };
  // the challenge: a visit, another that day, the next day's
  {
    const data = datas.data, P = phone(data, 'mandarin', { loops: true, t: noon(2) }), ch = P.days.challenge();
    if (!(ch.id && ch.n === 2 && ch.mod === 'quiet' && ch.day === '2026-11-02' && !ch.played)) fail(`2 Nov 2026's challenge: ${JSON.stringify(ch)} (#2, quiet, unplayed wanted)`);
    const v1 = drive(P), c1 = chs(v1);
    if (c1.length !== 1) fail(`a visit on ${ch.day} dealt ${c1.length} challenges, not 1: ${v1.map(tag).join(', ')}`);
    else {
      item(c1[0], ch, `${ch.day}, card ${v1.indexOf(c1[0]) + 1}`);
      if (!P.days.challenge().played || P.r.session().challenge !== ch.day) fail(`the challenge played: days.challenge().played ${P.days.challenge().played}, session().challenge ${P.r.session().challenge} (true, ${ch.day} wanted)`);
      said.push(`the day's challenge at card ${v1.indexOf(c1[0]) + 1}: ${c1[0].item.scn.id}@${c1[0].item.lv} ${ch.mod} #${ch.n}`);
    }
    P.clock.t = noon(2, 18);
    const v2 = drive(P);
    if (chs(v2).length) fail(`a second visit on ${ch.day} dealt the challenge again (played that day): ${v2.map(tag).join(', ')}`);
    P.clock.t = noon(3);
    const ch3 = P.days.challenge(), v3 = drive(P), c3 = chs(v3);
    if (ch3.id === ch.id || ch3.n !== 3 || ch3.mod !== 'panic') fail(`3 Nov's challenge ${JSON.stringify(ch3)} after 2 Nov's ${ch.id} (another story, #3, panic wanted)`);
    if (c3.length !== 1) fail(`the next day's visit dealt ${c3.length} challenges, not 1: ${v3.map(tag).join(', ')}`);
    else item(c3[0], ch3, `${ch3.day}, card ${v3.indexOf(c3[0]) + 1}`);
  }
  // on screen and swiped past, unplayed: never again that day (it isn't played), the next day's dealt. (Its story won two
  // weeks back, every ending found, nothing of it due: never dealt as itself, so a later visit that day doesn't take the
  // story first and leave the challenge no way back whatever the rule: only the challenge could bring it)
  {
    const data = datas.data, P = phone(data, 'mandarin', { loops: true, t: noon(4) }), ch = P.days.challenge(), s = data.byId[ch.id], t = P.clock.t;
    P.clock.t -= 14 * DAY;
    for (const q of data.phrases.filter((q) => q.scn === s.id)) { P.clock.t += 20e3; P.srs.record(q.id, 3); }
    P.marks.done(s.id, { outcome: 'win', stars: 3 });
    for (const end of endsOf(s)) P.days.hear({ k: 'card', at: P.clock.t, ...what({ kind: 'scn', scn: s }), ms: 90000, state: 'done', how: 'swipe', asked: 5, out: 'win', end });
    P.clock.t = t;
    for (const [id, e] of Object.entries(P.srs.all())) if (id.startsWith(s.id + '/')) Object.assign(e, { box: 4, due: t + 7 * DAY });
    if (P.days.endings(s).found !== P.days.endings(s).of) fail(`${s.id}'s endings: ${JSON.stringify(P.days.endings(s))} after every one heard`);
    const v1 = drive(P, { pass: (p) => p.item.kind === 'challenge' }), seen = chs(v1).length;
    P.clock.t = noon(4, 17);
    const v2 = drive(P);
    P.clock.t = noon(5);
    const v3 = drive(P);
    const itself = v2.filter((p) => p.item.kind === 'scn' && p.item.scn.id === s.id).length;
    if (seen !== 1 || chs(v2).length || itself || P.days.challenge(ch.day).played || chs(v3).length !== 1) fail(`the challenge swiped past unplayed on ${ch.day}: dealt ${seen} then (1 wanted), ${chs(v2).length} later that day (0), its story as itself ${itself} (0: it has nothing new), played ${P.days.challenge(ch.day).played} (false), ${chs(v3).length} the next day (1)`);
    else said.push('swiped past unplayed, not again that day, and the next day\'s');
  }
  // played from the menu (#challenge) before the visit: not dealt
  {
    const data = datas.data, P = phone(data, 'mandarin', { loops: true, t: noon(6) }), ch = P.days.challenge(), s = data.byId[ch.id];
    P.clock.t += 60e3; P.marks.done(s.id, { outcome: 'win', stars: 3 });
    P.hear({ k: 'card', at: P.clock.t, ...what({ kind: 'challenge', scn: s }), ms: 90000, state: 'done', how: 'swipe', asked: 4, out: 'win' });
    const v = drive(P);
    if (!P.days.challenge().played || chs(v).length) fail(`the challenge played from the menu: played ${P.days.challenge().played}, then dealt ${chs(v).length} times in the visit (0 wanted)`);
    else said.push('played from the menu, not dealt');
  }
  // straight after a loss: not (card 1 lost: card 2 isn't it, re-picked once card 1 is done); it comes once a card is won
  {
    const data = datas.data, P = phone(data, 'mandarin', { loops: true, t: noon(7) }), v = drive(P, { how: (p, i) => (i === 0 ? () => 'timeout' : () => 'ok') });
    if (!v[0]?.lost) fail(`the loss visit's card 1 (${tag(v[0])}) wasn't lost`);
    else if (v[1]?.item.kind === 'challenge' || chs(v).length !== 1) fail(`card 1 lost: card 2 is ${tag(v[1])}, ${chs(v).length} challenges in the visit (not card 2, and 1, wanted): ${v.map(tag).join(', ')}`);
    else said.push(`card 1 lost, the challenge at card ${v.indexOf(chs(v)[0]) + 1}`);
  }
  // placing: a fresh phone (the hook, the about card, placement): none while placing; once placement ends, it comes
  {
    const data = datas.data, P = phone(data, null, { fresh: true, loops: true, t: noon(8, 9) });
    const mine = [drive(P, { cards: 16 })];
    for (let k = 0; k < 3 && !chs(mine.at(-1)).length; k++) { P.clock.t = noon(8, 12 + 2 * k); mine.push(drive(P, { cards: 16 })); }
    const got = mine.flat().filter((p) => p.item.kind === 'challenge'), v = mine.at(-1);
    if (!P.r.session().place?.end || !got.length) fail(`a fresh phone: placement ${P.r.session().place?.end ? 'ended' : 'not ended'}, ${got.length} challenges by the day's last visit (${v.map(tag).join(', ')})`);
    else said.push('a fresh phone: none while placing, then the day\'s');
  }
  // two phones alike: the same item at the same place; every persona: the day's story, at its own level
  {
    const data = datas.data, [a, b] = [0, 1].map(() => drive(phone(data, 'dialect', { loops: true, t: noon(9) }))), key = (v) => JSON.stringify(chs(v).map((p) => [v.indexOf(p), p.item.scn.id, p.item.lv, p.item.A, p.item.tau, p.item.mod, p.item.n, p.item.day]));
    if (!chs(a).length || key(a) !== key(b)) fail(`two phones alike on 9 Nov: challenges ${key(a)} and ${key(b)} (one, the same, wanted)`);
    const lvs = {};
    for (const who of sim.PERSONAS) {
      const P = phone(data, who, { loops: true, t: noon(9) }), ch = P.days.challenge(), c = chs(drive(P, { cards: 16 }));
      if (c.length > 1) fail(`${who} on 9 Nov: ${c.length} challenges`);
      if (c[0]) { item(c[0], ch, `${who} on 9 Nov`); lvs[who] = c[0].item.lv; }
    }
    if (Object.keys(lvs).length < 3) fail(`9 Nov's challenge came to ${Object.keys(lvs).length} of ${sim.PERSONAS.length} personas: ${JSON.stringify(lvs)}`);
    else said.push(`two phones alike, the same; each persona at its own level (${Object.entries(lvs).map(([k, v]) => `${k} L${v}`).join(', ')})`);
  }
  // every visit above: never a visit's first card, after a loss, while placing, after a card of its format; once a visit
  {
    const bad = [];
    for (const v of all) v.forEach((p, i) => {
      if (p.item.kind === 'scn' && p.item.scn.id === p.owed) bad.push(`${tag(p)} dealt as itself, the challenge owed`);
      if (p.item.kind !== 'challenge') return;
      if (i === 0) bad.push('a first card');
      else if (v[i - 1].lost) bad.push(`after ${tag(v[i - 1])} lost`);
      else if (fmtOf(v[i - 1]) === p.item.scn.format) bad.push(`after ${tag(v[i - 1])}, a ${p.item.scn.format} too (R2)`);
      if (p.placing) bad.push('while placing');
    });
    if (all.some((v) => chs(v).length > 1)) bad.push('twice in a visit');
    if (bad.length) fail(`the challenge dealt ${[...new Set(bad)].slice(0, 5).join('; ')}`);
    else said.push(`over ${all.length} visits never first, after a loss, while placing or after its format, once a visit at most, its story never dealt as itself while it was owed`);
  }
  // episodes: the day episode 1 is first finished, episode 2 isn't a candidate (and the recap says not yet); the next day it is
  const d3 = datas['review/gate/p4b-3/data'], ep = (n) => d3?.scenarios.find((s) => s.series?.ep === n && d3.scenarios.some((x) => x.series?.id === s.series.id && x.series.ep === 1));
  if (d3 && ep(1) && ep(2)) {
    const e1 = ep(1), e2 = ep(2), P = phone(d3, 'mandarin', { loops: true, explain: true, t: noon(10, 9) });
    P.marks.done(e1.id, { outcome: 'win', stars: 3 });
    P.hear({ k: 'card', at: P.clock.t, ...what({ kind: 'scn', scn: e1 }), ms: 90000, state: 'done', how: 'swipe', asked: 5, out: 'win' });
    P.clock.t += 60e3;
    const cand = (p) => (p?.why.cands || []).some((c) => c.key?.startsWith(e2.id + '@')), v = drive(P, { cards: 30 }), rc = v.find((p) => p.item.kind === 'recap');
    const day1 = v.filter(cand).length + v.filter((p) => isStory(p) && p.item.scn.id === e2.id).length;
    if (P.days.released(e2) || day1) fail(`${e2.id} the day ${e1.id} was finished: released ${P.days.released(e2)}, a candidate or dealt at ${day1} picks (none wanted)`);
    if (!rc) fail(`no recap in a 30-card visit on ${d3 === datas.data ? 'data' : 'p4b-3'} (the episodes' teaser unread)`);
    else if (!(rc.item.next?.id === e2.id && rc.item.next.out === false)) fail(`the recap the day ${e1.id} was finished: next ${JSON.stringify(rc.item.next)} (${e2.id}, out false, wanted)`);
    P.clock.t = noon(11);
    const w = drive(P, { cards: 2 });
    if (!P.days.released(e2) || !cand(w[0])) fail(`${e2.id} the day after ${e1.id} was finished: released ${P.days.released(e2)}, a candidate ${cand(w[0])} (both wanted)`);
    if (problems.length === n0) said.push(`${e2.id} not a candidate the day ${e1.id} was finished (the recap: out false), a candidate the next`);
  }
  // quiet: no shadow card while quiet() says so; shadows on the same phones when it doesn't (on v1's twenty)
  {
    const count = (hush) => { let n = 0; for (const who of ['mandarin', 'dialect', 'studied']) { const P = phone(twenty, who, { loops: true, t: noon(12, 8) }); P.hush = hush; for (let k = 0; k < 3; k++) { P.clock.t = noon(12, 8 + 4 * k); n += drive(P, { cards: 16 }).filter((p) => p.item.kind === 'shadow').length; if (P.r.session().quiet !== hush) fail(`session().quiet ${P.r.session().quiet} with quiet() ${hush}`); } } return n; };
    const loud = count(false), hushed = count(true);
    if (hushed || !loud) fail(`quiet mode: ${hushed} shadow cards in quiet visits (0 wanted), ${loud} in the same visits out loud (some wanted, or the check proves nothing)`);
    else said.push(`quiet: no shadow card (${loud} on the same phones out loud)`);
  }
  // endings: every story played and won two weeks ago, nothing due for a week, the win endings found (a row's out, no end
  // key: the story's only win ending, where it has one); a story for an ending at most once a visit, and some visit has one
  {
    const data = datas.data, walk = endsOf;
    const setup = (P, every) => {
      const t = P.clock.t;
      P.clock.t = t - 14 * DAY;
      for (const s of data.scenarios) {
        for (const p of data.phrases.filter((q) => q.scn === s.id)) { P.clock.t += 20e3; P.srs.record(p.id, 3); }
        P.marks.done(s.id, { outcome: 'win', stars: 3 });
        for (const end of every ? walk(s) : [null]) P.hear({ k: 'card', at: P.clock.t, ...what({ kind: 'scn', scn: s }), ms: 90000, state: 'done', how: 'swipe', asked: 5, out: 'win', ...(end ? { end } : {}) });
      }
      P.clock.t = t;
      const a = P.srs.all();
      for (const id in a) Object.assign(a[id], { box: 4, due: t + 7 * DAY });
    };
    const many = data.scenarios.filter((s) => walk(s).length > 1).length, per = [];
    for (const every of [false, true]) {
      let n = 0;
      for (const who of ['mandarin', 'studied']) {
        const P = phone(data, who, { loops: true, t: noon(13, 8) });
        setup(P, every);
        const left = data.scenarios.filter((s) => { const e = P.days.endings(s); return e.of > 1 && e.found < e.of; }).length;
        if (every ? left : left !== many) fail(`endings: ${left} stories with endings unfound after ${every ? 'every ending' : 'the win endings'} heard (${every ? 0 : many} wanted)`);
        for (let k = 0; k < 3; k++) {
          P.clock.t = noon(13, 8 + 4 * k);
          const v = drive(P, { cards: 12 }), e = v.filter((p) => p.why.cls === 'ending');
          if (e.length > 1) fail(`endings: ${e.length} stories for an ending in a visit (${e.map(tag).join(', ')})`);
          n += e.length;
        }
      }
      per.push(n);
    }
    // and a learner who gets every line wrong: a story only for its endings never comes by a rule giving way (format*,
    // surest*), so with nothing else the visit may end
    {
      const P = phone(data, 'new', { loops: true, t: noon(13, 8) });
      setup(P, false);
      let bent = 0, gave = 0;
      for (let k = 0; k < 4; k++) { P.clock.t = noon(13, 8 + 3 * k); const v = drive(P, { cards: 10, how: () => () => 'timeout' }); bent += v.filter((p) => p.why.cls === 'ending' && ['format*', 'surest*'].includes(p.why.rule)).length; gave += v.filter((p) => ['format*', 'surest*'].includes(p.why.rule)).length; }
      if (bent) fail(`endings: ${bent} stories for an ending dealt by a rule giving way (of ${gave} picks a rule gave way for), to a learner getting every line wrong`);
    }
    if (!per[0] || per[1]) fail(`endings: ${per[0]} stories for an ending in 6 visits with ${many} stories' endings unfound (some wanted), ${per[1]} with every one found (none wanted)`);
    else said.push(`a story for an ending once a visit at most (${per[0]} in 6 visits, ${many} stories with more to find), none with every ending found`);
  }
  // the countdown, by the book: a goal's topics' arms and gaps weigh more as the day nears, inside 30 days. Read on the
  // build with topics (why.goals, as the pick read them): w = (31 − days left) / 31, family's topics' prior up 0.1 × w,
  // its gaps' weights (L, S, V: family's 1.3) at 1 + 0.3 × w, the rest as they were; P3's goals under it (×)
  {
    const d = datas['review/gate/p4b-2/data'] || datas.data, FAM = ['family', 'home', 'celebrations', 'dating'], TRAVEL = ['travel', 'food', 'shopping'];
    const P0 = phone(d, 'mandarin', { explain: true, loops: true, t: noon(14) }), today = P0.days.today(), at = (k) => new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)) + k * DAY).toISOString().slice(0, 10);
    const read = (soon, goals = []) => { const P = phone(d, 'mandarin', { explain: true, loops: true, t: noon(14) }); P.store.set('goals', goals); if (soon) P.store.set('soon', soon); P.r = P.mk(); return P.r.next()?.why.goals; };
    const none = read(null), bad = [], eq = (a, b) => Math.abs(a - b) < 1e-9;
    const want = (g, w, goals = []) => {
      if (!g) return bad.push('no why.goals');
      const base = (k) => (goals.includes('family') && FAM.includes(k) ? 0.8 : 0.7);
      for (const k in none.topic) { const up = w != null && (w.goal === 'family' ? FAM : TRAVEL).includes(k) ? 0.1 * w.w : 0; if (!eq(g.topic[k], base(k) + up)) bad.push(`${w ? `${w.goal} ${w.left} days out` : 'none'}${goals.length ? ' with ' + goals : ''}: topic ${k} at ${f2(g.topic[k], 4)} (${f2(base(k) + up, 4)} wanted)`); }
      for (const k in none.gap) { const own = goals.includes('family') && ['L', 'S', 'V'].includes(k) ? 1.3 : 1, up = w?.goal === 'family' && ['L', 'S', 'V'].includes(k) ? 1 + 0.3 * w.w : 1; if (!eq(g.gap[k], own * up)) bad.push(`${w ? `${w.goal} ${w.left} days out` : 'none'}${goals.length ? ' with ' + goals : ''}: ${k}'s gap weight ${f2(g.gap[k], 4)} (${f2(own * up, 4)} wanted)`); }
      if (!!g.soon !== !!w || (w && !(g.soon.goal === w.goal && g.soon.left === w.left && eq(g.soon.w, w.w)))) bad.push(`why.goals.soon ${JSON.stringify(g.soon)} (${JSON.stringify(w)} wanted)`);
    };
    const W = (goal, left) => ({ goal, left, w: (31 - left) / 31 });
    want(none, null);
    want(read({ what: 'lny', day: at(40) }), null);
    want(read({ what: 'lny', day: at(31) }), null);
    for (const left of [30, 15, 0]) want(read({ what: 'lny', day: at(left) }), W('family', left));
    want(read({ what: 'lny', day: at(-1) }), null);
    want(read({ what: 'none', day: null }), null);
    for (const what of ['wedding', 'visit']) want(read({ what, day: at(7) }), W('family', 7));
    want(read({ what: 'trip', day: at(10) }), W('travel', 10));
    want(read({ what: 'lny', day: at(0) }, ['family']), W('family', 0), ['family']);
    const rise = [30, 15, 0].map((k) => read({ what: 'lny', day: at(k) })?.gap.L);
    if (!(rise[0] < rise[1] && rise[1] < rise[2])) bad.push(`L's gap weight 30, 15, 0 days out: ${rise.map((x) => f2(x, 3))} (rising wanted)`);
    if (bad.length) fail(`the countdown: ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` (and ${bad.length - 4} more)` : ''}`);
    else said.push(`the countdown by the book (40 and 31 days out, past, none: nothing; 30, 15, 0: family's topics and gaps rising, to ×${f2(rise[2], 2)}; a trip travel's topics only; with family a goal, ×${f2(1.3 * 1.3, 2)})`);
  }
  console.log(`\nthe loops: ${problems.length > n0 ? 'see problems' : said.join('; ')}`);
}

// ---------- the rules, on simulated visits ----------
const tally = { picks: 0, breaks: [], forced: [], gave: [], firsts: 0, kinds: {}, rules: {}, recaps: { win: 0, not: 0 }, sure: { recap: 0, not: 0 }, fmts: {} };
if (on('rules')) {
  const n0 = problems.length;
  let currentData = null;
  // every story played (won) `ago` before the first visit, each of its own lines said twice from memory then; due:
  // every one of them due now, else none for a week
  const played = (ago, due) => ({ srs, marks, clock }) => {
    const t = clock.t;
    clock.t = t - ago;
    for (const s of currentData.scenarios) marks.done(s.id, { outcome: 'win', stars: 2 });
    for (const p of currentData.phrases) if (!p.id.includes('@')) { srs.record(p.id, 3); clock.t += 30 * MIN; srs.record(p.id, 3); clock.t -= 30 * MIN; }
    clock.t = t;
    const all = srs.all();
    for (const id in all) all[id].due = due ? t - 1000 : t + 7 * DAY;
  };
  const allDue = ({ srs, clock }) => { const t = clock.t; clock.t = t - 2 * DAY; for (const p of currentData.phrases) srs.record(p.id, 2); clock.t = t; };
  // every story but one format's played and won two weeks ago, each line answered right 85% of the time (the model
  // hears them all), nothing due for a week: that format is all a visit can bring
  const allBut = (left) => ({ srs, marks, clock, learner }) => {
    const t = clock.t, rand = seeded(7);
    let k = 0;
    for (const s of currentData.scenarios) if (s.format !== left) {
      clock.t = t - 14 * DAY + (k++) * 3600e3;
      for (const b of says(s).filter((b) => !b.again)) { const ok = rand() < 0.85, id = rowId(s, b); clock.t += 20e3; srs.record(id, ok ? 3 : 0); learner.observe({ k: 'line', at: clock.t, id, lv: s.level, mode: 'speak', att: 1, hint: 0, hear: false, tries: 0, alt: -1, ms: 5000, clock: 15, assist: 2, res: ok ? 'ok' : 'timeout', stars: ok ? 3 : 0, ...(ok ? { perfect: true } : {}) }); }
      marks.done(s.id, { outcome: 'win', stars: 3 });
    }
    clock.t = t;
    const all = srs.all();
    for (const id in all) Object.assign(all[id], { box: 4, due: t + 7 * DAY });
  };
  const CASES = [
    { name: 'first visits', personas: sim.PERSONAS, n: 30, days: 1 },
    { name: 'returning visits, 14 days', personas: sim.PERSONAS, n: 12, days: 14, formats: true },
    { name: 'stories all played, nothing due', personas: ['mandarin', 'studied'], n: 10, days: 3, setup: played(1.5 * DAY, false) },
    { name: 'stories all played long ago, all due', personas: ['mandarin', 'new'], n: 10, days: 3, setup: played(30 * DAY, true) },
    { name: 'everything due at once', personas: ['dialect', 'advanced'], n: 10, days: 3, setup: allDue },
    { name: 'a loss streak (new, answered Mandarin)', personas: ['new'], n: 30, days: 4, told: 'mandarin' },
    { name: 'visits that never stop', personas: ['mandarin', 'studied', 'new'], n: 6, days: 3, endless: true },
    { name: 'far below every story (every line wrong)', personas: ['new', 'studied'], n: 6, days: 4, endless: true, cards: 16, weak: true },
    { name: 'one format left: only the calls', personas: ['dialect', 'studied'], n: 6, days: 5, setup: allBut('call') },
    { name: 'one format left: only the chats', personas: ['mandarin'], n: 6, days: 3, setup: allBut('chat'), endless: true, cards: 12 },
    // the first session's (p3.md): a fresh phone over its first days (placement, the about card, the bonus line); one
    // that skipped every question (home, goals, born: the model as the hook left it); one whose about card was swiped past
    { name: 'a fresh phone, its first 3 days', personas: sim.PERSONAS, n: 12, days: 3 },
    { name: 'every question skipped', personas: sim.PERSONAS, n: 8, days: 3, about: 'skip' },
    { name: 'the about card swiped past', personas: ['mandarin', 'new', 'advanced'], n: 8, days: 3, about: 'swipe' },
    // and the review levers off (P2's: runs of five, reviews at v1's A2, rematches after the stories new to you; the
    // shipped REVIEW, all three on, is the rest's)
    { name: 'the review levers off (P2\'s)', personas: ['mandarin', 'studied', 'new'], n: 6, days: 7, review: { run: 5, rung: false, rematch: false } },
  ];
  const lines = [];
  for (const [dir, data] of Object.entries(datas)) {
    currentData = data;
    const W = sim.world(data, SEED);
    for (const c of CASES) {
      let picksHere = 0, breaksHere = 0;
      for (const persona of c.personas) for (let i = 0; i < c.n; i++) {
        const P = sim.person(W, persona, i, SEED + dir.length);
        if (c.told) P.told = c.told;
        if (c.weak) P.th = Object.fromEntries(Object.keys(P.th).map((k) => [k, -6]));
        const o = sim.run(W, P, { dealer: 'foryou', assume: ['base', 'failure', 'boredom'][i % 3], seed: SEED, days: c.days, audit: true, setup: c.setup, endless: c.endless, cards: c.cards ?? 40, about: c.about, review: c.review,
          onPick: (p) => { tally.kinds[p.item.kind] = (tally.kinds[p.item.kind] || 0) + 1; tally.rules[p.why.rule] = (tally.rules[p.why.rule] || 0) + 1; } });
        picksHere += o.audit.picks; breaksHere += o.audit.breaks.length;
        tally.picks += o.audit.picks; tally.firsts += o.audit.firsts; tally.forced.push(...o.audit.forced.map((f) => ({ ...f, dir, persona }))); tally.gave.push(...o.audit.gave.map((g) => ({ ...g, dir, persona, case: c.name })));
        tally.breaks.push(...o.audit.breaks.map((b) => ({ ...b, dir, persona, case: c.name })));
        for (const k of ['win', 'not']) tally.recaps[k] += o.recaps[k];
        for (const k of ['recap', 'not']) tally.sure[k] += o.sure[k];
        if (c.formats) for (const [f, n] of Object.entries(o.fmts)) ((tally.fmts[dir] ||= {})[persona] ||= {})[f] = (tally.fmts[dir][persona][f] || 0) + n;
      }
      lines.push(`  ${dir.padEnd(24)} ${c.name.padEnd(42)} ${String(picksHere).padStart(6)} picks, ${breaksHere} breaks`);
    }
  }
  for (const b of tally.breaks.slice(0, 12)) fail(`rule ${b.rule} broken (${b.dir}, ${b.case}, ${b.persona}): a ${b.kind} at place ${b.place}${b.detail ? ` (${b.detail})` : ''}, why ${JSON.stringify(b.why).slice(0, 220)}`);
  if (tally.breaks.length > 12) fail(`… and ${tally.breaks.length - 12} more breaks`);
  if (tally.picks < PICKS) fail(`only ${tally.picks} picks audited (want ${PICKS})`);
  // every format to every persona over 14 days (R7 holds calls back only through a phone's first 3 visits)
  const missing = Object.entries(tally.fmts).flatMap(([dir, ps]) => Object.entries(ps).flatMap(([p, fs]) => ['scene', 'call', 'chat', 'chase'].filter((f) => !fs[f]).map((f) => `${dir} ${p}: no ${f}`)));
  if (missing.length) fail(`over 14 days, a format never dealt: ${missing.join('; ')}`);
  // the end on a high: a recap straight after a win (as the log shows it: a self-rater who claims a line is taken at
  // their word), and a sure win won followed by its recap
  if (tally.recaps.not) fail(`${tally.recaps.not} of ${tally.recaps.win + tally.recaps.not} recaps came straight after a card that wasn't won`);
  if (tally.sure.not) fail(`${tally.sure.not} of ${tally.sure.recap + tally.sure.not} sure wins won weren't followed by the recap`);
  // the first session's cards, each dealt somewhere in all these visits (the referee holds each to when it's owed)
  const never = ['hook', 'about', 'bonus', 'warmup'].filter((k) => !tally.rules[k]);
  if (never.length) fail(`over every case, never dealt by rule: ${never.join(', ')}`);
  console.log(`\nrules: ${tally.picks.toLocaleString('en')} picks, each held to R1–R7 by tools/rules.mjs, and to what they must be where something else was owed: ${tally.breaks.length} breaks`);
  console.log(lines.join('\n'));
  console.log(`  dealt: ${Object.entries(tally.kinds).map(([k, n]) => `${n} ${k}`).join(', ')}; by rule: ${Object.entries(tally.rules).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  const byDir = Object.groupBy(tally.forced, (f) => `${f.dir}, ${f.persona}`), byCase = Object.groupBy(tally.gave, (g) => `${g.rule} ${g.case}`);
  console.log(`  first cards: ${tally.firsts}; forced (no story reached p̄ 0.85 at the rung the ladder allowed; the surest dealt): ${tally.forced.length}${tally.forced.length ? ': ' + Object.entries(byDir).map(([k, v]) => `${k} ${v.length} (best p̄ ${f2(Math.max(...v.map((f) => f.best)))})`).join('; ') : ''}`);
  console.log(`  a rule gave way (nothing the rules allowed, stories left): ${tally.gave.length}${tally.gave.length ? ': ' + Object.entries(byCase).map(([k, v]) => `${k} ${v.length}`).join('; ') : ''}`);
  console.log(`  every format to every persona over 14 days (${Object.keys(tally.fmts).join(', ')}); recaps straight after a win: ${tally.recaps.win} of ${tally.recaps.win + tally.recaps.not}; sure wins won, then the recap: ${tally.sure.recap} of ${tally.sure.recap + tally.sure.not}`);
  if (problems.length > n0) console.log('rules: see problems');
}

// ---------- E: the Thompson draws, as the arms say ----------
// On a fresh phone the arms are the critics' priors, Beta(4m, 4(1 − m)): over many phones a format's draw (why.cands fd,
// one a format a phone: every story of a format shares it) has mean m and sd √(m(1 − m)/5). Each story's E is half its
// format's draw, 0.3 its topic's and 0.2 its own prior (0.8 the format's with no topic). And under the goals the about
// card asks (p3.md): reading lifts the chat's prior 0.08, fun the scene's and the chase's 0.05.
if (on('E')) {
  const n0 = problems.length, out = [];
  for (const [goals, PRIOR] of [[null, { scene: 0.78, call: 0.76, chat: 0.72, chase: 0.7 }], [['read', 'fun'], { scene: 0.83, call: 0.76, chat: 0.8, chase: 0.75 }]]) {
    const got = {}, off = [];
    for (let k = 0; k < 400; k++) {
      const P = phone(datas.data, 'mandarin', { seed: 1000 + k, explain: true });
      P.store.set('arms', { v: 1, fmt: {}, topic: {}, visits: 3, about: 1 }); if (goals) P.store.set('goals', goals); P.r = P.mk(); // past R7's first three visits: calls too (the about card seen)
      P.r.next();
      const p = P.r.next(); // card 2: every story in reach is allowed but the last card's format
      const seen = new Set();
      for (const c of p.why.cands) {
        if (c.kind !== 'scn' || c.rule || c.fd == null) continue;
        const e = c.td != null ? 0.5 * c.fd + 0.3 * c.td + 0.2 * c.prior : 0.8 * c.fd + 0.2 * c.prior;
        if (Math.abs(e - c.E) > 1e-9) off.push(`${c.key} E ${f2(c.E, 3)}, its draws make ${f2(e, 3)}`);
        if (!seen.has(c.fmt)) { seen.add(c.fmt); (got[c.fmt] ||= []).push(c.fd); }
      }
    }
    if (off.length) fail(`E isn't its draws and prior: ${off.slice(0, 3).join('; ')}`);
    const each = [];
    for (const [f, xs] of Object.entries(got)) {
      const m = PRIOR[f], mu = xs.reduce((t, x) => t + x, 0) / xs.length, sd = Math.sqrt(xs.reduce((t, x) => t + (x - mu) ** 2, 0) / (xs.length - 1)), want = Math.sqrt((m * (1 - m)) / 5);
      each.push(`${f} ${f2(mu)} ± ${f2(sd)} (${m}, ${f2(want)}; ${xs.length})`);
      if (xs.length < 100 || Math.abs(mu - m) > 0.03 || Math.abs(sd - want) > 0.04) fail(`E's draws for ${f}${goals ? ` (goals ${goals})` : ''}: mean ${f2(mu, 3)}, sd ${f2(sd, 3)} over ${xs.length} phones, where the arm says ${m} and ${f2(want, 3)}`);
    }
    if (Object.keys(got).length < 4) fail(`E's draws seen for ${Object.keys(got).join(', ')} only`);
    out.push(`${goals ? `with the goals ${goals.join(' and ')}` : 'no goals'}: ${each.join('; ')}`);
  }
  console.log(`\nE: ${problems.length > n0 ? 'see problems' : `a story's draw as its format's arm says (mean ± sd over fresh phones, the arm's in brackets), ${out.join('; ')}`}`);
}

// ---------- determinism and the wall's other half: the same picks, with an ad economy about or not ----------
if (on('determinism')) {
  const n0 = problems.length, data = datas.data;
  const deal = (ads) => {
    const clock = { t: Date.parse('2026-11-03T18:00:00Z') }, now = () => clock.t, store = sim.memory();
    L.init(data, { store: sim.memory(), now }); L.persona('studied'); S.init({ store: sim.memory() });
    const { srs, marks } = over(sim.memory(), now), days = createDays({ data, store: sim.memory(), now });
    if (ads) { globalThis.KS_AD = 'reward'; store.set('econ', { allowance: 0, saves: 3, honeymoon: false }); store.set('ads', { views: 5, last: now() }); }
    // (P5a's options as the phone hands them, quiet mode every other day; every row days.js hears as the ranker does)
    const r = createRanker({ data, learner: L, assist: S, srs, marks, store, now, rng: seeded(99), mode: sim.MODES['no mic'], released: days.released, challenge: () => days.challenge(), endings: (s) => days.endings(s), quiet: () => Math.floor(clock.t / DAY) % 2 === 1 });
    const tell = (row) => { days.hear(row); r.after(row); }, story = (it) => it.kind === 'scn' || it.kind === 'challenge', out = [];
    for (let i = 0; i < 100; i++) {
      const p = r.next();
      if (!p) { clock.t += 30 * MIN; continue; }
      const w = what(p.item);
      out.push(`${w.kind}:${w.id}:${w.lv}:${p.why.A}:${p.why.rule}:${f2(p.why.score, 6)}`);
      // played the same way each time: its lines right but every third, its story won, then left
      const ps = story(p.item) ? data.phrases.filter((q) => q.scn === p.item.scn.id) : p.item.kind === 'review' ? [p.item.p] : p.item.kind === 'run' ? p.item.ps : [];
      ps.forEach((q, j) => { clock.t += 15e3; const ok = (i + j) % 3 !== 0; srs.record(q.id, ok ? 3 : 0); const row = { k: 'line', at: clock.t, id: q.id, lv: q.level, mode: 'type', att: 1, hint: 0, hear: false, tries: 0, alt: -1, ms: 5000, clock: 30, assist: 2, res: ok ? 'ok' : 'timeout', stars: ok ? 3 : 0, ...(ok ? { perfect: true } : {}) }; L.observe(row); tell(row);
        // what an ad economy would bring about (P5): a save asking a missed line again, right this time; its rows marked ad
        if (ads && !ok) tell({ ...row, att: 2, res: 'ok', stars: 2, perfect: true, ad: 'save' }); });
      if (story(p.item)) marks.done(p.item.scn.id, { outcome: i % 4 ? 'win' : 'lose', stars: 2 });
      if (ads) { tell({ k: 'ad', at: clock.t, placement: 'save', shown: true, rewarded: true }); tell({ k: 'card', at: clock.t, ...what(p.item), ms: 1000, state: 'done', how: 'save', out: 'win', ad: 'save' }); }
      tell({ k: 'card', at: (clock.t += 10e3), ...what(p.item), ms: 60000, state: 'done', how: 'swipe' });
      if (i % 25 === 24) clock.t += DAY;
    }
    delete globalThis.KS_AD;
    return out;
  };
  const a = deal(false), b = deal(false), c = deal(true);
  if (a.join() !== b.join()) fail('the same seed and history gave different picks');
  if (a.join() !== c.join()) { const k = a.findIndex((x, i) => x !== c[i]); fail(`an ad economy about changed the picks (from pick ${k}: ${a[k]} without, ${c[k]} with)`); }
  console.log(`determinism: ${problems.length > n0 ? 'see problems' : `${a.length} picks over 4 days, the same twice from the same seed, and the same again with KS_AD, ks.econ, ks.ads, ad rows, and a save's lines asked again (marked ad) about, P5a's days.js hearing the same rows (ad rows aside)`}`);
}

// ---------- a pick's time ----------
// performance.now() round each next(): picks as visits play them (sim.mjs's learners, every persona), and a stress case
// (every phrase due at once, every card skipped, a new visit every 12 cards); each case run five times and the
// quietest run kept, since other jobs may share this machine (the load they made is printed: over the core count, rerun
// this alone before believing a slow pick). The stores are kept as a phone keeps them (strings, parsed at every read),
// and mode() reads Settings as feed.js answering() does. A phone is taken as 4× slower than this Mac.
if (on('time')) {
  const n0 = problems.length, res = [];
  const stats = (ts) => { const s = [...ts].sort((x, y) => x - y), q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))]; return { n: s.length, mean: s.reduce((x, y) => x + y, 0) / s.length, p95: q(0.95), max: s[s.length - 1] }; };
  const best = (f) => Array.from({ length: 5 }, f).sort((x, y) => x.p95 - y.p95)[0], load0 = os.loadavg()[0];
  const SET = JSON.stringify('auto'), asks = (m) => (scn, kind) => (JSON.parse(SET), JSON.parse(SET), m(scn, kind));
  for (const [dir, data] of Object.entries(datas)) {
    const W = sim.world(data, SEED);
    res.push({ dir, what: 'as visits play them', ...best(() => {
      const ts = [];
      for (const persona of sim.PERSONAS) for (let i = 0; i < 8; i++) sim.run(W, sim.person(W, persona, i, SEED), { dealer: 'foryou', assume: 'base', seed: SEED, days: 5, stores: sim.strings, settings: true, onPick: (p, place, ms) => ts.push(ms) });
      return stats(ts.slice(Math.floor(ts.length / 10))); // the first tenth warms the JIT up
    }) });
    res.push({ dir, what: 'everything due at once', ...best(() => {
      const clock = { t: Date.parse('2026-11-04T18:00:00Z') }, now = () => clock.t, ts = [];
      L.init(data, { store: sim.memory(), now }); L.persona('mandarin'); S.init({ store: sim.memory() });
      const { srs, marks } = over(sim.strings(), now);
      clock.t -= 2 * DAY; for (const p of data.phrases) srs.record(p.id, 2); clock.t += 2 * DAY;
      const r = createRanker({ data, learner: L, assist: S, srs, marks, store: sim.strings(), now, rng: seeded(5), mode: asks(sim.MODES.mic) });
      for (let i = 0; i < 1500; i++) {
        const t = performance.now(), p = r.next(), dt = performance.now() - t;
        if (i >= 300) ts.push(dt);
        if (p) r.after({ k: 'card', at: (clock.t += 60e3), ...what(p.item), ms: 60000, state: 'idle', how: 'swipe' });
        if (i % 12 === 11) clock.t += 31 * MIN;
      }
      return stats(ts);
    }) });
  }
  console.log(`\npick time (Node ${process.version} on this Mac, ${os.cpus().length} cores, load ${f2(load0, 1)} to ${f2(os.loadavg()[0], 1)}; performance.now() round each next(), the quietest of 5 runs; stores as strings, Settings read as the app reads them; a phone ×4):`);
  for (const x of res) {
    console.log(`  ${x.dir.padEnd(24)} ${x.what.padEnd(24)} ${String(x.n).padStart(5)} picks: mean ${f2(x.mean, 3)} ms, p95 ${f2(x.p95, 3)} ms, worst ${f2(x.max, 3)} ms → a phone's p95 ≈ ${f2(4 * x.p95)} ms`);
    if (4 * x.p95 >= BUDGET) fail(`a pick (${x.dir}, ${x.what}) takes ${f2(x.p95, 3)} ms at the 95th percentile here, ≈ ${f2(4 * x.p95)} ms on a phone (over ${BUDGET})`);
  }
  if (problems.length > n0) console.log('time: see problems');
}

for (const p of problems) console.log('PROBLEM ' + p);
console.log(`\n${problems.length ? `${problems.length} problems` : 'all good'} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(problems.length ? 1 : 0);

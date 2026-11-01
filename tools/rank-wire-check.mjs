#!/usr/bin/env node
// tools/rank-wire-check.mjs: the Mix dealt For You (app/shared/rank.js) on screen, through feed.js's lazy dealing. Each
// case opens #mix on a phone-sized page with a state of its own (ks.* in localStorage) and checks what's dealt, as the
// Mix notes it (window.KS_MIX: the feed, and each card as dealt with its why):
//   a fresh phone: card 1 a story (the hook, then the about card: p3.md), no format twice running, a why under every card (#mix?why), never more than one
//       card dealt ahead of the one on screen, each card played to its end; each card's row in the log says why it was
//       dealt (rule, p̄, rung, τ, propensity); the swipe pill, wherever it shows, covers nothing on its end screen
//   a call dealt ahead, swapped in and out while the card on screen is talking: its voice plays on
//   replace(): a card not yet on screen swapped cleanly (a fresh element, the old card thrown away, the new one built
//       and played), and none swapped that's on screen, partly showing, already seen, or Next ↓ is heading for
//   #mix?deal=v1: exactly the cards deal-v1.js deals in Node on the same state (due phrases, a story done)
//   a long visit on a win (KS_NOW on 4½ minutes after each of the first cards: the ranker counts a pause as 5 minutes
//       at most; KS_SIM answering right): a sure win, then a recap that says what the visit came to (its lines nailed
//       the ranker's own count), and a swipe goes on; the day's numbers (#stats) don't count the recap as a card played.
//       And answering wrong first: no line nailed, the recap says the lines said
//   every story done, every line met and nothing due: the end card, and nothing after it
//   every story done, a few phrases due, a player the model rates far below them: the end card's "Review the n due ↓"
//       deals them when tapped
//   a player the model rates out of reach of every story (none at the ranker's floor, p̄ 0.55, even at A5): no end
//       card while a story is unplayed; the surest come, each why saying the floor gave way (surest*)
//   the Mix opened again inside a visit (a page of its own, 5 minutes on): the visit carries on, none of its stories
//       dealt again
//   a returning phone (a visit 31 minutes ago): card 1 a visit's first pick at the returning τ (0.9): a likely win (p̄
//       0.85 at its rung) where the model knows the player well enough to promise one, else the surest story (first*);
//       and the card after the one on screen picked again for the new visit when the page comes back after 31 minutes
//       hidden, mid-story too: neither the story on screen nor its format
//   a flash crisis and a run dealt at a rung (item.A: the ranker's, where it deals reviews at one) play at the rung the
//       ladder gives their lines (A4 here: no clock, the frame up and free), their rows saying so, moving nothing (the
//       next card starts where it would have); one dealt without A plays as v1 did; one picked again before it came on
//       screen (its τ brought up to date in place, as rank.js again() does) plays at its last pick's τ
//   the bonus line: labelled a level up (how far: "One from a level up!", "…2 levels up!"), its story's setting, a miss
//       costing nothing, waiting for Have a go; said, its row is task bonus; swiped past, nothing recorded, and not a
//       card played in the day's numbers
//   a level's own line (scn/beat@L, on p4b-1) comes back as that line in its scene; #phrases shows a beat and its level
//       variants as one row, its best stars and the levels met (not with --dist)
//   the content gate's builds: p4b-2 (level-0 stories) plays; p4b-3 (Back Home) teases the next episode in the recap
//       (not with --dist: the packed page plays the data it carries, whatever ?data= says)
// and no page errors anywhere. Screenshots: review/rank-wire/.
// node tools/rank-wire-check.mjs [--dist]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), DIST = process.argv.includes('--dist'), OUT = path.join(ROOT, 'review', 'rank-wire');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content.json'), 'utf8'));
data.byId = Object.fromEntries(data.scenarios.map((s) => [s.id, s])); data.phraseById = Object.fromEntries(data.phrases.map((p) => [p.id, p]));
const { dealV1 } = await import(path.join(ROOT, 'app/shared/deal-v1.js')), { over } = await import(path.join(ROOT, 'app/shared/store.js'));
const { what } = await import(path.join(ROOT, 'app/shared/events.js')), { BETA } = await import(path.join(ROOT, 'app/shared/learner.js'));
const { endsOf } = await import(path.join(ROOT, 'app/shared/days.js'));
fs.mkdirSync(OUT, { recursive: true });
const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), '--port', String(port), ...(DIST ? ['--dist'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => server.kill()); // never left behind, however the run ends
await new Promise((r) => server.stdout.on('data', (d) => /kuaishuo:/.test(d) && r()));
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const expect = (name, ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(what)}`}`); if (!ok) problems.push(name); };
const MIN = 60e3, DAY = 864e5;
// a card's format, as "no format twice running" reads it: a story's own, a run's a chase, the rest their kind
const fmt = (d) => (d.kind === 'scn' ? d.fmt : d.kind === 'run' ? 'chase' : d.kind);

// A phone-sized page on a route. store: ks.* to start from (clear: false keeps what an earlier page left); sim: the
// player answers right (KS_SIM, KS_SAY), wrong the first time ('mixed'), or isn't there at all (no answers: a glance);
// fast: KS_FAST; now: KS_NOW; data: a gate build's directory; vis: the page's visibility can be set (KS_VIS); init: a
// function run in the page before it loads (an instrument)
async function open(hash, { store = {}, clear = true, sim = true, fast = true, now = 0, data: dir = '', view = [390, 664], init = null, cards = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: view[0], height: view[1], deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => problems.push(`${hash}: ${e.message || e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|Failed to load resource/.test(m.text())) problems.push(`${hash}: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon|fonts\.g/.test(r.url())) problems.push(`${hash}: ${r.status()} ${r.url()}`); });
  await page.evaluateOnNewDocument((store, clear, sim, fast, now) => {
    window.KS_FAST = fast; window.KS_NOW = now;
    try { if (clear) localStorage.clear(); for (const [k, v] of Object.entries(store)) localStorage.setItem('ks.' + k, JSON.stringify(v)); } catch {}
    const tries = {}, say = (key, line) => ((tries[key] = (tries[key] || 0) + 1), sim === 'mixed' && tries[key] === 1 ? '我不知道你在说什么' : line);
    if (sim) { window.KS_SIM = (beat) => (beat ? say(beat.id, beat.answers[0]) : null); window.KS_SAY = (a) => say(a, a); }
    let vis = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => vis, configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => vis === 'hidden', configurable: true });
    window.KS_VIS = (v) => { vis = v; document.dispatchEvent(new Event('visibilitychange')); };
  }, store, clear, sim, fast, now);
  if (init) await page.evaluateOnNewDocument(init);
  await page.goto(`http://127.0.0.1:${port}/${dir ? `?data=${encodeURIComponent(dir)}` : ''}#${hash}`, { waitUntil: 'networkidle0' });
  if (!cards) return page; // a page with no feed (#phrases)
  await page.click('button.ks-boot').catch(() => {});
  await page.waitForSelector('.ks-card', { timeout: 10000 });
  await until(page, () => window.KS_MIX?.feed.active === 0, undefined, 5000);
  return page;
}
const until = async (page, fn, arg, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(60); } return false; };
const shot = (page, name) => page.evaluate(() => (window.KS_PAUSE = true)).then(() => page.screenshot({ path: path.join(OUT, `${name}.png`) })).finally(() => page.evaluate(() => (window.KS_PAUSE = false)).catch(() => {}));
// what the Mix dealt (each card as dealt, by place), which card is on screen, and how many there are
const mix = (page) => page.evaluate(() => ({ dealt: KS_MIX.dealt.map((d) => ({ ...d })), active: KS_MIX.feed.active, size: KS_MIX.feed.size, cards: document.querySelectorAll('.ks-card').length }));
// Play card i to its end, as the player would: Start and the like, the mic (KS_SIM says the line), say-and-check, typing;
// the verdict's Continue. → whether it got there
const play = (page, i, ms = 60000) => until(page, (i) => {
  const c = document.querySelectorAll('.ks-card')[i];
  if (!c || c.dataset.state === 'done') return !!c;
  const vis = (e) => e && e.offsetParent !== null && !e.disabled;
  const go = [...c.querySelectorAll('[data-test-go]')].find(vis), a = c.querySelector('.ks-ask');
  if (go) go.click();
  else if (a && !a.matches('.ks-shake, .ks-timeout')) {
    const next = a.querySelector('.ks-next'), mic = a.querySelector('.ks-mic'), input = a.querySelector('.ks-type input'), self = a.querySelector('.ks-reveal') || a.querySelector('.ks-yes');
    if (vis(next)) next.click();
    else if (vis(mic)) { if (!a.classList.contains('ks-listening')) mic.click(); }
    else if (input && a.dataset.answer) { input.value = window.KS_SAY ? window.KS_SAY(a.dataset.answer) : a.dataset.answer; input.dispatchEvent(new Event('input', { bubbles: true })); input.form ? input.form.requestSubmit() : a.querySelector('.ks-type button')?.click(); }
    else if (a.querySelector('.ks-reveal')) a.querySelector('.ks-reveal').click();
    else if (a.querySelector('.ks-yes')) (window.KS_SAY && a.dataset.answer && window.KS_SAY(a.dataset.answer) !== a.dataset.answer ? a.querySelector('.ks-no') || a.querySelector('.ks-yes') : a.querySelector('.ks-yes')).click();
    else if (self) self.click();
    else a.querySelector('.ks-skip')?.click();
  }
  return false;
}, i, ms);
// swipe on to card i (a scroll, as a thumb would), and wait till it's the one on screen
const swipe = async (page, i) => { await page.evaluate((i) => document.querySelectorAll('.ks-card')[i]?.scrollIntoView(), i); await until(page, (i) => KS_MIX.feed.active === i, i, 5000); await sleep(150); };
const rows = (page) => page.evaluate(() => { dispatchEvent(new Event('pagehide')); try { return JSON.parse(localStorage.getItem('ks.log')).rows; } catch { return []; } });
// the swipe pill on card i, once its end screen has settled: what it covers (words, a picture, a button of the card's
// own), or null where there's no pill
const pill = (page, i) => page.evaluate(async (i) => {
  await new Promise((r) => setTimeout(r, 700));
  const c = document.querySelectorAll('.ks-card')[i], p = c?.querySelector('.ks-mix-swipe');
  if (!p || getComputedStyle(p).visibility === 'hidden') return null;
  const a = p.getBoundingClientRect(), over = (b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const seen = (e) => e.offsetParent && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.ks-why') && !p.contains(e);
  return [...c.querySelectorAll('*')].filter((e) => seen(e) && (e.matches('button, [role=button], img, svg, canvas') || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) && over(e.getBoundingClientRect())).map((e) => e.className || e.tagName);
}, i);

try {
  // ---------- a fresh phone: a story first, no format twice running, a why on every card, one card ahead ----------
  {
    const page = await open('mix?why'), seen = [], ahead = [], whys = [], pills = [];
    let played = 0;
    for (let i = 0; i < 8; i++) {
      const m = await mix(page);
      ahead.push(m.cards - m.active - 1); // cards built beyond the one on screen
      whys.push(await page.evaluate((i) => { const t = document.querySelectorAll('.ks-card')[i]?.querySelector(':scope > .ks-why'); return t && { text: t.textContent, why: JSON.parse(t.dataset.why) }; }, i));
      if (i < 3) await shot(page, `fresh-${i}`);
      if (await play(page, i)) played++;
      const covers = await pill(page, i);
      if (covers) { pills.push({ i, covers }); await shot(page, `pill-${i}`); }
      seen.push((await mix(page)).dealt[i]);
      if (i < 7) await swipe(page, i + 1);
    }
    const cardRows = (await rows(page)).filter((r) => r.k === 'card');
    const fmts = seen.map((d) => d && fmt(d)), twice = fmts.findIndex((f, i) => i && f === fmts[i - 1]);
    expect('a fresh phone: card 1 is a story, the hook (p3.md), and card 2 the about card', seen[0]?.kind === 'scn' && seen[0].why?.rule === 'hook' && seen[1]?.kind === 'about' && seen[1].why?.rule === 'about', seen.slice(0, 2));
    expect('…every card played to its end', played === 8, { played, seen: fmts });
    expect('…no format twice running', twice < 0, fmts);
    expect('…a why under every card (score, τ, p, A, lv, rule)', whys.every((w) => w && w.why.rule && w.text) && whys.filter((w, i) => seen[i]?.kind === 'scn').every((w) => w.why.p != null && w.why.A != null && w.why.tau != null && w.why.lv != null), whys);
    expect('…never more than one card dealt ahead of the one on screen', ahead.every((n) => n <= 1), ahead);
    // one card ahead, built at once: the next card's element has its card in it before it's swiped in
    expect('…the card ahead is built before it comes on screen', await page.evaluate(() => { const c = document.querySelectorAll('.ks-card'); return c.length === KS_MIX.feed.active + 2 && c[c.length - 1].children.length > 0; }), await mix(page));
    // each card's row in the log says why it was dealt: the rule; a story's p̄, rung, τ and propensity too
    expect('…each card\'s row says why it was dealt (rule; a story\'s p̄, A, τ, propensity)', cardRows.length >= 7 && cardRows.every((r) => r.rule && (r.kind !== 'scn' || (Number.isFinite(r.p) && Number.isInteger(r.A) && Number.isFinite(r.tau) && Number.isFinite(r.prop)))), cardRows.map((r) => ({ kind: r.kind, rule: r.rule, p: r.p, A: r.A, tau: r.tau, prop: r.prop })));
    expect('…the swipe pill shows once, covering nothing on its end screen', pills.length === 1 && !pills[0].covers.length, pills);
    await page.close();
  }

  // ---------- a call dealt ahead, swapped in and out while the card on screen talks: its voice plays on ----------
  // (every voice's stop() logged, with what stopped it; the voices for real: no KS_FAST, so they play, muted)
  if (!DIST) {
    const init = () => {
      window.KS_STOPS = []; window.KS_ON = new Set();
      const st = AudioBufferSourceNode.prototype.start, sp = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.start = function (...a) { this.__t = performance.now(); this.__len = a[2] || 0; KS_ON.add(this); this.addEventListener('ended', () => { this.__end = true; KS_ON.delete(this); }); return st.apply(this, a); };
      AudioBufferSourceNode.prototype.stop = function (...a) { if (this.__t && !this.__end) KS_STOPS.push({ after: Math.round(performance.now() - this.__t), of: Math.round(this.__len * 1000), why: new Error().stack.split('\n').slice(2, 6).map((x) => x.trim()).join(' < ') }); return sp.apply(this, a); };
    };
    const page = await open('mix', { fast: false, init });
    const talking = await until(page, () => [...KS_ON].some((s) => s.__len > 0.8 && performance.now() - s.__t < 300), undefined, 25000);
    const r = await page.evaluate(async () => {
      const c = (await import('/app/shared/content.js')).get(), call = c.scenarios.find((s) => s.format === 'call' && s.id !== KS_MIX.dealt[0].id), f = KS_MIX.feed, n = KS_STOPS.length;
      const swappedIn = f.replace(1, { kind: 'scn', scn: call, lv: call.level, A: 2, tau: 0.8 }); // built a card ahead
      await new Promise((r) => setTimeout(r, 300));
      const swappedOut = f.replace(1, { kind: 'shadow', item: { scn: c.byId[KS_MIX.dealt[0].id], step: c.byId[KS_MIX.dealt[0].id].steps.find((st) => st.who && st.a && st.t) } }); // and thrown away
      await new Promise((r) => setTimeout(r, 300));
      return { swappedIn, swappedOut, stops: KS_STOPS.slice(n) };
    });
    expect('a call dealt ahead, swapped in and out while the card on screen talks: its voice plays on', talking && r.swappedIn && r.swappedOut && !r.stops.length, { talking, ...r });
    await page.close();
  }

  // ---------- replace(): a card not on screen yet, swapped cleanly ----------
  {
    const page = await open('mix'), asked = [];
    page.on('request', (r) => asked.push(r.url()));
    await until(page, () => document.querySelectorAll('.ks-card')[1]?.children.length > 0, undefined, 5000);
    // swapped while the next card's voices are on their way (they're fetched 600 ms after a card comes on screen): the
    // new card's are fetched (the packed page carries its voices inside it: nothing to see on the network there)
    if (!DIST) {
      const pack = await page.evaluate(async () => {
        const data = (await import('/app/shared/content.js')).get(), f = KS_MIX.feed, used = new Set([0, 1].map((i) => f.slot(i).item.scn?.audio || f.slot(i).item.item?.scn?.audio || f.slot(i).item.p?.audio));
        const scn = data.scenarios.find((s) => !used.has(s.audio));
        return f.replace(1, { kind: 'scn', scn, lv: scn.level }) && scn.audio;
      });
      await sleep(1500);
      expect('replace(): the swapped-in card\'s voices are fetched', pack && asked.some((u) => u.endsWith(pack)), { pack, asked: asked.filter((u) => /audio\//.test(u)) });
    }
    const r = await page.evaluate(async () => {
      const f = KS_MIX.feed, scn = f.slot(0).item.scn, step = scn.steps.find((st) => st.who && st.a && st.t), old = f.slot(1).el;
      const item = { kind: 'shadow', item: { scn, step } };
      const out = { onScreen: f.replace(0, item), oldClass: old.className };
      // partly showing (mid-swipe, held there: the feed's snapping would otherwise settle it at once): kept
      f.el.style.scrollSnapType = 'none'; f.el.scrollTop = f.el.clientHeight * 0.3; await new Promise((r) => setTimeout(r, 120));
      out.showing = f.replace(1, item);
      f.el.scrollTop = 0; f.el.style.scrollSnapType = ''; await new Promise((r) => setTimeout(r, 300));
      out.swapped = f.replace(1, item);
      const el = f.slot(1).el;
      Object.assign(out, { oldGone: !old.isConnected, oldEmpty: old.children.length === 0, fresh: el !== old, cls: el.className, built: !!el.querySelector('.ks-shadow-line'), i: el.dataset.i, inert: el.inert, same: f.slot(1).item === item });
      return out;
    });
    expect('replace(): never the card on screen', r.onScreen === false, r);
    expect('…nor one partly showing (mid-swipe)', r.showing === false, r);
    expect('…a card not on screen yet is swapped: a fresh element in its place, built, the old one thrown away', r.swapped && r.oldGone && r.oldEmpty && r.fresh && r.built && r.i === '1' && r.inert && r.same && !/ks-scene|ks-call|ks-chat|ks-chase|ks-basic/.test(r.cls), r);
    await swipe(page, 1);
    const done = await play(page, 1);
    await shot(page, 'replaced');
    const after = await page.evaluate(() => ({ seen: KS_MIX.feed.replace(1, { kind: 'end' }), state: document.querySelectorAll('.ks-card')[1].dataset.state }));
    expect('…the swapped card plays to its end', done && after.state === 'done', after);
    expect('…and once seen it stays', after.seen === false, after);
    // Next ↓ heading for the next card: kept, however the pick goes meanwhile
    const heading = await page.evaluate(() => { const f = KS_MIX.feed; f.go(f.active + 1, 'next'); return f.replace(f.active + 1, { kind: 'end' }); });
    expect('…nor the card Next ↓ is heading for', heading === false, heading);
    await page.close();
  }

  // ---------- #mix?deal=v1: exactly v1's cards, as deal-v1.js deals them in Node on the same state ----------
  {
    // three phrases due an hour ago (a run), two more due in two days, the airport story done (so the queue starts on)
    const t = Date.now(), at = (box, due) => ({ box, seen: 1, best: 3, due, last: due - DAY });
    const srs = { 'hotpot-spicy/toohot': at(1, t - 60 * MIN), 'hotpot-spicy/milk': at(1, t - 50 * MIN), 'airport-esim/nosignal': at(1, t - 40 * MIN), 'airport-esim/borrow': at(2, t + 2 * DAY), 'hotpot-spicy/coriander': at(2, t + 2 * DAY) };
    const store = { srs, done: { 'airport-esim': { stars: 3, outcome: 'win', at: t - DAY } } };
    // the glance: no player, no quick clock, so nothing is answered or timed out (and nothing recorded) on the way
    const page = await open('mix?deal=v1', { store, sim: false, fast: false }), n = 14;
    for (let i = 1; i < n; i++) { const m = await mix(page); if (m.size <= i) break; await swipe(page, i); }
    const got = (await mix(page)).dealt.map((d) => `${d.kind}:${d.id}`);
    await shot(page, 'v1');
    await page.close();
    // the same state in Node
    const st = new Map(Object.entries(store)), clock = () => Date.now(), { srs: s, marks } = over({ get: (k, d) => (st.has(k) ? st.get(k) : d), set: (k, v) => st.set(k, v) }, clock);
    const d = dealV1({ data, srs: s, marks, now: clock, runs: true }), want = [];
    while (want.length < got.length) { const x = d.next(); if (!x) break; const w = what(x); want.push(`${w.kind}:${w.id}`); }
    expect('#mix?deal=v1 deals exactly what deal-v1.js deals in Node on the same state', got.length >= 10 && JSON.stringify(got) === JSON.stringify(want.slice(0, got.length)), { got, want });
  }

  // ---------- a long visit on a win: a sure win, a recap, and on ----------
  // time spent, as the ranker counts it: each pause up to 5 minutes, so 4½ minutes on after each of the first three cards
  const later = (page, i) => i < 3 && page.evaluate(() => (window.KS_NOW += 4.5 * 60e3));
  for (const [view, name, sim] of [[[390, 664], 'recap', true], [[375, 553], 'recap-se', true], [[375, 553], 'recap-mixed', 'mixed']]) {
    const page = await open('mix?why', { view, sim });
    const kinds = [], ended = [], pills = [];
    let recap = -1;
    for (let i = 0; i < 10 && recap < 0; i++) {
      ended.push(await play(page, i)); // (a chase or a call goes back to its start once left: whether it ended is now)
      const covers = await pill(page, i);
      if (covers) pills.push({ i, kind: (await mix(page)).dealt[i]?.kind, covers });
      kinds.push((await mix(page)).dealt[i]?.kind);
      if (kinds[i] === 'recap') { recap = i; break; }
      await later(page, i);
      await swipe(page, i + 1);
    }
    const m = await mix(page), card = recap >= 0 && await page.evaluate((i) => { const c = document.querySelectorAll('.ks-card')[i], n = [...c.querySelectorAll('.ks-recap-nums b')].map((b) => b.textContent); return { nums: n, label: c.querySelector('.ks-recap-nums span')?.textContent, lines: c.querySelectorAll('.ks-recap-said:not([hidden])').length, state: c.dataset.state, wide: document.documentElement.scrollWidth > innerWidth + 1, fits: c.querySelector('.ks-recap-go').getBoundingClientRect().bottom <= innerHeight, nailed: KS_MIX.session().nailed.length }; }, recap);
    if (recap >= 0) { await sleep(900); await shot(page, name); }
    expect(`a long visit on a win (${view.join('×')}): a recap comes`, recap > 0, { kinds, dealt: m.dealt.map((d) => d.kind + ':' + d.id + ' ' + d.why?.rule) });
    expect('…the swipe pill, where it shows, covering nothing on its end screen', pills.every((x) => !x.covers.length), pills);
    if (recap > 0) {
      // a sure win before it (p̄ 0.9, a minute at most), where the rules allowed one; else straight after a win
      const before = m.dealt[recap - 1], won = ended[recap - 1] && (before?.kind !== 'scn' || await page.evaluate((id) => JSON.parse(localStorage.getItem('ks.done') || '{}')[id]?.outcome === 'win', before.id));
      expect('…after a win (a sure one where the rules allowed it), played to its end', won && (before?.why?.rule !== 'sure win' || before.why.p >= 0.9), before);
      expect(`…saying what the visit came to (lines ${sim === 'mixed' ? 'said' : 'nailed'}, back tomorrow), on one screen`, card.state === 'done' && +card.nums[0] >= 1 && +card.nums[2] >= 1 && card.lines >= 1 && card.fits && !card.wide, card);
      // nailed: right the first time, as the ranker counts them (a line right after a wrong try isn't)
      expect('…its lines nailed the ranker\'s own count', sim === 'mixed' ? card.nailed === 0 && /said/.test(card.label) : /nailed/.test(card.label) && +card.nums[0] === card.nailed, card);
      // a swipe goes on: the card after it is dealt (and isn't another recap)
      const nx = await page.evaluate((i) => KS_MIX.dealt[i + 1], recap);
      await swipe(page, recap + 1);
      expect('…and a swipe goes on past it', nx && nx.kind !== 'recap' && (await mix(page)).active === recap + 1, nx);
      // #stats: the day's cards are the cards played, the recap (nothing to play) not one of them, nor the about card (a
      // fresh phone's second)
      const t = await page.evaluate(() => { dispatchEvent(new Event('pagehide')); const log = JSON.parse(localStorage.getItem('ks.log')).rows.filter((r) => r.k === 'card'), days = JSON.parse(localStorage.getItem('ks.days')); return { played: log.filter((r) => !r.again && !['recap', 'end', 'about'].includes(r.kind)).length, recaps: log.filter((r) => r.kind === 'recap').length, cards: Object.values(days).reduce((n, d) => n + (d.cards || 0), 0) }; });
      expect('…and the day\'s numbers count the cards played, not the recap', t.recaps >= 1 && t.cards === t.played, t);
    }
    await page.close();
  }

  // ---------- every story done, every line met, nothing due: the end card, and nothing after it ----------
  {
    // (a story played whose lines are all new still counts as fresh at its level: so every line met, due in two days)
    const t = Date.now(), done = Object.fromEntries(data.scenarios.map((s) => [s.id, { stars: 3, outcome: 'win', at: t - DAY }]));
    const srs = Object.fromEntries(data.phrases.map((p) => [p.id, { box: 3, seen: 2, best: 3, due: t + 2 * DAY, last: t - DAY }]));
    const page = await open('mix?why', { store: { done, srs } });
    let end = -1;
    for (let i = 0; i < 8; i++) {
      if ((await mix(page)).dealt[i]?.kind === 'end') { end = i; break; }
      await play(page, i);
      if (!(await mix(page)).dealt[i + 1]) break;
      await swipe(page, i + 1);
    }
    if (end >= 0) { await swipe(page, end); await sleep(400); }
    const m = await mix(page);
    await shot(page, 'end');
    expect('every story done, every line met and nothing due: the end card', end >= 0 && m.active === end && await page.evaluate((i) => /没了/.test(document.querySelectorAll('.ks-card')[i].textContent), end), m.dealt.map((d) => d.kind + ':' + d.id));
    expect('…and nothing dealt after it', m.size === end + 1, m);
    await page.close();
  }

  // ---------- every story done, phrases due, a player the model rates far below them: the end card's button deals them ----------
  {
    // (every phrase met and waiting two days but four, due an hour ago; g −4, and sure of it: those four are far under
    // the floor, so only the learner asking brings them)
    const t = Date.now(), done = Object.fromEntries(data.scenarios.map((s) => [s.id, { stars: 1, outcome: 'win', at: t - 2 * DAY }]));
    const srs = Object.fromEntries(data.phrases.map((p) => [p.id, { box: 3, seen: 2, best: 2, due: t + 2 * DAY, last: t - DAY }]));
    for (const id of ['hotpot-spicy/toohot', 'airport-esim/borrow', 'locked-out/lockedout', 'farm-goose/shoo']) srs[id] = { box: 0, seen: 3, best: 1, due: t - 60 * MIN, last: t - DAY };
    const x = [-4, 0, 0, 0, 0, 0, 0], model = { v: 1, persona: 'new', x, C: x.map((_, i) => x.map((_, j) => (i === j ? 0.0144 : 0))), beta: [...BETA], items: {}, at: t, n: 120, k: 20 };
    // (arms: the about card seen, as a phone through P3; one that never was is owed P5a's later about card)
    // (every ending found too: a story with one unfound comes back for it, and many have more than one)
    const ends = Object.fromEntries(data.scenarios.map((s) => [s.id, endsOf(s).map((e) => e.key)]));
    const page = await open('mix?why', { store: { done, srs, model, ends, arms: { v: 1, fmt: {}, topic: {}, about: t } } });
    await sleep(500);
    const b = await page.evaluate(() => { const c = document.querySelectorAll('.ks-card')[0], b = c?.querySelector('.ks-btn'); return { end: /没了/.test(c?.textContent), button: b && !b.hidden ? b.textContent : null }; });
    await page.evaluate(() => document.querySelectorAll('.ks-card')[0].querySelector('.ks-btn')?.click());
    const went = await until(page, () => KS_MIX.feed.size > 1 && KS_MIX.feed.active === 1, undefined, 5000);
    const m = await mix(page);
    await shot(page, 'end-due');
    expect('every story done, four phrases due, a player rated far below them: the end card\'s "Review the 4 due ↓" deals them', b.end && /Review the 4 due/.test(b.button || '') && went && ['review', 'run'].includes(m.dealt[1]?.kind), { ...b, went, dealt: m.dealt.map((d) => `${d.kind}:${d.id} ${d.why?.rule}`) });
    await page.close();
  }

  // ---------- a player out of reach of every story: the Mix goes on while stories are unplayed, said so ----------
  {
    // (g −6, and sure of it: even at A5 every story's p̄ is far under the floor)
    const t = Date.now(), x = [-6, 0, 0, 0, 0, 0, 0], model = { v: 1, persona: 'new', x, C: x.map((_, i) => x.map((_, j) => (i === j ? 0.01 : 0))), beta: [...BETA], items: {}, at: t, n: 80, k: 20 };
    const page = await open('mix?why', { store: { model, arms: { v: 1, fmt: {}, topic: {}, about: t } } }); // (the about card seen, as above)
    let played = 0;
    for (let i = 0; i < 4; i++) { if (await play(page, i)) played++; if (i < 3) await swipe(page, i + 1); }
    const m = await mix(page);
    await shot(page, 'weak');
    expect('a player out of every story\'s reach: no end card while stories are unplayed; the surest come, each why saying the floor gave way', played === 4 && m.dealt.every((d) => d.kind === 'scn' && d.why?.rule === 'surest*') && new Set(m.dealt.map((d) => d.id)).size === m.dealt.length, m.dealt.map((d) => `${d.kind}:${d.id} ${d.why?.rule}`));
    await page.close();
  }

  // ---------- the Mix opened again inside a visit: it carries on ----------
  {
    const page = await open('mix?why'), a = [];
    for (let i = 0; i < 3; i++) { await play(page, i); a.push((await mix(page)).dealt[i]); await page.evaluate(() => (window.KS_NOW = (+window.KS_NOW || 0) + 2 * 60e3)); if (i < 2) await swipe(page, i + 1); }
    const s1 = await page.evaluate(() => KS_MIX.session());
    await rows(page);
    const now = await page.evaluate(() => +window.KS_NOW || 0);
    await page.close();
    // five minutes on, a page of its own (the versions and back, or a tab the phone reloaded): the same events.js visit
    const again = await open('mix?why', { clear: false, now: now + 5 * MIN });
    const b = [];
    for (let i = 0; i < 3; i++) { await play(again, i); b.push((await mix(again)).dealt[i]); if (i < 2) await swipe(again, i + 1); }
    const s2 = await again.evaluate(() => KS_MIX.session()), told = new Set(a.filter((d) => d.kind === 'scn').map((d) => d.id));
    expect('the Mix opened again inside a visit carries it on: none of its stories again, its cards and minutes kept', b.every((d) => !(d.kind === 'scn' && told.has(d.id))) && b[0]?.why?.rule !== 'first' && b[0]?.why?.rule !== 'first*' && s2.cards.length === a.length + b.length && s2.minutes > 5 && Math.abs(s2.start - s1.start) < 5000, { first: a.map((d) => `${d.kind}:${d.id}`), again: b.map((d) => `${d.kind}:${d.id} ${d.why?.rule}`), cards: s2.cards.length, minutes: s2.minutes });
    await again.close();
  }

  // ---------- a returning phone: card 1 a likely win ----------
  // a visit's first card: a story at p̄ 0.85 at its rung (first), else the surest one (first*), aimed at τ 0.9 when the
  // phone has played before
  const first = (d) => d?.kind === 'scn' && d.why?.tau >= 0.9 && (d.why.rule === 'first' ? d.why.p >= 0.85 : d.why.rule === 'first*');
  {
    const page = await open('mix');
    await play(page, 0); await swipe(page, 1); await play(page, 1);
    await rows(page);
    await page.close();
    // the same phone (localStorage is the browser's), 31 minutes on
    const back = await open('mix?why', { clear: false, now: 31 * MIN });
    const d = (await mix(back)).dealt[0];
    await shot(back, 'returning');
    expect('a returning phone (31 minutes on): card 1 a visit\'s first pick, at the returning τ', first(d), d);
    // the page hidden for 31 minutes and back, the card on screen part played: the card after it is picked again for the
    // new visit, which starts with the card on screen, so it's neither that story nor its format
    await back.evaluate(() => (window.KS_PAUSE = true)); // its first panel waits (nobody answers it)
    await until(back, () => { const c = document.querySelectorAll('.ks-card')[0], go = [...c.querySelectorAll('[data-test-go]')].find((b) => b.offsetParent); go?.click(); return !!c.querySelector('.ks-ask'); }, undefined, 20000);
    const before = (await mix(back)).dealt, was = await back.evaluate(() => KS_MIX.session().start);
    await back.evaluate(() => KS_VIS('hidden'));
    await back.evaluate(() => (window.KS_NOW += 31 * 60e3));
    await back.evaluate(() => KS_VIS('visible'));
    await sleep(300);
    const again = (await mix(back)).dealt, s = await back.evaluate(() => KS_MIX.session());
    expect('…and back after 31 minutes hidden, mid-story, the next card is picked again for the new visit: neither the story on screen nor its format', again[1] && again[1].why?.tau >= 0.9 && s.start >= was + 31 * MIN && again[1].id !== before[0].id && again[1].fmt !== before[0].fmt && s.cards[0]?.id === before[0].id, { before: before.slice(0, 2), again: again.slice(0, 2), visit: s.cards.map((c) => c.id) });
    await back.evaluate(() => (window.KS_PAUSE = false));
    await back.close();
  }
  {
    // a player the model knows well (a good one, and sure of it: 80 lines in), last here 31 minutes ago
    const t = Date.now(), x = [1.5, 0, 0, 0, 0, 0, 0], model = { v: 1, persona: 'studied', x, C: x.map((_, i) => x.map((_, j) => (i === j ? 0.02 : 0))), beta: [...BETA], items: {}, at: t, n: 80, k: 20 };
    const srs = { 'hotpot-spicy/toohot': { box: 3, seen: 3, best: 3, due: t + 2 * DAY, last: t - DAY } };
    const page = await open('mix?why', { store: { model, srs, assist: 2, sess: { start: t - 3600e3, last: t - 31 * MIN, cards: 6, lines: 20 } } });
    const d = (await mix(page)).dealt[0];
    expect('…and where the model can promise one, card 1 a likely win (first, p̄ ≥ 0.85)', d?.kind === 'scn' && d.why?.rule === 'first' && d.why.p >= 0.85 && d.why.tau >= 0.9, d);
    await page.close();
  }

  // ---------- cards of phrases at a rung (item.A), one without, and the bonus line ----------
  // A phone that has met a phrase (so no hook and no about card), its model knowing nothing yet (no persona, no line),
  // the last card begun at A4 (ks.assist): the ladder gives any line A4 now (assist.forLines: startAt(), moving
  // nothing). Nobody answers card 1 (it waits at its first panel, so nothing moves the rung); each card after it is
  // swapped for the case's own once the one before it is done (the Mix re-picks the next place then), and answered
  // right once its panel has been read.
  {
    const T = Date.now(), scene = data.phrases.filter((p) => data.byId[p.scn]?.format === 'scene' && (p.level ?? 1) >= 1 && (p.level ?? 1) <= 2);
    const [met, r1, r2, ...rest] = scene, ran = rest.slice(0, 3), hi = data.phrases.filter((p) => (p.level ?? data.byId[p.scn].level) >= 3 && ![met, r1, r2, ...ran].some((q) => q.scn === p.scn)), [b1, b2] = [hi[0], hi.find((p) => p.scn !== hi[0].scn) || hi[1]];
    const page = await open('mix', { sim: false, store: { srs: { [met.id]: { box: 2, seen: 2, best: 3, due: T + 2 * DAY, last: T - DAY } }, assist: 4 } });
    const put = async (i, item) => { await sleep(300); return page.evaluate((i, item) => KS_MIX.feed.replace(i, item), i, item); }; // (after the re-pick the card before it set off)
    const answering = () => page.evaluate(() => { window.KS_SIM = (b) => (b ? b.answers[0] : null); window.KS_SAY = (a) => a; });
    // card i's first answer panel as it opens: the card's rung, its clock, the help up from the start
    const panel = async (i) => { await until(page, (i) => !!document.querySelectorAll('.ks-card')[i]?.querySelector('.ks-ask'), i, 20000); await sleep(200); return page.evaluate((i) => { const c = document.querySelectorAll('.ks-card')[i], a = c.querySelector('.ks-ask'), k = a?.querySelector('.ks-ask-clock'); return a && { A: c.dataset.assist ?? null, clock: !!k && !k.hidden, frame: !!a.querySelector('.ks-frame'), full: !!a.querySelector('.ks-help-full') }; }, i); };
    const line = async (id, task) => (await rows(page)).find((r) => r.k === 'line' && r.id === id && (!task || r.task === task));
    const srsOf = (id) => page.evaluate((id) => JSON.parse(localStorage.getItem('ks.srs') || '{}')[id] || null, id);

    // a flash crisis dealt at a rung: A4's no clock and its frame up, free; its row says so
    const in1 = await put(1, { kind: 'review', p: r1, A: 4, tau: 0.8 });
    await swipe(page, 1);
    const p1 = await panel(1);
    await shot(page, 'rung-review-A4');
    await answering(); await play(page, 1);
    const row1 = await line(r1.id, 'review');
    expect('a flash crisis dealt at a rung (item.A) plays at the one the ladder gives its line (A4 here): no clock, the frame up', in1 && p1?.A === '4' && !p1.clock && p1.frame && !p1.full, p1);
    expect('…its row says the rung and the free frame, as a story\'s do (task review)', row1?.assist === 4 && row1.free === 1, row1);
    // the same kind of card without A: v1's, whatever the ladder says
    const in2 = await put(2, { kind: 'review', p: r2 });
    await swipe(page, 2);
    const p2 = await panel(2);
    await play(page, 2);
    const row2 = await line(r2.id, 'review');
    expect('…one dealt without A plays as v1 did: the clock, no help up, no rung on its row', in2 && p2?.A == null && p2.clock && !p2.frame && !p2.full && row2 && row2.assist === undefined && !row2.free, { p2, row2 });
    // a run at a rung: the chase's knobs (its chaser's speed) and its rows
    const in3 = await put(3, { kind: 'run', ps: ran, audio: ran[0].audio, A: 4, tau: 0.8 });
    await swipe(page, 3);
    const p3 = await panel(3);
    await shot(page, 'rung-run-A4');
    await play(page, 3);
    const row3 = await line(ran[0].id, 'review'), last = await page.evaluate(() => JSON.parse(localStorage.getItem('ks.assist')));
    expect('…a run dealt at a rung runs at it: its rows say A4, the frame free', in3 && p3?.A === '4' && p3.frame && row3?.assist === 4 && row3.free === 1, { p3, row3 });
    expect('…and none of them moved where the next card starts (ks.assist still 4)', last === 4, last);
    // the bonus: labelled a level up, a miss costing nothing; it waits for Have a go; its row is task 'bonus'
    const in4 = await put(4, { kind: 'bonus', p: b1 });
    await swipe(page, 4);
    await sleep(600);
    const b = await page.evaluate(() => { const c = document.querySelectorAll('.ks-card')[4]; return { state: c.dataset.state, label: c.querySelector('.ks-rev-label')?.textContent, q: c.querySelector('.ks-rev-q')?.textContent, note: c.querySelector('.ks-rev-note')?.textContent, go: c.querySelector('[data-test-go]')?.textContent, panel: !!c.querySelector('.ks-ask') }; });
    await shot(page, 'bonus');
    await play(page, 4);
    const row4 = await line(b1.id), lvl = b1.level ?? data.byId[b1.scn].level;
    const setting = data.byId[b1.scn].setting || '';
    expect(`the bonus line: "Bonus · a level-${lvl} line", how far up, its story's setting, saying a miss costs nothing, waiting for Have a go`, in4 && b.label === `Bonus · a level-${lvl} line` && /^One from (a level|[2-5] levels) up!$|^One from a story to come!$/.test(b.q || '') && +(b.q.match(/(\d) levels/)?.[1] ?? 1) <= lvl && setting && (b.note || '').startsWith(setting) && /costs nothing/.test(b.note || '') && b.go === 'Have a go' && b.state === 'idle' && !b.panel, b);
    expect('…taken up and said, its row is task bonus (a first meeting), and it\'s in spaced review', row4?.task === 'bonus' && row4.res === 'ok' && !!(await srsOf(b1.id)), row4);
    // swiped past: a pass, nothing recorded
    const in5 = await put(5, { kind: 'bonus', p: b2 }), cardsToday = () => page.evaluate(() => { dispatchEvent(new Event('pagehide')); return Object.values(JSON.parse(localStorage.getItem('ks.days') || '{}')).reduce((n, d) => n + (d.cards || 0), 0); });
    await swipe(page, 5); await sleep(400);
    const before = await cardsToday();
    await swipe(page, 6);
    const pass = { line: await line(b2.id), srs: await srsOf(b2.id), card: (await rows(page)).find((r) => r.k === 'card' && r.kind === 'bonus' && r.id === b2.id), counted: (await cardsToday()) - before };
    expect('…swiped past, a pass: no line, nothing in spaced review, its card row left idle (a card glanced past), no card played in the day\'s numbers', in5 && !pass.line && !pass.srs && pass.card?.state === 'idle' && pass.counted === 0, pass);
    // a card built ahead, then picked again before it came on screen: the same item, its A and τ the new pick's (rank.js
    // again() keeps the item and brings them up to date in place). It plays at the rung the ladder gives at that τ as it
    // comes on screen: built for τ 0.50 and picked again for 0.99, more help than its twin before it, built for 0.50 and
    // left so (the twin answered right only leaves the next line less help at the same τ: what's more is the τ's)
    const in7 = await put(7, { kind: 'review', p: rest[3], A: 4, tau: 0.5 });
    await swipe(page, 7);
    const p7 = await panel(7);
    await play(page, 7);
    const in8 = await put(8, { kind: 'review', p: rest[4], A: 4, tau: 0.5 });
    await page.evaluate(() => Object.assign(KS_MIX.feed.slot(8).item, { A: 5, tau: 0.99 }));
    await swipe(page, 8);
    const p8 = await panel(8);
    expect('…a card picked again before it came on screen plays at its last pick\'s τ (0.99), not the one it was built for (0.50, its twin\'s)', in7 && in8 && p7 && p8 && +p8.A > +p7.A, { p7, p8 });
    await page.close();
  }

  // ---------- a level's own line (scn/beat@L) comes back as itself; #phrases shows a family as one row ----------
  if (DIST) console.log('--   a level\'s own line and a family on #phrases: not with --dist (the gate build p4b-1 has them)');
  else {
    const gate = JSON.parse(fs.readFileSync(path.join(ROOT, 'review/gate/p4b-1/data/content.json'), 'utf8')), T = Date.now(), dir = 'review/gate/p4b-1/data';
    const byId = Object.fromEntries(gate.phrases.map((p) => [p.id, p])), v = gate.phrases.find((p) => /@0$/.test(p.id) && byId[p.family] && gate.scenarios.find((s) => s.id === p.scn)?.format === 'scene'), base = byId[v.family];
    const met = (best, seen, ago) => ({ box: best - 1, seen, best, due: T + DAY, last: T - ago });
    const page = await open('mix', { sim: false, data: dir, store: { srs: { [base.id]: met(2, 1, 2 * DAY), [v.id]: met(3, 2, DAY) } } });
    await sleep(300);
    const ok = await page.evaluate((v) => KS_MIX.feed.replace(1, { kind: 'review', p: v }), v);
    await swipe(page, 1);
    await until(page, () => !!document.querySelectorAll('.ks-card')[1]?.querySelector('.ks-ask'), undefined, 20000);
    await sleep(200);
    const r = await page.evaluate(() => { const c = document.querySelectorAll('.ks-card')[1], a = c.querySelector('.ks-ask'), k = a.querySelector('.ks-ask-clock'); return { who: c.querySelector('.ks-rev-who b')?.textContent || '', again: !!c.querySelector('.ks-rev-again'), line: c.querySelector('.ks-rev-line')?.textContent.replace(/\s+/g, '') || '', clock: !!k && !k.hidden }; });
    await shot(page, 'review-at-level');
    await page.evaluate(() => { window.KS_SIM = (b) => (b ? b.answers[0] : null); window.KS_SAY = (a) => a; });
    await play(page, 1);
    const row = (await rows(page)).find((x) => x.k === 'line' && x.task === 'review');
    expect(`a flash crisis of ${v.id} is that line in its scene (the line before it said again: found in the story at L0), at L0's clock (none)`, ok && r.again && r.line && !r.clock && row?.id === v.id && row.lv === 0 && row.res === 'ok', { r, row });
    await page.close();
    // #phrases: the base line and its L0 variant one row, its best stars, both levels; the line as last met
    const known = { srs: { [base.id]: met(2, 1, 2 * DAY), [v.id]: met(3, 2, DAY), [gate.phrases.find((p) => p.family !== v.family && p.scn !== v.scn).id]: met(1, 1, DAY) } };
    const book = await open('phrases', { data: dir, cards: false, store: known });
    await book.waitForSelector('.ks-book-row');
    const fam = await book.evaluate((f) => { const rs = [...document.querySelectorAll('.ks-book-list > .ks-book-row')], r = rs.find((x) => x.dataset.family === f); return { rows: rs.length, stars: r?.querySelector('.ks-book-meta')?.textContent, lvs: [...(r?.querySelectorAll('.ks-book-lv i') || [])].map((i) => i.textContent), zh: (() => { const z = r?.querySelector('.ks-zh')?.cloneNode(true); z?.querySelectorAll('rt, rp').forEach((x) => x.remove()); return z?.textContent.replace(/\s+/g, ''); })() }; }, v.family);
    await book.screenshot({ path: path.join(OUT, 'phrases-family.png') });
    expect(`#phrases: ${v.family} and its L0 variant one row (best ★★★, levels met L0 and L${base.level}), the line as last met`, fam.rows === 2 && /^★★★/.test(fam.stars || '') && fam.lvs.join() === `L0,L${base.level}` && fam.zh?.startsWith(v.zh.replace(/[！!。，,？?]/g, '').slice(0, 2)), fam);
    await book.close();
    // and the count beside Your phrases (the lab's, as the menu's: main.js deck()) is the rows #phrases lists
    const lab = await open('lab', { data: dir, cards: false, store: known });
    await lab.waitForSelector('.ks-versions');
    const said = await lab.evaluate(() => document.querySelector('.ks-due')?.textContent || '');
    expect(`…and the phrase count beside Your phrases says the rows #phrases lists (${fam.rows}), a family once`, said.startsWith(`${fam.rows} phrases met`), said);
    await lab.close();
  }

  // ---------- the content gate's builds ----------
  if (DIST) console.log('--   the gate builds: not with --dist (the packed page carries data/ inside it)');
  else {
    const page = await open('mix?why', { data: 'review/gate/p4b-2/data' });
    let played = 0;
    for (let i = 0; i < 4; i++) { if (await play(page, i)) played++; if (i < 3) await swipe(page, i + 1); }
    const m = await mix(page);
    await shot(page, 'gate-p4b-2');
    expect('the p4b-2 build (level-0 stories) plays', played === 4 && m.dealt[0]?.kind === 'scn', m.dealt.map((d) => `${d.kind}:${d.id}@${d.lv}`));
    await page.close();
  }
  if (!DIST) {
    // Back Home's first episode done: the recap teases the episode after the latest one finished (2, or 3 if the
    // feed has dealt episode 2 meanwhile), with that one's cliffhanger
    const gate = JSON.parse(fs.readFileSync(path.join(ROOT, 'review/gate/p4b-3/data/content.json'), 'utf8'));
    const page = await open('mix?why', { data: 'review/gate/p4b-3/data', store: { done: { 'back-home-pickup': { stars: 3, outcome: 'win', at: Date.now() - 2 * 3600e3 } } } });
    let recap = -1;
    for (let i = 0; i < 10 && recap < 0; i++) {
      await play(page, i);
      if ((await mix(page)).dealt[i]?.kind === 'recap') { recap = i; break; }
      await later(page, i);
      await swipe(page, i + 1);
    }
    const teaser = recap >= 0 && await page.evaluate((i) => { const c = document.querySelectorAll('.ks-card')[i]; return { ep: c.dataset.teaser, text: c.querySelector('.ks-recap-next')?.textContent || '', done: JSON.parse(localStorage.getItem('ks.done') || '{}') }; }, recap);
    if (recap >= 0) { await sleep(900); await shot(page, 'gate-p4b-3-teaser'); }
    const m = await mix(page), last = teaser && gate.scenarios.filter((s) => s.series && teaser.done[s.id]).sort((a, b) => teaser.done[b.id].at - teaser.done[a.id].at)[0];
    expect('the p4b-3 build (Back Home) plays, and its recap teases the next episode with its cliffhanger', recap > 0 && last && teaser.ep === String(last.series.ep + 1) && teaser.text.includes(last.series.next), { teaser: teaser && { ep: teaser.ep, text: teaser.text }, last: last?.id, dealt: m.dealt.map((d) => `${d.kind}:${d.id}`) });
    await page.close();
  }
} finally { await browser.close(); server.kill(); }
console.log(problems.length ? `${problems.length} problems:\n  ${[...new Set(problems)].join('\n  ')}` : 'all good');
process.exit(problems.length ? 1 : 0);

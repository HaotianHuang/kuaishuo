#!/usr/bin/env node
// tools/loops-check.mjs: P5a's loops as a player sees them (docs/v2/p5.md), in Chrome at 375×553 (Safari's visible
// viewport on an iPhone SE), the calendar moved by KS_NOW to the day and hour each case needs:
//   the day         rolls over at 4 am: a story at 3:57 counts for the evening before (the menu's streak, and today's
//                   challenge still the day before's number), one at 4:03 for the new day
//   the streak      one story keeps a day (the menu's "🔥 n-day streak"); a missed day between two played ones spends
//                   a freeze, said once as the next card comes ("Your streak held: a freeze covered Monday. …"); a gap
//                   with none left breaks it (no streak shown, then a new one of 1); #stats says the menu's streak; a phone
//                   from before P5a, its log replayed, is told of no freeze spent back then
//   the challenge   the same story, level and modifier on two fresh phones the same day, another the next (#challenge);
//                   its modifier on screen (panic: the clock, at A0's ×0.7 of the line's own; quiet: no pinyin, no
//                   English); played through, its squares and share text on its end screen, exactly 快说 #n <stage>
//                   <squares> k/m (🟩 right first time, 🟨 with a second go), the text Share copies, days.js's record
//                   once the card's left and #challenge's page; the menu says it's played. Left part-way after a line: not
//                   played, no result; #challenge plays it on, and the result is the whole run's
//   episodes        ?data=review/gate/p4b-3/data, Back Home's episode 1 finished today: episode 2 isn't dealt today
//                   (a visit played to its recap), and the recap's teaser says "Episode 2 · tomorrow"; the next day it's
//                   out; episode 1's own end screen says so too
//   endings         "Ending 1 of 3 found" on a story's end screen where it has three, then "2 of 3" when the or-branch
//                   is said, from the log (days.js endings, the card rows' end); none on a story with one
//   quiet mode      🤫 on a speaking panel: that panel and the rest of the visit answered with no voice (tiles, never
//                   having typed), no speak tab, the recogniser never started, no line to shadow dealt; tapped off, the
//                   mic again; on from Settings; off once the visit has ended (half an hour away)
//   the countdown   Settings → Your Chinese: Lunar New Year (97 days from 1 Nov), shown in the menu and the recap; a trip
//                   in two weeks; past the day, asked once how it went (❤️ kept as a count), then what's next
//   the age         none while placing; after it, "You understand like a …-year-old and talk like a …-year-old" from
//                   learner.age(), its share text exactly 我的中文：听力N岁，口语M岁 · 快说; in the recap the first time
//   progress        #situations lists the stories won at 2★+ whose lines all reached box 3, newest first, with their
//                   endings found; #phrases heads "N phrases · M solid" and rings each phrase's box; a phrase missed on an
//                   earlier day and said at 3★ now is stamped "Monday: missed. Today: nailed." once, in a story and in
//                   For You's flash crisis of it, due; the challenge For You deals on the way aimed as #challenge's (τ 0.92)
//   the later about card  a phone that played before P3: dealt once, not first, not after a loss, asking "Anything
//                   coming up?" too
//   phones          the challenge's end screen, the menu and #situations at 390×664 too
// and no page errors anywhere. Screenshots: review/loops/.
// node tools/loops-check.mjs [--dist] [--only=day,streak,challenge,episodes,endings,quiet,countdown,age,progress,about,phones]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), DIST = process.argv.includes('--dist'), OUT = path.join(ROOT, 'review', 'loops');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const want = (k) => !ONLY || ONLY.includes(k);
const load = (dir) => { const d = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'content.json'), 'utf8')); d.byId = Object.fromEntries(d.scenarios.map((s) => [s.id, s])); return d; };
const DATA = load('data'), EP = load('review/gate/p4b-3/data'), VIEW = [375, 553];
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

// A day and hour on this machine's clock, as KS_NOW moves the page's there (the calendar the app keeps: time.js now())
const at = (local) => Date.parse(local) - Date.now();
const T = (local) => Date.parse(local);
// A phone that has played (so no hook, no first session's about card): a story finished a week back, the hook and
// the about card behind it, placement over; more over it per case
const played = (more = {}) => ({ done: { 'hotpot-spicy': { stars: 2, outcome: 'win', at: T('2026-10-25T19:00') } }, arms: { v: 1, fmt: {}, topic: {}, hook: T('2026-10-25T19:00'), about: T('2026-10-25T19:05'), place: { n: 12, call: 1, chat: 1, bonus: 1, end: T('2026-10-25T19:30') } }, ...more });

// Installed before the page's own code: every toast said (they come and go), what Share copies (no share sheet here),
// and the voice: KS_SIM answers each line right (sim 'mixed': wrong first, right the second time; alt: the or-branch's
// line where a beat has one), counting every time the recogniser was asked to listen (KS_HEARD)
function spies(sim, alt) {
  window.KS_TOASTS = []; window.KS_COPIED = []; window.KS_HEARD = 0;
  new MutationObserver(() => { const t = document.querySelector('.ks-toast'); if (t && t.textContent !== window.KS_TOASTS.at(-1)) window.KS_TOASTS.push(t.textContent); }).observe(document, { childList: true, subtree: true });
  try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch {}
  try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.KS_COPIED.push(t); } }, configurable: true }); } catch {}
  const tries = new Map();
  window.KS_SIM = (b) => {
    window.KS_HEARD++;
    if (!b) return null;
    const line = alt && b.alts?.length ? b.alts[0].answers[0] : b.answers[0], n = (tries.get(b.id) || 0) + 1;
    tries.set(b.id, n);
    return sim === 'mixed' && n === 1 ? '我不知道' : line;
  };
  window.KS_SAY = (a) => a;
}
// A phone-sized page at hash, its store ks.* as given (clear: false keeps what the last page left), the clock at now
// (a local time), the content at data (a gate build's dir)
async function open(hash, { store = {}, clear = true, now, data = '', sim = 'right', alt = false, view = VIEW } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: view[0], height: view[1], deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const where = hash || '(feed)';
  page.on('pageerror', (e) => problems.push(`${where}: ${e.message || e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|Failed to load resource/.test(m.text())) problems.push(`${where}: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon|fonts\.g/.test(r.url())) problems.push(`${where}: ${r.status()} ${r.url()}`); });
  await page.evaluateOnNewDocument((store, clear, now) => {
    window.KS_NOW = now; window.KS_FAST = true;
    try { if (clear) localStorage.clear(); for (const [k, v] of Object.entries(store)) localStorage.setItem('ks.' + k, JSON.stringify(v)); } catch {}
  }, store, clear, now ? at(now) : 0);
  await page.evaluateOnNewDocument(spies, sim, alt);
  await page.goto(`http://127.0.0.1:${port}/${data ? `?data=${data}` : ''}${hash ? `#${hash}` : ''}`, { waitUntil: 'networkidle0' });
  return page;
}
const until = async (page, fn, arg, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(60); } return false; };
// (a sheet over the card risen first: a busy page can lag behind its 0.25 s)
const shot = (page, name) => page.waitForFunction(() => !document.querySelector('.ks-sheet')?.getAnimations().some((a) => a.playState === 'running'), { timeout: 2000 }).catch(() => {}).then(() => page.evaluate(() => (window.KS_PAUSE = true))).then(() => page.screenshot({ path: path.join(OUT, `${name}.png`) })).finally(() => page.evaluate(() => (window.KS_PAUSE = false)).catch(() => {}));
// a tap where a thumb would land: a real click at the middle of the first one showing
const tap = async (page, sel) => { const xy = await page.evaluate((sel) => { const e = [...document.querySelectorAll(sel)].find((b) => b.getClientRects().length && !b.disabled); const r = e?.getBoundingClientRect(); return r && [r.left + r.width / 2, r.top + r.height / 2]; }, sel); if (xy) await page.mouse.click(...xy); return !!xy; };
const gate = async (page) => { await page.waitForSelector('button.ks-boot', { timeout: 15000 }); await page.click('button.ks-boot'); await page.waitForSelector('.ks-card', { timeout: 20000 }); await sleep(250); };
const mix = (page) => page.evaluate(() => ({ dealt: KS_MIX.dealt.map((d) => ({ kind: d.kind, id: d.id, rule: d.why?.rule })), active: KS_MIX.feed.active }));
const rows = (page) => page.evaluate(() => { dispatchEvent(new Event('pagehide')); try { return JSON.parse(localStorage.getItem('ks.log')).rows; } catch { return []; } });
const days = (page, fn, arg) => page.evaluate(async (fn, arg) => { const d = await import('/app/shared/days.js'); return d[fn](arg); }, fn, arg);
// play card i to its end as the player would: Start and the like, Continue, the mic, tiles (the line's words in order),
// typing, say-and-check
const play = (page, i, ms = 90000) => until(page, (i) => {
  const c = document.querySelectorAll('.ks-card')[i];
  if (!c || c.dataset.state === 'done') return !!c;
  if (window.KS_STOP) return true; // (stopped: a test leaves it part-way)
  if (window.KS_HOLD) return false; // (held while a test looks)
  const vis = (e) => e && e.offsetParent !== null && !e.disabled;
  const go = [...c.querySelectorAll('[data-test-go]')].find(vis), a = c.querySelector('.ks-ask');
  if (go) go.click();
  else if (a && !a.matches('.ks-shake, .ks-timeout')) {
    const next = a.querySelector('.ks-next'), mic = a.querySelector('.ks-mic'), input = a.querySelector('.ks-type input'), pool = [...a.querySelectorAll('.ks-tiles-pool .ks-tile')].filter((b) => !b.disabled);
    const word = (b) => { const x = b.cloneNode(true); x.querySelectorAll('rt, rp').forEach((r) => r.remove()); return x.textContent.trim(); };
    if (vis(next)) next.click();
    else if (vis(mic)) { if (!a.classList.contains('ks-listening')) mic.click(); }
    else if (a.querySelector('.ks-tiles-pool') && !a.dataset.built) { a.dataset.built = 1; for (const w of (a.querySelector('[data-words]')?.dataset.words || '').split('|')) pool.find((b) => word(b) === w && !b.disabled)?.click(); setTimeout(() => delete a.dataset.built, 400); }
    else if (input && a.dataset.answer) { input.value = a.dataset.answer; input.dispatchEvent(new Event('input', { bubbles: true })); input.form ? input.form.requestSubmit() : a.querySelector('.ks-type button')?.click(); }
    else if (a.querySelector('.ks-reveal')) a.querySelector('.ks-reveal').click();
    else if (a.querySelector('.ks-yes')) a.querySelector('.ks-yes').click();
    else if (!a.querySelector('.ks-tiles-pool')) a.querySelector('.ks-skip')?.click();
  }
  return false;
}, i, ms);
const swipe = async (page, i) => { await page.evaluate((i) => document.querySelectorAll('.ks-card')[i]?.scrollIntoView(), i); await until(page, (i) => KS_MIX.feed.active === i, i, 8000); await sleep(200); };
// the menu's sheet: its head line and its places' labels and metas; closed again
async function menu(page, name) {
  await tap(page, '.ks-menu');
  await page.waitForSelector('.ks-sheet', { timeout: 5000 });
  const m = await page.evaluate(() => ({ head: document.querySelector('.ks-menu-head')?.textContent || '', to: [...document.querySelectorAll('.ks-menu-to')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()) }));
  if (name) await shot(page, name);
  await page.keyboard.press('Escape');
  await sleep(150);
  return m;
}
// For You's cards played one after another (each to its end, then the next swiped in) until stop(dealt so far) or n
const visit = async (page, n, stop = () => false, each = async () => {}) => { for (let i = 0; i < n; i++) { await play(page, i); await each(page, i); const m = await mix(page); if (stop(m, i)) return m; await swipe(page, i + 1); } return mix(page); };

try {
  // ---------- the day: 4 am, and the streak a story keeps ----------
  if (want('day')) {
    let page = await open('', { store: played(), now: '2026-11-01T20:00' });
    await gate(page);
    await play(page, 0); await swipe(page, 1);
    const d1 = await menu(page, 'menu');
    expect('a story finished on the evening of 1 Nov keeps the day: the menu says "🔥 1-day streak", today\'s challenge #1', /🔥 1-day streak/.test(d1.head) && d1.to.some((t) => /#1\b/.test(t)), d1);
    await page.close();
    page = await open('', { clear: false, now: '2026-11-03T03:57' });
    await gate(page);
    const before = await menu(page);
    await play(page, 0); await swipe(page, 1);
    const d2 = await menu(page);
    expect('at 3:57 on 3 Nov it\'s still 2 Nov (the challenge #2), and a story then keeps it: "🔥 2-day streak"', before.to.some((t) => /#2\b/.test(t)) && /🔥 2-day streak/.test(d2.head) && d2.to.some((t) => /#2\b/.test(t)), { before, d2 });
    await page.close();
    page = await open('', { clear: false, now: '2026-11-03T04:03' });
    await gate(page);
    const d3a = await menu(page);
    await play(page, 0); await swipe(page, 1);
    const d3 = await menu(page);
    expect('at 4:03 it\'s 3 Nov (the challenge #3), the streak 2 till a story keeps the day, then 3', d3a.to.some((t) => /#3\b/.test(t)) && /🔥 2-day streak/.test(d3a.head) && /🔥 3-day streak/.test(d3.head), { d3a, d3 });
    await page.close();
  }

  // ---------- the streak: a freeze spent, said once; a gap that breaks it ----------
  if (want('streak')) {
    const kept = [...Array(7)].map((_, k) => `2026-10-${26 + k}`.replace('2026-10-32', '2026-11-01'));
    const streak = { v: 1, install: '2026-10-26', kept, freezes: 1, spent: [], best: 7, n: 7, on: { day: '2026-11-01', stories: 1, reviews: 0 }, played: 7, last: '2026-11-01', held: null, broke: null, ch: null };
    let page = await open('', { store: played({ streak }), now: '2026-11-03T20:00' });
    await gate(page);
    await play(page, 0); await swipe(page, 1); await sleep(300);
    const t = await page.evaluate(() => [...KS_TOASTS]), m = await menu(page, 'freeze-menu');
    expect('7 days kept earn a freeze; 2 Nov (a Monday) missed, a story on the 3rd: "Your streak held: a freeze covered Monday. …" as the next card comes, and the streak goes on (8)', t.some((x) => /^Your streak held: a freeze covered Monday\. A new one comes with every 7 days in a row\.$/.test(x)) && /🔥 8-day streak/.test(m.head), { t, m });
    await page.goto(`http://127.0.0.1:${port}/#stats`, { waitUntil: 'networkidle0' });
    await until(page, () => /streak/.test(document.querySelector('.ks-stats-streak')?.textContent || ''), undefined, 8000);
    const stats = await page.evaluate(() => document.querySelector('.ks-stats-streak')?.textContent || '');
    expect(`#stats says the menu's streak ("${stats}"): one streak in the app`, /^🔥 8-day streak · /.test(stats), stats);
    await page.close();
    page = await open('', { clear: false, now: '2026-11-03T21:00' });
    await gate(page); await play(page, 0); await swipe(page, 1); await sleep(300);
    const again = await page.evaluate(() => [...KS_TOASTS]);
    expect('…said once: the next visit says nothing of it', !again.some((x) => /streak held/.test(x)), again);
    await page.close();
    page = await open('', { clear: false, now: '2026-11-07T20:00' });
    await gate(page);
    const gone = await menu(page);
    await play(page, 0); await swipe(page, 1);
    const fresh = await menu(page);
    expect('4–6 Nov missed with no freeze left: the streak is broken (none in the menu), and a story starts a new one: "🔥 1-day streak"', !/streak/.test(gone.head) && /🔥 1-day streak/.test(fresh.head), { gone, fresh });
    await page.close();
    // a phone from before P5a: its log (1–7 Sep kept, the 8th missed, 9–12 Sep kept) replayed the first time, no ks.streak;
    // a freeze spent back then is never news, and the streak's long gone
    const sep = ['01', '02', '03', '04', '05', '06', '07', '09', '10', '11', '12'].map((d) => ({ at: T(`2026-09-${d}T20:00`), k: 'card', kind: 'scn', id: 'hotpot-spicy', state: 'done', out: 'win' }));
    page = await open('', { store: played({ log: { v: 1, rows: sep } }), now: '2026-11-02T19:00' });
    await gate(page); await sleep(1500);
    const old = await page.evaluate(() => [...KS_TOASTS]), om = await menu(page);
    expect('a phone from before P5a, its September log replayed: no "Your streak held" for a day weeks ago, no streak in the menu', !old.some((x) => /streak held/.test(x)) && !/streak/.test(om.head), { old, om });
    await page.close();
  }

  // ---------- 今日挑战: the same on every phone, another the next day, its squares and share text ----------
  // (a phone at a time: a page in the background has its timers held back, and its clock would run out)
  if (want('challenge')) {
    const card = (page) => page.evaluate(() => { const c = document.querySelector('.ks-card.ks-chal-card'); return c && { n: c.dataset.challenge, id: c.dataset.scn, lv: c.dataset.lv, mod: c.dataset.mod }; });
    const cards = {};
    // its modifier on screen first (panic's clock, whatever the rung; quiet's pinyin off), then played through: the end
    // screen's squares and share text, Share's copy, the record once the card's left, #challenge's page, the menu
    for (const [name, now, sim, sq] of [['a', '2026-11-04T20:00', 'right', '🟩'], ['b', '2026-11-04T20:30', 'mixed', '🟨'], ['c', '2026-11-05T20:00', 'right', null]]) {
      const p = await open('challenge', { now, sim });
      await gate(p);
      const ch = (cards[name] = await card(p));
      const pill = await p.evaluate(() => { const t = document.querySelector('.ks-chal-card .ks-chal').getBoundingClientRect(), b = document.querySelector('.ks-back, .ks-menu')?.getBoundingClientRect(); return { h: t.height, clear: !b || t.left >= b.right, right: t.right, text: document.querySelector('.ks-chal').textContent }; });
      await until(p, () => !!document.querySelector('.ks-chal-card .ks-ask'), undefined, 20000);
      await p.evaluate(() => (window.KS_PAUSE = true)); await until(p, () => document.querySelector('.ks-chal-m').getBoundingClientRect().width < 1, undefined, 6000); // (the line's clock held meanwhile)
      const folded = await p.evaluate(() => { window.KS_PAUSE = false; return { right: document.querySelector('.ks-chal-card .ks-chal').getBoundingClientRect().right, text: document.querySelector('.ks-chal').innerText }; });
      expect(`phone ${name}: the pill is one line beside the back button, its number and modifier said in full ("${pill.text}"), then folded to its icon`, pill.h <= 30 && pill.clear && /今日挑战\s#\d+ · \S/.test(pill.text) && folded.right < pill.right - 40, { pill, folded });
      if (ch?.mod === 'panic') {
        const clock = await p.evaluate(() => { const k = document.querySelector('.ks-chal-card .ks-ask .ks-ask-clock'); return { shown: !!k && !k.hidden, secs: +k?.querySelector('b').textContent }; });
        await shot(p, 'challenge-panic');
        expect('panic: the line has a clock, whatever the rung', clock.shown && clock.secs > 0, { ...clock, ch });
      } else if (name === 'a') {
        const py = await p.evaluate(() => [...document.querySelectorAll('.ks-chal-card rt')].filter((r) => r.offsetParent && getComputedStyle(r).visibility !== 'hidden' && r.textContent.trim()).length);
        await shot(p, 'challenge-quiet');
        expect('quiet: no pinyin shown over the story\'s lines', py === 0, py);
      }
      if (!sq) { await p.close(); continue; }
      const stage = DATA.byId[ch.id]?.stage;
      await play(p, 0);
      await until(p, () => !!document.querySelector('.ks-chal-res'), undefined, 5000);
      const end = await p.evaluate(async () => { const r = document.querySelector('.ks-chal-res'); await Promise.all(r?.getAnimations().map((a) => a.finished) || []); const b = r?.querySelector('.ks-chal-share').getBoundingClientRect(); return { text: r?.dataset.text, sq: r?.querySelector('.ks-chal-sq')?.textContent, tap: !!b && b.height >= 44 && b.bottom <= innerHeight && b.right <= innerWidth }; });
      await tap(p, '.ks-chal-share'); await sleep(200);
      const copied = await p.evaluate(() => [...KS_COPIED]), toast = await p.evaluate(() => [...KS_TOASTS]);
      await shot(p, `challenge-done-${name}`);
      const lines = new Set((await rows(p)).filter((r) => r.k === 'line' && String(r.id).startsWith(ch.id + '/') && !['practice', 'typeback', 'shadow', 'bonus'].includes(r.task) && r.res !== 'cancel').map((r) => r.id)).size;
      const want = `快说 #${ch.n}${stage ? ' ' + stage : ''} ${sq.repeat(lines)} ${lines}/${lines}`;
      expect(`phone ${name} (${sim}): its end screen's share text is exactly "${want}", and Share (on screen, a thumb's size) copies it (said in a toast)`, lines > 0 && end.tap && end.text === want && copied[0] === want && toast.some((t) => /Copied/.test(t)), { end, copied, want });
      // Back to the feed (the card left: its row logged), the menu says it's played, and its link opens the result
      await tap(p, '.ks-back'); await p.waitForSelector('.ks-menu', { timeout: 15000 }); await sleep(300);
      const m = await menu(p);
      expect(`phone ${name}: back on the feed, the menu says today's challenge is played, with its score`, m.to.some((t) => new RegExp(`#${ch.n}.*played · ${lines}/${lines}`).test(t)), m);
      await tap(p, '.ks-menu'); await p.waitForSelector('.ks-menu-wide'); await tap(p, '.ks-menu-wide');
      await p.waitForSelector('.ks-chal-text', { timeout: 15000 }).catch(() => {});
      const pg = await p.evaluate(() => ({ text: document.querySelector('.ks-chal-text')?.textContent, big: document.querySelector('.ks-chal-big')?.textContent }));
      const rec = DIST ? null : await days(p, 'result'); // (--dist: no module to ask; the menu's "played · k/m" was its result())
      if (name === 'a') await shot(p, 'challenge-page');
      expect(`phone ${name}: days.js's record and #challenge's page say the same`, (DIST || rec?.text === want) && pg.text === want, { rec, pg });
      await p.close();
    }
    // left part-way (a line answered, then Back): not played, no result to share; the menu plays it on, the line answered
    // keeping its square, and the result is the whole run's
    {
      const p = await open('challenge', { now: '2026-11-04T21:00' });
      await gate(p);
      const ch = await card(p), n0 = await p.evaluate(() => KS_COUNT.lines);
      const run = play(p, 0, 30000);
      await until(p, (n0) => KS_COUNT.lines > n0, n0, 30000);
      await p.evaluate(() => (window.KS_STOP = true)); await run;
      await tap(p, '.ks-back'); await p.waitForSelector('.ks-menu', { timeout: 15000 }); await sleep(300);
      const m = await menu(p), part = DIST ? null : await days(p, 'result');
      expect('the challenge left after a line: the menu doesn\'t say played, and there\'s no result yet', !m.to.some((t) => /played/.test(t)) && part == null, { m: m.to[0], part });
      await p.evaluate(() => (window.KS_STOP = false));
      await tap(p, '.ks-menu'); await p.waitForSelector('.ks-menu-wide'); await tap(p, '.ks-menu-wide');
      const again = await p.waitForSelector('.ks-chal-card', { timeout: 15000 }).then(() => true, () => false);
      expect('…and #challenge plays it on (its card, not a result page)', again && !(await p.$('.ks-chal-text')), again);
      if (again) {
        await play(p, 0);
        await until(p, () => !!document.querySelector('.ks-chal-res'), undefined, 8000);
        const end = await p.evaluate(() => document.querySelector('.ks-chal-res')?.dataset.text || '');
        const lines = new Set((await rows(p)).filter((r) => r.k === 'line' && String(r.id).startsWith(ch.id + '/') && !['practice', 'typeback', 'shadow', 'bonus'].includes(r.task) && r.res !== 'cancel').map((r) => r.id)).size;
        await tap(p, '.ks-back'); await p.waitForSelector('.ks-menu', { timeout: 15000 }); await sleep(300);
        const done = DIST ? null : await days(p, 'result'), m2 = await menu(p);
        expect(`played on to its end: the share text the whole run's (${lines} lines), on its end screen, in days.js's record and the menu`, lines > 1 && new RegExp(` ${lines}/${lines}$`).test(end) && (DIST || done?.text === end) && m2.to.some((t) => new RegExp(`played · ${lines}/${lines}`).test(t)), { end, done, lines, m2: m2.to[0] });
      }
      await p.close();
    }
    const { a: ca, b: cb, c: cc } = cards;
    expect('two fresh phones on 4 Nov: the same challenge (#4, the same story, level and modifier, quiet on even days)', ca && cb && ca.n === '4' && JSON.stringify(ca) === JSON.stringify(cb) && ca.mod === 'quiet', { ca, cb });
    expect('another on 5 Nov: #5, a different story, panic', cc && cc.n === '5' && cc.id !== ca.id && cc.mod === 'panic', { ca, cc });
  }

  // ---------- 今日挑战 in every format: the pill clear of its own top while it plays, the squares and Share in its end screen ----------
  if (want('challenge')) {
    // (a day at a time from the 4th, #challenge opened on each, till each format has come: read off the card, so --dist too)
    const by = {};
    for (let k = 0; k < 30 && Object.keys(by).length < 4; k++) {
      const day = new Date(Date.UTC(2026, 10, 4 + k)).toISOString().slice(0, 10), p = await open('challenge', { now: `${day}T20:00` });
      await gate(p);
      const f = DATA.byId[await p.evaluate(() => document.querySelector('.ks-chal-card')?.dataset.scn)]?.format;
      if (!f || by[f]) { await p.close(); continue; }
      by[f] = day;
      // while it plays (held a moment: the clock, a chase's run and the player), the pill folded: over none of the
      // format's own words (each text's own box, a range's, not its element's, where it's on top): a chase's lead, a
      // call's clock, a chat's name
      const run = play(p, 0);
      await until(p, () => document.querySelector('.ks-chal-card')?.dataset.state === 'playing', undefined, 20000); await sleep(700);
      await p.evaluate(() => (window.KS_HOLD = window.KS_PAUSE = true));
      await until(p, () => document.querySelector('.ks-chal-m').getBoundingClientRect().width < 1, undefined, 6000);
      const covers = await p.evaluate(() => {
        const t = document.querySelector('.ks-chal').getBoundingClientRect(), out = [], walk = document.createTreeWalker(document.querySelector('.ks-chal-card'), NodeFilter.SHOW_TEXT);
        for (let n; (n = walk.nextNode());) {
          const e = n.parentElement;
          if (!/[\p{L}\p{N}]/u.test(n.textContent) || e.closest('.ks-chal') || !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue; // (words: not a backdrop's emoji)
          const g = document.createRange(); g.selectNodeContents(n);
          // (where it shows: cut to every box above it that clips, so not a transcript scrolled away under a bar)
          for (const q of g.getClientRects()) {
            const r = { left: q.left, top: q.top, right: q.right, bottom: q.bottom };
            for (let a = e.parentElement; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const b = a.getBoundingClientRect(); r.left = Math.max(r.left, b.left); r.top = Math.max(r.top, b.top); r.right = Math.min(r.right, b.right); r.bottom = Math.min(r.bottom, b.bottom); } }
            if (Math.max(r.left, t.left) < Math.min(r.right, t.right) && Math.max(r.top, t.top) < Math.min(r.bottom, t.bottom)) { out.push(`${e.className || e.tagName}: ${n.textContent.trim().slice(0, 16)}`); break; }
          }
        }
        return out;
      });
      await shot(p, `challenge-${f}-play`);
      await p.evaluate(() => (window.KS_HOLD = window.KS_PAUSE = false));
      expect(`a ${f} as the challenge (${day}): while it plays, the pill folded covers none of the format's own words`, !covers.length, covers);
      await run;
      await until(p, () => !!document.querySelector('.ks-chal-res'), undefined, 8000);
      const r = await p.evaluate(async () => { const r = document.querySelector('.ks-chal-res'); if (!r) return null; await Promise.all(r.getAnimations().map((a) => a.finished)); r.scrollIntoView({ block: 'nearest' }); await new Promise((ok) => setTimeout(ok, 200)); const b = r.querySelector('.ks-chal-share').getBoundingClientRect(), at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { h: b.height, inside: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, top: at?.closest('.ks-chal-share') != null }; });
      await shot(p, `challenge-${f}`);
      expect(`a ${f} as the challenge (${day}): its squares and Share in the end screen, Share on screen and on top, a thumb's size`, r && r.inside && r.top && r.h >= 44, r);
      await p.close();
    }
    expect('the challenge came in every format within 30 days', Object.keys(by).length === 4, by);
  }

  // ---------- episodes a day at a time (Back Home, p4b-3) ----------
  if (want('episodes') && DIST) console.log('--   episodes: not with --dist (Back Home is the gate build p4b-3\'s; the packed page carries data/ inside it)');
  if (want('episodes') && !DIST) {
    const data = 'review/gate/p4b-3/data', later = (page, i) => i < 3 && page.evaluate(() => (window.KS_NOW += 4.5 * 60e3));
    let page = await open('', { data, store: played({ done: { 'hotpot-spicy': { stars: 2, outcome: 'win', at: T('2026-10-25T19:00') }, 'back-home-pickup': { stars: 3, outcome: 'win', at: T('2026-11-04T18:00') } } }), now: '2026-11-04T20:00' });
    await gate(page);
    const m = await visit(page, 10, (m, i) => m.dealt[i]?.kind === 'recap', later);
    const r = m.dealt.findIndex((d) => d.kind === 'recap'), teaser = r >= 0 && await page.evaluate((r) => document.querySelectorAll('.ks-card')[r].querySelector('.ks-recap-next .ks-recap-label')?.textContent, r);
    const eps = m.dealt.filter((d) => /^back-home-(cute|job)$/.test(d.id));
    if (r >= 0) { await sleep(900); await shot(page, 'episode-tomorrow'); }
    expect('Back Home\'s episode 1 finished today: no later episode dealt today, and the recap\'s teaser says "Episode 2 · tomorrow"', r > 0 && !eps.length && /Episode 2 · tomorrow/.test(teaser), { teaser, dealt: m.dealt.map((d) => `${d.kind}:${d.id}`) });
    await page.close();
    page = await open('lab', { data, clear: false, now: '2026-11-05T20:00' });
    await sleep(300);
    const out = await page.evaluate(async () => { const d = await import('/app/shared/days.js'), c = await import('/app/shared/content.js'); await new Promise((r) => setTimeout(r, 200)); return d.released(c.get().scenarios.find((s) => s.id === 'back-home-cute')); });
    expect('…and the next day it\'s out', out === true, out);
    await page.close();
    page = await open('play?id=back-home-pickup', { data, now: '2026-11-04T20:00' });
    await gate(page); await play(page, 0); await sleep(400);
    const note = await page.evaluate(() => document.querySelector('.ks-end-note')?.textContent || '');
    await shot(page, 'episode-end');
    expect('episode 1\'s end screen says "Episode 2 · tomorrow"', /Episode 2 · tomorrow/.test(note), note);
    await page.close();
  }

  // ---------- endings to collect ----------
  if (want('endings') && DIST) console.log('--   endings found: not with --dist (Back Home\'s three are the gate build p4b-3\'s); one ending saying nothing, below');
  if (want('endings') && !DIST) {
    const data = 'review/gate/p4b-3/data';
    let page = await open('play?id=back-home-cute', { data, now: '2026-11-04T20:00' });
    await gate(page); await play(page, 0); await sleep(400);
    const one = await page.evaluate(() => document.querySelector('.ks-end-note .ks-end-found')?.textContent || '');
    await shot(page, 'ending-1');
    await page.close();
    page = await open('play?id=back-home-cute', { data, clear: false, now: '2026-11-04T20:10', alt: true });
    await gate(page); await play(page, 0); await sleep(400);
    const two = await page.evaluate(() => document.querySelector('.ks-end-note .ks-end-found')?.textContent || '');
    await shot(page, 'ending-2');
    await page.close();
    page = await open('lab', { data, clear: false, now: '2026-11-04T20:20' });
    await sleep(500);
    const e = await page.evaluate(async () => { const d = await import('/app/shared/days.js'), c = await import('/app/shared/content.js'); return d.endings(c.get().scenarios.find((s) => s.id === 'back-home-cute')); });
    await page.close();
    expect(`a story with ${e.of} endings (Back Home's second: a win, the or-branch's win, a loss): "Ending 1 of ${e.of} found" on its end screen, with the nudge; the or-branch said, "Ending 2 of ${e.of} found"; the log has both`, e.of === 3 && one.startsWith(`Ending 1 of ${e.of} found · say something else`) && two.startsWith(`Ending 2 of ${e.of} found`) && e.found === 2, { one, two, e });
  }
  if (want('endings')) {
    const page = await open('play?id=farm-goose', { now: '2026-11-04T20:00' });
    await gate(page); await play(page, 0); await sleep(400);
    const none = await page.evaluate(() => !!document.querySelector('.ks-end-found'));
    expect('a story with one ending (the goose chase) says nothing of endings', !none, none);
    await page.close();
  }

  // ---------- quiet mode, "Can't talk now" ----------
  if (want('quiet')) {
    let page = await open('', { store: played(), now: '2026-11-04T20:00' });
    await page.evaluateOnNewDocument(() => {}); // (the spies are in)
    await gate(page);
    await until(page, () => document.querySelector('.ks-card .ks-ask')?.dataset.mode === 'speak', undefined, 20000);
    await shot(page, 'quiet-before');
    const heard0 = await page.evaluate(() => KS_HEARD);
    await tap(page, '.ks-ask .ks-hush');
    await sleep(300);
    const p0 = await page.evaluate(() => { const a = document.querySelector('.ks-card .ks-ask'); return { mode: a.dataset.mode, tabs: [...a.querySelectorAll('.ks-mode')].map((b) => b.dataset.m), pressed: a.querySelector('.ks-hush').getAttribute('aria-pressed'), toast: [...KS_TOASTS] }; });
    await shot(page, 'quiet-on');
    expect('🤫 on a speaking panel: that panel answers by tiles (never typed before), no speak or say-and-check tab, the button lit, a toast saying so', p0.mode === 'tiles' && p0.tabs.join() === 'tiles,type' && p0.pressed === 'true' && p0.toast.some((t) => /Quiet till this visit ends/.test(t)), p0);
    await page.evaluate(() => { window.KS_MODES = []; new MutationObserver(() => { for (const a of document.querySelectorAll('.ks-ask')) if (!a.dataset.seen) { a.dataset.seen = 1; KS_MODES.push({ mode: a.dataset.mode, mic: !!a.querySelector('.ks-mic'), tabs: [...a.querySelectorAll('.ks-mode')].map((b) => b.dataset.m).join() }); } }).observe(document, { childList: true, subtree: true }); });
    const m = await visit(page, 4);
    const q = await page.evaluate(() => ({ modes: [...KS_MODES], heard: KS_HEARD }));
    expect('…and the rest of the visit: every panel tiles or typed, no mic, the recogniser never asked to listen, no line to shadow dealt', q.modes.length > 0 && q.modes.every((x) => ['tiles', 'type'].includes(x.mode) && !x.mic && !/speak|self/.test(x.tabs)) && q.heard === heard0 && !m.dealt.some((d) => d.kind === 'shadow'), { q, heard0, dealt: m.dealt.map((d) => d.kind) });
    // tapped off: the mic again
    await until(page, (i) => !!document.querySelectorAll('.ks-card')[i]?.querySelector('.ks-ask'), m.active, 20000);
    await page.evaluate((i) => document.querySelectorAll('.ks-card')[i].setAttribute('data-test-on', ''), m.active); // (the card on screen: those gone by keep their panels)
    await until(page, () => { const r = document.querySelector('[data-test-on] .ks-ask .ks-hush')?.getBoundingClientRect(); return r && r.top >= 0 && r.bottom <= innerHeight; }, undefined, 5000); // (the swipe settled)
    await page.evaluate(() => (window.KS_PAUSE = true)); // (the line's clock held: a slow machine's tiles panel can time out under the tap)
    await tap(page, '[data-test-on] .ks-ask .ks-hush');
    await sleep(300);
    const off = await page.evaluate(() => { const a = document.querySelector('[data-test-on] .ks-ask'); window.KS_PAUSE = false; return { mode: a?.dataset.mode, pressed: a?.querySelector('.ks-hush')?.getAttribute('aria-pressed') }; });
    expect('tapped off: the panel goes back to the mic', off.mode === 'speak' && off.pressed === 'false', off);
    await page.close();
    // on from Settings; off when the visit has ended
    page = await open('', { store: played(), now: '2026-11-04T20:00' });
    await gate(page);
    await tap(page, '.ks-menu'); await page.waitForSelector('.ks-set-quiet');
    await page.evaluate(() => document.querySelector('.ks-set-quiet button[data-q=true]').click());
    await shot(page, 'quiet-settings');
    await page.keyboard.press('Escape');
    await until(page, () => !!document.querySelector('.ks-card .ks-ask'), undefined, 20000);
    const set = await page.evaluate(() => document.querySelector('.ks-card .ks-ask').dataset.mode);
    await page.close();
    page = await open('', { clear: false, now: '2026-11-04T20:45' });
    await gate(page);
    await until(page, () => !!document.querySelector('.ks-card .ks-ask'), undefined, 20000);
    // (talks again: quiet off and speaking offered; the panel's own way can be tiles, the ranker's rung for that line)
    const next = await page.evaluate(() => { const a = document.querySelector('.ks-card .ks-ask'); return { mode: a.dataset.mode, tabs: [...a.querySelectorAll('.ks-mode')].map((b) => b.dataset.m), mic: !!a.querySelector('.ks-mic'), hush: a.querySelector('.ks-hush')?.getAttribute('aria-pressed') }; });
    expect('on from Settings (Can\'t talk now: On), the next panel answers quietly; half an hour away, the next visit talks again', ['tiles', 'type'].includes(set) && (next.mode === 'speak' || next.tabs.includes('speak')) && next.hush === 'false', { set, next });
    await page.close();
  }

  // ---------- the countdown ----------
  if (want('countdown')) {
    let page = await open('', { store: played(), now: '2026-11-01T20:00' });
    await gate(page);
    await tap(page, '.ks-menu'); await page.waitForSelector('.ks-q-soon');
    await page.evaluate(() => document.querySelector('.ks-q-soon [data-s=lny]').scrollIntoView({ block: 'center' }));
    await tap(page, '.ks-q-soon [data-s=lny]'); await sleep(150);
    const lny = await page.evaluate(() => document.querySelector('.ks-q-soon .ks-soon-left')?.textContent);
    await shot(page, 'countdown-settings');
    await page.keyboard.press('Escape'); await sleep(150);
    const m = await menu(page);
    expect('Settings → Your Chinese: Lunar New Year with family, "Lunar New Year in 97 days · Sat 6 Feb"; the menu says it', lny === 'Lunar New Year in 97 days · Sat 6 Feb' && /🧧 Lunar New Year in 97 days/.test(m.head), { lny, m });
    await tap(page, '.ks-menu'); await page.waitForSelector('.ks-q-soon');
    const near = (sel) => page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), sel);
    await near('.ks-q-soon [data-s=trip]'); await tap(page, '.ks-q-soon [data-s=trip]'); await sleep(100);
    await near('.ks-q-soon [data-k="14"]'); await tap(page, '.ks-q-soon [data-k="14"]'); await sleep(100);
    const trip = await page.evaluate(() => ({ left: document.querySelector('.ks-q-soon .ks-soon-left')?.textContent, kept: JSON.parse(localStorage.getItem('ks.soon')) }));
    expect('a trip in two weeks: "Your trip in 14 days", kept as { what: trip, day }', /^Your trip in 14 days/.test(trip.left) && trip.kept?.what === 'trip' && trip.kept.day === '2026-11-15', trip);
    await page.close();
    // the recap: the days left, and the goal's lines solid
    const later = (page, i) => i < 3 && page.evaluate(() => (window.KS_NOW += 4.5 * 60e3));
    page = await open('', { store: played({ soon: { what: 'lny', day: '2027-02-06' } }), now: '2026-11-01T20:00' });
    await gate(page);
    const v = await visit(page, 10, (m, i) => m.dealt[i]?.kind === 'recap', later), r = v.dealt.findIndex((d) => d.kind === 'recap');
    const rec = r >= 0 && await page.evaluate((r) => ({ more: document.querySelectorAll('.ks-card')[r].dataset.more, soon: document.querySelectorAll('.ks-card')[r].querySelector('.ks-recap-m-soon')?.textContent }), r);
    if (r >= 0) { await sleep(900); await shot(page, 'recap'); }
    expect('the recap says "🧧 Lunar New Year in 97 days"', r > 0 && /🧧 Lunar New Year in 97 days/.test(rec.soon || ''), { rec, dealt: v.dealt.map((d) => d.kind) });
    await page.close();
    // past it: how did it go, once
    page = await open('', { store: played({ soon: { what: 'lny', day: '2027-02-06' } }), now: '2027-02-08T20:00' });
    await gate(page);
    await tap(page, '.ks-menu'); await page.waitForSelector('.ks-q-soon');
    const ask = await page.evaluate(() => document.querySelector('.ks-q-soon .ks-set-l')?.textContent);
    await page.evaluate(() => document.querySelector('.ks-q-soon').scrollIntoView({ block: 'center' }));
    await shot(page, 'countdown-went');
    await tap(page, '.ks-q-soon [data-w="❤️"]'); await sleep(150);
    const after = await page.evaluate(() => ({ q: document.querySelector('.ks-q-soon .ks-set-l')?.textContent, went: JSON.parse(localStorage.getItem('ks.went')), soon: localStorage.getItem('ks.soon') }));
    expect('past the day: "How did Lunar New Year go?", ❤️ kept as a count, then "Anything else coming up?"', ask === 'How did Lunar New Year go?' && after.went?.['❤️'] === 1 && after.soon == null && after.q === 'Anything else coming up?', { ask, after });
    await page.close();
  }

  // ---------- your Chinese's age ----------
  if (want('age')) {
    let page = await open('', { store: played({ arms: { v: 1, fmt: {}, topic: {}, hook: T('2026-10-25T19:00'), about: T('2026-10-25T19:05'), place: { n: 3, call: 0, chat: 0, bonus: 0, end: null } } }), now: '2026-11-04T20:00' });
    await gate(page);
    await tap(page, '.ks-menu'); await page.waitForSelector('.ks-you');
    const placing = await page.evaluate(() => !!document.querySelector('.ks-you-age'));
    await page.close();
    page = await open('', { store: played(), now: '2026-11-04T20:00' });
    await gate(page);
    await tap(page, '.ks-menu'); await page.waitForSelector('.ks-you');
    const a = await page.evaluate(async (dist) => ({ age: dist ? null : (await import('/app/shared/learner.js')).age(), text: document.querySelector('.ks-you-age p')?.textContent }), DIST);
    if (DIST) { const m = a.text?.match(/like an? (\d+)-year-old(?: and talk like an? (\d+)-year-old)?/); a.age = m && { listen: +m[1], say: +(m[2] || m[1]) }; } // (--dist: no module; the line's own numbers)
    await page.evaluate(() => document.querySelector('.ks-you-age')?.scrollIntoView({ block: 'center' }));
    await tap(page, '.ks-age-share'); await sleep(150);
    const copied = await page.evaluate(() => [...KS_COPIED]);
    await shot(page, 'age');
    const L = a.age?.listen, S = a.age?.say, an = (n) => (String(n).startsWith('8') || n === 11 || n === 18 ? `an ${n}` : `a ${n}`), text = L === S ? `You understand and talk like ${an(L)}-year-old` : `You understand like ${an(L)}-year-old and talk like ${an(S)}-year-old`;
    expect('while placing, no age; once it\'s over, Your Chinese says it from learner.age(), and Share copies 我的中文：听力N岁，口语M岁 · 快说', !placing && a.age && a.text === text && copied[0] === `我的中文：听力${L}岁，口语${S}岁 · 快说`, { placing, a, copied });
    await page.close();
  }

  // ---------- progress you can see: situations, the deck, then and now ----------
  if (want('progress')) {
    const ids = (s) => { const out = []; const walk = (st) => { for (const x of st || []) if (x.say) { out.push(x.say.pid || `${s.id}/${x.say.id}`); walk(x.say.ok); walk(x.say.fail); x.say.alts?.forEach((a) => walk(a.then)); } }; walk(s.steps); return [...new Set(out)]; };
    const t0 = T('2026-11-02T20:00'), srs = {};
    const put = (id, box, last) => (srs[id] = { box, seen: 4, best: 3, last, due: last + 3 * 864e5, hist: [['2026-11-02', 3]] });
    ids(DATA.byId['hotpot-spicy']).forEach((id) => put(id, 3, t0));
    ids(DATA.byId['airport-esim']).forEach((id, k) => put(id, 4, t0 + 3600e3 + k));
    ids(DATA.byId['locked-out']).forEach((id, k) => put(id, k ? 4 : 2, t0)); // one line not there yet
    ids(DATA.byId['taxi-airport']).forEach((id) => put(id, 5, t0)); // won at 1★
    const done = { 'hotpot-spicy': { stars: 3, outcome: 'win', at: t0 }, 'airport-esim': { stars: 2, outcome: 'win', at: t0 }, 'locked-out': { stars: 3, outcome: 'win', at: t0 }, 'taxi-airport': { stars: 1, outcome: 'win', at: t0 } };
    // a line missed on Monday, due now
    const first = ids(DATA.byId['hotpot-spicy'])[0];
    srs[first] = { ...srs[first], hist: [['2026-11-02', 1]] };
    let page = await open('situations', { store: played({ srs, done }), now: '2026-11-04T20:00' });
    await page.waitForSelector('.ks-sit-list');
    const sit = await page.evaluate(() => [...document.querySelectorAll('.ks-sit-stamp')].map((s) => s.dataset.id));
    await shot(page, 'situations');
    expect('#situations: the stories won at 2★ or more whose lines all reached box 3, newest first (airport-esim, hotpot-spicy); not one with a line at box 2, nor one won at 1★', sit.join() === 'airport-esim,hotpot-spicy', sit);
    await page.goto(`http://127.0.0.1:${port}/#phrases`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.ks-book-row');
    const deck = await page.evaluate(() => ({ head: document.querySelector('.ks-book-head')?.textContent, rows: [...document.querySelectorAll('.ks-book-row')].map((r) => [r.dataset.family, +r.dataset.box, r.querySelectorAll('.ks-ring6 circle.ks-on').length]) }));
    const fam = (id) => DATA.phrases.find((p) => p.id === id)?.family || id.replace(/@\d+$/, ''), fams = new Map();
    for (const [id, p] of Object.entries(srs)) if (DATA.phrases.some((x) => x.id === id)) fams.set(fam(id), Math.max(fams.get(fam(id)) ?? 0, p.box));
    const solid = [...fams.values()].filter((b) => b >= 4).length;
    await shot(page, 'phrases');
    expect(`#phrases heads "${fams.size} phrases · ${solid} solid" and rings each phrase's box`, deck.head === `${fams.size} phrases · ${solid} solid` && deck.rows.length === fams.size && deck.rows.every(([f, b, on]) => fams.get(f) === b && on === b), deck);
    await page.close();
    page = await open('play?id=hotpot-spicy', { store: played({ srs, done }), now: '2026-11-04T20:00' });
    // every stamp as it comes (a verdict goes by quickly), each once
    // (the first held on screen as it comes, for its picture: a thumb on its verdict, as a player reading it)
    await page.evaluate(() => { const seen = new WeakSet(); window.KS_THENS = []; new MutationObserver(() => { for (const t of document.querySelectorAll('.ks-then')) if (!seen.has(t)) { seen.add(t); KS_THENS.push(t.textContent); if (KS_THENS.length === 1) { window.KS_HOLD = true; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } } }).observe(document, { childList: true, subtree: true }); });
    await gate(page);
    const run = play(page, 0);
    if (await until(page, () => KS_THENS.length > 0, undefined, 60000)) { await sleep(600); await shot(page, 'then-and-now'); }
    await page.evaluate(() => (window.KS_HOLD = false));
    await run;
    const stamp = await page.evaluate(() => [...KS_THENS]);
    await tap(page, '.ks-scene-again');
    await play(page, 0);
    const twice = await page.evaluate(() => KS_THENS.slice(1));
    expect('a line missed on Monday and said at 3★ on Wednesday: "Monday: missed. Today: nailed." on its verdict, once (not again as the story\'s played again)', stamp.join('|') === 'Monday: missed. Today: nailed.' && !twice.length, { stamp, twice });
    await page.close();
    // and in For You, where a phrase from an earlier day mostly comes back: a flash crisis of it, due (hotpot-spicy's
    // lines at box 2, missed yesterday). The challenge it deals on the way is aimed where #challenge aims it (τ 0.92)
    const due = {};
    for (const id of ids(DATA.byId['hotpot-spicy']).filter((id) => !/@/.test(id))) due[id] = { box: 2, due: T('2026-11-04T18:00'), seen: 3, best: 3, last: T('2026-11-03T20:00'), hist: [['2026-11-03', 1]] };
    // (from rung 1: the stamp is for a line said at 3★, and free help, which a run's rung can give, caps a line at 2★)
    page = await open('', { store: played({ srs: due, assist: 1 }), now: '2026-11-04T20:00' });
    await page.evaluate(() => { const seen = new WeakSet(); window.KS_THENS = []; new MutationObserver(() => { for (const t of document.querySelectorAll('.ks-then')) if (!seen.has(t)) { seen.add(t); KS_THENS.push(t.textContent); } }).observe(document, { childList: true, subtree: true }); });
    await gate(page);
    const fy = await visit(page, 8, (m, i) => m.dealt.slice(0, i + 1).some((d) => d.kind === 'review' || d.kind === 'run'));
    const flash = await page.evaluate(() => [...KS_THENS]), ci = fy.dealt.findIndex((d) => d.kind === 'challenge');
    const feedTau = ci < 0 ? null : await page.evaluate((i) => ({ why: KS_MIX.dealt[i].why?.tau, card: document.querySelectorAll('.ks-card')[i]?.dataset.tau }), ci);
    expect('For You on Wednesday: a due flash crisis of a line missed yesterday, said at 3★, is stamped "Yesterday: missed. Today: nailed."', fy.dealt.some((d) => d.kind === 'review' || d.kind === 'run') && flash.includes('Yesterday: missed. Today: nailed.'), { dealt: fy.dealt.map((d) => `${d.kind}:${d.id}:${d.rule}`), flash });
    await page.close();
    if (feedTau) {
      page = await open('challenge', { store: played({ srs: due }), now: '2026-11-04T20:00' });
      await gate(page);
      const menuTau = await page.evaluate(() => document.querySelector('.ks-chal-card')?.dataset.tau);
      expect(`today's challenge from the menu aimed as the feed's is (τ ${feedTau.why})`, feedTau.why === 0.92 && feedTau.card === '0.92' && menuTau === '0.92', { feedTau, menuTau });
      await page.close();
    } else expect('the feed dealt the day\'s challenge on the way (to compare its τ with the menu\'s)', false, fy.dealt);
  }

  // ---------- the about card, later: a phone that played before P3 ----------
  if (want('about')) {
    const srs = { 'hotpot-spicy/order': { box: 2, seen: 2, best: 2, last: T('2026-10-20T19:00'), due: T('2026-10-21T19:00') } };
    const page = await open('', { store: { srs, done: { 'hotpot-spicy': { stars: 2, outcome: 'win', at: T('2026-10-20T19:00') }, 'farm-goose': { stars: 2, outcome: 'win', at: T('2026-10-20T19:10') } } }, now: '2026-11-04T20:00' });
    await gate(page);
    const m = await visit(page, 8, (m, i) => m.dealt[i]?.kind === 'about');
    const i = m.dealt.findIndex((d) => d.kind === 'about'), log = await rows(page);
    const before = i > 0 && log.filter((r) => r.k === 'card').at(-1);
    const card = i >= 0 && await page.evaluate((i) => { const c = document.querySelectorAll('.ks-card')[i]; return { ask: c.dataset.ask, soon: !!c.querySelector('.ks-q-soon'), fits: c.querySelector('.ks-about-go').getBoundingClientRect().bottom <= innerHeight }; }, i);
    if (i >= 0) await shot(page, 'about-later');
    // more than fits a short phone: a page at a time, Next › then the rest (Anything coming up?) and Done
    let two = null;
    if (i >= 0 && await page.evaluate((i) => document.querySelectorAll('.ks-card')[i].dataset.page === '1', i)) {
      await tap(page, '.ks-about-go'); await sleep(200);
      two = await page.evaluate((i) => { const c = document.querySelectorAll('.ks-card')[i], q = c.querySelector('.ks-q-soon'), go = c.querySelector('.ks-about-go').getBoundingClientRect(); return { page: c.dataset.page, soon: !!q && !q.hidden && q.getBoundingClientRect().bottom <= go.top, go: go.bottom <= innerHeight, label: c.querySelector('.ks-about-go').textContent }; }, i);
      await shot(page, 'about-later-2');
    }
    expect('…on a short phone, a page at a time: Next ›, then "Anything coming up?" above Done, nothing off screen', !card.fits ? false : two == null || (two.page === '2' && two.soon && two.go && /Done/.test(two.label)), { card, two });
    expect('a phone that played before P3: the about card on a later card (not first, not after a loss), asking "Anything coming up?" too', i > 0 && before?.out !== 'lose' && card.soon && /soon/.test(card.ask), { i, before, card, dealt: m.dealt.map((d) => `${d.kind}:${d.rule}`) });
    await page.close();
  }

  // ---------- the other phone: 390×664 (Safari's visible viewport on a 6.1" iPhone) ----------
  if (want('phones')) {
    const V = [390, 664], wide = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    let page = await open('challenge', { now: '2026-11-04T20:00', view: V });
    await gate(page); await play(page, 0);
    await until(page, () => !!document.querySelector('.ks-chal-res'), undefined, 8000);
    const r = await page.evaluate(async () => { const r = document.querySelector('.ks-chal-res'); if (!r) return null; await Promise.all(r.getAnimations().map((a) => a.finished)); const b = r.querySelector('.ks-chal-share').getBoundingClientRect(), at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { h: b.height, inside: b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth, top: at?.closest('.ks-chal-share') != null }; });
    const w1 = await wide(page);
    await shot(page, 'challenge-390');
    await page.close();
    page = await open('', { store: played({ soon: { what: 'lny', day: '2027-02-06' } }), now: '2026-11-01T20:00', view: V });
    await gate(page);
    const m = await menu(page, 'menu-390'), w2 = await wide(page);
    await page.close();
    page = await open('situations', { store: played({ done: { 'hotpot-spicy': { stars: 3, outcome: 'win', at: T('2026-10-25T19:00') } } }), now: '2026-11-04T20:00', view: V });
    await page.waitForSelector('.ks-sit-list, .ks-sit-near, .ks-sit-none', { timeout: 15000 }).catch(() => {});
    const w3 = await wide(page);
    await shot(page, 'situations-390');
    await page.close();
    expect('at 390×664: the challenge\'s Share on screen, on top and a thumb\'s size; the menu\'s streak and countdown; nothing scrolls sideways (the challenge, the menu, #situations)', r && r.inside && r.top && r.h >= 44 && /🧧 Lunar New Year in 97 days/.test(m.head) && !w1 && !w2 && !w3, { r, head: m.head, wide: [w1, w2, w3] });
  }
} finally { await browser.close(); server.kill(); }
console.log(problems.length ? `${problems.length} problems:\n  ${[...new Set(problems)].join('\n  ')}` : 'all good');
process.exit(problems.length ? 1 : 0);

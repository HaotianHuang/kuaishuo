#!/usr/bin/env node
// tools/assist-wire-check.mjs: the assist ladder (app/shared/assist.js) reaching the screen, through feed.js's
// assisted() and the formats. Each case forces the learner model (ks.model: a strong or a weak player, and sure of it)
// and the rung the last card started at (ks.assist), so the card takes the rung the case is about; then it opens the
// Scenes feed's first story (the airport) or the Calls feed's first call (the courier) and checks what the first
// answer panel shows the moment it opens, before its clock moves, and what its line row logs:
//   A0  no pinyin, no English, the clock ×0.7; a caller who waits ×0.6 and nudges once before hanging up
//   A1  pinyin by the learner model (none for a strong reader, all for one it knows nothing of), the clock ×0.85
//   A3  a caller who waits ×1.5, the mission spelt out, a peek whose frame is free (the reply can still earn 3★)
//   A4  no clock, the frame up from the start and free, the whole mission; a caller who never hangs up (a long silence
//       is a skip instead) and a free peek
//   A5  the model line played first, and their lines slower at the same pitch (real sound, through a spy on Web
//       Audio); the whole answer up, free; a call's subtitles on; in a chat the echo waits for their voices queued
//   A2  v1 exactly: the same panel as with Settings pinned to v1's pinyin, English and clock, and v1's own numbers
//   a pinned setting wins over the rung: at A0 pinyin Always, English Show and No clock; a caller at Normal pressure;
//       No clock at A4/A5 (a silent line waits, no give-up)
//   a call at A4: every peek free; a chase: the chaser ×1.4 at A0, ×0.4 at A5, a pinned Relaxed's ×0.5, and a miss
//       read off the screen logged as the answer shown (paid); a word to write traced twice at A5, once at A2
// and the Your Chinese section of Settings at 375 px: six skill bars, the levels, the persona question (which sets
// learner.persona). Screenshots: review/assist-wire/.
// node tools/assist-wire-check.mjs [--dist]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), DIST = process.argv.includes('--dist'), OUT = path.join(ROOT, 'review', 'assist-wire');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content.json'), 'utf8'));
const { LADDER } = await import(path.join(ROOT, 'app/shared/assist.js')), { BETA } = await import(path.join(ROOT, 'app/shared/learner.js'));
const levels = await import(path.join(ROOT, 'app/shared/levels.js'));
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
const near = (a, b, e = 0.02) => a != null && b != null && Math.abs(a - b) <= e;

// The stories the feeds open on, and what their first lines are
const han = (s) => String(s).replace(/[^一-鿿]/g, '');
const scene = data.scenarios.find((s) => s.id === 'airport-esim'), call = data.scenarios.find((s) => s.id === 'courier-crabs');
const sayOf = (s) => s.steps.find((st) => st.say).say, nosignal = sayOf(scene), hello = sayOf(call);
const sceneClock = nosignal.time ?? levels.clock(scene.level), nudges = (hello.silence || call.call.silence).map((st) => han(st.zh));
const narr = scene.steps.find((st) => 'narr' in st && st.a), uncle = scene.steps.find((st) => st.who);
// the first of the caller's lines played whole after your first reply (a bad line plays in bursts), as the call goes
const whole = (steps) => { for (const st of steps) { if (st.who && st.a && st.signal !== 'bad') return st; const o = st.say && whole(st.say.ok || []); if (o) return o; } };
const courier = whole(call.steps.slice(call.steps.findIndex((st) => st.say) + 1));

// A learner model as ks.model keeps it: x [g, δL … δW], each with variance v, after n lines (any: the model then knows)
const model = (x, v, persona, n) => ({ v: 1, persona, x, C: x.map((_, i) => x.map((_, j) => (i === j ? v : 0))), beta: [...BETA], items: {}, at: Date.now(), n, k: 10 });
// a strong player and a weak one, the model sure of both; and someone who hears far more than they read or write, 12
// lines in and not yet sure of it (for the Your Chinese panel)
const STRONG = model([3, 0, 0, 0, 0, 0, 0], 0.01, 'mandarin', 80), WEAK = model([-3, 0, 0, 0, 0, 0, 0], 0.01, 'new', 80);
const MID = model([0, 0, 0, 0, 0, 0, 0], 0.01, 'studied', 80); // the courier's call stays at A4 for this one
const HEARS = model([0.3, 1.2, 0.2, 0.3, -0.2, -0.9, -1.4], 0.2, null, 12);
const V1 = { 'set.pinyin': 'new', 'set.english': 'tap', 'set.pressure': 'normal' }; // v1's own settings, pinned

// A phone-sized page on a version. store: ks.* to start with; say: the simulated player answers right (else silent;
// 'mixed': wrong at each line's first go, then right); fast: KS_FAST (off where real sound is listened for). The first
// answer panel is read the moment it opens (and held: KS_PAUSE, until release()); every clip Web Audio starts is noted
// (where in its pack, how long, its buffer's length, and when it ended).
async function open(hash, { store = {}, say = true, fast = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 664, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => problems.push(`${hash}: ${e.message || e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) problems.push(`${hash}: ${m.text()}`); });
  await page.evaluateOnNewDocument((store, say, fast) => {
    window.KS_FAST = fast;
    try { localStorage.clear(); for (const [k, v] of Object.entries(store)) localStorage.setItem('ks.' + k, JSON.stringify(v)); } catch {}
    const tries = {}, line = (key, a) => ((tries[key] = (tries[key] || 0) + 1) === 1 && say === 'mixed' ? '我不知道你在说什么' : a);
    window.KS_SIM = (beat) => (beat && say ? line(beat.id, beat.answers[0]) : null);
    window.KS_SAY = (a) => (say ? line(a, a) : null);
    window.KS_STARTS = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, dur) { if (dur != null) { const s = { t: performance.now(), offset, dur, buf: this.buffer?.duration }; KS_STARTS.push(s); this.addEventListener('ended', () => (s.end = performance.now())); } return start.apply(this, arguments); };
    new MutationObserver((rs, mo) => {
      const p = document.querySelector('.ks-card .ks-ask');
      if (!p) return;
      mo.disconnect(); window.KS_PAUSE = true;
      const card = p.closest('.ks-card'), q = (s) => p.querySelector(s), clock = q('.ks-ask-clock'), hint = q('.ks-hint'), m = q('.ks-ask-mission');
      // the other characters' lines on screen (a call's are hidden until a peek, unless its subtitles are on)
      const lines = [...card.querySelectorAll('.ks-scene-sub:not(.ks-scene-you):not(.ks-scene-narr), .ks-call-line:not(.ks-call-mine)')];
      const peek = card.querySelector('.ks-call-peek'), subs = card.querySelector('.ks-call-subs');
      window.KS_FIRST = {
        t: performance.now(), A: card.dataset.assist, clock: clock.hidden ? 0 : +clock.querySelector('b').textContent,
        cue: m.classList.contains('ks-ask-cue'), mission: m.textContent, frame: !!q('.ks-frame'), full: !!q('.ks-help-full'), hint: hint.hidden ? null : hint.textContent.trim(),
        rt: lines.reduce((n, l) => n + l.querySelectorAll('rt').length, 0), en: lines.map((l) => l.querySelector('.ks-en')?.className ?? null),
        titlePy: card.querySelector('.ks-scene-title-py')?.hidden ?? null,
        patience: card.querySelector('.ks-call-wait')?.dataset.secs ?? null, relaxed: card.classList.contains('ks-call--relaxed'),
        peek: peek ? { text: peek.textContent.trim(), disabled: peek.disabled } : null, subs: subs ? subs.classList.contains('ks-call-subs--open') && getComputedStyle(subs.querySelector('.ks-call-line[data-peek=hide] .ks-call-txt') || subs).display !== 'none' : null,
      };
    }).observe(document, { childList: true, subtree: true });
  }, store, say, fast);
  await page.goto(`http://127.0.0.1:${port}/#${hash}`, { waitUntil: 'networkidle0' });
  await page.click('button.ks-boot').catch(() => {});
  if (hash) await page.waitForSelector('.ks-card');
  return page;
}
const until = async (page, fn, arg, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(50); } return false; };
// tap whatever starts the card (Play, Answer), until the first panel has been read
const first = async (page, ms = 40000) => { await until(page, () => { if (window.KS_FIRST) return true; [...document.querySelectorAll('.ks-card')[0].querySelectorAll('[data-test-go]')].find((b) => b.offsetParent)?.click(); return false; }, undefined, ms); return page.evaluate(() => window.KS_FIRST); };
const release = (page) => page.evaluate(() => (window.KS_PAUSE = false));
// answer the panel on screen by voice (KS_SIM says the line) and move on, until stop (page code, with arg) says so
const answer = (page, stop, arg, ms = 30000) => until(page, ([stop, arg]) => {
  if ((0, eval)(`(${stop})`)(arg)) return true;
  const a = document.querySelectorAll('.ks-card')[0].querySelector('.ks-ask'), mic = a?.querySelector('.ks-mic'), next = a?.querySelector('.ks-next');
  if (next) next.click(); else if (mic && !a.classList.contains('ks-listening')) mic.click();
  return false;
}, [String(stop), arg], ms);
const said = () => window.KS_COUNT.lines > 0; // a line row logged (the verdict's Continue, or its own moment, settled it)
const rows = (page) => page.evaluate(() => { dispatchEvent(new Event('pagehide')); try { return JSON.parse(localStorage.getItem('ks.log')).rows.filter((r) => r.k === 'line'); } catch { return []; } });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
// the call's end sheet: the caller's lines it played (its transcript), and whether they hung up
const callEnd = (page) => page.evaluate(() => ({ lines: [...document.querySelectorAll('.ks-call-tx-row:not(.ks-call-tx-you)')].map((r) => [...r.querySelectorAll('.ks-zh .ks-w')].map((w) => w.dataset.w).join('')), hungUp: document.querySelector('.ks-card').classList.contains('ks-call--over') && /挂断/.test(document.querySelector('.ks-call-kind')?.textContent || '') }));
const nudged = (lines) => nudges.filter((z) => lines.some((l) => han(l) === z)).length;

try {
  // ---------- A2: v1 exactly ----------
  {
    const page = await open('scene'), a2 = await first(page);
    await shot(page, 'scene-A2'); await release(page);
    await answer(page, said);
    const row = (await rows(page))[0];
    await page.close();
    const v1page = await open('scene', { store: V1 }), v1 = await first(v1page);
    await v1page.close();
    const same = (({ t, A, ...f }) => JSON.stringify(f))(a2) === (({ t, A, ...f }) => JSON.stringify(f))(v1);
    expect('A2: a new player starts at A2', a2.A === '2', a2);
    expect('A2: the scene panel is the one with v1 settings pinned', same, { a2, v1 });
    expect('A2: v1\'s clock, the cue, no help up, Hint −1★, pinyin over new words, English a tap away', a2.clock === sceneClock && a2.cue && a2.mission === nosignal.cue && !a2.frame && !a2.full && /−1★/.test(a2.hint) && a2.rt > 0 && a2.en.every((c) => /ks-en-tap/.test(c)) && a2.titlePy === false, a2);
    expect('A2: the line row says its rung, and no free help', row?.assist === 2 && !row.free, row);
  }
  {
    const page = await open('call', { say: false }), a2 = await first(page);
    await release(page);
    await until(page, () => document.querySelector('.ks-card').dataset.state === 'done', undefined, 30000);
    const end = await callEnd(page);
    await page.close();
    const v1page = await open('call', { store: V1, say: false }), v1 = await first(v1page);
    await release(v1page);
    await until(v1page, () => document.querySelector('.ks-card').dataset.state === 'done', undefined, 30000);
    const v1end = await callEnd(v1page);
    await v1page.close();
    const same = (({ t, A, ...f }) => JSON.stringify(f))(a2) === (({ t, A, ...f }) => JSON.stringify(f))(v1);
    expect('A2: the call\'s first turn is the one with v1 settings pinned', same, { a2, v1 });
    expect('A2: v1\'s caller: their patience, a peek for a star, the subtitles hidden', +a2.patience === hello.time && !a2.relaxed && /−1★/.test(a2.peek?.text) && !a2.subs, a2);
    expect('A2: silent, they nudge twice (as v1), then hang up', nudged(end.lines) === Math.min(2, nudges.length) && nudged(v1end.lines) === nudged(end.lines) && end.hungUp, { end, v1end });
  }

  // ---------- A0: a strong player ----------
  {
    const page = await open('scene', { store: { model: STRONG, assist: 1 } }), a0 = await first(page);
    await shot(page, 'scene-A0'); await page.close();
    expect('A0: a strong player\'s scene starts at A0', a0.A === '0', a0);
    expect('A0: no pinyin, no English, the clock ×0.7', a0.rt === 0 && a0.titlePy === true && a0.en.length && a0.en.every((c) => /ks-en-none/.test(c)) && a0.clock === Math.round(sceneClock * LADDER[0].clock), a0);
    const pinned = await open('scene', { store: { model: STRONG, assist: 1, 'set.pinyin': 'all', 'set.english': 'show', 'set.pressure': 'relaxed' } }), p0 = await first(pinned);
    await shot(pinned, 'scene-A0-pinned'); await pinned.close();
    expect('A0: pinned Settings win (pinyin Always, English Show, No clock)', p0.A === '0' && p0.rt > 0 && p0.titlePy === false && p0.en.every((c) => c === 'ks-en') && p0.clock === 0, p0);
  }
  {
    const page = await open('call', { store: { model: STRONG, assist: 1 }, say: false }), a0 = await first(page);
    await release(page);
    await until(page, () => document.querySelector('.ks-card').dataset.state === 'done', undefined, 30000);
    const end = await callEnd(page);
    await page.close();
    expect('A0: the caller waits ×0.6, nudges once, then hangs up', a0.A === '0' && near(+a0.patience, hello.time * LADDER[0].patience) && nudged(end.lines) === Math.min(1, nudges.length) && end.hungUp, { a0, end });
    const pinned = await open('call', { store: { model: STRONG, assist: 1, 'set.pressure': 'normal' }, say: false }), p0 = await first(pinned);
    await release(pinned);
    await until(pinned, () => document.querySelector('.ks-card').dataset.state === 'done', undefined, 30000);
    const pend = await callEnd(pinned);
    await pinned.close();
    expect('A0: a pinned Normal pressure keeps v1\'s caller (patience, two nudges)', p0.A === '0' && +p0.patience === hello.time && nudged(pend.lines) === Math.min(2, nudges.length), { p0, pend });
  }

  // ---------- A1: pinyin by the learner model ----------
  // (a strong player a step on from A2; a model that knows nothing yet stays at the rung it's given)
  {
    const page = await open('scene', { store: { model: STRONG, assist: 2 } }), a1 = await first(page);
    await page.close();
    const fresh = await open('scene', { store: { assist: 1 } }), f1 = await first(fresh);
    await fresh.close();
    expect('A1: a strong reader sees no pinyin, someone the model knows nothing of sees it; English a tap away; the clock ×0.85', a1.A === '1' && f1.A === '1' && a1.rt === 0 && f1.rt > 0 && [...a1.en, ...f1.en].every((c) => /ks-en-tap/.test(c)) && a1.clock === Math.round(sceneClock * LADDER[1].clock), { a1, f1 });
  }

  // ---------- A3: the call's free peek ----------
  {
    const page = await open('call', { store: { assist: 3 } }), a3 = await first(page);
    // peek on the first turn, then answer: the frame it opened was free, so the reply can still earn three stars
    await page.evaluate(() => document.querySelector('.ks-call-peek').click());
    const after = await page.evaluate(() => ({ text: document.querySelector('.ks-call-peek').textContent.trim(), hint: document.querySelector('.ks-ask .ks-hint')?.textContent.trim() }));
    await release(page);
    await answer(page, said);
    const row = (await rows(page))[0], next = await page.evaluate(() => document.querySelector('.ks-call-peek').textContent.trim());
    await page.close();
    expect('A3: the caller\'s patience ×1.5, the mission spelt out, a free peek', a3.A === '3' && near(+a3.patience, hello.time * LADDER[3].patience) && !a3.cue && /free/.test(a3.peek?.text), a3);
    expect('A3: the peek\'s frame is free (Hint next costs −2★, the reply 3★), the next peek costs a star', /−2★/.test(after.hint) && row?.free === 1 && row.hint === 1 && row.stars === 3 && /−1★/.test(next), { after, row, next });
  }

  // ---------- A4: a weak player, a step on from A3 ----------
  {
    const page = await open('scene', { store: { model: WEAK, assist: 3 } }), a4 = await first(page);
    await shot(page, 'scene-A4'); await release(page);
    await answer(page, said);
    const row = (await rows(page))[0];
    await page.close();
    expect('A4: a weak player\'s scene starts at A4', a4.A === '4', a4);
    expect('A4: no clock, the frame up and free (Hint now costs the whole answer\'s −2★), the mission spelt out', a4.clock === 0 && a4.frame && !a4.full && /−2★/.test(a4.hint) && !a4.cue && a4.mission === nosignal.en, a4);
    expect('A4: pinyin over every word, English shown', a4.rt > 0 && a4.en.every((c) => c === 'ks-en'), a4);
    expect('A4: the line row says A4, and the frame was free', row?.assist === 4 && row.free === 1 && row.hint === 1, row);
  }
  {
    const page = await open('call', { store: { model: WEAK, assist: 3 }, say: false }), a4 = await first(page);
    await shot(page, 'call-A4'); await release(page);
    await until(page, () => (JSON.parse(localStorage.getItem('ks.log') || '{"rows":[]}').rows.some((r) => r.k === 'line')) || document.querySelector('.ks-card').dataset.state === 'done', undefined, 30000);
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    const row = (await rows(page))[0], end = await callEnd(page);
    await page.close();
    expect('A4: the caller never hangs up (no patience bar), the peek is free, the frame up', a4.A === '4' && a4.relaxed && /free/.test(a4.peek?.text) && !/★/.test(a4.peek?.text) && a4.frame, a4);
    expect('A4: a long silence on the call is a skip, not a hang-up', row?.res === 'skip' && row.assist === 4 && !end.hungUp, { row, end });
  }

  // ---------- A5: real sound ----------
  {
    const page = await open('call', { store: { model: WEAK, assist: 5 }, fast: false }), a5 = await first(page, 20000);
    await shot(page, 'call-A5');
    // the model line first: a clip from the beat's own place in the pack, its own length, as the panel opened
    await until(page, (a) => KS_STARTS.some((s) => Math.abs(s.offset - a[0]) < 0.02 && Math.abs(s.dur - a[1]) < 0.02), hello.a, 8000);
    const echo = await page.evaluate((a) => KS_STARTS.find((s) => Math.abs(s.offset - a[0]) < 0.02 && Math.abs(s.dur - a[1]) < 0.02), hello.a);
    await release(page);
    // then their next line, stretched: a buffer of its own, length / rate long, from its start
    const want = courier.a[1] / LADDER[5].rate;
    await answer(page, (want) => KS_STARTS.some((s) => s.offset === 0 && Math.abs(s.buf - want) < 0.05), want, 45000);
    const slow = await page.evaluate((want) => KS_STARTS.find((s) => s.offset === 0 && Math.abs(s.buf - want) < 0.05), want);
    await page.close();
    expect('A5: the call\'s subtitles are on, nothing to peek at, the whole answer up', a5.A === '5' && a5.subs && a5.peek?.disabled && a5.full && a5.relaxed, a5);
    expect('A5: the model line plays first, as the panel opens', !!echo && echo.t >= a5.t - 50, { echo, panel: a5.t });
    expect('A5: the caller\'s lines are slower, at the same pitch (stretched: length / 0.85)', !!slow, { want, slow });
  }
  {
    const page = await open('scene', { store: { model: WEAK, assist: 5 }, fast: false }), a5 = await first(page, 40000);
    await shot(page, 'scene-A5');
    await until(page, (a) => KS_STARTS.some((s) => Math.abs(s.offset - a[0]) < 0.02 && Math.abs(s.dur - a[1]) < 0.02), nosignal.a, 8000);
    const starts = await page.evaluate(() => KS_STARTS);
    await page.close();
    const echo = starts.find((s) => near(s.offset, nosignal.a[0]) && near(s.dur, nosignal.a[1]));
    const stretched = [narr, uncle].map((st) => starts.find((s) => s.offset === 0 && near(s.buf, st.a[1] / LADDER[5].rate, 0.05)));
    expect('A5: the scene\'s panel: no clock, the whole answer up, free', a5.A === '5' && a5.clock === 0 && a5.full && a5.hint === null, a5);
    expect('A5: the model line plays first, as the panel opens', !!echo && echo.t >= a5.t - 50, { echo, panel: a5.t });
    expect('A5: the narrator and the uncle spoke slower (stretched: length / 0.85)', stretched.every(Boolean), { starts });
  }
  // in a chat, whose incoming clips queue behind their reading and play on into your turn, the echo waits its turn
  {
    const chat = data.scenarios.find((s) => s.id === 'first-date'), spicy = sayOf(chat); // the Chats feed's first line (chat.js order)
    const page = await open('chat', { store: { model: WEAK, assist: 5 }, fast: false }), a5 = await first(page, 40000);
    await release(page);
    await until(page, (a) => KS_STARTS.some((s) => Math.abs(s.offset - a[0]) < 0.02 && Math.abs(s.dur - a[1]) < 0.02), spicy.a, 20000);
    const starts = await page.evaluate(() => KS_STARTS);
    await page.close();
    const echo = starts.find((s) => near(s.offset, spicy.a[0]) && near(s.dur, spicy.a[1])), over = echo ? starts.filter((s) => s !== echo && s.t < echo.t - 5 && (s.end ?? Infinity) > echo.t + 5) : [];
    expect('A5: a chat\'s echo waits for their voices still queued, never talking over them', a5.A === '5' && !!echo && !over.length, { echo, over });
  }

  // ---------- a pinned No clock waits at every rung: the give-up at A4 and A5 is Auto's clock ----------
  {
    const page = await open('scene', { store: { model: WEAK, assist: 4, 'set.pressure': 'relaxed' }, say: false }), a = await first(page);
    await release(page);
    await sleep(3000); // the give-up's 40 s is 1.6 at KS_FAST's pace
    const r = await page.evaluate(() => ({ open: !!document.querySelector('.ks-card .ks-ask:not(.ks-done)'), lines: window.KS_COUNT.lines }));
    await page.close();
    expect('No clock pinned at A4/A5: a silent line waits, as v1\'s No clock does (no give-up)', +a.A >= 4 && a.clock === 0 && r.open && !r.lines, { a, r });
  }

  // ---------- a call at A4: every peek free (what it buys, the frame, is the rung's and free already) ----------
  {
    const page = await open('call', { store: { model: MID, assist: 4 } }), a4 = await first(page);
    await page.evaluate(() => document.querySelector('.ks-call-peek').click());
    await release(page);
    await answer(page, said);
    await until(page, () => window.KS_COUNT.lines >= 1 && !!document.querySelector('.ks-card .ks-ask:not(.ks-done)'));
    const next = await page.evaluate(() => ({ A: document.querySelector('.ks-card').dataset.assist, peek: document.querySelector('.ks-call-peek').textContent.trim() }));
    await page.close();
    expect('A4: the second turn\'s peek is free too, not −1★', a4.A === '4' && /free/.test(a4.peek?.text) && next.A === '4' && /free/.test(next.peek) && !/★/.test(next.peek), { a4, next });
  }

  // ---------- a chase: the chaser's speed by rung, and a miss read off the screen ----------
  {
    // how fast it gains while the first panel is up (a silent player, the mic unopened), in units of the chase's own
    // speed: the gap is the card's --f × max, noted each time the chase moves it, its slope fitted, the test's pace (×5)
    // taken out
    const tiger = data.scenarios.find((s) => s.id === 'village-tiger'), C = { close: 1, max: 25, ...tiger.chase };
    const speed = async (store) => {
      const page = await open('chase', { store, say: false }), a = await first(page);
      await page.evaluate(() => { const c = document.querySelector('.ks-card'); window.KS_GAP = []; new MutationObserver(() => KS_GAP.push([performance.now(), +c.style.getPropertyValue('--f')])).observe(c, { attributes: true, attributeFilter: ['style'] }); });
      await release(page); await sleep(700);
      const pts = await page.evaluate(() => KS_GAP);
      await page.close();
      const n = pts.length, mt = pts.reduce((s, [t]) => s + t, 0) / n, mf = pts.reduce((s, [, f]) => s + f, 0) / n;
      const slope = pts.reduce((s, [t, f]) => s + (t - mt) * (f - mf), 0) / pts.reduce((s, [t]) => s + (t - mt) ** 2, 0);
      return { A: a.A, x: +((-slope * C.max * 1000) / 5 / C.close).toFixed(3), n };
    };
    const a0 = await speed({ model: STRONG, assist: 1 }), a5 = await speed({ model: WEAK, assist: 5 }), pinned = await speed({ model: STRONG, assist: 1, 'set.pressure': 'relaxed' });
    expect('Chase: the chaser comes ×1.4 at A0 and ×0.4 at A5; a pinned Relaxed keeps v1\'s ×0.5', a0.A === '0' && near(a0.x, LADDER[0].chaser, 0.1) && a5.A === '5' && near(a5.x, LADDER[5].chaser, 0.04) && pinned.A === '0' && near(pinned.x, 0.5, 0.05), { a0, a5, pinned });
    // a fresh player (A2) says the first line wrong; the answer comes back on screen and is read off: the line's row
    // says the answer was shown and paid for, so the learner and the rung see a line that went badly
    const page = await open('chase', { say: 'mixed' });
    await first(page); await release(page);
    await answer(page, said);
    const row = (await rows(page))[0];
    await page.close();
    expect('Chase: a miss, then the answer read off, logs the whole answer as help (hint 2, not free)', row?.res === 'ok' && row.tries >= 1 && row.hint === 2 && !row.free && row.assist === 2, row);
  }

  // ---------- a word to write at the last card's rung (v1's Mix deals one third): traced twice at A5, once at A2 ----------
  {
    const traces = async (assist) => {
      const page = await open('mix?deal=v1', { store: { assist } });
      await page.evaluate(() => { window.KS_INFO = []; new MutationObserver(() => { const i = document.querySelector('.ks-write-info'); if (i && i.textContent && KS_INFO[KS_INFO.length - 1] !== i.textContent) KS_INFO.push(i.textContent); }).observe(document, { childList: true, subtree: true, characterData: true }); });
      // the Mix deals one card ahead: the second is there once the first is on screen, the third once the second is
      await until(page, () => !!document.querySelectorAll('.ks-card')[1], undefined, 5000);
      await page.evaluate(() => document.querySelectorAll('.ks-card')[1].scrollIntoView());
      await until(page, () => !!document.querySelectorAll('.ks-card')[2], undefined, 5000);
      await page.evaluate(() => document.querySelectorAll('.ks-card')[2].scrollIntoView());
      await until(page, () => document.querySelectorAll('.ks-card')[2]?.dataset.state === 'done', undefined, 20000);
      const info = await page.evaluate(() => ({ kind: document.querySelectorAll('.ks-card')[2].className, seq: KS_INFO }));
      await page.close();
      return { kind: info.kind, traced: info.seq.filter((t) => /^(Once more: t|T)race/.test(t)).length, seq: info.seq };
    };
    const t5 = await traces(5), t2 = await traces(2);
    expect('Write: at A5 the word is traced twice before it\'s written from memory; at A2 once', /ks-write/.test(t5.kind) && t5.traced === 2 * t2.traced && t2.traced >= 1, { t5, t2 });
  }

  // ---------- Your Chinese, in Settings, on a 375 px phone ----------
  {
    const page = await open('', { store: { model: HEARS } });
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.click('.ks-open-set');
    await page.waitForSelector('.ks-you');
    await page.evaluate(() => { const s = document.querySelector('.ks-sheet'); s.scrollTop = s.scrollHeight; });
    await sleep(500); // the sheet has risen
    await shot(page, 'settings-375');
    const you = await page.evaluate(() => { const s = document.querySelector('.ks-sheet'), y = s.querySelector('.ks-you'); return { bars: y.querySelectorAll('.ks-you-bar[role=img]').length, labels: [...y.querySelectorAll('.ks-you-bar')].map((b) => b.getAttribute('aria-label')), lv: y.querySelector('.ks-you-lv').textContent, wide: s.scrollWidth > s.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1, q: y.querySelector('.ks-set-l')?.textContent }; });
    await page.evaluate(() => [...document.querySelectorAll('.ks-you [data-p]')].find((b) => b.dataset.p === 'dialect').click());
    // the answer as the learner model keeps it (saved as the page goes)
    const p = await page.evaluate(() => { dispatchEvent(new Event('pagehide')); return { persona: JSON.parse(localStorage.getItem('ks.model')).persona, pressed: document.querySelector('.ks-you [data-p="dialect"]').getAttribute('aria-pressed') }; });
    await page.close();
    expect('Your Chinese: six skill bars, each saying its level and how sure', you.bars === 6 && you.labels.every((l) => /about level [\d.]+, give or take [\d.]+/.test(l)), you);
    expect('Your Chinese: say, listen and read levels, on the lines heard', /Say L\d.*Listen L\d.*Read L\d.*based on 12 lines/.test(you.lv), you.lv);
    expect('Your Chinese: readable at 375 px (nothing runs off sideways)', !you.wide, you);
    expect('Your Chinese: the persona question sets learner.persona()', /hear Chinese at home/.test(you.q) && p.persona === 'dialect' && p.pressed === 'true', p);
  }
} finally { await browser.close(); server.kill(); }
console.log(problems.length ? `${problems.length} problems` : 'all good');
process.exit(problems.length ? 1 : 0);

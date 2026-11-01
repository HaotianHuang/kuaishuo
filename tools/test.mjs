#!/usr/bin/env node
// tools/test.mjs: plays 快说 in a headless phone-sized Chrome, with a simulated player standing in for you.
//   node tools/test.mjs                      every version in Safari's visible viewport, the player always answers right:
//                                            the lab (#lab, the launcher), For You (no hash: the feed the app opens on,
//                                            first on a fresh phone, so its first session: the hook, the about card), then
//                                            each version from the lab
//   node tools/test.mjs --only=scene,call    some versions (a route's options too: --only=mix?deal=v1 is the Mix as v1
//                                            dealt it; foryou is no hash, lab the launcher, home the same)
//   node tools/test.mjs --sim=mixed          wrong first, right second (exercises the feedback and retries)
//   node tools/test.mjs --sim=silent         never answers (exercises the clock, fail branches, retries)
//   node tools/test.mjs --input=tiles        answer by tiles; or speak, type, self, a list (tiles,self) or all, in turn.
//                                            Without it the page picks, as on auto: the mic, or the way a beat suggests
//   node tools/test.mjs --phones=all --cards=3 --headed       phones: safari se-safari iphone se android max
//   node tools/test.mjs --data=<dir>         a content gate's draft build (review/gate/<batch>/data) in place of data/
//   node tools/test.mjs --dist | --web       the packed builds (node tools/pack.mjs [--web] first): the artifact's page
//                                            in dist/, or the web build in web/ under its own headers (serve.mjs --web)
//   node tools/test.mjs --nomic              the claude.ai path: no speech recogniser at all and no simulated voice, so
//                                            every panel opens as it does there (say-and-check on auto, typed chats and
//                                            chases, the Mix's one typed line per story) and is answered by KS_SAY
// Fails on any console error or uncaught exception, or a card that never finishes. Screenshots: review/test/.
//
// Contract with the cards (each format follows it): a card sets el.dataset.state to idle | playing | done, and any
// button a player must tap to move on (start, answer the call, open the chat) carries data-test-go. An answer panel is
// answered in whatever mode it opens: by voice through the mic (KS_SIM says the line), or by tiles, typing or
// say-and-check with the same line (KS_SAY), so --sim means the same in every mode.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), OUT = path.join(ROOT, 'review', 'test');
const opt = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d; // a value may hold = (--only=play?id=x&lv=0)
const has = (k) => process.argv.includes(`--${k}`);
const list = (k, d, all) => (opt(k, d) === 'all' ? all : opt(k, d).split(','));
// What a page really gets: Safari's visible viewport, under its bars (safari, se-safari; the claude.ai app's artifact
// frame is about the same), then whole screens. A panel that runs off the bottom only shows on the short ones.
const PHONES = { safari: [390, 664], 'se-safari': [375, 553], iphone: [390, 844], se: [375, 667], android: [360, 800], max: [430, 932] };
const MODES = ['speak', 'tiles', 'type', 'self'];
const phones = list('phones', 'safari', Object.keys(PHONES)), inputs = list('input', '', MODES);
const versions = opt('only', 'lab,foryou,basic,scene,chase,chat,call,mix,mix?deal=v1').split(',').map((v) => (v === 'home' ? 'lab' : v));
const mix = (v) => v === 'foryou' || v.split('?')[0] === 'mix'; // For You (the ranker) or v1's dealing: the same cards to get through
const hashOf = (v) => (v === 'foryou' ? '' : v); // For You is the app with no hash
const SIM = opt('sim', 'right'), CARDS = +opt('cards', 1), DIST = has('dist'), WEB = has('web'), NOMIC = has('nomic'), DATA = opt('data', '');
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
// a misspelt name would otherwise test something else and pass: an unknown phone crashes, an unknown input plays auto
const unknown = [...phones.filter((p) => !PHONES[p]), ...inputs.filter((m) => m && m !== 'auto' && !MODES.includes(m)), ...(['right', 'mixed', 'silent'].includes(SIM) ? [] : [SIM])];
if (unknown.length) { console.error(`unknown: ${unknown.join(', ')} (--phones=${Object.keys(PHONES).join('|')}|all, --input=${MODES.join('|')}|all, --sim=right|mixed|silent)`); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });
const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), '--port', String(port), ...(DIST ? ['--dist'] : WEB ? ['--web'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.on('data', (d) => /kuaishuo:/.test(d) && r()));
// never leave the server behind, however the run ends
for (const sig of ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException']) process.on(sig, (e) => { server.kill(); if (sig === 'uncaughtException') { console.error(e); process.exit(1); } if (sig.startsWith('SIG')) process.exit(1); });
const BASE = `http://127.0.0.1:${port}/`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: !has('headed'), args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

const problems = [];
// hold the answer clock (ask.js reads window.KS_PAUSE) while the picture is taken, and while a panel finishes rising for
// it, so a fast test clock can't run out
const shot = async (page, name, settle = 0) => { await page.evaluate(() => (window.KS_PAUSE = true)).catch(() => {}); await sleep(settle); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); await page.evaluate(() => (window.KS_PAUSE = false)).catch(() => {}); };

// The calendar the pages share (KS_NOW): each page a visit of its own, half an hour after the last one ended, so their
// clock never runs back (the Mix moves it 25 minutes on: started at 0 again, the next page would find what the last one
// played still to come, and one sitting carried across every page)
let clock = 0;
async function open(phone, hash, input) {
  const page = await browser.newPage();
  const [w, h] = PHONES[phone];
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon|fonts\.g/.test(r.url())) errors.push(`${r.status()} ${r.url().replace(BASE, '/')}`); });
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument((sim, input, nomic, now) => {
    window.KS_FAST = true; window.KS_NOW = now;
    // no recogniser at all, as in the claude.ai frame: the page must work out for itself that it can't listen
    if (nomic) { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; }
    // the pages of a run share one localStorage: each sets its own way to answer, or leaves it to the page
    try { if (input) localStorage.setItem('ks.set.input', JSON.stringify(input)); else localStorage.removeItem('ks.set.input'); } catch {}
    // The player, at each go at a line: the model answer (right), a wrong line the first time (mixed), or nothing
    // (silent). The voice asks by beat through KS_SIM (speech.js); tiles, typing and say-and-check by the line's answer.
    const tries = {}, say = (key, line) => { tries[key] = (tries[key] || 0) + 1; return sim === 'silent' ? null : sim === 'mixed' && tries[key] === 1 ? '我不知道你在说什么' : line; };
    if (!nomic) window.KS_SIM = (beat) => (beat ? say(beat.id, beat.answers[0]) : null);
    window.KS_SAY = (answer) => say(answer, answer);
  }, SIM, input, NOMIC, clock);
  await page.goto(BASE + (DATA ? `?data=${encodeURIComponent(DATA)}` : '') + (hash ? '#' + hash : ''), { waitUntil: 'networkidle0' });
  return { page, errors };
}

// A tap where a thumb would land: a real click on the button where it shows. One that isn't on the screen (a panel still
// rising) gets el.click(), since page.click() would scroll the locked feed to reach it and leave later screenshots high.
async function tap(page, i, sel) {
  const at = await page.evaluate((i, sel) => {
    const e = [...(document.querySelectorAll('.ks-card')[i]?.querySelectorAll(sel) || [])].find((b) => b.offsetParent !== null && !b.disabled);
    const r = e?.getBoundingClientRect(), x = r && r.left + r.width / 2, y = r && r.top + r.height / 2;
    if (r && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && e.contains(document.elementFromPoint(x, y))) return [x, y];
    e?.click();
  }, i, sel).catch(() => null);
  if (at) await page.mouse.click(...at).catch(() => {});
}

// Answer without the microphone, as the artifact frame must, with the player's line (KS_SAY): build the tiles, type it,
// or say it and check. A wrong line goes in wrong (the tiles out of order or with a decoy, typed, or "Not quite"); silence
// taps nothing. Returns why it can't (no tile for a word), so the beat can be skipped and the run go on.
async function answerQuietly(page, i) {
  return page.evaluate(async (i, sim) => {
    const ask = document.querySelectorAll('.ks-card')[i]?.querySelector('.ks-ask'), answer = ask?.dataset.answer;
    if (!answer || sim === 'silent' || ask.matches('.ks-shake, .ks-timeout, .ks-done')) return; // a miss still showing
    const word = (b) => { const c = b.cloneNode(true); c.querySelectorAll('rt, rp').forEach((r) => r.remove()); return c.textContent.trim(); };
    const pool = () => [...ask.querySelectorAll('.ks-tiles-pool .ks-tile')].filter((b) => !b.disabled);
    if (ask.querySelector('.ks-tiles-pool')) {
      // the line's words in order (ask.js lists them for tests), else the tiles found along the answer
      let words = ask.querySelector('[data-words]')?.dataset.words.split('|');
      if (!words) {
        const han = answer.replace(/[^一-鿿]/g, ''), have = pool().map(word).sort((a, b) => b.length - a.length);
        words = []; for (let k = 0; k < han.length;) { const w = have.find((t) => han.startsWith(t, k)); if (w) { words.push(w); k += w.length; } else k++; }
        if (!words.length) return `no tile builds ${answer} (the tiles: ${have.join(' ')})`;
      }
      const spare = pool().map(word), back = [...words].reverse();
      for (const w of words) { const k = spare.indexOf(w); if (k >= 0) spare.splice(k, 1); }
      const order = window.KS_SAY(answer) === answer ? words : spare.length ? [spare[0], ...words.slice(1)] : back.join() !== words.join() ? back : words;
      for (const w of order) {
        const t = pool().find((b) => word(b) === w);
        if (!t) return `no tile for ${w} (the tiles: ${pool().map(word).join(' ')})`;
        t.click();
        await new Promise((r) => setTimeout(r, 30));
      }
      return;
    }
    const input = ask.querySelector('.ks-type input');
    if (input) {
      input.value = window.KS_SAY(answer); input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.form ? input.form.requestSubmit() : ask.querySelector('.ks-type button')?.click();
    }
    const reveal = ask.querySelector('.ks-reveal'), yes = ask.querySelector('.ks-yes');
    if (reveal) reveal.click();
    else if (yes) (window.KS_SAY(answer) === answer ? yes : ask.querySelector('.ks-no') || yes).click();
  }, i, SIM);
}

// Tap through one card: start buttons, the answer panel in whatever mode it opens, Continue, until the card is done.
async function playCard(page, label, i) {
  const t0 = Date.now();
  let shots = 0, lastAsk = false;
  while (Date.now() - t0 < 90000) {
    const s = await page.evaluate((i) => {
      const card = document.querySelectorAll('.ks-card')[i];
      if (!card) return { state: 'missing' };
      const vis = (e) => e && e.offsetParent !== null && !e.disabled;
      const go = [...card.querySelectorAll('[data-test-go]')].find(vis);
      const ask = card.querySelector('.ks-ask'), mic = ask?.querySelector('.ks-mic'), next = ask?.querySelector('.ks-next');
      // ask.js names the panel's mode (data-mode); a panel without one answers by voice if it has a mic
      const speak = (ask?.dataset.mode || (mic ? 'speak' : '')) === 'speak';
      // a verdict moves on by itself in a moment (a tenth of a second here): touch it, as someone reading it would, so
      // its picture shows it. Not bubbling, so only the panel feels it (a chat's mic watches the whole card).
      if (vis(next)) ask.dispatchEvent(new PointerEvent('pointerdown'));
      const waits = !!ask?.querySelector('.ks-ask-clock[hidden]') && !ask.matches('.ks-ask--chase, .ks-ask--call, .ks-done');
      return { state: card.dataset.state || '', go: !!go, ask: !!ask, speak, mic: vis(mic), next: vis(next), listening: !!ask?.classList.contains('ks-listening'), waits };
    }, i);
    if (s.state === 'done') return true;
    if (s.state === 'missing') { problems.push(`${label}: card ${i} missing`); return false; }
    if (s.ask && !lastAsk && shots < 3) await shot(page, `${label}-ask${shots++}`, 450); // let the panel finish rising
    lastAsk = s.ask;
    if (s.go) await tap(page, i, '[data-test-go]');
    else if (s.next) { await shot(page, `${label}-verdict`); await tap(page, i, '.ks-ask .ks-next'); }
    else if (s.ask && SIM === 'silent' && s.waits) await tap(page, i, '.ks-ask .ks-skip'); // no clock, chaser or caller (L0): silence would wait for ever
    else if (s.ask && s.speak) { if (s.mic && !s.listening && SIM !== 'silent') await tap(page, i, '.ks-ask .ks-mic'); } // KS_SIM speaks; silence leaves the mic alone (a tap is a sign of life to ask(), so giveUpAfter would never come)
    else if (s.ask) {
      const why = await answerQuietly(page, i);
      if (why) { if (!problems.includes(`${label}: ${why}`)) problems.push(`${label}: ${why}`); await tap(page, i, '.ks-ask .ks-skip'); }
    }
    await sleep(120);
  }
  problems.push(`${label}: card ${i} didn't finish in 90 s`);
  await shot(page, `${label}-stuck`);
  return false;
}

for (const phone of phones) {
  for (const v of versions) {
    for (const input of v === 'lab' ? [''] : inputs) { // the launcher has no answer panels
      const label = [v.replace(/[?&=]+/g, '-'), phone, input, NOMIC && 'nomic'].filter(Boolean).join('-'), before = problems.length; // a route's options in a file name: mix-deal-v1
      const { page, errors } = await open(phone, hashOf(v), input);
      if (v === 'lab') {
        const n = await page.$$eval('.ks-v', (l) => l.length);
        if (n < 5) problems.push(`${label}: ${n} versions listed`);
        await shot(page, label);
        if (!DIST && !WEB) await unit(page); // a packed build has no app/ modules to import
      } else {
        await page.click('button.ks-boot').catch(() => {});
        await page.waitForSelector('.ks-card, .ks-home', { timeout: 8000 }).catch(() => {});
        if (await page.$('.ks-home')) { console.log(`${label}: not built yet`); await page.close(); continue; }
        await sleep(300);
        await shot(page, `${label}-start`);
        const cards = mix(v) ? Math.max(CARDS, 7) : CARDS; // the Mix's typed line, write and shadow cards, a crisis and a run
        for (let i = 0; i < cards; i++) {
          const ok = await playCard(page, `${label}-${i}`, i);
          await shot(page, `${label}-${i}-end`);
          if (!ok) break;
          // box 1 waits 20 minutes: 25 on, what the first card taught is due at once (a crisis, or a run; the ranker
          // deals one from the fourth card)
          if (mix(v) && i === 0) await page.evaluate(() => (window.KS_NOW = (+window.KS_NOW || 0) + 25 * 60e3));
          if (i + 1 < cards) { await page.evaluate((i) => document.querySelectorAll('.ks-card')[i + 1]?.scrollIntoView(), i); await sleep(500); }
        }
        const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (wide) problems.push(`${label}: the page scrolls sideways`);
        // every answer panel logged exactly one line (events.js), less one still on screen
        const c = await page.evaluate(() => ({ ...window.KS_COUNT, open: document.querySelectorAll('.ks-ask').length }));
        if (!c.panels || c.panels !== c.lines + c.open) problems.push(`${label}: ${c.panels} answer panels but ${c.lines} lines logged (${c.open} open)`);
      }
      for (const e of errors) problems.push(`${label}: ${e}`);
      clock = Math.max(clock, await page.evaluate(() => +window.KS_NOW || 0).catch(() => clock)) + 31 * 60e3;
      const n = problems.length - before;
      console.log(`${label}: ${n ? `${n} problem${n > 1 ? 's' : ''}` : 'ok'}`);
      await page.close();
    }
  }
}

// The judge, on the built airport scene: what should pass, what shouldn't.
async function unit(page) {
  const out = await page.evaluate(async () => {
    const m = await import('/app/shared/match.js');
    await m.loadPinyin('/data/py.json');
    const data = await (await fetch('/data/content.json')).json();
    const scn = data.scenarios.find((s) => s.id === 'airport-esim');
    if (!scn) return ['no airport-esim scenario to test against'];
    const beats = {};
    const walk = (l) => (l || []).forEach((st) => { if (st.say) { beats[st.say.id] = st.say; walk(st.say.ok); walk(st.say.fail); } });
    walk(scn.steps);
    const cases = [
      ['borrow', '能借你的手机打个电话吗', true], ['borrow', '能接你的手机打个电话吗', true], ['borrow', '能接一下你的手机吗', false], ['borrow', '可以用一下你手机吗', true],
      ['borrow', '我不知道', false], ['borrow', '你的手机很好看', false], ['borrow', 'neng jie ni de shouji da ge dianhua ma', true, true],
      ['borrow', 'neng4 jie4 ni3 de shou3ji1', true, true], ['itsme', '是我我在3号出口', true], ['itsme', '是我我在三号出口', true],
      ['itsme', '是我', false], ['notscam', '我把护照押给你', true], ['thanks', '谢谢', true], ['nosignal', '我手机没新号了', true],
    ];
    const bad = [];
    for (const [id, said, want, typed] of cases) { const v = m.judge([said], beats[id], { typed: !!typed }); if (v.ok !== want) bad.push(`judge(${id}, "${said}") = ${v.ok}, want ${want}`); }
    const alt = m.judge(['我把护照押给你'], beats.notscam);
    if (alt.alt !== 0) bad.push(`"我把护照押给你" should take the passport branch (alt ${alt.alt})`);
    const tone = m.judge(['能借你的手机打个电话吗'], beats.borrow);
    if (!tone.perfect) bad.push('the model answer itself should be perfect');
    return bad;
  });
  problems.push(...out.map((p) => `judge: ${p}`));
}

await browser.close();
server.kill();
console.log(problems.length ? `\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}` : '\nall good');
process.exit(problems.length ? 1 : 0);

#!/usr/bin/env node
// tools/events-check.mjs: the event log (app/shared/events.js) in the ways a phone leaves things, which a test that
// plays every card to its end never does: a right answer left on its verdict, "Time's up!" left, a panel swiped away
// mid-answer, a card glanced past, the page hidden and back (and how long that took off the thinking), a finished card
// scrolled back to, a caller hanging up, a chaser catching you. Each case checks the rows it should leave.
// node tools/events-check.mjs [--dist]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), DIST = process.argv.includes('--dist');
const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), '--port', String(port), ...(DIST ? ['--dist'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.on('data', (d) => /kuaishuo:/.test(d) && r()));
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const expect = (name, ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${what}`}`); if (!ok) problems.push(name); };

// a phone-sized page on a version; sim: right (the model answer) or silent; fast: KS_FAST
async function open(hash, { sim = 'right', fast = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 664, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => problems.push(`${hash}: ${e.message || e}`));
  await page.evaluateOnNewDocument((sim, fast) => {
    window.KS_FAST = fast;
    try { localStorage.clear(); } catch {}
    window.KS_SIM = (beat) => (beat && sim === 'right' ? beat.answers[0] : null);
    window.KS_SAY = (a) => (sim === 'right' ? a : null);
    // the page's visibility, as a test can set it (hide(), show())
    let vis = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => vis, configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => vis === 'hidden', configurable: true });
    window.KS_VIS = (v) => { vis = v; document.dispatchEvent(new Event('visibilitychange')); };
  }, sim, fast);
  await page.goto(`http://127.0.0.1:${port}/#${hash}`, { waitUntil: 'networkidle0' });
  await page.click('button.ks-boot').catch(() => {});
  await page.waitForSelector('.ks-card');
  return page;
}
const log = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ks.log')).rows; } catch { return []; } });
const flush = (page) => page.evaluate(() => dispatchEvent(new Event('pagehide')));
const days = (page) => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('ks.days') || '{}'))[0] || {});
const until = async (page, fn, arg, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(50); } return false; };
const swipe = (page, i) => page.evaluate((i) => document.querySelectorAll('.ks-card')[i]?.scrollIntoView(), i).then(() => sleep(700));
// tap whatever starts the card or opens the mic, until fn says stop
const drive = (page, stop) => until(page, (stop) => {
  if ((0, eval)(`(${stop})`)()) return true;
  const c = document.querySelectorAll('.ks-card')[0], go = [...c.querySelectorAll('[data-test-go]')].find((b) => b.offsetParent);
  const mic = c.querySelector('.ks-ask .ks-mic');
  if (go) go.click(); else if (mic && !c.querySelector('.ks-ask.ks-listening')) mic.click();
  return false;
}, stop, 45000);

try {
  // 1. a right answer, its verdict held (a reader's touch), then the card swiped away
  {
    const page = await open('scene');
    await drive(page, String(() => { const a = document.querySelector('.ks-ask.ks-done'); if (a) a.dispatchEvent(new PointerEvent('pointerdown')); return !!a; }));
    await swipe(page, 1); await flush(page);
    const line = (await log(page)).filter((r) => r.k === 'line').pop();
    expect('right answer left on its verdict is logged ok', line?.res === 'ok' && line.stars >= 1, JSON.stringify(line));
    await page.close();
  }
  // 2. silence until "Time's up!", then Back
  {
    const page = await open('scene', { sim: 'silent' });
    await drive(page, String(() => !!document.querySelector('.ks-ask.ks-timeout')));
    await page.evaluate(() => document.querySelector('.ks-back').click()); await sleep(300); await flush(page);
    const line = (await log(page)).filter((r) => r.k === 'line').pop();
    expect('"Time\'s up!" left is logged timeout', line?.res === 'timeout', JSON.stringify(line));
    await page.close();
  }
  // 3. a panel swiped away mid-answer: a cancelled line, and a card left mid-story (not skipped)
  {
    const page = await open('scene', { sim: 'silent' });
    await drive(page, String(() => !!document.querySelector('.ks-ask:not(.ks-done):not(.ks-timeout)')));
    await swipe(page, 1); await flush(page);
    const rows = await log(page), line = rows.filter((r) => r.k === 'line').pop(), card = rows.find((r) => r.k === 'card'), d = await days(page);
    expect('a panel swiped away mid-answer is logged cancel', line?.res === 'cancel', JSON.stringify(line));
    expect('…and its card was left mid-story', card?.state === 'playing' && d.left === 1 && !d.skipped, JSON.stringify({ card, d }));
    expect('…and a cancel is not a line said', !d.lines, JSON.stringify(d));
    await page.close();
  }
  // 4. a card glanced past before anything was asked: skipped, not left
  {
    const page = await open('scene');
    await sleep(300); await swipe(page, 1); await flush(page);
    const d = await days(page);
    expect('a card glanced past is skipped, not left mid-story', d.skipped === 1 && !d.left, JSON.stringify(d));
    await page.close();
  }
  // 5. the page hidden on a card and back: the card closed with how 'hide', and opened again; the time away isn't thinking
  {
    const page = await open('scene', { fast: false });
    await until(page, () => !!document.querySelector('.ks-ask:not(.ks-done)'), undefined, 40000);
    await page.evaluate(() => KS_VIS('hidden')); await sleep(2500); await page.evaluate(() => KS_VIS('visible'));
    await until(page, () => { const m = document.querySelector('.ks-ask .ks-mic'); if (m && !document.querySelector('.ks-listening')) m.click(); return !!document.querySelector('.ks-ask.ks-done'); }, undefined, 20000);
    await swipe(page, 1); await flush(page);
    const rows = await log(page), cards = rows.filter((r) => r.k === 'card'), line = rows.find((r) => r.k === 'line');
    expect('a hidden page closes the card on screen', cards[0]?.how === 'hide', JSON.stringify(cards[0]));
    expect('…and opens it again when it comes back', cards.length === 2 && cards[1].id === cards[0].id, JSON.stringify(cards));
    expect('…and the time away is not thinking time', line && line.ms < 2000, JSON.stringify(line));
    await page.close();
  }
  // 6. a finished card scrolled back to: marked again, and not counted twice
  {
    const page = await open('scene');
    await drive(page, String(() => document.querySelectorAll('.ks-card')[0].dataset.state === 'done'));
    await swipe(page, 1); await swipe(page, 0); await swipe(page, 1); await flush(page);
    const rows = await log(page), d = await days(page), again = rows.filter((r) => r.k === 'card' && r.again);
    expect('a finished card scrolled back to is marked again', again.length === 1, JSON.stringify(rows.filter((r) => r.k === 'card')));
    expect('…and counted once', d.done === 1, JSON.stringify(d));
    await page.close();
  }
  // 7. a caller hangs up, a chaser catches you: their lines say so
  for (const [v, res] of [['call', 'hangup'], ['chase', 'caught']]) {
    const page = await open(v, { sim: 'silent' });
    await until(page, () => { const c = document.querySelectorAll('.ks-card')[0], go = [...c.querySelectorAll('[data-test-go]')].find((b) => b.offsetParent); if (go) go.click(); return c.dataset.state === 'done'; }, undefined, 60000);
    await flush(page);
    const lines = (await log(page)).filter((r) => r.k === 'line');
    expect(`a ${v} lost on its own clock logs ${res}`, lines.some((r) => r.res === res), JSON.stringify(lines.map((r) => r.res)));
    await page.close();
  }
} finally { await browser.close(); server.kill(); }
console.log(problems.length ? `${problems.length} problems` : 'all good');
process.exit(problems.length ? 1 : 0);

#!/usr/bin/env node
// tools/modes-check.mjs: opens the first answer panel of each version and taps its way icons over and over (speak,
// tiles, type, say-and-check, the same one twice): each tap must leave that way's controls only, once, and the panel
// must say which way it's in (data-mode). A mode switch that kept the last way's controls stacked a new microphone per
// tap (v5 to v10). node tools/modes-check.mjs [--dist]
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
const SEQ = ['speak', 'speak', 'tiles', 'type', 'type', 'self', 'speak', 'tiles', 'tiles', 'self', 'self', 'type'];
const problems = [];
try {
  for (const v of ['mix', 'scene', 'call', 'chat', 'chase']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 664, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => problems.push(`${v}: ${e.message || e}`));
    // a simulated voice, so every way is on offer
    await page.evaluateOnNewDocument(() => { window.KS_FAST = true; try { localStorage.clear(); } catch {} window.KS_SIM = () => null; window.KS_SAY = (a) => a; });
    await page.goto(`http://127.0.0.1:${port}/#${v}`, { waitUntil: 'networkidle0' });
    if (await page.$('.ks-boot')) await page.mouse.click(195, 332);
    let ok = false;
    for (let i = 0; i < 200 && !ok; i++) {
      ok = await page.evaluate(() => { const c = document.querySelectorAll('.ks-card')[0], a = c?.querySelector('.ks-ask'); if (a) { window.KS_PAUSE = true; return true; } [...(c?.querySelectorAll('[data-test-go]') || [])].find((b) => b.offsetParent)?.click(); return false; });
      await sleep(100);
    }
    if (!ok) { problems.push(`${v}: no answer panel came up`); await page.close(); continue; }
    for (const m of SEQ) {
      const r = await page.evaluate((m) => {
        const a = document.querySelectorAll('.ks-card')[0].querySelector('.ks-ask'), b = a.querySelector(`.ks-mode[data-m="${m}"]`);
        if (!b) return { skip: true };
        b.click();
        const n = (sel) => a.querySelectorAll(sel).length;
        return { mode: a.dataset.mode, mic: n('.ks-mic'), type: n('.ks-type'), tiles: n('.ks-tiles-pool'), self: n('.ks-self') };
      }, m);
      if (r.skip) continue;
      const want = { mic: +(m === 'speak'), type: +(m === 'type'), tiles: +(m === 'tiles'), self: +(m === 'self') };
      const bad = Object.entries(want).filter(([k, w]) => r[k] !== w).map(([k]) => `${k} ×${r[k]}`);
      if (r.mode !== m || bad.length) problems.push(`${v}: after ${m}, data-mode=${r.mode}${bad.length ? `, ${bad.join(', ')}` : ''}`);
      await sleep(60);
    }
    await page.close();
    console.log(`${v}: checked`);
  }
} finally { await browser.close(); server.kill(); }
for (const p of [...new Set(problems)]) console.log('PROBLEM ' + p);
console.log(problems.length ? `${new Set(problems).size} problems` : 'all good');
process.exit(problems.length ? 1 : 0);

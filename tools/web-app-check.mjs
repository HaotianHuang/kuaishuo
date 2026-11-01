#!/usr/bin/env node
// tools/web-app-check.mjs: the web version's parts in the app (docs/v2/web.md §3-5), as a player meets them:
//   report      report.js alone (in Node): a run's lines back to the card before it, the page hidden mid-story still
//               the same run, Again's own lines only, the menu's last story; the mail cut to what every mail app takes.
//               Then in Chrome, a fresh phone's first story said wrong then right: its end screen's "Something sound
//               wrong?" is a mailto: to web.json's contact, its subject names the story, its body lists every line the
//               log has for the run, by id and text, with what was heard (the wrong try too) and the browser; played
//               Again, the next end screen's mail has that run's lines only
//   menu        For You's menu: About (to app/web/about.html from the source tree, which serves it filled in) and Send
//               feedback (a mailto: to the contact, naming the story just played); with web.json's contact empty, or
//               web.json missing, no Send feedback and no report link on an end screen, About still there
//   startover   a phone that has played (its log, its model, its phrases, the about card answered): Settings → Start
//               over says what goes, Escape keeps it, Delete it all leaves no key of the game's behind, and the page
//               comes back with no hash as a phone that has never played: the hook on the gate, the hook story first,
//               nothing in the log from before, the same keys as a new phone's
//   desk        at 1440×900 with a mouse: the gate says "Click to start", a phone's says "Tap" (a touch screen); About
//               small under the tap; a wheel flick (many events, a trackpad's glide) moves the feed one card, down and
//               up, from over the feed and from the page beside it; ↓, PageDown and j too
//   pages       about.html and 404.html as they ship (filled in from web.json, its empty url's line gone): no script, a
//               <style> of their own, every data-needs line whole on one line; at 390×844 and 1440×900 with JavaScript off
//   firefox     /Applications/Firefox.app over WebDriver BiDi, a fresh profile: a fresh phone through the gate ("Click"),
//               no recogniser, so say-and-check on auto; the first story answered by typing to its end screen, won, with
//               its report link; Next, and the about card comes; no console errors
// and no page errors anywhere. Screenshots: review/web-app/.
// node tools/web-app-check.mjs [--dist | --web] [--only=report,menu,startover,desk,pages,firefox]
//   --dist: the artifact build, which carries no web.json and has no About page: no report link, no Send feedback, no
//   About anywhere, Start over the same. --web: web/ under its own headers (serve.mjs --web; pack.mjs --web first).
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { played, mailto } from '../app/shared/report.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), OUT = path.join(ROOT, 'review', 'web-app');
const DIST = process.argv.includes('--dist'), WEB = process.argv.includes('--web'), SRC = !DIST && !WEB;
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const want = (k) => !ONLY || ONLY.includes(k);
const SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'web.json'), 'utf8')), CONTACT = DIST ? '' : SITE.contact;
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8')), byId = Object.fromEntries(DATA.scenarios.map((s) => [s.id, s]));
const HOOK = 'You\'ve just landed at Pudong, and your phone has no signal.', PHONE = [390, 844], DESK = [1440, 900];
const FIREFOX = process.env.FIREFOX || '/Applications/Firefox.app/Contents/MacOS/firefox';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const expect = (name, ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(what)?.slice(0, 1200)}`}`); if (!ok) problems.push(name); };
const unmail = (href) => { const u = new URL(href); return { to: decodeURIComponent(u.pathname), subject: u.searchParams.get('subject') || '', body: u.searchParams.get('body') || '' }; };

// ---------- report.js alone ----------
if (want('report')) {
  const L = (id, o = {}) => ({ k: 'line', id, res: 'ok', stars: 3, mode: 'speak', att: 1, at: o.at ?? 0, ...o });
  const heard = (r, h) => Object.defineProperty(r, 'heard', { value: h }); // (as events.js keeps it: not enumerable)
  const rows = [L('a/b1', { at: 1 }), { k: 'card', id: 'a', how: 'swipe', at: 2 }, L('x/b1', { at: 3 }), { k: 'card', id: 'x', how: 'hide', at: 4 }, { k: 'hide', at: 4 }, heard(L('x/b2', { at: 5, res: 'timeout', stars: 0, mode: 'type' }), ['我不知道']), L('x/b3', { at: 6, res: 'cancel' }), L('x/b1', { at: 8 }), L('x/b2', { at: 9 })];
  const ids = (rs) => rs.map((r) => `${r.id}@${r.at}`).join(' ');
  expect('report.js: a run is the lines back to the card before it (the page hidden mid-story is the same run; a panel never answered isn\'t a line)', ids(played(rows.slice(0, 7))) === 'x/b1@3 x/b2@5', ids(played(rows.slice(0, 7))));
  expect('report.js: played Again, after the last run\'s end: that run\'s lines only', ids(played(rows, { after: 7 })) === 'x/b1@8 x/b2@9', ids(played(rows, { after: 7 })));
  expect('report.js: the menu\'s, from the last line back (a card left after it), its last run (a line met again from its start is a run before)', ids(played([...rows, { k: 'card', id: 'x', how: 'swipe', at: 10 }], { last: true })) === 'x/b1@8 x/b2@9', ids(played([...rows, { k: 'card', id: 'x', how: 'swipe', at: 10 }], { last: true })));
  const retry = [L('y/b1', { at: 1, res: 'timeout', stars: 0 }), L('y/b1', { at: 2, att: 2 }), L('y/b2', { at: 3 })];
  expect('report.js: a line\'s second attempt (after a timeout) is the same run', ids(played(retry)) === 'y/b1@1 y/b1@2 y/b2@3', ids(played(retry)));
  const m = unmail(mailto({ to: 'a@b.c', scn: { id: 'x', title: '标题', title_en: 'Title' }, rows: played(rows.slice(0, 7)), text: (id) => ({ 'x/b1': '你好', 'x/b2': '谢谢' })[id], browser: 'UA 1', speech: '' }));
  expect('report.js: to, a subject naming the story, each line by id and text with how it went and what was heard, the browser', m.to === 'a@b.c' && /标题 \(x\)/.test(m.subject) && /played \(Title\):/.test(m.body) && /1\. x\/b1 你好 right 3★, spoken/.test(m.body) && /2\. x\/b2 谢谢 out of time, typed “我不知道”/.test(m.body) && /Browser: UA 1/.test(m.body) && /\r\n/.test(m.body), m);
  const T = { a: '我手机没信号了。', b: '大叔，能借您的手机打个电话吗？', c: '放心，我不是骗子，就一分钟！', d: '是我！我在三号出口。', e: '太谢谢您了，您真是救了我！' }, UA = `${'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36'}, 390x844`;
  const five = (h) => mailto({ to: 'hello@huangetal.org', scn: { id: 'airport-esim', title: '手机没信号', title_en: 'No Signal at Arrivals' }, rows: Object.keys(T).map((k, i) => heard(L(`airport-esim/${k}`, { at: i }), h(T[k]))), text: (id) => T[id.split('/')[1]], browser: UA });
  const same = five((t) => [t]), wrong = five((t) => ['我不知道', t]);
  expect('report.js: the first story, all right, heard as said: under 2,000 with every line\'s text and what was heard', same.length <= 2000 && unmail(same).body.split('\r\n').filter((l) => /^\d\. airport-esim\/\w+ [一-鿿].*, heard “/.test(l)).length === 5, unmail(same).body);
  expect('report.js: and wrong first each time: the wrong tries whole, the line cut down as it must be', wrong.length <= 2000 && (unmail(wrong).body.match(/“我不知道”/g) || []).length === 5 && !/earlier line/.test(unmail(wrong).body), unmail(wrong).body);
  const many = [...Array(40)].map((_, k) => heard(L(`x/b${k}`, { at: k }), ['一二三四五六七八九十'.repeat(3)]));
  const long = mailto({ to: 'a@b.c', scn: { id: 'x', title: '标题' }, rows: many, text: () => '我手机没信号了，能借您的手机打个电话吗', browser: 'UA' });
  expect('report.js: a long run is cut to 2,000 characters at most, the oldest lines first, said so', long.length <= 2000 && /earlier lines left out/.test(unmail(long).body) && unmail(long).body.includes('x/b39'), long.length);
}

const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), '--port', String(port), ...(DIST ? ['--dist'] : WEB ? ['--web'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => server.kill()); // never left behind, however the run ends
await new Promise((r) => server.stdout.on('data', (d) => /kuaishuo:/.test(d) && r()));
const BASE = `http://127.0.0.1:${port}/`, ABOUT = SRC ? `${BASE}app/web/about.html` : WEB ? `${BASE}about.html` : null;
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

// Installed before the page's own code: the voice (KS_SIM: each line right; 'mixed', wrong first, right the second
// time), the answers shown to a check (KS_SAY), and no mailto: link ever followed (its tap still makes its mail)
function spies(sim) {
  const tries = new Map();
  if (sim) window.KS_SIM = (b) => { if (!b) return null; const n = (tries.get(b.id) || 0) + 1; tries.set(b.id, n); return sim === 'mixed' && n === 1 ? '我不知道' : b.answers[0]; };
  window.KS_SAY = (a) => a; window.KS_FAST = true;
  addEventListener('click', (e) => { if (e.target.closest?.('a[href^="mailto:"]')) e.preventDefault(); });
}
// A page at hash: a phone (touch) or a desk (a mouse), its store ks.* as given (clear: false keeps what the last left);
// site: web.json as the page gets it ('{}' none, 404 missing, null as served)
async function open(hash = '', { view = PHONE, touch = true, store = {}, clear = true, sim = 'right', site = null, js = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: view[0], height: view[1], deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
  const where = hash || '(feed)';
  page.on('pageerror', (e) => problems.push(`${where}: ${e.message || e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|Failed to load resource/.test(m.text())) problems.push(`${where}: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon|fonts\.g/.test(r.url()) && !(site === 404 && /web\.json$/.test(r.url())) && !/\/no\/such\/page$/.test(r.url())) problems.push(`${where}: ${r.status()} ${r.url()}`); });
  if (site != null) {
    await page.setRequestInterception(true);
    page.on('request', (q) => (/\/web\.json$/.test(q.url()) ? q.respond(site === 404 ? { status: 404, body: 'not found' } : { status: 200, contentType: 'application/json', body: site }) : q.continue()));
  }
  if (!js) await page.setJavaScriptEnabled(false);
  await page.evaluateOnNewDocument((store, clear) => { try { if (clear) localStorage.clear(); for (const [k, v] of Object.entries(store)) localStorage.setItem('ks.' + k, JSON.stringify(v)); } catch {} }, store, clear);
  await page.evaluateOnNewDocument(spies, sim);
  await page.goto(`${BASE}${hash ? `#${hash}` : ''}`, { waitUntil: 'networkidle0' });
  return page;
}
const until = async (page, fn, arg, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(60); } return false; };
const shot = (page, name) => page.evaluate(() => (window.KS_PAUSE = true)).then(() => sleep(300)).then(() => page.screenshot({ path: path.join(OUT, `${name}.png`) })).finally(() => page.evaluate(() => (window.KS_PAUSE = false)).catch(() => {}));
// (a version's link from a page whose sound can already start has no gate: Chrome here plays without a tap)
const gate = async (page) => { await page.waitForSelector('button.ks-boot, .ks-card', { timeout: 15000 }); if (await page.$('button.ks-boot')) await page.click('button.ks-boot'); await page.waitForSelector('.ks-card', { timeout: 20000 }); await sleep(250); };
// card i played to its end as a player would (loops-check's): Start and the like, Next, the mic, tiles, typing,
// say-and-check
const PLAY = (i) => {
  const c = document.querySelectorAll('.ks-card')[i];
  if (!c || c.dataset.state === 'done') return !!c;
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
};
const play = (page, i, ms = 90000) => until(page, PLAY, i, ms);
const log = (page) => page.evaluate(() => { dispatchEvent(new Event('pagehide')); try { return JSON.parse(localStorage.getItem('ks.log')).rows; } catch { return []; } });
const keys = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ks.')).sort());
const sheet = (page) => page.evaluate(() => ({ about: document.querySelector('.ks-menu-about')?.getAttribute('href') ?? null, feedback: document.querySelector('.ks-menu-feedback')?.href ?? null, settingsAbout: document.querySelector('.ks-set-about')?.getAttribute('href') ?? null, over: !!document.querySelector('.ks-start-over') }));
const openMenu = async (page) => { await page.click('.ks-menu'); await page.waitForSelector('.ks-sheet', { timeout: 5000 }); await sleep(300); };
const status = (url) => fetch(url).then(async (r) => ({ status: r.status, text: await r.text() }));

try {
  // ---------- the report mail, and the menu, on a fresh phone's first story ----------
  if (want('report') || want('menu')) {
    const page = await open('', { sim: 'mixed' });
    await gate(page);
    expect('the first story plays to its end screen', await play(page, 0), '');
    const end = await page.evaluate(() => { const a = document.querySelector('.ks-card .ks-report'); return { href: a?.href ?? null, cls: a?.className, inNote: !!a?.closest('.ks-end-note'), beside: !!document.querySelector('.ks-ask .ks-report') }; });
    if (!CONTACT) expect('no contact (the artifact carries no web.json): no report link on the end screen', end.href === null, end);
    else {
      const rows = (await log(page)).filter((r) => r.k === 'line' && r.res !== 'cancel'), m = end.href && unmail(end.href), scn = byId[rows[0]?.id.split('/')[0]];
      await shot(page, 'end-report');
      expect('the end screen has <a class="ks-report" href="mailto:…">Something sound wrong?</a>, in its note, nothing beside a line', !!m && end.inNote && !end.beside, end);
      expect(`its mail is to web.json's contact (${CONTACT})`, m?.to === CONTACT, m?.to);
      expect('its subject names the story (title, id), its body the English title', !!scn && m.subject.includes(scn.title) && m.subject.includes(`(${scn.id})`) && m.body.includes(`played (${scn.title_en}):`), m?.subject);
      const order = rows.map((r) => m.body.indexOf(`. ${r.id} `));
      expect(`its body lists every line the log has for the run, in order, by id (${rows.length})`, rows.length > 0 && order.every((k, j) => k > 0 && (j === 0 || k > order[j - 1])) && (m.body.match(/^\d+\. /gm) || []).length === rows.length, { rows: rows.map((r) => r.id), body: m.body });
      expect('each with its text (the line\'s Chinese)', rows.every((r) => new RegExp(`${r.id.replace(/[/@]/g, '\\$&')} [^ ]*[一-鿿]`).test(m.body)), m.body);
      expect('with what was heard, the wrong try too ("我不知道"), and the browser', /heard “我不知道”/.test(m.body) && /Browser: .*Chrome/.test(m.body) && /Speech: /.test(m.body), m.body);
      // Again: the next end screen's mail has its own run's lines only (said right first time now)
      const n0 = rows.length;
      await page.evaluate(() => document.querySelector('.ks-card [class*="-again"]')?.click());
      await until(page, () => document.querySelector('.ks-card')?.dataset.state === 'playing', null, 8000);
      await play(page, 0);
      const again = await page.evaluate(() => document.querySelector('.ks-card .ks-report')?.href ?? null), m2 = again && unmail(again), rows2 = (await log(page)).filter((r) => r.k === 'line' && r.res !== 'cancel').slice(n0);
      expect(`played Again, its mail has that run's ${rows2.length} lines only, nothing heard wrong`, !!m2 && (m2.body.match(/^\d+\. /gm) || []).length === rows2.length && !m2.body.includes('我不知道'), { body: m2?.body, rows2: rows2.length });
    }
    if (want('menu')) {
      await page.evaluate(() => document.querySelector('.ks-card [class*="-next"]')?.click());
      await sleep(600);
      await openMenu(page);
      const s = await sheet(page);
      await shot(page, 'menu');
      if (ABOUT) {
        expect(`the menu has <a class="ks-menu-about"> to ${SRC ? 'app/web/about.html' : 'about.html'}`, s.about === (SRC ? 'app/web/about.html' : 'about.html'), s);
        const r = await status(ABOUT);
        expect('it opens, filled in from web.json', r.status === 200 && !r.text.includes('{{') && r.text.includes(`mailto:${SITE.contact}`), { status: r.status, left: r.text.match(/\{\{\w+\}\}/g) });
      } else expect('a packed page has no About page: no About in the menu', s.about === null, s);
      if (CONTACT) {
        const f = s.feedback && unmail(s.feedback);
        expect('the menu has <a class="ks-menu-feedback"> Send feedback: a mailto: to the contact, naming the story just played, with its last run\'s lines and the browser', !!f && f.to === CONTACT && /feedback, after .*\(airport-esim\)/.test(f.subject) && /^1\. /m.test(f.body) && !/^6\. /m.test(f.body) && /Browser: /.test(f.body), f);
      } else expect('no contact: no Send feedback', s.feedback === null, s);
      expect('Settings, under the menu, has Start over (and no second About)', s.over && s.settingsAbout === null, s);
    }
    await page.close();
    if (want('menu') && !DIST) {
      for (const [site, why] of [['{"name":"快说","contact":""}', 'web.json\'s contact empty'], [404, 'web.json missing']]) {
        const p = await open('scene', { site });
        await gate(p);
        await play(p, 0);
        const end = await p.evaluate(() => !!document.querySelector('.ks-report'));
        await p.goto(`${BASE}#`, { waitUntil: 'networkidle0' });
        await gate(p);
        await openMenu(p);
        const s = await sheet(p);
        expect(`${why}: no report link on the end screen, no Send feedback, About still there`, !end && s.feedback === null && !!s.about, { end, s });
        await p.close();
      }
    }
  }

  // ---------- Start over ----------
  if (want('startover')) {
    const fresh = await open('');
    await fresh.waitForSelector('.ks-gate-hook:not([hidden])', { timeout: 15000 }).catch(() => {});
    await sleep(500);
    const newKeys = await keys(fresh);
    await fresh.close();
    const page = await open('');
    await gate(page);
    await play(page, 0);
    await page.evaluate(() => KS_MIX.feed.go(1)); // the about card: an answer or two
    await until(page, () => !!document.querySelector('.ks-about [data-p]'), null, 8000);
    await page.evaluate(() => { document.querySelector('.ks-about [data-p="mandarin"]')?.click(); document.querySelector('.ks-about [data-g="family"]')?.click(); });
    await page.evaluate(() => KS_MIX.feed.go(2));
    await sleep(1500);
    const before = await keys(page), t0 = Date.now();
    await openMenu(page);
    await page.click('.ks-start-over');
    await page.waitForSelector('.ks-confirm', { timeout: 3000 });
    const say = await page.evaluate(() => document.querySelector('.ks-confirm').textContent.replace(/\s+/g, ' '));
    await shot(page, 'start-over');
    expect('Start over asks first, and says what goes', /deletes everything/.test(say) && /phrases/.test(say) && /Chinese/.test(say) && /settings/.test(say) && /can’t be undone/.test(say), say);
    await page.keyboard.press('Escape');
    await sleep(200);
    const kept = await page.evaluate(() => ({ confirm: !!document.querySelector('.ks-confirm'), settings: !!document.querySelector('.ks-sheet'), inert: document.querySelector('.ks-sheet')?.inert }));
    expect('Escape keeps it: the sheet goes, Settings stays, usable', !kept.confirm && kept.settings && !kept.inert && (await keys(page)).length >= before.length, kept);
    await page.evaluate(() => document.querySelector('.ks-set-keep')?.scrollIntoView({ block: 'center' }));
    await shot(page, 'settings-keep');
    await page.click('.ks-start-over');
    await page.waitForSelector('.ks-start-over-yes', { timeout: 3000 });
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }), page.click('.ks-start-over-yes')]);
    await page.waitForSelector('.ks-gate-hook:not([hidden])', { timeout: 15000 }).catch(() => {});
    await sleep(500);
    const after = await page.evaluate(() => ({ hash: location.hash, hook: document.querySelector('.ks-gate-hook:not([hidden])')?.textContent || null, menu: !!document.querySelector('.ks-sheet') }));
    const left = await keys(page);
    await shot(page, 'start-over-after');
    expect(`a played phone had ${before.length} keys (${before.join(' ')})`, before.length >= 8 && before.includes('ks.log') && before.includes('ks.model') && before.includes('ks.srs'), before);
    expect('after Start over: no hash, the hook on the gate, a phone that has never played', after.hash === '' && after.hook === HOOK && !after.menu, after);
    expect(`and only a new phone's keys (${newKeys.join(' ') || 'none'})`, left.join() === newKeys.join(), { left, newKeys });
    await gate(page);
    const first = await page.evaluate(() => KS_MIX.dealt[0]?.id), rows = await log(page);
    expect('its first card is the hook story again, and its log starts now', first === 'airport-esim' && rows.every((r) => r.at >= t0 - 1000), { first, old: rows.filter((r) => r.at < t0 - 1000).length });
    await page.close();
  }

  // ---------- desktop: the gate's word, the wheel, the keys ----------
  if (want('desk')) {
    const phone = await open('');
    await phone.waitForSelector('button.ks-boot', { timeout: 15000 });
    const pw = await phone.evaluate(() => document.querySelector('.ks-gate-tap')?.textContent);
    expect('a touch screen\'s gate says "Tap to start · sound on"', pw === 'Tap to start · sound on', pw);
    await phone.close();
    const page = await open('', { view: DESK, touch: false, store: { 'set.input': 'self' } });
    await page.waitForSelector('button.ks-boot');
    const g = await page.evaluate(() => ({ tap: document.querySelector('.ks-gate-tap')?.textContent, about: document.querySelector('.ks-gate-about')?.getAttribute('href') ?? null, in: !!document.querySelector('.ks-boot .ks-gate-about') }));
    await page.waitForSelector('.ks-gate-hook:not([hidden])', { timeout: 15000 }).catch(() => {});
    await shot(page, 'desk-gate');
    expect('a mouse\'s gate says "Click to start · sound on"', g.tap === 'Click to start · sound on', g);
    expect(ABOUT ? 'About, small, under the tap (beside the gate\'s button, not in it)' : 'a packed page: no About on the gate', ABOUT ? g.about === (SRC ? 'app/web/about.html' : 'about.html') && !g.in : g.about === null, g);
    await page.close();
    const lab = await open('scene', { view: DESK, touch: false, store: { 'set.input': 'self' } });
    await gate(lab);
    await sleep(800);
    const at = () => lab.evaluate(() => { const f = document.querySelector('.ks-feed'); return Math.round(f.scrollTop / f.clientHeight); });
    // a flick: many wheel events close together, the last ones a glide's small ones
    const flick = async (x, dy) => { await lab.mouse.move(x, 450); for (const d of [40, 90, 120, 120, 90, 60, 40, 25, 15, 8, 4, 2]) { await lab.mouse.wheel({ deltaY: Math.sign(dy) * d }); await sleep(16); } await sleep(1100); return at(); };
    const seen = [await at(), await flick(720, 1), await flick(720, 1), await flick(720, -1), await flick(150, 1)];
    await shot(lab, 'desk-wheel');
    expect('a wheel flick moves the feed one card: down, down, up, and down from the page beside the column (0 1 2 1 2)', seen.join(' ') === '0 1 2 1 2', seen);
    await lab.mouse.move(720, 450);
    for (const k of ['j', 'PageDown', 'ArrowDown']) { await lab.keyboard.press(k); await sleep(1100); seen.push(await at()); }
    expect('j, PageDown and ↓ each move it one more (3 4 5)', seen.slice(5).join(' ') === '3 4 5', seen);
    await lab.close();
  }

  // ---------- about.html and 404.html as they ship ----------
  if (want('pages') && !DIST) {
    for (const [name, url] of [['about', SRC ? `${BASE}app/web/about.html` : `${BASE}about`], ['404', SRC ? `${BASE}app/web/404.html` : `${BASE}no/such/page`]]) {
      const src = fs.readFileSync(path.join(ROOT, 'app/web', `${name}.html`), 'utf8'), r = await status(url);
      const needs = src.split('\n').filter((l) => /data-needs=/.test(l)), whole = needs.every((l) => { const t = l.match(/^\s*<(\w+)/)?.[1]; return t && l.trim().endsWith(`</${t}>`); });
      expect(`${name}.html: no <script>, its own <style>, Google's font only, every data-needs line whole on one line`, !/<script/i.test(src) && /<style>/.test(src) && [...src.matchAll(/(?:href|src)="(https?:[^"]+)"/g)].every((m) => /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/.test(m[1])) && whole, { needs });
      expect(`${name}.html as served: ${name === '404' && WEB ? 'a 404, ' : ''}filled in (no {{…}} left), the empty url's line gone`, r.status === (name === '404' && WEB ? 404 : 200) && !/\{\{/.test(r.text) && !/data-needs/.test(r.text) && (name !== 'about' || (r.text.includes(`mailto:${SITE.contact}`) && r.text.includes(SITE.by) && (SITE.url || !/It lives at/.test(r.text)))), { status: r.status });
      for (const [w, h] of [PHONE, DESK]) {
        const p = await open('', { view: [w, h], touch: w < 700, js: false });
        await p.goto(url, { waitUntil: 'networkidle0' });
        const fit = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
        await p.screenshot({ path: path.join(OUT, `${name}-${w}.png`), fullPage: name === 'about' });
        expect(`${name}.html at ${w}×${h}, JavaScript off: no sideways scroll`, fit, '');
        await p.close();
      }
    }
  }
} catch (e) { problems.push(`crashed: ${e.stack || e}`); console.error(e); }
await browser.close();

// ---------- Firefox ----------
if (want('firefox')) {
  let ff = null;
  try {
    ff = await puppeteer.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true, extraPrefsFirefox: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } }); // (a temporary profile of its own)
    const page = await ff.newPage(), errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(e.message || String(e)));
    await page.setViewport({ width: PHONE[0], height: PHONE[1] });
    await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch {} window.KS_SAY = (a) => a; });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('button.ks-boot', { timeout: 20000 });
    await sleep(1500);
    const g = JSON.parse(await page.evaluate(() => JSON.stringify({ tap: document.querySelector('.ks-gate-tap')?.textContent, hook: document.querySelector('.ks-gate-hook:not([hidden])')?.textContent || null, sr: !!(window.SpeechRecognition || window.webkitSpeechRecognition) }))); // (BiDi hands back plain values best as text)
    expect('Firefox: no recogniser, the hook over "Click to start · sound on"', !g.sr && g.hook === HOOK && g.tap === 'Click to start · sound on', g);
    await page.screenshot({ path: path.join(OUT, 'firefox-gate.png') });
    await page.click('button.ks-boot');
    await page.waitForSelector('.ks-card .ks-ask', { timeout: 30000 });
    const modes = JSON.parse(await page.evaluate(() => JSON.stringify([...document.querySelectorAll('.ks-ask [data-m]')].map((b) => `${b.dataset.m}${b.getAttribute('aria-selected') === 'true' ? '*' : ''}`))));
    expect('Firefox: the first panel opens on say-and-check, with tiles and typing a tap away, no speaking', modes.join(' ') === 'tiles type self*', modes);
    await page.screenshot({ path: path.join(OUT, 'firefox-panel.png') });
    // every line typed: the Type tab, the answer, Enter's submit
    const typed = [];
    const won = await (async () => {
      for (const t = Date.now(); Date.now() - t < 120000; await sleep(150)) {
        const s = JSON.parse(await page.evaluate(() => {
          const c = document.querySelector('.ks-card'), a = c?.querySelector('.ks-ask'), vis = (e) => e && e.offsetParent !== null && !e.disabled;
          if (!c || c.dataset.state === 'done') return JSON.stringify({ done: !!c });
          const go = [...c.querySelectorAll('[data-test-go]')].find(vis);
          if (go) { go.click(); return '{}'; }
          if (!a || a.matches('.ks-shake, .ks-timeout')) return '{}';
          const next = a.querySelector('.ks-next'), tab = a.querySelector('[data-m="type"]'), input = a.querySelector('.ks-type input');
          if (vis(next)) { next.click(); return '{}'; }
          if (tab && tab.getAttribute('aria-selected') !== 'true') { tab.click(); return '{}'; }
          if (input && a.dataset.answer && !a.dataset.sent) { a.dataset.sent = 1; input.value = a.dataset.answer; input.dispatchEvent(new Event('input', { bubbles: true })); input.form ? input.form.requestSubmit() : a.querySelector('.ks-type button')?.click(); return JSON.stringify({ typed: a.dataset.answer }); }
          return '{}';
        }));
        if (s.typed) typed.push(s.typed);
        if (s.done) return true;
      }
      return false;
    })();
    await sleep(800);
    const end = JSON.parse(await page.evaluate(() => { const done = JSON.parse(localStorage.getItem('ks.done') || '{}'), rows = (JSON.parse(localStorage.getItem('ks.log') || '{}').rows || []); return JSON.stringify({ out: done['airport-esim']?.outcome, report: document.querySelector('.ks-card .ks-report')?.getAttribute('href')?.slice(0, 40) ?? null, modes: [...new Set(rows.filter((r) => r.k === 'line').map((r) => r.mode))] }); }));
    await page.screenshot({ path: path.join(OUT, 'firefox-end.png') });
    expect(`Firefox: the first story typed to its end screen (${typed.length} lines), and won`, won && end.out === 'win' && end.modes.join() === 'type', { won, end, typed });
    if (CONTACT) expect('Firefox: its end screen has the report link', !!end.report?.startsWith(`mailto:${CONTACT}`), end);
    await page.evaluate(() => document.querySelector('.ks-card [class*="-next"]')?.click());
    const next = await (async () => { for (let k = 0; k < 40; k++) { const n = JSON.parse(await page.evaluate(() => JSON.stringify({ i: globalThis.KS_MIX?.feed.active, kind: globalThis.KS_MIX?.dealt[1]?.kind }))); if (n.i === 1) return n; await sleep(150); } return null; })();
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'firefox-next.png') });
    expect('Firefox: Next, and the next card comes (the about card)', next?.kind === 'about', next);
    await page.setViewport({ width: DESK[0], height: DESK[1] });
    await sleep(600);
    await page.mouse.move(720, 450);
    const gaps = JSON.parse(await page.evaluate(() => { window.KS_WHEELS = []; addEventListener('wheel', (e) => KS_WHEELS.push(Math.round(e.timeStamp)), true); return '1'; })) && [];
    for (const d of [40, 90, 120, 120, 90, 60, 40, 25, 15, 8, 4, 2]) { await page.mouse.wheel({ deltaY: d }); await sleep(16); }
    await sleep(1400);
    const w = JSON.parse(await page.evaluate(() => JSON.stringify(globalThis.KS_MIX?.feed.active)));
    gaps.push(...JSON.parse(await page.evaluate(() => JSON.stringify(KS_WHEELS.map((t, k, a) => (k ? t - a[k - 1] : 0))))));
    console.log(`     Firefox's wheel events came ${gaps.join(' ')} ms apart`);
    await page.screenshot({ path: path.join(OUT, 'firefox-desk-wheel.png') });
    expect('Firefox at 1440×900: a wheel flick moves the feed one card', w === 2, w);
    expect('Firefox: no console errors', !errs.length, errs);
  } catch (e) { problems.push(`firefox: ${e.stack || e}`); console.error(e); }
  await Promise.race([ff?.close(), sleep(5000)]).catch(() => {});
  try { ff?.process()?.kill(); } catch {}
}

server.kill();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join('\n')}` : '\nall good');
process.exit(problems.length ? 1 : 0);

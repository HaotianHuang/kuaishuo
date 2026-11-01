#!/usr/bin/env node
// tools/first-check.mjs: a new phone's first session in Chrome, at 375×553 (Safari's visible viewport on an iPhone SE),
// as docs/v2/p3.md has it. The app opens on the feed (no hash), through the sound gate:
//   the gate        the hook story's premise over "Tap to start · sound on" (a phone that has played sees the plain gate)
//   no prompts      every call that can raise a permission prompt (getUserMedia, the recogniser's start(), notifications,
//                   location, motion, persistent storage) is recorded from before the page's own code runs, with the
//                   taps the player made: none before the player taps a mic
//   the first line  its answer panel within 8 s of the gate's tap, timed in the page: performance.now() at the tap (a
//                   real click on the gate: its pointerdown) to the panel's arrival in the DOM (a MutationObserver), the
//                   story's voices played in real time (no KS_FAST: muted, as every check plays them); at FIRST_LINE
//                   (assist.js: no clock, and the answer up and free at A5, the frame at A4; hearing it again free too,
//                   as A5 says it for you first), its row saying so; the
//                   card's next lines a step down each (FIRST_LINES of them: A4, A3, their rows first 2, 3), then the
//                   card's own rung
//   card 1          the hook story (why.rule 'hook')
//   card 2          the about card (why.rule 'about'): every question a tap (nothing typed); each answer saved as it's
//                   tapped (learner.persona(), ks.goals, ks.born), and the card after it picked again from it; the
//                   whole card on screen at 375×553 (the page doesn't scroll); answered in Settings over it, its
//                   question drawn again as Settings left it (the card after it picked again too); a swipe past keeps
//                   the answers; its row logged, and not a card played in the day's numbers; Settings → Your Chinese
//                   shows the answers, and a year tapped again there is taken back (no ks.born: not asked); never dealt
//                   again, this visit or the next. And on another phone, swiped past with nothing tapped: nothing
//                   saved, never dealt again; and on a third, the page gone under the hook before a line was said: the
//                   next visit's gate has the premise again, over the hook
//   placement       the stories dealt while placing aim at τ 0.70 (their why, as ?why shows it)
//   the bonus       once, after a strong card (KS_SIM answers right): a line a level up, labelled so, saying how far up
//                   it is from the say level Settings shows, with its story's setting; its row task 'bonus'
//   the menu        where the back button sits (aria-label Menu): its sheet goes to your phrases, your numbers and the lab
//                   above Settings; your phrases and your numbers, and their Back, leave For You as it was (the card on
//                   screen the same, in its state, nothing logged as left, the ranker's arms unmoved): over a call or a
//                   chase done (formats whose leave() puts them back to their start), and over the card after it; the
//                   lab (#lab) is the launcher, with Back to the feed, which opens the feed again
// and no page errors anywhere. Screenshots: review/first/.
// node tools/first-check.mjs [--dist | --web]   (the packed builds: node tools/pack.mjs [--web] first)
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), DIST = process.argv.includes('--dist'), WEB = process.argv.includes('--web'), OUT = path.join(ROOT, 'review', 'first');
const { FIRST_LINE, FIRST_LINES, LADDER } = await import(path.join(ROOT, 'app/shared/assist.js'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content.json'), 'utf8')), byId = Object.fromEntries(data.scenarios.map((s) => [s.id, s]));
// the hook story, as main.js finds it: the build's scenario marked first (breakfast-qr since p4b-2), else airport-esim
const hookS = data.scenarios.find((s) => s.first) || byId['airport-esim'], HID = hookS.id;
const HOOK = hookS.gate || { 'airport-esim': 'You\'ve just landed at Pudong, and your phone has no signal.' }[HID], TAP = 'Tap to start · sound on', VIEW = [375, 553], WITHIN = 8000;
fs.mkdirSync(OUT, { recursive: true });
const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), '--port', String(port), ...(DIST ? ['--dist'] : WEB ? ['--web'] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
process.on('exit', () => server.kill()); // never left behind, however the run ends
await new Promise((r) => server.stdout.on('data', (d) => /kuaishuo:/.test(d) && r()));
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const expect = (name, ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(what)}`}`); if (!ok) problems.push(name); };

// Installed before the page's own code: the permission spies (each call, when, and how many taps and mic taps came
// before it), the taps themselves, a recogniser that hears the panel's answer (no KS_SIM: the real path from the mic's
// tap), and the first answer panel's arrival, with what it showed then.
function spies() {
  window.KS_PERM = []; window.KS_TAPS = [];
  const note = (what) => KS_PERM.push({ what, t: performance.now(), taps: KS_TAPS.length, mics: KS_TAPS.filter((x) => x.mic).length });
  const wrap = (o, k, what) => { if (o && typeof o[k] === 'function') { const f = o[k]; o[k] = function (...a) { note(what); return f.apply(this, a); }; } };
  wrap(navigator.mediaDevices, 'getUserMedia', 'getUserMedia');
  wrap(navigator.geolocation, 'getCurrentPosition', 'geolocation'); wrap(navigator.geolocation, 'watchPosition', 'geolocation');
  wrap(navigator.storage, 'persist', 'storage.persist');
  if (window.Notification) wrap(Notification, 'requestPermission', 'notifications');
  if (window.DeviceMotionEvent) wrap(DeviceMotionEvent, 'requestPermission', 'motion');
  if (window.DeviceOrientationEvent) wrap(DeviceOrientationEvent, 'requestPermission', 'orientation');
  // the recogniser: it hears the line the panel asks for (its answer, which tests can read), a moment after its start()
  class Recogniser {
    start() { note('recogniser.start'); const said = document.querySelector('.ks-ask')?.dataset.answer || ''; this.t = setTimeout(() => { this.onaudiostart?.(); const res = [{ transcript: said }]; res.isFinal = true; this.onresult?.({ resultIndex: 0, results: [res] }); this.onend?.(); }, 300); }
    stop() {}
    abort() { clearTimeout(this.t); this.onend?.(); }
  }
  window.SpeechRecognition = window.webkitSpeechRecognition = Recogniser;
  document.addEventListener('pointerdown', (e) => KS_TAPS.push({ t: performance.now(), gate: !!e.target.closest?.('.ks-boot'), mic: !!e.target.closest?.('.ks-mic') }), true);
  // (when it arrives; what it shows is read once it has been drawn, a moment later: KS_PANEL.read())
  new MutationObserver((rs, mo) => {
    const p = document.querySelector('.ks-card .ks-ask');
    if (!p) return;
    mo.disconnect();
    window.KS_PANEL = { t: performance.now(), read: () => { const clock = p.querySelector('.ks-ask-clock'); return { A: p.closest('.ks-card')?.dataset.assist, clock: !!clock && !clock.hidden, frame: !!p.querySelector('.ks-frame'), full: !!p.querySelector('.ks-help-full'), mode: p.dataset.mode }; } };
  }).observe(document, { childList: true, subtree: true });
}

// A phone-sized page (view: 375×553 unless given). store: ks.* to start from (clear: false keeps what the last page
// left); real: no KS_FAST and the recogniser stand-in (the first line, timed); else KS_FAST and KS_SIM answering right;
// now: KS_NOW
async function open(hash, { store = {}, clear = true, real = false, now = 0, view = VIEW } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: view[0], height: view[1], deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => problems.push(`${hash || '(feed)'}: ${e.message || e}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|Failed to load resource/.test(m.text())) problems.push(`${hash || '(feed)'}: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon|fonts\.g/.test(r.url())) problems.push(`${hash || '(feed)'}: ${r.status()} ${r.url()}`); });
  await page.evaluateOnNewDocument((store, clear, real, now) => {
    window.KS_NOW = now;
    try { if (clear) localStorage.clear(); for (const [k, v] of Object.entries(store)) localStorage.setItem('ks.' + k, JSON.stringify(v)); } catch {}
    window.KS_SAY = (a) => a; // the panel says its answer, for the recogniser stand-in and say-and-check
    if (!real) { window.KS_FAST = true; window.KS_SIM = (b) => (b ? b.answers[0] : null); }
  }, store, clear, real, now);
  if (real) await page.evaluateOnNewDocument(spies);
  await page.goto(`http://127.0.0.1:${port}/${hash ? `#${hash}` : ''}`, { waitUntil: 'networkidle0' });
  return page;
}
const until = async (page, fn, arg, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(60); } return false; };
const shot = (page, name) => page.evaluate(() => (window.KS_PAUSE = true)).then(() => page.screenshot({ path: path.join(OUT, `${name}.png`) })).finally(() => page.evaluate(() => (window.KS_PAUSE = false)).catch(() => {}));
// a tap where a thumb would land: a real click at the middle of the first one showing (laid out: a fixed element, the
// gate, has no offsetParent)
const tap = async (page, sel) => { const at = await page.evaluate((sel) => { const e = [...document.querySelectorAll(sel)].find((b) => b.getClientRects().length && !b.disabled); const r = e?.getBoundingClientRect(); return r && [r.left + r.width / 2, r.top + r.height / 2]; }, sel); if (at) await page.mouse.click(...at); return !!at; };
const mix = (page) => page.evaluate(() => ({ dealt: KS_MIX.dealt.map((d) => ({ ...d })), active: KS_MIX.feed.active, size: KS_MIX.feed.size }));
const rows = (page) => page.evaluate(() => { dispatchEvent(new Event('pagehide')); try { return JSON.parse(localStorage.getItem('ks.log')).rows; } catch { return []; } });
const stored = (page) => page.evaluate(() => { dispatchEvent(new Event('pagehide')); const g = (k) => JSON.parse(localStorage.getItem('ks.' + k) ?? 'null'); return { persona: g('model')?.persona ?? null, goals: g('goals'), born: g('born') }; });
// play card i to its end as the player would (KS_SIM answers right): Start and the like, the mic, typing, say-and-check
const play = (page, i, ms = 60000) => until(page, (i) => {
  const c = document.querySelectorAll('.ks-card')[i];
  if (!c || c.dataset.state === 'done') return !!c;
  const vis = (e) => e && e.offsetParent !== null && !e.disabled;
  const go = [...c.querySelectorAll('[data-test-go]')].find(vis), a = c.querySelector('.ks-ask');
  if (go) go.click();
  else if (a && !a.matches('.ks-shake, .ks-timeout')) {
    const next = a.querySelector('.ks-next'), mic = a.querySelector('.ks-mic'), input = a.querySelector('.ks-type input');
    if (vis(next)) next.click();
    else if (vis(mic)) { if (!a.classList.contains('ks-listening')) mic.click(); }
    else if (input && a.dataset.answer) { input.value = a.dataset.answer; input.dispatchEvent(new Event('input', { bubbles: true })); input.form ? input.form.requestSubmit() : a.querySelector('.ks-type button')?.click(); }
    else if (a.querySelector('.ks-reveal')) a.querySelector('.ks-reveal').click();
    else if (a.querySelector('.ks-yes')) a.querySelector('.ks-yes').click();
    else a.querySelector('.ks-skip')?.click();
  }
  return false;
}, i, ms);
const swipe = async (page, i) => { await page.evaluate((i) => document.querySelectorAll('.ks-card')[i]?.scrollIntoView(), i); await until(page, (i) => KS_MIX.feed.active === i, i, 5000); await sleep(150); };

try {
  // ---------- a fresh phone: the gate, no prompts, the first line in time and at FIRST_LINE ----------
  let now = 0;
  {
    const page = await open('', { real: true });
    await sleep(300);
    const gate = await page.evaluate(() => ({ hash: location.hash, hook: document.querySelector('.ks-gate-hook:not([hidden])')?.textContent || null, tap: document.querySelector('.ks-gate-tap')?.textContent, sheet: !!document.querySelector('.ks-sheet') }));
    await shot(page, 'gate');
    expect('a fresh phone opens on the feed (no hash), at the sound gate with the hook: the premise over the tap', gate.hash === '' && gate.hook === HOOK && gate.tap === TAP, gate);
    // the tap, as a thumb makes it, and the clock from it
    await tap(page, 'button.ks-boot');
    const came = await until(page, () => !!window.KS_PANEL, undefined, 20000);
    await sleep(250); // drawn
    const first = await page.evaluate(() => ({ ms: window.KS_PANEL ? Math.round(KS_PANEL.t - KS_TAPS[0].t) : null, panel: window.KS_PANEL?.read(), gate: KS_TAPS[0]?.gate, dealt: window.KS_MIX?.dealt[0], perm: [...KS_PERM], hear: document.querySelector('.ks-card .ks-ask .ks-hear')?.getAttribute('aria-label') }));
    await shot(page, 'first-line');
    console.log(`     the first answer panel came ${first.ms} ms after the gate's tap (the tap's pointerdown to the panel in the DOM, real time)`);
    expect(`card 1 is the hook story (${HID}, why.rule 'hook')`, first.dealt?.kind === 'scn' && first.dealt.id === HID && first.dealt.why?.rule === 'hook', first.dealt);
    expect(`…its first answer panel within ${WITHIN / 1000} s of the gate's tap`, came && first.gate && first.ms <= WITHIN, first);
    const k = LADDER[FIRST_LINE], free = k.help.hint;
    expect(`…at FIRST_LINE (A${FIRST_LINE}): ${k.clock ? 'its clock' : 'no clock'}, ${free === 2 ? 'the answer' : 'its frame'} up from the start`, first.panel && !first.panel.clock === !k.clock && (free === 2 ? first.panel.full : first.panel.frame), first.panel);
    expect(`…and hearing it again free, as A${FIRST_LINE} says it for you first (🔊 costs no star)`, LADDER[FIRST_LINE].echo ? first.hear === 'Hear it' : true, first.hear);
    expect('no permission prompt before the player taps a mic (nor at the gate)', !first.perm.length, first.perm);
    // the player taps the mic: the recogniser starts then, and only then
    await page.evaluate(() => (window.KS_PAUSE = false));
    await until(page, () => !!document.querySelector('.ks-ask .ks-mic')?.offsetParent, undefined, 10000);
    await tap(page, '.ks-ask .ks-mic');
    await until(page, () => window.KS_COUNT.lines > 0, undefined, 15000);
    // the rest of the card quickly, by the simulated voice
    await page.evaluate(() => { window.KS_FAST = true; window.KS_SIM = (b) => (b ? b.answers[0] : null); });
    await play(page, 0);
    const perm = await page.evaluate(() => [...KS_PERM]), rs = await rows(page), lines = rs.filter((r) => r.k === 'line' && r.id?.startsWith(HID + '/'));
    expect('…the recogniser starts only from the player\'s tap on the mic', perm.length >= 1 && perm.every((p) => p.what === 'recogniser.start' && p.mics >= 1), perm);
    expect(`…its row: the rung FIRST_LINE, its help free (assist ${FIRST_LINE}, free ${free})`, lines[0]?.assist === FIRST_LINE && lines[0].free === free && lines[0].res === 'ok', lines[0]);
    // the first FIRST_LINES lines a step down each (the line, not the try: KS_SIM answers right, so one row a line), then
    // the card's own rung, below the last of them, the row unmarked
    const ids = [...new Set(lines.map((r) => r.id))], line1 = (i) => lines.find((r) => r.id === ids[i]);
    const steps = ids.slice(0, FIRST_LINES).map((_, i) => line1(i)), then = line1(FIRST_LINES);
    expect(`…and the card's next lines a step down each (A${steps.map((r, i) => Math.max(FIRST_LINE - i, then?.assist ?? 0)).join(', A')}, their rows first ${steps.map((_, i) => i + 1).join(', ')}), then the card's own rung`,
      // (a step down to the card's own rung at most: at L0 a line not yet seen is A5 anyway, assist.js lineRung)
      steps.length === FIRST_LINES && steps.every((r, i) => r.assist === Math.max(FIRST_LINE - i, then?.assist ?? 0) && r.first === i + 1) && then?.assist <= steps[FIRST_LINES - 1]?.assist && then.first == null,
      lines.slice(0, FIRST_LINES + 2).map((r) => ({ id: r.id, att: r.att, assist: r.assist, free: r.free, first: r.first })));

    // ---------- card 2: the about card ----------
    await swipe(page, 1);
    await sleep(400);
    const card = await page.evaluate(() => {
      const c = document.querySelectorAll('.ks-card')[1], qs = c.querySelector('.ks-about-qs'), go = c.querySelector('.ks-about-go');
      return { kind: KS_MIX.dealt[1]?.kind, rule: KS_MIX.dealt[1]?.why?.rule, state: c.dataset.state, ask: c.dataset.ask, typed: c.querySelectorAll('input, select, textarea').length, buttons: c.querySelectorAll('.ks-about-qs button').length,
        fits: go.getBoundingClientRect().bottom <= innerHeight && c.getBoundingClientRect().top >= -1 && qs.scrollHeight <= qs.clientHeight + 1, inner: [qs.scrollHeight, qs.clientHeight], wide: document.documentElement.scrollWidth > innerWidth + 1, small: [...c.querySelectorAll('button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim()) };
    });
    await shot(page, 'about');
    expect('card 2 is the about card (why.rule \'about\'), done as it comes on screen, asking all three', card.kind === 'about' && card.rule === 'about' && card.state === 'done' && card.ask === 'home goals born', card);
    expect('…every question a tap (nothing to type), the whole card on a 375×553 screen, no button under 44 px', !card.typed && card.buttons >= 18 && card.fits && !card.wide && !card.small.length, card);
    // each answer as it's tapped: saved at once, and the card after it (dealt as this one came on screen) picked again
    await page.evaluate(() => (window.KS_NEXT = KS_MIX.dealt[2]));
    const saved = [], repicked = [];
    for (const [sel, want] of [['[data-p="dialect"]', { persona: 'dialect' }], ['[data-g="family"]', { goals: ['family'] }], ['[data-g="travel"]', { goals: ['family', 'travel'] }], ['[data-d="1990"]', null], ['[data-y="1994"]', { born: 1994 }]]) {
      await tap(page, `.ks-card:nth-child(2) .ks-about-qs ${sel}`);
      await sleep(120);
      if (want) { const s = await stored(page); saved.push({ sel, ok: Object.entries(want).every(([k, v]) => JSON.stringify(s[k]) === JSON.stringify(v)), s }); repicked.push(await page.evaluate(() => { const d = KS_MIX.dealt[2], again = !!d && d !== window.KS_NEXT; window.KS_NEXT = d; return again; })); }
    }
    await shot(page, 'about-answered');
    expect('…each answer saved as it\'s tapped (learner.persona(), ks.goals, ks.born)', saved.every((x) => x.ok), saved);
    expect('…and each one the card after it picked again from (the Mix hears it: placement\'s first story)', repicked.length === 4 && repicked.every(Boolean), repicked);
    // Settings opened over it (the menu): the home question answered there, the about card's drawn again as it now
    // stands, and the card after it picked again; answered back as it was, the same
    const home = () => page.evaluate(() => [...document.querySelectorAll('.ks-card')[1].querySelectorAll('.ks-about-qs [data-p]')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.p));
    const inSheet = async (sel) => { await page.evaluate((sel) => document.querySelector(`.ks-sheet .ks-you ${sel}`)?.scrollIntoView({ block: 'center' }), sel); await sleep(150); return tap(page, `.ks-sheet .ks-you ${sel}`); };
    await tap(page, '.ks-menu'); await page.waitForSelector('.ks-sheet'); await sleep(300);
    await inSheet('[data-p="mandarin"]'); await sleep(150);
    const over = { home: await home(), again: await page.evaluate(() => { const d = KS_MIX.dealt[2], again = !!d && d !== window.KS_NEXT; window.KS_NEXT = d; return again; }) };
    await inSheet('[data-p="dialect"]'); await sleep(150);
    over.back = await home();
    await page.evaluate(() => [...document.querySelectorAll('.ks-sheet button')].find((b) => b.textContent.trim() === 'Done')?.click());
    await until(page, () => !document.querySelector('.ks-sheet'), undefined, 3000);
    expect('…answered in Settings over it, the about card\'s question drawn again as Settings left it, the card after it picked again', JSON.stringify(over.home) === '["mandarin"]' && over.again && JSON.stringify(over.back) === '["dialect"]', over);
    // a swipe past keeps them
    await swipe(page, 2);
    const kept = await stored(page);
    expect('…a swipe past keeps them', kept.persona === 'dialect' && JSON.stringify(kept.goals) === '["family","travel"]' && kept.born === 1994, kept);
    const aboutRow = (await rows(page)).find((r) => r.k === 'card' && r.kind === 'about');
    const days = await page.evaluate(() => { const log = JSON.parse(localStorage.getItem('ks.log')).rows.filter((r) => r.k === 'card'); return { played: log.filter((r) => !r.again && !['recap', 'end', 'about'].includes(r.kind)).length, cards: Object.values(JSON.parse(localStorage.getItem('ks.days'))).reduce((n, d) => n + (d.cards || 0), 0) }; });
    expect('…its row logged (kind about, rule about), and not a card played in the day\'s numbers', aboutRow?.state === 'done' && aboutRow.rule === 'about' && days.cards === days.played, { aboutRow, days });

    // ---------- placement and the bonus, answering right ----------
    let bonus = -1;
    for (let i = 2; i < 14; i++) {
      const m = await mix(page);
      if (!m.dealt[i]) break;
      if (m.dealt[i].kind === 'bonus' && bonus < 0) {
        bonus = i;
        await sleep(300);
        const b = await page.evaluate((i) => { const c = document.querySelectorAll('.ks-card')[i]; return { label: c.querySelector('.ks-rev-label')?.textContent, q: c.querySelector('.ks-rev-q')?.textContent, note: c.querySelector('.ks-rev-note')?.textContent }; }, i);
        await shot(page, 'bonus');
        // how far up, from the say level Settings → Your Chinese shows (the menu over the card, read, closed)
        await tap(page, '.ks-menu'); await page.waitForSelector('.ks-sheet'); await sleep(300);
        const say = await page.evaluate(() => +(document.querySelector('.ks-sheet .ks-you-lv')?.textContent.match(/Say L(\d)/)?.[1] ?? NaN));
        await page.evaluate(() => [...document.querySelectorAll('.ks-sheet button')].find((x) => x.textContent.trim() === 'Done')?.click());
        await until(page, () => !document.querySelector('.ks-sheet'), undefined, 3000);
        const lv = +(b.label?.match(/level-(\d)/)?.[1] ?? NaN), up = lv - say, setting = byId[m.dealt[i].id?.split('/')[0]]?.setting || '';
        const q = up > 0 ? `One from ${up > 1 ? `${up} levels` : 'a level'} up!` : 'One from a story to come!';
        expect(`the bonus: a line a level up, labelled so ("${q}": L${lv} against Say L${say} in Settings), with its story's setting, saying a miss costs nothing`, /^Bonus · a level-\d line$/.test(b.label || '') && b.q === q && Number.isInteger(say) && (b.note || '').startsWith(setting) && setting && /costs nothing/.test(b.note || '') && !/a step harder/.test(b.note || ''), { ...b, say, setting });
      }
      if (i < 5) await shot(page, `placing-${i}`);
      await play(page, i);
      if (i < 13) await swipe(page, i + 1);
    }
    const m = await mix(page), rs2 = await rows(page), arms = await page.evaluate(() => JSON.parse(localStorage.getItem('ks.arms') || '{}'));
    const after = m.dealt.slice(2), stories = after.filter((d) => d.kind === 'scn'), firstStory = stories[0];
    expect('placement: the stories after the about card aim at τ 0.70 while placing (their why)', firstStory?.why?.tau === 0.7 && stories.filter((d) => d.why?.tau === 0.7).length >= 2, stories.map((d) => `${d.id} τ${d.why?.tau} ${d.why?.rule}`));
    const bonuses = m.dealt.filter((d) => d.kind === 'bonus'), brow = rs2.find((r) => r.k === 'line' && r.task === 'bonus');
    const before = bonus > 0 && m.dealt[bonus - 1];
    expect('the bonus once, after a strong card, not in the first 3, its line row task bonus', bonuses.length === 1 && bonus >= 3 && bonuses[0].why?.rule === 'bonus' && before && before.kind !== 'about' && !!brow, { bonus, dealt: m.dealt.map((d) => `${d.kind}:${d.id} ${d.why?.rule}`), brow, place: arms.place });
    expect('the about card never dealt again this visit', m.dealt.filter((d) => d.kind === 'about').length === 1, m.dealt.map((d) => d.kind));

    // ---------- the menu: your phrases and your numbers, and Back: For You as it was ----------
    // #phrases over a call or a chase done (one of this visit's again, card 14: their leave() puts them back to their
    // start, which a look at your phrases mustn't), #stats over the card after it as it is then
    const ran = await page.evaluate(() => { for (let k = 2; k < 14; k++) { const it = KS_MIX.feed.slot(k)?.item; if (it?.kind === 'scn' && ['call', 'chase'].includes(it.scn?.format)) return KS_MIX.feed.replace(14, { ...it }) && it.scn.format; } return null; });
    if (ran) { await swipe(page, 14); await play(page, 14); }
    expect('a call or a chase dealt in placement, played again done as card 14 (for the menu over it)', !!ran && (await page.evaluate(() => document.querySelectorAll('.ks-card')[14]?.dataset.state)) === 'done', ran);
    for (const to of ['#phrases', '#stats']) {
      if (to === '#stats') { await swipe(page, 15); await sleep(1500); }
      const look = () => page.evaluate(() => { dispatchEvent(new Event('pagehide')); const c = document.querySelectorAll('.ks-card')[KS_MIX.feed.active]; return { active: KS_MIX.feed.active, same: c === window.KS_ON, state: c?.dataset.state, arms: localStorage.getItem('ks.arms'), rows: JSON.parse(localStorage.getItem('ks.log') || '{"rows":[]}').rows.filter((r) => r.k === 'card').length }; });
      await page.evaluate(() => (window.KS_ON = document.querySelectorAll('.ks-card')[KS_MIX.feed.active]));
      const was = await look();
      await tap(page, '.ks-menu'); await page.waitForSelector('.ks-sheet'); await sleep(300);
      await tap(page, `.ks-menu-to[href="${to}"]`);
      const there = await until(page, (to) => location.hash === to && !!document.querySelector('main.ks-book, main.ks-stats') && !document.querySelector('.ks-sheet'), to, 5000);
      await shot(page, `menu-${to.slice(1)}`);
      await page.evaluate(() => [...document.querySelectorAll('main.ks-book button, main.ks-stats button')].find((b) => b.textContent.trim() === 'Back')?.click());
      await until(page, () => location.hash === '' && !document.querySelector('main.ks-book, main.ks-stats'), undefined, 5000);
      await sleep(300);
      const now = await look();
      expect(`${to} from the menu, and Back: For You as it was (the card on screen the same, ${was.state}; no card row logged; the arms unmoved)`, there && now.same && now.active === was.active && now.state === was.state && now.rows === was.rows && now.arms === was.arms, { was: { ...was, arms: undefined }, now: { ...now, arms: undefined }, arms: now.arms === was.arms });
    }

    // ---------- the menu: your phrases, your numbers, the lab, and Settings showing the answers ----------
    const menu = await page.evaluate(() => { const b = document.querySelector('.ks-menu'); return b && { label: b.getAttribute('aria-label'), left: Math.round(b.getBoundingClientRect().left), top: Math.round(b.getBoundingClientRect().top) }; });
    await tap(page, '.ks-menu');
    await page.waitForSelector('.ks-sheet');
    await sleep(400);
    await shot(page, 'menu');
    const sheet = await page.evaluate(() => {
      const s = document.querySelector('.ks-sheet'), pressed = (sel) => [...s.querySelectorAll(`.ks-you ${sel}`)].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.p || b.dataset.g || b.dataset.y);
      return { label: s.getAttribute('aria-label'), go: [...s.querySelectorAll('.ks-menu-to')].map((a) => [a.querySelector('span').textContent, a.getAttribute('href')]), settings: !!s.querySelector('h2')?.textContent.includes('Settings'), home: pressed('[data-p]'), goals: pressed('[data-g]'), born: pressed('[data-y]') };
    });
    expect('the menu where the back button sits (aria-label Menu)', menu?.label === 'Menu' && menu.left <= 20 && menu.top <= 14, menu);
    // (P5a's two first: today's challenge, its number the day's, and the situations you can handle)
    expect('…its sheet: Today\'s challenge, Situations, Your phrases, Your numbers, The lab, then Settings', sheet.label === 'Menu' && /^Today's challenge( · #\d+)?$/.test(sheet.go[0]?.[0]) && sheet.go[0][1] === '#challenge' && JSON.stringify(sheet.go.slice(1)) === JSON.stringify([['Situations', '#situations'], ['Your phrases', '#phrases'], ['Your numbers', '#stats'], ['The lab', '#lab']]) && sheet.settings, sheet);
    expect('…Settings → Your Chinese shows the answers (dialect; family and travel; 1994)', JSON.stringify(sheet.home) === '["dialect"]' && JSON.stringify(sheet.goals) === '["family","travel"]' && JSON.stringify(sheet.born) === '["1994"]', sheet);
    // a year tapped again is taken back: no ks.born at all (not a stored null: the ranker's not asked), then given again
    // (the picker back at the decades: 1990s, then 1994)
    const inYou = async (sel) => { await page.evaluate((sel) => document.querySelector(`.ks-sheet .ks-you ${sel}`)?.scrollIntoView({ block: 'center' }), sel); await sleep(150); await tap(page, `.ks-sheet .ks-you ${sel}`); await sleep(150); return page.evaluate(() => localStorage.getItem('ks.born')); };
    const taken = await inYou('[data-y="1994"]'), given = (await inYou('[data-d="1990"]'), await inYou('[data-y="1994"]'));
    expect('…a year tapped again there is taken back (no ks.born left: not asked), and given again', taken === null && given === '1994', { taken, given });
    await page.evaluate(() => { const s = document.querySelector('.ks-sheet'); s.scrollTop = s.scrollHeight; });
    await sleep(200);
    await shot(page, 'menu-you');
    await page.evaluate(() => (document.querySelector('.ks-sheet').scrollTop = 0)); // the places are at the top
    await sleep(150);
    await tap(page, '.ks-menu-to[href="#lab"]');
    await until(page, () => location.hash === '#lab' && document.querySelectorAll('.ks-v').length >= 5 && !document.querySelector('.ks-sheet'), undefined, 5000);
    const lab = await page.evaluate(() => ({ hash: location.hash, versions: document.querySelectorAll('.ks-v').length, back: document.querySelector('.ks-lab-feed')?.textContent, sheet: !!document.querySelector('.ks-sheet') }));
    await shot(page, 'lab');
    expect('…The lab: #lab, the launcher (five versions), with Back to the feed', lab.hash === '#lab' && lab.versions >= 5 && /Back to the feed/.test(lab.back || '') && !lab.sheet, lab);
    await tap(page, '.ks-lab-feed');
    const back = await until(page, () => location.hash === '' && !!document.querySelector('.ks-card') && !!document.querySelector('.ks-menu') && !document.querySelector('button.ks-boot'), undefined, 10000);
    await sleep(300);
    await shot(page, 'feed-again');
    expect('…and Back to the feed opens the feed again (no gate: sound is on)', back, await page.evaluate(() => ({ hash: location.hash, card: !!document.querySelector('.ks-card'), boot: !!document.querySelector('.ks-boot') })));
    now = await page.evaluate(() => +window.KS_NOW || 0);
    await page.close();
  }

  // ---------- the same phone, the next visit: the plain gate, and no about card ----------
  {
    const page = await open('', { clear: false, now: now + 31 * 60e3 });
    await sleep(300);
    const gate = await page.evaluate(() => ({ hook: document.querySelector('.ks-gate-hook:not([hidden])')?.textContent || null, tap: document.querySelector('.ks-gate-tap')?.textContent }));
    expect('a phone that has played sees the gate as before (no hook)', !gate.hook && gate.tap === TAP, gate);
    await page.click('button.ks-boot');
    await page.waitForSelector('.ks-card');
    for (let i = 0; i < 4; i++) { await play(page, i); if (i < 3) await swipe(page, i + 1); }
    const m = await mix(page);
    expect('…and the about card isn\'t dealt again on the next visit', m.dealt.length >= 4 && !m.dealt.some((d) => d.kind === 'about'), m.dealt.map((d) => `${d.kind}:${d.id} ${d.why?.rule}`));
    await page.close();
  }

  // ---------- another fresh phone, a bigger one (390×664): the about card swiped past with nothing tapped ----------
  {
    const page = await open('', { view: [390, 664] });
    await page.click('button.ks-boot');
    await page.waitForSelector('.ks-card');
    await play(page, 0);
    await swipe(page, 1);
    const d1 = (await mix(page)).dealt[1];
    await sleep(300);
    const fit = await page.evaluate(() => { const c = document.querySelectorAll('.ks-card')[1], qs = c.querySelector('.ks-about-qs'), small = [...c.querySelectorAll('button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).length; return { fits: c.querySelector('.ks-about-go').getBoundingClientRect().bottom <= innerHeight && qs.scrollHeight <= qs.clientHeight + 1, small }; });
    await shot(page, 'about-390');
    expect('…at 390×664 too: the whole about card on screen, no button under 44 px', fit.fits && !fit.small, fit);
    await swipe(page, 2);
    const s = await stored(page);
    expect('a fresh phone that swipes past the about card: nothing saved (each question still not asked)', d1?.kind === 'about' && s.persona == null && s.goals == null && s.born == null, { d1, s });
    for (let i = 2; i < 6; i++) { await play(page, i); if (i < 5) await swipe(page, i + 1); }
    const m = await mix(page);
    expect('…and it\'s never dealt again', m.dealt.filter((d) => d.kind === 'about').length === 1, m.dealt.map((d) => d.kind));
    await page.close();
  }

  // ---------- a third fresh phone: the page gone under the hook before a line was said ----------
  // the ranker deals the hook again on the next visit (nothing in the model, in spaced review or done), so the gate
  // shows its premise again (main.js never(): the ranker's reading, not "no row in the log")
  {
    let page = await open('');
    await page.click('button.ks-boot');
    await page.waitForSelector('.ks-card');
    await sleep(300);
    const d0 = (await mix(page)).dealt[0];
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); dispatchEvent(new Event('pagehide')); });
    const logged = await page.evaluate(() => JSON.parse(localStorage.getItem('ks.log') || '{"rows":[]}').rows.length);
    await page.close();
    page = await open('', { clear: false, now: 40 * 60e3 });
    await sleep(300);
    const gate = await page.evaluate(() => document.querySelector('.ks-gate-hook:not([hidden])')?.textContent || null);
    await page.click('button.ks-boot');
    await page.waitForSelector('.ks-card');
    await sleep(300);
    const again = (await mix(page)).dealt[0];
    expect('the page gone under the hook before a line (its rows logged): the next visit\'s gate has the premise again, over the hook', d0?.why?.rule === 'hook' && logged > 0 && gate === HOOK && again?.why?.rule === 'hook' && again.id === d0.id, { d0: d0 && `${d0.id} ${d0.why?.rule}`, logged, gate, again: again && `${again.id} ${again.why?.rule}` });
    await page.close();
  }
} finally { await browser.close(); server.kill(); }
console.log(problems.length ? `${problems.length} problems:\n  ${[...new Set(problems)].join('\n  ')}` : 'all good');
process.exit(problems.length ? 1 : 0);

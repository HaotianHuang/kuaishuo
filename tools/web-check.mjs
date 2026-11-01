#!/usr/bin/env node
// tools/web-check.mjs: the web build (docs/v2/web.md §7), packed fresh (node tools/pack.mjs --web) and served by
// serve.mjs --web, under the _headers Cloudflare Pages would apply:
//   build      nothing in web/ but what ships (no .md, maps, dot-files, review/, tools/); Pages' limits; data/ as it is,
//              the packs the content plays and no others, the bundle and CSS named by their contents; index.html's head
//              (the ks-build meta, icons, manifest, share tags, noscript); every local file a page, the manifest or the
//              content names is there; about.html and 404.html filled in, real documents, no inline script, 404's links
//              from the root (it's served at any depth); the manifest (display browser) and the icons at their sizes;
//              the headers on each kind of path; /x.html → /x; a lost pack a real 404
//   deploy     deploy-web.mjs's refusals: dry runs (with no wrangler on the PATH and no terminal, so none can deploy),
//              and its checks on trees of their own (web/ older than its sources, no contact, no web/)
//   chrome     a fresh phone at 390×844 and a desktop at 1440×900: the gate (Tap on a touch screen, Click with a pointer,
//              a link to About), the first story played to its end card, the next card the about card (↓ on the
//              desktop); the report mail (address, subject naming the story, its lines, the browser), the menu's About
//              and Send feedback, Settings → Start over leaving a fresh phone; no console errors, no CSP violation, no
//              request to any host but this one and Google Fonts, no sideways scroll
//   firefox    /Applications/Firefox.app over WebDriver BiDi, a fresh profile: no recogniser, through the gate, the first
//              story answered by typing to its end card, and the next card, with no console errors
//   pages      About and the 404 page in Chrome, at 390 and 1440: no errors, no CSP violation; 404's link home
//   slow       timed alone, last: Chrome's Fast 4G profile, a cold cache, voices in real time: the gate ready ≤ 3 s, the
//              first answer panel ≤ 8 s after the tap, ≤ 1.5 MB sent before the tap, the first story's pack ≤ 600 KB
//              (a timing over its budget is run once more before it counts: other jobs share this machine)
// Screenshots: review/web/.
//   node tools/web-check.mjs [--only=build,deploy,chrome,firefox,pages,slow] [--nopack] [--wrangler]
//   --nopack     check web/ as it is;  --wrangler  also wrangler pages dev web (local only), its headers serve's
import puppeteer, { PredefinedNetworkConditions } from 'puppeteer-core';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { readWeb, CSP, CACHE } from './webpage.mjs';
import { refusals } from './deploy-web.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), WEB = path.join(ROOT, 'web'), OUT = path.join(ROOT, 'review', 'web');
const opt = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d, has = (k) => process.argv.includes(`--${k}`);
const PARTS = ['build', 'deploy', 'chrome', 'firefox', 'pages', 'slow'], ONLY = opt('only', PARTS.join(',')).split(',');
if (ONLY.some((p) => !PARTS.includes(p))) { console.error(`--only=${PARTS.join(',')}`); process.exit(2); }
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const FIREFOX = process.env.FIREFOX || '/Applications/Firefox.app/Contents/MacOS/firefox';
const PHONE = [390, 844, true], DESK = [1440, 900, false];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), KB = (n) => `${(n / 1024).toFixed(0)} KB`;
const problems = [];
const expect = (name, ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(what)}`}`); if (!ok) problems.push(name); return ok; };
fs.mkdirSync(OUT, { recursive: true });

// dist/ (the artifact build) as it was before, to see that --web leaves it alone
const sums = (d) => (fs.existsSync(d) ? walk(d).map((f) => `${f} ${crypto.createHash('sha256').update(fs.readFileSync(path.join(d, f))).digest('hex')}`).join('\n') : null);
const walk = (d, pre = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`]));
const distBefore = sums(path.join(ROOT, 'dist'));
if (!has('nopack')) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/pack.mjs'), '--web'], { encoding: 'utf8' });
  process.stdout.write(r.stdout);
  if (r.status) { console.error(r.stderr); process.exit(1); }
}
const { web: site } = readWeb(ROOT), read = (f) => fs.readFileSync(path.join(WEB, f), 'utf8');
const data = JSON.parse(read('data/content.json')), byId = Object.fromEntries(data.scenarios.map((s) => [s.id, s]));
const files = walk(WEB), png = (f) => { const b = fs.readFileSync(path.join(WEB, f)); return `${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`; };
const js = files.find((f) => /^assets\/app-\w+\.js$/.test(f)), css = files.find((f) => /^assets\/app-\w+\.css$/.test(f)), packs = [...new Set(data.scenarios.map((s) => s.audio))].sort();

// every child of ours (the server, wrangler and its workerd) goes when this does, however it ends
const kids = [];
process.on('exit', () => kids.forEach((k) => { try { process.kill(-k.pid); } catch { k.kill(); } }));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));
const free = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const port = await free(), server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), '--web', '--port', String(port)], { stdio: ['ignore', 'pipe', 'inherit'], detached: true });
kids.push(server);
await new Promise((r) => server.stdout.on('data', (d) => /kuaishuo:/.test(d) && r()));
const HOST = `127.0.0.1:${port}`, BASE = `http://${HOST}/`;
// a request as a crawler makes it: no redirect followed, nothing compressed unless asked
const get = (url, headers = {}) => new Promise((ok, no) => http.get(url, { headers }, (res) => { const b = []; res.on('data', (c) => b.push(c)); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(b) })); }).on('error', no));
const cacheFor = (p) => CACHE.find(([k]) => new RegExp('^' + k.replace(/\*/g, '.*') + '$').test(p))?.[1] || 'public, max-age=0, must-revalidate';
const LOST = 'audio/lost-00000000.mp4';

// ---------- the build ----------
if (ONLY.includes('build')) {
  const TOP = ['index.html', 'about.html', '404.html', 'numbers.html', 'numbers.js', '_headers', 'manifest.webmanifest', 'og.png', 'web.json'], DIRS = ['assets', 'data', 'audio', 'art', 'icons'];
  const stray = files.filter((f) => f.split('/').some((s) => s.startsWith('.')) || /\.(md|map)$/i.test(f) || (f.includes('/') ? !DIRS.includes(f.split('/')[0]) : !TOP.includes(f)));
  if (!has('nopack')) expect('pack.mjs --web left dist/ as it was', sums(path.join(ROOT, 'dist')) === distBefore);
  expect(`nothing that mustn't ship (${files.length} files: the page and its pages (numbers.html and its script, the owner's), assets/, data/, audio/, art/, icons/, the manifest, the share image, web.json, _headers)`, !stray.length, stray);
  const big = files.filter((f) => fs.statSync(path.join(WEB, f)).size > 25 * 1048576);
  expect('Cloudflare Pages\' limits: every file under 25 MiB, fewer than 20,000 files', !big.length && files.length < 20000, big);
  const dataSrc = fs.readdirSync(path.join(ROOT, 'data')).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort();
  expect('data/ as it is', files.filter((f) => f.startsWith('data/')).sort().join() === dataSrc.map((f) => `data/${f}`).join() && dataSrc.every((f) => fs.readFileSync(path.join(ROOT, 'data', f)).equals(fs.readFileSync(path.join(WEB, 'data', f)))), files.filter((f) => f.startsWith('data/')));
  const audio = files.filter((f) => f.startsWith('audio/')).sort();
  const smaller = packs.every((f) => audio.includes(f) && fs.readFileSync(path.join(WEB, f)).equals(fs.readFileSync(path.join(ROOT, '.cache', 'pack', path.basename(f).replace(/\.mp4$/, '-32k.mp4')))));
  expect(`audio/: the ${packs.length} packs data/content.json plays, each in pack.mjs's smaller form, under its own name, and no others`, audio.join() === packs.join() && smaller, { extra: audio.filter((f) => !packs.includes(f)), missing: packs.filter((f) => !audio.includes(f)) });
  // art/ as tools/art.mjs left it, every story it names in it, and nothing for a story that isn't live
  const artSrc = fs.existsSync(path.join(ROOT, 'art')) ? fs.readdirSync(path.join(ROOT, 'art'), { recursive: true }).map(String).filter((f) => fs.statSync(path.join(ROOT, 'art', f)).isFile() && !f.split(path.sep).some((x) => x.startsWith('.'))).map((f) => `art/${f.split(path.sep).join('/')}`).sort() : [];
  const artIndex = artSrc.length ? JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'index.json'), 'utf8')) : { stories: {} }, live = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8')).scenarios.map((x) => x.id));
  expect('art/ as tools/art.mjs left it, for live stories only', files.filter((f) => f.startsWith('art/')).sort().join() === artSrc.join() && artSrc.every((f) => fs.readFileSync(path.join(ROOT, f)).equals(fs.readFileSync(path.join(WEB, f)))) && Object.keys(artIndex.stories).every((id) => live.has(id)), Object.keys(artIndex.stories).filter((id) => !live.has(id)));
  const named = (f) => f && f.includes(crypto.createHash('sha256').update(fs.readFileSync(path.join(WEB, f))).digest('hex').slice(0, 10));
  expect('assets/: the bundle and the CSS, one of each, named by their contents', files.filter((f) => f.startsWith('assets/')).length === 2 && named(js) && named(css), files.filter((f) => f.startsWith('assets/')));
  const bundle = read(js);
  expect('the bundle keeps nothing but localStorage and sends nothing but the daily totals, to api/count (tally.js; no cookie, IndexedDB, beacon, service worker)', !/document\.cookie|indexedDB|sendBeacon|serviceWorker|caches\.open/.test(bundle) && (bundle.match(/method:\s*['"]POST['"]/g) || []).length === 1 && bundle.includes('api/count'), bundle.match(/document\.cookie|indexedDB|sendBeacon|serviceWorker|caches\.open/g));

  const html = read('index.html');
  const HEAD = { doctype: /^<!doctype html>\n<html lang="en">/i, charset: /^[\s\S]{0,200}<meta charset="utf-8">/, viewport: /<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*">/, build: /<meta name="ks-build" content="web">/, title: /<title>[^<]+<\/title>/, description: /<meta name="description" content="[^"]{60,}">/, theme: /<meta name="theme-color" content="#\w+">/, favicon: /<link rel="icon" href="icons\/icon\.svg" type="image\/svg\+xml">/, apple: /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/, manifest: /<link rel="manifest" href="manifest\.webmanifest">/, og: /<meta property="og:title" content="[^"]+">[\s\S]*<meta property="og:description"/, twitter: /<meta name="twitter:card" content="summary(_large_image)?">/, reset: /<style>:root\{color-scheme:light/, fonts: /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=ZCOOL\+KuaiLe[^"]*">/, css: new RegExp(`<link rel="stylesheet" href="${css}">`), js: new RegExp(`<script src="${js}" defer></script>`), noscript: /<noscript>[\s\S]+<\/noscript>/, app: /<div id="app">/ };
  const lacks = Object.keys(HEAD).filter((k) => !HEAD[k].test(html));
  if (site.url) lacks.push(...['og:url', 'og:image'].filter((k) => !new RegExp(`<meta property="${k}" content="https://`).test(html)));
  expect('index.html: a real document with the web\'s head (charset, viewport-fit=cover, ks-build web, title, description, theme colour, icons, manifest, share tags, the reset, the fonts, the hashed CSS and JS, noscript)', !lacks.length, lacks);
  const inline = (t) => [...t.matchAll(/<script\b(?![^>]*\bsrc=)(?![^>]*type="application\/(?:ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g)].filter((m) => m[1].trim()).length;
  // every local file named: by the pages (from where each is served), the manifest and the content
  const refs = [];
  for (const f of ['index.html', 'about.html', '404.html']) for (const [, u] of read(f).matchAll(/(?:href|src)="([^"#]+)"/g)) if (!/^(https?:|data:|mailto:|blob:)/.test(u)) refs.push([f, u]);
  const there = (u, from) => { const p = new URL(u, `http://x/${from === '404.html' ? 'some/lost/path' : from}`).pathname.slice(1); return p === '' || files.includes(p) || files.includes(`${p}.html`) || files.includes(`${p}index.html`); };
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const lost = [...refs.filter(([f, u]) => !there(u, f)).map(([f, u]) => `${f}: ${u}`), ...manifest.icons.filter((i) => !files.includes(i.src)).map((i) => `manifest: ${i.src}`), ...packs.filter((f) => !files.includes(f))];
  expect(`every local file the pages, the manifest and the content name is there (${refs.length + manifest.icons.length + packs.length}), 404.html's from any depth`, !lost.length, lost);
  for (const f of ['about.html', '404.html']) {
    const t = read(f), bad = [];
    if (!/^<!doctype html>/i.test(t)) bad.push('no <!doctype html>');
    if (!/<html lang="en"/.test(t)) bad.push('no lang="en"');
    if (!/<meta charset="utf-8">/i.test(t)) bad.push('no charset');
    if (!/<meta name="viewport"/.test(t)) bad.push('no viewport');
    if (!/<title>[^<]+<\/title>/.test(t)) bad.push('no title');
    if (inline(t)) bad.push('an inline <script> (the CSP runs none)');
    if (/\{\{|\}\}|data-needs=/.test(t)) bad.push('not filled in');
    if (f === 'about.html') for (const [k, re] of [['contact', site.contact && new RegExp(`mailto:${site.contact.replace(/\./g, '\\.')}`)], ['by', site.by && site.by], ['Google Fonts', /Google Fonts/], ['Cloudflare', /Cloudflare/], ['Start over', /Start over/], ['Google (Chrome\'s recogniser)', /Google/], ['Apple (Safari\'s)', /Apple/], ['Firefox (none)', /Firefox/], ['cookies', /cookie/i], ['ElevenLabs', /ElevenLabs/], ['Kokoro', /Kokoro/]]) if (re && !(re instanceof RegExp ? re.test(t) : t.includes(re))) bad.push(`says nothing of ${k}`);
    if (f === '404.html' && !/<a [^>]*href="\/"/.test(t)) bad.push('no link home (href="/")');
    expect(`${f}: a real document, filled in from web.json, no inline script${f === 'about.html' ? ', saying what stays, what leaves (the recognisers, Google Fonts, Cloudflare), how it\'s made and who to write to' : ', a link home'}`, !bad.length, bad);
  }
  expect('index.html has no inline script (the CSP runs none)', !inline(html));
  const sizes = Object.fromEntries(['icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'og.png'].map((f) => [f, png(f)]));
  expect('the manifest: display browser (Add to Home Screen keeps Safari\'s recogniser), a name, its icons at their sizes', manifest.display === 'browser' && manifest.name && manifest.short_name && manifest.icons.every((i) => i.type === 'image/svg+xml' || sizes[i.src] === i.sizes.replace('x', '×')), manifest);
  expect('the icons and the share image at their sizes (180, 192, 512; 1200×630)', sizes['icons/apple-touch-icon.png'] === '180×180' && sizes['icons/icon-192.png'] === '192×192' && sizes['icons/icon-512.png'] === '512×512' && sizes['og.png'] === '1200×630' && /^<svg[^>]+viewBox/.test(read('icons/icon.svg')), sizes);

  // the headers on each kind of path, as serve.mjs --web applies _headers
  const KINDS = ['/', '/about', '/web.json', '/data/content.json', `/${js}`, `/${css}`, `/${packs[0]}`, '/icons/icon.svg', '/manifest.webmanifest', '/og.png'];
  const wrong = [];
  for (const p of KINDS) {
    const r = await get(BASE + p.slice(1)), h = r.headers, want = cacheFor(p);
    for (const [k, v] of [['status', r.status === 200], ['cache-control', h['cache-control'] === want], ['csp', h['content-security-policy'] === CSP], ['permissions', h['permissions-policy'] === 'microphone=(self), camera=(), geolocation=()'], ['referrer', h['referrer-policy'] === 'strict-origin-when-cross-origin'], ['nosniff', h['x-content-type-options'] === 'nosniff'], ['type', !!h['content-type'] && !/octet-stream/.test(h['content-type'])]]) if (!v) wrong.push(`${p} ${k}: ${k === 'status' ? r.status : k === 'cache-control' ? `${h[k]} (want ${want})` : k === 'csp' ? h['content-security-policy'] : h[k] ?? h['content-type']}`);
  }
  expect(`the headers on each kind of path (${KINDS.length}): the CSP, permissions, referrer, nosniff, and the cache rules (a year immutable for assets/ and audio/, a day for icons, no-cache for the page, About, data/)`, !wrong.length, wrong);
  const moved = await get(BASE + 'about.html'), home = await get(BASE + 'index.html'), miss = await get(BASE + LOST), hidden = await get(BASE + '_headers'), zipped = await get(BASE + 'data/content.json', { 'accept-encoding': 'gzip, deflate, br' });
  expect('/about.html → 308 /about and /index.html → 308 /, as Pages does', moved.status === 308 && moved.headers.location === '/about' && home.status === 308 && home.headers.location === '/', [moved.status, moved.headers.location, home.status, home.headers.location]);
  expect('a lost pack is a real 404 (404.html, under the same CSP), not index.html with a 200; _headers isn\'t served', miss.status === 404 && miss.body.equals(fs.readFileSync(path.join(WEB, '404.html'))) && miss.headers['content-security-policy'] === CSP && hidden.status === 404, [miss.status, hidden.status]);
  expect('text goes compressed, as Pages sends it', zipped.headers['content-encoding'] === 'gzip', zipped.headers['content-encoding']);

  if (has('wrangler')) {
    // the last word on how Pages reads _headers: wrangler's own local server (no deploy, no account, no metrics)
    const wport = await free();
    const w = spawn('wrangler', ['pages', 'dev', 'web', '--port', String(wport), '--ip', '127.0.0.1'], { cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    kids.push(w);
    let log = ''; w.stdout.on('data', (d) => (log += d)); w.stderr.on('data', (d) => (log += d));
    const WB = `http://127.0.0.1:${wport}/`;
    let up = false;
    for (let t = Date.now(); !up && Date.now() - t < 60000; await sleep(500)) up = await get(WB).then((r) => r.status === 200, () => false);
    const differ = [];
    if (up) for (const p of [...KINDS, '/about.html', '/' + LOST]) {
      const a = await get(BASE + p.slice(1)), b = await get(WB + p.slice(1));
      for (const k of ['content-security-policy', 'permissions-policy', 'referrer-policy', 'x-content-type-options', 'cache-control', 'location', 'content-type']) {
        const [x, y] = [a, b].map((r) => (k === 'content-type' ? (r.headers[k] || '').split(';')[0] : r.headers[k] || ''));
        if (x !== y && !(a.status === 308 && k === 'cache-control')) differ.push(`${p} ${k}: serve ${x} · wrangler ${y}`);
      }
      if (a.status !== b.status) differ.push(`${p}: serve ${a.status} · wrangler ${b.status}`);
    }
    expect('wrangler pages dev web serves it with the same headers, types, redirects and 404 as serve.mjs --web', up && !differ.length, up ? differ : log.slice(-600));
    try { process.kill(-w.pid); } catch {}
  }
}

// ---------- deploy-web.mjs's refusals: nothing here can deploy ----------
if (ONLY.includes('deploy')) {
  // no wrangler on the PATH and no terminal: even a broken refusal can't reach a deploy
  const dry = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tools/deploy-web.mjs'), ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: '/usr/bin:/bin' } });
  let r = dry('--dry-run');
  expect('deploy-web --dry-run: web/ fresh and a contact set, it would run wrangler pages deploy web --project-name kuaishuo --branch preview', r.status === 0 && r.stdout.trim() === 'would run: wrangler pages deploy web --project-name kuaishuo --branch preview', r.stdout + r.stderr);
  r = dry('--dry-run', '--production');
  expect('deploy-web --dry-run --production: the same with no --branch preview', r.status === 0 && r.stdout.trim() === 'would run: wrangler pages deploy web --project-name kuaishuo', r.stdout + r.stderr);
  const others = ['freelearninggame', 'huangetal-org', 'huangetal', ''].map((p) => dry('--dry-run', `--project-name=${p}`)).concat(dry('--dry-run', '--project-name', 'huangetal-org'));
  expect('any other Cloudflare Pages project is refused (freelearninggame, huangetal-org, huangetal, none)', others.every((x) => x.status === 1 && /project is kuaishuo only/.test(x.stderr)), others.map((x) => x.stderr.trim()));
  r = dry('--project-name', 'kuaishuo');
  expect('for real, with no terminal to ask the owner at, it refuses', r.status === 1 && /at a terminal/.test(r.stderr), r.stdout + r.stderr);
  r = dry('--dry-run', '--prod');
  expect('an unknown flag is refused, not ignored', r.status === 1 && /unknown: --prod/.test(r.stderr), r.stderr);
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-deploy-')), put = (f, s, ago = 0) => { fs.mkdirSync(path.dirname(path.join(t, f)), { recursive: true }); fs.writeFileSync(path.join(t, f), s); const at = new Date(Date.now() - ago * 1000); fs.utimesSync(path.join(t, f), at, at); };
  try {
    const none = refusals({ root: t, project: 'kuaishuo' });
    put('web.json', JSON.stringify({ contact: 'hello@huangetal.org' }), 120); put('web/index.html', '<!doctype html>', 60); put('app/main.js', '//', 0);
    const stale = refusals({ root: t, project: 'kuaishuo' });
    put('web/index.html', '<!doctype html>', 0); put('web.json', JSON.stringify({ name: '快说', contact: ' ' }), 30);
    const nocontact = refusals({ root: t, project: 'kuaishuo' });
    put('web.json', JSON.stringify({ contact: 'hello@huangetal.org' }), 30);
    const fine = refusals({ root: t, project: 'kuaishuo' });
    expect('refused: no web/; a web/ older than a source (app/main.js); a web.json with no contact; and not when all\'s well', none.some((w) => /no web\//.test(w)) && stale.length === 1 && /older than app\/main\.js/.test(stale[0]) && nocontact.length === 1 && /no contact/.test(nocontact[0]) && !fine.length, { none, stale, nocontact, fine });
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
}

// ---------- the browsers ----------
const SPY = (fast, sim, say) => {
  window.KS_CSP = [];
  document.addEventListener('securitypolicyviolation', (e) => window.KS_CSP.push(`${e.violatedDirective}: ${e.blockedURI || 'inline'}`));
  if (fast) window.KS_FAST = true;
  if (sim) window.KS_SIM = (beat) => (beat ? beat.answers[0] : null); // the recogniser hears each line said right
  if (say) window.KS_SAY = (line) => line; // no recogniser: the panel shows its line (data-answer), for typing in
};
async function fresh(browser, [w, h, touch], { fast = true, sim = true, say = false } = {}) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : null, page = await (ctx || browser).newPage();
  // WebDriver BiDi (Firefox) sets a size, not a phone: no touch, so its gate says Click
  await page.setViewport({ width: w, height: h, ...(browser.protocol === 'cdp' ? { deviceScaleFactor: touch ? 2 : 1, isMobile: touch, hasTouch: touch } : {}) });
  const seen = { errors: [], hosts: [], self: [] };
  page.on('console', (m) => { if (m.type() === 'error') seen.errors.push(m.text()); });
  page.on('pageerror', (e) => seen.errors.push(String(e?.message || e)));
  page.on('request', (r) => { try { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && u.host !== HOST && !/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) seen.hosts.push(r.url()); } catch {} });
  await page.evaluateOnNewDocument(SPY, fast, sim, say);
  return { ctx, page, seen };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch((e) => console.log(`(no screenshot ${name}: ${e.message})`));
const csp = (page) => page.evaluate(() => window.KS_CSP || []).catch(() => []);

// a real click where the thing shows (a tap, on a phone), or el.click() if it isn't on screen; within card i if given
async function press(page, sel, i = null) {
  const at = await page.evaluate((sel, i) => {
    const root = i == null ? document : document.querySelectorAll('.ks-card')[i];
    const e = [...(root?.querySelectorAll(sel) || [])].find((b) => b.getClientRects().length && !b.disabled);
    if (!e) return null;
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && e.contains(document.elementFromPoint(x, y))) return [x, y];
    e.click();
    return 'clicked';
  }, sel, i).catch(() => null);
  if (Array.isArray(at)) await page.mouse.click(at[0], at[1]);
  return !!at;
}

// One card played to its end: its start buttons, each answer panel (by the recogniser hearing KS_SIM's line; or typed:
// the Type tab, then the panel's own line typed in and sent), each verdict touched and moved on, until the card is done
async function play(page, i, typed) {
  const t0 = Date.now(), modes = new Set();
  while (Date.now() - t0 < 120000) {
    const s = await page.evaluate((i) => {
      const card = document.querySelectorAll('.ks-card')[i];
      if (!card) return { state: 'missing' };
      const vis = (e) => !!e && e.getClientRects().length > 0 && !e.disabled, ask = card.querySelector('.ks-ask'), next = ask?.querySelector('.ks-next');
      if (vis(next)) ask.dispatchEvent(new PointerEvent('pointerdown')); // as someone reading the verdict would touch it
      return { state: card.dataset.state || '', go: [...card.querySelectorAll('[data-test-go]')].some(vis), ask: !!ask, mode: ask?.dataset.mode || '', busy: !!ask?.matches('.ks-shake, .ks-timeout, .ks-done') || ask?.dataset.ksTyped === '1',
        mic: vis(ask?.querySelector('.ks-mic')), listening: !!ask?.classList.contains('ks-listening'), next: vis(next), tab: vis(ask?.querySelector('.ks-modes [data-m=type]')), input: vis(ask?.querySelector('.ks-type input')) };
    }, i).catch((e) => ({ state: 'error', why: e.message }));
    if (s.state === 'done') return { ok: true, modes: [...modes] };
    if (s.state === 'missing' || s.state === 'error') return { ok: false, why: `card ${i}: ${s.why || 'missing'}`, modes: [...modes] };
    if (s.ask && s.mode) modes.add(s.mode);
    if (s.go) await press(page, '[data-test-go]', i);
    else if (s.next) await press(page, '.ks-ask .ks-next', i);
    else if (s.ask && !s.busy && typed && s.mode !== 'type' && s.tab) await press(page, '.ks-ask .ks-modes [data-m=type]', i);
    else if (s.ask && !s.busy && typed && s.input) {
      await page.evaluate((i) => {
        const ask = document.querySelectorAll('.ks-card')[i].querySelector('.ks-ask'), input = ask.querySelector('.ks-type input');
        ask.dataset.ksTyped = '1'; // once a panel: its verdict comes next
        input.value = ask.dataset.answer; input.dispatchEvent(new Event('input', { bubbles: true }));
        input.form ? input.form.requestSubmit() : ask.querySelector('.ks-type button')?.click();
      }, i);
    } else if (s.ask && !typed && s.mic && !s.listening) await press(page, '.ks-ask .ks-mic', i);
    await sleep(150);
  }
  return { ok: false, why: `card ${i} didn't finish in 120 s`, modes: [...modes] };
}

const onScreen = (page, i) => page.evaluate((i) => { const c = document.querySelectorAll('.ks-card')[i]; const r = c?.getBoundingClientRect(); return !!r && Math.abs(r.top) < 4 && r.height > 100; }, i).catch(() => false);
const gateOf = (page) => page.evaluate(() => ({ tap: document.querySelector('.ks-gate-tap')?.textContent || '', hook: document.querySelector('.ks-gate-hook:not([hidden])')?.textContent || null, about: [...document.querySelectorAll('a[href]')].some((a) => /(^|\/)about(\.html)?$/.test(a.getAttribute('href')) && a.getClientRects().length) }));
const keys = (page) => page.evaluate(() => { try { return Object.keys(localStorage).filter((k) => k.startsWith('ks.')).sort(); } catch { return ['(no localStorage)']; } });
// the mail a mailto: would open: its address, subject and body
const mail = (href) => { const m = /^mailto:([^?]*)\?(.*)$/.exec(href || ''); if (!m) return null; const q = Object.fromEntries(m[2].split('&').map((kv) => kv.split('=')).map(([k, v]) => [k, decodeURIComponent(v || '')])); return { to: decodeURIComponent(m[1]), subject: q.subject || '', body: q.body || '' }; };

let chrome = null;
const launchChrome = async () => (chrome ||= await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] }));

if (ONLY.includes('chrome')) {
  const b = await launchChrome();
  let freshKeys = null;
  for (const view of [PHONE, DESK]) {
    const tag = `chrome-${view[0]}`, { ctx, page, seen } = await fresh(b, view);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.waitForSelector('button.ks-boot', { timeout: 15000 }).catch(() => {});
    const gate = await gateOf(page);
    freshKeys ??= await keys(page);
    await shot(page, `${tag}-gate`);
    expect(`${tag}: the gate says ${view[2] ? 'Tap' : 'Click'} (${view[2] ? 'a touch screen' : 'a pointer'}), with the hook, and a link to About`, (view[2] ? /^Tap\b/ : /^Click\b/).test(gate.tap) && !!gate.hook && gate.about, gate);
    await press(page, 'button.ks-boot');
    await page.waitForSelector('.ks-card', { timeout: 15000 }).catch(() => {});
    const first = await play(page, 0, false);
    await sleep(400);
    await shot(page, `${tag}-end`);
    const d0 = await page.evaluate(() => JSON.stringify(window.KS_MIX?.dealt?.[0] || {}));
    const scn = data.scenarios.find((s) => d0.includes(`"${s.id}"`));
    expect(`${tag}: the first story (${scn?.id || '?'}) played to its end card`, first.ok, first);
    if (view === PHONE) {
      // the report mail, from the end card
      const href = await page.evaluate(() => document.querySelectorAll('.ks-card')[0]?.querySelector('a.ks-report')?.getAttribute('href'));
      // a line: "4. airport-esim/itsme 是我！我在三号出口。 · right ★★★ · spoken · heard “…”"
      const m = mail(href), lines = m ? [...m.body.matchAll(/^\d+\. (\S+) (\S+)/gm)] : [];
      expect(`${tag}: "Something sound wrong?" mails ${site.contact}, its subject naming the story, its body the lines just played (id, text, what was heard) and the browser`, !!m && m.to === site.contact && !!scn && m.subject.includes(scn.id) && m.subject.includes(scn.title) && lines.length > 0 && lines.every((l) => l[1].startsWith(`${scn.id}/`) && /[一-鿿]/.test(l[2])) && /heard “/.test(m.body) && /Browser: .*Chrome/.test(m.body), m || href);
      if (m) console.log(`     the report: ${m.to} · ${m.subject} · ${m.body.split('\r\n').filter(Boolean).length} lines, ${href.length} characters`);
    }
    // the next card: the about card, by ↓ on the desktop (web.md §5), brought up on the phone
    if (view[2]) await page.evaluate(() => document.querySelectorAll('.ks-card')[1]?.scrollIntoView());
    else await page.keyboard.press('ArrowDown');
    await sleep(900);
    const next = await page.evaluate(() => ({ kind: window.KS_MIX?.dealt?.[1]?.kind, n: document.querySelectorAll('.ks-card').length }));
    const there = await onScreen(page, 1);
    await shot(page, `${tag}-about-card`);
    expect(`${tag}: the next card is the about card${view[2] ? '' : ', brought on screen by ↓'}`, next.kind === 'about' && there, { ...next, onScreen: there });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(`${tag}: nothing scrolls sideways`, !wide);
    if (view === PHONE) {
      // the menu: About and Send feedback; then Settings → Start over
      await press(page, 'button.ks-menu');
      await page.waitForSelector('.ks-menu-about', { timeout: 5000 }).catch(() => {});
      await sleep(400);
      await shot(page, `${tag}-menu`);
      const menu = await page.evaluate(() => ({ about: document.querySelector('a.ks-menu-about')?.href || null, feedback: document.querySelector('a.ks-menu-feedback')?.getAttribute('href') || null }));
      const fb = mail(menu.feedback);
      expect(`${tag}: the menu has About (the about page) and Send feedback (a mail to ${site.contact})`, !!menu.about && /\/about(\.html)?$/.test(new URL(menu.about).pathname) && fb?.to === site.contact && /feedback/i.test(fb.subject), menu);
      const before = await keys(page);
      const asked = await press(page, '.ks-start-over');
      await page.waitForSelector('.ks-start-over-yes', { timeout: 5000 }).catch(() => {});
      await sleep(300);
      await shot(page, `${tag}-start-over`);
      const sure = await page.evaluate(() => document.querySelector('.ks-start-over-yes')?.closest('[role=dialog], .ks-sheet, .ks-confirm, div')?.textContent?.trim().slice(0, 300) || null);
      seen.errors.push(...(await csp(page)).map((v) => `CSP ${v}`));
      await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}), press(page, '.ks-start-over-yes')]);
      await page.waitForSelector('button.ks-boot', { timeout: 15000 }).catch(() => {});
      const after = await keys(page), again = await gateOf(page);
      await shot(page, `${tag}-after-start-over`);
      expect(`${tag}: Settings → Start over (its confirm saying what goes) leaves a fresh phone: the hook's gate again, nothing kept but what a new phone has (${before.length} keys before)`, asked && !!sure && after.join() === freshKeys.join() && !!again.hook && before.length > after.length, { asked, sure, before, after, freshKeys, hook: again.hook });
    }
    const v = await csp(page);
    expect(`${tag}: no console errors, no CSP violations, no other hosts`, !seen.errors.length && !v.length && !seen.hosts.length, { errors: seen.errors, csp: v, hosts: seen.hosts });
    await (ctx || page).close();
  }
}

if (ONLY.includes('pages')) {
  const b = await launchChrome();
  for (const view of [PHONE, DESK]) {
    const tag = `${view[0]}`, { ctx, page, seen } = await fresh(b, view);
    const a = await page.goto(BASE + 'about.html', { waitUntil: 'networkidle0' });
    await shot(page, `about-${tag}`);
    const about = await page.evaluate(() => ({ path: location.pathname, wide: document.documentElement.scrollWidth > innerWidth + 1, text: document.body.innerText.length }));
    const lost = await page.goto(BASE + 'no/such/page', { waitUntil: 'networkidle0' });
    await shot(page, `404-${tag}`);
    // Chrome logs a page that comes with a 404 as a failed resource: that one is the point here
    const errors = seen.errors.filter((e) => !/status of 404/.test(e)), v = await csp(page);
    expect(`about.html at ${tag}: /about, 200, readable, nothing sideways`, a?.status() === 200 && about.path === '/about' && about.text > 400 && !about.wide, { status: a?.status(), ...about });
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), press(page, 'a[href="/"]')]);
    const back = await page.waitForSelector('button.ks-boot', { timeout: 15000 }).then(() => true, () => false);
    expect(`404 at ${tag}: a 404 for a lost path, and its link home opens the game`, lost?.status() === 404 && back, { status: lost?.status(), back });
    expect(`About and 404 at ${tag}: no console errors, no CSP violations, no other hosts`, !errors.length && !v.length && !seen.hosts.length, { errors, csp: v, hosts: seen.hosts });
    await (ctx || page).close();
  }
}

// ---------- Firefox: no recogniser, so the game is played by typing ----------
if (ONLY.includes('firefox')) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-firefox-'));
  let ff = null;
  try {
    ff = await puppeteer.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true, userDataDir: profile, extraPrefsFirefox: { 'media.autoplay.default': 0, 'media.volume_scale': '0.0' } });
    const { page, seen } = await fresh(ff, PHONE, { sim: false, say: true });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('button.ks-boot', { timeout: 20000 }).catch(() => {});
    await sleep(500);
    const gate = await gateOf(page), sr = await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
    await shot(page, 'firefox-gate');
    await press(page, 'button.ks-boot');
    await page.waitForSelector('.ks-card .ks-ask', { timeout: 30000 }).catch(() => {});
    await sleep(500);
    await shot(page, 'firefox-panel');
    const first = await play(page, 0, true);
    await sleep(400);
    await shot(page, 'firefox-end');
    const end = await page.evaluate(() => { const c = document.querySelectorAll('.ks-card')[0]; let rows = []; try { rows = (JSON.parse(localStorage.getItem('ks.log') || '{}').rows || []).filter((r) => r.k === 'line'); } catch {} return { state: c?.dataset.state, report: !!c?.querySelector('a.ks-report'), lines: rows.map((r) => `${r.id} ${r.res} ${r.mode}${r.stars ? ` ${r.stars}★` : ''}`) }; });
    await page.evaluate(() => document.querySelectorAll('.ks-card')[1]?.scrollIntoView());
    await sleep(1200);
    const next = await page.evaluate(() => ({ n: document.querySelectorAll('.ks-card').length, kind: window.KS_MIX?.dealt?.[1]?.kind }));
    const there = await onScreen(page, 1);
    await shot(page, 'firefox-next');
    expect(`firefox: no recogniser, the gate (${gate.tap}), the first story answered by typing (${first.modes.join(', ') || 'no panels'}), every line right (${end.lines.length}), to its end card${end.report ? ' with its report link' : ''}, and the next card (${next.kind || '?'})`, !sr && first.ok && first.modes.includes('type') && end.lines.length > 0 && end.lines.every((l) => / ok type/.test(l)) && end.state === 'done' && there, { sr, first, end, next, there });
    const v = await csp(page);
    expect('firefox: no console errors, no CSP violations, no other hosts', !seen.errors.length && !v.length && !seen.hosts.length, { errors: seen.errors, csp: v, hosts: seen.hosts });
  } catch (e) { expect('firefox: driven over WebDriver BiDi', false, String(e?.message || e)); }
  finally { await ff?.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true }); }
}

// ---------- the slow phone, alone and last ----------
if (ONLY.includes('slow')) {
  const b = await launchChrome();
  const budget = async (run) => {
    const { ctx, page, seen } = await fresh(b, PHONE, { fast: false, sim: false });
    await page.emulateNetworkConditions(PredefinedNetworkConditions['Fast 4G']);
    const cdp = await page.createCDPSession(), urls = new Map(), done = [];
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
    cdp.on('Network.loadingFinished', (e) => done.push({ url: urls.get(e.requestId), bytes: e.encodedDataLength }));
    // the gate's arrival, the tap (its pointerdown) and the first answer panel's, in the page's own clock (from navigation)
    await page.evaluateOnNewDocument(() => {
      window.KS_T = {};
      new MutationObserver(() => { if (!KS_T.gate && document.querySelector('button.ks-boot')) KS_T.gate = performance.now(); if (KS_T.tap && !KS_T.panel && document.querySelector('.ks-card .ks-ask')) KS_T.panel = performance.now(); }).observe(document, { childList: true, subtree: true });
      document.addEventListener('pointerdown', (e) => { if (!KS_T.tap && e.target.closest?.('.ks-boot')) KS_T.tap = performance.now(); }, true);
    });
    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('button.ks-boot', { timeout: 30000 }).catch(() => {});
    await sleep(1000); // a person reads the gate first: whatever the page fetches meanwhile counts as before the tap
    const before = done.reduce((s, d) => s + d.bytes, 0), n = done.length;
    await shot(page, `slow-gate-${run}`);
    await press(page, 'button.ks-boot');
    await page.waitForFunction(() => window.KS_T.panel, { timeout: 30000 }).catch(() => {});
    await shot(page, `slow-panel-${run}`);
    const t = await page.evaluate(() => window.KS_T);
    for (let k = 0; k < 40 && !done.some((d) => /\/audio\/.+\.mp4$/.test(d.url || '')); k++) await sleep(250);
    const pack = done.find((d) => /\/audio\/.+\.mp4$/.test(d.url || ''));
    await (ctx || page).close();
    return { gate: Math.round(t.gate), panel: t.panel && t.tap ? Math.round(t.panel - t.tap) : null, before, requests: n, pack: pack?.bytes ?? null, packName: pack?.url?.replace(BASE, '') || null, errors: seen.errors };
  };
  let r = await budget(1);
  const within = (r) => r.gate <= 3000 && r.panel != null && r.panel <= 8000;
  if (!within(r)) { console.log(`     over the time budget once (gate ${r.gate} ms, panel ${r.panel} ms): run again, alone`); r = await budget(2); }
  console.log(`     Fast 4G, cold: the gate ready at ${r.gate} ms; the first answer panel ${r.panel} ms after the tap; ${KB(r.before)} sent before the tap (${r.requests} requests); the first story's pack ${r.pack != null ? KB(r.pack) : '?'} (${r.packName})`);
  expect('a slow phone (Fast 4G, cold cache): gate ≤ 3 s, first panel ≤ 8 s after the tap, ≤ 1.5 MB before the tap, first pack ≤ 600 KB', within(r) && r.before <= 1.5 * 1048576 && r.pack != null && r.pack <= 600 * 1024 && !r.errors.length, r);
}

await chrome?.close();
console.log(problems.length ? `\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}` : '\nall good');
process.exit(problems.length ? 1 : 0);

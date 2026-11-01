#!/usr/bin/env node
// tools/pack.mjs: index.html + app/ → dist/index.html, one page with the CSS and the bundled JS inline (the
// claude.ai artifact frame only loads scripts from a few CDNs, so ours ride inside the page). data/ and the voice packs
// data/content.json plays are copied beside it and published as the artifact's files. Prints the files list for the
// Artifact tool. Everything that can fail runs before dist/ is touched, so a failed pack leaves the last one in place.
// With --web, web/ for Cloudflare Pages instead (docs/v2/web.md), and dist/ is left as it was: a real document whose
// bundle and CSS are files a return visit has cached (assets/app-<hash>.js, .css), data/ as it is, the same smaller
// voices under the packs' own names, app/web/ (about, 404, icons, the share image) with web.json's fields filled in, the
// manifest and _headers (tools/webpage.mjs), and the pixel art (art/, tools/art.mjs).
//   node tools/pack.mjs            then: node tools/serve.mjs --dist   (or node tools/test.mjs --dist)
//   node tools/pack.mjs --web      then: node tools/serve.mjs --web    (or node tools/web-check.mjs)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import { readWeb, fill, indexPage, manifest, headers, NEEDS } from './webpage.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), DIST = path.join(ROOT, 'dist'), WEB = path.join(ROOT, 'web');

const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FONTS = /(<link rel="stylesheet" href="https:\/\/fonts[^>]+>)/, MAIN = /<script type="module" src="app\/main.js"><\/script>/;
if (!FONTS.test(page) || !MAIN.test(page)) throw new Error('index.html has lost the fonts <link> or the main.js <script> that the CSS and JS go in');
const css = [...page.matchAll(/<link rel="stylesheet" href="(app\/[^"]+)">/g)].map((m) => fs.existsSync(path.join(ROOT, m[1])) ? `/* ${m[1]} */\n` + fs.readFileSync(path.join(ROOT, m[1]), 'utf8') : '').join('\n');
const built = await esbuild.build({ entryPoints: [path.join(ROOT, 'app/main.js')], bundle: true, format: 'iife', minify: true, target: ['es2020', 'safari14'], write: false, legalComments: 'none' });
const bundle = built.outputFiles[0].text, js = bundle.replace(/<\/script/gi, '<\\/script');
// esbuild lowers syntax for safari14 but adds no polyfills, and these came later: on an older iPhone they throw
const newer = js.match(/\.at\(|\.findLast|\.to(?:Sorted|Reversed|Spliced)\(|Object\.(?:hasOwn|groupBy)|structuredClone|randomUUID|AbortSignal\.(?:timeout|any)|throwIfAborted|withResolvers|showModal|\(\?<[=!]/);
if (newer) throw new Error(`the bundle uses ${newer[0]}, which Safari 14 doesn't have: …${js.slice(Math.max(0, newer.index - 60), newer.index + 30)}…`);
const styles = (await esbuild.transform(css, { loader: 'css', minify: true, target: ['safari14'] })).code, cssMin = styles.replace(/<\/style/gi, '<\\/style');
// the voices, each pack the content plays made smaller for the page (mono 32 kbps AAC, Apple's encoder where ffmpeg has
// it; the timings don't move), kept in .cache/pack/ by the pack's name, which changes when its voices do
const packsUsed = [...new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8')).scenarios.map((s) => s.audio))].sort();
const lost = packsUsed.filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (lost.length) throw new Error(`data/content.json plays packs that audio/ doesn't have: ${lost.join(', ')}`);
const CACHE = path.join(ROOT, '.cache', 'pack');
fs.mkdirSync(CACHE, { recursive: true });
const encoders = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
const small = (f) => {
  const out = path.join(CACHE, path.basename(f).replace(/\.mp4$/, '-32k.mp4'));
  if (!fs.existsSync(out)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(ROOT, f), '-ac', '1', '-ar', '24000', '-c:a', /\baac_at\b/.test(encoders) ? 'aac_at' : 'aac', '-b:a', '32k', '-f', 'mp4', out + '.tmp']), fs.renameSync(out + '.tmp', out);
  return fs.readFileSync(out);
};
const MB = (n) => `${(n / 1048576).toFixed(1)} MB`, KB = (n) => `${(n / 1024).toFixed(0)} KB`;

// Built aside, in a dir of its own so two packs at once can't write into each other, and swapped in whole, so
// serve.mjs --dist (and a test on it) never meets a half-written dist/ (or web/). fill(dir) writes it, and says how
// many bytes: counted there, since once swapped in another pack may already be moving it aside.
function swapIn(DEST, fill) {
  const W = fs.mkdtempSync(DEST + '.tmp-'), NEW = path.join(W, path.basename(DEST));
  try {
    const total = fill(NEW);
    // rename can't replace a full dir: the old one goes aside first, and so does another pack's if it swaps in between
    for (let n = 0; ; n++) {
      try { fs.renameSync(DEST, path.join(W, `old${n}`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      try { fs.renameSync(NEW, DEST); break; } catch (e) { if (n > 9 || !['ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e; }
    }
    return total;
  } finally { fs.rmSync(W, { recursive: true, force: true }); }
}

if (process.argv.includes('--web')) web();
else dist();

function dist() {
  // data/*.json ride inside the page too (app/shared/files.js reads them from there), so it starts even where the host
  // won't serve the page its files; < is escaped so no </script> or <!-- can end the block early
  const inlineData = fs.readdirSync(path.join(ROOT, 'data')).filter((f) => f.endsWith('.json')).sort()
    .map((f) => `<script type="application/json" data-file="data/${f}">${JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'))).replace(/</g, '\\u003c')}</script>`).join('\n');
  // So do the voices, which the host won't serve either, base64, after the app's own script so the app starts while
  // they arrive
  const inlineAudio = packsUsed.map((f) => `<script type="application/octet-stream" data-file="${f}">${small(f).toString('base64')}</script>`).join('\n');
  const html = page
    .replace(/<link rel="stylesheet" href="app\/[^"]+">\n?/g, '')
    .replace(/<link rel="icon"[^>]*>\n?/, '') // the artifact host gives the page its own icon
    .replace(FONTS, (m) => `${m}\n<style>${cssMin}</style>`) // functions, not strings: the JS is full of $
    .replace(MAIN, () => `${inlineData}\n<script>${js}</script>\n${inlineAudio}`);
  // the artifact host takes a page of 16 MB at most
  if (Buffer.byteLength(html) > 15.5 * 1048576) throw new Error(`dist/index.html would be ${MB(Buffer.byteLength(html))}: over what the artifact host takes`);

  // Only the packs data/content.json plays, not all of audio/: build.py writes new ones there as it goes, and an
  // artifact update keeps every file it isn't given, so stray and half-written packs would ship and stay.
  const files = Object.fromEntries([...fs.readdirSync(path.join(ROOT, 'data')).filter((f) => !f.startsWith('.')).map((f) => `data/${f}`), ...packsUsed].map((f) => [f, f]));
  const total = swapIn(DIST, (NEW) => {
    let total = Buffer.byteLength(html);
    for (const d of ['data', 'audio']) fs.mkdirSync(path.join(NEW, d), { recursive: true });
    fs.writeFileSync(path.join(NEW, 'index.html'), html);
    for (const f in files) { fs.copyFileSync(path.join(ROOT, f), path.join(NEW, f)); total += fs.statSync(path.join(NEW, f)).size; }
    fs.writeFileSync(path.join(NEW, 'files.json'), JSON.stringify(files, null, 1));
    return total;
  });

  console.log(`dist/index.html ${MB(Buffer.byteLength(html))} (voices ${MB(inlineAudio.length)}, JS ${KB(js.length)}, CSS ${KB(cssMin.length)}), ${Object.keys(files).length} files, ${MB(total)} in all`);
  console.log('files for the Artifact tool (root: dist): dist/files.json');
  console.log('republishing: list the artifact\'s files first (scope "files") and add "<path>": null for each data/ or audio/ path not in files.json, or the old packs stay');
}

// web/: every file it will hold, made in memory first (path → contents), so nothing is written until all of it is right
function web() {
  const { web: site, unset } = readWeb(ROOT), out = new Map();
  const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
  const asset = { js: `assets/app-${hash(bundle)}.js`, css: `assets/app-${hash(styles)}.css` };
  out.set('index.html', indexPage(page, site, asset)).set(asset.js, bundle).set(asset.css, styles);
  // data/ as it is (only what the gate made live: drafts live under review/), the voices by the packs' own names
  for (const f of fs.readdirSync(path.join(ROOT, 'data')).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort()) out.set(`data/${f}`, fs.readFileSync(path.join(ROOT, 'data', f)));
  for (const f of packsUsed) out.set(f, small(f));
  // the pixel art as tools/art.mjs left it (only what a live story draws), fetched a story at a time after the first tap
  const ART = path.join(ROOT, 'art');
  if (fs.existsSync(ART)) for (const f of fs.readdirSync(ART, { recursive: true }).map(String).filter((f) => !f.split(path.sep).some((s) => s.startsWith('.')) && fs.statSync(path.join(ART, f)).isFile()).sort()) out.set(`art/${f.split(path.sep).join('/')}`, fs.readFileSync(path.join(ART, f)));
  // app/web/ is web/'s root as it ships: its pages filled in from web.json, the icons and share image (tools/icons.mjs)
  const SRC = path.join(ROOT, 'app', 'web');
  for (const need of ['about.html', '404.html', 'og.png', 'icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png']) {
    if (!fs.existsSync(path.join(SRC, need))) throw new Error(`app/web/${need} is missing${need === '404.html' ? ' (without it Pages answers a lost file with index.html and a 200)' : /png|svg/.test(need) ? ': node tools/icons.mjs makes it' : ''}`);
  }
  for (const f of fs.readdirSync(SRC, { recursive: true }).map(String).filter((f) => !f.split(path.sep).some((s) => s.startsWith('.')) && fs.statSync(path.join(SRC, f)).isFile()).sort()) {
    const to = f.split(path.sep).join('/'), buf = fs.readFileSync(path.join(SRC, f));
    if (out.has(to)) throw new Error(`app/web/${to} would replace the build's own ${to}`);
    out.set(to, to.endsWith('.html') ? fill(buf.toString('utf8'), site, `app/web/${to}`) : buf);
  }
  if (fs.existsSync(path.join(ROOT, 'web.json'))) out.set('web.json', fs.readFileSync(path.join(ROOT, 'web.json')));
  out.set('manifest.webmanifest', manifest(site)).set('_headers', headers());
  // Pages' limits: 25 MiB a file, 20,000 files
  const size = (k) => Buffer.byteLength(out.get(k)), big = [...out.keys()].filter((k) => size(k) > 25 * 1048576);
  if (big.length || out.size >= 20000) throw new Error(`over Cloudflare Pages' limits: ${big.length ? big.join(', ') + ' over 25 MiB' : `${out.size} files`}`);
  for (const [k, v] of out) if (k.endsWith('.html') && /\{\{|\}\}/.test(v)) throw new Error(`web/${k} still has a {{…}} in it`);

  const total = swapIn(WEB, (NEW) => {
    for (const [k, v] of out) { fs.mkdirSync(path.dirname(path.join(NEW, k)), { recursive: true }); fs.writeFileSync(path.join(NEW, k), v); }
    return [...out.keys()].reduce((n, k) => n + size(k), 0);
  });
  const sum = (re) => [...out.keys()].filter((k) => re.test(k)).reduce((n, k) => n + size(k), 0);
  console.log(`web/: index.html ${KB(size('index.html'))}, JS ${KB(size(asset.js))}, CSS ${KB(size(asset.css))}, data ${MB(sum(/^data\//))}, voices ${MB(sum(/^audio\//))} (${packsUsed.length} packs), art ${MB(sum(/^art\//))}, ${out.size} files, ${MB(total)} in all`);
  for (const k of unset) console.log(`web.json: ${k} unset, so ${NEEDS[k]}`);
  console.log('then: node tools/serve.mjs --web, node tools/web-check.mjs; going live is node tools/deploy-web.mjs, on the owner\'s OK');
}

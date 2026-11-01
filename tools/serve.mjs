#!/usr/bin/env node
// tools/serve.mjs: serves kuaishuo/ the way the claude.ai artifact does (a page without its own <!doctype html> is
// wrapped in the same skeleton), so one index.html works in both places.
//   node tools/serve.mjs                 http://127.0.0.1:8791 (desktop: speech recognition works on localhost)
//   node tools/serve.mjs --lan           also https://<this Mac's address>:8443 for a phone on the same Wi-Fi, with a
//                                        self-signed certificate (accept it once; the microphone needs https)
//   node tools/serve.mjs --port 9000 --dist   other port; serve the packed build in dist/ instead
//   http://127.0.0.1:8791/review         every draft story to play, approve or send back (tools/review.mjs)
//   node tools/serve.mjs --web           the web build in web/ (pack.mjs --web) as Cloudflare Pages serves it, its
//                                        _headers and all, so a check sees the real CSP
// From the source tree, the web build's own pages (app/web/: about, 404, the icons) are at the root too, as web/ has
// them, with web.json's fields filled in as pack.mjs --web fills them, so they show here as they ship.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { RESET, readWeb, fill, parseHeaders, headersFor } from './webpage.mjs';
import { route as review } from './review.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const WEB = has('--web'), BASE = has('--dist') ? path.join(ROOT, 'dist') : WEB ? path.join(ROOT, 'web') : ROOT, OWN = path.join(ROOT, 'app', 'web');
const PORT = +arg('--port', 8791), HOST = arg('--host', '127.0.0.1');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
// The artifact host's skeleton, as a published page came back on 30 Oct: charset, viewport-fit=cover, a small reset.
const SKELETON = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${RESET}</style></head><body>`;

function handler(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch {}
  // a bad %-escape or URL (or a NUL, which fs throws on) would otherwise throw out of here and end the server
  if (!p || p.includes('\0')) { res.writeHead(400); return res.end(); }
  // no dot-names at all (.git, .cache, .DS_Store, ..), in any case: APFS ignores it, so /.GIT/HEAD is .git/HEAD
  if (p.split(/[/\\]/).some((s) => s.startsWith('.'))) { res.writeHead(403); return res.end(); }
  if (WEB) return pages(req, res, p);
  if (BASE === ROOT && review(ROOT, req, res, p)) return; // /review: every draft to play and decide (tools/review.mjs)
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(BASE, p);
  if (!f.startsWith(BASE + path.sep)) { res.writeHead(403); return res.end(); }
  if (BASE === ROOT && !fs.existsSync(f) && fs.existsSync(path.join(OWN, p))) f = path.join(OWN, p); // /about.html: app/web/about.html
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    const ext = path.extname(f);
    let body = buf;
    if (BASE === ROOT && ext === '.html' && f.startsWith(OWN + path.sep)) {
      try { body = buf = Buffer.from(fill(buf.toString('utf8'), readWeb(ROOT).web, path.relative(ROOT, f))); } catch (e) { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end(String(e.message)); }
    }
    if (ext === '.html' && !/^\s*<!doctype/i.test(buf.toString('utf8', 0, 64))) body = Buffer.concat([Buffer.from(SKELETON), buf, Buffer.from('</body></html>')]);
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  });
}

// --web: web/ as Cloudflare Pages serves it (docs/v2/web.md §2): /x.html redirects to /x, which serves x.html; a path
// with no file gets 404.html with a 404 (and with no 404.html, index.html with a 200, as Pages does for a one-page app);
// every _headers rule matching the path asked for (read each time: a pack may have swapped web/ since); text gzipped,
// as Pages compresses it, so what a check counts as sent is near what a phone would be sent
const zipped = new Map();
function pages(req, res, p) {
  let rules = [];
  try { rules = parseHeaders(fs.readFileSync(path.join(BASE, '_headers'), 'utf8')); } catch {}
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '', ruled = headersFor(rules, p);
  // (as wrangler pages dev has it: the rules go on a redirect too, a 404 is never cached whatever they say, and its types)
  if (p.endsWith('.html')) { res.writeHead(308, { ...ruled, location: p.replace(/(?:index)?\.html$/, '') + q }); return res.end(); }
  const file = (x) => { try { return x.startsWith(BASE + path.sep) && fs.statSync(x).isFile() ? x : null; } catch { return null; } };
  let f = !/^\/_(headers|redirects|routes\.json|worker\.js)$/.test(p) && (file(path.join(BASE, p.endsWith('/') ? p + 'index.html' : p)) || (!p.endsWith('/') && file(path.join(BASE, p + '.html')))), status = 200;
  if (!f) [f, status] = file(path.join(BASE, '404.html')) ? [path.join(BASE, '404.html'), 404] : [file(path.join(BASE, 'index.html')), 200];
  if (!f) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('no web/: node tools/pack.mjs --web'); }
  const type = { '.js': 'application/javascript', '.mp4': 'video/mp4' }[path.extname(f)] || TYPES[path.extname(f)] || 'application/octet-stream', head = { 'content-type': type, 'cache-control': 'public, max-age=0, must-revalidate', ...ruled, ...(status === 404 ? { 'cache-control': 'no-store' } : {}) };
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    if (/^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/.test(type)) {
      head.vary = 'accept-encoding';
      if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        const key = `${f} ${buf.length} ${fs.statSync(f).mtimeMs}`;
        if (!zipped.has(key)) { if (zipped.size > 200) zipped.clear(); zipped.set(key, zlib.gzipSync(buf)); } // a repack's files are new keys
        buf = zipped.get(key); head['content-encoding'] = 'gzip';
      }
    }
    res.writeHead(status, { ...head, 'content-length': buf.length });
    res.end(buf);
  });
}

http.createServer(handler).listen(PORT, HOST, () => console.log(`kuaishuo: http://${HOST}:${PORT}/`));

if (has('--lan')) {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  // beside the venv, outside the served tree: no URL can ever reach the private key
  const dir = path.join(os.homedir(), '.cache', 'kuaishuo', 'cert'), key = path.join(dir, 'key.pem'), crt = path.join(dir, 'cert.pem'), tag = path.join(dir, 'ips.txt');
  if (!fs.existsSync(crt) || fs.readFileSync(tag, 'utf8') !== ips.join(',')) {
    fs.mkdirSync(dir, { recursive: true });
    const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((i) => `IP:${i}`)].join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-subj', '/CN=kuaishuo local', '-addext', `subjectAltName=${san}`, '-keyout', key, '-out', crt], { stdio: 'ignore' });
    fs.writeFileSync(tag, ips.join(','));
  }
  const LAN = +arg('--lan-port', 8443);
  https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, handler).listen(LAN, '0.0.0.0', () => {
    console.log('\nOn your phone (same Wi-Fi), open:');
    for (const ip of ips) console.log(`  https://${ip}:${LAN}/`);
    console.log('The certificate is self-signed: tap "Show Details" → "visit this website" (Safari) or "Advanced" → "Proceed" (Chrome) once.');
  });
}

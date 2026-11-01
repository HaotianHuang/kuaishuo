// tools/webpage.mjs: what the web build (pack.mjs --web) and its server (serve.mjs --web) share, as docs/v2/web.md has
// it: web.json's fields and the templating of app/web/'s pages, web/index.html's document and head, the manifest, and
// _headers, written for Cloudflare Pages and read back the way Pages reads it.
import fs from 'node:fs';
import path from 'node:path';

export const FIELDS = ['name', 'by', 'contact', 'url'];
// what goes when a field is unset: pack prints it, so the owner knows what the build leaves out
export const NEEDS = { name: 'the pages say 快说 Kuài Shuō', by: 'no "who made it" line', contact: 'no report link, no Send feedback, no contact line', url: 'no og:url or og:image (a share preview needs the site\'s full address)' };
export const DESCRIPTION = 'Speaking practice in short, absurd emergencies, for people who understand more Chinese than they can say, and for beginners. Free in the browser, no sign-up.';
export const THEME = '#0f0d13'; // ks.css's --ink: the night behind every card, and the gate's
// the artifact host's reset (serve.mjs wraps a page in it), so the page looks on the web as it does on claude.ai
export const RESET = ':root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// web.json, trimmed (a missing file is {}, as the app reads it), and which fields are empty
export function readWeb(root) {
  let web = {};
  try { web = JSON.parse(fs.readFileSync(path.join(root, 'web.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error(`web.json: ${e.message}`); }
  for (const k of FIELDS) web[k] = typeof web[k] === 'string' ? web[k].trim() : '';
  return { web, unset: FIELDS.filter((k) => !web[k]) };
}

// An app/web/ page as it ships: its <!-- notes --> taken out (they're for whoever edits it, and may name the {{…}}
// themselves) but for <!--email_off-->, which keeps Cloudflare's email obfuscation (on for the zone) from rewriting an
// address into a script of its own, {{name}}, {{by}}, {{contact}}, {{url}} filled in (escaped), and every line carrying data-needs="<field>"
// dropped when that field is empty. An unknown {{x}} is an error, so a typo can't ship.
export function fill(html, web, file = 'page') {
  return html.replace(/<!--(?!\/?email_off-->)[\s\S]*?-->\n?/g, '').split('\n').filter((l) => !(l.match(/data-needs="([^"]*)"/)?.[1].split(/\s+/).some((k) => !web[k])))
    .map((l) => l.replace(/ data-needs="[^"]*"/g, '')).join('\n')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => { if (!FIELDS.includes(k)) throw new Error(`${file}: {{${k}}} isn't one of web.json's fields (${FIELDS.join(', ')})`); return esc(web[k]); });
}

// web/index.html: index.html's own links (the fonts) and body (#app) in a real document with the web's head. The
// bundle and the CSS are files (deferred, so they load beside the fonts); the artifact's title, frame hint and empty
// icon are the host's business there and replaced here.
export function indexPage(page, web, { js, css }) {
  const rest = page.replace(/<title>[^<]*<\/title>\n?|<meta name="claude:[^>]*>\n?|<link rel="icon"[^>]*>\n?|<link rel="stylesheet" href="app\/[^"]+">\n?|<script type="module" src="app\/main.js"><\/script>\n?/g, '').split('\n').filter((l) => l.trim());
  const name = web.name || '快说 Kuài Shuō', url = web.url.replace(/\/*$/, '/');
  const og = [['og:type', 'website'], ['og:site_name', name], ['og:title', name], ['og:description', DESCRIPTION], ['og:locale', 'en_US'],
    ...(web.url ? [['og:url', url], ['og:image', url + 'og.png'], ['og:image:width', '1200'], ['og:image:height', '630'], ['og:image:alt', `${name}: the wordmark, and what it is`]] : [])];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="ks-build" content="web">
<title>${esc(name)}</title>
<meta name="description" content="${esc(DESCRIPTION)}">
<meta name="theme-color" content="${THEME}">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="icon" href="icons/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
${og.map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`).join('\n')}
<meta name="twitter:card" content="${web.url ? 'summary_large_image' : 'summary'}">
<style>${RESET}</style>
${rest.filter((l) => /^<(link|meta)\b/.test(l)).join('\n')}
<link rel="stylesheet" href="${css}">
<script src="${js}" defer></script>
</head>
<body>
<noscript><p style="margin:40vh 24px 0;text-align:center;font-size:17px">快说 is a speaking game that runs in the page: it needs JavaScript. <a href="about.html">What it is, and what it keeps</a></p></noscript>
${rest.filter((l) => !/^<(link|meta)\b/.test(l)).join('\n')}
</body>
</html>
`;
}

// display "browser": a Home Screen web app on an iPhone has no speech recogniser, so Add to Home Screen gives a
// bookmark that opens in Safari, which has one
export const manifest = (web) => JSON.stringify({
  name: web.name || '快说 Kuài Shuō', short_name: '快说', description: DESCRIPTION, lang: 'en', start_url: './', scope: './', display: 'browser',
  background_color: THEME, theme_color: THEME,
  icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }, { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 1) + '\n';

// The CSP: scripts from here only; styles from here, Google Fonts and inline (the app writes style attributes, the
// pages carry their own <style>); the font from fonts.gstatic.com; sound and pictures from here, data: (the silent WAV
// for iOS's ring switch) and blob:; no workers (the app has none); never framed; no forms posting anywhere.
export const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", 'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:", "media-src 'self' data: blob:", "connect-src 'self'", "worker-src 'none'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'none'"].join('; ');
const YEAR = 'public, max-age=31536000, immutable', DAY = 'public, max-age=86400';
// Cache-Control only on rules that can't overlap: Pages joins a header two matching rules both set with a comma. A
// path with none (404.html for a lost one) gets Pages' own: public, max-age=0, must-revalidate.
export const CACHE = [['/', 'no-cache'], ['/about', 'no-cache'], ['/web.json', 'no-cache'], ['/data/*', 'no-cache'], ['/assets/*', YEAR], ['/audio/*', YEAR], ['/art/*', DAY], ['/icons/*', DAY], ['/manifest.webmanifest', DAY], ['/og.png', DAY]];

export const headers = () => `# 快说 on Cloudflare Pages, written by tools/pack.mjs --web (tools/webpage.mjs); serve.mjs --web reads it as Pages does
/*
  Content-Security-Policy: ${CSP}
  Permissions-Policy: microphone=(self), camera=(), geolocation=()
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
${CACHE.map(([p, v]) => `\n${p}\n  Cache-Control: ${v}`).join('\n')}
`;

// _headers as Pages reads it (the subset pack writes, and its detach): a rule is a path pattern (* any run of
// characters, :name one segment) and its indented "Name: value" lines, "! Name" taking one off what an earlier rule set
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { rules.push({ re: new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/:\w+/g, '[^/]+') + '$'), set: [] }); continue; }
    const m = line.trim().match(/^(!\s*)?([\w-]+)\s*(?::\s*(.*))?$/);
    if (m && rules.length) rules.at(-1).set.push(m[1] ? [m[2].toLowerCase(), null] : [m[2].toLowerCase(), m[3] ?? '']);
  }
  return rules;
}

// the headers every rule matching the path gives it, in order: a header set twice joined with ", " as Pages does
export function headersFor(rules, pathname) {
  const out = {};
  for (const r of rules) if (r.re.test(pathname)) for (const [k, v] of r.set) v == null ? delete out[k] : (out[k] = k in out ? `${out[k]}, ${v}` : v);
  return out;
}

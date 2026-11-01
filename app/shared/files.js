// The page's own files (data/, audio/), beside it. A packed page carries them inside it (tools/pack.mjs): its JSON as
// <script type="application/json" data-file="data/content.json">, its voices, base64, as <script
// type="application/octet-stream" data-file="audio/….mp4"> after the app's own script, so the app starts while they
// arrive; so it works even where the host won't serve the page its files (claude.ai, on a phone and on a laptop).
// Elsewhere a host that serves the page at a path without its trailing slash puts relative URLs a folder up, so a file
// that fails is tried once more as if the page's path were a folder; the base that works is kept.
const doc = typeof document !== 'undefined' ? document : null; // tools/judge-check.mjs runs the judge in Node
let base = null;

function bases() {
  const out = [];
  try { out.push(new URL('.', doc.baseURI).href); } catch {}
  try { const u = new URL(doc.baseURI); if (!u.pathname.endsWith('/') && !/\.\w+$/.test(u.pathname)) out.push(u.origin + u.pathname + '/'); } catch {}
  return out.length ? out : [null];
}

const parsed = () => (doc.readyState !== 'loading' ? null : new Promise((r) => doc.addEventListener('DOMContentLoaded', r, { once: true })));
// ?data=<dir>: a content gate's draft build (review/gate/<batch>/data) in place of data/; its packs name their own paths
const DATA = doc && new URLSearchParams(location.search).get('data')?.replace(/\/$/, '');
const at = (path) => (DATA && path.startsWith('data/') ? `${DATA}/${path.slice(5)}` : path);
const carried = (type, path) => doc?.querySelector(`script[type="${type}"][data-file="${path}"]`);

// fetch(path) beside the page → the Response; an error that says which file and why ("data/py.json: 403")
export async function get(path, init) {
  if (!doc) return fetch(path, init);
  await parsed(); // the voices come after the app's script: wait for the rest of the page before looking for one
  const el = carried('application/octet-stream', path);
  if (el) { const s = atob(el.textContent.trim()), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return new Response(b); }
  let last = null;
  for (const b of base ? [base] : bases()) {
    try {
      const r = await fetch(b ? new URL(at(path), b).href : at(path), init);
      if (r.ok) { base = b; return r; }
      last = new Error(`${path}: ${r.status}`);
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      last = new Error(`${path}: ${e?.message || e}`);
    }
  }
  throw last;
}

// packed: a page that carries its content (tools/pack.mjs's artifact build), and so every file it has: one it doesn't
// carry isn't beside it either (the artifact host would answer with a page of its own), so it isn't fetched
export const packed = () => !!carried('application/json', 'data/content.json');
export async function json(path) {
  const el = carried('application/json', path);
  if (el) return JSON.parse(el.textContent);
  if (packed()) throw new Error(`${path}: not in this page`);
  const r = await get(path);
  try { return await r.json(); } catch (e) { throw new Error(`${path}: not JSON (${e?.message || e})`); }
}

// web.json, beside the page: what only the owner can say ({ name, by, contact, url }: docs/v2/web.md §3), read once as
// the app starts (web()); none (a packed page doesn't carry it) is {}. owner() → it, {} till it's come: no contact, no
// report link and no Send feedback (report.js).
let site = {}, siting = null;
export const web = () => (siting ??= json('web.json').then((w) => (site = w && typeof w === 'object' ? w : {}), () => site));
export const owner = () => site;
// The About page (web.md §3): the web build's about.html beside it (its head says <meta name="ks-build" content="web">);
// from the source tree app/web/about.html, which tools/serve.mjs fills in from web.json; a packed page has none.
export const about = () => (!doc ? null : doc.querySelector('meta[name="ks-build"][content="web"]') ? 'about.html' : packed() ? null : 'app/web/about.html');

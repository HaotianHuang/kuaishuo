// tools/review.mjs: every draft on one page, to play and decide (serve.mjs serves it at /review, from the source tree).
// A draft is a story in content/src still "status": "draft", or a live story's level still marked draft (CONTENT.md);
// each plays from the newest batch build under review/gate/ that has it, at each level it has. A decision (yes, or
// needs work with a note) goes to review/decisions.json; the content session reads it and makes the yeses live, since
// content/src is its to change, not this page's.
//   GET  /review            the page          GET /review/list  the drafts and decisions, as JSON
//   POST /review/decide     { id, d: 'yes' | 'fix' | null, note? }
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const decisionsFile = (root) => path.join(root, 'review', 'decisions.json');
export const decisions = (root) => read(decisionsFile(root)) || {};

// the draft levels of a live story's lines (say.levels[L].status), and every say level a built story has
const draftLevels = (s) => { const lv = new Set(); JSON.stringify(s, (k, v) => { if (k === 'levels' && v && typeof v === 'object') for (const [L, o] of Object.entries(v)) if (o?.status === 'draft') lv.add(+L); return v; }); return [...lv].sort(); };
const levelsOf = (s) => { const lv = new Set([s.level]); JSON.stringify(s.steps, (k, v) => { if (k === 'levels' && v && typeof v === 'object') Object.keys(v).forEach((L) => lv.add(+L)); return v; }); return [...lv].sort(); };
// your lines at the story's own level, in order (the branches' too, once each)
const lines = (s) => { const out = [], seen = new Set(); JSON.stringify(s.steps, (k, v) => { if (k === 'say' && v?.answers && !seen.has(v.id)) { seen.add(v.id); out.push({ zh: v.answers[0], en: v.gloss || v.en || '' }); } return v; }); return out; };

export function drafts(root) {
  const src = path.join(root, 'content', 'src'), gate = path.join(root, 'review', 'gate');
  const want = new Map(); // id → null (a draft story) or [levels] (a live story's draft levels)
  for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.json'))) {
    const s = read(path.join(src, f));
    if (!s?.id) continue;
    if (s.status !== 'live') want.set(s.id, null);
    else { const lv = draftLevels(s); if (lv.length) want.set(s.id, lv); }
  }
  // the newest build of each (by its content.json's time), whose voice pack is there
  const builds = fs.readdirSync(gate).map((d) => path.join(gate, d, 'data', 'content.json')).filter((f) => fs.existsSync(f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const found = new Map();
  for (const f of builds) {
    const c = read(f), batch = path.basename(path.dirname(path.dirname(f)));
    for (const s of c?.scenarios || []) if (want.has(s.id) && !found.has(s.id) && fs.existsSync(path.join(root, s.audio))) found.set(s.id, { s, batch, series: c.series?.[s.series?.id] });
  }
  return [...want].map(([id, lv]) => {
    const hit = found.get(id);
    if (!hit) return { id, missing: true, kind: lv ? 'levels' : 'story' };
    const { s, batch, series } = hit;
    return {
      id, kind: lv ? 'levels' : 'story', batch, title: s.title, en: s.title_en, format: s.format, level: s.level,
      levels: lv || levelsOf(s), setting: s.setting, stage: s.stage, hook: s.hook, audience: s.audience, topics: s.topics,
      secs: Math.round(s.secs || 0), series: s.series ? { id: s.series.id, ep: s.series.ep, title: series?.title || series?.name || s.series.id, en: series?.title_en || series?.en || '' } : null,
      lines: lines(s), data: `review/gate/${batch}/data`, notes: `review/gate/${batch}.md`,
    };
  });
}

const json = (res, code, x) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(x)); };

// serve.mjs's hook: true when it answered
export function route(root, req, res, p) {
  if (p === '/review' || p === '/review/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(PAGE); return true; }
  if (p === '/review/list') { try { json(res, 200, { drafts: drafts(root), decisions: decisions(root) }); } catch (e) { json(res, 500, { error: e.message }); } return true; }
  if (p === '/review/decide' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 20000) req.destroy(); });
    req.on('end', () => {
      let x; try { x = JSON.parse(body); } catch { return json(res, 400, { error: 'not JSON' }); }
      if (typeof x.id !== 'string' || !/^[a-z0-9-]+$/.test(x.id) || ![null, 'yes', 'fix'].includes(x.d)) return json(res, 400, { error: 'id and d (yes, fix or null)' });
      const all = decisions(root);
      if (x.d) all[x.id] = { d: x.d, note: String(x.note || '').slice(0, 2000), at: new Date().toISOString(), batch: String(x.batch || '').slice(0, 40) };
      else delete all[x.id];
      fs.mkdirSync(path.dirname(decisionsFile(root)), { recursive: true });
      fs.writeFileSync(decisionsFile(root) + '.tmp', JSON.stringify(all, null, 1));
      fs.renameSync(decisionsFile(root) + '.tmp', decisionsFile(root)); // whole or not at all
      json(res, 200, all[x.id] || {});
    });
    return true;
  }
  return false;
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>快说 · drafts to review</title>
<style>
:root{--bg:#111318;--card:#1b1e26;--line:#2a2e39;--text:#eceef3;--dim:#9aa1b1;--yes:#3fb27f;--fix:#e0a33a;--link:#7fb0ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 -apple-system,system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:rgba(17,19,24,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:12px 16px}
h1{font-size:17px;margin:0 0 6px}.bar{height:6px;background:var(--line);border-radius:3px;overflow:hidden;display:flex}.bar i{display:block;height:100%}
.counts{font-size:13px;color:var(--dim);margin-top:6px}.filters{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.filters button{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:4px 10px;font:inherit;font-size:13px}
.filters button[aria-pressed=true]{background:var(--text);color:var(--bg)}
main{max-width:760px;margin:0 auto;padding:8px 16px 80px}h2{font-size:15px;color:var(--dim);margin:22px 0 8px;font-weight:600}
.s{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:8px 0}
.s.yes{border-color:var(--yes)}.s.fix{border-color:var(--fix)}
.top{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.t{font-size:18px;font-weight:600}.en{color:var(--dim)}
.meta{font-size:13px;color:var(--dim);margin:2px 0 6px}.set{font-size:14px;margin:4px 0}
.play{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.play a{background:#26324a;color:var(--link);text-decoration:none;border-radius:8px;padding:6px 10px;font-size:14px}
details{font-size:14px;margin:4px 0}summary{color:var(--dim);cursor:pointer}ol{margin:6px 0;padding-left:22px}li span{color:var(--dim)}
.act{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}.act button{font:inherit;border-radius:8px;padding:7px 12px;border:1px solid var(--line);background:#252a35;color:var(--text)}
.act .y[aria-pressed=true]{background:var(--yes);border-color:var(--yes);color:#06150e}.act .f[aria-pressed=true]{background:var(--fix);border-color:var(--fix);color:#1d1404}
textarea{width:100%;margin-top:8px;background:#0e1015;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;min-height:60px}
.saved{font-size:12px;color:var(--dim)}.note{font-size:13px;color:var(--dim)}a.n{color:var(--dim);font-size:13px}
</style></head><body>
<header><h1>快说 · drafts to review</h1><div class="bar" id="bar"></div><div class="counts" id="counts"></div>
<div class="filters" id="filters"></div></header>
<main id="list"><p class="note">Loading…</p></main>
<script>
const $ = (s, e = document) => e.querySelector(s), esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let D = [], dec = {}, filter = 'open';
try { filter = localStorage.getItem('ks.review.filter') || 'open'; } catch {}
const FILTERS = [['open', 'To review'], ['yes', 'Approved'], ['fix', 'Needs work'], ['all', 'All']];
const state = (id) => dec[id]?.d || 'open';
function counts() {
  const n = { open: 0, yes: 0, fix: 0 }; D.forEach((x) => n[state(x.id)]++);
  const t = D.length || 1;
  $('#bar').innerHTML = '<i style="width:' + (100 * n.yes / t) + '%;background:var(--yes)"></i><i style="width:' + (100 * n.fix / t) + '%;background:var(--fix)"></i>';
  $('#counts').textContent = D.length + ' drafts: ' + n.yes + ' approved, ' + n.fix + ' need work, ' + n.open + ' to review. Approved ones go live when the content session next builds.';
  $('#filters').innerHTML = FILTERS.map(([k, l]) => '<button data-f="' + k + '" aria-pressed="' + (filter === k) + '">' + l + (k === 'all' ? '' : ' ' + (n[k] ?? 0)) + '</button>').join('');
}
// series together, in episode order; then new stories by level; then the live stories' new levels
function groups() {
  const g = new Map(), add = (k, x) => (g.get(k) || g.set(k, []).get(k)).push(x);
  for (const x of D) {
    if (x.missing) add('Not in any batch build (ask the content session)', x);
    else if (x.kind === 'levels') add('New levels for stories already live', x);
    else if (x.series) add('Series: ' + x.series.title + (x.series.en ? ' · ' + x.series.en : ''), x);
    else add('New stories, level ' + x.level, x);
  }
  const rank = (k) => k.startsWith('Series') ? 0 : k.startsWith('New stories') ? 1 : k.startsWith('New levels') ? 2 : 3;
  return [...g].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])).map(([k, xs]) => [k, xs.sort((a, b) => (a.series?.ep ?? 0) - (b.series?.ep ?? 0) || (a.level ?? 0) - (b.level ?? 0))]);
}
function card(x) {
  const st = state(x.id), d = dec[x.id];
  if (x.missing) return '<div class="s" data-id="' + x.id + '"><div class="t">' + esc(x.id) + '</div><p class="note">A draft in content/src with no batch build to play it from yet.</p></div>';
  const play = x.levels.map((L) => '<a href="/?data=' + encodeURIComponent(x.data) + '#play?id=' + x.id + (L === x.level && x.kind === 'story' ? '' : '&lv=' + L) + '">▶ Level ' + L + (L === x.level && x.kind === 'story' ? ' (the story)' : '') + '</a>').join('');
  return '<div class="s ' + st + '" data-id="' + x.id + '" data-batch="' + esc(x.batch) + '">' +
    '<div class="top"><span class="t" lang="zh-CN">' + esc(x.stage || '') + ' ' + esc(x.title) + '</span><span class="en">' + esc(x.en) + '</span></div>' +
    '<div class="meta">' + [x.series ? 'episode ' + x.series.ep : '', x.format, x.kind === 'levels' ? 'new levels ' + x.levels.join(', ') : 'level ' + x.level, x.audience, (x.topics || []).join(', '), x.secs ? Math.round(x.secs / 60 * 10) / 10 + ' min' : '', x.hook ? 'hook ' + x.hook + '/5' : ''].filter(Boolean).join(' · ') + '</div>' +
    '<div class="set">' + esc(x.setting) + '</div><div class="play">' + play + '</div>' +
    '<details><summary>Your ' + x.lines.length + ' lines</summary><ol lang="zh-CN">' + x.lines.map((l) => '<li>' + esc(l.zh) + ' <span lang="en">' + esc(l.en) + '</span></li>').join('') + '</ol></details>' +
    '<div class="act"><button class="y" aria-pressed="' + (st === 'yes') + '">✓ Approve</button><button class="f" aria-pressed="' + (st === 'fix') + '">✎ Needs work</button>' +
    '<a class="n" href="/' + esc(x.notes) + '" target="_blank">batch notes (' + esc(x.batch) + ')</a><span class="saved"></span></div>' +
    (st === 'fix' ? '<textarea placeholder="What\\'s wrong? (saved as you type)">' + esc(d?.note) + '</textarea>' : '') + '</div>';
}
function render() {
  counts();
  const shown = groups().map(([k, xs]) => [k, xs.filter((x) => filter === 'all' || state(x.id) === filter)]).filter(([, xs]) => xs.length);
  $('#list').innerHTML = shown.length ? shown.map(([k, xs]) => '<h2>' + esc(k) + ' (' + xs.length + ')</h2>' + xs.map(card).join('')).join('') : '<p class="note">Nothing here.</p>';
}
async function decide(id, d, note) {
  const el = document.querySelector('.s[data-id="' + id + '"]');
  const r = await fetch('/review/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, d, note, batch: el?.dataset.batch }) });
  if (!r.ok) { alert('Not saved: ' + (await r.text())); return false; }
  if (d) dec[id] = await r.json(); else delete dec[id];
  return true;
}
document.addEventListener('click', async (e) => {
  const f = e.target.closest('[data-f]');
  if (f) { filter = f.dataset.f; try { localStorage.setItem('ks.review.filter', filter); } catch {} return render(); }
  const b = e.target.closest('.act button'); if (!b) return;
  const id = b.closest('.s').dataset.id, want = b.classList.contains('y') ? 'yes' : 'fix', now = state(id);
  if (await decide(id, now === want ? null : want, dec[id]?.note)) {
    // stay put: the card keeps its place until the filter is changed, so the next one is right below
    const old = document.querySelector('.s[data-id="' + id + '"]'), x = D.find((x) => x.id === id), tmp = document.createElement('div');
    tmp.innerHTML = card(x); old.replaceWith(tmp.firstChild); counts();
    if (want === 'fix' && state(id) === 'fix') document.querySelector('.s[data-id="' + id + '"] textarea')?.focus();
  }
});
let typing = 0;
document.addEventListener('input', (e) => {
  if (e.target.tagName !== 'TEXTAREA') return;
  const s = e.target.closest('.s'), id = s.dataset.id;
  clearTimeout(typing); typing = setTimeout(async () => { if (await decide(id, 'fix', e.target.value)) $('.saved', s).textContent = 'saved'; }, 600);
});
fetch('/review/list').then((r) => r.json()).then((x) => { D = x.drafts; dec = x.decisions; render(); }).catch((e) => { $('#list').textContent = 'Could not load: ' + e.message; });
</script></body></html>`;

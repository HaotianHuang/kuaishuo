// 快说: the router. No hash is For You: the Mix, dealt by the ranker, through the sound gate, with a menu where a
// version's back button sits (today's challenge, situations, your phrases, your numbers, the lab, Settings: #challenge
// plays 今日挑战, #situations lists the situations you can handle). #lab is the launcher, the five versions
// side by side: #mix #scene #chase #chat #call open one, each with its back button to #lab. A version module exports
// either createCard(el, scenario, ctx) (one card per scenario of its format, in the shared feed) or mount(root, ctx)
// (it builds its own feed). #basic plays every scenario with the plain player.
import * as audio from './shared/audio.js';
import * as speech from './shared/speech.js';
import * as match from './shared/match.js';
import * as content from './shared/content.js';
import { installGloss, h, esc, toast, zh as zhText, reader, relearning } from './shared/text.js';
import { openSettings, countdown, countText, share, SOON_ICON } from './shared/panel.js';
import { feed, assisted, mail } from './shared/feed.js';
import * as files from './shared/files.js';
import { played } from './shared/report.js';
import { srs, marks, vocab } from './shared/store.js';
import { now } from './shared/time.js';
import * as events from './shared/events.js';
import * as learner from './shared/learner.js';
import * as levels from './shared/levels.js';
import * as days from './shared/days.js';
import * as tally from './shared/tally.js';
import { situations, toLock } from './protos/recap.js';

// why: what each is best at, from the critics' ranking (MORNING.md), which is also the order here
const VERSIONS = [
  { id: 'mix', zh: '快说', name: 'Mix', why: 'The app you described, and the only one that brings phrases back.', blurb: 'Scenes, chases, chats and calls, with quick reviews and writing cards in between.', tag: 'Start here', load: () => import('./protos/mix.js') },
  { id: 'scene', unit: 'scenes', zh: '刷', name: 'Scenes', why: 'The purest form of the idea; you can lose, funnily.', blurb: 'Mini-stories on a stage. The scene freezes, you say the line, the story reacts.', load: () => import('./protos/scene.js') },
  { id: 'call', unit: 'calls', zh: '接', name: 'Calls', why: 'The best first ten seconds.', blurb: 'The phone rings. No subtitles unless you peek. Go quiet and they hang up.', load: () => import('./protos/call.js') },
  { id: 'chat', unit: 'chats', zh: '聊', name: 'Chats', why: 'The best writing practice.', blurb: 'WeChat dramas. Read the texts, play the voice notes, reply by voice or keyboard.', load: () => import('./protos/chat.js') },
  { id: 'chase', unit: 'runs', zh: '追', name: 'Chase', why: 'Your tiger, literally.', blurb: 'Something is gaining on you. Every right phrase buys distance.', load: () => import('./protos/chase.js') },
  { id: 'basic', hidden: true, name: 'Plain player', load: () => import('./protos/basic.js') },
];

const root = document.getElementById('app');
// nav counts routes: whatever was waiting on the network when a newer one began draws nothing when it arrives. forYou:
// the feed the app opens on, while it's up; kept: it, set aside while your phrases or your numbers are up from its menu
// (with its menu button), put back as it was by their Back. hooked: the gate showed the hook's premise.
let data = null, current = null, ready = null, nav = 0, held = false, forYou = null, kept = null, hooked = false;
// The content and the pinyin table, fetched once; if the phone's network drops them, the next try fetches again. The
// learner model starts on the content (its lines' priors) before any card plays, and drives pinyin by model.
// days.js keeps the days played and the streak from the log's rows (it listens once the content is in, as the model does).
const loadData = () => (ready ??= Promise.all([content.load(), match.loadPinyin()]).then(([d]) => { learner.init(d); days.init({ data: d }); reader(reads(d)); return (data = d); }).catch((e) => { ready = null; throw e; }));
// Pinyin by model (pinyin on Auto, at a rung that leaves it to the learner): a word's reading shows while the model
// doubts it can be read: σ(θR − its difficulty + 0.4·log2(1 + times shown) − [looked up]) < 0.8 (algorithm.md §5). A
// word's difficulty is a typical line's of the lowest level it comes in (what the learner measures a card's other
// lines by), worked out once for every word, the first time it's asked; θR once a second at most. A model unsure of R
// pulls the chance toward a half (the probit, as predict() does), and so does a word the content doesn't have: unsure,
// the pinyin shows.
const TOKEN = /\["([^"\\]+)","[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/gi; // a token, [word, pinyin, gloss], in the JSON
function reads(d) {
  let lowest = null, R = null, at = -Infinity;
  return (w) => {
    if (!lowest) { lowest = new Map(); for (const s of d.scenarios) for (const [, x] of JSON.stringify(s).matchAll(TOKEN)) if (!(lowest.get(x) <= levels.of(s.level))) lowest.set(x, levels.of(s.level)); }
    if (!lowest.has(w)) return 0;
    if (performance.now() - at > 1000) { R = learner.skills().R; at = performance.now(); }
    const z = R.m + 1 - 0.67 * (lowest.get(w) - 1) + 0.4 * Math.log2(1 + vocab.times(w)) - (relearning(w) ? 1 : 0);
    return 1 / (1 + Math.exp(-z / Math.sqrt(1 + (Math.PI * R.s ** 2) / 8)));
  };
}
// Where a route goes: the feed (no hash), the lab (#lab), and Back from your phrases or numbers to wherever they were
// opened from (the feed's menu, the lab). The same hash again fires no hashchange, so then it's drawn directly.
const go = (hash) => (location.hash.slice(1) === hash ? route() : (location.hash = hash));
let from = ''; // the last route that wasn't #phrases, #stats or #play: '' (the feed) or 'lab' (the lab, or a version in it)
const back = () => { const b = h('button', 'ks-back', '‹'); b.type = 'button'; b.setAttribute('aria-label', 'Back to the versions'); b.onclick = () => go('lab'); return b; };
// For You's way to everything else, where a version's back button sits: a sheet with today's challenge, the situations
// you can handle, your phrases, your numbers and the lab at the top, About and Send feedback under them, and Settings
// under those (panel.js), headed by the streak and the countdown. (ks-open-set: what a check taps to open Settings, as
// in the lab.)
function menu() {
  const b = h('button', 'ks-back ks-menu ks-open-set', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>');
  b.type = 'button'; b.setAttribute('aria-label', 'Menu');
  b.onclick = () => openSettings({ head: head(), menu: places(), more: more() });
  return b;
}
// About (where there's an About page: files.js about()) and Send feedback (where web.json has a contact): a mail, as the
// end screen's "Something sound wrong?" is (report.js), of the story played last, on screen or not, and its lines
const more = () => {
  const page = files.about(), to = files.owner().contact, rows = played(events.all(), { last: true }), scn = data?.byId[rows[0]?.id.split('/')[0]] || null;
  return [page && { cls: 'ks-menu-about', label: 'About 快说', href: page }, to && { cls: 'ks-menu-feedback', label: 'Send feedback', href: mail({ feedback: true, scn, rows }) }].filter(Boolean);
};
const places = () => {
  const { met, due } = deck(), c = data && days.challenge(), r = chal(), sit = data ? situations(data).length : 0;
  return [
    { zh: '今日挑战', label: c ? `Today's challenge · #${c.n}` : "Today's challenge", meta: r ? `played · ${r.right}/${r.of}` : c?.id ? MOD[c.mod] : 'a new one every day', href: '#challenge', wide: true, squares: r?.squares },
    { zh: '情景', label: 'Situations', meta: sit ? `${sit} you can handle` : 'none yet', href: '#situations' },
    { zh: '句子', label: 'Your phrases', meta: met ? `${met} met${due ? ` · ${due} due` : ''}` : 'none yet', href: '#phrases', peek: peek() },
    { zh: '数据', label: 'Your numbers', meta: 'on this phone', href: '#stats', grid: data ? lately() : null },
    { zh: '实验', label: 'The lab', meta: 'the five versions', href: '#lab' },
  ];
};
// the streak (and its freezes) and the countdown, over the places: '' with neither
const head = () => { const st = days.streak(), c = countdown(); return [st.n && `🔥 ${st.n}-day streak${st.freezes ? ` ${'❄️'.repeat(st.freezes)}` : ''}`, countText(c) && `${SOON_ICON[c.what]} ${countText(c)}`].filter(Boolean).join(' · '); };
// the challenge's modifiers by name (mix.js MOD's: the menu draws before mix.js is loaded), and today's result
const MOD = { panic: '⏱ Panic clock', quiet: '🙈 No pinyin, no English' };
const chal = () => (data ? days.result() : null);
// A phrase's family (content request 5): a beat and its level variants (scn/beat, scn/beat@L) are one phrase on #phrases
// and in the counts. The phrases met (write cards and lines shadowed keep their own entries), by family, and how many
// have one due: the same rows #phrases lists (before the content has come: by their ids alone).
const family = (id, ph = data?.phraseById[id]) => ph?.family || id.replace(/@\d+$/, '');
const deck = () => {
  const all = srs.all(), t = now(), fams = new Map();
  for (const id in all) if (data ? data.phraseById[id] : !/^(write|shadow):/.test(id)) { const k = family(id); fams.set(k, fams.get(k) || all[id].due <= t); }
  return { met: fams.size, due: [...fams.values()].filter(Boolean).length };
};
// the menu's pictures: a few of your phrases as words, one a family, the due ones first; and the last three weeks as
// days played, oldest first (0 none, 1 a few cards, 2 five or more: events.js's daily totals)
const peek = () => {
  if (!data) return [];
  const all = srs.all(), seen = new Set(), out = [];
  for (const id of Object.keys(all).filter((id) => data.phraseById[id]).sort((a, b) => all[a].due - all[b].due)) {
    const ph = data.phraseById[id], k = family(id, ph);
    if (seen.has(k)) continue;
    seen.add(k); out.push(ph.t.find((t) => t.length > 1 && t[0].length > 1)?.[0] || ph.zh.slice(0, 3));
    if (out.length === 3) break;
  }
  return out;
};
const lately = () => { const d = events.daily(), t = Date.parse(days.today()); return [...Array(21)].map((_, i) => { const n = d[new Date(t - (20 - i) * 864e5).toISOString().slice(0, 10)]?.cards || 0; return n >= 5 ? 2 : n ? 1 : 0; }); };
installGloss();

// The lab: the five versions side by side, the Mix (For You, as the feed opens) first.
function home() {
  current?.destroy?.(); current = null;
  audio.stopAll();
  const { met, due } = deck(), env = speech.whyNot();
  root.innerHTML = '';
  const page = h('main', 'ks-home');
  // where the page can't listen, how to answer comes before the versions: it's how every line in all of them works
  page.innerHTML = `
    <button type="button" class="ks-btn ks-btn-quiet ks-lab-feed">‹ Back to the feed</button>
    <div class="ks-mark"><b lang="zh-CN">快说</b><span>The lab · Kuài Shuō</span></div>
    <h1>Tiny, ridiculous emergencies in Mandarin. When the scene stops, it's your line.</h1>
    ${env ? `<p class="ks-note-env">${esc(env)} Say each line out loud, then tap Show me.</p>` : ''}
    <p>Five versions of the same idea, to see which one works best (the feed opens on the Mix, dealt for you). Each opens a feed: swipe up for the next.</p>
    <div class="ks-versions"></div>
    <div class="ks-home-row"><button type="button" class="ks-btn ks-btn-quiet ks-open-set">Settings</button>
      <a class="ks-btn ks-btn-quiet" href="#phrases" style="text-decoration:none">Your phrases</a>
      <a class="ks-btn ks-btn-quiet" href="#stats" style="text-decoration:none">Your numbers</a>
      <span class="ks-due">${met ? `${met} phrases met, ${due} due for review` : ''}</span></div>
    <p class="ks-credits">Voices: Kokoro-82M v1.1-zh, generated locally (Apache-2.0). Word meanings: CC-CEDICT (CC BY-SA 4.0). Stroke data: Hanzi Writer and Make Me a Hanzi.</p>`;
  page.querySelector('.ks-lab-feed').onclick = () => go('');
  const list = page.querySelector('.ks-versions');
  for (const v of VERSIONS.filter((v) => !v.hidden)) {
    const scns = data ? (v.id === 'mix' ? data.scenarios : data.scenarios.filter((s) => s.format === v.id)) : [];
    const mins = Math.round(scns.reduce((t, s) => t + (s.secs || 0), 0) / 60);
    const meta = scns.length ? `<span class="ks-v-meta">${scns.length} ${v.id === 'mix' ? 'scenarios' : v.unit} · about ${mins} min</span>` : '';
    const b = h('button', 'ks-v', `<span class="ks-v-zh" lang="zh-CN">${esc(v.zh)}</span><span><span class="ks-v-name">${esc(v.name)}</span><br><span class="ks-v-blurb"><span style="color:var(--paper)">${esc(v.why)}</span> ${esc(v.blurb)}</span>${meta}</span>${v.tag ? `<span class="ks-v-tag">${esc(v.tag)}</span>` : ''}`);
    b.type = 'button';
    b.onclick = () => { audio.unlock(); location.hash = v.id; };
    list.append(b);
  }
  page.querySelector('.ks-open-set').onclick = () => openSettings();
  root.append(page);
}

// my: the route this open belongs to; after each wait a newer one (Back, another version) may have the screen. q: the
// route's options (#mix?deal=v1&why), for a version that reads them. own: For You, the feed the app opens on (no hash):
// the menu where a version's back button sits, the same button from the boot screen on, so a tap on it is never lost.
async function open(id, my, q, own = false) {
  const v = VERSIONS.find((x) => x.id === id);
  if (!v) return home();
  current?.destroy?.(); current = null;
  audio.stopAll();
  const way = own ? menu() : back();
  root.innerHTML = '<div class="ks-boot">快说</div>';
  root.append(way);
  let mod;
  try { await loadData(); mod = await v.load(); } catch (e) { if (my === nav) failed(e); return; }
  if (my !== nav) return;
  if (mod.missing) {
    root.innerHTML = `<main class="ks-home"><h1>${esc(v.name)} isn't built yet.</h1><p><a href="#lab" style="color:var(--gold)">Back to the versions</a></p></main>`;
    return;
  }
  root.innerHTML = '';
  const app = { data, openSettings, home: () => go(own ? '' : 'lab'), q: new URLSearchParams(q || ''), hooked: own && hooked };
  hooked = false;
  try {
    if (mod.mount) { current = mod.mount(root, app); if (own) forYou = current; }
    else {
      // a version can name its opening order (export const order = ['village-tiger', …]); the rest follow, as listed
      const at = (s) => { const k = (mod.order || []).indexOf(s.id); return k < 0 ? 1e3 : k; };
      const items = content.of(mod.format || id).slice().sort((a, b) => at(a) - at(b));
      current = feed(root, { items, card: (el, scn, f) => assisted(el, scn, { ...app, ...f }, (c) => mod.createCard(el, scn, c)) });
    }
  } catch (e) { return failed(e); }
  root.append(way);
}

// What's on screen goes, for your phrases or your numbers: For You, when they're a trip from its menu, set aside (mix.js
// aside(): its card stopped where it was, nothing logged as left, its menu button hidden), the rest thrown away; and put
// back by their Back, or thrown away by any other route. → the nodes kept on the page (For You's), for the page to go
// over
function away() {
  if (kept) return kept.nodes;
  if (current && current === forYou && !from) {
    kept = { feed: current, nodes: [...root.children] };
    current = null; kept.feed.aside?.(true);
    root.querySelectorAll(':scope > .ks-back').forEach((b) => (b.hidden = true));
    return kept.nodes;
  }
  current?.destroy?.(); current = forYou = null;
  return [];
}
const drop = () => { if (kept) { kept.feed.destroy?.(); kept = forYou = null; } };
// a page drawn over what was kept (or alone): everything else on the page goes
function show(el, nodes = []) { for (const n of [...root.children]) if (!nodes.includes(n)) n.remove(); root.append(el); scrollTo(0, 0); }
// For You put back as it was (Back from your phrases or your numbers): its card on screen again
function restore() {
  const { feed, nodes } = kept;
  kept = null; current = forYou = feed;
  for (const n of [...root.children]) if (!nodes.includes(n)) n.remove();
  root.querySelectorAll(':scope > .ks-back').forEach((b) => (b.hidden = false));
  feed.aside?.(false);
}

// The 快说 mark with a line to tap: the gate before sound can start, the retry after a failure. hook: a line over the
// tap (a string, or a promise of one or null), shown as it comes if the gate is still up. info: About, small, under it
// (where there's an About page: files.js about()), beside the gate's button and not in it.
function tap(label, go, hook = null, info = false) {
  root.innerHTML = ''; hooked = false;
  const g = h('button', 'ks-boot', `<span class="ks-gate"><span>快说</span><span class="ks-gate-hook" hidden></span><span class="ks-gate-tap">${esc(label)}</span></span>`);
  g.type = 'button'; g.style.border = '0'; g.style.width = '100%';
  g.onclick = () => { audio.unlock(); go(); };
  root.append(g);
  const page = info && files.about();
  if (page) { const a = h('a', 'ks-gate-about', 'About 快说'); a.href = page; root.append(a); }
  Promise.resolve(hook).then((line) => { const e = g.querySelector('.ks-gate-hook'); if (line && e && g.isConnected) { e.textContent = line; e.hidden = false; hooked = true; } }, () => {});
}
// "Click" where the pointer is a mouse or a trackpad, "Tap" on a touch screen (web.md §5)
const TAP = () => (matchMedia('(pointer: fine)').matches ? 'Click' : 'Tap');

// Phones only start sound from a tap, so a link straight into a version waits for one. Where audio.js can tell, the
// launcher's tap counts (an iPhone only says 'running' a moment after it, so running() alone would ask for a second).
function gate(go, hook) {
  if ((audio.unlocked || audio.running)()) return go();
  tap(`${TAP()} to start · sound on`, go, hook, true);
}
// The gate is the hook (p3.md): a phone that has never played sees its first card's premise over the tap. Its first card
// is the hook story (rank.js deals it first: the scenario marked first, else the airport), and the premise is that
// story's own gate line, else the one here; with neither, the gate as before. A phone that has played sees the gate as
// it always has. Never played is the ranker's own reading (rank.js never()): no line in the learner model, no srs entry,
// no story done; so a hook it deals again (the page went away under it, before a line was said) comes with its premise.
const HOOK = { 'airport-esim': 'You\'ve just landed at Pudong, and your phone has no signal.' };
const never = () => !learner.level().n && !srs.count() && !Object.keys(marks.doneAll()).length;
// The hook's voices load and decode while its premise is read, so its first line comes on time after the tap (p3.md's
// 8 s: on a busy laptop the pack, after the tap, cost 1.5 s). The context made here waits suspended for the tap's unlock.
const hook = () => loadData().then((d) => { const s = never() && (d.scenarios.find((x) => x.first) || d.byId['airport-esim']); if (s?.audio) audio.load(s.audio); return s ? s.gate || HOOK[s.id] || null : null; }, () => null);

// The data didn't arrive (a blip on the phone's network, a file missing) or a version didn't start: say so, and offer
// the same route again and a way back, rather than leave the boot screen up for good.
function failed(e) {
  console.error(e);
  tap(`Couldn't load · ${TAP().toLowerCase()} to try again`, route);
  // what went wrong, small, so a screenshot says where to look
  root.querySelector('.ks-boot > span')?.append(h('span', '', esc(String(e?.message || e).slice(0, 240))));
  root.querySelector('.ks-boot > span > span:last-child')?.setAttribute('style', 'font:13px/1.4 var(--body);color:rgba(247,242,232,0.6);max-width:300px;text-align:center;overflow-wrap:anywhere');
  root.append(back());
}
// voices that can't be fetched leave the story playing quietly; say so once, with why
window.addEventListener('ks:voices', (e) => toast(`Voices couldn't load (${e.detail}). The story plays on as text.`, 6000));

// #play?id=<scenario>&lv=<level>&A=<rung>: one story, at one say level when lv is given, straight in (the content
// gate's links; with ?data=<dir> before the #, a draft build's). It's held at rung A, v1's A2 unless given (A=auto: the
// ladder's, as in the feeds), and a held story teaches the learner model nothing: a reviewer trying its branches, or
// failing on purpose, isn't playing for real.
async function play(q, my) {
  current?.destroy?.(); current = null;
  audio.stopAll();
  try { await loadData(); } catch (e) { if (my === nav) failed(e); return; }
  if (my !== nav) return;
  const scn = data.byId[q.get('id')], v = scn && VERSIONS.find((x) => x.id === scn.format);
  if (!v) { root.innerHTML = `<main class="ks-home"><h1>No story called ${esc(q.get('id') || '')}.</h1><p><a href="#lab" style="color:var(--gold)">Back to the versions</a></p></main>`; return; }
  let mod;
  try { mod = await v.load(); } catch (e) { if (my === nav) failed(e); return; }
  if (my !== nav) return;
  root.innerHTML = '';
  const app = { data, openSettings, home: () => go('lab') }, A = q.get('A') === 'auto' ? undefined : /^[0-5]$/.test(q.get('A') || '') ? +q.get('A') : 2;
  learner.hush((held = A != null));
  current = feed(root, { items: [content.tailor(scn, q.get('lv'))], card: (el, s, f) => assisted(el, s, { ...app, ...f }, (c) => mod.createCard(el, s, c), { hold: A }) });
  root.append(back());
}

// What this phone has seen you do (events.js): today, the last seven days, and by format and by way of answering. Kept
// here only; the page says so.
function stats() {
  const keep = away();
  audio.stopAll();
  const daily = events.daily(), rows = events.all(), today = events.dayKey(), sess = events.session(), st = data ? days.streak() : null;
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–'), mins = (ms) => (!ms ? '–' : ms < 60000 ? '<1 min' : `${Math.round(ms / 60000)} min`);
  const FMT = { scene: 'Scenes', call: 'Calls', chat: 'Chats', chase: 'Chase' }, WAY = { speak: 'Speaking', self: 'Say & check', type: 'Typing', tiles: 'Tiles' };
  const secs = (ms, n) => (n ? `${(ms / n / 1000).toFixed(1)} s` : '–');
  // the streak (days.js's, the menu's: a story or three reviews keep a day, a freeze carries one missed), its best, and
  // the days played at all (the streak once the content's come: days.js starts with it)
  const streak = !st ? '' : st.n ? `🔥 <b>${st.n}</b>-day streak${st.freezes ? ` ${'❄️'.repeat(st.freezes)}` : ''}${st.best > st.n ? `, best ${st.best}` : ''}` : st.best ? `Best streak: ${st.best} day${st.best === 1 ? '' : 's'}` : '';
  const week = [...Array(7)].map((_, k) => events.dayKey(now() - k * 864e5));
  const row = (cells, head) => `<tr>${cells.map((c) => `<${head ? 'th' : 'td'}>${c}</${head ? 'th' : 'td'}>`).join('')}</tr>`;
  const t = daily[today] || {}, played = Object.values(daily).filter((d) => d.sessions).length;
  // by format (cards) and by way of answering (lines), over the rows still kept
  const by = (list, key) => list.reduce((m, r) => ((m[r[key] || '?'] ||= []).push(r), m), {});
  const cards = rows.filter((r) => r.k === 'card' && r.kind === 'scn'), lines = rows.filter((r) => r.k === 'line' && r.res !== 'cancel');
  const fmts = Object.entries(by(cards, 'fmt')).map(([f, l]) => row([esc(FMT[f] || f), l.length, pct(l.filter((r) => r.state === 'done').length, l.length), pct(l.filter((r) => r.state === 'playing').length, l.length)]));
  const modes = Object.entries(by(lines, 'mode')).map(([m, l]) => row([esc(WAY[m] || m), l.length, pct(l.filter((r) => r.res === 'ok').length, l.length), secs(l.reduce((s, r) => s + (r.ms || 0), 0), l.length)]));
  const page = h('main', 'ks-home ks-stats');
  page.innerHTML = `<div class="ks-mark"><b lang="zh-CN">数据</b><span>Your numbers</span></div>
    <p class="ks-note-env">Kept on this phone only. At most, daily totals of it, summed with everyone else’s, are sent (About says which).</p>
    <p class="ks-stats-streak">${streak ? `${streak} · ` : ''}${played} day${played === 1 ? '' : 's'} played${sess ? ` · this visit: ${sess.cards} cards, ${sess.lines} lines` : ''}</p>
    <h2>Today</h2>
    <table>${row(['Time', 'Cards', 'Done', 'Left', 'Lines', 'Right', 'Think'], true)}${row([mins(t.ms), t.cards || 0, pct(t.done || 0, t.cards), pct(t.left || 0, t.cards), t.lines || 0, pct(t.ok || 0, t.lines), secs(t.think || 0, t.lines)])}</table>
    <h2>The last seven days</h2>
    <table>${row(['Day', 'Time', 'Cards', 'Lines', 'Right'], true)}${week.map((k) => { const d = daily[k] || {}; return row([k.slice(5), mins(d.ms), d.cards || 0, d.lines || 0, pct(d.ok || 0, d.lines)]); }).join('')}</table>
    ${fmts.length ? `<h2>Stories, by format</h2><table>${row(['Format', 'Played', 'Finished', 'Left mid-story'], true)}${fmts.join('')}</table>` : ''}
    <p class="ks-stats-key">Left: swiped away before the story ended. Think: the time to your answer, while the clock ran.</p>
    ${modes.length ? `<h2>Lines, by way of answering</h2><table>${row(['Way', 'Lines', 'Right', 'Thinking'], true)}${modes.join('')}</table>` : ''}
    <button type="button" class="ks-btn ks-btn-quiet">Back</button>`;
  page.querySelector('.ks-btn').onclick = () => go(from);
  show(page, keep);
}

// Every phrase you've said, best first, with its voice: the deck spaced review draws from. A beat and its level
// variants (its family: scn/beat and scn/beat@L, content request 5) are one row: the line as you met it last, the best
// stars you've had at any of its levels, and the levels met.
async function phrases(my) {
  const keep = away();
  try { await loadData(); } catch (e) { if (my === nav) failed(e); return; }
  if (my !== nav) return;
  const all = srs.all(), fams = new Map(), t = now();
  for (const [id, p] of Object.entries(all)) { const ph = data.phraseById[id]; if (ph) { const k = family(id, ph); fams.set(k, [...(fams.get(k) || []), { p, ph }]); } }
  const list = [...fams.values()].map((ms) => { const last = ms.reduce((a, b) => (b.p.last > a.p.last ? b : a)); return { ph: last.ph, last: last.p.last, best: Math.max(...ms.map((m) => m.p.best)), box: Math.max(...ms.map((m) => m.p.box)), due: ms.some((m) => m.p.due <= t), lvs: [...new Set(ms.map((m) => levels.of(m.ph.level)))].sort((a, b) => a - b) }; })
    .sort((a, b) => b.box - a.box || b.last - a.last);
  const page = h('main', 'ks-home ks-book'), solid = list.filter((x) => x.box >= 4).length;
  page.innerHTML = `<div class="ks-mark"><b lang="zh-CN">句子</b><span>Your phrases · ${list.length}</span></div>
    <p class="ks-book-head"><b>${list.length} phrase${list.length === 1 ? '' : 's'}</b> · <b>${solid}</b> solid</p>
    <p>Every line you've said. The ones you know drift down the review queue; the ones that slipped come back sooner. Each ring fills as a phrase sticks: solid at four.</p>
    <div class="ks-book-list"></div><button type="button" class="ks-btn ks-btn-quiet">Back</button>`;
  const ul = page.querySelector('.ks-book-list');
  if (!list.length) ul.innerHTML = '<p class="ks-note-env">Nothing yet. Play a scene and the phrases you say will collect here.</p>';
  for (const { ph, best, due, lvs, box } of list) {
    const row = h('div', 'ks-book-row');
    row.dataset.family = family(ph.id, ph); row.dataset.box = box; // (for tests)
    const zhEl = zhText(ph.t, { pinyin: 'all', count: false });
    const info = h('div', 'ks-book-info', `<span>${esc(ph.gloss || ph.en)}</span><span class="ks-book-meta">${'★'.repeat(best)}${due ? ' · due now' : ''}</span><span class="ks-book-lv" aria-label="Levels met: ${lvs.join(', ')}">${lvs.map((l) => `<i class="ks-lvl" title="${esc(levels.LEVELS[l].name)}">L${l}</i>`).join('')}</span>`);
    const play = h('button', 'ks-tool', '🔊'); play.type = 'button'; play.setAttribute('aria-label', 'Hear it');
    play.onclick = () => { audio.unlock(); audio.play(ph.audio, ph.a); };
    const txt = h('div', 'ks-book-txt'); txt.append(zhEl, info);
    row.append(ring(box), txt, play); ul.append(row);
  }
  // Replies you said should count when the checker didn't know them (ask.js): the ones to add to a scenario's answers.
  const counted = marks.list('counted').map((k) => { try { return [k, ...JSON.parse(k)]; } catch { return null; } }).filter(Boolean);
  if (counted.length) {
    const box = h('section', 'ks-book-list', `<h2 class="ks-book-h">Counted by you · ${counted.length}</h2><p>Replies the checker didn't know, which you said should count. The good ones belong in their scenario's answers.</p>`);
    for (const [k, id, said] of counted) {
      const ph = data.phraseById[id], row = h('div', 'ks-book-row');
      row.innerHTML = `<div class="ks-book-txt"><span class="ks-zh" lang="zh-CN">${esc(said)}</span><div class="ks-book-info"><span>${esc(ph ? ph.en : id)}</span><span class="ks-book-meta" lang="zh-CN">${esc(ph ? ph.zh : '')}</span></div></div>`;
      const x = h('button', 'ks-tool', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Forget this one');
      x.onclick = () => { if (marks.has('counted', k)) marks.toggle('counted', k); row.remove(); };
      row.append(x); box.append(row);
    }
    page.insertBefore(box, page.querySelector('.ks-btn')); // above Back
  }
  page.querySelector('.ks-btn').onclick = () => go(from);
  show(page, keep);
}

// A phrase's box (srs: 0 just met, 6 two months apart) as a ring of six, filled as it climbs; gold from four, solid
const SAYS = ['just met', 'back in minutes', 'back the same visit', 'recalled after a day', 'recalled after three days', 'recalled after a week', 'recalled after three weeks'];
function ring(box) {
  const r = 15, C = 2 * Math.PI * r, seg = C / 6, el = h('span', `ks-ring6${box >= 4 ? ' ks-ring6-solid' : ''}`);
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${box} of 6: ${SAYS[box] || ''}`);
  el.innerHTML = `<svg viewBox="0 0 36 36" aria-hidden="true">${[...Array(6)].map((_, i) => `<circle cx="18" cy="18" r="${r}" stroke-dasharray="${(seg - 3).toFixed(2)} ${(C - seg + 3).toFixed(2)}" stroke-dashoffset="${(-i * seg).toFixed(2)}"${i < box ? ' class="ks-on"' : ''}/>`).join('')}</svg><b>${box}</b>`;
  return el;
}

// The situations you can handle (p5.md): stories won at 2★ or more whose lines have all come back from memory after a
// day (recap.js situations()), as stamps, newest first, each with its endings found where it has more than one; and
// under them the ones nearly there.
async function stamps(my) {
  const keep = away();
  try { await loadData(); } catch (e) { if (my === nav) failed(e); return; }
  if (my !== nav) return;
  const list = situations(data), lock = toLock(data).filter((s) => !list.some((x) => x.scn.id === s.id));
  const page = h('main', 'ks-home ks-sit');
  page.innerHTML = `<div class="ks-mark"><b lang="zh-CN">情景</b><span>Situations · ${list.length}</span></div>
    <p>Stories you've won whose lines came back to you a day later, from memory. You could handle these for real.</p>
    <div class="ks-sit-list"></div>
    ${lock.length ? `<h2 class="ks-book-h">Nearly there · ${lock.length}</h2><p class="ks-sit-near">Won, and their lines are coming back for review: ${lock.map((s) => `<span lang="zh-CN">${esc(s.stage || '')} ${esc(s.title)}</span>`).join(' · ')}</p>` : ''}
    <button type="button" class="ks-btn ks-btn-quiet">Back</button>`;
  const ul = page.querySelector('.ks-sit-list');
  if (!list.length) ul.innerHTML = '<p class="ks-note-env">None yet. Win a story, and once its lines come back to you from memory a day later, it lands here.</p>';
  for (const { scn, stars, at } of list) {
    const e = days.endings(scn), d = new Date(at);
    const li = h('div', 'ks-sit-stamp', `<span class="ks-sit-emoji" aria-hidden="true">${esc(scn.stage || '🎬')}</span><div><b lang="zh-CN">${esc(scn.title)}</b><span>${esc(scn.title_en)}</span><small><span aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></span>${e.of > 1 ? ` · ${e.found ? `${e.found} of ${e.of} endings found` : `${e.of} endings to find`}` : ''} · since ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}</small></div>`);
    li.dataset.id = scn.id; // (for tests)
    ul.append(li);
  }
  page.querySelector('.ks-btn').onclick = () => go(from);
  show(page, keep);
}

// 今日挑战 from the menu (#challenge): played today (a run finished), its result and the share text, and when the next one
// comes (4 am); not yet (or left part-way: it goes on where it was), the day's story straight in, at your say level with
// its modifier (mix.js challengeCard), Back to the feed.
async function challenge(my) {
  current?.destroy?.(); current = null;
  audio.stopAll();
  try { await loadData(); } catch (e) { if (my === nav) failed(e); return; }
  if (my !== nav) return;
  const mix = await VERSIONS[0].load(), r = days.result(), item = mix.challengeItem(data);
  if (my !== nav) return;
  const bk = h('button', 'ks-back', '‹'); bk.type = 'button'; bk.setAttribute('aria-label', 'Back to the feed'); bk.onclick = () => go('');
  if (r || !item) {
    const t = now(), next = new Date(t); next.setHours(4, 0, 0, 0); if (next <= t) next.setDate(next.getDate() + 1);
    const hrs = Math.max(1, Math.round((next - t) / 36e5)), scn = data.byId[r?.id];
    const page = h('main', 'ks-home ks-chal-page');
    page.innerHTML = `<div class="ks-mark"><b lang="zh-CN">今日挑战</b><span>Today's challenge${r ? ` · #${r.n}` : ''}</span></div>
      ${r ? `<p class="ks-chal-story"><span aria-hidden="true">${esc(scn?.stage || '')}</span> <b lang="zh-CN">${esc(scn?.title || '')}</b> ${esc(scn?.title_en || '')} · ${esc(mix.MOD[r.mod] || '')}</p>
      <p class="ks-chal-big" aria-label="${r.right} of ${r.of} lines">${r.squares}</p><p class="ks-chal-score"><b>${r.right}/${r.of}</b></p>
      <pre class="ks-chal-text">${esc(r.text)}</pre><button type="button" class="ks-btn ks-chal-share">Share</button>` : '<p>No challenge today.</p>'}
      <p class="ks-note-env">The next one is #${(r?.n || 0) + 1}, in about ${hrs} hour${hrs === 1 ? '' : 's'}: the same story on every phone.</p>
      <button type="button" class="ks-btn ks-btn-quiet ks-chal-back">Back to the feed</button>`;
    page.querySelector('.ks-chal-share')?.addEventListener('click', (e) => share(r.text, e.currentTarget));
    page.querySelector('.ks-chal-back').onclick = () => go('');
    root.innerHTML = ''; root.append(page); scrollTo(0, 0);
    return;
  }
  root.innerHTML = '';
  const app = { data, openSettings, home: () => go('') };
  current = feed(root, { items: [item], card: (el, it, f) => mix.challengeCard(el, it, { ...app, ...f }) });
  root.append(bk);
}

function route() {
  const [id, qs] = location.hash.slice(1).split('?'), my = ++nav;
  // leaving a held story (#play): it's put away first, so even its last row goes unheard
  if (held) { current?.destroy?.(); current = null; audio.stopAll(); held = false; learner.hush(false); }
  // For You set aside for your phrases or numbers: back to it as it was, or (any other route) gone
  if (kept && !id) return restore();
  if (kept && !['phrases', 'stats', 'situations'].includes(id)) drop();
  if (!['phrases', 'stats', 'situations', 'play', 'challenge'].includes(id)) from = id ? 'lab' : '';
  // the launcher draws at once, and again with the counts; if the data fails, opening a version says so
  if (id === 'lab') { home(); if (!data) loadData().then(() => my === nav && home(), () => {}); return; }
  if (id === 'phrases') return phrases(my);
  if (id === 'stats') { stats(); if (!data) loadData().then(() => my === nav && stats(), () => {}); return; }
  if (id === 'situations') return stamps(my);
  if (id === 'challenge') { loadData().catch(() => {}); return gate(() => challenge(my)); }
  if (id === 'play') { loadData().catch(() => {}); return gate(() => play(new URLSearchParams(qs), my)); }
  loadData().catch(() => {}); // download while the gate waits for its tap; open() reports a failure
  // For You (no hash, or #?why for its reasons): the Mix's code fetched while the gate waits too, so the first card
  // starts the moment it's tapped
  if (!id) { VERSIONS[0].load().catch(() => {}); return gate(() => open('mix', my, qs, true), hook()); }
  gate(() => open(id, my, qs));
}
addEventListener('hashchange', route);
files.web(); // web.json, while the gate waits: the menu's Send feedback and the end screen's report link read it
tally.init(); // the daily totals the real site sends (tally.js: what's counted, and never who)
route();

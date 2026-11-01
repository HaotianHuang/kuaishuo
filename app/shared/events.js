// What happened, kept on this phone: a row per answer panel (a line), per card left and per session, in a ring of the
// last ROWS (ks.log), plus daily totals kept for months (ks.days). The learner model and the ranker learn from it and
// #stats shows it. A server, if one is ever allowed, would get the daily totals, never the rows (docs/v2/README.md §1).
import { now } from './time.js';
import { kv, marks } from './store.js';

const ROWS = 2000, DAYS = 120, GAP = 30 * 60e3, BUSY = 5 * 60e3; // 30 min away ends a session; a pause over 5 min isn't time spent
export const count = { panels: 0, lines: 0 }; // every answer panel logs exactly one line: tests check it (KS_COUNT)
globalThis.KS_COUNT = count;

let rows = null, days = null, sess = null, timer = 0, card = null, awayMs = 0, awayAt = 0;
// how long the page has been hidden in all, so a duration can leave the time away out
export const away = () => awayMs + (awayAt ? performance.now() - awayAt : 0);
// who else hears each row as it's logged (the learner model): on(fn) → off()
const ears = new Set();
export const on = (fn) => (ears.add(fn), () => ears.delete(fn));
const tell = (row) => ears.forEach((fn) => { try { fn(row); } catch (e) { console.error(e); } });
function load() { if (!rows) { rows = kv.get('log', { v: 1, rows: [] }).rows || []; days = kv.get('days', {}); sess = kv.get('sess', null); } }
function save() { clearTimeout(timer); timer = 0; if (!rows) return; kv.set('log', { v: 1, rows }); kv.set('days', days); kv.set('sess', sess); }
const soon = () => { if (!timer) timer = setTimeout(save, 1000); }; // at most one write a second

// The day a moment belongs to, starting at 4 am, so a late night counts for the evening it began.
export function dayKey(t = now()) {
  const d = new Date(t - 4 * 3600e3), two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}
const tally = (t, k, n = 1) => { const d = (days[dayKey(t)] ||= {}); d[k] = (d[k] || 0) + n; };
const put = (row) => { rows.push(row); if (rows.length > ROWS) rows.splice(0, rows.length - ROWS); };

// The session a moment belongs to: half an hour away (or more) starts a new one, and closes the last with its own row.
function touch(t) {
  if (sess && t - sess.last < GAP) { tally(t, 'ms', Math.min(t - sess.last, BUSY)); sess.last = t; return; }
  if (sess) put({ k: 'sess', at: sess.start, end: sess.last, cards: sess.cards, lines: sess.lines });
  sess = { start: t, last: t, cards: 0, lines: 0 };
  tally(t, 'sessions');
  const keys = Object.keys(days).sort();
  while (keys.length > DAYS) delete days[keys.shift()];
}
function add(row, heard) {
  load(); const t = now(); touch(t); const r = { at: t, ...row };
  if (heard?.length) Object.defineProperty(r, 'heard', { value: heard }); // (line(), below: not enumerable, so never written)
  put(r); soon(); tell(r); return t;
}

// An answer panel, once, as it goes (ask.js settle): what was asked, how it was answered, how long the thinking took.
// heard: what the recogniser wrote, or what was typed or built, each try's; it rides on the row in memory only, for this
// visit's report mail (report.js: the lines just played, with what was heard), and is never kept: the log, the model
// and the ranker see a row without it, and a reload forgets it (about.html: the words you say aren't kept).
export function line({ heard, ...r }) {
  count.lines++;
  const t = add({ k: 'line', ...r }, heard);
  if (r.res === 'cancel') return; // never answered: not a line said
  tally(t, 'lines'); if (r.res === 'ok') tally(t, 'ok'); tally(t, 'stars', r.stars || 0); tally(t, 'think', r.ms || 0);
  sess.lines++;
}

// What a feed item is: a scenario (each version's own feed), or one of the Mix's (a review, a run, a word to write…;
// the about card, id 'about'; the bonus line, by its phrase's id and level, as a review is).
export function what(it) {
  if (!it?.kind) return { kind: 'scn', id: it?.id, fmt: it?.format, lv: it?.level };
  if (it.kind === 'about') return { kind: 'about', id: 'about' };
  const s = it.scn || it.item?.scn;
  return { kind: it.kind, id: s?.id || it.p?.id || it.item?.word || (it.ps ? it.ps.map((p) => p.id).join(',') : it.kind), fmt: s?.format || (it.kind === 'run' ? 'chase' : undefined), lv: s?.level ?? it.p?.level };
}
// A card comes on screen (feed.js), and is left: how long it was up, how far it got (its state: idle, playing, done),
// how it was left (a swipe, Next, a key, back to the versions), how a scenario ended, and the small things done on it;
// and what the card says of itself as it comes (x: the Mix's, why it was dealt). An end card, a recap or the about card
// has nothing to play: logged, but not a card played in the day's or the visit's numbers. (The bonus line is played: it
// counts, as a review does, once it's had a go; passed by at its Have a go, nothing was played, and it doesn't.)
const UNPLAYED = ['end', 'recap', 'about'];
export function cardIn(item, el, x) { load(); touch(now()); soon(); card = { ...what(item), item, el, was: el?.dataset.state, in: now(), t0: performance.now(), n: {}, x }; }
export function cardOut(el, how = 'swipe') {
  if (!card) return;
  const c = card, state = el?.dataset.state || 'idle', d = c.kind === 'scn' || c.kind === 'challenge' ? marks.doneAll()[c.id] : null; // (the challenge is a story too)
  card = null;
  const mine = d && d.at >= c.in, again = c.was === 'done' && !mine; // back on a card finished before: nothing new
  const t = add({ k: 'card', kind: c.kind, id: c.id, fmt: c.fmt, lv: c.lv, ms: Math.round(performance.now() - c.t0), state, how, ...(mine ? { out: d.outcome, stars: d.stars } : {}), ...(again ? { again } : {}), ...c.x, ...c.n });
  if (again || UNPLAYED.includes(c.kind) || (c.kind === 'bonus' && state === 'idle')) return;
  tally(t, 'cards'); if (state === 'done') tally(t, 'done'); if (state === 'playing') tally(t, c.n.asked ? 'left' : 'skipped');
  sess.cards++;
}
// a small thing done on the card on screen: a word looked up, the English shown, a call peeked, a replay, a like
export function note(kind, n = 1) { if (card) card.n[kind] = (card.n[kind] || 0) + n; }

export const all = () => (load(), rows);
export const daily = () => (load(), days);
export const session = () => (load(), sess && now() - sess.last < GAP ? sess : null);

// the page going away writes everything now (a phone may never come back to finish the timer)
if (typeof document !== 'undefined') {
  let gone = null; // the card on screen when the page went away: closed then, opened again on the way back
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { awayAt ||= performance.now(); if (!rows) return; gone = card; if (card) cardOut(card.el, 'hide'); put({ at: now(), k: 'hide' }); save(); return; }
    if (awayAt) { awayMs += performance.now() - awayAt; awayAt = 0; }
    if (sess && now() - sess.last < GAP) sess.last = now(); // the time away wasn't time spent
    if (gone?.el.isConnected && !card) cardIn(gone.item, gone.el, gone.x);
    gone = null;
  });
  addEventListener('pagehide', () => rows && save());
}

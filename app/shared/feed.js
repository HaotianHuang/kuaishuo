// The vertical feed: one card per screen; swipe, scroll, or use the arrow keys for the next. Only the cards next to
// the one on screen are built, so a long feed stays light. A card in the middle of a beat can lock the feed, so a
// stray swipe while speaking doesn't throw the scene away. A feed with more() is dealt one card ahead: the next card is
// asked for as this one comes on screen, so whoever deals it (the Mix's ranker) knows how the last one went, and it can
// still be swapped for another until it starts to come on screen (replace).
//
// feed(root, { items, card(el, item, ctx) → { enter(), leave(), destroy(), row() }, more() → items, onActive(i, item) })
//   (row(): what else the card's row in the log says, as it comes on screen: the Mix's, why it was dealt)
//   → { el, go(i), add(item), replace(i, item) → swapped, unseen(i), slot(i) → { item, el, seen }, active, size, aside(on),
//       destroy() }
// ctx: { lock(bool), next(), index, isActive() }; a scenario's card made through assisted() also has ctx.assist, and so
// does a card of phrases made through atLines() (the Mix's reviews at a rung)
import { h, esc, cardHelp } from './text.js';
import { marks, settings, srs } from './store.js';
import * as audio from './audio.js';
import * as levels from './levels.js';
import * as events from './events.js';
import * as assist from './assist.js';
import * as learner from './learner.js';
import * as content from './content.js';
import * as days from './days.js';
import { defaultMode, quiet } from './ask.js';
import { canListen, whyNot } from './speech.js';
import { now } from './time.js';
import { owner } from './files.js';
import { played, mailto } from './report.js';

// what a card's row says of itself (row()), and, written as it's left done, the ending its run reached (a format sets
// data-end at its end step: days.endKey), so a story's endings found are the log's alone (days.js endings)
const ended = (el, x) => Object.defineProperty({ ...x }, 'end', { enumerable: true, get: () => (el.dataset.state === 'done' && el.dataset.end) || undefined });
export function feed(root, { items, card, more, onActive }) {
  const scroller = h('div', 'ks-feed');
  root.append(scroller);
  const cards = [];
  // by: how the next card is reached, when it isn't a swipe (Next ↓, a key); heading: the card go() is scrolling to
  // away: the feed put aside (aside(), below)
  let active = -1, by = null, heading = -1, soon = 0, away = false;
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) activate(+e.target.dataset.i); }, { root: scroller, threshold: 0.6 });
  const make = (i) => { const el = h('article', 'ks-card'); el.dataset.i = i; el.inert = active >= 0 && i !== active; io.observe(el); return el; };
  // a card dealt next to the one on screen is built at once, so it's ready (and its voices fetched) before it's swiped in
  const add = (item) => { const i = cards.length; cards.push({ item, el: make(i), ctl: null, seen: false }); scroller.append(cards[i].el); if (active >= 0 && Math.abs(i - active) <= 1) mount(i); };
  const ctxFor = (i) => ({
    index: i,
    isActive: () => active === i,
    lock: (on) => { if (active === i) scroller.classList.toggle('ks-locked', !!on); },
    next: () => go(i + 1, 'next'),
  });
  const mount = (i) => { const c = cards[i]; if (c && !c.ctl) { c.ctl = card(c.el, c.item, ctxFor(i)) || {}; } };
  const unmount = (i) => { const c = cards[i]; if (c?.ctl) { try { c.ctl.destroy?.(); } catch (e) { console.error(e); } c.ctl = null; c.el.innerHTML = ''; } };
  // fetch and decode the next card's voices a moment after this one has started (its own come first), so it starts the
  // moment it's swiped in: whichever card is there by then (one swapped meanwhile is the one fetched)
  const voices = (i) => { clearTimeout(soon); soon = setTimeout(() => { const nx = cards[i]?.item, url = nx && (nx.audio || nx.scn?.audio || nx.p?.audio || nx.item?.scn?.audio || nx.item?.phrase?.audio); if (url) audio.load(url); }, 600); };
  // any of it on screen: a card being swiped in is showing, whether or not it's the one on screen yet
  const showing = (el) => { const r = el.getBoundingClientRect(), s = scroller.getBoundingClientRect(); return r.bottom > s.top + 1 && r.top < s.bottom - 1; };
  const unseen = (i) => !!cards[i] && !cards[i].seen && i !== active && i !== heading && !showing(cards[i].el);
  function activate(i) {
    if (i === active || !cards[i]) return;
    const prev = cards[active];
    scroller.classList.remove('ks-locked');
    if (prev) events.cardOut(prev.el, by || 'swipe');
    by = null; heading = -1;
    try { prev?.ctl?.leave?.(); } catch (e) { console.error(e); }
    active = i; cards[i].seen = true;
    // only the card on screen takes focus: Tab mustn't land in a neighbour that's built but off screen (and scroll to it)
    cards.forEach((c, k) => { c.el.inert = k !== i; Math.abs(k - i) <= 1 ? mount(k) : Math.abs(k - i) > 2 && unmount(k); });
    events.cardIn(cards[i].item, cards[i].el, ended(cards[i].el, cards[i].ctl?.row?.()));
    cardHelp(); // v1's pinyin and English, unless the card's assist says otherwise as it enters (assisted, below)
    try { cards[i].ctl?.enter?.(); } catch (e) { console.error(e); }
    keepAwake();
    onActive?.(i, cards[i].item);
    // one card ahead, asked for now that this one is on screen and has started (its rung chosen)
    if (more && i + 1 >= cards.length) (more() || []).forEach(add);
    voices(i + 1);
  }
  function go(i, how) {
    if (!cards[i]) { if (more) (more() || []).forEach(add); if (!cards[i]) return; }
    if (i !== active) { by = how; heading = i; }
    scroller.classList.remove('ks-locked');
    cards[i].el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  // A card that hasn't come on screen yet, swapped for another: the old one thrown away and the new one built in a fresh
  // element where it was (a card leaves its classes and styles on its own), its voices fetched again. Not one any of
  // which is showing (mid-swipe), nor the one Next ↓ is scrolling to. → whether it was swapped
  function replace(i, item) {
    if (!unseen(i)) return false;
    const c = cards[i], built = !!c.ctl;
    unmount(i); io.unobserve(c.el);
    const el = make(i);
    c.el.replaceWith(el); Object.assign(c, { item, el });
    if (built || Math.abs(i - active) <= 1) mount(i);
    if (i === active + 1) voices(i);
    return true;
  }
  // (not for a key something on the card already handled, nor under the settings sheet, nor while a swipe couldn't move
  // it either: the card holding it, ks.css's lock, the microphone open or a character being drawn; a line's answer panel
  // otherwise, as a swipe leaves mid-line, so a laptop's ↓ isn't dead for as long as a story is)
  const held = () => getComputedStyle(scroller).overflowY === 'hidden';
  const onKey = (e) => {
    if (e.defaultPrevented || e.target.closest?.('input, textarea, [contenteditable]') || held() || !scroller.isConnected || away || document.querySelector('.ks-sheet-bg')) return;
    if (['ArrowDown', 'PageDown', 'j'].includes(e.key)) { e.preventDefault(); go(active + 1, 'key'); }
    if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) { e.preventDefault(); go(Math.max(0, active - 1), 'key'); }
  };
  document.addEventListener('keydown', onKey);
  // A mouse wheel or a trackpad moves the feed as ↓ and ↑ do, a card a flick: its wheel events, and a trackpad's glide
  // after it, are one move till they pause (snapping alone lets a hard flick fly past cards, and in some browsers a
  // wheel's notch snaps back to where it was). From over the feed or the page beside it (a laptop's column); not from
  // a sheet, nor over something on the card that scrolls that way itself, nor a pinch (ctrl), nor while a swipe
  // couldn't move it either (the card holding it: ks.css's lock)
  let wheelAt = -1e9, wheelSum = 0, wheeled = false;
  const scrolls = (e, dy) => { for (let n = e; n && n !== scroller; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if (/auto|scroll/.test(o) && n.scrollHeight > n.clientHeight + 1 && (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0)) return true; } return false; };
  const onWheel = (e) => {
    const on = scroller.contains(e.target) || e.target === document.body || e.target === document.documentElement;
    if (!on || e.ctrlKey || away || !scroller.isConnected || Math.abs(e.deltaX) > Math.abs(e.deltaY) || document.querySelector('.ks-sheet-bg') || scrolls(e.target, e.deltaY)) return;
    e.preventDefault();
    if (e.timeStamp - wheelAt > 220) { wheelSum = 0; wheeled = false; } // a pause: the next move's
    wheelAt = e.timeStamp;
    if (wheeled || held()) return;
    wheelSum += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1);
    if (Math.abs(wheelSum) < 24) return;
    wheeled = true;
    const from = heading >= 0 ? heading : active; // a flick while the last one is still scrolling goes on from where it's going
    go(wheelSum > 0 ? from + 1 : Math.max(0, from - 1), 'wheel');
  };
  addEventListener('wheel', onWheel, { passive: false });
  items.forEach(add);
  requestAnimationFrame(() => activate(0));
  return {
    el: scroller, go, add, replace, unseen,
    slot: (i) => cards[i] && { item: cards[i].item, el: cards[i].el, seen: cards[i].seen },
    get active() { return active; },
    get size() { return cards.length; },
    // Put aside (For You's menu: a look at your phrases or your numbers, main.js) and back: the card on screen is left as
    // a swipe away leaves it (its sound stopped, back to its start) but not logged left, since it hasn't been; back, it
    // comes on screen again where it was, as a card swiped back to does, and the card dealt after it is still there. A
    // card done is only hushed, and back it's at its end screen: a call's and a chase's leave() put them back to their
    // start, and their enter() would ring again. Inert meanwhile, the keys too.
    aside(on) {
      const c = cards[active];
      if (!c || away === !!on) return;
      away = !!on; scroller.inert = away; scroller.classList.remove('ks-locked');
      const done = c.el.dataset.state === 'done';
      try { if (away) (done ? audio.stopAll() : c.ctl?.leave?.()); else { cardHelp(); if (!done) c.ctl?.enter?.(); keepAwake(); } } catch (e) { console.error(e); }
    },
    destroy() { if (cards[active]) events.cardOut(cards[active].el, 'back'); clearTimeout(soon); document.removeEventListener('keydown', onKey); removeEventListener('wheel', onWheel); io.disconnect(); cards.forEach((_, k) => unmount(k)); scroller.remove(); cardHelp(); },
  };
}

// A scenario's card at its rung of the assist ladder (assist.js), chosen as the card comes on screen (not as the feed
// builds it, a card ahead), from where the last card got to (assist.last()), for the way the player will answer it.
// While it's on screen its text help (pinyin, English) is the rung's, and each of its lines can move the rung (after():
// a bad line one easier, two quick wins one harder), so the next line starts from there, and the next card from there
// too, a step at most from where this one began (assist.js last()). A card glanced past moves nothing. make(ctx)
// builds the card; the formats read ctx.assist, and the card says its rung in data-assist (for tests: nothing on screen
// shows it). hold: a rung it stays at, moving nothing (#play). tau: the success to aim at (the Mix's ranker's, the τ it
// dealt the card for: the rung it estimated is then the one chosen, if nothing has moved since), else assist.js's 0.8.
// first: the card may hold the phone's first lines ever, which then play at FIRST_LINE and a step down each (atRung()):
// For You's cards (the first session's); the lab's feeds play their first lines as P1 left them. tau may be a function, read as
// the card comes on screen: a card built a card ahead and picked again since (the Mix's ranker brings its τ up to date
// in place) plays at the τ its last pick gave it, as ?why and its row say.
// mod: the daily challenge's modifier (mix.js), over whatever rung the card plays at, so everyone plays the same moment:
// panic, the clock at A0's (×0.7, and a clock even where the rung has none); quiet, no pinyin and no English. Through
// the knobs every format already reads (no format knows it's the challenge); a setting the player pinned still wins.
const latest = (x) => (typeof x === 'function' ? x() : x);
export const MODS = Object.freeze({ panic: { clock: assist.LADDER[0].clock, giveUp: 0 }, quiet: { pinyin: 'none', english: 'none' } });
const modded = (k, mod) => (MODS[mod] ? { ...k, ...MODS[mod] } : k);
const withMod = (a, mod) => (!MODS[mod] ? a : { get A() { return a.A; }, get knobs() { return modded(a.knobs, mod); }, ids: a.ids, after: (r) => a.after(r), mod });
export function assisted(el, scn, ctx, make, { hold, tau, first = false, mod } = {}) {
  const c = { ...ctx, assist: null }, ctl = make(c) || {};
  let off = null;
  const show = () => { el.dataset.assist = c.assist.A; cardHelp(c.assist.knobs); };
  const end = () => { off?.(); off = null; };
  return {
    ...ctl,
    enter() {
      end();
      c.assist = withMod(assist.forCard(scn, { last: assist.last(), mode: answering(scn), hold, tau: latest(tau) }), mod); show();
      if (first && hold == null) opening.set(c.assist, null); // its first line may be the phone's first
      // each line row while it's on screen (after() knows the card's own, and leaves out a task beside the story)
      off = events.on((r) => { if (c.assist.after(r)) show(); });
      ctl.enter?.();
    },
    leave() { ctl.leave?.(); end(); },
    destroy() { end(); ctl.destroy?.(); },
  };
}
// A card of phrases (a flash crisis, a run, the bonus: their ids) at the rung the ladder gives them as it comes on
// screen (assist.forLines: moving nothing, the five-card budget and where the next card starts as they were), where its
// dealer asked for one (the Mix's item.A): its clock, help and prompt (atRung), its text help while it's on screen, its
// voices' rate and a run's chaser (the formats read ctx.assist). kind: the card ('review', 'run'), for how its lines
// will be answered (answering(), read as it comes on screen, as the ranker reads it then); tau, as assisted()'s (a
// function: the ranker's latest). The card says its rung in data-assist, as a story's does.
export function atLines(el, ids, ctx, make, { kind = 'review', tau, level } = {}) {
  const c = { ...ctx, assist: null }, ctl = make(c) || {};
  return {
    ...ctl,
    enter() { c.assist = assist.forLines(ids, { mode: answering(null, kind), tau: latest(tau), level }); el.dataset.assist = c.assist.A; cardHelp(c.assist.knobs); ctl.enter?.(); },
  };
}

// A panel's ask() options at the card's rung (assist.js askOpts: its clock, help, echo, prompt, and the rung logged),
// read as each panel opens, so a rung moved by the line before reaches it; at L0, the line's own (lineRung: more help
// the first times it's met); and the phone's first lines ever, on a card that may hold them (assisted()'s first): the
// first FIRST_LINES lines met on it, at FIRST_LINE and a step down each (A5, A4, A3), their retries too (it's the line
// that's first, not the try: the second go at it keeps the help). A card with no rung (a review run v1 dealt) is v1's.
// A pressure the player pinned keeps the clock theirs (ask.js), and the rung's give-up with it: No clock waits, as v1.
// a card's rung (assisted()) → null till its first panel, then the phone's first lines met on it, in order (gone: its
// first panel came on a phone that had played)
const opening = new WeakMap();
const never = () => !srs.count() && !learner.level().n; // no srs entry, no line in the learner model: never played
export function atRung(a, opts) {
  if (!a) return opts;
  const ls = opening.get(a);
  if (ls === null && opts.id != null) { if (never()) opening.set(a, [opts.id]); else opening.delete(a); }
  else if (ls && opts.id != null && !ls.includes(opts.id) && ls.length < assist.FIRST_LINES) ls.push(opts.id);
  const first = opts.id != null ? (opening.get(a)?.indexOf(opts.id) ?? -1) + 1 : 0; // its place among them (0: none)
  const A = assist.lineRung(a.A, { level: opts.level, seen: srs.get(opts.id)?.seen, attempt: opts.attempt, first }), k = A === a.A ? a.knobs : modded(assist.LADDER[A], a.mod);
  // (one of the phone's first lines says so in its row, first: its place: the card's rung doesn't count how quick it
  // was, and the log keeps which lines they were)
  return assist.askOpts(settings.get('pressure') === 'auto' ? k : { ...k, giveUp: 0 }, first ? { ...opts, log: { ...opts.log, first } } : opts);
}
// The way the player will answer its lines: as Settings or the visit chose, as the format opens its panels. A chase is
// typed where the phone can't listen; a call holds tiles back until a peek; on Auto, a chat's line answers as it asks
// (by voice, or typed: a voice message too where the phone can't listen). → a way, or one for each beat. kind: the card
// it's asked for (rank.js's mode(scn, kind)): a flash crisis ('review') is typed where the phone can't listen, as a
// chase is (cards.js), and a run of them ('run') is a chase.
export function answering(scn, kind = 'scn') {
  const m = defaultMode(), auto = settings.get('input') === 'auto', ear = canListen();
  if (kind !== 'scn' || scn.format === 'chase') return auto && !ear ? 'type' : m;
  // (quiet mode's way is every line's: a call's tiles with it, a chat's voice messages typed or tiled)
  if (scn.format === 'call') return m === 'tiles' && !quiet() ? (ear ? 'speak' : 'self') : m;
  if (scn.format === 'chat' && auto && !quiet()) return (b) => (b.reply === 'speak' && !ear ? 'type' : b.reply || m);
  return m;
}

// What a story's end screen says beyond how it went (p5.md), put above its buttons (before): the endings found, where it
// has more than one ("Ending 1 of 3 found", from the log alone: days.endings, and the one this run just reached, which
// its card row names as it's left), with a nudge that saying something else changes what happens; and for a series'
// episode, when the next comes ("Episode 4 · tomorrow": days.released). The formats call it; nothing where there's
// nothing to say.
// el: the card, as the end screen is built before it goes in (so `before` can't find it yet). And where web.json has a
// contact, "Something sound wrong?" (web.md §4): a mail of this run's lines (report.js), made as the end screen is and
// again as it's tapped (the rows as they stand then); a run played Again on the same card mails its own lines only.
// Here, on the end screen, and never beside a line: the answer panel stays clear.
const ran = new WeakMap(); // a card → when its last run ended
export function endNote(scn, before, el) {
  before?.classList.add('ks-end-at'); // (where a card's own word goes too: the challenge's squares, mix.js)
  const e = days.endings(scn), mine = el?.dataset.end, n = e.found + (mine && !e.keys.includes(mine) ? 1 : 0);
  const nx = scn.series && content.get()?.scenarios.find((s) => s.series?.id === scn.series.id && s.series.ep === scn.series.ep + 1);
  const bits = [e.of > 1 && `<span class="ks-end-found"><b>Ending ${Math.min(n, e.of)} of ${e.of} found</b> · say something else and it goes another way</span>`, nx && `<span class="ks-end-ep">Episode ${nx.series.ep} · ${days.released(nx) ? 'up next' : 'tomorrow'}</span>`].filter(Boolean);
  const after = (el && ran.get(el)) ?? -Infinity, link = owner().contact && h('a', 'ks-report', 'Something sound wrong?');
  if (el) ran.set(el, now());
  if ((!bits.length && !link) || !before) return null;
  const note = h('div', 'ks-end-note', bits.join(''));
  if (link) {
    const make = () => (link.href = mail({ scn, rows: played(events.all(), { after }) }));
    make(); link.addEventListener('click', (e) => { e.stopPropagation(); make(); }); // (a card's own taps stay out of it)
    note.append(link);
  }
  before.before(note);
  return note;
}
// A report mail (report.js) from this page: to web.json's contact, each line's Chinese from the content, this browser
export const mail = (o) => mailto({ to: owner().contact, text: (id) => content.get()?.phraseById[id]?.zh || '', browser: `${navigator.userAgent}, ${innerWidth}x${innerHeight}`, speech: whyNot(), ...o });

// Keep the screen on while someone is scrolling and speaking (where the browser allows it; it's let go when the
// page is hidden, so ask again when it comes back).
let lock = null;
function keepAwake() { if (!lock && navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then((l) => { lock = l; l.addEventListener('release', () => (lock = null)); }).catch(() => {}); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.querySelector('.ks-feed')) keepAwake(); });

// TikTok-style chrome for a scenario card: the caption bottom-left, the action rail on the right.
// handlers: { replay(), settings() }; the rail's like and save are kept in store.marks.
export function chrome(el, scn, handlers = {}) {
  const cap = h('div', 'ks-cap', `<div class="ks-cap-title"><b lang="zh-CN">${esc(scn.title)}</b> <span>${esc(scn.title_en)}</span></div>
    <div class="ks-cap-tags" lang="zh-CN">${scn.tags.map((t) => `#${esc(t)}`).join(' ')} <span class="ks-lvl" title="Level ${scn.level} of ${levels.MAX}: ${levels.LEVELS[levels.of(scn.level)].name}">L${scn.level}</span>${scn.status === 'draft' ? ' <span class="ks-draft">draft</span>' : ''}</div>`);
  const rail = h('div', 'ks-rail');
  const btn = (cls, label, svg, on) => { const b = h('button', 'ks-rail-b ' + cls, `${svg}<span>${label}</span>`); b.type = 'button'; b.setAttribute('aria-label', label); b.onclick = (e) => { e.stopPropagation(); on(b); }; rail.append(b); return b; };
  const like = btn('ks-like', 'Like', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2.1 0 3.5 1.2 5 3 1.5-1.8 2.9-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>', (b) => { const on = marks.toggle('liked', scn.id); b.classList.toggle('ks-on', on); if (on) events.note('like'); });
  like.classList.toggle('ks-on', marks.has('liked', scn.id));
  if (handlers.replay) btn('ks-replay-b', 'Replay', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>', (b) => { events.note('replay'); handlers.replay(b); });
  if (handlers.settings) btn('ks-set-b', 'Settings', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.4" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="10" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>', handlers.settings);
  el.append(cap, rail);
  return { cap, rail };
}

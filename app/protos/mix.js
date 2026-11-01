// Mix: the feed someone would actually open every day, dealt For You (rank.js): each card is picked as the one before
// it comes on screen, from what the learner model makes of your Chinese, what spaced review has due, what you've liked
// and left, and how this visit is going. A likely win opens it; no format plays twice running; while phrases are due a
// flash crisis (or, three or more, a chase through them) comes at least every fourth card; words to write and lines to
// shadow follow the stories they're from; and once you tire, or have played a while on a win, a sure win and then a
// recap of the visit. A phone's first visit opens on the hook story, its first line with more help than the card's rung
// (assist.FIRST_LINE), then the about card (about.js: three questions, every one a tap); the stories after it place you,
// and a bonus line a level up checks the ceiling once (cards.js). A review, a run or the bonus the ranker deals at a
// rung (item.A) plays at the rung the ladder gives its lines (feed.js atLines), one without as v1 played it. It's the
// feed the app opens on (no hash: main.js), and #mix in the lab. #mix?deal=v1 deals as v1 did (deal-v1.js: your
// airport story, then the formats in turn, each with its easiest scenario left), the baseline the simulator measures
// against; ?why puts each pick's reasons along its card's foot. Formats not built yet play in the plain player.
import * as audio from '../shared/audio.js';
import { feed, assisted, answering, atLines } from '../shared/feed.js';
import * as assist from '../shared/assist.js';
import * as learner from '../shared/learner.js';
import * as events from '../shared/events.js';
import { srs, marks, kv } from '../shared/store.js';
import { now } from '../shared/time.js';
import { canListen } from '../shared/speech.js';
import { h, esc, announce, toast } from '../shared/text.js';
import { quiet, whenWas } from '../shared/ask.js';
import { share } from '../shared/panel.js';
import * as content from '../shared/content.js';
import * as days from '../shared/days.js';
import { createRanker, CHALLENGE_TAU } from '../shared/rank.js';
import { dealV1 } from '../shared/deal-v1.js';
import * as basic from './basic.js';
import * as scene from './scene.js';
import * as chase from './chase.js';
import * as chat from './chat.js';
import * as call from './call.js';
import { reviewCard, writeCard, shadowCard, linesToShadow } from './cards.js';
import { recapCard, teaser } from './recap.js';
import { aboutCard } from './about.js';

const FORMATS = { scene, chase, chat, call };
const player = (format) => (FORMATS[format]?.createCard ? FORMATS[format].createCard : basic.createCard);

// Where the cards come from, either way as { next() → { item, why } | null, again(), after(row), back(), waiting(),
// unsee(ids) }. For You: the ranker, one pick at a time, hearing every row the log keeps, told how each card would be
// answered (as the card will open its panels: feed.js answering()); again() is the next place picked again before it's
// come on screen (the card before it done: its outcome and the rung's move known), null once it has. Opened inside a
// visit under way (back from the versions, a tab the phone reloaded), it carries that visit on from the log
// (events.js's session and its rows). Where its rules allow nothing it says which gave way, and only with no story left
// for the visit does it deal its end card (rank.js). v1: deal-v1.js's batches handed over one at a time, each asked for
// when v1's feed asked for it (three cards ahead); it picks once (no again).
function forYou(data) {
  const visit = () => { const s = events.session(); return s && { start: s.start, rows: events.all().filter((r) => r.at >= s.start) }; };
  // (P5a's: released, a series' episodes a day at a time; quiet, the visit answered with no voice, so no line to
  // shadow; challenge, today's 今日挑战; endings, the endings a story has and those found: days.js's and ask.js's)
  return createRanker({ data, learner, assist, srs, marks, store: kv, now, rng: Math.random, mode: answering, runs: !!chase.createRun, resume: visit, released: days.released, quiet, challenge: days.challenge, endings: days.endings });
}
function fromV1(data) {
  const d = dealV1({ data, srs, marks, now, runs: !!chase.createRun });
  return { next: () => { const item = d.next(); return item && { item, why: { rule: 'v1' } }; }, again: () => null, after() {}, back() {}, waiting: () => d.waiting(), unsee: (ids) => d.unsee(ids) };
}

// ?why: a pick's reasons on one line: its score and the four parts of it (engagement, fit, learning value, variety),
// the success it aims at (τ) and expects (p) at the rung it was scored at (A), the say level, and the rule that chose it
const n2 = (x) => (Number.isFinite(x) ? String(Math.round(x * 100) / 100).replace(/^(-?)0\./, '$1.') : '–'); // .69, 1, -.25
function why(w) {
  const t = h('div', 'ks-why');
  t.setAttribute('aria-hidden', 'true'); t.dataset.why = JSON.stringify(w || {});
  const { score, E, F, V, N, tau, p, A, lv, rule } = w || {};
  t.textContent = [[score != null && n2(score), E != null && `E${n2(E)} F${n2(F)} V${n2(V)} N${n2(N)}`, tau != null && `τ${n2(tau)}`, p != null && `p${n2(p)}`, A != null && `A${A}`, lv != null && `L${lv}`].filter(Boolean).join(' '), rule].filter(Boolean).join(' · ') || 'no why';
  return t;
}
// the same card twice: a re-pick that changed nothing is left where it is (built, its voices on their way)
const same = (a, b) => { const x = events.what(a), y = events.what(b); return x.kind === y.kind && x.id === y.id && x.lv === y.lv; };

// After the last scene, though reviews keep coming below it. The feed deals cards only as one comes on screen, so while
// this one is up it looks again now and then for phrases falling due (waiting() counts what's below or due).
// A series under way whose next episode isn't out yet says when it is (days.released: the day after the last was
// finished), with its cliffhanger.
function end(el, ctx, waiting, data) {
  el.classList.add('ks-mix-intro');
  el.dataset.state = 'done';
  const tv = teaser(data), wait = tv?.scn && !days.released(tv.scn);
  el.innerHTML = `<div class="ks-mix-in"><b class="ks-mix-logo" lang="zh-CN">没了</b><p>That's every scene for now. Phrases you've met will come back here as flash crises when they're due.</p>${wait ? `<div class="ks-recap-next ks-mix-next"><span class="ks-recap-label">${tv.title ? `<span lang="zh-CN">${esc(tv.title)}</span> · ` : ''}Episode ${tv.ep} · tomorrow</span><p>${esc(tv.next)}</p></div>` : ''}<button type="button" class="ks-btn" hidden></button></div>`;
  el.dataset.teaser = wait ? tv.ep : '';
  const due = el.querySelector('.ks-btn');
  due.onclick = () => ctx.next(); // with no card below, the feed deals the due ones first
  let t = 0;
  const check = () => { const n = waiting(); due.hidden = !n; due.textContent = `Review the ${n} due ↓`; };
  const stop = () => clearInterval(t);
  return { enter() { check(); stop(); t = setInterval(check, 15e3); }, leave: stop, destroy: stop };
}

// Taught where it happens, once on this phone, instead of on a card of instructions: at the first freeze, a word over
// the panel on how to answer it (in the way it opened); on the first end screen with room for it, that a swipe moves
// on: one on screen (a card a card ahead can be built done, an end card, and even swapped for another before it's seen).
const COACH = {
  speak: 'Your line! Tap the mic, say it in Chinese.',
  self: 'Your line! Say it out loud, then Show me.',
  tiles: 'Your line! Fill the gaps, and say it.',
  type: 'Your line! Type it: characters or pinyin.',
};
const HUSHED = { tiles: 'Your line! Fill the gaps with the tiles.' }; // (quiet mode's: nothing said aloud)
function teach(host) {
  const want = new Set(['coach', 'swipe'].filter((k) => !marks.has('tips', k)));
  const learnt = (k) => { marks.toggle('tips', k); want.delete(k); if (!want.size) mo.disconnect(); };
  let rising = false, trying = false;
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') { const c = r.target; if (want.has('swipe') && !trying && c.dataset.state === 'done' && !c.inert && c.classList.contains('ks-card')) { trying = true; swipe(c, (on) => { if (trying) { trying = false; if (on) learnt('swipe'); } }); } continue; }
      if (want.has('coach') && !rising) for (const n of r.addedNodes) {
        if (!n.classList?.contains('ks-ask')) continue;
        // once it has risen and the stamp has had its moment; one answered or gone by then leaves it to the next panel
        rising = true;
        setTimeout(() => { rising = false; if (want.has('coach') && n.isConnected && !n.matches('.ks-done, .ks-timeout')) { learnt('coach'); coach(n); } }, 600);
        break;
      }
    }
  });
  if (want.size) mo.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'inert'] });
  return () => mo.disconnect();
}
// on the panel's last row (its tools, the least of it at a first freeze; above it is the line you're answering),
// pointing up at the way to answer, wherever the format puts the panel; gone at the first touch
function coach(panel) {
  const card = panel.closest('.ks-card');
  if (!card) return;
  // (say-and-check's button as it is: Check where the answer is up already, as on the phone's first line at A5)
  const tip = h('div', 'ks-mix-coach', esc(((quiet() && HUSHED[panel.dataset.mode]) || COACH[panel.dataset.mode] || COACH.self).replace('Show me', panel.querySelector('.ks-reveal')?.textContent.trim() || 'Show me')));
  tip.setAttribute('aria-hidden', 'true'); // the live region says it
  document.querySelector('.ks-toast')?.remove(); // ask.js's no-microphone toast says the same, a moment earlier
  card.append(tip); announce(tip.textContent);
  // above the panel, pointing down at it: never over its buttons, so a tap meant to dismiss it can't press Hear it
  const place = () => (tip.style.bottom = `${Math.round(card.getBoundingClientRect().bottom - panel.getBoundingClientRect().top + 12)}px`);
  const ro = new ResizeObserver(place);
  ro.observe(panel); place();
  const gone = (e) => { if (e?.target?.closest?.('.ks-mix-coach')) { e.preventDefault(); e.stopPropagation(); } ro.disconnect(); clearTimeout(t); tip.remove(); ['pointerdown', 'keydown'].forEach((k) => card.removeEventListener(k, gone, true)); };
  const t = setTimeout(gone, 6000);
  ['pointerdown', 'keydown'].forEach((e) => card.addEventListener(e, gone, true));
}
// TikTok's pill, in the caption's place, until the card moves on (or plays again). The first end screen can be any
// format's now (the ranker's first card is any story), and some have their buttons there (a chase's, a call's, a small
// card's Next ↓): then it sits just above them. Once the screen has settled it must cover nothing at all (a call's
// stars, a chase's list of what you shouted): where it would, it isn't shown, and a later end screen with room for it
// teaches the swipe instead. With a mouse or a trackpad (web.md §5), the wheel or ↓ is the swipe. → whether it's up,
// through shown(on)
function swipe(card, shown) {
  const pill = h('div', 'ks-swipe ks-mix-swipe', matchMedia('(pointer: fine)').matches ? 'Scroll or press ↓ for the next one' : 'Swipe up for the next one');
  pill.setAttribute('role', 'button'); pill.tabIndex = 0; pill.style.pointerEvents = 'auto';
  pill.style.zIndex = 23; // over any format's end panel (a chase's is 21), not dimmed behind it
  pill.onclick = () => card.nextElementSibling?.scrollIntoView({ behavior: 'smooth', block: 'start' }); // a tap on the pill goes too
  pill.style.visibility = 'hidden'; // placed first, seen only where it fits
  card.classList.add('ks-mix-swiping'); card.append(pill);
  const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom + 8 && a.bottom > b.top - 8;
  const seen = (e) => e !== pill && !pill.contains(e) && e.offsetParent && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.ks-why');
  // what it mustn't cover: buttons, and anything with words or a picture of its own (the why line, for tests, aside)
  const things = () => [...card.querySelectorAll('*')].filter((e) => seen(e) && (e.matches('button, [role=button], img, svg, canvas') || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())));
  const lift = () => {
    const p = pill.getBoundingClientRect(), hit = [...card.querySelectorAll('button, [role=button]')].filter((b) => seen(b) && over(b.getBoundingClientRect(), p));
    if (hit.length) pill.style.bottom = `${Math.round(card.getBoundingClientRect().bottom - Math.min(...hit.map((b) => b.getBoundingClientRect().top)) + 10)}px`;
  };
  const gone = () => { mo.disconnect(); clearTimeout(t); pill.remove(); card.classList.remove('ks-mix-swiping'); };
  const t = setTimeout(() => { lift(); const p = pill.getBoundingClientRect(); if (things().some((e) => over(e.getBoundingClientRect(), p))) { gone(); shown(false); } else { pill.style.visibility = ''; shown(true); } }, 500);
  const mo = new MutationObserver(() => { if (card.dataset.state !== 'done' || card.inert) { gone(); shown(false); } });
  mo.observe(card, { attributes: true, attributeFilter: ['data-state', 'inert'] });
}

// A shadow card is dealt a card ahead (v1 dealt it with its scenario, before that was played), so it's built before
// its story's outcome may be known. Its line from the middle of the story is one you've heard only if you saw the story
// through (a call can hang up before it, a scene end early, and a scenario swiped past says nothing), so anyone else
// shadows its first line: the opening, no punchline given away.
const heard = (item) => (marks.doneAll()[item.scn.id]?.outcome === 'win' ? item : { ...item, step: linesToShadow(item.scn)[0] });

// 今日挑战, the daily challenge (docs/v2/p5.md): the day's story, the same on every phone (days.challenge()), at the
// player's own say level (the nearest the story has to learner.level().say, the lower of two as near), with the day's
// modifier over whatever rung it plays at (feed.js MODS: panic, the clock at A0's; quiet, no pinyin, no English). A
// story card like any other (its row kind 'challenge'), dealt once a day by the ranker (rank.js's item) or opened from
// the menu (#challenge, main.js: challengeItem). A pill says what it is while it plays; done, its end screen shows the
// result: a square a line (🟩 right first time with no help beyond the rung's, 🟨 right with help or on a second try,
// 🟥 missed) and the share text, nothing about the player in it (快说 #42 🐯 🟩🟩🟨🟩🟥 4/5), shared or copied
// (panel.js share). The record is days.js result(), from the card's row as it's left; on its end screen, before that
// row, days.js pending(): the same squares as the row will record (a run left part-way and played on from the menu goes
// on where it was). The day's first finished run is its result; again, it plays for fun. Free: no heart, win or lose (P5b).
// Aimed where the ranker aims it (rank.js CHALLENGE_TAU, a loss's τ: the modifier takes about a rung's help away), from
// either door, so everyone plays the same moment.
//   challengeItem(data, day?) → { kind: 'challenge', scn (tailored), lv, tau, mod, n, day } | null
//   challengeCard(el, item, ctx)  the card (the Mix builds it; so does #challenge)
export const MOD = { panic: '⏱ Panic clock', quiet: '🙈 No pinyin, no English' };
const levelsOf = (s) => { const ls = new Set([s.level]), walk = (st) => { for (const x of st || []) if (x.say) { Object.keys(x.say.levels || {}).forEach((l) => ls.add(+l)); walk(x.say.ok); walk(x.say.fail); x.say.alts?.forEach((a) => walk(a.then)); } }; walk(s.steps); return [...ls].sort((a, b) => a - b); };
export function challengeItem(data, day) {
  const c = days.challenge(day), s = c?.id && data.byId[c.id];
  if (!s) return null;
  // (not L0 where it has another: the level fixes L0's help, so neither modifier would show; as rank.js daily())
  const say = learner.level().say, ls = levelsOf(s), lv = (ls.some((l) => l >= 1) ? ls.filter((l) => l >= 1) : ls).reduce((a, b) => (Math.abs(b - say) < Math.abs(a - say) ? b : a));
  return { kind: 'challenge', scn: lv === s.level ? s : content.tailor(s, lv), lv, tau: CHALLENGE_TAU, mod: c.mod, n: c.n, day: c.day };
}
export function challengeCard(el, item, ctx) {
  const scn = item.scn, ctl = assisted(el, scn, ctx, (cc) => player(scn.format)(el, scn, cc), { tau: () => item.tau, mod: item.mod });
  // a pill by the back button that says what this is in full as the card first comes, then folds to the modifier's
  // icon (clear of every format's own top: a call's clock, a chat's name, a chase's lead); once it's done, the squares
  // and Share go in the end screen itself, above its buttons (where feed.js endNote marked)
  const [icon, ...say] = (MOD[item.mod] || '').split(' ');
  const tag = h('div', 'ks-chal', `<span aria-hidden="true">${icon}</span><span class="ks-chal-m">&nbsp;<b lang="zh-CN">今日挑战</b> #${item.n} · ${esc(say.join(' '))}</span>`);
  tag.setAttribute('role', 'note'); tag.setAttribute('aria-label', `Today's challenge, number ${item.n}: ${say.join(' ')}`);
  el.classList.add('ks-chal-card');
  Object.assign(el.dataset, { challenge: item.n, scn: scn.id, lv: item.lv, mod: item.mod, tau: item.tau }); // (for tests)
  el.append(tag);
  const res = h('div', 'ks-chal-res');
  const draw = () => {
    const r = el.dataset.state === 'done' && days.pending(scn.id, item.day), at = r && el.querySelector('.ks-end-at');
    res.dataset.text = r ? r.text : ''; // (for tests: the share text as shown)
    if (!at) return res.remove();
    res.innerHTML = `<div class="ks-chal-res-l"><span class="ks-chal-res-t"><b lang="zh-CN">今日挑战</b> #${item.n}</span><span class="ks-chal-sq" aria-label="${r.right} of ${r.of} lines">${r.squares} <b>${r.right}/${r.of}</b></span></div><button type="button" class="ks-btn ks-chal-share">Share</button>`;
    res.querySelector('.ks-chal-share').onclick = (e) => { e.stopPropagation(); share(r.text, e.currentTarget); };
    const note = at.previousElementSibling?.matches('.ks-end-note') ? at.previousElementSibling : at;
    if (res.nextElementSibling !== note) note.before(res);
  };
  // (a run again, before the card's left: its row will square the lines as first met, as this does)
  const mo = new MutationObserver(draw);
  mo.observe(el, { attributes: true, attributeFilter: ['data-state'] });
  draw();
  // (folded by a timer, not an animation's delay: a format may stop its animations, a chat at test speed)
  let fold = 0;
  return { ...ctl, enter() { fold ||= setTimeout(() => tag.classList.add('ks-chal-folded'), 3500); ctl.enter?.(); }, destroy() { mo.disconnect(); clearTimeout(fold); ctl.destroy?.(); } };
}

// A freeze spent by itself on a day missed between two played ones (days.js, as the phone plays again) says so, once.
function frozen() {
  const held = days.streak().held;
  if (!held) return;
  days.told();
  toast(`Your streak held: ${held.n > 1 ? `${held.n} freezes covered the days up to` : 'a freeze covered'} ${whenWas(held.day, { named: true }).replace(/^On /, '')}. ${held.left ? `${held.left} left.` : 'A new one comes with every 7 days in a row.'}`, 5000);
}

export function mount(root, app) {
  const q = app.q || new URLSearchParams(), v1 = q.get('deal') === 'v1', show = q.has('why');
  const host = h('div', 'ks-mix');
  root.append(host);
  const data = app.data, dealer = v1 ? fromV1(data) : forYou(data), whys = new WeakMap(), hooked = !!app.hooked;
  // dealt: each card as it was dealt, by place (a swap takes its place), with its why: for tests (KS_MIX)
  const dealt = [];
  const note = (i, item, w) => { whys.set(item, w); dealt[i] = { ...events.what(item), why: w || null, swapped: dealt[i]?.swapped || 0 }; return item; };
  // the card for place i, or none: an end card never twice running, and none at all after one till something falls due
  // (the feed asks again as each card comes on screen, and from the end card's button); the dealer out of cards, an end
  const pick = (i) => {
    const p = dealer.next(), before = dealt[i - 1]?.kind, item = p?.item || (before === 'end' ? null : { kind: 'end' });
    return item && !(item.kind === 'end' && before === 'end') ? note(i, item, p?.why || { rule: 'end: nothing to deal' }) : null;
  };
  // Picked again before it's come on screen (any of it showing, or Next ↓ heading for it, keeps it): swapped if the
  // pick changed. v1 deals once.
  const again = (i) => {
    if (v1 || !f.unseen(i)) return;
    const p = dealer.again(), old = f.slot(i).item;
    if (!p?.item || (p.item.kind === 'end' && dealt[i - 1]?.kind === 'end')) return;
    if (same(p.item, old)) { note(i, old, p.why); const t = f.slot(i).el.querySelector(':scope > .ks-why'); if (t) t.replaceWith(why(p.why)); return; }
    if (f.replace(i, note(i, p.item, p.why))) dealt[i].swapped++;
  };
  // a card of phrases the ranker dealt at a rung (item.A: a review, a run, the bonus) plays at the rung the ladder gives
  // its lines as it comes on screen, aiming at the item's τ as it stands then (feed.js atLines: the clock, the help, the
  // text help, the voices' rate, a run's chaser; moving nothing): a card picked again after it was built, a card ahead,
  // has its τ brought up to date in place (rank.js), and plays at it, as its why and its row say; one without, as v1
  // played it
  const lines = (el, item, ps, kind, c, make) => (Number.isInteger(item.A) ? atLines(el, ps.map((p) => p.id), c, make, { kind, tau: () => item.tau, level: Math.max(0, ...ps.map((p) => p.level ?? 1)) }) : make(c));
  const build = (el, item, c) => {
    if (item.kind === 'end') return end(el, c, dealer.waiting, data);
    if (item.kind === 'challenge') return challengeCard(el, item, c);
    if (item.kind === 'recap') return recapCard(el, item, c);
    if (item.kind === 'about') return aboutCard(el, item, c);
    if (item.kind === 'review') return lines(el, item, [item.p], 'review', c, (cc) => reviewCard(el, item.p, cc));
    // the bonus: a line a level up from a story not played yet, once, after a strong card (rank.js PL3)
    if (item.kind === 'bonus') return lines(el, item, [item.p], 'review', c, (cc) => reviewCard(el, item.p, cc, { bonus: true }));
    if (item.kind === 'run') { const r = lines(el, item, item.ps, 'run', c, (cc) => chase.createRun(el, item.ps, cc)); // phrases a run never reached (caught first, left mid-run) are as due as before: the next slot deals them again
      return { ...r, leave() { const ran = el.dataset.state !== 'idle'; r.leave(); if (ran) dealer.unsee(item.ps.map((p) => p.id)); } }; }
    // a word written at the last card's rung (its leniency, a second trace at A5), read as it starts; reviews and
    // shadows have none (v1's)
    if (item.kind === 'write') return writeCard(el, item.item, { ...c, get assist() { const A = assist.last() ?? 2; return { A, knobs: assist.LADDER[A] }; } });
    if (item.kind === 'shadow') return shadowCard(el, heard(item.item), c);
    // a story at the say level it was picked at (the ranker's tailored scn), at the rung assisted() chooses as it
    // comes on screen, from where the last card got to, aiming at the τ it was dealt for: the ranker's A (why) was its
    // estimate of that rung (its τ read then: a re-pick brings it up to date in place). For You's may hold the phone's
    // first lines ever, which play at FIRST_LINE and down from there (v1's dealing, the baseline, plays them as P1 did).
    // The hook straight off the gate that showed its premise has had its title card (hooked: scene.js starts it as
    // soon as its voices are in), told on the card's context itself, not a copy: its rung is set on it as it comes on.
    return assisted(el, item.scn, c, (cc) => player(item.scn.format)(el, item.scn, Object.assign(cc, { hooked: hooked && whys.get(item)?.rule === 'hook' })), { tau: () => item.tau, first: !v1 });
  };
  // Every row the log keeps goes to the dealer as it's logged (after the learner model has heard it): how the visit goes.
  // Except a card closed by the page going away (events.js logs it left 'hide', and opens it again on the way back):
  // that one's held, and heard only if the page itself goes. Heard at once, the ranker would take the card as left (and
  // count it again when it really is) and the card after it as seen, so not to be picked again on the way back.
  let held = null;
  const deaf = events.on((row) => { if (row.k === 'card' && row.how === 'hide') held = row; else dealer.after(row); });
  const gone = () => { if (held) dealer.after(held); held = null; };
  addEventListener('pagehide', gone);
  // the card on screen done (its outcome known, and where its rung got to): the next card is picked again
  let mo = null;
  const watch = (i) => {
    mo?.disconnect();
    const el = f.slot(i).el;
    mo = new MutationObserver(() => el.dataset.state === 'done' && again(i + 1));
    mo.observe(el, { attributes: true, attributeFilter: ['data-state'] });
  };
  const f = feed(host, {
    items: [pick(0)].filter(Boolean),
    more: () => [pick(f.size)].filter(Boolean), // one card ahead, as each comes on screen
    onActive: watch,
    card(el, item, ctx) {
      const c = { ...app, ...ctx, typeOne: !canListen() }, ctl = build(el, item, c); // no microphone: one typed line per scenario, since writing is the gap
      if (show) el.append(why(whys.get(item)));
      // its card row says why it was dealt, as it comes on screen (a re-pick may have changed the why): the rule, what it
      // expected (p̄ at the rung A, aiming at τ) and its propensity, for weighing For You against v1 from the log later
      return { ...ctl, row: () => { const w = whys.get(item) || {}, r = (x, d) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : undefined); return { rule: w.rule, p: r(w.p, 3), A: w.A ?? undefined, tau: r(w.tau, 2), prop: r(w.prop, 3) }; } };
    },
  });
  // back on the phone, after a while maybe (the visit another one now): the time away isn't time played, and the card
  // after this one is picked again
  const back = () => { if (document.visibilityState !== 'visible') return; held = null; dealer.back(); again(f.active + 1); };
  document.addEventListener('visibilitychange', back);
  // an answer about you (the about card, Settings: panel.js 'ks:you') moves the learner model's start and the goals'
  // priors: the card after this one, dealt from the answers before it, is picked again (placement's first story, after
  // the about card, is picked from what was just said, as tools/sim.mjs plays it)
  const told = () => again(f.active + 1);
  addEventListener('ks:you', told);
  // quiet mode on or off (ask.js): the card after this one picked again (no line to shadow while it's on)
  addEventListener('ks:quiet', told);
  // a freeze spent: said on the way in, and after any card that kept the day
  const thawing = v1 ? 0 : setTimeout(frozen, 1200), thaw = events.on((r) => r.k === 'card' && setTimeout(frozen, 50));
  const untaught = teach(host);
  globalThis.KS_MIX = { feed: f, dealt, deal: v1 ? 'v1' : 'rank', session: () => dealer.session?.() };
  return {
    // For You's menu, to your phrases or your numbers and back (main.js): the feed put aside, not thrown away (feed.js
    // aside: the card on screen stopped, not logged left, so nothing counts it against its format), and back, that
    // card again, as after the page was hidden: the time away isn't time played, and the card after it is picked again
    // (hidden, not display: none, which would lose the feed's place)
    aside(on) { f.aside(on); host.style.visibility = on ? 'hidden' : ''; if (!on) { dealer.back(); again(f.active + 1); } },
    destroy() { untaught(); thaw(); clearTimeout(thawing); mo?.disconnect(); document.removeEventListener('visibilitychange', back); removeEventListener('pagehide', gone); removeEventListener('ks:you', told); removeEventListener('ks:quiet', told); f.destroy(); deaf(); host.remove(); audio.stopAll(); if (globalThis.KS_MIX?.feed === f) delete globalThis.KS_MIX; },
  };
}

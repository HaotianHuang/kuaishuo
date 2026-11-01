// The recap: a visit's end on a high, dealt by the ranker (rank.js) after a sure win once you've tired, or played a
// while on a win (docs/v2/p2.md, retention.md §1). What the visit came to (the lines you nailed, the words you wrote)
// and what comes next: how many phrases are back tomorrow, and the next episode's cliffhanger while a series is under
// way, and the day it's out. And what the days add up to (P5a, docs/v2/p5.md): the streak and its freezes, a phrase
// missed on an earlier day and nailed today, a year on your Chinese's age, the countdown and its lines solid, the
// situations you can handle and those to lock in tomorrow, the share of lines from memory this week. Never a wall: a
// swipe goes on, and the next recap is eight cards or more away.
//   recapCard(el, item, ctx)   item: { kind: 'recap' }; ctx: the Mix's (data, next())
//   teaser(data)               the series under way: { title, title_en, ep, next, scn (the next episode) } | null
//   situations(data)           the situations you can handle, newest first: [{ scn, at, stars }]
//   toLock(data)               the stories won whose phrases fall due by tomorrow's end
import * as audio from '../shared/audio.js';
import * as events from '../shared/events.js';
import * as days from '../shared/days.js';
import { outcome } from '../shared/learner.js';
import { srs, marks, kv } from '../shared/store.js';
import { now } from '../shared/time.js';
import { h, esc, zh, dropIn } from '../shared/text.js';
import { whenWas } from '../shared/ask.js';
import { countdown, countText, solid, age, ageText, an, SOON_ICON } from '../shared/panel.js';

const BESIDE = ['practice', 'shadow', 'typeback']; // a line put in front of you first, or someone else's: not yours to count

// This visit, as the log has it: each line said right (its best stars, the best first), the ones nailed (right the
// first time, with no help beyond what the rung gave free: learner.js's outcome() at 0.9 or more, as the ranker counts
// them; a wrong try first costs time, not stars, so stars alone can't tell), the words written (from memory, at the
// end of a write card), the phrases whose review falls by the end of tomorrow (the day starts at 4 am, as events.js
// counts days: what's waiting if you stop here), and whether the last story finished was won.
function visit(data) {
  const t0 = events.session()?.start ?? now(), best = new Map(), first = new Set(), all = srs.all(), done = Object.values(marks.doneAll()).filter((d) => d.at >= t0);
  for (const r of events.all()) if (r.at >= t0 && r.k === 'line' && !BESIDE.includes(r.task) && data.phraseById[r.id]) {
    if (r.res === 'ok') best.set(r.id, Math.max(best.get(r.id) || 0, r.stars || 0));
    if (r.att === 1 && outcome(r) >= 0.9) first.add(r.id);
  }
  const said = [...best].sort((a, b) => b[1] - a[1]).map(([id, stars]) => ({ p: data.phraseById[id], stars }));
  const words = Object.keys(all).filter((id) => id.startsWith('write:') && all[id].last >= t0).sort((a, b) => all[a].last - all[b].last).map((id) => id.slice(6));
  const by = events.dayKey(now() + 864e5), back = Object.keys(all).filter((id) => data.phraseById[id] && all[id].due && events.dayKey(all[id].due) <= by).length;
  return { said, nailed: said.filter((s) => first.has(s.p.id)), words, back, won: done.sort((a, b) => b.at - a.at)[0]?.outcome === 'win' };
}

// Situations you can handle (p5.md): a story won at 2★ or more (as it was last played, or a win the log still has)
// whose phrases have all reached srs box 3 or more (recalled after a day): the lines of it you've met, a beat at any of
// its levels one line, at its best box. Newest first, by when the last of them was answered.
const ofStory = (data) => { const by = new Map(), all = srs.all(); for (const id in all) { const ph = data.phraseById[id]; if (!ph) continue; const s = id.split('/')[0], f = ph.family || id.replace(/@\d+$/, ''), m = by.get(s) || by.set(s, new Map()).get(s), p = all[id], o = m.get(f); m.set(f, { box: Math.max(o?.box ?? 0, p.box), last: Math.max(o?.last ?? 0, p.last || 0), due: Math.min(o?.due ?? Infinity, p.due ?? Infinity) }); } return by; };
const wins = () => { const w = new Map(); for (const r of events.all()) if (r.k === 'card' && r.out === 'win' && (r.stars || 0) >= 2) w.set(r.id, Math.max(w.get(r.id) || 0, r.stars)); for (const [id, d] of Object.entries(marks.doneAll())) if (d.outcome === 'win') w.set(id, Math.max(w.get(id) || 0, d.stars || 0)); return w; };
export function situations(data) {
  const by = ofStory(data), won = wins();
  return data.scenarios.filter((s) => won.get(s.id) >= 2 && by.get(s.id)?.size && [...by.get(s.id).values()].every((f) => f.box >= 3))
    .map((s) => ({ scn: s, stars: won.get(s.id), at: Math.max(...[...by.get(s.id).values()].map((f) => f.last)) })).sort((a, b) => b.at - a.at);
}
export function toLock(data) { const by = ofStory(data), won = wins(), end = events.dayKey(now() + 864e5); return data.scenarios.filter((s) => won.has(s.id) && [...(by.get(s.id)?.values() || [])].some((f) => f.due < Infinity && events.dayKey(f.due) <= end)); }
// the share of lines said from memory (right first time, no help beyond the rung's) over the last 7 days, and the 7
// before: [this, last] (null where none were said)
function memory() {
  const t = now(), wk = (k0) => new Set([...Array(7)].map((_, k) => events.dayKey(t - (k0 + k) * 864e5))), a = wk(0), b = wk(7), n = [[0, 0], [0, 0]];
  for (const r of events.all()) if (r.k === 'line' && !BESIDE.includes(r.task) && r.res !== 'cancel') { const d = events.dayKey(r.at), w = a.has(d) ? n[0] : b.has(d) ? n[1] : null; if (w) { w[1]++; if (r.att === 1 && outcome(r) >= 0.9) w[0]++; } }
  return n.map(([x, y]) => (y ? x / y : null));
}

// The series under way: the one whose episode was finished last, while the episode after it isn't done (or isn't out
// yet); its cliffhanger is that episode's `next`.
export function teaser(data) {
  const done = marks.doneAll(), last = data.scenarios.filter((s) => s.series?.next && done[s.id]).sort((a, b) => done[b.id].at - done[a.id].at)[0];
  if (!last) return null;
  const { id, ep, next } = last.series, meta = data.series?.[id] || {}, nx = data.scenarios.find((s) => s.series?.id === id && s.series.ep === ep + 1);
  if ((nx && done[nx.id]) || (meta.eps && ep >= meta.eps)) return null;
  return { title: meta.title || '', title_en: meta.title_en || '', ep: ep + 1, next, scn: nx || null };
}

// The rows under the numbers, each where it has something to say, the most worth saying first (a short phone keeps the
// first that fit): k, the row's kind (for tests), html
function extra(data) {
  const t0 = events.session()?.start ?? now(), rows = [], c = countdown(), a = age(), was = kv.get('aged', null), [mem, before] = memory(), sit = situations(data).length, lock = toLock(data).length;
  // a phrase missed on an earlier day and nailed today (ask.js stamped it: ks.then)
  for (const [id, x] of Object.entries(kv.get('then', {}))) if (x.at >= t0 && data.phraseById[id]) rows.push({ k: 'then', html: `<span lang="zh-CN" class="ks-recap-m-zh">${esc(data.phraseById[id].zh)}</span> ${esc(whenWas(x.day))}: missed. <b>Today: nailed.</b>` });
  // your Chinese's age: the first time it's known, then each year it rises (say or listen)
  if (a && (!was || Math.floor(a.say) > was.say || Math.floor(a.listen) > was.listen)) rows.push({ k: 'age', html: `🎂 ${!was ? esc(ageText(a)) : Math.floor(a.listen) > was.listen ? `You understand like ${an(Math.floor(a.listen))} <b>${Math.floor(a.listen)}-year-old</b> now` : `You talk like ${an(Math.floor(a.say))} <b>${Math.floor(a.say)}-year-old</b> now`}` });
  if (c && !c.past) { const n = solid(c.goal); rows.push({ k: 'soon', html: `${SOON_ICON[c.what]} <b>${esc(countText(c))}</b>${n ? ` · ${n} ${c.goal} line${n === 1 ? '' : 's'} solid` : ''}` }); }
  else if (c?.past) rows.push({ k: 'went', html: `How did ${esc(c.name)} go? <span class="ks-recap-went">${[['😂', 'Funny'], ['😳', 'Awkward'], ['❤️', 'Lovely']].map(([e, l]) => `<button type="button" data-w="${e}" aria-label="${l}">${e}</button>`).join('')}</span>` });
  if (sit || lock) rows.push({ k: 'sit', html: [sit && `✅ <b>${sit}</b> situation${sit === 1 ? '' : 's'} you can handle`, lock && `${sit ? '' : '✅ '}<b>${lock}</b> to lock in tomorrow`].filter(Boolean).join(' · ') });
  // from memory this week, and the week before where it's no higher (a week that went less well isn't held up)
  if (mem != null) rows.push({ k: 'mem', html: `🧠 <b>${Math.round(mem * 100)}%</b> from memory this week${before != null && before <= mem ? ` · ${Math.round(before * 100)}% the week before` : ''}` });
  return rows;
}

export function recapCard(el, item, ctx) {
  const data = ctx.data, box = h('div', 'ks-recap-in');
  let line = null, off = null;
  el.classList.add('ks-recap');
  el.dataset.state = 'idle';
  el.append(box);
  // drawn as it's built (a card ahead) and again as each line of the card before it is logged, so it's right by the
  // time it's swiped in; its moment (the headline slamming in) waits till it's on screen
  function draw() {
    const v = visit(data), tv = teaser(data), shown = v.nailed.length ? v.nailed : v.said, n = shown.length, st = days.streak(), more = extra(data);
    const words = v.words.length && v.words.length <= 3 ? `<b lang="zh-CN" class="ks-recap-chars">${v.words.map(esc).join(' ')}</b>` : `<b>${v.words.length}</b>`;
    const streak = st.n ? ` · <span class="ks-recap-streak">🔥 ${st.n} day${st.n === 1 ? '' : 's'}${st.freezes ? ` · <span aria-label="${st.freezes} streak freeze${st.freezes > 1 ? 's' : ''}">${'❄️'.repeat(st.freezes)}</span>` : ''}</span>` : '';
    const out = tv?.scn && !days.released(tv.scn) ? ' · tomorrow' : '';
    box.innerHTML = `<div class="ks-recap-head"><span class="ks-recap-label">This visit${streak}</span><b lang="zh-CN">${dropIn('收工！')}</b><span>${v.won ? 'A good place to stop, on a win.' : 'A good place to stop.'}</span></div>
      <div class="ks-recap-nums">
        <div style="--i:0"><b>${n}</b><span>${n === 1 ? 'line' : 'lines'} ${v.nailed.length || !n ? 'nailed' : 'said'}</span></div>
        <div style="--i:1">${words}<span>${v.words.length === 1 ? 'word' : 'words'} written</span></div>
        <div style="--i:2"><b>${v.back}</b><span>back tomorrow</span></div>
      </div>
      ${more.length ? `<ul class="ks-recap-more">${more.map((m) => `<li class="ks-recap-m ks-recap-m-${m.k}">${m.html}</li>`).join('')}</ul>` : ''}
      ${n ? `<div class="ks-recap-l">${v.nailed.length ? 'You nailed' : 'You said'}</div><ol class="ks-recap-list"></ol>` : ''}
      ${tv ? `<div class="ks-recap-next"><span class="ks-recap-label">Next time${tv.title ? ` on <span lang="zh-CN">${esc(tv.title)}</span>` : ''} · Episode ${tv.ep}${out}</span><p>${esc(tv.next)}</p></div>` : ''}
      <div class="ks-recap-row"><button type="button" class="ks-btn ks-btn-quiet ks-recap-go">Keep going ↓</button></div>`;
    const list = box.querySelector('.ks-recap-list');
    // three at most, tap one to hear it (its model voice); on a short phone the list gives up rows before anything else
    for (const { p, stars } of shown.slice(0, 3)) {
      const li = h('li', 'ks-recap-said');
      Object.assign(li, { tabIndex: 0, title: 'Hear it again' });
      li.setAttribute('role', 'button');
      li.onclick = () => { line?.stop(); audio.stopAll(); line = audio.play(p.audio, p.a); };
      li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } };
      li.append(zh(p.t, { pinyin: 'all', count: false, cls: 'ks-recap-zh' }), h('div', 'ks-recap-en', `<span>${esc(p.gloss || p.en)}</span><b aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></b><span aria-hidden="true">🔊</span>`));
      list.append(li);
    }
    box.querySelector('.ks-recap-go').onclick = () => ctx.next();
    // how the day went, past it: a tap, kept as a count only, and then what's next is asked in Your Chinese
    box.querySelectorAll('.ks-recap-went button').forEach((b) => (b.onclick = () => { days.went(b.dataset.w); dispatchEvent(new CustomEvent('ks:you', { detail: { q: 'soon' } })); b.closest('li').innerHTML = `${b.dataset.w} Kept. Anything else coming up? <b>Menu → Settings → Your Chinese</b>.`; }));
    el.dataset.teaser = tv ? tv.ep : ''; // for tests: nothing on screen needs it
    el.dataset.more = more.map((m) => m.k).join(' ');
    fit();
  }
  // the rows that don't fit whole are left out (the list is what gives way on a short phone, ks.css), never cut in half
  const fit = () => {
    for (const list of box.querySelectorAll('.ks-recap-list, .ks-recap-more')) for (const li of list.children) li.hidden = li.offsetTop - list.offsetTop + li.offsetHeight > list.clientHeight + 1;
    const l = box.querySelector('.ks-recap-l'); // (no heading over a list that gave up every row)
    if (l) l.hidden = !box.querySelector('.ks-recap-list > li:not([hidden])');
  };
  draw();
  off = events.on((r) => r.k === 'line' && !ctx.isActive() && draw());
  return {
    // nothing to play: it's done the moment it's on screen (and a swipe moves on, as from any end screen)
    // (on screen, the age it showed is the one it has told: the next recap tells only a year on)
    enter() { draw(); el.classList.add('ks-recap-on'); el.dataset.state = 'done'; const a = age(); if (a) kv.set('aged', { say: Math.floor(a.say), listen: Math.floor(a.listen) }); },
    leave() { line?.stop(); el.classList.remove('ks-recap-on'); },
    destroy() { off?.(); line?.stop(); },
  };
}

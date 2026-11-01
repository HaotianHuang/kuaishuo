// The settings sheet: how much help you get, and how you answer; and under it, what the app makes of your Chinese and
// what you've told it about you. Opened from For You's menu (main.js), your phrases, your numbers and the lab come first.
//   openSettings({ onClose, menu, head, more })   menu: [{ zh, label, meta, href, wide }], the places the menu goes,
//                                     above Settings (wide: across two columns); head: a line over them (the streak, the
//                                     countdown); more: [{ cls, label, href }], small links under them (About, Send
//                                     feedback). Settings ends with Start over (and, outside the menu, About)
//   question(q, { then })             one of the about-you questions as taps ('home' | 'goals' | 'born'), each answer
//                                     saved as it's tapped: the about card's (app/protos/about.js) and Your Chinese's
//   unasked()                         the questions not answered yet, in the about card's order
//   goals(list?), born(year?)         ks.goals and ks.born, read (or set; born(null) takes the year back: not asked)
//   'ks:you' (window)                 an answer saved, { q, box }: the same question elsewhere is drawn again, and
//                                     For You's next card picked again (mix.js)
//   question('soon')                  "Anything coming up?" (p5.md): Your Chinese's and the later about card's
//   countdown() → { what, day, left, name, goal } | null;  countText(c): "Lunar New Year in 23 days";  solid(goal)
//   age() → { say, listen } | null (learner.age());  ageText(a), ageShare(a): your Chinese's age, and its share text
//   share(text, at)                   the phone's share sheet, else copied with a toast (mix.js's challenge, the age)
import { settings, kv, srs, wipe } from './store.js';
import { about } from './files.js';
import { h, esc, toast } from './text.js';
import { now } from './time.js';
import * as speech from './speech.js';
import * as learner from './learner.js';
import * as levels from './levels.js';
import * as days from './days.js';
import * as content from './content.js';
import { quiet, ICON } from './ask.js';

// Each row drawn as what it does (the Rare UI remix, 31 Oct 2026): pinyin as cards that each show a line the way that
// choice draws it; English and the clock as a pill that slides to the choice, over a sample that changes with it; how
// you answer as icons; the on/off ones as switches. Every choice is still a button with aria-pressed (or a switch with
// aria-checked) in a .ks-seg, as the checks and screen readers know it.
const ROWS = [
  ['pinyin', 'Pinyin over characters', [['auto', 'Auto', 'Less as you get better'], ['all', 'Always', 'Over every word'], ['new', 'New words only', 'Till you’ve met a word'], ['none', 'Off', 'Characters only']], 'cards'],
  ['english', 'English translations', [['auto', 'Auto'], ['show', 'Show'], ['tap', 'Tap to see'], ['none', 'Off']], 'slide'],
  ['pressure', 'The clock', [['auto', 'Auto', 'Less time as you get better'], ['relaxed', 'No clock', 'Take as long as you like'], ['normal', 'Normal', 'A steady clock on every line'], ['panic', 'Panic', 'Less time on every line']], 'slide'],
  ['input', 'Answer by', [['auto', 'Best available'], ['speak', 'Speaking'], ['tiles', 'Tiles'], ['type', 'Typing'], ['self', 'Say & check']], 'icons'],
  ['voice', 'Voices', [[true, 'On'], [false, 'Off']], 'switch', 'The characters speak their lines'],
  ['sfx', 'Sound effects', [[true, 'On'], [false, 'Off']], 'switch', 'Dings, buzzers and the clock'],
];
// the pinyin cards' sample: 我手机没信号了 with each word's reading as that choice shows it (1 shown, 0.5 faded: a word
// Auto expects you can read by now, 0 none); 信号 the word you've not met
const EG = [['我', 'wǒ'], ['手机', 'shǒujī'], ['没', 'méi'], ['信号', 'xìnhào'], ['了', 'le']];
const EG_PY = { auto: [0.5, 1, 0.5, 1, 0.5], all: [1, 1, 1, 1, 1], new: [0, 0, 0, 1, 0], none: [0, 0, 0, 0, 0] };
const EG_EN = { auto: 'My phone has no signal. (till the line’s yours)', show: 'My phone has no signal.', tap: 'My phone has no signal.', none: '' };
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>';
const SHORT = { pinyin: 'Pinyin', english: 'English', pressure: 'Clock', input: 'Answer by' }; // the saved line's names
const ICONS = { auto: SPARK, speak: ICON.speak, tiles: ICON.tiles, type: ICON.type, self: ICON.self };

// About you (docs/v2/p3.md): asked once, on the card after the first story (about.js), and shown and changed here. Where
// you heard Chinese growing up is where the learner model's skills start (learner.persona()); what you'd love to do in
// Chinese (ks.goals: a list, [] none chosen, absent not asked) sets the ranker's priors and the gaps it weighs; the
// year you were born (ks.born: a year, 0 rather not say, absent not asked) is P5's age gate (under 13: no ads, ever).
// Kept on this phone only, like everything else (the daily totals, tally.js, count how many chose each answer). Another tap on an answer takes it back (a year taken back is a year not
// asked: the key goes, as rank.js reads it).
export const HOME = [['mandarin', 'Mandarin'], ['dialect', 'Cantonese or another dialect'], ['studied', 'I studied some'], ['new', 'I’m new to it']];
export const GOALS = [['family', 'Talk with family', '👪'], ['travel', 'Travel', '✈️'], ['read', 'Read and write', '✍️'], ['fun', 'Just for fun', '🎉']];
const ASK = { home: 'Growing up, did you hear Chinese at home?', goals: 'What would you love to do in Chinese?', born: 'What year were you born?', soon: 'Anything coming up?' };
export const goals = (g) => (g === undefined ? kv.get('goals', null) : (kv.set('goals', GOALS.map(([k]) => k).filter((k) => g.includes(k))), goals()));
export const born = (y) => (y === undefined ? kv.get('born', null) : (y == null ? kv.del('born') : kv.set('born', y), y));
export const unasked = () => [learner.persona() == null && 'home', goals() == null && 'goals', born() == null && 'born'].filter(Boolean);

// A countdown to a real day (p5.md): a day that's coming, in Chinese, with family or abroad. ks.soon = { what, day }
// (days.js soon(): what 'lny' | 'trip' | 'wedding' | 'visit' | 'none', nothing coming; day a 'YYYY-MM-DD', or none yet);
// Lunar New Year's day is the next one's (days.lunar). As it nears (30 days and closer) the goal it implies (family; a
// trip's travel) weighs its topics more (rank.js). Past the day it asks how it went, once (😂 😳 ❤️, a count only:
// days.went), and then what's next.
export const SOON = [['lny', 'Lunar New Year with family', '🧧'], ['trip', 'A trip', '✈️'], ['wedding', 'A wedding or birthday', '🎂'], ['visit', 'A call or visit', '📞'], ['none', 'Nothing yet', '']];
const NAMED = { lny: 'Lunar New Year', trip: 'your trip', wedding: 'the big day', visit: 'your visit' }, WENT = [['😂', 'Funny'], ['😳', 'Awkward'], ['❤️', 'Lovely']];
export const SOON_ICON = { lny: '🧧', trip: '✈️', wedding: '🎂', visit: '📞' };
const WHEN = [[7, 'In a week'], [14, 'In 2 weeks'], [30, 'In a month'], [90, 'In 3 months']];
const dayIn = (k) => new Date(Date.parse(days.today()) + k * 864e5).toISOString().slice(0, 10);
const cap = (t) => t[0].toUpperCase() + t.slice(1);
// the day coming up, with a date and a name: { what, day, left, goal, near, past, name } | null
export function countdown() { const c = days.soon(); return c?.day && NAMED[c.what] ? { ...c, name: NAMED[c.what] } : null; }
export const countText = (c) => (!c || c.left < 0 ? '' : c.left > 1 ? `${cap(c.name)} in ${c.left} days` : c.left ? `${cap(c.name)} is tomorrow` : `${cap(c.name)} is today`);
const dated = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
// the lines of a goal's stories that are solid (srs box ≥ 4: a week or more apart), by family (a beat and its levels
// one line); where the content has no topics, every story's
const TOPICS = { family: ['family', 'home', 'celebrations', 'dating'], travel: ['travel', 'food', 'shopping'] };
export function solid(goal) {
  const d = content.get(), all = srs.all(), mine = d?.scenarios.some((s) => s.topic) ? new Set(d.scenarios.filter((s) => TOPICS[goal]?.includes(s.topic)).map((s) => s.id)) : null, fams = new Set();
  for (const id in all) { const ph = d?.phraseById[id]; if (ph && all[id].box >= 4 && (!mine || mine.has(id.split('/')[0]))) fams.add(ph.family || id.replace(/@\d+$/, '')); }
  return fams.size;
}
// Your Chinese's age (p5.md): the joke heritage speakers make about themselves, made a measure. learner.age(): say and
// listen apart, as years, null till placement is over. Warm, never a grade (no "only", no "still").
export const age = () => learner.age();
export const an = (n) => (String(n).startsWith('8') || n === 11 || n === 18 ? 'an' : 'a'); // (an 8-year-old, an 11-year-old)
export const ageText = (a) => { const L = Math.floor(a.listen), S = Math.floor(a.say); return L === S ? `You understand and talk like ${an(L)} ${L}-year-old` : `You understand like ${an(L)} ${L}-year-old and talk like ${an(S)} ${S}-year-old`; };
export const ageShare = (a) => `我的中文：听力${Math.floor(a.listen)}岁，口语${Math.floor(a.say)}岁 · 快说`;
// the phone's share sheet where it has one; else copied, said so in a toast (or, where the clipboard is shut, the text
// put up selected beside at, to copy by hand). Nothing about the player goes with it: no link, no id.
export async function share(text, at) {
  if (navigator.share && (!navigator.canShare || navigator.canShare({ text }))) { try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'kept'; } }
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it anywhere.', 2400); return 'copied'; } catch {}
  if (at) { at.parentElement?.querySelector('.ks-share-copy')?.remove(); const t = h('textarea', 'ks-share-copy'); t.value = text; t.readOnly = true; t.setAttribute('aria-label', 'Your text to copy'); at.after(t); t.select(); }
  toast('Select it and copy.', 2400);
  return 'shown';
}

// An answer saved, wherever it was tapped (the about card, Settings over it), is news to the same question shown
// anywhere else (drawn again) and to For You, whose next card was picked from the answers before it (mix.js picks it
// again: placement's first story is picked from what you've just said): 'ks:you' on the window, { q, box }.
const told = (q, box) => dispatchEvent(new CustomEvent('ks:you', { detail: { q, box } }));

let qid = 0; // each question's heading its own id (Settings can open over the about card: both on the page at once)
// A question as taps, in Settings' look (.ks-set: a label, its answers as a .ks-seg; a skin restyles it). then(q, how):
// after each answer, saved; how: what was tapped ('decade' and 'back' move about the year picker, saving nothing).
export function question(q, { then } = {}) {
  const box = h('div', `ks-set ks-q ks-q-${q}`), id = `ks-q-${q}-${++qid}`;
  box.dataset.q = q;
  // the same question answered elsewhere: drawn again as it now stands (gone from the page: heard no more)
  const hear = (e) => { if (!box.isConnected) return removeEventListener('ks:you', hear); if (e.detail.q === q && e.detail.box !== box) draw(); };
  addEventListener('ks:you', hear);
  const draw = (focus) => {
    let opts;
    if (q === 'home') { const p = learner.persona(); opts = HOME.map(([k, l]) => `<button type="button" data-p="${k}" aria-pressed="${p === k}">${esc(l)}</button>`).join(''); }
    else if (q === 'goals') { const g = goals() || []; opts = GOALS.map(([k, l, e]) => `<button type="button" data-g="${k}" aria-pressed="${g.includes(k)}"><span aria-hidden="true">${e}</span> ${esc(l)}</button>`).join(''); }
    else if (q === 'soon') return coming(focus);
    else opts = years();
    box.innerHTML = `<div class="ks-set-l" id="${id}">${esc(ASK[q])}</div><div class="ks-seg${q === 'born' ? ' ks-year' : ''}" role="group" aria-labelledby="${id}">${opts}</div>`;
    box.querySelectorAll('button').forEach((b) => (b.onclick = () => tap(b)));
    if (focus) box.querySelector(focus)?.focus({ preventScroll: true }); // redrawn: keep the keyboard's place
  };
  // the year: a decade, then a year in it, every one a tap (nothing to type); or rather not say. view: the decades
  // ('all'), or a decade's years; at first, the decade of a year already given, else the decades.
  let view;
  const thisYear = new Date(now()).getFullYear(), top = thisYear - (thisYear % 10), decade = (y) => (y > 0 ? y - (y % 10) : null);
  function years() {
    const y = born(), d = view === 'all' ? null : view ?? decade(y);
    if (d == null) return [...Array((top - 1930) / 10 + 1)].map((_, i) => top - 10 * i).map((x) => `<button type="button" data-d="${x}" aria-pressed="${decade(y) === x}" aria-label="the ${x}s: pick the year">${x}s</button>`).join('') + `<button type="button" class="ks-year-not" data-y="0" aria-pressed="${y === 0}">Rather not say</button>`;
    return `<button type="button" class="ks-year-back" data-d="" aria-label="Back to the decades">‹ ${d}s</button>` + [...Array(Math.min(10, thisYear - d + 1))].map((_, i) => d + i).map((x) => `<button type="button" data-y="${x}" aria-pressed="${y === x}">${x}</button>`).join('');
  }
  // Anything coming up: what, then when (Lunar New Year's is known; else a few taps ahead, a date of your own, or none);
  // past the day, how it went (once), then what's next
  function coming(focus) {
    const s = days.soon(), c = countdown(), ask = kv.get('went', null) ? 'Anything else coming up?' : ASK.soon;
    if (c?.past) box.innerHTML = `<div class="ks-set-l" id="${id}">How did ${esc(c.name)} go?</div><div class="ks-seg ks-went" role="group" aria-labelledby="${id}">${WENT.map(([e, l]) => `<button type="button" data-w="${e}" aria-label="${l}">${e}</button>`).join('')}</div>`;
    else {
      const when = s && s.what !== 'none' && s.what !== 'lny' ? `<div class="ks-seg ks-when" role="group" aria-label="When?">${WHEN.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${s.day === dayIn(k)}">${l}</button>`).join('')}<label class="ks-when-on"><span>On</span><input type="date" min="${days.today()}" value="${s.day || ''}"></label><button type="button" data-k="" aria-pressed="${!s.day}">No date yet</button></div>` : '';
      box.innerHTML = `<div class="ks-set-l" id="${id}">${esc(ask)}</div><div class="ks-seg ks-soon" role="group" aria-labelledby="${id}">${SOON.map(([k, l, e]) => `<button type="button" data-s="${k}" aria-pressed="${s?.what === k}">${e ? `<span aria-hidden="true">${e}</span> ` : ''}${esc(l)}</button>`).join('')}</div>${when}${c ? `<div class="ks-soon-left"><b>${esc(countText(c))}</b> · ${esc(dated(c.day))}</div>` : ''}`;
      box.querySelector('input[type=date]')?.addEventListener('change', (e) => { if (/^\d{4}-\d\d-\d\d$/.test(e.target.value)) { days.setSoon({ ...days.soon(), day: e.target.value }); draw(); then?.(q, 'answer'); told(q, box); } });
    }
    box.querySelectorAll('button').forEach((b) => (b.onclick = () => tap(b)));
    if (focus) box.querySelector(focus)?.focus({ preventScroll: true });
  }
  function tap(b) {
    const k = b.dataset;
    // (each answer saved as it's tapped; another tap on the one chosen takes it back: not asked)
    if (k.w || k.s || k.k != null) {
      const was = days.soon();
      if (k.w) days.went(k.w);
      else if (k.s) days.setSoon(was?.what === k.s ? null : { what: k.s, day: k.s === 'lny' ? days.lunar() : k.s === 'none' ? null : was?.what !== 'lny' ? was?.day : null });
      else days.setSoon({ ...was, day: k.k ? dayIn(+k.k) : null });
      draw(k.s ? `[data-s="${k.s}"]` : k.k != null ? `[data-k="${k.k}"]` : '[data-s]'); then?.(q, 'answer');
      return told(q, box);
    }
    if (k.d != null) { view = k.d === '' ? 'all' : +k.d; draw(view === 'all' ? `[data-d="${decade(born()) ?? top}"]` : '[data-y]'); return then?.(q, view === 'all' ? 'back' : 'decade'); }
    if (k.p) { const p = learner.persona(); learner.persona(p === k.p ? null : k.p); draw(`[data-p="${k.p}"]`); }
    else if (k.g) { const g = goals() || []; goals(g.includes(k.g) ? g.filter((x) => x !== k.g) : [...g, k.g]); draw(`[data-g="${k.g}"]`); }
    else { const y = +k.y; born(born() === y ? null : y); draw(`[data-y="${y}"]`); }
    then?.(q, 'answer');
    told(q, box);
  }
  draw();
  return box;
}

// Your Chinese: the learner model (learner.js) as it stands, each skill a bar on the levels' scale (L0–L5) with how
// sure it is (the band: give or take one sd), and the levels you say, hear and read at; then about you, the three
// questions the about card asks (the first moves the model's start, so the bars are drawn again when it's answered).
const SKILL = [['L', 'Listening'], ['S', 'Speaking'], ['V', 'Words'], ['T', 'Tones'], ['R', 'Reading'], ['W', 'Writing']];
// a skill as a level, as learner.level() reads one: the level of a typical line (b⁰ moves 0.67 a level) it gets right
// 80% of the time at A2; and where that falls on a bar, in %
const lv = (t) => 1 + (t + 1 - Math.log(4)) / 0.67, at = (x) => (Math.min(levels.MAX, Math.max(0, x)) / levels.MAX) * 100;
function yours() {
  const box = h('section', 'ks-you'), model = h('div', 'ks-you-model');
  box.setAttribute('aria-labelledby', 'ks-you-h');
  const draw = () => {
    const sk = learner.skills(), L = learner.level(), a = age();
    const level = (x) => { const n = Math.floor(Math.min(levels.MAX, Math.max(0, x))); return `<b title="${esc(levels.LEVELS[n].name)}">L${n}</b>`; };
    const bar = ([k, name]) => {
      const m = lv(sk[k].m), d = sk[k].s / 0.67, lo = at(m - d), hi = at(m + d);
      return `<div class="ks-you-row"><span>${name}</span><div class="ks-you-bar" role="img" aria-label="${name}: about level ${Math.max(0, Math.min(levels.MAX, m)).toFixed(1)}, give or take ${d.toFixed(1)}"><i style="left:${lo.toFixed(1)}%;width:${(hi - lo).toFixed(1)}%"></i><b style="left:${at(m).toFixed(1)}%"></b></div></div>`;
    };
    model.innerHTML = `<h2 id="ks-you-h">Your Chinese</h2>
      <p class="ks-you-lv"><span>Say ${level(L.say)}</span><span>Listen ${level(L.listen)}</span><span>Read ${level(L.read)}</span><small>${L.n ? `based on ${L.n} line${L.n > 1 ? 's' : ''}` : 'a first guess: no lines yet'}</small></p>
      ${a ? `<div class="ks-you-age"><p>${esc(ageText(a))}</p><button type="button" class="ks-tool ks-age-share">Share</button></div>` : ''}
      <div class="ks-you-bars">${SKILL.map(bar).join('')}<div class="ks-you-row ks-you-scale" aria-hidden="true"><span></span><div>${levels.LEVELS.map((_, i) => `<i style="left:${at(i)}%;transform:translateX(-${at(i)}%)">L${i}</i>`).join('')}</div></div></div>`;
    const sh = model.querySelector('.ks-age-share');
    if (sh) sh.onclick = () => share(ageShare(a), sh);
  };
  draw();
  box.append(model, question('home', { then: draw }), question('goals'), question('soon'), question('born'), h('p', 'ks-you-note', 'All of this stays on this phone: we only ever see totals, how many chose each answer. The year keeps ads away from anyone under 13.'));
  return box;
}

// While it's up, the page behind is inert (Tab and the feed's arrow keys stay out of it) and an answer clock under it
// stands still (ask.js looks for .ks-sheet-bg). The story itself plays on. With menu (For You's), the sheet is the menu:
// its places first, each closing the sheet as it goes, then Settings.
export function openSettings({ onClose, menu, head, more } = {}) {
  const bg = h('div', 'ks-sheet-bg'), sheet = h('div', 'ks-sheet'), app = document.getElementById('app'), from = document.activeElement;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', menu ? 'Menu' : 'Settings');
  if (menu) {
    if (head) sheet.append(h('p', 'ks-menu-head', esc(head)));
    const nav = h('nav', 'ks-menu-go');
    nav.setAttribute('aria-label', 'Go to');
    // a tile's picture of what's behind it, decoration only (its words are the label's): today's challenge's squares
    // once it's played, the phrases due first as cards in a folder, the last weeks' days played as a grid
    const SQ = { '🟩': 'ks-sq-right', '🟨': 'ks-sq-help', '🟥': 'ks-sq-miss' };
    const art = (m) => (m.squares ? `<i class="ks-menu-sq" aria-hidden="true">${Array.from(m.squares).map((q) => `<i class="${SQ[q] || ''}"></i>`).join('')}</i>` : '')
      + (m.peek?.length ? `<i class="ks-menu-peek" aria-hidden="true" lang="zh-CN">${m.peek.map((t, i) => `<i style="--i:${i}">${esc(t)}</i>`).join('')}</i>` : '')
      + (m.grid ? `<i class="ks-menu-grid" aria-hidden="true">${m.grid.map((n) => `<i class="ks-g${n}"></i>`).join('')}</i>` : '');
    for (const m of menu) {
      const a = h('a', `ks-menu-to${m.wide ? ' ks-menu-wide' : ''}`, `<b lang="zh-CN" aria-hidden="true">${esc(m.zh)}</b><span>${esc(m.label)}</span>${m.meta ? `<small>${esc(m.meta)}</small>` : ''}${art(m)}`);
      a.href = m.href; a.onclick = () => close();
      nav.append(a);
    }
    sheet.append(nav);
    if (more?.length) {
      const row = h('p', 'ks-menu-more');
      for (const m of more) { const a = h('a', m.cls, esc(m.label)); a.href = m.href; if (!m.href.startsWith('mailto:')) a.onclick = () => close(); row.append(a); }
      sheet.append(row);
    }
  }
  sheet.append(h('h2', '', 'Settings'));
  // what was just changed, said for a moment at the sheet's foot (and to a screen reader): kept on this phone
  const saved = h('p', 'ks-saved');
  saved.setAttribute('role', 'status');
  const said = (t) => { saved.textContent = `${t} · saved`; saved.classList.remove('ks-saved-on'); void saved.offsetWidth; saved.classList.add('ks-saved-on'); };
  for (const [key, label, opts, look, sub] of ROWS) {
    const row = h('div', `ks-set ks-set-${look}`, `<div class="ks-set-l">${esc(label)}</div>`);
    if (look === 'switch') {
      row.innerHTML = `<div><div class="ks-set-l">${esc(label)}</div><small>${esc(sub)}</small></div>`;
      const sw = h('button', 'ks-switch', '<i></i>'); sw.type = 'button';
      sw.setAttribute('role', 'switch'); sw.setAttribute('aria-label', label); sw.setAttribute('aria-checked', settings.get(key) === true);
      sw.onclick = () => { const v = settings.get(key) !== true; settings.set(key, v); sw.setAttribute('aria-checked', v); said(`${label} ${v ? 'on' : 'off'}`); };
      row.append(sw); sheet.append(row);
      continue;
    }
    const seg = h('div', `ks-seg ks-seg-${look}`), eg = look === 'slide' ? h('div', `ks-set-eg ks-eg-${key}`) : null;
    seg.style.setProperty('--n', opts.length);
    if (look === 'slide') seg.append(h('i', 'ks-seg-pill'));
    // the sample under a sliding row, as the choice now standing draws it, and the pill moved to it
    const show = (v) => {
      seg.style.setProperty('--at', Math.max(0, opts.findIndex(([x]) => x === v)));
      if (key === 'english') eg.innerHTML = `<span lang="zh-CN">我手机没信号了。</span>${EG_EN[v] ? `<span class="ks-en${v === 'tap' ? ' ks-en-tap' : ''}">${esc(EG_EN[v])}</span>` : '<small>No English under the lines</small>'}`;
      if (key === 'pressure') { eg.className = `ks-set-eg ks-eg-pressure ks-eg-${v}`; eg.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18"/><circle class="ks-eg-arc" cx="22" cy="22" r="18"/></svg><small>${esc(opts.find(([x]) => x === v)?.[2] || '')}</small>`; }
    };
    for (const [v, l, s] of opts) {
      const inner = look === 'cards' ? `<span class="ks-eg-line" aria-hidden="true" lang="zh-CN">${EG.map(([z, p], i) => `<span style="--py:${EG_PY[v][i]}"><small>${p}</small>${z}</span>`).join('')}</span><b>${esc(l)}</b><small>${esc(s)}</small>`
        : look === 'icons' ? `${ICONS[v]}<span>${esc(l)}</span>` : esc(l);
      const b = h('button', '', inner); b.type = 'button';
      b.setAttribute('aria-pressed', settings.get(key) === v);
      b.onclick = () => { settings.set(key, v); seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); if (eg) show(v); said(`${SHORT[key]}: ${l}`); };
      seg.append(b);
    }
    if (eg) show(settings.get(key));
    row.append(seg); if (eg) row.append(eg); sheet.append(row);
  }
  // quiet mode (ask.js): the rest of this visit answered with no voice; as 🤫 on a speaking panel
  const hush = h('div', 'ks-set ks-set-quiet', '<div class="ks-set-l">🤫 Can’t talk now</div>'), hseg = h('div', 'ks-seg ks-seg-slide');
  hseg.style.setProperty('--n', 2); hseg.append(h('i', 'ks-seg-pill'));
  const pressed = () => { hseg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.q === String(quiet())))); hseg.style.setProperty('--at', quiet() ? 1 : 0); };
  for (const [v, l] of [[false, 'Off'], [true, 'On, till this visit ends']]) { const b = h('button', '', esc(l)); b.type = 'button'; b.dataset.q = v; b.onclick = () => { if (quiet() !== v) { quiet(v); said(v ? 'Quiet till this visit ends' : 'Quiet off'); } pressed(); }; hseg.append(b); }
  pressed(); hush.append(hseg); sheet.append(hush);
  const why = speech.whyNot();
  sheet.append(h('p', 'ks-note-env', why ? `${esc(why)} Best available is then say-and-check: say it aloud, see the answer, be honest. Tiles and typing are a tap away.` : 'Speech recognition is available: answers are judged by how they sound.'));
  sheet.append(yours());
  // what this browser keeps, and a way to delete it: About (the menu has its own link), then Start over
  const keep = h('div', 'ks-set ks-set-keep'), page = !menu && about();
  keep.innerHTML = `<div class="ks-set-l">Kept in this browser</div><p class="ks-you-note">Everything 快说 learns stays here, with no account.${page ? ` <a class="ks-set-about" href="${esc(page)}">What’s kept, and what leaves</a>` : ''}</p>`;
  const over = h('button', 'ks-btn ks-btn-quiet ks-start-over', 'Start over…'); over.type = 'button';
  over.onclick = () => startOver(sheet, over);
  keep.append(over); sheet.append(keep);
  const done = h('button', 'ks-btn', 'Done'); done.type = 'button';
  sheet.append(done, saved);
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  const close = () => {
    if (!bg.isConnected) return;
    bg.remove(); document.removeEventListener('keydown', onKey);
    if (app) app.inert = false;
    // back where you were; if an answer panel came up meanwhile, the rail is hidden by now, so into the panel
    const p = from?.closest?.('.ks-card')?.querySelector('.ks-ask');
    const to = p ? p.querySelector('.ks-ask-input :is(button, input):not(:disabled), .ks-next') || p.querySelector('button') : from;
    if (to?.isConnected) to.focus({ preventScroll: true });
    onClose?.();
  };
  done.onclick = close;
  bg.onclick = (e) => { if (e.target === bg) close(); };
  document.addEventListener('keydown', onKey);
  bg.append(sheet); document.body.append(bg);
  if (app) app.inert = true;
  (sheet.querySelector('.ks-menu-to') || done).focus({ preventScroll: true });
}

// Settings → Start over (docs/v2/web.md §3): a sheet over Settings that says what goes, then everything this game keeps
// in this browser deleted (store.js wipe: every ks.* key, and nothing written after) and the page loaded again at For
// You, with no hash: a phone that has never played (the hook on its gate, the first story, the about card). Escape or
// Keep it goes back to Settings as it was. (The microphone's permission is the browser's, in its site settings.)
function startOver(under, from) {
  const bg = h('div', 'ks-sheet-bg ks-confirm-bg'), box = h('div', 'ks-sheet ks-confirm');
  box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ks-confirm-h'); box.setAttribute('aria-describedby', 'ks-confirm-p');
  box.innerHTML = `<h2 id="ks-confirm-h">Start over?</h2>
    <div id="ks-confirm-p"><p>This deletes everything 快说 keeps in this browser:</p>
    <ul><li>your progress: stories played, your streak, the endings found</li><li>the phrases you’ve met, and when each comes back</li><li>what it has learned about your Chinese, and what you told it about you</li><li>your settings, and the log of what you’ve played</li></ul>
    <p>It can’t be undone. 快说 opens again at the first story, as if you’d never played.</p></div>
    <div class="ks-confirm-row"><button type="button" class="ks-btn ks-btn-quiet ks-start-over-no">Keep it</button><button type="button" class="ks-btn ks-start-over-yes">Delete it all</button></div>`;
  // (Escape is this sheet's while it's up, wherever the focus is: caught before Settings' own, which would close it all)
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); no(); } };
  const no = () => { bg.remove(); document.removeEventListener('keydown', onKey, true); under.inert = false; from?.focus({ preventScroll: true }); };
  box.querySelector('.ks-start-over-no').onclick = no;
  box.querySelector('.ks-start-over-yes').onclick = () => { wipe(); location.replace(location.pathname + location.search); };
  bg.onclick = (e) => { if (e.target === bg) no(); };
  document.addEventListener('keydown', onKey, true);
  bg.append(box); document.body.append(bg);
  under.inert = true;
  box.querySelector('.ks-start-over-no').focus({ preventScroll: true });
}

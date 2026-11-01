// Chinese on screen: characters always, pinyin above them per the setting (all, new words only, none), every word
// tappable for its pinyin and meaning, English underneath per the setting (shown, on tap, none).
import { settings, vocab, kv } from './store.js';
import { sayWord } from './speech.js';
import { ms } from './time.js';
import * as events from './events.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// Enter or Space on something that acts as a button without being one (Space would otherwise scroll the feed)
export const keyClick = (e) => { if (!e.defaultPrevented && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click(); } };

// One live region for the whole app, made once and never replaced: panels come and go (and a region inserted already
// filled is often not read), so what a screen reader should hear goes here. zhText is read with a Chinese voice.
let sr = null;
const region = () => { if (!sr) { sr = h('div', 'ks-sr'); sr.setAttribute('aria-live', 'polite'); document.body.append(sr); } return sr; };
export function announce(text, zhText = '') {
  const r = region();
  r.textContent = ''; // emptied first, so the same words twice are read twice
  clearTimeout(announce.t);
  announce.t = setTimeout(() => { r.textContent = text; if (zhText) { const s = h('span'); s.lang = 'zh-CN'; s.textContent = zhText; r.append(' ', s); } }, 80);
}

// A word that comes and goes by itself (two seconds), over everything and read out too: one at a time.
let toasted = null;
// An end card (Scenes, Chase, Chats) shows your lines most worth another look and never scrolls, so a swipe on it moves
// the feed; the rest wait behind Show all (rows marked ks-list-extra). Open, the list scrolls, till Show fewer. It shows
// too where even the first lines don't fit.
export function showAll(box, list, onToggle) {
  const rows = list.children.length, extra = list.querySelectorAll(':scope > .ks-list-extra').length, btn = h('button', 'ks-list-more');
  btn.type = 'button';
  const label = () => (btn.textContent = box.classList.contains('ks-list-open') ? 'Show fewer ▴' : extra ? `Show all ${rows} ▾` : 'Show all ▾');
  btn.onclick = () => { box.classList.toggle('ks-list-open'); list.scrollTop = 0; label(); onToggle?.(); };
  label(); list.after(btn);
  if (!extra) requestAnimationFrame(() => { if (list.scrollHeight <= list.clientHeight + 4) btn.remove(); });
}

// a headline that drops in a character at a time and bounces where it lands (the end cards' 完美！, ks.css .ks-drop);
// its text is the headline's as it was, only each character its own span
export const dropIn = (t) => `<span class="ks-drop">${Array.from(t).map((c, i) => `<span style="--i:${i}">${esc(c)}</span>`).join('')}</span>`;

export function toast(text, time = 2000) {
  toasted?.remove();
  const t = (toasted = h('div', 'ks-toast', esc(text)));
  t.setAttribute('aria-hidden', 'true'); // the live region says it
  document.body.append(t); announce(text);
  setTimeout(() => t.remove(), ms(time));
}

// A word's syllables as pinyin writes them, run together (wǎngshàng), with an apostrophe where one that starts with
// a, o or e would run into the one before (xī'ān)
const joined = (py) => py.split(' ').map((s, i) => (i && /^[aoeāáǎàōóǒòēéěè]/.test(s) ? "'" + s : s)).join('');

// tokens ([word, pinyin, gloss] or [punctuation]) → a span of tappable words. The pinyin goes over each word whole, not
// over each character: a reading wider than its character spreads a word apart (网 上), and a weak reader takes those
// gaps for word breaks. The real breaks get a little air instead (ks.css). Each word is one box that a line wraps
// around, never through (ks.css), so the punctuation after a word (and an opening quote before one) goes in its box:
// a line never starts with a comma.
const OPEN = /^[“‘（《「『【〔([]$/;
// How much the text helps, where the player's setting is Auto: the card on screen says (assist.js sets its pinyin and
// English as it starts), else v1's own (pinyin over new words, English a tap away). A setting the player pins wins.
// Pinyin 'model' shows a word's reading while the learner model says it's likely unread (reads(w) < 0.8).
let card = { pinyin: 'new', english: 'tap' }, reads = null;
export const cardHelp = (knobs = {}) => { card = { pinyin: knobs.pinyin || 'new', english: knobs.english || 'tap' }; };
export const reader = (fn) => { reads = fn; };
export const shown = (k) => { const s = settings.get(k); return s === 'auto' ? card[k] : s; };
const unread = (w) => (reads ? reads(w) < 0.8 : !vocab.known(w) || relearning(w));
export function zh(tokens, { pinyin = shown('pinyin'), cls = '', count = true } = {}) {
  const el = h('span', 'ks-zh ' + cls);
  el.lang = 'zh-CN';
  let stop = 0, last = null, open = ''; // last: the word just put in, while punctuation can still join it
  for (const t of tokens || []) {
    if (t.length < 2) {
      if (OPEN.test(t[0])) open += t[0];
      else if (last && t[0].trim()) { (last.lastChild.className === 'ks-p' ? last.lastChild : last.appendChild(h('span', 'ks-p'))).append(t[0]); last.classList.add('ks-w-p'); }
      else { el.append(h('span', 'ks-p', esc(t[0]))); last = null; }
      continue;
    }
    const [w, py, g] = t, show = pinyin === 'all' || (pinyin === 'new' && (!vocab.known(w) || relearning(w))) || (pinyin === 'model' && unread(w));
    const ws = (last = h('span', 'ks-w'));
    Object.assign(ws.dataset, { w, py, g: g || '' });
    ws.tabIndex = stop++ ? -1 : 0; // one tab stop per line; the arrow keys move along it (installGloss)
    ws.innerHTML = (open && `<span class="ks-p">${esc(open)}</span>`) + (show ? `<ruby><span>${esc(w)}</span><rt>${esc(joined(py))}</rt></ruby>` : esc(w));
    open = '';
    if (count) seen(w);
    el.append(ws);
  }
  if (open) el.append(h('span', 'ks-p', esc(open)));
  return el;
}

// A word you had to look up is new again: its pinyin comes back until you've seen it as often as a new word needs to
// be seen. store.js's vocab only counts up, so the words looked up keep their own count here (on this phone only).
const AGAIN = 6;
let again = null, againTimer = 0;
const looked = () => (again ??= kv.get('again', null) || {});
const keepLooked = () => { clearTimeout(againTimer); againTimer = setTimeout(() => kv.set('again', again), 800); }; // (ks.again: store.js's, so Start over stops it too)
export const relearning = (w) => w in looked(); // (pinyin by model counts a word looked up against it too)
const lookedUp = (w) => { looked()[w] = 0; keepLooked(); };
function seen(w) {
  vocab.seen(w);
  if (!relearning(w)) return;
  if (++again[w] >= AGAIN) delete again[w];
  keepLooked();
}

// English under a line: shown, hidden until tapped (or Enter), or left out.
export function en(text, mode = shown('english')) {
  if (!text || mode === 'none') return h('span', 'ks-en ks-en-none');
  const e = h('span', 'ks-en' + (mode === 'tap' ? ' ks-en-tap' : ''), esc(text));
  if (mode === 'tap') {
    e.setAttribute('role', 'button'); e.tabIndex = 0; e.title = 'Show the English';
    // once shown it's plain text again (tabIndex -1 rather than none, so a keyboard user keeps their place)
    const show = (ev) => { ev.stopPropagation(); events.note('reveal'); e.classList.remove('ks-en-tap'); e.removeAttribute('role'); e.removeAttribute('title'); e.tabIndex = -1; e.removeEventListener('keydown', keyClick); };
    e.addEventListener('click', show, { once: true }); e.addEventListener('keydown', keyClick);
  }
  return e;
}

// ---------- tap a word: pinyin and meaning ----------
let pop = null;
function closePop() { pop?.remove(); pop = null; }
export function installGloss(root = document) {
  region();
  root.addEventListener('click', (e) => {
    const w = e.target.closest?.('.ks-w');
    if (!w || e.target.closest('.ks-nogloss, .ks-p')) return; // a comma in a word's box isn't the word
    e.stopPropagation();
    closePop();
    const { w: word, py, g } = w.dataset;
    lookedUp(word); // looked up: its pinyin comes back for a while
    events.note('gloss');
    pop = h('div', 'ks-pop', `<div class="ks-pop-w" lang="zh-CN">${esc(word)}</div><div class="ks-pop-py">${esc(py)}</div><div class="ks-pop-g">${esc(g || '—')}</div><button class="ks-pop-say" type="button" aria-label="Hear it">🔊</button>`);
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', `${word} ${py}: ${g || '—'}`);
    pop.from = w;
    pop.querySelector('button').onclick = (ev) => { ev.stopPropagation(); sayWord(word); };
    document.body.append(pop);
    const r = w.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left + r.width / 2 - pr.width / 2), innerWidth - pr.width - 8);
    const y = r.top - pr.height - 10 > 8 ? r.top - pr.height - 10 : r.bottom + 10;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    // a tap (detail ≥ 1) leaves focus where it is, so a screen reader hears the meaning from the live region; from the
    // keyboard (Enter, below) focus moves into the pop instead
    if (e.detail) announce(`${py}: ${g || 'no meaning listed'}`, word);
  }, true);
  // a tap on a word leaves focus where it was (an answer being typed keeps its keyboard)
  root.addEventListener('mousedown', (e) => { if (e.target.closest?.('.ks-w')) e.preventDefault(); }, true);
  // keyboard: Tab reaches a line, the arrows walk its words, Enter opens one, Escape closes it and goes back to the word
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pop) { const w = pop.contains(document.activeElement) && pop.from; closePop(); if (w) w.focus({ preventScroll: true }); return; }
    const w = e.target.closest?.('.ks-w');
    if (!w || e.defaultPrevented) return; // a key the line's own row already took isn't a gloss too
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); w.click(); pop?.querySelector('button').focus({ preventScroll: true }); return; }
    const ws = [...w.parentNode.querySelectorAll('.ks-w')], k = ws.indexOf(w);
    const to = ws[{ ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: ws.length - 1 }[e.key]];
    if (!to || to === w) return;
    e.preventDefault(); w.tabIndex = -1; to.tabIndex = 0; to.focus();
  });
  document.addEventListener('click', (e) => { if (pop && !e.target.closest('.ks-pop')) closePop(); });
  document.addEventListener('scroll', closePop, true);
}

// The tone-marked pinyin of tokens, as one string (for hints)
export const pinyinOf = (tokens) => (tokens || []).filter((t) => t.length > 1).map((t) => joined(t[1])).join(' ');

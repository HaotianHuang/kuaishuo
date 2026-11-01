// The answer panel: the moment a scene stops and waits for you. Four ways to answer, one verdict:
//   speak  the phone's recogniser, judged by sound (match.js)
//   tiles  the line with its key words blanked, filled from characters that tempt (quiet places, reading practice)
//   type   the Chinese keyboard, or plain pinyin
//   self   say it aloud, see the answer, be honest (how a panel opens where the phone can't listen)
// A clock (by level and the pressure setting), hints that say what they cost, and a verdict that shows what you said
// and what you got right.
//
// ask(parent, beat, opts) → Promise<{ result: 'ok' | 'timeout' | 'skip' | 'cancel', alt, stars, verdict, mode, tried }>
//   (tried: on a timeout or skip, whether the player had a go at all; silence and a wrong answer feel different)
//   opts: { id (phrase id, for review), level, attempt (1, 2, 3…), audio (the scene's pack url), decoys (words for
//           tiles), skin ('sheet' | 'bar' | 'call' | 'chase'), signal (AbortSignal), time (seconds, overrides),
//           onListen(bool), mission (override text), cue (a few words shown big in the mission's place; the first
//           hint and the verdict show the mission), mode (the way this beat suggests answering, if available),
//           hint (start at this help level: 1 frame, 2 the whole answer), free (that starting help costs no stars),
//           onMiss(verdict) (each wrong try), quick (a short verdict, for fast formats), onVerdict(verdict, stars)
//           (the moment it's right, before the verdict panel goes), giveUpAfter (seconds of no taps on a try with no
//           clock before it counts as a skip), control(api) (called at once with { hold() → release, penalty(s),
//           free(level) }: the format's own hand on the clock, to stop it while it replays a line, and on the help, to
//           make what it gives mid-panel free: a call's free peek), clockX and echo (the card's rung: its clock, and
//           the line said first, or once a promise settles; assist.js askOpts() sets them), log (more of the line's
//           row: the rung) }
// The panel is in `parent` when ask() returns, even for a signal that has already aborted (it's cancelled a moment later).
import * as audio from './audio.js';
import * as speech from './speech.js';
import * as match from './match.js';
import * as content from './content.js';
import { settings, srs, marks, kv } from './store.js';
import { zh, h, esc, announce, keyClick, toast } from './text.js';
import { ms, fast, now } from './time.js';
import * as levels from './levels.js';
import * as events from './events.js';
import * as learner from './learner.js';

export const ICON = { // (Settings' Answer by draws them too)
  speak: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  tiles: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="8" y="13" width="8" height="7" rx="1.5"/></svg>',
  type: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h1M7 14h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  self: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const LABEL = { speak: 'Speak', tiles: 'Tiles', type: 'Type', self: 'Say & check' };
const HAN = /[一-鿿]/, NOT_HAN = /[^一-鿿]/g;
// the first panel of a visit where the phone can't listen says, for a moment, how its way of answering goes
const NOMIC = { self: 'No microphone here: say it out loud, then tap Show me.', tiles: 'No microphone here: say it out loud as you fill the gaps.', type: 'No microphone here: type it, in characters or pinyin.' };

// Quiet mode, "Can't talk now" (docs/v2/p5.md): speaking is the point, but a phone on a train can't talk aloud, and a
// speaking card skipped is a visit lost. 🤫 on a speaking panel (or Settings) answers the rest of the visit with no
// voice: typed where the player has typed before, else tiles; no recogniser or microphone while it's on (no speak tab,
// no say-and-check, which is said aloud too). Calls and chats still play their voices (earphones), and the Mix deals no
// line to shadow (rank.js quiet()). It lasts till the visit ends (half an hour away: events.js's and rank.js's GAP) or
// it's tapped off; ks.quiet keeps when it went on, so a reload in the same visit keeps it. 'ks:quiet' on the window says
// it changed (the Mix picks its next card again, every panel on the page redraws its tabs).
const GAP = 30 * 60e3;
export function quiet(on) {
  if (on === undefined) { const t = kv.get('quiet', null), s = events.session(); return t != null && (s ? t > s.start - GAP : now() - t < GAP); }
  if (on) kv.set('quiet', now()); else kv.del('quiet');
  if (on) events.note('quiet'); // the card it was tapped on says so in its row
  dispatchEvent(new CustomEvent('ks:quiet', { detail: { on: !!on } }));
  return !!on;
}
// the visit's quiet way: typed if the player has typed a line before (or pinned typing), else tiles
const hushed = () => (settings.get('input') === 'type' || ask.chosen === 'type' || events.all().some((r) => r.k === 'line' && r.mode === 'type' && !r.task) ? 'type' : 'tiles');
export function modesAvailable() { const q = quiet(); return ['speak', 'tiles', 'type', 'self'].filter((m) => (q ? m === 'tiles' || m === 'type' : m !== 'speak' || speech.canListen())); }
// without a microphone, say it aloud and check it yourself: the nearest thing to speaking (tiles lay the answer out).
// A way tapped on a panel holds for the rest of the visit (ask.chosen), where the saved setting doesn't decide.
export function defaultMode() { const s = settings.get('input'), av = modesAvailable(); return s !== 'auto' && av.includes(s) ? s : av.includes(ask.chosen) ? ask.chosen : quiet() ? hushed() : av.includes('speak') ? 'speak' : 'self'; }
settings.on((k) => { if (k === 'input') ask.chosen = null; }); // a choice made in Settings beats a tab tapped earlier

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const SLOW = 0.78; // a model answer's slow turn, where the beat has no slow clip of its own: build.py's speed for them

// The characters the app's own lines use, by toneless syllable, for tiles that sound like a missing one (再 for 在, 官
// for 关): ones a learner has met, not whatever else the dictionary reads that way. Built once the content is in.
let SOUNDS = null;
function soundsLike(c, r) {
  if (!SOUNDS && content.get() && match.ready()) {
    SOUNDS = new Map();
    for (const x of new Set(JSON.stringify(content.get().scenarios).match(/[一-鿿]/g))) for (const s of new Set((match.readings(x) || []).map((y) => y.slice(0, -1)))) SOUNDS.set(s, (SOUNDS.get(s) || []).concat(x));
  }
  // the very same reading first (再 for 在), then the syllable in another tone (新 for 信)
  const same = (x) => (match.readings(x) || []).includes(r);
  return shuffle((SOUNDS?.get(r.slice(0, -1)) || []).filter((x) => x !== c)).sort((a, b) => same(b) - same(a));
}

// The words a hint blanks, as frame() blanks them: each need group's word, every time it occurs, keyed once each in
// sentence order. Groups whose words overlap in the sentence (八零 + 零二) share their blanks, so they share one entry
// (八零二); groups that only sit side by side keep their own. A match.js whose frame() widens blanks to whole words
// says which itself (blanks()), and that wins: the key has to gloss what the frame blanked.
const keyed = (o) => (match.blanks || keyWords)(o);
function keyWords(o) {
  const s = o.answers[0], spans = [], runs = [];
  for (const g of o.need || []) { const w = g.find((x) => x && s.includes(x)); for (let i = w ? s.indexOf(w) : -1; i >= 0; i = s.indexOf(w, i + 1)) spans.push([i, i + w.length]); }
  for (const [a, b] of spans.sort((x, y) => x[0] - y[0])) { const r = runs[runs.length - 1]; if (r && a < r[1]) r[1] = Math.max(r[1], b); else runs.push([a, b]); }
  return [...new Set(runs.map(([a, b]) => s.slice(a, b)))];
}

// Then and now (p5.md): a phrase missed (a star or none) on an earlier day and said now from memory, three stars, gets
// a stamp on its verdict, once a phrase: "Tuesday: missed. Today: nailed." From spaced review alone (store.js srs hist,
// its last 8 [day, stars]), read before this answer is recorded. ks.then keeps the ones stamped ({ id: { at, day } }):
// never twice, and the recap's row. → the stamp's words, or ''
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// a day gone by, as a person says it: Yesterday (or its weekday: named), a weekday within the week, else the date
export function whenWas(day, { today = events.dayKey(), named = false } = {}) {
  const d = new Date(`${day}T12:00:00`), k = Math.round((new Date(`${today}T12:00:00`) - d) / 864e5);
  return k === 1 && !named ? 'Yesterday' : k < 7 ? WEEK[d.getDay()] : `On ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
}
// (said from memory: a story's line or a review's, a flash crisis or a run's; not a task beside a story: a call's line
// typed back as heard, a practice with the answer in front of you, a shadow, the bonus's first meeting)
const BESIDE = ['practice', 'typeback', 'shadow', 'bonus'];
function thenNow(id, stars) {
  const was = kv.get('then', {}), today = events.dayKey();
  if (!id || stars < 3 || was[id]) return '';
  const day = (srs.get(id)?.hist || []).filter(([d, s]) => d < today && s <= 1).map(([d]) => d).sort().pop();
  if (!day) return '';
  was[id] = { at: now(), day }; kv.set('then', was);
  return `${whenWas(day, { today })}: missed. Today: nailed.`;
}

// Your own line (the owner's play notes, 31 Oct 2026): every line has other right answers, and the player can make one
// of them the line they learn: hinted, built and shown as theirs from then on, here and in review (ks.mine: { phrase
// id: its words }). The judge still takes any of them. Only the first has a recorded voice; another is said by the
// browser's own. → the beat as the player learns it: their pick first, the need words it has (else its longest words)
function ownLine(beat, k) {
  if (!k) return beat;
  const first = (a) => [a[k], ...a.filter((_, j) => j !== k)], s = beat.answers[k], had = (beat.need || []).filter((g) => g.some((w) => w && s.includes(w)));
  const need = had.length ? had : (beat.ans[k].t || []).filter((t) => t.length > 1).map((t) => t[0]).sort((a, b) => b.length - a.length).slice(0, 2).map((w) => [w]);
  return { ...beat, answers: first(beat.answers), ans: first(beat.ans), need, a: null, slow: null };
}
const mine = (id, beat) => { const w = kv.get('mine', {})[id]; return w ? Math.max(0, (beat.ans || []).findIndex((e) => e.zh === w)) : 0; };
function makeMine(id, beat, k) { const m = kv.get('mine', {}); if (k) m[id] = beat.ans[k].zh; else delete m[id]; kv.set('mine', m); }

export function ask(parent, beat, opts = {}) {
  const attempt = opts.attempt || 1, level = levels.of(opts.level);
  // the clock: on Auto the card's assist sets it (clockX: 0 is none), else the player's pinned pressure
  const pressure = settings.get('pressure'), x = pressure === 'auto' ? opts.clockX ?? 1 : pressure === 'relaxed' ? 0 : pressure === 'panic' ? 0.7 : 1;
  let secs = opts.time ?? (level === 0 ? 0 : beat.time ?? levels.clock(level)); // L0 has no clock, whatever an older beat's own time says
  secs = !x || attempt >= 3 ? 0 : Math.round(secs * x * (attempt === 2 ? 1.5 : 1));
  // the mode a beat suggests (a chat's "send a voice message") wins over 'auto', never over the player's own choice
  const preferred = settings.get('input') === 'auto' && opts.mode && modesAvailable().includes(opts.mode) ? opts.mode : null;
  // line: which line you're building or checking (-1 the main one, else an or-branch, picked with its chip)
  let hint = Math.max(opts.hint || 0, attempt >= 3 ? 2 : attempt === 2 ? 1 : 0), heardModel = false, mode = preferred || defaultMode(), listening = null, finished = false, line = -1, slow = false;
  // a say-and-check's own help: what it had before Show me put the answer up (which it needs, to check against)
  let selfHint = null;
  // help a format chose to give up front costs nothing (a practice's answer, the assist's frame), and help it gives free
  // later (control: a call's free peek); a retry's own help still costs
  let freeHint = opts.free ? Math.min(hint, opts.hint || 0) : 0;
  // the mission, and a cue to show big in its place until the first hint (a format that passes its cue as the mission
  // too still gets the beat's own words there)
  const full = (opts.mission !== opts.cue && opts.mission) || beat.en || opts.mission || '', cue = opts.cue && opts.cue !== full ? opts.cue : '';
  let resolveFn;
  const done = new Promise((r) => (resolveFn = r));
  const el = h('section', `ks-ask ks-ask--${opts.skin || 'sheet'}`), uid = `ks-ask-${(ask.n = (ask.n || 0) + 1)}`;
  el.setAttribute('aria-label', 'Your line');
  el.innerHTML = `
    <div class="ks-ask-top"><span class="ks-ask-label">${attempt > 1 ? 'Try again' : 'Your line'}${beat.status === 'draft' ? ' <span class="ks-draft">draft</span>' : ''}</span>
      <span class="ks-ask-clock" ${secs ? '' : 'hidden'}><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" class="ks-ring-bg"/><circle cx="18" cy="18" r="15.5" class="ks-ring"/></svg><b>${secs}</b></span>
      <button type="button" class="ks-tool ks-skip">Skip</button></div>
    <p class="ks-ask-mission${cue ? ' ks-ask-cue' : ''}">${esc(cue || full)}</p>
    <div class="ks-ask-alts"></div>
    <div class="ks-ask-help" aria-live="polite"></div>
    <div class="ks-ask-live"></div>
    <div class="ks-ask-input"></div>
    <div class="ks-ask-tools">
      <button type="button" class="ks-tool ks-hint">Hint</button>
      <button type="button" class="ks-tool ks-hear"><span aria-hidden="true">🔊</span></button>
      <button type="button" class="ks-tool ks-hush" aria-label="Can't talk now: answer without speaking" hidden><span aria-hidden="true">🤫</span></button>
      <span class="ks-modes" role="tablist" aria-label="How to answer"></span>
    </div>`;
  parent.append(el);
  events.count.panels++; events.note('asked'); // the card reached a line: left now, it's left mid-story, not skipped
  if (window.KS_SIM || window.KS_SAY) el.dataset.answer = beat.answers[0]; // tests type or build the answer
  const $ = (s) => el.querySelector(s);
  const live = $('.ks-ask-live'), input = $('.ks-ask-input'), help = $('.ks-ask-help'), alts = $('.ks-ask-alts'), hear = $('.ks-hear'), hintB = $('.ks-hint'), mission = $('.ks-ask-mission');
  // feedback under the answer, read out from the app's one live region (this panel's own come and go)
  const tell = (html) => { live.innerHTML = html; announce(live.innerText); };
  // pick: which of the main line's answers is the player's own (ownLine); tgt, the main line as they learn it
  let pick = beat.ans?.length > 1 ? mine(opts.id || beat.id, beat) : 0, tgt = ownLine(beat, pick);
  const option = () => (line >= 0 ? beat.alts[line] : tgt);

  // or-branches: other things you could say, which take the story elsewhere. Spoken or typed they're plain labels (the
  // judge hears which one you said); in tiles and say-and-check each is a chip that picks the line you're building.
  if (beat.alts?.length) alts.innerHTML = '<em class="ks-alt-main" hidden>The line above</em>' + beat.alts.map((a) => `<span>or</span><em>${esc(a.en.replace(/^or:\s*/i, ''))}</em>`).join('');
  const pressChips = () => alts.querySelectorAll('em[role]').forEach((e, k) => e.setAttribute('aria-pressed', k - 1 === line));
  const chips = (pick) => {
    alts.querySelectorAll('em').forEach((e, k) => {
      e.onclick = e.onkeydown = null; ['role', 'tabindex', 'aria-pressed'].forEach((a) => e.removeAttribute(a));
      if (!k) e.hidden = !pick;
      if (pick) { e.setAttribute('role', 'button'); e.tabIndex = 0; e.onclick = () => finished || pick(k - 1); e.onkeydown = keyClick; }
    });
    if (pick) pressChips();
  };

  // ---------- the clock ----------
  // It stands still while something holds it (the model answer playing, the microphone open, the format replaying a
  // line), while the settings sheet is up, and while a test takes its screenshot.
  let left = secs, ticker = 0, tries = 0, settled = false, auto = 0, later = 0, clip = null, typedAt = 0, typing = null, grace = 0;
  // thinking time: from the panel to the answer, less what held the clock (the model playing, the mic, a check)
  const t0 = performance.now(), a0 = events.away();
  let heldMs = 0, heldAt = 0, thinking = null, used = null, out = null, heardAll = []; // heardAll: each try's words, for the row (events.js line)
  const holds = new Set(), hold = () => { const k = {}; if (!holds.size) heldAt = performance.now(); holds.add(k); return () => { if (holds.delete(k) && !holds.size) heldMs += performance.now() - heldAt; }; };
  const answered = (help, info = {}) => { if (thinking == null) { thinking = Math.max(0, Math.round(performance.now() - t0 - heldMs - (holds.size ? performance.now() - heldAt : 0) - (events.away() - a0))); used = { help, ...info }; } };
  const held = () => holds.size || window.KS_PAUSE || document.querySelector('.ks-sheet-bg');
  const ring = $('.ks-ring'), num = $('.ks-ask-clock b'), C = 2 * Math.PI * 15.5;
  if (ring) { ring.style.strokeDasharray = C; ring.style.strokeDashoffset = 0; }
  const draw = () => { if (!secs) return; num.textContent = Math.ceil(left); ring.style.strokeDashoffset = C * (1 - left / secs); el.classList.toggle('ks-hurry', left <= 5); };
  const tick = () => {
    if (finished || !secs || held()) return;
    // someone typing (a key in the last 4 s) isn't cut off mid-word: the clock rests at 1 s, for up to 8 s more
    if (typing && left <= 1 && Date.now() - typedAt < 4000 && grace < 80) { grace++; left = 1; draw(); return; }
    left = Math.max(0, left - (fast() ? 2 : 0.1)); draw();
    if (Math.abs(left - Math.round(left)) < 0.05 && left <= 5 && left > 0) audio.sfx(left <= 3 ? 'heartbeat' : 'tick');
    if (left <= 0) finish('timeout');
  };
  if (secs) ticker = setInterval(tick, 100);
  let idle = 0;
  const poke = () => (idle = 0);
  el.addEventListener('pointerdown', poke); el.addEventListener('keydown', poke);
  const idler = !secs && opts.giveUpAfter ? setInterval(() => { if (!finished && !held() && (idle += 1) >= opts.giveUpAfter) finish('skip'); }, ms(1000)) : 0;
  const penalty = (s) => { if (secs) { left = Math.max(1, left - s); draw(); } };
  // the format's own hand on the clock (held while it replays the line, say), and on the help (free from here: a peek)
  opts.control?.({ hold, penalty, free: (n) => { freeHint = Math.max(freeHint, n); if (!finished) price(); } });
  // the model answer out loud, one at a time (rate: slower, at the same pitch); the clock waits for it
  const playModel = async (a, rate = 1) => { const release = hold(); clip?.stop(); const c = (clip = audio.play(opts.audio, a, { rate })); await c.done; release(); };
  // a line out loud: its clip (slower: its slow clip, else stretched), or, for a line with none (your own: ownLine), the
  // browser's voice
  const voice = (o, slower = false) => (o.a ? playModel(slower ? o.slow || o.a : o.a, slower && !o.slow ? SLOW : 1) : (clip?.stop(), speech.sayWord(o.answers[0])));
  // The main line's other answers as chips, with pinyin, each said and made yours with a tap (onPick(k)); yours pressed.
  // `but`: the one not to list (on the verdict, what you just said). On the panel they wait behind one line, "Other ways
  // to say it", so a short phone keeps the mic and the tools in sight.
  const others = (cur, onPick, but = -1) => {
    const box = h('div', 'ks-others', but >= 0 ? '<span class="ks-others-h">You could also say</span>' : '');
    if (but < 0) {
      const more = h('button', 'ks-others-h ks-others-more', 'Other ways to say it ›'); more.type = 'button'; more.setAttribute('aria-expanded', 'false');
      more.onclick = () => { const open = box.classList.toggle('ks-others-open'); more.setAttribute('aria-expanded', open); more.textContent = open ? 'Other ways to say it ‹' : 'Other ways to say it ›'; };
      box.append(more);
    }
    (beat.ans || []).forEach((e, k) => {
      if (k === but || (but < 0 && k === cur) || !e.t) return;
      const b = h('button', 'ks-other ks-nogloss'); b.type = 'button'; // (ks-nogloss: a tap on its words picks it, not a word's meaning)
      b.dataset.k = k; b.setAttribute('aria-pressed', k === cur);
      b.append(zh(e.t, { pinyin: 'all', count: false }));
      b.onclick = () => onPick(k);
      box.append(b);
    });
    return box.children.length > 1 ? box : h('span');
  };

  // ---------- hints ----------
  // A word's meaning in this line: the beat's own key ({ 点了: 'tapped Like' }) where its writer gave one for the whole
  // of it, else the words the build cut an answer into where it says it, those only and each once (a blank that spans
  // several, 八零二, gets each of theirs), each as the key has it (a run of them too) or by its first dictionary sense.
  const glossOf = (w, o = beat) => {
    const key = o.key || beat.key || {}, e = w && (o.ans || []).find((x) => x.zh.includes(w)), run = (ts) => ts.map((t) => t[0]).join('');
    if (key[w] || !e) return key[w] || '';
    const at = [0];
    e.t.forEach((t) => at.push(at[at.length - 1] + t[0].length));
    let i = e.zh.indexOf(w);
    for (let j = i; j >= 0; j = e.zh.indexOf(w, j + 1)) if (at.includes(j) && at.includes(j + w.length)) { i = j; break; } // on word edges if it can be (好的's 好, not 好看's)
    const ts = e.t.filter((t, k) => t.length > 1 && at[k] < i + w.length && at[k + 1] > i), out = [];
    for (let k = 0; k < ts.length; k++) {
      let n = ts.length;
      while (n > k + 1 && !key[run(ts.slice(k, n))]) n--; // the longest run from here that the key has, else the one word
      out.push(key[run(ts.slice(k, n))] || ts[k][2]?.split(';')[0] || '');
      k = n - 1;
    }
    return out.filter(Boolean).join(' ');
  };
  // The words a line is judged by, in gold where the answer shows them (as the frame blanks them), for a say-and-check
  // to check itself against
  const gild = (z, o, e) => {
    const F = [...match.frame(o)], S = [...o.answers[0]], ws = z.querySelectorAll('.ks-w');
    let k = 0, n = 0;
    for (const t of e.t) { const m = [...t[0]].length; if (t.length > 1 && S.slice(k, k + m).some((c, j) => F[k + j] === '＿' && c !== '＿')) ws[n]?.classList.add('ks-gold'); n += t.length > 1; k += m; }
  };
  // the most stars the line can still earn: help beyond what the format gave free costs (the frame a star, the whole
  // answer or hearing it two), and so do later tries
  const capFor = (hl, heard) => { const paid = hl > freeHint ? hl : 0; return Math.min(paid >= 2 || heard ? 1 : paid === 1 ? 2 : 3, attempt >= 3 ? 1 : attempt === 2 ? 2 : 3); };
  // Each tool says on its face what it costs now, counted as the verdict will count it (Hint −1★, 🔊 −2★). Once Show me
  // has put the answer up and played it, hearing it again is free; and so it is on a line said for you first, free (the
  // rung's echo, A5's: the phone's first line among them), where 🔊 is only that again.
  const freeHear = () => (mode === 'self' && selfHint != null) || (!!opts.echo && !!beat.a);
  const price = () => {
    const top = mode === 'tiles' ? 2 : 3, hl = mode === 'self' && selfHint != null ? selfHint : hint, now = Math.min(top, capFor(hl, heardModel));
    const tag = (b, html, name, n) => { b.innerHTML = html + (n > 0 ? ` <b class="ks-cost">−${n}★</b>` : ''); b.setAttribute('aria-label', name + (n > 0 ? `, costs ${n} star${n > 1 ? 's' : ''}` : '')); };
    tag(hintB, 'Hint', 'Hint', now - Math.min(top, capFor(hl + 1, heardModel)));
    tag(hear, `<span aria-hidden="true">${slow ? '🐢' : '🔊'}</span>`, slow ? 'Hear it slower' : 'Hear it', freeHear() ? 0 : now - Math.min(top, capFor(Math.max(hl, 2), true)));
  };
  const showHelp = () => {
    help.querySelectorAll('.ks-frame, .ks-frame-key, .ks-help-full').forEach((n) => n.remove()); // only the panel's own help: a line a format put there (a call's peek) stays
    if (cue && hint >= 1) { mission.textContent = full; mission.classList.remove('ks-ask-cue'); } // the first hint spells the mission out
    const o = option(), entry = o.ans?.[0];
    if (hint >= 2 && entry) {
      const z = help.appendChild(zh(entry.t, { pinyin: 'all', cls: 'ks-help-full', count: false }));
      if (mode === 'self' && selfHint != null) gild(z, o, entry); // Show me: what to have said
    } else if (hint >= 1) {
      if (mode !== 'tiles') help.append(h('div', 'ks-frame', esc(match.frame(o)))); // tiles have it on screen already
      help.append(h('div', 'ks-frame-key', keyed(o).map((w) => `<span>${esc('＿'.repeat([...w].length))} ${esc(glossOf(w, o) || '?')}</span>`).join('')));
    }
    // with the whole line up, the other ways to say it: one tapped is said, and becomes the line you're learning
    help.querySelector('.ks-others')?.remove();
    if (hint >= 2 && line < 0 && !finished) help.append(others(pick, (k) => { pick = k; makeMine(opts.id || beat.id, beat, k); tgt = ownLine(beat, k); setMode(mode); voice(tgt); }));
    hintB.hidden = hint >= 2;
    price();
  };
  showHelp();
  hintB.onclick = () => { if (finished) return; hint = Math.min(2, hint + 1); showHelp(); };
  hear.onclick = () => {
    if (finished) return;
    const o = option();
    if (!freeHear()) heardModel = true;
    hint = Math.max(hint, 2);
    const turtle = slow; slow = !slow;
    showHelp();
    voice(o, turtle); // no slow clip: the line stretched here (stretch.js)
  };
  $('.ks-skip').onclick = () => finish('skip');

  // ---------- modes ----------
  const modes = $('.ks-modes'), hush = $('.ks-hush');
  // 🤫 on a panel that would be spoken (the mic, or say it aloud and check), and pressed on every panel while quiet
  // mode is on, to tap it off
  const showHush = () => { const q = quiet(); hush.hidden = !q && mode !== 'speak' && mode !== 'self'; hush.setAttribute('aria-pressed', q); };
  const setMode = (m) => {
    // (another mode mid-comparison lets the say-and-check clock go)
    mode = m; stopListening(); selfHold?.(); selfHold = null; live.innerHTML = ''; input.innerHTML = ''; el.dataset.mode = m;
    modes.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.m === m));
    line = -1; showHelp(); // the main line again, its help as this mode shows it, and what the tools cost here
    chips(null); showHush();
    ({ speak: speakUI, tiles: tilesUI, type: typeUI, self: selfUI })[m]();
  };
  const tabs = () => {
    modes.innerHTML = '';
    for (const m of modesAvailable()) {
      const b = h('button', 'ks-mode', ICON[m]);
      Object.assign(b, { type: 'button', title: LABEL[m] }); b.dataset.m = m; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', LABEL[m]);
      // the player's own tap opens the next panels this way too (defaultMode): not a format's .click(), which isn't
      // trusted, nor tiles, the help mode (the answer laid out, two stars at most)
      // (a way tapped while quiet is quiet mode's: talking again starts where it did)
      b.onclick = (e) => { if (finished) return; if (e.isTrusted && m !== 'tiles' && !quiet()) ask.chosen = m; setMode(m); };
      modes.append(b);
    }
  };
  tabs();
  // one tap: this panel and the rest of the visit answered with no voice (the mic shut first), or talking again
  hush.onclick = () => { if (finished) return; const on = quiet(!quiet()); toast(on ? '🤫 Quiet till this visit ends: type or tap your answers.' : 'Talking again.', 2600); };
  // switched here or anywhere else (Settings, another panel): the tabs as quiet mode allows, and this panel's way with them
  const requiet = () => { if (finished) return; tabs(); if (!quiet() || mode === 'speak' || mode === 'self') setMode(defaultMode()); else { modes.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.m === mode)); showHush(); } };
  addEventListener('ks:quiet', requiet);

  // The microphone holds the clock until its try ends; stopped any other way than your own "done" (another mode, the
  // panel over), it lets go at once, so a recogniser slow to wind down can't leave the clock frozen. Until it has wound
  // down, a tap doesn't start another one over it.
  let micHold = null, micSay = null, closing = null, selfHold = null;
  function stopListening(mine) {
    if (listening) { closing = listening; listening.stop(); listening = null; if (micSay) micSay.textContent = 'Checking…'; }
    if (!mine) { micHold?.(); micHold = null; }
    el.classList.remove('ks-listening'); hear.disabled = false; opts.onListen?.(false);
  }

  function speakUI() {
    const btn = h('button', 'ks-mic', `${ICON.speak}<span>Tap and say it</span>`), say = (micSay = btn.querySelector('span'));
    btn.type = 'button';
    input.append(btn);
    btn.onclick = async () => {
      if (finished || closing) return;
      if (listening) return stopListening(true);
      audio.stopAll(); audio.sfx('listen'); audio.buzz(15);
      micHold = hold();
      el.classList.add('ks-listening'); hear.disabled = true; say.textContent = 'Listening… tap when done'; // the model would talk into the mic
      opts.onListen?.(true);
      live.innerHTML = '<span class="ks-live-dots">…</span>';
      const l = (listening = speech.listen({ beat, onInterim: (t) => { if (listening !== l) return; live.innerHTML = ''; live.append(h('span', 'ks-interim', esc(t))); } }));
      const res = await l.done;
      if (closing === l) closing = null;
      if (listening !== l && listening) return;
      listening = null; micHold?.(); micHold = null; el.classList.remove('ks-listening'); hear.disabled = false; opts.onListen?.(false);
      say.textContent = 'Tap and say it';
      // over meanwhile, or another mode took the mic away: what it heard doesn't count
      if (finished || !btn.isConnected) return;
      if (!res.alts.length) {
        if (res.error === 'not-allowed' || res.error === 'service-not-allowed' || res.error === 'unavailable') {
          modes.querySelector('[data-m=speak]')?.remove(); setMode('self');
          return tell(`<span class="ks-warn">${esc(speech.whyNot() || 'The microphone is off.')} Say it aloud and check it instead.</span>`);
        }
        // a recogniser that stopped answering may come back: the quiet way for now, the microphone still a tap away
        if (res.error === 'stalled' || res.error === 'audio-capture') {
          setMode('self');
          return tell('<span class="ks-warn">The microphone isn’t answering. Say it aloud and check it, or switch back to Speak to try again.</span>');
        }
        return tell('<span class="ks-warn">Didn\'t catch that. Tap and try again.</span>');
      }
      verdict(match.judge(res.alts, beat));
    };
  }

  // The characters that tempt for a line's gaps, most tempting first: the beat's own decoys (its writer's homophones),
  // ones that sound like a missing character, ones from its other answers, and the scene's words to make up the number.
  // Not a need word's characters from elsewhere: those can make another right answer (你说 beside 您说).
  function nearMisses(o, S, gaps) {
    const want = new Set(gaps.map((k) => S[k])), needs = (o.need || []).flat().join(''), out = [], n = gaps.length > 2 ? 4 : 3;
    const add = (c, mine) => { if (c && out.length < n && HAN.test(c) && !want.has(c) && !out.includes(c) && (mine || !needs.includes(c))) out.push(c); };
    [...(o.decoys || beat.decoys || []).join('')].forEach((c) => add(c, true));
    // each gap as the build reads it in this line (还 hái, not huán)
    const T = match.target(o.ans?.[0] || {}), rs = {};
    let j = 0;
    S.forEach((c, k) => { if (HAN.test(c)) { rs[k] = T[j]?.ch === c ? T[j].rs[0] : (match.readings(c) || [''])[0]; j++; } });
    const like = shuffle([...gaps]).map((k) => soundsLike(S[k], rs[k] || ''));
    while (out.length < n && like.some((l) => l.length)) like.forEach((l) => add(l.shift()));
    shuffle((o.ans || []).slice(1)).forEach((e) => [...(e.zh || '')].filter((c) => !S.includes(c)).forEach((c) => add(c)));
    shuffle([...(opts.decoys || [])]).forEach((w) => [...w].forEach((c) => add(c)));
    return out;
  }

  // Tiles: the line stays up with its key words blanked (a cloze), and you fill the gaps from tiles that tempt (above).
  // Two stars at most: the words are there to be recognised, not recalled.
  function tilesUI() {
    const pickAlt = (i) => {
      line = i; pressChips();
      if (hint) showHelp();
      const o = option(), S = [...o.answers[0]], F = [...match.frame(o)];
      let gaps = S.map((c, k) => (F[k] === '＿' && c !== '＿' ? k : -1)).filter((k) => k >= 0);
      if (!gaps.length) gaps = S.map((c, k) => (HAN.test(c) ? k : -1)).filter((k) => k >= 0); // nothing blanked: it's all to build
      const slot = new Map(gaps.map((k, s) => [k, s])), words = gaps.map((k) => S[k]), fill = gaps.map(() => null);
      const tiles = shuffle([...words.map((w, i) => ({ w, i })), ...nearMisses(o, S, gaps).map((w) => ({ w, i: -1 }))]);
      input.innerHTML = '';
      const row = h('div', 'ks-tiles-line'), cloze = h('div', 'ks-cloze'), pool = h('div', 'ks-tiles-pool');
      cloze.lang = 'zh-CN'; row.append(cloze);
      if (window.KS_SIM || window.KS_SAY) row.dataset.words = words.join('|');
      // keyboard: a tile that's used up can't keep focus, so it passes to the next one still in the pool
      const nextTile = (b) => { const all = [...pool.children], k = all.indexOf(b); return all.slice(k + 1).concat(all.slice(0, k)).find((x) => !x.disabled); };
      const redraw = () => {
        cloze.innerHTML = '';
        const next = fill.indexOf(null);
        S.forEach((c, k) => {
          if (!slot.has(k)) return cloze.append(c);
          const s = slot.get(k), t = fill[s];
          if (!t) return cloze.append(h('span', 'ks-slot' + (s === next ? ' ks-slot-next' : ''), '＿'));
          // a filled gap: tap it to take the character back out
          const b = h('button', 'ks-slot ks-tile-in', esc(t.w)); b.type = 'button'; b.lang = 'zh-CN';
          b.onclick = () => { const had = document.activeElement === b; fill[s] = null; t.btn.disabled = false; redraw(); if (had) t.btn.focus(); };
          cloze.append(b);
        });
      };
      for (const t of tiles) {
        const b = h('button', 'ks-tile', esc(t.w)); b.type = 'button'; b.lang = 'zh-CN'; t.btn = b;
        b.onclick = () => {
          const s = fill.indexOf(null);
          if (s < 0) return;
          if (document.activeElement === b) nextTile(b)?.focus();
          fill[s] = t; b.disabled = true; audio.sfx('pop'); redraw();
          if (fill.includes(null)) return;
          // the line as one of its answers writes it: anything else in the gaps, however close it sounds, isn't it
          const said = S.map((c, k) => (slot.has(k) ? fill[slot.get(k)].w : c)).join(''), m = o.answers.findIndex((a) => a.replace(NOT_HAN, '') === said.replace(NOT_HAN, ''));
          if (m >= 0) return verdict({ ok: true, perfect: true, alt: line, score: 1, heard: said, answer: m, marks: [...(o.ans?.[m]?.zh || said)].filter((c) => HAN.test(c)).map(() => 'ok'), tones: [], chars: [], missing: [], note: '', entry: o.ans?.[m] }, { maxStars: 2 });
          // a key word of one sound put in as another character of that sound (拉 for 辣), with nothing else amiss: the
          // judge's slip, which passes with the right character shown, a star below the right tile (telling them apart
          // is what these tiles test: the near misses are those very characters)
          const j = match.judge([said], beat, { typed: true }), sl = j.tones.filter((t) => t.heard);
          if (j.ok && j.slip && j.alt === line && [...said].every((c, k) => c === S[k] || sl.some((t) => t.ch === S[k] && t.heard === c))) return verdict(j, { maxStars: 1 });
          tries++;
          tell(`<span class="ks-warn">${fill.some((x) => x.i < 0) ? 'One of those doesn’t belong.' : 'Right characters, wrong order.'} Try again${secs ? ' (−2 s)' : ''}.</span>`);
          el.classList.add('ks-shake', 'ks-wrong'); audio.sfx('no'); audio.buzz(40); penalty(2);
          setTimeout(() => el.classList.remove('ks-wrong'), 600); // the line goes red: a cue that doesn't move (reduced motion)
          setTimeout(() => {
            el.classList.remove('ks-shake');
            const had = row.contains(document.activeElement) || pool.contains(document.activeElement) || document.activeElement === document.body;
            fill.forEach((x, k) => { if (x) x.btn.disabled = false; fill[k] = null; }); redraw();
            if (had && pool.isConnected) pool.querySelector('.ks-tile')?.focus({ preventScroll: true });
          }, 450);
        };
        pool.append(b);
      }
      redraw();
      input.append(row, pool);
    };
    chips(pickAlt);
    pickAlt(-1);
  }

  // vv: a phone keyboard covers the bottom of the screen, where this panel sits; lift the panel above it
  const vv = window.visualViewport, lift = () => { el.style.transform = vv ? `translateY(${-Math.max(0, innerHeight - vv.height - vv.offsetTop)}px)` : ''; };
  function typeUI() {
    const f = h('form', 'ks-type');
    // (quiet mode's typing: pinyin, or characters where the player reads at level 2 or more)
    f.innerHTML = `<input type="text" lang="zh-CN" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" placeholder="${quiet() && learner.level().read < 2 ? 'pinyin, or 汉字' : '汉字, or pinyin'}" aria-label="Type your answer"><button type="submit">Send</button>`;
    const i = f.querySelector('input');
    // The clock starts when the keyboard is up (an iPhone won't raise it without a tap), then runs while you type; a
    // reply still being typed when it ends gets up to 8 s more, and one cut off is put back in the next try's field.
    let wake = hold(); const up = () => { wake?.(); wake = null; }; setTimeout(up, ms(8000));
    i.addEventListener('focus', up, { once: true }); i.addEventListener('input', up, { once: true });
    i.addEventListener('input', () => { typedAt = Date.now(); ask.carry[opts.id || beat.id] = i.value; });
    if (attempt > 1 && ask.carry[opts.id || beat.id]) i.value = ask.carry[opts.id || beat.id];
    typing = i;
    i.onfocus = () => { vv?.addEventListener('resize', lift); setTimeout(lift, 250); };
    i.onblur = () => { vv?.removeEventListener('resize', lift); el.style.transform = ''; };
    f.onsubmit = (e) => {
      e.preventDefault();
      if (!i.value.trim()) return;
      const v = match.judge([i.value], beat, { typed: true }), pinyinOnly = !/[一-鿿]/.test(i.value);
      if (v.heard) v.heard = i.value.trim(); // shown and kept as typed: the judge's copy has ， as , and 3 spelled 三
      // a slip of character or tone (拉 for 辣) still passes, at two stars, so spaced review brings the line back
      if (v.ok) verdict(v, { maxStars: pinyinOnly || v.slip || v.chars.length || v.tones.length ? 2 : 3, pinyinOnly }); else { verdict(v); i.select(); }
    };
    input.append(f);
    setTimeout(() => i.focus({ preventScroll: true }), 60);
  }

  function selfUI() {
    const box = h('div', 'ks-self');
    // with the answer up already (after a miss, or help given from the start) the button checks against it
    box.innerHTML = `<p>Say it out loud, then check.</p><button type="button" class="ks-btn ks-reveal">${hint >= 2 ? 'Check' : 'Show me'}</button>`;
    input.append(box);
    let shown = false, release = null, shownAt = 0;
    // the second tap of a quick double tap on Show me lands on the rating that took its place: not a rating yet
    const early = () => Date.now() - shownAt < ms(400);
    const reveal = () => {
      if (finished) return;
      shown = true; shownAt = Date.now(); selfHint ??= hint; hint = 2; showHelp();
      release ??= (selfHold = hold()); // comparing what you said with the answer isn't thinking time: the clock waits for your rating
      const o = option(), gold = help.querySelector('.ks-help-full .ks-gold'); // the honest check has a criterion: those words
      box.innerHTML = `<div class="ks-self-q">${gold ? 'Did you say the <span class="ks-gold">gold words</span>?' : 'Did you say something like that?'}</div><div class="ks-self-row"><button type="button" class="ks-btn ks-yes">Nailed it</button><button type="button" class="ks-btn ks-btn-quiet ks-close">Close</button><button type="button" class="ks-btn ks-btn-quiet ks-no">Missed it</button></div>`;
      const said = { ok: true, perfect: false, self: true, alt: line, marks: [], tones: [], chars: [], missing: [], note: '', entry: o.ans?.[0] };
      // all three stars when it was said with no help: the clock and your honesty are the check
      box.querySelector('.ks-yes').onclick = () => { if (early()) return; release?.(); verdict(said); };
      box.querySelector('.ks-close').onclick = () => { if (early()) return; release?.(); verdict(said, { maxStars: 2 }); };
      // a miss like any other (the story reacts, the chaser lunges, the clock pays its 2 s), then one more go for a star,
      // with time to say it again: at least 8 s on the clock, or an honest miss late in it is only a time-out to come
      box.querySelector('.ks-no').onclick = () => {
        if (early()) return;
        release?.(); release = null; tries++;
        opts.onMiss?.({ ok: false, self: true, heard: '', missing: [], chars: [], tones: [], note: '', alt: line });
        audio.sfx('no'); audio.buzz(40);
        if (secs) { left = Math.max(Math.min(secs, 8), left - 2); draw(); }
        el.classList.add('ks-shake'); setTimeout(() => el.classList.remove('ks-shake'), 450);
        selfHint = 2; input.innerHTML = ''; selfUI();
      };
      box.querySelector('.ks-yes').focus({ preventScroll: true });
      voice(o);
    };
    box.querySelector('.ks-reveal').onclick = reveal;
    // an or-chip picks which line you're checking: Show me shows (and says) that one
    chips((i) => { line = i; pressChips(); if (shown) reveal(); else if (hint) showHelp(); });
  }

  // ---------- the verdict ----------
  function marked(v) {
    const entry = v.entry || beat.ans?.[0];
    if (!entry || !v.marks?.length) return '';
    let k = 0;
    return `<span class="ks-marked" lang="zh-CN">${entry.zh.split('').map((c) => (/[一-鿿]/.test(c) ? `<span class="ks-m-${v.marks[k++] || 'ok'}">${esc(c)}</span>` : esc(c))).join('')}</span>`;
  }
  // A tone the recogniser wrote otherwise is a check, not a verdict (it picks characters from the sentence around them,
  // not from your voice): the two to compare, each to hear. Typed, the wrong tone is the player's own.
  const sayIt = (c, py) => `<button type="button" class="ks-say" data-say="${esc(c)}"><span lang="zh-CN">${esc(c)}</span> ${esc(py)} <span aria-hidden="true">🔊</span></button>`;
  const toneNote = (t) => (mode !== 'speak' ? `${esc(t.ch)} is <b>${esc(t.want)}</b>, not ${esc(t.got)}`
    : `The recogniser wrote ${t.heard ? `<span lang="zh-CN">${esc(t.heard)}</span> ` : ''}${esc(t.got)}. Compare ${sayIt(t.ch, t.want)}${t.heard ? ` ${sayIt(t.heard, t.got)}` : ''}`);
  // The characters that only sound right, put right big, where they can't be missed: the judge's slip (a key word of one
  // sound in another character, its note: 辣 là (hot), not 拉 lā (pull)) and, typed or built, each other homophone it
  // lists (chars) or character in another tone (tones, with what was put in), once. Spoken, only a slip: the recogniser
  // chose the characters. → the tones these leave for the tone notes, and the line (with `id`, for the verdict to point at)
  function fixes(v, id = '') {
    const note = (v.slip && v.note) || '', mine = mode !== 'speak', inNote = (t) => t.heard && note.includes(t.ch) && note.includes(t.heard);
    const fs = mine ? [...(v.chars || []), ...(v.tones || []).filter((t) => t.heard && !inNote(t)).map((t) => ({ want: t.ch, got: t.heard, py: t.want }))].filter((x, k, a) => a.findIndex((y) => y.want === x.want && y.got === x.got) === k) : [];
    const big = (s) => s.replace(/\([^)]*\)|(not )?([一-鿿]+)/g, (m, no, c) => (!c ? m : no ? `not <s lang="zh-CN">${c}</s>` : `<b lang="zh-CN">${c}</b>`)); // not a gloss's own Chinese: 啦 la (了 + 啊…)
    const parts = [...(note ? [big(esc(note))] : []), ...fs.map((x) => big(esc(`${x.want} ${x.py || ''}, not ${x.got}`)))];
    return { tones: (v.tones || []).filter((t) => !inNote(t) && !(mine && t.heard)), html: parts.length ? `<div class="ks-fix"${id && ` id="${id}"`}>${parts.map((p) => `<span>${p}</span>`).join('')}</div>` : '' };
  }
  // What was said or typed, with the characters the closest of the line's answers lacks in red (an added 不 is the
  // whole difference). Lined up in order, so a 不 too many shows even where the answer has one, and one only out of place
  // doesn't; heard, a character with the answer's sound (接 for 借) is the recogniser's choice, not yours.
  function heardLine(v) {
    const A = [...v.heard], o = v.alt >= 0 ? beat.alts[v.alt] : beat;
    const syl = (c) => (match.readings(c) || []).map((r) => r.slice(0, -1)), eq = (a, b) => a === b || (mode === 'speak' && HAN.test(a) && syl(b).includes(syl(a)[0]));
    const reds = (e) => {
      const B = [...(e?.zh || '')].filter((c) => HAN.test(c)), L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0)), odd = [], spare = [];
      for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = eq(A[i], B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      let i = 0, j = 0;
      while (i < A.length) if (j < B.length && eq(A[i], B[j])) { i++; j++; } else if (j >= B.length || L[i + 1][j] >= L[i][j + 1]) odd.push(i++); else spare.push(B[j++]);
      spare.push(...B.slice(j));
      return new Set(odd.filter((k) => { const s = spare.findIndex((b) => eq(A[k], b)); if (s >= 0) spare.splice(s, 1); return s < 0 && HAN.test(A[k]); }));
    };
    // against the answer it was matched with, unless another of the line's answers leaves fewer marks (能借您的… is
    // matched by sound with 能借你的…, but 您 is the model's own)
    const red = [v.entry || o.ans?.[0], ...(o.ans || [])].map(reds).reduce((a, b) => (b.size < a.size ? b : a));
    return A.map((c, k) => (red.has(k) ? `<mark>${esc(c)}</mark>` : esc(c))).join('');
  }
  function verdict(v, { maxStars = 3, pinyinOnly = false } = {}) {
    if (finished) return;
    if (v.heard) heardAll.push(v.heard);
    const as = mode === 'type' ? 'You typed' : 'Heard', fix = fixes(v, `${uid}-f`);
    if (!v.ok) {
      tries++;
      opts.onMiss?.(v);
      audio.sfx('no'); audio.buzz(40); penalty(2);
      const miss = v.missing.map((w) => glossOf(w, v.alt >= 0 ? beat.alts[v.alt] : beat)).filter(Boolean);
      tell(`<div class="ks-heard">${v.heard ? `${as}: <span lang="zh-CN">${heardLine(v)}</span>` : ''}</div>` + fix.html +
        (v.slip ? '' : v.note ? `<div class="ks-note">${esc(v.note)}</div>` : miss.length ? `<div class="ks-note">Missing the word for “${esc(miss.join('”, “'))}”.</div>` : '') +
        // a real reply the answer lists don't know yet needn't be a dead end (count, below); not one the judge failed for
        // a reason it names (the opposite, a not, a mistake, a slip)
        (v.heard && !v.note && (mode === 'speak' || mode === 'type') ? '<button type="button" class="ks-tool ks-count">That should count</button>' : ''));
      live.querySelector('.ks-count')?.addEventListener('click', () => count(v));
      el.classList.add('ks-shake'); setTimeout(() => el.classList.remove('ks-shake'), 450);
      return;
    }
    const hl = v.self && selfHint != null ? selfHint : hint;
    // tones: the tone notes a spoken line's verdict shows (the recogniser heard another tone), what the learner reads T by
    answered(hl, { perfect: !!v.perfect, slip: !!v.slip, self: !!v.self, counted: !!v.counted, pinyin: pinyinOnly, chars: v.chars?.length || 0, tones: mode === 'speak' ? fix.tones.length : 0 });
    finished = true; clearInterval(ticker); clearInterval(idler); stopListening();
    let stars = Math.min(maxStars, capFor(hl, heardModel));
    if (!v.perfect && !v.self && stars === 3) stars = 2;
    stars = Math.max(1, stars);
    out = { res: 'ok', stars };
    // pinyin typed from memory is recall: review moves it up, though the panel keeps its third star for characters
    // help given free (an assist's frame or answer) caps what review counts: 2★ for the frame, 1★ for the answer
    const kept = Math.min(freeHint >= 2 ? 1 : freeHint >= 1 ? 2 : 3, pinyinOnly && v.perfect && capFor(hl, heardModel) === 3 ? 3 : stars), then = opts.id && !BESIDE.includes(opts.log?.task) ? thenNow(opts.id, Math.min(kept, stars)) : '';
    if (opts.id) srs.record(opts.id, kept);
    audio.sfx('yes'); audio.buzz(20);
    opts.onVerdict?.(v, stars);
    const model = tgt.ans?.[0], alt = v.alt >= 0 ? beat.alts[v.alt] : null, said = v.entry || (alt || tgt).ans?.[0];
    // the answer said, among the main line's (-1: an or-branch, or a reply counted)
    const saidK = alt || v.counted ? -1 : (beat.ans || []).findIndex((e) => e.zh === said?.zh);
    // what was really said or typed, over the answer it was matched with (unless they're the same words)
    const own = (mode === 'speak' || mode === 'type') && v.heard && v.heard.replace(NOT_HAN, '') !== (said?.zh || '').replace(NOT_HAN, '');
    el.classList.add('ks-done');
    // role=img so the label is read (and it starts with the digit: chase.js reads the stars from it). A self-check's
    // line is there plain (what was said is yours to judge): the words its tip talks about.
    el.innerHTML = `<div class="ks-win"><div class="ks-stars" id="${uid}-s" role="img" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></div>
      ${then ? `<div class="ks-then">${esc(then.replace(/Today.*/, ''))}<b>${esc(then.match(/Today.*/)[0])}</b></div>` : ''}
      ${cue && !v.self ? `<div class="ks-win-mission">${esc(full)}</div>` : ''}
      ${fix.html}
      ${own ? `<div class="ks-heard">${as}: <span lang="zh-CN">${heardLine(v)}</span></div>` : ''}
      <div class="ks-win-said" id="${uid}-w">${v.counted ? '' : v.self ? `<span lang="zh-CN">${esc((v.entry || beat.ans?.[0])?.zh || '')}</span>` : marked(v)}</div>
      ${fix.tones.length ? `<div class="ks-note ks-note-tone">${fix.tones.map(toneNote).join('<br>')}</div>` : ''}
      ${v.note && !v.slip ? `<div class="ks-note">${esc(v.note)}</div>` : ''}
      ${pinyinOnly ? '<div class="ks-note">Pinyin counts. Type the characters for a third star.</div>' : ''}
      ${v.counted ? '<div class="ks-note">Counted, for one star, and kept under Your phrases to add to the answers.</div>' : ''}
      ${!alt && model && !v.self && (v.counted || (!v.perfect && saidK !== pick)) ? `<div class="ks-model">Natural: <span class="ks-model-zh"></span> <button type="button" class="ks-tool ks-replay" aria-label="Hear it">🔊</button></div>` : ''}
      ${beat.tip && !alt ? `<div class="ks-tip">${esc(beat.tip)}</div>` : ''}
      <button type="button" class="ks-next" aria-describedby="${uid}-s ${fix.html ? `${uid}-f ` : ''}${uid}-w">Continue</button></div>`;
    if (el.querySelector('.ks-model-zh')) el.querySelector('.ks-model-zh').append(zh(model.t, { pinyin: 'all', count: false }));
    el.querySelector('.ks-replay')?.addEventListener('click', () => voice(tgt));
    // the other ways to say it, any one yours with a tap (tapped again: back to the story's own); not in a fast format
    if (!opts.quick && !alt && !v.counted && saidK >= 0) {
      const pickHere = (k) => {
        k = k === pick ? 0 : k; pick = k; makeMine(opts.id || beat.id, beat, k); tgt = ownLine(beat, k);
        el.querySelectorAll('.ks-other').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.k === k));
        voice(tgt); toast(k ? 'Your line from now on.' : 'Back to the story’s own line.', 1800);
      };
      el.querySelector('.ks-next').before(others(pick, pickHere, saidK));
    }
    el.querySelectorAll('.ks-say').forEach((b) => (b.onclick = () => speech.sayWord(b.dataset.say)));
    const next = el.querySelector('.ks-next');
    next.onclick = () => settle({ result: 'ok', alt: v.alt, stars, verdict: v, mode });
    // It moves on by itself after time to read the notes (their English; the Chinese and pinyin are read at a glance),
    // never with No clock, and not once you touch it: you're reading, or hearing it again.
    const n = [...el.querySelectorAll('.ks-note, .ks-tip, .ks-fix, .ks-then')].reduce((k, e) => k + e.textContent.length, 0); // the mission was read already
    // (and a moment more for the other ways to say it)
    if (pressure !== 'relaxed') auto = setTimeout(next.onclick, ms(opts.quick ? 1000 + n * 25 : 2000 + n * 50 + (el.querySelector('.ks-other') ? 1500 : 0))); // a fast format's at a glance
    const stay = () => clearTimeout(auto);
    el.addEventListener('pointerdown', stay, { once: true }); el.addEventListener('keydown', stay, { once: true });
    announce(`${stars} of 3 stars.${then ? ` ${then}` : ''}`, said?.zh || '');
    next.focus({ preventScroll: true });
    el.addEventListener('focusin', stay, { once: true }); // only after that focus(), or it would hold every verdict
  }

  // "That should count": a reply the answer lists don't know yet passes, at one star, and goes on a list (Your phrases)
  // to add to them, so a real answer isn't a dead end. It takes the main line: an or-branch has to be said as listed.
  function count(v) {
    if (finished) return;
    const k = JSON.stringify([opts.id || beat.id, v.heard]);
    if (!marks.has('counted', k)) marks.toggle('counted', k);
    verdict({ ...v, ok: true, perfect: false, counted: true, alt: -1, marks: [], tones: [], chars: [], slip: null, note: '', entry: tgt.ans?.[0] }, { maxStars: 1 });
  }

  function finish(result) {
    if (finished) return;
    answered(hint);
    finished = true; clearInterval(ticker); clearInterval(idler); stopListening();
    // a reply on its way (typed, or tiles placed) is a try, not silence: chats don't block a slow typist
    const r = { result, alt: -1, stars: 0, mode, tried: tries > 0 || !!typing?.value.trim() || !!el.querySelector('.ks-tile-in') };
    if (result !== 'timeout') return settle(r);
    out = { res: 'timeout', stars: 0 };
    if (opts.id) srs.record(opts.id, 0);
    audio.sfx('buzz'); audio.buzz(80);
    el.inert = true; // nothing more counts, and a late tap mustn't open the mic over the fail line
    el.classList.add('ks-timeout');
    mission.textContent = 'Time\'s up!';
    announce('Time\'s up!');
    later = setTimeout(() => settle(r), ms(700));
  }
  // Every way out ends here, once: the panel goes, its timers and sounds stop, and the promise resolves.
  function settle(r) {
    if (settled) return;
    settled = finished = true;
    answered(hint);
    // with the help that was free (the learner counts only help beyond it); the rung it was asked at comes in opts.log
    // (assist.js askOpts: { assist, free }), and so does what a format showed before the panel (a chase's new phrase)
    events.line({ heard: heardAll, id: opts.id || beat.id, lv: level, mode: r.mode, att: attempt, hint: used.help, hear: heardModel, tries, res: out?.res ?? (r.result === 'cancel' && typeof opts.signal?.reason === 'string' ? opts.signal.reason : r.result), stars: out?.stars ?? r.stars, alt: r.alt, ms: thinking, clock: secs, ...(r.tried ? { tried: true } : {}), ...(freeHint ? { free: freeHint } : {}), ...Object.fromEntries(Object.entries(used).filter(([k, x]) => k !== 'help' && x)), ...opts.log });
    clearInterval(ticker); clearInterval(idler); clearTimeout(auto); clearTimeout(later); clip?.stop();
    vv?.removeEventListener('resize', lift);
    opts.signal?.removeEventListener('abort', onAbort); removeEventListener('ks:quiet', requiet);
    el.remove();
    resolveFn(r);
  }

  // Stopped from outside (the card was left): cancel, even with the verdict or "Time's up!" still on screen.
  const onAbort = () => (finished ? settle({ result: 'cancel', alt: -1, stars: 0, mode, tried: tries > 0 }) : finish('cancel'));
  opts.signal?.addEventListener('abort', onAbort);
  // already stopped (a run that ended during a fail line): the panel is here for whoever looks, gone before its first tick
  if (opts.signal?.aborted) queueMicrotask(onAbort);
  setMode(mode);
  // echo (the assist's first rung, A5): the model says the line first, free, and the clock waits for it. A format whose
  // own voices may still be talking (a chat's queue) passes a promise of their end instead: the echo waits its turn, and
  // isn't said once the line is answered or the microphone is open.
  if (opts.echo && beat.a) Promise.resolve(opts.echo).then(() => { if (!finished && !listening && !opts.signal?.aborted) voice(tgt); });
  // once a visit, where the phone can't listen: a moment's word on answering without a microphone, worded for the way
  // this panel answers once the format has had its say (a format may switch it just after ask() returns). A visit that
  // opens on a line the format asks to have typed (a scene's writing line, a chase's) isn't the microphone's doing: that
  // says what it is, and leaves the word on the phone's own way to the first panel that answers that way.
  if (!speech.canListen() && !opts.signal?.aborted) setTimeout(() => {
    const told = (ask.told ||= new Set()), write = mode === 'type' && preferred === 'type';
    if (finished || (write ? told.has('write') : told.has('mic') || !NOMIC[mode])) return;
    told.add(write ? 'write' : 'mic'); toast(write ? 'A writing line: type it, in characters or pinyin.' : NOMIC[mode]);
  }, 0);
  // the first 🤫 a phone sees says what it's for (a face alone doesn't), after any word on the microphone has been read
  if (!kv.get('hushTold', 0) && !opts.signal?.aborted) setTimeout(() => {
    if (finished || hush.hidden || kv.get('hushTold', 0)) return;
    kv.set('hushTold', now()); toast('Somewhere you can’t talk? Tap 🤫 to type or tap your answers instead.', 4500);
  }, ms(speech.canListen() ? 1500 : 2600));
  return done;
}

// a reply cut off by the clock, put back in the retry's field (by phrase id)
ask.carry = {};

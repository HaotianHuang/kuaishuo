// Small card types for the Mix feed, between the scenarios:
//   reviewCard  a flash crisis: a phrase you've met comes back in its scene, due on its spaced-review schedule (the
//               phrase as you met it: a level's own line, scn/beat@L, comes back as that line); or ({ bonus }) the
//               bonus: a line a level up from a story still to come, once, where a miss costs nothing
//   shadowCard  hear a line from the cast, then say it just like them
//   writeCard   a word from a scene, traced and then written from memory, stroke by stroke (Hanzi Writer)
// A flash crisis or the bonus dealt at a rung (ctx.assist: the Mix's atLines) plays at it: its clock, help and prompt,
// the text help and the voice before it; without one, as v1 played it.
import * as audio from '../shared/audio.js';
import * as speech from '../shared/speech.js';
import { ask, defaultMode } from '../shared/ask.js';
import { zh, en, h, esc } from '../shared/text.js';
import { srs, settings } from '../shared/store.js';
import { decoys, phraseId, tailor } from '../shared/content.js';
import { atRung } from '../shared/feed.js';
import { wait, ms, now } from '../shared/time.js';
import * as levels from '../shared/levels.js';
import * as learner from '../shared/learner.js';
import { linesToShadow, wordsToWrite } from '../shared/picks.js';
import * as events from '../shared/events.js';
import * as files from '../shared/files.js';
import HanziWriter from '../vendor/hanzi-writer.esm.js';

const HAN = /[一-鿿]/;
// When something comes back, in words: in 3 minutes, in 2 hours, tomorrow, in 3 days.
const when = (t) => {
  const m = Math.max(1, Math.round((t - now()) / 60000)), hr = Math.round(m / 60), d = Math.round(m / 1440);
  return m < 60 ? `in ${m} minute${m > 1 ? 's' : ''}` : m < 1440 ? `in ${hr} hour${hr > 1 ? 's' : ''}` : d === 1 ? 'tomorrow' : `in ${d} days`;
};
const beatOf = (p) => ({ id: p.id.split('/')[1], en: p.en, answers: p.answers, need: p.need, ans: p.ans, a: p.a, slow: p.slow, tip: p.tip });
const nextButton = (ctx) => { const b = h('button', 'ks-btn', 'Next ↓'); b.type = 'button'; b.onclick = () => ctx.next(); return b; };
const canStart = () => (audio.unlocked || audio.running)(); // unlocked(): an iPhone says 'running' only a moment after the tap

// The beat a phrase comes from, as it was played, and its prompt: the voiced step just before it, along the way the
// story goes there (story.run's order, through the right answers), so a review can play that moment again. A level's
// own line (scn/beat@L) is found in its story tailored to that level (content.tailor(): the beat's override merged in,
// under that id, the voices around it the story's own), so it comes back as the line you said, not the base one.
function restage(scn, p) {
  const L = /@(\d+)$/.exec(p.id)?.[1], t = L == null ? scn : tailor(scn, L);
  let hit = null;
  const walk = (list, last) => {
    for (const st of list || []) {
      if (hit) break;
      if (st.say) {
        const b = st.say;
        if (phraseId(t, b) === p.id) { hit = { beat: b, prompt: last }; break; }
        [b.fail, b.miss, ...(b.alts || []).map((a) => a.then)].forEach((l) => walk(l, last));
        last = walk(b.ok, last);
      } else if (st.a && st.t && ('who' in st || 'narr' in st)) last = st;
    }
    return last;
  };
  walk(t.steps, null);
  return hit || { beat: null, prompt: null };
}

// The freeze-frame stamp, as the scenes have it.
function stamp(el) {
  el.querySelectorAll('.ks-rev-stamp').forEach((n) => n.remove());
  const s = h('div', 'ks-rev-stamp', '<b lang="zh-CN">该你了！</b><span>Your turn</span>');
  s.setAttribute('aria-hidden', 'true');
  el.append(s);
  setTimeout(() => s.remove(), 1100);
}

// The answer panel on one of these cards, the card's own picture kept in view just above it (cards.css reads the
// panel's height). cls marks the panel: ks-rev-notiles where tiles would lay out a line meant to come from memory (their
// tab goes, and a panel the player's setting opens in tiles starts in opts.mode instead), ks-rev-practice where nothing
// is scored (no prices on the tools).
async function asking(el, ctx, beat, opts, cls = '') {
  el.classList.add('ks-rev-asking'); ctx.lock(true);
  const p = ask(el, beat, opts), box = [...el.querySelectorAll(':scope > .ks-ask')].pop();
  if (cls) box.classList.add(...cls.split(' '));
  if (box.classList.contains('ks-rev-notiles') && box.dataset.mode === 'tiles') box.querySelector(`.ks-mode[data-m="${opts.mode}"]`)?.click();
  const fit = () => box.isConnected && el.style.setProperty('--ks-rev-ask', `${box.offsetHeight}px`);
  const ro = new ResizeObserver(fit);
  ro.observe(box); fit();
  const r = await p;
  ro.disconnect(); ctx.lock(false); el.classList.remove('ks-rev-asking');
  return r;
}

// ---------- a flash crisis ----------
// A phrase you've met comes back in its scene. Whoever spoke just before it says that line again (their face, name
// and subtitle), the stamp lands, and you answer from memory with the beat's short cue (Hint spells out the mission).
// With no microphone it's typed, the best recall there is without one, on twice the clock. A slip puts the answer up,
// and you say it (or type it) once before moving on. The phrase is the one you met, at its level (scn/beat@L: that
// level's line, its clock: none at L0).
// bonus: the bonus line (rank.js PL3), a level or two up from a story still to come, dealt once after a strong card: the
// same moment, labelled as the bonus it is ("Bonus · a level-3 line", and how far up that is from the level you say at,
// as Settings → Your Chinese shows it), with the story's setting, since its line comes without the story before it,
// where a miss costs nothing (the answer goes up for you to say once, as after a review's slip). It's a first meeting,
// so its row says task 'bonus', not 'review' (the learner model counts it whole), and skipped it's still never met.
export function reviewCard(el, p, ctx, { bonus = false } = {}) {
  const scn = ctx.data.byId[p.scn], { beat, prompt } = restage(scn, p), [c1, c2] = scn.bg || ['#3a1d2e', '#8a2b4a'], lv = levels.of(p.level ?? scn.level);
  // who says the prompt (nobody, for a narrator's line); a call's first beat has no prompt, only the phone ringing
  const who = prompt ? scn.cast[prompt.who] : scn.call ? scn.cast[scn.call.caller] : null;
  const b = { ...(beat || beatOf(p)), alts: [] }; // the phrase itself: an or-branch isn't what's being reviewed
  let ac = null, line = null, clock = null;
  // (the bonus: how many levels up from the say level shown in Settings, its floor; at the top, none)
  const up = bonus ? lv - Math.floor(Math.min(levels.MAX, Math.max(0, learner.level().say))) : 0;
  el.classList.add('ks-rev');
  if (bonus) el.classList.add('ks-rev-bonus');
  el.style.background = `radial-gradient(120% 80% at 50% 0%, ${c2}, ${c1} 60%, #0f0d13)`;
  el.innerHTML = `<div class="ks-rev-top"><span class="ks-rev-label">${bonus ? `Bonus · a level-${lv} line` : 'Flash crisis'}</span><span class="ks-rev-from" lang="zh-CN">${esc(scn.stage || '')} ${esc(scn.title)} · ${esc(scn.title_en)}</span></div>
    <div class="ks-rev-emoji" aria-hidden="true">${esc(who?.emoji || scn.stage || '⚡')}</div>
    <div class="ks-rev-sub"><div class="ks-rev-who"><b lang="zh-CN">${esc(who?.name || '')}</b>${who?.phone ? '<i aria-label="on the phone">📞</i>' : ''}<button type="button" class="ks-rev-again" title="Hear that again" aria-label="Hear that line again">↻</button></div></div>
    <p class="ks-rev-q">${bonus ? (up > 0 ? `One from ${up > 1 ? `${up} levels` : 'a level'} up!` : 'One from a story to come!') : 'It\'s happening again.'}</p>${bonus ? `<p class="ks-rev-note">${scn.setting ? `${esc(scn.setting)} ` : ''}A line from this story, still to come${up > 0 ? ', harder than you\'ve been playing' : ''}. Have a go: a miss costs nothing.</p>` : ''}
    <button type="button" class="ks-btn ks-rev-go" data-test-go>${bonus ? 'Have a go' : 'I\'m ready'}</button>`;
  const go = el.querySelector('.ks-rev-go'), sub = el.querySelector('.ks-rev-sub'), q = el.querySelector('.ks-rev-q'), note = el.querySelector('.ks-rev-note'), again = el.querySelector('.ks-rev-again');
  if (!prompt) again.remove();
  // their line (slower where the card's rung slows the other characters: ctx.assist); again mid-answer, the clock
  // waiting for it
  const say = async () => { const release = clock?.hold(); line?.stop(); const l = (line = audio.play(scn.audio, prompt.a, { rate: ctx.assist?.knobs.rate })); await l.done; release?.(); };
  again.onclick = say;
  const intro = (on) => { go.hidden = q.hidden = !on; if (note) note.hidden = !on; sub.hidden = on; };
  function idle() {
    el.dataset.state = 'idle';
    intro(true);
    el.querySelectorAll('.ks-rev-out, .ks-rev-stamp').forEach((n) => n.remove());
  }
  async function start() {
    ac?.abort(); const signal = (ac = new AbortController()).signal;
    intro(false); el.dataset.state = 'playing';
    el.querySelectorAll('.ks-rev-out').forEach((n) => n.remove());
    // their line, drawn now (not 'seen' till then), with the help the card has: its rung's (atLines sets the text help
    // as it comes on screen), else v1's, whatever the card before it had
    if (prompt) sub.replaceChildren(sub.querySelector('.ks-rev-who'), zh(prompt.t, { cls: 'ks-rev-line', count: false }), en(prompt.en || prompt.narr));
    if (prompt) await say(); else if (scn.call) { audio.sfx('ring'); await wait(1600, signal); }
    if (signal.aborted) return;
    stamp(el); audio.sfx('drum'); audio.buzz(25);
    await wait(520, signal);
    if (signal.aborted) return;
    const typed = !speech.canListen(), opening = typed && settings.get('input') === 'auto' ? 'type' : defaultMode(), secs = lv === 0 ? 0 : b.time || levels.clock(lv);
    // at the card's rung where it has one (its clock, help, echo, prompt; the row says the rung), else v1's
    const r = await asking(el, ctx, b, atRung(ctx.assist, {
      id: p.id, level: lv, audio: p.audio, decoys: decoys(scn), signal, skin: 'flash', cue: b.cue, mode: typed ? 'type' : undefined,
      time: ['tiles', 'type'].includes(opening) && secs ? secs * 2 : undefined, // double what ask() would give (L0 has no clock)
      control: (c) => (clock = c), log: { task: bonus ? 'bonus' : 'review' }, // recall after a while: the learner counts it half (the bonus, a first meeting: whole)
    }));
    clock = null;
    if (r.result === 'cancel' || signal.aborted) return;
    if (r.result === 'skip' && !bonus) srs.record(p.id, 0); // skipped is forgotten: back to the first box
    const ok = r.result === 'ok', due = srs.get(p.id)?.due || now();
    // one star (the answer shown or heard) passes, but drops the phrase a box
    const out = h('div', 'ks-rev-out', bonus
      ? (ok ? `<b>${r.stars > 1 ? 'A level up, nailed!' : 'Got there, with help.'}</b><span>It's yours now: back ${when(due)}.</span>` : `<b>Not this time.</b><span>A bonus: missing it costs nothing.</span>`)
      : ok ? `<b>${r.stars > 1 ? 'Still got it.' : 'With help, this time.'}</b><span>Back ${when(due)}.</span>` : `<b>It slipped.</b><span>It'll come back ${when(due)}.</span>`);
    el.append(out);
    if (!ok) {
      const typing = r.mode === 'type';
      const r2 = await asking(el, ctx, b, { level: lv, audio: p.audio, signal, skin: 'flash', hint: 2, free: true, time: 0, giveUpAfter: 30, log: { id: p.id, task: 'practice' },
        mode: typing ? 'type' : 'self', mission: `Now ${typing ? 'type' : 'say'} it once, with the answer in front of you.` }, 'ks-rev-notiles ks-rev-practice');
      if (r2.result === 'cancel' || signal.aborted) return;
      out.append(zh(p.t, { pinyin: 'all', count: false, cls: 'ks-rev-ans' })); // and it stays up, to take with you
    }
    out.append(nextButton(ctx));
    el.dataset.state = 'done';
  }
  go.onclick = () => { audio.unlock(); start(); };
  idle();
  return {
    // a flash crisis starts as it comes on screen; the bonus waits to be taken up (Have a go), so what it is (a level
    // up, nothing to lose) is read before it's tried, and a swipe past it is a pass
    enter() { if (!bonus && canStart() && el.dataset.state === 'idle') start(); },
    // stopAll() can't reach a line that is only a timer (voices off) or still loading, so stop this one by hand
    leave() { ac?.abort(); line?.stop(); audio.stopAll(); ctx.lock(false); if (el.dataset.state !== 'done') idle(); },
    destroy() { ac?.abort(); line?.stop(); },
  };
}

// ---------- shadowing: hear a native line, say it the same way ----------
export { linesToShadow, wordsToWrite }; // (picks.js: DOM-free, so the ranker deals them too)
// The line plays with its text hidden (a dot for each syllable keeps time with it), Again as often as you like, and
// then you say it along and check yourself, or the microphone checks the whole line: every word in it that carries
// something has to be heard (not 了 or 吗). No tiles: they'd spell out the line.
const LIGHT = /^[了吗呢吧啊呀嘛哦的地得着过啦哈嗯哎]$/;
export function shadowCard(el, item, ctx) {
  const { scn, step } = item, who = scn.cast[step.who] || {}, n = [...step.zh].filter((c) => HAN.test(c)).length;
  const beat = { id: 'shadow', en: `Say it just like ${who.name || 'them'}.`, answers: [step.zh, step.zh.replace(/[^\u4e00-\u9fff0-9A-Za-z]/g, '')], // and unpunctuated, as a recogniser writes it: 没有，给你 isn't 没有给你
    need: step.t.filter((t) => t.length > 1 && !LIGHT.test(t[0])).map((t) => [t[0]]), ans: [{ zh: step.zh, py: step.py, t: step.t }], a: step.a, slow: step.a };
  let ac = null, line = null, clock = null;
  el.classList.add('ks-rev', 'ks-shadow');
  el.style.background = `radial-gradient(120% 80% at 50% 0%, ${(scn.bg || [])[1] || '#244a3a'}, #0f0d13 70%)`;
  el.dataset.state = 'idle';
  el.innerHTML = `<div class="ks-rev-top"><span class="ks-rev-label">Shadow it</span><span class="ks-rev-from" lang="zh-CN">${esc(scn.title)} · ${esc(scn.title_en)}</span></div>
    <div class="ks-shadow-who"><span aria-hidden="true">${esc(who.emoji || '🗣️')}</span><b lang="zh-CN">${esc(who.name || '')}</b></div>
    <div class="ks-shadow-line" role="img" aria-label="Their line, ${n} syllables, hidden until you've said it">${'<i></i>'.repeat(n)}</div>
    <button type="button" class="ks-tool ks-shadow-again">🔊 Again</button>
    <button type="button" class="ks-btn ks-rev-go" data-test-go>Listen</button>`;
  const go = el.querySelector('.ks-rev-go'), dots = el.querySelector('.ks-shadow-line');
  // the line, each dot lighting up as its syllable comes (by its share of the clip); a panel's clock waits for it
  async function hear() {
    const release = clock?.hold();
    line?.stop();
    [...dots.children].forEach((d, i) => d.style.setProperty('--d', `${Math.round(ms(step.a[1] * 1000 * i / n))}ms`));
    dots.classList.remove('ks-shadow-on'); void dots.offsetWidth; dots.classList.add('ks-shadow-on');
    const l = (line = audio.play(scn.audio, step.a)); await l.done;
    release?.();
  }
  el.querySelector('.ks-shadow-again').onclick = hear;
  async function start() {
    // keep this start's own signal: after a quick leave and return, `ac` already belongs to the next start
    ac?.abort(); const my = (ac = new AbortController());
    go.hidden = true; dots.hidden = false; el.dataset.state = 'playing';
    el.querySelector('.ks-rev-out')?.remove();
    await hear();
    if (my.signal.aborted) return;
    // the microphone gets a clock (a silent one would wait for ever); saying it and checking yourself doesn't
    const speak = speech.canListen() && (settings.get('input') === 'auto' || defaultMode() === 'speak');
    const r = await asking(el, ctx, beat, { level: scn.level, audio: scn.audio, signal: my.signal, skin: 'shadow', log: { id: `shadow:${scn.id}:${step.zh}`, task: 'shadow' }, mode: speak ? 'speak' : 'self', time: speak ? 15 : 0, giveUpAfter: 60, control: (c) => (clock = c) }, 'ks-rev-notiles');
    clock = null;
    if (r.result === 'cancel' || my.signal.aborted) return;
    dots.hidden = true;
    const out = h('div', 'ks-rev-out', `<b>${r.result === 'ok' ? (r.stars >= 3 ? 'Spot on.' : 'Close.') : 'Next time.'}</b>`);
    out.append(zh(step.t, { pinyin: 'all', count: false, cls: 'ks-shadow-said' }), nextButton(ctx));
    el.append(out);
    el.dataset.state = 'done';
  }
  go.onclick = () => { audio.unlock(); start(); };
  return {
    enter() { if (canStart() && el.dataset.state === 'idle') start(); },
    // stopAll() can't reach a line that is only a timer (voices off) or still loading, so stop this one by hand
    leave() { ac?.abort(); line?.stop(); audio.stopAll(); ctx.lock(false); if (el.dataset.state !== 'done') { el.dataset.state = 'idle'; go.hidden = false; } },
    destroy() { ac?.abort(); line?.stop(); },
  };
}

// ---------- writing ----------
let strokes = null;
const loadStrokes = () => (strokes ??= files.json('data/strokes.json').catch(() => { strokes = null; return {}; }));


// Two passes: trace the word over its outline, then write it from memory, with only its sound and meaning to go on
// and the word blanked in its phrase. Show me draws it for you (a star, from memory). The result goes into spaced
// review as write:<word>, and the Mix brings the word back to write again (item.again: from memory only).
export function writeCard(el, item, ctx) {
  const p = item.phrase, chars = [...item.word], syl = item.syl || [], scn = ctx.data.byId[p.scn] || {};
  const px = Math.min(280, Math.round(innerWidth * 0.68), Math.round(innerHeight * 0.36));
  let writer = null, pass = 0, k = 0, misses = 0, shown = false, alive = true, run = 0, line = null, lenient = 1.2, traces = 1, traced = 0;
  el.classList.add('ks-write');
  el.dataset.state = 'idle';
  // the grid has its size before Hanzi Writer mounts in it, so nothing jumps when it does
  el.innerHTML = `<div class="ks-rev-top"><span class="ks-rev-label">${item.again ? 'Write it again' : 'Write it'}</span><span class="ks-rev-from" lang="zh-CN">${esc(scn.title || '')} · ${esc(scn.title_en || '')}</span></div>
    <div class="ks-write-phrase"></div>
    <div class="ks-write-grid"><div class="ks-write-target" style="width:${px}px;height:${px}px" aria-label="Draw the character here"></div></div>
    <div class="ks-write-info"></div>
    <div class="ks-write-row"><button type="button" class="ks-tool ks-write-show">Show me</button><button type="button" class="ks-tool ks-write-hear" aria-label="Hear the phrase">🔊</button><button type="button" class="ks-btn ks-write-go" data-test-go>Start</button></div>`;
  const $ = (s) => el.querySelector(s), target = $('.ks-write-target'), go = $('.ks-write-go'), show = $('.ks-write-show'), info = $('.ks-write-info'), phrase = $('.ks-write-phrase');
  const word = () => `<b class="ks-write-py">${syl.map((s, i) => (i === k && chars.length > 1 ? `<u>${esc(s)}</u>` : esc(s))).join('')}</b> ${esc(item.gloss)}`;
  const price = () => (show.innerHTML = pass === 2 ? 'Show me <b class="ks-cost">−1★</b>' : 'Show me');
  // the phrase: the word marked while you trace it, blanked while you write it from memory, whole at the end
  function paint() {
    phrase.innerHTML = '';
    if (el.dataset.state !== 'done' && (pass === 2 || (!pass && item.again))) { const z = h('span', 'ks-zh', p.zh.split(item.word).map(esc).join(`<b class="ks-write-blank">${'＿'.repeat(chars.length)}</b>`)); z.lang = 'zh-CN'; return phrase.append(z); }
    const z = zh(p.t, { pinyin: el.dataset.state === 'done' ? 'all' : 'none', count: false });
    z.querySelectorAll('.ks-w').forEach((w) => { if (w.dataset.w.includes(item.word) || item.word.includes(w.dataset.w)) w.classList.add('ks-write-hl'); });
    phrase.append(z);
  }
  const quiz = (my) => writer.quiz({
    showHintAfterMisses: pass === 1 ? 1 : 3, leniency: lenient,
    onMistake: () => { if (pass === 2) misses++; audio.sfx('pop'); },
    onComplete: () => setTimeout(() => alive && my === run && next(), 500),
  });
  async function draw() {
    const my = run, data = await loadStrokes();
    if (!alive || my !== run) return;
    const c = chars[k];
    if (!data[c]) return finish(true); // the strokes didn't arrive (the build ships every model answer's characters)
    try { writer?.cancelQuiz(); } catch {}
    target.innerHTML = '';
    writer = HanziWriter.create(target, c, {
      width: px, height: px, padding: 10, showCharacter: false, showOutline: pass === 1,
      strokeColor: '#f7f2e8', outlineColor: 'rgba(247,242,232,0.2)', drawingColor: '#ffc53d', highlightColor: '#35d49c', drawingWidth: 22,
      charDataLoader: (ch, ok, err) => (data[ch] ? ok(data[ch]) : err(new Error('no stroke data for ' + ch))),
    });
    info.innerHTML = pass === 1 ? `${traced ? 'Once more: trace' : 'Trace'} <b lang="zh-CN">${esc(c)}</b> ${esc(syl[k] || '')} · ${data[c].strokes.length} strokes` : word();
    if (window.KS_SIM || window.KS_SAY) { await wait(400); if (alive && my === run) next(); return; } // tests can't draw: count it as written
    quiz(my);
  }
  function next() {
    if (++k < chars.length) return draw();
    if (pass === 1 && ++traced < traces) { k = 0; return draw(); } // the word traced again (A5) before it's from memory
    if (pass === 1) { pass = 2; k = 0; paint(); price(); return draw(); }
    finish();
  }
  // lost: nothing could be drawn, so nothing is scored either
  function finish(lost) {
    const stars = Math.max(1, (misses <= 1 ? 3 : misses <= 4 ? 2 : 1) - (shown ? 1 : 0));
    if (!lost) { srs.record('write:' + item.word, stars); events.note('stars', stars); }
    el.dataset.state = 'done';
    paint();
    info.innerHTML = `<b lang="zh-CN">${esc(item.word)}</b> ${esc(syl.join(''))} · ${esc(item.gloss)} ${lost ? '<br>Its strokes didn’t load: next time.' : `<span class="ks-stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></span>`}`;
    show.hidden = true;
    go.removeAttribute('data-test-go'); go.hidden = false; go.textContent = 'Next ↓'; go.onclick = () => ctx.next();
    if (!lost) audio.sfx('yes');
  }
  function start() {
    // the rung the card plays at (the Mix's: the last card's), as it starts: how forgiving the strokes are (Hanzi
    // Writer's leniency, v1 1.2), and whether the word is traced twice
    const rung = ctx.assist?.knobs;
    lenient = rung?.leniency ?? 1.2; traces = rung?.traceTwice ? 2 : 1; traced = 0;
    run++; pass = item.again ? 2 : 1; k = 0; misses = 0; shown = false;
    go.hidden = true; show.hidden = false; price();
    el.dataset.state = 'playing';
    paint();
    line?.stop(); line = audio.play(p.audio, p.a); // the phrase it comes from, for its sound (tracked, so leaving stops it)
    draw();
  }
  function idle() {
    run++; try { writer?.cancelQuiz(); } catch {}
    writer = null; target.innerHTML = ''; info.innerHTML = ''; pass = 0; paint();
    el.dataset.state = 'idle'; go.hidden = false; show.hidden = true;
  }
  go.onclick = () => { audio.unlock(); start(); };
  // tracing, it shows the stroke order; from memory, it gives the character away (a star) and leaves its outline up
  show.onclick = () => {
    if (!writer || el.dataset.state !== 'playing') return;
    const my = run;
    if (pass === 2) shown = true;
    writer.cancelQuiz(); writer.showOutline();
    writer.animateCharacter({ onComplete: () => alive && my === run && quiz(my) });
  };
  $('.ks-write-hear').onclick = () => { line?.stop(); line = audio.play(p.audio, p.a); };
  loadStrokes(); // fetched while the card before this one plays
  idle();
  return {
    enter() { if (canStart() && el.dataset.state === 'idle') start(); },
    leave() { line?.stop(); audio.stopAll(); if (el.dataset.state !== 'done') idle(); },
    destroy() { alive = false; line?.stop(); try { writer?.cancelQuiz(); } catch {} },
  };
}

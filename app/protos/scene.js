// 刷 Scenes: each scenario as a tiny film. A stage (the scenario's backdrop emoji and colours), the cast as big emoji
// characters who react, film subtitles that light up word by word with the voice, narration as a cinematic caption.
// At every `say` the picture freezes, the camera pushes in on whoever spoke to you, and the answer panel rises; the
// story reacts the moment you've said it. story.run owns the logic; this module only stages it.
import * as audio from '../shared/audio.js';
import { ask } from '../shared/ask.js';
import { run, score } from '../shared/story.js';
import { chrome, atRung, endNote } from '../shared/feed.js';
import { zh, en, h, esc, showAll, shown, dropIn } from '../shared/text.js';
import { decoys, phraseId } from '../shared/content.js';
import { marks, settings } from '../shared/store.js';
import { wait, ms } from '../shared/time.js';
import { blanks } from '../shared/match.js';
import * as levels from '../shared/levels.js';
import { endKey } from '../shared/days.js';
import * as art from '../shared/art.js';

export const format = 'scene';
// The feed's opening order (main.js sorts by it): the airport reaches your first line fastest, then by level.
export const order = ['airport-esim', 'hotpot-spicy', 'taxi-airport', 'locked-out', 'emei-monkey', 'meet-parents'];

// Sounds you can read: every effect also lands on screen as a comic-book word.
const BANG = { ring: '叮铃铃', roar: '嗷呜！', ding: '叮！', buzz: '嗡嗡', whoosh: '嗖！', heartbeat: '扑通扑通', door: '砰！', crash: '哐当！', honk: '嘀嘀！', pop: '啵！', splash: '哗啦！', goose: '嘎嘎！', drum: '咚！', cheer: '耶——！', alarm: '嘀嘟嘀嘟', knock: '咚咚咚', type: '嗒嗒嗒', message: '叮咚！' };
const JOLT = new Set(['door', 'crash', 'roar', 'knock', 'drum', 'alarm']);
const FLASH = { ding: '#ffe9a8', alarm: '#ff4d5e', crash: '#ffffff', message: '#bfe3ff', cheer: '#ffe9a8' };
// fx → the symbol that pops over a character's head (manga style), so a reaction reads even with the sound off.
const REACT = { squint: '🤨', laugh: '😂', angry: '💢', cry: '😭', faint: '💫', jump: '❗', run: '💨', shake: '💦' };
// With the pixel art (art.js), the fx is the sprite's own animation (faint holds its last frame, enter and leave walk),
// and the mark over the head is the pack's effect where it has one.
const POSE = { enter: 'walk' }, MARK = { squint: 'question', shake: 'sweat', jump: 'exclaim', faint: 'dizzy', angry: 'anger' };
const FX = ['shake', 'squint', 'give', 'jump', 'laugh', 'angry', 'cry', 'run'].map((f) => `ks-scene-fx-${f}`);
const TINTS = ['#ffc53d', '#69b7ff', '#ff8fab', '#7ee0b8', '#c7a6ff'];
// The freeze-frame stamp: your turn, again, and the third go (the answer is on screen by then).
const STAMP = [['该你了！', 'Your turn'], ['再来！', 'Again'], ['跟着说！', 'Say it with the hint']];

export function createCard(el, scn, ctx) {
  let ac = null, lastWho = null, propNow = '', firstNarr = true, hooked = !!ctx.hooked; // hooked: begin(), below
  const actors = new Map(), tint = {}, beats = {};
  // the art, once it's in (art.js): the place behind, sprites for the cast, pictures for the props; till then, emoji
  let A = null, S = 3;
  const drawn = art.of(scn).then((a) => { if (a?.place) { A = a; dress(); } return a; });
  Object.keys(scn.cast).forEach((k, i) => (tint[k] = TINTS[i % TINTS.length]));
  // Stakes (scene.md `miss`): a beat missed twice doesn't come back a third time, or get said for you. Its `miss` steps
  // play instead (a beat without them plays nothing) and the story goes on without your line, or ends if they end it.
  // story.run can only branch to `ok` or an or-branch, so this card plays its own copy of the steps, where every beat
  // gets one extra branch at the end of `alts`, never shown.
  const steps = JSON.parse(JSON.stringify(scn.steps)); // plain data; structuredClone isn't on older iPhones
  // With no microphone (ctx.typeOne, from the Mix), one line per scene is typed rather than said: the last top-level
  // beat whose blanks come to two to four characters, with double the time. Writing is the gap these players have. The
  // last, not the first: the opening freeze is the one you say (the Mix's very first), and in every scene the last beat
  // qualifies, is reached by every run not lost by then, and missed twice doesn't lose the scene.
  const blankChars = (b) => blanks(b).reduce((n, w) => n + [...w].length, 0);
  const typeBeat = ctx.typeOne ? steps.filter((st) => st.say && blankChars(st.say) >= 2 && blankChars(st.say) <= 4).pop()?.say : null;
  (function walk(list) {
    for (const st of list || []) {
      if (!st.say) continue;
      const b = st.say;
      beats[b.id] = b;
      b.alts = [...(b.alts || []), { missed: true, then: b.miss || [] }];
      b.shown = b.alts.slice(0, -1);
      walk(b.ok); walk(b.fail); walk(b.miss); (b.alts || []).forEach((a) => a.missed || walk(a.then));
    }
  })(steps);

  // the cast's voices (and the narrator's), slower at the rungs that slow them (assist.js: rate), same pitch; their
  // subtitles keep time with the clip as played (len)
  const voice = (a) => audio.play(scn.audio, a, { rate: ctx.assist?.knobs.rate });

  const [c1, c2] = scn.bg || ['#2a2050', '#6b3fa0'];
  el.classList.add('ks-scene');
  el.style.setProperty('--c1', c1); el.style.setProperty('--c2', c2);

  const world = h('div', 'ks-scene-world', `<div class="ks-scene-backdrop" aria-hidden="true">${esc(scn.stage || '🎬')}</div>
    <div class="ks-scene-floor"></div><div class="ks-scene-cast"></div><div class="ks-scene-calls"></div><div class="ks-scene-prop" aria-hidden="true"></div>`);
  const castRow = world.querySelector('.ks-scene-cast'), calls = world.querySelector('.ks-scene-calls'), prop = world.querySelector('.ks-scene-prop');
  const shade = h('div', 'ks-scene-shade'), spot = h('div', 'ks-scene-spot'), flashEl = h('div', 'ks-scene-flash');
  const subs = h('div', 'ks-scene-subs');
  subs.setAttribute('aria-live', 'polite');
  // how far through the story you are, like a story app's bar: by top-level step (a say counts as its own step)
  const bar = h('div', 'ks-scene-progress', '<i></i>'), tops = new Map(steps.map((st, i) => [st.say || st, i]));
  bar.setAttribute('aria-hidden', 'true');
  const progress = (st) => { const i = tops.get(st.say || st); if (i != null) bar.style.setProperty('--p', ((i + 1) / steps.length).toFixed(3)); };
  const title = titleCard();
  el.append(world, shade, spot, flashEl, subs, bar, title);
  chrome(el, scn, { replay: () => { audio.unlock(); begin(); }, settings: () => ctx.openSettings() });
  const play = title.querySelector('.ks-scene-play');
  play.onclick = (e) => { e.stopPropagation(); audio.unlock(); begin(); };
  idle();

  // ---------- the opening title card: what, where, who, in two seconds ----------
  // (its pinyin goes by the pinyin setting as the card comes on screen: built a card ahead, it can't know the card's rung)
  function titlePy() { const p = title.querySelector('.ks-scene-title-py'); if (p) p.hidden = shown('pinyin') === 'none'; }
  function titleCard() {
    const t = h('div', 'ks-scene-title');
    const secs = Math.round(scn.secs || 0), len = secs ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    const py = scn.title_py ? `<div class="ks-scene-title-py">${esc(scn.title_py)}</div>` : '';
    t.innerHTML = `<div class="ks-scene-title-in">
        <div class="ks-scene-title-stage" aria-hidden="true">${esc(scn.stage || '🎬')}</div>
        ${py}<h2 class="ks-scene-title-zh" lang="zh-CN">${esc(scn.title)}</h2>
        <div class="ks-scene-title-en">${esc(scn.title_en)}</div>
        <div class="ks-scene-title-set">${esc(scn.setting)}</div>
        <div class="ks-scene-title-cast">${Object.values(scn.cast).map((c) => `<span><b aria-hidden="true">${esc(c.emoji)}</b><i lang="zh-CN">${esc(c.name)}</i></span>`).join('')}</div>
        <button type="button" class="ks-scene-play" data-test-go>▶ Play${len}</button>
      </div><div class="ks-scene-title-bar" aria-hidden="true"><i></i></div>`;
    return t;
  }

  // ---------- the stage ----------
  // a person in the art: a sprite standing on the floor line, or their portrait in a caller's bubble
  function draw(who, a) {
    if (!A || a.sp || a.drawn) return;
    const body = a.querySelector('.ks-scene-body'), c = scn.cast[who];
    if (c.phone) { if (A.av[who]) { body.innerHTML = art.face(A.av[who]); a.drawn = true; } return; }
    const sheet = A.cast[who];
    if (!sheet) return;
    body.textContent = '';
    a.sp = art.sprite(sheet, S);
    body.append(a.sp.el);
    a.drawn = true;
  }
  const crowd = () => {
    const n = (el.dataset.n = castRow.children.length);
    if (!A) return;
    // four on the floor: a pixel smaller each, so they fit side by side
    const s = n >= 4 ? S - 1 : S;
    el.style.setProperty('--art-h', `${48 * s}px`);
    // a shorter sheet (the monkey, the cat) stands on the same line, its mark over its own head
    for (const a of actors.values()) if (a.sp) { const top = Math.max(0, 48 - a.sp.sheet.f[1]) * s; a.sp.size(s); a.sp.el.style.marginTop = `${top}px`; a.querySelector('.ks-scene-react').style.top = `${top - 10}px`; }
  };
  // the art has come: the stage redrawn in it, whoever's already on it included
  function dress() {
    S = art.scale(el.clientWidth || 390);
    el.classList.add('ks-scene-art');
    el.style.setProperty('--art-s', S);
    el.style.setProperty('--art-top', A.place.top); el.style.setProperty('--art-bottom', A.place.bottom);
    const bd = world.querySelector('.ks-scene-backdrop');
    bd.textContent = '';
    Object.assign(bd.style, { backgroundImage: `url("${A.place.url}")`, width: `${A.place.w * S}px`, height: `${A.place.h * S}px` });
    for (const [who, a] of actors) draw(who, a);
    crowd();
    if (propNow) { const p = propNow; propNow = ''; setProp(p); }
  }
  // the mark over someone's head: the pack's effect, or the emoji
  function mark(a, fx, emoji) {
    const r = a.querySelector('.ks-scene-react');
    r.textContent = emoji || '';
    if (!A || !MARK[fx] || !emoji) return;
    A.fx(MARK[fx]).then((st) => { if (st && r.textContent === emoji) { r.textContent = ''; r.append(art.sprite(st, Math.max(2, S - 1)).el); } });
  }
  function onStage(who) {
    const c = scn.cast[who];
    if (!c) return null;
    let a = actors.get(who);
    if (a && !a.isConnected) a = null;
    if (!a) {
      a = h('div', 'ks-scene-actor ks-scene-enter', `<span class="ks-scene-body" aria-hidden="true">${esc(c.emoji || '🙂')}</span><span class="ks-scene-react" aria-hidden="true"></span>
        <span class="ks-scene-tag" lang="zh-CN">${esc(c.name)}${c.phone ? ' <i aria-label="on the phone">📞</i>' : ''}</span>`);
      a.style.setProperty('--tint', tint[who]);
      (c.phone ? calls : castRow).append(a);
      actors.set(who, a);
      draw(who, a);
      crowd();
    }
    clearTimeout(a.leaving);
    a.classList.remove('ks-scene-gone');
    return a;
  }
  // `arrive` (scene.md): someone walks on without a word, so whoever you're about to address is there at the freeze
  // (and when a narration brings someone on, they're who you're about to talk to: the camera's focus moves to them)
  const walkOn = (st, focus) => { for (const who of [].concat(st.arrive || [])) if (scn.cast[who]) { onStage(who); if (focus) lastWho = who; } };
  function exit(a) {
    if (!a) return;
    a.classList.add('ks-scene-gone');
    a.sp?.flip(true).play('walk');
    a.leaving = setTimeout(() => { a.remove(); crowd(); }, ms(650));
  }
  function talking(a) {
    for (const x of actors.values()) { x.classList.toggle('ks-scene-talking', x === a); x.sp?.rest(x === a ? 'talk' : 'idle'); }
    el.classList.toggle('ks-scene-dialog', !!a);
  }
  function react(a, fx) {
    if (!a) return;
    mark(a, fx, REACT[fx]);
    a.classList.remove(...FX, 'ks-scene-enter');
    if (fx !== 'faint') a.classList.remove('ks-scene-faint');
    void a.offsetWidth; // restart the animation when the same fx comes twice
    if (fx === 'faint') a.classList.add('ks-scene-faint');
    else if (fx && fx !== 'leave' && fx !== 'enter') a.classList.add(`ks-scene-fx-${fx}`);
    if (fx === 'enter') a.classList.add('ks-scene-enter');
    if (a.sp && fx && fx !== 'leave') { // (leaving, they say their line first: exit() walks them off)
      // walking on comes from the right, so they face left, then turn to the room
      a.sp.flip(fx === 'enter').play(POSE[fx] || fx, { again: true, hold: fx === 'faint' });
      if (fx === 'enter') setTimeout(() => { a.sp.flip(false); a.sp.play(a.classList.contains('ks-scene-talking') ? 'talk' : 'idle'); }, ms(500));
    }
  }
  // A prop is the object the story is about right now. Given (fx give), it flies from the giver to you, then settles.
  function setProp(p, from) {
    if (p === undefined || p === propNow) return;
    propNow = p;
    prop.classList.remove('ks-scene-prop-on', 'ks-scene-prop-give');
    prop.textContent = p || '';
    if (!p) return;
    // its picture, when the art has one: drawn about 64 px, in whole pixels
    A?.prop(p).then((st) => { if (st && propNow === p) { prop.textContent = ''; prop.append(art.sprite(st, Math.max(2, Math.round(64 / Math.max(...st.f)))).el); } });
    void prop.offsetWidth;
    if (from) {
      const r = from.getBoundingClientRect(), q = prop.getBoundingClientRect(), R = el.getBoundingClientRect();
      const px = q.left + q.width / 2, py = q.top + q.height / 2;
      prop.style.setProperty('--gx', `${Math.round(r.left + r.width / 2 - px)}px`);
      prop.style.setProperty('--gy', `${Math.round(r.top + r.height / 3 - py)}px`);
      prop.style.setProperty('--cx', `${Math.round(R.left + R.width / 2 - px)}px`);
      prop.style.setProperty('--cy', `${Math.round(R.top + R.height * 0.42 - py)}px`);
      prop.classList.add('ks-scene-prop-give');
    }
    prop.classList.add('ks-scene-prop-on');
  }
  function bang(name) {
    if (BANG[name]) {
      const b = h('div', 'ks-scene-bang', esc(BANG[name]));
      b.setAttribute('aria-hidden', 'true'); b.lang = 'zh-CN';
      b.style.setProperty('--rot', `${Math.round(Math.random() * 16 - 8)}deg`);
      b.style.left = `${38 + Math.random() * 24}%`; b.style.top = `${15 + Math.random() * 12}%`;
      world.append(b);
      setTimeout(() => b.remove(), 1600);
    }
    if (JOLT.has(name)) jolt();
    if (FLASH[name]) flash(FLASH[name]);
  }
  const retrigger = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  const jolt = () => retrigger(el, 'ks-scene-jolt');
  function flash(color) { flashEl.style.setProperty('--flash', color); retrigger(flashEl, 'ks-scene-flash-on'); }
  // Which picture the camera shows: dialogue, a narrator's caption (cinema bars), your turn (freeze), the end.
  function mode(m) {
    el.classList.toggle('ks-scene-narrating', m === 'narr');
    el.classList.toggle('ks-scene-asking', m === 'ask');
    el.classList.toggle('ks-scene-frozen', m === 'ask');
    el.classList.toggle('ks-scene-done', m === 'end');
    if (m !== 'line') talking(null);
  }
  // The camera for your turn: push in on whoever spoke to you last, and lift the stage so they stay in view above
  // their line and the answer panel. Worked out from layout (offset*, which ignore transforms) so it can be redone
  // whenever the panel changes height.
  const ZOOM = 1.08;
  function frame(who) {
    const W = el.clientWidth, H = el.clientHeight, panel = el.querySelector('.ks-ask--scene');
    const top = castRow.offsetTop, bottom = top + castRow.offsetHeight;
    const a = who && actors.get(who), body = a?.isConnected ? a.querySelector('.ks-scene-body') : null;
    const phone = !!body && a.parentNode === calls;
    let px = W / 2, py = (top + bottom) / 2;
    if (body) { const box = a.parentNode; px = box.offsetLeft + a.offsetLeft + body.offsetLeft + body.offsetWidth / 2; py = box.offsetTop + a.offsetTop + body.offsetTop + body.offsetHeight / 2; }
    let lift = 0;
    if (!phone) { // a caller's bubble is already up top; people on the floor may need lifting
      const now = subs.querySelector('.ks-scene-now:not(.ks-scene-narr):not(.ks-scene-you)');
      const floorAt = (panel ? panel.offsetTop : H * 0.56) - 10 - (now ? now.offsetHeight : 0) - 12;
      const back = document.querySelector('.ks-back'), limit = back ? back.getBoundingClientRect().bottom - el.getBoundingClientRect().top + 4 : 56;
      lift = Math.round(Math.max(limit - (bottom - ZOOM * (bottom - top)), Math.min(0, floorAt - bottom)));
    }
    const ox = phone ? W / 2 : px;
    el.style.setProperty('--cam-x', `${Math.round(ox)}px`); el.style.setProperty('--cam-y', `${Math.round(bottom)}px`);
    el.style.setProperty('--lift', `${lift}px`);
    // the spotlight follows the same transform: scaled about (ox, bottom), then lifted
    el.style.setProperty('--spot-x', `${Math.round(ox + ZOOM * (px - ox))}px`);
    el.style.setProperty('--spot-y', `${Math.round(bottom + ZOOM * (py - bottom) + lift)}px`);
  }
  function stamp(attempt) {
    const [zhs, ens] = STAMP[Math.min(attempt, 3) - 1];
    el.querySelectorAll('.ks-scene-stamp').forEach((n) => n.remove());
    const s = h('div', 'ks-scene-stamp', `<b lang="zh-CN">${zhs}</b><span>${ens}</span>`);
    s.setAttribute('aria-hidden', 'true');
    el.append(s);
    setTimeout(() => s.remove(), 1100);
  }

  // ---------- subtitles: the line being said, big; the one before it, small and fading; nothing older ----------
  function show(node) {
    subs.querySelectorAll('.ks-scene-was').forEach((n) => n.remove());
    const now = subs.querySelector('.ks-scene-now');
    if (now) now.classList.replace('ks-scene-now', 'ks-scene-was');
    node.classList.add('ks-scene-now');
    subs.append(node);
  }
  // Karaoke: each word lights up as the voice reaches it (by its share of the characters, close enough for speech).
  function karaoke(line, secs) {
    const parts = [...line.children], size = (p) => [...(p.dataset.w || p.textContent)].length;
    const total = parts.reduce((n, p) => n + size(p), 0) || 1;
    let at = 0;
    for (const p of parts) { p.style.setProperty('--d', `${Math.round(ms(secs * 920 * (at / total)))}ms`); at += size(p); }
    line.classList.add('ks-scene-kara');
  }
  // 您再说一遍: at your turn, the line you're answering can be heard again from a button on its subtitle. The first replay
  // holds the clock; after that it runs on while the line plays, which costs about the line's length.
  let clock = null; // ask()'s control: { hold() → release, penalty(s) }
  function replayable() {
    const now = subs.querySelector('.ks-scene-now'), st = now?.step;
    if (!st?.a) return () => {};
    const b = h('button', 'ks-scene-replay', '↻');
    Object.assign(b, { type: 'button', title: 'Hear that again' });
    b.setAttribute('aria-label', 'Hear that line again');
    let n = 0, clip = null;
    b.onclick = async (e) => {
      e.stopPropagation();
      const release = ++n === 1 ? clock?.hold() : (clock?.penalty(2), null); // the first replay is free
      clip?.stop(); clip = voice(st.a);
      const line = now.querySelector('.ks-scene-line');
      line.classList.remove('ks-scene-kara'); void line.offsetWidth; karaoke(line, clip.len);
      await clip.done;
      release?.();
    };
    now.querySelector('.ks-scene-who').append(b);
    return () => { clip?.stop(); b.remove(); };
  }
  function you(beat, r) {
    const o = r.alt >= 0 ? beat.alts[r.alt] : beat, entry = r.verdict?.entry || o.ans?.[0];
    if (!entry) return;
    const node = h('div', 'ks-scene-sub ks-scene-you', `<div class="ks-scene-who"><span lang="zh-CN">你</span>${r.result === 'skip' ? '<i>skipped</i>' : `<i aria-label="${r.stars} stars">${'★'.repeat(r.stars || 0)}</i>`}</div>`);
    node.append(zh(entry.t, { cls: 'ks-scene-line', count: false }));
    show(node);
  }

  // A spoken line's subtitle: who, the Chinese lighting up with the voice (secs: its clip as played), the English per
  // the setting.
  function sayLine(st, secs) {
    const c = scn.cast[st.who] || {};
    const node = h('div', 'ks-scene-sub' + (c.phone ? ' ks-scene-phone' : ''), `<div class="ks-scene-who">${A?.av[st.who] ? `<span class="ks-scene-av">${art.face(A.av[st.who])}</span>` : `<span aria-hidden="true">${esc(c.emoji || '')}</span>`}<span lang="zh-CN">${esc(c.name || st.who)}</span>${c.phone ? '<i aria-label="on the phone">📞</i>' : ''}</div>`);
    node.style.setProperty('--tint', tint[st.who] || 'var(--gold)');
    node.step = st;
    const line = zh(st.t, { cls: 'ks-scene-line' });
    node.append(line, en(st.en));
    show(node);
    karaoke(line, secs || 0);
  }

  // ---------- story hooks ----------
  let reactMiss = null; // set while a turn is up: what a wrong try sets off
  const hooks = (signal) => {
    const hold = (st) => (st.hold && !signal.aborted ? wait(st.hold * 1000, signal) : null);
    async function caption(st, text) {
      mode('narr');
      if (st.prop !== undefined) setProp(st.prop);
      const node = h('div', 'ks-scene-sub ks-scene-narr');
      let line = null;
      if (st.t) { line = zh(st.t, { cls: 'ks-scene-line' }); node.append(line); }
      if (text) { const e = en(text, !st.t || (firstNarr && shown('english') !== 'none') ? 'show' : undefined); e.classList.add('ks-scene-narr-en'); node.append(e); }
      firstNarr = false;
      show(node);
      const clip = st.a ? voice(st.a) : null, secs = clip?.len || 0, read = text ? 0.9 + text.split(/\s+/).length * 0.21 : 0;
      if (line) karaoke(line, secs);
      await Promise.all([clip?.done, wait(Math.max(secs, read) * 1000, signal)]);
    }
    return {
      step: progress,
      async line(st) {
        const a = onStage(st.who);
        walkOn(st);
        mode('line');
        lastWho = st.who;
        talking(a); react(a, st.fx);
        if (st.prop !== undefined) setProp(st.prop, st.fx === 'give' ? a : null);
        const clip = voice(st.a);
        sayLine(st, clip.len);
        await clip.done;
        if (signal.aborted) return;
        if (st.fx === 'leave') exit(a);
        await wait(st.fx === 'leave' ? 420 : 150, signal);
        await hold(st);
      },
      async narr(st) { walkOn(st, true); await caption(st, st.narr); if (!signal.aborted) await hold(st); },
      async sfx(st) {
        walkOn(st, true); bang(st.sfx);
        if (st.prop !== undefined) setProp(st.prop);
        await Promise.race([audio.sfx(st.sfx), wait(st.sfx === 'ring' ? 1500 : 850, signal)]);
        await hold(st);
      },
      async say(beat, attempt) {
        world.querySelectorAll('.ks-scene-bang').forEach((b) => b.remove()); // a clean frame for your turn
        frame(lastWho); mode('ask'); stamp(attempt);
        audio.sfx(attempt > 1 ? 'heartbeat' : 'drum'); audio.buzz(25);
        await wait(520, signal);
        if (signal.aborted) return { result: 'cancel' };
        ctx.lock(true);
        const view = { ...beat, alts: beat.shown }; // the hidden miss branch is never offered
        const p = ask(el, view, atRung(ctx.assist, { id: phraseId(scn, beat), level: scn.level, attempt, audio: scn.audio, decoys: decoys(scn), signal, skin: 'scene', cue: beat.cue, ...(beat === typeBeat ? { mode: 'type', time: 2 * (beat.time ?? levels.clock(scn.level)) } : {}), control: (c) => (clock = c), onMiss: () => reactMiss?.(), onListen: (on) => el.classList.toggle('ks-scene-listening', on) }));
        // The last line stays readable just above the panel, however tall the panel grows (tiles, verdict notes).
        const panel = el.querySelector('.ks-ask--scene');
        // short phones: a tall panel (an or-branch, tiles) leaves room for one row of the line above it
        const fit = () => { if (!panel.isConnected) return; el.style.setProperty('--ks-scene-ask', `${panel.offsetHeight}px`); el.classList.toggle('ks-scene-tall', panel.offsetHeight > el.clientHeight - 200); frame(lastWho); };
        const ro = new ResizeObserver(() => requestAnimationFrame(fit));
        ro.observe(panel); fit();
        let unreplay = replayable();
        // a wrong try gets a reaction: whoever says the beat's first `fail` line reacts and says it, clock held
        reactMiss = async () => {
          const f = (beat.fail || []).find((x) => x.who && x.t);
          if (!f || signal.aborted) return;
          const a = onStage(f.who), release = clock?.hold(), clip = voice(f.a);
          react(a, f.fx && f.fx !== 'leave' ? f.fx : 'squint');
          unreplay(); sayLine(f, clip.len); unreplay = replayable();
          await clip.done;
          release?.();
        };
        const r = await p;
        reactMiss = null;
        ro.disconnect(); unreplay(); ctx.lock(false);
        el.classList.remove('ks-scene-tall');
        if (signal.aborted || r.result === 'cancel') return r;
        mode('line');
        if (r.result === 'ok' || r.result === 'skip') { you(beat, r); flash(r.result === 'ok' ? 'rgba(53,212,156,.55)' : 'rgba(255,255,255,.2)'); await wait(320, signal); return r; }
        // a miss. Silence reads differently from a wrong try: whoever was waiting looks puzzled before they react.
        flash('rgba(255,77,94,.5)'); jolt();
        if (!r.tried) { const a = actors.get(lastWho); if (a) mark(a, 'squint', '❓'); await wait(450, signal); }
        // the second miss changes the story (its `miss` steps, through the hidden branch) instead of a third go
        if (attempt >= 2) return { result: 'ok', alt: beat.alts.length - 1, stars: 0 };
        return r;
      },
      async end(st) {
        el.dataset.end = endKey(st); // the ending this run reached: its card row names it (days.js endings)
        bar.style.setProperty('--p', 1);
        if (st.prop !== undefined) setProp(st.prop);
        await caption(st, st.en);
        if (!signal.aborted) await hold(st);
      },
    };
  };

  // ---------- the end screen: how it went, and the lines you said, to hear again ----------
  function finish(out, state) {
    const stars = score(state), win = out !== 'lose';
    marks.done(scn.id, { stars, outcome: out });
    mode('end');
    el.querySelectorAll('.ks-scene-stamp').forEach((n) => n.remove());
    const box = h('div', 'ks-scene-end' + (win ? '' : ' ks-scene-end-lose'));
    // the headline follows the stars: a perfect run, made it, scraped through (every line skipped or helped), or lost
    const [head, sub] = !win ? ['差一点！', 'So close. One line away.'] : stars === 3 ? ['完美！', 'Flawless.'] : stars ? ['过关！', 'You made it.'] : ['勉强过关', 'Scraped through. Again?'];
    box.innerHTML = `<div class="ks-scene-end-head"><b lang="zh-CN">${dropIn(head)}</b><span>${sub}</span></div>
      <div class="ks-scene-end-stars" role="img" aria-label="${stars} of 3 stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'ks-on' : ''}" style="--i:${i}">★</span>`).join('')}</div>
      <div class="ks-scene-end-l">Your lines</div><ol class="ks-scene-end-list"></ol>
      <div class="ks-scene-end-row"><button type="button" class="ks-btn ks-btn-quiet ks-scene-again">↻ Again</button><button type="button" class="ks-btn ks-scene-next">Next ↓</button></div>`;
    const list = box.querySelector('ol');
    // The lines most worth another look showing, three at most (the list never scrolls till Show all opens the rest, so
    // a swipe on it moves the feed): the ones you missed first, with the tip, then the ones with fewest stars. Only lines
    // short of ★★★ while there are any, so a flawless run isn't told to polish anything.
    const missed = (s) => !!beats[s.id]?.alts?.[s.alt]?.missed;
    const work = state.said.filter((s) => missed(s) || s.stars < 3);
    const lines = [...state.said].sort((x, y) => missed(y) - missed(x) || x.stars - y.stars), worst = lines.slice(0, work.length ? Math.min(3, work.length) : 3);
    box.querySelector('.ks-scene-end-l').textContent = worst.some(missed) ? 'Say these next time' : work.length ? 'Your lines to polish' : 'Your lines';
    for (const s of lines) {
      const b = beats[s.id];
      if (!b) continue;
      const miss = missed(s), o = miss || s.alt < 0 ? b : b.alts[s.alt], entry = o.ans?.[0];
      const li = h('li', 'ks-scene-said' + (miss ? ' ks-scene-said-missed' : '') + (worst.includes(s) ? '' : ' ks-list-extra'));
      Object.assign(li, { tabIndex: 0, title: 'Hear it again' });
      li.setAttribute('role', 'button');
      li.onclick = () => { audio.stopAll(); audio.play(scn.audio, o.a); retrigger(li, 'ks-scene-said-on'); };
      li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } };
      if (entry) li.append(zh(entry.t, { pinyin: 'all', count: false, cls: 'ks-scene-said-zh' }));
      const score = miss ? '' : `<b class="ks-scene-said-stars" aria-label="${s.stars} of 3 stars">${'★'.repeat(s.stars)}<i>${'★'.repeat(3 - s.stars)}</i></b>`;
      li.append(h('div', 'ks-scene-said-en', `<span>${esc(o.gloss || b.gloss || b.en)}</span>${score}<span class="ks-scene-said-hear" aria-hidden="true">🔊</span>`));
      if (miss && b.tip) li.append(h('div', 'ks-scene-said-tip', esc(b.tip)));
      list.append(li);
    }
    showAll(box, list);
    endNote(scn, box.querySelector('.ks-scene-end-row'), el); // the endings found, the next episode's day
    box.querySelector('.ks-scene-again').onclick = () => begin();
    box.querySelector('.ks-scene-next').onclick = () => ctx.next();
    el.append(box);
    for (let i = 0; i < stars; i++) setTimeout(() => el.isConnected && audio.sfx('ding'), 250 + i * 220);
    el.dataset.state = 'done';
  }

  // ---------- playing ----------
  function reset() {
    el.querySelectorAll('.ks-ask, .ks-scene-end, .ks-scene-stamp').forEach((n) => n.remove());
    for (const a of actors.values()) { clearTimeout(a.leaving); a.remove(); }
    actors.clear(); crowd();
    subs.innerHTML = ''; setProp(''); lastWho = null; firstNarr = true;
    bar.style.setProperty('--p', 0);
    world.querySelectorAll('.ks-scene-bang').forEach((b) => b.remove());
    mode('line');
    el.classList.remove('ks-scene-listening');
  }
  function idle() {
    el.dataset.state = 'idle';
    title.hidden = false; play.hidden = false; titlePy();
    title.classList.remove('ks-scene-title-run');
    title.onclick = () => { audio.unlock(); begin(); }; // tap anywhere to play, as on any video
  }
  async function begin() {
    ac?.abort(); audio.stopAll();
    ac = new AbortController();
    const signal = ac.signal, state = { stars: [], said: [], signal };
    reset();
    el.dataset.state = 'playing'; delete el.dataset.end;
    // The title card holds for under a second while the voices and the art load (the story should start talking fast); a
    // tap skips it. A pack slow to come (or one that never does) holds it 2.5 s at most: the story starts, and its lines wait for the
    // voices or go on quietly without them (audio.js), instead of the card standing still. A story the gate has just
    // introduced (For You's hook, its premise over the gate's tap: ctx.hooked) has had its title card: the first time,
    // it starts the moment its voices are in (the first line comes sooner: p3.md's 8 s from the tap).
    const intro = !hooked;
    hooked = false;
    play.hidden = true; title.hidden = !intro; titlePy();
    if (intro) retrigger(title, 'ks-scene-title-run');
    let skip;
    const tapped = new Promise((r) => (skip = r));
    title.onclick = skip;
    await Promise.all([Promise.race([Promise.all([audio.load(scn.audio), drawn]), wait(2500, signal)]), intro && Promise.race([wait(400, signal), tapped])]);
    title.onclick = null;
    if (signal.aborted) return;
    title.hidden = true;
    const out = await run(steps, hooks(signal), state);
    if (out === 'cancel' || signal.aborted) return;
    finish(out || 'win', state);
  }

  // A finished scene keeps its end card when you come back to it, as the Mix's small cards do: Again (or Replay) plays it.
  return {
    enter() { if (el.dataset.state === 'done') return; if ((audio.unlocked || audio.running)()) begin(); else idle(); }, // unlocked: an iPhone reads 'running' late
    leave() { ac?.abort(); audio.stopAll(); if (el.dataset.state !== 'done') { reset(); idle(); } },
    destroy() { ac?.abort(); },
  };
}

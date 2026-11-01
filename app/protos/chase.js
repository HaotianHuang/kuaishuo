// 追 Chase: an arcade run (content/formats/chase.md). Something is behind you and gaining, all run long: slowly
// while people talk, at full speed while you think. Say the line and you pull away (more for a perfect one, less the
// further ahead you already are); miss and it lunges; at zero you're caught. A phrase met for the first time is shown
// for a moment and then taken away, so you say it from memory. story.run owns the steps; this module owns the gap,
// the track, and the clock that matters, which is the chaser's.
import * as audio from '../shared/audio.js';
import { ask, defaultMode } from '../shared/ask.js';
import { run, score } from '../shared/story.js';
import { chrome, atRung, endNote } from '../shared/feed.js';
import { zh, en, h, esc, showAll, dropIn } from '../shared/text.js';
import { decoys, phraseId, of } from '../shared/content.js';
import { marks, settings } from '../shared/store.js';
import { canListen } from '../shared/speech.js';
import { wait, ms, fast } from '../shared/time.js';
import { endKey } from '../shared/days.js';
import * as art from '../shared/art.js';

export const format = 'chase';
// The feed opens on the tiger: the owner's own idea, and the clearest stakes.
export const order = ['village-tiger', 'new-year-dodge', 'office-boss', 'farm-goose'];

// Sounds you can read, for the sound-off phone on the bus.
const BANG = { roar: '嗷呜！', goose: '嘎嘎嘎！', door: '砰！', crash: '哐当！', splash: '哗啦！', drum: '咚咚！', cheer: '好！', alarm: '嘀嘟嘀嘟', ding: '叮！', whoosh: '嗖！', message: '叮咚！', ring: '叮铃铃', honk: '嘀嘀！', knock: '咚咚咚', heartbeat: '扑通', buzz: '嗡', pop: '啵', type: '嗒嗒' };
const REACT = { squint: '🤨', laugh: '😂', angry: '💢', cry: '😭', faint: '💫', jump: '❗', run: '💨', shake: '💦', give: '🤲' };
const NEAR = 10, DANGER = 5;          // metres: the chaser glows, then the screen shakes and the heart pounds
// While people talk the chaser still comes, faster the further ahead you are: 0.6 of its speed close up, 1.1 at the cap.
const drift = (gap, max) => 0.6 + 0.5 * gap / max;
const LISTEN_RATE = 0.5;              // while the recogniser listens, half speed
const QUIET_RATE = 0.8;               // tiles are slower than speech: a longer clock, a slower chaser
// Typing is slower still (a phone's pinyin and its candidates), and an iPhone raises its keyboard only for a tap on the
// field: the chaser waits for that tap (or a key), five seconds at most, so a stall still costs.
const TYPE_RATE = 0.5, KEYBOARD_S = 5;
const READ_MS = 1500;                 // how long a new phrase is shown before it's taken away
const BAND = 0.75;                    // a right answer buys less the further ahead you already are (up to 75% less)
const pace = () => (fast() ? 5 : 1);  // tests: five times fast, not twenty like ask's clock (the harness is slower)
const held = () => !!window.KS_PAUSE || !!document.querySelector('.ks-sheet-bg');
const clipLen = (st) => (st.a ? st.a[1] * 1000 : Math.max(900, [...(st.zh || '')].length * 120));
const shuffle = (l) => { for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
const words = (b) => (b.ans || []).flatMap((e) => (e.t || []).filter((t) => t.length > 1).map((t) => t[0]));
// The pixel art's track (art.js): the set's four layers, far to near, each scrolling at its share of the road's speed,
// in art pixels a second; a sprite's pose for each moment of the run (a pose the sheet hasn't falls back to idle)
const DEPTH = [0.05, 0.2, 0.5, 1], ROAD = 90;
const POSES = { run: ['run', 'run'], caught: ['faint', 'roar'], safe: ['jump', 'skid'], idle: ['idle', 'idle'] };

export function createCard(el, scn, ctx) {
  const C = { start: 20, close: 1, gain: 8, loss: 5, max: 25, caught: [], ...(scn.chase || {}) };
  const sig = ['roar', 'goose'].find((s) => JSON.stringify(scn.steps).includes(`"sfx":"${s}"`));  // the chaser's own noise
  const fin = scn.steps.findIndex((st) => st.finale);
  const encounters = scn.steps.slice(0, fin < 0 ? undefined : fin).filter((st) => st.say).map((st) => st.say);
  const beats = {};
  (function walk(list) { for (const st of list || []) if (st.say) { beats[st.say.id] = st.say; walk(st.say.ok); walk(st.say.fail); (st.say.alts || []).forEach((a) => walk(a.then)); } })(scn.steps);
  // Tiles mix in this run's other phrases (别, 过来, 开门…), so choosing matters as well as order.
  const runWords = [...new Set(encounters.flatMap(words))];
  const tileDecoys = (beat) => { const mine = new Set(words(beat)); return shuffle(runWords.filter((w) => !mine.has(w))).slice(0, 6).concat(decoys(scn, 4)); };

  let ac = null, sc = null, gap = C.start, finale = false, passed = 0, beatNow = null, lastBeat = 0, state = null, lastEnd = null;
  let phase = 'stop', panel = null, ticker = 0, lastT = 0, caught = false, autoStart = 0, notes = {}, keyboard = 0;
  // the other characters' voices, slower where the card's rung slows them (assist.js: rate), the same pitch
  const say = (clip) => audio.play(scn.audio, clip, { rate: ctx.assist?.knobs.rate });

  const [c1, c2] = scn.bg || ['#2a2050', '#6b3fa0'];
  el.classList.add('ks-chase');
  // A chaser of several emoji (the relatives) runs as a pack: smaller, shoulder to shoulder.
  const glyphs = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(C.emoji || '')].length : [...(C.emoji || '')].length;
  if (glyphs > 1) el.classList.add('ks-chase-pack');
  el.style.setProperty('--c1', c1); el.style.setProperty('--c2', c2);
  const far = Array.from({ length: 6 }, () => `<span>${esc(scn.stage || '🌲')}</span>`).join('');
  el.innerHTML = `
    <div class="ks-chase-world" aria-hidden="true">
      <div class="ks-chase-far"><div>${far}</div></div><div class="ks-chase-streaks"></div>
      <div class="ks-chase-ground"></div><div class="ks-chase-obs"></div>
      <div class="ks-chase-chaser"><span>${esc(C.emoji || '👹')}</span></div><div class="ks-chase-you"><span>🏃</span></div>
      <div class="ks-chase-fx"></div>
    </div>
    <div class="ks-chase-vignette" aria-hidden="true"></div>
    <div class="ks-chase-hud" hidden><div class="ks-chase-gap" role="status" aria-label="Distance"><b>${C.start}</b><span>m</span></div>
      <div class="ks-chase-dots">${encounters.map(() => '<i></i>').join('')}</div></div>
    <div class="ks-chase-talk" aria-live="polite"></div>`;
  const $ = (s) => el.querySelector(s);
  const world = $('.ks-chase-world'), talk = $('.ks-chase-talk'), hud = $('.ks-chase-hud'), num = $('.ks-chase-gap b'), obs = $('.ks-chase-obs'), fxl = $('.ks-chase-fx');
  const start = startCard();
  el.append(start);
  chrome(el, scn, { replay: () => { audio.unlock(); begin(); }, settings: () => ctx.openSettings() });

  // ---------- the art, once it's in (art.js): the set scrolling behind, you and the chaser as sprites ----------
  let A = null, S = 3, you = null, them = [];
  const who = (k) => (A?.av[k] ? `<b class="ks-chase-av">${art.face(A.av[k])}</b>` : `<b aria-hidden="true">${esc(scn.cast[k]?.emoji || '')}</b>`);
  const drawn = art.of(scn).then((a) => { if (a?.chase && a.cast.you && a.chaser.length) { A = a; dress(); } return a; });
  function dress() {
    const W = el.clientWidth || 390;
    S = art.scale(W);
    el.classList.add('ks-chase-art');
    el.style.setProperty('--art-s', S);
    el.style.setProperty('--art-top', A.chase.top); el.style.setProperty('--art-bottom', A.chase.bottom);
    const set = h('div', 'ks-chase-layers');
    A.chase.layers.forEach((l, i) => {
      // two copies of enough tiles to cover the stage, slid one copy's width: seamless, as the emoji far row is
      const tile = l.w * S, k = Math.ceil(W / tile), strip = h('div', 'ks-chase-layer');
      Object.assign(strip.style, { backgroundImage: `url("${l.url}")`, backgroundSize: `${tile}px ${l.h * S}px`, width: `${2 * k * tile}px`, height: `${l.h * S}px`, animationDuration: `${(k * tile / (ROAD * DEPTH[i] * S)).toFixed(2)}s` });
      set.append(strip);
    });
    world.prepend(set);
    you = art.sprite(A.cast.you, S);
    $('.ks-chase-you span').replaceChildren(you.el);
    // a pack of relatives runs a pixel smaller each, shoulder to shoulder
    const s = A.chaser.length > 1 ? S - 1 : S;
    them = A.chaser.map((c) => art.sprite(c, s));
    $('.ks-chase-chaser span').replaceChildren(...them.map((t) => t.el));
    el.style.setProperty('--you-h', `${A.cast.you.f[1] * S}px`);
    el.style.setProperty('--them-h', `${Math.max(...A.chaser.map((c) => c.f[1])) * s}px`);
    const big = start.querySelector('.ks-chase-start-chaser');
    big.replaceChildren(...A.chaser.map((c) => art.sprite(c, S + 1, { anim: 'run' }).el));
    pose();
  }
  // what the sprites are doing: the moment, from the card's classes
  function pose() {
    if (!A) return;
    const m = el.classList.contains('ks-chase-caught') ? 'caught' : el.classList.contains('ks-chase-safe') ? 'safe' : el.classList.contains('ks-chase-run') ? 'run' : 'idle';
    const [mine, theirs] = POSES[m];
    you.play(mine, { hold: m === 'caught' });
    for (const t of them) t.play(theirs, { hold: m !== 'run' });
  }

  function startCard() {
    const s = h('div', 'ks-chase-start');
    s.innerHTML = `<div class="ks-chase-start-in">
        <div class="ks-chase-start-chaser" aria-hidden="true">${esc(C.emoji || '👹')}</div>
        <h2 lang="zh-CN">${esc(scn.title)}</h2><div class="ks-chase-start-en">${esc(scn.title_en)}</div>
        <div class="ks-chase-start-set">${esc(scn.setting)}</div>
        <div class="ks-chase-start-meta"><span>${esc(C.emoji)} ${C.start} m behind you</span><span>${encounters.length} encounters</span></div>
        <div class="ks-chase-start-rule"></div>
        <div class="ks-chase-start-best"></div>
        <button type="button" class="ks-chase-go" data-test-go><b lang="zh-CN">跑！</b> Run</button>
      </div>`;
    s.querySelector('.ks-chase-go').onclick = (e) => { e.stopPropagation(); audio.unlock(); begin(); };
    return s;
  }

  // ---------- the gap, and the chaser that eats it ----------
  function setGap(g, why) {
    const before = gap;
    gap = Math.max(0, Math.min(C.max, g));
    num.textContent = Math.ceil(gap);
    el.style.setProperty('--f', (gap / C.max).toFixed(3));
    el.classList.toggle('ks-chase-near', gap < NEAR && !finale);
    el.classList.toggle('ks-chase-danger', gap < DANGER && !finale);
    if (why) {
      const d = Math.round(gap - before);
      if (d) { float(`${d > 0 ? '+' : '−'}${Math.abs(d)} m`, d > 0 ? 'up' : 'down', why); el.classList.remove('ks-chase-bump-up', 'ks-chase-bump-down'); retrigger(el, d > 0 ? 'ks-chase-bump-up' : 'ks-chase-bump-down'); }
    }
    // Under five metres the heart pounds, faster the closer it gets (real time only, so tests stay quiet).
    if (gap < DANGER && !finale && !fast() && performance.now() - lastBeat > 380 + gap * 90) { lastBeat = performance.now(); audio.sfx('heartbeat'); audio.buzz(12); }
  }
  // One clock for the whole run: it ticks from the first caption to the finale, at the rate the moment calls for.
  function tick() {
    const now = performance.now(), dt = ((now - lastT) / 1000) * pace();
    lastT = now;
    if (held() || finale || caught || phase === 'stop' || phase === 'verdict') return;
    // the pressure setting scales the chase: on Auto, as the card's rung says (assist.js: ×1.4 at A0 down to ×0.4 at
    // A5; a review run, v1's), else relaxed runs it at half speed, panic a third faster
    const pressure = settings.get('pressure'), x = pressure === 'auto' ? ctx.assist?.knobs.chaser ?? 1 : { relaxed: 0.5, panic: 1.3 }[pressure] || 1;
    let rate = C.close * (phase === 'ask' || phase === 'read' ? 1 : drift(gap, C.max)) * x;
    if (phase === 'ask' && panel?.isConnected) {
      if (panel.classList.contains('ks-listening')) rate *= LISTEN_RATE;
      if (panel.dataset.mode === 'tiles') rate *= QUIET_RATE;
      if (panel.dataset.mode === 'type') { if ((keyboard -= dt) > 0) return; rate *= TYPE_RATE; }
    }
    setGap(gap - rate * dt);
    if (gap <= 0) catchNow();
  }
  const startClock = () => { clearInterval(ticker); lastT = performance.now(); ticker = setInterval(tick, 100); };
  const stopClock = () => { clearInterval(ticker); ticker = 0; };
  // Caught, wherever it happens: the story stops (a line, a caption, the panel) and the catch plays instead.
  function catchNow() { if (caught || finale) return; caught = true; stopClock(); audio.stopAll(); sc?.abort('caught'); }

  function float(text, kind, label) {
    el.querySelectorAll('.ks-chase-delta').forEach((n) => n.remove());
    const f = h('div', `ks-chase-delta ks-chase-delta-${kind}`, `${label && label !== true ? `<small>${esc(label)}</small>` : ''}${esc(text)}`);
    el.append(f);
    setTimeout(() => f.remove(), 1100);
  }
  function bang(name, where = 'chaser') {
    if (!BANG[name]) return;
    const b = h('div', `ks-chase-bang ks-chase-bang-${where}`, esc(BANG[name]));
    b.lang = 'zh-CN';
    fxl.append(b);
    setTimeout(() => b.remove(), 1000);
  }
  const retrigger = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  const lunge = () => { retrigger($('.ks-chase-chaser'), 'ks-chase-lunge'); if (sig) { audio.sfx(sig); bang(sig); } };
  const stamp = (zhText, enText, cls = '') => {
    el.querySelectorAll('.ks-chase-stamp').forEach((n) => n.remove());
    const s = h('div', `ks-chase-stamp ${cls}`, `<b lang="zh-CN">${esc(zhText)}</b><span>${esc(enText)}</span>`);
    el.append(s);
    setTimeout(() => s.remove(), ms(900));
  };

  // ---------- what people say, between encounters ----------
  function show(node) { talk.innerHTML = ''; talk.append(node); }
  const zhOf = (st, opts) => (st.t ? zh(st.t, opts) : h('span', 'ks-zh', esc(st.zh)));
  const hooks = (signal) => ({
    async line(st) {
      if (st.finale) enterFinale();
      const c = scn.cast[st.who] || {}, mine = st.who === C.who;
      const b = h('div', `ks-chase-line${mine ? ' ks-chase-line-chaser' : ''}`, `<span class="ks-chase-who">${who(st.who)}${esc(c.name || st.who)}</span>`);
      b.append(zhOf(st, { cls: 'ks-chase-line-zh' }), en(st.en));
      if (REACT[st.fx]) b.append(h('i', 'ks-chase-react', REACT[st.fx]));
      show(b);
      if (mine && !finale) lunge();
      await Promise.all([say(st.a).done, st.a ? null : wait(clipLen(st), signal)]);
      await wait(160, signal);
    },
    async narr(st) {
      if (st.finale) enterFinale();
      const b = h('div', 'ks-chase-narr');
      if (st.zh) b.append(zhOf(st, { cls: 'ks-chase-narr-zh' }));
      b.append(en(st.narr));
      show(b);
      // Told aloud: silent Chinese for a second can't be read in time. The chaser keeps coming while it plays.
      if (st.a) await say(st.a).done;
      else await wait(Math.min(2400, Math.max(1100, st.narr.length * 24)), signal);
      await wait(140, signal);
    },
    async sfx(st) {
      if (st.finale) enterFinale();
      const own = st.sfx === sig;
      if (own && !finale) lunge(); else { audio.sfx(st.sfx); bang(st.sfx, own ? 'chaser' : 'ahead'); }
      if (['crash', 'door', 'roar'].includes(st.sfx)) retrigger(world, 'ks-chase-jolt');
      await wait(own ? 650 : 420, signal);
    },
    say: (beat, attempt) => encounter(beat, attempt, signal, finale),
    async end(st) {
      lastEnd = st; el.dataset.end = endKey(st); // (the ending reached: its card row names it, days.js)
      const b = h('div', `ks-chase-narr ks-chase-endcap ks-chase-endcap-${st.end}`);
      if (st.zh) b.append(zhOf(st, { cls: 'ks-chase-narr-zh' }));
      b.append(en(st.en));
      show(b);
      await Promise.all([st.a ? say(st.a).done : null, wait(1500, signal)]);
    },
  });

  // ---------- an encounter: the obstacle, a look at the line, then the panel and the chaser's clock ----------
  async function encounter(beat, attempt, signal, plain = false) {
    const pack = beat.audio || scn.audio, note = (notes[beat.id] ||= { heard: [], tones: [], chars: [], stars: 0 });
    if (!plain && attempt === 1) {
      beatNow = beat;
      const o = beat.obstacle || '🚧';
      obs.innerHTML = `<span>${esc(o)}</span>`;
      A?.prop(o).then((st) => { if (st && beatNow === beat) obs.firstChild.replaceChildren(art.sprite(st, S).el); });
      retrigger(obs, 'ks-chase-obs-in'); obs.classList.remove('ks-chase-obs-pass');
      audio.sfx('whoosh');
    }
    // A first meeting: the line is shown big for a moment, then taken away before you can answer, so it's said from
    // memory. An `again` encounter skips this: you've said it before.
    const shown = !plain && attempt === 1 && !beat.again && !!beat.ans?.[0];
    if (shown) {
      phase = 'read';
      const card = h('div', 'ks-chase-read', `<p class="ks-chase-read-m">${esc(beat.cue || beat.en)}</p><span class="ks-chase-say">Remember</span>`);
      card.append(zh(beat.ans[0].t, { cls: 'ks-chase-read-zh' }));
      el.append(card); el.classList.add('ks-chase-reading');
      // heard as well as seen, and up for the whole clip plus a beat
      const voice = audio.play(pack, beat.a);
      await wait(Math.max(READ_MS, voice.len * 1000 + 600), signal);
      voice.stop();
      card.classList.add('ks-chase-read-out'); el.classList.remove('ks-chase-reading');
      setTimeout(() => card.remove(), 250);
    } else if (!plain) await wait(attempt === 1 ? 350 : 120, signal);
    if (signal.aborted) return { result: 'cancel' };
    // the freeze beat: your turn
    stamp(...(attempt === 1 ? ['该你了！', 'Your turn'] : ['再来！', 'Again']), 'ks-chase-turn');
    audio.sfx(attempt === 1 ? 'drum' : 'heartbeat'); audio.buzz(20);
    phase = plain ? 'stop' : 'ask';
    ctx.lock(true);
    document.querySelector('.ks-toast')?.remove();  // the no-mic toast would sit on the panel
    const o = atRung(ctx.assist, {
      // an `again` encounter is the same phrase, harder: review records it under the first one's id
      id: beat.pid || phraseId(scn, beat.again ? { id: beat.again } : beat), level: beat.level ?? scn.level, attempt, audio: pack, decoys: tileDecoys(beat), signal, skin: 'chase',
      // One clock, the lead: no ring and no time-out, the chaser is the clock (the finale's beat keeps its own, and on
      // a rung with none, the rung's give-up). With no microphone (the artifact) the answer is typed, so it's recalled
      // rather than ticked off.
      quick: true, cue: beat.cue, time: plain ? undefined : 0, mode: canListen() ? undefined : 'type', giveUpAfter: plain ? undefined : 0,
      // after a time-out the answer is on screen; read off it, it scores one star and isn't promoted in review
      hint: attempt >= 2 ? 2 : 0, log: scn.review ? { task: 'review' } : undefined, // a review run's line: recall after a while
      onListen: (on) => el.classList.toggle('ks-chase-listening', on),
      onMiss: (v) => { if (v.heard) note.heard.push(v.heard); note.chars.push(...(v.chars || [])); },
      onVerdict: (v, stars) => {
        phase = plain ? 'stop' : 'verdict';
        Object.assign(note, { stars, tones: v.tones || [], chars: note.chars.concat(v.chars || []), self: !!v.self });
        if (!plain) { passed++; pass(beat, stars); }
        // hold the verdict about a second (the wrong character flashes red), then run on
        setTimeout(() => panel?.querySelector('.ks-next')?.click(), ms(plain ? 1500 : 1000));
      },
    });
    // just shown and heard: the rung's echo would only say it again. (The row keeps the help the panel gave: an answer
    // read off it after a miss is the answer shown, whatever was up before, and the learner and the rung must see it.)
    if (shown) o.echo = false;
    const p = ask(el, beat, o);
    // this encounter's own panel: a run left mid-answer has cleared the shared one before the observer below reports
    const mine = (panel = [...el.querySelectorAll('.ks-ask--chase')].pop());
    if (plain) mine.classList.add('ks-chase-ask-plain');
    if (beat.again && attempt === 1) mine.classList.add('ks-chase-nohelp');
    keyboard = KEYBOARD_S;
    for (const k of ['pointerdown', 'keydown', 'input']) mine.addEventListener(k, () => (keyboard = 0));
    // A miss (wrong words, wrong tiles) costs ground at once, and the line comes back on screen; an answer read off
    // it then counts as a hint (one star), the way ask's own Hint does.
    let wasShaking = false, reacted = false;
    const mo = new MutationObserver(() => {
      if (signal.aborted) return;  // left mid-answer: nothing on the way out counts
      const shaking = mine.classList.contains('ks-shake');
      if (shaking && !wasShaking && !plain && !mine.classList.contains('ks-done')) {
        miss(beat);
        if (!reacted) { reacted = true; react(beat); }
        const hint = mine.querySelector('.ks-hint');
        for (let i = 0; i < 2 && hint && !hint.hidden; i++) hint.click();
        if (gap <= 0) catchNow();
      }
      wasShaking = shaking;
    });
    mo.observe(mine, { attributes: true, attributeFilter: ['class'] });
    const r = await p;
    mo.disconnect(); ctx.lock(false); el.classList.remove('ks-chase-listening');
    if (!finale) phase = 'idle';
    if (r.result === 'timeout' && !plain) { miss(beat); if (gap <= 0) catchNow(); }
    if (signal.aborted || caught) return { result: 'cancel' };
    return r;
  }

  // The fail line a scene would play on a time-out, played over the panel on the first miss instead (there's no
  // time-out now): who it is and what they said, without stopping the run.
  function react(beat) {
    const st = (beat.fail || []).find((x) => x.who && x.zh);
    if (!st) return;
    const c = scn.cast[st.who] || {};
    const b = h('div', `ks-chase-line${st.who === C.who ? ' ks-chase-line-chaser' : ''}`, `<span class="ks-chase-who">${who(st.who)}${esc(c.name || st.who)}</span>`);
    b.append(zhOf(st, { cls: 'ks-chase-line-zh' }), en(st.en));
    show(b);
    if (st.a) say(st.a);
  }

  function pass(beat, stars) {
    const base = beat.gain ?? C.gain, g = stars >= 3 ? base * 1.4 : stars === 2 ? base : base * 0.75;
    setGap(gap + Math.round(g * (1 - BAND * gap / C.max)), stars >= 3 ? 'Perfect' : true);
    el.querySelectorAll('.ks-chase-dots i')[passed - 1]?.classList.add('ks-on');
    retrigger($('.ks-chase-you'), 'ks-chase-dash');
    obs.classList.remove('ks-chase-obs-in'); retrigger(obs, 'ks-chase-obs-pass');
    retrigger(el, 'ks-chase-boost');
    clearTimeout(pass.t); pass.t = setTimeout(() => el.classList.remove('ks-chase-boost'), 600);
    audio.sfx('whoosh');
  }
  function miss(beat) {
    setGap(gap - (beat.loss ?? C.loss), true);
    retrigger($('.ks-chase-you'), 'ks-chase-stumble');
    lunge();
    audio.buzz(60);
  }

  async function caughtRun(signal) {
    el.classList.add('ks-chase-caught');
    el.classList.remove('ks-chase-run', 'ks-chase-danger', 'ks-chase-near');
    pose();
    el.querySelectorAll('.ks-ask, .ks-chase-read').forEach((n) => n.remove());
    audio.stopAll(); audio.sfx(sig || 'crash'); bang(sig || 'crash');
    retrigger(world, 'ks-chase-jolt');
    await wait(700, signal);
    if (signal.aborted) return 'cancel';
    return (await run(C.caught, hooks(signal), { stars: [], said: [], signal })) || 'lose';
  }

  function enterFinale() {
    if (finale) return;
    finale = true; stopClock();
    el.classList.remove('ks-chase-run', 'ks-chase-near', 'ks-chase-danger');
    el.classList.add('ks-chase-safe');
    pose();
    hud.querySelector('.ks-chase-gap').dataset.label = 'got away by';
    audio.sfx('yes');
  }

  // ---------- the end: how far, your best, the phrases to hear again, and what went wrong in them ----------
  function finish(out) {
    const win = out !== 'lose', m = Math.round(gap);
    const prev = marks.doneAll()[scn.id] || {}, best = Math.max(prev.best || 0, win ? m : 0), fresh = win && m > (prev.best || 0);
    marks.done(scn.id, { stars: score(state), outcome: out, best, furthest: Math.max(prev.furthest || 0, passed) });
    const box = h('div', `ks-chase-end ks-chase-end-${win ? 'win' : 'lose'}`);
    box.innerHTML = `<div class="ks-chase-end-head"><div><b lang="zh-CN">${dropIn(win ? '跑掉了！' : '被抓了！')}</b><span>${win ? 'Got away!' : 'Caught!'}</span></div>
        <div class="ks-chase-end-m">${win ? `<b>${m}</b> m<span>${fresh ? '<em>new best!</em>' : 'to spare'}</span>` : `<b>${passed}</b>/${encounters.length}<span>cleared</span>`}</div></div>
      <div class="ks-chase-end-cap"></div>
      <div class="ks-chase-end-l">${win ? 'What you shouted' : 'Learn these, then run again'}${best && !fresh ? `<span class="ks-chase-end-best">Best ${best} m</span>` : ''}</div><ol class="ks-chase-end-list"></ol>
      <div class="ks-chase-end-row"><button type="button" class="ks-btn ks-btn-quiet ks-chase-again" data-test-go>↻ Run again</button><button type="button" class="ks-btn ks-chase-next">Next ↓</button></div>`;
    const list = box.querySelector('ol'), done = new Set(), cap = box.querySelector('.ks-chase-end-cap');
    if (lastEnd?.zh) cap.append(zhOf(lastEnd, { cls: 'ks-chase-end-zh', count: false }));
    if (lastEnd?.en) cap.append(en(lastEnd.en));
    let said = state.said.map((s, i) => ({ ...s, i, b: beats[s.id] })).filter((s) => s.b && !done.has(s.id) && done.add(s.id));
    // Caught: the phrase that would have saved you comes first.
    if (!win && beatNow && !said.some((s) => s.id === beatNow.id)) said.unshift({ id: beatNow.id, b: beatNow, alt: -1, stars: 0, missed: true, i: -1 });
    // Three rows showing, the ones worth another look first (missed, then fewest stars), the rest behind Show all; the
    // list never scrolls till it's opened, so a swipe that starts on it still moves the feed.
    said.sort((a, b) => (b.missed ? 1 : 0) - (a.missed ? 1 : 0) || a.stars - b.stars || a.i - b.i);
    if (win && said.slice(0, 3).some((s) => s.stars < 3)) box.querySelector('.ks-chase-end-l').firstChild.textContent = 'Worth another look';
    for (const [k, s] of said.entries()) {
      const o = s.alt >= 0 ? s.b.alts[s.alt] : s.b, entry = o.ans?.[0], n = notes[s.id] || {};
      const li = h('li', `ks-chase-said${s.missed ? ' ks-chase-said-missed' : ''}${k > 2 ? ' ks-list-extra' : ''}`);
      const hear = h('button', 'ks-chase-hear', '🔊');
      hear.type = 'button'; hear.setAttribute('aria-label', 'Hear it');
      hear.onclick = () => { audio.stopAll(); audio.play(o.audio || s.b.audio || scn.audio, o.a); };
      const txt = h('div', 'ks-chase-said-t');
      txt.append(entry ? zh(entry.t, { pinyin: 'all', count: false, cls: 'ks-chase-said-zh' }) : h('span', 'ks-zh ks-chase-said-zh', esc(o.answers[0])));
      const meaning = o.gloss || (o === s.b ? s.b.en : o.en).replace(/^or:\s*/i, '');
      txt.append(h('div', 'ks-chase-said-en', esc(s.missed ? `This one got you: ${s.b.en}` : meaning)));
      // what went wrong on the way: what was heard, the tones, the characters
      const fixes = [];
      if (n.heard?.length) fixes.push(`You said <span lang="zh-CN">${esc(n.heard[n.heard.length - 1])}</span>`);
      for (const t of n.tones || []) fixes.push(`<span lang="zh-CN">${esc(t.ch)}</span> is ${esc(t.want)}, not ${esc(t.got)}`);
      for (const c of (n.chars || []).slice(0, 2)) fixes.push(`<span lang="zh-CN">${esc(c.want)}</span> ${esc(c.py)}, not <span lang="zh-CN">${esc(c.got)}</span>`);
      if (fixes.length) txt.append(h('div', 'ks-chase-said-fix', fixes.join(' · ')));
      if (s.b.tip && o === s.b && (s.missed || s.stars < 3)) txt.append(h('div', 'ks-chase-said-tip', esc(s.b.tip)));
      li.append(hear, txt, h('span', 'ks-chase-said-stars', s.missed ? '' : `${'★'.repeat(s.stars)}<i>${'★'.repeat(3 - s.stars)}</i>`));
      list.append(li);
    }
    showAll(box, list);
    endNote(scn, box.querySelector('.ks-chase-end-row'), el); // the endings found
    box.querySelector('.ks-chase-again').onclick = () => begin();
    box.querySelector('.ks-chase-next').onclick = () => ctx.next();
    el.classList.remove('ks-chase-playing', 'ks-chase-run', 'ks-chase-near', 'ks-chase-danger');
    hud.hidden = true; talk.innerHTML = ''; fxl.innerHTML = '';
    el.querySelectorAll('.ks-chase-delta, .ks-chase-stamp').forEach((n) => n.remove());
    el.append(box);
    audio.sfx(win ? 'cheer' : 'no');
    el.dataset.state = 'done';
  }

  // ---------- playing ----------
  function reset() {
    stopClock(); clearTimeout(autoStart);
    el.querySelectorAll('.ks-ask, .ks-chase-end, .ks-chase-stamp, .ks-chase-read').forEach((n) => n.remove());
    el.classList.remove('ks-chase-run', 'ks-chase-caught', 'ks-chase-safe', 'ks-chase-near', 'ks-chase-danger', 'ks-chase-listening', 'ks-chase-playing', 'ks-chase-reading');
    talk.innerHTML = ''; fxl.innerHTML = ''; obs.className = 'ks-chase-obs'; obs.innerHTML = '';
    el.querySelectorAll('.ks-chase-delta').forEach((n) => n.remove());
    el.classList.remove('ks-chase-bump-up', 'ks-chase-bump-down');
    el.querySelectorAll('.ks-chase-dots i').forEach((i) => i.classList.remove('ks-on'));
    delete hud.querySelector('.ks-chase-gap').dataset.label;
    finale = false; caught = false; passed = 0; beatNow = null; lastEnd = null; phase = 'stop'; panel = null; notes = {};
    setGap(C.start);
    pose();
  }
  function idle() {
    reset();
    el.dataset.state = 'idle';
    hud.hidden = true; start.hidden = false;
    const best = marks.doneAll()[scn.id]?.best;
    start.querySelector('.ks-chase-start-best').textContent = best ? `Best: got away by ${best} m` : '';
    // where the phone can't listen the encounters are typed (unless the player chose another way): say so
    const typed = (!canListen() && settings.get('input') === 'auto') || defaultMode() === 'type';
    start.querySelector('.ks-chase-start-rule').textContent = `It gains while you think. ${typed ? 'Type' : 'Say'} it to pull away.`;
  }
  async function begin() {
    ac?.abort(); audio.stopAll();
    ac = new AbortController();
    const signal = ac.signal;
    sc = new AbortController();
    signal.addEventListener('abort', () => sc.abort());
    state = { stars: [], said: [], signal: sc.signal };
    reset();
    el.dataset.state = 'playing'; delete el.dataset.end;
    start.hidden = true; hud.hidden = false;
    el.classList.add('ks-chase-playing', 'ks-chase-run');
    pose();
    stamp('跑！', 'Run!');
    // the stamp has the screen to itself before the first caption (and the art a moment longer to come in)
    await Promise.all([audio.load(scn.audio), wait(900, signal), Promise.race([drawn, wait(2500, signal)])]);
    if (signal.aborted) return;
    phase = 'idle'; startClock();
    let out = await run(scn.steps, hooks(sc.signal), state);
    if (signal.aborted) return;
    if (caught) { out = await caughtRun(signal); if (signal.aborted || out === 'cancel') return; }
    stopClock();
    finish(out || 'win');
  }
  // The first chase ever holds its title a moment, so the rule is read: it gains while you think.
  const firstEver = () => !of('chase').some((s) => marks.doneAll()[s.id]);
  idle();  // last, once every helper above exists

  return {
    enter() {
      if (!(audio.unlocked || audio.running)()) return idle(); // unlocked: an iPhone reads 'running' late
      if (firstEver()) { idle(); autoStart = setTimeout(() => el.dataset.state === 'idle' && begin(), ms(1500)); }
      else begin();
    },
    leave() { ac?.abort(); audio.stopAll(); ctx.lock(false); idle(); },
    destroy() { ac?.abort(); stopClock(); clearTimeout(autoStart); },
  };
}

// ---------- a review run for the Mix: phrases that are due, as encounters, with a generic chaser ----------
// phrases: records from data/content.json `phrases` (en, gloss, answers, need, ans, a, slow, audio, level, id). Dealt at
// a rung (ctx.assist: the Mix's feed.js atLines(), where the ranker says so), it runs at it as a story does: the chaser's
// speed, each panel's clock and help, and its rows saying the rung; without one, as v1 ran it.
const OBSTACLES = ['🚧', '🪵', '📦', '🛢️', '🪨', '🧺', '🚲', '🪣'];
export function createRun(el, phrases, ctx) {
  const level = Math.max(0, ...phrases.map((p) => p.level ?? 1));
  const steps = phrases.map((p, i) => ({ say: {
    id: `r${i}`, pid: p.id, en: p.en, gloss: p.gloss, tip: p.tip, answers: p.answers, need: p.need, ans: p.ans, a: p.a, slow: p.slow,
    audio: p.audio, level: p.level, obstacle: OBSTACLES[i % OBSTACLES.length], again: true, // a review is recall: no answer up front
  } }));
  const scn = {
    id: 'review-run', format: 'chase', review: true, title: '快跑复习', title_en: 'Review Run', level, tags: ['复习', '快跑'], // review: its lines are logged as reviews
    setting: `${phrases.length} phrases due, and a dog that wants to play.`, stage: '🌳', bg: ['#16302a', '#3f7a5e'], cast: {},
    chase: { name: '大黄狗', en: 'a big yellow dog', emoji: '🐕', start: 18, close: 1, gain: 8, loss: 5, max: 23,
      caught: [ { narr: 'The dog knocks you flat... and licks your face.' }, { end: 'lose', en: 'Caught. It only wanted to play. These phrases will be back soon.' } ] },
    steps: [ { narr: 'A big yellow dog has decided you are the game.' }, ...steps, { narr: 'The dog gives up and flops down in the shade.', finale: true }, { end: 'win', en: 'Got away, every phrase said.' } ],
  };
  return createCard(el, scn, ctx);
}

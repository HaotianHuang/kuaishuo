// 接 Calls: an incoming phone call as a feed card. The phone rings; you answer; from then on it's sound only. The
// caller's subtitles stay hidden unless you peek, and if you go quiet they nudge you, then hang up
// (content/formats/call.md). story.run plays the call and ask() takes your lines; this module is the phone around
// them: the ringing screen, the in-call screen, the caller's patience, a line that breaks up, the hang-up, and the
// call-ended screen, which turns the call into a listening lesson.
import * as audio from '../shared/audio.js';
import { ask, modesAvailable } from '../shared/ask.js';
import { blanks } from '../shared/match.js';
import { run, score } from '../shared/story.js';
import { chrome, atRung, endNote } from '../shared/feed.js';
import { zh, en, h, esc, keyClick } from '../shared/text.js';
import { decoys, phraseId } from '../shared/content.js';
import { marks, settings } from '../shared/store.js';
import { wait, fast } from '../shared/time.js';
import * as levels from '../shared/levels.js';
import * as events from '../shared/events.js';
import { endKey } from '../shared/days.js';
import * as art from '../shared/art.js';

export const format = 'call';
// The feed's opening order (main.js sorts by it): v1's five first, as they came before the catalogue grew; the rest after.
export const order = ['courier-crabs', 'hotel-wakeup', 'mum-calling', 'landlord-leak', 'police-parcel'];

const HANDSET = '<path d="M5.1 3.6c1-.6 2.3-.4 3 .5l1.6 2.2c.6.8.5 2-.2 2.7l-1 1c.9 1.9 2.4 3.4 4.3 4.3l1-1c.7-.7 1.9-.8 2.7-.2l2.2 1.6c.9.7 1.1 2 .5 3l-.8 1.2c-.8 1.2-2.2 1.8-3.6 1.4C9.6 18.8 5.2 14.4 3.6 9.2c-.4-1.4.2-2.8 1.5-3.6z"/>';
const ICON = {
  phone: `<svg viewBox="0 0 24 24" aria-hidden="true">${HANDSET}</svg>`,
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  pad: `<svg viewBox="0 0 24 24" aria-hidden="true">${[3.5, 9.5, 15.5].map((y) => [5, 12, 19].map((x) => `<circle cx="${x}" cy="${y}" r="2.1"/>`).join('')).join('')}<circle cx="12" cy="21.3" r="2.1"/></svg>`,
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5h4l5-4v13l-5-4H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  bars: '<svg viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>',
  battery: '<svg viewBox="0 0 27 12" aria-hidden="true"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="15" height="8" rx="1.6"/><path d="M24 4v4c.9-.3 1.5-1.1 1.5-2S24.9 4.3 24 4z" opacity=".45"/></svg>',
};
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const PEEK_OFF = '<span aria-hidden="true">👀</span> Peek <i>−1★</i>', PEEK_ON = '<span aria-hidden="true">👀</span> Subtitles on', PEEK_FREE = '<span aria-hidden="true">👀</span> Peek <i>free</i>';
const RING_EVERY = 3400, RINGS = 6; // real milliseconds, not story time: this is the phone, not the scene

const two = (n) => String(n).padStart(2, '0');
const mmss = (s) => `${two(Math.floor(s / 60))}:${two(Math.floor(s % 60))}`;
// The lock-screen clock, moved on by however long you've been on the phone.
function clockAt(hhmm, secs) {
  const m = /^(\d\d):(\d\d)$/.exec(hhmm || ''), d = new Date();
  const t = ((m ? +m[1] * 60 + +m[2] : d.getHours() * 60 + d.getMinutes()) + Math.floor(secs / 60)) % 1440;
  return `${two(Math.floor(t / 60))}:${two(t % 60)}`;
}
const bare = (s) => String(s || '').replace(/[\s，。？！、；：“”‘’（）《》…—,.?!;:'"()]/g, '');
// How you answer on a call: speaking if the phone can listen, else saying it out loud and checking, or typing. Tiles
// spell the answer out, so you could win without understanding the caller: they come only after a peek.
function startMode(peeked) {
  const set = settings.get('input'), av = modesAvailable();
  if (set !== 'auto' && av.includes(set) && (set !== 'tiles' || peeked)) return set;
  if (set === 'auto' && av.includes(ask.chosen)) return ask.chosen; // a way the player tapped earlier in the visit (never tiles)
  return av.includes('speak') ? 'speak' : 'self';
}

export function createCard(el, scn, ctx) {
  const call = scn.call || {}, caller = scn.cast[call.caller] || Object.values(scn.cast)[0] || {};
  const photo = call.photo || caller.emoji || '👤';
  const [c1, c2] = scn.bg || ['#1b1f2a', '#3a4252'];
  el.classList.add('ks-call');
  el.style.setProperty('--ks-call-a', c1);
  el.style.setProperty('--ks-call-b', c2);
  el.innerHTML = `
    <div class="ks-call-bg" aria-hidden="true"><span>${esc(photo)}</span></div>
    <div class="ks-call-bar" aria-hidden="true"><b class="ks-call-clock"></b><span class="ks-call-net">${ICON.bars}<i>5G</i>${ICON.battery}</span></div>
    <div class="ks-call-phone">
      <header class="ks-call-head"><div class="ks-call-kind"></div><div class="ks-call-name"></div><div class="ks-call-sub"></div></header>
      <div class="ks-call-face"><div class="ks-call-halo" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="ks-call-photo" aria-hidden="true">${esc(photo)}</div><div class="ks-call-also" aria-hidden="true"></div></div>
      <div class="ks-call-wave" aria-hidden="true">${'<i></i>'.repeat(15)}</div>
      <section class="ks-call-subs" aria-label="Subtitles" aria-live="polite"><div class="ks-call-lines"></div>
        <button type="button" class="ks-call-peek">${PEEK_OFF}</button></section>
      <div class="ks-call-pad"><div class="ks-call-pad-num" aria-live="polite"></div>${KEYS.map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>
      <div class="ks-call-narr" aria-live="polite"></div>
      <div class="ks-call-answer">
        <button type="button" class="ks-call-no"><span>${ICON.phone}</span><b lang="zh-CN">拒绝</b><i>Decline</i></button>
        <button type="button" class="ks-call-yes" data-test-go><span>${ICON.phone}</span><b lang="zh-CN">接听</b><i>Answer</i></button>
      </div>
      <div class="ks-call-ctl">
        <div class="ks-call-keys">
          <button type="button" class="ks-call-key" data-k="mute" aria-pressed="false"><span>${ICON.mute}</span><i lang="zh-CN">静音</i></button>
          <button type="button" class="ks-call-key" data-k="pad" aria-pressed="false"><span>${ICON.pad}</span><i lang="zh-CN">拨号键盘</i></button>
          <button type="button" class="ks-call-key" data-k="speaker" aria-pressed="false"><span>${ICON.speaker}</span><i lang="zh-CN">免提</i></button>
        </div>
        <button type="button" class="ks-call-hang" aria-label="Hang up">${ICON.phone}<span class="ks-call-hang-tip">Tap again to hang up</span></button>
      </div>
    </div>
    <div class="ks-call-wait" aria-hidden="true"><span lang="zh-CN">耐心 · patience</span><div class="ks-call-wait-bar"><i></i><b>${esc(caller.emoji || photo)}</b></div></div>`;
  const $ = (s) => el.querySelector(s);
  const phone = $('.ks-call-phone'), kind = $('.ks-call-kind'), clock = $('.ks-call-clock'), photoEl = $('.ks-call-photo');
  const also = $('.ks-call-also'), subs = $('.ks-call-subs'), lines = $('.ks-call-lines'), peekBtn = $('.ks-call-peek'), narr = $('.ks-call-narr');
  const waitBar = $('.ks-call-wait'), hangBtn = $('.ks-call-hang');
  // the art, once it's in (art.js): the caller's portrait for the contact photo, their place behind the call; the
  // others' portraits where their emoji were
  let A = null;
  const face = (k, emoji) => (A?.av[k] ? `<b class="ks-call-av">${art.face(A.av[k])}</b>` : esc(emoji || ''));
  art.of(scn).then((a) => {
    if (!a) return;
    A = a;
    const me = a.av[call.caller];
    if (me) { photoEl.innerHTML = art.face(me); photoEl.classList.add('ks-call-photo-art'); waitBar.querySelector('b').innerHTML = art.face(me); }
    if (a.place) { const bg = h('i', 'ks-call-place'); bg.style.backgroundImage = `url("${a.place.url}")`; $('.ks-call-bg span').replaceWith(bg); }
  });
  chrome(el, scn, { replay: () => restart(), settings: () => ctx.openSettings() });

  // Who's calling: a saved contact shows the name (with pinyin), a stranger the number; under it, where the number is
  // from or what the phone thinks it is (境外来电 in red, the way phones flag a suspicious call).
  const name = $('.ks-call-name'), sub = $('.ks-call-sub');
  if (call.name) name.append(call.name.t ? zh(call.name.t, { pinyin: 'all', count: false }) : h('span', '', esc(call.name.zh)));
  else name.append(h('span', 'ks-call-num', esc(call.number || '未知号码')));
  // (drawn as the phone rings, by the pinyin setting then: built a card ahead, it couldn't know the card's rung)
  const label = () => {
    sub.innerHTML = '';
    if (call.label) {
      const l = call.label.t ? zh(call.label.t, { count: false }) : h('span', '', esc(call.label.zh));
      l.classList.add('ks-call-label');
      if (/诈骗|骚扰|境外|推销/.test(call.label.zh || '')) l.classList.add('ks-call-warn');
      sub.append(l);
    }
    if (call.name && call.number) sub.append(h('span', 'ks-call-numsm', esc(call.number)));
  };

  let view = '', ac = null, t0 = 0, timer = 0, ringT = 0, ringOut = 0, declines = 0, holds = 0, lastClose = 0, armed = 0;
  let typedOne = false, state = null, final = null, endedBy = 'them', peeks = 0, log = [], said = [], lastBeat = null, current = null, freeUsed = false;
  // The call's rung of the assist ladder (assist.js), read as each turn opens: on Auto pressure the caller's patience
  // (times v1's; Infinity, they never hang up) and how often they nudge first; a free peek; subtitles on. Their voices
  // slower where it slows them, the same pitch.
  const knobs = () => ctx.assist?.knobs || {}, auto = () => settings.get('pressure') === 'auto';
  // one a call (A3), or every one where the rung's own help is the frame already (A4: what a peek buys costs nothing)
  const freePeek = () => (!!knobs().peekFree && !freeUsed) || (!!knobs().help?.free && knobs().help.hint >= 1);
  const say = (clip) => audio.play(scn.audio, clip, { rate: knobs().rate });
  // with no microphone (ctx.typeOne, from the Mix), one reply is typed: the last whose blanks come to two to four
  // characters, as in scenes, so a call opens on a line you say
  const typeBeat = ctx.typeOne ? scn.steps.filter((st) => st.say && ((n) => n >= 2 && n <= 4)(blanks(st.say).join('').length)).pop()?.say : null;
  let turn = { peeked: false, lines: [] };
  const setView = (v) => { view = v; for (const k of ['ring', 'live', 'missed', 'over']) el.classList.toggle(`ks-call--${k}`, k === v); };
  const showClock = () => (clock.textContent = clockAt(call.clock, t0 ? (Date.now() - t0) / 1000 : 0));
  const caption = (t) => { narr.textContent = t || ''; narr.classList.toggle('ks-call-narr--on', !!t); };

  // ---------- ringing ----------
  function ring() {
    stopRing();
    setView('ring'); el.dataset.state = 'idle';
    kind.innerHTML = `${ICON.phone}<span lang="zh-CN">${declines ? '再次来电' : '来电'}</span><i>${declines ? 'calling again' : 'incoming call'}</i>`;
    showClock();
    const once = () => { if (audio.running()) { audio.sfx('ring'); audio.buzz([400, 200, 400]); } };
    once();
    ringT = setInterval(once, RING_EVERY);
    ringOut = setTimeout(decline, RING_EVERY * RINGS); // nobody picked up: it rings out
  }
  function stopRing() { clearInterval(ringT); clearTimeout(ringOut); ringT = ringOut = 0; }

  // Declined or rung out: a missed call, maybe a voice message, and they call straight back. Twice, and that's that.
  async function decline() {
    stopRing(); ac?.abort(); declines++;
    const signal = (ac = new AbortController()).signal;
    setView('missed');
    kind.innerHTML = '<span lang="zh-CN">未接来电</span><i>missed call</i>';
    if (declines >= 2) { endedBy = 'missed'; final = { end: 'lose', en: 'You let it ring out. Call back, and answer this time.' }; return over('lose', signal); }
    for (const st of call.missed || []) {
      const vm = h('div', 'ks-call-vm', `<div class="ks-call-vm-h"><b lang="zh-CN">语音留言</b> <span>voice message · ${esc(caller.name || '')}</span></div>`);
      vm.append(zh(st.t, { count: false }), en(st.en, 'show'));
      phone.append(vm);
      await say(st.a).done;
      await wait(900, signal);
      vm.remove();
    }
    await wait(1400, signal);
    if (!signal.aborted) ring();
  }

  // ---------- on the line ----------
  async function answer() {
    stopRing(); ac?.abort();
    const signal = (ac = new AbortController()).signal;
    state = { stars: [], said: [], signal }; final = null; typedOne = false; endedBy = 'them'; peeks = 0; log = []; said = []; lastBeat = null; current = null; freeUsed = false;
    lines.innerHTML = ''; caption(''); newTurn();
    setView('live'); el.dataset.state = 'playing'; delete el.dataset.end;
    t0 = Date.now(); tick(); timer = setInterval(tick, 500);
    await audio.load(scn.audio);
    if (signal.aborted) return;
    const out = await run(scn.steps, hooks(signal), state);
    if (signal.aborted || out === 'cancel') return;
    if (out !== 'lose') endedBy = 'done';
    await over(out || 'win', signal);
  }
  function tick() { kind.innerHTML = `<i class="ks-call-hd">HD</i><span>${mmss((Date.now() - t0) / 1000)}</span>`; showClock(); }

  const hooks = (signal) => {
    const hk = {
      line: (st) => speak(st, signal),
      async narr(st) { caption(st.narr); await (st.a ? say(st.a).done : wait(Math.max(1800, st.narr.length * 45), signal)); },
      sfx: (st) => audio.sfx(st.sfx),
      say: (beat, attempt) => yourTurn(beat, attempt, signal, hk),
      async end(st) { final = st; el.dataset.end = endKey(st); }, // (the ending reached: its card row names it, days.js)
    };
    return hk;
  };

  async function speak(st, signal) {
    const c = scn.cast[st.who] || {}, x = { st, c, broke: st.signal === 'bad', peeked: turn.peeked };
    log.push(x); turn.lines.push(x);
    const row = addLine(st, c);
    caption('');
    el.classList.add('ks-call--talk'); row.classList.add('ks-call-now'); // which bar is being said, when the photo is hidden
    if (st.fx) photoEl.dataset.fx = st.fx;
    if (st.who !== call.caller) { if (A?.av[st.who]) also.innerHTML = art.face(A.av[st.who]); else also.textContent = c.emoji || '🗣️'; el.classList.add('ks-call--also'); }
    await (st.signal === 'bad' ? broken(st, signal) : say(st.a).done);
    el.classList.remove('ks-call--talk', 'ks-call--also', 'ks-call--bad'); row.classList.remove('ks-call-now');
    delete photoEl.dataset.fx;
    await wait(160, signal);
  }

  // A bad line: the clip plays in bursts and the holes crackle. Every word is in the pack; the network drops some.
  const DROP = [0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0];
  async function broken(st, signal) {
    el.classList.add('ks-call--bad');
    const [s, len] = st.a || [0, 0], piece = 0.3;
    for (let t = 0, k = 0; t < len && !signal.aborted; t += piece, k++) {
      const d = Math.min(piece, len - t);
      if (DROP[k % DROP.length]) { audio.sfx('type'); await wait(audio.length([s + t, d], knobs().rate) * 1000, signal); } else await say([s + t, d]).done;
    }
  }

  // Subtitles: hidden, as a bar the length of what was said, until you peek. Tapping a bar plays that line once more,
  // free, before you pay for a peek. `free` lines show; a line that broke up shows only its holes, even on a peek
  // (the transcript after the call has every word).
  function addLine(st, c) {
    const never = st.peek === 'never' || st.signal === 'bad';
    const row = h('div', 'ks-call-line');
    row.dataset.peek = never ? 'never' : st.peek === 'free' ? 'free' : 'hide';
    if (st.who !== call.caller) row.append(h('span', 'ks-call-line-who', `${face(st.who, c.emoji)} ${esc(c.name || '')}`));
    if (never) row.append(h('span', 'ks-call-garble', '……<i>听不清 · the line broke up</i>'));
    else {
      const txt = h('span', 'ks-call-txt');
      txt.append(zh(st.t, { count: st.peek === 'free' || !!knobs().subtitles }), en(st.en));
      const bar = h('span', 'ks-call-redact');
      bar.style.setProperty('--n', [...bare(st.zh)].length);
      row.append(txt, bar);
      if (row.dataset.peek === 'hide' && st.a) {
        Object.assign(row, { tabIndex: 0, title: 'Hear it again (free, once)' });
        row.setAttribute('role', 'button'); row.setAttribute('aria-label', 'Hear that line again');
        row.onkeydown = keyClick;
        row.onclick = async () => {
          if (row.dataset.again || subs.classList.contains('ks-call-subs--open')) return;
          row.dataset.again = '1'; row.removeAttribute('role'); row.tabIndex = -1;
          holds++; row.classList.add('ks-call-again');
          await say(st.a).done;
          holds--; row.classList.remove('ks-call-again');
        };
      }
    }
    lines.append(row);
    while (lines.children.length > 5) lines.firstChild.remove();
    return row;
  }

  // Each turn starts with the subtitles hidden, unless the rung has them on (A5: what they say is up as they say it,
  // and tiles with it), when there's nothing to peek at.
  function newTurn() {
    const on = !!knobs().subtitles;
    turn = { peeked: false, free: false, lines: [] };
    subs.classList.toggle('ks-call-subs--open', on); el.classList.toggle('ks-call--peeked', on);
    peekBtn.disabled = on; peekBtn.innerHTML = on ? PEEK_ON : freePeek() ? PEEK_FREE : PEEK_OFF;
  }
  // A peek shows this turn's lines and the whole mission, and buys the help a hint gives: the reply can earn two
  // stars at most, here and in spaced review, unless the rung makes it free (freePeek). Tiles open up too. On
  // a short screen, where the subtitles have little room above the panel, the caller's last line goes into the panel
  // itself.
  peekBtn.onclick = () => {
    if (turn.peeked || view !== 'live') return;
    turn.peeked = true; peeks++; events.note('peek');
    if ((turn.free = freePeek())) freeUsed = true;
    for (const x of turn.lines) x.peeked = true;
    subs.classList.add('ks-call-subs--open'); el.classList.add('ks-call--peeked');
    peekBtn.disabled = true; peekBtn.innerHTML = PEEK_ON;
    audio.sfx('pop');
    if (!current) return;
    const box = current.panel, help = box.querySelector('.ks-ask-help'), m = box.querySelector('.ks-ask-mission');
    if (m && current.beat.en) { m.textContent = current.beat.en; m.classList.remove('ks-ask-cue'); }
    if (turn.free) current.control?.free(1); // the frame it opens costs nothing
    if (!help.childElementCount) box.querySelector('.ks-hint')?.click();
    const shown = turn.lines.filter((x) => !x.broke && x.st.peek !== 'never'), last = shown[shown.length - 1];
    if (last && subs.clientHeight < 120) {
      const said = h('div', 'ks-call-help-line');
      said.append(zh(last.st.t, { count: false }), en(last.st.en));
      help.prepend(said);
    }
  };

  // Your line. One panel stays open for the whole turn, so a half-built line survives the caller's 喂？. Their patience
  // runs down only while you're silent: building the line (a tile, a key, a check) refills it, the microphone and a
  // replayed line hold it, and tiles or typing get twice as long. When it runs out they nudge; after the last nudge
  // they hang up. A wrong answer gets the caller's own 啊？你说啥？ (the beat's `fail` line) and another go. On Auto
  // pressure the rung sets their patience and their nudges; one who never hangs up leaves a long silence to the panel's
  // own give-up (a skip), as a clockless line does.
  async function yourTurn(beat, attempt, signal, hk) {
    const k = knobs(), times = auto() ? k.patience ?? 1 : 1, never = times === Infinity, patience = never ? 1 : times;
    const nudges = (beat.silence || call.silence || []).slice(0, auto() && k.nudges != null ? k.nudges : undefined), hang = beat.hangup || call.hangup || [];
    const mine = new AbortController(), cancel = () => mine.abort();
    signal.addEventListener('abort', cancel);
    lastBeat = beat;
    ctx.lock(true); el.classList.add('ks-call--turn'); el.classList.remove('ks-call--pad'); setKey('pad', false);
    let n = 0, left = 1, total = 1, busy = false, gone = false;
    // In the Mix without a microphone, one reply a call is typed (writing is what's missing there): the first beat whose
    // key words come to two to four characters.
    const typeIt = beat === typeBeat && !typedOne;
    if (typeIt) typedOne = true;
    const want = typeIt ? 'type' : startMode(turn.peeked || !!k.subtitles);
    let control = null;
    const p = ask(el, beat, atRung(ctx.assist, {
      id: phraseId(scn, beat), level: scn.level, attempt, audio: scn.audio, decoys: decoys(scn), signal: mine.signal, skin: 'call', time: 0,
      mission: beat.en, cue: turn.peeked ? '' : beat.cue, mode: want, hint: turn.peeked ? 1 : 0, free: turn.free,
      giveUpAfter: never ? undefined : 0, control: (c) => (control = c), // the rung's give-up only where nobody hangs up
      onListen: (on) => el.classList.toggle('ks-call--you', on),
      onMiss: () => { for (const x of turn.lines) x.missed = true; const f = (beat.fail || []).find((s) => 'who' in s); if (f && !busy) interject(f); else refill(); },
    }));
    const box = [...el.querySelectorAll(':scope > .ks-ask')].pop();
    // the player's own choice of tiles waits for a peek: until then, say it and check
    if (box.dataset.mode !== want && (box.dataset.mode === 'tiles' || typeIt)) box.querySelector(`.ks-mode[data-m="${want}"]`)?.click();
    // (a newer ask() shows the cue itself; until then it goes where the mission goes)
    const ro = new ResizeObserver(() => { if (box.isConnected) el.style.setProperty('--ks-call-panel', `${box.offsetHeight}px`); });
    ro.observe(box);
    current = { beat, panel: box, control };
    const slow = () => (/^(tiles|type)$/.test(box.dataset.mode) ? 2 : 1) * (settings.get('pressure') === 'panic' ? 0.7 : 1) * patience;
    const draw = () => { waitBar.style.setProperty('--left', (left / total).toFixed(3)); el.classList.toggle('ks-call--hurry', left <= 3); el.classList.toggle('ks-call--impatient', left / total <= 0.5); };
    // (the bar says how long a silence it stands, for tests: nothing on screen shows the number)
    function refill() { total = left = (n ? call.patience ?? 6 : (scn.level === 0 ? levels.patience(0) : beat.time ?? levels.patience(scn.level))) * slow(); waitBar.dataset.secs = +total.toFixed(2); draw(); }
    async function interject(st) { busy = true; await speak(st, signal); busy = false; refill(); }
    const poke = (e) => { if (!busy && !e.target.closest?.('.ks-mic')) refill(); };
    box.addEventListener('pointerdown', poke); box.addEventListener('keydown', poke);
    refill();
    const relaxed = settings.get('pressure') === 'relaxed' || never;
    el.classList.toggle('ks-call--relaxed', relaxed);
    // Nor while you check yourself (Show me's line and its model answer are up until you rate it) or read the verdict:
    // ask() holds its own clock then, and this one is the call's.
    const clockT = relaxed ? 0 : setInterval(() => {
      if (gone || busy || holds || el.classList.contains('ks-call--you') || box.querySelector('.ks-self-row, .ks-win') || window.KS_PAUSE || document.querySelector('.ks-sheet-bg')) return;
      left = Math.max(0, left - (fast() ? 2 : 0.1)); draw();
      if (left > 0) { if (left <= 3 && Math.abs(left - Math.round(left)) < 0.05) audio.sfx('tick'); return; }
      for (const x of turn.lines) x.missed = true;
      if (n < nudges.length) return interject(nudges[n++]); // silence: they fill it
      gone = true; mine.abort('hangup');                            // the last nudge went unanswered
    }, 100);
    try {
      const r = await p;
      if (gone && !signal.aborted) { endedBy = 'them'; await run(hang, hk, state); return { result: 'end', end: final?.end || 'lose' }; }
      if (r.result === 'ok' || r.result === 'skip') { audio.stopAll(); replied(beat, r); } // your answer cuts off a nudge
      return r;
    } finally {
      clearInterval(clockT); ro.disconnect(); signal.removeEventListener('abort', cancel);
      current = null; lastClose = performance.now(); ctx.lock(false);
      el.classList.remove('ks-call--turn', 'ks-call--you', 'ks-call--hurry', 'ks-call--relaxed', 'ks-call--impatient');
    }
  }

  function replied(beat, r) {
    const o = r.alt >= 0 ? beat.alts[r.alt] : beat, entry = o.ans?.[0];
    said.push({ beat, o, entry, stars: r.stars || 0, heard: r.verdict?.heard || '', skipped: r.result === 'skip' });
    if (entry) log.push({ you: true, entry, o });
    newTurn(); lines.innerHTML = '';
    if (!entry) return;
    const mine = h('div', 'ks-call-line ks-call-mine');
    mine.dataset.peek = 'free';
    mine.append(h('span', 'ks-call-line-who', '你 · you'), zh(entry.t, { count: false }));
    lines.append(mine);
  }

  // ---------- the call ends ----------
  // The end card fits the phone: how it went, the stars, one line to type back, the replies that cost a star, and the
  // whole call folded behind its toggle. Call back and Next stay pinned at the bottom, whatever fits above them.
  async function over(out, signal) {
    clearInterval(timer); ctx.lock(false);
    const secs = t0 ? (Date.now() - t0) / 1000 : 0, wasLive = view === 'live';
    el.querySelectorAll(':scope > .ks-ask').forEach((x) => x.remove());
    el.classList.remove('ks-call--turn', 'ks-call--talk', 'ks-call--you', 'ks-call--bad', 'ks-call--also', 'ks-call--pad', 'ks-call--hurry', 'ks-call--impatient');
    const tone = wasLive ? audio.sfx('hangup') : Promise.resolve(); // the line goes dead: 嘟，嘟，嘟
    if (wasLive) await wait(700, signal);
    if (signal.aborted) return;
    // a peek already took its star from the reply it helped (two at most), so the call's score is just the replies'
    const won = out === 'win', stars = won ? Math.max(1, score(state || { stars: [] })) : 0;
    if (state) marks.done(scn.id, { stars, outcome: out });
    setView('over'); el.dataset.state = 'done';
    const [zhHead, enHead] = { done: ['通话结束', 'Call ended'], them: ['对方已挂断', 'They hung up'], you: ['通话结束', 'You hung up'], missed: ['未接来电', 'Missed call'] }[endedBy];
    kind.innerHTML = `<span lang="zh-CN">${zhHead}</span>${secs ? `<span>${mmss(secs)}</span>` : ''}`;
    // the replies worth another listen: the ones that cost a star, else the last two
    const cost = said.filter((s) => s.skipped || s.stars < 3), shown = (cost.length ? cost : said.slice(-2)).slice(-3);
    const sheet = h('section', 'ks-call-over-sheet' + (won ? ' ks-call-won' : ''));
    sheet.setAttribute('aria-label', enHead);
    sheet.innerHTML = `<div class="ks-call-over-body">
        <div class="ks-call-over-head"><b>${won ? 'You got through it.' : esc(enHead)}</b><span>${secs ? `${mmss(secs)} on the phone` : ''}</span></div>
        <div class="ks-call-over-cap"></div>
        <div class="ks-call-over-score"><span class="ks-stars" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></span>${peeks ? `<span class="ks-call-peeks">👀 peeked ×${peeks}</span>` : ''}</div>
        <div class="ks-call-typeback" hidden></div>
        ${shown.length ? `<div class="ks-call-said"><div class="ks-call-said-h">${cost.length ? 'Worth another listen' : 'What you said'}</div></div>` : ''}
        ${log.length ? '<details class="ks-call-tx"><summary><span>Read the whole call</span><button type="button" class="ks-tool ks-call-again-all"><span aria-hidden="true">▶</span> Hear it again</button></summary><div class="ks-call-tx-in"></div></details>' : ''}
      </div>
      <div class="ks-call-over-btns"><button type="button" class="ks-btn ks-btn-quiet ks-call-again">↺ Call back</button><button type="button" class="ks-btn ks-call-next">Next ↓</button></div>`;
    const cap = sheet.querySelector('.ks-call-over-cap');
    if (final?.t) cap.append(zh(final.t, { count: false }));
    if (final?.en) cap.append(en(final.en, 'show'));
    // (your replies as the model says them; theirs as the call played them)
    const hear = (clip, own) => (own ? audio.play(scn.audio, clip) : say(clip));
    const play = (clip, label = 'Hear it', own = true) => { const b = h('button', 'ks-call-play', '🔊'); b.type = 'button'; b.setAttribute('aria-label', label); b.onclick = () => { stopAgain(); audio.stopAll(); hear(clip, own); }; return b; };
    for (const s of shown) {
      const row = h('div', 'ks-call-said-row' + (s.skipped ? ' ks-call-skipped' : ''));
      const txt = h('div', 'ks-call-said-zh');
      txt.append(zh(s.entry.t, { pinyin: 'all', count: false }));
      if (s.o.gloss) txt.append(h('span', 'ks-call-said-en', esc(s.o.gloss)));
      if (s.heard && bare(s.heard) !== bare(s.entry.zh)) txt.append(h('small', '', `you said: <span lang="zh-CN">${esc(s.heard)}</span>`));
      row.append(play(s.o.a), txt, h('span', 'ks-call-said-st', s.skipped ? 'skipped' : '★'.repeat(s.stars)));
      sheet.querySelector('.ks-call-said').append(row);
    }
    // The whole call, every row with its sound: listen, read, listen again. Opened, it starts at the first line that
    // cost you something (peeked, missed, broken up).
    const tx = sheet.querySelector('.ks-call-tx-in'), det = sheet.querySelector('.ks-call-tx'), rows = [];
    for (const x of log) {
      const flag = x.you ? '' : x.broke ? 'broke up' : x.peeked ? 'peeked' : x.missed ? 'missed' : '';
      const row = h('div', 'ks-call-tx-row' + (x.you ? ' ks-call-tx-you' : '') + (flag ? ' ks-call-tx-flag' : ''));
      row.append(h('span', 'ks-call-tx-who', x.you ? '你' : face(x.st.who, x.c.emoji)));
      const body = h('div');
      body.append(zh((x.you ? x.entry : x.st).t, { count: false }));
      if (!x.you) body.append(en(x.st.en));
      if (flag) body.append(h('span', 'ks-call-tx-tag', flag));
      row.append(body, play(x.you ? x.o.a : x.st.a, 'Hear this line', x.you));
      tx.append(row); rows.push({ row, clip: x.you ? x.o.a : x.st.a, own: x.you });
    }
    const firstFlag = tx?.querySelector('.ks-call-tx-flag');
    det?.addEventListener('toggle', () => { if (det.open && firstFlag) tx.scrollTop = Math.max(0, firstFlag.offsetTop - 8); });
    // Hear it again: every line in order, no subtitles (the text blurs while it plays)
    let againAc = null;
    function stopAgain() { againAc?.abort(); againAc = null; tx?.classList.remove('ks-call-tx-blind'); const b = sheet.querySelector('.ks-call-again-all'); if (b) b.innerHTML = '<span aria-hidden="true">▶</span> Hear it again'; rows.forEach((r) => r.row.classList.remove('ks-call-tx-now')); }
    const againBtn = sheet.querySelector('.ks-call-again-all');
    if (againBtn) againBtn.onclick = async (e) => {
      e.preventDefault(); // it sits in the toggle's row: playing doesn't open or close the text
      if (againAc) return stopAgain();
      audio.stopAll();
      const a = (againAc = new AbortController());
      againBtn.innerHTML = '<span aria-hidden="true">■</span> Stop';
      tx.classList.add('ks-call-tx-blind');
      for (const r of rows) {
        if (a.signal.aborted || !sheet.isConnected) return; // swiped away (reset() took the sheet): not on the next card
        r.row.classList.add('ks-call-tx-now');
        await hear(r.clip, r.own).done;
        r.row.classList.remove('ks-call-tx-now');
        await wait(250, a.signal);
      }
      if (againAc === a) stopAgain();
    };
    endNote(scn, sheet.querySelector('.ks-call-typeback'), el); // the endings found, the next episode's day (under the stars)
    typeBack(sheet.querySelector('.ks-call-typeback'), sheet);
    sheet.querySelector('.ks-call-again').onclick = () => { stopAgain(); restart(); };
    sheet.querySelector('.ks-call-next').onclick = () => { stopAgain(); ctx.next(); };
    el.append(sheet);
    // The sheet never scrolls (a swipe on it is for the feed): the replies that don't fit go, the last first, and all
    // of them if not one fits (the whole call has every line); anything still cut fades out.
    const body = sheet.querySelector('.ks-call-over-body'), list = sheet.querySelector('.ks-call-said');
    const cut = (x) => x.scrollHeight > x.clientHeight + 4;
    requestAnimationFrame(() => {
      while (list && cut(list) && list.children.length > 2) list.lastElementChild.remove();
      if (list && cut(list)) list.remove();
      body.classList.toggle('ks-call-over-more', cut(body));
    });
    await tone;
    if (final?.a && !signal.aborted && !againAc) say(final.a); // the closing line, once the tone stops
  }

  // Type it back, from memory: the reply that went worst (then the longest) plays as dictation and you type it, with
  // its meaning behind Hint and the rest of the card out of sight. Short replies (喂，您好) are left out: nothing to
  // write. It's an ordinary ask(), so it counts in spaced review.
  function typeBack(box, sheet) {
    const len = (zhs) => [...bare(zhs)].length;
    const pool = said.filter((s) => !s.skipped && s.entry && len(s.entry.zh) > 5).sort((a, b) => a.stars - b.stars || len(b.entry.zh) - len(a.entry.zh));
    const pick = pool[0] || (!said.length && lastBeat?.ans?.[0] && len(lastBeat.answers[0]) > 5 ? { beat: lastBeat, o: lastBeat, entry: lastBeat.ans[0] } : null);
    if (!pick) return;
    const { beat, o, entry } = pick, meaning = o.gloss || beat.en;
    const idle = () => { box.innerHTML = '<div><b>Type it back</b><span>One of your lines: hear it, then type it.</span></div><button type="button" class="ks-btn ks-btn-quiet">⌨️ Type it</button>'; box.querySelector('button').onclick = start; };
    async function start() {
      const again = box.querySelector('button');
      again.innerHTML = '🔊 Again'; again.onclick = () => { audio.stopAll(); audio.play(scn.audio, o.a); }; // the dictation, as often as you like
      sheet.classList.add('ks-call-typing'); ctx.lock(true);
      audio.stopAll(); audio.play(scn.audio, o.a);
      const p = ask(el, beat, { id: phraseId(scn, beat), level: scn.level, audio: scn.audio, decoys: decoys(scn), signal: ac?.signal, skin: 'call', time: 0, mission: meaning, cue: 'Type what you heard.', mode: 'type', log: { task: 'typeback' } });
      const panel = [...el.querySelectorAll(':scope > .ks-ask')].pop();
      if (panel.dataset.mode !== 'type') panel.querySelector('.ks-mode[data-m="type"]')?.click();
      // the card sits above the panel, so its free 🔊 Again stays in reach (the panel's own Hear costs stars)
      const ro = new ResizeObserver(() => { if (panel.isConnected) el.style.setProperty('--ks-call-panel', `${panel.offsetHeight}px`); });
      ro.observe(panel);
      const r = await p;
      ro.disconnect(); sheet.classList.remove('ks-call-typing'); ctx.lock(false);
      if (r.result !== 'ok') return idle();
      box.innerHTML = `<div><b>Typed it ${'★'.repeat(r.stars)}</b><span lang="zh-CN">${esc(entry.zh)}</span></div>`;
    }
    box.hidden = false;
    idle();
  }

  // ---------- buttons ----------
  const setKey = (k, on) => el.querySelector(`.ks-call-key[data-k="${k}"]`)?.setAttribute('aria-pressed', String(on));
  $('.ks-call-yes').onclick = () => { audio.unlock(); answer(); };
  $('.ks-call-no').onclick = () => { audio.unlock(); decline(); };
  // The red button sits where Continue was a moment ago: ignore it just after a panel closes, and ask for a second tap.
  const disarm = () => { clearTimeout(armed); armed = 0; hangBtn.classList.remove('ks-call-armed'); };
  hangBtn.onclick = () => {
    if (view !== 'live' || el.classList.contains('ks-call--turn') || performance.now() - lastClose < 800) return;
    if (!armed) { armed = setTimeout(disarm, 2500); hangBtn.classList.add('ks-call-armed'); return; }
    disarm();
    endedBy = 'you'; final = { end: 'lose', en: 'You hung up on them. Call back and see it through.' };
    ac?.abort(); audio.stopAll();
    over('lose', (ac = new AbortController()).signal);
  };
  el.querySelectorAll('.ks-call-key').forEach((b) => (b.onclick = () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    if (b.dataset.k === 'pad') { el.classList.toggle('ks-call--pad', on); $('.ks-call-pad-num').textContent = ''; }
  }));
  $('.ks-call-pad').onclick = (e) => {
    const k = e.target.closest('button')?.dataset.k;
    if (!k) return;
    audio.sfx('tick');
    const n = $('.ks-call-pad-num'); n.textContent = (n.textContent + k).slice(-14);
  };

  // (a call built, or thrown away, while it isn't the card on screen has nothing of its own playing: the Mix deals a card
  // ahead, and swaps it, while the card on screen is talking, so only the call on screen stops the sound)
  function reset() {
    stopRing(); clearInterval(timer); ac?.abort(); if (ctx.isActive?.() ?? true) audio.stopAll(); disarm();
    el.querySelectorAll(':scope > .ks-ask, .ks-call-over-sheet, .ks-call-vm').forEach((x) => x.remove());
    el.classList.remove('ks-call--turn', 'ks-call--talk', 'ks-call--you', 'ks-call--bad', 'ks-call--also', 'ks-call--pad', 'ks-call--hurry', 'ks-call--peeked', 'ks-call--impatient');
    el.querySelectorAll('.ks-call-key').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    lines.innerHTML = ''; caption(''); t0 = 0; holds = 0; newTurn(); ctx.lock(false); label();
    setView('ring'); el.dataset.state = 'idle';
    kind.innerHTML = `${ICON.phone}<span lang="zh-CN">来电</span><i>incoming call</i>`;
    showClock();
  }
  function restart() { declines = 0; reset(); ring(); }
  reset();

  return {
    enter() { audio.load(scn.audio); restart(); }, // the phone rings the moment the card is on screen
    leave() { reset(); },
    destroy() { reset(); },
  };
}

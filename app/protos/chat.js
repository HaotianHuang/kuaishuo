// Chats (聊): a WeChat conversation on the phone, one card in the feed. The card opens on the chat list; tap the
// conversation (or wait a beat) and the story plays as messages landing at chat pace: text to read, voice notes to hear
// before you read, stickers, photos, articles, red packets and WeChat's grey system lines. At your turn the input bar
// becomes the answer panel, and what you send lands as your own green bubble. Fields: content/formats/chat.md.
import * as audio from '../shared/audio.js';
import { ask } from '../shared/ask.js';
import { run, score } from '../shared/story.js';
import { chrome, atRung, endNote } from '../shared/feed.js';
import { zh, en, h, esc, showAll, shown } from '../shared/text.js';
import { decoys, phraseId } from '../shared/content.js';
import { marks, settings } from '../shared/store.js';
import { sim, canListen } from '../shared/speech.js';
import { wait, fast } from '../shared/time.js';
import { endKey } from '../shared/days.js';
import * as art from '../shared/art.js';

export const format = 'chat';
// The feed's opening order (main.js sorts by it): v1's five first, as they came before the catalogue grew; the rest after.
export const order = ['first-date', 'flat-flood', 'family-group', 'late-boss', 'rent-rise'];

const TINTS = ['#ffd9a8', '#c6e2ff', '#ffcade', '#d4efc4', '#e3d5ff', '#fff1a6'];
const ME = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" fill="#c8cdd5"/><circle cx="20" cy="15.5" r="7.5" fill="#fff"/><path d="M5 40c1.6-8.6 7.4-13 15-13s13.4 4.4 15 13z" fill="#fff"/></svg>';
const WAVE = '<svg class="ks-chat-wave" viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="10" r="1.7"/><path d="M8 6.2a5.4 5.4 0 0 1 0 7.6"/><path d="M11.6 3a10 10 0 0 1 0 14"/></svg>';
const VOICE = '<svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12.5 11a5.6 5.6 0 0 1 0 8M16 8.2a9.6 9.6 0 0 1 0 13.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9.6" cy="15" r="1.3" fill="currentColor"/></svg>';
const PREVIEW = { voice: '[语音]', sticker: '[动画表情]', photo: '[图片]', link: '[链接]', packet: '[微信红包]' };
// the chats every WeChat list has, so the new one sits among them
const OLD = [['📁', '#3cb371', '文件传输助手', '[文件]', '昨天'], ['📰', '#4b8df8', '订阅号消息', '[链接]', '星期二'], ['🔔', '#f2a33a', '服务通知', '[通知]', '星期一']];
const strip = (s) => String(s || '').replace(/[\s，。？！、；：“”‘’（）《》…—,.?!;:'"()~-]/g, '');
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const restart = (n, cls) => { n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); };
// a voice-message mission, when the answer will be typed: "Hold to talk: tell Grandma…" → "Tell Grandma…"
const unvoice = (s) => { const t = String(s).replace(/^(hold to talk|send a voice (?:message|note))\s*[:,.]\s*/i, ''); return t.charAt(0).toUpperCase() + t.slice(1); };
const SPK = (on) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>${on ? '<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' : '<path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'}</svg>`;
const graphemes = (s) => (Intl.Segmenter ? [...new Intl.Segmenter().segment(s)].length : [...s].length);

export function createCard(el, scn, ctx) {
  const chat = scn.chat || {}, cast = scn.cast || {}, keys = Object.keys(cast), group = !!chat.group;
  const peer = cast[chat.with] || cast[keys[0]] || {}, name = (k) => cast[k]?.name || k;
  const tint = Object.fromEntries(keys.map((k, i) => [k, TINTS[i % TINTS.length]]));
  const packets = new Map();   // a say id → the red packet it opens: { st, btn, open }
  let ac = null;
  el.classList.add('ks-chat');
  if (fast()) el.classList.add('ks-chat-fast');   // tests run at speed: no half-finished animations in their screenshots
  const [c1, c2] = scn.bg || ['#17324d', '#3d7cb3'];
  el.style.setProperty('--c1', c1); el.style.setProperty('--c2', c2);

  function avatar(k) {
    if (!k) return h('span', 'ks-chat-av ks-chat-av-me', ME);
    const a = h('span', 'ks-chat-av', esc(cast[k]?.emoji || '🙂'));
    a.style.background = tint[k] || '#ddd'; a.setAttribute('aria-hidden', 'true'); a.dataset.who = k;
    portrait(a);
    return a;
  }
  // the art, once it's in (art.js): everyone's pixel portrait in place of their emoji, those already drawn included (you
  // keep the outline: the player has no face of their own in a chat)
  let A = null;
  function portrait(a) { const url = A?.av[a.dataset.who]; if (url) { a.innerHTML = art.face(url); a.classList.add('ks-chat-av-art'); } }
  art.of(scn).then((x) => { if (x) { A = x; el.querySelectorAll('[data-who]').forEach(portrait); } });

  // ---------- the chat list: where the card starts ----------
  const first = scn.steps.find((s) => 'who' in s) || {};
  const peek = (PREVIEW[first.kind] || '') + (['text', 'link', 'packet', undefined].includes(first.kind) ? first.zh || '' : '');
  const list = h('div', 'ks-chat-list', `<div class="ks-chat-lhead"><b lang="zh-CN">微信</b><i aria-hidden="true">⊕</i></div><div class="ks-chat-search" aria-hidden="true"><span lang="zh-CN">搜索</span></div>`);
  const row = h('button', 'ks-chat-row ks-chat-row-new');
  row.type = 'button';
  row.setAttribute('aria-label', `Open the chat with ${group ? chat.group.zh : peer.name}`);
  row.append(group ? h('span', 'ks-chat-av ks-chat-av-grid', keys.slice(0, 4).map((k) => `<i data-who="${esc(k)}">${esc(cast[k].emoji)}</i>`).join('')) : avatar(chat.with || keys[0]));
  row.insertAdjacentHTML('beforeend', `<span class="ks-chat-badge">1</span><span class="ks-chat-row-t"><b lang="zh-CN">${esc(group ? chat.group.zh : peer.name)}</b><span lang="zh-CN">${esc((group && first.who ? name(first.who) + ': ' : '') + peek)}</span></span><time>${esc(first.clock || '')}</time>`);
  list.append(row);
  for (const [e, bg, n, p, t] of OLD) list.insertAdjacentHTML('beforeend', `<div class="ks-chat-row" aria-hidden="true"><span class="ks-chat-av" style="background:${bg}">${e}</span><span class="ks-chat-row-t"><b lang="zh-CN">${n}</b><span lang="zh-CN">${p}</span></span><time lang="zh-CN">${t}</time></div>`);
  list.insertAdjacentHTML('beforeend', '<p class="ks-chat-tap">Tap the chat to open it</p>');

  // ---------- the conversation ----------
  const room = h('div', 'ks-chat-room', `<header class="ks-chat-top"><div class="ks-chat-title"><span class="ks-chat-name" lang="zh-CN"></span><span class="ks-chat-typing" lang="zh-CN"></span></div><button type="button" class="ks-chat-loud"></button></header>
    <div class="ks-chat-log" role="log" aria-live="polite"></div>
    <div class="ks-chat-rec" aria-hidden="true">${VOICE}<div><i></i><i></i><i></i><i></i><i></i></div><b lang="zh-CN">正在听…</b><small>Listening…</small></div>
    <footer class="ks-chat-bar"><div class="ks-chat-idle" aria-hidden="true"><span class="ks-chat-ic">${VOICE}</span><span class="ks-chat-field"></span><span class="ks-chat-ic">😊</span><span class="ks-chat-ic">⊕</span></div></footer>`);
  const $ = (s) => room.querySelector(s);
  const log = $('.ks-chat-log'), bar = $('.ks-chat-bar'), title = $('.ks-chat-title'), nameEl = $('.ks-chat-name');
  if (group) { nameEl.append(zh(chat.group.t || [[chat.group.zh]], { pinyin: 'none', count: false })); nameEl.insertAdjacentHTML('beforeend', `<span>(${+chat.members || keys.length + 1})</span>`); }
  else nameEl.textContent = peer.name || '';
  el.append(list, room);
  const { rail } = chrome(el, scn, { replay: () => begin(), settings: () => ctx.openSettings() });
  // Read aloud: each incoming text is heard after it has been read. The 🔊 in the top bar (and the rail) turns it off.
  const reading = () => settings.get('chatRead') !== false;
  const loud = $('.ks-chat-loud'), readB = h('button', 'ks-rail-b ks-chat-read-b');
  readB.type = 'button';
  rail.append(readB);
  const drawLoud = () => {
    const on = reading();
    loud.innerHTML = SPK(on); readB.innerHTML = `${SPK(on)}<span>Read aloud</span>`;
    for (const b of [loud, readB]) { b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', `Read messages aloud: ${on ? 'on' : 'off'}`); }
  };
  loud.onclick = readB.onclick = (e) => { e.stopPropagation(); settings.set('chatRead', !reading()); if (!reading()) audio.stopAll(); drawLoud(); };
  drawLoud();

  // One-on-one, the top bar says the other side is typing (or talking, before a voice note); groups show nothing.
  const typing = (text) => { if (group) return; title.classList.toggle('ks-chat-is-typing', !!text); $('.ks-chat-typing').textContent = text || ''; };
  // the log follows the newest message (it can't be scrolled by hand while the chat plays); once it's full, the top fades
  const down = (how = smooth()) => { log.scrollTo({ top: log.scrollHeight, behavior: how }); log.classList.toggle('ks-chat-full', log.scrollHeight > log.clientHeight + 4); };
  const push = (n) => { log.append(n); down(); return n; };
  // their voices slower at the rungs that slow them (assist.js: rate), the same pitch; yours (own: the model answer) as is
  const rate = (own) => (own ? 1 : ctx.assist?.knobs.rate);
  const say = (clip, own) => audio.play(scn.audio, clip, { rate: rate(own) });
  const hear = (clip, own) => { if (clip) { audio.stopAll(); say(clip, own); } };
  const words = (st, cls) => { const d = h('div', cls); d.append(zh(st.t), en(st.en)); d.onclick = () => hear(st.a); return d; };

  // ---------- messages ----------
  function message(st) {
    const kind = st.kind || 'text', m = h('div', `ks-chat-msg ks-chat-k-${kind}`), body = h('div', 'ks-chat-body');
    if (group) body.append(h('div', 'ks-chat-from', esc(name(st.who))));
    m.append(avatar(st.who), body);
    if (kind === 'voice') {
      // listening first: the words stay hidden until 转文字
      const secs = st.secs || Math.max(1, Math.round(audio.length(st.a || [0, 2], rate())));
      const b = h('button', 'ks-chat-bub ks-chat-vn', `${WAVE}<span class="ks-chat-secs">${secs}″</span><i class="ks-chat-dot"></i>`);
      b.type = 'button'; b.style.setProperty('--secs', Math.min(secs, 60)); b.setAttribute('aria-label', `Voice message, ${secs} seconds`);
      b.onclick = () => voice(b, st.a);
      const stt = h('button', 'ks-chat-stt', '转文字');
      stt.type = 'button'; stt.lang = 'zh-CN'; stt.setAttribute('aria-label', 'Show the words');
      stt.onclick = () => stt.replaceWith(words(st, 'ks-chat-trans'));
      body.append(b, stt);
    } else if (kind === 'sticker') {
      // a sticker's words are part of the picture, so no pinyin over them; a tap on a word still gives it
      const s = h('div', 'ks-chat-stk', `<span class="ks-chat-art" aria-hidden="true">${esc(st.art || '🙂')}</span>`);
      s.style.setProperty('--n', Math.min(3, graphemes(st.art || '🙂')));
      s.append(zh(st.t, { cls: 'ks-chat-stk-zh', pinyin: 'none' }));
      s.onclick = () => hear(st.a);
      body.append(s, en(st.en));
    } else if (kind === 'photo') {
      const p = h('button', 'ks-chat-pic', `<span class="ks-chat-art" aria-hidden="true">${esc(st.art || '🖼️')}</span>`);
      p.type = 'button'; p.setAttribute('aria-label', 'Open the photo');
      p.onclick = () => view(st);
      body.append(p, words(st, 'ks-chat-pic-cap'));
    } else if (kind === 'link') {
      const l = h('div', 'ks-chat-link'), t = h('div', 'ks-chat-link-t'), mid = h('div', 'ks-chat-link-m');
      t.append(zh(st.t));
      mid.append(en(st.en)); mid.insertAdjacentHTML('beforeend', `<span class="ks-chat-art" aria-hidden="true">${esc(st.art || '📰')}</span>`);
      l.append(t, mid, h('div', 'ks-chat-link-f', '<span lang="zh-CN">公众号</span>'));
      l.onclick = () => hear(st.a);
      body.append(l);
    } else if (kind === 'packet') {
      const b = h('button', 'ks-chat-pkt', '<span class="ks-chat-pkt-ic" aria-hidden="true"></span><span class="ks-chat-pkt-t"></span><span class="ks-chat-pkt-f" lang="zh-CN">微信红包</span>');
      b.type = 'button'; b.setAttribute('aria-label', 'Red packet');
      b.querySelector('.ks-chat-pkt-t').append(zh(st.t));
      const pk = { st, btn: b, open: false };
      if (st.packet?.gate) packets.set(st.packet.gate, pk);
      b.onclick = () => envelope(pk, !st.packet?.gate);
      body.append(b, en(st.en));
    } else {
      const b = h('div', 'ks-chat-bub'), line = zh(st.t, { cls: 'ks-chat-zh' });
      if (st.mention && chat.me) { const at = h('span', 'ks-chat-at', '@'); at.append(zh(chat.me.t || [[chat.me.zh]], { pinyin: 'none', count: false })); line.prepend(at, ' '); }
      if (st.tail) line.append(h('span', 'ks-chat-tail', esc(st.tail)));
      b.append(line, en(st.en));
      b.onclick = () => hear(st.a);
      body.append(b);
    }
    return m;
  }
  async function voice(b, clip, own) {
    audio.stopAll();
    b.querySelector('.ks-chat-dot')?.remove();
    b.classList.add('ks-chat-playing');
    await say(clip, own).done;
    b.classList.remove('ks-chat-playing');
  }
  function view(st) {
    const v = h('div', 'ks-chat-view', `<span class="ks-chat-art" aria-hidden="true">${esc(st.art || '🖼️')}</span>`);
    v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Photo, tap to close');
    v.append(zh(st.t, { cls: 'ks-chat-view-zh' }), en(st.en, 'show'));
    v.onclick = () => v.remove();
    room.append(v);
  }
  // A red packet: sealed, 開 greyed, until its gate beat is passed; then it opens with a spin and the amount.
  function envelope(pk, free = false) {
    room.querySelector('.ks-chat-env-bg')?.remove();
    const c = cast[pk.st.who] || {}, v = h('div', 'ks-chat-env-bg' + (pk.open ? ' ks-chat-env-opened' : free ? '' : ' ks-chat-env-sealed'));
    v.innerHTML = `<div class="ks-chat-env" role="dialog" aria-label="Red packet"><div class="ks-chat-env-top"><span class="ks-chat-av">${esc(c.emoji || '🧧')}</span><b lang="zh-CN">${esc(c.name || '')}的红包</b><div class="ks-chat-env-msg"></div></div>
      <button type="button" class="ks-chat-coin" lang="zh-CN" aria-label="Open it">開</button>
      <div class="ks-chat-env-res"><span lang="zh-CN">${esc(c.name || '')}的红包</span><b>¥${(+pk.st.packet?.amount || 0).toFixed(2)}</b><span lang="zh-CN">已存入零钱</span>${[...Array(8)].map((_, i) => `<i class="ks-chat-spark" style="--a:${i * 45 + 20}deg" aria-hidden="true">✦</i>`).join('')}</div>
      <p class="ks-chat-env-note">Say the right thing in the chat and it opens.</p></div>`;
    v.querySelector('.ks-chat-env-msg').append(zh(pk.st.t, { count: false }));
    v.querySelector('.ks-chat-coin').onclick = (e) => { e.stopPropagation(); if (free && !pk.open) openPacket(pk, ac?.signal); };
    v.onclick = () => v.remove();
    room.append(v);
    return v;
  }
  async function openPacket(pk, signal) {
    const v = envelope(pk, true);
    await wait(450, signal);
    restart(v, 'ks-chat-env-spin'); audio.sfx('whoosh');
    await wait(850, signal);
    pk.open = true; v.classList.add('ks-chat-env-opened'); audio.sfx('yes'); audio.buzz(30);
    pk.btn.classList.add('ks-chat-pkt-done');
    pk.btn.querySelector('.ks-chat-pkt-t').insertAdjacentHTML('beforeend', '<span class="ks-chat-pkt-got" lang="zh-CN">已领取</span>');
    await wait(1700, signal);
    v.classList.add('ks-chat-env-out');
    await wait(250, signal);
    v.remove();
  }
  function system(st) {
    const s = h('div', 'ks-chat-sys' + (/红包/.test(st.zh || '') ? ' ks-chat-sys-pkt' : ''));
    s.append(zh(st.t, { cls: 'ks-chat-sys-zh' }), en(st.narr));
    s.onclick = () => hear(st.a);
    return s;
  }
  // the narrator, outside the phone: the set-up line, and the closing one
  function story(st, text) {
    const s = h('div', 'ks-chat-story');
    if (st.t) s.append(zh(st.t, { cls: 'ks-chat-story-zh' }));
    if (text && (shown('english') !== 'none' || !st.t)) s.append(h('div', 'ks-chat-story-en', esc(text)));
    s.onclick = () => hear(st.a);
    return s;
  }

  // ---------- the story, as a chat ----------
  // Read first, then hear: an incoming text plays its clip after its reading pause. Clips queue, so voices never talk
  // over each other, and the story doesn't wait for them.
  let voices = Promise.resolve(), missed = null;
  const aloud = (clip, signal) => { if (clip && reading()) voices = voices.then(() => (signal.aborted || !reading() ? null : say(clip).done)); };
  const hooks = (signal) => ({
    async line(st) {
      const n = strip(st.zh).length, first = !log.querySelector('.ks-chat-msg');
      // the first message lands at once; typing pauses stay short, longer only where the script wants suspense
      const pause = first ? 0 : Math.min(st.typing ?? 0.3 + 0.05 * n, (st.typing ?? 0) >= 2 ? 1.2 : n <= 8 ? 0.5 : 0.9);
      typing(st.kind === 'voice' ? '对方正在讲话…' : '对方正在输入…');
      await wait(pause * 1000, signal);
      typing(null);
      if (signal.aborted) return;
      if (st.clock) push(h('div', 'ks-chat-time', esc(st.clock)));
      const m = push(message(st));
      audio.sfx('pop');
      if (st.fx === 'shake') { restart(m, 'ks-chat-jolt'); audio.buzz(60); }
      if (st.kind === 'voice') { await voices; await voice(m.querySelector('.ks-chat-vn'), st.a); await wait(200, signal); }
      else if (st.recall) {
        // about to be unsent: heard as it lands, and up long enough to read (0.4 s a character, 4 s at least below level 4)
        await voices;
        await Promise.all([say(st.a).done, wait(Math.max(st.recall, 0.4 * n, scn.level < 4 ? 4 : 0) * 1000, signal)]);
        m.classList.add('ks-chat-gone');
        await wait(360, signal);
        m.remove();
      } else {
        await wait(Math.min(1200, 250 + 45 * n), signal);
        aloud(st.a, signal);
      }
    },
    async narr(st) {
      if (st.kind === 'system') {
        // the line you never sent goes out too late, and bounces (消息已发出，但被对方拒收了)
        if (st.bounce && missed) { push(mine(missed, { result: 'bounce', alt: -1 })[0]); audio.sfx('no'); await wait(600, signal); }
        push(system(st));
        if (st.fx === 'shake') { restart(room, 'ks-chat-jolt'); audio.buzz(40); }
        aloud(st.a, signal);
        await wait(800, signal);
        return;
      }
      push(story(st, st.narr));
      aloud(st.a, signal);
      await wait(Math.min(1500, 500 + st.narr.split(/\s+/).length * 60), signal);
    },
    async sfx(st) {
      if (st.sfx === 'buzz') { restart(room, 'ks-chat-jolt'); audio.buzz(180); }
      await Promise.race([audio.sfx(st.sfx), wait(500, signal)]);
    },
    say: (beat, attempt) => turn(beat, attempt, signal),
    async end(st) {
      el.dataset.end = endKey(st); // the ending this run reached: its card row names it (days.js endings)
      push(story(st, st.en)).classList.add('ks-chat-story-end', st.end === 'lose' ? 'ks-chat-story-lose' : 'ks-chat-story-win');
      await voices;
      await Promise.all([st.a ? say(st.a).done : null, wait(1600, signal)]);
    },
  });

  // ---------- your turn: the input bar becomes the answer panel ----------
  const sent = {};   // a say id → what the player sent, for the end sheet
  let silent = 0;    // silent timeouts in a row on this beat
  async function turn(beat, attempt, signal) {
    if (attempt === 1) silent = 0;
    typing(null);
    ctx.lock(true);
    el.classList.add('ks-chat-myturn');
    // no microphone (the artifact): a voice-message beat is typed instead, since writing is what this format trains
    const typeIt = !sim() && beat.reply === 'speak' && !canListen();
    const o = atRung(ctx.assist, {
      id: phraseId(scn, beat), level: scn.level, attempt, audio: scn.audio, signal, skin: 'chat', cue: beat.cue,
      decoys: beat.decoys?.length ? beat.decoys : decoys(scn),
      // a simulated voice (tests, demos) can only speak, so it gets the mic; people get the beat's own way to reply
      mode: typeIt ? 'type' : beat.reply,
      mission: typeIt ? unvoice(beat.en) : undefined,
    });
    // the rung's echo (A5) waits behind their voices still queued (aloud), so it never talks over them
    if (o.echo) o.echo = voices;
    const p = ask(bar, beat, o);
    const panel = bar.querySelector('.ks-ask--chat');
    const ro = new ResizeObserver(() => requestAnimationFrame(() => down('auto')));
    ro.observe(panel); down();
    const r = await p;
    ro.disconnect(); ctx.lock(false);
    el.classList.remove('ks-chat-myturn');
    if (signal.aborted || r.result === 'cancel') return r;
    // Silent twice running, and the other side gives up on you: the chat's `giveup` lines, then the 聊崩了 sheet.
    if (r.result === 'timeout' && !r.tried && ++silent >= 2) {
      missed = beat;
      const out = await run(chat.giveup?.length ? chat.giveup : [{ end: 'lose', en: 'They gave up waiting for you.' }], hooks(signal), { stars: [], said: [], signal });
      return { result: 'end', end: out || 'lose' };
    }
    if (r.result === 'ok' || r.result === 'skip') {
      const [m, fix] = mine(beat, r);
      push(m); audio.sfx('pop');
      if (r.result === 'ok') sent[beat.id] = { said: String(r.verdict?.heard || ''), bad: slips(r).map(([got]) => got), mode: r.mode };
      if (fix) { await wait(700, signal); push(fix); audio.sfx('pop'); }
      await wait(450, signal);
      const pk = packets.get(beat.id);
      if (pk && !pk.open && !signal.aborted) await openPacket(pk, signal);
    }
    return r;
  }
  // What you sent, as your own bubble: characters as you typed them (a wrong one struck through, then put right in a
  // second bubble, *辣, as people do); pinyin, tiles and speech as the answer they matched. A line sent too late, after
  // the other side has given up, bounces with WeChat's red !.
  // typed characters the keyboard got wrong, same sound (再 for 在) or another tone (拉 for 辣): [typed, meant]
  // (the judge's verdict.slip, when it has one, says the same thing)
  const slips = (r) => {
    const v = r.verdict || {}, out = r.mode === 'type' ? [...(v.chars || []).map((c) => [c.got, c.want]), ...(v.tones || []).filter((t) => t.heard).map((t) => [t.heard, t.ch])] : [];
    for (const x of [].concat(v.slip || [])) if (x?.got && x?.want && !out.some(([g]) => g === x.got)) out.push([x.got, x.want]);
    return out.filter(([g, w]) => g && w && g !== w);
  };
  function mine(beat, r) {
    const o = r.alt >= 0 ? beat.alts[r.alt] : beat, v = r.verdict || {};
    const entry = v.entry || o.ans?.[0] || { zh: o.answers[0], t: [[o.answers[0]]] };
    const said = String(v.heard || '').trim(), skipped = r.result === 'skip', bounced = r.result === 'bounce';
    const spoken = !skipped && !bounced && (r.mode === 'speak' || r.mode === 'self');
    const wrong = new Set(slips(r).map(([got]) => got));
    const own = !skipped && !bounced && /[一-鿿]/.test(said) && strip(said) !== strip(entry.zh);
    const text = () => (own ? h('span', 'ks-zh ks-chat-zh', [...said].map((c) => (wrong.has(c) ? `<s>${esc(c)}</s>` : esc(c))).join('')) : zh(entry.t, { cls: 'ks-chat-zh', count: false }));
    const bubble = (cls) => h('div', 'ks-chat-msg ks-chat-mine' + cls);
    const m = bubble((skipped ? ' ks-chat-skipped' : '') + (bounced ? ' ks-chat-bounced' : '')), body = h('div', 'ks-chat-body');
    if (spoken) {
      const secs = Math.max(2, Math.round(strip(entry.zh).length * 0.4));
      const b = h('button', 'ks-chat-bub ks-chat-vn', `<span class="ks-chat-secs">${secs}″</span>${WAVE}`);
      b.type = 'button'; b.style.setProperty('--secs', secs); b.setAttribute('aria-label', 'Your voice message: hear it said');
      b.onclick = () => voice(b, o.a, true);
      const t = h('div', 'ks-chat-trans'); t.append(text());
      body.append(b, t);
    } else {
      const b = h('div', 'ks-chat-bub'); b.append(text()); b.onclick = () => hear(o.a, true);
      if (bounced) b.insertAdjacentHTML('afterbegin', '<i class="ks-chat-bang" role="img" aria-label="Not delivered">!</i>');
      body.append(b);
    }
    if (!skipped && !bounced) body.insertAdjacentHTML('beforeend', `<div class="ks-chat-stars" aria-label="${r.stars || 0} of 3 stars">${'★'.repeat(r.stars || 0)}<i>${'★'.repeat(3 - (r.stars || 0))}</i></div>`);
    m.append(avatar(null), body);
    if (!own || !wrong.size) return [m, null];
    const fix = bubble(''), fb = h('div', 'ks-chat-body');
    fb.append(h('div', 'ks-chat-bub', `<span class="ks-zh ks-chat-zh" lang="zh-CN">*${esc(slips(r).map(([, want]) => want).join(''))}</span>`));
    fix.append(avatar(null), fb);
    return [m, fix];
  }

  // 按住 说话: WeChat records while you hold. ask()'s mic is tap to start and tap to stop, so a press starts it at once
  // and a release after a real hold stops it: holding and tapping both work.
  let held = 0, swallow = false;
  const micOf = (e) => e.target.closest?.('.ks-ask--chat .ks-mic');
  const listening = () => !!bar.querySelector('.ks-ask--chat.ks-listening');
  el.addEventListener('pointerdown', (e) => {
    const m = micOf(e);
    if (!m || e.button > 0 || listening()) return;
    held = performance.now(); swallow = true; el.classList.add('ks-chat-holding');
    m.click();
  });
  const release = (e) => {
    if (!held) return;
    const long = e.type === 'pointerup' && performance.now() - held > 400, m = bar.querySelector('.ks-ask--chat .ks-mic');
    held = 0; el.classList.remove('ks-chat-holding');
    if (long && m && listening()) m.click();
    setTimeout(() => (swallow = false), 400);
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  // the click that follows a press was already handled by the press
  el.addEventListener('click', (e) => { if (swallow && e.isTrusted && micOf(e)) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
  el.addEventListener('contextmenu', (e) => { if (micOf(e)) e.preventDefault(); });

  // ---------- chat over: stars, and every line, to hear again; a lost chat starts with the line you never sent ----------
  const beats = {};
  const walk = (l) => (l || []).forEach((st) => { if (st.say) { beats[st.say.id] = st.say; walk(st.say.ok); walk(st.say.fail); (st.say.alts || []).forEach((a) => walk(a.then)); } });
  walk(scn.steps);
  // what you typed (or said), where it differs from the model line: the characters that aren't in it marked
  function youSent(s, entry) {
    const want = new Set([...strip(entry?.zh)]), bad = new Set(s.bad);
    const mark = (c) => (bad.has(c) || (/[一-鿿]/.test(c) && !want.has(c)) ? `<mark>${esc(c)}</mark>` : esc(c));
    return h('div', 'ks-chat-said-you', `${s.mode === 'speak' || s.mode === 'self' ? 'you said' : 'you typed'}: <span lang="zh-CN">${[...s.said].map(mark).join('')}</span>`);
  }
  function finish(out, state) {
    const stars = score(state), win = out !== 'lose';
    marks.done(scn.id, { stars, outcome: out });
    const box = h('div', 'ks-chat-over' + (win ? '' : ' ks-chat-over-lose'));
    box.innerHTML = `<div class="ks-chat-over-head"><b lang="zh-CN">${win ? '聊完了' : '聊崩了'}</b><span>${win ? 'Chat over.' : 'They gave up.'}</span>
      <span class="ks-chat-over-stars" role="img" aria-label="${stars} of 3 stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'ks-on' : ''}" style="--i:${i}">★</span>`).join('')}</span></div>
      <ol class="ks-chat-over-list" aria-label="What you said"></ol>
      <div class="ks-chat-over-row"><button type="button" class="ks-btn ks-chat-again">↻ Again</button><button type="button" class="ks-btn ks-chat-next">Next ↓</button></div>`;
    const ol = box.querySelector('ol');
    // Three rows showing, the ones worth another look (the line you never sent, then the fewest stars), the rest behind
    // Show all, so the sheet never scrolls till it's opened: a swipe on it belongs to the feed.
    const all = [...(!win && missed ? [{ id: missed.id, stars: 0, alt: -1, missed: true }] : []), ...state.said];
    const keep = new Set([...all].sort((a, b) => (b.missed ? 1 : 0) - (a.missed ? 1 : 0) || a.stars - b.stars).slice(0, 3));
    for (const s of [...all.filter((x) => keep.has(x)), ...all.filter((x) => !keep.has(x))]) {
      const b = beats[s.id];
      if (!b) continue;
      const o = s.alt >= 0 ? b.alts[s.alt] : b, entry = o.ans?.[0];
      const li = h('li', 'ks-chat-said' + (s.missed ? ' ks-chat-said-missed' : '') + (keep.has(s) ? '' : ' ks-list-extra')), play = h('button', 'ks-chat-said-play', '🔊'), txt = h('div', 'ks-chat-said-t');
      play.type = 'button'; play.setAttribute('aria-label', 'Hear it'); play.onclick = () => hear(o.a, true);
      if (s.missed) txt.append(h('div', 'ks-chat-said-tag', 'The line you never sent'));
      if (entry) txt.append(zh(entry.t, { pinyin: 'all', count: false }));
      if (sent[s.id] && /[一-鿿]/.test(sent[s.id].said) && strip(sent[s.id].said) !== strip(entry?.zh)) txt.append(youSent(sent[s.id], entry));
      txt.append(h('div', 'ks-chat-said-en', `<span>${esc(o.gloss || o.en)}</span>${s.missed ? '' : `<b aria-label="${s.stars} of 3 stars">${'★'.repeat(s.stars)}<i>${'★'.repeat(3 - s.stars)}</i></b>`}`));
      li.append(play, txt);
      ol.append(li);
    }
    endNote(scn, box.querySelector('.ks-chat-over-row'), el); // the endings found, the next episode's day
    // opened or closed, the log still clears the sheet
    showAll(box, ol, () => el.style.setProperty('--ks-chat-over', `${box.offsetHeight}px`));
    box.querySelector('.ks-chat-again').onclick = () => begin();
    box.querySelector('.ks-chat-next').onclick = () => ctx.next();
    room.append(box);
    el.style.setProperty('--ks-chat-over', `${box.offsetHeight}px`);
    for (let i = 0; i < stars; i++) setTimeout(() => el.isConnected && audio.sfx('ding'), 300 + i * 220);
    if (!win) audio.sfx('no');
    el.dataset.state = 'done';
    requestAnimationFrame(() => down('auto'));   // the whole chat can be scrolled back now, above the sheet
  }

  // ---------- playing ----------
  function reset() {
    typing(null); packets.clear();
    voices = Promise.resolve(); missed = null; silent = 0;
    for (const k of Object.keys(sent)) delete sent[k];
    log.innerHTML = ''; log.classList.remove('ks-chat-full');
    room.querySelectorAll('.ks-ask, .ks-chat-over, .ks-chat-view, .ks-chat-env-bg').forEach((n) => n.remove());
    el.classList.remove('ks-chat-myturn', 'ks-chat-holding');
  }
  function idle() {
    reset();
    el.classList.remove('ks-chat-in');
    el.dataset.state = 'idle';
    row.dataset.testGo = '';
    restart(row, 'ks-chat-row-in');
  }
  async function begin() {
    ac?.abort(); audio.stopAll(); reset();
    ac = new AbortController();
    const signal = ac.signal, state = { stars: [], said: [], signal };
    delete row.dataset.testGo;
    el.classList.add('ks-chat-in');
    el.dataset.state = 'playing'; delete el.dataset.end;
    await audio.load(scn.audio);
    if (signal.aborted) return;
    const out = await run(scn.steps, hooks(signal), state);
    if (out === 'cancel' || signal.aborted) return;
    finish(out || 'win', state);
  }
  row.onclick = () => { audio.unlock(); begin(); };
  idle();

  return {
    // Reached by a swipe, the chat opens at once; the chat list is the start screen only before the first tap. A chat
    // that's over stays over, to scroll back through (↻ Again plays it again), as the other done cards do.
    enter() { if (el.dataset.state === 'done') return; if ((audio.unlocked || audio.running)()) begin(); else idle(); }, // unlocked: an iPhone reads 'running' late
    leave() { ac?.abort(); audio.stopAll(); if (el.dataset.state !== 'done') idle(); },
    destroy() { ac?.abort(); },
  };
}

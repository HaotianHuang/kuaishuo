// Voices and sound effects through one Web Audio context. Each scenario's lines arrive as one packed file
// (audio/<id>-<hash>.m4a) and a line is a [start, length] slice of it. Phones only let audio start from a tap, so
// unlock() runs inside the first one; after that, lines can play on their own as the story moves.
import { settings } from './store.js';
import { ms, fast } from './time.js';
import { canListen } from './speech.js';
import * as files from './files.js';
import { stretch } from './stretch.js';

// tapped: a tap has unlocked sound; ran: this context has been seen running; stuck: its clock stopped and stayed stopped
let ctx = null, out = null, sfxBus = null, unlockedAt = -Infinity, tapped = false, ran = false, stuck = false, hush = null;
const packs = new Map(), playing = new Set();

const context = () => {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain(); out.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(out);
  }
  return ctx;
};

// The ring switch: on silent, iOS mutes a page's Web Audio unless the page is playing media. audioSession 'playback'
// says it is, but WebKit only takes it in a frame allowed the microphone (not a claude.ai artifact), and iOS before 17
// has no audioSession. There a silent <audio>, looping from the unlocking tap, makes the page media playback. Not where
// the recogniser can run: media playback is one of the things that deafen it (WebKit bug 321436).
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
function silence() {
  // half a second of 8 kHz 8-bit mono (128 is zero in unsigned PCM) as a WAV made here: no file to ship, nothing to fetch
  const n = 4000, b = new Uint8Array(44 + n).fill(128), v = new DataView(b.buffer), s = (o, t) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint32(20, 0x10001, true); // PCM, mono
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint32(32, 0x80001, true); s(36, 'data'); v.setUint32(40, n, true); // 1-byte frames, 8 bits
  const a = new Audio('data:audio/wav;base64,' + btoa(String.fromCharCode.apply(null, b)));
  a.loop = true; a.setAttribute('x-webkit-airplay', 'deny'); // unmuted: a muted element doesn't count as playing media
  return a;
}
const hum = () => { if (hush && hush.paused && !hush.error) hush.play().catch(() => {}); };

export function unlock() {
  if (stuck) renew();
  const c = context();
  if (!c) return;
  unlockedAt = performance.now(); tapped = true;
  // iOS 17+: play through the speaker even when the ring switch is on silent.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  // where WebKit ignored that (the type reads 'auto' again) or there's no audioSession, the silent track does it
  if (IOS && !canListen() && navigator.audioSession?.type !== 'playback') { hush = hush || silence(); hum(); }
  if (c.state !== 'running') c.resume().catch(() => {});
  const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(out); s.start(0);
}
// WebKit only says 'running' once rendering has started, a few hundred ms after the tap, so a fresh unlock counts.
// Bounded in time, not by the resume promise (which WebKit can leave pending), so a later suspension still reads false.
export const running = () => !!ctx && (ctx.state === 'running' || (ctx.state !== 'closed' && performance.now() - unlockedAt < 1500));
// A tap has unlocked sound, whatever the context says now (not 'running' yet just after the tap on an iPhone, or
// suspended since by the microphone): a card that comes on screen can start its story without a tap of its own.
export const unlocked = () => !!ctx && tapped && ctx.state !== 'closed';

// iOS suspends Web Audio while the microphone is on (and when a call or another app interrupts), so before each line
// try to resume, and resume again on any tap: a tap is always allowed to. A context that has never run gets longer: a
// card can start straight after the unlocking tap, while iOS is still bringing its audio session up. Its starting ends
// the wait too, since WebKit can leave the promise pending.
async function ensure() {
  const c = ctx;
  if (!c || stuck) return false; // a context marked stuck isn't waited on: its lines go quiet until the next tap builds a new one
  if (c.state !== 'running') {
    let f;
    try { await Promise.race([c.resume(), new Promise((r) => { setTimeout(r, ran ? 400 : 1500); c.addEventListener('statechange', (f = () => c.state === 'running' && r())); })]); } catch {}
    c.removeEventListener('statechange', f);
  }
  return ctx === c && c.state === 'running' && (ran = true);
}

// iOS can leave the context 'running' with its clock stopped (back from the lock screen or another app: WebKit bug
// 276016), and then nothing it plays sounds or ends. A line that overruns, or the page coming back, looks at the clock:
// if it stands still, suspend and resume; if it still stands still, the next tap builds a new context.
const moves = (c) => new Promise((r) => { const t = c.currentTime; setTimeout(() => r(c.currentTime > t), 300); });
const within = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 400))]).catch(() => {});
let checking = null;
const check = () => (checking = checking || (async () => {
  const c = ctx;
  if (!c || c.state !== 'running' || (await moves(c))) return;
  await within(c.suspend()); await within(c.resume());
  if (!(await moves(c)) && ctx === c) stuck = true;
})().catch(() => {}).then(() => (checking = null)));
// Inside a tap, so the new one may start (its caller resumes it). The decoded packs carry over: buffers belong to no context.
function renew() {
  stuck = false; ran = false; noiseBuf = null; stopAll(); effects.clear(); // (any left are the old context's, on its clock)
  try { ctx.close().catch(() => {}); } catch {}
  ctx = null; context();
}
// hidden, the silent track stops: iOS lets an <audio> play on in the background (unlike Web Audio), which would keep
// the page, and its clocks, running there
document.addEventListener('visibilitychange', () => { if (document.hidden) hush?.pause(); else { check(); hum(); } });
for (const ev of ['pointerdown', 'touchend']) addEventListener(ev, () => { if (stuck) renew(); if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); hum(); }, true);
export const now = () => (ctx ? ctx.currentTime : performance.now() / 1000);

const decode = (buf) => new Promise((res, rej) => context().decodeAudioData(buf, res, rej));
// A decoded pack is about 20 MB of PCM, so only the last few used stay (the card on screen, the next one, a review or
// two); play() loads before every line, which keeps the pack in use newest. An evicted pack is simply fetched again,
// and so is a failed one: a pack that hasn't come in 30 s (a stalled network; a slow one gets there) is given up, and a failure isn't kept, so
// the next line, or a Replay, tries again rather than a blip leaving the scene quiet for the rest of the visit.
let told = false; // the first pack that fails says why, once (main.js shows it): a quiet scene shouldn't be a mystery
export function load(url) {
  if (!url) return Promise.resolve(null);
  let p = packs.get(url);
  if (p) { packs.delete(url); packs.set(url, p); return p; }
  const ac = new AbortController(); let t;
  const late = new Promise((_, no) => (t = setTimeout(() => { ac.abort(); no(new Error(`${url}: nothing in 30 s`)); }, 30000)));
  packs.set(url, (p = Promise.race([files.get(url, { signal: ac.signal }).then((r) => r.arrayBuffer()).then(decode), late])
    .catch((e) => { console.warn('audio', e.message); if (packs.get(url) === p) packs.delete(url); if (!told) { told = true; window.dispatchEvent(new CustomEvent('ks:voices', { detail: e.message })); } return null; }).finally(() => clearTimeout(t))));
  p.at = performance.now(); // when it set off: play() gives a pack on its way a few seconds from here
  while (packs.size > 4) packs.delete(packs.keys().next().value);
  return p;
}

// How long a clip plays at a rate, in seconds: under 1 it's said slower (stretch.js), length / rate; 1 and over, as is.
export const length = (clip, rate = 1) => (clip ? clip[1] / (rate > 0 && rate < 1 ? rate : 1) : 0);

// Play [start, length] of a pack. Resolves when the line has finished (or was stopped), so a story can await it.
// With no sound (not unlocked, voices off, file missing) it still waits the line's length, so the pacing holds.
// A rate under 1 says it slower at the same pitch (stretch.js), and the line is then length / rate long, heard or not:
// len, in seconds.
export function play(url, clip, { gain = 1, silentRate = 1, rate = 1 } = {}) {
  let stop = () => {}, stopped = false;
  const slow = rate > 0 && rate < 1, len = length(clip, rate);
  const done = new Promise(async (resolve) => {
    stop = () => { stopped = true; resolve(); }; // a stop while the pack is still loading wins: nothing starts later
    const quiet = () => { if (stopped) return; const t = setTimeout(resolve, ms(len * 1000 * silentRate)); stop = () => { clearTimeout(t); resolve(); }; };
    if (!clip) return resolve();
    if (!settings.get('voice') || fast() || !(await ensure())) return quiet();
    // A pack still on its way gets about 3 s from when it set off (one this line sets off has time to come and decode),
    // and a second at least; past that the line goes quiet, so a slow network can't stall the story, and a later line
    // picks the voices up.
    const pack = load(url), buf = await Promise.race([pack, new Promise((r) => setTimeout(r, Math.max(1000, (pack.at || 0) + 3000 - performance.now())))]);
    if (!buf || stopped) return quiet();
    const src = ctx.createBufferSource(), g = ctx.createGain();
    let sl = null; // slower: the line stretched to len, or at its own speed should that fail
    if (slow) try { sl = stretch(buf, clip[0], clip[1], rate); } catch (e) { console.warn('stretch', e.message); }
    src.buffer = sl || buf; g.gain.value = gain; src.connect(g); g.connect(out);
    const item = { src, resolve }, n = sl ? len : clip[1];
    playing.add(item);
    // a stuck context never ends what it plays: the wall clock ends the line too (so the story goes on), and looks at it
    const guard = setTimeout(() => { if (playing.delete(item)) { try { src.stop(); } catch {} resolve(); check(); } }, n * 1000 + 1500);
    src.onended = () => { clearTimeout(guard); playing.delete(item); resolve(); };
    stop = () => { clearTimeout(guard); try { src.stop(); } catch {} playing.delete(item); resolve(); };
    src.start(0, sl ? 0 : clip[0], n);
  });
  return { done, stop: () => stop(), len };
}

// The effects too: they're notes scheduled ahead (a ring is four of them over 2.5 s, the busy tone 2.8 s), which would
// sound on over the next card, so each one's own gain fades out. One set off this very moment (the pop a voice note
// lands with, just before the note stops what's playing) hasn't reached the audio clock yet, and plays.
export function stopAll() {
  for (const p of [...playing]) { try { p.src.stop(); } catch {} p.resolve(); } playing.clear();
  for (const e of effects) if (e.t <= ctx.currentTime) { e.g.gain.setTargetAtTime(0, ctx.currentTime, 0.015); effects.delete(e); }
}

// ---------- sound effects, synthesised so they cost no downloads ----------
// into: the gain of the effect being set off (each has its own, for stopAll), on the effects bus
const effects = new Set();
let into = null;
const env = (g, t, a, d, peak = 1) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
const tone = (type, f, t, a, d, peak = 0.5, f2) => {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  env(g, t, a, d, peak); o.connect(g); g.connect(into); o.start(t); o.stop(t + a + d + 0.05);
};
let noiseBuf = null;
const noise = (t, d, { type = 'lowpass', f = 1000, f2, q = 1, peak = 0.5, a = 0.01 } = {}) => {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  env(g, t, a, d, peak); s.connect(fl); fl.connect(g); g.connect(into); s.start(t); s.stop(t + a + d + 0.05);
};

const SFX = {
  ring: (t) => { for (const k of [0, 0.5, 1.5, 2]) { tone('sine', 440, t + k, 0.01, 0.38, 0.25); tone('sine', 480, t + k, 0.01, 0.38, 0.25); } return 2.5; },
  roar: (t) => { noise(t, 1.3, { f: 900, f2: 160, q: 4, peak: 0.9, a: 0.08 }); tone('sawtooth', 95, t, 0.1, 1.1, 0.35, 55); return 1.3; },
  ding: (t) => { tone('sine', 880, t, 0.005, 0.7, 0.4); tone('sine', 1320, t, 0.005, 0.5, 0.15); return 0.7; },
  buzz: (t) => { tone('square', 110, t, 0.01, 0.28, 0.25); return 0.3; },
  whoosh: (t) => { noise(t, 0.45, { type: 'bandpass', f: 300, f2: 3200, q: 1.2, peak: 0.6, a: 0.12 }); return 0.5; },
  heartbeat: (t) => { tone('sine', 62, t, 0.01, 0.16, 0.9, 45); tone('sine', 58, t + 0.2, 0.01, 0.2, 0.7, 42); return 0.6; },
  door: (t) => { tone('sine', 90, t, 0.005, 0.25, 0.8, 50); noise(t, 0.08, { f: 2500, peak: 0.3 }); return 0.35; },
  crash: (t) => { noise(t, 0.9, { f: 4000, f2: 300, peak: 0.9, a: 0.005 }); tone('sine', 70, t, 0.005, 0.4, 0.7, 40); return 0.9; },
  honk: (t) => { for (const k of [0, 0.32]) { tone('square', 350, t + k, 0.01, 0.24, 0.18); tone('square', 440, t + k, 0.01, 0.24, 0.18); } return 0.6; },
  pop: (t) => { tone('sine', 700, t, 0.002, 0.09, 0.5, 180); return 0.12; },
  splash: (t) => { noise(t, 0.7, { type: 'highpass', f: 800, f2: 3000, peak: 0.6, a: 0.01 }); return 0.7; },
  goose: (t) => { for (const k of [0, 0.28, 0.5]) { tone('sawtooth', 520, t + k, 0.02, 0.17, 0.25, 430); noise(t + k, 0.15, { type: 'bandpass', f: 1400, q: 6, peak: 0.25 }); } return 0.8; },
  drum: (t) => { tone('sine', 85, t, 0.003, 0.35, 0.9, 50); noise(t, 0.05, { f: 3000, peak: 0.25 }); return 0.4; },
  cheer: (t) => { noise(t, 1.4, { type: 'bandpass', f: 1200, q: 0.6, peak: 0.45, a: 0.3 }); for (let k = 0; k < 6; k++) tone('triangle', 600 + Math.random() * 500, t + Math.random() * 0.8, 0.05, 0.25, 0.04); return 1.5; },
  alarm: (t) => { for (let k = 0; k < 4; k++) tone('square', k % 2 ? 660 : 880, t + k * 0.25, 0.01, 0.22, 0.15); return 1; },
  knock: (t) => { for (const k of [0, 0.18, 0.36]) { tone('sine', 140, t + k, 0.002, 0.09, 0.8, 90); noise(t + k, 0.03, { f: 1800, peak: 0.2 }); } return 0.5; },
  type: (t) => { for (let k = 0; k < 5; k++) noise(t + k * 0.09 + Math.random() * 0.03, 0.025, { type: 'bandpass', f: 3000, q: 3, peak: 0.25 }); return 0.5; },
  message: (t) => { tone('sine', 1046, t, 0.005, 0.18, 0.3); tone('sine', 1318, t + 0.12, 0.005, 0.3, 0.3); return 0.45; },
  hangup: (t) => { for (let k = 0; k < 4; k++) tone('sine', 450, t + k * 0.7, 0.01, 0.34, 0.3); return 2.8; }, // the busy tone after 对方已挂断
  tick: (t) => { tone('square', 1600, t, 0.001, 0.025, 0.08); return 0.05; },
  yes: (t) => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, t + i * 0.07, 0.005, 0.25, 0.22)); return 0.5; },
  no: (t) => { tone('triangle', 330, t, 0.01, 0.18, 0.25); tone('triangle', 247, t + 0.16, 0.01, 0.3, 0.25); return 0.5; },
  listen: (t) => { tone('sine', 660, t, 0.005, 0.1, 0.2, 990); return 0.12; },
};
export const SFX_NAMES = Object.keys(SFX);

// Play a sound effect; resolves when it has finished.
export function sfx(name) {
  if (!settings.get('sfx') || !running() || !SFX[name] || fast()) return Promise.resolve();
  const e = { g: (into = ctx.createGain()), t: ctx.currentTime + 0.01 };
  into.connect(sfxBus); effects.add(e);
  const len = SFX[name](e.t);
  return new Promise((r) => setTimeout(r, len * 1000));
}

export function buzz(ms = 30) { try { navigator.vibrate?.(ms); } catch {} }

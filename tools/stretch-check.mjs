#!/usr/bin/env node
// tools/stretch-check.mjs: slows voices the way the phone will (app/shared/stretch.js, WSOLA) in a headless Chrome and
// measures what comes out: a 220 Hz tone, a buzz gliding 150 → 300 Hz (a second tone's rise), and real lines from
// audio/*.mp4 (a model answer, a man, a woman on the phone), each decoded at 24 kHz (the packs' own rate) and 48 kHz (a
// phone's context), at rates 0.85 (a hard-helped card's other characters), 0.8, 0.7 and 0.6 (the slowest it's for):
//   length   the clip lasts length / rate, and so does the sound in it (first to last loud 10 ms), ±3%
//   pitch    the tone's frequency, and each voiced moment's F0 against the original's at the same point in the line
//            (the median), ±3%; the tone's loudness steady within 1 dB (a join out of phase would dip it)
//   clicks   no sample-to-sample jump over 2× the original's largest (the tones: no bend over 2× either)
//   order    the loudness contour, squeezed back by rate, follows the original's (r ≥ 0.85): it's the line, in order
//   speed    a 3 s line at 48 kHz, at 0.6, with the CPU slowed 4× (about a mid-range phone): under 50 ms the first
//            time, 30 ms after (about 22 and 15 on an M1 so slowed; 5 unslowed). A busy machine only ever adds time,
//            so each is the fastest of several runs, in up to three rounds (timed by one run each, one check in three
//            failed on a busy Mac)
// Then the cache (the same clip and rate is the same buffer, a ninth pushes the first out), rate 1 giving the clip
// back, that a stretched buffer plays (rendered through an OfflineAudioContext), and audio.play(url, a, { rate })
// itself: len, and done at the stretched length, heard or not. Against the stored slow answer (ffmpeg's atempo at
// 0.78) it reports, not fails.
// Exit 1 on any failure. node tools/stretch-check.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), '--port', String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => server.stdout.on('data', (d) => /kuaishuo:/.test(d) && r()));
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const BASE = `http://127.0.0.1:${port}/`, PAGE = BASE + 'stretch-check.html', RATES = [0.85, 0.8, 0.7, 0.6], SRS = [24000, 48000];
const problems = [], pct = (v) => `${v >= 0 ? '+' : ''}${(100 * v).toFixed(1)}%`;
const want = (ok, what) => { if (!ok) problems.push(what); return ok ? '' : '  ✗'; };

// ---------- the lines: picked from the build, so they follow the content ----------
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content.json'), 'utf8'));
const lines = [], said = [];
const model = data.phrases.filter((p) => p.a && p.audio).sort((a, b) => Math.abs(a.a[1] - 3) - Math.abs(b.a[1] - 3))[0]; // about 3 s
if (model) lines.push({ name: 'model answer', url: model.audio, a: model.a, slow: model.slow, zh: model.zh });
for (const s of data.scenarios) {
  const walk = (d) => { if (Array.isArray(d)) d.forEach(walk); else if (d && typeof d === 'object') { if (d.who && d.a && s.cast?.[d.who]) said.push({ ...d, c: s.cast[d.who], url: s.audio }); Object.values(d).forEach(walk); } };
  walk(s.steps);
}
const cast = (name, fit) => { const l = said.find((l) => l.a[1] >= 1.5 && l.a[1] <= 5 && fit(l.c)); if (l) lines.push({ name, url: l.url, a: l.a, zh: l.zh }); };
cast('a man', (c) => /^zm_/.test(c.tts) && !c.phone);
cast('a woman, phoned', (c) => /^zf_/.test(c.tts) && c.phone);
if (lines.length < 3) problems.push(`only ${lines.length} of 3 real lines found in data/content.json`);

// ---------- what's measured (in Node, from the samples the page made) ----------
const pcm = (b64) => new Float32Array(new Uint8Array(Buffer.from(b64, 'base64')).buffer);
const rms = (x, i, n) => { let s = 0; for (let k = i; k < i + n; k++) s += x[k] * x[k]; return Math.sqrt(s / n); };
const env = (x, sr) => { const n = Math.round(sr / 100), e = []; for (let i = 0; i + n <= x.length; i += n) e.push(rms(x, i, n)); return e; }; // per 10 ms
const span = (x, sr) => { const e = env(x, sr), t = 0.05 * Math.max(...e); return (e.length - [...e].reverse().findIndex((v) => v > t) - e.findIndex((v) => v > t)) / 100; };
const jump = (x, d2) => { let m = 0; for (let i = 2; i < x.length; i++) m = Math.max(m, Math.abs(d2 ? x[i] - 2 * x[i - 1] + x[i - 2] : x[i] - x[i - 1])); return m; };
// F0 per 10 ms (40 ms frames) by normalised autocorrelation at 12 kHz, 70-450 Hz: the first peak within 90% of the
// best (not an octave down), parabola-refined; null where it's quiet or not periodic
function f0s(x, sr) {
  const d = Math.max(1, Math.round(sr / 12000)), z = new Float32Array(Math.floor(x.length / d)), zr = sr / d;
  for (let i = 0; i < z.length; i++) { let s = 0; for (let k = 0; k < d; k++) s += x[i * d + k]; z[i] = s / d; }
  const n = Math.round(0.04 * zr), h = Math.round(0.01 * zr), lo = Math.floor(zr / 450), hi = Math.ceil(zr / 70), out = [], loud = 0.1 * Math.max(...env(x, sr));
  for (let i = 0; i + n + hi < z.length; i += h) {
    if (rms(z, i, n) < loud) { out.push(null); continue; }
    const r = [];
    for (let t = lo; t <= hi; t++) { let xy = 0, xx = 0, yy = 0; for (let k = i; k < i + n; k++) { xy += z[k] * z[k + t]; xx += z[k] * z[k]; yy += z[k + t] * z[k + t]; } r.push(xy / Math.sqrt(xx * yy + 1e-12)); }
    const best = Math.max(...r);
    let j = r.findIndex((v, k) => k > 0 && k < r.length - 1 && v >= 0.9 * best && v >= r[k - 1] && v >= r[k + 1]);
    if (best < 0.6 || j < 0) { out.push(null); continue; }
    const a = r[j - 1], b = r[j], c = r[j + 1], off = (a - c) / (2 * (a - 2 * b + c) || 1);
    out.push(zr / (lo + j + (Math.abs(off) < 1 ? off : 0)));
  }
  return out;
}
const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
// each voiced moment of y against x's at the same point of the line (y's time × rate): the ratios
function pitchRatios(x, y, sr, rate) {
  const fx = f0s(x, sr), fy = f0s(y, sr), out = [];
  fy.forEach((f, j) => { const i = Math.round(j * rate), g = fx[i] ?? fx[i - 1] ?? fx[i + 1]; if (f && g) out.push(f / g); });
  return out;
}
// the loudness contour of y, squeezed back by rate, against x's: their correlation
function order(x, y, sr, rate) {
  const ex = env(x, sr), ey = env(y, sr), p = [];
  ey.forEach((v, j) => { const t = j * rate, i = Math.floor(t), f = t - i; if (i + 1 < ex.length) p.push([ex[i] * (1 - f) + ex[i + 1] * f, v]); });
  const mx = p.reduce((s, q) => s + q[0], 0) / p.length, my = p.reduce((s, q) => s + q[1], 0) / p.length;
  let sxy = 0, sxx = 0, syy = 0; for (const [a, b] of p) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => problems.push(`page: ${e.message || e}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console: ${m.text()}`); });
  // a blank page of the site's own, so its modules and packs load as the app's do
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url() === PAGE ? r.respond({ contentType: 'text/html', body: '<!doctype html><title>stretch-check</title><link rel="icon" href="data:,">' }) : r.continue()));
  await page.goto(PAGE);

  // ---------- speed, first: a 3 s line, the CPU at a quarter ----------
  // The line is decoded before the CPU is slowed (or the pack's decoding, and the clean-up after it, is timed too). A
  // busy machine only ever adds time, so the fastest counts: of the first stretch by each of three fresh copies of the
  // module (never stretched anything), and of nine more after; a round over budget goes again, up to three, 2 s apart
  const long = lines[0] || { url: null }, BUDGET = { cold: 50, warm: 30 };
  await page.evaluate(async (l) => {
    const sr = 48000;
    let x = new Float32Array(sr * 3).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 180 * i) / sr) * (1 + 0.5 * Math.sin(i / 900))); // no line: a tone
    if (l.url) { const b = await new OfflineAudioContext(1, 1, sr).decodeAudioData(await (await fetch('/' + l.url)).arrayBuffer()), i = Math.round(l.a[0] * sr); x = b.getChannelData(0).slice(i, i + Math.round(l.a[1] * sr)); }
    globalThis.timedLine = x;
  }, long);
  await page.emulateCPUThrottling(4);
  let speed = { cold: Infinity, warm: Infinity }, rounds = 0;
  while (rounds < 3 && !(speed.cold < BUDGET.cold && speed.warm < BUDGET.warm)) {
    if (rounds++) await new Promise((r) => setTimeout(r, 2000));
    const s = await page.evaluate(async (round) => {
      const x = globalThis.timedLine, sr = 48000, cold = [], warm = [];
      let wsola;
      for (let k = 0; k < 3; k++) { ({ wsola } = await import(`/app/shared/stretch.js?copy=${round}.${k}`)); const t = performance.now(); wsola(x, 0.6, sr); cold.push(performance.now() - t); }
      for (let k = 0; k < 9; k++) { const t = performance.now(); wsola(x, 0.6, sr); warm.push(performance.now() - t); }
      return { secs: x.length / sr, cold: Math.min(...cold), warm: Math.min(...warm) };
    }, rounds);
    speed = { secs: s.secs, cold: Math.min(speed.cold, s.cold), warm: Math.min(speed.warm, s.warm) };
  }
  await page.emulateCPUThrottling(1);
  const busy = `${rounds > 1 ? `, best of ${rounds} rounds` : ''} (load ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cores)`;
  console.log(`speed: a ${speed.secs.toFixed(2)} s line at 48 kHz, rate 0.6, CPU ÷4: ${speed.cold.toFixed(1)} ms the first time${want(speed.cold < BUDGET.cold, `speed: first stretch ${speed.cold.toFixed(1)} ms${busy}`)}, ${speed.warm.toFixed(1)} ms after${want(speed.warm < BUDGET.warm, `speed: stretch ${speed.warm.toFixed(1)} ms${busy}`)}${busy}`);

  // ---------- each signal at each rate and sample rate ----------
  for (const sr of SRS) {
    const got = await page.evaluate(async (sr, lines, rates) => {
      const { stretch } = await import('/app/shared/stretch.js');
      const b64 = (f) => { const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
      const synth = (secs, fn) => { const b = new AudioBuffer({ length: Math.round(secs * sr), sampleRate: sr }), c = b.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = fn(i / sr); return b; };
      const glideAt = (t) => 150 * 2 ** (t / 2); // 150 → 300 Hz over 2 s
      let phase = 0;
      const sigs = [
        { name: 'tone 220 Hz', tone: 1, pure: 1, buf: synth(3, (t) => 0.5 * Math.sin(2 * Math.PI * 220 * t)), a: [0, 3] },
        { name: 'buzz 150→300 Hz', tone: 1, buf: synth(2, (t) => { phase += (2 * Math.PI * glideAt(t)) / sr; let v = 0; for (let k = 1; k <= 5; k++) v += Math.sin(k * phase) / k; return 0.25 * v; }), a: [0, 2] },
      ];
      const packs = {};
      for (const l of lines) sigs.push({ ...l, buf: await (packs[l.url] ||= fetch('/' + l.url).then((r) => r.arrayBuffer()).then((ab) => new OfflineAudioContext(1, 1, sr).decodeAudioData(ab))) });
      const cut = (b, [s, n]) => { const i = Math.round(s * sr); return b.getChannelData(0).slice(i, i + Math.round(n * sr)); };
      const out = [];
      for (const g of sigs) {
        const o = { name: g.name, tone: !!g.tone, pure: !!g.pure, x: b64(cut(g.buf, g.a)), a: g.a, y: {} };
        for (const rate of rates) { const y = stretch(g.buf, g.a[0], g.a[1], rate); o.y[rate] = { b64: b64(y.getChannelData(0)), sr: y.sampleRate, secs: y.duration }; }
        // the stored slow answer, made by ffmpeg's atempo from the same voicing, against ours at its rate
        if (g.slow) { const rate = +(g.a[1] / g.slow[1]).toFixed(3), y = stretch(g.buf, g.a[0], g.a[1], 0.78); o.atempo = { b64: b64(cut(g.buf, g.slow)), ours: b64(y.getChannelData(0)), rate }; }
        out.push(o);
      }
      return out;
    }, sr, lines, RATES);
    console.log(`\n${sr / 1000} kHz            rate   length   sound     pitch (moments ±3%)    jump   bend   order   loudness`);
    for (const g of got) {
      const x = pcm(g.x);
      for (const rate of RATES) {
        const y = pcm(g.y[rate].b64), tag = `${g.name} @${sr / 1000}k ×${rate}`, L = g.a[1] / rate;
        const dur = g.y[rate].secs / L - 1, snd = (span(y, sr) / span(x, sr)) * rate - 1, ratios = pitchRatios(x, y, sr, rate);
        const p = median(ratios) - 1, near = ratios.filter((r) => Math.abs(r - 1) <= 0.03).length / ratios.length;
        const j = jump(y) / jump(x), b = g.tone ? jump(y, true) / jump(x, true) : 0, r = g.tone ? 0 : order(x, y, sr, rate); // a tone's contour is flat
        let row = `${g.name.padEnd(18)} ${String(rate).padEnd(4)}  ${pct(dur).padStart(6)}${want(Math.abs(dur) <= 0.03 && g.y[rate].sr === sr, `${tag}: lasts ${g.y[rate].secs.toFixed(3)} s, not ${L.toFixed(3)}`)}  ${pct(snd).padStart(6)}${want(Math.abs(snd) <= 0.03, `${tag}: the sound spans ${pct(snd)} off length/rate`)}`;
        row += `   ${pct(p).padStart(6)} (${(100 * near).toFixed(0)}% of ${ratios.length})${want(ratios.length >= 10 && Math.abs(p) <= 0.03, `${tag}: pitch ${pct(p)} over ${ratios.length} moments`)}`.padEnd(26);
        row += ` ${j.toFixed(2)}×${want(j <= 2, `${tag}: a jump ${j.toFixed(2)}× the original's`)}  ${g.tone ? `${b.toFixed(2)}×${want(b <= 2, `${tag}: a bend ${b.toFixed(2)}× the original's`)}` : '  -  '}   ${g.tone ? '  -  ' : `${r.toFixed(3)}${want(r >= 0.85, `${tag}: loudness contour r ${r.toFixed(3)}`)}`}`;
        if (g.pure) { // steady loudness, away from the ends: a join out of phase would dip it
          const e = env(y, sr).slice(3, -3), ref = rms(x, 0, x.length), db = Math.max(...e.map((v) => Math.abs(20 * Math.log10(v / ref))));
          row += `   ±${db.toFixed(2)} dB${want(db <= 1, `${tag}: loudness wanders ${db.toFixed(2)} dB`)}`;
        }
        console.log(row);
      }
      if (g.atempo) { // reported only: ours at 0.78 against what ffmpeg made
        const t = pcm(g.atempo.b64), o = pcm(g.atempo.ours), ratios = pitchRatios(t, o, sr, 1);
        console.log(`  vs atempo: ffmpeg's ${(t.length / sr).toFixed(3)} s (×${g.atempo.rate}), ours ${(o.length / sr).toFixed(3)} s at ×0.78; sound ${pct(span(o, sr) / span(t, sr) - 1)}, pitch ${pct(median(ratios) - 1)}, contour r ${order(t, o, sr, 1).toFixed(3)}`);
      }
    }
  }

  // ---------- the cache, and that a stretched buffer plays ----------
  const cache = await page.evaluate(async () => {
    const { stretch } = await import('/app/shared/stretch.js'), sr = 48000, b = new AudioBuffer({ length: sr * 2, sampleRate: sr }), c = b.getChannelData(0);
    for (let i = 0; i < c.length; i++) c[i] = 0.4 * Math.sin((2 * Math.PI * 200 * i) / sr);
    const first = stretch(b, 0.1, 1.5, 0.8), again = stretch(b, 0.1, 1.5, 0.8), other = stretch(b, 0.1, 1.5, 0.7);
    for (let k = 0; k < 8; k++) stretch(b, 0.01 * k, 1, 0.9);
    const later = stretch(b, 0.1, 1.5, 0.8), same = stretch(b, 0.1, 1.5, 1).getChannelData(0), from = c.subarray(4800, 4800 + 72000);
    let back = same.length === from.length ? 0 : Infinity; for (let i = 0; i < from.length; i++) back = Math.max(back, Math.abs(same[i] - from[i]));
    const ctx = new OfflineAudioContext(1, first.length, sr), src = ctx.createBufferSource();
    src.buffer = first; src.connect(ctx.destination); src.start(0);
    const heard = (await ctx.startRendering()).getChannelData(0), y = first.getChannelData(0);
    let diff = 0; for (let i = 0; i < y.length; i++) diff = Math.max(diff, Math.abs(heard[i] - y[i]));
    return { same: first === again, other: other !== first, evicted: later !== first, back, diff, secs: first.duration };
  });
  console.log(`\ncache: same clip and rate → same buffer ${cache.same}${want(cache.same, 'cache: a repeat made a new buffer')}, another rate → another ${cache.other}${want(cache.other, 'cache: another rate came back the same')}, a ninth pushes the first out ${cache.evicted}${want(cache.evicted, 'cache: kept more than 8')}`);
  console.log(`rate 1: the clip back, off by at most ${cache.back.toExponential(1)}${want(cache.back < 1e-6, `rate 1: off the clip by ${cache.back}`)}`);
  console.log(`plays: rendered through an OfflineAudioContext, ${cache.secs.toFixed(3)} s, off by at most ${cache.diff.toExponential(1)}${want(cache.diff < 1e-6, `plays: the rendered buffer differs by ${cache.diff}`)}`);

  // ---------- audio.play(url, a, { rate }) itself, on a real context: heard, plain, silent, stopped ----------
  const short = lines.find((l) => l.name === 'a man') || lines[0];
  if (short) {
    const pl = await page.evaluate(async (l) => {
      const audio = await import('/app/shared/audio.js'), { stretch } = await import('/app/shared/stretch.js'), { settings } = await import('/app/shared/store.js');
      audio.unlock(); settings.set('voice', true);
      const buf = await audio.load(l.url), timed = async (opts, cut) => { const t = performance.now(), h = audio.play(l.url, l.a, opts); if (cut) setTimeout(h.stop, cut); await h.done; return { len: h.len, secs: (performance.now() - t) / 1000 }; };
      // the context's clock under way first: its start (0.4-0.7 s after the unlock in a busy headless Chrome, which can
      // be after the pack's decoded) would be timed as the line's
      for (const t = performance.now(); !(audio.now() > 0) && performance.now() - t < 3000;) await new Promise((r) => setTimeout(r, 20));
      const slow = await timed({ rate: 0.8 });
      const t = performance.now(); stretch(buf, l.a[0], l.a[1], 0.8); const cached = performance.now() - t; // the buffer play made, kept
      const plain = await timed({}), cut = await timed({ rate: 0.8 }, 300);
      settings.set('voice', false); const quiet = await timed({ rate: 0.8 }); settings.set('voice', true);
      return { slow, plain, cut, quiet, cached, sr: buf.sampleRate, state: audio.running() };
    }, short);
    const L = short.a[1] / 0.8, near = (r, want, lo = -0.05, hi = 0.4) => r.secs - want >= lo && r.secs - want <= hi;
    console.log(`\naudio.play: ${short.name} (${short.a[1]} s), context at ${pl.sr / 1000} kHz, running ${pl.state}${want(pl.state, 'audio.play: the context never ran')}`);
    console.log(`  rate 0.8:    len ${pl.slow.len.toFixed(3)} s (want ${L.toFixed(3)})${want(Math.abs(pl.slow.len - L) < 1e-9, `audio.play: len ${pl.slow.len}, not ${L}`)}, done after ${pl.slow.secs.toFixed(3)} s${want(near(pl.slow, L), `audio.play: rate 0.8 done after ${pl.slow.secs.toFixed(3)} s, not ${L.toFixed(3)}`)}; its stretch kept (${pl.cached.toFixed(2)} ms to get again)${want(pl.cached < 0.5, 'audio.play: what it played is not in the cache')}`);
    console.log(`  plain:       len ${pl.plain.len.toFixed(3)} s, done after ${pl.plain.secs.toFixed(3)} s${want(pl.plain.len === short.a[1] && near(pl.plain, short.a[1]), `audio.play: plain done after ${pl.plain.secs.toFixed(3)} s, not ${short.a[1]}`)}`);
    console.log(`  stopped:     done after ${pl.cut.secs.toFixed(3)} s (stopped at 0.3)${want(near(pl.cut, 0.3, -0.01, 0.15), `audio.play: stopped at 0.3 s, done after ${pl.cut.secs.toFixed(3)}`)}`);
    console.log(`  voices off:  len ${pl.quiet.len.toFixed(3)} s, done after ${pl.quiet.secs.toFixed(3)} s${want(near(pl.quiet, L, -0.02, 0.15), `audio.play: silent rate 0.8 done after ${pl.quiet.secs.toFixed(3)} s, not ${L.toFixed(3)}`)}`);
  }
} finally { await browser.close(); server.kill(); }
for (const p of [...new Set(problems)]) console.log('PROBLEM ' + p);
console.log(problems.length ? `${new Set(problems).size} problems` : 'all good');
process.exit(problems.length ? 1 : 0);

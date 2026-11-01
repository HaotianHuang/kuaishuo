// Slower speech at the same pitch, made on the phone, so a slow line costs no bytes (docs/v2/README.md §4): WSOLA,
// waveform-similarity overlap-add, the method of ffmpeg's atempo that made the stored slow answers. The clip is cut
// into frames that overlap by half, laid down further apart than they were taken from; each frame is taken from
// wherever, within SEEK of where it belongs, it best carries on from the one before, so the overlaps join whole pitch
// periods and nothing beats, echoes or clicks. Meant for speech at rates 0.6–1; the voice packs are mono, so a stereo
// buffer comes back as its first channel.
// Frames of 24 ms hold two periods of a low voice, and ±12 ms always reaches a join a whole period away: tried on the
// packs against 20-42 ms frames and ±6-21 ms, by how well the joins match and how close each moment's spectrum stays.
const HOP = 0.012, SEEK = 0.012, KEEP = 8;

const wins = new Map();
// sin², never quite 0 at the ends, and any two half a frame apart add up to exactly 1
const win = (N) => wins.get(N) || wins.set(N, Float32Array.from({ length: N }, (_, n) => Math.sin((Math.PI * (n + 0.5)) / N) ** 2)).get(N);

// x (one channel's samples at sr) at rate: into y, whose length is the stretched length
export function wsola(x, rate, sr, y = new Float32Array(Math.round(x.length / rate))) {
  const H = Math.round(sr * HOP), N = 2 * H, D = Math.round(sr * SEEK), M = y.length, w = win(N), L = x.length;
  // the search, coarse to fine: every lag on a 4 kHz grid, then on a 16 kHz one and every lag around the best, each
  // summed over the samples on its grid (the finest at 24 kHz: the voices go no higher)
  const at = (f) => Math.max(1, Math.round(sr / f)), steps = [at(4000), at(4000), at(16000), at(16000), 1, at(24000)]; // lag, sum
  const pad = N + D + 64, v = new Float32Array(L + 2 * pad), e = new Float64Array(v.length + 1); // silence either side
  v.set(x, pad);
  for (let i = 0, s = 0; i < v.length; i++) e[i + 1] = s += v[i] * v[i]; // running energy: each candidate's costs a subtraction
  // how well the H samples from p carry on from those at c: their correlation over p's energy (the shape, not the
  // level), in two sums so the adds don't wait on each other
  const like = (p, c, s) => { let a = 0, b = 0; for (let n = 0; n < H; n += 2 * s) { a += v[p + n] * v[c + n]; b += v[p + n + s] * v[c + n + s]; } return (a + b) / Math.sqrt(e[p + H] - e[p] + 1e-9); };
  y.set(x.subarray(0, Math.min(H, M))); // nothing before the first frame to fade in from: its first half as it is
  for (let k = 0, p = pad; k * H < M; k++) {
    if (k) {
      // where this frame belongs, give or take SEEK, and never reading past the clip's end; where the last carries on to
      const q = pad + Math.round(k * H * rate), lo = Math.max(pad, q - D), hi = Math.min(q + D, pad + L - Math.min(N, M - k * H)), c = p + H;
      if (c >= lo && c <= hi) p = c; // carrying straight on is still near enough: a perfect join
      else {
        let b = Math.min(Math.max(q, lo), hi), span = D;
        for (let g = 0; g < 6; g += 2) {
          const ls = steps[g], ss = steps[g + 1];
          let top = like(b, c, ss);
          for (let t = Math.max(lo, b - span), z = Math.min(hi, b + span); t <= z; t += ls) { const r = like(t, c, ss); if (r > top) { top = r; b = t; } }
          span = ls - 1;
        }
        p = b;
      }
    }
    for (let n = k ? 0 : H, o = k * H, z = Math.min(N, M - o); n < z; n++) y[o + n] += v[p + n] * w[n];
  }
  return y;
}

// a new AudioBuffer: its constructor, or a context's createBuffer in WebKit before it had one (iOS 14.4)
let maker = null;
const make = (n, sr) => { try { return new AudioBuffer({ length: n, sampleRate: sr }); } catch { return (maker ||= new (globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext)(1, 1, sr)).createBuffer(1, n, sr); } };

// [start, start + length] seconds of buffer at rate, as a new AudioBuffer length / rate long. The last KEEP made are
// kept (a Replay, the slow turn heard again), keyed by the buffer itself: a pack decoded again is a new one.
const kept = new Map(), ids = new WeakMap();
let seq = 0;
export function stretch(buffer, start, length, rate) {
  const key = `${ids.get(buffer) || (ids.set(buffer, ++seq), seq)} ${start} ${length} ${rate}`;
  let out = kept.get(key);
  if (!out) {
    const sr = buffer.sampleRate, i = Math.round(start * sr), x = buffer.getChannelData(0).subarray(i, i + Math.round(length * sr));
    out = make(Math.max(1, Math.round(x.length / rate)), sr);
    wsola(x, rate, sr, out.getChannelData(0));
  }
  kept.delete(key); kept.set(key, out); // newest last
  while (kept.size > KEEP) kept.delete(kept.keys().next().value);
  return out;
}

// The pixel art (art/, from the art pack by tools/art.mjs): a story's place, its people as sprite sheets, its props
// and everyone's avatars, by art/index.json. Fetched only once the page has been tapped (its weight before the first tap
// is budgeted: tools/web-check.mjs), then a story at a time as its card is built, so the next card's comes in behind
// this one's. A page without it keeps the emoji: the claude.ai pocket edition carries no art, and a story missing from
// the index, or a file that fails, is just not drawn. Nothing here throws; of() resolves null.
import * as files from './files.js';
import * as audio from './audio.js';

const doc = typeof document !== 'undefined' ? document : null;
let tapped, index = null;
const touched = new Promise((r) => (tapped = r));
if (doc) for (const k of ['pointerdown', 'keydown', 'touchstart']) addEventListener(k, () => tapped(), { once: true, capture: true, passive: true });

const pics = new Map(); // path → Promise<{ url, w, h } | null>
function pic(path) {
  if (!pics.has(path)) pics.set(path, files.get(path).then((r) => r.blob()).then(async (b) => {
    const url = URL.createObjectURL(b), im = new Image();
    im.src = url;
    await (im.decode ? im.decode() : new Promise((ok, no) => { im.onload = ok; im.onerror = no; }));
    return { url, w: im.naturalWidth, h: im.naturalHeight, im };
  }).catch((e) => { console.warn('art', path, e?.message || e); return null; }));
  return pics.get(path);
}
// (the formats load after the gate's tap, and this with them: a tap already made counts, as the voices know it)
const wasTapped = () => audio.unlocked() || !!globalThis.navigator?.userActivation?.hasBeenActive;
const loadIndex = () => (index ??= (wasTapped() ? Promise.resolve() : touched).then(() => (files.packed() ? null : files.json('art/index.json'))).catch(() => null));

// A story's art, all of it loaded: { place, chase, cast: { who: sheet }, chaser: [sheet], props: { emoji: sheet },
// av: { who: url }, fx(name) }; null where there's none. A sheet is { url, size, f (frame), o (feet), anims }.
const stories = new Map();
export function of(scn) {
  if (!doc || !scn?.id) return Promise.resolve(null);
  if (!stories.has(scn.id)) stories.set(scn.id, loadIndex().then((ix) => (ix?.stories[scn.id] ? dress(ix, ix.stories[scn.id]) : null)).catch(() => null));
  return stories.get(scn.id);
}
async function sheetOf(ix, k) {
  const m = ix.sheets[k], p = m && (await pic(`art/characters/${k}.png`));
  return p && { url: p.url, size: m.size, f: m.f, o: m.o, anims: ix.rigs[m.rig] };
}
// a prop or an effect as a one-row sheet, its frames played as "idle"
const strip = (p, m) => p && { url: p.url, size: [p.w, p.h], f: m.f, o: [m.f[0] / 2, m.f[1] - 1], anims: { idle: { row: 0, frames: m.n, fps: m.fps || 1, loop: true } } };
async function propOf(ix, k) {
  if (k.startsWith('@')) return sheetOf(ix, k.slice(1));
  const fx = k.startsWith('!'), name = fx ? k.slice(1) : k, m = (fx ? ix.fx : ix.props)[name];
  return m ? strip(await pic(`art/${fx ? 'fx' : 'props'}/${name}.png`), m) : null;
}
async function dress(ix, s) {
  const all = (o, f) => Promise.all(Object.entries(o || {}).map(async ([k, v]) => [k, await f(v)])).then((l) => Object.fromEntries(l.filter(([, v]) => v)));
  const avs = { ...Object.fromEntries(Object.entries(s.cast).filter(([, k]) => ix.sheets[k]?.av)), ...s.av };
  const [place, layers, cast, chaser, props, av] = await Promise.all([
    s.bd ? pic(`art/backgrounds/${s.bd}.png`) : null,
    s.chase ? Promise.all(ix.chases[s.chase].layers.map((l) => pic(`art/backgrounds/${s.chase}/${l}.png`))) : null,
    all(s.cast, (k) => sheetOf(ix, k)),
    Promise.all((s.chaser || []).map((k) => sheetOf(ix, k))),
    all(s.props, (k) => propOf(ix, k)),
    all(avs, (k) => pic(`art/avatars/${k}.png`).then((p) => p?.url)),
  ]);
  if (s.bd && !place) return null; // no place, no art: the emoji stage stays whole rather than half drawn
  if (layers && !layers.every(Boolean)) return null;
  const a = { place: place && { ...place, ...edges(place.im) }, chase: layers && { layers, ...edges(layers[0].im, layers[layers.length - 1].im) }, cast, chaser: chaser.filter(Boolean), props, av };
  // a prop the story's own list doesn't name, by the emoji (a chase's obstacles); an effect strip (the ? over a head)
  a.prop = async (e) => a.props[e] ?? (ix.emoji[e] ? (a.props[e] = await propOf(ix, ix.emoji[e])) : null);
  a.fx = (name) => (ix.fx[name] ? pic(`art/fx/${name}.png`).then((p) => strip(p, ix.fx[name])) : Promise.resolve(null));
  return a;
}
// The colours at a picture's top and bottom edges: the stage is filled with them past the picture, so it has no edge
function edges(top, bottom = top) {
  const row = (im, y) => {
    try {
      const c = doc.createElement('canvas'); c.width = im.naturalWidth; c.height = 1;
      const x = c.getContext('2d'); x.drawImage(im, 0, -y);
      const d = x.getImageData(0, 0, c.width, 1).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : null;
    } catch { return null; }
  };
  return { top: row(top, 0) || '#1a1420', bottom: row(bottom, bottom.naturalHeight - 1) || '#1a1420' };
}

// How big a pixel is on this stage: the place's 192 columns cover its width, and whole pixels where that's near
export const scale = (w) => Math.max(2, Math.min(5, Math.max(Math.ceil(w / 192), Math.round(w / 130))));

// ---------- sprites: a sheet drawn at a scale, one animation at a time, frames stepped on one shared clock ----------
const live = new Set();
let raf = 0;
function loop(t) {
  raf = 0;
  for (const s of live) if (!s.el.isConnected) live.delete(s); else s.tick(t);
  if (live.size) raf = requestAnimationFrame(loop);
}
// play(name): the animation (a missing one falls back to idle, or the sheet's first); one that doesn't loop returns to
// the resting one when it's done (rest()), or holds its last frame if held (a faint)
export function sprite(sheet, px, { anim = 'idle', cls = '' } = {}) {
  const el = doc.createElement('i');
  el.className = `ks-sprite ${cls}`.trim();
  el.setAttribute('aria-hidden', 'true');
  el.style.backgroundImage = `url("${sheet.url}")`;
  let a = null, t0 = 0, shown = -1, rest = 'idle', hold = false, s = px;
  const pick = (n) => sheet.anims[n] || sheet.anims.idle || Object.values(sheet.anims)[0];
  const sp = {
    el, sheet,
    size(n) {
      s = n;
      Object.assign(el.style, { width: `${sheet.f[0] * s}px`, height: `${sheet.f[1] * s}px`, backgroundSize: `${sheet.size[0] * s}px ${sheet.size[1] * s}px` });
      shown = -1; draw(0);
      return sp;
    },
    play(n, o = {}) {
      const next = pick(n);
      if (next === a && next.loop && !o.again) return sp;
      a = next; hold = !!o.hold; t0 = performance.now(); shown = -1;
      draw(0);
      if (a.frames > 1 && !live.has(sp)) { live.add(sp); raf ||= requestAnimationFrame(loop); }
      return sp;
    },
    // the animation to come back to (idle, talk): now, unless a one-off is still playing or held
    rest(n) { rest = n; if (a.loop || (!hold && done())) sp.play(n); return sp; },
    flip(on) { el.classList.toggle('ks-sprite-flip', !!on); return sp; },
    tick(t) {
      let i = Math.floor(((t - t0) / 1000) * (a.fps || 1));
      if (!a.loop && i >= a.frames) { if (hold) i = a.frames - 1; else return sp.play(rest); }
      draw(i % a.frames);
    },
  };
  const done = () => Math.floor(((performance.now() - t0) / 1000) * (a.fps || 1)) >= a.frames;
  function draw(i) {
    if (i === shown) return;
    shown = i;
    el.style.backgroundPosition = `${-i * sheet.f[0] * s}px ${-(a?.row || 0) * sheet.f[1] * s}px`;
  }
  a = pick(anim);
  sp.size(s).play(anim, { again: true });
  return sp;
}

// An avatar: the round pixel portrait in place of an emoji; html for the strings the formats build
export const face = (url, cls = '') => `<img class="ks-face ${cls}" src="${url}" alt="" aria-hidden="true">`;

#!/usr/bin/env node
// tools/art.mjs: the pixel art pack (~/Documents/huangsgamingassets/kuaishuo_pack, drawn by its own tools) → art/, what
// the app draws in place of emoji (app/shared/art.js): only the files a live story uses, and art/index.json, the one
// file the app reads first: each story's place, cast sheets, chaser, props and avatars, and every sheet's frames.
// Run it again when the pack changes; it replaces art/ whole.
//   node tools/art.mjs [--from <pack dir>]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), OUT = path.join(ROOT, 'art');
const at = process.argv.indexOf('--from');
const SRC = path.resolve(at > 0 ? process.argv[at + 1] : path.join(ROOT, '../../huangsgamingassets/kuaishuo_pack'));
const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
if (!fs.existsSync(path.join(SRC, 'stories.json'))) throw new Error(`no art pack at ${SRC} (stories.json): --from <dir>`);

// a PNG's size, from its header
const size = (f) => { const b = fs.readFileSync(path.join(SRC, f)); if (b.toString('latin1', 12, 16) !== 'IHDR') throw new Error(`${f}: not a PNG`); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const name = (f) => path.basename(f, '.png');

const stories = read('stories.json'), live = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8')).scenarios.map((s) => s.id);
const missing = live.filter((id) => !stories[id]);
if (missing.length) console.log(`no art for ${missing.length} live ${missing.length === 1 ? 'story' : 'stories'} (they keep their emoji): ${missing.join(', ')}`);
const use = new Set(), index = { from: path.basename(SRC), stories: {}, sheets: {}, rigs: [], props: {}, emoji: {}, fx: {}, chases: {} };
const rigs = new Map();

// a character sheet: its frame and feet, and its animations (most people share one rig's, so they're kept once)
function sheet(f) {
  const k = name(f);
  if (index.sheets[k]) return k;
  const m = read(f.replace(/\.png$/, '.json')), [w, h] = size(f), anims = JSON.stringify(m.anims);
  if (!rigs.has(anims)) { rigs.set(anims, index.rigs.length); index.rigs.push(m.anims); }
  index.sheets[k] = { f: m.frame, o: m.origin, size: [w, h], rig: rigs.get(anims) };
  use.add(f);
  if (fs.existsSync(path.join(SRC, 'avatars', `${k}.png`))) use.add(`avatars/${k}.png`), (index.sheets[k].av = 1);
  return k;
}
const propMeta = read('props/props.json');
function prop(f) {
  const k = name(f), m = propMeta[k];
  if (!m) throw new Error(`${f}: not in props/props.json`);
  index.props[k] ??= { f: m.frame, n: m.frames || 1, fps: m.fps || 0 };
  use.add(f);
  return k;
}
// every prop by the emoji it stands in for, for a story's emoji its own list doesn't name (a chase's obstacles)
for (const [k, m] of Object.entries(propMeta)) for (const e of m.emoji || []) index.emoji[e] ??= k;
for (const [k, m] of Object.entries(read('fx/fx.json'))) { index.fx[k] = { f: m.frame, n: m.frames || 1, fps: m.fps || 0 }; use.add(`fx/${k}.png`); }

for (const id of live) {
  const s = stories[id];
  if (!s) continue;
  const o = { cast: {} };
  if (s.backdrop) { o.bd = name(s.backdrop); use.add(s.backdrop); }
  if (s.chase) {
    const set = path.basename(s.chase.replace(/\/$/, ''));
    o.chase = set;
    if (!index.chases[set]) {
      const files = fs.readdirSync(path.join(SRC, s.chase)).filter((f) => f.endsWith('.png'));
      const layers = ['sky', 'far', 'mid', 'ground'].filter((l) => files.includes(`${l}.png`));
      if (layers.length < 4) throw new Error(`${s.chase}: a chase set needs sky, far, mid and ground`);
      index.chases[set] = { size: size(`${s.chase}/ground.png`), layers };
      for (const f of files) use.add(`${s.chase.replace(/\/$/, '')}/${f}`);
    }
  }
  for (const [who, f] of Object.entries(s.cast || {})) o.cast[who] = sheet(f);
  if (s.chaser?.length) o.chaser = s.chaser.map(sheet);
  // (a prop can be a character, "@paobuji": the treadmill that talks back; or an effect, "!steam")
  if (Object.keys(s.props || {}).length) o.props = Object.fromEntries(Object.entries(s.props).map(([e, f]) => [e, f.startsWith('characters/') ? '@' + sheet(f) : f.startsWith('fx/') ? '!' + name(f) : prop(f)]));
  // the pack's own avatars for a call or a chat, where it names one other than the sheet's
  for (const [who, f] of Object.entries(s.avatars || {})) if (name(f) !== o.cast[who]) { (o.av ||= {})[who] = name(f); use.add(f); }
  index.stories[id] = o;
}
for (const k of Object.values(index.emoji)) prop(`props/${k}.png`);

// art/ replaced whole, so a file the pack dropped doesn't linger
const TMP = fs.mkdtempSync(OUT + '.tmp-');
let bytes = 0;
for (const f of use) { const to = path.join(TMP, f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(SRC, f), to); bytes += fs.statSync(to).size; }
const json = JSON.stringify(index);
fs.writeFileSync(path.join(TMP, 'index.json'), json);
fs.rmSync(OUT, { recursive: true, force: true });
fs.renameSync(TMP, OUT);
console.log(`art/: ${Object.keys(index.stories).length} stories, ${Object.keys(index.sheets).length} sheets (${index.rigs.length} rigs), ${Object.keys(index.props).length} props, ${Object.keys(index.chases).length} chase sets; ${use.size} files, ${(bytes / 1048576).toFixed(1)} MB, index.json ${(json.length / 1024).toFixed(0)} KB`);

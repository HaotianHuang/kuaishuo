// The built content (tools/build.py → data/content.json) and small helpers over it.
import * as files from './files.js';

let data = null;

export async function load(url = 'data/content.json') {
  data = await files.json(url);
  data.byId = Object.fromEntries(data.scenarios.map((s) => [s.id, s]));
  data.phraseById = Object.fromEntries(data.phrases.map((p) => [p.id, p]));
  return data;
}
export const get = () => data;
export const of = (format) => data.scenarios.filter((s) => s.format === format);

// Words from other scenarios' answers: decoy tiles that look plausible but don't belong.
export function decoys(scn, n = 12) {
  const mine = new Set(JSON.stringify(scn).match(/[一-鿿]+/g) || []);
  const words = [];
  for (const p of data.phrases) if (p.scn !== scn.id) for (const t of p.t) if (t.length > 1 && !mine.has(t[0])) words.push(t[0]);
  for (let i = words.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [words[i], words[j]] = [words[j], words[i]]; }
  return [...new Set(words)].slice(0, n);
}

// Phrase id for a beat in a scenario (the key spaced review uses): a tailored beat's own (scn/beat@L), else scn/beat.
export const phraseId = (scn, beat) => beat.pid || `${scn.id}/${beat.id}`;

// A story at one say level: each beat with an override for that level (its `levels`, docs/v2/notes-content.md) merged
// over it, under the override's review id (scn/beat@L; a chase's `again` encounter under the one it drills), and the
// beats without one as they are. The NPC steps never change, so the story's recordings all still fit. build.py's
// tailor() merges the same way, so a phrase in data.phrases is the beat as played.
export function tailor(scn, lv) {
  if (lv == null || lv === '') return scn;
  const L = String(lv);
  const beat = (b) => {
    let t = b;
    const o = b.levels?.[L];
    if (o) {
      const { levels, ...rest } = b;
      t = Object.assign(rest, o, { pid: `${scn.id}/${b.again || b.id}@${L}` });
      if (o.alts) t.alts = o.alts.map(({ of, ...a }) => ({ ...b.alts[of], ...a })); // the branches that show at this level
    }
    return { ...t, ok: walk(t.ok), fail: walk(t.fail), miss: walk(t.miss), alts: t.alts?.map((a) => ({ ...a, then: walk(a.then) })) };
  };
  const walk = (steps) => steps && steps.map((st) => (st.say ? { ...st, say: beat(st.say) } : st));
  return { ...scn, steps: walk(scn.steps), level: +L, base: scn.level };
}

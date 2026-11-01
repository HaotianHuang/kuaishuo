// Settings and progress, kept on this phone only: localStorage when the browser allows it, memory when it doesn't
// (private windows, artifact previews). Nothing here is ever sent anywhere (tally.js sends daily totals of play, not this).
import { now } from './time.js';

const mem = new Map();
let wiped = false; // Start over (wipe(), below): from then on nothing is written, so the page can go as a phone that never played
const read = (k, d) => { try { const v = localStorage.getItem('ks.' + k); if (v != null) return JSON.parse(v); } catch {} return mem.has(k) ? mem.get(k) : d; };
const write = (k, v) => { mem.set(k, v); if (!wiped) try { localStorage.setItem('ks.' + k, JSON.stringify(v)); } catch {} };
const drop = (k) => { mem.delete(k); try { localStorage.removeItem('ks.' + k); } catch {} };
// the same, for modules that keep their own keys (events.js: ks.log, ks.days, ks.sess); del: a key gone (an answer taken
// back is a question not asked: panel.js)
export const kv = { get: read, set: write, del: drop };
// Settings → Start over (panel.js): every key this game keeps (all of them ks.*, in this file's store or text.js's), gone
// from this browser, and nothing written after, not even what a timer or the page going away would save (events.js's
// log, the learner model, the words seen), so the reload that follows comes up as a phone that has never played. Other
// keys on the same origin (a host's own) stay. → the keys deleted
export function wipe() {
  wiped = true; mem.clear();
  const gone = [];
  for (const st of [globalThis.localStorage, globalThis.sessionStorage]) try { for (let i = st.length - 1; i >= 0; i--) { const k = st.key(i); if (k?.startsWith('ks.')) { st.removeItem(k); gone.push(k); } } } catch {}
  return gone;
}

export const DEFAULTS = {
  pinyin: 'auto',     // auto (the card's assist decides: assist.js) | all | new (hide once a word is familiar) | none
  english: 'auto',    // auto | show | tap | none
  pressure: 'auto',   // auto (the assist's clock) | relaxed (no clock) | normal | panic
  input: 'auto',      // auto (speak if the phone can listen) | speak | tiles | type | self
  sfx: true,
  voice: true,        // the characters' voices; off plays scenes as text only
};

const listeners = new Set();
export const settings = {
  get: (k) => read('set.' + k, DEFAULTS[k]),
  set(k, v) { write('set.' + k, v); listeners.forEach((f) => f(k, v)); },
  on(f) { listeners.add(f); return () => listeners.delete(f); },
  all: () => Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, settings.get(k)])),
};

// Spaced review of the phrases you have said, telling recall from help: said from memory (three stars) a phrase climbs
// a box, with help (two: a hint, the tiles) it keeps its box and waits as long again, with the answer shown or heard
// (one) it slips a box, and missed it falls to the bottom. The first boxes are minutes apart so a phrase comes back in
// the same scrolling session.
const MIN = 60e3, DAY = 864e5;
export const BOXES = [3 * MIN, 20 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 60 * DAY];
// Each entry keeps hist, its last HIST days said as [day, stars] (P5a's then and now: "Tuesday: missed. Today: nailed."),
// one a day, its lowest stars that day (a day missed once stays missed; one a day keeps it small, as every pick parses
// the whole store), the day events.js's dayKey() (starting at 4 am), worked out here as events.js imports this file;
// an entry from before it has none, and gains one as it's next said.
const HIST = 8, dayOf = (t) => { const d = new Date(t - 4 * 3600e3), two = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
// over any { get, set } store and clock (over(), below): the phone's are kv and time.js's
function spaced(st, now) {
  const srs = {
    all: () => st.get('srs', {}),
    get: (id) => srs.all()[id],
    record(id, stars) {
      const all = srs.all(), p = all[id] || { box: 0, seen: 0, best: 0 };
      // right again long before it's due (a replay, a scene scrolled back to) proves nothing new, so moves nothing, not
      // even the due time; needing the answer (one star) or missing it still counts
      const t = now(), early = p.due && t < p.due - BOXES[p.box] / 2;
      const box = stars >= 3 ? Math.min(p.box + 1, BOXES.length - 1) : stars >= 2 ? p.box : stars >= 1 ? Math.max(p.box - 1, 0) : 0;
      if (stars < 2 || !early) { p.box = box; p.due = t + BOXES[box]; }
      p.seen++; p.best = Math.max(p.best, stars); p.last = t;
      const h = p.hist || [], day = dayOf(t), was = h[h.length - 1];
      p.hist = was?.[0] === day ? [...h.slice(0, -1), [day, Math.min(was[1], stars)]] : [...h, [day, stars]].slice(-HIST);
      all[id] = p; st.set('srs', all);
      return p;
    },
    due(at = now()) { return Object.entries(srs.all()).filter(([, p]) => p.due <= at).sort((a, b) => a[1].due - b[1].due).map(([id]) => id); },
    count: () => Object.keys(srs.all()).length,
  };
  return srs;
}
export const srs = spaced(kv, now);

// How often each word has been shown, so pinyin can step back once a word is familiar ("new words only").
let words = null, wordsTimer = 0;
const KNOWN = 6;
export const vocab = {
  seen(w) { words ??= read('words', {}); words[w] = (words[w] || 0) + 1; clearTimeout(wordsTimer); wordsTimer = setTimeout(() => write('words', words), 800); },
  known(w) { words ??= read('words', {}); return (words[w] || 0) >= KNOWN; },
  times(w) { words ??= read('words', {}); return words[w] || 0; }, // how often it's been shown (pinyin by model reads it)
  count() { words ??= read('words', {}); return Object.values(words).filter((n) => n >= KNOWN).length; },
};

// Saved phrases, liked scenes and finished scenes.
function marked(st, now) {
  const marks = {
    list: (k) => st.get(k, []),
    has: (k, id) => marks.list(k).includes(id),
    toggle(k, id) { const l = marks.list(k), i = l.indexOf(id); i < 0 ? l.push(id) : l.splice(i, 1); st.set(k, l); return i < 0; },
    done: (id, result) => { const d = st.get('done', {}); d[id] = { ...result, at: now() }; st.set('done', d); },
    doneAll: () => st.get('done', {}),
  };
  return marks;
}
export const marks = marked(kv, now);

// Spaced review and marks of a learner of their own, over a store and a clock of its own (a Map's { get, set } and a
// simulated day): tools/sim.mjs and tools/rank-check.mjs hold many learners in one process.
export const over = (st, clock = now) => ({ srs: spaced(st, clock), marks: marked(st, clock) });

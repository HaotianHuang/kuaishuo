// Days (docs/v2/p5.md, P5a): the day a moment belongs to (4 am to 4 am), the streak the days keep, the freezes that carry
// it over a missed day, series episodes out a day at a time, 今日挑战 (the same story and modifier on every phone each
// day, and its result as share text with nothing about the player in it), the endings of each story found, and a day
// coming up (ks.soon). Everything from the rows events.js logs and the stores, DOM-free: the phone's (init) hears each
// row as it's logged; Node makes its own over a store and a clock (createDays: tools/days-check.mjs, tools/sim.mjs). The
// ranker never imports this: it's handed released(), challenge() and endings() as options (rank.js), as it's handed mode.
//   init({ data, store = kv, now = time.now })   the phone's: data content.load()'s; hears every row events.js logs from
//                                  now on (events.on) and, the first time, the log so far (a phone that played before P5a)
//   createDays({ data, store, now, rows })  the same API over a store of its own ({ get, set, del? }: over()'s), rows the
//                                  log to start from (as the phone's first time); its rows handed to hear(row) by hand
//   today()          events.js dayKey(): 'YYYY-MM-DD', the day starting at 4 am, so a late night counts for that evening
//   streak()         { n, best, freezes, kept, risk, broke, held }: n the days in a row kept (a day a freeze covered
//                    bridges, adding none), as it stands now (a gap no freeze can cover: 0); kept: today is; risk:
//                    yesterday (or more) unkept and freezes enough to cover it, nothing spent yet (they're spent as the
//                    phone plays next, and today must still be kept); broke: { day (the first day missed), n (the days
//                    it had) } | null, the last streak lost (P5b's repair reads it); held: { day (the last missed day a
//                    freeze covered), n (freezes spent), left } | null, not yet told: "Your streak held: a freeze covered
//                    Tuesday. 1 left." (only of the day the phone came back, and the streak standing: never a freeze the
//                    first time's replay of the log spent, nor once the streak's broken or a later day played)
//   told()           that notice said (the first visit after it, once): held is null till the next freeze is spent
//   played()         days this phone has played on (a line answered, a card played);  stories(): the stories finished
//                    (each once, the content's);  since(): days since install (0 on the first)
//   released(scn)    a series episode is out: episode 1 always (and a story of no series); episode k the day after k − 1
//                    was first finished (scn or its id). The ranker's released option; the teaser says "Episode 4 ·
//                    tomorrow" while an episode whose last one is finished isn't
//   challenge(day?)  { n, id, mod, day, played }: day's 今日挑战 (today's by default): n counting days from 2026-11-01 (#1;
//                    0 and less before it), id the story's, mod 'panic' (n odd: the clock at A0's ×0.7 whatever the
//                    rung) or 'quiet' (even: no pinyin, no English), played: a run of it (card rows kind 'challenge')
//                    finished that day (left part-way, it isn't: the menu plays it on). The story: hash(day) % the pool (the stories every learner can be
//                    dealt: base level ≤ 2, no series episode, by id), the next in the pool where that's the day
//                    before's, so two days running never share one; the same on every phone with the same content.
//                    The level is the learner's (rank.js: the level the story has nearest learner.level().say, the
//                    lower of two as near), so everyone plays the same moment
//   result(day?)     { n, id, mod, squares, right, of, text } | null (till a run's finished): the challenge's lines as
//                    squares, one a line in the order first met, its first go's (a run left part-way and played on keeps
//                    the lines it had; once finished, again changes nothing): 🟩 right first time with no help beyond the rung's (no hint paid, no second try, the
//                    answer not heard), 🟨 right with help or on a second try, 🟥 missed; text the share text, exactly
//                    `快说 #42 🐯 🟩🟩🟨🟩🟥 4/5` (the story's stage emoji, right of all): no link, no ID, nothing of the player's
//   pending(id, day?) the same for the challenge card on screen (story id), as its row will record it: the result if a
//                    run's finished, else the day's lines so far with the card's own (its end screen's, before its row)
//   endings(scn)     { found, of, keys }: a story's endings (its end steps, wins and named losses alike, every branch
//                    walked), of: how many, found: how many a run of it on this phone has reached, from the log alone
//                    (kept in ks.ends, so the log's ring forgetting a row doesn't lose one). A story's card row, done,
//                    names its ending as end: endKey(the end step its run returned at: story.js run()'s hooks.end(st));
//                    a row without one (an older build, the simulator) is the story's only ending of the row's out,
//                    where it has only one of that outcome (else unknown: not counted). Tailored levels share their
//                    story's end steps (content.tailor never changes an NPC step)
//   endKey(st)       an end step's key: its words (st.zh, else st.en): what stays as a build is recorded again
//   soon()           ks.soon (Settings → Your Chinese, the later about card: "Anything coming up?") as it stands:
//                    { what, day, left, goal, near, past } | null (never asked); what 'lny' (Lunar New Year with family)
//                    | 'trip' | 'wedding' (a wedding or birthday) | 'visit' (a call or visit) | 'none'; day 'YYYY-MM-DD' or
//                    null; left: days from today to it (null without a day); goal: the one it implies, 'family' or
//                    'travel' (a trip), null for none; near: 0–30 days left (rank.js weighs the goal's topics and gaps
//                    more as it nears); past: the day gone by (ask how it went, once)
//   setSoon(v)       ks.soon = { what, day } (null: taken back, absent again); announce it with 'ks:you', as P3's answers
//   went(face)       how it went (😂 | 😳 | ❤️, kept as counts only, ks.went; null: not said): ks.soon cleared, so the next
//                    can be asked
//   lunar(day?)      the next Lunar New Year on or after day (today's): 2027-02-06, 2028-01-26, 2029-02-13, 2030-02-03; null after
//   hear(row)        a row as events.js logs it (init does this on the phone)
// Kept: ks.streak = { install, kept: [day…] (the last 60), freezes, spent: [day…] (the last 60), best, n (the run as of
// the last day kept), on: { day, stories, reviews } (the day's count so far), played, last (the last day played), held,
// broke, ch: { day, n, id, mod, lines: [[id, square]…], done } (the day's challenge as played) }; ks.ends = { scn: [key…] };
// ks.drops = { episode id: the day first finished }; ks.soon; ks.went (not ks.days: events.js's daily totals live there).
// A day is kept by one story finished (a card row, kind scn or challenge, state done) or three review lines answered (a
// first attempt at a flash crisis or a run's line, row task 'review', not skipped; a word written again: a write card
// done whose word was in spaced review before it). A freeze is earned at each 7 days in a row (7, 14, 21 …), two held at
// most, and spent by itself on each day missed between two played ones, as the phone plays again (a gap longer than the
// freezes held spends none: the streak breaks, the freezes kept for the next).
import { kv, over } from './store.js';
import { now as clock } from './time.js';
import * as events from './events.js';

const DAY = 864e5, KEEP = 60, HELD = 2, EVERY = 7, REVIEWS = 3, FIRST = '2026-11-01', NEAR = 30;
const LNY = ['2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'];
const GOAL = { lny: 'family', wedding: 'family', visit: 'family', trip: 'travel' };
const SQ = { ok: '🟩', help: '🟨', miss: '🟥' }, BESIDE = ['practice', 'typeback', 'shadow', 'bonus'];
// a day key as a number of days, and back (UTC both ways: a key is a calendar date, whatever the zone)
const ix = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY;
const key = (i) => new Date(i * DAY).toISOString().slice(0, 10);
// FNV-1a, then murmur's finaliser, so days a character apart land far apart in the pool
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
// a story's end steps, every branch walked (ok, fail, miss, an or-branch's then), each once in the order found: { key, end }
export const endsOf = (scn) => { const out = [], seen = new Set(), walk = (l) => { for (const st of l || []) { if ('end' in st) { if (!out.some((e) => e.key === endKey(st))) out.push({ key: endKey(st), end: st.end }); } else if (st.say && !seen.has(st.say)) { const b = st.say; seen.add(b); walk(b.ok); walk(b.fail); walk(b.miss); (b.alts || []).forEach((a) => walk(a.then)); } } }; walk(scn.steps); return out; };
export const endKey = (st) => st.zh || st.en || st.end;

export function createDays({ data = null, store = kv, now = clock, rows = null } = {}) {
  const { srs, marks } = over(store, now), today = () => events.dayKey(now());
  const byId = () => (data ? (data.byId ||= Object.fromEntries(data.scenarios.map((s) => [s.id, s]))) : {}), walked = new Map(), endsFor = (s) => (walked.has(s.id) ? walked.get(s.id) : walked.set(s.id, endsOf(s)).get(s.id));
  // the endings found and the episodes' first finishes, read once (the ranker asks endings() of every story a pick)
  // and written through
  const ends = store.get('ends', {}), drops = store.get('drops', {});
  const fresh = (day) => ({ v: 1, install: day, kept: [], freezes: 0, spent: [], best: 0, n: 0, on: { day, stories: 0, reviews: 0 }, played: 0, last: null, held: null, broke: null, ch: null });
  let st = store.get('streak', null), pend = []; // pend: the line rows since the last card row (a card's own lines)
  const save = () => store.set('streak', st);
  // the last day kept or covered by a freeze
  const covered = () => { const a = st.kept[st.kept.length - 1], b = st.spent[st.spent.length - 1]; return a && b ? (a > b ? a : b) : a || b || null; };
  // A day played after a gap: each day missed since the last one covered a freeze, if there are enough (said once, as
  // held), else the streak is broken there
  function resolve(day) {
    const last = covered(), gap = last ? ix(day) - ix(last) - 1 : 0;
    if (gap <= 0 || !st.n) return;
    if (gap <= st.freezes) { for (let i = 1; i <= gap; i++) st.spent.push(key(ix(last) + i)); st.spent = st.spent.slice(-KEEP); st.freezes -= gap; st.held = { day: key(ix(day) - 1), n: gap, left: st.freezes }; }
    else { st.broke = { day: key(ix(last) + 1), n: st.n }; st.n = 0; }
  }
  function keep(day) {
    if (st.kept[st.kept.length - 1] === day) return;
    const last = covered();
    st.n = last && ix(day) - ix(last) <= 1 ? st.n + 1 : 1; // (a run a gap broke starts again at 1)
    if (st.n % EVERY === 0) st.freezes = Math.min(HELD, st.freezes + 1);
    st.best = Math.max(st.best, st.n);
    st.kept = [...st.kept, day].slice(-KEEP);
  }
  // the challenge's lines as squares, by line, in the order first met (a line's rows: its first attempt, then the rest)
  const square = (rs) => { const f = rs[0], paid = (r) => (r.hint || 0) > (r.free || 0); return f.att === 1 && f.res === 'ok' && !paid(f) && !f.hear && !f.counted && !f.tries ? SQ.ok : rs.some((r) => r.res === 'ok') ? SQ.help : SQ.miss; };
  function hear(row) {
    if (!row || row.ad || (row.k !== 'line' && row.k !== 'card')) return;
    const day = events.dayKey(row.at ?? now());
    if (st.on?.day !== day) st.on = { day, stories: 0, reviews: 0 };
    let changed = false;
    const play = row.k === 'line' ? row.res !== 'cancel' : row.state !== 'idle' && !['end', 'recap', 'about'].includes(row.kind);
    if (play && st.last !== day) { st.held = null; resolve(day); st.played++; st.last = day; changed = true; } // (the notice is of the day you came back: not said by then, it's old news)
    if (row.k === 'line') {
      if (row.att === 1 && row.task === 'review' && row.res !== 'cancel' && row.res !== 'skip') { st.on.reviews++; changed = true; }
      if (!BESIDE.includes(row.task)) pend.push(row);
    } else {
      const story = row.kind === 'scn' || row.kind === 'challenge', done = row.state === 'done' && !row.again;
      if (story && done) { st.on.stories++; changed = true; found(row); if (byId()[row.id]?.series && !drops[row.id]) { drops[row.id] = day; store.set('drops', drops); } }
      if (row.kind === 'write' && done && (srs.get('write:' + row.id)?.seen || 0) >= 2) { st.on.reviews++; changed = true; }
      if (row.kind === 'challenge' && (row.state !== 'idle' || row.asked)) { tried(row, day); changed = true; }
      pend = [];
    }
    if ((st.on.stories >= 1 || st.on.reviews >= REVIEWS) && st.kept[st.kept.length - 1] !== day) { keep(day); changed = true; }
    if (changed) save();
  }
  // the day's challenge with a card's lines merged in (those of its story since the card before, answered: a line left
  // as the card was isn't one), each line's first square kept: a page hidden and back logs the card twice, and a run
  // left part-way goes on where it was when it's played again. Once a run's finished, nothing changes it (again, it
  // plays for fun)
  function merged(id, day) {
    const c = challenge(day), mine = st.ch?.day === day && st.ch.id === id ? { ...st.ch, lines: [...st.ch.lines] } : { day, n: c.n, id, mod: c.mod, lines: [], done: false };
    if (mine.done) return mine;
    const by = new Map();
    for (const r of pend) if (r.res !== 'cancel' && String(r.id).startsWith(id + '/')) (by.get(r.id) || by.set(r.id, []).get(r.id)).push(r);
    for (const [k, rs] of by) if (!mine.lines.some(([x]) => x === k)) mine.lines.push([k, square(rs)]);
    return mine;
  }
  // a challenge card's row
  function tried(row, day) { st.ch = merged(row.id, day); st.ch.done ||= row.state === 'done'; }
  // an ending reached: the row's own (end), else the story's only one of its outcome
  function found(row) {
    const s = byId()[row.id], es = s ? endsFor(s) : [], of = es.filter((e) => e.end === (row.out === 'lose' ? 'lose' : 'win'));
    const k = es.some((e) => e.key === row.end) ? row.end : of.length === 1 ? of[0].key : null;
    if (!k) return;
    const got = ends[row.id] || [];
    if (!got.includes(k)) { ends[row.id] = [...got, k]; store.set('ends', ends); }
  }

  // the challenge's story by day index: the pool's hash pick, the next one where it's the day before's (run[j]: j days
  // after the first challenge's, each worked out once)
  let pool = null;
  const run = [];
  const pickAt = (i) => {
    // (levels 1–2, no series: an L0 story's help is fixed by its level, no clock and pinyin over every word, so neither
    // modifier would show; and an episode waits on the one before it)
    pool ??= data ? data.scenarios.filter((s) => s.level >= 1 && s.level <= 2 && !s.series).map((s) => s.id).sort() : [];
    if (!pool.length) return null;
    const one = (j) => hash(key(j)) % pool.length, i0 = ix(FIRST);
    if (i <= i0) return one(i);
    if (!run.length) run.push(one(i0));
    while (run.length <= i - i0) { const r = one(i0 + run.length), p = run[run.length - 1]; run.push(r === p ? (r + 1) % pool.length : r); }
    return run[i - i0];
  };
  function challenge(day = today()) {
    const n = ix(day) - ix(FIRST) + 1, i = pickAt(ix(day));
    return { n, id: i == null ? null : pool[i], mod: n % 2 ? 'panic' : 'quiet', day, played: st.ch?.day === day && st.ch.done };
  }
  const shown = (c) => {
    const squares = c.lines.map(([, q]) => q).join(''), right = c.lines.filter(([, q]) => q !== SQ.miss).length, stage = byId()[c.id]?.stage;
    return { n: c.n, id: c.id, mod: c.mod, squares, right, of: c.lines.length, text: `快说 #${c.n}${stage ? ' ' + stage : ''} ${squares} ${right}/${c.lines.length}` };
  };
  // a finished run's (part-way, there's no result yet: the menu plays it on)
  const result = (day = today()) => (st.ch?.day === day && st.ch.done && st.ch.lines.length ? shown(st.ch) : null);
  // the challenge as its card on screen stands, as its row will record it (its end screen's, before that row: a finished
  // run's result, else the lines so far and its own)
  const pending = (id, day = today()) => { const c = merged(id, day); return c.lines.length ? shown(c) : null; };

  function streak() {
    const day = today(), last = covered(), gap = last ? ix(day) - ix(last) - 1 : 0, kept = st.kept[st.kept.length - 1] === day;
    const lost = st.n > 0 && gap > st.freezes, broke = lost ? { day: key(ix(last) + 1), n: st.n } : st.broke;
    return { n: lost ? 0 : st.n, best: st.best, freezes: st.freezes, kept, risk: !kept && st.n > 0 && gap > 0 && !lost, broke: broke ? { ...broke } : null, held: st.held && !lost ? { ...st.held } : null };
  }
  const told = () => { if (st.held) { st.held = null; save(); } };
  const finished = (id) => { if (drops[id]) return drops[id]; const d = marks.doneAll()[id]; return d ? events.dayKey(d.at) : null; };
  function released(scn) {
    const s = typeof scn === 'string' ? byId()[scn] : scn;
    if (!s?.series || s.series.ep <= 1) return true;
    const prev = data.scenarios.find((x) => x.series?.id === s.series.id && x.series.ep === s.series.ep - 1), d = prev && finished(prev.id);
    return !!d && d < today();
  }
  function endings(scn) {
    const s = typeof scn === 'string' ? byId()[scn] : scn;
    if (!s) return { found: 0, of: 0, keys: [] };
    const all = endsFor(byId()[s.id] || s).map((e) => e.key), got = (ends[s.id] || []).filter((k) => all.includes(k));
    return { found: got.length, of: all.length, keys: got };
  }
  function soon() {
    const v = store.get('soon', null);
    if (v == null) return null;
    const left = v.day ? ix(v.day) - ix(today()) : null;
    return { what: v.what, day: v.day || null, left, goal: GOAL[v.what] || null, near: left != null && left >= 0 && left <= NEAR, past: left != null && left < 0 };
  }
  const setSoon = (v) => (v == null ? (store.del ? store.del('soon') : store.set('soon', null)) : store.set('soon', { what: v.what, day: v.day || null }));
  function went(face) {
    if (face) { const w = store.get('went', {}); w[face] = (w[face] || 0) + 1; store.set('went', w); }
    setSoon(null);
  }
  const lunar = (day = today()) => LNY.find((d) => d >= day) || null;

  // the first time: the log so far (a phone that played before P5a), then the episodes finished before the log begins
  // (their days from the marks: the last time each was finished, the nearest the phone kept)
  if (!st) {
    const rs = (rows || []).filter((r) => r && r.at != null);
    st = fresh(rs.length ? events.dayKey(Math.min(...rs.map((r) => r.at))) : today());
    for (const r of rs) hear(r);
    st.held = null; // (a freeze the log's replay spent was never news: nothing to tell)
    if (data) { const done = marks.doneAll(); for (const s of data.scenarios) if (s.series && done[s.id] && !drops[s.id]) drops[s.id] = events.dayKey(done[s.id].at); store.set('drops', drops); }
    save();
  }
  return { today, streak, told, played: () => st.played, stories: () => Object.keys(marks.doneAll()).filter((id) => byId()[id]).length, since: () => Math.max(0, ix(today()) - ix(st.install)),
    released, challenge, result, pending, endings, endKey, soon, setSoon, went, lunar, hear };
}

// the phone's: made by init(), once content is loaded (main.js, after learner.init)
let me = null, off = null;
export function init({ data, store = kv, now = clock } = {}) {
  off?.();
  me = createDays({ data, store, now, rows: store.get('streak', null) ? null : events.all() });
  off = events.on((row) => me.hear(row));
  return me;
}
const it = () => me || init({ data: null });
export const today = () => it().today(), streak = () => it().streak(), told = () => it().told(), played = () => it().played(), stories = () => it().stories(), since = () => it().since();
export const released = (scn) => it().released(scn), challenge = (day) => it().challenge(day), result = (day) => it().result(day), pending = (id, day) => it().pending(id, day), endings = (scn) => it().endings(scn);
export const soon = () => it().soon(), setSoon = (v) => it().setSoon(v), went = (face) => it().went(face), lunar = (day) => it().lunar(day), hear = (row) => it().hear(row);

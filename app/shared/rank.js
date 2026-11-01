// The For You ranker (docs/v2/p2.md; algorithm.md §4 gives the reasons): the card that comes next, picked as it's
// needed, from what the learner model makes of the player's Chinese, what spaced review has due, what they've played,
// liked and left, and how this visit is going. Every story is a candidate at each say level it has (content.tailor()),
// with the rung the assist ladder would give it; so are rematches, the reviews due, words to write and lines to shadow
// from the stories just played, and the next episode of a series under way. The hard rules come first; then the score,
// 0.35 engagement (Thompson draws from Beta arms for format and topic, ks.arms) + 0.30 fit (how near the card's
// expected success is to τ, the target for the moment) + 0.25 learning value + 0.10 variety, and 0.15 more for the next
// episode. Tired, or a while on a win, it ends the visit on a high: a sure win, then a recap. DOM-free, with everything
// passed in (Node runs it: tools/sim.mjs, tools/rank-check.mjs); and ad-blind: it never imports econ.js or ads.js (P5),
// and a row an ad brought about (marked ad: a save's line asked again) is never heard, so nothing it deals can be shaped
// by an offer that might follow it.
//   createRanker({ data, learner, assist, srs, marks, store, now, rng, mode, runs, resume, explain, review, hold,
//                  released, quiet, challenge, endings })
//     data: content.load()'s; learner, assist: the modules; srs, marks: store.js's (or over()'s); store: kv (ks.arms);
//     now: time.js's; rng: () → [0, 1) (Math.random; seeded in tools); mode(scn, kind): how the player will answer a
//     story's lines (a way, or beat → way: feed.js's) and a 'review' or 'run' card's (a way), asked once a pick for each
//     format and kind (so it may read only the story's format); runs: chase.createRun exists; resume(): the visit under
//     way when the ranker is made inside one ({ start, rows }: events.js's session and the rows logged since it began; the
//     Mix opened again, a tab the phone reloaded), so the visit carries on rather than starting over; explain: every
//     candidate, and the rule it broke, on why.cands (tools/rules.mjs reads them; slower: tests only), and the goals as
//     the pick read them on why.goals (every format's and topic's prior, every skill's gap weight); review: the
//     review levers (REVIEW, as shipped; tools/sim.mjs --review= measures the others); hold: R7's visits (3; the
//     simulator's --hold= what-if). P5a's (docs/v2/p5.md), each read as a pick needs it, as mode is (the ranker never
//     imports days.js): released(scn) → a series episode is out (days.released: the day after the one before was
//     first finished; every one by default), asked of an episode whose one before is done; quiet() → quiet mode is on
//     ("Can't talk now", the visit answered with no voice: mode() then gives the typed way or tiles, feed.js's, and no
//     shadow card is dealt); challenge() → today's 今日挑战, days.challenge()'s { n, id, mod, day, played } (none: no
//     challenge dealt); endings(scn) → days.endings()'s { found, of } (none: no story dealt for its endings)
//   next()      → { item, why } | null: the next card. Asked again before the card it gave has come on screen (the card
//               before it done, its outcome known), it's that place picked again: the same item if the choice stands.
//               null: nothing to deal now (below an end card, till something falls due)
//   again()     that re-pick only (null once the last card dealt is on screen, or when nothing could take its place)
//   after(row)  every row events.js logs (events.on), line and card: the visit and the arms learn from them
//   back()      the page back from hidden: the time away isn't time spent (events.js's), unless it ended the visit
//   unsee(ids)  phrases a run never reached: as due as before;  waiting(): the reviews due that it deals below an end card
//   session()   the visit as the ranker sees it: { start, returning, minutes, fatigue, tau, cards, lines, nailed, written,
//               placing, place ({ n, call, chat, bonus, end } or null), hook (when it was dealt), about (when it was seen),
//               challenge (the day of the last challenge that came on screen, ks.arms.challenge), quiet (quiet()) }
// items: { kind: 'scn', scn (tailored to lv), lv, A, tau } (A, tau: the rung it was scored at and the τ that chose it;
//   feed.js assisted() chooses the rung played, as the card comes on screen: with tau passed, the same one) |
//   { kind: 'review', p } | { kind: 'run', ps, audio } (each with A and tau too where REVIEW.rung: played at that rung) |
//   { kind: 'write', item } | { kind: 'shadow', item: { scn, step } } (mix.js's, as v1 dealt them) |
//   { kind: 'recap', said, nailed, written, back, next } (next: { id, ep, en, out } | null, the next episode of the
//   series last played, its cliffhanger and whether it's out yet: false, "Episode 4 · tomorrow") | { kind: 'end' } |
//   { kind: 'about', ask } (about.js: the questions unanswered, in ASK's order; on the later card, P5a's, 'soon' last:
//   "Anything coming up?") | { kind: 'bonus', p } (a phrase, played as a review card at A2, its line row's task 'bonus':
//   PL3) | { kind: 'challenge', scn (tailored to lv), lv, A, tau, mod, n, day } (今日挑战, P5a: played as a story at rung
//   A, aimed at a loss's τ (0.92: its modifier takes about a rung's help away, so it plays near the visit's own), mod over it: 'panic' the clock at A0's ×0.7 whatever the rung, 'quiet' no pinyin and no English; its card row
//   kind 'challenge', id the story's, as events.js what() logs it; it costs no heart)
// why: { score, E, F, V, N, tau, p, A, lv, rule, cls (a story's: new, level, rematch, ending), prop (the share of 16 Thompson draws
//   the pick wins: its propensity), n (the cards the rules allowed), fat (fatigue), place (dealt while placing) }; rule:
//   first, first* (no story at p̄ 0.85: the surest), score, due (a review R3 asked for), sure win, recap, end, below end,
//   hook, about, bonus, warmup, challenge, and where nothing the rules allow is left but stories are, format* (R2 gave
//   way) and surest* (R6 gave way). (The about card and the bonus carry only tau, fat and rule; the bonus its p, A2 and
//   lv too; the later about card later: true.) explain's why.goals has soon too: { goal, w, left } or null
//
// The hard rules, as rank-check.mjs holds every pick to them (p2.md's, made exact; R7 is this file's):
//   R1 a visit's first card is a story with p̄ ≥ 0.85 at its rung, the one with the top E (of equals, the best fit)
//   R2 no format twice running (a run is a chase; a review, a write, a shadow each a format of its own)
//   R3 while a review it may deal is due (one R2 allows: a word to write again waits a card after a word written), a
//      review (a flash crisis, a run, a word to write again) at least every 4th card, never two in a row
//   R4 reviews, writes and shadows together at most 40% of the visit's cards, after every card (a write or shadow only
//      where the review that R3 may need next would still fit)
//   R5 none of them in the visit's first 3 cards
//   R6 nothing under p̄ 0.55 even at A5: a story out of reach with all the help the ladder has (one in reach, but not at
//      the rung it would start at, is the fit's to weigh: the ladder eases it as it goes); a card with no rung to ease
//      it (a review, a run, a word, a line to shadow: v1's) under 0.55 as it is
//   R7 a call whose listening is more than a level above what you can surely follow waits, through a phone's first 3
//      visits: listen ≤ 1 + the listen level of θL less g's sd (a new learner never meets a fast caller early, a
//      heritage one soon does); after them the fit weighs it (A4 and A5 never hang up, A5 has subtitles), since L is
//      heard mostly on calls and a rule that waited for it would wait for ever
// The stories a visit can still bring that are new to you (never played, or a level of one whose lines are mostly new)
// come before rematches: a rematch only when none of them is allowed. Recaps and end cards are no format and none of the
// 40%. With no card the rules allow while stories are left, two rules give way, in order and said so (why): R2 (format*:
// the best story in reach, of the last card's format), then R6 (surest*: none in reach even at A5, the surest story,
// another format first). R7 and a series' order never do. Only with no story left does an end card close the visit's
// stories; below it, the reviews due, as many as the learner asks for, as v1 dealt them (the floor too: asked for, not
// dealt unasked).
//
// The first session (p3.md). A phone that has never played (nothing in the model, in spaced review or done) opens on the
// hook, R1's first card: a build's scenario marked first, else airport-esim, at its base level and the rung startAt()
// gives (A2 on a blank model; its first three lines at FIRST_LINE and a step down each, A5 A4 A3), unless R6 or R7
// hold it. Card 2 is the about card (home, goals, born: those unanswered),
// or, if that visit ended before it came on screen (the hook's row logged as the page went: how 'hide'), the first card
// of the next; once on screen it's never dealt again, whatever was tapped. Placing, from the hook until 12 first
// attempts on story cards: every story aimed at τ 0.70 (a loss's, a start's or tiredness's τ
// before it), V its lines' information (Σ p(1 − p)·a·C·a, rescaled 0–1 over the stories the rules allow); PL1, after
// the visit's first card, while no placement call has been played, a call where one is allowed (R7 holds a new
// learner's: then none); PL2 likewise a chat; PL3 the bonus line, once, after a card whose first attempts were all
// right, not in the first 3 cards, R2 and R3 allowing and the end on a high not under way: a phrase never met, of a
// story not played, a level up (3–5), its chance nearest even; missed, it's no loss (target() and the recap skip it).
// v1's warmup: 5 cards into a visit with no review, the longest phrase met in it, not due yet, comes back once as a flash
// crisis, where the rules allow a review and none is owed. The goals (the about card's) set priors and weights (GOALS).
//
// The loops (p5.md, P5a). Today's challenge (challenge()) is dealt once a day as a story card, rule 'challenge', at the
// level its story has nearest learner.level().say (the lower of two as near) and the rung startAt() gives: never a
// visit's first card, never while placing or straight after a loss (a story or a run lost), only where the rules let a
// story be (R2 by its format, R3, R6, R7; a story for R4 and R5), aimed at a loss's τ (0.92) and only where it's in
// reach as played (its modifier takes about a rung's help away: R6's floor at the rung under the one the ladder gives),
// not once it's been on screen that day (ks.arms.
// challenge) or played (challenge().played: the menu opens it too); the first place all that allows, after the end on
// a high. Till then its story is saved for it: not dealt as itself (any level), so an ordinary card of it can't take
// the visit's one go at the story (once a visit) and leave the day without its challenge. Series episodes are dealt only once released() says they're out. In quiet mode no shadow card is dealt. A
// story played before whose endings aren't all found (endings(), of more than one) is a rematch worth playing (cls
// ending, V 0.5, a review's just due), once a visit, never ahead of the stories new to you (the review lever brings
// a visit's first rematch ahead; not this one), and never by a rule giving way (format*, surest*). Inside 30 days of the day coming up (ks.soon), the goal it implies
// (family; a trip's travel) weighs its topics' arms (+0.1) and gaps (family's ×1.3) more, by w = (31 − days left) / 31.
// And a phone that played before P3 (no hook ever dealt) and has never seen the about card is asked once (P3's three
// and 'soon', those unanswered): never a visit's first card or straight after a loss, once a visit, after the challenge.
import { tailor, phraseId } from './content.js';
import { linesToShadow, wordsToWrite } from './picks.js';
import * as levels from './levels.js';
import { BOXES } from './store.js';

// P2's due reviews put right (p3.md): three levers, measured alone and together by tools/sim.mjs (--review=): runs of up
// to ten phrases (P2's five), a review dealt at the rung the ladder would give its line (so the floor lets a weak
// learner's reviews through: a flash crisis or a run is predicted, and played, there; srs credit capped by the help
// it gives free, as a story's is), and one rematch a visit ahead of the stories new to you. REVIEW is what shipped:
// all three, the most due reviews served (p3.md's as-built section has the table: on data/, p4b-2 and p4b-3, seeds 1–3,
// 38% within two visits against v1's 22% and P2's 15%, every persona at v1's share or more, D7 and skill gain over v1's).
export const REVIEW = Object.freeze({ run: 10, rung: true, rematch: true });
const GAP = 30 * 60e3, BUSY = 5 * 60e3, DAY = 864e5, DRAWS = 16;
const TAU = { base: 0.8, start: 0.9, loss: 0.92, tired: 0.88, harder: 0.7, place: 0.7 };
// today's challenge is aimed at a loss's (its modifier takes about a rung's help away, and its story is the day's, not one
// picked for its fit), from the feed and from the menu (mix.js challengeItem) alike, so everyone plays the same moment
export const CHALLENGE_TAU = TAU.loss;
const FIRST = 0.85, FLOOR = 0.55, SURE = 0.9, SHORT = 60, CAP = 0.4, EVERY = 4, EARLY = 3, APART = 8, LONG = 12, HOLD = 3;
// Placement (p3.md): from the hook until 12 lines (first attempts on story cards) have been answered; a story is aimed at
// τ 0.70 then, the most informative point while mostly winning. (p3.md's other end, g's sd under 0.4, never came: g's sd
// is 0.49–0.53 after placement's lines in every simulated learner, so it's gone rather than kept untestable.)
// The bonus line: a level up from the say level, clamped to 3–5. The hook: a build's scenario marked first, else
// airport-esim. The warmup (v1's): five cards into a visit with no review, the longest phrase met in it comes back
// early, once.
const PLACE = 12, BONUS = [3, 5], HOOK = 'airport-esim', WARM = 5;
// the critics' ranking, weight 4 (p2.md); the cards between the stories (theirs to rank, not the critics') a little
// under them; a topic with no goal behind it starts where the formats do, one a goal names at 0.8 (GOALS)
const PRIOR = { scene: 0.78, call: 0.76, chat: 0.72, chase: 0.7, review: 0.7, run: 0.72, write: 0.65, shadow: 0.62 }, WEIGHT = 4, TOPIC = 0.7, GOAL = 0.8;
// What the player would love to do in Chinese (the about card, ks.goals: a list, [] none chosen), as algorithm.md §3
// weighs it: a goal's topics start their arms at 0.8; reading and writing lifts the chat's and the write card's priors,
// fun the scene's and the chase's; and V's gaps weigh family's L, S and V ×1.3, reading's R and W ×1.5. (data/ has no
// topics: there goals act through formats and gaps.)
const GOALS = {
  family: { topics: ['family', 'home', 'celebrations', 'dating'], gap: { L: 1.3, S: 1.3, V: 1.3 } },
  travel: { topics: ['travel', 'food', 'shopping'] },
  read: { fmt: { chat: 0.08, write: 0.08 }, gap: { R: 1.5, W: 1.5 } },
  fun: { fmt: { scene: 0.05, chase: 0.05 } },
};
// the questions the about card asks, in its order (about.js): home (learner.persona()), goals (ks.goals), born (ks.born);
// and the later card (P5a: a phone that played before P3) "Anything coming up?" too (ks.soon: days.js's)
const ASK = ['home', 'goals', 'born'], LATER = [...ASK, 'soon'];
// The day coming up (ks.soon, P5a): the goal each implies (a trip's travel, the rest family), and inside NEAR days of it
// its topics' arms start LIFT higher and its gaps weigh more (family's L, S and V up to ×1.3 more), rising to the day
const SOON = { lny: 'family', wedding: 'family', visit: 'family', trip: 'travel' }, NEAR = 30, LIFT = 0.1;
const KINDS = Object.keys(PRIOR), SKILLS = ['L', 'S', 'V', 'T', 'R', 'W'];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
// a slot or candidate that plays a story (a story card, or 今日挑战's), and the arm its format is drawn from
const story = (x) => x.kind === 'scn' || x.kind === 'challenge', armOf = (c) => (story(c) ? c.fmt : c.kind);
const empty = (o) => { for (const k in o) return false; return true; };
const σ = (z) => 1 / (1 + Math.exp(-z));
const mean = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : NaN);
const median = (a) => { const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
// a skill as a level, as learner.js level() reads one: the level of a typical line it gets right 80% of the time at A2
const lvl = (t) => clamp(1 + (t + 1 - Math.log(4)) / 0.67, 0, 5);
// the end of tomorrow, the day starting at 4 am (events.js dayKey()): what the recap counts as back tomorrow
const tomorrow = (t) => { const d = new Date(t - 4 * 3600e3); d.setHours(0, 0, 0, 0); return d.getTime() + 4 * 3600e3 + 2 * DAY; };

// Beta draws from two gammas (Marsaglia and Tsang), on the rng given, so a seeded run picks the same cards
let spare = null, spareOf = null; // Box-Muller gives two normals: the second is the next call's, on the same rng
const normal = (rng) => {
  if (spare != null && spareOf === rng) { const z = spare; spare = null; return z; }
  const r = Math.sqrt(-2 * Math.log(1 - rng())), a = 2 * Math.PI * rng();
  spare = r * Math.sin(a); spareOf = rng;
  return r * Math.cos(a);
};
function gamma(a, rng) {
  if (a < 1) return gamma(a + 1, rng) * rng() ** (1 / a);
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const beta = (a, b, rng) => { const x = gamma(a, rng); return x / (x + gamma(b, rng)); };

// a scenario's say beats, every branch walked (ok, fail, miss, an or-branch's then), each once
function beats(scn) {
  const out = new Set(), walk = (l) => { for (const st of l || []) if (st.say && !out.has(st.say)) { const b = st.say; out.add(b); walk(b.ok); walk(b.fail); walk(b.miss); (b.alts || []).forEach((a) => walk(a.then)); } };
  walk(scn.steps);
  return [...out];
}
// the id a beat's rows and review go by: a chase's again encounter is logged under the line it drills (chase.js)
const rowId = (scn, b) => b.pid || phraseId(scn, b.again ? { id: b.again } : b);
// what a way of answering asks of each skill (learner.js WAYS), a call moving .3 of each loading to listening
const loads = (W, way, call) => SKILLS.map((k) => { const w = W[way]?.[k] || 0; return call ? (k === 'L' ? w + 0.3 * (1 - w) : 0.7 * w) : w; });

export function createRanker({ data, learner, assist, srs, marks, store, now, rng, mode = () => 'self', runs = true, resume = null, explain = false, review = REVIEW, hold = HOLD, released = () => true, quiet = () => false, challenge = null, endings = null }) {
  const byId = data.byId || Object.fromEntries(data.scenarios.map((s) => [s.id, s]));
  const phraseById = data.phraseById || Object.fromEntries(data.phrases.map((p) => [p.id, p]));
  // Every story at each level it plays at (its own, and any beat's override keys), tailored once: the lines it could
  // ask (by the ids the model and the assist know them by, and the ids their rows and reviews go by: a line's meetings,
  // which set its rung at L0, are counted under the latter), how long it runs, its topic (the content's; data/ has none,
  // so a story's arm is its format's alone), tags, listening and series.
  const plays = data.scenarios.flatMap((s) => {
    const own = beats(s), ls = [...new Set([s.level, ...own.flatMap((b) => Object.keys(b.levels || {}).map(Number))])].sort((a, b) => a - b);
    return ls.map((L) => {
      const t = L === s.level ? s : tailor(s, L), bs = beats(t);
      const pids = bs.map((b) => phraseId(t, b)); // each beat's
      return { s, t, L, bs, pids, key: `${s.id}@${L}`, ids: [...new Set(pids)], rows: [...new Set(bs.map((b) => rowId(t, b)))], met: new Map(bs.map((b) => [phraseId(t, b), rowId(t, b)])), fmt: s.format, topic: s.topic || s.topics?.[0] || null,
        tags: new Set([...(s.tags || []), ...(s.topics || [])]), listen: s.listen ?? (s.format === 'call' ? Math.max(3, s.level + 1) : s.level), secs: s.secs || 100, hook: s.hook };
    });
  });
  // the words to write and the lines to shadow of each story as it plays at each level (picks.js takes the story
  // tailored: a level's own lines, scn/beat@L where it overrides them), and the words to write again from memory, by
  // review id (write:信号), each with the first story that teaches it (v1's), a base level before a variant
  const words = new Map(plays.map((pl) => [pl.key, wordsToWrite(data, pl.t)])), echoes = new Map(plays.map((pl) => [pl.key, linesToShadow(pl.t)])), writing = {};
  for (const pl of [...plays].sort((a, b) => (a.L !== a.s.level) - (b.L !== b.s.level))) for (const w of words.get(pl.key)) writing['write:' + w.word] ||= w;
  // the hook: a phone that has never played opens on it (p3.md), at its base level
  const hook = data.scenarios.find((s) => s.first) || byId[HOOK] || null, hookKey = hook ? `${hook.id}@${hook.level}` : null;
  const tagsOf = new Map(data.scenarios.map((s) => [s.id, new Set(s.tags || [])])), none = new Set();
  // a pick's predictions of a line in a way at a rung, each worked out once (the rung's estimate, p̄ and p̄ at A5 ask
  // for the same ones): a slot for every phrase, way and rung, cleared each pick
  const index = new Map(data.phrases.map((p, i) => [p.id, i])), WAY = { speak: 0, self: 1, type: 2, tiles: 3 }, memo = new Float64Array(data.phrases.length * 24);
  const cached = (B) => {
    memo.fill(NaN);
    const f = (id, o) => { const i = index.get(id), w = WAY[o.mode]; if (i === undefined || w === undefined || o.typed !== 'pinyin') return B(id, o); const k = (i * 4 + w) * 6 + o.assist; let p = memo[k]; if (p !== p) p = memo[k] = B(id, o); return p; };
    f.way = B.way; f.spread = B.spread;
    return f;
  };
  // how the player will answer (mode()), asked once a pick for a format and a kind of card: feed.js answering() reads
  // Settings each time it's asked, a parse of localStorage on a phone
  let ways = new Map();
  const how = (s, kind) => { const k = s.format + ':' + kind; if (!ways.has(k)) ways.set(k, mode(s, kind)); return ways.get(k); };
  // what a pick reads of the stores, read once (each read is a parse too): spaced review, what's due (the longest
  // overdue first, as srs.due() orders it), the stories done and liked
  const read = (t) => { const all = srs.all(); return { all, due: Object.keys(all).filter((id) => all[id].due <= t).sort((a, b) => all[a].due - all[b].due), done: marks.doneAll(), liked: new Set(marks.list('liked')) }; };
  const episodes = new Map();
  for (const s of data.scenarios) if (s.series) (episodes.get(s.series.id) || episodes.set(s.series.id, new Map()).get(s.series.id)).set(s.series.ep, s);

  // The arms: what each format, card kind and topic has earned with this player, beside its prior (Beta(prior·4,
  // (1 − prior)·4)): a card finished +1 to α, left before 30% +1 to β, left at 30–90% +½, liked or replayed +1 to α;
  // every count ×0.98 a visit, so old evidence fades and the prior stays. visits: the visits this phone has begun (R7).
  // And the first session's marks (p3.md): hook, when a phone that had never played was dealt its first card; about,
  // when the about card came on screen (it's dealt a card ahead, so a visit can end before it's seen: then the next
  // visit opens on it); place, placement from the hook on ({ n: its lines answered, call, chat: a placement story of
  // that format played, bonus: when the bonus was dealt, end: when placement ended }).
  let arms = store.get('arms', null);
  if (arms?.v !== 1) arms = { v: 1, fmt: {}, topic: {} };
  const arm = (side, k) => (arms[side][k] ||= [0, 0]);
  // (the arms' version: a re-pick before any card row has changed them draws as the pick it replaces did; the first
  // session's marks are kept without a new one, as they change no arm)
  let version = 0, drawn = null;
  const keep = () => { version++; store.set('arms', arms); }, mark = () => store.set('arms', arms);
  // the goals, read each pick (the about card may have just set them): the prior of a format and a topic under them
  // and the day coming up, as near as it is (soon: { goal, w, left }, w rising from 1/31 thirty days out to 1 on the day),
  // and quiet mode (hushed: quiet(), a visit answered with no voice), and the challenge's story while it's owed today
  // (saving: its id, not placing, the challenge neither on screen today nor played), read each pick too
  let goals = [], soon = null, hushed = false, saving = null;
  const prior = (side, k) => (side === 'fmt' ? PRIOR[k] + goals.reduce((t, g) => t + (GOALS[g].fmt?.[k] || 0), 0) : (goals.some((g) => GOALS[g].topics?.includes(k)) ? GOAL : TOPIC) + (soon && GOALS[soon.goal].topics?.includes(k) ? LIFT * soon.w : 0));
  // and the weight on a skill's gap (V's): the most any goal gives it, never under 1, and more as the day nears
  const gw = (k) => Math.max(1, ...goals.map((g) => GOALS[g].gap?.[k] || 1)) * (soon ? 1 + ((GOALS[soon.goal].gap?.[k] || 1) - 1) * soon.w : 1);
  const gkey = () => goals.join() + (soon ? `:${soon.goal}${soon.w}` : '');
  const coming = (t) => {
    const v = store.get('soon', null), g = v?.day && SOON[v.what];
    if (!g) return null;
    const d = new Date(t - 4 * 3600e3), on = new Date(+v.day.slice(0, 4), +v.day.slice(5, 7) - 1, +v.day.slice(8, 10));
    d.setHours(0, 0, 0, 0);
    const left = Math.round((on - d) / DAY);
    return left >= 0 && left <= NEAR ? { goal: g, w: (NEAR + 1 - left) / (NEAR + 1), left } : null;
  };
  // (explain: the goals as this pick read them, every format's and topic's prior and every skill's weight, for the checks)
  const topics = [...new Set(data.scenarios.map((s) => s.topic || s.topics?.[0]).filter(Boolean))];
  const byGoals = () => ({ fmt: Object.fromEntries(KINDS.map((k) => [k, prior('fmt', k)])), topic: Object.fromEntries(topics.map((k) => [k, prior('topic', k)])), gap: Object.fromEntries(SKILLS.map((k) => [k, gw(k)])), soon: soon && { ...soon } });
  // DRAWS Thompson draws of the arms the candidates use (keys 'fmt:scene', 'topic:food'), each a map key → [draw 0 … 15]
  // A place picked again (the card before it done) with the arms and goals as they were draws as it did the first time:
  // a swap then means the visit changed, not the dice.
  const draws = (keys, again) => {
    const out = again && drawn?.version === version && drawn.goals === gkey() ? drawn.D : new Map();
    for (const key of [...keys].sort()) if (!out.has(key)) { const [side, k] = key.split(':'), m = prior(side, k), [a, b] = arms[side][k] || [0, 0]; const ds = new Array(DRAWS); for (let d = 0; d < DRAWS; d++) ds[d] = beta(m * WEIGHT + a, (1 - m) * WEIGHT + b, rng); out.set(key, ds); }
    drawn = { version, goals: gkey(), D: out };
    return out;
  };
  // placing: from the hook until PLACE lines have been answered (placement's end is kept)
  const placing = () => !!arms.place && !arms.place.end;
  // a phone that has never played: no line in the learner model, no srs entry, no story done (the hook's), as the pick read them
  const never = (at) => !learner.level().n && empty(at.all) && empty(at.done);
  // the about card's questions not answered yet, in its order
  // (a year taken back is gone from the store, panel.js; a stored null, as an older build left one, isn't an answer either)
  const unasked = (ask = ASK) => ask.filter((k) => (k === 'home' ? learner.persona() == null : store.get(k, null) == null));

  const slots = []; // every card dealt: { item, why, kind, fmt, key, tags, rows (the ids its lines go by), at, sess, on, left, lines, place (dealt while placing), never (a never-played phone's first) }
  let S = null; // this visit: { start, last, ms, returning, from (its first slot), lines, nailed, written, unseen }
  function begin(t, at = null) {
    // the card on screen (and any dealt after it) when a visit begins under it (back after half an hour with it still
    // up): the new visit starts there, its story played and its format the last
    let from = slots.length;
    while (from > 0 && !slots[from - 1].left) from--;
    S = { start: t, last: t, ms: 0, returning: learner.level().n > 0 || (at ? !empty(at.all) : srs.count() > 0), from, lines: [], nailed: [], written: [], unseen: new Map() };
    arms.visits = (arms.visits || 0) + 1;
    for (const side of ['fmt', 'topic']) for (const k in arms[side]) arms[side][k] = arms[side][k].map((x) => x * 0.98);
    keep();
  }
  // time spent: up to now, a pause of over 5 minutes counting as 5 (events.js's)
  const touch = (t) => { if (t > S.last) { S.ms += Math.min(t - S.last, BUSY); S.last = t; } };
  const seq = () => slots.slice(S.from);
  // the cards that play something (a recap, an end card and the about card are none: no format, none of the 40%, not
  // one of the first 3); of them the extras (R4, R5) and the reviews (R3). The bonus line plays (its format is review's,
  // R2) but is neither (p3.md), and nor is it a card the visit's τ, misses or end on a high count: missed, it isn't a loss
  const content = (x) => x.kind !== 'recap' && x.kind !== 'end' && x.kind !== 'about';
  const extra = (x) => content(x) && !story(x) && x.kind !== 'bonus';
  const reviews = (x) => x.kind === 'review' || x.kind === 'run' || (x.kind === 'write' && !!x.item.item.again);
  const counts = (x) => content(x) && x.kind !== 'bonus';
  // a slot's outcome: a story's from its end screen (marks.done after it was dealt) or the card it left; a run's the same
  // (its chase is 'review-run'); a word written as it ends (into spaced review: its card row comes only as it's left); the
  // rest by their lines
  function outcome(x, { done, all }) {
    const id = story(x) ? x.item.scn.id : x.kind === 'run' ? 'review-run' : null, d = id && done[id];
    if (d && d.at >= x.at) return d.outcome === 'lose' ? 'lose' : 'win';
    if (x.left) return x.left.out || (x.left.state === 'done' ? 'win' : x.left.state === 'idle' || !x.left.asked ? 'skip' : 'left');
    if (x.kind === 'write' && all['write:' + x.item.item.word]?.last >= x.at) return 'win';
    return x.lines.length ? (x.lines.every((l) => l.y >= 0.55) ? 'win' : 'miss') : null;
  }
  const ybar = (x) => mean(x.lines.filter((l) => l.att === 1).map((l) => l.y));

  // How the visit is going. Fatigue: 0.4 for 20 minutes in, 0.3 for thinking slower than the visit's own pace (the
  // last 5 lines' against all of them, each line's time over its clock), 0.3 for cards skipped and lines timed out in
  // the last 5 cards.
  function fatigue(cards, at) {
    const ls = S.lines.filter((l) => l.r > 0), slow = ls.length >= 6 ? clamp(median(ls.slice(-5).map((l) => l.r)) / median(ls.map((l) => l.r)) - 1, 0, 1) : 0;
    const last = cards.filter(counts).slice(-5), out = last.reduce((t, x) => t + (outcome(x, at) === 'skip') + x.lines.filter((l) => l.att === 1 && l.out).length, 0);
    return 0.4 * Math.min(1, S.ms / 60e3 / 20) + 0.3 * slow + 0.3 * Math.min(1, out / 5);
  }
  // τ for the next card: a visit's first card (R1) and a returning one's first two 0.90; one card after a loss, or 2+
  // misses in the last 5 lines, 0.92; tired 0.88; placing 0.70 (p3.md: a story's rung aimed there, the most informative
  // point while mostly winning); after 3 strong cards (ȳ ≥ 0.85) 0.70, "Harder one?"; else 0.80. (The bonus line isn't
  // counted: missed, it's no loss.)
  function target(cards, fat, at) {
    const done = cards.filter(counts), last = done[done.length - 1], firsts = S.lines.filter((l) => l.att === 1).slice(-5);
    if (last && (outcome(last, at) === 'lose' || firsts.filter((l) => l.y < 0.3).length >= 2)) return TAU.loss;
    if (!done.length || (S.returning && done.length < 2)) return TAU.start;
    if (fat > 0.5) return TAU.tired;
    if (placing()) return TAU.place;
    const three = done.slice(-3);
    if (three.length === 3 && three.every((x) => ybar(x) >= 0.85)) return TAU.harder;
    return TAU.base;
  }

  // Everything that could come next, each with its p̄ (the mean predicted success of its lines at the rung it'd be
  // played at) and the parts of its score (E drawn later, from the arms)
  // (skip: the format whose stories can't be dealt anyway (R2: the last card's), and forced: none can (a review R3 will
  // have): their scores aren't worked out, unless the referee is to see them all. reach: the p̄ at A5 below which a
  // story's rung isn't worked out either: the floor (R6), or a visit's first card's 0.85 (R1: a story's p̄ at its rung is
  // never more than at A5, the assist's effects being kept in order), till no story makes it; and none at all when no
  // card is allowed, for what gives way. only: one story's key, whatever its reach: the hook's. stories: the stories alone,
  // a visit's first card's (R1: no review, no word to write, but where the referee is to see them all)
  function candidates(t, cards, tau, pred, at, { last: lastFmt = null, skip = lastFmt, forced = false, reach = FLOOR, only = null, stories = false, any = false } = {}) {
    const { all, done, liked } = at, informs = placing(), last = assist.last() ?? 2, sk = learner.skills(), persona = learner.persona(), knows = persona != null || learner.level().n > 0;
    // (first: a phone that has never played, whose first lines ever are a story's first: srs as this pick read it, unparsed again)
    const th = SKILLS.map((k) => sk[k].m), tbar = mean(th), home = persona === 'mandarin' || persona === 'dialect', first = !learner.level().n && empty(all);
    // the gaps worth closing: skills below the player's own average, by as much as the model is sure of it (tones,
    // unheard without a microphone, aren't chased), weighed by the goals (GOALS: family's L, S, V ×1.3, reading's R, W
    // ×1.5), never past 1
    const gap = SKILLS.map((k, i) => Math.min(1, gw(k) * σ(1.5 * (tbar - th[i])) * Math.max(0, 1 - sk[k].s / (home && (k === 'S' || k === 'V') ? 1.2 : 1))));
    const gapOf = (ld) => ld.reduce((t, w, i) => t + w * gap[i], 0);
    const played = new Set(cards.filter(story).map((x) => x.item.scn.id));
    // a series' episodes in order, each once it's out (released(): days.js's, a day after the one before was finished)
    const open = (s) => !s.series || s.series.ep === 1 || (!!done[episodes.get(s.series.id)?.get(s.series.ep - 1)?.id] && released(s));
    const under = (s) => !!s.series && !done[s.id] && [...(episodes.get(s.series.id)?.values() || [])].some((e) => e !== s && done[e.id]);
    // a story with endings no run of it has reached (endings(): days.js's, from the log), of more than one: a rematch
    // worth playing (P5a), one a visit
    const ended = cards.some((x) => x.why?.cls === 'ending'), unfound = (s) => { const e = !ended && endings?.(s); return !!e && e.of > 1 && e.found < e.of; };
    // A review's worth: half for being due, up to all of it as it grows overdue (V)
    const worth = (e) => 0.5 + 0.5 * Math.min(1, (t - e.due) / BOXES[e.box]);
    // below an end card the learner asks for the reviews: they come whatever their chance, as v1 dealt them
    const floor = cards.some((x) => x.kind === 'end') ? -Infinity : FLOOR;
    const out = [];
    // reviews: due, and not dealt this visit at the time they're due now (a run that never reached one gives it back);
    // three or more phrases at once as one run (the five longest overdue; flash crises instead while a chase has just
    // played, R2, so the reviews never wait on a format), else each as a flash crisis (the ten longest overdue: the
    // rest wait their turn); a word due as a word to write again. Each is predicted as a line at its rung (v1's A2, or
    // the ladder's: the review lever, REVIEW.rung): algorithm.md's R·p, R = 2^(−t/(4·interval)), read a phrase met yesterday in a 20-minute box as gone
    // (2^−18), and any R said a half-forgotten phrase is half as sayable as a new one, though the cue and the skill are
    // still there; the line's own chance already carries how it went before (its difficulty moves with each answer).
    const seen = dealt(cards), dueIds = at.due.filter((id) => (phraseById[id] || writing[id]) && seen.get(id) !== all[id].due);
    const rev = (id, kind = 'review', A = rungOf([id], kind, tau, pred)) => ({ A, p: pred(id, { mode: wayOf(id, kind), assist: A, typed: 'pinyin' }) });
    const atA = (it, A) => (review.rung ? { ...it, A, tau } : it); // an item to be played at a rung says so (mix.js reads item.A)
    // the longest overdue first (srs.due's order), as far as the ten a pick could use
    const ps = [], rv = !stories || explain;
    for (const id of rv ? dueIds : []) { if (!phraseById[id]) continue; const r = rev(id); if (r.p >= floor) ps.push({ id, ...r }); if (ps.length >= 10) break; }
    if (ps.length >= 3 && runs && lastFmt !== 'chase') {
      const ids = ps.slice(0, review.run).map((x) => x.id), ph = ids.map((id) => phraseById[id]), A = rungOf(ids, 'run', tau, pred), p = mean(ids.map((id) => rev(id, 'run', A).p));
      out.push({ kind: 'run', item: atA({ kind: 'run', ps: ph, audio: ph[0].audio }, A), key: 'run:' + ids.join(','), fmt: 'chase', topic: null, tags: new Set(ph.flatMap((q) => [...(tagsOf.get(q.scn) || none)])), p, A, lv: Math.max(0, ...ph.map((q) => q.level ?? 1)), V: mean(ids.map((id) => worth(all[id]))), prior: 0.5, secs: 10 + 12 * ids.length, rows: ids });
    } else for (const { id, p, A } of ps.slice(0, 10)) { const q = phraseById[id]; out.push({ kind: 'review', item: atA({ kind: 'review', p: q }, A), key: 'review:' + id, fmt: 'review', topic: null, tags: tagsOf.get(q.scn) || none, p, A, lv: q.level, V: worth(all[id]), prior: 0.5, secs: 25, rows: [id] }); }
    const noStories = typeof forced === 'function' ? forced(out) : !!forced;
    for (const pl of plays) {
      const s = pl.s, d = done[s.id];
      if (played.has(s.id) || !open(s) || (only && pl.key !== only) || (!only && s.id === saving)) continue; // once a visit; a series' episodes in order; the challenge's saved for it
      if (!explain && !only && (noStories || pl.fmt === skip)) continue;
      // Never played; a played story at a level whose lines are mostly new to you (the same moment, other lines); a
      // rematch: lost, or liked and last played 3+ days ago (p2.md), or with most of its lines due (spaced review, in
      // the story itself and at your rung: a flash crisis has none), and only once nothing new is allowed (choose());
      // else one with endings unfound (ending: as a rematch, never ahead of the stories new to you). Not one played this
      // visit. (any: whatever it is, the challenge's story: cls null where it's none of them)
      // (a story never played is new whatever its lines: their count waits till it's in reach, as most aren't)
      if (d && d.at >= S.start) continue;
      let met = 0, due = 0, fresh = 1, cls = d ? null : 'new';
      const count = () => { for (const id of pl.rows) { const e = all[id]; if (e) { met++; if (e.due <= t) due++; } } fresh = 1 - met / pl.rows.length; due /= pl.rows.length; };
      if (d) { count(); cls = fresh >= 0.5 ? 'level' : d.outcome === 'lose' || (liked.has(s.id) && t - d.at >= 3 * DAY) || due >= 0.5 ? 'rematch' : unfound(s) ? 'ending' : null; if (!cls && !any) continue; }
      const { ways, ld } = waysOf(pl), m = (id) => ways.get(id);
      let p5 = 0;
      for (const id of pl.ids) p5 += pred(id, { mode: m(id), assist: 5, typed: 'pinyin' }) / pl.ids.length;
      if (p5 < reach && !explain && !only) continue; // R6 (or R1): out of reach with every help the ladder has
      if (!d) count();
      // at L0 a line's first meetings have more help than the card's rung, and on a phone that has never played its
      // first lines (the card's first three, in the order it plays them) have FIRST_LINE's and a step down each
      // (assist.lineRung): as they will be played
      const A = assist.startAt(pl.ids, { last, tau, mode: m, predict: pred, knows }), rung = (A, id) => assist.lineRung(A, { level: pl.t.level, seen: all[pl.met.get(id)]?.seen || 0, attempt: 1, first: first && pl.ids.indexOf(id) + 1 });
      // and what its lines would tell the model (placement's V, p3.md, worked out while placing): Σ p(1 − p)·a·C·a, a its way's loadings
      let p = 0, info = 0;
      for (const id of pl.ids) { const w = m(id), q = pred(id, { mode: w, assist: rung(A, id), typed: 'pinyin' }); p += q / pl.ids.length; if (informs) info += q * (1 - q) * pred.spread(w === 'type' ? 'pinyin' : w, pl.fmt === 'call'); }
      out.push({ kind: 'scn', item: { kind: 'scn', scn: pl.t, lv: pl.L, A, tau }, key: pl.key, fmt: pl.fmt, topic: pl.topic, tags: pl.tags, p, p5, A, lv: pl.L, cls, pl, info,
        // a rematch is worth what its lines are: a review's worth each one due, a quarter each one not (a pass before it's due
        // proves little: srs moves nothing for it); an ending to find a small V, a review's just due
        V: cls === 'rematch' ? mean(pl.rows.map((id) => (all[id]?.due <= t ? worth(all[id]) : 0.25))) : cls === 'ending' ? 0.5 : 0.6 * fresh + 0.4 * gapOf(ld), prior: (pl.hook ? clamp((pl.hook - 1) / 4, 0, 1) : 0.6) * (cls === 'new' ? 1 : 0.6), series: under(s), secs: pl.secs + 8 * pl.ids.length, rows: pl.rows,
        ...(any ? { pAt: (B) => mean(pl.ids.map((id) => pred(id, { mode: m(id), assist: rung(B, id), typed: 'pinyin' }))) } : {}) }); // (the challenge's p̄ at another rung)
    }
    // a word written at the rung it's played at (the last card's: its leniency, a second trace at A5: mix.js)
    const W = pred.way('write', learner.typical(2), { assist: last }), Wg = gap[5];
    for (const id of rv ? dueIds.filter((x) => writing[x]) : []) { const p = W; if (p >= floor) out.push({ kind: 'write', item: { kind: 'write', item: { ...writing[id], again: true } }, key: id, fmt: 'write', topic: null, tags: none, p, A: last, lv: 2, V: worth(all[id]), prior: 0.5, secs: 40, rows: [] }); }
    // the stories just played this visit (the last two), each as it was played (its level's lines: content request 5):
    // a word of one to write (one not written yet, nor in review, with characters not written yet where it can: v1's),
    // a line of one to shadow (its middle one; mix.js swaps in the first where the story wasn't seen through), none in
    // quiet mode (a visit answered with no voice: quiet())
    const just = cards.filter((x) => x.kind === 'scn').slice(-2).reverse(), written = cards.filter((x) => x.kind === 'write').map((x) => x.item.item.word), old = written.join('');
    for (const x of just) {
      const s = byId[x.item.scn.id], ws = (words.get(x.key) || []).filter((w) => !written.includes(w.word) && !all['write:' + w.word]), w = ws.find((w) => ![...w.word].some((c) => old.includes(c))) || ws[0];
      if (w && !out.some((c) => c.kind === 'write' && c.item.item.word === w.word)) out.push({ kind: 'write', item: { kind: 'write', item: w }, key: 'write:' + w.word, fmt: 'write', topic: s.topic || s.topics?.[0] || null, tags: tagsOf.get(s.id), p: W, A: last, lv: 2, V: Wg, prior: 0.5, secs: 20 + 15 * [...w.word].length, rows: [] });
      const ls = echoes.get(x.key) || [], shadowed = cards.some((y) => y.kind === 'shadow' && y.item.item.scn.id === s.id);
      if (ls.length && !shadowed && !hushed) out.push({ kind: 'shadow', item: { kind: 'shadow', item: { scn: x.item.scn, step: ls[Math.floor(ls.length / 2)] } }, key: 'shadow:' + s.id, fmt: 'shadow', topic: s.topic || s.topics?.[0] || null, tags: tagsOf.get(s.id), p: pred.way('shadow', learner.typical(x.item.scn.level)), A: 2, lv: x.item.scn.level, V: mean([gap[0], gap[1], gap[3]]), prior: 0.5, secs: 25, rows: ['shadow:' + s.id] });
    }
    return out;
  }
  // A review's way (typed where the phone can't listen, as cards.js and chase.js answer one) and its rung: v1's A2, or
  // (review.rung) the one the ladder would give its lines now (assist.startAt; the app plays it there through
  // assist.forLines(), moving nothing: no step of the budget spent, last() unchanged)
  const wayOf = (id, kind) => { const w = how(byId[phraseById[id].scn], kind); return (typeof w === 'function' ? 'self' : w) || 'self'; };
  const rungOf = (ids, kind, tau, pred) => (review.rung ? assist.startAt(ids, { last: assist.last() ?? 2, tau, mode: (id) => wayOf(id, kind), predict: pred, knows: learner.persona() != null || learner.level().n > 0 }) : 2);
  // today's challenge as a candidate: its story at the level it has nearest the say level (the lower of two as near), at
  // the rung startAt() gives it now for τ (feed.js plays it there, the modifier over the rung: mix.js), as a story is scored;
  // null where it's out, played, seen today, or its story already played this visit (a story once a visit) or not open
  function daily(t, cards, tau, pred, at, lastFmt) {
    const ch = challenge(), s = ch?.id && byId[ch.id];
    if (!s || ch.played || arms.challenge === ch.day) return null;
    // (at the say level nearest the player's, but not L0, where the level fixes the help, no clock and pinyin over every
    // word, so neither modifier would show: an L1 at a high rung is a beginner's challenge)
    const say = learner.level().say, mine = plays.filter((x) => x.s === s), pl = (mine.some((x) => x.L >= 1) ? mine.filter((x) => x.L >= 1) : mine).sort((a, b) => Math.abs(a.L - say) - Math.abs(b.L - say) || a.L - b.L)[0];
    const c = candidates(t, cards, tau, pred, at, { last: lastFmt, only: pl.key, stories: true, any: true }).find((x) => x.key === pl.key);
    // (no class: it's dealt as the day's, whatever it'd be, and so is no visit's rematch or ending)
    // (and only where it's in reach as played: its modifier takes about a rung's help away, so R6's floor at the rung under
    // the one it's dealt at)
    if (c && c.pAt(Math.max(0, c.A - 1)) < FLOOR) return null;
    return c ? Object.assign(c, { kind: 'challenge', item: { kind: 'challenge', scn: pl.t, lv: pl.L, A: c.A, tau, mod: ch.mod, n: ch.n, day: ch.day }, key: 'challenge:' + pl.key, cls: null, tau }) : null; // (tau: the τ it was aimed at, why's)
  }
  // the warmup's flash crisis: a phrase met this visit and not due yet, as a review of it is dealt (at its rung)
  function warm(id, tau, pred) {
    const q = phraseById[id], A = rungOf([id], 'review', tau, pred);
    return { kind: 'review', item: review.rung ? { kind: 'review', p: q, A, tau } : { kind: 'review', p: q }, key: 'review:' + id, fmt: 'review', topic: null, tags: tagsOf.get(q.scn) || none, p: pred(id, { mode: wayOf(id, 'review'), assist: A, typed: 'pinyin' }), A, lv: q.level, V: 0.5, prior: 0.5, secs: 25, rows: [id] };
  }
  // PL3's line: a phrase never met, of a story not played yet (on this phone, nor this visit), at the say level and one,
  // clamped to 3–5 (the build's nearest level that has one, the higher of two as near), the one whose chance at A2, the
  // way a review is answered, is nearest even (of equals, the first in the content) → { q, p, lv } | null
  function bonus(cards, at, pred) {
    const played = new Set(cards.filter(story).map((x) => x.item.scn.id)), want = clamp(Math.ceil(learner.level().say) + 1, ...BONUS);
    const lv = (q) => levels.of(q.level ?? byId[q.scn].level), ps = data.phrases.filter((q) => byId[q.scn] && !at.done[q.scn] && !played.has(q.scn) && !at.all[q.id]);
    if (!ps.length) return null;
    const near = Math.min(...ps.map((q) => Math.abs(lv(q) - want))), L = Math.max(...ps.filter((q) => Math.abs(lv(q) - want) === near).map(lv));
    let best = null;
    for (const q of ps) if (lv(q) === L) { const p = pred(q.id, { mode: wayOf(q.id, 'review'), assist: 2, typed: 'pinyin' }); if (!best || Math.abs(p - 0.5) < Math.abs(best.p - 0.5)) best = { q, p, lv: L }; }
    return best;
  }
  // How the player will answer a story's lines (mode(): one way, or one a beat) and the skills that asks for on average
  // (V's gaps), kept on the story till the ways change
  const LOADS = {}, loadsOf = (way, call) => (LOADS[way + +call] ??= loads(learner.WAYS, way, call)); // (each way's, worked out once)
  function waysOf(pl) {
    const way = how(pl.t, 'scn'), ws = pl.bs.map((b) => (typeof way === 'function' ? way(b) : way) || 'self');
    if (!pl.memo || ws.some((w, i) => w !== pl.memo.ws[i])) {
      const ld = SKILLS.map(() => 0);
      ws.forEach((w) => loadsOf(w === 'type' ? 'pinyin' : w, pl.fmt === 'call').forEach((x, i) => (ld[i] += x / ws.length)));
      pl.memo = { ws, ways: new Map(pl.pids.map((id, i) => [id, ws[i]])), ld };
    }
    return pl.memo;
  }
  // review id → its due time when this visit dealt it (a run never reached gives its phrases back: unsee)
  function dealt(cards) {
    const m = new Map();
    for (const x of cards) for (const id of x.kind === 'review' ? [x.item.p.id] : x.kind === 'run' ? x.item.ps.map((p) => p.id) : x.kind === 'write' && x.item.item.again ? ['write:' + x.item.item.word] : []) if (x.dues?.has(id)) m.set(id, x.dues.get(id));
    for (const [id, due] of S.unseen) if (m.get(id) === due) m.delete(id);
    return m;
  }

  // R7: how fast a caller you can surely follow, as a level: θL less g's sd (g's, not L's own: any line tells the model
  // about g, while L is heard mostly on calls, which this would hold back)
  const followed = () => { const sk = learner.skills(); return lvl(sk.L.m - sk.g.s); };

  // The pick for the next place in the visit: the rules, then the score
  function choose(t, again, at) {
    ways = new Map(); goals = [].concat(store.get('goals', null) || []).filter((g) => GOALS[g]); soon = coming(t); hushed = !!quiet();
    const ch = challenge?.(); saving = ch?.id && !ch.played && arms.challenge !== ch.day && !placing() ? ch.id : null;
    const cards = seq(), done = cards.filter(content), below = cards.some((x) => x.kind === 'end'), virgin = !cards.length && never(at);
    const fat = fatigue(cards, at), tau = target(cards, fat, at), pred = cached(learner.batch());
    const lastCard = cards[cards.length - 1], lastFmt = lastCard && content(lastCard) ? lastCard.fmt : null, n = done.length, ex = done.filter(extra).length;
    // cards since the last review, and whether one must come now (R3, one R2 allows): then no story need be scored
    const lastRev = done.filter(reviews).pop(), streak = n - (lastRev ? done.indexOf(lastRev) + 1 : 0);
    const owed = (c) => reviews(c) && c.fmt !== lastFmt;
    const forced = (rv) => !below && n > 0 && streak >= EVERY - 1 && rv.some(owed);
    let cs = candidates(t, cards, tau, pred, at, { last: lastFmt, forced, reach: !n && !below ? FIRST : FLOOR, stories: !n && !below });
    const due = cs.some(owed), hear = followed(), early = (arms.visits || 0) <= hold;
    // each rule a card breaks, or null
    const rule = (c) => {
      if (below) return reviews(c) ? null : 'below';
      if (story(c) && c.fmt === 'call' && early && c.pl.listen > hear + 1 + 1e-9) return 'R7';
      if ((c.p5 ?? c.p) < FLOOR) return 'R6';
      if (!n && (c.kind !== 'scn' || c.p < FIRST)) return 'R1';
      if (c.fmt === lastFmt) return 'R2';
      if (reviews(c) && lastCard && content(lastCard) && reviews(lastCard)) return 'R3';
      if (due && streak >= EVERY - 1 && !reviews(c)) return 'R3';
      if (extra(c) && n < EARLY) return 'R5';
      if (extra(c) && (ex + 1 > CAP * (n + 1) + 1e-9 || (!reviews(c) && ex + 2 > CAP * (n + 1 + Math.max(1, EVERY - (streak + 1))) + 1e-9))) return 'R4';
      return null;
    };
    const recent = done.slice(-3), last3 = recent.map((x) => x.fmt), tagsRecent = new Set(recent.flatMap((x) => [...(x.tags || [])]));
    const tried = new Set(done.map((x) => x.fmt));
    // PL1, PL2 (placing, after a visit's first card: R1 stands): one of the placement stories a call (where R7 allows
    // one: a heritage answer, or lines that say so), one a chat (reading); a story of that format the visit dealt while
    // placing (not swiped past) or one played in placement before (arms.place) says so
    const owes = placing() && n ? ['call', 'chat'].filter((f) => !arms.place[f] && !cards.some((x) => x.place && x.fmt === f && outcome(x, at) !== 'skip')) : [];
    // the rules for each, its fit and its variety; and the stories new to you before rematches: a rematch waits while
    // one of them is allowed; and while placing owes a format and a story of it is allowed, the other stories wait
    const judge = (list) => {
      for (const c of list) {
        c.F = Math.exp(-0.5 * ((c.p - tau) / 0.1) ** 2); c.rule = rule(c);
        let ov = 0;
        for (const g of c.tags) ov += tagsRecent.has(g) / c.tags.size;
        c.N = clamp(1 - 0.5 * (c.fmt === lastFmt) - 0.25 * last3.includes(c.fmt) - 0.25 * ov + (!S.returning && !tried.has(c.fmt) ? 0.2 : 0), 0, 1);
      }
      // (review.rematch: the visit's first rematch comes ahead of them, its lines reviewed in the story at your rung)
      const ahead = review.rematch && !cards.some((x) => x.why?.cls === 'rematch');
      // (an ending to find is never ahead of them)
      if (list.some((c) => !c.rule && (c.cls === 'new' || c.cls === 'level'))) for (const c of list) if (!c.rule && (c.cls === 'ending' || (!ahead && c.cls === 'rematch'))) c.rule = 'later';
      for (const f of owes) if (list.some((c) => c.kind === 'scn' && !c.rule && c.fmt === f)) { for (const c of list) if (c.kind === 'scn' && !c.rule && c.fmt !== f) c.rule = f === 'call' ? 'PL1' : 'PL2'; break; }
      // Placing, a story is worth what its lines would tell the model of the skills it's least sure of (p3.md): their
      // information, rescaled 0–1 over the stories the rules allow (all of them, where none is), the most informative 1
      if (placing()) { const ss = list.filter((c) => c.kind === 'scn'), pool = ss.some((c) => !c.rule) ? ss.filter((c) => !c.rule) : ss, top = Math.max(0, ...pool.map((c) => c.info)); for (const c of ss) c.V = top > 0 ? Math.min(1, c.info / top) : 0; }
      return list;
    };
    judge(cs);
    // a first card no story makes p̄ 0.85 for: every story in reach scored after all, for the surest of them (first*)
    if (!n && !below && !explain && !cs.some((c) => !c.rule)) judge((cs = candidates(t, cards, tau, pred, at, { last: lastFmt, forced, stories: true })));
    // (the arms drawn for the cards the rules allow only, explaining or not, so the referee sees the very picks the app makes)
    const legal = cs.filter((c) => !c.rule), D = draws(new Set(legal.flatMap((c) => ['fmt:' + armOf(c), ...(c.topic ? ['topic:' + c.topic] : [])])), again);
    // a card's own draws, and the rest of its score, once (a card the rules shut out has its drawn only if it's dealt:
    // the surest first card when none is sure enough, a story where a rule gives way)
    const ready = (c) => {
      if (c.fd) return c;
      draws(['fmt:' + armOf(c), ...(c.topic ? ['topic:' + c.topic] : [])], true); // into D, the arms unchanged
      c.fd = D.get('fmt:' + armOf(c)); c.td = c.topic ? D.get('topic:' + c.topic) : null; c.rest = 0.3 * c.F + 0.25 * c.V + 0.1 * c.N + (c.series ? 0.15 : 0);
      return c;
    };
    legal.forEach(ready);
    // E for draw d: half the format's (or the card kind's) arm, 0.3 its topic's, 0.2 the story's own prior; a story with
    // no topic puts the topic's share on its format
    const E = (c, d) => (ready(c).td ? 0.5 * c.fd[d] + 0.3 * c.td[d] + 0.2 * c.prior : 0.8 * c.fd[d] + 0.2 * c.prior);
    const score = (c, d) => 0.35 * E(c, d) + c.rest;
    // the winner under draw 0 (by a key: E for the first card, the score otherwise; of equals, by tie), and how often it
    // wins over all 16
    const best = (pool, key, tie = () => 0) => {
      if (!pool.length) return null;
      const win = (d) => pool.reduce((b, c) => { const x = key(c, d), y = key(b, d); return x > y || (x === y && tie(c) > tie(b)) ? c : b; });
      const w = win(0);
      let prop = 0;
      for (let d = 0; d < DRAWS; d++) prop += win(d) === w;
      prop /= DRAWS;
      return { c: w, prop };
    };
    const why = (c, ruleName, prop, pool) => ({ score: c ? score(c, 0) : null, E: c ? E(c, 0) : null, F: c?.F ?? null, V: c?.V ?? null, N: c?.N ?? null, tau: c?.tau ?? tau, p: c?.p ?? null, A: c?.A ?? null, lv: c?.lv ?? null, rule: ruleName, cls: c?.cls ?? null, prop, n: pool,
      fat, place: placing(), ...(explain ? { goals: byGoals(), cands: cs.map((x) => ({ kind: x.kind, key: x.key, fmt: x.fmt, cls: x.cls, p: x.p, p5: x.p5, A: x.A, lv: x.lv, F: x.F, V: x.V, rule: x.rule, sure: x.p >= SURE && x.secs <= SHORT, score: x.fd ? score(x, 0) : null, E: x.fd ? E(x, 0) : null, prior: x.prior, fd: x.fd?.[0] ?? null, td: x.td?.[0] ?? null })) } : {}) });
    // (place: dealt while placing; never: a never-played phone's first card, where placement starts)
    const of = (c, ruleName, prop, pool) => ({ item: c.item, why: why(c, ruleName, prop, pool), kind: c.kind, fmt: c.fmt, key: c.key, tags: c.tags, rows: c.rows, dues: dueMap(c, at.all), place: placing(), never: virgin });
    // Nothing the rules allow, but stories the visit hasn't dealt: R2 gives way first (the best story in reach of the
    // last card's format: one format left), then R6 (none in reach even at A5: the surest story, of another format where
    // one is left), each said so; R7 and a series' order never do. No story at all: the end card.
    const giving = () => {
      if (!explain) judge((cs = candidates(t, cards, tau, pred, at, { last: lastFmt, skip: null, reach: -Infinity })));
      // (never for a story only for its endings: one to find is no reason to bend a rule, P5a)
      const r = best(cs.filter((c) => c.kind === 'scn' && c.rule === 'R2' && c.cls !== 'ending'), score);
      if (r) return of(r.c, 'format*', r.prop, 0);
      const far = cs.filter((c) => c.kind === 'scn' && c.rule === 'R6' && c.cls !== 'ending').sort((a, b) => (a.fmt === lastFmt) - (b.fmt === lastFmt) || b.p - a.p || b.p5 - a.p5 || (a.key < b.key ? -1 : 1))[0];
      return far ? of(far, 'surest*', 1, 0) : end(fat, tau, cs);
    };
    // below an end card: the reviews due, the most overdue first, as many as asked for
    if (below) { const r = best(legal, (c) => c.V); return r ? of(r.c, 'below end', r.prop, legal.length) : null; }
    // The first session (p3.md). A phone that has never played opens on the hook story, R1's first card: at its base
    // level and the rung startAt() gives (A2 on a blank model; its first lines at FIRST_LINE, a step down each), unless R6 or R7 hold it
    // (then R1's pick); placement starts with it.
    if (virgin && hookKey) {
      const h = candidates(t, cards, tau, pred, at, { only: hookKey }).find((c) => c.key === hookKey);
      if (h && (!judge([h])[0].rule || h.rule === 'R1')) return of(h, 'hook', 1, 1);
    }
    // The about card: card 2 of the visit the hook was dealt in, or the first card of a later visit if that one ended
    // before it came on screen, while a question is unanswered (about.js asks those, in order); never twice
    if (!arms.about && ((cards.length === 1 && cards[0].never) || (!cards.length && arms.hook != null))) { const ask = unasked(); if (ask.length) return bare({ kind: 'about', ask }, 'about', fat, tau); }
    if (!n) {
      const r = best(legal, E, (c) => c.F);
      if (r) return of(r.c, 'first', r.prop, legal.length);
      // no story reaches p̄ 0.85 at its rung: the surest one in reach, said so
      const sure = cs.filter((c) => c.kind === 'scn' && c.rule === 'R1').sort((a, b) => b.p - a.p || (a.key < b.key ? -1 : 1))[0];
      return sure ? of(sure, 'first*', 1, 0) : giving();
    }
    // End on a high: tired (fatigue over 0.7), or 12 minutes in on a win, no recap in the last 8 cards, 3 cards in: a sure
    // win where the rules allow one (p̄ ≥ 0.9, a minute at most), and the recap straight after a win (the bonus line
    // aside: missed, it's no loss). After a card that didn't go well and with no sure win to deal, the visit goes on (τ
    // 0.92 aims the next card at a win) and the recap waits for one.
    const real = cards.filter(counts), prev = real[real.length - 1], firsts = prev?.lines.filter((l) => l.att === 1) || [];
    const wonLast = outcome(prev, at) === 'win', kinds = cards.map((x) => x.kind), sinceRecap = cards.length - 1 - kinds.lastIndexOf('recap');
    // (a sure win won has its recap however the visit stands now: a quick card can take fatigue back under 0.7)
    if (lastCard?.why?.rule === 'sure win' && prev === lastCard && wonLast) return recap(t, fat, tau, at);
    if ((fat > 0.7 || (S.ms >= LONG * 60e3 && wonLast)) && (kinds.lastIndexOf('recap') < 0 || sinceRecap >= APART) && n >= EARLY) {
      if (lastCard?.why?.rule !== 'sure win') { const r = best(legal.filter((c) => c.p >= SURE && c.secs <= SHORT), score); if (r) return of(r.c, 'sure win', r.prop, legal.length); }
      if (wonLast) return recap(t, fat, tau, at);
    }
    // 今日挑战 (P5a): today's challenge (challenge(): days.js's), once a day, as a story card: not a visit's first card,
    // never while placing (from the hook) or straight after a loss, held to the rules as a story is (R2 by its format,
    // R3, R6, R7; for R4 and R5 a story), and never again once it's been on screen today (ks.arms.challenge) or played
    // (the menu opens it too: #challenge)
    const lost = !!prev && outcome(prev, at) === 'lose';
    // (aimed as a card after a loss is, τ 0.92: the modifier, a panic clock or no pinyin and English, takes about a rung's
    // help away, and the story is the day's, not one chosen for its fit, so the rung makes up for both)
    if (challenge && !placing() && !lost) { const c = daily(t, cards, CHALLENGE_TAU, pred, at, lastFmt); if (c && !judge([c])[0].rule) return of(ready(c), 'challenge', 1, 1); }
    // The about card, later (P5a): a phone that played before P3 (no hook ever dealt, so P3's card 2 never came) and has
    // never seen it is asked once, P3's questions and "Anything coming up?", those unanswered: never a visit's first card
    // or straight after a loss, once a visit at most, and marked seen as it comes on screen, as P3's is
    if (!arms.about && arms.hook == null && !lost && !cards.some((x) => x.kind === 'about')) { const ask = unasked(LATER); if (ask.length) return bare({ kind: 'about', ask }, 'about', fat, tau, { later: true }); }
    // PL3, the bonus (placing, once): after a card whose first attempts were all right (never after a miss or a loss),
    // not in the visit's first 3 cards, where its format (a review's) may come and no review is owed (R2, R3), and not
    // where the visit ends on a high (a sure win won, then the recap): a line a level up, its chance nearest even (the
    // ceiling, checked where a line says most)
    if (placing() && !arms.place.bonus && !cards.some((x) => x.kind === 'bonus') && cards.length >= EARLY && lastFmt !== 'review' && !(due && streak >= EVERY - 1)
      && prev === lastCard && lastCard.why?.rule !== 'sure win' && firsts.length && firsts.every((l) => l.y >= 0.9) && wonLast) {
      const b = bonus(cards, at, pred);
      if (b) return bare({ kind: 'bonus', p: b.q }, 'bonus', fat, tau, { p: b.p, A: 2, lv: b.lv }, { fmt: 'review', key: 'bonus:' + b.q.id, tags: tagsOf.get(b.q.scn) || none, rows: [b.q.id] });
    }
    // v1's warmup: five cards into a visit with no review, the longest phrase met in it (not due yet) comes back early as
    // a flash crisis, once a visit, where the rules allow a review and none is owed (an early pass moves nothing in
    // spaced review; a miss still counts)
    if (n >= WARM && !done.some(reviews) && !cards.some((x) => x.why?.rule === 'warmup') && !(due && streak >= EVERY - 1)) {
      const id = Object.keys(at.all).filter((id) => phraseById[id] && at.all[id].last >= S.start && at.all[id].due > t).sort((a, b) => phraseById[b].zh.length - phraseById[a].zh.length || at.all[a].last - at.all[b].last)[0];
      const w = id && warm(id, tau, pred);
      if (w && !judge([w])[0].rule) return of(ready(w), 'warmup', 1, 1);
    }
    const r = best(legal, score);
    if (r) return of(r.c, due && streak >= EVERY - 1 ? 'due' : 'score', r.prop, legal.length);
    return giving();
  }
  // the due time each review card's phrases were dealt at
  const dueMap = (c, all) => { const ids = c.kind === 'review' ? [c.item.p.id] : c.kind === 'run' ? c.item.ps.map((p) => p.id) : c.kind === 'write' && c.item.item.again ? ['write:' + c.item.item.word] : []; return new Map(ids.map((id) => [id, all[id]?.due])); };
  // a card dealt outside the score (the about card, the bonus line), with what its slot says of it
  const bare = (item, rule, fat, tau, why = {}, slot = {}) => ({ item, why: { score: null, E: null, F: null, V: null, N: null, tau, p: null, A: null, lv: null, rule, cls: null, prop: 1, n: 0, fat, place: placing(), ...why }, kind: item.kind, fmt: null, key: item.kind, tags: none, rows: [], place: placing(), ...slot });
  const end = (fat, tau, cs) => ({ item: { kind: 'end' }, why: { score: null, E: null, F: null, V: null, N: null, tau, p: null, A: null, lv: null, rule: 'end', cls: null, prop: 1, n: 0, fat, ...(explain ? { cands: cs.map((x) => ({ kind: x.kind, key: x.key, fmt: x.fmt, cls: x.cls, p: x.p, p5: x.p5, A: x.A, lv: x.lv, rule: x.rule })) } : {}) }, kind: 'end', fmt: null, key: 'end', tags: new Set(), rows: [] });
  // The recap: the lines nailed this visit, the words written, how many phrases come back by the end of tomorrow, and
  // where a series under way goes next (its last episode's cliffhanger, and whether it's out yet: "Episode 4 · tomorrow")
  function recap(t, fat, tau, { all, done }) {
    const by = tomorrow(t);
    const last = data.scenarios.filter((s) => s.series && done[s.id]).sort((a, b) => done[b.id].at - done[a.id].at)[0], nx = last && episodes.get(last.series.id)?.get(last.series.ep + 1);
    const item = { kind: 'recap', said: S.lines.filter((l) => l.att === 1).length, nailed: [...new Set(S.nailed)], written: [...S.written], back: Object.keys(all).filter((id) => phraseById[id] && all[id].due < by).length,
      next: last && nx && !done[nx.id] ? { id: nx.id, ep: nx.series.ep, en: last.series.next || '', out: released(nx) } : null };
    return { item, why: { score: null, E: null, F: null, V: null, N: null, tau, p: null, A: null, lv: null, rule: 'recap', cls: null, prop: 1, n: 0, fat }, kind: 'recap', fmt: null, key: 'recap', tags: new Set(), rows: [] };
  }

  // Shown (on screen, or been): the first card this ranker dealt, a card whose own line or row has been heard, or one
  // whose card before it has been left, by moving on (a card closed by the page going away, left 'hide', puts nothing
  // after it on screen: mix.js hears that row only as the page goes, and the about card or the bonus line dealt below it
  // was never seen)
  const shown = (i) => i === 0 || slots[i].on || !!slots[i].left || (!!slots[i - 1]?.left && slots[i - 1].left.how !== 'hide');
  function deal(t, again = false) {
    // (the stores read once a pick, a parse each on a phone, before the visit begins: it asks them whether this phone has played)
    const at = read(t);
    if (!S || t - S.last >= GAP) begin(t, at);
    touch(t);
    const p = choose(t, again, at);
    if (!p) return null;
    slots.push({ ...p, at: t, sess: S, on: false, left: null, lines: [] });
    // a never-played phone's first story: placement starts with it (p3.md), and it's one of placement's stories
    if (p.never && p.kind === 'scn') { arms.hook ??= t; arms.place ??= { n: 0 }; slots[slots.length - 1].place = true; mark(); }
    onScreen(t);
    return { item: p.item, why: p.why };
  }
  // the about card and the bonus line once they've come on screen (shown): never dealt again; the challenge not again that day
  function onScreen(t) {
    for (let i = Math.max(0, slots.length - 3); i < slots.length; i++) {
      const x = slots[i];
      if (x.kind === 'about' && !arms.about && shown(i)) { arms.about = t; mark(); }
      if (x.kind === 'bonus' && arms.place && !arms.place.bonus && shown(i)) { arms.place.bonus = t; mark(); }
      if (x.kind === 'challenge' && arms.challenge !== x.item.day && shown(i)) { arms.challenge = x.item.day; mark(); }
    }
  }
  function repick(t) {
    const old = slots.pop(), p = deal(t, true);
    if (!p) { slots.push(old); return null; } // nothing to put in its place: it stays, as the feed still has it
    // the same card: the same item, its rung and τ brought up to date (it isn't on screen yet: a story's assisted() and
    // a review's rung read them as it starts, so a card re-picked after a loss is played for the τ the loss set)
    if (slots[slots.length - 1].key === old.key) { for (const k of ['A', 'tau']) if (k in p.item) old.item[k] = p.item[k]; Object.assign(slots[slots.length - 1], { item: old.item }); return { item: old.item, why: p.why }; }
    return p;
  }
  // a card dealt but not yet on screen is picked again, even once a visit has ended under it (back after half an hour,
  // the card below the one on screen is the new visit's)
  const next = () => { const i = slots.length - 1; return i >= 0 && !shown(i) ? repick(now()) : deal(now()); };
  const again = () => { const i = slots.length - 1; return i >= 0 && !shown(i) ? repick(now()) : null; };

  // A line row on a card (x: its slot, where the ranker has it): the visit's lines (first attempts, beside-the-story
  // tasks left out), and the ones nailed (right first time, y ≥ 0.9)
  function heard(x, row) {
    const y = learner.outcome(row), beside = ['practice', 'typeback'].includes(row.task);
    if (x) x.on = true;
    if (y == null || beside) return; // a practice with the answer up, a call's type it back: not the line itself
    if (x) x.lines.push({ att: row.att, y, out: ['timeout', 'hangup', 'caught', 'skip'].includes(row.res) });
    const clock = row.clock || levels.clock(row.lv) || levels.patience(row.lv);
    // (the bonus line is no line of the visit's τ or fatigue: missed, it's no loss)
    if (row.att === 1 && x?.kind !== 'bonus' && row.task !== 'bonus') S.lines.push({ att: 1, y, r: row.ms != null && clock ? row.ms / (1000 * clock) : 0, id: row.id });
    if (row.att === 1 && y >= 0.9 && row.task !== 'shadow') S.nailed.push(row.id);
  }
  // A line as it's logged, while placing: a first attempt on a story card is a placement line (and a placement story of
  // the format PL1 or PL2 owes, played, pays it); PLACE of them end placement
  function placed(x, row, t) {
    if (!placing() || learner.outcome(row) == null || ['practice', 'typeback'].includes(row.task)) return;
    if (x?.kind === 'scn' && row.att === 1) { arms.place.n++; if (x.place && (x.fmt === 'call' || x.fmt === 'chat')) arms.place[x.fmt] = true; }
    if (arms.place.n >= PLACE) arms.place.end = t;
    mark();
  }
  // A row as it's logged: the visit's lines, the card each belongs to, and a card's verdict on its arms. A row an ad
  // brought about (ad: P5's save asking a line again, an outcome it rescued) isn't the player's own: never heard.
  function after(row) {
    if (!row?.k || (row.k !== 'line' && row.k !== 'card') || row.ad) return;
    const t = row.at ?? now();
    if (!S || t - S.last >= GAP) begin(t);
    touch(t);
    const open = slots.slice(Math.max(0, slots.length - 4)).filter((x) => !x.left);
    if (row.k === 'line') { const x = open.find((x) => x.rows.includes(row.id) || (x.kind === 'shadow' && row.task === 'shadow' && row.id.startsWith('shadow:' + x.item.item.scn.id + ':'))); heard(x, row); placed(x, row, t); return onScreen(t); }
    const x = open.find((x) => x.kind === row.kind && cardId(x) === row.id);
    if (x) { x.left = row; x.on = true; }
    onScreen(t);
    if (row.again) return; // back on a card finished before: nothing new
    if (row.kind === 'write' && row.state === 'done' && row.stars) S.written.push(row.id);
    verdict(row, x);
    keep();
  }
  // A card's verdict on the arms of its format (a story's) or kind, and its topic: finished, or left at what share of its
  // lines (the slot's first attempts, or the row's own count for a card this ranker didn't deal: v1's, another version's)
  function verdict(row, x) {
    const fam = row.kind === 'scn' ? row.fmt || byId[row.id]?.format : row.kind === 'run' ? 'run' : row.kind;
    if (!PRIOR[fam]) return;
    const s = row.kind === 'scn' ? byId[row.id] : null, topic = s ? s.topic || s.topics?.[0] : null;
    const share = () => (x ? x.lines.filter((l) => l.att === 1).length : row.asked || 0) / (s ? Math.max(1, beats(x?.item.scn || s).length) : 1);
    const d = row.state === 'done' ? [1, 0] : row.state === 'idle' || !row.asked || share() < 0.3 ? [0, 1] : [0, 0.5];
    if (row.like || row.replay) d[0] += 1;
    for (const [side, k] of [['fmt', fam], ...(topic ? [['topic', topic]] : [])]) { const a = arm(side, k); a[0] += d[0]; a[1] += d[1]; }
  }
  // the id events.js logs a card under (what(): a story's, a review's phrase, a run's phrases, a word, a recap's kind)
  const cardId = (x) => (story(x) ? x.item.scn.id : x.kind === 'review' || x.kind === 'bonus' ? x.item.p.id : x.kind === 'run' ? x.item.ps.map((p) => p.id).join(',') : x.kind === 'write' ? x.item.item.word : x.kind === 'shadow' ? x.item.item.scn.id : x.kind);

  // The visit under way when the ranker is made inside one (resume(): the Mix opened again, a tab the phone reloaded):
  // its cards and lines from the rows logged since it began, so the rules, τ, fatigue and the recap's clock carry on, and
  // what it played stays played. A card's row closes it, the lines before it its own; a page hidden and back logs the
  // card on screen left 'hide' and then left again (one card), and the time hidden isn't time spent. The arms heard every
  // row as it came: nothing is counted again.
  const was = resume?.();
  if (was?.rows?.length) {
    const all = srs.all(), done = marks.doneAll(), lines = was.rows.filter((r) => r.k === 'line').length;
    S = { start: was.start, last: was.start, ms: 0, returning: learner.level().n > lines || Object.values(done).some((d) => d.at < was.start) || Object.values(all).some((e) => e.last < was.start), from: 0, lines: [], nailed: [], written: [], unseen: new Map() };
    let pend = [], away = false;
    for (const row of was.rows) {
      if (row.k === 'hide') { away = true; continue; }
      if (row.at != null) { if (away) S.last = Math.max(S.last, row.at); else touch(row.at); away = false; }
      if (row.k === 'line' && !row.ad) { pend.push(row); continue; }
      if (row.k !== 'card' || row.again || row.ad) continue;
      const prev = slots[slots.length - 1], x = prev?.left?.how === 'hide' && prev.kind === row.kind && cardId(prev) === row.id ? prev : rebuilt(row, all);
      if (x && x !== prev) slots.push(x);
      for (const l of pend) heard(x, l);
      pend = [];
      if (!x) continue;
      x.left = row; x.on = true;
      if (row.kind === 'write' && row.state === 'done' && row.stars) S.written.push(row.id);
    }
  }
  // a card as its row has it (the slot the ranker that dealt it kept went with that page): what the rules read of it
  function rebuilt(row, all) {
    const at = row.at - (row.ms || 0), base = { why: { rule: row.rule ?? null, p: row.p ?? null, A: row.A ?? null, tau: row.tau ?? null, lv: row.lv ?? null }, at, sess: S, on: true, left: null, lines: [], tags: none, rows: [], dues: new Map() };
    const dues = (ids) => new Map(ids.map((id) => [id, all[id] && all[id].last < at ? all[id].due : NaN])); // answered on it: due again later
    if (row.kind === 'scn' || row.kind === 'challenge') { const s = byId[row.id], pl = s && (plays.find((x) => x.s === s && x.L === row.lv) || plays.find((x) => x.s === s && x.L === s.level)), ch = row.kind === 'challenge'; return pl ? { ...base, item: { kind: row.kind, scn: pl.t, lv: pl.L, A: row.A, tau: row.tau, ...(ch ? { mod: row.mod, n: row.n, day: row.day } : {}) }, kind: row.kind, fmt: s.format, key: ch ? 'challenge:' + pl.key : pl.key, tags: pl.tags, rows: pl.rows } : null; }
    if (row.kind === 'review') { const q = phraseById[row.id]; return q ? { ...base, item: { kind: 'review', p: q }, kind: 'review', fmt: 'review', key: 'review:' + q.id, tags: tagsOf.get(q.scn) || none, rows: [q.id], dues: dues([q.id]) } : null; }
    if (row.kind === 'run') { const ps = String(row.id).split(',').map((id) => phraseById[id]).filter(Boolean); return ps.length ? { ...base, item: { kind: 'run', ps, audio: ps[0].audio }, kind: 'run', fmt: 'chase', key: 'run:' + ps.map((q) => q.id).join(','), rows: ps.map((q) => q.id), dues: dues(ps.map((q) => q.id)) } : null; }
    // a word to write again is one met before this card (its review entry older than the card's own record)
    if (row.kind === 'write') { const w = writing['write:' + row.id], again = (all['write:' + row.id]?.seen || 0) >= 2; return w ? { ...base, item: { kind: 'write', item: again ? { ...w, again } : w }, kind: 'write', fmt: 'write', key: 'write:' + row.id, dues: again ? dues(['write:' + row.id]) : new Map() } : null; }
    if (row.kind === 'shadow') { const s = byId[row.id]; return s ? { ...base, item: { kind: 'shadow', item: { scn: s, step: null } }, kind: 'shadow', fmt: 'shadow', key: 'shadow:' + s.id, tags: tagsOf.get(s.id), rows: ['shadow:' + s.id] } : null; }
    if (row.kind === 'bonus') { const q = phraseById[row.id]; return q ? { ...base, item: { kind: 'bonus', p: q }, kind: 'bonus', fmt: 'review', key: 'bonus:' + q.id, tags: tagsOf.get(q.scn) || none, rows: [q.id] } : null; }
    if (row.kind === 'recap' || row.kind === 'end' || row.kind === 'about') return { ...base, item: { kind: row.kind }, kind: row.kind, fmt: null, key: row.kind };
    return null;
  }

  function unsee(ids) {
    if (!S) return;
    const m = dealt(seq()), all = srs.all();
    for (const id of ids || []) if (m.has(id) && m.get(id) === all[id]?.due) S.unseen.set(id, m.get(id));
  }
  const back = () => { const t = now(); if (S && t - S.last < GAP) S.last = t; };
  // every review due that this visit hasn't dealt at the time it's due now: below an end card, each comes when asked
  const waiting = () => { if (!S) return 0; const at = read(now()), seen = dealt(seq()); return at.due.filter((id) => (phraseById[id] || writing[id]) && seen.get(id) !== at.all[id].due).length; };
  function session() {
    if (!S) return null;
    const at = read(now()), cards = seq(), fat = fatigue(cards, at);
    return { start: S.start, returning: S.returning, minutes: S.ms / 60e3, fatigue: fat, tau: target(cards, fat, at), lines: S.lines.length, nailed: [...new Set(S.nailed)], written: [...S.written],
      placing: placing(), place: arms.place ? { ...arms.place } : null, hook: arms.hook ?? null, about: arms.about ?? null, challenge: arms.challenge ?? null, quiet: !!quiet(),
      cards: cards.map((x) => ({ kind: x.kind, fmt: x.fmt, key: x.key, id: cardId(x), lv: x.why.lv, A: x.why.A, p: x.why.p, rule: x.why.rule, cls: x.why.cls ?? null, out: outcome(x, at), y: ybar(x) })) };
  }
  return { next, again, after, back, unsee, waiting, session };
}

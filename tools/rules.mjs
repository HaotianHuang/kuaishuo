// tools/rules.mjs: the For You ranker's hard rules (app/shared/rank.js's header; docs/v2/p2.md), held from outside. As
// each pick is made, its facts are worked out again here, not by the ranker: the card's p̄ from learner.predict (the
// ranker uses learner.batch()), at the rung it was scored at (assist.lineRung at L0, a line's meetings counted under the
// id its rows go by), and at A5; whether a review the ranker may deal is due (srs as it stands, less what this visit has
// dealt at that due time, and one R2 allows); whether a caller can be followed. Then every pick is held to every rule
// against them, in the order the visit dealt them.
// That's what a pick may not be. The other half is what it must be where something else was owed, worked out here from
// spaced review, the stories done and liked and the visit's own picks, not from the ranker's list of candidates: the
// stories the visit could still bring (never played, a level whose lines are mostly new, a rematch: lost, liked 3+ days
// ago, or most of its lines due; open in their series; not a call R7 holds). An end card only when none is left; a first
// card where none reaches p̄ 0.85 at its rung (first*: counted apart, as forced, with the best any reached) the surest of
// them; a story where a rule gave way (format*: R2, surest*: R6; counted apart) only when nothing the rules allow was
// left, surest* the surest of them; a rematch only when no story new to you was allowed.
// And the first session (p3.md), followed here from the picks and the rows it hears, not from the ranker's marks: a phone
// that has never played opens on the hook (in reach) at the rung startAt() gives; the about card comes as card 2 of
// that visit (or the first of a later one, if it never came on screen), asking what's unanswered, and nowhere else;
// placing (from the hook until 12 first attempts on story cards) a story is aimed at τ 0.70, never
// the base 0.80, unless a τ before it holds (a loss's, then a visit's start's, then tiredness's), and is worth its lines' information (Σ p(1 − p)·a·C·a over the candidates' best); PL1 and PL2: while
// placing owes a call or a chat and one is allowed, no story of another format; PL3: the bonus line exactly when it's
// owed (once, after a card whose first attempts were all right, not in the visit's first 3 cards, R2 and R3 allowing),
// the phrase it must be; and v1's warmup exactly when it's owed (5 cards with no review), the phrase it must be.
// And the loops (p5.md, P5a), followed here from the rows and the stores: today's challenge exactly when it's owed (once a
// day; not a visit's first card, nor while placing or straight after a loss; R2 by its format, R3, R6 and R7 allowing;
// not once it's been on screen that day, nor played), the day's story at the level it has nearest the say level, its
// modifier and number, at the rung the ladder gives it, and till then never dealt as itself (saved for it); no episode before it's out (the day after the one before was
// first finished, worked out here from the rows heard and the marks); no shadow card in quiet mode; a story dealt for an
// ending not found (endings worked out here from the card rows: a row's end, else the story's only ending of its
// outcome), once a visit, never while a story new to you was allowed; and the about card, later, exactly when a phone
// that played before P3 (no hook) owes it (never seen, a question unanswered, 'soon' among them): never a visit's first
// card or straight after a loss, once a visit.
//   referee({ data, learner, assist, srs, marks, store, mode, runs, review, hold, quiet, challenge, loops }) → { visit(),
//     pick(p, place, t), hear(row), unsee(ids), breaks, forced, gave, picks, firsts }
//   visit(): a new visit starts; pick(p, place, t): a pick for the visit's card at place (again at the same place: a
//   re-pick that replaces it); hear(row): each row as it's logged (after the learner model); breaks: [{ rule, detail,
//   kind, place, why }]; forced: [{ best }]; gave: [{ rule }]. store: where the about card's answers are kept (ks.goals,
//   ks.born, ks.soon); runs: chase.createRun exists (the ranker's); review: the ranker's review levers; hold: R7's visits;
//   quiet: () → quiet mode is on; challenge: () → today's challenge (days.challenge(), as the ranker is given it);
//   loops: false where the ranker was given none of P5a's options (sim.mjs --loops=off: every episode out, no endings)
import { phraseId, tailor } from '../app/shared/content.js';
import { wordsToWrite } from '../app/shared/picks.js';
import { dayKey } from '../app/shared/events.js';

const FIRST = 0.85, FLOOR = 0.55, CAP = 0.4, EVERY = 4, EARLY = 3, HOLD = 3, DAY = 864e5, EPS = 1e-9;
const PLACE = 12, PLACE_TAU = 0.7, BASE_TAU = 0.8, LOSS_TAU = 0.92, START_TAU = 0.9, TIRED_TAU = 0.88, WARM = 5, ASK = ['home', 'goals', 'born'], LATER = [...ASK, 'soon'], BESIDE = ['practice', 'typeback'];
const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
const lvl = (t) => Math.min(5, Math.max(0, 1 + (t + 1 - Math.log(4)) / 0.67));
const beatsOf = (scn) => { const out = new Set(), walk = (l) => { for (const st of l || []) if (st.say && !out.has(st.say)) { out.add(st.say); walk(st.say.ok); walk(st.say.fail); walk(st.say.miss); (st.say.alts || []).forEach((a) => walk(a.then)); } }; walk(scn.steps); return [...out]; };
const rowOf = (scn, b) => b.pid || phraseId(scn, b.again ? { id: b.again } : b); // a chase's again encounter goes by the line it drills
// (the about card has no format and plays nothing; the bonus line's format is a review's, but it's no review and no
// extra; the challenge is a story)
const isStory = (it) => it.kind === 'scn' || it.kind === 'challenge';
const fmtOf = (it) => (isStory(it) ? it.scn.format : it.kind === 'run' ? 'chase' : it.kind === 'bonus' ? 'review' : ['recap', 'end', 'about'].includes(it.kind) ? null : it.kind);
const isReview = (it) => it.kind === 'review' || it.kind === 'run' || (it.kind === 'write' && !!it.item.again);
const isExtra = (it) => !['scn', 'challenge', 'recap', 'end', 'about', 'bonus'].includes(it.kind);
// an end step's key (days.js endKey's, by its contract: its words) and a story's endings, every branch walked: { key, end }
const keyOf = (st) => st.zh || st.en || st.end;
const endsOf = (scn) => { const out = [], seen = new Set(), walk = (l) => { for (const st of l || []) { if ('end' in st) { if (!out.some((e) => e.key === keyOf(st))) out.push({ key: keyOf(st), end: st.end }); } else if (st.say && !seen.has(st.say)) { seen.add(st.say); walk(st.say.ok); walk(st.say.fail); walk(st.say.miss); (st.say.alts || []).forEach((a) => walk(a.then)); } } }; walk(scn.steps); return out; };
const plays = (x) => !['recap', 'end', 'about'].includes(x.kind);
const reviewIds = (it) => (it.kind === 'review' ? [it.p.id] : it.kind === 'run' ? it.ps.map((p) => p.id) : it.kind === 'write' && it.item.again ? ['write:' + it.item.word] : []);

export function referee({ data, learner, assist, srs, marks, store = null, mode = () => 'self', runs = true, review = { run: 10, rung: true, rematch: true }, hold = HOLD, quiet = () => false, challenge = null, loops = true }) {
  const byId = data.byId, phraseById = data.phraseById;
  // every story at each level it plays at, as the ranker deals them, and the words each teaches as it's played
  const stories = data.scenarios.flatMap((s) => [...new Set([s.level, ...beatsOf(s).flatMap((b) => Object.keys(b.levels || {}).map(Number))])].map((L) => ({ s, L, t: L === s.level ? s : tailor(s, L) })));
  const writing = new Set(stories.flatMap(({ t }) => wordsToWrite(data, t).map((w) => 'write:' + w.word)));
  const eps = new Map(data.scenarios.filter((s) => s.series).map((s) => [`${s.series.id}:${s.series.ep}`, s]));
  const hook = data.scenarios.find((s) => s.first) || byId['airport-esim'] || null, hookPlay = hook && stories.find((x) => x.s === hook && x.L === hook.level);
  let cur = null, visits = 0;
  // the first session as followed here: the hook dealt, the about card seen, placement ({ n, call, chat, bonus, end });
  // and the loops': the day the challenge was last on screen, each story's endings found (keys), each story's first
  // finish (its day)
  const first = { hook: null, about: false, place: null, challenge: null }, found = new Map(), fin = new Map();
  // an episode out: the day after the one before it was first finished (the rows heard; before them, the marks' day)
  const out_ = (s, t) => { if (!loops || !s.series || s.series.ep <= 1) return true; const prev = eps.get(`${s.series.id}:${s.series.ep - 1}`), d = prev && (fin.get(prev.id) || (marks.doneAll()[prev.id] && dayKey(marks.doneAll()[prev.id].at))); return !!d && d < dayKey(t); };
  // a story's endings not all found, of more than one
  const unfound = (s) => { const es = loops ? endsOf(byId[s.id] || s) : []; return es.length > 1 && (found.get(s.id)?.size || 0) < es.length; };
  const out = { breaks: [], forced: [], gave: [], picks: 0, firsts: 0, place: null };
  const way = (scn, kind, b) => { const w = mode(scn, kind); return (typeof w === 'function' ? (b ? w(b) : 'self') : w) || 'self'; };
  // a phone that has never played (feed.js's: no srs entry, no line in the model): a card's first lines are its first
  // ever, at FIRST_LINE and a step down each (assist.lineRung's first); the hook's also asks no story done
  const blank = () => !srs.count() && !learner.level().n;
  // a story's p̄ at rung A (A5 when none), its lines as the ranker reads them (every branch's, each once); info: what
  // they'd tell the model, Σ p(1 − p)·a·C·a (placement's V)
  const lines = (scn) => { const bs = beatsOf(scn), ids = [...new Set(bs.map((b) => phraseId(scn, b)))]; return { ids, m: new Map(bs.map((b) => [phraseId(scn, b), way(scn, 'scn', b)])), met: new Map(bs.map((b) => [phraseId(scn, b), rowOf(scn, b)])) }; };
  const rungs = (scn, A) => { const all = srs.all(), { ids, m, met } = lines(scn), one = blank(); return ids.map((id) => ({ id, w: m.get(id), A: A == null ? 5 : assist.lineRung(A, { level: scn.level, seen: all[met.get(id)]?.seen || 0, attempt: 1, first: one && ids.indexOf(id) + 1 }) })); };
  const storyP = (scn, A) => mean(rungs(scn, A).map((l) => learner.predict(l.id, { mode: l.w, assist: l.A, typed: 'pinyin' })));
  const info = (scn, A) => { const B = learner.batch(); return rungs(scn, A).reduce((t, l) => { const q = learner.predict(l.id, { mode: l.w, assist: l.A, typed: 'pinyin' }); return t + q * (1 - q) * B.spread(l.w === 'type' ? 'pinyin' : l.w, scn.format === 'call'); }, 0); };
  // the rung a story would start at now (assist.startAt, from learner.predict), aiming at τ
  const startAt = (scn, tau) => { const bs = beatsOf(scn), m = new Map(bs.map((b) => [phraseId(scn, b), way(scn, 'scn', b)])); return assist.startAt([...m.keys()], { last: assist.last() ?? 2, tau, mode: (id) => m.get(id), predict: learner.predict, knows: learner.persona() != null || learner.level().n > 0 }); };
  // a review's chance at the rung it's played at: v1's A2, or (review.rung, the ranker's lever) the one the ladder would
  // give its lines now (assist.startAt, aiming at the pick's τ)
  const reviewP = (id, kind, A = 2) => { const p = phraseById[id], w = way(byId[p.scn], kind); return learner.predict(id, { mode: w, assist: A, typed: 'pinyin' }); };
  const rungFor = (ids, kind, tau) => (review.rung ? assist.startAt(ids, { last: assist.last() ?? 2, tau, mode: (id) => way(byId[phraseById[id].scn], kind), predict: learner.predict, knows: learner.persona() != null || learner.level().n > 0 }) : 2);
  const fact = (it, why, t) => {
    if (isStory(it)) return { p: storyP(it.scn, why.A), p5: storyP(it.scn, 5) };
    if (it.kind === 'review') return { p: reviewP(it.p.id, 'review', why.A ?? 2), A: rungFor([it.p.id], 'review', why.tau) };
    if (it.kind === 'run') return { p: mean(it.ps.map((q) => reviewP(q.id, 'run', why.A ?? 2))), A: rungFor(it.ps.map((q) => q.id), 'run', why.tau) };
    if (it.kind === 'bonus') return { p: reviewP(it.p.id, 'review', 2) };
    if (it.kind === 'write') return { p: learner.batch().way('write', learner.typical(2), { assist: why.A }) };
    if (it.kind === 'shadow') return { p: learner.batch().way('shadow', learner.typical(it.item.scn.level)) };
    return {};
  };
  const visit = () => { cur = { cards: [], unseen: new Map(), start: null }; visits++; };
  const placing = () => !!first.place && !first.place.end;
  // the challenge's story, saved for it while it's owed today (not placing, neither on screen today nor played)
  const saved = () => { const ch = challenge?.(); return ch?.id && !ch.played && first.challenge !== ch.day && !placing() ? ch.id : null; };
  // the about card's questions not answered yet, in its order
  const unasked = (ask = ASK) => ask.filter((k) => (k === 'home' ? learner.persona() == null : store?.get(k, null) == null));
  // PL3's line, worked out here: a phrase never met of a story not played (on this phone, nor this visit), at the say
  // level and one (clamped 3–5; the nearest level that has one, the higher of two as near), its chance at A2 nearest even
  const bonusLine = () => {
    const all = srs.all(), done = marks.doneAll(), played = new Set(cur.cards.filter((x) => x.kind === 'scn').map((x) => x.id)), want = Math.min(5, Math.max(3, Math.ceil(learner.level().say) + 1));
    const lv = (q) => { const l = q.level ?? byId[q.scn].level; return Number.isInteger(+l) ? +l : 2; }, ps = data.phrases.filter((q) => byId[q.scn] && !done[q.scn] && !played.has(q.scn) && !all[q.id]);
    if (!ps.length) return null;
    const gap = Math.min(...ps.map((q) => Math.abs(lv(q) - want))), L = Math.max(...ps.filter((q) => Math.abs(lv(q) - want) === gap).map(lv));
    return ps.filter((q) => lv(q) === L).map((q) => ({ q, d: Math.abs(reviewP(q.id, 'review', 2) - 0.5) })).reduce((b, x) => (x.d < b.d ? x : b)).q;
  };
  // v1's warmup's phrase: the longest met this visit and not due yet (of equals, the earliest met)
  const warmLine = (t) => { const all = srs.all(); return Object.keys(all).filter((id) => phraseById[id] && all[id].last >= cur.start && all[id].due > t).sort((a, b) => phraseById[b].zh.length - phraseById[a].zh.length || all[a].last - all[b].last)[0] || null; };
  // A row as it's logged: a first attempt on a story card, while placing, is a placement line (and pays PL1 or PL2 for a
  // placement story of its format); 12 of them end placement. A card's own row: it was on screen.
  function hear(row) {
    if (!cur || !row) return;
    // (and, left by moving on, not by the page going away, the card dealt below it is on screen: an about card or a bonus
    // line seen is never dealt again)
    if (row.k === 'card') {
      // (a story's run, done: its ending, and its first finish)
      if ((row.kind === 'scn' || row.kind === 'challenge') && row.state === 'done' && !row.again && byId[row.id]) {
        const es = endsOf(byId[row.id]), of = es.filter((e) => e.end === (row.out === 'lose' ? 'lose' : 'win')), k = es.some((e) => e.key === row.end) ? row.end : of.length === 1 ? of[0].key : null;
        if (k) (found.get(row.id) || found.set(row.id, new Set()).get(row.id)).add(k);
        if (!fin.has(row.id)) fin.set(row.id, dayKey(row.at));
      }
      const x = [...cur.cards].reverse().find((x) => x.kind === row.kind && (x.kind === 'about' || x.rowId === row.id)); if (x) Object.assign(x, { shown: true, row }); const nx = x && row.how !== 'hide' && cur.cards[cur.cards.indexOf(x) + 1]; if (nx) seen(nx); return;
    }
    if (row.k !== 'line' || row.ad) return;
    // (a line to shadow goes by its story and the line: shadow:<story>:<line>)
    // (the first card not yet left that asks it: a review of one of its lines may be dealt below the story on screen)
    const x = cur.cards.find((x) => !x.row && ((x.rows || []).includes(row.id) || (x.kind === 'shadow' && row.task === 'shadow' && String(row.id).startsWith(`shadow:${x.rowId}:`)))), y = learner.outcome(row);
    if (y == null || BESIDE.includes(row.task)) return;
    if (x && row.att === 1) x.ys.push(y);
    if (!placing()) return;
    if (x?.kind === 'scn' && row.att === 1) { first.place.n++; if (x.place && (x.fmt === 'call' || x.fmt === 'chat')) first.place[x.fmt] = true; }
    if (first.place.n >= PLACE) first.place.end = row.at;
  }
  // a card on screen: the about card and the bonus line once seen are never dealt again
  const seen = (x) => { x.shown = true; if (x.kind === 'about') first.about = true; if (x.kind === 'bonus' && first.place) first.place.bonus = true; if (x.kind === 'challenge') first.challenge = x.day; };
  // review id → its due time when this visit dealt it
  const dealt = () => { const m = new Map(); for (const x of cur.cards) for (const [id, due] of x.dues || []) m.set(id, due); return m; };
  // a review the ranker may deal is due: a phrase (or a word to write again) whose due time has come, not dealt this
  // visit at that due time, its chance of coming right at least the floor; and one R2 allows: phrases come as a run (a
  // chase) where three or more can and the last card wasn't a chase, else as flash crises (a review's format: not after
  // a flash crisis, nor the bonus line, whose format is a review's); a word to write again not straight after a word
  // written
  const open = (t) => { const all = srs.all(), m = dealt(); return srs.due(t).filter((id) => !(m.get(id) === all[id].due && cur.unseen.get(id) !== all[id].due)); };
  // (the phrases among them, the longest overdue first: srs.due's order; below an end card, the floor aside)
  const duePs = (t, tau, below = false) => open(t).filter((id) => phraseById[id] && (below || reviewP(id, 'review', rungFor([id], 'review', tau)) >= FLOOR - EPS));
  const dueDealable = (t, prevFmt, tau) => {
    const ps = duePs(t, tau).length;
    if (ps && (ps >= 3 && runs && prevFmt !== 'chase' ? true : prevFmt !== 'review')) return true;
    return prevFmt !== 'write' && open(t).some((id) => !phraseById[id] && writing.has(id)) && learner.batch().way('write', learner.typical(2), { assist: assist.last() ?? 2 }) >= FLOOR - EPS;
  };
  // R7 while it holds (a phone's first 3 visits): a caller faster than you can surely follow
  const fast = (scn) => { if (scn.format !== 'call' || visits > hold) return false; const sk = learner.skills(), base = byId[scn.id] || scn; return (scn.listen ?? base.listen ?? Math.max(3, base.level + 1)) > 1 + lvl(sk.L.m - sk.g.s) + EPS; };
  // The stories the visit could still bring, worked out from the stores: not dealt this visit (at any level), open in
  // their series, not a caller R7 holds, and new to you (never played, or a level whose lines are mostly new) or a
  // rematch (lost, liked 3+ days ago, or most of its lines due); each with its p̄ at A5
  const left = (t) => {
    const all = srs.all(), done = marks.doneAll(), liked = new Set(marks.list('liked')), played = new Set(cur.cards.filter(isStory).map((x) => x.id)), ended = cur.cards.some((x) => x.ending), save = saved();
    return stories.filter(({ s, t: scn }) => {
      if (played.has(s.id) || fast(scn) || s.id === save) return false;
      if (s.series && s.series.ep > 1 && (!done[eps.get(`${s.series.id}:${s.series.ep - 1}`)?.id] || !out_(s, t))) return false;
      return true;
    }).map((x) => {
      const d = done[x.s.id], rows = [...new Set(beatsOf(x.t).map((b) => rowOf(x.t, b)))], met = rows.filter((id) => all[id]).length, due = rows.filter((id) => all[id]?.due <= t).length / rows.length;
      const cls = !d ? 'new' : d.at >= cur.start ? null : 1 - met / rows.length >= 0.5 ? 'level' : d.outcome === 'lose' || (liked.has(x.s.id) && t - d.at >= 3 * DAY) || due >= 0.5 ? 'rematch' : !ended && unfound(x.s) ? 'ending' : null;
      return { ...x, cls, p5: cls ? storyP(x.t, 5) : NaN };
    }).filter((x) => x.cls);
  };
  // each story's p̄ at the rung it would start at, aiming at τ
  const atRung = (xs, tau) => xs.map((x) => ({ ...x, p: storyP(x.t, startAt(x.t, tau)) }));
  function pick(p, place, t) {
    if (!cur) visit();
    if (!p) return;
    if (cur.start == null) cur.start = t;
    const { item: it, why } = p;
    if (place < cur.cards.length) cur.cards.length = place; // a re-pick replaces the card at its place
    // every card before this place is on screen or has been (the feed asks for a card as the one before it comes on):
    // the about card and the bonus line once seen are never dealt again
    cur.cards.forEach(seen);
    // the visit so far, as dealt: what each rule looks at (the about card is no card of the rules', as a recap isn't)
    const below = cur.cards.some((x) => x.kind === 'end'), done = cur.cards.filter(plays);
    const n = done.length, ex = done.filter((x) => x.extra).length, prev = cur.cards[cur.cards.length - 1], prevContent = prev && plays(prev) ? prev : null;
    const lastRev = done.map((x, i) => [x, i]).filter(([x]) => x.review).pop(), streak = n - (lastRev ? lastRev[1] + 1 : 0);
    // facts as they stand now, before this card plays
    const f = { kind: it.kind, id: isStory(it) ? it.scn.id : null, day: it.day, fmt: fmtOf(it), review: isReview(it), extra: isExtra(it), ...fact(it, why, t), due: dueDealable(t, prevContent?.fmt, why.tau), why, ids: reviewIds(it), dues: new Map(reviewIds(it).map((id) => [id, srs.get(id)?.due])), at: t, ys: [], place: placing(),
      rows: isStory(it) ? [...new Set(beatsOf(it.scn).map((b) => rowOf(it.scn, b)))] : it.kind === 'review' || it.kind === 'bonus' ? [it.p.id] : it.kind === 'run' ? it.ps.map((q) => q.id) : [],
      rowId: isStory(it) ? it.scn.id : it.kind === 'review' || it.kind === 'bonus' ? it.p.id : it.kind === 'run' ? it.ps.map((q) => q.id).join(',') : it.kind === 'write' ? it.item.word : it.kind === 'shadow' ? it.item.scn.id : it.kind };
    if (isStory(it)) f.fast = fast(it.scn);
    const brk = (rule, detail = '') => out.breaks.push({ rule, detail, kind: it.kind, place, why: { ...why, cands: undefined }, seq: cur.cards.map((x) => (x.kind === 'scn' ? x.fmt : x.kind) + (x.why?.rule ? `(${x.why.rule})` : '')).join(' ') });
    out.picks++;
    // The first session. A phone that has never played opens on the hook (where R6 and R7 let it), placement starting
    // there; the about card is card 2 of that visit, or the first of a later one if it never came on screen, while a
    // question is unanswered, asking those in order; nowhere else
    const virgin = !place && blank() && !Object.keys(marks.doneAll()).length, hookOk = virgin && !!hookPlay && storyP(hookPlay.t, 5) >= FLOOR - EPS && !fast(hookPlay.t);
    f.never = virgin;
    if (hookOk && !(it.kind === 'scn' && it.scn.id === hook.id && it.lv === hook.level && why.rule === 'hook')) brk('a fresh phone not opened on the hook', `${it.scn?.id || it.kind} (${why.rule})`);
    if (why.rule === 'hook' && !hookOk) brk('a hook not owed');
    if (virgin && it.kind === 'scn') { first.hook ??= t; first.place ??= { n: 0 }; f.place = true; }
    const ask = !below && !hookOk && !first.about && ((place === 1 && cur.cards[0]?.never) || (place === 0 && first.hook != null)) ? unasked() : [];
    if (ask.length && !(it.kind === 'about' && (it.ask || []).join() === ask.join())) brk('the about card owed', `${ask.join(',')}: ${it.kind} ${(it.ask || []).join(',')}`);
    // The loops (P5a). The last card that counts (the bonus aside) lost: a story's run, or a review run, lost
    const lastL = done.filter((x) => x.kind !== 'bonus').pop(), dL = lastL && (isStory(lastL) ? marks.doneAll()[lastL.id] : lastL.kind === 'run' ? marks.doneAll()['review-run'] : null), lost = !!dL && dL.at >= lastL.at && dL.outcome === 'lose';
    // Today's challenge, owed once a day: not a visit's first card, nor below an end card, while placing or straight after
    // a loss; not once on screen today nor played; R3 owing nothing; its story at the level nearest the say level (the
    // lower of two as near), not played this visit, in reach (R6), and in reach as played (aimed at a loss's τ, its
    // modifier taking about a rung away: R6's floor at the rung under the one the ladder gives), R7 and R2 (its format) allowing. (The ranker's order:
    // after the end on a high, before the later about card.)
    const ch = challenge?.(), chS = ch?.id && byId[ch.id];
    let chOwed = null;
    if (chS && !ch.played && first.challenge !== ch.day && n >= 1 && !below && !placing() && !lost && !(f.due && streak >= EVERY - 1)) {
      // (the level nearest the player's, not L0 where the story has another: rank.js daily())
      const say = learner.level().say, ofS = stories.filter((y) => y.s === chS), x = (ofS.some((y) => y.L >= 1) ? ofS.filter((y) => y.L >= 1) : ofS).sort((a, b) => Math.abs(a.L - say) - Math.abs(b.L - say) || a.L - b.L)[0], d = marks.doneAll()[chS.id];
      if (!cur.cards.some((y) => isStory(y) && y.id === chS.id) && !(d && d.at >= cur.start) && !fast(x.t) && storyP(x.t, 5) >= FLOOR - EPS && storyP(x.t, Math.max(0, startAt(x.t, LOSS_TAU) - 1)) >= FLOOR - EPS && chS.format !== prevContent?.fmt) chOwed = x;
    }
    if (chOwed && !['sure win', 'recap'].includes(why.rule) && it.kind !== 'challenge') brk('the challenge owed', `${ch.id}@${chOwed.L}: ${it.kind} (${why.rule})`);
    if (it.kind === 'challenge') {
      if (!chOwed) brk('a challenge not owed', `${it.scn.id}@${it.lv} (${ch?.played ? 'played' : first.challenge === ch?.day ? 'seen today' : placing() ? 'placing' : lost ? 'after a loss' : n < 1 ? 'first' : 'not allowed'})`);
      else if (it.scn.id !== ch.id || it.lv !== chOwed.L || it.mod !== ch.mod || it.n !== ch.n || it.day !== ch.day || why.rule !== 'challenge') brk('the challenge not the day\'s', `${it.scn.id}@${it.lv} ${it.mod} #${it.n} ${it.day} (${why.rule}) against ${ch.id}@${chOwed.L} ${ch.mod} #${ch.n} ${ch.day}`);
    }
    // The about card, later: a phone that played before P3 (no hook dealt), the card never on screen, a question
    // unanswered ('soon' too): not a visit's first card, nor straight after a loss, once a visit; after the challenge
    const later = !below && !chOwed && !first.about && first.hook == null && n >= 1 && !lost && !cur.cards.some((x) => x.kind === 'about') ? unasked(LATER) : [];
    if (later.length && !['sure win', 'recap'].includes(why.rule) && !(it.kind === 'about' && (it.ask || []).join() === later.join() && why.later)) brk('the later about card owed', `${later.join(',')}: ${it.kind} ${(it.ask || []).join(',')}`);
    if (it.kind === 'about' && !ask.length && !later.length) brk('an about card not owed');
    // quiet mode: no line to shadow; an episode only once it's out
    if (it.kind === 'shadow' && quiet()) brk('a shadow card in quiet mode');
    if (it.kind === 'scn' && it.scn.id === saved()) brk('the challenge\'s story dealt as itself', `${it.scn.id}@${it.lv} (${why.rule}), the challenge owed today`);
    if (isStory(it) && it.scn.series && !out_(byId[it.scn.id] || it.scn, t)) brk('an episode dealt before it was out', `${it.scn.id} (episode ${it.scn.series.ep})`);
    // Placing, a story is aimed at τ 0.70 (or at a loss's, a visit's start's or tiredness's τ: never the base 0.80), and
    // dealt for it; 0.70 elsewhere only after 3 strong cards ("Harder one?"); every story at the rung startAt() gives it
    // (the challenge too)
    if (isStory(it)) {
      const strong = done.filter((x) => x.kind !== 'bonus').slice(-3), harder = strong.length === 3 && strong.every((x) => x.ys.length && mean(x.ys) >= 0.85);
      if (f.place && why.rule !== 'hook' && why.tau === BASE_TAU) brk('placing, a story aimed at the base τ');
      // τ's order (rank.js target()): one card after a story lost a loss's, else a visit's first card a start's, else
      // tired (the ranker's own fatigue, why.fat) tiredness's, else placing's. (A loss's τ for two misses in the last five
      // lines is the ranker's count, and a returning visit's second card a start's: neither is judged here)
      const lastC = done.filter((x) => x.kind !== 'bonus').pop(), dl = lastC?.kind === 'scn' ? marks.doneAll()[lastC.id] : null, lost = !!dl && dl.at >= lastC.at && dl.outcome === 'lose';
      const nC = done.filter((x) => x.kind !== 'bonus').length, tauWant = lost ? LOSS_TAU : why.tau === LOSS_TAU || (why.tau === START_TAU && nC < 2) ? null : !nC ? START_TAU : why.fat > 0.5 ? TIRED_TAU : f.place ? PLACE_TAU : null;
      if (why.rule !== 'hook' && tauWant != null && why.tau !== tauWant) brk('a story aimed at a τ out of order', `${why.tau} against ${tauWant}${lost ? ' (one card after a loss)' : !nC ? ' (the visit\'s first card)' : why.fat > 0.5 ? ' (tired)' : ' (placing)'}`);
      if (!f.place && why.tau === PLACE_TAU && !harder) brk('τ 0.70 neither placing nor after 3 strong cards');
      if (it.tau !== why.tau) brk('a story dealt for another τ', `${it.tau} against ${why.tau}`);
      if (it.kind === 'challenge' && why.tau !== LOSS_TAU) brk('the challenge not aimed at a loss\'s τ', `${why.tau}`);
      if (why.A !== startAt(it.scn, why.tau)) brk('a story not at the rung the ladder gives it', `A${why.A} against A${startAt(it.scn, why.tau)}`);
      // and worth its lines' information, rescaled over the stories the rules allowed (all of them, where none was)
      if (f.place && why.rule !== 'hook' && why.cands) {
        const ss = why.cands.filter((c) => c.kind === 'scn'), pool = ss.some((c) => !c.rule) ? ss.filter((c) => !c.rule) : ss, inf = (c) => { const x = stories.find((x) => `${x.s.id}@${x.L}` === c.key); return x ? info(x.t, c.A) : 0; };
        const top = Math.max(0, ...pool.map(inf)), want = top > 0 ? Math.min(1, info(it.scn, why.A) / top) : 0;
        if (Math.abs(want - why.V) > 1e-9) brk('placing, V not the lines\' information', `${why.V?.toFixed(4)} against ${want.toFixed(4)}`);
      }
    }
    // the ranker's own p̄, against this one: they are the same numbers, or the rules below judged something else
    if (f.p != null && why.p != null && Math.abs(f.p - why.p) > 1e-9) brk('p̄ differs from learner.predict');
    // a review at a rung: the one the ladder gives its lines (v1's A2 without the lever), and the item says it (mix.js plays item.A)
    if (f.A != null && (why.A !== f.A || (review.rung ? it.A !== f.A : it.A != null))) brk('a review not at the ladder\'s rung', `${why.A}/${it.A} against ${f.A}`);
    // (review.rematch, the lever: till the visit's first rematch, none is held back for the stories new to you)
    if (review.rematch && why.cands && !cur.cards.some((x) => x.rematch) && why.cands.some((c) => c.rule === 'later' && c.cls === 'rematch')) brk('a rematch held back where the review lever brings the first ahead');
    // a run: the longest overdue phrases a review may bring, as many as the review lever's run (REVIEW.run; ten at most)
    if (it.kind === 'run') { const want = duePs(t, why.tau, below).slice(0, Math.min(10, review.run)), got = it.ps.map((q) => q.id); if (got.join() !== want.join()) brk('a run not the longest overdue, as many as REVIEW.run', `${got.length} (${got.slice(0, 3)}…) against ${want.length} (${want.slice(0, 3)}…)`); }
    const gave = why.rule === 'format*' || why.rule === 'surest*';
    if (gave) out.gave.push({ rule: why.rule, p: f.p });
    if (f.kind === 'end' && !below) {
      // an end card closes the visit's stories only when it could bring none (a rule gives way before that; not for a
      // story only for its endings, which comes only where R6 and R2 allow it)
      const l = left(t).filter((x) => x.cls !== 'ending' || (x.p5 >= FLOOR - EPS && (!prevContent || x.s.format !== prevContent.fmt)));
      if (l.length) brk('an end card with stories left', `${l.length}: ${l.slice(0, 3).map((x) => `${x.s.id}@${x.L}`).join(', ')}`);
    } else if (plays(f)) {
      if (f.fast) brk('R7');
      if (below) { if (!f.review) brk('below the end card'); } // (asked for: any review, whatever its chance)
      else {
        if ((f.p5 ?? f.p) < FLOOR - EPS && why.rule !== 'surest*' && f.kind !== 'bonus') brk('R6'); // (the bonus is a probe: an even chance is its point)
        if (!n) out.firsts++;
        if (!n && why.rule !== 'hook') { // (the hook is R1's first card: held to its own rule above)
          if (f.kind !== 'scn') brk('R1');
          else if (f.p < FIRST - EPS && why.rule !== 'surest*') {
            // forced: no story the visit could bring reached 0.85 at its rung, and the surest of those in reach was dealt
            const l = atRung(left(t).filter((x) => x.p5 >= FLOOR - EPS), why.tau), best = Math.max(0, ...l.map((x) => x.p));
            if (why.rule !== 'first*' || best >= FIRST - EPS) brk('R1');
            else if (f.p < best - 1e-9) brk('first* not the surest', `${f.p.toFixed(3)} against ${best.toFixed(3)}`);
            else out.forced.push({ best, p: f.p });
          } else if (!gave) {
            // the top E among the first cards the rules allow; of equals (stories of a format with no topic and no hook draw
            // alike), the best fit, not the first in the content file
            const ok = (why.cands || []).filter((c) => !c.rule), top = Math.max(...ok.map((c) => c.E));
            if (why.cands && why.E < top - 1e-12) brk('R1 (not the top E)');
            else if (why.cands && ok.some((c) => Math.abs(c.E - why.E) <= 1e-12 && c.F > why.F + 1e-12)) brk('R1 (of equal E, not the best fit)');
          }
        }
        // (R2 gives way for format*, and for surest* where every story left is of the last card's format)
        if (prevContent && f.fmt && f.fmt === prevContent.fmt && why.rule !== 'format*' && !(why.rule === 'surest*' && left(t).filter((x) => x.cls !== 'ending').every((x) => x.s.format === prevContent.fmt))) brk('R2');
        if (f.review && prevContent?.review) brk('R3 (two in a row)');
        if (f.due && streak >= EVERY - 1 && !f.review) brk('R3 (none in 4)');
        if (f.extra && n < EARLY) brk('R5');
        if (f.extra && ex + 1 > CAP * (n + 1) + EPS) brk('R4');
        if (it.kind === 'scn') {
          const l = left(t), mine = l.find((x) => x.s.id === it.scn.id && x.L === it.lv), fresh = (x) => x.cls === 'new' || x.cls === 'level';
          // the stories new to you first: a rematch while one of them was allowed (in reach, of another format, sure
          // enough for a first card), no review owed
          const allowed = (x) => x.p5 >= FLOOR - EPS && (!prevContent || x.s.format !== prevContent.fmt);
          f.rematch = mine?.cls === 'rematch'; f.ending = why.cls === 'ending';
          // a story dealt for an ending not found: one there is (of more than one), once a visit, never while a story new
          // to you was allowed (no lever brings it ahead)
          if (f.ending && mine?.cls !== 'ending') brk('a story dealt for its endings with none to find, or a second this visit', `${it.scn.id}@${it.lv} (${mine?.cls ?? 'none'})`);
          if (f.ending && !(f.due && streak >= EVERY - 1)) { const w = l.filter((x) => fresh(x) && allowed(x)), ok = n ? w : atRung(w, why.tau).filter((x) => x.p >= FIRST - EPS); if (ok.length) brk('an ending to find while one new to you was allowed', `${ok.length}: ${ok[0].s.id}@${ok[0].L}`); }
          // (review.rematch, the ranker's lever: the visit's first rematch may come ahead of them)
          if (f.rematch && !(f.due && streak >= EVERY - 1) && !(review.rematch && !cur.cards.some((x) => x.rematch))) { const w = l.filter((x) => fresh(x) && allowed(x)), ok = n ? w : atRung(w, why.tau).filter((x) => x.p >= FIRST - EPS); if (ok.length) brk('a rematch while one new to you was allowed', `${ok.length}: ${ok[0].s.id}@${ok[0].L}`); }
          // PL1, PL2: placing (after the visit's first card), while a call (then a chat) is owed and one new to you is
          // allowed, no story of another format
          if (placing() && n && !gave) {
            const skipped = (x) => x.row && (x.row.state === 'idle' || !x.row.asked), owes = ['call', 'chat'].filter((g) => !first.place[g] && !cur.cards.some((x) => x.place && x.fmt === g && !skipped(x)));
            const can = (g) => !(f.due && streak >= EVERY - 1) && l.some((x) => x.s.format === g && fresh(x) && allowed(x)), g = owes.find(can);
            if (g && f.fmt !== g) brk(g === 'call' ? 'PL1' : 'PL2', `a ${f.fmt} with a ${g} owed`);
          }
          if (gave) {
            // a rule gave way only when nothing the rules allow was left: no review owed or dealable, no story in reach
            // of another format; and surest* only with none in reach at all, the surest of them, another format first
            // (never for a story only for its endings, nor counting one: the ranker gives way for none)
            if (why.cls === 'ending') brk(`${why.rule} for a story only for its endings`);
            const l = left(t).filter((x) => x.cls !== 'ending');
            const free = f.due && streak >= EVERY - 1 ? true : f.due && !prevContent?.review && n >= EARLY && ex + 1 <= CAP * (n + 1) + EPS;
            if (free) brk(`${why.rule} with a review the rules allowed`);
            if (l.some((x) => allowed(x))) brk(`${why.rule} with a story in reach of another format`);
            if (why.rule === 'format*' && !(f.p5 >= FLOOR - EPS && prevContent && f.fmt === prevContent.fmt)) brk('format* not a story in reach of the last format');
            if (why.rule === 'surest*') {
              if (l.some((x) => x.p5 >= FLOOR - EPS)) brk('surest* with a story in reach');
              const pool = atRung(l, why.tau), other = pool.filter((x) => !prevContent || x.s.format !== prevContent.fmt), best = Math.max(...(other.length ? other : pool).map((x) => x.p));
              if (f.p < best - 1e-9) brk('surest* not the surest', `${f.p.toFixed(3)} against ${best.toFixed(3)}`);
            }
          }
        }
      }
    }
    {
      // PL3: the bonus line exactly when it's owed (placing, once, after a card whose first attempts were all right and
      // that was won, not in the visit's first 3 cards, R2 and R3 allowing), the line it must be
      const pc = prevContent && prevContent.kind !== 'bonus' && prev === prevContent ? prevContent : null, d = pc?.kind === 'scn' ? marks.doneAll()[pc.id] : null;
      const won = pc && (pc.kind === 'scn' ? d?.at >= pc.at && d.outcome === 'win' : !pc.row || (pc.row.state === 'done' && pc.row.out !== 'lose'));
      // (the end on a high comes first: a sure win, and straight after one won, the recap)
      const bl = placing() && !first.place.bonus && !cur.cards.some((x) => x.kind === 'bonus') && !below && place >= EARLY && pc && pc.ys.length && pc.ys.every((y) => y >= 0.9) && won && pc.fmt !== 'review' && pc.why?.rule !== 'sure win' && !(f.due && streak >= EVERY - 1) ? bonusLine() : null;
      if (bl && !['sure win', 'recap'].includes(why.rule) && !(it.kind === 'bonus' && it.p.id === bl.id && why.rule === 'bonus')) brk('PL3: the bonus owed', `${bl.id}: ${it.kind} (${why.rule})`);
      if (it.kind === 'bonus' && !bl) brk('PL3: a bonus not owed');
      // v1's warmup exactly when it's owed (5 cards in with no review, none yet, none owed by R3; R2, R4 and the floor
      // allowing), the phrase it must be; unless the visit ends on a high there
      const wl = !below && n >= WARM && !done.some((x) => x.review) && !cur.cards.some((x) => x.why?.rule === 'warmup') && !(f.due && streak >= EVERY - 1) ? warmLine(t) : null;
      const warm = wl && prevContent?.fmt !== 'review' && ex + 1 <= CAP * (n + 1) + EPS && reviewP(wl, 'review', rungFor([wl], 'review', why.tau)) >= FLOOR - EPS;
      if (warm && !['sure win', 'recap', 'bonus', 'challenge', 'about'].includes(why.rule) && !(why.rule === 'warmup' && it.p?.id === wl)) brk('the warmup owed', `${wl}: ${it.kind} (${why.rule})`);
      if (why.rule === 'warmup' && !warm) brk('a warmup not owed');
    }
    cur.cards.push(f);
    if (!place && it.kind === 'about') first.about = true; // a visit's first card is on screen as it's dealt
  }
  const unsee = (ids) => { if (!cur) return; const all = srs.all(), m = dealt(); for (const id of ids || []) if (m.get(id) === all[id]?.due) cur.unseen.set(id, all[id].due); };
  return Object.assign(out, { visit, pick, hear, unsee, first });
}

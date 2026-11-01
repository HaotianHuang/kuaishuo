#!/usr/bin/env node
// tools/days-check.mjs: days.js (docs/v2/p5.md, P5a) in Node, the clock moved by KS_NOW as the app's tests move it, and
// the other P5a logic that lives beside it: srs entries' hist (store.js) and your Chinese's age (learner.js age()). Its
// parts:
//   the day       rolls over at 4 am: 3:59 counts for the evening before, through time.js's now() and KS_NOW
//   the streak    one story or three review lines keep a day (two don't; a skipped or cancelled one, a practice, a second
//                 attempt, the bonus, an ad's row: none); a word written again is a review; a missed day between two
//                 played ones spends a freeze as the phone plays again (risk till then; the notice held, once, till
//                 told()); 7, 14, 21 earn one, two at most; a gap longer than the freezes held spends none and breaks it
//                 (broke: the first day missed, the days it had), and the next day kept starts again at 1; best kept;
//                 kept and spent hold the last 60; played(), stories(), since(); a phone that played before P5a starts
//                 from its log
//   the challenge the same story and modifier on two fresh phones on the same day (and on every build), another the next
//                 day, never the same two days running over two years, always one of the pool (base level ≤ 2, no
//                 series episode), #1 on 2026-11-01, panic on odd days and quiet on even; played only once a line was
//                 asked or it was done (a card swiped past isn't); its squares and share text exact; it keeps the day
//   episodes      episode 1 always out, episode k the day after k − 1 was first finished (not at 3:59 that night, from
//                 4 am on), from the log, or the marks on a phone that finished it before P5a; a replay doesn't move it
//   endings       n of m from the log alone: a row's end, else the only ending of its outcome; never counted twice;
//                 kept past the log (a phone made again over the same store)
//   soon          what's coming up, its days left, the goal it implies, near (30 days and closer), past, went() counting
//                 the face and clearing it; the Lunar New Years
//   hist          an srs entry keeps its last 8 days said as [day, stars], one a day (its lowest stars), the day from
//                 4 am, an entry from before it gaining one
//   age           say and listen as ages (level 0 is 2 … 5 is 16, in between by the level, whole years), on every
//                 persona's start and after lines; null before placement ends (12 lines on a phone with no placement)
//   the phone     init() over kv, hearing events.js's own rows (line, cardIn, cardOut) as KS_NOW jumps days
// Exit 1 on any problem.  node tools/days-check.mjs
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const D = await import(path.join(ROOT, 'app/shared/days.js'));
const events = await import(path.join(ROOT, 'app/shared/events.js'));
const store = await import(path.join(ROOT, 'app/shared/store.js'));
const L = await import(path.join(ROOT, 'app/shared/learner.js'));
const time = await import(path.join(ROOT, 'app/shared/time.js'));
const { tailor } = await import(path.join(ROOT, 'app/shared/content.js'));
const sim = await import(path.join(ROOT, 'tools/sim.mjs'));

const t0 = performance.now(), problems = [], notes = [];
const fail = (m) => problems.push(m);
const eq = (a, b, what) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) fail(`${what}: ${x} against ${y}`); };
const ok = (c, what) => { if (!c) fail(what); };
const datas = Object.fromEntries(['data', 'review/gate/p4b-2/data', 'review/gate/p4b-3/data'].map((d) => [d, sim.load(d)]));
const data = datas.data;
// a local moment (the phone's own clock: the day turns at 4 am local), and a phone of its own over a store and a clock
const at = (y, m, d, h = 18, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const DAY = 864e5;
function phone(dat = data, t = at(2026, 11, 2)) {
  const st = sim.memory(), clock = { t }, now = () => clock.t, { srs, marks } = store.over(st, now);
  const days = D.createDays({ data: dat, store: st, now });
  const row = (r) => { const x = { at: clock.t, ...r }; days.hear(x); return x; };
  return { st, clock, srs, marks, days, row,
    line: (o = {}) => row({ k: 'line', id: 'airport-esim/esim', att: 1, res: 'ok', stars: 3, ...o }),
    review: (o = {}) => row({ k: 'line', id: 'airport-esim/esim', att: 1, res: 'ok', stars: 3, task: 'review', ...o }),
    story: (id = 'airport-esim', o = {}) => { marks.done(id, { stars: 3, outcome: o.out || 'win' }); return row({ k: 'card', kind: 'scn', id, state: 'done', how: 'swipe', out: o.out || 'win', stars: 3, ...o }); },
    day: (n = 1, h = 18) => { const d = new Date(clock.t); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); clock.t = d.getTime(); } };
}
const iso = (t) => events.dayKey(t);

// ---------- the day ----------
{
  eq(events.dayKey(at(2026, 11, 3, 3, 59)), '2026-11-02', '3:59 counts for the evening before');
  eq(events.dayKey(at(2026, 11, 3, 4, 0)), '2026-11-03', '4:00 is the new day');
  globalThis.KS_NOW = at(2026, 11, 3, 3, 59) - Date.now();
  const p = D.createDays({ data, store: sim.memory(), now: time.now });
  eq(p.today(), '2026-11-02', 'today() at 3:59 through KS_NOW');
  globalThis.KS_NOW = at(2026, 11, 3, 4, 1) - Date.now();
  eq(p.today(), '2026-11-03', 'today() at 4:01 through KS_NOW');
  // a story finished at 3:59 keeps the evening before
  const q = phone(data, at(2026, 11, 3, 3, 59)); q.story();
  eq(q.days.streak().kept, true, 'a story at 3:59 keeps its day'); q.clock.t = at(2026, 11, 3, 4, 1);
  eq(q.days.streak().kept, false, 'and the day after 4 am is not kept'); eq(q.days.streak().n, 1, 'the streak 1 through the evening before');
  globalThis.KS_NOW = 0;
}

// ---------- the streak ----------
{
  const p = phone();
  p.review(); p.review();
  eq(p.days.streak().kept, false, 'two review lines don\'t keep a day');
  p.review({ res: 'skip' }); p.review({ res: 'cancel' }); p.review({ task: 'practice' }); p.review({ att: 2 }); p.review({ task: 'bonus' }); p.review({ ad: 1 }); p.line();
  eq(p.days.streak().kept, false, 'a skipped, cancelled, practice, second-attempt, bonus, ad or story line isn\'t a review answered');
  p.review({ res: 'timeout' });
  eq(p.days.streak(), { n: 1, best: 1, freezes: 0, kept: true, risk: false, broke: null, held: null }, 'three review lines (a timed-out one too) keep the day');
  p.day(); eq(p.days.streak().n, 1, 'the next day, not yet kept: still 1'); eq(p.days.streak().risk, false, 'no risk with yesterday kept');
  // a word written again (in spaced review before this card) is a review; one written for the first time isn't
  p.srs.record('write:信号', 3); p.row({ k: 'card', kind: 'write', id: '信号', state: 'done', stars: 3 });
  p.review(); eq(p.days.streak().kept, false, 'a word written for the first time and a review: not kept');
  p.srs.record('write:信号', 3); p.row({ k: 'card', kind: 'write', id: '信号', state: 'done', stars: 3 });
  eq(p.days.streak().kept, false, 'a word written again is one review (two now)');
  p.review(); eq(p.days.streak().n, 2, 'and a third keeps the day');
  // to 7 in a row: a freeze
  for (let i = 3; i <= 7; i++) { p.day(); p.story(); }
  eq(p.days.streak().n, 7, 'seven days kept'); eq(p.days.streak().freezes, 1, 'a freeze earned at 7');
  // a day missed, then played: at risk till then, the freeze spent as the phone plays, the notice once
  p.day(2);
  const r = p.days.streak();
  eq([r.n, r.risk, r.freezes, r.kept, r.broke], [7, true, 1, false, null], 'a day missed with a freeze held: at risk, the streak 7');
  p.line({ res: 'timeout' });
  const missed = iso(p.clock.t - DAY), h = p.days.streak();
  eq([h.n, h.risk, h.freezes, h.held], [7, false, 0, { day: missed, n: 1, left: 0 }], 'played again: the freeze spent on the missed day, said once');
  p.story(); eq(p.days.streak().n, 8, 'and the day kept carries it on (the frozen day adds none)');
  eq(p.st.get('streak').spent, [missed], 'the day spent');
  p.days.told(); eq(p.days.streak().held, null, 'told: the notice gone');
  // on to 14 and 21 (two freezes), 28 (two at most)
  for (let n = 9; n <= 28; n++) { p.day(); p.story(); if (n === 14) eq(p.days.streak().freezes, 1, 'a freeze at 14'); if (n === 21) eq(p.days.streak().freezes, 2, 'two at 21'); }
  eq([p.days.streak().n, p.days.streak().freezes, p.days.streak().best], [28, 2, 28], 'at 28: two freezes at most');
  // two days missed, two freezes: both spent
  p.day(3); p.review();
  eq([p.days.streak().n, p.days.streak().freezes, p.days.streak().held?.n], [28, 0, 2], 'two days missed: two freezes spent');
  p.days.told(); p.story(); eq(p.days.streak().n, 29, 'and on');
  // a gap with none: broken, as it stands and once played
  p.day(2);
  const b = p.days.streak(), first = iso(p.clock.t - DAY);
  eq([b.n, b.risk, b.broke], [0, false, { day: first, n: 29 }], 'a day missed with no freeze: broken (0), broke the day missed and the 29 days');
  p.line(); eq(p.days.streak().n, 0, 'played: still broken'); eq(p.st.get('streak').broke, { day: first, n: 29 }, 'broke recorded');
  p.story(); eq([p.days.streak().n, p.days.streak().best], [1, 29], 'kept again: 1, best 29');
  // a gap longer than the freezes held spends none
  for (let n = 2; n <= 7; n++) { p.day(); p.story(); }
  eq(p.days.streak().freezes, 1, 'a freeze at 7 again');
  p.day(3);
  eq(p.days.streak().n, 0, 'two days missed with one freeze: broken');
  p.story(); eq([p.days.streak().n, p.days.streak().freezes, p.days.streak().held], [1, 1, null], 'none spent: the freeze kept for the next streak');
  // the last 60, played, stories, since
  for (let n = 0; n < 70; n++) { p.day(); p.story(n % 2 ? 'airport-esim' : 'hotpot-spicy'); }
  eq(p.st.get('streak').kept.length, 60, 'kept holds the last 60'); ok(p.st.get('streak').spent.length <= 60, 'spent holds 60 at most');
  eq(p.days.streak().n, 71, 'a streak past 60 days counted whole');
  const played = p.st.get('streak').played;
  eq(played, 1 + 1 + 5 + 1 + 20 + 1 + 1 + 6 + 1 + 70, 'played: the days a line or a card was played');
  eq(p.days.stories(), 2, 'stories(): the stories finished, each once');
  eq(p.days.since(), Math.round((new Date(p.clock.t - 4 * 3600e3).setHours(12) - new Date(2026, 10, 2, 12).getTime()) / DAY), 'since(): the days since install');
  // a card swiped past, an end card, a recap: not played
  const q = phone(); q.row({ k: 'card', kind: 'scn', id: 'airport-esim', state: 'idle' }); q.row({ k: 'card', kind: 'recap', id: 'recap', state: 'done' });
  eq(q.days.played(), 0, 'a card swiped past and a recap: no day played');
  // a phone that played before P5a: its streak from the log
  const st = sim.memory(), now = () => at(2026, 11, 5);
  const log = [1, 2, 3, 4].map((d) => ({ k: 'card', kind: 'scn', id: 'airport-esim', state: 'done', out: 'win', at: at(2026, 11, d) }));
  const old = D.createDays({ data, store: st, now, rows: log });
  eq([old.streak().n, old.played(), old.since()], [4, 4, 4], 'a phone that played before P5a: its streak, days played and install from its log');
  // its log with a freeze spent on its last day (7 days kept, one missed, one more, long ago): nothing told, broken now
  const sep = [1, 2, 3, 4, 5, 6, 7, 9].map((d) => ({ k: 'card', kind: 'scn', id: 'airport-esim', state: 'done', out: 'win', at: at(2026, 9, d) }));
  const gone = D.createDays({ data, store: sim.memory(), now: () => at(2026, 11, 2, 19), rows: sep }).streak();
  eq([gone.n, gone.held, gone.broke?.n], [0, null, 8], 'a phone from before P5a whose log spent a freeze in September: broken now, nothing to tell');
  const near = D.createDays({ data, store: sim.memory(), now: () => at(2026, 9, 9, 21), rows: sep }).streak();
  eq([near.n, near.freezes, near.held], [8, 0, null], 'the same log the day it ends: the streak 8, the freeze spent, and the replay\'s spending it not news');
}
// a freeze told of only while it's news: a later day played clears it, and so does a break
{
  const p = phone();
  for (let i = 1; i <= 7; i++) { if (i > 1) p.day(); p.story(); }
  p.day(2); p.story();
  ok(p.days.streak().held, 'a freeze spent (the notice up)');
  p.day(); p.story();
  eq(p.days.streak().held, null, 'not told that day: the next day played, it\'s gone (old news)');
  const q = phone();
  for (let i = 1; i <= 7; i++) { if (i > 1) q.day(); q.story(); }
  q.day(2); q.story(); q.day(4);
  eq([q.days.streak().n, q.days.streak().held], [0, null], 'not told, and three days missed since: broken as it stands, and nothing to tell');
  q.story(); eq([q.days.streak().n, q.days.streak().held], [1, null], 'played again: a new streak, nothing to tell');
}

// ---------- the challenge ----------
{
  for (const [dir, dat] of Object.entries(datas)) {
    const pool = dat.scenarios.filter((s) => s.level >= 1 && s.level <= 2 && !s.series).map((s) => s.id);
    const a = phone(dat), b = phone(dat, at(2026, 11, 2, 9)), seen = new Set();
    let prev = null;
    for (let i = 0; i < 730; i++) {
      const x = a.days.challenge(), y = b.days.challenge();
      if (i < 3 || x.id !== y.id || x.mod !== y.mod || x.n !== y.n) eq({ ...y, played: false }, { ...x, played: false }, `${dir}: two fresh phones on ${x.day}`);
      if (!pool.includes(x.id)) fail(`${dir}: ${x.day}'s challenge ${x.id} isn't in the pool`);
      if (prev === x.id) fail(`${dir}: ${x.day} has the day before's challenge (${x.id})`);
      if (x.mod !== (x.n % 2 ? 'panic' : 'quiet')) fail(`${dir}: #${x.n} is ${x.mod}`);
      prev = x.id; seen.add(x.id); a.day(); b.day();
    }
    eq(seen.size, pool.length, `${dir}: every story in the pool comes in two years`);
    notes.push(`${dir}: pool ${pool.length}, ${seen.size} dealt over 730 days, none two days running`);
  }
  const p = phone();
  eq([p.days.challenge('2026-11-01').n, p.days.challenge('2026-11-01').mod, p.days.challenge('2026-11-02').n, p.days.challenge('2026-11-02').mod], [1, 'panic', 2, 'quiet'], '#1 on 1 November 2026, panic; #2 quiet');
  eq(p.days.challenge(), p.days.challenge('2026-11-02'), 'challenge() is today\'s');
  // played, its squares and share text
  const c = p.days.challenge(), s = data.byId[c.id];
  eq(c.played, false, 'not played yet');
  p.row({ k: 'card', kind: 'challenge', id: c.id, state: 'idle' });
  eq(p.days.challenge().played, false, 'swiped past: not played');
  const ids = [...new Set(sim.levelsOf(s).length ? (await import(path.join(ROOT, 'tools/truth.mjs'))).says(s).map((x) => x.pid || `${s.id}/${x.id}`) : [])];
  p.line({ id: ids[0] });                                   // right first time: green
  p.line({ id: ids[1], hint: 1 });                          // a hint paid: yellow
  p.line({ id: ids[2], res: 'timeout', stars: 0 }); p.line({ id: ids[2], att: 2, stars: 2 }); // a second try: yellow
  p.line({ id: ids[3], res: 'timeout', stars: 0 }); p.line({ id: ids[3], att: 2, res: 'timeout', stars: 0 }); p.line({ id: ids[3], task: 'practice' }); // missed (a practice after it isn't the line)
  p.line({ id: ids[4] || ids[0], hint: 2, free: 2 });     // help the rung gives free: still green
  p.line({ id: 'hotpot-spicy/x' });                         // another story's line: not the challenge's
  p.row({ k: 'card', kind: 'challenge', id: c.id, state: 'done', out: 'win' });
  const r = p.days.result(), sq = ids[4] ? '🟩🟨🟨🟥🟩' : '🟩🟨🟨🟥', right = ids[4] ? 4 : 3;
  eq(r?.text, `快说 #${c.n} ${s.stage} ${sq} ${right}/${sq.length / 2}`, 'the share text, exactly');
  ok(!/http|www|\.com|id=/.test(r?.text || ''), 'no link or id in the share text');
  eq(p.days.challenge().played, true, 'played once a run is finished');
  eq(p.days.streak().kept, true, 'the challenge done keeps the day');
  // a page hidden mid-challenge logs it twice: one result
  const q = phone(); const cq = q.days.challenge();
  q.line({ id: ids[0] }); q.row({ k: 'card', kind: 'challenge', id: cq.id, state: 'playing', how: 'hide', asked: 1 });
  q.line({ id: ids[1] }); q.row({ k: 'card', kind: 'challenge', id: cq.id, state: 'done', out: 'win' });
  eq(q.days.result()?.squares, '🟩🟩', 'a challenge hidden and back: one result, both lines');
  q.day(); eq(q.days.result(), null, 'the next day: no result yet');
  // left part-way (one line, then back or swiped past): not played, no result, no share text; played on from the menu,
  // the line it had keeps its square, a line left as the card was (cancelled) isn't one, and the result is the whole run's
  const w = phone(), cw = w.days.challenge();
  w.line({ id: ids[0], res: 'timeout', stars: 0 }); w.line({ id: ids[0], att: 2, stars: 2 }); w.line({ id: ids[1], res: 'cancel', stars: 0 });
  w.row({ k: 'card', kind: 'challenge', id: cw.id, state: 'playing', how: 'swipe', asked: 2 });
  eq([w.days.challenge().played, w.days.result()], [false, null], 'left part-way: not played, no result');
  eq(w.days.pending(cw.id)?.squares, '🟨', 'part-way, as it stands: the line answered (the one left as the card was isn\'t)');
  for (const id of ids) w.line({ id });
  eq(w.days.pending(cw.id)?.text, `快说 #${cw.n} ${s.stage} 🟨${'🟩'.repeat(ids.length - 1)} ${ids.length}/${ids.length}`, 'played on, before its row: the end screen\'s squares, the first line\'s kept');
  w.row({ k: 'card', kind: 'challenge', id: cw.id, state: 'done', out: 'win' });
  eq([w.days.challenge().played, w.days.result()?.text], [true, w.days.pending(cw.id)?.text], 'finished: played, and its result the end screen\'s');
  w.line({ id: ids[0], res: 'timeout', stars: 0 }); w.line({ id: 'x-other/y' }); w.row({ k: 'card', kind: 'challenge', id: cw.id, state: 'done', out: 'win', again: true });
  eq(w.days.result()?.text, w.days.pending(cw.id)?.text, 'again after it\'s finished: the result unchanged');
  ok(/🟨🟩/.test(w.days.result()?.squares || ''), 'and still the first run\'s');
}

// ---------- episodes ----------
{
  const dat = datas['review/gate/p4b-3/data'], eps = dat.scenarios.filter((s) => s.series).sort((a, b) => a.series.ep - b.series.ep);
  if (eps.length < 3) fail('p4b-3 has no three-episode series');
  else {
    const p = phone(dat);
    eq(eps.map((e) => p.days.released(e)), [true, false, false], 'only episode 1 out on a fresh phone');
    p.story(eps[0].id);
    eq(p.days.released(eps[1]), false, 'episode 2 not out the day episode 1 is finished');
    p.clock.t = at(2026, 11, 3, 3, 59); eq(p.days.released(eps[1].id), false, 'nor at 3:59 that night');
    p.clock.t = at(2026, 11, 3, 4, 0); eq(p.days.released(eps[1]), true, 'out from 4 am');
    p.story(eps[0].id); eq(p.days.released(eps[1]), true, 'a replay of episode 1 doesn\'t move it');
    eq(p.days.released(eps[2]), false, 'episode 3 waits for episode 2');
    p.story(eps[1].id); p.day(); eq(p.days.released(eps[2]), true, 'and comes the day after it');
    // a phone that finished episode 1 before P5a: from its marks
    const st = sim.memory(), now = () => at(2026, 11, 10), { marks } = store.over(st, () => at(2026, 11, 8));
    marks.done(eps[0].id, { stars: 2, outcome: 'win' });
    const old = D.createDays({ data: dat, store: st, now });
    eq(old.released(eps[1]), true, 'finished before P5a (the marks): out');
    eq(D.createDays({ data: dat, store: sim.memory(), now }).released(eps[1]), false, 'and on a phone that never played it: not out');
  }
}

// ---------- endings ----------
{
  const p = phone(), s = data.byId['airport-esim'], h = data.byId['hotpot-spicy'];
  eq(p.days.endings(s), { found: 0, of: 3, keys: [] }, 'airport-esim: 3 endings, none found');
  // (airport-esim's endings: two losses and a win)
  p.story(s.id, { out: 'lose' }); eq(p.days.endings(s).found, 0, 'a loss with two lose endings and no end named: not counted');
  p.story(s.id); eq(p.days.endings(s).found, 1, 'a win, its only win ending: found');
  p.story(s.id); eq(p.days.endings(s).found, 1, 'never counted twice');
  const ends = [];
  const walk = (l) => { for (const st of l || []) { if ('end' in st) ends.push(st); if (st.say) { walk(st.say.ok); walk(st.say.fail); walk(st.say.miss); (st.say.alts || []).forEach((a) => walk(a.then)); } } };
  walk(s.steps);
  eq(ends.map((e) => e.end).sort(), ['lose', 'lose', 'win'], 'airport-esim: two losses and a win');
  p.story(s.id, { out: 'lose', end: D.endKey(ends.find((e) => e.end === 'lose')) }); eq(p.days.endings(s).found, 2, 'a loss naming its end: found');
  p.story(s.id, { end: 'no such ending' }); eq(p.days.endings(s).found, 2, 'an end that isn\'t one of the story\'s: not counted');
  p.story(h.id); eq(p.days.endings(h), { found: 1, of: 2, keys: [D.endKey(h.steps.at(-1))] }, 'hotpot-spicy: its only win, from the outcome');
  const lv = sim.levelsOf(s).find((x) => x !== s.level);
  if (lv != null) eq(p.days.endings(tailor(s, lv)).of, 3, 'a level of a story has its endings');
  eq(D.createDays({ data, store: p.st, now: () => p.clock.t }).endings(s).found, 2, 'kept past the log (made again over the same store)');
  p.row({ k: 'card', kind: 'challenge', id: h.id, state: 'done', out: 'lose' }); eq(p.days.endings(h).found, 2, 'the challenge\'s run finds endings too');
  eq(p.days.endings(s).keys, [D.endKey(ends.find((e) => e.end === 'win')), D.endKey(ends.find((e) => e.end === 'lose'))], 'the keys found, in the order found');
}

// ---------- soon ----------
{
  const p = phone();
  eq(p.days.soon(), null, 'never asked: null');
  eq([p.days.lunar(), p.days.lunar('2027-02-07'), p.days.lunar('2030-02-03'), p.days.lunar('2030-02-04')], ['2027-02-06', '2028-01-26', '2030-02-03', null], 'the Lunar New Years');
  p.days.setSoon({ what: 'lny', day: '2027-02-06' });
  eq(p.days.soon(), { what: 'lny', day: '2027-02-06', left: 96, goal: 'family', near: false, past: false }, 'Lunar New Year: 96 days to go, family');
  p.clock.t = at(2027, 1, 7); eq([p.days.soon().left, p.days.soon().near], [30, true], '30 days out: near');
  p.clock.t = at(2027, 2, 7, 3, 0); eq([p.days.soon().left, p.days.soon().past], [0, false], 'the night of it (before 4 am): the day still');
  p.clock.t = at(2027, 2, 7, 10); eq(p.days.soon().past, true, 'the day after: past');
  p.days.went('😂'); eq([p.days.soon(), p.st.get('went')], [null, { '😂': 1 }], 'how it went: counted, and cleared');
  p.days.setSoon({ what: 'trip', day: '2027-03-01' }); eq(p.days.soon().goal, 'travel', 'a trip: travel');
  p.days.setSoon({ what: 'none' }); eq(p.days.soon(), { what: 'none', day: null, left: null, goal: null, near: false, past: false }, 'nothing coming up: asked, no day');
  p.days.went(null); eq([p.days.soon(), p.st.get('went')], [null, { '😂': 1 }], 'dismissed: nothing counted');
}

// ---------- hist ----------
{
  const st = sim.memory(), clock = { t: at(2026, 11, 2, 3, 30) }, { srs } = store.over(st, () => clock.t);
  srs.record('a', 1);
  eq(srs.get('a').hist, [['2026-11-01', 1]], 'hist: [day, stars], the day from 4 am');
  for (let i = 0; i < 10; i++) { clock.t += DAY; srs.record('a', i % 4); }
  eq(srs.get('a').hist.length, 8, 'the last 8'); eq(srs.get('a').hist.at(-1), [iso(clock.t), 1], 'the last as recorded');
  srs.record('a', 3); eq(srs.get('a').hist.at(-1), [iso(clock.t), 1], 'one a day: its lowest stars'); eq(srs.get('a').hist.length, 8, 'one a day: no new entry the same day');
  clock.t += 1000; srs.record('a', 0); eq(srs.get('a').hist.at(-1), [iso(clock.t), 0], 'one a day: a miss later that day lowers it');
  const all = st.get('srs'); all.b = { box: 2, seen: 3, best: 3, due: clock.t, last: clock.t - DAY }; st.set('srs', all);
  srs.record('b', 3); eq(srs.get('b').hist, [[iso(clock.t), 3]], 'an entry from before hist gains one');
}

// ---------- age ----------
{
  const AGES = [2, 4, 6, 9, 12, 16], want = (l) => { const i = Math.min(4, Math.floor(l)); return Math.floor(AGES[i] + (AGES[i + 1] - AGES[i]) * (l - i) + 1e-9); };
  eq([0, 1, 2, 3, 4, 5, 2.5, 4.5, 0.25].map(want), [2, 4, 6, 9, 12, 16, 7, 14, 2], 'the ages by the book');
  const st = sim.memory();
  L.init(data, { store: st, now: () => at(2026, 11, 2) });
  const out = [];
  for (const persona of ['mandarin', 'dialect', 'studied', 'new']) {
    L.init(data, { store: sim.memory(), now: () => at(2026, 11, 2) }); L.persona(persona);
    eq(L.age(), null, `${persona}: no age before placement (no lines)`);
    eq(L.age({ n: 4 }), null, `${persona}: none while placing`);
    const lv = L.level(), a = L.age({ n: 12, end: 1 });
    eq(a, { say: want(lv.say), listen: want(lv.listen) }, `${persona}: the ages of its levels`);
    for (let i = 0; i < 12; i++) L.observe({ k: 'line', id: data.phrases[i].id, att: 1, res: 'ok', stars: 3, mode: 'speak', perfect: true, assist: 2, clock: 15, ms: 4000 });
    const b = L.age();
    eq(b, { say: want(L.level().say), listen: want(L.level().listen) }, `${persona}: no placement, 12 lines: the ages`);
    out.push(`${persona} ${a.listen}/${a.say}`);
  }
  notes.push(`ages at the start (listen/say): ${out.join(', ')}`);
}

// ---------- the phone: init() over kv, events.js's rows, KS_NOW ----------
{
  for (const k of ['streak', 'ends', 'drops', 'soon', 'went', 'done', 'srs']) store.kv.del(k);
  globalThis.KS_NOW = at(2026, 11, 2, 23) - Date.now();
  D.init({ data });
  const el = (state) => ({ dataset: { state } });
  const play = (id) => { const e = el('idle'); events.cardIn(data.byId[id], e); e.dataset.state = 'done'; store.marks.done(id, { stars: 3, outcome: 'win' }); events.cardOut(e); };
  eq(D.streak().kept, false, 'the phone: nothing kept yet');
  play('hotpot-spicy');
  eq([D.streak().kept, D.streak().n, D.today()], [true, 1, '2026-11-02'], 'the phone: a story logged by events.js keeps the day');
  globalThis.KS_NOW = at(2026, 11, 4, 3, 50) - Date.now();
  eq([D.today(), D.streak().kept, D.streak().n], ['2026-11-03', false, 1], 'the phone: 3:50 two days on is the day after');
  for (let i = 0; i < 3; i++) events.line({ id: 'airport-esim/esim', att: 1, res: 'ok', stars: 3, task: 'review' });
  eq([D.streak().kept, D.streak().n], [true, 2], 'the phone: three reviews logged by events.js keep it');
  globalThis.KS_NOW = at(2026, 11, 4, 9) - Date.now();
  const c = D.challenge(), e = el('idle');
  events.cardIn({ kind: 'challenge', scn: data.byId[c.id] }, e); e.dataset.state = 'done'; events.cardOut(e);
  eq([D.challenge().played, D.streak().n], [true, 3], 'the phone: the challenge\'s row (kind challenge) played, and the day kept');
  globalThis.KS_NOW = 0;
}

const s = ((performance.now() - t0) / 1000).toFixed(1);
for (const n of notes) console.log('  ' + n);
if (problems.length) { console.log(`\n${problems.length} problems:`); for (const p of problems) console.log('  ' + p); console.log(`(${s} s)`); process.exit(1); }
console.log(`\nall good (${s} s)`);
process.exit(0);

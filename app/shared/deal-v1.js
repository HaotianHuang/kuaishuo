// v1's dealing, kept: the Mix as it dealt before the For You ranker (rank.js), mix.js's order() and more() moved here
// unchanged and DOM-free (docs/v2/p2.md). #mix?deal=v1 plays it, and tools/sim.mjs measures the ranker against it.
// Your own airport story opens it, then the formats take turns (a call, a chat, a chase, a scene), each time with its
// easiest scenario left. A scenario is followed a little later by a card to write one of its words, now and then by one
// to shadow one of its lines, and phrases you've met come back as flash crises when spaced review says they're due
// (three or more at once, as one chase).
//   dealV1({ data, srs, marks, now, runs })  data: the content (byId, phraseById); srs, marks: store.js's (or over()'s);
//                                            now: time.js's; runs: a run card can be dealt (chase.createRun exists)
//   more()        up to 3 items, as mix.js's more() dealt them: { kind: 'scn', scn } | { kind: 'review', p } |
//                 { kind: 'run', ps, audio } | { kind: 'write', item } | { kind: 'shadow', item: { scn, step } } | { kind: 'end' }
//   next()        those items one at a time, as the Mix's feed asks for them (one card ahead: as it opens, then as each card
//                 comes on screen), each batch asked for when v1's feed asked (three cards ahead: as it opened, then as the
//                 card on screen was the third from the end, and when it had nothing left to show): more() reads what's
//                 due as it's called, so asked later it would deal other cards. null: nothing to deal now
//   waiting()     what's due or below (the end card's "Review the n due ↓")
//   unsee(ids)    phrases a run never reached (caught first, left mid-run): as due as before, so the next slot deals
//                 them again (mix.js's run leave(), for a run that got going)
// tools/rank-check.mjs deals this and the code it was moved from (mix.js at 3216e80) side by side on the same play, each
// batch asked for as v1's feed asked, and holds them to the same cards; and next(), one card ahead, to the cards v1's
// feed showed.
import { linesToShadow, wordsToWrite } from './picks.js';

// Your own airport story opens. Then the formats take turns in a fixed cycle, each time with its easiest scenario left,
// one format never twice running while another still waits: a call (talking half a second after you answer), a chat
// (the one that makes you type), a chase, a scene. The office boss runs before the goose: 走开 and 别过来 are below
// someone who can already hold a conversation.
const FIRST = 'airport-esim', CYCLE = ['call', 'chat', 'chase', 'scene'], SOONER = { 'office-boss': 0.5 };
function order(scenarios, marks) {
  // reopened, the Mix deals what you haven't played yet first; finished scenes come round again after them
  const done = marks.doneAll(), first = done[FIRST] ? null : FIRST;
  const rank = (s) => SOONER[s.id] ?? s.level, queues = {};
  for (const s of [...scenarios].sort((a, b) => (done[a.id] ? 1 : 0) - (done[b.id] ? 1 : 0) || rank(a) - rank(b))) if (s.id !== first) (queues[s.format] ||= []).push(s);
  const out = scenarios.filter((s) => s.id === first), turns = [...new Set([...CYCLE, ...Object.keys(queues)])];
  for (let i = 0, last = out[0]?.format; turns.some((f) => queues[f]?.length); i++) {
    const f = turns[i % turns.length], q = queues[f];
    if (!q?.length || (f === last && turns.some((g) => g !== f && queues[g]?.length))) continue;
    out.push(q.shift()); last = f;
  }
  return out;
}

export function dealV1({ data, srs, marks, now, runs }) {
  const queue = order(data.scenarios, marks), t0 = now();
  // seen: review id → its due time when it was dealt, so it comes back once answered and due again; late: the reviews
  // dealt below the end card; written: the words dealt to write this visit; writing: the words to write again, by
  // review id (write:信号), each with the first scenario that teaches it
  const seen = new Map(), late = new Set(), written = new Set(), writes = [], shadows = [], writing = {};
  for (const s of queue) for (const w of wordsToWrite(data, s)) writing['write:' + w.word] ||= w;
  let qi = 0, n = 0, last = '', sinceReview = 0, sinceWrite = 0, sinceShadow = 0, reviewed = false, ended = false;
  const fresh = () => { const all = srs.all(); return srs.due().filter((id) => (data.phraseById[id] || writing[id]) && seen.get(id) !== all[id].due); };
  const waiting = () => { const all = srs.all(); return fresh().length + [...late].filter((id) => seen.get(id) === all[id]?.due).length; };
  const see = (id) => { seen.set(id, srs.get(id).due); if (ended) late.add(id); };
  // What's due: three or more phrases at once as one chase (when Chase can run phrases), else the first due as a flash
  // crisis, or as a word to write again, from memory.
  const review = (due) => {
    const ps = due.filter((id) => data.phraseById[id]).slice(0, 5);
    if (ps.length >= 3 && runs) { ps.forEach(see); return { kind: 'run', ps: ps.map((id) => data.phraseById[id]), audio: data.phraseById[ps[0]].audio }; }
    see(due[0]);
    return writing[due[0]] ? { kind: 'write', item: { ...writing[due[0]], again: true } } : { kind: 'review', p: data.phraseById[due[0]] };
  };
  // A pass from memory waits twenty minutes, so a short first visit would never meet a flash crisis: five cards in with
  // none, the earliest phrase met this visit comes back early (an early pass moves nothing in review; needing the
  // answer, or missing it, still counts).
  const warmup = () => { const all = srs.all(), at = now(); return Object.keys(all).filter((id) => data.phraseById[id] && all[id].last >= t0 && all[id].due > at).sort((a, b) => data.phraseById[b].zh.length - data.phraseById[a].zh.length || all[a].last - all[b].last)[0]; }; // the longest phrase met: one worth recalling
  // a word to write from a scenario played a little earlier: one not written yet this visit, nor waiting in review, and
  // with characters not written yet either where it can (牛奶 rather than 微辣, after 辣)
  const word = (s) => {
    const ws = wordsToWrite(data, s).filter((w) => !written.has(w.word) && !srs.get('write:' + w.word)), old = [...written].join('');
    return ws.find((w) => ![...w.word].some((c) => old.includes(c))) || ws[0];
  };
  const more = () => {
    const out = [], deal = (item) => { out.push(item); n++; last = item.kind; };
    while (out.length < 3) {
      const due = fresh(), spent = qi >= queue.length;
      // reviews take their turn about every third card; once the end card has closed the scenes, they don't wait
      if (due.length && (sinceReview >= 2 || ended)) { deal(review(due)); sinceReview = 0; reviewed = true; continue; }
      const warm = !reviewed && n >= 5 && warmup();
      if (warm) { see(warm); deal({ kind: 'review', p: data.phraseById[warm] }); sinceReview = 0; reviewed = true; continue; }
      // at most two of each wait their turn (the latest scenes'), and at the end they take turns, not come in a heap
      if (writes.length && (spent ? last !== 'write' || !shadows.length : sinceWrite >= 2)) {
        const w = word(writes.shift());
        if (w) { written.add(w.word); deal({ kind: 'write', item: w }); sinceWrite = 0; }
        continue;
      }
      if (shadows.length && (spent || sinceShadow >= 3)) { deal(shadows.shift()); sinceShadow = 0; continue; }
      if (!spent) {
        const s = queue[qi++], ls = linesToShadow(s);
        deal({ kind: 'scn', scn: s }); sinceReview++; sinceWrite++; sinceShadow++;
        writes.push(s);
        if (ls.length) shadows.push({ kind: 'shadow', item: { scn: s, step: ls[Math.floor(ls.length / 2)] } });
        if (writes.length > 2) writes.shift();
        if (shadows.length > 2) shadows.shift();
        continue;
      }
      // an end card closes the scenes, and closes again any reviews dealt after it (in this batch or the last), so
      // Next ↓ never leads nowhere
      if (last !== 'end') { out.push({ kind: 'end' }); ended = true; last = 'end'; }
      break; // nothing due: more comes when the next card is on screen (or the end card's button)
    }
    return out;
  };
  const unsee = (ids) => { for (const id of ids || []) if (seen.get(id) === srs.get(id)?.due) seen.delete(id); };
  // asked for place `given`, the card before it (given − 1) coming on screen: a batch as v1's feed asked for one then
  // (with nothing left to show, that card is the third from the end too)
  const dealt = [];
  let given = 0;
  const next = () => {
    if (!given || given - 1 >= dealt.length - 3) dealt.push(...more());
    return given < dealt.length ? dealt[given++] : null;
  };
  return { more, next, waiting, unsee };
}

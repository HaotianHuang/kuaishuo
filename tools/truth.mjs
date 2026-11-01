// tools/truth.mjs: the TRUE model that synthetic players answer by, kept apart from the learner model
// (app/shared/learner.js) that has to find it out (algorithm.md §6): true skills a persona's start + N(0, 0.6²), every
// line's true difficulty off its prior by N(0, 0.5²), the assists' true effects off by up to 30%, half the self-raters
// over-claiming by 0.1, one in ten answering the persona question as another persona would, a caller faster than you
// can follow harder than the lines alone (0.5 logits a level of the call's listening above your true listening: p3.md;
// the learner model doesn't know it, so calibration on calls shows what it costs); and how a story's lines
// are played by one of them, each answer drawn from the truth and logged as ask() logs it in that format (a scene's
// time-out and then its miss branch, a chat giving up after two silences, a caller's nudges and hang-up, a chaser
// closing in). tools/assist-check.mjs plays its cards with it, and tools/sim.mjs (with memory, learning and the rest of
// a session around it, through hooks that change nothing when they're left out). model-check.mjs keeps its own copy,
// written out again from algorithm.md, so that a slip in learner.js's own form shows.
//   truth(data, { rand, normal, wrong, spread, listening }) → { byId, B0, TRUE_B, load, zOf, heard(P, id), player(persona), play(P, scn, c, o) }
//   (listening: the caller's term, 0.5 a level; 0 leaves it out)
import * as L from '../app/shared/learner.js';
import * as levels from '../app/shared/levels.js';
import { phraseId } from '../app/shared/content.js';

const { SKILLS, WAYS, BETA, PERSONAS } = L;
export const σ = (z) => 1 / (1 + Math.exp(-z));
// Beyond what the persona question can say: far stronger than a Mandarin-at-home start, and answering it so. Even A0
// leaves most of today's lines easy for them, and the model takes a while to believe how good they are.
export const FLUENT = [2.6, 2.2, 2.0, 1.6, 1.4, 1.0];
export const HELP = [0, 1.2, 2.5]; // the frame, the whole answer (model-check.mjs --app)
export const SLOW = { speak: 1, self: 1, tiles: 1.3, type: 1.6 };
export const wayOf = (mode) => (mode === 'type' ? 'pinyin' : mode);
// how each player answers: with a microphone, by voice, but a chat as each beat asks; without one, say and check, a
// chat's voice message typed (chat.js) and a chase typed (chase.js)
export const CONFIGS = {
  speech: (scn, b) => (scn.format === 'chat' && b.reply ? b.reply : 'speak'),
  'no mic': (scn, b) => (scn.format === 'chat' ? (b.reply === 'tiles' ? 'tiles' : 'type') : scn.format === 'chase' ? 'type' : 'self'),
};
// a scenario's say beats, every branch, as story.js and scene.js walk them (each once)
export const says = (scn) => { const out = new Set(), walk = (l) => { for (const st of l || []) if (st.say && !out.has(st.say)) { out.add(st.say); walk(st.say.ok); walk(st.say.fail); walk(st.say.miss); (st.say.alts || []).forEach((a) => walk(a.then)); } }; walk(scn.steps); return [...out]; };
export const rowId = (scn, b) => b.pid || phraseId(scn, b.again ? { id: b.again } : b); // as chase.js logs an again encounter

export function truth(data, { rand, normal, wrong = 0.1, spread = 0.6, listening = 0.5 }) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const byId = new Map(data.phrases.map((p) => [p.id, p]));
  // A call's listening (the content's, else rank.js's guess: a level above the call's own, 3 at least), and how much
  // harder a caller that fast makes a line for this player: `listening` logits for each level it's above their true
  // listening level (θL as learner.js reads a level), never below 0
  const LISTEN = new Map(data.scenarios.map((s) => [s.id, s.listen ?? (s.format === 'call' ? Math.max(3, s.level + 1) : s.level)]));
  const heard = (P, id) => { const q = byId.get(id); return q.format === 'call' ? listening * Math.max(0, LISTEN.get(q.scn) - Math.min(5, Math.max(0, 1 + (P.th.L + 1 - Math.log(4)) / 0.67))) : 0; };
  const B0 = new Map(data.phrases.map((p) => { const f = p.f || { level: p.level, chars: (p.answers[0].match(/[一-鿿]/g) || []).length, needGroups: p.need.length, zipf: 4.5 }; return [p.id, -1 + 0.67 * (f.level - 1) + 0.1 * (f.chars - 7) + 0.3 * (f.needGroups - 1) + 0.35 * Math.max(0, 4.5 - f.zipf)]; }));
  const TRUE_B = new Map([...B0].map(([id, b]) => [id, b + 0.5 * normal()]));
  const load = (way, k, call) => { const w = WAYS[way][k] || 0; return call ? (k === 'L' ? w + 0.3 * (1 - w) : 0.7 * w) : w; };
  const zOf = (P, id, way, A) => SKILLS.reduce((z, k) => z + load(way, k, byId.get(id).format === 'call') * P.th[k], -TRUE_B.get(id) - WAYS[way].db + P.beta[A] - heard(P, id));
  const player = (persona) => ({
    persona, told: persona === 'fluent' ? 'mandarin' : rand() < wrong ? pick(Object.keys(PERSONAS).filter((p) => p !== persona)) : persona,
    th: Object.fromEntries(SKILLS.map((k, i) => [k, (PERSONAS[persona] || FLUENT)[i] + spread * normal()])), beta: BETA.map((x) => x * (1 + 0.6 * (rand() - 0.5))), over: rand() < 0.5,
  });

  // One card, played by the TRUE player P at the card's rung c ({ A, knobs, after(row) }: assist.forCard()'s, or v1's
  // A2 throughout). Each answer panel: right with p, from the rung's β and the help beyond what it gives free (the frame
  // on a second attempt, the answer on a third); the row as ask() logs it, at the rung the card is at by then. o:
  //   mode(scn, beat)                 how the player answers (CONFIGS)
  //   clock                           { t }: the calendar; each line moves it 20 s, or time(think s, clock s) says when it was
  //   emit(row)                       who hears the row (learner.observe); c.after(row) then moves the rung
  //   knobs(beat, attempt)            the line's own rung (assist.lineRung at L0), else the card's
  //   chance(P, id, way, A, help)     P(right), else σ(zOf + help) (the simulator adds memory)
  //   chars                           a typed line right in sound is right in characters too only with P(characters |
  //                                   sound) (model-check.mjs's), else pinyin only or a slip, two stars at most
  //   leave(n)                        before a line's first attempt, n lines in: true leaves the card there ('left')
  //   line(row, { att, p, right, said, moved })   each row, after the rung has heard it (moved: 'easier' | 'harder')
  // → { out: 'win' | 'lose' | 'left' | null, n: lines met }
  function play(P, scn, c, { mode, clock, emit = (row) => L.observe(row), knobs, chance, chars = false, leave, line, time } = {}) {
    const C = { start: 20, gain: 8, loss: 5, max: 25, ...scn.chase };
    let gap = C.start, silent = 0, n = 0;
    const say = (b, att) => {
      const k = knobs ? knobs(b, att) : c.knobs, m = mode(scn, b), id = phraseId(scn, b), lv = levels.of(b.level ?? scn.level), base = b.time ?? levels.patience(lv);
      const timed = (scn.format === 'scene' || scn.format === 'chat') && lv > 0 && k.clock > 0 && att < 3; // calls and chases run their own clocks
      const secs = timed ? Math.round(base * k.clock * (att === 2 ? 1.5 : 1)) : 0;
      const hint = Math.max(k.help.hint, att >= 3 ? 2 : att === 2 ? 1 : 0), free = k.help.free && hint <= k.help.hint, paid = free ? 0 : hint;
      const help = HELP[hint] - HELP[k.help.hint], p = chance ? chance(P, id, wayOf(m), k.A, help) : σ(zOf(P, id, wayOf(m), k.A) + help), u = rand(), right = u < p;
      const said = m === 'self' && P.over ? u < Math.min(1, p + 0.1) : right, think = (P.think ?? 1) * base * (0.15 + 0.7 * (1 - p)) * Math.exp(0.45 * normal()) * SLOW[m];
      const stars = Math.min(paid >= 2 ? 1 : paid ? 2 : 3, att >= 3 ? 1 : att === 2 ? 2 : 3);
      const row = { k: 'line', at: time ? time(think, secs) : (clock.t += 20e3), id: rowId(scn, b), lv, mode: m, att, hint, hear: false, tries: 0, alt: -1, clock: secs, assist: k.A, ...(free && hint ? { free: hint } : {}) };
      const ok = (o = {}) => Object.assign(row, { res: 'ok', stars, ...(m === 'self' ? { self: true } : { perfect: true }) }, o);
      let out = 'ok';
      const tried = rand() < 0.5, again = { tries: 1, stars: Math.min(stars, 2) }; // a wrong try, then (with p) right
      if (said) ok({ ms: Math.round(1000 * (secs ? Math.min(think, 0.95 * secs) : think)) });
      // a chase: the line comes back on screen (chase.js clicks Hint to the answer), read off it; with it up already (A5), another go
      else if (scn.format === 'chase') ok({ ...(k.help.hint >= 2 ? again : { hint: 2, stars: 1, free: undefined }), ms: Math.round(1000 * think) });
      else if (tried && rand() < p) ok({ ...again, ms: Math.round(1000 * (secs ? 0.8 * secs : think * 1.5)) });
      else if (scn.format === 'call') {
        // silence: each nudge another chance, then the hang-up (no rung above A3 hangs up: their patience is endless)
        let late = false;
        for (let i = 0; i < k.nudges && !late; i++) late = rand() < p / 2;
        if (late) ok({ ms: Math.round(1000 * base * 2) });
        else if (k.hangup) { Object.assign(row, { res: 'hangup', stars: 0, ms: Math.round(1000 * base * 2), ...(tried ? { tries: 1, tried } : {}) }); out = 'end'; }
        else { Object.assign(row, { res: 'skip', stars: 0, ms: 1000 * k.giveUp }); out = 'skip'; }
      } else if (secs) { Object.assign(row, { res: 'timeout', stars: 0, ms: 1000 * secs, ...(tried ? { tries: 1, tried } : {}) }); out = 'timeout'; }
      else { Object.assign(row, { res: 'skip', stars: 0, ms: 1000 * (k.giveUp || 30) }); out = 'skip'; }
      // typed and right in sound: the characters too, or pinyin only (or a slip), two stars at most (ask.js)
      if (chars && m === 'type' && row.res === 'ok' && rand() >= σ(zOf(P, id, 'chars', k.A))) Object.assign(row, rand() < 0.5 ? { pinyin: true } : { chars: 1 }, { stars: Math.min(row.stars, 2) });
      if (scn.format === 'chase') { gap += -(row.ms / 1000) * k.chaser + (said ? C.gain * (row.stars >= 3 ? 1.4 : 1) * (1 - (0.3 * gap) / C.max) : -C.loss); if (gap <= 0) { Object.assign(row, { res: 'caught', stars: 0 }); out = 'end'; } }
      if (scn.format === 'scene' && out === 'timeout' && att >= 2) out = 'miss'; // a second miss changes the story (scene.js)
      if (att === 1) silent = 0;
      if (scn.format === 'chat' && out === 'timeout' && !row.tried && ++silent >= 2) out = 'end'; // silent twice on a line: they give up on you (chat.js)
      emit(row);
      const was = c.A, moved = c.after(row) ? (c.A > was ? 'easier' : 'harder') : null;
      line?.(row, { att, p, right, said, moved });
      return out;
    };
    // story.js's run(), with a scene's miss branch
    const run = (list) => {
      for (const st of list || []) {
        if ('end' in st) return st.end;
        if (!st.say) continue;
        if (leave?.(n)) return 'left';
        n++;
        for (let att = 1; ; att++) {
          const r = say(st.say, att);
          if (r === 'end') return 'lose';
          const out = r === 'ok' || r === 'skip' ? run(st.say.ok) : r === 'miss' ? run(st.say.miss) : null;
          if (out) return out;
          if (r !== 'timeout') break;
          const f = run(st.say.fail);
          if (f) return f;
        }
      }
      return null;
    };
    return { out: run(scn.steps), n };
  }
  return { byId, B0, TRUE_B, load, zOf, heard, player, play };
}

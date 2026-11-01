// Runs a scenario's steps (CONTENT.md) through a format's own hooks, so every format shares the story logic and
// only draws it differently. hooks: { line(step), narr(step), sfx(step), say(beat, attempt) → ask() result, end(step) }
// Each hook returns a promise; the story waits for it. A `say` that times out plays its `fail` steps and comes back
// with more help (attempt 2, 3…); a branch's `end` ends the whole scenario, and so does a say hook that resolves
// { result: 'end', end: 'lose' }. Once state.signal aborts, the run asks nothing more and returns 'cancel'.
export async function run(steps, hooks, state = { stars: [], said: [] }) {
  for (const st of steps || []) {
    if (state.signal?.aborted) return 'cancel';
    hooks.step?.(st); // optional: every step as it starts (progress bars)
    if ('who' in st) await hooks.line(st);
    else if ('narr' in st) await hooks.narr(st);
    else if ('sfx' in st) await hooks.sfx(st);
    else if ('end' in st) { await hooks.end(st); return state.signal?.aborted ? 'cancel' : st.end; }
    else if ('say' in st) {
      const b = st.say;
      for (let attempt = 1; ; attempt++) {
        if (state.signal?.aborted) return 'cancel'; // stopped during a fail line: don't ask again on a card that's gone
        const r = await hooks.say(b, attempt);
        if (state.signal?.aborted || r.result === 'cancel') return 'cancel';
        if (r.result === 'end') return r.end || 'lose';   // a hook can end the scenario itself (the caller hung up)
        if (r.result === 'ok' || r.result === 'skip') {
          state.stars.push(r.stars || 0); state.said.push({ id: b.id, stars: r.stars || 0, alt: r.alt ?? -1 });
          const branch = r.alt >= 0 ? b.alts[r.alt].then : b.ok;
          const out = await run(branch, hooks, state);
          if (out) return out;
          break;
        }
        const out = await run(b.fail, hooks, state);
        if (out) return out;
      }
    }
  }
  return state.signal?.aborted ? 'cancel' : null; // stopped on the last step
}

// Stars for a finished scenario: the average over its beats, rounded down (0 to 3).
export const score = (state) => (state.stars.length ? Math.floor(state.stars.reduce((a, b) => a + b, 0) / state.stars.length) : 0);

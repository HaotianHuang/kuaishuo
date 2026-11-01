// Listening to the player, with the browser's own recogniser (Chrome sends audio to Google, Safari to Apple; nothing
// is stored by this app). Where it can't run (no support, no microphone, a claude.ai artifact frame) the answer panel
// offers tiles, typing or "say it, then check" instead.
//
// Tests and demos can stand in for a voice: set window.KS_SIM = (beat) => 'what the player says' | null (silence).
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let blocked = null, warm = false; // warm: a try this visit has reached the microphone, so Safari's prompts are behind us
const playback = () => { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {} };

export const sim = () => typeof window.KS_SIM === 'function';
export const inArtifact = () => typeof window.claude?.use === 'function' || /(^|\.)claude\.(ai|site)$|claudeusercontent/.test(location.hostname);
export const canListen = () => sim() || (!!SR && !blocked && !inArtifact() && window.isSecureContext !== false);
export const whyNot = () => sim() ? '' : blocked ? `The microphone was refused (${blocked}).` : !SR ? 'This browser has no speech recogniser.' : inArtifact() ? 'This preview frame has no microphone.' : window.isSecureContext === false ? 'Speech needs https or localhost.' : '';

// listen() → { done: Promise<{ alts: string[], error?: string }>, stop() }. alts are the recogniser's guesses, best first.
// A learner stops to think mid-line, so the microphone stays open through pauses (continuous): what it heard is put
// together piece by piece, and it ends on the player's tap, after PAUSE of quiet once they've started, or at maxMs.
const PAUSE = 2500;
export function listen({ lang = 'zh-CN', maxMs = 15000, onInterim, beat } = {}) {
  if (sim()) {
    let stop, timer;
    const done = new Promise((resolve) => {
      const said = window.KS_SIM(beat);
      const text = Array.isArray(said) ? said[0] : said;
      const f = window.KS_FAST ? 0.05 : 1;
      timer = setTimeout(() => { if (text) onInterim?.(text.slice(0, Math.ceil(text.length / 2))); }, 250 * f);
      const t2 = setTimeout(() => resolve(text ? { alts: Array.isArray(said) ? said : [said] } : { alts: [], error: 'no-speech' }), 700 * f);
      stop = () => { clearTimeout(timer); clearTimeout(t2); resolve({ alts: text ? [text] : [], error: text ? undefined : 'aborted' }); };
    });
    return { done, stop: () => stop() };
  }
  if (!canListen()) return { done: Promise.resolve({ alts: [], error: 'unavailable' }), stop() {} };
  const r = new SR();
  r.lang = lang; r.interimResults = true; r.maxAlternatives = 5; r.continuous = true;
  // pieces: each final piece's guesses, in order; quiet: the pause timer, from the last thing heard
  let pieces = [], interim = '', error, timer, guard, quiet, over = false, end;
  // the line: the best guess of every piece, then each piece's other guesses in turn among the rest (five at most)
  const lines = () => {
    if (!pieces.length) return [];
    const best = pieces.map((p) => p[0]), out = [best.join('')];
    pieces.forEach((p, i) => p.slice(1).forEach((g) => out.push([...best.slice(0, i), g, ...best.slice(i + 1)].join(''))));
    return [...new Set(out)].slice(0, 5);
  };
  // iOS's recogniser can go deaf and fire nothing more (WebKit bug 321436), so a stop (the tap, the time limit) gives it
  // 1.5 s to end on its own, then aborts it and answers with whatever it had heard
  const stop = () => { if (over || guard) return; try { r.stop(); } catch {} guard = setTimeout(() => { try { r.abort(); } catch {} end('stalled'); }, 1500); };
  const done = new Promise((resolve) => {
    // once, from onend or the guard; then speaker playback again, a real change now that the try set 'auto'
    end = (why) => {
      if (over) return;
      over = true; clearTimeout(timer); clearTimeout(guard); clearTimeout(quiet); playback();
      const all = lines(), tail = interim.trim();
      resolve(all.length || tail ? { alts: tail ? (all.length ? all.map((l) => l + tail) : [tail]) : all } : { alts: [], error: why || error || 'no-speech' });
    };
    r.onresult = (e) => {
      interim = '';
      // every final piece so far, from the whole list (Safari's can repeat an earlier piece inside a later one: one that
      // starts with all that came before stands in for it)
      const got = [];
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res.isFinal) { if (i >= e.resultIndex) interim += res[0].transcript; continue; }
        const gs = Array.from(res, (a) => a.transcript.trim()).filter(Boolean), before = got.map((p) => p[0]).join('');
        if (!gs.length) continue;
        if (before && gs[0].startsWith(before)) got.length = 0;
        got.push(gs);
      }
      pieces = got;
      onInterim?.(pieces.map((p) => p[0]).join('') + interim);
      clearTimeout(quiet); quiet = setTimeout(stop, PAUSE);
    };
    r.onerror = (e) => { error = e.error; if (e.error === 'not-allowed' || e.error === 'service-not-allowed') blocked = e.error; };
    // the time limit runs from the microphone opening: the first try of a visit waits on Safari's prompts before that
    r.onaudiostart = () => { warm = true; clearTimeout(timer); timer = setTimeout(stop, maxMs); };
    r.onend = () => end();
  });
  // The microphone leaves iOS in a quieter call mode, and setting 'playback' after it only undoes that if the type has
  // changed meanwhile (WebKit skips an unchanged one): so 'auto' for the try, set here inside the tap.
  try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch {}
  try { window.speechSynthesis?.cancel(); } catch {} // a tapped word still being read aloud is another thing that deafens it
  try { r.start(); } catch (e) { playback(); return { done: Promise.resolve({ alts: [], error: 'start-failed' }), stop() {} }; }
  if (warm) timer = setTimeout(stop, 3000); // a later try that hasn't reached the microphone in 3 s has stalled
  return { done, stop };
}

// Words for the browser's own voice (for single words tapped in a subtitle, which have no recorded clip): one on this
// device where it has one (some of Chrome's voices are online, Google's, and would send the word there; about.html)
export function sayWord(text) {
  try {
    const ss = window.speechSynthesis;
    if (!ss) return;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 0.85;
    const zh = ss.getVoices().filter((v) => /zh[-_]CN/i.test(v.lang)), v = zh.find((v) => v.localService) || zh[0];
    if (v) u.voice = v;
    ss.speak(u);
  } catch {}
}

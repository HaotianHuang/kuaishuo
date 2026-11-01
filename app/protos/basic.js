// The plain player: any scenario, any format, as a simple stage. It's the reference for how a card uses the engine
// (story.run for the logic, ask for your lines, audio.play for theirs), and #basic in tests plays every scenario.
import * as audio from '../shared/audio.js';
import { ask } from '../shared/ask.js';
import { run, score } from '../shared/story.js';
import { feed, chrome, assisted, atRung } from '../shared/feed.js';
import { zh, en, h, esc } from '../shared/text.js';
import { decoys, phraseId } from '../shared/content.js';
import { marks } from '../shared/store.js';
import { wait } from '../shared/time.js';

export function mount(root, app) {
  return feed(root, { items: app.data.scenarios, card: (el, scn, f) => assisted(el, scn, { ...app, ...f }, (c) => createCard(el, scn, c)) });
}

export function createCard(el, scn, ctx) {
  let ac = null;
  const voice = (a) => audio.play(scn.audio, a, { rate: ctx.assist?.knobs.rate }); // slower where the rung says (assist.js)
  const [c1, c2] = scn.bg || ['#2a2050', '#6b3fa0'];
  el.classList.add('ks-basic');
  el.style.background = `linear-gradient(160deg, ${c1}, ${c2})`;
  const stage = h('div', 'ks-basic-stage', `<div class="ks-basic-emoji">${esc(scn.stage || '🎬')}</div><div class="ks-basic-lines"></div>`);
  const lines = stage.querySelector('.ks-basic-lines');
  const start = h('button', 'ks-basic-start', `<b lang="zh-CN">${esc(scn.title)}</b><span>${esc(scn.setting)}</span><i>▶ Play</i>`);
  start.type = 'button'; start.dataset.testGo = '';
  el.dataset.state = 'idle';
  el.append(stage, start);
  chrome(el, scn, { replay: () => begin(), settings: () => ctx.openSettings() });

  const show = (node) => { lines.append(node); while (lines.children.length > 3) lines.firstChild.remove(); node.scrollIntoView?.({ block: 'nearest' }); };
  const hooks = (signal) => ({
    async line(st) {
      const c = scn.cast[st.who] || {};
      const b = h('div', 'ks-basic-line' + (c.phone ? ' ks-basic-phone' : ''), `<span class="ks-basic-who">${esc(c.emoji || '')} ${esc(c.name || st.who)}</span>`);
      b.append(zh(st.t), en(st.en));
      show(b);
      await voice(st.a).done;
      await wait(250, signal);
    },
    async narr(st) {
      const b = h('div', 'ks-basic-narr', esc(st.narr));
      show(b);
      await (st.a ? voice(st.a).done : wait(Math.max(1600, st.narr.length * 45), signal));
    },
    sfx: (st) => audio.sfx(st.sfx),
    say: (beat, attempt) => {
      ctx.lock(true);
      return ask(el, beat, atRung(ctx.assist, { id: phraseId(scn, beat), level: scn.level, attempt, audio: scn.audio, decoys: decoys(scn), signal, giveUpAfter: 25 })).finally(() => ctx.lock(false));
    },
    async end(st) {
      const b = h('div', 'ks-basic-narr ks-basic-end', `<b>${st.end === 'win' ? 'You made it.' : 'Oops.'}</b> ${esc(st.en)}`);
      show(b);
      if (st.a) await voice(st.a).done;
    },
  });

  async function begin() {
    ac?.abort(); audio.stopAll(); el.querySelector('.ks-ask')?.remove();
    ac = new AbortController();
    const signal = ac.signal, state = { stars: [], said: [], signal };
    start.hidden = true; lines.innerHTML = ''; el.dataset.state = 'playing';
    el.querySelector('.ks-basic-done')?.remove();
    await audio.load(scn.audio);
    const out = await run(scn.steps, hooks(signal), state);
    if (out === 'cancel' || signal.aborted) return;
    marks.done(scn.id, { stars: score(state), outcome: out || 'win' });
    el.dataset.state = 'done';
    const done = h('div', 'ks-basic-done', `<div class="ks-stars">${'★'.repeat(score(state))}<i>${'★'.repeat(3 - score(state))}</i></div><button type="button" class="ks-btn">Next ↓</button>`);
    done.querySelector('button').onclick = () => ctx.next();
    el.append(done);
  }
  start.onclick = () => { audio.unlock(); begin(); };

  return {
    enter() { if (audio.unlocked()) begin(); }, // not running(): the context may still be starting, or suspended since; each line resumes it
    leave() { ac?.abort(); audio.stopAll(); start.hidden = false; el.dataset.state = 'idle'; },
    destroy() { ac?.abort(); },
  };
}

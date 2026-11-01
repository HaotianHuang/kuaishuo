// The about card (docs/v2/p3.md): once a phone, after its first story (rank.js deals it as the visit's second card),
// what the app would like to know about you, on one card: where you heard Chinese growing up, what you'd love to do in
// Chinese, and the year you were born. Every answer is a tap and every question can be left (panel.js question(): each
// answer saved as it's tapped, so a swipe past keeps what was tapped); nothing leaves the phone but a count of each answer
// in the daily totals (tally.js). Only the questions not
// answered yet: the item's, less any answered since it was dealt (Settings, a card ahead). Done the moment it's on
// screen, like the recap, so a swipe goes on, and so does Done ↓. Settings → Your Chinese shows and changes all three.
// The later about card (P5a, docs/v2/p5.md): a phone that played before P3 is dealt it once, on a later card of a
// visit (rank.js), and it asks the countdown's question too, "Anything coming up?" (panel.js 'soon': its item.ask has
// it, last), while it's unasked.
//   aboutCard(el, item, ctx)   item: { kind: 'about', ask: ['home', 'goals', 'born', 'soon'?] }; ctx: the Mix's (next())
import { h } from '../shared/text.js';
import * as events from '../shared/events.js';
import * as days from '../shared/days.js';
import { question, unasked } from '../shared/panel.js';

const TAPS = ['Nothing to ask: all set.', 'One quick tap', 'Two quick taps', 'Three quick taps', 'Four quick taps'];

export function aboutCard(el, item, ctx) {
  const box = h('div', 'ks-about-in');
  let touched = false;
  el.classList.add('ks-about');
  el.dataset.state = 'idle';
  el.append(box);
  // drawn as it's built (a card ahead) and again as it comes on screen, until something on it has been tapped (then
  // it stays as it is: a question answered here stays up, its answer showing, to change your mind; each question drawn
  // again where it's answered in Settings meanwhile: panel.js 'ks:you'). Every answer is news to the Mix, which picks
  // the card after this one again from it (placement's first story)
  function draw() {
    const open = [...unasked(), ...(days.soon() == null ? ['soon'] : [])], qs = (item.ask || ['home', 'goals', 'born']).filter((q) => open.includes(q));
    box.innerHTML = `<div class="ks-about-head"><span class="ks-about-label">About you</span><b lang="zh-CN">认识一下！</b><span>${TAPS[qs.length]}${qs.length ? ', each one optional. Only totals ever leave.' : ''}</span></div>
      <div class="ks-about-qs"></div>
      <div class="ks-about-row"><button type="button" class="ks-btn ks-about-go">Done ↓</button></div>`;
    // a tap is noted on the card's row (which questions were answered: the log keeps counts, never the answers)
    box.querySelector('.ks-about-qs').append(...qs.map((q) => question(q, { then: (k, how) => { touched = true; if (how === 'answer' && ctx.isActive()) events.note(k); } })));
    box.querySelector('.ks-about-go').onclick = () => ctx.next();
    el.dataset.ask = qs.join(' '); // for tests: what it asked
    pages();
  }
  // More than fits (the later card's four on a short phone) is asked a page at a time: as many as fit whole, then Next ›
  // for the rest, so nothing scrolls inside a card a swipe moves
  function pages() {
    const list = box.querySelector('.ks-about-qs'), qs = [...list.children], go = box.querySelector('.ks-about-go');
    qs.forEach((q) => (q.hidden = false));
    go.textContent = 'Done ↓'; go.onclick = () => ctx.next(); delete el.dataset.page; // (all of them fit now: one page)
    for (let k = qs.length; k > 1 && list.scrollHeight > list.clientHeight + 1;) qs[--k].hidden = true;
    const rest = qs.filter((q) => q.hidden);
    if (!rest.length) return;
    go.textContent = 'Next ›'; el.dataset.page = 1;
    go.onclick = () => { qs.forEach((q) => (q.hidden = !rest.includes(q))); go.textContent = 'Done ↓'; go.onclick = () => ctx.next(); el.dataset.page = 2; list.scrollTop = 0; };
  }
  draw();
  return {
    // nothing to play: done the moment it's on screen (a swipe moves on, as from any end screen)
    enter() { if (!touched) draw(); else if (el.dataset.page !== '2') pages(); el.dataset.state = 'done'; },
    leave() {},
    destroy() {},
  };
}

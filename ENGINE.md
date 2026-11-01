# Building a 快说 format on the shared engine

Read `PLAN.md` and `CONTENT.md` first. The engine is in `app/shared/`; each version lives in `app/protos/<id>.js` and
`app/protos/<id>.css`. `app/protos/basic.js` is the plain reference player: read it whole before you start, it shows
every part of the engine in use in about 100 lines.

## Run it

```
node tools/serve.mjs                       # http://127.0.0.1:8791/ is For You (the feed the app opens on), #lab the five versions, #scene one of them (desktop Chrome: speech works on localhost)
node tools/test.mjs --only=scene           # headless run in Safari's visible viewport (390x664), simulated player; screenshots in review/test/
node tools/test.mjs --only=scene --sim=mixed --cards=3 --phones=all
node tools/test.mjs --only=scene --input=all             # speak, tiles, type, self in turn (self and tiles: how the artifact, with no microphone, answers)
~/.cache/kuaishuo/venv/bin/python -I tools/build.py --only=<id,id>   # after editing content: pinyin, glosses, voices
node tools/pack.mjs && node tools/test.mjs --dist --only=scene       # the single-file build the artifact uses
node tools/first-check.mjs [--dist]        # a new phone's first session at 375x553 (the gate's hook, the first line, the about card, the menu); screenshots in review/first/
node tools/match-check.mjs                 # the judge (match.js) on erhua typed as pinyin (yidianr, yi dian r, yidian er), and what must still fail
node tools/loops-check.mjs [--dist] [--only=day,streak,challenge,…]   # P5a's loops at 375x553, the calendar moved by KS_NOW; screenshots in review/loops/
node tools/web-app-check.mjs [--dist|--web] [--only=report,menu,startover,desk,pages,firefox]   # the web version's parts in the app, Firefox too; screenshots in review/web-app/
```

`node tools/test.mjs` must pass (no console errors, every card finishes, nothing scrolls sideways) for your version
with `--sim=right`, `--sim=mixed` and `--sim=silent`, at `--phones=all`, and with `--input=all` (the claude.ai
artifact frame has no microphone, so say-and-check and tiles are how most phone testing will answer). Read the screenshots: they are the only eyes
you have.

## What a version exports

Either `createCard(el, scenario, ctx)` plus `export const format = '<format>'` (the launcher then shows every
scenario of that format as a card in the shared vertical feed), or `mount(root, app)` (you build the feed yourself,
with `feed()` from `shared/feed.js`, e.g. to mix card types). `createCard` returns `{ enter(), leave(), destroy() }`:

- `enter()` the card is now on screen. If `audio.running()` is true (the user has tapped once), start playing; if not,
  show a start button.
- `leave()` swiped away: stop everything (abort the story, `audio.stopAll()`), reset to the start state.
- `destroy()` the card is being thrown away.

`ctx`: `{ data, openSettings(), home(), lock(on), next(), index, isActive(), assist }`. `lock(true)` stops the feed
scrolling (do it while the answer panel is up); `next()` scrolls to the next card.

`ctx.assist` (a scenario's card, made through `feed.js` `assisted()`; a flash crisis, a review run or the bonus line the
Mix's ranker dealt at a rung, through `atLines()`; null on the rest, and on those dealt without one: v1's): the card's
rung of the assist ladder (`assist.js`, docs/v2/README.md §4), `{ A, knobs, ids, after(row) }` (a card of phrases has no
`after()`: `assist.forLines()` gives the rung `startAt()` gives its lines now, and nothing it hears moves it, nor where
the next card starts), chosen as the card comes on screen and, on a story, moved by its lines as they're played. Pass every answer panel's options through
`atRung(ctx.assist, opts)` (feed.js), with `id`, `level` and `attempt` in them: it adds the rung's clock, help, echo
and prompt, and at L0 the line's own help (more the first times it's met); on a card `assisted()` was told may hold
the phone's first lines ever (For You's, `{ first: true }`), the first `assist.FIRST_LINES` (3) met on it at
`assist.FIRST_LINE` and a step down each, at least: A5 (as measured: said for you first, the answer up and free, no
clock, and 🔊 free, since it's only that again), A4 (the frame free, no clock), A3; their retries too, their rows marked
`first` (1, 2, 3). Read the knobs your format owns where you
use them, not once at the start (the rung can move mid-card): `knobs.rate` for the other characters' voices
(`audio.play`'s `rate`; never your own line), `patience`, `nudges`, `hangup`, `peekFree` and `subtitles` in a call,
`chaser` in a chase, `leniency` and `traceTwice` on a write card. Text help (pinyin, English) is set for you.

**Test contract** (tools/test.mjs drives every version this way):
- set `el.dataset.state` to `idle`, `playing` or `done` (done = the scenario is over and its end screen is up);
- give every button the player must tap to move on (start, answer the call, open the chat, play again) the attribute
  `data-test-go`, and remove or hide it once tapped;
- the answer panel from `ask()` is found by its classes (`.ks-ask`, `.ks-mic`, `.ks-next`): keep them. The test
  answers whatever the panel shows (mic, tiles, typing, say-and-check), and holds the answer clock still
  (`window.KS_PAUSE`) while it takes a screenshot.

## The engine

- `story.js` `run(steps, hooks, state)`: plays a scenario's steps. Hooks `line(step)`, `narr(step)`, `sfx(step)`,
  `say(beat, attempt)` (return the promise from `ask()`), `end(step)`. It handles ok/fail/alts branches and retries.
  `state.signal` (an AbortSignal) stops it. `score(state)` is the scenario's stars.
- `ask.js` `ask(parent, beat, opts)`: the answer panel (speak, tiles, type, say-and-check; clock; hints; verdict).
  opts: `{ id: phraseId(scn, beat), level, attempt, audio: scn.audio, decoys: decoys(scn), signal, skin, time,
  mission, cue (a few words shown big in the mission's place, e.g. `beat.cue`; the first Hint and the verdict show
  the mission), onListen(bool), mode ('speak' | 'tiles' | 'type' | 'self', used when the player's setting is auto),
  hint (start at help level 1 = frame or 2 = whole answer), free (that starting help costs no stars), clockX (×
  the clock; 0: none), echo (the model says the line first, free; a promise: once it settles, e.g. a chat's queued
  voices), log (merged into the line's row: assist, free, task),
  onMiss(verdict) (each wrong try), quick (short verdict), onVerdict(verdict, stars), giveUpAfter (seconds),
  control(api) (called at once, inside ask(), with `{ hold() → release, penalty(s), free(n) }`: hold the clock while
  you replay a line, take seconds off it, make help up to n given mid-panel free: a call's free peek) }`. Resolves `{ result: 'ok' | 'timeout' | 'skip' | 'cancel', alt, stars,
  verdict, mode, tried }` (tried: whether a timed-out player had a go at all).
  Where the phone can't listen (the claude.ai artifact), a panel opens in say-and-check (`defaultMode()` is 'self'
  on auto): say it aloud, Show me (the clock holds while you compare), then Nailed it (three stars if no Hint or
  Hear was used first), Close (two) or Missed it (a real miss: `onMiss`, a retry with help). The first panel of a
  visit says so in a two-second toast (`text.js` `toast()`). Tiles are a cloze: the line stays up with its key words
  blanked, filled from those characters plus near misses (`beat.decoys`, characters that sound the same, ones from
  the beat's other answers); two stars at most, one for a slip (拉 for 辣: the near misses are those very characters).
  Typed, a slip passes at two stars with the right character shown. Hint and Hear show what they cost (Hint −1★,
  🔊 −2★; 🔊 free on a line said for you first, the rung's `echo`, and after Show me). A wrong spoken or typed answer the judge has no reason for offers "That should count": one star, and the
  reply is kept on #phrases. Skins may restyle `.ks-fix` (a slip or homophone put right: 辣 big, 拉 struck out),
  `.ks-gold` (the words that count, on Show me) and `.ks-heard mark` (what the closest answer lacks: an added 不).
  `skin` adds the class `ks-ask--<skin>`; restyle the panel for your format in your CSS (position, colours, size),
  but keep its structure.
- `audio.js` (effects include `hangup`, a busy tone) `play(scn.audio, step.a, { rate })` → `{ done, stop, len }` (rate
  under 1 slows it, pitch kept: `stretch.js`; len: its played length in seconds; `length(clip, rate)` the same without
  playing) (`step.a` is `[start, length]` in the scenario's pack;
  every voiced step has one, every `say` and alt has `a` and `slow` for the model answer). `sfx(name)` synthesised
  effects (CONTENT.md list plus `tick`, `yes`, `no`, `listen`), `stopAll()`, `unlocked()` (what `enter()` checks), `running()` (sound is running right now: what `sfx()` checks),
  `unlock()` (inside a tap),
  `buzz(ms)` vibration.
- `tally.js`, the daily totals the real site sends (web.json's url only; never the artifact, a test or the dev server):
  counted from the rows `events.js` logs, sent to `/api/count` (functions/, D1 `kuaishuo`, schema.sql) at most every 5
  minutes and as the page goes. Keys, never rows: retention by first day (`active:`, `cohort:`), stories begun, finished,
  left and passed, lines said and missed by id, how answered, browser, device, speech, language, referrer, the about
  card's answers as counts. No id, no cookie, no time of day. `numbers.html` shows them with the admin key. About says
  what's sent; change it when this does.
- `art.js`, the pixel art (art/, copied from the art pack by `tools/art.mjs`): `of(scn)` → a promise of the story's
  art, all loaded, or null (no art for it, a failed file, the claude.ai pocket edition, which carries none: keep the
  emoji). Nothing is fetched before the page's first tap. `{ place, chase, cast: { who: sheet }, chaser, props: { emoji:
  sheet }, av: { who: url }, prop(emoji), fx(name) }`. `sprite(sheet, scale)` → `{ el, play(anim, { hold }),
  rest(anim), size(scale), flip(on) }`: one animation at a time (idle, talk, laugh, squint, shake, jump, give, cry,
  angry, faint, phone, wave, walk, run; a missing one is idle), stepped on one shared clock; `scale(width)` the
  whole-pixel size for a stage that wide; `face(url)` an avatar's `<img>`. Scenes, chases, calls and chats draw with
  it once it's in, and are their emoji selves until then.
- `text.js` `zh(step.t)` renders Chinese with pinyin per the user's setting and tappable words (glosses are
  installed globally); `en(text)` the English per setting; `h(tag, cls, html)`, `esc()`. Each word is one
  inline-block `.ks-w` (data-w, data-py, data-g), so a line wraps between words, never inside one; its reading, when
  shown, is `<ruby><span>word</span><rt>pinyin</rt></ruby>` over it. Punctuation after a word (and an opening quote
  before one) sits inside that word's box as `.ks-p` (the word gets `.ks-w-p`), so a line never starts with a comma;
  only punctuation with no word to join is a `.ks-p` child of `.ks-zh`.
- `match.js` `judge(said, beat)` if you need your own input UI; `frame(beat)` the model answer with the key words
  blanked.
- `speech.js` `canListen()`, `listen()`; `inArtifact()`; `KS_SIM` stands in for a voice in tests.
- `feed.js` `feed()` and `chrome(el, scn, { replay, settings })` for the TikTok caption and right-hand rail. A feed
  given `more()` is dealt one card ahead: the next card is asked for as this one comes on screen (after its `enter()`,
  its rung chosen) and built at once, its voices fetched a moment later. `replace(i, item)` swaps a card that hasn't come
  on screen (none of it showing, not seen, not the one Next ↓ is scrolling to) for another, in a fresh element (a card
  leaves its classes and styles on its own), and fetches its voices; `unseen(i)` says whether it would; `slot(i)` is
  `{ item, el, seen }`, `size` the cards dealt. A card's controller may have `row()`: what else its row in the log says,
  as it comes on screen (the Mix's: why it was dealt). A card built or thrown away while it isn't the one on screen
  mustn't touch the sound (no `audio.stopAll()` then: the card on screen may be talking).
- `store.js` `settings`, `srs` (spaced review), `vocab`, `marks` (liked, done).
- `time.js` `wait(ms, signal)`: use it for every pause, so tests run fast (`KS_FAST`).
- `content.js` `decoys(scn)`, `phraseId(scn, beat)`, `of(format)`.

Built steps carry `py` (pinyin string), `t` (tokens for `zh()`), `a` (audio clip); `say` beats carry `ans` (each
answer built the same way), `a`, `slow`. Scenario: `audio`, `title_py`, `secs`, and each cast member `tts`, `name_py`.

## The Mix: For You

The app opens on it: no hash is For You (`main.js`), through the sound gate, with a menu button (aria-label Menu) where a
version's back button sits: a sheet (`panel.js` `openSettings({ menu })`) with Your phrases, Your numbers and The lab
above Settings. `#lab` is the launcher (the five versions, and Back to the feed); `#mix` is the same Mix in the lab, its
back button to `#lab`, as every version's is. Back from `#phrases` or `#stats` goes where they were opened from. Opened
from For You's menu, they're laid over it: the feed is set aside (`mix.js` `aside(true)`: its card stopped where it was,
nothing logged as left, so neither the card nor the ranker's arms move; a card done is only hushed, since a call's and
a chase's `leave()` put them back to their start) and put back as it was by their Back (`aside(false)`: the card goes
on, one done at its end screen, the card after it picked again); any other route throws it away. The count beside
Your phrases (the menu's, the lab's) is the rows `#phrases` lists: a family once.

A phone's first session (docs/v2/p3.md):
- **The gate is the hook.** A phone that has never played (rank.js's reading: no line in the learner model, no srs
  entry, no story done; so a hook dealt again, the page gone under it before a line, comes with its premise again)
  sees its first card's premise over "Tap to start · sound on": the hook story's `gate` line, else main.js's own for
  airport-esim. Card 1 is that story (rank.js, `why.rule` 'hook'); its first three lines play at `FIRST_LINE` and a
  step down each (above), and straight off the gate it skips its title card (the premise was it: `app.hooked`,
  `ctx.hooked`).
- **The about card** (`app/protos/about.js`, `{ kind: 'about', ask }`, `why.rule` 'about'): once a phone, card 2,
  the questions not answered yet (`ask`, less any answered since it was dealt): where you heard Chinese growing up
  (`learner.persona()`), what you'd love to do in Chinese (`ks.goals`: a list of family, travel, read, fun; `[]` none
  chosen) and the year you were born (`ks.born`: a year, 0 rather not say), every answer a tap (`panel.js` `question()`,
  the same taps Settings → Your Chinese shows), saved as it's tapped, so a swipe past keeps them. Every answer, here or
  in Settings, is news to the Mix (`panel.js` `'ks:you'` on the window), which picks the card after the one on screen
  again from it; and a question answered elsewhere (Settings over the card) is drawn again as it now stands. A year
  tapped again is taken back (`kv.del('born')`): not asked, as before. Done as it comes on screen, like the recap. Its row is logged (kind 'about'; the answers are never logged, only that a question was
  tapped) and, like a recap's and an end card's, isn't a card played in the day's numbers.
- **The bonus line** (`{ kind: 'bonus', p }`, `why.rule` 'bonus'): `cards.js` `reviewCard(el, p, ctx, { bonus: true })`,
  a flash crisis labelled "Bonus · a level-N line", which waits for Have a go (what it is, how far up from the say
  level Settings shows, "One from 2 levels up!", its story's setting, since it comes without the story before it, and
  nothing to lose, is read before it's tried; a swipe past is a pass). Its line row is `task: 'bonus'` (a first
  meeting: the learner model counts it whole), and a skip records nothing in spaced review. Tried, it's a card played;
  passed by, not one in the day's numbers.
- **A card of phrases at a rung:** a review, a run or the bonus that carries `A` (the ranker's, where it deals them at
  a rung: rank.js `REVIEW.rung`) plays at the rung the ladder gives its lines as it comes on screen (`feed.js`
  `atLines(el, ids, ctx, make, { kind, tau, level })`: `assist.forLines()`, moving nothing, the way it's answered
  read then too), aiming at the item's `tau` as it stands then (a getter: a re-pick brings it up to date): its clock,
  help, prompt and text help, its voices' rate, a run's chaser; its rows say the rung (`assist`). One without `A` plays
  exactly as v1 did.
- **A level's own line:** a flash crisis of a `scn/beat@L` phrase is restaged in its story tailored to that level
  (`content.tailor()`), so the line comes back as it was said, at that level's clock (none at L0). `#phrases` shows a
  family (a beat and its level variants, `family`, else the id without `@L`) as one row: the line as last met, the best
  stars at any of its levels, and the levels met.

`app/protos/mix.js` deals through the ranker (`app/shared/rank.js`, docs/v2/p2.md): `createRanker(...).next()` picks
each card as the one before it comes on screen, and `again()` picks it again when that card is done (its outcome known,
and where its rung got to) and when the page comes back from hidden (the visit may be a new one), swapping it with
`replace()` if the pick changed. The ranker is told how each card would be answered (`feed.js` `answering(scn, kind)`,
the way its panels will open). Every row `events.js` logs goes to its `after(row)` (`events.on`), off when the Mix is
left; a card closed by the page going away (logged left 'hide', opened again on the way back) is held back and heard
only if the page itself goes, so the ranker neither counts that card twice nor takes the next one as seen. A story comes
as `{ kind: 'scn', scn, lv, A, tau }`: `scn` tailored to the say level `lv` (`content.tailor()`), `A` the rung the
ranker scored it at, `tau` the success it was dealt for; `assisted(el, scn, ctx, make, { tau })` still chooses the rung
played as it comes on screen, aiming at that τ (`tau` may be a function, read then: a card built ahead and picked again
since plays at its last pick's τ). `{ kind: 'recap' }` is `app/protos/recap.js`: the visit's lines
nailed, words written, phrases back tomorrow, and the next episode's cliffhanger (`series.next`) while a series is
under way, read from the log and spaced review as it's drawn (the item's own numbers are the ranker's from a card
earlier): a line nailed is one right the first time with no help beyond the rung's (learner.js `outcome()` ≥ 0.9, as
the ranker counts them; else it says the lines said), and back tomorrow is what's due by the end of tomorrow. It's done
as it comes on screen, and a swipe goes on. The swipe pill teaches the swipe on the first end screen where it covers
nothing at all.

- The ranker deals everything, its rules always kept, except where none of its cards would pass them and stories are
  left for the visit: then two rules give way, in order and said so in the why (`format*`: a story in reach of the
  last card's format; `surest*`: none in reach even at A5, the surest story). Only with no story left (R7's calls and a
  series' later episodes wait) does it deal its end card; below that, the reviews due come as the learner asks, whatever
  their chance (v1's), and "Review the n due ↓" counts exactly those.
- One visit is events.js's session: opened again inside it (back from the versions, a tab the phone reloaded), the
  ranker carries the visit on from the log (`resume`: the session's rows), so its stories stay played and its rules, τ
  and the recap's clock go on; time with the page hidden isn't time played (`back()`); back after half an hour with a
  card still up, the new visit starts with that card. Each card's row says why it was dealt: `rule`, `p` (p̄ at the rung
  `A`), `tau`, `prop` (the propensity: for weighing For You against v1 from the log later).
- `#mix?deal=v1` deals as v1 did (`app/shared/deal-v1.js`): its batches handed to the feed one card at a time
  (`next()`), each asked for when v1's feed asked for it (three cards ahead), since what's due is read as a batch is
  dealt.
- `#mix?why` (or `?deal=v1&why`) puts each pick's why along its card's foot: score, E F V N, τ, p, A, L, rule. Its
  `data-why` holds the numbers.
- `window.KS_MIX` (tests): `{ feed, dealt: [{ kind, id, fmt, lv, why, swapped }] by place, deal: 'rank' | 'v1', session() }`.
- `node tools/rank-wire-check.mjs [--dist]` checks it on screen (screenshots in `review/rank-wire/`), the cards of
  phrases at a rung, the bonus, an `@L` line restaged and a family on `#phrases` among them; `node tools/first-check.mjs
  [--dist]` a new phone's first session (`review/first/`); `test.mjs` plays `foryou` (no hash: first, so on a fresh
  phone), `mix` and `mix?deal=v1`.

## The loops (P5a)

What brings a player back, docs/v2/p5.md. The days themselves (4 am to 4 am, the streak and its freezes, the daily
challenge's pick and squares, episodes released a day apart, endings found, the countdown) are `app/shared/days.js`'s,
read only through its exports; what a player sees of them is here.

- **今日挑战** (`mix.js` `challengeItem()`, `challengeCard()`): days.js's story for the day at your say level (the nearest
  the story has, the lower on a tie), its modifier played through the assist's knobs (`feed.js` `MODS`, `withMod()`:
  panic is A0's clock, ×0.7, whatever the rung; quiet is no pinyin and no English; a setting you pinned wins). The
  ranker deals it into For You once a day (`why.rule` 'challenge'), its row is kind 'challenge' (with `out` and
  `stars`, as a story's); `#challenge` plays it alone (For You put away, its back button to the feed) or, once a run of
  it is finished, shows the result. Both doors aim it at the same τ (rank.js `CHALLENGE_TAU`, a loss's 0.92). On the card a pill by the
  back button says `今日挑战 #n · modifier`, folding to its icon and name after 3.5 s (a format's own top middle stays
  clear); done, its squares, k/m and Share go in the format's end screen above its buttons (where `endNote()` marked
  `.ks-end-at`). The squares are days.js `pending()`'s: the day's lines so far with the card's own, as its row will
  record them (then `result()`'s). Share (`panel.js` `share()`): the share sheet, else the clipboard and a toast, else
  a selected text box. The day's first finished run is the result: a run left part-way isn't played and has none, and
  `#challenge` plays it on, each line answered keeping its first square.
- **The streak** (menu head "🔥 n-day streak ❄️", the recap's label, `#stats`): days.js `streak()`, the one streak in
  the app. A freeze spent by itself is said once, as the next card comes (`mix.js` `frozen()`, then `days.told()`):
  "Your streak held: a freeze covered Monday. …", only the day the phone came back with the streak standing.
- **Episodes a day apart**: `days.released(scn)` to the ranker; the recap's teaser and every end screen (`feed.js`
  `endNote()`) say "Episode N · tomorrow" or "up next"; the Mix's end card names it.
- **Endings**: each format sets `el.dataset.end = endKey(st)` as its run reaches an end step (cleared on Again), and
  the card's row gets `end` from it (a getter on the `x` feed.js hands `events.cardIn()`, read as the row is written).
  `endNote(scn, before, el)` adds "Ending N of M found · say something else and it goes another way" where a story has
  more than one, this run's own counted.
- **Then and now** (`ask.js` `thenNow()`): a line missed (≤ 1★) on an earlier day and said at 3★ now gets "Monday:
  missed. Today: nailed." on its verdict, read from its srs `hist` before this answer is recorded; once a phrase
  (`ks.then`): a story's line or a review's (a flash crisis, a run), never a task beside a story (a call's type it back,
  a practice, a shadow, the bonus).
- **Quiet mode** (`ask.js` `quiet()`): 🤫 on any speaking panel, or Settings → Can't talk now. Kept as a time
  (`ks.quiet`) good for the visit it was set in. While it's on, panels offer tiles and typing only
  (`modesAvailable()`), open on typing if you've typed before, else tiles, never start the recogniser or the mic, and
  a chat's per-beat auto mode stands down; the ranker is told (`quiet` option: no shadowing dealt).
- **Progress**: `#situations` (`main.js` `stamps()`, recap.js `situations()`: won at 2★+ and every line at box 3 or
  more), with endings found and the ones nearly there; `#phrases` heads "N phrases · M solid" and rings each phrase's
  box in six (`ring()`); the menu's wide tile is today's challenge (played · k/m, or its modifier).
- **The recap's additions** (`recap.js` `extra()`): this visit's then-and-now, your Chinese's age (the first time,
  then a year on), the countdown or how it went, situations won and lines to lock in tomorrow, and from memory this
  week against last; each a row that gives way on a short phone (`fit()`).
- **The countdown and the age** (`panel.js`): Settings → Your Chinese asks "Anything coming up?" (Lunar New Year with
  family, a trip, a wedding or birthday, a call or visit; then when, but for Lunar New Year, whose date it knows: in a
  week, 2 weeks, a month, 3 months, on a date, or no date yet) into days.js `setSoon()`; the days left show in the
  menu head and the recap; past the day it asks how it went once (`days.went()`). Your Chinese's age is
  `learner.age()` (none while placing): "You understand like a 6-year-old and talk like a 7-year-old", with Share
  (我的中文：听力6岁，口语7岁 · 快说).
- **The about card, later**: a phone that played before P3 is asked once (rank.js `{ kind: 'about', ask, later }`),
  with "Anything coming up?"; more than fits is a page at a time (Next ›).

## The web build (P6a)

`docs/v2/web.md` is the contract: `node tools/pack.mjs --web` builds `web/` for Cloudflare Pages (the tools' side:
pack, `serve.mjs --web`, `webpage.mjs`, `web-check.mjs`, `deploy-web.mjs`, never run without the owner's OK). The
app's side:

- **web.json** (`files.js` `web()`, `owner()`): `{ name, by, contact, url }` beside the page, read once as the app
  starts, `{}` when it's missing. A packed page (the artifact: it carries `data/content.json`) carries every file it
  has, so `files.json()` doesn't fetch one it doesn't carry: the artifact has no web.json, so no contact.
- **No contact, no report**: with `contact` set, a story's end screen gets "Something sound wrong?"
  (`<a class="ks-report">`, in `feed.js` `endNote()`, which every format's end screen already calls) and For You's
  menu gets About and Send feedback (`.ks-menu-about`, `.ks-menu-feedback`). Never beside a line: the answer panel
  stays clear. Both are `mailto:` links made by `report.js` (DOM-free): `played(rows)` takes the run's line rows from
  `events.js` (back to the card before, or to the last run's end when played Again), `mailto()` writes the subject
  (the story) and the body (each line by id and text, how it went, what was heard, the browser), kept under 2,000
  characters. What was heard rides on a line's row in memory only (`events.line({ heard })`: not enumerable, never in
  `ks.log`), so the report can say it and nothing keeps it.
- **About** (`files.js` `about()`): `about.html` in the web build (its head has `<meta name="ks-build"
  content="web">`), `app/web/about.html` from the source tree (serve.mjs fills it in), none in a packed page. Linked
  from the gate (small, under the tap), the menu, and Settings (outside the menu). `app/web/about.html` and
  `app/web/404.html` are plain pages in the game's look: an inline `<style>`, no script, links from the site's root,
  `{{name}} {{by}} {{contact}} {{url}}` filled in, a line with `data-needs="<field>"` dropped when the field is empty
  (one element per line). About must stay true to the code: change it when what's kept or what leaves changes.
- **Start over** (Settings, `panel.js` `startOver()`): a sheet that says what goes (`.ks-start-over`, then
  `.ks-start-over-yes`), then `store.js` `wipe()` deletes every `ks.*` key in localStorage and sessionStorage and
  stops all writes for the rest of the page's life (a timer or `pagehide` would otherwise put the log back), and the
  page loads again with no hash: a phone that has never played. Every key the game keeps goes through `store.js`
  (`kv`), so a new one is covered; don't write localStorage directly.
- **Desktop**: the feed moves with ↓, PageDown, j and the wheel (`feed.js`): a wheel flick (its events and a
  trackpad's glide, till they pause) moves one card, from over the feed or the page beside it, not over something on
  the card that scrolls itself; keys and wheel stop only where a swipe would (ks.css's lock: the mic open, typing, a
  character being drawn). The gate says "Click to start" where `(pointer: fine)`, "Tap" on a touch screen, and the
  For You pill says "Scroll or press ↓".
- **Firefox** has no recogniser: `canListen()` is false, so panels open on say-and-check with tiles and typing a tap
  away (ask.js's NOMIC path), and the first story is won by typing (`web-app-check.mjs firefox`, over WebDriver BiDi).
- A word tapped to hear (`speech.js` `sayWord`) prefers a voice on the device (`localService`): some of Chrome's are
  Google's online ones, which about.html says.

## House rules

- Don't edit `app/shared/*`, `app/main.js`, `index.html` or another version's files. If you need an engine change,
  work around it in your own module (wrap, extend, restyle) and write the request under "Engine requests" in
  `content/formats/<format>.md`; it gets merged centrally.
- Prefix every class with `ks-<format>-`. Use the tokens in `ks.css` (`--ink`, `--paper`, `--red`, `--gold`,
  `--jade`, `--display`, `--body`, safe-area `--safe-*`); a format may add its own palette (chat can be WeChat green).
- Phone first: 360 to 430 px wide, one thumb, safe areas, text at least 16 px, Chinese lines at least 20 px.
  `prefers-reduced-motion` respected. No horizontal scroll.
- No libraries, no network calls except relative `data/` and `audio/` files and `web.json` (the artifact frame blocks
  the rest, and the web build's CSP allows nothing else).
  Emoji, CSS and inline SVG for visuals; `audio.sfx` for sound.
- TikTok pacing: no dead air. Lines follow each other quickly; the player's turn is the dramatic peak.
- Comments say why, briefly, like the engine's.

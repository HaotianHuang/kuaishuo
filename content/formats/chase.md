# The `chase` format (追)

An arcade run, one card in the feed. Something is behind you and gaining (a tiger, a goose, every aunt you have);
encounters come quickly, each one a gate, a fork, a farmer on a bridge or a question, and each needs one short phrase,
said fast. A right answer buys distance; a slow or wrong one lets the chaser close in. Caught is a funny loss; getting
through every encounter reaches the finale and its punchline. It trains speed: the same phrase comes back two or
three times a run, harder each time, until it comes out without thinking.

A chase is an ordinary scenario (CONTENT.md): the same cast, steps, `say` beats, `ok` / `fail` / `alts` and shared
fields, so the build voices and glosses it like the others. This page adds one block, `chase`, three fields on
encounters and one on a step. The four runs in `content/src/chase-*.json` use all of them.

## How a run plays

This is what `app/protos/chase.js` does; the content relies on it.

1. **The track.** The card opens on a title (the chaser, the head start, the number of encounters, the rule "It
   gains while you think. Say it to pull away.", your best) and a Run button. On a feed that's already playing it
   starts by itself, except the very first chase, which holds the title 1.5 s so the rule gets read. A 跑！ stamp
   gets 0.9 s to itself, then the track: you in front, the chaser's `emoji` behind (several emoji run as a pack),
   the stage emoji drifting past, and the gap in metres at the top, starting at `chase.start`, one dot per encounter.
2. **One clock: the lead.** The chaser never stops until the finale, and there is no other clock (no ring, no
   time-out): while people talk it gains `close` × (0.6 + 0.5 × gap / `max`) metres a second, so the further ahead
   you are the faster it comes; while you think, the full `close`, half while the recogniser listens, 0.8 with tiles
   or typing. The pressure setting scales it (relaxed 0.5, panic 1.3). It holds still only while a verdict shows.
3. **An encounter** is a `say` beat before the finale. Its `obstacle` slides in. A phrase met for the first time is
   shown big and voiced (mission, characters, pinyin by the reading setting) for the clip plus 0.6 s (1.5 s at
   least), then taken away, so it's said from memory; an `again` encounter skips that and is recorded in review
   under the first one's id. Then a 该你了！ stamp on the road and a drum, and the panel: the mission in a few huge
   words and the mic. With no microphone (the artifact) the panel opens in typing, so it's real recall. Tiles mix in
   this run's other words.
4. **Right** (any of `answers`, or one of the `alts`): the gap grows by `gain` (else `chase.gain`), times 1.4 for a
   perfect answer and 0.75 for a one-star one, and up to 75% less the closer you are to `max`. Tuned so a perfect
   four-second answer holds about 10 to 15 m and a slow one slides into the red. The verdict holds about a second
   with only the wrong characters lit; tones, what was heard and the tips wait for the end screen.
5. **A miss** (wrong words, wrong tiles, "Missed it") takes off `loss` (else `chase.loss`) at once, the chaser
   lunges, the scene's `fail` line plays over the run (啊？大点儿声！), and the whole line comes back on screen;
   answered off the screen, it scores one star. Silence costs nothing but time, and time is the chaser.
6. **Caught.** The moment the gap reaches 0, wherever that is (mid-line too), the run stops, the chaser pounces
   and `chase.caught` plays, voiced. Then 被抓了！ Caught!: how many encounters you cleared, the punchline, and the
   phrase that got you first, with its voice and tip.
7. **The finale** starts at the step marked `"finale": true`. The chaser stops for good: the gap freezes and is the
   score, nothing can catch you, and any `say` beat from here on is an ordinary scene beat (the twist usually gives
   the player a last line). The run ends at the `end: "win"` step, then 跑掉了！ Got away! over the dimmed track:
   the metres to spare, your best (kept with `marks.done(id, { best })`), every phrase you shouted with 🔊 and its
   stars, what went wrong in it ("You said 别过去", "借 is jiè, not jiē") and the whole tip under any you didn't
   nail, Run again and Next. The list shows at most three rows, the missed and lowest-scored first, and never
   scrolls, so a swipe that starts on it still moves the feed.

**For the launcher:** `order` lists the packs in feed order (the tiger first). **For the Mix:** `createRun(el, phrases, ctx)` builds the same run from phrase records (`data/content.json`
`phrases`, the ones due for review): one encounter each, a big yellow dog behind you, the same card interface as
`createCard`. Spaced review records each answer under the phrase's own id.

## Fields

### `chase`, at the top level

```jsonc
"chase": {
  "name": "老虎", "en": "a tiger",  // what's chasing you, as the card names it
  "emoji": "🐅",                    // drawn behind you on the track
  "who": "tiger",                   // optional: the cast key of the chaser, when it speaks (its voice, its lines)
  "start": 20,                      // head start, metres
  "close": 1,                       // metres the chaser gains per second while you think (0.6 of it while people talk)
  "gain": 8,                        // metres a right answer buys (an encounter can set its own)
  "loss": 5,                        // metres a wrong answer or a time-out costs, on top of the seconds it took
  "max": 25,                        // the gap never grows past this (about start + 5), so the chaser stays close
  "caught": [                       // the funny loss: ordinary steps, voiced and checked like `steps`
    { "who": "tiger", "zh": "请问，庙会往哪边走？", "en": "Excuse me, which way to the temple fair?" },
    { "end": "lose", "en": "Caught, by a tiger that only wanted directions." }
  ]
}
```

A rough balance, with these numbers: talk between encounters costs about 3 m, a look at a new line 1.5 m, a
four-second answer 3 to 4 m; a perfect answer at 12 m buys back about 8.5, a two-star one about 6. So a quick,
clean player hovers around 10 to 15 m, a slow one drifts into the red, and a time-out (the clock plus `loss`) or two
misses in a row is usually the end.

### On an encounter (a `say` beat before the finale)

```jsonc
{ "say": { "id": "gate2", "again": "gate", "obstacle": "🏮", "gain": 10, "time": 7,
  "en": "Bang on the gate: let me in!", "answers": ["快开门！让我进去！", "..."], "need": [["开门"]], ... } }
```

- `obstacle`: one emoji for what's in your way or who you're shouting at (🚪 a gate, 🔀 a fork, 🌉 a farmer on a
  bridge, 🚲 a stranger with a bike). Every encounter has one.
- `again` (optional): the `id` of an earlier encounter whose phrase this one drills again, harder: a shorter clock,
  a longer line, a second word to get right. The build gives it no help up front (no model answer under the mission,
  no 🔊 Hear it): the player has said it before, so it comes from memory. Help comes back after a miss as usual.
- `gain`, `loss` (optional): this encounter's own values, for one that is harder or more dramatic than the rest.

### On a step

- `"finale": true`: on exactly one top-level step in `steps`, after the last encounter. Everything from that step on
  is the finale.

## Writing notes

- 6 encounters (one or two of them `again`), then a finale of a few steps: the twist, a last line for the
  player, the punchline, `end: "win"`. A run is about a minute and a half; more and it turns rote.
- Obstacles are things (a gate, a log, a signpost), not icons that look like buttons (🔀, 📶, 📤).
- Mission `en` of a few words ("Shout for help!", "Dodge: no rush!"). Model answers of 2 to 8 characters, the shout
  a native would really use. `time` 6 to 10 seconds; the finale's beat can have 10.
- Between encounters, one short caption and at most one short line. The chaser's lines are shorter still: a roar,
  a honk, 报告呢？
- `fail` steps must still make sense when the encounter comes straight back: someone who didn't hear (啊？大点儿声！),
  the chaser getting closer, never a door that has closed for good.
- `need` stays lenient, and leans on words the recogniser writes the same way every time: 分钟 rather than 五分钟
  (it may write 5分钟), 报警 rather than 幺幺零 (110).
- `node tools/validate.mjs` checks everything shared, `chase.caught` included.
- Emoji face left on most phones; the build flips the chaser and you to run right, so pick a chaser that reads
  either way. An obstacle shouldn't be the chaser's own emoji (it would look like a second one ahead of you).

## Engine requests

Most of round one's landed (`hint`, `onMiss`, `onVerdict`, `quick`, `KS_PAUSE`); chase uses them. What's left:

- **Show the answer after a miss.** Chase clicks ask's (hidden) Hint button twice on a miss, so the whole line
  comes back and an answer read off it scores one star. A `hintOnMiss: 2` option, or a method on the panel, would
  say it directly.
- **Tile misses.** A wrong set of tiles marks the panel `.ks-shake` without calling `onMiss`, so chase still counts
  misses by watching that class. `onMiss` for tiles too would let the observer go.
- **Verdict length.** Chase clicks Continue itself after a second (`quick` waits for the tip's length, which the
  chase skin hides). A `quick` that ignores hidden notes, or `verdictMs`, would do.

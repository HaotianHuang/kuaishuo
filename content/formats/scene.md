# Scene cards: extra fields

Scenes use everything in `CONTENT.md`, plus these optional fields. An engine that doesn't know them still plays every
scene correctly, only with less polish. `app/protos/scene.js` stages all of them.

## `cue` and `miss` on a `say`: a prompt, and stakes

```jsonc
{ "say": { "id": "ordered", "en": "Tell her what you ordered was mild, not extra hot.", "cue": "Not what you ordered!",
  "fail": [ /* first miss: a mild reaction, then the beat comes back with a hint */ ],
  "miss": [ { "who": "waiter", "zh": "特辣就特辣嘛，吃吧！", "en": "..." }, { "end": "lose", "en": "...", "zh": "..." } ] } }
```

- `cue`: 2 to 4 words of English, the situation rather than the sentence ("He thinks you're a scammer."), shown in place
  of the mission. Hint reveals `en`. Widen `need` where a cue invites paraphrase (这不是我点的！ for "Not what you ordered!").
- `miss`: what happens on the second miss. There's no third try, and the line is never said for you: these steps play
  and the story goes on without your line, or ends if they end it. Write them to rejoin the steps after the beat, as
  `alts` do. Give each scene at least one funny `{ "end": "lose" }` here. A beat without `miss` simply moves on.
- At most one narration (12 words or fewer, about 3 s) before the first `say`, so the player is talking within about
  7 s. Put place and time in `setting`, which the title card shows. (A rule worth adding to CONTENT.md.)

## `prop`: the thing on the stage

```jsonc
{ "who": "waiter", "zh": "牛奶没有，给你拿瓶豆奶！", "en": "No milk, but I'll grab you a soy milk!", "fx": "give", "prop": "🥛" }
```

- One emoji for the object the story is about right now: what's served, handed over, snatched or worn (🥛 🔑 🍌 👜 🧧).
- Goes on a line, `narr`, `sfx` or `end` step, never a `say`. It appears with that step and stays on the stage until a
  later step sets another `prop`; `"prop": ""` clears it. One prop at a time.
- With `fx: "give"` on the same line, the prop passes from the speaker to you.
- The backdrop is still `stage` and people are still their cast `emoji`: a prop is only ever a thing.

## `hold`: a beat before the punchline

```jsonc
{ "who": "guard", "zh": "五号楼八零二，收货人……", "en": "Building Five, 802. Recipient...", "hold": 1 }
```

- Seconds (0.5 to 3) of stillness after this step finishes, before the next one starts.
- Goes on any step but a `say`. Once or twice a scene at most, where comic timing needs it; ordinary pacing is the
  engine's job.

## `arrive`: someone walks on without a word

```jsonc
{ "narr": "A ranger with a bamboo pole is strolling down the steps.", "zh": "……", "arrive": "ranger" }
{ "who": "mum", "zh": "哎呀，来啦！快进来快进来！", "en": "...", "fx": "enter", "arrive": "dad" }
```

- A cast key (or a list of them): they appear on the stage with this step, without speaking. On a line, they arrive
  after the speaker, so the speaker keeps their place.
- Use it when the player is about to address someone who hasn't spoken yet (the narration just introduced them, or a
  `say` greets two people), so whoever you're talking to is on stage when the picture freezes.
- People who speak walk on by themselves; `fx: "leave"` walks them off.

## `typed` on a mistake: slips that only show in writing

```jsonc
"mistakes": [ { "heard": ["在来一碗"], "typed": true, "note": "One more is 再 zài (again), not 在 zài (at)..." } ]
```

- `true` when the slip sounds exactly like a right answer (在 for 再, 的 for 得), so it can only turn up in a typed
  or tile answer.
- Check a `typed` mistake against typed and tile answers only, never against speech: there it would fire on everyone
  who said the line right.
- Nothing scene-specific about it; any format with typed answers can use it.

## Writing notes

- An `alts[].then` rejoins the main line at the next step, as `ok` does, so the steps after a branched beat must make
  sense from every branch. In `scene-locked-out`, both ways of proving you live there end with the guard holding your
  takeaway slip, which is what the next line reads out.
- A `mistakes[].heard` must never appear inside one of that beat's right answers (by sound, too), or its note fires on
  correct answers. 不要 can't be a mistake for 不要了, for example.
- At the freeze, the scene shows the last thing someone said to you above the answer panel, but not narration (the
  mission carries that). So the line just before a `say` should be the prompt, spoken by the person you answer.

## How the Scenes version plays a card

- Title card (two seconds, tap to skip), then the stage: the `stage` emoji as a drifting backdrop, the cast as big
  emoji who walk on when they first speak (or `arrive`), glow while talking, and show their `fx` (plus a manga symbol
  over the head: 🤨 squint, 😂 laugh, 💢 angry…). Callers (`phone: true`) are a call bubble at the top, not a body.
- Lines are subtitles that light up word by word with the voice; the line before fades to one row; nothing older.
  Narration is a centred caption between cinema bars. Every `sfx` is also a comic-book word on screen (砰！叮咚！).
- A `say` freezes the picture: the camera pushes in on whoever spoke last and lifts them clear of the panel, the
  stamp 该你了！ lands up top, the panel (`skin: 'scene'`, with the `cue`) rises. ↻ on the line you're answering plays
  it again (the first time the clock waits). What you said then appears as your line, and the story reacts at once.
  A miss draws a ❓ from whoever was waiting if you said nothing, then their `fail` line; a second miss plays `miss`.
- Narration's Chinese leads; its English is blurred on 'tap' like any translation, except the scene's first caption.
- A wrong try gets a reaction: whoever says the beat's first `fail` line reacts and says it, the clock held. On a short
  phone, a tall panel (an or-branch, tiles) leaves the line you answer one row, with its ↻.
- The end screen: 完美！/过关！/勉强过关, or 差一点！ on a `lose`, then at most three of your lines, never scrolling (a
  swipe on them moves the feed): missed ones first with the model answer, 🔊 and tip, then the fewest stars; each row
  shows the line's meaning (`gloss`).
- `order` (exported) opens the feed on airport-esim, the fastest to its first line. With `ctx.typeOne` (the Mix, no
  microphone), the first top-level beat whose blanks come to 2 to 4 characters is typed, with double the time.

## Engine requests

1. Build: per-word timings for each voiced line, so karaoke highlighting is exact (scene.js estimates each word's moment
   from its share of the characters).
2. Delivered, thank you: `step`, `cue`, `tried`, `control` (the ↻ replay now holds and costs time through it), `onMiss`.

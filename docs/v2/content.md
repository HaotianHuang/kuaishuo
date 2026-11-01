<!-- A planner's design for volume 2 (Content, levels and build order), 30 Oct 2026. The plan in README.md wins where they differ. -->

# 快说 v2: content, levels and build order

## 1. Levels

Every card has two dials:
- **Say** is the player's line. Its level is set per beat, by the variant chosen.
- **Listen** is everyone else's lines. The recordings fix it; subtitles, English and slow replay move it by about one level.

Pinyin only changes the display.

| L | HSK 2.0 / CEFR (approx.) | Your line | The story | NPC speed | Help, clock |
|---|---|---|---|---|---|
| 0 | pre-1 / pre-A1 | 1–4 chars, one chunk (多少钱？) | ≤8 chars a line, ≤10 lines, English on | 0.85× (3.3 chars/s) | Model line plays first, free. Next meeting: the frame, free. Then nothing. No clock, alts hidden |
| 1 | 1–2 / A1 | 3–6 chars, a set phrase (不要香菜) | ≤12 chars | 1.0× (3.7) | Frame free the first time; 18 s |
| 2 | 2–3 / A2 | 5–10 chars, 1–2 need groups, one pattern (能…吗) | ≤15 chars | 1.0× (3.9) | Paid hints; 15 s |
| 3 | 3–4 / B1 | 6–12 chars, 2 groups; deflect, soften or refuse (到时候再说吧) | ≤20 chars, several speakers | 1.0–1.1× | 12 s |
| 4 | 4–5 / B2 | 8–14 chars, 2–3 groups; persuasion, 俗语 | Monologues, English off | 1.15× (4.5) | 10 s; tiles only after a Hint |
| 5 | 6 / C1 | 12–20 chars, 3 groups; register (a toast, a formal refusal, comforting someone) | Native pace, crosstalk | 1.25× (4.9) | 8 s; speak or type only |

- This table becomes `app/shared/levels.js`.
- It replaces four copies of `[18,15,12,10]`, all indexed `level-1`: ask.js:29, call.js:30, scene.js:316, cards.js:113.
- **Level 0 is falsy in JavaScript.** `opts.level || 2` (ask.js:75) and `p.level ||` (chase.js:436, 439) must become `??`, or L0 plays as L2.

**Where v1 sits, measured from data/content.json** (answer length, need groups, NPC characters, characters per second):

| Say level | v1 scenarios |
|---|---|
| L1 | farm-goose, village-tiger, office-boss, hotpot-spicy |
| L2 | the five calls, locked-out, emei-monkey, flat-flood, late-boss, new-year-dodge |
| L3 | airport-esim, taxi-airport, first-date, family-group |
| L4 | meet-parents, rent-rise |

- **Listening** is L2 almost everywhere, with two exceptions:
  - The calls are L3, because subtitles are hidden. mum-calling (284 characters, 4 fast lines) is close to L4.
  - farm-goose is L1.
- **Speed:** every line is voiced at 3.6–4.3 characters a second. Natural speech is about 5.
- **Gaps:**
  - no L0, only two L4s, no L5;
  - nothing at native speed;
  - nothing set outside China.

**Heritage learners.** They understand fast kitchen Mandarin but say and read far less, so they start at listen 3, say 1, read 0. A variant keeps its scenario's NPC audio: mum-calling still nags at full speed while the player says L1 lines (吃了吃了). New heritage stories are written listen-first, with fast relatives and short replies that carry the culture (嗯嗯, 没有啦, 我尽量).

## 2. Variants

**Per-beat levels are the default.** Only the player's side changes. NPC lines, `ok`/`fail`/`miss`/`alts` and their audio stay as they are.

```jsonc
"say": { "id": "borrow", "answers": ["大叔，能借您的手机打个电话吗？", …], "need": [["借","用"],["手机","电话"]], "time": 15,
  "levels": {
    "0": { "answers": ["借我用一下？", "借一下手机？"], "need": [["借"]], "gloss": "Can I borrow it a sec?", "time": 20 },
    "4": { "answers": ["大叔，能借您手机打个电话吗？我卡没信号了。"], "need": [["借","用"],["手机","电话"],["信号","网"]], "time": 10 } } }
```

- **What an override can change:** answers, need, not, mistakes, gloss, tip, cue, key, time, hint/free, mode, and which alts show.
- **Audio cost:** build.py's `visit()` already voices any nested `answers[0]` into the scenario's pack.
  - About 27 KB per override in the artifact, or 12 KB if the slow version is made on the phone.
  - A new scenario costs about 0.6 MB.
- **Ids:**
  - Base beats keep `scn/beat`, so v1 progress survives. Never rename one.
  - Overrides are `scn/beat@0`, carrying `family` and `lv`.
  - Once a variant reaches box 3 or higher, review serves the next level up: the same moment, a harder line.
- **At runtime:**
  - `content.tailor(scn, pick)` merges each beat with its chosen override and sets `pid`.
  - `phraseId()` returns `beat.pid` when it's there (chase.js:225 already does this).
  - No format code changes. cards.js filters phrases to the level played.
- **Checks:**
  - Every override passes its own `need`.
  - The base answers pass every easier level.
  - A warning when an easier line passes a harder level.
  - The editor confirms the NPC's reply still follows each variant.

**Cuts, for L0 only.** `{"id": "airport-esim-first", "parent": "airport-esim", "level": 0, "keep": [0,1,2,7,8]}` builds a shorter story from the parent's steps and clips, with no new audio.

## 3. New content: 40 more scenarios, 60 in all

**Heritage (家), 22 scenarios.**

**回老家 Back Home**, a series of 8 episodes, L2→L5. Recurring characters: 奶奶, 大姑, 表哥, 二姨.
1. 表哥's non-stop airport pickup (a call).
2. "你中文好可爱！": you answer with a joke.
3. Explaining your job to 大姑.
4. 二姨's blind-date ambush.
5. 奶奶 in hospital: questions for the doctor (L4).
6. The 80th-birthday toast (L5).
7. The family group chat explodes.
8. Airport security finds the 腊肠.

Each episode's `next` field is a cliffhanger, for example "二姨 has already sent your photo to someone's mother."

**Standalone heritage scenarios:**
- Grandma's video call, phone held to her ear (外婆，看屏幕！)
- Mum's 60-second voice notes
- Refusing a red packet twice, then accepting it
- The fight to pay the bill (这顿我来！)
- The wedding door game, 堵门 (a chase)
- Interpreting for Dad at the bank
- Grandpa insisting he's fine
- A Cantonese-speaking family: you say 雪柜 and learn 冰箱. The audio is Mandarin only; the slip is a `mistakes` entry.
- A Toronto auntie asking why your Chinese went backwards

**New learners (路), 18 scenarios.**

**新来的 The New Hire**, a series of 6 episodes, L0→L3:
1. You say two words and the office applauds (哪里哪里).
2. Lunch on the delivery app.
3. Lost on the metro.
4. Escaping KTV (a chase).
5. The dating app.
6. The boss messaging at 11 pm.

**Standalones:**
- **L0:** bubble tea (少糖，去冰), haggling, a QR code that won't scan, a toilet emergency (a chase), a breakfast stall, taxi basics.
- **L5:** a job interview, a business dinner (以茶代酒), a vlogger asking about 内卷, a row over a renovation.

**Style rules, to add to CONTENT.md:**
- Relatives pry because they care, and every scene ends warm.
- Nobody mocks an accent or anyone's identity. "Your Chinese is cute" gets a comeback.
- China is ordinary and modern.
- Dating stays gender-neutral (对象).
- Settings span the diaspora.
- No politics, no religion.

**Volume targets:**

| | Scene | Chase | Chat | Call | All (new) |
|---|---|---|---|---|---|
| L0 | 3 | 3 | 1 | 1 | 8 (8) |
| L1 | 3 | 4 | 1 | 2 | 10 (6) |
| L2 | 4 | 3 | 4 | 5 | 16 (6) |
| L3 | 4 | 2 | 4 | 2 | 12 (8) |
| L4 | 2 | 0 | 3 | 3 | 8 (6) |
| L5 | 2 | 0 | 2 | 2 | 6 (6) |
| All | 18 | 12 | 15 | 15 | 60 (40) |

Every scenario also gets say-variants one level up and one down.

**Why this is enough for a ranker:**
- A session is about 6 stories, and a ranker needs at least 3 real choices for each slot.
- With variants, a learner at L1–L4 has 30–40 playable story-levels. At L2 that's 16 + 10 up-variants + 12 down-variants = 38. L0 and L5 have about 18 each.
- That's a week of daily play before anything repeats, and reviews, level-up replays and a weekly drop of 8–10 stretch it further.
- On 60 items the ranker's job is matching and ordering, not discovery.

## 4. The content factory

**Pipeline, one batch of about 10 scenarios, overnight:**
1. **Brief.** `content/briefs/<batch>.md`, approved by you: id, format, say and listen levels, audience, topic, series, premise, intents, twist.
2. **Draft.** Four Claude agents, one per format. Each writes only its own new files, with variants one level up and down.
3. **Check.** `validate.mjs`, then `judge-check.mjs` over every override.
4. **Edit.** An editor agent checks:
   - naturalness, register and calques;
   - that the line fits its level;
   - that each NPC reply still follows;
   - the style rules.

   In v1 the editor made about 3 fixes per scenario.
5. **Hook.** A judge agent scores `hook` from 1 to 5: stakes by second 5, absurdity, relatability.
6. **Voice.** `build.py --only=… --qa`. Kokoro takes about 1 s per clip (around 45 per scenario, around 10 per variant set); the two recognisers take about 2.3 s per clip. One new rule: a model-answer clip that both recognisers doubt fails the batch, because it's the line people imitate.
7. **Play.** `test.mjs --only=mix --nomic --level=…`
8. **Human gate.** `review/gate/<batch>.md`, with `#play?id=…&lv=…` links (a new route), about 6 minutes per scenario. Approving sets `"status": "live"`; drafts never ship.

`tools/factory.mjs` runs steps 3, 6 and 7.

**Throughput and cost:**
- A batch takes 3–4 agent-hours plus 1 hour of a person's time, so the 40 new scenarios are 4 batches.
- No cash cost (local voices, the Claude plan), plus a native reviewer if you approve one.

**Schema additions:**
- **Scenario:**
  - `level`: 0–5; v1's values don't change.
  - `listen`: computed unless set.
  - `topics`: a closed list.
  - `audience`: `heritage` or `new`.
  - `series`: `{id, ep, next}`.
  - `hook`, `status`, `region`.
- **Beat:** `levels`. The build writes `lv` onto each beat and override.

**build.py changes:**
- `phrases()` and the keys loop (:611) include overrides.
- `lv` (say difficulty) comes from Han characters, need groups, the rarest need word's jieba frequency, CC-CEDICT's "(idiom)" tag and clauses, fitted to v1's levels.
- `listen` comes from NPC characters, characters per second and hidden subtitles.
- Both go into `review/levels.md`.
- `assign()` must pick voices by `series.id/key`. Today it hashes `scn.id/key` with crc32, which would give 奶奶 a different voice in every episode.
- `strokes()` covers only `write` words, and drafts are skipped.

**validate.mjs changes:**
- Levels 0–5 (:31), plus the override checks.
- Per-level warnings: answers of at most 4/6/10/12/14/20 characters and 1/1/2/2/3/3 need groups.
- The closed topic and audience lists.
- Within a series, a cast key keeps its name, voice and emoji, and episodes are numbered without gaps.
- Chase `again` pairs carry the same levels.

**Audio budget.** The artifact is at 12.93 MiB of its 15.5 MiB stop, which leaves room for about 4 more scenarios.

| Lever | Frees |
|---|---|
| Make slow clips on the phone with a ~60-line WSOLA stretch (new `app/shared/stretch.js`, the same method as ffmpeg's atempo) instead of storing 130 of them (368 s). Slow replay of NPC lines then comes free. | 1.9 MiB |
| Artifact voices at 24 kbps instead of 32 (try HE-AAC), with the recognisers re-run on the packed audio | 2.3 MiB |
| Derive `phrases` in `content.load()` instead of shipping it (191 KB); strokes only for `write` words (76 of 269 characters) | 0.6 MiB |

- **What fits:**
  - The levers free about 7.4 MiB.
  - That holds v1's variants (about 2 MiB) plus about 11 new scenarios with variants: about 31 scenarios in all.
- **Why 60+ won't fit:**
  - No codec Safari reliably decodes gets 60+ into one page.
  - They need audio packs served one card at a time, which files.js and audio.js already fetch.
- **So:**
  - The artifact becomes a pocket edition: `pocket.json` lists at most 32 scenarios and rotates each release.
  - The full catalog runs today from `serve.mjs --lan`, or later from a login-protected host if you approve it.

## 5. Build order

**P1: events, learner model, assist ladder.** Pay off the test debt first.
- **Build:**
  - A `--nomic` mode in test.mjs: hide SpeechRecognition before the page loads and leave KS_SIM unset. ask.js:108 and :318 and cards.js:281 also check `KS_SAY`.
  - A `KS_NOW` clock offset in time.js and store.js.
  - New modules:
    - `levels.js`;
    - `events.js`, a capped `ks.ev` log with daily rollups;
    - `learner.js`, with say, listen and read estimates.
  - A new `ask()` option, `echo`, that plays the model line first.
  - Hooks in ask.js (settle), feed.js (activate and leave), story.js (end) and text.js (gloss taps).
  - `tailor()`.
- **Done when:**
  - The no-mic test matrix passes. That is the claude.ai path, which no test exercises today: say-and-check as the default, the no-mic toast, one typed line per scenario, typed chats and chases, flash cards.
  - Every answer panel logs exactly one event: {pid, lv, mode, hint, heard, tries, ms, stars, result}.
  - L0 help steps down with srs `seen`.
- **You see:** a "Your Chinese" panel in Settings, and L0–L5 badges on cards.

**P2: the ranker and simulated learners.**
- **Build:**
  - `rank.js`, with no DOM code. It replaces mix.js `order()` and the priority list in `more()`.
  - `tools/sim.mjs`: five simulated learners over 14 simulated days.
- **Done when:**
  - Every simulated learner gets 70–85% of lines right.
  - No format comes three times in a row.
  - Reviews never starve.
  - A new learner meets no listen-L3 call in their first 3 sessions.
  - `#mix?why` explains each pick.

**P3: placement and two tracks.**
- **Build:**
  - Two buttons: "My family speaks Chinese" and "I'm new to Chinese".
  - The first two cards do the placing:
    - airport-esim steps up or down through its own variants;
    - courier-crabs' peeks and replays measure listening.
- **Done when:**
  - At least 90% of simulated learners are placed within one level.
  - A player who skips placement is placed correctly within 10 lines.
  - The first line still comes within about 8 seconds.

**P4: content.** Runs from day 1, in parallel, touching only content/ and tools/.
- **Stages:**
  - P4a: schema and tools.
  - P4b: 8 L0 scenarios, L0 variants for 10 v1 scenarios, Back Home episodes 1–3.
  - P4c: variants for all of v1, the L4 and L5 batches, the audio levers, pocket.json.
  - P4d: finish the series.
- **Done when:**
  - validate and judge-check report 0 errors.
  - No model-answer clip is doubted by both recognisers.
  - Every batch has passed the human gate.
  - The pocket edition is 15.0 MiB or less.
  - levels.md agrees with the declared level within one, for at least 90% of beats.
- **You see:** stories at every level, and "Episode 2 →" on end cards.

**P5: economy and mock rewarded ads.**
- **Build:** `economy.js`, and `app/protos/ad.js`, a 15-second placeholder labelled as an ad, with no network. It offers three things:
  - save a lost scene;
  - replay the other choice;
  - keep playing past the daily run.
- **Done when:**
  - An ad never interrupts an answer.
  - Ads take at most 15% of session time in the simulations.
  - Every offer is logged.

**P6: public PWA, analytics, native shell.** Each step needs your OK.
1. Add a doctype, charset and viewport to index.html.
2. Add a manifest and a service worker that caches packs already played.
3. Add analytics that send daily totals only, as freelearninggame does with D1.
4. Then wrap it with Capacitor, budgeting for a native speech plugin, since app web views may not offer speech recognition.

**What runs in parallel:**
- P4 runs beside everything.
- sim.mjs is written against P1's interface doc.
- ad.js runs beside P2 and P3.
- stretch.js runs beside P1.
- Only one agent at a time edits ask.js, feed.js, mix.js or audio.js.

**Tests to add:**
- `--nomic`.
- KS_NOW day jumps.
- `--level` and `--track` options.
- Event checks on every card.
- sim.mjs and the judge-check over overrides in the gate.
- Per-scenario sizes in pack.mjs, with a warning at 14.5 MiB.
- A WebKit smoke test with Playwright (a new dev dependency), and an iPhone checklist each release.

**Risks:**
- **The artifact's size ceiling.**
- **Levels on one phone come from heuristics and a single learner.** A server-fitted `data/calib.json` can override `lv` later.
- **NPC replies that no longer fit a variant line.**
- **Kokoro may garble at 1.25×.** If so, speed up normal-speed speech with atempo, the way slow lines are stretched now.
- **Stereotypes creeping in as volume grows.**
- **Safari's ~5 MB localStorage limit.**
- **HE-AAC decoder delay shifting clip starts.** The 0.3 s gaps absorb about 50 ms; test it.

**Decisions for you (with my recommendation):**
1. Login-protected hosting for the full catalog: yes, before P4c.
2. A paid native-speaker reviewer, about 1 hour per 10 scenarios: yes.
3. ElevenLabs for the model answers: not yet; re-run `--estimate` after P4c.
4. A public PWA with analytics: after P5.
5. Ad-network and app-store accounts: stay on mock ads until day-7 retention justifies them.
6. Recording real Cantonese audio: no.

### Critical Files for Implementation
- tools/build.py
- tools/validate.mjs
- app/shared/content.js
- app/shared/ask.js
- app/protos/mix.js

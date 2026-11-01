<!-- Three read-only explorers' facts about v1 (feed and signals, difficulty, platform), 30 Oct 2026, with file:line references as of commit 3cf3d27. -->

# feed

**Root:** `app/`. The short names below are files under it: mix/scene/call/chat/chase/cards/basic.js are in `protos/`, and feed/store/ask/story/text/content.js and ks.css are in `shared/`.

## Mix ordering: app/protos/mix.js
- `order()` (26-38) runs once per mount (117).
  - `airport-esim` goes first unless `done` has it (28). A **loss counts as done**.
  - The other scenarios are sorted undone first, then by rank. Rank is the level, except `office-boss`, which is forced to 0.5 (`SOONER`, 25). They are bucketed by format.
  - Formats are dealt round-robin through `CYCLE` = call, chat, chase, scene. A format that just played is skipped while another still has scenarios waiting (32-36).
  - First visit, simulated: airport-esim, courier-crabs, first-date, office-boss, hotpot-spicy, hotel-wakeup, flat-flood, farm-goose, locked-out … rent-rise, meet-parents.
  - "Undone first" only applies inside each format's queue. In a simulation with 8 scenarios done, finished scenes still came 4th, 8th, 12th…
  - Likes, stars, srs and timing are never inputs. Each scenario is dealt at most once per visit.
- `more()` (145-175) deals up to 3 items per call. The feed calls it when the active card is within 3 of the end (feed.js:41), or on `go()` past the end (feed.js:44). Priority for each slot:
  1. A due review, if `sinceReview>=2` or the end card has been dealt (150).
  2. Warm-up: if there has been no review yet and `n>=5`, the longest phrase met this visit, dealt early (138, 151-152).
  3. A write card, if `sinceWrite>=2` (154-157). The word comes from the last two scenarios and must not have been written this visit nor be in srs (141-144).
  4. A shadow card, if `sinceShadow>=3` (159). It uses the scenario's middle line (164). At build time it switches to the first line unless the done outcome is `'win'` (112).
  5. The next scenario (160-167).
  - The three counters only advance when a scenario is dealt (162). `n` counts cards dealt, not cards viewed.
- `review()` (129-134): with 3 or more due phrases, one chase run of up to 5 (`createRun`). Otherwise the first due id becomes a flash crisis, or a write-again card if the id is `write:<word>`.
  - `fresh()` (124) excludes ids already dealt at their current due time (the `seen` map). So a flash crisis swiped past without an answer is not dealt again that visit. Phrases a run never reached are dealt again (182-183).
- When the queue is used up:
  - Leftover write and shadow cards alternate (154, 159), then one 没了 end card (171, 42-52).
  - After that, due reviews are dealt at once, and each batch gets another end card.
  - The end card checks `waiting()` every 15 s and shows "Review the N due ↓" (49-51).
  - Nothing else is ever dealt. Only reopening the Mix re-orders.
- Item kinds: scn, review, run, write, shadow, end (178-187). With no microphone, one line per scenario is typed (`typeOne`, 179).
- Content: 20 scenarios (L1: 3, L2: 9, L3: 6, L4: 2) and 107 phrases (L1-L4: 17/49/31/10). Level sets the clock, `TIME=[18,15,12,10]` (ask.js:29, 77). Panic multiplies it by 0.7 and relaxed turns it off. Attempt 2 gets 1.5× time and starts with the frame hint; attempt 3 has no clock and shows the whole answer (ask.js:78, 82).

## Feed: app/shared/feed.js
- An IntersectionObserver at 0.6 visibility (16) calls `activate(i)` (26-42). That function:
  - calls the previous card's `leave()` (30);
  - builds cards within ±1 and destroys cards beyond ±2, clearing their HTML (33, 25);
  - calls `enter()`, then `onActive?.(i,item)` (36). The Mix never passes `onActive` (mix.js:176);
  - loads the next card's audio pack 600 ms later (38-40). A run preloads only its first phrase's pack (mix.js:131).
- The lock (21) only stops scrolling while listening, while the typing field has focus, or while drawing (ks.css:109). A swipe during tiles, self-check or a verdict leaves the card: ask resolves `'cancel'` (ask.js:571) and nothing is recorded.
- Coming back to a card that is still built (within ±2):
  - scene and chat keep their end card (scene.js:443, chat.js:449);
  - a call rings again (call.js:495);
  - a chase restarts, and its `leave()` wipes the end card (chase.js:422-427);
  - review, shadow and write cards restart unless done (cards.js:136-138, 203-205, 326-327).
- Moving on happens by swipe, by arrow/PageDown/j/k keys (49-53), or by Next ↓ buttons through `ctx.next` (22). These are neither told apart nor logged.
- The rail, `chrome()` (72-83):
  - Like toggles `marks 'liked'` (77). Replay restarts the scenario (79). Settings opens the sheet (80). The caption shows L{level} (74).
  - **There is no Save button**, although the comments at 71 and store.js:57 say there is.
  - Chat adds a Read aloud toggle, stored as setting `chatRead` (chat.js:76-84).
  - Review, write, shadow and end cards have no rail. The review run does, as scenario `review-run` (chase.js:75, 442).

## Store: app/shared/store.js
- Everything is in localStorage under `ks.*`, with an in-memory fallback (3-5). Nothing is sent anywhere (2).
- **settings** (7-22): pinyin (all/new/none), english (show/tap/none), pressure (relaxed/normal/panic), input (auto/speak/tiles/type/self), sfx, voice. `chatRead` is used but missing from `DEFAULTS`. `on()` registers listeners.
- **srs** (28-46):
  - Keys are `scn/beat` (content.js:25) or `write:<word>`. Each entry is `{box, due, seen, best, last}`. There is no history of attempts.
  - Boxes are 3 min, 20 min, 1 d, 3 d, 7 d, 21 d, 60 d (29).
  - 3★ moves up a box, 2★ stays, 1★ drops one, 0★ goes back to box 0 (38).
  - A right answer earlier than half its interval changes nothing, not even the due time (37-39).
- **marks.done** (62): `{stars, outcome, at}`, overwritten on every finish, so it holds the last run, not the best. Chase also keeps `best` and `furthest` (chase.js:323-324).
- **marks lists:** `liked` (read only by the rail itself, feed.js:78), `tips` (coach/swipe, mix.js:63-64), `counted` (`[id, heard]` as JSON, ask.js:540-541).
- **vocab** (49-55): how often each word was rendered; "known" at 6. It counts every `zh()` render with `count:true` (text.js:72), replays included.
- `ks.again` (looked-up words) is written directly to localStorage by text.js:81-92, outside store.js.
- Kept in memory for the visit only: `ask.chosen` (ask.js:44, 236), `ask.carry` (589), and the Mix's `seen`, `written` and `t0` (117-123).

## Signals
Stored means persisted; transient means it exists in memory only and is never saved; not captured means it isn't measured.

| Signal | Status | Where / hook |
|---|---|---|
| Completion and outcome | Stored | basic.js:65, scene.js:360, chat.js:378, call.js:342, chase.js:324 |
| How a call ended (`endedBy`: done/them/you/missed) | Transient | call.js:103, 131, 156, 307, 465 |
| Stars per line | Transient (`state.said`, story.js:22); only folded into srs box/best (ask.js:499) | Scenario stars = floor of the mean (story.js:37) |
| Hint level, Hear | Transient (`hint`, `heardModel`, ask.js:82, 209-218) | Only visible through stars |
| Retries | Transient: `attempt` (story.js:16), wrong tries in one panel `tries` (ask.js:131, 350, 419, 480) | Scene's second miss takes the hidden branch at 0★ (scene.js:345) |
| Skips | Transient (ask.js:219); idle give-up counts as skip (149) | Scenario skip records no srs (ask.js:550); review skip records 0 (cards.js:118) |
| Timeouts | Stored only as srs 0 (ask.js:551), not told apart from other zeros | `tried` is transient (549); chat gives up after 2 silent timeouts (chat.js:285) |
| Time to answer | Not captured | `secs`/`left` exist (ask.js:77, 131), but calls and chases pass `time:0` (call.js:274, chase.js:228). Hook: ask() start vs `verdict()`/`settle()` (476, 560) |
| Swipe-away mid-card | Not captured | `el.dataset.state` (idle/playing/done) at `leave()` (feed.js:30; same pattern at mix.js:183); `hooks.step` for progress (story.js:9) |
| Replays | Not captured | Rail Replay; end-card Again (scene.js:394, chat.js:404, call.js:409, chase.js:362); line ↻ count `n` per panel, transient (scene.js:235-238); call free re-listen (call.js:216-222); review ↻ (cards.js:94); shadow Again (cards.js:182); write 🔊 (cards.js:322) |
| Likes | Stored | feed.js:77 |
| Gloss taps | Stored only as "reset this word to 0" in `ks.again` (text.js:118); no count, no card | Hook: text.js:112-131 |
| English reveals | Not captured | text.js:101 |
| Pinyin | Setting only | Call peeks: `peeks` transient (call.js:240); a peek caps the reply at 2★ |
| Mode switches | Transient (`ask.chosen`, result `mode`, ask.js:524, 549) | `settings.input` is stored |
| Session length | Not captured | Mix `t0` in memory only (117); boundaries are `route()` (main.js:161) and `visibilitychange` (feed.js:68) |
| Shadow result | Not captured | No id passed (cards.js:192) |
| Write result | Stored as `write:<word>` stars (cards.js:292) | Misses and Show me are transient (cards.js:243, 318) |
| Chase gap/passed/notes | Transient | chase.js:50-51, 195 |
| "That should count" | Stored | ask.js:540-541 |

## Surprising or fragile
- No Save button. `onActive` is never used. Likes are written but never read for anything.
- A call that was declined or rang out twice without being answered is never marked done (call.js:342, `if (state)`).
- The review run writes done and liked entries under `review-run`. Its per-phrase `time` (chase.js:439) is overridden by `time:0` (228), so it is never used.
- Chase `again` encounters and the call type-back (call.js:440) record the same phrase twice in one run; the second is usually "early" and moves nothing. The warm-up review is early by construction, so a right answer there moves nothing either.
- The artifact frame blocks network calls (ENGINE.md:102), and there is no network code at all.

# difficulty

Difficulty in 快说 v1, as the code has it. Root: ..

**1. Nothing adapts today.** There is no per-player difficulty. Every knob is either a global setting the player picks, or a fixed constant in a format, or content.

**Settings** (app/shared/store.js:7-14, app/shared/panel.js:6-13). Global, saved on the phone, never per level, and nothing changes them automatically.
- `pinyin` all/new/none. "new" hides a word's pinyin once it has been rendered 6 times, counted (store.js:50; text.js:66). A word tapped to look up gets its pinyin back for 6 more renders (text.js:81-92). Many places force `all` (the full-answer hint, verdict, end cards) or `none` (stickers).
- `english` show/tap/none. Affects other people's lines only. The mission and cue are always in English.
- `pressure` relaxed/normal/panic:
  - answer clock: off / ×1 / ×0.7 (ask.js:78)
  - call patience: off / ×1 / ×0.7 (call.js:286, 293)
  - chaser speed: ×0.5 / ×1 / ×1.3 (chase.js:113)
  - relaxed also stops the verdict moving on by itself (ask.js:528).
- `input` auto/speak/tiles/type/self. There is also an undeclared `chatRead` setting (chat.js:75).

**Answer clock** (app/shared/ask.js)
- Time is `opts.time ?? beat.time ?? TIME[level-1]`, with TIME = [18,15,12,10] (29, 77). Attempt 2 gets ×1.5; attempt 3 or later has no clock (78).
- The clock holds while the model answer plays, the mic is open, a say-and-check is being compared, a format holds it, or Settings is open (132-133).
- Typing: the clock waits up to 8 s for the keyboard (378). Someone still typing at 1 s left gets up to 8 s more (140).
- A wrong try costs 2 s, never below 1 s left (150, 352, 482). "Missed it" leaves at least min(secs, 8) s (422).
- With no clock, `giveUpAfter` turns idleness into a skip (149): plain player 25 s, review practice 30 s, shadow 60 s.

**Help and stars** (ask.js)
- Hint ladder (194-209):
  - 0: nothing
  - 1: the frame, i.e. the model answer with its need words blanked, plus an English key per blank
  - 2: the whole answer with pinyin.
  - Starting level is max(`opts.hint`, 1 on attempt 2, 2 on attempt 3+) (82).
- Hear 🔊 jumps to hint 2 and alternates normal and slow audio on each tap (210-218).
- Star cap (184): hint 1 → 2★; hint 2 or Hear → 1★; attempt 2 → 2★; attempt 3+ → 1★. `opts.free` makes the starting help free (85).
- Most stars per mode:
  - tiles 2★, a tiles slip 1★ (344, 349)
  - typed 3★, or 2★ for pinyin only, a slip, a homophone or a wrong tone (391)
  - say-and-check "Nailed it" 3★ with nothing verified, "Close" 2★ (413-414)
  - "That should count" 1★ (542)
  - a pass the judge calls not perfect drops from 3★ to 2★ (496).
- Spaced review records the stars; a timeout records 0 (551).

**Modes**
- Speak exists only if the phone can listen (41). Default order: saved setting, then a mode tapped earlier this visit (never tiles), then speak, then self (44). A beat's suggested mode wins only on auto (80). In the claude.ai artifact, auto means say-and-check.
- Tiles fill the need-word characters, with 3 decoys (4 if more than 2 gaps) (290).
- Speech: 5 recogniser guesses, 9 s per try (speech.js:16, 31).

**Judge** (app/shared/match.js). It has no level or setting input: `judge(said, beat, {typed})` (311).
- Every `need` group must be heard. Costs: same character 0, homophone 0.1, other tone 0.35, 二/两 0.2 (138-144).
- A one-character need word must have its own tone (215). Words of 3+ sounds allow one slip, but not on a no or a number (225).
- `not` entries fail first, with their note (338). `mistakes` only add a note, which caps a pass at 2★ (365, 368). "Perfect" means score ≥ 0.8 and no note (368).
- The right sound in the wrong character: typed it passes, spoken it fails (347-352). Typed pinyin is compared without tones (323-334).

**Format knobs**
- **Call:**
  - The answer panel has no clock; the call runs its own patience bar.
  - First window `beat.time` (8-10 s in content); after each nudge, `call.patience` (4-8 s). Tiles/typing ×2, panic ×0.7 (286-288).
  - Any tap in the panel except the mic refills it (290). Two nudges, then they hang up.
  - Peek = hint 1 (−1★) and unlocks tiles (43-48, 238-255, 275). Each hidden line has one free replay (212-222).
  - Rings 6 × 3.4 s; declining twice loses (29, 131).
- **Chase:**
  - Encounters have no answer clock (228). Defaults are start 20, close 1, gain 8, loss 5, max 25 (40); content uses start 18-20, gain 10-11, loss 4-5, max 23-25.
  - The chaser gains 0.6-1.1 m/s while people talk and 1 m/s while you answer; listening ×0.5, tiles ×0.8, typing ×0.5 after a keyboard wait of up to 5 s (23-33, 108-121).
  - A pass gains ×1.4 / ×1 / ×0.75 by stars, times (1 − 0.75·gap/max) (283-285). A miss costs `loss` and puts the answer up, for 1★ (256-257, 293).
  - A new phrase is shown for max(1.5 s, clip + 0.6 s), then taken away (204-215). `again` encounters skip that and hide Hear (244). Skip and Hint are hidden throughout (chase.css:194).
- **Chat:**
  - Reply mode per beat: type 17, speak 6, tiles 1. Speak becomes type with no mic (269). Times 15-26 s.
  - A wrong answer stays in the panel; `fail` plays only on a timeout. Two silent timeouts end the chat lost (285).
  - Typing pauses are clamped to 0.5/0.9/1.2 s (212). A recalled message stays up at least max(recall, 0.4 s per character, 4 s below L4) (225).
- **Scene:**
  - The ↻ replay is free the first time, then −2 s (238).
  - Timeout → `fail` → attempt 2. A second miss plays the hidden `miss` branch at 0★ (345).
  - In the Mix with no mic, one beat is typed at double time (43-44, 316).
- **Cards:**
  - Review: double time for tiles/type (cards.js:113); a fail leads to unscored practice (125); a skip records 0 (118).
  - Shadow: lines of 5-12 characters, every non-particle word required, level 1 (148, 158-162, 192).
  - Write: trace, then from memory, with Hanzi Writer leniency 1.2 (264).
- **story.js:** Skip plays the `ok` branch at 0★ (21-23). A scenario's score is the floor of the average (37). The Mix orders each format easiest level first (mix.js:29).

**Content**
- `level` is set per scenario only: 1 survival, 2 everyday, 3 social nuance, 4 persuasive/idiomatic (CONTENT.md:36). It is validated as 1-4, and phrases inherit it (build.py:705).
- The app uses level only for: the default clock, the call's first patience window, the chat recall floor, Mix order, the review run, and the "L2" badge (feed.js:74). Never for judging, hints, tiles or pinyin.
- 20 scenarios: L1 3, L2 9, L3 6, L4 2.

  | Format | L1 | L2 | L3 | L4 |
  |---|---|---|---|---|
  | Scene | 1 | 3 | 1 | 1 |
  | Chase | 1 | 2 | 1 | 0 |
  | Chat | 0 | 2 | 2 | 1 |
  | Call | 1 | 2 | 2 | 0 |

- 107 say beats, all top-level (= 107 phrase records), by level 17/49/31/10. Scenes have 5 each; chases 7 (6 encounters plus a finale); chats 5 (family-group 4); calls 5. 23 or-branches.
- Model answers are 2-13 characters; average L1 5.6, L2 7.5, L3 6.9, L4 8.9.
- The blanked part (what tiles test) is 1-6 characters, 2 in 54 beats, about 41% of the answer. 79 beats have a single need group.
- `beat.time` is set on 85 beats; 22 scene beats use the level default. Every scene, chat and call beat has a `cue`; no chase beat does. All 30 scene beats have `miss`, and 6 of those lose the scene.

**Audio: what an easier or harder version could use without new recordings**
- One audio pack per scenario, each clip a [start, length] slice (build.py:640-666).
- Recorded: every cast line (call `pace: fast` lines at 1.15), narration, and `answers[0]` of every beat and or-branch, at 1.0 and at 0.78. Slow clips are normal speech stretched with ffmpeg and about 1.27× longer (build.py:36, 588; voice.py:57-77).
- Not recorded: other accepted answers, and any slow version of other people's lines.
- The slow clip is reachable only by tapping Hear a second time.
- `audio.play` has no speed option (audio.js:119). Web Audio's own `playbackRate` would also shift pitch.
- The only voice not from recordings is the browser's speech synthesis, used for tapped single words (speech.js:67-78).
- Changeable without recordings: every timing and multiplier, hint start/free, star caps, mode, pinyin/English display (`zh()`/`en()` already take per-call options), cue vs mission, using fewer nudges, chase and patience numbers, `need`/`not`/`mistakes`, extra accepted answers (needs a rebuild, but no new clips), and dropping steps.
- Needs recordings: any new or changed line from another character, nudge, `fail`/`miss` line, or model answer.

**Surprising or fragile**
- The [18,15,12,10] table is copied in four places (ask.js:29, call.js:30, scene.js:316, cards.js:113).
- Chase encounter `time` values do nothing; the review run's [9,8,8,7] is dead code (chase.js:439); chase.md's "shorter clock" for `again` encounters has no effect.
- The typed line in scenes and calls is the last qualifying beat (`.pop()`, scene.js:44, call.js:106), but scene.md, call.md and call.js:268 say the first.
- chat.md's typing-pause formula, and its "a wrong answer plays fail", don't match the code.
- On relaxed, scenes and chats can't be lost.
- In the artifact, spoken answers are self-rated; only typed answers and tiles are machine-checked.
- The 6 `again` phrases are recorded under the first encounter's id, so they never come due in review.
- L3 model answers are shorter on average than L2.
- `secs` (shown as the length) is the pack length, slow clips and branches included.

# platform

- **Packing (tools/pack.mjs)**
  - esbuild bundles app/main.js into one minified script (format IIFE, targets es2020 and safari14) inlined in the page; the app/ CSS is inlined too (:14-23).
  - The Google Fonts `<link>` stays. It is the page's only external request, and the pack throws if it or the main.js tag is missing (:15-16).
  - The pack also throws if the bundle uses post-Safari-14 APIs such as `.at(`, findLast, structuredClone, AbortSignal.timeout or lookbehind (:20-22).
  - data/*.json go inline as `<script type="application/json" data-file>` (:24-27).
  - Voices are re-encoded by ffmpeg to mono 24 kHz, 32 kbps AAC-LC (aac_at if available). They are cached in `.cache/pack/<name>-32k.mp4`, keyed by file name only, so changing the encoder settings won't invalidate the cache. They go in as base64 `<script type="application/octet-stream">` after the app script (:28-40, :45).
  - ffmpeg must be installed for every pack run (:34 runs unconditionally).
  - **Size stop is 15.5 MiB**, while the comment says the host takes 16 MB (:46-47). Only the HTML is counted.
  - The pack also copies data/ and the 56 kbps packs beside the page and writes dist/files.json (23 entries) for Claude's Artifact tool (:49-54). The dist/ swap is atomic (:56-70).
  - Republishing: old artifact paths must be set to null or stale packs remain (:74).
  - files.js reads the inline copies first (:18-25, :40-42), so the separately published files are never used by the packed page. dist/ is 30 MB on disk.
- **Artifact host constraints**
  - No microphone (PLAN.md:41-42, :73).
  - It serves the page but not its files (PLAN.md:143-152).
  - The frame "only loads scripts from a few CDNs" (pack.mjs:2-3). The house rule is no network calls except relative data/ and audio/ (ENGINE.md:102).
  - The private link is at MORNING.md:9.
- **Fragile: no doctype, charset or viewport**
  - index.html has no `<!doctype>`, `<meta charset>` or viewport meta, and neither does dist/index.html, which starts at `<title>`. It only has `claude:viewport-fit-sides` (index.html:2).
  - serve.mjs wraps such pages in a copy of the artifact host's skeleton (serve.mjs:21-22, :37). Any other static host would serve the page raw.
- **Load path**
  - `files.get()` waits for DOMContentLoaded before looking for an inline pack (files.js:17, :23). So the first voice waits for the whole ~13 MB page.
  - `play()` gives a pack that is still loading about 3 s, then plays the line silently (audio.js:126-130). `load()` gives up at 30 s (:109).
  - A decoded pack is about 20 MB of PCM; the last 4 are kept (audio.js:99-113). An evicted pack is base64-decoded again with atob (files.js:25).

**Budgets (measured now)**
- **Page size:** dist/index.html is 13,561,277 B (12.93 MiB):
  - voices (base64, 20 packs): 11.33 MiB
  - content.json: 746 KB
  - strokes.json: 596 KB (269 characters, about 2.2 KB each)
  - py.json: 30 KB
  - JS: 197 KB
  - CSS: 109 KB
- **Headroom:** 2.57 MiB to the 15.5 MiB stop; 3.07 MiB to 16 MiB.
- **Audio totals:** 2,169.6 s (36.2 min), counting slow answers and 0.3 s gaps (build.py:35-36, :664). 821 clips, about 41 per scenario.
- **Per minute of audio:**
  - Source packs: target 56 kbps (actually about 59), 15.46 MB in all, 438 KB/min.
  - Inline packs: 8.50 MB in all, 241 KB/min, which is 321 KB/min as base64.
- **Per average scenario (~108 s):** about 594 KB of base64 audio plus about 37 KB of content.json. The phrases array repeats each beat's answers and is 31% of content.json (build.py:694-715). That leaves room for about 4 more scenarios, or about 8 minutes of audio.
- The launcher's "about N min" sums `secs`, the pack length, not play time (main.js:53).

**Content pipeline (tools/build.py)**
- **Steps:**
  - validate
  - jieba + pypinyin + CC-CEDICT annotation
  - Kokoro voicing (CPU, `KS_THREADS`=4, offline HF cache; voice.py:21-30)
  - Clips are cached by voice, speed, text and pinyin fixes (voice.py:70-89). `.cache/tts` holds 2,779 WAVs, 279 MB.
  - Slow lines are normal-speed speech stretched by atempo to 0.78 (voice.py:57-67).
  - Packs are 56 kbps AAC named by the PCM's sha1 (:655-661); py.json and strokes.json are regenerated over all scenarios (:688-689).
- **Flags:**
  - `--only` keeps the other scenarios from the old content.json (:560).
  - `--warm` fills the cache and can run in parallel (:633-637).
  - `--clean` deletes packs nothing references (:675-677).
- `setup_text()` loads Kokoro even for `--estimate` (:146).
- **Hand-kept tables:** GLOSS (:48-117), JOIN/OPEN/SPLIT (:120-124) and tools/pinyin_fix.json. The build prints gaps for a person to fix (:446-448, :623-624). polyphones.py lists readings to check by hand.
- **Timings** (start to last write of the overnight task logs; not benchmarks, M1 8 GB):
  - `--warm` runs, quiet machine:

    | Batch | Clips | Time |
    |---|---|---|
    | 4 scenes | 135 | 143 s |
    | 5 calls | 187 | 201 s |
    | 4 chases | 255 | 225 s |

    That is about 1 s per clip, roughly **35-60 s of voicing per scenario**.
  - 5 chats (195 clips) took 13 min while the machine was busy.
  - A rebuild of all 20 scenarios with cached voices: 52-99 s.
  - The speech-recognition check, uncached: 848 clips in about 33 min (Whisper only at the time).
- **Speech-recognition check (`--qa`, build.py:770-795, asr.py):**
  - Whisper large-v3-turbo runs on MLX. A clip more than 15% off is heard again by SenseVoice-Small; if both are off, it goes into review/qa.md.
  - It is a report only and never fails the build. Results are cached in `.cache/asr2.json`. qa.md is overwritten on each run.
  - **The current qa.md (00:46) is stale.** It predates the 02:30 recast and lists voices since dropped (zf_024, zm_037, zf_075; see voices.json "_").
- **Casting:** cast.py and recast.py, 3-4 voices per role; the model voice is zf_004 and the narrator zm_030. Voices are assigned by crc32 (:533-545).
- **ElevenLabs:** about 8,500 credits for everything (MORNING.md:53); the voice ids in voices.json are placeholders.
- **validate.mjs:** now 0 errors, 0 warnings. It hard-limits levels to 1-4 (:31) and time to 4-40 s (:73). It doesn't check format-only fields (an open request in call.md:135-137).
  - Other level hard-codes: ask.js:29 and cards.js:113 (`[18,15,12,10]`), feed.js:74 ("Level N of 4").
- **judge-check.mjs:** runs match.js in Node through a fetch shim (:14). Now 0 errors, 16 warnings (sibling beats in chases and chats), 0 fumbles; takes about 0.5 s.

**Tests**
- **test.mjs options:**
  - `--only`: default `home,basic,scene,chase,chat,call,mix` (:31)
  - `--sim=right|mixed|silent` (:32); mixed answers '我不知道你在说什么' first (:67)
  - `--input=speak|tiles|type|self|list|all`, written to `ks.set.input` (:29-30, :64)
  - `--phones`: safari 390×664, se-safari 375×553, iphone, se, android, max (:28)
  - `--cards=N`, `--headed`, `--dist`; `--dist` skips the judge unit tests (:171)
  - It runs puppeteer-core on the local Google Chrome (:33): Chromium only, no WebKit.
  - `KS_FAST` cuts waits to 4% (time.js:3) and makes `audio.play()` silent (audio.js:125).
- **Contract with formats:**
  - `el.dataset.state` = idle | playing | done.
  - `data-test-go` on every button the player must tap.
  - Panel classes: `.ks-ask`, `.ks-mic`, `.ks-next`, `.ks-skip`, `.ks-reveal`, `.ks-yes`, `.ks-no`, `.ks-type input`, `.ks-tiles-pool .ks-tile`.
  - ask.js exposes `data-answer` and `data-words` only under `KS_SIM` (ask.js:108, :318). `KS_PAUSE` holds the clock (:133).
- **Fail conditions:** console errors (except favicon, fonts and "Failed to load resource"), HTTP ≥400, page errors, a card not done in 90 s, sideways scroll, or a launcher with fewer than 5 `.ks-v` (:58-60, :130, :168, :184).
  - The judge unit cases are hard-coded to airport-esim's beat ids (:201-217). Screenshots go to review/test/, which is gitignored.
- **Gap: the real no-mic setup is never tested.** test.mjs always sets `KS_SIM` (:68), and `canListen()` is true whenever `KS_SIM` exists (speech.js:12). So these artifact branches never run under test:
  - the auto say-and-check default (ask.js:43)
  - the no-mic toast (ask.js:580)
  - the Mix's one typed line per scenario (mix.js:179)
  - chat's typed voice notes (chat.js:269, which also checks `!sim()`)
  - chase typing (chase.js:228, :392)
  - typed flash cards (cards.js:110)
  - the iOS silent track (audio.js:48)
  - Only review/fix/load/blocked.mjs (gitignored, untracked) runs with no recogniser and with data/ and audio/ requests refused.
- Write cards pass automatically under `KS_SIM` (cards.js:281). There is no Date mocking, and the first review box is 3 minutes (store.js:29).
- **modes-check.mjs:** 5 hard-coded routes (:22), first panel only, a 12-tap sequence (:19). It checks `data-mode` and how many of each control appear (:41-47), and takes `--dist`.
- **Run times from logs:** one phone × all versions × all inputs ≈ 6.5 min; a two-phone mixed matrix 10-12 min.
- No CI, no git hooks, no wrangler config. The npm scripts are validate, serve, test and pack only.

**Speech recognition (app/shared/speech.js)**
- Web Speech only (:6): zh-CN, interim results, 5 alternatives, not continuous (:30-31). Audio goes to Google in Chrome and Apple in Safari (:1-2).
- **Artifact detection:** `inArtifact()` is true if `window.claude.use` exists or the host is claude.ai, claude.site or claudeusercontent (:11). `canListen()` also needs a secure context (:12); `whyNot()` gives the reason (:13).
- **Time limits:** 9 s from when the mic opens (:54); 3 s stall check on later tries (:62); 1.5 s abort guard for WebKit bug 321436 (:35).
- iOS audioSession is switched auto → playback (:57-59). A refusal blocks the mic for the rest of the visit (:52).
- ask.js drops Speak where it can't listen (:41) and falls back to say-and-check on a refusal or stall (:271-279). Single tapped words are read by speechSynthesis (:67-78).
- Never tried with a real microphone or a real iPhone (MORNING.md:63-64).

**Local serving (tools/serve.mjs)**
- http on 127.0.0.1:8791, with `--port`, `--host` and `--dist`. Dot-paths are blocked; no-cache (:31-38).
- `--lan` adds https on 0.0.0.0:8443 with a self-signed 30-day certificate in ~/.cache/kuaishuo/cert (:45-60).
- **The certificate is regenerated only if it's missing or the IPs change, not when it expires (:49).** That folder doesn't exist yet. An old certificate (valid to 2026-11-28) is still in the repo's .cache/cert from before commit 8cc7b60.

**Deployment and state**
- The only deploy mention is MORNING.md:84-86: `npx wrangler pages deploy dist --project-name kuaishuo`, which makes it public. wrangler is not a dependency.
- Nothing exists for analytics, ads, accounts, a service worker or a manifest; pack.mjs strips the icon link (:43).
- Storage is localStorage with a fallback to memory (store.js:1-5): keys ks.set.*, srs, words, again (text.js:83-84), liked, done, counted, tips. The comment says nothing is sent anywhere (store.js:2).
- The Mix runs out of content and ends on a "没了" card (mix.js:45).

**Sibling project, freelearninggame (from its CLAUDE.md only)**
- Static public/ with no build step, Cloudflare Pages Functions in functions/, a D1 database bound as `DB`, shared code in lib/.
- Local run: `wrangler pages dev public --port 8790`; a local database from schema.sql.
- Commit gate is tools/check.mjs, run by a pre-commit hook through core.hooksPath. tools/play.mjs plays the site in headless Chrome against wrangler with a fresh database.
- Privacy: daily totals only; no cookies, accounts or IPs (only a daily hash, for floods).
- Deploys go only to the Pages project "freelearninggame", and only after asking.
- kuaishuo is hidden from that repo by .git/info/exclude. MORNING.md:77-80 says to move it out before the next freelearninggame commit.

Key files:
- tools/pack.mjs
- tools/build.py
- tools/voice.py
- tools/asr.py
- tools/test.mjs
- tools/modes-check.mjs
- tools/judge-check.mjs
- tools/validate.mjs
- tools/serve.mjs
- app/shared/speech.js
- app/shared/files.js
- app/shared/audio.js
- ~/Documents/freelearninggame/CLAUDE.md

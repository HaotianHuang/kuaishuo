# 快说 Volume 2: a For You feed that adapts, more levels, rewarded ads

## Context

v1 works and is fun: 20 scenarios, levels 1–4, 107 lines, four formats plus the Mix. Volume 2's goal is **retention**:
- a TikTok-style algorithm that picks the next card;
- difficulty that scales up or down from an estimate of each learner's Chinese, with more levels;
- money from opt-in rewarded video ads: save a failed line, replay a choice, play longer.

**The audience:**
- 2nd/3rd-generation diaspora: they understand far more than they say, and read or write little.
- English-background learners starting from zero.

**What the code review found** (three read-only explorers):
- **Nothing adapts.** Difficulty is global settings plus a fixed table copied in four places (`[18,15,12,10]`: ask.js:29, call.js:30, scene.js:316, cards.js:113).
- **The Mix is a fixed queue.** mix.js `order()`/`more()` never reads likes, stars, spaced review or timing.
- **Most signals aren't stored:** time to answer, swiping away mid-card, replays, gloss taps, English reveals, session length.
- **Content is the hard limit.** 20 scenarios is about an hour of new play, and only 17 lines are at level 1.
- **The claude.ai page can't hold v2:** no microphone, no network, no ads, and room for only about 4 more scenarios (12.9 of 15.5 MiB).

**Honest framing.** One phone sees one learner, so v2's algorithm is a per-learner model plus a bandit ranker with hand-set priors. The population half of a "TikTok algorithm" (what keeps people like you) needs users and a server. v2 logs exactly what that server will need, and reads its output back later as priors.

Detailed designs, with formulas, file:line hooks and sources: `docs/v2/algorithm.md`, `retention.md`, `content.md`, and the explorers' `v1-facts.md`. This file wins where they differ.

## How v2 fits together

**learner model** (what you can do) → **ranker** (what to show next) → **variant + assist** (how hard this card is)
→ **events** (what happened) → back to the learner model.

The **economy and ads** sit beside the ranker behind a one-way wall: `rank.js` never imports `econ.js` or `ads.js`. The algorithm can't learn to set people up to fail so it can sell saves. A test proves the ranker's picks are identical with ads on and off.

## 1. What the app records: `app/shared/events.js`

- **Per line**, hooked at ask.js `settle()`: item, say level, assist, mode, attempt, hint, Hear count, tries, result, stars, perfect/slip/tone notes, pinyin only, **thinking time** (held time excluded, summed in `hold()`).
- **Per card**, a wrapper round mix.js `card()` controllers:
  - kind, id, dwell;
  - `dataset.state` at `leave()`: finished, skipped, or swiped away mid-card;
  - progress, outcome, replays, like;
  - gloss taps and English reveals (text.js);
  - call peeks;
  - the ranker's reason, prediction and propensity.
- **Per session:** start, end, cards, minutes.
- **Storage:** `ks.log`, a ring of about 3,000 rows (about 270 KB), plus daily rollups. A `#stats` page shows it, and it's the only analytics inside the artifact.

## 2. Learner model: `app/shared/learner.js`

**Six skills:** listening L, speaking S, vocabulary V, tones T, reading R, writing/typing W.
- Each is θk = θg + δk, with an uncertainty.
- Each answer mode loads the skills differently. For example, speaking is S .45 V .30 T .15 L .10. Say-and-check is self-rated, so it counts at 0.4 weight.
- A typed answer counts twice:
  - the sound was right (V);
  - the characters were right (W).

  That split is what tells a heritage speaker from a beginner.
- **Outcome y** from the result:

  | Result | y |
  |---|---|
  | Perfect first try | 1.0 |
  | Slip | 0.8 |
  | Frame hint, or attempt 2 | 0.55 |
  | Answer shown or heard | 0.2 |
  | Wrong, then timed out | 0.05 |
  | Silence or skip | 0 |

  Fast thinking adds 0.1; using most of the clock takes 0.1 off.
- **Update:** Elo with uncertainty, i.e. one Bayesian logistic step. The learner and the item are both updated; item calibration is damped (ρ 0.3) and stays within ±1 of its prior.
- **Item prior** per line, from build-time features:
  `b⁰ = −1 + 0.67(level−1) + 0.1(chars−7) + 0.3(needGroups−1) + 0.35·max(0, 4.5−zipf)`, where zipf is the rarest need word's frequency.
  - Mode offsets: tiles −0.7, self −0.3, characters +0.5.
- **Other characters' lines** are listening or reading evidence. Glossing, revealing or replaying a line counts as a small miss on L/R; leaving it alone counts as a small win.
- **Persona priors**, from one question asked after the first card:
  - Mandarin at home: L +1.5, R −1.0, W −1.5.
  - Cantonese or another dialect at home.
  - Studied some.
  - New.
- **Spaced review** keeps the Leitner boxes (store.js:28-46). A review's prediction is decayed by time since it was due.
- **Pinyin per word** comes from the model (shown while P(read) < 0.8), replacing the fixed "known after 6 views".

## 3. Levels L0–L5 and variants: `app/shared/levels.js` and the content schema

**Levels**, roughly HSK 2.0 / CEFR:

| Level | Your line | Around it |
|---|---|---|
| L0 (pre-A1) | 1–4 characters, one chunk | Model line plays first; no clock; English on |
| L1 (A1) | 3–6 characters | 18 s |
| L2 (A2) | 5–10 characters, one pattern | 15 s |
| L3 (B1) | Deflect, soften, refuse | 12 s |
| L4 (B2) | Persuasion, 俗语; 10 s | NPCs at 1.15× |
| L5 (C1) | Register: a toast, a formal refusal; 8 s | Native pace |

- `levels.js` holds this table and replaces the four copied clock tables. Fix the places where level 0 is falsy (`opts.level || 2`, ask.js:75; chase.js:436, 439).
- **Two dials per card:**
  - **Say** is your line. It's set per beat by the variant chosen.
  - **Listen** is everyone else's lines. The recordings fix it; subtitles, English and slow replay move it about one level.
  - Heritage learners start around listen 3, say 1, read 0: a fast-talking mum with short replies to give.
- **Per-beat variants**, scaling existing scenarios with no new character recordings:
  ```jsonc
  "say": { "id": "borrow", "answers": […], "need": […], "levels": {
    "0": { "answers": ["借我用一下？"], "need": [["借"]], "time": 20 },
    "4": { "answers": ["大叔，能借您手机打个电话吗？我卡没信号了。"], "need": [["借","用"],["手机","电话"],["信号","网"]] } } }
  ```
  - Other characters' lines, branches and audio stay. Only the model answer needs a new model-voice clip.
  - Ids are `scn/beat@L`, and base ids never change, so v1 progress survives.
  - Once a variant is solid (box ≥ 3), review serves the next level up: the same moment, a harder line.
  - `content.tailor(scn, levels)` merges each beat with its override, so format code doesn't change.
- **Cuts** for L0: a shorter story built from the parent's steps and clips (`parent`, `keep`).

## 4. Adaptive difficulty: `app/shared/assist.js`

**The assist ladder**, all from knobs that exist today, so no new recordings:

| | Clock | Help | Pinyin / English | Call / chase |
|---|---|---|---|---|
| A0 | ×0.7 | none, cue only | none / none | patience ×0.6, 1 nudge / chaser ×1.4 |
| A1 | ×0.85 | none, cue only | model / tap | |
| A2 (= v1) | ×1 | none, cue only | new / tap | ×1 / ×1 |
| A3 | ×1.5 | mission shown | all / show | patience ×1.5, a free peek / chaser ×0.75 |
| A4 | off | free frame | all / show | no hang-up / chaser ×0.5 |
| A5 echo | off | the line plays first | all / show | subtitles on / chaser ×0.4 |

- **Choice:**
  - Per card, take the hardest variant and assist whose predicted success p̄ is at least the target τ, moving at most one step from last time.
  - Mid-scenario, a bad line moves the rest one step easier; two quick wins move them one step harder.
- **Mode is a rung too:** tiles < say-and-check < pinyin < speech < characters. It's aimed at the biggest gap the model is confident about.
- **Free help caps review credit**, so spaced review stays honest.
- **Settings** get "Auto". A setting the player pins always wins.
- **Slow other-character lines** come from a pitch-preserving stretch on the phone (`app/shared/stretch.js`, WSOLA, about 60 lines, the same method as ffmpeg's atempo). They cost zero bytes. The 130 stored slow answers can go, which frees 1.9 MiB.

## 5. The For You ranker: `app/shared/rank.js`

DOM-free; replaces mix.js `order()`/`more()`. v1's dealing stays at `#mix?deal=v1` as the baseline.

**Candidates:** unplayed scenarios and their variants, rematches, due reviews (flash crisis, or a run when 3+ are due), write and shadow cards, the next series episode, a placement probe, a recap.

**Hard rules:**
- Card 1 of a session is a likely win (p̄ ≥ 0.85) with top engagement.
- No format twice running.
- While anything is due, a review at least every 4th card.
- Reviews, writes and shadows together are ≤ 40% of a session; none in the first 3 cards.
- Probes ≤ 1 in 6, never after a loss.

**Score** = 0.35·Engagement + 0.30·Fit + 0.25·LearningValue + 0.10·Variety, plus 0.15 for a series in progress.
- **Engagement:** Thompson-sampled Beta arms for format and topic.
  - Priors come from the critics' ranking and your goals.
  - Finished +1; swiped away early −1; liked or replayed +1; counts decay each session.
- **Fit:** exp(−½((p̄−τ)/0.1)²).
- **Learning value:** how overdue a review is; new lines; skill gaps weighted by your goals (only gaps the model is confident about, so tones aren't chased without a mic).
- **Variety:** penalties for repeating a format or a topic.

**Target success τ** moves through the session:

| Situation | τ |
|---|---|
| Base (self-rating flatters) | 0.80 |
| A returning session's first 2 cards | 0.90 |
| After a loss | 0.92 |
| After 3 strong cards ("Harder one?") | 0.70 |
| When tired | 0.88 |

**Fatigue** comes from minutes, slowing answers, and skips or timeouts. **End on a high:** a sure win, then a recap and tomorrow's teaser.

**Lazy dealing:**
- feed.js asks 1 card ahead, not 3.
- The ranker picks as each card comes on screen, through feed.js `onActive`, which exists but is unused.
- A pick takes under 2 ms. `#mix?why` explains each pick.

## 6. The first session and placement

- **Open straight on the feed.** The launcher moves to `#lab`. The sound gate is the hook ("Your phone just died at Pudong. Tap to start."). The first freeze comes by about 8 s, with the frame free, so the first line is a win.
- **After card 1:** one card asks "Growing up, did you hear Chinese at home?" (Mandarin / Cantonese or another dialect / studied some / new), what you'd love to do (family, travel, reading and writing, fun), and a birth-year picker as the age gate. All taps, all skippable.
- **Cards 2–5 place you:**
  - Each line's assist aims at p ≈ 0.7, the most informative point while still mostly winning.
  - A call checks heritage listening; a chat checks reading.
  - One "Bonus: a level-3 line" checks the ceiling.
- Session 1 has no ads and no permission prompts.

## 7. Retention loops

- **Series with recurring characters and cliffhangers.**
  - Each episode's end card teases the next.
  - One episode drops a day (up to 3 can wait).
  - Voices are keyed by `series/character`, so 奶奶 sounds the same in every episode.
- **Streak:**
  - The day starts at 4 am, so late nights count for that evening.
  - One story or three reviews keeps it.
  - Freezes are earned at milestones.
- **今日挑战**, a daily challenge: the same story for everyone, with one modifier. The result pastes into WeChat or WhatsApp, Wordle-style (`快说 #42 🐯 🟩🟩🟨🟩🟥`). It's free.
- **Progress you can see:**
  - "Situations you can handle": a story won whose phrases have all lasted a day.
  - The phrase deck, with mastery rings.
  - "Monday: missed. Today: nailed." cards.
- **Recap and teaser** when the session ends.
- **Sharing:**
  - a 9:16 line card;
  - later, in the native app, "send your line to 外婆" (your own recording).
- **Notifications:**
  - Android or native only, at most one a day. An iPhone Home Screen web app reportedly gets push but not the speech recogniser.
  - **Runway:** someone still playing at D30 has played about 60 stories, so don't launch publicly before about 60 (or 40 plus variants).

## 8. Rewarded ads and the economy

New modules in `app/shared/`: `days.js` (the day key, streak), `econ.js` (allowance, caps, honeymoon), `ads.js` (a provider interface) and `ads-mock.js`.

| Ad | Where | Reward | Free path | Cap |
|---|---|---|---|---|
| **Save** | You lose a scene, are caught in a chase, or a caller hangs up | Another try at the same line, with attempt-2 help (never the answer); a chase resumes at 10 m | ↻ Again; 1 free save a day | 3/day |
| **Replay a choice** | End card of a story with a real fork | The other branch and its ending | none | |
| **Play longer** | After the daily allowance of new stories (start at 5; test 5 vs 8 vs unlimited) | +2 new stories | Reviews, replays, writing and the daily challenge stay free | 3/day |
| **Episode now** | Series teaser | Tomorrow's episode today | Wait | 1/day |
| **Streak freeze/repair** | Streak card | +1 freeze; repair within 48 h | Milestone freezes | 1/week, 1/month |

**Rules:**
- Opt-in buttons that name the reward. No interstitials, banners or pre-rolls.
- Never during a line.
- Honeymoon: no offers for the first 3 days or 15 stories.
- At most 6 ads a day, 90 s apart. A declined offer isn't shown again for 10 min.
- No fill means the reward is granted anyway.
- Under 13 or consent refused: no ads, and honeymoon rules stay on.
- Difficulty never changes inside a run. If more than 20% of recent runs were lost, step down.

**Rewinds need real forks.** v1's 23 or-branches lead to only one distinct ending (hotel-wakeup), so every new episode gets at least one real fork. `story.js` gains `from(steps, beatId)` for saves and rewinds.

**The mock ad** is a full-screen "Ad" with a 5 s countdown and a close button that gives up the reward. Tests drive it with `KS_AD` = reward / dismiss / nofill / error.

**Real networks later:**

| | Web: Google H5 Games Ads | Native: AdMob through Capacitor |
|---|---|---|
| Access | Closed beta, by application | `@capacitor-community/admob`, with UMP consent |
| Rewarded eCPM | roughly $6–15 | US about $13–17+, UK about $10, CA/AU higher |

**Honest economics:** about 1 ad a day at those rates is roughly 1¢ per daily user, or about 7¢ per US native install over 90 days. That's too little to pay for buying users, so growth has to be organic (sharing, the daily challenge, diaspora communities). A later 快说+ subscription (no ads, unlimited stories; reviews always free) would plausibly earn several times more. It's noted as an option, not planned.

## 9. Content plan: 40 new scenarios (60 in all), plus variants

**Heritage (家), 22 scenarios:**
- **回老家 Back Home**, a series of 8 episodes from L2 to L5, with 奶奶, 大姑, 表哥 and 二姨:
  1. 表哥's non-stop pickup
  2. "你中文好可爱！": answer with a joke
  3. Explaining your job to 大姑
  4. A blind-date ambush
  5. 奶奶 in hospital
  6. The 80th-birthday toast
  7. The family group chat explodes
  8. The 腊肠 at airport security
- **Standalones:**
  - Grandma's video call
  - Mum's 60-second voice notes
  - The red-packet refusal dance
  - Fighting to pay the bill
  - The wedding door game
  - Interpreting for Dad at the bank
  - A Cantonese family (雪柜 → 冰箱)
  - A Toronto auntie

**New learners (路), 18 scenarios:**
- **新来的 The New Hire**, a series of 6 episodes from L0 to L3: the office applauds two words, lunch on a delivery app, lost on the metro, escaping KTV, a dating app, the boss at 11 pm.
- **L0:** bubble tea, haggling, a QR code that won't scan, a toilet emergency, a breakfast stall.
- **L5:** a job interview, 以茶代酒 at a business dinner, a vlogger asking about 内卷.

**Volume:** L0 8 · L1 10 · L2 16 · L3 12 · L4 8 · L5 6. Every scenario gets variants one level up and one down, giving about 38 playable story-levels at L2: a week of daily play before anything repeats.

**Style rules, added to CONTENT.md:**
- Relatives pry because they care, and every scene ends warm.
- Nobody mocks an accent or anyone's identity.
- China is ordinary and modern.
- Dating stays gender-neutral (对象).
- Settings span the diaspora.
- No politics or religion.

**The factory**, one batch of about 10 scenarios at a time:
1. A brief you approve.
2. Four drafting agents, one per format.
3. validate and judge-check.
4. An editor agent.
5. A hook score from 1 to 5.
6. Voicing: Kokoro takes about 1 s per clip, about 45 clips per scenario. The two-recogniser check runs, and a doubted model-answer clip fails the batch.
7. Headless play.
8. **A human gate:** `review/gate/<batch>.md` with play links, about 6 minutes per scenario. Only "live" ships.

**Schema additions:**
- Scenario: `level` 0–5, `listen`, `topics`, `audience`, `series {id, ep, next}`, `hook`, `status`.
- Beat: `levels`.

**Tooling changes:**
- build.py computes `lv`/`listen` and writes `review/levels.md`.
- validate.mjs gets level, series and override checks.

## 10. Platform and measurement

- **The artifact becomes a pocket edition.**
  - `pocket.json` holds at most about 30 scenarios, rotated each release.
  - Room comes from stretching slow lines on the phone, 24 kbps voices (checked by the recognisers again), and dropping redundant data.
  - Mock ads only. It's where you test the feel on your phone.
- **The full catalog runs from your Mac today** (`serve.mjs --lan`, with the mic). Hosting needs your OK at each step:
  - a private (login-protected) web app;
  - a public PWA, with audio served per card, a service worker, a doctype, viewport and manifest (`pack.mjs --web`);
  - a native shell with Capacitor: native speech, AdMob, notifications, audio bundled with no size limit.
- **Analytics, when hosted:** aggregate daily counts only (no IDs), Cloudflare Pages Functions plus D1 like freelearninggame, in a **separate `kuaishuo` project**. Plus `config.json` for remote settings and A/B arms.
- **Prototype targets:**
  - D1 35% (floor 25%), D7 15% (10%), D30 6% (3%).
  - Median session ≥ 7 min and ≥ 6 cards; ≥ 75% of stories finished; ≤ 15% swiped away mid-story.
  - 75–85% of reviews recalled from memory.
  - 0.6–1.5 ad views per daily user; ≤ 15% of runs end on a save offer.
- **Compliance before any real ad or data leaves the phone:**
  - an age gate (under 13: nothing);
  - Google UMP consent (EEA/UK, US-state opt-out);
  - a privacy policy (the learner model stays on the phone);
  - no ATT prompt at first.

## 11. Build phases

Each phase ends with its acceptance tests passing, a commit, and an artifact update.

| Phase | Builds | Done when | You see |
|---|---|---|---|
| **P0 Test debt and foundations** | A `--nomic` mode in test.mjs (hide the recogniser, no KS_SIM; the real claude.ai path, never tested today); a `KS_NOW` clock offset; `levels.js` (fold the 4 clock tables, fix level 0 being falsy); `events.js` and its hooks; `#stats` | The no-mic matrix passes; every answer panel logs exactly one row; v1 behaviour unchanged | Stats page |
| **P1 Learner model and assist** | `learner.js`, `assist.js`, `stretch.js`; Auto settings; formats read `ctx.assist`; `tools/model-check.mjs` | Recovers synthetic skills within 0.4; the assist changes ≤ 2 steps per 5 cards | "Your Chinese" panel; L0–L5 badges |
| **P2 For You ranker** | `rank.js`, the v1 dealing kept as `deal-v1.js`, lazy dealing, `tools/sim.mjs` (5 personas × 200 simulated learners × 14 simulated days, three engagement assumptions) | Success 72–88% (≥ 65% in session 1); 0 hard-rule breaks in 10k picks; calibration error ≤ 0.05; placement error < 0.6 after 12 lines; ≥ 85% of due reviews served within 2 sessions; ≥ 70% of sessions end on a win; D7 proxy ≥ v1 +10%; learning ≥ v1 | `#mix?why` |
| **P3 First session and placement** | Feed-first open, hook gate, the persona/goal/age card, probes in cards 2–5 | ≥ 90% of simulated learners placed within one level; the first line still within about 8 s | The new start |
| **P4 Content** (from day 1, in parallel: only `content/` and `tools/`) | Schema and tools; variants for v1; 8 L0 scenarios; Back Home 1–3; then L4/L5, New Hire, Back Home 4–8; pocket.json | validate/judge-check 0 errors; no doubted model clip; every batch through the human gate; pocket ≤ 15 MiB | New stories in batches of 10 to approve |
| **P5 Retention and economy** | `days.js`, streaks and freezes, 今日挑战, recap and teaser, situations, then-vs-now; `econ.js`, `ads.js`, `ads-mock.js`, the 5 offers; `story.js from()`; `tools/econ-check.mjs` | No offers on days 0–2; reviews still dealt after the allowance; no 7th ad a day; an offer never shows beside an answer panel; a save asks the same line again; the ranker's picks are identical with ads on and off; ads ≤ 15% of session time in sim | The whole loop, with mock ads |
| **P6 Platform** (each step needs your OK) | `pack.mjs --web`; private hosting; then a public PWA and aggregate analytics with remote config; then Capacitor with AdMob, UMP and native speech | Beacons hold only allowlisted counts, ≤ 4 KB; D1/D7 recomputed from synthetic beacons | A real link to share, then an app |

- **In parallel:** P4 runs beside everything. `stretch.js` runs beside P1. `ads-mock.js` runs beside P2–P3.
- **One agent at a time** may edit ask.js, feed.js, mix.js or audio.js.
- **WebKit:** add a Playwright WebKit smoke test, plus an iPhone checklist each release.

## 12. Decisions for you (with my recommendation)

1. **Where v2 lives for real testing:** a private, login-protected web app on Cloudflare (a new `kuaishuo` project, never freelearninggame) once content passes about 30 scenarios. A public PWA after P5. **Recommend yes.**
2. **Aggregate analytics** (daily counts, no IDs) when hosted. **Recommend yes.**
3. **Ads:** mock ads throughout v2. Apply to Google's H5 Games Ads beta now (free, slow). Accounts with AdMob and the app stores ($99 + $25) only once D7 data looks good. **Recommend.**
4. **A paid native-speaker reviewer**, about 1 hour per 10 scenarios. **Recommend yes.** It's the one thing agents can't fully replace.
5. **ElevenLabs:** not yet. Re-check the estimate after P4.
6. **Subscription:** not in v2. Revisit with real D30 data.
7. **Move the project out of `freelearninggame/`** to `~/Documents/kuaishuo` before P6. It's nested and hidden from that repo today.

## 13. Verification

- Every phase:
  - `node tools/test.mjs` (the full matrix, now including `--nomic`);
  - `node tools/modes-check.mjs`;
  - `node tools/judge-check.mjs` (0 errors, 0 fumbles);
  - pack-size checks;
  - `--dist` runs against the packed page.
- **P1–P3:** `tools/model-check.mjs` and `tools/sim.mjs` must meet the thresholds in §11. Sim reports go to `review/sim/`.
- **P5:** `tools/econ-check.mjs` with `KS_NOW` day jumps and `KS_AD` modes, plus the ranker invariance test (ads on/off).
- **By hand each phase:**
  - play the new start, a session or two, and a save, rewind and allowance with mock ads, on the local server with the mic, in Chrome;
  - play the pocket edition on your iPhone;
  - you approve each content batch through `review/gate/`.

## Critical files

- **Changed:**
  - app/protos/mix.js (dealing moves to rank.js)
  - app/shared/feed.js (onActive, lazy dealing, replace)
  - app/shared/ask.js (events, assist, level 0)
  - app/shared/store.js (shared kv, srs history)
  - app/shared/story.js (`from()`)
  - app/shared/content.js (`tailor()`)
  - app/shared/text.js (gloss and reveal events; pinyin per word)
  - app/shared/audio.js (rate via stretch.js)
  - the four format files (read `ctx.assist`; call patience, chase rates)
  - tools/build.py, tools/validate.mjs, tools/pack.mjs, tools/test.mjs, CONTENT.md
- **New in app/shared/:** levels.js, events.js, learner.js, assist.js, rank.js, stretch.js, days.js, econ.js, ads.js, ads-mock.js, config.js
- **New in tools/:** sim.mjs, model-check.mjs, econ-check.mjs, factory.mjs
- **New in docs/v2/:** the three detailed designs

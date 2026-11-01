<!-- A planner's design for volume 2 (The algorithm and the learner model), 30 Oct 2026. The plan in README.md wins where they differ. -->

# 快说 v2: the algorithm and the learner model

**Honestly:** one phone sees one learner, so v2 is a per-learner model plus a bandit ranker with hand-set priors. The population half of a "TikTok algorithm" (cross-user difficulty, what keeps people like you) needs users and a server. v2 logs what that server needs and later reads its output as `data/priors.json`. Content is the hard limit: 20 scenarios is about an hour of new play, and only 17 of the 107 lines are L1. Ranking stretches that content; it can't replace it.

Root: . (bare file names are in app/shared/, app/protos/ or tools/). New DOM-free modules go in app/shared/, with time and storage injected so Node can run them: `log.js`, `model.js`, `rank.js`, `assist.js`.

## 1. Events (`log.js`)

- **Line row**, from ask.js `settle()` (560): item, mode, attempt, assist, hint, Hear count, tries, result, stars, perfect, slip, tone and homophone notes, missing groups, pinyin-only, counted, peeked, clock, and **thinking ms** (held time excluded: sum it in `hold()`, 132).
- **Card row**, from a wrapper round each controller in mix.js `card()` (178-187): kind, id, assist, dwell, `dataset.state` at `leave()` (skipped/abandoned/finished), progress (`hooks.step`, story.js:9), outcome, stars, exit by swipe/Next/key, replays, like, gloss taps and English reveals (text.js:101-131), peeks (call.js:240), write misses, shadow result, and the ranker's reason, predictions and propensity.
- **Session row:** start, end cause, cards, minutes.

**On the phone:** `ks.log` = `{v:1, rows:[[positional]]}`, about 90 B a row, a ring of 3,000 (about 270 KB), writes debounced 1 s; `ks.model` about 15 KB. Check that `ks.*` survives a reload in the artifact; if it doesn't, each visit cold-starts from priors.

**Server (owner decision; recommend after a public deploy, opt-in, anonymous):** the same rows minus free text (`heard`), sent daily to Cloudflare D1 as in freelearninggame. Back comes `priors.json` (about 20 KB): item difficulties, mode and assist effects, engagement priors per persona.

## 2. Learner model (`model.js`)

Six skills, bifactor: θk = θg + δk, each with a variance s². Loadings w and evidence weight ω (last column):
```
speak         S .45  V .30  T .15  L .10   1.0
say & check   S .40  V .40  L .20          0.4
type chars    W .45  V .35  R .20          1.0
type pinyin   V .75  W .25                 0.8
tiles         R .55  V .35  W .10          0.5
write card    W .70  R .30                 0.8
shadow        L .40  S .40  T .20          0.3
```
Calls shift .3 of each loading to L. A typed answer counts as two observations: sound right (judge ok → V) and characters right (no homophone, not pinyin-only → W). That split is what tells a heritage speaker from a beginner.

**Outcome y:**

| Result | y |
|---|---|
| Perfect first try, no paid help | 1.0 |
| Slip, tone or homophone note | 0.8 |
| Frame hint, or attempt 2 | 0.55 |
| Answer shown or heard, attempt 3+, or "That should count" | 0.2 |
| Wrong, then timeout | 0.05 |
| Silence, skip, or Missed it twice | 0 |

Add 0.1 for thinking under 35% of the clock, subtract 0.1 over 90%. Self-rated y shrinks 30% toward 0.5.

**Update** (Elo with uncertainty: one Laplace step of Bayesian logistic regression):
```
z = θg + Σ wk·δk − (bi + Δb_mode) + β_assist   p = σ(z)   g = ω(y−p)   H = ω·p(1−p)
θg += sg²·g/(1+sg²H)          sg² ← 1/(1/sg² + H)
δk += sk²·wk·g/(1+sk²wk²H)    sk² ← 1/(1/sk² + wk²H)
bi −= ρ·si²·g/(1+si²H)        si² ← 1/(1/si² + ρH)    ρ = 0.3, |bi − bi⁰| ≤ 1
β_assist += 0.02·g            each day away: every s² += 0.01
```
**Item prior** (logits; build.py adds the features to each phrase as `f`, +2 KB):
`b⁰ = −1.0 + 0.67(level−1) + 0.10(chars−7) + 0.30(needGroups−1) + 0.35·max(0, 4.5−zipf)`, with s⁰ = 0.7.
- zipf is the rarest need word's log10 frequency per billion, from jieba's dict.txt (build.py:724). Examples: 借 4.9, 押金 3.2.
- Δb_mode: tiles −0.7, self −0.3, speak 0, pinyin +0.2, characters +0.5.

**Cast lines** are listening/reading items. Their b comes from the scenario's `lis` feature (chars/s, length, zipf); they count to L in calls, else to R. A line left unhelped on a finished card gives y = 1 (ω 0.1); a line that was glossed, revealed, replayed or peeked gives y = 0 (ω 0.3).

**Reviews:** the Leitner boxes (store.js:28-46) still decide what's due. A review predicts R·p, with R = 2^(−Δt/(4·interval)), which is 0.84 at the due time.

**Persona priors** (θg = row mean; s 1.0, or 1.2 for heritage S and V):
```
at home      L     S     V     T     R     W
Mandarin   +1.5  +0.8  +0.5  +0.3  −1.0  −1.5
Cantonese  +0.2  −0.3  +0.2  −0.5  +0.3  −0.8
studied    −0.5  −0.5  −0.2  −0.3   0    −0.5
new        −1.5  −1.5  −1.5  −1.2  −1.5  −1.8
```

## 3. Placement in the first minute

- **One first-run sheet, two taps, skippable:**
  - "Growing up, did you hear Chinese at home?" (the four persona rows).
  - "What would you love to do?" (family, travel, reading and writing, fun). This sets topic priors and gap weights: family L, S, V ×1.3; reading and writing R, W ×1.5.
- **Card 1 is the persona's hook:** airport-esim by default, mum-calling for Mandarin plus family, hotpot-spicy for new.
- **Adaptive probes:** from card 1's second beat, for 12 lines (or until sg < 0.4), each beat's assist aims at p ≈ 0.7 instead of τ. That is the most informative point while still mostly winning.
  - Card 2 or 3 tests the suspected extreme: a call for heritage listening, a chat for reading.
  - One "Bonus: a Level 3 line" checks the ceiling, never after a miss.

## 4. The For You ranker (`rank.js`)

Replaces mix.js `order()`/`more()`. v1 stays available at `#mix?deal=v1`.

**Candidates (about 150):** unplayed scenarios at their assist, rematches (lost earlier, or liked 3+ days ago), due reviews (a flash crisis, or a run when 3+ are due), write, write-again, shadow, the next series episode, a probe, a recap.

**Hard rules:**
- Session card 1 is a scenario at p̄ ≥ 0.85 with the top E.
- No format twice running.
- Nothing under p̄ 0.55 even at A5 (probes aside).
- While anything is due, a review at least every 4th card, never two in a row.
- Reviews, writes and shadows together ≤ 40% of a session.
- Write ≤ 1 in 4 cards, shadow ≤ 1 in 5, neither in the first 3.
- Probes ≤ 1 in 6, never after a loss.

**Score** = 0.35E + 0.30F + 0.25V + 0.10N, each term 0-1, plus 0.15 for a series in progress:
- **E (engagement)** = 0.5·format draw + 0.3·topic draw + 0.2·scenario prior.
  - Format and topic (about 8 clusters, from a new `topic` field) are Beta arms.
  - Priors come from the critics' ranking: scene .78, call .76, chat .72, chase .70, weight 4; goal topics Beta(4,1).
  - Updates: finished +1α; left before 30% +1β; left at 30-90% +0.5β; like or replay +1α; counts ×0.98 each session.
- **F (difficulty fit)** = exp(−½((p̄−τ)/0.1)²), where p̄ is the mean predicted line success at the chosen assist.
- **V (learning value):**
  - Review: 0.5 + 0.5·min(1, overdue/interval).
  - New scenario: 0.6·new-line share + 0.4·Σ gk·loadk, where gk = goalk·σ(1.5(θ̄−θk))·(1 − sk/s⁰). The confidence factor means tones, unobserved without a mic, aren't chased.
  - Write gW; shadow mean(gL, gS, gT); rematch 0.5.
- **N (variety)** = 1 − 0.5[same format as last] − 0.25[format in last 3] − 0.25·tag overlap. Add 0.2 for a format not yet tried in session 1.

**Target success τ:**

| Situation | τ |
|---|---|
| Base (under the "85% rule", because self-rating flatters) | 0.80 |
| A returning session's cards 1-2 | 0.90 |
| One card after a loss, or 2+ misses in 5 lines | 0.92 |
| One card after 3 cards at ȳ ≥ 0.85 ("Harder one?") | 0.70 |
| When tired | 0.88 |

**Exploration:** Thompson sampling, 16 draws a pick; the first draw decides. The propensity is the share of draws the pick wins, logged for off-policy evaluation.

**Fatigue:** f = 0.4·min(1, minutes/20) + 0.3·clamp(thinking ÷ session median − 1) + 0.3·(skips + timeouts in last 5)/5. Over 0.5: short cards and τ 0.88.

**End on a high:** triggered at f > 0.7, after 12+ minutes on a win, or near the free-play quota.
- Deal a sure win (p̄ ≥ 0.9, ≤ 60 s), then a recap: lines nailed, words written, "4 phrases back tomorrow", the next episode's hook.
- The ranker is ad-blind: nothing gets harder because a save or replay offer could follow.

**Lazy dealing:** feed.js asks `more()` 3 cards ahead (41). Make that 1, and add `feed.replace(i, item)` for a card not yet entered. `pick()` runs as a card comes on screen (`onActive`, 36) and again at its `done` (mix.js:66's observer), swapping the next card if the choice changed. A pick takes under 2 ms.

## 5. Adaptive difficulty (`assist.js`)

| Level (β) | Clock, help, prompt | Pinyin / English | Call, chase, write leniency |
|---|---|---|---|
| A0 (−.5) | ×0.7, none, cue | none / none | patience ×0.6 and 1 nudge, ×1.4, 0.9 |
| A1 (−.25) | ×0.85, none, cue | model / tap | ×0.8, ×1.2, 1.0 |
| A2 = v1 (0) | ×1, none, cue | new / tap | ×1, ×1, 1.2 |
| A3 (+.5) | ×1.5, none, mission | all / show | ×1.5 and free peek, ×0.75, 1.3 |
| A4 (+1.2) | off (skip at 40 s), free frame, mission | all / show | no hang-up, ×0.5, 1.5 |
| A5 echo (+2.5) | off, free answer (cards.js:125), mission | all / show | subtitles on, ×0.4, trace twice |

- **Choice:** per card, the hardest level with p̄ ≥ τ, at most one step from last time.
- **Mid-scenario:** a line at y < 0.3 moves the remaining beats up one level. Two lines at y ≥ 0.9, each answered inside 40% of the clock, move them down one.
- **Mode** is a rung too (tiles < say & check < pinyin < speak < characters), aimed at the biggest gap the model is confident about.
- **Honest review:** free help caps review credit (`srs.record`, ask.js:499) at 2★ for A4 and 1★ for A5.
- **Pinyin by model:** show pinyin over word w while σ(θR + 0.4·log2(1+seen) − 0.5(4.5−zipf) − [looked up]) < 0.8. This replaces KNOWN = 6 (store.js:50).
- **Settings** get an Auto option; a setting the player pins always wins.
- **Wiring:**
  - Fold the four copies of the TIME table (ask.js:29, call.js:30, scene.js:316, cards.js:113) into `assist.clock()`.
  - Formats read `ctx.assist` (mix.js:179) into their ask() opts, plus call patience (call.js:286), chase rate (chase.js:113) and write leniency (cards.js:264).

**Decoupled difficulty:**
- An `in` level (the pinyin/English column, call subtitles, replays, slow voices) is set from θL/θR against the story's `lis`.
- An `out` level (clock, help, mode, prompt) is set from the line's b.
- So a Mandarin-at-home learner gets a call without subtitles, but a free frame on the typed line.

**New audio: slower cast lines.**
- Stretched with atempo like today's slow answers, they need no new voicing. But 939 s × 1.28 ≈ 6.4 MB of base64, which overflows the artifact's 2.57 MiB of headroom.
- Recommend a pitch-preserving stretch on the phone instead: WSOLA on the decoded PCM, `audio.play(url, a, {rate: 0.8})`, zero bytes. Judge it by ear on one scenario first.
- Use atempo packs only for served builds. No paid voices needed.

## 6. Testing without users (`tools/sim.mjs`)

- **Learners:** the four personas plus advanced, 200 each.
  - True skills = prior + N(0, 0.6²), with 10% mislabelled.
  - True b = b⁰ + N(0, 0.5²); true β within ±30% of the prior. The model starts wrong, as it will with real users.
- **Answers:** P = σ(z_true) per attempt, with the hint bonus on retries. Self-rating over-claims by 0.1 in half the runs. Each line adds 0.01·wk to the true δk; memory half-life doubles on success.
- **Engagement is assumed**, so it runs three ways (base, failure-averse, boredom-averse):
  - P(abandon card) = 0.05 + 0.4·max(0, 0.6−p̄) + 0.2[same format].
  - P(end session) = 0.04 + 0.25[lost or 2+ misses] + 0.1[p̄ > 0.97] + 0.01·minutes.
  - P(back tomorrow) = 0.55 + 0.15[ended on a win] + 0.1[8+ min] − 0.15[frustrated].
- **Baseline:** 14 simulated days against v1, with its order()/more() moved unchanged into a DOM-free `app/protos/deal-v1.js`.

**Accept** when, for every persona and every variant:

| Check | Threshold |
|---|---|
| Line success | 0.72-0.88, and ≥ 0.65 in session 1 |
| Hard-rule violations (first card p ≥ 0.85 included) | 0 in 10,000 picks |
| Calibration error (ECE) | ≤ 0.05 |
| θ RMSE | ≤ 0.5 after 50 lines |
| Placement error | < 0.6 after 12 lines, for 80% of learners |
| Assist changes | ≤ 2 per 5 cards |
| Variety | 3+ formats in the first 5 cards |
| Due reviews served within 2 sessions | ≥ 85% |
| Sessions ending on a win | ≥ 70% |
| D7 proxy | ≥ v1 + 10% |
| True skill gain at day 14 | ≥ v1 |
| Storage at 90 days | log ≤ 300 KB, model ≤ 30 KB |

Also: `tools/model-check.mjs` recovers synthetic θ within 0.4, and `test.mjs --only=mix --input=all` passes.

**Phases:** log → model and build features (`f`, `lis`, `topic`) → sim with the v1 baseline → ranker and feed → assist ladder → placement → server (owner's decision).

### Critical Files for Implementation
- app/protos/mix.js
- app/shared/ask.js
- app/shared/feed.js
- app/shared/store.js
- tools/build.py

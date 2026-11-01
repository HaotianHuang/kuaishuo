<!-- A planner's design for volume 2 (Retention loops, rewarded ads, platform and measurement), 30 Oct 2026. The plan in README.md wins where they differ. -->

# 快说 v2: retention loops, rewarded ads, platform, measurement

The ranker and difficulty are planned in other parts; §2 says what this part needs from them. There are five new modules in `app/shared/`: `days.js`, `econ.js`, `ads.js`, `metrics.js` and `config.js`. store.js should export `kv` (its private read/write) so the new modules share the `ks.*` keys and its memory fallback.

## 1. Retention loops

**First session (decides D1).**
- Open straight on the feed and move the launcher to `#lab`. The sound gate becomes the hook: "Your phone just died at Pudong. Tap to start."
- By 8 s, the first freeze, with the frame hint free (`hint:1, free:true`) so the first line is a win. By about 60 s, the end card and the existing swipe pill (`teach()`). Cards 2–5 calibrate the learner (ranker plan).
- The first end card asks one question with one tap: "Did you grow up hearing Chinese?" (a prior for heritage speakers). The age gate (§4) is on the same card, so nothing leaves the phone before it. Session 1 has no ads and no permission prompts.

**Series.**
- `content/series/<id>.json` holds a shared cast. Episodes add `series`, `ep` and `next` (the cliffhanger).
- `build.py` `assign()` hashes `series/character` instead of `scn.id/character`, so 外婆 keeps the same voice in every episode.
- Series 1, "回国 Going Back", re-cuts v1: airport-esim, taxi-airport, family-group, new-year-dodge, meet-parents. Light rewrites make the relatives the same people.
- One episode drops each day at 6 am; up to 3 can wait unplayed.

**Streak.**
- The day key is the local date of (now − 4 h), so late-night sessions count for that evening. One story or three reviews keeps the streak.
- Freezes: one earned per 7-day milestone (hold up to 2), spent automatically on a missed day.
- By ad: +1 freeze a week, and one repair a month within 48 h.

**Daily challenge 今日挑战.** The same story for everyone that day (`hash(dayKey) % pool`), with one modifier (panic clock or no pinyin). The result is plain text that pastes into WeChat: `快说 #42 🐯 🟩🟩🟨🟩🟥 4/5`. It is free and doesn't count against the daily allowance.

**Visible progress.**
- *Situations you can handle*: a story won at ≥2★ whose phrases have all reached srs box ≥3 (recalled after a day) becomes a stamp. This is the headline number.
- *Phrase deck*: the `#phrases` page with a mastery ring per phrase, e.g. "37 phrases · 14 solid" (box ≥4).
- *Then vs now*: srs entries keep `hist` (the last 8 scores). When a phrase you once missed comes back at 3★, you get a card: "Monday: missed. Today: nailed."

**Recap and teaser.** Shown when the daily allowance runs out, or after 15 min:
- lines said, % from memory vs last week, the streak;
- "3 situations to lock in tomorrow";
- tomorrow's episode with its cliffhanger.

Below it the feed carries on (reviews, replays, write and shadow cards). Only new stories are limited.

**Notifications by platform.**

| Platform | What works |
|---|---|
| Artifact, Safari tab | None. |
| iPhone Home Screen web app (iOS 16.4+) | Web push after a tap. But SpeechRecognition isn't available there (WebKit bug 225298, closed "later"; check on the owner's iPhone), so it's push or the mic, not both. Fallback: an `.ics` daily calendar reminder. |
| Android Chrome | Web push sent from a Worker. |
| Native | `@capacitor/local-notifications` at the learner's usual hour, with no server. |

At most one a day, and weekly after 3 are ignored. Never give a reward for turning them on (Apple 5.1.2(i)).

**Sharing** (family WeChat and WhatsApp groups, Instagram, TikTok):
- the challenge text;
- a 1080×1920 line card drawn on a canvas and shared with `navigator.share({files})`;
- "Send it to 外婆": your own recording of the line (native app). This is the strongest loop, because the reward is a reply from family;
- 9:16 scene clips for TikTok, to bring in new users.

Share links carry only `?s=challenge-42`, never a user ID.

**What matters most.**
- D1: the first session, then the teaser and the reminder opt-in.
- D7: streak and freezes (Duolingo's streak wager raised D7 by 14%, relative), daily episodes, reminders.
- D30: learning you can see working, enough content, family sharing.
- Content runway: at 5 new stories a day and about 12 active days a month, a user still here at D30 has played about 60 stories. v1 has 20. Don't launch publicly before 60 stories (or 40 plus remixes).

## 2. Rewarded-ad economy

| Placement | Where | Reward | Free path | Cap |
|---|---|---|---|---|
| Save | Chase caught (after `catchNow()`, before `C.caught` plays); the lose end cards (`finish`, `over`) | Resume at the missed beat with attempt-2 help; a chase resumes at 10 m | ↻ Again; 1 free save a day | 3/day |
| Rewind | End card of a story with a real fork | The other branch's line and its ending | none | counts toward the 6 views/day |
| More stories | `{kind:'allow'}` card in `more()` (mix.js:160) after `newPerDay` (5) | 2 more new stories | Reviews, replays, cards, the challenge | 3/day |
| Episode now | Teaser card | Tomorrow's episode today | Wait, or clear the due reviews | 1/day |
| Freeze, repair | Streak card | +1 freeze; repair within 48 h | Milestone freezes | 1/week, 1/month |

- An ad buys another try at the line, never the answer. This needs `story.js` `from(steps, beatId)`, which continues along the right-answer path; cards.js `restage()` already walks that path. Saves in review runs are free.
- Rewind needs real forks. v1's 23 or-branches have only one distinct ending (hotel-wakeup), so every new episode needs one.
- 5 stories is about 25 new phrases a day, close to Anki's default pace for new cards. First experiment: `newPerDay` 5 vs 8 vs unlimited.

**Rules** (all numbers in `config.json` → `econ`):
- Opt-in only: a button that names the reward. No interstitials, banners or pre-rolls.
- Never mid-line: no offer while `.ks-ask` is on screen or a card is `playing`. The one exception is the pause when a chase catches you. No offers in the first 2 cards of a session, and at most one per card.
- Honeymoon: no offers until 3 days played and 15 stories finished. During it saves are free (3/day) and the allowance is 8 stories.
- After the honeymoon: at most 6 views a day, 90 s apart. A declined placement isn't offered again for 10 min.
- If no ad is available, grant the reward anyway (up to 2/day).
- Where ads are off (under 13, consent refused, or the kill switch), the honeymoon rules stay on.

**The ranker must not sell saves.**
- One-way wall: `rank.js` never imports `econ.js` or `ads.js`. The economy only tells `more()` whether a new story may be dealt.
- Test: with the same seed and history, the ranker's next 100 picks are identical with ads on and off.
- Difficulty aims at 75–85% recalled from memory and never changes during a run. The try after a save is easier, never harder.
- Guardrail: if more than 20% of the last 20 runs were lost, step difficulty down. No experiment arm changes difficulty and ad caps together.

**Interface** (`ads.js`):
- A provider is `{init, ready(placement) → bool, show(placement) → {rewarded, why}}`.
- `watch(placement)` checks the economy, stops audio, locks the feed, shows the ad and grants the reward.

**Mock** (`ads-mock.js`):
- A full-screen `.ks-ad` with a 5 s countdown through `time.js` `ms()`, and a close button that gives up the reward.
- Tests set `window.KS_AD` to `reward`, `dismiss`, `nofill` or `error`.
- Offer buttons carry no `data-test-go`, so the v1 test matrix runs unchanged.

| | Web: Google H5 Games Ads | Native: AdMob in Capacitor |
|---|---|---|
| Access | Closed beta via an interest form; approval not guaranteed | `@capacitor-community/admob` 8.2 (Capacitor 8.5+), with UMP consent and ATT |
| Flow | `adBreak({type:'reward', …})`: show the offer only once `beforeReward` passes `showAdFn`; grant in `adViewed` | `prepareRewardVideoAd` when the end card appears; grant only on the `Rewarded` event |
| Rewarded eCPM | Tier-1 countries $6–15 gross (AppLixir, an ad vendor) | US ~$13–17 (Appodeal, Q4 2024), or $24–30 (Tenjin×CAS, Q2 2024, games); AU $19.9 iOS, CA $23.1 Android (Tenjin); UK ~$10.7 (maf.ad) |

AppLovin MAX has no official Capacitor plugin, so add it later through AdMob mediation.

**Subscription is worth noting.** Ads bring in cents per install (§5), and Duolingo made 84% of its 2025 revenue from subscriptions. A later 快说+ would remove ads and unlock unlimited new stories; reviews and the challenge stay free.

## 3. Platform path

| Step | Unlocks | Costs | Needs the owner |
|---|---|---|---|
| 0. Artifact (now) | All v2 logic and the demo ads (~50 KB of JS) | Room for only about 4 more stories | Nothing |
| 1. PWA on Cloudflare Pages | Mic in Chrome and Safari tabs; unlimited stories (audio as files, cached by a service worker); Android push; Web Share; Worker + D1; remote config; H5 ads if approved | Free tier: D1 100k rows written and 5M read a day, 5 GB; Workers 100k requests a day | Public deploy, privacy policy, AdSense |
| 2. Capacitor | Native speech recognition (the iPhone gets both mic and notifications), AdMob, local notifications, bundled audio, the app stores | Apple $99/yr, Google $25; a new personal Play account needs 12 testers for 14 days; Apple's guideline 4.2 rejects bare website wrappers | Developer and AdMob accounts |

Step 1 is a `tools/pack.mjs --web` target that writes `dist-web/` with:
- data and audio as separate files;
- a doctype, charset and viewport, which index.html lacks today;
- `manifest.webmanifest`, `sw.js`, `privacy.html`, `functions/api/`, `schema.sql`, `wrangler.toml`, set up like freelearninggame.

## 4. Compliance

- **Ads consent:** the EEA, UK and Switzerland need a Google-certified TCF CMP. Use Google's UMP, with Settings → Privacy options (`showPrivacyOptionsForm`); UMP also handles the US-states opt-out.
- **Analytics:** aggregate counts only, no IDs.
  - UK: no consent needed for statistics since DUAA (February 2026), with a notice and an opt-out.
  - EEA: ask first.
  - US, CA, AU: a notice and an opt-out.
- **Age:**
  - A neutral birth-year picker before any data leaves the phone or any ad is shown.
  - Under 13: no ads and no analytics (amended COPPA, compliance date 22 April 2026).
  - Under 16 in the EEA: `tagForUnderAgeOfConsent`.
  - Stay out of the Kids category (Apple 1.3).
  - Native: read the store's age signals where the law requires it (Apple Declared Age Range, Google Play Age Signals; Texas SB 2420 is in force under a Fifth Circuit stay). Never use them for ads or analytics.
- **ATT:** don't ask in release 1; AdMob serves without the IDFA.
- **Store rules:** Apple 3.2.2(x) allows rewarding users for watching an ad; 3.2.2(iii) bars apps built mainly to show ads.
- **Privacy policy:** the learner model stays on the phone; speech goes to Apple's or Google's recogniser; Google shows ads with consent; the server keeps daily counts only, with no IDs or IP addresses.

## 5. Measurement

**On the phone** (`metrics.js`): today's counters and histograms, not an event log. Hooks:
- `feed()` `onActive` (it exists but is unused) and `leave()` reading `el.dataset.state`, where `playing` means the card was swiped away mid-story;
- a wrapper on `marks.done()`;
- the `ask()` result (ask.js:499 and :551), plus seconds to verdict;
- `srs.record`;
- ad offers, views and no-fills;
- sessions (30 min in the background ends one).

A `#stats` page shows all of it; in the artifact this is the only analytics.

**Server** (Pages Functions + D1):
- `sendBeacon`, when the page is hidden, sends deltas (amounts added since the last send), so the totals need no ID: `{cohort, dayn, plat, arms, src, m, h}`.
- One `active` ping a day.
- Region comes from `request.cf.country`. A daily hash is kept only to stop floods.
- One table: `tally(day, cohort, dayn, plat, region, arm, metric, bucket, n)` WITHOUT ROWID, upserting `n = n + ?`.
- D_n = active(cohort, n) ÷ active(cohort, 0).
- At about 15 rows per beacon, the free tier lasts to roughly 3k daily users.
- PostHog or Firebase would need IDs and consent everywhere.

**Honest limit.** On the phone, the algorithm can only learn one learner. The server adds the population:
- per-story counts of finishes, swipe-aways and losses;
- per-phrase recall rates;
- "came back the day after story X" (worked out on the phone and sent as a count).

These go back in `config.json` as priors for the ranker.

**Config and A/B.**
- `config.json` is cached for up to 1 h; its defaults are baked into `config.js`, so the artifact runs offline.
- Arm = `hash(seed + id) % 100`, with the seed from `crypto.getRandomValues` (pack.mjs bans `randomUUID`).
- Sample sizes at 80% power: D1 35→40% needs about 1,500 installs per arm; D7 15→18% needs about 2,400.
- Below about 5k installs, decide by judgement against the guardrails, and keep a 10% ad-free holdout.

**Targets for the prototype**

| KPI | Target / floor | Reference |
|---|---|---|
| D1 | 35% / 25% | Education apps ~14–15%; top-quartile games 27–30% |
| D7 | 15% / 10% | Top-quartile games 7–8% |
| D30 | 6% / 3% | Education apps 2.2–2.7% |
| DAU/MAU | 25% | Duolingo 37% |
| Sessions | Median ≥7 min and ≥6 cards; ≥75% of stories finished; ≤15% swiped away mid-story | |
| Learning | 75–85% of reviews recalled from memory; ≥8 situations by D7 | |
| Ads | 0.6–1.5 views per daily user; ≤15% of runs end in a save offer; holdout D7 gap ≤1 point | |

**Unit economics.** Ad revenue per daily user (ARPDAU) = views per daily user × fill × eCPM ÷ 1000 × the share past the honeymoon. Assumptions: 1 view a day; fill 90% native, 60% web; 70% of daily users past the honeymoon.

| | eCPM | ARPDAU | Per 1,000 daily users a month |
|---|---|---|---|
| US native | $15 | $0.0095 | $285 |
| CA, AU native | $12 | $0.0076 | $230 |
| UK native | $10 | $0.0063 | $190 |
| Web H5 | $6 | $0.0025 | $75 |

At the target retention curve, an install gives about 7 active days in 90, about 5.5 of them past the honeymoon. That is about 7¢ per US native install, too little to pay for buying users, so growth has to be organic. A subscription (assuming 3% of installs at $6.99 a month, 85% net, kept 3 months) gives about 53¢ per install, roughly 7× the ads.

## 6. Phases and acceptance tests

**A. Artifact-safe**

Builds:
- the five modules, with `ks.days {install, log, streak}` and `ks.econ {day, views, saves, more, last, mute}`;
- the mock ad, the offers, and the allowance, recap, challenge and then-vs-now cards;
- the situations page and `story.js` `from()`.

Tests: `tools/econ-check.mjs`, and `test.mjs --ads= --day=N --fresh`, with Date shifted in `evaluateOnNewDocument`. Pass when:
- there are no offers on days 0–2;
- on day 4, the 6th new-story slot is the allowance card and reviews still come;
- there is no 7th ad in a day;
- `.ks-offer` never appears alongside `.ks-ask`;
- a save asks the same beat again;
- a no-fill still grants the reward;
- under 13 turns off ads and metrics;
- the day rolls over at 4 am;
- a missed day spends a freeze;
- the pack stays ≤15.5 MiB and makes no network calls.

**Later phases**
- **B. Content:** the series format, Series 1, forks, 60 stories.
- **C. PWA:** beacons hold only allowlisted keys and stay ≤4 KB; D1/D7 recomputed from synthetic beacons.
- **D. Native:** Capacitor, speech, notifications, AdMob + UMP + age gate.
- **E. Later:** subscription, server priors.

## 7. Owner decisions (with my recommendation)

1. **Public PWA:** yes, after phase B.
2. **Aggregate analytics:** yes, with no hosted tool.
3. **AdSense and the H5 beta:** apply now; launch the web version without ads.
4. **Apple, Google and AdMob accounts:** at phase D; recruit 15 testers.
5. **ATT:** not yet.
6. **Subscription:** after native D30 data.

Sources:
- [Ad Placement API](https://developers.google.com/ad-placement/apis)
- [H5 beta sign-up](https://developers.google.cn/ad-placement/docs/beta?hl=en)
- [AdMob Capacitor plugin](https://github.com/capacitor-community/admob)
- [UMP consent](https://developers.google.com/admob/ios/privacy/gdpr)
- [CMP rule](https://sourcepoint.com/blog/google-to-require-that-publisher-partners-use-google-certified-cmp-for-eea-uk/)
- [eCPM: Tenjin, Appodeal](https://blog.playio.co/mobile-game-ecpm-benchmarks-2026)
- [UK eCPM](https://maf.ad/en/blog/mobile-ads-ecpm/)
- [Web eCPM](https://www.applixir.com/blog/whats-the-highest-paying-ad-format-for-html5-games-right-now)
- [Apple guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Play testers](https://support.google.com/googleplay/android-developer/answer/14151465)
- [WebKit 225298](https://bugs.webkit.org/show_bug.cgi?id=225298)
- [iOS web push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [COPPA](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule)
- [DUAA](https://www.wiggin.co.uk/insight/key-provisions-of-the-data-use-and-access-act-2025-come-into-force/)
- [SB 2420](https://www.texaspolicyresearch.com/fifth-circuit-keeps-texas-app-store-law-alive/)
- [Age signals](https://reclaimthenet.org/google-to-expand-play-age-signals-api-to-all-users-worldwide)
- [Duolingo 10-K](https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm)
- [Duolingo 10-Q](https://www.sec.gov/Archives/edgar/data/1562088/000162828025049743/duol-20250930.htm)
- [Streak wager](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals)
- [GameAnalytics](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)
- [Education D30](https://www.braze.com/resources/articles/mobile-app-retention)
- [Education D1](https://passion.io/blog/mobile-app-retention-benchmarks-for-creators-course-coaching-apps)

### Critical Files for Implementation
- app/protos/mix.js
- app/shared/store.js
- app/shared/story.js
- app/shared/feed.js
- tools/pack.mjs

# P5c: the world (design and contracts)

The owner's call (31 Oct 2026): what keeps people coming back is relationships. P5c turns 快说's stories into one world
with one cast: several plots running at once, choices the player makes by what they say, and characters who remember
them and message them between visits. The For You ranker becomes the editor of a personal soap opera: which thread
moves next is a pick like any other, made from what this player engages with. P5c is built after P5a and before P5b
(p5.md). The content comes from the content session, through the owner's gate, as before.

## 1. One world, two homes

- **上海, the city:** you've just moved here for a job. The flat and its landlords, the office, a slow-burn romance, a
  courier who always finds you at the worst moment, a neighbour who square-dances at 7 am.
- **老家, the family town** (and its group chat, with members in four time zones): 奶奶 turning eighty, 大姑's phone
  shop, 表哥's van, 二姨 the matchmaker, 外婆's 60-second voice notes.
- **The diaspora edge:** where you grew up stays open (Toronto, Sydney, London, Vancouver: the player's own), so 妈妈's
  calls come from home and the family's questions come from love across a distance.
- **Who "you" are follows the about card** (P3), never stated, never gendered. A heritage player's family is theirs:
  回老家 is going home. A newcomer is adopted: 小李 from the office takes you home for New Year, and 小李's 奶奶
  decides you're hers now. Same town, same voices, the same 奶奶; the threads' `audience` (CONTENT.md) decides who meets
  the family as which.

**The cast already exists, half-connected:** today's 20 stories reuse the same people, and the world makes it official.

| Who | Where they are today | In the world |
|---|---|---|
| 王叔 and 王阿姨 | landlord-leak (王叔 at mahjong while your ceiling rains), rent-rise (房东王阿姨) | your landlords, a couple; their son's wedding is a door game |
| 大姑, 二姨, 三舅, 表姐, 小侄子 | new-year-dodge | the Back Home family (back-home.json has 大姑, 二姨, 表哥, 奶奶) |
| 外婆, 三姨, 妈妈, 大舅, 小凯 | family-group | mum's side, the group chat; 妈 in mum-calling is the same 妈妈 |
| 王总, 小李 | office-boss; 张总 in late-boss | the office: 王总 the boss (late-boss's 张总 is a client, or folded into 王总 in new episodes) |
| 小鹿 | first-date | the slow burn |
| 快递小哥 | courier-crabs | the running gag: he finds you everywhere |
| 大刘 | flat-flood | the neighbour downstairs |

v1's stories stay as they are (their ids and lines never change: progress is kept); new episodes call back to them.
Where a name clashes (two different 王s), the world bible says who's who and new episodes follow it.

## 2. Threads: plots running at once

A thread is a series (CONTENT.md's `series`, generalised): episodes with a cast, a level range, an audience and a
cliffhanger each. Starting threads, for the content session to shape:

| Thread | For | Levels | The pull |
|---|---|---|---|
| 回老家 Back Home | heritage | L2–L5 | going home: the pickup, the job explained to 大姑, a blind-date ambush, 奶奶 in hospital, the 80th-birthday toast (exists: 8 eps planned, 1–3 built) |
| 新来的 The New Hire | newcomers | L0–L3 | the office applauds two words, lunch on a delivery app, lost on the metro, escaping KTV, the boss at 11 pm (planned) |
| 房东 The Landlords | all | L1–L4 | the leak, the rent, their mahjong table, their son's wedding |
| 小鹿 The Slow Burn | all | L2–L4 | from a first date to meeting the parents, or to friends who stay friends: the player decides |
| 相亲相爱一家人 The Group Chat | heritage | L1–L4 | messages between visits: 外婆's voice notes, 三姨's health tips, a cousin's secret engagement |
| 王总 The Office | all | L2–L5 | the report, the 11 pm message, the annual dinner toast, the promotion |
| 你来评评理 You Decide | all | L1–L5 | standalone dilemmas from viral situations (§5) |

- **Episodes a day at a time** per thread (days.js `released`, P5a), so a player with three threads going has three
  reasons to come back tomorrow.
- **Crossovers** are the world's delight: 表哥 visits you in Shanghai; 王阿姨 turns out to know 二姨; the courier
  delivers 奶奶's sausages (the 腊肠 at airport security, Back Home 8). At most one a week, never needed to follow a
  thread.

## 3. Choices made by what you say

The line the player says is the choice. Most language apps ask for *the* right line; here *what* you say decides what
happens, which makes speaking the way you play and makes register (polite, blunt, funny) matter.

- **The mechanism exists:** a beat's `alts` (CONTENT.md) are other things the player can say, each with its own outcome.
  P5c gives an outcome consequences: `sets` (flags the world keeps) and `rel` (how a character feels about you).
- **Kinds of choice:** how you say it (deflect, brag or tell the truth when 大姑 asks your salary); what you promise
  (you'll come to the wedding); what you share (tell 二姨 you're seeing someone); who you are with someone (date 小鹿, or
  stay friends).
- **Every option is a fine thing to say.** Choices are about who the player is, never right or wrong: each option is a
  line judged like any other (its own answers and need words), and the learner model hears it as a line.
- **Branch and bottleneck,** so content stays affordable: a choice changes the next scene's opening lines (a line with
  `when`, below), the end card's teaser, and a callback within one to three episodes; a whole other episode only at a
  thread's turning points, one a season at most. The feel of consequence for about 20–30% more lines, not three times.
- **Delayed consequences:** a flag read episodes later lands harder than one read at once ("上次你说要来我婚礼……").
  Every flag set must be read at least once later (the validator checks).
- **Secret endings:** a branch opened only by a line said perfectly first time (3★), or by a flag from another thread.
  Endings to collect (P5a) counts them.
- **The end card says when something will be remembered:** "表哥 will remember that." Once a choice, and only when a
  flag or a feeling moved.

## 4. Characters who remember you, and message you

- **Feelings:** each character's `rel`, from −2 to +4, starting at 0, moved by choices (±1, rarely 2). Never shown as a
  number: the contacts page says it in a line the content writes for each character and step ("奶奶: thinks you're too
  thin, saving you dumplings"). Low is never cruel: a cool 大姑 is a curious 大姑.
- **Memory:** lines that read flags and feelings (`when`), so the cast refers to what the player did, said and promised.
  One voice per character everywhere (`series/char`, as series do now).
- **Contacts** (the menu): everyone met, their line, the last thing they said, and their thread's next episode.
- **Messages between visits:** an episode's end can schedule a message (`after: "3h"` or `"tomorrow 19:00"`): a short
  chat card (one to three exchanges, chat.js's machinery), the player replying in Chinese. Arrived messages wait in
  **Messages** (the menu, with an unread count) and are dealt early in a visit. The web app can't notify, so the gate
  says it instead: "表哥 sent you a message" becomes the line over the tap (the gate's hook line, P3, reused). In the
  native app (P6) they're notifications from the character, never from the app.
- **奶奶's call:** the player can say when 奶奶 should call (Settings, or her first call asks). At that time a call card
  is waiting (call.js), and the gate says "奶奶 is calling". In the native app (P6) it rings.
- **Never needy, never guilt:** characters miss you warmly ("哎呀，好久不见！") and never scold an absence; nothing
  expires because a player was away, and a message waits as long as it takes.

## 5. 你来评评理 You Decide: viral situations, never posts

- **The format:** a messy everyday dilemma set up in 30 seconds (a narration or a chat), then the player gives their
  verdict *as a line to the person involved*, in Chinese, and a short scene plays what it leads to. Two or three
  verdicts, each a fine thing to say. Later, with a server (P6), "what other players said": real counts only, never
  invented.
- **Sources:** the situations that go viral again and again, never a post. Every story is original writing; no real
  person, no real post, nothing identifiable, and the style rules hold (it ends warm; no politics, no religion; nobody's
  identity is the joke). Reddit's dilemma threads, TikTok's story videos, Xiaohongshu and Weibo's hot topics are where
  the patterns are seen, not what is copied.
- **Situations to start from:** 过年被催婚 (marriage pressure at New Year); asked your salary at dinner; a 相亲
  ambush; how much to put in a wedding 红包; fighting to pay the bill; the cousin who borrows and forgets; the friend
  who's always late; the flatmate eating your food; left on read in the group chat; 社死 moments (a voice message to the
  wrong group, calling your boss 妈); a 凡尔赛 relative; parents forwarding health articles; a partner's parents asking
  about your job; 奶奶 beating you on WeChat's step count; bringing a foreign partner home; "你中文好可爱！"; the 7 am
  square dance; the auntie who saves a seat with her jacket.

## 6. The engine (P5c's contracts)

```js
import * as world from './world.js'           // new, DOM-free; ks.world, kept on the phone
world.init({ store = kv, now })
world.flag(k) / world.set(sets, src)          // flags the world keeps: { k: value }, with where and when they were set
world.rel(char) / world.feel(rel, src)        // a character's feeling, −2..4
world.when(cond)                              // { flag: v } | { rel: { char: '>=1' } } | { all: […] } | { any: […] } → bool
world.inbox() / world.schedule(msg, at)       // messages due and arrived (time.js's clock, so KS_NOW moves them)
world.threads()                               // { id: { ep, done, at } }: where each thread is
```

- **story.js:** an outcome's `sets` and `rel` applied when its beat is answered; lines and beats with `when` played only
  where it holds (otherwise the line without one).
- **content.js:** `tailor(scn, levels, world)` also resolves `when`, so formats never read the world themselves.
- **rank.js:** each thread's next released episode is a candidate; threads get Thompson arms like topics
  (`ks.arms.thread`), so a thread a player finishes and likes moves faster and one they skip rests (never dropped);
  at most two thread episodes a visit unless the player asks for more; arrived messages dealt within a visit's first
  three cards (not first: R1 stands), and 奶奶's call at its time. The ranker is told the world as it's told `released`:
  it never imports world.js, and P5b's wall is untouched.
- **The app:** Messages and Contacts in the menu; the message card; the gate's line for a message or a call; the end
  card's "will remember that"; Settings for 奶奶's call.
- **Content schema** (the content session's): `alts[].sets`, `alts[].rel`, `when` on lines and beats, `secret` on a
  branch, messages (`content/messages/`), threads (series with `audience` and level ranges), and `content/world.json`
  (the bible: places, cast, who's who, each character's feeling lines). validate.mjs: every flag read somewhere later,
  every `when` reachable, every character's lines for every feeling.
- **Checks:** tools/world-check.mjs (Node: flags, feelings, `when`, the inbox under KS_NOW jumps, determinism); the sim
  (threads and messages as candidates; a thread liked gets its next episodes sooner, one skipped rests; D7 with the world
  against P5a's); loops-check extended to choices that persist, a callback heard, a message arriving and its gate line,
  contacts agreeing with the feelings.

## 7. Done when

| Check | Threshold |
|---|---|
| A choice | said in one episode, remembered in a later one (a `when` line heard), and on the end card once |
| Feelings | moved only by choices; the contacts page's line for each character matches |
| Messages | arrive at their time (KS_NOW), wait in Messages, are dealt early in the next visit, and the gate says so |
| 奶奶's call | waiting at the time set; the gate says so |
| Threads | each episode out a day after the last; the ranker advances a liked thread sooner and rests a skipped one, never dropping it |
| You Decide | each verdict a line judged like any other; nothing invented about other players |
| The rest | P2's, P3's and P5a's rows no worse; rank-check, first-check, loops-check, the matrix and --dist pass; the pack ≤ 15.5 MiB |

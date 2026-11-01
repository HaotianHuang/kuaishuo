# The `call` format (接)

An incoming phone call, one card in the feed. The phone rings with a name, a photo and a number; you answer; from
then on it's sound only. Subtitles stay hidden unless you peek, and a peek costs a star. Each `say` beat is a reply
you owe the caller, now: stay quiet and they nudge (喂？喂？听得到吗？), and after the last nudge they hang up. It
trains listening, and speaking under the pressure of a live line.

A call is an ordinary scenario (CONTENT.md): the same cast, steps, `say` beats and shared fields, so the build voices
and glosses it like the others. This page adds one block, `call`, and a few fields on lines and beats. The five calls
in `content/src/call-*.json` use all of them.

## How a call plays

This is what `app/protos/call.js` does, and what the content relies on.

1. **It rings** the moment the card is on screen: `photo` in a pulsing ring, `name` with pinyin (or the `number`,
   big, when the caller isn't in your contacts), `label` (red when it smells of fraud: 境外来电), the lock-screen
   `clock`, a ringtone and vibration. The engine rings by itself, so `steps` never start with `{ "sfx": "ring" }`.
   Decline, or let it ring out (six rings, about twenty seconds), and it's a missed call: `missed` plays as a voice
   message, then they ring again; miss it twice and the card ends there.
2. **On the line, sound only.** Every voice comes through the phone (each cast member has `"phone": true`). The
   photo breathes and a waveform moves while they talk; a second voice on their end (the mahjong table) shows as a
   small bubble. Subtitles are bars as long as what was said, except lines marked `"peek": "free"`. A `narr` is a
   caption on the call screen that stays up until the next line; it isn't voiced mid-call, so leave out its `zh`.
   `sfx` is a sound at either end; `fx` animates the photo. Mute, keypad (it opens) and speaker are there to press.
3. **Your turn.** The shared answer panel comes up low (mic big) with the beat's `cue` in big type: a few words
   that don't translate what the caller just said. The mission `en` replaces it, small, after a Hint or a Peek. Every
   beat has a cue. A first beat's cue names the goal ("You never booked a wake-up call."); later ones can stay vague
   ("Whatever it is: no."). One panel stays open for the whole turn. Without a microphone you say it out loud and
   check, or type: tiles spell the answer out, so on a call they appear only after a peek. In the Mix without a
   microphone (`ctx.typeOne`), one reply a call is typed: the first beat whose key words come to two to four
   characters.
4. **Peek** shows the subtitles of the caller's lines since your last reply, and keeps them up until you reply:
   characters, pinyin by the reading setting, tap for meaning, English on demand, and the full mission `en`. Lines
   marked `"peek": "never"` or `"signal": "bad"` stay `……` even then. A peek buys a hint's help (the frame), so that
   reply earns two stars at most, in the call and in spaced review. Before paying, tap a grey bar: it plays that line
   once more, free. On a short screen the photo steps aside for the subtitles; on a very short one the line also goes
   into the panel.
5. **Silence.** The caller's patience is a bar above the panel, labelled 耐心 · patience, with the caller riding its
   draining end; at half, the caller (and their photo) gets cross. It runs down only while you're silent: building a
   line (a tile, a key, a check) refills it, the microphone and a replayed line hold it, and tiles or typing get twice
   the beat's `time`. When it runs out the caller says the next nudge (the beat's `silence`, else `call.silence`)
   over the open panel, then waits `call.patience`. When the last nudge goes unanswered they hang up: the beat's
   `hangup` steps (else `call.hangup`), the busy tone, 对方已挂断. Silence never plays `fail`.
6. **A wrong answer** stays in the panel (what was heard, and why it's off), the caller says the beat's first `fail`
   line at once (啊？你说啥？), and you try again in the same panel. Wrong answers never make anyone hang up.
7. **It ends** at an `end` step, wherever it is (`steps`, `ok`, an alt's `then`, a `hangup`, `missed`), or when you
   hang up yourself (the red button wants a second tap, and ignores taps just after a panel closes): 通话结束 or
   对方已挂断 and the call's length. The end card fits the phone, with Call back and Next pinned at its foot: the
   closing line, stars, "Type it back", up to three replies that cost a star (else the last two) with 🔊 and gloss,
   and the whole call folded behind "Read the whole call". Opened, every row has its 🔊 and it starts at the lines you
   peeked, missed or lost to a bad line; "Hear it again" plays them all in order with the text blurred. Type it back
   is dictation: the reply that went worst (then the longest, skipping five characters or fewer) plays, and you type
   it with its meaning behind Hint and the other lines out of sight.

## Fields

### `call`, at the top level

```jsonc
"call": {
  "caller": "mum",            // the cast key on the line: whose voice, whose nudges
  "name": { "zh": "妈" },     // optional: the contact name; leave it out for a number that isn't saved
  "photo": "🌸",              // the contact photo: one emoji (👤 for a stranger)
  "number": "139 0000 2468",  // as the phone shows it; display only, never voiced, so digits are fine
  "label": { "zh": "湖南 长沙" },  // optional: the small line under it: where the number is from, or what the
                              //   phone thinks it is (快递外卖, 酒店内线, 境外来电)
  "clock": "20:03",           // optional: the lock-screen time while it rings, 24-hour (05:00 says a lot)
  "patience": 8,              // optional: seconds the caller waits after each nudge (default 6)
  "silence": [                // one to three nudges, said in order as the silence goes on
    { "who": "mum", "zh": "喂？喂？听得见吗？", "en": "Hello? Hello? Can you hear me?" },
    { "who": "mum", "zh": "这孩子，信号又不好了？", "en": "Honestly, this child. Bad signal again?" }
  ],
  "hangup": [                 // after the last nudge goes unanswered; always ends with an end step
    { "who": "mum", "zh": "算了，我等会儿再打给你。", "en": "Never mind, I'll call you back in a bit." },
    { "end": "lose", "en": "Mum hung up. She'll try again in five minutes, and then she'll try your roommate." }
  ],
  "missed": [                 // optional: plays if you decline or let it ring out (a voice message, say)
    { "who": "mum", "zh": "怎么不接电话呀？快接！", "en": "Why aren't you picking up? Answer!" }
  ]
}
```

So the longest silence a beat survives is `time` + `patience` × the nudges: 10 + 2 × 8 = 26 seconds for mum,
8 + 2 × 4 = 16 for a courier with eighty more parcels to deliver.

### On a line (a `who` step, anywhere)

| Field | Values | |
|---|---|---|
| `peek` | `"free"`, `"never"` | Leave it out and the line is hidden until you peek. `"free"`: subtitled from the start (an opening line that sets the stakes). `"never"`: no subtitle, even on a peek. |
| `signal` | `"bad"` | The line breaks up: the engine drops chunks of the audio and adds crackle, and it can't be peeked. `zh` is the whole line as said. Put a beat right after it for asking them to say it again. |
| `pace` | `"fast"`, `"slow"` | Voiced faster or slower than normal: fast for a scammer's legalese or a mother's list. |

### On a `say` beat

| Field | |
|---|---|
| `cue` | A few English words shown during your turn instead of the mission, so the screen doesn't give away what was said ("Don't commit."). A peek shows the mission. |
| `silence` | Nudges for this turn only, in place of `call.silence`, for when silence means something: 您不说话，我就当您同意了啊？ |
| `hangup` | Hang-up steps for this turn only, in place of `call.hangup`. |

## Writing a call

- Put the stakes on the ringing screen: who's calling, from where, at what hour (05:00, 境外来电, 妈).
- Callers sound like the phone: 喂, 是……吗, 那个, 就是说, 你听我说, 好好好. Nobody can see the lines, so keep each one
  short, one idea, and let callers repeat themselves the way people do (下个月再说，下个月再说).
- Your replies are the phone's own chunks, short and quick: 喂，您好, 您说, 我听不太清楚, 您能再说一遍吗, 稍等一下,
  那就这样吧. Give a beat 8 to 10 seconds; the nudges give more.
- Every call gets its own nudges and hang-up, in character, and a beat gets its own when silence means something: the
  hotel takes it as yes to breakfast, mum as yes, there is someone, the landlord as yes to the rent rise.
- One `signal: "bad"` line at most, right before a beat that asks them to repeat it.
- `fail` lines are the caller not following you (啊？你说啥？), never a narrator saying you got it wrong.
- Mind the judge (`app/shared/match.js`). A `need` word of three or more sounds passes with one sound wrong, so
  八零六 would also take 八零八; when one sound is the whole point, split it into two-sound groups,
  `[["八零"], ["零六"]]`. Recognisers write numbers as digits and the judge reads a 1 as 一, never 幺, so list
  幺幺零 and 一一零 both. Mistake notes only show on a miss.

## For the build and the checks

- Every Chinese line the call adds is an ordinary step (`who`, `zh`, `en`), and `tools/build.py` already walks the
  `call` block and every nested list, so `call.silence`, `call.hangup`, `call.missed` and each beat's `silence` and
  `hangup` are voiced (through the phone, as every call is) and glossed like `ok` and `fail`. `name` and `label` are
  `{ "zh" }` with no `who`, so they're glossed (tap for pinyin) but never voiced. `number` is neither.
- `tools/validate.mjs` doesn't look inside these yet; see the requests below.

## Engine requests

Done: a `say` hook can end the scenario (`{ result: 'end' }`), `build.py` honours `pace` and reads 得 right, the
busy tone (`sfx('hangup')`), `ask()` reports `tried` and takes `onMiss`, `mode` and `hint`, and tests hold the clock
for screenshots (`KS_PAUSE`). The call runs its own patience clock (ask() gets `time: 0`), so it doesn't need
`tried`. `signal: "bad"` needed nothing: the call plays the clip in bursts and crackles the holes. Still open:

- **`ask.js`**: a way to hide one mode, or to start in one even over the player's setting. A call keeps tiles back
  until a peek by hiding their tab in CSS and switching a tiles start to say-and-check.
- **`tools/validate.mjs`**: check the call-only lists like `steps`, and that `call.caller` is in the cast, every cast
  member has `"phone": true`, `silence` is one to three `who` lines, every `hangup` ends with an `end`, and `peek`,
  `signal` and `pace` take only the values above.

## The calls

| File | Level | You learn to say |
|---|---|---|
| `call-courier-crabs` 快递找不到你 | 1 | 喂，您好 · 我听不太清楚 · 放快递柜吧 · 放门口就行 · 我马上下来 |
| `call-mum-calling` 妈来电话了 | 2 | 吃了吃了 · 到时候再说吧 · 不着急 · 知道了知道了 · 那就这样吧 |
| `call-hotel-wakeup` 凌晨五点 | 2 | 我没订 · 稍等一下 · 我是八零六 · 不用了，谢谢 · 先这样吧 |
| `call-police-parcel` 警察来电 | 3 | 是我，您说 · 您能再说一遍吗 · 您的警号是多少 · 你是骗子吧 · 我要报警了 |
| `call-landlord-leak` 天花板在下雨 | 3 | 您先听我说 · 天花板漏水了 · 跟下雨一样 · 盆里有条金鱼 · 房租还涨吗 |

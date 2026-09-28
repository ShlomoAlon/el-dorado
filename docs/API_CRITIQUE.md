# El Dorado Expedition — API critique and proposed design for the Rust engine

Reviewer's input: `docs/API_SPEC.md` at commit `d729c3d` (cited as "spec §x.y" and "NOTE n" = item n of spec §5), plus the
cited sources (`src/engine_*.js`, `src/worker.js`, `src/client/*.js`). Nothing in the repo was changed.

Priority labels used throughout:
- **MUST** — decide/do before (or as the first step of) the Rust rewrite; changing it later means migrating twice.
- **NICE** — clear improvement, can land any time, cheap.
- **LATER** — worth doing once the Rust engine is live or the project grows.

Contents
0. The short version (overall shape + top 10)
1. Bugs worth fixing now (in the current JS, independent of the rewrite)
2. Design principles for the new boundary
3. Engine API: proposals E1–E15
4. AI / training API: proposals A1–A9
5. HTTP API: proposals H1–H9
6. WebSocket protocol: proposals W1–W9
7. Client layering: proposals C1–C5
8. Versioning, determinism and replay compatibility plan
9. Deletion audit (unused / single-valued / historical)
10. Target API sketch (Rust signatures + JSON wire shapes)
11. Migration order
12. Disposition of every spec NOTE (1–30)

---

## 0. The short version

**Overall shape.** The spec is long because the API has no boundary: the "engine API" is whatever is in one shared script scope
(62 exports, ~40 more internals the UI calls, 10 mutable globals, caches hung off objects), and every consumer — UI, Worker, 24
tools — drives it by assigning globals, swapping `S` and `RNG`, and poking fields. Each concern exists two or three times: nine
functions change game state (`applyAction`, `resign`, `forceEnd`, `recAct`, `recResign`, `recTimeout`, `replayStep`, `endGame`, and the
Worker's direct `S.log.push`); two replay formats with two RNG disciplines; three undo stacks (engine-less JSON snapshots in the Room,
in the client, and the record truncation rule); rules checks in engine, UI and Worker; English text in state, errors and events;
state shape reused as the redacted view with fake ids. On the server: 16 routes where 13 do, 11 socket message types where 5 do, a
table nobody reads, a toggle message, one-time migrations that run on every start.

The simple design has four nouns and one verb:
- **Game** = setup + secret + commands (the record). State is derived. Storage, replay, undo, reconnect = the same thing.
- **Command** = the one verb: `game.apply(seat, cmd) → events | error`. Moves, buys, undo, resign, timeout — all commands.
- **View** = what one seat may see (`game.view(seat)`); bots, the UI and rule queries (`options`, `legal_actions`) work on views.
- **Event** = the only narrative (animations, journal, sounds, replays); text is made by the UI.
Plus explicit values instead of globals: `Board` (immutable, shared), `Rng` (keyed by secret + command index), `Net`, `Policy`.
That is ~9 WASM functions (§10.2), 13 HTTP routes instead of 16 (§10.4), 5+2 socket messages (§10.5).

**Top 10 recommendations**
1. Fix **B1/B2** now: unvalidated `idx` in `transmit`/`buy` lets any player pollute `Array.prototype`, half-apply an action and throw
   inside the Room, desyncing state from the record (verified); add try/catch around every engine call in the Room.
2. **`Game` handle, no globals** (E1): board, RNG, network, caches become explicit values. MUST.
3. **One `apply(seat, Command)`** incl. Undo/Resign/Timeout/Adjudicate, typed `RuleError` codes (E3, E5). MUST.
4. **Record = storage** (event sourcing): DO and local saves keep the record; undo = truncate to the engine's undo point; `nact`,
   snapshot stacks and `S`/`undo` storage keys go away (E4, C3). MUST.
5. **View ≠ State**: counts instead of fake ids, own deck as a multiset, no log/owners/room/privacy/nact in rules state (E6). MUST.
6. **Structured events only**, text built in the UI; complete the event set (E7, W7). MUST.
7. **Tight actions**: buy/transmit by card type (no src/idx, no index shift), blockades by number, `Continue` for leftover moves (E8). MUST.
8. **Delete before porting** (§9): dead exports (`botTurn`, `MAPX`, `BOT_PLANS`, `setPlan`…), single-valued options (`S.start`,
   `heur2`, `draws`, K), experiment-only search kinds, `join`, the unread `matches` table, historical migrations; merge
   auth routes, match into rooms, lobby setters into `set`, game messages into `cmd`. Archive experiment tools.
9. **Versioning + determinism**: record v3 with `rules`/`rng` versions and checkpoints, protocol handshake for open tabs (H8),
   network file v2 with a feature-schema id (A6); prove the port by differential replay of every stored game (§8).
10. **AI on Views with its own RNG**: `Policy` trait instead of `botChoose(opts)`, `determinize`, batchable `features` and
    `Net::eval` (A1–A5) — reproducible tools, no-cheating by construction, ready for GPU batching.

---

## 1. Bugs worth fixing now

These are defects in the current code (verified where stated), not design preferences. Most are one- to ten-line fixes.

### B1. `transmit`/`buy` accept any property name as `idx` → prototype pollution, half-applied actions, uncaught throw (HIGH)
Spec §1.5 / NOTE 11 say `idx` is validated "by lookup". That lookup is `S.market[a.idx]` / `S.reserve[a.idx]`, followed by
`if(!stack||stack.n<=0)` (engine_rules.js:233-235). A client-supplied `idx` of `"__proto__"`, `"constructor"` or `"length"`
yields a truthy non-stack, `stack.n` is `undefined`, `undefined<=0` is false, so the check passes. Verified with
`src/engine.gen.js` in Node (scratch probe, repo untouched):

| `{t:'transmit', src:'m', idx}` | Result |
|---|---|
| `"__proto__"` | the Transmitter is removed from the hand and trashed, `stack.n--` sets **`Array.prototype.n = NaN`** (isolate-wide pollution), a card of type `undefined` is created in the discard pile, then `CT[undefined].n` throws `TypeError` |
| `"length"` | Transmitter trashed, then `stack.n--` on the number 6 throws `TypeError` (strict mode) |
| `"constructor"` | like `__proto__` (sets `Array.n`) |
| `{t:'buy', src:'m', idx:'__proto__', cards:[]}` | throws before mutating (`CT[undefined].cost`) |
| `{t:'buy', src:'m', idx:'0', …}` | **succeeds**, and the `gain` event broadcast to everyone carries `idx:"0"` (a string) |

Online, `Room.webSocketMessage` has no try/catch (worker.js:392-397): the exception escapes, no error reply is sent,
`this.S` (same object as `E.S`) stays mutated in memory, and `recDo` never records the action (it records only after `f()`
returns). The next persist writes the corrupted state; the stored record no longer reproduces it, so the finished game's replay
diverges; a card whose type is `undefined` later crashes `def(id)` users (client render, bot features) — an AI turn can then throw
on every alarm. Any seated player can trigger this with one hand-crafted `act`.
**Fix now:** in `applyAction`, resolve the stack with
`const arr=a.src==='m'?S.market:a.src==='r'?S.reserve:null; if(!arr||!Number.isInteger(a.idx)||a.idx<0||a.idx>=arr.length) return fail('That card is sold out.');`
for both `buy` and `transmit`; and see B2. (The Rust rewrite removes the class entirely: typed actions, and E8 below.)

### B2. No exception safety around engine calls in the Room (HIGH)
`webSocketMessage` (`act`, `resign`), `alarm()` and `aiMove()` call the engine without try/catch. Any engine exception (B1 or a
future bug) leaves `this.S` partly mutated and unrecorded (see B1); in `alarm()` the Workers runtime retries a throwing alarm a
limited number of times and then gives up, leaving an AI turn with no alarm scheduled → the game freezes until someone
reconnects and acts (and a human can't act on an AI's turn).
**Fix now:** wrap each engine call: on throw, `this.S = JSON.parse(before)`, reply `{t:'error', msg:'Server error.'}`, log it;
in `aiMove`, on throw fall back to `recTimeout` for that seat (the AI forfeits the turn, the game goes on).

### B3. `addAI` races across the D1 await (LOW)
`addAI` checks "room full" and "AI already seated" (worker.js:370-373), then `await`s a D1 query (:374) before pushing the seat.
A D1 call opens the Durable Object's input gate, so a second `addAI` (double click) can pass the same checks meanwhile → the same AI
twice and/or more seats than `opts.max`. **Fix:** repeat both checks after the await (or look the name up before checking).

### B4. The online shuffle secret comes from `Math.random` next to a published value (LOW, cheap)
`startGame` evaluates `seed: (Math.random()*1e9)|0` and then `recNewGame` draws `rng = Math.random()*2^32` (worker.js:417,
engine_rules.js:53): two consecutive outputs of V8's xorshift128+ generator, the first of which is sent to every player
(`S.seed` is not redacted, spec §1.9). `rng` determines every shuffle of the game. Recovering xorshift128+ state from outputs is a
known technique; the room codes (`genCode`, also `Math.random`) leak more outputs. Practical risk is low, the fix is one line:
let the Room pass a secret from `crypto.getRandomValues` (`recNewGame(o, secret)`), and also draw `seed` from crypto.

### B5. Malformed JSON → 500 instead of 400 (LOW) — NOTE 22
`/api/auth/google`, `/api/auth/dev`, `PATCH /api/me` call `req.json()` without catch. Use a `body(req)` helper that returns 400
`{error:'Bad request.'}`; also reject non-string `credential`/`name`.

### B6. The replay viewer's substitute `end` uses `Math.random` (LOW) — NOTE 13
`buildReplay` (ui_replay.js:7-25) replaces a failing step with `applyAction(S.cur,{t:'end',keep:[]})` under `RNG=Math.random`, so
every later position is random. Run the substitute under the same stream the step would have used (`recRng(log.rng,i)` for v2,
the installed stream for v1), and show the failure prominently: a failing step in a server-produced log is itself a bug signal.

### B7. Resigning clears another player's undo (LOW)
`resign` from ANY seat sets `this.undo = []` (worker.js:392). A player who leaves out of turn wipes the current player's
(legitimate) undo. Only clear it when the resigning seat was `S.cur`.

### B8. Quick-match over-assignment strands a player as a spectator (MEDIUM) — NOTE 23
Two `/match` calls can be sent to a room with one free seat; the loser connects as an unseated spectator of a lobby it can never
join (the client never sends `join`, and `join` would fail anyway). **Fix:** on `/ws` in an `auto` room that is full, send
`{t:'error', code:'room_full'}` and close; the client calls `/api/match` again (bounded retries). Alternatively let the Lobby
reserve the seat (uid) at match time — more code.

### B9. Stale lobby entries are never pruned without traffic (LOW) — NOTE 18
`prune()` runs only on `/update`. Call it in `list()` (cheap) or on a daily Lobby alarm.

### B10. Anonymous replay upload can flush and deface the public list (MEDIUM)
`POST /api/replays` needs no sign-in, and each upload is `listed=1` and triggers deletion of all `game=0` rows beyond 1000
(worker.js:185-194). 1000 scripted uploads remove every uploaded replay and fill "Recent replays" with arbitrary titles.
**Fix:** require a token (the page only uploads from the Replays modal; the training tool can use the train token), store the
uploader uid, default `listed=0` for uploads (or list only the uploader's own), and key the id on a content hash so re-uploads
are free (see H6).

### B11. Documentation drift (trivial) — NOTEs 17, 26
HANDOFF says `opts{max,len,turn}`, turn choices 60–180 and key `eldorado-rec`; code has `opts{max,course,turn,pub,rated,auto}`,
300 s allowed, `eldorado-rec-v1`. Fix the doc.

### B12. Tool reproducibility claims are false (LOW, tools only) — NOTEs 28, 29
`ladder.mjs` and `calibrate_ais.mjs` promise fixed seeds but the deck shuffles/look-ahead use `Math.random`; `turns.mjs` calls the
non-exported `E.botDist`. Either seed everything (pass `rnd`, `setRng(mulberry32(...))`) or delete the claim. Resolved structurally
by A3 (explicit bot RNG).

Not bugs (keep, but document): NOTE 9 "resigned player's piles untouched" (harmless: the seat is out); NOTE 10 "`end` while
`active`" (rules-correct: leftover movement is simply lost); NOTE 14 Elo K 48/32 not zero-sum (standard provisional-K practice;
say so in the leaderboard FAQ); NOTE 19 "undo keeps the deadline running" (correct: undo must not buy time); NOTE 21 (defensive
restore is fine).

---

## 2. Design principles for the new boundary

1. **The engine is a library of values, not a global.** Everything it needs arrives as arguments (a `Game` value, an RNG, a
   network); nothing lives at module level except immutable catalogues. That alone deletes the "set `E.S`/`E.MAP` before each call"
   convention (spec §1.1 "Rules of use"), the `setRng` save/restore dance, `BOT_PLAN_CACHE`, `BOT_NET` swapping per seat.
2. **Command/query separation.** One mutating entry point (`apply(command)`), everything else is a pure query. Queries take a
   `&Game` or a `&View` and never touch randomness.
3. **Event sourcing for games.** A game *is* its setup + secret + ordered command list. State is a cache that can always be rebuilt
   (that is already how v2 records work: engine_rules.js:44-49 — keep that idea and make it the storage model everywhere).
4. **Information sets are types.** The server holds a `Game` (omniscient); clients and bots see a `View` for one seat. If a function
   only needs what a seat may know, it takes a `View`, so leaking hidden information becomes a type error rather than a code-review
   finding.
5. **One wire vocabulary.** Actions, events, views, errors and records have one JSON shape, shared by the browser, the Worker,
   the log files and the tools (serde on the Rust side, TypeScript types generated from it for the JS side).
6. **Stable codes, human text at the edge.** Errors and events carry machine codes + structured fields; English sentences are built
   by the UI (today the engine's `err` strings and `S.log` lines are shown verbatim, spec §3.2 step 4).
7. **Everything persisted or sent carries a version**: records (`rules`, `rng`), network files (`feature_schema`), WebSocket
   protocol (`protocol`), local saves.
8. **Keep it small.** No REST framework, no GraphQL, no protobuf. JSON + a dozen routes + one socket per room is right for this
   project; the proposals below tighten what exists instead of replacing it.

---

## 3. Engine API

Format of each proposal: **Problem** (spec reference) · **Change** · **Why** · **Cost** · **Priority**.

### E1. A `Game` handle instead of the globals `S`, `MAP`, `RNG` (+ per-MAP caches) — MUST
**Problem.** spec §1.1: every rules function reads/writes module globals; callers juggling several games (the Worker with many rooms,
tools, bot look-ahead) must assign `E.S`/`E.MAP` before every call and read `E.S` back after functions that *replace* it
(`newGame`, `recNewGame`, `replayStart`); bot look-ahead swaps `S` to clones and back in ~20 places (engine_bot.js:181-497) and
relies on no re-entrancy; `newGame` silently replaces `MAP`; caches are hung off the MAP object (`_nb`, `_bd`, `_fb`, `_bo`, `_pt`)
and on network objects (`_p`). The Worker then adds its own map cache (worker.js:290-291) shadowing `mapFor`.
**Change.** `struct Game { state: State, map: Arc<Board>, record: Record, … }`. `Board` (today's MAP) is immutable, built once by
`Board::build(&CourseSpec, blockade_seed)`, holds its derived tables (neighbours, distances, feature tables) computed eagerly or in
`OnceCell`s, and is shared by `Arc` (the server's per-isolate cache becomes `HashMap<(CourseId,seed), Arc<Board>>` inside the engine
crate or the WASM wrapper). All rules functions become methods on `State` taking `&Board`.
**Why.** Removes an entire class of bugs (wrong MAP for S, forgotten restore, re-entrancy), makes the engine usable from several
threads/games at once (Rayon self-play, one WASM instance serving many rooms), and makes clone cost explicit (A2).
**Cost.** Inherent in the rewrite (no extra cost if decided up front). The JS UI must stop reading `S`/`MAP` as globals (C1).

### E2. Explicit, versioned RNG: counter-based streams keyed by (secret, action index) — MUST
**Problem.** spec §1.8 "RNG discipline": two incompatible disciplines (v1: one stream for the whole game, left installed in a global;
v2: fresh `mulberry32` per action index), a global `RNG` defaulting to `Math.random`, and bots that must remember to swap it
(`aiChoose`, `botDeepPlayout`, `botRolloutChoose`, gen.mjs/record.mjs `setRng` around every `applyAction`, spec §4.1). NOTE 28:
tools believe they are seeded but aren't.
**Change.**
- The game's randomness is a pure function: `game_rng(secret, index) -> impl Rng` where `index` is -1 for setup and `i` for
  command `i`. `apply` constructs it internally; callers never see or install an RNG. This is exactly v2's `recRng` idea, made the
  only mode.
- `RngVersion` enum in the record: `Legacy1` (one mulberry32 stream, v1 logs), `Legacy2` (`recRng`, v2 logs), `V3` (new: e.g.
  SplitMix64-mix of `(secret, index)` seeding a `Xoshiro256++` or `ChaCha8`). Old logs keep replaying through the legacy variants.
- Shuffle is specified with integer math so it is portable: `j = ((u32 as u64) * (i as u64 + 1)) >> 32`. This is bit-identical to
  JS `Math.floor(r*(i+1))` for `r = u32/2^32` (the product is < 2^53, so the double arithmetic is exact) — so the legacy variants can
  be reproduced exactly with wrapping `u32` ops.
- Bot randomness is a separate `&mut impl Rng` argument of the policy (A3) and never feeds the game stream.
**Why.** Determinism by construction; replays and training games are reproducible; nothing to forget.
**Cost.** Low (a few functions), but the legacy variants must be tested against stored logs (§8).

### E3. One mutating entry point: `apply(seat, Command)` — merge 9 functions — MUST
**Problem.** Today there are `applyAction`, `resign`, `forceEnd`, `recAct`, `recResign`, `recTimeout`, `replayStep`, `endGame` (called
by tools to cut games) and the server's own `S.log.push` for timeouts. They differ in return shape (`resign` fails without `err`,
`replayStep` fails without `ev`), in turn checks (`resign` is legal out of turn; `replayStep` adds its own), and in recording
(`rec*` wrap the others, spec §1.8). `forceEnd` drops the events of its implicit `trash` step (NOTE 9, spec §1.6).
**Change.**
```
enum Command { Act(Action), Resign, Timeout, /* tools only: */ Adjudicate }
fn apply(&mut self, seat: Seat, cmd: Command) -> Result<Outcome, RuleError>
```
`apply` validates, mutates, appends `(seat, cmd)` to the game's own record, and returns all events (including those of the implicit
trash in `Timeout`). `Resign` is legal out of turn; `Timeout` only for `cur`. `Adjudicate` (round cap: "end now, place by
progress") replaces tools calling `endGame()` on a live state and is recorded, so capped games replay too (today record.mjs just stops
the log, spec §4.4). Replay is `for (s,c) in record.commands { g.apply(s,c)? }` — there is no separate `replayStep`.
**Why.** One contract to test; every state change is recorded by construction (no "unrecorded old game" branch `rec` may be null,
spec §1.8 `recDo`); the server's timeout/forfeit path and the AI path become the same code as a click.
**Cost.** Low in Rust. The Room's three code paths collapse to one helper.

### E4. The record is part of the game; storage = record (event sourcing); undo = truncate — MUST
**Problem.** The record (`rec`) and the state are separate objects kept in sync by `S.nact`, with a subtle protocol: undo restores an
older `S` (with smaller `nact`) while `rec` keeps the undone actions until the next recorded action truncates it (spec §1.8 "Undo
semantics", NOTEs 20, 7). `nact` is missing on replayed states, forcing `nact:0` in the regression test. The Room persists `S`, `rec`
and up to 6 JSON snapshots (`undo`), the client up to 60 snapshots plus `REC` in two localStorage keys with a consistency check
(`loadRec`, spec §3.6).
**Change.** `Game` owns `record: Record { setup, secret, rng_version, rules_version, commands: Vec<(Seat, Command)> }`.
- `game.undo(seat) -> Result<(), UndoError>` truncates `commands` back to the last *undo point* and rebuilds the state by replaying
  (or from a cached checkpoint). The engine knows the undo points: an index is an undo point when the command revealed information
  or passed the turn (today's `reveal || turn changed` rule, duplicated in the Room worker.js:401 and the client ui_state.js step 5).
  `game.can_undo(seat) -> bool` answers the UI.
- Persist only `record` (+ room meta). On wake, the Room replays it — a few hundred commands, well under a millisecond in Rust (and a
  few ms in the current JS). `S`, `undo`, `nact` storage keys disappear; the local save becomes one key holding the record.
- Optional `checkpoints: Vec<(index, StateHash)>` in the record for divergence detection (§8), not for correctness.
**Why.** One source of truth; undo, replay, reconnect, and crash recovery are all the same operation; storage shrinks; the undo rule
lives in the engine (it is a rules question: what information was revealed).
**Cost.** Medium: Room storage format changes (keep reading old `S`+`rec` keys once, then write the new key); local save migration
(old saves without a record can be kept as a snapshot-only game with undo disabled, as today).

### E5. Typed errors with stable codes — MUST
**Problem.** `applyAction` returns `{ok:false, err:'<English sentence>'}` (spec §1.5), `resign` returns no `err`, `replayCheck` returns
a string or null, `buildCourse` throws `Error` with sentences (§1.3), the Worker wraps strings into `{t:'error',msg}`. The UI shows
engine sentences verbatim and pre-checks some rules with *its own* sentences (spec §3.2 "UI pre-checks").
**Change.** `enum RuleError { GameOver, NotYourTurn, MustTrashFirst, CardNotInHand, CardCannotMove, BadPiece, OutOfReach,
NeedCard{kind}, WrongCardCount{need}, TooManyCards{max}, AlreadyBought, SoldOut, ReserveLocked, NotEnoughCoins{have,need},
BadKeep, NothingToTrash, AlreadyResigned, Malformed }` serialised as `{"code":"not_enough_coins","have":2.5,"need":3}`; one
`fn message(&RuleError, lang) -> String` in the UI layer (JS table) produces today's sentences. Same for `SetupError`,
`RecordError` (replayCheck), `BoardError` (buildCourse).
**Why.** The UI can react to codes (highlight the missing coins, shake the right card) and translate; tests assert codes, not prose;
the server can map codes to its own replies.
**Cost.** Low. Keep today's sentences as the English table so players see no change.

### E6. Separate rules state, per-seat View and session metadata — MUST
**Problem.** `S` mixes rules state with things that are not rules: `owners`, `room` (set by the Room, worker.js:419; the client
decides "online" by `!!S.owners`, spec §3.1), `privacy` (a local UI preference), `log` (display text, capped 200 by the engine and 120
by the server, NOTE §1.4), `nact` (recording bookkeeping), `_endView` (bot scratch), `rules` (dead, NOTE 8), and `course` as a whole
object duplicated into every state. The redacted state has the same shape as the real one with fake card ids `'h1_0'`/`'d1_3'`
(spec §1.9), so the client must "tolerate card ids absent from `S.cards`" and the own deck is re-sorted but still leaks draw order
within a type (NOTE 5).
**Change.**
- `State` = rules only: `players, cards, market, reserve, blockades, cur, start, round, end_triggered, over, placement, turn,
  trash, full_race` plus the board identity `course` (id) + `seed`. No `log`, `owners`, `room`, `privacy`, `nact`, `start`, `winners`.
- `View` = a distinct type produced by `game.view(Viewer::Seat(i) | Viewer::Spectator)`: other players' hand/deck are **counts**
  (`hand_count`, `deck_count`), own deck is a **multiset** (`{"scout":1,"traveler":3}`), own hand is ids+types, and card types are
  inlined (`{id, t}`) wherever an id is visible, so no `cards` side table is needed. Includes `undo_available`, `status`, and the
  public event tail (E7).
- Session metadata (`owners`, `room`, deadlines, seats' uids) lives in the Room / client session, sent next to the view (W4).
**Why.** Hidden information is structurally absent (no placeholder ids to mishandle, no draw-order leak); the client's "am I online"
decision is explicit; the rules state is smaller and cheaper to clone (A2).
**Cost.** Medium on the client: the renderer reads `S.players[i].hand.length` etc.; with counts it reads `hand_count`. The fake-id
convention is used in a handful of places.

### E7. Structured events only; text log out of the engine — MUST
**Problem.** The engine writes English into `S.log` (`log()`, engine_rules.js:102) *and* returns events; the server pushes its own lines
without `r` (NOTE §1.4, worker.js:457-458); the replay viewer strips and re-splices `S.log` (ui_replay.js:11-56); tools clear it
every step for speed (`E.S.log.length = 0`, spec §4.1, 12 tools). Events are incomplete: no event for the end-of-turn draw,
none for `forceEnd`'s implicit trash (NOTE 9), the `start`/`undo`/`timeout` events are invented by the Worker (spec §1.6).
**Change.** Events are the only narrative. Complete the catalogue: `Setup`, `Played{…}`, `Moved`, `BlockadeTaken{number}`,
`Arrived`, `Drew{n}` (also at end of turn), `Gained{t}`, `TurnPassed{to, round}`, `Resigned{reason: Voluntary|Timeouts}`,
`TimedOut`, `FinalRoundStarted`, `GameOver{places}`. Each carries `i` (command index) so a client can dedupe/order them.
Optionally a per-seat private channel (`PrivateEvent::YouDrew{cards}`) so the UI can animate its own draws without diffing states.
The UI builds the journal from events (it already has `playEvents`); a reconnecting client gets `view.recent_events` (last ~100
public events, kept by the Game as a ring buffer derived from the record).
**Why.** One source for animations, sound, journal and replays; i18n possible; the state gets smaller; tools stop poking at `S.log`.
**Cost.** Medium: journal rendering (ui_view.js:812-824) switches from `S.log` lines to event formatting.

### E8. Tighten the action vocabulary — MUST
**Problem.** (a) `buy`/`transmit` address a stack by `src:'m'|'r'` + `idx`, and a reserve purchase *splices* `S.reserve`, so reserve
indices shift and the `gain` event reports the pre-move index (NOTE 4); index validation is JS coercion (NOTE 11, bug B1).
(b) Targets are strings `"q,r"` or `"B<index>"` where the index is not the blockade number (NOTE 3). (c) `move` with the active card
silently ignores `a.pi` (NOTE 10); continuing leftover strength is expressed by re-sending the card id.
**Change.**
- `Buy { card_type, pay: Vec<CardId> }`, `Transmit { card, card_type }`. Each buyable type exists in exactly one stack (18 buyable
  types = 6 market + 12 reserve, spec §1.2), so the type *is* the stack's identity; the engine finds it in market or reserve.
  No indices, no shifting, nothing to coerce. (Keep `market`/`reserve` as display order in the View.)
- `Target = Hex(q, r) | Blockade(number)` on the wire as `{"hex":[q,r]}` / `{"blockade":3}` (or keep the `"q,r"` string for hexes:
  it is fine, just type it). Blockades are identified by their printed number everywhere (events already use it).
- `Move { card, piece, to }` and a separate `Continue { to }` for leftover strength (no card id, no ignored piece). `Native` stays.
- Integers are integers: reject `"0"` for indices, reject floats.
**Why.** Removes an index-shift footgun, a validation bug class and an ignored field; actions become self-describing for logs.
**Cost.** Low in the engine; small UI builder changes (`pickFromMarket`, `doMove`); log v3 only (legacy decoder maps old shapes).

### E9. Rule queries for the UI and bots: `targets`, `validate`, `legal_actions` on a View — MUST
**Problem.** The UI calls `reach`, `payTargets`, `nativeTargets` with raw seat/piece arguments and duplicates engine checks
(`affordable`, buy-once, reserve lock, spec §3.2 NOTE). Online, the UI runs these on the *redacted* state, which only works because
the functions happen to use public data + own hand. `reach` returns a `Map` keyed by strings with bot-irrelevant internals
(`kind:'bl'`, `bl`). `botActions` is the only enumerator, and it is deduplicated and non-exhaustive (NOTE 7) — fine for bots, wrong
as a general "legal moves" API.
**Change.** Pure queries over `&View` (so they work identically local/online/replay):
- `targets(view, TargetQuery::Card{card, piece?} | Native{piece} | Pay{piece}) -> Vec<TargetInfo{to, cost, path, kind, need?}>`
- `validate(view, &Action) -> Result<(), RuleError>` — the UI's pre-checks call this instead of re-implementing rules.
- `payment_options(view, card_type) -> {cost, minimal_payments}` for the buy UI.
- (In the §10 sketch `targets`, `validate` and `payment_options` collapse into one `options(view, query)` call; a failed
  `apply` already returns the precise error, so a separate `validate` is only a convenience.)
- `legal_actions(view, Canonical::ByType) -> Vec<Action>`: *exhaustive* up to card-type symmetry (same-type cards are
  interchangeable, so ids are canonicalised to the lowest id of each type). Bots' pruning (≤3 kept cards, minimal payments, ≤8
  per cost) moves to a policy-level `candidate_actions` in the AI crate.
**Why.** The UI stops re-implementing rules (CLAUDE.md "All rules live in the engine" becomes enforceable), the online client can
never accidentally depend on hidden data, and there is one honest legal-move generator for tests (property test: every action in
`legal_actions` applies OK, random actions outside it fail).
**Cost.** Medium; the path tie-breaking of `reach` must be kept (NOTE 2) because the path decides which blockades a move takes.

### E10. Validate setup in `new_game` — NICE
**Problem.** `newGame` does no validation of player count, names, colours; defaults the course to `COURSES[0]` by object; stores
the whole course object (spec §1.7). The server and `replayStart` sanitise names separately (`slice(0,24)`, colour regex).
**Change.** `Setup { course: CourseSpec, blockade_seed: u32, full_race: bool, players: Vec<PlayerSetup{name, color, ai}>, gift }`,
`Game::new(setup, secret, versions) -> Result<Game, SetupError>` checks 2–4 players, name length, distinct colours, known AI ids,
known course. `CourseSpec = Named(id) | Layout{route, end, sym}` so random (`botRandomCourse`) courses are replayable (today
`replayCheck` rejects them: `courseById('rnd…')` is null).
**Cost.** Low.

### E11. Static catalogue and board as data, not internals — MUST (for the UI boundary)
**Problem.** The UI reads `CT`, `COURSES`, `COLORS`, `AIS`, `BLOCKADES`, `SYMNAME`, `R`, `DIRS`, `key`, `hash`, `buildCourse`,
`mapFor` … directly (spec §3.1: ~40 names). `COURSES`, `CT`, `AIS` are live mutable objects (spec §1.14 NOTE). The Worker has its
own copy of the colours (`PCOLORS`).
**Change.** `catalog() -> Catalog` (JSON, versioned: cards with name/colour/symbol/strength/cost/once/text, courses, colours, AI
roster metadata, rules constants) and `board(course_spec, seed) -> BoardData` (hexes, tiles, connections, starts, goals, blockade
deal) — both plain JSON computed once. Pure display helpers (`fmt`, `plural`, `SYMNAME`, `R`, `pxOf`, `hash`) move to a JS
`ui_util.js`; they are not engine concerns.
**Why.** The WASM surface stays ~10 functions instead of 40; the UI can't mutate engine tables.
**Cost.** Low-medium (mechanical replacements in ui_view.js).

### E12. Canonical, versioned serialisation of State/View — MUST
**Problem.** `S.v = 5` exists but states are persisted in DO storage and localStorage, compared via `JSON.stringify` in tests
(spec §4.7 item 5: key order matters!), and cloned by JSON for undo.
**Change.** With E4, State is no longer a long-lived persisted format (the record is). Keep `serde` derive with a `schema` field on
View (sent to clients) and on any debug dump. Tests compare `state_hash()` (a stable hash over a canonical encoding) instead of
JSON strings.
**Cost.** Low.

### E13. Placement/Elo and AI roster are not rules — NICE
**Problem.** `eloDeltas` lives in the rules engine (spec §1.10) and `AIS`/`aiCourseOK`/`aiAllowed` in `engine_ai.js`, and the Room
re-derives AI eligibility with different messages in `addAI` vs `start` (spec §2.5 table).
**Change.** Crate modules: `core` (rules), `rating` (Elo), `ai` (roster, policies, eligibility: one `ai::eligible(course, n) ->
Result<(), AiError>` used by both Room checks and the setup screen).
**Cost.** Low.

### E14. `State` compactness for cloning — MUST (it shapes every type)
**Problem.** Bot look-ahead clones the state thousands of times per decision (`botClone`, spec §1.13) and the Worker JSON-copies it
per socket per update (`redact`). Card ids are strings `'c17'`, hexes are `"q,r"` strings, piles are JS arrays of strings.
**Change.** In Rust: `CardId(u8)` (a game has < 256 cards: 8×4 starters + 18×3 stacks + gift), `CardType(u8)`, `Hex(u16)` index into
the board, piles as `SmallVec<[CardId; 16]>` or fixed arrays, blockade ownership as a bitset, market/reserve as `[u8; 18]` counts.
`State: Clone` becomes a ~few-hundred-byte memcpy. Wire form still uses readable JSON (`"c17"`, `[q,r]`) via serde adapters —
or switch the wire to integers in v3 (the UI never needs the `c` prefix).
**Cost.** None if decided now; expensive to retrofit.

### E15. Don't encode "whose view" in `privacy` inside the state — NICE
**Problem.** `privacy` (hide hands in pass-and-play) is a UI preference stored in rules state (spec §1.4).
**Change.** Move to local session settings. **Cost.** trivial.

---

## 4. AI / training API

What the tools need (spec §4): fast clone, legal-move enumeration, feature extraction (single and batched), network evaluation
(eventually batched on a GPU), deterministic seeding, and several networks/policies in one process. Today all of that goes through
module globals and a 15-knob `botChoose(opts)`.

### A1. Policies as values: `trait Policy` replaces `botChoose(opts)` + `BOT_PLANS`/`BOT_PLAN_CUR`/`setPlan` — MUST
**Problem.** `botChoose` is one function with a large option bag (`mode`, `eps`, `typeEps`, `rnd`, `turnState` (mutated!),
`search.kind` ∈ plan/deep/rollout/other, `draws`, `noise`, `lotemp`, `temp`, `explain`), silent downgrades (`'net'` without a net
→ `'heur'`, which also drops `search`: spec §1.13 NOTE), string-prefix dispatch (`mode.startsWith('plan')` + global `BOT_PLANS`),
and a heterogeneous result `{a, v?, best?, bestA?, why?, alts?, deep?, nodes?}`.
**Change.**
```
trait Policy { fn choose(&self, view: &View, mem: &mut AgentMemory, rng: &mut dyn RngCore, ev: &dyn Evaluator) -> Decision; }
struct Decision { action: Action, value: Option<f32>, why: Why, alts: Vec<(Action, f32)> /* only if asked */ }
```
Concrete policies: `Heuristic(HeurParams)`, `Planner(PlanParams)`, `NetGreedy{draws}`, `NetBeam{beam}`, `Deep{…}`, `Rollout{…}`,
and wrappers `EpsGreedy{inner, eps, typed}`, `Softmax{inner, temp}`, `FinishGuard{inner}` (today's `aiFinishGuard`), `TurnCap{inner,
60}` (today's `mem.n > 60`). Named AIs are just configured policy stacks: `Humboldt = FinishGuard(TurnCap(NetBeam{3}))`.
Asking for a net policy without a fitting net is an error at construction time (`PolicyError::NetMissing`), and the *caller*
(aiChoose's 2-player / wrong-course fallback) decides the fallback explicitly.
**Why.** Composable, testable, no hidden downgrades, no global planner variants; tools build exactly the policy the site uses
(today the ladder is "close to but not exactly" Humboldt, spec §4.3 NOTE).
**Cost.** Medium (it is the bot rewrite itself, structured differently).

### A2. Fast clone and an allocation-free step — MUST (falls out of E1/E14)
`Game`/`State: Clone` as a flat struct; look-ahead uses `let mut s = state.clone(); s.apply_unrecorded(seat, cmd)` — a variant of
`apply` that skips the record append and event allocation (`Outcome` events into a caller-provided buffer or not at all). Keep the
record-keeping `apply` for real games. Replace the swap-`S`-and-restore pattern entirely.

### A3. Bots see a View and bring their own RNG — MUST
**Problem.** Bots run on the full omniscient `S` and are trusted to respect hidden information by discipline: they reshuffle their own
deck before look-ahead (engine_bot.js:344, 387, 404 "my deck order stays hidden") and use unions of opponents' piles in features
(engine_bot.js:108, 263). Correct as far as I checked, but nothing enforces it — one new search path that applies a draw action to an
unshuffled clone peeks at the real deck. Bots also share the game's global `RNG` (reshuffles in look-ahead), hence the `setRng`
dance in `aiChoose` and every tool (spec §4.1).
**Change.** `Policy::choose(&View, …, rng)`. Look-ahead needs a concrete state: `view.determinize(rng) -> State` samples a full state
consistent with the view (own deck shuffled, each opponent's hand+deck pool re-dealt — today's code at engine_bot.js:447/497,
made a library function). The game RNG is never visible to policies.
**Why.** "The AI cannot cheat" becomes a type-level fact (important for a ranked site where AIs are rated players); tools become
reproducible by seeding one bot RNG per seat.
**Cost.** Medium; determinization already exists in two places.

### A4. Networks are values; `trait Evaluator` with a batch method — MUST (interface), LATER (GPU)
**Problem.** One global `BOT_NET`, swapped per seat per decision in tools (spec §4.1 "E.setNet(netForSeat)"); `BOT_EVALS` global
counter; `botNetPrep` caches typed arrays as a hidden `_p` property on the network object; `botValue(me, mode)` mixes heuristic and
probability scales when the net is missing (spec §1.13 NOTE).
**Change.**
```
trait Evaluator { fn feature_schema(&self) -> FeatureSchemaId;
                  fn eval_batch(&self, x: &[f32], n: usize, out: &mut [f32]); }   // row-major n × nf
struct Mlp { schema, w1t, b1, w2, b2, w3, b3, leak }        // CPU impl, loaded from .bin
struct Counting<E> { inner: E, evals: Cell<u64> }           // replaces BOT_EVALS
```
The heuristic is *not* an Evaluator (different scale); policies that combine them do so explicitly.
Searches should gather leaves and call `eval_batch` once per expansion step (beam search does this naturally: evaluate the whole beam
frontier in one batch). For GPU self-play later, run N games concurrently and let a driver collect `NeedEval` requests across games
into one batch (a resumable search: `search.step(&mut self, results) -> Poll<Decision, EvalRequest>`), or expose the engine to
Python (PyO3) and batch in PyTorch — both work only if the engine never calls the network through a global.
**Why.** Several nets per process without swapping; GPU batching becomes possible without touching rules code.
**Cost.** Low for the trait + CPU MLP; the resumable search is LATER.

### A5. Feature extraction as a documented, versioned, batchable function — MUST
**Problem.** NOTE §4.2: features are a bit-exact training contract that depends on `BOT_TYPES` order (= `Object.keys(CT)`), JS string
sort of `"q,r"` keys, connection order, normalisation constants and the `S._endView` hack; `S.rules` is read but never set (NOTE 8);
feature size is computed (`BOT_NF`=506, `botNetNF()` varies with MAP and net); `botNetFeatures(me, scratch=true)` returns a global
buffer valid until the next call.
**Change.**
```
fn features(view: &View, schema: FeatureSchemaId, out: &mut [f32]);           // writes exactly schema.len() floats
fn features_batch(views: &[&View], schema, out: &mut [f32]);                  // n × len, row-major
fn end_view(view: &View, keep: &[CardId]) -> View;                            // replaces S._endView / botEndView
```
`FeatureSchemaId` = name + version + a hash of the layout description (card-type order, hex order, sizes). The layout is written down
once (a table in the crate docs). Drop the dead `S.rules` input (always 0; keep the slot as a constant 0 in schema v1 so existing
networks still fit). A sparse variant (`features_sparse -> (idx: Vec<u16>, val: Vec<f32>)`) matches the training files (spec §4.2).
**Why.** Features are the most fragile contract in the project; making them a named, versioned schema means a network can never
silently be fed the wrong layout, and batch extraction is what GPU training needs.
**Cost.** Medium (port + golden tests: dump JS features for ~10k positions, compare in Rust — exact equality of the float32 values).

### A6. Network file format v2 — MUST (small)
**Problem.** `.bin` header JSON `{name, course, nf, unsettled, leak, parts}` (spec §1.12) has no format version, no feature schema,
drops `courses`/`onehot`/`extra` (NOTE 15, so multi-course nets can't ship), no checksum; decoding "fits" is checked only by course
name + `nf`.
**Change.** Magic `EDNN`, `format: 2`, header adds `feature_schema`, `courses: [...]`, `onehot`, `extra`, `arch: "mlp-lrelu-3"`,
`dtype: "f16"`, `sha256` of the payload. Loader returns `Result<Mlp, NetError>`; an engine refuses a net whose schema differs. Keep a
v1 reader.
**Cost.** Low.

### A7. Bit-exactness of network values: don't chase it — NICE (decision)
NOTE 6 asks to replicate the float32 accumulation of the first layer. Recommendation: require **exact features** (A5) but only
**tolerance-equal values** (|Δ| < 1e-4; the current test already accepts 2e-3 between half and full precision). AI decisions are
already non-deterministic (`Math.random` in look-ahead), no stored artefact depends on exact network outputs, and exact float
replication would forbid SIMD/GPU evaluation. Cost of the decision: none; cost of the alternative: permanent.

### A8. Deterministic seeding end to end — MUST (falls out of E2/A3)
One `u64` master seed per tool run → per game: `(blockade_seed, game_secret)`, per seat: `bot_rng = seed_from(master, game, seat)`.
Everything reproducible; `calibrate`, `ladder` claims become true (NOTE 28).

### A9. Action encoding for policy networks — LATER
If the AI moves to policy heads (AlphaZero-style), add `fn action_index(&Action, &View) -> Option<u16>` over a fixed action space
(e.g. `(kind, card_type, target_hex)`), plus `legal_mask(view) -> BitVec`. Not needed for the current value-network approach;
designing `Action` with small integer fields (E8, E14) keeps it possible.

### Tool-facing API summary (what replaces `E.*` for the tools)
`Game::new`, `game.apply`, `game.view`, `legal_actions`, `candidate_actions`, `features[_batch]`, `Evaluator::eval_batch`,
`Policy::choose`, `Game::replay(record)`, `game.adjudicate()` (round cap), `Board::build`, `random_course(seed, n_mid)`,
`State::clone`, `determinize`, `place_value(place, n)`. Exposed natively (Rust tools), via N-API/WASM (existing Node tools during
transition) and optionally PyO3 (training).

---

## 5. HTTP API

The route set (spec §2.3) is small and mostly sensible. Proposals are about consistency, error shape, methods, idempotency and
versioning — keep JSON over plain routes.

### H1. One error shape with codes — MUST (cheap, additive)
**Problem.** `{error:'<sentence>'}` (spec §2.2); clients branch on status only; the room socket uses `{t:'error', msg}`; exceptions
leak `'Server error: '+message` (internal messages to users).
**Change.** `{"error": {"code": "room_full", "message": "This room is full.", "details": {...}}}` (the Google AIP-193 shape,
trimmed). Migration-friendly variant: keep `error` as the message string and add a sibling `code` (`{error, code}`) so today's
client keeps working. Internal exceptions → `{code:'internal', message:'Server error.'}` and log the detail server-side.
Codes: `bad_request, unauthenticated, forbidden, not_found, method_not_allowed, too_large, conflict, room_full, internal`.

### H2. Status codes and methods — NICE
400 for bad JSON (B5); 405 + `Allow` for wrong methods (`/api/config`, `/api/leaderboard`, `GET /api/train` answer anything —
NOTE 22); 404 JSON for an unknown room over HTTP instead of a plain-text 404 inside the WS upgrade (spec §2.3 #14); 503 +
`Retry-After` when D1 is down instead of 500.

### H3. Fewer, consistent routes — NICE
- Merge the two sign-in routes into `POST /api/session` (`{google}` | `{dev}`), and quick match into `POST /api/rooms {match:true}`
  (both already return `{code}`) — see §9.4. 16 routes → 13.
- Keep `GET /api/replays?mine=1` (a flag is fine; a new sub-resource isn't worth a route). Don't add a `GET /api/rooms/{code}`: the
  socket's first `snapshot` (or a typed `not_found` error) already answers "does this room exist".
- `/api/train`: `GET` (latest) and `PUT` (upsert, token) instead of "POST or anything else".
- No `/v1/` prefix: one client deployed with the server; H8 covers skew between them.

### H4. Idempotent creation — NICE
**Problem.** `POST /api/rooms` twice (double click, retry after a timeout) creates two rooms; `/api/match` is already idempotent
per user (returns the room the uid is in).
**Change.** Before creating, return the caller's existing `lobby`-status room it hosts (same rule as `/match` step 1), or accept an
`Idempotency-Key` header stored in the Lobby for a few minutes. The first is simpler and matches user intent.

### H5. Auth tokens — NICE / LATER
- The token travels in `?t=` for WebSockets (spec §2.2), so it appears in URLs (access logs, Referer if ever navigated). Option:
  `POST /api/ws-ticket` → a 60 s single-purpose token used in `?t=`; the long-lived token stays in the `Authorization` header. LATER.
- Tokens cannot be revoked (60-day HMAC, no server-side state). Add a `token_gen` integer column to `users` and embed it in the
  token (`uid.gen.exp.sig`); "sign out everywhere" = increment. LATER.
- Add `iat`/`nbf` tolerance checks in `verifyGoogleToken`; fine as is otherwise.

### H6. Replay uploads — MUST (see B10)
Auth required; `id = base32(sha256(body))[0..10]` → identical uploads get the same id (idempotent, dedupes); store `uploader`;
`listed` defaults to 0 for uploads; `GET /api/replays` lists online games + the caller's own uploads. Validate with the engine by
*replaying* (not only `replayCheck`) so broken logs are rejected at upload time (cheap in Rust).

### H7. Leaderboard and lists — LATER
Add `?limit=&cursor=` (keyset on `(rating,id)` / `created`) when lists grow; today's fixed 50/100 are fine.

### H8. Client/server protocol version handshake — MUST
**Problem.** Workers Builds redeploys on every push; open tabs keep running the *old* page against the *new* server. Today the shapes
changed rarely; the Rust switch changes the state and action shapes, so an old tab would misrender or send rejected actions.
**Change.** `GET /api/config` returns `{protocol: 3, build: "<git sha>", …}`; the page embeds its own `PROTOCOL`/`BUILD`; the WS
the first WS snapshot repeats it (W1). If the server's protocol is newer, the client shows "A new version is available — reload" (and auto-reloads
when not in the middle of its own turn). The server rejects `act` from an older protocol with `code:'client_outdated'`.
**Cost.** Low; it's what makes every later wire change safe.

### H9. Rate limiting — LATER
Cloudflare's rate-limiting binding on `/api/auth/*`, `/api/replays` POST, `/api/rooms` POST (per IP/uid). Not urgent at current
traffic.

---

## 6. WebSocket protocol (Room and Lobby)

### W1. Envelope with version, request ids and correlated replies — MUST
**Problem.** Replies are uncorrelated: `{t:'error', msg}` goes to the sender, and the client clears `NET.busy` on *any* error or state
(spec §3.3); several lobby commands fail silently (`color`, `rated`, `now`, anything in the wrong phase: spec §2.5 table "silently
ignored"); `ping`/`pong` are raw text beside JSON.
**Change.** Client → server `{"id": 17, "t": "cmd", "at": 42, "cmd": {...}}`. Success is acknowledged by the next `snapshot`
carrying `"re": 17`; failure by `{"t":"error","re":17,"code":"out_of_reach","message":"…","details":{…}}`. Every rejected message
gets an error (codes `wrong_phase`, `not_host`, `not_seated`, `color_taken`, `room_full`, `stale`, `client_outdated`, or the
RuleError code). The first snapshot after connect carries `protocol` and `build` (no separate `hello`).
**Why.** The UI knows exactly which command failed and why (and can un-grey the right button); silent failures become visible bugs.
**Cost.** Low-medium (both ends; keep accepting the old shape for one deploy).

### W2. Sequence numbers: optimistic concurrency for `act` — MUST
**Problem.** A command built on an outdated state is applied to the current one. Example: the client drags a card, the timer fires
server-side meanwhile (`forceEnd`), the `act` arrives in the next player's turn and fails with "It is not your turn" (harmless), or —
worse — after a reconnect the client resends and a still-legal action is applied twice (two `move`s). Today messages are dropped
when the socket is closed (`netSend` toast "Reconnecting…"), which avoids duplicates but loses input.
**Change.** Every `state` carries `seq` = number of commands in the record (the game version; bumps on undo too — use a separate
monotonic `version` counter, since undo shrinks the record). `act`/`undo`/`resign` carry `at: version`; the Room rejects mismatches
with `stale` (the client already has or is about to receive the newer state). The client may then safely queue and resend
across reconnects. Clients drop `state` messages with an older `version` than they have.
**Why.** Standard optimistic concurrency (ETag/If-Match equivalent); makes retries safe (idempotency).
**Cost.** Low.

### W3. Fewer, idempotent lobby messages — NICE
`{t:'now'}` toggles `seat.now` (spec §2.5), so a duplicate flips it back. Merge `color`, `rated`, `now` into one absolute
`{t:'set', color?, rated?, ready?}`; `addAI`/`removeAI` into `{t:'ai', ai, seated}`; `act`/`undo`/`resign` into `{t:'cmd', cmd}`;
delete `join` (§9.4). 11 message types → 5.

### W4. One server → client snapshot message — NICE
**Problem.** Two message kinds (`room` in lobby, `state` in game) with `room` embedded in `state` too; the client branches on which
arrives and on `closed` inside `room` (spec §3.3 `onRoomMsg`).
**Change.** `{"t":"snapshot","version":…, "room":{…roomInfo}, "game":null | {"view":{…}, "seat":0|null, "can_undo":bool,
"deadline":ms|null}, "events":[…], "now":ms}`. Spectator = `seat:null` (not `-1`).
**Cost.** Low.

### W5. Keep full snapshots; don't build deltas — decision
Each update is the full redacted state per socket (NOTE 25). With E6/E7 (no log, counts instead of ids) the view is ~2–4 KB;
deltas would add a whole consistency protocol for no user-visible gain at 2–4 players. Revisit only for spectators at scale.

### W6. Heartbeats without waking the Durable Object — NICE
Client `ping` every 25 s wakes a hibernated Room/Lobby for every connected client. Use
`ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'))` in both DO constructors: the runtime answers
without waking the object (cheaper, and the documented pattern for hibernatable sockets).

### W7. Server-side events are engine events — MUST (with E3/E7)
`{e:'start'}`, `{e:'undo'}`, `{e:'timeout',pl}` are invented by the Worker, and timeout/forfeit log lines are pushed into `S.log`
by the Worker (worker.js:455-458). With `Command::Timeout`/`Resign{reason}` and `Setup`/`Undone` events emitted by the engine,
the Worker forwards engine output only. The 3-timeouts forfeit policy stays in the Room (house rule, not a game rule), expressed as
`Command::Resign` with `reason: Timeouts`.

### W8. Lobby socket — NICE
Same conventions (`protocol` in the first `rooms` message), auto-response ping. Consider sending only changed rooms later; fine for now.

### W9. Reconnect semantics — NICE
Document: on reconnect the server sends a `snapshot`; the client resends queued commands with their `at` (W2); the room
never drops a seat on disconnect during a game (NOTE §2.5 socket close) — keep.

---

## 7. Client layering

### C1. A `Session` interface between UI and engine — MUST
**Problem.** The UI reads and writes engine globals (`S`, `MAP`, `RNG`, `REC`), decides the mode by `S.owners`, calls ~40 internals
(spec §3.1, NOTE 27), and has three different code paths for local, online and replay that each manipulate `S`.
**Change.**
```
interface Session {
  view(): View;  board(): BoardData;  seat(): Seat|null;          // what to draw
  canAct(): boolean; canUndo(): boolean;
  act(a: Action): Promise<Result<void, RuleError>>;              // local: WASM apply; online: socket with id/at
  undo(): Promise<…>; resign(): Promise<…>;
  onChange(cb: (view, events) => void): Unsubscribe;
}
LocalSession(game: WasmGame, aiDriver)   OnlineSession(socket)   ReplaySession(record, cursor)
```
Queries (`targets`, `validate`, `payment_options`) are functions of the `View` (E9), exposed by the WASM module directly.
**Why.** The UI becomes engine-agnostic: the JS engine and the Rust/WASM engine can be swapped behind `LocalSession`/
`ReplaySession` one at a time; online needs no engine at all except the View queries. `window.__ED` shrinks accordingly.
**Cost.** Medium; it is the main client refactor and can be done *before* the Rust engine exists (against the JS engine), which
de-risks the rewrite.

### C2. Local AI runs in a Web Worker — NICE
The planner/net search runs on the main thread between animation frames (ui_state.js `aiKick`). With a WASM engine, run
`LocalSession`'s AI in a Worker (`postMessage(view) → decision`) to protect the 60 fps budget (CLAUDE.md). The Policy-on-View
design (A3) makes this trivial: send the view, not the omniscient state.

### C3. Local saves = the record — MUST (with E4)
One key `eldorado-game-v6` holding the record (secret included, as today in `eldorado-rec-v1`); read `eldorado-save-v5`/`v4` +
`eldorado-rec-v1` once for migration. Finished-games list (`eldorado-games-v1`) is already records; keep.

### C4. Replays: incremental instead of precomputed — NICE
`buildReplay` precomputes every position as a JSON string (up to 20 000; spec §3.4). With a fast engine keep checkpoints every 50
commands and replay forward on seek; memory drops by ~50×.

### C5. Client pre-checks via the engine — MUST (with E9)
Replace `affordable()`, buy-once and reserve-lock checks (spec §3.2 NOTE) with `validate(view, action)` / `payment_options`.

---

## 8. Versioning, determinism and replay compatibility plan

What must stay readable forever: online game records in D1 (`replays.game=1`, "kept for good", spec §2.6), local finished games in
players' browsers, uploaded logs, training replays. Everything else (DO state, local in-progress saves) is short-lived and can be
migrated once.

**Record v3** (§10.3 has the shape) carries `rules` (e.g. `"2026.10"`), `rng` (`"legacy1"|"legacy2"|"v3"`), `setup`, `commands`,
optional `checkpoints`, `result`. v1/v2 logs are decoded into the same in-memory `Record` with `rng = legacy1/legacy2` and the old
action shapes mapped (src/idx → card type needs the market/reserve state at that point, so the legacy decoder maps *during* replay,
not up front).

**Two ways to keep old records replayable — the owner should pick one:**
1. *Port exactly.* The Rust engine reproduces the JS rules bit-for-bit for `rules <= 2026.09`: shuffle order and RNG consumption
   (NOTE 1), `reach` tie-breaking via insertion-ordered linear-scan Dijkstra (NOTE 2), reserve splice semantics (NOTE 4), `forceEnd`
   semantics, `advance`/`endGame` ordering. Proven by **differential testing**: a Node script replays every stored record (export
   D1 `replays` + the local corpus + 10 000 freshly generated games with random undos/timeouts/resigns, as engine.test.mjs §5 does)
   through both engines and compares a canonical state hash after every command. This is the recommended path; the JS engine already
   has a regression contract to lift.
2. *Freeze the JS engine as a legacy replayer.* Keep today's `engine.gen.js` as `legacy_engine.js`, used only by the replay viewer
   for v1/v2 logs. The Rust engine then only needs to be exact for its own v3 records, and can fix quirks (NOTE 9/10 semantics, path
   tie-breaks) freely under a new `rules` version. Cheaper and lower-risk, at the cost of shipping two engines to the replay page
   (lazy-loaded, ~30 KB).

Either way:
- Every rules change after the port bumps `rules`; the engine keeps behaviour switches keyed by `rules` only where a change affects
  replays (hopefully rare). A record whose `rules` is unknown is rejected with a clear error.
- Add `checkpoints: [{i, hash}]` every 25 commands in new records (and in the Room's copy) so divergence is detected at load time with
  the exact command index, instead of silently producing a different game.
- `S.v`/`eldorado-save-v5` go away as long-term formats (E4/C3); the View has `schema` for the client.
- Network files carry `feature_schema` (A6); training data files add a header JSON with `feature_schema` + `nf` (spec §4.2 `.json`
  already has `nf`).
- WebSocket and HTTP carry `protocol` (H8, W1).

**Determinism checklist for the port** (all engine-side, none may depend on hash-map iteration order in Rust — use `Vec`/`IndexMap`
or sorted structures): deck shuffle order at setup (seat order, then draws), discard reshuffle only when the draw pile empties
mid-draw, gift insertion position (`floor(r*(len+1))`), `reach` iteration order (neighbour order = `DIRS` order, Map insertion
order for relaxed nodes, first sym wins ties), `botActions` order (AI behaviour, NOTE 7 — only matters for "same AI plays the same",
not for replays), placement sort stability (`endGame`), Elo rounding (`Math.round(x*10)/10` — note JS rounds .5 up toward +∞, Rust
`round()` rounds half away from zero: they differ for negative halves like −0.05 → JS −0.0, Rust −0.1; use `(x*10.0 + 0.5).floor()/10.0`).

---

## 9. Deletion audit: what exists only for history, or is never used

Method: for each export, endpoint, message, option and field, grep the real call sites in `src/client/ui_*.js`, `src/worker.js`,
`tools/ai/*.mjs`, `test/*` and the engine itself (counts from `grep -o 'E\.<name>\b'` per consumer; client code uses bare names).
"Delete" means: don't port it to Rust, and remove it from the JS now where that's free.

### 9.1 Engine exports (`E`, build.mjs:33) — 62 names today
| Name | Real users | Verdict |
|---|---|---|
| `botTurn` | none (defined engine_bot.js:506, never called anywhere) | **delete** |
| `botFeatures` | only internally by `botNetFeatures` (engine_bot.js:275) | **un-export** |
| `forceEnd` | only internally by `recTimeout` | **un-export** (becomes `Command::Timeout`) |
| `get BOT_PLANS` | nobody reads it | **delete** |
| `get MAPX` | 2 tool reads (gen.mjs:121, turns.mjs:27), duplicate of `get MAP` | **delete** |
| `setNet` | 25 tool uses; identical to `aiSetNet` | **delete one** (both vanish with A4: nets are arguments) |
| `aiNetFits`, `aiChoose` | only engine.test.mjs | un-export (test through `aiStep`) |
| `setPlan` (+ `BOT_PLANS` map, `BOT_PLAN_CUR`) | only h2h.mjs:17 via env `PLANS` (planner-variant experiments) | **delete**; planner params become a struct (A1) |
| `botRandomCourse` | sim.mjs + one test | keep only if random courses stay a training tool; otherwise delete (it's why `CourseSpec` needs a layout variant, E10) |
| `endGame` | 14 tool calls (round cap) | replace by `Command::Adjudicate` (E3) |
| `BOT_FLAGS`, `BOT_NF`, `botNetNF` | transfer.mjs, health/revive | fold into `FeatureSchema` (A5) |
| `recResign`, `recTimeout`, `recAct`, `replayStep`, `resign`, `applyAction` | various | merge into one `apply` (E3) |
| `buildCourse` + `mapFor` + the Worker's own `mapFor` cache | client, worker | one `board(course, seed)` with a cache inside (E1) |
| `aiCourseOK` + `aiAllowed` | worker, client | one `ai_eligible(course, n)` (E13) |
| `getter/setter S`, `MAP` | worker, tools | disappear (E1) |
Result: ~62 exports + ~40 internals used by the UI → ~9 WASM functions (§10.2).

### 9.2 Options/parameters that only ever get one value (they should not exist)
| Parameter | Evidence | Verdict |
|---|---|---|
| `S.start` (first player) | always `0` (set once in `newGame`, engine_rules.js:92; never assigned elsewhere) — read by `advance`, `botPlaceSettled`, one feature `(me-S.start+n)%n` | **delete**; seat 0 starts. The feature becomes `me/3` (same values) |
| `botChoose({mode:'heur2'})` / `botValue(…,'heur2')` | never passed by any tool, UI or engine call | **delete** the `heur2` evaluator |
| `botChoose({draws:K})` | never passed; always the default 4 | **delete**, constant |
| `botValue(me, mode)` from outside the engine | every external call passes `'net'` (ui_replay.js:34, search_exp.mjs:29) | split into `net_value` / `heuristic_value`, no mode string |
| `botActionValue(…, K)` | only call passes 4 (gen.mjs:104) | constant |
| `botChoose` search kinds `'deep'`, `'rollout'`, `'turn'` (→ `botDeepChoose`, `botRolloutChoose`, `botTurnSearch`, `botDeepPlayout`) | used only by the experiment scripts deep.mjs (`kind:'deep'`) and h2h.mjs (`net+turn`, `net+roll`); the engine's own comment says "experiments; training and normal play don't use it" (engine_bot.js:379). The site and training use only `kind:'plan'` | **delete from the engine** (keep the results in SUMMARY.md); port only `plan` |
| `fullRace: true` in all 16 tools and the server (worker.js:417) | the only `false` comes from the local setup toggle (ui_view.js:937) and the test | keep the option (a real UI choice) but make `true` the default and stop passing it |
| `newGame({course})` default `COURSES[0]` | every caller passes a course | make it required |
| `aiStep(id, mem, rec)` with `rec` null | only calibrate passes none | fine with E4 (every game records) → parameter disappears |
| `Room.persist(parts)` string flags `'d'`, `'Su'`, `'dSu'` | with E4 there are two keys (`d`, `record`) | always write both (small), delete the flags |
| `/api/rooms` `turn: 300` | the UI offers 60/90/120/180 only (spec §2.3 NOTE) | superseded by the time bank being implemented; keep one list shared by UI and server |
| `play` event `more`, `paid` | each read in one place in the client | keep (used) |

### 9.3 Historical code (migrations that already ran, old formats nobody produces any more)
| Item | Where | Verdict |
|---|---|---|
| Pre-v4 ("v3") room states without `course` | Room constructor, worker.js:299-300 | **delete** (no such rooms can still be alive: lobby rooms prune in 2 h, games in 12 h) |
| `eldorado-save-v4` fallback, accepting `v:4` | `loadSave` (ui_state.js:22) | **delete** with the move to records (C3) |
| `ALTER TABLE users ADD COLUMN bot`, `ALTER TABLE replays ADD COLUMN game/uids/listed` | createSchema, worker.js:36-38 | fold the columns into the `CREATE TABLE` statements and delete the ALTERs (the production DB already has them; a new DB gets them from CREATE) |
| One-time AI calibration batch + `settings.ai_calibration_v1` marker | worker.js:48-54, a D1 batch on every isolate start that is a no-op since the first run | **delete** from the request path; HANDOFF §(calibration) plans future recalibrations with a new marker — do those as a one-off `wrangler d1 execute` SQL script instead |
| `matches` table | written in `finish()` (worker.js:492, 503), **never read** by anything (no `SELECT … FROM matches` anywhere) | **delete**: put `before`/`deltas` into the game's replay row (`result`), which is already the permanent record of every online game |
| `d.rated` (really "results processed") | worker.js | delete; `d.results != null` says the same |
| `S.winners` | derivable (`places == 1`); one client read (ui_view.js:991) | delete, derive |
| `S.resigns` counter | only feeds `players[i].resigned` order | keep internal, not in the wire View |
| `S.privacy`, `S.owners`, `S.room`, `S.nact`, `S.log`, `S._endView`, `S.rules` | see E6 | move out / delete (`S.rules` is always undefined: NOTE 8) |
| Replay log v1 `notes` | written by record.mjs:42, **read by nothing** (the replay viewer computes its own evaluation) | delete |
| Replay log `gift` | only gen.mjs self-play exploration, and only when neither `EXPLORE_T` nor `ANNEAL` is set (gen.mjs:70) | keep only if that exploration mode is still used; it forces a special case into `replayStart`/`replayCheck` — better expressed as a `Setup` field (E10) |
| Two replay formats v1 (tools) + v2 (games) with different RNG disciplines | spec §1.8 | one format v3 (tools use per-command streams too); readers for v1/v2 only for old files |
| `ping`/`pong` as raw text in both DOs | worker.js | replace by the runtime's auto-response (W6) |

### 9.4 Server surface
| Item | Evidence | Verdict |
|---|---|---|
| Room message `join` | the client never sends it (spec §3.3, confirmed: no `'join'` in src/client) — seating happens on connect | **delete** |
| Lobby list field `names` | client reads `count`, `host`, `max`, `status`, `course`, `turn`, `rated`, `ai`, `auto`, `code` — never `names` (ui_online.js:45-60) | **delete** from `list()` (keep in the internal summary if `/find` needs uids) |
| `POST /api/auth/google` + `POST /api/auth/dev` | same response, different credential | **merge** into `POST /api/session {google}` / `{dev}` |
| `POST /api/match` + `POST /api/rooms` | both return `{code}` | **merge**: `POST /api/rooms {match:true}` |
| Room messages `color`, `rated`, `now` | three setters, `now` is a toggle | **merge** into `{t:'set', color?, rated?, ready?}` (absolute values, idempotent) |
| `addAI` + `removeAI` | a pair | **merge** into `{t:'ai', ai, seated:bool}` |
| `act`, `undo`, `resign` | three game commands | **merge** into `{t:'cmd', cmd}` (the engine `Command`, incl. `undo`, `resign`) |
| Server events `start`, `undo`, `timeout` invented by the Worker | worker.js:396, 421, 455 | become engine events (W7) |
| `room` + `state` server messages | two shapes for one purpose | **merge** into `snapshot` (W4) |
| `/api/train` "POST or anything else" | train.html + live.mjs | keep (tiny), use explicit methods |
Result: 11 client→room message types → 5 (`set`, `ai`, `start`, `leave`, `cmd`); 4 room→client types → 2 (`snapshot`, `error`);
16 HTTP routes → 13.

### 9.5 Tools (tools/ai/*.mjs) — decide per script, don't port blindly
Twenty-four scripts depend on `E`. Ones that are experiments with a written conclusion (SUMMARY.md) and aren't part of the
training loop (`loop.sh`/`supervise.sh` → `gen.mjs`, `train.py`, `ladder.mjs`, `live.mjs`, `progress.mjs`; plus `pack.mjs`,
`record.mjs`, `calibrate_ais.mjs` from HANDOFF): `deep.mjs`, `search_exp.mjs`, `h2h.mjs`, `versus.mjs`, `seats.mjs`, `trace.mjs`,
`turns.mjs` (already broken: calls the non-existent `E.botDist`, NOTE 29), `arrival.mjs`, `sim.mjs`, `transfer.mjs`, `widen.mjs`,
`fresh.mjs`, `revive.mjs`, `health.mjs` (and the report/feature-experiment scripts `deep_report.mjs`, `search_report.mjs`,
`addfeat.mjs` + `featexp.sh`, which don't import the engine). Recommendation: archive them (git history keeps them) and port only what the training
loop, `ladder.mjs`, `record.mjs` and `calibrate_ais.mjs` need. That removes most of the reason `E` is so wide.

---

## 10. Target API sketch

Goal: the whole engine surface fits on one screen. One mutating call, one snapshot call, one query call, plus construction.

### 10.1 Rust crate `eldorado` (core + ai + rating modules)
```rust
// ---- data (pure) ----
pub fn catalog() -> &'static Catalog;                        // cards, courses, colours, AI roster, constants
pub fn board(course: &CourseSpec, seed: u32) -> Result<Arc<Board>, BoardError>;   // cached internally

// ---- a game (the only mutable thing) ----
pub struct Setup { pub course: CourseSpec, pub seed: u32, pub players: Vec<PlayerSetup>, pub full_race: bool }
pub struct PlayerSetup { pub name: String, pub color: Color, pub ai: Option<AiId> }
pub enum CourseSpec { Named(CourseId), Layout(Layout) }

impl Game {
    pub fn new(setup: Setup, secret: u64) -> Result<Game, RuleError>;
    pub fn load(record: &Record) -> Result<Game, RuleError>;          // replay = load; also validates the record
    pub fn apply(&mut self, seat: Seat, cmd: Command) -> Result<Vec<Event>, RuleError>;
    pub fn view(&self, viewer: Option<Seat>) -> View;                 // None = spectator
    pub fn record(&self) -> &Record;                                  // setup + secret + commands (+ versions)
    pub fn state(&self) -> &State;                                    // omniscient, for tools/tests only
}
pub enum Command {
    Move { card: CardId, piece: u8, to: Target }, Continue { to: Target }, Native { card: CardId, piece: u8, to: Target },
    Pay { piece: u8, to: Target, cards: Vec<CardId> }, Draw { card: CardId }, Trash { cards: Vec<CardId> },
    Transmit { card: CardId, get: CardType }, Buy { get: CardType, pay: Vec<CardId> }, End { keep: Vec<CardId> },
    Undo, Resign, Timeout, Adjudicate,        // Undo truncates to the last undo point (not recorded); the rest are recorded
}
pub enum Target { Hex(i8, i8), Blockade(u8) }                         // blockade = printed number 1..6

// ---- questions a seat may ask (pure, on its own View) ----
pub fn options(view: &View, q: Query) -> Options;    // Query::Card{card,piece} | Native{piece} | Pay{piece} | Buy{get}
                                                     // → targets with path/cost/need, or {cost, reason_if_not}
pub fn legal_actions(view: &View) -> Vec<Command>;   // exhaustive up to same-type symmetry (bots, tests)

// ---- AI ----
pub trait Policy { fn choose(&self, view: &View, mem: &mut Memory, rng: &mut Rng) -> Command; }
pub fn ai(id: AiId, net: Option<Arc<Net>>) -> Result<Box<dyn Policy>, RuleError>;   // the named AIs
pub fn features(view: &View, out: &mut [f32]);                     // FEATURES.len floats, schema FEATURES.id
impl Net { pub fn load(bytes: &[u8]) -> Result<Net, NetError>; pub fn eval(&self, x: &[f32], out: &mut [f32]); } // batch: x = n×len
pub fn determinize(view: &View, rng: &mut Rng) -> State;           // a full state consistent with the view

// ---- ratings ----
pub fn elo_deltas(ratings: &[f64], places: &[u8], games: &[u32]) -> Vec<f64>;
```
`RuleError` is one enum (setup, rule, record, undo errors) with a `code()`; `Event` is one enum (§E7).

### 10.2 WASM surface (browser page and Worker; the tools use the crate natively)
```
catalog() → Catalog                         board(course, seed) → Board
newGame(setup, secret) → Game               loadGame(record) → Game
game.apply(seat, cmd) → Event[]  (throws {code, …})
game.view(seat|null) → View                 game.record() → Record
options(view, query) → Options              aiChoose(aiId, view, memory, seed) → {cmd, memory}
```
Nine functions replace ~62 exports + ~40 internals. The display helpers (`fmt`, `plural`, pixel geometry) stay in JS.

### 10.3 JSON wire shapes
Command (client → engine/server) — today's shapes, tightened (E8):
```json
{"t":"move","card":"c17","piece":0,"to":"3,-2"}          {"t":"continue","to":"B3"}
{"t":"pay","piece":0,"to":"4,-1","cards":["c3","c9"]}    {"t":"draw","card":"c40"}      {"t":"trash","cards":[]}
{"t":"buy","get":"scout","pay":["c1","c2"]}              {"t":"transmit","card":"c44","get":"plane"}
{"t":"end","keep":[]}   {"t":"undo"}   {"t":"resign"}
```
(`"q,r"` for hexes and `"B<number>"` for blockades keep the strings players' logs already use; the number is the printed one.)

Event: `{"i":57,"e":"moved","seat":1,"piece":0,"path":["1,2","2,2"]}` — `i` = command index.

View (`game.view(seat)`):
```json
{"schema":1, "course":"first", "seed":123, "round":7, "cur":2, "over":false, "places":null, "fullRace":true,
 "turn":{"bought":false, "active":{"card":"c17","piece":0,"sym":"j","left":1}, "pending":null},
 "market":[{"t":"scout","n":2}, …], "reserve":[{"t":"plane","n":3}, …],
 "blockades":[{"n":1,"k":"j","v":1,"owner":null}, …],
 "players":[{"name":"Ana","color":"#e5484d","ai":null,"pieces":["3,-2"],"fin":0,"resigned":0,"blocks":[1],
             "hand":[{"id":"c3","t":"explorer"}, …] | 4,         // own hand: cards; others: a count
             "deck":{"traveler":3,"scout":1} | 9,                  // own deck: a multiset; others: a count
             "discard":[{"id":"c9","t":"sailor"}], "play":[…]}],
 "trash":[{"id":"c40","t":"compass"}], "undo":true, "recent":[ /* last ~100 public events */ ]}
```
Record (log v3):
```json
{"kind":"eldorado-game","v":3,"rules":"2026.10","rng":"v3",
 "setup":{"course":"first","seed":123,"fullRace":true,"players":[{"name":"Ana","color":"#e5484d","ai":null}, …]},
 "secret":"9f3a…",                       // omitted from anything sent while the game runs
 "commands":[[0,{"t":"move",…}], [1,{"t":"resign"}], …],
 "checkpoints":[[25,"a1b2c3d4"], …], "title":"Ana, Ben · First Expedition", "result":{"places":[1,2,3],"rounds":14,"deltas":[…]}}
```

### 10.4 HTTP (13 routes, from 16)
```
GET   /api/config                 → {protocol, build, google, dev}
POST  /api/session                {google:<credential>} | {dev:<name>}  → {token, user, isNew}
GET   /api/me                     → {user, activeRoom}
PATCH /api/me                     {name} → {user}
GET   /api/leaderboard            → {players}
GET   /api/replays[?mine=1]       → {replays}
GET   /api/replays/{id}           → Record
POST  /api/replays   (auth)       Record → {id}           (id = content hash: idempotent)
POST  /api/rooms     (auth)       {max,course,turn,pub,rated} | {match:true} → {code}
GET   /api/rooms/{code}/ws, GET /api/lobby/ws   (WebSocket)
GET|PUT /api/train                (training monitor)
Errors: {"error":"<message>","code":"<code>"} with 400/401/403/404/405/409/413/500.
```

### 10.5 Room WebSocket (5 client messages, 2 server messages, from 11 + 4)
```
→ {"id":1,"t":"set","color":"#9d7df7"} | {"t":"set","ready":true} | {"t":"set","rated":false}   (lobby, absolute values)
→ {"id":2,"t":"ai","ai":"humboldt","seated":true}                                              (host, lobby)
→ {"id":3,"t":"start"}    → {"id":4,"t":"leave"}
→ {"id":5,"t":"cmd","at":41,"cmd":{"t":"buy","get":"scout","pay":["c1","c2"]}}                  (game; at = version seen)
← {"t":"snapshot","version":42,"re":5,"now":1759000000000,
   "room":{"code":"K7Q2M","host":"u…","status":"playing","opts":{…},"seats":[{"uid":"u…","name":"Ana","color":"#e5484d","ai":null,"online":true,"ready":false}],"results":null},
   "game":{"seat":0,"view":{…View…},"clock":{"turnEnds":1759000090000,"bank":[30000,12000,0]}},   // null in the lobby
   "events":[…]}
← {"t":"error","re":5,"code":"not_enough_coins","message":"Not enough coins.","details":{"have":2.5,"need":3}}
```
`clock` is where the time bank you're adding belongs: a per-seat bank (ms) plus the current turn's end time, owned by the Room, not
the engine (it's a house rule, like the 3-timeouts forfeit). With a bank, send `bank` per seat and `turnEnds`; the client computes
the display with the `now` skew as today.

### 10.6 Durable Object storage
Room: `d` (meta incl. clock/banks) + `record`. State and undo are rebuilt from the record on wake (E4). Lobby: unchanged.
D1: `users`, `replays` (the online-game row carries `result` incl. rating deltas), `settings` (session secret), `train`. No `matches`.

---

## 11. Migration order (each step ships on its own)

1. **Bug fixes B1–B10 in JS** (a day). B1+B2 first.
2. **Deletions of §9 that are free in JS** (dead exports, `join`, `matches` writes, `heur2`, `draws`, experiment search kinds,
   historical migrations, lobby `names`). Shrinks what has to be ported and what the differential test must cover.
3. **Protocol handshake (H8)** so every later wire change is safe with open tabs.
4. **Client `Session` refactor (C1) against the JS engine**, with `options(view, q)` implemented in JS on top of `reach`/`payTargets`.
   After this the UI no longer touches `S`/`MAP`/`REC` — the precondition for swapping the engine.
5. **Rust core** (E1–E9, E14) as a crate + WASM build; differential test against the JS engine on the replay corpus (§8) until
   identical; then switch `LocalSession`/`ReplaySession` and the Room to WASM behind a flag.
6. **Storage = record (E4, C3)** in the Room and local saves; record v3; wire v3 (E6–E8, W1–W4) — together, one protocol bump.
7. **AI crate** (A1–A6): port only `plan`, `net`, the named AIs and `gen`'s needs; batch evaluator; native tools replace the Node ones.
8. LATER: resumable search + GPU batching (A4), policy-head encoding (A9), token revocation/tickets (H5), rate limits (H9).

---

## 12. Disposition of every spec NOTE

| NOTE | Verdict |
|---|---|
| 1 shuffle/RNG order | keep exactly for legacy records (§8); new records use RngVersion v3 (E2) |
| 2 `reach` tie-breaking | keep for `rules ≤ 2026.09`; specify it in the crate docs |
| 3 target strings, index ≠ number | blockades by printed number everywhere (E8) |
| 4 reserve splice / `gain.idx` | removed by `get: CardType` (E8) |
| 5 own deck order leaks within a type | View shows own deck as a multiset (E6) |
| 6 float32 first layer | don't replicate; tolerance test (A7) |
| 7 `botActions` deduped, non-exhaustive | engine `legal_actions` exhaustive up to type symmetry; pruning moves to the policy (E9, A1) |
| 8 `S.rules` dead, `S._endView` | delete both (A5, E6) |
| 9 `forceEnd` drops events; resign leaves piles | `Timeout` returns all events (E3); piles: harmless, keep |
| 10 `end` while active; `move` ignores `pi` | `end` fine (rules); `Continue{to}` removes the ignored field (E8) |
| 11 JS index coercion | **bug B1**; typed actions (E8) |
| 12 v1 can't resign/timeout; no `ai` on replay | one record format (E3/E4); setup carries `ai` (E10) |
| 13 viewer fallback uses Math.random | **bug B6** |
| 14 Elo not zero-sum with mixed K | intended (provisional K); document |
| 15 `.bin` drops multi-course fields | network format v2 (A6) |
| 16 `d.rated` misnamed | delete; use `results != null` (§9.3) |
| 17 HANDOFF drift | **B11** doc fix |
| 18 lobby listing lag / prune | **B9**; listing-after-first-socket is fine |
| 19 undo keeps the deadline; timeouts per seat | intended (owner); the time bank goes in the Room's `clock` (§10.5) |
| 20 undo vs record | disappears with record-as-storage (E4) |
| 21 defensive restore on failed act | keep until B2's try/catch covers it; then unnecessary (apply is atomic) |
| 22 500 on bad JSON; any-method routes | **B5**, H2 |
| 23 quick-match over-assignment | **B8** |
| 24 no AI in random-course rooms | follows from AI eligibility; one `ai_eligible` (E13) so UI and server agree |
| 25 full state per push | keep full snapshots (W5) |
| 26 `eldorado-rec` vs `-v1` | **B11**; key disappears with C3 |
| 27 UI calls ~40 internals | `Session` + 9 WASM functions (C1, §10.2) |
| 28 tools not reproducible | **B12**; fixed by explicit bot RNG (A3, A8) |
| 29 `turns.mjs` uses `E.botDist` | archive the script (§9.5) |
| 30 Uint16 column indices | fine while `nf < 65536`; record it in the feature schema (A5) |

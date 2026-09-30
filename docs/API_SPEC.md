# El Dorado Expedition — API

Three parts share one rules engine:

- **Engine**: `src/engine_*.js`, concatenated by `build.mjs` into the ES module `src/engine.gen.js`. Pure game logic, with no DOM and no I/O.
- **Server**: `src/worker.js`, a Cloudflare Worker with two Durable Objects (Lobby, Room) and a D1 database. It runs the same engine
  and is authoritative for online games.
- **Page**: `src/client/*.js`, bundled into one script. It builds actions and hands them to the engine (local play) or to the server
  (online). Its structure is described in `FRONTEND_REFACTOR.md`.

The AI tools (`tools/ai/*.mjs`) drive the engine directly in Node.

---

## 1. Engine

### 1.1 The game is a parameter

The engine holds no game. Every function that needs one takes it first: `gs`, the game state (§1.4), as in
`applyAction(gs, seat, a, rnd)`, `cardTargets(gs, seat, pi, id)`, `botChoose(gs, opts)`. A game's board (§1.3) comes from
its course and seed: `mapOf(gs)` builds it once and caches it (the last 16 boards), so every copy of a game shares it.
The functions that make a game return it: `newGame(o, rnd)` → gs, `recNewGame(o, rng)` → `{gs, rec}`, `recState(rec)` → gs,
`recUndo(rec)` → gs, `replayStart(log)` → gs, and `replay(log)` yields `{i, gs, …}`. The page keeps the game on show
itself (`state.js`: `S`, and its board `MAP`); the server keeps each room's (`this.S`).
- **Randomness is always passed in** (`rnd: () => [0, 1)`): `newGame(o, rnd)` and `applyAction(gs, seat, a, rnd)` shuffle with the
  generator they are given (default `Math.random`). A record gives each action its own (§1.8), so the same record always
  gives the same game. The AIs' look-ahead shuffles with its own `rnd`, never the game's.

### 1.2 Data

**`CT`**: every card type, keyed by id. Fields: `{n: name, c: kind, s?: symbol, p?: strength, cost?, once?: single use, txt?: rules text, face?: short text}`.

- **Kind `c`:** `g` machete (green), `b` paddle (blue), `y` coin (yellow), `x` joker (`s: '*'`), `p` action (purple).
- **Starting deck:** 3 explorer, 4 traveler, 1 sailor.
- **Market** (`MARKET0`): scout, trailblazer, jack, photographer, chest, transmitter.
- **Reserve** (`RESERVE0`): the other 12 types. Every type has one stack of 3.

**`BLOCKADES`**: the six official blockades, `{n, k, v}`. `n` is 1–6; `k` is the kind (`j` jungle, `v` village, `w` water, `r` rubble); `v` is the cost.

**`COLORS`**: the four player colours, `{id, hex, name}`. Each colour has its own explorer figure.

**`COURSES`**: the fixed routes, `{id, name, src, diff, p: [[board, q, r, rotation]…], e: [q, r], s: 'j'|'w'}`.

- `p` lists the boards in route order; the first is start board A or B.
- `e` is El Dorado's middle space; `s` is its side (jungle or water).
- The courses are `first`, `hills`, `winding` and `witch`. `courseById(id)` looks one up (`null` if unknown).

**Symbols:**

- `SYMNAME`: j machete, w paddle, v coin.
- `SYMCOL`: the colour of each symbol, including r (rubble).

**Geometry:**

- `R = 34` is the hex radius in board units, and `key(q, r) = "q,r"` is a space's key.
- `pxOf(q, r)` gives the space's centre (pointy-top axial coordinates).

### 1.3 `buildCourse(course, seed)` → MAP

`buildCourse` validates the route: boards don't overlap, El Dorado touches the last board, consecutive boards connect, and a path
exists from the start. It throws if any check fails. It returns the course's topology only (where things are drawn is the
page's: `src/client/board/layout.js` places each space at `pxOf(q, r)` and works out the city and the bounds):

| field | |
|---|---|
| `hexes` | `Map<key, {type, val, sym?, num?, q, r, k, tile}>` |
| `tiles` | `[{name, c: [q, r], k: rotation, end?}]`: each board, then El Dorado |
| `conns` | `[{a, b, edges: [[key, key]…]}]`: the seam between board i and board i+1 |
| `edgeConn` | `Map<"k1\|k2", connection index>` (both directions) |
| `starts` | the 4 start keys, numbered 1–4 |
| `goals` | the 3 El Dorado keys |
| `blockDefs` | `[{n, k, v, conn}]`: one blockade per connection, dealt with `mulberry32(seed ^ 0x2c1b3c6d)` |
| `endSym` | El Dorado's symbol |
| `route` | the board letters in order |
| `name` | the course name |
| `course` | the course id |

**Space types (`type`):**

| type | space | `val` |
|---|---|---|
| `j` | jungle | cost 1–4 |
| `w` | water | cost 1–4 |
| `v` | village | cost 1–4 |
| `r` | rubble | cards to discard |
| `c` | base camp | cards to remove |
| `m` | mountain | impassable |
| `s` | start | `num`: 1–4 |
| `g` | El Dorado | `sym`: the symbol needed to enter |

`mapFor(S)` is `buildCourse(S.course, S.seed)`.

### 1.4 The state `S` (`v: 5`)

```
{ seed, course: <course object>, fullRace,
  players: [P], cards: {id: type}, nid,            // card ids are 'c1', 'c2', …; nid is the next number
  market: [{t, n}], reserve: [{t, n}],             // n = cards left in the stack
  blockades: [{n, k, v, conn, owner: seat|null}],
  cur, round, endTriggered, over, places: [place per seat]|null,          // player 0 starts every round
  turn: { bought, active: {id, pi, sym, left}|null, pending: {max}|null },
  trash: [id], log: [{...event, r: round}] }  // the journal: the last 200 events but turn changes (§1.6)
P = { name, color, ai?: AI id, pieces: [key|'done'], deck: [id], hand: [id], discard: [id], play: [id],
      fin: round arrived|0, resigned: 0|order of resigning }             // blockades held: blocksOf(gs, seat)
```

- **`turn.active`:** the card whose leftover strength can keep moving the same explorer.
- **`turn.pending`:** a Scientist or Travel Log is waiting for its `trash` action.
- **Online:** the server never writes into `S` (who plays each seat is the room's `seats`, in seat order).

### 1.5 Actions — `applyAction(gs, seat, a, rnd = Math.random)` → `{ok, err?, ev: [event], reveal?}`

The acting seat must be `S.cur`, except for `resign`. A refused action returns `{ok: false, err: text}` and changes nothing.

| action | effect |
|---|---|
| `{t:'move', card, pi, to}` | Move explorer `pi` to `to`: a space key, or `'B'+index` for a blockade. `card` is a movement card in hand, or `turn.active.id` to use its leftover strength (then `pi` is ignored: the same explorer moves on). The target must be in `reach(gs, seat, pi, symbols, strength)`. Blockades crossed on the path are taken. |
| `{t:'native', card, pi, to}` | The Native moves to an adjacent free space, or tears down an adjacent blockade (`nativeTargets`). |
| `{t:'pay', pi, to, cards}` | Rubble or a rubble blockade (discard) or base camp (remove from the game), per `payTargets`. `cards` must be exactly `need` distinct cards from the hand. |
| `{t:'action', card}` | Cartographer (draw 2), Compass (draw 3), Scientist (draw 1, then remove up to 1) or Travel Log (draw 2, then remove up to 2). Sets `reveal`. |
| `{t:'trash', cards}` | Finishes a pending Scientist or Travel Log: 0…`max` cards from the hand are removed from the game. |
| `{t:'transmit', card, type}` | The Transmitter (then removed) takes one card of `type` from the market or reserve into the discard pile. |
| `{t:'buy', type, cards}` | At most one buy per turn. Coin and joker cards pay their strength; every other card pays ½. The reserve opens once a market slot is empty, and a reserve stack then moves into that slot. The bought card goes to the discard pile. |
| `{t:'end', keep}` | `keep` (required; `[]` keeps none): hand cards kept for next turn. The rest of the hand and the played cards go to the discard pile, then the player draws up to 4 (reshuffling the discard pile when the deck runs out). Sets `reveal`; the turn passes. |
| `{t:'timeout'}` | Ends the turn for the player: a pending removal is skipped and nothing is kept. |
| `{t:'resign'}` | Any seat, at any time. The player places below everyone still racing. |
| `{t:'endgame'}` | Local play only (the server refuses it): the game ends now. |

**Cards leaving play:**

- Single-use cards (`once`) are removed from the game when their effect is used.
- A single-use *coin or joker* card used to pay is also removed. Any other card used to pay goes to play as usual.

**Arriving:** when a player's last explorer reaches El Dorado, their turn ends at once: the hand and the cards played go to the
discard pile, nothing is drawn, and the next player moves (`turn` event). With two explorers each, the first to arrive doesn't end it.

**Game end:**

- Full race (`fullRace`, the default): the game ends at the end of the round in which at most one player is still racing.
- Official rule: the game ends at the end of the round in which the first player arrives.

**Places** are compared on this key, lower first:

| player | key |
|---|---|
| arrived | `[0, round arrived, −blockades held, −highest blockade]` |
| still racing | `[1, progress, −blockades, −highest]`, where progress is the step distance to El Dorado |
| resigned | `[2, −resign order]` |

Equal keys share a place; the winners are the players in place 1.

### 1.6 Events

`applyAction` returns events in the order things happened.

| event | meaning |
|---|---|
| `{e:'play', pl, k, …}` | What became public. `k`: `move`, `native`, `rubble`, `camp`, `blr`, `action`, `trash`, `transmit`, `buy`, `end`. `ts: [types]` lists the cards played, spent or removed. `move` adds `n` (spaces), `sym` and `more` (leftover strength); `native` adds `n` (1, or 0 for a blockade); `action` adds `n` (cards drawn). `buy` adds `got` and `paid`; `transmit` adds `got`. `end` gives only counts, `kept` and `disc`. |
| `{e:'move', pl, pi, path: [key…]}` | The explorer's path, including where it started. |
| `{e:'block', pl, n}` | A blockade was taken. |
| `{e:'arrive', pl, pi}` | The explorer reached El Dorado. |
| `{e:'turn', pl}` | The turn passed to `pl`. |
| `{e:'final'}` | The end of the race is set off: this round is the last (§1.5 Game end). |
| `{e:'timeout', pl}`, `{e:'resign', pl}`, `{e:'endgame', pl}`, `{e:'over'}` | |

**The journal** (`S.log`) is the game's history in the same words: every event above except `turn`, plus `{e:'start'}` when
the game is set up, each with the round it happened in (`r`). The engine keeps the last `LOG_MAX` (200). The page's history
column shows it turn by turn and writes its words (`feed.js`). It is as public as the events are.


### 1.7 Queries

| function | result |
|---|---|
| `reach(gs, seat, pi, syms, budget)` | `Map<key or 'B'+i, {t: 'move', kind: 'move'\|'bl', cost, sym, path: [key…], pi, bl?}>`: the cheapest route to each space (Dijkstra per symbol, first symbol wins ties). A route may pass blockades of its symbol by paying their cost; it can't enter occupied spaces, and it stops at El Dorado. |
| `nativeTargets(gs, seat, pi)` | `Map<key or 'B'+i, {t: 'native', kind: 'native'\|'nativebl', path, cost: 0, pi, bl}>` |
| `payTargets(gs, seat, pi)` | `Map<key or 'B'+i, {t: 'pay', kind: 'rubble'\|'camp'\|'blr', need, path?, pi, bl?}>` (only those the hand can pay) |
| `cardTargets(gs, seat, pi, id)` | Where that card can go now: a movement card's reach plus the rubble / camps / rubble blockades it could be given up for; the card in play: its leftover strength's reach; the Native: `nativeTargets`. The page's targets and "card usable" come from it. |
| `blocksOf(gs, seat)` | the blockades that player has taken (indexes; each blockade's `owner` is the one record of it) |
| `stackOf(gs, type)` | `{src: 'm'\|'r', i, s}` or `null` |
| `cantBuy(gs, seat, type)` | Why `seat` can't buy that card now, payment aside (`''` if it can): not their turn, a removal still to choose, already bought this turn, sold out, reserve closed. The buy action and the page's market both use it. |
| `buyOptions(gs, seat)` | `[{src, i, t}]`: what `seat` can buy now with the coins in hand (market first) |
| `reserveOpen(gs)` | a market slot is empty, so the reserve can be bought from |
| `coinVal(gs, id)` | a card's value when paying |
| `playerDone(p)`, `isActive(p)` | the player has arrived / is still racing |
| `eloDeltas(ratings, places, games)` | Multiplayer Elo. For every pair of players, K = (48 in a player's first 10 games, else 32) / (n−1); rounded to 0.1. |
| `redact(state, seat)` | A copy safe to send to `seat`: the other players' hands and decks become placeholder ids (`h1_0`, `d2_3`); the seat's own deck is sorted by type (its order stays hidden); `cards` lists only the ids the seat may see. |
| `mulberry32(seed)` | The engine's 32-bit generator. Anything reproducible depends on it. |

Every target's `t` is the action that goes there (`move`, `native`, or `pay` with the cards the player then picks).

### 1.8 Game records and logs

A game is its setup plus its list of actions; any position is rebuilt by replaying them.

```
{ kind: 'eldorado-replay', v: 3, course: id, seed, rng, fullRace, privacy?, gift?,
  players: [{name, color, bot?}], actions: [[seat, action]…],
  mark,                          // records in play only: actions before it can't be undone
  title?, result?: {places, rounds} }  // finished logs
```

**Randomness:** each action's shuffles use their own generator, `recRng(rng, i) = mulberry32((rng + imul(i + 2, 0x9E3779B1)) >>> 0)`;
`newGame` uses i = −1, and so does `gift` (training exploration: every player starts with the same extra card, shuffled into
the draw pile).

- Replaying therefore needs no generator state between moves.
- `rng` reveals every future shuffle, so a record in play stays on the server (or in the local save) until the game is over.

| function | |
|---|---|
| `recSecret()` | A new game's secret number, from `crypto.getRandomValues`. |
| `recNewGame(opts, rng)` → `{gs, rec}` | Starts a game and its record (`opts` as for `newGame`, plus `privacy?` and `gift?`). `rng` is required: `recSecret()` for games people play; tools and tests pass a fixed number to get the same game again. |
| `recApply(gs, rec, seat, a, rnd?)` | `applyAction` with the action's generator (`rnd` only for a game without a record). On success the action is recorded (`rec` may be `null`: not recorded). `mark` moves up when an action reveals cards, passes the turn, resigns or ends the game. |
| `recCanUndo(rec)` | `actions.length > mark` |
| `recUndo(rec)` → gs | Drops the last action and returns the rebuilt game. |
| `recState(rec)` → gs | The game a record leads to. |
| `recFinal(rec, state)` | The finished log, with `title` and `result` (`{places, rounds}`, read from `state`, the record's game), and without `mark`. |
| `replayCheck(log)` | `null`, or why the log can't be played. Records before v3 were played under older rules (the turn went on after the last explorer arrived) and are refused; the server deleted its stored ones once (settings `logs_v3`), rooms with one close, and the page dropped its old saves (keys `-v1`). |
| `replay(log)` | A generator: plays the log back one action at a time, yielding `{i, gs, ok, err, ev}` after each (`i = -1`: the setup; `gs` is one game, changed step by step). Stop early, or snapshot `gs` at each step. |
| `replayStart(log)` → gs | The log's game at its start. |

Tools record their games the same way (`recNewGame` with a fixed `rng`, `recApply`, `recFinal`); their logs' `result` is
`{capped, arrived}`.

`newGame({course, seed, players: [{name, color, ai?}], fullRace?})` starts a game without a record (tools and tests). (`privacy`, the page's pass-and-play cover, goes to `recNewGame` and lives in the record only.)

### 1.9 AI players

`AIS` lists the AIs:

| id | name | tier | how it plays |
|---|---|---|---|
| `humboldt` | Humboldt | Master | the network, with a whole-turn beam search |
| `raleigh` | Raleigh | Steady | the route planner |

Each entry also has `rating` (its calibrated starting rating), `desc` and `opts` (the bot settings).

| function | |
|---|---|
| `aiById(id)`, `aiUsesNet(id)` | |
| `aiAllowed(course, n)` | AIs are offered on First Expedition with 3–4 players (`aiCourseOK(course)` checks the course alone). |
| `aiChoose(gs, id, mem)` → action | One decision for `S.cur`. `mem` is `{}` per game and seat; it keeps the turn planner's cache. An unknown id, a 2-player game, or no fitting network: the route planner. After 60 decisions in one turn it ends the turn. It never removes its last card that can enter El Dorado, never thins its deck below 4 cards, and buys such a card before ending a turn without one. |
| `aiStep(gs, id, mem, rec, rnd?)` | `recApply` of `aiChoose` (the AI's choice is always legal: asserted). |
| `aiPlan(gs, id, rnd)` → `[action]` or null | The whole turn that AI would play from here for `S.cur` (its planner's best line; a draw card ends the line). null unless the AI plans whole turns with a loaded network. The replay shows Fawcett's. |
| `aiNetDecode(bytes)`, `aiSetNet(net)`, `botNetReady(gs)` | Load and select the network; `botNetReady(gs)` says whether it fits the course on show. |

**The network file** (`src/ai/first.bin`, made by `tools/ai/pack.mjs`):

1. uint32 LE: the header's length.
2. The JSON header: `{course, nf, unsettled, leak, name, parts: [[key, length]…]}`, plus `courses`, `onehot`, `extra` for a multi-course network.
3. Padding to an even offset.
4. Each part (`w1T, b1, w2, b2, w3, b3`) as little-endian IEEE half floats.

The network is 3 layers with leaky ReLU (slope `leak`) and a sigmoid output: a player's expected result, where 1st = 1 and each later place is worth less.
A multi-course network's header also names its inputs (`courses`, `onehot`, `extra`), so any trained network can ship.

### 1.10 Bot and training API (`engine_bot.js`)

These functions belong to the training code. `botActions` and `botChoose` act for `S.cur`; the others take a seat `me`.

| function | |
|---|---|
| `botActions(gs)` | Every distinct legal action, one per card type. Payments are minimal; end-of-turn keeps are 0–3 cards. |
| `botChoose(gs, opts)` → `{a, v?, …}` | See the options below. |
| `botNetFeatures(gs, me)`, `botEndFeatures(gs, me, keep)` | The network's inputs (Float32Array). |
| `botNetValue(f)`, `botValue(gs, me, mode)`, `botPlaceValue(place, n)` | Scoring. `botPlaceValue` is the training target: 1st = 1, last = 0, otherwise 1 / (`BOT_FIRST_RATIO` · 2^(place−2)). |
| `botCost(gs, key)`, `botRemaining(gs, seat)` | Route cost to El Dorado. |
| `botClone(S)` | A copy for look-ahead. |
| `botRandomCourse(seed, nMid)` | A random legal course (training only). |
| `BOT_NF`, `BOT_FLAGS`, `BOT_EVALS` | Constants and an evaluation counter. |
| `aiSetNet(n)` (§1.9) | Select the network. |

**`botChoose` options:**

| option | values |
|---|---|
| `mode` | `net` (the default when a network is set; without a fitting network it becomes `heur`), `heur`, or `plan` (the hand-written planner, the AI Raleigh; it returns before any option below is read) |
| `search` | `{kind: 'plan', beam}`: the whole-turn planner (Humboldt, Fawcett, and training with `SEARCH_BEAM`) |
| `planMem` | Required with `search`: the seat's plan holder `{plan}`, one per seat, kept between its moves (the planner follows its plan while the position is the one it expected). `aiChoose` passes the AI's memory. |
| exploration | `rnd`, `eps`, `typeEps`, `temp`, `lotemp`, `noise`, `turnState: {noBuy, forceTransmit}` |
| other | `draws`: imagined draws per draw card (default 4; Fawcett uses 8) |

**Contract:** the feature vectors, including the order of `BOT_TYPES`, space keys sorted as strings and connection order, must stay
bit-for-bit identical for trained networks to keep working. `test/fixtures/features.json` pins them at 348 positions.

### 1.11 Exports

- Every top-level name is exported. The page's modules import names; the server, the tools and the tests import the
  whole engine as a namespace (`import * as E from './engine.gen.js'`; `E.BOT_EVALS` is live).

### 1.12 What a port must reproduce exactly

Stored records replay only if a port keeps these exactly:

- **Randomness:** `mulberry32`, `recRng`, `shuffle` (Fisher–Yates from the end), and the order of draws. `newGame` shuffles each
  player's deck, then deals; a deck is refilled from the shuffled discard pile only when it runs out mid-draw.
- **Move paths:** `reach` picks among equally cheap routes by its search order: a linear scan for the smallest cost that pops the
  first minimum and swap-removes it, with neighbours in `DIRS` order. A record stores only the destination, and the path decides
  which blockades on the way are taken.

The trained networks work only if a port keeps these exactly:

- **Features:** the order of inputs follows `BOT_TYPES`, space keys sorted as strings, and each connection's first edge, which
  follows the order spaces were added to `MAP.hexes`.
- **Arithmetic:** layer 1 accumulates in 32-bit floats and the rest in 64-bit, ending with `exp`. Compare network outputs with a
  small tolerance; `exp` can differ in the last bit between platforms.

---

## 2. Server

### 2.1 Configuration (`wrangler.jsonc`)

| binding | what it is |
|---|---|
| `ASSETS` | `public/` (the page) |
| `DB` | D1 |
| `LOBBY` | Durable Object `Lobby` (one instance, `main`) |
| `ROOMS` | Durable Object `Room` (one per room code) |
| `GOOGLE_CLIENT_ID` | var |
| `TRAIN_TOKEN_HASH` | var: SHA-256 of the training machine's token |
| `DEV_AUTH=1` | local only: name-only sign-in |

### 2.2 Auth

- **Token:** `uid.expiry.hmac`, HMAC-SHA256 with a secret kept in `settings`. It lasts 60 days.
- **Sending it:** as `Authorization: Bearer …`, or as `?t=` on WebSocket URLs.
- **Google sign-in:** the ID token is verified against Google's keys (audience, issuer, expiry, RS256).
- **Names:** at most 16 letters, digits, spaces and `_.'-`, unique without regard to case (a clash gets a number added). (The setup
  screen allows 14 characters for local players; logs keep up to 24.)

### 2.3 HTTP (`/api/…`; JSON; errors are `{error}` with an HTTP status)

| request | auth | response |
|---|---|---|
| `GET config` | | `{google, dev}` |
| `POST auth/google {credential}` | | `{token, user, isNew}` |
| `POST auth/dev {name}` | dev only | same as above |
| `GET me` | yes | `{user: {id, name, rating, games, wins}, active: room code\|null}` |
| `PATCH me {name}` | yes | `{user}` |
| `GET users/:id` | optional | `{user: {…, bot, rank}, games: [{…game, seat}]}` (seat: theirs in it): the latest 10 games; games from private rooms are shown only to the player |
| `GET leaderboard` | | `{players: [{id, name, rating, games, wins, bot}]}`: top 100 with rated games, plus the current AIs |
| `POST rooms {max 2–4, course\|'random', turn ∈ 60/90/120/180/300, pub, rated}` | yes | `{code}` |
| `POST match` | yes | `{code}`: the room the player is already in (of any kind), else the fullest open quick match, else a new one |
| `GET rooms/:code/ws` | yes | WebSocket to the Room (§2.5) |
| `GET lobby/ws` | yes | WebSocket: `{t: 'rooms', rooms: [room]}` (the room shape of §2.5) on connect and on every change |
| `POST replays <log>` | | `{id}`: any valid log, up to 1.9 MB; the latest 1000 uploads are kept (tools/ai/record.mjs; the page has no upload) |
| `GET replays` | | `{replays: [game]}`: the latest 50 listed. A game: `{id, created, actions, course, names, places, rounds}` (from the log; places null if it never finished) |
| `GET replays/:id` | | the log |
| `POST train` / `GET train` | token / | training progress for `/train.html`: `POST` stores a status (`{ok: true}`); `GET` returns `{updated, now, status}` |

Errors are `{err}` with an HTTP status. The lobby lists public rooms only. A room leaves the list when
it closes or ends, or after 2 h in the lobby or 12 h in play.

### 2.4 Room: lifecycle

- **Storage:** `d` (the room) and `rec` (the game's record, §1.8). `S` is rebuilt from `rec` whenever the object wakes. `rec` never
  leaves the room until the game is over.
- **Status:** `lobby` → `playing` → `over`, or `closed` (the host left the lobby, or a quick match emptied).
- **Seats:** `{uid, name, color, now?, ai?}`.
  - A person takes a seat by connecting while there is room.
  - The host adds AIs (First Expedition in a room for 3–4, never in quick match; the same AI may take several seats, named "Humboldt 2", …).
  - **Quick-match rooms** (`auto`, 3 seats, a random course, 90 s turns) start when full, or when 2 or more are seated and all pressed
    "start now". A seat is given up when its player closes the page before the start.
- **Turn clock (time bank):** each turn adds `turn` seconds to the player's bank; unused time carries over, and undo doesn't change it.
  - When the bank runs out, the turn ends (`timeout`). The third timeout in a row is a `resign`.
  - `left` (ms on the clock) is sent with every state.
- **AI seats** move on the server, one action per alarm (0.9 s before an AI's turn, then 0.7 s per action). When no racing person has
  the page open, they play without pauses (~0.3 s of moves per alarm).
- **Game over:**
  - The record becomes a replay (listed unless the room was private; each person keeps their latest 10).
  - `matches` gets a row either way; in a rated room, ratings and games/wins update (`eloDeltas`).
  - `results` goes out with the room:
    - rated: `{places, before, deltas, replay}`
    - unrated: `{places, unrated: true, replay}`
    - database failure: `{places, error, replay}`

### 2.5 Room: WebSocket messages

**Client → server** (text `ping` is answered with `pong`):

| phase | message |
|---|---|
| lobby | `{t: 'color', color}`, `{t: 'leave'}`, `{t: 'now'}` (quick match: toggle "start now"). A seat is taken by connecting. |
| lobby, host | `{t: 'addAI', ai}`, `{t: 'removeAI', uid}`, `{t: 'rated', v}`, `{t: 'start'}` |
| playing | `{t: 'act', a}`: a player action (§1.5: not `timeout` or `endgame`) for the sender's seat. The server runs `recApply`; a refused action is answered with an error and leaves the game untouched. |
| playing | `{t: 'undo'}`: the player to move takes back their last action if `recCanUndo`. |

**Server → client:**

| message | |
|---|---|
| `{t: 'room', room}` | In the lobby, after every change. |
| `{t: 'state', S, ev, seat, undo, left, room}` | In play, after every change, to every socket. `S` is `redact(S, seat)`; `seat` is the receiver's seat (−1 for watchers); `undo` says whether this seat may undo now; `left` is the ms left on the turn clock (null when none runs; the page counts down from when the message arrives). |
| `{t: 'error', err}` | The receiver's message was refused (the game is untouched). |

`room = {code, host, status, opts: {max, course, turn, pub, rated, auto}, seats: [{uid, name, color, now, ai, online}], results}`

### 2.6 D1 tables (created on first use; columns are only ever added)

| table | columns |
|---|---|
| `users` | `id` (`u…` for people, `ai-<id>` for AIs), `google_sub`, `name`, `rating` (1200), `games`, `wins`, `created`, `bot` |
| `replays` | `id`, `created`, `title`, `players`, `actions`, `body` (the log), `game` (1 = an online game), `uids` (`,uid,uid,`), `listed`, `places` (no longer written: the log's `result` has them) |
| `matches` | `id`, `room`, `finished`, `data` (JSON: players, names, ai, places, rated, before, deltas, rounds, replay) |
| `settings` | `k`, `v` (the session secret; the one-time AI rating calibration marker) |
| `train` | `run`, `updated`, `body` |

---

## 3. Page

**Links:**

- `?room=CODE` joins a room.
- `?replay=ID` opens a replay.
- `?debug` shows an on-screen log of layout, input and frame events.

**Local storage:**

| key | holds |
|---|---|
| `eldorado-game-v2` | the game in progress: its record, `S` rebuilt from it (the -v1 keys held records from before v3; dropped on load) |
| `eldorado-games-v2` | up to 20 finished local games (logs) |
| `ed-token` | the sign-in token |
| `eldorado-seats` | the AI choices on the start screen |
| `eldorado-mkt` | whether the market is open |
| `eldorado-sound` | sound on or off |
| `eldorado-rspeed2`, `eldorado-rside` | replay speed, evaluation panel |

**Test hooks (`window.__ED`):**

- The page's state: `S`, `MAP`, `UI`, `NET`, `G`.
- Its entry points: `act`, `playEvents`, `onHandCard`, `doMove`, `pickFromMarket`, `confirmBuy`, `confirmDiscardFor`, `confirmTrash`,
  `startEndTurn`, `finishTurn`, `cancelMode`, `openReplay`, `joinRoom`, `netSend`, `render`; each call leaves the page updated.
- Also `canAct` and `showCourse` (for `tools/course-check`).

---

## 4. Tools

The tools import the engine as `E` (`import * as E`). They play games through one helper, `tools/ai/playout.mjs`:

```
playout({seed, players: seatPlayers(n, aiIds?), choose: me => action, course?, cap = 25, stop?, after?}) → {capped}
```

- The game shuffles with `mulberry32(seed * 7 + 1)`, so a seed replays the same game when the choices are seeded too
  (`botChoose(gs, {rnd})`; the bot's look-ahead uses only that `rnd`).
- The choices must be legal (asserted). A round cap ends a game with `E.endGame()`.
- The training generator (`gen.mjs`) and the recorder (`record.mjs`) keep their own loops: they write game logs.
- The game's generator goes only to the game's own `applyAction` calls, so the bots' look-ahead never consumes it.
- `tools/ai/golden.mjs` checks the feature contract (§1.10).
- `h2h.mjs` plays AI settings against each other.
- `calibrate_ais.mjs` measures the AIs' starting ratings (the deals are seeded; the AIs' choices are not, see §1.1).

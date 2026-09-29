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

### 1.1 Module state

The engine works on three module-level variables:

| name | what |
|---|---|
| `S` | the game on show (§1.4); `null` before a game |
| `MAP` | the board built from `S.course` and `S.seed` (§1.3) |
| `RNG` | the random source every shuffle uses; `setRng(f)` sets it, `setRng(null)` restores `Math.random` |

- **Access from outside:** consumers read and replace them through `E.S`, `E.MAP` (getters and setters), or through the named live
  exports with `setS(v)` and `setMAP(v)`.
- **Determinism:** the same `RNG` sequence plus the same actions always give the same game. The AIs decide with `Math.random`
  (look-ahead shuffles), so the same seeded game between AIs doesn't repeat move for move.

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
exists from the start. It throws if any check fails. It returns:

| field | |
|---|---|
| `hexes` | `Map<key, {type, val, sym?, num?, q, r, k, tile, x, y}>` |
| `tiles` | `[{name, c: [q, r], k: rotation, x, y, end?}]`: each board, then El Dorado |
| `conns` | `[{a, b, edges: [[key, key]…]}]`: the seam between board i and board i+1 |
| `edgeConn` | `Map<"k1\|k2", connection index>` (both directions) |
| `starts` | the 4 start keys, numbered 1–4 |
| `goals` | the 3 El Dorado keys |
| `blockDefs` | `[{n, k, v, conn}]`: one blockade per connection, dealt with `mulberry32(seed ^ 0x2c1b3c6d)` |
| `city` | `{x, y, dx, dy}`: where arrived explorers stand |
| `endSym` | El Dorado's symbol |
| `minX, minY, w, h` | the board's bounds |
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
  trash: [id], log: [{p: seat|null, t: text, r: round}] }       // the log keeps the last 200 lines
P = { name, color, ai?: AI id, pieces: [key|'done'], deck: [id], hand: [id], discard: [id], play: [id],
      fin: round arrived|0, resigned: 0|order of resigning }             // blockades held: blocksOf(seat)
```

- **`turn.active`:** the card whose leftover strength can keep moving the same explorer.
- **`turn.pending`:** a Scientist or Travel Log is waiting for its `trash` action.
- **Online:** the server never writes into `S` (who plays each seat is the room's `seats`, in seat order); it keeps only the last 120 log lines.

### 1.5 Actions — `applyAction(seat, a)` → `{ok, err?, ev: [event], reveal?}`

The acting seat must be `S.cur`, except for `resign`. A refused action returns `{ok: false, err: text}` and changes nothing.

| action | effect |
|---|---|
| `{t:'move', card, pi, to}` | Move explorer `pi` to `to`: a space key, or `'B'+index` for a blockade. `card` is a movement card in hand, or `turn.active.id` to use its leftover strength (then `pi` is ignored: the same explorer moves on). The target must be in `reach(seat, pi, symbols, strength)`. Blockades crossed on the path are taken. |
| `{t:'native', card, pi, to}` | The Native moves to an adjacent free space, or tears down an adjacent blockade (`nativeTargets`). |
| `{t:'pay', pi, to, cards}` | Rubble or a rubble blockade (discard) or base camp (remove from the game), per `payTargets`. `cards` must be exactly `need` distinct cards from the hand. |
| `{t:'action', card}` | Cartographer (draw 2), Compass (draw 3), Scientist (draw 1, then remove up to 1) or Travel Log (draw 2, then remove up to 2). Sets `reveal`. |
| `{t:'trash', cards}` | Finishes a pending Scientist or Travel Log: 0…`max` cards from the hand are removed from the game. |
| `{t:'transmit', card, type}` | The Transmitter (then removed) takes one card of `type` from the market or reserve into the discard pile. |
| `{t:'buy', type, cards}` | At most one buy per turn. Coin and joker cards pay their strength; every other card pays ½. The reserve opens once a market slot is empty, and a reserve stack then moves into that slot. The bought card goes to the discard pile. |
| `{t:'end', keep}` | `keep` (optional, default none): hand cards kept for next turn. The rest of the hand and the played cards go to the discard pile, then the player draws up to 4 (reshuffling the discard pile when the deck runs out). Sets `reveal`; the turn passes. |
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
| `{e:'timeout', pl}`, `{e:'resign', pl}`, `{e:'over'}` | |


### 1.7 Queries

| function | result |
|---|---|
| `reach(seat, pi, syms, budget)` | `Map<key or 'B'+i, {kind: 'move'\|'bl', cost, sym, path: [key…], pi, bl?}>`: the cheapest route to each space (Dijkstra per symbol, first symbol wins ties). A route may pass blockades of its symbol by paying their cost; it can't enter occupied spaces, and it stops at El Dorado. |
| `nativeTargets(seat, pi)` | `Map<key or 'B'+i, {kind: 'native'\|'nativebl', path, cost: 0, pi, bl}>` |
| `payTargets(seat, pi)` | `Map<key or 'B'+i, {kind: 'rubble'\|'camp'\|'blr', need, path?, pi, bl?}>` (only those the hand can pay) |
| `cardTargets(seat, pi, id)` | Where that card can go now: a movement card's reach plus the rubble / camps / rubble blockades it could be given up for; the card in play: its leftover strength's reach; the Native: `nativeTargets`. The page's targets and "card usable" come from it. |
| `blocksOf(seat)` | the blockades that player has taken (indexes; each blockade's `owner` is the one record of it) |
| `stackOf(type)` | `{src: 'm'\|'r', i, s}` or `null` |
| `cantBuy(seat, type)` | Why `seat` can't buy that card now, payment aside (`''` if it can): not their turn, a removal still to choose, already bought this turn, sold out, reserve closed. The buy action and the page's market both use it. |
| `buyOptions(seat)` | `[{src, i, t}]`: what `seat` can buy now with the coins in hand (market first) |
| `reserveOpen()` | a market slot is empty, so the reserve can be bought from |
| `coinVal(id)` | a card's value when paying |
| `playerDone(p)`, `isActive(p)` | the player has arrived / is still racing |
| `eloDeltas(ratings, places, games)` | Multiplayer Elo. For every pair of players, K = (48 in a player's first 10 games, else 32) / (n−1); rounded to 0.1. |
| `redact(state, seat)` | A copy safe to send to `seat`: the other players' hands and decks become placeholder ids (`h1_0`, `d2_3`); the seat's own deck is sorted by type (its order stays hidden); `cards` lists only the ids the seat may see. |
| `mulberry32(seed)` | The engine's 32-bit generator. Anything reproducible depends on it. |

### 1.8 Game records and logs

A game is its setup plus its list of actions; any position is rebuilt by replaying them.

```
{ kind: 'eldorado-replay', v: 3, course: id, seed, rng, fullRace, privacy?,
  players: [{name, color, bot?}], actions: [[seat, action]…],
  mark,                          // records in play only: actions before it can't be undone
  title?, result?: {places, rounds} }  // finished logs
```

**Randomness:** each action's shuffles use their own generator, `recRng(rng, i) = mulberry32((rng + imul(i + 2, 0x9E3779B1)) >>> 0)`;
`newGame` uses i = −1.

- Replaying therefore needs no generator state between moves.
- `rng` reveals every future shuffle, so a record in play stays on the server (or in the local save) until the game is over.

| function | |
|---|---|
| `recNewGame(opts)` → rec | Starts a game (`opts` as for `newGame`; `rng` comes from `crypto.getRandomValues`, or `Math.random` where there is none). Sets `S` and `MAP`. |
| `recApply(rec, seat, a)` | `applyAction` with the action's generator. On success the action is recorded (`rec` may be `null`: not recorded). `mark` moves up when an action reveals cards, passes the turn, resigns or ends the game. |
| `recCanUndo(rec)` | `actions.length > mark` |
| `recUndo(rec)` | Drops the last action and rebuilds `S` and `MAP`. |
| `recState(rec)` → `{S, MAP}` | The position a record leads to (the module's `S` and `MAP` are left as they were). |
| `recFinal(rec)` | The finished log, with `title` and `result` (`{places, rounds}`, read from the game on show, `S`), and without `mark`. |
| `replayCheck(log)` | `null`, or why the log can't be played. Records before v3 were played under older rules (the turn went on after the last explorer arrived) and are refused; the server deleted its stored ones once (settings `logs_v3`), rooms with one close, and the page dropped its old saves (keys `-v1`). |
| `replayStart(log)`, `replayStep(log, i)` | Rebuild step by step; `replayStep` returns `applyAction`'s result. |

**Training logs** (`v: 1`, tools only) use one generator for the whole game, `mulberry32(rng)`, consumed only by the recorded actions.
They may give every player one extra card (`gift`) shuffled into the deck. `replayStart` leaves their generator installed for the
steps that follow. Tool logs also carry `notes` and `result: {capped, arrived}`.

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
| `aiChoose(id, mem)` → action | One decision for `S.cur`. `mem` is `{}` per game and seat; it keeps the turn planner's cache. An unknown id, a 2-player game, or no fitting network: the route planner. After 60 decisions in one turn it ends the turn. It never removes its last card that can enter El Dorado, never thins its deck below 4 cards, and buys such a card before ending a turn without one. |
| `aiStep(id, mem, rec)` | `recApply` of `aiChoose`; if the action is refused, a `timeout` instead. |
| `aiPlan(id, rnd)` → `[action]` or null | The whole turn that AI would play from here for `S.cur` (its planner's best line; a draw card ends the line). null unless the AI plans whole turns with a loaded network. The replay shows Fawcett's. |
| `aiNetDecode(bytes)`, `aiSetNet(net)`, `aiNetFits()` | Load and select the network; `aiNetFits()` says whether it was trained for this course. |

**The network file** (`src/ai/first.bin`, made by `tools/ai/pack.mjs`):

1. uint32 LE: the header's length.
2. The JSON header: `{course, nf, unsettled, leak, name, parts: [[key, length]…]}`.
3. Padding to an even offset.
4. Each part (`w1T, b1, w2, b2, w3, b3`) as little-endian IEEE half floats.

The network is 3 layers with leaky ReLU (slope `leak`) and a sigmoid output: a player's expected result, where 1st = 1 and each later place is worth less.
The file has no room for a multi-course network's `courses`, `onehot` or `extra`: only single-course networks can ship.

### 1.10 Bot and training API (`engine_bot.js`)

These functions belong to the training code. `botActions` and `botChoose` act for `S.cur`; the others take a seat `me`.

| function | |
|---|---|
| `botActions()` | Every distinct legal action, one per card type. Payments are minimal; end-of-turn keeps are 0–3 cards. |
| `botChoose(opts)` → `{a, v?, …}` | See the options below. |
| `botTurn(opts)` → actions | Plays the rest of the turn. |
| `botScoreActions(me, rnd, K)` → `[{a, v, st}]` | Every action scored by the network. |
| `botNetFeatures(me)`, `botEndFeatures(me, keep)` | The network's inputs (Float32Array). |
| `botNetValue(f)`, `botValue(me, mode)`, `botPlaceValue(place, n)` | Scoring. `botPlaceValue` is the training target: 1st = 1, last = 0, otherwise 1 / (`BOT_FIRST_RATIO` · 2^(place−2)). |
| `botCost(key)`, `botRemaining(seat)` | Route cost to El Dorado. |
| `botClone(S)` | A copy for look-ahead. |
| `botRandomCourse(seed, nMid)` | A random legal course (training only). |
| `BOT_NF`, `BOT_FLAGS`, `BOT_EVALS` | Constants and an evaluation counter. |
| `setNet(n)`, `setPlan(k, o)`, `BOT_PLANS` | Select the network; define planner variants. |

**`botChoose` options:**

| option | values |
|---|---|
| `mode` | `net` (the default when a network is set; without a fitting network it becomes `heur`), `heur`, `heur2`, or `plan…` (the planner, with `BOT_PLANS[mode]`; it returns before any option below is read) |
| `search` | `{kind: 'plan', beam}`, `{kind: 'deep', beam, cands, depth, budget}`, `{kind: 'rollout', cands, sims, margin}` or `{width, depth}` |
| exploration | `rnd`, `eps`, `typeEps`, `temp`, `lotemp`, `noise`, `turnState: {noBuy, forceBuy, forceTransmit}` |
| other | `draws` (K), `explain` |

No caller uses `botTurn`, `setPlan`, `forceBuy`, `draws`, `heur2`, `{kind: 'rollout'}` or `{width, depth}`; they are candidates for removal.

**Contract:** the feature vectors, including the order of `BOT_TYPES`, space keys sorted as strings and connection order, must stay
bit-for-bit identical for trained networks to keep working. `test/fixtures/features.json` pins them at 348 positions.

### 1.11 Exports

- `export {…every top-level name}`: live bindings, for the page's modules. `setS(v)` and `setMAP(v)` replace the game.
- `export const E = {…}`: the curated object the server and the tools use. It holds most functions above (not `stackOf`, `coinVal`,
  `isActive`), `S` and `MAP` as getters and setters, `MAPX` (the same as `MAP`) and a `BOT_EVALS` getter.

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
| `GET users/:id` | optional | `{user: {…, bot, rank}, games: [{id, created, title, actions, place, of}]}`: the latest 10 games; games from private rooms are shown only to the player |
| `GET leaderboard` | | `{players: [{id, name, rating, games, wins, bot}]}`: top 100 with rated games, plus the current AIs |
| `POST rooms {max 2–4, course\|'random', turn ∈ 60/90/120/180/300, pub, rated}` | yes | `{code}` |
| `POST match` | yes | `{code}`: the room the player is already in (of any kind), else the fullest open quick match, else a new one |
| `GET rooms/:code/ws` | yes | WebSocket to the Room (§2.5) |
| `GET lobby/ws` | yes | WebSocket: `{t: 'rooms', rooms: [room]}` (the room shape of §2.5) on connect and on every change |
| `POST replays <log>` | | `{id}`: any valid log, up to 1.9 MB; the latest 1000 uploads are kept |
| `GET replays` | | `{replays: [{id, created, title, players, actions}]}`: the latest 50 listed |
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
| `replays` | `id`, `created`, `title`, `players`, `actions`, `body` (the log), `game` (1 = an online game), `uids` (`,uid,uid,`), `listed`, `places` (JSON, in `uids` order) |
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
- Also `view`, `frameStats`, `myId`, `canAct`, `reach`, `applyAction`, and `showCourse` (for `tools/course-check`).

---

## 4. Tools

The tools import `E`. Their common loop:

```
E.newGame({course, seed, fullRace: true, players})        // or E.replayStart(log) to record a replayable game
while (!E.S.over) { const me = E.S.cur; E.setNet(netFor(me));
  const a = E.botChoose(opts).a; if (!E.applyAction(me, a).ok) E.applyAction(me, {t: 'end', keep: []}); }
```

- A round cap ends a game with `E.endGame()`.
- To record a game, install the game's generator only around each recorded `applyAction` (`setRng(gen)` … `setRng(null)`), so the
  bots' look-ahead never consumes it.
- `tools/ai/golden.mjs` checks the feature contract (§1.10).
- `h2h.mjs` plays AI settings against each other.
- `calibrate_ais.mjs` measures the AIs' starting ratings (the deals are seeded; the AIs' choices are not, see §1.1).

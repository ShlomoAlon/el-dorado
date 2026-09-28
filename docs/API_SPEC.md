# El Dorado Expedition — API specification (pre-Rust-rewrite)

Repository snapshot: `/home/user/el-dorado` at commit `d729c3d` (2026-09-28).
Scope: every interface between the rules engine, the server (Cloudflare Worker + Durable Objects + D1), the browser client and the
AI tools. The game rules themselves are out of scope except where they define an API's contract.
Citations are `file:line` against that commit. "NOTE:" marks something ambiguous, inconsistent, or only implied by the code.

Contents
0. Build and module layout
1. The engine as a library
   1.1 Module-level state · 1.2 Static data · 1.3 MAP · 1.4 State S · 1.5 Actions and applyAction · 1.6 Events ·
   1.7 Other rule functions · 1.8 Game records / replay logs · 1.9 redact · 1.10 eloDeltas · 1.11 Named-AI API ·
   1.12 Network file format · 1.13 Bot / training API · 1.14 Export object `E`
2. The server (worker.js)
3. The frontend
4. The AI tools
5. Consolidated NOTE list

---

## 0. Build and module layout

`build.mjs` (build.mjs:7) concatenates, in this order, into ONE script scope:
`src/engine_data.js` + `src/engine_rules.js` + `src/engine_bot.js` + `src/engine_ai.js`.
All top-level `const`/`let`/`function` declarations are plain globals of that scope (no modules, no namespaces).

Three products (build.mjs:26-35):

| Product | Contents | Engine access |
|---|---|---|
| `public/index.html` | shell.html + one IIFE `(()=>{'use strict'; const $=…; const AI_NET={url:'/ai/first.bin'}; <engine> <ui files>})()` (minified with esbuild if available) | UI code reads/writes engine globals `S`, `MAP`, `RNG`, `BOT_NET` … directly (same scope) |
| `build/artifact.html` | same, but `AI_NET={b64:'<base64 of first.bin>'}` and fonts embedded | same |
| `src/engine.gen.js` | engine text + `export const E={…}` (build.mjs:33) | server and Node tools use only `E` (getters/setters for `S`, `MAP`) |
| `public/ai/first.bin` | copy of `src/ai/first.bin` | fetched by the page |
| `public/train.html` | copy of `src/client/train.html` | polls `/api/train` |

UI file order (build.mjs:8): `ui_state.js, ui_sound.js, ui_art.js, ui_meeple.js, ui_view.js, ui_online.js, ui_replay.js, ui_boot.js`.

NOTE: because everything shares one scope, the browser UI is not limited to `E`'s surface; it calls unexported engine internals
(e.g. `isActive`, `hexAt`, `def`, `typeOf`, `coinVal`, `blockAt`, `log`, `neighbors`, `fmt`, `plural`, `loadRec`, `aiById`, `BOT_PLAN_CACHE` …)
directly. Section 3 lists what the client touches.

---

## 1. The engine as a library

### 1.1 Module-level state

| Global | Declared | Type | Who writes it | Who reads it |
|---|---|---|---|---|
| `S` | engine_rules.js:6 `let S=null` | game state object (§1.4) or null | `newGame` (assigns a NEW object), `recNewGame`/`replayStart` (via newGame); every bot look-ahead temporarily swaps `S` to a clone and back (engine_bot.js:181,186,344,386-389,404-425,432,437,446,475,483,496); callers assign directly (`E.S=…`, UI `S=…`) | every rules function |
| `MAP` | engine_rules.js:6 `let MAP=null` | map object (§1.3) | `newGame` (engine_rules.js:82); callers (`E.MAP=…`, UI `MAP=mapFor(S)`) | rules, bot |
| `RNG` | engine_data.js:83 `let RNG=Math.random` | `()=>number in [0,1)` | `setRng(f)` (engine_data.js:84; `f||Math.random`); `replayStart`, `replayStep`, `recNewGame`, `recDo`, `aiChoose`, `botDeepPlayout`, `botRolloutChoose` save/restore it with direct assignment `RNG=r0` | `shuffle()` default generator (engine_data.js:85) → `newGame` deck shuffle, `drawCards` reshuffle of the discard pile, `replayStart` gift insertion |
| `BOT_NET` | engine_bot.js:286 `let BOT_NET=null` | decoded network object (§1.12) or null | `aiSetNet(n)` (engine_ai.js:32), `E.setNet(n)` | `botNetReady`, `botNetValue`, `botNetNF`, `botNetFeatures`, `botChoose` default mode |
| `BOT_EVALS` | engine_bot.js:287 | integer counter | `botNetValue` increments (engine_bot.js:291) | tools / tests via `E.BOT_EVALS` getter (read-only) |
| `BOT_PLAN_CACHE` | engine_bot.js:427 | `{me,round,line:[action],i,key,v}` or null | `botPlanTurnChoose`, `botDeepChoose`, `botDeepPlayout` (save/restore), `aiChoose` (loads from `mem.plan`, stores back, then nulls it: engine_ai.js:41-42) | `botPlanTurnChoose`, `botDeepChoose` |
| `BOT_PLANS` | engine_bot.js:165 `{plan:{}}` | map name → planner option overrides | `E.setPlan(k,o)` | `botChoose` for `mode` starting with `'plan'` |
| `BOT_PLAN_CUR` | engine_bot.js:165-166 | current planner options (merged with `BOT_PLAN_DEF`) | `botPlanChoose` | `botPlanMoves`, `botCardWorth` |
| `BOT_FBUF` | engine_bot.js:271 | Float32Array scratch | `botNetFeatures(me,true)` | same |
| `BOT_BLOCK` | engine_bot.js:234 | `{courseId: blockSize}` memo | `botBlockSize` | same |
| `BOT_CP` | engine_bot.js:245 | `{cardType: Float64Array(11)}` memo | `botCardProps` | same |

Per-MAP caches (stored as extra properties ON the MAP object, created lazily; engine never clears them — a new MAP object starts empty):

| Property | Created by | Content |
|---|---|---|
| `MAP._nb` | `neighbors(k)` engine_rules.js:105 | `Map<hexKey, hexKey[]>` existing neighbours |
| `MAP._bd` | `botDist()` engine_bot.js:13-27 | `{cost:Map<key,number>, steps:Map, mix:Map<key,{j,w,v,r,c}>, near:Map}` — distances to El Dorado. Depends ONLY on the map, not on S (blockades/occupation ignored). |
| `MAP._fb` | `botFeatures` engine_bot.js:81-84 | `{st:Float32Array(144), binOf:Map, b:Float32Array(144)}` |
| `MAP._bo` | `botMapOrder()` engine_bot.js:231 | `{keys:[non-mountain hex keys sorted as strings], idx:Map}` |
| `MAP._pt` | `botPatchOf(k)` engine_bot.js:254 | `Map<key, 37 cells>` |

NOTE: the server caches MAP objects across rooms (worker.js:290-291, up to 200) so these caches are shared between rooms of
the same `(course.id, seed)`; they are pure functions of the map, so this is safe.

Rules of use (implied, never enforced):
- Every rules call works on whatever `S`/`MAP` currently hold. Callers that juggle several games (server rooms, tools) MUST set
  `E.S` and `E.MAP` before each call (worker.js:306 `engine()`); MAP must be the map of `(S.course, S.seed)`.
- Functions that REPLACE `S` (`newGame`, `recNewGame`, `replayStart`) leave the new object in the global; callers read it back
  (`this.S = E.S`, worker.js:404,419,445,460). `applyAction` mutates `S` in place (does not replace it).
- The engine is synchronous and single-threaded; bot look-aheads swap `S` and always restore it before returning (they rely on
  no re-entrancy).

### 1.2 Static data (engine_data.js)

`CT` (engine_data.js:4-26): card type id → `{n:name, c:colour, s?:symbol, p?:strength, cost?:price, once?:1, txt?:string, face?:string}`.
- `c` ∈ `'g'` (green/machete), `'b'` (blue/paddle), `'y'` (yellow/coin), `'x'` (joker), `'p'` (purple action card).
- `s` ∈ `'j'` jungle/machete, `'w'` water/paddle, `'v'` village/coin, `'*'` any (jokers). Purple cards have no `s`/`p`.
- 21 type ids, in declaration order (this order is load-bearing: `BOT_TYPES=Object.keys(CT)`, engine_bot.js:11, defines network input positions):
  `explorer, traveler, sailor, scout, trailblazer, pioneer, giant, captain, photographer, journalist, chest, millionaire, jack, adventurer, plane, transmitter, cartographer, scientist, compass, travellog, native`.
- Starting cards (`explorer`, `traveler`, `sailor`) have no `cost` (cannot be bought; `replayCheck` rejects them as `gift`).

`MARKET0` (6 ids) and `RESERVE0` (12 ids) (engine_data.js:27-28): initial stacks, each `n:3`.
`SYMNAME`, `SYMCOL` (display). `COLORS` (engine_data.js:31): `[{id:'crimson',hex:'#e5484d',name},{id:'ivory',hex:'#efe9dc'},{id:'violet',hex:'#9d7df7'},{id:'orange',hex:'#ff9636'}]`.
`BLOCKADES` (engine_data.js:34): `[{n:1,k:'j',v:1},{n:2,k:'v',v:1},{n:3,k:'r',v:1},{n:4,k:'w',v:1},{n:5,k:'j',v:2},{n:6,k:'r',v:2}]` (`n` number, `k` kind: symbol or `'r'` rubble = discard, `v` cost).
`BOARDS` (engine_data.js:43-58): letter → 7 row strings (4,5,6,7,6,5,4 tokens). Token grammar (`parseTok`, :59-63):
`mm` → `{type:'m',val:0}`; `s<d>` → `{type:'s',val:0,num:d}`; `g<sym>` → `{type:'g',sym,val:1}` (unused in BOARDS); otherwise `<type><val>` with type ∈ `j w v r c`.
`TPL` (:71): letter → `[{q,r,d:parsedTok}]` (local axial coordinates, centre 0,0).

Geometry (:76-80): `R=34` px hex radius, pointy-top axial coords; `DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]`;
`key(q,r)` → `"q,r"`; `rot(q,r,k)` rotates by k×60°; `pxOf(q,r)` → `[x,y]`.

Randomness helpers: `mulberry32(a)` (:81) → deterministic PRNG `()=>[0,1)` (32-bit seed); `shuffle(a, rnd=RNG)` (:85) in-place
Fisher–Yates from the end, returns `a` — EXACT algorithm matters for replay compatibility; `hash(x,y)` (:86) (UI decoration).

`COURSES` (:96-109): `[{id, name, src, diff, p:[[letter,q,r,rot],…], e:[q,r], s:'j'|'w'}]`, ids in order:
`first`, `hills`, `winding`, `witch`. `courseById(id)` (:110) → course or null.

### 1.3 `buildCourse(C, seed)` → MAP (engine_data.js:111-160)

Pure (depends only on args; uses `mulberry32(seed ^ 0x2c1b3c6d)` for the blockade deal, never `RNG`). Throws `Error` with
messages: `'Unknown board '+name`, `'A route starts with board A or B, and only there.'`, `'Boards X and Y overlap.'`,
`'El Dorado must sit against the last board.'`, `'No room for El Dorado there.'`, `'Boards X and Y are not properly connected.'`,
`'There is no path from the start to El Dorado.'`, `'Too many connections for 6 blockades.'`.

Returned object:

| Field | Type | Meaning |
|---|---|---|
| `hexes` | `Map<"q,r", Hex>` | every space. Hex = `{type, val, sym?, num?, q, r, k:"q,r", tile:int, x, y}`; `type` ∈ `j w v r c m s g`; `g` (goal) spaces have `sym:C.s, val:1, tile:nT` (nT = number of boards) |
| `tiles` | array | per board `{c:[q,r], name:letter, k:rot, x, y}` (centroid), plus final `{c:[eq,er], name:'El Dorado', k:0, end:true, x, y}` |
| `conns` | `[{a:i, b:i+1, edges:[[k1,k2],…]}]` | one per consecutive board pair; `edges` lists hex-key pairs (tile i → tile i+1) |
| `edgeConn` | `Map<"k1|k2", connIdx>` | both directions |
| `starts` | `string[4]` | start hex keys ordered by printed number 1..4 |
| `goals` | `string[3]` | El Dorado hex keys |
| `blockDefs` | `[{n,k,v,conn}]` | the deal: blockade `deal[i]` on connection `i` (shuffled copy of BLOCKADES, first `conns.length`) |
| `city` | `{x,y,dx,dy}` | drawing anchor |
| `endSym` | `'j'|'w'` | = C.s |
| `minX,minY,w,h` | numbers | bounding box (px) |
| `route` | letters | |
| `name` | string | C.name |
| `course` | string | C.id (used by bot to check network fit) |

`mapFor(st)` (engine_rules.js:16) = `buildCourse(st.course, st.seed)`: uncached, new object each call.
NOTE: worker.js defines its own cached `mapFor` (worker.js:291) shadowing the name in that module.

### 1.4 The state object `S`

Created by `newGame(o)` (engine_rules.js:79-99). JSON-serialisable (no Maps, no functions) — required: server stores it in DO storage,
client in localStorage, undo is `JSON.stringify`/`JSON.parse`.

| Field | Type | Set by / invariant | Hidden by `redact`? |
|---|---|---|---|
| `v` | `5` | constant; version of the shape (client accepts saves with v 4 or 5, ui_state.js:22) | no |
| `seed` | integer | `o.seed`; only feeds the blockade deal in `buildCourse` | no |
| `course` | COURSES entry (full object `{id,name,src,diff,p,e,s}`, or a `botRandomCourse` object `{id:'rnd<seed>',name,p,e,s}`) | `o.course||COURSES[0]` (object, not id) | no |
| `players` | array (2–4) of Player | see below | partially |
| `cards` | `{[cardId:string]: typeId}` | every card ever created; ids `'c1','c2',…` | yes: filtered to visible ids |
| `nid` | integer | next card number; invariant: total cards (all piles + trash) = `nid-1` (engine.test.mjs:61) | no |
| `market` | `[{t:typeId, n:int}]` length 6 | slot with `n:0` stays (empty slot) until refilled by a reserve purchase | no |
| `reserve` | `[{t,n}]` initially 12 | a stack is REMOVED (`splice`) when bought into the market | no |
| `blockades` | `[{n,k,v,conn,owner:null|seat}]` | copy of `MAP.blockDefs` + owner | no |
| `cur` | seat index | player to move | no |
| `start` | 0 | first player; a round ends when turn order wraps to `start` | no |
| `round` | int ≥1 | incremented in `advance` | no |
| `endTriggered` | bool | | no |
| `over` | bool | game finished; `applyAction` refuses everything | no |
| `winners` | `null` → `int[]` | seats with place 1 (set by `endGame`) | no |
| `places` | `null` → `int[]` | 1-based place per seat, ties share a place (dense-by-index: "1,1,3") | no |
| `fullRace` | bool | `o.fullRace!==false` | no |
| `turn` | `{bought:bool, active:null|{id:cardId, pi:int, sym:'j'|'w'|'v', left:number}, pending:null|{max:1|2}}` | reset to `{bought:false,active:null,pending:null}` on every turn change | no (`active.id` becomes a visible card) |
| `trash` | cardId[] | removed-from-game cards (public) | no (ids visible) |
| `log` | `[{p:seat|null, t:string, r?:round}]` | engine keeps ≤200 (engine_rules.js:102); server trims to 120 (worker.js:424) and pushes `{p,t}` lines without `r` (worker.js:457-458) | no |
| `privacy` | bool | `!!o.privacy`; only used by the local UI (hide hands in pass-and-play) | no |
| `resigns` | int | counter; `players[i].resigned` = order of resignation | no |
| `nact` | int (optional) | present only for recorded games (`recNewGame` sets 0); number of actions recorded so far = index of the next action in `rec.actions` | no |
| `owners` | `string[]` (online only) | uid per seat, set by the Room (worker.js:419); presence of `owners` = "online game" in the client (ui_state.js:13) | no |
| `room` | string (online only) | room code (worker.js:419) | no |
| `_endView` | seat (bot clones only) | set by `botEndView` on clones; never on a real S | — |
| `rules` | NOT SET anywhere | read by `botNetFeatures` (`S.rules&&S.rules.campOnce`, engine_bot.js:276) | — |

NOTE: `S.rules` is dead input (always undefined) — flag input 0 of multi-course networks is always 0.
NOTE: `S.log` entries added by `log()` carry `r` (round); lines pushed by the server have no `r`; the 200/120 caps differ.

Player object (engine_rules.js:86):

| Field | Type | Notes | redact (other seats) |
|---|---|---|---|
| `name` | string | | kept |
| `color` | string (hex like `#e5484d`) | | kept |
| `ai` | AI id (optional) | only if `o.players[i].ai` names a known AI (`aiById`) | kept |
| `pieces` | `(hexKey|'done')[]` | 1 explorer (3–4 players) or 2 (2 players: seat0 = starts[0],starts[2]; seat1 = starts[1],starts[3]) | kept |
| `deck` | cardId[] | draw pile; top = LAST element (`pop`) | ids replaced by `'d<seat>_<k>'`; own deck sorted by type |
| `hand` | cardId[] | | ids replaced by `'h<seat>_<k>'` |
| `discard` | cardId[] | public | kept |
| `play` | cardId[] | cards played this turn (public) | kept |
| `blocks` | blockade indices (into `S.blockades`) | | kept |
| `fin` | int | round of arrival, 0 = not arrived | kept |
| `resigned` | int | 0, or resignation order (1,2,…) | kept |

Invariants: a card id is in exactly one of {some player's deck/hand/discard/play, `S.trash`}; `turn.active.id` is a card
already in `play` or `trash` (the card whose leftover strength is being used); `turn.pending` non-null ⇒ only `trash` is legal.

### 1.5 Actions — `applyAction(seat, a)` (engine_rules.js:169-280)

Signature: `applyAction(seat:int, a:object) → {ok:true, ev:Event[], reveal:bool} | {ok:false, err:string, ev:[]}`.
Mutates `S` (and only `S`) in place; never throws for bad input (bad ids simply fail). Uses `RNG` only when it draws cards
(`action`, `end`) and the draw pile is empty (discard reshuffled with `shuffle(p.discard)` → `RNG`).
Deterministic given S and RNG.

Pre-checks, in order: `!S||S.over` → `'The game is over.'`; `seat!==S.cur` → `'It is not your turn.'`; `a` not an object → `'Bad action.'`;
`S.turn.pending && a.t!=='trash'` → `'Choose which cards to remove first.'`.
`reveal:true` means new hidden information was revealed (cards drawn): the caller must drop undo history.

| `t` | Fields | Legal when (high level) | Errors | Effect / events (order) | reveal |
|---|---|---|---|---|---|
| `move` | `card:cardId, pi:int, to:hexKey|"B<blockadeIdx>"` | `card` in hand and not purple, OR `card===S.turn.active.id` (continue leftover strength; then `pi` is IGNORED and `active.pi` used, symbol fixed to `active.sym`, budget `active.left`); `to` ∈ `reach(seat,pi,syms,budget)` | `'That card is not in your hand.'`, `'That card cannot move.'`, `'Choose one of your explorers.'`, `'That space is out of reach.'` | new card: leaves hand → `play` (or `trash` if `once`); walks path taking any blockade crossed; `to="B<i>"` pays blockade i without moving past it; piece becomes `'done'` on a goal; sets `turn.active` if strength left and not done, else null. ev: `play{k:'move',ts:[type],more:bool,n:pathLength,sym}`, `block{…}`×, `move{pl,pi,path}` (only if path non-empty), `arrive`, `over` | false |
| `native` | `card, pi, to` | card is a `native` in hand; `to` ∈ `nativeTargets(seat,pi)` | `'You need the Native.'`, `'Choose one of your explorers.'`, `'The Native can only reach an adjacent free space.'` | card → play; takes blockade on that edge (if any); moves 1 space (or, for `"B<i>"`, only removes the blockade). ev: `play{k:'native',ts:['native'],n:1|0}`, `block`, `move{path:[from,to]}`, `arrive`, `over` | false |
| `pay` | `pi, to, cards:cardId[]` | `to` ∈ `payTargets(seat,pi)`; `cards` distinct, in hand, exactly `need` many | `'Choose one of your explorers.'`, `'You cannot enter there.'`, `'Choose exactly N card(s).'` | rubble / grey blockade: cards → play; base camp: cards → trash. ev: `play{k:'rubble'|'camp'|'blr',ts:types}`, then `block` (blr) or `move{path:[from,to]}` | false |
| `action` | `card` | card in hand of type `cartographer`(draw 2) / `compass`(3) / `scientist`(1) / `travellog`(2) | `'That card has no draw effect.'` | card → play (or trash if once: compass, travellog); draws; `scientist` sets `pending={max:1}`, `travellog` `{max:2}`. ev: `play{k:'action',ts:[type],n:drawn}`, `draw{pl,n}` | TRUE |
| `trash` | `cards:cardId[]` (0..max) | `S.turn.pending` set | `'Nothing to remove.'`, `'Choose up to N card(s).'` | cards → trash; clears pending. ev: `play{k:'trash',ts:types}` (emitted even for `[]`) | false |
| `transmit` | `card, src:'m'|'r', idx:int` | card is a `transmitter` in hand; stack `S.market[idx]` / `S.reserve[idx]` has `n>0` (reserve allowed even while locked; does NOT count as the turn's purchase) | `'You need the Transmitter.'`, `'That card is sold out.'` | transmitter → trash; new card of stack type → DISCARD; `stack.n--` (reserve stack stays in reserve even at 0). ev: `play{k:'transmit',ts:['transmitter'],got:type}`, `gain{pl,t,src,idx}` | false |
| `buy` | `src:'m'|'r', idx, cards:cardId[]` | `!turn.bought`; stack exists with `n>0`; `src==='r'` only if some market slot has `n===0`; cards distinct in hand; Σ`coinVal` ≥ cost (overpaying allowed) | `'You can buy only one card per turn.'`, `'That card is sold out.'`, `'The reserve opens once a market slot is empty.'`, `'Pay with cards from your hand.'`, `'Not enough coins.'` | payment: `once` yellow/joker cards → trash, others → play; from reserve: the stack REPLACES the first empty market slot and is spliced out of `S.reserve` (so reserve indices shift!); new card → discard; `bought=true`. ev: `play{k:'buy',ts,got,paid}`, `gain{pl,t,src,idx}` (`idx` = index BEFORE the move, i.e. the reserve index for `src:'r'`) | false |
| `end` | `keep:cardId[]` (non-array → `[]`) | keep ⊆ hand, distinct (no size limit) | `'Bad cards to keep.'` | hand−keep → discard; play → discard; draw up to 4; turn reset; `advance()` (may end game). ev: `play{k:'end',kept,disc}`, `turn{pl:S.cur}`, `over` | TRUE |
| other | | | `'Unknown action.'` | | |

`coinVal(id)` (engine_rules.js:106): yellow/joker → `p`; else `.5`.
NOTE: `end` is legal while `turn.active` is set (leftover strength is simply lost). `end` is NOT legal while `pending` (must `trash` first; `forceEnd` does that).
NOTE: a `move` whose card id equals `turn.active.id` always uses the active piece, even if `a.pi` differs; a `move` with a different card clears `active`.
NOTE: validation of `a.pi`/`a.idx`/`a.src` types is by lookup (e.g. `S.market["0"]` would work since JS coerces) — Rust must decide whether to accept string indices. `pieceOk` requires `Number.isInteger(pi)`.
NOTE: `play` ev for `move` is pushed BEFORE the card leaves the hand; tests assert all `ts` types are then public (engine.test.mjs:76-79).

Target helpers (read-only on S):
- `reach(pl, pi, syms:string[], budget:number) → Map<target, {kind:'move'|'bl', cost, sym, path:hexKey[], pi, bl?}>` (engine_rules.js:110-138). Target key is a hex key (kind `'move'`, path excludes start, ends at target) or `"B<idx>"` (kind `'bl'`, `bl` = blockade index, path = route to the space before the blockade). Per target the cheapest over all syms is kept; ties keep the first sym in `syms` order. Dijkstra with linear-scan priority queue; ties/iteration order of Map insertion matter for which path is chosen (path affects `move` events and which blockades are taken).
- `nativeTargets(pl, pi) → Map<target, {kind:'native'|'nativebl', path, cost:0, pi, bl}>` (:139-144).
- `payTargets(pl, pi) → Map<target, {kind:'rubble'|'camp'|'blr', need, path?, pi, bl?}>` (:146-154). Requires `hand.length ≥ need`.

### 1.6 Events

`ev` arrays are returned by `applyAction`/`resign`/`forceEnd` and forwarded verbatim to EVERY seat online (worker.js:314 `ev: ev||[]`).
They must therefore only carry public information.

| `e` | Fields | Emitted by | Public? |
|---|---|---|---|
| `play` | `pl, k, ts?:typeId[], more?, n?, sym?, got?, paid?, kept?, disc?` | every successful action (first event) | yes: `ts` names only cards now in play/trash; `k:'end'` carries only counts `kept`,`disc` (no `ts`) |
| `move` | `pl, pi, path:[from,…,to]` | move / native / pay (rubble, camp) | yes |
| `block` | `pl, n` (blockade NUMBER 1–6, not index) | when a blockade is taken | yes |
| `arrive` | `pl, pi` | piece reached El Dorado | yes |
| `draw` | `pl, n` | `action` | yes (count only) |
| `gain` | `pl, t, src, idx` | buy, transmit | yes |
| `turn` | `pl` (new `S.cur`) | end, resign of current player | yes |
| `over` | — | when `S.over` became/is true at the end of the action | yes |
| `resign` | `pl` | `resign()` | yes |
| `timeout` | `pl` | server alarm (worker.js:455) | yes |
| `undo` | — | server undo (worker.js:396) | yes |
| `start` | — | server game start (worker.js:421) | yes |

`play.k` values: `move, native, rubble, camp, blr, action, trash, transmit, buy, end`.
NOTE: no `draw` event is emitted for the end-of-turn draw (it is silent; clients see the new hand in the state). `over` is emitted at most once per call (`resign` returns early at engine_rules.js:307 or pushes it at :311).
NOTE: `forceEnd` returns only the `end` action's result; the events of the implicit `trash` step are discarded (engine_rules.js:70).
NOTE: `aiMove` on the server concatenates the events of several actions into one `ev` array (worker.js:445).

### 1.7 Other rule functions

| Function | Signature / returns | Side effects | Notes |
|---|---|---|---|
| `newGame(o)` | `o={course?:CourseObj, seed:int, players:[{name,color,ai?}], fullRace?:bool, privacy?:bool}` → the new `S` | REPLACES `S` and `MAP`; consumes `RNG` (one shuffle per player deck, in seat order; then draws 4 each; no reshuffle happens at start) | `course` defaults to `COURSES[0]`; no validation of player count/names; writes first log line |
| `resign(seat)` | → `{ok:true, ev}` or `{ok:false, ev:[]}` (no `err`) | marks resigned; may `endGame()`; if `seat===S.cur`, resets `S.turn` and `advance()`s | fails if over, already resigned, or already arrived. Legal out of turn. NOTE: the resigning current player's `play` cards and hand stay where they are (not discarded) |
| `forceEnd(seat)` | → result of `applyAction(seat,{t:'end',keep:[]})` | resolves pending trash with `[]`, clears `active`, ends turn (discard all) | no check that `seat===S.cur` beyond applyAction's |
| `endGame()` | — | sets `over`, `places`, `winners`, logs | exported; tools call it to cut games (`botDeepPlayout`, tools) |
| `playerDone(p)` | bool | — | all pieces `'done'` |
| `isActive(p)` (not exported) | `!done && !resigned` | | UI uses it |
| `advance()` (not exported) | | next racing seat; increments round at wrap; ends game at wrap if `endTriggered` | |
| `checkEnd()` (not exported) | | sets `endTriggered` | |
| `progress(p)` (not exported) | BFS steps sum | | used for placing unfinished players |
| `mapFor(st)` | MAP | none | |

Placement (`endGame`, engine_rules.js:322-333): sort key `[group, a, b, c]` — arrived `[0, fin, -blocks, -maxBlockNum]`, racing `[1, progress, -blocks, -maxBlockNum]`, resigned `[2, -resigned, 0, 0]`; equal keys share a place.

### 1.8 Game records and replay logs

Log object (engine_rules.js:17-19, 55-56, 72-78):
```
{ kind:'eldorado-replay', v:1|2, title?:string, course:courseId, seed:int, rng:uint32, fullRace:bool,
  players:[{name, color?, bot?}], actions:[[seat:int, action], …], notes?:[…], gift?:typeId, result?:{places, rounds} }
```
- v2 = game records (produced by `recNewGame`/`recFinal`): `players[i]={name,color}` plus `bot:<aiId>` for AI seats. `result` added by `recFinal`.
- v1 = training/bot logs (tools/ai/record.mjs): `players:[{name,bot}]`, may have `notes`, `gift`.
- `actions` in v2 may contain the pseudo-actions `{t:'resign'}` (by any seat, any time) and `{t:'timeout'}` (current seat).

`replayCheck(log) → null | errorString` (engine_rules.js:21-28). Errors: `'Not an El Dorado game log.'` (kind/v), `'Unknown course: X'`,
`'A game log needs 2 to 4 players.'`, `'The game log is missing its seeds.'` (seed or rng not finite), `'Unknown gift card: X'`,
`'The game log has no valid list of actions.'` (not an array, > `REPLAY_MAX_ACTIONS`=20000, or an entry not `[integer, {t:string,…}]`).
It does NOT replay the actions (a log may fail later at `replayStep`).

RNG discipline:
- v1: `replayStart` does `setRng(mulberry32(log.rng>>>0))` and LEAVES it installed: the whole game (newGame shuffles, gift insertion, all
  later reshuffles) draws from that single stream. Caller must `setRng(null)` when done.
- v2: `recRng(rng,k) = mulberry32(((rng>>>0) + Math.imul(k+2, 0x9E3779B1))>>>0)` (engine_rules.js:50). `newGame` uses stream `k=-1`;
  action number `i` (0-based index into `actions`, = `S.nact` at the time) uses its own fresh stream `k=i`. Between actions `RNG` is `Math.random`.

| Function | Signature | Behaviour |
|---|---|---|
| `recNewGame(o)` | same `o` as `newGame` → `rec` (v2 log, `actions:[]`, no title) | draws `rng` from `Math.random()` (NOT from `RNG`); runs `newGame` under `recRng(rng,-1)`; restores `RNG`; sets `S.nact=0` |
| `recAct(rec, seat, a)` | → applyAction result | runs under `recRng(rec.rng, S.nact)`; if ok: `rec.actions.length=min(len,S.nact)` (drops undone actions), push `[seat,a]`, `S.nact++` |
| `recResign(rec, seat)` | → resign result | same, records `{t:'resign'}` |
| `recTimeout(rec, seat)` | → forceEnd result | same, records `{t:'timeout'}` |
| `recFinal(rec)` | → finished log or null | null if `!rec` or `S.nact` missing; copy with `actions` cut to `S.nact`, default `title` = `"<names joined ', '> · <course name>"`, `result:{places:S.places||null, rounds:S.round}` |
| `replayStart(log)` | → the generator installed | builds a new game from the log: names `String(p.name||'Player i').slice(0,24)`; colours: v2 uses `p.color` if `/^#[0-9a-f]{6}$/i`, else `COLORS[i%4].hex`; `fullRace = log.fullRace!==false`; NO `ai` fields are set on players; inserts `gift` card into each player's deck at `floor(RNG()*(deck.length+1))`; v2: `setRng(null)` at the end |
| `replayStep(log, i)` | → action result | v2: installs `recRng(log.rng,i)` for the step and restores afterwards. `{t:'resign'}` (v2) → `resign(seat)` (no turn check). Otherwise `S.over||seat!==S.cur` → `{ok:false, err:'not <name>’s turn'}` (no `ev`); v2 `{t:'timeout'}` → `forceEnd(seat)`; else `applyAction` |

Undo semantics with records: an undo restores an older `S` (JSON snapshot) whose `nact` is smaller; `rec` is NOT modified by the undo.
The next successful `recAct/recResign/recTimeout` truncates `rec.actions` to that `nact` before appending; `recFinal` also cuts to `S.nact`.
Since the per-action RNG stream depends only on the index, a redone action index reproduces the same shuffles.
Security: `rec.rng` reveals all future shuffles; the server never sends `rec` (it is stored under DO key `rec`); the client keeps it in
localStorage (`eldorado-rec`) for local games only.
NOTE: `S.nact` is NOT present on replayed states (replay uses `newGame`, not `recNewGame`); engine.test compares states with `nact:0` forced.
NOTE: the server's undo snapshots are `JSON.stringify(this.S)` which includes `nact`, so undo works with the record as described.
NOTE: `replayStep` for v1 logs does not understand `resign`/`timeout` (they would fail with 'Unknown action.').
NOTE: `replayStart` never sets `players[].ai` even if `log.players[i].bot` is present; the UI replay viewer reads `bot` from the log itself.

### 1.9 `redact(state, seat) → state'` (engine_rules.js:345-356)

Pure (deep copy via JSON). `seat` may be `-1` (spectator) → every player is "other".
- For `i===seat`: `deck` re-ordered by card TYPE (string compare of type ids; `Array.prototype.sort` is stable, so equal types keep their
  relative deck order); hand and deck ids stay visible.
- For others: `hand[k]` → `'h<i>_<k>'`, `deck[k]` → `'d<i>_<k>'` (so only counts are learned).
- `cards` is reduced to ids that are visible: own hand + own deck, every player's `play` and `discard`, `trash`, `turn.active.id`.
- Everything else is copied unchanged (including `seed`, `log`, `owners`, `room`, `nact`, `course`).
NOTE: within one type the own-deck ids keep their draw order (stable sort). Cards of one type are interchangeable, so no rule-relevant
information leaks, but the exact next card id is inferable. A Rust port should sort by (type, id) or otherwise canonicalise.
NOTE: the client code must tolerate card ids absent from `S.cards` (placeholder ids for hidden cards).

### 1.10 `eloDeltas(ratings:number[], places:int[], games:int[]) → number[]` (engine_rules.js:335-343)

For each i: `K=(games[i]<10?48:32)/(n-1)`; Δi = Σ_{j≠i} K·(S_ij − 1/(1+10^((r_j−r_i)/400))), S = 1/0.5/0 by place (lower is better).
Rounded to 0.1 (`Math.round(x*10)/10`). n<2 → all zeros. Zero-sum only when all K equal (NOTE: players with <10 games use K=48 → not exactly zero-sum; the test uses equal `games`).

### 1.11 Named-AI API (engine_ai.js)

| Name | Signature | Behaviour |
|---|---|---|
| `AIS` | array | `[{id:'humboldt',name:'Humboldt',tier:'Master',rating:1530,desc,opts:{mode:'net',search:{kind:'plan',beam:3}}}, {id:'orellana',…,tier:'Strong',rating:1483,opts:{mode:'net'}}, {id:'raleigh',…,tier:'Steady',rating:1200,opts:{mode:'plan'}}]` |
| `aiById(id)` | → AI or null | |
| `aiUsesNet(id)` | bool | `opts.mode==='net'` (client: decide whether to fetch the network) |
| `AI_COURSES` (not exported) | `['first']` | |
| `aiCourseOK(courseId)` | bool | course in AI_COURSES |
| `aiAllowed(courseId, n)` | bool | `aiCourseOK && n>=3` |
| `aiNetDecode(bin: ArrayBuffer|Uint8Array)` | → network object `{course,nf,unsettled,name,leak, w1T,b1,w2,b2,w3,b3: Float32Array}` | §1.12 |
| `aiSetNet(n)` | | `BOT_NET=n` (null allowed) |
| `aiNetFits()` | bool | `botNetReady()` |
| `aiChoose(id, mem)` | → action | one decision for seat `S.cur`. Unknown id → last AI (raleigh). If opts.mode is 'net' and (`!botNetReady()` or 2 players) → `{mode:'plan'}`. `mem` (per game per seat object): `mem.tk="<seat>:<round>"`, `mem.n` (decisions this turn; >60 → forced `trash []` or `end []`), `mem.plan` (BOT_PLAN_CACHE). Runs with `RNG=Math.random` (setRng(null)) and restores RNG. Applies `aiFinishGuard`. NON-deterministic (Math.random in bot look-ahead) |
| `aiFinishGuard(a)` (not exported) | → action | trash: keeps ≥1 card able to enter El Dorado (`c!=='p'` and `s===MAP.endSym||'*'`), and never below 4 total cards; end: if no such card owned and no purchase yet → returns the cheapest-by-card-count legal `buy` of such a card instead |
| `aiStep(id, mem, rec)` | → result | `a=aiChoose(...)`; `r=recAct(rec,S.cur,a)`; if `!r.ok` → `recTimeout(rec,S.cur)`. `rec` may be null (not recorded) |

NOTE: the server (worker.js:441-445) and the local UI both call `aiStep`; the server keeps `mem` per room per seat in memory only (`this.aiMem`), lost when the DO is evicted (the plan is then just recomputed).

### 1.12 Network file format (tools/ai/pack.mjs, decoded by `aiNetDecode` engine_ai.js:23-31)

Binary, little-endian:
1. `uint32` header length H.
2. H bytes UTF-8 JSON: `{name, course, nf, unsettled:bool, leak:number, parts:[[key,length],…]}` with keys in order `w1T, b1, w2, b2, w3, b3`.
3. Zero padding to an even offset (`off = 4+H + ((4+H)&1)`).
4. For each part in order: `length` IEEE-754 binary16 values (round-to-nearest-even from float32).

Decoded network object: `{course, nf, unsettled, name, leak (default .01), w1T, b1, w2, b2, w3, b3}` (Float32Arrays). JSON model files
(tools/ai/models/*.json) have the same keys as plain arrays (plus possibly `courses`, `onehot`, `extra`, `h1`… see §1.13/§4).
Shapes: `w1T` nf×H1 input-major; `b1` H1; `w2` H2×H1 (row j = hidden-2 unit j); `b2` H2; `w3` H2; `b3` [1].
Evaluation (`botNetValue`, engine_bot.js:291-295): h1 = b1 + Σ_k f[k]·w1T[k*H1+j] over NON-ZERO f[k]; leaky ReLU (slope `leak`);
a_j = b2[j] + Σ w2[j*H1+k]·h1[k]; s = b3[0] + Σ w3[j]·lrelu(a_j); output sigmoid(s). `botNetPrep` converts weights to Float64Array (b1 and h1 stay Float32 — NOTE: the h1 accumulator is Float32Array, so the first layer is accumulated with float32 rounding at every add; a bit-exact port must replicate this).
NOTE: `aiNetDecode`/`pack.mjs` do not carry `courses`, `onehot` or `extra`, so only single-course networks can be shipped.

### 1.13 Bot / training API (engine_bot.js)

All functions work on the global `S`/`MAP` for the player to move unless given `me`.

| Function | Signature → result | Notes |
|---|---|---|
| `botActions()` | → action[] for `S.cur` | every legal atomic action, DEDUPLICATED by card type (one card id per type in hand; pay/trash/keep subsets distinct by type multiset). If `pending`: only `trash` subsets of size 0..max. Moves include continuation of `turn.active`. Buys: minimal payments only (no card removable), ≤8 per cost (the cap is checked per k-loop). Ends: keep subsets of size 0..3. Order is deterministic (depends on hand order). NOTE: not guaranteed exhaustive (keep >3 cards, non-minimal payments are omitted) |
| `botFeatures(me, into?)` | → Float32Array(BOT_NF) | BOT_NF = `16*9+14+21*4+12+3*(21*2+8)+21*2+2+6*9+4` = 506 (computed; verify with `E.BOT_NF`). Reads `S._endView` |
| `botNetNF()` | int | input size for the current BOT_NET and MAP |
| `botNetFeatures(me, scratch?)` | Float32Array(botNetNF()) | scratch=true reuses a global buffer (value only valid until the next call) |
| `botNetValue(f)` | number in (0,1) | increments BOT_EVALS; requires BOT_NET |
| `botValue(me, mode)` | number | `mode` ∈ `'net'`, `'heur2'`, anything else = heuristic. Game over: net → `botPlaceValue(place,n)`, else `1e3-place*100`. Arrived: settled-place value (or net if `unsettled` network and place not settled). NOTE: mixed scales when mode='net' but net not ready (heuristic values ≈ −60…+100 vs probabilities) |
| `botPlaceValue(pl, n)` | 1 for 1st, 0 for last, else `1/4/2^(pl-2)` | training target |
| `botPlaceSettled(me)` | bool | no racing player after me before the round wraps |
| `botCost(k)` | number | route cost to El Dorado from hex (60 if unreachable, 0 for 'done') |
| `botRemaining(pl)` | number | mean botCost over pieces |
| `botClone(st)` | new state | structural copy of everything applyAction mutates; `log:[]` (NOT copied) |
| `botEndFeatures(me, keep)` | Float32Array | features of the "end turn, before draw" view (clone + botEndView) |
| `botActionValue(me, a, mode, rnd, K)` | number | clone, reshuffle own deck with `rnd`, apply, score; draw cards averaged over K (default 4). Illegal → −Infinity |
| `botChoose(opts)` | → `{a, v?, best?, bestA?, why?, alts?, deep?, nodes?}` | see below |
| `botScoreActions(me, rnd, K)` | → `[{a, v, st}]` sorted by v desc | always uses `'net'` value; `st` = post-action state if my turn continues (not after draws) |
| `botTurn(opts)` | → action[] | plays up to 40 actions for `S.cur` via botChoose+applyAction until the turn passes; on an illegal choice ends the turn |
| `botRandomCourse(seed, nMid)` | → course object `{id:'rnd<seed>', name:'Random <seed>', p, e, s}` or null | deterministic from seed |
| `BOT_NF`, `BOT_FLAGS` (=4) | constants | |
| `setNet(n)`, `setPlan(k,o)`, `BOT_PLANS` | via `E` | |

`botChoose(opts)` options (engine_bot.js:349-378): `mode` (`'net'` default when BOT_NET set, else `'heur'`; `'heur2'`; any string starting
`'plan'` → planner with `BOT_PLANS[mode]` overrides, returns `{a}` only), `eps` (uniform random action), `typeEps` (random kind then random
action), `rnd` (generator for all exploration and reshuffles; default Math.random), `turnState` (`{noBuy, forceBuy, forceTransmit}` mutated),
`search` (`{kind:'plan', beam}` → whole-turn beam planner with `BOT_PLAN_CACHE`; `'deep'` `{beam,cands,budget,depth}`; `'rollout'`
`{cands,sims,margin}`; any other kind → `botTurnSearch` `{width,depth}`), `draws` (K), `noise`, `lotemp`, `temp`, `explain` (adds `alts` top 5).
If mode 'net' and net not ready → silently 'heur'. `why` ∈ `random, typed, forceBuy, forceTransmit, explore, softmax, plan, deep-agrees, deep-changed, turnSearch, clear, rollout`.
RNG: look-ahead `applyAction` calls reshuffle with the global `RNG` when a pile runs out; callers that record games must install
`Math.random` (as `aiChoose` does) or pass their own. `botDeepPlayout`/`botRolloutChoose` temporarily replace `RNG`.
NOTE: when `mode:'net'` is requested but the network is not ready, `mode` is downgraded to `'heur'` before the `search` branch (engine_bot.js:352,363), so `search` is silently ignored.

### 1.14 The export object `E` (build.mjs:33)

Exact list, in order:
`AIS, aiById, aiCourseOK, aiAllowed, aiUsesNet, aiNetDecode, aiSetNet, aiNetFits, aiChoose, aiStep,
get MAPX (=MAP), get BOT_EVALS, botScoreActions, botPlaceValue, botPlaceSettled, setRng, replayCheck, replayStart, replayStep,
recNewGame, recAct, recResign, recTimeout, recFinal, forceEnd, mulberry32, botCost, botRemaining, botEndFeatures, botClone,
botRandomCourse, botNetFeatures, botNetNF, botNetValue, botChoose, botActionValue, botTurn, botActions, botFeatures, botValue, endGame,
BOT_NF, BOT_FLAGS, setNet(n){BOT_NET=n}, setPlan(k,o){BOT_PLANS[k]=o}, get BOT_PLANS, buildCourse, mapFor, COURSES, courseById,
newGame, applyAction, resign, eloDeltas, redact, reach, payTargets, nativeTargets, playerDone, CT, get S / set S, get MAP / set MAP`.

NOTE: `E.MAPX` duplicates `E.MAP`'s getter. `E.setNet` and `E.aiSetNet` are equivalent. `COURSES`, `CT`, `AIS` are live mutable objects.
Not exported but used by the server: nothing else (worker.js only uses `E.*`). Not exported: `isActive`, `advance`, `shuffle`, `drawCards`, `newCard`, `recRng`, `BOT_TYPES`.

---

## 2. The server (`src/worker.js`, `wrangler.jsonc`)

### 2.1 Deployment bindings (wrangler.jsonc)
- `main: src/worker.js`, `compatibility_date: 2026-09-01`.
- `assets: {directory:'./public', binding:'ASSETS'}` — every path NOT starting with `/api/` is `env.ASSETS.fetch(req)` (worker.js:152).
- D1 `DB` (database `el-dorado`). Durable Objects `ROOMS` → class `Room`, `LOBBY` → class `Lobby`; migration tag `v1` `new_sqlite_classes:["Room","Lobby"]`.
- `vars`: `GOOGLE_CLIENT_ID` (public OAuth client id), `TRAIN_TOKEN_HASH` (hex SHA-256 of the training upload token). `DEV_AUTH` (`'1'` enables dev sign-in; set via `.dev.vars` locally).
- `import NET_BIN from './ai/first.bin'` (worker.js:11): ArrayBuffer (wrangler Data rule); decoded lazily once per isolate by `useNet()` (worker.js:58-59) and installed with `E.aiSetNet` before every AI move.

### 2.2 Common HTTP conventions
- JSON responses: `json(data,status)` → `content-type: application/json`, `cache-control: no-store` (worker.js:13).
- Errors: `{error: <message>}` with the given status (`bad()`, worker.js:14). Any exception in an `/api/` handler → `500 {error:'Server error: '+message}` (worker.js:250-252). A malformed JSON body in handlers that call `req.json()` without catch (`/api/auth/google`, `/api/auth/dev`, `PATCH /api/me`) therefore yields 500, not 400.
- Before routing, every `/api/` request awaits `ensureSchema(env)` (§2.6), memoised per isolate (retried after a failure).
- Auth token (worker.js:77-92): string `"<uid>.<expMs>.<sig>"`, `sig = base64url(HMAC-SHA256(secret, "<uid>.<expMs>"))` (no padding), `expMs = now + 60 days`.
  The secret is 32 random bytes hex, created once in D1 `settings(k='session_secret')` (worker.js:61-67). Sent as `Authorization: Bearer <token>` or query `?t=<token>`
  (WebSockets use `?t=`). `authUser` → D1 row `{id,name,rating,games,wins}` or null (expired, bad signature, unknown user). Constant-time compare.
- Google ID token verification (`verifyGoogleToken(cred, clientId, keysFn)`, exported, worker.js:101-113): RS256 JWT; checks `aud===clientId`,
  `iss ∈ {accounts.google.com, https://accounts.google.com}`, `exp`, key by `kid` from `https://www.googleapis.com/oauth2/v3/certs` (cached 1 h per isolate).
  Errors: `bad token`, `token not for this app`, `bad issuer`, `token expired`, `unknown key`, `bad signature`.
- Names: `cleanName(n)` keeps `\p{L}\p{N} _.'-`, trims, max 16 chars, default `'Explorer'`; `uniqueName` appends 2..50 (`base.slice(0,13)+(i+1)`), then random fallback; uniqueness is case-insensitive.

### 2.3 HTTP endpoints (routing order as in worker.js:150-249)

| # | Method + path | Auth | Request | Success response | Errors |
|---|---|---|---|---|---|
| 1 | `POST /api/train` | `Authorization: Bearer <tok>`, SHA-256(tok) hex must equal `TRAIN_TOKEN_HASH` | raw JSON text ≤ 300 000 chars; `run` field names the row | `{ok:true}`; upserts `train(run=String(st.run||'run').slice(0,40), updated=now, body=text)` | 403 `Not allowed`, 413 `Too large`, 400 `Not JSON` |
| 2 | `* /api/train` (any other method) | none | — | raw `{"updated":<ms>,"now":<ms>,"status":<stored body verbatim>}` of the most recently updated run, or `{updated:null,now,status:null}`; `no-store` | — |
| 3 | `* /api/config` | none | — | `{google: GOOGLE_CLIENT_ID|null, dev: DEV_AUTH==='1'}` | — |
| 4 | `POST /api/auth/google` | none | `{credential: <Google ID token>}` | `{token, user:{id,name,rating,games,wins}, isNew:bool}`; user keyed by `google_sub='g:'+sub`; new name from `given_name||name||'Explorer'` | 500 `Google sign-in is not set up yet (GOOGLE_CLIENT_ID).`, 401 `Google sign-in failed: <reason>` |
| 5 | `POST /api/auth/dev` | none, only if `DEV_AUTH==='1'` | `{name}` | same as 4; `google_sub='dev:'+cleanName(name).toLowerCase()` (same name → same user) | 404 `Not found` |
| 6 | `POST /api/replays` | none | raw text of a game log, ≤ 1 900 000 chars | `{id}` (8 chars from `abcdefghjkmnpqrstuvwxyz23456789`); row `game=0, listed=1, uids=NULL`; then deletes `game=0` rows beyond the newest 1000 | 413 `That game log is too large.`, 400 `That file is not valid JSON.`, 400 `<replayCheck message>` |
| 7 | `GET /api/replays` | none | — | `{replays:[{id,created,title,players,actions}]}` newest 50 with `listed=1` | — |
| 7b | `GET /api/replays?mine=1` | token required | — | newest 50 with `game=1 AND uids LIKE '%,<uid>,%'` (includes private rooms) | 401 `Sign in first.` |
| 8 | `GET /api/replays/<id>` (`[a-z0-9]{6,12}`) | none | — | the stored body verbatim, `content-type: application/json`, `cache-control: public, max-age=3600` | 404 `No replay with that id.` |
| 9 | `* /api/leaderboard` | none | — | `{players:[{id,name,rating,games,wins,bot}]}` where `games>0 OR bot IS NOT NULL`, rating desc, ≤100 | — |
| — | everything below requires a valid token | | | | 401 `Please sign in.` |
| 10 | `GET /api/me` | token | — | `{user, active: roomCode|null}` (`active` = Lobby `/find`: any room in the lobby's table whose `uids` includes the user, i.e. lobby or playing, public or private) | |
| 11 | `PATCH /api/me` | token | `{name}` | `{user:{...user, name:<unique cleaned name>}}` | |
| 12 | `POST /api/rooms` | token | `{max?, course?, turn?, pub?, rated?}` | `{code}` (5 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`). Options normalised: `max=min(4,max(2,+max||3))`; `course` = `'random'` or a valid course id, else `COURSES[0].id` (`'first'`); `turn` ∈ `[60,90,120,180,300]` (or any ≥5 when DEV_AUTH) else 90; `pub=pub!==false`; `rated=rated!==false`; `auto:false`. Body parse errors → `{}` | 500 `Could not create a room, try again.` (8 code collisions) |
| 13 | `POST /api/match` | token | — | `{code}` of a quick-match room (Lobby `/match`, §2.4) | 500 `Could not find or open a match, try again.` |
| 14 | `GET /api/rooms/<CODE>/ws?t=<token>` (`[A-Z0-9]{4,6}`) | token | WebSocket upgrade | 101; forwarded to Room DO `idFromName(CODE)` with headers `x-uid`, `x-name` | 426 `Expected a WebSocket`; Room: plain-text 404 `No such room` (not initialised or closed) |
| 15 | `GET /api/lobby/ws?t=<token>` | token | WebSocket upgrade | 101 (Lobby DO `main`) | 426 |
| 16 | anything else under `/api/` | token checked first | | | 404 `Not found` (401 if no token) |

NOTE: HANDOFF §4/§6.5 says turn choices 60/90/120/180; code also accepts 300 (worker.js:17).
NOTE: `POST /api/rooms` creates the room DO but does not tell the Lobby; the room appears in the lobby list only after the first WebSocket seats someone (`tellLobby`).
NOTE: `/api/config`, `/api/leaderboard`, `/api/train` (GET) answer any HTTP method.
NOTE: the room WebSocket route forwards to `idFromName(CODE)` for any syntactically valid code; a never-initialised DO answers 404.

### 2.4 Lobby Durable Object (one instance, `idFromName('main')`)

State: `this.rooms = {code → summary + {updated:ms}}`, persisted under storage key `rooms` (worker.js:258,268,280).
Summary (sent by `Room.summary()`, worker.js:307): `{code, host:<host's NAME>, names:[seat names], uids:[seat uids], max, status, course, turn, pub, rated, auto}`.

Internal endpoints (called by the Worker / Rooms only, host `https://lobby`):
| Path | Input | Behaviour |
|---|---|---|
| `/ws` | upgrade | accepts (hibernatable, untagged), immediately sends `{t:'rooms', rooms:list()}` |
| `/update` (POST) | summary JSON | `status` `closed`/`over` → delete entry; else store with `updated=now`; `prune()` (drop entries not updated for >2 h, or >12 h if `playing`); persist; broadcast |
| `/match` (POST) | `{uid, dev}` | 1) a room (lobby or playing, any kind) whose `uids` include uid → its code; 2) else the auto room in `lobby` with free seats updated < 15 min ago, most seated first; 3) else creates a room `opts={max:3 (MATCH_SIZE), course:'random', turn: dev?20:90, pub:true, rated:true, auto:true}` via `createRoom` and inserts a stub entry `{code, host:'', names:[], uids:[], max:3, status:'lobby', course:'random', turn, pub:true, auto:true, updated}`; persist; broadcast. → `{code}` or `{code:null}` |
| `/find?uid=` (GET) | | `{code|null}` of any entry whose `uids` include uid |

`list()` (worker.js:260): entries with `pub!==false` and status `lobby|playing` → `{code, host, names, count:names.length, max, status, course, turn, rated:rated!==false, ai:<number of uids starting 'ai-'>, auto:!!auto}` (uids are NOT exposed).
Lobby WebSocket protocol: server → client `{t:'rooms', rooms:[…]}` on connect and after every `/update` or `/match`. Client → server: only the text `ping` → reply `pong`; anything else ignored.
NOTE: `/match` does not seat the player; the client must then open the room WebSocket, which seats them if there is room. Two concurrent matchers can be sent to a room with one free seat; the second becomes a spectator of the lobby (not seated) — NOTE: they can then send `join` which returns `This room is full.`.
NOTE: prune only runs on `/update`; stale entries otherwise persist.

### 2.5 Room Durable Object (one per room code)

In-memory: `this.d` (meta), `this.S` (full, unredacted state), `this.undo` (JSON strings), `this.rec` (v2 game record), `this.aiMem` (not persisted).
Storage keys (`persist(parts)`, worker.js:302-305; loaded in the constructor under `blockConcurrencyWhile`):

| Key | Content | Written when |
|---|---|---|
| `d` | meta (below) | `parts` contains `d` |
| `S` | full engine state incl. `owners`, `room`, `nact` | `parts` contains `S` |
| `rec` | v2 record (`recNewGame` output, growing `actions`) — contains the secret `rng` | together with `S` whenever `this.rec` is set |
| `undo` | `string[]` ≤ 6, JSON snapshots of `S` | `parts` contains `u` |

Default `persist()` = `'dSu'`. Constructor: a stored `S` without `course` (pre-v4 "v3" game) → `S=null`, `undo=[]`, `d.status='closed'` (in memory; persisted on the next write).

`d` (worker.js:327 + later writes):
| Field | Type | Meaning |
|---|---|---|
| `code` | string | room code |
| `host` | uid | creator; reassigned to the first seat if the host is not seated when someone joins (worker.js:338), and in auto rooms when the host leaves |
| `seats` | `[{uid, name, color, now?:bool, ai?:aiId}]` | order = seat order in the game |
| `status` | `'lobby'|'playing'|'over'|'closed'` | |
| `opts` | `{max, course:'random'|courseId, turn:seconds, pub, rated, auto}` | from `/api/rooms` or `/match` |
| `created` | ms | |
| `deadline` | ms or null | person's turn deadline |
| `aiAt` | ms or null | next AI move time |
| `timeouts` | `{seat: consecutiveTimeouts}` | reset to 0 by any successful `act` of that seat |
| `rated` | bool | NOTE: misnamed — means "the result has been processed" (set true in `finish()` for rated and unrated rooms) |
| `results` | null or `{places, before, deltas, replay}` (rated) / `{places, unrated:true, replay}` / `{places, error, replay}` (D1 failure) | |
| `replay` | undefined (not tried) / null (failed or no record) / replay id | set by `saveReplay()` |

NOTE: HANDOFF §6.5 lists `opts{max,len,turn}`; `len` does not exist in code.

Colours: `PCOLORS=['#e5484d','#efe9dc','#9d7df7','#ff9636']` (= `COLORS[].hex`); a new seat gets the first unused one.

WebSocket accept (`/ws`, worker.js:330-344): socket tagged with `[uid]`, attachment `{uid, name}`. If status `lobby`, the uid is not seated and
`seats.length < opts.max` → seat it (auto-seat on connect), fix host, `seatsChanged()` (may start the game), persist `d`, tell the Lobby. Then `sendAll()`.
Spectators (not seated) are allowed; in a game their `seat` is `-1`.
Reconnect = simply open a new socket with the same token; the server sends the current state to everyone on connect.

Client → Room messages (text frames; JSON unless noted):

| Message | Phase | Who | Effect | Error replies (`{t:'error',msg}`) |
|---|---|---|---|---|
| `ping` (raw text) | any | any | reply raw `pong` | |
| `{t:'color', color}` | lobby | seated | set seat colour if in PCOLORS and not used by another seat; persist; sendAll | silently ignored otherwise |
| `{t:'leave'}` | lobby | any | auto room: remove seat (host → next seat; empty → `closed`), `seatsChanged()`, persist, tell Lobby, sendAll, close this socket `1000 'Left'`. Normal room: host → `status='closed'`, sendAll, close ALL sockets `1000 'Room closed'`; others → remove seat, sendAll, close `1000 'Left'` | |
| `{t:'join'}` | lobby | not seated | seat with free colour; `seatsChanged()`; persist; tell Lobby; sendAll | `This room is full.` |
| `{t:'addAI', ai}` | lobby | host, not auto | seat AI `{uid:'ai-<id>', name:<users row name or A.name>, color, ai:id}`; duplicate AI silently ignored | `Only the host can add AI players.`, `Unknown AI.`, `AI players only play First Expedition with 3 or 4 players for now.` (course not OK or `opts.max<3`), `This room is full.` |
| `{t:'removeAI', uid}` | lobby | host | remove the AI seat with that uid | `Only the host can remove AI players.` |
| `{t:'rated', v}` | lobby | host, not auto | `opts.rated=!!v` | silently ignored otherwise |
| `{t:'now'}` | lobby | seated, auto room | toggle `seat.now`; `seatsChanged()` | silently ignored otherwise |
| `{t:'start'}` | lobby | host, not auto | `startGame()` | `Only the host can start.`, `You need at least 2 players.`, `AI players need 3 or 4 players (and First Expedition) for now.` |
| `{t:'act', a}` | playing | seated | `recAct(rec, seat, a)`; on failure restore S and reply error; on success see flow below | `You are watching this game.`, `Bad action.`, any `applyAction` error string |
| `{t:'undo'}` | playing | seated current player | `S = JSON.parse(undo.pop())`; persist `S`,`u`; `sendAll([{e:'undo'}])`. Timer NOT reset, `rec` untouched | `Nothing to undo.` |
| `{t:'resign'}` | playing | seated | `recResign(rec, seat)`; failure ignored silently; `undo=[]`; `nextTurn()` if the current seat changed and not over; `afterChange(ev)` | |
| anything else / any message in `over`/`closed` | | | ignored | |

`act` success flow (worker.js:398-407): `timeouts[seat]=0`; if `r.reveal` or the turn passed → `undo=[]`, else push the pre-action snapshot (cap 6, oldest dropped);
if the turn passed and game not over → `nextTurn()`; `afterChange(ev)`: trim `S.log` to last 120, `finish()` if over, persist all, `sendAll(ev)`.

Room → client messages:
| Message | When |
|---|---|
| `{t:'room', room: roomInfo}` | to every socket on every `sendAll` while `status==='lobby'` or no `S` (also after `closed` in lobby) |
| `{t:'state', S: redact(S, seat), ev: Event[], seat: int(-1 = spectator), undo: bool, deadline: ms|null, now: serverMs, room: roomInfo}` | to every socket on every `sendAll` once a game exists (`playing`, `over`, or `closed` with S). `undo` = this socket's seat is current and there is a snapshot. `now` lets the client correct clock skew |
| `{t:'error', msg}` | reply to the sender only |
| raw `pong` | reply to `ping` |

`roomInfo()` (worker.js:310): `{code, host, status, opts, seats:[{uid, name, color, now:bool, ai:aiId|null, online:bool (AI seats always true)}], results}`.
`sendAll(ev)` sends to EVERY accepted socket (seated or not); each gets its own redaction (worker.js:316-321). There are no partial/delta messages — every update is the full redacted state.
Events sent: engine events (§1.6) plus `{e:'start'}` (game start), `{e:'undo'}`, `{e:'timeout',pl}`; connection/close/join updates send `ev:[]`.

Game start (`startGame`, worker.js:416-422): `rec = E.recNewGame({course: courseById(opts.course) || random COURSES entry (Math.random), seed: random int <1e9, players: seats→{name,color,ai}, fullRace:true})`;
`S.owners = seats uids`, `S.room = code`; map cached; `status='playing'`; `timeouts={}`; `undo=[]`; `nextTurn()`; persist; tell Lobby; `sendAll([{e:'start'}])`.
Auto rooms (`seatsChanged`, worker.js:411-415) start when `seats.length>=max` or (≥2 seats and every seat has `now`).
NOTE: `opts.course==='random'` picks uniformly among all COURSES; AI checks use `aiCourseOK('random')` → false, so AI seats are impossible in random-course rooms.
NOTE: `start` in a non-auto room does not re-check that seats ≤ max or that every seated person is connected.

Turn timer and AI turns:
- `nextTurn()` (called only when `S.cur` changed): AI to move → `scheduleAI(900)`; else `startTurnTimer()`: `deadline=now+turn*1000`, `aiAt=null`, `setAlarm(deadline)`.
- `scheduleAI(ms)`: `deadline=null`; `aiAt=now+(watched()?ms:0)`; `setAlarm(aiAt)`. `watched()` = some non-AI, non-resigned, not-arrived seat has an open socket.
- `alarm()` (worker.js:451-463): ignore unless `playing` and not over. AI to move: re-arm if more than 50 ms early, else `aiMove()`.
  Person: re-arm if more than 1000 ms early. Otherwise timeout: `ev=[{e:'timeout',pl:seat}]`; `timeouts[seat]++`; log line `{p:seat,t:'ran out of time.'}`;
  if `timeouts[seat]>=3` → `recResign` + log `'missed 3 turns in a row and forfeits.'`; else `recTimeout` (engine `forceEnd`); `undo=[]`; `nextTurn()` unless over; `afterChange(ev)`.
- `aiMove()` (worker.js:440-450): `useNet()`; `aiMem` per seat; loop `E.aiStep(ai, mem, rec)` — one action if watched, else repeat while an AI is to move and <300 ms elapsed; events concatenated;
  `undo=[]`; next: AI → `scheduleAI(700)`, person → `startTurnTimer()`; `afterChange(ev)`.
NOTE: an AI's turn change does NOT go through `nextTurn()`'s 900 ms but through `scheduleAI(700)`; when an AI's action passes the turn to a person, the person's timer starts directly.
NOTE: a person's `undo` does not restore `deadline`; the timer keeps running.
NOTE: timeouts count is per seat and never reset by undo or resign; three consecutive timeouts (without an intervening successful action by that seat) forfeit.

Game end (`finish()`, worker.js:479-502): `status='over'`, `deadline=null`, delete alarm, `saveReplay()` (INSERT into `replays` with `game=1`, `uids=','+owners.join(',')+','`, `listed = opts.pub===false?0:1`, body = `recFinal(rec)` JSON, skipped if > 1.9 MB);
unrated room → `results={places,unrated:true,replay}` + `matches` row; rated → read `users` rows of all owners (missing → 1200/0), `eloDeltas(ratings, places, games)`,
batch `UPDATE users SET rating=rating+Δ, games=games+1, wins=wins+(place===1)` for every seat (AI seats included) + `matches` row; `results={places,before,deltas,replay}`; tell Lobby (entry deleted).
`matches.id = code+'-'+created`; `matches.data` JSON: rated `{players:uids, names, ai:[aiId|null], rated:true, places, before, deltas, rounds, replay}`; unrated `{players, names, ai, places, rated:false, rounds, replay}`.
NOTE: the order of checks means an unrated room sets `d.rated=true` first, so the rated branch is skipped (intended).

Socket close (`webSocketClose`, worker.js:503-514): auto room in lobby and the uid has no other OPEN socket → drop the seat (host → next; empty → closed), persist, tell Lobby. Always `sendAll()` (updates `online` flags).
NOTE: in normal (non-auto) rooms a disconnected lobby player keeps the seat; in games, seats are never dropped on disconnect (only the timer forfeits).

### 2.6 D1 schema (created in `createSchema`, worker.js:26-57)

| Table | Columns | Notes |
|---|---|---|
| `users` | `id TEXT PK`, `google_sub TEXT UNIQUE` (`'g:<sub>'`, `'dev:<name>'`, NULL for AIs), `name TEXT NOT NULL UNIQUE COLLATE NOCASE`, `rating REAL NOT NULL DEFAULT 1200`, `games INTEGER NOT NULL DEFAULT 0`, `wins INTEGER NOT NULL DEFAULT 0`, `created INTEGER NOT NULL` (ms), `bot TEXT` (added by ALTER; AI id) | index `users_rating(rating DESC)`. Person ids `'u'+14 base36 chars`; AI ids `'ai-<aiId>'` |
| `matches` | `id TEXT PK`, `room TEXT`, `finished INTEGER`, `data TEXT` (JSON) | one per finished online game |
| `settings` | `k TEXT PK`, `v TEXT` | keys: `session_secret` (hex), `ai_calibration_v1` (`{at, ratings:{aiId:rating}}`) |
| `replays` | `id TEXT PK`, `created INTEGER NOT NULL`, `title TEXT`, `players TEXT` (names joined `', '`), `actions INTEGER`, `body TEXT NOT NULL` (log JSON), `game INTEGER NOT NULL DEFAULT 0` (1 = online game record, kept forever), `uids TEXT` (`',uid1,uid2,'`), `listed INTEGER NOT NULL DEFAULT 1` | index `replays_created(created DESC)`; uploads (game=0) pruned to newest 1000 |
| `train` | `run TEXT PK`, `updated INTEGER NOT NULL`, `body TEXT NOT NULL` | training progress JSON |

AI rows: for each `AIS` entry without a row, insert with name `A.name`, else `A.name+' (AI)'`, else `A.name+' (AI) '+id.slice(-4)`.
Calibration: one batch `UPDATE users SET rating=rating+(A.rating-1200) WHERE id='ai-<id>' AND NOT EXISTS (settings k='ai_calibration_v1')` + `INSERT OR IGNORE` of the marker.

### 2.7 Training-progress channel (`/api/train`, `public/train.html`, tools/ai/live.mjs)
- Producer: `tools/ai/live.mjs` every 5 s (heartbeat at least every 60 s) `POST /api/train` with `Authorization: Bearer <token from /tmp/claude-0/train-token>` and body
  `{run, env, started, phase:{name:'starting'|'self-play'|'training'|'testing'|'paused'|'halted'|'error', since, it?, horizon?, text?}, typical:{…}, iters:[≤80 {it,start,genEnd,trainEnd,end,horizon,gen_s,capped,buys,buysPerGame,train_s,dead1,dead2,sat,bias,rmse,base_rmse,arrival,test_capped,vsFair,netPlace,heurPlace,netArrival,heurArrival,evalGames,warn:[],restarted?}], events:[≤30 {t,kind,text}], baseline, baselineEval, posted}` (tools/ai/live.mjs:12-48).
- Consumer: `train.html` polls `GET /api/train` (`cache:'no-store'`), uses `now` for skew, `updated` for staleness (>150 s = stale).
- The server treats the body as opaque JSON (only `run` is read).

---

## 3. The frontend (`src/client/*.js`)

### 3.1 Shared globals and predicates (ui_state.js)
| Name | Meaning |
|---|---|
| `S`, `MAP` | the engine globals (same scope). Local: the real game. Online: the REDACTED state from the server (`applyServerState`). Replay: a JSON copy of a precomputed position |
| `REC` | local game record (`recNewGame` result) or null (old save / online / replay) (ui_state.js:8) |
| `REPLAY` | replay viewer state or null (ui_state.js:7) |
| `undoStack` | local undo: JSON snapshots of `S`, ≤ 60 (ui_state.js:6,19) |
| `NET` | `{available, cfg, user, token, ws, lobbyWs, room, seat, connected, deadline, skew, canUndo, busy, status, rooms, active?, code?, retries?, retryT?, pingT?, pendingRoom?}` (ui_state.js:11) |
| `online()` | `!!(S && S.owners)` — the ONLY online/local discriminator (ui_state.js:13) |
| `isAI(i)` | `S.players[i].ai` truthy |
| `canAct()` | `!REPLAY && (!S || (online() ? S.owners[S.cur]===myId() && NET.connected && !S.over : !isAI(S.cur)))` (ui_state.js:15) |
| `viewIdx()` | whose hand is shown: online → my seat (or `S.cur` for spectators); local → `S.cur`, or during an AI turn the last human viewer (ui_state.js:17) |
| `AIX` | local AI driver `{timer, mem:{seat→mem}, net, loading, failed, gen}` (ui_state.js:203) |

Engine internals called directly by UI code (not in `E`): `def`, `typeOf`, `coinVal`, `hexAt`, `isActive`, `rm`, `fmt`, `plural`, `playerDone`,
`reach`, `payTargets`, `nativeTargets`, `recNewGame`, `recAct`, `recResign`, `recFinal`, `replayCheck`, `replayStart`, `replayStep`, `setRng`, `RNG` (assigned),
`mulberry32`, `botRemaining`, `botCost`, `botValue`, `botScoreActions`, `botNetReady`, `aiSetNet`, `aiNetDecode`, `aiStep`, `aiUsesNet`, `aiById`,
`aiAllowed`, `aiCourseOK`, `AIS`, `COURSES`, `courseById`, `buildCourse`, `mapFor`, `CT`, `COLORS`, `R`, `DIRS`, `key`, `hash`, `SYMNAME`, `SYMCOL` (display).
A Rust/WASM port must expose equivalents for all of these (or the UI must be refactored onto a narrower API).

### 3.2 Local play

Start (`showSetup` → `#sGo`, ui_view.js:955-962):
`REC = recNewGame({course: setup.cur || pickCourse(setup.course), seed: setup.seed (random int <1e9, re-rolled after each start), privacy, fullRace: setup.full, players:[{name (AI → AI name; else typed name or 'Player i'), color: COLORS hex, ai: aiId|undefined}]})`.
`pickCourse('random')` picks with `Math.random` (ui_view.js:909). AI seats only selectable where `aiAllowed(course, n)`; at least one human required. If any seat uses the network, `aiNetLoad()` starts.
The board preview before starting calls `buildCourse(setup.cur, setup.seed)` so the previewed blockade deal is the one played.

Turn flow — `act(a)` (ui_state.js:104-114):
1. `canAct()` else ignore. Online → §3.3.
2. `snapshot()` (push `JSON.stringify(S)`).
3. `r = recAct(REC, S.cur, a)` (REC may be null).
4. `!r.ok` → pop snapshot, error sound, `toast(r.err)`, render. (Error strings from the engine are shown verbatim to players.)
5. `r.reveal || S.cur changed` → `undoStack=[]`.
6. `playEvents(r.ev)` (animations, sounds, toasts, "feed" of other players' plays; must run BEFORE render).
7. `afterLocalChange(turnChanged)`: clears pick modes; `syncMode`; privacy cover between humans; banner; if `S.over`: `UI.lastReplay = keepLocalReplay()` and the game-over modal after 600 ms.
`render()` calls `save()` every time (ui_view.js:891).

Action builders (what the UI sends; all go through `act`):
| UI gesture | Action |
|---|---|
| drop/tap a movement card on a reach target (`doMove`) | `{t:'move', card:UI.card, pi:tg.pi, to}` (for continuing leftover strength `UI.card = S.turn.active.id`) |
| Native on a target | `{t:'native', card, pi, to}` |
| cards dragged/tapped onto rubble / camp / grey blockade until `need` reached | `{t:'pay', pi, to, cards}` (auto-submitted when enough cards) |
| tap a draw card | `{t:'action', card}` |
| trash picker confirm | `{t:'trash', cards:picks}` (0..max) |
| Transmitter then market/reserve card | `{t:'transmit', card, src, idx}` |
| market card, then cards until covered | `{t:'buy', src, idx, cards}` (auto-confirmed 300 ms after total ≥ cost) |
| End turn (default discards everything; tap to keep) | `{t:'end', keep:picks}` (or `[]`) |
Targets shown (`computeTargets`, ui_state.js:52-68) come from `reach`/`nativeTargets`/`payTargets`; the UI pre-checks some errors with its own messages (`pickFromMarket`: 'Wait for your turn to buy.', 'You can buy only one card per turn.', 'The reserve opens once a market slot is empty.').
NOTE: UI pre-checks duplicate engine rules (buy-once, reserve lock, affordability in `affordable()`); the engine remains authoritative.

Undo (`undo()`, ui_state.js:190-196): local → `S = JSON.parse(undoStack.pop())` (restores `nact` too; REC untouched, truncated by the next recorded action). Available until a reveal or turn change. Ctrl/Cmd+Z.
Resign (`resignLocal`, ui_state.js:35-40): seat = current human, or during an AI turn the watching human (`resignSeat`); `recResign(REC, seat)`; clears undo; events; `afterLocalChange`.
Local AI turns (`aiKick`, ui_state.js:216-235): after every render, if `S.cur` is an AI: wait 1000 ms (first action of the turn) / 750 ms / 250 ms (reduced motion) / 60 ms (no human still racing); wait for piece animation; fetch network if needed; `aiSetNet(AIX.net)`; `r = aiStep(id, AIX.mem[seat], REC)`; `undoStack=[]`; `playEvents(r.ev, viewIdx())`; `afterLocalChange`. `aiReset()` (new/loaded game) clears timer and memory and bumps `gen` so stale callbacks die.
Network loading (`aiNetLoad`, ui_state.js:204-213): `AI_NET.b64` (artifact) or `fetch(AI_NET.url='/ai/first.bin')` → `aiNetDecode`. On failure `AIX.failed=true` and the network AIs play as the planner (`aiChoose` falls back when `BOT_NET` is null).
Game over (local): `keepLocalReplay()` = `recFinal(REC)` + `created`, `lid` → prepended to `eldorado-games-v1` (≤20; drops oldest on quota errors); `REC=null`.

### 3.3 Online play (ui_online.js)
HTTP helper `api(path, opts)` (ui_online.js:5-11): JSON, `Authorization: Bearer <NET.token>`, throws `Error(j.error || 'Request failed (<status>)')` with `.status`.
Startup `netInit()` (:12-17): skipped on `file:` and claude.ai hosts; `GET /api/config` (failure → `NET.available=false`); token from localStorage `ed-token`; `GET /api/me` → `NET.user`, `NET.active` (401 → token dropped).
Sign-in: Google Identity Services (`https://accounts.google.com/gsi/client`, `client_id = cfg.google`) → `POST /api/auth/google {credential}`; dev: `POST /api/auth/dev {name}` → `signedIn(r)` stores `ed-token`.
Hub: lobby socket `wsUrl('/api/lobby/ws')` (`?t=` token) → `{t:'rooms'}` updates `NET.rooms`; leaderboard `GET /api/leaderboard`; profile `PATCH /api/me {name}`;
quick match `POST /api/match` body `'{}'` → `joinRoom(code)`; create `POST /api/rooms {max, turn, course, pub, rated}` → `joinRoom(code)`; join by code (uppercased, `[A-Z0-9]`, ≥4 chars).
`joinRoom(code)` (:113-118): closes lobby socket, sets URL `?room=CODE`, `connectRoom()`.
Room socket (`connectRoom`, :120-133): `wsUrl('/api/rooms/<code>/ws')`; `onopen` → `NET.connected=true`; text `pong` ignored; `onclose` with code ≠1000 → reconnect after `min(8000, 800*retries)` ms (gives up in the lobby after 8 tries without a game); keep-alive `ping` every 25 s.
Client never sends `join` (seating happens on connect). Messages sent: `color`, `leave`, `start`, `now`, `addAI`, `removeAI`, `rated`, `act`, `undo`, `resign` (see §2.5).
`netSend(m)`: if the socket is not open → `NET.busy=false`, toast 'Reconnecting…' (message dropped, not queued).
`onRoomMsg` (:134-138): `error` → toast, clear busy; `room` → `NET.room` (if `closed`: leave, toast 'The host closed the room.', show hub); `state` → `NET.room, NET.seat, NET.canUndo=m.undo, NET.deadline, NET.skew=m.now-Date.now(), NET.busy=false`, `applyServerState(m.S, m.ev)`.
`applyServerState(S2, ev)` (:139-151): `fresh` if no old state, old not online, or `seed`/`room` differ → rebuild board (`MAP = mapFor(S)` — computed client-side from `course`+`seed`, never sent). Otherwise `playEvents(ev, viewIdx())`. Always: close pick modes, `syncMode(turnChanged)`, render; game-over modal once when `S.over` first appears; turn banner.
Online `act(a)` = `NET.busy=true; netSend({t:'act',a})`; the UI waits for the next `state` (optimistic updates are NOT applied). Undo: `netSend({t:'undo'})` only if `NET.canUndo`. Resign: `resignOnline` modal → `netSend({t:'resign'})`.
Turn timer display: `timeLeft() = max(0, round((NET.deadline - (Date.now()+NET.skew))/1000))` updated every 500 ms (ui_online.js:192-200); warning sound under 10 s on my turn.
Leaving: lobby "Leave"/"Close room" → `netSend({t:'leave'})` and close socket; Menu during an online game → local setup (the online game continues; rejoin via hub `active`); `exitOnline()` clears `S` and the socket.
Game over online: `showGameOver` reads `NET.room.results` (`deltas`, `before`, `unrated`, `replay`); "Watch replay" → `loadReplayId(results.replay)`.

### 3.4 Replays (ui_replay.js)
Sources: `?replay=<id>` (boot, `[a-z0-9]` only) → `GET /api/replays/<id>`; the Replays modal lists local games (`eldorado-games-v1`), my online games (`GET /api/replays?mine=1`) and recent (`GET /api/replays`); upload: file → `JSON.parse` → `replayCheck` → `POST /api/replays` (raw text) → `openReplay(log, id)` (URL `?replay=id`); local game over → `openReplay(UI.lastReplay, null)`.
`buildReplay(log)` (ui_replay.js:7-25): `replayCheck` (throws), `replayStart(log)`, then for every action `replayStep(log,i)`; a failing step is recorded in `fails` and replaced by `applyAction(S.cur,{t:'end',keep:[]})`; stores every position as JSON (with `log` stripped), per-step log lines, events, and `botRemaining` per player; finally `setRng(null)`. All positions are precomputed up front (≤ 20 000 actions).
NOTE: the substitute `end` on a failing v2 step runs with `RNG=Math.random`, so positions after a failure are not reproducible.
NOTE: `replayPromptHTML` reads `log.result.capped` (written by tools/ai/record.mjs, not by `recFinal`).
Evaluation panel (only if `aiAllowed(course, nPlayers)` and the network loaded): `replayEval` = per player `max(0, botValue(j,'net'))`, shown as shares; expanded view `replayAlts` = `botScoreActions(S.cur, mulberry32(i*7919+1), 8)` with `RNG` saved/restored, each option's share vs the others' raw values. Cached per position index.
`REPLAY` non-null ⇒ `canAct()` false, `save()` disabled.

### 3.5 Boot / routing (ui_boot.js)
`netInit()` then: `?replay=id` → replay; `?room=CODE` → join (signed in) or hub with `NET.pendingRoom`; signed in with `NET.active` → hub (Rejoin button); saved local game in progress → resume; else setup.
`window.__ED` (ui_boot.js:38): test hook exposing `{NET, UI, act, playEvents, openReplay, applyAction, render, S (getter), MAP (getter), showCourse(C,seed), joinRoom, netSend, onHandCard, doMove, pickFromMarket, confirmBuy, startEndTurn, finishTurn, confirmDiscardFor, confirmTrash, cancelMode, reach, myId, canAct, view}` — used by Playwright tests (test/*.cjs).

### 3.6 localStorage keys
| Key | Content | Writer / reader |
|---|---|---|
| `eldorado-save-v5` | JSON of local `S` (v5; includes `nact` if recorded) | `save()` on every render (not online, not replay) / `loadSave()` (falls back to `eldorado-save-v4`; rejects `v`∉{4,5} and states with `owners`; forces `v=5`) |
| `eldorado-save-v4` | legacy save, read only | `loadSave` |
| `eldorado-rec-v1` | JSON of `REC` (secret `rng` included) or removed | `save()` / `loadRec(s)`: accepted only if `seed` and `course` match, `s.nact` integer, `actions.length ≥ s.nact` |
| `eldorado-games-v1` | array (≤20, newest first) of finished local logs (`recFinal` + `created`, `lid`) | `keepLocalReplay` / Replays modal |
| `ed-token` | auth token | ui_online.js |
| `eldorado-seats` | JSON array of AI ids per setup seat (`''` = human) | setup |
| `eldorado-mkt` | `'1'`/`'0'` market panel open | ui_view/ui_boot |
| `eldorado-sound` | `'1'`/`'0'` | ui_sound.js |
| `eldorado-rspeed2` | replay speed (`.5`,`1`,`2`,`4`) | ui_replay.js |
| `eldorado-rside` | `'1'`/`'0'` evaluation panel shown | ui_replay.js |
| `eldorado-rexp` | `'1'`/`'0'` every option expanded | ui_replay.js |
NOTE: HANDOFF §replays mentions `eldorado-rec`; the actual key is `eldorado-rec-v1`.
NOTE: a local game's `S.log` in the save is capped at 200 lines by the engine; online states are capped at 120 by the server.

---

## 4. How the AI tools drive the engine (tools/ai/*.mjs)

All tools `import { E } from '../../src/engine.gen.js'` (regenerated by `node build.mjs`) and run in Node, often in `worker_threads`
(each worker has its own module instance, hence its own `S`/`MAP`/`RNG`/`BOT_NET`). None use the server.

### 4.1 The common game loop (pattern in ladder, h2h, deep, versus, seats, trace, turns, arrival, sim, calibrate, record, gen)
```
E.newGame({course: E.COURSES[0] | E.courseById(id) | E.botRandomCourse(seed,n), seed, fullRace:true, players:[{name,color:'#fff', ai?}]})
   — or E.replayStart(v1log) when the game must be replayable
while (!E.S.over) {
  E.S.log.length = 0;                       // direct mutation: drop log lines (speed/memory)
  if (E.S.round > CAP || acts++ > 20000) { E.endGame(); break; }   // round cap (25, 30 or HORIZON) ends the game by placement
  const me = E.S.cur;
  E.setNet(netForSeat);                      // several networks share one engine: swap BOT_NET per decision
  const c = E.botChoose({mode, rnd, search, …});
  if (!E.applyAction(me, c.a).ok) E.applyAction(me, {t:'end', keep:[]});   // illegal choice → end turn
}
read E.S.places / E.S.players[i].fin / E.S.round
```
Direct pokes at engine internals by tools:
| Poke | Where | Purpose |
|---|---|---|
| `E.S.log.length = 0` (mutating S) | gen:81, record:33, ladder:19, calibrate:31, h2h:29, deep:18, seats:14, sim:12, trace:10, turns:14, versus:16, arrival:14 | keep S small |
| `E.endGame()` on a live game | same tools | round cap: force placements |
| `E.S = E.botClone(root)` … `E.S = root` | gen:111-114 (TreeStrap samples), search_exp:20-47 (playouts) | look-ahead on copies |
| `E.setRng(shuf)` / `E.setRng(null)` around every `applyAction` | gen:136-138, record:36-38, seats, search_exp | the game's own shuffle stream (v1 log) vs. Math.random for bot look-ahead |
| `E.setNet(n)` per seat / per decision | gen, ladder, h2h, versus, deep, record, arrival, health, revive | multiple networks in one process; `botNetPrep` caches typed arrays on each net object (`_p`, non-enumerable) |
| `E.setPlan(k, o)` | h2h:17 | define planner variants `BOT_PLANS[k]` (options of `BOT_PLAN_DEF`: `near, blockAhead, guard, buyStop, buyMin, costW, keepEnd, safeTrash, minDeck, blockW, transStop`) |
| `E.MAPX.hexes.get(k)` | gen:121, turns:27 | map lookups (`MAPX` = MAP getter) |
| `E.botDist` | turns:18 | NOT exported (`undefined`); the tool guards against it |
| `E.newGame(...)` + `E.botNetNF()` with `E.setNet(null)` | transfer:14 | measure per-course input block sizes |

### 4.2 gen.mjs — self-play sample generation and evaluation
`HORIZON=… node tools/ai/gen.mjs <self|eval> <games> <out-prefix|-> [net.json] [course-id]`; workers = CPU count; env knobs
(`EXPLORE, EXPLORE_EPS, EXPLORE_T, ANNEAL, BENCH, SEARCH_BEAM, EVAL_OLD, EVAL_GAMES, MAXBACK, DISTILL, DISTILL_P, DISTILL_BEAM, PREV_NET, TREESTRAP, HEUR_P, HEUR_SAMPLES, TRUNC, PAIRED, LEAGUE, LEAGUE_P, EVAL_SELF, MAPS, MAPS_W, MIX_PLAIN, REPLAYALL, RUN`).
- Each game is a v1 log `{kind:'eldorado-replay', v:1, course, seed:dealSeed, rng:dealRng, fullRace:true, players:[{name, bot}], actions:[], gift?}`;
  `shuf = E.replayStart(glog); E.setRng(null)`; per action: bot decides under Math.random, then `E.setRng(shuf); E.applyAction(...)` (fallback `end`) `; E.setRng(null)`; action (or the substituted `end`) appended to `glog.actions`.
  The v1 contract is therefore: ONE generator for the whole game, consumed only by the recorded actions (and by `replayStart`: deck shuffles + gift insertion).
- Seat policies: `net`, `heur`/bench (`'plan'` default), league `lg<i>`, eval tables `net, netP, oldS, old`.
- Engine calls: `botChoose` (all option combos incl. `turnState`, `lotemp`, `search`), `botActionValue` (Double-Q), `botActions`/`botClone`/`applyAction`/`botNetFeatures` (TreeStrap), `botEndFeatures` (sample for an `end` action), `botNetFeatures` (sample after other actions), `botNetValue` (TD(λ) bootstrap, λ=0.7), `botPlaceValue`, `botPlaceSettled`, `playerDone`, `botRemaining`, `endGame`.
- Training data files (sparse rows): `<out>.len.bin` Uint32 non-zeros per row, `<out>.idx.bin` Uint16 column indices (so `nf` must be < 65536), `<out>.val.bin` Float32 values, `<out>.Y.bin` Float32 targets, `<out>.gid.bin` Uint32 game id per row, `<out>.json` `{n, nf, nnz, unsettled:true, …summary}`.
- Capped games at HORIZON ≥ 25 are saved as replays `tools/ai/data/replays/stuck-<seed>.json` with `title` and `result:{capped:true, arrived:[fin…]}`.
NOTE: the feature vectors (`botNetFeatures`, `botEndFeatures`) are part of the training contract: a Rust port must reproduce them bit-for-bit (Float32) for existing networks to work, including `BOT_TYPES` order, map key order (`[...MAP.hexes.keys()].filter(non-mountain).sort()` — JS string sort of `"q,r"` keys), connection order, and normalisation constants.

### 4.3 ladder.mjs — head-to-head of frozen networks
`node tools/ai/ladder.mjs match <A> <B> [games per size=256] [workers=4]` / `report`.
Game `g`: `E.newGame({course: COURSES[0], seed: seed0+g, fullRace:true, players: P0..})` with `RNG` left as Math.random (only the blockade deal is seeded);
`rnd = E.mulberry32(seed0*7+g)` passed to `botChoose({mode:'net', rnd, search: '+s' seats ? {kind:'plan',beam:3} : undefined})` after `E.setNet(net of that seat)`; cap 25 rounds; results appended to `tools/ai/data/ladder.jsonl` as `{time, match, g, n, capped, seats:[{id, place, fin}]}` (not arriving by the cap = place n).
NOTE: header comment says "fixed seeds per match", but deck shuffles use Math.random, so games are not reproducible.
NOTE: the ladder calls `botChoose` directly (no `aiChoose`/`aiFinishGuard`, no 60-decision guard), so "+s" is close to but not exactly the site's Humboldt.

### 4.4 record.mjs — recording bot games as v1 replay logs
`node tools/ai/record.mjs <policies> [games=1] [seed0] [--upload[=site]]`; env `COURSE`, `FILTER=capped|netlost|netclose`, `SHUFFLE`, `NEW_NET`.
Log: `{kind:'eldorado-replay', v:1, course, seed, rng:(seed*2654435761)>>>0, fullRace:true, players:[{name, bot:policy}], actions:[], notes:[]}`;
`gen = E.replayStart(log)`; per decision `E.setRng(null)` → `c = E.botChoose(opts || {mode:pol, explain:true})` → `E.setRng(gen)` → `applyAction` (fallback end). Actions are stored with `undefined` fields removed (`slim`).
`notes[i]` = `{v, alts:[{a, v|null}]}` (network top-5 with `explain:true`) or `null`. Cap: round > 25 → loop stops WITHOUT `endGame` (log just ends; `result.capped=true`).
Output: `title = "<pols> · seed N[ · hit the 25-round cap]"`, `result:{capped, arrived:[fin…]}`; file `tools/ai/data/replays/<course>-<seed>.json`; `--upload` → `POST <site>/api/replays` → prints `<site>/?replay=<id>`.
NOTE: the replay viewer applies the same v1 stream (`replayStart` keeps it installed for all steps), so the recorded game replays exactly — provided the bots' look-ahead never ran with the game stream installed.

### 4.5 calibrate_ais.mjs — named-AI ratings
Workers: `E.aiSetNet(E.aiNetDecode(first.bin))`; per game `E.setRng(E.mulberry32(424200+g))`, `E.newGame({course: COURSES[0], seed: 424200+g, fullRace:true, players:[{name, color, ai:id}]})`, loop `E.aiStep(ai[me], mem[me])` (rec undefined → not recorded) with cap 30 rounds → `endGame`.
Result rows `{g, ai:[ids], places, fin, round, capped}` cached in `tools/ai/data/calibration.json`; ratings by ML fit (anchor raleigh=1200) and by replaying `E.eloDeltas` sequentially.
NOTE: "Seeds are fixed, so the numbers reproduce" holds only for the game stream; `aiChoose` runs the bot with `RNG=Math.random` and `botChoose`'s default `rnd=Math.random` (deck reshuffles in look-ahead), so AI decisions vary between runs.
NOTE: 2-player tables are still played, but `aiChoose` now forces the planner for 2 players, so the network AIs play them as Raleigh.

### 4.6 Other tools (one line each)
| Tool | Engine surface used |
|---|---|
| `pack.mjs` | none (JSON model → `.bin`, §1.12) |
| `transfer.mjs` | `BOT_NF`, `BOT_FLAGS`, `botNetNF`, `newGame`, `setNet`, `courseById` — builds multi-course / other-course networks (`net.courses`, `net.onehot`, `net.course='multi'`) |
| `h2h.mjs` | planner variants via `setPlan`, `botChoose`, `BOT_EVALS` |
| `sim.mjs` | `botRandomCourse`, `botActions` (random policy), `botChoose` |
| `search_exp.mjs` | `botScoreActions`, `botValue`, `botClone`, `replayStart`, own playouts swapping `E.S` |
| `health.mjs`, `revive.mjs` | `botNetFeatures`, `botNetValue` (network diagnostics), `BOT_NF` |
| `deep.mjs`, `versus.mjs`, `seats.mjs`, `arrival.mjs`, `trace.mjs`, `turns.mjs` | the common loop (§4.1) with various policies; `botCost`, `botRemaining`, `MAPX` |
| `live.mjs` | none (posts training status, §2.7) |
| `progress.mjs`, `charts.mjs`, `deep_report.mjs`, `search_report.mjs`, `addfeat.mjs`, `fresh.mjs`, `widen.mjs` | no engine import (reports / network-file surgery) |

### 4.7 test/engine.test.mjs (the engine's regression contract)
1. `buildCourse` for every course × 40 seeds: one blockade per connection, distinct numbers, seams only between consecutive tiles, 4 starts, 3 goals, >5 distinct deals.
2. 60 random games (2–4 players, `fullRace` false every 5th) via `reach`/`payTargets`/`applyAction`/`resign`: termination, out-of-turn and fake-card actions rejected, card conservation `Σ piles + trash = nid-1`, `places` valid, `eloDeltas` zero-sum for equal game counts, `redact` hides other hands/decks.
3. Shipped half-float network vs JSON within 2e-3 on sampled positions; AI games finish on every course; network used only on `first` (`BOT_EVALS` unchanged elsewhere); every `play` event names only public cards.
4. Single-use cards used for movement are trashed.
5. v2 records with random undos (`E.S = JSON.parse(before)`), timeouts and resignations: `recFinal` passes `replayCheck` and `replayStart`+`replayStep` reproduce `JSON.stringify({...S, log:[], nact:0})` exactly.
Prints `ok: 60 games …` (CLAUDE.md requires it).

---

## 5. Consolidated NOTE list (for the reviewer / Rust port)

Engine semantics that a port must copy exactly (or deliberately change):
1. `shuffle` algorithm and `mulberry32`, `recRng` formulas, and the ORDER of RNG consumption (newGame: per-player deck shuffle then draws; reshuffle of discard only when the deck is empty mid-draw) — required for replaying stored v1/v2 logs and D1 replays.
2. `reach` tie-breaking (linear-scan Dijkstra, Map insertion order, first sym wins ties) decides the path and therefore which blockades a move takes and the `move` event path.
3. Target keys are strings `"q,r"` and `"B<index>"`; blockade index ≠ blockade number (`block` event carries the number).
4. Reserve purchases splice `S.reserve` (indices shift) and the `gain` event's `idx` is the pre-purchase reserve index.
5. `redact` stable sort leaves same-type deck ids in draw order (not a rules leak, but canonicalise).
6. Float32 accumulation of the first network layer (`h1` is a Float32Array) — needed for bit-identical values.
7. `botActions` is deduplicated and non-exhaustive (≤3 kept cards, minimal payments, ≤8 payments per cost); AI behaviour depends on its exact order.
8. `S.rules` (read by `botNetFeatures`) is never set; `S._endView` exists only on bot clones.
9. `forceEnd` drops the implicit `trash` step's events; `resign` of the current player leaves its `play` pile and hand as they are.
10. `end` is allowed while `turn.active` is set; `move` with the active card ignores `a.pi`.
11. `applyAction` indexes with JS coercion (`S.market[a.idx]`), so `idx:"0"` works; `pieceOk` requires an integer.
12. `replayStep` for v1 logs can't handle `resign`/`timeout`; `replayStart` never sets `players[].ai`.
13. The replay viewer's fallback `end` for a failing v2 step uses `Math.random` (non-reproducible afterwards).
14. `eloDeltas` is not zero-sum when players have different game counts (K 48 vs 32).
15. `aiNetDecode`/`pack.mjs` drop `courses`/`onehot`/`extra` — multi-course networks can't be shipped as `.bin`.

Server:
16. `d.rated` means "results processed", not "rated".
17. HANDOFF says `opts{max,len,turn}` and turn choices 60–180; code: `opts{max,course,turn,pub,rated,auto}`, turn choices include 300 (UI offers 60/90/120/180).
18. Rooms are listed in the Lobby only after the first socket seats someone; Lobby pruning only runs on `/update`.
19. Undo does not restore/reset the turn deadline; timeouts are counted per seat until that seat's next successful `act`.
20. Undo snapshots and `rec` are separate: undo restores `S.nact`; the record is truncated on the next recorded action.
21. A failed `act` restores `S` from a JSON snapshot even though `applyAction` does not mutate on failure (defensive; the RNG stream for that index is not consumed in any persistent way).
22. Malformed JSON bodies on `/api/auth/*` and `PATCH /api/me` give 500, not 400; `/api/config`, `/api/leaderboard`, `GET /api/train` accept any method.
23. Quick-match races can over-assign a room; the extra player connects as an unseated spectator.
24. AI seats are impossible with `course:'random'` rooms (`aiCourseOK('random')` is false).
25. Every state push is the full redacted state (no deltas); each socket gets its own redaction; spectators get seat −1 views.

Client / tools:
26. HANDOFF names the local record key `eldorado-rec`; the code uses `eldorado-rec-v1`.
27. The UI calls ~40 unexported engine internals directly (§3.1); a WASM engine needs a broader binding than `E`.
28. `ladder.mjs` and `calibrate_ais.mjs` claim reproducibility but AI look-ahead/deck shuffles use `Math.random`.
29. `turns.mjs` references `E.botDist`, which is not exported.
30. Training sample files store column indices as Uint16 (nf < 65536).

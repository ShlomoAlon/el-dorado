# El Dorado Expedition — handoff for the next Claude

Everything a new session needs to keep building this without the original conversation.
Written at the end of the first build session (September 2026).

---

## 1. What this is and who it's for

- A digital edition of Reiner Knizia's **The Quest for El Dorado** (Ravensburger, 2017), base game only.
  Unofficial fan build: all art is original (SVG/CSS), name shown in the UI is "El Dorado Expedition".
  Don't use Ravensburger artwork, logos or the exact box title as branding.
- Owner: **Shlomo** (GitHub `ShlomoAlon`, repo `ShlomoAlon/el-dorado`). Plays with friends; expects up to ~200 users,
  so free-tier hosting is the target and must stay free.
- Modes: **local pass-and-play** (2–4 players on one device) and **online ranked** (own devices, Google sign-in, Elo).

## 2. What the owner asked for, in order (so you understand his taste)

1. A native-feeling digital board game with *all* the real rules, prettier and cleaner than the table version.
   "Prioritize making the UI non-janky and clean… it should feel professional… not like Board Game Arena."
2. Ship early, publish working versions often; he wants to watch progress.
3. Click-and-drag play with an **arrow** (like Slay the Spire / Monster Train), not only click-then-click.
   The hand **floats over the board** (no separate hand area); board as large as possible; prettier cards and tiles.
4. Worried the boards were made up (they were at first) — wants the **real tiles** and the real **El Dorado end tile**.
5. Market panel was stuck open → now a floating drawer, toggleable at every width.
6. Pinch-zoom on mobile was jumping → fixed with anchor-preserving pinch (see §6.4).
7. Arrow should also appear on **click**, and animate (not static).
8. **Default end-of-turn to discarding** leftovers (tap cards to keep them).
9. Real multiplayer, hosted **free** → then a real server, **Elo**, **multiple rooms**, **Google sign-in**,
   **every online game ranked**, and "the game isn't over till all but one player reaches the end."
10. A **turn timer**.
11. **Git + auto-deploy**: one-time setup by him, then Claude changes code, pushes to GitHub, and the site redeploys itself.

His user preference: think carefully before every answer, even simple ones.

## 3. Current status at handoff

- Code complete and tested locally (engine test + 3-browser online e2e against `wrangler dev`).
- **Deployed** at `https://el-dorado.shlomoalon9.workers.dev` via Cloudflare Workers Builds from `main` (preview builds off).
  D1 auto-provisioned fine on the first deploy. Google OAuth client created; its ID is in `wrangler.jsonc` `vars`.
  First thing in a new session: check `git log`, ask for the `*.workers.dev` URL if you don't have it, and ask whether
  sign-in works. If the first Cloudflare deploy failed on D1 (see §9), fix it.
- A **claude.ai artifact** (local play only, no networking allowed there) exists at
  `https://claude.ai/artifact/RTXt989RQBpnviqeUFCiKv`. It's built from `build/artifact.html`. Update it only if the
  Artifact tool is available in your session (read it first, then publish with `url`); it's secondary to the real site.
  Online mode inside claude.ai shows "can't reach the game server" by design (the artifact sandbox blocks networking).

## 4. Rules as implemented (source of truth: `src/engine_rules.js`)

Verified against the rulebook text (rulespal / ultraboardgames / 1j1ju PDF) and goldcity.io edge-case rulings.

- Starting deck: 3 Explorer (1 machete), 4 Traveler (1 coin), 1 Sailor (1 paddle). Hand of 4.
- Turn: play cards in any order (move / actions / **one** purchase) → discard played cards → optionally discard hand
  leftovers (**UI default: discard all; tap to keep**) → draw to 4 (reshuffle discard when deck empty; cards in play are
  not reshuffled mid-turn).
- Movement: one card per space, no combining. Leftover strength continues moving the **same explorer** over more spaces
  of that symbol; lost once you do anything else (`S.turn.active`). Jokers = any one symbol, chosen per card play.
  Rubble (grey): discard N cards. Base camp (red): remove N cards from the game. Mountains impassable.
  Occupied spaces can't be entered or passed. Start spaces can't be re-entered.
- Blockades between consecutive boards, **dealt at random** at game start (rulebook: shuffle face down, one per
  connection; with strips, only one at the strip's starting side). First to pay keeps it. Leftover strength can pay a blockade and continue.
  **Native can tear down blockades** (rulebook: "The Native can also tear down blockades") and ignores space requirements.
- Buying: coin cards and jokers pay face value, any other card ½. One purchase per turn. Reserve opens only when a market
  slot is empty; the bought stack moves into that slot. Single-use cards are removed after their *effect*; spent as ½ coin
  they're discarded normally (Treasure Chest / Prop Plane paying coins = effect → removed).
- Transmitter: take any market/reserve card free (reserve allowed even when locked), then it's removed.
- Cards (cost): Scout 2m(1), Trailblazer 3m(3), Pioneer 5m(5), Giant Machete 6m(3, once), Captain 3p(2),
  Photographer 2c(2), Journalist 3c(3), Treasure Chest 4c(3, once), Millionaire 4c(5), Jack of All Trades 1j(2),
  Adventurer 2j(4), Prop Plane 4j(4, once), Transmitter(4, once), Cartographer draw 2(4), Scientist draw 1 + may trash 1(4),
  Compass draw 3(2, once), Travel Log draw 2 + may trash ≤2(3, once), Native(5).
  Initial market: Scout, Trailblazer, Jack, Photographer, Treasure Chest, Transmitter. 3 copies per stack.
- Two players: each has 2 explorers (starts 1&3 / 2&4); both must arrive; each card moves one explorer.
- **End of game (owner's variant, default everywhere; forced online):** `S.fullRace=true` — play continues until at most
  one expedition is still racing (arrived or resigned players are skipped), then the round is completed. Placement:
  arrived players by arrival round, ties by most blockades then highest blockade number, still tied = shared place;
  then unfinished players by closeness to a finish space; then resigned players (earlier resignation = lower).
  Local games can pick the official ending (`fullRace:false`: game ends after the round in which someone arrives).
- **Elo:** pairwise from the placement; K = 32 (48 for a player's first 10 games) divided by (n−1); start 1200;
  zero-sum; updated once per game in `Room.finish()`, **only for rated rooms** (`opts.rated`, default true; the room creator /
  host picks Rated or Unrated; quick matches are rated). AI players are rated like people (see §6.6).
- **Timer (online):** host picks 60/90/120/180 s. On expiry the server auto-ends the turn (resolves pending trash with
  nothing, discards leftovers). 3 consecutive timeouts → resign (forfeit). Any successful action resets the count.

## 5. Boards — what is real and what is reconstructed (important, owner asked about this)

- **Real, verified space by space** (terrain + strength): **A, B, C, D, F, G, I, J, K, L, M, N** — transcribed from the BoardGameHelpers tile
  catalogue images (https://www.boardgamehelpers.com/QuestforElDorado/TileCatalogue.aspx, `Images/Q4eD.<n>.<L>.gif`;
  reachable from the sandbox with curl). Image orientation = rotation 0 in `BOARDS` (rows 4·5·6·7·6·5·4, pointy-top).
  Strength = number of icons (machetes, paddles, coins; cards on camps/rubble). Start spaces `s1`–`s4` carry the
  printed numbers. K was confirmed by the owner; F, G onwards have side-by-side images in `tools/course-check/tile-<L>.jpg`.
- **Independent check:** the catalogue page lists per tile the terrain counts and a "Traverse Rating", which turns out to be
  exactly Σ strength + 6 per mountain (start spaces 0). Every transcription must match both. A, B, C, D, F, G, J, K, L, M match
  — but **I and N are each 1 short**, and the images show why: **I's base camp (row 4, 5th space) is 3 cards (c3, we
  have c2)**, **N's row 4, 5th space is a 3-coin village (v3, we have v2)**. FIXED 2026-09-27 (owner: accuracy first); First Expedition uses
  both and the AI network is trained on it (coordinate with the training side; it's a one-token change each in `BOARDS`).
- Still reconstructed: **E, H** (terrain counts right, layouts guessed) and strips **O–R** (not in).
  Transcribe them from the same images the same way before adding courses that use them.
- First Expedition layout and rotations come from Ravensburger's German setup sheet
  (brettspiele-report.de …/Wettlauf nach El Dorado_Spielaufbau.pdf, page 1; page 2 has the 6 other official routes,
  clear vector-ish art — much better than the English rulebook scans). Page 1 is rotated ≈12° vs our lattice; page 2 is
  flat-topped (exactly 30°), 85.15 px per hex at 500 dpi.
- **Courses from page 2** were placed by fitting: each board's 37 spaces are colour-classified in the 500 dpi render and
  matched against the transcription at every lattice offset and rotation, chaining board to board (36–37 of 37 match;
  misses are under the big printed letters). Result = exact integer positions/rotations; the course is then turned 60°
  steps so it lies wide on screen. Comparison images: `tools/course-check/course-<id>.jpg` (sheet turned 30° above the
  game), made with `tools/course-check/shots.cjs` + `compose.py`.
  Official difficulty (rulebook p. 10 / sheet): easy = First Expedition, Hills of Gold, Home Stretch (needs strip Q);
  medium = Winding Paths, Serpentine; hard = Witch's Cauldron, Swamplands (needs strips O, R).
  In the game: `first` + `hills` (Easy), `winding` (Medium), `witch` (Hard). Hills of Gold is drawn pointy-topped on the sheet (not turned).
- **AI safety net** (`aiFinishGuard`, engine_ai.js): on the new courses the planner sometimes trashed its last paddle/machete card
  (or its deck down to 2 cards) and then waited next to El Dorado forever. The named AIs now keep one card that can enter
  El Dorado, never trash below 4 cards, and buy such a card before ending a turn without one. engine_bot.js untouched.
- Blockade costs 1,1,1,1,2,2 are still a guess (BoardGameHelpers has blockade images too).
- Board rendering: harder spaces are darker (`TSHADE` in board/terrain.js), icons laid out 1 / 2 side by side / 3 triangle /
  4 square — owner's request, mirrors the printed tiles.

## 6. Architecture

### 6.1 Files
```
build.mjs                 concatenates sources → public/index.html, build/artifact.html, src/engine.gen.js
wrangler.jsonc            Worker config: assets ./public, D1 "DB", DOs ROOMS(Room) + LOBBY(Lobby), keep_vars
src/engine_data.js        CT (cards), MARKET0/RESERVE0, BLOCKADES, BOARDS, hex geometry, genMap/buildMap (seeded)
src/engine_ai.js          named AI players (AIS: Fawcett / Humboldt / Raleigh) over engine_bot.js: aiChoose/aiStep, per-game
                          plan cache, aiNetDecode (half-float network). engine_bot.js itself is the training code's: don't change it
src/ai/first.bin          the shipped network (tools/ai/pack.mjs from tools/ai/models/first-first1-best.json; build copies it to public/ai/)
src/engine_rules.js       S/MAP globals, newGame, reach/nativeTargets/payTargets, applyAction, advance, resign,
                          endGame (placements), eloDeltas, redact
src/client/shell.html     <title>, fonts, all CSS (design tokens in :root), SVG symbol defs, DOM skeleton
src/client/*.js           the page: ES modules bundled by esbuild (build.mjs). One module per area; the full map and the
                          rules for view code (render() → one update per frame, no layout reads, compositor animations)
                          are in docs/FRONTEND_REFACTOR.md. art.js: per-card background scenes (CARD_BG: 21 hand-made SVG
                          scenes behind the emblem; the owner likes this silhouette/travel-poster style; no image generator
                          available — match it for new cards)
src/worker.js             Worker routes, auth (Google JWT verify + HMAC session tokens), Lobby DO, Room DO
test/run.mjs              all checks in one command (quick ~45 s; --full); see CLAUDE.md
test/flows.cjs            Playwright: a local game played with real clicks and drags (move, drag, undo, buy, AI turn, replay)
test/frames.cjs           phone profile, CPU ÷4: restyle size and composited animations per interaction
test/engine.test.mjs      60 random games (--quick: 12): termination, card conservation, placements, zero-sum Elo, no redaction leaks
test/e2e.cjs              Playwright: 3 dev-signed-in browsers, create/join/start, moves, buys, timer, resigns, ratings
test/e2e_ai.cjs           Playwright vs wrangler dev: rated room with 2 AI seats plays to the end (AI ratings move), unrated room
test/ai_local.cjs         Playwright (own static server): local game vs AIs from the setup screen, 1440 and 390 px
```
The browser build wraps everything in one IIFE; engine and UI share scope (`S`, `MAP`, helpers are plain globals
inside it). The server imports `E` from `engine.gen.js` and sets `E.S`/`E.MAP` before each call (safe: DO calls are
synchronous around the engine).

### 6.2 Game state `S` (JSON, v3)
`{v:5, seed, course{id,name,p,e,s}, players[{name,color,ai?(AI id),pieces[hexKey|'done'],deck[],hand[],discard[],play[],blocks[blockadeIdx],fin(round|0),resigned(order|0)}],
cards{id:type}, nid, market[{t,n}], reserve[{t,n}], blockades[{n,k,v,conn,owner}], cur, start, round, endTriggered, over,
winners[], places[], fullRace, turn{bought, active{id,pi,sym,left}|null, pending{max}|null}, trash[], log[{p,t}], privacy, resigns,
owners[uid] (online only), room (online only)}`.
`MAP` is derived from `(course, seed)` by `buildCourse` (seed deals the blockades) — deterministic, never stored.
Local save key `eldorado-save-v5` (v5 added `players[].ai`); v4 saves still load (`loadSave`); v3 saves are ignored; v3 rooms on the server are closed on load.

### 6.3 Actions (`applyAction(seat, a)` → `{ok, err, ev[], reveal}`)
`move{card,pi,to}` · `native{card,pi,to}` · `pay{pi,to,cards}` · `action{card}` · `trash{cards}` ·
`transmit{card,src,idx}` · `buy{src,idx,cards}` · `end{keep}`; plus `resign(seat)`.
`to` is a hex key `"q,r"` or `"B<blockadeIndex>"`. Events: `move{pl,pi,path}`, `block`, `arrive`, `draw`, `gain{t,src,idx}`,
`turn`, `over`, (server adds) `timeout`, `resign`, `undo`, `start`. `reveal=true` (cards drawn) clears undo.
Every action also emits `play{pl,k,ts,…}` (k = move/native/rubble/camp/blr/action/trash/transmit/buy/end; `ts` = card types spent,
`got`/`paid` for buy/transmit, `n` spaces or cards drawn, `more` = leftover strength): the same `ev` goes to every seat online, so
it may only name cards that just became public (in play or removed); `end` carries counts only (`kept`, `disc`). engine.test checks this.
Log lines are `{p,t,r}` (r = round; lines the server adds have none).

### 6.4 Client UI essentials
- `act(a)`: local → snapshot for undo, `applyAction`, `playEvents` (animations/toasts; call before render so market DOM
  still exists for fly-to-discard), `syncMode`, render, banner on turn change. Online → `netSend({t:'act',a})`, `NET.busy`.
- Card layer: all cards are absolutely positioned elements in `#cards`, moved with `transform` transitions
  (`layoutCards()` computes the fan; hovered card lifts & scales; selected/picked lift). Draws fly from the deck pile.
- Aim arrow: `aimLoop` (rAF) runs while a movement card is selected; mouse → follows cursor, snaps to targets
  (`targetAt` does pixel→hex rounding + blockade badge hit test); touch → points at the explorer until dragged.
  Pooled SVG chevrons, no per-frame DOM creation.
- Pan/zoom: `view{s,x,y}` applied as one `translate3d … scale` on `#stage` via rAF; `will-change` only while moving.
  Pinch keeps the board point under the fingers' midpoint fixed; lifting one finger re-bases the pan (no jump).
  ResizeObserver refits only on width changes. Page-zoom gestures are blocked.
- Market: the 6 market cards float in a 2-column stack on the right edge (1 column on phones) (`#mkt`, toggled by the Market button, `setMkt`,
  remembered as `eldorado-mkt`) plus an "All cards" tile that opens a full-screen spread of market + reserve + journal
  (`#allc`, `openAll`; the journal moved to its own button). Affordable cards are bright with a static "Can buy" tag, the rest are dimmed (owner: no pulsing — it's always on).
  The board fit leaves room under the prompt (safeRect measures it).
- Cards: suit sets frame + scene palette; strength badge uses the suit colour and icon (only coin cards are gold);
  action cards show `face` (short) text, `txt` in tooltips. Full-screen button `#fsBtn` is hidden where unsupported
  (iPhone Safari); home-screen metas make the saved web app full screen there.
- **Other players' turns** (`FEED`, feed.js): for AI seats (local) and every seat but mine (online), `playEvents` feeds the
  `play` events into a row of small cards under the prompt text (`#feed` inside `#prompt`): one group per step with a caption
  ("Explorer · 2 spaces · blockade #3", "Bought Scout for 2½", "Ended turn · kept 1"); played cards fly out of their player chip, a
  bought/taken card flies out of the market, and their moves leave a dotted trail in their colour (`L.trail`). After their turn the
  row stays as a recap ("Raleigh's turn") until I act. Oldest steps drop out whole when the row is full. Not in replays (the actor's
  hand is shown there). In short game areas the prompt also keeps clear of the turn buttons (`--actFoot`, set in `btnWire`).
  Local AIs act ~0.75 s apart (first action of a turn 1 s) so each card can be followed.
- **Journal**: its own HUD button (`#jrnBtn`, a book icon alone on phones) opens the game log as a modal (`showJournal`), newest
  first, grouped by round, live while open (no backdrop blur on it). It used to be a collapsed section of the All-cards spread.
- Design: single dark theme by choice. Fonts Young Serif (display) + Figtree (UI). Tokens in `:root` of shell.html.
  Terrain colors in `TFILL`, card frames `.k-g/.k-b/.k-y/.k-x/.k-p`.

### 6.5 Server (`src/worker.js`)
HTTP: `GET /api/config` → `{google, dev}` · `POST /api/auth/google {credential}` · `POST /api/auth/dev {name}` (only with
`DEV_AUTH=1`) · `GET /api/leaderboard` · `GET/PATCH /api/me` · `POST /api/rooms {max 2–4 (default 3),course,turn,pub}` (course id or `'random'`; `pub:false` = private, not listed) ·
`POST /api/match` (quick match: Lobby DO puts you in the fullest waiting public match room or opens one) → `{code}` ·
`GET /api/rooms/:CODE/ws?t=token` (WebSocket) · `GET /api/lobby/ws?t=token` (WebSocket). Everything else = static assets.
Auth token: `uid.exp.hmac` (60 days), secret generated once and stored in D1 `settings`. Google ID tokens verified
against Google JWKS (RS256, aud = `GOOGLE_CLIENT_ID`).
D1 tables (auto-created): `users(id, google_sub, name UNIQUE NOCASE, rating, games, wins, created)`,
`matches(id, room, finished, data JSON)`, `settings(k, v)`.
Room DO (one per 5-char code, hibernatable WebSockets tagged by uid): storage keys `d` (meta: code, host, seats,
status lobby|playing|over|closed, opts{max,len,turn}, deadline, timeouts, rated, results), `S`, `undo` (≤6 snapshots).
Client→room: `join`, `leave`, `color`, `start` (host, normal rooms), `now` (match rooms: toggle "start now"), `act{a}`, `undo`, `resign`, `"ping"`.
Quick-match rooms (`opts.auto`): 3 seats, start by themselves when full, or with 2+ when every seated player sent `now`
(owner: 2-player games only when explicitly requested). Players who disconnect before a match starts lose their seat;
the host leaving doesn't close a match room. The Lobby lists only public rooms.
Room→client: `{t:'room', room}` (pre-game), `{t:'state', S(redacted), ev, seat, undo, deadline, now, room}`, `{t:'error', msg}`.
Turn timer = DO alarm at `d.deadline`. Lobby DO keeps `{code → summary}` and pushes `{t:'rooms'}` to hub sockets.
Free-tier notes: DO CPU limit 30 s/message (engine actions take <5 ms); Worker requests 100k/day (static assets free);
incoming WebSocket messages are cheap; hibernation keeps idle rooms from burning duration.

### 6.6 AI players
- Three named AIs (`AIS` in `src/engine_ai.js`), all the same bot code with different settings:
  **Fawcett** (Grandmaster) = value network + a wider whole-turn planner (`{mode:'net',search:{kind:'plan',beam:12},draws:8}`,
  the strongest; ~3x Humboldt's thinking time), **Humboldt** (Master) = value network + whole-turn planner
  (`{mode:'net',search:{kind:'plan',beam:3}}`), **Raleigh** (Steady) = heuristic route planner (`mode:'plan'`).
  (Orellana, the network one action at a time, was retired.) Searching further rounds ahead (`search.kind:'deep'`, depth 1–3,
  ~2.8 s per turn) was measured against Humboldt with tools/ai/h2h.mjs: depth 1 and 3 about as strong as Fawcett's wide search,
  depth 2 no better than Humboldt; the wide search costs ~1/18 of the time, so it is the level shipped.
  The network (`first-first1-best`, trained under the fixed single-use rules, 2026-09-28; earlier `first-distill-35`, `first-distill-22`, `first-qmax`) only fits First Expedition (`botNetReady`); elsewhere the network AIs play as the planner.
- Network shipping: half floats, 339 KB (288 KB gzip), outputs within 2e-4 of the JSON (checked in engine.test). The site
  fetches `/ai/first.bin` only when a network AI is about to move; the artifact has it inline (`AI_NET.b64`); the worker imports
  the .bin (wrangler's default Data rule → ArrayBuffer). To ship a new network: `node tools/ai/pack.mjs <model.json>` then build.
- Local: setup seat picker (Human / AI); `aiKick()` after every render schedules one AI action at a time (~0.75 s apart, waits for
  piece animations). `canAct()` is false on AI turns; `viewIdx()` keeps showing the last human's hand. No Elo locally.
  Thinking runs on the main thread: Humboldt's first action of a turn takes up to ~150 ms (rest of the turn follows the plan, ~0 ms).
- Online: the host adds AI seats in the room lobby (`addAI {ai}`, `removeAI {uid}`, each AI once per room; not in quick matches).
  The Room DO plays them: `nextTurn()` gives people the turn timer and AIs an alarm (`d.aiAt`); `aiMove()` plays one action per
  alarm (0.7 s apart) while a person still racing has the page open, otherwise ~0.3 s of actions per alarm until a person's turn
  or the end. Plan cache is per room (`this.aiMem`), so rooms sharing an isolate can't mix plans.
- Ratings: each AI is a `users` row `id='ai-<id>'`, `bot=<id>`, no google_sub (created in `ensureSchema`; if a person already has the
  name, the AI gets "(AI)" appended). Leaderboard lists them (with `bot`) even before their first game.
- **Calibrated starting ratings** (`AIS[].rating`): Humboldt **1530**, Orellana **1483**, Raleigh **1200**, from
  `nice -n 10 node tools/ai/calibrate_ais.mjs 720 2` (fixed seeds, reproducible; ~20 min on 2 cores; games cached in
  tools/ai/data/calibration.json, `… report` re-prints). The AIs play exactly as on the site (`aiStep`, shipped half-float net,
  First Expedition, fullRace, 30-round cap). Ratings: maximum-likelihood Elo over every pair of different AIs in the 540 three- and
  four-player games (pairwise: Humboldt beats Orellana 58%, both beat Raleigh ~85%), ±23; the server's own sequential eloDeltas
  over the legal games (no repeated AI) agrees (1535 / 1468 / 1200). **Anchor: Raleigh = 1200**, the rating every new person
  starts with: Raleigh is the "Steady" level for newcomers, so a new player is assumed equal to it, and real rated games then move
  everyone from there (Elo only fixes differences; anchoring the AIs' mean at 1200 would have put Raleigh ~140 below a
  first-timer, which experience says is too harsh on the person who beats it). Applied once by `ensureSchema()`: one D1 batch
  shifts each ai-* row by (calibrated − applied) and records the applied rating in `settings` `ai_rating:<id>` (the first
  calibration is in `ai_calibration_v1`), in one conditional transaction — so AIs that already played keep their gains/losses,
  and changing `AIS[].rating` later (a new calibration, or a new AI) moves that AI by the difference exactly once.
- **Known problem (2 players):** in the 180 two-player calibration games the network AIs (Humboldt, Orellana) mostly failed to
  reach El Dorado within 30 rounds (88 capped; Raleigh won all 120 of its 2-player games). The network seems not to handle two
  explorers per player. Those games are left out of the ratings. Worth a look by the training side (engine_bot.js), or a
  fallback to the planner for 2-player games in `aiChoose`.

### Replays (game logs)
- A game log is `{kind:'eldorado-replay', v:1, title, course, seed, rng, fullRace, players:[{name,bot}], actions:[[seat,action],…], notes:[…]}`.
  Shuffles draw from `RNG` (engine_data.js); `replayStart(log)` seeds it with `log.rng` and starts the game, so re-applying the
  actions rebuilds the identical game. Normal play and the server keep `Math.random`.
- `node tools/ai/record.mjs net,plan,plan [games] [seed] [--upload]` records bot games (the net's top options and win-chance
  estimates go in `notes`); `FILTER=capped|netlost` keeps only those games. Bots' look-ahead runs with `setRng(null)` so it
  can't consume the game's shuffle stream.
- Server: `POST /api/replays` (public, ≤1.9 MB, `replayCheck` validation, newest 1000 kept in D1 `replays`), `GET /api/replays`,
  `GET /api/replays/<id>`. Page: `/?replay=<id>`, or "Replays" on the start screen (upload + recent list).
  Viewer: `src/client/replay.js`; `G.replay` non-null makes `canAct()` false and disables saving.
  Its controls live in grid cells beside/under the game (`#rdock`, `#rside`), never on top of it; the game area shrinks.

### Layout (why it is built this way)
- `#shell` is a CSS grid: `#gamecell` (holds `#app`, the whole game) + `#rside` + `#rdock` (replay only). Separate cells can't overlap.
- Inside `#app`, breakpoints are container queries on the game cell, so the game lays out for the space it actually gets.
- Floating game controls keep clear of each other through variables, not measurements: the prompt spans between
  `--zoomFoot` and `--mktFoot`; the market's own sizing code (`updateMktH`) publishes `--mktW`, tries every column count,
  and steps aside (`#mkt.cramped`, Market button opens the card view) when nothing fits.
- `test/layout.cjs` checks 11 sizes × play/replay states for off-screen or overlapping controls. Run it after UI changes.

## 7. Testing recipes

```
npm install                      # wrangler (registry access works in the sandbox)
node build.mjs && node test/engine.test.mjs
printf 'DEV_AUTH=1\n' > .dev.vars
npx wrangler dev --ip 127.0.0.1 --port 8787 &     # local Worker + DOs + D1 (state in .wrangler/)
NODE_PATH=$(npm root -g) node test/e2e.cjs        # Playwright is preinstalled globally; Chromium at /opt/pw-browsers
NODE_PATH=$(npm root -g) node test/e2e_ai.cjs     # AI seats online: rated game to the end, unrated game
NODE_PATH=$(npm root -g) node test/ai_local.cjs   # local game vs the AIs (no server needed)
NODE_PATH=$(npm root -g) node test/match.cjs      # quick match + private rooms (use a fresh --persist-to dir)
```
Performance checks used before: count rAF frames for 1.5 s while panning / sweeping the hand / moving the arrow;
target ~90 frames and worst frame ≤ 17 ms. Screenshot at 1440×900 and 390×844 (mobile, `hasTouch`) and actually look.
In the sandbox, Google Fonts are blocked, so screenshots use fallback fonts — that's expected.
Playwright can't tap elements outside the viewport when `overflow: clip` is set; tap by coordinates.

## 8. Environment quirks seen in the first session

- Outbound network is allowlisted: npm registry OK; most websites (incl. boardgamehelpers, PDFs) blocked for curl;
  WebFetch works for text pages but not images.
- GitHub access goes through a proxy that only allows repositories attached to the session. If a push is refused with
  "not in this session's authorized repository set", the owner must start a task with the repo attached.
- Workers Builds once showed "This project is disconnected from your Git account" and ignored pushes. Fix: reconnect
  the repo under Worker → Settings → Builds (and check github.com/settings/installations → Cloudflare Workers and Pages).
  After every push, confirm the deploy landed (e.g. `curl …/api/config`), not just that the push succeeded.
- The owner uses the Claude app (Cowork, web). Deliver files via the outputs folder / SendUserFile when needed.

## 9. Known gaps / next steps (roughly by value)

1. **Deploy verification**: first Workers Builds deploy relies on D1 auto-provisioning (`wrangler ≥ 4.45`, binding without
   `database_id`). If it fails in CI, have him create D1 `el-dorado` in the dashboard and add `database_id` to wrangler.jsonc.
   Then verify Google sign-in on the live URL (the only untested path).
2. More courses (see §5): transcribe the remaining tiles, then the 6 rulebook routes (needs strips O–R for two of them), then community routes.
   Also: rulebook tiebreak "if tied players have no blockades, whoever reached El Dorado first wins" is not
   implemented yet (currently a shared place).
3. Blockade costs — confirm from a photo of the tokens.
4. Online niceties not built: rematch button, in-game chat/emotes, spectator list, match history page, reconnect
   indicator per player in the HUD (presence exists in `room.seats[].online`), local-game turn timer.
5. Possible abuse vectors to keep in mind: room codes are guessable (fine for friends), names are user-chosen
   (sanitized, unique), rate limiting is minimal.
6. Accessibility: keyboard play of cards/targets is limited (Esc / Ctrl+Z only).

## 10. Style of work that went well

- Research rules before coding; say clearly what is verified vs. guessed (he explicitly checks this).
- After each substantial change: build, test, screenshot, look, fix, then ship with a 1–3 sentence summary.
- Prefer compact, dependency-free JS; no frameworks, no bundler beyond `build.mjs`.

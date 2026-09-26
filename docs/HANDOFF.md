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
- **Not yet deployed.** The owner was about to: upload the repo contents to GitHub, connect Cloudflare Workers Builds,
  create a Google OAuth client, set `GOOGLE_CLIENT_ID`. Steps are in `README.md`.
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
- Blockades between consecutive boards; first to pay keeps it. Leftover strength can pay a blockade and continue.
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
  zero-sum; updated once per game in `Room.finish()`.
- **Timer (online):** host picks 60/90/120/180 s. On expiry the server auto-ends the turn (resolves pending trash with
  nothing, discards leftovers). 3 consecutive timeouts → resign (forfeit). Any successful action resets the count.

## 5. Boards — what is real and what is reconstructed (important, owner asked about this)

- Real (from the BoardGameHelpers tile catalogue): board set **A/B** (start), double-sided **C/D, E/F, G/H, I/J, K/L, M/N**
  (a route uses one side of each physical board), **O–R** 16-space strips, 3-space **El Dorado end tile** (all jungle or
  all water), and six blockades **#1 jungle, #2 village(coin), #3 rubble, #4 water, #5 jungle, #6 rubble**.
  Each board's terrain **counts** match the catalogue exactly (e.g. C = J6 W12 M1 V9 R9).
- Reconstructed/guessed: **space-by-space layouts and space values** (the catalogue only publishes pictures), blockade
  **costs** (we use 1,1,1,1,2,2 in number order; tiebreak uses the blockade number), official suggested routes (not in),
  strips O–R (not in). Routes are generated: start board → N terrain boards (random side, rotation, winding path that
  never touches non-adjacent boards) → end tile placed against the far edge.
- If the owner provides images of the boards (BoardGameHelpers GIFs or photos), transcribe them into `BOARDS` in
  `engine_data.js`. Format: 7 rows of 4,5,6,7,6,5,4 tokens, top to bottom (radius-3 hexagon, pointy-top axial coords);
  tokens `jN` jungle, `wN` water, `vN` village/coin, `rN` rubble, `cN` base camp, `mm` mountain, `ss` start.
  The web tools in the first session could not read those images (WebFetch refuses images; the proxy blocked the host).

## 6. Architecture

### 6.1 Files
```
build.mjs                 concatenates sources → public/index.html, build/artifact.html, src/engine.gen.js
wrangler.jsonc            Worker config: assets ./public, D1 "DB", DOs ROOMS(Room) + LOBBY(Lobby), keep_vars
src/engine_data.js        CT (cards), MARKET0/RESERVE0, BLOCKADES, BOARDS, hex geometry, genMap/buildMap (seeded)
src/engine_rules.js       S/MAP globals, newGame, reach/nativeTargets/payTargets, applyAction, advance, resign,
                          endGame (placements), eloDeltas, redact
src/client/shell.html     <title>, fonts, all CSS (design tokens in :root), SVG symbol defs, DOM skeleton
src/client/ui_state.js    UI object, NET object, canAct/viewIdx/hp, computeTargets, act(), UI action builders
src/client/ui_view.js     board SVG render, pieces + animation, pan/zoom/pinch, card art/markup, card layout (fan),
                          drag + aim arrow, market/side panel, HUD/prompt/buttons, banner/toast/modal, setup,
                          rules, game-over, pile viewer
src/client/ui_online.js   api(), Google Identity Services sign-in, hub (play / leaderboard / profile),
                          lobby socket, room socket + reconnect, applyServerState, room lobby modal, timer display
src/client/ui_boot.js     wiring + startup routing (?room=CODE links, rejoin, local save resume)
src/worker.js             Worker routes, auth (Google JWT verify + HMAC session tokens), Lobby DO, Room DO
test/engine.test.mjs      60 random games: termination, card conservation, placements, zero-sum Elo, no redaction leaks
test/e2e.cjs              Playwright: 3 dev-signed-in browsers, create/join/start, moves, buys, timer, resigns, ratings
```
The browser build wraps everything in one IIFE; engine and UI share scope (`S`, `MAP`, helpers are plain globals
inside it). The server imports `E` from `engine.gen.js` and sets `E.S`/`E.MAP` before each call (safe: DO calls are
synchronous around the engine).

### 6.2 Game state `S` (JSON, v3)
`{v, seed, nMid, players[{name,color,pieces[hexKey|'done'],deck[],hand[],discard[],play[],blocks[blockadeIdx],fin(round|0),resigned(order|0)}],
cards{id:type}, nid, market[{t,n}], reserve[{t,n}], blockades[{n,k,v,conn,owner}], cur, start, round, endTriggered, over,
winners[], places[], fullRace, turn{bought, active{id,pi,sym,left}|null, pending{max}|null}, trash[], log[{p,t}], privacy, resigns,
owners[uid] (online only), room (online only)}`.
`MAP` is derived from `(nMid, seed)` by `genMap` — deterministic, never stored.

### 6.3 Actions (`applyAction(seat, a)` → `{ok, err, ev[], reveal}`)
`move{card,pi,to}` · `native{card,pi,to}` · `pay{pi,to,cards}` · `action{card}` · `trash{cards}` ·
`transmit{card,src,idx}` · `buy{src,idx,cards}` · `end{keep}`; plus `resign(seat)`.
`to` is a hex key `"q,r"` or `"B<blockadeIndex>"`. Events: `move{pl,pi,path}`, `block`, `arrive`, `draw`, `gain{t,src,idx}`,
`turn`, `over`, (server adds) `timeout`, `resign`, `undo`, `start`. `reveal=true` (cards drawn) clears undo.

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
- Market is a floating drawer (`setSide`), remembered in localStorage.
- Design: single dark theme by choice. Fonts Young Serif (display) + Figtree (UI). Tokens in `:root` of shell.html.
  Terrain colors in `TFILL`, card frames `.k-g/.k-b/.k-y/.k-x/.k-p`.

### 6.5 Server (`src/worker.js`)
HTTP: `GET /api/config` → `{google, dev}` · `POST /api/auth/google {credential}` · `POST /api/auth/dev {name}` (only with
`DEV_AUTH=1`) · `GET /api/leaderboard` · `GET/PATCH /api/me` · `POST /api/rooms {max,len,turn}` → `{code}` ·
`GET /api/rooms/:CODE/ws?t=token` (WebSocket) · `GET /api/lobby/ws?t=token` (WebSocket). Everything else = static assets.
Auth token: `uid.exp.hmac` (60 days), secret generated once and stored in D1 `settings`. Google ID tokens verified
against Google JWKS (RS256, aud = `GOOGLE_CLIENT_ID`).
D1 tables (auto-created): `users(id, google_sub, name UNIQUE NOCASE, rating, games, wins, created)`,
`matches(id, room, finished, data JSON)`, `settings(k, v)`.
Room DO (one per 5-char code, hibernatable WebSockets tagged by uid): storage keys `d` (meta: code, host, seats,
status lobby|playing|over|closed, opts{max,len,turn}, deadline, timeouts, rated, results), `S`, `undo` (≤6 snapshots).
Client→room: `join`, `leave`, `color`, `start` (host), `act{a}`, `undo`, `resign`, `"ping"`.
Room→client: `{t:'room', room}` (pre-game), `{t:'state', S(redacted), ev, seat, undo, deadline, now, room}`, `{t:'error', msg}`.
Turn timer = DO alarm at `d.deadline`. Lobby DO keeps `{code → summary}` and pushes `{t:'rooms'}` to hub sockets.
Free-tier notes: DO CPU limit 30 s/message (engine actions take <5 ms); Worker requests 100k/day (static assets free);
incoming WebSocket messages are cheap; hibernation keeps idle rooms from burning duration.

## 7. Testing recipes

```
npm install                      # wrangler (registry access works in the sandbox)
node build.mjs && node test/engine.test.mjs
printf 'DEV_AUTH=1\n' > .dev.vars
npx wrangler dev --ip 127.0.0.1 --port 8787 &     # local Worker + DOs + D1 (state in .wrangler/)
NODE_PATH=$(npm root -g) node test/e2e.cjs        # Playwright is preinstalled globally; Chromium at /opt/pw-browsers
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
- The owner uses the Claude app (Cowork, web). Deliver files via the outputs folder / SendUserFile when needed.

## 9. Known gaps / next steps (roughly by value)

1. **Deploy verification**: first Workers Builds deploy relies on D1 auto-provisioning (`wrangler ≥ 4.45`, binding without
   `database_id`). If it fails in CI, have him create D1 `el-dorado` in the dashboard and add `database_id` to wrangler.jsonc.
   Then verify Google sign-in on the live URL (the only untested path).
2. Real board layouts (see §5) — ask for images; add strips O–R and the official preset routes once data exists.
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

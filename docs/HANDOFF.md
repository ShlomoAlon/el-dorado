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

- **AI training is paused** (owner, 2026-09-29): it took the machine's CPU from everything else; the priority is a professional
  first deployment. Don't restart the training job (tools/ai supervisor) until he asks. The shipped network is first-first1-351;
  the AI ratings (AIS[].rating) are still the ones measured for first-first1-best: rerun `nice -n 10 node tools/ai/calibrate_ais.mjs 720 2`
  when the machine is free (move tools/ai/data/calibration-*.json aside first: those games used the previous network).
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
src/ai/first.bin          the shipped network (tools/ai/pack.mjs from tools/ai/models/first-first1-351.json; build copies it to public/ai/)
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
test/online.cjs           Playwright vs its own wrangler dev (test/lib.cjs startServer): rooms, redaction, undo, buy, clock, resign,
                          ratings, replay, AI rooms (rated / unrated), room lists, quick match
test/lib.cjs              shared test helpers: static server, game server, pages that collect errors, settle(), report()
test/frames.cjs           phone profile, CPU ÷4: restyle size and composited animations per interaction
test/engine.test.mjs      60 random games (--quick: 12): termination, card conservation, placements, zero-sum Elo, no redaction leaks
```
The engine holds no game: every function that needs one takes it first (`gs`), and `mapOf(gs)` gives its board (cached).
The page keeps the game on show in `state.js` (`S`, `MAP`, `setS`); the server imports the engine as `E` and passes each
room's game (`this.S`).

### 6.2 Game state `S` (never stored)
Full shape: `docs/API_SPEC.md` §1.4. `{seed, course, players[{name, color, ai?, pieces[hexKey|'done'], deck[], hand[], discard[],
play[], fin, resigned}], cards{id: type}, nid, market[{t,n}], reserve[{t,n}], blockades[{n,k,v,conn,owner}], cur, round,
endTriggered, over, places, fullRace, turn{bought, active, pending}, trash[], log[]}`.
- Derived, not stored: winners (place 1), a player's blockades (`blocksOf`), `MAP` (`buildCourse(course, seed)`).
- `S` is rebuilt from the game record (setup + secret + actions, log v3) everywhere: the local save (`eldorado-game-v2`),
  finished local games (`eldorado-games-v2`), online rooms and replays. The server never writes into `S`.
- `S.log` is the journal: the game's public events (§6.3, all but turn changes), each with its round; the History
  (`feed.js`) shows it turn by turn, newest first, with each step's words on hover. The engine keeps the last 200.

### 6.3 Actions and events (`applyAction(gs, seat, a, rnd)` → `{ok, err, ev[], reveal}`)
Full list: `docs/API_SPEC.md` §1.5–1.6. Player actions: `move{card,pi,to}` · `native{card,pi,to}` · `pay{pi,to,cards}` ·
`action{card}` · `trash{cards}` · `transmit{card,type}` · `buy{type,cards}` · `end{keep}` · `resign`; system actions (the server's
turn clock, local play's End game): `timeout`, `endgame`. `to` is a hex key `"q,r"` or `"B<blockadeIndex>"`. `rnd` is where any
shuffle comes from (a record gives each action its own generator).
Events: `play{pl,k,ts,…}` (what became public: k = move/native/rubble/camp/blr/action/trash/transmit/buy/end; `n` spaces or cards
drawn, `got`/`paid` for a card gained, `kept`/`disc` counts for end), `move{pl,pi,path}`, `block`, `arrive`, `final`, `turn`,
`timeout`, `resign`, `endgame`, `over`. The same `ev` goes to every seat online, so it names only cards that just became public
(engine.test checks this). `reveal` (cards drawn) ends what undo can take back.
Board targets (`cardTargets`, `payTargets`) say which action goes there (`t`), so the page never maps rules itself.

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
  remembered as `eldorado-mkt`) plus an "All cards" tile that opens a full-screen spread of market + reserve
  (`#allc`, `openAll`). Affordable cards are bright with a static "Can buy" tag, the rest are dimmed (owner: no pulsing — it's always on).
  The board fit leaves room under the prompt (safeRect measures it).
- Cards: suit sets frame + scene palette; strength badge uses the suit colour and icon (only coin cards are gold);
  action cards show `face` (short) text, `txt` in tooltips. Full-screen button `#fsBtn` is hidden where unsupported
  (iPhone Safari); home-screen metas make the saved web app full screen there.
- **History** (feed.js; owner, 2026-09-30: three modes, cycled by the History button in the top bar, kept on this device as
  `eldorado-hist`): **center**: the latest turn in a one-row recap under the prompt: other players' turns as they play them (cards fly in
  from the player chip or the market), then, once you act, your own turn so far (owner: center must never look like off). The row
  has one fixed height, so steps that don't fit drop out whole, never a second line; **left**: every turn in the
  journal (`S.log`), newest first, in a column of its own (`#lside`, a grid cell left of the game; full screen with a ✕ on portrait
  phones), the newest turn at the top and growing as it is played; **off**. Pointing at a step (tapping it on touch) shows its words
  (the journal's sentences, as the tooltip) and draws its explorer's path on the board. No dragging or resizing: the owner rejected the
  movable, resizable panel (turns wrapped to two lines, its height jumped mid-animation, the left snap was hard to undo).
  Landed cards have no opacity transition: the flying copy is removed the same frame the card shows (a transition made them blink).
- **Calibrated starting ratings** (`AIS[].rating`): Fawcett **1464** ±21, Humboldt **1398** ±20, Raleigh **1200**, from
  `nice -n 10 node tools/ai/calibrate_ais.mjs 720 2` (2026-09-29, network `first-first1-best`; ~20 min on 2 cores; games cached in
  tools/ai/data/calibration-<ai ids>.json, `… report` re-prints). The AIs play exactly as on the site (`aiStep`, shipped half-float
  net, First Expedition, fullRace, 30-round cap). Ratings: maximum-likelihood Elo over every pair of different AIs in the 540
  three- and four-player games (Fawcett finishes ahead of Humboldt 57%, of Raleigh 84%; Humboldt ahead of Raleigh 75%); the
  server's own sequential eloDeltas over the legal games agrees (1451 / 1381 / 1200). (The first calibration, with an earlier
  network, had Humboldt at 1530.) **Anchor: Raleigh = 1200**, the rating every new person starts with: Raleigh is the "Steady"
  level for newcomers, so a new player is assumed equal to it, and real rated games then move everyone from there. Applied by
  `ensureSchema()`: it shifts each ai-* row by (calibrated − applied) and records the applied rating in `settings`
  `ai_rating:<id>` (the first calibration is in `ai_calibration_v1`), in one conditional transaction — so AIs that already
  played keep their gains/losses, and changing `AIS[].rating` later (a new calibration, or a new AI) moves that AI by the
  difference exactly once.
- **Known problem (2 players):** in the 180 two-player calibration games the network AIs (Humboldt, Orellana) mostly failed to
  reach El Dorado within 30 rounds (88 capped; Raleigh won all 120 of its 2-player games). The network seems not to handle two
  explorers per player. Those games are left out of the ratings. Worth a look by the training side (engine_bot.js), or a
  fallback to the planner for 2-player games in `aiChoose`.

### Replays (game logs)
- Every game log is a record, `{kind:'eldorado-replay', v:3, title, course, seed, rng, fullRace, gift?, players:[{name,color,bot?}], actions:[[seat,action],…]}`
  (API_SPEC §1.8): each action draws from its own generator, `recRng(rng, i)`, so replaying the actions rebuilds the identical
  game. Tools make theirs with `recNewGame(o, fixedNumber)` and `recApply`, like the page and the server.
- `node tools/ai/record.mjs net,plan,plan [games] [seed] [--upload]` records bot games ; `FILTER=capped|netlost` keeps only those games. Bots' look-ahead has its own randomness, so it
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
node test/run.mjs --online                         # online play end to end (starts its own game server)
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

- **The Worker's clock stands still while code runs** (Cloudflare's timing-attack protection: `Date.now()` and
  `performance.now()` move on only at I/O). Never limit work by elapsed time inside one handler: `aiMove` did, the limit
  never ran out, and after a person resigned one alarm played the whole rest of the game (5 to 7 s with the network AIs),
  holding their answer (2026-09-30, found in the owner's own browser; `wrangler dev` keeps a moving clock, so the
  local tests can't show it). AI batches are counted (`AI_BATCH`); a player's answer is sent before any await that lets
  an alarm in.

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

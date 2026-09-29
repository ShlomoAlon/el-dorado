# Notes for Claude — read this first

You are continuing work on **El Dorado Expedition**, a digital edition of Reiner Knizia's board game
*The Quest for El Dorado* (base game), built for the owner, Shlomo (GitHub `ShlomoAlon`).
**Read `docs/HANDOFF.md` before your first change.** It has the history, every decision and why, the
architecture, protocols, known gaps, and how to test. This file is the short version.

## The deal with the owner
- He does **one-time setup**; after that you handle every change end to end: edit → build → test → commit → push to `main`.
  Cloudflare Workers Builds redeploys the live site automatically from `main` (~1 min). Never ask him to run commands
  for routine changes.
- He cares most about: **rules accuracy**, **a polished, smooth, non-janky UI** (high FPS, no jumps, no rough edges,
  feels purpose-built, not like Board Game Arena), and **seeing progress early** (ship working increments).
- He writes quickly and informally; infer intent generously, but ask when a decision is really his (rules variants,
  anything costing money, accounts).
- Keep replies short. Say plainly what you verified and what you could not.
- **His questions come first.** When he asks a question, stop whatever you are doing and answer it right away (from what
  you already know, or with the one quick check needed); only then resume the work. Never make him wait behind a long
  command, a build, or a test run.

## Change loop (every time)
1. Edit **sources only**:
   - rules: `src/engine_data.js` (cards, boards, map generation), `src/engine_rules.js` (state, actions, turn order, end of game, Elo, redaction), `src/engine_ai.js` (named AI players; `engine_bot.js` belongs to the AI training code)
   - page: `src/client/shell.html` (markup + CSS) and the ES modules in `src/client/` (bundled by esbuild; map in
     `docs/FRONTEND_REFACTOR.md`): `state.js` (UI/NET/G), `actions.js` (`act()`, modes, targets), `frame.js` (render loop),
     `geometry.js`, `board/*` (terrain, camera, overlays, pieces), `hand.js`, `aim.js`, `market.js`, `hud.js`, `feed.js`,
     `dialogs.js`, `menu.js`, `online.js`, `replay.js`, `main.js` (boot)
   - server: `src/worker.js`
2. `node build.mjs` → regenerates `public/index.html`, `public/app.<hash>.js/.css`, `src/engine.gen.js`, `build/artifact.html` (all committed; never hand-edit them).
   The site's `index.html` must stay under ~14 KB compressed (one TCP round trip): the start screen's markup + CSS only
   (shell.html's first `<style>`); game CSS goes in the `<style data-late>` block, which becomes the cached app.css.
3. `node test/run.mjs` → must print `all ok` (~45 s: build, import lint, engine quick tier, layout at 5 sizes, a game played
   with real clicks and drags, the worker bundle, frame costs on a throttled phone). Server or online changes: add `--online`
   (online play end to end, against a local game server the test starts itself: nothing to set up). Board, layout or engine
   changes: `--full` (all 60 engine games + AI on every course, 11 layout sizes, online, board rendering).
   (The worker bundle check matters: Cloudflare's bundler rejects some things Node accepts; a failed bundle never deploys.)
4. UI changes: load `public/index.html` in Playwright (Chromium is preinstalled; `NODE_PATH=$(npm root -g)`), take screenshots, look at them, check for page errors.
5. Commit (clear message + the attribution lines your environment asks for) and `git push origin main`.
6. Tell him in 1–3 sentences what changed and that it's deploying.

## Design tokens
- UI values (colours, type sizes, radii, space, control heights) come from the tokens in `shell.html` `:root`; read
  `docs/DESIGN.md` (the tokens and a short "never" list: no raw hex, no px font sizes, no inline styles, no Unicode icons) before adding UI.

## Libraries (owner's rule)
- Use a library when it solves a genuinely difficult problem (e.g. robust pan/zoom across wheel, trackpad and touch)
  and has a strong reputation / wide use for exactly that job. Its size doesn't matter (smaller is better).
  Never add one for simple things. Vendor it into the build (the client is one self-contained page).

## Hard invariants
- **All rules live in the engine.** The client builds an action and calls `act(a)`; locally that runs `applyAction`,
  online it is sent to the Room Durable Object, which runs the same engine and broadcasts `redact()`ed state.
  Never put rules logic in UI code or the worker.
- The server is authoritative online: validate everything in `applyAction`; never trust client state.
- `redact(S, seat)` must never expose other players' hands, deck contents, or anyone's deck order.
- `S` is never stored: saved games (`eldorado-game-v2`), finished local games and online replays are game records
  (setup + actions, log v3): they are replayed through the engine. A rules change that old records can't replay bumps the log
  version, and old games are dropped (owner, 2026-09-29: no compatibility code for old games yet; deleting old replays is fine).
- New/renamed Durable Object classes need a new `migrations` entry in `wrangler.jsonc` (never edit old tags).
- D1 tables are created in `ensureSchema()` (worker.js); add columns with `ALTER TABLE` in try/catch, never drop data.
- `GOOGLE_CLIENT_ID` (public OAuth client ID) is in `wrangler.jsonc` `vars`; its authorized JavaScript origin is
  `https://el-dorado.shlomoalon9.workers.dev` (add any new domain in Google Cloud Console → Clients). The client secret is not used.
- Only animate `transform`/`opacity`; keep pan/zoom, card fan and arrow at 60 fps (measure with a rAF counter).
  Measure with `NODE_PATH=$(npm root -g) node test/perf.cjs --trace` (frame times + where the time goes). No `backdrop-filter`
  on anything over the board (re-blurred every frame it moves); no infinite animations on SVG board elements (repaint the board).
  Prefer the standard, well-trodden way; if it's slow, find out why and fix the cause (or tell the owner) instead of adding workarounds.
  Board rendering changes must also pass `NODE_PATH=$(npm root -g) node test/render.cjs` (grab changes nothing, sharp after zoom, wheel latency).
  Pan/zoom is Leaflet-style (researched; owner approved 2026-09-27): #stage is permanently `will-change: transform`,
  gestures only change its transform, and once zooming stops the scale is baked into #bscale (one sharp redraw);
  board text is HTML (#blabels*), wheel deltas normalised as d3-zoom, Safari pinch via gesture events.
  The brief blur while zooming in, before the bake, is accepted by the owner — don't trade smoothness for it.
- View code (docs/FRONTEND_REFACTOR.md): anything that changes state calls `render()`; each view part updates in the next frame
  and writes only what changed. Never read layout while updating (sizes come from `geometry.js`; measuring after an update
  goes in `after()`). Never set a CSS variable on `#app` or use `:has()` on it at runtime: either restyles all ~3,800 board
  elements (set it on the element that uses it). `test/frames.cjs` checks this.
- Respect `prefers-reduced-motion`. Keep it working at 390 px wide (phone) and 1440 px.
- Menus (start screen, Online, room lobby, Replays) are one native `<dialog id="menu">` in shell.html: every screen is
  written there once and shown with `hidden`; choices are native radios/selects/checkboxes (the browser keeps their state,
  tabs are CSS `:has()`); menu.js only reads them and fills data boxes (via setHTML, which skips unchanged content).
  Never rebuild a screen's HTML on a click, and never put `backdrop-filter` behind it (owner: no flicker, a click changes
  only what it's about).
- Layout: page = CSS grid (`#shell`): the game cell (`#gamecell` > `#app`) plus replay dock/side cells. Never float new UI over
  other controls; give it its own cell or its own clearance variable (`--mktFoot`, `--zoomFoot`). Game-area breakpoints are
  `@container game (…)` queries (the game area can be narrower than the window); only things outside `#app` use `@media`.

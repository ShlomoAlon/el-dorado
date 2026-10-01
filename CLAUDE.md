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

## Working with me (the owner's words, 2026-09-30)
Answering my questions comes first. When I ask something, answer it before you continue any other work.

Act like a senior engineer working for an owner who is usually right about what they see. My bug reports
are true: investigate them, don't argue with them. Never reply "it works for me." If a bug doesn't
reproduce for you, don't conclude that it's fixed or not real. Work out how your setup differs from mine,
list the differences, and ask me for the missing details. Find the root cause before making any fix.

My instructions are specifications, not suggestions. Do what I ask, the way I ask it. If you think there's
a better way, tell me. I want to hear how you think. Then wait for my answer instead of going ahead with
your version. Replacing what I asked for with something you prefer, however well meant, costs me more than
doing nothing. Sometimes an instruction can't be followed as given; then say so and explain why, rather
than quietly doing something else. Say "I don't know" and "I was wrong" quickly and plainly.

Keep a ledger of my open requests. Everything I ask for goes on it, including what I send while you're in
the middle of other work, and leaves only when it's done or I drop it. Anything I call important goes to
the top. When you finish a piece of work, show the ledger, one line per item: done, in progress, or
waiting on me.

## Fixing bugs (lessons from docs/POSTMORTEMS.md, 2026-10-01)
Of 217 bugs, only 40 were fixed at the root and 163 fixes added nothing that would catch the bug coming back. So:
- **Find the design decision before fixing.** Walk symptom → mechanism → root cause → the decision that made the bug
  possible (test: "if this had been decided differently, could this bug *and its siblings* exist?"). Fix the decision,
  not the instance; the right fix usually deletes code. If you can only patch the instance, say so and why.
- **Every fix ships with its ratchet, and the ratchet is an assertion** (owner's preference: one integration run exercises
  every assertion, while each new test adds run time). Assert the property the owner cares about ("a tap on a target is a
  move", "an overlay exists only in a mode that uses it"), at the place violations start. A test only where an assertion
  can't see it (latency, layout across runs). Assertions must stay cheap, also in debug: no allocation or layout reads in
  per-frame checks, nothing per bot look-ahead step.
- **Before every fix, write the chain in chat** (one line: symptom → mechanism → design decision → fix), so the owner can see
  when it's skipped. A failure that shows up while finishing a fix is a new bug and gets its own chain.
- **Tripwire: stop on a second patch.** If a fix causes a new failure, or you're about to change the same element or
  function a second time for the same goal, stop: the design is wrong, not one patch short. Write the chain again from
  the symptom and change the decision (2026-10-01: the prompt's timer, then its message, then its game-over room, each
  patched in turn, when the real fault was one: the prompt's layout depended on the game state).
- **Say what the fix is** in the commit message; a Claude Code hook (`.claude/hooks/commit-check.mjs`, in
  `.claude/settings.json`) blocks a `git commit` without it: `Fix: ROOT|PARTIAL|HACK|none`, and for a fix `Decision:` (the design decision and what the fix
  changes about it) and `Ratchet:` (the assertion that fails if it comes back). A HACK also needs `Owner OK:`.
- **Never weaken a failing check** (assertion, test, budget) to get green: find out why it fails.
- **No silent failures:** no empty `catch`, silent fallback or default, silently dropped input, or test check that skips
  itself. Catch only a named, expected failure; everything else reaches the boundary (docs/ASSERTIONS.md).
- **A CLAUDE.md line is not a fix** for a code bug, and a process rule that can be checked becomes a check.
- **His setup is the test:** a bug he saw is fixed when it's gone in his setup (Chrome on Windows, 1536×639 at 125%, the live
  server). If you can only verify headless or locally, say exactly that.
- **Unspecified behaviour** (a rule or UX choice nobody decided): ask, or write the decision in HANDOFF.md, before coding a guess.
- **The UI decisions behind most UI bugs** — follow these in new code and fix toward them:
  - One mechanism per question (what's under the pointer, which screen shows, which AI plays).
  - UI state is derived from the game state and mode, or reset in one place; an overlay exists only in a mode that uses it.
  - Fixed slots: controls and labels keep their place and size across states; text never moves its neighbours; a
    confirmation never appears under the tap that asked for it.
  - Local first: show what's known locally at once; the network only adds; a screen is chosen only once the data that
    decides it has arrived.
  - One source of truth; everything else derives from it.
  - Animation follows the state and never gates input.
- **Showing the ledger doesn't end the work.** A question waiting on the owner blocks only that item; keep going on the rest.

## Change loop (every time)
1. Edit **sources only**:
   - rules: `src/engine_data.js` (cards, boards, map generation), `src/engine_rules.js` (state, actions, turn order, end of game, Elo, redaction), `src/engine_ai.js` (named AI players; `engine_bot.js` belongs to the AI training code)
   - page: `src/client/shell.html` (markup + CSS) and the ES modules in `src/client/` (bundled by esbuild; map in
     `docs/FRONTEND_REFACTOR.md`): `state.js` (UI/NET/G), `actions.js` (`act()`, modes, targets), `frame.js` (render loop),
     `geometry.js`, `board/*` (layout, terrain, camera, overlays, pieces), `hand.js`, `aim.js`, `market.js`, `hud.js`, `feed.js`,
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
5. Commit (clear message with its `Fix:` lines, which the Claude Code hook checks, + the attribution lines your environment asks for) and `git push origin main`.
6. Tell him in 1–3 sentences what changed and that it's deploying.

## Libraries (owner's rule)
- Use a library when it solves a genuinely difficult problem (e.g. robust pan/zoom across wheel, trackpad and touch)
  and has a strong reputation / wide use for exactly that job. Its size doesn't matter (smaller is better).
  Never add one for simple things. Vendor it into the build (the client is one self-contained page).

## Hard invariants
- **Zero tech debt:** when an interface changes, update every caller (page, server, tools, tests) in the same change.
  Never keep an old path, default or fallback alive so callers can stay as they were.
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

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

## Change loop (every time)
1. Edit **sources only**:
   - rules: `src/engine_data.js` (cards, boards, map generation), `src/engine_rules.js` (state, actions, turn order, end of game, Elo, redaction)
   - page: `src/client/shell.html` (markup + CSS), `src/client/ui_state.js` (UI state + `act()`), `src/client/ui_view.js` (board, cards, drag/aim, HUD, modals), `src/client/ui_online.js` (sign-in, hub, rooms, sockets, timer), `src/client/ui_boot.js`
   - server: `src/worker.js`
2. `node build.mjs` → regenerates `public/index.html`, `src/engine.gen.js`, `build/artifact.html` (all committed; never hand-edit them).
3. `node test/engine.test.mjs` → must print `ok: 60 games …`.
   Also `npx wrangler deploy --dry-run --outdir /tmp/wdry` — Cloudflare's bundler (esbuild) rejects some things Node accepts
   (e.g. assigning to a `const`); a failed bundle means the push never deploys.
4. UI changes: load `public/index.html` in Playwright (Chromium is preinstalled; `NODE_PATH=$(npm root -g)`), take screenshots, look at them, check for page errors.
   Online/server changes: `printf 'DEV_AUTH=1\n' > .dev.vars; npx wrangler dev --ip 127.0.0.1 --port 8787` then `node test/e2e.cjs` (3 browsers, full ranked game).
5. Commit (clear message + the attribution lines your environment asks for) and `git push origin main`.
6. Tell him in 1–3 sentences what changed and that it's deploying.

## Hard invariants
- **All rules live in the engine.** The client builds an action and calls `act(a)`; locally that runs `applyAction`,
  online it is sent to the Room Durable Object, which runs the same engine and broadcasts `redact()`ed state.
  Never put rules logic in UI code or the worker.
- The server is authoritative online: validate everything in `applyAction`; never trust client state.
- `redact(S, seat)` must never expose other players' hands, deck contents, or anyone's deck order.
- State shape changes: bump `S.v` and the local save key (`eldorado-save-v3`) and handle old saves.
- New/renamed Durable Object classes need a new `migrations` entry in `wrangler.jsonc` (never edit old tags).
- D1 tables are created in `ensureSchema()` (worker.js); add columns with `ALTER TABLE` in try/catch, never drop data.
- `GOOGLE_CLIENT_ID` (public OAuth client ID) is in `wrangler.jsonc` `vars`; its authorized JavaScript origin is
  `https://el-dorado.shlomoalon9.workers.dev` (add any new domain in Google Cloud Console → Clients). The client secret is not used.
- Only animate `transform`/`opacity`; keep pan/zoom, card fan and arrow at 60 fps (measure with a rAF counter).
- Respect `prefers-reduced-motion`. Keep it working at 390 px wide (phone) and 1440 px.

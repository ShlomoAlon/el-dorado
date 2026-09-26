# El Dorado Expedition

A digital edition of Reiner Knizia's *The Quest for El Dorado* (unofficial fan build): local pass-and-play, plus ranked online games with Google sign-in, Elo ratings, a leaderboard, turn timers and any number of simultaneous rooms.

Everything runs on Cloudflare's free tier and deploys automatically from this GitHub repo.

## How it's built

| Piece | Where | What it does |
|---|---|---|
| Game page | `public/index.html` (built from `src/client/*` + the engine) | Board, cards, local play, online UI |
| Rules engine | `src/engine_data.js`, `src/engine_rules.js` | Pure game logic, shared by the page and the server |
| Server | `src/worker.js` | Worker (API + static files), `Room` Durable Object per game, `Lobby` Durable Object for the room list |
| Database | Cloudflare D1 (`DB`) | Players, ratings, match history. Tables are created automatically |

Deep notes for maintainers (and future Claude sessions): `CLAUDE.md` and `docs/HANDOFF.md`.

`node build.mjs` regenerates `public/index.html`, `src/engine.gen.js` and `build/artifact.html`. The generated files are committed.

## One-time setup (about 20 minutes)

### 1. GitHub
Create a repository (for example `el-dorado`) and put these files in it (or let Claude push them).

### 2. Cloudflare (hosting, free)
1. Sign up at <https://dash.cloudflare.com/sign-up>.
2. **Workers & Pages → Create → Import a repository**. Connect GitHub and pick the repo.
3. Build settings: **Build command** `node build.mjs`, **Deploy command** `npx wrangler deploy`. Save and Deploy.
4. When it finishes, note your address, e.g. `https://el-dorado.<your-name>.workers.dev`.

The first deploy creates the D1 database and the Durable Objects automatically.
From then on **every push to `main` redeploys the site in about a minute.**

### 3. Google sign-in (free)
1. Open <https://console.cloud.google.com/>, create a project.
2. **APIs & Services → OAuth consent screen**: External, app name "El Dorado", your email. Then **Publish app** (so it isn't limited to test users). Only basic profile scopes are used, so no review is needed.
3. **Credentials → Create credentials → OAuth client ID → Web application**. Under **Authorized JavaScript origins** add your workers.dev address from step 2.4. Create, and copy the **Client ID**.
4. Put the Client ID in `wrangler.jsonc` under `vars.GOOGLE_CLIENT_ID` and push (it's public; the client secret isn't used).

### 4. Let Claude make changes
Connect this repository to Claude (Claude Code on the web / GitHub app) so future sessions can push to it. After that, ask for a change; Claude edits, runs the tests, pushes, and Cloudflare deploys it.

## Local development
```
npm install
npm run dev        # http://127.0.0.1:8787 with a developer sign-in (DEV_AUTH=1 from .dev.vars)
npm test           # rules engine: 60 random games + invariants
```
`test/e2e.cjs` drives three browsers through a full online game against `npm run dev` (needs Playwright).

## Rules notes
- Games use fixed courses (currently the rulebook's first-game route); blockades are dealt at random.
- Online games (and local games by default) continue until all but one player reaches El Dorado; players arriving in the same round are split by blockades. Local games can use the official "first arrival" ending instead.
- Ratings: pairwise multiplayer Elo from the finishing order, start 1200, K = 32 split across opponents (48 for a player's first 10 games).
- Turn timer: 60 s to 3 min per turn (host's choice). A timeout ends the turn and discards leftovers; 3 timeouts in a row forfeit.
- Leaving a game places you below everyone still racing.
- Terrain boards use the base game's letters and published terrain counts; space-by-space layouts are reconstructed.

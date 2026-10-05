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

## Fixing bugs (lessons from docs/POSTMORTEMS.md; process agreed with the owner, 2026-10-01)
Of 217 bugs, only 40 were fixed at the root and 163 fixes added nothing that would catch the bug coming back. Assertions
are the ratchet we prefer (owner: one integration run exercises every assertion, while each new test adds run time;
assertions scale, tests get slow), and an assertion is only a ratchet if an integration test reaches it.

### When a bug is reported
Fix nothing before step 5: first make sure our checks would catch the bug, then find the cause.
1. **Take it as true and log it.** Put it on the ledger, answer any question in the report first, never argue with it or
   say "it works for me".
2. **Name the assertion that should have fired, and prove it fires.**
   - **The property:** it states what the owner cares about, at the level of the bug's whole class, not its instance
     ("nothing moves without an animation or a direct action", "a tap on a target is a move", "an overlay exists only in
     a mode that uses it", not "the buy step isn't 13 px lower"). Put it where violations start. A good assertion
     catches bugs we haven't seen yet.
   - **If none exists, write it.** It must stay cheap, also in debug: no layout reads or allocation in per-frame checks,
     nothing per bot look-ahead step.
   - **If the honest version is too expensive,** make it sampled: it runs on a fraction of calls or frames (e.g. 1 in 30),
     so the cost stays small and repeated play still catches the bug. Sometimes that's the only option; a check too
     expensive to run at all is not an option.
   - **Prove it fires:** an integration test must reach the bug's state and fail on the shipped code. An assertion no run
     reaches is not a ratchet. (A test instead of an assertion only where an assertion can't see it: latency, layout
     across runs.)
3. **Find out how it shipped, before looking for the cause.** If an assertion already covered it, why did no run trip it?
   - **Not reached:** no integration test gets to that state, or not the way a player does (set up all at once instead
     of step by step, another pace, screen size, deal, mode, local vs online).
   - **Excused:** the run reached it but the assertion let it off (an input window, a declared layout change, "not in play").
   - **Not counted:** the harness didn't see the failure (a test page opened without `openPage`, which counts failed
     assertions).
   - **Not running there:** the assertion is off where the bug happened (the owner's browser). Assertions in the owner's
     browser report to the server instead of staying silent.
   - **The gap is a design decision too** (next section): name it, say why it's a mistake in itself, and **list its
     siblings**: the other states and assertions the same gap leaves unreached. They go on the ledger, to be covered over
     time (2026-10-01: "Stop moving" was cut off and no test ever showed it; nor did any test reach the buy reminder,
     keeping no cards, the removal choice, the Transmitter, base camps from the hand, or pass-and-play).
4. **Close the coverage gap in general, not for this one scenario.** "General" means along the coverage axis (the states
   the tests don't reach, and every assertion those states hide), not along the bug's axis (all labels like this one).
   Extend the integration tests so they reach that kind of state the way a player meets it: a scripted test of that
   behaviour, or whole games played through the real UI (one source of coverage, not the only one); the point is that
   the assertions throughout the code get run, even where a test checks no expected outcome itself. A check that passes
   without reaching the state (run at startup, over a table) may be added too, but **never counts as closing the gap**.
   Run it on the shipped code: **it must fail.** If it passes, coverage still doesn't reach the bug: back to step 3.
5. **Only now, find and fix the cause.**
   - **Find the design decision** (next section) and say why it was a mistake in itself. Fix the decision, not the
     instance; the right fix usually deletes code. If you can only patch the instance, say so and why (a PARTIAL).
   - **Write the chain in chat before editing** (one line: symptom → mechanism → design decision → fix), so the owner can
     see when it's skipped. A failure that shows up while finishing a fix is a new bug, with its own chain and its own
     pass through steps 2–4.
   - **Tripwire: stop on a second patch** (commit check Q15). If a fix causes a new failure, or you're about to change the same element or
     function a second time for the same goal, stop: the design is wrong, not one patch short. Write the chain again from
     the symptom (2026-10-01: the prompt's timer, then its message, then its game-over room, each patched in turn, when
     the real fault was one: the prompt's layout depended on the game state).
   - **Never weaken a failing check** (assertion, test, budget) to get green: find out why it fails.
   - **No silent failures:** no empty `catch`, silent fallback or default, silently dropped input, or test check that
     skips itself. Catch only a named, expected failure; everything else reaches the boundary (docs/ASSERTIONS.md).
   - **Unspecified behaviour** (a rule or UX choice nobody decided): ask, or write the decision in HANDOFF.md, before
     coding a guess.
   - Follow the UI decisions below.
6. **Add the assertion the root cause suggests.** Once the decision is known, what property did it violate? Often broader
   than step 2's ("every recap step is one height" behind "nothing moves"). Add it, cheap or sampled as in step 2, with a
   test that fires it on the code before the fix.
7. **Prove the fix.** The coverage from steps 4 and 6 turns green and the full suite passes, every exit code checked (never
   trusted through a pipe). **His setup is the test:** a bug he saw is fixed when it's gone in his setup (Chrome on
   Windows, 1536×639 at 125%, the live server): screenshots or a real play-through at that size, and say plainly what
   you could not verify (headless only, local only).
8. **Commit, ship, report.** One bug per commit. The message answers the questions in `.claude/bugfix-commit.md`, each
   question word for word with its answer under it (a non-fix commit, `Fix: none`, answers why it isn't one). The commit
   check (`.claude/hooks/commit-check.mjs`, both a Claude Code hook in `.claude/settings.json` and git's commit-msg hook
   in `.githooks/`, installed by `node build.mjs`) refuses a message without them, a Q2 that isn't "Yes", a quoted
   assertion that isn't in the code, and a "none" without "WARNING WARNING WARNING:" and its reason (only when an
   assertion or test is truly impossible: say why, and tell the owner). Work in progress goes to the session branch with
   a title starting "WIP"; git's pre-push hook refuses it on `main`. Push to `main`, check the live site serves the new
   build, and tell the owner briefly: how it shipped, the assertion, the coverage gap closed, the fix; then the ledger.

### What a design decision is
Four levels; only the last is worth fixing:

| Level | The question | Example: the recap jump (2026-10-01) |
|---|---|---|
| Symptom | What did the owner see? | The recap's cards jump down when a turn grows long. |
| Mechanism | What did the code do, step by step? | A captioned step joined a line of uncaptioned ones; the line grew 13 px and the steps at its bottom moved. |
| Root cause | Which specific condition made that happen? | An empty caption takes no height, so steps differ in height. |
| Design decision | Which choice about structure made that condition possible? | Each step's size follows what it happens to contain at the moment (a caption or none). |
| Why it's a mistake | What principle does it break, true even if this bug had never happened? | Content changes all through play; the frame it sits in shouldn't. When size follows content, every change of content is a change of layout, so whatever is placed relative to it moves whenever the data changes: the layout becomes a function of the game's data instead of the UI's slots. The space an element needs should be decided once, by the slot it fills (a caption line exists whether or not there's a caption), and content only fills it. The same choice explains the sold-out slot 2 px bigger than a card and the prompt's message pushing the cards down when it wrapped. |

**A design decision is a choice about how the code is structured, not a line of code**: a rule somebody chose, or fell
into by default, about things like these (for example; the list isn't complete): sizes (what decides an element's size
or place), identity (how things are matched up and kept), ownership (where state lives, who may change it), timing (when
things are judged), failure (what may fail silently), coverage (what the tests reach), specification (what was never decided).

**Naming the decision isn't enough: say why it was a mistake in itself**, the principle it breaks, so it would be wrong
even if this bug had never happened. "It caused the bug" is not the reason; the reason is what makes the choice bad, and
it predicts the siblings. More examples:
- *Blockades keyed by the deal.* A cache key should be exactly what the cached thing depends on: keyed by anything broader
  (the deal) it throws away work whenever that changes though the content didn't; by anything narrower it shows stale
  content. Sibling: the board keyed by its blockades instead of its terrain (redrew identical terrain).
- *Tests take whatever the random deal gives.* A test then decides what it proves by luck: a check that runs only when the
  dice allow proves nothing on the runs where it doesn't, and passes anyway. Siblings: the online undo check, both buy checks.
- *Test pages opened by hand.* "What counts as a failure" was decided in each test instead of in one place, so any test
  that forgets it is silently weaker than the rest. Siblings: layout, frames and render all ignored failed assertions.
- *Integration tests are a few hand-written paths, and what they reach was never measured.* An assertion protects only
  the states it is evaluated in; when nobody knows which states the runs reach, every assertion's protection is unknown
  and a green suite says nothing about the states it never visits. Siblings: every mode no path happened to include
  (a card with movement left, the buy reminder, keeping no cards, the removal choice, the Transmitter, pass-and-play).

**How to find it:** keep asking "why was that possible?" until the answer is a choice, not a line ("the buy step moved" →
"its line grew" → "steps have different heights" → "an empty caption takes no space": the choice). If an answer is "a
typo" or "a mistake", ask why nothing caught it: the decision is then in the checks ("lint ignores undeclared names").
**How to check you found it:** if this had been decided differently, could this bug *and its siblings* exist? Name the
siblings (other places the same choice causes, or will cause, the same kind of bug). If you can't name one, you've
probably found the instance, not the decision.

### ROOT, PARTIAL, HACK
Every fix is exactly one; the commit says which.
- **ROOT: the decision itself changed, so this class of bug can't come back.** The siblings are fixed too, or made
  impossible. It usually removes code (a special case, a second copy of the state, a redraw path, a reset someone had to
  remember). Its ratchet asserts the class property, which any sibling would trip too ("every recap step is one height",
  "nothing moves without an animation"). Examples: captions keep their line when empty, plus the one-height assertion;
  blockades keyed by what each draws, so no deal change can redraw an unchanged one; lint declares the browser's globals
  and rejects every other undeclared name, so no renamed variable can become a silent global.
- **PARTIAL: this instance fixed properly, but the decision stands.** Only when you are certain no root fix exists (the
  commit check's Q14; owner, 2026-10-02): if one exists, do it. The fix is honest, but other instances of the same
  choice remain and can bite later. The commit says what remains and why it wasn't changed (too big for now, needs the
  owner, out of scope). Example: swapping the Undo and Cancel slots; Undo no longer stands alone beside a hole, but
  Cancel now does while paying, because the grid still reserves both.
- **HACK: the symptom hidden, the cause untouched.** The bug is still there, just not visible, or suppressed for now.
  Telltale signs: a delay or timeout to make an ordering problem go away; `overflow: hidden` to hide something too big;
  a special case for one id, card or screen size; a `catch` that drops the error; excusing a check (`expectLayout()` to
  excuse a jump); loosening a budget or test until it passes; a reset someone has to remember to call. Example: the old
  recap row clipped to one line, so a long turn's oldest steps vanished without a sign: still too small, it just stopped
  showing it. **A HACK needs the owner's OK first** (`Owner OK:`), and goes on the list to be fixed at the root.
- **When unsure between two, pick the lower one** (PARTIAL rather than ROOT, HACK rather than PARTIAL) and say why: calling
  a PARTIAL a ROOT hides work that's still owed.

### The UI decisions behind most UI bugs
Follow these in new code and fix toward them:
- One mechanism per question (what's under the pointer, which screen shows, which AI plays).
- UI state is derived from the game state and mode, or reset in one place; an overlay exists only in a mode that uses it.
- Fixed slots: controls and labels keep their place and size across states; text never moves its neighbours; a
  confirmation never appears under the tap that asked for it.
- Local first: show what's known locally at once; the network only adds; a screen is chosen only once the data that
  decides it has arrived.
- One source of truth; everything else derives from it.
- The theme (shell.html's first `:root`): every colour, font, type size, corner, shadow, control height and menu motion of
  the interface is one of its tokens, nothing written in place (owner, 2026-10-04; `test/theme.mjs`). Not themed yet: the
  board, explorers and cards (listed in the check). A new kind of value goes into the theme first.
- Animation follows the state and never gates input.

### Also
- **A CLAUDE.md line is not a fix** for a code bug, and a process rule that can be checked becomes a check.
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
3. `node test/run.mjs` → must print `all ok` (~45 s: build, import lint, engine quick tier, layout at 6 sizes (the owner's 1536×639 at 125% among them), a game played
   with real clicks and drags, three whole games played through the UI by an AI (test/play.cjs: coverage for every assertion), the worker bundle, frame costs on a throttled phone). Server or online changes: add `--online`
   (online play end to end, against a local game server the test starts itself: nothing to set up). Board, layout or engine
   changes: `--full` (all 60 engine games + AI on every course, 12 layout sizes, online, board rendering).
   (The worker bundle check matters: Cloudflare's bundler rejects some things Node accepts; a failed bundle never deploys.)
4. UI changes: load `public/index.html` in Playwright (Chromium is preinstalled; `NODE_PATH=$(npm root -g)`), take screenshots, look at them, check for page errors.
5. Commit (one bug per commit, the message answering `.claude/bugfix-commit.md` ("Fixing bugs" step 8), which the commit check enforces, + the attribution lines your environment asks for) and `git push origin main`.
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
  Pan/zoom (owner, 2026-10-04, replacing the permanent will-change of 2026-09-27): the terrain is baked once into tiled
  canvases at three densities (terrain.js), which a zoom only stretches, like a photo; #stage has no will-change, so the small
  live layers (explorers, labels, overlays) are drawn again at each zoom by Chrome's own rules; gestures only change #stage's
  transform, and once zooming stops the scale is baked into #bscale;
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

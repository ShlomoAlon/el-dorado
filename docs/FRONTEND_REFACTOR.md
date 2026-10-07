# Front-end structure

The page is a set of ES modules in `src/client/`, bundled by esbuild (`node build.mjs`) into one hashed script.
The rules engine (`src/engine_*.js`) is imported from `src/engine.gen.js`, which exports every engine name.

## The update loop

- State lives in three places: the engine's `S` / `MAP` (the game), `UI` (what the player has selected: `state.js`),
  and `NET` (the online connection).
- Anything that changes state calls `render()` (`frame.js`). It asks for one animation frame; in that frame every view
  part runs its `update()`.
- A part compares what it would show with what it showed last time and returns at once when nothing changed. It only
  touches its own DOM region.
- **No layout reads during updates.** Sizes and positions come from `geometry.js`, which measures in ResizeObserver
  callbacks, where reading is free.
  - Code that must measure after an update (a card flying to its new spot) uses `after(fn)`: it runs once all parts
    have written.
- Nothing in an update saves the game or starts the AI. That happens once, where the state changed (`actions.js`).

## Animation

- Moving things are animated with `transform` / `opacity` only, using CSS transitions or the Web Animations API. The
  compositor runs them, so a busy main thread can't stall them.
- Explorers are HTML elements over the board (`board/pieces.js`). A move is two Web Animations:
  - the piece slides space to space;
  - the figure hops once per space above its shadow.

## Modules

| module | owns |
|---|---|
| `main.js` | boot, keyboard, debug hooks (`window.__ED`) |
| `boundary.js` | the page's boundary for bugs: logs, reports (`/api/bugs`) and recovers after a failed assertion (docs/ASSERTIONS.md) |
| `debug.js` | the diagnostics log (always kept; shown with `?debug`) |
| `state.js` | `UI`, `NET`, `G` (record, replay), selectors (`cur`, `canAct`, …), local save |
| `frame.js` | `render()`, `flush()`, `after()`, view parts |
| `geometry.js` | cached sizes of the game area, piles, prompt, market |
| `actions.js` | turning clicks into engine actions (`act`), modes, targets, events |
| `ai.js` | local AI seats |
| `board/layout.js` | where the board is drawn: each space's centre, the city, the bounds (the engine's map is topology only) |
| `board/terrain.js` | the static board (SVG + HTML labels) |
| `board/camera.js` | pan / zoom / fit |
| `board/overlays.js` | targets, blockades, hover path and tip, rubble pips, trails |
| `board/pieces.js` | explorers and their moves |
| `hand.js` | cards in hand and in play, piles, card drag, aim arrow |
| `hud.js` | player chips, prompt, turn buttons, timer |
| `feed.js` | the History: the recap row under the prompt, the column of every turn, a step's words and path, trails |
| `market.js` | market strip, All cards, purchase slot, market drag |
| `dialogs.js` | banner, toast, modals (rules, results, piles) |
| `cards.js`, `art.js`, `meeple.js` | card faces and art, explorer figures |
| `sound.js`, `menu.js`, `online.js`, `replay.js` | as named |

## Tests

| command | covers | time |
|---|---|---|
| `node test/run.mjs` | build, engine quick tier, UI checks (layout at 5 sizes, local game flows, animation frames) | about 1 min |
| `node test/run.mjs --full` | adds engine full tier (60 games, AI games), layout at 11 sizes, render, e2e (needs `wrangler dev`) | several min |

## Menu workflows (menu.js; tested by test/menus.cjs and test/online.cjs)

- Three tabs (owner, 2026-10-07: the old menu, with the night's improvements): **This device** (setup, the screen the menu
  opens on), **Online**, **Settings** (sound, full screen, the buy reminder, and **Replays**, a screen of its own with
  ‹ Settings at its top; Esc goes back too).
- During a game ("if you're in a game, you're in a game"): the same menu with the game's bar on top (Continue, End game for
  a game on this device, Resign), and everything that would start or join another greyed and locked (`fieldset.lock`
  disabled, #menu.ingame): the New game form and Start, Online, Replays. Settings stays. Esc or the backdrop is Continue.
  `menuOpen` asserts no Replays during a game; `gameOn()`: a local or online game in progress, or the server's `NET.active`
  (an online game of this player's not joined in this page yet, which Continue joins).
- Coming back is instant (local first): each save stores what the bar shows (`eldorado-menu`: round, Resign's label, whose
  view is shown; state.js save, gameHead), and this device remembers the online game it races in (`eldorado-active`); the
  page's first script, right after the menu's top, shows the bar and greys the rest before the app has loaded. The app
  then writes the same; a bar that comes or goes because a game began, ended or the server corrected the memory is a
  declared change. A room link still opens the room.
- The room lobby has no tabs: **Leave** (or Close room, for the host) is the way out. Signing out leaves any room.
- Data from the server fills slots that are always there (the account line, the room lists, a full room's note): the
  layout-shift check judges the menu at all times, excused only by input or `expectMenu()` (another screen, the menu
  opened, the window resized, the game bar coming or going).
- A replay returns to the screen it was opened from (Replays, Online), or to the game's menu if a game is in progress.
- What must stay in sight stays pinned when a screen scrolls (owner, 2026-10-06): the menu's top (`#mtop`: the account
  line, the game's bar, the tabs) sticks to the top, each screen's main action (`.mrow`) to the foot; in a room the room's
  own header is pinned instead. A line marks either edge only while content runs on under it (`#mform.scrolled`, `.more`),
  so a screen that fits shows no bars. menuEdges asserts the pinned parts are in sight after every scroll; menus.cjs
  scrolls each screen through at the owner's size and on phones.

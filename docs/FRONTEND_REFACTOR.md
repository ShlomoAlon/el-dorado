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

- The main menu (owner, 2026-10-06: "an indirection that directs you to the other screens"): Continue, Resign, End game,
  then New game, Online, Replays, Settings. It is the same every time; what can't be used now is greyed (disabled), never
  hidden: without a game, Continue, Resign and End game; in a game ("if you're in a game, you're in a game"), New game,
  Online and Replays (and End game online). The menu opens on it, the Menu button opens it, and coming back to the page
  (a reload, the site opened again) starts at it. Each screen has ‹ Menu at its top (a radio of the same `mode` group, so it
  works before the script), and Esc goes back too; in a game, Esc or the backdrop on the main menu is Continue.
- `menuOpen` asserts that a player in a game sees only the main menu, Settings or a room (`gameOn()`: a local or online game
  in progress, or the server's `NET.active`, an online game of this player's not joined in this page yet, which Continue
  joins).
- A saved local game comes back at once: each save also stores what the main menu shows for it (`eldorado-menu`: the round,
  Resign's label, whose view is shown; state.js save, gameHead), and the page's first script, right after the main menu's
  markup, draws the menu from it before the app has loaded (Continue live, New game/Online/Replays greyed). The app then
  rebuilds the game behind it and writes the same words; its AIs wait until Continue. A room link still opens the room.
  test/firstpaint.cjs measures the first paint with a game in progress too.
- The room lobby has no ‹ Menu: **Leave** (or Close room, for the host) is the way out. Signing out leaves any room.
- Data from the server fills slots that are always there (the account line, the room lists, a full room's note): the
  layout-shift check judges the menu at all times, excused only by input or `expectMenu()` (another screen, the menu
  opened, the window resized).
- A replay returns to the screen it was opened from (Replays, Online), or to the main menu if a game is in progress.
- What must stay in sight stays pinned when a screen scrolls (owner, 2026-10-06): each screen's header (`.mhead`: ‹ Menu and
  its title; Online's tabs; the room's code, summary and link) sticks to the top, its main action (`.mrow`) to the foot. A
  line marks either edge only while content runs on under it (`#mform.scrolled`, `.more`, set on scroll), so a screen that
  fits shows no bars. menuEdges asserts the pinned parts are in sight after every scroll; menus.cjs scrolls each screen
  through at the owner's size and on phones.

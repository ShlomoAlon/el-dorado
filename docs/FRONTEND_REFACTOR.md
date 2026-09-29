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
| `state.js` | `UI`, `NET`, `G` (record, replay), selectors (`cur`, `canAct`, …), local save |
| `frame.js` | `render()`, `flush()`, `after()`, view parts |
| `geometry.js` | cached sizes of the game area, piles, prompt, market |
| `actions.js` | turning clicks into engine actions (`act`), modes, targets, events |
| `ai.js` | local AI seats |
| `board/terrain.js` | the static board (SVG + HTML labels) |
| `board/camera.js` | pan / zoom / fit |
| `board/overlays.js` | targets, blockades, hover path and tip, rubble pips, trails |
| `board/pieces.js` | explorers and their moves |
| `hand.js` | cards in hand and in play, piles, card drag, aim arrow |
| `hud.js` | player chips, prompt, turn buttons, timer, other players' turn feed |
| `market.js` | market strip, All cards, purchase slot, market drag |
| `dialogs.js` | banner, toast, modals (rules, results, piles, journal) |
| `cards.js`, `art.js`, `meeple.js` | card faces and art, explorer figures |
| `sound.js`, `menu.js`, `online.js`, `replay.js` | as named |

## Tests

| command | covers | time |
|---|---|---|
| `node test/run.mjs` | build, engine quick tier, UI checks (layout at 5 sizes, local game flows, animation frames) | about 1 min |
| `node test/run.mjs --full` | adds engine full tier (60 games, AI games), layout at 11 sizes, render, e2e (needs `wrangler dev`) | several min |

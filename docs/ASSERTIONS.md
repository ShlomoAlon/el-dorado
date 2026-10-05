# Assertions and boundaries

## The principle

1. A check on something that must always be true (an invariant) is an **assertion**: if it fails, that's a bug, and we want to hear about it, not paper over it.
2. Real checks stay only where failure is allowed: player input, network messages, `fetch` / WebSocket, `localStorage`, optional browser APIs, uploaded files, the database.
3. Instead of adding special cases, the flow is arranged so they can't happen (one place resets a game's AI, one place builds its board, and so on).
4. A failed assertion stops the operation it is in. **One boundary per entry point** catches it, reports it and rebuilds the game from its record. Nothing else catches it.
5. Debug mode stops in the debugger first. Live, it must never take the page or the server down.

## Where `assert` lives

`src/engine_data.js`, exported through `src/engine.gen.js`:

```js
class AssertionError extends Error { … }          // message: 'assertion failed: ' + msg
function assert(cond, msg)                         // throws an AssertionError; in debug mode hits `debugger;` first
function setAssertMode({ debug })                  // the one flag
```

- **Page:** `import { assert } from '../engine.gen.js'`.
- **Worker:** `E.assert`.
- **Messages:** a constant string that says what should be true (`'reach: the explorer is on the board'`), so an assert that passes costs one comparison. Asserts in per-frame code allocate nothing and read no layout.
- **Debug mode is set in one place per program:**
  - the page: `boundaryInit()` from `?debug`;
  - the worker and each Room: `env.DEV_AUTH === '1'`;
  - the engine tests: `setAssertMode({ debug: true })`.

## The boundaries

### Page: `src/client/boundary.js`

**What reaches it:**
- an error nobody handled: input handlers, timers, WebSocket messages (the window `error` / `unhandledrejection` events);
- a view part that failed (`frame.js` `safe()`, which isolates the parts from each other);
- a saved game that can't be rebuilt (`state.js` `loadSave`).

**What it does:**
- **Logs it** in the diagnostics log (`debug.js`). The log always keeps the last 200 lines, and is shown with `?debug`.
- **Reports it**, once per message per page load: `POST /api/bugs` with
  - the message, the stack and the build (`app.<hash>.js`);
  - the URL, the user agent and the time;
  - the game: the local game's **record** (setup, actions and the shuffle secret: replaying it rebuilds the exact state), or for an online game `{room, seat, the state the page holds}`, or the replay and its position;
  - `UI` (mode, card, picks, buy, pending), the connection flags and the log.
- **Recovers**, after a failed assertion outside the views (`actions.js` `resync()`): the selection is dropped, and the game comes back from its source:
  - online: a fresh connection, which brings the server's state;
  - a local game: rebuilt from `G.rec` (the action that failed was never recorded).

  A toast says so.

In debug mode nothing is sent, and the browser stops at the assert (with devtools open). Nothing is sent from the claude.ai artifact or a `file:` page either (`HAS_SERVER`).

### Server: `src/worker.js`

**`Room.guard(what, ws, f)`** wraps every entry point: `fetch`, `webSocketMessage`, `alarm` and `webSocketClose`. On any exception:

- it logs it, and stores a report (`source 'room'`) with the room's `d`, its `rec` and what triggered it (the raw message, `alarm`, `close` or the path);
- it rebuilds the room from storage (`restore()`: its last good state);
- it tells the sender (`{t:'error'}`) and sends everyone the state again;
- a failed alarm is tried again in 10 s;
- if even the recovery fails, only the sender's socket is closed. The Durable Object stays up.

**The worker's `fetch`:**
- a route that throws is stored as a report (`source 'worker'`) and answered with a 500;
- a request body that isn't JSON is answered with a 400 (the sender's mistake, not a bug).

**`storeBug`** never throws: a report must not become a second failure.

### Bug reports

| | |
|---|---|
| table | D1 `bugs(id, created, source 'page'\|'room'\|'worker', who, msg, stack, build, context)`, made in `ensureSchema` |
| send | `POST /api/bugs`, no sign-in needed (a uid is added when the request has a token). Body ≤ 256 KB. At most 20 per sender per hour (uid, else `ip:…`, rooms `room:<code>`). The newest 2000 are kept. |
| read | `GET /api/bugs` (the latest 200, without context) and `GET /api/bugs?id=<id>` (one report in full), with the header `x-bugs-key: <BUGS_KEY>`. Without the secret, nobody can read them. |

**Setting the key, once.** Either:
- run `npx wrangler secret put BUGS_KEY` and type a long random string; or
- in the Cloudflare dashboard: Workers & Pages → el-dorado → Settings → Variables and Secrets → Add → type **Secret**, name `BUGS_KEY`.

Then read the reports with:

```
curl -H 'x-bugs-key: <the key>' https://el-dorado.shlomoalon9.workers.dev/api/bugs
```

**Replaying a page report's local game** (it carries its record):

```js
const { S } = E.recState(report.context.game.rec)   // rebuilds the exact state
```

**Tests.**
- `test/online.cjs` forces an assertion in a live room (a `selftest` message, honoured only with `DEV_AUTH=1`). It checks that the player gets an error, the game goes on and the report carries the room and its record.
- It also forces one in a page and checks that the page reconnects, and that its report carries the game, the selection and the log.
- It fails if any other bug report appears during the run.

## Checks kept, and why

**Engine** (`engine_data.js`, `engine_rules.js`, `engine_ai.js`):
- `applyAction`'s `fail(...)`: player input, and online a network message. `cantBuy` and `cardTargets` answer "not now" the same way (a query, not an error).
- `replayCheck`: uploaded logs, saved games and stored records. `replayStart`'s name and colour defaults: log data.
- `courseById`, `aiById`, `stackOf` return `null`: they look up ids that come from the network, logs or storage.
  - `newGame` drops an unknown `ai` from an uploaded record.
- `end`'s `keep` defaults to none: network input.
- `recApply(rec = null)`: the AI tools play unrecorded games. `recFinal`'s `places` is `null` for a training log stopped at its round cap.
- `aiNetDecode` takes an ArrayBuffer or bytes, and a network file without `leak`: file formats.
- `aiChoose`'s 60-actions-per-turn stop: kept (see below).

**Page:**
- `state.js`: `localStorage` everywhere (it can throw, be full or be empty). `loadSave`: a stored record this version can't rebuild is reported and skipped. `canAct`/`inGame`/`viewIdx` accept "no game on show" (the menu).
- **View parts** (`frame.js`, every `*Part.update`): they run every frame, with or without a game, so `if (!S)` there is a real state, not a guard.
- `actions.js`:
  - `doMove` (a click on a target drawn in the previous frame);
  - `addDiscard`'s "still in hand" (online, the turn can end under a drag);
  - `pickFromMarket`'s stack (online, the reserve can shrink between frames);
  - `startEndTurn`'s `canAct` (the turn can pass before the tap);
  - `onPiece` (any explorer can be clicked);
  - the resign / end-game dialogs (the game can end while they're open);
  - the game-over timers (another game may be on show 600 ms later).
- `ai.js`: a scheduled AI move checks what can change while it waits (a resignation, the game ended, another game on show: `AIX.gen`); `aiNetLoad`: fetch.
- `hand.js`: `layoutCards` runs from pointer events between frames (a card may not be drawn yet); `setPointerCapture` (throws for a pointer that is gone).
- `market.js`: `marketRectOf` can find no stack. An event can describe an earlier action of a batch the server sent, and the stack may since have sold out and had its slot refilled from the reserve. **Page code that handles events runs against the latest state:** don't assert that an event's card or stack still exists. Also kept: a slot's `.mcard` (a sold-out slot has none), and `localStorage`.
- `feed.js`, `overlays.js`, `hud.js`: the turn recap with no step yet; a target's ring not drawn yet; the turn clock's element only shown online. `setHot` / `pulseDiscard`: elements drawn in the next frame.
- `camera.js`: `fit` before any board (a resize at boot); `focusPoint` after the game ended. `setPointerCapture` and Safari gesture events: browser APIs.
- `online.js`: `fetch` (`api`, sign-in, profile); `JSON.parse` of server messages; the socket's state, heartbeat and reconnects; `history.replaceState` (throws in sandboxed frames, e.g. the artifact).
- `menu.js`: `localStorage` (remembered seats); `fetch` (rooms, leaderboard, profiles, replays); uploaded files (`uploadReplay`); a room's course from the server (a newer server may know a course this page doesn't); `navigator.clipboard`.
- `replay.js`: `buildReplay` validates uploaded logs (`replayCheck`), and turns a log's illegal moves into ended turns; `describeAction` / `actionKey` read log data; `loadReplayId` catches only the fetch.
- `sound.js`: Web Audio (context creation, and every `sfx` call: the audio can fail in many browser states); `requestIdleCallback` (not in Safari).
- `main.js`: `requestFullscreen` (throws or rejects).
- `ready.js`: `document.fonts`.

**Server** (`worker.js`):
- `ALTER TABLE … ADD COLUMN` in try/catch: the project's migration rule (the column may exist).
- The one-time replay clean-up (retried on the next start).
- D1 results: `meta`, missing rows, old ratings keys.
- `fetch` to Google's keys. The DO-to-DO `fetch` (`tellLobby`, a no-op if the lobby is down). `ws.send` / `ws.close` (a socket may be gone).
- Every client message and request body: action validation, the host's rights, colours, AI seats.
- `saveReplay` / `finish`: a database failure keeps the game's result without the ratings or the replay.
- The AI name lookup: the database can fail, and then the AI keeps its own name.

## Bugs the assertions uncovered

1. **The rules test built maps that real games can't have.**
   - Explorers were parked where El Dorado can't be reached, so the old `progress()` quietly scored them 999.
   - "Everyone arrived" was set up without `endTriggered`, so `advance()` fell back to ending the game after its loop.

   Both engine fallbacks were dead code in real games. Now they are asserts, and the fixture builds valid maps.
2. **`build.mjs` couldn't export an engine name that `Object.prototype` also has** (`constructor`, `toString`, …). It broke on the first class in the engine. Fixed.
3. **The Room caught every engine exception from a player's move and answered "Bad action."** A bug looked like a refused move, and it rebuilt the whole game from its record on every refused move (CPU on each typo). Now a refused move changes nothing, and an exception is a bug for the boundary.
4. **`loadReplayId`'s catch covered showing the replay too**, so any bug there became "Could not load replay". It now catches only the fetch.
5. **The full-screen button's try/catch didn't catch the promise `requestFullscreen` returns.** A refusal was an unhandled rejection, and it would now have been reported as a bug.
6. **`resumeSaved` and `loadSave` swallowed any exception while rebuilding a saved game** and silently started a new one. That is now reported.
7. **The results dialog's timers could open the results for a different game.** When another game was put on show within 600 ms, the dialog opened with empty fallbacks. It now checks the game on show.
8. **One false invariant of this pass, caught by the online test before it shipped.** `marketRectOf` asserted that every card type still has a stack. See `market.js` above: events run against the latest state.

## The checks (2026-10-01)

Two tiers, both reported through the boundaries above:
- **Always on, cheap.** The engine's `checkGame(gs)` after every real action (`recApply`) and every replayed step:
  cards conserved and in one place, market counts, explorers on enterable spaces and never sharing one, a valid
  player to move, a finished game places everyone (about 2.5 µs; never inside the AI's look-ahead). The page's
  `checks.js`, a view part run last every frame: the UI state is valid for the game state (All cards only in its
  turn and mode, a chosen card is in hand, the removal choice exactly when asked, paying has a purchase, the cover
  only in local games). Turn buttons: one per slot (`hud.js`).
- **Debug/test tier** (`CHECKS` in `debug.js`: on with `?debug` and in every automated browser, `navigator.webdriver`;
  never in a player's browser): **nothing moves on screen during play** unless it follows an input or code declared
  the layout change (`expectLayout()`: the game area resized, the market or history moved, a replay's dock). Every
  test run therefore fails on a layout jump.
- **Sharp at rest** (`sharp.js`, 2026-10-05): once the page rests (nothing animating, no input for 600 ms), in slices of
  3 ms: every text over the game sits on a layer of its own that is solid, with a solid border and no outer shadow, with
  nothing above it faded, filtered or will-change. In tests every second, in a
  player's browser once a minute (reported). The pixels behind it: `test/sharp.cjs` (sub-pixel text on, GPU route, the
  owner's screen) judges every text on each menu tab, a game and the windows.
- **Lint** (`test/lint.mjs`): no catch that drops its error unless a comment names the failure it expects; no unused
  import (a swallowed call leaves one).

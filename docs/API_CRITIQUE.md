# API critique (2026-09-29)

This review checks `docs/API_SPEC.md` (commit `0f8b68a`) against the code. The owner's criteria are elegance, simplicity and
shortness, and the rules engine will be ported to Rust. Every "unused" claim below was checked with grep over `src/`,
`src/client/`, `tools/`, `test/` and `build.mjs`. File references use the form `file:line`.

**Where this leads.** The record already is the game (a setup, a secret and a list of actions). Build the API around that
record and pass everything explicitly:

```
newGame(setup, secret) -> game       apply(game, seat, action) -> {ok, err, ev}      undo(game)
view(game, seat) -> redacted state   targets(state, seat, piece, card) -> [{to, kind, cost, action}]
replay(log) -> iterator of {state, ev}
applyRaw(state, seat, action, rng)   (bots' look-ahead only)
```

That shape has no module globals and no `setRng`, and nothing in it is English text. Most of the items below are steps toward it.

**Status (2026-09-30).**

- **Done:** 1 (the game is a parameter: `gs` first; `mapOf(gs)`; no `S`/`MAP`/`setS`), 2 (randomness is a parameter), 3 (records only, log v3), 6 (state trimmed), 7 (the server doesn't write into
  `S`), 8 (dead bot code), 9 (one export surface: `import * as E`), 10, 12 (events), 13 (player vs. system actions,
  `keep` required), 11 (the packed network names its inputs), 15, 16, 17 (one `replay(log)` generator; `recFinal` takes the state), 21 (the map is topology; the page lays it out), 23 (tools share `tools/ai/playout.mjs`; four finished one-off investigations deleted), 24.
- **Partly done:**
  - 4: the journal is structured (the page writes the sentences); errors are still English.
  - 5: `cardTargets` is the one page query, and every target names its action (`t`); the three internal queries remain.
  - 14: `replayCheck` checks a record's players and `newGame` asserts them; colours are still hex, not ids (that would
    need a log version bump, which drops every stored game).
  - 19: the server keeps each room's board with its state; the bot's caches on `MAP` remain.
  - 22: one `passTurn`.
  - 18: API_SPEC §1.12 pins the path tie-break, the feature order and the mixed precision; the redacted state still uses
    placeholder ids. (A player can always choose among equally cheap routes by moving one step at a time.)
- **Open:** 20.

---

## 1. Pass the game in explicitly instead of using the module-global `S` and `MAP`

- **Change:** make the engine functions take the state (and its map) as a parameter. The page can keep one "game on show"
  variable of its own.
- **Why:** callers keep swapping the global to get anything done:
  - `worker.js:331` sets `E.S` and `E.MAP` before every call and reads `E.S` back afterwards (`:432`, `:479`, `:491`).
  - `saveReplay` has to set `E.S` just so that `recFinal` works (`worker.js:499`): `recFinal(rec)` reads the global `S`, not
    `rec` (`engine_rules.js:75-76`).
  - The bot swaps `S=botClone(root) … S=root` more than 30 times (for example `engine_bot.js:180`, `:185`, `:342-345`, `:402-423`).
  - The tools assign `E.S` directly (`gen.mjs:111-114`, `search_exp.mjs:20`).
  - Some functions already take the state (`redact(state)`, `mapFor(st)`, `botClone(st)`, `botPaddles(P, st)`); the rest read
    the global.
- **Saves:** `setS`, `setMAP`, the `E.S`/`E.MAP` getters and setters, `E.MAPX`, and the save-and-restore code in `recState`.
  Rust's borrow checker would force this change anyway.
- **Risk:** it is a large mechanical diff in the engine, but the page can keep its binding. `test/fixtures/features.json`
  catches any change to the features.

## 2. Make randomness a parameter: remove `RNG` and `setRng`, and give the AI a seeded `rnd`

- **Change:** add an rng argument, `applyAction(state, seat, a, rng)`. `recApply` passes the per-action generator
  (`recRng`), which it already builds. `aiChoose` and `aiStep` also take `rnd`.
- **Why:** randomness today is a hidden, order-dependent global:
  - The tools must remember to call `setRng(gen)` and `setRng(null)` around every recorded action so that the bots'
    look-ahead does not use up the game's stream. That is 21 calls in 7 files (`record.mjs:36-38`, `gen.mjs:78,136,138`, …).
  - The replay viewer saves and restores `RNG` around `botScoreActions` (`replay.js:44-45`).
  - `replayStart` leaves `RNG` set for v1 logs but resets it for v2 logs (`engine_rules.js:31-35`).
  - The replay viewer's fallback `end` action (`replay.js:24`) runs on `Math.random`.
  - `aiChoose` calls `botChoose(opts)` without a `rnd`, so it uses `Math.random` (`engine_ai.js:40-41`,
    `engine_bot.js:348`). **I verified this:** two runs of the same seeded Humboldt/Humboldt/Raleigh game (seeds as in
    `calibrate_ais.mjs`) first differ at action 82. So the header claim in `calibrate_ais.mjs:3` ("Seeds are fixed, so the
    numbers reproduce") is false.
- **Saves:** `RNG`, `setRng`, every save-and-restore pair, and the "install the generator only around each action" rule in
  spec §4.
- **Risk:** golden positions must stay identical, so `golden.mjs` has to pass the same `mulberry32(500+g)` stream to each
  action. Records are unaffected, because they already use one generator per action.

## 3. Use one game format (records) everywhere: drop v1 logs and games without a record

- **Change:** the tools record their games with `recNewGame(opts, secret)` plus `recApply`, and the round cap becomes
  `{t:'endgame'}`. Then remove the v1 paths:
  - `v1` in `replayCheck`, `replayStart` and `replayStep` (`engine_rules.js:24-43`);
  - `gift` (`:28`, `:34`);
  - `newGame` as a public entry point;
  - `E.endGame` (used by 12 tools);
  - `recApply(null, …)`.
- **Why:** there are two formats with different randomness semantics. Also:
  - The tools build v1 logs by hand (`record.mjs:28`, `gen.mjs:67`, `search_exp.mjs:58`) and write a third `result` shape,
    `{capped, arrived}`. `recFinal` writes `{places, rounds}`, and `replay.js:109` reads `result.capped`.
  - `recNewGame` reads `globalThis.crypto` inside the "pure" engine (`engine_rules.js:53`); the secret should be a parameter.
- **Saves:** about 25 lines in the engine, most of the RNG handling in the tools, and one of the two log formats in the spec.
- **Risk:**
  - **v1 logs already uploaded to D1** (by `record.mjs --upload`) would stop playing. Keep a v1 reader in the page only, or
    accept losing those tool replays. Online games are v2 and are not affected.
  - The training exploration `gift` needs a setup option instead.

## 4. Take all English text out of the engine

- **Change:** move text and display helpers to the page:
  - `S.log` becomes structured history, for example `[{r, ev}]` built from the same public events, and the page writes
    the journal text.
  - `err` becomes a short code, and the page turns it into text.
  - `plural`, `fmt`, `blkLabel`, `SYMNAME`, `SYMCOL`, `hash`, `R`, `SQ3`, `pxOf`, `CT.n/txt/face`,
    `COURSES.name/src/diff` and `COLORS.hex/name` move to a page module.
- **Why:**
  - The engine writes prose (`engine_rules.js:97`, `:186`, `:204`, `:224-226`, `:235`, `:243`, `:268`, `:278`, `:291`, `:338`)
    that a Rust port would have to reproduce word for word.
  - The log is a cost everybody works around: 12 tools clear it before every action (`E.S.log.length = 0`), `botClone`
    drops it, and the replay viewer swaps it for every step (`replay.js:18-25`).
  - Three caps disagree: 200 in the engine (`engine_rules.js:102`), 120 on the server (`worker.js:451`) and 80 in replays
    (`replay.js:62`).
  - The journal's comment about "server-added lines" is out of date (`dialogs.js:26`): the server adds none.
- **Saves:** roughly 40 lines of engine string-building, the strings a port would need, and the log trimming.
- **Risk:** the online journal for someone who joins late needs the history in the state: send the structured log, which is
  as public as `ev` is. Saved records are not affected, since the log is rebuilt.

## 5. Replace `reach`, `nativeTargets`, `payTargets` and their callers with one `targets` query

- **Change:** add `targets(state, seat, piece, card)`, which returns every legal target with the exact action to send. That
  covers a card in hand, leftover strength, the Native, and rubble, camps and rubble blockades. `applyAction` validates
  against it, `botActions` lists from it, and the page's `computeTargets` and `cardUsable` just call it.
- **Why:**
  - The rule "a joker moves as j/w/v, leftover strength keeps its symbol and budget" is written out 9 times: in the engine
    (`engine_rules.js:195`), the bot (4 times), the page (`actions.js:37`, `:52`) and the test (twice).
  - The three queries return different shapes (`cost` or `need`, an optional `path`, `kind` from 7 values).
  - The page decides which action a kind maps to (`actions.js` `doMove`/`startDiscard`). That breaks the "all rules in the
    engine" invariant.
  - The page's `affordable()` and `pickFromMarket` (`actions.js:134-158`) repeat the buy rules, including "reserve opens once
    a market slot is empty", which appears 8 times across files. A `buyOptions(state, seat)` query fixes that the same way.
- **Saves:** the duplicates, three spec rows, and the page's copy of the rules.
- **Risk:** `botFeatures` calls `reach` directly (`engine_bot.js:101-102`); keep it as an internal helper so the features do
  not change. The fixture guards this.

## 6. Trim the state `S`; it is never stored, so this is cheap now

- **Change:** remove fields that are unused, derived, or not part of the game:
  - `S.v` is never read. Replace it with a protocol version that the page checks.
  - `S.start` is always 0 (`engine_rules.js:94`).
  - `S.winners` is `places.filter(p => p === 1)`.
  - `S.resigns` is the maximum of `P.resigned`.
  - `P.blocks` duplicates `blockades[i].owner`; both are written in `takeBlock` (`:186`).
  - `S.blockades[].n/k/v/conn` copy `MAP.blockDefs`; only `owner` changes.
  - `privacy` is a page setting that the engine never reads.
  - `S._endView` is a hidden flag the bot sets on cloned states (`engine_bot.js:75`, `:331`); make it a parameter of the
    feature code instead.
  - `course` should be an id, not the whole course object.
- **Why:** local saves are records (`state.js:26-31`) and rooms store only `d` and `rec` (`worker.js:330`), so `S` is
  rebuilt every time and never persisted. The CLAUDE.md rule "bump S.v and the save key" is therefore out of date.
- **Saves:** 8–10 fields in the spec and in a Rust struct, and two sources of truth for blockade ownership.
- **Risk:**
  - The features read `S.start`, `p.blocks.length` and `B.n/k/v/conn`; keep the same values (the fixture checks this).
  - A tab left open across a deploy would get a new-shape state. That is the reason for the protocol version above.
  - Random training courses (`botRandomCourse`) are not in `COURSES`, so `newGame` must still accept a course object, and
    `mapFor` must resolve only official ids.

## 7. The server should not write into the engine state, and the state message can shrink

- **Change:**
  - Stop adding `S.owners` and `S.room` (`worker.js:329`, `:446`). The message already carries `seat`, so the page uses
    `NET.seat` for "mine" and `NET.code` for "a different game".
  - Replace `deadline` + `now` with `left` (milliseconds remaining).
  - Drop the server events `{e:'start'}` (`:448`) and `{e:'undo'}` (`:422`).
- **Why:**
  - Today `seat` is stored in `NET.seat` (`online.js:74`) and never read; the e2e test only prints it. Instead the page
    derives the seat from `S.owners` in 9 places (`state.js:13,15,19`, `hud.js:28,44`, `sound.js:68`, `feed.js:16`,
    `actions.js:207`, `main.js:48`).
  - `S.room` is used only for the freshness test (`online.js:77`).
  - `now` exists only to compute the clock skew (`hud.js:89`).
  - Nothing in the page handles `start` or `undo`.
- **Saves:** two engine-state fields, one message field, two event types, and the skew arithmetic. It also restores the rule
  "only the engine writes S".
- **Risk:** page and server change together in one deploy; an old tab needs a reload.

## 8. Delete the dead bot and training code

| What | Evidence | Lines |
|---|---|---|
| `botTurn` | no caller (its comment says "used by the UI" but nothing in the UI calls it) | `engine_bot.js:504` |
| `botWorth` | defined, never called | `:31` |
| `search: {width, depth}` → `botTurnSearch`, `{kind:'rollout'}` → `botRolloutChoose` | no caller passes either | `:477-502` |
| `setPlan`, `BOT_PLANS` variants, and the `BOT_PLAN_DEF` knobs `near, blockAhead, guard, keepEnd, safeTrash, minDeck, blockW` | `setPlan` is never called, so every knob is 0 and its branch is dead | `:164-173`, `:191-193`, `:204-207`, `:221-222` |
| `turnState.forceBuy` | only ever passed `false && …` (`gen.mjs:84`) | `:357` |
| `opts.draws` | never passed; always 4 | `:362` and others |
| `explain` / `alts`, plus the log's `notes` | written by `record.mjs:42`; the replay viewer never reads `notes` | `:375` |
| `heur2` / `botHeuristic2` | reachable only through `BENCH=heur2`, which no script sets | `:134-156` |
| `S.rules.campOnce` | `S.rules` never exists, so the flag is always 0 (keep writing 0) | `:274` |

- **Also:** `botDeepChoose` and `botDeepPlayout` are used only by `deep.mjs`, an experiment. They could live in the tool
  instead of the page bundle and the server.
- **Saves:** about 70 lines of `engine_bot.js` (533 lines), or about 110 if the deep planner moves out too. All of it is
  shipped to every browser and the Worker today. It also removes four rows of spec.
- **Risk:** none for the features, because `botNetFeatures` is untouched and the golden test stays green.

## 9. Export one explicit API list, not `E` plus every top-level name

- **Change:** have `build.mjs` export one hand-written list of names that everyone imports, and drop the duplicates.
- **Why:** there are two export surfaces (`build.mjs:21-22`).
  - The named exports list 150 names, most of them internals such as `rm`, `log`, `advance`, `checkEnd`, `resign`,
    `TPL` and `BOT_FBUF`.
  - `E` has duplicates:
    - `MAPX` is the same as `MAP`.
    - `setNet` is the same as `aiSetNet` (24 and 9 uses).
    - `aiNetFits` is the same as `botNetReady`; only the test uses it.
    - `endGame` duplicates the `endgame` action.
  - Members of `E` that nothing uses through `E`: `botTurn`, `botFeatures`, `setPlan`, `BOT_PLANS`, `nativeTargets` and
    `aiUsesNet`.
- **Saves:** the curated `E` literal. The list becomes the Rust crate's public API.
- **Risk:** it touches every tool's import line; nothing is stored.

## 10. Put the AI-availability rule in one place, and make the AI registry strict

- **Change:** keep only `aiAllowed(course, n)`. `aiChoose` rejects unknown ids instead of quietly playing a different AI. Stop
  mutating `AIS`. `newGame` stores `ai` as given.
- **Why:**
  - The rule "First Expedition, 3–4 players" is spread over `AI_COURSES` + `aiCourseOK` + `aiAllowed` (`engine_ai.js:18-21`),
    and its error message is copied twice (`worker.js:394`, `:413`).
  - `addAI` repeats the `max >= 3` check by hand (`worker.js:394`), and so does the page
    (`menu.js:207`: `aiCourseOK(o.course)&&o.max>=3` is just `aiAllowed(o.course, o.max)`).
  - An unknown id falls back to `AIS[AIS.length-1]` (`engine_ai.js:36`). Because `h2h.mjs:12` pushes test AIs into `AIS`, that
    fallback is whatever was pushed last.
  - `newGame` calls `aiById` (`engine_rules.js:87`), so the rules depend on the AI layer. Rust wants the dependency to go
    the other way.
- **Saves:** 2 functions, 1 constant and 3 duplicated checks.
- **Risk:** low.

## 11. The network file must describe its inputs, or the multi-course code should go

- **Change:** write `courses`, `onehot` and `extra` into the `.bin` header (`pack.mjs:22`, `aiNetDecode` `engine_ai.js:25`).
  Otherwise, remove the multi-course and extra-input code from the shipped engine.
- **Why:** 12 of the 32 networks in `tools/ai/models` are multi-course (`courses`, `onehot`). The packed format drops those
  fields. Packing one would give `course:'multi'`; `botNetReady` would then be false and Humboldt would quietly play as the
  planner. The engine also carries `botMulti`, `botBlockSize`, `BOT_FLAGS`, `BOT_XF` and `botExtraFeatures`
  (`engine_bot.js:230-268`), which the shipped network can never use.
- **Risk:** only the header changes. The feature layout of single-course networks stays the same.

## 12. Events: fold `draw` and `gain` into `play`

- **Change:** remove `{e:'draw'}` and `{e:'gain'}`. The `play` event already carries `n` for draw cards
  (`engine_rules.js:234`) and `got` for buy and transmit (`:250`, `:263`).
- **Why:**
  - `gain` always comes right after its `play` event.
  - `draw` is inconsistent: it is emitted for draw cards but not for the end-of-turn draw (`:277`). So `sound.js:78` fakes
    a 4-card draw on every `turn` event.
- **Saves:** 2 event types. The page's `playEvents` and `feedEvent` each lose one branch (`actions.js:76`, `feed.js:33`).
- **Risk:** only replays' animations use the events. Records store actions, not events.

## 13. Separate player actions from system actions, and be strict about input

- **Change:** the server accepts only `move/native/pay/action/trash/transmit/buy/end/resign` from sockets. `timeout` and
  `endgame` become system actions. Also:
  - `endgame` should check the seat like everything else; today it is accepted from any seat, even out of turn, because
    the check comes before the turn check (`engine_rules.js:177` vs `:178`).
  - `end.keep` should be required, as `cards` is for `trash`, `pay` and `buy`. Today a missing or non-array `keep` quietly
    becomes `[]` (`:272`).
- **Why:** the worker uses a blacklist (`worker.js:427` refuses only `endgame`), so a client can send `timeout`. Whether an
  action is allowed online is a policy decision that currently sits in the worker.
- **Risk:** stored records contain `timeout` and `endgame` actions. Replays must keep accepting them; only sockets refuse
  them.

## 14. Validate the setup in one place

- **Change:** `newGame(setup)` validates the setup: 2–4 players, a known course, names trimmed to one limit, and colours as
  ids or indexes into `COLORS`. `replayCheck(log)` then just means "newGame would accept this setup".
- **Why:**
  - `newGame` checks nothing; the tools pass colour `'#fff'`.
  - `replayStart` sanitizes names to 24 characters and colours with a 6-digit hex regex, and ignores v1 colours
    (`engine_rules.js:32`).
  - Other name limits disagree: the server allows 16 (`worker.js:115`), the setup screen 14 (`build.mjs:31`), and replay rows
    24 (`worker.js:194`).
  - The colour table exists three times, keyed by hex: `COLORS`, `PCOLORS` (`worker.js:315`) and `MEEPLE_BY_COLOR`
    (`meeple.js:210`).
- **Risk:** stored records hold hex colours, so map hex to an id on load.

## 15. Clean up the room protocol

- **Change:**
  - Remove `{t:'join'}`: nothing sends it, and a seat is taken on connect (`worker.js:360`, `:390`).
  - Use one room shape for the lobby list and for `room`.
  - Rename `d.rated`, which means "results written" and is set even for unrated rooms (`worker.js:516-521`), to `d.done`.
  - Build the quick-match options in one place: they are built both in `/api/rooms` (`:237`) and in Lobby `/match` (`:283`),
    with different dev turn times (≥5 s against 20 s).
  - Drop the `x.rated !== false` and `pub !== false` checks (`:267`, `:332`, `:505`): the options are normalized to booleans
    when the room is created.
- **Why:** `host` is a player's name in the lobby list (`summary()`, `:332`) but a uid in `room` (`roomInfo()`, `:335`). There
  are three room shapes: `summary`, `roomInfo`, and the re-shaped `Lobby.list`.
- **Saves:** 1 message type, 1 room shape and about 10 lines.
- **Risk:** low; page and server deploy together.

## 16. Use one error shape

- **Change:** use `err` everywhere: `{ok:false, err}`, `{t:'error', err}` and HTTP `{err}`.
- **Why:** there are currently six styles:
  - the engine returns `err` (`engine_rules.js:173`);
  - the room socket sends `msg` (`worker.js:377`);
  - HTTP returns `error` (`worker.js:14`);
  - `recUndo` returns a boolean;
  - `replayCheck` returns a string or null;
  - `buildCourse` and `aiNetDecode` throw.
- **Risk:** `api()` in `online.js:16` and `loadReplayId` read `j.error`; change them in the same deploy.

## 17. Merge the replay functions

- **Change:** turn `replayStart`, `replayStep` and `recState` into one iterator, `replay(log)` → `{state, ev, ok}` per action.
  `recFinal(rec, state)` should take the state explicitly. Drop `L.lid` (`state.js:36`), which is just `created.toString(36)`.
- **Why:**
  - `recState` is `replayStart` followed by N calls to `replayStep`.
  - `replay.js` rebuilds that loop by hand, snapshotting each step as JSON.
  - The test uses the start/step pair only to compare the final positions.
- **Risk:** none for the formats.

## 18. Rust-port hazards: pin down behaviour that is determined by the implementation

- **Move paths come from priority-queue tie-breaking.** `reach` pops the first minimum and swap-removes it
  (`engine_rules.js:115-116`); among equal costs the first one found wins (`:125`). Where two cheapest paths exist and only
  one crosses an open blockade, the tie-break decides whether the blockade is taken. Records store only `to`, not the path.
  Either define the tie-break in the spec or store the path.
- **Feature layout depends on JS `Map` insertion order.** `MAP.conns[c].edges[0]` feeds the features
  (`engine_bot.js:86`, `:114`); its order follows the hexes' insertion order and `DIRS`. The route that `botDist` picks
  depends on `splice`-based tie-breaking (`:17`). The spec names the string sort of keys but not these.
- **Mixed precision.** `botNetValue` accumulates layer 1 into a `Float32Array` (so every `+=` rounds to f32) while layer 2
  is f64, and it ends with `Math.exp` (`engine_bot.js:287-293`). The fixture compares the value `v` bit for bit. Keep the
  features exact, but compare `v` with a tolerance (about 1e-9): `exp` differs in the last bit between V8 and libm.
- **Placeholder ids in the redacted state.** Other players' hand and deck ids (`h1_0`, `d2_3`, `engine_rules.js:355`) mix
  fake ids into the card-id space. Send counts instead, as a separate view type.

## 19. Stop hanging caches and scratch buffers on shared objects

- **Change:** keep derived data in an explicit per-map struct built once. Keep scratch buffers per caller.
- **Why:**
  - `MAP` collects `_nb`, `_bd`, `_fb` (including a mutable scratch array `b`), `_bo` and `_pt` (`engine_rules.js:105`,
    `engine_bot.js:26`, `:83-84`, `:229`, `:252`).
  - The network object gets `_p` with a scratch `h1` (`:287-288`).
  - Module caches: `BOT_BLOCK`, `BOT_CP`, `BOT_FBUF`, `BOT_PLAN_CACHE`.
  - The worker shares cached `MAP` objects between rooms and keeps its own `mapFor` cache (`worker.js:313-314`). Memoize
    `mapFor(courseId, seed)` in the engine instead.
- **Risk:** performance only. The page's 60 fps work does not touch these.

## 20. Rename the overloaded one-letter fields

- **Change:** give every field one meaning. Leave out the pinned feature internals and, unless there is a loader
  migration, the action fields stored in records (`t, card, pi, to, cards, type, keep`).
- **Why:** several short names mean different things in different places:

  | Field | Meanings |
  |---|---|
  | `t` | action type, message type, card type (`gain`, stacks), log text |
  | `k` | blockade kind, hex key, tile rotation, `play` kind |
  | `n` | blockade number, stack count, spaces moved, cards drawn, card name |
  | `v` | blockade cost, format version, `rated` value |
  | `p` | card strength, a course's boards, log seat |
  | `s` | card symbol, El Dorado side, stack |

  A player is called `pl`, `seat` and `me`, and `pi` is a piece index. A Rust port needs one name per meaning, and state
  and events can be renamed for free (item 6).

## 21. Split the map's topology from its layout, and delete what is dead there

- **Change:** `buildCourse` returns topology only: hexes, neighbours, connections, starts, goals and blockades. `x/y`,
  `city`, the bounds and the tile centres move to the page.
- **Why:**
  - Start numbering by projection (`engine_data.js:143-146`, with `atan2`, `cos` and `sin`) is dead code: every start board
    (A and B) has numbered `s1–s4`.
  - `COURSES[].src` is used nowhere.
  - Layout is the page's concern, and a Rust port would otherwise have to reproduce floating-point geometry.
- **Risk:** `botRandomCourse` uses `pxOf` (training only); keep that helper in the tools.

## 22. Small simplifications in the rules code

- `checkEnd` returns `n`, which nobody uses, and its line 293 repeats line 291 (if nobody is active, `≤1` already held).
- `resign`'s nested condition (`engine_rules.js:312-313`) reduces to
  `if (others.length <= 1 || !S.players.some(isActive))`.
- `reveal` only feeds `rec.mark`. Compute it inside `recApply` ("drew cards or the turn passed") and drop it from the result.
- `fullRace: true` is passed explicitly by 17 tools and the server, although it is the default. Only the setup screen ever
  passes `false`.

## 23. Tools: share one game loop

- **Why:** about a dozen tools each repeat `newGame → while (!over) { clear log; round cap → endGame; botChoose; applyAction; on failure
  end }`. `sim.mjs` exports `playGame`, but nothing else uses it. Once item 3 is in place, one `playout(setup, policyOf,
  {cap})` helper built on `aiStep` replaces them all.
- **Risk:** tools only.

## 24. Small deletes

- `verifyGoogleToken` is exported with a `keysFn` parameter for tests, but no test uses it (`worker.js:102`).
- These `window.__ED` hooks are unused by every test: `view`, `frameStats`, `myId`, `reach`, `applyAction`,
  `confirmDiscardFor`, `confirmTrash` (`main.js:81`). `showCourse` is used by `tools/course-check/shots.cjs`.
- `tools/ai/turns.mjs:18`: `const bd = E.botDist ? null : null;` is dead.

---

## Spec corrections (where `API_SPEC.md` does not match the code)

1. **§1.1 Determinism.** Same actions give the same game, but AI choices use `Math.random` (`engine_ai.js:40-41`), so a
   seeded AI game does not reproduce (verified).
2. **§1.4.** `S.v` is never read, `start` is always 0, and the server trims `log` to 120 (`worker.js:451`).
3. **§1.5 "acting seat must be `S.cur`, except for `resign`".** `endgame` is also accepted from any seat, out of turn
   (`engine_rules.js:177`).
4. **§1.5 `move`.** With leftover strength, `a.pi` is ignored and the active piece moves (`engine_rules.js:194`).
5. **§1.5 `end`.** `keep` is optional; a non-array counts as `[]` (`engine_rules.js:272`).
6. **§1.6 `play` fields.**
   - `native` carries only `ts` and `n`, not `sym` or `more` (`engine_rules.js:211`).
   - `action` carries `n`, the number of cards drawn (`:234`).
   - `draw` is not emitted for the end-of-turn draw (`:277`).
7. **§1.6.** The server's `start` and `undo` events are not read by the page.
8. **§1.8.**
   - `recFinal` reads the module's `S`, not `rec` (`engine_rules.js:75-76`).
   - `replayStart` leaves `RNG` set for v1 logs (`:31-35`).
   - Tool logs also carry `notes` and `result: {capped, arrived}` (`record.mjs:29`, `:52`).
   - `recNewGame` falls back to `Math.random` when `crypto` is missing (`:53`).
9. **§1.9 `aiChoose`.**
   - An unknown id plays as the last AI in `AIS` (`engine_ai.js:36`).
   - A 2-player game uses the planner (`:37`).
   - `aiFinishGuard` also never thins a deck below 4 cards, and buys a finishing card before ending a turn without one
     (`:52-56`).
10. **§1.9 network file.** `aiNetDecode` ignores `courses`, `onehot` and `extra`, so multi-course networks cannot ship.
11. **§1.10 "They act for `S.cur` unless given a seat `me`".** `botActions` takes no seat.
12. **§1.10 `mode`.**
    - `net` without a fitting network falls back to `heur` in `botChoose` (`engine_bot.js:350`) but to `plan` in `aiChoose`.
    - `plan…` modes return before `eps`, `noise`, `temp` and `search` are read, so `gen.mjs:91` passes `eps` and `noise`
      that are ignored (`engine_bot.js:349`).
13. **§1.10.** `botTurn`, `setPlan`, `{kind:'rollout'}`, `{width, depth}`, `forceBuy` and `draws` are documented but have no
    callers.
14. **§1.11.** `E` also has `MAPX` and a `BOT_EVALS` getter. `stackOf`, `coinVal` and `isActive` (§1.7) are named exports
    only, not members of `E`.
15. **§2.3 `POST match`.** It returns the player's current room of any kind, not only a quick match (`worker.js:279`).
16. **§2.3 `/api/train`.** `POST` returns `{ok:true}`; `GET` returns `{updated, now, status}`.
17. **§2.4 Game over.** Unrated rooms also write a `matches` row (`worker.js:518`). `matches.data` (§2.6) also holds
    `rounds` and `replay`.
18. **§2.4 AI seats.** The check is on the room size (`opts.max >= 3`), not the number of seats. AIs are refused in
    quick-match rooms (`worker.js:392`).
19. **§2.5.** The page never sends `{t:'join'}`, and it never reads `seat` in the `state` message (only `S.owners`).
20. **§2.2 names.** The server allows 16 characters, the setup screen 14, and logs 24 (`engine_rules.js:32`).
21. **§3 test hooks.** `window.__ED` also exposes `view`, `frameStats`, `myId`, `canAct`, `reach`, `applyAction`, `render`,
    `showCourse`, `playEvents`, `confirmDiscardFor` and `confirmTrash`.
22. **§4.** `calibrate_ais.mjs` does not reproduce (item 2), and its comments still name Orellana, an AI that has been removed.
23. **Not the spec, but related:** `CLAUDE.md` still names the old client files (`ui_state.js`, `ui_view.js`, …) and the save
    key `eldorado-save-v5`. The code uses `src/client/*.js` modules and `eldorado-game-v1`, a record.

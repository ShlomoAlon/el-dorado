# Design v3 — D1 (the start screen's role) and D9 (the top bar's content)

Screens shot at 1440×900 and 390×844 (close-ups @2x), same seeded deal every time, with `shoot.cjs` in this folder
(`node shoot.cjs <before|A|B> <D1|D9|all> <dir>`). Every option is built on current `main` (three-tab menu, History panel).

## D1. The start screen's role

**Problem:** the first thing a new player sees is a settings form (players, seats, course, end rule, privacy), and on a
phone the Start button is two screens down.

| state | before | A | B |
|---|---|---|---|
| first visit | `D1-before-start-1440/390` | `D1-A-start-1440/390` | `D1-B-start-1440/390` |
| phone, scrolled to the end | `D1-before-start-end-390` | `D1-A-start-end-390` | `D1-B-start-end-390` |
| the full setup (4 players) | `D1-before-setup-1440/390`, `-setup-end-390` | `D1-A-setup-1440/390`, `-setup-end-390` | `D1-B-setup-1440/390`, `-setup-end-390` |
| a saved game waiting | `D1-before-saved-1440/390` (opens straight into the game) | `D1-A-saved-1440/390` | `D1-B-saved-1440/390` |
| the Menu during a game | `D1-before-menu-ingame-1440/390` | `D1-A-menu-ingame-1440/390` | `D1-B-menu-ingame-1440/390` |

### Option A — a title screen with big choices (branch `design/v3-D1-A`)
- **What changed:** the This device tab opens on a title screen: the game's name, the one-line pitch and big tiles:
  **Continue** (only when there is a game to go back to: round and players on it), **Play** (starts at once with the last
  setup, written out in one line: "Ana against Humboldt and Raleigh · First Expedition"), and a quieter
  **Set up a game…** that opens today's form (with Cancel beside Start). Tabs stay as they are (Online and Replays are
  already one tap away, so they are not repeated as tiles).
- The whole setup (players, seats, names, colours, course, end rule, privacy) is remembered on the device, so Play
  really is "the game I played last time". A first visit plays you against two AIs (Humboldt and Raleigh) on First
  Expedition.
- **A saved game** no longer drops you straight into the board: the page opens the game behind the title screen with
  Continue as the gold tile (one extra tap, but you see where you are and can start something else).
- **During a game** the Menu shows the same screen: Continue (= back to game), New game (the remembered setup),
  Set up a game…, and Resign / End this game as small links under them (instead of the gold bar with three buttons).
- **Effort / risk:** small–medium (≈ 60 lines of CSS, 30 of JS; menu.js + shell.html + a default in build.mjs).
  Low risk; the tests that pressed Start now press Play. Start screen still inside the 14 KB first round trip
  (10.3 KB compressed).
- **Trade-offs:** on desktop the title uses little of the tall menu panel (the panel keeps one size for every screen;
  it could shrink for this screen only). Returning players with a saved game tap Continue once more than today.
  "Rules" is not on the title (it is in the top bar); Replays stays a tab.

### Option B — one screen, short top, More options folded (branch `design/v3-D1-B`)
- **What changed:** the This device tab keeps one screen, but its top is short: two big tiles for how you play
  (**Against the AI** / **Pass and play**), the player count, and **Start expedition** right beside it with the game
  written out under it ("Ana against Humboldt and Raleigh · First Expedition"). Everything else (leaders, names and
  colours, course, end rule, privacy) sits in a native **More options** fold, closed by default.
- The two tiles drive the seats: Against the AI fills the other seats with AIs (the ones picked last time), Pass and
  play makes every seat human and turns on hand privacy. They follow the seats too (pick an AI in More options and the
  tile switches). On a course or player count the AI can't play, the AI tile is greyed with the reason.
- **Course cards show a thumbnail of the route** (every space, coloured by terrain, drawn from the engine's own map),
  two per row.
- The whole setup is remembered on the device. A first visit is you against Humboldt and Raleigh.
- **Saved game:** unchanged: a saved game still opens straight into the board (so `D1-B-saved-*` looks like before).
  **During a game:** the gold "Game in progress" bar stays; Start becomes a plain "Start a new game" button so
  "Back to game" is the only gold one.
- **Effort / risk:** small–medium (≈ 50 lines CSS, 35 JS, a default in build.mjs). Low risk: every test still passes
  its Start button; start screen 10.4 KB compressed. The thumbnails are drawn by the script (a moment after first paint).
- **Trade-offs:** on a phone Start is on the first screen now (no scrolling), but the page still says "settings" more
  than "title". The "Against the AI / Pass and play" choice is new vocabulary; it replaces nothing (the per-seat
  Human/AI pickers remain inside More options).

## D9. The top bar's content

**Problem:** identity (the "El Dorado" name), state (round, players) and navigation (Market, History, Rules, Menu) share
one row, and Sound / Full screen live in the zoom column where nobody looks for them.

| state | before | A | B |
|---|---|---|---|
| 4-player game (you + 3 AIs), round 2 | `D9-before-game4-1440/390` | `D9-A-game4-1440/390` | `D9-B-game4-1440/390` |
| the top row (crop) | `D9-before-toprow-1440/390` | `D9-A-toprow-1440/390` | `D9-B-toprow-1440/390` |
| HUD close-up | `D9-before-hud-1440@2x` | `D9-A-hud-1440@2x` | `D9-B-hud-1440@2x` |
| the Menu during a game | `D9-before-menu-ingame-1440/390` | `D9-A-menu-ingame-1440/390` | `D9-B-menu-ingame-1440/390` |

### Option A — state on the left, one Menu on the right (branch `design/v3-D9-A`)
- **What changed:** the "El Dorado" name is gone from the bar. Left: a small **Round 2** box (it turns gold and reads
  "Final" in the final round), then the player chips in turn order, left-aligned. Right: **Market** and one
  **☰ Menu**.
- Menu opens a drop-down (opaque, no blur): **History** and **Sound** as switches (they stay open so you see them
  flip), **Rules**, **Full screen**, a divider, then **New game…**, **Replays**, **Online** (each opens that menu tab).
  In a replay its first item is **Exit replay**. Esc or a click outside closes it.
- Sound and Full screen leave the zoom column (it is only + − ⤢ now; on phones it is empty).
- On phones the round box stays (it was hidden before) and Menu is the ☰ icon alone.
- **Effort / risk:** medium-small (markup + ≈ 30 lines CSS, 15 JS in main.js/hud.js). Layout, menus and flows tests
  pass (they now reach History and the menu through the drop-down).
- **Trade-offs:** History and Rules are two taps instead of one; leaving a replay is two taps. The chips get the
  space the name and three buttons used (all four names show in full at 1440; phones still truncate them).
  The drop-down floats over the market column while open (it is transient and closes on any outside tap).

### Option B — buttons stay, Sound and Full screen join the Menu (branch `design/v3-D9-B`)
- **What changed:** the bar keeps "El Dorado · Round 2", the chips, and Market / History / Rules visible on desktop.
  After a thin divider come **Sound** and **Full screen** as icon buttons, then **Menu** (the same dialog as today:
  New game, Resign, Online, Replays). The zoom column is only + − ⤢.
- On phones the two icons don't fit the top row: they sit at the top of the Menu instead, as "Sound on/off" and
  "Full screen" buttons (`D9-B-menu-ingame-390`).
- **Effort / risk:** small (markup moved, ≈ 10 lines CSS, 5 JS). Layout test passes unchanged.
- **Trade-offs:** everything stays one tap away on desktop, but the row is as busy as before (plus two icons); it
  groups settings with the menu rather than removing anything. On phones Sound/Full screen become two taps.

## Recommendation

- **D1: Option A (title screen).** It answers the actual problem: a first-time player sees the game's name and one gold
  "Play" that starts a sensible game (you against two AIs), and a returning player sees "Continue · Round 2" first.
  The full form is still one tap away and unchanged. B is a good, cheaper improvement (Start on the first phone
  screen, course thumbnails worth keeping either way), but it still opens on a form. If you pick A, I'd also bring
  over B's course thumbnails into A's setup form.
- **D9: Option A (round + turn order left, one Menu right)** on phones and desktop alike: the bar reads as the game's
  state, the chips get room, and the tools live in one predictable place. If History and Rules being two taps away
  bothers you in play, B is the safe choice: it only tidies Sound and Full screen into the bar.

## Not done / notes
- A's saved-game change (title with Continue instead of opening straight into the game) is a behaviour change worth
  a conscious yes: it costs returning players one tap.
- The shots use AI opponents whose turns are not fully reproducible between runs, so the History panel's contents
  differ slightly between before/A/B; the top bar and menus line up.
- Only `test/layout.cjs --quick` was required; on D9-A the menus and flows tests also pass. On D1-A the menus test's
  "game bar" check no longer applies (the title screen replaces the bar).

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

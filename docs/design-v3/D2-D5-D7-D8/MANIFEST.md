# Design v3 mock-ups: D2, D5, D7, D8

Screenshots for the owner to choose between the options in `docs/DESIGN_REVIEW.md` §5. Every shot comes from `shoot.cjs`
(same seeded deal, same scripted turns), so `before`, `A` and `B` line up. Sizes: 1440×900 and 390×844; close-ups are 1440 (or 390) at 2×.

Before (current `main`): `D2-before-*`, `D5-before-*`, `D7-before-*`, `D8-before-*`.

## D2. One style for the controls: "expedition kit" or "quiet dashboard"

**Problem:** the cards and board are illustrated objects, but the controls around them are a generic dark app (native-looking
controls, letter-spaced capital micro-labels, pills, glows).

States: `start`, `game` (mid-play, a card selected), `history` (History panel dragged taller, a few turns), `menu` (the Menu during a game), each at 1440 and 390.

| | files |
|---|---|
| before | `D2-before-{start,game,history,menu}-{1440,390}.png` |
| A | `D2-A-{start,game,history,menu}-{1440,390}.png` |
| B | `D2-B-{start,game,history,menu}-{1440,390}.png` |

**Option A: expedition kit** (branch `design/v3-D2-A`).
- Panels are dark oiled leather (warm brown gradient) framed in brass; the menu panel has a double brass rule inside its edge.
- Section titles ("Players", "Course", …) are Young Serif in brass, with a thin brass rule after them; no letter-spaced capitals anywhere in the controls (round label, "In play", banner subtitle, difficulty tags).
- Buttons have a brass rim and a slight bevel; the gold button is polished brass (highlight on top, dark edge below) instead of a glow.
- The menu tabs are serif words with an underline, not a segmented pill.
- Effort: small (CSS only, about 60 lines). Risk: low; layout unchanged (layout test passes). Start-screen page: 9.5 → 10.2 KB compressed (limit ~14).
- Trade-offs: the whole screen reads as one object, a board-game box; but warm brown chrome next to the green board is a lot of "stuff", and the brass bevels are one more thing to keep consistent in every new screen.

**Option B: quiet dashboard** (branch `design/v3-D2-B`).
- One surface colour, one border, one radius (8 px) for every control; no gradients, glows or drop shadows on controls.
- Labels are sentence case, 13 px, muted; tags (difficulty, AI) are plain text; the menu tabs are words with an underline.
- The gold button is a flat gold fill; the current player's chip gets a coloured underline instead of a glow ring.
- Effort: small (CSS only, about 55 lines). Risk: low; layout test passes. Start page 9.8 KB compressed.
- Trade-offs: the cards, board and figures carry all the character and the controls stop competing with them; the start screen is plainer (it relies on the board behind it and on D1 for personality).

**Recommendation: B.** The game objects are already rich; a strict, quiet frame makes them look better and is far easier to keep
consistent (it's also what D8's tokens would write down). A's leather-and-brass looks good on the menu but heavy around the board.

## D7. Player colours

**Problem:** Crimson sits next to the red base camps and the danger colour, Violet echoes the purple action cards, and Ivory
reads as "empty" (nearly invisible when dimmed on the setup screen).

States: `board4` (4 players, everyone has moved once; 1440, 390), `setup` (start screen with 4 players; 1440, 390),
`setup-colours` (the colour choice, 1440@2x), `chips` (HUD player chips, 1440@2x), `explorers` (the four figures on the board, 1440@2x).

| | files |
|---|---|
| before | `D7-before-{board4,setup}-{1440,390}.png`, `D7-before-{setup-colours,chips,explorers}-1440@2x.png` |
| A | `D7-A-…` (same names) |
| B | `D7-B-…` (same names) |

**Option A: a new set: magenta, white, teal, black** (branch `design/v3-D7-A`).
- Chosen away from every terrain and suit hue (no red, gold, green, blue or purple). Every colour dot gets a light outline; the black
  explorer gets a light rim on the board so it doesn't sink into the shadows.
- Effort: small (the colour list, the setup defaults, one rule in the figure drawing, a few CSS lines). Risk: medium — colours are
  stored in game records by value, so shipping it means a log-version bump (old saved games and replays dropped, as the owner allows);
  the test fixture was recoloured on the branch. The online server picks colours from the same list, so no server change.
- Trade-offs: magenta and teal pop on the board; white and black are unambiguous names ("I'm black"). But black is the hardest
  colour to see on this dark board (even outlined it reads as dark grey), and teal is close-ish to the water/jungle mix at a glance.

**Option B: keep the hues; pair every colour with its explorer's hat** (branch `design/v3-D7-B`).
- The four explorers already wear different hats (pith helmet, wide-brim hat, fedora, headscarf). The hat silhouette, in the player's
  colour, replaces the plain dot everywhere a player is marked: HUD chips, the prompt, the History panel, the room lobby, replay, and
  the setup's colour choice (which now reads "choose your explorer"). The figures on the board carry the same hats.
- Effort: small (one hat list and one helper next to the colours, 5 call sites, CSS). Risk: low; no record change, layout test passes.
- Trade-offs: colour is never the only cue (colour-blind players can match chip ↔ figure by hat), and it ties the HUD to the
  figures; but Crimson still sits near the red base camps and Violet near purple cards, and at 16 px the hats need a second look.

**Recommendation: B**, and if the red clash still bothers you, B plus swapping only Crimson for a non-red hue (a one-line change,
but a record bump). B fixes the accessibility problem without invalidating games; A's black explorer is weak on this board.

## D5. Icons

**Problem:** custom SVG icons are mixed with Unicode glyphs (`+ − ⤢ ✕ ⏮ « ‹ ▶ › » ⏭ ★ ✓`), which take the system font's
weight and metrics and never match the SVGs.

States (close-ups at 2×): `zoom` (the zoom / fit / full-screen / sound column; at 390 the shot also shows the top bar and the History
panel's close, grip and resize icons), `hud` (Market, History, Rules, Menu), `replay` (the replay controls).

| | files |
|---|---|
| before | `D5-before-{zoom,hud,replay}-1440@2x.png`, `D5-before-{zoom,replay}-390@2x.png` |
| A | `D5-A-…` (same names) |
| B | `D5-B-…` (same names) |

Both options add `src/client/icons.js` (one list of icons; `ico(name)` in scripts, `<!--I:name-->` in the static markup, written in
by `build.mjs`) and replace every Unicode icon: zoom +/−/fit, the close ✕ (All cards, cancel purchase), the seven replay controls and
play/pause, the History panel's "bought →" arrow, the "arrived ★" in the chips, the ✓ in the replay's evaluation, "‹ Leaderboard".
Text arrows inside sentences ("plays Explorer → jungle") stay text.

**Option A: our own set** (branch `design/v3-D5-A`).
- The missing icons are drawn in the style of the existing History / sound / full-screen icons (20×20, 1.8 px stroke, round joins);
  play and the skip triangles are filled. The fit-board icon is a hexagon in frame corners (the board, not a generic "expand").
- Effort: small. Risk: low (layout test passes; the History arrow is sized to the cards so a turn still fits one row on short screens).
- Trade-offs: a little character (the hex), zero dependency; but every future icon has to be drawn by hand to match.

**Option B: Lucide** (branch `design/v3-D5-B`).
- Lucide (ISC licence), vendored: only the ~24 icons used, inlined as SVG (the page stays self-contained, ~5 KB before compression).
  It also replaces the existing custom UI icons (History, sound on/off, full screen, the History panel's close / put-back / grip / resize),
  so every control icon is one family. Game symbols (machete, paddle, coin, joker, the card-pile tile) stay custom.
- Effort: small. Risk: low (layout test passes).
- Trade-offs: a complete, consistent, well-known set, and any new icon is a copy-paste away; but it is a generic look (the same icons
  as thousands of apps), and Lucide's outlined play triangle is lighter than A's filled one on the gold button.

**Recommendation: B.** Consistency for every future icon is worth more than hand-drawn character on 20 px controls; the
character lives in the game symbols, which stay ours. (If you like A's hexagon "fit board" icon, it can stay as the one custom icon.)

(Other decisions are added below as they are finished.)

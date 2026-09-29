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

(Other decisions are added below as they are finished.)

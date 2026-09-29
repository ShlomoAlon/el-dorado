# Design mock-ups v3: D3 market, D4 card anatomy, D6 state colours

Screenshots of each option, taken by one script (`shoot.cjs`, same seeded deal and six scripted turns every time) so
`before`, `A` and `B` line up. Names: `D<n>-<before|A|B>-<state>-<1440|390>.png` (viewport 1440×900 or 390×844;
`@2x` = close-up at device scale 2).

(Options are added as they are finished.)

## D3. Market presentation

**Problem:** the always-on market cards are 72 px (44 px on phones), so their text is 5–7 px: the market is colour, not information.

States: `mid` (a game after six scripted turns, market on show), `allcards` (All cards open), `buying` (a purchase in
progress, one coin paid), `market` (close-up of the market, `@2x`).

| state | before | A | B |
|---|---|---|---|
| mid-play | `D3-before-mid-1440.png`, `D3-before-mid-390.png` | `D3-A-mid-1440.png`, `D3-A-mid-390.png` | |
| All cards | `D3-before-allcards-1440.png`, `D3-before-allcards-390.png` | `D3-A-allcards-1440.png`, `D3-A-allcards-390.png` | |
| buying | `D3-before-buying-1440.png`, `D3-before-buying-390.png` | `D3-A-buying-1440.png`, `D3-A-buying-390.png` | |
| market close-up | `D3-before-market-1440@2x.png`, `D3-before-market-390@2x.png` | `D3-A-market-1440@2x.png`, `D3-A-market-390@2x.png` | |

### Option A: a proper drawer — branch `design/v3-D3-A`
- **What changed:** the market is a panel with a heading ("Market", a line saying what you can do now, a close ✕),
  cards at 104 px on desktop (3 × 2 grid, sized to fit above the turn buttons; never under 96 px, otherwise it steps
  aside and the Market button opens All cards), and a full-width "All cards · Reserve locked" bar under the cards.
  The board fits beside it. No hover zoom any more: the cards are readable as they are.
  On phones it becomes a bottom sheet (grab handle, one scrolling row of 96 px cards). It starts closed on phones so the
  hand shows; while it is open it covers the piles and turn buttons (they hide under it), and it slides away while you
  pay so your hand is reachable. The Market button in the HUD stays.
- **Effort / risk:** small–medium (market.js sizing, one CSS block, camera and history panel read the new shape).
  `layout ok` at 5 sizes. Risk: on phones the sheet is modal-ish (close it to end your turn); the market is one tap away
  instead of always visible.
- **Trade-offs:** legible cards everywhere, at the cost of ~360 px of board width on desktop (the board shrinks a bit)
  and of the "glanceable" market on phones.

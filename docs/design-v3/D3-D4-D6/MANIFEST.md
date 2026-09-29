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
| mid-play | `D3-before-mid-1440.png`, `D3-before-mid-390.png` | `D3-A-mid-1440.png`, `D3-A-mid-390.png` | `D3-B-mid-1440.png`, `D3-B-mid-390.png` |
| All cards | `D3-before-allcards-1440.png`, `D3-before-allcards-390.png` | `D3-A-allcards-1440.png`, `D3-A-allcards-390.png` | `D3-B-allcards-1440.png`, `D3-B-allcards-390.png` |
| buying | `D3-before-buying-1440.png`, `D3-before-buying-390.png` | `D3-A-buying-1440.png`, `D3-A-buying-390.png` | `D3-B-buying-1440.png`, `D3-B-buying-390.png` |
| market close-up | `D3-before-market-1440@2x.png`, `D3-before-market-390@2x.png` | `D3-A-market-1440@2x.png`, `D3-A-market-390@2x.png` | `D3-B-market-1440@2x.png`, `D3-B-market-390@2x.png` |
| hover (B only) | | | `D3-B-hover-1440.png` |

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

### Option B: compact cards in the floating column — branch `design/v3-D3-B`
- **What changed:** the column stays where it is, but each stack is a compact row: the strength badge (or the action
  card's glyph) on the suit colour, the name in the display serif at 13.5 px (10.5 px on phones, where it was 5 px),
  the price coin, and a small "×2" count. No scene art. Hovering a row on desktop shows the full card beside it; All
  cards and the buy slot still show full cards. "All cards · Reserve locked" is a row of the same shape.
  The "Can buy" pill is gone (it collided with the next row); a mint ring and dimming the rest remain.
- **Effort / risk:** small (a compact face in cards.js, market.js sizing, one CSS block). `layout ok` at 5 sizes.
  Risk: low; flights and drags start from a card-shaped box at the row's left end.
- **Trade-offs:** everything in the market is readable at a glance and the board keeps most of its room, but the market
  no longer looks like cards (less charm), single-use and card text are only on hover / All cards, and on phones the
  column is wider (140 px vs ~95 px), so the history panel moves below it and covers more of the board.

## D4. Card anatomy

**Problem:** two round gold-ish badges per card (strength top-left, cost bottom-left) can be confused; the stack-count
badge is the heaviest mark on market cards; "SINGLE USE" is a loud red pill; the suit shows three times.

States: `hand` (the hand in place, with four fixed cards: Scout, Giant Machete, Photographer, Compass, `@2x`),
`handcards` (the same four cards laid flat at 150 px, so the whole face shows, `@2x`), `market` (close-up `@2x`), `allcards`.

| state | before | A | B |
|---|---|---|---|
| hand | `D4-before-hand-1440@2x.png` | `D4-A-hand-1440@2x.png` | `D4-B-hand-1440@2x.png` |
| hand cards, flat | `D4-before-handcards-1440@2x.png` | `D4-A-handcards-1440@2x.png` | `D4-B-handcards-1440@2x.png` |
| market close-up | `D4-before-market-1440@2x.png`, `D4-before-market-390@2x.png` | `D4-A-market-1440@2x.png`, `D4-A-market-390@2x.png` | `D4-B-market-1440@2x.png`, `D4-B-market-390@2x.png` |
| All cards | `D4-before-allcards-1440.png`, `D4-before-allcards-390.png` | `D4-A-allcards-1440.png`, `D4-A-allcards-390.png` | `D4-B-allcards-1440.png`, `D4-B-allcards-390.png` |

### Option A: price tag, quiet count, bookmark — branch `design/v3-D4-A`
- **What changed:** strength stays the round badge top-left. The cost is a parchment price tag (notched, with a string
  hole) in the frame's top-right corner: a different shape, colour and corner from the strength. The stack count is
  quiet "×3" text under the card instead of a black badge on it. Single use is a red bookmark hanging over the top edge
  instead of the red pill. The foot is now empty; in the market the "Can buy" tag sits there, inside the card.
- **Effort / risk:** small (cards.js markup, CSS, market count text and row gap). `layout ok` at 5 sizes. Risk: low.
- **Trade-offs:** strength and cost can no longer be mixed up, and the market is calmer. On the lightest art (coin cards)
  the parchment tag has less contrast; the bookmark needs learning once (its tooltip says "Single use"). The repeated
  suit icons stay (that is option B's change).

### Option B: no repeated icons, the name in the body — branch `design/v3-D4-B`
- **What changed:** the row of suit icons in the body is gone (the strength badge already says "2" with its symbol).
  The name leaves its floating dark band and becomes the body's heading in the display serif, about 1.4× larger
  (smaller for names over 10 letters, which wrap to two lines), with one quiet line under it ("2 machetes", or the
  action's text). The art is a little shorter (50% of the card instead of 55%). Cost coin, count badge and the
  SINGLE USE pill are unchanged.
- **Effort / risk:** small (cards.js markup, a few CSS rules). `layout ok` at 5 sizes. Risk: low; long action texts
  (Scientist, Travel Log, Native) are tight in 72 px market cards.
- **Trade-offs:** the name is the most legible thing on the card, and the suit shows twice instead of three times; but
  the two round badges (strength and cost) stay, so the confusion D4 started from remains, and the cards lose the
  "count the machetes" look of the physical game.

## D6. State colours

**Problem:** "can buy" is a mint green (`#8fe3a8`) used nowhere else and close to the jungle green; selected is gold;
danger is salmon/red, close to the Crimson player and the red base-camp spaces. Colour is often the only cue.

States: `mid` (the market with cards you can buy; the reserve is locked), `buying` (a purchase in progress), `allcards`
(market and the locked reserve), `chips` (the player chips, close-up `@2x`).

| state | before | A | B |
|---|---|---|---|
| market, can buy, reserve locked | `D6-before-mid-1440.png`, `D6-before-mid-390.png` | `D6-A-mid-1440.png`, `D6-A-mid-390.png` | |
| buying | `D6-before-buying-1440.png`, `D6-before-buying-390.png` | `D6-A-buying-1440.png`, `D6-A-buying-390.png` | |
| All cards | `D6-before-allcards-1440.png`, `D6-before-allcards-390.png` | `D6-A-allcards-1440.png`, `D6-A-allcards-390.png` | |
| player chips | `D6-before-chips-1440@2x.png` | `D6-A-chips-1440@2x.png` | |

### Option A: one state palette — branch `design/v3-D6-A`
- **What changed:** state colours are tokens (`--can` = gold, `--danger` = red). Everything that says "you can act on
  this" is gold: the Can buy ring and tag, the All cards tile, the Market button's ring. The card being bought gets a
  stronger gold ring and a "Buying" tag. Red is only danger: the salmon used for "these cards are lost" (base camps,
  removal, the cards a space costs) becomes the danger red, and SINGLE USE is no longer a red pill (dark, parchment
  text). The Crimson player becomes **Teal** (`#1fbfb8`), so no player is red.
- **Effort / risk:** small in CSS. The colour swap touches the engine's colour list: records that name the old Crimson
  hex are refused (the test fixtures were updated; old replays with a Crimson player would be dropped, which the
  owner allowed on 2026-09-29). `layout ok` at 5 sizes. Overlaps with D7 (player colours), done in another session.
- **Trade-offs:** fewer colours to learn and the board's red now always means trouble. But gold also marks the coin
  cards and the selected card, so "can buy" and "chosen" differ only in strength (hence the Buying tag). Colour is
  still the only cue for affordability.

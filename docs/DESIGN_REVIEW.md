# El Dorado Expedition: design review

Date: 2026-09-28. Scope: the whole client (start and setup, online sign-in, hub and room lobby, game board and HUD, cards, market, modals, journal, replay, end of game), at 1440×900, 1024×768, 390×844 (phone portrait) and 844×390 (phone landscape).

**Method.**
- Every claim below comes from a screenshot I took and looked at, or from a measurement taken in the running page (`getBoundingClientRect`, `getComputedStyle`, WCAG contrast computed from the actual token colours).
- Local play used `public/index.html`. Online screens used `wrangler dev` with `DEV_AUTH=1` on port 8791, which I stopped afterwards; I also deleted `.dev.vars`.
- The Google Fonts were served to the headless browser from copies I downloaded with curl, so the screenshots show the real Young Serif and Figtree.
- I changed no source files.

**Web access.** Web search worked. The research, including the recent guidance on AI-built UIs, was looked up during this review. Section 8 maps findings to sources, and section 9 lists every source with its date and URL. The few citations taken from memory rather than fetched are marked there.

**Screenshots.** The files are named `NN-state_size.png`, for example `01-start_390.png`. The first batch is in `docs/design-review/`. Later and re-taken shots were saved to the session scratchpad `design-review/` folder, to be copied into `docs/design-review/`. Files named `@2x` are 2× detail crops.

**Not verified:**
- the real Google sign-in button: accounts.google.com is unreachable from the sandbox, so `40-online-signin_1440.png` shows the error state;
- Safari and iOS behaviour;
- real touch pinch;
- frame rate (not measured in this review);
- sound.

---

## 1. Executive summary: the 10 most important findings, ranked

1. **The start screen is a settings form, not a start screen.** A first-time player faces 7 decisions before playing:
   - mode;
   - player count;
   - one seat type per player;
   - one name per player;
   - one colour per player;
   - course;
   - end rule, plus the privacy checkbox.

   Other problems on the same screen:
   - On a phone the form is 1244 px tall, so the only way to play ("Start expedition") is below the fold. In phone landscape it is 2.4 screens down.
   - "Online" looks like a mode toggle but behaves as a link to another screen.
   - "Replays", a niche feature, gets a button of the same weight as the main action.
   - The HUD of a game that doesn't exist yet shows through the blur behind it.

   See `01-start_*`. This breaks progressive disclosure (NN/g) and Hick's law, and it wastes the "first impression" window that Reinecke et al. (CHI 2013) measured at 500 ms.

2. **Card text is far too small to read almost everywhere except the hand.**
   - At 1440 px the market cards render titles at **7.1 px**, the subtitle ("2 MACHETES") at **5.2 px**, the action text at **4.6 px** and "SINGLE USE" at **4.5 px**.
   - On a phone the same elements are **4.3 / 3.2 / 2.8 / 2.7 px**.
   - The market therefore works only as a set of coloured thumbnails. Titles are also truncated ("Jack of All Trad…").
   - See `61-detail-market_1440@2x.png` and `11-game-start_390.png`.

3. **No spacing, type or shape scale: the chrome is built from one-off values.** The CSS contains:
   - **21 distinct px font sizes** (8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 19, 20, 26, 28);
   - **11 border radii** (2, 5, 7, 8, 9, 10, 11, 12, 14, 18, 999);
   - about **22 different padding pairs**;
   - **94 unique hex colours**, including six nearly identical dark surfaces (`#0a1210 #0b120f #0b1310 #0c1512 #0f1a16 #121d19`) of which only one is a token;
   - **58 inline `style="…"` attributes** in the UI scripts, 36 of them in `ui_online.js`.

   Controls come in 11 heights (22, 29, 30, 31, 33, 36, 37, 38, 39, 44, 45 px). This is the root cause of most alignment defects below. It is also the pattern that recent AI-UI guidance names as the main tell of AI-built interfaces ("random spacing", no locked tokens; see section 8).

4. **The HUD's top row is misaligned and overloaded.**
   - The brand box is 45 px tall, the player chips 29 px and the buttons 33 px, all top-aligned. That leaves three different bottom edges (57 / 41 / 45 px) and three vertical centres. The active chip is also nudged down 1 px.
   - "New game", a destructive action mid-game, has the same weight as "Rules".
   - On a phone the player strip is 160 px wide for 217 px of chips, so the **third player is hidden** (`11-game-start_390.png`). In a replay at 1440 px the third chip is clipped under "Market" (`30-replay_1440.png`).

5. **The primary action button moves between states, and secondary controls float over the board.**
   - The gold button sits at y = 658 for "End turn", y = 702 for "Reveal hand" and y = 710 for "Cancel" (buying). The main button should never move (muscle memory; Fitts's law).
   - The disabled "Undo" is a ghost at 35 % opacity, with contrast 2.0:1 against the board it floats over (`19-zoom-in_1440.png`).
   - The empty discard pile is a dashed box floating over the board.

6. **Keyboard focus is broken in modals and invisible on most controls.**
   - Modals don't trap focus. From the start screen, Tab first walks through the HUD buttons and zoom buttons *behind* the blur.
   - Segmented buttons, course cards, colour swatches, zoom buttons and replay buttons fall back to the browser's default ring, which computes to `outline: auto 1px rgb(16,16,16)`. That is a near-black ring on a near-black UI, so it is invisible (`50-focus-tab17_1440.png`).
   - This fails WCAG 2.4.7 Focus Visible (AA) in practice, and 2.4.11 Focus Not Obscured.

7. **The hand is cropped, and your coin cards look disabled.**
   - At rest, 15 % of each hand card is below the screen at 1440 px (cards end at y = 929 on a 900 px screen) and 26 % on a phone.
   - In the idle state, coin cards (Traveler, Photographer) are desaturated to 35 % saturation and 60 % brightness, because they can't *move* you. But they are exactly what you buy with, so the most important card for the "buy" branch looks unusable (`11-game-start_1440.png`).

8. **Board labelling has collisions and double meanings.**
   - The "El Dorado" label overlaps the middle FINISH hex (`60-detail-eldorado_1440@2x.png`).
   - Tile letters (B, C, N…) are 8 px grey type floating off the tiles.
   - Each blockade shows two numbers stacked (its id "4" and its cost "1"), which reads as "4 over 1" (`63-detail-start-blockade_1440@2x.png`).
   - The minimum zoom (0.25×) makes the board a postage stamp that is useless to anyone (`19-zoom-out_1440.png`).

9. **Online screens have form-page hierarchy problems and a destructive action styled as primary.**
   - The hub's Play tab shows two gold primary buttons plus ~12 controls. The create-room options wrap into two unlabelled rows of segmented controls, followed by a 3-line paragraph (`41-hub-play_1440.png`).
   - "Leave game", which costs rating, is the gold primary button, while "Stay" is secondary (`48-online-leave_1440.png`).
   - Room seat rows have unequal heights (38 vs 46 px).
   - Leaderboard columns have no headers.
   - In the online game the initial fit put El Dorado under the market (`47-online-myturn_1440.png`).

10. **The phone layouts are a shrunken desktop, not a phone design.**
    - A 44 px-wide column of six unreadable market cards covers the right edge of the board.
    - The board is fitted to ~40 % of the screen.
    - "Full screen" and "Sound" sit in the zoom column although the zoom buttons are hidden.
    - The hand shows only the top ~70 % of four cards.
    - In landscape the board gets about a quarter of the screen and the AI-turn recap is clipped (`20-ai-recap_844land.png`).

What is genuinely good:
- **Palette and colour contrast.** Body and muted text are 7–16:1.
- **The card art.** A consistent travel-poster silhouette style per suit.
- **The board.** Readable terrain, clear icon counts, strength shown by shading.
- **The illustrated explorer figures.**
- **The in-context buy slot.** The card waits above the hand with a "½ / 1" ring.
- **The AI-turn recap strip.** It is a genuinely good idea.
- **Keyboard shortcuts in replay.**
- **The layout test harness** (`test/layout.cjs`), which already prevents overlaps.

The bones are strong. The problems are mostly consistency, hierarchy and scale, and those are fixable.

---

## 2. The design language as it reads today

| Aspect | What is there |
|---|---|
| **Palette** | "Jungle at night + gold". Background `#0a1310` with a radial green vignette. Opaque dark-green panels (`--glass` is 90 % opaque, not blurred). Text `#ecf1ec`, muted text `#98aa9f`, accent gold `#e9b24a` / `#f8dc97`. The terrain colours (jungle green, water blue, village gold, rubble grey, camp red) double as the card suit colours, which is excellent. Stray colours outside the system: the mint "Can buy" green `#8fe3a8`, difficulty-tag green/amber/salmon, the salmon error `#f3c98b`, and six extra dark surfaces. |
| **Typography** | Young Serif for display (titles, card names, banner, round numbers on cards) and Figtree for the UI. Both fit the "expedition journal" feel. Figtree is used in 5 weights (400–800) and at 21 sizes. There is a heavy habit of UPPERCASE letter-spaced micro-labels at 10.5–11 px (field labels, "ROUND 1", "NEWEST FIRST", "IN PLAY", "LOCKED"). |
| **Shapes** | Rounded rectangles everywhere with radii from 7 to 18 px, pills for tags, circles for badges. Hexes on the board. There is no single corner rule. |
| **Materials** | Two worlds: (a) **physical objects**, where cards have gradient frames, an inner gold rule, embossed round badges and scene art, the deck back has a woven pattern, and the pieces are illustrated figures; (b) **flat "dark dashboard" chrome**: 1 px white-14 % borders on every panel, a large soft drop shadow, and a glow under the gold button. |
| **Motion** | One easing curve (`cubic-bezier(.2,.8,.2,1)`), 0.12–0.45 s, transform/opacity only. There is a turn banner, cards fly between zones, and trails show AI moves. The motion is coherent and restrained. `prefers-reduced-motion` is mostly respected; the exception is the turn banner and modal fade (section 6). |
| **Iconography** | Custom SVG glyphs for machete, paddle, coin, joker star, book, speaker and full screen, plus hand-drawn action-card emblems. **Mixed with Unicode glyphs:** `+ − ⤢` (zoom), `✕` (close), `⏮ « ‹ ▶ › » ⏭` (replay), `›` (recap arrows), `★` (finished). Unicode glyphs render with the system font's weight and metrics, so they never match the SVG set. |

**Verdict.**
- The *game objects* (board, cards, pieces) share a coherent, characterful language: "illustrated expedition kit". This is the product's identity.
- The *chrome* (HUD buttons, forms, modals, tags, the online hub) speaks a second, generic language: "dark SaaS settings page". It has native `<select>`s, a native checkbox, uppercase micro-labels, pill badges, the same bordered dark box everywhere and glowing CTAs.
- These are exactly the defaults that current guidance on AI-built UIs lists as tells: all-caps labels as a default, coloured glows, a bordered card for everything, generic form patterns (Developers Digest, Apr 2026; The Crit, Sep 2026; NN/g, Sep 2026).
- The dark theme itself is the owner's deliberate choice and fits the setting. It is not the problem.
- The gap between the two languages is widest on the start screen and the online hub, which are also the first things people see.

---

## 3. Screen-by-screen critique

### 3.1 Start / setup (local): `01-start_1440`, `01-start_1024`, `01-start_390`(+`_scrolled`), `01-start_844land`, `51-setup-2p-ai_1440`, `52-setup-4p_1440`, `25-newgame-ingame_1440`

**What works**
- The title in Young Serif gold with a one-line pitch sets the tone well.
- The course cards with difficulty and board letters are informative.
- The 2-player note appears only when relevant (`51-setup-2p-ai_1440`), which is good contextual help.
- An AI seat replaces the name field with a description of the AI.
- The board preview behind the modal updates when the course changes.

**What is off**

1. **It front-loads every option.**
   - A new player must parse "How are you playing?", "Players", "Expedition leaders", "Course", "Game ends" and a privacy checkbox.
   - Most people want "Play" (sensible defaults: 1 human vs 2 AIs, or pass-and-play for 3), "Play online" or "Continue".
   - NN/g's progressive-disclosure guidance is to show the few most-used options first and defer the rest.
   - Today the rarely-changed options (end rule, privacy, colours) get the same visual weight as the one action that matters.

2. **The primary action is out of reach on phones.**
   - At 390×844 the modal content is 1244 px tall, and "Start expedition" is reachable only by scrolling to the end.
   - At 844×390 it is about 2.4 screens down (`01-start_844land.png`).
   - At 1440×900 the modal is 890 px tall and sits **5 px** from the top and bottom edges while the scrim promises 16 px; it scrolls by 6 px.

3. **"On this device | Online" is a false segmented control.** Pressing "Online" does not select anything. It closes this modal and opens another one (sign-in or hub). A segmented control promises in-place state (Nielsen heuristic #4, consistency and standards). It should be two distinct entry points.

4. **The colour swatches are ambiguous.**
   - Each row shows all four colours, with the ones taken by *other* seats dimmed to 20 % opacity. At a glance each row looks like "four colours, two dark ones", and dimmed ivory reads as a *grey* option (`01-start_1440`: rows 2–3).
   - The swatches have no visible names (only `aria-label`), are 24 px, and show selection only by a white ring and a 1.1× scale.
   - In the 4-player setup every row repeats the same pattern (`52-setup-4p_1440`).

5. **Some information is shown twice.** Each course card already lists "Boards B · C · N · I · K", and the line under the grid repeats "Boards **B · C · N · I · K** · El Dorado (water side) · 4 blockades, dealt at random".

6. **Native controls break the language.** The `<select>` is custom-styled, but the checkbox is the browser's native 13 px box, indented 4 px from the column (see A2). Its label, "Hide each hand until its player taps "Reveal" (for pass-and-play with others)", is a sentence where a toggle titled "Pass-and-play privacy" would do.

7. **"Replays" as a peer of "Start expedition"** is extra. It is a secondary feature and belongs in a menu or footer link.

8. **Game HUD behind the modal.** The blurred "El Dorado ROUND", Market, Journal, Rules and New game buttons are visible behind the start screen (`01-start_1440`). They advertise controls that do nothing yet, and they are keyboard-focusable (see section 6).

9. **Naming drift.**
   - The app is "El Dorado Expedition" here, "El Dorado" in the HUD and "Online" in the hub title.
   - The primary action is "Start expedition" here, "Start game" in rooms, "New game" in the HUD and end screen, and "Create room" in the hub. One term per concept (Design.md News, Aug 2026; Nielsen #4).

**What is missing**
- A real title/landing state.
- A "Continue" as prominent as "New game". Resume exists (`#sResume`), but only as a small grey button.
- A visual course preview on the card itself: a thumbnail of the route shape would make course choice meaningful instead of a list of letters.

**Recommended direction** (decision for the owner, see D1):
- A title screen with the game name.
- Three large choices: **Play** (local, sensible defaults, one tap), **Play online**, **Continue**, if a save exists.
- A small **"Set up game…"** link that opens today's form, trimmed.
- "Rules" and "Replays" as quiet text links.

### 3.2 Online sign-in, hub, room lobby: `40-online-signin_1440`, `41-hub-play_1440/_390`, `42-hub-leaderboard_1440`, `43-hub-profile_*`, `44/45-room-lobby*`, `48-online-leave_1440`

**Sign-in**
- It is short and clear.
- The Google button is a pill (`shape:'pill'`) in Google's own black theme. That is a third button shape next to the 12 px-radius buttons. Using `shape:'rectangular'` would match better, but I could not see it render here.
- A `min-height:44px` placeholder leaves a 60 px hole when Google fails to load.

**Hub, Play tab: the densest screen in the app**

1. Two gold primaries ("Quick match", "Create room") compete. Quick match is the fast path and should be the only gold button.

2. The CTAs are placed inconsistently:
   - "Quick match" is right-aligned inside a bordered row;
   - "Create room" is left-aligned under its section;
   - "Join" is right-aligned next to its input;
   - "Back" is right-aligned at the bottom.

   The eye has to zig-zag.

3. The create-room settings are four unlabelled segmented controls (Public/Private, 2/3/4 players, Rated/Unrated, 60s/90s/2 min/3 min). They wrap into two ragged rows and are followed by a 3-line explanatory paragraph that changes with the toggles. Each group needs a label, or better, sensible defaults behind an "Options" disclosure.

4. The status "Shlomo · rating 1200 · 0 games" is 12 px muted text right-aligned on the title baseline. Rating is the most motivating number here and deserves more weight.

5. The join-code placeholder "E.G. K7Q2M" is uppercase and letter-spaced, so it looks like typed text.

**Leaderboard**
- It is clean.
- The numeric columns ("1530", "0/0") have no headers. You only learn that "0/0" means wins/rated games from a footnote.
- The AI tags, tier words and names are baseline-aligned, which is good.

**Room lobby**
- The seat rows are 38 px (you) and 46 px (AI, because of the 28 px "×" button). Fix both at 48 px.
- The "(you)" and "host · here" metadata are placed differently in each row.
- The "Add an AI player" cards reuse the course-card style, which is good.
- "Your colour" swatches have no names.
- The disabled AI card (already seated) at 40 % opacity is fine.

**Leave game** (`48-online-leave_1440`)
- The irreversible, rating-losing action is the gold primary, and the safe action ("Stay") is secondary.
- Destructive actions should use a distinct danger style, and the default/primary should be the safe choice (NN/g error-prevention heuristic #5).

### 3.3 Game: HUD, prompt, board, hand, piles: `11-game-start_*`, `12-card-aim_*`, `13-hand-hover_1440`, `62-detail-hud_1440@2x`, `64-detail-bottom-right_1440@2x`

**What works**
- The board dominates, as it should.
- The prompt names whose turn it is with their colour dot.
- The aim arrow and highlighted target ring are clear (`12-card-aim_1440`), and so is the "Uses 1 of 1 machete" tooltip.
- The zoom column's left edge (16 px) matches the deck pile's.
- The right-hand column (market, End turn, discard, HUD) shares one right edge at x = 1424. That is good.

**HUD issues**
- See finding 4 and alignment items A7–A8.
- The HUD mixes three kinds of item in one row: identity (brand + round), game state (chips) and navigation (Market / Journal / Rules / New game).
- The round number, one of the most important pieces of state, is 11 px muted uppercase next to the logo.
- Only "Journal" has an icon; "Market", "Rules" and "New game" are text only.
- "Market" is both a toggle (gold outline = open) and, on cramped screens, a button that opens the full-screen card spread. Same control, two behaviours.

**Prompt**
- It is useful, but centred multi-line text with an inline name chip wraps badly: the second line starts under the name (`11-game-start_390`, `17-endturn-2_390`).
- The copy is long. In buy mode: "Buying Scout: ½ of 1 paid. Drag or tap cards to pay; it's bought as soon as they cover the price. Coin cards and jokers pay their value, others ½." That is 2 lines at 1440 px and 3 on a phone (`16-buying_1440`). The ½-coin rule could live in a tooltip or in the ring itself.

**Board**
- The terrain reads well. Tint by difficulty and icon counts are excellent.
- Issues are listed under finding 8 and A20.
- The start spaces ("1 2 3 4") are nearly invisible beige-on-beige until a piece stands on them.
- The FINISH text is ~7 px uppercase Figtree inside the hex.
- The tile letters use a different face (Young Serif) at 8 px grey.

**Zoom**
- The range is 0.25–3.2×. At 0.25× the whole course is ~400 px wide in a 1440 px window (`19-zoom-out_1440`).
- The minimum should be around the "fit" scale. The maximum is fine (`19-zoom-in_1440`, `19-zoom-in_390`), and the board stays sharp.
- On phones the +/− buttons are hidden (pinch only). The column then holds only Full screen and Sound, which are not zoom controls, stacked above the deck (`11-game-start_390`).

**Hand**
- The fan and hover-lift are pleasant (`13-hand-hover_1440`).
- The resting crop and the dimming of coin cards are covered in finding 7.
- On a phone, with four cards fanned at 88 px, the titles are covered by the next card (`11-game-start_390`).
- After a card is played the fan is not re-centred on the board area (`16b-buying-paid1_1440`: the remaining cards sit at x 600–960, centre 780, in a 1440 px window).

**Piles**
- The deck back (a diagonal weave plus a gold ring) is plainer than the cards. It reads as a placeholder.
- The empty discard is a dashed outline floating on the board. Its dashed border is 1.48:1 against the background.

**Action buttons**
- Sizes are good (End turn 44 px tall).
- The column changes composition per state and moves the primary button (finding 5).

### 3.4 Market and "All cards": `14-market-hover_1440`, `61-detail-market_1440@2x`, `18-market-closed_*`, `23-allcards_*`

- **Floating market.** Six 72 px cards (44 px on a phone) plus an "All cards" tile. Hover scales a card 1.9×, which is the only way to read it on desktop (`14-market-hover_1440`); on a phone there is no hover.
- **Badges.** Each card carries a black "3" count badge that is *bigger and heavier than the card's own strength number*.
- **"Can buy" tags.** Mint-green tags hang 7 px under each card, into the 10 px row gap, nearly touching the badge of the card below.
- **Affordability.** It is signalled by brightness (the rest are dimmed to 55 %), a mint ring and the tag: three signals for one fact.
- **All cards** (`23-allcards_1440`) is a good reference screen and the only place the cards are legible (112 px). Three issues:
  - its close "✕" is pinned to the window's top-right corner, 128 px outside the 1080 px content column;
  - the heading's sub-label ("1 PURCHASE PER TURN" / "BOUGHT THIS TURN") changes meaning between states;
  - reserve cards are dimmed with no lock icon.
- **Landscape phone.** The market becomes a horizontal strip across the top and pushes the prompt into a 320 px box (`20-ai-recap_844land`).

### 3.5 Buying, end of turn, AI recap: `16-buying_*`, `16b-buying-paid1_*`, `17-endturn-1/2_*`, `20-ai-recap_*`

- **Buy slot.** The card appears above the hand with a dashed gold outline, a paid/cost ring and an ✕. It is clear and on-theme, and the best interaction design in the game. It floats over the middle of the board, though; anchoring it just above the hand would keep the board readable.
- **Buy warning** ("You can still afford Scout, Trailblazer, Jack of All Trades and 2 more. Buy one before ending your turn?") is helpful. The three buttons ("End turn anyway", "Back", "See cards") put the primary on top and the two secondaries in a row below; "See cards" means "open the market".
- **End turn** ("Your leftover cards will be discarded. Tap a card to keep it…") has three buttons, "Discard & end turn", "Back" and "Keep all". Kept cards get a label chip. This works.
- **AI recap strip** (`20-ai-recap_1440`) is a strong idea: little cards per step, with captions. Problems:
  - It lives inside the prompt, making the prompt 150 px tall over the board.
  - The captions are 11 px muted.
  - The "Ben's turn" label sits at the far left while the step groups are right-aligned (`justify-content:flex-end`), leaving a gap between label and content.
  - On a phone it becomes a vertical stack (`20-ai-recap_390`). In landscape it is clipped (`20-ai-recap_844land`).
  - It stays until you act, so it often covers the top of the board during your own turn.

### 3.6 Modals: journal, rules, piles, game over, privacy cover: `21-journal_*`, `22-rules_*`, `24-deckpile_*`, `26-gameover_*`, `27-gameover-board_*`, `53-privacy-cover_1440`

- **All modals share one template:** serif title, muted subtitle, content, right-aligned buttons. That is consistent and good.
- **Journal.** Round headers are sticky, and the "newest first" label is good. It is a 580 px modal even when it holds one line (`21-journal_1440`). A side drawer would let you read it while looking at the board.
- **Rules.**
  - It is a long wall of text (`22-rules_1440`, 2+ screens) with no table of contents, no card or terrain illustrations, and the most important section ("Your turn") third, after "Game end", "Online" and "AI players".
  - Reorder it: Goal → Your turn → Moving → Buying → Blockades → Ending. Put Online/AI/About-the-boards in an appendix.
  - Use the game's own icons inline (machete, paddle, coin).
- **Draw/discard pile viewers** are fine. The sub-copy "(the real order is hidden)" is good.
- **Game over.**
  - The winner-coloured first row and the "View board / New game" buttons are good.
  - The status column is right-aligned via `space-between`, so on a phone the three rows' text starts at x = 156, 161 and 145 (`26-gameover_390`), which is ragged.
  - The tie-break footnote appears even when nobody tied on round.
  - There is no celebration moment for the winner beyond the heading (a Young Serif "Ana wins").
- **Privacy cover** (`53-privacy-cover_1440`) works. The "Reveal hand" button sits 44 px lower than "End turn" (finding 5).
- **Banner** ("Ana / ROUND 1", `10-game-banner_1440`) is a nice, calm turn cue.

### 3.7 Replay: `30-replay_*`, `31-replay-nobotview_*`

- **Dock.** The dock is its own grid cell (good; nothing overlaps). Transport buttons use Unicode glyphs (`⏮ « ‹ ▶ › » ⏭`) whose weights differ, and "«"/"»" (turn) vs "‹"/"›" (move) is a subtle distinction for glyphs of the same size.
- **Speed control.** It is a segmented control, as it should be.
- **Bot's view side panel.** For heuristic bots it is almost empty: one sentence in 340 px.
- **"Exit replay"** replaces "New game" in the same HUD slot. Good reuse.
- **Chip overflow.** With the side panel open at 1440 px, the third player chip is clipped under "Market" (`30-replay_1440`).
- **Stale fixture.** The `test/fixtures/replay.json` fixture now produces a toast: "56 moves in this log didn't fit the game (first: move 115)". The fixture predates a rule change and should be regenerated.

---

## 4. Alignment and spacing: concrete defects the developer can fix directly

Measured with `getBoundingClientRect` (CSS px). "1440" = 1440×900; "390" = 390×844.

| # | Screen / selector | Measured | Should be |
|---|---|---|---|
| A1 | Start: `.modal` at 1440×900 | top 5, bottom 895 (height 890), content 894 vs client 888: scrolls 6 px; the scrim's 16 px padding is lost | ≥16 px gutter: `max-height: calc(100dvh - 32px)` enforced, and trim content so it fits without scrolling at ≥ 900 px |
| A2 | Start: `#sPriv` checkbox | x = 434 vs column x = 430 (390: 46 vs 42); native 13×13 | Left edge at 430; custom 20–24 px control (or a toggle), label baseline-aligned |
| A3 | Start: one seat row | `select.who` 36 px tall (y 311.1–347.1), name `input` 37 px (310.6–347.6), `.seg` 38 px, swatches 24 px | One control height token (e.g. 40 px) for select, input and seg; swatches vertically centred on it |
| A4 | Start: `.clist` cards | 57.3 px tall with a difficulty tag, 56 px for "Random course" | Same fixed min-height (e.g. 60 px) |
| A5 | Start: vertical rhythm | label→control 8 px; field→field 18 px; last field→buttons 22 px; subtitle→first label 20 px | Tokenised scale 4/8/16/24/32: label→control 8, field→field 24, section→actions 32 |
| A6 | Start: `.routeInfo` | duplicates the selected card's board list, 10 px under the grid | Remove, or fold into the selected card |
| A7 | HUD: `.brandbox` / `.pchip` / `.tbtn` | heights 45 / 29 / 33, all top-aligned at y = 12 → bottoms 57 / 41 / 45, centres 34.5 / 26.5 / 28.5; active chip `translateY(1px)` → y 13 vs 12 | One HUD item height (36–40 px), `align-items:center`; drop the 1 px nudge (use only the border/fill for "active") |
| A8 | Game: `#prompt` vs `#mkt` | prompt top 64 px, market top 66 px | Same top token (e.g. `--row2: 64px`) |
| A9 | Button family | `.tbtn` 33 px, r 11; zoom 36 px, r 10; `.btn` 36/44 px, r 12/14; `.bs-x` 26 px round; `.sclose` 28 px r 8; `#allClose` 36 px; `.rmai` 28 round; replay 34 px r 9 | Two sizes (36 and 44), one radius (e.g. 10), one icon-button spec |
| A10 | Game: `#actBtns` primary position | "End turn" y 658; "Reveal hand" y 702; pay mode "Cancel" y 710; buy-warn "End turn anyway" y 658 | Primary always in the same slot (bottom of the column, directly above the discard label); secondaries stack *above* it |
| A11 | Game: hand at rest | cards' bottom 929 on a 900 px screen (15 % hidden); 390: 877 on 844 (26 % hidden) | Resting hand fully visible, or at least title + strength + cost; peek below only while the board is being panned |
| A12 | Game: hand fan centre | after one card leaves: cards span 600–960 (centre 780) while the board area centres ~ (16+1262)/2 = 639 | Re-centre the fan on the playable area after each change |
| A13 | Game: `#players` on phone | strip 160 px wide, chips total 217 px → 3rd chip hidden; replay 1440: 3rd chip clipped under `#mktBtn` | Compact chips (dot + initial + ★) that always fit, or a second row |
| A14 | Game: `#prompt` text | centred, inline `.who` chip; wrapped lines start under the name (390) | Left-align with the name as a fixed first column, or put the name on its own line |
| A15 | Market: `.mslot.can::after` "Can buy" | extends 7 px below the card into a 10 px gap; count badge `.cnt` (21 px, −7/−7) overhangs into the 8 px column gap | Give tags room (row gap ≥ 16) or put the state inside the card frame |
| A16 | Market: `.c-title` | "Jack of All Trad…" truncated at 72 px and 112 px | Shorter display name ("Jack-of-all-Trades" → 2 lines) or a larger card |
| A17 | All cards: `#allClose` | x 1388–1424 while content column spans 180–1260 | Put the close button in the heading row, right-aligned to the column |
| A18 | Game over: result rows (`.prow` with `space-between`) | 390: status text starts at x 156 / 161 / 145 | CSS grid: place \| dot+name \| status, fixed columns |
| A19 | Room lobby: seat rows | 38 px (you) vs 46 px (AI with 28 px ✕) | `min-height: 48px`, same inner padding |
| A20 | Board: El Dorado label | label box overlaps the middle FINISH hex (`60-detail-eldorado_1440@2x`) | Place the label above the pyramid, or on the city |
| A21 | Board: blockade badge | id number in a 12 px circle stacked on the cost diamond | One marker: the cost in the diamond; the id in the tooltip / on hover |
| A22 | Hub: CTA alignment | "Quick match" right, "Create room" left, "Join" right, "Back" right | One rule: primary actions right-aligned at the section end (or all left) |
| A23 | Online game initial fit | board extends under `#mkt`; El Dorado hidden (`47-online-myturn_1440`) | Online `fit()` should respect `--mktFoot` like local play does |
| A24 | Zoom limits | `view.s` 0.25–3.2 | Minimum ≈ fit scale × 0.8 |

---

## 5. Design-language issues that need the owner's decision

Each item describes the problem and gives 1–2 options. None is a single prescribed answer.

**D1. The start screen's role.**
- *Problem:* a settings form is the first thing people see (section 3.1).
- *Option A:* a title screen with three big choices (Play / Online / Continue), where "Play" starts at once with remembered settings and a "Set up game…" link opens the form.
- *Option B:* keep one screen, but split it into a short top (mode as two big tiles, players, "Start") and a collapsed "More options" (course, colours, end rule, privacy). Put the course choice on a visual board thumbnail.

**D2. One language for the chrome: "expedition kit" or "quiet dashboard".**
- *Problem:* cards and board are illustrated objects, while the chrome is generic dark UI with native form controls, uppercase micro-labels and pills.
- *Option A:* push the chrome toward the game. Parchment/leather-toned panels (still dark), Young Serif for section titles instead of letter-spaced caps, brass-framed buttons.
- *Option B:* keep the chrome deliberately quiet and flat, but strict: one surface colour, one border, one radius, sentence-case labels, no glows. Let the cards carry all the character.
- Either way, write it down as tokens (see D8).

**D3. Market presentation.**
- *Problem:* 72 px (44 px on phones) cards are unreadable (5–7 px text), so the always-on market is decoration plus colour.
- *Option A:* make the market a proper drawer (right side on desktop, bottom sheet on phones) with legible ≥ 96 px cards, and keep the HUD button.
- *Option B:* keep the floating column, but redesign a "compact card" variant for it: name at ≥ 11 px, cost, strength and symbol only, no scene art.

**D4. Card anatomy.**
- *Problem:* there are two round badges on each card, both gold-ish on coin cards. The strength badge (top-left) and the cost coin (bottom-left) can be confused.
- More problems:
  - the stack-count badge is the heaviest mark on market cards;
  - "SINGLE USE" is a red pill;
  - the suit is shown three times (frame colour, badge icon, repeated icons in the body).
- *Option A:* strength top-left (as now), cost as a small price tag top-right in the frame, count as "×3" small text under the card, single-use as a torn-corner or bookmark shape.
- *Option B:* remove the repeated body icons (the badge already says "2 machetes") and use the space for the name at a legible size.

**D5. Iconography set.**
- *Problem:* custom SVG glyphs mixed with Unicode (`+ − ⤢ ✕ ⏮ « ‹ ▶ › » ⏭ ★`).
- *Option A:* draw the ~12 UI icons in the same stroke style as the book / speaker / full-screen icons (1.7–2 px stroke, round joins).
- *Option B:* vendor one well-known open icon set (e.g. Lucide or Phosphor) and use it for all UI icons, keeping the custom glyphs for game symbols only. This is consistent with the owner's library rule: an icon set is a "genuinely difficult" design problem when done well.

**D6. State colours.**
- *Problem:* affordability uses a mint green (`#8fe3a8`) that exists nowhere else and is close to the jungle suit green. Selected uses gold. Danger uses salmon/red close to the Crimson player colour and to the base-camp tile.
- *Option A:* one state palette. Gold = "you can act on this", red = danger only; players never use pure red (swap Crimson for a different hue).
- *Option B:* keep the colours but add shapes (a coin icon for "can buy", a lock icon for the locked reserve) so colour is never the only cue (WCAG 1.4.1).

**D7. Player colours.**
- *Problem:* Crimson `#e5484d` sits next to red base camps and the danger colour; Violet echoes the purple action cards; Ivory reads as "empty/neutral" and is nearly invisible when dimmed on the setup screen.
- *Option A:* a 4-colour set chosen for distinctness from the terrain and suit hues (e.g. teal, magenta, white, black, with outlines).
- *Option B:* keep the hues, but always pair colour with the figure's hat shape or an initial in chips and on the board.

**D8. Codify tokens before more UI is added (AI-agent context).**
- *Problem:* 21 font sizes, 11 radii, 94 hex colours and 58 inline styles. New screens drift, because every new piece of UI (including UI written by an AI agent) invents values.
- *Option A:* a small design-tokens block in `shell.html :root`, plus a short `docs/DESIGN.md`. It should cover:
  - a type scale (e.g. 12/14/16/20/28/40);
  - space (4/8/16/24/32);
  - two control heights (36/44);
  - one radius;
  - three surface colours;
  - the state colours;
  - a written "never do" list (no Unicode icons, no inline styles, no uppercase labels below 12 px, no native form controls).

  Then reference it from CLAUDE.md. This is exactly the "global context" pattern NN/g recommends for AI agents (Kohler, 18 Sep 2026) and the "add UX to generation" advice (Kaley & Budiu, 28 Aug 2026).
- *Option B:* the same tokens enforced by a tiny lint step in `build.mjs`, which fails on new raw hex, px font sizes or `style="` in UI scripts.

**D9. The HUD's content.**
- *Problem:* identity, state and navigation share one row, and a destructive action ("New game") sits among navigation buttons.
- *Option A:* left = round + turn order (state), right = a single "☰ Menu" (New game, Rules, Journal, Replays, Sound, Full screen) plus the Market toggle.
- *Option B:* keep the buttons visible on desktop, but move "New game" into a menu and give Sound / Full screen a home next to it instead of in the zoom column.

---

## 6. Accessibility and usability

**Contrast** (WCAG 2.2 SC 1.4.3 / 1.4.11), computed from the actual token colours:
- **Good.** Body text `#ecf1ec` on panels: 16:1. Muted `#98aa9f` on modal `#121d19`: 7.1:1. Gold text: 12.9:1. Gold-button ink: 5.8:1. Difficulty tags: ≥ 9.9:1. Colour contrast of text is a strength.
- **Faint text.** `--faint #62756a` on `#0c1512`: 3.8:1 (fails AA for normal text; used for empty-slot labels).
- **Component boundaries (SC 1.4.11 needs 3:1).**
  - input and card border `--line2` (white 14 %) on the background: **1.48:1**;
  - segmented control border (white 8 %) on the modal: **1.25:1**;
  - text inputs therefore rely on a fill that is itself only ~1.1:1 from the modal.
- **Disabled "Undo"** over the board: **2.0:1**. Disabled controls are exempt, but here the control floats over busy art and simply vanishes.

**Text size.**
- Card text in the market is 4.5–7 px at 1440 px and 2.7–4.3 px on a phone (finding 2).
- Recap captions and chip stats are 11–12 px, and UI micro-labels 10.5 px uppercase.
- The Game Accessibility Guidelines (basic level) ask for large default text, and Apple HIG gives 11 pt as the absolute minimum.

**Target sizes** (WCAG 2.5.8 AA = 24×24 px; 2.5.5 AAA and Apple = 44; NN/g ≈ 1 cm):
- Everything passes AA.
- On a phone, several frequent targets are below 44 px:
  - HUD buttons: 31 px tall; the Journal icon button is 35×31;
  - player chips: 29 px;
  - Full screen / Sound: 36 px;
  - Undo: 36 px;
  - colour swatches: 24 px;
  - the ✕ on the buy slot: 26 px;
  - market cards: 44×62.
- Parhi et al. (2006) found ~9.2 mm (≈ 44–48 px) targets necessary for one-handed thumb use.

**Keyboard and focus.**
- Modals are not focus-trapped, don't set `aria-modal`, and leave the game behind them in the tab order: from the start screen, Tab goes to Market, Journal, Rules, New game, then the zoom buttons first.
- Focus rings are only defined for `.tbtn`, `.btn`, inputs and selects. Segmented buttons, course cards, swatches, zoom buttons, replay buttons and market cards show the browser default, `outline: auto 1px rgb(16,16,16)`, which is invisible on this UI.
- Hand cards and market cards are `div`s with pointer handlers. They are not reachable by keyboard at all, so the game cannot be played without a pointer.

**Colour-only cues.**
- Affordability (mint ring), player identity (dot colour) and selected colour swatch (white ring) have no text or shape backup.
- The swatches have no visible name.

**Motion.**
- The global `prefers-reduced-motion` rule shortens CSS transitions and animations, and several JS paths check `reduceMotion`.
- The **turn banner** (`banner()`) and the modal close fade (`closeModal()`) use `element.animate()` without checking it. The CSS rule does not affect the Web Animations API, so the banner still slides and scales under reduced motion (`54-reduced-motion-banner_1440.png`, captured 300 ms after start with reduce on).
- Fix: skip the transform keyframes (fade only) when `reduceMotion` is set.
- The timer's infinite pulse is correctly stopped by the CSS rule.

**Phone readability.**
- Covered in finding 10 and A13–A14.
- The start form and hub are long single-column scrolls with the main action at the end.

**Usability observations** (Nielsen heuristics / Pinelle et al. game heuristics):
- **Visibility of status (#1).** The round number is 11 px, and the recap strip lingers into your own turn.
- **Consistency (#4).** Toggle-that-navigates ("Online"), and the Market button that toggles or opens a spread depending on width.
- **Error prevention (#5).** "Leave game" is the default gold action.
- **Recognition over recall (#6).** The market can't be read without hover, which phones lack.
- **Aesthetic and minimalist (#8).** Duplicated route line, triple affordability signals, a long rules text.
- **Pinelle #7, "provide users with information on game status".** The hidden 3rd player chip on phones.
- **Observed on touch (likely bug).** Selecting a card with no reachable space draws the aim arrow from the card to the top edge of the screen instead of to the explorer (`12-card-aim_390`).

---

## 7. Prioritised action list

**Quick wins** (developer can do now, no design decision; hours, not days):
1. Focus: one visible focus style for every interactive element (gold 2 px outline + 2 px offset), a focus trap and `aria-modal` in `modal()`, and `inert` on `#app` while a modal is open.
2. HUD row: one height, centred; remove the 1 px active nudge; match the prompt and market tops (A7, A8).
3. Start form: fix A1–A5 (fit, checkbox alignment, one control height, card heights, spacing scale); remove the duplicated route line (A6).
4. Primary action button in a fixed slot (A10); hide "Undo" instead of showing a 35 % ghost over the board when it isn't available, or give the button column its own backing.
5. Don't dim coin cards in the idle state (they can buy); dim only cards with no use at all.
6. Zoom minimum ≈ fit (A24); online fit respects the market (A23); El Dorado label and blockade badge (A20, A21).
7. Game-over rows as a grid (A18); lobby row heights (A19); leaderboard column headers; the hub's CTA alignment (A22).
8. "Leave game": make "Stay" the primary, and give "Leave" a danger style.
9. Regenerate `test/fixtures/replay.json` so replays open without the "56 moves didn't fit" toast.
10. Honour `reduceMotion` in `banner()` and `closeModal()` (Web Animations bypass the CSS rule).
11. Replace the Unicode `✕` close buttons and zoom `+ − ⤢` with SVGs from the existing icon style (a stop-gap until D5).

**Bigger design decisions** (need the owner):
1. D1 start screen: a title screen with Play / Online / Continue and progressive disclosure. *Highest impact on first impressions.*
2. D3 market legibility (drawer vs compact card), together with D4 card anatomy.
3. D8 tokens + `docs/DESIGN.md` as global context for every future change. *Highest leverage for keeping future AI-written UI consistent.*
4. D2 chrome language (kit vs quiet), D5 icon set, D6/D7 state and player colours.
5. D9 HUD content and a menu; a phone-first layout pass (market as a bottom sheet, a hand that shows full card faces, compact chips).
6. Rules rewrite with inline game icons and a turn-first order; a journal drawer instead of a modal.

---

## 8. Research basis: which finding rests on which source

**Classic HCI and design research** (papers):
- **Fitts's law** (Fitts, 1954): the primary action must stay put and be large, because pointing time grows with distance and shrinks with target size. Basis for finding 5 and A10.
- **Touch target size** (Parhi, Karlson & Bederson, MobileHCI 2006: 9.2 mm for discrete thumb taps): the phone target list in section 6.
- **First impressions** (Reinecke et al., CHI 2013: aesthetic judgements form within 500 ms and are driven by visual complexity and colourfulness): basis for making the start screen simple (finding 1, D1). Also for reducing redundant signals and chrome (the market, and the HUD behind the start modal).
- **Game usability heuristics** (Pinelle, Wong & Stach, CHI 2008): status visibility, readable controls, and "provide users with information on game status". Basis for the chip clipping, recap and round-number findings (sections 3.3, 6).
- **Gestalt proximity and common region** (Wertheimer 1923; Palmer 1992): the HUD grouping, the start form's label→field spacing (A5) and the "one bordered box for everything" critique (D2). *From memory, not re-fetched in this session.*

**Industry practice:**
- **NN/g's 10 usability heuristics** (consistency, error prevention, recognition over recall, minimalist design): sections 3.1, 3.2, 6. *From memory.*
- **NN/g progressive disclosure:** D1. *From memory.*
- **NN/g touch targets** (Harley, 2019: ≈ 1 cm): section 6.
- **W3C WCAG 2.2** SC 2.5.8 (24 px AA) / 2.5.5 (44 px AAA), fetched. SC 1.4.3, 1.4.11, 1.4.1 and 2.4.7 are *from memory*. They underpin the contrast, focus and target sections.
- **Game Accessibility Guidelines** (readable default font size, basic level): finding 2.
- **Digital board-game adaptation practice** (Workinman, "Making digital board games feel real"; Bassettone, "5 UX/UI lessons from designing a card game"): card readability in hand and the market, and keeping the HUD concise (sections 3.3, 3.4).

**Recent guidance on building UI with AI** (the owner asked for material from roughly the last month):
- **NN/g, "The Custodial Era of UX: Cleaning Up After AI"** (Kaley & Budiu, 28 Aug 2026). AI makes building cheaper than evaluating, so teams accumulate UX debt. Their fix is to capture UX knowledge in context files and design systems so problems are prevented at generation time. → D8, and the whole framing of section 4 as a checklist.
- **NN/g, "Test Complex Interactions Earlier with AI Prototyping"** (Chan, 11 Sep 2026). Polished AI output "may falsely appear production-ready" and can use "the wrong design pattern", so a designer must review before shipping. → the false segmented control ("Online"), the toggle-that-navigates Market button, and the native form controls.
- **NN/g, "The 3 Roles of Context for AI Agents"** (Kohler, 18 Sep 2026). Design systems and brand rules belong in *global context* the agent always sees. → D8 (reference `docs/DESIGN.md` from CLAUDE.md).
- **NN/g, "AI Prototyping in Real Design Contexts"** (Wang & Brown, 24 Oct 2025, *last reviewed 19 Aug 2026*). AI output "often miss[es]… visual hierarchy, color contrast, spacing, and grouping" and defaults to generic minimalism. → findings 3–4, section 4.
- **The Crit, "Why your vibe-coded app looks like every other AI app"** (Kipple, Sep 2026; the day is not stated). Commit to a spacing rhythm and a clear emphasis ladder (one primary CTA), and avoid centring everything. → the two-gold-CTA hub, the centred prompt text (A14), and the spacing scale (A5).

**Older AI-UI sources, used only as corroboration** (older than one month, so not relied on for recommendations):
- Developers Digest, 16 "AI slop" patterns (22 Apr 2026): uppercase labels as default, coloured glows, permanent dark mode, poor dark-theme contrast.
- MindStudio (28 Apr 2026): exact tokens and negative constraints.
- SmoothUI (24 Jun 2026): missing focus states and contrast as typical AI-UI gaps.
- Rohit Raj (18 Jul 2026).
- Design.md News (1 Aug 2026): one term per concept; anti-pattern lists.
- Digital Applied (2 Aug 2026): the screenshot-critique loop catches spacing, hierarchy and alignment drift but not interaction states or motion. This is the method used here.
- UXBench (arXiv, 15 Jun 2026): LLM-generated UX critiques vary in actionability. That is why this report gives measured values rather than impressions.

The owner specifically asked for recent AI guidance. The consistent message across the recent NN/g pieces is that the quality problem is **missing design decisions and missing evaluation**, not the tool. The practical response is a written, tokenised design spec the agent always reads (D8), plus a measured review loop like `test/layout.cjs`, which this project already has and should extend: for example, to assert a single control height, focus visibility and a minimum text size.

---

## 9. Sources

**Research papers**
- Fitts, P. M. (1954). The information capacity of the human motor system in controlling the amplitude of movement. *J. Exp. Psychology* 47(6). https://doi.org/10.1037/h0055392 (from memory; not fetched)
- Parhi, P., Karlson, A., Bederson, B. (2006). Target size study for one-handed thumb use on small touchscreen devices. MobileHCI '06. https://dl.acm.org/doi/10.1145/1152215.1152260 (PDF: https://www.microsoft.com/en-us/research/wp-content/uploads/2006/01/parhi-mobileHCI06.pdf)
- Pinelle, D., Wong, N., Stach, T. (2008). Heuristic evaluation for games: usability principles for video game design. CHI '08, pp. 1453–1462. https://dl.acm.org/doi/10.1145/1357054.1357282
- Reinecke, K., Yeh, T., Miratrix, L., Mardiko, R., Zhao, Y., Liu, J., Gajos, K. Z. (2013). Predicting users' first impressions of website aesthetics with a quantification of perceived visual complexity and colorfulness. CHI '13. https://dl.acm.org/doi/10.1145/2470654.2481281
- Palmer, S. E. (1992). Common region: a new principle of perceptual grouping. *Cognitive Psychology* 24(3). (from memory; not fetched)
- Wang, W. et al. (submitted 15 Jun 2026). UXBench: Measuring the Actionability of LLM-Generated UX Critiques. arXiv:2606.16262. https://arxiv.org/abs/2606.16262

**Standards and industry guidance**
- W3C, WCAG 2.2 Understanding SC 2.5.8 Target Size (Minimum) (W3C Recommendation, Oct 2023). https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (SC 1.4.1, 1.4.3, 1.4.11, 2.4.7, 2.4.11 cited from the same spec, from memory)
- Harley, A. (NN/g, 5 May 2019). Touch Targets on Touchscreens. https://www.nngroup.com/articles/touch-target-size/
- Nielsen, J. (NN/g; 1994, updated 2024). 10 Usability Heuristics for User Interface Design. https://www.nngroup.com/articles/ten-usability-heuristics/ (from memory; not fetched)
- NN/g. Progressive Disclosure. https://www.nngroup.com/articles/progressive-disclosure/ (from memory; not fetched)
- Game Accessibility Guidelines, "Use an easily readable default font size" (basic). https://gameaccessibilityguidelines.com/use-an-easily-readable-default-font-size/ (undated page)
- Apple Human Interface Guidelines: Typography / Layout (44 pt targets, 11 pt minimum text). https://developer.apple.com/design/human-interface-guidelines/ (from memory; not fetched)
- Workinman, "Making Digital Board Games Feel Real: 8 Tips" (undated). https://workinman.com/digital-board-games/
- Bassettone, A., "5 UX/UI Lessons from Designing a Card Game" (Medium, undated in search). https://medium.com/@acbassettone/5-ux-ui-lessons-from-designing-a-card-game-b689d3f3187

**Recent guidance on designing and building UI with AI** (within about a month of 2026-09-28)
- Kaley, A., Budiu, R. (NN/g, 28 Aug 2026). The Custodial Era of UX: Cleaning Up After AI. https://www.nngroup.com/articles/ai-ux-debt/
- Chan, M. (NN/g, 11 Sep 2026). Test Complex Interactions Earlier with AI Prototyping. https://www.nngroup.com/articles/test-earlier-with-ai/
- Kohler, T. (NN/g, 18 Sep 2026). The 3 Roles of Context for AI Agents. https://www.nngroup.com/articles/3-agent-context-roles/
- Wang, H.-H., Brown, M. (NN/g, 24 Oct 2025; last reviewed 19 Aug 2026). AI Prototyping in Real Design Contexts. https://www.nngroup.com/articles/ai-prototyping/
- Kipple, N. (The Crit, Sep 2026). Why Your Vibe-Coded App Looks Like Every Other AI App (And How to Fix It). https://thecrit.co/resources/vibe-coding-design-guide

**Older AI-UI sources** (corroboration only; older than one month)
- Bonenkamp, V. (1 Aug 2026). Design.md News, August 2026. https://blog.mean.ceo/design-md-news-august-2026/
- Digital Applied (2 Aug 2026). Screenshot-Driven UI Development With Vision Models. https://www.digitalapplied.com/blog/screenshot-driven-ui-development-vision-models-2026
- Raj, R. (18 Jul 2026). The Anti-AI-Slop Design Skill. https://rohitraj.tech/notes/anti-ai-slop-design-skill-hallmark-guide-2026
- Calvo, E. (SmoothUI, 24 Jun 2026). AI Design Slop: Why AI-Generated UI Looks Generic. https://smoothui.dev/blog/ai-design-slop
- Chavez-Mattos, L. (MindStudio, 28 Apr 2026). How to Avoid AI Slop When Using Claude Design. https://www.mindstudio.ai/blog/claude-design-avoid-ai-slop-design-system
- Developers Digest (22 Apr 2026). AI Design Slop: 16 Patterns That Out Your App as Vibe-Coded. https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it

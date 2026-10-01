# Playtest 2: triage (2026-10-01)

The report itself: `2026-10-01-playtest-2.md`. Owner's instruction: order everything into (A) what obviously needs
fixing, (B) what likely needs fixing but needs his approval, and (C) design decisions to review later; **only (A) may be
fixed without asking**. Each (A) fix goes through CLAUDE.md "Fixing bugs" (assertion first, how it shipped, coverage,
then the cause), one bug per commit. Status is kept here as items are done.

## A. Obviously needs fixing (fixed without asking, one by one)
Wrong outcomes, broken rules we already set (nothing moves, nothing covers a control, no silent failure, no text cut
off), or regressions. Ordered by how much they hurt.

1. **Board fit on short laptop screens (1536×639, the owner's).** The fit reserves too little for the hand (assumes its top
   at y=524, it is at 471: the bottom 53 px of every board sits under the hand; Hills of Gold's explorers and Witch's
   Cauldron's El Dorado start under it), and at this height fit() takes the phone-only "too small to play" branch, so the
   board shifts ~260 px right under the market, differently each time.
2. **Pass-and-play privacy leak.** With hand hiding on, during an AI's turn the previous human's new hand is face-up while
   the device goes to the next human.
3. **Dead-end purchases.** A card you can't afford (Treasure Chest at 2.5 coins, or one affordable before you moved) still
   opens a purchase that can only be cancelled.
4. **Rubble and blockades need an extra Confirm** when exactly the required cards are picked by tapping (the last build
   moved at once): a regression.
5. **The board shrinks and wanders during play**: re-fits smaller when the recap grows and never grows back, jumps between
   turns (183 px in one frame), slides under the recap.
6. **Text cut off or run together**: captions "1space" / "6spaces" (missing space), card titles cut on the cards ("Jack of
   All Trad…"), player chips truncated in replays even on desktop, phone chips cut to one letter, the AI dropdown cut
   mid-word ("Fawcett · Grandmaste").
7. **Controls covered or out of reach**: the All cards close button sits exactly on Menu; the market hover preview covers
   Menu and clips its count badge; a toast lands on the recap; the pay slot covers the recap and the board; the Start
   expedition button is 293 px below the visible menu at 1536×639 and not sticky; on a phone a selected card rises over
   End turn; landscape phone puts End turn and Undo on the board; tablet board runs under the market and the All cards
   tile sits on hexes.
8. **Things that move without an animation or input**: picking a card to remove shifts the others ~21 px; paid cards leave
   gaps in the hand until the purchase completes; each Add AI in the room lobby pushes the AI buttons down (a second
   click lands on another AI); "My games" re-sorts 1 s after showing.
9. **Wrong room code**: 23 s of "Connection lost. Reconnecting…" before "the room may have closed", and the bad code stays
   in the URL.
10. **Profile rank vs Leaderboard**: the profile counts retired AIs in the rank, the leaderboard doesn't; ratings come back
    unrounded (1193.9000000000005).
11. **Online first turn is short**: the first turn's clock starts before the game is on show (0:47 of 60 s, 1:02 of 90 s).
12. **The timer keeps showing your red 0:00 through the AIs' turns** after you time out.
13. **The AI network file isn't versioned**: `/ai/first.bin` is served with max-age=0; a tab open across a deploy loads the
    new network into old code.
14. **Silent failures in the menus**: with the network failing, Leaderboard and Profile show stale data with no hint;
    Create room shows the raw "Failed to fetch".
15. **A record without its privacy field resumed with hand hiding off** (a silent default; records must say it, or be
    refused).
16. **The lobby's Rated toggle carries into the Create form's default** (state leaking between screens).
17. **Hidden history column kept up to date**: with History hidden, the left list still holds and updates ~8,000 nodes.
18. **Returning players see a blank screen 1.2–1.6 s** (first content waits on /api/config then /api/me, one after the
    other); **reloading into a running online game shows the room lobby for ~1 s**. (Both were playtest 1 items #2 and
    #5, and on the root-fix list: the boot waits on the server.)
19. **Taps during your own explorer's walk are ignored** (playtest 1 #29: animation gates input).
20. **To re-check**: old localStorage keys (eldorado-save-v4/-v5/-side/-rexp) still present (store.js now removes keys the
    page doesn't own: check on the live build); the production assertion "the removal choice shows exactly when the game
    asks for one" that fired online while a bot tapped cards during a pending move (bug reports are true: reproduce it).

## B. Likely needs fixing, needs the owner's approval
1. **Terrain on its own layer** (`#board{will-change:transform}`): measured 2–5× fewer slow frames in play, zero when
   stepping a replay. It touches the owner-approved pan/zoom design (sharpness after zoom, memory): needs his OK and the
   render/zoom tests.
2. **AI thinking off the main thread** (a worker): 52–183 ms frames inside aiChoose, mostly Fawcett.
3. **Same local game in two tabs**: warn, lock, or sync across tabs (each has trade-offs).
4. **Unavailable AIs in seat dropdowns**: AIs offered and then silently snapped back to Human (2-player games, courses
   without a trained AI), and the AI seats not restored when switching back to First Expedition: hide them, disable them
   with a reason, or keep the choice for when it's allowed.
5. **Re-opening a game you resigned from** shows you seated with your hand: what should a resigned player see?
6. **"You ran out of time"**: say it when a turn times out.
7. **Tapping another card while a multi-space card has strength left** silently drops the leftover: say it, or ask.
8. **Unusable cards look usable** (a Sailor with no water in reach isn't dimmed).
9. **Your own chip has no "left" mark after resigning**; results don't explain the order of non-arrivals ("Humboldt wins"
   with nobody arrived).
10. **Empty boxes**: the recap is an empty panel on turn 1; with History on the left the prompt is an empty pill.
11. **Live resize** costs 99–198 ms frames and moves the board 40 px.
12. **Replay steps** cost 50–100 ms frames; replay too slow at top speed (playtest 1 #19).
13. **Follow other players' moves?** On a small screen (the board zoomed in), the board follows your explorer through your
    turn; other players' explorers only at their turn's start, and in a replay not at all, so their explorer can walk under
    the market. Follow them too (the board then moves during their turns and while stepping a replay), or leave it?

## C. Design decisions to review later
- Nothing announces your turn in a local game (the banner was removed on purpose).
- Keeping a card takes 3 clicks; End turn and Discard & end share one spot (double-click risk); Reveal hand sits where
  Undo appears.
- The instruction shown twice (prompt and tooltip; prompt and banner).
- Spaces behind you stay highlighted (they are legal moves).
- Start a new game discards the running game without asking (playtest 1 #24); the menu doesn't pause local AIs (#28).
- 2-player: "Tap a pawn to switch" disappears when a card is selected; pawns ~20 px.
- Uncapped online time bank (#25); quick match alone (no count, no estimate, no AI fill).
- Rules: a text wall, no pictures or tutorial (#35); keyboard play.
- AI only on First Expedition with 3–4 players; waiting for 3 AIs takes 9–13 s a round; Humboldt dithering over a base camp.
- Hard-to-read history and recap (tiny cards, fragments), the replay heading "Fawcett's turn for Ana".
- The interface becomes very small at 2560×1080; create room ~1.35 s.

## Status
(updated as items are done)
- **A1 board fit: done** (live). Keeps above the hand (7387196); stays centred where it can't zoom in (28a74e8); doesn't
  move at a turn change when it shows whole (7f5113d); refits when the market's width changes (b4a88f1); follows the
  explorer you move on a phone (9291a67). Checked by the board check at every settled step of the played games (owner's
  size, phone, tablet) and twice a second in every test.
- **A5 board wanders: partly.** It no longer moves at turn changes (7f5113d). What the recap's second line does to the
  board (refit, reserve room, or cover) waits on the owner; the fit, the follow and the board check leave the prompt's
  side out until then.
- **A2 pass-and-play leak: done** (844cf01). **A3 dead-end purchases: done** (e498a10). **A4 extra Confirm: done**
  (04f0f9e). **A6 text: "1space" done** (c6e0eea, with a check that words never run together); cut-off titles, chips
  and the AI dropdown still to do.
- **Open, found by the stricter checks under load (intermittent, not yet explained):** (1) a phone game where the
  explorer to move sat under the market, 126 px right of where the camera's numbers put it (no glide in the log);
  (2) 1920x1080 replay with the market closed: the board's origin is 105 px right of the game area's left edge, which
  the fit assumes are the same (A7's column assumptions); (3) render test: 3 pixels differ while holding the board;
  (4) online: a recap caption rebuilt unchanged once. Each check message now carries the numbers needed.
- Found on the way (not in the report): a pressed card waited for something else to redraw (b704e7e: every UI change
  now asks for a frame; the up-to-date check runs after every input). New owner question: B13.

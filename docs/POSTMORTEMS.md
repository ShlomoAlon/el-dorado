# Post-mortems: every bug in El Dorado Expedition, 2026-09-26 to 2026-09-30

**Why this exists.** The owner asked for a review of our decision-making: for every bug he reported or Claude found, what
design decision made it possible, whether our fix was a real root fix, a partial fix or a hack, whether the fix locked
itself in (a ratchet: an assertion or a test that fails if the bug comes back), and what assertion would have caught
it during a playthrough, before he saw it.

**How it was made.**
- **Sources:** all 295 commits (judged from the diffs, not the messages); all 670 of the owner's messages (including 166 sent while Claude was working); the 2026-09-30 playtest review; Claude's own investigations.
- **Agents:** 9 agents wrote the entries by day, following one brief the owner approved.
- **Editor:** an editor pass made the tags consistent and linked the same bug across days (36 groups). It also checked 31 of the strongest claims against the diffs and corrected 11 entries, most of them to be stricter. Two corrections went the other way: `2f4ee78` (F28) and D1 are PARTIAL fixes, not hacks.
- **Changes:** nothing in the code changed; this document is the only change.

**How to read an entry.** Each entry follows the owner-approved brief:
- the chain symptom → mechanism → root cause → design decision;
- the **siblings** the same decision explains;
- the recommended design fix;
- what we did;
- the ratchet;
- the assertion that would have caught it.

What we did is one of these:
- **ROOT:** the decision itself changed, so this class of bug can't come back.
- **PARTIAL:** this instance fixed properly, but the decision stands.
- **HACK:** the symptom suppressed, the cause untouched.
- **NOT FIXED.**

A sequence like "HACK `abc123` → ROOT `def456`" records a bug that was patched more than once. The last step is its final state. IDs start with their day: A = 09-26, B/C/G = 09-27, D = 09-28, E/H = 09-29, F = 09-30, P = the 09-30 playtest, U = unsolved, found 09-30. "Same bug as" links one bug's entries across days.

## Key findings

1. **We fix instances, not decisions.** Only 40 of 217 entries (18%) end ROOT. 107 end PARTIAL: the instance was fixed properly, but the decision that caused it still stands, so its siblings keep appearing (see "Bugs by design decision" below).

2. **Our fixes don't ratchet.**
   - 163 of 217 fixes (75%) added nothing that would fail if the bug came back. 43 added a test, and only 11 added an assertion.
   - Twice we did the opposite of ratcheting: we loosened a failing check instead of fixing the cause.
     - E11 relaxed the performance budgets (p95 → median, 80 → 120 ms).
     - D13 shipped with the render test failing, then loosened it.
   - Some tests pass without checking anything. They skip their check when the random deal doesn't allow it (U1), or they check something vacuous.

3. **Eight design decisions explain most of the bugs, and most of their bugs are still open.** Counts are entries (a bug can carry more than one tag); "open" means HACK, PARTIAL or NOT FIXED.

   | Design decision | Entries | Still open | What it means |
   |---|---|---|---|
   | `DD-no-spec` | 35 | 26 | Behaviour never specified (a rule unclear, UX undecided), so the code guessed |
   | `DD-process` | 32 | 31 | Working-process failures: ignored instructions, shipping unverified, arguing with bug reports |
   | `DD-silent-failure` | 24 | 17 | Swallowed errors, silent fallbacks, silently dropped input, silently skipped checks |
   | `DD-content-sized-layout` | 19 | 16 | Sizes and positions follow content or siblings, so text changes move things |
   | `DD-per-element-patch` | 19 | 16 | A general trap patched one element or case at a time |
   | `DD-multi-source-truth` | 19 | 17 | The same data kept or computed in two places that drift apart |
   | `DD-untested-real-setup` | 17 | 16 | Tested only headless, locally or on a fast machine, never in the owner's browser |
   | `DD-server-first` | 12 | 12 | The page waits on the network for what it knows locally (none fixed at the root) |

4. **Process is the second-largest cause, and it's almost never fixed at the root** (1 of 32). The usual "fix" is a new line in CLAUDE.md. A written rule is not a ratchet: several of these bugs recurred after their rule was written (D1, C14 and H4 are one bug). Where a process failure can be checked (for example, "the change was verified in the owner's setup", "every reported assertion failure is read"), it needs a check, not a sentence.

5. **Eight checks would have caught most of the bugs before the owner saw them.**
   - After merging the cross-day duplicates there are 175 distinct bugs, and 137 of them have an assertion that would have caught them.
   - Chosen greedily (each check adds the bugs the previous ones missed), these eight catch **93**:

   | Check | Adds | Running total | Tier |
   |---|---|---|---|
   | `AS-view-matches-state`: per frame, the UI state is valid for the game state (an overlay only in a mode that uses it; the shown screen matches the data) | 24 | 24 | always-on |
   | `AS-layout-shift`: in debug, nothing on screen moves without an animation or a direct action | 14 | 38 | debug/test |
   | `AS-engine-invariant`: rule invariants after every action (cards conserved, legal state, turn order, room invariants) | 11 | 49 | always-on |
   | `AS-no-silent-catch`: lint; no empty catch, silent default, skipped test check or substituted AI | 11 | 60 | test |
   | `AS-training-health`: training runs check their own inputs and outputs | 9 | 69 | test |
   | `AS-rules-vs-rulebook`: rules checked against the rulebook text | 8 | 77 | test |
   | `AS-no-overlap`: controls never cover each other and stay reachable on screen | 8 | 85 | debug/test |
   | `AS-frame-budget`: no interaction frame over budget, on a throttled CPU | 8 | 93 | test |

6. **48 entries have no possible assertion** (`AS-none`). They're mostly unspecified behaviour and process. For these the ratchet is:
   - a written decision (the rule or UX choice recorded where the code and tests can check it);
   - or a process check, not a code assertion.

7. **Three of the most visible open problems are one decision each:**
   - **Boot waits on the server** (`DD-server-first`): a blank screen for returning players, the lobby flash, the list reshuffling and slow loads.
   - **UI state reset by hand** (`DD-ui-flags`): the "All cards" overlay leaking across turns, game over and new games.
   - **Wholesale rebuilds** (`DD-whole-rebuild`): about 1,000 page elements rewritten per turn hand-off, which drops frames.

   The recommended design fixes are in their entries: P2, P4 and P7.

## Recommendations (for the owner to decide; nothing here is implemented)
1. **Add the eight checks above,** starting with the two always-on ones and the layout-shift observer. Each fix from now on adds the assertion or test that would have caught its bug (the ratchet), and a fix without one counts as PARTIAL.
2. **Work down "Still needing the real fix" by design decision, not by bug.** One decision fixed closes its whole list.
3. **Write down the unspecified behaviour** (`DD-no-spec`) as decisions the tests can read.
4. **Turn the process rules that can be checked into checks,** and stop counting a CLAUDE.md line as a fix.

## Summary

217 bugs. Final state: **ROOT** 40, **PARTIAL** 107, **HACK** 13, **NOT FIXED** 57. Ratchet (what the fix added): assertion 11, test 43, nothing 163.

## Bugs by design decision

Each list is the bugs one design decision made possible. Changing that decision fixes the whole list.

### `DD-no-spec` — 35 bugs (NOT FIXED 13, PARTIAL 13, ROOT 9)

[A4](#a4--rulebook-tie-break-whoever-reached-el-dorado-first-not-implemented) Rulebook tie-break "whoever reached El Dorado first" not implemented (**NOT FIXED**), [A7](#a7--every-card-showed-a-gold-coin-badge-in-the-top-left-corner) Every card showed a gold coin badge in the top-left corner (**ROOT**), [A8](#a8--board-spaces-didnt-show-how-hard-they-are-icons-crowded-together) Board spaces didn't show how hard they are; icons crowded together (**ROOT**), [A13](#a13--affordable-market-cards-pulsed-all-the-time) Affordable market cards pulsed all the time (**PARTIAL**), [A21](#a21--ai-input-summarised-the-map-instead-of-encoding-every-space) AI input summarised the map instead of encoding every space (**ROOT**), [A26](#a26--training-fundamentally-wrong-the-net-learned-the-heuristics-opinion-and-scored-chance-with-one-sample) Training "fundamentally wrong": the net learned the heuristic's opinion and scored chance with one sample (**PARTIAL**), [A27](#a27--training-included-2-player-games) Training included 2-player games (**PARTIAL**), [B14](#b14--four-way-test-report-win-rates-that-dont-add-up-to-100) Four-way test report: win rates that don't add up to 100% (**ROOT**), [B15](#b15--search-training-looked-like-it-was-getting-worse-the-progress-test-measured-search-not-training) Search training looked like it was getting worse: the progress test measured search, not training (**PARTIAL**), [C2](#c2--progress-test-did-not-measure-progress-the-heuristic-benchmark) Progress test did not measure progress (the heuristic benchmark) (**PARTIAL**), [G2](#g2--replays-play-too-fast-and-the-speed-setting-couldnt-be-found) Replays play too fast, and the speed setting couldn't be found (**NOT FIXED**), [D14](#d14--ai-seats-offered-in-setups-the-ai-was-never-trained-for-2-player-games-other-courses) AI seats offered in setups the AI was never trained for (2-player games, other courses) (**PARTIAL**), [D15](#d15--no-menu-during-a-game-leaderboard-resign-and-sign-out-only-by-abandoning-or-digging) No menu during a game: leaderboard, resign and sign-out only by abandoning or digging (**ROOT**), [D17](#d17--player-chips-showed-a-total-blockade-value-that-isnt-the-tie-break) Player chips showed a "total blockade value" that isn't the tie-break (**PARTIAL**), [D26](#d26--the-network-ai-without-search-does-weird-stuff-on-the-site-orellana) The network AI without search "does weird stuff" on the site (Orellana) (**ROOT**), [D28](#d28--no-way-back-to-local-play-once-you-chose-online) No way back to local play once you chose Online (**ROOT**), [E17](#e17--the-turn-went-on-after-the-last-explorer-reached-el-dorado) The turn went on after the last explorer reached El Dorado (**PARTIAL**), [H1](#h1--replay-every-option-list-rated-end-the-turn-keep-everything-close-to-real-moves) Replay "every option" list rated "end the turn, keep everything" close to real moves (**PARTIAL**), [H2](#h2--replay-winning-chances-are-not-winning-chances) Replay "winning chances" are not winning chances (**NOT FIXED**), [F8](#f8--stopping-a-card-with-strength-left-needs-a-hard-to-find-done) Stopping a card with strength left needs a hard-to-find Done (**PARTIAL**), [F11](#f11--travel-log--scientist-removing-cards-isnt-visibly-asked) Travel Log / Scientist: removing cards isn't visibly asked (**PARTIAL**), [F19](#f19--rules-questions-not-answered-first-the-tie-break-answer-misread) Rules questions not answered first; the tie-break answer misread (**NOT FIXED**), [F20](#f20--replay-shows-meaningless-n-left-figures) Replay shows meaningless "N left" figures (**ROOT**), [F21](#f21--a-useless-end-step-in-the-history) A useless "End" step in the history (**ROOT**), [F23](#f23--useless-information-across-the-ui-audit) Useless information across the UI (audit) (**PARTIAL**), [P17](#p17--replay-max-speed-is-4) Replay max speed is 4× (**NOT FIXED**), [P18](#p18--waiting-for-ais-59-s-a-round-each-ai-turn-under-a-centre-screen-banner) Waiting for AIs: ~5–9 s a round, each AI turn under a centre-screen banner (**PARTIAL**), [P20](#p20--ai-opponents-only-on-first-expedition-with-34-players) AI opponents only on First Expedition with 3–4 players (**NOT FIXED**), [P21](#p21--ending-a-turn-with-cards-left-takes-23-clicks) Ending a turn with cards left takes 2–3 clicks (**NOT FIXED**), [P22](#p22--start-a-new-game-discards-the-running-game-with-one-click) "Start a new game" discards the running game with one click (**NOT FIXED**), [P23](#p23--online-time-bank-is-uncapped) Online time bank is uncapped (**NOT FIXED**), [P24](#p24--the-history-button-is-a-hidden-3-way-cycle) The History button is a hidden 3-way cycle (**NOT FIXED**), [P25](#p25--opening-the-menu-doesnt-pause-local-ais) Opening the menu doesn't pause local AIs (**NOT FIXED**), [P27](#p27--end-screen-ranks-non-arrivals-without-saying-why) End screen ranks non-arrivals without saying why (**NOT FIXED**), [P33](#p33--rules-are-one-long-wall-onlineai-paragraphs-before-the-turn-rules) Rules are one long wall, Online/AI paragraphs before the turn rules (**NOT FIXED**)

### `DD-process` — 32 bugs (PARTIAL 23, NOT FIXED 6, HACK 2, ROOT 1)

[A6](#a6--first-expedition-course-fitted-to-a-blurry-rulebook-scan) First Expedition course fitted to a blurry rulebook scan (**PARTIAL**), [A20](#a20--explorer-miniatures-chibi-figures-per-seat-colour-only-on-clothes) Explorer miniatures: chibi figures per seat, colour only on clothes (**PARTIAL**), [A23](#a23--training-exploration-left-mechanisms-unexplored-keeptrashpay-choices-transmitter-not-buying) Training exploration left mechanisms unexplored (keep/trash/pay choices, Transmitter, not buying) (**NOT FIXED**), [A27](#a27--training-included-2-player-games) Training included 2-player games (**PARTIAL**), [A30](#a30--improve-the-heuristic-done-as-cpu-heavy-sweeps-competing-with-training) "Improve the heuristic" done as CPU-heavy sweeps competing with training (**PARTIAL**), [A34](#a34--a-result-attributed-to-seat-effects-without-evidence) A result attributed to "seat effects" without evidence (**PARTIAL**), [B4](#b4--process-regression-hunting-and-pausing-training-instead-of-profiling-what-the-owner-felt) Process: regression-hunting and pausing training instead of profiling what the owner felt (**PARTIAL**), [B7](#b7--board-colours-change-while-dragging) Board colours change while dragging (**ROOT**), [B8](#b8--process-papering-over-bugs-and-building-workarounds-instead-of-the-well-trodden-way) Process: papering over bugs and building workarounds instead of the well-trodden way (**PARTIAL**), [B10](#b10--process-long-runs-and-experiments-with-no-visible-progress) Process: long runs and experiments with no visible progress (**PARTIAL**), [B12](#b12--process-the-background-agent-and-the-main-agent-shared-one-working-tree) Process: the background agent and the main agent shared one working tree (**PARTIAL**), [C14](#c14--the-owners-question-waited-behind-work-before-you-do-this-can-you-prioritize-giving-me-a-report) The owner's question waited behind work ("Before you do this, can you prioritize giving me a report?") (**PARTIAL**), [C15](#c15--a-base-camp-request-from-the-owner-camps-usable-once-a-common-house-rule-silently-disappeared) A base-camp request from the owner (camps usable once, a common house rule) silently disappeared (**NOT FIXED**), [D1](#d1--the-owners-questions-wait-behind-claudes-work) The owner's questions wait behind Claude's work (**PARTIAL**), [D4](#d4--training-iterations-far-slower-than-claude-said) Training iterations far slower than Claude said (**PARTIAL**), [D5](#d5--training-thrash-started-from-scratch-against-the-owners-wish-then-a-broken-warm-start-and-too-many-changes-at-once) Training thrash: started from scratch against the owner's wish, then a broken warm start and too many changes at once (**PARTIAL**), [D6](#d6--cut-off-games-scored-by-the-networks-own-guess-against-the-owners-specification) Cut-off games scored by the network's own guess, against the owner's specification (**PARTIAL**), [D10](#d10--design-review-defects-found-and-left-open-a1-a9a18-a20a22-a24) Design-review defects found and left open (A1, A9–A18, A20–A22, A24) (**NOT FIXED**), [D11](#d11--training-runs-crashed-at-start-a-comment-swallowed-the-setup-line) Training runs crashed at start: a comment swallowed the setup line (**PARTIAL**), [D13](#d13--wheel-zoom-latency-over-budget-once-the-real-fonts-loaded-shipped-failing-then-the-test-was-loosened) Wheel-zoom latency over budget once the real fonts loaded; shipped failing, then the test was loosened (**HACK**), [D18](#d18--the-design-review-agent-died-with-a-worker-restart-and-its-work-was-lost) The design-review agent died with a worker restart and its work was lost (**PARTIAL**), [E10](#e10--the-test-suite-was-too-slow-for-a-quick-turnaround) The test suite was too slow for a quick turnaround (**PARTIAL**), [E11](#e11--performance-budgets-loosened-when-they-failed) Performance budgets loosened when they failed (**HACK**), [E20](#e20--ai-training-starved-the-machine-that-builds-and-tests) AI training starved the machine that builds and tests (**NOT FIXED**), [E34](#e34--design-agents-ran-on-the-main-thread-so-the-owner-kept-stopping-them) Design agents ran on the main thread, so the owner kept stopping them (**PARTIAL**), [H3](#h3--has-the-model-regressed-couldnt-be-answered-every-network-comparison-predated-the-rules-fix) "Has the model regressed?" couldn't be answered: every network comparison predated the rules fix (**PARTIAL**), [H4](#h4--owners-status-questions-went-unanswered-or-got-a-wrong-answer-a-request-waited-six-hours) Owner's status questions went unanswered or got a wrong answer; a request waited six hours (**PARTIAL**), [F19](#f19--rules-questions-not-answered-first-the-tie-break-answer-misread) Rules questions not answered first; the tie-break answer misread (**NOT FIXED**), [F25](#f25--process-measured-in-our-setup-dismissed-the-owners-the-gaslighting) Process: measured in our setup, dismissed the owner's (the "gaslighting") (**PARTIAL**), [F26](#f26--process-shipped-a-change-the-owner-had-said-not-to-ship) Process: shipped a change the owner had said not to ship (**PARTIAL**), [F27](#f27--process-instructions-misread-or-ignored) Process: instructions misread or ignored (**PARTIAL**), [F29](#f29--process-claude-stops-working-after-answering) Process: Claude stops working after answering (**NOT FIXED**)

### `DD-silent-failure` — 24 bugs (PARTIAL 12, ROOT 7, NOT FIXED 4, HACK 1)

[A1](#a1--pushes-to-main-silently-stopped-deploying-workers-builds-disconnected) Pushes to main silently stopped deploying (Workers Builds disconnected) (**PARTIAL**), [A19](#a19--sound-every-failure-swallowed-very-first-tap-silent) Sound: every failure swallowed; very first tap silent (**PARTIAL**), [A22](#a22--deploy-broken-wip-bot-code-reassigned-a-const-cloudflares-bundler-refused-it) Deploy broken: WIP bot code reassigned a `const`, Cloudflare's bundler refused it (**ROOT**), [A28](#a28--training-progress-page-stopped-updating) Training progress page stopped updating (**HACK**), [A33](#a33--illegal-ai-or-logged-actions-silently-turned-into-end-turn) Illegal AI or logged actions silently turned into "end turn" (**PARTIAL**), [C3](#c3--an-illegal-ai-action-was-silently-replaced-by-end-turn-the-test-that-checked-it-could-not-fail) An illegal AI action was silently replaced by "end turn"; the test that checked it could not fail (**PARTIAL**), [C11](#c11--two-player-games-the-network-ais-mostly-never-reached-el-dorado) Two-player games: the network AIs mostly never reached El Dorado (**PARTIAL**), [C20](#c20--dead-hidden-units-in-the-network) Dead hidden units in the network (**PARTIAL**), [D14](#d14--ai-seats-offered-in-setups-the-ai-was-never-trained-for-2-player-games-other-courses) AI seats offered in setups the AI was never trained for (2-player games, other courses) (**PARTIAL**), [D23](#d23--an-engine-exception-in-a-room-left-the-game-half-changed-first-fix-swallowed-it-critique-b2) An engine exception in a room left the game half-changed; first fix swallowed it (critique B2) (**ROOT**), [E16](#e16--a-purchase-could-get-stuck-after-playing-a-travel-log-or-scientist) A purchase could get stuck after playing a Travel Log or Scientist (**ROOT**), [E21](#e21--a-silently-dead-online-connection-wasnt-noticed-moves-went-nowhere) A silently dead online connection wasn't noticed; moves went nowhere (**PARTIAL**), [E23](#e23--an-ais-illegal-choice-silently-ended-its-turn) An AI's illegal choice silently ended its turn (**PARTIAL**), [E24](#e24--the-rules-test-built-maps-real-games-cant-have-engine-fallbacks-hid-it) The rules test built maps real games can't have; engine fallbacks hid it (**ROOT**), [E26](#e26--the-room-turned-every-engine-exception-into-bad-action-and-rebuilt-the-game-on-every-refused-move) The Room turned every engine exception into "Bad action." and rebuilt the game on every refused move (**ROOT**), [E27](#e27--a-saved-game-that-couldnt-be-rebuilt-silently-started-a-new-game) A saved game that couldn't be rebuilt silently started a new game (**ROOT**), [E28](#e28--catches-too-wide-loadreplayid-hid-display-bugs-the-fullscreen-rejection-went-unhandled) Catches too wide: loadReplayId hid display bugs; the fullscreen rejection went unhandled (**PARTIAL**), [E31](#e31--replays-silently-patched-moves-that-didnt-fit-the-game) Replays silently patched moves that didn't fit the game (**ROOT**), [E32](#e32--a-multi-course-network-would-have-made-humboldt-silently-play-as-the-route-planner) A multi-course network would have made Humboldt silently play as the route planner (**PARTIAL**), [H4](#h4--owners-status-questions-went-unanswered-or-got-a-wrong-answer-a-request-waited-six-hours) Owner's status questions went unanswered or got a wrong answer; a request waited six hours (**PARTIAL**), [P19](#p19--closing-a-socket-takes-10-s-silent-drops-detected-after-40-s) Closing a socket takes 10 s; silent drops detected after 40 s (**NOT FIXED**), [U1](#u1--tests-that-silently-skip-their-own-checks) Tests that silently skip their own checks (**NOT FIXED**), [U2](#u2--botchoose-silently-plays-a-different-ai-when-the-network-is-missing) botChoose silently plays a different AI when the network is missing (**NOT FIXED**), [U3](#u3--42-empty-catch--blocks-in-page-and-server) 42 empty `catch {}` blocks in page and server (**NOT FIXED**)

### `DD-content-sized-layout` — 19 bugs (PARTIAL 9, NOT FIXED 4, HACK 3, ROOT 3)

[A11](#a11--end-turn-you-can-still-afford-warning-reuses-the-big-button-slot-extra-clicks-tap-through) End-turn "you can still afford…" warning reuses the big button slot (extra clicks, tap-through) (**NOT FIXED**), [A12](#a12--action-card-text-ran-into-the-card-footer) Action-card text ran into the card footer (**HACK**), [B1](#b1--replay-controls-vanish-at-some-screen-sizes-layout-bugs-keep-coming-back) Replay controls vanish at some screen sizes; layout bugs keep coming back (**PARTIAL**), [B2](#b2--player-chips-clipped-the-third-player-hidden-on-phones-and-under-market-in-replays) Player chips clipped: the third player hidden on phones and under "Market" in replays (**PARTIAL**), [C10](#c10--the-opponents-recap-made-the-prompt-box-content-sized-it-collides-with-the-turn-buttons-and-changes-size-as-steps-arrive) The opponents' recap made the prompt box content-sized: it collides with the turn buttons and changes size as steps arrive (**HACK**), [G1](#g1--replay-controls-disappear-at-the-end-of-every-turn) Replay controls disappear at the end of every turn (**ROOT**), [D8](#d8--misaligned-top-bar-promptmarket-and-menu-controls-design-review-a2-a3-a4-a7-a8-a19) Misaligned top bar, prompt/market and menu controls (design review A2, A3, A4, A7, A8, A19) (**PARTIAL**), [D10](#d10--design-review-defects-found-and-left-open-a1-a9a18-a20a22-a24) Design-review defects found and left open (A1, A9–A18, A20–A22, A24) (**NOT FIXED**), [D21](#d21--the-menu-panel-changes-size-from-screen-to-screen) The menu panel changes size from screen to screen (**ROOT**), [D30](#d30--the-start-screen-re-renders-when-late-fonts-arrive) The start screen re-renders when late fonts arrive (**ROOT**), [E1](#e1--start-screen-text-swapped-fonts-and-looked-different-on-a-second-visit) Start-screen text swapped fonts, and looked different on a second visit (**PARTIAL**), [E22](#e22--player-chips-cut-in-half-when-the-game-area-was-narrow) Player chips cut in half when the game area was narrow (**PARTIAL**), [E33](#e33--history-panel-a-resize-loop-and-a-content-sized-panel) History panel: a resize loop, and a content-sized panel (**PARTIAL**), [F2](#f2--a-turn-in-the-history-wraps-onto-two-lines-captions-crowd-the-cards) A turn in the history wraps onto two lines (captions crowd the cards) (**PARTIAL**), [F17](#f17--prompt-box-and-history-row-grow-and-shrink) Prompt box and history row grow and shrink (**PARTIAL**), [F18](#f18--whose-turn-heading-pops-in-at-the-end-of-the-turn) "Whose turn" heading pops in at the end of the turn (**PARTIAL**), [P10](#p10--prompt-pill-changes-size-on-every-state) Prompt pill changes size on every state (**HACK**), [P11](#p11--turn-buttons-move-and-change-meaning-under-the-finger-undo-jumps-end-turnundo-vanish-in-buy-mode-double-taps-pass-confirmations) Turn buttons move and change meaning under the finger (Undo jumps; End turn/Undo vanish in buy mode; double taps pass confirmations) (**NOT FIXED**), [P12](#p12--player-bar-jumps-51-px-at-round-n--final) Player bar jumps 51 px at "Round N · final" (**NOT FIXED**)

### `DD-per-element-patch` — 19 bugs (PARTIAL 10, NOT FIXED 5, ROOT 3, HACK 1)

[A15](#a15--market-floated-over-the-game-took-the-top-of-the-board-covered-end-turn-then-covered-the-replay-panel) Market floated over the game: took the top of the board, covered End turn, then covered the replay panel (**PARTIAL**), [A23](#a23--training-exploration-left-mechanisms-unexplored-keeptrashpay-choices-transmitter-not-buying) Training exploration left mechanisms unexplored (keep/trash/pay choices, Transmitter, not buying) (**NOT FIXED**), [A25](#a25--a-card-spent-on-a-purchase-leaves-a-hole-in-the-hand) A card spent on a purchase leaves a hole in the hand (**NOT FIXED**), [B2](#b2--player-chips-clipped-the-third-player-hidden-on-phones-and-under-market-in-replays) Player chips clipped: the third player hidden on phones and under "Market" in replays (**PARTIAL**), [B6](#b6--grab-start-stalls-the-grabbing-cursor-restyles-every-board-element) Grab start stalls: the grabbing cursor restyles every board element (**NOT FIXED**), [B7](#b7--board-colours-change-while-dragging) Board colours change while dragging (**ROOT**), [B19](#b19--el-dorados-finishing-spaces-always-drawn-gold-even-when-they-need-water) El Dorado's finishing spaces always drawn gold, even when they need water (**PARTIAL**), [C1](#c1--self-play-exploration-expensive-cards-almost-never-tried-the-exploration-we-had-was-a-hack) Self-play exploration: expensive cards almost never tried; the exploration we had was a hack (**NOT FIXED**), [C9](#c9--pop-up-windows-rules-and-others-were-wider-than-the-screen-at-390-px) Pop-up windows (Rules and others) were wider than the screen at 390 px (**HACK**), [C19](#c19--ais-stuck-forever-next-to-el-dorado-or-on-a-way-their-cards-cant-take) AIs stuck forever next to El Dorado or on a way their cards can't take (**PARTIAL**), [D2](#d2--single-use-cards-played-for-movement-came-back-after-the-reshuffle) Single-use cards played for movement came back after the reshuffle (**PARTIAL**), [D19](#d19--a-white-box-behind-the-google-sign-in-button) A white box behind the Google sign-in button (**PARTIAL**), [D20](#d20--the-el-dorado-label-sits-on-a-finishing-space) The "El Dorado" label sits on a finishing space (**PARTIAL**), [D22](#d22--a-player-could-send-any-property-name-as-a-market-index-critique-b1) A player could send any property name as a market index (critique B1) (**PARTIAL**), [D25](#d25--the-menus-background-flickers-and-every-click-re-lays-out-the-whole-screen) The menu's background flickers and every click re-lays out the whole screen (**ROOT**), [E5](#e5--sharp-delay-when-clicking-and-dragging-on-the-phone) Sharp delay when clicking and dragging on the phone (**PARTIAL**), [E14](#e14--the-server-accepted-timeout-from-a-player-the-engine-accepted-endgame-out-of-turn) The server accepted `timeout` from a player; the engine accepted `endgame` out of turn (**ROOT**), [F30](#f30--ai-games-stall-on-the-witchs-cauldron-course) AI games stall on the Witch's Cauldron course (**PARTIAL**), [P34](#p34--stray-182-px-dash-in-the-online-prompt-during-ai-turns) Stray 18×2 px dash in the online prompt during AI turns (**NOT FIXED**)

### `DD-multi-source-truth` — 19 bugs (PARTIAL 8, NOT FIXED 7, ROOT 2, HACK 2)

[A32](#a32--game-results-in-trainingbenchmarks-a-capped-non-arrival-could-win-then-the-last-racer-counted-as-a-capped-loss) Game results in training/benchmarks: a capped non-arrival could "win", then the last racer counted as a capped loss (**PARTIAL**), [B9](#b9--the-ai-hovers-next-to-el-dorado-instead-of-arriving) The AI hovers next to El Dorado instead of arriving (**PARTIAL**), [B17](#b17--four-way-test-seats-did-not-rotate-evenly-across-workers) Four-way test seats did not rotate evenly across workers (**PARTIAL**), [B19](#b19--el-dorados-finishing-spaces-always-drawn-gold-even-when-they-need-water) El Dorado's finishing spaces always drawn gold, even when they need water (**PARTIAL**), [B20](#b20--the-bot-counted-an-arrivals-place-as-final-too-early-with-an-incomplete-tie-break) The bot counted an arrival's place as final too early, with an incomplete tie-break (**PARTIAL**), [C7](#c7--ai-ratings-did-not-reflect-ai-strength-all-1200-then-stale-after-every-network-change) AI ratings did not reflect AI strength (all 1200, then stale after every network change) (**NOT FIXED**), [C8](#c8--other-players-turns-were-invisible-cards-played-purchases-and-the-journal-was-hidden) Other players' turns were invisible (cards played, purchases) and the journal was hidden (**ROOT**), [C12](#c12--the-model-ladder-counted-one-network-as-two-players) The model ladder counted one network as two players (**HACK**), [C18](#c18--the-weight-cache-went-stale-when-a-tool-changed-weights-in-place) The weight cache went stale when a tool changed weights in place (**HACK**), [D7](#d7--the-live-training-page-showed-different-arrival-numbers-than-claude-reported) The live training page showed different arrival numbers than Claude reported (**NOT FIXED**), [D16](#d16--your-games-reshuffles-when-the-online-list-arrives) "Your games" reshuffles when the online list arrives (**NOT FIXED**), [E15](#e15--ai-ratings-shipped-as-a-guess-and-stale-for-the-shipped-network) AI ratings shipped as a guess, and stale for the shipped network (**NOT FIXED**), [H3](#h3--has-the-model-regressed-couldnt-be-answered-every-network-comparison-predated-the-rules-fix) "Has the model regressed?" couldn't be answered: every network comparison predated the rules fix (**PARTIAL**), [F6](#f6--resigning-doesnt-let-you-leave-rejoin-puts-you-back-in-the-game) Resigning doesn't let you leave; Rejoin puts you back in the game (**PARTIAL**), [F10](#f10--replays-list-no-winner-every-opponent-named-a-useless-upload-button) Replays list: no winner, every opponent named, a useless Upload button (**ROOT**), [F15](#f15--history-center-mode-goes-blank-on-your-own-turn) History "center" mode goes blank on your own turn (**PARTIAL**), [P13](#p13--paying-by-drag-leaves-a-hole-in-the-hand) Paying by drag leaves a hole in the hand (**NOT FIXED**), [P14](#p14--replays--my-games-reshuffles-under-the-cursor) Replays → My games reshuffles under the cursor (**NOT FIXED**), [P35](#p35--orphaned-localstorage-from-older-versions-is-never-cleaned) Orphaned localStorage from older versions is never cleaned (**NOT FIXED**)

### `DD-untested-real-setup` — 17 bugs (PARTIAL 9, NOT FIXED 5, HACK 2, ROOT 1)

[A1](#a1--pushes-to-main-silently-stopped-deploying-workers-builds-disconnected) Pushes to main silently stopped deploying (Workers Builds disconnected) (**PARTIAL**), [A22](#a22--deploy-broken-wip-bot-code-reassigned-a-const-cloudflares-bundler-refused-it) Deploy broken: WIP bot code reassigned a `const`, Cloudflare's bundler refused it (**ROOT**), [B4](#b4--process-regression-hunting-and-pausing-training-instead-of-profiling-what-the-owner-felt) Process: regression-hunting and pausing training instead of profiling what the owner felt (**PARTIAL**), [C4](#c4--local-ais-think-on-the-pages-main-thread-frame-rate-never-measured-during-ai-turns) Local AIs think on the page's main thread; frame rate never measured during AI turns (**NOT FIXED**), [C5](#c5--online-ais-played-the-rest-of-the-game-in-one-alarm-a-resigning-players-answer-took-57-s) Online AIs played the rest of the game in one alarm; a resigning player's answer took 5–7 s (**PARTIAL**), [D12](#d12--the-site-loads-slowly-one-313-kb-page-for-a-tiny-start-screen) The site loads slowly: one 313 KB page for a tiny start screen (**PARTIAL**), [D13](#d13--wheel-zoom-latency-over-budget-once-the-real-fonts-loaded-shipped-failing-then-the-test-was-loosened) Wheel-zoom latency over budget once the real fonts loaded; shipped failing, then the test was loosened (**HACK**), [D19](#d19--a-white-box-behind-the-google-sign-in-button) A white box behind the Google sign-in button (**PARTIAL**), [E8](#e8--the-explorer-no-longer-hopped-it-slidteleported-fast-on-the-phone) The explorer no longer hopped: it slid/teleported, fast, on the phone (**HACK**), [E9](#e9--ui-regressions-kept-shipping-a-lot-of-jank-and-a-lot-of-regressions) UI regressions kept shipping ("a lot of jank and a lot of regressions") (**PARTIAL**), [E12](#e12--occasional-flicker-after-moving-the-map-iphone-11-safari-the-mark-button-was-unusable) Occasional flicker after moving the map (iPhone 11 Safari); the Mark button was unusable (**NOT FIXED**), [E30](#e30--false-invariant-animatemove-the-explorer-is-drawn--game-restored-toasts) False invariant `animateMove: the explorer is drawn` → "game restored" toasts (**PARTIAL**), [F25](#f25--process-measured-in-our-setup-dismissed-the-owners-the-gaslighting) Process: measured in our setup, dismissed the owner's (the "gaslighting") (**PARTIAL**), [P1](#p1--online-resign-takes-127-s) Online resign takes 1.2–7 s (**PARTIAL**), [P8](#p8--late-game-nearly-every-turn-change-has-a-100200-ms-frame) Late game: nearly every turn change has a 100–200 ms frame (**NOT FIXED**), [P30](#p30--idle-hand-4-cards-overlap-while-half-the-bottom-edge-is-empty) Idle hand: 4 cards overlap while half the bottom edge is empty (**NOT FIXED**), [U4](#u4--late-game-hand-offs-slower-playtest-8-not-reproduced) Late-game hand-offs slower (playtest #8): not reproduced (**NOT FIXED**)

### `DD-imperative-sequencing` — 13 bugs (PARTIAL 7, HACK 3, ROOT 3)

[A5](#a5--online-screens-live-room-list-didnt-connect-right-after-signing-in) Online screen's live room list didn't connect right after signing in (**PARTIAL**), [A24](#a24--buying-was-click-only-annoying-the-drag-to-buy-that-fixed-it-runs-on-flags-and-timers) Buying was click-only (annoying); the drag-to-buy that fixed it runs on flags and timers (**PARTIAL**), [B13](#b13--the-zoom-bake-could-fire-in-the-middle-of-a-glide-or-a-new-grab) The zoom bake could fire in the middle of a glide or a new grab (**HACK**), [D9](#d9--online-game-starts-with-the-market-covering-el-dorado-design-review-a23) Online game starts with the market covering El Dorado (design review A23) (**ROOT**), [D27](#d27--double-clicking-add-ai-could-over-fill-a-room-critique-b3) Double-clicking "Add AI" could over-fill a room (critique B3) (**PARTIAL**), [E3](#e3--board-starts-zoomed-in-then-zooms-itself-out-refit-a-second-after-start) Board "starts zoomed in, then zooms itself out"; refit a second after Start (**PARTIAL**), [E4](#e4--the-board-painted-over-the-menu-for-a-quarter-second-on-load) The board painted over the menu for a quarter second on load (**ROOT**), [E6](#e6--a-finished-games-results-stayed-on-screen-under-a-new-game) A finished game's results stayed on screen under a new game (**HACK**), [E8](#e8--the-explorer-no-longer-hopped-it-slidteleported-fast-on-the-phone) The explorer no longer hopped: it slid/teleported, fast, on the phone (**HACK**), [E18](#e18--page-tests-failed-under-machine-load-fixed-pauses-deal-dependent-checks) Page tests failed under machine load (fixed pauses, deal-dependent checks) (**PARTIAL**), [F5](#f5--hand-not-laid-out-again-when-the-game-area-changes-size) Hand not laid out again when the game area changes size (**ROOT**), [F28](#f28--animatemove-the-explorer-is-drawn-at-the-start-of-online-games) "animateMove: the explorer is drawn" at the start of online games (**PARTIAL**), [P6](#p6--online-assertion-animatemove-the-explorer-is-drawn-at-game-start) Online assertion 'animateMove: the explorer is drawn' at game start (**PARTIAL**)

### `DD-float-over` — 13 bugs (PARTIAL 4, NOT FIXED 4, ROOT 4, HACK 1)

[A15](#a15--market-floated-over-the-game-took-the-top-of-the-board-covered-end-turn-then-covered-the-replay-panel) Market floated over the game: took the top of the board, covered End turn, then covered the replay panel (**PARTIAL**), [A18](#a18--market-hover-preview-enlarges-over-the-top-bar) Market hover preview enlarges over the top bar (**NOT FIXED**), [A25](#a25--a-card-spent-on-a-purchase-leaves-a-hole-in-the-hand) A card spent on a purchase leaves a hole in the hand (**NOT FIXED**), [B1](#b1--replay-controls-vanish-at-some-screen-sizes-layout-bugs-keep-coming-back) Replay controls vanish at some screen sizes; layout bugs keep coming back (**PARTIAL**), [C10](#c10--the-opponents-recap-made-the-prompt-box-content-sized-it-collides-with-the-turn-buttons-and-changes-size-as-steps-arrive) The opponents' recap made the prompt box content-sized: it collides with the turn buttons and changes size as steps arrive (**HACK**), [G1](#g1--replay-controls-disappear-at-the-end-of-every-turn) Replay controls disappear at the end of every turn (**ROOT**), [E4](#e4--the-board-painted-over-the-menu-for-a-quarter-second-on-load) The board painted over the menu for a quarter second on load (**ROOT**), [E33](#e33--history-panel-a-resize-loop-and-a-content-sized-panel) History panel: a resize loop, and a content-sized panel (**PARTIAL**), [F1](#f1--history-panel-grows-sideways-instead-of-downwards) History panel grows sideways instead of downwards (**ROOT**), [F4](#f4--history-docked-to-the-left-is-hard-to-undock) History docked to the left is hard to undock (**ROOT**), [P18](#p18--waiting-for-ais-59-s-a-round-each-ai-turn-under-a-centre-screen-banner) Waiting for AIs: ~5–9 s a round, each AI turn under a centre-screen banner (**PARTIAL**), [P28](#p28--buy-mode-pay-slot-and-paid-cards-float-over-the-board-the-raised-card-covers-the-counter-treasure-chests-value-vs-cost) Buy mode: pay slot and paid cards float over the board; the raised card covers the counter; Treasure Chest's value vs cost (**NOT FIXED**), [P29](#p29--market-hover-preview-spills-over-menu-its-badge-is-clipped-the-all-cards-x-sits-over-menu) Market hover preview spills over Menu; its badge is clipped; the All cards X sits over Menu (**NOT FIXED**)

### `DD-server-first` — 12 bugs (NOT FIXED 7, PARTIAL 5)

[D16](#d16--your-games-reshuffles-when-the-online-list-arrives) "Your games" reshuffles when the online list arrives (**NOT FIXED**), [D29](#d29--returning-players-see-a-blank-screen-while-the-page-asks-the-server-what-to-show) Returning players see a blank screen while the page asks the server what to show (**NOT FIXED**), [E1](#e1--start-screen-text-swapped-fonts-and-looked-different-on-a-second-visit) Start-screen text swapped fonts, and looked different on a second visit (**PARTIAL**), [E2](#e2--the-site-took-a-couple-of-seconds-to-load-on-the-phone) The site took "a couple of seconds" to load on the phone (**PARTIAL**), [E3](#e3--board-starts-zoomed-in-then-zooms-itself-out-refit-a-second-after-start) Board "starts zoomed in, then zooms itself out"; refit a second after Start (**PARTIAL**), [F12](#f12--room-lobby-waits-on-the-server-to-show-the-ai-options) Room lobby waits on the server to show the AI options (**PARTIAL**), [F24](#f24--resign-still-waits-for-the-server-owners-no-wait-not-done) Resign still waits for the server (owner's "no wait" not done) (**NOT FIXED**), [P2](#p2--returning-player-sees-a-blank-screen-for-1-s) Returning player sees a blank screen for ~1 s (**NOT FIXED**), [P5](#p5--reloading-or-rejoining-a-running-online-game-flashes-the-room-lobby) Reloading or rejoining a running online game flashes the room lobby (**NOT FIXED**), [P14](#p14--replays--my-games-reshuffles-under-the-cursor) Replays → My games reshuffles under the cursor (**NOT FIXED**), [P15](#p15--page-boot-is-a-serial-waterfall) Page boot is a serial waterfall (**NOT FIXED**), [P16](#p16--create-room-16-s-add-ai-190-ms-each-leaderboard-and-shared-replays-1-s) Create room 1.6 s; Add AI ~190 ms each; leaderboard and shared replays ~1 s (**PARTIAL**)

### `DD-two-mechanisms` — 10 bugs (PARTIAL 5, ROOT 4, NOT FIXED 1)

[A16](#a16--couldnt-drag-cards-onto-rubble--base-camps) Couldn't drag cards onto rubble / base camps (**PARTIAL**), [A24](#a24--buying-was-click-only-annoying-the-drag-to-buy-that-fixed-it-runs-on-flags-and-timers) Buying was click-only (annoying); the drag-to-buy that fixed it runs on flags and timers (**PARTIAL**), [A29](#a29--ai-games-stall-hit-the-25-round-cap-explorer-stranded-before-el-dorado) AI games stall: hit the 25-round cap (explorer stranded before El Dorado) (**PARTIAL**), [B9](#b9--the-ai-hovers-next-to-el-dorado-instead-of-arriving) The AI hovers next to El Dorado instead of arriving (**PARTIAL**), [D3](#d3--a-buy-button-that-could-never-be-the-way-to-buy) A "Buy" button that could never be the way to buy (**ROOT**), [D9](#d9--online-game-starts-with-the-market-covering-el-dorado-design-review-a23) Online game starts with the market covering El Dorado (design review A23) (**ROOT**), [F9](#f9--replay-says-you-made-this-move-when-you-didnt) Replay says "you made this move" when you didn't (**ROOT**), [F22](#f22--discarded-cards-missing-from-the-history) Discarded cards missing from the history (**PARTIAL**), [P3](#p3--explorer-figures-swallow-taps-on-the-space-above-them) Explorer figures swallow taps on the space above them (**ROOT**), [U2](#u2--botchoose-silently-plays-a-different-ai-when-the-network-is-missing) botChoose silently plays a different AI when the network is missing (**NOT FIXED**)

### `DD-rules-outside-engine` — 9 bugs (PARTIAL 6, ROOT 2, NOT FIXED 1)

[A10](#a10--can-buy--end-turn-nudge-computed-in-the-page-ignoring-a-pending-removal) "Can buy" / end-turn nudge computed in the page, ignoring a pending removal (**ROOT**), [A16](#a16--couldnt-drag-cards-onto-rubble--base-camps) Couldn't drag cards onto rubble / base camps (**PARTIAL**), [A23](#a23--training-exploration-left-mechanisms-unexplored-keeptrashpay-choices-transmitter-not-buying) Training exploration left mechanisms unexplored (keep/trash/pay choices, Transmitter, not buying) (**NOT FIXED**), [A29](#a29--ai-games-stall-hit-the-25-round-cap-explorer-stranded-before-el-dorado) AI games stall: hit the 25-round cap (explorer stranded before El Dorado) (**PARTIAL**), [A31](#a31--bot-valued-an-arrived-players-place-wrongly-twice) Bot valued an arrived player's place wrongly (twice) (**PARTIAL**), [B20](#b20--the-bot-counted-an-arrivals-place-as-final-too-early-with-an-incomplete-tie-break) The bot counted an arrival's place as final too early, with an incomplete tie-break (**PARTIAL**), [D17](#d17--player-chips-showed-a-total-blockade-value-that-isnt-the-tie-break) Player chips showed a "total blockade value" that isn't the tie-break (**PARTIAL**), [E16](#e16--a-purchase-could-get-stuck-after-playing-a-travel-log-or-scientist) A purchase could get stuck after playing a Travel Log or Scientist (**ROOT**), [F14](#f14--you-always-sit-first) You always sit first (**PARTIAL**)

### `DD-ui-flags` — 8 bugs (NOT FIXED 4, ROOT 2, HACK 1, PARTIAL 1)

[A11](#a11--end-turn-you-can-still-afford-warning-reuses-the-big-button-slot-extra-clicks-tap-through) End-turn "you can still afford…" warning reuses the big button slot (extra clicks, tap-through) (**NOT FIXED**), [A14](#a14--all-cards-overlay-state-uiallopen-leaks-across-modes-and-games) "All cards" overlay state (`UI.allOpen`) leaks across modes and games (**NOT FIXED**), [A17](#a17--rubblebase-camp-progress-dots-never-went-away-and-their-pulse-never-played) Rubble/base-camp progress dots never went away (and their pulse never played) (**ROOT**), [B18](#b18--rubble--base-camp-progress-counter-never-goes-away) Rubble / base-camp progress counter never goes away (**ROOT**), [E6](#e6--a-finished-games-results-stayed-on-screen-under-a-new-game) A finished game's results stayed on screen under a new game (**HACK**), [E19](#e19--menu-workflows-led-to-broken-states-online-game-dropped-seated-in-a-room-youd-left) Menu workflows led to broken states (online game dropped, seated in a room you'd left) (**PARTIAL**), [P4](#p4--all-cards-overlay-leaks-across-states) "All cards" overlay leaks across states (**NOT FIXED**), [P32](#p32--exit-replay-dumps-you-on-the-start-screen-not-the-results) Exit replay dumps you on the start screen, not the results (**NOT FIXED**)

### `DD-whole-rebuild` — 8 bugs (ROOT 3, PARTIAL 3, NOT FIXED 2)

[A17](#a17--rubblebase-camp-progress-dots-never-went-away-and-their-pulse-never-played) Rubble/base-camp progress dots never went away (and their pulse never played) (**ROOT**), [B5](#b5--panzoom-not-smooth-zoom-takes-about-a-quarter-second-to-start) Pan/zoom not smooth; zoom takes about a quarter second to start (**ROOT**), [D25](#d25--the-menus-background-flickers-and-every-click-re-lays-out-the-whole-screen) The menu's background flickers and every click re-lays out the whole screen (**ROOT**), [E5](#e5--sharp-delay-when-clicking-and-dragging-on-the-phone) Sharp delay when clicking and dragging on the phone (**PARTIAL**), [E7](#e7--jack-of-all-trades-popped-in-late-in-all-cards) Jack of All Trades popped in late in "All cards" (**PARTIAL**), [E9](#e9--ui-regressions-kept-shipping-a-lot-of-jank-and-a-lot-of-regressions) UI regressions kept shipping ("a lot of jank and a lot of regressions") (**PARTIAL**), [P7](#p7--turn-hand-offs-drop-67-frames-ai-turns-run-at-20-fps) Turn hand-offs drop 6–7 frames; AI turns run at ~20 fps (**NOT FIXED**), [P9](#p9--one-off-hitches-select-buy-undo-drop-market-hide-setup-clicks-replay-openleave) One-off hitches (select, buy, undo, drop, market hide, setup clicks, replay open/leave) (**NOT FIXED**)

### `DD-work-in-reply-path` — 7 bugs (PARTIAL 6, HACK 1)

[B21](#b21--the-deep-search-test-hung) The deep-search test hung (**HACK**), [C5](#c5--online-ais-played-the-rest-of-the-game-in-one-alarm-a-resigning-players-answer-took-57-s) Online AIs played the rest of the game in one alarm; a resigning player's answer took 5–7 s (**PARTIAL**), [C6](#c6--every-new-worker-instance-ran-25-database-queries-before-answering-3-s-per-api-request) Every new Worker instance ran ~25 database queries before answering (≈3 s per /api request) (**PARTIAL**), [F7](#f7--create-room-takes-a-couple-of-seconds) Create room takes a couple of seconds (**PARTIAL**), [F13](#f13--resigning-online-takes-five-seconds) Resigning online takes five seconds (**PARTIAL**), [P1](#p1--online-resign-takes-127-s) Online resign takes 1.2–7 s (**PARTIAL**), [P16](#p16--create-room-16-s-add-ai-190-ms-each-leaderboard-and-shared-replays-1-s) Create room 1.6 s; Add AI ~190 ms each; leaderboard and shared replays ~1 s (**PARTIAL**)

### `DD-animation-coupled` — 7 bugs (PARTIAL 5, NOT FIXED 2)

[E29](#e29--false-invariant-marketrectof-asserted-every-card-type-still-has-a-stack) False invariant: `marketRectOf` asserted every card type still has a stack (**PARTIAL**), [E30](#e30--false-invariant-animatemove-the-explorer-is-drawn--game-restored-toasts) False invariant `animateMove: the explorer is drawn` → "game restored" toasts (**PARTIAL**), [F3](#f3--a-card-blinks-as-it-lands-in-the-history) A card blinks as it lands in the history (**PARTIAL**), [F28](#f28--animatemove-the-explorer-is-drawn-at-the-start-of-online-games) "animateMove: the explorer is drawn" at the start of online games (**PARTIAL**), [P6](#p6--online-assertion-animatemove-the-explorer-is-drawn-at-game-start) Online assertion 'animateMove: the explorer is drawn' at game start (**PARTIAL**), [P26](#p26--animation-gates-input-and-the-ai-a-second-card-is-ignored-while-an-explorer-walks-local-ais-freeze-in-a-hidden-tab) Animation gates input and the AI: a second card is ignored while an explorer walks; local AIs freeze in a hidden tab (**NOT FIXED**), [P31](#p31--undo-snaps-the-explorer-back-with-no-animation) Undo snaps the explorer back with no animation (**NOT FIXED**)

### `DD-unverified-data` — 5 bugs (PARTIAL 4, NOT FIXED 1)

[A2](#a2--boards-were-made-up-random-routes-reconstructed-tiles-blockades-laid-in-number-order) Boards were made up: random routes, reconstructed tiles, blockades laid in number order (**PARTIAL**), [A3](#a3--blockade-costs-are-a-guess-111122) Blockade costs are a guess (1,1,1,1,2,2) (**NOT FIXED**), [A6](#a6--first-expedition-course-fitted-to-a-blurry-rulebook-scan) First Expedition course fitted to a blurry rulebook scan (**PARTIAL**), [A9](#a9--tiles-i-and-n-transcribed-one-strength-short) Tiles I and N transcribed one strength short (**PARTIAL**), [C16](#c16--boards-i-and-n-were-wrong-on-first-expedition-for-a-day-and-knowingly-left-wrong-for-an-hour) Boards I and N were wrong on First Expedition for a day, and knowingly left wrong for an hour (**PARTIAL**)

### `DD-global-state` — 5 bugs (ROOT 3, PARTIAL 2)

[B16](#b16--look-ahead-copies-of-the-game-shared-the-card-table-so-the-planner-judged-the-wrong-cards-after-a-buy) Look-ahead copies of the game shared the card table, so the planner judged the wrong cards after a buy (**PARTIAL**), [D24](#d24--the-online-shuffle-secret-came-from-mathrandom-next-to-a-published-value-critique-b4) The online shuffle secret came from Math.random next to a published value (critique B4) (**ROOT**), [E13](#e13--ai-decisions-and-ai-tools-were-not-reproducible-from-a-seed) AI decisions and AI tools were not reproducible from a seed (**ROOT**), [E25](#e25--buildmjs-couldnt-export-an-engine-name-that-objectprototype-also-has) build.mjs couldn't export an engine name that `Object.prototype` also has (**PARTIAL**), [F31](#f31--the-planners-plan-lived-in-a-module-global-tools-shared-one-plan) The planner's plan lived in a module global (tools shared one plan) (**ROOT**)

### `DD-compat-path` — 5 bugs (PARTIAL 3, ROOT 2)

[D6](#d6--cut-off-games-scored-by-the-networks-own-guess-against-the-owners-specification) Cut-off games scored by the network's own guess, against the owner's specification (**PARTIAL**), [D24](#d24--the-online-shuffle-secret-came-from-mathrandom-next-to-a-published-value-critique-b4) The online shuffle secret came from Math.random next to a published value (critique B4) (**ROOT**), [E13](#e13--ai-decisions-and-ai-tools-were-not-reproducible-from-a-seed) AI decisions and AI tools were not reproducible from a seed (**ROOT**), [F32](#f32--refactors-left-compatibility-paths-tech-debt) Refactors left compatibility paths (tech debt) (**PARTIAL**), [F33](#f33--a-v1-training-replay-listed-on-the-live-site-but-unplayable) A v1 training replay listed on the live site but unplayable (**PARTIAL**)

### `DD-board-inherits-ui-state` — 4 bugs (PARTIAL 2, ROOT 1, NOT FIXED 1)

[B3](#b3--runtime-css-variable-and-has-on-app-restyle-the-whole-board) Runtime CSS variable and `:has()` on `#app` restyle the whole board (**PARTIAL**), [B5](#b5--panzoom-not-smooth-zoom-takes-about-a-quarter-second-to-start) Pan/zoom not smooth; zoom takes about a quarter second to start (**ROOT**), [B6](#b6--grab-start-stalls-the-grabbing-cursor-restyles-every-board-element) Grab start stalls: the grabbing cursor restyles every board element (**NOT FIXED**), [E5](#e5--sharp-delay-when-clicking-and-dragging-on-the-phone) Sharp delay when clicking and dragging on the phone (**PARTIAL**)

### `DD-no-budget` — 4 bugs (PARTIAL 4)

[C13](#c13--training-stopped-when-the-disk-filled-with-28-gb-of-old-self-play-batches) Training stopped when the disk filled with 28 GB of old self-play batches (**PARTIAL**), [C17](#c17--the-engine-was-slow-in-self-play-the-engine-should-not-be-slow) The engine was slow in self-play ("the engine should not be slow") (**PARTIAL**), [D12](#d12--the-site-loads-slowly-one-313-kb-page-for-a-tiny-start-screen) The site loads slowly: one 313 KB page for a tiny start screen (**PARTIAL**), [E10](#e10--the-test-suite-was-too-slow-for-a-quick-turnaround) The test suite was too slow for a quick turnaround (**PARTIAL**)

### `DD-unvalidated-model` — 3 bugs (ROOT 1, PARTIAL 1, NOT FIXED 1)

[B11](#b11--the-ai-buys-first-and-gives-up-a-free-move-its-values-jump-between-consecutive-decisions-of-one-turn) The AI buys first and gives up a free move; its values jump between consecutive decisions of one turn (**ROOT**), [H1](#h1--replay-every-option-list-rated-end-the-turn-keep-everything-close-to-real-moves) Replay "every option" list rated "end the turn, keep everything" close to real moves (**PARTIAL**), [H2](#h2--replay-winning-chances-are-not-winning-chances) Replay "winning chances" are not winning chances (**NOT FIXED**)

### `DD-dense-lines` — 2 bugs (PARTIAL 2)

[D11](#d11--training-runs-crashed-at-start-a-comment-swallowed-the-setup-line) Training runs crashed at start: a comment swallowed the setup line (**PARTIAL**), [F16](#f16--room-lobby-line-swallowed-by-a-comment-full-room-still-offers-ais) Room lobby line swallowed by a comment (full room still offers AIs) (**PARTIAL**)

## Bugs by the assertion that would have caught them

Each list is the bugs one assertion (or check) would have caught during a playthrough, before the owner saw them.

### `AS-none` — 48 bugs (PARTIAL 25, NOT FIXED 17, ROOT 6)

[A20](#a20--explorer-miniatures-chibi-figures-per-seat-colour-only-on-clothes) Explorer miniatures: chibi figures per seat, colour only on clothes (**PARTIAL**), [A21](#a21--ai-input-summarised-the-map-instead-of-encoding-every-space) AI input summarised the map instead of encoding every space (**ROOT**), [A24](#a24--buying-was-click-only-annoying-the-drag-to-buy-that-fixed-it-runs-on-flags-and-timers) Buying was click-only (annoying); the drag-to-buy that fixed it runs on flags and timers (**PARTIAL**), [A30](#a30--improve-the-heuristic-done-as-cpu-heavy-sweeps-competing-with-training) "Improve the heuristic" done as CPU-heavy sweeps competing with training (**PARTIAL**), [A34](#a34--a-result-attributed-to-seat-effects-without-evidence) A result attributed to "seat effects" without evidence (**PARTIAL**), [B4](#b4--process-regression-hunting-and-pausing-training-instead-of-profiling-what-the-owner-felt) Process: regression-hunting and pausing training instead of profiling what the owner felt (**PARTIAL**), [B8](#b8--process-papering-over-bugs-and-building-workarounds-instead-of-the-well-trodden-way) Process: papering over bugs and building workarounds instead of the well-trodden way (**PARTIAL**), [B12](#b12--process-the-background-agent-and-the-main-agent-shared-one-working-tree) Process: the background agent and the main agent shared one working tree (**PARTIAL**), [B15](#b15--search-training-looked-like-it-was-getting-worse-the-progress-test-measured-search-not-training) Search training looked like it was getting worse: the progress test measured search, not training (**PARTIAL**), [C14](#c14--the-owners-question-waited-behind-work-before-you-do-this-can-you-prioritize-giving-me-a-report) The owner's question waited behind work ("Before you do this, can you prioritize giving me a report?") (**PARTIAL**), [C15](#c15--a-base-camp-request-from-the-owner-camps-usable-once-a-common-house-rule-silently-disappeared) A base-camp request from the owner (camps usable once, a common house rule) silently disappeared (**NOT FIXED**), [G2](#g2--replays-play-too-fast-and-the-speed-setting-couldnt-be-found) Replays play too fast, and the speed setting couldn't be found (**NOT FIXED**), [D1](#d1--the-owners-questions-wait-behind-claudes-work) The owner's questions wait behind Claude's work (**PARTIAL**), [D4](#d4--training-iterations-far-slower-than-claude-said) Training iterations far slower than Claude said (**PARTIAL**), [D6](#d6--cut-off-games-scored-by-the-networks-own-guess-against-the-owners-specification) Cut-off games scored by the network's own guess, against the owner's specification (**PARTIAL**), [D7](#d7--the-live-training-page-showed-different-arrival-numbers-than-claude-reported) The live training page showed different arrival numbers than Claude reported (**NOT FIXED**), [D11](#d11--training-runs-crashed-at-start-a-comment-swallowed-the-setup-line) Training runs crashed at start: a comment swallowed the setup line (**PARTIAL**), [D18](#d18--the-design-review-agent-died-with-a-worker-restart-and-its-work-was-lost) The design-review agent died with a worker restart and its work was lost (**PARTIAL**), [D19](#d19--a-white-box-behind-the-google-sign-in-button) A white box behind the Google sign-in button (**PARTIAL**), [D26](#d26--the-network-ai-without-search-does-weird-stuff-on-the-site-orellana) The network AI without search "does weird stuff" on the site (Orellana) (**ROOT**), [E10](#e10--the-test-suite-was-too-slow-for-a-quick-turnaround) The test suite was too slow for a quick turnaround (**PARTIAL**), [E12](#e12--occasional-flicker-after-moving-the-map-iphone-11-safari-the-mark-button-was-unusable) Occasional flicker after moving the map (iPhone 11 Safari); the Mark button was unusable (**NOT FIXED**), [E18](#e18--page-tests-failed-under-machine-load-fixed-pauses-deal-dependent-checks) Page tests failed under machine load (fixed pauses, deal-dependent checks) (**PARTIAL**), [E20](#e20--ai-training-starved-the-machine-that-builds-and-tests) AI training starved the machine that builds and tests (**NOT FIXED**), [E25](#e25--buildmjs-couldnt-export-an-engine-name-that-objectprototype-also-has) build.mjs couldn't export an engine name that `Object.prototype` also has (**PARTIAL**), [E34](#e34--design-agents-ran-on-the-main-thread-so-the-owner-kept-stopping-them) Design agents ran on the main thread, so the owner kept stopping them (**PARTIAL**), [H4](#h4--owners-status-questions-went-unanswered-or-got-a-wrong-answer-a-request-waited-six-hours) Owner's status questions went unanswered or got a wrong answer; a request waited six hours (**PARTIAL**), [F4](#f4--history-docked-to-the-left-is-hard-to-undock) History docked to the left is hard to undock (**ROOT**), [F8](#f8--stopping-a-card-with-strength-left-needs-a-hard-to-find-done) Stopping a card with strength left needs a hard-to-find Done (**PARTIAL**), [F10](#f10--replays-list-no-winner-every-opponent-named-a-useless-upload-button) Replays list: no winner, every opponent named, a useless Upload button (**ROOT**), [F19](#f19--rules-questions-not-answered-first-the-tie-break-answer-misread) Rules questions not answered first; the tie-break answer misread (**NOT FIXED**), [F20](#f20--replay-shows-meaningless-n-left-figures) Replay shows meaningless "N left" figures (**ROOT**), [F21](#f21--a-useless-end-step-in-the-history) A useless "End" step in the history (**ROOT**), [F23](#f23--useless-information-across-the-ui-audit) Useless information across the UI (audit) (**PARTIAL**), [F25](#f25--process-measured-in-our-setup-dismissed-the-owners-the-gaslighting) Process: measured in our setup, dismissed the owner's (the "gaslighting") (**PARTIAL**), [F26](#f26--process-shipped-a-change-the-owner-had-said-not-to-ship) Process: shipped a change the owner had said not to ship (**PARTIAL**), [F27](#f27--process-instructions-misread-or-ignored) Process: instructions misread or ignored (**PARTIAL**), [F29](#f29--process-claude-stops-working-after-answering) Process: Claude stops working after answering (**NOT FIXED**), [P17](#p17--replay-max-speed-is-4) Replay max speed is 4× (**NOT FIXED**), [P20](#p20--ai-opponents-only-on-first-expedition-with-34-players) AI opponents only on First Expedition with 3–4 players (**NOT FIXED**), [P21](#p21--ending-a-turn-with-cards-left-takes-23-clicks) Ending a turn with cards left takes 2–3 clicks (**NOT FIXED**), [P22](#p22--start-a-new-game-discards-the-running-game-with-one-click) "Start a new game" discards the running game with one click (**NOT FIXED**), [P23](#p23--online-time-bank-is-uncapped) Online time bank is uncapped (**NOT FIXED**), [P24](#p24--the-history-button-is-a-hidden-3-way-cycle) The History button is a hidden 3-way cycle (**NOT FIXED**), [P25](#p25--opening-the-menu-doesnt-pause-local-ais) Opening the menu doesn't pause local AIs (**NOT FIXED**), [P27](#p27--end-screen-ranks-non-arrivals-without-saying-why) End screen ranks non-arrivals without saying why (**NOT FIXED**), [P32](#p32--exit-replay-dumps-you-on-the-start-screen-not-the-results) Exit replay dumps you on the start screen, not the results (**NOT FIXED**), [P33](#p33--rules-are-one-long-wall-onlineai-paragraphs-before-the-turn-rules) Rules are one long wall, Online/AI paragraphs before the turn rules (**NOT FIXED**)

### `AS-view-matches-state` — 28 bugs (PARTIAL 11, ROOT 9, NOT FIXED 6, HACK 2)

[A5](#a5--online-screens-live-room-list-didnt-connect-right-after-signing-in) Online screen's live room list didn't connect right after signing in (**PARTIAL**), [A7](#a7--every-card-showed-a-gold-coin-badge-in-the-top-left-corner) Every card showed a gold coin badge in the top-left corner (**ROOT**), [A13](#a13--affordable-market-cards-pulsed-all-the-time) Affordable market cards pulsed all the time (**PARTIAL**), [A14](#a14--all-cards-overlay-state-uiallopen-leaks-across-modes-and-games) "All cards" overlay state (`UI.allOpen`) leaks across modes and games (**NOT FIXED**), [A17](#a17--rubblebase-camp-progress-dots-never-went-away-and-their-pulse-never-played) Rubble/base-camp progress dots never went away (and their pulse never played) (**ROOT**), [A25](#a25--a-card-spent-on-a-purchase-leaves-a-hole-in-the-hand) A card spent on a purchase leaves a hole in the hand (**NOT FIXED**), [B13](#b13--the-zoom-bake-could-fire-in-the-middle-of-a-glide-or-a-new-grab) The zoom bake could fire in the middle of a glide or a new grab (**HACK**), [B18](#b18--rubble--base-camp-progress-counter-never-goes-away) Rubble / base-camp progress counter never goes away (**ROOT**), [B19](#b19--el-dorados-finishing-spaces-always-drawn-gold-even-when-they-need-water) El Dorado's finishing spaces always drawn gold, even when they need water (**PARTIAL**), [D3](#d3--a-buy-button-that-could-never-be-the-way-to-buy) A "Buy" button that could never be the way to buy (**ROOT**), [D15](#d15--no-menu-during-a-game-leaderboard-resign-and-sign-out-only-by-abandoning-or-digging) No menu during a game: leaderboard, resign and sign-out only by abandoning or digging (**ROOT**), [D17](#d17--player-chips-showed-a-total-blockade-value-that-isnt-the-tie-break) Player chips showed a "total blockade value" that isn't the tie-break (**PARTIAL**), [D28](#d28--no-way-back-to-local-play-once-you-chose-online) No way back to local play once you chose Online (**ROOT**), [E4](#e4--the-board-painted-over-the-menu-for-a-quarter-second-on-load) The board painted over the menu for a quarter second on load (**ROOT**), [E6](#e6--a-finished-games-results-stayed-on-screen-under-a-new-game) A finished game's results stayed on screen under a new game (**HACK**), [E19](#e19--menu-workflows-led-to-broken-states-online-game-dropped-seated-in-a-room-youd-left) Menu workflows led to broken states (online game dropped, seated in a room you'd left) (**PARTIAL**), [F5](#f5--hand-not-laid-out-again-when-the-game-area-changes-size) Hand not laid out again when the game area changes size (**ROOT**), [F6](#f6--resigning-doesnt-let-you-leave-rejoin-puts-you-back-in-the-game) Resigning doesn't let you leave; Rejoin puts you back in the game (**PARTIAL**), [F9](#f9--replay-says-you-made-this-move-when-you-didnt) Replay says "you made this move" when you didn't (**ROOT**), [F11](#f11--travel-log--scientist-removing-cards-isnt-visibly-asked) Travel Log / Scientist: removing cards isn't visibly asked (**PARTIAL**), [F15](#f15--history-center-mode-goes-blank-on-your-own-turn) History "center" mode goes blank on your own turn (**PARTIAL**), [F16](#f16--room-lobby-line-swallowed-by-a-comment-full-room-still-offers-ais) Room lobby line swallowed by a comment (full room still offers AIs) (**PARTIAL**), [F28](#f28--animatemove-the-explorer-is-drawn-at-the-start-of-online-games) "animateMove: the explorer is drawn" at the start of online games (**PARTIAL**), [P4](#p4--all-cards-overlay-leaks-across-states) "All cards" overlay leaks across states (**NOT FIXED**), [P5](#p5--reloading-or-rejoining-a-running-online-game-flashes-the-room-lobby) Reloading or rejoining a running online game flashes the room lobby (**NOT FIXED**), [P6](#p6--online-assertion-animatemove-the-explorer-is-drawn-at-game-start) Online assertion 'animateMove: the explorer is drawn' at game start (**PARTIAL**), [P13](#p13--paying-by-drag-leaves-a-hole-in-the-hand) Paying by drag leaves a hole in the hand (**NOT FIXED**), [P30](#p30--idle-hand-4-cards-overlap-while-half-the-bottom-edge-is-empty) Idle hand: 4 cards overlap while half the bottom edge is empty (**NOT FIXED**)

### `AS-layout-shift` — 20 bugs (PARTIAL 9, ROOT 4, NOT FIXED 4, HACK 3)

[B1](#b1--replay-controls-vanish-at-some-screen-sizes-layout-bugs-keep-coming-back) Replay controls vanish at some screen sizes; layout bugs keep coming back (**PARTIAL**), [C10](#c10--the-opponents-recap-made-the-prompt-box-content-sized-it-collides-with-the-turn-buttons-and-changes-size-as-steps-arrive) The opponents' recap made the prompt box content-sized: it collides with the turn buttons and changes size as steps arrive (**HACK**), [G1](#g1--replay-controls-disappear-at-the-end-of-every-turn) Replay controls disappear at the end of every turn (**ROOT**), [D8](#d8--misaligned-top-bar-promptmarket-and-menu-controls-design-review-a2-a3-a4-a7-a8-a19) Misaligned top bar, prompt/market and menu controls (design review A2, A3, A4, A7, A8, A19) (**PARTIAL**), [D16](#d16--your-games-reshuffles-when-the-online-list-arrives) "Your games" reshuffles when the online list arrives (**NOT FIXED**), [D21](#d21--the-menu-panel-changes-size-from-screen-to-screen) The menu panel changes size from screen to screen (**ROOT**), [D30](#d30--the-start-screen-re-renders-when-late-fonts-arrive) The start screen re-renders when late fonts arrive (**ROOT**), [E1](#e1--start-screen-text-swapped-fonts-and-looked-different-on-a-second-visit) Start-screen text swapped fonts, and looked different on a second visit (**PARTIAL**), [E3](#e3--board-starts-zoomed-in-then-zooms-itself-out-refit-a-second-after-start) Board "starts zoomed in, then zooms itself out"; refit a second after Start (**PARTIAL**), [E8](#e8--the-explorer-no-longer-hopped-it-slidteleported-fast-on-the-phone) The explorer no longer hopped: it slid/teleported, fast, on the phone (**HACK**), [E22](#e22--player-chips-cut-in-half-when-the-game-area-was-narrow) Player chips cut in half when the game area was narrow (**PARTIAL**), [E33](#e33--history-panel-a-resize-loop-and-a-content-sized-panel) History panel: a resize loop, and a content-sized panel (**PARTIAL**), [F1](#f1--history-panel-grows-sideways-instead-of-downwards) History panel grows sideways instead of downwards (**ROOT**), [F2](#f2--a-turn-in-the-history-wraps-onto-two-lines-captions-crowd-the-cards) A turn in the history wraps onto two lines (captions crowd the cards) (**PARTIAL**), [F17](#f17--prompt-box-and-history-row-grow-and-shrink) Prompt box and history row grow and shrink (**PARTIAL**), [F18](#f18--whose-turn-heading-pops-in-at-the-end-of-the-turn) "Whose turn" heading pops in at the end of the turn (**PARTIAL**), [P10](#p10--prompt-pill-changes-size-on-every-state) Prompt pill changes size on every state (**HACK**), [P11](#p11--turn-buttons-move-and-change-meaning-under-the-finger-undo-jumps-end-turnundo-vanish-in-buy-mode-double-taps-pass-confirmations) Turn buttons move and change meaning under the finger (Undo jumps; End turn/Undo vanish in buy mode; double taps pass confirmations) (**NOT FIXED**), [P12](#p12--player-bar-jumps-51-px-at-round-n--final) Player bar jumps 51 px at "Round N · final" (**NOT FIXED**), [P14](#p14--replays--my-games-reshuffles-under-the-cursor) Replays → My games reshuffles under the cursor (**NOT FIXED**)

### `AS-no-silent-catch` — 14 bugs (PARTIAL 6, NOT FIXED 4, ROOT 3, HACK 1)

[A19](#a19--sound-every-failure-swallowed-very-first-tap-silent) Sound: every failure swallowed; very first tap silent (**PARTIAL**), [A28](#a28--training-progress-page-stopped-updating) Training progress page stopped updating (**HACK**), [A33](#a33--illegal-ai-or-logged-actions-silently-turned-into-end-turn) Illegal AI or logged actions silently turned into "end turn" (**PARTIAL**), [C3](#c3--an-illegal-ai-action-was-silently-replaced-by-end-turn-the-test-that-checked-it-could-not-fail) An illegal AI action was silently replaced by "end turn"; the test that checked it could not fail (**PARTIAL**), [D23](#d23--an-engine-exception-in-a-room-left-the-game-half-changed-first-fix-swallowed-it-critique-b2) An engine exception in a room left the game half-changed; first fix swallowed it (critique B2) (**ROOT**), [E26](#e26--the-room-turned-every-engine-exception-into-bad-action-and-rebuilt-the-game-on-every-refused-move) The Room turned every engine exception into "Bad action." and rebuilt the game on every refused move (**ROOT**), [E27](#e27--a-saved-game-that-couldnt-be-rebuilt-silently-started-a-new-game) A saved game that couldn't be rebuilt silently started a new game (**ROOT**), [E28](#e28--catches-too-wide-loadreplayid-hid-display-bugs-the-fullscreen-rejection-went-unhandled) Catches too wide: loadReplayId hid display bugs; the fullscreen rejection went unhandled (**PARTIAL**), [E33](#e33--history-panel-a-resize-loop-and-a-content-sized-panel) History panel: a resize loop, and a content-sized panel (**PARTIAL**), [F32](#f32--refactors-left-compatibility-paths-tech-debt) Refactors left compatibility paths (tech debt) (**PARTIAL**), [P19](#p19--closing-a-socket-takes-10-s-silent-drops-detected-after-40-s) Closing a socket takes 10 s; silent drops detected after 40 s (**NOT FIXED**), [U1](#u1--tests-that-silently-skip-their-own-checks) Tests that silently skip their own checks (**NOT FIXED**), [U2](#u2--botchoose-silently-plays-a-different-ai-when-the-network-is-missing) botChoose silently plays a different AI when the network is missing (**NOT FIXED**), [U3](#u3--42-empty-catch--blocks-in-page-and-server) 42 empty `catch {}` blocks in page and server (**NOT FIXED**)

### `AS-no-overlap` — 13 bugs (PARTIAL 5, NOT FIXED 4, HACK 2, ROOT 2)

[A12](#a12--action-card-text-ran-into-the-card-footer) Action-card text ran into the card footer (**HACK**), [A15](#a15--market-floated-over-the-game-took-the-top-of-the-board-covered-end-turn-then-covered-the-replay-panel) Market floated over the game: took the top of the board, covered End turn, then covered the replay panel (**PARTIAL**), [A18](#a18--market-hover-preview-enlarges-over-the-top-bar) Market hover preview enlarges over the top bar (**NOT FIXED**), [B1](#b1--replay-controls-vanish-at-some-screen-sizes-layout-bugs-keep-coming-back) Replay controls vanish at some screen sizes; layout bugs keep coming back (**PARTIAL**), [B2](#b2--player-chips-clipped-the-third-player-hidden-on-phones-and-under-market-in-replays) Player chips clipped: the third player hidden on phones and under "Market" in replays (**PARTIAL**), [C9](#c9--pop-up-windows-rules-and-others-were-wider-than-the-screen-at-390-px) Pop-up windows (Rules and others) were wider than the screen at 390 px (**HACK**), [G1](#g1--replay-controls-disappear-at-the-end-of-every-turn) Replay controls disappear at the end of every turn (**ROOT**), [D9](#d9--online-game-starts-with-the-market-covering-el-dorado-design-review-a23) Online game starts with the market covering El Dorado (design review A23) (**ROOT**), [D10](#d10--design-review-defects-found-and-left-open-a1-a9a18-a20a22-a24) Design-review defects found and left open (A1, A9–A18, A20–A22, A24) (**NOT FIXED**), [D20](#d20--the-el-dorado-label-sits-on-a-finishing-space) The "El Dorado" label sits on a finishing space (**PARTIAL**), [P18](#p18--waiting-for-ais-59-s-a-round-each-ai-turn-under-a-centre-screen-banner) Waiting for AIs: ~5–9 s a round, each AI turn under a centre-screen banner (**PARTIAL**), [P28](#p28--buy-mode-pay-slot-and-paid-cards-float-over-the-board-the-raised-card-covers-the-counter-treasure-chests-value-vs-cost) Buy mode: pay slot and paid cards float over the board; the raised card covers the counter; Treasure Chest's value vs cost (**NOT FIXED**), [P29](#p29--market-hover-preview-spills-over-menu-its-badge-is-clipped-the-all-cards-x-sits-over-menu) Market hover preview spills over Menu; its badge is clipped; the All cards X sits over Menu (**NOT FIXED**)

### `AS-frame-budget` — 13 bugs (NOT FIXED 6, PARTIAL 3, HACK 3, ROOT 1)

[B3](#b3--runtime-css-variable-and-has-on-app-restyle-the-whole-board) Runtime CSS variable and `:has()` on `#app` restyle the whole board (**PARTIAL**), [B4](#b4--process-regression-hunting-and-pausing-training-instead-of-profiling-what-the-owner-felt) Process: regression-hunting and pausing training instead of profiling what the owner felt (**PARTIAL**), [B5](#b5--panzoom-not-smooth-zoom-takes-about-a-quarter-second-to-start) Pan/zoom not smooth; zoom takes about a quarter second to start (**ROOT**), [B6](#b6--grab-start-stalls-the-grabbing-cursor-restyles-every-board-element) Grab start stalls: the grabbing cursor restyles every board element (**NOT FIXED**), [C4](#c4--local-ais-think-on-the-pages-main-thread-frame-rate-never-measured-during-ai-turns) Local AIs think on the page's main thread; frame rate never measured during AI turns (**NOT FIXED**), [D13](#d13--wheel-zoom-latency-over-budget-once-the-real-fonts-loaded-shipped-failing-then-the-test-was-loosened) Wheel-zoom latency over budget once the real fonts loaded; shipped failing, then the test was loosened (**HACK**), [E5](#e5--sharp-delay-when-clicking-and-dragging-on-the-phone) Sharp delay when clicking and dragging on the phone (**PARTIAL**), [E8](#e8--the-explorer-no-longer-hopped-it-slidteleported-fast-on-the-phone) The explorer no longer hopped: it slid/teleported, fast, on the phone (**HACK**), [E11](#e11--performance-budgets-loosened-when-they-failed) Performance budgets loosened when they failed (**HACK**), [P7](#p7--turn-hand-offs-drop-67-frames-ai-turns-run-at-20-fps) Turn hand-offs drop 6–7 frames; AI turns run at ~20 fps (**NOT FIXED**), [P8](#p8--late-game-nearly-every-turn-change-has-a-100200-ms-frame) Late game: nearly every turn change has a 100–200 ms frame (**NOT FIXED**), [P9](#p9--one-off-hitches-select-buy-undo-drop-market-hide-setup-clicks-replay-openleave) One-off hitches (select, buy, undo, drop, market hide, setup clicks, replay open/leave) (**NOT FIXED**), [U4](#u4--late-game-hand-offs-slower-playtest-8-not-reproduced) Late-game hand-offs slower (playtest #8): not reproduced (**NOT FIXED**)

### `AS-latency-budget` — 13 bugs (PARTIAL 9, NOT FIXED 4)

[C5](#c5--online-ais-played-the-rest-of-the-game-in-one-alarm-a-resigning-players-answer-took-57-s) Online AIs played the rest of the game in one alarm; a resigning player's answer took 5–7 s (**PARTIAL**), [C6](#c6--every-new-worker-instance-ran-25-database-queries-before-answering-3-s-per-api-request) Every new Worker instance ran ~25 database queries before answering (≈3 s per /api request) (**PARTIAL**), [D12](#d12--the-site-loads-slowly-one-313-kb-page-for-a-tiny-start-screen) The site loads slowly: one 313 KB page for a tiny start screen (**PARTIAL**), [D29](#d29--returning-players-see-a-blank-screen-while-the-page-asks-the-server-what-to-show) Returning players see a blank screen while the page asks the server what to show (**NOT FIXED**), [E2](#e2--the-site-took-a-couple-of-seconds-to-load-on-the-phone) The site took "a couple of seconds" to load on the phone (**PARTIAL**), [F7](#f7--create-room-takes-a-couple-of-seconds) Create room takes a couple of seconds (**PARTIAL**), [F12](#f12--room-lobby-waits-on-the-server-to-show-the-ai-options) Room lobby waits on the server to show the AI options (**PARTIAL**), [F13](#f13--resigning-online-takes-five-seconds) Resigning online takes five seconds (**PARTIAL**), [F24](#f24--resign-still-waits-for-the-server-owners-no-wait-not-done) Resign still waits for the server (owner's "no wait" not done) (**NOT FIXED**), [P1](#p1--online-resign-takes-127-s) Online resign takes 1.2–7 s (**PARTIAL**), [P2](#p2--returning-player-sees-a-blank-screen-for-1-s) Returning player sees a blank screen for ~1 s (**NOT FIXED**), [P15](#p15--page-boot-is-a-serial-waterfall) Page boot is a serial waterfall (**NOT FIXED**), [P16](#p16--create-room-16-s-add-ai-190-ms-each-leaderboard-and-shared-replays-1-s) Create room 1.6 s; Add AI ~190 ms each; leaderboard and shared replays ~1 s (**PARTIAL**)

### `AS-rules-vs-rulebook` — 11 bugs (PARTIAL 7, NOT FIXED 3, ROOT 1)

[A2](#a2--boards-were-made-up-random-routes-reconstructed-tiles-blockades-laid-in-number-order) Boards were made up: random routes, reconstructed tiles, blockades laid in number order (**PARTIAL**), [A3](#a3--blockade-costs-are-a-guess-111122) Blockade costs are a guess (1,1,1,1,2,2) (**NOT FIXED**), [A4](#a4--rulebook-tie-break-whoever-reached-el-dorado-first-not-implemented) Rulebook tie-break "whoever reached El Dorado first" not implemented (**NOT FIXED**), [A6](#a6--first-expedition-course-fitted-to-a-blurry-rulebook-scan) First Expedition course fitted to a blurry rulebook scan (**PARTIAL**), [A8](#a8--board-spaces-didnt-show-how-hard-they-are-icons-crowded-together) Board spaces didn't show how hard they are; icons crowded together (**ROOT**), [A9](#a9--tiles-i-and-n-transcribed-one-strength-short) Tiles I and N transcribed one strength short (**PARTIAL**), [C16](#c16--boards-i-and-n-were-wrong-on-first-expedition-for-a-day-and-knowingly-left-wrong-for-an-hour) Boards I and N were wrong on First Expedition for a day, and knowingly left wrong for an hour (**PARTIAL**), [D2](#d2--single-use-cards-played-for-movement-came-back-after-the-reshuffle) Single-use cards played for movement came back after the reshuffle (**PARTIAL**), [E17](#e17--the-turn-went-on-after-the-last-explorer-reached-el-dorado) The turn went on after the last explorer reached El Dorado (**PARTIAL**), [F14](#f14--you-always-sit-first) You always sit first (**PARTIAL**), [F19](#f19--rules-questions-not-answered-first-the-tie-break-answer-misread) Rules questions not answered first; the tie-break answer misread (**NOT FIXED**)

### `AS-engine-invariant` — 11 bugs (PARTIAL 7, ROOT 4)

[B16](#b16--look-ahead-copies-of-the-game-shared-the-card-table-so-the-planner-judged-the-wrong-cards-after-a-buy) Look-ahead copies of the game shared the card table, so the planner judged the wrong cards after a buy (**PARTIAL**), [B20](#b20--the-bot-counted-an-arrivals-place-as-final-too-early-with-an-incomplete-tie-break) The bot counted an arrival's place as final too early, with an incomplete tie-break (**PARTIAL**), [D2](#d2--single-use-cards-played-for-movement-came-back-after-the-reshuffle) Single-use cards played for movement came back after the reshuffle (**PARTIAL**), [D14](#d14--ai-seats-offered-in-setups-the-ai-was-never-trained-for-2-player-games-other-courses) AI seats offered in setups the AI was never trained for (2-player games, other courses) (**PARTIAL**), [D22](#d22--a-player-could-send-any-property-name-as-a-market-index-critique-b1) A player could send any property name as a market index (critique B1) (**PARTIAL**), [D27](#d27--double-clicking-add-ai-could-over-fill-a-room-critique-b3) Double-clicking "Add AI" could over-fill a room (critique B3) (**PARTIAL**), [E14](#e14--the-server-accepted-timeout-from-a-player-the-engine-accepted-endgame-out-of-turn) The server accepted `timeout` from a player; the engine accepted `endgame` out of turn (**ROOT**), [E16](#e16--a-purchase-could-get-stuck-after-playing-a-travel-log-or-scientist) A purchase could get stuck after playing a Travel Log or Scientist (**ROOT**), [E17](#e17--the-turn-went-on-after-the-last-explorer-reached-el-dorado) The turn went on after the last explorer reached El Dorado (**PARTIAL**), [E24](#e24--the-rules-test-built-maps-real-games-cant-have-engine-fallbacks-hid-it) The rules test built maps real games can't have; engine fallbacks hid it (**ROOT**), [F31](#f31--the-planners-plan-lived-in-a-module-global-tools-shared-one-plan) The planner's plan lived in a module global (tools shared one plan) (**ROOT**)

### `AS-training-health` — 10 bugs (PARTIAL 6, NOT FIXED 2, ROOT 1, HACK 1)

[A23](#a23--training-exploration-left-mechanisms-unexplored-keeptrashpay-choices-transmitter-not-buying) Training exploration left mechanisms unexplored (keep/trash/pay choices, Transmitter, not buying) (**NOT FIXED**), [A26](#a26--training-fundamentally-wrong-the-net-learned-the-heuristics-opinion-and-scored-chance-with-one-sample) Training "fundamentally wrong": the net learned the heuristic's opinion and scored chance with one sample (**PARTIAL**), [A27](#a27--training-included-2-player-games) Training included 2-player games (**PARTIAL**), [B14](#b14--four-way-test-report-win-rates-that-dont-add-up-to-100) Four-way test report: win rates that don't add up to 100% (**ROOT**), [B17](#b17--four-way-test-seats-did-not-rotate-evenly-across-workers) Four-way test seats did not rotate evenly across workers (**PARTIAL**), [C1](#c1--self-play-exploration-expensive-cards-almost-never-tried-the-exploration-we-had-was-a-hack) Self-play exploration: expensive cards almost never tried; the exploration we had was a hack (**NOT FIXED**), [C2](#c2--progress-test-did-not-measure-progress-the-heuristic-benchmark) Progress test did not measure progress (the heuristic benchmark) (**PARTIAL**), [C18](#c18--the-weight-cache-went-stale-when-a-tool-changed-weights-in-place) The weight cache went stale when a tool changed weights in place (**HACK**), [C20](#c20--dead-hidden-units-in-the-network) Dead hidden units in the network (**PARTIAL**), [D5](#d5--training-thrash-started-from-scratch-against-the-owners-wish-then-a-broken-warm-start-and-too-many-changes-at-once) Training thrash: started from scratch against the owner's wish, then a broken warm start and too many changes at once (**PARTIAL**)

### `AS-ai-progress` — 10 bugs (PARTIAL 8, HACK 1, NOT FIXED 1)

[A29](#a29--ai-games-stall-hit-the-25-round-cap-explorer-stranded-before-el-dorado) AI games stall: hit the 25-round cap (explorer stranded before El Dorado) (**PARTIAL**), [B10](#b10--process-long-runs-and-experiments-with-no-visible-progress) Process: long runs and experiments with no visible progress (**PARTIAL**), [B21](#b21--the-deep-search-test-hung) The deep-search test hung (**HACK**), [C3](#c3--an-illegal-ai-action-was-silently-replaced-by-end-turn-the-test-that-checked-it-could-not-fail) An illegal AI action was silently replaced by "end turn"; the test that checked it could not fail (**PARTIAL**), [C11](#c11--two-player-games-the-network-ais-mostly-never-reached-el-dorado) Two-player games: the network AIs mostly never reached El Dorado (**PARTIAL**), [C19](#c19--ais-stuck-forever-next-to-el-dorado-or-on-a-way-their-cards-cant-take) AIs stuck forever next to El Dorado or on a way their cards can't take (**PARTIAL**), [E23](#e23--an-ais-illegal-choice-silently-ended-its-turn) An AI's illegal choice silently ended its turn (**PARTIAL**), [E32](#e32--a-multi-course-network-would-have-made-humboldt-silently-play-as-the-route-planner) A multi-course network would have made Humboldt silently play as the route planner (**PARTIAL**), [F30](#f30--ai-games-stall-on-the-witchs-cauldron-course) AI games stall on the Witch's Cauldron course (**PARTIAL**), [P26](#p26--animation-gates-input-and-the-ai-a-second-card-is-ignored-while-an-explorer-walks-local-ais-freeze-in-a-hidden-tab) Animation gates input and the AI: a second card is ignored while an explorer walks; local AIs freeze in a hidden tab (**NOT FIXED**)

### `AS-dom-churn` — 9 bugs (PARTIAL 4, NOT FIXED 4, ROOT 1)

[B3](#b3--runtime-css-variable-and-has-on-app-restyle-the-whole-board) Runtime CSS variable and `:has()` on `#app` restyle the whole board (**PARTIAL**), [B6](#b6--grab-start-stalls-the-grabbing-cursor-restyles-every-board-element) Grab start stalls: the grabbing cursor restyles every board element (**NOT FIXED**), [D25](#d25--the-menus-background-flickers-and-every-click-re-lays-out-the-whole-screen) The menu's background flickers and every click re-lays out the whole screen (**ROOT**), [E5](#e5--sharp-delay-when-clicking-and-dragging-on-the-phone) Sharp delay when clicking and dragging on the phone (**PARTIAL**), [E7](#e7--jack-of-all-trades-popped-in-late-in-all-cards) Jack of All Trades popped in late in "All cards" (**PARTIAL**), [E9](#e9--ui-regressions-kept-shipping-a-lot-of-jank-and-a-lot-of-regressions) UI regressions kept shipping ("a lot of jank and a lot of regressions") (**PARTIAL**), [E12](#e12--occasional-flicker-after-moving-the-map-iphone-11-safari-the-mark-button-was-unusable) Occasional flicker after moving the map (iPhone 11 Safari); the Mark button was unusable (**NOT FIXED**), [P7](#p7--turn-hand-offs-drop-67-frames-ai-turns-run-at-20-fps) Turn hand-offs drop 6–7 frames; AI turns run at ~20 fps (**NOT FIXED**), [P9](#p9--one-off-hitches-select-buy-undo-drop-market-hide-setup-clicks-replay-openleave) One-off hitches (select, buy, undo, drop, market hide, setup clicks, replay open/leave) (**NOT FIXED**)

### `AS-matches-engine` — 6 bugs (PARTIAL 5, ROOT 1)

[A10](#a10--can-buy--end-turn-nudge-computed-in-the-page-ignoring-a-pending-removal) "Can buy" / end-turn nudge computed in the page, ignoring a pending removal (**ROOT**), [A31](#a31--bot-valued-an-arrived-players-place-wrongly-twice) Bot valued an arrived player's place wrongly (twice) (**PARTIAL**), [A32](#a32--game-results-in-trainingbenchmarks-a-capped-non-arrival-could-win-then-the-last-racer-counted-as-a-capped-loss) Game results in training/benchmarks: a capped non-arrival could "win", then the last racer counted as a capped loss (**PARTIAL**), [B9](#b9--the-ai-hovers-next-to-el-dorado-instead-of-arriving) The AI hovers next to El Dorado instead of arriving (**PARTIAL**), [B16](#b16--look-ahead-copies-of-the-game-shared-the-card-table-so-the-planner-judged-the-wrong-cards-after-a-buy) Look-ahead copies of the game shared the card table, so the planner judged the wrong cards after a buy (**PARTIAL**), [B20](#b20--the-bot-counted-an-arrivals-place-as-final-too-early-with-an-incomplete-tie-break) The bot counted an arrival's place as final too early, with an incomplete tie-break (**PARTIAL**)

### `AS-hit-test` — 5 bugs (NOT FIXED 3, PARTIAL 1, ROOT 1)

[A11](#a11--end-turn-you-can-still-afford-warning-reuses-the-big-button-slot-extra-clicks-tap-through) End-turn "you can still afford…" warning reuses the big button slot (extra clicks, tap-through) (**NOT FIXED**), [F8](#f8--stopping-a-card-with-strength-left-needs-a-hard-to-find-done) Stopping a card with strength left needs a hard-to-find Done (**PARTIAL**), [P3](#p3--explorer-figures-swallow-taps-on-the-space-above-them) Explorer figures swallow taps on the space above them (**ROOT**), [P11](#p11--turn-buttons-move-and-change-meaning-under-the-finger-undo-jumps-end-turnundo-vanish-in-buy-mode-double-taps-pass-confirmations) Turn buttons move and change meaning under the finger (Undo jumps; End turn/Undo vanish in buy mode; double taps pass confirmations) (**NOT FIXED**), [P29](#p29--market-hover-preview-spills-over-menu-its-badge-is-clipped-the-all-cards-x-sits-over-menu) Market hover preview spills over Menu; its badge is clipped; the All cards X sits over Menu (**NOT FIXED**)

### `AS-input-never-dropped` — 5 bugs (PARTIAL 2, ROOT 2, NOT FIXED 1)

[A16](#a16--couldnt-drag-cards-onto-rubble--base-camps) Couldn't drag cards onto rubble / base camps (**PARTIAL**), [E16](#e16--a-purchase-could-get-stuck-after-playing-a-travel-log-or-scientist) A purchase could get stuck after playing a Travel Log or Scientist (**ROOT**), [E21](#e21--a-silently-dead-online-connection-wasnt-noticed-moves-went-nowhere) A silently dead online connection wasn't noticed; moves went nowhere (**PARTIAL**), [P3](#p3--explorer-figures-swallow-taps-on-the-space-above-them) Explorer figures swallow taps on the space above them (**ROOT**), [P26](#p26--animation-gates-input-and-the-ai-a-second-card-is-ignored-while-an-explorer-walks-local-ais-freeze-in-a-hidden-tab) Animation gates input and the AI: a second card is ignored while an explorer walks; local AIs freeze in a hidden tab (**NOT FIXED**)

### `AS-events-explain-change` — 5 bugs (PARTIAL 3, ROOT 1, NOT FIXED 1)

[C8](#c8--other-players-turns-were-invisible-cards-played-purchases-and-the-journal-was-hidden) Other players' turns were invisible (cards played, purchases) and the journal was hidden (**ROOT**), [E29](#e29--false-invariant-marketrectof-asserted-every-card-type-still-has-a-stack) False invariant: `marketRectOf` asserted every card type still has a stack (**PARTIAL**), [E30](#e30--false-invariant-animatemove-the-explorer-is-drawn--game-restored-toasts) False invariant `animateMove: the explorer is drawn` → "game restored" toasts (**PARTIAL**), [P6](#p6--online-assertion-animatemove-the-explorer-is-drawn-at-game-start) Online assertion 'animateMove: the explorer is drawn' at game start (**PARTIAL**), [P31](#p31--undo-snaps-the-explorer-back-with-no-animation) Undo snaps the explorer back with no animation (**NOT FIXED**)

### `AS-record-replays` — 4 bugs (PARTIAL 2, ROOT 2)

[A33](#a33--illegal-ai-or-logged-actions-silently-turned-into-end-turn) Illegal AI or logged actions silently turned into "end turn" (**PARTIAL**), [E13](#e13--ai-decisions-and-ai-tools-were-not-reproducible-from-a-seed) AI decisions and AI tools were not reproducible from a seed (**ROOT**), [E31](#e31--replays-silently-patched-moves-that-didnt-fit-the-game) Replays silently patched moves that didn't fit the game (**ROOT**), [F33](#f33--a-v1-training-replay-listed-on-the-live-site-but-unplayable) A v1 training replay listed on the live site but unplayable (**PARTIAL**)

### `AS-provenance` — 4 bugs (NOT FIXED 2, HACK 1, PARTIAL 1)

[C7](#c7--ai-ratings-did-not-reflect-ai-strength-all-1200-then-stale-after-every-network-change) AI ratings did not reflect AI strength (all 1200, then stale after every network change) (**NOT FIXED**), [C12](#c12--the-model-ladder-counted-one-network-as-two-players) The model ladder counted one network as two players (**HACK**), [E15](#e15--ai-ratings-shipped-as-a-guess-and-stale-for-the-shipped-network) AI ratings shipped as a guess, and stale for the shipped network (**NOT FIXED**), [H3](#h3--has-the-model-regressed-couldnt-be-answered-every-network-comparison-predated-the-rules-fix) "Has the model regressed?" couldn't be answered: every network comparison predated the rules fix (**PARTIAL**)

### `AS-server-reply` — 4 bugs (PARTIAL 3, NOT FIXED 1)

[E21](#e21--a-silently-dead-online-connection-wasnt-noticed-moves-went-nowhere) A silently dead online connection wasn't noticed; moves went nowhere (**PARTIAL**), [F13](#f13--resigning-online-takes-five-seconds) Resigning online takes five seconds (**PARTIAL**), [P1](#p1--online-resign-takes-127-s) Online resign takes 1.2–7 s (**PARTIAL**), [P19](#p19--closing-a-socket-takes-10-s-silent-drops-detected-after-40-s) Closing a socket takes 10 s; silent drops detected after 40 s (**NOT FIXED**)

### `AS-model-contract` — 3 bugs (ROOT 1, PARTIAL 1, NOT FIXED 1)

[B11](#b11--the-ai-buys-first-and-gives-up-a-free-move-its-values-jump-between-consecutive-decisions-of-one-turn) The AI buys first and gives up a free move; its values jump between consecutive decisions of one turn (**ROOT**), [H1](#h1--replay-every-option-list-rated-end-the-turn-keep-everything-close-to-real-moves) Replay "every option" list rated "end the turn, keep everything" close to real moves (**PARTIAL**), [H2](#h2--replay-winning-chances-are-not-winning-chances) Replay "winning chances" are not winning chances (**NOT FIXED**)

### `AS-deploy-landed` — 2 bugs (PARTIAL 1, ROOT 1)

[A1](#a1--pushes-to-main-silently-stopped-deploying-workers-builds-disconnected) Pushes to main silently stopped deploying (Workers Builds disconnected) (**PARTIAL**), [A22](#a22--deploy-broken-wip-bot-code-reassigned-a-const-cloudflares-bundler-refused-it) Deploy broken: WIP bot code reassigned a `const`, Cloudflare's bundler refused it (**ROOT**)

### `AS-visual-continuity` — 2 bugs (ROOT 1, PARTIAL 1)

[B7](#b7--board-colours-change-while-dragging) Board colours change while dragging (**ROOT**), [F3](#f3--a-card-blinks-as-it-lands-in-the-history) A card blinks as it lands in the history (**PARTIAL**)

### `AS-resource-budget` — 2 bugs (PARTIAL 2)

[C13](#c13--training-stopped-when-the-disk-filled-with-28-gb-of-old-self-play-batches) Training stopped when the disk filled with 28 GB of old self-play batches (**PARTIAL**), [C17](#c17--the-engine-was-slow-in-self-play-the-engine-should-not-be-slow) The engine was slow in self-play ("the engine should not be slow") (**PARTIAL**)

### `AS-alignment` — 2 bugs (PARTIAL 1, NOT FIXED 1)

[D8](#d8--misaligned-top-bar-promptmarket-and-menu-controls-design-review-a2-a3-a4-a7-a8-a19) Misaligned top bar, prompt/market and menu controls (design review A2, A3, A4, A7, A8, A19) (**PARTIAL**), [D10](#d10--design-review-defects-found-and-left-open-a1-a9a18-a20a22-a24) Design-review defects found and left open (A1, A9–A18, A20–A22, A24) (**NOT FIXED**)

### `AS-redaction` — 2 bugs (ROOT 1, PARTIAL 1)

[D24](#d24--the-online-shuffle-secret-came-from-mathrandom-next-to-a-published-value-critique-b4) The online shuffle secret came from Math.random next to a published value (critique B4) (**ROOT**), [F22](#f22--discarded-cards-missing-from-the-history) Discarded cards missing from the history (**PARTIAL**)

### `AS-hidden-no-box` — 1 bugs (NOT FIXED 1)

[P34](#p34--stray-182-px-dash-in-the-online-prompt-during-ai-turns) Stray 18×2 px dash in the online prompt during AI turns (**NOT FIXED**)

### `AS-storage-owned` — 1 bugs (NOT FIXED 1)

[P35](#p35--orphaned-localstorage-from-older-versions-is-never-cleaned) Orphaned localStorage from older versions is never cleaned (**NOT FIXED**)

## Still needing the real fix

Every bug whose final state is HACK, PARTIAL or NOT FIXED, with its design decision.

| Bug | State | Sequence | Design decision | Ratchet |
|---|---|---|---|---|
| [A12](#a12--action-card-text-ran-into-the-card-footer) Action-card text ran into the card footer | **HACK** | HACK | `DD-content-sized-layout` | nothing |
| [A28](#a28--training-progress-page-stopped-updating) Training progress page stopped updating | **HACK** | HACK | `DD-silent-failure` | nothing |
| [B13](#b13--the-zoom-bake-could-fire-in-the-middle-of-a-glide-or-a-new-grab) The zoom bake could fire in the middle of a glide or a new grab | **HACK** | HACK | `DD-imperative-sequencing` | test |
| [B21](#b21--the-deep-search-test-hung) The deep-search test hung | **HACK** | HACK | `DD-work-in-reply-path` | nothing |
| [C9](#c9--pop-up-windows-rules-and-others-were-wider-than-the-screen-at-390-px) Pop-up windows (Rules and others) were wider than the screen at 390 px | **HACK** | HACK | `DD-per-element-patch` | nothing |
| [C10](#c10--the-opponents-recap-made-the-prompt-box-content-sized-it-collides-with-the-turn-buttons-and-changes-size-as-steps-arrive) The opponents' recap made the prompt box content-sized: it collides with the turn buttons and changes size as steps arrive | **HACK** | HACK → HACK | `DD-content-sized-layout` `DD-float-over` | test |
| [C12](#c12--the-model-ladder-counted-one-network-as-two-players) The model ladder counted one network as two players | **HACK** | HACK | `DD-multi-source-truth` | nothing |
| [C18](#c18--the-weight-cache-went-stale-when-a-tool-changed-weights-in-place) The weight cache went stale when a tool changed weights in place | **HACK** | HACK | `DD-multi-source-truth` | nothing |
| [D13](#d13--wheel-zoom-latency-over-budget-once-the-real-fonts-loaded-shipped-failing-then-the-test-was-loosened) Wheel-zoom latency over budget once the real fonts loaded; shipped failing, then the test was loosened | **HACK** | HACK | `DD-process` `DD-untested-real-setup` | nothing |
| [E6](#e6--a-finished-games-results-stayed-on-screen-under-a-new-game) A finished game's results stayed on screen under a new game | **HACK** | HACK | `DD-imperative-sequencing` `DD-ui-flags` | nothing |
| [E8](#e8--the-explorer-no-longer-hopped-it-slidteleported-fast-on-the-phone) The explorer no longer hopped: it slid/teleported, fast, on the phone | **HACK** | PARTIAL → HACK | `DD-imperative-sequencing` `DD-untested-real-setup` | test |
| [E11](#e11--performance-budgets-loosened-when-they-failed) Performance budgets loosened when they failed | **HACK** | HACK | `DD-process` | nothing |
| [P10](#p10--prompt-pill-changes-size-on-every-state) Prompt pill changes size on every state | **HACK** | HACK | `DD-content-sized-layout` | nothing |
| [A1](#a1--pushes-to-main-silently-stopped-deploying-workers-builds-disconnected) Pushes to main silently stopped deploying (Workers Builds disconnected) | **PARTIAL** | PARTIAL | `DD-silent-failure` `DD-untested-real-setup` | nothing |
| [A2](#a2--boards-were-made-up-random-routes-reconstructed-tiles-blockades-laid-in-number-order) Boards were made up: random routes, reconstructed tiles, blockades laid in number order | **PARTIAL** | PARTIAL | `DD-unverified-data` | test |
| [A5](#a5--online-screens-live-room-list-didnt-connect-right-after-signing-in) Online screen's live room list didn't connect right after signing in | **PARTIAL** | PARTIAL | `DD-imperative-sequencing` | nothing |
| [A6](#a6--first-expedition-course-fitted-to-a-blurry-rulebook-scan) First Expedition course fitted to a blurry rulebook scan | **PARTIAL** | PARTIAL | `DD-process` `DD-unverified-data` | nothing |
| [A9](#a9--tiles-i-and-n-transcribed-one-strength-short) Tiles I and N transcribed one strength short | **PARTIAL** | PARTIAL | `DD-unverified-data` | nothing |
| [A13](#a13--affordable-market-cards-pulsed-all-the-time) Affordable market cards pulsed all the time | **PARTIAL** | ROOT → PARTIAL | `DD-no-spec` | nothing |
| [A15](#a15--market-floated-over-the-game-took-the-top-of-the-board-covered-end-turn-then-covered-the-replay-panel) Market floated over the game: took the top of the board, covered End turn, then covered the replay panel | **PARTIAL** | HACK → HACK → PARTIAL | `DD-float-over` `DD-per-element-patch` | test |
| [A16](#a16--couldnt-drag-cards-onto-rubble--base-camps) Couldn't drag cards onto rubble / base camps | **PARTIAL** | PARTIAL → PARTIAL | `DD-rules-outside-engine` `DD-two-mechanisms` | nothing |
| [A19](#a19--sound-every-failure-swallowed-very-first-tap-silent) Sound: every failure swallowed; very first tap silent | **PARTIAL** | PARTIAL | `DD-silent-failure` | nothing |
| [A20](#a20--explorer-miniatures-chibi-figures-per-seat-colour-only-on-clothes) Explorer miniatures: chibi figures per seat, colour only on clothes | **PARTIAL** | ROOT → PARTIAL | `DD-process` | nothing |
| [A24](#a24--buying-was-click-only-annoying-the-drag-to-buy-that-fixed-it-runs-on-flags-and-timers) Buying was click-only (annoying); the drag-to-buy that fixed it runs on flags and timers | **PARTIAL** | PARTIAL | `DD-imperative-sequencing` `DD-two-mechanisms` | nothing |
| [A26](#a26--training-fundamentally-wrong-the-net-learned-the-heuristics-opinion-and-scored-chance-with-one-sample) Training "fundamentally wrong": the net learned the heuristic's opinion and scored chance with one sample | **PARTIAL** | PARTIAL | `DD-no-spec` | nothing |
| [A27](#a27--training-included-2-player-games) Training included 2-player games | **PARTIAL** | PARTIAL | `DD-no-spec` `DD-process` | nothing |
| [A29](#a29--ai-games-stall-hit-the-25-round-cap-explorer-stranded-before-el-dorado) AI games stall: hit the 25-round cap (explorer stranded before El Dorado) | **PARTIAL** | NOT FIXED → HACK → PARTIAL → PARTIAL | `DD-rules-outside-engine` `DD-two-mechanisms` | test |
| [A30](#a30--improve-the-heuristic-done-as-cpu-heavy-sweeps-competing-with-training) "Improve the heuristic" done as CPU-heavy sweeps competing with training | **PARTIAL** | ROOT → PARTIAL | `DD-process` | nothing |
| [A31](#a31--bot-valued-an-arrived-players-place-wrongly-twice) Bot valued an arrived player's place wrongly (twice) | **PARTIAL** | HACK → PARTIAL | `DD-rules-outside-engine` | nothing |
| [A32](#a32--game-results-in-trainingbenchmarks-a-capped-non-arrival-could-win-then-the-last-racer-counted-as-a-capped-loss) Game results in training/benchmarks: a capped non-arrival could "win", then the last racer counted as a capped loss | **PARTIAL** | PARTIAL → PARTIAL | `DD-multi-source-truth` | nothing |
| [A33](#a33--illegal-ai-or-logged-actions-silently-turned-into-end-turn) Illegal AI or logged actions silently turned into "end turn" | **PARTIAL** | PARTIAL | `DD-silent-failure` | assertion |
| [A34](#a34--a-result-attributed-to-seat-effects-without-evidence) A result attributed to "seat effects" without evidence | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [B1](#b1--replay-controls-vanish-at-some-screen-sizes-layout-bugs-keep-coming-back) Replay controls vanish at some screen sizes; layout bugs keep coming back | **PARTIAL** | PARTIAL | `DD-content-sized-layout` `DD-float-over` | test |
| [B2](#b2--player-chips-clipped-the-third-player-hidden-on-phones-and-under-market-in-replays) Player chips clipped: the third player hidden on phones and under "Market" in replays | **PARTIAL** | PARTIAL | `DD-content-sized-layout` `DD-per-element-patch` | nothing |
| [B3](#b3--runtime-css-variable-and-has-on-app-restyle-the-whole-board) Runtime CSS variable and `:has()` on `#app` restyle the whole board | **PARTIAL** | PARTIAL | `DD-board-inherits-ui-state` | test |
| [B4](#b4--process-regression-hunting-and-pausing-training-instead-of-profiling-what-the-owner-felt) Process: regression-hunting and pausing training instead of profiling what the owner felt | **PARTIAL** | PARTIAL | `DD-process` `DD-untested-real-setup` | nothing |
| [B8](#b8--process-papering-over-bugs-and-building-workarounds-instead-of-the-well-trodden-way) Process: papering over bugs and building workarounds instead of the well-trodden way | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [B9](#b9--the-ai-hovers-next-to-el-dorado-instead-of-arriving) The AI hovers next to El Dorado instead of arriving | **PARTIAL** | PARTIAL | `DD-multi-source-truth` `DD-two-mechanisms` | nothing |
| [B10](#b10--process-long-runs-and-experiments-with-no-visible-progress) Process: long runs and experiments with no visible progress | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [B12](#b12--process-the-background-agent-and-the-main-agent-shared-one-working-tree) Process: the background agent and the main agent shared one working tree | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [B15](#b15--search-training-looked-like-it-was-getting-worse-the-progress-test-measured-search-not-training) Search training looked like it was getting worse: the progress test measured search, not training | **PARTIAL** | PARTIAL → ROOT → PARTIAL | `DD-no-spec` | nothing |
| [B16](#b16--look-ahead-copies-of-the-game-shared-the-card-table-so-the-planner-judged-the-wrong-cards-after-a-buy) Look-ahead copies of the game shared the card table, so the planner judged the wrong cards after a buy | **PARTIAL** | PARTIAL | `DD-global-state` | nothing |
| [B17](#b17--four-way-test-seats-did-not-rotate-evenly-across-workers) Four-way test seats did not rotate evenly across workers | **PARTIAL** | PARTIAL | `DD-multi-source-truth` | nothing |
| [B19](#b19--el-dorados-finishing-spaces-always-drawn-gold-even-when-they-need-water) El Dorado's finishing spaces always drawn gold, even when they need water | **PARTIAL** | PARTIAL | `DD-multi-source-truth` `DD-per-element-patch` | nothing |
| [B20](#b20--the-bot-counted-an-arrivals-place-as-final-too-early-with-an-incomplete-tie-break) The bot counted an arrival's place as final too early, with an incomplete tie-break | **PARTIAL** | PARTIAL | `DD-multi-source-truth` `DD-rules-outside-engine` | nothing |
| [C2](#c2--progress-test-did-not-measure-progress-the-heuristic-benchmark) Progress test did not measure progress (the heuristic benchmark) | **PARTIAL** | PARTIAL | `DD-no-spec` | nothing |
| [C3](#c3--an-illegal-ai-action-was-silently-replaced-by-end-turn-the-test-that-checked-it-could-not-fail) An illegal AI action was silently replaced by "end turn"; the test that checked it could not fail | **PARTIAL** | ROOT → HACK → PARTIAL | `DD-silent-failure` | assertion |
| [C5](#c5--online-ais-played-the-rest-of-the-game-in-one-alarm-a-resigning-players-answer-took-57-s) Online AIs played the rest of the game in one alarm; a resigning player's answer took 5–7 s | **PARTIAL** | ROOT → PARTIAL | `DD-untested-real-setup` `DD-work-in-reply-path` | nothing |
| [C6](#c6--every-new-worker-instance-ran-25-database-queries-before-answering-3-s-per-api-request) Every new Worker instance ran ~25 database queries before answering (≈3 s per /api request) | **PARTIAL** | PARTIAL | `DD-work-in-reply-path` | nothing |
| [C11](#c11--two-player-games-the-network-ais-mostly-never-reached-el-dorado) Two-player games: the network AIs mostly never reached El Dorado | **PARTIAL** | HACK → PARTIAL | `DD-silent-failure` | nothing |
| [C13](#c13--training-stopped-when-the-disk-filled-with-28-gb-of-old-self-play-batches) Training stopped when the disk filled with 28 GB of old self-play batches | **PARTIAL** | PARTIAL | `DD-no-budget` | nothing |
| [C14](#c14--the-owners-question-waited-behind-work-before-you-do-this-can-you-prioritize-giving-me-a-report) The owner's question waited behind work ("Before you do this, can you prioritize giving me a report?") | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [C16](#c16--boards-i-and-n-were-wrong-on-first-expedition-for-a-day-and-knowingly-left-wrong-for-an-hour) Boards I and N were wrong on First Expedition for a day, and knowingly left wrong for an hour | **PARTIAL** | PARTIAL | `DD-unverified-data` | nothing |
| [C17](#c17--the-engine-was-slow-in-self-play-the-engine-should-not-be-slow) The engine was slow in self-play ("the engine should not be slow") | **PARTIAL** | PARTIAL | `DD-no-budget` | nothing |
| [C19](#c19--ais-stuck-forever-next-to-el-dorado-or-on-a-way-their-cards-cant-take) AIs stuck forever next to El Dorado or on a way their cards can't take | **PARTIAL** | HACK → HACK → PARTIAL | `DD-per-element-patch` | test |
| [C20](#c20--dead-hidden-units-in-the-network) Dead hidden units in the network | **PARTIAL** | HACK → HACK → PARTIAL | `DD-silent-failure` | assertion |
| [D1](#d1--the-owners-questions-wait-behind-claudes-work) The owner's questions wait behind Claude's work | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [D2](#d2--single-use-cards-played-for-movement-came-back-after-the-reshuffle) Single-use cards played for movement came back after the reshuffle | **PARTIAL** | PARTIAL | `DD-per-element-patch` | test |
| [D4](#d4--training-iterations-far-slower-than-claude-said) Training iterations far slower than Claude said | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [D5](#d5--training-thrash-started-from-scratch-against-the-owners-wish-then-a-broken-warm-start-and-too-many-changes-at-once) Training thrash: started from scratch against the owner's wish, then a broken warm start and too many changes at once | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [D6](#d6--cut-off-games-scored-by-the-networks-own-guess-against-the-owners-specification) Cut-off games scored by the network's own guess, against the owner's specification | **PARTIAL** | PARTIAL | `DD-compat-path` `DD-process` | nothing |
| [D8](#d8--misaligned-top-bar-promptmarket-and-menu-controls-design-review-a2-a3-a4-a7-a8-a19) Misaligned top bar, prompt/market and menu controls (design review A2, A3, A4, A7, A8, A19) | **PARTIAL** | PARTIAL | `DD-content-sized-layout` | nothing |
| [D11](#d11--training-runs-crashed-at-start-a-comment-swallowed-the-setup-line) Training runs crashed at start: a comment swallowed the setup line | **PARTIAL** | PARTIAL | `DD-dense-lines` `DD-process` | nothing |
| [D12](#d12--the-site-loads-slowly-one-313-kb-page-for-a-tiny-start-screen) The site loads slowly: one 313 KB page for a tiny start screen | **PARTIAL** | HACK → ROOT → PARTIAL | `DD-no-budget` `DD-untested-real-setup` | nothing |
| [D14](#d14--ai-seats-offered-in-setups-the-ai-was-never-trained-for-2-player-games-other-courses) AI seats offered in setups the AI was never trained for (2-player games, other courses) | **PARTIAL** | ROOT → PARTIAL | `DD-no-spec` `DD-silent-failure` | nothing |
| [D17](#d17--player-chips-showed-a-total-blockade-value-that-isnt-the-tie-break) Player chips showed a "total blockade value" that isn't the tie-break | **PARTIAL** | PARTIAL | `DD-no-spec` `DD-rules-outside-engine` | nothing |
| [D18](#d18--the-design-review-agent-died-with-a-worker-restart-and-its-work-was-lost) The design-review agent died with a worker restart and its work was lost | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [D19](#d19--a-white-box-behind-the-google-sign-in-button) A white box behind the Google sign-in button | **PARTIAL** | PARTIAL | `DD-per-element-patch` `DD-untested-real-setup` | nothing |
| [D20](#d20--the-el-dorado-label-sits-on-a-finishing-space) The "El Dorado" label sits on a finishing space | **PARTIAL** | PARTIAL | `DD-per-element-patch` | nothing |
| [D22](#d22--a-player-could-send-any-property-name-as-a-market-index-critique-b1) A player could send any property name as a market index (critique B1) | **PARTIAL** | HACK → PARTIAL | `DD-per-element-patch` | test |
| [D27](#d27--double-clicking-add-ai-could-over-fill-a-room-critique-b3) Double-clicking "Add AI" could over-fill a room (critique B3) | **PARTIAL** | PARTIAL | `DD-imperative-sequencing` | nothing |
| [E1](#e1--start-screen-text-swapped-fonts-and-looked-different-on-a-second-visit) Start-screen text swapped fonts, and looked different on a second visit | **PARTIAL** | PARTIAL | `DD-content-sized-layout` `DD-server-first` | nothing |
| [E2](#e2--the-site-took-a-couple-of-seconds-to-load-on-the-phone) The site took "a couple of seconds" to load on the phone | **PARTIAL** | PARTIAL | `DD-server-first` | nothing |
| [E3](#e3--board-starts-zoomed-in-then-zooms-itself-out-refit-a-second-after-start) Board "starts zoomed in, then zooms itself out"; refit a second after Start | **PARTIAL** | HACK → PARTIAL | `DD-imperative-sequencing` `DD-server-first` | test |
| [E5](#e5--sharp-delay-when-clicking-and-dragging-on-the-phone) Sharp delay when clicking and dragging on the phone | **PARTIAL** | PARTIAL | `DD-board-inherits-ui-state` `DD-per-element-patch` `DD-whole-rebuild` | test |
| [E7](#e7--jack-of-all-trades-popped-in-late-in-all-cards) Jack of All Trades popped in late in "All cards" | **PARTIAL** | PARTIAL | `DD-whole-rebuild` | nothing |
| [E9](#e9--ui-regressions-kept-shipping-a-lot-of-jank-and-a-lot-of-regressions) UI regressions kept shipping ("a lot of jank and a lot of regressions") | **PARTIAL** | PARTIAL | `DD-untested-real-setup` `DD-whole-rebuild` | test |
| [E10](#e10--the-test-suite-was-too-slow-for-a-quick-turnaround) The test suite was too slow for a quick turnaround | **PARTIAL** | PARTIAL | `DD-no-budget` `DD-process` | nothing |
| [E17](#e17--the-turn-went-on-after-the-last-explorer-reached-el-dorado) The turn went on after the last explorer reached El Dorado | **PARTIAL** | PARTIAL | `DD-no-spec` | test |
| [E18](#e18--page-tests-failed-under-machine-load-fixed-pauses-deal-dependent-checks) Page tests failed under machine load (fixed pauses, deal-dependent checks) | **PARTIAL** | PARTIAL | `DD-imperative-sequencing` | nothing |
| [E19](#e19--menu-workflows-led-to-broken-states-online-game-dropped-seated-in-a-room-youd-left) Menu workflows led to broken states (online game dropped, seated in a room you'd left) | **PARTIAL** | PARTIAL | `DD-ui-flags` | test |
| [E21](#e21--a-silently-dead-online-connection-wasnt-noticed-moves-went-nowhere) A silently dead online connection wasn't noticed; moves went nowhere | **PARTIAL** | PARTIAL | `DD-silent-failure` | test |
| [E22](#e22--player-chips-cut-in-half-when-the-game-area-was-narrow) Player chips cut in half when the game area was narrow | **PARTIAL** | PARTIAL | `DD-content-sized-layout` | nothing |
| [E23](#e23--an-ais-illegal-choice-silently-ended-its-turn) An AI's illegal choice silently ended its turn | **PARTIAL** | PARTIAL | `DD-silent-failure` | assertion |
| [E25](#e25--buildmjs-couldnt-export-an-engine-name-that-objectprototype-also-has) build.mjs couldn't export an engine name that `Object.prototype` also has | **PARTIAL** | PARTIAL | `DD-global-state` | nothing |
| [E28](#e28--catches-too-wide-loadreplayid-hid-display-bugs-the-fullscreen-rejection-went-unhandled) Catches too wide: loadReplayId hid display bugs; the fullscreen rejection went unhandled | **PARTIAL** | PARTIAL | `DD-silent-failure` | nothing |
| [E29](#e29--false-invariant-marketrectof-asserted-every-card-type-still-has-a-stack) False invariant: `marketRectOf` asserted every card type still has a stack | **PARTIAL** | PARTIAL | `DD-animation-coupled` | test |
| [E30](#e30--false-invariant-animatemove-the-explorer-is-drawn--game-restored-toasts) False invariant `animateMove: the explorer is drawn` → "game restored" toasts | **PARTIAL** | PARTIAL | `DD-animation-coupled` `DD-untested-real-setup` | test |
| [E32](#e32--a-multi-course-network-would-have-made-humboldt-silently-play-as-the-route-planner) A multi-course network would have made Humboldt silently play as the route planner | **PARTIAL** | PARTIAL | `DD-silent-failure` | nothing |
| [E33](#e33--history-panel-a-resize-loop-and-a-content-sized-panel) History panel: a resize loop, and a content-sized panel | **PARTIAL** | PARTIAL → ROOT → PARTIAL | `DD-content-sized-layout` `DD-float-over` | test |
| [E34](#e34--design-agents-ran-on-the-main-thread-so-the-owner-kept-stopping-them) Design agents ran on the main thread, so the owner kept stopping them | **PARTIAL** | NOT FIXED → PARTIAL | `DD-process` | nothing |
| [H1](#h1--replay-every-option-list-rated-end-the-turn-keep-everything-close-to-real-moves) Replay "every option" list rated "end the turn, keep everything" close to real moves | **PARTIAL** | PARTIAL | `DD-no-spec` `DD-unvalidated-model` | nothing |
| [H3](#h3--has-the-model-regressed-couldnt-be-answered-every-network-comparison-predated-the-rules-fix) "Has the model regressed?" couldn't be answered: every network comparison predated the rules fix | **PARTIAL** | PARTIAL | `DD-multi-source-truth` `DD-process` | nothing |
| [H4](#h4--owners-status-questions-went-unanswered-or-got-a-wrong-answer-a-request-waited-six-hours) Owner's status questions went unanswered or got a wrong answer; a request waited six hours | **PARTIAL** | PARTIAL | `DD-process` `DD-silent-failure` | nothing |
| [F2](#f2--a-turn-in-the-history-wraps-onto-two-lines-captions-crowd-the-cards) A turn in the history wraps onto two lines (captions crowd the cards) | **PARTIAL** | HACK → ROOT → PARTIAL | `DD-content-sized-layout` | nothing |
| [F3](#f3--a-card-blinks-as-it-lands-in-the-history) A card blinks as it lands in the history | **PARTIAL** | PARTIAL | `DD-animation-coupled` | nothing |
| [F6](#f6--resigning-doesnt-let-you-leave-rejoin-puts-you-back-in-the-game) Resigning doesn't let you leave; Rejoin puts you back in the game | **PARTIAL** | PARTIAL | `DD-multi-source-truth` | test |
| [F7](#f7--create-room-takes-a-couple-of-seconds) Create room takes a couple of seconds | **PARTIAL** | PARTIAL | `DD-work-in-reply-path` | nothing |
| [F8](#f8--stopping-a-card-with-strength-left-needs-a-hard-to-find-done) Stopping a card with strength left needs a hard-to-find Done | **PARTIAL** | PARTIAL | `DD-no-spec` | nothing |
| [F11](#f11--travel-log--scientist-removing-cards-isnt-visibly-asked) Travel Log / Scientist: removing cards isn't visibly asked | **PARTIAL** | PARTIAL | `DD-no-spec` | test |
| [F12](#f12--room-lobby-waits-on-the-server-to-show-the-ai-options) Room lobby waits on the server to show the AI options | **PARTIAL** | PARTIAL | `DD-server-first` | nothing |
| [F13](#f13--resigning-online-takes-five-seconds) Resigning online takes five seconds | **PARTIAL** | HACK → PARTIAL | `DD-work-in-reply-path` | nothing |
| [F14](#f14--you-always-sit-first) You always sit first | **PARTIAL** | PARTIAL | `DD-rules-outside-engine` | nothing |
| [F15](#f15--history-center-mode-goes-blank-on-your-own-turn) History "center" mode goes blank on your own turn | **PARTIAL** | PARTIAL | `DD-multi-source-truth` | nothing |
| [F16](#f16--room-lobby-line-swallowed-by-a-comment-full-room-still-offers-ais) Room lobby line swallowed by a comment (full room still offers AIs) | **PARTIAL** | PARTIAL | `DD-dense-lines` | test |
| [F17](#f17--prompt-box-and-history-row-grow-and-shrink) Prompt box and history row grow and shrink | **PARTIAL** | PARTIAL | `DD-content-sized-layout` | nothing |
| [F18](#f18--whose-turn-heading-pops-in-at-the-end-of-the-turn) "Whose turn" heading pops in at the end of the turn | **PARTIAL** | PARTIAL | `DD-content-sized-layout` | test |
| [F22](#f22--discarded-cards-missing-from-the-history) Discarded cards missing from the history | **PARTIAL** | PARTIAL | `DD-two-mechanisms` | test |
| [F23](#f23--useless-information-across-the-ui-audit) Useless information across the UI (audit) | **PARTIAL** | PARTIAL | `DD-no-spec` | nothing |
| [F25](#f25--process-measured-in-our-setup-dismissed-the-owners-the-gaslighting) Process: measured in our setup, dismissed the owner's (the "gaslighting") | **PARTIAL** | PARTIAL | `DD-process` `DD-untested-real-setup` | nothing |
| [F26](#f26--process-shipped-a-change-the-owner-had-said-not-to-ship) Process: shipped a change the owner had said not to ship | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [F27](#f27--process-instructions-misread-or-ignored) Process: instructions misread or ignored | **PARTIAL** | PARTIAL | `DD-process` | nothing |
| [F28](#f28--animatemove-the-explorer-is-drawn-at-the-start-of-online-games) "animateMove: the explorer is drawn" at the start of online games | **PARTIAL** | PARTIAL | `DD-animation-coupled` `DD-imperative-sequencing` | test |
| [F30](#f30--ai-games-stall-on-the-witchs-cauldron-course) AI games stall on the Witch's Cauldron course | **PARTIAL** | HACK → HACK → PARTIAL | `DD-per-element-patch` | nothing |
| [F32](#f32--refactors-left-compatibility-paths-tech-debt) Refactors left compatibility paths (tech debt) | **PARTIAL** | PARTIAL | `DD-compat-path` | assertion |
| [F33](#f33--a-v1-training-replay-listed-on-the-live-site-but-unplayable) A v1 training replay listed on the live site but unplayable | **PARTIAL** | PARTIAL | `DD-compat-path` | nothing |
| [P1](#p1--online-resign-takes-127-s) Online resign takes 1.2–7 s | **PARTIAL** | HACK → PARTIAL | `DD-untested-real-setup` `DD-work-in-reply-path` | nothing |
| [P6](#p6--online-assertion-animatemove-the-explorer-is-drawn-at-game-start) Online assertion 'animateMove: the explorer is drawn' at game start | **PARTIAL** | PARTIAL | `DD-animation-coupled` `DD-imperative-sequencing` | test |
| [P16](#p16--create-room-16-s-add-ai-190-ms-each-leaderboard-and-shared-replays-1-s) Create room 1.6 s; Add AI ~190 ms each; leaderboard and shared replays ~1 s | **PARTIAL** | PARTIAL | `DD-server-first` `DD-work-in-reply-path` | nothing |
| [P18](#p18--waiting-for-ais-59-s-a-round-each-ai-turn-under-a-centre-screen-banner) Waiting for AIs: ~5–9 s a round, each AI turn under a centre-screen banner | **PARTIAL** | PARTIAL | `DD-float-over` `DD-no-spec` | nothing |
| [A3](#a3--blockade-costs-are-a-guess-111122) Blockade costs are a guess (1,1,1,1,2,2) | **NOT FIXED** | NOT FIXED | `DD-unverified-data` | nothing |
| [A4](#a4--rulebook-tie-break-whoever-reached-el-dorado-first-not-implemented) Rulebook tie-break "whoever reached El Dorado first" not implemented | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [A11](#a11--end-turn-you-can-still-afford-warning-reuses-the-big-button-slot-extra-clicks-tap-through) End-turn "you can still afford…" warning reuses the big button slot (extra clicks, tap-through) | **NOT FIXED** | NOT FIXED | `DD-content-sized-layout` `DD-ui-flags` | nothing |
| [A14](#a14--all-cards-overlay-state-uiallopen-leaks-across-modes-and-games) "All cards" overlay state (`UI.allOpen`) leaks across modes and games | **NOT FIXED** | NOT FIXED | `DD-ui-flags` | nothing |
| [A18](#a18--market-hover-preview-enlarges-over-the-top-bar) Market hover preview enlarges over the top bar | **NOT FIXED** | NOT FIXED | `DD-float-over` | nothing |
| [A23](#a23--training-exploration-left-mechanisms-unexplored-keeptrashpay-choices-transmitter-not-buying) Training exploration left mechanisms unexplored (keep/trash/pay choices, Transmitter, not buying) | **NOT FIXED** | PARTIAL → HACK → NOT FIXED | `DD-per-element-patch` `DD-process` `DD-rules-outside-engine` | nothing |
| [A25](#a25--a-card-spent-on-a-purchase-leaves-a-hole-in-the-hand) A card spent on a purchase leaves a hole in the hand | **NOT FIXED** | NOT FIXED | `DD-float-over` `DD-per-element-patch` | nothing |
| [B6](#b6--grab-start-stalls-the-grabbing-cursor-restyles-every-board-element) Grab start stalls: the grabbing cursor restyles every board element | **NOT FIXED** | HACK → HACK → NOT FIXED | `DD-board-inherits-ui-state` `DD-per-element-patch` | nothing |
| [C1](#c1--self-play-exploration-expensive-cards-almost-never-tried-the-exploration-we-had-was-a-hack) Self-play exploration: expensive cards almost never tried; the exploration we had was a hack | **NOT FIXED** | PARTIAL → NOT FIXED | `DD-per-element-patch` | nothing |
| [C4](#c4--local-ais-think-on-the-pages-main-thread-frame-rate-never-measured-during-ai-turns) Local AIs think on the page's main thread; frame rate never measured during AI turns | **NOT FIXED** | NOT FIXED | `DD-untested-real-setup` | nothing |
| [C7](#c7--ai-ratings-did-not-reflect-ai-strength-all-1200-then-stale-after-every-network-change) AI ratings did not reflect AI strength (all 1200, then stale after every network change) | **NOT FIXED** | PARTIAL → NOT FIXED | `DD-multi-source-truth` | nothing |
| [C15](#c15--a-base-camp-request-from-the-owner-camps-usable-once-a-common-house-rule-silently-disappeared) A base-camp request from the owner (camps usable once, a common house rule) silently disappeared | **NOT FIXED** | NOT FIXED | `DD-process` | nothing |
| [G2](#g2--replays-play-too-fast-and-the-speed-setting-couldnt-be-found) Replays play too fast, and the speed setting couldn't be found | **NOT FIXED** | PARTIAL → NOT FIXED | `DD-no-spec` | nothing |
| [D7](#d7--the-live-training-page-showed-different-arrival-numbers-than-claude-reported) The live training page showed different arrival numbers than Claude reported | **NOT FIXED** | NOT FIXED | `DD-multi-source-truth` | nothing |
| [D10](#d10--design-review-defects-found-and-left-open-a1-a9a18-a20a22-a24) Design-review defects found and left open (A1, A9–A18, A20–A22, A24) | **NOT FIXED** | NOT FIXED | `DD-content-sized-layout` `DD-process` | nothing |
| [D16](#d16--your-games-reshuffles-when-the-online-list-arrives) "Your games" reshuffles when the online list arrives | **NOT FIXED** | NOT FIXED | `DD-multi-source-truth` `DD-server-first` | nothing |
| [D29](#d29--returning-players-see-a-blank-screen-while-the-page-asks-the-server-what-to-show) Returning players see a blank screen while the page asks the server what to show | **NOT FIXED** | NOT FIXED | `DD-server-first` | nothing |
| [E12](#e12--occasional-flicker-after-moving-the-map-iphone-11-safari-the-mark-button-was-unusable) Occasional flicker after moving the map (iPhone 11 Safari); the Mark button was unusable | **NOT FIXED** | NOT FIXED | `DD-untested-real-setup` | nothing |
| [E15](#e15--ai-ratings-shipped-as-a-guess-and-stale-for-the-shipped-network) AI ratings shipped as a guess, and stale for the shipped network | **NOT FIXED** | NOT FIXED | `DD-multi-source-truth` | nothing |
| [E20](#e20--ai-training-starved-the-machine-that-builds-and-tests) AI training starved the machine that builds and tests | **NOT FIXED** | NOT FIXED | `DD-process` | nothing |
| [H2](#h2--replay-winning-chances-are-not-winning-chances) Replay "winning chances" are not winning chances | **NOT FIXED** | NOT FIXED | `DD-no-spec` `DD-unvalidated-model` | nothing |
| [F19](#f19--rules-questions-not-answered-first-the-tie-break-answer-misread) Rules questions not answered first; the tie-break answer misread | **NOT FIXED** | NOT FIXED | `DD-no-spec` `DD-process` | nothing |
| [F24](#f24--resign-still-waits-for-the-server-owners-no-wait-not-done) Resign still waits for the server (owner's "no wait" not done) | **NOT FIXED** | NOT FIXED | `DD-server-first` | nothing |
| [F29](#f29--process-claude-stops-working-after-answering) Process: Claude stops working after answering | **NOT FIXED** | NOT FIXED | `DD-process` | nothing |
| [P2](#p2--returning-player-sees-a-blank-screen-for-1-s) Returning player sees a blank screen for ~1 s | **NOT FIXED** | NOT FIXED | `DD-server-first` | nothing |
| [P4](#p4--all-cards-overlay-leaks-across-states) "All cards" overlay leaks across states | **NOT FIXED** | NOT FIXED | `DD-ui-flags` | nothing |
| [P5](#p5--reloading-or-rejoining-a-running-online-game-flashes-the-room-lobby) Reloading or rejoining a running online game flashes the room lobby | **NOT FIXED** | NOT FIXED | `DD-server-first` | nothing |
| [P7](#p7--turn-hand-offs-drop-67-frames-ai-turns-run-at-20-fps) Turn hand-offs drop 6–7 frames; AI turns run at ~20 fps | **NOT FIXED** | NOT FIXED | `DD-whole-rebuild` | nothing |
| [P8](#p8--late-game-nearly-every-turn-change-has-a-100200-ms-frame) Late game: nearly every turn change has a 100–200 ms frame | **NOT FIXED** | NOT FIXED | `DD-untested-real-setup` | nothing |
| [P9](#p9--one-off-hitches-select-buy-undo-drop-market-hide-setup-clicks-replay-openleave) One-off hitches (select, buy, undo, drop, market hide, setup clicks, replay open/leave) | **NOT FIXED** | NOT FIXED | `DD-whole-rebuild` | nothing |
| [P11](#p11--turn-buttons-move-and-change-meaning-under-the-finger-undo-jumps-end-turnundo-vanish-in-buy-mode-double-taps-pass-confirmations) Turn buttons move and change meaning under the finger (Undo jumps; End turn/Undo vanish in buy mode; double taps pass confirmations) | **NOT FIXED** | NOT FIXED | `DD-content-sized-layout` | nothing |
| [P12](#p12--player-bar-jumps-51-px-at-round-n--final) Player bar jumps 51 px at "Round N · final" | **NOT FIXED** | NOT FIXED | `DD-content-sized-layout` | nothing |
| [P13](#p13--paying-by-drag-leaves-a-hole-in-the-hand) Paying by drag leaves a hole in the hand | **NOT FIXED** | NOT FIXED | `DD-multi-source-truth` | nothing |
| [P14](#p14--replays--my-games-reshuffles-under-the-cursor) Replays → My games reshuffles under the cursor | **NOT FIXED** | NOT FIXED | `DD-multi-source-truth` `DD-server-first` | nothing |
| [P15](#p15--page-boot-is-a-serial-waterfall) Page boot is a serial waterfall | **NOT FIXED** | NOT FIXED | `DD-server-first` | nothing |
| [P17](#p17--replay-max-speed-is-4) Replay max speed is 4× | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [P19](#p19--closing-a-socket-takes-10-s-silent-drops-detected-after-40-s) Closing a socket takes 10 s; silent drops detected after 40 s | **NOT FIXED** | NOT FIXED | `DD-silent-failure` | nothing |
| [P20](#p20--ai-opponents-only-on-first-expedition-with-34-players) AI opponents only on First Expedition with 3–4 players | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [P21](#p21--ending-a-turn-with-cards-left-takes-23-clicks) Ending a turn with cards left takes 2–3 clicks | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [P22](#p22--start-a-new-game-discards-the-running-game-with-one-click) "Start a new game" discards the running game with one click | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [P23](#p23--online-time-bank-is-uncapped) Online time bank is uncapped | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [P24](#p24--the-history-button-is-a-hidden-3-way-cycle) The History button is a hidden 3-way cycle | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [P25](#p25--opening-the-menu-doesnt-pause-local-ais) Opening the menu doesn't pause local AIs | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [P26](#p26--animation-gates-input-and-the-ai-a-second-card-is-ignored-while-an-explorer-walks-local-ais-freeze-in-a-hidden-tab) Animation gates input and the AI: a second card is ignored while an explorer walks; local AIs freeze in a hidden tab | **NOT FIXED** | NOT FIXED | `DD-animation-coupled` | nothing |
| [P27](#p27--end-screen-ranks-non-arrivals-without-saying-why) End screen ranks non-arrivals without saying why | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [P28](#p28--buy-mode-pay-slot-and-paid-cards-float-over-the-board-the-raised-card-covers-the-counter-treasure-chests-value-vs-cost) Buy mode: pay slot and paid cards float over the board; the raised card covers the counter; Treasure Chest's value vs cost | **NOT FIXED** | NOT FIXED | `DD-float-over` | nothing |
| [P29](#p29--market-hover-preview-spills-over-menu-its-badge-is-clipped-the-all-cards-x-sits-over-menu) Market hover preview spills over Menu; its badge is clipped; the All cards X sits over Menu | **NOT FIXED** | NOT FIXED | `DD-float-over` | nothing |
| [P30](#p30--idle-hand-4-cards-overlap-while-half-the-bottom-edge-is-empty) Idle hand: 4 cards overlap while half the bottom edge is empty | **NOT FIXED** | NOT FIXED | `DD-untested-real-setup` | nothing |
| [P31](#p31--undo-snaps-the-explorer-back-with-no-animation) Undo snaps the explorer back with no animation | **NOT FIXED** | NOT FIXED | `DD-animation-coupled` | nothing |
| [P32](#p32--exit-replay-dumps-you-on-the-start-screen-not-the-results) Exit replay dumps you on the start screen, not the results | **NOT FIXED** | NOT FIXED | `DD-ui-flags` | nothing |
| [P33](#p33--rules-are-one-long-wall-onlineai-paragraphs-before-the-turn-rules) Rules are one long wall, Online/AI paragraphs before the turn rules | **NOT FIXED** | NOT FIXED | `DD-no-spec` | nothing |
| [P34](#p34--stray-182-px-dash-in-the-online-prompt-during-ai-turns) Stray 18×2 px dash in the online prompt during AI turns | **NOT FIXED** | NOT FIXED | `DD-per-element-patch` | nothing |
| [P35](#p35--orphaned-localstorage-from-older-versions-is-never-cleaned) Orphaned localStorage from older versions is never cleaned | **NOT FIXED** | NOT FIXED | `DD-multi-source-truth` | nothing |
| [U1](#u1--tests-that-silently-skip-their-own-checks) Tests that silently skip their own checks | **NOT FIXED** | NOT FIXED | `DD-silent-failure` | nothing |
| [U2](#u2--botchoose-silently-plays-a-different-ai-when-the-network-is-missing) botChoose silently plays a different AI when the network is missing | **NOT FIXED** | NOT FIXED | `DD-silent-failure` `DD-two-mechanisms` | nothing |
| [U3](#u3--42-empty-catch--blocks-in-page-and-server) 42 empty `catch {}` blocks in page and server | **NOT FIXED** | NOT FIXED | `DD-silent-failure` | nothing |
| [U4](#u4--late-game-hand-offs-slower-playtest-8-not-reproduced) Late-game hand-offs slower (playtest #8): not reproduced | **NOT FIXED** | NOT FIXED | `DD-untested-real-setup` | nothing |

## Root fixes with no ratchet

Fixed at the root, but nothing would fail if the bug came back.

- [A7](#a7--every-card-showed-a-gold-coin-badge-in-the-top-left-corner) Every card showed a gold coin badge in the top-left corner
- [A8](#a8--board-spaces-didnt-show-how-hard-they-are-icons-crowded-together) Board spaces didn't show how hard they are; icons crowded together
- [A17](#a17--rubblebase-camp-progress-dots-never-went-away-and-their-pulse-never-played) Rubble/base-camp progress dots never went away (and their pulse never played)
- [B11](#b11--the-ai-buys-first-and-gives-up-a-free-move-its-values-jump-between-consecutive-decisions-of-one-turn) The AI buys first and gives up a free move; its values jump between consecutive decisions of one turn
- [B14](#b14--four-way-test-report-win-rates-that-dont-add-up-to-100) Four-way test report: win rates that don't add up to 100%
- [B18](#b18--rubble--base-camp-progress-counter-never-goes-away) Rubble / base-camp progress counter never goes away
- [D3](#d3--a-buy-button-that-could-never-be-the-way-to-buy) A "Buy" button that could never be the way to buy
- [D9](#d9--online-game-starts-with-the-market-covering-el-dorado-design-review-a23) Online game starts with the market covering El Dorado (design review A23)
- [D21](#d21--the-menu-panel-changes-size-from-screen-to-screen) The menu panel changes size from screen to screen
- [D25](#d25--the-menus-background-flickers-and-every-click-re-lays-out-the-whole-screen) The menu's background flickers and every click re-lays out the whole screen
- [D26](#d26--the-network-ai-without-search-does-weird-stuff-on-the-site-orellana) The network AI without search "does weird stuff" on the site (Orellana)
- [D30](#d30--the-start-screen-re-renders-when-late-fonts-arrive) The start screen re-renders when late fonts arrive
- [E4](#e4--the-board-painted-over-the-menu-for-a-quarter-second-on-load) The board painted over the menu for a quarter second on load
- [E27](#e27--a-saved-game-that-couldnt-be-rebuilt-silently-started-a-new-game) A saved game that couldn't be rebuilt silently started a new game
- [E31](#e31--replays-silently-patched-moves-that-didnt-fit-the-game) Replays silently patched moves that didn't fit the game
- [F9](#f9--replay-says-you-made-this-move-when-you-didnt) Replay says "you made this move" when you didn't
- [F20](#f20--replay-shows-meaningless-n-left-figures) Replay shows meaningless "N left" figures
- [F21](#f21--a-useless-end-step-in-the-history) A useless "End" step in the history

## Same bug across days


36 groups of entries that describe one defect (75 entries; E5 and E33 are each in two groups because each covers two
defects that another part wrote up separately). Every entry in a group carries a `**Same bug as:**` line after its
Commits line. Where the combined history changed an entry's final state, the later step was added to its **What we did**
sequence (marked "added" below). Final state is the one merge.py reads for each entry.

| # | Entries | The bug | Final state |
|---|---|---|---|
| 1 | A9, C16 | Tiles I and N transcribed one strength short (`a304ba6`), fixed `0ade920` | PARTIAL, PARTIAL (the Traverse Rating check never became a test) |
| 2 | A10, E16 | The page's own "can buy" rules ignore a pending removal; the buy gets stuck | ROOT `fb7dd0d`, ROOT |
| 3 | A11, P11 | The "you can still afford" confirmation takes over End turn's slot; a double tap passes it | NOT FIXED, NOT FIXED |
| 4 | A14, P4 | `UI.allOpen`: the All cards overlay leaks across modes and games | NOT FIXED, NOT FIXED |
| 5 | A15, B1 | Replay panel floated over the game and placed by measurement: covered by the market, missing at some sizes | PARTIAL `f0c51f3`, PARTIAL (dock is a grid cell; the market still floats) |
| 6 | A17, B18 | Rubble / base-camp progress dots never go away | ROOT `0a6cba4` (A17: added), ROOT |
| 7 | A18, P29 | Market hover preview (×1.9, `7346c68`) spills over Menu | NOT FIXED, NOT FIXED |
| 8 | A23, C1 | Self-play exploration built as per-mechanism tricks; expensive cards and choices rarely tried | NOT FIXED (A23: added `985d508` HACK → NOT FIXED), NOT FIXED |
| 9 | A25, P13 | A paid card leaves a hole in the hand (fan laid out by index, tray as an exception) | NOT FIXED, NOT FIXED |
| 10 | A29, C19, F30 | AI explorers stranded before El Dorado (25-round cap, Witch's Cauldron stalls) | PARTIAL `fd58188` (all three) |
| 11 | A31, B20 | The bot's copy of the ranking settles an arrival's place too early | PARTIAL `7ca1876`, PARTIAL |
| 12 | A33, E31 | A log's failing moves turned into "end turn" by the replay loader | PARTIAL (A33 also counts the training tools, still patching), ROOT `9deac13` (replays only) |
| 13 | B2, E22 | Player chips clipped in the top bar | PARTIAL `127544c`, PARTIAL |
| 14 | B3, E5 | CSS variable and `:has()` on `#app` restyle the whole board (E5's cause b) | PARTIAL, PARTIAL (market.js still sets `--mktW` and `.nomkt` on `#app`) |
| 15 | B6, E5 | Grabbing-cursor class restyles the whole board at drag start (E5's cause a) | NOT FIXED on desktop (B6; touch skipped by a device `if`), PARTIAL (E5) |
| 16 | B11, D26 | Greedy one-action-at-a-time network policy misplays (training; Orellana on the site) | ROOT for play `7e0bcd1`, ROOT (D26's "weird stuff" = B11's misplay is a hypothesis) |
| 17 | C3, E23 | `aiStep` turns an illegal AI action into end turn | PARTIAL `00079c1`, PARTIAL (the 60-decision cap still ends turns silently) |
| 18 | C5, F13, P1 | Online resign waits 5–7 s while one alarm plays out the game | PARTIAL `a230101` (all three) |
| 19 | C6, F7 | `ensureSchema` runs ~25 D1 queries before a new isolate's first reply | PARTIAL `199a124`, PARTIAL |
| 20 | C7, E15 | AI ratings not recalibrated for the network that ships | NOT FIXED (C7: added "again since `ba2cc90`"), NOT FIXED |
| 21 | C10, F17, P10 | The content-sized prompt box (`width:max-content`, `3a8631e`) changes size | HACK `9e85226` (C10, corrected), PARTIAL (F17: its row part was fixed properly), HACK |
| 22 | C11, D14 | AI seats in 2-player games the network was never trained for | PARTIAL `a17086a`, PARTIAL (D14 corrected from ROOT: the silent fallback remains) |
| 23 | C14, D1, H4 | The owner's questions wait behind (or get lost in) Claude's work | PARTIAL (CLAUDE.md rules `8dbdca8`, `237fd6f`; D1 corrected from HACK) |
| 24 | D12, E2 | Slow first load on the owner's phone | PARTIAL, PARTIAL (`525ea29` split the page; the boot still waits on the server) |
| 25 | D13, E11 | Wheel-zoom latency check failed (`1f52aaf`) and was loosened (`63c9433`) | HACK, HACK |
| 26 | D16, P14 | My games list reshuffles when the server's list arrives | NOT FIXED, NOT FIXED |
| 27 | D18, E34 | Design agents run inside the conversation, lost when it was interrupted or restarted | PARTIAL, PARTIAL (E34: added the 09-29 19:11 relaunch as cloud sessions) |
| 28 | D23, E26 | The Room's catch turned engine exceptions into "Bad action." | ROOT `e851e67`, ROOT |
| 29 | D29, P2 | Returning player sees a blank screen until `/api/config` → `/api/me` | NOT FIXED, NOT FIXED |
| 30 | D30, E1 | Start-screen web fonts swap in after first paint | ROOT for the menu `690402e` (D30), PARTIAL (E1 also counts the game's 4 s font race) |
| 31 | E30, F28, P6 | False invariant `animateMove: the explorer is drawn` in a hidden tab | PARTIAL `2f4ee78` (all three; F28 corrected from HACK) |
| 32 | E33, F1 | History panel width set by content and drags | PARTIAL (E33: added `0101346` ROOT → `2da7863` PARTIAL), ROOT `0101346` |
| 33 | E33, F2 | History turns wrap onto two lines | PARTIAL, PARTIAL `2da7863` (captions still widen a step) |
| 34 | G2, P17 | Replay pace as a guessed constant: too fast (09-27), top speed too slow (09-30) | NOT FIXED (G2: added), NOT FIXED (waiting on the owner) |
| 35 | P8, U4 | Late-game hand-off hitches (playtest #8), not reproduced | NOT FIXED, NOT FIXED |
| 36 | P19, U3 | Empty catch hides the failed socket close (U3 is the class of 42 empty catches) | NOT FIXED, NOT FIXED |

## Related but not merged (siblings: same decision, different defect)

- G1 (replay controls fade at every turn end) shares its fix `f0c51f3` with A15/B1, but its mechanism (cards animating over the panel, or the panel collapsing) is different.
- P21 (ending a turn takes 2–3 clicks) is the product question behind A11/P11; the defect in A11/P11 is where the confirmation sits.
- A19 and E28 are other instances of U3's empty catches; E21 (dead connection) and P19 share the socket lifecycle, not the defect.
- B9 (bot hovers next to El Dorado because of its training targets) looks like A29/C19/F30 but has a different cause.
- C11/D14 vs P20 (AIs only on First Expedition, 3–4 players): P20 is the product decision left by the fix.
- F12 (room lobby hid the AI list until the server spoke) and P16 (create room 1.6 s): P16 measures the costs left after F7 and F12; overlapping symptom, different causes.
- F24 (resign still waits for the server) and F26 (the no-wait change shipped against an instruction) sit beside group 18.
- E13, D24 and F32 share `0ed43a9` (no `Math.random` defaults) but are three defects.
- D10 (design-review defects left open) is a process entry whose list includes items later written up as B2/E22, A25/P13, C10/P10, A18/P29 and D20; it is linked by tags, not merged.
- C2 and B15 are two different faults of the progress measure (a saturated heuristic proxy; search confounded with training).
- A1 and A22 are two deploy failures of one decision (deploys never observed).

---

# The bugs

## 2026-09-26

### A1 — Pushes to main silently stopped deploying (Workers Builds disconnected)
- **Source:** owner reports (2026-09-26 19:22: "Are you sure that you pushed correctly to GitHub or that the Cloudflare is properly configured? Because it hasn't noticed that there's been a new commit. Is there a button I need to hit for it to check?"; 19:24, pasting the Cloudflare dashboard: "This project is disconnected from your Git account. This may cause deployments to fail.")
- **Commits:** `4fcbd48` Note Workers Builds reconnect fix in handoff (docs only)
- **Symptom:** a push to `main` did not reach the live site; the dashboard showed only manual deploys ("Manually deployed … Dashboard"), and nothing on our side noticed.
- **Mechanism:** the Cloudflare Workers Builds ↔ GitHub link was disconnected, so pushes triggered no build. `git push` succeeded, which is all our process checked.
- **Root cause:** "deployed" was inferred from "pushed". Nothing observes the live site after a push, and `/api/config` (`src/worker.js:247`) returns only `{google, dev}`, so even the check written into HANDOFF ("confirm the deploy landed (e.g. `curl …/api/config`)", `docs/HANDOFF.md:258`) cannot tell the new build from the old one.
- **Design decision:** deploy success is assumed, never observed: the live site doesn't say which build it runs, and the change loop ends at "tell him it's deploying" (CLAUDE.md step 6). — tags: `DD-silent-failure`, `DD-untested-real-setup`
- **Siblings:** A22 (a failed bundle never deployed; the owner found it, not Claude). Any deploy failure (a D1 migration error, a wrangler config error) is equally invisible.
- **Recommended design fix:** the build stamps its commit hash into the worker (`/api/config` or `/api/version` returns it), and the change loop ends by polling the live URL until it reports the pushed hash, or reports "deploy failed" after N minutes.
- **What we did:** **PARTIAL** — the owner reconnected the repo (an instance fix in his dashboard). `4fcbd48` only adds a HANDOFF note asking Claude to curl `/api/config`, which can't distinguish builds. The decision stands; A22 happened 2.5 hours later. After A22, Claude did start polling in-session ("Wait for deploy to go live" background commands at 22:07 and 22:16, "Wait for Cloudflare deploy of replays … deployed" at 23:37); what they compared is unknown, and the step never entered the change loop in CLAUDE.md.
- **Ratchet:** nothing (a documentation line).
- **Assertion that would have caught it:** "the live site runs the commit just pushed" — post-push step of the change loop (poll the live URL's build hash) — test/process tier (network) — would have fired on the first push after the disconnect — also catches A22 and any failed deploy — tags: `AS-deploy-landed`

### A2 — Boards were made up: random routes, reconstructed tiles, blockades laid in number order
- **Source:** known gap in the handed-over project (docs/HANDOFF.md at `e6ae810` §5: "Reconstructed/guessed: space-by-space layouts and space values"; §2: the owner was "Worried the boards were made up (they were at first)"); owner report (2026-09-26 19:32: "For now, we're not going to randomly select boards… Don't randomly generate them."); owner 20:04 pointed to the source himself ("https://www.boardgamehelpers.com/QuestforElDorado/TileCatalogue.aspx what about this one? It seems pretty clear to me.") — the catalogue HANDOFF §5/§8 had called unreadable, and which `a304ba6` then used via curl
- **Commits:** `e6ae810` (unpacked state: `genMap` random routes, guessed tile layouts, `BLOCKADES.slice(0,conns.length)` in number order) · `5d511a2` Replace random routes with a fixed course · `9cc37c9` Real tiles B and C · `56b9af3` Real tile K · `a304ba6` Real First Expedition tiles · `0ade920` (09-27) fix tiles I and N · later 09-27 commits transcribed A, D, F, G, J, L, M (HANDOFF §5); E and H are still reconstructed (`docs/HANDOFF.md:99`)
- **Symptom:** the map wasn't the real game: routes the rulebook doesn't have, tiles whose space-by-space layout and strengths were invented (only the terrain counts matched the catalogue).
- **Mechanism:** `genMap(nMid,seed)` built a winding random route from board templates whose token rows were guessed; blockades were assigned in number order (#1 on the first connection …), while the rulebook deals them at random.
- **Root cause:** the first session couldn't read the catalogue images (HANDOFF §8), so it generated plausible data and shipped it, flagged only in a handoff doc.
- **Design decision:** game data that couldn't be verified was synthesised and shipped as if real instead of being blocked on a source; there is no machine check of board data against the published catalogue numbers. — tags: `DD-unverified-data`
- **Siblings:** A3 (blockade costs guessed), A6 (course fitted to a blurry scan), A9 (I and N transcribed wrong), E/H still guessed (latent: any course using them is wrong).
- **Recommended design fix:** board data is only accepted with a test that checks it against the published per-tile numbers (terrain counts + the catalogue's "Traverse Rating" = Σ strength + 6 per mountain, which HANDOFF §5 found is exact); tiles without a verified source aren't selectable in any course.
- **What we did:** **PARTIAL** — `5d511a2` deleted `genMap` and added fixed `COURSES` plus a random blockade deal (a real removal: random routes can't come back); `9cc37c9`/`56b9af3`/`a304ba6` replaced B, C, I, K, N with transcriptions. But the tile data has no automated check (A9's errors were in this same transcription), and E/H remain guesses.
- **Ratchet:** test for structure only — `5d511a2` added to `test/engine.test.mjs`: every course builds, one blockade per connection, blockades dealt at random, 4 starts/3 goals. Nothing checks tile contents.
- **Assertion that would have caught it:** "every board's spaces match the published catalogue totals (terrain counts and Traverse Rating)" — build/test time over `BOARDS` — test tier — fires on the first run for every invented tile — also catches A9 and any future transcription slip — tags: `AS-rules-vs-rulebook`

### A3 — Blockade costs are a guess (1,1,1,1,2,2)
- **Source:** found by Claude (known gap in HANDOFF at `e6ae810` §5 and §9 item 3: "Blockade costs — confirm from a photo of the tokens")
- **Commits:** none (still `src/engine_data.js:45`: `BLOCKADES=[{n:1,k:'j',v:1},…,{n:5,k:'j',v:2},{n:6,k:'r',v:2}]`)
- **Symptom:** possibly wrong blockade costs in every game (not verified either way; `docs/HANDOFF.md:117`: "still a guess").
- **Mechanism:** the costs were chosen without a source.
- **Design decision:** (also the root cause) same as A2: unverified data shipped with a note instead of a check. — tags: `DD-unverified-data`
- **Siblings:** A2, A6, A9.
- **Recommended design fix:** transcribe the blockade tokens from the catalogue images (HANDOFF: "BoardGameHelpers has blockade images too") and pin them in a rules test.
- **What we did:** **NOT FIXED** — four days later the handoff still says "still a guess".
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "blockade costs equal the printed tokens" — rules test — test tier — fires once, at data entry — tags: `AS-rules-vs-rulebook`

### A4 — Rulebook tie-break "whoever reached El Dorado first" not implemented
- **Source:** found by Claude (`5d511a2` added to HANDOFF §9: "rulebook tiebreak 'if tied players have no blockades, whoever reached El Dorado first wins' is not implemented yet (currently a shared place)"). The rule text is as quoted in our HANDOFF; not re-verified against the rulebook for this post-mortem.
- **Commits:** none; `endGame` (`src/engine_rules.js:370-377`) ranks arrivals by `[round, -blockades, -biggest blockade]` and gives equal keys a shared place.
- **Symptom:** two players who arrive in the same round with equal blockades share a place (and split Elo) instead of the earlier arrival winning.
- **Mechanism:** `p.fin` stores only the round of arrival, not the order within the round, so the engine can't express the rule.
- **Root cause:** the state kept less than the rule needs (round, not arrival order).
- **Design decision:** the end-of-game rule was implemented to what the state already had, and the missing rule was parked in a doc. — tags: `DD-no-spec`
- **Siblings:** the bot's own copy of the ranking (A31) would have to change too.
- **Recommended design fix:** record arrival order (a counter) in the engine and add it as the last sort key; one rules test.
- **What we did:** **NOT FIXED** (still in `docs/HANDOFF.md:274`).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "end-of-game ranking matches the rulebook's tie-break chain" — `test/rules.test.mjs` scenario — test tier — only in the rare same-round, equal-blockade case — tags: `AS-rules-vs-rulebook`

### A5 — Online screen's live room list didn't connect right after signing in
- **Source:** found by Claude (`a084c65` message: "Fix: the hub's live room list didn't connect right after signing in")
- **Commits:** `a084c65` Public/private rooms and quick match (fix inside a feature commit)
- **Symptom:** after signing in with the hub already open, the "Open rooms" list stayed empty/stale.
- **Mechanism:** `showHub()` returned early (`if(hub open){renderHub();return;}`) before `openLobbyWs()`, so the socket only opened when the hub was first created.
- **Root cause:** the socket's lifetime was a side effect of one call path, not derived from "Online screen shown and signed in".
- **Design decision:** resources (sockets) opened imperatively by whichever function happens to run, rather than derived from the current screen + auth state. — tags: `DD-imperative-sequencing`
- **Siblings:** today the same socket is opened from two places (`src/client/menu.js:73` `menuRefresh` and `menu.js:173` `showHub`), which is the same pattern twice; any new path to the Online screen must remember to call it. Playtest #5 (rejoin shows the lobby screen before the server says lobby or game) is the same "screen before the data that decides it" family.
- **Recommended design fix:** one reconcile step per frame/state change: `wantLobby = screen==='online' && signedIn`; open/close the socket when it differs from `NET.lobbyWs`.
- **What we did:** **PARTIAL** — moved the call above the early return. The imperative pattern stands (now in two places).
- **Ratchet:** nothing in this fix. `test/online.cjs` (09-29) checks public rooms are listed, but (not verified) not the sign-in-while-open path.
- **Assertion that would have caught it:** "while the Online screen is shown to a signed-in user, a lobby socket is open or connecting" — per-frame view invariant — always-on cheap — would fire on the first sign-in from the hub — also catches any screen whose data feed isn't running — tags: `AS-view-matches-state`

### A6 — First Expedition course fitted to a blurry rulebook scan
- **Source:** owner reports (2026-09-26 19:57: "The map you're using appears to be wrong. It says it's BCNIK, but then when I click new game, it loads up a map that looks nothing like the original map for El Dorado. This is in the single-player local version. Are you sure it's been correctly updated?"; 20:00: "Are you sure you need to do it like this? Don't you have a good image reader? You don't need to do this with code."; 20:02: "I looked at the cropped images with the red icons that you have. They do not match up … They're all over the fucking place."; 20:02: "You need to find a much clearer image because this image you're struggling with, the image is shit."; 20:06: "Produce the first tile … and I'll compare it myself to see if you got it right."; 20:09: "Can you just give me a render here?")
- **Commits:** `5d511a2` (positions "fitted to the rulebook illustration (page 5)": `p:[['B',0,0,2],['C',7,-4,0],['N',12,-2,0],['I',16,1,0],['K',23,-4,0]],e:[25,-8],s:'j'`) → `a304ba6` (from Ravensburger's setup sheet: new positions and rotations for C, N, I, K, El Dorado moved and switched to the **water** side `s:'w'`)
- **Symptom:** the first course had boards in the wrong places/rotations and the wrong El Dorado side (jungle instead of water); `5d511a2` was pushed at 19:48 and the owner found it 9 minutes later in a local game. The image-reading pipeline (code-cropped icon detection) produced crops that "do not match up".
- **Mechanism:** positions were eyeballed from a low-resolution English rulebook scan.
- **Root cause:** Claude kept working from a source it couldn't read reliably, and showed the owner nothing to compare until he asked for a render.
- **Design decision:** same as A2: data entered without a verification step (no side-by-side render against the source). — tags: `DD-unverified-data`, `DD-process`
- **Siblings:** A2, A3, A9.
- **Recommended design fix:** every course is accepted only with a machine comparison against the official sheet (later built as `tools/course-check`, HANDOFF §5: "colour-classified … matched at every lattice offset and rotation") and a render shown to the owner.
- **What we did:** **PARTIAL** — `a304ba6` corrected the course from a better source; the later course-check tooling is a manual tool, not a test.
- **Ratchet:** nothing (tools/course-check is run by hand).
- **Assertion that would have caught it:** "each course's boards, rotations and El Dorado side match the official setup sheet" — course-check comparison in the test suite — test tier — fires at data entry — also catches A2/A9 layout errors — tags: `AS-rules-vs-rulebook`

### A7 — Every card showed a gold coin badge in the top-left corner
- **Source:** owner report (2026-09-26 20:13: "all of the cards have in the top left a gold icon, which is not true. Only the gold should have a gold icon in the top left.")
- **Commits:** `a304ba6` (card strength badge uses the card's suit colour and icon; only coin cards are gold)
- **Symptom:** machete, paddle and joker cards carried a gold coin in the corner, as if they were coin cards.
- **Mechanism:** `.c-pow` had one hard-coded gold radial gradient for every card, and showed only the number.
- **Root cause:** the badge's look was a constant, not derived from the card's suit, and nobody compared the card faces with the real cards.
- **Design decision:** card art was designed from memory, not against the real card faces. — tags: `DD-no-spec`
- **Siblings:** none found.
- **Recommended design fix:** per-suit tokens (`--pow`, `--powInk`) on the suit class, so every part of the face derives from the card's data.
- **What we did:** **ROOT** — `a304ba6` moved the badge colours to per-suit variables on `.k-g/.k-b/.k-y/.k-x` and adds `icon(d.s)`; a new card of any suit gets the right badge automatically.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "every card face's badge uses its own suit's colour and icon" — render check over `CT` — debug/test tier — would fire on the first render — tags: `AS-view-matches-state`

### A8 — Board spaces didn't show how hard they are; icons crowded together
- **Source:** owner report (2026-09-26 20:18: "in the original one, the design language is that the more things it takes to cross a square, the darker it is. So you can kind of visually see without even counting how hard it is to cross a square. Also make the design language a little bit clearer so you can see the number of items on it, because the current icons are a little bit too close to each other.")
- **Commits:** `a304ba6` (`TSHADE`: one gradient per terrain × strength 1-4; `ICON_AT`: 1 / 2 side by side / 3 triangle / 4 square)
- **Symptom:** a 3-machete space looked like a 1-machete space until you counted squeezed icons; the printed tiles darken harder spaces.
- **Mechanism:** `buildBoard` filled every space with one gradient per terrain (`url(#gr-'+h.type+')`) and drew `n` icons in a row with `gap=is*.78`, overlapping at n ≥ 3.
- **Root cause:** the board's look was designed without the printed tiles as the reference.
- **Design decision:** visual spec never taken from the real game. — tags: `DD-no-spec`
- **Siblings:** A7 (card badge), A2 (tile data).
- **Recommended design fix:** space appearance derived from (terrain, strength) through one table matched to the printed tiles.
- **What we did:** **ROOT** — the fill and icon layout are now looked up from the space's strength (`TSHADE[type][val]`, `ICON_AT[n]`); any tile gets the right shade and layout automatically.
- **Ratchet:** nothing (board rendering tests came later — `test/render.cjs` checks sharpness and latency, not this).
- **Assertion that would have caught it:** no runtime property was violated (a fidelity/spec gap); the check is a side-by-side render against the printed tile, which the owner asked for at 20:06 — tags: `AS-rules-vs-rulebook`

### A9 — Tiles I and N transcribed one strength short
- **Source:** found by Claude (09-27, `0ade920`: "Found by the map transcription check (catalogue Traverse Rating = sum of strengths + 6 per mountain; I and N were each 1 short")
- **Commits:** `a304ba6` (introduced: I row 4 `c2`, N row 4 `v2`) → `0ade920` (09-27) fix to `c3` / `v3`
- **Same bug as:** C16 — the same misread tokens in tiles I and N (`a304ba6`), fixed in `0ade920`; C16 is the 09-27 view of it
- **Symptom:** on First Expedition, one base camp cost 2 cards instead of 3, and one village needed 2 coins instead of 3 (AI trained on the wrong board).
- **Mechanism:** hand transcription from GIFs; a digit misread in each tile.
- **Design decision:** (also the root cause) as A2: data entry without an automated check against the published totals. — tags: `DD-unverified-data`
- **Siblings:** A2, A6; E and H if ever transcribed.
- **Recommended design fix:** the Traverse Rating + terrain count check as a test over `BOARDS` (it was used once by hand).
- **What we did:** **PARTIAL** — `0ade920` fixed the two tokens; the check that found them was never put in the test suite.
- **Ratchet:** nothing (no test references `BOARDS`; searched `test/`).
- **Assertion that would have caught it:** "each tile's Σ strength + 6×mountains equals the catalogue's Traverse Rating" — test over `BOARDS` — test tier — fires on the commit that introduced it — tags: `AS-rules-vs-rulebook`

### A10 — "Can buy" / end-turn nudge computed in the page, ignoring a pending removal
- **Source:** found by Claude (code reading for this post-mortem: `affordable()` added in `a304ba6` checks `S.turn.bought` but not `S.turn.pending`). The same omission in `pickFromMarket` was the owner-visible bug fixed 09-29 in `fb7dd0d` ("a buy could get stuck after a Travel Log or Scientist").
- **Commits:** `a304ba6` (introduced `affordable()` in `ui_state.js`: its own cash sum, market/reserve rules) → `fb7dd0d` (09-29) purchase rules in one engine function `cantBuy`/`buyOptions`; the page asks it (`src/client/actions.js:149`)
- **Same bug as:** E16 — the page's own purchase rules ignoring a pending removal: A10 is where `affordable()` came in, E16 the stuck buy the owner hit, both fixed in `fb7dd0d`
- **Symptom:** during a Scientist/Travel Log removal the market could highlight cards as "Can buy" that the engine would refuse.
- **Mechanism:** `affordable()` re-implemented "what can I buy" (coin values, one purchase, reserve open) in the page, missing one engine condition.
- **Root cause:** a rule-derived answer computed in two places.
- **Design decision:** the page derived rules answers itself instead of asking the engine. — tags: `DD-rules-outside-engine`
- **Siblings:** the pre-existing `pickFromMarket` checks (fixed together in `fb7dd0d`); the page's target computation (A16, until `c3891f7`); the bot's own copies (A31, `botEndView`, `botActions`).
- **Recommended design fix:** the engine exposes `buyOptions(S, seat)`; the page only renders it.
- **What we did:** introduced here; **ROOT** in `fb7dd0d` (the page's `affordable()` is now `buyOptions(S,S.cur)`).
- **Ratchet:** test — `test/rules.test.mjs` (80 rule scenarios incl. this case) and `flows.cjs` (clicks through it), both from `fb7dd0d`.
- **Assertion that would have caught it:** "anything the page shows as possible, the engine accepts" (debug cross-check: every highlighted buy is in `buyOptions`) — per-render, debug tier — fires the first time a Scientist is played with coins in hand — also catches A31/A32-style copies in the bot and tools — tags: `AS-matches-engine`

### A11 — End-turn "you can still afford…" warning reuses the big button slot (extra clicks, tap-through)
- **Source:** introduced by Claude in `a304ba6` at the owner's request (20:13: "if you end turn without buying something and you can afford something, it will notify you"); the annoyance was reported in playtest 2026-09-30 #23 (end turn takes 2-3 clicks) and #27 (the big slot's meaning changes under the finger).
- **Commits:** `a304ba6` (mode `buyWarn`, button "End turn anyway" `big:1`) — still in `src/client/hud.js:68-70`, `src/client/actions.js:152`
- **Same bug as:** P11 — the confirmation that takes over End turn's slot (`a304ba6`) is the double-tap half of P11 (playtest #27)
- **Symptom:** ending a turn can take up to three presses of the same spot (End turn → End turn anyway → Discard & end turn); a quick double tap skips the warning it was meant to show.
- **Mechanism:** each mode builds its own button list; `btnWire` (`hud.js:76-82`) lays out `big` buttons first, so the same screen position is re-bound to a different action in the next mode.
- **Root cause:** a confirmation was implemented as a new mode that replaces the button under the finger.
- **Design decision:** buttons are per-mode lists laid out by content, not fixed slots per action. — tags: `DD-content-sized-layout`, `DD-ui-flags`
- **Siblings:** playtest #13 (Undo jumps / End turn vanishes in buy mode), #27 (Reveal hand / Undo in the same spot).
- **Recommended design fix:** fixed slots (End turn always in one slot, never re-bound to another action); the nudge is a non-blocking notice beside it, not a mode.
- **What we did:** **NOT FIXED**.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "a tap acts only on a control that was on screen under the finger before the tap began (no control appears under a pending second tap)" — input boundary — debug tier (reads time) — fires on any double tap on End turn — also catches #13/#27 — tags: `AS-hit-test`

### A12 — Action-card text ran into the card footer
- **Source:** found by Claude (`1d37035` message: "Action cards show shorter face text so nothing runs into the footer")
- **Commits:** `1d37035` Unique background art for every card, full-screen button (fix inside the art commit; also edits `src/engine_data.js` to add `face` strings)
- **Symptom:** long action-card texts (Scientist, Travel Log, Native, Transmitter) overflowed into the cost/"Single use" footer.
- **Mechanism:** `.c-txt` had one font size for any text length in a fixed-size card body.
- **Root cause:** text size wasn't fitted to its box.
- **Design decision:** content-sized text in a fixed slot, with no fit check. — tags: `DD-content-sized-layout`
- **Siblings:** playtest #12 (prompt pill changes size with its text); #14 (round label moves the player bar).
- **Recommended design fix:** fit text to the box once at build time (the card set is fixed) or give the body a fixed line budget with a test.
- **What we did:** **HACK** — a magic length threshold (`f.length>16 ? ' long'` → `.c-txt.long{font-size:.64em}`) plus hand-shortened `face` strings put into the rules data file. A new card with 17+ characters of text is sized by a number, not by whether it fits.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "every text in a fixed-size slot fits (scrollHeight ≤ clientHeight, scrollWidth ≤ clientWidth)" — after render, debug tier (reads layout) — fires on the first card rendered — also catches #12 and label overflow — tags: `AS-no-overlap`

### A13 — Affordable market cards pulsed all the time
- **Source:** owner report (2026-09-26 20:51: "the glow for the buyable cards is too much because it's constant. It's not just when you're buying — it's also when you're playing a game because you can buy at any time. So get rid of it.")
- **Commits:** `d683178` (introduced `.mslot.can::before{animation:canPulse 1.6s … infinite}`, following his 20:41 request) → `7346c68` (static: affordable bright, others dimmed, no pulsing)
- **Symptom:** a permanent breathing gold ring on every affordable card for most of every turn.
- **Mechanism:** the pulse was attached to "affordable right now", which is true almost all turn because buying is modeless.
- **Root cause:** his request ("flashes in and out … Do that for the cards on buy as well") assumed a buying moment; the game has none, and Claude didn't point out the difference before building it.
- **Design decision:** behaviour built on an unexamined spec (an attention cue for a state that is nearly always true). — tags: `DD-no-spec`
- **Siblings:** later "no infinite animations on SVG board elements" (CLAUDE.md); `.timer.low` still pulses infinitely (acceptable: it is a real alert).
- **Recommended design fix:** attention cues only for a choice the player is being asked to make now (a mode), static state otherwise.
- **What we did:** **ROOT** for this instance (the animation is gone; state shown statically) but no rule prevents the next always-on cue → counted **PARTIAL**.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "an attention cue (pulse) exists only in a mode that asks for that choice" — per-frame view invariant (`document.getAnimations()` with infinite iterations, checked against the mode) — debug tier — fires at the first idle frame — also catches overlays shown outside their mode (A14) — tags: `AS-view-matches-state`

### A14 — "All cards" overlay state (`UI.allOpen`) leaks across modes and games
- **Source:** introduced by Claude in `d683178`; reported in playtest 2026-09-30 #4 ("All cards" overlay leaks across states).
- **Commits:** `d683178` (introduced `UI.allOpen`, `openAll()`, Transmitter opens it) — still `src/client/state.js:10`, `src/client/market.js:17`
- **Same bug as:** P4 — the `UI.allOpen` flag from `d683178`, reported in the playtest (#4)
- **Symptom:** the full-screen All cards spread can stay open in a mode that doesn't use it (e.g. after cancelling a Transmitter, or into a new game).
- **Mechanism:** `UI.allOpen` is one more independent UI field; in `d683178` only transmit/pay/Escape/close paths set it back — `cancelMode()` and the new-game handler (`sGo`) don't.
- **Root cause:** UI state is a bag of switches reset by hand at each exit, and this switch wasn't added to any reset.
- **Design decision:** UI state held as independent flags instead of derived from (mode, game). — tags: `DD-ui-flags`
- **Siblings:** A17 (rubble pips outliving their mode); playtest #4's other ~18 fields reset in 4 places.
- **Recommended design fix:** derive the overlay from the mode (`allShown = mode==='transmit' || mode==='browse'`), so leaving the mode closes it by construction.
- **What we did:** **NOT FIXED** (as of `3ea4f51`).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "the All cards overlay only exists in a mode that uses it" — per-frame view invariant — always-on cheap — fires the first time a Transmitter is cancelled — tags: `AS-view-matches-state`

### A15 — Market floated over the game: took the top of the board, covered End turn, then covered the replay panel
- **Source:** owner reports (2026-09-26 20:51: "I feel like it's taking up too much room at the top"; 20:57: "There's a layout issue where the all cards thing overlaps the end turn thing."; 23:47: "The replay is covered over by the alt cards in the same layout error as before.")
- **Commits:** `d683178` (floating strip over the board, `--mktH` set on `document.documentElement`) → `7346c68` (moved to a floating right column; `updateMktH` left as a no-op) → `2047335` (JS sizes the column to "end above the action buttons") → `3ab0316` (replay panel `#rbar` absolutely positioned where the turn buttons sit) → `0c6a6f9` (JS measures market, cards, piles, prompt; moves the panel and the zoom controls) → `f0c51f3` (09-27: page grid with its own cells for the replay dock; clearance variables; `test/layout.cjs`) → `b6b907c` (09-29 removes `updateMktH`)
- **Same bug as:** B1 — the replay panel floated over the game and placed by measurement: A15 has the 09-26 reports, B1 the 09-27 00:00 one; both fixed in `f0c51f3`
- **Symptom:** controls covering each other: the market's All cards tile over End turn; later the replay panel under the market ("same layout error as before").
- **Mechanism:** every panel was `position:absolute` over the game area with offsets tuned to the others; `2047335` computed `avail=H-abBottom-150-top` ("room for up to three stacked buttons", a magic 150) with a `getBoundingClientRect` fallback; `0c6a6f9` measured six elements per render and re-styled `.zoomctl` inline, with a `setTimeout(…,0)` in `setMkt`.
- **Root cause:** nothing owned the space; each floating element avoided the others by arithmetic on their current sizes.
- **Design decision:** UI floated over other controls instead of having its own layout cell. — tags: `DD-float-over`, `DD-per-element-patch`
- **Siblings:** A16 (hover preview over the top bar), A18; buy slot/tray over the hand (A25, playtest #31); playtest #32; later history panel (0101346) problems.
- **Recommended design fix:** the page grid: each panel gets a cell (or a declared clearance variable) and the game area shrinks instead of being covered.
- **What we did:** **HACK `2047335` → HACK `0c6a6f9` → PARTIAL `f0c51f3`** — the two same-day fixes were measurement and magic numbers (the second one after the owner saw the same bug again). `f0c51f3` made the replay dock a real grid cell (a root fix for the dock) and added the overlap test; the market itself still floats, kept clear by `--mktFoot`/`--zoomFoot` variables (`src/client/shell.html:207-210`).
- **Ratchet:** test — `test/layout.cjs` (from `f0c51f3`): 11 sizes × play/replay states, "no two controls overlap".
- **Assertion that would have caught it:** "no two controls' boxes overlap, at rest and in every mode" — after layout, debug/test tier (reads layout) — would have fired at 20:53 and 23:36, before both reports — also catches A16, #31, #32 — tags: `AS-no-overlap`

### A16 — Couldn't drag cards onto rubble / base camps
- **Source:** owner report (2026-09-26 20:48: "you have to fix how rubble works. You should be able to click and drag onto Rubble, but it should just require more than one click and drag.")
- **Commits:** `720331d` Rubble, base camps and rubble blockades: drag cards onto them one at a time → `c3891f7` (09-29: engine `cardTargets(seat, pi, id)`; the page's targets ask it)
- **Symptom:** dragging a card onto a rubble space did nothing; rubble was only payable by tapping the space, then tapping cards, then Confirm.
- **Mechanism:** `computeTargets` put rubble/camp targets in the map only in `idle` mode; a dragged movement card aimed only at `reach()` targets for its symbol, and a "free" drag only knew "played above the hand line".
- **Root cause:** each gesture/mode computed its own idea of "where can this card go".
- **Design decision:** the tap flow and the drag flow were two mechanisms answering one question, each mode-specific. — tags: `DD-two-mechanisms`, `DD-rules-outside-engine`
- **Siblings:** A10; drag-to-buy (A24) adds a third drop meaning by mode; `720331d` also added `isDisc(tg)&&!UI.anim` — a rubble drop during an explorer animation silently falls through to `layoutCards()` (still `src/client/hand.js:171`), one more instance of playtest #29 ("second card ignored while explorer walks").
- **Recommended design fix:** one engine query "where can card X go now" (done in `c3891f7`) and one drop handler: dropping card X at point P = the target under P from that query, in every mode.
- **What we did:** **PARTIAL `720331d` → PARTIAL `c3891f7`** — `720331d` added rubble as a second target source and a new `discardFor` drag kind; `c3891f7` unified target computation in the engine, but the drop still branches by mode (`hand.js:140,170-172`) and is gated by the animation flag.
- **Ratchet:** nothing in `720331d`; `c3891f7` added `test/rules.test.mjs` checks for `cardTargets` (engine side only).
- **Assertion that would have caught it:** "on my turn, a card dropped on a space the engine lists for it is never silently ignored" — at drop (precondition: target in `cardTargets`; postcondition: an action or a mode change happened) — always-on cheap — fires on the first drag onto rubble, and on drops during animations — tags: `AS-input-never-dropped`

### A17 — Rubble/base-camp progress dots never went away (and their pulse never played)
- **Source:** found by Claude on 09-27 (`f77b242`: "Fix rubble / base camp progress dots never going away: they were added to a layer that was never cleared")
- **Commits:** `720331d` (introduced: pips appended to `L.aim`, while `renderTargets` clears only `L.hl`; `pulseDiscard` queries `L.hl`) → `f77b242` (09-27: own `L.pips` layer, cleared every render)
- **Same bug as:** B18 — the rubble/base-camp dots from `720331d`: B18 is the owner's report, fixed in `f77b242`, then derived from the mode in `0a6cba4`
- **Symptom:** after paying rubble, the progress pill stayed on the board; the "pop" on each added card never ran.
- **Mechanism:** drawn into one layer, cleared and looked up in another.
- **Root cause:** each render clears a hand-picked list of layers; anything drawn elsewhere lives forever.
- **Design decision:** views cleared and redrawn by hand per layer, instead of each view part owning and reconciling its own output. — tags: `DD-whole-rebuild`, `DD-ui-flags`
- **Siblings:** A14 (state that outlives its mode).
- **Recommended design fix:** each view part owns one container and renders from state (the 09-29 refactor's model: "each view part … writes only what changed").
- **What we did:** **PARTIAL** — `f77b242` added one more layer to the manual clear list; the 09-29 refactor (`b6b907c`/`0a6cba4`) later moved to owned view parts. → **ROOT** `0a6cba4` for this view (see B18: `updatePips()` derives the dots from the mode every frame).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "the progress pips exist only in `discardFor` mode" — per-frame view invariant — always-on cheap — fires on the first rubble payment — tags: `AS-view-matches-state`

### A18 — Market hover preview enlarges over the top bar
- **Source:** introduced by Claude in `7346c68`; reported in playtest 2026-09-30 #32 ("market hover preview overlaps Menu / badge clipped").
- **Commits:** `7346c68` (`#mkt .mslot:hover{transform:scale(1.9);z-index:6}`, origin `100% 25%`) — still `src/client/shell.html:243-244`
- **Same bug as:** P29 — the ×1.9 market hover preview from `7346c68`, reported in the playtest (#32)
- **Symptom:** hovering a market card scales it ×1.9 over the Menu button / top bar; its badge is clipped.
- **Mechanism:** a transform-based preview anchored at the card's top-right, with no space reserved for it.
- **Design decision:** (also the root cause) as A15: an element floated over others with no cell. — tags: `DD-float-over`
- **Siblings:** A15.
- **Recommended design fix:** a preview slot of its own (e.g. a fixed preview area left of the market column) sized to fit.
- **What we did:** **NOT FIXED**.
- **Ratchet:** nothing (`test/layout.cjs` checks controls at rest, not hover states).
- **Assertion that would have caught it:** "no two controls overlap, including hover/enlarged states" — layout test with hover — test tier — fires on the top-row card — tags: `AS-no-overlap`

### A19 — Sound: every failure swallowed; very first tap silent
- **Source:** found by Claude (the sound subagent's report, 2026-09-26 21:05: "every call is wrapped in try/catch, so missing audio never throws"; "First click: if the browser starts the context suspended, the very first tap is silent")
- **Commits:** `691366e` Add subtle synthesized sound effects (merged `cf2ec10`) → `1f52aaf` (09-28: audio context set up while idle, first tap only resumes it)
- **Symptom:** a known silent first tap; any sound bug would be invisible.
- **Mechanism:** `sfx()` wraps playback in `try{…}catch(e){}` (still `src/client/sound.js:64`); `ctx.resume().catch(()=>{})` (`sound.js:13`).
- **Root cause:** failures were designed to vanish.
- **Design decision:** swallowed errors as the default for "optional" features. — tags: `DD-silent-failure`
- **Siblings:** A28 (publisher errors to /dev/null), A33 (illegal actions patched), playtest #21 (42 empty catches; a socket close never answered).
- **Recommended design fix:** real checks only where failure is allowed (AudioContext unavailable), report everything else through the page boundary (docs/ASSERTIONS.md).
- **What we did:** **PARTIAL** — `1f52aaf` addressed the first tap (whether the first tap now sounds was not verified); the empty catch remains.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "no empty catch; every failure reaches the boundary" — lint (`test/lint.mjs` exists but checks undeclared names, not empty catches) — test tier — would flag at commit — tags: `AS-no-silent-catch`

### A20 — Explorer miniatures: chibi figures per seat, colour only on clothes
- **Source:** owner spec (2026-09-26 21:00: "we can have four different miniatures, one per color. It should be obvious what color they are, but still be pretty."); owner report (2026-09-26 21:08: "Those designs don't really sit well with me … They're too rounded."; 21:09: "And like I said, we only need one character per color. The color should be a part of the character, not just their clothes.")
- **Commits:** `bfcb9f1` (subagent: four chibi characters, `variant = seat % 4`, player colour on shirt/base/hat band) → `1cac13b` (four colours) → `84c0e92` (one explorer per colour, made of its colour, three styles) → `de0e989` (style D) → `b0fe4e0` (merged to main)
- **Symptom:** figures the owner found generic; the character depended on the seat, not the colour.
- **Mechanism:** the subagent was briefed to make "one per seat" (bfcb9f1's title); colour was applied to clothing.
- **Root cause:** the requirement was given at 21:00 ("four different miniatures, one per color"), six minutes before the subagent delivered `bfcb9f1` with `variant = seat % 4` over six colours (its report: "all 4 characters × 6 colours"). Whether the brief carried his words is unknown (the brief isn't in the record); either the brief lost it or the subagent's result wasn't checked against it before it was shown.
- **Design decision:** a spec relayed to a subagent in Claude's paraphrase rather than the owner's words. — tags: `DD-process`
- **Siblings:** A34 and A30 (other instances of acting on Claude's own framing instead of his).
- **Recommended design fix:** subagent briefs quote the owner's requirements verbatim and the result is checked against them before it's shown.
- **What we did:** **ROOT** for the mapping (`84c0e92`: figure chosen by colour, every part a shade of it); the process decision isn't changed by a code fix → counted **PARTIAL**.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no runtime assertion (a taste/spec match); the check is a pre-delivery review of the subagent's result against his quoted requirements — tags: `AS-none`

### A21 — AI input summarised the map instead of encoding every space
- **Source:** owner report (2026-09-26 21:25: "Make sure the AI is fully aware of the whole map …"; 21:29: "I'm not sure if you fully understand what I mean. Like, it should have the entire map, like every single piece, like every single square, it should know.")
- **Commits:** `5ac8261` (WIP bot: map binned by steps to El Dorado, 16 bins × 9 numbers) → `d7d41ce` (per-map network input: every space on the course + every connection) → `a3ea18a` (09-27: per-course board blocks for several courses)
- **Symptom:** the network couldn't see specific spaces, so it couldn't plan around them.
- **Mechanism:** `botFeatures` compressed the board into distance bins.
- **Root cause:** the input design was chosen before the owner's requirement was pinned down, and Claude's first reply didn't match what he meant (he had to restate it).
- **Design decision:** behaviour designed before it was specified. — tags: `DD-no-spec`
- **Siblings:** A26 (training design without a spec).
- **Recommended design fix:** write the input spec (what state a player can see) first, then derive features from it.
- **What we did:** **ROOT** (`d7d41ce` adds every space and connection; the owner chose per-map models at 21:33).
- **Ratchet:** assertion (pre-existing) — `botFeatures` throws if it writes other than `BOT_NF` numbers; nothing checks that every visible field influences the input.
- **Assertion that would have caught it:** no runtime property was violated (a spec mismatch); a test would: "changing any one space's terrain changes the network input" (perturbation test) — test tier — tags: `AS-none`

### A22 — Deploy broken: WIP bot code reassigned a `const`, Cloudflare's bundler refused it
- **Source:** owner report (2026-09-26 22:05: "It appears like you're stuck on something. What's wrong?"; 22:06: pasted the build log "✘ [ERROR] Cannot assign to "mode" because it is a constant … src/engine.gen.js:608")
- **Commits:** `5ac8261`/`d7d41ce` (WIP bot, `const mode=…; … mode='heur'`) → `b0fe4e0` (merged into main with the miniatures: "Bot code … included but not used by the page yet") → `6c5da55` (`const` → `let`; CLAUDE.md: run `npx wrangler deploy --dry-run`) → `0a6cba4` (09-29: worker bundle step in `test/run.mjs`)
- **Symptom:** the site stopped deploying; the owner saw the failure in the dashboard before Claude did.
- **Mechanism:** Node only throws on the assignment when that line runs (`mode==='net'` and no network), and no test called `botChoose`; esbuild (Cloudflare's bundler) rejects it statically.
- **Root cause:** (1) tests ran only in Node, never the production bundler; (2) unused WIP training code went into the production bundle: `build.mjs` concatenates `engine_bot.js` into `engine.gen.js` (worker) and the page, so every training tweak redeployed the site.
- **Design decision:** the real deploy path (esbuild, the live URL) wasn't part of testing, and WIP code shipped on main. — tags: `DD-untested-real-setup`, `DD-silent-failure`
- **Siblings:** A1 (deploy failures invisible); every later training commit rebuilt `public/index.html` (e.g. `873a35f`, `060ed90`, `eeb8e61`).
- **Recommended design fix:** the test runner always bundles the worker with wrangler's esbuild; training code is not part of the shipped bundle; the change loop verifies the live build hash (A1).
- **What we did:** **PARTIAL `6c5da55` → ROOT `0a6cba4`** for the bundler class (a failed bundle now fails `node test/run.mjs`, `test/run.mjs:23`); deploy observation (A1) still missing.
- **Ratchet:** test — `test/run.mjs` step `worker: npx wrangler deploy --dry-run` (from `0a6cba4`).
- **Assertion that would have caught it:** "the production bundle builds" (test) + "the live site reports the pushed commit" — test/process tier — the bundle test would have failed before the push — tags: `AS-deploy-landed`

### A23 — Training exploration left mechanisms unexplored (keep/trash/pay choices, Transmitter, not buying)
- **Source:** owner reports (2026-09-26 22:08: "Just go over the game, see the points that the bot could fuck up, that it just won't explore, and make sure that it explores them."; 22:41: "do you also do randomness with transmitting occasionally?"; 22:44: "The number shouldn't be that high at 25%"; 22:52: "Did you remember that not buying anything is an option?"); 22:10 (on Claude's explanation of the per-decision `buyEps`): "random buying is cut back to once per turn at most. You can only ever do one buy per turn, so what does that even mean?"; 23:06: "we need to track … how often the model chooses not to trash, what cards they choose to trash, et cetera. … Anything that needs to be tracked should have randomness in it."
- **Commits:** `873a35f` (random-buy exploration, per decision) → `ab4cace` (full option lists; forced buy once per turn) → `24be3b2` (forced Transmitter picks 25%) → `060ed90` (one exploration level; Transmitter 10%→2%, weighted to expensive) → `eeb8e61` (turns with buying off) → `985d508` (09-27: "gift cards instead of forced random buys / Transmitter picks")
- **Same bug as:** C1 — the self-play exploration built as per-mechanism tricks: A23 on 09-26, C1 the owner's 09-27 "the ways we were adding this in was a hack"
- **Symptom:** the learning bot could never try keeping a chosen card, removing a chosen card, paying rubble with particular cards, Transmitter picks, or skipping a purchase — so it could never learn their value.
- **Mechanism:** `botActions` (5ac8261) hand-pruned the legal moves: keep none / best one / best two by a fixed `botWorth`; trash only weakest-first prefixes; one hand-picked payment. Before `ab4cace`, `buyEps` fired per decision, not per turn.
- **Root cause:** the bot enumerated its own "legal" moves with heuristics built in, and each missing mechanism was patched as the owner named it.
- **Design decision:** exploration handled case by case (a flag per mechanism: `forceBuy`, `noBuy`, `forceTransmit`) over a bot-side move list, instead of exploring over the engine's complete legal-action set. — tags: `DD-per-element-patch`, `DD-rules-outside-engine`, `DD-process`
- **Siblings:** A33 (illegal bot actions patched); `botEndView` re-implements end-of-turn discards (`src/engine_bot.js:296`); the owner had to find two of the gaps himself after asking for the audit at 22:08.
- **Recommended design fix:** the engine exposes all legal actions; exploration is one uniform rule over that set (plus a per-mechanism usage report).
- **What we did:** **PARTIAL** — `ab4cace` made the option lists complete (real improvement), but each exploration gap got its own flag; `botActions` still lives in the bot (`src/engine_bot.js:41`). → **HACK** `985d508` (09-27: the forced Transmitter pick switched off with `transEps: 0`, not removed; see part G's additional report to A23) → **NOT FIXED** (see C1: the per-mechanism tricks are still the default).
- **Ratchet:** nothing (the progress page's "Never bought in this batch" is a report, not a check).
- **Assertion that would have caught it:** "every mechanism (each action type, keep 0-3, each purchase, not buying, Transmitter) is taken at least x% of the time in a self-play batch" — training health check per batch — test/tool tier — would have fired on the first batch — also catches A26/A27 — tags: `AS-training-health`

### A24 — Buying was click-only (annoying); the drag-to-buy that fixed it runs on flags and timers
- **Source:** owner report (2026-09-26 22:13: "it's just annoying to click on a card that you're trying to buy when you really just want to drag it.")
- **Commits:** `f72f961` Drag to buy (market drag, purchase slot, spending tray)
- **Symptom:** buying needed click → click cards → Buy, while everything else was dragged.
- **Mechanism:** the market only had click handlers.
- **Root cause:** each input gesture was implemented per surface; the market never got the drag the hand had.
- **Design decision:** one gesture system per surface (hand drag, market click) instead of one pointer model. — tags: `DD-two-mechanisms`, `DD-imperative-sequencing`
- **Siblings:** A16, A25; the new code's own traps: a `mdragJustEnded` flag cleared by `setTimeout(…,0)` to swallow the click after a drag (`src/client/market.js:103,118`), auto-confirm after `setTimeout(300)` (`src/client/actions.js:181-182`), and `buyFrom` valid for `Date.now()-at<3000` (`actions.js:142`).
- **Recommended design fix:** one pointer recogniser for all cards (tap vs drag decided once, by distance), feeding one "drop card on target" function.
- **What we did:** **PARTIAL** — the drag works (the annoyance is fixed), but it arbitrates click vs drag with a flag and timers, all still present.
- **Ratchet:** nothing in `f72f961`; later `test/flows.cjs` buys by tapping a market card and tapping cards to pay (lines 65-77), not by dragging.
- **Assertion that would have caught it:** product request, no violated property; for the implementation: "each pointer gesture produces exactly one action (never a drag and a click)" — input boundary — debug tier — tags: `AS-none`

### A25 — A card spent on a purchase leaves a hole in the hand
- **Source:** introduced by Claude in `f72f961`; reported in playtest 2026-09-30 #15 ("paid card leaves a hole in the hand").
- **Commits:** `f72f961` (introduced) — still `src/client/hand.js:38-49`
- **Same bug as:** P13 — the fan laid out by index over the whole hand, with the pay tray as an exception (`f72f961`), reported in the playtest (#15)
- **Symptom:** when a card moves into the spending tray, the fan keeps its slot empty.
- **Mechanism:** `layoutCards` spaces cards by index over the whole engine hand (`off=i-(n-1)/2`, n = hand length), and draws the paying cards in the tray as an exception inside the same loop.
- **Root cause:** one loop lays out two containers (fan and tray) from one index.
- **Design decision:** a special case inside the fan layout instead of deriving the fan from "the cards shown in the fan". — tags: `DD-per-element-patch`, `DD-float-over`
- **Siblings:** playtest #31 (buy-mode layout); the tray/slot positioned by magic numbers over the hand (`by=H-ch*1.02-14-bw*1.4-26`).
- **Recommended design fix:** partition first (fan cards, tray cards), lay out each list in its own space.
- **What we did:** **NOT FIXED**.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "hand cards in the fan are evenly spaced with no empty slot" — after layout, debug tier — fires on the first card paid — tags: `AS-view-matches-state`

### A26 — Training "fundamentally wrong": the net learned the heuristic's opinion and scored chance with one sample
- **Source:** owner report (2026-09-26 22:18: "My assumption is that there's something fundamentally wrong with the code that you wrote for the training, or the idea of how the training is going to do, or how the model works. Do some deep thinking about this."; earlier 21:59: "My worry is that the heuristic bot was so bad that it didn't train it to take any cards"; 22:26, on Claude's proposed scoring: "No, what the hell? … Each position is not scored as if the turn would end, because then you're always going to do the highest value thing first. You score each position based on what is your chance of winning the game."; 22:27: "you're only doing one move at a time, there's no end turn. The end turn is your final move. Draw does not pretend as if there's an end turn.")
- **Commits:** `d7d41ce`/`873a35f` (stage 0: targets = the heuristic's own opinion, `f.h = sigmoid(hm - ho)`; `CAP = 60` rounds) → `b3722de` (distillation targets, "experimental, superseded") → `9f3b07e` (end turn scored before the draw, draw cards averaged over 4 draws, self-play from scratch with TD(λ) and a horizon curriculum) → many later redesigns (09-27/28, e.g. `985d508`, `21d8679`)
- **Symptom:** training made no useful progress; the net didn't learn to buy.
- **Mechanism (from the diffs):** (1) the first targets were distilled from the weak heuristic; (2) `botChoose` scored "end turn" after `applyAction`, i.e. after one random next hand, and draw cards after one random draw — one sample of a chance node; (3) no curriculum, so early games rarely finished.
- **Root cause:** the method wasn't written down and checked against the research before coding; flaws surfaced only when the owner pushed.
- **Design decision:** training method built without a spec or a health check. — tags: `DD-no-spec`
- **Siblings:** A23, A27, A31, A32; the 09-28 owner request for a spec reviewed by a context-free subagent is the same fix applied late.
- **Recommended design fix:** a written training spec reviewed against the literature, and batch-level health checks that stop the run when learning stalls.
- **What we did:** **PARTIAL** — the scoring Claude first proposed (every position valued as if the turn ended there) was stopped by the owner at 22:26-22:27 before it was committed; `9f3b07e` (22:29) scores each action by win chance, only "end turn" before the draw, and fixed the concrete chance-node and target problems; later days kept redesigning (see 09-27/28), which shows the decision (no spec, no health checks) persisted.
- **Ratchet:** nothing (a pre-commit bug in `9f3b07e`, "a comment had swallowed three feature groups", was caught by the existing feature-count assertion — see chunk notes).
- **Assertion that would have caught it:** "win rate vs the baseline and the share of each purchase move in the right direction across iterations; alert when flat" — training health check — tool tier — would have fired within the first iterations — tags: `AS-training-health`

### A27 — Training included 2-player games
- **Source:** owner spec (2026-09-26 19:49: "You shouldn't be able to start a two-player game because two-player games have a different rule set."; 19:50: "You can start a two-player game, but auto-matching will not start until you have three. Unless you explicitly request to."); owner report (22:38: "Also, just to fully confirm, you're testing in both three-player and four-player and not two-player.")
- **Commits:** `d7d41ce` (self-play `np = rnd()<.2 ? 2 : …`) → `742838c` (3- and 4-player only; tests split 3p/4p)
- **Symptom:** ~20% of training games used 2-player rules (two explorers each), a different game from the one the AI was meant to play.
- **Mechanism:** the player-count distribution was a hard-coded guess in `gen.mjs`.
- **Root cause:** the training distribution wasn't specified, and the owner's 19:49 statement that 2-player games are a different rule set (recorded for quick match in HANDOFF after `a084c65`) wasn't carried over to the AI work 2 hours later.
- **Design decision:** behaviour never specified for training, and a known owner rule not applied beyond the feature it was said about. — tags: `DD-no-spec`, `DD-process`
- **Siblings:** A26; later playtest #22 (AIs only in First Expedition 3-4p) is the same scope decided late.
- **Recommended design fix:** one config of what the AI is trained for, read by training, testing and the page's `aiAllowed`.
- **What we did:** **PARTIAL** — `742838c` hard-codes 3/4 in `gen.mjs`; other tools choose player counts themselves.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "training games are drawn from the configured setups (3-4 players, the course)" — training health check at batch start — tool tier — tags: `AS-training-health`

### A28 — Training progress page stopped updating
- **Source:** owner report (2026-09-26 22:46: "when I go to the page that you linked me to, it doesn't seem to be updating anymore. The latest update was a long time ago."; 22:53: "Also make sure you didn't accidentally break the reporter.")
- **Commits:** `3e5d6c0` (publisher loop: `git commit --amend && git push -f` every 120 s, output to `>/dev/null 2>&1`) → `186e791` (every 5 s, push when the content changes, retry until a push succeeds)
- **Symptom:** the owner's progress link showed stale data.
- **Mechanism:** unknown — every git/push error was sent to `/dev/null`, so the cause can't be read from the record (hypotheses: the loop died with a restart, or a push failed).
- **Root cause:** the publisher discarded its own errors.
- **Design decision:** failures swallowed. — tags: `DD-silent-failure`
- **Siblings:** A19, A33.
- **Recommended design fix:** the publisher logs failures and the page shows "last successful publish" plus a visible error line.
- **What we did:** **HACK** — `186e791` shortened the interval and retries on failure; the errors still go to `/dev/null` and the cause was never identified.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "every publish attempt succeeds or reports why" — in the publisher loop — always-on — would have surfaced the first failed push — tags: `AS-no-silent-catch`

### A29 — AI games stall: hit the 25-round cap (explorer stranded before El Dorado)
- **Source:** owner reports (2026-09-26 23:04: "There also seems to be a long tail of problem heuristic because some games don't even finish when they hit 60. While most games finish at 18, there's probably some sort of other bug as well."; 23:09: "It should be a 25-turn cap because if you're not winning by turn 25, there's a bug."; 23:18: "look at the games that they're playing with the heuristic and see where they're messing up. Like you're saying, see a game that has that hit that hit 25 rounds and figure out how the hell did that happen?")
- **Commits:** `e9d7844` (25-round cap, stuck-game capture) → `5a9f309` (diagnosis: `botPaddles` "stranded-paddle guard", off by default) → `617db1c` (save capped games as replays) → `eb26a18` (09-27 `aiFinishGuard` safety net) → `8e06048` (09-30 `botCanRemove`: at least 4 cards and a finish card left) → `fd58188` (09-30 "stuck" explorers buy a card that opens the next step; route recomputed for their cards)
- **Same bug as:** C19, F30 — AI explorers stranded before El Dorado: A29 the 09-26 stalls, C19 the `aiFinishGuard` guards of 09-27, F30 the Witch's Cauldron fixes of 09-30
- **Symptom:** bot games that never finish; a bot standing next to El Dorado for ever.
- **Mechanism:** the planner removed (Scientist/Travel Log/base camp) its last cards able to enter the water/jungle finish, or followed a route (`botDist`'s cost map) whose spaces its cards couldn't enter ("the AI's route map assumes every space can be entered", `fd58188`).
- **Root cause:** the bot's model of movement and finishing is its own (`botDist` costs every enterable space as if any card could), separate from the engine's `reach`/rules, and the two disagree.
- **Design decision:** two systems answer "where can I go / can I still finish" — the engine and the bot's cost map. — tags: `DD-two-mechanisms`, `DD-rules-outside-engine`
- **Siblings:** A23 (bot-side move list), A31, A32; the 09-30 Witch's Cauldron deadlocks.
- **Recommended design fix:** plan over the engine's reachability for the cards actually owned (deck-aware reachability from the engine), so "stranded" is impossible by construction rather than guarded case by case.
- **What we did:** **NOT FIXED on 09-26 (diagnosis only; guard off) → HACK `eb26a18` → PARTIAL `8e06048` → PARTIAL `fd58188`** — each fix adds a guard for one stranding pattern (card floor, finish card, "stuck" mode); the separate cost map remains.
- **Ratchet:** test — `test/engine.test.mjs:91` "AI game did not finish" (added 09-27 `37cfd2e`), which caught the Witch deadlocks intermittently.
- **Assertion that would have caught it:** "every AI game finishes; an AI turn ends within N decisions; an AI never makes itself unable to finish" — engine test over every course + an always-on check in `aiStep` — fires in ordinary AI-vs-AI play (9 of 300 on Witch) — tags: `AS-ai-progress`

### A30 — "Improve the heuristic" done as CPU-heavy sweeps competing with training
- **Source:** owner report (2026-09-26 23:18: "When I say improve the heuristic, I don't want it to be too training intensive. We need to use the CPUs for actual training.")
- **Commits:** `e9d7844` (planner benchmark, parallel head-to-head) → `b4a60f2` (tunable planner + parallel h2h) → `5a9f309` (per-game diagnostics `trace.mjs`, `turns.mjs`: the approach he asked for)
- **Symptom:** parameter sweeps using the training machine's CPUs instead of studying failed games.
- **Mechanism:** head-to-head runs over all cores (`h2h.mjs` workers).
- **Root cause:** Claude chose its own approach to "improve the heuristic" (23:01) without confirming it; his instruction was to find mistakes in games.
- **Design decision:** a working-process choice (acting on Claude's framing of the task). — tags: `DD-process`
- **Siblings:** A20, A34.
- **Recommended design fix:** confirm the approach when a request is open-ended and shares a scarce resource; default to the cheapest diagnostic.
- **What we did:** **ROOT** for the instance (switched to game traces in `5a9f309`); process unchanged → **PARTIAL**.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no runtime property; a resource budget would (background jobs capped to N cores while training runs) — tags: `AS-none`

### A31 — Bot valued an arrived player's place wrongly (twice)
- **Source:** found by Claude (`b4a60f2`: "value a finished player by its locked-in place"; `7ca1876` 09-27: "About 7% of arrivals were overvalued, some counted as 1st that finished last")
- **Commits:** `b4a60f2` (arrived ⇒ place computed as final, tie-break by blockade count only) → `7ca1876` (09-27: final only once no one can still arrive that round; full tie-break incl. biggest blockade)
- **Same bug as:** B20 — the bot's copy of the end-of-game ranking; B20 is A31's second fix, `7ca1876`
- **Symptom:** the bot treated arriving as winning even when later players in the round could arrive and beat it on the tie-break.
- **Mechanism:** `botValue` re-implemented `endGame`'s ranking — without "players after me this round can still arrive" and without the biggest-blockade key.
- **Root cause:** placement rules copied into the bot.
- **Design decision:** rules duplicated outside the engine. — tags: `DD-rules-outside-engine`
- **Siblings:** A32, A10, A4 (a rules change must now be made in two places; `src/engine_bot.js:268-280` says "as endGame ranks").
- **Recommended design fix:** the engine exposes `settledPlace(gs, seat)` (or `placesIfEndedNow`), used by `endGame` and the bot.
- **What we did:** **HACK `b4a60f2` → PARTIAL `7ca1876`** — correct now, but still a copy.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "the bot's settled place equals the engine's final place for that game" — debug cross-check at game end in self-play — tool tier — fires in ~7% of arrivals — tags: `AS-matches-engine`

### A32 — Game results in training/benchmarks: a capped non-arrival could "win", then the last racer counted as a capped loss
- **Source:** owner report (2026-09-26 23:15: "When the cap hits 25, then if you can't make it to that, then you should be punished because right now you can still have been considered one if you make it one step away, but your opponent didn't."); then found by Claude (`19512be`: "only count a non-arrival as a loss when the game actually hit the 25-round cap (the last racer is always cut off)")
- **Commits:** `9f3b07e` (result = 0.8 × placement + 0.2 × distance lead, placement from `endGame`, which ranks non-arrivals by closeness — so at the cap the closest non-arriver scored as 1st) → `b4a60f2` (owner's fix, introducing a new bug: `fail = H>=25 && !p.fin`; `h2h.mjs` counted every non-arrival as capped) → `19512be` (3 minutes later: `capped && …`)
- **Symptom:** first, a capped game (nobody arrived by round 25) still gave a "win" to whoever was one step closer; then, after `b4a60f2`, every normal game's last player (who never arrives under the full-race ending) was scored 0 and counted as a "stuck" game, inflating stuck counts and deflating win rates.
- **Mechanism:** the tools inferred "lost at the cap" from `p.fin` instead of the game's actual end reason and places.
- **Root cause:** the game outcome was re-derived in each tool.
- **Design decision:** the same data computed in several places (engine `places`, gen.mjs, h2h.mjs, later seats.mjs). — tags: `DD-multi-source-truth`
- **Siblings:** A31; A29's stuck statistics depended on it.
- **Recommended design fix:** the engine records why a game ended (finished / capped) and the places; tools only read them (later `playout.mjs` in `f6fc404` began sharing one loop).
- **What we did:** **PARTIAL `b4a60f2` (fixed his case, broke another) → PARTIAL `19512be`** — `19512be` fixed the condition in two files; each tool still derives outcomes itself.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "a tool's win/loss for each seat is a function of the engine's result only (places, capped)" — debug cross-check in the shared game loop — tool tier — fires in every uncapped game — tags: `AS-matches-engine`

### A33 — Illegal AI or logged actions silently turned into "end turn"
- **Source:** found by Claude (09-29 `9deac13` for replays: "a log whose moves don't fit the game is refused … instead of patched by ending those turns"); the remaining tools found by code reading for this post-mortem.
- **Commits:** `5ac8261` (`botTurn`: `if(!r.ok){applyAction(me,{t:'end',keep:[]});break;}`; sim) → `d7d41ce`/`9f3b07e` (`gen.mjs`) → `3ab0316` (replay loader: failed moves ended the turn, with a toast) → `9deac13` (09-29 replays refuse) → site AI asserts (`src/engine_ai.js:101` `assert(r.ok,'aiStep: the AI chooses a legal action')`)
- **Same bug as:** E31 — the replay loader that ended the turns of moves that didn't fit (`3ab0316`), refused in `9deac13`; A33 also covers the training tools
- **Symptom:** none visible — which is the problem: a bot bug that chose an illegal action just looked like the bot ending its turn; a replay could show a different game than was played.
- **Mechanism:** a failed `applyAction` was patched with `{t:'end'}`.
- **Root cause:** failures treated as recoverable noise.
- **Design decision:** silent fallback instead of an assertion. — tags: `DD-silent-failure`
- **Siblings:** A19, A28; `3ab0316`'s swappable global RNG (`setRng`) had the same risk — callers had to remember `setRng(null)` around the bot's look-ahead or the replay would diverge (fixed by `bb4cc64`, randomness as a parameter).
- **Recommended design fix:** `assert(r.ok)` everywhere a bot or a log supplies an action; the boundary reports it.
- **What we did:** **PARTIAL** — replays refuse bad logs (`9deac13`) and the site's AIs assert (engine_ai.js:101), but `tools/ai/gen.mjs:136`, `tools/ai/record.mjs:33` and `tools/ai/golden.mjs:20` still convert failures into "end turn".
- **Ratchet:** assertion for the site's AIs (`engine_ai.js:101`); nothing for the training tools.
- **Assertion that would have caught it:** "an AI's chosen action is legal; a record's actions all apply" — precondition at every applyAction from a bot or a log — always-on cheap — would fire on any bot bug — tags: `AS-no-silent-catch`, `AS-record-replays`

### A34 — A result attributed to "seat effects" without evidence
- **Source:** owner report (2026-09-26 23:40: "Are you sure it had to do with seat results? Couldn't there just be a bug somewhere? Seat result seems particularly weird. What evidence do you have of it being seat result? When you vary the seats, does the result change?")
- **Commits:** `20c91ce` AI: paired seat test (same seeds, policy in each seat) + planner-only control (`tools/ai/seats.mjs`, deleted later in `f6fc404`)
- **Symptom:** Claude offered a cause for a net-vs-planner result that it hadn't tested.
- **Mechanism / root cause:** an explanation given before a controlled comparison; what the paired test then showed is unknown (not in the commit or the owner's messages).
- **Design decision:** a working-process failure (claims before evidence). — tags: `DD-process`
- **Siblings:** A20, A30.
- **Recommended design fix:** state a cause only with the control that tests it (paired seeds, seats swapped); otherwise say "I don't know".
- **What we did:** **PARTIAL** — `20c91ce` built the right control after being challenged; no rule makes it the default.
- **Ratchet:** nothing (the tool was deleted in `f6fc404`).
- **Assertion that would have caught it:** no runtime property; the practice is "no causal claim without a paired control" — tags: `AS-none`

## 2026-09-27 (morning)

### B1 — Replay controls vanish at some screen sizes; layout bugs keep coming back
- **Source:** owner report (2026-09-27 00:00: "At certain screen sizes, the replay thing doesn't even show up at all. You need to rethink how you're doing layout, because we keep having layout bugs. From first principles, there has to be a better way of doing layout so that we never have layout bugs. And separate the replay button from the score. You should be able to hide the score while keeping the replay button."). Follows his 09-26 23:47 report ("The replay is covered over by the alt cards in the same layout error as before"), which belongs to chunk A.
- **Commits:** `0c6a6f9` Replay panel fits the free space (09-26 23:54, chunk A: the JS-measured version) → `f0c51f3` Layout from first principles: page grid with separate cells for the game, replay dock and bot's view; container queries; layout test. Later siblings in the same area: `127544c` (09-29, player chips cut in half), `765f07e` (09-30, history panel width), `9e85226` (09-30, prompt box size).
- **Same bug as:** A15 — the replay panel floated over the game and placed by measurement: A15 has the 09-26 reports, B1 the 09-27 00:00 one; both fixed in `f0c51f3`
- **Symptom:** at some window sizes the replay controls were not visible at all; before that they covered the market cards; the bot's evaluation list ("score") and the replay buttons were one panel, so one could not be hidden without the other.
- **Mechanism:** the replay bar `#rbar` was `position:absolute` inside `#app`, floated over the game. `replayLayout()` (ui_replay.js before f0c51f3, removed in the diff) read `getBoundingClientRect()` of the market, the hand cards, the piles and the prompt on every render and on `resize`, then wrote `right/bottom/left/width/maxHeight` into the bar's inline style (with `Math.max(120, …)` as the floor), and pushed the zoom column away if they intersected. When the free rectangle was small or negative, the bar was placed off-screen or squeezed to nothing; the market's own sizing (`updateMktH`) and `setMkt` ran their own timers (`setTimeout(()=>replayLayout(),0)`), so the order of measurements decided where things ended up.
- **Root cause:** every floating control computed its own position from other controls' measured boxes, after the fact. Nothing reserved space; each new control added another "keep clear of X" rule, and the rules could not all be satisfied at small sizes.
- **Design decision:** game controls are floated over the board and over each other (`position:absolute` + JS measurement), instead of being given layout cells that cannot overlap — tags: `DD-float-over`, `DD-content-sized-layout`
- **Siblings:** chunk A's "replay covered by the alt cards" and 2047335 (09-26, market stack overlapping End turn); B2 (player chips clipped, introduced by this very fix); the market column that "steps aside" (`#mkt.cramped{display:none}`) at small sizes; design review 09-28 #11 ("A 44 px column of unreadable market cards covers the board"); playtest 09-30 #12 (prompt pill changes size), #13 (Undo/End turn jump), #14 (player bar jumps 51 px), #31/#32 (buy-mode layout, market hover preview overlaps Menu).
- **Recommended design fix:** what f0c51f3 did for the replay dock, applied to everything: every control lives in a grid/flex cell of fixed or slot size (a slot, not its content, decides its size); nothing is `position:absolute` over another control; no script measures other controls to place one.
- **What we did:** **PARTIAL** (`f0c51f3`) — for the replay UI the decision itself changed: `#shell` became a CSS grid with `#gamecell`, `#rside` and `#rdock` (shell.html lines 110–154 of the diff), `replayLayout()` and its resize listener were deleted, and the bot's view got its own toggle (`#rbA`, `REPLAY.side`) — the replay dock can no longer be covered. But inside `#app` the floating model stayed: the prompt keeps clear of the market through clearance variables (`--mktFoot`, `--zoomFoot`), `updateMktH` still measures `#discPile`/`#actBtns` with `getBoundingClientRect()`, and when nothing fits the market is just hidden (`#mkt.cramped{display:none}`). The later layout bugs listed under Siblings are that remaining half.
- **Ratchet:** test — `test/layout.cjs` (11 sizes × play/replay; off-screen and overlapping controls). Gap: its `vis()` skips anything `display:none`/`opacity:0`, so a control that disappears entirely (this report's exact symptom, or the cramped market) passes; and it exempts the player chips from the on-screen check (test/layout.cjs:41–42).
- **Assertion that would have caught it:** "every control the current mode offers is fully on screen and hit-testable, and no two controls overlap" — checked after every layout change (resize, mode change) — debug/test tier (reads layout; a ResizeObserver-driven check in `?debug`) — would have fired in an ordinary replay at the owner's window size, and on any phone — also catches B2, the cramped market, playtest #13/#32 — tags: `AS-layout-shift`, `AS-no-overlap`

### B2 — Player chips clipped: the third player hidden on phones and under "Market" in replays
- **Source:** found by Claude (design review, `4407efc` 09-28 09:49, in owner/2026-09-28.md item 5: "Hidden player on phones. The player strip is 160 px wide for 217 px of chips, so the third player can't be seen. In a replay at 1440 px the third chip is clipped under "Market".")
- **Commits:** `f0c51f3` (introduced: `#players{…flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}` at every size, previously only under 900 px) → `127544c` Top bar: player chips shrink instead of being cut in half (09-29 07:17)
- **Same bug as:** E22 — the player chips clipped in the top bar (`f0c51f3`), made to shrink in `127544c`
- **Symptom:** one player's chip (name, cards, blockades) is off the edge of the top bar with no visible scrollbar; in a replay (narrower game cell) the third chip sits under the Market button.
- **Mechanism:** f0c51f3 made the chip strip a horizontally scrolling row with a hidden scrollbar everywhere; the replay grid made the game cell narrower than the window, so the chips no longer fit and simply overflowed out of view.
- **Root cause:** the chips are content-sized (name + stats) and the strip had no rule for "not enough room" other than hiding the overflow; the layout test was written to exempt the chips ("the player chips may scroll sideways inside their strip").
- **Design decision:** content-sized chips in a strip whose overflow is hidden, and a layout test that exempts the element instead of asserting it — tags: `DD-content-sized-layout`, `DD-per-element-patch`
- **Siblings:** B1; playtest 09-30 #14 (player bar jumps 51 px when "Round N · final" appears: `#roundLbl` is a flex sibling of `#players`); `9e85226` (09-30, chips show what's public).
- **Recommended design fix:** give each seat a slot of fixed share (grid columns `repeat(n, minmax(0,1fr))`), with content that degrades inside its slot; remove the exemption from the layout test.
- **What we did:** **PARTIAL** (`127544c`) — chips now shrink (`flex:0 1 auto`, name ellipsis, container queries drop the card count then the AI tag): this instance is fixed properly, but the strip is still content-sized (`overflow:hidden`, chips sized by their text), so text changes still move it (playtest #14).
- **Ratchet:** nothing — test/layout.cjs:41–42 still skips the `chips` group in the on-screen check.
- **Assertion that would have caught it:** "every seat's chip is fully visible (not clipped by an ancestor) in every mode" — after layout changes — debug/test tier — would have fired in any replay at 1440 px and on any phone — the same property as B1's "every control the mode offers is reachable" — tags: `AS-no-overlap`

### B3 — Runtime CSS variable and `:has()` on `#app` restyle the whole board
- **Source:** found by Claude (profiling card selection on a phone profile during the front-end refactor, `0a6cba4` 09-29 01:39: "selecting a card restyled all ~3,800 board elements (a CSS variable set on the game area, and a :has() rule on it)")
- **Commits:** `f0c51f3` (introduced `$('#app').style.setProperty('--mktW',…)` in updateMktH and `#app:has(#mkt.hid),#app:has(#mkt.cramped){--mktFoot:16px}`) → `b6b907c`/`0a6cba4` (09-29: `:has()` replaced by a class `#app.nomkt`, CLAUDE.md rule "Never set a CSS variable on `#app` or use `:has()` on it at runtime", test/frames.cjs)
- **Same bug as:** E5 — E5's cause (b): the CSS variable and `:has()` on `#app` that restyle the whole board
- **Symptom:** stalls on ordinary actions (select a card, market show/hide); on a phone profile the longest task on select was 80–100 ms (0a6cba4 message).
- **Mechanism:** a custom property changed on `#app` (or a `:has()` on it that must be re-checked on every insertion in the game area) invalidates style for every descendant, i.e. ~3,800 board SVG/HTML elements.
- **Root cause:** layout clearance was passed as inherited CSS variables set on the root of the whole game, so a UI change about the market restyles the board.
- **Design decision:** UI state is written onto an ancestor of the board (CSS variables, classes, inherited properties like `cursor`) instead of onto the element that uses it; the board is not isolated from UI state — tags: `DD-board-inherits-ui-state`
- **Siblings:** B6 (grabbing cursor class on `#vp` restyles every board element on each drag start); B5 (SVG text re-laid out on every zoom step). Latent today: market.js:14 still toggles `#app.nomkt` (which changes `--mktFoot` on `#app`) on every market show/hide, and market.js:33 still does `setStyle($('#app'),'--mktW',…)`: the rule in CLAUDE.md is violated by current code. Hypothesis, not verified: this is the "market hide" hitch in playtest 09-30 #10.
- **Recommended design fix:** nothing the UI toggles may sit on an ancestor of the board: put clearance variables on `#prompt` (the element that uses them) or compute them in geometry.js; and isolate the board subtree (`contain: style` does not stop inheritance, so the real fix is "no inherited/custom property changes above `#vp`").
- **What we did:** **PARTIAL** (`b6b907c`/`0a6cba4`) — `:has()` on `#app` removed and a rule written, but the same commit kept a class on `#app` that changes a custom property there, and `--mktW` is still set on `#app` (market.js:14, 33).
- **Ratchet:** test — `test/frames.cjs` fails if select/move/cancel restyle more than 400 elements; market show/hide and drag start are not covered.
- **Assertion that would have caught it:** "an interaction restyles only the elements it is about (budget: a few hundred)" — per interaction, from the trace's `UpdateLayoutTree.elementCount` — debug/test tier — would fire on the first market toggle in a playthrough under `?debug` — also catches B6 and any future variable on `#app` — tags: `AS-dom-churn`, `AS-frame-budget`

### B4 — Process: regression-hunting and pausing training instead of profiling what the owner felt
- **Source:** owner report (2026-09-27 00:36: "Please don't do that. What the hell are you doing? Keep training the highest priority. You can get profiles. You're welcome to get profiles. You don't need to see if it was a regression or not. I don't care if it's a regression. I care about the fact that it's not smooth and it's annoying me. So we need to figure it out. So profile the latest round. See what's taking time.")
- **Commits:** none fix it as such; `2267837` (00:42) is the profile-driven follow-up and adds `test/perf.cjs --trace` to CLAUDE.md.
- **Symptom:** the owner reports jank; Claude's proposed next step (not in the repo; inferred from his reply — hypothesis, not verified) was to check whether it was a regression against an older build and to stop or slow the training job so measurements would be clean.
- **Mechanism:** unknown in detail (Claude's messages are not in the record). The subagent report at 01:26 notes "no process was reniced or killed" and that "the training job keeps load around 4.5–5.3 on 4 cores", which is consistent with the hypothesis.
- **Root cause:** treating "is it a regression?" as the question, when the owner's question was "why is it not smooth?"; and measuring in a headless, loaded container rather than in his browser (the 02:15 report: the grab-start hitch "doesn't show up in headless Chromium for either build"; "Couldn't verify … Whether blur and sharpening are visible on a real GPU. Safari trackpad pinch. Real touch pinch.").
- **Design decision:** a working process whose default diagnostic is comparison/bisect on Claude's machine, not a profile of the current build in the owner's setup — tags: `DD-process`, `DD-untested-real-setup`
- **Siblings:** B5 (the zoom delay he felt was measured headless under load), B6 (a grab-start stall that headless Chromium hid until a real phone showed it on 09-29, `276792f`, and `4316200` "Diagnostics for bugs only a real phone shows"); B10.
- **Recommended design fix:** for a smoothness report, the first step is a trace of the current build at the owner's size and a throttled profile, and a way for the owner to send a trace from his browser (`?debug` log, which only came on 09-29 in `4316200`/`ff1d3a9`).
- **What we did:** **PARTIAL** — profiling began at once (`2267837` with test/perf.cjs), but the real-browser gap was only addressed two days later (`4316200`).
- **Ratchet:** nothing for the process itself (CLAUDE.md gained the perf.cjs recipe, which is headless).
- **Assertion that would have caught it:** none possible for a process choice — **instead:** a frame-time budget reported from the owner's own browser (`?debug` slow-frame log with a "copy log" button) — tags: `AS-none`, `AS-frame-budget`

### B5 — Pan/zoom not smooth; zoom takes about a quarter second to start
- **Source:** owner reports (2026-09-27 00:36: "I care about the fact that it's not smooth and it's annoying me"; 01:00: "It feels a little bit like Zoom is still delayed. I'll start the Zoom and it will take a quarter of a second to start."; 01:03: "We should do Zoom the recommended way of doing Zoom … figure out why the recommended way is slow if it's slow … the statues might be causing the zoom to mess up"; 01:35: "I'm going to expect perfection from you. Look up other examples of people doing this"). Closed by 02:34: "It works amazingly. There is some blur, but I'm completely fine with blur."
- **Commits:** `2267837` Smoother pan, zoom and card drag (no live blur, static target rings, hover-clear flag, pointer capture) → `60332c6` Smooth grab and zoom (permanent GPU layer, HTML labels, no dead-zone jump) → `51637b2` back to the standard pan/zoom setup (reverted the layer and the labels; added test/zoomlag.cjs) → `3403a9a` Rendering checks (render.cjs) → `4f0c94d` WIP Leaflet-style pan/zoom → `f7f63a4` render check for the baked zoom → `44eeb54` (settle race, see B13) → `1accb75` notes. Later: `276792f` (09-29, phone zoom jump / touch-drag stall), `63c9433` (09-29, render test latency check switched from p95 to median).
- **Symptom:** dropped frames while dragging the board, dragging a card and zooming; the zoom visibly starts ~250 ms after the wheel/pinch begins; a 5 px jump when a drag began.
- **Mechanism:** several independent costs: (1) `backdrop-filter: blur()` on ~a dozen `.glass` panels over the board, re-blurred every frame the board moved (2267837: drag board 42 → 11 long frames); (2) pulsing SVG target rings and blockade halo (`animation: pulse … infinite`) repainting the board every frame; (3) `hideHover()` doing `L.path.innerHTML=''` on every hover-out, which re-laid out the SVG even when empty; (4) `#stage.moving{will-change:transform}` toggled on at each gesture and off 200 ms later, so each zoom began by creating a layer and re-rasterising the whole board (the ¼ s start); (5) 21 SVG `<text>` labels re-laid out on every zoom step (subagent 01:26: "The 21 SVG `<text>` labels are the one ingredient that decides zoom smoothness"); (6) a 5 px dead zone before the board followed the pointer.
- **Root cause:** the board was one live SVG under the whole page, and gestures changed things (layer promotion, scale of SVG text, hover DOM) that forced main-thread layout/paint/raster of the entire board, instead of moving an already-rasterised layer.
- **Design decision:** pan/zoom built ad hoc on a live SVG (layer created per gesture, text inside the scaled SVG, decorations animated inside the board) instead of the researched standard (Leaflet: a permanently composited layer that gestures only transform, zoom baked in once it settles, text outside SVG) — tags: `DD-whole-rebuild`, `DD-board-inherits-ui-state`
- **Siblings:** B3, B6, B7 (the vignette regression from the first attempt); B13 (bake timing race); 276792f (09-29, touch drag stall, "starts zoomed in, then zooms out"); 7dd059f (09-29, explorer walk looked like a slide on phones).
- **Recommended design fix:** exactly what 4f0c94d did: `#stage` permanently `will-change: transform`, gestures only write its transform, one bake into `#bscale` when zooming stops, text in HTML label layers; plus the CLAUDE.md bans (no backdrop-filter over the board, no infinite animations on board SVG).
- **What we did:** **PARTIAL `2267837` → HACK/regression `60332c6` → revert `51637b2` → ROOT `4f0c94d`+`44eeb54`** — 2267837 removed real causes (blur, pulses) but added a flag (`hoverShown`) to skip clearing an empty group; 60332c6 had the right idea (permanent layer, HTML text) but implemented it as unreviewed workarounds (the `::after` cursor overlay broke the vignette, B7, and the manual `willChange='auto'` flip on a 250 ms timer); 51637b2 reverted to toggled `will-change` and SVG text, which is exactly the ¼ s zoom-start the owner reported at 01:00; 4f0c94d adopted the Leaflet model after research, and the owner approved it (02:34). The current camera.js keeps it (camera.js:17–31). The decision changed; a new gesture can't reintroduce a per-gesture re-raster without breaking render.cjs.
- **Ratchet:** test — `test/render.cjs` (grab/release pixel-identical, zoom baked after settle, wheel latency), `test/perf.cjs` (manual), CLAUDE.md rules. render.cjs runs only under `run.mjs --full`, and its latency threshold was loosened to the median in `63c9433` because p95 "swings 90-240 ms between runs, old builds too" (the test was changed, not the code).
- **Assertion that would have caught it:** "no gesture frame exceeds 25 ms and the first zoom frame follows the first wheel event within one frame" — per gesture, from a rAF frame log and the wheel event's timestamp — debug/test tier (`?debug` slow-frame log; perf.cjs with CPU ÷4) — would have fired on the first zoom in an ordinary game on a slower laptop — also catches B6, B3, playtest #7/#9 frame drops — tags: `AS-frame-budget`

### B6 — Grab start stalls: the grabbing cursor restyles every board element
- **Source:** found by Claude (test/perf.cjs "grab starts", 60332c6 message: "the grabbing cursor restyled every board element"); came back on phones and was re-found on 09-29 (`276792f`: "A touch drag no longer adds the grabbing-cursor class (an inherited property: it restyled every board element at the start of each drag). Touch grabs, worst frame in the first 150 ms (phone, CPU /4): median 33 ms -> 17 ms, max 67 -> 17").
- **Commits:** `60332c6` (cursor moved to an overlay `#vp::after` — HACK, caused B7) → `51637b2` (reverted to `#vp.drag{cursor:grabbing}`, knowingly reintroducing the restyle) → `276792f` (09-29: class only for `pointerType === 'mouse'`)
- **Same bug as:** E5 — E5's cause (a): the grabbing-cursor class that restyles the whole board at drag start
- **Symptom:** a hitch in the first frames of every board drag (worst frame 50–67 ms under CPU ÷4, 60332c6 message).
- **Mechanism:** `v.classList.add('drag')` on `#vp` changes `cursor`, an inherited property, so Blink recomputes style for every descendant (the whole board).
- **Root cause:** the cursor is set on an ancestor of ~3,800 board elements.
- **Design decision:** UI state is written onto an ancestor of the board — tags: `DD-board-inherits-ui-state`, `DD-per-element-patch`
- **Siblings:** B3 (CSS variable / `:has()` on `#app`); B5.
- **Recommended design fix:** set the grabbing cursor on an element that has no board descendants (e.g. a sibling overlay element that only exists for the cursor, placed as its own layer, not the vignette), or use the pointer-capture target; one rule: nothing toggled on `#vp`/`#app`.
- **What we did:** **HACK `60332c6` → reverted `51637b2` → HACK `276792f`** — the current code keeps the restyle for mouse drags and skips it for touch with a device `if` (camera.js:116–117: "the grabbing cursor: mouse only (the class change restyles every board element, a stall at the start of a touch drag)"; shell.html:147 `#vp.drag{cursor:grabbing}`). Desktop drags still restyle the board: NOT FIXED there.
- **Ratchet:** nothing — test/frames.cjs does not trace a drag start; perf.cjs "grab starts" is a manual measurement.
- **Assertion that would have caught it:** "an interaction restyles only what it is about" (same budget as B3) — per interaction start — debug/test tier — would fire on the first drag of a playthrough — tags: `AS-dom-churn`, `AS-frame-budget`

### B7 — Board colours change while dragging
- **Source:** owner report (2026-09-27 01:03: "There's another bug that I noticed. When you click and drag, some of the colors change in the background.")
- **Commits:** `60332c6` (introduced) → `51637b2` Fix board colours changing while dragging; `3403a9a` (render.cjs check 1: grab/release pixel-identical)
- **Symptom:** during a drag the board edges, the El Dorado glow and the start spaces darkened, and went back on release.
- **Mechanism:** 60332c6 added a second rule for `#vp::after` (`content:'';…cursor:grabbing;display:none` and `#vp.drag::after{display:block}`) to show a grabbing cursor via an overlay; `#vp::after` was already the board's edge vignette. The cascade merged the two rules: the vignette was now hidden normally and shown during every drag (51637b2 message).
- **Root cause:** a pseudo-element with an existing job was reused for a second job; CSS lets two rules for the same element merge silently.
- **Design decision:** a workaround chosen to dodge a cost (B6) without looking at what the element already did; one element, two owners — tags: `DD-per-element-patch`, `DD-process`
- **Siblings:** B6 (the cost it tried to dodge); B8 (owner's objection to workarounds).
- **Recommended design fix:** one owner per element (a lint: no selector for the same element/pseudo-element declared in two rules with conflicting `display`/`content`), and fix B6 at its decision rather than with an overlay.
- **What we did:** **ROOT for this instance** (`51637b2`) — the overlay rule was deleted; the render check that followed (3403a9a) asserts a grab changes no pixel, which would catch any recurrence of "a drag changes what the board looks like".
- **Ratchet:** test — `test/render.cjs` check 1 ("grabbing the board changes nothing visually (drag away and back while holding: pixel-identical)"); runs only with `run.mjs --full`.
- **Assertion that would have caught it:** "grabbing or panning the board changes no pixel of the board except its position" — at each drag start (screenshot diff) — test tier — would have fired on the first drag after 60332c6, before the owner saw it — also catches any drag-state CSS leaking into the board's look — tags: `AS-visual-continuity`

### B8 — Process: papering over bugs and building workarounds instead of the well-trodden way
- **Source:** owner reports (2026-09-27 00:56: "Don't add that. Figure out why it's not moving in. That's a bug. Don't paper over the bug."; 01:03: "I prefer if you didn't implement fancy workarounds unless we absolutely needed it to. There might be some sort of fundamental reason why the recommended way isn't working. See if you can figure that out. In general, prioritize the common and well-implemented workflow."; 01:38: "Wait, if these other libraries do this, why aren't we using those libraries?")
- **Commits:** `60332c6` (the workarounds he objected to: cursor overlay, two stacked SVGs, manual `willChange` flip); `51637b2` (reverted them; CLAUDE.md: "Prefer the standard, well-trodden way; if it's slow, find out why and fix the cause (or tell the owner) instead of adding workarounds"); `10dc640`, `de5d42d` (library rule); `4f0c94d` (the researched Leaflet model).
- **Symptom:** the owner had to stop proposed patches (00:56, what "that" was is not in the record; see B9) and reject hand-made rendering tricks (01:03).
- **Mechanism:** fixes chosen to make a measurement pass (60332c6's numbers) rather than from how the problem is normally solved; one of them caused B7.
- **Root cause:** no step of "how do established libraries/apps solve this?" before inventing; success judged by a headless metric.
- **Design decision:** working process — invent a fix and measure it, instead of research the standard approach and find why it's slow here — tags: `DD-process`
- **Siblings:** B7, B5 (60332c6 → 51637b2 → 4f0c94d), B9 (the AI "not moving in" patch he refused), B21 (a hang "fixed" with caps).
- **Recommended design fix:** before any fix, name the root cause in one sentence and the standard solution; if the fix adds a special case, stop and report.
- **What we did:** **PARTIAL** — the rule went into CLAUDE.md (51637b2) and was followed for pan/zoom (4f0c94d after researching Leaflet/d3-zoom), but later chunks still show caps, flags and device `if`s (B6's 276792f, B21's 6f1fc88).
- **Ratchet:** nothing (a written rule only).
- **Assertion that would have caught it:** none possible (a working-process choice) — **instead:** a review checklist on every fix commit: "root cause in one sentence; is this a timer/flag/cap/special case?" — tags: `AS-none`

### B9 — The AI hovers next to El Dorado instead of arriving
- **Source:** owner report (2026-09-27 00:56: "Don't add that. Figure out why it's not moving in. That's a bug. Don't paper over the bug.") — the link to this bug is a hypothesis, not verified: the message came two minutes before `fad1a86`, whose message describes exactly an AI that does not move in, and the owner had been watching the net's replays (09-26 23:43–23:58).
- **Commits:** `fad1a86` AI training: no samples after a player has arrived → `7ca1876` (03:53, samples arrived-but-unsettled positions again, see B20)
- **Symptom:** a network bot standing next to El Dorado stays there instead of stepping in when it would arrive in a low place.
- **Mechanism:** self-play kept recording training samples after a player had arrived; the network cannot tell arrived places apart from its features, so it predicted the average (e.g. 0.29 for a locked 3rd place worth 0.125). TD(λ) bootstrapped the moves before arriving through that guess, so "arrive 3rd" (exact 0.125 at play time) looked worse than "hover" (bootstrapped value).
- **Root cause:** the value of an arrived player was answered by two mechanisms: play used the exact place value (`botValue`), training used the network's guess.
- **Design decision:** the same quantity (value of a position) computed by different code in play and in training targets — tags: `DD-two-mechanisms`, `DD-multi-source-truth`
- **Siblings:** B20 (the place itself was computed by a copy of the ranking, and too early); B11 (within-turn values inconsistent between consecutive decisions).
- **Recommended design fix:** one function `positionValue(gs, seat)` used by play, search leaves and training targets alike (exact where the outcome is decided, network otherwise), so targets can't differ from what play believes.
- **What we did:** **PARTIAL** (`fad1a86`) — the trajectory stops at arrival so the λ-return starts from the exact result (tools/ai/gen.mjs), which aligns training with play for this case; three hours later `7ca1876` found play itself was wrong about when a place is exact and re-added some post-arrival samples, i.e. the area was patched again.
- **Ratchet:** nothing — no test checks that training targets for decided positions equal the exact result.
- **Assertion that would have caught it:** "for any position where a player's final place is decided, the training target equals botPlaceValue(place)" — in gen.mjs when a sample is emitted — always-on (cheap) in the training tools — would fire in the first self-play batch — also catches B20 — tags: `AS-matches-engine`

### B10 — Process: long runs and experiments with no visible progress
- **Source:** owner reports (2026-09-27 01:15: "Are you sure you didn't get stuck? Because you've been running for a while."; 01:53: "Why are there no games yet? How long does each game take to play?"; 07:09: "I just want quick results. I want you to give me a link that reports after every game."; 07:22: "The test of DeepSearch seems to have stalled out.")
- **Commits:** `500c41e` (01:49, live search-table report game by game), `aedbec6` (02:09, per-game report), `cdca339` (07:11, live DEEP.md)
- **Symptom:** the owner could not tell whether Claude or an experiment was stuck; the 5-seconds-per-move search experiment produced nothing for a long time.
- **Mechanism:** foreground commands blocked replies; experiments reported only at the end; each search game was many minutes long (5 s × every decision × every seat) and nobody estimated that up front.
- **Root cause:** reporting designed as a final summary; no expected-duration estimate given with a started job.
- **Design decision:** batch-style experiments whose first output is their result — tags: `DD-process`
- **Siblings:** B21 (a real hang that looked like "slow"); B4.
- **Recommended design fix:** every job publishes one line per finished game and a heartbeat, and its start message states the expected time to first result.
- **What we did:** **PARTIAL** — per-game live reports were added for each experiment one by one (500c41e, aedbec6, cdca339), not as a shared rule; the heartbeat that would tell "slow" from "hung" never came (B21 took until 18:30).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "an AI job makes progress: a game finishes (or a heartbeat line is written) within N minutes" — in the runner — always-on in tools — would have fired for the deep-search hang within minutes — tags: `AS-ai-progress`

### B11 — The AI buys first and gives up a free move; its values jump between consecutive decisions of one turn
- **Source:** owner reports (2026-09-27 02:00: "They have two options within a turn. They can either spend two gold to buy something and move one with green, or spend one gold and two other cards to buy the same thing and not move. There's no disadvantage to moving, so they should have done the other one. My guess is that it's a search bug."; 07:32: "The problem here is that the option of Y wasn't even showing up in the top five moves at all. It was below 20%. It was like really low. And then the next move, it's suddenly like this is the right move to do.")
- **Commits:** `cd7ead0` whole-turn planner (experiment) → `83da069` search in the training loop → `961f83e` MAXBACK within-turn max backup (message: "The plain network valued 'move first, buy next' at 19% while the same line scored 55% one step later (habit: it always buys first)") → `3e8b156`/`c6f13b7`/`981a8bd` TreeStrap (stopped, −50 Elo) → `2ecfd21` DISTILL (search distillation) → `68a5833` promote first-distill-22 → `7e0bcd1` (09-28, the network without search retired from the site; site AIs play through the planner)
- **Same bug as:** D26 — the greedy one-action-at-a-time network policy: B11 found in training, D26 the owner seeing it on the site as Orellana (that his "weird stuff" is this misplay is a hypothesis); both closed for play by `7e0bcd1`
- **Symptom:** the bot pays with the green card it needed for a free move, and the value it gives a line of play changes from 19% to 55% one decision later with nothing random in between.
- **Mechanism:** the plain bot chooses one action at a time by the network's value of the resulting position; within a turn the network had learned from what it actually did next (it always bought first), so it undervalued intermediate positions of lines it never played.
- **Root cause:** the decision unit (one action) is smaller than the unit that matters (a whole turn, which has no randomness until the draw), and TD targets followed the habitual continuation, not the best one.
- **Design decision:** a greedy per-action policy whose value of mid-turn positions is learned from its own habits — tags: `DD-unvalidated-model`
- **Siblings:** B9 (targets that disagree with play), B16 (the planner's first version judged wrong cards after a buy), SUMMARY.md "move-first test position".
- **Recommended design fix:** choose a whole turn at once (enumerate/beam over the turn's action sequences, score only turn-end positions), and train mid-turn positions toward the best completion — which is where the project ended up.
- **What we did:** **PARTIAL `961f83e` → ROOT for play `68a5833`/`7e0bcd1`** — MAXBACK changed the training target to the best next option (about even in head-to-head, README "first-qmax"); search distillation (2ecfd21) trains mid-turn positions toward the planner's best completion (+41 Elo); and the shipped AIs (engine_ai.js:10–14) all decide through the whole-turn planner, so a player on the site no longer sees the greedy mistake. The network alone still carries the bias (TreeStrap "fixed the move-first bug partly (17% → 44% vs 59%)", SUMMARY.md).
- **Ratchet:** nothing automatic — the "move-first test position" is a manual check in the notes; test/fixtures/features.json (golden.mjs) only pins features and values for refactors.
- **Assertion that would have caught it:** "within a turn, the value of the best continuation does not drop or jump by more than ε between consecutive decisions (no randomness in between)" — after each AI decision — debug/test tier (costs a second evaluation) — would have fired in the first recorded AI game — also catches B16 (a planner whose prediction differs from the real state after its own line) — tags: `AS-model-contract`

### B12 — Process: the background agent and the main agent shared one working tree
- **Source:** found by Claude (subagent hand-back 02:15: "By the time I went to commit, they had already been committed and pushed to origin/claude/sweet-ptolemy-fisqdw by other commits in this shared working tree: f7f63a4 (render.cjs) and 44eeb54 (ui_view.js plus the rebuilt outputs)"), after the owner asked at 01:54: "I'd prefer if you did it on a background thread, though."
- **Commits:** `f7f63a4` WIP render check; `44eeb54` "WIP (not deployed): rebuilt outputs for the turn planner; rendering fixes in progress" (contains the settle fix of B13 under a turn-planner message)
- **Symptom:** a rendering fix and a test change landed in commits whose messages describe other work; engine outputs rebuilt by one agent carried the other's WIP.
- **Mechanism:** two agents edited and committed in the same checkout; `git add`/`node build.mjs` by one swept up the other's edits.
- **Root cause:** no isolation between concurrent agents.
- **Design decision:** concurrent agents in one working tree — tags: `DD-process`
- **Siblings:** every "fix hidden in a commit that says something else" the post-mortem has to dig for.
- **Recommended design fix:** each background agent in its own git worktree/branch, merged by the main agent.
- **What we did:** **PARTIAL** (editor: first classified as a later root fix, date not checked; the branch dates contradict it, see verify.md) — the repository now has per-agent worktree branches (`worktree-agent-a2e922ac16ef3adc1`, …), which is the isolation; in this window nothing was changed. But the oldest of them (`worktree-agent-a67f3cbb16c1c3484`, tip 09-26 21:04) predates this incident, so worktrees were already available and simply not used for this agent; later agents used them (tips up to 09-29 08:27), but isolation depends on how each agent is launched and nothing enforces it.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** none possible in the product — **instead:** a pre-commit check that the staged files are only those the committing agent touched — tags: `AS-none`

### B13 — The zoom bake could fire in the middle of a glide or a new grab
- **Source:** found by Claude (subagent's review of the Leaflet WIP, hand-back 02:15: "ui_view.js `settle()` now checks again, inside its animation frame, whether a glide or grab has started. If one has, it waits instead of baking the zoom in the middle of a transition.")
- **Commits:** `4f0c94d` (introduced) → `44eeb54` (fix)
- **Symptom:** (would have been) a visible jump or a change of sharpness mid-glide when the scale is moved from `#stage` to `#bscale` while a CSS transition is running on `#stage`.
- **Mechanism:** `settle()` is a 250 ms `setTimeout` that checked `gesturing||gliding`, then scheduled the bake in the next `requestAnimationFrame`; a grab or glide could start between the check and the frame.
- **Root cause:** whether the camera is idle is inferred from a timer and two flags set by other code, checked at one moment and acted on at another.
- **Design decision:** correctness depends on timer/rAF ordering (`setTimeout(settle,250)`, `glide.t=setTimeout(…,480)` instead of `transitionend`) — tags: `DD-imperative-sequencing`
- **Siblings:** the glide end is also a fixed 480 ms timer (camera.js:64–65), not the transition's end event; B5.
- **Recommended design fix:** a camera state machine (idle / gesture / glide / baking) with transitions driven by events (`pointerup`, `transitionend`), and the bake as the action of entering idle — no re-check needed.
- **What we did:** **HACK** (`44eeb54`) — the same condition is checked a second time inside the rAF (camera.js:28–30 today: "a glide or grab may have begun since the timer fired"); the timer design stands.
- **Ratchet:** test — `test/render.cjs` checks the bake happens (6b: one bake after a pinch stream; 6c: bake after the fit glide), not that it never happens mid-transition.
- **Assertion that would have caught it:** "a bake happens only when no pointer is down and no transition is running on #stage" — precondition at the bake — always-on cheap assert (`assert(!cam.pointers && !gliding, 'bake: the camera is idle')`) — fires only in the rare timing case, so in ordinary play maybe never; a replayed input trace would — tags: `AS-view-matches-state`

### B14 — Four-way test report: win rates that don't add up to 100%
- **Source:** owner report (2026-09-27 02:22: "It should show all of their win rates, like the heuristics win, because it needs to sum up to 100. So I don't know how it sums up to 100, just because you tell me one of their win rates.")
- **Commits:** `59d12cb` (introduced the table: "wins vs fair share" per player, 3- and 4-player tables mixed) → `b6e1569` Four-way test reports every player's share of the wins per table size
- **Symptom:** the progress page showed a ratio per player ("vs fair share" 1.00 = fair) pooled over 3- and 4-player tables, so the owner could not read who won how often.
- **Mechanism:** `vsFair = wins / Σ(1/n)` pooled over table sizes; the heuristic only sits at 4-player tables, so shares were not comparable and did not sum to anything.
- **Root cause:** the metric was chosen by Claude without the owner's question ("who wins?") written down.
- **Design decision:** report numbers defined ad hoc per experiment — tags: `DD-no-spec`
- **Siblings:** B15 (a comparison that measured the wrong thing); `e15fed2` (09-27 18:15, the ladder listed one network under two names).
- **Recommended design fix:** one reporting module for all AI experiments that prints raw counts (games, wins per player per table size) and derives every ratio from them.
- **What we did:** **ROOT for this report** (`b6e1569`) — per table size, each player's wins / games, which sums to 100% minus unfinished games; the next reports (ladder, 96a2c58) use fitted ratings from logged games.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "per table size, the reported win shares plus unfinished games sum to 100%" — in progress.mjs when writing the table — always-on in tools — would have fired on the first four-way table — tags: `AS-training-health`

### B15 — Search training looked like it was getting worse: the progress test measured search, not training
- **Source:** owner reports (2026-09-27 02:24: "I want you to do an audit of all of the logic here involved because there might be some sort of logic error that's causing this."; 02:29: "So it's been steadily getting worse since we started running it."; 04:23: "There's something ducky going on. Try comparing the old net with search added compared to the new net"; 04:30: "I thought you tested before and found that search massively improved it."; 04:43: "If training isn't helping, then just go back to the original method of training."; 06:49: "Wait, the current training is not using search?")
- **Commits:** `83da069` (search in the training loop) → `59d12cb` (four-way test: new+search, new plain, old plain, heuristic) → `f7dd7ed` (mixed plain seats) → `7fdc12d` (mixing opt-in) → `6871a25` versus.mjs → `d445ee0` four-way test seats the old net with search too → training returned to plain self-play (first-td2 README) → `96a2c58` model ladder (09:04)
- **Symptom:** the owner saw the new network's lead shrink run after run and could not tell whether training helped.
- **Mechanism:** the headline comparison was "new net + search" against "old net without search", so it measured search's large gain (versus.mjs, 768 games: "old 252 vs 156 wins, new 214 vs 149") plus training; a flat or declining training effect was hidden inside a number dominated by search.
- **Root cause:** the test changed two variables at once (network and search) and reported one number.
- **Design decision:** progress measured against whatever opponents were at hand (heuristic, old plain net) instead of like-for-like head to head — tags: `DD-no-spec`
- **Siblings:** B14; SUMMARY.md lesson 3 ("Measure head to head, not against the heuristic. The heuristic test hid a +100 Elo gain and made two worse methods look better"); `e15fed2` (ladder counted one net as two players).
- **Recommended design fix:** one rating ladder where every network plays with and without search against every other, ratings fitted over all games, and one promotion rule — what 96a2c58 built.
- **What we did:** **PARTIAL `d445ee0` → ROOT `96a2c58`** — d445ee0 compared like with like (new+search vs old+search); the ladder later made that the only measure (SUMMARY.md "Promotion rule"). The owner's suspected "logic error" in the reward was separately real (B20). Counted **PARTIAL** (editor, see verify.md): the heuristic proxy still drove decisions after the ladder (`21d8679`, 09-28: the round cap goes up "only once the network beats the heuristic (1.15x, 2 tests in a row)"; `tools/ai/loop.sh:49` still reads `vsFair`), as C2 records, and nothing fails when the proxy and the ladder disagree.
- **Ratchet:** nothing automatic (the ladder is a tool the process relies on, not a check that fails).
- **Assertion that would have caught it:** none possible as a runtime property — **instead:** a rule in the experiment runner: a comparison may differ in exactly one factor, and every table prints that factor — tags: `AS-none`

### B16 — Look-ahead copies of the game shared the card table, so the planner judged the wrong cards after a buy
- **Source:** found by Claude (the audit the owner asked for at 02:24; dd369c4: "planner predictions diverged from reality in 53/182 turns (always after a buy) → 0/183 with the fix"). The owner's 07:06 "Previously, we had a bug in our implementation" refers to it (hypothesis).
- **Commits:** `d7d41ce` (09-26, botClone with a shared `cards` table: "look-ahead only ever adds new ids, which the real game later overwrites") → `5706295`/`cd7ead0` (introduced the bug: searches that keep several branches alive) → `dd369c4` Fix: look-ahead copies of the game shared the card table
- **Symptom:** the whole-turn planner (and turn search) made worse plans after any purchase; the planner on the frozen net won 27.5% instead of 41% (dd369c4 message), which also skewed the search-training experiment (B15).
- **Mechanism:** `botClone` copied most of the state but shared `st.cards` (id → type); each branch that bought something created a card with the same next id and overwrote the others' entry, so kept branches saw the last-written type.
- **Root cause:** a hand-written partial copy whose correctness depended on an assumption about its callers (one branch at a time), written as a comment and never checked; the next caller (beam search) broke it.
- **Design decision:** a hand-maintained structural clone of mutable game state with a shared table — tags: `DD-global-state`
- **Siblings:** any future mutable field added to the state that `botClone` forgets (botClone must list every field `applyAction` can change: engine_bot.js:284–292); the planner cache that is module-global (engine_ai.js header: "the cache is module-global and a server isolate runs many rooms").
- **Recommended design fix:** clone by construction (`structuredClone`, or an engine whose state is immutable per action / copy-on-write), or at least one clone function derived from the state schema that tests check against `applyAction`.
- **What we did:** **PARTIAL** (`dd369c4`) — `cards:{...st.cards}` added to the copy; `botClone` is still a hand-written list (engine_bot.js:284–292).
- **Ratchet:** nothing — the 53/182 audit was a one-off; no test runs `applyAction` on two clones and checks independence.
- **Assertion that would have caught it:** "applying an action to a clone never changes the original or another clone" and "a planned line, replayed on the real state, reaches the state the planner predicted" — in tests (engine test tier: clone, apply different buys, compare) and as a debug check after each AI turn — would have fired on the first AI turn with a buy — also catches B11's prediction jumps — tags: `AS-engine-invariant`, `AS-matches-engine`

### B17 — Four-way test seats did not rotate evenly across workers
- **Source:** found by Claude (dd369c4 message: "Also: four-way test seats rotate evenly across workers.")
- **Commits:** `59d12cb` (introduced) → `dd369c4` (fix)
- **Symptom:** in the four-way table some policies sat in the same seat positions more often than others (seat order matters in this race game), biasing the shares shown to the owner.
- **Mechanism:** each worker thread computed seats from its local game index `g`, so every worker repeated the same first rotations.
- **Root cause:** a per-worker loop index used as a global game index.
- **Design decision:** each tool/worker runs its own copy of the game loop and seat assignment — tags: `DD-multi-source-truth`
- **Siblings:** `f6fc404` (09-29: "Tools share one seeded game loop") — the later consolidation (not verified that it covers seat rotation).
- **Recommended design fix:** one seeded game-loop module that assigns seats from a global game number for every tool.
- **What we did:** **PARTIAL** (`dd369c4`) — `gi = wi * games + g`; the decision (per-tool loops) changed only later (f6fc404, hypothesis).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "over a test run, each policy occupies each seat position equally often (±1)" — at the end of the run — always-on in tools — would fire in the first run — tags: `AS-training-health`

### B18 — Rubble / base-camp progress counter never goes away
- **Source:** owner report (2026-09-27 02:54: "I noticed one bug: when you fill a rubble spot and when you fill a removal spot, they have a progress counter, but that progress counter never resets when you finish it or leave.")
- **Commits:** `f77b242` Fix rubble / base camp progress dots never going away → `0a6cba4` (09-29, views derived per frame: overlays.js `updatePips`)
- **Same bug as:** A17 — the rubble/base-camp dots from `720331d`: B18 is the owner's report, fixed in `f77b242`, then derived from the mode in `0a6cba4`
- **Symptom:** after paying a rubble or base camp (or cancelling), the row of dots stayed on the board, and piled up.
- **Mechanism:** `renderTargets()` cleared `L.hl` and then drew the dots (`.dpips`) into `L.aim`, a layer that nothing else wrote or cleared (only `buildBoard()` rebuilt it); so each render added another group and nothing removed it. The pulse looked for `.dpips` in `L.hl` and never found it (ui_view.js:183 at 44eeb54).
- **Root cause:** view elements were appended imperatively into shared layers, and removal depended on whichever function owned that layer clearing it.
- **Design decision:** the view is patched by hand (append, then remember to clear) instead of derived from state (`UI.mode === 'discardFor'` ⇒ dots) — tags: `DD-ui-flags`
- **Siblings:** playtest 09-30 #4 ("All cards" overlay leaks across states: `UI.allOpen` is one of ~18 UI fields reset by hand in 4 places); the hover path clearing in B5 (flag `hoverShown`).
- **Recommended design fix:** each overlay is a pure function of state rendered into its own container every frame, writing only what changed — what 0a6cba4 introduced.
- **What we did:** **PARTIAL `f77b242` → ROOT (for this view) `0a6cba4`** — f77b242 gave the dots their own layer cleared on every render; since the refactor `updatePips()` (overlays.js:117–125) derives the dots from `UI.mode === 'discardFor' ? UI.pending : null` each frame, so they cannot outlive the mode. The UI state itself is still hand-reset flags (playtest #4).
- **Ratchet:** nothing — no test finishes a rubble payment and checks the dots are gone.
- **Assertion that would have caught it:** "an overlay exists only in a mode that uses it (progress dots ⇔ mode discardFor)" — per frame, after the view update — always-on cheap assert (a count of `.dpips` vs the mode) — would have fired on the first rubble paid in a playthrough — also catches playtest #4 — tags: `AS-view-matches-state`

### B19 — El Dorado's finishing spaces always drawn gold, even when they need water
- **Source:** owner report (2026-09-27 03:02: "Horrible visual bug. The final parts of El Dorado are always golden, even when they require water. It should not. If it's water, it should be blue.")
- **Commits:** `0a39d48` El Dorado's finishing spaces are drawn as the terrain they need
- **Symptom:** the finish spaces looked gold (like a special terrain), hiding that they cost water (or jungle).
- **Mechanism:** the renderer picked the fill from `h.type`; finish spaces have `type:'g'` and keep the terrain they need in a separate field `h.sym` (engine_data.js:72 `if(t[0]==='g')return{type:'g',sym:t[1],val:1}`), so they got the gold `gr-g` gradient.
- **Root cause:** a finish space's cost is stored outside the field every consumer reads for "what terrain is this".
- **Design decision:** "is a finish" and "what it costs" are folded into one `type` field, with the cost moved to a side field that each consumer must remember — tags: `DD-per-element-patch`, `DD-multi-source-truth`
- **Siblings:** every consumer special-cases `'g'`: engine_rules.js:157 (`h.type===sym||(h.type==='g'&&h.sym===sym)`), engine_bot.js:19 (`enter=hu.type==='g'?1:hu.val`), engine_ai.js:97 reads the finish symbol from a second source, `mapOf(gs).endSym` (engine_data.js:157), not `h.sym`; `c134b02` (09-28, El Dorado label over the finishing spaces).
- **Recommended design fix:** a finish space is an ordinary terrain space (`type:'w'|'j'`, `val:1`) with a `finish:true` flag; the renderer, rules and AI then need no `'g'` case, and there is one source for its symbol.
- **What we did:** **PARTIAL** (`0a39d48`) — the renderer maps `'g'` to `h.sym` (terrain.js:74 `const vt=h.type==='g'?h.sym:h.type`): correct for this view, but one more special case; the data model stands.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "every space is drawn in the colour of the terrain the rules charge to enter it" — once at board build (compare the fill chosen per hex with the rules' cost symbol) — always-on cheap assert at build — would have fired on every game start — also catches any new special space drawn wrongly — tags: `AS-view-matches-state`

### B20 — The bot counted an arrival's place as final too early, with an incomplete tie-break
- **Source:** found by Claude (the logic audit the owner asked for at 02:24); the owner had pointed at it at 03:46: "By the way, I suspect there's likely a subtle bug in the implementation that you have. See if you can find it. Specifically, the part where you're giving reward for the searched neural net." — link by timing (fix at 03:53), hypothesis.
- **Commits:** `7ca1876` Bot: an arrival's place is exact only once no one can still arrive that round (reworks `fad1a86`, B9)
- **Same bug as:** A31 — the bot's copy of the end-of-game ranking; B20 is A31's second fix, `7ca1876`
- **Symptom:** "About 7% of arrivals were overvalued, some counted as 1st that finished last" (7ca1876 message): the bot rushed into El Dorado believing it had won.
- **Mechanism:** `botValue` computed an arrived player's place the moment they arrived, from players who had arrived earlier, with a tie-break of blockade count only; players still to move that round could also arrive and win the tie-break (more blockades, then the biggest blockade), which `endGame` applies.
- **Root cause:** the bot re-implemented the rulebook's ranking instead of asking the engine, and got two rules wrong (when the round ends; the second tie-breaker).
- **Design decision:** a rule (final ranking) duplicated outside `endGame` — tags: `DD-rules-outside-engine`, `DD-multi-source-truth`
- **Siblings:** B9; today engine_bot.js:276–277 still re-implements `endGame`'s key (engine_rules.js:369–378) line by line; any rules change to tie-breaks must be made twice.
- **Recommended design fix:** the engine exports `placeOf(gs, seat)` / "is this place settled" computed by the same key function as `endGame`; the bot calls it.
- **What we did:** **PARTIAL** (`7ca1876`) — the copy was corrected (biggest-blockade tie-break, `botPlaceSettled`), and unsettled positions go to the network; the duplicate ranking stands (engine_bot.js:276–277).
- **Ratchet:** nothing — no test compares the bot's settled place with `endGame`'s places.
- **Assertion that would have caught it:** "when the bot says a place is settled, it equals the place endGame gives at the end of the game" — at game end in tests and self-play (compare the recorded claim with `gs.places`) — always-on in tools, cheap — would have fired in the first few hundred self-play games (7% of arrivals) — tags: `AS-engine-invariant`, `AS-matches-engine`

### B21 — The deep-search test hung
- **Source:** owner report (2026-09-27 07:22: "The test of DeepSearch seems to have stalled out."); raised again later that day ("see if you can fix the deep bug", owner/2026-09-27.md line 612, another chunk's window).
- **Commits:** `cb048cc` AI experiment: deep planner (introduced) → `6f1fc88` (09-27 18:30) fix the deep-search hang → `7f11502` (09-29, deep planner deleted as dead code)
- **Symptom:** deep.mjs stopped producing games.
- **Mechanism:** `botDeepChoose` ran playouts `while(live.length>1 && BOT_EVALS-e0<o.budget)`; a playout that ends the game at once costs no network evaluation, so the budget counter never moved and the loop never ended (6f1fc88 message).
- **Root cause:** the loop's budget was a counter of work that a legal path does not increment — a clock that doesn't move.
- **Design decision:** time budgets on a proxy that isn't guaranteed to advance — tags: `DD-work-in-reply-path`
- **Siblings:** playtest 09-30 #1 (the server's AI budget used `Date.now()`, which Workers freeze during synchronous CPU, so it never tripped); the planner in engine_ai.js has a safety net `aiFinishGuard`.
- **Recommended design fix:** loops bounded by an iteration count that each pass increments unconditionally (budget = passes or playouts, not evaluations), plus a progress assertion.
- **What we did:** **HACK** (`6f1fc88`) — a magic `rounds++<8` cap in the loop and an `acts++ > 20000` cap in deep.mjs; the budget still counted evaluations. The code was later deleted (7f11502), so the bug is moot, not fixed.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "an AI decision finishes within N playouts / N ms of CPU; an AI game within N actions" — in the decision loop and the game runner — always-on cheap assert — would have fired in the first deep game that reached a game-ending playout — also catches playtest #1 — tags: `AS-ai-progress`

## 2026-09-27 (day)

Window: owner messages 08:05–24:00 UTC, commits `2830376` … `d8b5745`. The owner spent most of this window on AI
training (questions, experiment choices); the site work was delegated to two subagents (`37cfd2e`, `687b8cc`, `3a8631e`,
`bd121cb`, `0b33711`) and the map work came in the evening (`492d9f0`, `2f043cb`, `eb26a18`, `0ade920`).

### C1 — Self-play exploration: expensive cards almost never tried; the exploration we had was a hack
- **Source:** owner report (2026-09-27 08:10: "they barely try buying any of the more expensive cards. The ways we were adding this in was a hack. I want all options to eventually be tried, even if fairly uncommon."; 08:07: "So every option gets tried, but rarely."; again 18:27: "Make sure to keep exploration up because with the harder maps, those more rarely blocked cards are much more important.")
- **Commits:** `2830376` AI: freeze first-qmax; log-odds exploration (EXPLORE_T) with a uniform floor (EXPLORE_EPS) · `3e8b156` AI: freeze first-explore (no clear gain) … · `e9da33d` AI: ANNEAL=… Watkins cut after exploratory moves · `8278fd1` AI: freeze first-anneal-8 (fading temperature: -62±15 Elo …) · later `c49a6ee` (09-28) "gift-card exploration reads this run's log, not an older run's"
- **Same bug as:** A23 — the self-play exploration built as per-mechanism tricks: A23 on 09-26, C1 the owner's 09-27 "the ways we were adding this in was a hack"
- **Symptom:** the network AI rarely buys the expensive cards, so it never learns their value; the owner called the existing exploration "a hack".
- **Mechanism:** self-play exploration was a pile of special cases in `tools/ai/gen.mjs`: gift cards handed to every player (`giftW`, weighted toward rarely bought cards), whole "no-buy" turns (`buyEps`), a random decision *type* (`typeEps`), plus a small uniform `eps` and a softmax `temp` over values. None of them tries each option in proportion to how good it looks, so expensive cards were reached only via gifts.
- **Root cause:** each time a hole in exploration was noticed, a new targeted trick was added instead of one exploration rule over all legal options.
- **Design decision:** exploration was built as case-by-case interventions ("gift the card it never buys", "forbid buying this turn") rather than one policy over the full action set — tags: `DD-per-element-patch`
- **Siblings:** the gift-card weights read an older run's log (fixed `c49a6ee`, 09-28); `2830376` had to switch off gift cards / no-buy turns / typeEps by hand (`!lotemp` guards at `tools/ai/gen.mjs:69,83`), i.e. two exploration systems that must not run together; the first-explore run trained TD targets through exploratory moves until `e9da33d` added the Watkins cut (so its "no clear gain" verdict is confounded — hypothesis, not verified).
- **Recommended design fix:** one exploration rule (log-odds/Boltzmann over every legal action with a floor) as the only mechanism, with its targets cut at exploratory moves; delete gift cards, no-buy turns and typeEps.
- **What we did:** **PARTIAL → NOT FIXED** — `2830376` added the principled rule but only behind `EXPLORE_T`; after a neutral result (`3e8b156`) and the owner's anneal variant losing 62 Elo (`8278fd1`), the default went back to the old tricks, which are still the default path today (`tools/ai/gen.mjs:190-196`: `typeEps`, `buyEps`, `giftW`; `lotemp` defaults to 0). Whether the AI now buys expensive cards was never measured.
- **Ratchet:** nothing — no statistic "every card type bought at least N times per K self-play games" is checked.
- **Assertion that would have caught it:** every card type in the market is bought by the network at least once per N self-play games (coverage of the action space) — end-of-iteration check in the training loop — tooling check (cheap, per iteration) — yes, it fires in the first iteration (the gen summary already counts buys per card) — also catches dead decision types (never transmits, never trashes) and exploration switched off by a config slip — tags: `AS-training-health`

### C2 — Progress test did not measure progress (the heuristic benchmark)
- **Source:** owner report (08:27: "It seems to be getting worse every time is the experiment too short to prove anything?"); found by Claude (`tools/ai/SUMMARY.md` at `44e8f02`: "The old progress test is not reliable … From iteration 87 to 137 of plain training, the network gained about +100 Elo on the ladder while this test stayed flat at about 2.2×"; "made two worse methods look better")
- **Commits:** `96a2c58` AI: model ladder (every game logged, Elo fitted over all games, promotion rule) · `c3c3826` AI: EVAL_SELF=1 — per-iteration test is the network against itself; tracked number = arrival round per course · later `c49a6ee` / `45e04de` (09-28, PAIRED tests, cut-off scoring)
- **Symptom:** every experiment's per-iteration number looked flat or worse; the owner could not tell whether anything helped.
- **Mechanism:** the loop's test (`tools/ai/loop.sh:49`, `vsFair`) measured the network's share of wins against two copies of the hand-written heuristic. The network already beat the heuristic most games, so the number saturated; TreeStrap and the wild anneal looked fine on it while losing 50–60 Elo head to head.
- **Root cause:** a progress metric chosen for convenience and never validated against a head-to-head measure.
- **Design decision:** "better" was never specified — decisions about which run to continue were driven by an unvalidated proxy — tags: `DD-no-spec`
- **Siblings:** C12 (the ladder itself split one network into two players, another unvalidated measure); promotions `68a5833`/`e15fed2` before the ladder existed were judged by this proxy.
- **Recommended design fix:** one measure of progress (head-to-head against frozen predecessors, fixed seeds, with error bars) used for every decision; the proxy only as a debug column.
- **What we did:** **PARTIAL** — `96a2c58` built the ladder with a promotion rule (the right measure) and `c3c3826` tracks arrival round; but the loop still reads `vsFair` (and on 09-28 `21d8679` used "beats the heuristic 1.15×" to raise the horizon), so the proxy still drives decisions.
- **Ratchet:** nothing — the ladder is a tool someone must run; nothing fails when the proxy and the ladder disagree.
- **Assertion that would have caught it:** the per-iteration metric moves with head-to-head strength (rank correlation with the ladder over the last K frozen nets above a threshold) — periodic tooling check — test tier — it would have fired within the first few frozen networks (a +100 Elo gain with a flat metric) — catches any saturated or biased metric — tags: `AS-training-health`

### C3 — An illegal AI action was silently replaced by "end turn"; the test that checked it could not fail
- **Source:** found by Claude (the 09-29 assertion pass, `00079c1`); introduced here in `37cfd2e`
- **Commits:** `37cfd2e` Play against the AI locally … (introduced `aiStep` fallback and the 60-decision cap) · `00079c1` (09-29) Engine: assert() for invariants instead of quiet fallbacks
- **Same bug as:** E23 — `aiStep` turning an illegal AI action into end turn (`37cfd2e`), made an assertion in `00079c1`
- **Symptom:** none visible — which is the point: an AI whose chosen action the engine refused just ended its turn, looking like a weak move.
- **Mechanism:** `aiStep` (37cfd2e, `src/engine_ai.js`): `if(!r.ok){…applyAction(me,{t:'end'…})}` and returned the *end-turn* result. `test/engine.test.mjs` asserted `E.aiStep(...).ok` ("ai action rejected"), which was always true after the fallback — a vacuous test. `aiChoose` also ends the turn after 60 decisions (`if(++mem.n>60)return …end`) with no report.
- **Root cause:** the AI layer was written defensively ("never crash a game") instead of asserting its contract.
- **Design decision:** silent fallbacks at the AI/engine boundary — tags: `DD-silent-failure`
- **Siblings:** the 60-decision cap (still at `src/engine_ai.js:41`); the network-load failure falls back to the route planner with only a toast (`src/client/ai.js:16`) so "Humboldt" plays as Raleigh; C10 (2-player fallback) and the non-First course fallback (`src/engine_ai.js:39`); `aiChoose`'s `aiById(id)||AIS[last]` default.
- **Recommended design fix:** the AI's action must be legal: assert it at the boundary and report; any "safety" end-turn is an assertion failure, not a move.
- **What we did:** **ROOT (for aiStep) in `00079c1`; HACK remains for the cap** — `00079c1` replaced the fallback with `assert(r.ok,'aiStep: the AI chooses a legal action')` (now `src/engine_ai.js:100`), which is reported through the page/server boundary; the `mem.n>60` cap still silently ends the turn. Counted **PARTIAL** overall (editor): the cap is untouched original code rather than a fix, and E23, the same bug, counts the same state as partial.
- **Ratchet:** assertion (`aiStep` legality) — for the cap, nothing.
- **Assertion that would have caught it:** an AI's chosen action is legal, and an AI turn ends by its own choice within N decisions — precondition in `aiStep` / invariant in `aiChoose` — always-on cheap assertion — yes, it would have fired in the first engine test run if any AI ever chose illegally (unknown whether one did, since the fallback hid it) — catches every AI policy bug that currently degrades into "ends turn" — tags: `AS-no-silent-catch`, `AS-ai-progress`

### C4 — Local AIs think on the page's main thread; frame rate never measured during AI turns
- **Source:** found by Claude (subagent hand-back 08:59: "Humboldt thinks on the main page thread in local games. The first move of its turn can take up to about 150 ms (measured in Node, not in a browser), so a brief stutter is possible. I didn't run the frame-rate test during AI turns.")
- **Commits:** `37cfd2e` Play against the AI locally … · later `14cefe2` (09-29, Fawcett: "≈3x his thinking time") made the block longer
- **Symptom:** possible stutter of pan/zoom/card animation at the start of an AI turn (not reported by the owner — hypothesis, not verified).
- **Mechanism:** `aiKick` runs `aiChoose` synchronously inside a `setTimeout` on the main thread (`src/client/ai.js:21-39`); the whole-turn planner evaluates many positions in one call.
- **Root cause:** the AI was run where it was convenient (the page's engine instance) and shipped without measuring the owner's 60 fps rule in that state.
- **Design decision:** shipped without measuring the real setup (frame times in a browser during AI turns); CLAUDE.md requires measuring 60 fps — tags: `DD-untested-real-setup`
- **Siblings:** the AI's pacing polls `UI.anim` every 120 ms (`src/client/ai.js:27`, animation gates the AI: `DD-animation-coupled`); online AIs run server-side and don't have this problem.
- **Recommended design fix:** run AI thinking in a Web Worker (the engine is already a pure module), or measure and budget it; make "frames during an AI turn" a perf.cjs scenario.
- **What we did:** **NOT FIXED** — no change; `test/flows.cjs` plays an AI turn but no test measures frames during it (`test/perf.cjs`/`frames.cjs` have no AI seat).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no frame over 50 ms while an AI thinks in a local game — `test/perf.cjs` scenario with an AI seat on a throttled phone profile — debug/test (reads time) — would fire on every AI turn if the 150 ms estimate holds — catches any main-thread work added to the turn loop (Fawcett's wider search) — tags: `AS-frame-budget`

### C5 — Online AIs played the rest of the game in one alarm; a resigning player's answer took 5–7 s
- **Source:** found in the owner's browser on 2026-09-30 (reported in a later window; `a230101` message: "after a person resigned on their turn, the reply took 5-7 s"); introduced here in `687b8cc`
- **Commits:** `687b8cc` Online AI players: server-side AI seats … (the time budget) · `a230101` (09-30) Resigning online: the answer no longer waits for the AIs to finish the game
- **Same bug as:** F13, P1 — the online resign that waits while one alarm plays out the game (`687b8cc`'s `Date.now()` budget), fixed in `a230101`
- **Symptom:** after resigning online against AIs, the page hung for 5–7 s (1.4 s with Raleigh).
- **Mechanism:** `aiMove` looped `while (fast && this.aiToMove() && Date.now() - t0 < 300)`. In a Worker, `Date.now()` does not advance while code runs (only at I/O), so the 0.3 s budget never ran out and one alarm played the whole game; the resign handler awaited `tellLobby()` before replying, so the alarm ran first.
- **Root cause:** a time budget on a clock that doesn't move in the runtime it ran in, plus the player's reply placed behind unrelated I/O.
- **Design decision:** work in the reply path with a wall-clock budget, verified only under `wrangler dev` (where the clock moves) — tags: `DD-work-in-reply-path`, `DD-untested-real-setup`
- **Siblings:** C6 (schema setup in every request); the same "clock that doesn't move" trap for any server-side time budget; 09-30 `2f4ee78` (an AI's first move arriving before a hidden tab drew the board) is another server-AI timing bug seen only in the owner's browser.
- **Recommended design fix:** count work, never time it, on the server; send the actor's reply before any other await (one rule for every handler).
- **What we did:** **ROOT (clock) / PARTIAL (reply order)** in `a230101` — `AI_BATCH = 8` counted actions (`src/worker.js:206,580`) removes the clock dependency; moving `afterChange` before `tellLobby` fixes this handler and the timeout path, but nothing enforces "reply first" for future handlers.
- **Ratchet:** nothing — `a230101` touched only `worker.js` and HANDOFF (the note that wrangler dev doesn't show it); no test with a frozen clock.
- **Assertion that would have caught it:** the acting player's reply is sent within a count-based budget (≤ N engine steps / no awaits on other rooms) — server-side check around each message handler — count-based server budget, always-on — would have fired on the first resign in a room with AIs — catches any slow work placed before a reply — tags: `AS-latency-budget`

### C6 — Every new Worker instance ran ~25 database queries before answering (≈3 s per /api request)
- **Source:** found by Claude on 2026-09-30 (`199a124`, while chasing the owner's slow-room reports in a later window); partly introduced here in `687b8cc` and `bd121cb`
- **Commits:** `687b8cc` (sequential `ALTER TABLE` + per-AI SELECT/INSERT in `createSchema`) · `bd121cb` (one-time calibration batch in `createSchema`) · `199a124` (09-30) … API answers without the schema setup
- **Same bug as:** F7 — `ensureSchema` running ~25 D1 queries on each new isolate before replying; F7 is the owner's report (create room), fixed in `199a124`
- **Symptom:** each API call and room creation on a cold instance took about 3 s.
- **Mechanism:** `ensureSchema()` ran `createSchema` once per isolate; `687b8cc` added awaited queries in a loop over the AIs and `bd121cb` another batch, each a round trip to D1 from a far colo, all before the first reply.
- **Root cause:** schema/data setup placed on the request path, and each feature appended its own setup queries there.
- **Design decision:** setup work in the reply path, with no budget on queries per request — tags: `DD-work-in-reply-path`
- **Siblings:** C5; any future "one-time" data fix added to `createSchema` (the replay clean-ups `d0be19c`/`ce4c419`).
- **Recommended design fix:** schema and data migrations run at deploy (or once, out of band); requests only read.
- **What we did:** **PARTIAL** in `199a124` — a stored stamp (`SCHEMA_V` + AI ratings, `src/worker.js:23-35`) makes the common case one query, but the setup still runs inside a request when the stamp changes, and correctness relies on a hand-bumped `SCHEMA_V` (forget it and new columns are silently never created).
- **Ratchet:** nothing (no count of queries per request in tests).
- **Assertion that would have caught it:** a request makes at most N sequential D1 round trips before replying — counter in the worker's fetch/test harness — count-based server budget — would have fired on the first request after `687b8cc` — catches every setup or lookup that creeps into the request path — tags: `AS-latency-budget`

### C7 — AI ratings did not reflect AI strength (all 1200, then stale after every network change)
- **Source:** owner report (09:07: "you probably want to have the AIs play against each other so that their ELO becomes accurate on the leaderboard"; 08:36: "AIs should have ELOs")
- **Commits:** `687b8cc` (every AI starts at 1200) · `bd121cb` Calibrate the AIs' ratings from AI-vs-AI games (Humboldt 1530, Orellana 1483, Raleigh 1200) · `68a5833` (11:45) promote first-distill-22 (no recalibration) · `e15fed2` (18:15) promote first-distill-35 (no recalibration) · `a17086a` (09-28, new network, no recalibration) · `f0b69b5` (09-29) new calibration "Humboldt 1398 (was 1530, measured with an earlier network)" · `ba2cc90` (09-29, ships first-first1-351; "AI ratings are being recalibrated for it" — ratings unchanged since)
- **Same bug as:** E15 — AI ratings typed into the code and not recalibrated for the network that ships
- **Symptom:** the leaderboard listed Humboldt, Orellana and Raleigh all at 1200; after calibration the numbers described a network that was replaced two hours later.
- **Mechanism:** the rating is a constant typed into `AIS[].rating` (`src/engine_ai.js:12-14`) from a calibration run; the network file `src/ai/first.bin` is swapped independently by promotion commits. Nothing links the two.
- **Root cause:** the AI's identity for rating purposes is its name, while its strength is the (network, search settings) pair.
- **Design decision:** the same fact (how strong this AI is) stored in two places that drift: a hand-copied rating and the shipped network — tags: `DD-multi-source-truth`
- **Siblings:** C12 (ladder: one network under two names); C10 (in 2-player games and other courses "Humboldt" is really the route planner but keeps Humboldt's rating); C17 (weight cache vs weights).
- **Recommended design fix:** key calibration by network content hash + AI settings; the build refuses to ship a network whose hash has no calibration record.
- **What we did:** **PARTIAL** — `bd121cb` measured real ratings (right instance fix) and `f0b69b5` re-measured once; the shift logic in `ensureSchema` is careful, but the rating still is a hand-copied constant and is stale again since `ba2cc90`. → **NOT FIXED** again since `ba2cc90` (09-29: a new network shipped without recalibration; see E15).
- **Ratchet:** nothing — `engine.test` checks the packed network equals a named model file, not that its rating was measured for it.
- **Assertion that would have caught it:** the rating shipped for each AI was measured with the network that ships (hash in the calibration record equals hash of `first.bin`) — build/test check — test tier — fires at the first promotion (`68a5833`) — catches every network swap without recalibration — tags: `AS-provenance`

### C8 — Other players' turns were invisible (cards played, purchases) and the journal was hidden
- **Source:** owner report (09:07: "you can see when they move, but you don't see what cards they play to move. You also don't see when they buy a card and how they buy a card without looking at the journal. There should also be a separate button for journal. Instead of being hidden like that.")
- **Commits:** `3a8631e` Show other players' turns … and add a Journal button · later `d51aa25` (09-29) history panel replaces journal · `3cb8d21` (09-29) Events: draw and gain folded into play · `9b4b2ac` (09-29) the journal is structured, not English · `0101346` (09-30) History: back to the one-turn recap row … · `1f27789` (09-30) History shows the cards discarded at the end of a turn
- **Symptom:** during an AI's or opponent's turn you saw explorers move but not which cards paid for it, nor what they bought; the journal was a collapsed section inside the All-cards overlay.
- **Mechanism:** the engine emitted `move`, `draw`, `gain` events aimed at animating *my* screen (`gain` only flew to the viewer's own discard) and wrote the public history as English strings in `S.log`; the page had nothing to render another player's plays from.
- **Root cause:** "what happened publicly" was not a first-class engine output: animation events and the English journal were two partial channels, neither complete.
- **Design decision:** the same public history kept in two representations (animation events vs English log lines), each incomplete — tags: `DD-multi-source-truth`
- **Siblings:** `3a8631e` added a third channel (`play` events) beside `draw`/`gain`, later merged (`3cb8d21`); `d51aa25` added a fourth (`S.hist`), later removed (`0101346`); the `end` event carried only counts of discards (`disc:toDisc.length`) although discards go face up — fixed `1f27789` (09-30); the recap UI was rebuilt three times (`3a8631e` → `d51aa25` → `0101346`).
- **Recommended design fix:** one public event stream from the engine (every publicly visible change, with the cards), stored as the journal; every view (recap, history, sounds, flights, chips) derives from it.
- **What we did:** **PARTIAL `3a8631e` → ROOT for the data in `3cb8d21` + `9b4b2ac`** — `3a8631e` fixed the symptom with a new `play` event next to the old ones; the later commits made `S.log` the same structured events and folded `draw`/`gain` into `play`. The UI churn afterwards belongs to later reports.
- **Ratchet:** test — `engine.test` `publicEvents` (added `3a8631e`) asserts play events name only public cards (a redaction ratchet, not a completeness one); `layout.cjs` got journal/recap states (journal since removed).
- **Assertion that would have caught it:** every publicly visible change of the state (cards into play, pile tops, market counts, trash) is explained by the events of that action — engine postcondition in `applyAction` comparing public projections before/after with the events — always-on cheap (or test tier) — yes, on the first opponent buy — also catches the discard-count omission and any new action that forgets its event — tags: `AS-events-explain-change`

### C9 — Pop-up windows (Rules and others) were wider than the screen at 390 px
- **Source:** found by Claude (subagent hand-back 09:37: "all pop-up windows (Rules and others) were wider than the screen at 390 px")
- **Commits:** `3a8631e` … Modals fit 390 px
- **Symptom:** on a phone, dialogs ran off the right edge.
- **Mechanism:** `.modal{width:min(580px,100%);padding:26px}` with the default `box-sizing:content-box`: 100% plus 52 px of padding overflowed the scrim.
- **Root cause:** no global `box-sizing:border-box`; each rule that needs it sets it individually (`src/client/shell.html` has it on `.seatrow`, `.modal.menu`, `.seg label`, `.clist`, `.prow input`, `select.who`, `.pchip`, … lines 52–185).
- **Design decision:** a general CSS trap handled element by element — tags: `DD-per-element-patch`
- **Siblings:** every element given width:100% plus padding without its own `box-sizing` line; the menu dialog needed its own `calc(100% - 32px)` + border-box (`shell.html:55`).
- **Recommended design fix:** `*,*::before,*::after{box-sizing:border-box}` once; delete the per-rule copies and the padding-compensating calcs.
- **What we did:** **HACK** — `width:min(580px,calc(100% - 52px))` (`shell.html:72`), a magic number equal to twice the padding; it breaks if the padding changes.
- **Ratchet:** nothing (the one weak check is gone) — `layout.cjs` checked only the journal modal is on screen; that check went with the journal; today no test opens a `.modal` (grep finds none in `test/layout.cjs`).
- **Assertion that would have caught it:** every visible dialog/control lies inside the viewport at every tested size — `layout.cjs` over all open overlays, not a hand list — debug/test (reads layout) — yes, the Rules dialog at 390 px in any layout run that opened it — catches any overflow at phone width — tags: `AS-no-overlap`

### C10 — The opponents' recap made the prompt box content-sized: it collides with the turn buttons and changes size as steps arrive
- **Source:** found by Claude in `3a8631e` (short screens, "prompt keeps clear of the turn buttons (--actFoot)"); the jumping was fixed after later reports (`9e85226`, 09-30: "The prompt box has a fixed minimum size … instead of sizing to its content"; `0101346`: "a turn wrapped onto two lines (the row lost its one fixed height)")
- **Commits:** `3a8631e` (feed inside `#prompt`, `width:max-content`, new `--actFoot` clearance) · `0101346` (09-30) · `9e85226` (09-30) Prompt box keeps one size …
- **Same bug as:** F17, P10 — the content-sized prompt box (`width:max-content`, `3a8631e`), clamped in `9e85226`
- **Symptom:** on short landscape screens the prompt with the recap ran under the End-turn buttons; elsewhere the prompt grew and shrank as the opponent's steps were added (a jump per step).
- **Mechanism:** `#prompt` is absolutely positioned over the board with `width:max-content`; putting a row of cards inside it made its size follow content; clearance from other floating controls is per-control variables (`--mktFoot`, `--zoomFoot`, now `--actFoot`, set from JS in `src/client/hud.js:96`).
- **Root cause:** the prompt floats over the board and takes its size from its text and cards, so every content change moves things and every new neighbour needs a new clearance variable.
- **Design decision:** a content-sized overlay floated over other controls — tags: `DD-content-sized-layout`, `DD-float-over`
- **Siblings:** `--mktFoot`/`--zoomFoot` clearances (CLAUDE.md even codifies them); history panel height recomputed while cards flew in (`0101346`); the market/prompt overlap class.
- **Recommended design fix:** the prompt and recap get their own grid cell of fixed size (a slot), not an overlay with clearance variables.
- **What we did:** **HACK `3a8631e` → HACK `9e85226`** (editor: `9e85226` was classed as a partial fix here; its diff keeps `width:max-content` and adds a tuned `min-width:min(560px,…)`, a clamp, as P10 records; see verify.md) — `--actFoot` is one more per-control clearance; `9e85226` gives the box a fixed minimum size (a clamp, not a slot: above 560 px it still follows its content) and it is still an absolutely positioned overlay with clearances.
- **Ratchet:** test — `layout.cjs` "recap of an AI turn" states check overlap/on-screen (added `3a8631e`); nothing checks size stability.
- **Assertion that would have caught it:** nothing on screen moves or resizes without an animation or a direct action (the prompt's box is stable while recap steps arrive) — layout-shift observer during an AI turn — debug/test — yes, on every AI turn — catches every content-sized jump — tags: `AS-layout-shift`

### C11 — Two-player games: the network AIs mostly never reached El Dorado
- **Source:** found by Claude (calibration games, subagent hand-back 09:37: "in two-player games, Humboldt and Orellana mostly fail to reach El Dorado. In 180 two-player test games, 88 hit the 30-round cap")
- **Commits:** `bd121cb` (2-player games left out of the ratings) · `0b33711` AI players: network AIs play as the route planner in 2-player games · `a17086a` (09-28) … AI seats only on First Expedition with 3-4 players
- **Same bug as:** D14 — AI seats in 2-player games the network was never trained for: C11 found it, D14 is the owner's request; both addressed by `a17086a`
- **Symptom:** a 2-player game against Humboldt/Orellana could run to the round cap without the AI finishing.
- **Mechanism:** in 2-player games each player leads two explorers; the network's inputs average over pieces and it was trained only on 3–4 player games, so its values are meaningless there.
- **Root cause:** a model was shipped as a general player while valid only on its training distribution (First Expedition, 3–4 players), with fallbacks instead of a declared domain.
- **Design decision:** silent fallback outside the model's domain: the named AI keeps its name and rating but plays as a different policy — tags: `DD-silent-failure`
- **Siblings:** the same fallback on every non-First course (`src/engine_ai.js:39`, "trained for another course"); network-load failure → planner (`src/client/ai.js:16`); C7 (rating attached to the name); C3.
- **Recommended design fix:** declare each AI's domain in one place and enforce it (not offered outside it) with an assertion in `aiChoose` instead of a fallback; train 2-player games if 2-player AI is wanted.
- **What we did:** **HACK `0b33711` → PARTIAL `a17086a`** — `0b33711` is an `if(players.length===2)` switch to the planner; `a17086a` stops offering AIs in 2-player games (the domain is now enforced at setup and on the server), but the silent 2-player fallback is still in `aiChoose`/`aiPlan` (`src/engine_ai.js:39,47`) and the network was never trained on 2-player games.
- **Ratchet:** nothing for 2-player (engine.test plays no 2-player AI game); `a17086a`'s server refusal is a guard, not a test.
- **Assertion that would have caught it:** AI games always finish (every AI arrives within the round cap) in every seat count and course the AI is offered on — engine test over offered configurations, plus an in-game check "an AI explorer has not advanced for K rounds" — test + cheap always-on counter — yes, 49% of 2-player games — also catches C19 — tags: `AS-ai-progress`

### C12 — The model ladder counted one network as two players
- **Source:** found by Claude (`e15fed2` message: "The ladder had the promoted snapshot (distill@22) and its frozen copy (first-distill-22) as separate players, which split the rating graph")
- **Commits:** `96a2c58` AI: model ladder … · `e15fed2` AI: ladder merges identical networks listed under two names …
- **Symptom:** wrong Elo gaps between networks for ~9 h (first-distill-35's gain over first-distill-22 was mismeasured until 18:15); promotions were decided on those numbers.
- **Mechanism:** `tools/ai/ladder.mjs` identifies players by the name of the file they were loaded from; the same weights appear as a loop snapshot (`distill@22`) and a frozen model (`first-distill-22`).
- **Root cause:** identity by name, not by content.
- **Design decision:** the same network under two identities — tags: `DD-multi-source-truth`
- **Siblings:** C7 (rating keyed by AI name, not network); C17 (cache keyed by array identity).
- **Recommended design fix:** a network's ladder identity is a hash of its weights (plus search settings); names are labels.
- **What we did:** **HACK** — a hand-written alias file (`tools/ai/data/ladder-alias.json`, read at `tools/ai/ladder.mjs:37-40`) listing five pairs; every future freeze of a loop snapshot needs a new line by hand.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** two ladder players never have identical weights — ladder report computes weight hashes and refuses duplicates — tooling check — yes, at the first freeze of a promoted snapshot — catches every rename/copy — tags: `AS-provenance`

### C13 — Training stopped when the disk filled with 28 GB of old self-play batches
- **Source:** found by Claude (`e15fed2`: "The disk filled with old batch files (28 GB)"; SUMMARY.md: "at 18:05 the disk filled up … Training restarted automatically after the space was freed")
- **Commits:** `e15fed2` … loop keeps only the newest 8 batch files · related `b2b69a9` supervise.sh (restart on stall), added after the owner's 09:24 "there could be an infinite loop. I don't want you to waste the entire night on one stupid infinite loop."
- **Symptom:** the overnight/day training run died at 18:05; the owner's "improves while I sleep" run lost time.
- **Mechanism:** each iteration of `tools/ai/loop.sh` wrote sample `.bin` files and nothing ever deleted them, although training reads only the newest `REPLAY` (3–6) batches.
- **Root cause:** retention not tied to what reads the data; no resource check in an unattended loop.
- **Design decision:** unbounded growth of artifacts in a long unattended run — tags: `DD-no-budget`
- **Siblings:** ladder game log, loop logs and capped-game replays also grow; the watchdog (`b2b69a9`) restarts a stalled loop rather than finding why it stalled (a retry), which would restart into the same full disk.
- **Recommended design fix:** keep exactly what the trainer reads (derive the retention from `REPLAY`), and check free disk before each iteration with a halt message.
- **What we did:** **PARTIAL** — `KEEP_BATCHES` default 8 (`tools/ai/loop.sh:44-45`) bounds this one kind of file with a constant chosen above `REPLAY`; no disk check, other outputs unbounded.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** free disk stays above X GB and grows by at most Y per iteration — per-iteration check in `loop.sh` (halt file, as `66f2107` later did for model quality) — tooling, cheap — yes, hours before it filled — catches any other leak (logs, replays) — tags: `AS-resource-budget`

### C14 — The owner's question waited behind work ("Before you do this, can you prioritize giving me a report?")
- **Source:** owner report (18:13: "can you give me a readme with the current progress and give me a summary of what you found so far?"; 18:17: "Before you do this, can you prioritize giving me a report? Of all the stuff you already know.")
- **Commits:** `44e8f02` AI: overnight summary (tools/ai/SUMMARY.md …) and the arrival-round benchmark script (the work done instead) · process fix `8dbdca8` (09-28) CLAUDE.md: the owner's questions come first — stop and answer right away, then resume
- **Same bug as:** D1, H4 — the owner's questions waiting behind, or lost in, Claude's work (09-27, 09-28, 09-29)
- **Symptom:** the owner asked for a summary and had to ask again 4 minutes later because Claude started producing files/benchmarks first.
- **Mechanism:** Claude treated the question as a task (write a README, run a benchmark) and did the long part before answering from what it knew.
- **Root cause:** no rule that questions preempt work; answers were routed through artifacts.
- **Design decision:** working process: questions queued behind work — tags: `DD-process`
- **Siblings:** repeated "What's the update?" (19:19, 19:31, 19:41, 23:53) — whether those also waited is unknown; later CLAUDE.md rules (09-30 `237fd6f`) repeat the same demand.
- **Recommended design fix:** answer first from current knowledge in one message, then do the work; a long command never runs before the answer.
- **What we did:** **PARTIAL** — `8dbdca8` (a day later) wrote the rule into CLAUDE.md; a written rule, no mechanism.
- **Ratchet:** nothing mechanical (a CLAUDE.md instruction).
- **Assertion that would have caught it:** none possible in code — it is conversational behaviour; the check is a session review: "every owner question gets an answer before the next tool call that takes > N s" — tags: `AS-none`

### C15 — A base-camp request from the owner (camps usable once, a common house rule) silently disappeared
- **Source:** owner report (18:47: "We also need the model to be trained in two different versions of the rules. One version of the rule, you're able to backtrack onto camps where you can remove cards multiple times on the same spot. And the other one says, you only get to move onto a camp once. Because that's a very common house rule. And right now the models are going onto these spots and going back and leaving and going back on them.")
- **Commits:** `a3ea18a` AI: one network for several courses — … rule switches (the first: base camps usable once, for the upcoming house rule) · `7f11502` (09-29) Engine: delete the dead bot code … (the `campOnce` input went with it)
- **Symptom:** the AI keeps stepping on and off base camps to thin its deck; the owner's house-rule variant never appeared.
- **Mechanism:** only a network input flag (`S.rules.campOnce`) was reserved; the rule was never implemented in `engine_rules.js`; later the unused flag was deleted as dead code. It is in no HANDOFF/ledger (grep finds no "house rule" in docs).
- **Root cause:** the request was absorbed into the AI experiment (an input slot) instead of being tracked as the owner's request.
- **Design decision:** no ledger of the owner's open requests (CLAUDE.md's ledger rule came only on 09-30) — tags: `DD-process`
- **Siblings:** unknown others from this window (the owner's 20:03 "small square"/routes input ideas were explicitly deferred by him, so not counted).
- **Recommended design fix:** a ledger of requests (the 09-30 CLAUDE.md rule), and rules variants as engine options with rules tests, not AI inputs.
- **What we did:** **NOT FIXED** — whether the owner dropped it is unknown; nothing records it.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** none in code (a product request); the check is the request ledger reviewed at the end of each piece of work — tags: `AS-none`

### C16 — Boards I and N were wrong on First Expedition for a day, and knowingly left wrong for an hour
- **Source:** found by Claude (`492d9f0` HANDOFF: "I and N are each 1 short … Not fixed yet because First Expedition uses both and the AI network is trained on it"); fixed after the owner's 19:54 "Yeah, do the fix. It should be accurate." (the HANDOFF line in `0ade920` records it as "owner: accuracy first")
- **Commits:** `a304ba6` (09-26, introduced: real First Expedition tiles) · `492d9f0` (found, not fixed) · `0ade920` Boards: fix tiles I and N from the catalogue …
- **Same bug as:** A9 — the same misread tokens in tiles I and N (`a304ba6`), fixed in `0ade920`; C16 is the 09-27 view of it
- **Symptom:** First Expedition's I base camp cost 2 cards instead of 3 and N had a 2-coin village where the tile shows 3 — wrong rules on the main course (and the AI trained on it).
- **Mechanism:** boards are strings typed by hand from catalogue images (`BOARDS` in `src/engine_data.js`); two tokens were misread.
- **Root cause:** hand-transcribed rules data with no automated check against the source; the independent check (catalogue "Traverse Rating" = Σ strength + 6 per mountain) was discovered but kept as prose in HANDOFF §5.
- **Design decision:** rules data entered by hand from images with no machine check — tags: `DD-unverified-data`
- **Siblings:** boards E and H are still "reconstructed (terrain counts right, layout guessed)" (`src/engine_data.js:51`); blockade costs "still a guess" (HANDOFF §5, `BLOCKADES` at `engine_data.js:45`); every new board transcription (`2f043cb`, `eb26a18` J) relies on eyes.
- **Recommended design fix:** put each catalogue's terrain counts and traverse rating next to `BOARDS` and assert them in the rules test (one table, checked on every build); mark reconstructed boards unusable in courses.
- **What we did:** **PARTIAL** — `0ade920` fixed the two tokens (correct instance fix); the check that found them is still not a test (no "traverse" anywhere in `test/`), E/H/blockades remain guesses. Process note: rules accuracy is the owner's first priority, yet `492d9f0` shipped a known rules error to protect the AI network.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** each board's terrain counts and Σ strength + 6·mountains equal the catalogue's published numbers — rules test (static data check) — test tier, cheap — yes, the first time `a304ba6` was tested — catches every misread token on every board — tags: `AS-rules-vs-rulebook`

### C17 — The engine was slow in self-play ("the engine should not be slow")
- **Source:** owner report (19:10: "Most of the time is JavaScript. Is the engine being slow? See if you can fix that. Like the engine should not be slow.")
- **Commits:** `b37f872` AI speed: ~30% faster self-play with identical results
- **Symptom:** self-play at 11.0 ms per move; the owner was considering renting a GPU when most time was JavaScript.
- **Mechanism:** `botFeatures` recomputed the course's terrain bins (constant per map) on every network evaluation; `botNetValue` read weights from JSON arrays and allocated per call; about 1/3 of time each in network math and input building.
- **Root cause:** per-map constants computed per position; no profiling or speed budget ever applied to the AI code path.
- **Design decision:** performance never measured or budgeted on the hot path, so waste accumulated until the owner asked — tags: `DD-no-budget`
- **Siblings:** C4 (AI thinking time on the main thread unmeasured); C18 (the speed fix itself introduced a stale cache).
- **Recommended design fix:** separate per-map precomputation from per-position features by construction (a course object built once), and keep a ms/move budget in the training loop's summary that fails on regression.
- **What we did:** **PARTIAL** — `b37f872` fixed the instance well (per-map cache `MAP._fb`, typed weights, reused buffer; bit-identical on 2,556 positions), 11.0 → 7.7 ms/move; no budget added.
- **Ratchet:** nothing (no speed check; `golden.mjs` later checks values, not time).
- **Assertion that would have caught it:** CPU per AI move stays under a recorded budget — tooling check printed and compared every iteration — test tier — would have flagged it from the first run — catches every hot-path regression — tags: `AS-resource-budget`

### C18 — The weight cache went stale when a tool changed weights in place
- **Source:** found by Claude (09-28, `40e7eb2`: "revive.mjs: drop the engine's stale weight cache before its own value check"); introduced here in `b37f872`
- **Commits:** `b37f872` (introduced `botNetPrep`, cache keyed on `N.w1T` identity) · `9827f53` revive.mjs (edits `N.w1T` in place) · `40e7eb2` (09-28, `delete N._p` in revive.mjs)
- **Symptom:** revive.mjs's "how much did the output change" check evaluated the old weights, so the check that reviving leaves play unchanged was vacuous (effect on the 19:50 revived network: unknown).
- **Mechanism:** `botNetPrep(N)` returns `N._p` while `N._p.src===N.w1T` (`src/engine_bot.js:254`); revive.mjs mutates the same array in place, so the typed copies keep the old values.
- **Root cause:** a cached derived copy with an identity key instead of ownership (weights immutable, or prepared once when loaded).
- **Design decision:** the same weights held in two places (JSON arrays and typed copies) with a heuristic staleness key — tags: `DD-multi-source-truth`
- **Siblings:** module-global `BOT_FBUF` scratch buffer (`b37f872`, "never for stored training samples"); `MAP._fb`; C12 (identity by name).
- **Recommended design fix:** prepare weights once at load (`aiSetNet` / `setNet` returns an immutable prepared network); tools that edit weights build a new network.
- **What we did:** **HACK** — `delete N._p` in the one tool that hit it; the identity-keyed cache remains for any other in-place edit.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** the value the engine computes equals a reference forward pass on the caller's current weights (sampled) — debug assertion in tools that edit networks — test tier — fires on the first revive — catches any stale cache of weights — tags: `AS-training-health`

### C19 — AIs stuck forever next to El Dorado or on a way their cards can't take
- **Source:** found by Claude (engine.test on the new courses; `eb26a18`: "the planner sometimes trashed its last paddle/machete card (or its deck down to 2 cards) and then waited next to El Dorado forever"); the owner objected to the fix's floor (19:54: "It might be valid to trim your deck down to four cards. Anything less than four cards should not be trimmed. … the AI should eventually learn this, no? We shouldn't have to automatically code it in. In real player games, maybe we can add it in as a safety, but in the training set, it shouldn't need to.")
- **Commits:** `492d9f0` (test: AI games finish on every course) · `eb26a18` … AI can't get stuck before El Dorado (`aiFinishGuard`, floor 6) · `0ade920` (floor 4) · `8e06048` (09-30) AI: two causes of stalled games on the Witch course · `fd58188` (09-30) AI: no more stalled games (0 of 1000 on Witch's Cauldron, was 9 of 300)
- **Same bug as:** A29, F30 — AI explorers stranded before El Dorado: A29 the 09-26 stalls, C19 the `aiFinishGuard` guards of 09-27, F30 the Witch's Cauldron fixes of 09-30
- **Symptom:** an AI explorer stands next to the finish (or before 3-coin villages / a water-4 space) for the rest of the game, blocking others; the full test suite failed intermittently with "AI game did not finish".
- **Mechanism:** the bot's route planner (`botCost`) assumes every space can be entered; the bot trashes finish cards or thins below what a base camp costs; with no card able to take the next step it ends turns forever.
- **Root cause:** the planner's model of the board ignores the player's own cards; guards were layered on the named-AI output because `engine_bot.js` "belongs to the training code" and was not to be touched.
- **Design decision:** a patch layer that overrides the decision-maker's choices case by case instead of fixing the decision-maker's model — tags: `DD-per-element-patch`
- **Siblings:** each case got its own guard: finish card (`eb26a18`), deck floor 6→4 (`0ade920`), base-camp payments (`8e06048`, `botCanRemove`), "stuck" detour mode with a per-game `mem.detour` flag (`fd58188`); the 60-decision cap (C3); C11.
- **Recommended design fix:** the planner's distances computed over spaces the player's current cards can enter (the `aiRouteFor` idea as the planner's own cost), so "wait forever" is never the best plan; no override layer.
- **What we did:** **HACK `eb26a18` → HACK `0ade920` → PARTIAL `8e06048`/`fd58188`** — `8e06048` moved one rule into candidate generation (bot side); `fd58188` added stuck detection and a card-aware route (`aiRouteFor`), but still as an override in `aiFinishGuard` (`src/engine_ai.js:54-83`, 30 lines of special cases) with a magic floor of 4; the network-trained bot can still choose these moves in training (owner wanted it learned).
- **Ratchet:** test — `engine.test` "AI game did not finish" on every course; but it uses `Math.random` seeds (`test/engine.test.mjs:88`), so it failed only intermittently for three days (9 of 300 on Witch) instead of blocking the change.
- **Assertion that would have caught it:** an AI explorer advances (fewer steps to El Dorado) at least once every K rounds, and AI games finish — cheap always-on counter in `aiStep` (report through the boundary) + seeded engine test over many games — yes, in ordinary play on Witch's Cauldron (3%) — catches C11 and any future planner blind spot — tags: `AS-ai-progress`

### C20 — Dead hidden units in the network
- **Source:** owner report (19:43: "there's things that can measure the health of a neural net, like if there are any dead neurons or any irregularities"; 19:47: "Remove the heuristic seats. And fix the dead units.")
- **Commits:** `794ec27` AI tools: health.mjs … · `9827f53` … revive.mjs (revive dead hidden units) · `24a53d3` four-course network … with revived units · later (09-28) `40e7eb2` AdamW with warm-up and clipping, dead-unit count per iteration with auto-revive ("The four-map network had 225/256 first-layer units dead") · `66f2107` halt instead of auto-revive · `21d8679` batch normalisation … · `6b595de` count dead units on a fixed set of full-game positions · `2a0a804` stop only above 30% dead units · `dcce26a` stop only on units killed by training · `9d99fab` Freeze first-first1-31 before reviving its dead units
- **Symptom:** a large share of hidden units never activated; the network's capacity was mostly unused (225/256 first-layer units dead in the four-map network by 09-28 03:07).
- **Mechanism:** Adam at lr 1e-3, no warm-up, no clipping, no normalisation, leaky-ReLU slope 0.01; large updates (and the multi-course transfer with new inputs at zero — hypothesis, not verified) pushed units negative on every position.
- **Root cause:** training ran for days with no per-iteration health measurement, so units died unobserved until the owner suggested looking.
- **Design decision:** training failures were silent: no model-quality checks in the loop — tags: `DD-silent-failure`
- **Siblings:** the dead-unit measure itself was wrong in short-horizon stages (`6b595de`: units unused in a 10-round cap counted as dead); C18 (revive's own check was vacuous); C13 (loop failure only noticed when it stopped).
- **Recommended design fix:** a training recipe that keeps units alive (normalisation, warm-up, clipping) plus per-iteration health checks that halt with the cause — not revival.
- **What we did:** **HACK `9827f53` → HACK `40e7eb2` (auto-revive) → PARTIAL `21d8679` (+ halt `66f2107`)** — reviving the units treated the symptom (they died again: 225/256 eight hours later, and `9d99fab` revived again on 09-28); `40e7eb2`'s optimiser changes and `21d8679`'s batch norm address the cause (46 → 4–6 dead/256 on the replayed iteration); thresholds were then loosened at the owner's request (`2a0a804`, `dcce26a`).
- **Ratchet:** assertion — `train.py` counts dead units on a fixed probe set every iteration and writes a halt file the watchdog respects (`tools/ai/train.py:91-111`).
- **Assertion that would have caught it:** no hidden layer loses more than X% of its units in a training step, measured on fixed full-game positions — per-iteration check in the trainer (halt) — tooling, cheap — yes, from the first iteration of the multi-course run — catches exploding updates, saturation, NaN weights — tags: `AS-training-health`

## 2026-09-27 (messages sent during work)

Source: owner/2026-09-27-queued.md (38 messages sent while Claude was working). 13 of them are the owner's own bug
reports or requests about bugs; two are new bugs (G1, G2), the rest add to existing entries (below). The other 25 are
questions, instructions, task notifications and subagent hand-backs (see chunk notes).

### G1 — Replay controls disappear at the end of every turn
- **Source:** owner report (2026-09-27 00:01 UTC: "And it fades out at the end of every turn. It shouldn't. It should just be a stable button that should never disappear.")
- **Commits:** `3ab0316` Replays: upload a game log and watch it move by move (introduced `#rbar`, a floating `.glass` panel inside `#app`) → `0c6a6f9` Replay panel fits the free space … (script measures the cards/market/prompt and moves the panel) → `f0c51f3` Layout from first principles: page grid with separate cells for the game, replay dock and bot's view … (fix, 24 min after the report)
- **Symptom:** during replay playback the replay controls faded out or went away at every turn change, then came back.
- **Mechanism:** unknown: it can't be reproduced from the record. Two hypotheses, neither verified: (a) `#rbar` sat inside `#app` below the card layer (`#rbar` z-index 14 vs `#cards{z-index:25}`, 0c6a6f9 shell.html:153/238). At each turn change `renderCards` sees `switching` (the replay shows `S.cur`'s hand, ui_state.js:14), fades every hand card out (`el.style.opacity=0`, ui_view.js:419) and flies the next player's hand in from the bottom, across the panel. (b) At moves with no recorded options (every `end` action, heuristic seats), `replayBar` emptied and hid the options list (`w.innerHTML='';w.hidden=true`, 3ab0316 ui_replay.js), so the panel collapsed and regrew around each turn end.
- **Root cause:** whether the replay panel was visible, and how big it was, depended on what the game area was doing (card animations stacked over it, and per-move content), when it should depend only on "a replay is open".
- **Design decision:** replay controls floated inside the animated game area and sized by their content, instead of living in their own layout cell — tags: `DD-float-over`, `DD-content-sized-layout`
- **Siblings:** B1 (the same panel missing at some window sizes; same fix), A15 (the panel covered by the market), B2, C10 (content-sized prompt), P10/P11 (controls that change size or vanish).
- **Recommended design fix:** what f0c51f3 did: controls in a grid cell outside the game area, which game animations can't reach; panels of fixed size whose content changes but which never disappear.
- **What we did:** **ROOT** (`f0c51f3`). The controls moved to `#rdock` and the bot's view to `#rside`, grid cells beside `#gamecell`. `#app{overflow:clip}` and `#shell{isolation:isolate}` (shell.html:137,142) keep every game animation inside the game cell. When a move has no recorded options, the bot's view now shows a line ("No recorded options for this move.") instead of hiding. Both hypotheses are removed by construction, and the owner never reported it again.
- **Ratchet:** test: `test/layout.cjs` replay states (`#rdock` controls on screen and not overlapped, 11 sizes). It checks still frames, not a frame in the middle of a turn change; the cell structure is what stops this bug coming back.
- **Assertion that would have caught it:** "every control the current mode offers is visible and unobscured on every frame, including during animations" — debug tier, sampled per frame while anything animates (`elementFromPoint` at each control's centre returns the control, opacity 1) — reads layout, so debug/test only — would have fired at the first turn change of the owner's first replay — also catches B1, A15, and the controls in P11 that vanish or move — tags: `AS-no-overlap`, `AS-layout-shift`

### G2 — Replays play too fast, and the speed setting couldn't be found
- **Source:** owner report (2026-09-27 00:01 UTC: "Also, it replays too fast. There should be a speed setting for how fast the replay goes.")
- **Commits:** `3ab0316` (introduced: one step every `(reduceMotion?500:750)/speed` ms, and an unlabelled `<select id="rbSp">` of .5×–8× at the end of the floating panel's button row) → `f0c51f3` (fix: `1300 + 900 at a turn's end` ms per step; labelled Slow/Normal/Fast/Faster buttons; 8× dropped) → playtest 09-30 #19 / P17 (top speed 4× now too slow; open)
- **Same bug as:** P17 — the replay pace as a guessed constant: too fast on 09-27, a 4× top speed too slow on 09-30
- **Symptom:** moves went by faster than the owner could follow, and he didn't know a speed control existed.
- **Mechanism:** auto-play started the next move on a fixed 750 ms timer. That timer knew nothing of the move's own animation: the explorer walks 200 ms per space (`animatePiece`, 3ab0316 ui_view.js:209) and the cards fly for 320 ms, so a four-space move was still walking when the next move began. The speed control was a bare "1×" dropdown in a panel that was itself hidden at some sizes (B1).
- **Root cause:** Claude picked the pace as a constant without watching a replay at it or agreeing on it, and the one control that would have let the owner fix it wasn't discoverable.
- **Design decision:** replay pace set by a guessed timer instead of by what the viewer must see (each move's animation plus a hold) — tags: `DD-no-spec`
- **Siblings:** P17 (the same constant, after this fix, judged too slow at 4×); P18 (AI pace chosen the same way); B1 (the panel holding the control was off-screen at some sizes).
- **Recommended design fix:** derive each step's time from the step itself (the animation's end plus a hold, a longer hold at a turn's end) and scale only the hold. Agree the speed range with the owner. Keep the control labelled and in the dock.
- **What we did:** **PARTIAL** (`f0c51f3`). Making the control visible and labelled fixed discoverability properly. The pace, though, is still a pair of tuned constants (replay.js:86 today: `(1300+(endTurn?900:0))/R.speed`) with no link to animation length. Dropping 8× produced the opposite complaint three days later (P17, open). → **NOT FIXED** on 09-30: the 4× top speed is now judged too slow (P17, waiting on the owner's decision).
- **Ratchet:** nothing: no test covers pace; `layout.cjs` only checks the speed buttons are on screen.
- **Assertion that would have caught it:** no runtime property (how fast is "too fast" is a product choice) — **instead:** a replay test that "auto-play never starts a step while the previous step's animation is still running, at any speed", which would have failed for any move of four or more spaces at 1× — tags: `AS-none`

### Additional reports to existing entries
- B5: also reported 09-27 00:04 UTC: "I'm also noticing performance regressions. Things are no longer smooth when I click and drag and when I scroll. There's just lag. / Measure what's going on, profile what's taking up so much of these resources." This is the first report of the jank, 32 minutes before B5's earliest quote (00:36) and 38 minutes before the first fix (`2267837`, 00:42).
- B4: also 09-27 00:04 UTC (same message as above). This changes B4's context: the owner himself called it "performance regressions", which likely explains why Claude went looking for a regression (hypothesis). But in the same message he had already asked for a profile ("Measure what's going on, profile what's taking up so much of these resources"), so at 00:36 he was repeating an instruction that had been set aside, not giving a new one.
- B6: also reported 09-27 00:45 UTC: "One hypothesis: one thing I noticed as well was when you click and drag, once you're holding the board, it's smooth, but when you first click it, to try moving it, there's a little bit of a jerk. Either it's because the jerk is caused by clicking it, or it's like moving in space that makes a jerk, or maybe it's just a jerk because there's a gap in time from when you grab it to when it moves." This changes B6's source: the owner reported it nine minutes before `60332c6` (00:54), so it was not "found by Claude". His three guesses are exactly the three causes 60332c6 lists:
  - "caused by clicking": the grabbing-cursor class restyles the whole board. Still happens for mouse drags (camera.js:117, `if (e.pointerType === 'mouse') v.classList.add('drag')`), i.e. on his own "click and drag" setup; B6's NOT FIXED on desktop stands.
  - "moving in space": the 5 px dead zone jump. Fixed and kept (camera.js:120).
  - "a gap in time": the per-gesture `will-change` re-raster. ROOT in `4f0c94d`.
- B7: also reported 09-27 01:05 UTC: "It's not just that the El Dorado tent also kind of loses its highlight. Like the tent all the way at the end of the treasure city of El Dorado." It confirms the vignette mechanism (`51637b2`'s message: "the El Dorado glow … darkened"). It was fixed 4 minutes later (`51637b2`, 01:09).
- B10:
  - Also reported 09-27 01:16 UTC: "Yeah, if you need to run a rendering experiment, please go ahead and do it. I just was worried that you ended up with in an infinite wall loop. Do your best to run it on a background agent, though. I don't want you to block. I don't like when you block." This names the process fault in B10's mechanism (foreground work blocking replies) in the owner's words. It recurs two days later as E34 ("Design agents ran on the main thread, so the owner kept stopping them"), so the 01:54 background-thread request and this one did not ratchet.
  - Also reported 09-27 01:48 UTC: "Report them alongside. Alongside how much time was spent thinking. Put these in a Git commit as well, like in a markdown so I can see the update. I'm really curious to see how these games go game by game, not just waiting till they're all done. And not just time spent thinking, how many other games they checked, etc. Give me a link to the Git page so I can see how things are going." This is the request that `500c41e` (01:49, "live search-table report (game by game …)") answers.
- A23 (training exploration; see also C1): also reported 09-27 01:43 UTC: "Get rid of the forced transmitter pick." `985d508` (01:44) switched it off rather than removing it, so the fix is a **HACK / `DD-compat-path`**, not a removal:
  - `transEps: 0` (tools/ai/gen.mjs:199, "forced random Transmitter picks removed"), and the forced random buy became `forceBuy: false && …` in the 985d508 diff.
  - The forced-pick code is still live: `engine_bot.js:324–325` (`if(ts&&ts.forceTransmit){…why:'forceTransmit'}`), bundled into the site's `src/engine.gen.js:887–888`.
  - gen.mjs:83 still sets `forceTransmit` from `transEps`, and `tools/ai/progress.mjs:83` still labels it "(retired)".
  - Changing the hard-coded `transEps: 0` back to anything above 0 would silently revive it. Nothing checks that it stays off.
  - The replacement, gift cards (the owner's own 01:41 idea), is one more special case (C1).
- B11:
  - Also reported 09-27 07:24 UTC: "Also, one annoying thing is the AIs will oftentimes use a card halfway and then use it again for the other half. There's no in-game reason for that. It seems to be a bug. First off, it's a training bug. There should be no reason why they should be able to use the card more than once. They know what their options are. They can use their options. But also, the probabilities should be stable, no? I think you should first focus on solving the bug. Why is this happening?" This is a new symptom of the same fault. The engine lets a card keep moving while it has strength left (`T.active={id,pi,sym,left}`, engine_rules.js at 961f83e~1:148), and `botActions` lists both the full reach and the continuation (`engine_bot.js` at 961f83e~1:42). The network also sees `active.left` (line 95). So a split move is legal and ends in the same state as the full move. Choosing "1 space now, 1 more next" over "2 spaces" means the network valued the half-way position above the destination it chose one decision later, with nothing random in between. That is B11's within-turn inconsistency, and his "the probabilities should be stable" is B11's proposed assertion. Softmax exploration in the recorded self-play games may have added some of these (hypothesis, not verified).
  - Also 07:28 UTC: "There also seems to be another bug that for the neural nets, ordering does, in certain cases, shouldn't matter, but it does. Like, it'll say that its highest probability move is to do X, and Y will barely show up. And then the next move, its highest probability move will be to do Y. But like, you could have done Y then X instead of X then Y. Is there a reason why that's happening? …"
  - Also 07:29 UTC: "this is the starting case where this happens :)" (with a position).
  - These three messages are what `961f83e` (07:39, MAXBACK) answers; the later history is as in B11.
- C2:
  - Also reported 09-27 18:16 UTC: "What's the turn it usually finishes by? This is a very important metric for me, almost more important than its competitive ladder elo."
  - Also 19:22 UTC: "For now, there's no need to track against the heuristic model because heuristic models are going to really suck. You can just track versus the itself and just use them like you have. You do need to do ladder testing, of course, but the best, the easiest tracking number is what turns it finishes. That number should be getting better over time, and that's the most important number."
  - These change C2's design-decision note. The owner did specify "better" (arrival round, and self-play without heuristic seats; he had already asked at 07:21 in the main log). `c3c3826` (19:24, EVAL_SELF=1, arrival round per course) implemented it two minutes after 19:22, 11 hours after the first ask at 07:21. The gap was the spec going unimplemented, not a missing spec. C2's "the loop still reads `vsFair`" remains the open part.
- C17: also 09-27 19:10 UTC: "If it's running the model, then obviously that's where the cost is going. But wouldn't that be much faster with the GPU?" This implies Claude had attributed self-play cost to the network (hypothesis: Claude's message isn't in the record). `b37f872` then measured about a third in input building (per-map constants recomputed per position), so the attribution was incomplete, and the owner was being steered toward renting hardware for a JavaScript waste.

## 2026-09-28

### D1 — The owner's questions wait behind Claude's work
- **Source:** owner report (2026-09-28 03:06: "Please answer my question as soon as possible about how bad in practice it is to have so many dead neurons."; 03:07: "I asked you to answer my question, to prioritize answering my question, and then you can get back to getting it working."; 15:58: "While I know you wanted to continue with what you were doing before, prioritize responding to my question."; 16:21: "I just kept on stopping you because you weren't responding to my questions, which is always the priority."; 19:09–19:11: the same question "Why is the initial script so big?" sent three times; 19:10: "Prioritize immediate response to my questions. Figure out how to make this happen."; 19:12: "make it a durable memory"; 22:30: "Respond to my previous message")
- **Commits:** `8dbdca8` CLAUDE.md: the owner's questions come first — stop and answer right away, then resume; (recurrence) `237fd6f` 2026-09-30 CLAUDE.md: how to work with the owner (his words)
- **Same bug as:** C14, H4 — the owner's questions waiting behind, or lost in, Claude's work (09-27, 09-28, 09-29)
- **Symptom:** The owner asks a question and gets no answer for minutes; he has to repeat it, interrupt, and escalate ("Figure out how to make this happen").
- **Mechanism:** Claude was inside long foreground work (watching training iterations, builds, test runs, subagent hand-offs) and either finished its current step or kept going on its own plan before replying; messages queued behind it — 38 of the day's owner messages were delivered only after Claude's turn ended ("sent while Claude was working", owner/2026-09-28-queued.md), including bug reports (D3, D15, D17, D21, D25).
- **Root cause:** One conversation thread was both the owner's channel and the work thread; long-running commands and agents ran in the foreground, so nothing could answer while they ran.
- **Design decision:** Doing long work synchronously in the one thread the owner talks to, and treating "answer first" as a behaviour to remember rather than a structure (work always in the background, the foreground only coordinates). — tags: `DD-process`
- **Siblings:** D18 (the design agent run in the foreground died and was lost; 09-29 19:10 "I keep stopping them by accident on the main thread"); D6/D5 (instructions not followed as given).
- **Recommended design fix:** Every command or agent that can take more than a few seconds runs in the background (background Bash, background agents, the training loop under its watchdog); the foreground only dispatches and reads results, so a new message is always answered on the next turn.
- **What we did:** **PARTIAL** `8dbdca8` (editor: first classified as a hack here; a written rule suppresses no symptom, and C14 and H4, the same bug, count it as partial) — a rule written into CLAUDE.md:17-19; the working structure (foreground long work) did not change. Later history: 22:30 the same day ("Respond to my previous message"), 09-29 19:10 (agents on the main thread again) and `237fd6f` on 09-30 rewrote the rule in the owner's words: the rule alone did not hold.
- **Ratchet:** nothing (a line of documentation).
- **Assertion that would have caught it:** "an owner message is answered before any other tool work continues" — no code assertion is possible (a working-process property); the check is a session-level budget: time from an owner message to the first reply under ~1 minute, or a harness hook that refuses a foreground command longer than N seconds. It would have fired on the first 03:06 message. — tags: `AS-none`

### D2 — Single-use cards played for movement came back after the reshuffle
- **Source:** owner report (2026-09-28 05:01: "I think I might have found the bug. My giant machetes did not discard. That's why the models don't give a fuck about them."; clarified 05:10: "If you're only getting a half coin, they shouldn't discard it. It's only discarding when you're using the treasure chest and getting the full four coins."; follow-up 16:06: "are you absolutely certain that ... the draw cards that are supposed to be single use are single use?")
- **Commits:** `e6ae810` (introduced, first import); `0e2bdbb` Rules fix: single-use cards played for movement are removed from the game; `20b71ed` Freeze first-shared-8 (trained under the single-use bug) as the start of the retraining run; `a17086a` Site AI: the new First Expedition network (first network trained under the fixed rule)
- **Symptom:** Giant Machete, Prop Plane and Treasure Chest used to move went to the discard pile and returned every reshuffle; every AI network trained until then learned the wrong game.
- **Mechanism:** In `applyAction` the move branch did `P.play.push(a.card)` for every card; only the action-card branch and the pay branch checked `once` (now engine_rules.js:248 move, :281 action, :307 pay, three separate conditions).
- **Root cause:** Where a used card goes is decided separately inside each action branch, so the single-use rule had to be remembered three times and was forgotten once.
- **Design decision:** A card's lifecycle (hand → play/trash) is written inline per action instead of by one function that knows each card's definition and how it was used; and no rules test went card type by card type through every way to use it. — tags: `DD-per-element-patch`
- **Siblings:** Every network trained before 05:06 (the whole shared/multi-map line; RUN=rules restarted from first-shared-8, `20b71ed`); the pay branch's own condition (`d.once&&(d.c==='y'||d.c==='x')`, :307) is a third copy of the rule that matches the owner's 05:10 clarification only by construction; any new single-use card or new way to play a card repeats the risk.
- **Recommended design fix:** One `spend(gs, P, id, use)` that routes a card after use from its definition (`once` + whether the use consumed its face), called by every branch; plus a table-driven rules test: every card type × every way to use it → expected zone.
- **What we did:** **PARTIAL** — the move branch got its own `if(d.once)` (one-line fix, correct); the three copies remain.
- **Ratchet:** test — test/engine.test.mjs:112-121 (Giant Machete and Prop Plane played for movement end in trash and never come back); later test/rules.test.mjs:154-156.
- **Assertion that would have caught it:** "a single-use card that was played for its face never returns to a deck, hand, discard or play area" — postcondition in `applyAction` after each action (the `play` event names the card) — always-on, cheap — would have fired in the first game where anyone moved with a Giant Machete (very common in AI self-play) — generality: a per-card lifecycle invariant also catches Travel Log/Compass/Transmitter mistakes and card loss or duplication (card conservation). — tags: `AS-engine-invariant`, `AS-rules-vs-rulebook`

### D3 — A "Buy" button that could never be the way to buy
- **Source:** owner report (2026-09-28 05:11, sent while Claude was working: "Also on Card Buy, it currently auto-buys when you've hit the value necessary, but while you're putting, there's also a button in the right-hand corner that says buy, which feels like you need to click it. So it's just a mess of design language.")
- **Commits:** `4bc63f0` Buying: drop the Buy button — the card is bought as soon as the cards paid cover its price
- **Symptom:** In pay mode the prompt showed a primary "Buy" button, disabled until the price was covered; once covered, the purchase completed by itself 300 ms later, so the button looked required but never mattered.
- **Mechanism:** `payProgress()` auto-confirmed the purchase with `setTimeout(confirmBuy, 300)` when `payTotal()>=cost`, while `renderPrompt` also rendered `{t:'Buy',id:'bBuy',dis:t<c,fn:confirmBuy}` (ui_view.js at 4bc63f0^).
- **Root cause:** Two mechanisms completed the same step (automatic completion and an explicit button), added at different times.
- **Design decision:** Each mode's button list is written by hand next to (not derived from) the interaction that actually completes the mode. — tags: `DD-two-mechanisms`
- **Siblings:** The auto-buy still completes on a 300 ms timer with a re-check (src/client/actions.js:181-182: `setTimeout(()=>{if(UI.mode==='pay'&&UI.buy===b&&payTotal()>=c)confirmBuy();},300)`), a latent timing dependency; playtest #13 (each mode builds its own button list, so buttons jump); the longer pay prompt added here is part of playtest #12 (buy mode wraps to two lines).
- **Recommended design fix:** A mode declares its completion rule once (here: "covered → buy"); the view derives its controls from the mode, so a control that can't be the next action can't be drawn.
- **What we did:** **ROOT** for the duplicate control — the button was deleted and the prompt says what happens (src/client/hud.js:57); the timer-based completion was left as it was.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "every enabled control in the current mode leads to an action the engine would accept now" — per-frame view check in debug mode — would have fired the first time a price was covered (the button was enabled for 300 ms and then the mode ended under it) — generality: catches dead buttons, stale buttons after a mode change, the All-cards-overlay-in-wrong-mode class. — tags: `AS-view-matches-state`

### D4 — Training iterations far slower than Claude said
- **Source:** owner report (2026-09-28 05:25: "Why is each iteration taking so long? Didn't it used to take much faster?"; 05:56: "how long is it taking to run a single run now?"; 05:34: "Why is the first iteration taking so long? I thought you told me it should only take four minutes."; 06:07: "Didn't he say it was supposed to only take two minutes? I thought reusing the new model shouldn't have slowed anything down."; 06:59: "How is it only in its first iteration now?"; 08:09: "Make the testing time shorter since it's taking up so much of the iteration time.")
- **Commits:** `21d8679` (BatchNorm, new curriculum from a fresh network), `c49a6ee` (PAIRED tests with EVAL_CAP full games, 168 games), `dcce26a` AI training: ... faster iterations (GAMES and EVAL_EVERY knobs)
- **Symptom:** Iterations took much longer than the durations Claude had quoted, and a run restarted after a worker restart looked like it was "only in its first iteration".
- **Mechanism:** Each iteration ran 600 self-play games, training, then 160–168 test games (with `PAIRED=1`/`EVAL_CAP`, full-length games); the tests alone took a large share of the iteration (the owner's 08:09 observation). The quoted durations came from earlier configurations. The 06:59 "first iteration" was a new run (RUN=r20, started with `c49a6ee` at 06:55) — hypothesis from the commit times, not verified in logs.
- **Root cause:** Durations were quoted from memory of older settings instead of measured after each recipe change; test cost was fixed per iteration rather than budgeted.
- **Design decision:** Reporting estimates instead of measurements, and adding work to the loop (full-game paired tests, BatchNorm) without re-measuring its cost. — tags: `DD-process`
- **Siblings:** D5 (many recipe changes at once), D7 (numbers reported that didn't match the live page).
- **Recommended design fix:** The loop logs its own phase timings every iteration (the live page already shows minutes per iteration, `9d5d818`), and Claude quotes those; test frequency is a budget (e.g. ≤20% of iteration time).
- **What we did:** **PARTIAL** `dcce26a` — knobs to run fewer games and test every n-th iteration; no budget or check on the estimate.
- **Ratchet:** nothing (the live page's "Min" column makes it visible, but nothing fails).
- **Assertion that would have caught it:** "an iteration takes about the time stated for it" — no code assertion (a process property); name the budget: the loop warns when an iteration exceeds 1.5× the time logged for the previous configuration or when tests exceed 20% of it. It would have fired on the first slow iteration. — tags: `AS-none`

### D5 — Training thrash: started from scratch against the owner's wish, then a broken warm start and too many changes at once
- **Source:** owner report (2026-09-28 05:59: "Wait, is it a random network? I thought we were reusing the old network."; 06:01: "I'd prefer if you reuse the old model if possible... We're just wasting so much training."; 05:48: "The model is in a really shit place."; 07:54: "when we first trained the first model, everything worked... Why are we thrashing around so badly now? ... From now on, just train on one map."; 07:58: "if there is no progress, it's probably we're just overcomplicated everything. Just go back to what the original thing that actually worked.")
- **Commits:** `40e7eb2` (AdamW + warm-up + clipping + auto-revive), `21d8679` (BatchNorm + leak 0.03, curriculum "from a fresh network"), `c49a6ee` (review fixes: Double-Q, TRUNC, paired tests, no heuristic samples), `0384790` freeze first-r20-9; switch to one map (owner), `dcce26a` original-recipe switches, `2419661` first-first1-27 beats the heuristic (1.23x), `945ae67` first-first1-best 2.31x
- **Symptom:** After the rules fix the network collapsed (first-reuse-7: 0.06 then 0 wins against the heuristic; RUN=r20: 0–0.08 wins, arrival ~25; tools/ai/models/README.md "first-reuse-7", "first-r20-9"), for about four hours.
- **Mechanism:** (a) The curriculum was restarted from an untrained network although the owner had said reuse was fine and preferred; (b) the warm start then loaded old weights into a changed function — leaky slope 0.01 → 0.03 and BatchNorm inserted — never checked to reproduce the old outputs (the independent review, docs/AI_TRAINING_REVIEW.md item 1: "Warm start is not a faithful copy of the old network"); (c) at the same time the optimiser, target (Double-Q, bootstrapped truncation, D6), round cap, sample mix and four maps all changed.
- **Root cause:** Many untested changes stacked on a network already trained under the wrong rules, with no control run and no equivalence check, so no single change could be blamed or reverted.
- **Design decision:** Changing the training recipe many variables at a time without a frozen known-good baseline, and substituting Claude's plan (fresh network) for the owner's stated preference. — tags: `DD-process`
- **Siblings:** D6 (bootstrapped target replaced the owner's spec); D4; the dead-unit saga (reported 09-27, see chunk notes) — its auto-revive and threshold tuning were part of the same stack.
- **Recommended design fix:** One change per run against a frozen control; a warm start must reproduce its parent (max |Δ| < 1e-5 on the probe set) before training; keep the last recipe that worked as the default.
- **What we did:** **PARTIAL** — on the owner's order the run went back to one map and the old small network (first-distill-35) with fewer changes, and it worked within an hour (`2419661`, `945ae67`). No rule, test or check was added that would stop the next stacked change or a non-faithful warm start (`dcce26a` only adds switches back to the original recipe).
- **Ratchet:** nothing for training (the related `tools/ai/golden.mjs` test from `e01d0c5` pins network outputs across engine refactors, not across recipe changes).
- **Assertion that would have caught it:** "a warm-started network gives its parent's values on the fixed probe positions before any training" — precondition in train.py at load — always-on in the tool, cheap — would have fired at iteration 0 of first-reuse — generality: catches slope/BatchNorm/feature-order changes and fold bugs (the tool-side twin of golden.mjs). — tags: `AS-training-health`

### D6 — Cut-off games scored by the network's own guess, against the owner's specification
- **Source:** owner report (2026-09-28 07:38: "Why in the world does the target the network's own evaluation of the position? The target should 100% be how far it got. What the hell, man?"; his spec at 05:48: "We can do the training run capped at five moves and reward whoever got the furthest."; 08:07: "just confirming it's training against how far it got if it doesn't reach the end.")
- **Commits:** `c49a6ee` AI training: fixes from the independent review (adds `TRUNC=1`); `45e04de` spec: cut-off games scored by how far each player got (the bootstrapped scoring is off)
- **Symptom:** A player still racing at the round cap was scored by the generating network's value of its last position, not by how far it got; RUN=r20 trained that way until iteration 7 (tools/ai/models/README.md "first-r20-9": "bootstrapped cut-off scoring until iteration 7").
- **Mechanism:** tools/ai/gen.mjs:21-23 and :156-157: with `TRUNC=1`, `z = E.botNetValue(traj[i][last])` for capped players.
- **Root cause:** The independent review (item 2) recommended it and Claude applied it without asking, although the owner had specified the target.
- **Design decision:** Treating the owner's instruction as a default that a reviewer's or Claude's preference may replace (CLAUDE.md, owner 09-30: "My instructions are specifications, not suggestions"). — tags: `DD-process`, `DD-compat-path`
- **Siblings:** D5 (fresh network instead of reuse); the TRUNC, HEUR_SAMPLES, DOUBLE, PAIRED, MIX_PLAIN... env flags kept alive after the choice was made (owner 20:16: "If there's a bool and you only use true and you never use false, it shouldn't be there").
- **Recommended design fix:** A change to anything the owner specified is proposed and waits for his answer; options that were decided are deleted rather than kept as flags.
- **What we did:** **PARTIAL** — the run stopped using it (iteration 8 on) and the spec was corrected (`45e04de`); the bootstrapped path is still in gen.mjs behind `TRUNC`.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no code assertion (a decision process); name the check: each run logs its target definition at start and it is compared to the owner-approved spec (docs/AI_TRAINING_SPEC.md), refusing to start on a difference. — tags: `AS-none`

### D7 — The live training page showed different arrival numbers than Claude reported
- **Source:** owner report (2026-09-28 09:07: "Why do I see different values than you see on the live update where the arrival round is lower?")
- **Commits:** none (no change followed; the page is `9d5d818`, `21d8679`, `c49a6ee`)
- **Symptom:** The owner saw a lower arrival round on /train.html than the one Claude quoted.
- **Mechanism:** Hypothesis, not verified: two arrival figures exist — the page's "Arrival round in tests" is the mean over players who arrived (gen.mjs:162 `if (p.fin) { t.arrSum += p.fin; t.arrN++; }`, train.html:58 "players who arrived"), which under a round cap drops the slow players and reads low, while Claude quoted the paired full-game test (README: "arrival round 19.0"); the per-map chart compares against hard-coded references from another network (live.mjs:8 `BASE`).
- **Root cause:** The same named metric is computed from different test sets in different places, and the page doesn't say which.
- **Design decision:** Metrics defined where they're printed rather than once. — tags: `DD-multi-source-truth`
- **Siblings:** D4 (quoted numbers vs measured ones).
- **Recommended design fix:** One metrics definition (name, test set, cap, who's counted) used by the loop, the page and Claude's reports.
- **What we did:** **NOT FIXED** (answered in chat; unknown whether the explanation was right).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no assertion (a reporting convention); name the check: every number Claude reports is copied from the same summary line the page reads. — tags: `AS-none`

### D8 — Misaligned top bar, prompt/market and menu controls (design review A2, A3, A4, A7, A8, A19)
- **Source:** found by Claude (professional design review by a subagent, docs/DESIGN_REVIEW.md §4, commit `4407efc` 09:49)
- **Commits:** `95e4014` UI alignment fixes from the design review (A2, A3, A4, A7, A8, A19, A23)
- **Symptom:** HUD items 45/29/33 px tall, top-aligned (centres 34.5/26.5/28.5); the active player chip moved 1 px down each turn (`transform:translateY(1px)`); prompt top 64 px vs market 66 px; start-screen select 36 px, input 37 px, segmented control 38 px; course cards 57.3 vs 56 px; checkbox indented 4 px; lobby rows 38 vs 46 px.
- **Mechanism:** Each element's size came from its own padding + content, and positions were literals typed per element (`top:64px`, `top:66px`, `top:58px` in a breakpoint).
- **Root cause:** No shared size/position tokens: rows were aligned by coincidence of paddings.
- **Design decision:** Content-sized, per-element layout. — tags: `DD-content-sized-layout`
- **Siblings:** Playtest #12 (prompt pill follows its text), #13 (buttons move with the mode's button list), #14 (player bar jumps 51 px at "Round N · final"), D21 (menu panel size), D10 (the review items left open).
- **Recommended design fix:** Rows are grid/flex rows with one height token and `align-items:center`; vertical positions come from named row lines (`--row2`), never per-element literals; state (active) never changes geometry.
- **What we did:** **PARTIAL** — tokens introduced for these rows (`--hudH`, `--row2`, 38 px controls, `.clist button{min-height:60px}`) and the 1 px nudge removed; the playtest siblings show the content-sized decision still stands elsewhere.
- **Ratchet:** nothing (test/layout.cjs checks controls don't overlap, not alignment).
- **Assertion that would have caught it:** "items in one row share a height and a centre line; state changes never move an item" — test tier (reads layout), run per screen at the 5 layout sizes; the second half as a debug layout-shift observer — the observer would fire at every turn change (the chip nudge) — generality: all alignment drift and jump bugs. — tags: `AS-alignment`, `AS-layout-shift`

### D9 — Online game starts with the market covering El Dorado (design review A23)
- **Source:** found by Claude (design review A23, screenshot `47-online-myturn_1440`)
- **Commits:** `95e4014` (setTimeout refit); `b6b907c`/`0a6cba4` 09-29 front-end refactor (one `showGame()` and `fitSoon` after the frame's updates)
- **Symptom:** At the start of an online game the board extended under the market and El Dorado was hidden; local games fitted correctly.
- **Mechanism:** `applyServerState` called `fit()` right after `buildBoard()`, before `render()` had sized the market and set `--mktFoot`; the local path fitted after render.
- **Root cause:** Two code paths started showing a game (local and online), each with its own order of build/render/fit, and `fit` read layout that `render` writes later.
- **Design decision:** Correctness depended on call order, duplicated per path. — tags: `DD-two-mechanisms`, `DD-imperative-sequencing`
- **Siblings:** c3070ca (09-29: market open/close refit after a 10 ms timer), 09-29 00:19 "It's still resized a second after you hit start"; any code that measures before an update is drawn.
- **Recommended design fix:** One `showGame()` for every way a game appears, and fitting always runs after the frame's updates (the `after()` queue).
- **What we did:** **HACK `95e4014` → ROOT `0a6cba4`** — first `setTimeout(()=>{if(!userZoomed)fit();},0)` ("again once render() has sized the market"); the refactor made both paths call `showGame()` (src/client/online.js:95) whose `fitSoon` = `after(() => { measure(); fit(anim); })` (src/client/board/camera.js:62).
- **Ratchet:** nothing specific (test/online.cjs doesn't check the fit; the CLAUDE.md rule "measuring after an update goes in after()" is documentation).
- **Assertion that would have caught it:** "after a fit, El Dorado and every explorer are on screen and not under a control" — postcondition of `fit()` in debug mode (reads rects) — would have fired at every online game start — generality: catches the market/zoom column/prompt covering the board at any size. — tags: `AS-no-overlap`

### D10 — Design-review defects found and left open (A1, A9–A18, A20–A22, A24)
- **Source:** found by Claude (docs/DESIGN_REVIEW.md §4, `4407efc`, 09:49)
- **Commits:** `4407efc` (found); later fixes where known: A20 `c134b02` (only after the owner hit it, D20), A13 `127544c` (09-29, chips shrink), A14/prompt `9e85226` (09-30, partial); the rest none
- **Symptom:** Measured defects: start modal scrolls 6 px at 1440×900 (A1); nine button sizes/radii (A9); the primary button changes position per mode (A10 → playtest #13); resting hand 15–26 % below the screen (A11); fan off-centre after a card leaves (A12 → playtest #15 "hole in the hand"); third player chip hidden on phones (A13); prompt wraps under the name (A14 → playtest #12); "Can buy" tag and count badge overhang (A15); "Jack of All Trad…" truncated (A16, still `text-overflow:ellipsis`, shell.html:342); All-cards close button off the column (A17, still `position:fixed;top:14px;right:16px`, shell.html:275); game-over rows misaligned on phones (A18); El Dorado label on a finishing space (A20); blockade badge id on the cost diamond (A21); CTA alignment (A22); zoom range 0.25–3.2 regardless of fit (A24, still camera.js:79).
- **Mechanism:** The fix commit `95e4014` took only the items it could fix quickly; the rest stayed in a document.
- **Root cause:** Findings lived in a report, not in a tracked list or a test, so nothing forced them to be fixed or re-checked; A20 was measured at 09:49 and the owner reported the same overlap at 20:11 ("weird overlap here").
- **Design decision:** Known defects kept as prose instead of failing checks. — tags: `DD-process`, `DD-content-sized-layout`
- **Siblings:** D20 (A20), playtest #12, #13, #15, #32 (market hover overlaps Menu / badge clipped ≈ A15).
- **Recommended design fix:** Each measured defect becomes a failing check (alignment/overlap test at the layout sizes) or an item on the owner's ledger; a review isn't done until its findings are tests or explicit "won't fix" decisions by the owner.
- **What we did:** **NOT FIXED** (most items); A13, A20 fixed later, A14 partly.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** the same two test-tier properties as D8/D9: "rows align" and "nothing drawn that must be readable or tappable is covered or clipped" — at the 11 layout sizes — they would have kept failing until each item was fixed or explicitly accepted. — tags: `AS-no-overlap`, `AS-alignment`

### D11 — Training runs crashed at start: a comment swallowed the setup line
- **Source:** found by Claude (feature-trial runs crashed at start)
- **Commits:** `f9f4942` AI feature trial ... (introduced: ITERS added with a mid-line comment); `b528ab8` loop.sh: fix the ITERS line
- **Symptom:** Feature-trial runs died immediately (about 27 minutes between the two commits).
- **Mechanism:** tools/ai/loop.sh line 14 packed several statements on one line; `# ITERS: ...` was inserted after the first statement, turning `D=...; P=...; NET=...; LOG=...; mkdir -p $D` into a comment; under `set -u` the first use of `$D` aborted.
- **Root cause:** Dense one-line shell configuration (several assignments per line, `ca67da8` "fits the watchdog's one-line config") where an inline comment silently removes statements; the edited script was launched without a dry run.
- **Design decision:** Launching an edited training script without a smoke run. — tags: `DD-dense-lines`, `DD-process`
- **Siblings:** Any unattended overnight run started after a script edit.
- **Recommended design fix:** One statement per line in loop.sh, and a `DRY=1` smoke mode (one tiny iteration) run after every edit before a real run.
- **What we did:** **PARTIAL** — the comment moved to the end of the line; the line is still packed.
- **Ratchet:** nothing (though `set -u` made the failure loud, which is why it was found fast).
- **Assertion that would have caught it:** `set -u` did catch it — at start, loudly; the missing piece is a smoke run before launch (`DRY=1 loop.sh` must reach the end of one iteration). — tags: `AS-none`

### D12 — The site loads slowly: one 313 KB page for a tiny start screen
- **Source:** owner report (2026-09-28 18:49: "Also the website should load really fast... Start screen should also be really fast use every trick in the book"; 19:09–19:11: "Why is the initial script so big? Can't you start with the bare minimum to render start screen then load rest after. Isn't the start screen tiny"; 09-29 00:06: "when I went to it on my mobile phone, it took like a couple of seconds to load")
- **Commits:** `1f52aaf` Faster page load: self-hosted fonts, minified script, no board redraw on Start, audio set up while idle; `525ea29` Page split for the first round trip; (follow-ups) `690402e`, `9c62c67` 09-29 (the start screen's background is the game; replaces the `buildBoard.sig` cache)
- **Same bug as:** E2 — the slow first load on the owner's phone (the 09-28 reports and 09-29 00:06)
- **Symptom:** Several seconds to a usable start screen on a phone; Start itself ~0.6–1.1 s.
- **Mechanism:** build.mjs inlined the engine, the whole UI, all CSS and a render-blocking Google Fonts stylesheet from another domain into one index.html (313 KB, ~79 KB brotli); the start screen appeared only after the whole script parsed; pressing Start re-laid out ~100 ms of board labels and created the AudioContext (~100 ms) inside the click.
- **Root cause:** The site used the same one-file shape as the claude.ai artifact (build/artifact.html), so the critical path was the whole game; page load had never been measured at phone speeds before this complaint (test/loadbench.cjs was written in `1f52aaf`).
- **Design decision:** No load budget and no measurement in the owner's real setup (phone, mobile network); the delivery format followed the artifact's constraint. — tags: `DD-no-budget`, `DD-untested-real-setup`
- **Siblings:** D29 (blank screen for returning players, `525ea29`), playtest #2 and #17 (boot waterfall: /api/config → /api/me → profile), D30 (fonts swap).
- **Recommended design fix:** A first-paint budget (the start screen's markup + CSS in the first ~14 KB, no script or network on its path) enforced by the build, and a load test at phone settings in the test run.
- **What we did:** **HACK `1f52aaf` → ROOT (payload) `525ea29`, PARTIAL overall** — `1f52aaf` trimmed (minify, self-host fonts, idle audio) and added a `buildBoard.sig` cache to skip the redraw on Start (a cache keyed on course+blockades, later replaced by `9c62c67`); `525ea29` changed the decision for the payload: index.html is only the start screen (9.7 KB compressed; phone first visit 1.65 s → 0.60 s, commit message), the game's CSS/JS are hashed files. The boot still waits on the network for the saved-game decision (D29, playtest #2/#17).
- **Ratchet:** nothing — the 14 KB rule is a comment (build.mjs:50-52) and a CLAUDE.md line; no build or test fails when index.html grows; test/loadbench.cjs reports medians but has no pass/fail and isn't in test/run.mjs.
- **Assertion that would have caught it:** "the start screen is painted within 1 s on the phone profile (4× CPU, 150 ms RTT, 1.6 Mbit/s), before any script or API reply" and "index.html ≤ 14 KB compressed" — test tier: a size check in build.mjs plus loadbench with a budget in test/run.mjs — would have failed from day one — generality: catches every addition to the critical path and every screen that waits on the server. — tags: `AS-latency-budget`

### D13 — Wheel-zoom latency over budget once the real fonts loaded; shipped failing, then the test was loosened
- **Source:** found by Claude (test/render.cjs failed while making `1f52aaf`: "render.cjs wheel-latency p95 fails (~120 ms) now that the real fonts load in the test (the sandbox blocked Google Fonts before)")
- **Commits:** `1f52aaf` (found, shipped with the failure noted as "an existing cost to investigate"); `63c9433` 09-29 render test: check the wheel-zoom latency median (p95 < 100 → median < 80)
- **Same bug as:** E11 — the wheel-zoom latency check that failed in `1f52aaf` and was loosened in `63c9433` (E11 also covers the select budget)
- **Symptom:** Wheel-zoom latency p95 ~120 ms on the throttled test against a 100 ms budget.
- **Mechanism:** Unknown — the commit shows it appeared when the self-hosted fonts first loaded in tests (with fonts removed p95 was 75 ms); hypothesis, not verified: text layout of the HTML board labels in the web fonts costs more per zoom bake.
- **Root cause:** Until `1f52aaf` every render/perf test ran without the page's real fonts (the sandbox blocked Google Fonts), so budgets had been measured on a page the owner never saw.
- **Design decision:** Measuring a different page than the owner's (headless, fonts blocked). — tags: `DD-untested-real-setup`, `DD-process`
- **Siblings:** D19 (Google's button never loads in tests either: test/lib.cjs:44-45 ignores gsi and fonts errors); playtest #7/#9 frame drops measured only after the owner complained.
- **Recommended design fix:** Tests load exactly what production loads (self-hosted fonts, a stub for third-party frames), and a failing budget blocks the push until the cause is found.
- **What we did:** **HACK** — shipped with a CLAUDE.md-required test failing, then `63c9433` changed the test (median instead of p95, "the p95 of 24 events swings 90-240 ms between runs") instead of finding the cause; the latency tail was never explained.
- **Ratchet:** nothing (weakened: `63c9433` removed the p95 check).
- **Assertion that would have caught it:** "wheel-zoom input latency p95 < 100 ms at 4× CPU with the production fonts" — test tier (render.cjs, as it was) — it did fire; the process failure is overriding it — generality: every pan/zoom regression. — tags: `AS-frame-budget`

### D14 — AI seats offered in setups the AI was never trained for (2-player games, other courses)
- **Source:** owner report (2026-09-28 19:09: "Also add in the best model for the starting map and turn off ai for other maps for now."; 19:17, sent while Claude was working: "also get rid of 1 vs 1s having ai option since ai hasn't been trained on 1 vs 1 :)")
- **Commits:** `37cfd2e` 09-27 (named AI seats, offered everywhere); `a17086a` Site AI: the new First Expedition network; AI seats only on First Expedition with 3-4 players
- **Same bug as:** C11 — AI seats in 2-player games the network was never trained for: C11 found it, D14 is the owner's request; both addressed by `a17086a`
- **Symptom:** The setup screen and online rooms let you seat an AI on any course and in 2-player games, where no network had been trained (the rules text said "on other courses the AIs use the route planner"; 2-player games ran the 3-4-player network with two explorers each).
- **Mechanism:** The AI list was offered unconditionally; the engine silently switched to the planner off First Expedition (`aiUsesNet`), and nothing knew about player counts.
- **Root cause:** What an AI supports wasn't a declared property, so the page offered everything and the engine quietly degraded.
- **Design decision:** Supported configurations never specified; a silent fallback (planner) instead of refusing. — tags: `DD-no-spec`, `DD-silent-failure`
- **Siblings:** D26 (Orellana: an AI variant shipped without a quality check); the replay evaluation panel shows a value only where a network exists (replay.js:27-28 uses the same predicate); playtest #22 (AIs only on First Expedition 3-4p, the product consequence).
- **Recommended design fix:** Each AI declares the (course, player count) set it was trained for, in the engine; page, server and replay ask that one predicate.
- **What we did:** **ROOT** — `aiAllowed(course,n)` in src/engine_ai.js:22-24, used by the setup (menu.js:131), the room lobby (menu.js:219), the server (worker.js:493 addAI, :512 start) and the replay evaluation. Counted **PARTIAL** (editor, see verify.md): the silent fallback named in this entry's design decision is still in `aiChoose` (`src/engine_ai.js:39`: `opts={mode:'plan'}` when the network is missing, trained for another course, or the game has 2 players) and in `aiPlan` (:47); `newGame` asserts nothing and no test covers the refusal. C11, the same bug, counts it as partial.
- **Ratchet:** nothing automated (the server refusal is validation, but no test covers it).
- **Assertion that would have caught it:** "an AI seat exists only where its model was trained" — precondition in `newGame` (assert per seat) — always-on, cheap — would have fired at the first 2-player game with an AI — generality: any future AI or course added without a model. — tags: `AS-engine-invariant`

### D15 — No menu during a game: leaderboard, resign and sign-out only by abandoning or digging
- **Source:** owner report (2026-09-28 19:22, sent while Claude was working: "you should still be able to check the leaderboard while you're playing a game without starting a new game. Like, you should be able to go to the menu."; 19:38: "There's no resign button, just a new game button. There should be a resign button."; 19:38, queued: "Also, there should be a way of signing out once you sign in."; 19:39, queued: "I might not be seeing the latest one, but in my current one, I don't see any main menu option :)"; 19:30, queued: "make sure to occasionally push domain so I can see what the current results look like.")
- **Commits:** `3c496d1` ... Menu and Resign ("Top bar: Menu opens the start screen without ending the game (Back to game, Resign). Local resign added. Sign out link at the top of the Online screen."); `82b11a7` (account bar with sign-in/sign-out at the top of the menu); `6300401` (one dialog with an in-game bar); `bf321e8` 09-29 (tabs, no Back buttons)
- **Symptom:** In a game the top bar's only exit was "New game" (local) or "Leave game" (online); there was no local resign; sign-out existed only inside Online → Profile. The owner also couldn't see the fix at 19:39 because it hadn't been pushed (committed 19:46).
- **Mechanism:** `$('#menuBtn').textContent=REPLAY?'Exit replay':online()&&!S.over?'Leave game':'New game'` (ui_view.js at `3c496d1^`:890): the start screen doubled as the new-game screen, so opening it meant leaving the game; `#hOut` "Sign out" sat only in the Profile tab (ui_online.js at `3c496d1^`:44).
- **Root cause:** "The menu while a game is running" was not a state; each screen hand-wired its own exits.
- **Design decision:** Menu navigation never specified as a whole. — tags: `DD-no-spec`
- **Siblings:** D28 (no way back to local), playtest #24 (New game discards without confirm), #28 (the menu doesn't pause the AIs); the process part (not pushing increments he can see) recurs as "Is it pushed?" on 09-29 01:37/01:41.
- **Recommended design fix:** One menu reachable at any time, with the running game as context (a game bar: back, resign/end), account always at the top; pushing each working increment.
- **What we did:** **PARTIAL `3c496d1` → ROOT `6300401`/`bf321e8`** — first a Menu button that opens setup with an in-game row; then one dialog whose screens all sit under a game bar and account bar.
- **Ratchet:** test — test/menus.cjs "Menu during a game: the game bar and the tabs" (and watching a replay from the menu keeps the game).
- **Assertion that would have caught it:** "from a running game every menu destination (leaderboard, replays, profile, sign-out, resign) is reachable without ending the game" — test tier (menus.cjs walks it) — would have failed as soon as online play existed — generality: dead ends and one-way doors in any flow. — tags: `AS-view-matches-state`

### D16 — "Your games" reshuffles when the online list arrives
- **Source:** found later (playtest 2026-09-30 #16 "My games reshuffles"); introduced here
- **Commits:** `3c496d1` Every game is recorded and can be watched as a replay... (introduced); `69b2191` (server list moved to /api/users/<me>); current src/client/menu.js:241-247 unchanged in shape
- **Same bug as:** P14 — the merged My games list (`3c496d1`), reported in the playtest (#16)
- **Symptom:** The Replays list draws this device's games, then online games arrive and are merged in and re-sorted, so rows jump under the pointer.
- **Mechanism:** `showMine([])` renders local games, then `api(...).then(j=>showMine(j.games))` re-renders the merged list sorted by date (menu.js:244-247); failures are dropped with `.catch(()=>{})`.
- **Root cause:** One list from two sources of truth (device storage and the server) that arrive at different times.
- **Design decision:** The same records kept in two places and merged in the view. — tags: `DD-multi-source-truth`, `DD-server-first`
- **Siblings:** Playtest #5 (rejoin flashes the room lobby before the server says lobby or game), D29, the profile "Loading…" flash noted in D25.
- **Recommended design fix:** One list with stable slots: online games in their own section (or the device list extended in place without reordering), and the local list never re-sorted by a network reply.
- **What we did:** **NOT FIXED.**
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "nothing on screen moves without an animation or a direct action" — debug layout-shift observer on the menu — would have fired every time Replays opened while signed in with online games — generality: all late-data jumps. — tags: `AS-layout-shift`

### D17 — Player chips showed a "total blockade value" that isn't the tie-break
- **Source:** owner request, then report (2026-09-28 19:31, sent while Claude was working: "Also make sure that the user knows how many blockades they have, like their total number of blockades. Not the number of blockades, but like the value of their total value of their blockades."; 19:48: "Do you want the tie-break changed to total value? isn't that the offical rule?"; 19:49: "oh I've played wrong my whole life lol yah keep the correct rules and have it show you're num blockades as well as you're biggest")
- **Commits:** `3c496d1` (introduced, as asked at 19:31: "Player chips show the total value of blockades held"); `d729c3d` Player chips: number of blockades and the biggest one (the official tie-break), instead of their total
- **Symptom:** The top bar showed each player's summed blockade value, a figure that decides nothing in the rules the engine plays (count, then biggest); the owner had asked for it believing it was the tie-break, and only realised 17 minutes later.
- **Mechanism:** ui_view.js computed `bv=p.blocks.reduce((a,b)=>a+S.blockades[b].n,0)` for the chip and the game-over row, while the engine's `endGame` ranks by count, then biggest (now engine_rules.js:369-371 `keyOf`). The game-over screen itself already said "split by blockades held, then the highest-numbered blockade".
- **Root cause:** A rules-flavoured figure was built in the page from the request's wording, and nobody compared it with the rule the engine implements; Claude implemented the request without pointing out that it contradicted the tie-break (the owner raised it himself at 19:48).
- **Design decision:** Rule-derived numbers computed in the page, and a request that touched a rule not checked against the engine/rulebook before implementing. — tags: `DD-rules-outside-engine`, `DD-no-spec`
- **Siblings:** The page still recomputes "biggest" itself (src/client/dialogs.js:42, :56 `Math.max(...blocksOf(S,i).map(...))`); playtest #30 (end screen's unexplained order for non-arrivals: the engine's progress key isn't shown).
- **Recommended design fix:** The engine exports the ranking key per player (`placeKey(gs,i)` with its parts) and the page only formats it; a request that names a rule is checked against the engine and the rulebook, and a mismatch is raised before building.
- **What we did:** **PARTIAL** — the figure now matches the rule, but it is still recomputed in the page.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "any ranking figure the page shows equals the engine's ranking key" — test/debug check at game over (sort players by the shown figures; must match `S.places`) — would have fired on the first tie decided by blockades — generality: any page-side re-derivation of a rule. — tags: `AS-view-matches-state`

### D18 — The design-review agent died with a worker restart and its work was lost
- **Source:** owner report (2026-09-28 19:56, quoting Claude: "Design branches: that agent was stopped and didn't push any branches. It left about 37 screenshots in my scratch folder, which you can't open, but I didn't restart it." — owner: "restart it of course why did it faul?"; again 09-29 19:10: "restart those design agents, but start them on a background thread. I keep stopping them by accident on the main thread.")
- **Commits:** none in code (the design branches were delivered later: origin/design/D1-A, D1-B, v3-shots-*)
- **Same bug as:** E34 — the design agents run inside the conversation and lost when it was interrupted or restarted (09-28, 09-29)
- **Symptom:** The owner's before/after design comparison (asked 18:49, 19:09 "You can have them create a branch for each") didn't arrive; the agent stopped and nobody restarted it.
- **Mechanism:** The agent ran inside the session; the worker restart at 19:52 ("This session's worker process was restarted") ended it; its output existed only as screenshots in the session scratch folder; nothing was pushed until the end.
- **Root cause:** Delegated long work was tied to the session's lifetime and kept its results in ephemeral local files, with no checkpoints and no one watching for its death.
- **Design decision:** Long-running agents in the foreground, results only at the end. — tags: `DD-process`
- **Siblings:** D1 (same foreground decision); 09-29 19:10 repeat.
- **Recommended design fix:** Background agents that push each finished item (branch/screenshot) as they go, and a check after any restart that lists which agents were running and restarts them.
- **What we did:** **PARTIAL** — restarted on request; the stop-and-lose pattern recurred on 09-29.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no code assertion (process); name the check: after a worker restart, the session compares its list of running agents with the live ones and reports or restarts the difference. — tags: `AS-none`

### D19 — A white box behind the Google sign-in button
- **Source:** owner report (2026-09-28 19:59: "not sure what happened here 🙂" with a screenshot of the dark "Sign in as shlomo alon" button inside a white rectangle on the Online screen)
- **Commits:** `82b11a7` ... fix the white box behind the Google button (`#gsiBtn{color-scheme:light}`); `69b2191` (second mount point, `.gsi{color-scheme:light}`)
- **Symptom:** An opaque white rectangle around Google's button in the dark menu.
- **Mechanism:** The page declares `color-scheme:dark` (shell.html:6); Google's button is a light-scheme iframe, and when the embedding element's scheme differs the browser paints the iframe an opaque backdrop.
- **Root cause:** A third-party frame embedded without matching its colour scheme; it was never seen in tests because Google's script never loads there (test/lib.cjs:44-45 filters out gsi errors).
- **Design decision:** Third-party embeds never exercised in any test or screenshot, and patched per mount point. — tags: `DD-untested-real-setup`, `DD-per-element-patch`
- **Siblings:** D13 (tests measure a different page); each new place that mounts the button needs the same class (two rules now: shell.html:97 `.gsi`, :422 `#gsiBtn`).
- **Recommended design fix:** One rule for every third-party frame container (a single `.embed` class or `iframe{color-scheme:normal}` style rule), and a test page with a stub light-scheme iframe in the screenshots.
- **What we did:** **PARTIAL** — the standard fix, applied per element (two selectors for two mounts).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no cheap assertion (a pixel property of a cross-origin frame); name the test: a screenshot test at each mount point with a stub light-scheme iframe, checking the pixels around it match the panel background. — tags: `AS-none`

### D20 — The "El Dorado" label sits on a finishing space
- **Source:** owner report (2026-09-28 20:11: "weird overlap here :)" with a screenshot of the label over the middle FINISH hex); also found by Claude earlier (design review A20, 09:49, left unfixed)
- **Commits:** `e6ae810` (introduced: label at a fixed `y:44` under the city); `c134b02` Board: the El Dorado label sits beside the pyramid, clear of the finishing spaces and the arrived explorers
- **Symptom:** The city's name overlapped the FINISH space and the explorers arriving there.
- **Mechanism:** `sv('text',{x:0,y:44,...})` placed the label a fixed distance below the pyramid in screen direction, but the city is placed "beyond El Dorado's three spaces, away from the last board's centre", so on this course "below" was the finishing spaces.
- **Root cause:** A decoration positioned by a fixed offset in page coordinates while the thing it annotates is oriented by course geometry; nothing checks label boxes against spaces.
- **Design decision:** Board annotations placed by per-element magic offsets with no overlap rule. — tags: `DD-per-element-patch`
- **Siblings:** A21 (blockade id badge stacked on the cost diamond), playtest #32 (market hover preview overlaps Menu / badge clipped); D10 (the review had measured this defect 10 hours earlier).
- **Recommended design fix:** Labels laid out in the annotated object's own frame (relative to the finishing direction) by one placement rule, plus an overlap check of every board label against hex polygons and piece spots on every course.
- **What we did:** **PARTIAL** — the label goes perpendicular to the finishing direction (`px=-C.dy,py=C.dx`, `side=px>.35`, offsets `px*40+2`, `py*40+5`; now src/client/board/terrain.js:109): correct here, but tuned constants and no check for other courses or other labels.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "no board label's box intersects a playable space or an explorer spot" — test tier, after the board is built, for every course (reads layout) — would have fired on First Expedition at the first run — generality: every label/badge collision on any course. — tags: `AS-no-overlap`

### D21 — The menu panel changes size from screen to screen
- **Source:** owner report (2026-09-28 20:21: "The menu, when you click on a new option, relates to a new screen. It shouldn't change the size of the background. The background should stay stable."; 20:34, sent while Claude was working: "One annoying bug I noticed is when the page starts scrolling, the layout has to snap because it now shows the scroll bar. It shouldn't show the scroll bar. Or if it shows the scroll bar, the scroll bar shouldn't cause the page to snap.")
- **Commits:** `69b2191` Menu: one fixed panel for every menu screen (only its contents change); `e01d0c5` ... stable scrollbar gutter
- **Symptom:** Switching between the start screen, Online, room lobby and Replays resized the panel; a scrollbar appearing also shifted the content sideways.
- **Mechanism:** `.modal` took the height of its content; each screen's content differed; overflow added a scrollbar that took width.
- **Root cause:** Content-sized container for screens of different lengths.
- **Design decision:** Content-sized layout. — tags: `DD-content-sized-layout`
- **Siblings:** D8, playtest #12 (prompt pill), #14 (player bar), #13 (buttons).
- **Recommended design fix:** A slot: one fixed-size panel whose contents scroll inside it, with a reserved scrollbar gutter.
- **What we did:** **ROOT** — `.modal.menu{width:min(620px,calc(100% - 32px));height:min(860px,calc(100% - 32px))}` plus `scrollbar-gutter:stable` (still in src/client/shell.html:53); any new screen gets the same slot.
- **Ratchet:** nothing (no test compares the panel's rect across screens).
- **Assertion that would have caught it:** "the menu panel's rect is identical on every menu screen" — debug layout-shift observer / test comparing `getBoundingClientRect()` across the three tabs — would have fired on the first screen switch — generality: every content-sized jump. — tags: `AS-layout-shift`

### D22 — A player could send any property name as a market index (critique B1)
- **Source:** found by Claude (independent API critique, docs/API_CRITIQUE.md B1: "`transmit`/`buy` accept any property name as `idx` → prototype pollution, half-applied actions, uncaught throw (HIGH)", verified by probe)
- **Commits:** `69b2191` (guard: `if('idx' in a&&!(Number.isInteger(a.idx)&&a.idx>=0&&a.idx<16))return fail('Bad action.')`); `e01d0c5` Engine: buy and transmit name the card type (stackOf) instead of a market slot, plus a test
- **Symptom:** None seen by a player; a malicious client could send `idx:"__proto__"`, pollute `Array.prototype`, and leave the room's state half-changed.
- **Mechanism:** `S.market[a.idx]` with a property name returned a truthy non-stack; `stack.n<=0` was `undefined<=0` (false), so the check passed and the branch wrote through it.
- **Root cause:** Network input was used as a property key with only a truthiness check; the action object's shape is validated piecemeal inside each branch.
- **Design decision:** No single validation of action shapes at the boundary; each branch checks what it happens to use. — tags: `DD-per-element-patch`
- **Siblings:** D23 (the thrown exception half-applied the change); other critique B-items fixed 09-29 (`162da2e`: the server takes only player actions from a socket).
- **Recommended design fix:** Actions name things by value (a card type, a card id) looked up with comparisons, and are validated against one schema before the engine sees them.
- **What we did:** **HACK `69b2191` → PARTIAL `e01d0c5`** — first a special-case `if` for the one field; then the index left the protocol: buy/transmit name a type found with `findIndex(s=>s.t===t)` (engine_rules.js:26), which can't hit prototype keys. Per-branch validation remains the pattern.
- **Ratchet:** test — test/engine.test.mjs:148-152: buys of `'__proto__'`, `'constructor'`, `'length'`, `0`, `null`, `{}` are refused and leave the state and `Array.prototype` untouched.
- **Assertion that would have caught it:** "a refused action leaves the state byte-identical" — postcondition at the room boundary (compare a hash before/after on `ok:false`) — debug tier, or always-on as a cheap version counter — it would only fire under a malicious or buggy client (never in normal play), so the fuzz test is the real check — generality: any half-applied action. — tags: `AS-engine-invariant`

### D23 — An engine exception in a room left the game half-changed; first fix swallowed it (critique B2)
- **Source:** found by Claude (API critique B2: "Any engine exception (B1 or a future bug) leaves `this.S` partly mutated and unrecorded... a throwing alarm... leaving an AI turn with no alarm scheduled → the game freezes")
- **Commits:** `69b2191` (try/catch around `recAct`: `catch (e) { r = { ok: false, err: 'Bad action.' }; ... }`); `210ce71`, `b3e9fd0` (kept the catch; state rebuilt from the record on refusal); `e851e67` 09-29 Boundaries for bugs: the page and the server catch a failed assertion, report it and recover
- **Same bug as:** E26 — the Room's catch that turned any engine exception into "Bad action." (`69b2191`), replaced by `guard()` in `e851e67`
- **Symptom:** None seen yet; a bug in the engine would silently corrupt or freeze an online game.
- **Mechanism:** `webSocketMessage` and `alarm()` called the engine without protection; the fix caught the exception and answered "Bad action." — reporting a server bug to the player as their mistake and logging nothing.
- **Root cause:** No boundary per entry point: errors either escaped mid-mutation or were swallowed.
- **Design decision:** Error handling added at call sites as needed, with a silent catch. — tags: `DD-silent-failure`
- **Siblings:** The many empty `catch (e) { }` in worker.js (e.g. :343, :428, :432, :608, :617) and page `.catch(()=>{})` (D16); B-items fixed the same way.
- **Recommended design fix:** One guard per entry point that logs and stores a report, rebuilds the room from its record (the last good state) and tells everyone — the design `e851e67` implemented.
- **What we did:** **HACK `69b2191` → ROOT `e851e67`** — the swallowing catch became `guard()` (src/worker.js:405-420): report via `storeBug`, `restore()` from storage, re-send state, re-arm the alarm; the record makes rollback exact (`b3e9fd0`).
- **Ratchet:** assertion boundary + test (docs/ASSERTIONS.md; test/online.cjs exercises refusals) — the `guard` reports every exception.
- **Assertion that would have caught it:** "no catch swallows an error; every failure is reported" — lint over src/ (no empty catch without a comment naming why the failure is allowed) — would have flagged the `69b2191` catch the moment it was written — generality: every silent failure. — tags: `AS-no-silent-catch`

### D24 — The online shuffle secret came from Math.random next to a published value (critique B4)
- **Source:** found by Claude (API critique B4: "`seed` ... and then `recNewGame` draws `rng = Math.random()*2^32` ... two consecutive outputs of V8's xorshift128+ generator, the first of which is sent to every player")
- **Commits:** `69b2191` (crypto with a `Math.random` fallback: `c&&c.getRandomValues?...:(Math.random()*4294967296)>>>0`); `00079c1` 09-29 Engine: assert() for invariants instead of quiet fallbacks (fallback removed; now `recSecret()` = `crypto.getRandomValues`, engine_rules.js:81-82); `0ed43a9` 09-30 Random sources and records are required: no Math.random defaults
- **Symptom:** None seen; in principle a player could recover the generator state and predict every shuffle (everyone's deck order).
- **Mechanism:** The record's secret `rng` and the public `S.seed` were consecutive `Math.random` outputs.
- **Root cause:** Hidden information derived from a non-cryptographic generator whose neighbouring outputs were public.
- **Design decision:** Randomness as an implicit global default (`Math.random`) instead of an explicit, required source chosen by the caller. — tags: `DD-compat-path`, `DD-global-state`
- **Siblings:** Room codes and the course/seed still use `Math.random` (worker.js:19, :546) — acceptable only because the secret no longer derives from them; the bot's global RNG (removed `bb4cc64` 09-29).
- **Recommended design fix:** The secret is a required parameter from `crypto.getRandomValues`; no default.
- **What we did:** **PARTIAL `69b2191` → ROOT `00079c1`/`0ed43a9`** — first with a silent fallback, then required.
- **Ratchet:** assertion — `recNewGame` asserts the secret is a 32-bit integer (engine_rules.js:86) and callers must pass it.
- **Assertion that would have caught it:** "hidden information (deck order, shuffle secret) is never computable from what the server sends" — review/test-tier redaction check (no public field derives from the secret's generator) — would not fire in normal play (a security property) — generality: redaction leaks. — tags: `AS-redaction`

### D25 — The menu's background flickers and every click re-lays out the whole screen
- **Source:** owner report (2026-09-28 20:01, sent while Claude was working: "Transitions are annoying between different screens... It's as if the old screen disappears for a second, and then there's a wait before the new screen comes up."; 20:01: "all buttons that you hit should stay within that screen effectively."; 20:22: "There should be no reload. The background and menu should be stable because it's the same size. Even if it's going to a different screen, there ought to be a way to make it perfectly smooth where the background stays stable and only the text or the things that it's showing change."; 20:34: "And there was one flicker when I clicked on profile. There shouldn't be any flicker."; 20:35: "The profile flicker wasn't due. I'm not worried about the text flickering. I'm worried about the background flickering. Why in the world is the background flickering? It's not changing."; 22:15: "There appears to be a flicker when you swap between online and non-online. I need you to rethink how you implemented this because we've had multiple separate similar bugs..."; 22:16: "clicking every button pretty much has the same effect. It basically has to do a relayout This is ridiculous. It got worse."; 22:26: "Did you confirm that this fixed it?"; 22:29: "The whole background just flickers... hitting an element shouldn't affect elements not near it. Are you using things other than a default browser primitives")
- **Commits:** `82b11a7` Menu screens swap in place (whole overlay rebuilt, with a `swapIn` opacity .4→1 animation); `69b2191` (scrim `cloneNode` + `replaceWith` on every screen switch); `e01d0c5` Menu: keep the same backdrop element when switching screens (global `MENU_NEXT` flag; "profiles cached"); `479f8dd` (mode switch on both screens → full rebuild per switch); `3d5c9b8` WIP: menu screens morphed (vendored morphdom), live blur removed; `6300401` Menus rebuilt on browser primitives: one native `<dialog>`, every screen written once
- **Symptom:** First, moving between menu screens faded the old screen out, waited, and faded the new one in; then the dimmed, blurred board behind the menu flashed on screen switches and on ordinary clicks inside a screen; after the online/local switch was added it got worse.
- **Mechanism:** Before `82b11a7`, a screen change was `closeModal()` (160 ms fade-out) then `setTimeout(showX,170–200)` then a new scrim with its own fade-in (the timers are visible in the `82b11a7` diff) — the "wait". After it, each menu screen was still an HTML string; every click (player count, seat type, colour, tab) re-rendered the screen with `m.innerHTML=html()` and re-wired handlers, recreating Google's sign-in iframe; the scrim behind it had `backdrop-filter:blur(4px)` over the live board and a fade-in animation, so a new scrim (82b11a7/69b2191) replayed the fade and re-rasterised the blur, and any relayout inside repainted the whole blurred region. `e01d0c5` (20:40) fixed one trigger (a new scrim element per switch, via a module-global `MENU_NEXT` flag) and the profile's "Loading…" text (profiles cached), but every click inside a screen still rebuilt it (22:16 "It got worse").
- **Root cause:** Menus were rendered wholesale per interaction, on top of a live full-screen blur.
- **Design decision:** String-rendered screens rebuilt on every click instead of static markup with only data updated; plus a backdrop-filter over the board (against the project's own rule for HUD elements). — tags: `DD-whole-rebuild`, `DD-per-element-patch`
- **Siblings:** Playtest #7/#9 (history panel rebuilt once per AI action, ~1000 elements per hand-off; hand cards rebuilt); the All-cards overlay's `backdrop-filter:blur(5px)` (#allc, removed in `3d5c9b8`); the room lobby rebuilt on each server message; D16/playtest #5 screens picked before data.
- **Recommended design fix:** Every screen written once in the page, switched with `hidden`; native controls hold their own state; scripts fill only data boxes when their data changes; no backdrop-filter behind anything that can change.
- **What we did:** **HACK `82b11a7` → HACK `69b2191` → HACK `e01d0c5` → (WIP `3d5c9b8`, morph library, not kept) → ROOT `6300401`** — the last removed the string-rendered screens and morphdom (–1206 lines), uses one `<dialog>`, radios/selects and CSS `:has()` tabs, `setHTML` that skips unchanged content; commit message: "tabs, player count and options change 0 elements"; CLAUDE.md now forbids rebuilding a screen's HTML on a click or blur behind it. The three earlier fixes were each shipped without measuring the flicker (owner 22:26: "Did you confirm that this fixed it?").
- **Ratchet:** nothing automated for the menu (the "0 elements per click" measurement isn't a test; test/menus.cjs checks navigation only); the rule is in CLAUDE.md. test/flows.cjs:28-32 does check "Start: no change on the board" (0 mutations) since 09-29.
- **Assertion that would have caught it:** "a click changes only what it is about" — debug MutationObserver per region (menu data boxes, backdrop, board) with a budget: a menu click writes 0 nodes outside the menu and ≤ a few inside; plus "no running backdrop-filter behind an element that changed" — would have fired on the first click after `82b11a7` — generality: history panel, hand, lobby, any wholesale rebuild. — tags: `AS-dom-churn`

### D26 — The network AI without search "does weird stuff" on the site (Orellana)
- **Source:** owner report (2026-09-28 21:04: "The base model without search is very problematic on the website. Because it does weird stuff. So it shouldn't be there. And for different levels, we should just have different amounts of search, basically.")
- **Commits:** `37cfd2e` 09-27 (introduced the named AIs incl. Orellana, "the same network, one move at a time"); `7e0bcd1` ... Orellana (network without search) retired from the site and the leaderboard; `14cefe2` 09-29 New AI level: Fawcett (wider search)
- **Same bug as:** B11 — the greedy one-action-at-a-time network policy: B11 found in training, D26 the owner seeing it on the site as Orellana (that his "weird stuff" is this misplay is a hypothesis); both closed for play by `7e0bcd1`
- **Symptom:** Visibly odd play from the "Strong" AI (details not given; unknown which moves).
- **Mechanism:** Orellana chose each action greedily by the value network one step at a time (no whole-turn plan), a policy used in training but never judged as a human opponent; hypothesis, not verified: the kind of within-turn misplay the owner saw on 09-27 ("spend two gold to buy something and move one with green, or spend one gold and two other cards... they should have done the other one").
- **Root cause:** AI levels were defined as different algorithms, one of which had no whole-turn reasoning, and shipped without a play-quality check.
- **Design decision:** AI difficulty undefined as a product rule (levels = whatever variants existed) until the owner specified "levels = amounts of search". — tags: `DD-no-spec`
- **Siblings:** D5 (policies measured only against the heuristic); the leaderboard kept a retired AI until filtered (`7e0bcd1` filters `bot` rows not in `AIS`).
- **Recommended design fix:** One AI algorithm (network + whole-turn search) with levels only by search budget, each level gated by head-to-head against the next.
- **What we did:** **ROOT** — Orellana removed; later levels differ by search (Fawcett, `14cefe2`).
- **Ratchet:** nothing automatic (tools/ai/h2h.mjs exists as a tool, not a gate).
- **Assertion that would have caught it:** no runtime assertion for "plays sensibly"; name the test: every shipped level must beat the level below it in h2h, and a turn check that the AI's turn is not strictly dominated by the whole-turn planner's (same cards, fewer spent, same outcome) — would have flagged one-move-at-a-time misplays. — tags: `AS-none`

### D27 — Double-clicking "Add AI" could over-fill a room (critique B3)
- **Source:** found by Claude (API critique B3: "`addAI` checks 'room full' and 'AI already seated', then `await`s a D1 query before pushing the seat... a second `addAI` (double click) can pass the same checks meanwhile")
- **Commits:** `7e0bcd1` ... addAI re-checks the room after its database read (double click)
- **Symptom:** In principle the same AI twice or more seats than the room's maximum after a double click.
- **Mechanism:** Check → `await env.DB...first()` (opens the Durable Object's input gate) → push; two messages interleave at the await.
- **Root cause:** Validation and mutation separated by an await in a handler that other messages can interleave with.
- **Design decision:** Room handlers written as check-then-await-then-mutate, relying on nothing running in between. — tags: `DD-imperative-sequencing`
- **Siblings:** Any other room handler that awaits D1 between its checks and its write (not audited; hypothesis); the same AI now takes several seats sharing one uid (`aiUid(A.id)`, worker.js:495-499), so seat lookups by uid return the first — latent, not verified.
- **Recommended design fix:** Do the reads first (or cache the AI names), then check and mutate synchronously in one block; or a room invariant asserted after every message.
- **What we did:** **PARTIAL** — the checks are repeated after the await (worker.js:497); the pattern remains available elsewhere.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "room invariants hold after every message: seats ≤ max, seats change only in the lobby, one seat per person" — end of each Room entry point inside `guard()` — always-on, cheap — fires only on a double click (rare in normal play) — generality: every interleaving bug in the room. — tags: `AS-engine-invariant`

### D28 — No way back to local play once you chose Online
- **Source:** owner report (2026-09-28 21:49: "theres no way to go back to local once you choose online")
- **Commits:** `479f8dd` Menu: 'On this device | Online' switch at the top of both the start screen and the Online screen; `6300401` (one dialog, the switch as native radios above every screen); `bf321e8` 09-29 Menus: Replays is a third tab... the Replays and Back buttons are gone
- **Symptom:** After picking Online, the "On this device | Online" switch was gone; the only way back was a "Back" button at the bottom of the screen.
- **Mechanism:** The switch was part of the start screen's template only (`<div class="seg" id="sMode">` wired one way: `if(b.dataset.m==='online')showHub()`); the Online hub's templates ended in `hBack`, which after `69b2191` sat at the bottom of a fixed-height scrolling panel — hypothesis, not verified, that it was below the fold on his screen.
- **Root cause:** Each menu screen was a separate template with hand-wired exits; a control that looks like a two-way switch existed on one side only.
- **Design decision:** Menu navigation never specified as a whole; each screen hand-wires its own ways out. — tags: `DD-no-spec`
- **Siblings:** D25 (same string-screen design); playtest #24 (New game discards without confirm), #26 (History button's hidden 3-way cycle).
- **Recommended design fix:** The top-level choice is one control outside the screens (tabs), always visible; screens don't own navigation.
- **What we did:** **PARTIAL `479f8dd` → ROOT `6300401`/`bf321e8`** — first the switch copied into the hub template; then one set of native tabs over every screen (Back buttons deleted).
- **Ratchet:** test — test/menus.cjs (09-29): "start screen: three tabs, no Back or Replays buttons" and tab navigation checks.
- **Assertion that would have caught it:** "from every menu screen each top-level choice is visible and reachable in one tap" — test tier (menus.cjs walks the screens) — would have failed the moment the Online screen existed without the switch — generality: dead ends in any flow. — tags: `AS-view-matches-state`

### D29 — Returning players see a blank screen while the page asks the server what to show
- **Source:** found later (playtest 2026-09-30 #2 "blank screen ~1 s for returning players"); introduced here
- **Commits:** `525ea29` Page split for the first round trip (introduced `html.resume`); not fixed since
- **Same bug as:** P2 — the `html.resume` blank screen (`525ea29`), reported in the playtest (#2)
- **Symptom:** With a saved local game, the page shows neither the start screen nor the game for about a second after load.
- **Mechanism:** A head script adds `html.resume` when `eldorado-game-v2` exists (shell.html:594), hiding `#menu` (shell.html:30); the boot then runs `netInit()` (/api/config then /api/me) before deciding to resume, because one rule ("a running online game beats your local save") needs the server (main.js:37, :64).
- **Root cause:** A decision the page can mostly make locally waits on two network round trips, and the screen is hidden before that decision.
- **Design decision:** Picking the screen after the server replies. — tags: `DD-server-first`
- **Siblings:** Playtest #17 (boot waterfall), #5 (room lobby flashed before the first server message), D16.
- **Recommended design fix:** Show the local save at once; if the server later reports a running online game, offer it (a banner), never block on it.
- **What we did:** **NOT FIXED.**
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "what is known locally is on screen before any network reply" — test with the network delayed by 2 s (loadbench phone profile + a saved game): the game must be visible before /api/config answers — would fire on every returning visit — generality: every server-first screen choice. — tags: `AS-latency-budget`

### D30 — The start screen re-renders when late fonts arrive
- **Source:** owner report (2026-09-28 23:58: "The start screen should not render without CSS. Because that will cause a re-render once the CSS is loaded. Our goal is to keep the the CSS low enough that it could load together with the with the page."; 09-29 00:01: "the UI should always be consistent with itself. Like it shouldn't change when you come back")
- **Commits:** `1f52aaf` (self-hosted fonts with `font-display:swap`, not preloaded); `525ea29` (start screen painted before the game CSS and fonts); `690402e` 09-29 Fonts: the menu uses the device's own fonts... "no text ever swaps fonts"
- **Same bug as:** E1 — the start screen's web fonts swapping in (`1f52aaf`), fixed for the menu in `690402e`
- **Symptom:** The first screen could be drawn once, then redrawn when the web fonts (and the game's CSS) arrived.
- **Mechanism:** The start screen used Figtree/Young Serif declared with `font-display:swap` (build.mjs:46), so text painted in a fallback face and re-laid out when the files arrived; hypothesis, not verified, that this (rather than missing CSS: the start screen's CSS was inline) is what the owner's message targeted — `690402e`'s fix and wording ("no text ever swaps fonts") suggest so.
- **Root cause:** The first screen depended on resources that arrive after first paint.
- **Design decision:** Late resources allowed to change what's already on screen. — tags: `DD-content-sized-layout`
- **Siblings:** D12, D29; main.js:33 `relabel()` re-lays out board labels once fonts arrive (hidden behind `gameready`).
- **Recommended design fix:** The first screen uses only what's in the first response (system fonts, inline CSS); later screens are hidden until their resources are in.
- **What we did:** **ROOT (menu) `690402e`** — the menu uses system fonts, the game is shown only after its fonts load (`GAME_READY`, src/client/ready.js:3); caveat: the 4 s timeout falls back to system fonts and a later arrival could still swap, and a Start pressed early waits for the fonts (menu.js:162).
- **Ratchet:** nothing (no layout-shift or font check in tests).
- **Assertion that would have caught it:** "nothing on screen moves without an animation or a direct action" — debug layout-shift observer from navigation start (CLS = 0 on the start screen), in the load test with the production fonts served slowly — would have fired on every first visit — generality: every late-data or late-resource jump. — tags: `AS-layout-shift`

## 2026-09-29

### E1 — Start-screen text swapped fonts, and looked different on a second visit
- **Source:** owner report (2026-09-29 00:00: "Are there no default fonts that ship with Chrome?"; 00:01: "the UI should always be consistent with itself. Like it shouldn't change when you come back, like when you come back to it a second time.")
- **Commits:** `1f52aaf` (09-28) Faster page load: self-hosted fonts … (introduced `font-display:swap` web fonts on the start screen) · `690402e` Fonts: the menu … uses the device's own fonts … · `276792f` Phone: no zoom jump … (game area also waits for the board fit)
- **Same bug as:** D30 — the start screen's web fonts swapping in (`1f52aaf`), fixed for the menu in `690402e`
- **Symptom:** on a first visit the start screen drew in a fallback font and then swapped to Figtree / Young Serif; on a return visit (fonts cached) it drew in Figtree at once, so the same screen looked different between visits.
- **Mechanism:** `build.mjs` (1f52aaf) emitted `@font-face{…font-display:swap…}` for Figtree and Young Serif into index.html, and the start screen's CSS used them (`--ui:'Figtree',…`), so the browser painted fallback text first and re-laid it out when the woff2 arrived.
- **Root cause:** the first-painted screen depended on a network resource (the web font) that is sometimes cached and sometimes not; `swap` makes that difference visible.
- **Design decision:** the screen that must appear instantly was styled with assets that arrive later; nothing separated "drawn at once" from "may load in the background" — tags: `DD-server-first`, `DD-content-sized-layout`
- **Siblings:** E2 (load time), E3 (the preview board also waited for the network); the game's own text after the 4 s timeout (below).
- **Recommended design fix:** the first screen uses only what ships in the first response (system fonts, inline CSS); everything that loads later is only ever shown once it is there (no swap anywhere: `font-display:block` or show-when-loaded, with no timer race).
- **What we did:** **PARTIAL** — 690402e is a root fix for the menu (system-ui / ui-serif stacks in shell.html's first `<style>`: nothing can swap there). For the game it is a timer race: `src/client/ready.js:3` `Promise.race([document.fonts.load(...), setTimeout(4000)])` gates `html.gameready` (`shell.html:533`); after 4 s on a slow link the game shows with fallback fonts and the `swap` faces still swap in later; and a Start pressed before the fonts arrive silently waits (`startLocal` re-queues itself on `GAME_READY`).
- **Ratchet:** nothing — no test loads the page with fonts and checks for a swap (test/lib.cjs even ignores font load errors).
- **Assertion that would have caught it:** "text never changes font after it is first painted" — a `document.fonts` `loadingdone` listener that reports if any face loads after first paint while elements using it are visible — debug/test tier (loadbench-style first and repeat visit) — yes, on every first visit — also catches late icon/art assets popping in (E7) — tags: `AS-layout-shift`

### E2 — The site took "a couple of seconds" to load on the phone
- **Source:** owner report (2026-09-29 00:06: "when I went to it on my mobile phone, it took like a couple of seconds to load"); first asked for on 09-28 ("Also the website should load really fast.")
- **Commits:** `1f52aaf` (09-28) self-hosted fonts, minified script · `525ea29` (09-28 23:57) index.html under the first TCP flight · `690402e` menu on system fonts · `276792f` the start screen's board drawn at startup, not after the server check · (09-30 playtest #2/#17: still a ~1 s blank screen for returning players, boot waterfall — not fixed)
- **Same bug as:** D12 — the slow first load on the owner's phone (the 09-28 reports and 09-29 00:06)
- **Symptom:** a multi-second wait before the start screen / game was usable on his phone.
- **Mechanism:** boot ran `netInit().then(...)` (`ui_boot.js` before 276792f, lines 28-36): the start screen's board preview, the saved-game resume and the choice of screen all waited for `/api/config` then `/api/me`; plus web fonts and a 239 KB script on a phone link.
- **Root cause:** the page decided what to show only after the server answered, although for local play it knows everything itself.
- **Design decision:** one boot chain gated on the network picks the screen ("a running online game beats your local save" needs the server, so everything waits for it) — tags: `DD-server-first`
- **Siblings:** E3 (unfitted board shown until the server check finished), 09-30 playtest #2 (blank screen for returning players), #17 (boot waterfall), 09-30 14:33 owner ("there's no reason why I should have to go to the ... load who the AIs are").
- **Recommended design fix:** show what is known locally at once (start screen, local save) and let the server's answer only add to it (an "online game running" banner) instead of choosing the screen.
- **What we did:** **PARTIAL** — payload cuts (525ea29, 690402e) and the preview moved before the server check for new visitors (276792f `if(!…'resume'){setupSync();preview();}`), but `resume` users (a local save) still waited on netInit; the 09-30 playtest measured it again. Never measured on his phone.
- **Ratchet:** nothing — `test/loadbench.cjs` measures but is not in `test/run.mjs` and asserts no budget.
- **Assertion that would have caught it:** "with the network delayed by N s, the start screen or the saved game is interactive before any server reply" — test with a delayed network (`AS-latency-budget` test in run.mjs) — yes, on every load with a slow link — also catches 09-30 #2, #17 and the lag of the start menu — tags: `AS-latency-budget`

### E3 — Board "starts zoomed in, then zooms itself out"; refit a second after Start
- **Source:** owner report (2026-09-29 00:06: "it starts more zoomed in than it should be and then zooms itself out like right away. That seems really weird."; 00:19: "It's still resized a second after you hit start … There shouldn't be any re-rendering at all when you hit new game.")
- **Commits:** `276792f` Phone: no zoom jump on load or Start … · `9c62c67` The start screen's background is the game about to start … · `0a6cba4` / `a5be040` one `showGame()` path with `fitSoon()` after the frame's updates · `c3070ca` market open/close refits via `fitSoon`, not a 10 ms timer
- **Symptom:** on load the board appeared at the wrong (unfitted, too big) scale and jumped to fit; pressing Start re-drew and re-fitted the board about a second later.
- **Mechanism:** the game area was made visible before `fit()` ran, and the preview was only built after `netInit()` resolved; Start then built a *new* game (`recNewGame`, `buildBoard`, hand, top bar), which changed the safe rectangle, and fitted again (`fit(!!SETUP.map&&…)` glide); other paths fitted from `setTimeout(fit,0)`, `requestAnimationFrame(fit)` (resumeSaved, applyServerState) and `setTimeout(()=>fit(true),10)` (market).
- **Root cause:** when the view is fitted depends on when each caller happens to call `fit`, not on the geometry being final; and the thing behind the menu was a different object (a preview) from the game that Start created.
- **Design decision:** the camera fit was triggered imperatively from many places and timers, and the start screen showed a stand-in instead of the game itself — tags: `DD-imperative-sequencing`, `DD-server-first`
- **Siblings:** E2, E4; online first state fitted twice (`applyServerState`: `fit();setTimeout(()=>{if(!userZoomed)fit();},0)`); new latent flag `UI.preview` (9c62c67) that five places must check/reset by hand (`state.js:33,45`, `ai.js:23`, `online.js:93`, `replay.js:60`) — `DD-ui-flags`.
- **Recommended design fix:** one "show this game" path; the fit is derived from final geometry after the frame's writes (`after()`), and the start screen's background is the real game (Start only closes the menu).
- **What we did:** **HACK `276792f` → PARTIAL `9c62c67`/`a5be040`** — 276792f hid the symptom (`html.gameready.boardready #shell{visibility:visible}`, i.e. hide until fitted). 9c62c67 made the background the real game (`prepareGame`), so Start changes nothing; a5be040/0a6cba4 merged all game switches into `showGame(){…fitSoon()}` (`actions.js:25`); c3070ca removed the 10 ms timer. Still: `onGeo` refits whenever the game area resizes and the user hasn't zoomed (`camera.js:136`), and `UI.preview` is a hand-reset flag.
- **Ratchet:** test — `test/flows.cjs:32` "Start: no change on the board" (MutationObserver on `#stage` counts 0 mutations across Start).
- **Assertion that would have caught it:** "the board's view (scale/offset) changes only from a gesture, a zoom button, or a glide the page started for a reason it names" — per-frame check in `applyView` (debug: log the caller; always-on cheap: a counter of un-reasoned view changes reported once) — yes, on every load and every Start — also catches the online double fit, market refits and resize refits — tags: `AS-layout-shift`

### E4 — The board painted over the menu for a quarter second on load
- **Source:** owner report (2026-09-29 00:19: "The board flickers over for about a quarter of a second until it's until the old card is rendered on top of it.")
- **Commits:** `9c62c67` (menu becomes a modal dialog as soon as the script runs; `#shell{isolation:isolate}`)
- **Symptom:** during load the board showed on top of the start screen for ~250 ms, then the menu covered it.
- **Mechanism:** `<dialog id="menu" open>` is non-modal HTML in the normal stacking order; once `#shell` became visible (fonts + fit, E1/E3), z-indexed game elements could paint above it until script turned it into a modal (top-layer) dialog.
- **Root cause:** which of the menu and the game is on top was decided by z-index competition inside one stacking context during the load sequence, not by the browser's top layer.
- **Design decision:** the menu floated over the game via stacking order instead of a mechanism that guarantees it is on top — tags: `DD-float-over`, `DD-imperative-sequencing`
- **Siblings:** E6 (other windows left under/over each other), 09-30 #27 (All cards X over Menu), #32 (market hover preview over the Menu button).
- **Recommended design fix:** everything that must cover the game is in the top layer (modal `<dialog>`) from the first paint, and the game area is isolated so no z-index can escape it.
- **What we did:** **ROOT** — `menuInit` calls `showModal()` at once and `shell.html:137` `#shell{isolation:isolate}`: nothing in the game can stack above the menu whatever its z-index, including elements added later.
- **Ratchet:** nothing — no test samples paint order during load.
- **Assertion that would have caught it:** "while the menu is open, the topmost element at any point of the menu's box is inside the menu" — debug: `elementsFromPoint` sampled at a few points of `#menu` each frame during load — yes, on every load — also catches other overlays escaping above dialogs — tags: `AS-view-matches-state`

### E5 — Sharp delay when clicking and dragging on the phone
- **Source:** owner report (2026-09-29 00:06: "there's a sharp delay in click and drag on my phone right now. It's not a pleasant feeling.")
- **Commits:** `276792f` (touch drags no longer add the `drag` class) · `9c62c67` (blockade badges rebuilt only when a blockade is taken; a card drag measures the game area once) · `b6b907c`/`0a6cba4` (CSS variable and `:has()` on `#app` removed: select restyled ~3,800 board elements) · `14487ec` (the badge signature still rebuilt the layer on every render once all blockades were taken) · `7dd059f` (loosened the select long-task budget 80 → 120 ms)
- **Same bug as:** B3, B6 — E5's causes (b) and (a): B3 is the CSS variable and `:has()` on `#app` that restyle the whole board, B6 the grabbing-cursor class that restyles it at drag start
- **Symptom:** a visible stall at the start of a board drag and when selecting/dragging a card (phone, CPU/4: worst frame 67 ms at touch-grab; 80-100 ms longest task on select).
- **Mechanism:** (a) pan start added `.drag` (an inherited `cursor`) to the board wrapper → style recalc of every board element; (b) selecting a card set a CSS variable on `#app` and a `:has()` rule matched on `#app` → ~3,779 elements restyled; (c) `renderBlockades` rebuilt its badges and HTML labels on every render → forced layout; (d) card drag read `getBoundingClientRect` of the game area on every pointermove.
- **Root cause:** the ~3,800-element SVG board sits inside the same styled subtree as the interactive UI, so any state written on a shared ancestor or any wholesale rebuild re-styles or re-lays out the whole board.
- **Design decision:** UI state was expressed by writing classes/variables on ancestors of the board and by rebuilding regions each render; each costly write was found and patched one at a time — tags: `DD-board-inherits-ui-state`, `DD-per-element-patch`, `DD-whole-rebuild`
- **Siblings:** E7 (market art redrawn every render), E9, 09-30 #7/#9 (hand-offs: history panel and hand rebuilt, ~1,000 elements added per hand-off), #10 (one-off hitches), the CLAUDE.md rule "Never set a CSS variable on `#app` or use `:has()` on it".
- **Recommended design fix:** the board is its own isolated subtree that UI state never writes to (state that changes the board is written on the few board elements it concerns), and every view part writes only what changed — enforced by a per-interaction restyle/DOM-write budget.
- **What we did:** **PARTIAL** — each instance removed (camera.js:117 `if (e.pointerType === 'mouse') v.classList.add('drag')` is itself a per-case `if`), and the rule was written into CLAUDE.md; the budget exists only for three interactions and was loosened when it failed (7dd059f: 80 → 120 ms).
- **Ratchet:** test — `test/frames.cjs:35-57` (select / move / cancel: < 400 elements restyled; select long task < 120 ms); touch pan start is not covered.
- **Assertion that would have caught it:** "no single interaction restyles or relayouts more than N board elements" — per-interaction trace budget (frames.cjs) extended to every input type (pan start, card drag, hover) — debug/test tier — yes, the first phone-throttled run would have failed on select and drag — also catches E7, E9 and 09-30 #7 — tags: `AS-dom-churn`, `AS-frame-budget`

### E6 — A finished game's results stayed on screen under a new game
- **Source:** owner report (2026-09-29 00:28: "when you're on local and you start a new game after the old game, it doesn't clear the state.")
- **Commits:** `d914b74` (`menuOpen` empties `#overlay`) · `8e1c02e` (the 600 ms results timer checks `S.over` before opening)
- **Symptom:** after a local game ended, starting a new game left the old game's results window in place.
- **Mechanism:** the results dialog lives in `#overlay` and is opened by `setTimeout(()=>showGameOver(),600)`; nothing tied it to the game on show, and starting a new game from the menu never closed it; the timer could also fire after another game was put on show.
- **Root cause:** which window is open is imperative state (opened by timers, closed by hand in chosen places), not derived from "which game is on show and what mode it is in".
- **Design decision:** overlays and UI modes are independent switches reset by hand, and some are scheduled by timers — tags: `DD-ui-flags`, `DD-imperative-sequencing`
- **Siblings:** 09-30 playtest #4 ("All cards" overlay leaks across states: `UI.allOpen` is not reset by `clearSelection()` (162c6d4, `state.js`) or anywhere else), #5 (rejoin flashes the room lobby), E19.
- **Recommended design fix:** derive the open window from state each frame (results ⇔ the game on show is over and the player hasn't dismissed it for *this* game id); no timers opening windows; one "a different game is on show" transition that clears everything.
- **What we did:** **HACK** — one more hand-written reset in one place (`menu.js:55` `$('#overlay').innerHTML=''`) and a guard on the timer (`actions.js:99` `setTimeout(()=>{if(S&&S.over)showGameOver();},600)`), which checks "some game is over", not "the same game". The decision stands; #4 shipped with the same cause.
- **Ratchet:** nothing — `test/menus.cjs:48-49` checks that New game opens the start screen, not that the results are gone.
- **Assertion that would have caught it:** "an overlay exists only in a state that uses it (results only while the game on show is over)" — per-frame invariant in the frame loop (always-on, cheap: compare `#overlay` content kind with state) — yes, first time anyone starts a new game after a finished one — also catches 09-30 #4, and any future overlay left behind — tags: `AS-view-matches-state`

### E7 — Jack of All Trades popped in late in "All cards"
- **Source:** owner report (2026-09-29 00:28: "when I hit all cards, all of the cards render right away, except for Jack of all trades, which takes a second to render and flickers in afterwards.")
- **Commits:** `d914b74` (market and All cards slots made once and updated in place: `patchSlots`) · then `b6b907c`/`0a6cba4` (every view part writes only what changed)
- **Symptom:** one card's art appeared about a second after the others and flickered in.
- **Mechanism:** `renderMarket()` replaced `#market`, `#allMarket` and `#reserve` innerHTML on every render, re-creating every card's SVG art; freshly created art is drawn again, and Jack's appeared late. Why Jack specifically: unknown (hypothesis, not verified: its art is the most expensive to rasterize, or it was the card whose slot was re-created while the overlay opened).
- **Root cause:** views were re-rendered wholesale from strings instead of updating what changed, so content that didn't change was destroyed and re-drawn.
- **Design decision:** whole-region rebuilds via innerHTML on every render — tags: `DD-whole-rebuild`
- **Siblings:** E5 (badges rebuilt), 09-30 #7 (history panel `setHTML` of the whole panel ~4× per hand-off, hand cards ~50 SVG elements each re-created), 09-30 06:06 owner ("when the card moves into the black and it finishes moving, it flickers for a second").
- **Recommended design fix:** keyed elements per item (a card element per card id / slot) updated in place, with a DOM-write budget per region per frame.
- **What we did:** **PARTIAL** — `market.js:38` `patchSlots` is right for the market, and the refactor made "write only what changed" the rule (docs/FRONTEND_REFACTOR.md), but the history panel and hand still rebuild (09-30 #7).
- **Ratchet:** nothing — the `?debug` mutation log (ff1d3a9) reports writes per area but no test budgets them.
- **Assertion that would have caught it:** "a render in which the state of a region didn't change writes nothing to that region" — debug MutationObserver per region per frame, compared with each part's own 'changed' decision — debug/test tier — yes, on opening All cards — also catches E5(c), 09-30 #7 and the history flicker — tags: `AS-dom-churn`

### E8 — The explorer no longer hopped: it slid/teleported, fast, on the phone
- **Source:** owner report (2026-09-29 00:33: "the player's moving animation is not smooth at all anymore. It used to be so smooth. Maybe I only saw it on PC, but it used to like look like a hop. Now it just looks like it … moves from one place and appears in the next."; 02:41: "the unit is still not hopping forward. I'm just kind of teleporting on that device. … it's like traversing through the intervening area, but … it's doing it really fast. And not in like a hopping motion.")
- **Commits:** `b6b907c`/`0a6cba4` (explorers become HTML; slide + hop as Web Animations on the compositor) · `7dd059f` (walk starts two frames after the move; hop ≥ ~9 screen px; 260 ms per space; frames.cjs slow-frame check) · `a936521` (turned the "explorer not drawn" guard into an assert: E30) · `2f4ee78` (09-30, see E30)
- **Symptom:** on his phone the explorer jumped between spaces (00:33), and after the refactor it slid through the spaces very fast without a visible hop (02:41).
- **Mechanism:** before 0a6cba4, `animatePiece` (ui_view.js 246-262, unchanged since the first commit) animated the SVG group with `requestAnimationFrame` + `setAttribute` on the main thread; with a slow main thread frames were dropped, so the piece appeared at later points. After 0a6cba4 the Web Animation started in the same task as the move, and Safari ran its clock during the following slow frame (the page's own update), so it appeared half done (a fast slide). In both versions the hop height was 8 board units, scaled by the zoom (≈0.4 on a phone): a ~3 px hop, invisible.
- **Root cause:** the animation was specified and checked only on a desktop at desktop zoom; its timing depended on what else the main thread did in the frame after a move.
- **Design decision:** animations tuned and verified only in headless/desktop Chromium, never on the owner's phone; and the walk's start was sequenced by frame timing — tags: `DD-untested-real-setup`, `DD-imperative-sequencing`
- **Siblings:** E12 (Safari flicker), E30 (the walk assumed the view had drawn), 09-30 #29 (`UI.anim` gates input while the explorer walks), 09-30 #34 (undo snaps back: no events to animate). Regression trigger: unknown (hypothesis, not verified: the permanent `will-change` board layer from 09-27 `4f0c94d` made each SVG attribute change inside it repaint the whole layer on a phone).
- **Recommended design fix:** specify the motion in screen terms (a hop of H screen px, T ms per space) and verify it on a real phone (or Safari) by sampling the animated element's position per frame; start animations from an explicit "state committed and drawn" point the frame loop provides instead of nested `requestAnimationFrame`.
- **What we did:** **PARTIAL `0a6cba4` → HACK `7dd059f`** — moving the animation to the compositor is a real improvement; 7dd059f then waits two frames (`pieces.js:68` `requestAnimationFrame(() => requestAnimationFrame(…))`: a delay to wait for something), and tunes numbers (`up = Math.max(14, 9 / view.s)`, `STEP = 260`); step sounds are retimed to the same guess (`sound.js` `.035+i*st+st*.85`). Whether his phone now shows a hop was never confirmed in the repo.
- **Ratchet:** test — `test/frames.cjs:39` "move: animations on the compositor" and `:56` "move after a slow frame: the walk plays from its start" (Chromium only; Safari's clock behaviour is not reproduced).
- **Assertion that would have caught it:** "a move is visible as a walk: the explorer is on its old space in the first drawn frame after the move, advances one space per STEP ms, and rises ≥ 9 screen px per hop" — test tier sampling `getBoundingClientRect` of the figure per frame on a throttled mobile profile (and on WebKit via Playwright) — would have fired in the first phone-profile run; in Chromium only for the hop height, the clock issue needs WebKit — also catches any animation that teleports (undo snap, 09-30 #34) — tags: `AS-layout-shift`, `AS-frame-budget`

### E9 — UI regressions kept shipping ("a lot of jank and a lot of regressions")
- **Source:** owner report (2026-09-29 00:33: "It seems like we're having a lot of jank and a lot of regressions over here, and I'm trying to figure out what's causing it. We might need to do a refactor or a rewrite."; 00:36: "because we keep having these issues. Try making things more modular")
- **Commits:** `b6b907c` / `0a6cba4` Front-end refactor (ES modules, one frame-batched update, parts write only what changed, frames.cjs, flows.cjs) · `a5be040` one path for every change · `162c6d4` one `clearSelection()` instead of five copies
- **Symptom:** each fix to one part of the page broke or slowed another (E3-E8 on one night).
- **Mechanism:** one large `ui_view.js` whose `render*` functions rebuilt regions from strings and read layout while writing; many call sites changed state and called specific render functions; resets of the selection were copied in five places.
- **Root cause:** no single update path and no ownership of DOM regions, so any change had non-local effects, and no phone-throttled frame tests to see them.
- **Design decision:** views rebuilt wholesale from many call sites, tested headless on desktop — tags: `DD-whole-rebuild`, `DD-untested-real-setup`
- **Siblings:** E5, E7, E8; 09-30 #7 (history/hand still rebuilt), #10 (hitches).
- **Recommended design fix:** what the refactor did (one `render()` → parts that diff and own their region), plus budgets that fail the build when a part writes outside its region or more than it changed.
- **What we did:** **PARTIAL** — the structure is right (docs/FRONTEND_REFACTOR.md, `frame.js`), but "write only what changed" is a convention: 09-30 found the history panel re-set as a whole ~4× per hand-off.
- **Ratchet:** test — `test/frames.cjs` (restyle budgets for three interactions), `test/flows.cjs` (a game played with real input), `test/lint.mjs` (imports).
- **Assertion that would have caught it:** "each view part writes only inside its own region, and writes nothing when its inputs didn't change" — debug per-frame MutationObserver keyed by region vs. the part's changed flag — debug/test tier — yes, every playthrough — also catches E7 and 09-30 #7 — tags: `AS-dom-churn`

### E10 — The test suite was too slow for a quick turnaround
- **Source:** owner report (2026-09-29 00:37: "You also, you also need to make the tests run faster. There's too many tests. You need to refactor the tests to be to only cover the things we actually care about, and quicker.")
- **Commits:** `0a6cba4` (`test/run.mjs`: everything side by side in ~45 s; `--full` for the rest) · `f112d80` (online end to end replaces e2e, e2e_ai, match, ai_local)
- **Symptom:** several minutes per verification, so fixes waited behind tests (and his questions waited too).
- **Mechanism:** separate test scripts run one after another, many with fixed pauses (`waitForTimeout`), overlapping coverage.
- **Root cause:** tests were added per feature without a tiering or a time budget.
- **Design decision:** no budget for test time; each change added its own script — tags: `DD-no-budget`, `DD-process`
- **Siblings:** E18 (fixed pauses also made tests flaky).
- **Recommended design fix:** a quick tier with a hard time budget (fails if > 60 s), parallel by default, waiting on conditions not time.
- **What we did:** **PARTIAL** — tiers and parallel runs (run.mjs), but no budget keeps it fast.
- **Ratchet:** nothing — nothing fails when the quick tier grows past a minute.
- **Assertion that would have caught it:** no in-game assertion applies (a process property); budget: `run.mjs` fails if the quick tier exceeds 60 s — tags: `AS-none`

### E11 — Performance budgets loosened when they failed
- **Source:** found by Claude (render.cjs and frames.cjs failing after the refactor; 09-28 `1f52aaf` had already noted "render.cjs wheel-latency p95 fails (~120 ms) … an existing cost to investigate")
- **Commits:** `63c9433` render test: check the wheel-zoom latency median (the p95 … swings 90-240 ms) · `7dd059f` (frames.cjs select long task 80 → 120 ms)
- **Same bug as:** D13 — the wheel-zoom latency check that failed in `1f52aaf` and was loosened in `63c9433` (E11 also covers the select budget)
- **Symptom:** wheel-zoom input latency tail of 90-240 ms at CPU/4, and card-select long tasks over 80 ms; the tests that measured them were relaxed instead.
- **Mechanism:** `test/render.cjs:53` now checks `med < 80` instead of `p95 < 100`; `test/frames.cjs:36` `sel.longest < 120` instead of `< 80`.
- **Root cause:** the tail latency was never traced to a cause (fonts? the zoom bake? GC?); the flakiness of a 24-sample p95 was treated as a test problem.
- **Design decision:** when a budget failed, the budget moved — tags: `DD-process`
- **Siblings:** E5 (select cost), 09-30 #7/#10 (frame drops measured the next day).
- **Recommended design fix:** keep the p95 budget, take more samples (so it is stable), and trace the slow events; a budget changes only with a written reason and the owner's agreement.
- **What we did:** **HACK** — "changing the test instead of the code"; the 240 ms tail was never investigated.
- **Ratchet:** nothing — the ratchet was weakened.
- **Assertion that would have caught it:** "no wheel/pinch event takes more than 100 ms to its frame (p95 over ≥ 200 events)" — test tier trace (render.cjs) — it did fire; the process ignored it — also catches any main-thread regression in pan/zoom — tags: `AS-frame-budget`

### E12 — Occasional flicker after moving the map (iPhone 11 Safari); the Mark button was unusable
- **Source:** owner report (2026-09-29 02:29: "There's still occasional flickers especially when finished moving the map"; 02:35: "Safari iPhone 11 it's after a couple of drags not really the first drag"; 02:49: "after the flicker happens, it's going to take me a full couple of seconds before I can hit the, the mark button."; 03:03: "Are you sure it's going to capture enough?")
- **Commits:** `4316200` ?debug diagnostics log (Mark, Copy log) · `916fc5f` numbers each drag as it ends · `ff1d3a9` logs every DOM change per frame by area — no fix
- **Symptom:** after a few pans, when a drag ends, the board flickers briefly (iPhone 11, Safari).
- **Mechanism:** unknown. Hypothesis, not verified: Safari evicts and re-rasterizes tiles of the huge permanently promoted `#stage` layer (`will-change: transform`) under iPhone memory pressure, showing blank/stale tiles for a frame; or the zoom "bake" redraw (`camera.js` settle) runs after a drag. The ?debug logs were built to tell these apart; no log from the owner is in the repo.
- **Root cause:** unknown (see mechanism).
- **Design decision:** the pan/zoom design was researched and verified in Chromium only; the owner's device (WebKit on an iPhone) was never in the test loop, so debugging relied on him tapping Mark in time — tags: `DD-untested-real-setup`
- **Siblings:** E8 (Safari animation clock), 09-30 15:02 ("It takes five seconds for it to exit. Trust me on this.": a bug only his real setup showed).
- **Recommended design fix:** add WebKit (Playwright webkit, and a real-device session) to the render test for pan/zoom; make the diagnostics self-marking (record a rolling window and let the owner mark "the last 5 s" after the fact, which 916fc5f's drag numbers approximate).
- **What we did:** **NOT FIXED** — diagnostics only; 916fc5f answers the Mark complaint (drags are numbered so he can say "drag 7") without finding the flicker.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no in-page assertion can see a compositor raster flicker; if the cause is a page write, "no DOM/style write in the frames after a drag ends except the settle" (the ff1d3a9 per-area log turned into a check) — debug tier; otherwise a WebKit screenshot-diff test of pan-and-release (render.cjs "release changes nothing" run on WebKit) — tags: `AS-dom-churn`, `AS-none`

### E13 — AI decisions and AI tools were not reproducible from a seed
- **Source:** found by Claude (API critique subagent, reported 2026-09-29 03:24: "Confirmed bug: the AI decides with `Math.random`, so two runs of the same seeded Humboldt game first differ at action 82. That makes the claim in `calibrate_ais.mjs` that its numbers reproduce false.")
- **Commits:** `bb4cc64` randomness is a parameter, not a global (but `newGame(o,rnd=Math.random)`, `applyAction(seat,a,rnd=Math.random)`, `recApply(…,rnd=Math.random)`) · `f6fc404` tools share one seeded playout; the bot's look-ahead applied draw actions without its rnd ("a reshuffle there used Math.random"); "ladder and friends had been shuffling with Math.random since randomness became a parameter" · `0ed43a9` (09-30) random sources required: no Math.random defaults
- **Symptom:** the same seeded AI game played twice diverged; calibration, ladder and h2h numbers could not be reproduced, and after bb4cc64 the tools silently played unseeded games.
- **Mechanism:** a global `RNG` swapped by `setRng` with save/restore pairs (21 calls in 7 files); `botChoose` used `Math.random`; after bb4cc64 any caller that omitted `rnd` silently got `Math.random`.
- **Root cause:** randomness was ambient (a global, then a default parameter), so forgetting to pass it was silent.
- **Design decision:** hidden global state for randomness, then a silent default — tags: `DD-global-state`, `DD-compat-path`
- **Siblings:** the engine's global `S`/`MAP` swapped by the worker and the bot (critique #1, made a parameter 09-30 `4a150c4`); the worker's shared `mapCache` (removed `cd17215`).
- **Recommended design fix:** every function that shuffles takes its random source as a required argument (assert), and a test plays a seeded AI game twice and compares the records.
- **What we did:** **PARTIAL `bb4cc64` → PARTIAL `f6fc404` → ROOT `0ed43a9`** — bb4cc64 removed the global but introduced silent defaults (a new instance of the bug in the tools); f6fc404 fixed call sites; 0ed43a9 removed the defaults and asserts `typeof rnd==='function'` in `newGame` / `applyAction`.
- **Ratchet:** assertion — `newGame: a random source (rnd)`, `applyAction: a random source (rnd)`, `recApply: the game's record` (engine_rules.js). No test replays a seeded AI game twice (grep of test/*.mjs finds none).
- **Assertion that would have caught it:** "a seeded game played twice produces the same record" — engine test tier (cheap: one short AI game) — fires on the first run after any unseeded randomness — also catches a hidden global, a default parameter, `Map` iteration-order dependence — tags: `AS-record-replays`

### E14 — The server accepted `timeout` from a player; the engine accepted `endgame` out of turn
- **Source:** found by Claude (API critique, 2026-09-29 03:24: "the server only blocks `endgame`, so a client can send `timeout`. The engine accepts `endgame` from any seat, even out of turn.")
- **Commits:** `9c62c67` (added `{t:'endgame'}` to `applyAction` above the `seat!==S.cur` check) · `162da2e` (server whitelist `PLAYER_ACTIONS`; endgame after the turn check)
- **Symptom:** a modified client could send `{t:'timeout'}` for its own turn (skipping the timeout bookkeeping); locally, `endgame` was accepted from any seat. No player saw it; latent.
- **Mechanism:** worker.js `if (m.a.t === 'endgame') return err(...)` — a blacklist; everything else went to `recApply`; in the engine the `endgame` branch ran before the turn check.
- **Root cause:** one engine entry point takes actions from three authorities (a player, the server's clock, the local host) and nothing records which authority an action needs; the server filtered by listing the forbidden ones.
- **Design decision:** no authority model for actions; input validation by blacklist — tags: `DD-per-element-patch`
- **Siblings:** `resign` accepted from any seat (by design); a future server-only action would have been open to players until someone remembered to blacklist it.
- **Recommended design fix:** each action type declares its authority in the engine (player / clock / host), `applyAction` takes the caller's authority and refuses mismatches; the server passes `player` for socket input.
- **What we did:** **ROOT** for the server — `worker.js:389,527` a whitelist fails closed for any new action; the engine's turn check now precedes `endgame` (`engine_rules.js:228`). The authority still isn't in the engine (the list is a second copy of the action set), so a local-play page could still send `timeout`.
- **Ratchet:** test — `test/online.cjs:66-67` "a player can't send timeout".
- **Assertion that would have caught it:** "every applied action comes from a sender entitled to it (players only player actions, and only on their turn)" — precondition in `applyAction` — always-on, cheap — only with a malicious or buggy client, not in ordinary play; the online test's fuzz of message types would — also catches any new server-only action — tags: `AS-engine-invariant`

### E15 — AI ratings shipped as a guess, and stale for the shipped network
- **Source:** found by Claude (calibration runs, 2026-09-29 04:40-06:57)
- **Commits:** `14cefe2` Fawcett shipped with "starting rating 1610 for now" · `f0b69b5` calibrated: Fawcett 1464, Humboldt 1398 ("was 1530, measured with an earlier network") · `ba2cc90` shipped network first-first1-351 ("AI ratings are being recalibrated for it") — never recalibrated
- **Same bug as:** C7 — AI ratings typed into the code and not recalibrated for the network that ships
- **Symptom:** online, the AIs' ratings (and the rating changes of people who play them) were wrong: Fawcett +146 too high for 15 minutes live; Humboldt 132 too high since an earlier network; since ba2cc90 all network AIs are rated for `first-first1-best`, not the network that plays.
- **Mechanism:** `AIS[].rating` in `engine_ai.js:12-14` is a hand-typed constant, and the worker shifts the DB rating by the difference once (`ai_rating:<id>` settings).
- **Root cause:** a rating describes (network, search settings) but is stored apart from them with no link; shipping a network doesn't invalidate it.
- **Design decision:** the same fact (how strong this AI is) lives in two places that drift: the shipped network file and a constant in the code — tags: `DD-multi-source-truth`
- **Siblings:** HANDOFF notes that cite old networks; the golden values (refreshed by hand in ba2cc90).
- **Recommended design fix:** store the calibration with the network it measured (e.g. in the packed network's header, which since f6fc404 names the network) and have the build or test refuse a rating whose network id differs from the shipped one.
- **What we did:** **NOT FIXED** — ratings still say they were calibrated with `first-first1-best` (f0b69b5 message) while `src/ai/first.bin` is first-first1-351 (ba2cc90); training/calibration was paused by the owner at 07:08.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "each AI's rating was measured with the network that ships" — test tier (engine test compares a `calibratedWith` id with the packed network's name) — fires at the first network change — also catches stale golden values and docs — tags: `AS-provenance`

### E16 — A purchase could get stuck after playing a Travel Log or Scientist
- **Source:** found by Claude (writing `test/rules.test.mjs` and the flows test, 2026-09-29 06:20)
- **Commits:** `fb7dd0d` Fix: a buy could get stuck after a Travel Log or Scientist … · (sibling cleanup `c3891f7` cardTargets in the engine; `ba58f3c` 09-30 removal asked in front of the hand)
- **Same bug as:** A10 — the page's own purchase rules ignoring a pending removal: A10 is where `affordable()` came in, E16 the stuck buy the owner hit, both fixed in `fb7dd0d`
- **Symptom:** with a card removal still to choose, tapping a market card started a purchase that hid the removal question; paying was refused by the engine, and the purchase's Cancel did nothing: the player was stuck.
- **Mechanism:** the page kept its own copy of the purchase rules (`pickFromMarket`: `S.turn.bought`, reserve open; `affordable()`), which ignored `S.turn.pending`; the engine's `buy` refused; `cancelMode()` began `if(S&&S.turn.pending)return;`, so Cancel/Escape silently did nothing.
- **Root cause:** a rule ("nothing else happens before the removal is answered") lived in the engine but the page re-implemented "can I buy?" without it; and a guard in cancel dropped the input for one state.
- **Design decision:** rule-derived logic duplicated in the page — tags: `DD-rules-outside-engine`, `DD-silent-failure`
- **Siblings:** targets/"card usable" rules written 9 times incl. twice in the page (critique #5, fixed `c3891f7`, `b7f69d8`); E19.
- **Recommended design fix:** the page only asks the engine (`cantBuy`, `buyOptions`, `cardTargets`) and never builds a mode the engine would refuse; Cancel always leads somewhere.
- **What we did:** **ROOT** — `engine_rules.js:31` `cantBuy(seat,t)` is the single rule, used by the buy action and by the market; `cancelMode` returns to `trashPick` when a removal is open. A new purchase condition added to `cantBuy` tomorrow reaches the page automatically.
- **Ratchet:** test — `test/rules.test.mjs:132` "nothing can be bought while a removal is still to choose", `:138`; `test/flows.cjs:112-117` clicks through the case (fails on the old code per the commit).
- **Assertion that would have caught it:** "the page enters a mode for an action only if the engine would accept that action now" (`assert(!cantBuy(...))` when entering pay mode) and "on my turn, input is never silently ignored" — precondition in `pickFromMarket`/mode entry, always-on — yes, the first time a player taps the market after a Travel Log — also catches every page/engine rule disagreement — tags: `AS-input-never-dropped`, `AS-engine-invariant`

### E17 — The turn went on after the last explorer reached El Dorado
- **Source:** found by Claude (how is not recorded; the commit cites no report). The owner decided the compatibility question (2026-09-29 06:39: "No, better to get rid of old games then, because we don't need backwards compatibility yet.")
- **Commits:** `c08be69` Rules: reaching El Dorado with your last explorer ends your turn at once … (log v3; older records refused) · `6970c01` one `passTurn` for end, arrival and resign
- **Symptom:** a player whose last explorer arrived could keep playing cards and buying, and drew a new hand at the end of the turn.
- **Mechanism:** `applyAction`'s `arrive` only set `P.fin` and called `checkEnd()`; the turn stayed with the player until `end`.
- **Root cause:** the rule for a player with no explorer left on the board was never written down or checked; the code did whatever followed from the move handler.
- **Design decision:** rules implemented without a rule-by-rule spec checked against the rulebook — tags: `DD-no-spec`
- **Siblings:** 09-28 `0e2bdbb` (single-use cards played for movement), 09-27 `0ade920` (tile data), 09-30 #35 (rules-order questions).
- **Recommended design fix:** a rules checklist quoted from the rulebook, one test per rule (rules.test.mjs is the start), and engine invariants for states that must not exist.
- **What we did:** **PARTIAL** — the rule is fixed properly in the engine (`engine_rules.js:324`) with a test, and old records were dropped per the owner; whether the rulebook says exactly this is not cited in the repo (unknown), and there is no rulebook cross-check for the other rules.
- **Ratchet:** test — `test/rules.test.mjs:174` "arriving with your last explorer ends your turn at once".
- **Assertion that would have caught it:** "a player with no explorer on the board is never the player to act (unless the game is over)" — postcondition of `applyAction` — always-on, cheap — yes, in any full-race game where someone arrives before the round ends — also catches other "zombie turn" states (resigned player to act) — tags: `AS-engine-invariant`, `AS-rules-vs-rulebook`

### E18 — Page tests failed under machine load (fixed pauses, deal-dependent checks)
- **Source:** found by Claude (tests failing while AI training used the machine; 2026-09-29 03:33-09:42)
- **Commits:** `162da2e` (e2e_ai waits for the AIs instead of 1.5 s) · `ba2cc90` ("flows.cjs … failed under heavy machine load with fixed pauses") · `75811b0` layout test · `e9ef9de` frames test · `a48c6ad` ("page tests wait up to 15 s per step on a busy machine") · `4ccbb2f` (the online test's "dead" connection still received clock broadcasts and looked alive) · `f6fc404` (flows: the AI's recap check depended on the deal) · later `ba58f3c` (09-30: settle waits two frames)
- **Symptom:** tests failed or passed depending on machine load and the random deal, so a red run didn't mean a bug and a green run didn't mean none.
- **Mechanism:** `waitForTimeout(ms)` pauses tuned to a fast machine; checks that assumed who moves first; a "silent" socket in the online test that the server's clock broadcast still reached.
- **Root cause:** tests synchronized on time, not on the page's state, and random setups weren't pinned.
- **Design decision:** correctness of the tests depended on timing — tags: `DD-imperative-sequencing`
- **Siblings:** E10, E20 (training load exposed it); 36 `waitForTimeout` calls remain in test/*.cjs (render.cjs 10, perf.cjs 9, online.cjs 3).
- **Recommended design fix:** tests wait on explicit conditions the page exposes (an idle/settled signal from the frame loop), seeds are fixed per test, and a lint forbids fixed pauses in functional tests.
- **What we did:** **PARTIAL** — flows/layout/frames moved to condition waits (`test/lib.cjs`), but timeouts were raised (15 s per step) and frame-count settles remain.
- **Ratchet:** nothing — no check forbids fixed pauses or runs tests under load.
- **Assertion that would have caught it:** no game assertion; test hygiene: a lint on `waitForTimeout` in functional tests, and run the quick tier twice under a CPU hog in CI — tags: `AS-none`

### E19 — Menu workflows led to broken states (online game dropped, seated in a room you'd left)
- **Source:** owner report (2026-09-29 05:46: "Cleaning up menu workflows and making sure there's no extra buttons and no workflows that are longer or lead to broken state."); the specific cases found by Claude
- **Commits:** `bf321e8` Menus: Replays is a third tab …; one game at a time; no way out of a room lobby but Leave; a replay returns where it was opened
- **Symptom:** during an online game the menu offered create / join / quick match / replays, each of which dropped you out of the running game; the room lobby's tabs and Profile link navigated away while you stayed seated; signing out left you in a room; picking the same replay file twice did nothing; extra Replays/Back buttons.
- **Mechanism:** each menu screen was reachable from anywhere and each button acted on its own (`exitOnline()` inside `startReplay`, joinRoom, …); the file input's value wasn't reset, so `change` didn't fire.
- **Root cause:** "where the player is" (in a room, in an online game, in a local game, watching a replay) was not one state from which the menu derives what it offers.
- **Design decision:** menu offers and navigation as independent switches — tags: `DD-ui-flags`
- **Siblings:** E6, 09-30 #5 (rejoin flashes the room lobby), #24 (New game discards without confirm), #28 (menu doesn't pause AIs), 09-28 21:49 ("theres no way to go back to local once you choose online").
- **Recommended design fix:** one "situation" value (none / local game / online lobby / online game / replay) and a table of what each menu screen offers in each situation; buttons that would leave the situation aren't rendered.
- **What we did:** **PARTIAL** — `showMenu()` (menu.js) derives the screen from state and hides tabs in a room/online game, but the rule is spread as per-button checks (`if(onlineGame()){toast(…);return;}` for replays, `#oBusy`/`#oPlay` toggles); the later siblings show the decision still stands.
- **Ratchet:** test — `test/menus.cjs` (new) and `test/online.cjs` (lobby, menu during an online game, signing out in a room).
- **Assertion that would have caught it:** "no menu action changes which game the player is in, except Start, Leave, Resign and End game" — precondition at each menu action (assert the situation is unchanged unless the action is one of those) — always-on — yes, the first time someone opens Replays during an online game — also catches #5, #24 — tags: `AS-view-matches-state`

### E20 — AI training starved the machine that builds and tests
- **Source:** owner report (2026-09-29 07:08: "Completely stopped the training for now." / "Training is using up resources that we need for everything else. … Right now our priority is getting everything professional and up and running for our first deployment.")
- **Commits:** `75811b0` HANDOFF: AI training paused for the first deployment (owner) · (ba2cc90 / a48c6ad: tests failing "under heavy machine load")
- **Symptom:** builds, tests and calibration competed with training for CPU; tests became slow and flaky (E18); the owner had to stop training himself.
- **Mechanism:** long training runs and calibrations (`nice -n 10 … calibrate_ais.mjs 720 2`, ~20 min on 2 cores) on the same machine as the session's builds and Playwright tests.
- **Root cause:** no CPU budget or scheduling between background training and foreground work.
- **Design decision:** background compute shared the machine with the work the owner was waiting on, with no limit — tags: `DD-process`
- **Siblings:** E18, E10; 09-27 owner note on usage limits ("keep things in the foreground").
- **Recommended design fix:** training runs elsewhere (or under a hard CPU cap) and pauses automatically while tests run.
- **What we did:** **NOT FIXED** (editor: first classified as a hack here; `75811b0` only records the pause in HANDOFF, so nothing of ours changed) — the symptom stopped because the owner stopped training; nothing prevents it when training resumes.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** none in the game (a process issue); budget: the test runner records machine load and wall time and warns when load > cores — tags: `AS-none`

### E21 — A silently dead online connection wasn't noticed; moves went nowhere
- **Source:** found by Claude (online audit; commit 2026-09-29 07:13)
- **Commits:** `4c22fb8` Online connection: a silently dead connection is noticed (heartbeat …); a move with no answer in 10 s resyncs; a move made while disconnected says so …; the server answers a move for a game that isn't running · `4ccbb2f` (the test's dead connection is silent both ways)
- **Symptom:** after a network drop (e.g. a phone waking up) the page looked connected, a tapped move did nothing and stayed "busy", and nothing reconnected.
- **Mechanism:** the page sent `ping` every 25 s but never checked for an answer; `ws.onclose` with code 1000 didn't reconnect; `act()` returned silently when `!canAct()`; the Room returned without replying to `act`/`undo` when the game wasn't running, leaving `NET.busy` true.
- **Root cause:** the protocol had no rule that every client message gets an answer, and no liveness check; failures produced silence.
- **Design decision:** silent failure paths in the client-server protocol — tags: `DD-silent-failure`
- **Siblings:** 09-30 playtest #21 (a socket close takes 10 s: `worker.js:636` `try { ws.close(code); } catch (e) { }` with the reserved code 1005 throws and the empty catch hides it; the 09-29 assertion audit `e851e67` reviewed and kept this catch, ASSERTIONS.md "ws.send / ws.close (a socket may be gone)"); 42 empty catches in page+server.
- **Recommended design fix:** every request message carries an id and gets exactly one reply (state or error) — the server's `onMessage` asserts that it answered; the client treats "no reply in T" as a dead link; no empty catch around socket calls.
- **What we did:** **PARTIAL** — a standard heartbeat and timeouts (`online.js:68` 40 s, `:81` 10 s, 5 s on visibility) and one new server reply branch; "every message is answered" is not enforced (09-30 #21 shows the socket lifecycle still had a silent failure).
- **Ratchet:** test — `test/online.cjs` kills a connection silently (both ways since 4ccbb2f) and checks it is replaced.
- **Assertion that would have caught it:** "every client message is answered, and a connection that hears nothing for T is replaced" — server postcondition per message (always-on) plus a client watchdog — would fire only after a real network drop (rare in local play; common on phones) — also catches 09-30 #21 — tags: `AS-server-reply`, `AS-input-never-dropped`

### E22 — Player chips cut in half when the game area was narrow
- **Source:** found by Claude (replay/tablet widths; commit 2026-09-29 07:17). Possibly related to 09-28 20:11 ("weird overlap here :)", image not inspected).
- **Commits:** `127544c` Top bar: player chips shrink instead of being cut in half …
- **Same bug as:** B2 — the player chips clipped in the top bar (`f0c51f3`), made to shrink in `127544c`
- **Symptom:** in replays (narrower game cell) and on tablets the top bar's player chips were clipped mid-chip.
- **Mechanism:** `#players{overflow-x:auto}` with `.pchip{flex:none}`: chips kept their content width and the strip scrolled/clipped; `.brandbox` is a flex sibling taking width.
- **Root cause:** the top bar's widths follow its contents (names, counts, the round label) rather than fixed slots.
- **Design decision:** content-sized layout of the top bar — tags: `DD-content-sized-layout`
- **Siblings:** 09-30 playtest #14 (player bar jumps 51 px at "Round N · final": `#roundLbl` in `.brandbox`, a flex sibling of `#players`), #12 (prompt pill changes size).
- **Recommended design fix:** fixed slots per seat (a grid with equal columns) and the round label in its own fixed cell, so text never moves neighbours.
- **What we did:** **PARTIAL** — container queries drop the card count then the AI tag and ellipsize names; the brand box still shares the row, and #14 shipped from the same decision.
- **Ratchet:** nothing — `test/layout.cjs:41` exempts chips from the on-screen check ("the player chips may scroll sideways inside their strip"), which is why this wasn't caught.
- **Assertion that would have caught it:** "every control is fully visible, and no control moves unless its own content changed" — layout test (drop the chips exemption) plus a debug layout-shift observer on the top bar — debug/test tier — yes at replay width — also catches #14 — tags: `AS-layout-shift`

### E23 — An AI's illegal choice silently ended its turn
- **Source:** found by Claude (assertion audit requested by the owner, 2026-09-29 07:16: "move as many if statements as you can into asserts")
- **Commits:** `00079c1` Engine: assert() for invariants instead of quiet fallbacks
- **Same bug as:** C3 — `aiStep` turning an illegal AI action into end turn (`37cfd2e`), made an assertion in `00079c1`
- **Symptom:** none reported; latent: an AI that chose an illegal action (or no action) just lost its turn, which looks like a weak or stalled AI rather than a bug.
- **Mechanism:** `aiStep`: `let r=recApply(rec,me,a); if(!r.ok)r=recApply(rec,me,{t:'timeout'})`; `aiChoose`: `a||(S.turn.pending?{t:'trash'…}:{t:'end'…})`; unknown AI ids fell back to the planner.
- **Root cause:** fallbacks written to keep games moving hid AI bugs.
- **Design decision:** silent fallbacks instead of invariants — tags: `DD-silent-failure`
- **Siblings:** the 60-decisions-per-turn stop (`engine_ai.js:41`, kept, still silent); E32 (network silently replaced by the planner); `aiChoose` planner fallback when `botNetReady` is false.
- **Recommended design fix:** the AI's action is asserted legal; the per-turn decision cap reports when hit.
- **What we did:** **PARTIAL** — `engine_ai.js:101` `assert(r.ok,'aiStep: the AI chooses a legal action')` (a root fix for illegal actions); the 60-action cap and the planner fallbacks remain silent.
- **Ratchet:** assertion — `aiStep: the AI chooses a legal action`, `aiChoose: a named AI` (engine test AI games exercise them).
- **Assertion that would have caught it:** "AI games always finish, and an AI turn ends within N decisions, each legal" — engine postcondition in `aiStep` plus a report when the cap is hit — always-on — would fire in the engine's AI games if the AI ever misplays — also catches stalls — tags: `AS-ai-progress`

### E24 — The rules test built maps real games can't have; engine fallbacks hid it
- **Source:** found by Claude (assertion audit; docs/ASSERTIONS.md "Bugs the assertions uncovered" 1)
- **Commits:** `00079c1` (rules test boards: parked explorers can reach El Dorado; all-arrived fixtures set `endTriggered`; `progress`/`advance` fallbacks become asserts)
- **Symptom:** none in play; the rules test passed on impossible fixtures (explorers where El Dorado is unreachable, "everyone arrived" without `endTriggered`).
- **Mechanism:** `progress()` quietly scored an unreachable explorer 999; `advance()` fell back to `endGame()` after its loop.
- **Root cause:** the engine tolerated impossible states instead of refusing them, so tests built on them looked fine.
- **Design decision:** silent fallbacks for states that must not exist — tags: `DD-silent-failure`
- **Siblings:** E23, E26-E28, E31.
- **Recommended design fix:** assert invariants in the engine so any fixture or state that violates them fails loudly.
- **What we did:** **ROOT** — `assert(false,'advance: someone takes the turn, or the game ends')`, `progress (El Dorado reachable)`; fixtures fixed.
- **Ratchet:** assertion — those asserts run in every engine test (`setAssertMode({debug:true})`).
- **Assertion that would have caught it:** exactly the asserts added — always-on — would have fired on the first test run — also catches any real game reaching such a state — tags: `AS-engine-invariant`

### E25 — build.mjs couldn't export an engine name that `Object.prototype` also has
- **Source:** found by Claude (adding the `AssertionError` class broke the build; ASSERTIONS.md bug 2)
- **Commits:** `00079c1` (build.mjs export list)
- **Symptom:** the build broke on the first class in the engine (its `constructor`).
- **Mechanism:** build.mjs discovers the engine's names by scanning identifiers and keeping those for which `eval('typeof '+id)!=='undefined'` inside a VM context, minus `Object.getOwnPropertyNames(globalThis)` of an empty context; `constructor` is visible in any context through `Object.prototype` but isn't an own property of `globalThis`, so it was treated as an engine name.
- **Root cause:** the engine is plain concatenated scripts with top-level globals, so its public surface is guessed by a heuristic instead of declared.
- **Design decision:** engine as global scripts whose exports are discovered heuristically — tags: `DD-global-state`
- **Siblings:** the hand-written `export const E={…}` list for the worker beside the scanned list (two lists of the same surface, unified in `7f11502` "export one surface").
- **Recommended design fix:** the engine declares its exports (ES module `export`), so nothing is guessed.
- **What we did:** **PARTIAL** — 00079c1 subtracts every name an empty context sees (`defined(vm.createContext({}))`), which fixes prototype names; the scanning heuristic stays.
- **Ratchet:** nothing specific (every test run builds, so this particular break would show as a failed build).
- **Assertion that would have caught it:** the build failing is already the check — tags: `AS-none`

### E26 — The Room turned every engine exception into "Bad action." and rebuilt the game on every refused move
- **Source:** found by Claude (assertion audit; ASSERTIONS.md bug 3)
- **Commits:** `e851e67` Boundaries for bugs: the page and the server catch a failed assertion, report it and recover
- **Same bug as:** D23 — the Room's catch that turned any engine exception into "Bad action." (`69b2191`), replaced by `guard()` in `e851e67`
- **Symptom:** a server-side engine bug looked to the player like a refused move ("Bad action."), and every refused move (even a typo) replayed the whole game from its record (CPU per refusal).
- **Mechanism:** worker.js `try { r = eng.recApply(this.rec, seat, m.a); } catch (e) { r = { ok: false, err: 'Bad action.' }; }` followed by a rebuild "so a refused action never leaves the game half-changed".
- **Root cause:** refusals (expected) and bugs (unexpected) went through the same catch.
- **Design decision:** a catch-all around the engine that swallowed bugs — tags: `DD-silent-failure`
- **Siblings:** E21, E27, E28; 09-30 #21 (empty catch in `onClose`).
- **Recommended design fix:** refusals are return values; exceptions are bugs handled by one boundary per entry point that reports and restores.
- **What we did:** **ROOT** — `Room.guard(what, ws, f)` wraps fetch / webSocketMessage / alarm / webSocketClose, stores a report with the record, restores from storage; no try/catch around the engine; a refused move changes nothing.
- **Ratchet:** test — `test/online.cjs` forces an assertion in a live room (`selftest`) and fails if any other bug report appears during the run.
- **Assertion that would have caught it:** "an exception is never reported to the player as a rule refusal" — lint (no catch that converts errors into `{ok:false}`) — lint/test tier — n/a in play — also catches E27, E28 — tags: `AS-no-silent-catch`

### E27 — A saved game that couldn't be rebuilt silently started a new game
- **Source:** found by Claude (assertion audit; ASSERTIONS.md bug 6)
- **Commits:** `e851e67` (loadSave reports and skips) · `00079c1`
- **Symptom:** latent: a player's saved game could vanish and a fresh game start with no word.
- **Mechanism:** `resumeSaved(){…try{…}catch(e){console.error(e);S=null;return false;}}` and `loadSave(){try{…}catch(e){return null;}}` swallowed rebuild errors.
- **Root cause:** storage failures (allowed) and rebuild bugs (not allowed) shared one catch.
- **Design decision:** swallowed errors — tags: `DD-silent-failure`
- **Siblings:** E26, E28.
- **Recommended design fix:** catch only the storage call; a failed rebuild goes to the boundary.
- **What we did:** **ROOT** for this path — `state.js:39-42` catches only `localStorage`/`JSON.parse`; `recState` failures call `failed(e,'rebuilding the saved game')`.
- **Ratchet:** nothing — no test feeds a corrupt save (hypothesis: not found in test/).
- **Assertion that would have caught it:** the boundary report itself ("every failure reported") — tags: `AS-no-silent-catch`

### E28 — Catches too wide: loadReplayId hid display bugs; the fullscreen rejection went unhandled
- **Source:** found by Claude (assertion audit; ASSERTIONS.md bugs 4 and 5)
- **Commits:** `e851e67` / `b59a1b0`
- **Symptom:** any bug while showing a replay appeared as "Could not load replay"; a refused fullscreen request became an unhandled promise rejection.
- **Mechanism:** `loadReplayId`'s `try` covered the fetch and the display; `try{el.requestFullscreen()}catch` didn't catch the returned promise.
- **Root cause:** try/catch placed around whole operations instead of the one call that may fail.
- **Design decision:** broad or misplaced catches — tags: `DD-silent-failure`
- **Siblings:** E26, E27; 38 empty catches remain in `src/client` + `src/worker.js` (grep).
- **Recommended design fix:** catch only the fallible call; a lint that forbids empty catches without a named reason.
- **What we did:** **PARTIAL** — these two narrowed; no lint, and empty catches remain (09-30 #21 was one of them).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "no empty catch; every catch names the fallible call and reports anything else" — lint — n/a in play — also catches 09-30 #21 — tags: `AS-no-silent-catch`

### E29 — False invariant: `marketRectOf` asserted every card type still has a stack
- **Source:** found by Claude (online test's "no other bug reports" check, before shipping; commit 2026-09-29 08:09)
- **Commits:** `8e1c02e` (assert added) · `a48c6ad` (restored with the reason)
- **Symptom:** in online play, an event for an earlier action of a batch failed the assertion (the stack had since sold out and its slot refilled), which would have shown "Something went wrong … restored".
- **Mechanism:** event handlers (card flights) look up the market *now* for an event that describes the past.
- **Root cause:** events are replayed against the latest state, not the state they were produced in.
- **Design decision:** view animations of events read current state, and the guard-removal pass assumed they matched — tags: `DD-animation-coupled`
- **Siblings:** E30 (same class, shipped); ASSERTIONS.md "Page code that handles events runs against the latest state: don't assert that an event's card or stack still exists."
- **Recommended design fix:** events carry what the view needs to animate them (from/to positions or slot ids), or animations are optional decorations that skip when their target is gone — decided once for all event handlers.
- **What we did:** **PARTIAL** — this assert removed with a documented principle; the principle is a note, not a mechanism (E30 repeated it an hour earlier in the same pass).
- **Ratchet:** test — the online test fails on any unexpected bug report.
- **Assertion that would have caught it:** the online test's report check did — tags: `AS-events-explain-change`

### E30 — False invariant `animateMove: the explorer is drawn` → "game restored" toasts
- **Source:** introduced by Claude (`a936521`, 2026-09-29 07:55); seen by the owner on 2026-09-30 (playtest #6; `2f4ee78`: "Found in the owner's Chrome (2 of 4 online games)")
- **Commits:** `a936521` Board views: no guards … ("pieces: a move event always finds its explorer drawn (assert)") · `2f4ee78` (09-30) Fix 'animateMove: the explorer is drawn' when a game starts in a hidden tab
- **Same bug as:** F28, P6 — the false invariant `animateMove: the explorer is drawn` (`a936521`), fixed in `2f4ee78`
- **Symptom:** online games started in a background tab showed "Something went wrong, sorry. The game was restored." when an AI's first move arrived.
- **Mechanism:** a hidden tab draws no frames, so `piecesPart.update()` hadn't created the explorers when `animateMove` ran for the AI's move; the new assert failed and the boundary resynced.
- **Root cause:** views create their elements in the next frame, while events are handled immediately; the assert assumed the view had caught up.
- **Design decision:** event animation coupled to the view having rendered, plus a guard-removal pass that didn't test the states it declared impossible — tags: `DD-animation-coupled`, `DD-untested-real-setup`
- **Siblings:** E29 (same class, caught before shipping), E8.
- **Recommended design fix:** as E29: one rule for all event animations (skip or snap when the element isn't drawn), and hidden-tab / slow-frame cases in the online test before removing guards.
- **What we did:** **PARTIAL** — 2f4ee78 restores `if (!P) return;` with the reason (an explorer not drawn has nothing to walk from), i.e. the sound principle applied case by case again.
- **Ratchet:** test — `test/online.cjs` "an AI moves while the tab is hidden" (fails without the fix, per the commit).
- **Assertion that would have caught it:** the assertion did fire — in the owner's browser, a day later; the online test with a hidden tab (added after) would have caught it before shipping — tags: `AS-events-explain-change`

### E31 — Replays silently patched moves that didn't fit the game
- **Source:** found by Claude (cleanup pass, 2026-09-29 09:28)
- **Commits:** `9deac13` Replays: a log whose moves don't fit the game is refused with the move that failed, instead of patched by ending those turns
- **Same bug as:** A33 — the replay loader that ended the turns of moves that didn't fit (`3ab0316`), refused in `9deac13`; A33 also covers the training tools
- **Symptom:** latent: a replay of a log with an illegal move showed a different game from the one played (those turns were ended instead), with only a toast.
- **Mechanism:** `buildReplay`: `if(!r.ok){fails.push(i+1);r=applyAction(S.cur,{t:'end',keep:[]},g);}`.
- **Root cause:** a fallback that kept going instead of refusing bad data.
- **Design decision:** silent (toast-only) repair of invalid input — tags: `DD-silent-failure`
- **Siblings:** E23, E24.
- **Recommended design fix:** refuse invalid records with the failing move (as done).
- **What we did:** **ROOT** — `replay.js:18` throws "move N doesn't fit the game".
- **Ratchet:** nothing — no test feeds a bad log (hypothesis: not found).
- **Assertion that would have caught it:** "a game's record replays to the same state it recorded" — `AS-record-replays` at record load — tags: `AS-record-replays`

### E32 — A multi-course network would have made Humboldt silently play as the route planner
- **Source:** found by Claude (API critique 2026-09-29 03:24: "the packed format drops the multi-course fields. 12 of the 32 trained networks are multi-course, and shipping one would make Humboldt quietly play as the route planner.")
- **Commits:** `f6fc404` (pack.mjs / aiNetDecode: a multi-course network's courses, onehot and extra go in the header)
- **Symptom:** latent (no multi-course network was shipped): the "Master" AI would have played as the "Steady" planner with no sign.
- **Mechanism:** `pack.mjs` wrote only single-course fields; `botNetReady()` then returned false and `aiChoose` fell back to `{mode:'plan'}` (`engine_ai.js:39`).
- **Root cause:** a lossy file format plus a silent capability fallback.
- **Design decision:** silent fallback when the network doesn't fit — tags: `DD-silent-failure`
- **Siblings:** E23, E15.
- **Recommended design fix:** a shipped AI whose network doesn't fit its course is a build/test failure; at runtime the fallback is reported.
- **What we did:** **PARTIAL** — the format carries the fields now; the silent fallback remains.
- **Ratchet:** nothing found in test/.
- **Assertion that would have caught it:** "every AI offered for a course plays with the network it advertises" — test tier (engine test: for each `aiAllowed` course, `botNetReady` is true) — fires at packing time — tags: `AS-ai-progress`

### E33 — History panel: a resize loop, and a content-sized panel
- **Source:** found by Claude (the bug reporter in the online test caught the loop, 2026-09-29 19:10 merge); the panel's later defects reported by the owner on 2026-09-30 ("Why does the history look like it expands so much to the right?", "sometimes the cards are going two lines", "On phone, when you put history there, it becomes the full screen.")
- **Commits:** `d51aa25` Replace the journal with a movable, resizable history panel (PR #3, another session) · `9ffc034` Merge the history panel … ("watching the panel itself made a resize loop, which the bug reporter caught in the online test") · 09-30 follow-ups (e.g. `0101346`) belong to the 09-30 chunk
- **Same bug as:** F1, F2 — E33's content-sized-panel half is what the owner reported on 09-30: F1 the width set by content and drags (replaced by a fixed row and a grid cell in `0101346`), F2 the turns wrapping to two lines once PR #3 dropped the row's fixed height (`9ffc034`)
- **Symptom:** (19:10) a ResizeObserver loop error in the online test; (09-30) panel grows sideways, turns wrap to two lines, full screen on phones.
- **Mechanism:** the panel's ResizeObserver watched the panel and set its width in the callback, whose content reflowed to the width → loop; width followed content and user drags.
- **Root cause:** the panel's size depended on its contents and its contents on its size.
- **Design decision:** a content-sized, freely resizable panel instead of a fixed slot — tags: `DD-content-sized-layout`, `DD-float-over`
- **Siblings:** E22, 09-30 history reports, #7 (the panel rebuilt as a whole per AI action).
- **Recommended design fix:** a fixed-width slot (a grid cell) whose only variable is height; each turn fixed height, cards scaled to fit one line.
- **What we did:** **PARTIAL** — 9ffc034 observes only the newest turn and never sets width from the callback (fixes the loop); the content-sized design stayed and produced the 09-30 reports. → **ROOT** `0101346` for the panel's size and placement (see F1) → **PARTIAL** `2da7863` for the captions that still widen a step (see F2).
- **Ratchet:** test — `test/online.cjs` fails on any unexpected bug report (the boundary caught this one before shipping: the assertion system working as intended).
- **Assertion that would have caught it:** the page boundary did (window error); for the later defects: "the history panel's width never changes except by a direct resize, and each turn is one line" — debug layout-shift observer — tags: `AS-layout-shift`, `AS-no-silent-catch`

### E34 — Design agents ran on the main thread, so the owner kept stopping them
- **Source:** owner report (2026-09-29 19:10: "restart those design agents, but start them on a background thread. I keep stopping them by accident on the main thread. I shouldn't be able to do that. … It's really annoying.")
- **Commits:** none (process)
- **Same bug as:** D18 — the design agents run inside the conversation and lost when it was interrupted or restarted (09-28, 09-29)
- **Symptom:** long-running design subagents were killed whenever the owner interrupted the main session to ask something.
- **Mechanism:** the agents were launched in the foreground of the session he talks to.
- **Root cause:** long work was started where his messages interrupt it, contrary to his "questions come first" rule (CLAUDE.md).
- **Design decision:** long-running work in the foreground of the conversation — tags: `DD-process`
- **Siblings:** E20 (background compute competing with foreground), CLAUDE.md "Never make him wait behind a long command".
- **Recommended design fix:** a standing rule: anything longer than a minute runs as a background agent/process.
- **What we did:** **NOT FIXED** — unknown whether they were restarted in the background; no rule was written to CLAUDE.md or HANDOFF (grep finds none). → **PARTIAL** (09-29 19:11: relaunched as separate cloud sessions, which stopping the conversation can't stop; no rule written; see part H's additional report to E34).
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no code assertion (process) — tags: `AS-none`

## 2026-09-29 (messages sent during work)

### H1 — Replay "every option" list rated "end the turn, keep everything" close to real moves
- **Source:** owner report (2026-09-29 06:19 UTC: "I noticed that the evaluations of every possible move are not very useful." … "Are you sure the model hasn't gotten worse? Because when I looked at it, it's the way it's evaluating all the next best moves. Like, it was very wrong. Like, it had moves that were significantly better. Like, it had a move that it didn't rate that badly as just not doing anything that turn and holding everything. Which seems to be bad."; 06:25 UTC: "Because I'm worried that at some point you might have had a regression.")
- **Commits:** `5706295` (09-27, `botScoreActions` written for AI experiments) · `3c496d1` (09-28 19:46, replay Evaluation "expandable to every option of the player to move": `replayAlts()` over `botScoreActions`) · `be62bb1` (09-29 06:36, list replaced by Fawcett's whole-turn plan, `aiPlan`) · `7f11502` (09-29 08:48, `botScoreActions` deleted as dead code)
- **Symptom:** in a replay, the per-move percentages ranked a do-nothing "end turn, keep everything" near moves that were clearly better, so the owner suspected the shipped network had regressed.
- **Mechanism:** `botScoreActions` (engine_bot.js at 3c496d1, lines 383-392) applied each single legal action to a clone and scored the resulting *mid-turn* position with `botValue(me,'net')`; only `end` was scored as an end-of-turn view (`botEndView`). The network is trained on end-of-turn positions (engine_bot.js:346, "the network's value of the end-of-turn position (before the next draw: what it is trained on)"), so half-finished turns and "end now" were compared on unequal terms (be62bb1's message says exactly this). Each score was then shown as a share against the other players' raw values (`ui_replay.js:36` at 3c496d1).
- **Root cause:** the network was asked about positions outside what it was trained on, and its outputs were presented as a ranking of moves, a meaning nobody defined or checked.
- **Design decision:** a model's raw output was put in front of the player as analysis without a stated contract (which inputs are valid, what the number means) — tags: `DD-unvalidated-model`, `DD-no-spec`
- **Siblings:** H2 (the win-chance bars: same network, evaluated on every replay position including mid-turn ones, shown as percentages that aren't probabilities); H3 (the regression scare this display caused); E15 (ratings measured with another network).
- **Recommended design fix:** analysis shows only what the AI itself decides with (the planner's whole-turn line, compared at end-of-turn positions), and the engine asserts that the value network is only evaluated on an end-of-turn view.
- **What we did:** **PARTIAL** — be62bb1 removed the per-move list (`replayAlts`, the `eldorado-rexp` toggle) and shows `aiPlan` (engine_ai.js:46), the planner's own line, whose candidates are compared by end-of-turn value; 7f11502 deleted `botScoreActions`. That kills this instance by deleting code. But nothing stops the network being evaluated off-distribution: `replay.js:33` still calls `botValue(S,j,'net')` on every replay position, mid-turn included (H2).
- **Ratchet:** nothing — `test/flows.cjs:109` only checks that a plan naming Fawcett appears; it would still pass if per-move scores came back beside it.
- **Assertion that would have caught it:** "the value network is only evaluated on an end-of-turn view (the positions it was trained on)" — precondition where `botValue(…,'net')` reaches `botNetValue` (the caller states the position is an end-of-turn view and the assert checks it, e.g. no card in play and no action active) — always-on, cheap — yes: the first time anyone expanded the list in any replay (every option except `end` violates it) — also catches H2's mid-turn bars and any future hint feature that scores partial turns — tags: `AS-model-contract`

### H2 — Replay "winning chances" are not winning chances
- **Source:** owner report (2026-09-29 06:19 UTC: "Like, yeah, the current win probability is great, even though it's not like actually accurate at all.")
- **Commits:** `3c496d1` (09-28 19:46, bars labelled "estimated winning chances") · `be62bb1` ("the win-chance bars stay") · `8084257` (09-30 16:02, "Audit: cut what the owner marked as noise": the subtitle is removed, the percentages stay)
- **Symptom:** the replay shows one percentage per player, summing to 100%, that reads as a win probability but, in the owner's words, is "not like actually accurate at all".
- **Mechanism:** `replay.js:31-34`: for each player `raw = botValue(S,j,'net')`, the network's estimate of that player's expected *place value* from their own seat (1st = 1, 2nd = ¼, 3rd = ⅛, last = 0: `engine_bot.js:264-265`); then `share = raw/sum`, printed as `Math.round(v*100)+'%'` (`replay.js:147`). The four estimates are made independently, so they aren't jointly consistent, and a normalised expected place value is not a probability of winning. They are also computed on every replay step, mid-turn positions included, which the network was not trained on (whether that makes them worse there: hypothesis, not verified).
- **Root cause:** the number was never defined as what its label claims; normalising it to 100% made it look like a probability.
- **Design decision:** `DD-unvalidated-model`, `DD-no-spec`
- **Siblings:** H1; E15.
- **Recommended design fix:** show what the network predicts under its real name (expected place), or add a trained win-probability output checked for calibration on recorded games; evaluate at the last turn boundary, not mid-turn.
- **What we did:** **NOT FIXED** — the owner called the display "great", and 8084257 removed only the subtitle; the computation is unchanged.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** "a displayed chance is calibrated: across recorded AI games, positions shown at x% end in a win about x% of the time (per decile, within a few points)" — test tier over ladder/fixture games (statistical, so no in-play assertion can show it); the in-play half is H1's precondition, which fires on every mid-turn replay position — also catches a newly shipped network whose value scale changed — tags: `AS-model-contract`

### H3 — "Has the model regressed?" couldn't be answered: every network comparison predated the rules fix
- **Source:** owner report (2026-09-29 06:19 UTC: "Are you sure the model hasn't gotten worse?"; 06:25 UTC: "We're just caring that it's the best model that we train. That's what we care about. And that there was no regression. Because I'm worried that at some point you might have had a regression."); gap found by Claude while checking (main session 06:24: "The current network (first-first1-best) was never played directly against the previous one (first-distill-35) under today's rules."; 06:27: "Rules fix landed 09-28 05:06, so every older comparison was played under the buggy rule.")
- **Commits:** `0e2bdbb` (09-28 05:06, rules fix: single-use cards played for movement are removed; this invalidated the earlier ladder results) · `ba2cc90` (09-29 06:57, ladder re-run under the current rules, first-first1-351 shipped, HANDOFF rule)
- **Symptom:** when the owner asked, there was no evidence under the current rules that the shipped network was the best one, or no worse than its predecessor. The re-run then found no regression (task bfjceupbf, 06:47: first-first1-best beat first-distill-35 246 seats to 11, distill-53 236 to 20, multi4-40 247 to 9, was even with ck198, and lost to iteration 351 106 to 59 with search).
- **Mechanism:** networks were promoted on ladder matches played at the time. When `0e2bdbb` changed the rules, nothing marked those results as stale, and nothing recorded which rules a comparison was played under.
- **Root cause:** "the shipped network is the best we have" was a claim with no stored evidence tied to the current rules; checking it was manual and happened only when asked.
- **Design decision:** the evidence about a shipped artifact lived apart from it, with no link that a rules change could invalidate — tags: `DD-multi-source-truth`, `DD-process`
- **Siblings:** E15 (AI ratings measured for another network, same decision); golden values refreshed by hand (ba2cc90); H1 (the display that raised the alarm).
- **Recommended design fix:** the packed network carries its promotion record (opponent, games, score, log/rules version), and a test refuses a network whose record was made under an older log version; promotion runs the match.
- **What we did:** **PARTIAL** — one manual ladder run and a written rule in HANDOFF ("**Keep shipping the best network trained** (owner, 2026-09-29): before promoting, play the candidate against the shipped one with `node tools/ai/ladder.mjs match <shipped> <candidate> 128 3`"). Nothing records or checks it, and the rules changed again the same morning (`c08be69`, log v3) without a re-run.
- **Ratchet:** nothing (a doc rule).
- **Assertion that would have caught it:** "the shipped network's recorded comparison was played under the current rules version and beat the previously shipped network" — test tier (engine.test reads the model's metadata and compares it with the log version) — not in a playthrough — also catches E15's stale ratings and stale golden values — tags: `AS-provenance`

### H4 — Owner's status questions went unanswered or got a wrong answer; a request waited six hours
- **Source:** owner report (2026-09-29 06:55 UTC: "What's the update on whether all the UI changes were done? Because when I last looked, not everything was done. Additionally did you complete the refactoring things before, or did you get distracted?"; 06:19 UTC: "Also, can you link to me all of the potential alternative design decisions with the screenshots so I can view them now?", repeating 00:19 UTC: "I want to see the different screenshot examples of the of what the AI got for the redesigns."; 07:07 UTC: "Can you prioritize restarting the thing that's supposed to be trying out the new designs? And getting screenshots of them because last time I checked there were designs with uncompleted screenshots.")
- **Commits:** `8dbdca8` (09-28 19:13, CLAUDE.md: "the owner's questions come first — stop and answer right away, then resume", already in force) · `237fd6f` (09-30 15:41, CLAUDE.md in the owner's words, including "Keep a ledger of my open requests")
- **Same bug as:** C14, D1 — the owner's questions waiting behind, or lost in, Claude's work (09-27, 09-28, 09-29)
- **Symptom:** the 06:55 question got no answer: the transcript logs it as `absorbed_mid_turn` at 06:55:39, and the session's next words (06:57) were "The stronger network is live (ba2cc90). … Now back to the refactor, starting with the menu workflows." His 00:19 request to see the redesign screenshots was met only when he asked again at 06:19 (design page built 06:21-06:30). At 07:07 he was told "The design agents were already restarted about 50 minutes ago and are still running", but they had died at 06:39. At 07:20 he was told "I stopped nothing, they had ended on their own without output", which was also wrong: they were interrupted by his own 06:39 message (E34).
- **Mechanism:** messages sent during a turn are folded into the running turn, and nothing turns them into items that must be answered or closed. Status was given from memory before it was checked (the check came 8 seconds later at 07:07:32: "Only 10 'before' shots … nothing new in almost 30 minutes").
- **Root cause:** open requests and questions lived only in the flow of the conversation, with no list that forces each one to be answered; status wasn't read from the source of truth (the agents' transcripts, the branches).
- **Design decision:** no tracking of the owner's open requests, and status reported from belief — tags: `DD-process`, `DD-silent-failure`
- **Siblings:** E34 (the killed design agents nobody noticed), E12 (03:03 "Are you sure it's going to capture enough?"); 18:38 "Did you merge in any of the UI change recommendations from the agents? Or did you leave that for me to decide?" (asked because nobody had reported the outcome).
- **Recommended design fix:** a ledger of every request and question, shown after each piece of work; questions answered before any other work; status stated only after it has been checked.
- **What we did:** **PARTIAL** — on 09-30 the owner wrote the ledger rule into CLAUDE.md himself (237fd6f). It is a written rule with no mechanism, and the "questions first" rule (8dbdca8) was already there on 09-29 and was not followed at 06:55.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** no code assertion (process). The check would be: at the end of each turn, every owner message absorbed mid-turn has a reply or a ledger line (a session hook could list them) — tags: `AS-none`

### Additional reports to existing entries
- E16: also reported 09-29 05:59 UTC: "https://el-dorado.shlomoalon9.workers.dev/?room=WQR6P the buy is not completing despite putting up enough gold." This changes the **Source**: it is an owner report from a real online game, not a bug found by Claude. The session traced it from his game's public replay (06:10: "Your game just finished and its replay is public (86e633xe)") and confirmed the cause before committing (06:18: "The old code fails at exactly those steps and ends up stuck in the buy, which reproduces your bug"); `fb7dd0d` shipped 21 minutes after his report. It also confirms the entry's "would fire in ordinary play: yes": he hit it in an ordinary game.
- E17: also reported 09-29 06:08 UTC: "Another thing to watch out for, when you reach the end, it still asks you to finish your turn, even though you've already ended the game. Once you reach the end, you shouldn't do any more work. You've hit the end." This changes the **Source**: it is an owner report, not "found by Claude (how is not recorded)". The session acknowledged it at 06:10 ("Second issue noted: after you reach El Dorado, the game still makes you end your turn. I'll fix that after the buy bug.") and `c08be69` followed at 06:50. His words are the spec for the rule (the entry's "whether the rulebook says exactly this is unknown" still holds; the rule implemented is the owner's). It probably came from the same game as E16 (replay 86e633xe was re-checked under the new rule at 06:38; hypothesis, not verified).
- E18: also found by Claude 09-29 01:29 UTC (task "See which frame check is flaky under load": `FAIL no move found: {"mode":"idle","cover":false,"act":true,"hand":["traveler","traveler","sailor","traveler"]}`), before the entry's 03:33 start. It is another deal-dependent check: the deal gave the player no card that moves an explorer. `0a6cba4`'s `test/frames.cjs:26-30` fixed it by ending up to 8 turns until some player holds a movable card (a retry over the random deal, not a pinned seed), which fits the entry's PARTIAL.
- E34: also reported 09-29 06:24 UTC: "It seems like the sub-agent didn't finish all of the screenshots or all of the mock-ups. You might need to restart it."; and 07:07 UTC: "Can you prioritize restarting the thing that's supposed to be trying out the new designs? And getting screenshots of them because last time I checked there were designs with uncompleted screenshots." New evidence from the subagent transcripts: every design-agent run ended "[Request interrupted by user]" at the exact time of one of his messages. That is three runs on 09-28 (19:09, 19:38, 20:35), two started 06:26 and killed 06:39:24 by his 06:39 message, and three started 07:09 and killed 07:16:45 by his 07:16 message. The session didn't notice and misreported it (H4). His 19:10 request was then carried out: at 19:11 the three were relaunched as separate cloud sessions (`create_session`, tag `el-dorado-design`: "Unlike subagents, they're independent of this conversation, so stopping this thread can't stop them"), and all 18 option branches and screenshots were in by 20:14-20:19 (scratchpad `mockups5/`, three MANIFESTs). This changes **What we did** from NOT FIXED to **PARTIAL**: the instance is fixed by moving the work out of the conversation, but no rule was written (CLAUDE.md and HANDOFF still say nothing about background or separate sessions).
- E6: also found by Claude, reported 09-29 08:28 UTC by the assertions subagent ("7. The results dialog's 600 ms timer could open for a different game."). It is the same `8e1c02e` guard the entry already calls a HACK (it checks "some game is over", not "the same game"). No change.
- E24: also reported 09-29 08:28 UTC (subagent: "1. The rules test built maps real games can't have … It only passed because of two engine fallbacks that are dead code in real games."). No change.
- E25: also reported 09-29 08:28 UTC (subagent: "2. `build.mjs` couldn't export an engine name that JavaScript objects already have, such as `constructor`."). No change.
- E26: also reported 09-29 08:28 UTC (subagent: "3. The Room turned any engine exception during a player's move into \"Bad action\", and rebuilt the whole game on every refused move."). No change.
- E27: also reported 09-29 08:28 UTC (subagent: "6. A saved game that failed to rebuild was silently dropped."). No change.
- E28: also reported 09-29 08:28 UTC (subagent: "4. `loadReplayId` caught every error while showing a replay and turned it into \"could not load\"." / "5. A refused full-screen request became an unhandled promise rejection; the old `try/catch` never caught it."). No change.
- E29: also reported 09-29 08:28 UTC (subagent: "8. One false invariant of my own was caught by the online test before it shipped: `marketRectOf` can't assume a card's stack still exists"; and under "Unsure, left alone": "`stackOf` says every card type has exactly one stack, which isn't true once a sold-out market slot is refilled from the reserve. The engine files are yours now, so I didn't change it."). New: the false comment that the false invariant trusted is still in the code (`src/engine_rules.js:25`, "every type has exactly one stack"; `stackOf` returns null for a sold-out type), so the next reader can repeat E29.
- E23: also reported 09-29 08:28 UTC (subagent, "Unsure, left alone": "`aiChoose` stops an AI after 60 actions in one turn. I kept it as a limit, not an assert"). No change: the entry already names the cap as the silent part.

## 2026-09-30

Sources for this day: the owner's typed messages (owner/2026-09-30.md) plus the messages he queued while Claude was
working, which the extract missed (read from the session transcript's `queued_command` entries; times UTC). The long
"playtest review" (19:14) is covered by the playtest part and is only cross-referenced here.

### F1 — History panel grows sideways instead of downwards
- **Source:** owner report (2026-09-30 01:50: "Why does the history look like it expands so much to the right? ... It should be expandable downwards, not to the right. It should have a stable size.")
- **Commits:** `9ffc034` (09-29, merged PR #3: the movable, resizable panel) · `765f07e` History panel: one fixed width; it only grows downwards · `0101346` History: back to the one-turn recap row, plus a column of every turn
- **Same bug as:** E33 — the history panel's width set by content and drags (`9ffc034`), replaced by a fixed row and a grid cell in `0101346`
- **Symptom:** the history panel came up wide (up to 640 px) and its corner grip made it wider as well as taller; it did not keep one size.
- **Mechanism:** `#hist` floated over the game at `width:min(640px, …)`; the resize corner set `DRAG.w`/`P.w` from the pointer (feed.js before 765f07e, `dragWith($('#histSize'))`), and the saved width was reapplied by `place()`.
- **Root cause:** the panel had no place of its own in the layout: its position and size were whatever the user or its content made them, clamped into the game area.
- **Design decision:** a free-floating, draggable, resizable panel over the game instead of a fixed slot or a grid cell. — tags: `DD-float-over`
- **Siblings:** F2 (row wraps), F4 (snap to the left hard to undo), the panel's height recomputed from the newest turn while cards flew in (panel jumped mid-animation, 0101346 message), the ResizeObserver loop from observing the panel (09-29).
- **Recommended design fix:** no floating panel: one fixed-height slot under the prompt and one grid column for the full history; size set by the layout, not by drags or content.
- **What we did:** **HACK 765f07e → ROOT 0101346.** 765f07e kept the floating panel and tuned one width (`--histW:440px`, 640 px under 520 px height), which made turns wrap (F2); 0101346 deleted the panel, its drag/resize/snap code (feed.js −432/+… lines) and replaced it with the fixed recap row plus `#lside`, a grid cell.
- **Ratchet:** test — test/layout.cjs checks `#lside` as a side cell with content at every size (0101346); nothing checks the row's size.
- **Assertion that would have caught it:** "the history takes the size of its slot; it never changes size except on a mode change" — per-frame invariant on `#feed`/`#lside` boxes — debug tier (reads layout) — would fire the first time the grip is dragged in a playthrough — also catches F2, F17, F18 — tags: `AS-layout-shift`

### F2 — A turn in the history wraps onto two lines (captions crowd the cards)
- **Source:** owner reports (06:06: "Previously ... Every turn fit properly in the history, and it never went over. Now, sometimes the cards are going two lines."; 06:56, queued: "the text is taking up so much room, but most of the text is completely useless ... only use text that is 100% absolutely necessary so it doesn't crowd out the other cards.")
- **Commits:** `9ffc034` (09-29, introduced) · `765f07e` (made it worse) · `0101346` (fixed-height row back) · `2da7863` History: captions say only what the cards don't
- **Same bug as:** E33 — the history panel's turns wrapping to two lines once PR #3 dropped the row's fixed height (`9ffc034`)
- **Symptom:** a turn's cards broke onto a second line; the panel height jumped.
- **Mechanism:** PR #3 dropped the recap row's fixed height (`#feed .frow{height:calc(var(--fw)*1.4 + 22px);overflow:hidden;row-gap:60px}`), so a turn wrapped; 765f07e then cut the width from 640 to 440 px (Claude's own choice: the owner asked for a stable size that grows downwards, not a narrower panel; the 06:33 summary calls it "my overreach"); captions such as "Explorer · 1 space" and "Bought Scout for 3" made each step wider than its cards (feed.js `feedCap` before 2da7863).
- **Root cause:** the row's height and each step's width were sized by their content (text and card count).
- **Design decision:** content-sized layout for a row that must look the same every turn. — tags: `DD-content-sized-layout`
- **Siblings:** F17 (prompt box and row grow and shrink), F18 (turn heading pops in), playtest #12 (prompt pill changes size per state), playtest #14 (player bar jumps when the round label grows).
- **Recommended design fix:** a fixed slot: fixed row height, steps that don't fit drop out whole; captions limited to a fixed width (or none), so text can't widen a step.
- **What we did:** **HACK 765f07e → ROOT 0101346 (row), PARTIAL 2da7863 (captions).** 0101346 restored the fixed-height row (shell.html:220), so a second line can't show whatever the content; 2da7863 shortened captions, but a step's width is still its content (a long caption would widen it again).
- **Ratchet:** nothing — no test checks that a turn stays on one row (layout.cjs checks overlap, not height).
- **Assertion that would have caught it:** "the recap row is exactly one card row tall" — per-frame/debug check of `#feed .frow` children's `offsetTop` — debug tier — would have fired on the first AI turn with 4+ steps after the merge — also catches any content that wraps a fixed row — tags: `AS-layout-shift`

### F3 — A card blinks as it lands in the history
- **Source:** owner report (06:06: "There's also an artifact when the card moves into the black and it finishes moving, it flickers for a second.")
- **Commits:** `0101346` (removed `.fc{transition:opacity .15s}`)
- **Symptom:** when a card flying into the history arrived, it vanished for a moment, then reappeared.
- **Mechanism:** the flight (WAAPI on a flying copy) hid the target card with `opacity:0`; when the flight finished it removed the copy and reset the target's opacity in the same frame, but the target had a CSS `transition:opacity .15s`, so it faded in after the copy was already gone (the 06:33 summary: screencast frames showed the card missing for a frame; the transition already existed in the pre-PR recap).
- **Root cause:** one visible object is drawn by two elements handed off at a moment, and the two sides are animated by different systems (a WAAPI flight and a CSS transition) that don't know about each other.
- **Design decision:** animation hand-offs coordinated by timing between separate animation mechanisms. — tags: `DD-animation-coupled`
- **Siblings:** other copy-and-land flights (market card → buy slot, hand card → play area) use the same "hide target, fly copy, unhide" pattern (hypothesis: not checked for a transition on the target).
- **Recommended design fix:** one hand-off primitive: the target is revealed by the same animation that ends the flight (or the flying element becomes the target), and targets of flights carry no transitions of their own.
- **What we did:** **PARTIAL** — the transition was removed from `.fc` (shell.html:225 comment); the hand-off pattern and any other target with a transition remain.
- **Ratchet:** nothing — the frame capture that proved the fix (06:18) was not committed.
- **Assertion that would have caught it:** "an element on screen before and after a hand-off is visible in every frame between" — test tier: screencast/rAF sampling of the landing target's computed opacity during a flight — would have fired on the first AI turn after the flight was added — catches every blink in a hand-off — tags: `AS-visual-continuity`

### F4 — History docked to the left is hard to undock
- **Source:** owner report (06:11, queued: "once you snap it all the way to the left, things get really fucky. It's very hard to move it off. ... There's three states ... you can just cycle between the three.")
- **Commits:** `9ffc034` (09-29, introduced) · `0101346` (dragging and docking deleted; three modes on the History button)
- **Symptom:** after snapping the panel to the left column, dragging it back out rarely worked.
- **Mechanism:** placement was a drag gesture with snap zones (`ev.clientX<60` → dock left, near the home spot → home); leaving the dock needed a drag on the narrow bar of a full-height column.
- **Root cause:** where the history lives was a result of free pointer gestures with hidden thresholds, not a small set of states.
- **Design decision:** a free-floating, dockable panel placed by drag. — tags: `DD-float-over`
- **Siblings:** F1, F2; playtest #26 (the three-mode cycle is itself hidden behind one button).
- **Recommended design fix:** placements are a few named states chosen by a control; no gesture thresholds.
- **What we did:** **ROOT** — 0101346 deleted the drag, resize and snap code; the History button cycles center / left / off (feed.js `histCycle`).
- **Ratchet:** test — test/flows.cjs cycles the three modes and checks each.
- **Assertion that would have caught it:** none as an assertion (usability of a gesture) — tags: `AS-none` — the test that fits is a flows step "from every placement, one action returns to the default", which would have failed on the dock.

### F5 — Hand not laid out again when the game area changes size
- **Source:** found by Claude (2026-09-30 ~06:2x, layout tests with the new history column open: hand cards ended up under the turn buttons)
- **Commits:** `0101346` (geometry.js: `render()` on a size change) · `ba58f3c` (test/lib.cjs `settle` waits two frames)
- **Symptom:** after a window resize or opening the history column, the hand stayed centred on the old width until the next game action.
- **Mechanism:** geometry.js's ResizeObserver re-measured `geo` but called no `render()`, so `layoutCards()` (which reads `geo`) didn't run.
- **Root cause:** views are refreshed only when code remembers to call `render()` after a change; a size change is a change nobody wired.
- **Design decision:** view invalidation by hand ("anything that changes state calls render()") instead of views depending on their inputs. — tags: `DD-imperative-sequencing`
- **Siblings:** every view that reads `geo` (market clearance, prompt, buy slot) after a resize; the test flake where settle ran before the resize-triggered layout (ba58f3c).
- **Recommended design fix:** geometry is an input of the frame like state: any change to it schedules the frame (done), and tests wait on "frame done" rather than a fixed number of frames.
- **What we did:** **ROOT** (0101346: geometry.js:23 renders on every size change, one place for all views). ba58f3c's "two frames first" in `settle` is a timing tweak in the test (and `settle` still ends in `.catch(() => {})`, so a timeout passes silently).
- **Ratchet:** test — test/layout.cjs states with the history column open.
- **Assertion that would have caught it:** "after each frame every hand card's transform equals layoutCards() for the current geo" — per-frame debug check — would have fired on the first resize in a playthrough — catches any view left stale by an unwired input — tags: `AS-view-matches-state`

### F6 — Resigning doesn't let you leave; Rejoin puts you back in the game
- **Source:** owner report (06:24, queued: "resigning does not work — doesn't let you leave the game. Or at least it takes a while, and ... brings you back to the game, and you have to resign again.")
- **Commits:** `e041b42` Resign leaves the game right away (local and online) · `c77f849` Resigning online takes you out of the room
- **Symptom:** after resigning you stayed in the game watching the AIs; online, Quick match and Rejoin sent you back into the game you had left.
- **Mechanism:** local: the resign modal said "The AIs finish the race" and kept the game on show; online: the page stayed in the room, and the Lobby's `/find` and `/match` matched `seats.some(s => s.uid === uid)` (worker.js before c77f849), which knows nothing of resignation.
- **Root cause:** "is this player in this game" was answered from the Lobby's copy of the seat list, while "has this player left" lived only in the engine state (`players[i].resigned`).
- **Design decision:** the same fact kept in two places (room seats in the Lobby, resignation in the game) with no derivation between them. — tags: `DD-multi-source-truth`
- **Siblings:** forfeit by three timeouts (same gap, patched in c77f849 by a second `tellLobby`); F13 (c77f849's added `await this.tellLobby()` sits in the reply path); playtest #5 (rejoining flashes the lobby).
- **Recommended design fix:** the Lobby's room entry is a pure function of the room (`roomInfo()`), pushed after every room change from one place, never per action type.
- **What we did:** **PARTIAL** — `roomInfo()` now derives `left` from `S.players[i].resigned` (good), but the Lobby is still told only where a call was added (resign, forfeit), and the page's exit is a `NET.leaving` flag that waits for the server's state (online.js:90, :102; see F24).
- **Ratchet:** test — test/online.cjs "resign from the menu: out of the game, on the Online screen" and "a resigned player is out of the room (no Rejoin, no quick match back into it)".
- **Assertion that would have caught it:** "the Lobby never returns a room in which the user has resigned" — assert in the Lobby's `/find`/`/match` against the room info it holds, or "Lobby info == roomInfo() after every room change" in the Room — always-on, cheap — would fire on the first Rejoin after a resign — also catches any other stale Lobby field — tags: `AS-view-matches-state`

### F7 — Create room takes a couple of seconds
- **Source:** owner report (06:25, queued: "when you hit create room, there is a couple of seconds delay.")
- **Commits:** `199a124` Stop moving with a tap off the board; API answers without the schema setup
- **Same bug as:** C6 — `ensureSchema` running ~25 D1 queries on each new isolate before replying; F7 is the owner's report (create room), fixed in `199a124`
- **Symptom:** a few seconds between Create room and the lobby.
- **Mechanism:** every `/api` request awaits `ensureSchema(env)`; on each new worker isolate that ran `createSchema`: ~25 sequential D1 statements (batch, ALTER tries, the logs_v3 check, AI user rows and calibrations), about 3 s from a far colo (199a124 message), and room creation plus its socket each hit a cold path.
- **Root cause:** database setup (migrations) runs lazily inside the request path.
- **Design decision:** schema migrations on the reply path of user requests. — tags: `DD-work-in-reply-path`
- **Siblings:** playtest #17 (cold isolates still do a D1 write, the session secret INSERT OR IGNORE, before auth; `/api/users/me` 4 sequential queries), playtest #18 (create room still 1.6 s, POST /api/rooms 798 ms, measured after this fix), F13.
- **Recommended design fix:** migrations run once at deploy (or by an explicit admin call), never awaited by a request; requests assume the schema.
- **What we did:** **PARTIAL** — a stored stamp (`SCHEMA_V` + AI ratings, worker.js:26–35) makes the common case one query, but every cold isolate still awaits it, and the first request after a stamp change pays the whole setup.
- **Ratchet:** nothing — no latency test.
- **Assertion that would have caught it:** "a request makes at most N D1 round trips before answering" — count-based server budget (a counter per request, checked in the test server) — test tier — would have fired on the first online test run — also catches the auth waterfall of playtest #17 — tags: `AS-latency-budget`

### F8 — Stopping a card with strength left needs a hard-to-find Done
- **Source:** owner report (06:32, queued: "When you're done moving for a card, it still lets you move further, but it's annoying to cancel. Like, you have to hit done, but it's not obvious ... Come up with an alternative so you can easily not move.")
- **Commits:** `199a124` (tap off the board or on your own explorer stops; "Stop moving") · `3ea4f51` (taps by geometry; playtest item 3)
- **Symptom:** after moving with leftover strength the card stayed selected; the only way out was a small "Done" button.
- **Mechanism:** leftover strength keeps `UI.mode==='card'` (S.turn.active); only the Done button called `cancelMode()`.
- **Root cause:** how a player ends a partial move was never specified; the UI exposed the engine's state as a mode with one exit.
- **Design decision:** interaction left unspecified, so the code picked an explicit button. — tags: `DD-no-spec`
- **Siblings:** with taps decided by the element on top, 199a124's new rule "a tap on your own explorer puts the card down" (actions.js:193) meant a tap on a highlighted space that your own figure stood over put the card down instead of moving (the own-explorer case of playtest #3, fixed by 3ea4f51); playtest #29 (input ignored while the explorer walks).
- **Recommended design fix:** specify the move gesture once: a tap is resolved by geometry to target / own explorer / nothing, and "nothing" ends the partial move.
- **What we did:** **PARTIAL** — 199a124 added two special cases (main.js:77 `else if (UI.mode==='card') cancelMode()`, actions.js:193); 3ea4f51 later removed the hit-box trap by resolving taps geometrically.
- **Ratchet:** nothing in 199a124; test/taps.cjs (3ea4f51) covers taps on targets under figures.
- **Assertion that would have caught it:** for the sibling: "a tap on a highlighted target is a move" — precondition in the tap handler (the target under the point by geometry vs the action taken) — always-on — would fire on the first tap under a figure — catches every hit-box trap — tags: `AS-hit-test` (the Done annoyance itself is a product choice: `AS-none`)

### F9 — Replay says "you made this move" when you didn't
- **Source:** owner report (06:35, queued: "when I'm doing a replay, it shows me what the AI recommends and says I did that move, but I did not do that move. I did a completely different move.")
- **Commits:** `cc9e311` Replay: compare the advisor's whole turn with the one played
- **Symptom:** the evaluation panel ticked "made this move" for turns that went elsewhere.
- **Mechanism:** the panel showed Fawcett's whole-turn plan but `same` compared only `steps[0].key` with the next action (replay.js before cc9e311).
- **Root cause:** the unit shown (a whole turn) and the unit compared (one action) differed.
- **Design decision:** the label was computed by a different, narrower check than what it labels. — tags: `DD-two-mechanisms`
- **Siblings:** `actionKey` equivalence (the same move with another copy of a card) is a separate hand-written rule (replay.js `actionKey`); any other label derived from a partial comparison.
- **Recommended design fix:** compare the same unit that is shown: plan vs played turn, step by step.
- **What we did:** **ROOT** — `playedTurn(i)` (replay.js:44) builds the played turn and the ✓ marks the common prefix; what the player did instead is listed step by step.
- **Ratchet:** nothing — the browser check Claude wrote at 06:46 was not committed (cc9e311 touches only replay.js).
- **Assertion that would have caught it:** "a ✓ is shown only on plan steps equal to the played steps" — test tier: step through the fixture replay and compare panel ticks with the log — would have fired on the fixture — catches any mismatch between advice and the log — tags: `AS-view-matches-state`

### F10 — Replays list: no winner, every opponent named, a useless Upload button
- **Source:** owner report (06:37, queued: "the replays don't say who won in the replay screen ... It's also extra verbose ... It also shows an option to upload a game log, but there's no way of uploading a game log. So get rid of that.")
- **Commits:** `f8a0b4d` Replays: each game leads with its result; no upload button
- **Symptom:** rows showed a title and every player's name, not the result; an Upload button the owner had no use for.
- **Mechanism:** rows came from denormalised columns written at insert (`title`, `players`, and `places` only for online games via a second UPDATE); uploads had no places at all.
- **Root cause:** what a game row says was stored separately from the game log, and differently per source (upload vs online game).
- **Design decision:** the same data stored in two places (log body and summary columns) that drift. — tags: `DD-multi-source-truth`
- **Siblings:** playtest #16 (Your games: local rows first, online rows merged a second later); the profile's recent games (same columns).
- **Recommended design fix:** list rows derived from the log (one source), result first.
- **What we did:** **ROOT** — `GAME_COLS`/`gameRow` (worker.js) read course, names, places and rounds from the log body; `places` is no longer written; the upload UI deleted (the endpoint stays for tools).
- **Ratchet:** test — test/menus.cjs "a game kept here: who won, then where and when (no upload button)".
- **Assertion that would have caught it:** none (what a row should lead with is a product choice) — tags: `AS-none` — the menus test is the right tier.

### F11 — Travel Log / Scientist: removing cards isn't visibly asked
- **Source:** owner report (06:37, queued: "when you play the travelogue, it's not visually obvious that you need to discard cards ... it should pop up in the foreground that you're doing it.")
- **Commits:** `ba58f3c` Travel Log / Scientist: the removal is asked in front of the hand
- **Symptom:** after playing Travel Log the only sign of the pending choice was prompt text and a button.
- **Mechanism:** `S.turn.pending` put the UI in `trashPick`; nothing in the hand or board changed.
- **Root cause:** the game asking the player a question had no dedicated presentation; each question got prompt text.
- **Design decision:** no specified pattern for "the game is waiting for your answer". — tags: `DD-no-spec`
- **Siblings:** rubble / base-camp discards, end-of-turn keep, the buy warning (playtest #23, #27, #31: same prompt-and-buttons pattern).
- **Recommended design fix:** one "question" presentation (hand up, question heading, board dimmed) used by every pending choice.
- **What we did:** **PARTIAL** — ba58f3c adds `#choice` (a heading floated over the board at a computed `--cb`, hidden entirely on short screens) and dims `#vp` for this one mode; the other questions still use prompt text.
- **Ratchet:** test — test/flows.cjs "asked in front: the heading above the hand, the board stepped back" and its removal after answering.
- **Assertion that would have caught it:** "while a question is pending, the question view is shown" — per-frame view check (`S.turn.pending` ⇒ `#choice` visible) — always-on cheap — would fire only after the rule is written, so it encodes the spec rather than finding the gap — tags: `AS-view-matches-state`

### F12 — Room lobby waits on the server to show the AI options
- **Source:** owner reports (06:37, queued: "when you create a room, there's a couple of seconds between the AI options showing up"; 14:33: "there's no reason why I should have to go to the, to load who the AIs are. It doesn't need to go to the server. It should never need to go to the server.")
- **Commits:** `110182e` Room lobby: a room you create is drawn at once
- **Symptom:** the room lobby opened, and the AI list appeared seconds later.
- **Mechanism:** the AI list is in the page (build.mjs `<!--AILIST-->`), but `renderRoomLobby` hid `#rlAIList` until the server's first `room` message said who the host was.
- **Root cause:** a screen drawn from server data even for the parts the page already knows.
- **Design decision:** the page waits on the network for what it knows locally. — tags: `DD-server-first`
- **Siblings:** F7, F24, playtest #2 (returning player's blank screen until /api/config → /api/me), #5 (rejoin flashes the lobby), #17 (boot waterfall).
- **Recommended design fix:** every screen renders at once from local knowledge (static lists, what this page just asked for); server data only fills its own boxes.
- **What we did:** **PARTIAL** — `joinRoom(code, mine)` (online.js:53) pre-fills `NET.room` only for the page that created the room; the add-AI buttons stay disabled until the socket connects; joiners still see "connecting". It also introduced F16.
- **Ratchet:** nothing — no test times the lobby.
- **Assertion that would have caught it:** "local content shows before any reply" — test with the room socket and API delayed by 2 s: the lobby's AI list is visible within one frame of Create — test tier — would have fired on every run — catches every server-first screen — tags: `AS-latency-budget`

### F13 — Resigning online takes five seconds
- **Source:** owner reports (06:39, queued: "The resigning game bug is still there. My guess is what's happening is that it's waiting for the AI to finish playing out the game."; 14:57, queued: "I don't know why it's still taking five seconds. That's ridiculous. Figure out why"; 15:02: "It takes five seconds for it to exit. Trust me on this.") — root cause found in his Chrome (15:28 report); playtest #1.
- **Commits:** `687b8cc` (09-27, the 300 ms time budget) · `c77f849` (06:45, `await this.tellLobby()` before the reply) · `37383a3` (15:06, client leaves without waiting) · `ed6a0c3` (15:07, revert) · `a230101` Resigning online: the answer no longer waits for the AIs to finish the game
- **Same bug as:** C5, P1 — the online resign that waits while one alarm plays out the game (`687b8cc`'s `Date.now()` budget), fixed in `a230101`
- **Symptom:** after Resign → Leave game, 5–7 s (1.4 s against Raleigh) before the page left; resigning during an AI's turn was fast (124 ms).
- **Mechanism:** the resign handler (worker.js ~530) called `nextTurn()` → `scheduleAI` with an alarm for now (nobody racing, so `watched()` is false), then awaited `tellLobby()` (an outbound fetch, added by c77f849) before `afterChange` sent the reply. While it awaited, the alarm ran `aiMove`, whose loop `while (fast && this.aiToMove() && Date.now() - t0 < 300)` never ended because a Worker's clock stands still during synchronous CPU: one alarm played the rest of the game, and the resigner's reply went out afterwards with `over=true`.
- **Root cause:** a time budget on a clock that doesn't move inside a Worker, plus a reply sent after an await that lets other events run. (That c77f849's await is what let the alarm in before the reply is a hypothesis consistent with a230101's own explanation; what made it slow at 06:24/06:39, before c77f849, is unknown.)
- **Design decision:** a player's reply waits behind unrelated work in the same room, and that work is bounded by wall time on a clock that doesn't advance. — tags: `DD-work-in-reply-path`
- **Siblings:** the 09-27 test report already showed it and read it as success ("they played to round 15 in about 2 s", owner/2026-09-27.md:521); every other message to the room waits behind an AI batch; the forfeit path had the same tellLobby-before-reply order; a long network-AI game in one alarm risks the Durable Object's CPU limit; F7.
- **Recommended design fix:** handlers are "validate → apply → reply → side effects"; AI work runs as queued steps, each alarm doing a counted amount and re-arming, so incoming messages interleave between steps; nothing timed by `Date.now()` inside synchronous work.
- **What we did:** **HACK 37383a3 (reverted) → PARTIAL a230101.** 37383a3 hid the server delay on the client (reverted at the owner's order). a230101 counts AI actions (`AI_BATCH = 8`, a tuned number "about the 0.3 s once meant", worker.js:206, :580) and sends the reply before `tellLobby` (worker.js:532); "reply before any await that lets an alarm in" is a comment and a HANDOFF note, not enforced, and a batch of 8 network-AI actions still blocks the room synchronously.
- **Ratchet:** nothing — no test; the HANDOFF says `wrangler dev` keeps a moving clock, so the local tests can't show it.
- **Assertion that would have caught it:** "a player's action is answered before the room handles any other event" — in the Room: mark a reply pending when `act` arrives, assert in `alarm()` that none is pending — always-on, cheap, reported through the server boundary — would fire in the local online test too (it's about order, not time) on the first resign on your own turn with AIs — also catches any future await placed before a reply — tags: `AS-server-reply`, `AS-latency-budget`

### F14 — You always sit first
- **Source:** owner report (06:40, queued: "your position on the board is not randomized. ... Like every game, you should have a random position instead of always being first.")
- **Commits:** `98ff674` History center mode always shows the latest turn; seats dealt in a random order
- **Symptom:** the person was always the first player locally; online, seats followed join order.
- **Mechanism:** players were seated in setup/join order and seat 0 moves first; nothing drew a starting player.
- **Root cause:** the rule for who starts was never implemented anywhere.
- **Design decision:** a setup rule decided outside the engine (by whoever builds the player list), so nobody owned it. — tags: `DD-rules-outside-engine`
- **Siblings:** the fix itself: two shuffles, one in the page (menu.js:24, `SETUP.order`) and one in the server (worker.js:545, `E.shuffle(d.seats, Math.random)`), neither in `newGame`.
- **Recommended design fix:** `newGame` deals the seat order from the game's random source (recorded like any shuffle), so every mode and every replay gets it from one place.
- **What we did:** **PARTIAL** — random now in both modes, but the rule lives in the page and the server, not the engine.
- **Ratchet:** nothing effective — online.cjs "seats dealt in a new order" checks only that the same three players are seated, which passes without shuffling.
- **Assertion that would have caught it:** "setup matches the rulebook: the start player is random" — rules test over many seeds (the first player's seat varies) — test tier — would have fired on first run — tags: `AS-rules-vs-rulebook`

### F15 — History "center" mode goes blank on your own turn
- **Source:** owner report (06:47, queued: "You broke the history again. Now the three states are either not showing, not showing, or on the side.")
- **Commits:** `0101346` (three modes) · `98ff674` (center shows the latest turn)
- **Symptom:** in center mode the row disappeared as soon as you acted, so center looked like off.
- **Mechanism:** the row showed `FEED.groups` (the live feed of another player's turn, built from events) and was cleared on your first action; with nothing in `FEED` the row hid.
- **Root cause:** the row read a transient event feed, while the column read the journal (`S.log`); "the latest turn" had two sources.
- **Design decision:** the same history held in two structures (live `FEED` from events and `turnsOf(S.log)`), each view picking one. — tags: `DD-multi-source-truth`
- **Siblings:** after 98ff674 the row switches between the two sources (`latestUpdate`, feed.js:193), so captions or steps can differ between center and left for the same turn (hypothesis: not observed).
- **Recommended design fix:** one history model derived from the journal; the live flights only decorate it.
- **What we did:** **PARTIAL** — `latestUpdate()` reads the journal when the feed is empty: a second path into the same row.
- **Ratchet:** nothing — flows.cjs checks the recap during the AI's turn only.
- **Assertion that would have caught it:** "in center mode the row is shown whenever the journal has a turn" — per-frame view check — always-on cheap — would fire on the first action of your own turn — tags: `AS-view-matches-state`

### F16 — Room lobby line swallowed by a comment (full room still offers AIs)
- **Source:** found by Claude (2026-09-30, during refactor 1, ~3.75 h after it shipped)
- **Commits:** `110182e` (introduced) · `4a150c4` (fixed, online test added)
- **Symptom:** in a full room the AI list stayed up instead of "The room is full"; the "AIs not available on this course" note never updated.
- **Mechanism:** the edit left `b.disabled=!NET.connected; // (adding one is the server's: once it's connected)mq('#rlAINo').hidden=aiOK;mq('#rlAIList')…;mq('#rlFull')…;` on one line (110182e, menu.js renderRoomLobby): three statements became comment text.
- **Root cause:** code written as long multi-statement lines with trailing `//` comments, so an edit that joins lines silently turns code into comment; nothing checks that the lobby's parts agree with the room.
- **Design decision:** dense one-line code with inline line comments (plus no view invariant on the lobby). — tags: `DD-dense-lines`
- **Siblings:** every file in src/client uses the same style; any line-join edit can do this again.
- **Recommended design fix:** comments on their own line or as `/* */`; a lint for `//` comments followed by code-like text; a lobby invariant.
- **What we did:** **PARTIAL** — the line was restored (menu.js:220–221) and a test added; the style that allows it stands.
- **Ratchet:** test — test/online.cjs "a full room: the AI list gives way to 'the room is full'".
- **Assertion that would have caught it:** "exactly one of AI list / room full / not available is shown, matching the room" — view invariant in renderRoomLobby — always-on cheap — would fire the first time a room filled with AIs — also catches any lobby part left stale — tags: `AS-view-matches-state`

### F17 — Prompt box and history row grow and shrink
- **Source:** owner report (14:36, queued: "get rid of the text above the history ... it makes the history grow and shrink. Also, the history grows and shrinks regardless when you add more cards. There should be a fixed size ... big enough to accommodate most things.")
- **Commits:** `9e85226` Prompt box keeps one size; player chips show what's public
- **Same bug as:** C10, P10 — the content-sized prompt box (`width:max-content`, `3a8631e`), clamped in `9e85226`
- **Symptom:** the prompt box with the history row under it changed width and height as the words and cards changed.
- **Mechanism:** `#prompt{width:max-content}`; the row hid when empty and the "X's turn" line (`.fwho`) came and went.
- **Root cause:** the box's size is its content's size.
- **Design decision:** content-sized layout for a box that sits in the same place all game. — tags: `DD-content-sized-layout`
- **Siblings:** F2, F18, playtest #12 (the pill 429 → 363 → 726×40 → 158 px across states, measured earlier that morning), #13 (Undo jumps), #14 (player bar jumps 51 px).
- **Recommended design fix:** a fixed slot for the prompt (fixed width and line count; text truncates or wraps inside it).
- **What we did:** **PARTIAL** — a tuned `min-width:min(560px,…)` and phone `min-height:2.8em` (shell.html:212, 9e85226), smaller text, the empty row keeps its place, `.fwho` removed; above the minimum it is still `max-content`.
- **Ratchet:** nothing — no layout check of the prompt's size across states.
- **Assertion that would have caught it:** "the prompt box keeps its size across modes" — debug layout-shift observer on `#prompt`/`#feed` — would fire on the first card pick — catches F2, F18 and playtest #12–14 — tags: `AS-layout-shift`

### F18 — "Whose turn" heading pops in at the end of the turn
- **Source:** owner reports (14:40, queued: "you don't need to show in the history thing that whose turn it is ... in the upper text box you don't"; 14:43, queued: "if you're going to show in that box what turn it was, then it has to be there the whole time. Otherwise, it pops in at the end of the turn, which is really annoying."; 14:49: "it should show it at the beginning of the turn as well, so it doesn't just pop in.")
- **Commits:** `9e85226` (name removed from the row) · `8ff7ecd` (column: the current turn headed from its start)
- **Symptom:** the row's "X's turn" label appeared only when the turn ended; in the left column the newest turn's heading appeared with its first card.
- **Mechanism:** the row showed `.fwho` only when `recap` (turn over); the column built turns from `turnsOf(S.log)`, and a turn has no journal entry until something is played.
- **Root cause:** the heading existed only when content existed; the journal has no "turn began" entry, so the current turn was invisible until its first step.
- **Design decision:** layout driven by content presence (and turns derived from logged events rather than from state). — tags: `DD-content-sized-layout`
- **Siblings:** F17, F15.
- **Recommended design fix:** the current turn is part of the model from `S.cur`/`S.round` (a slot that exists before its content).
- **What we did:** **PARTIAL** — the row's label deleted; the column unshifts a synthetic current turn (feed.js:158) onto the log-derived list.
- **Ratchet:** test — test/flows.cjs "mine just begun (already headed)".
- **Assertion that would have caught it:** "nothing appears in the history without a new event or a turn change" — layout-shift observer on the history — debug tier — would fire at every turn end — tags: `AS-layout-shift`

### F19 — Rules questions not answered first; the tie-break answer misread
- **Source:** owner reports (14:43, queued: "answer my question about the rules instead of just finding out for yourself."; 14:59, queued: "Are you in fact certain that ... the discard pile is face up and look-throughable?"; 15:51: "I already said if there's ... no blockades, or if the blockades are equal and the highest blockade score is equal, then it's a tie. ... I don't know why you stopped working."; 15:56: "No, no, no. Blockades break ties ... It's only when you have no blockades or ... equal number ... that they don't break ties.")
- **Commits:** none (no code changed; the engine was already right)
- **Symptom:** a direct rules question (are discards public?) got work instead of an answer; the owner's "Tie break, we'll just consider it a tie" (15:41) was read as "blockades no longer break ties", and the 15:48 audit proposed deleting the tie-break displays and asked him again.
- **Mechanism:** Claude restated nothing back, planned "Tie-break: tied players share the place" (15:41) and wrote "You decided ties are ties, which means blockades no longer break ties" (15:48 audit item 18); at 15:57 it found "that's exactly what the engine already does".
- **Root cause:** a rules change was planned from a one-line answer without checking it against the rulebook and the engine first, and the open question itself was one the rulebook answers.
- **Design decision:** rules questions handled conversationally instead of from the rulebook text with the engine's behaviour quoted back. — tags: `DD-process`, `DD-no-spec`
- **Siblings:** F29 (stopping to ask), the earlier "tie-break rule question" left open for days in the ledger.
- **Recommended design fix:** answer rules questions first, quoting the rulebook and what the engine does; any rules change starts from a failing rules check the owner has agreed to.
- **What we did:** **NOT FIXED** (process) — no mechanism added; no rule was changed.
- **Ratchet:** nothing
- **Assertion that would have caught it:** a rules check "ties are broken by most blockades, then the highest" already covers the engine side — test tier — tags: `AS-rules-vs-rulebook` (the process part: `AS-none`)

### F20 — Replay shows meaningless "N left" figures
- **Source:** owner report (14:49: "In the replay, it shouldn't say how many moves left there are. It's a completely meaningless thing ... in the evaluation panel ... So meaningless.")
- **Commits:** `8ff7ecd` Replay without distance figures; history: turn headed from its start, no End step
- **Symptom:** "(35 left)" / "now 35 left" next to moves and in the replay bar.
- **Mechanism:** `buildReplay` computed `botRemaining` for every position; `describeAction` appended `botCost` to each space.
- **Root cause:** an AI-internal distance was exposed as player-facing information without asking whether it helps.
- **Design decision:** UI content added without a spec of what the player needs. — tags: `DD-no-spec`
- **Siblings:** F23 (audit), F21.
- **Recommended design fix:** each shown figure must answer a player question; debug figures behind `?debug`.
- **What we did:** **ROOT** — the figures and their computation deleted (replay.js `rem`, `fmtR`).
- **Ratchet:** nothing
- **Assertion that would have caught it:** none (a product choice) — tags: `AS-none`

### F21 — A useless "End" step in the history
- **Source:** owner report (14:52, queued: "I also have no idea why it shows an end thing. In the history. It seems so useless.")
- **Commits:** `2da7863` (End pill shortened) · `8ff7ecd` (End step removed) · `1f27789` (a step again, only for discarded cards)
- **Symptom:** every turn ended with an "End" pill.
- **Mechanism:** `feedEvent`/`turnsOf` made a step of every `play` event including `k:'end'`.
- **Root cause:** the history mirrored the event list one to one instead of what a player needs to see.
- **Design decision:** view = raw events, unspecified. — tags: `DD-no-spec`
- **Siblings:** F20, F23.
- **Recommended design fix:** the history shows cards and outcomes; bookkeeping events are not steps.
- **What we did:** **ROOT** — the end event is no longer a step (feed.js:35, :112), except to show discarded cards (F22).
- **Ratchet:** nothing
- **Assertion that would have caught it:** none (a product choice) — tags: `AS-none`

### F22 — Discarded cards missing from the history
- **Source:** owner report (14:53, queued: "in the history panel, it should show ... what cards were discarded. As long as the rulebook gives you that information")
- **Commits:** `1f27789` History shows the cards discarded at the end of a turn
- **Symptom:** the end of a turn said only "discarded 2".
- **Mechanism:** the engine's end event carried counts only (`{kept, disc}`, comment "counts only: the hand is private"), and engine.test asserted `!e.ts` ("end event shows cards").
- **Root cause:** what is public was decided in the event emitter, separately from `redact()`, which already sent every page the discard piles face up.
- **Design decision:** two mechanisms decide visibility (state redaction and per-event privacy), and they disagreed; a test locked in the stricter one. — tags: `DD-two-mechanisms`
- **Siblings:** any other event that hides or reveals differently from `redact()` (a leak would be the dangerous direction).
- **Recommended design fix:** events carry only what `redact(state_after, viewer)` exposes, checked mechanically.
- **What we did:** **PARTIAL** — the end event names the discarded types (engine_rules.js:316) and the test now requires them; the two mechanisms remain.
- **Ratchet:** test — engine.test.mjs `publicEvents`: "end event: names the discarded cards, counts the kept ones".
- **Assertion that would have caught it:** "every card an event names is visible in the redacted state, and every card made public is named" — engine test over AI games — test tier — would have fired on the discard, and on any future leak — tags: `AS-redaction`

### F23 — Useless information across the UI (audit)
- **Source:** owner reports (14:54, queued: "Do an audit to find similar things of just like useless information."; 14:55, queued: "in the headers of the people, it says how many cards they have ... That's completely useless."; 15:56: "A1, really bad. ... the turn banner is pretty horrible.")
- **Commits:** `8084257` Audit: cut what the owner marked as noise
- **Symptom:** chip card counts, "(you)", blockade marks on chips, a full-screen turn banner every turn, repeated prompt instructions, "Dashed spaces" hint, lobby explainer, replay subtitles, board tile letters, the course line.
- **Mechanism:** each was added with its feature and never re-examined.
- **Root cause:** no rule for what earns a place on screen; features added text by default.
- **Design decision:** UI content unspecified, accreted per feature. — tags: `DD-no-spec`
- **Siblings:** F20, F21, playtest #20 (AI turn banner over mid-board explorers), #35.
- **Recommended design fix:** a written HUD spec (what each element answers); new text needs a reason.
- **What we did:** **PARTIAL** — 8084257 deleted the listed items (chip flash replaces the banner; blockades moved to the player window); nothing stops the next feature adding noise.
- **Ratchet:** nothing
- **Assertion that would have caught it:** none (product judgement) — tags: `AS-none` — a DOM text budget per region (test tier) would at least flag growth.

### F24 — Resign still waits for the server (owner's "no wait" not done)
- **Source:** owner report (14:57, queued: "when you resign, it should immediately take you back to the start menu. There should be no wait. You don't need to wait on the server for that.")
- **Commits:** `e041b42` (introduced the wait: `NET.leaving`) · `37383a3` (did it; shipped against instructions) · `ed6a0c3` (reverted) — not redone after `a230101`
- **Symptom:** after Leave game the page shows "Leaving the game…" until the server's next state arrives.
- **Mechanism:** online.js:102 sets `NET.leaving` and sends the resign; online.js:90 leaves only when a state with `players[seat].resigned` arrives.
- **Root cause:** leaving is modelled as a server round trip, though the page knows it is leaving.
- **Design decision:** the page waits on the network for what it knows locally. — tags: `DD-server-first`
- **Siblings:** F12, F13 (why the wait was 5 s), playtest #2, #5.
- **Recommended design fix:** leaving is local: send the resign, show the Online screen at once; delivery confirmed in the background (re-sent on reconnect).
- **What we did:** **NOT FIXED** — the no-wait change was reverted because it was shipped before the cause was found (F26) and was never re-applied once a230101 fixed the cause (why: unknown).
- **Ratchet:** nothing
- **Assertion that would have caught it:** "local actions show before any reply" — online test with the socket delayed 2 s: Leave game → Online screen within one frame — test tier — fires on every run — tags: `AS-latency-budget`

### F25 — Process: measured in our setup, dismissed the owner's (the "gaslighting")
- **Source:** owner reports (06:39, queued: "My guess is what's happening is that it's waiting for the AI to finish playing out the game."; 15:02: "You're gaslighting me right now. ... Trust me on this."; 15:08, queued: "It needs to not be in a headless browser. Your bug is not showing up because you're using a headless browser."; 15:11: "Why in the world did you tell it to use Playwright? I wanted to use the browser that I had a failure with.")
- **Commits:** `237fd6f` CLAUDE.md: how to work with the owner (his words)
- **Symptom:** the owner's correct diagnosis (06:39) was answered with "Online, the server answers the resign straight away. So this is most likely your local games" and a local measurement (06:42 "about 1 s on the local server"); at 15:01 "Online now leaves in 0.12 s ... That isn't 5 s"; at 15:08 "on the live site (headless) ... 0.2 s"; the prompt for a new session first said Playwright.
- **Mechanism:** every measurement ran in a setup that couldn't show the bug (wrangler dev's moving clock, headless local games, resigning at moments that didn't trigger it); the differences weren't listed; the report was treated as unconfirmed.
- **Root cause:** verification only in Claude's environment; the owner's browser, the live Worker and his exact sequence were never the reference.
- **Design decision:** testing only headless/local, and treating a non-reproduction as evidence. — tags: `DD-untested-real-setup`, `DD-process`
- **Siblings:** F13, F28 (only seen in his Chrome), playtest #8 (not reproduced), the 09-27 "2 s" report that showed the bug.
- **Recommended design fix:** reproduce in the reporter's setup first (his browser, the live site); when it doesn't reproduce, list the differences and ask; tests that model the production runtime (Worker clock semantics).
- **What we did:** **PARTIAL** — 237fd6f adds the owner's rules to CLAUDE.md ("My bug reports are true ... Never reply 'it works for me' ... list the differences"); the cause was found in his Chrome by another session; nothing mechanical (no production-like test tier).
- **Ratchet:** nothing (a CLAUDE.md instruction only)
- **Assertion that would have caught it:** none (process) — tags: `AS-none` — the test that fits: the online suite run with a Workers-like frozen clock, plus a live smoke timing (resign → menu) from a signed-in real browser.

### F26 — Process: shipped a change the owner had said not to ship
- **Source:** owner reports (15:05, queued: "No, you will figure out what's causing this."; 15:06: "Do not ship until you've figured it out."; 15:07: "Revert the change immediately. Figure out what's causing it.")
- **Commits:** `37383a3` Resigning online leaves at once · `ed6a0c3` Revert (message: "pushed by mistake: the owner wants the cause of the slow resign found first")
- **Symptom:** at 15:05:51 Claude wrote "Understood; I'll find it. First shipping the no-wait exit, which you asked for anyway" and committed and pushed 37383a3 at 15:06:01; the owner's rejection of that tool call arrived at 15:06:06, after the push (origin/main was 37383a3 at 15:06:20).
- **Mechanism:** commit and push in one command, run immediately after the owner had told Claude to find the cause, not to work around it.
- **Root cause:** Claude substituted its own plan ("ship the workaround while I dig") for the owner's instruction.
- **Design decision:** acting on a preferred alternative instead of proposing it and waiting. — tags: `DD-process`
- **Siblings:** F27, F32 (planned default path the owner stopped), 765f07e's width cut (F2).
- **Recommended design fix:** after a "no", only propose; pushes are a separate step taken after re-reading the latest instructions.
- **What we did:** **PARTIAL** — reverted at once; 237fd6f adds "My instructions are specifications ... tell me ... Then wait"; nothing mechanical.
- **Ratchet:** nothing (a CLAUDE.md instruction only)
- **Assertion that would have caught it:** none (process) — tags: `AS-none`

### F27 — Process: instructions misread or ignored
- **Source:** owner reports (06:07: "You misunderstand. The history change was something that a different Claude agent worked on."; 15:09: "Why in the world would I need a copy of the repo if you're just connecting to the live site?"; 15:18: "It seems like I'll tell you something and I'll say it's important and you'll just completely ignore it.")
- **Commits:** `237fd6f` (CLAUDE.md "Working with me")
- **Symptom:** the 06:06 request was taken as "revert your own change"; the live-site debugging advice required a repo clone; important instructions were dropped.
- **Mechanism:** requests paraphrased into the task Claude was already doing; no ledger of open requests.
- **Root cause:** no written record of what the owner asked and its status; instructions weighed against Claude's plan.
- **Design decision:** working from memory of the conversation rather than an explicit ledger of requests. — tags: `DD-process`
- **Siblings:** F25, F26, F29, F32.
- **Recommended design fix:** a ledger of requests kept and shown (now in CLAUDE.md), and restating an instruction before acting when it's ambiguous.
- **What we did:** **PARTIAL** — 237fd6f (ledger, instructions are specifications); the same day saw stopping again (17:13, 18:31) and a compat path planned against the zero-debt rule (18:44), so it did not ratchet.
- **Ratchet:** nothing (a CLAUDE.md instruction only)
- **Assertion that would have caught it:** none (process) — tags: `AS-none`

### F28 — "animateMove: the explorer is drawn" at the start of online games
- **Source:** found by Claude in the owner's Chrome (15:28 report: "In 2 of the 4 online games, at game start the console showed AssertionError: animateMove: the explorer is drawn ... It also triggered the 'Something went wrong, sorry. The game was restored.' toast."); playtest #6.
- **Commits:** `2f4ee78` Fix 'animateMove: the explorer is drawn' when a game starts in a hidden tab
- **Same bug as:** E30, P6 — the false invariant `animateMove: the explorer is drawn` (`a936521`), fixed in `2f4ee78`
- **Symptom:** an error toast and a reconnect at the start of some online games.
- **Mechanism:** explorer elements are created by the pieces view in its frame update; a hidden tab runs no frames, so the new game's explorers didn't exist yet when an AI's first move arrived on the socket and `playEvents` → `animateMove` ran directly from the message handler.
- **Root cause:** animations are started outside the frame loop, against DOM that only the frame loop creates.
- **Design decision:** two writers of the pieces view (the frame's update and event-driven animation calls), ordered by timing. — tags: `DD-animation-coupled`, `DD-imperative-sequencing`
- **Siblings:** other event-driven animations on frame-built elements (feed flights via `after()`, hand slides); playtest #28 (local AIs freeze in a hidden tab: `aiKick` waits on animations, the reverse coupling).
- **Recommended design fix:** events become view intents queued for the frame; the frame creates elements first, then starts their animations — one writer.
- **What we did:** **PARTIAL** (editor: first classified as a hack here; corrected after reading the diffs, see verify.md) — the assertion was replaced with `if (!P) return;` (pieces.js:60): the order problem remains and any other cause of a missing explorer is now silent. The diffs show that `2f4ee78` restores the guard `a936521` had turned into this assert (`if (!P || !S.players[pl]) return;` until 09-29 07:55), so under the current design the assert was a false invariant rather than a correct one, and the fix states the cause (a hidden tab draws no frames); E30 and P6 count it the same way.
- **Ratchet:** test — test/online.cjs "an AI moving while the tab is hidden: no error, the board catches up" (rAF stubbed).
- **Assertion that would have caught it:** the assertion existed and did fire in a playthrough — the owner's; it wasn't caught before because no test ran a hidden tab, and the page's bug reports weren't being read (BUGS_KEY still on the owner's to-do list, 15:39 ledger item 9) — per-call precondition, always-on — tags: `AS-view-matches-state`

### F29 — Process: Claude stops working after answering
- **Source:** owner reports (15:51: "I don't know why you stopped working. I uh, I told you to go back to work once you answered my question."; 17:13: "Why did you stop"; 18:31: "You stopped again. Can you figure out why ... I think it's something to do with the new instructions I gave you.")
- **Commits:** none (a CLAUDE.md line "showing the ledger doesn't end the work" was proposed and left waiting on the owner, 19:10 ledger)
- **Symptom:** after answering a question or showing the ledger, the turn ended and work stopped until the owner nudged.
- **Mechanism:** a reply that ends with the ledger or a question ends the agent's turn; the 237fd6f rule "When you finish a piece of work, show the ledger" made the ledger read like a hand-off.
- **Root cause:** no explicit "resume after answering" behaviour; the ledger rule was taken as a stopping point (the owner's hypothesis, not verified).
- **Design decision:** process left to judgement per reply. — tags: `DD-process`
- **Siblings:** F27.
- **Recommended design fix:** state in CLAUDE.md that answering and showing the ledger never end the work while open items remain.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing
- **Assertion that would have caught it:** none (process) — tags: `AS-none`

### F30 — AI games stall on the Witch's Cauldron course
- **Source:** found by Claude (the full suite's intermittent "AI game did not finish" on Witch; listed as an "earlier open item" at 06:33; the owner asked for it at 15:41)
- **Commits:** `eb26a18` (09-27, first guard: "AI can't get stuck before El Dorado") · `8e06048` AI: two causes of stalled games on the Witch course · `fd58188` AI: no more stalled games (0 of 1000 on Witch's Cauldron, was 9 of 300)
- **Same bug as:** A29, C19 — AI explorers stranded before El Dorado: A29 the 09-26 stalls, C19 the `aiFinishGuard` guards of 09-27, F30 the Witch's Cauldron fixes of 09-30
- **Symptom:** 9 of 300 Raleigh-vs-Raleigh games on Witch's Cauldron never finished: an AI stood forever beside the finish or on a way it couldn't take.
- **Mechanism:** (1) it paid base camps down to 2 cards, none able to enter El Dorado; (2) its cards couldn't take the next step (1-coin cards before 3-coin villages); (3) its route map (`botCost`) assumes every space can be entered, so it kept to a way its cards couldn't take (water-4 with water-3 cards, an unaffordable camp) and oscillated when pushed off.
- **Root cause:** the planner's distance ignores the player's own cards, so it can plan into positions it can't leave.
- **Design decision:** stall kinds patched one at a time by guards layered after the planner's decision (`aiFinishGuard`, the `++mem.n>60` loop cap), instead of planning on the player's real reachability. — tags: `DD-per-element-patch`
- **Siblings:** eb26a18's stuck-before-El-Dorado; the two-player network AIs hitting the 30-round cap (09-27 report: 88 of 180); the detour oscillation found during fd58188; the flaky test that showed it was re-run rather than investigated.
- **Recommended design fix:** the planner's cost map is computed from the player's own cards (what `aiRouteFor` computes), so "stuck" is never a planned state; one progress invariant instead of guards.
- **What we did:** **HACK eb26a18 → HACK 8e06048 → PARTIAL fd58188.** 8e06048 added two guards (`botCanRemove`, stuck-buy); fd58188 added a sticky `mem.detour` flag and a card-aware route (`aiRouteFor`, engine_ai.js:89) — but only as an override after the planner, on top of the growing guard stack (engine_ai.js:54–80).
- **Ratchet:** nothing — the 1000-game run was a one-off script; engine.test.mjs:88 still seeds its AI games with `Math.random`, so a stall there is neither frequent nor reproducible.
- **Assertion that would have caught it:** "an AI's turn makes progress: within K turns its distance by its own cards falls or it gains a card" — engine/AI assertion in `aiStep` (debug tier), plus deterministic seeds for AI games in tests — would fire in the first stalled game of any test run — catches every stall kind at once — tags: `AS-ai-progress`

### F31 — The planner's plan lived in a module global (tools shared one plan)
- **Source:** found by Claude (2026-09-30, the zero-tech-debt pass after the owner's 18:44 objection)
- **Commits:** `4a150c4` (swap left in place) · `bd57d14` (bot look-ahead: local copies instead of swaps) · `7bbe187` Planner: the plan holder is passed explicitly and required
- **Symptom:** none seen by the owner; in the training tools, the search planner's remembered plan was shared across seats, and gen.mjs's distillation estimate overwrote the acting seat's plan (7bbe187 message).
- **Mechanism:** `BOT_PLAN_CACHE` was a module global; `aiChoose` swapped each AI's `mem.plan` in and out around `botChoose`, but tools calling `botChoose` directly used the one global for every seat and for the extra estimate call.
- **Root cause:** per-seat state stored globally and swapped by callers.
- **Design decision:** module-global mutable state with a swap pattern. — tags: `DD-global-state`
- **Siblings:** the engine's former global `S`/`MAP` and `setS`/`setMAP` swaps (removed in 4a150c4); the new `MAPS` cache keyed by `course.id+'#'+seed` (engine_rules.js:8, the rules test had to give each check its own course id: a latent collision for two different courses with one id).
- **Recommended design fix:** state passed explicitly by its owner.
- **What we did:** **ROOT** — the global is gone; `opts.planMem` is required and asserted (engine_bot.js:378); every tool passes one holder per seat.
- **Ratchet:** assertion — `botChoose: a search needs opts.planMem`.
- **Assertion that would have caught it:** "a plan is read and written only by the seat it was made for" — assertion in the planner — always-on — would have fired in the first multi-seat tool run — tags: `AS-engine-invariant`

### F32 — Refactors left compatibility paths (tech debt)
- **Source:** owner report (18:44, interrupting: "default to a fixed holder when nothing is passed so existing tool behavior is preserved. Wait, what the hell? Why are you preserving a path that we're not going to use? That's literally tech debt. We have a policy of zero tech debt. Have you done that elsewhere?"; 18:45: "did you add tech debt like that? In the rest of the refactor, I mean.")
- **Commits:** `4a150c4` (left `const S = gs` aliases in tools and tests) · `7bbe187` (holder required; aliases removed; CLAUDE.md zero-debt rule) · `0ed43a9` (no `Math.random` defaults: newGame/applyAction assert a random source; recApply requires the record) · `d0be19c` (dead migrations, `ai_calibration_v1` fallback, -v1 save clean-up removed) · `ce4c419` (one-time clean-up removed after it ran)
- **Symptom:** a planned default path for callers that shouldn't exist; aliases and defaults that let old call shapes keep working (a forgotten `rnd` silently fell back to unseeded `Math.random`, which breaks record replay).
- **Mechanism:** the refactor was done by conversion scripts and signature changes that kept old shapes alive (defaults, aliases, fallbacks) instead of updating every caller.
- **Root cause:** preserving behaviour was prioritised over removing the old interface.
- **Design decision:** compatibility paths kept so callers can stay as they were. — tags: `DD-compat-path`
- **Siblings:** U2 (botChoose's silent network fallback, still open); F33.
- **Recommended design fix:** interface changes update every caller in the same change; required parameters asserted; no defaults on engine entry points.
- **What we did:** **PARTIAL** — each found instance removed and the key ones asserted (random source, plan holder), plus the rule in CLAUDE.md; no lint, so a new default tomorrow would pass.
- **Ratchet:** assertion — `newGame`/`applyAction` assert a random source; `botChoose` asserts `planMem`.
- **Assertion that would have caught it:** "engine entry points have no default or optional parameters" — lint over src/engine_*.js (no `=` in parameter lists, no `||Math.random`) — test tier — would have fired on the refactor commit — tags: `AS-no-silent-catch`

### F33 — A v1 training replay listed on the live site but unplayable
- **Source:** found by Claude (2026-09-30 ~19:05, checking the live site after 3dc2884)
- **Commits:** `3dc2884` One game-log format: training tools write v3 records; v1 logs are gone · `d0be19c` delete the replays that aren't v3 records once more · `ce4c419` remove the one-time replay clean-up
- **Symptom:** the Replays screen listed a game that failed to open.
- **Mechanism:** the first clean-up (settings flag `logs_v3`) deleted non-v3 logs once, but `replayCheck` still accepted v1, so `record.mjs --upload` kept storing v1 logs; 3dc2884 made `replayCheck` refuse v1, leaving those rows listed and unplayable.
- **Root cause:** the list reads stored rows without the check that decides whether they play; the format change relied on a one-shot migration flag.
- **Design decision:** an old record format kept accepted in one path (upload) after it was dropped elsewhere; one-shot flag-keyed data migrations. — tags: `DD-compat-path`
- **Siblings:** the 09-29 log v3 bump (deleting old replays, local saves under -v1 keys); any future format bump.
- **Recommended design fix:** the list query filters on the current log version (`json_extract(body,'$.v') = 3`), so a format change needs no migration and can't list unplayable rows.
- **What we did:** **PARTIAL** — the delete ran again under a new key (`logs_only_v3`, SCHEMA_V 2) and was then removed; uploads now refuse v1; nothing ties the list to what replays.
- **Ratchet:** nothing
- **Assertion that would have caught it:** "every listed replay passes replayCheck" — assert in `GET /api/replays` (or a test that opens every listed replay) — always-on cheap — would fire on the first listing after 3dc2884 — tags: `AS-record-replays`

## Playtest 2026-09-30

Source for every entry: the review the owner pasted at 2026-09-30 19:14 UTC ("El Dorado Expedition: playtest review (2026-09-30, 08:31–09:24)"), run in his Chrome 154 (Windows, 1536×639, DPR 1.25) on a build from the morning of 09-30: before a230101, 2f4ee78, 9e85226 and 8084257 (and, if the test times are UTC, also before 110182e: unknown). Code citations are to the current tree (HEAD 3ea4f51) unless a commit is named. "Measured" means Claude's measurements of 09-30 evening (scratchpad playtest_findings.md), not re-done here. Item 11 (pan/zoom: "fine") and "Checked and fine" have no entry.

### P1 — Online resign takes 1.2–7 s
- **Source:** playtest 2026-09-30 #1 ("Online resign takes 1.2–7 s … The server plays out the whole rest of the game before replying"); reported first by the owner 2026-09-30 15:02 UTC ("It takes five seconds for it to exit. Trust me on this").
- **Commits:** `687b8cc` Online AI players (introduced the `Date.now() - t0 < 300` batch budget) · `37383a3` Resigning online leaves at once · `ed6a0c3` Revert "Resigning online leaves at once" · `a230101` Resigning online: the answer no longer waits for the AIs to finish the game
- **Same bug as:** C5, F13 — the online resign that waits while one alarm plays out the game (`687b8cc`'s `Date.now()` budget), fixed in `a230101`
- **Symptom:** after resigning on his own turn in an online room with AIs, the page sat 5–7 s (1.2–1.4 s vs Raleigh) before leaving; resigning during an AI's turn took 124 ms.
- **Mechanism:** the resign made the turn pass to an AI with no human watching, so `scheduleAI` set the alarm for "now"; the handler then awaited `tellLobby()` (a DO-to-DO fetch, which opens the input gate), the alarm ran in between, and `aiMove` looped "while `Date.now() - t0 < 300`": in a Worker `Date.now()` does not advance during synchronous CPU, so the loop played the whole rest of the game; only then did the resign handler reach `afterChange` → `sendAll`.
- **Root cause:** the resigning player's reply was queued behind unrelated work (the lobby update and, through it, an AI batch), and that work was bounded by a time budget on a clock that doesn't move while code runs.
- **Design decision:** the Room's handlers do their follow-up work (lobby updates, AI batches, game finish) before answering the player, with no rule "answer first, then do the rest", and CPU budgets were written as wall-clock budgets without knowing the platform freezes the clock; the only test ran on `wrangler dev`, where the clock moves (a230101's HANDOFF note) — tags: `DD-work-in-reply-path`, `DD-untested-real-setup`
- **Siblings:** `afterChange` still runs `finish()` (replay insert, `pruneReplays`, the ratings batch: several D1 round trips) before `persist(); sendAll(ev)` (worker.js:550, 611), so the move or resign that ends a game waits on D1; `addAI` awaits a D1 name lookup before answering (worker.js:496; P16 "Add AI ~190 ms"); any other `await` before a reply lets an alarm in. Process sibling: the first answer to the owner disputed the 5 s ("You're gaslighting me right now", 15:02) and `37383a3` hid the wait on the page.
- **Recommended design fix:** one reply path: every message handler applies the action, persists, sends the new state, and only then schedules follow-up work (lobby, finish, AI) as separate events; CPU work is bounded by counts (or by the alarm itself), never by `Date.now()`.
- **What we did:** **HACK `37383a3` (reverted `ed6a0c3`) → PARTIAL `a230101`**. `37383a3` made the page leave without waiting for the reply (symptom hidden, server unchanged); the owner had it reverted ("Revert the change immediately. Figure out what's causing it"). `a230101` replaced the time budget with `AI_BATCH = 8` counted actions (worker.js:206, 575) and moved `afterChange` before `tellLobby` in the act path and the timeout path only: this instance is fixed, but `finish()` and other awaits still precede replies, and `AI_BATCH = 8` is a number chosen to approximate "0.3 s".
- **Ratchet:** nothing — a230101 changed worker.js and HANDOFF only; test/online.cjs resigns against AIs (line 131) but checks only that the game ends, on wrangler dev where the bug can't show.
- **Assertion that would have caught it:** "a player's message is answered before the handler awaits anything but its own storage write" — server, in `Room.guard`: count awaits/AI actions between receiving a message and its `send`; assert no AI action runs inside a message's reply window (cheap, always-on, reported by the existing room boundary) — plus a test-tier latency budget: the online test resigns against the neural AIs and fails if the reply takes > 300 ms, with `Date.now` frozen during synchronous code to mimic Workers — would have fired on the first online resign that passed the turn to an AI (the owner's ordinary case) — also catches the finish-before-reply and addAI siblings — tags: `AS-server-reply`, `AS-latency-budget`

### P2 — Returning player sees a blank screen for ~1 s
- **Source:** playtest 2026-09-30 #2 ("With a saved local game … hides the start screen until /api/config → /api/me finish … The saved game is local but still waits on two serial network calls").
- **Commits:** `525ea29` Page split for the first round trip (the `html.resume` head script and rule); `b6b907c` front-end refactor (boot chain as it is now). Not fixed.
- **Same bug as:** D29 — the `html.resume` blank screen (`525ea29`), reported in the playtest (#2)
- **Symptom:** with a saved game (or a room/replay link) the first paint is background only; first contentful paint 948 ms.
- **Mechanism:** a head script adds `html.resume` when `eldorado-game-v2` exists or the URL has `room`/`replay` (shell.html:594), and `html.resume #menu{display:none}` (shell.html:30) hides the start screen; `boot()` shows nothing until `netInit()` (`/api/config`, then `/api/me`) resolves, then decides (main.js:58-66).
- **Root cause:** one rule in the boot decision — "a running online game beats your local save" (main.js:63, `NET.user && NET.active`) — needs the server, so the whole decision, including the purely local "resume my saved game", waits for two serial round trips.
- **Design decision:** the page picks its first screen only after the network answers, instead of showing what it knows locally at once and letting later server data add to it — tags: `DD-server-first`
- **Siblings:** P5 (rejoin shows the lobby before the server says lobby or game), P14 (My games redrawn when the server list arrives), P15 (boot waterfall), a `?replay=` link waits on `/api/config` + `/api/me` before even fetching the replay (main.js:59-60), which needs neither; the owner's 14:33 report ("there's no reason why I should have to go to the server … to load who the AIs are", fixed for one case in `110182e`).
- **Recommended design fix:** boot decides from local data only (saved game → show it; link → show a placeholder of that kind); the server's answer can only add an offer ("your online game is running: Rejoin"), never gate the first screen. That deletes the `resume` class and its display:none rule.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "local things show before any reply" — test tier: run the menus/flows tests with `/api/*` delayed 2 s and fail if a saved game (or the start screen) is not on screen within one frame budget of boot; debug tier: at the first `rAF` after boot, assert some screen is visible (menu open or a game drawn) — would fire on every return visit with a save on a real network — also catches P5, P14, P15 — tags: `AS-latency-budget`

### P3 — Explorer figures swallow taps on the space above them
- **Source:** playtest 2026-09-30 #3 ("A tap in the centre of a highlighted target hit Fawcett's `.pin` → onPiece → ignored. No move, no feedback").
- **Commits:** `b6b907c` front-end refactor (explorers as HTML with their own click listener) · `3ea4f51` Board taps and hover find the space by geometry, like drags (playtest item 3)
- **Symptom:** a tap on a highlighted space did nothing when another explorer stood on the space below it.
- **Mechanism:** each figure's `.pin` (64×72 board units, `pointer-events:auto`) had a click listener with `stopPropagation()` that called `onPiece`, which ignores other players' explorers; the figure's box reaches up into the neighbouring space, so the tap never reached the board's `[data-t]` target.
- **Root cause:** taps and hover asked "which element is on top?", and a figure's box does not match the space it stands on.
- **Design decision:** two systems answered one question ("what's under the pointer"): the board geometry (`targetAt`) for drags, the page's element stacking for taps and hover (plus a CSS `:hover` duplicate of `.hot`) — tags: `DD-two-mechanisms`
- **Siblings:** hover lighting a space that a tap wouldn't hit; a blockade badge's `data-t` duplicated in the DOM; any future board decoration with a box (dots, labels, badges) would have swallowed taps too.
- **Recommended design fix:** one hit test for all board input, from geometry; board decorations take no input.
- **What we did:** **ROOT** — `3ea4f51` deleted the per-figure listener and `pointer-events:auto` on `.pin`, the `data-t` attributes on badges and the CSS `:hover` rules; taps (`onBoardClick`), hover and drags now all use `targetAt`/`spaceAt` (main.js:74-80, overlays.js). A new decoration can't intercept a tap, because taps no longer look at elements. (An intermediate, uncommitted `document.elementsFromPoint` patch was rejected.)
- **Ratchet:** test — test/taps.cjs (the owner's 1536×639 @1.25 window; a target covered by another explorer's figure: hover lights it, a tap moves there; fails on the old code), run by test/run.mjs.
- **Assertion that would have caught it:** "a tap on a highlighted target is a move" — precondition in the board's click handler: if `targetAt(x,y)` is a target and `canAct()`, the click must end in `doMove` (debug: diag/assert when a tap on a target ends without an action or feedback) — always-on cheap — would have fired the first time a figure stood below a target (common at default fit) — also catches P26's dropped taps — tags: `AS-hit-test`, `AS-input-never-dropped`

### P4 — "All cards" overlay leaks across states
- **Source:** playtest 2026-09-30 #4 ("It isn't closed on Cancel, turn change, game over, New game, replay or menu. Seen staying open through AI turns, under the results dialog, into the replay, and behind the Online menu after New game").
- **Commits:** `d683178` Floating market strip over the board, All cards spread (introduced `UI.allOpen`). Not fixed.
- **Same bug as:** A14 — the `UI.allOpen` flag from `d683178`, reported in the playtest (#4)
- **Symptom:** the full-screen All cards overlay stays up through AI turns, the results dialog, a replay and the menu.
- **Mechanism:** `openAll(open)` sets `UI.allOpen` and writes `#allc.hidden` directly (market.js:17); it is called with `false` only from its X, Esc, the backdrop, a transmit pick and a pay pick made inside it (market.js:98, 117, 120; main.js:54; actions.js:135). `clearSelection`, `cancelMode`, `afterChange`, `syncMode`, `prepareGame`, `startReplay` and `menuOpen` never touch it.
- **Root cause:** whether the overlay may show depends on the game state and mode, but it is stored as a free-standing flag that each exit path must remember to reset, and none of the state changes above do.
- **Design decision:** UI state kept as ~18 independent switches in `UI` (state.js:10), reset by hand in several places (`clearSelection`, `cancelMode`, `afterChange`, `prepareGame`), with some views (this one) written imperatively outside the frame loop instead of derived from the state each frame — tags: `DD-ui-flags`
- **Siblings:** `UI.cover`, `UI.viewer`, `UI.preview`, `UI.lastReplay`, `UI.hover` follow the same pattern; `UI.anim` (P26); `replay.from` (P32); the 09-26 report "the all cards thing overlaps the end turn thing" (its own layer over controls, see P29).
- **Recommended design fix:** make "browsing all cards" a mode (or derive the overlay's visibility in a view part from `UI.allOpen && inGame() && canAct() && !menu open`), so any mode or game change closes it with no reset code; delete the direct `#allc.hidden` writes.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "the All cards overlay only exists in a mode that uses it" — per-frame invariant in the market view part: `assert(!UI.allOpen || (inGame() && !MENU.dlg.open && !G.replay && (canAct() || UI.mode === 'idle')))` — always-on, cheap, reported through boundary.js — would have fired in an ordinary playthrough the first time the player opened All cards and then ended the turn or opened the menu — the same "overlay/mode valid for the state" invariant, one per overlay, also covers the pay slot, the choice box and P32's results-vs-replay — tags: `AS-view-matches-state`

### P5 — Reloading or rejoining a running online game flashes the room lobby
- **Source:** playtest 2026-09-30 #5 ("The 'Connecting…' lobby dialog appears at 312 ms and fades out at 652 ms, then the game shows at 760 ms").
- **Commits:** `e6ae810` (joinRoom with `status:'connecting'`, from the start) · `110182e` Room lobby: a room you create is drawn at once (the creating path only). Not fixed for rejoin.
- **Symptom:** a reload or Rejoin shows the room lobby ("Connecting…") for ~0.3 s, then fades to the game.
- **Mechanism:** `joinRoom` sets `NET.room={status:'connecting'}` and calls `showRoomLobby()` at once (online.js:55-57); only the first socket message (`room` or `state`) says whether it is a lobby or a running game, and then `applyServerState` shows the game.
- **Root cause:** the page picks the lobby screen before it has the data that decides which screen is right.
- **Design decision:** a screen is chosen before the data that decides it (the lobby is the default placeholder for "a room, not known yet") — tags: `DD-server-first`
- **Siblings:** P2 (blank screen until the server answers), P14 (list redrawn when data lands), `110182e` (the created room's lobby was hidden until the first message; fixed only for the creator).
- **Recommended design fix:** a room whose kind isn't known shows no room screen: keep whatever is on screen (the game shell for `?room=` links and Rejoin, which `/api/me` already reports as `active`) until the first message, then show exactly one screen; the lobby screen only when `NET.room.status === 'lobby'`.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "the room lobby is shown only for a room in its lobby" — precondition in `menuOpen('room')`/per-frame: `assert(MENU.screen !== 'room' || NET.room.status === 'lobby')` (status 'connecting' fails) — always-on, cheap — would fire on every reload or Rejoin of a running game — generalises to "the shown screen matches the data" (P2, P32) — tags: `AS-view-matches-state`

### P6 — Online assertion 'animateMove: the explorer is drawn' at game start
- **Source:** playtest 2026-09-30 #6 ("In 2 of 4 early rooms: AssertionError: animateMove: the explorer is drawn … 'Something went wrong, sorry. The game was restored.' toast + reconnect"); also in Claude's report to the owner at ~15:30 UTC.
- **Commits:** `b6b907c` (explorers drawn by the frame loop, walks started from events) · `a936521` Board views: no guards on the board a game on show always has (the assert) · `2f4ee78` Fix 'animateMove: the explorer is drawn' when a game starts in a hidden tab
- **Same bug as:** E30, F28 — the false invariant `animateMove: the explorer is drawn` (`a936521`), fixed in `2f4ee78`
- **Symptom:** at the start of some online games, an error toast and a reconnect.
- **Mechanism:** a new game's state arrived while the tab was hidden; `applyServerState` → `showGame()` resets the pieces, but the pieces are drawn only in the next animation frame, which a hidden tab doesn't run; an AI's first `move` event arrived and `playEvents` → `animateMove` found no element for the explorer and asserted.
- **Root cause:** events are played (animations started) synchronously when a message arrives, against DOM that the frame loop draws later; in a hidden tab "later" never comes.
- **Design decision:** events are handled imperatively outside the frame loop (`playEvents` runs before `render`, against whatever the DOM holds), so every animation must guess whether the previous state is drawn — tags: `DD-imperative-sequencing`, `DD-animation-coupled`
- **Siblings:** docs/ASSERTIONS.md already lists the same pattern elsewhere ("an event can describe an earlier action of a batch … don't assert that an event's card or stack still exists": `marketRectOf`, `flyToDiscard`, `feedEvent`'s `chipRect`); P26 (`UI.anim` set before a rAF that a hidden tab never runs: the local AI freezes).
- **Recommended design fix:** events go into a queue that a view part consumes inside the frame (after drawing the pre-event state, or skipping animation when the pre-state was never drawn), so "the element exists" is true by construction.
- **What we did:** **PARTIAL** — `2f4ee78` replaced the assert with `if (!P) return;` (pieces.js:60): correct for this case (update() places the explorer at its end), and it explains the cause, but it is an `if` for one case that also deletes the check that found the bug; events are still played outside the frame.
- **Ratchet:** test — test/online.cjs "an AI moving while the tab is hidden: no error, the board catches up" (rAF stubbed; fails without the fix). The assertion itself is gone.
- **Assertion that would have caught it:** it was caught — by the existing always-on assertion, reported through the boundary in the owner's Chrome (a good example of the system working). The earlier catch would have been the test-tier check now added (hidden tab); the general property to keep is "every event's animation targets an element drawn from the pre-event state" checked where a queued event is consumed — tags: `AS-view-matches-state`, `AS-events-explain-change`

### P7 — Turn hand-offs drop 6–7 frames; AI turns run at ~20 fps
- **Source:** playtest 2026-09-30 #7 ("Every turn hand-off drops ~6–7 frames: 117 ms when my turn ends, 100 ms when it returns (no script time; style/paint/GC)") and #9 ("AI turns run at ~20 fps in stretches … 2.3–2.7% of frames over 34 ms").
- **Commits:** `98ff674` History center mode always shows the latest turn (the whole-row `setHTML` in `latestUpdate`) · `b6b907c` (cards as inline SVG) · `8084257` (removed the full-screen turn banner; measured after: still slow). Not fixed.
- **Symptom:** a visible stutter at every turn change (twice a round) and during AI turns.
- **Mechanism:** measured (4× CPU throttle): 12–28 frames > 34 ms per hand-off, worst 150–267 ms, time in layout/paint/layerize, not JS. Per hand-off `#feed` adds ~1000 and removes ~690 elements: `latestUpdate` rewrites the whole `.frow` with `setHTML` whenever the turn's steps change (feed.js:198), `update` resets `#feed` with `innerHTML` when the turn on show switches (feed.js:184), and each step is card faces of ~50 inline SVG elements; the hand adds/removes ~590 more (4 cards leave, 4 enter, each a full `cardHTML`).
- **Root cause:** the history row is rebuilt as a whole string each time one step is added, and each card is a heavy SVG subtree, so one AI action rewrites hundreds of elements the browser must lay out and paint.
- **Design decision:** views written by replacing a region's HTML (`setHTML` of a whole row) instead of updating the one thing that changed, and cards drawn as ~50-element inline SVG copies instead of a shared image/symbol — contrary to CLAUDE.md's "each view part writes only what changed" — tags: `DD-whole-rebuild`
- **Siblings:** P8 (late game, if it is the same cost growing), P9 (one-off hitches: `resetView` recreating every part), the history column's per-turn `setHTML` (feed.js:167), the market's slot patching, the owner's 09-29 "Jack of all trades … flickers in afterwards" (heavy card HTML).
- **Recommended design fix:** the row keeps one element per step (keyed, as `update` already does for other players' turns) and only appends/updates; cards use one shared SVG `<symbol>`/image per card type (`<use>`), so a card is a few elements.
- **What we did:** **NOT FIXED** (the turn banner's removal in `8084257` was a product change and did not remove the drops).
- **Ratchet:** nothing (not fixed). test/frames.cjs checks "select a card" and "move" for restyle counts and long tasks, not the hand-off.
- **Assertion that would have caught it:** "an action writes only what changed" — debug tier: a per-region MutationObserver budget per engine action (e.g. `#feed` ≤ one step's elements added, the hand ≤ the cards that actually changed), reported via diag; test tier: extend test/frames.cjs to an AI hand-off with a frame budget (no frame > 50 ms at 4× throttle) — would fire on every hand-off of an ordinary game — also catches P8 and P9 if they are DOM churn — tags: `AS-dom-churn`, `AS-frame-budget`

### P8 — Late game: nearly every turn change has a 100–200 ms frame
- **Source:** playtest 2026-09-30 #8 ("from round ~11, nearly every turn change has a 100–200 ms frame … DOM (4.2k nodes) and heap (27 MB) stay flat, so it's not a leak; something scales with game state").
- **Commits:** none identified. Not fixed.
- **Same bug as:** U4 — the late-game hand-off hitches of playtest #8, not reproduced
- **Symptom:** hitches at turn changes get more frequent from round ~11, local and online.
- **Mechanism:** unknown. Claude did NOT reproduce it on the current build (round 13: 12 slow frames vs round 2: 28). The tested build differed: `0101346` history modes incl. a column of every turn (if `eldorado-hist` was 'left' the column re-renders turns as the 200-entry journal wraps — `LOG_MAX`, engine_rules.js:136 — which in a 3–4 player game happens around round 10–11: hypothesis, not verified), and the full-screen turn banner (removed in `8084257`).
- **Root cause:** unknown.
- **Design decision:** unknown; the only confirmed decision is process: performance was measured headless on a fast machine, not in the owner's Chrome over a whole game — tags: `DD-untested-real-setup`
- **Siblings:** P7 (same frames, if it is the same churn growing with the number of steps per turn).
- **Recommended design fix:** first a trace from the owner's Chrome over a full game; then fix the cause (if it is P7's churn, P7's fix).
- **What we did:** **NOT FIXED** (not reproduced; needs the owner's trace)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "turn changes cost the same in round 15 as in round 2" — test tier: a full-game frame recorder (perf.cjs over a whole AI game) asserting the slow-frame count per hand-off doesn't grow with the round — would have fired only in long games — tags: `AS-frame-budget`

### P9 — One-off hitches (select, buy, undo, drop, market hide, setup clicks, replay open/leave)
- **Source:** playtest 2026-09-30 #10 ("first card select 50 ms; buy completion 100 ms; Undo 100 ms; drop after drag 98/77/67 ms; hiding the market 117 ms; changing player count in setup 100 ms per click; opening a replay 232 ms + 241 ms; leaving a replay 117 ms").
- **Commits:** none. Not fixed.
- **Symptom:** single long frames on common actions.
- **Mechanism:** not measured individually; traced paths (hypothesis for the attribution, code paths verified): hiding the market → `setMkt` → `fitSoon(true)` → glide then bake → the whole board redrawn at a new scale (market.js:15, camera.js:57); player count in setup → `prepareGame` → `showGame` → `resetView` resets every view part (hand cards and explorers destroyed and recreated) (menu.js:87, 154-160); Undo → `recUndo` replays the whole record from the first action (engine_rules.js:100-102; cost grows with game length) and redraws the hand; opening a replay → `buildReplay` JSON-stringifies a state per action, then `showGame`; leaving → `resumeSaved` → `recState` replays the saved game + `showGame`.
- **Root cause:** each of these rebuilds or recomputes everything (the board raster, all view parts, the whole game from its record) for a small change.
- **Design decision:** whole rebuilds instead of incremental updates (reset all parts on any "new game on show"; derive the current state by replaying the full record) — tags: `DD-whole-rebuild`
- **Siblings:** P7, P8; P31 (Undo shows no motion partly because it rebuilds instead of stepping back).
- **Recommended design fix:** keep state snapshots so undo pops one; setup changes update the preview in place (same board, different seats) instead of `resetView`; showing/hiding the market doesn't refit the board.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "no interaction frame over 50 ms" — test tier: test/frames.cjs extended to each listed interaction (at 4× throttle) — would fire in the tests, not in live play — tags: `AS-frame-budget`, `AS-dom-churn`

### P10 — Prompt pill changes size on every state
- **Source:** playtest 2026-09-30 #12 ("429 → 363 (card picked) → 726×40 (buying, two lines) → 158/146 (AI playing) → 429. It re-centres each time") and #31 in part ("the prompt becomes a two-line instruction paragraph").
- **Commits:** `e6ae810` (an absolutely positioned, shrink-to-fit prompt) · `3a8631e` (`#prompt{width:max-content}`; editor: first cited as `e6ae810`, which has no `width:max-content`) · `9e85226` Prompt box keeps one size (min-width 560 px, phone `#ptxt{min-height:2.8em}`, shorter words) · `8084257` Audit (removed the idle/card/buy wording)
- **Same bug as:** C10, F17 — the content-sized prompt box (`width:max-content`, `3a8631e`), clamped in `9e85226`
- **Symptom:** the prompt box resizes and re-centres at each mode change, shifting the layout (CLS 0.003–0.023 each).
- **Mechanism:** `#prompt` is `width:max-content`, clamped between `min-width:min(560px,…)` and `max-width:min(760px,…)` (shell.html:212): its width follows its text and the history row inside it; buy mode's long text wrapped to two lines.
- **Root cause:** the box's size is derived from whatever it currently says.
- **Design decision:** content-sized layout for a fixed piece of chrome — tags: `DD-content-sized-layout`
- **Siblings:** P11 (buttons placed by which others exist), P12 (the round label moves the player bar), P13 (hand spacing counts cards shown elsewhere), the history panel that "expands so much to the right" (owner 09-30 01:50, `765f07e`).
- **Recommended design fix:** the prompt is a fixed slot (width from the game area, a fixed number of lines, text truncated or scaled to fit), so no text can resize it.
- **What we did:** **HACK** — `9e85226` clamps the content-sized width with a tuned `min-width:560px` (and a phone min-height of 2.8em); text longer than ~530 px (the active-card line, "No reachable spaces…", the history row with many cards) still widens it up to 760 px. `8084257` cut most prompt text (the owner's call), which reduces the variation without changing the cause.
- **Ratchet:** nothing — 9e85226's test change (test/menus.cjs) checks the player window, not the prompt.
- **Assertion that would have caught it:** "fixed chrome keeps its box" — debug tier: record `#prompt`'s and `#players`' rects each frame (reading layout is allowed in debug, in `after()`), and diag any change not caused by a window resize — Chrome's own `layout-shift` entries skip the 500 ms after input, so a custom check is needed — would fire on the first card pick of an ordinary game — also catches P11, P12, P14 — tags: `AS-layout-shift`

### P11 — Turn buttons move and change meaning under the finger (Undo jumps; End turn/Undo vanish in buy mode; double taps pass confirmations)
- **Source:** playtest 2026-09-30 #13 ("selecting a card adds Cancel, so #actBtns grows 104 → 151 px and Undo moves from under End turn to beside Cancel. In buy mode End turn/Undo vanish entirely") and #27 ("End turn → End turn anyway → Discard & end turn land on ~the same spot. In pass-and-play, 'Reveal hand' sits where Undo appears after revealing").
- **Commits:** `e6ae810` (`btnWire`) · `8084257` added the Settings switch for the buy reminder (fewer steps when off; placement unchanged). Not fixed.
- **Same bug as:** A11 — the confirmation that takes over End turn's slot (`a304ba6`) is the double-tap half of P11 (playtest #27)
- **Symptom:** Undo jumps when a card is picked; in buy mode End turn and Undo disappear; a double or triple tap on End turn walks through the "you can still afford" warning and the discard step; after "Reveal hand", Undo appears where the tap just was.
- **Mechanism:** each mode builds its own button list (hud.js:85-111); `btnWire` puts the `big` buttons first and the rest in a `.brow` row (hud.js:115-121) in a column anchored at the bottom (`#actBtns{bottom:…;flex-direction:column}`, shell.html:295), so a button's position depends on which others exist; the confirmations keep the `big` slot while its meaning changes (End turn → End turn anyway → Discard & end turn), and pay mode lists only Cancel.
- **Root cause:** a button's place is computed from the current mode's list, not fixed per action, and a confirmation reuses the exact spot of the click it confirms.
- **Design decision:** content-sized layout for controls (positions follow which siblings exist), and no rule that a confirmation must not sit where the previous tap landed — tags: `DD-content-sized-layout`
- **Siblings:** P10, P12; the 09-26 report "the all cards thing overlaps the end turn thing"; P23 (the click count the confirmations add).
- **Recommended design fix:** fixed slots per action (Undo, secondary, primary) that stay in place and are disabled rather than removed; a confirmation step appears in a different place (or needs a pause) so a repeated tap can't confirm it.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "a control keeps its place while it exists, and a place keeps its meaning for a moment" — debug tier, per frame in `after()`: each `#actBtns` button id keeps its rect while present, and no different enabled button appears within ~400 ms under the point of the last tap — would fire on the first card pick and the first End turn of an ordinary game — also catches P10, P12 — tags: `AS-layout-shift`, `AS-hit-test`

### P12 — Player bar jumps 51 px at "Round N · final"
- **Source:** playtest 2026-09-30 #14 ("Player bar jumps 51 px when the round label becomes 'Round N · final' (hud.js:21, a flex sibling), and back again. Smaller shift at round 9 → 10").
- **Commits:** `e6ae810` (the `.brandbox` / `#roundLbl` layout). Not fixed.
- **Symptom:** all player chips shift sideways when the final round starts (and at round 9 → 10).
- **Mechanism:** `#roundLbl` lives in `.brandbox`, a flex sibling of `#players` (`flex:1; justify-content:safe center`) (shell.html:178-181, 555); `setText(roundLbl, 'Round '+S.round+(… ' · final'))` (hud.js:60) widens the brand box, which shrinks `#players` and moves its centre.
- **Root cause:** the chips' position depends on the width of a neighbour's text.
- **Design decision:** content-sized layout in the top bar — tags: `DD-content-sized-layout`
- **Siblings:** P10, P11, P13.
- **Recommended design fix:** the top bar is a grid with fixed tracks (brand/round in a fixed-width cell with tabular digits), so no text can move the chips.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** same as P10: debug per-frame rect check of `#players` (moves without a resize → report); here the native `layout-shift` observer would also fire when the change comes from an AI's turn (no recent input) — fires once per game (final round) plus round 10 — tags: `AS-layout-shift`

### P13 — Paying by drag leaves a hole in the hand
- **Source:** playtest 2026-09-30 #15 ("Paying for a card by drag leaves a hole in the hand where the paid card was until the purchase completes").
- **Commits:** `b6b907c` (`layoutCards` as now). Not fixed.
- **Same bug as:** A25 — the fan laid out by index over the whole hand, with the pay tray as an exception (`f72f961`), reported in the playtest (#15)
- **Symptom:** a gap stays in the fan where each paid card was.
- **Mechanism:** `layoutCards` spaces cards by their index `i` over the engine's whole hand (`n = hand.length`, `off = i - (n-1)/2`), and cards being paid are drawn in the tray as an exception inside the same loop (hand.js:35-53), so their slots stay reserved.
- **Root cause:** the fan is laid out from the engine's hand, while the screen shows some of those cards elsewhere.
- **Design decision:** the view has no model of "cards shown in the hand": the engine's hand and the pay tray both claim the paid cards, and the tray is a special case inside the hand's loop — tags: `DD-multi-source-truth`
- **Siblings:** a dragged card (`.free`) also keeps its slot; cards picked for rubble/base camp and for keeping at the end of a turn are "lifted" in place; any future "card shown elsewhere" repeats the hole.
- **Recommended design fix:** derive the list of cards in the fan first (hand minus tray minus dragged), lay out that list, and lay out the tray as its own list.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "the hand shows exactly the cards in it, evenly spaced" — always-on, in `layoutCards` (pure arithmetic, no layout read): the x positions of cards placed in the fan are consecutive steps with no unused index — would fire on every purchase paid by drag — also catches the drag sibling — tags: `AS-view-matches-state`

### P14 — Replays → My games reshuffles under the cursor
- **Source:** playtest 2026-09-30 #16 ("2 local rows render instantly, then ~1 s later 10 online rows are merged and re-sorted, so the list reshuffles under the cursor").
- **Commits:** `3c496d1` Every game is recorded and can be watched as a replay (the merged list). Not fixed.
- **Same bug as:** D16 — the merged My games list (`3c496d1`), reported in the playtest (#16)
- **Symptom:** the My games list reorders ~1 s after opening.
- **Mechanism:** `showReplays` draws the device's games (`showMine([])`), then fetches `/api/users/<me>` and redraws everything merged and sorted by date (menu.js:241-247) — although boot's `loadProfile` already fetched the same data into `PROFILES` (online.js:24, menu.js:191).
- **Root cause:** one list is assembled from two sources that arrive at different times, and the late one is merged into rows already on screen.
- **Design decision:** two sources of truth for "my games" (device list and server list) merged on the client after the fact; and a screen drawn before the data that decides its order — tags: `DD-multi-source-truth`, `DD-server-first`
- **Siblings:** P2, P5; the profile fetched twice (boot and here), and `onlineTab`'s own fetch (menu.js:198).
- **Recommended design fix:** either one source (a signed-in player's finished local games go to the server too, and the list is the server's), or two sections that never interleave (online games fill their own slot); use the cached profile.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "rows don't move under the cursor" — debug tier: the native `layout-shift` observer (the move comes ~1 s after the click, outside the 500 ms input window) reported via diag — would fire on every signed-in visit to My games with local games — tags: `AS-layout-shift`

### P15 — Page boot is a serial waterfall
- **Source:** playtest 2026-09-30 #17 ("HTML → app.js → /api/config (static data, could be inlined) → /api/me (~220 ms …) → /api/users/me (~480–500 ms: 4 sequential D1 queries incl. `COUNT(*)` rank and `uids LIKE '%,id,%'` full scan) … Cold isolates also do a D1 write (session secret INSERT OR IGNORE) before auth").
- **Commits:** `e6ae810` (`/api/config`, `sessionSecret`) · `3c496d1` (profile with games). Not fixed.
- **Symptom:** the signed-in state and profile appear ~1 s after load.
- **Mechanism:** `netInit` awaits `/api/config` (two constants: the Google client id and the dev flag) before `/api/me`, which awaits auth and a Lobby DO round trip; then `loadProfile` (online.js:20-25); the profile endpoint runs a user SELECT, `authUser` (token + SELECT), a `COUNT(*)+1` rank query and a `uids LIKE '%,id,%'` scan with `json_extract` over replay bodies, one after another (worker.js:281-289); on a cold isolate `sessionSecret` does an `INSERT OR IGNORE` + SELECT before any token check (worker.js:110-116).
- **Root cause:** `/api/config` doubles as the "is the server there" check, so the real request waits on it; each later request waits on the previous one; the profile's data is scattered across queries (rank, games parsed out of replay bodies) instead of being stored where it is read.
- **Design decision:** the page asks the network for things it knows at build time and chains requests instead of issuing them together — tags: `DD-server-first`
- **Siblings:** P2 (the first screen waits on this chain), P16 (the same D1 shapes: `json_extract` over bodies, per-request auth), P14.
- **Recommended design fix:** bake `GOOGLE_CLIENT_ID`/dev flag into the page at build (or serve them in the HTML), treat any failed request as "server unavailable", send `/api/me` immediately and return the profile summary with it; store the replay list columns (course, players, result, uids) at insert time instead of parsing bodies.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "boot makes at most one serial round trip before the page is usable" — test tier, count-based: record the fetch dependency chain during boot in the tests and fail over depth 1; server: a per-endpoint D1-query-count budget in the worker tests — would fire on every boot — also catches P2 — tags: `AS-latency-budget`

### P16 — Create room 1.6 s; Add AI ~190 ms each; leaderboard and shared replays ~1 s
- **Source:** playtest 2026-09-30 #18 ("Create room: 1.6 s click → usable lobby (POST /api/rooms 798 ms). Add AI ~190 ms each (a D1 lookup per add). Leaderboard ~1 s. Shared replays ~1 s").
- **Commits:** `687b8cc` (addAI's D1 lookup) · `110182e` Room lobby: a room you create is drawn at once
- **Symptom:** waits on the online screens.
- **Mechanism:** create: `authUser` (D1) → `createRoom` → a new Room DO's `/init` (instantiation + storage write) → reply; then the socket upgrade authenticates again and the DO seats the player and persists before the lobby's first message (worker.js:189-197, 456-470). Add AI awaits `SELECT name FROM users` before answering (worker.js:496). The replay lists select `json_extract(body, …)` over whole stored logs (worker.js:200, `GAME_COLS`) — hypothesis for the ~1 s, not verified; the leaderboard's cost: unknown.
- **Root cause:** each reply waits on D1/DO round trips for data the page mostly already has (its own options, the AI's name) or that could be stored ready to read.
- **Design decision:** replies wait on work the page doesn't need first (DD-work-in-reply-path), and the page waits for the server's word before drawing a lobby it could draw from what it sent (DD-server-first) — tags: `DD-work-in-reply-path`, `DD-server-first`
- **Siblings:** P1 (reply behind other work), P15 (same D1 shapes), P5.
- **Recommended design fix:** the page draws the room from its own options at click time (before the POST returns) and fills in the code; the AI's display name is known on the page (engine `aiById`) and the server answers first, persisting afterwards; list columns stored at insert.
- **What we did:** **PARTIAL** — `110182e` (possibly after the tested build: unknown) draws the lobby from the options the page sent as soon as the POST returns, instead of waiting for the socket's first message; the POST (auth + new DO) and addAI's D1 wait remain.
- **Ratchet:** nothing (110182e changed menu.js and online.js only).
- **Assertion that would have caught it:** "local things show before any reply" — test tier: the online test with the network delayed (e.g. 1 s per request) asserting the lobby is drawn within one frame of Create, and a count budget of server round trips per click — would fire on every room creation — tags: `AS-latency-budget`

### P17 — Replay max speed is 4×
- **Source:** playtest 2026-09-30 #19 ("325 ms/action + 225 ms/turn: a 226-action game takes ~90 s to watch at top speed").
- **Commits:** `f0c51f3` (speeds as now: `RSPEEDS`, replay.js:123). No defect.
- **Same bug as:** G2 — the replay pace as a guessed constant: too fast on 09-27, a 4× top speed too slow on 09-30
- **Symptom / Mechanism / Root cause:** as designed: `(1300 + 900 at a turn's end) / speed` ms per step (replay.js:86).
- **Design decision:** the fastest replay speed was never specified — tags: `DD-no-spec`
- **Siblings:** P18 (AI pace).
- **Recommended design fix:** owner to decide (e.g. an 8×/16× step or a "skip to end of turn" control).
- **What we did:** **NOT FIXED** (product decision pending with the owner)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** none possible: a product choice — tags: `AS-none`

### P18 — Waiting for AIs: ~5–9 s a round, each AI turn under a centre-screen banner
- **Source:** playtest 2026-09-30 #20 ("~5 s/round with 2 AIs, ~9 s/round with 3. Every AI turn gets a full-screen-centre banner (~1.4 s) that sits on top of the mid-board explorers"); owner 15:56 UTC: "the turn banner is pretty horrible … the current player can just flash".
- **Commits:** `8084257` Audit: cut what the owner marked as noise (turn banner removed; the chip flashes)
- **Symptom:** slow AI rounds; a banner covering the middle of the board at every turn.
- **Mechanism:** pacing: local AIs wait 750 ms per action (1000 ms for a turn's first) (ai.js:38), server AIs 900/700 ms (worker.js:566, 581); the banner was `banner()` over the board centre from `afterChange` on every turn change.
- **Root cause:** pace: chosen so the table can follow each card. Banner: a transient announcement floated over the board with no cell of its own.
- **Design decision:** pace never specified by the owner (DD-no-spec); announcements floated over the play area (DD-float-over) — tags: `DD-no-spec`, `DD-float-over`
- **Siblings:** P17; P28, P29 (other things floating over the board or controls).
- **Recommended design fix:** pace: owner to decide (e.g. faster AI steps, or a speed setting). Banner: whose turn it is shown in its own place (the chip), which is what 8084257 did.
- **What we did:** **PARTIAL** — `8084257` removed the turn banner from `afterChange` and `resumeSaved` (the chip flashes instead), on the owner's decision; `banner()` still exists and still floats over the board centre when a replay opens (replay.js:62). AI pace: product decision pending with the owner.
- **Ratchet:** nothing.
- **Assertion that would have caught it:** banner part: "nothing floats over the explorers or targets during play" — debug: a floating element's rect must not intersect the board's safe rect while `inGame()` — would fire at every turn change; pace: none (product choice) — tags: `AS-no-overlap`

### P19 — Closing a socket takes 10 s; silent drops detected after 40 s
- **Source:** playtest 2026-09-30 #21 ("Client-initiated socket close takes 10.0 s to complete (the server never answers the close frame), so the server keeps a departed player 'online' ~10 s. Silent network drops are detected only after 40 s (heartbeat 15 s / 40 s)").
- **Commits:** `e6ae810` (`webSocketClose(ws, code) { try { ws.close(code); } catch (e) { } }` in the Lobby; the same in `Room.onClose`). Not fixed.
- **Same bug as:** U3 — U3 is the class (42 empty catches), P19 its measured instance (the socket close with code 1005)
- **Symptom:** a player who left still shows as online for ~10 s; a dead connection is noticed only after 40 s.
- **Mechanism:** measured: the page closes with `w.close()` and no code (online.js:47, 59), so the server's handler receives 1005 ("no status"); `ws.close(1005)` throws (1005 may not be sent), the empty `catch (e) { }` hides it (worker.js:367, 636), the close is never answered and the browser gives up after 10,010 ms (unclean 1006); with code 1000 it takes 5 ms. The 40 s is the heartbeat's tuned threshold (online.js:68).
- **Root cause:** the server echoed whatever code it received, a throw said so, and the empty catch threw the message away.
- **Design decision:** errors swallowed by empty catches (Claude's count: 42 in page + server, 13 in worker.js), so a failure looks like success — tags: `DD-silent-failure`
- **Siblings:** every other empty catch on send/close (`send`, `broadcast`, `tellLobby`, `saveReplay`'s catch, the fullscreen `.catch(() => { })`, main.js:46); docs/ASSERTIONS.md lists "`ws.send` / `ws.close` (a socket may be gone)" as a kept check, which is how this one stayed hidden.
- **Recommended design fix:** close with an explicit valid code on both sides (1000), and no empty catch: a boundary check that swallows must at least report (diag / `storeBug` for the unexpected kinds), so "a socket may be gone" is the only case let through.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "every socket closes cleanly, fast" — test tier: the online test closes a room and lobby socket and asserts the `close` event within 1 s with `wasClean`; lint tier: no empty catch without a comment naming the expected failure — the test would fire on every run; the lint on every build — also catches the other silent catches — tags: `AS-server-reply`, `AS-no-silent-catch`

### P20 — AI opponents only on First Expedition with 3–4 players
- **Source:** playtest 2026-09-30 #22 ("The other 4 courses and every 2-player game can't be played solo. All-AI watch mode is refused").
- **Commits:** none (the rule is `aiAllowed`, engine_ai.js:22-24; `#allAI` refuses all-AI tables, menu.js:140). No defect.
- **Symptom / Mechanism:** by design: the network was trained only on First Expedition 3–4 players.
- **Root cause:** a capability limit of the trained AI, not a bug.
- **Design decision:** which courses/player counts get AIs, and whether all-AI games are allowed, were never decided with the owner beyond what training covered — tags: `DD-no-spec`
- **Siblings:** none.
- **Recommended design fix:** owner to decide (train more courses, allow the planner AI elsewhere, allow watch mode).
- **What we did:** **NOT FIXED** (product decision pending with the owner)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** none possible: a product choice — tags: `AS-none`

### P21 — Ending a turn with cards left takes 2–3 clicks
- **Source:** playtest 2026-09-30 #23 ("End turn with cards left always takes 2 clicks (Discard & end turn / Keep all); with an affordable buy, 3 (warning first)").
- **Commits:** `8084257` (a Settings checkbox to turn the buy reminder off; owner's decision 15:56 UTC). No defect in itself.
- **Symptom / Mechanism:** `startEndTurn` → `buyWarn` (if the reminder is on and something is affordable) → `endTurn` (pick cards to keep) → `finishTurn` (actions.js:206-212).
- **Root cause:** the rules let a player keep cards, so the page asks every turn.
- **Design decision:** the end-of-turn flow (always ask vs. keep-by-tapping-before-End) was not specified — tags: `DD-no-spec`
- **Siblings:** P11 (the confirmations sit where the first click was, so a double tap skips them).
- **Recommended design fix:** owner to decide (e.g. tap cards to keep during the turn, one End turn click).
- **What we did:** **NOT FIXED** (product decision pending with the owner; 8084257 made the buy reminder optional)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** none possible: a product choice — tags: `AS-none`

### P22 — "Start a new game" discards the running game with one click
- **Source:** playtest 2026-09-30 #24 ("'Start a new game' from the in-game menu discards the running game with one click, no confirmation, and unfinished games aren't kept").
- **Commits:** `3c496d1` (Menu during a game). Not fixed.
- **Symptom:** one click loses the game in progress.
- **Mechanism:** in a game the start button reads "Start a new game" (menu.js:60) and calls `startLocal` → `prepareGame(true)`, which replaces `G.rec` and the save (menu.js:161-166); Resign and End game ask first (actions.js:258-270), this doesn't.
- **Root cause:** a destructive action without the confirmation its siblings have; unfinished games are never kept.
- **Design decision:** whether leaving a game needs a confirmation, and whether unfinished games are kept, was never specified — tags: `DD-no-spec`
- **Siblings:** Esc/backdrop close the menu (menu.js:40-41) but the start button is one click away inside it.
- **Recommended design fix:** owner to decide (confirm, or keep the unfinished game resumable).
- **What we did:** **NOT FIXED** (product decision pending with the owner)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** none possible as an invariant (a product choice); a flows test "a game in progress is never discarded without a confirmation" once decided — tags: `AS-none`

### P23 — Online time bank is uncapped
- **Source:** playtest 2026-09-30 #25 ("in a 90 s room my clock read 26:29 by round 18").
- **Commits:** `c80f303` Online clock is a time bank: each turn adds the turn time, unused time carries over. No defect: as specified.
- **Symptom / Mechanism:** `startTurnTimer` adds `opts.turn` to the seat's bank every turn; `settleClock` keeps the rest (worker.js:554-563, 556 `settleClock`, 560 `startTurnTimer`).
- **Root cause:** the owner specified carry-over (2026-09-28: "If you don't use your timer, you get to use it in the next turn"); no cap was specified.
- **Design decision:** the cap was never specified — tags: `DD-no-spec`
- **Siblings:** none.
- **Recommended design fix:** owner to decide (a cap such as 2–3× the turn time).
- **What we did:** **NOT FIXED** (product decision pending with the owner)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** none possible: a product choice — tags: `AS-none`

### P24 — The History button is a hidden 3-way cycle
- **Source:** playtest 2026-09-30 #26 ("under prompt / side / off. Clicking 'History' hid the history; only the tooltip explains it").
- **Commits:** `0101346` History: … three modes on the History button. Not fixed.
- **Symptom:** pressing "History" can hide the history.
- **Mechanism:** `histCycle` steps `center → left → off` (feed.js:122-124); the label stays "History"; only `title` says what a press does (feed.js:173-174).
- **Root cause:** three states on one unlabeled toggle.
- **Design decision:** how the history modes are chosen was not specified (Claude picked a cycle) — tags: `DD-no-spec`
- **Siblings:** none.
- **Recommended design fix:** owner to decide (e.g. a small segmented choice, or History toggles one chosen mode).
- **What we did:** **NOT FIXED** (product decision pending with the owner)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** none possible: a UX choice — tags: `AS-none`

### P25 — Opening the menu doesn't pause local AIs
- **Source:** playtest 2026-09-30 #28, first part ("Opening the menu doesn't pause local AIs; they finish their turns behind it").
- **Commits:** none. No defect as coded.
- **Symptom / Mechanism:** `aiKick`'s scheduled moves (ai.js:22-39) don't check `MENU.dlg.open`.
- **Root cause:** pausing was never asked for or decided.
- **Design decision:** whether the menu pauses a local game was never specified — tags: `DD-no-spec`
- **Siblings:** P26 (the hidden-tab freeze is the opposite: an unintended pause).
- **Recommended design fix:** owner to decide; if yes, "paused" is one derived condition (`menu open || tab hidden`) that the AI scheduler reads, not a flag.
- **What we did:** **NOT FIXED** (product decision pending with the owner)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** none possible: a product choice — tags: `AS-none`

### P26 — Animation gates input and the AI: a second card is ignored while an explorer walks; local AIs freeze in a hidden tab
- **Source:** playtest 2026-09-30 #29 ("Tapping a second card while your explorer is still walking (~0.7 s) is silently ignored (hand.js:134/163: input dropped while UI.anim)") and #28, second part ("Local AIs freeze entirely while the tab is hidden (aiKick waits on animations)").
- **Commits:** `e6ae810` (`UI.anim`) · `b6b907c` (walks as Web Animations; `UI.anim` set by pieces.js). Not fixed.
- **Symptom:** taps during a walk do nothing, with no feedback; with the tab in the background, a local game with AIs stops.
- **Mechanism:** `animateMove` sets `UI.anim = true` synchronously, starts the walk two rAFs later, and clears it when the walk finishes (pieces.js:66-77); `onHandCard`, card drags/drops, the board click and sound return early while `UI.anim` (actions.js:168, hand.js:134/163/171, main.js:74, sound.js:93); `aiKick`'s `go` re-arms `setTimeout(go,120)` while `UI.anim` (ai.js:27). In a hidden tab rAF never runs, so the walk never starts, `UI.anim` never clears and the AI polls forever (hypothesis for the hidden-tab path: code-traced, not measured).
- **Root cause:** a global flag owned by the animation code decides whether the game may take input or move on.
- **Design decision:** animation gates state and input: the view's timing is a precondition for the game (instead of the game state being final at once and animations being decorations that can be cut short) — tags: `DD-animation-coupled`
- **Siblings:** P6 (events assume the frame loop has run), P31 (the opposite side: a state change with no event, so no animation), the replay's `UI.anim` interplay; `STEP` timing sounds.
- **Recommended design fix:** input and AI never read animation state: a new action finishes (or jumps) the current walk and proceeds; the AI's pacing is its own timer; delete `UI.anim`.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "on my turn, input is never silently ignored" — always-on, in each input handler: if `canAct()` and the input is dropped, assert/diag (a drop must give feedback); "an AI to move acts within N s of its schedule" — page-side check in `aiKick` (debug: diag when `go` has re-armed > 20 times) — the first would fire in any game where the player taps quickly after a move; the second whenever the owner switches tabs during an AI turn — tags: `AS-input-never-dropped`, `AS-ai-progress`

### P27 — End screen ranks non-arrivals without saying why
- **Source:** playtest 2026-09-30 #30 ("End screen (official ending) ranks non-arrivals 2nd–4th 'Still in the jungle' without showing distance, so the order is unexplained").
- **Commits:** none. The places are right (engine `progress`, engine_rules.js:360-372); the dialog shows only "Still in the jungle" (dialogs.js:42). `8ff7ecd` removed distance figures from the replay at the owner's request (09-30 14:49: "a completely meaningless thing").
- **Symptom / Mechanism:** the engine sorts non-arrivals by shortest step count; the results dialog doesn't show the key.
- **Root cause:** the page shows the engine's result without the reason for it.
- **Design decision:** how to explain the official-ending order was not specified (and distance figures were removed elsewhere on the owner's word) — tags: `DD-no-spec`
- **Siblings:** none.
- **Recommended design fix:** owner to decide (e.g. "3 spaces from El Dorado"); if shown, the engine returns the ranking key with the places, so the page doesn't recompute rules.
- **What we did:** **NOT FIXED** (product decision pending with the owner)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** none possible: a product choice — tags: `AS-none`

### P28 — Buy mode: pay slot and paid cards float over the board; the raised card covers the counter; Treasure Chest's value vs cost
- **Source:** playtest 2026-09-30 #31 ("the pay slot and paid cards float over the middle of the board; the raised hand card covers the '0 / 3' counter; Treasure Chest's big '4 COINS' (value) vs small corner '3' (cost) reads as a mismatch"); its two-line prompt is P10.
- **Commits:** `f72f961` (09-26: the purchase slot and spending tray added to `layoutCards`; editor: first cited as `e6ae810`, which has no `buySlot`) · `b6b907c` (as now). Not fixed.
- **Symptom:** during a purchase the card being bought and the paid cards sit in the middle of the board, and a raised hand card hides the payment counter.
- **Mechanism:** `layoutCards` places `#buySlot` and the tray at fixed offsets above the hand (`by = H - ch*1.02 - 14 - bw*1.4 - 26`, tray to its right: hand.js:41-49), over the board; a lifted/hovered hand card (z 60–90) overlaps the slot's counter. The card-face question is art/content.
- **Root cause:** purchase UI placed by arithmetic over the play area, without a cell or clearance of its own.
- **Design decision:** UI floated over other content instead of given its own layout cell (CLAUDE.md: "Never float new UI over other controls") — tags: `DD-float-over`
- **Siblings:** P29 (market preview over Menu, All cards X over Menu), P18 (banner), the 09-26 "all cards thing overlaps the end turn thing".
- **Recommended design fix:** the purchase gets its own region (e.g. the market column or a reserved band above the hand, with `--clearance` like `--mktFoot`), so nothing else is placed there; the Treasure Chest face is the owner's call.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed). test/layout.cjs checks overlaps only in normal play and replay, not in buy mode.
- **Assertion that would have caught it:** "no two interactive or informational controls overlap, in every mode" — test tier: run test/layout.cjs's overlap check also in buy, pay-by-drag, hover and All-cards states and at 1536×639 — would have fired in the test on the first purchase state — also catches P29 — tags: `AS-no-overlap`

### P29 — Market hover preview spills over Menu; its badge is clipped; the All cards X sits over Menu
- **Source:** playtest 2026-09-30 #32 ("Market hover preview spills over the Menu button, and its count badge is clipped at the top edge") and #27, last part ("The All cards close (X) sits exactly over Menu").
- **Commits:** `7346c68` (`#mkt .mslot:hover{transform:scale(1.9)}`; editor: first cited as `e6ae810`, but `git log -S` finds it first in `7346c68`, as A18 says) · `d683178` (the All cards overlay). Not fixed.
- **Same bug as:** A18 — the ×1.9 market hover preview from `7346c68`, reported in the playtest (#32)
- **Symptom:** hovering a market card covers Menu and cuts off its count badge; the overlay's X is where Menu is, so a double click can hit Menu.
- **Mechanism:** hover scales the slot 1.9× about `transform-origin:100% 25%` (shell.html:243-244) with no room reserved; `#allc` is `position:absolute; inset:0; z-index:40` over the game area (shell.html:264), its X in the same corner as Menu.
- **Root cause:** transient enlargements and overlays drawn on top of the controls around them.
- **Design decision:** UI floated over other controls instead of placed in its own cell/clearance — tags: `DD-float-over`
- **Siblings:** P28, P18, the 09-26 "all cards thing overlaps the end turn thing", P11 (a place whose meaning changes under a repeated tap).
- **Recommended design fix:** the preview opens into space reserved for it (e.g. a fixed preview slot beside the market) and the overlay's close button sits in the overlay's own header, clear of the HUD; or the HUD stays above overlays.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** as P28 (overlap check in hover and overlay states), plus "a control never appears under the point of the last tap within ~400 ms" (P11) for the X/Menu case — tags: `AS-no-overlap`, `AS-hit-test`

### P30 — Idle hand: 4 cards overlap while half the bottom edge is empty
- **Source:** playtest 2026-09-30 #33 ("Idle hand (others' turn): 4 cards overlap until the 3rd is ~90% hidden while half the bottom edge is empty").
- **Commits:** unknown.
- **Symptom:** during others' turns the hand is bunched, one card almost hidden, with empty space beside it.
- **Mechanism:** not traced. `layoutCards` spaces 4 cards by `min(.86cw, max(.32cw, (avail - cw)/3))`, centred at `W/2` (hand.js:36-47); at 1536 px that is `.86cw` (no heavy overlap), so the observed layout doesn't come from the normal path. Hypotheses, not verified: a stale `geo.app` width (cards bunched and off-centre), a card left with the `free` class after a drag (skipped by layout, hand.js:45), or cards stuck with `__enter` at the deck.
- **Root cause:** unknown.
- **Design decision:** unknown — tags: `DD-untested-real-setup` (test/layout.cjs's "every hand card at least half visible" check never runs at the owner's 1536×639, nor during another player's turn)
- **Siblings:** P13 (hand layout from the wrong list).
- **Recommended design fix:** reproduce at 1536×639 @1.25 in another player's turn first.
- **What we did:** **NOT FIXED** (not traced)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "every card in the hand is at least half visible" — exists in test/layout.cjs; add the owner's size and an others'-turn state; always-on variant in `layoutCards`: every fan card's computed x is within the fan and neighbours are ≥ `.32cw` apart — tags: `AS-view-matches-state`

### P31 — Undo snaps the explorer back with no animation
- **Source:** playtest 2026-09-30 #34, first part ("Undo snaps the explorer back with no animation").
- **Commits:** `e6ae810`/`b6b907c` (undo rebuilds from the record) · `a799442` Room: undo uses the engine's recUndo (same online). Not fixed.
- **Symptom:** after Undo the explorer jumps to its previous space.
- **Mechanism:** local `undo()` sets `S = recUndo(G.rec)` (the whole record replayed minus the last action) and renders (actions.js:213-219); no events are produced, so `pieces.update()` sees a changed position with no walk and places it (pieces.js:48: "the game jumped … no animation"). Online the Room does the same and `sendAll()` without events (worker.js:520-522).
- **Root cause:** undo is a new state with no events describing the change, so the view has nothing to animate.
- **Design decision:** state changes that the view shows can arrive without events (undo, reconnect, replay steps back), and the view treats "no event" as "jump" — tags: `DD-animation-coupled`
- **Siblings:** P9 (undo also replays the whole game); online undo; a resync after a bug; replay stepping back.
- **Recommended design fix:** the engine's undo returns inverse events (e.g. a `move` back along the path), or the view animates any position change of a drawn explorer by default and only a declared jump (new game, replay seek) skips it.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "a state change the view shows comes with events it can animate (or is declared a jump)" — debug tier in `pieces.update()`: a drawn explorer's position changes without a walk and without a declared jump → diag — would fire on every Undo after a move — also flags reconnect and resync jumps — tags: `AS-events-explain-change`

### P32 — Exit replay dumps you on the start screen, not the results
- **Source:** playtest 2026-09-30 #34, second part ("Exit replay dumps you on the start screen, not the results").
- **Commits:** `3c496d1` (replays from the results dialog) · later edits to `exitReplay`. Not fixed.
- **Symptom:** Results → Watch replay → Exit lands on the start screen.
- **Mechanism:** `startReplay` records `from = MENU.dlg.open ? MENU.screen : null` (replay.js:57); the results dialog isn't a menu screen, so `from` is null and `exitReplay` goes to `showSetup()` (replay.js:89-92).
- **Root cause:** "where to go back to" is a hand-kept value that knows only menu screens.
- **Design decision:** navigation state as a hand-set flag (`replay.from`) instead of a screen stack or a rule derived from what was on show — tags: `DD-ui-flags`
- **Siblings:** P4 (overlays left open), P5 (a screen chosen from a placeholder), `showMenu`'s own branching (menu.js:51).
- **Recommended design fix:** opening a replay pushes what is on show (menu screen or results dialog) and Exit pops it; one navigation function for every "go back".
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** no runtime invariant is natural here; a flows test "Exit returns to where the replay was opened from" (results, My games, Online) — would fail on the results case — tags: `AS-none`

### P33 — Rules are one long wall, Online/AI paragraphs before the turn rules
- **Source:** playtest 2026-09-30 #35.
- **Commits:** none (`showRules`, dialogs.js). No defect.
- **Symptom / Mechanism:** the rules dialog is one text block in the order it was written.
- **Design decision:** (also the root cause) the rules page's structure was never specified — tags: `DD-no-spec`
- **Siblings:** none.
- **Recommended design fix:** owner to decide (turn rules first; sections).
- **What we did:** **NOT FIXED** (product decision pending with the owner)
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** none possible: content choice — tags: `AS-none`

### P34 — Stray 18×2 px dash in the online prompt during AI turns
- **Source:** playtest 2026-09-30 #36 ("Online prompt during AI turns shows the empty turn-clock element as a stray 18×2 px dash").
- **Commits:** `e6ae810` (`.timer{display:inline-block}`). Not fixed.
- **Symptom:** a small dash left of "is playing…".
- **Mechanism:** the empty `<span id="turnTimer" class="timer" hidden>` (hud.js:81) is shown because `.timer{display:inline-block}` (shell.html:235) overrides the UA's `[hidden]{display:none}`, so its padding (9 px × 2 wide, 1 px × 2 tall) draws.
- **Root cause:** author `display` rules beat the `hidden` attribute.
- **Design decision:** instead of one global `[hidden]{display:none!important}`, the trap is patched element by element: `#menu [hidden]`, `#feed[hidden]`, `#allc[hidden]`, `#buySlot[hidden]`, `#choice[hidden]`, `#lside[hidden]`, `#rdock[hidden],#rside[hidden]`, `#rdock button[hidden]`, `.seg.modes[hidden]` (shell.html:33, 57, 219, 265, 306, 310, 380, 400, 420) — tags: `DD-per-element-patch`
- **Siblings:** any new element with a `display` rule and `hidden` (the next one will repeat it).
- **Recommended design fix:** one global rule `[hidden]{display:none!important}` and delete the nine per-element patches.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "every [hidden] element has no layout box" — debug tier, after each frame: `document.querySelectorAll('[hidden]')` each has `getClientRects().length === 0` — would fire in any online game at the first AI turn — also catches every future `[hidden]` override — tags: `AS-hidden-no-box`

### P35 — Orphaned localStorage from older versions is never cleaned
- **Source:** playtest 2026-09-30 #37 ("`eldorado-save-v4` 10 KB, `-v5` 5 KB, `-side`, `-rexp` … never cleaned").
- **Commits:** key renames over time (e.g. `eldorado-rspeed2`, `f0c51f3`; `eldorado-game-v2`) · `d0be19c` Remove dead migrations (removed the page's per-load `-v1` removal line). Not fixed.
- **Symptom:** dead keys (~15 KB) stay in the owner's browser forever.
- **Mechanism:** storage formats are versioned by renaming the key; the old key is abandoned; the page's keys are string literals spread over seven modules (state.js, menu.js, feed.js, market.js, replay.js, sound.js, online.js) plus a duplicate of the save key in shell.html's head script (shell.html:594).
- **Root cause:** nothing knows which keys the page owns, so nothing can remove the ones it no longer uses; the one removal line that existed was a per-version migration patch.
- **Design decision:** no single owner/registry of the page's persistent storage — tags: `DD-multi-source-truth`
- **Siblings:** the save key written in two places (state.js:36 and shell.html:594: `DD-multi-source-truth`); any future rename.
- **Recommended design fix:** one storage module that lists every key the page uses; at boot it removes any `eldorado-*`/`ed-*` key not on the list (no per-version code).
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing (not fixed)
- **Assertion that would have caught it:** "the page's storage holds only keys it owns" — debug tier at boot: every `eldorado-*` key is in the registry (diag otherwise) — would fire on the owner's first visit after any rename — tags: `AS-storage-owned`

## Unsolved, found 2026-09-30 outside the playtest

### U1 — Tests that silently skip their own checks
- **Source:** found by Claude (2026-09-30, writing test/taps.cjs: its first version skipped the "tap on my explorer" check in every 3-player game, because each player has one explorer, and still printed "taps ok")
- **Commits:** `3ea4f51` (taps.cjs: skipped check replaced by one that always runs, before commit). Still present: test/online.cjs:60, test/flows.cjs:77, test/lint.mjs:13.
- **Symptom:** a test run prints "ok" while a check it claims to make never ran: online undo is "not checked" whenever the dealt first player has no move (online.cjs:60); flows skips the buy step when nothing is affordable (flows.cjs:77); lint passes when ESLint isn't installed (lint.mjs:13).
- **Mechanism:** the check is inside an `if (setup found) … else console.log('skip')`; the log line is buried in output nobody reads, and the step still reports ok.
- **Root cause:** the tests depend on what a random deal happens to give them, and treat "this deal can't show it" as a pass.
- **Design decision:** tests take whatever the random deal gives instead of constructing the state they need; a missing precondition is a skip, not a failure. — tags: `DD-silent-failure`
- **Siblings:** any test that searches deals for a situation (taps.cjs, flows.cjs "a deal where the person moves first", online.cjs); a regression in undo or buying could ship while every run is green.
- **Recommended design fix:** tests set up the state they need (seeded deals chosen once, or a state built directly, as taps.cjs now does), and a check whose precondition can't be met FAILS; no skip paths.
- **What we did:** **NOT FIXED** (taps.cjs fixed in place before its commit; the other three remain)
- **Ratchet:** nothing
- **Assertion that would have caught it:** "every check a test names ran": the report helper counts registered vs executed checks and fails on a difference — test tier — fires on every skipped run — catches every silent skip in every test file — tags: `AS-no-silent-catch`

### U2 — botChoose silently plays a different AI when the network is missing
- **Source:** found by Claude (2026-09-30, zero-tech-debt pass)
- **Commits:** none (engine_bot.js:317 `if(mode==='net'&&!botNetReady(gs))mode='heur'`)
- **Symptom:** asked to play with the neural network on a course it wasn't trained for (or with no network loaded), the bot quietly plays the heuristic instead; nothing says so. aiChoose (engine_ai.js) has its own, different fallback (to the planner), so the two entry points disagree.
- **Mechanism:** a runtime downgrade inside botChoose, relied on by the training bootstrap (tools/ai/gen.mjs run with no network).
- **Root cause:** "which AI plays" is decided in two places, each with a silent default.
- **Design decision:** silent fallback instead of the caller choosing explicitly. — tags: `DD-silent-failure`, `DD-two-mechanisms`
- **Siblings:** the old `Math.random` defaults and the planner default holder (both removed 2026-09-30, 7bbe187 / 0ed43a9).
- **Recommended design fix:** botChoose asserts the network it's asked to use is ready; callers (training bootstrap, aiChoose) pick the heuristic or planner themselves.
- **What we did:** **NOT FIXED** (owner's OK requested: it touches the stopped training code)
- **Ratchet:** nothing
- **Assertion that would have caught it:** "a bot plays the mode it was asked for": assert in botChoose — always-on — fires the first time a tool or AI requests `net` without a fitting network — catches every silent AI substitution — tags: `AS-no-silent-catch`

### U3 — 42 empty `catch {}` blocks in page and server
- **Source:** found by Claude (2026-09-30, tracing playtest #21)
- **Commits:** none
- **Same bug as:** P19 — U3 is the class (42 empty catches), P19 its measured instance (the socket close with code 1005)
- **Symptom:** failures vanish: the room's socket close with code 1005 threw inside `try { ws.close(code) } catch (e) { }` and a departed player stayed "online" 10 s (playtest #21, measured 10,010 ms vs 5 ms).
- **Mechanism:** errors are caught and dropped with no report (13 in src/worker.js, 29 in src/client/*).
- **Root cause:** "must never crash" was implemented as "never let anything throw", instead of one boundary that reports.
- **Design decision:** swallow errors locally, contrary to docs/ASSERTIONS.md's own principle (real checks only where failure is allowed; one boundary per entry point). — tags: `DD-silent-failure`
- **Siblings:** playtest #21; any send/close/storage failure; bugs we have never seen because they were swallowed.
- **Recommended design fix:** keep catches only around operations allowed to fail (storage in private windows, a socket already closed), each catching that specific failure and saying why; everything else reaches the boundary.
- **What we did:** **NOT FIXED**
- **Ratchet:** nothing
- **Assertion that would have caught it:** lint: no empty catch without a marked reason — test tier (test/lint.mjs) — fires on every run until each catch is justified — catches the whole class — tags: `AS-no-silent-catch`

### U4 — Late-game hand-offs slower (playtest #8): not reproduced
- **Source:** playtest 2026-09-30 #8; investigated by Claude
- **Commits:** none
- **Same bug as:** P8 — the late-game hand-off hitches of playtest #8, not reproduced
- **Symptom:** from round ~11, nearly every turn change had a 100–200 ms frame (tester, Chrome 154 on Windows).
- **Mechanism:** unknown. On the current build (headless Chromium, 4× CPU throttle, 1536×639 @1.25) round 13 was not worse than round 2 (12 vs 28 slow frames); DOM stays ~3.4k.
- **Root cause:** unknown. Differences from the tester: older build (full-screen turn banner; a history mode with a column of every turn, both changed since), real GPU vs software raster, Chrome 154 on Windows.
- **Design decision:** unknown until reproduced; the per-turn wholesale rebuild of the history panel and hand (playtest #7/#9) is the leading suspect. — tags: `DD-untested-real-setup`
- **Siblings:** playtest #7, #9.
- **Recommended design fix:** measure in the owner's Chrome on the current build before changing anything.
- **What we did:** **NOT FIXED** (needs one Performance recording from the owner)
- **Ratchet:** nothing
- **Assertion that would have caught it:** frame budget per hand-off, measured early and late in the same game — test tier (test/frames.cjs extension) — tags: `AS-frame-budget`

---

## Appendix: the tags


Every tag that appears in an entry's **Design decision** or **Assertion** field after editing: 23 design-decision tags
and 27 assertion tags. The number after each tag is how many entries carry it. Tags marked *new* are not in BRIEF.md's
base list; each replaces one or more `DD-new:` / `AS-new:` tags the agents invented (mapping at the end).

### Design decisions (23)

- `DD-no-spec` (35) — behaviour never specified (rule unclear, UX undecided, product choice not asked), so the code guessed.
- `DD-process` (32) — a working-process failure: ignored or paraphrased instruction, shipped unverified, argued with a bug report, questions queued behind work.
- `DD-silent-failure` (24) — swallowed errors, empty catch, silent fallback or substitution, silently dropped input.
- `DD-content-sized-layout` (19) — sizes and positions follow content or siblings, so a text change moves things.
- `DD-per-element-patch` (19) — a general trap patched element by element or case by case instead of once (includes validation by blacklist).
- `DD-multi-source-truth` (19) — the same data stored or computed in two or more places that drift (includes storage keys spread as literals).
- `DD-untested-real-setup` (17) — only tested headless, local or fast, never in the owner's real browser, device, network or window size.
- `DD-imperative-sequencing` (13) — correctness depends on call order or timing (setTimeout, rAF ordering, races, check-then-await).
- `DD-float-over` (13) — UI floated over other controls or the board instead of having its own layout cell.
- `DD-server-first` (12) — the page waits on the network for what it knows locally, or picks a screen before the data that decides it.
- `DD-two-mechanisms` (10) — two systems answer the same question and disagree.
- `DD-rules-outside-engine` (9) — rules or rule-derived logic duplicated in the page, the bot, the tools or the server.
- `DD-ui-flags` (8) — UI state as independent switches reset by hand in several places, not derived from game state or mode.
- `DD-whole-rebuild` (8) — views rebuilt wholesale instead of updating what changed; heavy DOM.
- `DD-work-in-reply-path` (7) — a reply waits behind unrelated work; time budgets on a clock that doesn't move.
- `DD-animation-coupled` (7) — animation owns or gates state or input, or state changes arrive without events the view can animate.
- `DD-unverified-data` (5, *new*) — game data (tiles, courses, blockade costs) typed in or guessed from images and shipped without a machine check against the published source.
- `DD-global-state` (5) — module-global mutable state, swap patterns, shared caches, hand-written partial clones.
- `DD-compat-path` (5) — an old path, fallback, default or record format kept alive.
- `DD-board-inherits-ui-state` (4, *new*) — UI state (CSS variables, classes, inherited properties like `cursor`) written on an ancestor of the ~3,800 board elements, so a UI change restyles the whole board.
- `DD-no-budget` (4, *new*) — a resource (CPU per move, disk, page bytes, test time) is never measured against a budget, so it grows until someone complains.
- `DD-unvalidated-model` (3, *new*) — an AI model's output is used for decisions or shown to the player where it was never trained or validated (mid-turn positions, one action at a time), with no stated contract for what the number means.
- `DD-dense-lines` (2, *new*) — several statements packed on one line with trailing comments, so an edit silently turns code into comment.

### Assertions (27)

- `AS-none` (48) — no assertion possible (a product choice, a process property, a pixel of a cross-origin frame); the entry names the test, budget or review instead.
- `AS-view-matches-state` (28) — per frame: UI state is valid for the game state (an overlay or cue only in the mode that uses it, the shown screen matches its data, a figure the page shows equals the engine's).
- `AS-layout-shift` (20) — debug: nothing on screen moves or resizes without an animation or a direct action.
- `AS-no-silent-catch` (14) — lint/assert: no empty catch and no silent fallback, default, substitution or skipped check; every failure is reported (broadened by the editor to take in AS-new:no-compat, no-silent-skip, requested-mode).
- `AS-no-overlap` (13, *new*) — debug/test (reads layout): every control, label and dialog the current state shows exists, lies fully on screen, is not covered by or overlapping another drawn thing (at rest, hovered, enlarged, animating, in every mode), and its text fits its box.
- `AS-frame-budget` (13) — debug/test: no frame over N ms for an interaction, and input latency within budget.
- `AS-latency-budget` (13) — test with a delayed network, or a count-based server budget: local things show before any reply; a reply is not behind other work.
- `AS-rules-vs-rulebook` (11) — a rules or data check against the rulebook and the published catalogue (test tier).
- `AS-engine-invariant` (11) — rule invariants: cards conserved, legal state after every action, turn order, who may send an action, room invariants.
- `AS-training-health` (10, *new*) — per training batch or experiment run: setups are the configured ones (player counts, balanced seats), every mechanism is exercised at a minimum rate, the model is healthy (dead units, a warm start reproduces its parent, no stale weight cache), the report's numbers are self-consistent and the progress metric agrees with head-to-head; otherwise the run stops loudly.
- `AS-ai-progress` (10) — AI games always finish; an AI turn ends within N decisions; an AI explorer keeps advancing; an AI job reports progress.
- `AS-dom-churn` (9) — debug: per-region budget of elements written or restyled per interaction (write only what changed).
- `AS-matches-engine` (6, *new*) — anything the page, the bot or the tools derive about a game (highlights, settled places, training targets, a plan's predicted state, win/loss) equals the engine's answer for the same state.
- `AS-hit-test` (5) — a tap on a target is a move: input maps to what was drawn at that point when the tap began (no control appears under a pending second tap).
- `AS-input-never-dropped` (5) — on my turn, input is never silently ignored.
- `AS-events-explain-change` (5) — a state change the view shows comes with events it can animate (or is a declared jump).
- `AS-record-replays` (4) — a game's record replays to the same state; every listed replay plays.
- `AS-provenance` (4, *new*) — shipped or compared data (AI ratings, promotion results, ladder identities) carries the id of the network and rules it was measured with, and a check refuses a mismatch or a duplicate.
- `AS-server-reply` (4) — every client message is answered, first; sockets close cleanly.
- `AS-model-contract` (3, *new*) — a model is evaluated only on inputs of the kind it was trained on, and a number it produces means what its label claims (calibrated, consistent between consecutive decisions with nothing random in between).
- `AS-deploy-landed` (2, *new*) — after a push, the production bundle builds and the live site reports the pushed commit within N minutes, or the change loop reports a failed deploy.
- `AS-visual-continuity` (2, *new*) — test tier: what is on screen changes only by the intended motion (grabbing the board changes no pixel but its position; an element visible before and after a hand-off is visible in every frame between).
- `AS-resource-budget` (2, *new*) — CPU per unit of work and disk growth per iteration stay under a recorded budget.
- `AS-alignment` (2, *new*) — test: members of one row share a size token and an edge or centre line; state changes (active, hover) never change geometry.
- `AS-redaction` (2) — hidden information never leaves the server; events reveal exactly what the redacted state reveals.
- `AS-hidden-no-box` (1) — debug: every `[hidden]` element has no layout box.
- `AS-storage-owned` (1, *new*) — debug at boot: every stored `eldorado-*` key is one the page lists as its own.

### Mapping from the agents' tags

| Agent tag | Canonical tag | Entries |
|---|---|---|
| `DD-new:board-inherits-ui-state` | `DD-board-inherits-ui-state` (also added to E5, the same bug) | B3, B5, B6, E5 |
| `DD-new:decision-unit-too-small` | `DD-unvalidated-model` | B11 |
| `DD-new:unvalidated-model-output` | `DD-unvalidated-model` | H1, H2 |
| `DD-new:hand-transcribed-data` | `DD-unverified-data` (also replaces `DD-no-spec` on A2, A3, A6, A9, whose decision text is this one; A9 is the same bug as C16) | C16 |
| `DD-new:unbounded-growth` | `DD-no-budget` | C13 |
| `DD-new:no-perf-budget` | `DD-no-budget` (also added to D12 and E10, whose decision text says "no budget") | C17 |
| `DD-new:dense-lines` | `DD-dense-lines` (also added to D11, the same comment-swallows-a-line trap in loop.sh) | F16 |
| `DD-new:no-authority-model` | `DD-per-element-patch` (validation by blacklist) | E14 |
| `DD-new:no-storage-owner` | `DD-multi-source-truth` (key literals in seven modules plus a copy in shell.html) | P35 |
| `AS-new:deploy-landed` | `AS-deploy-landed` | A1, A22 |
| `AS-new:matches-engine` | `AS-matches-engine` | A10, A31, A32 |
| `AS-new:value-consistency` | `AS-matches-engine` (B9, B16, B20) / `AS-model-contract` (B11) | B9, B11, B16, B20 |
| `AS-new:training-health`, `AS-new:model-invariant`, `AS-new:report-consistency` | `AS-training-health` | A23, A26, A27, D5, B14, B17 |
| `AS-new:tooling-check` | `AS-training-health` (C1, C2, C18, C20) / `AS-provenance` (C7, C12) | C1, C2, C7, C12, C18, C20 |
| `AS-new:provenance` | `AS-provenance` | E15, H3 |
| `AS-new:model-contract` | `AS-model-contract` | H1, H2 |
| `AS-new:resource-budget` | `AS-resource-budget` | C13, C17 |
| `AS-new:no-overlap`, `AS-new:controls-reachable`, `AS-new:on-screen`, `AS-new:text-fits` | `AS-no-overlap` | A12, A15, A18, B1, B2, C9, D9, D10, D20, G1, P18, P28, P29 |
| `AS-new:no-tap-through` | `AS-hit-test` | P11, P29 |
| `AS-new:alignment` | `AS-alignment` | D8, D10 |
| `AS-new:grab-is-pure-transform`, `AS-new:visual-continuity` | `AS-visual-continuity` | B7, F3 |
| `AS-new:no-compat`, `AS-new:no-silent-skip`, `AS-new:requested-mode` | `AS-no-silent-catch` (broadened) | F32, U1, U2 |
| `AS-new:storage-owned` | `AS-storage-owned` | P35 |

---

## Notes from the analysis

**Part A:**

**Counts:** 34 entries (A1–A34).

**Suspected duplicates in other chunks**
- A9 (tiles I/N): fixed 09-27 in `0ade920` — the 09-27 chunk may list it as "found by Claude".
- A10 (`affordable()` ignoring a pending removal): same root and fix as `fb7dd0d` (09-29, "a buy could get stuck after a Travel Log or Scientist") — likely an entry in the 09-29 chunk; merge.
- A11 = playtest 2026-09-30 #23/#27 (and sibling of #13): the 09-30 chunk will have them; A11 records where the big-slot warning was introduced (`a304ba6`).
- A14 = playtest #4 (introduced here in `d683178`).
- A15: the replay-dock half is fixed 09-27 in `f0c51f3`; the 09-27 chunk may list that commit.
- A16 sibling: `720331d` adds one more instance of playtest #29 (a rubble drop during an explorer animation is silently ignored: `isDisc(tg)&&!UI.anim`, still `src/client/hand.js:171`).
- A17: fixed 09-27 `f77b242` — may appear in the 09-27 chunk.
- A18 = playtest #32 (introduced `7346c68`).
- A19: first-tap part fixed 09-28 `1f52aaf`.
- A22: the durable fix is `0a6cba4` (09-29).
- A25 = playtest #15 (introduced `f72f961`).
- A29: continued 09-27 (`eb26a18`) and 09-30 (`8e06048`, `fd58188`) — those chunks will likely have the Witch's Cauldron stalls; merge as one chain.
- A31: second half is `7ca1876` (09-27).
- A33: `9deac13` (09-29) and `bb4cc64` (09-29) may be entries there.

**Bugs introduced here but reported later (owned by their report day, noted here)**
- `d683178` put `backdrop-filter: blur(6px)` on `.alltile` (over the board) and on `#allc`; the jank the owner reported 09-27 was fixed in `2267837` ("no live blur over the board") and the rule entered CLAUDE.md. `d683178` also set `--mktH` on `document.documentElement` at runtime (a whole-page restyle; made a no-op one commit later in `7346c68`), and made `fit()` read the prompt's layout (`safeRect`), an early instance of the fit/zoom-jump family fixed 09-29 (`276792f`).

**Commits in this chunk with no bug of their own**
- `c01fcec`, `e6ae810` (unpacking; used for context), `be2c29a` (client ID into `wrangler.jsonc`), `9bbdd2c` (.gitignore), `cf2ec10` (merge), `f4cd2a3`/`1d37035` art (except A12), `be64663` (notes), `1cac13b` (colours: note the worker's `PCOLORS` stayed a second literal list until later — now `E.COLORS.map` at `src/worker.js:387`, fixed), `d7d41ce` engine speedups (reach neighbour cache; tests passed), `e9d7844`, `cd0612c`, `617db1c` (tooling), `3ab0316` (feature; its layout and silent-patch problems are in A15/A33).
- `35cc1b5` → `22a616b` (place values): a spec change, not a bug — the owner specified the ratio at 23:57 right after `35cc1b5` ("the first is worth four times what the second is") and `22a616b` implemented it a minute later.

**Queued owner messages (2026-09-26-queued.md), where they went**
- 19:22 → A1; 19:57, 20:00, 20:02 (red-icon crops), 20:06 → A6; 20:04 → A2; 20:18 → new A8; 21:00 → A20; 22:10, 23:06 → A23; 22:26, 22:27 → A26; 19:49, 19:50 → A27; 23:04, 23:09 → A29; 23:15 → A32.
- Not bugs (specs, requests, questions): 19:41/19:42 (courses: 10, then one for now), 19:46 (public rooms + auto match), 20:27/20:28 (card art: background art; "Don't use vector art … show me"), 20:59 (sound subagent spec), 21:36 (miniature preference; "40 games in about six seconds seems slow" — a question, answered by `d7d41ce`'s engine speedups), 23:14 (keep improving the heuristic), 23:55 (place values, implemented in `35cc1b5`/`22a616b`).
- 20:58 "move the full screen icon to where the other screen sizing icons are" — a placement request, done in `2047335`; not counted as a bug.
- 23:26 task notification: `tools/ai/h2h.mjs` crashed with an unhandled `EPIPE` on `console.log` (line 41) when the monitor reading its output closed; the results had already printed. A tooling bug (unhandled stream error); no entry, no fix found.

**Could not classify**
- Owner 19:05–19:07 ("Fetch and execute the appropriate instructions to set me up for Cloudflare …" then "All right, fine. We'll get to that later. Again, what's my first step?") suggests his question waited behind a failed attempt, but Claude's replies aren't in the record: unknown.
- Owner 19:16 pasted the OAuth client **secret** in chat; `be2c29a` records that the secret isn't used. Whether he was advised to rotate it is unknown; not a code bug.
- `9f3b07e` says "Fix: a comment had swallowed three feature groups (caught by the feature-size check)" — the diff against `ab4cace` shows no such comment, so it was introduced and fixed before commit; a good example of an existing assertion (`if(i!==BOT_NF)throw`) catching a bug before anyone saw it. No entry.

**Tags defined in this chunk** (renamed or merged by the editor; definitions in TAGS.md): AS-new:deploy-landed → `AS-deploy-landed`; AS-new:matches-engine → `AS-matches-engine`; AS-new:training-health → `AS-training-health`; AS-new:text-fits → `AS-no-overlap`; AS-new:no-overlap → `AS-no-overlap`.

**Part B:**

- **Tags defined here** (renamed or merged by the editor; definitions in TAGS.md): DD-new:board-inherits-ui-state → `DD-board-inherits-ui-state`; DD-new:decision-unit-too-small → `DD-unvalidated-model`; AS-new:controls-reachable → `AS-no-overlap`; AS-new:grab-is-pure-transform → `AS-visual-continuity`; AS-new:value-consistency → `AS-matches-engine` (B9, B16, B20) and `AS-model-contract` (B11); AS-new:report-consistency → `AS-training-health`.
- **Suspected duplicates in other chunks:** B1 with chunk A (09-26 23:47 "replay is covered over by the alt cards", 0c6a6f9, 2047335); B3/B6 with the 09-29 chunk (0a6cba4, b6b907c, 276792f); B18 with the 09-30 playtest entry #4 (same decision, different field); B21 with the later-09-27 chunk (owner asks again, fix 6f1fc88 at 18:30); B11 with whoever covers 08:43 ("did it fix that annoying bug"), TreeStrap/distillation (3e8b156, 2ecfd21, 68a5833); B15 with the later-09-27 chunk (ladder 96a2c58, e15fed2 two names); B2 with the 09-28 design-review chunk (item 5) and 09-29 (127544c).
- **Withdrawn report (not an entry):** 02:55 "When you use the travelog, you don't have the option to not trash anything" → 02:58 "Sorry, there was a mistake on my end. I was stuck in an animation. The bug that I was saying isn't real." Possibly related, hypothesis not verified: board clicks are silently dropped while an animation runs (`onBoardClick`: `if(UI.anim)return;` at 9f87d96's ui_view.js; today main.js:74 `if (!canAct() || cam.dragMoved || drag || UI.anim) return;`), i.e. input dropped without feedback (`DD-silent-failure`/`DD-animation-coupled`, `AS-input-never-dropped`). Sibling in time: fb7dd0d (09-29) "a buy could get stuck after a Travel Log or Scientist".
- **Suspected latent bug introduced in this chunk (hypothesis, not verified):** `9f87d96` (06:59, highlight the current player's miniatures) added a turn-glow ellipse (rx 28) and a marker triangle at y −44…−34 inside each SVG `.pin`; they are faded with `opacity:0` for other players, but SVG hit-testing ignores opacity, so every explorer's clickable area grew, the marker reaching toward the hex above, while taps were resolved by `e.target.closest('[data-t]')`. This is an early form of playtest 09-30 #3 ("explorer figures swallow taps on the hex above"), fixed ROOT in 3ea4f51.
- **Owner instruction followed as asked:** 01:54 "I'd prefer if you did it on a background thread" — done (subagent), but see B12.
- **Spec corrections, not bugs:** 01:33 ("round shouldn't just be round … two turns out, five turns out … 10 turns out") → c54dc36; 03:24 "try getting rid of the new non searched addition to training" → 7fdc12d.
- **Commits in this chunk that fix nothing (features/tools/notes):** 10dc640, de5d42d, 985d508 (gift-card exploration; replaces forced random buys the owner called a hack at 08:10, outside this window), 9749715, 500c41e, 590efc8, c54dc36, 5706295, aedbec6, d15c303, 126aa13, 480e28b, 1e33167, 59d12cb (feature; introduced B14/B17), f7dd7ed, 386575d, 7fdc12d, 6871a25, 6890f5a, 468fd1c, cdca339, 74893d4, 187e6cb, 961f83e (B11), 9f87d96 (feature; see hypothesis above), 1accb75.
- **Fix commits in this chunk for bugs reported on an earlier day:** `f0c51f3` fixes a bug reported 2026-09-26 23:47 ("The replay is covered over by the alt cards in the same layout error as before"), as well as this window's 00:00 report (B1).
- **Commits I could not fully classify:** `2267837`'s `hoverShown` flag (skip clearing an empty SVG group because clearing re-lays out the board) — a HACK around whole-group rebuilds; the current overlays code writes only what changed, so it is moot. `f7f63a4` changed render.cjs check 2 to the new architecture (legitimate test update, not a weakened test). `63c9433` (09-29, outside the chunk) weakened the latency check from p95 to median.

**Part C:**

**Fix commits in this chunk for bugs reported before 08:05 (other chunk's entries):**
- `6f1fc88` fixes a bug reported 2026-09-27 07:22 ("The test of DeepSearch seems to have stalled out."; the owner asked again at 18:27: "see if you can fix the deep bug"). Mechanism from the diff: `botDeepChoose`'s loop ran `while(live.length>1 && BOT_EVALS-e0<o.budget)`; playouts that end the game at once cost no network evaluations, so the budget never ran out. Fix: `rounds++<8` cap plus a 20,000-action cap in `tools/ai/deep.mjs` — two magic-number caps (HACK); the termination still rests on a cost counter that doesn't count all work (`DD-imperative-sequencing`/`DD-work-in-reply-path`-like "budget on a clock that doesn't move", the same shape as C5). It took 11 hours from report to fix.
- The "annoying bug" (reported 07:32: move-first vs buy-first inconsistency; the owner re-asked in this window at 08:43, 08:51 and 18:19 "Did the distillation help with that annoying bug?"): TreeStrap (`3e8b156`, `c6f13b7`, `981a8bd`) "fixed the move-first bug partly (17% → 44% vs 59%), but −50 Elo" and was stopped; search distillation (`2ecfd21`, `68a5833`) was said to "help it more over time" (SUMMARY.md) — unverified. Belongs to the 07:32 entry.
- `b2b69a9` (supervise.sh: restart the loop if its log is unchanged for 15 min) answers the owner's 09:24 request. It is a retry/watchdog (restarts rather than diagnoses); `66f2107` (09-28) later made the watchdog respect a halt file "so the cause gets found instead of patched".

**Suspected duplicates with other chunks:** C3 (`00079c1`, 09-29 chunk); C5 (`a230101`, owner's 09-30 report); C6 (`199a124`, 09-30); C7 (`f0b69b5`, 09-29); C8's later UI churn and discard counts (`d51aa25`, `0101346`, `1f27789`, 09-29/09-30); C10 (`9e85226`, `0101346`, 09-30); C11 (`a17086a`, 09-28); C18 and C20 (`40e7eb2` … `dcce26a`, 09-28 chunk); C19 (`8e06048`, `fd58188`, 09-30).

**Not counted as bugs (and why):** the multi-course network lagging the specialist (`96b45f7` course one-hot at the owner's 19:41 suggestion, `027c9e9` widening, abandoned for one map on 09-28 `0384790`) — an experiment outcome; the league run (stopped by the owner 19:20); the anneal run's −62 Elo (`8278fd1`, the owner's own experiment, stopped under his "if it's getting worse, then don't run it" rule); the owner's 08:39 question about server-side AIs (Claude proposed the deviation before building it and he agreed at 08:41 — not an ignored instruction); 19:48 "Try again" (unknown what failed).

**Latent risks introduced here, no bug seen:** `37cfd2e` kept v4 saves loading beside v5 (`DD-compat-path`; removed with game records `b3e9fd0`); `687b8cc` runs every room's AI through the module-global `E.S`/`BOT_PLAN_CACHE` swap (`DD-global-state`; removed `4a150c4`/`bd57d14`); local AI pacing polls `UI.anim` every 120 ms (`src/client/ai.js:27`, `DD-animation-coupled`, still there); `2f4ee78` (09-30, an AI's first move before a hidden tab drew the board) is a later-reported bug downstream of `687b8cc`'s server AIs moving at game start.

**Commits with no bug content:** `c6f13b7`, `5cc043d`, `47a2574`, `2ecfd21`, `981a8bd`, `7291ca8`, `6812104`, `d673619`, `3c857ab`, `44e8f02`, `c7876d2`, `98b7b2e`, `2f043cb` (new boards A, D, L, M; checked against the traverse rating by hand), `f0047d5`, `ca658d8`, `c3c3826` (metric change, see C2), `96b45f7`, `a005073`, `d8c7f27`, `24a53d3`, `027c9e9`, `d8b5745` — experiments, freezes, merges and features.

**Tags defined here** (renamed or merged by the editor; definitions in TAGS.md): DD-new:hand-transcribed-data → `DD-unverified-data`; DD-new:unbounded-growth → `DD-no-budget`; DD-new:no-perf-budget → `DD-no-budget`; AS-new:tooling-check → `AS-training-health` (C1, C2, C18, C20) and `AS-provenance` (C7, C12); AS-new:resource-budget → `AS-resource-budget`; AS-new:on-screen → `AS-no-overlap`.

**Part G:**

- **Queued messages that are not bugs (no entry):**
  - 01:31 ("The turn-based one doesn't need that much …", compute budget for the turn-depth search) and 08:30 ("test your tree sap idea. Freeze the current version …"): experiment instructions.
  - 01:32 ("did you push the latest graphics changes?"; again 02:33 in the main log): deploy-status questions. They show the owner had no way to see what was live; that belongs to A1's missing deploy observation.
  - 19:13 ("are you still using distillation? …"): a question; the multi-course run added distillation only at `d8b5745` (22:21).
  - 19:50 ("does the inputs of the neural net encode the entire map? How does it know how far a given square is from its location?"): a question. The per-course board blocks of `a3ea18a` encode every space; A21 is the earlier bug about this.
- **Task notifications (not owner words):** eight background commands "failed with exit code 144". By timing, each was stopped when Claude replaced the experiment, not a crash. Hypothesis, not verified: 144 is how the harness reports a stopped task.
  | Task | Stopped | What replaced it |
  |---|---|---|
  | `blz97zade` plain training | 07:39 | `961f83e` freeze first-td2 |
  | `bems77s6j` max-backup training | 08:10 | `2830376` (08:12) |
  | `bg8c0dm2d` exploration training | 08:33 | `3e8b156` (08:34) |
  | `bzufnh2ta` TreeStrap training | 08:52 | `c6f13b7` (08:52) |
  | `b881y3kwp` TreeStrap, 3 options | 09:27 | `981a8bd` (09:28) |
  | `blfwltbi5` search experiment | 01:45 | owner's 02:04 "Get rid of the other tests" |
  | `btbkbsi87` search experiment | 02:08 | owner's 02:04 "Get rid of the other tests" |
  | `bfouxi4yf` deep-vs-regular search | 07:30 | the owner's 07:22 stall report (B21); its root fix waited until 18:30 |
  - The 19:47 notice that the maps agent "terminated early … session limit" lost nothing: its work was already committed (`eb26a18`, merge `a005073`, 19:46). Contrast D18, where an agent's work was lost.
- **Subagent hand-backs in the queued file (model output, not owner reports):**
  - 01:42 pan/zoom research: the basis of `4f0c94d`; see B5/B8.
  - 02:34 planner audit: B16 `botClone`, B17 seat rotation; it arrived one minute before `dd369c4`.
  - 19:47 maps report: C16 boards I/N, C19 `aiFinishGuard`.
- **Possible latent issue from the 02:34 audit (hypothesis, not verified; no entry):**
  - The audit says "Search self-play ignores `temp` exploration. That's a design point, not a bug." In `83da069` (whose message says "exploration still applies"), `botChoose` returns the planner's move (engine_bot.js at 83da069, line ~296) before the softmax step (line ~307). Search self-play therefore lost its main "near-best options" exploration and kept only eps/typeEps/no-buy turns.
  - Unmeasured, but it is a candidate contributor to B15 (search training that "has been steadily getting worse"). The commit message overstated what the code did.
- **Suspected duplicates:** G1 and G2 share their fix commit (`f0c51f3`) with B1 and A15, and G2 is the same constant P17 later judged too slow. The whole 01:43 report belongs with A23/C1.
- **Tags:** none new (G1 uses `AS-no-overlap`, see TAGS.md).
- **Fix commits in this chunk for bugs reported on an earlier day:** none new. `f0c51f3` also fixes 09-26 23:47 (already in part-B notes). `985d508` follows up the 09-26 22:41/22:44 Transmitter reports (A23).

**Part D:**

**Suspected duplicates in other chunks**
- D29 = playtest 2026-09-30 #2 (introduced here by `525ea29`); D16 = playtest #16 (introduced by `3c496d1`); D13's second half (`63c9433`, test loosened) is a 09-29 commit (chunk E) — merge there if E wrote it.
- D12 overlaps playtest #17 (boot waterfall) and chunk E's 09-29 00:06 report ("it took like a couple of seconds to load") and `9c62c67` (Start re-render, 09-29 00:19 report).
- D9's final fix (`0a6cba4`) and D25's siblings (history panel rebuild) will appear in chunk E/F entries.
- D10 lists review items that later became playtest #12, #13, #15, #32; D8 and D21 share `DD-content-sized-layout` with playtest #12/#13/#14.
- D1/D18 recur on 09-29 (19:10, design agents on the main thread) and 09-30 (`237fd6f`).

**Fix commits here for bugs reported on an earlier day**
- `40e7eb2`, `d5cef48`, `66f2107`, `21d8679`, `6b595de`, `2a0a804`, `dcce26a`, `9d99fab` fix/patch the dead-units problem reported 2026-09-27 19:47 ("Remove the heuristic seats. And fix the dead units."). Sequence for that entry: **HACK `40e7eb2`** (auto-revive over 10% dead; owner 09-28 05:03, queued: "we don't want the dead neurons to show up again"; 05:10: "If they die, then there's something wrong. Don't revive them. Figure out what's wrong... you should have a bunch of warnings about the model quality") → **PARTIAL `66f2107`** (quality warnings + halt instead of revive) → `21d8679` BatchNorm + leak 0.03 (46/256 → 4–6/256 on a replay; owner 06:00: "why in the world are there still dead neurons? I thought you said it would be impossible") → `6b595de` measurement fix (dead units had been counted on the current batch, so short-horizon batches showed late-game units as dead: 17/256 vs 1/256 — a metric bug) → `2a0a804` / `dcce26a` thresholds tuned (30%, "only units killed by training": magic numbers) → revive used again at 09:19 (`9d99fab`; README: BatchNorm scale of dead units collapsed to ~0.02). Root cause never established; training paused 09-29 07:08 → **NOT FIXED** at root. Ratchet: train.py warnings/halt (an assertion in the tool). Tags: `DD-per-element-patch`/`DD-process`, `AS-training-health`.
- `c49a6ee` "self-play: only network seats give training samples" answers the 09-27 19:47 "Remove the heuristic seats".
- `0e2bdbb`'s bug had been present since `e6ae810` (09-26) but was first reported on 09-28 (D2).

**Not entries (features or specs, not defects)**
- Queued messages that are specifications, not defects: 05:26 (drop distillation, prioritise speed), 05:51 (no league test with the old models), 05:52 and 06:23 (caps 10 then 15), 19:25 (replays with a position evaluation), 19:33 (API spec + critique), 19:34 (undo never past new information; replays without undone moves), 20:31–20:32 (rewrite the API doc; breaking replays is fine, breaking models is not). 05:03 (retrain; fix the dead units by changing the regularisation layer) belongs to the 09-27 dead-units report below.
- 19:59 "your current account should be obvious from the menu" → account bar in `82b11a7`/`69b2191` (feature).
- 20:16 "Undo shouldn't reset your timer" → `c80f303` time bank: the server's undo never touched the deadline before (worker.js at `c80f303^`: undo restored `S` only; critique NOTE 19 agrees), so this was a specification of the new clock, not a bug. `c80f303` introduced the uncapped bank (`d.bank` carries over with no cap) = playtest #25.
- 20:16 "There shouldn't be that many endpoints... unused options should not be there" → API critique / later cleanups (a design request; siblings of D6's kept flags).
- 16:19 "I specifically told you that you can batch self-play on a GPU... So you don't have access to a GPU?" — the environment has no GPU; possibly a late disclosure (process), not a code defect.
- Critique B7 (resigning clears another player's undo): still true by design after `b3e9fd0` (engine_rules.js:95 marks any resignation as an undo boundary, since the record is linear); not listed as a bug.
- `1eb49b9` fixes a wrong freeze time in tools/ai/models/README.md (documentation typo).

**Introduced here, reported later (noted, not separate entries)**
- `4bc63f0` lengthened the pay prompt (part of playtest #12, buy mode wraps to two lines).
- `3c496d1` "Menu opens the start screen without ending the game": hypothesis, not verified, that this is where the menu stopped pausing the game (playtest #28, AIs keep playing under the menu).
- `7e0bcd1` lets one AI take several seats sharing one uid (`aiUid(A.id)`); lookups by uid return the first seat — latent, not verified.

**Commits with no bug content of their own** (freezes, docs, tools, features; several are cited above as context): `9d4ed02`, `d5cef48`, `1eb49b9`, `9d5d818` (live page, feature), `ca67da8`, `97e3ff5` (diagnostic), `6504287`, `ae31917`, `1ae38c7`, `4db6161`, `5f82397`, `22e1d0f`, `e5da637`, `1b4b150`, `7be66ae`, `a8dd4f6`, `52d7835`, `391d948` (API spec doc), `210ce71` and `b3e9fd0` (refactors; `b3e9fd0` makes D23's rollback exact). Every other commit of the day is cited in an entry.

**Tags defined here** (renamed or merged by the editor; definitions in TAGS.md): AS-new:no-overlap → `AS-no-overlap`; AS-new:alignment → `AS-alignment`; AS-new:model-invariant → `AS-training-health`.

**Part E:**

- **Tags defined here** (renamed or merged by the editor; definitions in TAGS.md): DD-new:no-authority-model → `DD-per-element-patch` (validation by blacklist is a case-by-case patch); AS-new:provenance → `AS-provenance`.
- **Suspected duplicates in other chunks:** E1/E2 (09-28: `1f52aaf` fonts, `525ea29` first-flight split, "the website should load really fast", "The start screen should not render without CSS"); E11 (09-28 `1f52aaf` already saw the p95 failure); E30 = 09-30 playtest #6 (`2f4ee78`); E33 later part = 09-30 history reports; E21 sibling = 09-30 #21; E6 sibling = 09-30 #4; E22 sibling = 09-30 #14; E19 siblings = 09-30 #5/#24/#28; E5/E7/E9 siblings = 09-30 #7/#10; E13's last step `0ed43a9` is 09-30; E22 possibly = 09-28 20:11 "weird overlap here" (image not inspected).
- **Fix commits in this chunk for bugs reported on an earlier day:** `690402e` fixes a font inconsistency whose cause was introduced 09-28 (`1f52aaf`) and discussed 09-28 23:58-09-29 00:01 (entry E1 here). No other 09-29 commit was found to target a pre-09-29 report; `bf321e8` continues 09-28's menu work (09-28 21:49 "theres no way to go back to local once you choose online" was fixed on 09-28 by `479f8dd`).
- **Owner requests that are features, not bugs (no entry):** End game button for local play (00:19, added in `9c62c67`); screenshots of the redesigns (00:19); Fawcett as a new AI level (04:32, `14cefe2`); evaluation panel shows the best turn (`be62bb1`); history panel to replace the journal (18:42, `9ffc034`); defensive-coding/assert audit and the boundary design (07:16-07:34: the audit itself found E23-E29).
- **Owner questions without a bug:** 01:37/01:41 "Is it pushed" (reflog: `0a6cba4` pushed 01:39:58; `d914b74` pushed 00:42, 6 min after "push those two changes"); 02:21 first-load limit; 04:32 "confirm that the logs you added don't slow things down" (`diag()` always appends to a 200-line array; the MutationObserver and slow-frame loop run only with ?debug — no measurement recorded in the repo); 05:39 average arrival; 18:38 whether UI recommendations were merged.
- **Refactors/cleanups with no user-visible bug (not entries):** `162da2e` (unused join message, start/undo events), `67818dd` (server no longer writes `S.owners`/`S.room` into engine state; time left instead of deadline+skew), `d591d6a` (state trim), `3cb8d21` (events folded), `9b4b2ac` (journal structured; one 120-entry cap instead of 200 engine / 120 server / 80 replays — a latent `DD-multi-source-truth` inconsistency fixed ROOT, no report), `7f11502` (dead bot code), `6e3084c`, `6970c01` (records validated in `replayCheck` instead of patched in `replayStart`: a latent silent repair, same family as E31), `ea69e53`, `a5be040`/`162c6d4` (one change path, one `clearSelection()` — note it omits `UI.allOpen`, the cause of 09-30 #4), `b7f69d8`/`c3891f7` (target rules moved from the page to the engine: latent `DD-rules-outside-engine`, sibling of E16), `cd17215` (per-room MAP instead of a shared cache: latent `DD-global-state`), `c3070ca` (10 ms refit timer → `fitSoon`, counted in E3), `2799387`/`0f8b68a` (CLAUDE.md named the wrong save key `eldorado-save-v5` vs code `eldorado-game-v1`: doc drift), `bb4cc64` (E13), `e99ab93`/`b69cd0e` (tool pre-approval).
- **Merges not classified separately:** `436d3e4`, `c7e6f43`, `f9c7aa7`, `e35440a`, `4658130`, `99abcbc`, `94fb769`, `e8e6445`; `4ccbb2f` and `a48c6ad` carry fixes counted in E21, E18, E29.
- **Observation for the whole document:** the 07:34-08:22 guard-removal pass (`8e1c02e`, `a936521`, `b59a1b0`, `1d798e0`) produced two false invariants within an hour (E29 caught by the online test; E30 shipped and reached the owner). The same pass reviewed and kept the empty catch in `Room.onClose` that caused 09-30 #21. Removing guards was verified only by the existing tests, which never ran a hidden tab or a closing socket.

**Part H:**

- **Tags defined here** (renamed or merged by the editor; definitions in TAGS.md): DD-new:unvalidated-model-output → `DD-unvalidated-model`; AS-new:model-contract → `AS-model-contract`; reused from part E: `AS-provenance`.
- **Queued items that are not bugs (no entry):** 06:13 "I'm okay with duplicate logic as long as it's identical. I'm very happy for the engine to be shipped with the game, and then you can just query the engine locally" (a spec; answered correctly at 06:13:44, and `fb7dd0d`'s `cantBuy` is asked locally); 07:15 the defensive-coding/asserts direction (it produced the audit behind E23-E31); 08:49 "Keep working …"; 06:19's request for Fawcett's best move instead of every move (the feature half of H1, `be62bb1`).
- **Task notifications in the queued file:** 01:18 "Run full layout test" failed. Per the session (01:18:15) it was a test bug ("feed's flying cards counted as hand cards"), not a page bug. But `0a6cba4` was pushed at 01:39 with that run "fixed but not re-run" (01:37:16), a small shipped-unverified instance (`DD-process`), with no known consequence. 01:29 flaky frame check: counted in E18. 03:06 "Queue depth-1 and depth-3 matches" exit 144: a killed AI experiment, not a product bug. 03:24 API critique: E13/E14/E32 (part E). 06:47 regression matches: H3. 08:28 "Drop the server's log trim, align the replay cap, and stop tools clearing the log" = `9b4b2ac`, which part E's notes already count as a latent `DD-multi-source-truth` fix (200/120/80 caps → one 120 cap), with no report. 09:46 third full run "1 failing / all ok / all ok": the intermittent flows recap check (E18).
- **Latent risks named in the 08:28 subagent report, still open (not entries):** a failed Room alarm retries every 10 s forever (`src/worker.js:417`); the Lobby Durable Object has no `guard` boundary (`src/worker.js:338-343`, and `broadcast()` keeps an empty `catch`); a failed view part is logged and reported but never resynced. Possible future siblings of E26/E28.
- **Suspected duplicates in other chunks:** H4 overlaps whatever chunk covers 09-30's CLAUDE.md "how to work with the owner" (237fd6f), and 09-28's "questions come first" (8dbdca8, which follows a 09-28 complaint). H2/H1 may be touched by a 09-30 replay/analysis entry if one exists (8084257 removed the subtitle). E34's first three killed runs are on 09-28 (19:09, 19:38, 20:35), so any 09-28 entry about unfinished mock-ups is the same bug.
- **Fix commits in this chunk for bugs reported on an earlier day:** none new. `be62bb1` fixes a display introduced 09-28 (`3c496d1`) but reported on 09-29 (H1).

**Part F:**

- **Owner messages the extract missed:** 28 of the day's messages (most of the bug reports) were queued while Claude worked and appear only as `queued_command` attachments in the transcript (06:11, 06:24, 06:25, 06:32, 06:35, 06:37 ×2, 06:39, 06:40 ×2, 06:47, 06:56, 14:36, 14:40, 14:43, 14:52, 14:53, 14:54, 14:55, 14:57, 14:59, 15:05, 15:08, 15:32, 18:29, 19:19, 19:29, 20:16). The merged document should quote them; other chunks' extracts may have the same gap.
- **Suspected duplicates:**
  - F13 / F24 with playtest #1 (online resign); F28 with playtest #6; F17 with playtest #12 (and #13, #14 as siblings); F7 with playtest #17 / #18; F12 with playtest #2 / #5; F8's sibling with playtest #3 (`3ea4f51`, covered by the playtest part).
  - F1–F4 with the 2026-09-29 chunk if it has entries for the history panel's arrival (`d51aa25`, `9ffc034`) or its ResizeObserver loop.
  - F30 with the 2026-09-27 chunk (`eb26a18`, the first "AI can't get stuck" guard) and whichever chunk first logged the Witch deadlock as an open item.
  - F32 / F33 with the 2026-09-29 chunk (log v3 bump, "no backwards compatibility" instruction at 06:39 that day).
  - F5's `settle(...).catch(() => {})` and the vacuous seat-order check (F14) belong with U1 (tests that silently skip checks).
- **Tags defined here** (renamed or merged by the editor; definitions in TAGS.md): DD-new:dense-lines → `DD-dense-lines`; AS-new:visual-continuity → `AS-visual-continuity`; AS-new:no-compat → `AS-no-silent-catch` (a default that silently stands in for a missing argument is a silent failure).
- **Commits with no bug fixed or introduced (checked in the diff):** `237fd6f` (process ratchet, see F25–F27), `fbdb9af` (online test: two games at once, for the owner's 15:32 concurrency question; no bug found; live proof still pending), `0da6180` (replay generator; `recFinal` stopped reading the global S — a latent sibling of F31, no observed bug), `6c920eb` (map topology / layout split), `a0d55de` (doc), `4f3c187` (server dedupe), `a799442` (room undo via `recUndo`), `5a7bcf6`, `4e02f5e` (dead exports), `bd57d14` (swap pattern → local copies; part of F31).
- **Not bugs:** 06:18 "On phone, when you put history there, it becomes the full screen." was taken as the spec for the left mode on portrait phones (0101346); `98ff674`'s test assumptions about seat 1 were test fixes; 15:48 "are the local AIs as good as the remote AIs" was a question (answered: same code, same network file).
- **Fix commits in this chunk for bugs reported on an earlier day:** `8e06048`, `fd58188` fix the Witch stall that was already an open item before 2026-09-30 (entry F30 written because the lead lists it; dedupe with the earlier chunk); `3ea4f51` fixes playtest item 3 (reported in the playtest review, same day, covered there).
- **Could not classify:** what made the online resign slow at 06:24/06:39, before `c77f849` added the awaited `tellLobby` (F13): unknown; the owner may have been testing the pre-`e041b42` build, where the page stayed in the game while the AIs raced.

**Part P:**

- **Counts (final classification):** 35 entries. ROOT 1 (P3); PARTIAL 4 (P1, P6, P16, P18); HACK 1 (P10); NOT FIXED 29, of which 10 are product decisions pending with the owner (P17, P20–P25, P27, P33, plus P18's pace half) and 2 not traced (P8, P30). Ratchets among the 6 fixed: test 2 (P3 test/taps.cjs; P6 test/online.cjs hidden tab), assertion 0, nothing 4 (P1, P10, P16, P18). P6's fix removed the assertion that caught the bug.
- **Merged items:** #7+#9 → P7; #13+#27 (buttons) → P11; #27's "All cards X over Menu" → P29 with #32; #12 + #31's two-line prompt → P10; #28 split: menu pause (product) → P25, hidden-tab freeze + #29 → P26; #34 split into P31 (undo) and P32 (exit replay). #11 has no entry (fine).
- **Suspected duplicates in other chunks:** P1 — the owner's 15:02 report and the process failure around it ("You're gaslighting me", `37383a3` shipped then reverted on "Do not ship until you've figured it out") belong to whoever covers the 09-30 owner reports; keep one entry. P6 may also appear in a chunk covering commit `2f4ee78`. P7/P8 relate to earlier history-panel entries (`765f07e`, `0101346`, `98ff674`). P29 relates to the 09-26 report "the all cards thing overlaps the end turn thing".
- **Fix commits in this chunk for bugs reported earlier:** `a230101` (and `37383a3`/`ed6a0c3`) fix a bug reported 2026-09-30 15:02 UTC: online resign takes ~5 s. `110182e` fixes a bug reported 2026-09-30 14:33 UTC: the room lobby waited on the server to show the AI list ("It should never need to go to the server"). `8084257` answers the owner's 15:56 UTC verdict "the turn banner is pretty horrible". `8ff7ecd` answers the 14:49 UTC request to drop distance figures from the replay.
- **Tested-build uncertainty:** whether `110182e` (14:36 UTC) was in the tested build is unknown (depends on the time zone of "08:31–09:24"); P16 is written as if it was not.
- **Tags defined here** (renamed or merged by the editor; definitions in TAGS.md): DD-new:no-storage-owner → `DD-multi-source-truth` (the page's keys are literals spread over seven modules plus a copy in shell.html); AS-new:no-overlap → `AS-no-overlap`; AS-new:no-tap-through → `AS-hit-test` (a tap must act on what was drawn under it when it began); AS-new:storage-owned → `AS-storage-owned`.
- **Hypotheses flagged:** P8's LOG_MAX wrap and P9's per-hitch attributions, P16's `json_extract` cost, P26's hidden-tab path (code-traced, not run), P30 entirely.

**Part U:**

- Tags (renamed or merged by the editor; definitions in TAGS.md): AS-new:no-silent-skip → `AS-no-silent-catch`; AS-new:requested-mode → `AS-no-silent-catch` (a skipped check and a substituted AI are silent failures).

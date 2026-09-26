# AI training: where things stand (2026-09-27, 18:30 UTC)

**Live pages:** [training progress](README.md) · [model ladder](LADDER.md) · this summary

## Bottom line

The strongest network is **`first-distill-35`**, about **+64 Elo over the frozen plain network (`first-td2`) when both use search**,
and about +52 without search. It is live on the site as **Humboldt** (with search) and **Orellana** (without).
The gain came from **search distillation**. Of the other ideas tried, some were neutral and some made the network worse.

## Rounds to reach El Dorado (the owner's key metric)

Average arrival round in the progress test (plain network, no search, against two heuristic planners; the heuristic's own round for comparison):

| Training run | Bot arrives | Heuristic arrives |
|---|---|---|
| plain, iterations 116–138 (`first-td2` era) | round 14.71 | 16.07 |
| + max backup (`first-qmax` run) | 14.33 | 16.05 |
| + TreeStrap | 14.08 | 15.99 |
| **+ search distillation (53 tests)** | **13.86** | 15.97 |
| league (current, 12 tests) | 13.84 | 15.99 |

So the bot now reaches El Dorado about **0.85 rounds sooner** than at the start of the night, and about 2.1 rounds before the heuristic.
In ladder games between networks (mixed opponents; the race ends before the last player arrives, so these are only indicative):
`first-distill-35` with search arrives around **round 12.9** in 3-player games and **13.7** in 4-player games, versus `first-td2` with search at 13.15 / 13.68.
A clean benchmark (`tools/ai/arrival.mjs`: every network on the same seeds against the same opponents, each game played until it arrives) is ready to run next.

## How "better" is measured now

- **The ladder** ([LADDER.md](LADDER.md)) logs every game between frozen networks, each playing with and without search.
  Ratings are fitted over all games at once (Elo scale, `first-td2` without search = 1500), with ± one standard error.
- **Promotion rule:** a new network replaces the shipped one only if, **with search**, it beats it by more than 2 standard errors.
- **The old progress test is not reliable.** It measures wins against the hand-written heuristic. From iteration 87 to 137 of plain
  training, the network gained about +100 Elo on the ladder while this test stayed flat at about 2.2×.

## Ratings (with search; after 18:20 the same network under two names counts as one player)

| Network | What it is | Rating | vs `first-td2` |
|---|---|---|---|
| **first-distill-35** | + 35 iterations of search distillation | **1629 ± 7** | **+64** |
| first-distill-22 | + 22 iterations of search distillation (shipped 11:48–18:25) | 1606 ± 4 | +41 |
| first-td2 | plain training, iteration 137 | 1565 ± 5 | 0 |
| first-explore | + log-odds exploration | 1561 ± 15 | ≈ 0 |
| first-qmax | + max backup (Q-learning style) | 1557 ± 6 | ≈ 0 |
| first-tstrap1 / current TreeStrap | + TreeStrap (untaken options) | ~1510 | **−55** |
| first-td-evaluated | plain training, iteration 87 | 1466 | −100 |

The full ranking, including the ratings without search, is on [LADDER.md](LADDER.md).

## What each experiment showed

| Experiment | Result | Verdict |
|---|---|---|
| Search in the training loop (plan-only, earlier) | no improvement | stopped |
| Max backup: train toward the best next option within a turn | about even | kept as a building block |
| Log-odds exploration (T = 0.03 + 1% random) | about even | not used |
| **TreeStrap** (1–3 untaken options per decision) | fixed the move-first bug partly (17% → 44% vs 59%), but **−50 Elo** with search | stopped |
| **Search distillation**: train each in-turn position toward the whole-turn planner's best completion | **+41 by iteration 22, +64 by 35**, then flat | **the winner** |
| Owner's aggressive fading temperature (T 2 → 0.03) | **−62 ± 15** after 8 iterations | stopped (worse) |
| Larger replay window (3 → 6 batches) | flat to slightly worse | stopped |
| League: 25% of seats played by past networks | even after 7 iterations | **running now** |

## Lessons

1. **Search distillation works; other ways of using search didn't.** Using search only to choose moves in training didn't help.
   Training the network on search's *conclusions* did.
2. **Training on positions the bot never really plays hurts.** Both TreeStrap and very wild exploration spend the network's
   capacity on unusual positions, and both cost 50–60 Elo.
3. **Measure head to head, not against the heuristic.** The heuristic test hid a +100 Elo gain and made two worse methods look better.
4. **Check the measuring tool too.** The ladder listed one network under two names. That split the rating graph until 18:20.
   It's fixed now: identical networks are merged.

## Also shipped today (site)

- **Playing against the AIs:** locally and online. Online, the AIs run on the server, rooms can be rated or unrated,
  and the AIs have ratings calibrated from 720 AI-vs-AI games (Humboldt 1530, Orellana 1483, Raleigh 1200).
- **Other players' turns:** shown on screen (cards played, purchases and what was spent, trails on the board), plus a **Journal** button.
- **Two-player games:** the network AIs play as the route planner, because the network was never trained on two-player games.

## Known issues and next ideas

- Distillation has plateaued since about iteration 35. Promising next steps:
  - distilling from a *deeper* search;
  - a bigger network, or better inputs;
  - adding 2-player games to training.
- The "move first vs buy first" inconsistency is only partly fixed. Distillation targets should help it more over time.
- Housekeeping: at 18:05 the disk filled up with old training batches (28 GB). Training restarted automatically after the space
  was freed, and the loop now keeps only the newest 8 batches.

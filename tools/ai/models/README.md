# Frozen models

## first-td (frozen 2026-09-27 02:13 UTC)

The network trained by plain self-play (TD(λ = 0.7), one action at a time, no search) on First Expedition, after 87 iterations
(about 50,000 self-play games). Frozen before switching training to self-play with the whole-turn planner.

| File | What it is |
|---|---|
| `first-td-evaluated.json` | network after iteration 86: the last one tested (1.89× its fair share vs the planner heuristic) |
| `first-td-latest.json` | network after iteration 87's training step (not yet tested) |
| `first-td.log` | the full training log (every iteration's self-play, training and test results) |

Training code at freeze time: commit `aedbec6` on branch `claude/sweet-ptolemy-fisqdw` (this freeze: commit `d15c303`; also on `main`). Place values 1st 1 · 2nd ¼ · 3rd ⅛ · last 0,
gift-card exploration, 25-round cap.

Last tests (160 games each vs the planner heuristic, 3- and 4-player, seats rotated):

| Time (UTC) | vs fair share | wins 3p / 4p | arrival round, net vs heuristic |
|---|---|---|---|
| 01:06:31 | 2.229 | 74% / 56% | 14.7 vs 15.93 |
| 01:09:24 | 2.1 | 64% / 59% | 14.57 vs 15.76 |
| 01:13:54 | 2.186 | 70% / 57% | 14.61 vs 15.92 |
| 01:16:54 | 1.993 | 68% / 49% | 15.07 vs 15.89 |
| 01:21:09 | 2.164 | 68% / 59% | 14.75 vs 15.95 |
| 01:25:43 | 2.1 | 66% / 56% | 14.68 vs 15.89 |
| 01:44:07 | 2.4 | 76% / 64% | 14.52 vs 15.92 |
| 02:05:44 | 1.886 | 61% / 49% | 14.93 vs 15.88 |

**To go back to this model:** `cp tools/ai/models/first-td-evaluated.json tools/ai/data/first.net.json`, then
`tools/ai/loop.sh first <iterations>` continues plain self-play training from it (`echo 5 > tools/ai/data/first.hi` keeps the full-game horizon).

## first-td2 (frozen 2026-09-27 ~07:40 UTC)

The plain self-play network after iteration 137 (resumed from first-td at iteration 88; includes the look-ahead card-table fix and
the arrival-place fix). Tests vs the planner heuristic at iterations 116–137 averaged 2.24× its fair share (wins 69% 3p / 62% 4p),
arriving in round 14.7 vs 16.1. Frozen before trying the within-turn max backup (MAXBACK=1, run `first-qmax`).
To go back: `cp tools/ai/models/first-td2.json tools/ai/data/first.net.json`.

## first-qmax (frozen 2026-09-27 08:10 UTC)

first-td2 plus 10 iterations of plain self-play with the within-turn max backup (MAXBACK=1). Tests vs the planner heuristic
averaged about 2.5× its fair share (first-td2: 2.24×); head-to-head vs first-td2 (512 games, after 7 iterations) about even:
plain 110 vs 99 wins, with search 141 vs 164. Frozen before trying log-odds exploration (run `first-explore`).

## first-explore (frozen 2026-09-27)

first-qmax plus 5 iterations with log-odds exploration (EXPLORE_T=0.03, EXPLORE_EPS=0.01, max backup on). Head-to-head vs first-qmax
(512 games): with search 154 vs 141 wins, plain 103 vs 119 — no clear gain; not used as a base. Next run (TreeStrap) starts from first-qmax.

## first-tstrap1 (frozen 2026-09-27 08:52 UTC)

first-qmax plus 4 iterations with TreeStrap (1 untaken option per decision, max backup on). Move-first test position: 39% vs 61% (first-qmax: 17% vs 55%). Frozen before raising TreeStrap to 3 options per decision.

## first-tstrap3 (frozen 2026-09-27 09:27 UTC)

first-tstrap1 plus TreeStrap with 3 untaken options (6 iterations total in the run). Ladder: TreeStrap networks are ~50 Elo WORSE than first-qmax with search (1508±10 vs 1556±6) — stopped.

## first-distill-22 (frozen 2026-09-27 11:44 UTC) — PROMOTED, shipped as Humboldt/Orellana

first-td2 plus 22 iterations of search distillation (DISTILL=1, MAXBACK=1: within a turn each position trained toward the whole-turn planner's best completion). Ladder vs first-td2 (512 games): +40±12 Elo with search, +41±11 plain.

## first-distill-35 (frozen 2026-09-27 13:08 UTC) — PROMOTED 18:2x, shipped as Humboldt/Orellana

The search-distillation run after 35 iterations. Ladder vs first-distill-22: +19±13 with search, +16±13 plain (it29: +17±15 / -20±15) — slow gains, not promoted. Parent of the fading-temperature run.

## first-anneal-8 (frozen 2026-09-27 14:20 UTC) — worse, not used

first-distill-35 plus 8 iterations with the aggressive fading temperature (ANNEAL=2,0.6,0.03, EXPLORE_EPS=0.01, MAXBACK+DISTILL on). Ladder vs its parent: -62±15 Elo with search, -30±15 plain — stopped (owner: "if it is getting worse, do not run it").

## first-distill-41 (frozen 2026-09-27 15:09 UTC)

The search-distillation run after 41 iterations. Ladder vs first-distill-22: +11±12 with search, +6±12 plain — the run has plateaued since ~it 22. Next: the same run with a larger replay window (REPLAY=6).

## first-distill-53 (frozen 2026-09-27 16:49 UTC)

The distillation run after 53 iterations (12 of them with REPLAY=6). Ladder vs first-distill-22: -15±11 with search, -25±11 plain — the larger replay window did not help. Not used.

## first-league-17 (frozen 2026-09-27 19:20 UTC)

first-distill-22 plus 17 iterations with 25% of self-play seats played by past networks (DISTILL+MAXBACK, REPLAY=6). Ladder at it 13 vs first-distill-35: +6±12 with search, +14±12 plain (≈ +29 over its parent). Stopped by the owner to prioritise the multi-map network.

## first-multi4-33 / first-multi4-40 (frozen 2026-09-28 01:34 UTC)

One network for four courses (first, hills, winding, witch), 256×128 hidden units, trained with max backup + search distillation, no heuristic seats. On First Expedition vs the specialist first-distill-35: it33 -10±11 with search / +8±11 plain (level); it40 -45±11 / -51±11 (slipped back). Arrival (network vs itself) plateaued around first 14.1, hills 15.3, winding 16.3, witch 16.4.

## first-ftfirst-8 (frozen 2026-09-28 03:10 UTC)

first-multi4-33 fine-tuned on First Expedition only for 8 iterations (max backup + search distillation, no heuristic seats, 256×128). Arrival on First (network vs itself) 14.2 → ~13.9 by iteration 2, then flat. Not laddered (the owner switched focus back to the shared model). Health: 222/256 layer-1 and 82/128 layer-2 units dead — inherited from first-multi4-33 (225/256, 81/128), so the four-map run killed the units, not this fine-tune.

# Independent review of AI_TRAINING_SPEC.md (2026-09-28)

Written by a reviewer agent that read only docs/AI_TRAINING_SPEC.md (no code, no history). It did not run web
searches: paper citations are from memory and should be checked before relying on them.

## Ranked problems
1. **Warm start is not a faithful copy** (slope change, BatchNorm, old rules, new target meaning) — High.
   Add an iteration-0 test and a from-scratch control run.
2. **Round cap is part of the target but not an input**; cap 15 truncates most games; the lead bonus is not
   potential-based shaping (Pardo et al. 2018; Ng, Harada & Russell 1999) — High.
3. **Curriculum gate can deadlock** (1.15× twice, no fallback, exploration stays at maximum) — High.
4. **Targets mix a max backup (maximisation bias; van Hasselt 2010/2016) with on-policy λ-returns over exploratory
   play** (fix: Double-style max, cut traces at exploration — Q(λ), Tree-Backup, Retrace) — High/Medium.
5. **No search: one-ply greedy player vs a beam-search heuristic; targets never improve on the greedy policy**
   (Expert Iteration, AlphaZero; determinisation / ISMCTS for hidden information) — Medium–High.
6. **Stale bootstrapped targets reused for 3 iterations** (MuZero Reanalyse) — Medium.
7. **Evaluation noise ±0.12 per 160-game test, one reference opponent, no regression check** (paired seeds, SPRT,
   checkpoint league) — Medium.
8. **Training vs test opponent mix differs; heuristic-seat samples with no seat flag** — Medium.
9. **Optimisation**: constant LR 1e-3; BatchNorm re-init/fold details; validation split leaks within games — Medium/Low.
10. **Exploration**: τ = 0.02 large vs value gaps; gift-card weights from another run's log — Medium/Low.
11. **Sample weighting**: long turns dominate, within-turn samples correlated — Low.
12. Underspecified points: exact λ recursion, "win" when nobody arrives by the cap, count scaling, tie-breaks.

## Looks reasonable
Afterstate values with end-turn evaluated before the draw; own-deck reshuffle and averaging for draw actions;
TD(λ) 0.7 with BCE on [0,1] targets; shared network with map one-hot and per-map board blocks; health monitoring.

## Suggested order
Check the warm start → fix the cap problem → fix the targets (Double max, trace cutting, fresh targets, less exploration)
→ turn-level search at play and target time → tighter evaluation.

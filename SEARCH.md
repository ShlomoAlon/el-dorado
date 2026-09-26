# Search experiment: whole-turn planner vs the plain net

_Updated 04:50:18 UTC · 417 games played_

**What's tested:** the trained network plus a planner that searches its own whole turn (beam search: keep the B most promising partial turns, extend each by every legal action, compare finished turns by the network's end-of-turn value; plan once per turn, re-plan after a draw card). Its own turn has almost no luck, so this is cheap compared with looking into opponents' turns. Each beam size plays 300 games against the plain network (3- and 4-player, seats rotated, the same games for every beam size; in some 4-player games two planners play two plain nets).

## Standings

| Planner | Games | Seats | Wins | vs fair share (1.00 = equal) | Avg place value, planner vs plain | Cost per move vs plain (CPU) | Network evaluations per move |
|---|---|---|---|---|---|---|---|
| Beam 3 | 300 of 300 | 375 | 88 | **0.83** ± 0.16 | 0.318 vs 0.409 | **2.7×** (12.8 vs 4.8 ms) | 44 vs 17 |
| Beam 10 | 117 of 300 | 146 | 32 | **0.77** ± 0.26 | 0.320 vs 0.416 | **6.4×** (30.4 vs 4.8 ms) | 112 vs 18 |

± is a 95% margin: if it overlaps 1.00, the difference could still be luck. Place value: 1st = 1, 2nd = ¼, 3rd = ⅛ (4-player), last = 0.

## Latest games

| Time | Planner | Players | Result (place, round it arrived) |
|---|---|---|---|
| 02:12:35 | beam 10 | 3 | plain 3rd · planner 2nd (r15) · plain 1st (r13) |
| 02:12:34 | beam 10 | 4 | plain 2nd (r15) · planner 4th (r16) · planner 3rd (r16) · plain 1st (r14) |
| 02:12:34 | beam 10 | 4 | planner 4th · plain 2nd (r16) · plain 3rd (r16) · plain 1st (r14) |
| 02:12:33 | beam 10 | 3 | plain 1st (r16) · plain 2nd (r20) · planner 3rd |
| 02:12:32 | beam 10 | 3 | plain 3rd (r15) · plain 2nd (r15) · planner 1st (r15) |
| 02:12:31 | beam 10 | 4 | plain 1st (r12) · planner 3rd (r18) · planner 4th · plain 2nd (r16) |
| 02:12:31 | beam 10 | 4 | plain 1st (r13) · plain 2nd (r13) · planner 4th · plain 3rd (r19) |
| 02:12:29 | beam 10 | 3 | planner 2nd (r16) · plain 3rd · plain 1st (r12) |
| 02:12:29 | beam 10 | 3 | planner 1st (r16) · plain 2nd (r18) · plain 3rd |
| 02:12:28 | beam 10 | 4 | planner 2nd (r16) · plain 1st (r12) · plain 4th · planner 3rd (r17) |
| 02:12:28 | beam 10 | 4 | plain 1st (r13) · plain 2nd (r14) · planner 3rd (r14) · plain 3rd (r14) |
| 02:12:27 | beam 10 | 3 | plain 3rd · planner 2nd (r14) · plain 1st (r13) |
| 02:12:26 | beam 10 | 3 | plain 3rd · planner 1st (r12) · plain 2nd (r13) |
| 02:12:26 | beam 10 | 4 | planner 2nd (r16) · plain 1st (r13) · plain 4th (r17) · planner 3rd (r17) |
| 02:12:25 | beam 10 | 4 | planner 1st (r13) · plain 2nd (r13) · plain 3rd (r16) · plain 4th |

---

# Earlier experiment (stopped): searching 2 / 5 / 10 turns ahead

_Updated 04:50:18 UTC · 5 of 24 games finished_

**Setup:** 4-player games on First Expedition. At every table: the plain trained network, and the same network with search looking **2, 5 and 10 of its own turns ahead**. Seats rotate every game, so each bot sits in every seat equally. Each searcher gets the same thinking budget per move (~1,000 simulated game actions ≈ 5 s of one CPU core): it takes the plain net's top candidate moves, and for each one plays the game forward many times with the hidden cards re-dealt at random (a "playout"), everyone playing the plain net; it drops the worse half of the candidates each round and picks the move whose playouts turned out best. Deeper search = fewer, longer playouts. The experiment runs at low priority so training keeps the CPU (thinking time below is CPU time).

## Standings

| Bot | Games | Wins | Win rate (fair: 25%) | Avg place | Avg place value | Avg arrival round | Thinking per move | Playouts per move | Overruled the plain choice |
|---|---|---|---|---|---|---|---|---|---|
| Plain net (no search) | 5 | 3 | **60%** | 1.60 | 0.675 | 16.2 | 0.00 s | – | – |
| Search 2 turns ahead | 5 | 2 | **40%** | 1.60 | 0.550 | 17.0 | 1.63 s | 27 | 54% of 279 moves |
| Search 5 turns ahead | 5 | 0 | **0%** | 3.20 | 0.100 | 18.7 | 1.74 s | 17 | 61% of 359 moves |
| Search 10 turns ahead | 5 | 0 | **0%** | 3.60 | 0.025 | 23.0 | 1.73 s | 14 | 51% of 353 moves |

Place value: 1st = 1, 2nd = ¼, 3rd = ⅛, 4th = 0 (the training reward). With few games, differences of a couple of wins are noise.

## Game by game

Each cell: **place** (round it reached El Dorado) · thinking time · playouts · overruled / searched moves.

| # | Finished | Replay | Plain net (no search) | Search 2 turns ahead | Search 5 turns ahead | Search 10 turns ahead |
|---|---|---|---|---|---|---|
| 1 | 01:54 | [watch](https://el-dorado.shlomoalon9.workers.dev/?replay=4r5xwuvj) | **3rd** (r18) · 0 s | **1st** (r14) · 74 s · 1251 playouts · 25/46 | **2nd** (r17) · 100 s · 957 playouts · 27/57 | **4th** (did not arrive) · 91 s · 711 playouts · 33/53 |
| 2 | 01:56 | [watch](https://el-dorado.shlomoalon9.workers.dev/?replay=rdk9r56b) | **1st** (r15) · 0 s | **2nd** (r19) · 114 s · 1866 playouts · 37/65 | **4th** (did not arrive) · 128 s · 1376 playouts · 48/77 | **3rd** (r23) · 147 s · 1231 playouts · 32/86 |
| 3 | 01:57 | [watch](https://el-dorado.shlomoalon9.workers.dev/?replay=pdt66s2u) | **1st** (r14) · 0 s | **2nd** (r20) · 134 s · 1820 playouts · 35/68 | **4th** (did not arrive) · 166 s · 1439 playouts · 65/88 | **3rd** (did not arrive) · 133 s · 890 playouts · 44/73 |
| 4 | 02:01 | [watch](https://el-dorado.shlomoalon9.workers.dev/?replay=px27y694) | **1st** (r17) · 0 s | **2nd** (r17) · 94 s · 1373 playouts · 28/50 | **3rd** (r19) · 134 s · 1086 playouts · 37/66 | **4th** (did not arrive) · 127 s · 765 playouts · 32/61 |
| 5 | 02:04 | [watch](https://el-dorado.shlomoalon9.workers.dev/?replay=rnd3fv59) | **2nd** (r17) · 0 s | **1st** (r15) · 93 s · 1249 playouts · 26/50 | **3rd** (r20) · 156 s · 1257 playouts · 42/71 | **4th** (did not arrive) · 175 s · 1176 playouts · 38/80 |

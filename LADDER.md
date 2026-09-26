# Model ladder: every frozen network, with and without search

_Updated 2026-09-28 04:50 UTC · 9,984 games · 21 matches_

Ratings are fitted from every game (who finished ahead of whom), Elo scale, anchored at **first-td2 (plain) = 1500**. "+s" = the same network planning whole turns (the in-game Humboldt AI plays this way). ± is one standard error: two ratings are clearly different when they differ by more than about 3× the larger ±. A new network is **promoted** (becomes the best, and Humboldt's network) only when its +s rating beats the current best's +s by more than 2 standard errors of the difference.

| Rank | Player | Rating | ± | Games | Wins |
|---|---|---|---|---|---|
| 1 | league@13 **+search** | **1635** | 10 | 448 | 171 |
| 2 | first-distill-35 **+search** | **1625** | 4 | 3584 | 1375 |
| 3 | distill@29 **+search** | **1620** | 10 | 448 | 173 |
| 4 | multi4@33 **+search** | **1614** | 10 | 448 | 155 |
| 5 | first-distill-41 **+search** | **1611** | 10 | 448 | 167 |
| 6 | first-distill-22 **+search** | **1606** | 4 | 3136 | 1093 |
| 7 | distill@47 **+search** | **1606** | 10 | 448 | 162 |
| 8 | league@7 **+search** | **1601** | 10 | 448 | 157 |
| 9 | first-distill-53 **+search** | **1590** | 10 | 448 | 162 |
| 10 | distill@15 **+search** | **1581** | 10 | 448 | 168 |
| 11 | multi4@40 **+search** | **1580** | 10 | 448 | 152 |
| 12 | shared@5 **+search** | **1579** | 10 | 448 | 142 |
| 13 | first-anneal-8 **+search** | **1577** | 10 | 448 | 138 |
| 14 | distill@9 **+search** | **1571** | 10 | 448 | 151 |
| 15 | league@13 | **1566** | 10 | 448 | 96 |
| 16 | first-td2 **+search** | **1565** | 5 | 2016 | 693 |
| 17 | multi4@33 | **1565** | 10 | 448 | 108 |
| 18 | first-explore **+search** | **1561** | 15 | 224 | 78 |
| 19 | first-qmax **+search** | **1557** | 6 | 1344 | 492 |
| 20 | first-distill-35 | **1556** | 4 | 3584 | 848 |
| 21 | first-distill-41 | **1551** | 10 | 448 | 101 |
| 22 | distill@47 | **1551** | 10 | 448 | 101 |
| 23 | multi4@14 **+search** | **1545** | 10 | 448 | 142 |
| 24 | distill@15 | **1544** | 10 | 448 | 114 |
| 25 | multi4@23 **+search** | **1543** | 10 | 448 | 132 |
| 26 | first-distill-22 | **1540** | 4 | 3136 | 720 |
| 27 | league@7 | **1533** | 10 | 448 | 106 |
| 28 | distill@9 | **1530** | 10 | 448 | 119 |
| 29 | multi4@14 | **1524** | 10 | 448 | 92 |
| 30 | distill@29 | **1524** | 10 | 448 | 93 |
| 31 | first-explore | **1518** | 15 | 224 | 56 |
| 32 | first-distill-53 | **1516** | 10 | 448 | 82 |
| 33 | multi4@23 | **1516** | 10 | 448 | 103 |
| 34 | first-anneal-8 | **1513** | 10 | 448 | 82 |
| 35 | first-tstrap1 **+search** | **1512** | 15 | 224 | 69 |
| 36 | tstrap@seed **+search** | **1509** | 10 | 448 | 134 |
| 37 | multi4@40 | **1505** | 11 | 448 | 83 |
| 38 | first-td2 | **1500** | 5 | 2016 | 412 |
| 39 | first-qmax | **1497** | 6 | 1344 | 329 |
| 40 | first-tstrap1 | **1489** | 15 | 224 | 47 |
| 41 | shared@5 | **1486** | 11 | 448 | 73 |
| 42 | tstrap@seed | **1485** | 10 | 448 | 101 |
| 43 | first-td-evaluated **+search** | **1467** | 15 | 224 | 60 |
| 44 | first-td-evaluated | **1391** | 15 | 224 | 33 |

## Matches played

- first-td2 vs first-qmax: 512 games (2026-09-27 09:04 – 09:09 UTC)
- first-qmax vs tstrap@seed: 512 games (2026-09-27 09:09 – 09:16 UTC)
- first-tstrap1 vs first-qmax: 256 games (2026-09-27 09:16 – 09:19 UTC)
- first-explore vs first-qmax: 256 games (2026-09-27 09:19 – 09:23 UTC)
- first-td-evaluated vs first-td2: 256 games (2026-09-27 09:23 – 09:26 UTC)
- first-td2 vs distill@9: 512 games (2026-09-27 10:19 – 10:23 UTC)
- first-td2 vs distill@15: 512 games (2026-09-27 10:56 – 11:00 UTC)
- first-td2 vs distill@22: 512 games (2026-09-27 11:39 – 11:43 UTC)
- first-distill-22 vs distill@29: 512 games (2026-09-27 12:22 – 12:27 UTC)
- first-distill-22 vs distill@35: 512 games (2026-09-27 13:02 – 13:07 UTC)
- first-distill-35 vs anneal@8: 512 games (2026-09-27 14:14 – 14:19 UTC)
- first-distill-22 vs distill@41: 512 games (2026-09-27 15:04 – 15:08 UTC)
- first-distill-22 vs distill@47: 512 games (2026-09-27 15:53 – 15:58 UTC)
- first-distill-22 vs distill@53: 512 games (2026-09-27 16:44 – 16:48 UTC)
- first-distill-22 vs league@7: 512 games (2026-09-27 17:33 – 17:38 UTC)
- first-distill-35 vs league@13: 512 games (2026-09-27 18:24 – 18:29 UTC)
- first-distill-35 vs multi4@14: 512 games (2026-09-27 20:52 – 20:56 UTC)
- first-distill-35 vs multi4@23: 512 games (2026-09-27 21:54 – 21:59 UTC)
- first-distill-35 vs multi4@33: 512 games (2026-09-27 23:55 – 23:59 UTC)
- first-distill-35 vs multi4@40: 512 games (2026-09-28 01:28 – 01:33 UTC)
- first-distill-35 vs shared@5: 512 games (2026-09-28 04:22 – 04:26 UTC)

## Promotions

- 2026-09-27 11:44 UTC · first-distill-22 promoted over first-td2: +40±12 Elo with search, +41±11 plain (512 games); now Humboldt's network
- 2026-09-27 18:15 UTC · first-distill-35 promoted over first-distill-22: +23±8 Elo with search (all ladder games pooled, after merging identical networks listed under two names); now Humboldt's network

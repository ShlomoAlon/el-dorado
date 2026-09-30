// Calibrate the named AIs' starting ratings (the three in AIS, e.g. Fawcett / Humboldt / Raleigh) by having them play each other offline,
// exactly as the site plays them (engine_ai.js aiStep with the shipped network src/ai/first.bin, per-seat plan cache),
// on First Expedition with the owner's end rule (fullRace, as online). The deals and shuffles are seeded; the AIs' look-ahead is not
// (aiChoose uses Math.random), so a rerun gives close but not identical numbers.
//   nice -n 10 node tools/ai/calibrate_ais.mjs [games=360] [workers=2]        plays, then prints the ratings
//   node tools/ai/calibrate_ais.mjs report                                     ratings from the saved games only
// Tables, repeating in blocks of 12 games: the 6 seatings of all three AIs (3 players), 3 four-player tables (one AI twice,
// seats rotated) and 3 two-player games (each pair; who starts alternates). A game still running at round 30 is ended there
// and placed by the engine's rules (unfinished players by distance to El Dorado).
// Ratings: Elo scale, maximum-likelihood fit over every pair of different AIs in every game (who finished ahead; a shared
// place counts half), each game weighted 1/(players-1) like eloDeltas' K/(n-1). Also printed: the server's own sequential
// eloDeltas over the games with no repeated AI (the only tables a real room allows), averaged over 200 shuffled orders.
// Anchor: Raleigh (the heuristic planner, the weakest) = 1200, the rating every new player starts with. See docs/HANDOFF.md.
import * as E from '../../src/engine.gen.js';
import { playout, seatPlayers } from './playout.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const IDS = E.AIS.map(a => a.id); // three AIs
const OUT = new URL(`./data/calibration-${IDS.join('-')}.json`, import.meta.url); // (games already played for this set of AIs are kept)
const ANCHOR = 'raleigh', ANCHOR_RATING = 1200, CAP = 30, SEED0 = 424200;
function table(g) {
  const b = Math.floor(g / 12), k = g % 12;
  if (k < 6) { const P = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]][k]; return P.map(i => IDS[i]); }
  if (k < 9) { const dup = IDS[k - 6], four = [...IDS, dup], r = b % 4; return four.map((_, i) => four[(i + r) % 4]); }
  const pair = [[0, 1], [0, 2], [1, 2]][k - 9].map(i => IDS[i]); return b % 2 ? pair.reverse() : pair;
}
if (!isMainThread) {
  const { games } = workerData; E.aiSetNet(E.aiNetDecode(readFileSync(new URL('../../src/ai/first.bin', import.meta.url))));
  for (const g of games) {
    const ai = table(g), mem = ai.map(() => ({})); // (the AIs' look-ahead runs with its own randomness: aiChoose)
    const { gs, capped } = playout({ seed: SEED0 + g, players: seatPlayers(ai.length, ai), cap: CAP, choose: (gs, me) => E.aiChoose(gs, ai[me], mem[me], Math.random) });
    parentPort.postMessage({ g, ai, places: gs.places.slice(), fin: gs.players.map(p => p.fin || 0), round: gs.round, capped });
  }
  parentPort.postMessage({ done: true });
} else {
  mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
  let res = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  if (process.argv[2] !== 'report') {
    const N = +(process.argv[2] || 360), W = +(process.argv[3] || 2), have = new Set(res.map(r => r.g)), todo = [...Array(N).keys()].filter(g => !have.has(g));
    const t0 = Date.now(); let n = 0;
    await Promise.all([...Array(W)].map((_, w) => new Promise((ok, bad) => {
      const wk = new Worker(new URL(import.meta.url), { workerData: { games: todo.filter((_, i) => i % W === w) } });
      wk.on('message', m => { if (m.done) return ok(); res.push(m); n++;
        if (n % 12 === 0 || n === todo.length) { writeFileSync(OUT, JSON.stringify(res)); console.log(`${n}/${todo.length} games · ${((Date.now() - t0) / n / 1000).toFixed(1)} s/game`); } });
      wk.on('error', bad); })));
    res = res.filter(r => r.g < N);
  }
  report(res.sort((a, b) => a.g - b.g));
}
function report(res) {
  // pairwise results between different AIs, weighted 1/(n-1)
  // two-player games are played and tallied but left out of the ratings: the network AIs don't finish them (most hit the round cap;
  // see docs/HANDOFF.md), which says more about that mode than about their strength at 3-4 players, where people mostly play
  const fitted = res.filter(r => r.ai.length >= 3);
  const pairs = []; for (const r of fitted) { const n = r.ai.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (r.ai[i] === r.ai[j]) continue;
      pairs.push({ a: r.ai[i], b: r.ai[j], s: r.places[i] < r.places[j] ? 1 : r.places[i] === r.places[j] ? .5 : 0, w: 1 / (n - 1) }); } }
  // maximum likelihood (Newton's method on the logistic model, Elo scale), anchored afterwards
  const k = Math.log(10) / 400, R = Object.fromEntries(IDS.map(x => [x, 0]));
  let H = null;
  for (let it = 0; it < 100; it++) {
    const g = Object.fromEntries(IDS.map(x => [x, 0])); H = Object.fromEntries(IDS.map(x => [x, Object.fromEntries(IDS.map(y => [y, 0]))]));
    for (const p of pairs) { const e = 1 / (1 + Math.exp(-k * (R[p.a] - R[p.b]))), d = p.w * k * (p.s - e), h = p.w * k * k * e * (1 - e);
      g[p.a] += d; g[p.b] -= d; H[p.a][p.a] += h; H[p.b][p.b] += h; H[p.a][p.b] -= h; H[p.b][p.a] -= h; }
    // fix the anchor (drop its row/column) and solve the 2x2 system for the others
    const fr = IDS.filter(x => x !== ANCHOR), [x, y] = fr, a = H[x][x], b = H[x][y], c = H[y][x], d = H[y][y], det = a * d - b * c;
    const dx = (d * g[x] - b * g[y]) / det, dy = (a * g[y] - c * g[x]) / det; R[x] += dx; R[y] += dy;
    if (Math.abs(dx) + Math.abs(dy) < 1e-6) break;
  }
  const fr = IDS.filter(x => x !== ANCHOR), [x, y] = fr, a = H[x][x], b = H[x][y], c = H[y][x], d = H[y][y], det = a * d - b * c;
  const se = { [ANCHOR]: 0, [x]: Math.sqrt(d / det), [y]: Math.sqrt(a / det) };
  const fit = Object.fromEntries(IDS.map(i => [i, Math.round(ANCHOR_RATING + R[i] - R[ANCHOR])]));
  // the server's sequential eloDeltas (start 1200, K 48 → 32 after 10 games), over the games a real room allows
  const legal = fitted.filter(r => new Set(r.ai).size === r.ai.length), seq = Object.fromEntries(IDS.map(i => [i, 0])), ORD = 200;
  const rnd = E.mulberry32(99);
  for (let o = 0; o < ORD; o++) {
    const order = legal.slice(); if (o) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const rt = Object.fromEntries(IDS.map(i => [i, 1200])), gm = Object.fromEntries(IDS.map(i => [i, 0]));
    for (const r of order) { const dl = E.eloDeltas(r.ai.map(i => rt[i]), r.places, r.ai.map(i => gm[i])); r.ai.forEach((i, j) => { rt[i] += dl[j]; gm[i]++; }); }
    for (const i of IDS) seq[i] += rt[i] / ORD;
  }
  const off = ANCHOR_RATING - seq[ANCHOR];
  // plain tallies
  const tally = {}; for (const r of res) { const n = r.ai.length, key = n + 'p'; tally[key] = tally[key] || { games: 0, capped: 0, rounds: 0 }; tally[key].games++; tally[key].rounds += r.round; if (r.capped) tally[key].capped++;
    r.ai.forEach((i, j) => { const t = tally[key][i] = tally[key][i] || { seats: 0, first: 0, place: 0 }; t.seats++; t.place += r.places[j]; if (r.places[j] === 1) t.first++; }); }
  console.log(`${res.length} games; ratings from the ${fitted.length} with 3-4 players (${pairs.length} pairs of different AIs)`);
  for (const key of Object.keys(tally).sort()) { const t = tally[key];
    console.log(`  ${key}: ${t.games} games, avg ${(t.rounds / t.games).toFixed(1)} rounds, ${t.capped} capped · ` + IDS.filter(i => t[i]).map(i => `${i} 1st ${(100 * t[i].first / t[i].seats).toFixed(0)}% avg place ${(t[i].place / t[i].seats).toFixed(2)}`).join(' · ')); }
  console.log('pairwise score (who finished ahead):');
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const P = pairs.filter(p => (p.a === IDS[i] && p.b === IDS[j]) || (p.a === IDS[j] && p.b === IDS[i]));
    const s = P.reduce((z, p) => z + (p.a === IDS[i] ? p.s : 1 - p.s), 0); console.log(`  ${IDS[i]} vs ${IDS[j]}: ${(100 * s / P.length).toFixed(1)}% of ${P.length}`); }
  console.log(`max-likelihood Elo (anchor ${ANCHOR} = ${ANCHOR_RATING}):  ` + IDS.map(i => `${i} ${fit[i]} ±${Math.round(se[i])}`).join(' · '));
  console.log(`server eloDeltas, sequential over ${legal.length} legal games (avg of ${ORD} orders, shifted to the same anchor):  ` + IDS.map(i => `${i} ${Math.round(seq[i] + off)} (raw ${Math.round(seq[i])})`).join(' · '));
  console.log('AI_CALIBRATION = ' + JSON.stringify(fit));
}

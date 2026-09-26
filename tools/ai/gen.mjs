// Plays games on the real rules engine (no server) in parallel worker threads.
//   HORIZON=3 node tools/ai/gen.mjs <mode> <games> <out-prefix|-> [net.json] [course-id]
//   mode: self – the net plays (25% of seats heuristic); every position after one of its own actions is a sample,
//                target = TD(λ) return of the game result (TD-Gammon style)
//         eval – the net vs 2 heuristic bots, 3 players, seats rotated; no samples
// HORIZON: games stop after this many rounds (curriculum). Unfinished players are ranked by how close they got.
// Result for each player, in [0,1]: 0.8 × placement (1 = first, 0 = last) + 0.2 × how far ahead of the others (distance).
// Samples are sparse: <out>.len.bin (u32 non-zeros per row) .idx.bin (u16 columns) .val.bin (f32) .Y.bin (f32 target).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { E } from '../../src/engine.gen.js';
const LAMBDA = 0.7;

if (!isMainThread) {
  const { mode, games, seed0, net, course, H, eps, temp, buyEps, transEps } = workerData;
  const C = E.COURSES.find(c => c.id === course) || E.COURSES[0];
  if (net) E.setNet(net);
  let s = seed0 >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const X = [], Y = [], st = { win3: 0, seat3: 0, win4: 0, seat4: 0, netWins: 0, netSeats: 0, netRem: [], heurRem: [], netArr: [], heurArr: [], capped: 0, buysNet: {}, buysHeur: {}, transNet: {}, transHeur: {} };
  for (let g = 0; g < games; g++) {
    let pols;
    // 3- and 4-player games only (2-player games use different rules)
    if (mode === 'self') { const np = rnd() < .5 ? 3 : 4; pols = Array.from({ length: np }, () => rnd() < .25 ? 'heur' : 'net'); if (!pols.includes('net')) pols[0] = 'net'; }
    else { const np = g % 2 ? 4 : 3, a = ['net', ...Array(np - 1).fill('heur')]; pols = a.map((_, i) => a[(i + (g >> 1)) % np]); } // half 3-player, half 4-player, seats rotated
    E.newGame({ course: C, seed: (rnd() * 2 ** 31) | 0, fullRace: true, players: pols.map((_, i) => ({ name: 'B' + i, color: '#fff' })) });
    const traj = pols.map(() => []); let acts = 0, lastMe = -1, lastRound = -1, turnState = null, capped = false;
    while (!E.S.over) {
      const S = E.S; S.log.length = 0;
      if (S.round > H || acts > 20000) { capped = S.round > H; E.endGame(); break; }
      const me = S.cur, isNet = pols[me] === 'net';
      if (me !== lastMe || S.round !== lastRound) { lastMe = me; lastRound = S.round; const nb = mode === 'self' && isNet && rnd() < buyEps; turnState = { noBuy: nb, forceBuy: !nb && mode === 'self' && isNet && rnd() < buyEps, forceTransmit: mode === 'self' && isNet && rnd() < transEps }; }
      const c = mode === 'eval' ? E.botChoose({ mode: isNet ? 'net' : 'heur', rnd })
        : isNet ? E.botChoose({ mode: 'net', eps, temp, turnState, rnd })
        : E.botChoose({ mode: 'heur', eps: .03, noise: .3, rnd });
      if (c.a.t === 'buy' || c.a.t === 'transmit') { const stk = c.a.src === 'm' ? S.market[c.a.idx] : S.reserve[c.a.idx]; if (stk) { const b = c.a.t === 'transmit' ? (isNet ? st.transNet : st.transHeur) : (isNet ? st.buysNet : st.buysHeur); b[stk.t] = (b[stk.t] || 0) + 1; } }
      // sample = the position right after my action, as I'll see it: for "end turn", before the next hand is drawn
      const f = mode === 'self' ? (c.a.t === 'end' ? E.botEndFeatures(me, c.a.keep) : null) : null;
      const r = E.applyAction(me, c.a); acts++;
      if (!r.ok) E.applyAction(me, { t: 'end', keep: [] });
      if (mode === 'self' && !E.S.over) traj[me].push(f || E.botNetFeatures(me));
    }
    if (capped) st.capped++;
    const S = E.S, n = pols.length, rem = S.players.map((_, i) => E.botRemaining(i));
    S.players.forEach((p, i) => {
      const others = rem.filter((_, j) => j !== i), lead = others.reduce((a, x) => a + x, 0) / others.length - rem[i];
      const z = 0.8 * (n - S.places[i]) / (n - 1) + 0.2 / (1 + Math.exp(-lead / 5));
      if (mode === 'self') { const T = traj[i]; let G = z; for (let t = T.length - 1; t >= 0; t--) { X.push(T[t]); Y.push(G); G = (1 - LAMBDA) * (net ? E.botNetValue(T[t]) : G) + LAMBDA * G; } }
      if (pols[i] === 'net') { st.netSeats++; if (S.places[i] === 1) st.netWins++; st['seat' + n]++; if (S.places[i] === 1) st['win' + n]++; st.netRem.push(rem[i]); if (p.fin) st.netArr.push(p.fin); }
      else { st.heurRem.push(rem[i]); if (p.fin) st.heurArr.push(p.fin); }
    });
  }
  let nnz = 0; for (const x of X) for (const v of x) if (v !== 0) nnz++;
  const len = new Uint32Array(X.length), idx = new Uint16Array(nnz), val = new Float32Array(nnz); let o = 0;
  X.forEach((x, i) => { let c = 0; for (let k = 0; k < x.length; k++) if (x[k] !== 0) { idx[o] = k; val[o++] = x[k]; c++; } len[i] = c; });
  parentPort.postMessage({ len, idx, val, Y: new Float32Array(Y), nf: X.length ? X[0].length : 0, st }, [len.buffer, idx.buffer, val.buffer]);
}

if (isMainThread) {
  const [, , mode = 'self', G = '100', out = '-', netPath = '', course = 'first'] = process.argv;
  const net = netPath ? JSON.parse(readFileSync(netPath, 'utf8')) : null;
  const W = cpus().length, t0 = Date.now(), env = process.env;
  // Exploration: one level EXPLORE in [0,1] (loop.sh lowers it as the bot improves) scales every rate, same for every course.
  const X = +(env.EXPLORE ?? 1);
  const wd = { mode, net, course, H: +(env.HORIZON || 60), explore: X,
    eps: 0.03 * X,                 // a uniformly random legal action
    temp: Math.max(0.004, 0.02 * X), // softmax over action scores (near-best options tried often)
    buyEps: 0.10 * X,              // turns with one random purchase, and (same rate) turns where buying is off
    transEps: 0.10 * X };          // Transmitter turns with a forced pick (weighted toward expensive cards)
  const rs = await Promise.all(Array.from({ length: W }, () => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { ...wd, games: Math.ceil(+G / W), seed0: (Math.random() * 2 ** 31) | 0 } });
    w.on('message', res); w.on('error', rej);
  })));
  const st = {}; for (const r of rs) for (const k in r.st) { const v = r.st[k];
    if (Array.isArray(v)) st[k] = (st[k] || []).concat(v); else if (typeof v === 'object') { st[k] = st[k] || {}; for (const t in v) st[k][t] = (st[k][t] || 0) + v[t]; } else st[k] = (st[k] || 0) + v; }
  const avg = a => a && a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
  const r3 = st.seat3 ? st.win3 / st.seat3 : null, r4 = st.seat4 ? st.win4 / st.seat4 : null;
  // win rate relative to a fair share (1/3 in 3-player, 1/4 in 4-player); 1.0 = as good as the heuristic
  const rel = (st.seat3 || st.seat4) ? +((st.win3 + st.win4) / (st.seat3 / 3 + st.seat4 / 4)).toFixed(3) : null;
  const summary = { mode, horizon: wd.H, explore: X, games: +G, secs: (Date.now() - t0) / 1000, capped: st.capped, netWinRate: st.netSeats ? +(st.netWins / st.netSeats).toFixed(3) : null,
    win3p: r3 == null ? null : +r3.toFixed(3), win4p: r4 == null ? null : +r4.toFixed(3), vsFair: rel,
    netRemaining: avg(st.netRem), heurRemaining: avg(st.heurRem), netArrival: avg(st.netArr), heurArrival: avg(st.heurArr), buysNet: st.buysNet, buysHeur: st.buysHeur, transNet: st.transNet, transHeur: st.transHeur };
  if (out !== '-' && mode === 'self') {
    const nf = rs.find(r => r.nf)?.nf || 0, cat = (k, T) => { const a = new T(rs.reduce((s, r) => s + r[k].length, 0)); let o = 0; for (const r of rs) { a.set(r[k], o); o += r[k].length; } return a; };
    const Y = cat('Y', Float32Array), len = cat('len', Uint32Array), idx = cat('idx', Uint16Array), val = cat('val', Float32Array);
    for (const [k, a] of [['Y', Y], ['len', len], ['idx', idx], ['val', val]]) writeFileSync(`${out}.${k}.bin`, Buffer.from(a.buffer));
    writeFileSync(out + '.json', JSON.stringify({ n: Y.length, nf, nnz: val.length, ...summary }));
    summary.samples = Y.length;
  }
  console.log(JSON.stringify(summary));
}

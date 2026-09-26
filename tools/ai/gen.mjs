// Plays games on the real rules engine (no server) in parallel worker threads.
//   node tools/ai/gen.mjs <mode> <games> <out-prefix|-> [net.json] [course-id]
//   mode: heur  – heuristic bots (with a little noise), Monte-Carlo targets
//         self  – the net plays itself (25% of seats heuristic), TD(λ) targets from the net's own values
//         eval  – net vs 2 heuristic bots (3 players, seats rotated) + a net-only 3-player race; no samples
// Samples (sparse): <out>.len.bin (u32 non-zeros per row) .idx.bin (u16 columns) .val.bin (f32 values) .Y.bin (f32 target in [0,1]: 1 = won, 0 = last)
// Each row = the acting player's view right after one of its actions.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { E } from '../../src/engine.gen.js';
const LAMBDA = 0.7, CAP = 60;

if (!isMainThread) {
  const { mode, games, seed0, net, course } = workerData;
  const C = E.COURSES.find(c => c.id === course) || E.COURSES[0];
  if (net) E.setNet(net);
  let s = seed0 >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const X = [], Y = [], st = { netWins: 0, netSeats: 0, netArr: [], raceFirst: [], raceArr: [], heurArr: [], firstArr: [], capped: 0, buysNet: {}, buysHeur: {}, turnsNet: 0 };
  for (let g = 0; g < games; g++) {
    let pols;
    if (mode === 'heur') pols = Array(rnd() < .2 ? 2 : rnd() < .55 ? 3 : 4).fill('heur');
    else if (mode === 'self') { const np = rnd() < .2 ? 2 : rnd() < .55 ? 3 : 4; pols = Array.from({ length: np }, () => rnd() < .25 ? 'heur' : 'net'); if (!pols.includes('net')) pols[0] = 'net'; }
    else pols = g % 4 === 3 ? ['net', 'net', 'net'] : ['net', 'heur', 'heur'].map((_, i, a) => a[(i + g) % 3]);
    E.newGame({ course: C, seed: (rnd() * 2 ** 31) | 0, fullRace: true, players: pols.map((_, i) => ({ name: 'B' + i, color: '#fff' })) });
    const traj = pols.map(() => []); let acts = 0, lastMe = -1, lastRound = -1, turnState = null;
    const eps = mode === 'self' ? workerData.eps : 0;
    while (!E.S.over) {
      const S = E.S; S.log.length = 0;
      if (S.round > CAP || acts > 15000) { E.endGame(); st.capped++; break; }
      const me = S.cur, isNet = pols[me] === 'net';
      // exploration (self-play only): per turn, sometimes force one random purchase; per decision, softmax + a little uniform randomness
      if (me !== lastMe || S.round !== lastRound) { lastMe = me; lastRound = S.round; turnState = { forceBuy: mode === 'self' && isNet && rnd() < workerData.buyEps }; }
      const c = mode === 'eval' ? E.botChoose({ mode: isNet ? 'net' : 'heur', rnd })
        : isNet ? E.botChoose({ mode: 'net', eps, temp: workerData.temp, turnState, rnd })
        : E.botChoose({ mode: 'heur', eps: .03, noise: .3, rnd });
      if (c.a.t === 'buy' || c.a.t === 'transmit') { const stk = c.a.src === 'm' ? S.market[c.a.idx] : S.reserve[c.a.idx]; if (stk) { const b = isNet ? st.buysNet : st.buysHeur; b[stk.t] = (b[stk.t] || 0) + 1; } }
      if (c.a.t === 'end' && isNet) st.turnsNet++;
      const r = E.applyAction(me, c.a); acts++;
      if (!r.ok) E.applyAction(me, { t: 'end', keep: [] });
      if (mode !== 'eval' && !E.S.over) traj[me].push(E.botNetFeatures(me));
    }
    const S = E.S, n = pols.length, race = pols.every(p => p === 'net');
    S.players.forEach((p, i) => {
      if (mode !== 'eval') {
        const z = (n - S.places[i]) / (n - 1), T = traj[i]; let G = z;
        for (let t = T.length - 1; t >= 0; t--) { X.push(T[t]); Y.push(G); const v = mode === 'self' ? E.botNetValue(T[t]) : G; G = (1 - LAMBDA) * v + LAMBDA * G; }
      }
      if (race) { if (p.fin) st.raceArr.push(p.fin); }
      else if (pols[i] === 'net') { st.netSeats++; if (S.places[i] === 1) st.netWins++; if (p.fin) st.netArr.push(p.fin); }
      else if (p.fin) st.heurArr.push(p.fin);
    });
    const f = S.players.map(p => p.fin).filter(x => x); if (f.length) (race ? st.raceFirst : st.firstArr).push(Math.min(...f));
  }
  // sparse rows (most board slots are empty): row lengths + column indices + values
  const nf = X.length ? X[0].length : 0; let nnz = 0; for (const x of X) for (const v of x) if (v !== 0) nnz++;
  const len = new Uint32Array(X.length), idx = new Uint16Array(nnz), val = new Float32Array(nnz); let o = 0;
  X.forEach((x, i) => { let c = 0; for (let k = 0; k < x.length; k++) if (x[k] !== 0) { idx[o] = k; val[o++] = x[k]; c++; } len[i] = c; });
  parentPort.postMessage({ len, idx, val, Y: new Float32Array(Y), nf, st }, [len.buffer, idx.buffer, val.buffer]);
}

if (isMainThread) {
  const [, , mode = 'heur', G = '100', out = '-', netPath = '', course = 'first'] = process.argv;
  const net = netPath ? JSON.parse(readFileSync(netPath, 'utf8')) : null;
  const W = cpus().length, t0 = Date.now();
  const eps = +(process.env.EPS || 0.03), buyEps = +(process.env.BUYEPS || 0.1), temp = +(process.env.TEMP || 0.02);
  const rs = await Promise.all(Array.from({ length: W }, (_, i) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { mode, games: Math.ceil(+G / W), seed0: (Math.random() * 2 ** 31) | 0, net, course, eps, buyEps, temp } });
    w.on('message', res); w.on('error', rej);
  })));
  const st = {}; for (const r of rs) for (const k in r.st) { const v = r.st[k];
    if (Array.isArray(v)) st[k] = (st[k] || []).concat(v); else if (typeof v === 'object') { st[k] = st[k] || {}; for (const t in v) st[k][t] = (st[k][t] || 0) + v[t]; } else st[k] = (st[k] || 0) + v; }
  const avg = a => a && a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
  const summary = { mode, games: +G, secs: (Date.now() - t0) / 1000, capped: st.capped, netWinRate: st.netSeats ? +(st.netWins / st.netSeats).toFixed(3) : null,
    netArrival: avg(st.netArr), heurArrival: avg(st.heurArr), raceFirstArrival: avg(st.raceFirst), raceArrival: avg(st.raceArr), firstArrival: avg(st.firstArr), buysNet: st.buysNet, buysHeur: st.buysHeur, netTurns: st.turnsNet };
  if (out !== '-' && mode !== 'eval') {
    const n = rs.reduce((a, r) => a + r.Y.length, 0), nf = rs.find(r => r.nf)?.nf || 0, cat = (k, T) => { const a = new T(rs.reduce((s, r) => s + r[k].length, 0)); let o = 0; for (const r of rs) { a.set(r[k], o); o += r[k].length; } return a; };
    const Y = cat('Y', Float32Array), len = cat('len', Uint32Array), idx = cat('idx', Uint16Array), val = cat('val', Float32Array);
    for (const [k, a] of [['Y', Y], ['len', len], ['idx', idx], ['val', val]]) writeFileSync(`${out}.${k}.bin`, Buffer.from(a.buffer));
    writeFileSync(out + '.json', JSON.stringify({ n, nf, nnz: val.length, ...summary }));
    summary.samples = n; summary.nf = nf;
  }
  console.log(JSON.stringify(summary));
}

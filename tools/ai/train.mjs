// Self-play training for the El Dorado bot (TD-Gammon style afterstate values).
//   node tools/ai/train.mjs [iterations=40] [gamesPerIter=400]
// Workers play games on the real rules engine; the main thread trains a small MLP
// (506 inputs → 128 → 64 → 1, sigmoid = expected finishing score, 1 = win, 0 = last).
// Iteration 0 learns the heuristic bot's outcomes (so the net starts out finishing games);
// later iterations play the net against itself (plus some heuristic opponents) and learn TD(λ) targets.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { E } from '../../src/engine.gen.js';

const NF = E.BOT_NF, H1 = 128, H2 = 64, LAMBDA = 0.7, CAP = 60;
const DIR = new URL('.', import.meta.url).pathname;

/* ------------------------------------------------ worker: play games, return (features, targets) */
if (!isMainThread) {
  const { net, games, seed0, mode, eps } = workerData;
  if (net) E.setNet(net);
  const X = [], Y = [], stats = { first: [], arr: [], netWins: 0, netGames: 0, netArr: [] };
  let s = seed0 >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let g = 0; g < games; g++) {
    const np = mode === 'eval' ? 3 : rnd() < 0.2 ? 2 : rnd() < 0.55 ? 3 : 4;
    // who plays: iteration 0 = all heuristic; later = mostly net self-play, sometimes vs heuristic
    const pols = Array.from({ length: np }, () => mode === 'heur' ? 'heur' : (rnd() < 0.25 ? 'heur' : 'net'));
    if (mode !== 'heur' && !pols.includes('net')) pols[0] = 'net';
    // maps: the real First Expedition 30% of the time, otherwise a random training course (seeds 1–500; 900+ are held out)
    const course = mode === 'eval' ? (g % 2 ? E.COURSES[0] : E.botRandomCourse(900 + (g % 10), 3 + (g % 3)))
      : rnd() < 0.3 ? E.COURSES[0] : (E.botRandomCourse(1 + Math.floor(rnd() * 500), 3 + Math.floor(rnd() * 3)) || E.COURSES[0]);
    if (mode === 'eval') { pols.length = 0; pols.push('net', 'heur', 'heur'); const r0 = g % 3; for (let q = 0; q < r0; q++) pols.push(pols.shift()); }
    E.newGame({ course, seed: (rnd() * 2 ** 31) | 0, fullRace: true, players: pols.map((_, i) => ({ name: 'B' + i, color: '#fff' })) });
    const traj = pols.map(() => []); let acts = 0;
    while (!E.S.over) {
      const S = E.S; S.log.length = 0;
      if (S.round > CAP || acts > 15000) { E.endGame(); break; }
      const me = S.cur;
      const useNet = pols[me] === 'net';
      const ev = mode === 'eval';
      const c = E.botChoose({ mode: useNet ? 'net' : 'heur', eps: ev ? 0 : useNet ? eps : 0.03, noise: ev ? 0 : useNet ? 0.02 : 0.3, rnd });
      const r = E.applyAction(me, c.a); acts++;
      if (!r.ok) E.applyAction(me, { t: 'end', keep: [] });
      if (!E.S.over && mode !== 'eval') traj[me].push(E.botFeatures(me)); // afterstate from my point of view
    }
    const S = E.S, n = np;
    S.players.forEach((p, i) => {
      const z = (n - S.places[i]) / (n - 1); const T = traj[i];
      // TD(λ) targets backwards: G_T = z, G_t = (1-λ) V(x_{t+1}) + λ G_{t+1}
      let G = z;
      for (let t = T.length - 1; t >= 0; t--) {
        X.push(T[t]); Y.push(G);
        const v = mode === 'heur' || !net ? G : E.botValueOfFeatures(T[t]);
        G = (1 - LAMBDA) * v + LAMBDA * G;
      }
      if (p.fin) stats.arr.push(p.fin);
      if (pols[i] === 'net') { stats.netGames++; if (S.places[i] === 1) stats.netWins++; if (p.fin) stats.netArr.push(p.fin); }
    });
    const f = S.players.map(p => p.fin).filter(x => x); if (f.length) stats.first.push(Math.min(...f));
  }
  const flat = new Float32Array(X.length * NF); X.forEach((x, i) => flat.set(x, i * NF));
  parentPort.postMessage({ X: flat, Y: new Float32Array(Y), stats }, [flat.buffer]);
}

/* ------------------------------------------------ main: orchestrate + train */
if (isMainThread) {
  const [, , ITER = '40', GPI = '400'] = process.argv;
  const W = Math.max(1, cpus().length);
  const log = m => { console.log(m); appendFileSync(DIR + 'train.log', m + '\n'); };
  const randn = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
  const init = (n, fanIn) => Array.from({ length: n }, () => randn() * Math.sqrt(2 / fanIn));
  let net = existsSync(DIR + 'net.json') ? JSON.parse(readFileSync(DIR + 'net.json', 'utf8')) : null;
  const fresh = !net;
  if (!net) net = { h1: H1, h2: H2, w1: init(H1 * NF, NF), b1: Array(H1).fill(0), w2: init(H2 * H1, H1), b2: Array(H2).fill(0), w3: init(H2, H2), b3: [0] };
  // Adam state
  const P = ['w1', 'b1', 'w2', 'b2', 'w3', 'b3'];
  const m = {}, v = {}; P.forEach(k => { m[k] = new Float64Array(net[k].length); v[k] = new Float64Array(net[k].length); });
  let step = 0;
  function trainOn(X, Y, epochs, lr) {
    const N = Y.length, idx = Array.from({ length: N }, (_, i) => i), B = 256;
    const w = {}; P.forEach(k => { w[k] = Float64Array.from(net[k]); });
    const h1 = new Float64Array(H1), h2 = new Float64Array(H2), d1 = new Float64Array(H1), d2 = new Float64Array(H2);
    let loss = 0, cnt = 0;
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      for (let b0 = 0; b0 < N; b0 += B) {
        const g = {}; P.forEach(k => { g[k] = new Float64Array(w[k].length); });
        const bn = Math.min(B, N - b0);
        for (let q = 0; q < bn; q++) {
          const s = idx[b0 + q], o = s * NF, y = Y[s];
          for (let j = 0; j < H1; j++) { let a = w.b1[j]; const r = j * NF; for (let k = 0; k < NF; k++) a += w.w1[r + k] * X[o + k]; h1[j] = a > 0 ? a : .01 * a; }
          for (let j = 0; j < H2; j++) { let a = w.b2[j]; const r = j * H1; for (let k = 0; k < H1; k++) a += w.w2[r + k] * h1[k]; h2[j] = a > 0 ? a : .01 * a; }
          let a = w.b3[0]; for (let k = 0; k < H2; k++) a += w.w3[k] * h2[k];
          const p = 1 / (1 + Math.exp(-a)); loss += (p - y) ** 2; cnt++;
          const dz = p - y; // cross-entropy gradient
          g.b3[0] += dz;
          for (let k = 0; k < H2; k++) { g.w3[k] += dz * h2[k]; d2[k] = dz * w.w3[k] * (h2[k] > 0 ? 1 : .01); }
          for (let j = 0; j < H2; j++) { const r = j * H1; g.b2[j] += d2[j]; for (let k = 0; k < H1; k++) g.w2[r + k] += d2[j] * h1[k]; }
          for (let k = 0; k < H1; k++) { let s2 = 0; for (let j = 0; j < H2; j++) s2 += d2[j] * w.w2[j * H1 + k]; d1[k] = s2 * (h1[k] > 0 ? 1 : .01); }
          for (let j = 0; j < H1; j++) { const r = j * NF; g.b1[j] += d1[j]; if (d1[j] !== 0) for (let k = 0; k < NF; k++) g.w1[r + k] += d1[j] * X[o + k]; }
        }
        step++; const b1c = 1 - 0.9 ** step, b2c = 1 - 0.999 ** step;
        for (const k of P) { const gw = g[k], mw = m[k], vw = v[k], ww = w[k];
          for (let i = 0; i < ww.length; i++) { const gi = gw[i] / bn; mw[i] = .9 * mw[i] + .1 * gi; vw[i] = .999 * vw[i] + .001 * gi * gi; ww[i] -= lr * (mw[i] / b1c) / (Math.sqrt(vw[i] / b2c) + 1e-8); } }
      }
    }
    P.forEach(k => { net[k] = Array.from(w[k], x => Math.round(x * 1e6) / 1e6); });
    return Math.sqrt(loss / cnt);
  }
  const runGames = (mode, games, eps) => Promise.all(Array.from({ length: W }, (_, i) => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { net: mode === 'heur' ? null : net, games: Math.ceil(games / W), seed0: (Math.random() * 2 ** 31) | 0, mode, eps } });
    wk.on('message', res); wk.on('error', rej);
  })));
  const merge = rs => { const n = rs.reduce((a, r) => a + r.Y.length, 0); const X = new Float32Array(n * NF), Y = new Float32Array(n); let o = 0;
    for (const r of rs) { X.set(r.X, o * NF); Y.set(r.Y, o); o += r.Y.length; }
    const st = { first: [], arr: [], netWins: 0, netGames: 0, netArr: [] }; for (const r of rs) for (const k in st) st[k] = Array.isArray(st[k]) ? st[k].concat(r.stats[k]) : st[k] + r.stats[k];
    return { X, Y, st }; };
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : '-';
  let replay = [];
  (async () => {
    if (fresh) {
      const t0 = Date.now(); const d = merge(await runGames('heur', +GPI * 2, 0));
      const e = trainOn(d.X, d.Y, 6, 2e-3);
      log(`iter 0 (learn heuristic outcomes): ${d.Y.length} samples, rmse ${e.toFixed(3)}, heuristic first arrival ${avg(d.st.first)}, ${(Date.now() - t0) / 1000}s`);
      writeFileSync(DIR + 'net.json', JSON.stringify(net));
    }
    for (let it = 1; it <= +ITER; it++) {
      const t0 = Date.now(); const eps = Math.max(0.02, 0.08 - it * 0.003);
      const d = merge(await runGames('net', +GPI, eps));
      replay.push(d); if (replay.length > 3) replay.shift();
      const X = new Float32Array(replay.reduce((a, r) => a + r.X.length, 0)), Y = new Float32Array(replay.reduce((a, r) => a + r.Y.length, 0));
      let o = 0; for (const r of replay) { X.set(r.X, o * NF); Y.set(r.Y, o); o += r.Y.length; }
      const e = trainOn(X, Y, 2, 1e-3);
      writeFileSync(DIR + 'net.json', JSON.stringify(net));
      if (it % 3 === 0) { const q = merge(await runGames('eval', 120, 0));
        log(`   eval (net vs 2 heuristic bots, 3-player, half First Expedition / half held-out random maps): net wins ${(q.st.netWins / q.st.netGames * 100).toFixed(0)}% (fair share 33%), net arrival round ${avg(q.st.netArr)}`); }
      log(`iter ${it}: ${d.Y.length} samples, rmse ${e.toFixed(3)}, net win rate ${(d.st.netWins / d.st.netGames * 100).toFixed(0)}% (${d.st.netGames} seats, incl. vs heuristic), net arrival round ${avg(d.st.netArr)}, first arrival ${avg(d.st.first)}, ${(Date.now() - t0) / 1000}s`);
    }
  })();
}

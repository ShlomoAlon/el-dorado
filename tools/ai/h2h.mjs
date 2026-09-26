// Head-to-head: policy A vs policy B, 3- and 4-player games (1 A vs rest B, and 2v2 in 4p), seats rotated, fixed seeds.
//   node tools/ai/h2h.mjs <A> <B> [games=240] [workers=2]
//   A/B: plan | heur | net (tools/ai/data/first.net.json) | any planner candidate named in PLANS
//   PLANS='{"planB":{"safeTrash":1}}' defines candidate planner settings (see BOT_PLAN_DEF in src/engine_bot.js).
//   Games stop at round 25; anyone who hasn't arrived by then counts as a loss.
import { E } from '../../src/engine.gen.js';
import { readFileSync, existsSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const setup = () => {
  for (const [k, o] of Object.entries(JSON.parse(process.env.PLANS || '{}'))) E.setPlan(k, o);
};
if (!isMainThread) {
  setup();
  const { A, B, from, to } = workerData;
  if ([A, B].includes('net') && existsSync('tools/ai/data/first.net.json')) E.setNet(JSON.parse(readFileSync('tools/ai/data/first.net.json', 'utf8')));
  const r = { wA: 0, expA: 0, seatsA: 0, arrA: [], arrB: [], capA: 0, capB: 0 };
  for (let g = from; g < to; g++) {
    const n = g % 2 ? 4 : 3, nA = n === 4 && g % 4 === 3 ? 2 : 1;
    const base = [...Array(nA).fill(A), ...Array(n - nA).fill(B)], rot = Math.floor(g / 2) % n, pols = base.map((_, i) => base[(i + rot) % n]);
    E.newGame({ course: E.COURSES[0], seed: 20000 + g, fullRace: true, players: pols.map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
    let acts = 0;
    while (!E.S.over) { E.S.log.length = 0; if (E.S.round > 25 || acts++ > 20000) { E.endGame(); break; }
      const me = E.S.cur, res = E.applyAction(me, E.botChoose({ mode: pols[me] }).a); if (!res.ok) E.applyAction(me, { t: 'end', keep: [] }); }
    E.S.players.forEach((p, i) => { const isA = pols[i] === A;
      if (isA) { r.seatsA++; r.expA += 1 / n; if (E.S.places[i] === 1 && p.fin) r.wA++; }
      if (p.fin) (isA ? r.arrA : r.arrB).push(p.fin); else r[isA ? 'capA' : 'capB']++; });
  }
  parentPort.postMessage(r);
} else {
  const [, , A = 'plan', B = 'heur', G = '240', W = '2'] = process.argv, t0 = Date.now();
  const per = Math.ceil(+G / +W);
  const parts = await Promise.all([...Array(+W)].map((_, w) => new Promise((ok, bad) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { A, B, from: w * per, to: Math.min(+G, (w + 1) * per) } });
    wk.on('message', ok); wk.on('error', bad);
  })));
  const T = { wA: 0, expA: 0, seatsA: 0, arrA: [], arrB: [], capA: 0, capB: 0 };
  for (const p of parts) for (const k in T) T[k] = Array.isArray(T[k]) ? T[k].concat(p[k]) : T[k] + p[k];
  const avg = a => (a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2);
  const fair = T.wA / T.expA;
  console.log(`${A} vs ${B}: ${G} games (3p/4p): ${A} wins ${T.wA}/${T.seatsA} seats = ${fair.toFixed(2)}× its fair share · arrival round ${A} ${avg(T.arrA)} vs ${B} ${avg(T.arrB)} · not arrived by 25: ${A} ${T.capA}, ${B} ${T.capB} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(JSON.stringify({ A, B, games: +G, fair: +fair.toFixed(3), arrA: +avg(T.arrA), arrB: +avg(T.arrB), capA: T.capA, capB: T.capB }));
}

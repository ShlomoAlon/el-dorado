// Four-way test between networks with / without the whole-turn planner, seats rotated, fixed seeds.
//   node tools/ai/versus.mjs [games per table size=96] [workers=4]
//   seats: old+search / old / new+search / new (old = tools/ai/models/first-td-evaluated.json, new = NEW or tools/ai/data/first-plan.net.json)
//   4-player games: all four; 3-player games: each set of three in turn. Games stop at round 25 (not arrived = no win).
import { E } from '../../src/engine.gen.js';
import { readFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const POLS = ['old+search', 'old', 'new+search', 'new'];
if (!isMainThread) {
  const { from, to, nets } = workerData, r = {};
  for (let g = from; g < to; g++) {
    const n = g % 2 ? 4 : 3, k = g >> 1, base = n === 4 ? POLS : POLS.filter((_, i) => i !== k % 4);
    const pols = base.map((_, i) => base[(i + (k >> 2)) % n]);
    E.newGame({ course: E.COURSES[0], seed: 90000 + g, fullRace: true, players: pols.map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
    let capped = false; const rnd = E.mulberry32(777 + g);
    while (!E.S.over) { E.S.log.length = 0; if (E.S.round > 25) { capped = true; E.endGame(); break; }
      const me = E.S.cur, p = pols[me]; E.setNet(p.startsWith('old') ? nets.old : nets.new);
      const c = E.botChoose({ mode: 'net', rnd, search: p.endsWith('+search') ? { kind: 'plan', beam: 3 } : undefined });
      if (!E.applyAction(me, c.a).ok) E.applyAction(me, { t: 'end', keep: [] }); }
    pols.forEach((p, i) => { const t = (r['p' + n] = r['p' + n] || {})[p] = r['p' + n][p] || { seats: 0, wins: 0, arr: 0, arrN: 0 }; const P = E.S.players[i];
      t.seats++; if (E.S.places[i] === 1 && !(capped && !P.fin)) t.wins++; if (P.fin) { t.arr += P.fin; t.arrN++; } });
  }
  parentPort.postMessage(r);
} else {
  const G = 2 * +(process.argv[2] || 96), W = +(process.argv[3] || 4), t0 = Date.now();
  const nets = { old: JSON.parse(readFileSync('tools/ai/models/first-td-evaluated.json', 'utf8')), new: JSON.parse(readFileSync(process.env.NEW || 'tools/ai/data/first-plan.net.json', 'utf8')) };
  const per = Math.ceil(G / W);
  const parts = await Promise.all([...Array(W)].map((_, w) => new Promise((ok, bad) => { const wk = new Worker(new URL(import.meta.url), { workerData: { from: w * per, to: Math.min(G, (w + 1) * per), nets } }); wk.on('message', ok); wk.on('error', bad); })));
  const T = {}; for (const p of parts) for (const s in p) for (const k in p[s]) { const a = (T[s] = T[s] || {})[k] = T[s][k] || { seats: 0, wins: 0, arr: 0, arrN: 0 }; for (const f in a) a[f] += p[s][k][f]; }
  for (const s of ['p3', 'p4']) { const tot = Object.values(T[s]).reduce((a, x) => a + x.wins, 0);
    console.log(`${s === 'p3' ? '3-player' : '4-player'} (${G / 2} games): ` + POLS.map(k => `${k} ${(T[s][k].wins / tot * 100).toFixed(0)}% (${T[s][k].wins}/${T[s][k].seats} seats, arrives r${(T[s][k].arr / T[s][k].arrN).toFixed(1)})`).join(' · ')); }
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

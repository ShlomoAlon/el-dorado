// Deep planner vs the regular whole-turn planner, same network for everyone (experiment; not used by training or play).
//   node tools/ai/deep.mjs [games=40] [workers=4] [depth=2] [budget=15000]   NET=path (default tools/ai/data/first.net.json)
// One deep seat vs regular planners (beam 3); 3- and 4-player games alternate, seats rotated, fixed seeds.
// Deep = the planner's best 3 complete turns, each played forward `depth` more of my turns by everyone using the planner
// (hidden cards re-dealt at random), successive halving over `budget` network evaluations (≈ 3,650 per CPU-second).
// Writes one line per game to tools/ai/data/deep-<depth>.jsonl and a summary at the end.
import { E } from '../../src/engine.gen.js';
import { readFileSync, appendFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
if (!isMainThread) {
  const { from, to, net, depth, budget, out } = workerData; E.setNet(net);
  const r = { wD: 0, seatsD: 0, expD: 0, wP: 0, seatsP: 0, arrD: [], arrP: [], cpuD: 0, turnsD: 0, dec: 0, changed: 0, playouts: 0 };
  for (let g = from; g < to; g++) {
    const n = g % 2 ? 4 : 3, rot = (g >> 1) % n, pols = [...Array(n)].map((_, i) => i === rot ? 'deep' : 'plan');
    E.newGame({ course: E.COURSES[0], seed: 30000 + g, fullRace: true, players: pols.map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
    const rnd = E.mulberry32(99 + g); let capped = false, cpu = 0, turns = 0, last = -1, lastR = -1;
    let acts = 0;
    while (!E.S.over) { E.S.log.length = 0; if (E.S.round > 25 || acts++ > 20000) { capped = true; E.endGame(); break; }
      const me = E.S.cur, deep = pols[me] === 'deep'; if (deep && (me !== last || E.S.round !== lastR)) turns++; last = me; lastR = E.S.round;
      const t0 = process.cpuUsage();
      const c = E.botChoose({ mode: 'net', rnd, search: deep ? { kind: 'deep', beam: 3, depth, budget, cands: 3 } : { kind: 'plan', beam: 3 } });
      if (deep) { const u = process.cpuUsage(t0); cpu += (u.user + u.system) / 1e6; if (c.deep) { r.dec++; r.playouts += c.deep.playouts; if (c.why === 'deep-changed') r.changed++; } }
      if (!E.applyAction(me, c.a).ok) E.applyAction(me, { t: 'end', keep: [] }); }
    const res = pols.map((p, i) => ({ p, place: E.S.places[i], fin: E.S.players[i].fin || null }));
    for (const x of res) { const win = x.place === 1 && !(capped && !x.fin);
      if (x.p === 'deep') { r.seatsD++; r.expD += 1 / n; if (win) r.wD++; if (x.fin) r.arrD.push(x.fin); } else { r.seatsP++; if (win) r.wP++; if (x.fin) r.arrP.push(x.fin); } }
    r.cpuD += cpu; r.turnsD += turns;
    appendFileSync(out, JSON.stringify({ time: new Date().toISOString(), g, n, capped, players: res, deepCpuSec: +cpu.toFixed(1), deepTurns: turns }) + '\n');
  }
  parentPort.postMessage(r);
} else {
  const [, , G = '40', W = '4', D = '2', B = '15000'] = process.argv, t0 = Date.now();
  const net = JSON.parse(readFileSync(process.env.NET || 'tools/ai/data/first.net.json', 'utf8')), out = `tools/ai/data/deep-${D}.jsonl`, per = Math.ceil(+G / +W);
  const parts = await Promise.all([...Array(+W)].map((_, w) => new Promise((ok, bad) => { const wk = new Worker(new URL(import.meta.url), { workerData: { from: w * per, to: Math.min(+G, (w + 1) * per), net, depth: +D, budget: +B, out } }); wk.on('message', ok); wk.on('error', bad); })));
  const T = parts.reduce((a, p) => { for (const k in p) a[k] = Array.isArray(p[k]) ? (a[k] || []).concat(p[k]) : (a[k] || 0) + p[k]; return a; }, {});
  const avg = a => (a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2), fair = T.wD / T.expD, se = Math.sqrt(T.expD * (1 - T.expD / T.seatsD)) / T.expD;
  console.log(`deep (depth ${D}, budget ${B}) vs planner: ${G} games · deep wins ${T.wD}/${T.seatsD} = ${fair.toFixed(2)}× its fair share (± ${(1.96 * se).toFixed(2)}) · planner seats win ${T.wP}/${T.seatsP}`);
  console.log(`  arrival round: deep ${avg(T.arrD)} vs planner ${avg(T.arrP)} · deep thinking ${(T.cpuD / T.turnsD).toFixed(1)} CPU-s per turn · overruled the planner's choice in ${T.changed}/${T.dec} decisions · ${(T.playouts / T.dec).toFixed(0)} playouts per decision · ${((Date.now() - t0) / 60000).toFixed(0)} min`);
}

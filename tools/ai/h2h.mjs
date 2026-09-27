// Head-to-head: policy A vs policy B, 3- and 4-player games (1 A vs rest B, and 2v2 in 4p), seats rotated, fixed seeds.
//   node tools/ai/h2h.mjs <A> <B> [games=240] [workers=2]
//   A/B: plan | heur | net (tools/ai/data/first.net.json) | net+turn | net+roll | any planner candidate named in PLANS
//   net+planN = net with the whole-turn planner, beam N (e.g. net+plan3, net+plan10)
//   net+turn = net with turn search (SEARCH_W, SEARCH_D); net+roll = net with rollouts on close calls (ROLL_C, ROLL_M, ROLL_MARGIN)
//   PLANS='{"planB":{"safeTrash":1}}' defines candidate planner settings (see BOT_PLAN_DEF in src/engine_bot.js).
//   Games stop at round 25; anyone who hasn't arrived by then counts as a loss.
import { E } from '../../src/engine.gen.js';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const env = process.env;
const optsFor = pol => /^net\+plan\d+$/.test(pol) ? { mode: 'net', search: { kind: 'plan', beam: +pol.slice(8) } }
  : pol === 'net+turn' ? { mode: 'net', search: { kind: 'turn', width: +(env.SEARCH_W || 3), depth: +(env.SEARCH_D || 4) } }
  : pol === 'net+roll' ? { mode: 'net', search: { kind: 'rollout', cands: +(env.ROLL_C || 3), sims: +(env.ROLL_M || 6), margin: +(env.ROLL_MARGIN || .03) } }
  : { mode: pol };
const setup = () => {
  for (const [k, o] of Object.entries(JSON.parse(process.env.PLANS || '{}'))) E.setPlan(k, o);
};
if (!isMainThread) {
  setup();
  const { A, B, from, to } = workerData;
  if ([A, B].some(x => x.startsWith('net')) && existsSync('tools/ai/data/first.net.json')) E.setNet(JSON.parse(readFileSync('tools/ai/data/first.net.json', 'utf8')));
  const r = { wA: 0, expA: 0, seatsA: 0, arrA: [], arrB: [], capA: 0, capB: 0, pvA: 0, pvB: 0, seatsB: 0, evA: 0, evB: 0, cpuA: 0, cpuB: 0, decA: 0, decB: 0 };
  for (let g = from; g < to; g++) {
    const n = g % 2 ? 4 : 3, nA = n === 4 && g % 4 === 3 ? 2 : 1;
    const base = [...Array(nA).fill(A), ...Array(n - nA).fill(B)], rot = Math.floor(g / 2) % n, pols = base.map((_, i) => base[(i + rot) % n]);
    E.newGame({ course: E.COURSES[0], seed: 20000 + g, fullRace: true, players: pols.map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
    let acts = 0, capped = false; const g0 = { evA: r.evA, evB: r.evB, cpuA: r.cpuA, cpuB: r.cpuB, decA: r.decA, decB: r.decB };
    while (!E.S.over) { E.S.log.length = 0; if (E.S.round > 25 || acts++ > 20000) { capped = true; E.endGame(); break; }
      const me = E.S.cur, e0 = E.BOT_EVALS, t0 = process.cpuUsage(), ch = E.botChoose(optsFor(pols[me])), u = process.cpuUsage(t0), sd = pols[me] === A ? 'A' : 'B';
      r['ev' + sd] += E.BOT_EVALS - e0; r['cpu' + sd] += (u.user + u.system) / 1000; r['dec' + sd]++; const res = E.applyAction(me, ch.a); if (!res.ok) E.applyAction(me, { t: 'end', keep: [] }); }
    E.S.players.forEach((p, i) => { const isA = pols[i] === A;
      const pv = capped && !p.fin ? 0 : E.botPlaceValue(E.S.places[i], n); if (isA) r.pvA += pv; else { r.pvB += pv; r.seatsB++; }
      if (isA) { r.seatsA++; r.expA += 1 / n; if (E.S.places[i] === 1 && !(capped && !p.fin)) r.wA++; }
      if (p.fin) (isA ? r.arrA : r.arrB).push(p.fin); else if (capped) r[isA ? 'capA' : 'capB']++; });
    // one line per finished game for the live report (LOGJSONL=path)
    if (process.env.LOGJSONL) appendFileSync(process.env.LOGJSONL, JSON.stringify({ time: new Date().toISOString(), A, B, g, n, capped, rounds: E.S.round,
      players: pols.map((pol, i) => ({ pol, place: E.S.places[i], arrived: E.S.players[i].fin || null })),
      cost: Object.fromEntries(['evA', 'evB', 'cpuA', 'cpuB', 'decA', 'decB'].map(k => [k, +(r[k] - g0[k]).toFixed(1)])) }) + '\n');
  }
  parentPort.postMessage(r);
} else {
  const [, , A = 'plan', B = 'heur', G = '240', W = '2'] = process.argv, t0 = Date.now();
  const per = Math.ceil(+G / +W);
  const parts = await Promise.all([...Array(+W)].map((_, w) => new Promise((ok, bad) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { A, B, from: w * per, to: Math.min(+G, (w + 1) * per) } });
    wk.on('message', ok); wk.on('error', bad);
  })));
  const T = { wA: 0, expA: 0, seatsA: 0, arrA: [], arrB: [], capA: 0, capB: 0, pvA: 0, pvB: 0, seatsB: 0, evA: 0, evB: 0, cpuA: 0, cpuB: 0, decA: 0, decB: 0 };
  for (const p of parts) for (const k in T) T[k] = Array.isArray(T[k]) ? T[k].concat(p[k]) : T[k] + p[k];
  const avg = a => (a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2);
  const fair = T.wA / T.expA;
  console.log(`${A} vs ${B}: ${G} games (3p/4p): ${A} wins ${T.wA}/${T.seatsA} seats = ${fair.toFixed(2)}× its fair share · arrival round ${A} ${avg(T.arrA)} vs ${B} ${avg(T.arrB)} · not arrived by 25: ${A} ${T.capA}, ${B} ${T.capB} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const se = Math.sqrt(T.expA * (1 - T.expA / T.seatsA)) / T.expA; // rough standard error of the fair-share ratio
  console.log(`  ± ${(1.96 * se).toFixed(2)} (95%) · avg place value ${A} ${(T.pvA / T.seatsA).toFixed(3)} vs ${B} ${(T.pvB / T.seatsB).toFixed(3)} · cost per move: ${A} ${(T.evA / T.decA).toFixed(0)} evals, ${(T.cpuA / T.decA).toFixed(1)} ms · ${B} ${(T.evB / T.decB).toFixed(0)} evals, ${(T.cpuB / T.decB).toFixed(1)} ms → ${((T.cpuA / T.decA) / (T.cpuB / T.decB)).toFixed(1)}× CPU`);
  console.log(JSON.stringify({ A, B, games: +G, fair: +fair.toFixed(3), arrA: +avg(T.arrA), arrB: +avg(T.arrB), capA: T.capA, capB: T.capB }));
}

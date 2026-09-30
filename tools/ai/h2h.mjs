// Head-to-head of two AI settings on First Expedition (the shipped network), for choosing the site's AI levels.
//   node tools/ai/h2h.mjs '<A json>' '<B json>' [games=200] [workers=3]
//   A, B: bot options as in AIS[].opts, e.g. '{"mode":"net","search":{"kind":"plan","beam":3}}'
// Games alternate 3 and 4 players with A and B seated as evenly as possible, seats rotated. Reported: wins, mean place,
// and each setting's thinking time per turn (ms, on this machine) and network evaluations per turn.
import * as E from '../../src/engine.gen.js';
import { playout, seatPlayers } from './playout.mjs';
import { readFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
if (!isMainThread) {
  const { from, to, A, B, seed0 } = workerData;
  E.aiSetNet(E.aiNetDecode(readFileSync(new URL('../../src/ai/first.bin', import.meta.url))));
  E.AIS.push({ id: 'hA', name: 'A', opts: A }, { id: 'hB', name: 'B', opts: B });
  for (let g = from; g < to; g++) {
    const n = g % 2 ? 4 : 3, base = n === 4 ? ['hA', 'hB', 'hA', 'hB'] : (g >> 1) % 2 ? ['hA', 'hB', 'hB'] : ['hA', 'hA', 'hB'];
    const r = (g >> 2) % n, ids = base.map((_, i) => base[(i + r) % n]);
    const mem = ids.map(() => ({})), t = { hA: [0, 0, 0], hB: [0, 0, 0] }; let turnKey = '';
    const { gs, capped } = playout({ seed: seed0 + g, players: seatPlayers(ids.length, ids), choose: (gs, me) => { // (timed: the AI's thinking)
      const k = me + ':' + gs.round, id = ids[me], e0 = E.BOT_EVALS, t0 = performance.now(), a = E.aiChoose(gs, id, mem[me]);
      t[id][0] += performance.now() - t0; t[id][1] += E.BOT_EVALS - e0; if (k !== turnKey) { t[id][2]++; turnKey = k; }
      return a; } });
    parentPort.postMessage({ n, seats: ids.map((id, i) => ({ id, place: capped && !gs.players[i].fin ? n : gs.places[i] })), t });
  }
  parentPort.postMessage({ done: true });
} else {
  const [, , a, b, G = '200', W = '3'] = process.argv, A = JSON.parse(a), B = JSON.parse(b), N = +G, per = Math.ceil(N / +W), seed0 = 700000 + Math.floor(Math.random() * 1e5) * 10;
  const tally = { hA: { w: 0, s: 0, pl: 0, ms: 0, ev: 0, turns: 0 }, hB: { w: 0, s: 0, pl: 0, ms: 0, ev: 0, turns: 0 } }, t0 = Date.now();
  await Promise.all([...Array(+W)].map((_, w) => new Promise((ok, bad) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { from: w * per, to: Math.min(N, (w + 1) * per), A, B, seed0 } });
    wk.on('message', m => { if (m.done) return ok();
      for (const s of m.seats) { const T = tally[s.id]; T.s++; T.pl += (s.place - 1) / (m.n - 1); if (s.place === 1) T.w++; }
      for (const id of ['hA', 'hB']) { tally[id].ms += m.t[id][0]; tally[id].ev += m.t[id][1]; tally[id].turns += m.t[id][2]; } });
    wk.on('error', bad); })));
  const f = id => { const T = tally[id]; return `${id === 'hA' ? 'A' : 'B'}: wins ${T.w}/${T.s} (${(100 * T.w / T.s).toFixed(1)}% of seats), mean place ${(T.pl / T.s).toFixed(3)} (0 best, 1 last), ${Math.round(T.ms / T.turns)} ms and ${Math.round(T.ev / T.turns)} evals per turn`; };
  console.log(`${N} games in ${((Date.now() - t0) / 1000).toFixed(0)} s\n${f('hA')}\n${f('hB')}`);
}

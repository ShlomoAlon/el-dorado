// Arrival benchmark: in which round does each network reach El Dorado? Same seeds and opponents for every network.
//   node tools/ai/arrival.mjs [games=120] [workers=4] name[=path] ...   (name = tools/ai/models/<name>.json)
// Each network plays 3-player games against two heuristic planners (the fixed benchmark), once plain and once with search.
// The game runs until the network arrives (or round 30), so its arrival round never depends on the race ending early.
// Writes tools/ai/data/arrival.jsonl (one line per network and mode) and prints mean / median / 90th percentile.
import * as E from '../../src/engine.gen.js';
import { playout, seatPlayers } from './playout.mjs';
import { readFileSync, appendFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
if (!isMainThread) {
  const { net, search, from, to } = workerData; E.aiSetNet(net); const out = [];
  for (let g = from; g < to; g++) {
    const seat = g % 3, rnd = E.mulberry32(5000 + g), planMem = { plan: null };
    const { gs } = playout({ seed: 70000 + g, players: seatPlayers(3), cap: 30, stop: gs => gs.players[seat].fin,
      choose: (gs, me) => (me === seat ? E.botChoose(gs, { mode: 'net', rnd, search: search ? { kind: 'plan', beam: 3 } : undefined, planMem }) : E.botChoose(gs, { mode: 'plan', rnd })).a });
    out.push(gs.players[seat].fin || null);
  }
  parentPort.postMessage(out);
} else {
  const args = process.argv.slice(2), G = +(args[0] || 120), W = +(args[1] || 4), nets = args.slice(2);
  for (const spec of nets) { const [name, path] = spec.includes('=') ? spec.split('=') : [spec, `tools/ai/models/${spec}.json`]; const net = JSON.parse(readFileSync(path, 'utf8'));
    for (const search of [false, true]) { const per = Math.ceil(G / W);
      const parts = await Promise.all([...Array(W)].map((_, w) => new Promise((ok, bad) => { const wk = new Worker(new URL(import.meta.url), { workerData: { net, search, from: w * per, to: Math.min(G, (w + 1) * per) } }); wk.on('message', ok); wk.on('error', bad); })));
      const f = parts.flat(), got = f.filter(x => x).sort((a, b) => a - b), q = p => got[Math.min(got.length - 1, Math.floor(got.length * p))];
      const r = { time: new Date().toISOString(), name, search, games: G, arrived: got.length, mean: +(got.reduce((a, x) => a + x, 0) / got.length).toFixed(2), median: q(.5), p90: q(.9) };
      appendFileSync('tools/ai/data/arrival.jsonl', JSON.stringify(r) + '\n');
      console.log(`${(name + (search ? ' +search' : '')).padEnd(26)} arrives round: mean ${r.mean} · median ${r.median} · 90% by ${r.p90} · arrived ${got.length}/${G}`); } }
}

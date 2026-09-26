// Head-to-head: policy A vs policy B, 3- and 4-player games (1 A vs rest B, and 2v2 in 4p), seats rotated.
//   node tools/ai/h2h.mjs <A> <B> [games=200]      A/B: heur | heur2 | net (net = tools/ai/data/first.net.json)
import { E } from '../../src/engine.gen.js';
import { readFileSync, existsSync } from 'node:fs';
const [, , A = 'heur2', B = 'heur', G = '200'] = process.argv;
if ([A, B].includes('net') && existsSync('tools/ai/data/first.net.json')) E.setNet(JSON.parse(readFileSync('tools/ai/data/first.net.json', 'utf8')));
let wA = 0, expA = 0, seatsA = 0, arrA = [], arrB = [], t0 = Date.now();
for (let g = 0; g < +G; g++) {
  const n = g % 2 ? 4 : 3, nA = n === 4 && g % 4 === 3 ? 2 : 1;
  const base = [...Array(nA).fill(A), ...Array(n - nA).fill(B)], rot = Math.floor(g / 2) % n, pols = base.map((_, i) => base[(i + rot) % n]);
  E.newGame({ course: E.COURSES[0], seed: 20000 + g, fullRace: true, players: pols.map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
  let acts = 0;
  while (!E.S.over) { E.S.log.length = 0; if (E.S.round > 60 || acts++ > 20000) { E.endGame(); break; }
    const me = E.S.cur, r = E.applyAction(me, E.botChoose({ mode: pols[me] }).a); if (!r.ok) E.applyAction(me, { t: 'end', keep: [] }); }
  E.S.players.forEach((p, i) => { if (pols[i] === A) { seatsA++; expA += 1 / n; if (E.S.places[i] === 1) wA++; if (p.fin) arrA.push(p.fin); } else if (p.fin) arrB.push(p.fin); });
}
const avg = a => (a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2);
console.log(`${A} vs ${B}: ${G} games (3p/4p): ${A} wins ${wA}/${seatsA} seats = ${(wA / expA).toFixed(2)}× its fair share · arrival round ${A} ${avg(arrA)} vs ${B} ${avg(arrB)} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);

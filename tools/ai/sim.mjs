// Plays bot-vs-bot games on the rules engine (no server) and reports how fast they finish.
// usage: node tools/ai/sim.mjs [games=40] [players=3] [policies=heur,heur,heur] [net=path.json]
import { E } from '../../src/engine.gen.js';
import { readFileSync } from 'node:fs';
const [,, G = '40', NP = '3', POL = '', NET = '', MAPS = 'first'] = process.argv; // MAPS: first | rnd (held-out random courses 900+)
if (NET) E.setNet(JSON.parse(readFileSync(NET, 'utf8')));
const pols = (POL || Array(+NP).fill('heur').join(',')).split(',');
export function playGame(pols, seed, cap = 60, opts = {}, course = E.COURSES[0]) {
  E.newGame({ course, seed, fullRace: true, players: pols.map((_, i) => ({ name: 'B' + i, color: '#fff' })) });
  let acts = 0;
  while (!E.S.over) {
    const S = E.S; S.log.length = 0;
    if (S.round > cap) { E.endGame(); break; }
    const me = S.cur, p = pols[me];
    let a;
    if (p === 'random') { const L = E.botActions(); a = L[Math.floor(Math.random() * L.length)]; }
    else a = E.botChoose({ mode: p === 'net' ? 'net' : 'heur', ...opts }).a;
    const r = E.applyAction(me, a); acts++;
    if (!r.ok) E.applyAction(me, { t: 'end', keep: [] });
    if (acts > 20000) { E.endGame(); break; }
  }
  const S = E.S;
  return { places: S.places, fin: S.players.map(p => p.fin || null), rounds: S.round, capped: S.players.some(p => !p.fin && !p.resigned) && S.round > cap };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now(); const firstArr = [], allArr = [], wins = Array(pols.length).fill(0); let capped = 0;
  for (let g = 0; g < +G; g++) {
    const rot = g % pols.length, order = pols.map((_, i) => pols[(i + rot) % pols.length]); // rotate seats
    const course = MAPS === 'rnd' ? E.botRandomCourse(900 + (g % 10), 3 + (g % 3)) : E.COURSES[0];
    const r = playGame(order, (g * 7919 + 13) | 0, 60, {}, course);
    const f = r.fin.filter(x => x); if (f.length) firstArr.push(Math.min(...f)); allArr.push(...f); if (r.capped) capped++;
    r.places.forEach((pl, i) => { if (pl === 1) wins[(i + rot) % pols.length]++; });
  }
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  console.log(`${G} games, ${pols.join(' vs ')}: first arrival round ${avg(firstArr)}, avg arrival round ${avg(allArr)}, hit cap ${capped}, wins by seat-policy ${wins.join('/')}, ${((Date.now() - t0) / G).toFixed(0)} ms/game`);
}

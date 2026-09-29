// Does the seat matter? Paired test: the same games (same seeds for map, blockades and shuffles), with policy P in seat S.
//   node tools/ai/seats.mjs <P=net> <seat 0-2> [games=40] [seed0=40000]     (3 players; the others are planners)
//   node tools/ai/seats.mjs plan all [games]    control: planner-only games, wins by seat
import { E } from '../../src/engine.gen.js';
import { readFileSync } from 'node:fs';
const [, , P = 'net', SEAT = '0', G = '40', SEED = '40000'] = process.argv;
if (P === 'net') E.setNet(JSON.parse(readFileSync('tools/ai/data/first.net.json', 'utf8')));
const wins = [0, 0, 0], places = [[], [], []], arr = [[], [], []]; let capped = 0;
for (let g = 0; g < +G; g++) {
  const pols = ['plan', 'plan', 'plan']; if (SEAT !== 'all') pols[+SEAT] = P;
  const seed = +SEED + g, gen = E.mulberry32(seed * 7 + 1);
  E.newGame({ course: E.COURSES[0], seed, fullRace: true, players: pols.map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
  let acts = 0, cap = false;
  while (!E.S.over) { if (E.S.round > 25 || acts++ > 20000) { cap = true; E.endGame(); break; }
    const me = E.S.cur; const c = E.botChoose({ mode: pols[me] });
    const r = E.applyAction(me, c.a, gen); if (!r.ok) E.applyAction(me, { t: 'end', keep: [] }, gen); }
  if (cap) capped++;
  E.S.players.forEach((p, i) => { places[i].push(E.S.places[i]); if (E.S.places[i] === 1 && !(cap && !p.fin)) wins[i]++; if (p.fin) arr[i].push(p.fin); });
}
const avg = a => (a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2);
const seats = SEAT === 'all' ? [0, 1, 2] : [+SEAT];
for (const s of seats) console.log(`${P} in seat ${s + 1}: wins ${wins[s]}/${G} (${(wins[s] / G * 100).toFixed(0)}%, fair 33%) · mean place ${avg(places[s])} · mean arrival ${avg(arr[s])} (${arr[s].length} arrived)`);
console.log(`capped games: ${capped}`);

// Where does a heuristic lose time? Plays games and classifies every turn (moved / only bought / nothing).
//   node tools/ai/turns.mjs [policy=plan] [games=40]
import * as E from '../../src/engine.gen.js';
const [, , POL = 'plan', G = '40'] = process.argv;
const T = id => E.S.cards[id];
const kinds = {}, still = {}, inc = (o, k) => o[k] = (o[k] || 0) + 1; let turns = 0, fin = [], gain = [];
for (let g = 0; g < +G; g++) {
  const n = g % 2 ? 4 : 3;
  E.newGame({ course: E.COURSES[0], seed: 30000 + g, fullRace: true, players: [...Array(n)].map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
  let cur = null, acts = 0;
  const close = () => { if (!cur) return; turns++; const P = E.S.players[cur.me], d = cur.left - E.botRemaining(cur.me);
    const k = cur.moved ? 'moved' : cur.bought ? 'no move, bought' : 'no move, no buy'; inc(kinds, k); gain.push(d);
    if (!cur.moved) inc(still, `${cur.hand.map(t => ({ explorer: 'M1', traveler: 'C1', sailor: 'P1' })[t] || t).sort().join(' ')} → ${cur.ahead}`); cur = null; };
  while (!E.S.over) { const S = E.S; if (S.round > 25 || acts++ > 20000) { E.endGame(); break; }
    const me = S.cur, P = S.players[me];
    if (!cur || cur.me !== me || cur.round !== S.round) { close();
      // terrain of the next space along the cheapest route
      cur = { me, round: S.round, left: E.botRemaining(me), hand: P.hand.map(T), moved: false, bought: false, ahead: nextTerrain(me) }; }
    const a = E.botChoose({ mode: POL }).a, r = E.applyAction(me, a);
    if (r.ok && (a.t === 'move' || a.t === 'pay' || a.t === 'native')) cur.moved = true;
    if (r.ok && (a.t === 'buy' || a.t === 'transmit')) cur.bought = true;
    if (!r.ok) E.applyAction(me, { t: 'end', keep: [] }); }
  close(); E.S.players.forEach(p => p.fin && fin.push(p.fin));
}
function nextTerrain(me) { // cheapest neighbouring step toward the goal
  const P = E.S.players[me], k = P.pieces[0]; if (k === 'done') return '-'; const h = E.MAP.hexes;
  let best = null; for (const [q, r] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) { const [x, y] = k.split(',').map(Number), nk = (x + q) + ',' + (y + r), s = h.get(nk);
    if (!s || s.type === 'm') continue; const c = E.botCost(nk); if (best === null || c < best.c) best = { c, t: s.type + s.val }; }
  return best ? best.t : '?';
}
console.log(`${POL}: ${G} games, ${turns} turns, mean arrival round ${(fin.reduce((a, b) => a + b, 0) / fin.length).toFixed(2)}`);
console.log('turn kinds:', JSON.stringify(kinds));
console.log('route gained per turn (mean):', (gain.reduce((a, b) => a + b, 0) / gain.length).toFixed(2));
console.log('most common hands on turns without a move (M=machete C=coin P=paddle → next terrain):');
for (const [k, c] of Object.entries(still).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log('  ' + c + '  ' + k);

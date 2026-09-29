// Find heuristic games where someone hasn't arrived by round 25 and print that player's turns.
//   node tools/ai/trace.mjs [policy=plan] [maxGames=60] [seed0=20000]
import { E } from '../../src/engine.gen.js';
const [, , POL = 'plan', MAX = '60', SEED = '20000'] = process.argv;
const T = id => E.S.cards[id];
for (let g = 0; g < +MAX; g++) {
  const n = g % 2 ? 4 : 3;
  E.newGame({ course: E.COURSES[0], seed: +SEED + g, fullRace: true, players: [...Array(n)].map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
  const log = [...Array(n)].map(() => []); let acts = 0, capped = false;
  while (!E.S.over) { const S = E.S; if (S.round > 25 || acts++ > 20000) { capped = true; E.endGame(); break; }
    const me = S.cur, P = S.players[me];
    if (!S.turn.active && !S.turn.pending && !P.play.length && !S.turn.bought) log[me].push(`R${S.round} at ${P.pieces} left ${E.botRemaining(me).toFixed(1)} hand [${P.hand.map(T)}] deck ${P.deck.length + P.hand.length + P.discard.length + P.play.length}`);
    const a = E.botChoose({ mode: POL }).a, d = { ...a };
    if (a.card) d.card = T(a.card); if (a.cards) d.cards = a.cards.map(T); if (a.keep) d.keep = a.keep.map(T);
    if (a.t === 'buy' || a.t === 'transmit') { d.what = a.type; }
    const r = E.applyAction(me, a); log[me].push('   ' + JSON.stringify(d) + (r.ok ? '' : ' FAILED ' + r.err));
    if (!r.ok) E.applyAction(me, { t: 'end', keep: [] }); }
  const bad = capped ? E.S.players.map((p, i) => i).filter(i => !E.S.players[i].fin) : [];
  if (!bad.length) continue;
  for (const i of bad) { const P = E.S.players[i];
    console.log(`=== game ${g} seed ${+SEED + g} ${n}p · P${i} never arrived · final deck: ${[...P.deck, ...P.hand, ...P.discard, ...P.play].map(T).sort().join(',')}`);
    console.log('blockades: ' + JSON.stringify(E.S.blockades.map(b => [b.k, b.v, b.conn, b.owner])));
    console.log(log[i].join('\n')); }
}

// Plays many random games with the shared rules engine and checks invariants:
// every game ends, no cards are created or lost, placements and Elo are sane,
// and redaction never leaks another player's hand or deck order.
//   node test/engine.test.mjs [--quick]   (--quick: 12 random games, and AI games on First Expedition only)
const QUICK = process.argv.includes('--quick');
import * as E from '../src/engine.gen.js';
let gs = null; // the game being played
E.setAssertMode({ debug: true }); // a broken invariant fails the run
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };
const t0 = performance.now(); for (let i = 0; i < 200; i++) E.buildCourse(E.COURSES[i % E.COURSES.length], i);
const mapMs = (performance.now() - t0) / 200;
// every course builds; blockades are dealt at random, one per connection, and only seal consecutive boards
for (const C of E.COURSES) {
  const deals = new Set();
  for (let s = 0; s < 40; s++) {
    const M = E.buildCourse(C, s);
    assert(M.blockDefs.length === C.p.length - 1, C.id + ': one blockade per connection');
    assert(new Set(M.blockDefs.map(b => b.n)).size === M.blockDefs.length, C.id + ': blockade dealt twice');
    for (const [e, c] of M.edgeConn) { const [a, b] = e.split('|').map(k => M.hexes.get(k).tile); assert(Math.abs(a - b) === 1 && Math.min(a, b) === c, C.id + ': bad seam'); }
    assert(M.starts.length === 4 && M.goals.length === 3, C.id + ': starts/goals');
    deals.add(M.blockDefs.map(b => b.n).join());
  }
  assert(deals.size > 5, C.id + ': blockades not random');
}
let games = 0, maxAct = 0;
for (let g = 0; g < (QUICK ? 12 : 60); g++) {
  const np = 2 + (g % 3);
  gs = E.newGame({ course: E.COURSES[g % E.COURSES.length], seed: (Math.random() * 1e9) | 0, fullRace: g % 5 !== 0, players: [...Array(np)].map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
  const M = E.mapOf(gs), goals = M.goals.map(k => M.hexes.get(k));
  const dg = k => { if (k === 'done') return -1; const h = M.hexes.get(k); return Math.min(...goals.map(q => Math.hypot(q.x - h.x, q.y - h.y))); };
  let turns = 0;
  while (!gs.over && turns < 3000) {
    turns++; const S = gs, seat = S.cur, P = S.players[seat];
    if (turns > 300) { E.applyAction(gs, seat, { t: 'resign' }); continue; }
    for (let guard = 0; guard < 20; guard++) {
      let did = false;
      for (const pi of P.pieces.keys()) {
        if (P.pieces[pi] === 'done') continue;
        for (const id of P.hand.slice()) {
          const d = E.CT[S.cards[id]]; if (!d || d.c === 'p') continue;
          const T = E.reach(gs, seat, pi, d.s === '*' ? ['j', 'w', 'v'] : [d.s], d.p); let best = null, bd = dg(P.pieces[pi]) - 1;
          for (const [k] of T) { if (k[0] === 'B') { best = best || k; continue; } const dd = dg(k); if (dd < bd) { bd = dd; best = k; } }
          if (best) { const t1 = performance.now(); const r = E.applyAction(gs, seat, { t: 'move', card: id, pi, to: best }); maxAct = Math.max(maxAct, performance.now() - t1); assert(r.ok, r.err); did = true; break; }
        }
        if (did) break;
        for (const [k, t] of E.payTargets(gs, seat, pi)) { if (k[0] !== 'B' && dg(k) >= dg(P.pieces[pi])) continue; const r = E.applyAction(gs, seat, { t: 'pay', pi, to: k, cards: P.hand.slice(0, t.need) }); if (r.ok) { did = true; break; } }
        if (did) break;
      }
      if (!did || gs.over || gs.cur !== seat) break;
    }
    if (gs.over) break;
    const S2 = gs;
    // illegal actions must be rejected
    assert(!E.applyAction(gs, (seat + 1) % np, { t: 'end', keep: [] }).ok, 'out-of-turn action accepted');
    assert(!E.applyAction(gs, seat, { t: 'buy', type: S2.market[0].t, cards: ['nope'] }).ok, 'fake card accepted');
    const tot = P.hand.reduce((a, id) => a + (['y', 'x'].includes(E.CT[S2.cards[id]].c) ? E.CT[S2.cards[id]].p : .5), 0);
    const opts = S2.market.map((s, i) => [i, s]).filter(([i, s]) => s.n > 0 && E.CT[s.t].cost <= tot && E.CT[s.t].c !== 'p');
    if (opts.length && !S2.turn.bought) { const [i] = opts[Math.floor(Math.random() * opts.length)]; assert(E.applyAction(gs, seat, { t: 'buy', type: S2.market[i].t, cards: P.hand.slice() }).ok, 'buy failed'); }
    if (Math.random() < .01 && S2.players.filter(p => !p.resigned).length > 2) { E.applyAction(gs, seat, { t: 'resign' }); continue; }
    const r = E.applyAction(gs, seat, { t: 'end', keep: [] }); assert(r.ok, r.err);
  }
  const S = gs; games++;
  assert(S.over, 'game did not end');
  const cards = S.players.reduce((a, p) => a + p.deck.length + p.hand.length + p.discard.length + p.play.length, 0) + S.trash.length;
  assert(cards === S.nid - 1, 'cards created or lost');
  assert(S.places && S.places.length === np && S.places.includes(1), 'bad placements');
  const d = E.eloDeltas(S.players.map(() => 1200), S.places, S.players.map(() => 0));
  assert(Math.abs(d.reduce((a, b) => a + b, 0)) < 0.5, 'elo not zero-sum');
  for (let s = 0; s < np; s++) { const R = E.redact(S, s); R.players.forEach((p, i) => { if (i !== s) { assert(p.hand.every(id => !R.cards[id]), 'hand leak'); assert(p.deck.every(id => !R.cards[id]), 'deck leak'); } }); }
}
// named AI seats (engine_ai.js): the shipped half-float network matches the trained one, AI games finish,
// the network plays on its own course (First Expedition) and the AIs fall back to the route planner elsewhere
{
  const { readFileSync } = await import('node:fs');
  const full = JSON.parse(readFileSync(new URL('../tools/ai/models/first-first1-351.json', import.meta.url), 'utf8'));
  const half = E.aiNetDecode(readFileSync(new URL('../src/ai/first.bin', import.meta.url)));
  assert(half.course === full.course && half.nf === full.nf && half.w1T.length === full.w1T.length, 'packed network header');
  // 'play' events (shown to every player online) name only cards that just became public: in play, discarded (an arrival
  // clears the finished player's cards) or removed from the game
  let plays = 0;
  const publicEvents = ev => { for (const e of ev) { if (e.e !== 'play') continue; plays++;
    // (the end of a turn: the cards discarded go face up on the pile, so they're named; the ones kept are only counted.
    //  They may already be shuffled into the draw pile when it ran out, so they're not looked for on the pile)
    if (e.k === 'end') { assert(Number.isInteger(e.kept) && e.ts.length === e.disc, 'end event: names the discarded cards, counts the kept ones'); continue; }
    const pub = {}; for (const id of [...gs.players[e.pl].play, ...gs.players[e.pl].discard, ...gs.trash]) pub[gs.cards[id]] = (pub[gs.cards[id]] || 0) + 1;
    for (const t of e.ts) assert(pub[t]-- > 0, 'play event names a card that is not public: ' + e.k + ' ' + t); } };
  const aiGame = (course, ais, check) => {
    gs = E.newGame({ course, seed: (Math.random() * 1e9) | 0, fullRace: true, players: ais.map((a, i) => ({ name: 'P' + i, color: '#fff', ai: a })) });
    const mem = ais.map(() => ({})); let steps = 0;
    while (!gs.over && steps++ < 20000) { if (check) check(); const me = gs.cur; assert(gs.players[me].ai === ais[me], 'ai seat kept'); const r = E.aiStep(gs, ais[me], mem[me]); assert(r.ok, 'ai action rejected'); publicEvents(r.ev); }
    assert(gs.over && gs.places.includes(1), 'AI game did not finish: ' + course.id + ' ' + ais + ' round ' + gs.round + ' ' + gs.players.map(p => p.fin ? 'fin' : p.pieces.join('/')).join(' | '));
  };
  E.aiSetNet(half);
  let diff = 0, n = 0, e0 = E.BOT_EVALS;
  aiGame(E.courseById('first'), ['fawcett', 'humboldt', 'raleigh'], () => {
    if (n++ % 9) return; const f = E.botNetFeatures(gs, gs.cur); E.aiSetNet(full); const a = E.botNetValue(f); E.aiSetNet(half); diff = Math.max(diff, Math.abs(a - E.botNetValue(f))); });
  assert(E.BOT_EVALS - e0 > 1000, 'network not used on First Expedition');
  assert(plays > 50, 'no play events');
  assert(diff < 2e-3, 'packed network differs: ' + diff);
  const rc = E.botRandomCourse(7, 3); E.buildCourse(rc, 1);
  e0 = E.BOT_EVALS; aiGame(rc, ['humboldt', 'raleigh'], () => assert(!E.botNetReady(gs), 'network used on a course it was not trained for'));
  assert(E.BOT_EVALS === e0, 'network evaluated on another course');
  // every other official course: full 3- and 4-player AI games finish; the network AIs play there as the route planner
  if (!QUICK) for (const C of E.COURSES.filter(c => c.id !== 'first')) for (const ais of [['raleigh', 'humboldt', 'humboldt'], ['humboldt', 'raleigh', 'raleigh', 'humboldt']]) {
    e0 = E.BOT_EVALS; aiGame(C, ais, () => assert(!E.botNetReady(gs), 'network used on ' + C.id));
    assert(E.BOT_EVALS === e0, 'network evaluated on ' + C.id);
    assert(gs.players.filter(p => p.fin).length >= ais.length - 1, C.id + ': AIs did not reach El Dorado');
  }
  E.aiSetNet(null);
  console.log(`ok: AI games finish (network on First Expedition, planner elsewhere), packed network within ${diff.toExponential(1)}`);
}
// single-use cards played for movement are removed from the game (Giant Machete, Prop Plane, Treasure Chest), never discarded
for (const t of ['giant', 'plane']) { // (no village is in a Treasure Chest's reach from the start)
  gs = E.newGame({ course: E.COURSES[0], seed: 4242, fullRace: true, players: [0, 1, 2].map(i => ({ name: 'P' + i, color: '#fff' })) });
  const S = gs, seat = S.cur, P = S.players[seat], id = P.hand[0]; S.cards[id] = t;
  let to = null, pi = 0; for (; pi < P.pieces.length && !to; pi++) for (const [k] of E.reach(gs, seat, pi, t === 'plane' ? ['j', 'w', 'v'] : [E.CT[t].s], E.CT[t].p)) if (k[0] !== 'B') { to = k; break; }
  assert(to, t + ': no move found'); const r = E.applyAction(gs, seat, { t: 'move', card: id, pi: pi - 1, to }); assert(r.ok, r.err);
  assert(S.trash.includes(id) && !P.play.includes(id), t + ' played for movement was not removed from the game');
  E.applyAction(gs, seat, { t: 'end', keep: [] });
  assert(!P.discard.includes(id) && !P.deck.includes(id) && !P.hand.includes(id), t + ' came back after the turn');
}
// game records (log v3): a recorded game with undos, timeouts and a resignation replays to exactly the same final position
{ let recs = 0;
  for (let g = 0; g < 12; g++) {
    const np = 2 + (g % 3), C = E.COURSES[g % E.COURSES.length];
    const { gs: g0, rec } = E.recNewGame({ course: C, seed: 1000 + g, fullRace: true, players: [...Array(np)].map((_, i) => ({ name: 'P' + i, color: ['#e5484d', '#efe9dc', '#9d7df7', '#ff9636'][i] })) });
    gs = g0; const rnd = E.mulberry32(g + 7), mem = [{}, {}, {}, {}]; let steps = 0, undos = 0;
    while (!gs.over && steps++ < 20000) {
      const S = gs, me = S.cur;
      if (steps === 150 && np > 2) { E.recApply(gs, rec, (me + 1) % np, { t: 'resign' }); continue; }
      if (rnd() < .01) { E.recApply(gs, rec, me, { t: 'timeout' }); continue; }
      const a = E.aiChoose(gs, 'raleigh', mem[me]);
      const before = JSON.stringify(S), prevCur = S.cur;
      const r = E.recApply(gs, rec, me, a); if (!r.ok) { E.recApply(gs, rec, me, { t: 'timeout' }); continue; }
      // sometimes undo (as the page does: bring back the earlier state), when the action drew nothing and the turn did not pass
      if (rnd() < .1 && E.recCanUndo(rec)) { gs = E.recUndo(rec); assert(JSON.stringify({ ...gs, log: [] }) === JSON.stringify({ ...JSON.parse(before), log: [] }), 'undo did not restore the position'); undos++; }
    }
    if (!gs.over) continue;
    const fin = JSON.stringify({ ...gs, log: [] }), log = JSON.parse(JSON.stringify(E.recFinal(rec, gs)));
    assert(!E.replayCheck(log), 'record fails replayCheck: ' + E.replayCheck(log));
    let replayed = null; for (const r of E.replay(log)) { assert(r.ok, 'replay step ' + r.i + ' failed: ' + r.err); replayed = r.gs; }
    assert(JSON.stringify({ ...replayed, log: [] }) === fin, 'replay differs from the recorded game (' + C.id + ', ' + np + ' players, ' + undos + ' undos)');
    recs++;
  }
  assert(recs >= 8, 'too few recorded games finished: ' + recs);
  console.log(`ok: ${recs} recorded games replay exactly (undo, timeouts, resignations)`);
}
// a buy / transmit names a card type; anything else is refused without touching the state
{ gs = E.newGame({ course: E.COURSES[0], seed: 77, players: [0, 1, 2].map(i => ({ name: 'P' + i, color: '#fff' })) });
  const before = JSON.stringify(gs);
  for (const type of ['__proto__', 'constructor', 'length', 'nope', 0, null, undefined, {}]) { const r = E.applyAction(gs, 0, { t: 'buy', type, cards: gs.players[0].hand.slice() }); assert(!r.ok, 'buy of ' + String(type) + ' accepted'); }
  assert(JSON.stringify(gs) === before && Array.prototype.n === undefined, 'refused buys changed the state'); }
// the value network's inputs and outputs at fixed positions are exactly as when the shipped networks were trained
{ const { golden } = await import('../tools/ai/golden.mjs'), { readFileSync } = await import('node:fs');
  const want = JSON.parse(readFileSync(new URL('./fixtures/features.json', import.meta.url), 'utf8'));
  const got = golden(E, E.aiNetDecode(readFileSync(new URL('../src/ai/first.bin', import.meta.url))));
  assert(got.length === want.length, 'golden positions: ' + got.length + ' vs ' + want.length);
  for (let i = 0; i < want.length; i++) assert(JSON.stringify(got[i]) === JSON.stringify(want[i]), 'network features changed at golden position ' + i + ': ' + JSON.stringify(got[i]) + ' vs ' + JSON.stringify(want[i]));
  console.log(`ok: network features and values identical at ${want.length} golden positions`); }
console.log(`ok: ${games} games, map ${mapMs.toFixed(2)} ms, slowest action ${maxAct.toFixed(2)} ms`);

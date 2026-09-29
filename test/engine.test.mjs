// Plays many random games with the shared rules engine and checks invariants:
// every game ends, no cards are created or lost, placements and Elo are sane,
// and redaction never leaks another player's hand or deck order.
//   node test/engine.test.mjs [--quick]   (--quick: 12 random games, and AI games on First Expedition only)
const QUICK = process.argv.includes('--quick');
import { E } from '../src/engine.gen.js';
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
  E.newGame({ course: E.COURSES[g % E.COURSES.length], seed: (Math.random() * 1e9) | 0, fullRace: g % 5 !== 0, players: [...Array(np)].map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
  const M = E.MAP, goals = M.goals.map(k => M.hexes.get(k));
  const dg = k => { if (k === 'done') return -1; const h = M.hexes.get(k); return Math.min(...goals.map(q => Math.hypot(q.x - h.x, q.y - h.y))); };
  let turns = 0;
  while (!E.S.over && turns < 3000) {
    turns++; const S = E.S, seat = S.cur, P = S.players[seat];
    if (turns > 300) { E.applyAction(seat, { t: 'resign' }); continue; }
    for (let guard = 0; guard < 20; guard++) {
      let did = false;
      for (const pi of P.pieces.keys()) {
        if (P.pieces[pi] === 'done') continue;
        for (const id of P.hand.slice()) {
          const d = E.CT[S.cards[id]]; if (!d || d.c === 'p') continue;
          const T = E.reach(seat, pi, d.s === '*' ? ['j', 'w', 'v'] : [d.s], d.p); let best = null, bd = dg(P.pieces[pi]) - 1;
          for (const [k] of T) { if (k[0] === 'B') { best = best || k; continue; } const dd = dg(k); if (dd < bd) { bd = dd; best = k; } }
          if (best) { const t1 = performance.now(); const r = E.applyAction(seat, { t: 'move', card: id, pi, to: best }); maxAct = Math.max(maxAct, performance.now() - t1); assert(r.ok, r.err); did = true; break; }
        }
        if (did) break;
        for (const [k, t] of E.payTargets(seat, pi)) { if (k[0] !== 'B' && dg(k) >= dg(P.pieces[pi])) continue; const r = E.applyAction(seat, { t: 'pay', pi, to: k, cards: P.hand.slice(0, t.need) }); if (r.ok) { did = true; break; } }
        if (did) break;
      }
      if (!did || E.S.over || E.S.cur !== seat) break;
    }
    if (E.S.over) break;
    const S2 = E.S;
    // illegal actions must be rejected
    assert(!E.applyAction((seat + 1) % np, { t: 'end', keep: [] }).ok, 'out-of-turn action accepted');
    assert(!E.applyAction(seat, { t: 'buy', type: S2.market[0].t, cards: ['nope'] }).ok, 'fake card accepted');
    const tot = P.hand.reduce((a, id) => a + (['y', 'x'].includes(E.CT[S2.cards[id]].c) ? E.CT[S2.cards[id]].p : .5), 0);
    const opts = S2.market.map((s, i) => [i, s]).filter(([i, s]) => s.n > 0 && E.CT[s.t].cost <= tot && E.CT[s.t].c !== 'p');
    if (opts.length && !S2.turn.bought) { const [i] = opts[Math.floor(Math.random() * opts.length)]; assert(E.applyAction(seat, { t: 'buy', type: S2.market[i].t, cards: P.hand.slice() }).ok, 'buy failed'); }
    if (Math.random() < .01 && S2.players.filter(p => !p.resigned).length > 2) { E.applyAction(seat, { t: 'resign' }); continue; }
    const r = E.applyAction(seat, { t: 'end', keep: [] }); assert(r.ok, r.err);
  }
  const S = E.S; games++;
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
    if (e.k === 'end') { assert(!e.ts && Number.isInteger(e.kept) && Number.isInteger(e.disc), 'end event shows cards'); continue; }
    const pub = {}; for (const id of [...E.S.players[e.pl].play, ...E.S.players[e.pl].discard, ...E.S.trash]) pub[E.S.cards[id]] = (pub[E.S.cards[id]] || 0) + 1;
    for (const t of e.ts) assert(pub[t]-- > 0, 'play event names a card that is not public: ' + e.k + ' ' + t); } };
  const aiGame = (course, ais, check) => {
    E.newGame({ course, seed: (Math.random() * 1e9) | 0, fullRace: true, players: ais.map((a, i) => ({ name: 'P' + i, color: '#fff', ai: a })) });
    const mem = ais.map(() => ({})); let steps = 0; const all = [];
    while (!E.S.over && steps++ < 20000) { if (check) check(); const me = E.S.cur; assert(E.S.players[me].ai === ais[me], 'ai seat kept'); const r = E.aiStep(ais[me], mem[me]); assert(r.ok, 'ai action rejected'); publicEvents(r.ev); all.push(...r.ev); }
    // the turn history (S.hist) is exactly the game's 'play' events, one entry per turn (the AIs' look-ahead leaves it alone),
    // the same for every seat after redaction
    const H = []; for (const e of all) { let t = H[H.length - 1];
      if (e.e === 'play') { if (!t || t.p !== e.pl || t.end) H.push(t = { i: t ? t.i + 1 : 0, p: e.pl, s: [] }); const l = t.s[t.s.length - 1];
        if (!(e.k === 'move' && e.more && l && l.k === 'move') && !(e.k === 'trash' && !e.ts.length)) { t.s.push({ k: e.k, ...(e.ts ? { ts: e.ts } : {}) }); if (e.k === 'end') t.end = 1; } }
      else if (e.e === 'turn' && t) t.end = 1; }
    const got = E.S.hist.map(t => ({ i: t.i, p: t.p, s: t.s.map(x => ({ k: x.k, ...(x.ts ? { ts: x.ts } : {}) })), ...(t.end ? { end: 1 } : {}) }));
    assert(got.length <= 60 && got.length === Math.min(60, H.length), 'history keeps the last 60 turns: ' + got.length + ' of ' + H.length);
    { const a = JSON.stringify(got), b = JSON.stringify(H.slice(-got.length)); if (a !== b) { let k = 0; while (a[k] === b[k]) k++; console.error(a.slice(k - 200, k + 200) + '\n---\n' + b.slice(k - 200, k + 200)); } assert(a === b, 'history differs from the play events'); }
    for (let s = 0; s < ais.length; s++) assert(JSON.stringify(E.redact(E.S, s).hist) === JSON.stringify(E.S.hist), 'history redacted differently');
    assert(E.S.over && E.S.places.includes(1), 'AI game did not finish: ' + course.id + ' ' + ais + ' round ' + E.S.round + ' ' + E.S.players.map(p => p.fin ? 'fin' : p.pieces.join('/')).join(' | '));
  };
  E.aiSetNet(half);
  let diff = 0, n = 0, e0 = E.BOT_EVALS;
  aiGame(E.courseById('first'), ['fawcett', 'humboldt', 'raleigh'], () => {
    if (n++ % 9) return; const f = E.botNetFeatures(E.S.cur); E.aiSetNet(full); const a = E.botNetValue(f); E.aiSetNet(half); diff = Math.max(diff, Math.abs(a - E.botNetValue(f))); });
  assert(E.BOT_EVALS - e0 > 1000, 'network not used on First Expedition');
  assert(plays > 50, 'no play events');
  assert(diff < 2e-3, 'packed network differs: ' + diff);
  const rc = E.botRandomCourse(7, 3); E.buildCourse(rc, 1);
  e0 = E.BOT_EVALS; aiGame(rc, ['humboldt', 'raleigh'], () => assert(!E.aiNetFits(), 'network used on a course it was not trained for'));
  assert(E.BOT_EVALS === e0, 'network evaluated on another course');
  // every other official course: full 3- and 4-player AI games finish; the network AIs play there as the route planner
  if (!QUICK) for (const C of E.COURSES.filter(c => c.id !== 'first')) for (const ais of [['raleigh', 'humboldt', 'humboldt'], ['humboldt', 'raleigh', 'raleigh', 'humboldt']]) {
    e0 = E.BOT_EVALS; aiGame(C, ais, () => assert(!E.aiNetFits(), 'network used on ' + C.id));
    assert(E.BOT_EVALS === e0, 'network evaluated on ' + C.id);
    assert(E.S.players.filter(p => p.fin).length >= ais.length - 1, C.id + ': AIs did not reach El Dorado');
  }
  E.aiSetNet(null);
  console.log(`ok: AI games finish (network on First Expedition, planner elsewhere), packed network within ${diff.toExponential(1)}`);
}
// single-use cards played for movement are removed from the game (Giant Machete, Prop Plane, Treasure Chest), never discarded
for (const t of ['giant', 'plane']) { // (no village is in a Treasure Chest's reach from the start)
  E.newGame({ course: E.COURSES[0], seed: 4242, fullRace: true, players: [0, 1, 2].map(i => ({ name: 'P' + i, color: '#fff' })) });
  const S = E.S, seat = S.cur, P = S.players[seat], id = P.hand[0]; S.cards[id] = t;
  let to = null, pi = 0; for (; pi < P.pieces.length && !to; pi++) for (const [k] of E.reach(seat, pi, t === 'plane' ? ['j', 'w', 'v'] : [E.CT[t].s], E.CT[t].p)) if (k[0] !== 'B') { to = k; break; }
  assert(to, t + ': no move found'); const r = E.applyAction(seat, { t: 'move', card: id, pi: pi - 1, to }); assert(r.ok, r.err);
  assert(S.trash.includes(id) && !P.play.includes(id), t + ' played for movement was not removed from the game');
  E.applyAction(seat, { t: 'end', keep: [] });
  assert(!P.discard.includes(id) && !P.deck.includes(id) && !P.hand.includes(id), t + ' came back after the turn');
}
// game records (log v2): a recorded game with undos, timeouts and a resignation replays to exactly the same final position
{ let recs = 0;
  for (let g = 0; g < 12; g++) {
    const np = 2 + (g % 3), C = E.COURSES[g % E.COURSES.length];
    const rec = E.recNewGame({ course: C, seed: 1000 + g, fullRace: true, players: [...Array(np)].map((_, i) => ({ name: 'P' + i, color: ['#e5484d', '#efe9dc', '#9d7df7', '#ff9636'][i] })) });
    const rnd = E.mulberry32(g + 7), mem = [{}, {}, {}, {}]; let steps = 0, undos = 0;
    while (!E.S.over && steps++ < 20000) {
      const S = E.S, me = S.cur;
      if (steps === 150 && np > 2) { E.recApply(rec, (me + 1) % np, { t: 'resign' }); continue; }
      if (rnd() < .01) { E.recApply(rec, me, { t: 'timeout' }); continue; }
      const a = E.aiChoose('raleigh', mem[me]);
      const before = JSON.stringify(S), prevCur = S.cur;
      const r = E.recApply(rec, me, a); if (!r.ok) { E.recApply(rec, me, { t: 'timeout' }); continue; }
      // sometimes undo (as the page does: bring back the earlier state), when the action drew nothing and the turn did not pass
      if (rnd() < .1 && E.recCanUndo(rec)) { assert(E.recUndo(rec), 'undo refused'); assert(JSON.stringify({ ...E.S, log: [] }) === JSON.stringify({ ...JSON.parse(before), log: [] }), 'undo did not restore the position'); undos++; }
    }
    if (!E.S.over) continue;
    const fin = JSON.stringify({ ...E.S, log: [] }), log = JSON.parse(JSON.stringify(E.recFinal(rec)));
    assert(!E.replayCheck(log), 'record fails replayCheck: ' + E.replayCheck(log));
    E.replayStart(log);
    for (let i = 0; i < log.actions.length; i++) { const r = E.replayStep(log, i); assert(r.ok, 'replay step ' + i + ' failed: ' + r.err); }
    E.setRng(null);
    assert(JSON.stringify({ ...E.S, log: [] }) === fin, 'replay differs from the recorded game (' + C.id + ', ' + np + ' players, ' + undos + ' undos)');
    recs++;
  }
  assert(recs >= 8, 'too few recorded games finished: ' + recs);
  console.log(`ok: ${recs} recorded games replay exactly (undo, timeouts, resignations)`);
}
// a buy / transmit names a card type; anything else is refused without touching the state
{ E.newGame({ course: E.COURSES[0], seed: 77, players: [0, 1, 2].map(i => ({ name: 'P' + i, color: '#fff' })) });
  const before = JSON.stringify(E.S);
  for (const type of ['__proto__', 'constructor', 'length', 'nope', 0, null, undefined, {}]) { const r = E.applyAction(0, { t: 'buy', type, cards: E.S.players[0].hand.slice() }); assert(!r.ok, 'buy of ' + String(type) + ' accepted'); }
  assert(JSON.stringify(E.S) === before && Array.prototype.n === undefined, 'refused buys changed the state'); }
// the value network's inputs and outputs at fixed positions are exactly as when the shipped networks were trained
{ const { golden } = await import('../tools/ai/golden.mjs'), { readFileSync } = await import('node:fs');
  const want = JSON.parse(readFileSync(new URL('./fixtures/features.json', import.meta.url), 'utf8'));
  const got = golden(E, E.aiNetDecode(readFileSync(new URL('../src/ai/first.bin', import.meta.url))));
  assert(got.length === want.length, 'golden positions: ' + got.length + ' vs ' + want.length);
  for (let i = 0; i < want.length; i++) assert(JSON.stringify(got[i]) === JSON.stringify(want[i]), 'network features changed at golden position ' + i + ': ' + JSON.stringify(got[i]) + ' vs ' + JSON.stringify(want[i]));
  console.log(`ok: network features and values identical at ${want.length} golden positions`); }
console.log(`ok: ${games} games, map ${mapMs.toFixed(2)} ms, slowest action ${maxAct.toFixed(2)} ms`);

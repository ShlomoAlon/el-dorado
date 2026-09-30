// The rules, one at a time, on small boards built for each check (a strip of spaces; other explorers parked out of the
// way), so every expectation is exact: movement, blocked spaces, rubble and base camps, blockades, the Native, buying and
// the reserve, the Transmitter, action cards, single-use cards, the end of a turn, both end-of-game rules and their
// tie-break, two explorers each, resigning, what undo may take back, and what each player is shown.
//   node test/rules.test.mjs
import { CT, key, newGame, newCard, applyAction, reach, payTargets, nativeTargets, cardTargets, blocksOf, cantBuy, buyOptions, COURSES, COLORS, recNewGame, recApply, recCanUndo, recUndo, redact, replayCheck, setAssertMode, MAPS } from '../src/engine.gen.js';
let S = null; // the game of the check under way
setAssertMode({ debug: true }); // a broken invariant fails the run
let checks = 0; const failures = [];
const ok = (cond, what) => { checks++; if (!cond) failures.push(what); };

/* a board from rows of space codes: j/w/v + strength (jungle, water, village), r/c + count (rubble, base camp), m (mountain),
   s (start), g + j|w (El Dorado on its jungle or water side), . (no space). Row r holds the spaces (q, r) for q = 0, 1, …;
   (q, r) touches (q±1, r), (q+1, r−1), (q, r−1), (q−1, r+1) and (q, r+1). Row 4 is parking for explorers not in the check;
   it leads to an El Dorado space of its own (9,4), as every explorer on a real course can reach El Dorado (buildCourse). */
function board(rows, blockades = []) {
  const hexes = new Map(), add = (q, r, code) => {
    if (code === '.') return; const t = code[0], k = key(q, r);
    hexes.set(k, { type: t, val: t === 'g' || t === 'm' || t === 's' ? 1 : +code.slice(1), sym: t === 'g' ? code[1] : undefined, q, r, k, tile: 0, x: q, y: r });
  };
  rows.forEach((row, r) => row.split(/\s+/).forEach((code, q) => add(q, r, code)));
  for (let q = 0; q < 9; q++) add(q, 4, 's');
  add(9, 4, 'gj');
  const edgeConn = new Map(); blockades.forEach(([a, b], conn) => { edgeConn.set(a + '|' + b, conn); edgeConn.set(b + '|' + a, conn); });
  return { hexes, edgeConn, tiles: [], conns: [], starts: [], goals: [], blockDefs: [], city: { x: 0, y: 0, dx: 1, dy: 0 }, endSym: 'j', minX: 0, minY: 0, w: 1, h: 1, route: [], name: 'test', course: 'test' };
}
/* a game on that board: empty hands and piles, explorer 0 of player 0 on (0,0), everyone else parked; blockades as [[a, b, {k, v, n}]…] */
let boards = 0;
function game(rows, { players = 3, fullRace = true, blockades = [] } = {}) {
  const course = { ...COURSES[0], id: 'check' + (++boards) }; // a course of its own, whose board (mapOf) is this one
  MAPS.set(course.id + '#1', { ...board(rows, blockades.map(b => b.slice(0, 2))), course: course.id, seed: 1 });
  S = newGame({ course, seed: 1, fullRace, players: [...Array(players)].map((_, i) => ({ name: 'P' + i, color: '#fff' })) });
  S.blockades = blockades.map(([, , B], conn) => ({ n: 1, k: 'j', v: 1, ...B, conn, owner: null }));
  S.players.forEach((p, i) => { p.hand = []; p.deck = []; p.discard = []; p.play = []; p.pieces = p.pieces.map((_, j) => key(i * 2 + j, 4)); });
  S.players[0].pieces[0] = key(0, 0);
  return S;
}
const give = (pl, ...types) => types.map(t => { const id = newCard(S, t); S.players[pl].hand.push(id); return id; });
const deck = (pl, ...types) => { S.players[pl].deck = types.map(t => newCard(S, t)); };
const at = (pl, pi = 0) => S.players[pl].pieces[pi];
const act = (a, seat = S.cur) => applyAction(S, seat, a);
const targets = (pl, pi, t) => { const d = CT[t]; return reach(S, pl, pi, d.s === '*' ? ['j', 'w', 'v'] : [d.s], d.p); };

// ---------- movement
game(['s j1 j2 j1 w1']);
let [ex, sc] = give(0, 'explorer', 'scout');
ok([...targets(0, 0, 'explorer').keys()].join() === '1,0', 'an Explorer (1 machete) reaches only the next jungle 1');
ok(!targets(0, 0, 'scout').has('3,0'), 'a card can\'t pay for more than its strength');
ok(act({ t: 'move', card: ex, pi: 0, to: '1,0' }).ok && at(0) === '1,0' && S.players[0].play.includes(ex), 'move: the explorer moves, the card goes to play');
ok(!act({ t: 'move', card: ex, pi: 0, to: '2,0' }).ok, 'a played card can\'t be played again');
ok(act({ t: 'move', card: sc, pi: 0, to: '2,0' }).ok && S.turn.active === null, 'a jungle 2 takes a card of strength 2 (nothing left over)');
game(['s j1 j2 w1']); [ex] = give(0, 'explorer', 'explorer');
ok(!targets(0, 0, 'explorer').has('2,0'), 'two cards can\'t be combined for one space');
ok(!targets(0, 0, 'sailor').size, 'a paddle can\'t enter jungle');
game(['s j1 j1 j1 j1']); let [tb, ex2] = give(0, 'trailblazer', 'explorer');
ok(act({ t: 'move', card: tb, pi: 0, to: '1,0' }).ok && S.turn.active && S.turn.active.left === 2, 'leftover strength stays with the card');
ok(act({ t: 'move', card: tb, pi: 0, to: '3,0' }).ok && S.turn.active === null && at(0) === '3,0', 'leftover strength moves the same explorer further');
game(['s j1 j1 j1']); [tb, ex2] = give(0, 'trailblazer', 'explorer');
act({ t: 'move', card: tb, pi: 0, to: '1,0' }); act({ t: 'move', card: ex2, pi: 0, to: '2,0' });
ok(S.turn.active === null && !act({ t: 'move', card: tb, pi: 0, to: '3,0' }).ok, 'playing another card ends the leftover strength');
game(['s w1 w1 j1']); let [adv] = give(0, 'adventurer');
ok(targets(0, 0, 'adventurer').has('2,0'), 'a joker counts as any one symbol');
ok(act({ t: 'move', card: adv, pi: 0, to: '1,0' }).ok && S.turn.active.sym === 'w', 'the joker keeps the symbol it was played as');
ok(!reach(S, 0, 0, [S.turn.active.sym], S.turn.active.left).has('3,0') && reach(S, 0, 0, ['w'], 1).has('2,0'), 'its leftover strength moves only on that symbol');
// ---------- blocked spaces
game(['s j1 j1', 'm']); S.players[1].pieces[0] = '1,0'; give(0, 'trailblazer');
ok(!targets(0, 0, 'trailblazer').has('1,0') && !targets(0, 0, 'trailblazer').has('2,0'), 'an occupied space can\'t be entered or crossed');
ok(!targets(0, 0, 'trailblazer').has('0,1'), 'mountains can\'t be entered');
// ---------- rubble and base camps
game(['s r2 c1']); let hand = give(0, 'explorer', 'traveler', 'sailor');
let pt = payTargets(S, 0, 0);
ok(pt.get('1,0') && pt.get('1,0').kind === 'rubble' && pt.get('1,0').need === 2, 'rubble: discard as many cards as shown');
ok(!act({ t: 'pay', pi: 0, to: '1,0', cards: hand.slice(0, 1) }).ok, 'rubble: exactly that many');
ok(!act({ t: 'pay', pi: 0, to: '1,0', cards: [hand[0], hand[0]] }).ok, 'rubble: different cards');
ok(act({ t: 'pay', pi: 0, to: '1,0', cards: hand.slice(0, 2) }).ok && at(0) === '1,0' && S.players[0].play.length === 2, 'rubble: the cards are discarded (in play until the turn ends)');
ok(act({ t: 'pay', pi: 0, to: '2,0', cards: [hand[2]] }).ok && S.trash.includes(hand[2]), 'base camp: the cards leave the game');
game(['s r2']); give(0, 'explorer');
ok(!payTargets(S, 0, 0).has('1,0'), 'rubble can\'t be entered without enough cards in hand');
// ---------- blockades
game(['s j1 j1 j1'], { blockades: [['1,0', '2,0', { k: 'j', v: 1, n: 5 }]] }); S.players[0].pieces[0] = '1,0';
[ex, sc] = give(0, 'explorer', 'scout');
ok(!targets(0, 0, 'explorer').has('2,0'), 'a blockade adds its cost to the space behind it');
ok(targets(0, 0, 'scout').has('2,0'), 'a card that covers both crosses it');
ok(act({ t: 'move', card: sc, pi: 0, to: '2,0' }).ok && S.blockades[0].owner === 0 && blocksOf(S, 0).join() === '0', 'the first explorer across takes the blockade');
S.players[0].pieces[0] = key(7, 4); S.cur = 1; S.players[1].pieces[0] = '1,0'; give(1, 'explorer');
ok(targets(1, 0, 'explorer').has('2,0'), 'a taken blockade is open for everyone after');
game(['s j1 j1'], { blockades: [['1,0', '2,0', { k: 'w', v: 1 }]] }); S.players[0].pieces[0] = '1,0'; give(0, 'trailblazer');
ok(!targets(0, 0, 'trailblazer').has('2,0'), 'a water blockade can\'t be crossed with machetes');
game(['s j1 j1'], { blockades: [['1,0', '2,0', { k: 'r', v: 2, n: 6 }]] }); S.players[0].pieces[0] = '1,0'; hand = give(0, 'explorer', 'sailor');
pt = payTargets(S, 0, 0);
ok(pt.get('B0') && pt.get('B0').kind === 'blr' && pt.get('B0').need === 2, 'a rubble blockade: discard its count');
ok(act({ t: 'pay', pi: 0, to: 'B0', cards: hand }).ok && S.blockades[0].owner === 0 && at(0) === '1,0', 'paying it takes the blockade (the explorer stays)');
// ---------- the Native
game(['s j3 m', 'c2'], { blockades: [['0,0', '1,0', { k: 'j', v: 2 }]] }); let [nat] = give(0, 'native');
const nt = nativeTargets(S, 0, 0);
ok(nt.has('1,0') && nt.get('1,0').bl === 0, 'the Native moves to an adjacent space whatever it needs, across a blockade');
ok(nt.has('0,1') && nt.has('B0'), 'the Native reaches rubble and camps too, or tears a blockade down on its own');
ok(act({ t: 'native', card: nat, pi: 0, to: '1,0' }).ok && at(0) === '1,0' && S.blockades[0].owner === 0, 'crossing a blockade with the Native takes it');
ok(!nativeTargets(S, 0, 0).has('2,0'), 'the Native can\'t enter mountains');
// ---------- buying
game(['s j1']); hand = give(0, 'traveler', 'explorer', 'sailor');
const stack = t => S.market.find(s => s.t === t) || S.reserve.find(s => s.t === t);
ok(!act({ t: 'buy', type: 'trailblazer', cards: hand }).ok, 'coins: a coin card pays its value, any other card ½ (2 < 3)');
const n0 = stack('photographer').n;
ok(act({ t: 'buy', type: 'photographer', cards: hand }).ok && stack('photographer').n === n0 - 1 && S.players[0].discard.some(id => S.cards[id] === 'photographer'), 'buy: the card goes to the discard pile');
ok(S.players[0].play.length === 3, 'the cards paid go to play');
give(0, 'millionaire');
ok(!act({ t: 'buy', type: 'scout', cards: S.players[0].hand.slice() }).ok, 'one purchase per turn');
game(['s j1']); hand = give(0, 'millionaire', 'millionaire');
ok(!act({ t: 'buy', type: 'pioneer', cards: hand }).ok, 'the reserve is closed while every market slot has cards');
S.market[0].n = 0;
ok(act({ t: 'buy', type: 'pioneer', cards: hand }).ok && S.market[0].t === 'pioneer' && S.market[0].n === 2 && !S.reserve.some(s => s.t === 'pioneer'), 'once a slot is empty, a reserve stack can be bought and moves into it');
game(['s j1']); hand = give(0, 'chest', 'giant');
act({ t: 'buy', type: 'scout', cards: hand });
ok(S.trash.includes(hand[0]) && S.players[0].play.includes(hand[1]), 'single use: a coin card paying its value leaves the game, a card paying ½ is discarded');
// ---------- where a card can go (the engine answers the page's targets too)
game(['s j1 r2', 'j1']); let [ctE, ctS, ctA] = give(0, 'explorer', 'sailor', 'cartographer');
ok(cardTargets(S, 0, 0, ctE).has('1,0') && cardTargets(S, 0, 0, ctE).has('0,1') && cardTargets(S, 0, 0, ctE).get('1,0').kind === 'move', 'a movement card: the spaces it reaches');
ok(!cardTargets(S, 0, 0, ctS).has('1,0') && cardTargets(S, 0, 0, ctS).get('2,0') === undefined, 'a paddle: no jungle');
game(['s r2']); [ctE, ctS, ctA] = give(0, 'explorer', 'sailor', 'cartographer');
ok(cardTargets(S, 0, 0, ctA).get('1,0') && cardTargets(S, 0, 0, ctA).get('1,0').kind === 'rubble', 'any card can be given up for rubble next to the explorer');
ok(!cardTargets(S, 1, 0, ctE).size, 'nothing out of turn');
game(['s j1 j1 j1']); [ctE] = give(0, 'trailblazer'); act({ t: 'move', card: ctE, pi: 0, to: '1,0' });
ok([...cardTargets(S, 0, 0, ctE).keys()].join() === '2,0,3,0', 'the card in play: where its leftover strength reaches');
// ---------- what can be bought now (the engine answers the page's market too)
game(['s j1']); hand = give(0, 'traveler', 'traveler', 'explorer');
let bo = buyOptions(S, 0);
ok(bo.length && bo.every(o => o.src === 'm' && CT[o.t].cost <= 2.5) && S.market.every((s, i) => CT[s.t].cost > 2.5 || bo.some(o => o.i === i)), 'buy options: the market cards the hand can pay for');
ok(cantBuy(S, 1, 'scout') === 'It is not your turn.' && !buyOptions(S, 1).length, 'only the player to act can buy');
ok(/reserve/.test(cantBuy(S, 0, S.reserve[0].t)), 'the reserve is closed while every market slot has cards');
S.turn.pending = { max: 1 };
ok(!buyOptions(S, 0).length && /remove/.test(cantBuy(S, 0, 'scout')), 'nothing can be bought while a removal is still to choose');
S.turn.pending = null; S.turn.bought = true;
ok(!buyOptions(S, 0).length && /one card per turn/.test(cantBuy(S, 0, 'scout')), 'nor once the turn\'s card is bought');
game(['s j1']); deck(0, 'traveler', 'photographer'); let [log1] = give(0, 'travellog'); hand = give(0, 'traveler', 'traveler', 'traveler');
act({ t: 'action', card: log1 });
ok(!act({ t: 'buy', type: 'trailblazer', cards: hand }).ok && !S.turn.bought, 'Travel Log, then a buy before choosing what to remove: refused');
ok(act({ t: 'trash', cards: [] }).ok && act({ t: 'buy', type: 'trailblazer', cards: hand }).ok, 'once the removal is chosen (even nothing), the buy goes through');
// ---------- the Transmitter and action cards
game(['s j1']); let [tr] = give(0, 'transmitter');
const r0 = stack('native').n;
ok(act({ t: 'transmit', card: tr, type: 'native' }).ok && stack('native').n === r0 - 1 && S.players[0].discard.some(id => S.cards[id] === 'native') && S.trash.includes(tr), 'Transmitter: any card, reserve included, to the discard pile; it leaves the game');
ok(!S.turn.bought, 'the Transmitter is not the turn\'s purchase');
game(['s j1']); deck(0, 'explorer', 'explorer', 'explorer', 'explorer'); let [ca, co] = give(0, 'cartographer', 'compass');
ok(act({ t: 'action', card: ca }).ok && S.players[0].hand.length === 3 && S.players[0].play.includes(ca), 'Cartographer draws 2');
ok(act({ t: 'action', card: co }).ok && S.players[0].hand.length === 4 && S.trash.includes(co), 'Compass draws 3 and leaves the game');
game(['s j1']); deck(0, 'traveler', 'traveler'); let [sci, keep1] = give(0, 'scientist', 'explorer');
ok(act({ t: 'action', card: sci }).ok && S.turn.pending && S.turn.pending.max === 1, 'Scientist draws 1, then offers to remove 1');
ok(!act({ t: 'end', keep: [] }).ok, 'nothing else until the removal is decided');
ok(!act({ t: 'trash', cards: S.players[0].hand.slice(0, 2) }).ok, 'the Scientist removes at most 1');
ok(act({ t: 'trash', cards: [keep1] }).ok && S.trash.includes(keep1) && !S.turn.pending, 'the chosen card leaves the game');
game(['s j1']); deck(0, 'traveler', 'traveler'); let [tl] = give(0, 'travellog');
ok(act({ t: 'action', card: tl }).ok && S.turn.pending.max === 2 && act({ t: 'trash', cards: [] }).ok && S.trash.includes(tl), 'Travel Log: draw 2, remove up to 2 (or none); it leaves the game');
// ---------- single-use movement cards
game(['s j1 j1']); let [gm] = give(0, 'giant');
ok(act({ t: 'move', card: gm, pi: 0, to: '2,0' }).ok && S.trash.includes(gm) && !S.players[0].play.includes(gm), 'a single-use card played for movement leaves the game');
// ---------- the end of a turn
game(['s j1']); deck(0, 'traveler', 'traveler', 'traveler'); S.players[0].discard = [newCard(S, 'sailor'), newCard(S, 'sailor')];
let hand2 = give(0, 'explorer', 'explorer', 'scout');
act({ t: 'move', card: hand2[0], pi: 0, to: '1,0' });
ok(act({ t: 'end', keep: [hand2[2]] }).ok, 'end turn');
const P0 = S.players[0];
ok(P0.hand.includes(hand2[2]) && P0.hand.length === 4 && P0.discard.includes(hand2[1]) && P0.discard.includes(hand2[0]), 'kept cards stay, the rest and the played cards are discarded, then draw up to 4');
ok(S.cur === 1, 'the turn passes');
game(['s j1']); deck(0, 'traveler'); S.players[0].discard = ['a', 'b', 'c'].map(() => newCard(S, 'sailor'));
act({ t: 'end', keep: [] });
ok(S.players[0].hand.length === 4 && S.players[0].discard.length === 0, 'an empty draw pile is refilled from the shuffled discard pile');
game(['s j1']); S.cur = 2; act({ t: 'end', keep: [] });
ok(S.cur === 0 && S.round === 2, 'a new round starts with the first player');
// ---------- the end of the game
game(['s gw', '. .', 's gw'], { players: 3 }); S.players[1].pieces[0] = '0,2';
give(0, 'sailor'); act({ t: 'move', card: S.players[0].hand[0], pi: 0, to: '1,0' });
ok(S.players[0].pieces[0] === 'done' && S.players[0].fin === 1 && !S.over, 'full race: the first arrival doesn\'t end the game');
ok(S.cur === 1 && !S.players[0].play.length && !S.players[0].hand.length, 'arriving with your last explorer ends your turn at once (nothing left to draw for)');
S.blockades = [{ n: 1, k: 'j', v: 1, conn: 9, owner: 1 }];
give(1, 'sailor'); act({ t: 'move', card: S.players[1].hand[0], pi: 0, to: '1,2' });
ok(S.cur === 2 && !S.over, 'full race: with one left racing, the round is still finished');
act({ t: 'end', keep: [] });
ok(S.over && S.places.join() === '2,1,3', 'full race: over at the end of that round; arrivals ranked by blockades, the one still racing last');
game(['s gw'], { players: 3, fullRace: false }); S.cur = 1; S.players[1].pieces[0] = '0,0'; S.players[0].pieces[0] = key(7, 4); give(1, 'sailor');
act({ t: 'move', card: S.players[1].hand[0], pi: 0, to: '1,0' }, 1);
ok(!S.over && S.cur === 2, 'first-arrival rule: the round is finished first');
act({ t: 'end', keep: [] }, 2);
ok(S.over && S.places[1] === 1 && S.places.filter(p => p === 1).length === 1, 'first-arrival rule: over at the end of that round');
game(['s gw'], { players: 3 });
for (const i of [0, 1, 2]) { S.players[i].pieces = ['done']; S.players[i].fin = 1; }
S.endTriggered = true; // (as the arrivals would have: checkEnd)
S.blockades = [{ n: 2, k: 'j', v: 1, conn: 0, owner: 1 }, { n: 6, k: 'r', v: 2, conn: 1, owner: 0 }, { n: 1, k: 'j', v: 1, conn: 2, owner: 1 }];
act({ t: 'end', keep: [] }); act({ t: 'end', keep: [] }, 1); act({ t: 'end', keep: [] }, 2);
ok(S.over && S.places.join() === '2,1,3', 'tie-break: most blockades first');
game(['s gw'], { players: 3 });
for (const i of [0, 1, 2]) { S.players[i].pieces = ['done']; S.players[i].fin = 1; }
S.endTriggered = true; // (as the arrivals would have: checkEnd)
S.blockades = [{ n: 3, k: 'j', v: 1, conn: 0, owner: 1 }, { n: 5, k: 'r', v: 2, conn: 1, owner: 0 }];
act({ t: 'end', keep: [] }); act({ t: 'end', keep: [] }, 1); act({ t: 'end', keep: [] }, 2);
ok(S.over && S.places.join() === '1,2,3', 'tie-break: then the highest-numbered blockade');
// ---------- two explorers each (2 players)
game(['s gw', '. .', 's gj'], { players: 2 }); S.players[0].pieces = ['0,0', '0,2']; give(0, 'sailor', 'explorer');
act({ t: 'move', card: S.players[0].hand[0], pi: 0, to: '1,0' });
ok(S.players[0].pieces[0] === 'done' && !S.players[0].fin && S.cur === 0, 'with two explorers, one arriving is not enough: the turn goes on');
ok(act({ t: 'move', card: S.players[0].hand[0], pi: 1, to: '1,2' }).ok && S.cur === 1, 'the other explorer still moves; when it arrives too, the turn ends');
// ---------- resigning, turns, validation
game(['s j1 gj']);
ok(!act({ t: 'end', keep: [] }, 1).ok, 'out of turn: refused');
ok(!act({ t: 'endgame' }, 1).ok, 'ending the game needs the turn too');
ok(!act({ t: 'move', card: 'c9999', pi: 0, to: '1,0' }).ok && !act({ t: 'nope' }).ok && !act(null).ok, 'unknown cards and actions: refused');
ok(act({ t: 'resign' }, 1).ok && S.players[1].resigned && S.cur === 0, 'a player may resign out of turn');
ok(act({ t: 'resign' }, 2).ok && S.over && S.places.join() === '1,3,2', 'one left racing after resignations: over now; those who left place last, the first to leave last of all');
// ---------- undo (records)
let rec = null, before = null;
for (let seed = 1; seed < 40 && !before; seed++) { // a deal where the first player has a move
  ({ gs: S, rec } = recNewGame({ course: COURSES[0], seed, players: [0, 1, 2].map(i => ({ name: 'P' + i, color: COLORS[i].hex })) }));
  const me = S.cur, pos = JSON.stringify(S.players[me].pieces);
  for (const id of S.players[me].hand) { const t = [...targets(me, 0, S.cards[id])].find(([, v]) => v.kind === 'move');
    if (CT[S.cards[id]].c !== 'p' && t && recApply(S, rec, me, { t: 'move', card: id, pi: 0, to: t[0] }).ok) { before = pos; break; } }
}
ok(before && recCanUndo(rec) && (S = recUndo(rec)) && JSON.stringify(S.players[S.cur].pieces) === before, 'a move can be taken back');
recApply(S, rec, S.cur, { t: 'end', keep: [] });
ok(!recCanUndo(rec), 'nothing before a draw or a new turn can be taken back');
ok(rec.v === 3 && !replayCheck(rec) && /older version/.test(replayCheck({ ...rec, v: 2 })), 'records are log v3; records from before (older rules) are refused');
// ---------- what each player is shown
const R = redact(S, 1), mine = R.players[1];
ok(mine.hand.every(id => R.cards[id] === S.cards[id]), 'a player sees their own hand');
ok(mine.deck.map(id => R.cards[id]).join() === S.players[1].deck.map(id => S.cards[id]).sort().join(), 'and what is in their draw pile, but not its order');
ok(S.players.every((p, i) => i === 1 || [...p.hand, ...p.deck].every(id => !R.cards[id] && !R.players[i].hand.includes(id) && !R.players[i].deck.includes(id))), 'but no one else\'s hand or draw pile');

if (failures.length) { console.error('FAIL:\n  ' + failures.join('\n  ')); process.exit(1); }
console.log(`ok: ${checks} rules checks`);

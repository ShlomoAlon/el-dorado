// Online play end to end, against a local game server that this test starts (wrangler dev, empty database):
//   1. three people: sign in, a room (create / join by code / join by link), start, each sees only their own hand,
//      move, undo, buy, end turn, the turn clock, refused actions, two resignations → game over, ratings, the replay
//   2. a rated room with two AI seats: the AIs play on the server; after the person resigns they finish the race and
//      every rating moves by its delta
//   3. an unrated room: nobody's rating moves
//   4. room lists (public listed, private not) and quick match (starts when full, or early when everyone asks)
//   NODE_PATH=$(npm root -g) node test/online.cjs        (or: node test/run.mjs --online)
const { chromium, startServer, openPage, settle, report } = require('./lib.cjs');
const T = report('online');
(async () => {
  const srv = await startServer(), b = await chromium.launch(), pages = [];
  try {
    const open = async name => { const p = await openPage(b, name); pages.push(p); await p.goto(srv.url); await p.waitForFunction(() => window.__ED); return p; };
    const signIn = async (p, name) => {
      await p.click('#sMode label[data-v="online"]'); await p.waitForSelector('#devName', { state: 'visible' });
      await p.fill('#devName', name); await p.click('#devGo');
      await p.waitForFunction(() => __ED.NET.user); return p.evaluate(() => __ED.NET.user.id);
    };
    const wait = (p, f, arg, ms = 30000) => p.waitForFunction(f, arg, { timeout: ms }).then(() => true, () => false);
    const board = p => p.evaluate(async () => Object.fromEntries((await (await fetch('/api/leaderboard')).json()).players.map(x => [x.id, { r: x.rating, g: x.games }])));
    const mkRoom = (p, o) => p.evaluate(async o => { const r = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + __ED.NET.token }, body: JSON.stringify(o) });
      const j = await r.json(); __ED.joinRoom(j.code); return j.code; }, o);

    // ---------- 1. three people
    const A = await open('A'), B = await open('B'), C = await open('C');
    const ids = [await signIn(A, 'Alice'), await signIn(B, 'Bob'), await signIn(C, 'Cara')];
    T.ok('sign in: the account bar shows the name', await A.evaluate(() => document.querySelector('#acct').textContent.includes('Alice')));
    const lb0 = await board(A);
    const code = await mkRoom(A, { max: 3, turn: 20, course: 'first' }); // (a short turn clock, so the timeout step doesn't wait long, yet long enough for the steps before it on a busy machine: developer servers allow it)
    await B.fill('#jCode', code); await B.click('#jGo');
    await C.goto(srv.url + '?room=' + code);
    T.ok('room: joined by code and by link', await wait(A, () => __ED.NET.room && __ED.NET.room.seats.length === 3), code);
    T.ok('room lobby: no tabs or Profile link to wander off with (Leave is the way out)', await B.evaluate(() => document.querySelector('#sMode').hidden && getComputedStyle(document.querySelector('#acProfile')).display === 'none'));
    await A.click('#rlStart');
    const started = await Promise.all([A, B, C].map(p => wait(p, () => __ED.online() && !document.querySelector('#menu').open)));
    T.ok('start: every player is in the game, menu closed', started.every(Boolean));
    // the menu during an online game: the Online screen with the game bar only (no second game to start, no tabs)
    await B.click('#menuBtn');
    T.ok('menu during an online game: Back to game, nothing that would leave it', await wait(B, () => document.querySelector('#menu').open && !document.querySelector('#ingame').hidden && document.querySelector('#sMode').hidden && document.querySelector('#oPlay').hidden && !document.querySelector('#oBusy').hidden));
    await B.click('#sBack');
    T.ok('back to the online game, still connected', await wait(B, () => !document.querySelector('#menu').open && __ED.NET.connected && !!__ED.S));
    // a connection that dies silently (a phone asleep, a dropped network): noticed when the page comes back, and replaced
    await B.evaluate(() => { const w = __ED.NET.ws; window.__deadWs = w; w.send = () => { }; w.onmessage = () => { }; document.dispatchEvent(new Event('visibilitychange')); });
    T.ok('a silently dead connection is noticed and replaced', await wait(B, () => __ED.NET.ws && __ED.NET.ws !== window.__deadWs && __ED.NET.connected && !!__ED.S, null, 30000));
    const view = await Promise.all([A, B, C].map(p => p.evaluate(me => { const S = __ED.S, seat = __ED.NET.seat;
      return { seat, mine: S.players[seat].hand.every(id => S.cards[id]), others: S.players.every((q, i) => i === seat || q.hand.every(id => !S.cards[id])) }; }, ids[[A, B, C].indexOf(p)])));
    T.ok('each player sees their own hand and no one else\'s', view.every(v => v.seat >= 0 && v.mine && v.others) && new Set(view.map(v => v.seat)).size === 3, JSON.stringify(view));
    const who = async () => { for (const p of [A, B, C]) if (await p.evaluate(() => __ED.canAct())) return p; return null; };
    let P = await who();
    // move (a card with a reachable space: a player can start without one; then they just end their turn)
    const before = await P.evaluate(() => JSON.stringify(__ED.S.players[__ED.S.cur].pieces));
    const moved = await P.evaluate(() => { const E = __ED, S = E.S; for (const id of S.players[S.cur].hand) { E.onHandCard(id);
      const k = [...E.UI.targets].find(([k, t]) => k[0] !== 'B' && t.kind === 'move'); if (k) { E.doMove(k[0]); return k[0]; } E.cancelMode(); } return null; });
    if (moved) {
      T.ok('move: the server applies it', await wait(P, b => JSON.stringify(__ED.S.players[__ED.S.cur].pieces) !== b, before));
      await settle(P); await P.click('#bUndo');
      T.ok('undo: the move is taken back', await wait(P, b => JSON.stringify(__ED.S.players[__ED.S.cur].pieces) === b, before));
    } else console.log('     (no move for the first player in this deal: move and undo not checked)');
    // a buy: the cheapest affordable market card, paid with the whole hand
    const bought = await P.evaluate(() => { const E = __ED, s = document.querySelector('#market .mslot.can'); if (!s) return false;
      E.pickFromMarket(s.dataset.src, +s.dataset.i); E.UI.picks = E.S.players[E.S.cur].hand.slice(); E.confirmBuy(); return true; });
    if (bought) T.ok('buy: the server applies it', await wait(P, () => __ED.S.turn.bought));
    // actions only the server or local play may use are refused
    await P.evaluate(() => __ED.netSend({ t: 'act', a: { t: 'timeout' } }));
    T.ok('a player can\'t send timeout', await wait(P, () => /Bad action/.test(document.querySelector('#toast').textContent), null, 5000));
    // a bug in the live room (a failed assertion, forced by a developer-only message): that message is refused, the room is
    // rebuilt from storage and plays on (the turns below), and the bug is stored as a report with the room and its record
    const round0 = await P.evaluate(() => __ED.S.round);
    await P.evaluate(() => __ED.netSend({ t: 'selftest' }));
    T.ok('a failed assertion in a room: the player is told, and the game goes on as it was', await wait(P, r => /went wrong on the server/.test(document.querySelector('#toast').textContent) && __ED.S.round === r && __ED.NET.connected, round0, 5000));
    // …and in a page: reported, and the page takes a fresh connection (the server's state)
    await C.evaluate(() => { window.__ws0 = __ED.NET.ws; setTimeout(() => __ED.assert(false, 'self-test: a broken invariant in the page')); });
    T.ok('a failed assertion in a page: it reconnects and has the game again', await wait(C, () => __ED.NET.ws !== window.__ws0 && __ED.NET.connected && !!__ED.S, null, 10000));
    let reps = [];
    for (let i = 0; i < 20 && reps.length < 2; i++) { reps = ((await srv.bugs()).bugs || []).filter(b => /self-test/.test(b.msg)); if (reps.length < 2) await A.waitForTimeout(250); }
    const roomRep = reps.find(b => b.source === 'room'), pageRep = reps.find(b => b.source === 'page');
    const roomFull = roomRep && await srv.bugs(roomRep.id), pageFull = pageRep && await srv.bugs(pageRep.id);
    T.ok('bug reports: the room\'s carries the room and its record', !!roomFull && roomFull.context.d.code === code && Array.isArray(roomFull.context.rec.actions) && /selftest/.test(roomFull.context.what), JSON.stringify(reps.map(b => b.source + ': ' + b.msg)));
    T.ok('bug reports: the page\'s carries the game it held, its selection and its log', !!pageFull && pageFull.context.game.room === code && !!pageFull.context.game.S && !!pageFull.context.ui && Array.isArray(pageFull.context.log) && /^app\.\w+\.js$/.test(pageFull.build) && pageFull.who === ids[2], pageFull && pageFull.build);
    T.ok('bug reports can\'t be read without the key', (await fetch(srv.url + 'api/bugs')).status === 403);
    const cur0 = await P.evaluate(() => __ED.S.cur);
    await P.evaluate(() => { __ED.startEndTurn(); if (['endTurn', 'buyWarn'].includes(__ED.UI.mode)) { __ED.startEndTurn(); if (__ED.UI.mode === 'endTurn') __ED.finishTurn(); } });
    T.ok('end turn: the next player moves', await wait(A, c => __ED.S.cur !== c, cur0));
    // the turn clock: nobody acts, the turn ends by itself
    const cur1 = await A.evaluate(() => __ED.S.cur);
    T.ok('turn clock: the turn passes when time runs out', await wait(A, c => __ED.S.cur !== c && __ED.S.log.some(l => l.e === 'timeout'), cur1, 45000));
    // two resign: the game is over for the third, rated
    // B leaves through the menu (Resign, then Leave game): the Online screen comes up as soon as the server has it
    await B.click('#menuBtn'); await B.click('#sResign'); await B.click('#rsYes');
    T.ok('resign from the menu: out of the game, on the Online screen', await wait(B, () => !__ED.S && document.querySelector('#menu').open && !document.querySelector('section[data-screen="online"]').hidden));
    // the others play on without B: B is out of that room (no Rejoin; Quick match doesn't send B back into it)
    const bActive = () => B.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: 'Bearer ' + __ED.NET.token } })).json()).active);
    let bIn = await bActive(); for (let i = 0; i < 20 && bIn; i++) { await B.waitForTimeout(250); bIn = await bActive(); }
    T.ok('a resigned player is out of the room (no Rejoin, no quick match back into it)', bIn === null && await B.evaluate(() => document.querySelector('#rejoin').hidden), bIn);
    await C.evaluate(() => __ED.netSend({ t: 'act', a: { t: 'resign' } }));
    T.ok('game over after two resign', await wait(A, () => __ED.S.over && __ED.NET.room.results));
    const res = await A.evaluate(() => __ED.NET.room.results), lb1 = await board(A);
    T.ok('ratings move by the deltas', !!res.deltas && ids.every((id, i) => Math.abs(lb1[id].r - (lb0[id] ? lb0[id].r : 1200) - res.deltas[i]) < .01 && lb1[id].g === 1), JSON.stringify(res.deltas));
    const rep = res.replay && await A.evaluate(async id => { const r = await fetch('/api/replays/' + id); return r.ok && (await r.json()).kind; }, res.replay);
    T.ok('the game is kept as a replay', rep === 'eldorado-replay', res.replay);
    T.ok('game over: results shown', await wait(A, () => !!document.querySelector('#overlay #gNew')));

    // ---------- 2. a rated room with two AIs (added from the room lobby)
    await A.click('#gNew'); await wait(A, () => document.querySelector('#menu').open);
    const code2 = await mkRoom(A, { max: 3, turn: 60, course: 'first' });
    await wait(A, () => __ED.NET.room && __ED.NET.room.seats.length === 1);
    await A.click('[data-addai="fawcett"]'); await wait(A, () => __ED.NET.room.seats.length === 2);
    await A.click('[data-addai="raleigh"]'); await wait(A, () => __ED.NET.room.seats.length === 3);
    T.ok('AI seats added from the room lobby', (await A.evaluate(() => __ED.NET.room.seats.map(s => s.ai || '').join())) === ',fawcett,raleigh', code2);
    await A.click('#rlStart'); await wait(A, () => __ED.online());
    let noClockOnAI = true;
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < 120 && !(await A.evaluate(() => __ED.canAct() || __ED.S.over)); i++) { if (await A.evaluate(() => __ED.S.cur !== 0 && !!__ED.NET.deadline)) noClockOnAI = false; await A.waitForTimeout(250); }
      await A.evaluate(() => { __ED.startEndTurn(); if (['endTurn', 'buyWarn'].includes(__ED.UI.mode)) { __ED.startEndTurn(); if (__ED.UI.mode === 'endTurn') __ED.finishTurn(); } });
      await wait(A, () => !__ED.canAct());
    }
    T.ok('AIs take their turns on the server (no clock on their turns)', noClockOnAI && await A.evaluate(() => __ED.S.round >= 2));
    const lbA = await board(A);
    await A.evaluate(() => __ED.netSend({ t: 'act', a: { t: 'resign' } }));
    T.ok('after the person resigns, the AIs finish the race', await wait(A, () => __ED.S.over && __ED.NET.room.results, null, 120000));
    const res2 = await A.evaluate(() => __ED.NET.room.results), lbB = await board(A);
    T.ok('AI ratings move by their deltas', ['ai-fawcett', 'ai-raleigh'].every((id, k) => Math.abs(lbB[id].r - lbA[id].r - res2.deltas[k + 1]) < .01 && lbB[id].g === lbA[id].g + 1), JSON.stringify(res2.deltas));

    // ---------- 3. unrated: nothing moves
    await A.click('#gNew'); await wait(A, () => document.querySelector('#menu').open);
    await mkRoom(A, { max: 3, turn: 60, course: 'first', rated: false });
    await wait(A, () => __ED.NET.room && __ED.NET.room.seats.length === 1);
    await A.click('[data-addai="raleigh"]'); await wait(A, () => __ED.NET.room.seats.length === 2);
    await A.click('[data-addai="raleigh"]'); await wait(A, () => __ED.NET.room.seats.length === 3);
    await A.click('#rlStart'); await wait(A, () => __ED.online());
    await A.evaluate(() => __ED.netSend({ t: 'act', a: { t: 'resign' } }));
    T.ok('unrated game ends as unrated', await wait(A, () => __ED.S.over && __ED.NET.room.results && __ED.NET.room.results.unrated, null, 120000));
    const lbC = await board(A);
    T.ok('an unrated game changes no rating', lbC['ai-raleigh'].g === lbB['ai-raleigh'].g && lbC['ai-raleigh'].r === lbB['ai-raleigh'].r && lbC[ids[0]].r === lbB[ids[0]].r);

    // ---------- 4. room lists and quick match
    const D = await open('D'), E2 = await open('E'), F = await open('F'); await signIn(D, 'Dora'); await signIn(E2, 'Emil'); await signIn(F, 'Finn');
    const pub = await mkRoom(D, { max: 3, turn: 60, course: 'first', pub: true }), priv = await mkRoom(E2, { max: 3, turn: 60, course: 'first', pub: false });
    T.ok('a public room is listed, a private one is not', await wait(F, (c) => __ED.NET.rooms.some(r => r.code === c[0]) && !__ED.NET.rooms.some(r => r.code === c[1]), [pub, priv]));
    // signing out in a room leaves it (the host's room closes); leaving with the button does too
    await D.click('#acOut');
    T.ok('sign out in a room: out of the room, which closes', await wait(D, () => !__ED.NET.code && !__ED.NET.user) && await wait(F, c => !__ED.NET.rooms.some(r => r.code === c), pub));
    await E2.click('#rlLeave'); await wait(E2, () => !__ED.NET.code);
    await signIn(D, 'Dora');
    for (const p of [D, E2]) { await p.click('#qGo'); await wait(p, () => __ED.NET.room && __ED.NET.room.opts && __ED.NET.room.opts.auto); }
    T.ok('quick match: two players land in the same room', await wait(D, () => __ED.NET.room.seats.length === 2) && (await D.evaluate(() => __ED.NET.code)) === (await E2.evaluate(() => __ED.NET.code)));
    await F.click('#qGo');
    T.ok('quick match: it starts by itself once full', (await Promise.all([D, E2, F].map(p => wait(p, () => __ED.online())))).every(Boolean));
    const G2 = await open('G'), H2 = await open('H'); await signIn(G2, 'Gwen'); await signIn(H2, 'Hugo');
    for (const p of [G2, H2]) { await p.click('#qGo'); await wait(p, () => __ED.NET.room && __ED.NET.room.opts && __ED.NET.room.opts.auto); }
    await wait(G2, () => __ED.NET.room.seats.length === 2);
    await G2.click('#rlNow'); await H2.click('#rlNow');
    T.ok('quick match: "Start now" from everyone starts it early', await wait(G2, () => __ED.online()) && await wait(H2, () => __ED.online()));

    const errs = pages.flatMap(p => p.errors).filter(e => !/self-test/.test(e));
    T.ok('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
    const other = ((await srv.bugs()).bugs || []).filter(b => !/self-test/.test(b.msg));
    T.ok('no bug reports but the forced ones (no assertion failed on the server or in a page)', !other.length, other.slice(0, 5).map(b => b.source + ': ' + b.msg).join(' | '));
  } catch (e) { T.ok('test ran to the end', false, e.message.split('\n').slice(0, 3).join(' · ')); const errs = pages.flatMap(p => p.errors); if (errs.length) console.log('page errors:\n  ' + errs.slice(0, 8).join('\n  ')); }
  finally { await b.close(); srv.stop(); }
  T.done();
})();

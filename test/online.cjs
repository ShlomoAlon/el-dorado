// Online play end to end, against a local game server that this test starts (wrangler dev, empty database):
//   1. three people: sign in, a room (create / join by code / join by link), start, each sees only their own hand,
//      move, undo, buy, end turn, the turn clock, refused actions, two resignations → game over, ratings, the replay
//   2. a rated room with two AI seats: the AIs play on the server; after the person resigns they finish the race and
//      every rating moves by its delta
//   3. an unrated room: nobody's rating moves
//   3b. two games at once: both run to their end side by side, each page hears only its own room
//   4. room lists (public listed, private not) and quick match (starts when full, or early when everyone asks)
//   NODE_PATH=$(npm root -g) node test/online.cjs        (or: node test/run.mjs --online)
const { chromium, startServer, openPage, settle, report } = require('./lib.cjs');
const { step } = require('./playstep.cjs');
const T = report('online');
(async () => {
  const srv = await startServer(), b = await chromium.launch(), pages = [];
  try {
    const open = async name => { const p = await openPage(b, name, { allow: /self-test/ }); pages.push(p); await p.goto(srv.url); await p.waitForFunction(() => window.__ED); return p; };
    // a page whose section is over is closed (its errors are kept in pages): left open, it goes on drawing and slows the rest
    const done = async (...ps) => { for (const q of ps) await q.context().close(); };
    const signIn = async (p, name) => {
      await p.click('#sMode label[data-v="online"]'); await p.waitForSelector('#devName', { state: 'visible' });
      await p.fill('#devName', name); await p.click('#devGo');
      await p.waitForFunction(() => __ED.NET.user); return p.evaluate(() => __ED.NET.user.id);
    };
    const wait = (p, f, arg, ms = 30000) => p.waitForFunction(f, arg, { timeout: ms }).then(() => true, () => false);
    // the ladder: a retired AI (one no longer in the game) has a row with the top rating; the leaderboard leaves it out, and
    // every profile's rank is its place there (asserted by the server in debug mode; checked here too)
    await fetch(srv.url + 'api/leaderboard'); // (the database is made on the first request)
    srv.sql(`INSERT INTO users(id,name,rating,games,wins,bot,created) VALUES('retired-ai','Old AI',3000,5,5,'retired-ai-id',0)`);
    { const lb = (await (await fetch(srv.url + 'api/leaderboard')).json()).players, ranks = [];
      for (const x of lb) ranks.push((await (await fetch(srv.url + 'api/users/' + x.id)).json()).user.rank);
      T.ok('ladder: a retired AI leaves the leaderboard, and each profile ranks its place on it', !lb.some(x => x.id === 'retired-ai') && ranks.every((r, i) => r === lb.filter(x => x.rating > lb[i].rating).length + 1), lb.map((x, i) => x.name + ' #' + ranks[i]).join(', ')); }
    const board = p => p.evaluate(async () => Object.fromEntries((await (await fetch('/api/leaderboard')).json()).players.map(x => [x.id, { r: x.rating, g: x.games }])));
    const mkRoom = (p, o) => p.evaluate(async o => { const r = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + __ED.NET.token }, body: JSON.stringify(o) });
      const j = await r.json(); __ED.joinRoom(j.code); return j.code; }, o);

    // ---------- 0. a code with no room behind it: said at once (not after a minute of reconnecting), and the code leaves the address
    { const W = await open('W'); await signIn(W, 'Walt'); const t0 = Date.now();
      await W.evaluate(() => __ED.joinRoom('ZZZZ'));
      const said = await wait(W, () => /no room/i.test(document.querySelector('#menu').textContent) && !/[?&]room=/.test(location.search), null, 3000);
      T.ok('wrong room code: said within 3 s, and the code leaves the address', said, ((Date.now() - t0) / 1000).toFixed(1) + ' s; ' + await W.evaluate(() => (__ED.NET.status || '') + ' ' + location.search)); await done(W); }
    // ---------- 0a. coming back: the screen is chosen from what this device knows at once (the server only adds), and a signed-in
    //      player's server check is one round trip, not two (every request here takes 1.5 s). Counted in round trips, not in
    //      time: the same reload is timed first with the server answering at once, and only what the slow requests add is
    //      judged (none signed out; one, 1.5 s, signed in: two would add at least 3 s, however busy the machine), so a slower load can't pass
    //      for a round trip, nor hide one
    { const RT = 1500, slow = P => P.route('**/api/**', async r => { await new Promise(res => setTimeout(res, RT)); await r.continue().catch(e => { if (!/already handled/.test(e.message)) throw e; }); }); // (expected: the page moved on meanwhile)
      const reload = async P => { const t0 = Date.now(); await P.reload({ waitUntil: 'commit' });
        await P.waitForFunction(() => window.__ED && __ED.S && !__ED.UI.preview && !document.querySelector('#menu').open && document.documentElement.classList.contains('boardready'), null, { timeout: 15000 });
        return Date.now() - t0; };
      const back = async (P, signed) => { // (a local game started and saved; then the page is opened again: at once, then with slow requests)
        if (signed) await signIn(P, 'Ulla'); await P.click('label:has(input[name=mode][value=local])'); await P.waitForSelector('#sGo', { state: 'visible' });
        await P.click('#sGo'); await P.waitForFunction(() => __ED.S && !__ED.UI.preview && !document.querySelector('#menu').open);
        const base = await reload(P); await slow(P); const ms = await reload(P); await P.unroute('**/api/**'); return { base, ms, added: ms - base }; };
      const U = await open('U'), out = await back(U, false), U2 = await open('U2'), inn = await back(U2, true);
      T.ok('coming back, signed out: the saved game shows without waiting for the server', out.added < RT, `${out.ms} ms with 1.5 s requests, ${out.base} ms without`);
      T.ok('coming back, signed in: one round trip to the server, not two', inn.added < 2 * RT, `${inn.ms} ms with 1.5 s requests, ${inn.base} ms without`); await done(U, U2); }
    // ---------- 0b. the server out of reach: each request that fails says so, in the page's words (a failed refresh keeps
    //      what was loaded before, and says that too)
    { const V = await open('V'); await signIn(V, 'Vera');
      await V.click('label:has(input[name=otab][value=board])'); await wait(V, () => document.querySelector('#lbList .lb'));
      await V.click('label:has(input[name=otab][value=play])'); await V.waitForTimeout(5200); // (a tab refreshes at most every 5 s)
      await V.route('**/api/**', r => r.abort('internetdisconnected'));
      await V.click('label:has(input[name=otab][value=board])');
      T.ok('offline: a failed refresh says so, and keeps the list', await wait(V, () => /Could not refresh the leaderboard/.test(document.querySelector('#hErr').textContent) && document.querySelector('#lbList .lb'), null, 5000), await V.evaluate(() => document.querySelector('#hErr').textContent));
      await V.click('label:has(input[name=otab][value=play])'); await V.click('#cGo');
      T.ok('offline: Create room says the server is out of reach, in the page\'s words', await wait(V, () => /^Could not reach the server/.test(document.querySelector('#hErr').textContent) && !document.querySelector('section[data-screen=online]').hidden && !!document.querySelector('#hErr').offsetParent, null, 5000), await V.evaluate(() => document.querySelector('#hErr').textContent));
      await V.unroute('**/api/**');
      // Create room opens its lobby at once, you seated, before the server has made the room (its answer held back a second here)
      await V.route('**/api/rooms', r => setTimeout(() => r.continue(), 1000));
      await V.click('#cGo');
      T.ok('Create room: its lobby at once, you seated, its code to come', await V.evaluate(() => new Promise(r => requestAnimationFrame(() => r(!document.querySelector('section[data-screen=room]').hidden && document.querySelectorAll('#rlSeats .seatrow:not(.open)').length === 1 && /…/.test(document.querySelector('#rlTitle').textContent))))));
      T.ok('Create room: the code arrives and the room connects', await wait(V, () => /^Room [A-Z0-9]{4,}$/.test(document.querySelector('#rlTitle').textContent) && __ED.NET.connected && __ED.NET.roomS && __ED.NET.roomS.seats.length === 1, null, 10000));
      await V.unroute('**/api/rooms'); await V.click('#rlLeave'); await done(V); }
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
    // whose turn it is (each page hears of it in its own time: asked again for up to 10 s)
    const who = async () => { for (let t = 0; t < 100; t++) { for (const p of [A, B, C]) if (await p.evaluate(() => __ED.canAct())) return p; await A.waitForTimeout(100); } return null; };
    // move and undo: a deal can start a player with no card that moves an explorer; then they end their turn and the next
    // player tries, until someone can (a check whose setup never comes fails: it is never skipped)
    let P = null, before = null;
    for (let k = 0; k < 6 && !P; k++) {
      const Q = await who(); if (!Q) break;
      before = await Q.evaluate(() => JSON.stringify(__ED.S.players[__ED.S.cur].pieces));
      const moved = await Q.evaluate(() => { const E = __ED, S = E.S; for (const id of S.players[S.cur].hand) { E.onHandCard(id);
        const k = [...E.targets()].find(([k, t]) => k[0] !== 'B' && t.kind === 'move'); if (k) { E.doMove(k[0]); return k[0]; } E.cancelMode(); } return null; });
      if (moved) P = Q;
      else { const cur = await Q.evaluate(() => __ED.S.cur); await Q.evaluate(() => __ED.netSend({ t: 'act', a: { t: 'end', keep: [] } })); await wait(Q, c => __ED.S.cur !== c, cur); }
    }
    T.ok('a player with a move (within 6 turns)', !!P);
    T.ok('move: the server applies it', await wait(P, b => JSON.stringify(__ED.S.players[__ED.S.cur].pieces) !== b, before));
    await settle(P); await P.click('#bUndo');
    T.ok('undo: the move is taken back', await wait(P, b => JSON.stringify(__ED.S.players[__ED.S.cur].pieces) === b, before));
    // a buy: the cheapest affordable market card, paid with the whole hand (a full hand is worth at least 2 coins: something
    // is always affordable, so finding nothing is a failure)
    const bought = await P.evaluate(() => { const E = __ED, s = document.querySelector('#market .mslot.can'); if (!s) return false;
      E.pickFromMarket(s.dataset.src, +s.dataset.i); E.UI.picks = E.S.players[E.S.cur].hand.slice(); E.confirmBuy(); return true; });
    T.ok('buy: an affordable card in the market', bought);
    T.ok('buy: the server applies it', await wait(P, () => __ED.S.turn.bought));
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
    T.ok('a request body that isn\'t JSON gets a 400', (await fetch(srv.url + 'api/bugs', { method: 'POST', body: 'not json' })).status === 400);
    const cur0 = await P.evaluate(() => __ED.S.cur);
    await P.evaluate(() => { __ED.startEndTurn(); if (['endTurn', 'buyWarn'].includes(__ED.UI.mode)) { __ED.startEndTurn(); if (__ED.UI.mode === 'endTurn') __ED.finishTurn(); } });
    T.ok('end turn: the next player moves', await wait(A, c => __ED.S.cur !== c, cur0));
    // the turn clock: nobody acts, the turn ends by itself
    const cur1 = await A.evaluate(() => __ED.S.cur);
    T.ok('turn clock: the turn passes when time runs out', await wait(A, c => __ED.S.cur !== c && __ED.S.log.some(l => l.e === 'timeout'), cur1, 45000));
    // a reload in the middle of the game comes straight back to it: the room's lobby is never shown on the way (the page
    // opens no room screen before the room's first message says what it is)
    await C.addInitScript(() => { setInterval(() => { const d = document.querySelector('#menu'), r = document.querySelector('section[data-screen=room]');
      if (d && d.open && r && !r.hidden && getComputedStyle(d).display !== 'none') window.__lobbyShown = true; }, 5); });
    await C.reload(); const backIn = await wait(C, () => window.__ED && __ED.online() && !document.querySelector('#menu').open, null, 15000);
    T.ok('reload during a game: straight back to it, no lobby on the way', backIn && !(await C.evaluate(() => window.__lobbyShown)), 'back: ' + backIn);
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
    const seats = await A.evaluate(() => __ED.NET.room.seats.map(s => s.uid)); // (seat order: dealt at random when the game starts)
    T.ok('seats dealt in a new order', seats.length === 3 && ids.every(id => seats.includes(id)), seats.join());
    T.ok('ratings move by the deltas', !!res.deltas && ids.every(id => { const i = seats.indexOf(id); return Math.abs(lb1[id].r - (lb0[id] ? lb0[id].r : 1200) - res.deltas[i]) < .01 && lb1[id].g === 1; }), JSON.stringify(res.deltas));
    const rep = res.replay && await A.evaluate(async id => { const r = await fetch('/api/replays/' + id); return r.ok && (await r.json()).kind; }, res.replay);
    T.ok('the game is kept as a replay', rep === 'eldorado-replay', res.replay);
    T.ok('game over: results shown', await wait(A, () => !!document.querySelector('#overlay #gNew')));

    await done(B, C);
    // ---------- 2. a rated room with two AIs (added from the room lobby)
    await A.click('#gNew'); await wait(A, () => document.querySelector('#menu').open);
    const code2 = await mkRoom(A, { max: 3, turn: 60, course: 'first' });
    await wait(A, () => __ED.NET.room && __ED.NET.room.seats.length === 1);
    // a change in the lobby shows at once: with the page's messages held back a second, the AI's seat is there in the frame
    // after the tap, before the server has it (the server's answer then changes nothing on screen)
    await A.evaluate(() => { const ws = __ED.NET.ws, send = ws.send.bind(ws); ws.send = d => setTimeout(() => send(d), 1000); });
    await A.click('[data-addai="fawcett"]');
    T.ok('the lobby shows your change at once, before the server answers', await A.evaluate(() => new Promise(r => requestAnimationFrame(() => r([...document.querySelectorAll('#rlSeats .seatrow:not(.open)')].length === 2 && __ED.NET.roomPending.length === 1)))));
    await wait(A, () => __ED.NET.roomS && __ED.NET.roomS.seats.length === 2 && !__ED.NET.roomPending.length);
    await A.evaluate(() => { delete __ED.NET.ws.send; }); // (messages go at once again)
    await A.click('[data-addai="raleigh"]'); await wait(A, () => __ED.NET.room.seats.length === 3);
    T.ok('AI seats added from the room lobby', (await A.evaluate(() => __ED.NET.room.seats.map(s => s.ai || '').join())) === ',fawcett,raleigh', code2);
    T.ok('a full room: the AI list gives way to "the room is full"', await wait(A, () => document.querySelector('#rlAIList').hidden && !document.querySelector('#rlFull').hidden));
    // the game starts in a hidden tab (no frames drawn, messages still arriving) and an AI moves before anything is drawn
    await A.evaluate(() => { window.__raf = window.requestAnimationFrame; window.__q = []; window.requestAnimationFrame = f => { window.__q.push(f); return window.__q.length; /* (as in a hidden tab: a frame is requested and waits; its id is real) */ }; });
    await A.click('#rlStart'); await wait(A, () => __ED.online());
    if (await A.evaluate(() => __ED.canAct())) await A.evaluate(() => __ED.netSend({ t: 'act', a: { t: 'end', keep: [] } }));
    const aiMoved = await wait(A, () => __ED.S.log.some(e => e.e === 'play' && __ED.S.players[e.pl].ai), null, 30000);
    await A.evaluate(() => { window.requestAnimationFrame = window.__raf; for (const f of window.__q.splice(0)) requestAnimationFrame(f); }); // (the tab comes back)
    T.ok('an AI moving while the tab is hidden: no error, the board catches up', aiMoved && await wait(A, () => document.querySelectorAll('#pieces .piece').length === __ED.S.players.length) && !A.errors.length, A.errors.slice(0, 2).join(' | '));
    let noClockOnAI = true;
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < 120 && !(await A.evaluate(() => __ED.canAct() || __ED.S.over)); i++) { if (await A.evaluate(() => __ED.S.cur !== __ED.NET.seat && !!__ED.NET.deadline)) noClockOnAI = false; await A.waitForTimeout(250); }
      await A.evaluate(() => { __ED.startEndTurn(); if (['endTurn', 'buyWarn'].includes(__ED.UI.mode)) { __ED.startEndTurn(); if (__ED.UI.mode === 'endTurn') __ED.finishTurn(); } });
      await wait(A, () => !__ED.canAct());
    }
    T.ok('AIs take their turns on the server (no clock on their turns)', noClockOnAI && await A.evaluate(() => __ED.S.round >= 2));
    const lbA = await board(A);
    await A.evaluate(() => __ED.netSend({ t: 'act', a: { t: 'resign' } }));
    T.ok('after the person resigns, the AIs finish the race', await wait(A, () => __ED.S.over && __ED.NET.room.results, null, 120000));
    const res2 = await A.evaluate(() => __ED.NET.room.results), lbB = await board(A);
    const seats2 = await A.evaluate(() => __ED.NET.room.seats.map(s => s.uid));
    T.ok('AI ratings move by their deltas', ['ai-fawcett', 'ai-raleigh'].every(id => Math.abs(lbB[id].r - lbA[id].r - res2.deltas[seats2.indexOf(id)]) < .01 && lbB[id].g === lbA[id].g + 1), JSON.stringify(res2.deltas));

    // ---------- 3. unrated: nothing moves
    await A.click('#gNew'); await wait(A, () => document.querySelector('#menu').open);
    await mkRoom(A, { max: 3, turn: 5, course: 'first', rated: false }); // (a 5 s clock: the person's turn runs out, then the AIs play)
    await wait(A, () => __ED.NET.room && __ED.NET.room.seats.length === 1);
    await A.click('[data-addai="raleigh"]'); await wait(A, () => __ED.NET.room.seats.length === 2);
    await A.click('[data-addai="raleigh"]'); await wait(A, () => __ED.NET.room.seats.length === 3);
    await A.click('#rlStart'); await wait(A, () => __ED.online());
    // the person's turn runs out with the AIs to play next: their turns show no clock (the page asserts it every half second)
    T.ok('timeout before AI turns: the turn passes', await wait(A, () => __ED.S.log.some(l => l.e === 'timeout') && __ED.S.players[__ED.S.cur].ai, null, 60000));
    T.ok('timeout before AI turns: no clock while the AIs play', await wait(A, () => __ED.S.players[__ED.S.cur].ai && document.querySelector('#turnTimer').hidden, null, 3000));
    await A.waitForTimeout(2500); // (the AIs play on: the clock's half-second checks run meanwhile)
    await A.evaluate(() => __ED.netSend({ t: 'act', a: { t: 'resign' } }));
    T.ok('unrated game ends as unrated', await wait(A, () => __ED.S.over && __ED.NET.room.results && __ED.NET.room.results.unrated, null, 120000));
    const lbC = await board(A);
    T.ok('an unrated game changes no rating', lbC['ai-raleigh'].g === lbB['ai-raleigh'].g && lbC['ai-raleigh'].r === lbB['ai-raleigh'].r && lbC[ids[0]].r === lbB[ids[0]].r);

    // ---------- 3b. two games at once: each room is its own server object, so games run side by side; each page only ever
    //      hears its own room (checked on every message), and both games reach their end with their AIs racing at once
    const Pa = await open('Pa'), Pb = await open('Pb'); await signIn(Pa, 'Gil'); await signIn(Pb, 'Gwen');
    const pair = [];
    for (const P of [Pa, Pb]) {
      const c = await mkRoom(P, { max: 3, turn: 60, course: 'first', rated: false });
      await wait(P, () => __ED.NET.room && __ED.NET.room.seats.length === 1);
      await P.click('[data-addai="raleigh"]'); await wait(P, () => __ED.NET.room.seats.length === 2);
      await P.click('[data-addai="humboldt"]'); await wait(P, () => __ED.NET.room.seats.length === 3);
      await P.evaluate(code => { window.__alien = 0; __ED.NET.ws.addEventListener('message', e => { if (e.data === 'pong') return; const m = JSON.parse(e.data); if (m.room && m.room.code !== code) window.__alien++; }); }, c);
      pair.push(c);
    }
    T.ok('two games at once: two rooms', pair[0] !== pair[1], pair.join(' '));
    await Promise.all([Pa, Pb].map(P => P.click('#rlStart'))); await Promise.all([Pa, Pb].map(P => wait(P, () => __ED.online())));
    await Promise.all([Pa, Pb].map(P => P.evaluate(() => __ED.netSend({ t: 'act', a: { t: 'resign' } })))); // (both rooms' AIs now race to the end, side by side)
    const ends = await Promise.all([Pa, Pb].map(P => wait(P, () => __ED.S.over && __ED.NET.room.results, null, 120000)));
    T.ok('two games at once: both reach their end', ends.every(Boolean));
    T.ok('two games at once: each page heard only its own room', (await Promise.all([Pa, Pb].map(P => P.evaluate(() => window.__alien)))).every(n => n === 0));

    await done(Pa, Pb);
    // ---------- 3c. a whole game played online through the UI, as a quick person plays it: the same player as the local
    //      played games (test/playstep.cjs), every other move made while the last one is still on its way to the server
    {
      const P = await open('Play'); await signIn(P, 'Paz');
      // (a real connection's delay: each message the page sends reaches the server 150 ms later, in order, so a quick
      // player's taps land while their last move is still on its way, as on the live site)
      await P.evaluate(() => { const send = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { setTimeout(() => send.call(this, d), 150); }; });
      await mkRoom(P, { max: 3, turn: 60, course: 'first', rated: false });
      await wait(P, () => __ED.NET.room && __ED.NET.room.seats.length === 1);
      await P.click('[data-addai="raleigh"]'); await wait(P, () => __ED.NET.room.seats.length === 2);
      await P.click('[data-addai="raleigh"]'); await wait(P, () => __ED.NET.room.seats.length === 3);
      await P.click('#rlStart'); await wait(P, () => __ED.online());
      await P.evaluate(() => { window.__prefer = ['travellog', 'scientist']; }); // (so the game reaches the removal choice, and plays on while moves are on their way)
      const did = {}, odd = []; let steps = 0;
      const ready = quick => P.waitForFunction(q => { const E = window.__ED; return E.S.over || (E.canAct() && (q || (!E.NET.busy && !E.walking())) && E.UI.mode !== 'pay' && E.UI.mode !== 'discardFor'); }, quick, { timeout: 90000 });
      try {
        for (; steps < 1500; steps++) {
          const quick = !!(steps % 2); await ready(quick); if (!quick) await settle(P);
          if (await P.evaluate(() => __ED.S.over)) break;
          const [busy, ahead, r] = await P.evaluate(`(async () => [__ED.NET.busy, __ED.NET.pending.length, await (${step})()])()`), k = (busy ? 'in flight: ' : ahead ? 'ahead of the server: ' : '') + r.split(':')[0];
          did[k] = (did[k] || 0) + 1;
          // (with a move still on its way, the page offers nothing to move to: a tap then does nothing, as for a person)
          if (r.startsWith('unmapped') && !busy) { odd.push(r); break; }
        }
      } catch (e) { odd.push('stopped: ' + e.message.split('\n')[0]); }
      T.ok('a whole game online, played quickly through the UI', await P.evaluate(() => __ED.S.over) && !odd.length, steps + ' moves; ' + odd.join('; '));
      T.ok('online: the removal choice was reached, and moves were made while others were still on their way to the server', Object.keys(did).some(k => /^(\w[\w ]*: )?trash/.test(k)) && Object.keys(did).some(k => k.startsWith('ahead of the server')), JSON.stringify(did));
      console.log('     did: ' + JSON.stringify(did));
      await done(P);
    }

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

// Plays the game the way a person does (mouse clicks and drags on the real page) and checks each step:
// start, select a card, move by clicking a space and by dragging a card onto it, undo, buy (market card, then paying
// cards), end a turn, an AI's turn (live in the history panel), the history panel (hide, show, move, resize, back in place), the menu,
// a replay (step, its history, Fawcett's plan, exit), and
// the market closed while a Travel Log's removal is still to choose.
// Also checks that pressing Start changes nothing on the board, and that no step logs an error.
//   NODE_PATH=$(npm root -g) node test/flows.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const log = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/replay.json'), 'utf8'));
let fails = 0; const ok = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`); };
const serve = () => { const pub = path.join(__dirname, '..', 'public'); const srv = http.createServer((q, r) => {
  const f = path.join(pub, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(pub) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res(srv))); };
(async () => {
  const srv = await serve(), url = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1366, height: 820 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message + (process.env.STACK ? '\n' + e.stack : ''))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const S = (f, a) => p.evaluate(f, a); const wait = ms => p.waitForTimeout(ms);
  const idle = async () => { await p.waitForFunction(() => !window.__ED.UI.anim, null, { timeout: 5000 }); await wait(120); };
  const center = async sel => { const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (!r) throw new Error('not found: ' + sel); return r; };
  await p.goto(url); await wait(700);
  // seat 2 is an AI (Fawcett: the network, fetched from /ai/first.bin when it first moves) for the AI-turn step
  await p.selectOption('select[name=who1]', 'fawcett'); await wait(300);
  // 1. Start: the start screen's background is the game itself, so nothing on the board changes
  await p.evaluate(() => { window.__mut = 0; new MutationObserver(l => { window.__mut += l.length; }).observe(document.querySelector('#stage'), { subtree: true, childList: true, attributes: true, characterData: true }); });
  await p.click('#sGo'); await wait(900);
  ok('Start: no change on the board', await S(() => window.__mut) === 0, (await S(() => window.__mut)) + ' mutations');
  ok('game on show', await S(() => { const E = window.__ED; return !!E.S && !E.UI.preview && document.querySelectorAll('#cards .card').length === 4 && document.querySelectorAll('#pieces .piece').length === E.S.players.length; }));
  // 2. select a card with a click: it lifts, its targets appear
  // (a deal can start a player with no card that moves an explorer: then pass until someone has one; the AI seat plays its own turn)
  const findMove = () => S(() => { const E = window.__ED, S = E.S, P = S.players[S.cur];
    for (const id of P.hand) { E.onHandCard(id); E.render(); const ks = [...E.UI.targets].filter(([k, t]) => k[0] !== 'B' && t.kind === 'move').map(([k]) => k); E.cancelMode(); E.render(); if (ks.length) return { id, ks }; } return null; });
  let pick = await findMove();
  for (let k = 0; k < 6 && !pick; k++) { await S(() => { window.__ED.act({ t: 'end', keep: [] }); }); await p.waitForFunction(() => { const E = window.__ED; return !E.S.players[E.S.cur].ai; }, null, { timeout: 30000 }); await idle(); pick = await findMove(); }
  ok('a playable card', !!pick);
  // (hand.js keeps no id on the element: find the card by its position in the hand)
  const handIdx = await S(id => window.__ED.S.players[window.__ED.S.cur].hand.indexOf(id), pick.id);
  const cardPos = async i => p.evaluate(i => { const E = window.__ED, P = E.S.players[E.S.cur], els = [...document.querySelectorAll('#cards .card:not(.inplay)')];
    // the hand's cards sit left to right in hand order
    const byX = els.map(e => ({ e, r: e.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left); if (!byX[i]) throw new Error('card ' + i + ' of ' + els.length + ': ' + els.map(e => e.className).join()); const r = byX[i].r; return { x: r.left + r.width * .5, y: r.top + r.height * .25 }; }, i);
  let c = await cardPos(handIdx); await p.mouse.click(c.x, c.y); await wait(450);
  ok('click selects the card', await S(id => window.__ED.UI.mode === 'card' && window.__ED.UI.card === id && document.querySelectorAll('#cards .card.sel').length === 1, pick.id));
  ok('targets on the board', await S(() => document.querySelectorAll('#board2 .tgt').length > 0));
  // 3. click a target space: the explorer walks there
  const before = await S(() => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces));
  const tgt = await center(`#board2 .tgt[data-t="${pick.ks[0]}"] polygon`);
  await p.mouse.move(tgt.x, tgt.y); await wait(100); await p.mouse.click(tgt.x, tgt.y); await wait(60);
  ok('the explorer animates', await S(() => window.__ED.UI.anim && document.querySelector('#pieces .piece').parentNode.querySelectorAll('.piece').length > 0));
  await idle();
  ok('click on a space moves', await S(b => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces) !== b, before));
  ok('played card in the play area', await S(() => document.querySelectorAll('#cards .card.inplay').length === 1));
  // 4. undo brings it back
  await p.click('#bUndo'); await wait(400);
  ok('undo', await S(b => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces) === b && !document.querySelector('#cards .card.inplay'), before));
  // 5. drag a card onto a space
  c = await cardPos(handIdx);
  await p.mouse.move(c.x, c.y); await p.mouse.down(); for (let i = 1; i <= 12; i++) { await p.mouse.move(c.x + (tgt.x - c.x) * i / 12, c.y + (tgt.y - c.y) * i / 12); await wait(16); }
  ok('dragging aims the arrow', await S(() => getComputedStyle(document.querySelector('#arrow g')).display !== 'none'));
  await p.mouse.up(); await wait(60); await idle();
  ok('drag onto a space moves', await S(b => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces) !== b, before));
  // 6. buy: tap an affordable market card, then tap cards to pay
  const canBuy = await S(() => !!document.querySelector('#market .mslot.can'));
  if (canBuy) {
    const disc0 = await S(() => window.__ED.S.players[window.__ED.S.cur].discard.length);
    await p.click('#market .mslot.can'); await wait(400);
    ok('buying: the card waits above the hand', await S(() => window.__ED.UI.mode === 'pay' && !document.querySelector('#buySlot').hidden));
    for (let k = 0; k < 4 && await S(() => window.__ED.UI.mode === 'pay'); k++) {
      const n = await S(() => document.querySelectorAll('#cards .card:not(.inplay):not(.pick)').length); if (!n) break;
      const q = await p.evaluate(() => { const e = document.querySelector('#cards .card:not(.inplay):not(.pick)'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * .3 }; });
      await p.mouse.click(q.x, q.y); await wait(500);
    }
    await wait(500);
    ok('bought: the card is in the discard pile', await S(d => window.__ED.S.turn.bought && window.__ED.S.players[window.__ED.S.cur].discard.length === d + 1, disc0), await S(() => window.__ED.UI.mode));
  } else console.log('skip buy (nothing affordable)');
  // 7. end the turn (the buy nudge and the keep-cards step, if they come)
  const me = await S(() => window.__ED.S.cur);
  for (let k = 0; k < 4 && await S(m => window.__ED.S.cur === m, me); k++) { const id = await S(() => ['bEndA', 'bEnd2', 'bEnd'].find(i => document.getElementById(i))); if (!id) break; await p.click('#' + id); await wait(400); }
  ok('turn ended', await S(m => window.__ED.S.cur !== m, me));
  // 8. the AI plays its turn; its steps show in the history panel, newest turn first
  await p.waitForFunction(() => { const E = window.__ED; return !E.S.players[E.S.cur].ai; }, null, { timeout: 30000 }).catch(() => {});
  await idle();
  ok('the AI played its turn', await S(() => !window.__ED.S.players[window.__ED.S.cur].ai));
  ok('its turn is in the history', await S(() => { const E = window.__ED, t = document.querySelector('#histList .ht'); return !document.querySelector('#hist').hidden && !!t && E.S.players[E.S.hist[E.S.hist.length - 1].p].ai && document.querySelectorAll('#histList .ht:first-child .fg').length > 0; }));
  ok('my turn is in the history too', await S(() => document.querySelectorAll('#histList .ht').length >= 2));
  // 9. the history panel: one turn tall, hide and show, move it, make it taller (older turns come into view), put it back; then the menu
  const hbox = sel => S(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
  ok('history: one turn tall', await S(() => Math.abs(document.querySelector('#histList').offsetHeight - document.querySelector('#histList .ht').offsetHeight) <= 1));
  await p.click('#histX'); await wait(200); ok('history hides', await S(() => document.querySelector('#hist').hidden && !document.querySelector('#histBtn').classList.contains('on')));
  await p.click('#histBtn'); await wait(300); ok('history comes back', await S(() => !document.querySelector('#hist').hidden));
  const h0 = await hbox('#hist'), hd = await hbox('.hgrip');
  await p.mouse.move(hd.x + hd.w / 2, hd.y + hd.h / 2); await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(hd.x + hd.w / 2 - 30 * i, hd.y + hd.h / 2 + 30 * i); await wait(16); } await p.mouse.up(); await wait(300);
  const h1 = await hbox('#hist'); ok('history: drag moves it', Math.abs(h1.x - (h0.x - 300)) < 3 && Math.abs(h1.y - (h0.y + 300)) < 3, JSON.stringify([h0, h1]));
  const g = await hbox('#histSize'); await p.mouse.move(g.x + 11, g.y + 11); await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(g.x + 11 + 5 * i, g.y + 11 - 20 * i); await wait(16); }
  for (let i = 1; i <= 10; i++) { await p.mouse.move(g.x + 61, g.y - 189 + 30 * i); await wait(16); } await p.mouse.up(); await wait(300);
  ok('history: resizing makes it taller and wider', await S(() => { const l = document.querySelector('#histList'); return l.offsetHeight > l.firstElementChild.offsetHeight + 60; }) && (await hbox('#hist')).w > h1.w + 40);
  ok('history: kept on this device', await S(() => { const v = JSON.parse(localStorage.getItem('eldorado-hist')); return v.fx != null && v.w > 0 && v.h > 0; }));
  // at the left edge of a large screen it becomes a full-height column of its own (the game area moves over); dragged out, it floats
  let gr = await hbox('.hgrip'); await p.mouse.move(gr.x + 4, gr.y + 6); await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(gr.x + 4 - (gr.x - 20) * i / 10, gr.y + 6); await wait(16); }
  ok('history: the left column shows where it will go', await S(() => !document.querySelector('#histGuide').hidden)); await p.mouse.up(); await wait(500);
  ok('history: docked left, full height', await S(() => { const h = document.querySelector('#hist').getBoundingClientRect(), a = document.querySelector('#app').getBoundingClientRect(); return document.querySelector('#hist').parentNode.id === 'lside' && h.left === 0 && h.height === innerHeight && a.left >= h.right; }));
  gr = await hbox('.hgrip'); await p.mouse.move(gr.x + 4, gr.y + 6); await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(gr.x + 4 + 50 * i, gr.y + 6); await wait(16); } await p.mouse.up(); await wait(500);
  ok('history: dragged out of the column, it floats', await S(() => document.querySelector('#hist').parentNode.id === 'app' && document.querySelector('#lside').hidden && document.querySelector('#hist').classList.contains('free')));
  await p.click('#histHome'); await wait(300);
  const h2 = await hbox('#hist'); ok('history: back under the prompt', Math.abs(h2.x - h0.x) < 2 && Math.abs(h2.y - h0.y) < 2 && Math.abs(h2.h - h0.h) < 2, JSON.stringify([h0, h2]));
  await p.click('#menuBtn'); await wait(300); ok('menu opens over the game', await S(() => document.querySelector('#menu').open && !document.querySelector('#ingame').hidden));
  await p.click('#sBack'); await wait(400); ok('back to the game', await S(() => !document.querySelector('#menu').open));
  // 10. replay: step forward (a move animates), then exit back to the game
  await p.evaluate(l => window.__ED.openReplay(l, null), log); await wait(1200);
  ok('replay open', await S(() => !!window.__ED.G.replay && !document.querySelector('#rdock').hidden));
  for (let k = 0; k < 6; k++) { await p.keyboard.press('ArrowRight'); await wait(250); }
  await idle(); ok('replay steps', await S(() => window.__ED.G.replay.i === 6));
  ok('replay: its history', await S(() => { const E = window.__ED; return !document.querySelector('#hist').hidden && document.querySelectorAll('#histList .ht').length === E.S.hist.length && E.S.hist.length > 0; }));
  await p.waitForFunction(() => document.querySelector('#rside .rplan li') || /No plan/.test(document.querySelector('#rside').textContent), null, { timeout: 15000 }).catch(() => {});
  ok('replay: the strongest AI\'s turn from here', await S(() => !!document.querySelector('#rside .rplan li') && /Fawcett/.test(document.querySelector('#rside').textContent)));
  await p.click('#menuBtn'); await wait(800);
  ok('replay exit resumes the game', await S(() => !window.__ED.G.replay && !!window.__ED.S && !window.__ED.S.over && document.querySelectorAll('#cards .card').length > 0));
  // 11. a removal still to choose (Travel Log): the market stays closed until it's answered (a tap there says why, it
  //     doesn't open a purchase), Escape keeps the question up, and once answered buying works again
  //     (a Travel Log put in the hand for the test: the saved game can't be replayed after this, so it comes last)
  await S(() => { const E = window.__ED, S = E.S; S.cards.c900 = 'travellog'; S.players[S.cur].hand.push('c900'); E.render(); }); await wait(500);
  c = await cardPos(await S(() => window.__ED.S.players[window.__ED.S.cur].hand.indexOf('c900'))); await p.mouse.click(c.x, c.y); await wait(600);
  ok('Travel Log: which cards to remove?', await S(() => window.__ED.UI.mode === 'trashPick' && !!document.querySelector('#bOk')));
  ok('the market offers nothing meanwhile', await S(() => !document.querySelector('#market .mslot.can') && !!document.querySelector('#market .mslot.no')));
  await p.click('#market .mslot[data-src]'); await wait(300);
  ok('a market tap says why and opens no purchase', await S(() => window.__ED.UI.mode === 'trashPick' && document.querySelector('#buySlot').hidden && /remove/.test(document.querySelector('#toast').textContent)));
  await p.keyboard.press('Escape'); await wait(200);
  ok('Escape keeps the question', await S(() => window.__ED.UI.mode === 'trashPick' && !!document.querySelector('#bOk')));
  await p.click('#bOk'); await wait(500);
  ok('answered: the market opens again', await S(() => window.__ED.UI.mode === 'idle' && !window.__ED.S.turn.pending && !document.querySelector('#market .mslot.no')));
  ok('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
  await b.close(); srv.close();
  console.log(fails ? `flows: ${fails} failing` : 'flows ok'); process.exit(fails ? 1 : 0);
})();

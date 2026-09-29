// Plays the game the way a person does (mouse clicks and drags on the real page) and checks each step:
// start, select a card, move by clicking a space and by dragging a card onto it, undo, buy (market card, then paying
// cards), end a turn, an AI's turn (with its recap under the prompt), the journal, the menu, a replay (step, Fawcett's
// plan, exit), and the market closed while a Travel Log's removal is still to choose.
// Also checks that pressing Start changes nothing on the board, and that no step logs an error.
// Every check waits for what it expects (up to a few seconds), so a slow or busy machine doesn't fail it.
//   NODE_PATH=$(npm root -g) node test/flows.cjs
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const fs = require('fs'), path = require('path');
const log = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/replay.json'), 'utf8'));
const T = report('flows');
(async () => {
  const srv = await serveStatic(), b = await chromium.launch(), p = await openPage(b, 'flows', { viewport: { width: 1366, height: 820 } });
  const S = (f, a) => p.evaluate(f, a);
  const until = (f, a, ms = 15000) => p.waitForFunction(f, a, { timeout: ms }).then(() => true, () => false);
  const check = async (name, f, a, ms) => T.ok(name, await until(f, a, ms));
  const idle = async () => { await until(() => !window.__ED.UI.anim, null, 10000); await settle(p); };
  const center = async sel => { const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (!r) throw new Error('not found: ' + sel); return r; };
  await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
  // seat 2 is an AI (Fawcett: the network, fetched from /ai/first.bin when it first moves) for the AI-turn step
  await p.selectOption('select[name=who1]', 'fawcett'); await settle(p);
  // 1. Start: the start screen's background is the game itself, so nothing on the board changes
  await S(() => { window.__mut = 0; new MutationObserver(l => { window.__mut += l.length; }).observe(document.querySelector('#stage'), { subtree: true, childList: true, attributes: true, characterData: true }); });
  await p.click('#sGo');
  await check('game on show', () => { const E = window.__ED; return !!E.S && !E.UI.preview && !document.querySelector('#menu').open && document.querySelectorAll('#cards .card').length === 4 && document.querySelectorAll('#pieces .piece').length === E.S.players.length; });
  await settle(p);
  T.ok('Start: no change on the board', await S(() => window.__mut) === 0, (await S(() => window.__mut)) + ' mutations');
  // 2. select a card with a click: it lifts, its targets appear
  // (a deal can start a player with no card that moves an explorer: then pass until someone has one; the AI seat plays its own turn)
  const findMove = () => S(() => { const E = window.__ED, S = E.S, P = S.players[S.cur];
    for (const id of P.hand) { E.onHandCard(id); E.render(); const ks = [...E.UI.targets].filter(([k, t]) => k[0] !== 'B' && t.kind === 'move').map(([k]) => k); E.cancelMode(); E.render(); if (ks.length) return { id, ks }; } return null; });
  let pick = await findMove();
  for (let k = 0; k < 6 && !pick; k++) { await S(() => { window.__ED.act({ t: 'end', keep: [] }); }); await until(() => { const E = window.__ED; return !E.S.players[E.S.cur].ai; }, null, 30000); await idle(); pick = await findMove(); }
  T.ok('a playable card', !!pick);
  // (hand.js keeps no id on the element: find the card by its position in the hand)
  const handIdx = await S(id => window.__ED.S.players[window.__ED.S.cur].hand.indexOf(id), pick.id);
  const cardPos = async i => { await settle(p); return p.evaluate(i => { const els = [...document.querySelectorAll('#cards .card:not(.inplay)')];
    // the hand's cards sit left to right in hand order
    const byX = els.map(e => ({ e, r: e.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left); if (!byX[i]) throw new Error('card ' + i + ' of ' + els.length + ': ' + els.map(e => e.className).join()); const r = byX[i].r; return { x: r.left + r.width * .5, y: r.top + r.height * .25 }; }, i); };
  let c = await cardPos(handIdx); await p.mouse.click(c.x, c.y);
  await check('click selects the card', id => window.__ED.UI.mode === 'card' && window.__ED.UI.card === id && document.querySelectorAll('#cards .card.sel').length === 1, pick.id);
  await check('targets on the board', k => !!document.querySelector(`#board2 .tgt[data-t="${k}"] polygon`), pick.ks[0]);
  // 3. click a target space: the explorer walks there
  const before = await S(() => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces));
  await settle(p); const tgt = await center(`#board2 .tgt[data-t="${pick.ks[0]}"] polygon`);
  await p.mouse.move(tgt.x, tgt.y); await p.mouse.click(tgt.x, tgt.y);
  await check('the explorer animates', () => window.__ED.UI.anim, null, 3000);
  await idle();
  await check('click on a space moves', b => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces) !== b, before);
  await check('played card in the play area', () => document.querySelectorAll('#cards .card.inplay').length === 1);
  // 4. undo brings it back
  await p.click('#bUndo');
  await check('undo', b => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces) === b && !document.querySelector('#cards .card.inplay'), before);
  // 5. drag a card onto a space
  c = await cardPos(handIdx);
  await p.mouse.move(c.x, c.y); await p.mouse.down(); for (let i = 1; i <= 12; i++) { await p.mouse.move(c.x + (tgt.x - c.x) * i / 12, c.y + (tgt.y - c.y) * i / 12); await p.waitForTimeout(16); }
  await check('dragging aims the arrow', () => getComputedStyle(document.querySelector('#arrow g')).display !== 'none');
  await p.mouse.up(); await idle();
  await check('drag onto a space moves', b => JSON.stringify(window.__ED.S.players[window.__ED.S.cur].pieces) !== b, before);
  // 6. buy: tap an affordable market card, then tap cards to pay
  if (await S(() => !!document.querySelector('#market .mslot.can'))) {
    const disc0 = await S(() => window.__ED.S.players[window.__ED.S.cur].discard.length);
    await p.click('#market .mslot.can');
    await check('buying: the card waits above the hand', () => window.__ED.UI.mode === 'pay' && !document.querySelector('#buySlot').hidden);
    for (let k = 0; k < 4 && await S(() => window.__ED.UI.mode === 'pay'); k++) {
      await settle(p); const n = await S(() => document.querySelectorAll('#cards .card:not(.inplay):not(.pick)').length); if (!n) break;
      const q = await S(() => { const e = document.querySelector('#cards .card:not(.inplay):not(.pick)'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * .3 }; });
      const picks = await S(() => window.__ED.UI.picks.length); await p.mouse.click(q.x, q.y);
      await until(k => window.__ED.UI.mode !== 'pay' || window.__ED.UI.picks.length > k, picks, 3000);
    }
    await check('bought: the card is in the discard pile', d => window.__ED.S.turn.bought && window.__ED.S.players[window.__ED.S.cur].discard.length === d + 1, disc0);
  } else console.log('     (skip buy: nothing affordable)');
  // 7. end the turn (the buy nudge and the keep-cards step, if they come)
  const me = await S(() => window.__ED.S.cur);
  for (let k = 0; k < 4 && await S(m => window.__ED.S.cur === m, me); k++) { await idle(); const id = await S(() => ['bEndA', 'bEnd2', 'bEnd'].find(i => document.getElementById(i))); if (!id) break; await p.click('#' + id); await until((m, id) => window.__ED.S.cur !== m || !document.getElementById(id), [me, id], 3000).catch(() => {}); }
  await check('turn ended', m => window.__ED.S.cur !== m, me);
  // 8. the AI plays its turn; its steps show in a row under the prompt
  await check('the AI played its turn', () => !window.__ED.S.players[window.__ED.S.cur].ai, null, 30000);
  // (if the turns went round, the turn that just ended can be the other human's: pass until the AI has just played)
  const aiJustPlayed = () => S(() => { const E = window.__ED, n = E.S.players.length; return !!E.S.players[(E.S.cur + n - 1) % n].ai; });
  for (let k = 0; k < 3 && !await aiJustPlayed(); k++) { await idle(); await S(() => { window.__ED.act({ t: 'end', keep: [] }); }); await until(() => { const E = window.__ED; return !E.S.players[E.S.cur].ai; }, null, 30000); }
  await idle();
  await check('its recap is shown', () => !document.querySelector('#feed').hidden && document.querySelectorAll('#feed .fg').length > 0);
  // 9. journal, menu
  await p.click('#jrnBtn'); await check('journal opens', () => document.querySelectorAll('#overlay .modal.jrn #log .le').length > 3);
  await p.click('#jClose'); await until(() => !document.querySelector('#overlay .modal.jrn'));
  await p.click('#menuBtn'); await check('menu opens over the game', () => document.querySelector('#menu').open && !document.querySelector('#ingame').hidden);
  await p.click('#sBack'); await check('back to the game', () => !document.querySelector('#menu').open);
  // 10. replay: step forward (a move animates), then exit back to the game
  await S(l => window.__ED.openReplay(l, null), log);
  await check('replay open', () => !!window.__ED.G.replay && !document.querySelector('#rdock').hidden);
  for (let k = 1; k <= 6; k++) { await p.keyboard.press('ArrowRight'); await until(k => window.__ED.G.replay.i === k, k, 3000); }
  await idle(); await check('replay steps', () => window.__ED.G.replay.i === 6);
  await check('replay: the strongest AI\'s turn from here', () => !!document.querySelector('#rside .rplan li') && /Fawcett/.test(document.querySelector('#rside').textContent), null, 15000);
  await p.click('#menuBtn');
  await check('replay exit resumes the game', () => !window.__ED.G.replay && !!window.__ED.S && !window.__ED.S.over && document.querySelectorAll('#cards .card').length > 0);
  // 11. a removal still to choose (Travel Log): the market stays closed until it's answered (a tap there says why, it
  //     doesn't open a purchase), Escape keeps the question up, and once answered buying works again
  //     (a Travel Log put in the hand for the test: the saved game can't be replayed after this, so it comes last)
  await idle(); await S(() => { const E = window.__ED, S = E.S; S.cards.c900 = 'travellog'; S.players[S.cur].hand.push('c900'); E.render(); });
  c = await cardPos(await S(() => window.__ED.S.players[window.__ED.S.cur].hand.indexOf('c900'))); await p.mouse.click(c.x, c.y);
  await check('Travel Log: which cards to remove?', () => window.__ED.UI.mode === 'trashPick' && !!document.querySelector('#bOk'));
  await check('the market offers nothing meanwhile', () => !document.querySelector('#market .mslot.can') && !!document.querySelector('#market .mslot.no'));
  await p.click('#market .mslot[data-src]');
  await check('a market tap says why and opens no purchase', () => window.__ED.UI.mode === 'trashPick' && document.querySelector('#buySlot').hidden && /remove/.test(document.querySelector('#toast').textContent));
  await p.keyboard.press('Escape'); await settle(p);
  await check('Escape keeps the question', () => window.__ED.UI.mode === 'trashPick' && !!document.querySelector('#bOk'));
  await p.click('#bOk');
  await check('answered: the market opens again', () => window.__ED.UI.mode === 'idle' && !window.__ED.S.turn.pending && !document.querySelector('#market .mslot.no'));
  T.ok('no page errors', !p.errors.length, p.errors.slice(0, 5).join(' | '));
  await b.close(); srv.close(); T.done();
})().catch(e => { console.error(e); process.exit(1); });

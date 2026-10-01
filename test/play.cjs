// Played games: whole games through the real page, the person's seat played by an AI that chooses each move and then
// makes it the way a person does (the same calls a tap or a drag makes: pick the card, the explorer, the space; pick a
// market stack, then the cards that pay; End turn, then the reminder, then the cards to keep). The point is coverage:
// every state a game passes through is drawn, with every assertion on (layout shifts, rebuilds, the view's checks),
// including states no scripted test reaches (moving on with a card's leftover strength, the buy reminder, keeping
// cards, removal cards, the Transmitter, base camps, game over). Animations run 20x faster (they still run).
//   NODE_PATH=$(npm root -g) node test/play.cjs [--games n]
const { chromium, serveStatic, openPage, settle, report } = require('./lib.cjs');
const T = report('play');
const arg = process.argv.slice(2), GAMES = +(arg[arg.indexOf('--games') + 1] || 0) || 3;
// the sizes the games are played at: the owner's screen, a phone, a tablet
const SIZES = [['owner', { width: 1536, height: 639 }, 1.25], ['phone', { width: 390, height: 844 }, 2], ['tablet', { width: 768, height: 1024 }, 1]];

/* one decision for the person's seat, made in the page through the UI's own calls; returns what it did (or why it couldn't) */
function step() {
  const E = window.__ED, S = E.S, UI = E.UI, me = S.cur, mem = window.__mem || (window.__mem = {});
  const a = E.aiChoose(S, 'raleigh', mem, Math.random);
  // every state the page passes through is noted (each call leaves the page drawn, as a frame after a tap would)
  const seen = window.__seen || (window.__seen = { modes: {}, labels: {} });
  const call = (f, ...x) => { E[f](...x); seen.modes[UI.mode] = 1; for (const e of document.querySelectorAll('#actBtns .bslot:not(.off)')) seen.labels[e.textContent] = 1; };
  const stackOf = t => { let i = S.market.findIndex(s => s.t === t && s.n > 0); if (i >= 0) return ['m', i]; i = S.reserve.findIndex(s => s.t === t && s.n > 0); return i >= 0 ? ['r', i] : null; };
  const piece = pi => { if (UI.piece !== pi) call('onPiece', me, pi); };
  const pick = id => { if (UI.mode === 'card' && UI.card !== id) call('cancelMode'); if (!(UI.mode === 'card' && UI.card === id)) { if (S.turn.active && S.turn.active.id === id) call('onPlayCard', id); else call('onHandCard', id); } };
  switch (a.t) {
    case 'move': case 'native': {
      if (UI.mode === 'card' && UI.card !== a.card) call('cancelMode');
      piece(a.pi); pick(a.card);
      if (!UI.targets.has(a.to)) return 'unmapped ' + a.t + ': ' + a.to + ' is not a target';
      call('doMove', a.to); return a.t + (S.turn.active ? ' (strength left)' : ''); }
    case 'pay': {
      if (UI.mode !== 'idle') call('cancelMode');
      piece(a.pi); pick(a.cards[0]);
      const tg = UI.targets.get(a.to); if (!tg || tg.t !== 'pay') return 'unmapped pay: ' + a.to + ' is not a space paid for with cards';
      call('startDiscard', a.to, a.cards[0]); for (const id of a.cards.slice(1)) if (UI.mode === 'discardFor') call('addDiscard', id);
      return 'pay ' + tg.kind; }
    case 'action': { if (UI.mode !== 'idle') call('cancelMode'); call('onHandCard', a.card); return 'action'; }
    case 'trash': { if (UI.mode !== 'trashPick') return 'unmapped trash: the removal choice is not showing'; for (const id of a.cards) call('onHandCard', id); call('confirmTrash'); return 'trash ' + a.cards.length; }
    case 'transmit': { if (UI.mode !== 'idle') call('cancelMode'); call('onHandCard', a.card); const st = stackOf(a.type); if (UI.mode !== 'transmit' || !st) return 'unmapped transmit';
      call('pickFromMarket', st[0], st[1]); return 'transmit'; }
    case 'buy': { if (UI.mode !== 'idle') call('cancelMode'); const st = stackOf(a.type); if (!st) return 'unmapped buy: no stack of ' + a.type;
      call('pickFromMarket', st[0], st[1]); if (UI.mode !== 'pay') return 'unmapped buy: ' + a.type + ' not offered';
      for (const id of a.cards) if (UI.mode === 'pay') call('onHandCard', id); return 'buy'; } // (paid in full, it's bought after a short pause)
    case 'end': { if (UI.mode !== 'idle') call('cancelMode'); call('startEndTurn'); let warned = false;
      if (UI.mode === 'buyWarn') { warned = true; call('startEndTurn'); }
      if (UI.mode === 'endTurn') { for (const id of a.keep) call('onHandCard', id); call('finishTurn'); }
      return 'end' + (warned ? ' (after the buy reminder)' : '') + (a.keep.length ? ' keeping ' + a.keep.length : ''); }
  }
  return 'unmapped ' + a.t;
}

(async () => {
  const srv = await serveStatic(), b = await chromium.launch(), t0 = Date.now();
  const games = Array.from({ length: GAMES }, (_, g) => SIZES[g % SIZES.length]);
  const results = await Promise.all(games.map(async ([name, viewport, dpr], g) => {
    const p = await openPage(b, `game ${g + 1} (${name})`, { viewport, deviceScaleFactor: dpr });
    const cdp = await p.context().newCDPSession(p); await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: 20 });
    await p.goto(srv.url); await p.waitForFunction(() => window.__ED && document.querySelector('#menu').open);
    await p.selectOption('select[name=who1]', 'raleigh'); await p.selectOption('select[name=who2]', 'raleigh');
    await p.click('#sGo'); await p.waitForFunction(() => window.__ED.S && !window.__ED.UI.preview && !document.querySelector('#menu').open);
    await p.evaluate(() => window.__ED.aiPace(.05)); // (the AIs' pauses, 20x shorter: their moves and animations unchanged)
    const did = {}, unmapped = []; let steps = 0;
    const ready = () => p.waitForFunction(() => { const E = window.__ED; return E.S.over || (E.canAct() && !E.UI.anim && E.UI.mode !== 'pay' && E.UI.mode !== 'discardFor'); }, null, { timeout: 60000 });
    try {
      for (; steps < 1500; steps++) {
        await ready(); await settle(p);
        await p.evaluate(() => window.__ED.fitCheck(true)); // (the board check at every settled step, not only when its samples happen to see one)
        if (await p.evaluate(() => window.__ED.S.over)) break;
        const r = await p.evaluate(step); const k = r.split(':')[0]; did[k] = (did[k] || 0) + 1; if (r.startsWith('unmapped')) { unmapped.push(r); break; }
      }
    } catch (e) { unmapped.push('stopped: ' + e.message.split('\n')[0]); }
    const over = await p.evaluate(() => !!window.__ED.S.over), round = await p.evaluate(() => window.__ED.S.round);
    const seen = await p.evaluate(() => window.__seen ? { modes: Object.keys(window.__seen.modes), labels: Object.keys(window.__seen.labels) } : { modes: [], labels: [] });
    await p.close();
    return { name, g, over, round, steps, did, modes: seen.modes, labels: seen.labels, unmapped, errors: p.errors };
  }));
  for (const r of results) {
    T.ok(`game ${r.g + 1} (${r.name}): played to the end through the UI`, r.over && !r.unmapped.length, `${r.steps} moves of the person's, round ${r.round}${r.unmapped.length ? '; ' + r.unmapped.join('; ') : ''}`);
    T.ok(`game ${r.g + 1} (${r.name}): no assertion failed, no page error`, !r.errors.length, r.errors.slice(0, 3).join(' | '));
    console.log(`     did: ${JSON.stringify(r.did)}\n     modes: ${r.modes.join(', ')}\n     buttons: ${r.labels.join(', ')}`);
  }
  console.log(`     ${GAMES} games in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  await b.close(); srv.close && srv.close(); T.done();
})();

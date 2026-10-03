// One decision for the person's seat in a game on show, made the way a person makes it: an AI (raleigh, in the AI's worker)
// chooses the move, and the page's own UI calls carry it out (the same calls a tap or a drag makes). Shared by the played
// games (test/play.cjs, local) and the online game in test/online.cjs. Runs in the page: p.evaluate(step).
/* one decision for the person's seat, made in the page through the UI's own calls; returns what it did (or why it couldn't) */
async function step() {
  const E = window.__ED, S = E.S, UI = E.UI, me = S.cur;
  // (the turn can pass between the wait for it and this step: online the server's answer arrives at any time)
  if (!E.canAct() || S.over) return 'not my turn';
  // pass-and-play: the hand is covered until the player to move takes the device (the Reveal button)
  { const b = document.getElementById('bRev'); if (b) { b.click(); return 'reveal'; } }
  // (online the page holds the state as its seat sees it: other players' cards are unnamed, so the AI chooses on a copy
  // without them, as the server's AIs never see a person's hand either)
  const view = E.online() ? { ...S, players: S.players.map((q, i) => i === me ? q : { ...q, hand: [], deck: [] }) } : S;
  // (in the AI's worker, as the AIs think: the person's turn waits on nothing else meanwhile; window.__seed: a test's seed, so
  // the same position always gets the same choice and the game is the same every run)
  const a = await E.aiThink(view, 'raleigh', me, window.__seed == null ? undefined : window.__seed + S.log.length);
  if (E.S !== S || !E.canAct()) return 'not my turn'; // (the game moved on while it thought)
  // every state the page passes through is noted (each call leaves the page drawn, as a frame after a tap would)
  const seen = window.__seen || (window.__seen = { modes: {}, labels: {} });
  // (each call is a tap of the person's: the page sees it as an input, as it would a real one; a key no handler uses)
  const call = (f, ...x) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified' })); E[f](...x); seen.modes[UI.mode] = 1; for (const e of document.querySelectorAll('#actBtns .bslot:not(.off)')) seen.labels[e.textContent] = 1; };
  const stackOf = t => { let i = S.market.findIndex(s => s.t === t && s.n > 0); if (i >= 0) return ['m', i]; i = S.reserve.findIndex(s => s.t === t && s.n > 0); return i >= 0 ? ['r', i] : null; };
  const piece = pi => { if (UI.piece !== pi) call('onPiece', me, pi); };
  const pick = id => { if (UI.mode === 'card' && UI.card !== id) call('cancelMode'); if (!(UI.mode === 'card' && UI.card === id)) { if (S.turn.active && S.turn.active.id === id) call('onPlayCard', id); else call('onHandCard', id); } };
  // a card the test wants played (window.__prefer: types), bought whenever the coins in hand allow it (instead of the AI's
  // purchase, or before it ends its turn), paid with the hand's cards in order until they cover it: a game then reaches
  // what that card does every time, not only when the deal and the AI happen to lead there
  // (they are reserve cards, which can be bought once a market stack has sold out: until then, the market stack closest to
  // selling out is bought, as a player opening the reserve would)
  const wanted = () => { const pref = window.__prefer || []; if (!pref.length) return null; const opts = E.buyOptions(S, me);
    return pref.map(t => opts.find(o => o.t === t)).find(Boolean) || (!S.market.some(st => st.n === 0) && opts.filter(o => o.src === 'm').sort((x, y) => S.market[x.i].n - S.market[y.i].n)[0]) || null; };
  const buyWanted = () => { const w = wanted(); call('pickFromMarket', w.src, w.i); let paid = 0;
    for (const id of S.players[me].hand.slice()) { if (paid >= E.CT[w.t].cost || UI.mode !== 'pay') break; call('onHandCard', id); paid += E.coinVal(S, id); }
    return 'buy ' + w.t; };
  // and played as soon as it is in hand (nothing else under way: no card being played, no removal asked)
  const inHand = !S.turn.active && !S.turn.pending && S.players[me].hand.find(id => (window.__prefer || []).includes(S.cards[id]));
  if (inHand) { if (UI.mode !== 'idle') call('cancelMode'); call('onHandCard', inHand); return 'action (' + S.cards[inHand] + ')'; }
  switch (a.t) {
    case 'move': case 'native': {
      if (UI.mode === 'card' && UI.card !== a.card) call('cancelMode');
      piece(a.pi); pick(a.card);
      if (!E.targets().has(a.to)) return 'unmapped ' + a.t + ': ' + a.to + ' is not a target (' + JSON.stringify({ mode: UI.mode, card: UI.card, piece: UI.piece, pi: a.pi, targets: [...E.targets().keys()], busy: E.NET.busy, active: S.turn.active, pending: S.turn.pending, at: S.players[me].pieces }) + ')';
      call('doMove', a.to); return a.t + (S.turn.active ? ' (strength left)' : ''); }
    case 'pay': {
      if (UI.mode !== 'idle') call('cancelMode');
      piece(a.pi); pick(a.cards[0]);
      const tg = E.targets().get(a.to); if (!tg || tg.t !== 'pay') return 'unmapped pay: ' + a.to + ' is not a space paid for with cards';
      // the first card dragged onto the space; the rest dragged after it, or (every other time) tapped in the hand
      const tap = (window.__payN = (window.__payN || 0) + 1) % 2 === 0;
      call('startDiscard', a.to, a.cards[0]); for (const id of a.cards.slice(1)) if (UI.mode === 'discardFor') call(tap ? 'onHandCard' : 'addDiscard', id);
      return 'pay ' + tg.kind + (tap ? ' (tapped)' : ''); }
    case 'action': { if (UI.mode !== 'idle') call('cancelMode'); call('onHandCard', a.card); return 'action'; }
    case 'trash': { if (UI.mode !== 'trashPick') return 'unmapped trash: the removal choice is not showing'; for (const id of a.cards) call('onHandCard', id); call('confirmTrash'); return 'trash ' + a.cards.length; }
    case 'transmit': { if (UI.mode !== 'idle') call('cancelMode'); call('onHandCard', a.card); const st = stackOf(a.type); if (UI.mode !== 'transmit' || !st) return 'unmapped transmit';
      call('pickFromMarket', st[0], st[1]); return 'transmit'; }
    case 'buy': { if (UI.mode !== 'idle') call('cancelMode');
      if (wanted()) return buyWanted();
      const st = stackOf(a.type); if (!st) return 'unmapped buy: no stack of ' + a.type;
      call('pickFromMarket', st[0], st[1]); if (UI.mode !== 'pay') return 'unmapped buy: ' + a.type + ' not offered';
      for (const id of a.cards) if (UI.mode === 'pay') call('onHandCard', id); return 'buy'; } // (paid in full, it's bought after a short pause)
    case 'end': { if (UI.mode !== 'idle') call('cancelMode');
      if (!S.turn.bought && wanted()) return buyWanted(); // (the turn's purchase not made yet: the card wanted first)
      // first, as a person might: a tap on a market card the rules allow but the coins in hand don't cover (it must say so,
      // not open a purchase that can only be cancelled)
      const poor = [...document.querySelectorAll('#market .mslot:not(.no):not(.can):not(.empty)')][0];
      if (poor) { call('pickFromMarket', 'm', +poor.dataset.i); E.render(); seen.modes['tapped a card out of reach'] = 1; if (UI.mode !== 'idle') call('cancelMode'); }
      call('startEndTurn'); let warned = false;
      if (UI.mode === 'buyWarn') { warned = true; call('startEndTurn'); }
      if (UI.mode === 'endTurn') { for (const id of a.keep) call('onHandCard', id); call('finishTurn'); }
      return 'end' + (warned ? ' (after the buy reminder)' : '') + (a.keep.length ? ' keeping ' + a.keep.length : ''); }
  }
  return 'unmapped ' + a.t;
}
module.exports = { step };

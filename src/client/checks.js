/* The page's invariants: what must hold on screen after every update, checked once per frame after every view part has
   written (frame.js runs this part last). Each check is a property the owner cares about; a failure is a bug, reported
   through the boundary (docs/ASSERTIONS.md). Cheap by rule: no layout reads, no allocation, a handful of comparisons. */
import { assert, buyOptions } from '../engine.gen.js';
import { $ } from './dom.js';
import { S, UI, G, cur, canAct, online, viewIdx, isAI, covered } from './state.js';
import { allShown } from './market.js';

function check() {
  // an overlay exists only in the turn and mode that opened it
  assert($('#allc').hidden !== allShown(), 'view: the All cards spread shows exactly while its turn and mode last');
  if (!S || G.replay) return;
  const P = cur();
  if (UI.mode === 'card') assert(P.hand.includes(UI.card) || (!!S.turn.active && S.turn.active.id === UI.card), 'view: a chosen card is in hand or being played');
  if (canAct()) assert((UI.mode === 'trashPick') === !!S.turn.pending, 'view: the removal choice shows exactly when the game asks for one');
  if (UI.mode === 'pay') assert(!!UI.buy, 'view: paying is always for a chosen purchase');
  // a local game's record says whether hands are hidden (no default: a record that didn't say once resumed with them shown)
  if (G.rec && !online()) assert(typeof G.rec.privacy === 'boolean', "view: a local game's record says whether hands are hidden");
  // a space paid for with cards (rubble, a base camp, a rubble blockade) is taken as soon as enough cards are in, however they came in
  if (UI.mode === 'discardFor') assert(UI.picks.length < UI.pending.need, 'view: a space paid for with cards is taken once enough cards are in (' + UI.picks.length + ' of ' + UI.pending.need + ')');
  // a purchase is open only for a card the player can pay for now (the engine's buy options: the rules and the coins in hand)
  if (UI.mode === 'pay' && UI.buy) assert(buyOptions(S, S.cur).some(o => o.src === UI.buy.src && o.i === UI.buy.idx), 'view: a purchase opens only for a card the player can pay for (' + UI.buy.t + ')');
  // pass-and-play (a local game, hands hidden, two or more people at the table): a hand shows only to its owner, on their turn
  if (!online() && G.rec && G.rec.privacy && !S.over && !covered() && S.players.filter(p => !p.ai).length > 1)
    assert(viewIdx() === S.cur && !isAI(S.cur), "view: in pass-and-play a hand shows only to its owner, on their own turn (" + S.players[viewIdx()].name + "'s shown during " + P.name + "'s)");
}
export const checksPart = { name: 'checks', update: check };

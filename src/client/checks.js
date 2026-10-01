/* The page's invariants: what must hold on screen after every update, checked once per frame after every view part has
   written (frame.js runs this part last). Each check is a property the owner cares about; a failure is a bug, reported
   through the boundary (docs/ASSERTIONS.md). Cheap by rule: no layout reads, no allocation, a handful of comparisons. */
import { assert } from '../engine.gen.js';
import { $ } from './dom.js';
import { S, UI, G, cur, canAct, online } from './state.js';
import { allShown } from './market.js';

function check() {
  // an overlay exists only in the turn and mode that opened it
  assert($('#allc').hidden !== allShown(), 'view: the All cards spread shows exactly while its turn and mode last');
  if (!S || G.replay) return;
  const P = cur();
  if (UI.mode === 'card') assert(P.hand.includes(UI.card) || (!!S.turn.active && S.turn.active.id === UI.card), 'view: a chosen card is in hand or being played');
  if (canAct()) assert((UI.mode === 'trashPick') === !!S.turn.pending, 'view: the removal choice shows exactly when the game asks for one');
  if (UI.mode === 'pay') assert(!!UI.buy, 'view: paying is always for a chosen purchase');
  if (UI.cover) assert(!online(), 'view: the pass-and-play cover is only for local games');
}
export const checksPart = { name: 'checks', update: check };

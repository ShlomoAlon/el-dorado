/* Turning what the player does into engine actions. Every rules change goes through act(): locally it runs the shared
   engine (and is recorded: G.rec); online it is sent to the server, which runs the same engine and sends back the new
   state. The rest keeps the selection (UI) in step with the game: modes, targets, and what happens after a change. */
import { CT, typeOf, def, coinVal, rm, payTargets, cardTargets, cantPay, buyOptions, isActive, recApply, recUndo, recCanUndo, recState, assert } from '../engine.gen.js';
import { esc } from './dom.js';
import { S, setS, UI, NET, G, clearSelection, cur, canAct, online, isAI, viewIdx, inGame, save, keepLocalReplay, loadSave, humanRacing, passing } from './state.js';
import { showSetup, buyReminder } from './menu.js';
import { replayDecorate } from './replay.js';
import { render, resetView } from './frame.js';
import { toast, modal, closeModal, showGameOver } from './dialogs.js';
import { buildBoard } from './board/terrain.js';
import { fitSoon } from './board/camera.js';
import { animateMove } from './board/pieces.js';
import { pulseDiscard } from './board/overlays.js';
import { flyToDiscard } from './hand.js';
import { openAll, marketRectOf } from './market.js';
import { feedWatch } from './feed.js';
import { sfx, sfxEvent } from './sound.js';
import { aiKick, aiReset } from './ai.js';
import { netAct, reconnect } from './online.js';
import { diag } from './debug.js';

/* a different game is on show (a new deal, a loaded save, a replay, an online game): the old one's AI moves are off, its
   board and elements go, the new board is drawn and fitted */
export function showGame(){aiReset();buildBoard();resetView();fitSoon();}
/* continue the saved local game (first visit, or back from a replay). Returns false if there is none in progress. */
export function resumeSaved(){const g=loadSave();if(!g||g.S.over)return false;
  UI.preview=false;UI.viewer=null;G.rec=g.rec;setS(g.S);showGame();UI.mode='idle';UI.piece=firstPiece();syncMode(false);render();aiKick();return true;}
/* after a bug (boundary.js): the game on show again from its source, with nothing selected. Online: a new connection
   brings the server's state. A local game: rebuilt from its record (the action that failed was never recorded) */
export function resync(){
  clearSelection();
  if(online())reconnect();
  else if(G.rec&&!G.replay){aiReset();setS(recState(G.rec));syncMode(true);resetView();aiKick();}
  toast('Something went wrong, sorry. The game was restored.',3200);render();
}

function computeTargets(){
  const T=new Map();UI.targets=T;if(S.over||passing()||!canAct()||NET.busy||S.turn.pending)return;
  const src=UI.mode==='card'?cardTargets(S,S.cur,UI.piece,UI.card):UI.mode==='idle'?payTargets(S,S.cur,UI.piece):null;
  if(src)for(const[k,v]of src)T.set(k,v);
  else if(UI.mode==='discardFor')T.set(UI.pending.tk,UI.pending);
}
/* the card can do something now: an action card (played from the hand), or somewhere on the board to put it */
export function cardUsable(id){return(def(S,id).c==='p'&&typeOf(S,id)!=='native')||cardTargets(S,S.cur,UI.piece,id).size>0;}
export const isTargeted=id=>def(S,id).c!=='p'||typeOf(S,id)==='native';
export function firstPiece(){return Math.max(0,cur().pieces.findIndex(k=>k!=='done'));}
/* after the state changed, put the UI into the matching mode */
function syncMode(turnChanged){
  if(turnChanged||!canAct())clearSelection();
  if(S.turn.pending){UI.mode='trashPick';UI.max=S.turn.pending.max;if(turnChanged)UI.picks=[];}
  else if(UI.mode==='trashPick'){UI.mode='idle';UI.picks=[];}
  if(S.turn.active&&canAct()){UI.mode='card';UI.card=S.turn.active.id;UI.piece=S.turn.active.pi;}
  else if(UI.mode==='card'&&!cur().hand.includes(UI.card)){UI.mode='idle';UI.card=null;}
  if(turnChanged||cur().pieces[UI.piece]==='done'||UI.piece>=cur().pieces.length)UI.piece=firstPiece();
}
/* animations and messages for engine events; call BEFORE render so the market DOM is still the old one */
export function playEvents(ev,viewer){
  for(const e of ev){
    sfxEvent(e,viewer);
    const watched=feedWatch(e.pl); // another player's turn: the history row shows it as they play (feed.js)
    if(e.e==='move')animateMove(e.pl,e.pi,e.path);
    else if(e.e==='block'){if(!watched)toast(S.players[e.pl].name+' claims blockade #'+e.n);}
    else if(e.e==='arrive')toast(S.players[e.pl].name+' reaches El Dorado!',2200);
    else if(e.e==='play'&&e.got&&(viewer===undefined||viewer===e.pl))flyToDiscard(e.got,takeBuyFrom()||marketRectOf(e.got));
    else if(e.e==='timeout')toast(S.players[e.pl].name+' ran out of time');
    else if(e.e==='resign')toast(S.players[e.pl].name+' left the game');
  }
}
export function act(a){
  if(!canAct()){if(online()&&!S.over&&S.cur===NET.seat)toast('Reconnecting… your move wasn’t sent.');return;}
  diag('act '+a.t);
  if(online()){netAct({t:'act',a});render();return;}
  const r=applyLocal(S.cur,a);
  if(!r.ok){sfx('error');toast(r.err);render();}
}
/* one change to the local game (a player's action, an AI's, a resignation, the end of the game): the engine applies it and
   it is recorded (G.rec), then shown. viewer: whose view the events play for (an AI's purchase doesn't fly into the
   watching human's discard pile) */
export function applyLocal(seat,a,viewer){
  const prev=S.cur,round=S.round,r=recApply(S,G.rec,seat,a);
  if(r.ok){playEvents(r.ev,viewer);afterLocalChange(S.over||S.cur!==prev||S.round!==round);}
  return r;
}
function afterLocalChange(turnChanged){
  if(S.over)UI.lastReplay=keepLocalReplay();
  afterChange(turnChanged,S.over);save();aiKick();
}
/* after the game changed (a local change, or a new state from the server): the pick modes close (during my turn only I
   change the game), the selection follows the turn, and a new turn or the end is announced. ended: the game just ended */
export function afterChange(turnChanged,ended){
  UI.picks=[];UI.buy=null;UI.pending=null;if(['pay','discardFor','transmit','endTurn'].includes(UI.mode)){UI.mode='idle';UI.card=null;}
  syncMode(turnChanged);
  // pass-and-play: the hand is hidden between human players only (AI turns never need it)
  render();
  if(ended)setTimeout(()=>{if(S&&S.over)showGameOver();},600); // (unless another game is on show by then)
}

/* ---------- UI actions (build an action from the current selection) ---------- */
export function doMove(tk){
  if(UI.mode==='discardFor')return; // the pending space itself: cards are dragged or tapped in
  const tg=UI.targets.get(tk);if(!tg)return;
  if(isDisc(tg))startDiscard(tk,cur().hand.includes(UI.card)?UI.card:null);
  else act({t:tg.t,card:UI.card,pi:tg.pi,to:tk}); // a move, or the Native
}
export const isDisc=tg=>!!tg&&tg.t==='pay'; // paid for with cards from the hand
/* Rubble / base camp / rubble blockade: each card dragged (or tapped) onto the space counts toward its cost.
   The move happens as soon as enough cards are in. */
export function startDiscard(tk,firstId){
  const tg=UI.targets.get(tk);assert(isDisc(tg),'startDiscard: a space paid for with cards');
  UI.mode='discardFor';UI.pending={tk,...tg};UI.card=null;UI.picks=[];
  if(firstId)addDiscard(firstId);else render();
}
export function addDiscard(id){
  const P=UI.pending;if(!cur().hand.includes(id))return;sfx('discard'); // (online, the turn can end under a drag: a new hand)
  if(!UI.picks.includes(id)&&UI.picks.length<P.need)UI.picks.push(id);
  if(UI.picks.length>=P.need){confirmDiscardFor();return;}
  render();pulseDiscard();
}
export function confirmDiscardFor(){const P=UI.pending;sfx(P.kind==='camp'?'trash':'discard');act({t:'pay',pi:P.pi,to:P.tk,cards:UI.picks.slice()});}
export function playAction(id){
  const t=typeOf(S,id);
  if(t==='native'){UI.mode='card';UI.card=id;render();return;}
  if(t==='transmitter'){UI.mode='transmit';UI.card=id;render();openAll(true);return;}
  act({t:'action',card:id});
}
export function confirmTrash(){if(UI.picks.length)sfx('trash');act({t:'trash',cards:UI.picks.slice()});}
export function pickFromMarket(src,idx){
  if(!canAct()){sfx('error');toast('Wait for your turn to buy.');return;}
  const stack=src==='m'?S.market[idx]:S.reserve[idx];if(!stack||stack.n<=0)return;
  if(UI.mode==='transmit'){openAll(false);act({t:'transmit',card:UI.card,type:stack.t});return;}
  if(UI.mode==='pay'&&UI.buy.src===src&&UI.buy.idx===idx){cancelMode();return;}
  const no=cantPay(S,S.cur,stack.t);if(no){sfx('error');toast(no);return;} // (the rules and the coins in hand: a purchase opens only if it can be paid)
  UI.mode='pay';UI.buy={src,idx,t:stack.t};UI.picks=[];UI.card=null;
  render();
}
export function payTotal(){return UI.picks.reduce((a,id)=>a+coinVal(S,id),0);}
let buyFrom=null;const takeBuyFrom=()=>{const r=buyFrom;buyFrom=null;return r&&Date.now()-r.at<3000?r:null;};
export function confirmBuy(){const r=document.querySelector('#buySlot .mcard').getBoundingClientRect();buyFrom={left:r.left,top:r.top,width:r.width,height:r.height,at:Date.now()};act({t:'buy',type:UI.buy.t,cards:UI.picks.slice()});}
/* drop the selection. A removal still to choose (Scientist, Travel Log) stays asked: nothing else can happen before it */
export function cancelMode(){
  UI.card=null;UI.picks=[];UI.buy=null;UI.pending=null;UI.mode=S.turn.pending?'trashPick':'idle';render();
}
/* what the player to act could buy right now with the cards in hand ([{src, i, t}]: the engine's rule) */
export function affordable(){return passing()||!canAct()?[]:buyOptions(S,S.cur);}
export function startEndTurn(){
  if(!canAct())return; // (online, the turn can pass before the tap arrives)
  if(UI.mode!=='buyWarn'&&buyReminder()&&affordable().length){UI.mode='buyWarn';UI.card=null;UI.picks=[];UI.buy=null;render();return;} // nudge before skipping a purchase
  if(cur().hand.length){UI.mode='endTurn';UI.picks=[];UI.card=null;render();}
  else finishTurn();
}
export function finishTurn(){act({t:'end',keep:UI.mode==='endTurn'?UI.picks.slice():[]});}
export function undo(){
  if(!inGame()||!canAct()||!canUndo())return;
  if(online()){netAct({t:'undo'});return;}
  setS(recUndo(G.rec));
  clearSelection();
  syncMode(false);render();save();
}
/* (a game in progress: a local one always has its record) */
export const canUndo=()=>online()?NET.canUndo:recCanUndo(G.rec);

export function onHandCard(id){
  if(S.over||passing()||UI.anim||!canAct())return;
  switch(UI.mode){
    case 'pay':case 'endTurn':{togglePick(id);return;}
    case 'discardFor':{if(UI.picks.includes(id))rm(UI.picks,id);else if(UI.picks.length<UI.pending.need)UI.picks.push(id);render();return;}
    case 'trashPick':{if(UI.picks.includes(id))rm(UI.picks,id);else if(UI.picks.length<UI.max)UI.picks.push(id);render();return;}
    case 'transmit':{if(id===UI.card)cancelMode();return;}
  }
  if(UI.mode==='card'&&UI.card===id){cancelMode();return;}
  if(def(S,id).c==='p'&&typeOf(S,id)!=='native'){playAction(id);return;}
  UI.mode='card';UI.card=id;render();
}
export function togglePick(id){const add=!UI.picks.includes(id);if(add)UI.picks.push(id);else rm(UI.picks,id);render();if(add&&UI.mode==='pay')payProgress();}
/* after a card goes into the spending tray: finish the purchase once the coins cover it */
export function payProgress(){const c=CT[UI.buy.t].cost;if(payTotal()<c)return;
  const b=UI.buy;setTimeout(()=>{if(UI.mode==='pay'&&UI.buy===b&&payTotal()>=c)confirmBuy();},300);}
export function onPlayCard(id){
  if(S.turn.active&&S.turn.active.id===id){
    if(UI.mode==='card'&&UI.card===id){UI.mode='idle';UI.card=null;}else{UI.mode='card';UI.card=id;UI.piece=S.turn.active.pi;UI.picks=[];}
    render();
  }
}
export function onPiece(pl,i){
  if(!canAct())return;
  if(pl!==S.cur||S.over)return;
  if(cur().pieces[i]==='done')return;
  if(UI.mode==='card'&&i===UI.piece){cancelMode();return;} // the explorer the card would move: put the card down (stop moving)
  if(S.turn.active&&UI.mode==='card'&&UI.card===S.turn.active.id&&S.turn.active.pi!==i){UI.mode='idle';UI.card=null;}
  UI.piece=i;render();
}

/* resign: online the server does it; locally the player whose turn it is (or, while an AI moves, the human watching) leaves.
   Everyone else plays on; with no human left racing, the AIs finish the game quickly. */
export function resignSeat(){if(!S||S.over||G.replay)return -1;if(online()){const i=NET.seat;return i>=0&&isActive(S.players[i])?i:-1;}
  const i=isAI(S.cur)?viewIdx():S.cur;return isAI(i)||!isActive(S.players[i])?-1:i;}
export function resignLocal(){const seat=resignSeat();if(seat<0)return;
  const humans=S.players.filter((p,j)=>j!==seat&&!p.ai&&isActive(p)).length;
  modal(`<h2>Resign?</h2><p class="sub">${esc(S.players[seat].name)} leaves the expedition and finishes last among the players still racing. ${humans?'The others play on.':'The game ends here.'}</p><div class="mrow"><button class="btn" id="rsNo">Keep playing</button><button class="btn pri" id="rsYes">Resign</button></div>`,sc=>{
    sc.querySelector('#rsNo').onclick=closeModal;
    sc.querySelector('#rsYes').onclick=()=>{closeModal();if(!S||S.over||online())return;assert(applyLocal(seat,{t:'resign'}).ok,'resign is accepted');
      if(!S.over&&!humanRacing())leaveLocal();};},true);} // (no one left to play: the player leaves, not watches the AIs race)
/* leave the local game on show for the start screen (it is not kept: only finished games are) */
function leaveLocal(){aiReset();G.rec=null;save();setS(null);resetView();showSetup();}
/* End game (local play): the game ends now for everyone; places as they stand (arrivals first, then who is closest) */
export function endLocal(){if(!S||S.over||online()||G.replay)return;
  modal(`<h2>End the game?</h2><p class="sub">The race stops now for everyone. Places go by who has arrived, then who is closest to El Dorado.</p><div class="mrow"><button class="btn" id="egNo">Keep playing</button><button class="btn pri" id="egYes">End game</button></div>`,sc=>{
    sc.querySelector('#egNo').onclick=closeModal;
    sc.querySelector('#egYes').onclick=()=>{closeModal();if(!S||S.over)return;assert(applyLocal(S.cur,{t:'endgame'}).ok,'endgame is accepted');};},true);}

/* the first view part of every frame: what the selection allows now (the targets), before anything is drawn */
export const derivePart = { name: 'derive', update(){if(!S)return;if(!online()&&!G.replay&&!isAI(S.cur))UI.viewer=S.cur;computeTargets();if(G.replay)replayDecorate();}};

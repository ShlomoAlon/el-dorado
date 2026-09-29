/* Turning what the player does into engine actions. Every rules change goes through act(): locally it runs the shared
   engine (and is recorded: G.rec); online it is sent to the server, which runs the same engine and sends back the new
   state. The rest keeps the selection (UI) in step with the game: modes, targets, and what happens after a change. */
import { S, CT, typeOf, def, coinVal, rm, payTargets, cardTargets, cantBuy, buyOptions, isActive, recApply, recUndo, recCanUndo, recState, setS, setMAP } from '../engine.gen.js';
import { esc } from './dom.js';
import { UI, NET, G, cur, canAct, online, isAI, viewIdx, inGame, save, keepLocalReplay, loadSave } from './state.js';
import { replayDecorate } from './replay.js';
import { render, resetView } from './frame.js';
import { toast, banner, modal, closeModal, showGameOver } from './dialogs.js';
import { buildBoard } from './board/terrain.js';
import { fitSoon, ensureVisible } from './board/camera.js';
import { animateMove } from './board/pieces.js';
import { pulseDiscard } from './board/overlays.js';
import { flyToDiscard } from './hand.js';
import { openAll, marketRectOf } from './market.js';
import { feedWatch, feedEvent, feedClear } from './feed.js';
import { sfx, sfxEvent } from './sound.js';
import { aiKick, aiReset } from './ai.js';
import { netAct, reconnect } from './online.js';
import { diag } from './debug.js';

/* a different game is on show (a new deal, a loaded save, a replay, an online game): draw its board, drop the old one's
   elements, fit it */
export function showGame(){buildBoard();resetView();fitSoon();}
/* continue the saved local game (first visit, or back from a replay). Returns false if there is none in progress. */
export function resumeSaved(){const g=loadSave();if(!g||g.S.over)return false;
  aiReset();UI.preview=false;UI.viewer=null;G.rec=g.rec;setS(g.S);setMAP(g.MAP);showGame();UI.mode='idle';UI.piece=firstPiece();UI.cover=!!S.privacy;syncMode(false);render();aiKick();
  if(!UI.cover)banner(cur().name,'Round '+S.round);return true;}
/* after a bug (boundary.js): the game on show again from its source, with nothing selected. Online: a new connection
   brings the server's state. A local game: rebuilt from its record (the action that failed was never recorded) */
export function resync(){
  UI.mode='idle';UI.card=null;UI.picks=[];UI.buy=null;UI.pending=null;
  if(online())reconnect();
  else if(G.rec&&!G.replay){const g=recState(G.rec);aiReset();setS(g.S);setMAP(g.MAP);syncMode(true);resetView();aiKick();}
  toast('Something went wrong, sorry. The game was restored.',3200);render();
}

export function computeTargets(){
  const T=new Map();UI.targets=T;if(!S||S.over||UI.cover||!canAct()||NET.busy||S.turn.pending)return;
  const src=UI.mode==='card'?cardTargets(S.cur,UI.piece,UI.card):UI.mode==='idle'?payTargets(S.cur,UI.piece):null;
  if(src)for(const[k,v]of src)T.set(k,v);
  else if(UI.mode==='discardFor'&&UI.pending)T.set(UI.pending.tk,UI.pending);
}
/* the card can do something now: an action card (played from the hand), or somewhere on the board to put it */
export function cardUsable(id){const d=def(id);return!!d&&((d.c==='p'&&typeOf(id)!=='native')||cardTargets(S.cur,UI.piece,id).size>0);}
export const isTargeted=id=>{const d=def(id);return d&&(d.c!=='p'||typeOf(id)==='native');};
export function firstPiece(){return Math.max(0,cur().pieces.findIndex(k=>k!=='done'));}
/* after the state changed, put the UI into the matching mode */
export function syncMode(turnChanged){
  if(!S)return;
  if(turnChanged||!canAct()){UI.mode='idle';UI.card=null;UI.picks=[];UI.buy=null;UI.pending=null;}
  if(S.turn.pending){UI.mode='trashPick';UI.max=S.turn.pending.max;if(turnChanged)UI.picks=[];}
  else if(UI.mode==='trashPick'){UI.mode='idle';UI.picks=[];}
  if(S.turn.active&&canAct()){UI.mode='card';UI.card=S.turn.active.id;UI.piece=S.turn.active.pi;}
  else if(UI.mode==='card'&&(!UI.card||!cur().hand.includes(UI.card))){UI.mode='idle';UI.card=null;}
  if(turnChanged||cur().pieces[UI.piece]==='done'||UI.piece>=cur().pieces.length)UI.piece=firstPiece();
}
/* animations and messages for engine events; call BEFORE render so the market DOM is still the old one */
export function playEvents(ev,viewer){
  for(const e of ev||[]){
    sfxEvent(e,viewer);
    const watched=feedWatch(e.pl); // another player's turn: shown in the row under the prompt (ui_view.js)
    if(e.e==='play'&&!watched)feedClear(); // I (or a pass-and-play human here) act: the last recap goes
    if(watched)feedEvent(e);
    if(e.e==='move')animateMove(e.pl,e.pi,e.path);
    else if(e.e==='block'){if(!watched)toast(S.players[e.pl].name+' claims blockade #'+e.n);}
    else if(e.e==='arrive')toast(S.players[e.pl].name+' reaches El Dorado!',2200);
    else if(e.e==='gain'&&(viewer===undefined||viewer===e.pl))flyToDiscard(e.t,takeBuyFrom()||marketRectOf(e.t));
    else if(e.e==='timeout')toast(S.players[e.pl].name+' ran out of time');
    else if(e.e==='resign')toast(S.players[e.pl].name+' left the game');
  }
}
export function act(a){
  if(!S||!canAct()){if(online()&&!S.over&&S.cur===NET.seat)toast('Reconnecting… your move wasn’t sent.');return;}
  diag('act '+a.t);
  if(online()){netAct({t:'act',a});render();return;}
  const prevCur=S.cur,prevRound=S.round;
  const r=recApply(G.rec,S.cur,a);
  if(!r.ok){sfx('error');toast(r.err);render();return;}
  playEvents(r.ev);
  afterLocalChange(S.cur!==prevCur||S.round!==prevRound);
}
export function afterLocalChange(turnChanged){
  UI.picks=[];UI.buy=null;UI.pending=null;if(['pay','discardFor','transmit','endTurn'].includes(UI.mode)){UI.mode='idle';UI.card=null;}
  if(!turnChanged){syncMode(false);render();}
  else{
    syncMode(true);
    // hide the hand between human players only (pass-and-play); AI turns never need it
    if(S.privacy&&!S.over&&!isAI(S.cur)&&S.players.filter(p=>!p.ai).length>1)UI.cover=true;
    render();
    if(!UI.cover&&!S.over){banner(cur().name,isAI(S.cur)?'AI · Round '+S.round:'Round '+S.round);ensureVisible();}
  }
  if(S.over){UI.lastReplay=keepLocalReplay();setTimeout(()=>showGameOver(),600);}
  save();aiKick();
}

/* ---------- UI actions (build an action from the current selection) ---------- */
export function doMove(tk){
  if(UI.mode==='discardFor')return; // the pending space itself: cards are dragged or tapped in
  const tg=UI.targets.get(tk);if(!tg)return;
  if(isDisc(tg)){startDiscard(tk,UI.card&&cur().hand.includes(UI.card)?UI.card:null);return;}
  if(tg.kind==='native'||tg.kind==='nativebl')act({t:'native',card:UI.card,pi:tg.pi,to:tk});
  else act({t:'move',card:UI.card,pi:tg.pi,to:tk});
}
export const isDisc=tg=>!!tg&&(tg.kind==='rubble'||tg.kind==='camp'||tg.kind==='blr');
/* Rubble / base camp / rubble blockade: each card dragged (or tapped) onto the space counts toward its cost.
   The move happens as soon as enough cards are in. */
export function startDiscard(tk,firstId){
  const tg=UI.targets.get(tk);if(!isDisc(tg))return;
  UI.mode='discardFor';UI.pending={tk,...tg};UI.card=null;UI.picks=[];
  if(firstId)addDiscard(firstId);else render();
}
export function addDiscard(id){
  const P=UI.pending;if(!P||!cur().hand.includes(id))return;sfx('discard');
  if(!UI.picks.includes(id)&&UI.picks.length<P.need)UI.picks.push(id);
  if(UI.picks.length>=P.need){confirmDiscardFor();return;}
  render();pulseDiscard();
}
export function confirmDiscardFor(){const P=UI.pending;if(!P||UI.picks.length!==P.need)return;sfx(P.kind==='camp'?'trash':'discard');act({t:'pay',pi:P.pi,to:P.tk,cards:UI.picks.slice()});}
export function playAction(id){
  const t=typeOf(id);
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
  const no=cantBuy(S.cur,stack.t);if(no){sfx('error');toast(no);return;}
  UI.mode='pay';UI.buy={src,idx,t:stack.t};UI.picks=[];UI.card=null;
  render();
}
export function payTotal(){return UI.picks.reduce((a,id)=>a+coinVal(id),0);}
let buyFrom=null;const takeBuyFrom=()=>{const r=buyFrom;buyFrom=null;return r&&Date.now()-r.at<3000?r:null;};
export function confirmBuy(){const B=UI.buy;if(!B||payTotal()<CT[B.t].cost)return;{const e=document.querySelector('#buySlot .mcard');if(e){const r=e.getBoundingClientRect();buyFrom={left:r.left,top:r.top,width:r.width,height:r.height,at:Date.now()};}}act({t:'buy',type:B.t,cards:UI.picks.slice()});}
/* drop the selection. A removal still to choose (Scientist, Travel Log) stays asked: nothing else can happen before it */
export function cancelMode(){
  if(!S)return;
  UI.card=null;UI.picks=[];UI.buy=null;UI.pending=null;UI.mode=S.turn.pending?'trashPick':'idle';render();
}
/* what the player to act could buy right now with the cards in hand ([{src, i, t}]: the engine's rule) */
export function affordable(){return !S||UI.cover||!canAct()?[]:buyOptions(S.cur);}
export function startEndTurn(){
  if(!canAct()||S.turn.pending)return;
  if(UI.mode!=='buyWarn'&&affordable().length){UI.mode='buyWarn';UI.card=null;UI.picks=[];UI.buy=null;render();return;} // nudge before skipping a purchase
  if(cur().hand.length){UI.mode='endTurn';UI.picks=[];UI.card=null;render();}
  else finishTurn();
}
export function finishTurn(){act({t:'end',keep:UI.mode==='endTurn'?UI.picks.slice():[]});}
export function undo(){
  if(!inGame()||!canAct()||!canUndo())return;
  if(online()){netAct({t:'undo'});return;}
  recUndo(G.rec);
  UI.picks=[];UI.buy=null;UI.pending=null;UI.mode='idle';UI.card=null;
  syncMode(false);render();save();
}
/* (a game in progress: a local one always has its record) */
export const canUndo=()=>online()?NET.canUndo:recCanUndo(G.rec);

export function onHandCard(id){
  if(!S||S.over||UI.cover||UI.anim||!canAct())return;
  switch(UI.mode){
    case 'pay':case 'endTurn':{togglePick(id);return;}
    case 'discardFor':{if(UI.picks.includes(id))rm(UI.picks,id);else if(UI.picks.length<UI.pending.need)UI.picks.push(id);render();return;}
    case 'trashPick':{if(UI.picks.includes(id))rm(UI.picks,id);else if(UI.picks.length<UI.max)UI.picks.push(id);render();return;}
    case 'transmit':{if(id===UI.card)cancelMode();return;}
  }
  if(UI.mode==='card'&&UI.card===id){cancelMode();return;}
  if(def(id).c==='p'&&typeOf(id)!=='native'){playAction(id);return;}
  UI.mode='card';UI.card=id;render();
}
export function togglePick(id){const add=!UI.picks.includes(id);if(add)UI.picks.push(id);else rm(UI.picks,id);render();if(add&&UI.mode==='pay')payProgress();}
/* after a card goes into the spending tray: finish the purchase once the coins cover it */
export function payProgress(){if(UI.mode!=='pay'||!UI.buy)return;const c=CT[UI.buy.t].cost;if(payTotal()<c)return;
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
  if(S.turn.active&&UI.mode==='card'&&UI.card===S.turn.active.id&&S.turn.active.pi!==i){UI.mode='idle';UI.card=null;}
  UI.piece=i;render();
}

/* resign: online the server does it; locally the player whose turn it is (or, while an AI moves, the human watching) leaves.
   Everyone else plays on; with no human left racing, the AIs finish the game quickly. */
export function resignSeat(){if(!S||S.over||G.replay)return -1;if(online()){const i=NET.seat;return i>=0&&isActive(S.players[i])?i:-1;}
  const i=isAI(S.cur)?viewIdx():S.cur;return isAI(i)||!isActive(S.players[i])?-1:i;}
export function resignLocal(){const seat=resignSeat();if(seat<0)return;
  const humans=S.players.filter((p,j)=>j!==seat&&!p.ai&&isActive(p)).length;
  modal(`<h2>Resign?</h2><p class="sub">${esc(S.players[seat].name)} leaves the expedition and finishes last among the players still racing. ${humans?'The others play on.':'The AIs finish the race.'}</p><div class="mrow"><button class="btn" id="rsNo">Keep playing</button><button class="btn pri" id="rsYes">Resign</button></div>`,sc=>{
    sc.querySelector('#rsNo').onclick=closeModal;
    sc.querySelector('#rsYes').onclick=()=>{closeModal();if(!S||S.over||online())return;const prevCur=S.cur,prevRound=S.round;
      const r=recApply(G.rec,seat,{t:'resign'});if(!r.ok)return;playEvents(r.ev);afterLocalChange(S.cur!==prevCur||S.round!==prevRound);};},true);}
/* End game (local play): the game ends now for everyone; places as they stand (arrivals first, then who is closest) */
export function endLocal(){if(!S||S.over||online()||G.replay)return;
  modal(`<h2>End the game?</h2><p class="sub">The race stops now for everyone. Places go by who has arrived, then who is closest to El Dorado.</p><div class="mrow"><button class="btn" id="egNo">Keep playing</button><button class="btn pri" id="egYes">End game</button></div>`,sc=>{
    sc.querySelector('#egNo').onclick=closeModal;
    sc.querySelector('#egYes').onclick=()=>{closeModal();if(!S||S.over)return;const r=recApply(G.rec,S.cur,{t:'endgame'});if(!r.ok)return;playEvents(r.ev);afterLocalChange(true);};},true);}

/* the first view part of every frame: what the selection allows now (the targets), before anything is drawn */
export const derivePart = { name: 'derive', update(){if(!S)return;if(!online()&&!G.replay&&!isAI(S.cur))UI.viewer=S.cur;computeTargets();if(G.replay)replayDecorate();}};

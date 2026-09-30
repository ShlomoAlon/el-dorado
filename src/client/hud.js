/* The heads-up display: the top bar (round, one chip per player), the prompt (what to do now, the online turn clock)
   and the turn buttons. Each piece is rewritten only when its text changes. */
import { CT, SYMNAME, def } from '../engine.gen.js';
import { $, esc, setText, setHTML, setStyle, reduceMotion, EASE } from './dom.js';
import { S, UI, NET, G, cur, canAct, online, isAI } from './state.js';
import { onGeo, geo } from './geometry.js';
import { render } from './frame.js';
import { showGameOver, showPlayer } from './dialogs.js';
import { showSetup } from './menu.js';
import { openAll } from './market.js';
import { replayPromptHTML } from './replay.js';
import { sfx, SND } from './sound.js';
import { undo, canUndo, cancelMode, startEndTurn, finishTurn, confirmDiscardFor, confirmTrash, affordable } from './actions.js';

/* ---------- the top bar: round, and one chip per player (cards, blockades held, arrived) ---------- */
function updateHeader(){
  const mb=$('#menuBtn');setText(mb,G.replay?'Exit replay':'Menu');
  const t=(online()&&canAct()&&!S.over?'● Your turn · ':'')+'El Dorado Expedition';if(document.title!==t)document.title=t;
  const box=$('#players');
  if(!S){setHTML(box,'');return;}
  setText($('#roundLbl'),'Round '+S.round+(S.endTriggered&&!S.over?' · final':''));
  while(box.children.length>S.players.length)box.lastChild.remove();
  S.players.forEach((p,i)=>{
    let c=box.children[i];if(!c){c=document.createElement('div');c.setAttribute('role','button');c.tabIndex=0;box.appendChild(c);
      c.onclick=()=>showPlayer(i);c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showPlayer(i);}};} // (what can be seen of that player's cards)
    const fin=p.pieces.filter(k=>k==='done').length;
    const off=online()&&!NET.room.seats[i].online; // (the room's seats are in the game's seat order)
    const on=i===S.cur&&!S.over,cls='pchip glass'+(on?' on':'');
    if(c.className!==cls){c.className=cls;if(on&&!reduceMotion)c.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:520,easing:EASE});} // whose turn: the chip lights up and flashes once
    setStyle(c,'--pc',p.color);setStyle(c,'opacity',off?.55:1);c.title=off?'offline':'';
    setHTML(c,`<span class="dot"></span><span class="nm">${esc(p.name)}</span>${p.ai?'<span class="aitag" title="AI player">AI</span>':''}${fin?`<span class="fin">${p.pieces.length>1?fin+'/'+p.pieces.length+' ':''}★</span>`:''}`);
  });
}

/* ---------- the prompt and the turn buttons ---------- */
function updatePrompt(){
  if(!S){setHTML($('#ptxt'),'');btnWire($('#actBtns'),[]);return;}
  const pl=cur();const P=$('#ptxt'),B=$('#actBtns');
  const who=`<span class="who"><i style="background:${pl.color}"></i>${esc(pl.name)}</span>`;
  let txt='',btns=[];
  if(G.replay){setHTML(P,replayPromptHTML());btnWire(B,[]);return;}
  const tm=online()&&!S.over?'<span id="turnTimer" class="timer" hidden></span>':'';
  if(S.over){setHTML(P,'The expedition is over.');btnWire(B,[{t:'Results',id:'bRes',fn:showGameOver},{t:'New game',id:'bNew',pri:1,big:1,fn:showSetup}]);return;}
  if(!canAct()){setHTML(P,tm+who+(online()&&S.cur===NET.seat?'<span class="m">Reconnecting…</span>':(isAI(S.cur)?'is playing…':'is taking their turn…'))+(NET.status?` <span class="m">${esc(NET.status)}</span>`:''));btnWire(B,[]);renderTimer();return;}
  if(UI.cover){setHTML(P,who+'is up next. Pass the device, then reveal the hand.');btnWire(B,[{t:'Reveal hand',id:'bRev',pri:1,big:1,fn:()=>{UI.cover=false;render();}}]);return;}
  const undoBtn={t:'Undo',id:'bUndo',dis:!canUndo()||NET.busy,fn:undo};
  switch(UI.mode){
    case 'idle':{
      // (no words for the obvious: whose turn it is shows on the chips, what to do on the cards)
      if(pl.pieces.length>1&&pl.pieces.every(k=>k!=='done'))txt='<span class="m">Tap a pawn to switch.</span>';
      btns=[undoBtn,{t:'End turn',id:'bEnd',pri:1,big:1,fn:startEndTurn}];break;}
    case 'card':{
      const d=def(S,UI.card);const act=S.turn.active&&S.turn.active.id===UI.card;
      if(act)txt=`<b>${esc(d.n)}</b> has <b>${S.turn.active.left}</b> ${SYMNAME[S.turn.active.sym]}${S.turn.active.left>1?'s':''} left. <span class="m">Tap a highlighted space to keep going, or anywhere else to stop.</span>`;
      if(!UI.targets.size)txt+='<span class="m">No reachable spaces with this card.</span>';
      btns=[undoBtn,{t:act?'Stop moving':'Cancel',id:'bCan',fn:cancelMode},{t:'End turn',id:'bEnd',pri:1,big:1,fn:startEndTurn}];break;}
    case 'pay':{ // (the buy slot shows the card and what's paid; no Buy button: it's bought once the cards paid cover its price, payProgress)
      btns=[{t:'Cancel',id:'bCan',fn:cancelMode}];break;}
    case 'discardFor':{
      const P2=UI.pending;const verb=P2.kind==='camp'?'remove from the game':'discard';const left=P2.need-UI.picks.length;
      txt=`${P2.kind==='camp'?'Base camp':P2.kind==='blr'?'Blockade':'Rubble'}: <b>${UI.picks.length} of ${P2.need}</b> cards to ${verb}. `+(left?`<span class="m">Drag ${left} more card${left>1?'s':''} onto it, or tap cards.</span>`:'');
      btns=[{t:'Cancel',id:'bCan',fn:cancelMode},{t:'Confirm',id:'bOk',pri:1,big:1,dis:UI.picks.length!==P2.need,fn:confirmDiscardFor}];break;}
    case 'trashPick':{
      txt=`You may remove up to <b>${UI.max}</b> card${UI.max>1?'s':''} in hand from the game (${UI.picks.length}/${UI.max}).`;
      btns=[{t:UI.picks.length?'Remove':'Skip',id:'bOk',pri:1,big:1,fn:confirmTrash}];break;}
    case 'transmit':{txt='<b>Transmitter</b>: choose any card in the market or reserve. It goes to your discard pile.';
      btns=[{t:'Cancel',id:'bCan',fn:cancelMode}];break;}
    case 'buyWarn':{const names=[...new Set(affordable().map(a=>CT[a.t].n))];
      txt=`You can still afford <b>${names.slice(0,3).map(esc).join(', ')}</b>${names.length>3?` and ${names.length-3} more`:''}. <span class="m">Buy one before ending your turn?</span>`;
      btns=[{t:'Back',id:'bCan',fn:cancelMode},{t:'See cards',id:'bMkt',fn:()=>{cancelMode();openAll(true);}},{t:'End turn anyway',id:'bEndA',pri:1,big:1,fn:startEndTurn}];break;}
    case 'endTurn':{const k=UI.picks.length;txt=k?`Keeping <b>${k}</b> for next turn.`:'Tap cards to keep them for next turn.';
      btns=[{t:'Back',id:'bCan',fn:cancelMode},{t:k===pl.hand.length?'Keep none':'Keep all',id:'bAll',fn:()=>{UI.picks=UI.picks.length===pl.hand.length?[]:pl.hand.slice();render();}},{t:k?'End turn':'Discard & end turn',id:'bEnd2',pri:1,big:1,fn:finishTurn}];break;}
  }
  setHTML(P,tm+txt);btnWire(B,btns);renderTimer();
}
function btnWire(B,btns){
  const main=btns.filter(b=>b.big),rest=btns.filter(b=>!b.big);
  const sig=btns.map(b=>b.id+(b.dis?'d':'')+b.t).join('|');
  const h=b=>`<button class="btn${b.pri?' pri':''}${b.big?' big':''}" id="${b.id}"${b.dis?' disabled':''}>${b.t}</button>`;
  if(B.dataset.sig!==sig){B.innerHTML=main.map(h).join('')+(rest.length?`<div class="brow">${rest.map(h).join('')}</div>`:'');B.dataset.sig=sig;}
  btns.forEach(b=>{document.getElementById(b.id).onclick=b.fn;});
}

/* ---------- the online turn clock (in the prompt) ---------- */
function timeLeft(){if(!online()||NET.clockEnd==null||S.over)return null;return Math.max(0,Math.round((NET.clockEnd-Date.now())/1000));}
function renderTimer(){
  const el=document.getElementById('turnTimer');if(!el)return;
  const t=timeLeft();if(t===null){el.hidden=true;return;}
  if(t<10&&t>0&&t!==SND.lastT&&canAct())sfx('timer');SND.lastT=t;
  el.hidden=false;setText(el,Math.floor(t/60)+':'+String(t%60).padStart(2,'0'));el.classList.toggle('low',t<=15);
}
export const hudPart = { name: 'hud', update(){updateHeader();updatePrompt();}};
export function hudInit(){
  setInterval(()=>{if(online())renderTimer();},500);
  // how far the turn buttons reach in from the right (short screens keep the prompt clear of them)
  onGeo(()=>setStyle($('#prompt'),'--actFoot',(geo.actW?geo.actW+26:16)+'px'));
}

/* The heads-up display: the top bar (round, one chip per player), the prompt (what to do now, the online turn clock)
   and the turn buttons. Each piece is rewritten only when its text changes. */
import { CT, SYMNAME, assert } from '../engine.gen.js';
import { $, esc, setText, setHTML, setStyle, show, reduceMotion, EASE } from './dom.js';
import { S, UI, NET, G, cur, canAct, online } from './state.js';
import { onGeo, geo } from './geometry.js';
import { render, after } from './frame.js';
import { CHECKS } from './debug.js';
import { showGameOver, showPlayer } from './dialogs.js';
import { showSetup } from './menu.js';
import { openAll } from './market.js';
import { sfx, SND } from './sound.js';
import { undo, canUndo, cancelMode, startEndTurn, finishTurn, confirmDiscardFor, confirmTrash, affordable } from './actions.js';

/* ---------- the top bar: round, and one chip per player (cards, blockades held, arrived) ---------- */
function updateHeader(){
  const mb=$('#menuBtn');setText(mb,G.replay?'Exit replay':'Menu');
  const t=(online()&&canAct()&&!S.over?'● Your turn · ':'')+'El Dorado Expedition';if(document.title!==t)document.title=t;
  const box=$('#players');
  if(!S){setHTML(box,'');return;}
  // (fixed width: the number takes two digits' room, a figure space before 1–9; ' · final' is always laid out and only shown at the end)
  setHTML($('#roundLbl'),'Round '+String(S.round).padStart(2,'\u2007')+`<span class="fl${S.endTriggered&&!S.over?'':' off'}"> · final</span>`);
  while(box.children.length>S.players.length)box.lastChild.remove();
  S.players.forEach((p,i)=>{
    let c=box.children[i];if(!c){c=document.createElement('div');c.setAttribute('role','button');c.tabIndex=0;box.appendChild(c);
      c.onclick=()=>showPlayer(i);c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showPlayer(i);}};} // (what can be seen of that player's cards)
    const fin=p.pieces.filter(k=>k==='done').length;
    const off=online()&&!NET.room.seats[i].online; // (the room's seats are in the game's seat order)
    const on=i===S.cur&&!S.over,cls='pchip glass'+(on?' on':'');
    if(c.className!==cls){c.className=cls;if(on&&!reduceMotion)c.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:520,easing:EASE});} // whose turn: the chip lights up and flashes once
    setStyle(c,'--pc',p.color);setStyle(c,'opacity',off?.55:1);c.title=off?'offline':'';
    setHTML(c,`<span class="dot"></span><span class="nm">${esc(p.name)}</span>${p.ai?'<span class="aitag" title="AI player">AI</span>':''}<span class="fin${fin?'':' off'}">${p.pieces.length>1?fin+'/'+p.pieces.length+' ':''}★</span>`); // (the star's room is always kept: the chip never grows when someone arrives)
  });
}

/* ---------- the prompt and the turn buttons ---------- */
/* the prompt is two fixed slots: the turn timer (renderTimer), at its own place whose room is kept for the whole online
   game, and the message, written as a whole when it changes (a new message never redraws or moves the timer) */
/* the message: one line (owner, 2026-10-01), so a new message never moves what's below it */
function say(html){const M=$('#pmsg');if(M.__h===html)return;setHTML(M,html);
  if(CHECKS)after(()=>assert(M.scrollWidth<=M.clientWidth+1,'view: the prompt\'s message fits on one line ('+M.textContent+')'));}
function updatePrompt(){
  const T=$('#ptxt'),B=$('#actBtns'),timed=!!S&&online()&&!G.replay;
  if(T.classList.contains('timed')!==timed)T.classList.toggle('timed',timed);renderTimer();
  if(!S){say('');btnWire(B,[]);return;}
  const pl=cur();
  const who=`<span class="who"><i style="background:${pl.color}"></i>${esc(pl.name)}</span>`;
  let txt='',btns=[];
  if(G.replay){btnWire(B,[]);return;} // (the prompt is hidden in a replay: its dock says each step, the one place that does)
  if(S.over){say('The expedition is over.');btnWire(B,[{t:'Results',id:'bRes',fn:showGameOver},{t:'New game',id:'bNew',pri:1,big:1,fn:showSetup}]);return;}
  if(online()&&NET.status){say(`<span class="m">${esc(NET.status)}</span>`);btnWire(B,[]);return;} // (the connection lost: what matters now)
  if(!canAct()){say(who+(online()&&S.cur===NET.seat?'<span class="m">Reconnecting…</span>':'is playing…'));btnWire(B,[]);return;}
  if(UI.cover){say(who+'is up next: pass the device.');btnWire(B,[{t:'Reveal hand',id:'bRev',pri:1,big:1,fn:()=>{UI.cover=false;render();}}]);return;}
  const undoBtn={t:'Undo',id:'bUndo',dis:!canUndo()||NET.busy,fn:undo};
  switch(UI.mode){
    case 'idle':{
      // (no words for the obvious: whose turn it is shows on the chips, what to do on the cards)
      if(pl.pieces.length>1&&pl.pieces.every(k=>k!=='done'))txt='<span class="m">Tap a pawn to switch.</span>';
      btns=[undoBtn,{t:'End turn',id:'bEnd',pri:1,big:1,fn:startEndTurn}];break;}
    case 'card':{
      const act=S.turn.active&&S.turn.active.id===UI.card;
      if(!UI.targets.size)txt='<span class="m">No space this card reaches.</span>';
      else if(act)txt=`<b>${S.turn.active.left}</b> ${SYMNAME[S.turn.active.sym]}${S.turn.active.left>1?'s':''} left. <span class="m">Tap a space to go on.</span>`;
      btns=[undoBtn,{t:act?'Stop moving':'Cancel',id:'bCan',fn:cancelMode},{t:'End turn',id:'bEnd',pri:1,big:1,fn:startEndTurn}];break;}
    case 'pay':{ // (the buy slot shows the card and what's paid; no Buy button: it's bought once the cards paid cover its price, payProgress)
      btns=[{t:'Cancel',id:'bCan',fn:cancelMode}];break;}
    case 'discardFor':{
      const P2=UI.pending;const verb=P2.kind==='camp'?'remove':'discard';const left=P2.need-UI.picks.length;
      txt=`${P2.kind==='camp'?'Base camp':P2.kind==='blr'?'Blockade':'Rubble'}: ${verb} <b>${UI.picks.length} of ${P2.need}</b>.`+(left?' <span class="m">Drag or tap cards.</span>':'');
      btns=[{t:'Cancel',id:'bCan',fn:cancelMode},{t:'Confirm',id:'bOk',pri:1,big:1,dis:UI.picks.length!==P2.need,fn:confirmDiscardFor}];break;}
    case 'trashPick':{
      txt=`Remove up to <b>${UI.max}</b> card${UI.max>1?'s':''} from the game (${UI.picks.length}/${UI.max}).`;
      btns=[{t:UI.picks.length?'Remove':'Skip',id:'bOk',pri:1,big:1,fn:confirmTrash}];break;}
    case 'transmit':{txt='<b>Transmitter</b>: take any card, free.';
      btns=[{t:'Cancel',id:'bCan',fn:cancelMode}];break;}
    case 'buyWarn':{const names=[...new Set(affordable().map(a=>CT[a.t].n))];
      txt=`Still affordable: <b>${esc(names[0])}</b>${names.length>1?` +${names.length-1} more`:''}.`;
      btns=[{t:'Back',id:'bCan',fn:cancelMode},{t:'See cards',id:'bMkt',fn:()=>{cancelMode();openAll(true);}},{t:'End turn anyway',id:'bEndA',pri:1,big:1,fn:startEndTurn}];break;}
    case 'endTurn':{const k=UI.picks.length;txt=k?`Keeping <b>${k}</b> for next turn.`:'Tap cards to keep them for next turn.';
      btns=[{t:'Back',id:'bCan',fn:cancelMode},{t:k===pl.hand.length?'Keep none':'Keep all',id:'bAll',fn:()=>{UI.picks=UI.picks.length===pl.hand.length?[]:pl.hand.slice();render();}},{t:k?'End turn':'Discard & end turn',id:'bEnd2',pri:1,big:1,fn:finishTurn}];break;}
  }
  say(txt);btnWire(B,btns);
}
/* The turn buttons sit in three fixed slots: a big primary at the bottom, a cancel slot and an extra slot above it.
   A button keeps its slot in every mode and an unused slot keeps its space (invisible), so nothing moves as the mode
   changes (CLAUDE.md: fixed slots). The slot elements are made once and only their words and state change. */
/* s3: Undo, See cards, Keep all (the right slot: Undo is the one most often alone); s2: Cancel, Back, Results (left) */
const SLOTS=['s3','s2','p'],slotOf=b=>b.big?'p':b.id==='bCan'||b.id==='bRes'?'s2':'s3';
function btnWire(B,btns){
  if(!B.firstChild)B.innerHTML=SLOTS.map(s=>`<button type="button" class="btn bslot ${s}${s==='p'?' pri big':''}"></button>`).join('');
  const on=btns.length>0;if(B.hidden===on)B.hidden=!on;
  for(const s of SLOTS){
    const el=B.querySelector('.'+s),here=btns.filter(x=>slotOf(x)===s),b=here[0];
    assert(here.length<=1,'turn buttons: one button per slot');
    const t=b?b.t:'\u00a0';if(el.textContent!==t)el.textContent=t;
    if(b){if(el.id!==b.id)el.id=b.id;}else if(el.id)el.removeAttribute('id');
    const dis=!b||!!b.dis;if(el.disabled!==dis)el.disabled=dis;
    el.classList.toggle('off',!b);if(s!=='p')el.classList.toggle('pri',!!(b&&b.pri));
    el.onclick=b?b.fn:null;
  }
}

/* ---------- the online turn clock (in the prompt) ---------- */
function timeLeft(){if(!online()||NET.clockEnd==null||S.over)return null;return Math.max(0,Math.round((NET.clockEnd-Date.now())/1000));}
function renderTimer(){
  const el=$('#turnTimer'),t=$('#ptxt').classList.contains('timed')?timeLeft():null;show(el,t!==null);if(t===null)return;
  if(t<10&&t>0&&t!==SND.lastT&&canAct())sfx('timer');SND.lastT=t;
  setText(el,Math.floor(t/60)+':'+String(t%60).padStart(2,'0'));el.classList.toggle('low',t<=15);
}
export const hudPart = { name: 'hud', update(){updateHeader();updatePrompt();}};
export function hudInit(){
  setInterval(()=>{if(online())renderTimer();},500);
  // how far the turn buttons reach in from the right (short screens keep the prompt clear of them)
  onGeo(()=>setStyle($('#prompt'),'--actFoot',(geo.actW?geo.actW+26:16)+'px'));
}

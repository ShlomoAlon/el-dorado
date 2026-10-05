/* The heads-up display: the top bar (round, one chip per player), the prompt (what to do now, the online turn clock)
   and the turn buttons. Each piece is rewritten only when its text changes. */
import { CT, SYMNAME, assert } from '../engine.gen.js';
import { $, esc, setText, setHTML, setStyle, show, num, reduceMotion, EASE } from './dom.js';
import { S, UI, NET, G, cur, canAct, online, covered, turnKey } from './state.js';
import { onGeo, geo } from './geometry.js';
import { render, afterDrawn } from './frame.js';
import { CHECKS } from './debug.js';
import { showGameOver, showPlayer } from './dialogs.js';
import { showSetup } from './menu.js';
import { openAll } from './market.js';
import { sfx, SND } from './sound.js';
import { undo, canUndo, cancelMode, startEndTurn, finishTurn, confirmDiscardFor, confirmTrash, affordable, targets } from './actions.js';

/* ---------- the top bar: round, and one chip per player (cards, blockades held, arrived) ---------- */
function updateHeader(){
  const mb=$('#menuBtn');setText(mb,G.replay?'Exit replay':'Menu');
  const t=(online()&&canAct()&&!S.over?'● Your turn · ':'')+'El Dorado Expedition';if(document.title!==t)document.title=t;
  const box=$('#players');
  if(!S){setHTML(box,'');return;}
  // (fixed width: the number takes two digits' room, a figure space before 1–9; ' · final' is always laid out and only shown at the end)
  setHTML($('#roundLbl'),'Round '+num(S.round,2)+`<span class="fl${S.endTriggered&&!S.over?'':' off'}"> · final</span>`);
  while(box.children.length>S.players.length)box.lastChild.remove();
  S.players.forEach((p,i)=>{
    let c=box.children[i];if(!c){c=document.createElement('div');c.setAttribute('role','button');c.tabIndex=0;box.appendChild(c);
      c.onclick=()=>showPlayer(i);c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showPlayer(i);}};} // (what can be seen of that player's cards)
    const fin=p.pieces.filter(k=>k==='done').length;
    const off=online()&&!NET.room.seats[i].online; // (the room's seats are in the game's seat order)
    const on=i===S.cur&&!S.over,cls='pchip surf'+(on?' on':'');
    if(c.className!==cls){c.className=cls;if(on&&!reduceMotion)c.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],{duration:520,easing:EASE});} // whose turn: the chip lights up and flashes once
    setStyle(c,'--pc',p.color);setStyle(c,'opacity',off?.55:1);c.title=off?'offline':'';
    setHTML(c,`<span class="dot"></span><span class="nm">${esc(p.name)}</span>${p.ai?'<span class="aitag" title="AI player">AI</span>':''}<span class="fin${fin?'':' off'}">${p.pieces.length>1?fin+'/'+p.pieces.length+' ':''}★</span>`); // (the star's room is always kept: the chip never grows when someone arrives)
  });
}

/* ---------- the prompt and the turn buttons ---------- */
/* the prompt is two fixed slots: the turn timer (renderTimer), at its own place whose room is kept for the whole online
   game, and the message, written as a whole when it changes (a new message never redraws or moves the timer) */
/* the message: one line (owner, 2026-10-01), so a new message never moves what's below it */
function say(html){const M=$('#pmsg');if(M.__say===html)return;M.__say=html;setHTML(M,html?`<span class="pm">${html}</span>`:''); // (in a pill: words over the board need a solid ground)
  if(CHECKS)afterDrawn(()=>assert(M.scrollWidth<=M.clientWidth+1,'view: the prompt\'s message fits on one line ('+M.textContent+')'));}
/* every turn button: its words and its slot (s3: right, above the big one's edge; s2: left; p: the big one). Labels are
   data, so every one is checked against its slot (checkLabels), not only those a test happens to show */
const BTN={undo:{t:'Undo',s:'s3',id:'bUndo'},cards:{t:'Cards',s:'s3',id:'bMkt'},keepAll:{t:'Keep all',s:'s3',id:'bAll'},keepNone:{t:'None',s:'s3',id:'bAll'},
  cancel:{t:'Cancel',s:'s2',id:'bCan'},stop:{t:'Stop',s:'s2',id:'bCan'},back:{t:'Back',s:'s2',id:'bCan'},results:{t:'Results',s:'s2',id:'bRes'},
  end:{t:'End turn',s:'p',id:'bEnd'},endAnyway:{t:'End anyway',s:'p',id:'bEndA'},endKeep:{t:'End turn',s:'p',id:'bEnd2'},discardEnd:{t:'Discard & end',s:'p',id:'bEnd2'},
  newGame:{t:'New game',s:'p',id:'bNew'},reveal:{t:'Reveal hand',s:'p',id:'bRev'},confirm:{t:'Confirm',s:'p',id:'bOk'},remove:{t:'Remove',s:'p',id:'bOk'},skip:{t:'Skip',s:'p',id:'bOk'}};
function updatePrompt(){
  const T=$('#ptxt'),B=$('#actBtns'),timed=!!S&&online()&&!G.replay;
  if(T.classList.contains('timed')!==timed)T.classList.toggle('timed',timed);renderTimer();
  if(!S){say('');btnWire(B,[]);return;}
  const pl=cur();
  const who=`<span class="who"><i style="background:${pl.color}"></i>${esc(pl.name)}</span>`;
  let txt='',btns=[];
  if(G.replay){btnWire(B,[]);return;} // (the prompt is hidden in a replay: its dock says each step, the one place that does)
  if(S.over){say('The expedition is over.');btnWire(B,[{...BTN.results,fn:showGameOver},{...BTN.newGame,fn:showSetup}]);return;}
  if(online()&&NET.status){say(`<span class="m">${esc(NET.status)}</span>`);btnWire(B,[]);return;} // (the connection lost: what matters now)
  if(!canAct()){say(online()&&S.cur===NET.seat?'<span class="m">Reconnecting…</span>':'');btnWire(B,[]);return;} // (whose turn it is shows on the chips; what they do, in the recap)
  if(covered()){say(who+'is up next: pass the device.');btnWire(B,[{...BTN.reveal,fn:()=>{UI.revealed=turnKey();}}]);return;}
  const undoBtn={...BTN.undo,dis:!canUndo()||NET.busy,fn:undo};
  switch(UI.mode){
    case 'idle':{
      // (no words for the obvious: whose turn it is shows on the chips, what to do on the cards)
      if(pl.pieces.length>1&&pl.pieces.every(k=>k!=='done'))txt='<span class="m">Tap a pawn to switch.</span>';
      btns=[undoBtn,{...BTN.end,fn:startEndTurn}];break;}
    case 'card':{
      const act=S.turn.active&&S.turn.active.id===UI.card;
      if(!targets().size)txt='<span class="m">No space in reach.</span>';
      else if(act)txt=`<b>${S.turn.active.left}</b> ${SYMNAME[S.turn.active.sym]}${S.turn.active.left>1?'s':''} left. <span class="m">Tap a space to go on.</span>`;
      btns=[undoBtn,{...(act?BTN.stop:BTN.cancel),fn:cancelMode},{...BTN.end,fn:startEndTurn}];break;}
    case 'pay':{ // (the buy slot shows the card and what's paid; no Buy button: it's bought once the cards paid cover its price, payProgress)
      btns=[{...BTN.cancel,fn:cancelMode}];break;}
    case 'discardFor':{
      const P2=UI.pending;const verb=P2.kind==='camp'?'remove':'discard';const left=P2.need-UI.picks.length;
      txt=`${P2.kind==='camp'?'Base camp':P2.kind==='blr'?'Blockade':'Rubble'}: ${verb} <b>${UI.picks.length} of ${P2.need}</b>.`+(left?' <span class="m">Drag or tap cards.</span>':'');
      btns=[{...BTN.cancel,fn:cancelMode},{...BTN.confirm,dis:UI.picks.length!==P2.need,fn:confirmDiscardFor}];break;}
    case 'trashPick':{
      txt=`Remove up to <b>${UI.max}</b> card${UI.max>1?'s':''} from the game (${UI.picks.length}/${UI.max}).`;
      btns=[{...(UI.picks.length?BTN.remove:BTN.skip),fn:confirmTrash}];break;}
    case 'transmit':{txt='<b>Transmitter</b>: take any card, free.';
      btns=[{...BTN.cancel,fn:cancelMode}];break;}
    case 'buyWarn':{const names=[...new Set(affordable().map(a=>CT[a.t].n))];
      txt=`Still affordable: <b>${esc(names[0])}</b>${names.length>1?` +${names.length-1} more`:''}.`;
      btns=[{...BTN.back,fn:cancelMode},{...BTN.cards,fn:()=>{cancelMode();openAll(true);}},{...BTN.endAnyway,fn:startEndTurn}];break;}
    case 'endTurn':{const k=UI.picks.length;txt=k?`Keeping <b>${k}</b> for next turn.`:'Tap cards to keep them for next turn.';
      btns=[{...BTN.back,fn:cancelMode},{...(k===pl.hand.length?BTN.keepNone:BTN.keepAll),fn:()=>{UI.picks=UI.picks.length===pl.hand.length?[]:pl.hand.slice();render();}},{...(k?BTN.endKeep:BTN.discardEnd),fn:finishTurn}];break;}
  }
  say(txt);btnWire(B,btns);
}
/* The turn buttons sit in three fixed slots: a big primary at the bottom, a cancel slot and an extra slot above it.
   A button keeps its slot in every mode and an unused slot keeps its space (invisible), so nothing moves as the mode
   changes (CLAUDE.md: fixed slots). The slot elements are made once and only their words and state change. */
const SLOTS=['s3','s2','p'];
/* every label in BTN fits its slot at this size: checked (debug and tests) once the buttons first show, and again after the
   game area resizes; each label is written into its slot and measured, then the slot's own words go back */
let labelsChecked=false;
onGeo(sized=>{if(sized)labelsChecked=false;});
function checkLabels(B){
  for(const s of SLOTS){const el=B.querySelector('.'+s),keep=el.textContent;
    for(const b of Object.values(BTN))if(b.s===s){el.textContent=b.t;assert(el.scrollWidth<=el.clientWidth+1,"view: every turn button's label fits its slot ("+b.t+")");}
    el.textContent=keep;}
}
function btnWire(B,btns){
  if(!B.firstChild)B.innerHTML=SLOTS.map(s=>`<button type="button" class="btn bslot ${s}${s==='p'?' pri big':''}"></button>`).join('');
  // (the slots keep their place and size with no button in them, the area too: never hidden, so what is measured from it
  // (a chosen card's rise, the hand's width, the prompt's foot) is the same on every turn; a raised card dropped 37 px when the
  // buttons came back on a phone, 2026-10-04)
  const on=btns.length>0;
  if(CHECKS&&on&&!labelsChecked){labelsChecked=true;afterDrawn(()=>checkLabels(B));}
  for(const s of SLOTS){
    const el=B.querySelector('.'+s),here=btns.filter(x=>x.s===s),b=here[0];
    assert(here.length<=1,'turn buttons: one button per slot');
    const t=b?b.t:'\u00a0';if(el.textContent!==t)el.textContent=t;
    if(b){if(el.id!==b.id)el.id=b.id;}else if(el.id)el.removeAttribute('id');
    const dis=!b||!!b.dis;if(el.disabled!==dis)el.disabled=dis;
    el.classList.toggle('off',!b);
    el.onclick=b?b.fn:null;
  }
}

/* ---------- the online turn clock (in the prompt) ---------- */
function timeLeft(){if(!online()||NET.clockEnd==null||S.over)return null;return Math.max(0,Math.round((NET.clockEnd-Date.now())/1000));}
function renderTimer(){
  const el=$('#turnTimer'),t=$('#ptxt').classList.contains('timed')?timeLeft():null;show(el,t!==null);if(t===null)return;
  if(t<10&&t>0&&t!==SND.lastT&&canAct())sfx('timer');SND.lastT=t;
  setHTML(el,num(Math.floor(t/60),2)+':'+String(t%60).padStart(2,'0')); // (a slot for the minutes: a bank of ten minutes or more counts down past 9:59 without the clock changing width)el.classList.toggle('low',t<=15);
}
export const hudPart = { name: 'hud', update(){updateHeader();updatePrompt();}};
export function hudInit(){
  setInterval(()=>{if(online())renderTimer();},500);
  // how far the turn buttons reach in from the right (short screens keep the prompt clear of them)
  onGeo(()=>setStyle($('#prompt'),'--actFoot',(geo.actW?geo.actW+26:16)+'px'));
}

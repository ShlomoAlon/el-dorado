/* The history panel: every turn played, newest first, from the game's journal (S.log: the engine's public events).
   Each turn is a row of small cards (the same card faces as your own hand) with a caption per step: what was played,
   spent, bought and removed. Pointing at a step (or tapping it) says in words everything it did, and shows on the board
   where its explorer went. By default it sits under the prompt, exactly one turn tall; it scrolls to older turns, can be
   dragged anywhere by the bar on its right edge (dropped near its old spot, it goes back there), resized from its corner (never below
   one full turn), and hidden (the History button brings it back). Where it is and how big is remembered on this device.
   While another player takes their turn (an AI here, anyone else online) it follows live: their cards fly out of their
   player chip, a bought card flies out of the market, and their moves leave a dotted trail on the board until you act.
   Your own turn is added once you end it. */
import { S, CT, MAP, SYMNAME, plural, fmt, assert } from '../engine.gen.js';
import { $, esc, setHTML, setText, setStyle, reduceMotion, EASE } from './dom.js';
import { toast } from './dialogs.js';
import { UI, NET, G, online, isAI } from './state.js';
import { render, after } from './frame.js';
import { geo, onGeo } from './geometry.js';
import { cardHTML } from './cards.js';
import { rectT } from './hand.js';
import { marketRectOf } from './market.js';
import { setTrail } from './board/overlays.js';

/* ---------- live: the turn being watched (its trail on the board, cards to fly into the panel) ---------- */
const LIVE={pl:-1,ended:false,trail:[],fly:[],fresh:false};
/* whose turns are followed live: the AIs (local), everyone but me (online); never in replays, where the actor's own hand is shown */
export function feedWatch(pl){if(!S||G.replay||pl==null||!S.players[pl])return false;return online()?pl!==NET.seat:isAI(pl);}
function liveReset(){LIVE.pl=-1;LIVE.ended=false;LIVE.trail=[];LIVE.fly=[];}
/* I (or a pass-and-play human here) act: the last watched turn's trail goes */
export function feedClear(){if(LIVE.pl<0)return;liveReset();render();}
function chipRect(pl){const c=document.querySelectorAll('#players .pchip')[pl];return c?c.getBoundingClientRect():null;}
/* one engine event of a watched player (called from playEvents, after the state changed and before render) */
export function feedEvent(e){
  if(e.e==='play'){
    if(LIVE.pl!==e.pl||LIVE.ended){liveReset();LIVE.pl=e.pl;}
    LIVE.fresh=true;if(e.k==='end')LIVE.ended=true;
    if(e.k==='move'&&e.more)return; // leftover strength: the same step goes further
    if(e.ts&&e.ts.length)LIVE.fly.push({pl:e.pl,kind:'hand',from:chipRect(e.pl)});
    if(e.got)LIVE.fly.push({pl:e.pl,kind:'got',from:marketRectOf(e.got)}); // the card bought or taken flies in from the market
    return;}
  if(LIVE.pl===e.pl&&e.e==='move')LIVE.trail.push(e.path);
}

/* ---------- the turns, from the journal ---------- */
/* S.log in turns, oldest first: {id ('round:seat'), p, r, s: steps, end}. A step is a 'play' entry plus what followed it:
   bl (the blockade it took), arr (reached El Dorado), paths (where the explorer went), log (its journal entries, for its words).
   Running out of time, leaving and ending the game are steps of their own; the game's own entries (the start, the final round,
   the result) are rows of their own ({id, sys}). The oldest turn can be cut short: the engine keeps the last entries only. */
function turns(){
  const T=[];let t=null;
  for(const e of S.log){
    if(e.pl==null){T.push({id:e.e,sys:e});continue;}
    if(e.e==='resign'&&!(t&&t.p===e.pl&&!t.end)){T.push({id:e.r+':'+e.pl+':left',p:e.pl,r:e.r,s:[{k:'resign',log:[e],paths:[]}],end:true});continue;} // (online, out of turn)
    if(!t||t.p!==e.pl||t.end){t={id:e.r+':'+e.pl,p:e.pl,r:e.r,s:[]};T.push(t);}
    const last=t.s[t.s.length-1];
    if(e.e==='play'){
      if(e.k==='move'&&e.more&&last&&last.k==='move'){last.n+=e.n;last.log.push(e);continue;} // leftover strength: the same step goes further
      if(e.k==='trash'&&!e.ts.length)continue;
      t.s.push({...e,log:[e],paths:[]});if(e.k==='end')t.end=true;continue;}
    if(e.e==='timeout'||e.e==='resign'||e.e==='endgame'){t.s.push({k:e.e,log:[e],paths:[]});if(e.e==='resign')t.end=true;continue;}
    if(!last)continue; // (what follows a step whose start the journal no longer keeps)
    if(e.e==='move')last.paths.push(e.path);
    else{last.log.push(e);if(e.e==='block')last.bl=e.n;else if(e.e==='arrive')last.arr=true;}
  }
  return T;
}
/* a journal entry in words (the player's name comes before it, except for the game's own entries) */
function logLine(e){
  const n=CT[e.ts?.[0]]?.n,cards=k=>plural(k,'card');
  switch(e.e){
    case 'start':return`The expedition sets out: ${S.players.map(p=>p.name).join(', ')}. Course: ${MAP.name} (${[...MAP.route,'El Dorado'].join(' · ')}).`;
    case 'play':switch(e.k){
      case 'move':return e.n?`moves ${plural(e.n,'space')} with ${n}${CT[e.ts[0]].s==='*'?` (as ${SYMNAME[e.sym]})`:''}.`:`plays ${n}.`;
      case 'native':return e.n?'plays the Native and moves to an adjacent space.':'plays the Native to tear down a blockade.';
      case 'blr':return`discards ${cards(e.ts.length)} to clear the blockade: ${e.ts.map(t=>CT[t].n).join(', ')}.`;
      case 'rubble':return`discards ${cards(e.ts.length)} to cross rubble: ${e.ts.map(t=>CT[t].n).join(', ')}.`;
      case 'camp':return`removes ${cards(e.ts.length)} from the game to enter a base camp: ${e.ts.map(t=>CT[t].n).join(', ')}.`;
      case 'action':return`plays ${n} and draws ${cards(e.n)}.`;
      case 'trash':return`removes ${e.ts.map(t=>CT[t].n).join(', ')} from the game.`;
      case 'transmit':return`uses the Transmitter to take ${CT[e.got].n}.`;
      case 'buy':return`buys ${CT[e.got].n} for ${fmt(e.paid)} coin${e.paid===1?'':'s'}, paying with ${e.ts.map(t=>CT[t].n).join(', ')}.`;
      case 'end':return`ends the turn${e.disc?', discarding '+e.disc:''}${e.kept?(e.disc?' and':'')+' keeping '+e.kept:''}.`;
    }break;
    case 'block':return`tears down blockade #${e.n} and keeps it.`;
    case 'arrive':return'reaches El Dorado!';
    case 'final':return S.fullRace?'Only one expedition is still racing. The round will be finished.':'The final round has begun.';
    case 'resign':return'leaves the expedition.';
    case 'timeout':return'ran out of time.';
    case 'endgame':return'ends the game.';
    case 'over':{const w=S.players.filter((p,i)=>S.places[i]===1);return`${w.map(p=>p.name).join(' & ')} win${w.length>1?'':'s'} the race to El Dorado.`;}
  }
  assert(false,'logLine: a journal entry '+e.e+'/'+e.k);
}
const stepWords=(g,p)=>p.name+' '+g.log.map(logLine).join(' ');

/* ---------- a step pointed at (or tapped): where its explorer went, on the board ---------- */
let HOVER=null,hoverEl=null; // HOVER: {paths, color} of the step element hoverEl
function hoverStep(el){if(el===hoverEl)return;hoverEl=el;
  const g=el&&el.__g,t=el&&el.closest('.ht').__t;HOVER=g&&g.paths.length?{paths:g.paths,color:S.players[t.p].color}:null;render();}

/* ---------- where the panel is, how big, and whether it's shown (kept on this device) ----------
   fx/fy: where it floats, as fractions of the room around it (null: its place under the prompt);
   w: its width in px (null: the default); h: the list's height in px (null: one turn);
   dock 'left': a full-height column of its own left of the game (large screens only: elsewhere it goes under the prompt); sw: its width */
const KEY='eldorado-hist';
const P={hide:false,fx:null,fy:null,w:null,h:null,dock:null,sw:340};
try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&typeof v==='object')for(const k in P)if(k in v)P[k]=v[k];}catch(e){}
function saveP(){try{localStorage.setItem(KEY,JSON.stringify(P));}catch(e){}}
const wide=matchMedia('(min-width:900px)');
const inSide=()=>P.dock==='left'&&wide.matches;
const isHome=()=>P.fx==null&&!inSide();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/* while it is dragged or resized: its position / size under the pointer (the saved ones change on release) */
const DRAG={x:null,y:null,w:null,h:null};

/* ---------- what the panel shows ---------- */
/* the turns to show, oldest first: the turn in progress only while it is followed live (or in a replay) */
function shownTurns(){
  const H=turns(),t=H[H.length-1];
  return t&&!t.sys&&!t.end&&!G.replay&&!feedWatch(t.p)?H.slice(0,-1):H;
}
function stepCap(g){
  const one=g.ts&&g.ts.length===1?CT[g.ts[0]].n:'',bl=g.bl?` · blockade #${g.bl}`:'',arr=g.arr?' · <b>El Dorado</b>':'';
  switch(g.k){
    case 'move':return esc(one)+(g.n||!g.bl?` · <b>${g.n}</b> ${g.n===1?'space':'spaces'}`:'')+bl+arr; // (0 spaces: it only took the blockade in front of it)
    case 'native':return(g.n?'Native · <b>1</b> space':'Native')+bl+arr;
    case 'rubble':return`Discarded <b>${g.ts.length}</b> · rubble`;
    case 'camp':return`Removed <b>${g.ts.length}</b> · base camp`;
    case 'blr':return`Discarded <b>${g.ts.length}</b>`+bl;
    case 'action':return`${esc(one)} · drew <b>${g.n}</b>`;
    case 'trash':return`Removed <b>${g.ts.length}</b> from the game`;
    case 'transmit':return`Took <b>${esc(CT[g.got].n)}</b>`;
    case 'buy':return`Bought <b>${esc(CT[g.got].n)}</b> for ${fmt(g.paid)}`;
    case 'end':return g.kept?`kept <b>${g.kept}</b>${g.disc?` · discarded ${g.disc}`:''}`:`kept none${g.disc?` · discarded ${g.disc}`:''}`;
    case 'timeout':return'the clock ran out';
    case 'resign':case 'endgame':return'';
  }
  return'';
}
const PILL={end:'Ended turn',timeout:'Out of time',resign:'Left the game',endgame:'Ended the game'};
const cardSig=g=>g.k+'|'+(g.ts||[]).join()+'|'+(g.got||'');
function stepHTML(g){
  if(PILL[g.k])return`<div class="fg fend f-${g.k}" data-c="${cardSig(g)}"><div class="fpill">${PILL[g.k]}</div><div class="fcap">${stepCap(g)}</div></div>`;
  const mini=(t,got)=>`<div class="fc${got?' got':''}" data-t="${t}"><div class="mcard">${cardHTML(t)}</div></div>`; // (the step's words are its tooltip: stepWords)
  return`<div class="fg f-${g.k}" data-c="${cardSig(g)}"><div class="frc"><div class="fcs">${(g.ts||[]).map(t=>mini(t)).join('')}</div>${g.got?`<span class="farr" aria-hidden="true">›</span>${mini(g.got,1)}`:''}</div><div class="fcap">${stepCap(g)}</div></div>`;
}
function turnHead(t,now){
  const p=S.players[t.p];if(!p)return'';const you=online()&&t.p===NET.seat;
  return`<i class="pdot" style="--pc:${p.color}"></i><b>${esc(p.name)}</b>${you?'<span>(you)</span>':''}<span class="hr">Round ${t.r}</span>${now?'<span class="hnow">playing…</span>':''}`;
}
const NONE='<p class="hnone">Nothing played yet. Each turn shows here, newest first.</p>';
let firstObs=null,shownBtn=null,mktWas=null,replayOpen=null;
/* only the newest turns are drawn (a full history is hundreds of card faces); more as the list is scrolled toward them */
const FIRST=8;let limit=FIRST,moreKey=0;
function more(){const l=$('#histList'),n=shownTurns().length;if(limit<n&&l.scrollTop+l.clientHeight>l.scrollHeight-240){limit+=12;render();}}
/* a replay in a small game area (a phone) has no room for it: there it shows only when asked for (the History button) */
const smallReplay=()=>!!G.replay&&geo.app.width<600;
const shown=()=>!P.hide&&(!smallReplay()||replayOpen===G.replay);
function update(){
  const H=$('#hist'),on=!!S&&!UI.cover&&shown();
  if(mktWas!==UI.mktOpen){mktWas=UI.mktOpen;after(place);} // (the market opened or closed: its band under the prompt changes)
  const p=S&&S.players[LIVE.pl];if(HOVER)setTrail(HOVER.paths,HOVER.color);else setTrail(p&&!G.replay?LIVE.trail:[],p?p.color:''); // (a step pointed at in the list shows its moves instead)
  if(shownBtn!==shown()){shownBtn=shown();$('#histBtn').classList.toggle('on',shownBtn);$('#histBtn').setAttribute('aria-pressed',String(shownBtn));}
  sync(on);
  if(!on){if(!H.hidden)H.hidden=true;LIVE.fly=[];LIVE.fresh=false;return;}
  const live=LIVE.fresh&&!H.hidden&&!reduceMotion;LIVE.fresh=false;
  if(H.hidden)H.hidden=false;
  const list=$('#histList'),all=shownTurns(),want=all.slice(-limit).reverse(); // newest first
  // drop the turns that are gone (older than the history keeps, undone, another game), then put each in its place
  const keep=new Set(want.map(t=>t.id));
  for(const el of[...list.children])if(!el.classList.contains('ht')?want.length:!keep.has(el.dataset.id))el.remove();
  if(!want.length&&!list.firstElementChild)list.innerHTML=NONE;
  const have=new Map([...list.children].map(el=>[el.dataset.id,el])),fresh=[];let prev=null;
  want.forEach((t,j)=>{
    let el=have.get(t.id);
    const at=()=>{const a=prev?prev.nextElementSibling:list.firstElementChild;if(a!==el)list.insertBefore(el,a);prev=el;};
    if(t.sys){if(!el){el=document.createElement('div');el.className='ht sys';el.dataset.id=t.id;}at();setText(el,logLine(t.sys));return;} // the game's own entries: a line of words
    if(el&&el.__end&&t.end){at();return;} // (a finished turn never changes)
    if(!el){el=document.createElement('div');el.className='ht';el.dataset.id=t.id;el.innerHTML='<div class="hwho"></div><div class="hsteps"></div>';if(live&&!j)el.classList.add('new');}
    at();el.__t=t;
    setHTML(el.firstElementChild,turnHead(t,!j&&!t.end&&S.cur===t.p&&!S.over));
    // steps: the ones already there keep their cards (only a caption may change: more spaces, a blockade), new ones are added
    const box=el.lastElementChild,kids=box.children,pl=S.players[t.p],words=g=>stepWords(g,pl);let k=0;
    for(;k<t.s.length&&k<kids.length;k++){if(kids[k].dataset.c!==cardSig(t.s[k]))break;setHTML(kids[k].lastElementChild,stepCap(t.s[k]));kids[k].__g=t.s[k];const w=words(t.s[k]);if(kids[k].title!==w)kids[k].title=w;}
    while(kids.length>k)kids[k].remove();
    for(;k<t.s.length;k++){box.insertAdjacentHTML('beforeend',stepHTML(t.s[k]));const se=box.lastElementChild;se.lastElementChild.__h=stepCap(t.s[k]);se.__g=t.s[k];se.title=words(t.s[k]);
      if(live&&!j&&t.p===LIVE.pl){se.classList.add('new');fresh.push({se,g:t.s[k]});}}
    el.__end=!!t.end;
  });
  // the newest turn sets the list's height (one full turn at least): watch its size
  const first=list.firstElementChild;if(first!==firstObs){if(firstObs)ro.unobserve(firstObs);if(first)ro.observe(first);firstObs=first;}
  if(want.length<all.length&&moreKey!==limit){moreKey=limit;after(more);} // (room for more turns than are drawn: draw more)
  if(fresh.length){const fl=inSide()?[]:LIVE.fly,box=fresh[0].se.parentNode;after(()=>{box.scrollLeft=box.scrollWidth;if(fl.length)flyIn(fresh,fl);});} // (a row too narrow to wrap scrolls to its newest step; nothing flies outside the game area)
  LIVE.fly=[];
}
export const feedPart = { name: 'feed', update, reset(){liveReset();HOVER=hoverEl=null;limit=FIRST;moreKey=0;$('#histList').innerHTML='';firstObs&&ro.unobserve(firstObs);firstObs=null;}};
/* cards fly into the panel: out of the player's chip (from their hand) or out of the market (a card they bought or took) */
function flyIn(fresh,fl){
  const lr=$('#histList').getBoundingClientRect();
  const take=kind=>{const i=fl.findIndex(f=>f.kind===kind);return i<0?null:fl.splice(i,1)[0];};
  for(const{se,g}of fresh){
    if(g.ts&&g.ts.length){const f=take('hand');if(f)flyTo([...se.querySelectorAll('.fcs .fc')],f,lr);}
    if(g.got){const f=take('got');if(f)flyTo([...se.querySelectorAll('.fc.got')],f,lr);}
  }
}
function flyTo(els,fl,lr){
  if(!fl.from||!fl.from.width)return;
  els.forEach((tEl,i)=>{
    const to=tEl.getBoundingClientRect();if(!to.width||to.top>=lr.bottom||to.bottom<=lr.top)return; // (scrolled out of view: nothing to fly to)
    const el=document.createElement('div');el.className='card fly';el.innerHTML=cardHTML(tEl.dataset.t);$('#cards').appendChild(el);
    const fr=fl.kind==='hand'?{left:fl.from.left+fl.from.width/2-to.width*.4,top:fl.from.top+fl.from.height/2-to.height*.4,width:to.width*.8,height:to.height*.8}:fl.from;
    const [x0,y0,,s0]=rectT(fr,0),[x1,y1,,s1]=rectT(to,0),T=(x,y,r,s)=>`translate3d(${x}px,${y}px,0) rotate(${r}deg) scale(${s})`;
    tEl.style.opacity=0;
    const a=el.animate([{transform:T(x0,y0,fl.kind==='hand'?-8:0,s0),opacity:fl.kind==='hand'?0:1},{transform:T(x1,y1,0,s1),opacity:1}],
      {duration:fl.kind==='got'?550:400,delay:i*70,easing:EASE,fill:'both'});
    const done=()=>{tEl.style.opacity='';el.remove();};a.finished.then(done,done);
  });
}

/* ---------- placing it (from the ResizeObserver, where reading sizes is free, and from drags) ---------- */
// (only the newest turn is watched, and its callback changes nothing that can resize that turn: the list's height and
// where the panel floats, not its width; otherwise it would be a resize loop)
const ro=new ResizeObserver(()=>place(true));
let row2=64; // where the top bar ends (a floating panel stays below it; measured with the rest of the geometry)
/* docked left it lives in its own grid cell (#lside) beside the game; otherwise over the game area (#app) */
function sync(on){
  const H=$('#hist'),side=inSide(),home=side?$('#lside'):$('#app');
  if(H.parentNode!==home)home.appendChild(H);
  H.classList.toggle('side',side);const ls=$('#lside');if(ls.hidden!==!(side&&on))ls.hidden=!(side&&on);
}
/* its spot under the prompt: centred in the same band, just below it (the prompt is hidden in replays: under the top bar) */
function homeTop(){return geo.promptBottom?geo.promptBottom+8:null;}
/* sizeOnly (the newest turn changed size): only the list's height and where a floating panel sits, nothing that changes its width */
function place(sizeOnly){
  const H=$('#hist');if(H.hidden)return;
  const list=$('#histList'),first=list.firstElementChild,a=geo.app;
  if(inSide()&&sizeOnly){more();return;}
  if(inSide()){ // a column of its own: full height, the list scrolls
    for(const k of['top','width','transform','--mktClear'])setStyle(H,k,'');setStyle(list,'height','');setStyle($('#lside'),'width',Math.round(P.sw)+'px');
    H.classList.remove('free');$('#histHome').hidden=false;more();return;}
  if(!sizeOnly)H.classList.toggle('free',!isHome());
  // under the prompt its band stays clear of the market column; when the market is a row of cards ending about where the
  // panel starts, or leaves too narrow a band beside it (small phones), the panel goes just below it and takes the whole width
  let top=isHome()?(homeTop()??row2):0,clear=false;
  if(isHome()){const m=$('#mkt'),on=!m.classList.contains('hid')&&!m.classList.contains('cramped'),mr=on?m.getBoundingClientRect():null;
    if(mr&&(mr.bottom-a.top<top+40||mr.left-a.left<250)){top=Math.max(top,Math.round(mr.bottom-a.top+5));clear=true;}}
  setStyle(H,'top',isHome()&&(homeTop()!=null||clear)?top+'px':'');if(!sizeOnly)setStyle(H,'--mktClear',clear?'16px':'');
  if(!sizeOnly){const w=DRAG.w??P.w;setStyle(H,'width',w?Math.round(w)+'px':'');}
  // the list: one full turn at least (the newest), as tall as it was made (or one turn), never past the bottom of the game area
  const one=first?first.offsetHeight:0,room=a.height-(isHome()?top:4)-12;
  const lh=Math.max(one,Math.min(DRAG.h??P.h??one,room));setStyle(list,'height',lh+'px');
  if(!isHome()){ // floating: kept inside the game area
    const W=H.offsetWidth,Ht=H.offsetHeight;
    const x=DRAG.x??P.fx*(a.width-W),y=DRAG.y??P.fy*(a.height-Ht);
    setStyle(H,'transform',`translate3d(${Math.round(clamp(x,4,a.width-W-4))}px,${Math.round(clamp(y,row2-6,Math.max(row2-6,a.height-Ht-4)))}px,0)`);
  }else setStyle(H,'transform','');
  $('#histHome').hidden=isHome()&&P.w==null&&P.h==null;
  more();
}
/* where it sits under the prompt, in game-area coordinates (for dropping it back there) */
function homeSpot(w){const a=$('#app').getBoundingClientRect(),pr=$('#prompt').getBoundingClientRect(),hid=!pr.height;
  return{x:(hid?a.width/2:pr.left+pr.width/2-a.left)-w/2,y:hid?64:pr.bottom-a.top+8};}
/* a dashed outline where it will go (the left column), or the column's new width while it is resized */
function guide(w){const g=$('#histGuide');if(w==null){g.hidden=true;return;}g.hidden=false;g.style.width=Math.round(w)+'px';}
/* pointer drag helper: start(e) → {move(ev), end()}, or nothing to ignore the press */
function dragWith(el,start){
  el.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('button')||e.target.closest('.hsize')&&el!==e.target.closest('.hsize'))return;
    const h=start(e);if(!h)return;e.preventDefault();el.setPointerCapture(e.pointerId);
    const mv=ev=>h.move(ev),up=()=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);h.end();};
    el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  });
}
const fracs=(x,y,W,Ht,a)=>{P.fx=a.width>W+8?clamp(x/(a.width-W),0,1):0;P.fy=a.height>Ht+8?clamp(y/(a.height-Ht),0,1):0;};
export function histShow(on){P.hide=!on;saveP();render();}
export function histInit(){
  const H=$('#hist'),L=$('#histList');L.addEventListener('scroll',more,{passive:true});
  // a step pointed at: its moves on the board (its words are its tooltip); on a touch screen a tap shows both
  L.addEventListener('pointerover',e=>{if(e.pointerType==='mouse')hoverStep(e.target.closest('.hsteps .fg'));});
  L.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&HOVER)hoverStep(null);});
  L.addEventListener('click',e=>{const se=e.target.closest('.hsteps .fg');if(!se||matchMedia('(hover:hover)').matches)return;
    if(hoverEl===se){hoverStep(null);return;}hoverStep(se);toast(se.title,3200);});onGeo(()=>{row2=parseFloat(getComputedStyle($('#app')).getPropertyValue('--row2'))||64;setStyle(H,'--actFoot',(geo.actW?geo.actW+26:16)+'px');place();});
  wide.addEventListener('change',()=>{sync(!H.hidden);place();render();});
  $('#histBtn').onclick=()=>{if(!smallReplay()){histShow(P.hide);return;}
    if(shown())replayOpen=null;else{replayOpen=G.replay;if(P.hide)P.hide=false,saveP();}render();};
  $('#histX').onclick=()=>{if(smallReplay()){replayOpen=null;render();}else histShow(false);};
  $('#histHome').onclick=()=>{P.fx=P.fy=P.w=P.h=P.dock=null;saveP();sync(true);place();render();};
  // move: drag the bar. Let go near its spot under the prompt and it goes back there; at the left edge of a large screen it
  // becomes a full-height column there (dragged out again, it floats)
  dragWith(H.querySelector('.hbar'),e=>{
    const r0=H.getBoundingClientRect(),w0=P.w;let off={x:e.clientX-r0.left,y:e.clientY-r0.top},x0=e.clientX,y0=e.clientY,moved=false,snap=null;
    return{move(ev){
      if(!moved){if(Math.hypot(ev.clientX-x0,ev.clientY-y0)<4)return;moved=true;H.classList.add('dragging');
        if(inSide()){const w=Math.min(r0.width,420);P.w=Math.round(w);off={x:Math.min(off.x,w-13),y:Math.min(off.y,40)};P.dock=null;} // out of the column: it floats, holding on where it was grabbed
        else if(isHome()&&P.w==null)P.w=Math.round(r0.width); // (it keeps the width it had)
        P.fx=P.fx??0;P.fy=P.fy??0;sync(true);}
      const a=$('#app').getBoundingClientRect(),W=H.offsetWidth,Ht=H.offsetHeight;
      DRAG.x=clamp(ev.clientX-off.x-a.left,4,a.width-W-4);DRAG.y=clamp(ev.clientY-off.y-a.top,row2-6,Math.max(row2-6,a.height-Ht-4));
      const hs=homeSpot(W);snap=wide.matches&&ev.clientX<60?'left':Math.abs(DRAG.x-hs.x)<36&&Math.abs(DRAG.y-hs.y)<28?'home':null;
      H.classList.toggle('snap',snap==='home');guide(snap==='left'?P.sw:null);place();},
    end(){guide(null);if(!moved)return;H.classList.remove('dragging','snap');
      if(snap==='left'){P.dock='left';P.fx=P.fy=null;P.w=w0;}
      else if(snap==='home'){P.fx=P.fy=null;P.w=w0;}
      else fracs(DRAG.x,DRAG.y,H.offsetWidth,H.offsetHeight,$('#app').getBoundingClientRect());
      DRAG.x=DRAG.y=null;saveP();sync(true);place();render();}};
  });
  // resize: drag the corner (under the prompt it stays centred, so the width grows on both sides). In the left column: its width
  dragWith($('#histSize'),e=>{
    const b=H.getBoundingClientRect(),a=$('#app').getBoundingClientRect(),x0=e.clientX,y0=e.clientY;H.classList.add('dragging');
    if(inSide()){let w=P.sw;return{move(ev){w=clamp(P.sw+ev.clientX-x0,260,Math.min(640,innerWidth*.45));guide(w);},end(){guide(null);H.classList.remove('dragging');P.sw=Math.round(w);saveP();place();}};}
    const lh=$('#histList').offsetHeight,home=isHome(),maxW=home?a.width-8:a.right-b.left-4;
    if(!home){DRAG.x=b.left-a.left;DRAG.y=b.top-a.top;}
    return{move(ev){const dx=ev.clientX-x0;DRAG.w=clamp(b.width+(home?2*dx:dx),220,maxW);DRAG.h=Math.max(0,lh+ev.clientY-y0);place();},
      end(){H.classList.remove('dragging');if(DRAG.w!=null){const list=$('#histList'),one=list.firstElementChild?list.firstElementChild.offsetHeight:0;
        P.w=Math.round(H.offsetWidth);P.h=DRAG.h>one+4?Math.round(list.offsetHeight):null; // (made as small as it gets: one turn, whatever its height)
        if(!home)fracs(DRAG.x,DRAG.y,H.offsetWidth,H.offsetHeight,a);}
        DRAG.x=DRAG.y=DRAG.w=DRAG.h=null;saveP();place();}};
  });
}

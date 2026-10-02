/* The history: what happened, turn by turn, as the cards played (the same card faces as your own hand) with a caption per
   step. Three ways to show it, cycled by the History button (kept on this device):
   - 'center': the latest turn, in a row of cards under the prompt. What an AI or an online opponent plays, spends, buys
     and removes appears as they do it: played cards fly out of their player chip, a bought card flies out of the market,
     and their moves leave a dotted trail on the board. After their turn the row stays as a recap until you act; from
     then on it shows your own turn so far (the newest turn in the journal, as at the top of the column).
   - 'left': every turn the game's journal keeps (S.log), newest first, in a column of its own left of the game (under it
     on a portrait phone); the newest turn is at the top and grows as it is played.
   - 'off': neither.
   Pointing at a step (tapping it on a touch screen) says in words everything it did and shows on the board where its
   explorer went. Public information only: the engine's events carry the types of cards that became public (played, spent,
   removed, taken) and just counts for the cards kept at the end of a turn. */
import { CT, SYMNAME, plural, fmt, assert } from '../engine.gen.js';
import { $, esc, setHTML, reduceMotion } from './dom.js';
import { S, MAP, NET, G, online, isAI, passing } from './state.js';
import { toast } from './dialogs.js';
import { render, after } from './frame.js';
import { cardHTML } from './cards.js';
import { flyInto } from './hand.js';
import { marketRectOf } from './market.js';
import { setTrail } from './board/overlays.js';
import { load, store } from './store.js';
import { expectLayout, CHECKS } from './debug.js';
import { geo } from './geometry.js';
/* whose turns are watched as they're played (their cards fly into the row, their moves leave a trail): the AIs (local),
   everyone but me (online); never in replays, where the actor's own hand is shown */
export function feedWatch(pl){if(G.replay||pl==null)return false;return online()?pl!==NET.seat:isAI(pl);}
function chipRect(pl){const c=document.querySelectorAll('#players .pchip')[pl];return c?c.getBoundingClientRect():null;}
/* the row's state: which turn it shows (null: nothing drawn yet, so a page that opens on a turn doesn't replay its flies) */
const ROW={key:null};
function rowReset(){ROW.key=null;}
/* the recap's size (owner, 2026-10-01): room for six cards side by side, which most turns don't fill; a turn with more
   goes on to a second line below, so a card already shown never moves. The prompt is sized to this row, not to the
   screen. Checked whenever the row changes (a measurement, so after the update) */
function checkSize(F){
  const card=F.querySelector('.fc');if(!card)return;
  const six=6*card.offsetWidth+5*12,row=F.firstElementChild.offsetWidth,box=$('#prompt').offsetWidth;
  assert(row<=six+2,'view: the recap is no wider than six cards side by side');
  assert(box<=six+32,'view: the prompt is sized to the recap (six cards), not to the screen');
  let h=0;for(const g of F.firstElementChild.children){const gh=g.offsetHeight;if(!g.classList.contains('fend'))assert(!h||gh===h,'view: every recap step is one height (a line never grows when a step joins it)');if(!g.classList.contains('fend'))h=gh;}
}
/* a step's caption: only what its cards don't show (owner: the card's name and effect are on its face; wide captions pushed
   steps out of the row). Pointing at the step says everything in words. */
/* (its words in one span: the caption box is a flex box, where bare text beside an element is its own item and loses the
   space between them: "1space") */
const feedCap=g=>{const c=capWords(g);return c?`<span>${c}</span>`:'';};
function capWords(g){
  const mark=g.arr?'<b>El Dorado</b>':g.bl?`blockade <b>${g.bl}</b>`:'';
  switch(g.k){
    case 'move':case 'native':return mark||(g.n?`<b>${g.n}</b> ${g.n===1?'space':'spaces'}`:'');
    case 'blr':return mark;
    case 'rubble':return'rubble';
    case 'camp':return'base camp';
    case 'trash':return'removed';
    case 'end':return'discarded';
  }
  return'';
}
/* one step: its cards and caption. attr: what finds it again (the row: data-g; the column: data-s); its words are its tooltip */
const PILL={timeout:'Out of time',resign:'Left the game',endgame:'Ended the game'};
function stepHTML(g,attr,pl){
  const tip=` title="${esc(stepWords(g,pl))}"`;
  if(PILL[g.k])return`<div class="fg fend f-${g.k}" ${attr}${tip}><div class="fpill">${PILL[g.k]}</div><div class="fcap"></div></div>`;
  const mini=(t,got)=>`<div class="fc${got?' got':''}" data-t="${t}"><div class="mcard">${cardHTML(t)}</div></div>`;
  return`<div class="fg f-${g.k}" ${attr}${tip}><div class="frc"><div class="fcs">${g.ts.map(t=>mini(t)).join('')}</div>${g.got?`<span class="farr" aria-hidden="true">›</span>${mini(g.got,1)}`:''}</div><div class="fcap"></div></div>`; // (the caption: written by stepsInto, its one writer)
}
/* what makes a drawn step out of date: a move that went further, a blockade taken, an arrival */
const stepSig=g=>`${g.n||0}|${g.bl||''}|${g.arr?1:0}|${g.log.length}`;
/* the steps of turn t in box, one element per step (data-s="turn|index"), updated in place: a new step is added, a step
   that changed gets its caption and words again, and nothing else is written (the row and the column both use this, in
   the order played: a new step goes at the end, so no step already shown moves). Returns the elements added. */
function stepsInto(box,t){
  const pl=S.players[t.pl],added=[];
  for(const el of[...box.children]){const[k,i]=(el.dataset.s||'').split('|');if(k!==t.key||+i>=t.steps.length)el.remove();}
  t.steps.forEach((g,i)=>{const key=t.key+'|'+i,v=stepSig(g);let el=box.querySelector(`[data-s="${key}"]`);
    if(!el){box.insertAdjacentHTML('beforeend',stepHTML(g,`data-s="${key}"`,pl));el=box.lastElementChild;el.dataset.v=v;setHTML(el.querySelector('.fcap'),feedCap(g));added.push({el,g});}
    else if(el.dataset.v!==v){el.dataset.v=v;setHTML(el.querySelector('.fcap'),feedCap(g));el.title=stepWords(g,pl);}});
  return added;
}
/* ---------- a step in words: its journal entries (the play, and the blockade taken or El Dorado reached) ---------- */
function logLine(e){
  const n=CT[e.ts?.[0]]?.n,cards=k=>plural(k,'card'),names=ts=>ts.map(t=>CT[t].n).join(', ');
  switch(e.e){
    case 'start':return`The expedition sets out: ${S.players.map(p=>p.name).join(', ')}. Course: ${MAP.name} (${[...MAP.route,'El Dorado'].join(' · ')}).`;
    case 'play':switch(e.k){
      case 'move':return e.n?`moves ${plural(e.n,'space')} with ${n}${CT[e.ts[0]].s==='*'?` (as ${SYMNAME[e.sym]})`:''}.`:`plays ${n}.`;
      case 'native':return e.n?'plays the Native and moves to an adjacent space.':'plays the Native to tear down a blockade.';
      case 'blr':return`discards ${cards(e.ts.length)} to clear the blockade: ${names(e.ts)}.`;
      case 'rubble':return`discards ${cards(e.ts.length)} to cross rubble: ${names(e.ts)}.`;
      case 'camp':return`removes ${cards(e.ts.length)} from the game to enter a base camp: ${names(e.ts)}.`;
      case 'action':return`plays ${n} and draws ${cards(e.n)}.`;
      case 'trash':return`removes ${names(e.ts)} from the game.`;
      case 'transmit':return`uses the Transmitter to take ${CT[e.got].n}.`;
      case 'buy':return`buys ${CT[e.got].n} for ${fmt(e.paid)} coin${e.paid===1?'':'s'}, paying with ${names(e.ts)}.`;
      case 'end':return`ends the turn${e.disc?', discarding '+names(e.ts):''}${e.kept?(e.disc?' and':'')+' keeping '+plural(e.kept,'card'):''}.`;
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
const stepWords=(g,pl)=>pl.name+' '+g.log.map(logLine).join(' ');

/* ---------- the journal (S.log) in turns, oldest first ----------
   A turn: {key ('round:seat'), pl, r, steps, done}; a step is a 'play' entry with what followed it (bl: the blockade taken,
   arr: reached El Dorado, paths: where the explorer went, log: its entries). Running out of time, leaving and ending the
   game are steps of their own; the game's own entries (start, final round, result) are rows of words ({key, sys}). */
function turnsOf(log){
  const T=[];let t=null;
  for(const e of log){
    if(e.pl==null){T.push({key:e.e,sys:e});continue;}
    if(e.e==='resign'&&!(t&&t.pl===e.pl&&!t.done)){T.push({key:`${e.r}:${e.pl}:left`,pl:e.pl,r:e.r,steps:[{k:'resign',log:[e],paths:[]}],done:true});continue;} // (online: out of turn)
    if(!t||t.pl!==e.pl||t.done){t={key:`${e.r}:${e.pl}`,pl:e.pl,r:e.r,steps:[]};T.push(t);}
    const st=t.steps[t.steps.length-1];
    if(e.e==='play'){
      if(e.k==='move'&&e.more&&st&&st.k==='move'){st.n+=e.n;st.log.push(e);continue;} // leftover strength: the same step goes further
      if(e.k==='trash'&&!e.ts.length)continue;
      if(e.k==='end'){t.done=true;if(!e.ts.length)continue;} // (a step only for the cards discarded, face up)
      t.steps.push({...e,log:[e],paths:[]});continue;}
    if(e.e==='timeout'||e.e==='resign'||e.e==='endgame'){t.steps.push({k:e.e,log:[e],paths:[]});if(e.e==='resign')t.done=true;continue;}
    if(!st)continue; // (the journal keeps its last entries only: this step's start is gone)
    if(e.e==='move')st.paths.push(e.path);else{st.log.push(e);if(e.e==='block')st.bl=e.n;else if(e.e==='arrive')st.arr=true;}
  }
  return T;
}

/* ---------- which of the three ways it shows (the History button cycles them) ---------- */
const MODES=['center','left','off'];
let MODE=MODES.includes(load('history'))?load('history'):'center';
function histCycle(){expectLayout();MODE=MODES[(MODES.indexOf(MODE)+1)%3];store('history',MODE);HOVER=null;render();}

/* ---------- a step pointed at (or tapped): its explorer's path on the board, instead of the live trail ---------- */
let HOVER=null; // {el, paths, color}
function stepOf(el){
  const[k,i]=el.dataset.s.split('|'),t=COL.turns.get(k)||(LATEST&&LATEST.key===k?LATEST:null);return t&&{g:t.steps[+i],pl:t.pl};
}
function point(el){
  if((HOVER&&HOVER.el)===el)return;
  const s=el&&stepOf(el);HOVER=s?{el,paths:s.g.paths,color:S.players[s.pl].color}:null;render();
}
export function histInit(){
  for(const box of[$('#feed'),$('#lside')]){
    box.addEventListener('pointerover',e=>{if(e.pointerType==='mouse')point(e.target.closest('.fg'));});
    box.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')point(null);});
    box.addEventListener('click',e=>{const el=e.target.closest('.fg');if(!el||matchMedia('(hover:hover)').matches)return; // touch: a tap says it and shows it
      if(HOVER&&HOVER.el===el){point(null);return;}point(el);toast(el.title,3200);});
  }
  $('#histBtn').onclick=histCycle;
}

/* ---------- the column: every turn in the journal, newest first ---------- */
const COL={turns:new Map(),sig:null};
function turnHead(t){const p=S.players[t.pl];
  return`<div class="hwho"><i style="background:${p.color}"></i><b>${esc(p.name)}</b>${online()&&t.pl===NET.seat?'<span>(you)</span>':''}<span class="hr">Round ${t.r}</span>${!t.done&&S.cur===t.pl&&!S.over?'<span class="hnow">playing…</span>':''}</div>`;}
function columnUpdate(){
  const L=$('#lside'),on=!!S&&MODE==='left';
  if(L.hidden!==!on)L.hidden=!on;
  if(!on){COL.sig=null;return;}
  const last=S.log[S.log.length-1],sig=[S.log.length,last&&last.e,last&&last.k,last&&last.r,S.cur,S.over,S.seed,online()&&NET.seat].join('|');
  if(COL.sig===sig&&L.firstElementChild)return;COL.sig=sig; // (nothing new in the journal)
  if(!L.firstElementChild){L.innerHTML='<h2 class="hh">History <span>newest first</span><button class="hx" aria-label="Hide the history" title="Hide the history">✕</button></h2><div class="hlist"></div>';L.querySelector('.hx').onclick=histCycle;}
  const list=L.lastElementChild,T=turnsOf(S.log).reverse();COL.turns=new Map(T.filter(t=>!t.sys).map(t=>[t.key,t]));
  const now=`${S.round}:${S.cur}`;if(!S.over&&!COL.turns.has(now))T.unshift({key:now,pl:S.cur,r:S.round,steps:[]}); // the turn just begun: its heading is there before its first card
  if(!T.length){setHTML(list,'<p class="hnone">Nothing has happened yet.</p>');return;}
  const have=new Map([...list.children].map(el=>[el.dataset.k,el])),keys=new Set(T.map(t=>t.key));
  for(const [k,el] of have)if(!keys.has(k))el.remove();
  let prev=null;
  for(const t of T){let el=have.get(t.key);
    if(!el){el=document.createElement('div');el.className='ht'+(t.sys?' sys':'');el.dataset.k=t.key;}
    const at=prev?prev.nextElementSibling:list.firstElementChild;if(at!==el)list.insertBefore(el,at);prev=el;
    if(t.sys){setHTML(el,esc(logLine(t.sys)));continue;}
    if(!el.firstElementChild)el.innerHTML='<div class="hwhead"></div><div class="hsteps"></div>';
    setHTML(el.firstElementChild,turnHead(t));stepsInto(el.lastElementChild,t); // (a turn's steps are added in place as it's played)
  }
}
function update(){
  const F=$('#feed'),hide=()=>{if(!F.hidden){F.hidden=true;F.innerHTML='';rowReset();}};
  columnUpdate();
  const btn=$('#histBtn');if(btn.dataset.m!==MODE){btn.dataset.m=MODE;btn.className='tbtn glass m-'+MODE; // (which of the three it is now, and what a press does)
    btn.title=({center:'History: under the prompt. Press for every turn on the left',left:'History: every turn, on the left. Press to hide it',off:'History: hidden. Press to show it under the prompt'})[MODE];}
  if(!S){hide();setTrail([],'');return;}
  // the newest turn in the journal: an opponent's as they play it, kept as a recap until you act, then your own
  const t=LATEST=turnsOf(S.log).filter(t=>!t.sys).pop()||null,watched=!!t&&feedWatch(t.pl);
  if(HOVER&&!HOVER.el.isConnected)HOVER=null; // (the step pointed at is gone)
  if(HOVER)setTrail(HOVER.paths,HOVER.color);else setTrail(watched&&MODE!=='off'?t.steps.flatMap(g=>g.paths):[],t?S.players[t.pl].color:'');
  if(G.replay||passing()||MODE!=='center'||!geo.recapFits){hide();return;} // (no room for six cards: owner, 2026-10-01, hidden rather than squeezed)
  if(!F.firstElementChild)F.innerHTML='<div class="frow"></div>'; // (nothing played yet: the row keeps its place, so the box doesn't change size)
  const row=F.firstElementChild;
  if(!t){for(const el of[...row.children])el.remove();}
  else{const was=ROW.key,added=stepsInto(row,t);ROW.key=t.key;
    // a watched player's new steps fly in (out of their chip; a card bought or taken, out of the market), not a turn the page opened on
    const fly=watched&&was!==null&&added.length&&!reduceMotion;if(fly)for(const a of added)a.el.classList.add('new');
    if(added.length)after(()=>{if(CHECKS)checkSize(F);if(fly)feedFly(added,t.pl);});}
  F.hidden=false;
}
/* the newest turn on show in the row (for pointing at its steps) */
let LATEST=null;
export const feedPart = { name: 'feed', update,reset:rowReset};
/* cards fly into the row: out of the player's chip (from their hand) or out of the market (a card they bought or took) */
function feedFly(added,pl){
  for(const {el:gel,g} of added){const flies=[];
    if(g.ts&&g.ts.length)flies.push({kind:'hand',from:chipRect(pl)});
    if(g.got)flies.push({kind:'got',from:marketRectOf(g.got)});
    for(const fl of flies){if(!gel.isConnected||!fl.from||!fl.from.width)continue;
    [...gel.querySelectorAll(fl.kind==='got'?'.fc.got':'.fcs .fc')].forEach((tEl,i)=>{
      // (from a chip: the card comes out of its middle, a little smaller, tilted and fading in)
      const fr=fl.kind==='hand'?{left:fl.from.left+fl.from.width/2-tEl.offsetWidth*.4,top:fl.from.top+fl.from.height/2-tEl.offsetHeight*.4,width:tEl.offsetWidth*.8,height:tEl.offsetHeight*.8}:fl.from;
      tEl.style.opacity=0; // (its place in the row is kept; the card shows once its copy lands there)
      flyInto(tEl.dataset.t,fr,tEl,()=>{tEl.style.opacity='';},{duration:fl.kind==='got'?550:400,delay:i*70,tilt:fl.kind==='hand'?-8:0,fade:fl.kind==='hand'});
    });}
  }
}

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
import { $, esc, setHTML, reduceMotion, EASE } from './dom.js';
import { S, MAP, UI, NET, G, online, isAI } from './state.js';
import { toast } from './dialogs.js';
import { render, after } from './frame.js';
import { cardHTML } from './cards.js';
import { rectT } from './hand.js';
import { marketRectOf } from './market.js';
import { setTrail } from './board/overlays.js';
const FEED={pl:-1,ended:false,groups:[],seq:0,fly:[],trail:[]};
/* whose actions get shown: the AIs (local), everyone but me (online); never in replays, where the actor's own hand is shown */
export function feedWatch(pl){if(G.replay||pl==null)return false;return online()?pl!==NET.seat:isAI(pl);} // (pl: none on the game's end)
function feedReset(){FEED.pl=-1;FEED.ended=false;FEED.groups=[];FEED.fly=[];FEED.trail=[];}
export function feedClear(){if(FEED.pl<0&&!FEED.groups.length)return;feedReset();render();}
function chipRect(pl){const c=document.querySelectorAll('#players .pchip')[pl];return c?c.getBoundingClientRect():null;}
/* one engine event of a watched player (called from playEvents, before render) */
export function feedEvent(e){
  if(e.e==='play'){
    if(FEED.pl!==e.pl||FEED.ended){feedReset();FEED.pl=e.pl;}
    const last=FEED.groups[FEED.groups.length-1];
    if(e.k==='move'&&e.more&&last&&last.k==='move'){last.n+=e.n;last.v++;last.log.push(e);return;} // leftover strength: same card, more spaces
    if(e.k==='trash'&&!e.ts.length)return;
    if(e.k==='end'){FEED.ended=true;if(!e.ts.length)return;} // (the turn is visibly over: a step only for the cards discarded)
    const g={...e,id:++FEED.seq,v:0,log:[e],paths:[]};FEED.groups.push(g);
    if(g.ts&&g.ts.length)FEED.fly.push({gid:g.id,kind:'hand',from:chipRect(e.pl)});
    if(g.got)FEED.fly.push({gid:g.id,kind:'got',from:marketRectOf(g.got)}); // the card bought or taken flies in from the market
    return;}
  if(FEED.pl!==e.pl)return;
  const last=FEED.groups[FEED.groups.length-1];if(!last)return;
  if(e.e==='block'){last.bl=e.n;last.v++;last.log.push(e);}
  else if(e.e==='arrive'){last.arr=true;last.v++;last.log.push(e);}
  else if(e.e==='move'){FEED.trail.push(e.path);last.paths.push(e.path);}
}
/* a step's caption: only what its cards don't show (owner: the card's name and effect are on its face; wide captions pushed
   steps out of the row). Pointing at the step says everything in words. */
function feedCap(g){
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
  return`<div class="fg f-${g.k}" ${attr}${tip}><div class="frc"><div class="fcs">${g.ts.map(t=>mini(t)).join('')}</div>${g.got?`<span class="farr" aria-hidden="true">›</span>${mini(g.got,1)}`:''}</div><div class="fcap">${feedCap(g)}</div></div>`;
}
const feedGroupHTML=g=>stepHTML(g,`data-g="${g.id}"`,S.players[g.pl]);
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
const MODES=['center','left','off'],MODE_KEY='eldorado-hist';
let MODE='center';try{const v=localStorage.getItem(MODE_KEY);if(MODES.includes(v))MODE=v;}catch(e){}
function histCycle(){MODE=MODES[(MODES.indexOf(MODE)+1)%3];try{localStorage.setItem(MODE_KEY,MODE);}catch(e){}HOVER=null;render();}

/* ---------- a step pointed at (or tapped): its explorer's path on the board, instead of the live trail ---------- */
let HOVER=null; // {el, paths, color}
function stepOf(el){
  if(el.dataset.g){const g=FEED.groups.find(x=>String(x.id)===el.dataset.g);return g&&{g,pl:g.pl};}
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
    const pl=t.sys?null:S.players[t.pl];
    setHTML(el,t.sys?esc(logLine(t.sys)):turnHead(t)+`<div class="hsteps">${t.steps.map((g,i)=>stepHTML(g,`data-s="${t.key}|${i}"`,pl)).join('')}</div>`);
  }
}
function update(){
  const F=$('#feed'),hide=()=>{if(!F.hidden){F.hidden=true;F.innerHTML='';F.dataset.pl='';}};
  columnUpdate();
  const btn=$('#histBtn');if(btn.dataset.m!==MODE){btn.dataset.m=MODE;btn.className='tbtn glass m-'+MODE; // (which of the three it is now, and what a press does)
    btn.title=({center:'History: under the prompt. Press for every turn on the left',left:'History: every turn, on the left. Press to hide it',off:'History: hidden. Press to show it under the prompt'})[MODE];}
  if(!S){hide();return;}
  const p=S.players[FEED.pl]; // (none while nobody's turn is shown)
  if(HOVER&&!HOVER.el.isConnected)HOVER=null; // (the step pointed at is gone)
  if(HOVER)setTrail(HOVER.paths,HOVER.color);else setTrail(p&&!G.replay&&MODE!=='off'?FEED.trail:[],p?p.color:'');
  if(G.replay||UI.cover||MODE!=='center'){hide();return;}
  if(!FEED.groups.length||!p){latestUpdate(F,hide);return;}
  if(F.dataset.pl!==String(FEED.pl)){F.innerHTML='<div class="frow"></div>';F.dataset.pl=FEED.pl;} // (no name: whose turn it is shows in the chips and the prompt)
  // newest first in the row (it runs right to left and wraps: steps that don't fit drop out whole, never half a card)
  const row=F.querySelector('.frow'),ids=new Set(FEED.groups.map(g=>String(g.id)));
  for(const el of[...row.children])if(!ids.has(el.dataset.g))el.remove();
  for(const g of FEED.groups){let el=row.querySelector(`[data-g="${g.id}"]`);
    if(!el){row.insertAdjacentHTML('afterbegin',feedGroupHTML(g));el=row.firstElementChild;if(!reduceMotion)el.classList.add('new');el.dataset.v=g.v;}
    else if(el.dataset.v!==String(g.v)){el.dataset.v=g.v;el.querySelector('.fcap').innerHTML=feedCap(g);el.title=stepWords(g,S.players[g.pl]);}}
  F.hidden=false;
  if(FEED.fly.length){const list=FEED.fly;FEED.fly=[];if(!reduceMotion)after(()=>feedFly(list));}
}
/* no one else's turn on show (it is your turn and you have acted): the row shows the newest turn in the journal */
let LATEST=null;
function latestUpdate(F,hide){
  const t=LATEST=turnsOf(S.log).filter(t=>!t.sys).pop();
  if(!t||!t.steps.length){if(F.dataset.pl!=='none'){F.innerHTML='<div class="frow"></div>';F.dataset.pl='none';}F.hidden=false;return;} // (nothing played yet: the row keeps its place, so the box doesn't change size)
  const pl=S.players[t.pl],id='t'+t.key;
  if(F.dataset.pl!==id){F.innerHTML='<div class="frow"></div>';F.dataset.pl=id;}
  setHTML(F.querySelector('.frow'),t.steps.map((g,i)=>stepHTML(g,`data-s="${t.key}|${i}"`,pl)).reverse().join('')); // (newest first, as above)
  F.hidden=false;
}
export const feedPart = { name: 'feed', update,reset:feedReset};
/* cards fly into the row: out of the player's chip (from their hand) or out of the market (a card they bought or took) */
function feedFly(list){
  for(const fl of list){
    const gel=document.querySelector(`#feed [data-g="${fl.gid}"]`);if(!gel||!fl.from||!fl.from.width)continue;
    [...gel.querySelectorAll(fl.kind==='got'?'.fc.got':'.fcs .fc')].forEach((tEl,i)=>{
      const to=tEl.getBoundingClientRect();if(!to.width||to.top>=gel.parentNode.getBoundingClientRect().bottom)return; // (a step that dropped out of the row: nothing to fly to)
      const el=document.createElement('div');el.className='card fly';el.innerHTML=cardHTML(tEl.dataset.t);$('#cards').appendChild(el);
      const fr=fl.kind==='hand'?{left:fl.from.left+fl.from.width/2-to.width*.4,top:fl.from.top+fl.from.height/2-to.height*.4,width:to.width*.8,height:to.height*.8}:fl.from;
      const [x0,y0,,s0]=rectT(fr,0),[x1,y1,,s1]=rectT(to,0),T=(x,y,r,s)=>`translate3d(${x}px,${y}px,0) rotate(${r}deg) scale(${s})`;
      tEl.style.opacity=0;
      const a=el.animate([{transform:T(x0,y0,fl.kind==='hand'?-8:0,s0),opacity:fl.kind==='hand'?0:1},{transform:T(x1,y1,0,s1),opacity:1}],
        {duration:fl.kind==='got'?550:400,delay:i*70,easing:EASE,fill:'both'});
      const done=()=>{tEl.style.opacity='';el.remove();};a.finished.then(done,done);
    });
  }
}

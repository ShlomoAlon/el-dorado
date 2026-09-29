/* Other players' turns. What an AI or an online opponent plays, spends, buys and removes is shown in a row of small
   cards under the prompt (the same card faces as your own hand), with a caption per step; played cards fly out of their
   player chip, a bought card flies out of the market, and their moves leave a dotted trail on the board. After their
   turn the row stays as a recap until you act. Public information only: the engine's 'play' events carry the types of
   cards that became public (played, spent, removed, taken) and just counts for the cards kept at the end of a turn. */
import { S, CT, fmt } from '../engine.gen.js';
import { $, esc, setHTML, reduceMotion, EASE } from './dom.js';
import { UI, NET, G, online, isAI } from './state.js';
import { render, after } from './frame.js';
import { cardHTML, cardTitle } from './cards.js';
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
    if(e.k==='move'&&e.more&&last&&last.k==='move'){last.n+=e.n;last.v++;return;} // leftover strength: same card, more spaces
    if(e.k==='trash'&&!e.ts.length)return;
    if(e.k==='end')FEED.ended=true;
    const g={...e,id:++FEED.seq,v:0};FEED.groups.push(g);
    if(g.ts&&g.ts.length)FEED.fly.push({gid:g.id,kind:'hand',from:chipRect(e.pl)});
    if(g.got)FEED.fly.push({gid:g.id,kind:'got',from:marketRectOf(g.got)}); // the card bought or taken flies in from the market
    return;}
  if(FEED.pl!==e.pl)return;
  const last=FEED.groups[FEED.groups.length-1];if(!last)return;
  if(e.e==='block'){last.bl=e.n;last.v++;}
  else if(e.e==='arrive'){last.arr=true;last.v++;}
  else if(e.e==='move')FEED.trail.push(e.path);
}
function feedCap(g){
  const one=g.ts&&g.ts.length===1?CT[g.ts[0]].n:'',bl=g.bl?` · blockade #${g.bl}`:'',arr=g.arr?' · <b>El Dorado</b>':'';
  switch(g.k){
    case 'move':return`${esc(one)} · <b>${g.n}</b> ${g.n===1?'space':'spaces'}`+bl+arr;
    case 'native':return(g.n?'Native · <b>1</b> space':'Native')+bl+arr;
    case 'rubble':return`Discarded <b>${g.ts.length}</b> · rubble`;
    case 'camp':return`Removed <b>${g.ts.length}</b> · base camp`;
    case 'blr':return`Discarded <b>${g.ts.length}</b>`+bl;
    case 'action':return`${esc(one)} · drew <b>${g.n}</b>`;
    case 'trash':return`Removed <b>${g.ts.length}</b> from the game`;
    case 'transmit':return`Took <b>${esc(CT[g.got].n)}</b>`;
    case 'buy':return`Bought <b>${esc(CT[g.got].n)}</b> for ${fmt(g.paid)}`;
  }
  return'';
}
function feedGroupHTML(g){
  if(g.k==='end')return`<div class="fg fend" data-g="${g.id}"><div class="fpill">Ended turn</div><div class="fcap">${g.kept?`kept <b>${g.kept}</b>`:'kept none'}${g.disc?` · discarded ${g.disc}`:''}</div></div>`;
  const mini=(t,got)=>`<div class="fc${got?' got':''}" data-t="${t}" title="${esc(cardTitle(t))}"><div class="mcard">${cardHTML(t)}</div></div>`;
  return`<div class="fg f-${g.k}" data-g="${g.id}"><div class="frc"><div class="fcs">${g.ts.map(t=>mini(t)).join('')}</div>${g.got?`<span class="farr" aria-hidden="true">›</span>${mini(g.got,1)}`:''}</div><div class="fcap">${feedCap(g)}</div></div>`;
}
function update(){
  const F=$('#feed'),hide=()=>{if(!F.hidden){F.hidden=true;F.innerHTML='';F.dataset.pl='';}};
  if(!S){hide();return;}
  const p=S.players[FEED.pl]; // (none while nobody's turn is shown)
  setTrail(p&&!G.replay?FEED.trail:[],p?p.color:'');
  if(G.replay||UI.cover||!FEED.groups.length||!p){hide();return;}
  if(F.dataset.pl!==String(FEED.pl)){F.innerHTML='<div class="fwho"></div><div class="frow"></div>';F.dataset.pl=FEED.pl;}
  const recap=S.cur!==FEED.pl||S.over; // their turn is over: say whose turn this was
  const who=F.querySelector('.fwho');setHTML(who,recap?`<i style="background:${p.color}"></i>${esc(p.name)}’s turn`:'');who.hidden=!recap;
  // newest first in the row (it runs right to left and wraps: steps that don't fit drop out whole, never half a card)
  const row=F.querySelector('.frow'),ids=new Set(FEED.groups.map(g=>String(g.id)));
  for(const el of[...row.children])if(!ids.has(el.dataset.g))el.remove();
  for(const g of FEED.groups){let el=row.querySelector(`[data-g="${g.id}"]`);
    if(!el){row.insertAdjacentHTML('afterbegin',feedGroupHTML(g));el=row.firstElementChild;if(!reduceMotion)el.classList.add('new');el.dataset.v=g.v;}
    else if(el.dataset.v!==String(g.v)){el.dataset.v=g.v;el.querySelector('.fcap').innerHTML=feedCap(g);}}
  F.hidden=false;
  if(FEED.fly.length){const list=FEED.fly;FEED.fly=[];if(!reduceMotion)after(()=>feedFly(list));}
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

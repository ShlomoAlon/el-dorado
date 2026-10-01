/* The market: six cards floating at the top right (plus an "All cards" tile), the All cards spread (market and
   reserve), the purchase slot above the hand, and dragging a market card down to buy it. Slots are made once and
   updated in place; a card's artwork is drawn again only when another card takes its slot. */
import { CT, MARKET0, stackOf, reserveOpen, cantBuy, fmt } from '../engine.gen.js';
import { $, setText, setStyle } from './dom.js';
import { S, UI, G, canAct, passing } from './state.js';
import { geo, onGeo } from './geometry.js';
import { cardHTML, cardTitle } from './cards.js';
import { cam, fitSoon } from './board/camera.js';
import { affordable, pickFromMarket, payTotal, cancelMode } from './actions.js';
import { setT, placeAt, buySlotBox } from './hand.js';
import { sfx } from './sound.js';
import { render } from './frame.js';
import { load, store } from './store.js';
import { expectLayout, diag } from './debug.js';

const noMkt=()=>$('#app').classList.toggle('nomkt',!UI.mktOpen||$('#mkt').classList.contains('cramped'));
function setMkt(open){expectLayout();UI.mktOpen=open;$('#mkt').classList.toggle('hid',!open);noMkt();$('#mktBtn').classList.toggle('on',open);store('market',open?'1':'0');
  if(!cam.userZoomed)fitSoon(true);}
/* The All cards spread belongs to the turn and mode it was opened in: a new turn, mode or game, a replay or the menu
   closes it by itself (nothing has to remember to). allFor: where it was opened; it shows while that is still where we are */
const allKey=()=>S&&!S.over&&!G.replay&&!$('#menu').open?`${S.seed}|${S.round}|${S.cur}|${UI.mode}`:null;
export const allShown=()=>UI.allFor!==null&&UI.allFor===allKey();
export function openAll(open){UI.allFor=open?allKey():null;if(open)$('#allc').scrollTop=0;render();}
/* size the market column so it always ends above the turn buttons and the discard pile: smaller cards, and more columns
   when that isn't enough (measured when the game area or the buttons change size, never while updating) */
function sizeMarket(){
  const mk=$('#mkt'),W=geo.app.width,H=geo.app.height,phone=W<600,top=mk.offsetTop,ab=$('#actBtns'),at=geo.app.top;
  let avail=H-(parseFloat(getComputedStyle(ab).bottom)||0)-150-top; // room for up to three stacked buttons below
  if(avail<60)avail=ab.getBoundingClientRect().top-at-top-12; // very short screens: just stay above the current ones
  avail=Math.min(avail,$('#discPile').getBoundingClientRect().top-at-top-10); // and above the discard pile
  const def=phone?44:72,min=phone?34:56,gap=phone?7:10,cg=phone?7:8,n=MARKET0.length+1; // (the market always has its 6 slots, and All cards)
  // every column count against the room below (height) and beside (width: at most ~55% of the game area); the largest cards win
  let pick=null;
  for(let cols=phone?1:2;cols<=n;cols++){const rows=Math.ceil(n/cols),mw=Math.min(def,(avail-(rows-1)*gap-8)/(rows*1.4),(W*.55-(cols-1)*cg)/cols);if(!pick||mw>pick.mw+.5)pick={cols,mw};}
  // no arrangement fits (a tiny game area): the market steps aside; the Market button then opens All cards
  if(mk.classList.contains('cramped')!==pick.mw<min*.8){mk.classList.toggle('cramped',pick.mw<min*.8);noMkt();}
  const mw=Math.max(28,Math.floor(pick.mw));
  if(mk.__p!==pick.cols+'×'+mw){mk.__p=pick.cols+'×'+mw;diag(`market: ${mk.__p} (room ${Math.round(avail)}, area ${Math.round(W)})`);}
  setStyle(mk,'--mw',mw+'px');setStyle($('#market'),'gridTemplateColumns',`repeat(${pick.cols},var(--mw))`);
  if(mk.classList.contains('row')!==(pick.cols>=n))mk.classList.toggle('row',pick.cols>=n); // (one row: its first card grows rightward when under the pointer)
  setStyle($('#app'),'--mktW',(pick.cols*mw+(pick.cols-1)*cg)+'px'); // the market's width, for what must stay clear of it (the prompt)
}
const ALL_ICON='<svg viewBox="-10 -10 20 20"><rect x="-8.5" y="-6.5" width="9" height="13" rx="1.6" fill="currentColor" opacity=".45" transform="rotate(-14)"/><rect x="-4.5" y="-7.5" width="9" height="13" rx="1.6" fill="currentColor" opacity=".7"/><rect x="-.5" y="-6.5" width="9" height="13" rx="1.6" fill="currentColor" transform="rotate(12)"/></svg>';
/* market slots are made once and then updated in place (count, highlight, selection): a card's artwork is drawn again
   only when another card takes its slot (rebuilding every slot on each render re-drew all the art: late pop-ins) */
/* the slots of a market row, one per stack, keyed by what they hold (a card type, or a sold-out slot by its place): a
   slot whose stack is still there keeps its element and only moves, so a stack selling out never redraws the others */
function patchSlots(box,specs,before){
  const have=new Map([...box.children].filter(e=>e.classList.contains('mslot')).map(e=>[e.dataset.k,e]));
  let prev=null;
  specs.forEach((sp,k)=>{const key=sp.n>0?'c:'+sp.t:'e:'+sp.src+k;let el=have.get(key);
    if(el)have.delete(key);
    else{el=document.createElement('div');el.dataset.k=key;
      el.innerHTML=sp.n>0?`<div class="mcard">${cardHTML(sp.t)}</div><span class="cnt"></span>`:`Sold out${sp.src==='m'?'<br>reserve open':''}`;}
    const at=prev?prev.nextSibling:box.firstChild,place=at&&at.classList&&at.classList.contains('mslot')?at:(at||before||null);
    if(el!==place)box.insertBefore(el,place===before?before||null:place);prev=el;
    if(el.className!==sp.cls)el.className=sp.cls;if(el.dataset.i!==String(sp.i))el.dataset.i=sp.i;
    if(sp.n>0){if(el.dataset.src!==sp.src)el.dataset.src=sp.src;const t=cardTitle(sp.t);if(el.title!==t)el.title=t;const c=el.querySelector('.cnt');if(c.textContent!==String(sp.n))c.textContent=sp.n;}
    else delete el.dataset.src;});
  for(const el of have.values())el.remove();
}
function update(){
  const all=allShown(),ac0=$('#allc');if(ac0.hidden===all)ac0.hidden=!all;
  if(!S)return;
  const tr=UI.mode==='transmit',openSlot=reserveOpen(S),aff=new Set(tr?[]:affordable().map(a=>a.src+a.i));
  // a slot is 'no' when the player to act can't buy it now whatever they pay (the engine's rule), 'can' when they can afford it
  const spec=(src,s,i)=>{if(s.n<=0)return{src,i,n:0,cls:'mslot empty'};
    const ok=tr||(!passing()&&!cantBuy(S,S.cur,s.t)),chosen=UI.mode==='pay'&&UI.buy&&UI.buy.src===src&&UI.buy.idx===i;
    return{src,i,t:s.t,n:s.n,cls:`mslot${ok?'':' no'}${aff.has(src+i)?' can':chosen?'':' dimc'}${chosen?' chosen':''}`};};
  const resAff=[...aff].some(k=>k[0]==='r');
  const mk=$('#market');let at=$('#allTile');
  if(!at){mk.insertAdjacentHTML('beforeend',`<button class="alltile" id="allTile" title="See every card, including the reserve">${ALL_ICON}<span>All cards</span><small></small></button>`);at=$('#allTile');}
  patchSlots(mk,S.market.map((s,i)=>spec('m',s,i)),at);
  const ac=`alltile${openSlot||tr?' open':''}${resAff?' can':''}`;if(at.className!==ac)at.className=ac;
  const sm=at.querySelector('small'),st=tr?'Pick any card':openSlot?'Reserve open':'Reserve locked';if(sm.textContent!==st)sm.textContent=st;
  $('#mktBtn').classList.toggle('canbuy',aff.size>0&&!UI.mktOpen);
  if(!all)return;
  patchSlots($('#allMarket'),S.market.map((s,i)=>spec('m',s,i)));
  patchSlots($('#reserve'),S.reserve.map((s,i)=>spec('r',s,i)));
  $('#resNote').textContent=tr?'Transmitter: take any card for free.':openSlot?'A market slot is empty, so you may buy from the reserve.':'Opens once a market slot sells out.';
  $('#buyState').textContent=S.turn.bought?'bought this turn':'1 purchase per turn';
  $('#resState').textContent=openSlot?'open':'locked';
}
export const marketPart = { name: 'market', update};

/* ---------- the purchase in progress: the card waits above the hand until it's paid for ---------- */
export const buySlotPart = { name: 'buySlot', update(){const bs=$('#buySlot'),on=!!S&&UI.mode==='pay'&&!passing();
  if(!on){if(!bs.hidden)bs.hidden=true;return;} // (dataset.t: the card type drawn in it; hiding keeps it drawn)
  if(bs.dataset.t!==UI.buy.t){bs.dataset.t=UI.buy.t;bs.querySelector('.bs-card').innerHTML=`<div class="mcard">${cardHTML(UI.buy.t)}</div>`;} // (keyed by what it draws, the card type: the same card bought from another stack keeps its picture)
  const c=CT[UI.buy.t].cost,t=payTotal();setText($('#bsPaid'),fmt(t));setText($('#bsCost'),c);bs.classList.toggle('paid',t>=c);bs.hidden=false;}};

/* where a card of the market is on screen now (a bought card flies from there): its slot, or the button that opens it */
/* where a card type's stack is on screen now, or null: an event can describe an earlier action of the same batch (the server
   sends several AI actions at once), and by now its stack may be sold out and its slot refilled from the reserve */
export function marketRectOf(t){const s=stackOf(S,t);return s?marketRect(s.src,s.i):null;}
function marketRect(src,idx){const e=document.querySelector(src==='m'?(UI.mktOpen?`#market [data-i="${idx}"] .mcard`:'#mktBtn'):(allShown()?`#reserve [data-i="${idx}"] .mcard`:(UI.mktOpen?'#allTile':'#mktBtn')));if(!e)return null;const r=e.getBoundingClientRect();
  if(src==='r'){const cw=86;return{left:r.left+r.width/2-cw/2,top:r.top-cw*.7+r.height/2,width:cw,height:cw*1.4};}return r;}

/* ---------- drag a card out of the market (strip or All cards) toward your hand to start buying it ---------- */
let mdrag=null,mdragJustEnded=false;
function marketDown(e){
  if(e.button>0||!S||S.over||passing()||!canAct())return;
  const s=e.target.closest('.mslot[data-src]');if(!s||s.classList.contains('no'))return;
  mdrag={src:s.dataset.src,idx:+s.dataset.i,x0:e.clientX,y0:e.clientY,el:s,started:false,ghost:null,pid:e.pointerId};
  window.addEventListener('pointermove',marketMove);window.addEventListener('pointerup',marketUp);window.addEventListener('pointercancel',marketCancel);
}
function marketMove(e){const d=mdrag;if(!d||e.pointerId!==d.pid)return;
  if(!d.started){if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<7)return;d.started=true;
    const stack=d.src==='m'?S.market[d.idx]:S.reserve[d.idx];if(!stack)return marketCancel();
    const g=document.createElement('div');g.className='card mghost free';g.innerHTML=cardHTML(stack.t);$('#cards').appendChild(g);d.ghost=g;d.t=stack.t;
    placeAt(g,d.el.querySelector('.mcard').getBoundingClientRect(),0);d.el.style.opacity=.35;
    if(allShown())openAll(false);sfx('pick');}
  const A=geo.app,cw=geo.cw,ch=cw*1.4;setT(d.ghost,e.clientX-A.left-cw/2,e.clientY-A.top-ch*.45,(e.clientX-d.x0)*.015,.72);
}
function marketUp(e){const d=mdrag;if(!d||e.pointerId!==d.pid)return;marketEnd();
  if(!d.started)return; // a plain click: the click listener has it
  mdragJustEnded=true;setTimeout(()=>{mdragJustEnded=false;},0);
  const mk=$('#mkt').getBoundingClientRect(),overMarket=UI.mktOpen&&e.clientX>=mk.left-10&&e.clientY<=mk.bottom+10,g=d.ghost;
  const settle=(rect,ms)=>{g.classList.remove('free');requestAnimationFrame(()=>{if(rect)placeAt(g,rect,0);else g.style.opacity=0;});setTimeout(()=>g.remove(),ms);};
  if(overMarket){settle(d.el.querySelector('.mcard').getBoundingClientRect(),300);return;}
  const transmit=UI.mode==='transmit';pickFromMarket(d.src,d.idx);
  // settle into the purchase slot (or fade: the Transmitter's card flies to the discard pile)
  if(transmit||UI.mode!=='pay'){settle(null,280);return;}
  const B=buySlotBox;settle({left:geo.app.left+B.x,top:geo.app.top+B.y,width:B.w,height:B.w*1.4},300);
}
function marketCancel(){const d=mdrag;marketEnd();if(d.ghost)d.ghost.remove();}
function marketEnd(){const d=mdrag;mdrag=null;d.el.style.opacity='';window.removeEventListener('pointermove',marketMove);window.removeEventListener('pointerup',marketUp);window.removeEventListener('pointercancel',marketCancel);}

export function marketInit(){
  const pick=e=>{if(!S||passing()||S.over)return;if(e.target.closest('#allTile')){openAll(true);return;}const s=e.target.closest('[data-src]');if(!s)return;
    const inAll=!!e.target.closest('#allc');pickFromMarket(s.dataset.src,+s.dataset.i);if(inAll&&UI.mode==='pay')openAll(false);};
  for(const c of['#market','#allMarket','#reserve']){$(c).addEventListener('click',e=>{if(mdragJustEnded){mdragJustEnded=false;return;}pick(e);});$(c).addEventListener('pointerdown',marketDown);}
  $('#bsCancel').onclick=cancelMode;
  $('#allClose').onclick=()=>openAll(false);$('#allc').addEventListener('click',e=>{if(e.target.id==='allc'||e.target.classList.contains('allc-in'))openAll(false);});
  $('#mktBtn').onclick=()=>{if($('#mkt').classList.contains('cramped')){openAll(true);return;}setMkt(!UI.mktOpen);};
  const so=load('market');
  UI.mktOpen=so!=='0';$('#mkt').classList.toggle('hid',!UI.mktOpen);$('#mktBtn').classList.toggle('on',UI.mktOpen);noMkt();
  onGeo(sizeMarket);
}

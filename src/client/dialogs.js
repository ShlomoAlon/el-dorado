/* Everything that opens over the game: the round banner, toasts, and one modal at a time (rules, results, a pile).
   The menu is its own dialog (menu.js); opening a modal closes it. */
import { CT, SYMCOL, typeOf, playerDone, plural, blocksOf, assert, ownedTypes } from '../engine.gen.js';
import { $, esc, overlayUp } from './dom.js';
import { S, UI, NET, online, hp, viewIdx, covered } from './state.js';
import { cardHTML } from './cards.js';
import { MENU, menuClose, showSetup, showHub } from './menu.js';
import { exitOnline } from './online.js';
import { loadReplayId, openReplay } from './replay.js';
import { watchFlash } from './debug.js';
import { render } from './frame.js';

export function banner(t,s){const b=$('#banner');b.querySelector('.t').textContent=t;b.querySelector('.s').textContent=s||'';
  b.getAnimations().forEach(a=>a.cancel());
  b.hidden=false;b.animate([{opacity:0,transform:'translate3d(-50%,-44%,0) scale(.96)'},{opacity:1,transform:'translate3d(-50%,-50%,0) scale(1)',offset:.18},{opacity:1,transform:'translate3d(-50%,-50%,0) scale(1)',offset:.75},{opacity:0,transform:'translate3d(-50%,-56%,0) scale(1)'}],{duration:1400,easing:'ease-out'})
    .finished.then(()=>{b.hidden=true;},()=>{/* expected: cancelled by the next banner, which shows it */}); /* (shown only while it plays: invisible, it was a screen-wide layer over the game; cancelled, the next banner shows it) */}
let toastT=0;
export function toast(t,ms){const e=$('#toast');const host=MENU.dlg.open?MENU.dlg:document.body;if(e.parentNode!==host)host.appendChild(e); /* over the menu while it's open */
  e.textContent=t;e.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('on'),ms||1700);}
/* one overlay at a time (the menu is its own dialog: menu.js; it closes when another overlay opens) */
export function modal(html,onMount,dismiss){watchFlash();const o=$('#overlay');if(MENU.dlg.open)MENU.dlg.close();
  o.innerHTML=`<div class="scrim"><div class="mframe"><div class="modal">${html}</div></div></div>`;const sc=o.firstChild;
  if(dismiss)sc.onclick=e=>{if(e.target===sc)closeModal();};onMount(sc);render();}
export function closeModal(){watchFlash();menuClose();const o=$('#overlay');const sc=o.firstChild;if(!sc)return;sc.classList.add('closing');sc.querySelector('.modal').className='modal';sc.style.pointerEvents='none';sc.animate([{opacity:1},{opacity:0}],{duration:160}).onfinish=()=>{sc.remove();};render();}
/* the layer that dims the game: on exactly while an overlay is up (the menu or a window), so a window replacing the menu, or
   another window, keeps it on; every overlay change asks for a frame (render) */
export const coverPart={name:'cover',update(){const d=$('#dim'),on=overlayUp();if(d.classList.contains('on')!==on)d.classList.toggle('on',on);}};
export const modalOpen=()=>!!document.querySelector('#overlay .modal');

export function showRules(){
  modal(`<h2>How to play</h2><div class="rules">
  <p>Race to El Dorado: move onto one of the three finishing spaces on the El Dorado tile at the end of the route. Your explorer then steps into the city, freeing the space.</p><p><b>Game end.</b> Online games (and local games by default) continue until all but one expedition has arrived, then the round is finished; this gives every player a place. Players arriving in the same round are split by blockades held. The official rule, where the game ends after the round in which the first player arrives, is available for local games.</p><p><b>Online.</b> Each player has a clock: every turn adds the room's turn time to it, and time you don't use carries over to your later turns. When it runs out the turn ends and leftover cards are discarded. Missing 3 turns in a row forfeits. Rated games (the default) change Elo ratings; whoever creates a room can make it unrated.</p><p><b>AI players.</b> Any seat can be an AI: <b>Fawcett</b> (Grandmaster: the neural network, weighing many more plans each turn), <b>Humboldt</b> (Master: the neural network, planning each whole turn) or <b>Raleigh</b> (Steady: a hand-written route planner); the same AI can take several seats. Online, AIs play on the server and have ratings of their own. The network was trained on First Expedition; on other courses the AIs use the route planner.</p>
  <h4>Your turn</h4><ul><li><b>Play cards</b> in any order: move, play action cards, and buy <b>at most one</b> card.</li><li><b>End turn</b>: played cards go to your discard pile. You may discard any cards left in hand or keep them.</li><li><b>Draw</b> back up to 4 cards. An empty deck is refilled by shuffling your discard pile.</li></ul>
  <h4>Moving</h4><ul><li><b>Drag</b> a card onto a highlighted space, or tap the card and then the space.</li><li>A jungle, water or village space needs one card of that symbol with at least the shown strength. Cards can't be combined for one space.</li><li>Leftover strength keeps moving the same explorer over further spaces of that type. It's lost once you do something else.</li><li>Jokers (white) count as any one symbol, chosen when played.</li><li><b>Rubble</b> (grey): discard as many cards as shown — drag cards onto it one by one; you move once enough are in. <b>Base camp</b> (red): remove that many cards from the game.</li><li>Mountains are impassable. Occupied spaces can't be entered or crossed.</li></ul>
  <h4>Blockades</h4><p>At the start, a random blockade from #1–6 is placed on each connection between two boards. The first explorer to cross pays its cost (a matching card, or discards for grey ones) and keeps it; the Native can also tear one down. Ties at the end go to whoever holds the most blockades, then the highest-numbered one.</p>
  <h4>Buying</h4><ul><li>Coin cards and jokers pay their value; every other card pays ½ coin. No change.</li><li>Drag a market card toward your hand (or tap it), then drag or tap cards from your hand to pay. The purchase completes as soon as it's covered.</li><li>Bought cards go to your discard pile.</li><li>The reserve opens once a market slot is empty; that stack moves into the slot.</li></ul>
  <h4>Single-use cards</h4><p>Cards marked <b>Single use</b> are removed from the game after their effect. Spent only as ½ coin, they're discarded normally.</p>
  <h4>Two players</h4><p>Each player leads two explorers (starting spaces 1 & 3, and 2 & 4) and wins only when both reach El Dorado. Each card moves one of them.</p>
  <h4>About the boards</h4><p>Courses are fixed routes, starting with the rulebook's route for a first game (B · C · N · I · K), laid out as on the official setup sheet. Tiles B, C, I, K and N are copied space by space from the printed tiles; darker spaces are harder to cross.</p>
  <h4>Controls</h4><ul><li>Drag or scroll to pan, pinch or ctrl+scroll to zoom. <b>Esc</b> cancels, <b>Ctrl+Z</b> undoes until new cards are drawn.</li></ul>
  </div><div class="mrow"><button class="btn pri" id="rClose">Close</button></div>`,sc=>sc.querySelector('#rClose').onclick=closeModal,true);
}
export function showGameOver(){
  assert(S.over,'showGameOver: the game is over');
  const w=S.players.map((p,i)=>i).filter(i=>S.places[i]===1),fin=S.players.map((p,i)=>i).filter(i=>playerDone(S.players[i]));
  const res=online()&&NET.room.results,ord=S.players.map((p,i)=>i).sort((a,b)=>S.places[a]-S.places[b]);
  const ordn=n=>n+(['th','st','nd','rd'][n%100>10&&n%100<14?0:Math.min(n%10,4)%4]||'th');
  const rows=ord.map(i=>[S.players[i],i]).map(([p,i])=>`<div class="prow" style="justify-content:space-between;padding:9px 12px;border-radius:10px;background:${w.includes(i)?'rgba(233,178,74,.14)':'#0c1512'};border:1px solid ${w.includes(i)?'var(--gold)':'var(--line)'}"><span style="display:flex;align-items:center;gap:8px"><b style="color:var(--gold2);min-width:34px">${ordn(S.places[i])}</b><i style="width:12px;height:12px;border-radius:50%;background:${p.color};display:inline-block"></i><b>${esc(p.name)}</b></span><span style="color:var(--muted);font-size:13px">${playerDone(p)?'Reached El Dorado (round '+p.fin+')':p.resigned?'Left the game':'Still in the jungle'} · ${plural(blocksOf(S,i).length,'blockade')}${blocksOf(S,i).length?' (biggest #'+Math.max(...blocksOf(S,i).map(b=>S.blockades[b].n))+')':''}${res&&res.deltas?` · <b style="color:${res.deltas[i]>=0?'#8fe3a8':'#ff9c8a'}">${res.deltas[i]>=0?'+':''}${res.deltas[i]}</b> → ${Math.round(res.before[i]+res.deltas[i])}`:''}</span></div>`).join('');
  const rid=res&&res.replay||null;
  const tie=fin.length>1?'<p class="sub" style="margin:10px 0 0">Explorers arriving in the same round are split by blockades held, then the highest-numbered blockade.</p>':'';
  modal(`<h2>${w.length?w.map(i=>esc(S.players[i].name)).join(' & ')+' win'+(w.length>1?'':'s'):'Expedition over'}</h2><p class="sub">The race ended in round ${S.round}.${res&&res.deltas?' Ratings updated.':res&&res.unrated?' Unrated game: ratings unchanged.':''}</p>${rows}${tie}<div class="mrow">${rid||UI.lastReplay&&!online()?'<button class="btn" id="gRep">Watch replay</button>':''}<button class="btn" id="gClose">View board</button><button class="btn pri" id="gNew">New game</button></div>`,
    sc=>{sc.querySelector('#gClose').onclick=closeModal;
      const gr=sc.querySelector('#gRep');if(gr)gr.onclick=()=>{closeModal();if(online()){exitOnline();loadReplayId(rid);}else openReplay(UI.lastReplay,null);};sc.querySelector('#gNew').onclick=()=>{if(online()){exitOnline();showHub();}else showSetup();};},true);
}
/* a player's cards, as far as the viewer may see them (redact() keeps the rest from online pages anyway), four things (owner,
   2026-10-05): the hand, the draw pile, the discard pile, and every card they own wherever it is (starting cards too, removed
   ones gone). Another player's hand and draw pile face down; what they own face up (every purchase and removal is public) */
export function showPlayer(i){
  const p=S.players[i],me=i===viewIdx()&&!covered(),order=Object.keys(CT);
  const types=ts=>ts.map(t=>`<div class="mcard">${cardHTML(t)}</div>`).join(''),faces=ids=>types(ids.map(id=>typeOf(S,id)).sort((a,b)=>order.indexOf(a)-order.indexOf(b)));
  const backs=n=>Array.from({length:n},()=>'<div class="pback"><div class="back"></div></div>').join('');
  const part=(title,n,body)=>`<div class="ppart"><h3>${title} <span class="m">${n}</span></h3>${n?`<div class="deckgrid">${body}</div>`:''}</div>`;
  const held=blocksOf(S,i).map(b=>S.blockades[b]).sort((a,b)=>b.n-a.n); // (the biggest first: most blockades, then the biggest, breaks a tie)
  modal(`<h2><i class="pdot" style="background:${p.color}"></i>${esc(p.name)}</h2>${playerDone(p)||p.resigned?`<p class="sub">${playerDone(p)?'Reached El Dorado':'Left the game'}</p>`:''}
    ${part('Hand',p.hand.length,me?faces(p.hand):backs(p.hand.length))}${part('Draw pile',p.deck.length,me?faces(p.deck):backs(Math.min(p.deck.length,1)))}
    ${part('Discard pile',p.discard.length,faces(p.discard))}${(o=>part('Owned',o.length,types(o)))(ownedTypes(S,i))}
    ${part('Blockades',held.length,held.map(B=>`<span class="pbk" style="--c:${SYMCOL[B.k]}" title="Blockade ${B.n}"><b>${B.n}</b></span>`).join(''))}
    <div class="mrow"><button class="btn pri" id="pClose">Close</button></div>`,sc=>{sc.querySelector('#pClose').onclick=closeModal;},true);
}
export function showPile(which){
  if(covered())return;const pl=hp();
  const ids=which==='deck'?pl.deck.slice():pl.discard.slice();
  const order=Object.keys(CT);const sorted=ids.map(id=>typeOf(S,id)).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  const all=pl.deck.length+pl.hand.length+pl.discard.length+pl.play.length;
  modal(`<h2>${which==='deck'?'Draw pile':'Discard pile'}</h2><p class="sub">${plural(ids.length,'card')}${which==='deck'?', sorted (the real order is hidden)':''}. ${all} cards in your expedition.</p><div class="deckgrid">${sorted.map(t=>`<div class="mcard">${cardHTML(t)}</div>`).join('')||'<p class="note">Empty.</p>'}</div><div class="mrow"><button class="btn pri" id="pClose">Close</button></div>`,sc=>sc.querySelector('#pClose').onclick=closeModal,true);
}

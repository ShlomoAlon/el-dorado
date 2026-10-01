/* REPLAYS: step through a recorded game (every finished game on the site, tools/ai/record.mjs, or any uploaded game log).
   The log holds the seeds and every action; the engine rebuilds each position (replay), so a replay is exactly the
   game that was played. Nothing here changes any rules. */
import { CT, LOG_MAX, hexAt, replayCheck, replay, applyAction, botValue, botNetReady, aiAllowed, aiSetNet, aiPlan, aiById, mulberry32 } from '../engine.gen.js';
import { $, esc, setHTML, setQuery } from './dom.js';
import { S, setS, UI, G, online, clearSelection } from './state.js';
import { render, resetView } from './frame.js';
import { toast, banner, closeModal } from './dialogs.js';
import { showGame, resumeSaved, playEvents, firstPiece } from './actions.js';
import { AIX, aiNetLoad, aiReset } from './ai.js';
import { exitOnline } from './online.js';
import { showSetup, showHub, showReplays, MENU } from './menu.js';
import { load, store } from './store.js';
import { expectLayout } from './debug.js';
const TERR={j:'jungle',w:'water',v:'village',r:'rubble',c:'base camp',g:'El Dorado',s:'start'};
function buildReplay(log,id){
  const err=replayCheck(log);if(err)throw new Error(err);
  const states=[],lines=[],evs=[];
  for(const r of replay(log)){ // each position, and the journal lines and events of the action that led to it
    if(!r.ok)throw new Error(`move ${r.i+1} doesn't fit the game (${r.err})`); // (an uploaded log can be anything)
    lines.push(r.gs.log.slice());evs.push(r.i<0?null:r.ev);
    r.gs.log=[];states.push(JSON.stringify(r.gs)); // (the journal is kept per step, in lines)
  }
  // the bot's view starts hidden on small portrait phones (the board needs the room); the viewer's choice is remembered
  let sp=1,side=!matchMedia('(max-width:600px) and (orientation:portrait)').matches;sp=+(load('rspeed')||1)||1;const v=load('rside');if(v!==null)side=v==='1';
  return{log,id,states,lines,evs,i:0,timer:0,speed:sp,side,ev:{},adv:{},played:{}};
}
/* ---- the evaluation: the shipped network's estimate for the position on screen, and the turn the strongest AI would play
   from it. Only where a network was trained (First Expedition, 3-4 players: aiAllowed); elsewhere the replay shows none. */
const replayEvalOK=()=>aiAllowed(S.course.id,S.players.length)&&!AIX.failed;
function replayNet(){if(!AIX.net)return false;aiSetNet(AIX.net);return botNetReady(S);}
function replayEval(){const R=G.replay;if(R.ev[R.i])return R.ev[R.i];if(!replayNet())return null;
  // the network scores each explorer on its own (its expected result: 1st = 1, 2nd = ¼, …); shown as shares of the
  // winning chances, so they add up to 100%
  const raw=S.players.map((p,j)=>p.resigned?0:Math.max(0,botValue(S,j,'net'))),tot=raw.reduce((a,x)=>a+x,0)||1;
  return R.ev[R.i]={raw,share:raw.map((x,j)=>S.players[j].resigned?null:x/tot)};}
const ADVISOR='fawcett';
/* the advisor's whole turn from the position on screen: [{a, html, key}] (each step described in the position it is played
   from), or null. Worked out once per position, with a random stream of its own so it is the same each visit. */
function replayAdvice(){const R=G.replay;if(R.i in R.adv)return R.adv[R.i];if(!replayNet()||S.over)return null;
  const g=mulberry32(R.i*7919+1),line=aiPlan(S,ADVISOR,g);let steps=null;
  if(line){steps=[];const gs=JSON.parse(R.states[R.i]); // (a copy of the position, played forward along the plan)
    for(const a of line){const st=JSON.parse(JSON.stringify(gs));steps.push({a,html:describeAction(a,st),key:actionKey(a,st)});const me=gs.cur;if(!applyAction(gs,me,a,g).ok||gs.over||gs.cur!==me)break;}}
  return R.adv[R.i]=steps;}
/* what the player actually did from position i to the end of their turn: [{a, html, key}] (as the advice) */
function playedTurn(i){const R=G.replay;if(R.played[i])return R.played[i];const out=[],seat=R.log.actions[i][0];
  for(let k=i;k<R.log.actions.length&&R.log.actions[k][0]===seat;k++){const a=R.log.actions[k][1],st=JSON.parse(R.states[k]);
    out.push({a,html:describeAction(a,st),key:actionKey(a,st)});if(a.t==='end'||a.t==='timeout'||a.t==='resign')break;}
  return R.played[i]=out;}
/* the same move whichever copy of a card it uses */
function actionKey(a,st){const ty=id=>st.cards[id]||id,tys=ids=>(ids||[]).map(ty).sort().join('+');
  switch(a.t){case'move':case'native':return`${a.t} ${ty(a.card)} ${a.pi} ${a.to}`;case'pay':return`pay ${a.pi} ${a.to} ${tys(a.cards)}`;
    case'buy':return`buy ${a.type} ${tys(a.cards)}`;case'transmit':return`transmit ${a.type}`;case'action':return`action ${ty(a.card)}`;
    case'trash':return`trash ${tys(a.cards)}`;case'end':return`end ${tys(a.keep)}`;default:return a.t;}}
/* the advice takes a moment (the advisor weighs many whole turns), so it is worked out once the viewer stops on a position */
let adviceT=0;
function adviceSoon(){clearTimeout(adviceT);const R=G.replay,i=R.i;adviceT=setTimeout(()=>{if(G.replay===R&&R.i===i&&!R.timer&&R.side){replayAdvice();render();}},250);}
function startReplay(log,id){
  const from=MENU.dlg.open?MENU.screen:null; // the menu screen it was opened from: exiting goes back there
  if(online())exitOnline(); // a finished online game (the menu doesn't open replays during one in progress)
  aiReset();let R;try{R=buildReplay(log,id);}catch(e){console.error(e);toast('Could not load that replay: '+e.message,3500);showSetup();return;}
  R.from=from;closeModal();G.replay=R;UI.preview=false;
  setS(JSON.parse(R.states[0]));showGame();replayGo(0,false);
  banner(log.title||'Replay',`${log.players.length} players · ${log.actions.length} moves`);
  if(replayEvalOK()&&!AIX.net)aiNetLoad().then(()=>{if(G.replay===R)render();});
}
/* show position i (after i actions). anim: play the moves of action i-1 → i */
function replayGo(i,anim){
  const R=G.replay;i=Math.max(0,Math.min(R.states.length-1,i));
  const fwd=anim&&i===R.i+1;R.i=i;
  setS(JSON.parse(R.states[i]));let L=[];for(let k=i;k>=0&&L.length<LOG_MAX;k--)L=R.lines[k].concat(L);S.log=L.slice(-LOG_MAX); // (the journal the game had here)
  clearSelection();UI.piece=firstPiece();
  if(fwd&&R.evs[i])playEvents(R.evs[i]);
  render();
}
export const replayNext=()=>G.replay.log.actions[G.replay.i];
/* jump to the start of the next / previous turn */
function replayTurn(dir){const R=G.replay;let i=R.i;
  const turnAt=k=>{const s=JSON.parse(R.states[k]);return s.round*8+s.cur;};const t0=turnAt(i);
  if(dir>0){while(i<R.states.length-1&&turnAt(i)===t0)i++;}
  else{while(i>0&&turnAt(i-1)===t0)i--;if(i>0){i--;const t1=turnAt(i);while(i>0&&turnAt(i-1)===t1)i--;}}
  replayStop();replayGo(i,false);}
function replayPlay(){const R=G.replay;if(R.timer){replayStop();return;}
  if(R.i>=R.states.length-1)replayGo(0,false);
  // one move every ~1.3 s at Normal, with an extra pause when a turn ends
  const tick=()=>{if(R.i>=R.states.length-1){replayStop();return;}
    const endTurn=(replayNext()||[])[1]&&replayNext()[1].t==='end';replayGo(R.i+1,true);
    R.timer=setTimeout(tick,(1300+(endTurn?900:0))/R.speed);};
  R.timer=setTimeout(tick,50);render();}
function replayStop(){const R=G.replay;if(R.timer){clearTimeout(R.timer);R.timer=0;}render();}
export function exitReplay(){expectLayout();const from=G.replay.from;replayStop();G.replay=null;$('#app').classList.remove('replaying');$('#rdock').hidden=true;$('#rside').hidden=true;$('#rdock').innerHTML='';
  setQuery({replay:null});
  setS(null);resetView();const resumed=resumeSaved(); // the local game in progress, if any, comes back behind the menu
  if(from==='replays')showReplays();else if(from==='online')showHub();else if(from||!resumed)showSetup();}

/* words for one action, read against the position before it */
function describeAction(a,st){
  const T=id=>CT[st.cards[id]]?CT[st.cards[id]].n:'?',sp=k=>{if(!k)return'';if(k[0]==='B'){const B=st.blockades[+k.slice(1)];return`blockade #${B?B.n:'?'}`;}const h=hexAt(S,k);return h?`${TERR[h.type]||h.type}${h.val>1?' '+h.val:''}`:k;};
  const list=ids=>ids&&ids.length?ids.map(T).join(', '):'nothing';
  const stack=a=>CT[a.type]?CT[a.type].n:'?';
  switch(a.t){
    case'move':{const act=st.turn.active&&st.turn.active.id===a.card;return`${act?'keeps moving with':'plays'} <b>${esc(T(a.card))}</b> → ${sp(a.to)}`;}
    case'pay':return`gives up <b>${esc(list(a.cards))}</b> for ${sp(a.to)}`;
    case'native':return`<b>Native</b> → ${sp(a.to)}`;
    case'action':return`plays <b>${esc(T(a.card))}</b>`;
    case'trash':return a.cards.length?`removes <b>${esc(list(a.cards))}</b> from the game`:'removes nothing';
    case'buy':return`buys <b>${esc(stack(a))}</b> with ${esc(list(a.cards))}`;
    case'transmit':return`uses the Transmitter to take <b>${esc(stack(a))}</b>`;
    case'end':return`ends the turn${a.keep&&a.keep.length?`, keeping <b>${esc(list(a.keep))}</b>`:''}`;
  }
  return esc(a.t);
}
/* the next action's space and card, marked on the board and in the hand */
export function replayDecorate(){if(G.replay.hover){UI.targets=new Map([[G.replay.hover,{kind:'move'}]]);return;}const a=replayNext();if(!a||S.over)return;const x=a[1];
  if(x.to&&x.to[0]!=='B'&&hexAt(S,x.to))UI.targets=new Map([[x.to,{kind:x.t==='pay'?(hexAt(S,x.to).type==='c'?'camp':'rubble'):'move'}]]);}
function replayPromptHTML(){
  const R=G.replay,a=replayNext();
  if(!a)return`<b>End of the replay.</b> ${S.over?'The game is over.':'The log stops here'+(R.log.result&&R.log.result.capped?' (it hit the 25-round cap).':'.')}`;
  const pl=S.players[a[0]],st=JSON.parse(R.states[R.i]);
  return`<span class="who"><i style="background:${pl.color}"></i>${esc(pl.name)}</span>${describeAction(a[1],st)}`;
}
/* Replay UI lives in its own grid cells (#rdock under the game, #rside beside it or under it on narrow screens),
   never on top of the game: the game area (#app) shrinks to make room, and everything in it lays itself out in
   the space it gets (container queries). Nothing here measures other elements, so nothing can overlap. */
const RSPEEDS=[['Slow','½×',.5],['Normal','1×',1],['Fast','2×',2],['Faster','4×',4]];
function replayBar(){
  const R=G.replay,d=$('#rdock'),side=$('#rside');
  if(!d.firstChild){
    d.innerHTML=`<div class="rgrp"><button id="rbS" class="ends" title="Start (Home)" aria-label="Start">⏮</button><button id="rbT0" title="Previous turn (↑)" aria-label="Previous turn">«</button><button id="rbP" title="Back one move (←)" aria-label="Back one move">‹</button><button id="rbGo" class="pri" title="Play / pause (space)" aria-label="Play">▶</button><button id="rbN" title="Forward one move (→)" aria-label="Forward one move">›</button><button id="rbT1" title="Next turn (↓)" aria-label="Next turn">»</button><button id="rbE" class="ends" title="End (End)" aria-label="End">⏭</button></div>
      <div class="rspd" role="group" aria-label="Replay speed">${RSPEEDS.map(([t,s,v])=>`<button data-v="${v}" aria-label="${t}" title="${t}"><span class="lg">${t}</span><span class="sm">${s}</span></button>`).join('')}</div>
      <input type="range" id="rbR" min="0" value="0" aria-label="Position in the game"><span id="rbPos"></span>
      <button id="rbA" class="rtog" title="Show or hide the evaluation">Evaluation</button><div id="rbTxt" aria-live="polite"></div>`;
    const go=(i,an)=>{replayStop();replayGo(i,an);};
    d.querySelector('#rbS').onclick=()=>go(0);d.querySelector('#rbE').onclick=()=>go(1e9);
    d.querySelector('#rbP').onclick=()=>go(G.replay.i-1);d.querySelector('#rbN').onclick=()=>go(G.replay.i+1,true);
    d.querySelector('#rbT0').onclick=()=>replayTurn(-1);d.querySelector('#rbT1').onclick=()=>replayTurn(1);
    d.querySelector('#rbGo').onclick=replayPlay;
    d.querySelectorAll('.rspd button').forEach(b=>b.onclick=()=>{G.replay.speed=+b.dataset.v;store('rspeed',b.dataset.v);render();});
    d.querySelector('#rbA').onclick=()=>{G.replay.side=!G.replay.side;store('rside',G.replay.side?'1':'0');render();};
    const rr=d.querySelector('#rbR');rr.oninput=()=>go(+rr.value);}
  d.hidden=false;side.hidden=!R.side;$('#app').classList.add('replaying');d.querySelector('#rbTxt').innerHTML=replayPromptHTML()+`<span class="rpos"> · move ${R.i} / ${R.states.length-1} · round ${S.round}</span>`;
  const n=R.states.length-1,gb=d.querySelector('#rbGo');gb.textContent=R.timer?'❚❚':'▶';gb.setAttribute('aria-label',R.timer?'Pause':'Play');
  d.querySelectorAll('.rspd button').forEach(b=>b.classList.toggle('on',+b.dataset.v===R.speed));
  const tg=d.querySelector('#rbA'),ok=replayEvalOK();tg.hidden=!ok;if(!ok)side.hidden=true;
  tg.classList.toggle('on',R.side);tg.setAttribute('aria-pressed',R.side?'true':'false');
  const rr=d.querySelector('#rbR');rr.max=n;rr.value=R.i;
  const fig=(v,w)=>String(v).padStart(w,'\u2007'); // (figure spaces: the label keeps one width all through the replay)
  d.querySelector('#rbPos').textContent=`move ${fig(R.i,String(n).length)} / ${n} · round ${fig(S.round,2)}`;
  if(!R.side||!ok)return;
  const ev=replayEval(),pc=v=>v==null?'–':Math.round(v*100)+'%';
  let h=`<div class="rwh">Evaluation</div>`;
  if(!ev)h+=`<p class="m">Loading the network…</p>`;
  else h+=`<div class="revl">${S.players.map((p,j)=>`<div class="rev${j===S.cur&&!S.over?' now':''}"><i style="background:${p.color}"></i><span class="n">${esc(p.name)}</span><span class="bar"><span style="transform:scaleX(${ev.share[j]==null?0:Math.max(0,Math.min(1,ev.share[j]))})"></span></span><b>${p.resigned?'left':pc(ev.share[j])}</b></div>`).join('')}</div>`;
  const nx=replayNext(),A=aiById(ADVISOR),who=esc(S.players[S.cur].name);let steps=null,played=null;
  if(ev&&!S.over){
    h+=`<div class="rwh radv">${esc(A.name)}’s turn for ${who}</div>`;
    if(R.timer)h+=`<p class="m">Pause to see it.</p>`;
    else if(!(R.i in R.adv)){h+=`<p class="m">${esc(A.name)} is thinking…</p>`;adviceSoon();}
    else if(!(steps=R.adv[R.i]))h+=`<p class="m">No plan for this position.</p>`;
    else{
      // compared with what the player did, step by step: m steps of the plan match theirs (✓), then what they did instead
      played=nx&&nx[0]===S.cur?playedTurn(R.i):null;let m=0;while(played&&m<steps.length&&m<played.length&&steps[m].key===played[m].key)m++;
      h+=`<ol class="rplan">${steps.map((o,j)=>`<li class="ralt${j<m?' on':''}" data-j="${j}"><span>${o.html}${j<m?' <b>✓</b>':''}</span></li>`).join('')}</ol>`;
      if(steps[steps.length-1].a.t==='action')h+=`<p class="rcmp">…then decides the rest after seeing the cards it draws.</p>`; // (every action card draws)
      if(played){
        if(m===steps.length)h+=`<p class="rcmp"><b>✓</b> ${who} played ${steps[m-1].a.t==='end'?'this turn':'these steps'}.</p>`;
        else h+=`<p class="rcmp">${m?`${who} played the first ${m===1?'step':m+' steps'}, then:`:`${who} played instead:`}</p><ol class="rplan" style="counter-reset:st ${m}">${played.slice(m).map((o,j)=>`<li class="ralt rme" data-p="${m+j}"><span>${o.html}</span></li>`).join('')}</ol>`;}
    }
  }
  if(side.__h===h)return;setHTML(side,h); // (rewritten only when it changes: hovering a step redraws the board, not this list)
  // hovering a step marks its space on the board
  side.querySelectorAll('.ralt').forEach(el=>{const o=(el.dataset.p!=null?played[+el.dataset.p]:steps[+el.dataset.j]).a;
    el.onpointerenter=()=>{if(o.to&&o.to[0]!=='B'&&hexAt(S,o.to)){R.hover=o.to;render();}};
    el.onpointerleave=()=>{R.hover=null;render();};});
}
export function openReplay(log,id){expectLayout();
  setQuery({room:null,replay:id||null});
  startReplay(log,id);
}
export async function loadReplayId(id){
  let j;try{const r=await fetch('/api/replays/'+encodeURIComponent(id));j=await r.json();if(!r.ok)throw new Error(j.err||'not found');}
  catch(e){toast('Could not load replay '+id+': '+e.message,3500);showSetup();return;}
  openReplay(j,id);
}
export function replayKeys(e){if(!G.replay||e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||document.querySelector('#overlay .modal')||MENU.dlg.open)return false;
  const R=G.replay,k=e.key;
  if(k==='ArrowRight'){replayStop();replayGo(R.i+1,true);}else if(k==='ArrowLeft'){replayStop();replayGo(R.i-1);}
  else if(k==='ArrowDown')replayTurn(1);else if(k==='ArrowUp')replayTurn(-1);
  else if(k===' ')replayPlay();else if(k==='Home'){replayStop();replayGo(0);}else if(k==='End'){replayStop();replayGo(1e9);}
  else return false;
  e.preventDefault();return true;}

/* the replay's view part: the dock and the evaluation panel follow the position on show */
export const replayPart = { name: 'replay', update(){if(G.replay)replayBar();}};

/* =========================================================
   REPLAYS: step through a recorded game (every finished game on the site, tools/ai/record.mjs, or any uploaded game log).
   The log holds the seeds and every action; the engine rebuilds each position (replayStart),
   so a replay is exactly the game that was played. Nothing here changes any rules.
   ========================================================= */
const TERR={j:'jungle',w:'water',v:'village',r:'rubble',c:'base camp',g:'El Dorado',s:'start'};
function buildReplay(log,id){
  const err=replayCheck(log);if(err)throw new Error(err);
  const gen=replayStart(log);
  const states=[],lines=[],evs=[null],rem=[],fails=[];
  const snap=()=>{const L0=S.log;S.log=[];states.push(JSON.stringify(S));S.log=L0;rem.push(S.players.map((_,j)=>botRemaining(j)));};
  try{
    lines.push(S.log.slice());snap();
    for(let i=0;i<log.actions.length;i++){
      S.log=[];
      let r=replayStep(log,i);
      if(!r.ok){fails.push(i+1);r=applyAction(S.cur,{t:'end',keep:[]});}
      lines.push(S.log.slice());evs.push(r.ev||null);snap();
    }
  }finally{setRng(null);}
  // the bot's view starts hidden on small portrait phones (the board needs the room); the viewer's choice is remembered
  let sp=1,side=!matchMedia('(max-width:600px) and (orientation:portrait)').matches;try{sp=+(localStorage.getItem('eldorado-rspeed2')||1)||1;const v=localStorage.getItem('eldorado-rside');if(v!==null)side=v==='1';}catch(e){}
  let ex=false;try{ex=localStorage.getItem('eldorado-rexp')==='1';}catch(e){}
  return{log,id,states,lines,evs,rem,fails,i:0,timer:0,speed:sp,side,ex,ev:{},alts:{}};
}
/* ---- the evaluation: the shipped network's estimate for the position on screen ----
   Only where a network was trained (First Expedition, 3-4 players: aiAllowed); elsewhere the replay shows none.
   By default one line per explorer (the position itself); expanded, every option of the player to move is scored too. */
const replayEvalOK=()=>!!(REPLAY&&S&&aiAllowed(S.course.id,S.players.length)&&!AIX.failed);
function replayNet(){if(!AIX.net)return false;aiSetNet(AIX.net);return botNetReady();}
function replayEval(){const R=REPLAY;if(R.ev[R.i])return R.ev[R.i];if(!replayNet())return null;
  // the network scores each explorer on its own (its expected result: 1st = 1, 2nd = ¼, …); shown as shares of the
  // winning chances, so they add up to 100%
  const raw=S.players.map((p,j)=>p.resigned?0:Math.max(0,botValue(j,'net'))),tot=raw.reduce((a,x)=>a+x,0)||1;
  return R.ev[R.i]={raw,share:raw.map((x,j)=>S.players[j].resigned?null:x/tot)};}
function replayAlts(){const R=REPLAY;if(R.alts[R.i])return R.alts[R.i];if(!replayNet()||S.over)return null;
  const g=mulberry32(R.i*7919+1),r0=RNG;let sc;
  try{sc=botScoreActions(S.cur,g,8);}finally{RNG=r0;}
  // each option's score for the player to move, as a share against the others' current scores (same scale as above)
  const ev=replayEval(),me=S.cur,others=ev.raw.reduce((a,x,j)=>j===me?a:a+x,0);
  return R.alts[R.i]=sc.filter(x=>x.v>-Infinity).map(x=>({a:x.a,v:Math.max(0,x.v)/((Math.max(0,x.v)+others)||1)}));}
function startReplay(log,id){
  if(online())exitOnline(); // an online game in progress goes on (rejoin it from Online)
  aiReset();let R;try{R=buildReplay(log,id);}catch(e){console.error(e);toast('Could not load that replay: '+e.message,3500);showSetup();return;}
  closeModal();REPLAY=R;undoStack=[];
  for(const[,el]of cardEls)el.remove();cardEls.clear();
  S=JSON.parse(R.states[0]);MAP=mapFor(S);buildBoard();lastPlayer=-1;replayGo(0,false);fit();
  banner(log.title||'Replay',`${log.players.length} players · ${log.actions.length} moves`);
  if(replayEvalOK()&&!AIX.net)aiNetLoad().then(()=>{if(REPLAY===R)replayBar();});
  if(R.fails.length)toast(`${R.fails.length} move${R.fails.length>1?'s':''} in this log didn't fit the game (first: move ${R.fails[0]}); those turns were ended instead.`,4200);
}
/* show position i (after i actions). anim: play the moves of action i-1 → i */
function replayGo(i,anim){
  const R=REPLAY;if(!R)return;i=Math.max(0,Math.min(R.states.length-1,i));
  const fwd=anim&&i===R.i+1;R.i=i;
  S=JSON.parse(R.states[i]);let L=[];for(let k=Math.max(0,i-60);k<=i;k++)L=L.concat(R.lines[k]);S.log=L.slice(-80);
  if(!MAP||MAP.course!==S.course.id)MAP=mapFor(S);
  UI.mode='idle';UI.card=null;UI.picks=[];UI.buy=null;UI.pending=null;UI.piece=firstPiece();
  if(fwd&&R.evs[i])playEvents(R.evs[i]);
  render();
}
const replayNext=()=>REPLAY&&REPLAY.log.actions[REPLAY.i];
/* jump to the start of the next / previous turn */
function replayTurn(dir){const R=REPLAY;if(!R)return;let i=R.i;
  const turnAt=k=>{const s=JSON.parse(R.states[k]);return s.round*8+s.cur;};const t0=turnAt(i);
  if(dir>0){while(i<R.states.length-1&&turnAt(i)===t0)i++;}
  else{while(i>0&&turnAt(i-1)===t0)i--;if(i>0){i--;const t1=turnAt(i);while(i>0&&turnAt(i-1)===t1)i--;}}
  replayStop();replayGo(i,false);}
function replayPlay(){const R=REPLAY;if(!R)return;if(R.timer){replayStop();return;}
  if(R.i>=R.states.length-1)replayGo(0,false);
  // one move every ~1.3 s at Normal, with an extra pause when a turn ends
  const tick=()=>{if(!REPLAY)return;if(REPLAY.i>=REPLAY.states.length-1){replayStop();return;}
    const endTurn=(replayNext()||[])[1]&&replayNext()[1].t==='end';replayGo(REPLAY.i+1,true);
    REPLAY.timer=setTimeout(tick,(1300+(endTurn?900:0))/REPLAY.speed);};
  R.timer=setTimeout(tick,50);replayBar();}
function replayStop(){const R=REPLAY;if(R&&R.timer){clearTimeout(R.timer);R.timer=0;}replayBar();}
function exitReplay(){replayStop();REPLAY=null;$('#app').classList.remove('replaying');$('#rdock').hidden=true;$('#rside').hidden=true;$('#rdock').innerHTML='';
  try{const u=new URL(location.href);u.searchParams.delete('replay');history.replaceState(null,'',u);}catch(e){}
  for(const[,el]of cardEls)el.remove();cardEls.clear();S=null;if(!resumeSaved())showSetup();} // back to the local game in progress, if any

/* words for one action, read against the position before it */
function describeAction(a,st){
  const T=id=>CT[st.cards[id]]?CT[st.cards[id]].n:'?',sp=k=>{if(!k)return'';if(k[0]==='B'){const B=st.blockades[+k.slice(1)];return`blockade #${B?B.n:'?'}`;}const h=hexAt(k);return h?`${TERR[h.type]||h.type}${h.val>1?' '+h.val:''} <span class="m">(${fmtR(botCost(k))} left)</span>`:k;};
  const list=ids=>ids&&ids.length?ids.map(T).join(', '):'nothing';
  const stack=a=>{const s=a.src==='m'?st.market[a.idx]:st.reserve[a.idx];return s?CT[s.t].n:'?';};
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
function replayDecorate(){const a=replayNext();if(!a||!S||S.over)return;const x=a[1];
  if(x.to&&x.to[0]!=='B'&&hexAt(x.to))UI.targets=new Map([[x.to,{kind:x.t==='pay'?(hexAt(x.to).type==='c'?'camp':'rubble'):'move'}]]);}
function replayAfterRender(){const a=replayNext();for(const[,el]of cardEls)el.classList.remove('rnext','rpay');if(!a||!S||S.over)return;const x=a[1];
  if(x.card&&cardEls.has(x.card))cardEls.get(x.card).classList.add('rnext');
  for(const id of x.cards||x.keep||[])if(cardEls.has(id))cardEls.get(id).classList.add('rpay');}
function replayPromptHTML(){
  const R=REPLAY,n=R.log.actions.length,a=replayNext();
  if(!a)return`<b>End of the replay.</b> ${S.over?'The game is over.':'The log stops here'+(R.log.result&&R.log.result.capped?' (it hit the 25-round cap).':'.')}`;
  const pl=S.players[a[0]],st=JSON.parse(R.states[R.i]);
  const r0=R.rem[R.i][a[0]];
  return`<span class="who"><i style="background:${pl.color}"></i>${esc(pl.name)}</span>${describeAction(a[1],st)} <span class="m">· now ${fmtR(r0)} left</span>`;
}
const fmtR=x=>Math.round(x*10)/10;
/* Replay UI lives in its own grid cells (#rdock under the game, #rside beside it or under it on narrow screens),
   never on top of the game: the game area (#app) shrinks to make room, and everything in it lays itself out in
   the space it gets (container queries). Nothing here measures other elements, so nothing can overlap. */
const RSPEEDS=[['Slow','½×',.5],['Normal','1×',1],['Fast','2×',2],['Faster','4×',4]];
function replayBar(){
  const R=REPLAY;if(!R)return;const d=$('#rdock'),side=$('#rside');
  if(!d.firstChild){
    d.innerHTML=`<div class="rgrp"><button id="rbS" class="ends" title="Start (Home)" aria-label="Start">⏮</button><button id="rbT0" title="Previous turn (↑)" aria-label="Previous turn">«</button><button id="rbP" title="Back one move (←)" aria-label="Back one move">‹</button><button id="rbGo" class="pri" title="Play / pause (space)" aria-label="Play">▶</button><button id="rbN" title="Forward one move (→)" aria-label="Forward one move">›</button><button id="rbT1" title="Next turn (↓)" aria-label="Next turn">»</button><button id="rbE" class="ends" title="End (End)" aria-label="End">⏭</button></div>
      <div class="rspd" role="group" aria-label="Replay speed">${RSPEEDS.map(([t,s,v])=>`<button data-v="${v}" aria-label="${t}" title="${t}"><span class="lg">${t}</span><span class="sm">${s}</span></button>`).join('')}</div>
      <input type="range" id="rbR" min="0" value="0" aria-label="Position in the game"><span id="rbPos"></span>
      <button id="rbA" class="rtog" title="Show or hide the evaluation">Evaluation</button><div id="rbTxt" aria-live="polite"></div>`;
    const go=(i,an)=>{replayStop();replayGo(i,an);};
    d.querySelector('#rbS').onclick=()=>go(0);d.querySelector('#rbE').onclick=()=>go(1e9);
    d.querySelector('#rbP').onclick=()=>go(REPLAY.i-1);d.querySelector('#rbN').onclick=()=>go(REPLAY.i+1,true);
    d.querySelector('#rbT0').onclick=()=>replayTurn(-1);d.querySelector('#rbT1').onclick=()=>replayTurn(1);
    d.querySelector('#rbGo').onclick=replayPlay;
    d.querySelectorAll('.rspd button').forEach(b=>b.onclick=()=>{REPLAY.speed=+b.dataset.v;try{localStorage.setItem('eldorado-rspeed2',b.dataset.v);}catch(e){}replayBar();});
    d.querySelector('#rbA').onclick=()=>{REPLAY.side=!REPLAY.side;try{localStorage.setItem('eldorado-rside',REPLAY.side?'1':'0');}catch(e){}replayBar();};
    const rr=d.querySelector('#rbR');rr.oninput=()=>go(+rr.value);}
  d.hidden=false;side.hidden=!R.side;$('#app').classList.add('replaying');d.querySelector('#rbTxt').innerHTML=replayPromptHTML()+`<span class="rpos"> · move ${R.i} / ${R.states.length-1} · round ${S.round}</span>`;
  const n=R.states.length-1,gb=d.querySelector('#rbGo');gb.textContent=R.timer?'❚❚':'▶';gb.setAttribute('aria-label',R.timer?'Pause':'Play');
  d.querySelectorAll('.rspd button').forEach(b=>b.classList.toggle('on',+b.dataset.v===R.speed));
  const tg=d.querySelector('#rbA'),ok=replayEvalOK();tg.hidden=!ok;if(!ok)side.hidden=true;
  tg.classList.toggle('on',R.side);tg.setAttribute('aria-pressed',R.side?'true':'false');
  const rr=d.querySelector('#rbR');rr.max=n;rr.value=R.i;
  d.querySelector('#rbPos').textContent=`move ${R.i} / ${n} · round ${S.round}`;
  if(!R.side||!ok)return;
  const ev=replayEval(),pc=v=>v==null?'–':Math.round(v*100)+'%';
  let h=`<div class="rwh">Evaluation <span class="m">· estimated winning chances</span></div>`;
  if(!ev)h+=`<p class="m">Loading the network…</p>`;
  else h+=`<div class="revl">${S.players.map((p,j)=>`<div class="rev${j===S.cur&&!S.over?' now':''}"><i style="background:${p.color}"></i><span class="n">${esc(p.name)}</span><span class="bar"><span style="transform:scaleX(${ev.share[j]==null?0:Math.max(0,Math.min(1,ev.share[j]))})"></span></span><b>${p.resigned?'left':pc(ev.share[j])}</b></div>`).join('')}</div>`;
  const nx=replayNext(),st=JSON.parse(R.states[R.i]),alts=ev&&!S.over&&R.ex?replayAlts():null;
  if(ev&&!S.over)h+=`<button id="rbX" class="rexp" aria-expanded="${R.ex}">${R.ex?'Hide':'Show'} every option for ${esc(S.players[S.cur].name)}</button>`;
  if(alts){const chosen=nx?JSON.stringify(nx[1]):'';
    h+=alts.map((o,j)=>`<div class="ralt${JSON.stringify(o.a)===chosen?' on':''}" data-j="${j}"><b>${pc(o.v)}</b><span>${describeAction(o.a,st)}</span></div>`).join('');}
  side.innerHTML=h;
  const xb=side.querySelector('#rbX');if(xb)xb.onclick=()=>{R.ex=!R.ex;try{localStorage.setItem('eldorado-rexp',R.ex?'1':'0');}catch(e){}replayBar();};
  // hovering an option marks its space on the board
  side.querySelectorAll('.ralt').forEach(el=>{const o=alts[+el.dataset.j].a;
    el.onpointerenter=()=>{if(o.to&&o.to[0]!=='B'&&hexAt(o.to)){UI.targets=new Map([[o.to,{kind:'move'}]]);renderTargets();}};
    el.onpointerleave=()=>{computeTargets();replayDecorate();renderTargets();};});
}
/* replays list: upload a log file, or open a recent one */
function showReplays(){
  const html=`<h2>Replays</h2><p class="sub">Every finished game can be watched again move by move. You can also upload a game log (.json) to get a link you can share.</p>
    <div class="field"><label>Your games</label><div id="rMine" class="rlist"><p class="note">Loading…</p></div></div>
    <div class="field"><button class="btn" id="rUp">Upload a game log</button><input type="file" id="rFile" accept=".json,application/json" hidden> <span id="rMsg" class="note" style="margin-left:8px"></span></div>
    <div class="field"><label>Recent games and uploads</label><div id="rList" class="rlist"><p class="note">Loading…</p></div></div>
    <div class="mrow"><button class="btn" id="rBack">Back</button></div>`;
  modal(html,sc=>{
    sc.querySelector('#rBack').onclick=()=>{closeModal();setTimeout(()=>{if(!S||S.over)showSetup();},170);};
    const msg=sc.querySelector('#rMsg');
    sc.querySelector('#rUp').onclick=()=>sc.querySelector('#rFile').click();
    sc.querySelector('#rFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;msg.textContent='Uploading…';
      try{const text=await f.text();let log;try{log=JSON.parse(text);}catch(_){throw new Error('That file is not valid JSON.');}
        const err=replayCheck(log);if(err)throw new Error(err);
        let id=null;
        if(NET.available){const r=await fetch('/api/replays',{method:'POST',headers:{'content-type':'application/json'},body:text});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Upload failed ('+r.status+')');id=j.id;}
        openReplay(log,id);}
      catch(err){msg.textContent=err.message;}};
    // your games: finished local games on this device, and (signed in) your online games
    const mine=sc.querySelector('#rMine'),loc=myGames();
    const row=(attr,title,sub)=>`<button ${attr}><b>${esc(title)}</b><span>${esc(sub)}</span></button>`;
    const showMine=online=>{
      const items=[...loc.map(L=>({t:L.created,h:row(`data-lid="${esc(L.lid)}"`,L.title||'Game',`on this device · ${L.actions.length} moves · ${new Date(L.created).toLocaleString()}`)})),
        ...online.map(r=>({t:r.created,h:row(`data-id="${esc(r.id)}"`,r.title||r.players,`online · ${r.actions} moves · ${new Date(r.created).toLocaleString()}`)}))].sort((a,b)=>b.t-a.t);
      mine.innerHTML=items.length?items.map(x=>x.h).join(''):'<p class="note">No finished games yet. Games you finish here are kept to watch again.</p>';
      mine.querySelectorAll('button[data-lid]').forEach(b=>b.onclick=()=>{const L=loc.find(x=>x.lid===b.dataset.lid);if(L)openReplay(L,null);});
      mine.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>loadReplayId(b.dataset.id));};
    showMine([]);
    if(NET.available&&NET.user)api('/api/replays?mine=1').then(j=>showMine(j.replays||[])).catch(()=>{});
    const list=sc.querySelector('#rList');
    if(!NET.available){list.innerHTML='<p class="note">Uploading and the shared list need the online server; a file you pick still plays here.</p>';return;}
    fetch('/api/replays').then(r=>r.json()).then(j=>{const rs=j.replays||[];
      list.innerHTML=rs.length?rs.map(r=>`<button data-id="${esc(r.id)}"><b>${esc(r.title||r.players)}</b><span>${esc(r.players)} · ${r.actions} moves · ${new Date(r.created).toLocaleString()}</span></button>`).join(''):'<p class="note">No replays yet.</p>';
      list.querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>loadReplayId(b.dataset.id));}).catch(()=>{list.innerHTML='<p class="note">Could not load the list.</p>';});
  },true);
}
function openReplay(log,id){
  try{const u=new URL(location.href);u.searchParams.delete('room');if(id)u.searchParams.set('replay',id);else u.searchParams.delete('replay');history.replaceState(null,'',u);}catch(e){}
  startReplay(log,id);
}
async function loadReplayId(id){
  try{const r=await fetch('/api/replays/'+encodeURIComponent(id));const j=await r.json();if(!r.ok)throw new Error(j.error||'not found');openReplay(j,id);}
  catch(e){toast('Could not load replay '+id+': '+e.message,3500);showSetup();}
}
function replayKeys(e){if(!REPLAY||e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||document.querySelector('#overlay .modal'))return false;
  const R=REPLAY,k=e.key;
  if(k==='ArrowRight'){replayStop();replayGo(R.i+1,true);}else if(k==='ArrowLeft'){replayStop();replayGo(R.i-1);}
  else if(k==='ArrowDown')replayTurn(1);else if(k==='ArrowUp')replayTurn(-1);
  else if(k===' ')replayPlay();else if(k==='Home'){replayStop();replayGo(0);}else if(k==='End'){replayStop();replayGo(1e9);}
  else return false;
  e.preventDefault();return true;}

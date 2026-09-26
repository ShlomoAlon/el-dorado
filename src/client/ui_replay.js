/* =========================================================
   REPLAYS: step through a recorded game (tools/ai/record.mjs, or any uploaded game log).
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
      const[seat,a]=log.actions[i];S.log=[];
      let r=seat===S.cur&&!S.over?applyAction(seat,a):{ok:false,err:'not '+(S.players[seat]||{}).name+'’s turn'};
      if(!r.ok){fails.push(i+1);r=applyAction(S.cur,{t:'end',keep:[]});}
      lines.push(S.log.slice());evs.push(r.ev||null);snap();
    }
  }finally{setRng(null);}
  return{log,id,states,lines,evs,rem,fails,i:0,timer:0,speed:+(localStorage.getItem('eldorado-rspeed')||1)||1};
}
function startReplay(log,id){
  let R;try{R=buildReplay(log,id);}catch(e){console.error(e);toast('Could not load that replay: '+e.message,3500);showSetup();return;}
  closeModal();REPLAY=R;undoStack=[];
  for(const[,el]of cardEls)el.remove();cardEls.clear();
  S=JSON.parse(R.states[0]);MAP=mapFor(S);buildBoard();lastPlayer=-1;replayGo(0,false);fit();
  banner(log.title||'Replay',`${log.players.length} players · ${log.actions.length} moves`);
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
  const tick=()=>{if(!REPLAY)return;if(REPLAY.i>=REPLAY.states.length-1){replayStop();return;}replayGo(REPLAY.i+1,true);REPLAY.timer=setTimeout(tick,(reduceMotion?500:750)/REPLAY.speed);};
  R.timer=setTimeout(tick,50);replayBar();}
function replayStop(){const R=REPLAY;if(R&&R.timer){clearTimeout(R.timer);R.timer=0;}replayBar();}
function exitReplay(){replayStop();REPLAY=null;const b=$('#rbar');if(b)b.remove();
  try{const u=new URL(location.href);u.searchParams.delete('replay');history.replaceState(null,'',u);}catch(e){}
  for(const[,el]of cardEls)el.remove();cardEls.clear();S=null;showSetup();}

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
function replayBar(){
  const R=REPLAY;if(!R)return;let b=$('#rbar');
  if(!b){b=document.createElement('div');b.id='rbar';b.className='glass';$('#app').appendChild(b);
    b.innerHTML=`<div class="rrow"><button id="rbS" title="Start (Home)">⏮</button><button id="rbT0" title="Previous turn (↑)">«</button><button id="rbP" title="Back one move (←)">‹</button><button id="rbGo" class="pri" title="Play / pause (space)">▶</button><button id="rbN" title="Forward one move (→)">›</button><button id="rbT1" title="Next turn (↓)">»</button><button id="rbE" title="End (End)">⏭</button><select id="rbSp" aria-label="Speed">${[.5,1,2,4,8].map(v=>`<option value="${v}">${v}×</option>`).join('')}</select><span id="rbPos"></span></div>
      <input type="range" id="rbR" min="0" value="0" aria-label="Position in the game"><div id="rbWhy"></div>`;
    const go=(i,an)=>{replayStop();replayGo(i,an);};
    b.querySelector('#rbS').onclick=()=>go(0);b.querySelector('#rbE').onclick=()=>go(1e9);
    b.querySelector('#rbP').onclick=()=>go(REPLAY.i-1);b.querySelector('#rbN').onclick=()=>go(REPLAY.i+1,true);
    b.querySelector('#rbT0').onclick=()=>replayTurn(-1);b.querySelector('#rbT1').onclick=()=>replayTurn(1);
    b.querySelector('#rbGo').onclick=replayPlay;
    const sp=b.querySelector('#rbSp');sp.value=String(R.speed);sp.onchange=()=>{REPLAY.speed=+sp.value;try{localStorage.setItem('eldorado-rspeed',sp.value);}catch(e){}};
    const rr=b.querySelector('#rbR');rr.oninput=()=>go(+rr.value);}
  const n=R.states.length-1;b.querySelector('#rbGo').textContent=R.timer?'❚❚':'▶';
  const rr=b.querySelector('#rbR');rr.max=n;rr.value=R.i;
  b.querySelector('#rbPos').textContent=`move ${R.i} / ${n} · round ${S.round}`;
  // what the bot thought of this decision (recorded with the log): its top options and their estimated chance to finish ahead
  const note=R.log.notes&&R.log.notes[R.i],w=b.querySelector('#rbWhy'),st=JSON.parse(R.states[R.i]);
  const bot=R.log.players[(replayNext()||[S.cur])[0]].bot;
  if(note&&note.alts&&replayNext()){const chosen=JSON.stringify(replayNext()[1]);
    w.innerHTML=`<div class="rwh">Bot's options here <span class="m">(estimated chance to finish ahead)</span></div>`+note.alts.map((o,j)=>`<div class="ralt${JSON.stringify(o.a)===chosen?' on':''}" data-j="${j}"><b>${o.v==null?'–':Math.round(o.v*100)+'%'}</b><span>${describeAction(o.a,st)}</span></div>`).join('');w.hidden=false;
    // hovering an option marks its space on the board
    w.querySelectorAll('.ralt').forEach(el=>{const o=note.alts[+el.dataset.j].a;
      el.onpointerenter=()=>{if(o.to&&o.to[0]!=='B'&&hexAt(o.to)){UI.targets=new Map([[o.to,{kind:'move'}]]);renderTargets();}};
      el.onpointerleave=()=>{computeTargets();replayDecorate();renderTargets();};});}
  else{w.innerHTML='';w.hidden=true;}
}
/* replays list: upload a log file, or open a recent one */
function showReplays(){
  const html=`<h2>Replays</h2><p class="sub">Watch a recorded game move by move. Upload a game log (.json) to get a link you can share.</p>
    <div class="field"><button class="btn pri" id="rUp">Upload a game log</button><input type="file" id="rFile" accept=".json,application/json" hidden> <span id="rMsg" class="note" style="margin-left:8px"></span></div>
    <div class="field"><label>Recent replays</label><div id="rList" class="rlist"><p class="note">Loading…</p></div></div>
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

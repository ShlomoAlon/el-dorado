/* =========================================================
   ONLINE — talks to the game server (Cloudflare Worker).
   Sign in with Google → hub (profile, rooms, leaderboard) → room lobby → game.
   ========================================================= */
async function api(path,opts={}){
  const headers={'content-type':'application/json'};if(NET.token)headers.authorization='Bearer '+NET.token;
  const r=await fetch(path,{...opts,headers});
  let j={};try{j=await r.json();}catch(e){}
  if(!r.ok){const e=new Error(j.error||('Request failed ('+r.status+')'));e.status=r.status;throw e;}
  return j;
}
async function netInit(){
  if(location.protocol==='file:'||/claude\.ai$|claudeusercontent/.test(location.hostname))return;
  try{NET.cfg=await api('/api/config');NET.available=true;}catch(e){NET.available=false;return;}
  try{NET.token=localStorage.getItem('ed-token');}catch(e){}
  if(NET.token){try{const r=await api('/api/me');NET.user=r.user;NET.active=r.active;}catch(e){if(e.status===401){NET.token=null;try{localStorage.removeItem('ed-token');}catch(_){}}}}
}
function signedIn(r,after){
  NET.token=r.token;NET.user=r.user;try{localStorage.setItem('ed-token',r.token);}catch(e){}
  if(r.isNew)toast('Welcome, '+r.user.name+'! You can change your name any time.',3000);
  if(NET.pendingRoom){const c=NET.pendingRoom;NET.pendingRoom=null;joinRoom(c);return;}
  (after||showHub)();
}
/* the Google sign-in button, drawn into el. after(): what to show once signed in (default: the Online screen) */
function gsiMount(el,err,after,size){if(!el||!NET.cfg||!NET.cfg.google)return;
  loadGsi().then(()=>{google.accounts.id.initialize({client_id:NET.cfg.google,callback:async r=>{try{signedIn(await api('/api/auth/google',{method:'POST',body:JSON.stringify({credential:r.credential})}),after);}catch(e){err(e.message);}}});
    if(el.isConnected)google.accounts.id.renderButton(el,{theme:'filled_black',size:size||'large',shape:'pill',text:'signin_with'});}).catch(()=>err('Could not load Google sign-in.'));}
function signOut(then){NET.token=null;NET.user=null;try{localStorage.removeItem('ed-token');}catch(e){}closeLobbyWs();(then||showHub)();}
let gsiLoading=null;
function loadGsi(){if(window.google&&google.accounts)return Promise.resolve();if(!gsiLoading)gsiLoading=new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=res;s.onerror=rej;document.head.appendChild(s);});return gsiLoading;}
function wsUrl(path){return(location.protocol==='https:'?'wss://':'ws://')+location.host+path+(path.includes('?')?'&':'?')+'t='+encodeURIComponent(NET.token);}

/* ---------- hub ---------- */
let hubTab='play';
function hubHTML(){
  const u=NET.user;
  if(!NET.available)return`<h2>Play online</h2><p class="sub">Online play runs from the game's own website. This copy can't reach the game server.</p><div class="mrow"><button class="btn" id="hBack">Back</button></div>`;
  if(!u)return`<h2>Play online</h2><p class="sub">Sign in so your rating follows you. Rated games move your Elo rating, and you can play against people, the AIs, or both.</p>
    ${NET.cfg.google?'<div id="gsiBtn"></div>':'<p class="note" style="color:#f3c98b">Google sign-in isn’t configured on the server yet (GOOGLE_CLIENT_ID).</p>'}
    ${NET.cfg.dev?'<div class="field" style="margin-top:16px"><label>Developer sign-in (local testing only)</label><div class="prow"><input id="devName" maxlength="16" placeholder="Name"><button class="btn" id="devGo">Sign in</button></div></div>':''}
    <p class="note" id="hErr"></p>
    <div class="mrow"><button class="btn" id="hBack">Back</button></div>`;
  const tabs=`<div class="seg" id="hTabs" style="margin-bottom:16px">${[['play','Play'],['board','Leaderboard'],['me','Profile']].map(([k,t])=>`<button data-k="${k}" class="${hubTab===k?'on':''}">${t}</button>`).join('')}</div>`;
  const head=`<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap"><h2>Online</h2><span class="note" style="margin:0"><b style="color:var(--text)">${esc(u.name)}</b> · rating <b style="color:var(--gold2)">${Math.round(u.rating)}</b> · ${plural(u.games,'game')} · <button class="linkbtn" id="hOut2">Sign out</button></span></div>`;
  if(hubTab==='board')return head+tabs+`<div id="lbList"><p class="note">Loading…</p></div><div class="mrow"><button class="btn" id="hBack">Back</button></div>`;
  if(hubTab==='me')return head+tabs+`<div class="field"><label>Display name</label><div class="prow"><input id="meName" maxlength="16" value="${esc(u.name)}"><button class="btn" id="meSave">Save</button></div></div>
    <p class="note">${plural(u.wins,'win')} in ${plural(u.games,'game')} (rated). Everyone starts at 1200, the AIs too; ratings move faster during a player's first 10 games. Unrated games don't count.</p>
    <div class="mrow"><button class="btn" id="hOut">Sign out</button><button class="btn" id="hBack">Back</button></div>`;
  const rooms=NET.rooms.filter(r=>r.status==='lobby');const live=NET.rooms.filter(r=>r.status==='playing');
  const rrow=r=>`<div class="prow" style="justify-content:space-between;padding:9px 12px;border-radius:10px;background:#0c1512;border:1px solid var(--line)"><span>${r.auto?'<b>Quick match</b>':`<b>${esc(r.host)}</b>’s room`} <span class="note" style="margin:0">· ${r.count}/${r.max}${r.ai?` (${r.ai} AI)`:''} · ${r.turn}s turns · ${r.rated===false?'unrated':'rated'} · ${esc(courseName(r.course))}</span></span>${r.status==='lobby'&&r.count<r.max?`<button class="btn" data-join="${r.code}">Join</button>`:'<span class="note" style="margin:0">in progress</span>'}</div>`;
  return head+tabs+`
    ${NET.active?`<div class="prow" style="padding:10px 12px;border-radius:10px;border:1px solid var(--gold);background:rgba(233,178,74,.1);justify-content:space-between"><span>You have a game in progress.</span><button class="btn pri" data-join="${NET.active}">Rejoin</button></div>`:''}
    <div class="field"><label>Quick match</label>
      <div class="prow" style="justify-content:space-between;padding:10px 12px;border-radius:10px;background:#0c1512;border:1px solid var(--line)"><span class="note" style="margin:0">Join the next public game. It starts as soon as 3 players are in (90 s turns, rated).</span><button class="btn pri" id="qGo">Quick match</button></div></div>
    <div class="field"><label>Create a room</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <div class="seg" id="cPub"><button data-v="1" class="${setup.oPub?'on':''}">Public</button><button data-v="0" class="${setup.oPub?'':'on'}">Private</button></div>
        <div class="seg" id="cMax">${[2,3,4].map(n=>`<button data-v="${n}" class="${setup.oMax===n?'on':''}">${n} players</button>`).join('')}</div>
        <div class="seg" id="cRated"><button data-v="1" class="${setup.oRated?'on':''}">Rated</button><button data-v="0" class="${setup.oRated?'':'on'}">Unrated</button></div>
        <div class="seg" id="cTurn">${[60,90,120,180].map(n=>`<button data-v="${n}" class="${setup.oTurn===n?'on':''}">${n<120?n+'s':(n/60)+' min'}</button>`).join('')}</div>
      </div>
      <div style="margin-top:10px">${coursePicker('cCourse',setup.oCourse)}</div>
      <p class="note">${setup.oPub?'Public rooms are listed below for anyone to join.':'Private rooms are not listed; share the code or link.'} ${setup.oRated?'Rated: the result changes everyone’s rating, AIs included.':'Unrated: a friendly game, ratings stay as they are.'} You can add AI players in the room. Turn timer: when it runs out the turn ends automatically; missing 3 turns in a row forfeits.</p>
      <div style="margin-top:10px"><button class="btn pri big" id="cGo">Create room</button></div></div>
    <div class="field"><label>Join with a code</label><div class="prow"><input id="jCode" maxlength="5" placeholder="e.g. K7Q2M" style="text-transform:uppercase;letter-spacing:.15em;font-weight:700" autocomplete="off"><button class="btn" id="jGo">Join</button></div></div>
    <div class="field"><label>Open rooms</label>${rooms.map(rrow).join('')||'<p class="note">No open rooms right now. Create one and share the code.</p>'}</div>
    ${live.length?`<div class="field"><label>Games in progress</label>${live.map(rrow).join('')}</div>`:''}
    <p class="note" id="hErr" style="color:#f3c98b"></p>
    <div class="mrow"><button class="btn" id="hBack">Back</button></div>`;
}
function showHub(){
  if(NET.user)openLobbyWs(); // also right after signing in, when the hub is already open
  if(document.querySelector('#overlay .modal.hub')){renderHub();return;}
  modal('',sc=>{sc.querySelector('.modal').classList.add('hub');renderHub();},false);
}
function renderHub(){
  const m=document.querySelector('#overlay .modal.hub');if(!m)return;
  const focus=document.activeElement&&document.activeElement.id;const jv=m.querySelector('#jCode')?.value;
  m.innerHTML=hubHTML();
  if(jv&&m.querySelector('#jCode'))m.querySelector('#jCode').value=jv;
  if(focus&&m.querySelector('#'+focus))m.querySelector('#'+focus).focus();
  const q=s=>m.querySelector(s);const err=t=>{const e=q('#hErr');if(e)e.textContent=t;};
  q('#hBack').onclick=()=>{closeLobbyWs();showSetup();};
  if(!NET.available)return;
  if(!NET.user){
    gsiMount(q('#gsiBtn'),err);
    const dg=q('#devGo');if(dg)dg.onclick=async()=>{try{signedIn(await api('/api/auth/dev',{method:'POST',body:JSON.stringify({name:q('#devName').value||'Tester'})}));}catch(e){err(e.message);}};
    return;
  }
  m.querySelectorAll('#hTabs button').forEach(b=>b.onclick=()=>{hubTab=b.dataset.k;renderHub();});
  q('#hOut2').onclick=()=>signOut();
  if(hubTab==='board'){api('/api/leaderboard').then(r=>{const l=q('#lbList');if(!l)return;
    l.innerHTML=r.players.length?`<div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:6px 14px;font-size:14px;font-variant-numeric:tabular-nums">${r.players.map((p,i)=>{const A=p.bot&&aiById(p.bot);return`<span style="color:var(--muted)">${i+1}</span><span style="display:flex;align-items:center;gap:7px;min-width:0"><b style="${p.id===myId()?'color:var(--gold2)':''}">${esc(p.name)}</b>${A?`<span class="aitag" title="${esc(A.desc)}">AI</span><span class="note" style="margin:0">${esc(A.tier)}</span>`:''}</span><span>${Math.round(p.rating)}</span><span style="color:var(--muted)">${p.wins}/${p.games}</span>`;}).join('')}</div><p class="note" style="margin-top:12px">Wins / rated games. The AI players are rated like everyone else: beat them to gain rating. Their starting ratings come from hundreds of games against each other; Raleigh (Steady) starts where every new player does, at 1200.</p>`:'<p class="note">No rated games yet.</p>';}).catch(e=>{const l=q('#lbList');if(l)l.textContent=e.message;});return;}
  if(hubTab==='me'){q('#meSave').onclick=async()=>{try{const r=await api('/api/me',{method:'PATCH',body:JSON.stringify({name:q('#meName').value})});NET.user=r.user;toast('Saved as '+r.user.name);renderHub();}catch(e){toast(e.message);}};q('#hOut').onclick=()=>signOut();return;}
  const seg=(id,key)=>m.querySelectorAll(id+' button').forEach(b=>b.onclick=()=>{setup[key]=+b.dataset.v;renderHub();});
  seg('#cMax','oMax');seg('#cTurn','oTurn');
  m.querySelectorAll('#cPub button').forEach(b=>b.onclick=()=>{setup.oPub=b.dataset.v==='1';renderHub();});
  m.querySelectorAll('#cRated button').forEach(b=>b.onclick=()=>{setup.oRated=b.dataset.v==='1';renderHub();});
  q('#qGo').onclick=async()=>{try{const r=await api('/api/match',{method:'POST',body:'{}'});joinRoom(r.code);}catch(e){err(e.message);}};
  m.querySelectorAll('#cCourse button').forEach(b=>b.onclick=()=>{setup.oCourse=b.dataset.c;renderHub();});
  q('#cGo').onclick=async()=>{try{const r=await api('/api/rooms',{method:'POST',body:JSON.stringify({max:setup.oMax,turn:setup.oTurn,course:setup.oCourse,pub:setup.oPub,rated:setup.oRated})});joinRoom(r.code);}catch(e){err(e.message);}};
  const jc=q('#jCode');q('#jGo').onclick=()=>{const c=(jc.value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length<4){err('Enter the 5-letter room code.');return;}joinRoom(c);};
  jc.onkeydown=e=>{if(e.key==='Enter')q('#jGo').click();};
  m.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>joinRoom(b.dataset.join));
}
function openLobbyWs(){
  if(NET.lobbyWs||!NET.user)return;
  const ws=new WebSocket(wsUrl('/api/lobby/ws'));NET.lobbyWs=ws;
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch(_){return;}if(m.t==='rooms'){NET.rooms=m.rooms;const me=myId();renderHub();}};
  ws.onclose=()=>{if(NET.lobbyWs===ws)NET.lobbyWs=null;};
}
function closeLobbyWs(){if(NET.lobbyWs){try{NET.lobbyWs.close();}catch(e){}NET.lobbyWs=null;}}

/* ---------- room connection ---------- */
function netSend(m){if(NET.ws&&NET.ws.readyState===1)NET.ws.send(JSON.stringify(m));else{NET.busy=false;toast('Reconnecting…');}}
function joinRoom(code){
  closeLobbyWs();leaveRoomSocket();
  NET.room={code,status:'connecting',seats:[]};NET.code=code;NET.retries=0;
  try{history.replaceState(null,'',location.pathname+'?room='+code);}catch(e){}
  connectRoom();showRoomLobby();
}
function leaveRoomSocket(){if(NET.ws){const w=NET.ws;NET.ws=null;try{w.close();}catch(e){}}clearTimeout(NET.retryT);NET.connected=false;}
function connectRoom(){
  const code=NET.code;if(!code)return;
  const ws=new WebSocket(wsUrl('/api/rooms/'+code+'/ws'));NET.ws=ws;
  ws.onopen=()=>{NET.connected=true;NET.retries=0;NET.status='';if(S)render();};
  ws.onmessage=e=>{if(e.data==='pong')return;let m;try{m=JSON.parse(e.data);}catch(_){return;}onRoomMsg(m);};
  ws.onclose=ev=>{
    if(NET.ws!==ws)return;NET.connected=false;NET.ws=null;
    if(ev.code===1000||!NET.code){return;}
    NET.status='Connection lost. Reconnecting…';if(S)render();renderRoomLobby();
    NET.retries++;if(NET.retries>8&&!S){NET.status='Could not reach this room. It may have closed.';renderRoomLobby();return;}
    NET.retryT=setTimeout(connectRoom,Math.min(8000,800*NET.retries));
  };
  clearInterval(NET.pingT);NET.pingT=setInterval(()=>{if(NET.ws&&NET.ws.readyState===1)NET.ws.send('ping');},25000);
}
function onRoomMsg(m){
  if(m.t==='error'){NET.busy=false;sfx('error');toast(m.msg);if(S)render();return;}
  if(m.t==='room'){NET.room=m.room;if(m.room.status==='closed'){NET.code=null;leaveRoomSocket();toast('The host closed the room.');showHub();return;}renderRoomLobby();return;}
  if(m.t==='state'){NET.room=m.room;NET.seat=m.seat;NET.canUndo=!!m.undo;NET.deadline=m.deadline;NET.skew=m.now-Date.now();NET.busy=false;applyServerState(m.S,m.ev);}
}
function applyServerState(S2,ev){
  const old=S;const fresh=!old||!old.owners||old.seed!==S2.seed||old.room!==S2.room;
  S=S2;
  if(fresh){for(const[,el]of cardEls)el.remove();cardEls.clear();MAP=mapFor(S);buildBoard();closeModal();lastPlayer=-1;UI.cover=false;fit();setTimeout(()=>{if(!userZoomed)fit();},0);} // again once render() has sized the market (--mktFoot), as local games do
  const turnChanged=fresh||old.cur!==S.cur||old.round!==S.round;
  if(!fresh)playEvents(ev,viewIdx());
  // the only thing that changes the game during my turn is me, so any new state closes pick modes
  UI.picks=[];UI.buy=null;UI.pending=null;if(['pay','discardFor','transmit','endTurn'].includes(UI.mode)){UI.mode='idle';UI.card=null;}
  syncMode(turnChanged);
  render();
  if(S.over&&(fresh||!old.over)){setTimeout(()=>showGameOver(),700);return;}
  if(turnChanged&&!S.over){banner(canAct()?'Your turn':cur().name,canAct()?'Round '+S.round:'Round '+S.round);ensureVisible();}
}
function resignOnline(){
  modal(`<h2>Leave this game?</h2><p class="sub">${NET.room&&NET.room.opts&&NET.room.opts.rated===false?'Leaving counts as finishing last among the players still racing (this game is unrated).':'Leaving a rated game counts as finishing last among the players still racing. Your rating will drop.'}</p><div class="mrow"><button class="btn" id="rsNo">Stay</button><button class="btn pri" id="rsYes">Leave game</button></div>`,sc=>{
    sc.querySelector('#rsNo').onclick=closeModal;sc.querySelector('#rsYes').onclick=()=>{netSend({t:'resign'});closeModal();};},true);
}
function exitOnline(){NET.code=null;leaveRoomSocket();S=null;try{history.replaceState(null,'',location.pathname);}catch(e){}for(const[,el]of cardEls)el.remove();cardEls.clear();}

/* ---------- pre-game room lobby ---------- */
function roomLobbyHTML(){
  const r=NET.room||{};const host=r.host===myId();const link=location.origin+location.pathname+'?room='+NET.code;
  const seats=(r.seats||[]).map(s=>{const A=s.ai&&aiById(s.ai);return`<div class="prow" style="justify-content:space-between;padding:0 12px;border-radius:10px;background:#0c1512;border:1px solid var(--line);min-height:48px;box-sizing:border-box"><span style="display:flex;align-items:center;gap:9px;min-width:0"><i style="width:13px;height:13px;border-radius:50%;background:${s.color};display:inline-block;flex:none"></i><b>${esc(s.name)}</b>${A?'<span class="aitag">AI</span>':''}${s.uid===myId()?' <span class="note" style="margin:0">(you)</span>':''}</span>${A?`<span style="display:flex;align-items:center;gap:10px"><span class="note" style="margin:0">${esc(A.tier)}</span>${host&&r.status==='lobby'?`<button class="rmai" data-rmai="${esc(s.uid)}" aria-label="Remove ${esc(s.name)}" title="Remove">×</button>`:''}</span>`:`<span class="note" style="margin:0">${s.now?'wants to start · ':''}${s.uid===r.host&&!(r.opts&&r.opts.auto)?'host · ':''}${s.online?'here':'away'}</span>`}</div>`;}).join('');
  const auto=!!(r.opts&&r.opts.auto),room=(r.seats||[]).length<(r.opts?r.opts.max:4),rated=!(r.opts&&r.opts.rated===false);
  const aiOK=!!(r.opts&&aiCourseOK(r.opts.course)&&r.opts.max>=3);
  const addAI=host&&!auto&&r.status==='lobby'?`<div class="field"><label>Add an AI player</label>${!aiOK?'<div class="aiNote">AI players are available on First Expedition with 3 or 4 players for now.</div>':room?`<div class="clist ailist">${AIS.map(a=>{const on=(r.seats||[]).some(s=>s.ai===a.id);return`<button data-addai="${a.id}" ${on?'disabled':''}><b>${esc(a.name)} <span class="aitag">AI</span></b><span>${esc(a.tier)} · ${esc(a.desc)}</span></button>`;}).join('')}</div>`:'<p class="note">The room is full. Remove an AI to add another.</p>'}<p class="note">AI players move on the server${rated?' and gain or lose rating like everyone else':''}.</p></div>`:'';
  const ratedCtl=host&&!auto&&r.status==='lobby'?`<div class="field"><label>Rating</label><div class="seg" id="rlRated"><button data-v="1" class="${rated?'on':''}">Rated</button><button data-v="0" class="${rated?'':'on'}">Unrated</button></div></div>`:'';
  const mine=(r.seats||[]).find(s=>s.uid===myId());
  const PC=COLORS.map(c=>c.hex);
  return`<h2>Room ${esc(NET.code||'')}</h2>
  <p class="sub">${r.opts&&r.opts.auto?`Quick match: the game starts as soon as ${r.opts.max} players are here, or earlier if everyone here presses “Start now”.`:host?'Share the code or link. Start when everyone is here.':'Waiting for the host to start.'} ${r.opts?`${esc(courseName(r.opts.course))} · ${r.opts.auto?'':(r.opts.pub===false?'private · ':'public · ')+r.opts.max+' players max · '}${r.opts.turn}s per turn · ${r.opts.rated===false?'unrated':'rated'}`:''}</p>
  <div class="prow"><input id="lkIn" readonly value="${esc(link)}"><button class="btn" id="lkCopy">Copy link</button></div>
  <div class="field" style="margin-top:14px"><label>Players ${(r.seats||[]).length}/${r.opts?r.opts.max:4}</label>${seats||'<p class="note">Connecting…</p>'}</div>
  ${addAI}${ratedCtl}
  ${mine?`<div class="field"><label>Your colour</label><div class="sws">${PC.map(c=>`<button data-col="${c}" style="--c:${c}" class="${mine.color===c?'on':''}" ${(r.seats||[]).some(s=>s!==mine&&s.color===c)?'disabled':''}></button>`).join('')}</div></div>`:(r.status==='lobby'&&r.seats?'<p class="note">This room is full.</p>':'')}
  ${NET.status?`<p class="note" style="color:#f3c98b">${esc(NET.status)}</p>`:''}
  <div class="mrow"><button class="btn" id="rlLeave">${host&&!(r.opts&&r.opts.auto)?'Close room':'Leave'}</button>${r.opts&&r.opts.auto&&mine?`<button class="btn${mine.now?'':' pri'} big" id="rlNow" ${(r.seats||[]).length<2?'disabled':''}>${mine.now?'Waiting for the others… (cancel)':'Start now'}</button>`:host&&!(r.opts&&r.opts.auto)?`<button class="btn pri big" id="rlStart" ${(r.seats||[]).length<2?'disabled':''}>Start game</button>`:''}</div>`;
}
function showRoomLobby(){modal('',sc=>{sc.querySelector('.modal').classList.add('roomlobby');renderRoomLobby();},false);}
function renderRoomLobby(){
  const m=document.querySelector('#overlay .modal.roomlobby');if(!m)return;
  m.innerHTML=roomLobbyHTML();
  m.querySelector('#lkCopy').onclick=()=>{const i=m.querySelector('#lkIn');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value).then(()=>toast('Link copied')).catch(()=>{});};
  m.querySelectorAll('[data-col]').forEach(b=>b.onclick=()=>netSend({t:'color',color:b.dataset.col}));
  m.querySelector('#rlLeave').onclick=()=>{netSend({t:'leave'});NET.code=null;leaveRoomSocket();try{history.replaceState(null,'',location.pathname);}catch(e){}showHub();};
  const st=m.querySelector('#rlStart');if(st)st.onclick=()=>netSend({t:'start'});
  const nw=m.querySelector('#rlNow');if(nw)nw.onclick=()=>netSend({t:'now'});
  m.querySelectorAll('[data-addai]').forEach(b=>b.onclick=()=>netSend({t:'addAI',ai:b.dataset.addai}));
  m.querySelectorAll('[data-rmai]').forEach(b=>b.onclick=()=>netSend({t:'removeAI',uid:b.dataset.rmai}));
  m.querySelectorAll('#rlRated button').forEach(b=>b.onclick=()=>netSend({t:'rated',v:b.dataset.v==='1'}));
}

/* ---------- turn timer (shown in the prompt bar) ---------- */
function timeLeft(){if(!online()||!NET.deadline||S.over)return null;return Math.max(0,Math.round((NET.deadline-(Date.now()+NET.skew))/1000));}
function renderTimer(){
  const el=document.getElementById('turnTimer');if(!el)return;
  const t=timeLeft();if(t===null){el.hidden=true;return;}
  if(t<10&&t>0&&t!==SND.lastT&&canAct())sfx('timer');SND.lastT=t;
  el.hidden=false;const mm=Math.floor(t/60),ss=String(t%60).padStart(2,'0');
  el.textContent=mm+':'+ss;el.classList.toggle('low',t<=15);
}
setInterval(()=>{if(online())renderTimer();},500);
function updateTitle(){try{document.title=(online()&&canAct()&&!S.over?'● Your turn · ':'')+'El Dorado Expedition';}catch(e){}}

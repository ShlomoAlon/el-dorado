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
  if(NET.token){try{const r=await api('/api/me');NET.user=r.user;NET.active=r.active;loadProfile(r.user.id).catch(()=>{});}catch(e){if(e.status===401){NET.token=null;try{localStorage.removeItem('ed-token');}catch(_){}}}}
}
function signedIn(r,after){
  NET.token=r.token;NET.user=r.user;try{localStorage.setItem('ed-token',r.token);}catch(e){}loadProfile(r.user.id).catch(()=>{});
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

function openLobbyWs(){
  if(NET.lobbyWs||!NET.user)return;
  const ws=new WebSocket(wsUrl('/api/lobby/ws'));NET.lobbyWs=ws;
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch(_){return;}if(m.t==='rooms'){NET.rooms=m.rooms;roomsRender();}};
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
    sc.querySelector('#rsNo').onclick=closeModal;sc.querySelector('#rsYes').onclick=()=>{netSend({t:'act',a:{t:'resign'}});closeModal();};},true);
}
function exitOnline(){NET.code=null;leaveRoomSocket();S=null;try{history.replaceState(null,'',location.pathname);}catch(e){}for(const[,el]of cardEls)el.remove();cardEls.clear();}

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

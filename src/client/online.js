/* ONLINE — talks to the game server (Cloudflare Worker).
   Sign in with Google → hub (profile, rooms, leaderboard) → room lobby → game. */
import {  } from '../engine.gen.js';
import { S, setS, UI, NET, online, viewIdx, myId } from './state.js';
import { render, resetView } from './frame.js';
import { toast, modal, closeModal } from './dialogs.js';
import { MENU, showHub, showRoomLobby, renderRoomLobby, roomsRender, loadProfile } from './menu.js';
import { showGame, playEvents, afterChange } from './actions.js';
import { sfx } from './sound.js';
import { diag } from './debug.js';
import { load, store } from './store.js';
import { setQuery } from './dom.js';
export async function api(path,opts={}){
  const headers={'content-type':'application/json'};if(NET.token)headers.authorization='Bearer '+NET.token;
  // (no connection: fetch's own TypeError, in the browser's words ("Failed to fetch"); said in the page's)
  let r;try{r=await fetch(path,{...opts,headers});}catch(e){if(!(e instanceof TypeError))throw e;const x=new Error('Could not reach the server. Check your connection and try again.');x.offline=true;throw x;}
  let j={};try{j=await r.json();}catch(e){/* expected: a reply that isn't JSON (a proxy's error page): the status below says what failed */}
  if(!r.ok){const e=new Error(j.err||('Request failed ('+r.status+')'));e.status=r.status;throw e;}
  return j;
}
/* the page came from the game server (not a file, not the claude.ai artifact, where nothing can be reached) */
export const HAS_SERVER=!(location.protocol==='file:'||/claude\.ai$|claudeusercontent/.test(location.hostname));
export async function netInit(){
  if(!HAS_SERVER)return;
  // (both asked at once: one round trip; who's signed in doesn't depend on the server's settings)
  NET.token=load('token');const cfg=api('/api/config'),me=NET.token?api('/api/me'):null;
  try{NET.cfg=await cfg;NET.available=true;}catch(e){NET.available=false;if(me)me.catch(()=>{/* expected: the server is out of reach (its config failed too) */});return;}
  if(NET.token){try{const r=await me;NET.user=r.user;NET.active=r.active;loadProfile(r.user.id).catch(e=>diag('profile: '+e.message));}catch(e){if(e.status===401){NET.token=null;store('token',null);}}}
}
export function signedIn(r,after){
  NET.token=r.token;NET.user=r.user;store('token',r.token);loadProfile(r.user.id).catch(e=>diag('profile: '+e.message));
  if(r.isNew)toast('Welcome, '+r.user.name+'! You can change your name any time.',3000);
  if(NET.pendingRoom){const c=NET.pendingRoom;NET.pendingRoom=null;joinRoom(c);return;}
  (after||showHub)();
}
/* the Google sign-in button, drawn into el. after(): what to show once signed in (default: the Online screen) */
export function gsiMount(el,err,after,size){
  loadGsi().then(()=>{google.accounts.id.initialize({client_id:NET.cfg.google,callback:async r=>{try{signedIn(await api('/api/auth/google',{method:'POST',body:JSON.stringify({credential:r.credential})}),after);}catch(e){err(e.message);}}});
    if(el.isConnected)google.accounts.id.renderButton(el,{theme:'filled_black',size:size||'large',shape:'pill',text:'signin_with'});}).catch(()=>err('Could not load Google sign-in.'));}
export function signOut(then){NET.token=null;NET.user=null;store('token',null);closeLobbyWs();(then||showHub)();}
let gsiLoading=null;
function loadGsi(){if(window.google&&google.accounts)return Promise.resolve();if(!gsiLoading)gsiLoading=new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=res;s.onerror=rej;document.head.appendChild(s);});return gsiLoading;}
function wsUrl(path){return(location.protocol==='https:'?'wss://':'ws://')+location.host+path+(path.includes('?')?'&':'?')+'t='+encodeURIComponent(NET.token);}

export function openLobbyWs(){
  if(NET.lobbyWs||!NET.user)return;
  const ws=new WebSocket(wsUrl('/api/lobby/ws'));NET.lobbyWs=ws;
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch(_){return;}if(m.t==='rooms'){NET.rooms=m.rooms;roomsRender();}};
  ws.onclose=()=>{if(NET.lobbyWs===ws)NET.lobbyWs=null;};
}
export function closeLobbyWs(){if(NET.lobbyWs){NET.lobbyWs.close();NET.lobbyWs=null;}}

/* ---------- room connection ---------- */
export function netSend(m){if(NET.ws&&NET.ws.readyState===1)NET.ws.send(JSON.stringify(m));else{NET.busy=false;toast('Reconnecting…');}}
/* mine: a room this page just created, so the lobby is drawn at once from what it already knows (host, options), before
   the server's first word about it */
export function joinRoom(code,mine){
  closeLobbyWs();leaveRoomSocket();
  NET.room=mine?{code,status:'lobby',host:myId(),opts:mine,seats:[]}:{code,status:'connecting',seats:[]};NET.code=code;NET.S=null;NET.retries=0;
  setQuery({room:code,replay:null});
  connectRoom();if(mine)showRoomLobby(); // (a room just made is a lobby; any other is shown once its first message says what it is)
}
/* the room's screen, once there is something to show on it: its lobby, or why it can't be reached (a game in progress
   shows the game instead) */
const roomScreen=()=>{if(S&&online())return;if(MENU.dlg.open&&MENU.screen==='room')renderRoomLobby();else showRoomLobby();};
export function leaveRoomSocket(){if(NET.ws){const w=NET.ws;NET.ws=null;w.close();}clearTimeout(NET.retryT);NET.connected=false;}
function connectRoom(){
  const code=NET.code;if(!code)return;
  const ws=new WebSocket(wsUrl('/api/rooms/'+code+'/ws'));NET.ws=ws;NET.heard=Date.now();
  ws.onopen=()=>{NET.connected=true;NET.retries=0;NET.status='';NET.heard=Date.now();if(S)render();};
  ws.onmessage=e=>{NET.heard=Date.now();if(e.data==='pong')return;let m;try{m=JSON.parse(e.data);}catch(_){return;}onRoomMsg(m);};
  ws.onclose=e=>{if(e.code===4404)noRoom(ws);else lostConnection(ws);};
  // heartbeat: the server answers every ping, so a connection that hears nothing for 40 s is dead (a network that dropped
  // without closing it): give it up and reconnect, which brings the room's current state
  clearInterval(NET.pingT);NET.pingT=setInterval(()=>{const w=NET.ws;if(!w||w.readyState!==1)return;if(Date.now()-NET.heard>40000)lostConnection(w);else w.send('ping');},15000);
}
/* the server says there is no such room (a wrong code, or a room that closed): said at once, and the code leaves the address */
function noRoom(ws){
  if(NET.ws!==ws)return;NET.ws=null;NET.connected=false;clearTimeout(NET.retryT);NET.code=null;setQuery({room:null});
  NET.status='There is no room with this code (it may have closed).';roomScreen();
}
/* the connection to the room is gone (closed, silent, or not answering): unless we left, reconnect (backing off) */
function lostConnection(ws){
  if(NET.ws!==ws)return;NET.ws=null;NET.connected=false;NET.busy=false;clearTimeout(NET.busyT);ws.close();
  if(!NET.code)return; // we left, or the room closed
  NET.status='Connection lost. Reconnecting…';if(S)render();if(NET.room.status==='connecting')roomScreen();else renderRoomLobby(); // (never reached yet: the room screen says so)
  NET.retries++;if(NET.retries>8&&!S){NET.status='Could not reach this room. It may have closed.';renderRoomLobby();return;}
  clearTimeout(NET.retryT);NET.retryT=setTimeout(connectRoom,Math.min(8000,800*NET.retries));
}
/* after a bug (boundary.js): a fresh connection, which brings the room's current state */
export function reconnect(){if(NET.ws)lostConnection(NET.ws);}
/* a move or an undo: the server answers with the new state or an error; no answer in 10 s means the connection is gone */
export function netAct(m){NET.busy=true;netSend(m);const ws=NET.ws;clearTimeout(NET.busyT);if(ws)NET.busyT=setTimeout(()=>{if(NET.busy)lostConnection(ws);},10000);}
// a phone waking up (or a tab coming back): check the connection at once instead of waiting for the next heartbeat
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'||!NET.code)return;const ws=NET.ws;
  if(!ws){clearTimeout(NET.retryT);connectRoom();return;}
  if(ws.readyState!==1)return;const t=Date.now();ws.send('ping');setTimeout(()=>{if(NET.ws===ws&&NET.heard<t)lostConnection(ws);},5000);});
function onRoomMsg(m){
  if(m.t==='error'){diag('server: '+m.err);NET.busy=false;NET.leaving=false;clearTimeout(NET.busyT);sfx('error');toast(m.err);if(S)render();return;}
  if(m.t==='room'){NET.room=m.room;if(m.room.status==='closed'){NET.code=null;leaveRoomSocket();toast('The host closed the room.');showHub();return;}if(m.room.status==='lobby')roomScreen();else renderRoomLobby();return;}
  if(m.t==='state'){NET.room=m.room;NET.seat=m.seat;NET.canUndo=!!m.undo;NET.clockEnd=m.left==null?null:Date.now()+m.left;NET.busy=false;clearTimeout(NET.busyT);applyServerState(m.S,m.ev);
    if(NET.leaving&&m.S.players[m.seat].resigned){NET.leaving=false;exitOnline();showHub();}} // (left the game: to the Online screen once the server has it)
}
function applyServerState(S2,ev){
  const old=S,fresh=!online();UI.preview=false; // (joining a room clears NET.S: its first state is a new game on show)
  setS(S2);NET.S=S2;
  if(fresh){closeModal();showGame();}
  const turnChanged=fresh||old.cur!==S.cur||old.round!==S.round;
  if(!fresh)playEvents(ev,viewIdx());
  afterChange(turnChanged,S.over&&(fresh||!old.over));
}
export function resignOnline(){
  modal(`<h2>Leave this game?</h2><p class="sub">${NET.room.opts.rated===false?'Leaving counts as finishing last among the players still racing (this game is unrated).':'Leaving a rated game counts as finishing last among the players still racing. Your rating will drop.'}</p><div class="mrow"><button class="btn" id="rsNo">Stay</button><button class="btn pri" id="rsYes">Leave game</button></div>`,sc=>{
    sc.querySelector('#rsNo').onclick=closeModal;sc.querySelector('#rsYes').onclick=()=>{NET.leaving=true;netAct({t:'act',a:{t:'resign'}});closeModal();toast('Leaving the game…',2000);};},true);
}
export function exitOnline(){NET.code=null;NET.S=null;leaveRoomSocket();setS(null);setQuery({room:null,replay:null});resetView();}


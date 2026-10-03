/* ONLINE — talks to the game server (Cloudflare Worker).
   Sign in with Google → hub (profile, rooms, leaderboard) → room lobby → game. */
import { applyAction, assert, roomChange, roomJoin, aiById } from '../engine.gen.js';
import { S, setS, UI, NET, online, viewIdx, myId } from './state.js';
import { render, resetView } from './frame.js';
import { toast, modal, closeModal } from './dialogs.js';
import { MENU, showHub, showRoomLobby, renderRoomLobby, roomsRender, loadProfile } from './menu.js';
import { showGame, playEvents, afterChange } from './actions.js';
import { sfx } from './sound.js';
import { diag, outsideEvent } from './debug.js';
import { failed } from './boundary.js';
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
/* a room this page is making (opts): its lobby is drawn at once from what the page knows (you host it, seated as the
   server will seat you, its options); its code comes with the server's answer (roomMade) */
export function newRoom(opts){
  closeLobbyWs();leaveRoomSocket();NET.code=null;NET.S=null;NET.shown=null;NET.roomPending=[];
  const r={code:null,status:'lobby',host:myId(),opts,seats:[]};roomJoin(r,myId(),NET.user.name);r.seats[0].online=true;
  NET.room=NET.roomS=r;showRoomLobby();return r;
}
/* the room made: its code, then the connection (unless the page left its lobby meanwhile) */
export function roomMade(r,code){if(NET.room!==r||NET.code)return;r.code=code;joinRoom(code,r);}
/* made: the room this page made (newRoom), already on show */
export function joinRoom(code,made){
  closeLobbyWs();leaveRoomSocket();
  NET.room=made||{code,status:'connecting',seats:[]};NET.code=code;NET.S=null;NET.shown=null;NET.retries=0;
  setQuery({room:code,replay:null});
  connectRoom();if(made)renderRoomLobby(); // (a room just made is on show already; any other is shown once its first message says what it is)
}
/* the room's screen, once there is something to show on it: its lobby, or why it can't be reached (a game in progress
   shows the game instead) */
const roomScreen=()=>{if(S&&online())return;if(MENU.dlg.open&&MENU.screen==='room')renderRoomLobby();else showRoomLobby();};
export function leaveRoomSocket(){if(NET.ws){const w=NET.ws;NET.ws=null;w.close();}clearTimeout(NET.retryT);NET.connected=false;}
function connectRoom(){
  const code=NET.code;if(!code)return;
  const ws=new WebSocket(wsUrl('/api/rooms/'+code+'/ws'));NET.ws=ws;NET.heard=Date.now();
  ws.onopen=()=>{NET.connected=true;NET.retries=0;NET.status='';NET.heard=Date.now();if(S)render();};
  ws.onmessage=e=>{NET.heard=Date.now();if(e.data==='pong')return;let m;try{m=JSON.parse(e.data);}catch(_){return;}outsideEvent();onRoomMsg(m);}; // (checks: what another player did, as a tap of ours)
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
/* a move or an undo the page waits for: the server answers with the new state or an error */
export function netAct(m){NET.busy=true;netSend(m);watchAnswer();}
/* no answer in 10 s (to a move waited for, or one shown already) means the connection is gone */
function watchAnswer(){const ws=NET.ws;clearTimeout(NET.busyT);if(ws)NET.busyT=setTimeout(()=>{if(NET.busy||NET.pending.length)lostConnection(ws);},10000);}
/* ---- your own changes, shown at once (local first: the network only confirms). Each one the page sends is numbered
   (NET.seq: it starts from the time the page loaded, so a page loaded later never reuses a number); every message from the
   server says the last of this player's numbers it has applied (ack). A change whose outcome the page can know is shown
   as it is sent, and kept (NET.pending: moves; NET.roomPending: changes in the lobby) until an ack covers it; the rest are
   applied again on each state the server sends, so nothing shown ahead is taken back by an answer to an earlier one.
   A move can be known when it draws no card and shuffles nothing (only the server knows the deck's order); a change in
   the lobby always (the engine's room rules), but for an AI's name, which the server's records may give otherwise. What
   the server refuses, or what no longer fits its state, goes: the server's state is what shows. */
const nextN=()=>++NET.seq;
function ahead(gs,acts){ // the state after these moves of ours, or null if the server alone can know it
  const me=NET.seat;if(!gs||gs.over||gs.cur!==me)return null;
  const g=JSON.parse(JSON.stringify(gs));let chance=false,ev=[];const rnd=()=>{chance=true;return 0;};
  for(const a of acts){const deck=g.players[me].deck.length;let r;
    try{r=applyAction(g,me,a,rnd);}catch(e){failed(e,'applying a move ahead of the server');return null;} // (a bug: reported; the server's answer shows instead)
    if(!r.ok||chance||g.players[me].deck.length!==deck)return null;ev=ev.concat(r.ev);}
  return{gs:g,ev};
}
export function netPlay(a){
  const n=nextN(),f=ahead(S,[a]);
  if(!f){netAct({t:'act',a,n});return;} // (the server decides; the page waits for its answer)
  NET.pending=[...NET.pending,{n,a}];netSend({t:'act',a,n});watchAnswer();
  show(f.gs,f.ev);
}
/* a state from the server: what it has applied of ours leaves the pending list; what is still on its way is applied again
   on it. A state that follows our own move (by) is what we showed already: nothing changes on screen, and its events were
   played when the move was shown */
function serverState(m){
  const mine=!!m.by&&m.by.seat===m.seat&&NET.pending.some(p=>p.n===m.by.n);
  if(m.ack!=null)NET.pending=NET.pending.filter(p=>p.n>m.ack);
  NET.S=m.S;NET.busy=false;if(!NET.pending.length)clearTimeout(NET.busyT);
  const f=NET.pending.length?ahead(m.S,NET.pending.map(p=>p.a)):null;
  if(NET.pending.length&&!f)NET.pending=[]; // (the server's state doesn't allow what we showed after it)
  const next=f?f.gs:m.S;
  if(mine&&next.log.length===S.log.length){ // (nothing else happened meanwhile: a resignation, a timeout)
    // the server played the same move on the whole game: what it sends this seat is what the page showed, or the page and
    // the server disagree about what a move does (compared field by field: the server builds some objects' fields in another order)
    const diff=differ(next,S),same=!diff.length;
    assert(same,'online: our own move, shown ahead of the server, is what the server made of it'+(same?'':' ('+diff.join('; ')+')'));
    if(!same)show(next,[]);return;
  }
  show(next,mine?[]:m.ev);
}
/* where two states differ, field by field whatever their order (the first few paths, with both values; none: the same) */
function differ(a,b,at='',out=[]){
  if(out.length>=4)return out;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))differ(a[k],b[k],at+'.'+k,out);return out;}
  if(JSON.stringify(a)!==JSON.stringify(b))out.push(at+': server '+JSON.stringify(a).slice(0,60)+', shown '+JSON.stringify(b).slice(0,60));
  return out;
}
/* a change in the lobby (colour, an AI added or removed, rated, start now): shown at once, sent with its number */
export function roomSend(m){
  if(!NET.connected){netSend(m);roomScreen();return;} // (not connected: nothing is shown ahead of a message that can't go; netSend says so, and the lobby shows the room as it is)
  const n=nextN(),r=roomAhead(NET.room,[m]);
  if(r){NET.roomPending=[...NET.roomPending,{n,m}];NET.room=r;roomScreen();}
  netSend({...m,n});
}
function roomAhead(room,ms){ // the room after these changes of ours, or null if one no longer fits it
  if(!room||!room.opts)return null;const r=JSON.parse(JSON.stringify(room));
  for(const m of ms)if(roomChange(r,myId(),m,id=>aiById(id).name))return null;
  for(const s of r.seats)if(s.ai)s.online=true; // (as the server lists an AI's seat: always there)
  return r;
}
function serverRoom(m){
  NET.roomS=m.room;if(m.ack!=null)NET.roomPending=NET.roomPending.filter(p=>p.n>m.ack);
  const r=NET.roomPending.length&&m.room.status==='lobby'?roomAhead(m.room,NET.roomPending.map(p=>p.m)):null;
  if(!r)NET.roomPending=[];
  NET.room=r||m.room;
}
/* the server refused change n: what was shown ahead goes (moves: from the server's last state; the lobby: its last room) */
function refused(n){
  if(NET.pending.some(p=>p.n===n)){NET.pending=[];if(NET.S)show(NET.S,[]);}
  if(NET.roomPending.some(p=>p.n===n)){NET.roomPending=[];if(NET.roomS)NET.room=NET.roomS;roomScreen();}
}
// a phone waking up (or a tab coming back): check the connection at once instead of waiting for the next heartbeat
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'||!NET.code)return;const ws=NET.ws;
  if(!ws){clearTimeout(NET.retryT);connectRoom();return;}
  if(ws.readyState!==1)return;const t=Date.now();ws.send('ping');setTimeout(()=>{if(NET.ws===ws&&NET.heard<t)lostConnection(ws);},5000);});
function onRoomMsg(m){
  if(m.t==='error'){diag('server: '+m.err);if(m.n!=null)refused(m.n);NET.busy=false;NET.leaving=false;clearTimeout(NET.busyT);sfx('error');toast(m.err);if(S)render();return;}
  if(m.t==='room'){serverRoom(m);if(m.room.status==='closed'){NET.code=null;leaveRoomSocket();toast('The host closed the room.');showHub();return;}if(m.room.status==='lobby')roomScreen();else renderRoomLobby();return;}
  if(m.t==='state'){NET.room=m.room;NET.roomS=m.room;NET.roomPending=[];NET.seat=m.seat;NET.canUndo=!!m.undo;NET.clockEnd=m.left==null?null:Date.now()+m.left;
    serverState(m);
    if(NET.leaving&&m.S.players[m.seat].resigned){NET.leaving=false;exitOnline();showHub();}} // (left the game: to the Online screen once the server has it)
}
/* a state on show (the server's, or ours ahead of it), with the events that led to it */
function show(S2,ev){
  const old=S,fresh=!online();UI.preview=false; // (joining a room clears NET.shown: its first state is a new game on show)
  NET.shown=S2;setS(S2);
  if(fresh){closeModal();showGame();}
  const turnChanged=fresh||old.cur!==S.cur||old.round!==S.round;
  if(!fresh)playEvents(ev,viewIdx());
  afterChange(turnChanged,S.over&&(fresh||!old.over));
}
export function resignOnline(){
  modal(`<h2>Leave this game?</h2><p class="sub">${NET.room.opts.rated===false?'Leaving counts as finishing last among the players still racing (this game is unrated).':'Leaving a rated game counts as finishing last among the players still racing. Your rating will drop.'}</p><div class="mrow"><button class="btn" id="rsNo">Stay</button><button class="btn pri" id="rsYes">Leave game</button></div>`,sc=>{
    sc.querySelector('#rsNo').onclick=closeModal;sc.querySelector('#rsYes').onclick=()=>{NET.leaving=true;netAct({t:'act',a:{t:'resign'}});closeModal();toast('Leaving the game…',2000);};},true);
}
export function exitOnline(){NET.code=null;NET.S=null;NET.shown=null;NET.pending=[];leaveRoomSocket();setS(null);setQuery({room:null,replay:null});resetView();}


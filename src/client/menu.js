/* MENU — one native <dialog> (shell.html #menu). Every screen is written there once and switching screens only flips
   `hidden`; choices are native form controls that keep their own state (the Online tabs are pure CSS). This file wires
   them, reads them when they're used, and fills only the boxes that hold data (seats, rooms, leaderboard, profile,
   replays, the room lobby). Nothing here rebuilds a screen: a click changes only what it is about. */
import { COLORS, COURSES, courseById, aiById, aiAllowed, aiUsesNet, recNewGame, recSecret, plural, shuffle, assert } from '../engine.gen.js';
import { $, esc, setHTML, setQuery, reduceMotion, EASE } from './dom.js';
import { S, setS, UI, NET, G, clearSelection, online, myId, inGame, save, myGames, resignSeat, gameHead } from './state.js';
import { GAME_READY } from './ready.js';
import { toast } from './dialogs.js';
import { showGame, resignLocal, endLocal } from './actions.js';
import { aiKick, aiNetLoad } from './ai.js';
import { api, gsiMount, signOut, signedIn, joinRoom, newRoom, roomMade, leaveRoomSocket, openLobbyWs, closeLobbyWs, netSend, roomSend, exitOnline, resignOnline } from './online.js';
import { loadReplayId, openReplay } from './replay.js';
import { load, store } from './store.js';
import { diag, CHECKS, watchFlash, expectMenu, afterFrame } from './debug.js';
import { render } from './frame.js';
import { setSound } from './sound.js';
/* course list: official routes first; 'random' picks one of them */
function pickCourse(id){return id==='random'?COURSES[Math.floor(Math.random()*COURSES.length)]:courseById(id);}
// (a room's course, as the server sends it: one this page doesn't know yet, from a newer version, shows as the first)
function courseName(id){return id==='random'?'Random course':(courseById(id)||COURSES[0]).name;}
export const MENU={dlg:$('#menu'),f:$('#mform'),screen:$('#mform > section:not([hidden])').dataset.screen,acct:null,closeT:0}; // (screen: the one the page's HTML shows, on screen before the script)
const mq=s=>MENU.f.querySelector(s),mqa=s=>MENU.f.querySelectorAll(s);
export const radio=n=>{const e=MENU.f.querySelector(`input[name="${n}"]:checked`);return e?e.value:null;};
const setRadio=(n,v)=>{MENU.f.querySelector(`input[name="${n}"][value="${v}"]`).checked=true;};
// seed and order: the next deal (its shuffles, and the order around the table: a permutation of the 4 seats, those in play
// taken in its order), drawn again after each start so a change of setting doesn't move anyone on the board behind the menu
const newOrder=()=>shuffle([0,1,2,3],Math.random);
const SETUP={seed:(Math.random()*1e9)|0,order:newOrder(),id:null,cur:null,map:null};

/* setting: before ending a turn with a card still affordable, ask first */
export const buyReminder=()=>mq('#sBuyWarn').checked;
export function menuInit(){
  // (courses, seats, AI and colour choices are written into the page by build.mjs: the start screen needs no script)
  // AI seats chosen before are remembered on this device
  let ai=[];try{ai=JSON.parse(load('seats')||'[]');}catch(e){/* expected: a stored value from another version */}
  mqa('#seats select').forEach((s,i)=>{if(aiById(ai[i]))s.value=ai[i];});
  if(load('buywarn')==='0')mq('#sBuyWarn').checked=false; // (settings: kept on this device)
  MENU.f.addEventListener('submit',e=>e.preventDefault());
  MENU.f.addEventListener('change',menuChange);
  MENU.f.addEventListener('click',menuClick);
  mq('#jCode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();mq('#jGo').click();}});
  // the menu is opened with show(), never as a modal (showModal makes the whole page inert: every element, the board's
  // thousands included, restyled each time it opens and closes, a 15-20 ms frame); it covers the screen, so a click
  // never reaches the game, and Esc is ours
  MENU.dlg.addEventListener('keydown',e=>{if(e.key==='Escape'&&MENU.dlg.open&&!MENU.dlg.classList.contains('closing')){e.preventDefault(); // (focus can stay in the menu once it has closed: Esc then is the game's)
  if(menuDismissible())continueGame();else if(MENU.screen==='replays')showSettings();}}); // (Esc: back to the game, or from Replays back to Settings)
  MENU.dlg.addEventListener('click',e=>{if(e.target===MENU.dlg&&menuDismissible())continueGame();}); // the backdrop
  // the edge lines follow what decides them: the scroll, and the sizes of the form and its parts (a screen shown, content
  // filled in, the window resized), judged after layout and before the frame is drawn
  MENU.f.addEventListener('scroll',menuEdges,{passive:true});{const ro=new ResizeObserver(menuEdges);ro.observe(MENU.f);for(const c of MENU.f.children)ro.observe(c);}
  if(CHECKS){ // (the edge lines follow the screen however it changes: judged once each change to the menu is drawn)
    let due=false;const judge=()=>{due=false;if(!MENU.dlg.open)return;const[top,more]=edges(MENU.f);
      assert(MENU.f.classList.contains('scrolled')===top&&MENU.f.classList.contains('more')===more,"view: a menu screen's edge lines say whether more runs on under its pinned parts ("+MENU.screen+': more above '+top+', below '+more+', lines '+MENU.f.className+')');};
    const soon=()=>{if(!due){due=true;afterFrame(judge);}};
    new MutationObserver(soon).observe(MENU.dlg,{subtree:true,childList:true,attributes:true,characterData:true});addEventListener('resize',soon);}
  setupSync();
  const d=MENU.dlg;
  if(document.documentElement.classList.contains('resume'))d.close(); // a saved game or a link opens instead (boot decides)
  else if(d.open)MENU.f.focus({preventScroll:true});
}
const menuDismissible=()=>inGame()&&MENU.screen!=='room';
/* a game in progress, on show or not: this device's (on show behind the menu once the page is back), or an online one the
   player is in, though this page isn't connected to it yet (coming back to the page while it runs) */
const awayOnline=()=>!!NET.user&&!!NET.active; // (an online game of this player's, not joined in this page yet: joinRoom clears it)
const gameOn=()=>inGame()||awayOnline();
const MODE={setup:'local',online:'online',settings:'settings',replays:'settings'}; // (Replays is a screen of Settings: its tab stays lit)
/* the Menu button, and coming back to the page: the This device screen, which during a game is greyed under the game's bar
   (an online game just finished: its room is left first) */
export function showMenu(){if(online()&&S.over)exitOnline();showSetup();}
export function showSettings(){menuOpen('settings');}
/* the menu during a game (owner, 2026-10-07: the menu as ever, everything greyed but the game's bar and Settings; "if you're
   in a game, you're in a game"): the bar with Continue, End game (a game on this device) and Resign; the New game and Online
   screens greyed and taking no clicks, Replays too. The page's first script does the same for a saved game before the app has
   loaded (shell.html), from the same words (state.js gameHead) */
function gameRender(){
  const g=gameOn(),away=g&&!inGame(),rs=g&&!away?resignSeat():-1,h=g&&!away?gameHead():null;
  if(mq('#ingame').hidden===g)expectMenu(); // (a game begun or over, or the server correcting this device's memory of one: the bar comes or goes, declared)
  MENU.dlg.classList.toggle('ingame',g);mq('#ingame').hidden=!g;
  for(const f of mqa('fieldset.lock'))f.disabled=g;mq('#sReplays').disabled=g;mq('#cGo').disabled=g;mq('#sGo').disabled=g||!mq('#allAI').hidden;
  mq('#igTxt').textContent=!g?'':away?'Online game in progress':h.round;
  const r=mq('#sResign');r.disabled=rs<0;r.textContent=h?h.resign:'Resign';
  mq('#sEnd').hidden=away||online();
}
/* back to the game in progress: the menu goes, and its AIs play on (they wait while the page was away); one not connected
   yet is joined */
function continueGame(){if(awayOnline()){joinRoom(NET.active);return;}menuClose();aiKick();}

/* a screen that scrolls: its pinned header and foot get a line while content runs on under them (none when it all fits).
   checks: the pinned parts are in sight wherever the screen is scrolled to (owner, 2026-10-06: what must be seen, always is) */
const edges=f=>[f.scrollTop>0,f.scrollTop+f.clientHeight<f.scrollHeight-1]; // (more above, more below)
function menuEdges(){ // (in a room the top isn't pinned: the room's header is)
  const f=MENU.f,[top,more]=edges(f);
  f.classList.toggle('scrolled',top);f.classList.toggle('more',more);
  if(!CHECKS||!MENU.dlg.open)return;const sec=f.querySelector(`section[data-screen="${MENU.screen}"]`),fr=f.getBoundingClientRect();
  for(const el of[mq('#mtop'),...(sec?sec.querySelectorAll(':scope > .mhead, :scope > .mrow'):[])]){if(!el.offsetHeight||el===mq('#mtop')&&MENU.screen==='room')continue;const r=el.getBoundingClientRect();
    assert(r.top>=fr.top-1&&r.bottom<=fr.bottom+1,"view: a menu screen's pinned parts stay in sight as it scrolls ("+MENU.screen+' '+el.className+': '+Math.round(r.top-fr.top)+'..'+Math.round(r.bottom-fr.bottom)+')');}
}
/* show a screen (opening the dialog if it isn't open) */
function menuOpen(screen){watchFlash();diag('menu: '+screen+(MENU.dlg.open?'':' (opened)'));if(MENU.screen!==screen||!MENU.dlg.open)expectMenu(); // (another screen, or the menu opened: its layout is new)
  $('#overlay').innerHTML=''; // one window at a time: the menu replaces results, rules or a pile (never left underneath it)
  const d=MENU.dlg,g=gameOn();
  assert(!g||screen!=='replays','view: in a game the menu offers that game only (screen '+screen+')');
  gameRender();acctRender();
  if(MODE[screen])setRadio('mode',MODE[screen]);mq('#sMode').hidden=screen==='room';d.classList.toggle('inroom',screen==='room'); // (in a room, Leave is the way out)
  mq('#acct').classList.toggle('locked',g); // (signing out would leave the game)
  if(MENU.screen!==screen){for(const s of mqa('section[data-screen]'))s.hidden=s.dataset.screen!==screen;MENU.screen=screen;MENU.f.scrollTop=0;}
  clearTimeout(MENU.closeT);d.classList.remove('closing');document.documentElement.classList.remove('resume');
  // (the page opens the dialog as plain HTML, before any script: already on screen, it only takes the focus)
  if(d.open)MENU.f.focus({preventScroll:true});
  else{d.show();MENU.f.scrollTop=0;MENU.f.focus({preventScroll:true});
    // opened during a game (the Menu button): it comes in like a window, fading in and rising into place with a window's
    // timing (owner, 2026-10-03; the page's first menu stays instant)
    if(g&&!reduceMotion){d.animate([{opacity:0},{opacity:1}],{duration:250,easing:'ease'});MENU.f.animate([{transform:'translateY(14px) scale(.98)',opacity:0},{transform:'none',opacity:1}],{duration:350,easing:EASE});}}
  render(); // (the layer that dims the game follows: dialogs.js coverPart)
}
export function menuClose(){watchFlash();const d=MENU.dlg;document.documentElement.classList.remove('resume');render();if(!d.open)return;d.classList.add('closing');clearTimeout(MENU.closeT);MENU.closeT=setTimeout(()=>{d.close();d.classList.remove('closing');},160);}
// after signing in or out: the account bar and whatever depends on it
export function menuRefresh(){acctRender();if(MENU.screen==='online'){if(NET.user)openLobbyWs();onlineRender();}} // (signed in on the Online screen: its room list goes live at once)

/* ---- the account bar (rebuilt only when who's signed in, or their numbers, change) ---- */
function acctRender(){
  // its line is always there (a fixed slot: what the server says later only fills it). Who is signed in shows at once from
  // this device's last answer (local first), until the server's own comes
  const el=mq('#acct'),u=NET.user||(!NET.available&&!NET.offline&&load('token')?cachedMe():null);
  const key=NET.offline?'off':u?[u.id,u.name,Math.round(u.rating),u.games,u.wins].join('|'):NET.available?'out':'-';
  if(MENU.acct===key)return;MENU.acct=key;
  if(NET.user)store('me',JSON.stringify({id:u.id,name:u.name,rating:u.rating,games:u.games,wins:u.wins}));else if(NET.available)store('me',null);
  if(NET.offline){el.innerHTML='<span class="m">Offline</span>';return;}
  if(!u){const g=NET.available&&NET.cfg.google;el.innerHTML=NET.available?`<span class="m">Not signed in</span>${g?'<div id="gsiTop" class="gsiSm gsi"></div>':''}`:'';if(g)gsiMount(el.querySelector('#gsiTop'),t=>toast(t,3000),menuRefresh,'medium');return;}
  el.innerHTML=`<span class="av">${esc(u.name.slice(0,1).toUpperCase())}</span><span><b>${esc(u.name)}</b> · <b class="rt">${Math.round(u.rating)}</b> · ${plural(u.games,'game')} · ${plural(u.wins,'win')}</span><span class="acb"><button type="button" class="linkbtn" id="acOut">Sign out</button></span>`;
}
// (the last answer saved on this device: unreadable is a save cut short, read as none)
function cachedMe(){try{return JSON.parse(load('me')||'null');}catch(e){/* expected: a save cut short */return null;}}

/* ---- every choice ---- */
function menuChange(e){
  const n=e.target.name||e.target.id;
  if(n==='mode'){({local:showSetup,online:showHub,settings:showSettings})[e.target.value]();return;}
  if(n==='np'||n==='course'||n==='full'||n==='priv'||/^(who|col|nm)\d$/.test(n)){setupSync();prepareGame();
    if(/^who\d$/.test(n))store('seats',JSON.stringify([...mqa('#seats select')].map(s=>s.value))); return;}
  if(n==='buywarn'){store('buywarn',e.target.checked?'1':'0');return;}
  if(n==='setSnd'){setSound(e.target.checked);return;}
  if(n==='otab'){onlineTab();return;}
  if(n==='rlrated'){roomSend({t:'rated',v:e.target.value==='1'});return;}
  if(n==='rlcol'){roomSend({t:'color',color:e.target.value});return;}
}
function menuClick(e){
  // (the Settings tab, from Replays: its radio is already the chosen one, so no change comes; the tap still goes back)
  if(MENU.screen==='replays'&&e.target.closest('#sMode label[data-v=settings]')){showSettings();return;}
  const b=e.target.closest('button');if(!b||b.disabled)return;
  const err=t=>{hubErr(t);};
  const run=f=>Promise.resolve().then(f).catch(x=>err(x.message));
  switch(b.id){
    case'sBack':continueGame();return;
    case'sReplays':showReplays();return;
    case'rBack':showSettings();return;
    case'sResign':menuClose();online()?resignOnline():resignLocal();return;
    case'sEnd':menuClose();endLocal();return;
    case'sGo':delete b.dataset.q;startLocal();return;
    case'acOut':{const was=MENU.screen;leaveRoom();if(online())exitOnline();signOut(was==='room'||was==='online'?showHub:menuRefresh);return;} // signed out: out of any room
    case'devGo':run(async()=>signedIn(await api('/api/auth/dev',{method:'POST',body:JSON.stringify({name:mq('#devName').value||'Tester'})}),menuRefresh));return;
    case'qGo':run(async()=>joinRoom((await api('/api/match',{method:'POST',body:'{}'})).code));return;
    case'cGo':{const o={max:+radio('max'),turn:+radio('turn'),course:radio('ocourse'),pub:radio('pub')==='1',rated:radio('rated')==='1'};
      // (its lobby at once; its code when the server has made it. Not made: back to the Online screen, which says why)
      const r=newRoom(o);api('/api/rooms',{method:'POST',body:JSON.stringify(o)}).then(j=>roomMade(r,j.code),x=>{if(NET.room===r&&!NET.code){NET.room=null;showHub();}err(x.message);});return;}
    case'jGo':{const c=mq('#jCode').value.toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length<4){mq('#jCode').focus();return;}joinRoom(c);return;}
    case'pfBack':NET.viewUser=null;setRadio('otab','board');onlineTab();return;
    case'meSave':run(async()=>{const r=await api('/api/me',{method:'PATCH',body:JSON.stringify({name:mq('#meName').value})});NET.user=r.user;toast('Saved as '+r.user.name);acctRender();});return;
    case'lkCopy':{const i=mq('#lkIn');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value).then(()=>toast('Link copied')).catch(()=>{/* expected: clipboard refused; the link stays selected to copy by hand */});return;}
    case'rlLeave':leaveRoom();showHub();return;
    case'rlStart':netSend({t:'start'});return;
    case'rlNow':roomSend({t:'now'});return;
  }
  if(b.dataset.join){joinRoom(b.dataset.join);return;}
  if(b.dataset.uid){NET.viewUser=b.dataset.uid;setRadio('otab','me');onlineTab();return;}
  if(b.dataset.rid||b.dataset.id){closeLobbyWs();loadReplayId(b.dataset.rid||b.dataset.id);return;}
  if(b.dataset.lid){const L=myGames().find(x=>String(x.created)===b.dataset.lid);if(L)openReplay(L,null);return;}
  if(b.dataset.addai){roomSend({t:'addAI',ai:b.dataset.addai});return;}
  if(b.dataset.rmai){roomSend({t:'removeAI',uid:b.dataset.rmai});return;}
}

/* ---- start screen ---- */
export function showSetup(){closeLobbyWs();setupSync();if(!(S&&UI.preview))prepareGame();menuOpen('setup');} // (the game about to start is made once: shown from the main menu, it is already behind it)
// what the choices allow: seats shown, AI only where it plays, one colour per seat, at least one person
export function setupSync(){
  const n=+radio('np'),aiOK=aiAllowed(radio('course'),n),rows=[...mqa('#seats .seat')];
  mq('#aiNote').hidden=aiOK;
  const col=r=>r.querySelector('.sws input:checked').value;
  rows.forEach((r,i)=>{r.hidden=i>=n;const sel=r.querySelector('select');
    for(const o of sel.querySelectorAll('optgroup option'))o.disabled=!aiOK;if(!aiOK&&sel.value)sel.value='';
    const A=aiById(sel.value);r.querySelector('input[name^=nm]').hidden=!!A;const nm=r.querySelector('.ainm');nm.hidden=!A;
    if(A){nm.title=A.desc;nm.firstChild.textContent=A.desc;}
    if(i<n&&rows.slice(0,i).some(q=>col(q)===col(r))){const free=COLORS.find(c=>!rows.slice(0,n).some(q=>q!==r&&col(q)===c.id));r.querySelector(`.sws input[value="${free.id}"]`).checked=true;}}); // (4 colours, at most 4 seats: one is free)
  rows.forEach((r,i)=>{for(const x of r.querySelectorAll('.sws input'))x.disabled=rows.slice(0,n).some((q,j)=>j!==i&&col(q)===x.value);});
  const allAI=rows.slice(0,n).every(r=>r.querySelector('select').value);mq('#allAI').hidden=!allAI;mq('#sGo').disabled=allAI||gameOn(); // (as gameRender: no new game during one)
}
/* The start screen's background IS the game about to start: made from the current choices (this deal's seed) and laid
   out exactly as it will be played (board, pieces, hand, top bar). A changed choice remakes it behind the menu; Start
   only takes the menu away: nothing is redrawn or refitted. UI.preview marks a game not started yet (no AI moves, not
   saved). */
function setupOpts(){
  const n=+radio('np'),rows=[...mqa('#seats .seat')].slice(0,n),who=rows.map(r=>r.querySelector('select').value),id=radio('course');
  if(SETUP.id!==id||!SETUP.cur){SETUP.id=id;SETUP.cur=pickCourse(id);}
  const players=rows.map((r,i)=>{const A=aiById(who[i]),k=who.slice(0,i).filter(x=>x===who[i]).length;
    return{name:A?A.name+(k?' '+(k+1):''):r.querySelector('input[name^=nm]').value.trim()||('Player '+(i+1)),color:COLORS.find(c=>c.id===r.querySelector('.sws input:checked').value).hex,ai:A?A.id:undefined};});
  return{course:SETUP.cur,seed:SETUP.seed,privacy:mq('#sPriv').checked,fullRace:radio('full')==='1',
    players:SETUP.order.filter(i=>i<n).map(i=>players[i])}; // seated in the deal's order: who moves first changes each game
}
export function prepareGame(force){
  if(inGame()&&!force)return;
  if(online())exitOnline(); // a finished online game: its room is left (rejoin a running one from Online)
  const g=recNewGame(setupOpts(),recSecret());G.rec=g.rec;setS(g.gs);UI.preview=true;UI.lastReplay=null;
  clearSelection();UI.piece=0;UI.viewer=null;
  showGame();
}
export function startLocal(){
  if(!GAME_READY.done){GAME_READY.then(startLocal);return;} // the game's fonts are still on their way: start the moment they're in
  if(mq('#sGo').disabled)return;
  if(!UI.preview)prepareGame(true); // Start a new game from a game in progress: made behind the menu first
  UI.preview=false;save();if(S.players.some(p=>p.ai&&aiUsesNet(p.ai)))aiNetLoad();
  menuClose();aiKick();
  SETUP.seed=(Math.random()*1e9)|0;SETUP.order=newOrder();SETUP.cur=null; // the next deal
}

/* ---- Online ---- */
/* leave the room this page is in (before its game starts: afterwards the server ignores it and the socket just closes) */
function leaveRoom(){if(!NET.code){NET.room=null;return;} // (a room still being made: it is never joined (roomMade))
  if(NET.connected)netSend({t:'leave'});NET.code=null;leaveRoomSocket();setQuery({room:null,replay:null});}
export function showHub(){if(NET.user)openLobbyWs();onlineRender();menuOpen('online');}
function onlineRender(){
  createRow();const u=NET.user;mq('#hTabs').hidden=!NET.available||!u;mq('#oOff').hidden=NET.available;mq('#oOut').hidden=!NET.available||!!u;mq('#oIn').hidden=!NET.available||!u;
  if(!NET.available)return;
  if(!u){mq('#oNoG').hidden=!!NET.cfg.google;mq('#oDev').hidden=!NET.cfg.dev;return;}
  roomsRender();onlineTab();
}
export function roomsRender(){
  const rrow=r=>{const o=r.opts,n=r.seats.length,ai=r.seats.filter(x=>x.ai).length,host=(r.seats.find(x=>x.uid===r.host)||{name:''}).name; // (a quick match's room can list before anyone is seated)
    return`<div class="rrow"><span>${o.auto?'<b>Quick match</b>':`<b>${esc(host)}</b>’s room`} <span class="note">· ${n}/${o.max}${ai?` (${ai} AI)`:''} · ${o.turn}s turns · ${o.rated?'rated':'unrated'} · ${esc(courseName(o.course))}</span></span>${r.status==='lobby'&&n<o.max?`<button type="button" class="btn" data-join="${r.code}">Join</button>`:'<span class="note">in progress</span>'}</div>`;};
  const open=NET.rooms.filter(r=>r.status==='lobby'),live=NET.rooms.filter(r=>r.status==='playing');
  // (both lists are always there, saying when they're empty: a list arriving or emptying moves nothing else)
  setHTML(mq('#roomsOpen'),open.map(rrow).join('')||'<p class="note">None right now</p>');
  setHTML(mq('#roomsLive'),live.map(rrow).join('')||'<p class="note">None right now</p>');
}
/* the Online tabs show by themselves (CSS); this fetches what the shown tab needs (at most every 5 s) */
const PROFILES={},FETCHED={};
/* the Online screen's error line: in the page's words (a browser's own error text never reaches a player) */
function hubErr(t){assert(!/Failed to fetch|NetworkError|Load failed/.test(t),"view: an error is said in the page's words ("+t+")");mq('#hErr').textContent=t;}
/* a tab's data, fetched at most every 5 s. A failed refresh says so (what is shown is what was loaded before), and the
   next good one takes the message away */
let fetchErr=null;
function fetchOnce(key,url,done,what){const t=FETCHED[key];if(t&&(t.busy||Date.now()-t.at<5000))return;FETCHED[key]={busy:true};
  api(url).then(r=>{FETCHED[key]={at:Date.now()};if(fetchErr===key){fetchErr=null;hubErr('');}done(r);},
    e=>{FETCHED[key]={at:Date.now()};fetchErr=key;hubErr('Could not refresh '+what+': '+e.message+' What is shown was loaded before.');});}
export function loadProfile(id){return api('/api/users/'+encodeURIComponent(id)).then(r=>{PROFILES[id]=r;});}
/* Create room, at the foot of the Online screen: where the room it makes is chosen (signed in, on Play) */
const createRow=()=>{mq('#cGoRow').hidden=!(NET.available&&NET.user&&radio('otab')==='play');};
function onlineTab(){
  createRow();if(!NET.user)return;const t=radio('otab');
  if(t==='board')fetchOnce('lb','/api/leaderboard',r=>setHTML(mq('#lbList'),lbHTML(r.players)),'the leaderboard');
  if(t==='me'){const id=NET.viewUser||myId(),own=id===myId();mq('#pfBack').hidden=own;mq('#meNameBox').hidden=!own;
    if(own&&document.activeElement!==mq('#meName'))mq('#meName').value=NET.user.name;
    setHTML(mq('#pf'),PROFILES[id]?profileHTML(PROFILES[id]):'<p class="note">Loading…</p>');
    fetchOnce('pf:'+id,'/api/users/'+encodeURIComponent(id),r=>{PROFILES[id]=r;if((NET.viewUser||myId())===id)setHTML(mq('#pf'),profileHTML(r));},'the profile');}
}
const lbHTML=players=>players.length?`<div class="lb">${players.map((p,i)=>{const A=p.bot&&aiById(p.bot);return`<span class="m">${i+1}</span><span class="lbp"><button type="button" class="lbn${p.id===myId()?' me':''}" data-uid="${esc(p.id)}">${esc(p.name)}</button>${A?`<span class="aitag" title="${esc(A.desc)}">AI</span><span class="note">${esc(A.tier)}</span>`:''}</span><span>${Math.round(p.rating)}</span><span class="m">${p.wins}/${p.games}</span>`;}).join('')}</div><p class="note">Wins / rated games. The AI players are rated like everyone else: beat them to gain rating. Their starting ratings come from hundreds of games against each other; Raleigh (Steady) starts where every new player does, at 1200.</p>`:'<p class="note">No rated games yet.</p>';
const ordn=n=>n+(['th','st','nd','rd'][n%100>10&&n%100<14?0:Math.min(n%10,4)%4]||'th');
function profileHTML(r){const u=r.user,A=u.bot&&aiById(u.bot);
  const stat=(v,l)=>`<div class="pst"><b>${v}</b><span>${l}</span></div>`;
  return`<div class="pfh"><span class="av big">${esc(u.name.slice(0,1).toUpperCase())}</span><div><h3>${esc(u.name)}${A?' <span class="aitag">AI</span>':''}</h3>${A?`<span class="note">${esc(A.tier)} · ${esc(A.desc)}</span>`:''}</div></div>
  <div class="pstats">${stat(Math.round(u.rating),'rating')}${stat('#'+u.rank,'rank')}${stat(u.games,'rated games')}${stat(u.wins,'wins')}${stat(u.games?Math.round(100*u.wins/u.games)+'%':'–','win rate')}</div>
  <div class="field"><label>Recent games</label><div class="rlist">${r.games.length?r.games.map(g=>gameRowHTML(`data-rid="${esc(g.id)}"`,g,g.seat,'',u.id===myId())).join(''):'<p class="note">No recorded games yet.</p>'}</div></div>`;}

/* ---- the room lobby: drawn from the room the server sends; each part changes only when its data does ---- */
export function showRoomLobby(){renderRoomLobby();menuOpen('room');}
export function renderRoomLobby(){
  const r=NET.room,o=r.opts,seats=r.seats,host=r.host===myId(),auto=!!(o&&o.auto),lobby=r.status==='lobby';
  const max=o?o.max:4,room=seats.length<max,rated=!(o&&o.rated===false),mine=seats.find(s=>s.uid===myId());
  mq('#rlTitle').textContent='Room '+(NET.code||'…'); // (a room being made: its code comes with the server's answer)
  mq('#rlSub').textContent=(auto&&o?`Starts when ${o.max} players are in. `:host||auto?'':'Waiting for the host to start. ')
    +(o?`${courseName(o.course)} · ${auto?'':(o.pub===false?'private · ':'public · ')+o.max+' players max · '}${o.turn}s per turn · ${rated?'rated':'unrated'}`:'');
  mq('#lkIn').value=NET.code?location.origin+location.pathname+'?room='+NET.code:'';
  mq('#rlCount').textContent=`Players ${seats.length}/${max}`;
  setHTML(mq('#rlSeats'),seats.map(s=>{const A=s.ai&&aiById(s.ai);return`<div class="seatrow"><span><i style="background:${s.color}"></i><b>${esc(s.name)}</b>${A?'<span class="aitag">AI</span>':''}${s.uid===myId()?' <span class="note">(you)</span>':''}</span>${A?`<span class="lbp"><span class="note">${esc(A.tier)}</span>${host&&lobby?`<button type="button" class="rmai" data-rmai="${esc(s.uid)}" aria-label="Remove ${esc(s.name)}" title="Remove">×</button>`:''}</span>`:`<span class="note">${s.now?'wants to start · ':''}${s.uid===r.host&&!auto?'host · ':''}${s.online?'here':'away'}</span>`}</div>`;}).join('')
    +(o?'<div class="seatrow open"><span class="note">Open seat</span></div>'.repeat(Math.max(0,max-seats.length)):'<p class="note">Connecting…</p>')); // (every seat the room holds has its row: a player joining fills one, and nothing below moves)
  const ctl=host&&!auto&&lobby,aiOK=!!(o&&aiAllowed(o.course,o.max));
  mq('#rlAIBox').hidden=!ctl;mq('#rlAINo').hidden=aiOK;mq('#rlAIList').hidden=!aiOK;
  // (a full room keeps the list, greyed, and its note's line is there either way: the room filling up moves nothing)
  const fl=mq('#rlFull');fl.hidden=!aiOK;fl.style.visibility=room?'hidden':'';
  for(const b of mqa('[data-addai]'))b.disabled=!NET.connected||!room; // (adding one is the server's: once it's connected)
  mq('#rlRatedBox').hidden=!ctl;setRadio('rlrated',rated?'1':'0');
  mq('#rlColBox').hidden=!mine;
  if(mine)for(const x of mqa('#rlCols input')){x.checked=x.value===mine.color;x.disabled=!NET.connected||seats.some(s=>s!==mine&&s.color===x.value);} // (a change is the server's to keep: once it's connected)
  mq('#rlNoSeat').hidden=!!mine||!lobby;
  const st=mq('#rlStatus');st.hidden=!NET.status;st.textContent=NET.status||'';
  mq('#rlLeave').textContent=host&&!auto?'Close room':'Leave';
  const nw=mq('#rlNow');nw.hidden=!(auto&&mine);if(mine){nw.textContent=mine.now?'Waiting for the others… (cancel)':'Start now';nw.classList.toggle('pri',!mine.now);nw.disabled=seats.length<2;}
  const sg=mq('#rlStart');sg.hidden=!(host&&!auto);sg.disabled=seats.length<2||!NET.connected;
}

/* ---- replays ---- */
/* a finished game as a list row: the result first (the place of the player whose list it is: seat me, 'You' when that is
   you; with no such player, who won), then the course, how long it took and when.
   g: {course, names, places, rounds, created} (the server's rows; a game kept on this device) */
function gameRowHTML(attr,g,me,where,you=true){
  const won=g.places?g.names.filter((_,i)=>g.places[i]===1).map(esc).join(' & '):'',C=courseById(g.course);
  const res=!g.places?'Unfinished':me<0?`Won by ${won}`:g.places[me]===1&&you?`<span class="plc p1">1st</span> You won`:g.places[me]===1?`<span class="plc p1">1st</span> of ${g.names.length}`:`<span class="plc p${g.places[me]}">${ordn(g.places[me])}</span> of ${g.names.length} · won by ${won}`;
  const sub=[where,C&&C.name,g.rounds&&plural(g.rounds,'round'),new Date(g.created).toLocaleString([],{dateStyle:'medium',timeStyle:'short'})].filter(Boolean).join(' · ');
  return`<button type="button" ${attr}><b>${res}</b><span>${esc(sub)}</span></button>`;}
export function showReplays(){
  const mine=mq('#rMine'),loc=myGames().map(L=>{const hum=L.players.map((p,i)=>p.bot?-1:i).filter(i=>i>=0); // (you: the one person at the table)
    return{t:L.created,h:gameRowHTML(`data-lid="${L.created}"`,{course:L.course,names:L.players.map(p=>p.name),places:L.result&&L.result.places,rounds:L.result&&L.result.rounds,created:L.created},hum.length===1?hum[0]:-1,'on this device')};});
  const showMine=online=>{const items=[...loc,...online.map(g=>({t:g.created,h:gameRowHTML(`data-id="${esc(g.id)}"`,g,g.seat,'online')}))].sort((a,b)=>b.t-a.t);
    setHTML(mine,items.length?items.map(x=>x.h).join(''):'<p class="note">No finished games yet. Games you finish here are kept to watch again.</p>');};
  showMine([]);
  if(NET.available&&NET.user)api('/api/users/'+encodeURIComponent(myId())).then(j=>showMine(j.games||[])).catch(e=>diag('your games: '+e.message));
  const list=mq('#rList');
  if(!NET.available)setHTML(list,'<p class="note">The shared list needs the online server.</p>');
  else fetch('/api/replays').then(r=>r.json()).then(j=>{const rs=j.replays||[];
    setHTML(list,rs.length?rs.map(r=>gameRowHTML(`data-id="${esc(r.id)}"`,r,-1,plural(r.names.length,'player'))).join(''):'<p class="note">No replays yet.</p>');}).catch(()=>setHTML(list,'<p class="note">Could not load the list.</p>'));
  menuOpen('replays');
}

/* MENU — one native <dialog> (shell.html #menu). Every screen is written there once and switching screens only flips
   `hidden`; choices are native form controls that keep their own state (the Online tabs are pure CSS). This file wires
   them, reads them when they're used, and fills only the boxes that hold data (seats, rooms, leaderboard, profile,
   replays, the room lobby). Nothing here rebuilds a screen: a click changes only what it is about. */
import { S, MAP, COLORS, COURSES, courseById, aiById, aiAllowed, aiCourseOK, aiUsesNet, recNewGame, replayCheck, plural } from '../engine.gen.js';
import { $, esc, setHTML, setText } from './dom.js';
import { UI, NET, G, cur, isAI, online, myId, inGame, loadSave, save, myGames } from './state.js';
import { GAME_READY } from './ready.js';
import { toast, banner } from './dialogs.js';
import { showGame, resumeSaved, resignSeat, resignLocal, endLocal } from './actions.js';
import { aiReset, aiKick, aiNetLoad } from './ai.js';
import { api, gsiMount, signOut, signedIn, joinRoom, leaveRoomSocket, openLobbyWs, closeLobbyWs, netSend, exitOnline, resignOnline } from './online.js';
import { loadReplayId, openReplay } from './replay.js';
/* course list: official routes first; 'random' picks one of them */
export function pickCourse(id){return id==='random'?COURSES[Math.floor(Math.random()*COURSES.length)]:(courseById(id)||COURSES[0]);}
export function courseName(id){return id==='random'&&COURSES.length>1?'Random course':(courseById(id)||COURSES[0]).name;}
export const MENU={dlg:null,f:null,screen:null,acct:null,closeT:0};
const mq=s=>MENU.f.querySelector(s),mqa=s=>MENU.f.querySelectorAll(s);
export const radio=n=>{const e=MENU.f.querySelector(`input[name="${n}"]:checked`);return e?e.value:null;};
const setRadio=(n,v)=>{const e=MENU.f.querySelector(`input[name="${n}"][value="${v}"]`);if(e)e.checked=true;};
const SETUP={seed:(Math.random()*1e9)|0,id:null,cur:null,map:null};

export function menuInit(){
  MENU.dlg=$('#menu');MENU.f=$('#mform');
  // (courses, seats, AI and colour choices are written into the page by build.mjs: the start screen needs no script)
  // AI seats chosen before are remembered on this device
  let ai=[];try{ai=JSON.parse(localStorage.getItem('eldorado-seats')||'[]');}catch(e){}
  mqa('#seats select').forEach((s,i)=>{if(aiById(ai[i]))s.value=ai[i];});
  MENU.f.addEventListener('submit',e=>e.preventDefault());
  MENU.f.addEventListener('change',menuChange);
  MENU.f.addEventListener('click',menuClick);
  mq('#jCode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();mq('#jGo').click();}});
  MENU.dlg.addEventListener('cancel',e=>{e.preventDefault();if(menuDismissible())menuClose();}); // Esc
  MENU.dlg.addEventListener('click',e=>{if(e.target===MENU.dlg&&menuDismissible())menuClose();}); // the backdrop
  setupSync();
  const d=MENU.dlg;
  if(document.documentElement.classList.contains('resume'))d.close(); // a saved game or a link opens instead (boot decides)
  else if(d.open){d.style.animation='none';d.close();d.showModal();requestAnimationFrame(()=>d.style.animation='');MENU.f.focus({preventScroll:true});}
}
const menuDismissible=()=>inGame()&&MENU.screen!=='room';

/* show a screen (opening the dialog if it isn't open) */
export function menuOpen(screen){
  $('#overlay').innerHTML=''; // one window at a time: the menu replaces results, rules or the journal (never left underneath it)
  const d=MENU.dlg,ig=inGame(),rs=ig?resignSeat():-1;
  mq('#ingame').hidden=!ig;
  if(ig){mq('#igTxt').innerHTML=`<b>Game in progress</b> · round ${S.round}${online()?' · online':''}`;const r=mq('#sResign');r.hidden=rs<0;
    r.textContent='Resign'+(rs>=0&&!online()&&S.players.filter(p=>!p.ai).length>1?' ('+S.players[rs].name+')':'');mq('#sEnd').hidden=online();}
  if(screen==='setup'){const saved=loadSave();mq('#sResume').hidden=!(saved&&!saved.S.over&&!ig);setText(mq('#sGo'),ig?'Start a new game':'Start expedition');}
  acctRender();
  setRadio('mode',screen==='online'||screen==='room'?'online':'local');
  if(MENU.screen!==screen){for(const s of mqa('section[data-screen]'))s.hidden=s.dataset.screen!==screen;MENU.screen=screen;MENU.f.scrollTop=0;}
  clearTimeout(MENU.closeT);d.classList.remove('closing');document.documentElement.classList.remove('resume');
  // the page opens the dialog as plain HTML (before any script); the first time, it becomes a modal dialog (focus, Esc),
  // looking exactly the same (no fade: it is already on screen)
  if(d.open&&!d.matches(':modal')){d.style.animation='none';d.close();d.showModal();requestAnimationFrame(()=>d.style.animation='');MENU.f.focus({preventScroll:true});}
  else if(!d.open){d.showModal();MENU.f.scrollTop=0;MENU.f.focus({preventScroll:true});}
}
export function menuClose(){const d=MENU.dlg;document.documentElement.classList.remove('resume');if(!d||!d.open)return;d.classList.add('closing');clearTimeout(MENU.closeT);MENU.closeT=setTimeout(()=>{d.close();d.classList.remove('closing');},160);}
// after signing in or out: the account bar and whatever depends on it
export function menuRefresh(){acctRender();if(MENU.screen==='online')onlineRender();}

/* ---- the account bar (rebuilt only when who's signed in, or their numbers, change) ---- */
export function acctRender(){
  const el=mq('#acct'),u=NET.user,key=!NET.available?'-':u?[u.id,u.name,Math.round(u.rating),u.games,u.wins].join('|'):'out';
  if(MENU.acct===key)return;MENU.acct=key;el.hidden=!NET.available;if(!NET.available)return;
  if(!u){el.innerHTML=`<span class="m">Not signed in</span>${NET.cfg&&NET.cfg.google?'<div id="gsiTop" class="gsiSm gsi"></div>':''}`;gsiMount(el.querySelector('#gsiTop'),t=>toast(t,3000),menuRefresh,'medium');return;}
  el.innerHTML=`<span class="av">${esc(u.name.slice(0,1).toUpperCase())}</span><span><b>${esc(u.name)}</b> · <b class="rt">${Math.round(u.rating)}</b> · ${plural(u.games,'game')} · ${plural(u.wins,'win')}</span><span class="acb"><button type="button" class="linkbtn" id="acProfile">Profile</button><button type="button" class="linkbtn" id="acOut">Sign out</button></span>`;
}

/* ---- every choice ---- */
export function menuChange(e){
  const n=e.target.name||e.target.id;
  if(n==='mode'){if(e.target.value==='online')showHub();else showSetup();return;}
  if(n==='np'||n==='course'||n==='full'||n==='priv'||/^(who|col|nm)\d$/.test(n)){setupSync();prepareGame();
    if(/^who\d$/.test(n))try{localStorage.setItem('eldorado-seats',JSON.stringify([...mqa('#seats select')].map(s=>s.value)));}catch(_){} return;}
  if(n==='otab'){onlineTab();return;}
  if(n==='rlrated'){netSend({t:'rated',v:e.target.value==='1'});return;}
  if(n==='rlcol'){netSend({t:'color',color:e.target.value});return;}
  if(n==='rFile')uploadReplay(e.target.files[0]);
}
export function menuClick(e){
  const b=e.target.closest('button');if(!b||b.disabled)return;
  const err=t=>{mq('#hErr').textContent=t;};
  const run=f=>Promise.resolve().then(f).catch(x=>err(x.message));
  switch(b.id){
    case'sBack':menuClose();return;
    case'sResign':menuClose();online()?resignOnline():resignLocal();return;
    case'sEnd':menuClose();endLocal();return;
    case'sReplays':showReplays();return;
    case'sResume':menuClose();resumeSaved();return;
    case'sGo':delete b.dataset.q;startLocal();return;
    case'acProfile':NET.viewUser=null;setRadio('otab','me');showHub();return;
    case'acOut':signOut(menuRefresh);return;
    case'devGo':run(async()=>signedIn(await api('/api/auth/dev',{method:'POST',body:JSON.stringify({name:mq('#devName').value||'Tester'})}),menuRefresh));return;
    case'qGo':run(async()=>joinRoom((await api('/api/match',{method:'POST',body:'{}'})).code));return;
    case'cGo':run(async()=>joinRoom((await api('/api/rooms',{method:'POST',body:JSON.stringify({max:+radio('max'),turn:+radio('turn'),course:radio('ocourse'),pub:radio('pub')==='1',rated:radio('rated')==='1'})})).code));return;
    case'jGo':{const c=(mq('#jCode').value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(c.length<4){err('Enter the 5-letter room code.');return;}joinRoom(c);return;}
    case'rejoinGo':joinRoom(NET.active);return;
    case'pfBack':NET.viewUser=null;setRadio('otab','board');onlineTab();return;
    case'meSave':run(async()=>{const r=await api('/api/me',{method:'PATCH',body:JSON.stringify({name:mq('#meName').value})});NET.user=r.user;toast('Saved as '+r.user.name);acctRender();});return;
    case'lkCopy':{const i=mq('#lkIn');i.select();navigator.clipboard&&navigator.clipboard.writeText(i.value).then(()=>toast('Link copied')).catch(()=>{});return;}
    case'rlLeave':netSend({t:'leave'});NET.code=null;leaveRoomSocket();try{history.replaceState(null,'',location.pathname);}catch(_){}showHub();return;
    case'rlStart':netSend({t:'start'});return;
    case'rlNow':netSend({t:'now'});return;
    case'rUp':mq('#rFile').click();return;
  }
  if(b.dataset.go==='setup'){showSetup();return;}
  if(b.dataset.join){joinRoom(b.dataset.join);return;}
  if(b.dataset.uid){NET.viewUser=b.dataset.uid;setRadio('otab','me');onlineTab();return;}
  if(b.dataset.rid||b.dataset.id){closeLobbyWs();loadReplayId(b.dataset.rid||b.dataset.id);return;}
  if(b.dataset.lid){const L=myGames().find(x=>x.lid===b.dataset.lid);if(L)openReplay(L,null);return;}
  if(b.dataset.addai){netSend({t:'addAI',ai:b.dataset.addai});return;}
  if(b.dataset.rmai){netSend({t:'removeAI',uid:b.dataset.rmai});return;}
}

/* ---- start screen ---- */
export function showSetup(){closeLobbyWs();setupSync();prepareGame();menuOpen('setup');}
// what the choices allow: seats shown, AI only where it plays, one colour per seat, at least one person
export function setupSync(){
  const n=+radio('np'),aiOK=aiAllowed(radio('course'),n),rows=[...mqa('#seats .seat')];
  mq('#n2note').hidden=n!==2;mq('#aiNote').hidden=aiOK;
  const col=r=>r.querySelector('.sws input:checked').value;
  rows.forEach((r,i)=>{r.hidden=i>=n;const sel=r.querySelector('select');
    for(const o of sel.querySelectorAll('optgroup option'))o.disabled=!aiOK;if(!aiOK&&sel.value)sel.value='';
    const A=aiById(sel.value);r.querySelector('input[name^=nm]').hidden=!!A;const nm=r.querySelector('.ainm');nm.hidden=!A;
    if(A){nm.title=A.desc;nm.firstChild.textContent=A.desc;}
    if(i<n&&rows.slice(0,i).some(q=>col(q)===col(r))){const free=COLORS.find(c=>!rows.slice(0,n).some(q=>q!==r&&col(q)===c.id));if(free)r.querySelector(`.sws input[value="${free.id}"]`).checked=true;}});
  rows.forEach((r,i)=>{for(const x of r.querySelectorAll('.sws input'))x.disabled=rows.slice(0,n).some((q,j)=>j!==i&&col(q)===x.value);});
  const allAI=rows.slice(0,n).every(r=>r.querySelector('select').value);mq('#allAI').hidden=!allAI;mq('#sGo').disabled=allAI;
}
/* The start screen's background IS the game about to start: made from the current choices (this deal's seed) and laid
   out exactly as it will be played (board, pieces, hand, top bar). A changed choice remakes it behind the menu; Start
   only takes the menu away: nothing is redrawn or refitted. UI.preview marks a game not started yet (no AI moves, not
   saved). */
export function setupOpts(){
  const n=+radio('np'),rows=[...mqa('#seats .seat')].slice(0,n),who=rows.map(r=>r.querySelector('select').value),id=radio('course');
  if(SETUP.id!==id||!SETUP.cur){SETUP.id=id;SETUP.cur=pickCourse(id);}
  return{course:SETUP.cur,seed:SETUP.seed,privacy:mq('#sPriv').checked,fullRace:radio('full')==='1',
    players:rows.map((r,i)=>{const A=aiById(who[i]),k=who.slice(0,i).filter(x=>x===who[i]).length;
      return{name:A?A.name+(k?' '+(k+1):''):r.querySelector('input[name^=nm]').value.trim()||('Player '+(i+1)),color:COLORS.find(c=>c.id===r.querySelector('.sws input:checked').value).hex,ai:A?A.id:undefined};})};
}
export function prepareGame(force){
  if(inGame()&&!force)return;
  if(online())exitOnline(); // a finished online game: its room is left (rejoin a running one from Online)
  aiReset();G.rec=recNewGame(setupOpts());UI.preview=true;UI.lastReplay=null;
  UI.mode='idle';UI.card=null;UI.picks=[];UI.buy=null;UI.pending=null;UI.piece=0;UI.viewer=null;
  UI.cover=S.privacy&&!isAI(S.cur)&&S.players.filter(p=>!p.ai).length>1;showGame();
  setHTML(mq('#rInfo'),`Boards <b>${MAP.route.join(' · ')}</b> · El Dorado (${MAP.endSym==='j'?'jungle':'water'} side) · ${MAP.blockDefs.length} blockades, dealt at random`);
}
export function startLocal(){
  if(!GAME_READY.done){GAME_READY.then(startLocal);return;} // the game's fonts are still on their way: start the moment they're in
  if(mq('#sGo').disabled)return;
  if(!UI.preview)prepareGame(true); // Start a new game from a game in progress: made behind the menu first
  UI.preview=false;save();if(S.players.some(p=>p.ai&&aiUsesNet(p.ai)))aiNetLoad();
  menuClose();aiKick();
  if(!UI.cover)banner(cur().name,isAI(S.cur)?'AI · Round 1':'Round 1');
  SETUP.seed=(Math.random()*1e9)|0;SETUP.cur=null; // the next deal
}

/* ---- Online ---- */
export function showHub(){if(NET.user)openLobbyWs();onlineRender();menuOpen('online');}
export function onlineRender(){
  const u=NET.user;mq('#oOff').hidden=NET.available;mq('#oOut').hidden=!NET.available||!!u;mq('#oIn').hidden=!NET.available||!u;
  if(!NET.available)return;
  if(!u){mq('#oNoG').hidden=!!NET.cfg.google;mq('#oDev').hidden=!NET.cfg.dev;return;}
  mq('#rejoin').hidden=!NET.active;roomsRender();onlineTab();
}
export function roomsRender(){
  const rrow=r=>`<div class="rrow"><span>${r.auto?'<b>Quick match</b>':`<b>${esc(r.host)}</b>’s room`} <span class="note">· ${r.count}/${r.max}${r.ai?` (${r.ai} AI)`:''} · ${r.turn}s turns · ${r.rated===false?'unrated':'rated'} · ${esc(courseName(r.course))}</span></span>${r.status==='lobby'&&r.count<r.max?`<button type="button" class="btn" data-join="${r.code}">Join</button>`:'<span class="note">in progress</span>'}</div>`;
  const open=NET.rooms.filter(r=>r.status==='lobby'),live=NET.rooms.filter(r=>r.status==='playing');
  setHTML(mq('#roomsOpen'),open.map(rrow).join('')||'<p class="note">No open rooms right now. Create one and share the code.</p>');
  mq('#liveBox').hidden=!live.length;setHTML(mq('#roomsLive'),live.map(rrow).join(''));
}
/* the Online tabs show by themselves (CSS); this fetches what the shown tab needs (at most every 5 s) */
const PROFILES={},FETCHED={};
export function fetchOnce(key,url,done){const t=FETCHED[key];if(t&&(t.busy||Date.now()-t.at<5000))return;FETCHED[key]={busy:true};
  api(url).then(r=>{FETCHED[key]={at:Date.now()};done(r);}).catch(()=>{FETCHED[key]={at:Date.now()};});}
export function loadProfile(id){return api('/api/users/'+encodeURIComponent(id)).then(r=>{PROFILES[id]=r;});}
export function onlineTab(){
  if(!NET.user)return;const t=radio('otab');
  if(t==='board')fetchOnce('lb','/api/leaderboard',r=>setHTML(mq('#lbList'),lbHTML(r.players)));
  if(t==='me'){const id=NET.viewUser||myId(),own=id===myId();mq('#pfBack').hidden=own;mq('#meNameBox').hidden=!own;
    if(own&&document.activeElement!==mq('#meName'))mq('#meName').value=NET.user.name;
    setHTML(mq('#pf'),PROFILES[id]?profileHTML(PROFILES[id]):'<p class="note">Loading…</p>');
    fetchOnce('pf:'+id,'/api/users/'+encodeURIComponent(id),r=>{PROFILES[id]=r;if((NET.viewUser||myId())===id)setHTML(mq('#pf'),profileHTML(r));});}
}
const lbHTML=players=>players.length?`<div class="lb">${players.map((p,i)=>{const A=p.bot&&aiById(p.bot);return`<span class="m">${i+1}</span><span class="lbp"><button type="button" class="lbn${p.id===myId()?' me':''}" data-uid="${esc(p.id)}">${esc(p.name)}</button>${A?`<span class="aitag" title="${esc(A.desc)}">AI</span><span class="note">${esc(A.tier)}</span>`:''}</span><span>${Math.round(p.rating)}</span><span class="m">${p.wins}/${p.games}</span>`;}).join('')}</div><p class="note">Wins / rated games. The AI players are rated like everyone else: beat them to gain rating. Their starting ratings come from hundreds of games against each other; Raleigh (Steady) starts where every new player does, at 1200.</p>`:'<p class="note">No rated games yet.</p>';
const ordn=n=>n+(['th','st','nd','rd'][n%100>10&&n%100<14?0:Math.min(n%10,4)%4]||'th');
export function profileHTML(r){const u=r.user,A=u.bot&&aiById(u.bot);
  const stat=(v,l)=>`<div class="pst"><b>${v}</b><span>${l}</span></div>`;
  return`<div class="pfh"><span class="av big">${esc(u.name.slice(0,1).toUpperCase())}</span><div><h3>${esc(u.name)}${A?' <span class="aitag">AI</span>':''}</h3>${A?`<span class="note">${esc(A.tier)} · ${esc(A.desc)}</span>`:''}</div></div>
  <div class="pstats">${stat(Math.round(u.rating),'rating')}${stat('#'+u.rank,'rank')}${stat(u.games,'rated games')}${stat(u.wins,'wins')}${stat(u.games?Math.round(100*u.wins/u.games)+'%':'–','win rate')}</div>
  <div class="field"><label>Recent games</label><div class="rlist">${r.games.length?r.games.map(g=>`<button type="button" data-rid="${esc(g.id)}"><b>${g.place?`<span class="plc p${g.place}">${ordn(g.place)}</span> `:''}${esc(g.title||'Game')}</b><span>${new Date(g.created).toLocaleString()} · ${g.actions} moves · watch replay</span></button>`).join(''):'<p class="note">No recorded games yet.</p>'}</div></div>`;}

/* ---- the room lobby: drawn from the room the server sends; each part changes only when its data does ---- */
export function showRoomLobby(){renderRoomLobby();menuOpen('room');}
export function renderRoomLobby(){
  if(!MENU.f)return;const r=NET.room||{},o=r.opts,seats=r.seats||[],host=r.host===myId(),auto=!!(o&&o.auto),lobby=r.status==='lobby';
  const max=o?o.max:4,room=seats.length<max,rated=!(o&&o.rated===false),mine=seats.find(s=>s.uid===myId());
  mq('#rlTitle').textContent='Room '+(NET.code||'');
  mq('#rlSub').textContent=(auto?`Quick match: the game starts as soon as ${o.max} players are here, or earlier if everyone here presses “Start now”.`:host?'Share the code or link. Start when everyone is here.':'Waiting for the host to start.')
    +(o?` ${courseName(o.course)} · ${auto?'':(o.pub===false?'private · ':'public · ')+o.max+' players max · '}${o.turn}s per turn · ${rated?'rated':'unrated'}`:'');
  mq('#lkIn').value=location.origin+location.pathname+'?room='+NET.code;
  mq('#rlCount').textContent=`Players ${seats.length}/${max}`;
  setHTML(mq('#rlSeats'),seats.map(s=>{const A=s.ai&&aiById(s.ai);return`<div class="seatrow"><span><i style="background:${s.color}"></i><b>${esc(s.name)}</b>${A?'<span class="aitag">AI</span>':''}${s.uid===myId()?' <span class="note">(you)</span>':''}</span>${A?`<span class="lbp"><span class="note">${esc(A.tier)}</span>${host&&lobby?`<button type="button" class="rmai" data-rmai="${esc(s.uid)}" aria-label="Remove ${esc(s.name)}" title="Remove">×</button>`:''}</span>`:`<span class="note">${s.now?'wants to start · ':''}${s.uid===r.host&&!auto?'host · ':''}${s.online?'here':'away'}</span>`}</div>`;}).join('')||'<p class="note">Connecting…</p>');
  const ctl=host&&!auto&&lobby,aiOK=!!(o&&aiCourseOK(o.course)&&o.max>=3);
  mq('#rlAIBox').hidden=!ctl;mq('#rlAINo').hidden=aiOK;mq('#rlAIList').hidden=!aiOK||!room;mq('#rlFull').hidden=!aiOK||room;
  mq('#rlAINote').textContent='AI players move on the server'+(rated?' and gain or lose rating like everyone else':'')+'.';
  mq('#rlRatedBox').hidden=!ctl;setRadio('rlrated',rated?'1':'0');
  mq('#rlColBox').hidden=!mine;
  if(mine)for(const x of mqa('#rlCols input')){x.checked=x.value===mine.color;x.disabled=seats.some(s=>s!==mine&&s.color===x.value);}
  mq('#rlNoSeat').hidden=!!mine||!lobby||!r.seats;
  const st=mq('#rlStatus');st.hidden=!NET.status;st.textContent=NET.status||'';
  mq('#rlLeave').textContent=host&&!auto?'Close room':'Leave';
  const nw=mq('#rlNow');nw.hidden=!(auto&&mine);if(mine){nw.textContent=mine.now?'Waiting for the others… (cancel)':'Start now';nw.classList.toggle('pri',!mine.now);nw.disabled=seats.length<2;}
  const sg=mq('#rlStart');sg.hidden=!(host&&!auto);sg.disabled=seats.length<2;
}

/* ---- replays ---- */
export function showReplays(){
  const mine=mq('#rMine'),loc=myGames(),row=(attr,title,sub)=>`<button type="button" ${attr}><b>${esc(title)}</b><span>${esc(sub)}</span></button>`;
  const showMine=online=>{const items=[...loc.map(L=>({t:L.created,h:row(`data-lid="${esc(L.lid)}"`,L.title||'Game',`on this device · ${L.actions.length} moves · ${new Date(L.created).toLocaleString()}`)})),
      ...online.map(g=>({t:g.created,h:row(`data-id="${esc(g.id)}"`,g.title||'Game',`online · ${g.actions} moves · ${new Date(g.created).toLocaleString()}`)}))].sort((a,b)=>b.t-a.t);
    setHTML(mine,items.length?items.map(x=>x.h).join(''):'<p class="note">No finished games yet. Games you finish here are kept to watch again.</p>');};
  showMine([]);
  if(NET.available&&NET.user)api('/api/users/'+encodeURIComponent(myId())).then(j=>showMine(j.games||[])).catch(()=>{});
  const list=mq('#rList');
  if(!NET.available)setHTML(list,'<p class="note">Uploading and the shared list need the online server; a file you pick still plays here.</p>');
  else fetch('/api/replays').then(r=>r.json()).then(j=>{const rs=j.replays||[];
    setHTML(list,rs.length?rs.map(r=>row(`data-id="${esc(r.id)}"`,r.title||r.players,`${r.players} · ${r.actions} moves · ${new Date(r.created).toLocaleString()}`)).join(''):'<p class="note">No replays yet.</p>');}).catch(()=>setHTML(list,'<p class="note">Could not load the list.</p>'));
  menuOpen('replays');
}
async function uploadReplay(f){
  const msg=mq('#rMsg');if(!f)return;msg.textContent='Uploading…';
  try{const text=await f.text();let log;try{log=JSON.parse(text);}catch(_){throw new Error('That file is not valid JSON.');}
    const err=replayCheck(log);if(err)throw new Error(err);
    let id=null;
    if(NET.available){const r=await fetch('/api/replays',{method:'POST',headers:{'content-type':'application/json'},body:text});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Upload failed ('+r.status+')');id=j.id;}
    msg.textContent='';openReplay(log,id);}
  catch(e){msg.textContent=e.message;}
}

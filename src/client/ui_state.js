/* =========================================================
   UI STATE + ACTIONS. Every rules change goes through act():
   locally it runs the shared engine; online it is sent to the server,
   which runs the same engine and sends back the new state.
   ========================================================= */
let undoStack=[];
let REPLAY=null; // set while watching a replay (ui_replay.js): nothing can be played then
let REC=null; // the local game's log (engine recNewGame): saved with the game, kept as a replay once the game is over
const UI={mode:'idle',card:null,piece:0,picks:[],targets:new Map(),cover:false,hover:null,mktOpen:true,allOpen:false};
const cur=()=>S.players[S.cur];
const NET={available:false,cfg:null,user:null,token:null,ws:null,lobbyWs:null,room:null,seat:-1,connected:false,deadline:null,skew:0,canUndo:false,busy:false,status:'',rooms:[]};
const myId=()=>NET.user?NET.user.id:null;
const online=()=>!!(S&&S.owners);
const isAI=i=>!!(S&&S.players[i]&&S.players[i].ai);
const canAct=()=>!REPLAY&&(!S||(online()?S.owners[S.cur]===myId()&&NET.connected&&!S.over:!isAI(S.cur)));
// local games with AI seats: while an AI moves, the table shows the hand of the human who played last
const viewIdx=()=>{if(!online()){if(!isAI(S.cur)||REPLAY)return S.cur;const h=isAI(UI.viewer)||UI.viewer==null||UI.viewer>=S.players.length?S.players.findIndex(p=>!p.ai):UI.viewer;return h<0?S.cur:h;}const i=S.owners.indexOf(myId());return i<0?S.cur:i;};
const hp=()=>S.players[viewIdx()];
function snapshot(){undoStack.push(JSON.stringify(S));if(undoStack.length>60)undoStack.shift();}
/* local save: v5 (players may have .ai); v4 saves have the same shape without AI seats */
function loadSave(){let s=null;try{s=JSON.parse(localStorage.getItem('eldorado-save-v5')||localStorage.getItem('eldorado-save-v4')||'null');}catch(e){}
  if(!s||(s.v!==4&&s.v!==5)||s.owners)return null;s.v=5;return s;}
function save(){if(online()||REPLAY)return;try{localStorage.setItem('eldorado-save-v5',JSON.stringify(S));if(REC)localStorage.setItem('eldorado-rec-v1',JSON.stringify(REC));else localStorage.removeItem('eldorado-rec-v1');}catch(e){}}
// the saved game's log, if it belongs to that game (games saved before games were recorded have none)
function loadRec(s){try{const r=JSON.parse(localStorage.getItem('eldorado-rec-v1')||'null');
  if(r&&s&&r.seed===s.seed&&r.course===s.course.id&&Number.isInteger(s.nact)&&Array.isArray(r.actions)&&r.actions.length>=s.nact)return r;}catch(e){}return null;}
/* continue the saved local game (first visit, or back from a replay). Returns false if there is none in progress. */
function resumeSaved(){const saved=loadSave();if(!saved||saved.over)return false;
  try{aiReset();UI.viewer=null;S=saved;REC=loadRec(S);MAP=mapFor(S);buildBoard();UI.mode='idle';UI.piece=firstPiece();UI.cover=!!S.privacy;syncMode(false);lastPlayer=-1;render();requestAnimationFrame(()=>fit());
    if(!UI.cover)banner(cur().name,'Round '+S.round);return true;}catch(e){console.error(e);S=null;return false;}}
/* resign: online the server does it; locally the player whose turn it is (or, while an AI moves, the human watching) leaves.
   Everyone else plays on; with no human left racing, the AIs finish the game quickly. */
function resignSeat(){if(!S||S.over||REPLAY)return -1;if(online()){const i=S.owners.indexOf(myId());return i>=0&&isActive(S.players[i])?i:-1;}
  const i=isAI(S.cur)?viewIdx():S.cur;return isAI(i)||!isActive(S.players[i])?-1:i;}
function resignLocal(){const seat=resignSeat();if(seat<0)return;
  const humans=S.players.filter((p,j)=>j!==seat&&!p.ai&&isActive(p)).length;
  modal(`<h2>Resign?</h2><p class="sub">${esc(S.players[seat].name)} leaves the expedition and finishes last among the players still racing. ${humans?'The others play on.':'The AIs finish the race.'}</p><div class="mrow"><button class="btn" id="rsNo">Keep playing</button><button class="btn pri" id="rsYes">Resign</button></div>`,sc=>{
    sc.querySelector('#rsNo').onclick=closeModal;
    sc.querySelector('#rsYes').onclick=()=>{closeModal();if(!S||S.over||online())return;const prevCur=S.cur,prevRound=S.round;
      const r=recResign(REC,seat);if(!r.ok)return;undoStack=[];playEvents(r.ev);afterLocalChange(S.cur!==prevCur||S.round!==prevRound);};},true);}
const humanRacing=()=>S.players.some(p=>!p.ai&&isActive(p));
/* finished local games are kept on this device (newest first, up to 20) to watch again from Replays */
const MYGAMES='eldorado-games-v1';
function myGames(){try{return JSON.parse(localStorage.getItem(MYGAMES)||'[]');}catch(e){return[];}}
function keepLocalReplay(){
  const L=recFinal(REC);REC=null;if(!L)return null;L.created=Date.now();L.lid=L.created.toString(36);
  const list=[L,...myGames()].slice(0,20);
  for(;;){try{localStorage.setItem(MYGAMES,JSON.stringify(list));break;}catch(e){if(list.length<=1)break;list.pop();}} // storage full: drop the oldest
  return L;
}

function computeTargets(){
  const T=new Map();UI.targets=T;if(!S||S.over||UI.cover||!canAct()||NET.busy||S.turn.pending)return;
  const act=S.turn.active;
  if(UI.mode==='card'){
    const id=UI.card,d=def(id);if(!d)return;
    if(typeOf(id)==='native'){for(const[k,v]of nativeTargets(S.cur,UI.piece))T.set(k,v);return;}
    const isAct=act&&act.id===id;
    const pi=isAct?act.pi:UI.piece;
    const syms=isAct?[act.sym]:(d.s==='*'?['j','w','v']:[d.s]);
    const budget=isAct?act.left:d.p;
    for(const[k,v]of reach(S.cur,pi,syms,budget))T.set(k,v);
    // a card from hand can also be dropped onto rubble / base camp / a rubble blockade next to the explorer
    if(!isAct&&cur().hand.includes(id))for(const[k,v]of payTargets(S.cur,UI.piece))if(!T.has(k))T.set(k,v);
  }else if(UI.mode==='idle'){
    for(const[k,v]of payTargets(S.cur,UI.piece))T.set(k,v);
  }else if(UI.mode==='discardFor'&&UI.pending){T.set(UI.pending.tk,UI.pending);}
}
function cardUsable(id){
  const t=typeOf(id),d=CT[t],pl=cur();if(!d)return false;const pk=pl.pieces[UI.piece];
  if(!pk||pk==='done')return d.c==='p'&&t!=='native';
  if(t==='native')return nativeTargets(S.cur,UI.piece).size>0;
  if(d.c==='p')return true;
  if(payTargets(S.cur,UI.piece).size)return true;
  return reach(S.cur,UI.piece,d.s==='*'?['j','w','v']:[d.s],d.p).size>0;
}
const isTargeted=id=>{const d=def(id);return d&&(d.c!=='p'||typeOf(id)==='native');};
function firstPiece(){return Math.max(0,cur().pieces.findIndex(k=>k!=='done'));}
/* after the state changed, put the UI into the matching mode */
function syncMode(turnChanged){
  if(!S)return;
  if(turnChanged||!canAct()){UI.mode='idle';UI.card=null;UI.picks=[];UI.buy=null;UI.pending=null;}
  if(S.turn.pending){UI.mode='trashPick';UI.max=S.turn.pending.max;if(turnChanged)UI.picks=[];}
  else if(UI.mode==='trashPick'){UI.mode='idle';UI.picks=[];}
  if(S.turn.active&&canAct()){UI.mode='card';UI.card=S.turn.active.id;UI.piece=S.turn.active.pi;}
  else if(UI.mode==='card'&&(!UI.card||!cur().hand.includes(UI.card))){UI.mode='idle';UI.card=null;}
  if(turnChanged||cur().pieces[UI.piece]==='done'||UI.piece>=cur().pieces.length)UI.piece=firstPiece();
}
/* animations and messages for engine events; call BEFORE render so the market DOM is still the old one */
function playEvents(ev,viewer){
  for(const e of ev||[]){
    sfxEvent(e,viewer);
    const watched=feedWatch(e.pl); // another player's turn: shown in the row under the prompt (ui_view.js)
    if(e.e==='play'&&!watched)feedClear(); // I (or a pass-and-play human here) act: the last recap goes
    if(watched)feedEvent(e);
    if(e.e==='move')animatePiece(e.pl,e.pi,e.path);
    else if(e.e==='block'){if(!watched)toast(S.players[e.pl].name+' claims blockade #'+e.n);}
    else if(e.e==='arrive')toast(S.players[e.pl].name+' reaches El Dorado!',2200);
    else if(e.e==='gain'&&(viewer===undefined||viewer===e.pl))flyToDiscard(e.t,takeBuyFrom()||marketRectOf(e.t));
    else if(e.e==='timeout')toast(S.players[e.pl].name+' ran out of time');
    else if(e.e==='resign')toast(S.players[e.pl].name+' left the game');
  }
}
function act(a){
  if(!S||!canAct())return;
  if(online()){NET.busy=true;netSend({t:'act',a});render();return;}
  const prevCur=S.cur,prevRound=S.round;
  snapshot();
  const r=recAct(REC,S.cur,a);
  if(!r.ok){undoStack.pop();sfx('error');toast(r.err);render();return;}
  if(r.reveal||S.cur!==prevCur)undoStack=[];
  playEvents(r.ev);
  afterLocalChange(S.cur!==prevCur||S.round!==prevRound);
}
function afterLocalChange(turnChanged){
  UI.picks=[];UI.buy=null;UI.pending=null;if(['pay','discardFor','transmit','endTurn'].includes(UI.mode)){UI.mode='idle';UI.card=null;}
  if(!turnChanged){syncMode(false);render();}
  else{
    syncMode(true);
    // hide the hand between human players only (pass-and-play); AI turns never need it
    if(S.privacy&&!S.over&&!isAI(S.cur)&&S.players.filter(p=>!p.ai).length>1)UI.cover=true;
    render();
    if(!UI.cover&&!S.over){banner(cur().name,isAI(S.cur)?'AI · Round '+S.round:'Round '+S.round);ensureVisible();}
  }
  if(S.over){if(REC)UI.lastReplay=keepLocalReplay();setTimeout(()=>showGameOver(),600);}
}

/* ---------- UI actions (build an action from the current selection) ---------- */
function doMove(tk){
  if(UI.mode==='discardFor')return; // the pending space itself: cards are dragged or tapped in
  const tg=UI.targets.get(tk);if(!tg)return;
  if(isDisc(tg)){startDiscard(tk,UI.card&&cur().hand.includes(UI.card)?UI.card:null);return;}
  if(tg.kind==='native'||tg.kind==='nativebl')act({t:'native',card:UI.card,pi:tg.pi,to:tk});
  else act({t:'move',card:UI.card,pi:tg.pi,to:tk});
}
const isDisc=tg=>!!tg&&(tg.kind==='rubble'||tg.kind==='camp'||tg.kind==='blr');
/* Rubble / base camp / rubble blockade: each card dragged (or tapped) onto the space counts toward its cost.
   The move happens as soon as enough cards are in. */
function startDiscard(tk,firstId){
  const tg=UI.targets.get(tk);if(!isDisc(tg))return;
  UI.mode='discardFor';UI.pending={tk,...tg};UI.card=null;UI.picks=[];
  if(firstId)addDiscard(firstId);else render();
}
function addDiscard(id){
  const P=UI.pending;if(!P||!cur().hand.includes(id))return;sfx('discard');
  if(!UI.picks.includes(id)&&UI.picks.length<P.need)UI.picks.push(id);
  if(UI.picks.length>=P.need){confirmDiscardFor();return;}
  render();pulseDiscard();
}
function confirmDiscardFor(){const P=UI.pending;if(!P||UI.picks.length!==P.need)return;sfx(P.kind==='camp'?'trash':'discard');act({t:'pay',pi:P.pi,to:P.tk,cards:UI.picks.slice()});}
function playAction(id){
  const t=typeOf(id);
  if(t==='native'){UI.mode='card';UI.card=id;render();return;}
  if(t==='transmitter'){UI.mode='transmit';UI.card=id;render();openAll(true);return;}
  act({t:'action',card:id});
}
function confirmTrash(){if(UI.picks.length)sfx('trash');act({t:'trash',cards:UI.picks.slice()});}
function pickFromMarket(src,idx){
  if(!canAct()){sfx('error');toast('Wait for your turn to buy.');return;}
  const stack=src==='m'?S.market[idx]:S.reserve[idx];if(!stack||stack.n<=0)return;
  if(UI.mode==='transmit'){openAll(false);act({t:'transmit',card:UI.card,type:stack.t});return;}
  if(S.turn.bought){sfx('error');toast('You can buy only one card per turn.');return;}
  if(src==='r'&&!S.market.some(s=>s.n===0)){sfx('error');toast('The reserve opens once a market slot is empty.');return;}
  if(UI.mode==='pay'&&UI.buy.src===src&&UI.buy.idx===idx){cancelMode();return;}
  UI.mode='pay';UI.buy={src,idx,t:stack.t};UI.picks=[];UI.card=null;
  render();
}
function payTotal(){return UI.picks.reduce((a,id)=>a+coinVal(id),0);}
let buyFrom=null;const takeBuyFrom=()=>{const r=buyFrom;buyFrom=null;return r&&Date.now()-r.at<3000?r:null;};
function confirmBuy(){const B=UI.buy;if(!B||payTotal()<CT[B.t].cost)return;{const e=document.querySelector('#buySlot .mcard');if(e){const r=e.getBoundingClientRect();buyFrom={left:r.left,top:r.top,width:r.width,height:r.height,at:Date.now()};}}act({t:'buy',type:B.t,cards:UI.picks.slice()});}
function cancelMode(){
  if(S&&S.turn.pending)return;
  UI.mode='idle';UI.card=null;UI.picks=[];UI.buy=null;UI.pending=null;render();
}
/* cards the player to act could buy right now with the cards in hand */
function affordable(){
  if(!S||S.over||UI.cover||!canAct()||S.turn.bought)return[];
  const cash=cur().hand.reduce((a,id)=>a+coinVal(id),0),open=S.market.some(s=>s.n===0),out=[];
  S.market.forEach((s,i)=>{if(s.n>0&&CT[s.t].cost<=cash)out.push({src:'m',idx:i,t:s.t});});
  if(open)S.reserve.forEach((s,i)=>{if(s.n>0&&CT[s.t].cost<=cash)out.push({src:'r',idx:i,t:s.t});});
  return out;
}
function startEndTurn(){
  if(!canAct()||S.turn.pending)return;
  if(UI.mode!=='buyWarn'&&affordable().length){UI.mode='buyWarn';UI.card=null;UI.picks=[];UI.buy=null;render();return;} // nudge before skipping a purchase
  if(cur().hand.length){UI.mode='endTurn';UI.picks=[];UI.card=null;render();}
  else finishTurn();
}
function finishTurn(){act({t:'end',keep:UI.mode==='endTurn'?UI.picks.slice():[]});}
function undo(){
  if(!canAct())return;
  if(online()){if(NET.canUndo){NET.busy=true;netSend({t:'undo'});}return;}
  if(!undoStack.length)return;
  S=JSON.parse(undoStack.pop());UI.picks=[];UI.buy=null;UI.pending=null;UI.mode='idle';UI.card=null;
  syncMode(false);render();
}
const canUndo=()=>online()?NET.canUndo:undoStack.length>0;

/* =========================================================
   LOCAL AI SEATS (engine_ai.js). The AI decides with the shared engine in this page and plays through the
   same applyAction as everyone else, one action at a time with a short pause so the table can follow.
   ========================================================= */
const AIX={timer:0,mem:{},net:null,loading:null,failed:false,gen:0};
function aiNetLoad(){ // the neural network (~340 KB) is only fetched once a network AI is about to play
  if(AIX.net)return Promise.resolve(AIX.net);
  if(!AIX.loading)AIX.loading=(async()=>{
    let bin;
    if(AI_NET.b64){const s=atob(AI_NET.b64);bin=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bin[i]=s.charCodeAt(i);}
    else{const r=await fetch(AI_NET.url);if(!r.ok)throw new Error('HTTP '+r.status);bin=new Uint8Array(await r.arrayBuffer());}
    AIX.net=aiNetDecode(bin);return AIX.net;
  })().catch(e=>{AIX.failed=true;AIX.loading=null;console.warn('AI network unavailable:',e);toast('The AI network could not load; the AIs play with the route planner.',3200);return null;});
  return AIX.loading;
}
function aiReset(){clearTimeout(AIX.timer);AIX.timer=0;AIX.mem={};AIX.gen++;} // a new game (or a loaded one) starts
/* called after every render: if an AI is to move in a local game, schedule its next action */
function aiKick(){
  if(AIX.timer||!S||S.over||online()||REPLAY||!isAI(S.cur))return;
  const seat=S.cur,round=S.round,gen=AIX.gen,first=!S.turn.active&&!S.players[seat].play.length&&!S.turn.bought;
  const go=async()=>{
    if(gen!==AIX.gen)return;
    if(UI.anim){AIX.timer=setTimeout(go,120);return;} // let a moving explorer finish first (thinking can take a frame or two)
    const id=S&&S.players[seat]&&S.players[seat].ai;
    if(!id||S.over||online()||REPLAY||S.cur!==seat||S.round!==round){AIX.timer=0;aiKick();return;}
    if(aiUsesNet(id)&&!AIX.net&&!AIX.failed)await aiNetLoad();
    if(gen!==AIX.gen)return;
    if(!S||S.over||online()||REPLAY||S.cur!==seat){AIX.timer=0;return;}
    aiSetNet(AIX.net);
    const prevCur=S.cur,prevRound=S.round,mem=AIX.mem[seat]||(AIX.mem[seat]={});
    const r=aiStep(id,mem,REC);
    undoStack=[];AIX.timer=0;
    playEvents(r.ev,viewIdx()); // the AI's purchases don't fly into the human's discard pile
    afterLocalChange(S.cur!==prevCur||S.round!==prevRound);
  };
  AIX.timer=setTimeout(go,!humanRacing()?60:reduceMotion?250:first?1000:750); // paced so the table can follow each card (no one left to follow: quick)
}

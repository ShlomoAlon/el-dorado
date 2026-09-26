/* =========================================================
   UI STATE + ACTIONS. Every rules change goes through act():
   locally it runs the shared engine; online it is sent to the server,
   which runs the same engine and sends back the new state.
   ========================================================= */
let undoStack=[];
const UI={mode:'idle',card:null,piece:0,picks:[],targets:new Map(),cover:false,hover:null,sideOpen:true};
const cur=()=>S.players[S.cur];
const NET={available:false,cfg:null,user:null,token:null,ws:null,lobbyWs:null,room:null,seat:-1,connected:false,deadline:null,skew:0,canUndo:false,busy:false,status:'',rooms:[]};
const myId=()=>NET.user?NET.user.id:null;
const online=()=>!!(S&&S.owners);
const canAct=()=>!S||!online()||(S.owners[S.cur]===myId()&&NET.connected&&!S.over);
const viewIdx=()=>{if(!online())return S.cur;const i=S.owners.indexOf(myId());return i<0?S.cur:i;};
const hp=()=>S.players[viewIdx()];
function snapshot(){undoStack.push(JSON.stringify(S));if(undoStack.length>60)undoStack.shift();}
function save(){if(online())return;try{localStorage.setItem('eldorado-save-v3',JSON.stringify(S));}catch(e){}}

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
  }else if(UI.mode==='idle'){
    for(const[k,v]of payTargets(S.cur,UI.piece))T.set(k,v);
  }
}
function cardUsable(id){
  const t=typeOf(id),d=CT[t],pl=cur();if(!d)return false;const pk=pl.pieces[UI.piece];
  if(!pk||pk==='done')return d.c==='p'&&t!=='native';
  if(t==='native')return nativeTargets(S.cur,UI.piece).size>0;
  if(d.c==='p')return true;
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
    if(e.e==='move')animatePiece(e.pl,e.pi,e.path);
    else if(e.e==='block')toast(S.players[e.pl].name+' claims blockade #'+e.n);
    else if(e.e==='arrive')toast(S.players[e.pl].name+' reaches El Dorado!',2200);
    else if(e.e==='gain'&&(viewer===undefined||viewer===e.pl))flyToDiscard(e.t,marketRect(e.src,e.idx));
    else if(e.e==='timeout')toast(S.players[e.pl].name+' ran out of time');
    else if(e.e==='resign')toast(S.players[e.pl].name+' left the game');
  }
}
function act(a){
  if(!S||!canAct())return;
  if(online()){NET.busy=true;netSend({t:'act',a});render();return;}
  const prevCur=S.cur,prevRound=S.round;
  snapshot();
  const r=applyAction(S.cur,a);
  if(!r.ok){undoStack.pop();toast(r.err);render();return;}
  if(r.reveal||S.cur!==prevCur)undoStack=[];
  playEvents(r.ev);
  afterLocalChange(S.cur!==prevCur||S.round!==prevRound);
}
function afterLocalChange(turnChanged){
  UI.picks=[];UI.buy=null;UI.pending=null;if(['pay','discardFor','transmit','endTurn'].includes(UI.mode)){UI.mode='idle';UI.card=null;}
  if(!turnChanged){syncMode(false);render();}
  else{
    syncMode(true);
    if(S.privacy&&!S.over)UI.cover=true;
    render();
    if(!UI.cover&&!S.over){banner(cur().name,'Round '+S.round);ensureVisible();}
  }
  if(S.over)setTimeout(()=>showGameOver(),600);
}

/* ---------- UI actions (build an action from the current selection) ---------- */
function doMove(tk){
  const tg=UI.targets.get(tk);if(!tg)return;
  if(tg.kind==='rubble'||tg.kind==='camp'||tg.kind==='blr'){UI.mode='discardFor';UI.pending={tk,...tg};UI.picks=[];render();return;}
  if(tg.kind==='native'||tg.kind==='nativebl')act({t:'native',card:UI.card,pi:tg.pi,to:tk});
  else act({t:'move',card:UI.card,pi:tg.pi,to:tk});
}
function confirmDiscardFor(){const P=UI.pending;if(!P||UI.picks.length!==P.need)return;act({t:'pay',pi:P.pi,to:P.tk,cards:UI.picks.slice()});}
function playAction(id){
  const t=typeOf(id);
  if(t==='native'){UI.mode='card';UI.card=id;render();return;}
  if(t==='transmitter'){UI.mode='transmit';UI.card=id;setSide(true);render();return;}
  act({t:'action',card:id});
}
function confirmTrash(){act({t:'trash',cards:UI.picks.slice()});}
function pickFromMarket(src,idx){
  if(!canAct()){toast('Wait for your turn to buy.');return;}
  const stack=src==='m'?S.market[idx]:S.reserve[idx];if(!stack||stack.n<=0)return;
  if(UI.mode==='transmit'){act({t:'transmit',card:UI.card,src,idx});return;}
  if(S.turn.bought){toast('You can buy only one card per turn.');return;}
  if(src==='r'&&!S.market.some(s=>s.n===0)){toast('The reserve opens once a market slot is empty.');return;}
  if(UI.mode==='pay'&&UI.buy.src===src&&UI.buy.idx===idx){cancelMode();return;}
  UI.mode='pay';UI.buy={src,idx,t:stack.t};UI.picks=[];UI.card=null;
  render();
}
function payTotal(){return UI.picks.reduce((a,id)=>a+coinVal(id),0);}
function confirmBuy(){const B=UI.buy;if(!B||payTotal()<CT[B.t].cost)return;act({t:'buy',src:B.src,idx:B.idx,cards:UI.picks.slice()});}
function cancelMode(){
  if(S&&S.turn.pending)return;
  UI.mode='idle';UI.card=null;UI.picks=[];UI.buy=null;UI.pending=null;render();
}
function startEndTurn(){
  if(!canAct()||S.turn.pending)return;
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

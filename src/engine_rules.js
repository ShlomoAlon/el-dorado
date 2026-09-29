/* =========================================================
   RULES ENGINE — pure game logic shared by the browser and the server.
   Works on the module-level S (game state) and MAP (board built from S.course + S.seed).
   Nothing in here touches the page.
   ========================================================= */
let S=null,MAP=null;
const hexAt=k=>MAP.hexes.get(k);
const typeOf=id=>S.cards[id];
const def=id=>CT[S.cards[id]];
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
const fmt=n=>(n%1?(Math.floor(n)?Math.floor(n)+'½':'½'):String(n));
function rm(arr,id){const i=arr.indexOf(id);if(i>=0)arr.splice(i,1);}
function playerDone(p){return p.pieces.every(k=>k==='done');}
function isActive(p){return !playerDone(p)&&!p.resigned;}

function mapFor(st){return buildCourse(st.course,st.seed);}
/* where a card type is sold: every type has exactly one stack, in the market or the reserve. {src:'m'|'r', i, s} or null */
function stackOf(t){let i=S.market.findIndex(s=>s.t===t);if(i>=0)return{src:'m',i,s:S.market[i]};i=S.reserve.findIndex(s=>s.t===t);return i>=0?{src:'r',i,s:S.reserve[i]}:null;}
/* ---- game logs (replays) ----
   {kind:'eldorado-replay', v:1 (training logs) or 2 (game records, below), title, course, seed, rng, fullRace, players:[{name,color,bot}], actions:[[seat,action],…], notes:[…]}
   Every shuffle draws from a generator seeded with log.rng, so re-applying the same actions rebuilds the identical game. */
const REPLAY_MAX_ACTIONS=20000;
function replayCheck(log){
  if(!log||log.kind!=='eldorado-replay'||(log.v!==1&&log.v!==2))return'Not an El Dorado game log.';
  if(!courseById(log.course))return'Unknown course: '+log.course;
  if(!Array.isArray(log.players)||log.players.length<2||log.players.length>4)return'A game log needs 2 to 4 players.';
  if(!Number.isFinite(log.seed)||!Number.isFinite(log.rng))return'The game log is missing its seeds.';
  if(log.gift&&!(CT[log.gift]&&CT[log.gift].cost))return'Unknown gift card: '+log.gift;
  if(!Array.isArray(log.actions)||log.actions.length>REPLAY_MAX_ACTIONS||!log.actions.every(x=>Array.isArray(x)&&Number.isInteger(x[0])&&x[1]&&typeof x[1].t==='string'))return'The game log has no valid list of actions.';
  return null;}
function replayStart(log){const v2=log.v===2,g=v2?recRng(log.rng,-1):mulberry32(log.rng>>>0);setRng(g);
  newGame({course:courseById(log.course),seed:log.seed,fullRace:log.fullRace!==false,privacy:v2&&!!log.privacy,players:log.players.map((p,i)=>({name:String(p.name||'Player '+(i+1)).slice(0,24),color:v2&&/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:COLORS[i%COLORS.length].hex,ai:v2?p.bot:undefined}))});
  // training exploration: every player starts with the same extra card, shuffled into the draw pile
  if(log.gift)for(const p of S.players)p.deck.splice(Math.floor(RNG()*(p.deck.length+1)),0,newCard(log.gift));
  if(v2)setRng(null);
  return g;}
/* apply action i of a log to S (after replayStart and actions 0…i-1) */
function replayStep(log,i){
  const[seat,a]=log.actions[i],v2=log.v===2,r0=RNG;if(v2)setRng(recRng(log.rng,i));
  try{
    return applyAction(seat,a);
  }finally{if(v2)RNG=r0;}
}
/* ---- game records (log v2): a game is its setup and its list of actions; the state is rebuilt from them ----
   Each action's shuffles come from a generator of its own, seeded from the game's secret number (rec.rng) and the action's
   index (newGame's: index -1), so re-applying the log rebuilds the same game and nothing needs a generator's state between
   moves. rec.rng would reveal every future shuffle, so the record stays on the server (or in the local save) until the game
   is over. Undo drops the last action and rebuilds; rec.mark = how many actions can no longer be undone (up to the last
   one that drew cards, passed the turn, or was a resignation). The saved game is the record (the state is rebuilt). */
function recRng(rng,k){return mulberry32(((rng>>>0)+Math.imul(k+2,0x9E3779B1))>>>0);}
function recNewGame(o){
  // the secret: from the platform's cryptographic generator where there is one (Math.random's state could be guessed)
  const c=globalThis.crypto,rng=c&&c.getRandomValues?c.getRandomValues(new Uint32Array(1))[0]:(Math.random()*4294967296)>>>0,r0=RNG;setRng(recRng(rng,-1));
  try{newGame(o);}finally{RNG=r0;}
  return{kind:'eldorado-replay',v:2,course:S.course.id,seed:S.seed,rng,fullRace:S.fullRace,...(S.privacy?{privacy:true}:{}),
    players:S.players.map(p=>p.ai?{name:p.name,color:p.color,bot:p.ai}:{name:p.name,color:p.color}),actions:[],mark:0};
}
/* every change to a game in play: applyAction, recorded in rec (the game's log; null: not recorded) */
function recApply(rec,seat,a){
  const r0=RNG,prev=S.cur;if(rec)setRng(recRng(rec.rng,rec.actions.length));
  let r;try{r=applyAction(seat,a);}finally{RNG=r0;}
  if(r.ok&&rec){rec.actions.push([seat,a]);if(r.reveal||a.t==='resign'||S.cur!==prev||S.over)rec.mark=rec.actions.length;}
  return r;
}
const recCanUndo=rec=>!!rec&&rec.actions.length>(rec.mark||0);
/* the state a record leads to, as {S, MAP} (the module's S and MAP are left as they were) */
function recState(rec){const s0=S,m0=MAP,r0=RNG;
  try{replayStart(rec);for(let i=0;i<rec.actions.length;i++)replayStep(rec,i);return{S,MAP};}finally{S=s0;MAP=m0;RNG=r0;}}
/* take back the last action (S becomes the rebuilt state). false: nothing to undo */
function recUndo(rec){if(!recCanUndo(rec))return false;rec.actions.pop();({S,MAP}=recState(rec));return true;}
/* the finished log, ready to save and watch, with a title */
function recFinal(rec){
  if(!rec)return null;
  const{mark,...L}=rec;
  L.title=L.title||S.players.map(p=>p.name).join(', ')+' · '+(courseById(rec.course)||{name:rec.course}).name;
  L.result={places:S.places||null,rounds:S.round};
  return L;
}
function newGame(o){

  const course=o.course||COURSES[0];
  MAP=buildCourse(course,o.seed);
  let nid=1;const cards={};const mk=t=>{const id='c'+(nid++);cards[id]=t;return id;};
  const players=o.players.map(p=>{
    const deck=[];for(let i=0;i<3;i++)deck.push(mk('explorer'));for(let i=0;i<4;i++)deck.push(mk('traveler'));deck.push(mk('sailor'));
    const pl={name:p.name,color:p.color,pieces:[],deck:shuffle(deck),hand:[],discard:[],play:[],blocks:[],fin:0,resigned:0};
    if(p.ai&&aiById(p.ai))pl.ai=p.ai; // a named AI plays this seat (engine_ai.js)
    return pl;
  });
  const st=MAP.starts;
  if(players.length===2){players[0].pieces=[st[0],st[2]];players[1].pieces=[st[1],st[3]];}
  else players.forEach((p,i)=>p.pieces=[st[i]]);
  S={v:5,seed:o.seed,course,players,cards,nid,market:MARKET0.map(t=>({t,n:3})),reserve:RESERVE0.map(t=>({t,n:3})),
     blockades:MAP.blockDefs.map(d=>({...d,owner:null})),cur:0,start:0,round:1,endTriggered:false,over:false,winners:null,places:null,
     fullRace:o.fullRace!==false,turn:{bought:false,active:null,pending:null},trash:[],log:[],privacy:!!o.privacy,resigns:0};
  players.forEach(p=>drawCards(p,4));
  log(null,'The expedition sets out: '+players.map(p=>p.name).join(', ')+'. Course: '+MAP.name+' ('+MAP.route.join(' · ')+' · El Dorado).');
  return S;
}
function newCard(t){const id='c'+(S.nid++);S.cards[id]=t;return id;}
function drawCards(p,n){const got=[];for(let i=0;i<n;i++){if(!p.deck.length){if(!p.discard.length)break;p.deck=shuffle(p.discard);p.discard=[];}const c=p.deck.pop();p.hand.push(c);got.push(c);}return got;}
function log(pi,t){S.log.push({p:pi,t,r:S.round});if(S.log.length>200)S.log.shift();}
function occupied(k,exPl,exPi){return S.players.some((p,pi)=>p.pieces.some((pk,i)=>pk===k&&!(pi===exPl&&i===exPi)));}
function blockAt(a,b){const c=MAP.edgeConn.get(a+'|'+b);if(c===undefined)return null;const bi=S.blockades.findIndex(x=>x.conn===c);if(bi<0||S.blockades[bi].owner!==null)return null;return bi;}
function neighbors(k){const nb=MAP._nb||(MAP._nb=new Map());let r=nb.get(k);if(!r){const h=hexAt(k);r=DIRS.map(([dq,dr])=>key(h.q+dq,h.r+dr)).filter(n=>MAP.hexes.has(n));nb.set(k,r);}return r;} // cached per map
function coinVal(id){const d=def(id);if(d.c==='y'||d.c==='x')return d.p;return .5;}
function blkLabel(B){return B.k==='r'?'discard '+plural(B.v,'card'):plural(B.v,SYMNAME[B.k]);}

/* ---------- reachability ---------- */
function reach(pl,pi,syms,budget){
  const out=new Map();const from=S.players[pl].pieces[pi];if(!from||from==='done')return out;
  for(const sym of syms){
    const dist=new Map([[from,0]]),prev=new Map(),pq=[[0,from]];
    while(pq.length){
      let bi=0;for(let i=1;i<pq.length;i++)if(pq[i][0]<pq[bi][0])bi=i;
      const[d,u]=pq[bi];pq[bi]=pq[pq.length-1];pq.pop();if(d>dist.get(u))continue;
      if(u!==from&&hexAt(u).type==='g')continue;
      for(const n of neighbors(u)){
        const h=hexAt(n);
        if(!(h.type===sym||(h.type==='g'&&h.sym===sym)))continue;
        if(occupied(n,pl,pi))continue;
        let c=h.val;const b=blockAt(u,n);
        if(b!==null){if(S.blockades[b].k!==sym)continue;c+=S.blockades[b].v;}
        const nd=d+c;if(nd>budget)continue;
        if(!dist.has(n)||nd<dist.get(n)){dist.set(n,nd);prev.set(n,u);pq.push([nd,n]);}
      }
    }
    const pathTo=k=>{const p=[];let x=k;while(x!==from){p.unshift(x);x=prev.get(x);}return p;};
    for(const[k,d]of dist){if(k===from)continue;const o=out.get(k);if(!o||d<o.cost)out.set(k,{kind:'move',cost:d,sym,path:pathTo(k),pi});}
    for(const[k,d]of dist){
      if(hexAt(k).type==='g')continue;
      for(const n of neighbors(k)){const b=blockAt(k,n);if(b===null)continue;const B=S.blockades[b];
        if(B.k!==sym||d+B.v>budget)continue;const K='B'+b;const o=out.get(K);
        if(!o||d+B.v<o.cost)out.set(K,{kind:'bl',bl:b,cost:d+B.v,sym,path:k===from?[]:pathTo(k),pi});}
    }
  }
  return out;
}
function nativeTargets(pl,pi){
  const T=new Map();const pk=S.players[pl].pieces[pi];if(!pk||pk==='done')return T;
  for(const n of neighbors(pk)){const h=hexAt(n);if(h.type==='m'||h.type==='s'||occupied(n))continue;T.set(n,{kind:'native',path:[n],cost:0,pi,bl:blockAt(pk,n)});}
  for(const n of neighbors(pk)){const b=blockAt(pk,n);if(b!==null&&!T.has('B'+b))T.set('B'+b,{kind:'nativebl',bl:b,path:[],cost:0,pi});}
  return T;
}
/* spaces/blockades entered by discarding (rubble, grey blockade) or removing cards (base camp) */
function payTargets(pl,pi){
  const T=new Map();const P=S.players[pl];const pk=P.pieces[pi];if(!pk||pk==='done')return T;
  const hn=P.hand.length;
  for(const n of neighbors(pk)){const h=hexAt(n);
    if((h.type==='r'||h.type==='c')&&!occupied(n)&&blockAt(pk,n)===null&&hn>=h.val)T.set(n,{kind:h.type==='r'?'rubble':'camp',need:h.val,path:[n],pi});
    const b=blockAt(pk,n);if(b!==null&&S.blockades[b].k==='r'&&hn>=S.blockades[b].v&&!T.has('B'+b))T.set('B'+b,{kind:'blr',bl:b,need:S.blockades[b].v,pi});
  }
  return T;
}

/* =========================================================
   APPLY AN ACTION. Returns {ok, err?, ev:[events], reveal}
   reveal = new information came out (cards drawn), so undo stops here.
   Actions (acting player = S.cur, except resign):
     {t:'move', card, pi, to}        movement card (or a card with leftover strength)
     {t:'native', card, pi, to}
     {t:'pay', pi, to, cards}        rubble / base camp / grey blockade
     {t:'action', card}              Cartographer, Compass, Scientist, Travel Log
     {t:'trash', cards}              finish Scientist / Travel Log
     {t:'transmit', card, type}      Transmitter: take one card of this type
     {t:'buy', type, cards}          buy one card of this type, paying with these hand cards
     {t:'end', keep}                 end the turn, keeping these hand cards
     {t:'timeout'}                   the turn ends without the player (turn clock, or an AI's illegal choice)
     {t:'resign'}                    the player leaves the game (any time, in or out of turn)
     {t:'endgame'}                   (local play) the game ends now for everyone: arrivals first, then who is closest
   ========================================================= */
function applyAction(seat,a){
  const fail=err=>({ok:false,err,ev:[]});
  if(!S||S.over)return fail('The game is over.');
  if(!a||typeof a!=='object')return fail('Bad action.');
  if(a.t==='resign')return resign(seat);
  if(seat!==S.cur)return fail('It is not your turn.');
  if(a.t==='endgame'){log(seat,'ends the game.');endGame();return{ok:true,ev:[{e:'over'}]};} // local play only (the server refuses it)
  if(a.t==='timeout'){log(seat,'ran out of time.');if(S.turn.pending)applyAction(seat,{t:'trash',cards:[]});S.turn.active=null;
    const r=applyAction(seat,{t:'end',keep:[]});return{...r,ev:[{e:'timeout',pl:seat},...r.ev]};}
  const P=S.players[seat],T=S.turn,ev=[];let reveal=false;
  const inHand=id=>typeof id==='string'&&P.hand.includes(id);
  const distinctHand=ids=>Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(inHand);
  const pieceOk=pi=>Number.isInteger(pi)&&pi>=0&&pi<P.pieces.length&&P.pieces[pi]!=='done';
  if(T.pending&&a.t!=='trash')return fail('Choose which cards to remove first.');
  const takeBlock=b=>{const B=S.blockades[b];if(B.owner!==null)return;B.owner=seat;P.blocks.push(b);log(seat,'tears down blockade #'+B.n+' and keeps it.');ev.push({e:'block',pl:seat,n:B.n});};
  const arrive=pi=>{if(P.pieces[pi]!=='done')return;log(seat,'reaches El Dorado!');ev.push({e:'arrive',pl:seat,pi});
    if(playerDone(P)&&!P.fin){P.fin=S.round;checkEnd();}};
  switch(a.t){
    case 'move':{
      const act=T.active&&T.active.id===a.card?T.active:null;
      if(!act&&!inHand(a.card))return fail('That card is not in your hand.');
      const d=def(a.card);if(!d||d.c==='p')return fail('That card cannot move.');
      const pi=act?act.pi:a.pi;if(!pieceOk(pi))return fail('Choose one of your explorers.');
      const syms=act?[act.sym]:(d.s==='*'?['j','w','v']:[d.s]);const budget=act?act.left:d.p;
      const tg=reach(seat,pi,syms,budget).get(a.to);if(!tg)return fail('That space is out of reach.');
      ev.push({e:'play',pl:seat,k:'move',ts:[typeOf(a.card)],more:!!act,n:tg.path.length,sym:tg.sym});
      if(!act){T.active=null;rm(P.hand,a.card);if(d.once)S.trash.push(a.card);else P.play.push(a.card);} // single-use (Giant Machete, Prop Plane, Treasure Chest): removed from the game
      const from=P.pieces[pi];let pos=from;const path=[from];
      for(const st of tg.path){const b=blockAt(pos,st);if(b!==null)takeBlock(b);pos=st;path.push(st);}
      if(tg.kind==='bl')takeBlock(tg.bl);
      const done=hexAt(pos).type==='g';P.pieces[pi]=done?'done':pos;
      const left=budget-tg.cost;T.active=(left>0&&!done)?{id:a.card,pi,sym:tg.sym,left}:null;
      if(tg.path.length){log(seat,'moves '+plural(tg.path.length,'space')+' with '+d.n+(d.s==='*'?' (as '+SYMNAME[tg.sym]+')':'')+'.');ev.push({e:'move',pl:seat,pi,path});}
      arrive(pi);break;
    }
    case 'native':{
      if(!inHand(a.card)||typeOf(a.card)!=='native')return fail('You need the Native.');
      if(!pieceOk(a.pi))return fail('Choose one of your explorers.');
      const tg=nativeTargets(seat,a.pi).get(a.to);if(!tg)return fail('The Native can only reach an adjacent free space.');
      T.active=null;rm(P.hand,a.card);P.play.push(a.card);ev.push({e:'play',pl:seat,k:'native',ts:['native'],n:tg.kind==='native'?1:0});
      if(tg.bl!=null)takeBlock(tg.bl);
      if(tg.kind==='native'){const from=P.pieces[a.pi];const n=tg.path[0];P.pieces[a.pi]=hexAt(n).type==='g'?'done':n;
        log(seat,'plays the Native and moves to an adjacent space.');ev.push({e:'move',pl:seat,pi:a.pi,path:[from,n]});arrive(a.pi);}
      else log(seat,'plays the Native to tear down a blockade.');
      break;
    }
    case 'pay':{
      if(!pieceOk(a.pi))return fail('Choose one of your explorers.');
      const tg=payTargets(seat,a.pi).get(a.to);if(!tg)return fail('You cannot enter there.');
      if(!distinctHand(a.cards)||a.cards.length!==tg.need)return fail('Choose exactly '+plural(tg.need,'card')+'.');
      T.active=null;const trash=tg.kind==='camp';ev.push({e:'play',pl:seat,k:tg.kind,ts:a.cards.map(typeOf)});
      for(const id of a.cards){rm(P.hand,id);if(trash)S.trash.push(id);else P.play.push(id);}
      if(tg.kind==='blr'){takeBlock(tg.bl);log(seat,'discards '+plural(tg.need,'card')+' to clear the blockade.');}
      else{const from=P.pieces[a.pi];const n=tg.path[0];P.pieces[a.pi]=n;
        log(seat,trash?'removes '+plural(tg.need,'card')+' from the game to enter a base camp.':'discards '+plural(tg.need,'card')+' to cross rubble.');
        ev.push({e:'move',pl:seat,pi:a.pi,path:[from,n]});}
      break;
    }
    case 'action':{
      const t=inHand(a.card)&&typeOf(a.card);
      const n={cartographer:2,compass:3,scientist:1,travellog:2}[t];if(!n)return fail('That card has no draw effect.');
      T.active=null;rm(P.hand,a.card);if(CT[t].once)S.trash.push(a.card);else P.play.push(a.card);
      const got=drawCards(P,n);reveal=true;ev.push({e:'play',pl:seat,k:'action',ts:[t],n:got.length});
      log(seat,'plays '+CT[t].n+' and draws '+plural(got.length,'card')+'.');ev.push({e:'draw',pl:seat,n:got.length});
      if(t==='scientist'||t==='travellog')T.pending={max:t==='scientist'?1:2};
      break;
    }
    case 'trash':{
      if(!T.pending)return fail('Nothing to remove.');
      if(!distinctHand(a.cards)||a.cards.length>T.pending.max)return fail('Choose up to '+plural(T.pending.max,'card')+'.');
      ev.push({e:'play',pl:seat,k:'trash',ts:a.cards.map(typeOf)});
      if(a.cards.length){for(const id of a.cards){rm(P.hand,id);S.trash.push(id);}log(seat,'removes '+a.cards.map(i=>def(i).n).join(', ')+' from the game.');}
      T.pending=null;break;
    }
    case 'transmit':{
      if(!inHand(a.card)||typeOf(a.card)!=='transmitter')return fail('You need the Transmitter.');
      const st=stackOf(a.type),stack=st&&st.s;if(!stack||stack.n<=0)return fail('That card is sold out.');
      T.active=null;rm(P.hand,a.card);S.trash.push(a.card);
      stack.n--;P.discard.push(newCard(stack.t));ev.push({e:'play',pl:seat,k:'transmit',ts:['transmitter'],got:stack.t});
      log(seat,'uses the Transmitter to take '+CT[stack.t].n+'.');ev.push({e:'gain',pl:seat,t:stack.t});
      break;
    }
    case 'buy':{
      if(T.bought)return fail('You can buy only one card per turn.');
      const open=S.market.some(s=>s.n===0);
      const st=stackOf(a.type);let stack=st&&st.s;
      if(!stack||stack.n<=0)return fail('That card is sold out.');
      if(st.src==='r'&&!open)return fail('The reserve opens once a market slot is empty.');
      if(!distinctHand(a.cards))return fail('Pay with cards from your hand.');
      const total=a.cards.reduce((s,id)=>s+coinVal(id),0),cost=CT[stack.t].cost;
      if(total<cost)return fail('Not enough coins.');
      T.active=null;ev.push({e:'play',pl:seat,k:'buy',ts:a.cards.map(typeOf),got:stack.t,paid:total});
      for(const id of a.cards){rm(P.hand,id);const d=def(id);if(d.once&&(d.c==='y'||d.c==='x'))S.trash.push(id);else P.play.push(id);}
      const t=stack.t;
      if(st.src==='r'){const slot=S.market.findIndex(s=>s.n===0);S.market[slot]={t,n:stack.n};S.reserve.splice(st.i,1);stack=S.market[slot];}
      stack.n--;P.discard.push(newCard(t));T.bought=true;
      log(seat,'buys '+CT[t].n+' for '+fmt(total)+' coin'+(total===1?'':'s')+'.');ev.push({e:'gain',pl:seat,t});
      break;
    }
    case 'end':{
      const keep=Array.isArray(a.keep)?a.keep:[];
      if(!keep.every(inHand)||new Set(keep).size!==keep.length)return fail('Bad cards to keep.');
      const toDisc=P.hand.filter(id=>!keep.includes(id));ev.push({e:'play',pl:seat,k:'end',kept:keep.length,disc:toDisc.length}); // counts only: the hand is private
      for(const id of toDisc){rm(P.hand,id);P.discard.push(id);}
      P.discard.push(...P.play);P.play=[];
      drawCards(P,Math.max(0,4-P.hand.length));reveal=true;
      log(seat,'ends the turn'+(toDisc.length?', discarding '+toDisc.length:'')+(keep.length?(toDisc.length?' and':'')+' keeping '+keep.length:'')+'.');
      S.turn={bought:false,active:null,pending:null};
      advance();ev.push({e:'turn',pl:S.cur});
      break;
    }
    default:return fail('Unknown action.');
  }
  if(S.over)ev.push({e:'over'});
  return{ok:true,ev,reveal};
}
/* who still races */
function checkEnd(){
  const n=S.players.length;
  if(S.fullRace){if(S.players.filter(isActive).length<=1&&!S.endTriggered){S.endTriggered=true;log(null,'Only one expedition is still racing. The round will be finished.');}}
  else if(S.players.some(playerDone)&&!S.endTriggered){S.endTriggered=true;log(null,'The final round has begun.');}
  if(S.players.every(p=>!isActive(p))&&S.fullRace)S.endTriggered=true;
  return n;
}
function advance(){
  const n=S.players.length;let i=S.cur;
  for(let step=0;step<n*2+2;step++){
    i=(i+1)%n;
    if(i===S.start){if(S.endTriggered){endGame();return;}S.round++;}
    const p=S.players[i];
    if(S.fullRace?isActive(p):!p.resigned){S.cur=i;return;}
  }
  endGame();
}
/* A player leaves a game for good (online): placed below everyone still racing. */
function resign(seat){
  const P=S.players[seat];if(!P||P.resigned||playerDone(P))return{ok:false,err:'You are not racing.',ev:[]};
  P.resigned=++S.resigns;log(seat,'leaves the expedition.');
  const ev=[{e:'resign',pl:seat}];
  const others=S.players.filter((p,i)=>i!==seat&&!p.resigned);
  if(others.length<=1||!S.players.some(isActive)){endGame();ev.push({e:'over'});return{ok:true,ev};} // nobody left to race: finish now
  checkEnd();
  if(seat===S.cur){S.turn={bought:false,active:null,pending:null};advance();ev.push({e:'turn',pl:S.cur});}
  if(S.over)ev.push({e:'over'});
  return{ok:true,ev};
}
function progress(p){ // lower = closer: sum of shortest step counts from each explorer to a finishing space
  let tot=0;
  for(const k of p.pieces){if(k==='done')continue;
    const seen=new Set([k]);let q=[k],d=0,found=false;
    while(q.length&&!found){d++;const nq=[];for(const u of q)for(const n of neighbors(u)){if(seen.has(n))continue;const h=hexAt(n);if(h.type==='m')continue;if(h.type==='g'){found=true;break;}seen.add(n);nq.push(n);}q=nq;if(d>200)break;}
    tot+=found?d:999;}
  return tot;
}
function endGame(){
  S.over=true;
  const mb=p=>Math.max(0,...p.blocks.map(b=>S.blockades[b].n));
  const keyOf=(p)=>playerDone(p)?[0,p.fin,-p.blocks.length,-mb(p)]:p.resigned?[2,-p.resigned,0,0]:[1,progress(p),-p.blocks.length,-mb(p)];
  const idx=S.players.map((p,i)=>({i,k:keyOf(p)}));
  const cmp=(a,b)=>{for(let j=0;j<4;j++)if(a.k[j]!==b.k[j])return a.k[j]-b.k[j];return 0;};
  idx.sort(cmp);
  const places=new Array(S.players.length);
  idx.forEach((x,j)=>{places[x.i]=j>0&&cmp(x,idx[j-1])===0?places[idx[j-1].i]:j+1;});
  S.places=places;S.winners=places.map((p,i)=>p===1?i:-1).filter(i=>i>=0);
  log(null,S.winners.map(i=>S.players[i].name).join(' & ')+' win'+(S.winners.length>1?'':'s')+' the race to El Dorado.');
}
/* ---------- multiplayer Elo from a finishing order ---------- */
function eloDeltas(ratings,places,games){
  const n=ratings.length;const out=new Array(n).fill(0);if(n<2)return out;
  for(let i=0;i<n;i++){const K=(games[i]<10?48:32)/(n-1);
    for(let j=0;j<n;j++){if(i===j)continue;
      const E=1/(1+Math.pow(10,(ratings[j]-ratings[i])/400));
      const Sc=places[i]<places[j]?1:places[i]===places[j]?.5:0;
      out[i]+=K*(Sc-E);}}
  return out.map(x=>Math.round(x*10)/10);
}
/* ---------- what one player may see ---------- */
function redact(state,seat){
  const R=JSON.parse(JSON.stringify(state));const vis=new Set();
  R.players.forEach((p,i)=>{
    if(i===seat){p.deck=p.deck.slice().sort((a,b)=>(state.cards[a]<state.cards[b]?-1:state.cards[a]>state.cards[b]?1:0));p.hand.forEach(id=>vis.add(id));p.deck.forEach(id=>vis.add(id));}
    else{p.hand=p.hand.map((_,k)=>'h'+i+'_'+k);p.deck=p.deck.map((_,k)=>'d'+i+'_'+k);}
    p.play.forEach(id=>vis.add(id));p.discard.forEach(id=>vis.add(id));
  });
  R.trash.forEach(id=>vis.add(id));
  if(R.turn&&R.turn.active)vis.add(R.turn.active.id);
  const cards={};for(const id of vis)if(state.cards[id])cards[id]=state.cards[id];R.cards=cards;
  return R;
}

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
function rm(arr,id){const i=arr.indexOf(id);assert(i>=0,'rm: the item is in the list');arr.splice(i,1);}
function playerDone(p){return p.pieces.every(k=>k==='done');}
function isActive(p){return !playerDone(p)&&!p.resigned;}
/* the blockades player pl has taken (by index), and how many */
function blocksOf(pl){const out=[];S.blockades.forEach((B,i)=>{if(B.owner===pl)out.push(i);});return out;}

function mapFor(st){return buildCourse(st.course,st.seed);}
/* where a card type is sold: every type has exactly one stack, in the market or the reserve. {src:'m'|'r', i, s} or null */
function stackOf(t){let i=S.market.findIndex(s=>s.t===t);if(i>=0)return{src:'m',i,s:S.market[i]};i=S.reserve.findIndex(s=>s.t===t);return i>=0?{src:'r',i,s:S.reserve[i]}:null;}
/* the reserve can be bought from once a market slot is empty */
function reserveOpen(){return S.market.some(s=>s.n===0);}
/* why seat can't buy a card of type t now, payment aside ('' if it can). The purchase rules live here: the buy action and
   the page's market both ask */
function cantBuy(seat,t){
  if(S.over)return'The game is over.';
  if(seat!==S.cur)return'It is not your turn.';
  if(S.turn.pending)return'Choose which cards to remove first.';
  if(S.turn.bought)return'You can buy only one card per turn.';
  const st=stackOf(t);if(!st||st.s.n<=0)return'That card is sold out.';
  if(st.src==='r'&&!reserveOpen())return'The reserve opens once a market slot is empty.';
  return'';
}
/* what seat can buy now with the coins in its hand: [{src:'m'|'r', i, t}], market first */
function buyOptions(seat){
  const P=S.players[seat],cash=P.hand.reduce((a,id)=>a+coinVal(id),0),out=[];
  for(const[src,list]of[['m',S.market],['r',S.reserve]])list.forEach((s,i)=>{if(s.n>0&&CT[s.t].cost<=cash&&!cantBuy(seat,s.t))out.push({src,i,t:s.t});});
  return out;
}
/* ---- game logs (replays) ----
   {kind:'eldorado-replay', v:1 (training logs) or 3 (game records, below), title, course, seed, rng, fullRace, players:[{name,color,bot}], actions:[[seat,action],…], notes:[…]}
   Game records before v3 were played under older rules (the turn went on after the last explorer arrived): not replayable.
   Every shuffle draws from a generator seeded with log.rng, so re-applying the same actions rebuilds the identical game. */
const REPLAY_MAX_ACTIONS=20000;
function replayCheck(log){
  if(!log||log.kind!=='eldorado-replay')return'Not an El Dorado game log.';
  if(log.v!==1&&log.v!==3)return'This game was recorded by an older version of the game.';
  if(!courseById(log.course))return'Unknown course: '+log.course;
  if(!Array.isArray(log.players)||log.players.length<2||log.players.length>4)return'A game log needs 2 to 4 players.';
  if(log.v===3&&!log.players.every(p=>typeof p.name==='string'&&p.name&&p.name.length<=24&&COLORS.some(c=>c.hex===p.color)&&(p.bot===undefined||aiById(p.bot))))return'The game log names its players wrongly.';
  if(!Number.isFinite(log.seed)||!Number.isFinite(log.rng))return'The game log is missing its seeds.';
  if(log.gift&&!(CT[log.gift]&&CT[log.gift].cost))return'Unknown gift card: '+log.gift;
  if(!Array.isArray(log.actions)||log.actions.length>REPLAY_MAX_ACTIONS||!log.actions.every(x=>Array.isArray(x)&&Number.isInteger(x[0])&&x[1]&&typeof x[1].t==='string'))return'The game log has no valid list of actions.';
  return null;}
/* set up the log's game (S, MAP). Returns the generator a training log's actions share (records give each action its own) */
function replayStart(log){const rec=log.v===3,g=rec?recRng(log.rng,-1):mulberry32(log.rng>>>0);
  newGame({course:courseById(log.course),seed:log.seed,fullRace:log.fullRace!==false,players:log.players.map((p,i)=>rec?{name:p.name,color:p.color,ai:p.bot}:{name:String(p.name),color:COLORS[i].hex})},g); // (training logs: colours by seat)
  // training exploration: every player starts with the same extra card, shuffled into the draw pile
  if(log.gift)for(const p of S.players)p.deck.splice(Math.floor(g()*(p.deck.length+1)),0,newCard(log.gift));
  return g;}
/* apply action i of a log to S (after replayStart and actions 0…i-1); g: the generator replayStart returned */
function replayStep(log,i,g){const[seat,a]=log.actions[i];return applyAction(seat,a,log.v===3?recRng(log.rng,i):g);}
/* ---- game records (log v3): a game is its setup and its list of actions; the state is rebuilt from them ----
   Each action's shuffles come from a generator of its own, seeded from the game's secret number (rec.rng) and the action's
   index (newGame's: index -1), so re-applying the log rebuilds the same game and nothing needs a generator's state between
   moves. rec.rng would reveal every future shuffle, so the record stays on the server (or in the local save) until the game
   is over. Undo drops the last action and rebuilds; rec.mark = how many actions can no longer be undone (up to the last
   one that drew cards, passed the turn, or was a resignation). The saved game is the record (the state is rebuilt). */
function recRng(rng,k){return mulberry32(((rng>>>0)+Math.imul(k+2,0x9E3779B1))>>>0);}
function recNewGame(o){
  // the secret: from the platform's cryptographic generator where there is one (Math.random's state could be guessed)
  const rng=crypto.getRandomValues(new Uint32Array(1))[0];
  newGame(o,recRng(rng,-1));
  // (privacy: the page's pass-and-play cover, a setting of the table rather than of the game: kept in the record only)
  return{kind:'eldorado-replay',v:3,course:S.course.id,seed:S.seed,rng,fullRace:S.fullRace,...(o.privacy?{privacy:true}:{}),
    players:S.players.map(p=>p.ai?{name:p.name,color:p.color,bot:p.ai}:{name:p.name,color:p.color}),actions:[],mark:0};
}
/* every change to a game in play: applyAction, recorded in rec (the game's log; null: not recorded) */
function recApply(rec,seat,a,rnd=Math.random){ // (rnd: for a game without a record)
  const prev=S.cur,r=applyAction(seat,a,rec?recRng(rec.rng,rec.actions.length):rnd);
  if(r.ok&&rec){rec.actions.push([seat,a]);if(r.reveal||a.t==='resign'||S.cur!==prev||S.over)rec.mark=rec.actions.length;}
  return r;
}
const recCanUndo=rec=>rec.actions.length>rec.mark;
/* the state a record leads to, as {S, MAP} (the module's S and MAP are left as they were) */
function recState(rec){const s0=S,m0=MAP;
  try{replayStart(rec);for(let i=0;i<rec.actions.length;i++)replayStep(rec,i);return{S,MAP};}finally{S=s0;MAP=m0;}}
/* take back the last action (S becomes the rebuilt state; callers check recCanUndo first) */
function recUndo(rec){assert(recCanUndo(rec),'recUndo: an action can be taken back');rec.actions.pop();({S,MAP}=recState(rec));return true;}
/* the log of the game on show (S), ready to save and watch, with a title. places: null for a game that didn't finish (a
   training log stopped at its round cap) */
function recFinal(rec){
  const{mark,...L}=rec;
  L.title=S.players.map(p=>p.name).join(', ')+' · '+S.course.name;
  L.result={places:S.places,rounds:S.round};
  return L;
}
function newGame(o,rnd=Math.random){
  assert(o.players.length>=2&&o.players.length<=4,'newGame: 2 to 4 players');
  const course=o.course||COURSES[0];
  MAP=buildCourse(course,o.seed);
  let nid=1;const cards={};const mk=t=>{const id='c'+(nid++);cards[id]=t;return id;};
  const players=o.players.map(p=>{
    const deck=[];for(let i=0;i<3;i++)deck.push(mk('explorer'));for(let i=0;i<4;i++)deck.push(mk('traveler'));deck.push(mk('sailor'));
    const pl={name:p.name,color:p.color,pieces:[],deck:shuffle(deck,rnd),hand:[],discard:[],play:[],fin:0,resigned:0};
    if(p.ai){assert(aiById(p.ai),'newGame: a known AI');pl.ai=p.ai;} // a named AI plays this seat (engine_ai.js)
    return pl;
  });
  const st=MAP.starts;
  if(players.length===2){players[0].pieces=[st[0],st[2]];players[1].pieces=[st[1],st[3]];}
  else players.forEach((p,i)=>p.pieces=[st[i]]);
  S={seed:o.seed,course,players,cards,nid,market:MARKET0.map(t=>({t,n:3})),reserve:RESERVE0.map(t=>({t,n:3})),
     blockades:MAP.blockDefs.map(d=>({...d,owner:null})),cur:0,round:1,endTriggered:false,over:false,places:null,
     fullRace:o.fullRace!==false,turn:{bought:false,active:null,pending:null},trash:[],log:[]};
  players.forEach(p=>drawCards(p,4,rnd));
  log({e:'start'});
  return S;
}
function newCard(t){const id='c'+(S.nid++);S.cards[id]=t;return id;}
function drawCards(p,n,rnd){const got=[];for(let i=0;i<n;i++){if(!p.deck.length){if(!p.discard.length)break;p.deck=shuffle(p.discard,rnd);p.discard=[];}const c=p.deck.pop();p.hand.push(c);got.push(c);}return got;}
/* the journal (S.log): the game's public events worth telling, each with its round; the page words them (dialogs.js).
   Not the moves' paths or the turn changes (the events carry those for the animations); only the last 120 are kept */
function log(e){S.log.push({...e,r:S.round});if(S.log.length>120)S.log.shift();}
const tell=(ev,e)=>{ev.push(e);log(e);}; // an event that also goes in the journal
function occupied(k,exPl,exPi){return S.players.some((p,pi)=>p.pieces.some((pk,i)=>pk===k&&!(pi===exPl&&i===exPi)));}
/* the standing blockade between spaces a and b (its index), or null. Blockade i sits on connection i (buildCourse deals one per connection) */
function blockAt(a,b){const c=MAP.edgeConn.get(a+'|'+b);return c===undefined||S.blockades[c].owner!==null?null:c;}
function neighbors(k){const nb=MAP._nb||(MAP._nb=new Map());let r=nb.get(k);if(!r){const h=hexAt(k);r=DIRS.map(([dq,dr])=>key(h.q+dq,h.r+dr)).filter(n=>MAP.hexes.has(n));nb.set(k,r);}return r;} // cached per map
function coinVal(id){const d=def(id);if(d.c==='y'||d.c==='x')return d.p;return .5;}
function blkLabel(B){return B.k==='r'?'discard '+plural(B.v,'card'):plural(B.v,SYMNAME[B.k]);}

/* ---------- reachability ---------- */
function reach(pl,pi,syms,budget){
  const out=new Map(),from=S.players[pl].pieces[pi];assert(from&&from!=='done','reach: the explorer is on the board');
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
  const T=new Map(),pk=S.players[pl].pieces[pi];assert(pk&&pk!=='done','nativeTargets: the explorer is on the board');
  for(const n of neighbors(pk)){const h=hexAt(n);if(h.type==='m'||h.type==='s'||occupied(n))continue;T.set(n,{kind:'native',path:[n],cost:0,pi,bl:blockAt(pk,n)});}
  for(const n of neighbors(pk)){const b=blockAt(pk,n);if(b!==null&&!T.has('B'+b))T.set('B'+b,{kind:'nativebl',bl:b,path:[],cost:0,pi});}
  return T;
}
/* where seat can play card id with explorer pi now: Map<key or 'B'+i, target>. A movement card from the hand: the spaces its
   strength reaches, plus the rubble, base camps and rubble blockades it could be given up for (any card can be); the card in
   play with leftover strength: where that reaches; the Native: its own targets. Empty: not on the board now */
function cardTargets(seat,pi,id){
  const T=new Map(),P=S.players[seat],d=def(id),act=S.turn.active&&S.turn.active.id===id?S.turn.active:null;
  if(S.over||seat!==S.cur||S.turn.pending)return T;
  if(act){for(const[k,v]of reach(seat,act.pi,[act.sym],act.left))T.set(k,v);return T;}
  if(!P.hand.includes(id))return T;
  if(typeOf(id)==='native'){for(const[k,v]of nativeTargets(seat,pi))T.set(k,v);return T;}
  if(d.c!=='p')for(const[k,v]of reach(seat,pi,d.s==='*'?['j','w','v']:[d.s],d.p))T.set(k,v);
  for(const[k,v]of payTargets(seat,pi))if(!T.has(k))T.set(k,v);
  return T;
}
/* spaces/blockades entered by discarding (rubble, grey blockade) or removing cards (base camp) */
function payTargets(pl,pi){
  const T=new Map(),P=S.players[pl],pk=P.pieces[pi],hn=P.hand.length;assert(pk&&pk!=='done','payTargets: the explorer is on the board');
  for(const n of neighbors(pk)){const h=hexAt(n);
    if((h.type==='r'||h.type==='c')&&!occupied(n)&&blockAt(pk,n)===null&&hn>=h.val)T.set(n,{kind:h.type==='r'?'rubble':'camp',need:h.val,path:[n],pi});
    const b=blockAt(pk,n);if(b!==null&&S.blockades[b].k==='r'&&hn>=S.blockades[b].v&&!T.has('B'+b))T.set('B'+b,{kind:'blr',bl:b,need:S.blockades[b].v,pi});
  }
  return T;
}

/* =========================================================
   APPLY AN ACTION. Returns {ok, err?, ev:[events], reveal}
   reveal = new information came out (cards drawn), so undo stops here. rnd: where any shuffle this action needs comes from
   (a record passes the action's own generator; look-ahead copies of a game don't care)
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
function applyAction(seat,a,rnd=Math.random){
  const fail=err=>({ok:false,err,ev:[]});
  if(S.over)return fail('The game is over.');
  if(!a||typeof a!=='object')return fail('Bad action.');
  if(a.t==='resign')return resign(seat);
  if(seat!==S.cur)return fail('It is not your turn.');
  if(a.t==='endgame'){const ev=[];tell(ev,{e:'endgame',pl:seat});endGame();return{ok:true,ev:[...ev,{e:'over'}]};} // local play only (the server refuses it)
  if(a.t==='timeout'){log({e:'timeout',pl:seat});if(S.turn.pending)applyAction(seat,{t:'trash',cards:[]},rnd);S.turn.active=null;
    const r=applyAction(seat,{t:'end',keep:[]},rnd);return{...r,ev:[{e:'timeout',pl:seat},...r.ev]};}
  const P=S.players[seat],T=S.turn,ev=[];let reveal=false;
  const inHand=id=>typeof id==='string'&&P.hand.includes(id);
  const distinctHand=ids=>Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(inHand);
  const pieceOk=pi=>Number.isInteger(pi)&&pi>=0&&pi<P.pieces.length&&P.pieces[pi]!=='done';
  if(T.pending&&a.t!=='trash')return fail('Choose which cards to remove first.');
  const takeBlock=b=>{const B=S.blockades[b];assert(B.owner===null,'a blockade is taken once');B.owner=seat;tell(ev,{e:'block',pl:seat,n:B.n});};
  const arrive=pi=>{if(P.pieces[pi]!=='done')return;tell(ev,{e:'arrive',pl:seat,pi});
    if(playerDone(P)){P.fin=S.round;checkEnd(ev);}};
  switch(a.t){
    case 'move':{
      const act=T.active&&T.active.id===a.card?T.active:null;
      if(!act&&!inHand(a.card))return fail('That card is not in your hand.');
      const d=def(a.card);if(d.c==='p')return fail('That card cannot move.');
      const pi=act?act.pi:a.pi;if(!pieceOk(pi))return fail('Choose one of your explorers.');
      const syms=act?[act.sym]:(d.s==='*'?['j','w','v']:[d.s]);const budget=act?act.left:d.p;
      const tg=reach(seat,pi,syms,budget).get(a.to);if(!tg)return fail('That space is out of reach.');
      tell(ev,{e:'play',pl:seat,k:'move',ts:[typeOf(a.card)],more:!!act,n:tg.path.length,sym:tg.sym});
      if(!act){T.active=null;rm(P.hand,a.card);if(d.once)S.trash.push(a.card);else P.play.push(a.card);} // single-use (Giant Machete, Prop Plane, Treasure Chest): removed from the game
      const from=P.pieces[pi];let pos=from;const path=[from];
      for(const st of tg.path){const b=blockAt(pos,st);if(b!==null)takeBlock(b);pos=st;path.push(st);}
      if(tg.kind==='bl')takeBlock(tg.bl);
      const done=hexAt(pos).type==='g';P.pieces[pi]=done?'done':pos;
      const left=budget-tg.cost;T.active=(left>0&&!done)?{id:a.card,pi,sym:tg.sym,left}:null;
      if(tg.path.length)ev.push({e:'move',pl:seat,pi,path});
      arrive(pi);break;
    }
    case 'native':{
      if(!inHand(a.card)||typeOf(a.card)!=='native')return fail('You need the Native.');
      if(!pieceOk(a.pi))return fail('Choose one of your explorers.');
      const tg=nativeTargets(seat,a.pi).get(a.to);if(!tg)return fail('The Native can only reach an adjacent free space.');
      T.active=null;rm(P.hand,a.card);P.play.push(a.card);tell(ev,{e:'play',pl:seat,k:'native',ts:['native'],n:tg.kind==='native'?1:0});
      if(tg.bl!=null)takeBlock(tg.bl);
      if(tg.kind==='native'){const from=P.pieces[a.pi];const n=tg.path[0];P.pieces[a.pi]=hexAt(n).type==='g'?'done':n;
        ev.push({e:'move',pl:seat,pi:a.pi,path:[from,n]});arrive(a.pi);}
      break;
    }
    case 'pay':{
      if(!pieceOk(a.pi))return fail('Choose one of your explorers.');
      const tg=payTargets(seat,a.pi).get(a.to);if(!tg)return fail('You cannot enter there.');
      if(!distinctHand(a.cards)||a.cards.length!==tg.need)return fail('Choose exactly '+plural(tg.need,'card')+'.');
      T.active=null;const trash=tg.kind==='camp';tell(ev,{e:'play',pl:seat,k:tg.kind,ts:a.cards.map(typeOf)});
      for(const id of a.cards){rm(P.hand,id);if(trash)S.trash.push(id);else P.play.push(id);}
      if(tg.kind==='blr')takeBlock(tg.bl);
      else{const from=P.pieces[a.pi];const n=tg.path[0];P.pieces[a.pi]=n;
        ev.push({e:'move',pl:seat,pi:a.pi,path:[from,n]});}
      break;
    }
    case 'action':{
      const t=inHand(a.card)&&typeOf(a.card);
      const n={cartographer:2,compass:3,scientist:1,travellog:2}[t];if(!n)return fail('That card has no draw effect.');
      T.active=null;rm(P.hand,a.card);if(CT[t].once)S.trash.push(a.card);else P.play.push(a.card);
      const got=drawCards(P,n,rnd);reveal=true;tell(ev,{e:'play',pl:seat,k:'action',ts:[t],n:got.length});
      if(t==='scientist'||t==='travellog')T.pending={max:t==='scientist'?1:2};
      break;
    }
    case 'trash':{
      if(!T.pending)return fail('Nothing to remove.');
      if(!distinctHand(a.cards)||a.cards.length>T.pending.max)return fail('Choose up to '+plural(T.pending.max,'card')+'.');
      tell(ev,{e:'play',pl:seat,k:'trash',ts:a.cards.map(typeOf)});
      for(const id of a.cards){rm(P.hand,id);S.trash.push(id);}
      T.pending=null;break;
    }
    case 'transmit':{
      if(!inHand(a.card)||typeOf(a.card)!=='transmitter')return fail('You need the Transmitter.');
      const st=stackOf(a.type),stack=st&&st.s;if(!stack||stack.n<=0)return fail('That card is sold out.');
      T.active=null;rm(P.hand,a.card);S.trash.push(a.card);
      stack.n--;P.discard.push(newCard(stack.t));tell(ev,{e:'play',pl:seat,k:'transmit',ts:['transmitter'],got:stack.t});
      break;
    }
    case 'buy':{
      const no=cantBuy(seat,a.type);if(no)return fail(no);
      const st=stackOf(a.type);let stack=st.s;
      if(!distinctHand(a.cards))return fail('Pay with cards from your hand.');
      const total=a.cards.reduce((s,id)=>s+coinVal(id),0),cost=CT[stack.t].cost;
      if(total<cost)return fail('Not enough coins.');
      T.active=null;tell(ev,{e:'play',pl:seat,k:'buy',ts:a.cards.map(typeOf),got:stack.t,paid:total});
      for(const id of a.cards){rm(P.hand,id);const d=def(id);if(d.once&&(d.c==='y'||d.c==='x'))S.trash.push(id);else P.play.push(id);}
      const t=stack.t;
      if(st.src==='r'){const slot=S.market.findIndex(s=>s.n===0);S.market[slot]={t,n:stack.n};S.reserve.splice(st.i,1);stack=S.market[slot];}
      stack.n--;P.discard.push(newCard(t));T.bought=true;
      break;
    }
    case 'end':{
      const keep=a.keep;if(!distinctHand(keep))return fail('Bad cards to keep.');
      // the kept cards stay; the rest of the hand and the cards played are discarded; draw up to 4
      const toDisc=P.hand.filter(id=>!keep.includes(id));tell(ev,{e:'play',pl:seat,k:'end',kept:keep.length,disc:toDisc.length}); // counts only: the hand is private
      for(const id of toDisc){rm(P.hand,id);P.discard.push(id);}
      P.discard.push(...P.play);P.play=[];
      drawCards(P,4-P.hand.length,rnd);reveal=true;
      passTurn(ev);break;
    }
    default:return fail('Unknown action.');
  }
  // arriving with your last explorer ends your turn: nothing is left to do, or to draw for
  if(!S.over&&S.cur===seat&&(a.t==='move'||a.t==='native')&&playerDone(P)){P.discard.push(...P.hand,...P.play);P.hand=[];P.play=[];passTurn(ev);}
  if(S.over)ev.push({e:'over'});
  return{ok:true,ev,reveal};
}
/* who still races */
/* the race's end is set off (the round is still finished): in a full race once at most one player is racing, under the
   official rule at the first arrival */
function checkEnd(ev){
  if(S.endTriggered||!(S.fullRace?S.players.filter(isActive).length<=1:S.players.some(playerDone)))return;
  S.endTriggered=true;tell(ev,{e:'final'});
}
function advance(){
  const n=S.players.length;let i=S.cur;
  for(let step=0;step<n*2+2;step++){
    i=(i+1)%n;
    if(i===0){if(S.endTriggered){endGame();return;}S.round++;} // (player 0 starts every round)
    const p=S.players[i];
    if(S.fullRace?isActive(p):!p.resigned){S.cur=i;return;}
  }
  assert(false,'advance: someone takes the turn, or the game ends'); // (checkEnd and resign end the game before nobody is left)
}
/* the turn passes to the next player racing (or the game ends: advance) */
function passTurn(ev){S.turn={bought:false,active:null,pending:null};advance();ev.push({e:'turn',pl:S.cur});}
/* A player leaves a game for good (online): placed below everyone still racing. */
function resign(seat){
  const P=S.players[seat];if(P.resigned||playerDone(P))return{ok:false,err:'You are not racing.',ev:[]};
  P.resigned=1+Math.max(...S.players.map(p=>p.resigned)); // the order of resigning (the first to leave places last)
  const ev=[];tell(ev,{e:'resign',pl:seat});
  const others=S.players.filter((p,i)=>i!==seat&&!p.resigned);
  if(others.length<=1||!S.players.some(isActive)){endGame();ev.push({e:'over'});return{ok:true,ev};} // nobody left to race: finish now
  checkEnd(ev);
  if(seat===S.cur)passTurn(ev);
  if(S.over)ev.push({e:'over'});
  return{ok:true,ev};
}
function progress(p){ // lower = closer: sum of shortest step counts from each explorer to a finishing space
  let tot=0;
  for(const k of p.pieces){if(k==='done')continue;
    const seen=new Set([k]);let q=[k],d=0,found=false;
    while(!found){d++;const nq=[];for(const u of q)for(const n of neighbors(u)){if(seen.has(n))continue;const h=hexAt(n);if(h.type==='m')continue;if(h.type==='g'){found=true;break;}seen.add(n);nq.push(n);}q=nq;
      assert(found||q.length,'progress: El Dorado can be reached from every explorer');}
    tot+=d;}
  return tot;
}
function endGame(){
  S.over=true;
  const bk=p=>blocksOf(S.players.indexOf(p)),mb=p=>Math.max(0,...bk(p).map(b=>S.blockades[b].n));
  const keyOf=(p)=>playerDone(p)?[0,p.fin,-bk(p).length,-mb(p)]:p.resigned?[2,-p.resigned,0,0]:[1,progress(p),-bk(p).length,-mb(p)];
  const idx=S.players.map((p,i)=>({i,k:keyOf(p)}));
  const cmp=(a,b)=>{for(let j=0;j<4;j++)if(a.k[j]!==b.k[j])return a.k[j]-b.k[j];return 0;};
  idx.sort(cmp);
  const places=new Array(S.players.length);
  idx.forEach((x,j)=>{places[x.i]=j>0&&cmp(x,idx[j-1])===0?places[idx[j-1].i]:j+1;});
  S.places=places;log({e:'over'});
}
/* ---------- multiplayer Elo from a finishing order ---------- */
function eloDeltas(ratings,places,games){
  const n=ratings.length,out=new Array(n).fill(0);
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
  if(R.turn.active)vis.add(R.turn.active.id);
  const cards={};for(const id of vis)cards[id]=state.cards[id];R.cards=cards;
  return R;
}

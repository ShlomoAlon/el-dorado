/* =========================================================
   RULES ENGINE — pure game logic shared by the browser and the server.
   Every function that needs the game takes it first (gs, the game state); its board comes from its course and seed
   (mapOf). Nothing in here touches the page.
   ========================================================= */
/* a game's board: built from its course and seed once, and shared by every copy of the game (the last few are kept) */
const MAPS=new Map();let lastMap=null;
function mapOf(gs){
  if(lastMap&&lastMap.course===gs.course.id&&lastMap.seed===gs.seed)return lastMap;
  const k=gs.course.id+'#'+gs.seed;let m=MAPS.get(k);
  if(!m){m=buildCourse(gs.course,gs.seed);m.seed=gs.seed;MAPS.set(k,m);if(MAPS.size>16)MAPS.delete(MAPS.keys().next().value);}
  return lastMap=m;
}
const hexAt=(gs,k)=>mapOf(gs).hexes.get(k);
const typeOf=(gs,id)=>gs.cards[id];
const def=(gs,id)=>CT[gs.cards[id]];
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
const fmt=n=>(n%1?(Math.floor(n)?Math.floor(n)+'½':'½'):String(n));
function rm(arr,id){const i=arr.indexOf(id);assert(i>=0,'rm: the item is in the list');arr.splice(i,1);}
function playerDone(p){return p.pieces.every(k=>k==='done');}
function isActive(p){return !playerDone(p)&&!p.resigned;}
/* the blockades player pl has taken (by index), and how many */
function blocksOf(gs,pl){const out=[];gs.blockades.forEach((B,i)=>{if(B.owner===pl)out.push(i);});return out;}

/* where a card type is sold: every type has exactly one stack, in the market or the reserve. {src:'m'|'r', i, s} or null */
function stackOf(gs,t){let i=gs.market.findIndex(s=>s.t===t);if(i>=0)return{src:'m',i,s:gs.market[i]};i=gs.reserve.findIndex(s=>s.t===t);return i>=0?{src:'r',i,s:gs.reserve[i]}:null;}
/* the reserve can be bought from once a market slot is empty */
function reserveOpen(gs){return gs.market.some(s=>s.n===0);}
/* why seat can't buy a card of type t now, payment aside ('' if it can). The purchase rules live here: the buy action and
   the page's market both ask */
function cantBuy(gs,seat,t){
  if(gs.over)return'The game is over.';
  if(seat!==gs.cur)return'It is not your turn.';
  if(gs.turn.pending)return'Choose which cards to remove first.';
  if(gs.turn.bought)return'You can buy only one card per turn.';
  const st=stackOf(gs,t);if(!st||st.s.n<=0)return'That card is sold out.';
  if(st.src==='r'&&!reserveOpen(gs))return'The reserve opens once a market slot is empty.';
  return'';
}
/* why seat can't buy a card of type t now with the coins in its hand ('' if it can): the rules (cantBuy), then the price.
   One rule for whether a purchase can happen, so the page never opens one that can only be cancelled */
function cantPay(gs,seat,t){
  const no=cantBuy(gs,seat,t);if(no)return no;
  const cash=gs.players[seat].hand.reduce((a,id)=>a+coinVal(gs,id),0);
  return CT[t].cost>cash?'Not enough coins: '+cash+' in hand, it costs '+CT[t].cost+'.':'';
}
/* what seat can buy now with the coins in its hand: [{src:'m'|'r', i, t}], market first */
function buyOptions(gs,seat){
  const out=[];
  for(const[src,list]of[['m',gs.market],['r',gs.reserve]])list.forEach((s,i)=>{if(s.n>0&&!cantPay(gs,seat,s.t))out.push({src,i,t:s.t});});
  return out;
}
/* ---- game logs (replays) ----
   {kind:'eldorado-replay', v:3 (game records, below), title, course, seed, rng, fullRace, gift?, players:[{name,color,bot?}], actions:[[seat,action],…]}
   Game records before v3 were played under older rules (the turn went on after the last explorer arrived): not replayable.
   Every shuffle draws from a generator seeded with log.rng, so re-applying the same actions rebuilds the identical game. */
const REPLAY_MAX_ACTIONS=20000;
function replayCheck(log){
  if(!log||log.kind!=='eldorado-replay')return'Not an El Dorado game log.';
  if(log.v!==3)return'This game was recorded by an older version of the game.';
  if(!courseById(log.course))return'Unknown course: '+log.course;
  if(!Array.isArray(log.players)||log.players.length<2||log.players.length>4)return'A game log needs 2 to 4 players.';
  if(!log.players.every(p=>typeof p.name==='string'&&p.name&&p.name.length<=24&&COLORS.some(c=>c.hex===p.color)&&(p.bot===undefined||aiById(p.bot))))return'The game log names its players wrongly.';
  if(!Number.isFinite(log.seed)||!Number.isFinite(log.rng))return'The game log is missing its seeds.';
  if(log.gift&&!(CT[log.gift]&&CT[log.gift].cost))return'Unknown gift card: '+log.gift;
  if(!Array.isArray(log.actions)||log.actions.length>REPLAY_MAX_ACTIONS||!log.actions.every(x=>Array.isArray(x)&&Number.isInteger(x[0])&&x[1]&&typeof x[1].t==='string'))return'The game log has no valid list of actions.';
  return null;}
/* the log's game at its start */
function replayStart(log){
  return gameStart({course:courseById(log.course),seed:log.seed,fullRace:log.fullRace!==false,gift:log.gift,
    players:log.players.map(p=>({name:p.name,color:p.color,ai:p.bot}))},log.rng);}
/* a new game from its setup and its number (rng): the deal draws from action index -1's generator. gift (training
   exploration): every player starts with the same extra card, shuffled into the draw pile */
function gameStart(o,rng){const g=recRng(rng,-1),gs=newGame(o,g);
  if(o.gift)for(const p of gs.players)p.deck.splice(Math.floor(g()*(p.deck.length+1)),0,newCard(gs,o.gift));
  return gs;}
/* a log played back one action at a time: yields {i, gs, ok, err, ev} after each (i = -1: the setup), gs being the game (one
   game, changed step by step: stop early, or snapshot it at each step) */
function* replay(log){const gs=replayStart(log);yield{i:-1,gs,ok:true,ev:[]};
  for(let i=0;i<log.actions.length;i++){const[seat,a]=log.actions[i];const r=applyAction(gs,seat,a,recRng(log.rng,i));checkGame(gs);yield{i,gs,...r};}}
/* ---- game records (log v3): a game is its setup and its list of actions; the state is rebuilt from them ----
   Each action's shuffles come from a generator of its own, seeded from the game's secret number (rec.rng) and the action's
   index (newGame's: index -1), so re-applying the log rebuilds the same game and nothing needs a generator's state between
   moves. rec.rng would reveal every future shuffle, so the record stays on the server (or in the local save) until the game
   is over. Undo drops the last action and rebuilds; rec.mark = how many actions can no longer be undone (up to the last
   one that drew cards, passed the turn, or was a resignation). The saved game is the record (the state is rebuilt). */
function recRng(rng,k){return mulberry32(((rng>>>0)+Math.imul(k+2,0x9E3779B1))>>>0);}
/* a new game's secret number, from the platform's cryptographic generator (Math.random's state could be guessed) */
function recSecret(){return crypto.getRandomValues(new Uint32Array(1))[0];}
/* a new game and its record: {gs, rec}. rng: the game's number (recSecret() for a game people play; tools and tests pass
   a fixed one to get the same game again) */
function recNewGame(o,rng){
  assert(Number.isInteger(rng)&&rng>=0&&rng<2**32,'recNewGame: the game\'s number (rng) is a 32-bit integer');
  const gs=gameStart(o,rng);
  // (privacy: the page's pass-and-play cover, a setting of the table rather than of the game: kept in the record only)
  return{gs,rec:{kind:'eldorado-replay',v:3,course:gs.course.id,seed:gs.seed,rng,fullRace:gs.fullRace,...(o.privacy?{privacy:true}:{}),...(o.gift?{gift:o.gift}:{}),
    players:gs.players.map(p=>p.ai?{name:p.name,color:p.color,bot:p.ai}:{name:p.name,color:p.color}),actions:[],mark:0}};
}
/* the game's invariants: what must hold after every action (cheap: one pass over ~100 cards; run by recApply, so in every
   real game, local and online, but never in the AI's look-ahead) */
function checkGame(gs){
  const seen=new Set(),zone=ids=>{for(const id of ids){assert(gs.cards[id]!==undefined,'game: every card in a pile exists');assert(!seen.has(id),'game: a card is in one place only');seen.add(id);}};
  for(const p of gs.players){zone(p.deck);zone(p.hand);zone(p.discard);zone(p.play);}
  zone(gs.trash);
  assert(seen.size===gs.nid-1,'game: no card is created or lost');
  for(const q of gs.market)assert(q.n>=0,'game: market stacks never go below zero');
  for(const q of gs.reserve)assert(q.n>=0,'game: reserve stacks never go below zero');
  const M=mapOf(gs),at=new Set();
  for(const p of gs.players)for(const k of p.pieces){if(k==='done')continue;
    const h=M.hexes.get(k);assert(h&&h.type!=='m','game: an explorer stands on a space that can be entered');
    assert(!at.has(k),'game: two explorers never share a space');at.add(k);}
  assert(Number.isInteger(gs.cur)&&gs.cur>=0&&gs.cur<gs.players.length,'game: the player to move is a seat');
  for(const B of gs.blockades)assert(B.owner===null||(Number.isInteger(B.owner)&&B.owner>=0&&B.owner<gs.players.length),'game: a blockade is taken by a seat or no one');
  if(gs.over){assert(Array.isArray(gs.places)&&gs.places.length===gs.players.length,'game: a finished game places every player');return;}
  assert(!gs.players[gs.cur].resigned,'game: a resigned player never has the turn');
  const T=gs.turn;
  if(T.active){const P=gs.players[gs.cur];assert(P.play.includes(T.active.id)||gs.trash.includes(T.active.id),'game: the card being played is in play (or removed from the game)');}
}
/* every change to a game in play: applyAction, recorded in rec (the game's log; null: not recorded) */
function recApply(gs,rec,seat,a){assert(rec&&Array.isArray(rec.actions),'recApply: the game\'s record');
  const prev=gs.cur,r=applyAction(gs,seat,a,recRng(rec.rng,rec.actions.length));
  checkGame(gs); // (after every real action; never in the AI's look-ahead, which calls applyAction itself)
  if(r.ok){rec.actions.push([seat,a]);if(r.reveal||a.t==='resign'||gs.cur!==prev||gs.over)rec.mark=rec.actions.length;}
  return r;
}
const recCanUndo=rec=>rec.actions.length>rec.mark;
/* the game a record leads to */
function recState(rec){let gs=null;for(const r of replay(rec))gs=r.gs;return gs;}
/* take back the last action: the rebuilt game (callers check recCanUndo first) */
function recUndo(rec){assert(recCanUndo(rec),'recUndo: an action can be taken back');rec.actions.pop();return recState(rec);}
/* the log of game st (rec's state), ready to save and watch, with a title. places: null for a game that didn't finish (a
   training log stopped at its round cap) */
function recFinal(rec,st){
  const{mark,...L}=rec;
  L.title=st.players.map(p=>p.name).join(', ')+' · '+st.course.name;
  L.result={places:st.places,rounds:st.round};
  return L;
}
/* a new game (its state) */
function newGame(o,rnd){assert(typeof rnd==='function','newGame: a random source (rnd)');
  assert(o.players.length>=2&&o.players.length<=4,'newGame: 2 to 4 players');
  const course=o.course||COURSES[0],M=mapOf({course,seed:o.seed});
  let nid=1;const cards={};const mk=t=>{const id='c'+(nid++);cards[id]=t;return id;};
  const players=o.players.map(p=>{
    const deck=[];for(let i=0;i<3;i++)deck.push(mk('explorer'));for(let i=0;i<4;i++)deck.push(mk('traveler'));deck.push(mk('sailor'));
    const pl={name:p.name,color:p.color,pieces:[],deck:shuffle(deck,rnd),hand:[],discard:[],play:[],fin:0,resigned:0};
    if(p.ai){assert(aiById(p.ai),'newGame: a known AI');pl.ai=p.ai;} // a named AI plays this seat (engine_ai.js)
    return pl;
  });
  const st=M.starts;
  if(players.length===2){players[0].pieces=[st[0],st[2]];players[1].pieces=[st[1],st[3]];}
  else players.forEach((p,i)=>p.pieces=[st[i]]);
  const gs={seed:o.seed,course,players,cards,nid,market:MARKET0.map(t=>({t,n:3})),reserve:RESERVE0.map(t=>({t,n:3})),
     blockades:M.blockDefs.map(d=>({...d,owner:null})),cur:0,round:1,endTriggered:false,over:false,places:null,
     fullRace:o.fullRace!==false,turn:{bought:false,active:null,pending:null},trash:[],log:[]};
  players.forEach(p=>drawCards(p,4,rnd));
  log(gs,{e:'start'});
  return gs;
}
function newCard(gs,t){const id='c'+(gs.nid++);gs.cards[id]=t;return id;}
function drawCards(p,n,rnd){const got=[];for(let i=0;i<n;i++){if(!p.deck.length){if(!p.discard.length)break;p.deck=shuffle(p.discard,rnd);p.discard=[];}const c=p.deck.pop();p.hand.push(c);got.push(c);}return got;}
/* the journal (gs.log): the game's public events, each with its round (all but the turn changes); the page's history panel
   shows it turn by turn (feed.js). Only the last LOG_MAX are kept */
const LOG_MAX=200;
function log(gs,e){gs.log.push({...e,r:gs.round});if(gs.log.length>LOG_MAX)gs.log.shift();}
const tell=(gs,ev,e)=>{ev.push(e);log(gs,e);}; // an event that also goes in the journal
function occupied(gs,k,exPl,exPi){return gs.players.some((p,pi)=>p.pieces.some((pk,i)=>pk===k&&!(pi===exPl&&i===exPi)));}
/* the standing blockade between spaces a and b (its index), or null. Blockade i sits on connection i (buildCourse deals one per connection) */
function blockAt(gs,a,b){const c=mapOf(gs).edgeConn.get(a+'|'+b);return c===undefined||gs.blockades[c].owner!==null?null:c;}
function neighbors(gs,k){const nb=mapOf(gs)._nb||(mapOf(gs)._nb=new Map());let r=nb.get(k);if(!r){const h=hexAt(gs,k);r=DIRS.map(([dq,dr])=>key(h.q+dq,h.r+dr)).filter(n=>mapOf(gs).hexes.has(n));nb.set(k,r);}return r;} // cached per map
function coinVal(gs,id){const d=def(gs,id);if(d.c==='y'||d.c==='x')return d.p;return .5;}
function blkLabel(B){return B.k==='r'?'discard '+plural(B.v,'card'):plural(B.v,SYMNAME[B.k]);}

/* ---------- reachability ---------- */
function reach(gs,pl,pi,syms,budget){
  const out=new Map(),from=gs.players[pl].pieces[pi];assert(from&&from!=='done','reach: the explorer is on the board');
  for(const sym of syms){
    const dist=new Map([[from,0]]),prev=new Map(),pq=[[0,from]];
    while(pq.length){
      let bi=0;for(let i=1;i<pq.length;i++)if(pq[i][0]<pq[bi][0])bi=i;
      const[d,u]=pq[bi];pq[bi]=pq[pq.length-1];pq.pop();if(d>dist.get(u))continue;
      if(u!==from&&hexAt(gs,u).type==='g')continue;
      for(const n of neighbors(gs,u)){
        const h=hexAt(gs,n);
        if(!(h.type===sym||(h.type==='g'&&h.sym===sym)))continue;
        if(occupied(gs,n,pl,pi))continue;
        let c=h.val;const b=blockAt(gs,u,n);
        if(b!==null){if(gs.blockades[b].k!==sym)continue;c+=gs.blockades[b].v;}
        const nd=d+c;if(nd>budget)continue;
        if(!dist.has(n)||nd<dist.get(n)){dist.set(n,nd);prev.set(n,u);pq.push([nd,n]);}
      }
    }
    const pathTo=k=>{const p=[];let x=k;while(x!==from){p.unshift(x);x=prev.get(x);}return p;};
    for(const[k,d]of dist){if(k===from)continue;const o=out.get(k);if(!o||d<o.cost)out.set(k,{t:'move',kind:'move',cost:d,sym,path:pathTo(k),pi});}
    for(const[k,d]of dist){
      if(hexAt(gs,k).type==='g')continue;
      for(const n of neighbors(gs,k)){const b=blockAt(gs,k,n);if(b===null)continue;const B=gs.blockades[b];
        if(B.k!==sym||d+B.v>budget)continue;const K='B'+b;const o=out.get(K);
        if(!o||d+B.v<o.cost)out.set(K,{t:'move',kind:'bl',bl:b,cost:d+B.v,sym,path:k===from?[]:pathTo(k),pi});}
    }
  }
  return out;
}
function nativeTargets(gs,pl,pi){
  const T=new Map(),pk=gs.players[pl].pieces[pi];assert(pk&&pk!=='done','nativeTargets: the explorer is on the board');
  for(const n of neighbors(gs,pk)){const h=hexAt(gs,n);if(h.type==='m'||h.type==='s'||occupied(gs,n))continue;T.set(n,{t:'native',kind:'native',path:[n],cost:0,pi,bl:blockAt(gs,pk,n)});}
  for(const n of neighbors(gs,pk)){const b=blockAt(gs,pk,n);if(b!==null&&!T.has('B'+b))T.set('B'+b,{t:'native',kind:'nativebl',bl:b,path:[],cost:0,pi});}
  return T;
}
/* where seat can play card id with explorer pi now: Map<key or 'B'+i, target>. A movement card from the hand: the spaces its
   strength reaches, plus the rubble, base camps and rubble blockades it could be given up for (any card can be); the card in
   play with leftover strength: where that reaches; the Native: its own targets. Empty: not on the board now */
function cardTargets(gs,seat,pi,id){
  const T=new Map(),P=gs.players[seat],d=def(gs,id),act=gs.turn.active&&gs.turn.active.id===id?gs.turn.active:null;
  if(gs.over||seat!==gs.cur||gs.turn.pending)return T;
  if(act){for(const[k,v]of reach(gs,seat,act.pi,[act.sym],act.left))T.set(k,v);return T;}
  if(!P.hand.includes(id))return T;
  if(typeOf(gs,id)==='native'){for(const[k,v]of nativeTargets(gs,seat,pi))T.set(k,v);return T;}
  if(d.c!=='p')for(const[k,v]of reach(gs,seat,pi,d.s==='*'?['j','w','v']:[d.s],d.p))T.set(k,v);
  for(const[k,v]of payTargets(gs,seat,pi))if(!T.has(k))T.set(k,v);
  return T;
}
/* spaces/blockades entered by discarding (rubble, grey blockade) or removing cards (base camp) */
function payTargets(gs,pl,pi){
  const T=new Map(),P=gs.players[pl],pk=P.pieces[pi],hn=P.hand.length;assert(pk&&pk!=='done','payTargets: the explorer is on the board');
  for(const n of neighbors(gs,pk)){const h=hexAt(gs,n);
    if((h.type==='r'||h.type==='c')&&!occupied(gs,n)&&blockAt(gs,pk,n)===null&&hn>=h.val)T.set(n,{t:'pay',kind:h.type==='r'?'rubble':'camp',need:h.val,path:[n],pi});
    const b=blockAt(gs,pk,n);if(b!==null&&gs.blockades[b].k==='r'&&hn>=gs.blockades[b].v&&!T.has('B'+b))T.set('B'+b,{t:'pay',kind:'blr',bl:b,need:gs.blockades[b].v,pi});
  }
  return T;
}

/* =========================================================
   APPLY AN ACTION. Returns {ok, err?, ev:[events], reveal}
   reveal = new information came out (cards drawn), so undo stops here. rnd: where any shuffle this action needs comes from
   (a record passes the action's own generator; look-ahead copies of a game don't care)
   Actions (acting player = gs.cur, except resign):
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
function applyAction(gs,seat,a,rnd){assert(typeof rnd==='function','applyAction: a random source (rnd)');
  const fail=err=>({ok:false,err,ev:[]});
  if(gs.over)return fail('The game is over.');
  if(!a||typeof a!=='object')return fail('Bad action.');
  if(a.t==='resign')return resign(gs,seat);
  if(seat!==gs.cur)return fail('It is not your turn.');
  if(a.t==='endgame'){const ev=[];tell(gs,ev,{e:'endgame',pl:seat});endGame(gs);return{ok:true,ev:[...ev,{e:'over'}]};} // local play only (the server refuses it)
  if(a.t==='timeout'){log(gs,{e:'timeout',pl:seat});if(gs.turn.pending)applyAction(gs,seat,{t:'trash',cards:[]},rnd);gs.turn.active=null;
    const r=applyAction(gs,seat,{t:'end',keep:[]},rnd);return{...r,ev:[{e:'timeout',pl:seat},...r.ev]};}
  const P=gs.players[seat],T=gs.turn,ev=[];let reveal=false;
  const inHand=id=>typeof id==='string'&&P.hand.includes(id);
  const distinctHand=ids=>Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(inHand);
  const pieceOk=pi=>Number.isInteger(pi)&&pi>=0&&pi<P.pieces.length&&P.pieces[pi]!=='done';
  if(T.pending&&a.t!=='trash')return fail('Choose which cards to remove first.');
  const takeBlock=b=>{const B=gs.blockades[b];assert(B.owner===null,'a blockade is taken once');B.owner=seat;tell(gs,ev,{e:'block',pl:seat,n:B.n});};
  const arrive=pi=>{if(P.pieces[pi]!=='done')return;tell(gs,ev,{e:'arrive',pl:seat,pi});
    if(playerDone(P)){P.fin=gs.round;checkEnd(gs,ev);}};
  switch(a.t){
    case 'move':{
      const act=T.active&&T.active.id===a.card?T.active:null;
      if(!act&&!inHand(a.card))return fail('That card is not in your hand.');
      const d=def(gs,a.card);if(d.c==='p')return fail('That card cannot move.');
      const pi=act?act.pi:a.pi;if(!pieceOk(pi))return fail('Choose one of your explorers.');
      const syms=act?[act.sym]:(d.s==='*'?['j','w','v']:[d.s]);const budget=act?act.left:d.p;
      const tg=reach(gs,seat,pi,syms,budget).get(a.to);if(!tg)return fail('That space is out of reach.');
      tell(gs,ev,{e:'play',pl:seat,k:'move',ts:[typeOf(gs,a.card)],more:!!act,n:tg.path.length,sym:tg.sym});
      if(!act){T.active=null;rm(P.hand,a.card);if(d.once)gs.trash.push(a.card);else P.play.push(a.card);} // single-use (Giant Machete, Prop Plane, Treasure Chest): removed from the game
      const from=P.pieces[pi];let pos=from;const path=[from];
      for(const st of tg.path){const b=blockAt(gs,pos,st);if(b!==null)takeBlock(b);pos=st;path.push(st);}
      if(tg.kind==='bl')takeBlock(tg.bl);
      const done=hexAt(gs,pos).type==='g';P.pieces[pi]=done?'done':pos;
      const left=budget-tg.cost;T.active=(left>0&&!done)?{id:a.card,pi,sym:tg.sym,left}:null;
      if(tg.path.length)tell(gs,ev,{e:'move',pl:seat,pi,path});
      arrive(pi);break;
    }
    case 'native':{
      if(!inHand(a.card)||typeOf(gs,a.card)!=='native')return fail('You need the Native.');
      if(!pieceOk(a.pi))return fail('Choose one of your explorers.');
      const tg=nativeTargets(gs,seat,a.pi).get(a.to);if(!tg)return fail('The Native can only reach an adjacent free space.');
      T.active=null;rm(P.hand,a.card);P.play.push(a.card);tell(gs,ev,{e:'play',pl:seat,k:'native',ts:['native'],n:tg.kind==='native'?1:0});
      if(tg.bl!=null)takeBlock(tg.bl);
      if(tg.kind==='native'){const from=P.pieces[a.pi];const n=tg.path[0];P.pieces[a.pi]=hexAt(gs,n).type==='g'?'done':n;
        tell(gs,ev,{e:'move',pl:seat,pi:a.pi,path:[from,n]});arrive(a.pi);}
      break;
    }
    case 'pay':{
      if(!pieceOk(a.pi))return fail('Choose one of your explorers.');
      const tg=payTargets(gs,seat,a.pi).get(a.to);if(!tg)return fail('You cannot enter there.');
      if(!distinctHand(a.cards)||a.cards.length!==tg.need)return fail('Choose exactly '+plural(tg.need,'card')+'.');
      T.active=null;const trash=tg.kind==='camp';tell(gs,ev,{e:'play',pl:seat,k:tg.kind,ts:a.cards.map(id=>typeOf(gs,id))});
      for(const id of a.cards){rm(P.hand,id);if(trash)gs.trash.push(id);else P.play.push(id);}
      if(tg.kind==='blr')takeBlock(tg.bl);
      else{const from=P.pieces[a.pi];const n=tg.path[0];P.pieces[a.pi]=n;
        tell(gs,ev,{e:'move',pl:seat,pi:a.pi,path:[from,n]});}
      break;
    }
    case 'action':{
      const t=inHand(a.card)&&typeOf(gs,a.card);
      const n={cartographer:2,compass:3,scientist:1,travellog:2}[t];if(!n)return fail('That card has no draw effect.');
      T.active=null;rm(P.hand,a.card);if(CT[t].once)gs.trash.push(a.card);else P.play.push(a.card);
      const got=drawCards(P,n,rnd);reveal=true;tell(gs,ev,{e:'play',pl:seat,k:'action',ts:[t],n:got.length});
      if(t==='scientist'||t==='travellog')T.pending={by:t,max:t==='scientist'?1:2}; // by: the card asking (shown while it's answered)
      break;
    }
    case 'trash':{
      if(!T.pending)return fail('Nothing to remove.');
      if(!distinctHand(a.cards)||a.cards.length>T.pending.max)return fail('Choose up to '+plural(T.pending.max,'card')+'.');
      tell(gs,ev,{e:'play',pl:seat,k:'trash',ts:a.cards.map(id=>typeOf(gs,id))});
      for(const id of a.cards){rm(P.hand,id);gs.trash.push(id);}
      T.pending=null;break;
    }
    case 'transmit':{
      if(!inHand(a.card)||typeOf(gs,a.card)!=='transmitter')return fail('You need the Transmitter.');
      const st=stackOf(gs,a.type),stack=st&&st.s;if(!stack||stack.n<=0)return fail('That card is sold out.');
      T.active=null;rm(P.hand,a.card);gs.trash.push(a.card);
      stack.n--;P.discard.push(newCard(gs,stack.t));tell(gs,ev,{e:'play',pl:seat,k:'transmit',ts:['transmitter'],got:stack.t});
      break;
    }
    case 'buy':{
      const no=cantBuy(gs,seat,a.type);if(no)return fail(no);
      const st=stackOf(gs,a.type);let stack=st.s;
      if(!distinctHand(a.cards))return fail('Pay with cards from your hand.');
      const total=a.cards.reduce((s,id)=>s+coinVal(gs,id),0),cost=CT[stack.t].cost;
      if(total<cost)return fail('Not enough coins.');
      T.active=null;tell(gs,ev,{e:'play',pl:seat,k:'buy',ts:a.cards.map(id=>typeOf(gs,id)),got:stack.t,paid:total});
      for(const id of a.cards){rm(P.hand,id);const d=def(gs,id);if(d.once&&(d.c==='y'||d.c==='x'))gs.trash.push(id);else P.play.push(id);}
      const t=stack.t;
      if(st.src==='r'){const slot=gs.market.findIndex(s=>s.n===0);gs.market[slot]={t,n:stack.n};gs.reserve.splice(st.i,1);stack=gs.market[slot];}
      stack.n--;P.discard.push(newCard(gs,t));T.bought=true;
      break;
    }
    case 'end':{
      const keep=a.keep;if(!distinctHand(keep))return fail('Bad cards to keep.');
      // the kept cards stay; the rest of the hand and the cards played are discarded; draw up to 4
      const toDisc=P.hand.filter(id=>!keep.includes(id));tell(gs,ev,{e:'play',pl:seat,k:'end',kept:keep.length,disc:toDisc.length,ts:toDisc.map(id=>typeOf(gs,id))}); // kept: a count (the hand is private); discarded: face up on the pile
      for(const id of toDisc){rm(P.hand,id);P.discard.push(id);}
      P.discard.push(...P.play);P.play=[];
      drawCards(P,4-P.hand.length,rnd);reveal=true;
      passTurn(gs,ev);break;
    }
    default:return fail('Unknown action.');
  }
  // arriving with your last explorer ends your turn: nothing is left to do, or to draw for
  if(!gs.over&&gs.cur===seat&&(a.t==='move'||a.t==='native')&&playerDone(P)){P.discard.push(...P.hand,...P.play);P.hand=[];P.play=[];passTurn(gs,ev);}
  if(gs.over)ev.push({e:'over'});
  return{ok:true,ev,reveal};
}
/* who still races */
/* the race's end is set off (the round is still finished): in a full race once at most one player is racing, under the
   official rule at the first arrival */
function checkEnd(gs,ev){
  if(gs.endTriggered||!(gs.fullRace?gs.players.filter(isActive).length<=1:gs.players.some(playerDone)))return;
  gs.endTriggered=true;tell(gs,ev,{e:'final'});
}
function advance(gs){
  const n=gs.players.length;let i=gs.cur;
  for(let step=0;step<n*2+2;step++){
    i=(i+1)%n;
    if(i===0){if(gs.endTriggered){endGame(gs);return;}gs.round++;} // (player 0 starts every round)
    const p=gs.players[i];
    if(gs.fullRace?isActive(p):!p.resigned){gs.cur=i;return;}
  }
  assert(false,'advance: someone takes the turn, or the game ends'); // (checkEnd and resign end the game before nobody is left)
}
/* the turn passes to the next player racing (or the game ends: advance) */
function passTurn(gs,ev){gs.turn={bought:false,active:null,pending:null};advance(gs);ev.push({e:'turn',pl:gs.cur});}
/* A player leaves a game for good (online): placed below everyone still racing. */
function resign(gs,seat){
  const P=gs.players[seat];if(P.resigned||playerDone(P))return{ok:false,err:'You are not racing.',ev:[]};
  P.resigned=1+Math.max(...gs.players.map(p=>p.resigned)); // the order of resigning (the first to leave places last)
  const ev=[];tell(gs,ev,{e:'resign',pl:seat});
  const others=gs.players.filter((p,i)=>i!==seat&&!p.resigned);
  if(others.length<=1||!gs.players.some(isActive)){endGame(gs);ev.push({e:'over'});return{ok:true,ev};} // nobody left to race: finish now
  checkEnd(gs,ev);
  if(seat===gs.cur)passTurn(gs,ev);
  if(gs.over)ev.push({e:'over'});
  return{ok:true,ev};
}
function progress(gs,p){ // lower = closer: sum of shortest step counts from each explorer to a finishing space
  let tot=0;
  for(const k of p.pieces){if(k==='done')continue;
    const seen=new Set([k]);let q=[k],d=0,found=false;
    while(!found){d++;const nq=[];for(const u of q)for(const n of neighbors(gs,u)){if(seen.has(n))continue;const h=hexAt(gs,n);if(h.type==='m')continue;if(h.type==='g'){found=true;break;}seen.add(n);nq.push(n);}q=nq;
      assert(found||q.length,'progress: El Dorado can be reached from every explorer');}
    tot+=d;}
  return tot;
}
function endGame(gs){
  gs.over=true;
  const bk=p=>blocksOf(gs,gs.players.indexOf(p)),mb=p=>Math.max(0,...bk(p).map(b=>gs.blockades[b].n));
  const keyOf=(p)=>playerDone(p)?[0,p.fin,-bk(p).length,-mb(p)]:p.resigned?[2,-p.resigned,0,0]:[1,progress(gs,p),-bk(p).length,-mb(p)];
  const idx=gs.players.map((p,i)=>({i,k:keyOf(p)}));
  const cmp=(a,b)=>{for(let j=0;j<4;j++)if(a.k[j]!==b.k[j])return a.k[j]-b.k[j];return 0;};
  idx.sort(cmp);
  const places=new Array(gs.players.length);
  idx.forEach((x,j)=>{places[x.i]=j>0&&cmp(x,idx[j-1])===0?places[idx[j-1].i]:j+1;});
  gs.places=places;log(gs,{e:'over'});
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

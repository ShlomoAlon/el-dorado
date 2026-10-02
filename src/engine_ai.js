/* =========================================================
   NAMED AI PLAYERS — thin layer over the bot (engine_bot.js), shared by local games (browser)
   and online rooms (the Room Durable Object runs them server-side).
   Apart from one safety net (aiFinishGuard) it doesn't change how the bot decides; it picks the bot's settings per AI and keeps the
   whole-turn planner's cache per game (the cache is module-global and a server isolate runs many rooms).
   ========================================================= */
/* rating: the calibrated starting rating (tools/ai/calibrate_ais.mjs: AI-vs-AI games, Raleigh anchored at 1200 = a new player);
   the server applies it once (worker.js ensureSchema). */
const AIS=[
  // Fawcett: Humboldt's network with a 4x wider whole-turn search and 8 imagined draws per line (≈3x his thinking time):
  // tools/ai/h2h.mjs against Humboldt, 200 games: 34.6% of seats won against 23.7%, mean place 0.44 against 0.54; ratings: calibrate_ais.mjs
  {id:'fawcett',name:'Fawcett',tier:'Grandmaster',rating:1464,desc:'Neural network that weighs many more plans each turn',opts:{mode:'net',search:{kind:'plan',beam:12},draws:8}},
  {id:'humboldt',name:'Humboldt',tier:'Master',rating:1398,desc:'Neural network that plans each whole turn',opts:{mode:'net',search:{kind:'plan',beam:3}}},
  {id:'raleigh',name:'Raleigh',tier:'Steady',rating:1200,desc:'Hand-written route planner',opts:{mode:'plan'}},
];
const aiById=id=>AIS.find(a=>a.id===id)||null;
const aiUsesNet=id=>aiById(id).opts.mode==='net';
/* the shipped network: see tools/ai/pack.mjs for the format (half floats) */
/* courses the AI players are offered on (the network is trained for First Expedition only; elsewhere they would fall back to
   the planner). Used by the setup screen, the online room and the server (worker.js addAI, start). */
const AI_COURSES=['first'];
function aiCourseOK(id){return AI_COURSES.includes(id);}
// and only in 3- and 4-player games: the network was never trained on 2-player games (different rules)
function aiAllowed(id,n){return aiCourseOK(id)&&n>=3;}
const AI_RULE='AI players play First Expedition with 3 or 4 players for now.';
/* the named AIs are players too (the server's users table: id ai-<AI id>) */
const aiUid=id=>'ai-'+id;
/* a player takes a seat in a room's lobby, with the first colour free (the first to sit hosts a room whose host has no
   seat): the server seats players as they connect; the page that made a room shows itself seated at once. False if
   there is no seat for them (seated already, the room full, the game started). */
function roomJoin(room,uid,name){
  if(room.status!=='lobby'||room.seats.some(s=>s.uid===uid)||room.seats.length>=room.opts.max)return false;
  const used=room.seats.map(s=>s.color);room.seats.push({uid,name,color:COLORS.map(c=>c.hex).find(c=>!used.includes(c))});
  if(!room.seats.some(s=>s.uid===room.host))room.host=uid;return true;
}
/* ---- a room's lobby, before its game starts: the changes players make there, one rule for the server (which decides) and
   the page (which shows its own change at once; the server's answer confirms it). room: {host, status, opts, seats:
   [{uid, name, color, ai?, now?}]}; m: what a player asked ({t: color | addAI | removeAI | rated | now, …}); aiName(id): the
   name an AI's seat takes (the server's records; the page uses the AI's own). Changes room and returns '', or returns why
   it can't (and changes nothing). */
function roomChange(room,uid,m,aiName){
  const seat=room.seats.find(s=>s.uid===uid),host=uid===room.host,auto=!!room.opts.auto,hex=COLORS.map(c=>c.hex);
  if(room.status!=='lobby')return'The game has started.';
  switch(m.t){
    case'color':if(!seat)return'You have no seat in this room.';
      if(!hex.includes(m.color)||room.seats.some(s=>s!==seat&&s.color===m.color))return'Someone has that colour.';seat.color=m.color;return'';
    case'addAI':{if(auto||!host)return'Only the host can add AI players.';const A=aiById(m.ai);if(!A)return'Unknown AI.';
      if(!aiAllowed(room.opts.course,room.opts.max))return AI_RULE;if(room.seats.length>=room.opts.max)return'This room is full.';
      // (the same AI may take several seats: Humboldt, Humboldt 2, …; they share its rating)
      const used=room.seats.map(s=>s.color),base=aiName(A.id),k=room.seats.filter(s=>s.ai===A.id).length;
      room.seats.push({uid:aiUid(A.id),name:k?base+' '+(k+1):base,color:hex.find(c=>!used.includes(c)),ai:A.id});return'';}
    case'removeAI':{if(!host)return'Only the host can remove AI players.';
      const i=room.seats.map(s=>!!s.ai&&s.uid===m.uid).lastIndexOf(true);if(i<0)return'That AI is not in this room.';room.seats.splice(i,1);return'';}
    case'rated':if(!host||auto)return'Only the host can change that.';room.opts.rated=!!m.v;return'';
    case'now':if(!seat||!auto)return'Only a quick match starts early.';seat.now=!seat.now;return'';
  }
  return'Bad message.';
}
function aiNetDecode(bin){
  const u8=bin instanceof Uint8Array?bin:new Uint8Array(bin),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  const hl=dv.getUint32(0,true),H=JSON.parse(new TextDecoder().decode(u8.subarray(4,4+hl)));
  let o=4+hl+((4+hl)&1);const{parts,...N}=H; // course, nf, unsettled, name, leak (the leaky-ReLU slope), and a multi-course network's courses, onehot, extra
  const half=h=>{const s=h&0x8000?-1:1,e=(h>>10)&31,m=h&1023;return e===0?s*m*2**-24:e===31?(m?NaN:s*Infinity):s*(1+m/1024)*2**(e-15);};
  const tab=new Float32Array(65536);for(let i=0;i<65536;i++)tab[i]=half(i);
  for(const[k,n]of H.parts){const a=new Float32Array(n);for(let i=0;i<n;i++,o+=2)a[i]=tab[dv.getUint16(o,true)];N[k]=a;}
  return N;
}
function aiSetNet(n){BOT_NET=n;}
/* one decision for the AI in seat gs.cur. mem: per-game object ({}) that keeps the turn planner's cache between calls.
   rnd: its look-ahead's random source. Returns a legal action. */
function aiChoose(gs,id,mem,rnd){
  const A=aiById(id);assert(A,'aiChoose: a named AI');
  let opts=A.opts;if(opts.mode==='net'&&(!botNetReady(gs)||gs.players.length===2))opts={mode:'plan'}; // network missing, trained for another course, or a 2-player game (never trained on those: it mostly failed to arrive)
  const me=gs.cur,tk=me+':'+gs.round;if(mem.tk!==tk){mem.tk=tk;mem.n=0;}
  if(++mem.n>60)return gs.turn.pending?{t:'trash',cards:[]}:{t:'end',keep:[]}; // never loop inside a turn
  return aiFinishGuard(gs,botChoose(gs,{...opts,planMem:mem,rnd}).a,mem);
}
/* the whole turn this AI would play from here for the player to move ([actions]), for the replay's advice. A draw card ends
   the line (the cards it draws change the plan). null: this AI doesn't plan whole turns with the network, or it isn't loaded */
function aiPlan(gs,id,rnd){
  const o=aiById(id).opts;if(o.mode!=='net'||!o.search||o.search.kind!=='plan'||!botNetReady(gs)||gs.players.length===2||gs.over)return null;
  const best=botPlanTurn(gs,gs.cur,o.search.beam||3,rnd,o.draws||4,false);
  return best.line&&best.line.length?best.line:[gs.turn.pending?{t:'trash',cards:[]}:{t:'end',keep:[]}];
}
/* El Dorado can only be entered with a card of its symbol (paddle on the water side, machete on the jungle side) or a joker.
   The bot sometimes trashes its last such card (or nearly its whole deck) and, near the end, stops buying, so it could wait forever next to the finish
   (seen on the newer courses). Keep one such card when trashing, and buy one before ending a turn without any. */
function aiFinishGuard(gs,a,mem){
  const P=gs.players[gs.cur],all=[...P.deck,...P.hand,...P.discard,...P.play],n=all.filter(id=>botFinishCard(gs,gs.cards[id])).length;
  if(a.t==='trash'){let c=a.cards;
    if(n){const out=c.filter(id=>botFinishCard(gs,gs.cards[id]));if(out.length>=n)c=c.filter(id=>id!==out[0]);}
    // and never thin the deck below 4 cards (owner: 4 can be valid, fewer can't), nor below what a base camp that is its
    // next step takes (it keeps 4 after paying it)
    const camp=Math.max(0,...aiNextSteps(gs,P).filter(h=>h.type==='c').map(h=>h.val));
    c=c.slice(0,Math.max(0,all.length-4-camp));
    if(c.length!==a.cards.length)return{...a,cards:c};}
  // (a base camp is open to an expedition that keeps 4 cards after paying it, botCanRemove: every card bought brings it closer)
  const steps=aiNextSteps(gs,P),open=(t,h)=>h.type==='c'?all.length-h.val>=4:aiEnters(gs,t,h);
  const stuck=steps.length>0&&!all.some(id=>steps.some(h=>open(gs.cards[id],h)));
  // once an explorer's planned way is shut to its cards, it keeps to a way they can take for the rest of the game (else the
  // plan walks it straight back): steps along that way instead of ending the turn or stepping off it
  if(stuck)mem.detour=true;
  if(mem.detour&&!gs.turn.pending&&(a.t==='end'||a.t==='move'||a.t==='native'||a.t==='pay')){
    const cap=aiRouteFor(gs,all.map(id=>gs.cards[id]),all.length),far=k=>k==='done'?0:(cap.get(k)??Infinity);
    const off=a.t!=='end'&&a.to[0]!=='B'&&far(a.to)>=far(P.pieces[a.pi]);
    if(a.t==='end'||off){
      const det=botActions(gs).filter(b=>(b.t==='move'||b.t==='native'||b.t==='pay')&&b.to[0]!=='B'&&far(b.to)<far(P.pieces[b.pi]));
      if(det.length){det.sort((x,y)=>far(x.to)-far(y.to));return det[0];}}}
  if(a.t==='end'&&!gs.turn.bought&&!gs.turn.pending){
    // an expedition with no card that could take the next step (or enter El Dorado) buys one, the cheapest way
    const want=!n?t=>botFinishCard(gs,t):stuck?t=>steps.some(h=>h.type==='c'||aiEnters(gs,t,h)):null;
    const buys=want?botActions(gs).filter(b=>b.t==='buy'&&want(b.type)):[];
    if(buys.length){buys.sort((x,y)=>x.cards.length-y.cards.length);return buys[0];}
  }
  return a;
}
/* the spaces the player's explorers could step to next on their way: neighbours closer to El Dorado */
function aiNextSteps(gs,P){const out=[];
  for(const k of P.pieces){if(k==='done')continue;const c=botCost(gs,k);for(const nb of neighbors(gs,k))if(hexAt(gs,nb).type!=='m'&&botCost(gs,nb)<c)out.push(hexAt(gs,nb));}
  return out;}
/* steps to El Dorado from every space over spaces cards of these types can enter (an expedition of `total` cards: base
   camps that leave it 4); Map key → steps, a space missing: no way from there */
function aiRouteFor(gs,types,total){const d=new Map(),q=[],ok=h=>h.type==='c'?total-h.val>=4:types.some(t=>aiEnters(gs,t,h));
  for(const k of mapOf(gs).goals)if(ok(hexAt(gs,k))){d.set(k,0);q.push(k);}
  for(let i=0;i<q.length;i++){const k=q[i];for(const nb of neighbors(gs,k)){const h=hexAt(gs,nb);
    if(d.has(nb)||h.type==='m'||h.type==='g'||h.type==='s'||!ok(h))continue;d.set(nb,d.get(k)+1);q.push(nb);}}
  return d;}
/* a card of type t could enter space h: its symbol (El Dorado: the course's) and strength, a joker, the Native; rubble and base
   camps take any cards */
function aiEnters(gs,t,h){const d=CT[t];if(t==='native'||h.type==='r'||h.type==='c')return true;if(d.c==='p')return false;
  const sym=h.type==='g'?mapOf(gs).endSym:h.type;return(d.s===sym||d.s==='*')&&d.p>=(h.val||1);}
/* apply the AI's decision (recorded in rec, the game's log; may be null). Returns applyAction's result. */
function aiStep(gs,id,mem,rec,rnd){ // rnd: the AI's look-ahead (the game's shuffles come from its record)
  const r=recApply(gs,rec,gs.cur,aiChoose(gs,id,mem,rnd));
  assert(r.ok,'aiStep: the AI chooses a legal action');
  return r;
}

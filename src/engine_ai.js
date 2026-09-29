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
const aiUsesNet=id=>{const a=aiById(id);return!!(a&&a.opts.mode==='net');};
/* the shipped network: see tools/ai/pack.mjs for the format (half floats) */
/* courses the AI players are offered on (the network is trained for First Expedition only; elsewhere they would fall back to
   the planner). Used by the setup screen, the online room and the server (worker.js addAI, start). */
const AI_COURSES=['first'];
function aiCourseOK(id){return AI_COURSES.includes(id);}
// and only in 3- and 4-player games: the network was never trained on 2-player games (different rules)
function aiAllowed(id,n){return aiCourseOK(id)&&n>=3;}
function aiNetDecode(bin){
  const u8=bin instanceof Uint8Array?bin:new Uint8Array(bin),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  const hl=dv.getUint32(0,true),H=JSON.parse(new TextDecoder().decode(u8.subarray(4,4+hl)));
  let o=4+hl+((4+hl)&1);const N={course:H.course,nf:H.nf,unsettled:H.unsettled,name:H.name,leak:H.leak??.01}; // leak: the network's leaky-ReLU slope (older files: 0.01)
  const half=h=>{const s=h&0x8000?-1:1,e=(h>>10)&31,m=h&1023;return e===0?s*m*2**-24:e===31?(m?NaN:s*Infinity):s*(1+m/1024)*2**(e-15);};
  const tab=new Float32Array(65536);for(let i=0;i<65536;i++)tab[i]=half(i);
  for(const[k,n]of H.parts){const a=new Float32Array(n);for(let i=0;i<n;i++,o+=2)a[i]=tab[dv.getUint16(o,true)];N[k]=a;}
  return N;
}
function aiSetNet(n){BOT_NET=n;}
const aiNetFits=()=>botNetReady();
/* one decision for the AI in seat S.cur. mem: per-game object ({}) that keeps the turn planner's cache between calls.
   Returns a legal action (falls back to ending the turn). */
function aiChoose(id,mem){
  const A=aiById(id);mem=mem||{};
  let opts=A?A.opts:{mode:'plan'};if(opts.mode==='net'&&(!botNetReady()||S.players.length===2))opts={mode:'plan'}; // network missing, trained for another course, or a 2-player game (never trained on those: it mostly failed to arrive)
  const me=S.cur,tk=me+':'+S.round;if(mem.tk!==tk){mem.tk=tk;mem.n=0;}
  if(++mem.n>60)return S.turn.pending?{t:'trash',cards:[]}:{t:'end',keep:[]}; // never loop inside a turn
  const r0=RNG;setRng(null);BOT_PLAN_CACHE=mem.plan||null;
  let a=null;try{a=botChoose(opts).a;}finally{mem.plan=BOT_PLAN_CACHE;BOT_PLAN_CACHE=null;RNG=r0;}
  return aiFinishGuard(a||(S.turn.pending?{t:'trash',cards:[]}:{t:'end',keep:[]}));
}
/* El Dorado can only be entered with a card of its symbol (paddle on the water side, machete on the jungle side) or a joker.
   The bot sometimes trashes its last such card (or nearly its whole deck) and, near the end, stops buying, so it could wait forever next to the finish
   (seen on the newer courses). Keep one such card when trashing, and buy one before ending a turn without any. */
const aiFinishCard=t=>{const d=CT[t];return!!d&&d.c!=='p'&&(d.s===MAP.endSym||d.s==='*');};
function aiFinishGuard(a){
  const P=S.players[S.cur],all=[...P.deck,...P.hand,...P.discard,...P.play],n=all.filter(id=>aiFinishCard(S.cards[id])).length;
  if(a.t==='trash'&&a.cards){let c=a.cards;
    if(n){const out=c.filter(id=>aiFinishCard(S.cards[id]));if(out.length>=n)c=c.filter(id=>id!==out[0]);}
    c=c.slice(0,Math.max(0,all.length-4)); // and never thin the deck below 4 cards (owner: 4 can be valid, fewer can't)
    if(c.length!==a.cards.length)return{...a,cards:c};}
  if(a.t==='end'&&!n&&!S.turn.bought&&!S.turn.pending){
    const buys=botActions().filter(b=>b.t==='buy'&&aiFinishCard(b.type));
    if(buys.length){buys.sort((x,y)=>x.cards.length-y.cards.length);return buys[0];}
  }
  return a;
}
/* apply the AI's decision (recorded in rec, the game's log; may be null); if it is somehow illegal, end the turn instead. Returns applyAction's result. */
function aiStep(id,mem,rec){
  const me=S.cur,a=aiChoose(id,mem);let r=recApply(rec,me,a);
  if(!r.ok)r=recApply(rec,me,{t:'timeout'});
  return r;
}

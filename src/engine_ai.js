/* =========================================================
   NAMED AI PLAYERS — thin layer over the bot (engine_bot.js), shared by local games (browser)
   and online rooms (the Room Durable Object runs them server-side).
   Doesn't change how the bot decides; it only picks the bot's settings per AI and keeps the
   whole-turn planner's cache per game (the cache is module-global and a server isolate runs many rooms).
   ========================================================= */
/* rating: the calibrated starting rating (tools/ai/calibrate_ais.mjs: AI-vs-AI games, Raleigh anchored at 1200 = a new player);
   the server applies it once (worker.js ensureSchema). */
const AIS=[
  {id:'humboldt',name:'Humboldt',tier:'Master',rating:1530,desc:'Neural network that plans each whole turn',opts:{mode:'net',search:{kind:'plan',beam:3}}},
  {id:'orellana',name:'Orellana',tier:'Strong',rating:1483,desc:'Neural network, one move at a time',opts:{mode:'net'}},
  {id:'raleigh',name:'Raleigh',tier:'Steady',rating:1200,desc:'Hand-written route planner',opts:{mode:'plan'}},
];
const aiById=id=>AIS.find(a=>a.id===id)||null;
const aiUsesNet=id=>{const a=aiById(id);return!!(a&&a.opts.mode==='net');};
/* the shipped network: see tools/ai/pack.mjs for the format (half floats) */
function aiNetDecode(bin){
  const u8=bin instanceof Uint8Array?bin:new Uint8Array(bin),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  const hl=dv.getUint32(0,true),H=JSON.parse(new TextDecoder().decode(u8.subarray(4,4+hl)));
  let o=4+hl+((4+hl)&1);const N={course:H.course,nf:H.nf,unsettled:H.unsettled,name:H.name};
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
  const A=aiById(id)||AIS[AIS.length-1];mem=mem||{};
  let opts=A.opts;if(opts.mode==='net'&&!botNetReady())opts={mode:'plan'}; // network missing or trained for another course
  const me=S.cur,tk=me+':'+S.round;if(mem.tk!==tk){mem.tk=tk;mem.n=0;}
  if(++mem.n>60)return S.turn.pending?{t:'trash',cards:[]}:{t:'end',keep:[]}; // never loop inside a turn
  const r0=RNG;setRng(null);BOT_PLAN_CACHE=mem.plan||null;
  let a=null;try{a=botChoose(opts).a;}finally{mem.plan=BOT_PLAN_CACHE;BOT_PLAN_CACHE=null;RNG=r0;}
  return a||(S.turn.pending?{t:'trash',cards:[]}:{t:'end',keep:[]});
}
/* apply the AI's decision; if it is somehow illegal, end the turn instead. Returns applyAction's result. */
function aiStep(id,mem){
  const me=S.cur,a=aiChoose(id,mem);let r=applyAction(me,a);
  if(!r.ok){if(S.turn.pending)applyAction(me,{t:'trash',cards:[]});S.turn.active=null;r=applyAction(me,{t:'end',keep:[]});}
  return r;
}

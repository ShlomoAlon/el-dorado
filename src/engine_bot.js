/* =========================================================
   BOT — plays through the same applyAction as a human. Runs anywhere the engine runs
   (browser for local games; Node for training). Never sees hidden information it
   shouldn't: its own draw pile is re-shuffled before every look-ahead, and opponents
   are judged only by public facts (position, blockades, the cards they own).

   Decision = greedy over "afterstates": list every legal atomic action, apply each to
   a copy of the state, score the result with value(), take the best. value() is either
   the hand-written heuristic or a small neural net trained by self-play (TD-Gammon style).
   ========================================================= */
const BOT_TYPES=Object.keys(CT);
/* ---- static distances to El Dorado, per map (cost = sum of space values along the way) ---- */
function botDist(){
  if(MAP._bd)return MAP._bd;
  const cost=new Map(),steps=new Map(),next=new Map(),pq=[];
  for(const g of MAP.goals){cost.set(g,0);steps.set(g,0);pq.push([0,g]);}
  while(pq.length){let bi=0;for(let i=1;i<pq.length;i++)if(pq[i][0]<pq[bi][0])bi=i;const[d,u]=pq.splice(bi,1)[0];if(d>cost.get(u))continue;
    const hu=hexAt(u);if(hu.type==='s')continue;           // start spaces can't be entered, so nothing routes through them
    const enter=hu.type==='g'?1:hu.val;                     // cost of stepping onto u
    for(const n of neighbors(u)){const h=hexAt(n);if(h.type==='m'||h.type==='g')continue;
      const nd=d+enter;if(!cost.has(n)||nd<cost.get(n)){cost.set(n,nd);steps.set(n,steps.get(u)+1);next.set(n,u);pq.push([nd,n]);}}}
  const mix=new Map(); // terrain still ahead on the cheapest route, per type (tells the bot what to buy)
  for(const k of cost.keys()){const m={j:0,w:0,v:0,r:0,c:0};let x=next.get(k),guard=0;
    while(x&&guard++<200){const h=hexAt(x);if(h.type==='g'){m[h.sym]+=1;break;}if(m[h.type]!=null)m[h.type]+=h.val;x=next.get(x);}mix.set(k,m);}
  MAP._bd={cost,steps,mix};return MAP._bd;
}
const botCost=k=>k==='done'?0:(botDist().cost.get(k)??60);
/* ---- legal atomic actions for the player to move (deduplicated by card type) ---- */
function botWorth(t){const d=CT[t];if(!d)return 0;if(d.c==='p')return t==='native'?3:t==='transmitter'?3.5:2.5;return d.p*(d.c==='x'?1.25:1)+(d.once?-.5:0);}
function botActions(){
  const seat=S.cur,P=S.players[seat],T=S.turn,out=[];
  if(T.pending){const hand=P.hand.slice().sort((a,b)=>botWorth(typeOf(a))-botWorth(typeOf(b)));out.push({t:'trash',cards:[]});
    for(let k=1;k<=Math.min(T.pending.max,hand.length);k++)out.push({t:'trash',cards:hand.slice(0,k)});
    // also: remove only starting cards
    return out;}
  const seen=new Set(),uniq=ids=>ids.filter(id=>{const t=typeOf(id);if(seen.has(t))return false;seen.add(t);return true;});
  const hand=uniq(P.hand.slice());seen.clear();
  P.pieces.forEach((pk,pi)=>{if(pk==='done')return;
    if(T.active&&T.active.pi===pi)for(const[k]of reach(seat,pi,[T.active.sym],T.active.left))out.push({t:'move',card:T.active.id,pi,to:k});
    for(const id of hand){const d=def(id),t=typeOf(id);
      if(t==='native'){for(const[k]of nativeTargets(seat,pi))out.push({t:'native',card:id,pi,to:k});continue;}
      if(d.c==='p')continue;
      for(const[k]of reach(seat,pi,d.s==='*'?['j','w','v']:[d.s],d.p))out.push({t:'move',card:id,pi,to:k});}
    for(const[k,tg]of payTargets(seat,pi)){const cards=P.hand.slice().sort((a,b)=>botWorth(typeOf(a))-botWorth(typeOf(b))).slice(0,tg.need);out.push({t:'pay',pi,to:k,cards});}
  });
  for(const id of hand){const t=typeOf(id);if(['cartographer','compass','scientist','travellog'].includes(t))out.push({t:'action',card:id});}
  const open=S.market.some(s=>s.n===0);
  const tr=hand.find(id=>typeOf(id)==='transmitter');
  if(tr){S.market.forEach((s,i)=>{if(s.n>0)out.push({t:'transmit',card:tr,src:'m',idx:i});});S.reserve.forEach((s,i)=>{if(s.n>0)out.push({t:'transmit',card:tr,src:'r',idx:i});});}
  if(!T.bought){
    const cash=P.hand.reduce((a,id)=>a+coinVal(id),0);
    const pay=cost=>{ // coin cards first (largest), then the weakest others; drop what isn't needed
      const coins=P.hand.filter(id=>'yx'.includes(def(id).c)).sort((a,b)=>coinVal(b)-coinVal(a)),rest=P.hand.filter(id=>!'yx'.includes(def(id).c)).sort((a,b)=>botWorth(typeOf(a))-botWorth(typeOf(b)));
      const pick=[];let tot=0;for(const id of[...coins,...rest]){if(tot>=cost)break;pick.push(id);tot+=coinVal(id);}
      if(tot<cost)return null;for(let i=pick.length-1;i>=0;i--){if(tot-coinVal(pick[i])>=cost){tot-=coinVal(pick[i]);pick.splice(i,1);}}return pick;};
    const tryStack=(src,s,i)=>{if(s.n<=0||CT[s.t].cost>cash)return;const cards=pay(CT[s.t].cost);if(cards)out.push({t:'buy',src,idx:i,cards});};
    S.market.forEach((s,i)=>tryStack('m',s,i));if(open)S.reserve.forEach((s,i)=>tryStack('r',s,i));
  }
  // end turn: discard all, or keep one / two of the best cards
  out.push({t:'end',keep:[]});
  const byWorth=P.hand.slice().sort((a,b)=>botWorth(typeOf(b))-botWorth(typeOf(a)));
  if(byWorth.length>=1)out.push({t:'end',keep:[byWorth[0]]});
  if(byWorth.length>=2)out.push({t:'end',keep:byWorth.slice(0,2)});
  return out;
}
/* ---- features: everything a player can see at a glance, from `me`'s point of view ----
   No history-based deductions. Hidden: my draw-pile ORDER, opponents' hands vs. draw piles
   (but all the cards they own and their discard piles are public). The map is encoded along
   the "steps to El Dorado" axis, so the same inputs work on any course. */
const BOT_BINS=16,BOT_BW=3,BOT_NT=BOT_TYPES.length;
const BOT_NF=16*9+14+BOT_NT*4+12+3*(BOT_NT*2+8)+BOT_NT*2+2+6*9+4;
function botCounts(ids){const c=new Float32Array(BOT_NT);for(const id of ids){const k=BOT_TYPES.indexOf(S.cards[id]);if(k>=0)c[k]++;}return c;}
function botFeatures(me){
  const f=new Float32Array(BOT_NF);let i=0;const put=(v)=>{f[i++]=v;},putArr=(a,sc)=>{for(const x of a)f[i++]=x*sc;};
  const P=S.players[me],myTurn=S.cur===me&&!S.over,bd=botDist(),n=S.players.length;
  const stepsOf=k=>k==='done'?0:(bd.steps.get(k)??48);
  // 1. the map, binned by steps to El Dorado: width, terrain mix, difficulty, crowding, blockades
  const bins=Array.from({length:BOT_BINS},()=>new Float32Array(9));
  const occ=new Set();S.players.forEach(p=>p.pieces.forEach(k=>{if(k!=='done')occ.add(k);}));
  for(const[k,st]of bd.steps){const h=hexAt(k);if(h.type==='g'||h.type==='s')continue;const b=bins[Math.min(BOT_BINS-1,Math.floor(st/BOT_BW))];
    b[0]++;const t='jwvrc'.indexOf(h.type);if(t>=0)b[1+t]++;b[6]+=h.val;if(occ.has(k))b[7]++;}
  S.blockades.forEach(B=>{if(B.owner!==null)return;const e=MAP.conns[B.conn].edges[0];const st=Math.min(stepsOf(e[0]),stepsOf(e[1]));bins[Math.min(BOT_BINS-1,Math.floor(st/BOT_BW))][8]+=B.v;});
  for(const b of bins){const c=b[0]||1;put(b[0]/10);for(let t=1;t<=5;t++)put(b[t]/c);put(b[6]/c/3);put(b[7]/2);put(b[8]/2);}
  // 2. me: where I am and what's ahead
  const pieceCost=p=>p.pieces.reduce((a,k)=>a+botCost(k),0)/p.pieces.length,pieceSteps=p=>p.pieces.reduce((a,k)=>a+stepsOf(k),0)/p.pieces.length;
  const myCost=pieceCost(P);put(myCost/40);put(pieceSteps(P)/40);put(Math.min(...P.pieces.map(stepsOf))/40);put(playerDone(P)?1:0);put(P.blocks.length/3);
  const mix={j:0,w:0,v:0,r:0,c:0};for(const k of P.pieces){if(k==='done')continue;const m=bd.mix.get(k);if(m)for(const s in mix)mix[s]+=m[s];}
  for(const s of'jwvrc')put(mix[s]/P.pieces.length/20);
  put(me===S.cur?1:0);put(((me-S.start+n)%n)/3);put(S.turn&&S.cur===me&&S.turn.bought?1:0);put(n===2?1:0);
  // 3. my cards: hand (only meaningful on my turn), draw pile, discard, in play
  putArr(myTurn?botCounts(P.hand):new Float32Array(BOT_NT),1/3);putArr(botCounts(P.deck),1/4);putArr(botCounts(P.discard),1/4);putArr(botCounts(P.play),1/3);
  // 4. this turn: leftover strength, pending removal, what the hand could still do
  if(myTurn){const a=S.turn.active;put(a?a.left/4:0);for(const s of'jwv')put(a&&a.sym===s?1:0);put(S.turn.pending?S.turn.pending.max/2:0);
    let coins=0;for(const id of P.hand)coins+=coinVal(id);put(coins/6);put(P.hand.length/6);put(P.hand.filter(id=>def(id).c==='p').length/2);
    let bestRed=0,sumRed=0;
    for(const id of P.hand){const d=def(id);if(d.c==='p')continue;let r=0;P.pieces.forEach((pk,pi)=>{if(pk==='done')return;const base=botCost(pk);for(const[k]of reach(me,pi,d.s==='*'?['j','w','v']:[d.s],d.p)){if(k[0]!=='B')r=Math.max(r,base-botCost(k));}});bestRed=Math.max(bestRed,r);sumRed+=r;}
    if(a){const pk=P.pieces[a.pi];if(pk!=='done'){const base=botCost(pk);for(const[k]of reach(me,a.pi,[a.sym],a.left))if(k[0]!=='B'){const r=base-botCost(k);bestRed=Math.max(bestRed,r);sumRed+=r;}}}
    put(bestRed/8);put(sumRed/12);put(myCost>0?Math.min(1,sumRed/myCost):1);put(1);
  }else i+=12;
  // 5. opponents in turn order after me: all cards they own, their discard pile, position, blockades
  for(let k=1;k<=3;k++){const j=(me+k)%n;const p=k<n?S.players[j]:null;if(!p){i+=BOT_NT*2+8;continue;}
    putArr(botCounts([...p.deck,...p.hand,...p.discard,...p.play]),1/4);putArr(botCounts(p.discard),1/4);
    put(pieceCost(p)/40);put(pieceSteps(p)/40);put(playerDone(p)?1:0);put(p.resigned?1:0);put(p.blocks.length/3);put(p.hand.length/6);put(j===S.cur?1:0);put((pieceCost(p)-myCost)/20);}
  // 6. market and reserve (cards left of each type) + reserve open
  const mk=new Float32Array(BOT_NT),rs=new Float32Array(BOT_NT);S.market.forEach(s=>{mk[BOT_TYPES.indexOf(s.t)]+=s.n;});S.reserve.forEach(s=>{rs[BOT_TYPES.indexOf(s.t)]+=s.n;});
  putArr(mk,1/3);putArr(rs,1/3);put(S.market.some(s=>s.n===0)?1:0);put(S.market.filter(s=>s.n>0).length/6);
  // 7. blockades #1–6: on the board / mine / someone else's, cost, where, type
  for(let num=1;num<=6;num++){const bi=S.blockades.findIndex(B=>B.n===num);if(bi<0){i+=9;continue;}const B=S.blockades[bi];
    const e=MAP.conns[B.conn].edges[0];put(B.owner===null?1:0);put(B.owner===me?1:0);put(B.owner!==null&&B.owner!==me?1:0);put(B.v/2);put(Math.min(stepsOf(e[0]),stepsOf(e[1]))/40);
    for(const s of'jwvr')put(B.k===s?1:0);}
  // 8. game clock
  put(S.round/40);put((n-2)/2);put(S.endTriggered?1:0);put(S.players.filter(p=>playerDone(p)).length/3);
  if(i!==BOT_NF)throw new Error('bot features: wrote '+i+' of '+BOT_NF);
  return f;
}
/* ---- values ---- */
function botHeuristic(me){ // hand-tuned: be close to the goal, own a strong deck, use this turn's cards well
  const P=S.players[me];if(playerDone(P))return 100-P.fin;
  const own=[...P.deck,...P.hand,...P.discard,...P.play],tot=own.length||1;let pw=0;
  for(const id of own){const d=CT[S.cards[id]];if(d.c!=='p')pw+=d.p*(d.c==='x'?1.2:1);else pw+=1.2;}
  let v=-P.pieces.reduce((a,k)=>a+botCost(k),0)/P.pieces.length;
  v+=pw/tot*9-Math.max(0,tot-12)*.35+P.blocks.length*1.5;
  if(S.cur===me&&!S.over){let sumRed=0;
    for(const id of P.hand){const d=def(id);if(d.c==='p')continue;let r=0;P.pieces.forEach((pk,pi)=>{if(pk==='done')return;const base=botCost(pk);for(const[k]of reach(me,pi,d.s==='*'?['j','w','v']:[d.s],d.p))if(k[0]!=='B')r=Math.max(r,base-botCost(k));});sumRed+=r;}
    const a=S.turn.active;if(a&&P.pieces[a.pi]!=='done'){const base=botCost(P.pieces[a.pi]);let r=0;for(const[k]of reach(me,a.pi,[a.sym],a.left))if(k[0]!=='B')r=Math.max(r,base-botCost(k));sumRed+=r;}
    v+=sumRed*.95;}
  return v;
}
let BOT_NET=null; // {w1,b1,w2,b2,w3,b3,h1,h2}
function botNetValue(f){const N=BOT_NET;const h1=new Float32Array(N.h1),h2=new Float32Array(N.h2);
  for(let j=0;j<N.h1;j++){let s=N.b1[j];const o=j*BOT_NF;for(let k=0;k<BOT_NF;k++)s+=N.w1[o+k]*f[k];h1[j]=s>0?s:.01*s;}
  for(let j=0;j<N.h2;j++){let s=N.b2[j];const o=j*N.h1;for(let k=0;k<N.h1;k++)s+=N.w2[o+k]*h1[k];h2[j]=s>0?s:.01*s;}
  let s=N.b3[0];for(let k=0;k<N.h2;k++)s+=N.w3[k]*h2[k];return 1/(1+Math.exp(-s));}
function botValue(me,mode){
  if(S.over){const pl=S.places[me],n=S.players.length;return mode==='net'?(n-pl)/(n-1):1e3-pl*100;}
  return mode==='net'&&BOT_NET?botNetValue(botFeatures(me)):botHeuristic(me);
}
/* ---- choose and play ---- */
function botClone(st){const c=JSON.parse(JSON.stringify(st));c.log=[];return c;}
function botChoose(opts){
  opts=opts||{};const mode=opts.mode||(BOT_NET?'net':'heur'),eps=opts.eps||0,rnd=opts.rnd||Math.random;
  const me=S.cur,acts=botActions(),root=S;
  if(eps&&rnd()<eps)return{a:acts[Math.floor(rnd()*acts.length)],feat:null};
  let best=null,bv=-Infinity,bf=null;
  for(const a of acts){
    S=botClone(root);shuffle(S.players[me].deck,rnd); // don't peek at the real draw order
    const r=applyAction(me,a);
    if(r.ok){const v=botValue(me,mode)+(opts.noise?(rnd()-.5)*opts.noise:0);if(v>bv){bv=v;best=a;bf=opts.wantFeat?(S.over?null:botFeatures(me)):null;}}
    S=root;
  }
  return{a:best||{t:'end',keep:[]},v:bv,feat:bf};
}
/* play one whole turn for the player to move (used by the UI and the simulator) */
function botTurn(opts){const me=S.cur;const steps=[];for(let g=0;g<40&&!S.over&&S.cur===me;g++){const{a}=botChoose(opts);const r=applyAction(me,a);steps.push(a);if(!r.ok){applyAction(me,{t:'end',keep:[]});break;}}return steps;}

/* ---- random courses for training (so the bot learns to play, not to memorise one map) ----
   Boards chained edge to edge, never touching non-neighbours; random sides and rotations;
   start board rotated so its start row faces away from the route; El Dorado on the far edge. */
function botRandomCourse(seed,nMid){
  const rnd=mulberry32(seed),TV=[[7,-3],[3,4],[-4,7],[-7,3],[-3,-4],[4,-7]],pairs=[['C','D'],['E','F'],['G','H'],['I','J'],['K','L'],['M','N']];
  for(let attempt=0;attempt<400;attempt++){
    const cs=[[0,0]];let ok=true,dir=Math.floor(rnd()*6);
    for(let b=0;b<nMid;b++){let placed=false;
      for(const dd of shuffle([0,1,-1,0,1,-1,2,-2],rnd)){const d=(dir+dd+6)%6,L=cs[cs.length-1],c=[L[0]+TV[d][0],L[1]+TV[d][1]];
        if(cs.some((p,j)=>(p[0]===c[0]&&p[1]===c[1])||(j<cs.length-1&&TV.some(v=>p[0]+v[0]===c[0]&&p[1]+v[1]===c[1]))))continue;
        cs.push(c);dir=d;placed=true;break;}
      if(!placed){ok=false;break;}}
    if(!ok)continue;
    const mids=shuffle(pairs.slice(),rnd).slice(0,nMid).map(p=>p[rnd()<.5?0:1]);
    const start=rnd()<.5?'A':'B';
    // start rotation: start row as far as possible from the next board
    let bestK=0,bestD=-1;const nx=pxOf(cs[1][0],cs[1][1]);
    for(let k=0;k<6;k++){const pts=TPL[start].filter(c=>c.d.type==='s').map(c=>rot(c.q,c.r,k));const m=pts.reduce((a,[q,r])=>{const[x,y]=pxOf(q,r);return a+Math.hypot(x-nx[0],y-nx[1]);},0);if(m>bestD){bestD=m;bestK=k;}}
    const p=[[start,0,0,bestK],...mids.map((L,j)=>[L,cs[j+1][0],cs[j+1][1],Math.floor(rnd()*6)])];
    // El Dorado: try spaces just beyond the last board, farthest from the previous one first
    const last=cs[cs.length-1],prev=cs[cs.length-2],cand=[];
    for(let dq=-4;dq<=4;dq++)for(let dr=-4;dr<=4;dr++){const q=last[0]+dq,r=last[1]+dr,dist=(Math.abs(dq)+Math.abs(dr)+Math.abs(dq+dr))/2;if(dist!==4)continue;
      const[x,y]=pxOf(q,r),[px,py]=pxOf(prev[0],prev[1]);cand.push([q,r,Math.hypot(x-px,y-py)]);}
    cand.sort((a,b)=>b[2]-a[2]);
    for(const[q,r]of cand.slice(0,8)){const C={id:'rnd'+seed,name:'Random '+seed,p,e:[q,r],s:rnd()<.5?'j':'w'};try{buildCourse(C,1);return C;}catch(e){}}
  }
  return null;
}

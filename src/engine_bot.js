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
  const near=new Map(); // the same, only for the next ~10 cost ahead (what the next few hands must handle)
  for(const k of cost.keys()){const m={j:0,w:0,v:0,r:0,c:0},m2={j:0,w:0,v:0,r:0,c:0};let x=next.get(k),guard=0,acc=0;
    while(x&&guard++<200){const h=hexAt(x);if(h.type==='g'){m[h.sym]+=1;if(acc<10)m2[h.sym]+=1;break;}if(m[h.type]!=null){m[h.type]+=h.val;if(acc<10)m2[h.type]+=h.val;}acc+=h.val||1;x=next.get(x);}mix.set(k,m);near.set(k,m2);}
  MAP._bd={cost,steps,mix,near};return MAP._bd;
}
const botCost=k=>k==='done'?0:(botDist().cost.get(k)??60);
function botRemaining(pl){const p=S.players[pl];return p.pieces.reduce((a,k)=>a+botCost(k),0)/p.pieces.length;} // route cost still ahead
/* ---- legal atomic actions for the player to move (deduplicated by card type) ---- */
function botWorth(t){const d=CT[t];if(!d)return 0;if(d.c==='p')return t==='native'?3:t==='transmitter'?3.5:2.5;return d.p*(d.c==='x'?1.25:1)+(d.once?-.5:0);}
/* every distinct subset (by card types) of `ids` with exactly k cards */
function botCombos(ids,k){const out=[],seen=new Set(),cur=[];
  const rec=i=>{if(cur.length===k){const sig=cur.map(typeOf).sort().join();if(!seen.has(sig)){seen.add(sig);out.push(cur.slice());}return;}
    for(let j=i;j<ids.length;j++){cur.push(ids[j]);rec(j+1);cur.pop();}};rec(0);return out;}
function botActions(){
  const seat=S.cur,P=S.players[seat],T=S.turn,out=[];
  // Scientist / Travel Log: remove nothing, or any distinct choice of up to `max` cards
  if(T.pending){for(let k=0;k<=Math.min(T.pending.max,P.hand.length);k++)for(const c of botCombos(P.hand,k))out.push({t:'trash',cards:c});return out;}
  const seen=new Set(),hand=P.hand.filter(id=>{const t=typeOf(id);if(seen.has(t))return false;seen.add(t);return true;}); // one of each type
  P.pieces.forEach((pk,pi)=>{if(pk==='done')return;
    if(T.active&&T.active.pi===pi)for(const[k]of reach(seat,pi,[T.active.sym],T.active.left))out.push({t:'move',card:T.active.id,pi,to:k});
    for(const id of hand){const d=def(id),t=typeOf(id);
      if(t==='native'){for(const[k]of nativeTargets(seat,pi))out.push({t:'native',card:id,pi,to:k});continue;}
      if(d.c==='p')continue;
      for(const[k]of reach(seat,pi,d.s==='*'?['j','w','v']:[d.s],d.p))out.push({t:'move',card:id,pi,to:k});}
    // rubble / base camp / rubble blockade: every distinct choice of cards to give up
    for(const[k,tg]of payTargets(seat,pi))for(const c of botCombos(P.hand,tg.need))out.push({t:'pay',pi,to:k,cards:c});
  });
  for(const id of hand){const t=typeOf(id);if(['cartographer','compass','scientist','travellog'].includes(t))out.push({t:'action',card:id});}
  const open=S.market.some(s=>s.n===0);
  const tr=hand.find(id=>typeOf(id)==='transmitter');
  if(tr){S.market.forEach((s,i)=>{if(s.n>0)out.push({t:'transmit',card:tr,src:'m',idx:i});});S.reserve.forEach((s,i)=>{if(s.n>0)out.push({t:'transmit',card:tr,src:'r',idx:i});});}
  if(!T.bought){
    // every minimal way to pay (no card could be left out), distinct by card types
    const cash=P.hand.reduce((a,id)=>a+coinVal(id),0),pays=new Map();
    const payFor=cost=>{if(pays.has(cost))return pays.get(cost);const res=[];
      for(let k=1;k<=P.hand.length&&res.length<8;k++)for(const c of botCombos(P.hand,k)){const tot=c.reduce((a,id)=>a+coinVal(id),0);if(tot>=cost&&c.every(id=>tot-coinVal(id)<cost))res.push(c);}
      pays.set(cost,res);return res;};
    const tryStack=(src,s,i)=>{if(s.n<=0||CT[s.t].cost>cash)return;for(const cards of payFor(CT[s.t].cost))out.push({t:'buy',src,idx:i,cards});};
    S.market.forEach((s,i)=>tryStack('m',s,i));if(open)S.reserve.forEach((s,i)=>tryStack('r',s,i));
  }
  // end turn keeping any distinct choice of 0–3 cards
  for(let k=0;k<=Math.min(3,P.hand.length);k++)for(const c of botCombos(P.hand,k))out.push({t:'end',keep:c});
  return out;
}
/* ---- features: everything a player can see at a glance, from `me`'s point of view ----
   No history-based deductions. Hidden: my draw-pile ORDER, opponents' hands vs. draw piles
   (but all the cards they own and their discard piles are public). The map is encoded along
   the "steps to El Dorado" axis, so the same inputs work on any course. */
const BOT_BINS=16,BOT_BW=3,BOT_NT=BOT_TYPES.length;
const BOT_NF=16*9+14+BOT_NT*4+12+3*(BOT_NT*2+8)+BOT_NT*2+2+6*9+4;
function botCounts(ids){const c=new Float32Array(BOT_NT);for(const id of ids){const k=BOT_TYPES.indexOf(S.cards[id]);if(k>=0)c[k]++;}return c;}
function botFeatures(me,into){ // into: write the summary at the start of this (zeroed) array instead of a new one
  const f=into||new Float32Array(BOT_NF);let i=0;const put=(v)=>{f[i++]=v;},putArr=(a,sc)=>{for(const x of a)f[i++]=x*sc;};
  const P=S.players[me],endView=S._endView===me,myTurn=S.cur===me&&!S.over&&!endView,bd=botDist(),n=S.players.length;
  const stepsOf=k=>k==='done'?0:(bd.steps.get(k)??48);
  // 1. the map, binned by steps to El Dorado: width, terrain mix, difficulty, crowding, blockades
  // the terrain part never changes on a course: computed once per map (same order of additions, so the same values); per call
  // only the occupied spaces and the open blockades are added
  if(!MAP._fb){const st=new Float32Array(BOT_BINS*9),binOf=new Map();
    for(const[k,sv]of bd.steps){const h=hexAt(k);if(h.type==='g'||h.type==='s')continue;const bi=Math.min(BOT_BINS-1,Math.floor(sv/BOT_BW)),o=bi*9;binOf.set(k,bi);
      st[o]++;const t='jwvrc'.indexOf(h.type);if(t>=0)st[o+1+t]++;st[o+6]+=h.val;}
    MAP._fb={st,binOf,b:new Float32Array(BOT_BINS*9)};}
  const FB=MAP._fb,bins=FB.b;bins.set(FB.st);const seen=[];
  for(const p of S.players)for(const k of p.pieces){if(k==='done'||seen.includes(k))continue;seen.push(k);const bi=FB.binOf.get(k);if(bi!=null)bins[bi*9+7]++;}
  S.blockades.forEach(B=>{if(B.owner!==null)return;const e=MAP.conns[B.conn].edges[0];const st=Math.min(stepsOf(e[0]),stepsOf(e[1]));bins[Math.min(BOT_BINS-1,Math.floor(st/BOT_BW))*9+8]+=B.v;});
  for(let o=0;o<BOT_BINS*9;o+=9){const c=bins[o]||1;put(bins[o]/10);for(let t=1;t<=5;t++)put(bins[o+t]/c);put(bins[o+6]/c/3);put(bins[o+7]/2);put(bins[o+8]/2);}
  // 2. me: where I am and what's ahead
  const pieceCost=p=>p.pieces.reduce((a,k)=>a+botCost(k),0)/p.pieces.length,pieceSteps=p=>p.pieces.reduce((a,k)=>a+stepsOf(k),0)/p.pieces.length;
  const myCost=pieceCost(P);put(myCost/40);put(pieceSteps(P)/40);put(Math.min(...P.pieces.map(stepsOf))/40);put(playerDone(P)?1:0);put(P.blocks.length/3);
  const mix={j:0,w:0,v:0,r:0,c:0};for(const k of P.pieces){if(k==='done')continue;const m=bd.mix.get(k);if(m)for(const s in mix)mix[s]+=m[s];}
  for(const s of'jwvrc')put(mix[s]/P.pieces.length/20);
  put(myTurn?1:0);put(((me-S.start+n)%n)/3);put(S.turn&&S.cur===me&&S.turn.bought?1:0);put(n===2?1:0);
  // 3. my cards: hand (only meaningful on my turn), draw pile, discard, in play
  // hand: my cards on my turn; in the end-of-turn view, the cards I kept
  putArr(myTurn||endView?botCounts(P.hand):new Float32Array(BOT_NT),1/3);putArr(botCounts(P.deck),1/4);putArr(botCounts(P.discard),1/4);putArr(botCounts(P.play),1/3);
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
  if(S.cur===me&&!S.over&&S._endView!==me){let sumRed=0;
    for(const id of P.hand){const d=def(id);if(d.c==='p')continue;let r=0;P.pieces.forEach((pk,pi)=>{if(pk==='done')return;const base=botCost(pk);for(const[k]of reach(me,pi,d.s==='*'?['j','w','v']:[d.s],d.p))if(k[0]!=='B')r=Math.max(r,base-botCost(k));});sumRed+=r;}
    const a=S.turn.active;if(a&&P.pieces[a.pi]!=='done'){const base=botCost(P.pieces[a.pi]);let r=0;for(const[k]of reach(me,a.pi,[a.sym],a.left))if(k[0]!=='B')r=Math.max(r,base-botCost(k));sumRed+=r;}
    v+=sumRed*.95;}
  return v;
}
/* Heuristic 2 (candidate benchmark): minimise the estimated number of turns still needed.
   speed = how much of the route ahead one card covers on average, given the terrain mix ahead
   (a card covers its strength on matching terrain, jokers match anything, any card pays 1 of rubble / base camp);
   turns left = (route still ahead − what this turn's hand can still cover) / (4 cards × speed). */
const BOT_ACT_SPEED={cartographer:1,compass:1.6,travellog:.9,scientist:.6,native:1.4,transmitter:.4};
function botHeuristic2(me){
  const P=S.players[me];if(playerDone(P))return 100-P.fin;
  const bd=botDist(),live=P.pieces.filter(k=>k!=='done'),cost=P.pieces.reduce((a,k)=>a+botCost(k),0)/P.pieces.length;
  const m={j:0,w:0,v:0,r:0,c:0};for(const k of live){const x=bd.mix.get(k);if(x)for(const s in m)m[s]+=x[s]/live.length;}
  const mt=m.j+m.w+m.v+m.r+m.c||1,own=[...P.deck,...P.hand,...P.discard,...P.play],tot=own.length||1;
  let move=0,acts=0;
  for(const id of own){const d=CT[S.cards[id]];
    if(d.c==='p'){acts+=BOT_ACT_SPEED[S.cards[id]]||.5;continue;}
    for(const s of'jwv')if(d.s===s||d.s==='*')move+=d.p*m[s]/mt;
    move+=(m.r+m.c)/mt;}
  const base=move/Math.max(1,tot-0),speed=Math.max(.3,base+acts/tot*base); // action cards stand in for extra cards
  let handRed=0;
  if(S.cur===me&&!S.over&&S._endView!==me){
    for(const id of P.hand){const d=def(id);if(d.c==='p')continue;let r=0;P.pieces.forEach((pk,pi)=>{if(pk==='done')return;const b=botCost(pk);for(const[k]of reach(me,pi,d.s==='*'?['j','w','v']:[d.s],d.p))if(k[0]!=='B')r=Math.max(r,b-botCost(k));});handRed+=r;}
    const a=S.turn.active;if(a&&P.pieces[a.pi]!=='done'){const b=botCost(P.pieces[a.pi]);let r=0;for(const[k]of reach(me,a.pi,[a.sym],a.left))if(k[0]!=='B')r=Math.max(r,b-botCost(k));handRed+=r;}}
  const turns=Math.max(0,cost-handRed*.9)/(4*speed);
  return -turns*10+P.blocks.length*.3;
}
/* Planner heuristic (candidate benchmark, mode 'plan'): search this turn's movement exactly, then buy.
   1. draw cards first (Scientist / Travel Log remove weak starting cards);
   2. depth-first search over every order of moves / leftover strength / rubble / base camps / Native, keeping the
      end position with the least route left (ties: more coin value left for buying);
   3. buy the most useful affordable card for the terrain still ahead; stop buying when close to the end. */
const BOT_STARTER={explorer:1,traveler:1,sailor:1};
/* planner knobs; 'plan' is the committed benchmark, other entries are candidates tried head-to-head (tools/ai/h2h.mjs) */
const BOT_PLANS={plan:{}};let BOT_PLAN_CUR=null;
const BOT_PLAN_DEF={near:0,blockAhead:0,guard:0,buyStop:7,buyMin:2,costW:.08,keepEnd:0,safeTrash:0,minDeck:0,blockW:0,transStop:7};BOT_PLAN_CUR=BOT_PLAN_DEF;
function botPlanMoves(me){
  const root=S,P0=root.players[me],memo=new Map();let best=null,nodes=0;
  const O=BOT_PLAN_CUR;
  const score=st=>{const P=st.players[me];const c=P.pieces.reduce((a,k)=>a+(k==='done'?-5:botCost(k)),0);const coin=P.hand.reduce((a,id)=>a+coinVal(id),0);
    // El Dorado can only be entered by paddling: removing my last paddle card (base camp) would strand me for good
    const stranded=P.pieces.some(k=>k!=='done')&&botPaddles(P,st)<1;
    let ahead=0;if(O.blockAhead)for(const B of st.blockades)if(B.owner===null)for(const k of P.pieces)if(k!=='done'&&hexAt(k).tile<=B.conn){ahead+=B.v;break;}
    return -(c+ahead*O.blockAhead)*10+coin+P.blocks.length*O.blockW-(stranded&&O.guard?1e4:0);};
  const dfs=(st,path,depth)=>{
    if(++nodes>4000)return;
    const sc=score(st);if(!best||sc>best.sc)best={sc,path:path.slice()};
    if(depth>=9||st.over||st.cur!==me)return;
    const P=st.players[me],key=P.pieces.join('|')+'#'+P.hand.map(id=>st.cards[id]).sort().join()+'#'+(st.turn.active?st.turn.active.id+st.turn.active.left:'');
    if(memo.has(key)&&memo.get(key)<=depth)return;memo.set(key,depth);
    S=st;const acts=botActions().filter(a=>a.t==='move'||a.t==='native'||a.t==='pay');S=root;
    // per card and explorer keep the 3 targets that get closest (the search stays small)
    const groups=new Map();for(const a of acts){const g=a.t+(a.card||'')+a.pi;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(a);}
    for(const[,list]of groups){
      const ranked=list.map(a=>({a,c:a.to[0]==='B'?-1:botCost(a.to)})).sort((x,y)=>x.c-y.c).slice(0,3);
      for(const{a}of ranked){S=botClone(st);const r=applyAction(me,a);const nx=S;S=root;if(!r.ok)continue;path.push(a);dfs(nx,path,depth+1);path.pop();}
    }
  };
  dfs(botClone(root),[],0);S=root;return best?best.path:[];
}
function botCardWorth(t,me){ // how useful a new card is for the rest of the route
  const P=S.players[me],bd=botDist(),live=P.pieces.filter(k=>k!=='done');const m={j:0,w:0,v:0,r:0,c:0},nw=BOT_PLAN_CUR.near||0;
  for(const k of live){const x=bd.mix.get(k),y=bd.near.get(k);if(x){const tx=x.j+x.w+x.v+1,ty=y.j+y.w+y.v+1;
    for(const s in m)m[s]+=((1-nw)*x[s]/tx+nw*y[s]/ty)*tx/Math.max(1,live.length);}}
  const mt=m.j+m.w+m.v+1,d=CT[t];
  if(d.c==='p')return {cartographer:2.6,native:2.2,compass:2.3,scientist:2.2,travellog:2.2,transmitter:1.5}[t]||1;
  const fit=d.s==='*'?1:(m[d.s]||0)/mt;return d.p*(0.35+fit)+(d.c==='y'?0.6:0);
}
const BOT_PADDLE=t=>{const d=CT[t];return d.c!=='p'&&(d.s==='w'||d.s==='*');};
function botPaddles(P,st){const cs=(st||S).cards;return[...P.deck,...P.hand,...P.discard,...P.play].filter(id=>BOT_PADDLE(cs[id])).length;}
function botPlanChoose(me,O){
  O=BOT_PLAN_CUR={...BOT_PLAN_DEF,...(O||{})};
  const P=S.players[me],T=S.turn;
  if(T.pending){let weak=P.hand.filter(id=>BOT_STARTER[typeOf(id)]).slice(0,T.pending.max);
    if(O.safeTrash){// never trash the last cards that can paddle into El Dorado
      let pad=botPaddles(P);
      weak=weak.filter(id=>{if(BOT_PADDLE(typeOf(id))){if(pad<=O.safeTrash)return false;pad--;}return true;});}
    if(O.minDeck){const all=P.deck.length+P.hand.length+P.discard.length+P.play.length;weak=weak.slice(0,Math.max(0,all-O.minDeck));}
    return{t:'trash',cards:weak}; }
  const draw=P.hand.find(id=>BOT_DRAW[typeOf(id)]);if(draw)return{t:'action',card:draw};
  const moves=botPlanMoves(me);if(moves.length)return moves[0];
  // buy with what's left
  const left=botRemaining(me);
  if(!T.bought&&left>O.buyStop){
    const cash=P.hand.reduce((a,id)=>a+coinVal(id),0),open=S.market.some(s=>s.n===0);let pick=null;
    const consider=(src,s,i)=>{if(s.n<=0||CT[s.t].cost>cash)return;const w=botCardWorth(s.t,me)*(1+CT[s.t].cost*O.costW);if(!pick||w>pick.w)pick={w,src,idx:i};};
    S.market.forEach((s,i)=>consider('m',s,i));if(open)S.reserve.forEach((s,i)=>consider('r',s,i));
    if(pick&&pick.w>O.buyMin){const buys=botActions().filter(a=>a.t==='buy'&&a.src===pick.src&&a.idx===pick.idx);
      if(buys.length){buys.sort((a,b)=>a.cards.length-b.cards.length);return buys[0];}}
  }
  const tr=P.hand.find(id=>typeOf(id)==='transmitter');
  if(tr&&left>O.transStop){let pick=null;const c=(src,s,i)=>{if(s.n<=0)return;const w=botCardWorth(s.t,me)+CT[s.t].cost*.3;if(!pick||w>pick.w)pick={w,src,idx:i};};S.market.forEach((s,i)=>c('m',s,i));S.reserve.forEach((s,i)=>c('r',s,i));if(pick)return{t:'transmit',card:tr,src:pick.src,idx:pick.idx};}
  if(O.keepEnd){// keep unplayed strong cards (not starters) for next turn
    const keep=P.hand.filter(id=>!BOT_STARTER[typeOf(id)]&&CT[typeOf(id)].c!=='p'&&(CT[typeOf(id)].p||0)>=O.keepEnd).slice(0,3);return{t:'end',keep};}
  return{t:'end',keep:[]};
}
/* ---- per-map network input: the summary above + every space on this course + every tile connection ----
   Each space gets 4 slots (my explorer here / opponent 1, 2, 3 here, in turn order after me);
   each connection between tiles gets 8 (which blockade type was dealt there, its cost, owned by nobody / me / an opponent).
   The terrain itself never changes on a given course, so the network learns it per slot. */
function botMapOrder(){if(MAP._bo)return MAP._bo;const keys=[...MAP.hexes.keys()].filter(k=>MAP.hexes.get(k).type!=='m').sort();const idx=new Map(keys.map((k,i)=>[k,i]));MAP._bo={keys,idx};return MAP._bo;}
/* multi-course networks (net.courses = [course ids]): input = the summary (BOT_NF) + BOT_FLAGS rule switches + one board block per
   course in that order; only the current course's block is filled. Single-course networks (net.course) keep the old layout. */
const BOT_FLAGS=4,BOT_BLOCK={};
function botBlockSize(id){if(BOT_BLOCK[id]!=null)return BOT_BLOCK[id];const C=courseById(id);if(!C)return BOT_BLOCK[id]=0;
  const m=MAP&&MAP.course===id?MAP:buildCourse(C,1),keys=[...m.hexes.keys()].filter(k=>m.hexes.get(k).type!=='m');return BOT_BLOCK[id]=keys.length*4+m.conns.length*8;}
const botMulti=()=>!!(BOT_NET&&BOT_NET.courses);
// net.onehot: one input per course (1 = the current course) right after the rule switches, so the network can shift its whole evaluation per map
/* optional extra input groups (net.extra = ['cards', 'patch']), appended after everything above in that order:
   cards: universal card properties summed per pile (cost, strength by colour, coins, draws, removals, single-use, …) so a
          card's value can be inferred from what it is, not only from its name; patch: the 37 spaces within 3 steps of my
          explorer (terrain, strength, occupied, closer to / farther from El Dorado), the same on every course */
const BOT_XF={cards:9*12,patch:37*12},botExtra=()=>(BOT_NET&&BOT_NET.extra)||[],botExtraNF=()=>botExtra().reduce((a,g)=>a+BOT_XF[g],0);
function botNetNF(){if(botMulti())return BOT_NF+BOT_FLAGS+(BOT_NET.onehot?BOT_NET.courses.length:0)+BOT_NET.courses.reduce((a,id)=>a+botBlockSize(id),0)+botExtraNF();return BOT_NF+botMapOrder().keys.length*4+MAP.conns.length*8+botExtraNF();}
const BOT_CP={},BOT_CPS=[1/10,1/20,1/10,1/10,1/10,1/10,1/10,1/5,1/5,1/5,1/5];
// per card type, the 11 properties already scaled (count, cost, green, blue, yellow, joker strength, coins, draws, removals, single-use, action)
function botCardProps(t){if(BOT_CP[t])return BOT_CP[t];const d=CT[t]||{},col=d.c;
  const v=[1,d.cost||0,col==='g'?d.p:0,col==='b'?d.p:0,col==='y'?d.p:0,col==='x'?d.p:0,col==='y'||col==='x'?d.p:.5,
    ({cartographer:2,compass:3,scientist:1,travellog:2})[t]||0,({scientist:1,travellog:2})[t]||0,d.once?1:0,col==='p'?1:0];
  return BOT_CP[t]=Float64Array.from(v,(x,i)=>x*BOT_CPS[i]);}
function botAddIds(f,o,ids){for(let n=0;n<ids.length;n++){const c=botCardProps(S.cards[ids[n]]);for(let i=0;i<11;i++)f[o+i]+=c[i];}}
function botMeanCost(f,o){f[o+11]=f[o]?f[o+1]*10/f[o]/5*0.5:0;} // mean cost per card /5 (count is /10, cost /20)
// per map: for every space, its 37 neighbours within 3 steps (fixed order) with their static values precomputed
function botPatchOf(k){const m=MAP._pt||(MAP._pt=new Map());let r=m.get(k);if(r)return r;const h0=hexAt(k);r=[];
  for(let dq=-3;dq<=3;dq++)for(let dr=-3;dr<=3;dr++){if(Math.abs(dq+dr)>3)continue;const K=key(h0.q+dq,h0.r+dr),h=MAP.hexes.get(K);r.push(h?{K,t:'mjwvrcgs'.indexOf(h.type),v:(h.val||0)/4}:null);}
  m.set(k,r);return r;}
function botExtraFeatures(me,f,o){const P=S.players[me],n=S.players.length;
  for(const g of botExtra()){
    if(g==='cards'){const endView=S._endView===me,myTurn=S.cur===me&&!S.over&&!endView;
      botAddIds(f,o,P.deck);botAddIds(f,o,P.hand);botAddIds(f,o,P.discard);botAddIds(f,o,P.play);botMeanCost(f,o);
      if(myTurn||endView){botAddIds(f,o+12,P.hand);botMeanCost(f,o+12);}
      botAddIds(f,o+24,P.deck);botMeanCost(f,o+24);botAddIds(f,o+36,P.discard);botMeanCost(f,o+36);
      for(let k=1;k<=3;k++){const p=k<n?S.players[(me+k)%n]:null;if(!p)continue;const b=o+36+12*k;botAddIds(f,b,p.deck);botAddIds(f,b,p.hand);botAddIds(f,b,p.discard);botAddIds(f,b,p.play);botMeanCost(f,b);}
      for(const[L,b]of[[S.market,o+84],[S.reserve,o+96]]){for(const x of L){if(x.n<=0)continue;const c=botCardProps(x.t);for(let i=0;i<11;i++)f[b+i]+=c[i]*x.n;}botMeanCost(f,b);}}
    else if(g==='patch'){const k0=P.pieces.find(k=>k!=='done');
      if(k0){const bd=botDist(),s0=bd.steps.get(k0)??48,nb=botPatchOf(k0);
        for(let i=0;i<nb.length;i++){const c=nb[i];if(!c)continue;const b=o+i*12;if(c.t>=0)f[b+1+c.t]=1;f[b+9]=c.v; // slot b+0 unused (terrain implies the space exists)
          const st=bd.steps.get(c.K);f[b+11]=st==null?1:Math.max(-1,Math.min(1,(st-s0)/6));}
        S.players.forEach((p,j)=>{if(j===me)return;for(const k of p.pieces){if(k==='done')continue;const x=nb.findIndex(c=>c&&c.K===k);if(x>=0)f[o+x*12+10]=1;}});}}
    o+=BOT_XF[g];}}
let BOT_FBUF=null;
function botNetFeatures(me,scratch){ // scratch: reuse one buffer (only for values used at once, never for stored training samples)
  const{keys,idx}=botMapOrder(),n=S.players.length,nf=botNetNF();let f;
  if(scratch){if(!BOT_FBUF||BOT_FBUF.length!==nf)BOT_FBUF=new Float32Array(nf);else BOT_FBUF.fill(0);f=BOT_FBUF;}else f=new Float32Array(nf);
  botFeatures(me,f);let o=BOT_NF;
  if(botMulti()){f[o]=S.rules&&S.rules.campOnce?1:0;o+=BOT_FLAGS;if(BOT_NET.onehot){f[o+BOT_NET.courses.indexOf(MAP.course)]=1;o+=BOT_NET.courses.length;}for(const id of BOT_NET.courses){if(id===MAP.course)break;o+=botBlockSize(id);}}
  S.players.forEach((p,j)=>{const rel=(j-me+n)%n;if(rel>3)return;for(const k of p.pieces){if(k==='done')continue;const x=idx.get(k);if(x!=null)f[o+x*4+rel]=1;}});
  o+=keys.length*4;
  S.blockades.forEach(B=>{const c=o+B.conn*8;const t='jwvr'.indexOf(B.k);if(t>=0)f[c+t]=1;f[c+4]=B.v/2;f[c+5]=B.owner===null?1:0;f[c+6]=B.owner===me?1:0;f[c+7]=B.owner!==null&&B.owner!==me?1:0;});
  if(botExtra().length)botExtraFeatures(me,f,nf-botExtraNF());
  return f;
}
/* network: {course, nf, w1T (input-major, nf×h1), b1, w2 (h2×h1), b2, w3 (h2), b3, leak}; leaky-ReLU (negative slope `leak`,
   0.01 for older networks), sigmoid out. Batch normalisation is used in training only and folded into the weights on export.
   The first layer only touches non-zero inputs (most board slots are empty), so it stays fast in the browser. */
let BOT_NET=null;
let BOT_EVALS=0;
// weights as typed arrays, made once per network (same double precision as the JSON numbers, so results are bit-identical)
function botNetPrep(N){if(N._p&&N._p.src===N.w1T)return N._p;const p={src:N.w1T,w1:Float64Array.from(N.w1T),b1:Float32Array.from(N.b1),w2:Float64Array.from(N.w2),b2:Float64Array.from(N.b2),w3:Float64Array.from(N.w3),h1:new Float32Array(N.b1.length),leak:N.leak??.01};
  Object.defineProperty(N,'_p',{value:p,writable:true,enumerable:false,configurable:true});return p;}
function botNetValue(f){BOT_EVALS++;const N=BOT_NET,P=botNetPrep(N),H1=P.b1.length,H2=P.b2.length,h1=P.h1,w=P.w1,w2=P.w2,b2=P.b2,w3=P.w3,lk=P.leak;h1.set(P.b1);
  for(let k=0;k<f.length;k++){const x=f[k];if(x===0)continue;const r=k*H1;for(let j=0;j<H1;j++)h1[j]+=w[r+j]*x;}
  for(let j=0;j<H1;j++)if(h1[j]<0)h1[j]*=lk;
  let s=N.b3[0];for(let j=0;j<H2;j++){let a=b2[j];const r=j*H1;for(let k=0;k<H1;k++)a+=w2[r+k]*h1[k];s+=w3[j]*(a>0?a:lk*a);}
  return 1/(1+Math.exp(-s));}
const botNetReady=()=>!!(BOT_NET&&MAP&&(botMulti()?BOT_NET.courses.includes(MAP.course):BOT_NET.course===MAP.course)&&BOT_NET.nf===botNetNF());
/* what a finishing place is worth: 1st = 1, 2nd = 1/BOT_FIRST_RATIO, each further place half the one above, last = 0
   (3 players: 1, ¼, 0 · 4 players: 1, ¼, ⅛, 0). Training targets use the same values (tools/ai/gen.mjs). */
const BOT_FIRST_RATIO=4;
function botPlaceValue(pl,n){return pl>=n?0:pl<=1?1:1/BOT_FIRST_RATIO/2**(pl-2);}
// my place is final once no one still racing moves after me in this round (turn order runs from S.start)
function botPlaceSettled(me){const n=S.players.length;for(let i=(me+1)%n;i!==S.start;i=(i+1)%n)if(isActive(S.players[i]))return false;return true;}
function botValue(me,mode){
  if(S.over){const pl=S.places[me],n=S.players.length;return mode==='net'?botPlaceValue(pl,n):1e3-pl*100;}
  const P=S.players[me];
  if(playerDone(P)){
    // arrived, but players still to move this round can arrive in the same round and beat me on the tie-break
    // (more blockades, then the biggest blockade): until the round is over my place is a chance, which the network estimates
    // once it has been trained on such positions (net.unsettled); older networks get the place as if settled (optimistic)
    if(mode==='net'&&botNetReady()&&BOT_NET.unsettled&&!botPlaceSettled(me))return botNetValue(botNetFeatures(me,true));
    // settled: only players who arrived earlier, or in the same round with a better tie-break, are ahead of me (as endGame ranks)
    const n=S.players.length,mb=p=>Math.max(0,...p.blocks.map(b=>S.blockades[b].n));
    const pl=1+S.players.filter(q=>q!==P&&playerDone(q)&&(q.fin<P.fin||q.fin===P.fin&&(q.blocks.length>P.blocks.length||q.blocks.length===P.blocks.length&&mb(q)>mb(P)))).length;
    return mode==='net'?botPlaceValue(pl,n):1e3-pl*100;}
  return mode==='net'&&botNetReady()?botNetValue(botNetFeatures(me,true)):mode==='heur2'?botHeuristic2(me):botHeuristic(me);
}
/* ---- choose and play ---- */
/* fast structural copy of the game state (everything applyAction can change gets its own copy) */
function botClone(st){
  const t=st.turn;
  // cards (id → type) gets its own copy: buying or transmitting creates a card, and look-ahead copies that each bought
  // something different must not overwrite each other's new card (they reuse the same next id)
  return{...st,cards:{...st.cards},log:[],trash:st.trash.slice(),
    players:st.players.map(p=>({...p,pieces:p.pieces.slice(),deck:p.deck.slice(),hand:p.hand.slice(),discard:p.discard.slice(),play:p.play.slice(),blocks:p.blocks.slice()})),
    market:st.market.map(x=>({...x})),reserve:st.reserve.map(x=>({...x})),blockades:st.blockades.map(b=>({...b})),
    turn:{...t,active:t.active&&{...t.active},pending:t.pending&&{...t.pending}},
    winners:st.winners&&st.winners.slice(),places:st.places&&st.places.slice()};
}
/* "My turn is over, next hand not drawn yet": played and unkept cards go to the discard pile.
   Scoring "end turn" here (instead of after the real draw) values it as an expectation over the draw, without peeking. */
function botEndView(me,keep){const P=S.players[me];keep=(keep||[]).filter(id=>P.hand.includes(id));
  P.discard.push(...P.play,...P.hand.filter(id=>!keep.includes(id)));P.play=[];P.hand=keep.slice();
  S.turn={bought:false,active:null,pending:null};S._endView=me;}
function botEndFeatures(me,keep){const root=S;S=botClone(root);botEndView(me,keep);const f=botNetFeatures(me);S=root;return f;}
const BOT_DRAW={cartographer:1,compass:1,scientist:1,travellog:1};
/* Pick an action. Each option is scored by the value network's estimate of my chance of finishing ahead
   from the position right after it (TD-Gammon / AlphaZero style; mid-turn positions include the cards still in hand).
   Chance is handled as an expectation: "end turn" is scored before the next hand is drawn (botEndView), and a card that
   draws is scored as the average over opts.draws imagined draws from my (unordered) draw pile.
   Training exploration: eps = uniformly random action; temp = softmax over scores; turnState.forceBuy = a random purchase this turn. */
/* value of one legal action for `me`: copy the state, reshuffle my own draw pile (hidden order), apply it and score the
   position (for "end turn": after discarding, before drawing); actions that draw cards: mean over K reshuffles */
function botActionValue(me,a,mode,rnd,K){const root=S;K=K||4;
  const one=()=>{S=botClone(root);shuffle(S.players[me].deck,rnd);let v;
    if(a.t==='end'){botEndView(me,a.keep);v=botValue(me,mode);}
    else{const r=applyAction(me,a);v=r.ok?botValue(me,mode):-Infinity;}
    S=root;return v;};
  return a.t==='action'&&BOT_DRAW[typeOf(a.card)]?[...Array(K)].reduce(x=>x+one(),0)/K:one();}
function botChoose(opts){
  opts=opts||{};let mode=opts.mode||(BOT_NET?'net':'heur');const eps=opts.eps||0,rnd=opts.rnd||Math.random;
  if(mode.startsWith('plan'))return{a:botPlanChoose(S.cur,BOT_PLANS[mode])};
  const me=S.cur,root=S;let acts=botActions();if(mode==='net'&&!botNetReady())mode='heur';
  if(opts.turnState&&opts.turnState.noBuy){const f=acts.filter(a=>a.t!=='buy'&&a.t!=='transmit');if(f.length)acts=f;} // exploration: a turn without gaining a card
  if(eps&&rnd()<eps)return{a:acts[Math.floor(rnd()*acts.length)],why:'random'};
  // typed exploration: a random KIND of decision (buy / remove / keep / pay rubble / play a draw card / …), then a random option of it,
  // so rare decisions get explored as much as common ones
  if(opts.typeEps&&rnd()<opts.typeEps){const kinds=[...new Set(acts.map(a=>a.t))],k=kinds[Math.floor(rnd()*kinds.length)],L=acts.filter(a=>a.t===k);return{a:L[Math.floor(rnd()*L.length)],why:'typed'};}
  const ts=opts.turnState;
  if(ts&&ts.forceBuy&&!S.turn.bought){const buys=acts.filter(a=>a.t==='buy');if(buys.length){ts.forceBuy=false;return{a:buys[Math.floor(rnd()*buys.length)],why:'forceBuy'};}}
  if(ts&&ts.forceTransmit){const tr=acts.filter(a=>a.t==='transmit');if(tr.length){ts.forceTransmit=false; // a random card, reserve included, weighted toward expensive ones (cost²)
    const w=tr.map(a=>{const s=a.src==='m'?S.market[a.idx]:S.reserve[a.idx];return CT[s.t].cost**2;});let r=rnd()*w.reduce((x,y)=>x+y,0);for(let i=0;i<tr.length;i++){r-=w[i];if(r<=0)return{a:tr[i],why:'forceTransmit'};}return{a:tr[tr.length-1],why:'forceTransmit'};}}
  // search (after exploration, so random / typed moves and no-buy turns still happen in training)
  if(opts.search&&mode==='net')return opts.search.kind==='plan'?botPlanTurnChoose(opts):opts.search.kind==='deep'?botDeepChoose(opts):opts.search.kind==='rollout'?botRolloutChoose(opts):botTurnSearch(opts);
  const vals=[];let best=null,bv=-Infinity;const K=opts.draws||4;
  for(const a of acts){
    let v=botActionValue(me,a,mode,rnd,K);
    if(opts.noise&&v>-Infinity)v+=(rnd()-.5)*opts.noise;
    vals.push(v);if(v>bv){bv=v;best=a;}
  }
  // exploration by log-odds: pick each option with probability ∝ (its odds of winning)^(1/lotemp), so every option is tried,
  // near-best ones often and clearly worse ones rarely (Boltzmann over logits; probabilities clamped to [0.002, 0.998])
  if(opts.lotemp&&acts.length>1){const lo=v=>{const p=Math.min(.998,Math.max(.002,v));return Math.log(p/(1-p));},lb=lo(bv);
    const w=vals.map(v=>v===-Infinity?0:Math.exp((lo(v)-lb)/opts.lotemp)),tot=w.reduce((x,y)=>x+y,0);let r=rnd()*tot;
    for(let i=0;i<acts.length;i++){r-=w[i];if(r<=0)return{a:acts[i],v:vals[i],best:bv,bestA:best,why:acts[i]===best?undefined:'explore'};}}
  if(opts.temp&&acts.length>1){const w=vals.map(v=>v===-Infinity?0:Math.exp((v-bv)/opts.temp)),tot=w.reduce((x,y)=>x+y,0);let r=rnd()*tot;
    for(let i=0;i<acts.length;i++){r-=w[i];if(r<=0)return{a:acts[i],v:vals[i],best:bv,bestA:best,why:acts[i]===best?undefined:'softmax'};}}
  return{a:best||{t:'end',keep:[]},v:bv,best:bv,bestA:best,alts:opts.explain?acts.map((x,i)=>({a:x,v:vals[i]})).sort((x,y)=>y.v-x.v).slice(0,5):undefined};
}
/* ---- search at decision time (experiments; training and normal play don't use it) ----
   Same value network, but look further ahead before choosing. */
// score every legal action by the value right after it (what the plain bot does); returns [{a,v,st}] best first,
// st = the position after the action when my turn goes on (null when it ended, the game ended, or a card was drawn)
function botScoreActions(me,rnd,K){
  const root=S,acts=botActions(),out=[];
  for(const a of acts){
    if(a.t==='end'){S=botClone(root);shuffle(S.players[me].deck,rnd);botEndView(me,a.keep);out.push({a,v:botValue(me,'net'),st:null});S=root;continue;}
    if(a.t==='action'&&BOT_DRAW[typeOf(a.card)]){let v=0;for(let k=0;k<K;k++){S=botClone(root);shuffle(S.players[me].deck,rnd);const r=applyAction(me,a);v+=r.ok?botValue(me,'net'):-1;S=root;}out.push({a,v:v/K,st:null});continue;}
    S=botClone(root);shuffle(S.players[me].deck,rnd);const r=applyAction(me,a);
    const v=r.ok?botValue(me,'net'):-Infinity,st=r.ok&&!S.over&&S.cur===me?S:null;S=root;out.push({a,v,st});
  }
  return out.sort((x,y)=>y.v-x.v);
}
/* 0. whole-turn planner (beam search over my own turn). My turn has almost no luck (only cards drawn by draw cards), so plan
   it: keep the `beam` most promising partial turns (ranked by the network's value), extend each by every legal action, and
   let every line also end the turn at each step (every choice of cards to keep). Lines are compared by the network's value
   of the end-of-turn position (before the next draw: what it is trained on); a draw card is scored as the average over
   `draws` imagined draws and ends that line (the real draw reveals new cards, so the plan is redone after it). The same
   position reached in a different order is expanded once. The plan is made once per turn and followed; it is redone after
   a draw card, or if the next step is no longer legal. Cost ≈ beam × the plain bot's (measured with BOT_EVALS). */
function botTurnKey(me){const P=S.players[me],T=S.turn,ty=ids=>ids.map(typeOf).sort().join(',');
  return[P.pieces.join('|'),ty(P.hand),ty(P.play),P.discard.length,ty(P.discard),T.bought?1:0,T.active?typeOf(T.active.id)+T.active.pi+T.active.sym+T.active.left:'',T.pending?T.pending.max:'',
    S.market.map(x=>x.n).join(''),S.reserve.map(x=>x.n).join(''),S.blockades.map(b=>b.owner??'-').join(''),S.trash.length].join('#');}
function botPlanTurn(me,B,rnd,K,noBuy,top){ // top: optional array that receives every complete line {v,line}
  const root=S,seen=new Set(),start=botClone(root);S=start;shuffle(S.players[me].deck,rnd);S=root; // my deck order stays hidden
  let beam=[{st:start,line:[]}],best={v:-Infinity,line:null};
  for(let depth=0;depth<14&&beam.length;depth++){
    const next=[];
    for(const node of beam){
      S=node.st;const acts=botActions();S=root;
      for(const a of acts){
        if(noBuy&&(a.t==='buy'||a.t==='transmit'))continue; // exploration: a turn without gaining a card
        const line=[...node.line,a];
        if(a.t==='end'){S=botClone(node.st);botEndView(me,a.keep);const v=botValue(me,'net');S=root;if(top)top.push({v,line});if(v>best.v)best={v,line};continue;}
        if(a.t==='action'&&BOT_DRAW[typeOf(a.card)]){let v=0;for(let k=0;k<K;k++){S=botClone(node.st);shuffle(S.players[me].deck,rnd);const r=applyAction(me,a);v+=r.ok?botValue(me,'net'):-1;S=root;}v/=K;if(top)top.push({v,line});if(v>best.v)best={v,line,draw:true};continue;}
        S=botClone(node.st);const r=applyAction(me,a);
        if(!r.ok){S=root;continue;}
        const v=botValue(me,'net');
        if(S.over||S.cur!==me){S=root;if(top)top.push({v,line});if(v>best.v)best={v,line};continue;}          // the action ended my turn / the game
        const key=botTurnKey(me);if(seen.has(key)){S=root;continue;}seen.add(key);
        next.push({st:S,line,v});S=root;
      }
    }
    next.sort((x,y)=>y.v-x.v);beam=next.slice(0,B);
  }
  S=root;return best;
}
let BOT_PLAN_CACHE=null;
function botPlanTurnChoose(opts){
  const me=S.cur,o=opts.search,rnd=opts.rnd||Math.random,C=BOT_PLAN_CACHE;
  // follow the current plan while it still applies (same player, same round, same position the plan expects)
  if(C&&C.me===me&&C.round===S.round&&C.i<C.line.length&&C.key===botTurnKey(me)){
    const a=C.line[C.i];const root=S;S=botClone(root);const ok=applyAction(me,a).ok;const nk=ok&&!S.over&&S.cur===me?botTurnKey(me):null;S=root;
    if(ok){C.i++;C.key=nk;if(a.t==='action'&&BOT_DRAW[typeOf(a.card)])BOT_PLAN_CACHE=null;return{a,v:C.v,why:'plan'};}
  }
  const best=botPlanTurn(me,o.beam||3,rnd,opts.draws||4,!!(opts.turnState&&opts.turnState.noBuy));
  if(!best.line||!best.line.length){BOT_PLAN_CACHE=null;return{a:{t:'end',keep:[]},why:'plan'};}
  const a=best.line[0];const root=S;S=botClone(root);applyAction(me,a);const nk=!S.over&&S.cur===me?botTurnKey(me):null;S=root;
  BOT_PLAN_CACHE=best.line.length>1&&!(a.t==='action'&&BOT_DRAW[typeOf(a.card)])?{me,round:S.round,line:best.line,i:1,key:nk,v:best.v}:null;
  return{a,v:best.v,why:'plan'};
}
/* 0b. deep planner (experiment): the whole-turn planner's best K complete turns, each played forward `depth` more of my turns
   (everyone plays the planner; hidden cards re-dealt at random: my deck order, opponents' hands and decks; the same deals for
   every candidate), scored by the network where the playout stops (exact once places are settled). Successive halving
   spends `budget` network evaluations (BOT_EVALS). The chosen turn is then followed like a normal plan. */
function botDeepPlayout(root,me,line,seed,o){
  const g=mulberry32(seed),saved=BOT_PLAN_CACHE;BOT_PLAN_CACHE=null;S=botClone(root);const r0=RNG;setRng(g);
  S.players.forEach((p,j)=>{if(j===me){shuffle(p.deck,g);return;}const pool=shuffle([...p.hand,...p.deck],g);p.hand=pool.slice(0,p.hand.length);p.deck=pool.slice(p.hand.length);});
  for(const a of line){if(S.over||S.cur!==me)break;if(!applyAction(me,a).ok){applyAction(me,{t:'end',keep:[]});break;}}
  let away=S.cur!==me,turns=0,n=0;
  while(!S.over&&n++<3000){
    if(S.cur!==me)away=true;else if(away){away=false;if(++turns>=o.depth)break;}
    if(S.round>25){endGame();break;}
    const c=botChoose({mode:'net',rnd:g,search:{kind:'plan',beam:o.beam||3}});
    if(!applyAction(S.cur,c.a).ok)applyAction(S.cur,{t:'end',keep:[]});
  }
  const v=botValue(me,'net');RNG=r0;BOT_PLAN_CACHE=saved;S=root;return v;
}
function botDeepChoose(opts){
  const me=S.cur,o=opts.search,rnd=opts.rnd||Math.random,C=BOT_PLAN_CACHE;
  if(C&&C.me===me&&C.round===S.round&&C.i<C.line.length&&C.key===botTurnKey(me))return botPlanTurnChoose({...opts,search:{kind:'plan',beam:o.beam||3}});
  const root=S,top=[],e0=BOT_EVALS;const best=botPlanTurn(me,o.beam||3,rnd,opts.draws||4,!!(opts.turnState&&opts.turnState.noBuy),top);S=root;
  if(!best.line||!best.line.length){BOT_PLAN_CACHE=null;return{a:{t:'end',keep:[]},why:'plan'};}
  top.sort((x,y)=>y.v-x.v);const cands=[];for(const t of top){if(cands.length>=(o.cands||3))break;if(!cands.some(c=>Math.abs(c.v1-t.v)<1e-9))cands.push({line:t.line,v1:t.v,sum:0,n:0});}
  let pick=cands[0],info={cands:cands.length,playouts:0};
  if(cands.length>1){let live=cands,per=1,rounds=0;
    // rounds cap: playouts that end the game at once cost no network evaluations, so the budget alone could never run out
    while(live.length>1&&BOT_EVALS-e0<o.budget&&rounds++<8){
      const seeds=[...Array(per)].map(()=>(rnd()*2**31)|0);
      for(const c of live)for(const sd of seeds){c.sum+=botDeepPlayout(root,me,c.line,sd,o);c.n++;info.playouts++;}
      live.sort((x,y)=>y.sum/y.n-x.sum/x.n);
      if(BOT_EVALS-e0>=o.budget*.5&&live.length>2)live=live.slice(0,Math.ceil(live.length/2));else if(BOT_EVALS-e0>=o.budget*.75)live=live.slice(0,1);
      per=Math.min(per*2,8);
    }
    cands.sort((x,y)=>(y.n?y.sum/y.n:-1)-(x.n?x.sum/x.n:-1));pick=cands[0];}
  S=root;const line=pick.line,a=line[0];S=botClone(root);applyAction(me,a);const nk=!S.over&&S.cur===me?botTurnKey(me):null;S=root;
  BOT_PLAN_CACHE=line.length>1&&!(a.t==='action'&&BOT_DRAW[typeOf(a.card)])?{me,round:S.round,line,i:1,key:nk,v:pick.v1}:null;
  return{a,v:pick.v1,why:pick.v1===best.v?'deep-agrees':'deep-changed',deep:info};
}
/* 1. turn search: look through whole sequences of my remaining actions this turn (top `width` actions at each step,
   up to `depth` steps), score each line by the network where it stops, play the first action of the best line */
function botTurnSearch(opts){
  const me=S.cur,root=S,rnd=opts.rnd||Math.random,W=opts.search.width||3,D=opts.search.depth||4,K=opts.draws||4;let nodes=0;
  const best=(st,d)=>{S=st;const sc=botScoreActions(me,rnd,K);S=root;nodes++;let bv=-Infinity,ba=null;
    sc.forEach((x,i)=>{let v=x.v;if(x.st&&d>1&&i<W&&x.v>-Infinity)v=Math.max(v,best(x.st,d-1).v);if(v>bv){bv=v;ba=x.a;}});return{v:bv,a:ba};};
  const r=best(root,D);S=root;return{a:r.a||{t:'end',keep:[]},v:r.v,why:'turnSearch',nodes};
}
/* 2. rollouts (Monte Carlo): for the top `cands` actions, `sims` times each: hide what I can't see (reshuffle opponents' hands+decks
   and my deck), play on with the plain network for everyone until my next turn starts (or the game ends), score it.
   The same random samples are used for every candidate. Only used when the plain bot's top choices are within `margin`. */
function botRolloutChoose(opts){
  const me=S.cur,root=S,rnd=opts.rnd||Math.random,o=opts.search,C=o.cands||3,M=o.sims||6,K=opts.draws||4;
  const sc=botScoreActions(me,rnd,K);S=root;
  if(sc.length<2||sc[0].v-sc[1].v>(o.margin??.03))return{a:sc[0].a,v:sc[0].v,why:'clear'};
  const cand=sc.slice(0,C).filter(x=>x.v>-Infinity),seeds=[...Array(M)].map(()=>(rnd()*2**31)|0),prevRng=RNG;let best=null;
  for(const c of cand){let tot=0;
    for(const seed of seeds){const g=mulberry32(seed);S=botClone(root);RNG=g;
      S.players.forEach((p,j)=>{if(j===me){shuffle(p.deck,g);return;}const pool=shuffle([...p.hand,...p.deck],g);p.hand=pool.slice(0,p.hand.length);p.deck=pool.slice(p.hand.length);});
      let r=applyAction(me,c.a),left=400,passed=false;
      while(r.ok&&!S.over&&left-->0){if(S.cur!==me)passed=true;else if(passed)break;
        RNG=Math.random;const ch=botChoose({mode:'net',rnd:g});RNG=g;r=applyAction(S.cur,ch.a);if(!r.ok)r=applyAction(S.cur,{t:'end',keep:[]});}
      tot+=S.over||S.cur!==me?botValue(me,'net'):botValue(me,'net');S=root;}
    RNG=prevRng;const v=tot/M;if(!best||v>best.v)best={a:c.a,v};}
  RNG=prevRng;S=root;return{a:best?best.a:sc[0].a,v:best?best.v:sc[0].v,why:'rollout'};
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

/* =========================================================
   CARD DATA (base game)
   ========================================================= */
const CT={
  explorer:{n:'Explorer',c:'g',s:'j',p:1},
  traveler:{n:'Traveler',c:'y',s:'v',p:1},
  sailor:{n:'Sailor',c:'b',s:'w',p:1},
  scout:{n:'Scout',c:'g',s:'j',p:2,cost:1},
  trailblazer:{n:'Trailblazer',c:'g',s:'j',p:3,cost:3},
  pioneer:{n:'Pioneer',c:'g',s:'j',p:5,cost:5},
  giant:{n:'Giant Machete',c:'g',s:'j',p:6,cost:3,once:1},
  captain:{n:'Captain',c:'b',s:'w',p:3,cost:2},
  photographer:{n:'Photographer',c:'y',s:'v',p:2,cost:2},
  journalist:{n:'Journalist',c:'y',s:'v',p:3,cost:3},
  chest:{n:'Treasure Chest',c:'y',s:'v',p:4,cost:3,once:1},
  millionaire:{n:'Millionaire',c:'y',s:'v',p:4,cost:5},
  jack:{n:'Jack of All Trades',c:'x',s:'*',p:1,cost:2},
  adventurer:{n:'Adventurer',c:'x',s:'*',p:2,cost:4},
  plane:{n:'Prop Plane',c:'x',s:'*',p:4,cost:4,once:1},
  transmitter:{n:'Transmitter',c:'p',cost:4,once:1,txt:'Take any card from the market or reserve for free.',face:'Take any market or reserve card for free.'},
  cartographer:{n:'Cartographer',c:'p',cost:4,txt:'Draw 2 cards.'},
  scientist:{n:'Scientist',c:'p',cost:4,txt:'Draw 1 card. You may remove 1 card in hand from the game.',face:'Draw 1 card. You may remove 1 card from the game.'},
  compass:{n:'Compass',c:'p',cost:2,once:1,txt:'Draw 3 cards.'},
  travellog:{n:'Travel Log',c:'p',cost:3,once:1,txt:'Draw 2 cards. You may remove up to 2 cards in hand from the game.',face:'Draw 2 cards. You may remove up to 2 from the game.'},
  native:{n:'Native',c:'p',cost:5,txt:'Move to an adjacent space, ignoring its requirement. Can tear down a blockade.',face:'Move 1 space, ignoring its cost. Can tear down a blockade.'},
};
const MARKET0=['scout','trailblazer','jack','photographer','chest','transmitter'];
const RESERVE0=['pioneer','giant','captain','journalist','millionaire','adventurer','plane','cartographer','scientist','compass','travellog','native'];
const SYMNAME={j:'machete',w:'paddle',v:'coin'};
const SYMCOL={j:'#3f9a5c',w:'#3a8ad0',v:'#e7b54d',r:'#a3a8a4'};
const COLORS=[{id:'crimson',hex:'#e5484d',name:'Crimson'},{id:'ivory',hex:'#efe9dc',name:'Ivory'},{id:'violet',hex:'#9d7df7',name:'Violet'},{id:'orange',hex:'#ff9636',name:'Orange'}]; // one explorer figure per colour
/* Official base-game blockades are numbered 1–6: jungle, village, rubble, water, jungle, rubble.
   They are placed along the route in number order; the number also breaks ties. */
const BLOCKADES=[{n:1,k:'j',v:1},{n:2,k:'v',v:1},{n:3,k:'r',v:1},{n:4,k:'w',v:1},{n:5,k:'j',v:2},{n:6,k:'r',v:2}];

/* =========================================================
   TERRAIN BOARDS — base game letters. Terrain counts per board match the published
   tile catalogue (A/B start boards, C–N double-sided terrain boards). Space-by-space
   placement is reconstructed; see Rules.
   rows top→bottom (4,5,6,7,6,5,4): jN jungle · wN water · vN village · rN rubble · cN base camp · mm mountain · ss start
   ========================================================= */
const BOARDS={
 A:['j1 j1 v1 j1','j1 w1 j1 j2 j1','j1 w1 mm j1 v1 j1','v1 j1 w1 j1 j1 c1 j1','j1 j1 j1 mm v1 j1','j1 j1 v1 j1 j1','ss ss ss ss'],
 B:['j1 w1 c1 w1','j1 j1 v1 mm j1','j1 v1 j1 j1 j1 j1','w1 j1 v1 j1 v1 j1 j1','j1 j1 w1 j1 j1 j1','j1 j1 j1 j1 j1','s4 s3 s2 s1'],
 C:['j1 j1 r1 r1','j1 v1 r1 w1 w1','w1 w1 v1 v1 r1 w1','w1 v1 r1 mm w1 r1 r1','v1 r1 w1 w1 v1 v1','v1 r1 j1 v1 w1','j1 j1 w1 w1'],
 D:['j1 j1 w1 j1','j2 j1 w1 j1 mm','j1 mm w2 w1 j1 j1','j1 j1 w1 w3 w1 j2 j1','v1 j1 w1 w1 mm j1','v2 j1 j1 w2 j1','mm w1 v1 j1'],
 E:['j1 j1 r1 j1','j1 mm r2 mm j1','w1 j2 r1 j1 v1 j1','w1 mm r1 c1 r1 mm j1','w1 j1 r2 j1 v2 j1','w1 j2 r1 mm v1','j1 r1 j1 v1'],
 F:['w1 w1 j1 j1','w2 r1 r1 j1 j2','w1 r1 mm c1 j1 j1','w1 r2 mm v1 mm j1 w1','j1 r1 r1 v2 mm w1','j1 j2 r2 c2 w1','j1 v1 r1 j1'],
 G:['j1 v1 v1 j1','j1 v2 v1 v1 j1','j2 v1 mm mm v2 j1','j1 v1 v3 c1 v1 j1 j1','j1 r1 mm v1 v2 j1','j1 j2 mm r2 j1','j1 j1 v1 j1'],
 H:['v1 v1 w1 j1','v2 v1 w1 w1 j1','v1 v3 v1 w2 j1 j1','j1 v1 v2 mm w1 w1 j2','j1 v1 v1 v4 w1 j1','j1 j2 v1 w2 w1','j1 v1 j1 w1'],
 I:['j1 j1 j1 j1','v1 j1 mm j1 j1','v1 v2 j1 mm j2 j1','v1 v2 j1 j2 c2 mm mm','v2 r3 mm mm j2 j1','w2 w1 w1 j1 j1','w2 w2 w1 j1'],
 J:['r1 r1 v1 v1','w1 r2 r1 v2 v1','w1 w1 mm r1 v1 j1','w2 w1 r3 c1 r1 v1 j1','w1 w1 r1 mm v3 j1','w1 w1 r1 v1 j2','j1 j1 v1 v1'],
 K:['c1 j2 j2 j1','j1 j1 w3 j1 j2','j1 j2 j1 j3 j1 j2','j2 j1 j3 j1 j3 j1 j2','j2 j1 j3 j1 j2 j1','j2 j1 v4 j1 j1','j1 j2 j2 c1'],
 L:['j1 j1 j1 mm','j2 c1 j1 j1 j1','j1 j1 j2 mm j1 w1','c2 j1 j1 j1 j3 w1 j1','j1 mm j1 v1 j1 w1','j1 j2 j1 c1 j1','j1 v2 j1 j1'],
 M:['j1 mm mm j1','j1 j2 mm j1 j1','mm j1 r1 j2 mm j1','w1 j1 mm c1 j1 j1 mm','w1 mm j1 r2 j1 j1','w1 j1 v1 mm j2','w1 j1 r1 v1'],
 N:['j1 j1 j1 j1','v1 j1 j2 j1 w1','v1 v2 j1 w1 w1 w1','w1 w1 v3 v4 v2 v2 v1','w1 w1 w1 j1 v2 v1','j1 j1 j2 j1 j1','j1 j1 j1 j1'],
};
function parseTok(t){
  if(t==='mm')return{type:'m',val:0};if(t[0]==='s')return{type:'s',val:0,num:+t[1]||0}; // s1–s4: numbered start spaces
  if(t[0]==='g')return{type:'g',sym:t[1],val:1};
  return{type:t[0],val:+t[1]};
}
function parseTpl(rows){
  const cells=[];
  rows.forEach((row,i)=>{const r=i-3,toks=row.trim().split(/\s+/),qmin=Math.max(-3,-r-3),qmax=Math.min(3,-r+3);
    if(toks.length!==qmax-qmin+1)throw new Error('bad tile row '+row);
    toks.forEach((t,j)=>cells.push({q:qmin+j,r,d:parseTok(t)}));});
  return cells;
}
const TPL={};for(const k in BOARDS)TPL[k]=parseTpl(BOARDS[k]);

/* =========================================================
   GEOMETRY / MAP
   ========================================================= */
const SQ3=Math.sqrt(3),R=34;
const DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const key=(q,r)=>q+','+r;
const rot=(q,r,k)=>{for(let i=0;i<k;i++){const t=q;q=-r;r=t+r;}return[q,r];};
const pxOf=(q,r)=>[R*SQ3*(q+r/2),R*1.5*r];
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
/* where shuffles get their randomness: Math.random in play; a seeded generator while recording or replaying a game log */
let RNG=Math.random;
function setRng(f){RNG=f||Math.random;}
function shuffle(a,rnd=RNG){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const hash=(x,y)=>{let h=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;};

/* =========================================================
   COURSES — fixed routes (no random generation).
   p: the boards in route order as [letter, q, r, rotation]; the first is start board A or B.
      (q,r) is where the board's central space goes; rotation is in 60° steps.
   e: [q,r] the middle finishing space of the El Dorado tile, next to the last board.
   s: El Dorado side, 'j' jungle or 'w' water.
   Blockades are dealt at random onto the connections when a game starts (rulebook).
   ========================================================= */
const COURSES=[
  // Positions and rotations taken from Ravensburger's setup sheet (first game); El Dorado water side on K's top-right corner.
  {id:'first',name:'First Expedition',src:'Rulebook route for your first game',diff:'Easy',
   p:[['B',0,0,2],['C',7,-3,5],['N',11,0,2],['I',14,4,2],['K',21,-1,0]],e:[25,-5],s:'w'},
];
const courseById=id=>COURSES.find(c=>c.id===id)||null;
function buildCourse(C,seed){
  const hexes=new Map(),tiles=[];
  C.p.forEach(([name,cq,cr,k],ti)=>{
    const tpl=TPL[name];if(!tpl)throw new Error('Unknown board '+name);
    if((ti===0)!==(name==='A'||name==='B'))throw new Error('A route starts with board A or B, and only there.');
    let sx=0,sy=0;
    for(const cell of tpl){const[lq,lr]=rot(cell.q,cell.r,k);const q=cq+lq,r=cr+lr,K=key(q,r);
      if(hexes.has(K))throw new Error('Boards '+tiles[hexes.get(K).tile].name+' and '+name+' overlap.');
      const[x,y]=pxOf(q,r);hexes.set(K,{...cell.d,q,r,k:K,tile:ti,x,y});sx+=x;sy+=y;}
    tiles.push({c:[cq,cr],name,k,x:sx/tpl.length,y:sy/tpl.length});
  });
  const nT=tiles.length;
  // El Dorado tile: the given space plus its two neighbours along the last board's edge
  const touch=(q,r)=>!hexes.has(key(q,r))&&DIRS.some(([a,b])=>{const n=hexes.get(key(q+a,r+b));return n&&n.tile===nT-1&&n.type!=='m';});
  const[eq,er]=C.e;if(!touch(eq,er))throw new Error('El Dorado must sit against the last board.');
  let side=null;
  for(let d=0;d<3&&!side;d++){const a=[eq+DIRS[d][0],er+DIRS[d][1]],b=[eq-DIRS[d][0],er-DIRS[d][1]];if(touch(...a)&&touch(...b))side=[a,b];}
  if(!side){const fr=DIRS.map(([a,b])=>[eq+a,er+b]).filter(c=>touch(...c));if(fr.length<2)throw new Error('No room for El Dorado there.');side=fr.slice(0,2);}
  for(const[q,r]of[[eq,er],...side]){const K=key(q,r),[x,y]=pxOf(q,r);hexes.set(K,{type:'g',sym:C.s,val:1,q,r,k:K,tile:nT,x,y});}
  // connections between consecutive boards (only these carry blockades; other touching boards are open)
  const conns=[];const edgeConn=new Map();
  for(let i=0;i<nT-1;i++)conns.push({a:i,b:i+1,edges:[]});
  for(const h of hexes.values())for(const[dq,dr]of DIRS){const n=hexes.get(key(h.q+dq,h.r+dr));
    if(n&&n.tile===h.tile+1&&n.tile<nT){conns[h.tile].edges.push([h.k,n.k]);edgeConn.set(h.k+'|'+n.k,h.tile);edgeConn.set(n.k+'|'+h.k,h.tile);}}
  conns.forEach((c,i)=>{if(c.edges.filter(([a,b])=>hexes.get(a).type!=='m'&&hexes.get(b).type!=='m').length<2)throw new Error('Boards '+tiles[i].name+' and '+tiles[i+1].name+' are not properly connected.');});
  const starts=[...hexes.values()].filter(h=>h.type==='s');
  const goals=[...hexes.values()].filter(h=>h.type==='g');
  const seen=new Set(starts.map(s=>s.k)),q=[...starts];let found=false;
  while(q.length){const h=q.shift();if(h.type==='g'){found=true;break;}
    for(const[dq,dr]of DIRS){const n=hexes.get(key(h.q+dq,h.r+dr));if(!n||seen.has(n.k)||n.type==='m'||n.type==='s')continue;seen.add(n.k);q.push(n);}}
  if(!found)throw new Error('There is no path from the start to El Dorado.');
  // start spaces numbered along their edge
  const sc=starts.reduce((a,h)=>[a[0]+h.x/starts.length,a[1]+h.y/starts.length],[0,0]);
  const ang=Math.atan2(tiles[1].y-tiles[0].y,tiles[1].x-tiles[0].x)+Math.PI/2;
  const proj=h=>(h.x-sc[0])*Math.cos(ang)+(h.y-sc[1])*Math.sin(ang);
  if(starts.every(s=>s.num))starts.sort((a,b)=>a.num-b.num);else{starts.sort((a,b)=>proj(a)-proj(b));starts.forEach((s,i)=>s.num=i+1);}
  // a random blockade on each connection
  const deal=shuffle(BLOCKADES.slice(),mulberry32(seed^0x2c1b3c6d));
  if(conns.length>deal.length)throw new Error('Too many connections for 6 blockades.');
  const blockDefs=conns.map((c,i)=>({...deal[i],conn:i}));
  const gc=goals.reduce((a,h)=>[a[0]+h.x/3,a[1]+h.y/3],[0,0]);
  const last=tiles[nT-1];let dx=gc[0]-last.x,dy=gc[1]-last.y;const dl=Math.hypot(dx,dy)||1;dx/=dl;dy/=dl;
  const city={x:gc[0]+dx*R*2.5,y:gc[1]+dy*R*2.5,dx,dy};
  tiles.push({c:[eq,er],name:'El Dorado',k:0,end:true,x:gc[0],y:gc[1]});
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for(const h of hexes.values()){minX=Math.min(minX,h.x-R);maxX=Math.max(maxX,h.x+R);minY=Math.min(minY,h.y-R);maxY=Math.max(maxY,h.y+R);}
  minX=Math.min(minX,city.x-R*2.6);maxX=Math.max(maxX,city.x+R*2.6);minY=Math.min(minY,city.y-R*2.6);maxY=Math.max(maxY,city.y+R*2.6);
  const pad=R*.6;minX-=pad;minY-=pad;maxX+=pad;maxY+=pad;
  return{hexes,tiles,conns,edgeConn,starts:starts.map(s=>s.k),goals:goals.map(g=>g.k),blockDefs,city,endSym:C.s,minX,minY,w:maxX-minX,h:maxY-minY,route:C.p.map(x=>x[0]),name:C.name,course:C.id};
}

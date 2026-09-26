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
  transmitter:{n:'Transmitter',c:'p',cost:4,once:1,txt:'Take any card from the market or reserve for free.'},
  cartographer:{n:'Cartographer',c:'p',cost:4,txt:'Draw 2 cards.'},
  scientist:{n:'Scientist',c:'p',cost:4,txt:'Draw 1 card. You may remove 1 card in hand from the game.'},
  compass:{n:'Compass',c:'p',cost:2,once:1,txt:'Draw 3 cards.'},
  travellog:{n:'Travel Log',c:'p',cost:3,once:1,txt:'Draw 2 cards. You may remove up to 2 cards in hand from the game.'},
  native:{n:'Native',c:'p',cost:5,txt:'Move to an adjacent space, ignoring its requirement. Can tear down a blockade.'},
};
const MARKET0=['scout','trailblazer','jack','photographer','chest','transmitter'];
const RESERVE0=['pioneer','giant','captain','journalist','millionaire','adventurer','plane','cartographer','scientist','compass','travellog','native'];
const SYMNAME={j:'machete',w:'paddle',v:'coin'};
const SYMCOL={j:'#3f9a5c',w:'#3a8ad0',v:'#e7b54d',r:'#a3a8a4'};
const COLORS=[{id:'crimson',hex:'#e5484d',name:'Crimson'},{id:'ivory',hex:'#efe9dc',name:'Ivory'},{id:'violet',hex:'#9d7df7',name:'Violet'},{id:'orange',hex:'#ff9636',name:'Orange'},{id:'teal',hex:'#35d0ba',name:'Teal'},{id:'pink',hex:'#f07ab8',name:'Rose'}];
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
 B:['j1 w1 j1 j1','j1 w1 j1 v1 j1','v1 j1 w1 j1 j1 j1','j1 j1 w1 mm j1 v1 j1','j1 c1 j1 j1 j1 j1','v1 j1 j1 j1 j2','ss ss ss ss'],
 C:['w1 w1 r1 v1','w2 w1 r1 v2 v1','j1 w1 r2 mm v1 j1','j1 w1 w1 r1 v2 v1 j2','w1 w2 r1 r1 v1 j1','w1 w1 r2 v3 j1','r1 r1 w1 v1'],
 D:['j1 j1 w1 j1','j2 j1 w1 j1 mm','j1 mm w2 w1 j1 j1','j1 j1 w1 w3 w1 j2 j1','v1 j1 w1 w1 mm j1','v2 j1 j1 w2 j1','mm w1 v1 j1'],
 E:['j1 j1 r1 j1','j1 mm r2 mm j1','w1 j2 r1 j1 v1 j1','w1 mm r1 c1 r1 mm j1','w1 j1 r2 j1 v2 j1','w1 j2 r1 mm v1','j1 r1 j1 v1'],
 F:['w1 w1 j1 j1','w2 r1 r1 j1 j2','w1 r1 mm c1 j1 j1','w1 r2 mm v1 mm j1 w1','j1 r1 r1 v2 mm w1','j1 j2 r2 c2 w1','j1 v1 r1 j1'],
 G:['j1 v1 v1 j1','j1 v2 v1 v1 j1','j2 v1 mm mm v2 j1','j1 v1 v3 c1 v1 j1 j1','j1 r1 mm v1 v2 j1','j1 j2 mm r2 j1','j1 j1 v1 j1'],
 H:['v1 v1 w1 j1','v2 v1 w1 w1 j1','v1 v3 v1 w2 j1 j1','j1 v1 v2 mm w1 w1 j2','j1 v1 v1 v4 w1 j1','j1 j2 v1 w2 w1','j1 v1 j1 w1'],
 I:['j1 j2 mm j1','j1 mm mm j1 v1','w1 w1 j1 j2 v1 v1','j1 w2 mm c1 j1 v2 j1','j1 w1 j1 mm r1 j1','j2 w1 j1 mm v1','j1 w1 j1 v1'],
 J:['r1 r1 v1 v1','w1 r2 r1 v2 v1','w1 w1 mm r1 v1 j1','w2 w1 r3 c1 r1 v1 j1','w1 w1 r1 mm v3 j1','w1 w1 r1 v1 j2','j1 j1 v1 v1'],
 K:['j1 j1 j2 j1','j1 j2 j1 j1 j1','j1 j1 c1 j2 j1 j1','j2 j1 j1 w1 j1 j3 j1','j1 j1 j2 j1 c2 j1','j1 v1 j1 j1 j2','j1 j1 j3 j1'],
 L:['j1 j1 j1 mm','j2 c1 j1 j1 j1','j1 j1 j2 mm j1 w1','c2 j1 j1 j1 j3 w1 j1','j1 mm j1 v1 j1 w1','j1 j2 j1 c1 j1','j1 v2 j1 j1'],
 M:['j1 mm mm j1','j1 j2 mm j1 j1','mm j1 r1 j2 mm j1','w1 j1 mm c1 j1 j1 mm','w1 mm j1 r2 j1 j1','w1 j1 v1 mm j2','w1 j1 r1 v1'],
 N:['j1 j1 w1 w1','j1 v1 v1 w2 j1','j2 v2 v1 w1 j1 j1','j1 v1 v3 w1 w1 j2 j1','j1 v1 v2 j1 w1 j1','j1 j1 v1 w2 j1','j2 v1 w1 j1'],
};
const PAIRS=[['C','D'],['E','F'],['G','H'],['I','J'],['K','L'],['M','N']];
function parseTok(t){
  if(t==='mm')return{type:'m',val:0};if(t==='ss')return{type:'s',val:0};
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
const TV=[[7,-3],[3,4],[-4,7],[-7,3],[-3,-4],[4,-7]];
const key=(q,r)=>q+','+r;
const rot=(q,r,k)=>{for(let i=0;i<k;i++){const t=q;q=-r;r=t+r;}return[q,r];};
const pxOf=(q,r)=>[R*SQ3*(q+r/2),R*1.5*r];
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function shuffle(a,rnd=Math.random){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const hash=(x,y)=>{let h=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;};

function genMap(nMid,seed){
  const rng=mulberry32(seed);
  for(let attempt=0;attempt<600;attempt++){
    const centers=[[0,0]],dirs=[];let ok=true;
    const base=rng()<.5?0:1;
    for(let i=0;i<=nMid;i++){ // nMid terrain boards + one slot where the El Dorado tile goes
      const x=rng();
      let pref=x<.42?[0,1]:x<.84?[1,0]:(rng()<.5?[5,0,1]:[2,1,0]);
      if(base===1&&x<.84)pref=pref.slice().reverse();
      let placed=false;
      for(const d of pref){
        const L=centers[centers.length-1],c=[L[0]+TV[d][0],L[1]+TV[d][1]];
        let bad=false;
        for(let j=0;j<centers.length&&!bad;j++){const p=centers[j];
          if(p[0]===c[0]&&p[1]===c[1])bad=true;
          else if(j<centers.length-1&&TV.some(v=>p[0]+v[0]===c[0]&&p[1]+v[1]===c[1]))bad=true;}
        if(bad)continue;centers.push(c);dirs.push(d);placed=true;break;
      }
      if(!placed){ok=false;break;}
    }
    if(!ok)continue;
    const startL=rng()<.5?'A':'B';
    const mids=shuffle(PAIRS.slice(),rng).slice(0,nMid).map(p=>p[rng()<.5?0:1]);
    const endSym=rng()<.5?'j':'w';
    const m=buildMap(centers,dirs,startL,mids,endSym,rng);
    if(m)return m;
  }
  throw new Error('map generation failed');
}
function buildMap(centers,dirs,startL,mids,endSym,rng){
  const hexes=new Map(),tiles=[];const nT=centers.length-1; // last centre = El Dorado side
  for(let ti=0;ti<nT;ti++){
    const c=centers[ti];let cells,k,name;
    if(ti===0){cells=TPL[startL];k=(dirs[0]+1)%6;name=startL;}
    else{name=mids[ti-1];cells=TPL[name];k=Math.floor(rng()*6);}
    tiles.push({c,name,k});
    for(const cell of cells){const[lq,lr]=rot(cell.q,cell.r,k);const q=c[0]+lq,r=c[1]+lr;const K=key(q,r);
      const[x,y]=pxOf(q,r);hexes.set(K,{...cell.d,q,r,k:K,tile:ti,x,y});}
  }
  // El Dorado tile: 3 finishing spaces set against the far edge of the last board
  const last=centers[nT-1],nc=centers[nT];
  const mid=pxOf((last[0]+nc[0])/2,(last[1]+nc[1])/2);
  const cand=[];
  for(let dq=-3;dq<=3;dq++)for(let dr=Math.max(-3,-dq-3);dr<=Math.min(3,-dq+3);dr++){
    const q=nc[0]+dq,r=nc[1]+dr;
    if(DIRS.some(([a,b])=>{const n=hexes.get(key(q+a,r+b));return n&&n.tile===nT-1&&n.type!=='m';})){const[x,y]=pxOf(q,r);cand.push({q,r,x,y,d:Math.hypot(x-mid[0],y-mid[1])});}
  }
  cand.sort((a,b)=>a.d-b.d);
  const goalsC=[];
  for(const c of cand){if(goalsC.length===0||goalsC.some(g=>DIRS.some(([a,b])=>g.q+a===c.q&&g.r+b===c.r)))goalsC.push(c);if(goalsC.length===3)break;}
  if(goalsC.length<3)return null;
  for(const g of goalsC){const K=key(g.q,g.r);hexes.set(K,{type:'g',sym:endSym,val:1,q:g.q,r:g.r,k:K,tile:nT,x:g.x,y:g.y});}
  tiles.push({c:nc,name:'El Dorado',k:0,end:true});
  // seams between consecutive terrain boards
  const conns=[];for(let i=0;i<nT-1;i++)conns.push({a:i,b:i+1,edges:[]});
  const edgeConn=new Map();
  for(const h of hexes.values())for(const[dq,dr]of DIRS){const n=hexes.get(key(h.q+dq,h.r+dr));
    if(n&&n.tile!==h.tile&&h.tile<nT&&n.tile<nT){const c=Math.min(h.tile,n.tile);edgeConn.set(h.k+'|'+n.k,c);if(h.tile<n.tile)conns[c].edges.push([h.k,n.k]);}}
  const starts=[...hexes.values()].filter(h=>h.type==='s');
  const goals=[...hexes.values()].filter(h=>h.type==='g');
  // path check
  const seen=new Set(starts.map(s=>s.k)),q=[...starts];let found=false;
  while(q.length){const h=q.shift();if(h.type==='g'){found=true;break;}
    for(const[dq,dr]of DIRS){const n=hexes.get(key(h.q+dq,h.r+dr));if(!n||seen.has(n.k)||n.type==='m'||n.type==='s')continue;seen.add(n.k);q.push(n);}}
  if(!found)return null;
  for(const c of conns){if(c.edges.filter(([a,b])=>hexes.get(a).type!=='m'&&hexes.get(b).type!=='m').length<2)return null;}
  // start numbering along the edge
  const sc=starts.reduce((a,h)=>[a[0]+h.x/4,a[1]+h.y/4],[0,0]);
  const f=pxOf(...centers[1]);const ang=Math.atan2(f[1],f[0])+Math.PI/2;
  const proj=h=>(h.x-sc[0])*Math.cos(ang)+(h.y-sc[1])*Math.sin(ang);
  starts.sort((a,b)=>proj(a)-proj(b));starts.forEach((s,i)=>s.num=i+1);
  const blockDefs=BLOCKADES.slice(0,conns.length).map((b,i)=>({...b,conn:i}));
  // city
  const gc=goals.reduce((a,h)=>[a[0]+h.x/3,a[1]+h.y/3],[0,0]);
  const tc=pxOf(...last);let dx=gc[0]-tc[0],dy=gc[1]-tc[1];const dl=Math.hypot(dx,dy)||1;dx/=dl;dy/=dl;
  const city={x:gc[0]+dx*R*2.5,y:gc[1]+dy*R*2.5,dx,dy};
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for(const h of hexes.values()){minX=Math.min(minX,h.x-R);maxX=Math.max(maxX,h.x+R);minY=Math.min(minY,h.y-R);maxY=Math.max(maxY,h.y+R);}
  minX=Math.min(minX,city.x-R*2.6);maxX=Math.max(maxX,city.x+R*2.6);minY=Math.min(minY,city.y-R*2.6);maxY=Math.max(maxY,city.y+R*2.6);
  const pad=R*.6;minX-=pad;minY-=pad;maxX+=pad;maxY+=pad;
  return{hexes,tiles,conns,edgeConn,starts:starts.map(s=>s.k),goals:goals.map(g=>g.k),blockDefs,city,endSym,minX,minY,w:maxX-minX,h:maxY-minY,route:[startL,...mids]};
}


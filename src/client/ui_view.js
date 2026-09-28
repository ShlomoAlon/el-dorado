/* =========================================================
   INPUT: card clicks
   ========================================================= */
function onHandCard(id){
  if(!S||S.over||UI.cover||UI.anim||!canAct())return;
  switch(UI.mode){
    case 'pay':case 'endTurn':{togglePick(id);return;}
    case 'discardFor':{if(UI.picks.includes(id))rm(UI.picks,id);else if(UI.picks.length<UI.pending.need)UI.picks.push(id);render();return;}
    case 'trashPick':{if(UI.picks.includes(id))rm(UI.picks,id);else if(UI.picks.length<UI.max)UI.picks.push(id);render();return;}
    case 'transmit':{if(id===UI.card)cancelMode();return;}
  }
  if(UI.mode==='card'&&UI.card===id){cancelMode();return;}
  if(def(id).c==='p'&&typeOf(id)!=='native'){playAction(id);return;}
  UI.mode='card';UI.card=id;render();
}
function togglePick(id){const add=!UI.picks.includes(id);if(add)UI.picks.push(id);else rm(UI.picks,id);render();if(add&&UI.mode==='pay')payProgress();}
/* after a card goes into the spending tray: finish the purchase once the coins cover it */
function payProgress(){if(UI.mode!=='pay'||!UI.buy)return;const c=CT[UI.buy.t].cost;if(payTotal()<c)return;
  $('#buySlot').classList.add('paid');const b=UI.buy;setTimeout(()=>{if(UI.mode==='pay'&&UI.buy===b&&payTotal()>=c)confirmBuy();},300);}
function renderBuySlot(){const bs=$('#buySlot');if(!bs)return;const on=UI.mode==='pay'&&!!UI.buy&&!UI.cover;
  if(!on){if(!bs.hidden){bs.hidden=true;bs.dataset.t='';}return;}
  if(bs.dataset.t!==UI.buy.src+UI.buy.idx){bs.dataset.t=UI.buy.src+UI.buy.idx;bs.querySelector('.bs-card').innerHTML=`<div class="mcard">${cardHTML(UI.buy.t)}</div>`;}
  const c=CT[UI.buy.t].cost,t=payTotal();$('#bsPaid').textContent=fmt(t);$('#bsCost').textContent=c;bs.classList.toggle('paid',t>=c);bs.hidden=false;}
function onPlayCard(id){
  if(S.turn.active&&S.turn.active.id===id){
    if(UI.mode==='card'&&UI.card===id){UI.mode='idle';UI.card=null;}else{UI.mode='card';UI.card=id;UI.piece=S.turn.active.pi;UI.picks=[];}
    render();
  }
}
function onPiece(pl,i){
  if(!canAct())return;
  if(pl!==S.cur||S.over)return;
  if(cur().pieces[i]==='done')return;
  if(S.turn.active&&UI.mode==='card'&&UI.card===S.turn.active.id&&S.turn.active.pi!==i){UI.mode='idle';UI.card=null;}
  UI.piece=i;render();
}

/* =========================================================
   BOARD RENDER
   ========================================================= */
const SVGNS='http://www.w3.org/2000/svg';
function sv(tag,attrs,parent){const e=document.createElementNS(SVGNS,tag);if(attrs)for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;}
function hexPts(x,y,r){let s='';for(let i=0;i<6;i++){const a=Math.PI/180*(60*i-30);s+=(x+r*Math.cos(a)).toFixed(1)+','+(y+r*Math.sin(a)).toFixed(1)+' ';}return s;}
const TFILL={j:['#4a9b5f','#2a6a40'],w:['#4aa0dd','#2464a0'],v:['#f2cd6c','#d09632'],r:['#aeb2ad','#7a7f7b'],c:['#d4705a','#9a3e2d'],m:['#58615a','#2d332f'],s:['#e3d8b9','#b4a887'],g:['#ffe690','#e3a52b']};
/* harder spaces are darker, like the printed tiles: [top,bottom] gradient per strength 1..4 */
const TSHADE={j:[['#4a9b5f','#2a6a40'],['#347c49','#1c4f2e'],['#245e36','#123a21'],['#1a4a2a','#0c2c18']],
  w:[['#4aa0dd','#2464a0'],['#2f82c2','#1a4d82'],['#2064a0','#123c66'],['#174e82','#0c2e52']],
  v:[['#f2cd6c','#d09632'],['#e2a94c','#b87424'],['#c9893a','#955418'],['#a96b2c','#733c0e']],
  r:[['#aeb2ad','#7a7f7b'],['#8f948f','#5e635f'],['#737873','#474b48'],['#5c605c','#363936']],
  c:[['#d4705a','#9a3e2d'],['#bb5641','#7e2e1f'],['#9c4230','#652217'],['#80321f','#4f180e']]};
const ICON_AT={1:[[0,0]],2:[[-9.6,0],[9.6,0]],3:[[-8.8,-6],[8.8,-6],[0,7.4]],4:[[-8.2,-7.4],[8.2,-7.4],[-8.2,7.4],[8.2,7.4]]};
const ICOL={j:'#f4fff6',w:'#f2f9ff',v:'#5a3d07',g:'#5a3c05',r:'#f5f5f2',c:'#fff4ea',s:'#4b4436'};
const CHIP={j:'rgba(10,40,22,.42)',w:'rgba(8,34,64,.42)',v:'rgba(255,248,225,.5)',r:'rgba(30,32,31,.45)',c:'rgba(70,16,8,.45)',g:'rgba(255,250,230,.55)'};
let L={};
function buildBoard(){
  // the same course with the same blockades is already drawn (the start screen's preview of this deal): keep it — starting a
  // game then costs no redraw (the labels' layout reads alone take ~100 ms); only the pieces go
  const sig=MAP.course+'|'+MAP.blockDefs.map(b=>b.n+':'+b.conn).join(',');
  if(buildBoard.sig===sig&&$('#board').childElementCount&&L.pieces){L.pieces.innerHTML='';pieceEls={};return;}
  buildBoard.sig=sig;
  // two stacked SVGs (the static board, then the live layers: targets, blockades, pieces, aim) with the text in HTML label
  // layers between/above them: Chrome re-lays out SVG text whenever an ancestor's scale changes; HTML text it doesn't
  const svg=$('#board'),svg2=$('#board2');svg.innerHTML='';svg2.innerHTML='';$('#blabels').innerHTML='';$('#blabels2').innerHTML='';
  for(const s of[svg,svg2]){s.setAttribute('width',MAP.w);s.setAttribute('height',MAP.h);s.setAttribute('viewBox',`${MAP.minX} ${MAP.minY} ${MAP.w} ${MAP.h}`);}
  const defs=sv('defs',null,svg);
  for(const t in TFILL){const g=sv('linearGradient',{id:'gr-'+t,x1:0,y1:0,x2:.3,y2:1},defs);sv('stop',{offset:0,'stop-color':TFILL[t][0]},g);sv('stop',{offset:1,'stop-color':TFILL[t][1]},g);}
  for(const t in TSHADE)TSHADE[t].forEach(([a,b],i)=>{const g=sv('linearGradient',{id:'gr-'+t+(i+1),x1:0,y1:0,x2:.3,y2:1},defs);sv('stop',{offset:0,'stop-color':a},g);sv('stop',{offset:1,'stop-color':b},g);});
  const rg=sv('radialGradient',{id:'cityGlow'},defs);sv('stop',{offset:0,'stop-color':'#ffd66b','stop-opacity':.6},rg);sv('stop',{offset:.6,'stop-color':'#ffc94a','stop-opacity':.15},rg);sv('stop',{offset:1,'stop-color':'#ffd66b','stop-opacity':0},rg);
  const tg=sv('radialGradient',{id:'turnGlow'},defs);sv('stop',{offset:0,'stop-color':'#fff6d6','stop-opacity':.85},tg);sv('stop',{offset:.55,'stop-color':'#ffd66b','stop-opacity':.45},tg);sv('stop',{offset:1,'stop-color':'#ffd66b','stop-opacity':0},tg);
  const hl=sv('radialGradient',{id:'hexShine',cx:.35,cy:.25,r:.8},defs);sv('stop',{offset:0,'stop-color':'#fff','stop-opacity':.2},hl);sv('stop',{offset:.6,'stop-color':'#fff','stop-opacity':0},hl);
  // terrain textures
  const pat=(id,w,h,draw)=>{const p=sv('pattern',{id,patternUnits:'userSpaceOnUse',width:w,height:h},defs);draw(p);};
  pat('p-j',26,26,p=>{for(const[x,y,a,s]of[[6,7,-30,1],[19,5,40,.8],[13,17,10,1.1],[3,21,-60,.8],[23,19,70,.9]]){
    sv('path',{d:'M0 -5 Q3.5 0 0 5 Q-3.5 0 0 -5Z',fill:'rgba(0,30,10,.22)',transform:`translate(${x} ${y}) rotate(${a}) scale(${s})`},p);
    sv('path',{d:'M0 -4 L0 4',stroke:'rgba(255,255,255,.08)','stroke-width':.6,transform:`translate(${x} ${y}) rotate(${a}) scale(${s})`},p);}});
  pat('p-w',28,14,p=>{sv('path',{d:'M0 5 Q3.5 2 7 5 T14 5 T21 5 T28 5',fill:'none',stroke:'rgba(255,255,255,.18)','stroke-width':1.2},p);sv('path',{d:'M-7 12 Q-3.5 9 0 12 T7 12 T14 12 T21 12 T28 12',fill:'none',stroke:'rgba(0,20,60,.18)','stroke-width':1.1},p);});
  pat('p-v',16,16,p=>{sv('circle',{cx:4,cy:4,r:1.1,fill:'rgba(120,70,0,.2)'},p);sv('circle',{cx:12,cy:11,r:.9,fill:'rgba(120,70,0,.16)'},p);sv('circle',{cx:13,cy:3,r:.6,fill:'rgba(255,255,255,.25)'},p);});
  pat('p-r',20,20,p=>{for(const[x,y,s]of[[5,5,3],[14,8,2.4],[8,15,2.6],[17,17,1.8]])sv('path',{d:`M${x-s} ${y+s*.6} Q${x-s} ${y-s*.7} ${x} ${y-s*.8} Q${x+s} ${y-s*.6} ${x+s} ${y+s*.6}Z`,fill:'rgba(40,42,40,.2)',stroke:'rgba(255,255,255,.12)','stroke-width':.5},p);});
  pat('p-c',12,12,p=>{sv('path',{d:'M0 12 L12 0',stroke:'rgba(0,0,0,.12)','stroke-width':3},p);});
  L.plates=sv('g',null,svg);L.terrain=sv('g',null,svg);L.city=sv('g',null,svg);L.hl=sv('g',null,svg2);L.trail=sv('g',{'pointer-events':'none'},svg2);feedReset();L.path=sv('g',{'pointer-events':'none'},svg2);L.bl=sv('g',null,svg2);L.pieces=sv('g',null,svg2);L.aim=sv('g',{'pointer-events':'none'},svg2);L.pips=sv('g',{'pointer-events':'none'},svg2); // rubble / base camp progress dots (redrawn every render)
  // board plates (the physical boards): drop shadow + rim
  const byTile=new Map();for(const h of MAP.hexes.values()){if(!byTile.has(h.tile))byTile.set(h.tile,[]);byTile.get(h.tile).push(h);}
  for(const[,hs]of byTile){const g=sv('g',null,L.plates);for(const h of hs)sv('polygon',{points:hexPts(h.x+2,h.y+6,R+2),fill:'rgba(0,0,0,.45)'},g);}
  for(const[t,hs]of byTile){const g=sv('g',null,L.plates);const rim=MAP.tiles[t].end?'#6b4c14':'#1c2a22';for(const h of hs)sv('polygon',{points:hexPts(h.x,h.y,R+2.2),fill:rim},g);}
  for(const[t,hs]of byTile){const g=sv('g',null,L.plates);const inner=MAP.tiles[t].end?'#3a2a0b':'#0f1a14';for(const h of hs)sv('polygon',{points:hexPts(h.x,h.y,R+.6),fill:inner},g);}
  // hexes
  for(const h of MAP.hexes.values()){
    const g=sv('g',null,L.terrain);
    const pts=hexPts(h.x,h.y,R-1.4);
    const vt=h.type==='g'?h.sym:h.type; // El Dorado's finishing spaces look like the terrain they need (water or jungle)
    sv('polygon',{points:pts,fill:'url(#gr-'+vt+(TSHADE[vt]?Math.min(4,Math.max(1,h.val||1)):'')+')'},g);
    if(vt!=='m'&&vt!=='s'&&vt!=='g')sv('polygon',{points:pts,fill:'url(#p-'+vt+')'},g);
    sv('polygon',{points:pts,fill:'url(#hexShine)',stroke:'rgba(255,255,255,.16)','stroke-width':1},g);
    if(h.type==='m'){drawMountain(g,h);continue;}
    if(h.type==='s'){sv('circle',{cx:h.x,cy:h.y,r:13,fill:'none',stroke:'rgba(75,68,54,.35)','stroke-width':1.5,'stroke-dasharray':'3 3'},g);
      const t=sv('text',{x:h.x,y:h.y+6,'text-anchor':'middle','font-size':17,'font-family':'Young Serif, Georgia, serif',fill:ICOL.s},g);t.textContent=h.num;continue;}
    if(h.type==='g'){
      // a gold ring and gold lettering mark the finish; the space itself is its terrain's colour
      sv('polygon',{points:hexPts(h.x,h.y,R-5),fill:'none',stroke:'#f8dc97','stroke-width':2.2},g);
      const u=sv('use',{href:'#i-'+h.sym,x:h.x-9,y:h.y-2,width:18,height:18},g);u.style.color=ICOL[h.sym];
      const t=sv('text',{x:h.x,y:h.y-8,'text-anchor':'middle','font-size':8,'font-weight':800,'letter-spacing':1.2,fill:'#f8dc97','font-family':'Figtree, sans-serif'},g);t.textContent='FINISH';continue;}
    const sym=h.type,n=h.val;
    // icons spaced out so the count reads at a glance: 1 · 2 side by side · 3 in a triangle · 4 in a square
    const at=ICON_AT[Math.min(4,n)]||ICON_AT[1],is=n===1?18:n===2?15:13.5;
    if(n<=2){const w=n===1?28:44;sv('rect',{x:h.x-w/2,y:h.y-12,width:w,height:24,rx:12,fill:CHIP[sym]},g);}
    else sv('circle',{cx:h.x,cy:h.y+(n===3?.4:0),r:n===3?19:19.5,fill:CHIP[sym]},g);
    for(const[dx,dy]of at){const u=sv('use',{href:'#i-'+sym,x:h.x+dx-is/2,y:h.y+dy-is/2,width:is,height:is},g);u.style.color=ICOL[sym];}
  }
  // seams between boards
  const seam=sv('g',{stroke:'rgba(0,0,0,.55)','stroke-width':2.4,'stroke-linecap':'round'},L.terrain);
  for(const c of MAP.conns)for(const[a,b]of c.edges){const[x1,y1,x2,y2]=edgeSeg(a,b);sv('line',{x1,y1,x2,y2},seam);}
  // board letters
  MAP.tiles.forEach((t,i)=>{if(t.end)return;const hs=byTile.get(i);let best=hs[0];const cc=pxOf(...t.c);
    for(const h of hs){const d=(h.y-cc[1])*2+(h.x-cc[0]);if(d<(best.y-cc[1])*2+(best.x-cc[0]))best=h;}
    const tx=sv('text',{x:best.x-R*.9,y:best.y-R*.55,'text-anchor':'middle','font-size':13,'font-family':'Young Serif, Georgia, serif',fill:'rgba(255,255,255,.5)','pointer-events':'none'},L.city);tx.textContent=t.name;});
  // city
  const C=MAP.city;
  sv('circle',{cx:C.x,cy:C.y,r:R*2.6,fill:'url(#cityGlow)'},L.city);
  const cg=sv('g',{transform:`translate(${C.x},${C.y})`},L.city);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;sv('line',{x1:Math.cos(a)*30,y1:Math.sin(a)*30-6,x2:Math.cos(a)*52,y2:Math.sin(a)*52-6,stroke:'rgba(255,214,107,.35)','stroke-width':2,'stroke-linecap':'round'},cg);}
  const steps=[[50,9],[40,9],[30,9],[20,9]];let y=22;
  sv('ellipse',{cx:0,cy:24,rx:30,ry:5,fill:'rgba(0,0,0,.35)'},cg);
  steps.forEach(([w,hh],i)=>{sv('rect',{x:-w/2,y:y-hh,width:w,height:hh,rx:1.5,fill:i%2?'#e9b440':'#f8d36c',stroke:'#8a5c10','stroke-width':1},cg);y-=hh;});
  sv('rect',{x:-6,y:y-11,width:12,height:11,fill:'#fbe08a',stroke:'#8a5c10','stroke-width':1},cg);
  sv('rect',{x:-2,y:y-7,width:4,height:7,fill:'#8a5c10'},cg);
  const ct=sv('text',{x:0,y:44,'text-anchor':'middle','font-family':'Young Serif, Georgia, serif','font-size':15,fill:'#f8dc97'},cg);ct.textContent='El Dorado';
  svgTextToHTML(svg,$('#blabels'));
  const st=$('#stage');st.onclick=onBoardClick;
  st.onpointerover=onBoardHover;
  st.onpointerout=e=>{if(drag)return;if(!e.relatedTarget||!e.relatedTarget.closest||!e.relatedTarget.closest('[data-t]'))hideHover();};
  pieceEls={};
}
function drawMountain(g,h){
  const x=h.x,y=h.y,v=hash(h.q,h.r);
  const s=v>.5?1:-1;
  sv('path',{d:`M${x-21} ${y+12} L${x-8*s} ${y-12} L${x-2*s} ${y-2} L${x+7*s} ${y-16} L${x+21} ${y+12} Z`,fill:'#6d766e'},g);
  sv('path',{d:`M${x+7*s} ${y-16} L${x+21} ${y+12} L${x+4*s} ${y+12} Z`,fill:'rgba(0,0,0,.25)'},g);
  sv('path',{d:`M${x-8*s} ${y-12} L${x-2*s} ${y-2} L${x-6*s} ${y+12} L${x-14*s} ${y+12} Z`,fill:'rgba(0,0,0,.18)'},g);
  sv('path',{d:`M${x+7*s} ${y-16} L${x+2*s} ${y-7} L${x+6*s} ${y-8} L${x+9*s} ${y-4} L${x+11.5*s} ${y-9} Z`,fill:'#eef3ee'},g);
  sv('path',{d:`M${x-8*s} ${y-12} L${x-11*s} ${y-7} L${x-8*s} ${y-8} L${x-5*s} ${y-6.5} Z`,fill:'#eef3ee'},g);
}
function edgeSeg(a,b){const A=hexAt(a),B=hexAt(b);const mx=(A.x+B.x)/2,my=(A.y+B.y)/2;let dx=B.x-A.x,dy=B.y-A.y;const l=Math.hypot(dx,dy);dx/=l;dy/=l;const px=-dy*R/2,py=dx*R/2;return[mx-px,my-py,mx+px,my+py];}
const blPos={};
function renderBlockades(){
  L.bl.innerHTML='';
  S.blockades.forEach((B,bi)=>{
    if(B.owner!==null){delete blPos[bi];return;}
    const edges=MAP.conns[B.conn].edges;const col=SYMCOL[B.k];
    const g=sv('g',null,L.bl);
    let sx=0,sy=0;
    const segs=edges.map(([a,b])=>edgeSeg(a,b));
    for(const[x1,y1,x2,y2]of segs){sv('line',{x1,y1,x2,y2,stroke:'#0b120f','stroke-width':11,'stroke-linecap':'round'},g);sx+=(x1+x2)/2;sy+=(y1+y2)/2;}
    for(const[x1,y1,x2,y2]of segs){sv('line',{x1,y1,x2,y2,stroke:col,'stroke-width':6.5,'stroke-linecap':'round'},g);sv('line',{x1,y1,x2,y2,stroke:'rgba(255,255,255,.35)','stroke-width':1.5,'stroke-linecap':'round','stroke-dasharray':'2 5'},g);}
    sx/=segs.length;sy/=segs.length;let best=null,bd=1e9;
    for(const[x1,y1,x2,y2]of segs){const mx=(x1+x2)/2,my=(y1+y2)/2,dd=Math.hypot(mx-sx,my-sy);if(dd<bd){bd=dd;best=[mx,my];}}
    blPos[bi]=best;
    const tg=UI.targets.get('B'+bi);
    const bg=sv('g',{class:'bl-badge'+(tg?' tgt':''),transform:`translate(${best[0]},${best[1]})`,'data-t':tg?'B'+bi:''},g);
    sv('circle',{r:27,fill:'rgba(0,0,0,0)',class:'bl-halo',stroke:'transparent'},bg);
    sv('rect',{x:-17,y:-17,width:34,height:34,rx:7,transform:'rotate(45)',fill:'#0b120f'},bg);
    sv('rect',{x:-15,y:-15,width:30,height:30,rx:6,transform:'rotate(45)',fill:col,stroke:'rgba(255,255,255,.45)','stroke-width':1.2},bg);
    const ink=B.k==='v'?'#4b3409':'#fff';
    const ic=B.k==='r'?'cards':B.k;const u=sv('use',{href:'#i-'+ic,x:-13,y:-8,width:15,height:15},bg);u.style.color=ink;
    const t=sv('text',{x:8,y:6,'text-anchor':'middle','font-size':16,'font-weight':800,fill:ink,'font-family':'Figtree, sans-serif'},bg);t.textContent=B.v;
    const nb=sv('g',{transform:'translate(0,-25)'},bg);sv('circle',{r:8,fill:'#0b120f',stroke:col,'stroke-width':1.5},nb);
    const nt=sv('text',{y:3.6,'text-anchor':'middle','font-size':10,'font-weight':800,fill:'#fff','font-family':'Figtree, sans-serif'},nb);nt.textContent=B.n;
    const tt=sv('title',null,bg);tt.textContent='Blockade #'+B.n+': '+blkLabel(B)+'. The first explorer to pay it keeps it (tiebreaker).';
  });
  $('#blabels2').innerHTML='';svgTextToHTML(L.bl,$('#blabels2'));
}
/* SVG <text> → absolutely placed HTML text at the same spot (same font, size, colour, anchor and baseline) */
const baseCache={};
function baselineOf(font){if(baseCache[font]!=null)return baseCache[font];
  const s=document.createElement('span');s.style.cssText=`position:absolute;visibility:hidden;font:${font};line-height:1;white-space:pre`;
  s.innerHTML='Hg<i style="display:inline-block;width:0;height:0;vertical-align:baseline"></i>';document.body.appendChild(s);
  const b=s.querySelector('i').offsetTop;s.remove();return baseCache[font]=b;}
function svgTextToHTML(root,layer){
  for(const t of[...root.querySelectorAll('text')]){const m=t.getCTM();if(!m)continue;
    const k=Math.hypot(m.a,m.b),p=new DOMPoint(+(t.getAttribute('x')||0),+(t.getAttribute('y')||0)).matrixTransform(m);
    const font=`${t.getAttribute('font-weight')||400} ${(+t.getAttribute('font-size')||16)*k}px ${t.getAttribute('font-family')||'sans-serif'}`;
    const a=t.getAttribute('text-anchor'),e=document.createElement('span');e.className='blabel';e.textContent=t.textContent;
    e.style.cssText=`left:${p.x}px;top:${p.y-baselineOf(font)}px;font:${font};color:${t.getAttribute('fill')||'#000'};letter-spacing:${(+t.getAttribute('letter-spacing')||0)*k}px;transform:translateX(${a==='middle'?'-50%':a==='end'?'-100%':'0'})`;
    layer.appendChild(e);t.remove();}
}
function discardAnchor(tk){if(tk[0]==='B'){const p=blPos[+tk.slice(1)];return p?[p[0],p[1]-40]:null;}const h=hexAt(tk);return[h.x,h.y-R*.95];}
function pulseDiscard(){const g=L.pips&&L.pips.querySelector('.dpips');if(g&&!reduceMotion)g.animate([{transform:g.getAttribute('data-t')+' scale(1.35)'},{transform:g.getAttribute('data-t')+' scale(1)'}],{duration:320,easing:'cubic-bezier(.2,.9,.3,1.3)'});}
function renderTargets(){
  L.hl.innerHTML='';L.pips.innerHTML='';hideHover();tgtEls={};
  if(UI.mode==='discardFor'&&UI.pending){const P=UI.pending,a=discardAnchor(P.tk);
    if(a){const n=P.need,w=n*19+14,t=`translate(${a[0]} ${a[1]-4})`;
      const g=sv('g',{class:'dpips',transform:t,'data-t':t,'pointer-events':'none'},L.pips);
      sv('rect',{x:-w/2,y:-14,width:w,height:28,rx:14,fill:'#0b120f',stroke:P.kind==='camp'?'#e08a74':'#d8dcd6','stroke-width':1.5},g);
      for(let i=0;i<n;i++)sv('circle',{cx:-(n-1)*9.5+i*19,cy:0,r:6.4,fill:i<UI.picks.length?(P.kind==='camp'?'#e08a74':'#eef2ec'):'none',stroke:P.kind==='camp'?'#e08a74':'#d8dcd6','stroke-width':2},g);}}
  for(const[k,t]of UI.targets){
    if(k[0]==='B')continue;
    const h=hexAt(k);
    const g=sv('g',{class:'tgt'+(t.kind==='rubble'||t.kind==='camp'?' dis':''),'data-t':k},L.hl);
    sv('polygon',{points:hexPts(h.x,h.y,R-3.4),class:'ring'},g);
    tgtEls[k]=g;
  }
}
let tgtEls={},pieceEls={};
function piecePos(pl,i){
  const k=S.players[pl].pieces[i];
  if(k!=='done'){const h=hexAt(k);return[h.x,h.y];}
  const C=MAP.city;let idx=0;
  S.players.forEach((p,a)=>p.pieces.forEach((pk,b)=>{if(pk==='done'&&(a<pl||(a===pl&&b<i)))idx++;}));
  const px=-C.dy,py=C.dx;const off=(idx-1.5)*18;
  return[C.x+px*off+C.dx*R*1.6,C.y+py*off+C.dy*R*1.6];
}
function renderPieces(){
  S.players.forEach((p,pl)=>p.pieces.forEach((k,i)=>{
    const id=pl+'-'+i;
    let g=pieceEls[id];
    if(!g){g=sv('g',{class:'piece'},L.pieces);
      const inner=sv('g',{class:'pin'},g);
      sv('circle',{class:'selring',r:R*.8,fill:'none',stroke:'#f8dc97','stroke-width':3,'stroke-dasharray':'5 4',opacity:0},inner);
      // whose turn it is: a pool of light and a bright ring on the ground under the miniature (static; fades in/out)
      const fx=sv('g',{class:'turnfx'},inner);
      sv('ellipse',{cx:0,cy:13.5,rx:28,ry:12,fill:'url(#turnGlow)'},fx);
      sv('ellipse',{cx:0,cy:13.5,rx:19,ry:7.5,fill:'none',stroke:'rgba(40,24,0,.55)','stroke-width':5},fx);
      sv('ellipse',{cx:0,cy:13.5,rx:19,ry:7.5,fill:'none',stroke:'#ffe08a','stroke-width':2.6},fx);
      const mk=sv('g',{class:'turnfx turnmark'},inner); // small marker above the head
      sv('path',{d:'M-7.5,-44 L7.5,-44 L0,-34 Z',fill:'#ffe08a',stroke:'rgba(40,24,0,.6)','stroke-width':1.5,'stroke-linejoin':'round'},mk);
      sv('ellipse',{cx:0,cy:13.5,rx:14,ry:5,fill:'rgba(0,0,0,.5)'},inner);
      inner.insertAdjacentHTML('beforeend',meepleSVG(p.color,p.pieces.length>1?i+1:0));
      pieceEls[id]=g;
      g.addEventListener('click',e=>{e.stopPropagation();if(dragMoved)return;onPiece(pl,i);});
    }
    if(!g.__anim){const[x,y]=piecePos(pl,i);g.setAttribute('transform',`translate(${x},${y})`);}
    const sel=pl===S.cur&&i===UI.piece&&k!=='done'&&!S.over&&S.players[pl].pieces.length>1;
    g.querySelector('.selring').setAttribute('opacity',sel?1:0);
    g.classList.toggle('turn',pl===S.cur&&k!=='done'&&!S.over);
  }));
  S.players[S.cur].pieces.forEach((k,i)=>{const g=pieceEls[S.cur+'-'+i];if(g)L.pieces.appendChild(g);});
}
function animatePiece(pl,i,keys){
  const g=pieceEls[pl+'-'+i];if(!g)return;
  const pts=keys.map(k=>{const h=hexAt(k);return[h.x,h.y];});
  if(S.players[pl].pieces[i]==='done')pts.push(piecePos(pl,i));
  g.__anim=true;UI.anim=true;
  const seg=pts.length-1,per=reduceMotion?1:200;let t0=null;
  const inner=g.querySelector('.pin');
  function step(ts){
    if(t0===null)t0=ts;const el=(ts-t0)/per;const si=Math.min(seg-1,Math.floor(el));const f=Math.min(1,el-si);
    const e=f<.5?2*f*f:1-Math.pow(-2*f+2,2)/2;
    const a=pts[si],b=pts[si+1];const x=a[0]+(b[0]-a[0])*e,y=a[1]+(b[1]-a[1])*e;const hop=Math.sin(Math.PI*f)*8;
    g.setAttribute('transform',`translate(${x.toFixed(2)},${y.toFixed(2)})`);inner.setAttribute('transform',`translate(0,${(-hop).toFixed(2)}) scale(${(1+hop*.012).toFixed(3)})`);
    if(el<seg)requestAnimationFrame(step);else{g.__anim=false;UI.anim=false;inner.removeAttribute('transform');renderPieces();}
  }
  requestAnimationFrame(step);
}
function onBoardClick(e){
  if(!canAct())return;
  if(dragMoved||drag)return;
  const t=e.target.closest('[data-t]');if(!t||!t.dataset.t)return;
  if(UI.anim)return;
  doMove(t.dataset.t);
}
function onBoardHover(e){
  if(drag)return;
  const t=e.target.closest&&e.target.closest('[data-t]');if(!t||!t.dataset.t)return;
  const tg=UI.targets.get(t.dataset.t);if(!tg)return;
  showHover(t.dataset.t,tg);
}
function targetLabel(k,tg){
  const act=S.turn.active&&S.turn.active.id===UI.card;
  if(tg.kind==='move'||tg.kind==='bl'){const budget=act?S.turn.active.left:def(UI.card).p;
    if(tg.kind==='move'&&hexAt(k).type==='g')return'Reach El Dorado · uses <b>'+tg.cost+'</b> of '+budget;
    return(tg.kind==='bl'?'Tear down blockade · ':'')+'Uses <b>'+tg.cost+'</b> of '+budget+' '+SYMNAME[tg.sym]+(budget>1?'s':'');}
  if(tg.kind==='native')return'Native: move here for free'+(tg.bl!=null?' and take the blockade':'');
  if(tg.kind==='nativebl')return'Native: tear down this blockade';
  if(tg.kind==='rubble')return'Rubble: discard <b>'+tg.need+'</b> card'+(tg.need>1?'s':'');
  if(tg.kind==='camp')return'Base camp: remove <b>'+tg.need+'</b> card'+(tg.need>1?'s':'')+' from the game';
  if(tg.kind==='blr')return'Blockade: discard <b>'+tg.need+'</b> card'+(tg.need>1?'s':'');
  return'';
}
function showHover(k,tg){
  hoverShown=true;L.path.innerHTML='';
  const pl=cur();const pi=tg.pi??UI.piece;const from=pl.pieces[pi];
  const keys=[from,...(tg.path||[])];
  if(keys.length>1){const d=keys.map((kk,i)=>{const h=hexAt(kk);return(i?'L':'M')+h.x.toFixed(1)+' '+h.y.toFixed(1);}).join(' ');
    sv('path',{d,fill:'none',stroke:'rgba(0,0,0,.45)','stroke-width':8,'stroke-linecap':'round','stroke-linejoin':'round'},L.path);
    sv('path',{d,fill:'none',stroke:'#f8dc97','stroke-width':3.4,'stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':'1 7'},L.path);
    for(const kk of keys.slice(1,-1)){const h=hexAt(kk);sv('circle',{cx:h.x,cy:h.y,r:4,fill:'#f8dc97'},L.path);}}
  const tip=$('#tip');tip.innerHTML=targetLabel(k,tg);
  let x,y;if(k[0]==='B'){const p=blPos[+k.slice(1)];x=p[0];y=p[1]-10;}else{const h=hexAt(k);x=h.x;y=h.y-R*.6;}
  const sx=(x-MAP.minX)*view.s+view.x,sy=(y-MAP.minY)*view.s+view.y;
  tip.style.left=sx+'px';tip.style.top=sy+'px';tip.style.opacity=1;
}
let hoverShown=false; // clearing an already-empty SVG group still re-lays out the whole board, so only clear when needed
function hideHover(){if(!hoverShown)return;hoverShown=false;if(L.path)L.path.innerHTML='';const t=$('#tip');if(t)t.style.opacity=0;}

/* =========================================================
   PAN / ZOOM
   ========================================================= */
const view={s:1,x:0,y:0};let userZoomed=false,dragMoved=false,movingTimer=0;
const vp=()=>$('#vp'),stage=()=>$('#stage');
let viewRaf=0;
/* Pan/zoom the way Leaflet does it: #stage is permanently its own GPU layer (will-change: transform) and gestures only change
   its transform, so they never repaint the board. The layer keeps the resolution it was drawn at, so once zooming has
   stopped (no wheel events for 250 ms, no fingers down, no glide running) the scale is baked into #bscale and the layer's
   own scale goes back to 1, in the same frame: one sharp redraw at a quiet moment. */
let baked=1,settleT=0,gesturing=0,gliding=false;
function applyView(){if(!viewRaf)viewRaf=requestAnimationFrame(()=>{viewRaf=0;stage().style.transform=`translate3d(${view.x}px,${view.y}px,0) scale(${view.s/baked})`;});
  scheduleSettle();}
function scheduleSettle(){clearTimeout(settleT);settleT=setTimeout(settle,250);}
function settle(){if(gesturing||gliding){scheduleSettle();return;}if(Math.abs(view.s/baked-1)<.005)return;
  requestAnimationFrame(()=>{if(gesturing||gliding){scheduleSettle();return;} // a glide or grab may have begun since the timer fired
    baked=view.s;$('#bscale').style.transform=`scale(${baked})`;stage().style.transform=`translate3d(${view.x}px,${view.y}px,0) scale(${view.s/baked})`;});}
function safeRect(){const v=vp();const W=v.clientWidth,H=v.clientHeight;const cw=cardW();
  // top: just under the prompt, which sits under the floating market strip
  let t=W<600?108:112;const pr=$('#prompt'),vr=v.getBoundingClientRect();if(pr&&pr.offsetHeight)t=Math.max(t,pr.getBoundingClientRect().bottom-vr.top+10);
  const mk=$('#mkt'),mr=UI.mktOpen&&S&&mk?mk.offsetWidth+(W<600?10:28):0; // market column on the right
  return{l:W<600?8:62,t,r:W-16-mr,b:H-cw*1.4*.62,W,H};}
function fit(anim){
  if(!MAP)return;const r=safeRect();if(!r.W)return;
  const aw=r.r-r.l,ah=r.b-r.t;
  let s=Math.min(aw/MAP.w,ah/MAP.h);view.s=s;view.x=r.l+(aw-MAP.w*s)/2;view.y=r.t+(ah-MAP.h*s)/2;
  if(s*R<13&&S){s=Math.min(ah/MAP.h,13/R*1.6);view.s=s;const c=focusPoint();view.x=(r.l+r.r)/2-(c[0]-MAP.minX)*s;view.y=r.t+(ah-MAP.h*s)/2;clampView();}
  if(anim)glide();applyView();userZoomed=false;
}
function glide(){stage().style.transition='transform .45s cubic-bezier(.2,.8,.2,1)';gliding=true;clearTimeout(glide.t);glide.t=setTimeout(()=>{stage().style.transition='';gliding=false;scheduleSettle();},480);}
function focusPoint(){const pl=cur();const k=pl.pieces[UI.piece]&&pl.pieces[UI.piece]!=='done'?pl.pieces[UI.piece]:pl.pieces.find(x=>x!=='done');if(!k)return[MAP.city.x,MAP.city.y];const h=hexAt(k);return[h.x,h.y];}
function clampView(){const v=vp();const W=v.clientWidth,H=v.clientHeight;const bw=MAP.w*view.s,bh=MAP.h*view.s;
  if(bw<=W)view.x=Math.max(Math.min(view.x,W-bw),0);else view.x=Math.min(W*.4,Math.max(W*.6-bw,view.x));
  if(bh<=H)view.y=Math.max(Math.min(view.y,H-bh),0);else view.y=Math.min(H*.4,Math.max(H*.6-bh,view.y));}
function ensureVisible(){
  if(!MAP||!S)return;const r=safeRect();const c=focusPoint();
  const sx=(c[0]-MAP.minX)*view.s+view.x,sy=(c[1]-MAP.minY)*view.s+view.y;const m=40;
  if(sx>r.l+m&&sx<r.r-m&&sy>r.t+m&&sy<r.b-m)return;
  view.x+=(r.l+r.r)/2-sx;view.y+=(r.t+r.b)/2-sy;clampView();glide();applyView();}
function zoomAt(px,py,f){const ns=Math.max(.25,Math.min(3.2,view.s*f));const k=ns/view.s;view.x=px-(px-view.x)*k;view.y=py-(py-view.y)*k;view.s=ns;applyView();userZoomed=true;hideHover();}
function setupPanZoom(){
  const v=vp();
  v.addEventListener('wheel',e=>{e.preventDefault();const r=v.getBoundingClientRect();
    const mouseWheel=e.deltaMode!==0||(Math.abs(e.deltaX)<1&&Number.isInteger(e.deltaY)&&Math.abs(e.deltaY)>=40);
    // zoom factor as d3-zoom normalises wheel deltas (pixels / lines / pages; ctrl+wheel = trackpad pinch on Chrome, Edge, Firefox)
    if(e.ctrlKey||mouseWheel)zoomAt(e.clientX-r.left,e.clientY-r.top,2**(-e.deltaY*(e.deltaMode===1?.05:e.deltaMode?1:.002)*(e.ctrlKey?10:1)));
    else{view.x-=e.deltaX;view.y-=e.deltaY;applyView();userZoomed=true;hideHover();}
  },{passive:false});
  const ptrs=new Map();let start=null,pinch=null;
  const local=(cx,cy)=>{const r=v.getBoundingClientRect();return[cx-r.left,cy-r.top];};
  const beginPan=()=>{const[p]=[...ptrs.values()];start={x:p[0],y:p[1],vx:view.x,vy:view.y};};
  const beginPinch=()=>{const p=[...ptrs.values()].slice(0,2);const m=local((p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2);
    // remember which board point sits under the fingers' midpoint, so it stays under them
    pinch={d:Math.max(1,Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1])),s:view.s,bx:(m[0]-view.x)/view.s,by:(m[1]-view.y)/view.s};start=null;};
  v.addEventListener('pointerdown',e=>{stage().style.transition='';gliding=false;ptrs.set(e.pointerId,[e.clientX,e.clientY]);gesturing=ptrs.size;
    if(ptrs.size===1){dragMoved=false;beginPan();}
    else if(ptrs.size===2){beginPinch();dragMoved=true;hideHover();}});
  window.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,[e.clientX,e.clientY]);
    if(pinch&&ptrs.size>=2){const p=[...ptrs.values()].slice(0,2);const d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);
      const m=local((p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2);
      const ns=Math.max(.25,Math.min(3.2,pinch.s*d/pinch.d));
      view.s=ns;view.x=m[0]-pinch.bx*ns;view.y=m[1]-pinch.by*ns;applyView();userZoomed=true;return;}
    if(start){const dx=e.clientX-start.x,dy=e.clientY-start.y;if(!dragMoved&&Math.hypot(dx,dy)>5){dragMoved=true;v.classList.add('drag');hideHover();try{v.setPointerCapture(e.pointerId);}catch(_){}}
      // follow the pointer from the first pixel (a 5 px dead zone made the board jump when the drag began); 5 px still tells a drag from a click
      view.x=start.vx+dx;view.y=start.vy+dy;applyView();if(dragMoved)userZoomed=true;}});
  const up=e=>{if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);
    if(ptrs.size===1){pinch=null;beginPan();} // one finger left: continue panning from here, no jump
    else if(ptrs.size>=2)beginPinch();
    gesturing=ptrs.size;if(!ptrs.size){start=null;pinch=null;v.classList.remove('drag');setTimeout(()=>dragMoved=false,0);scheduleSettle();}};
  window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
  $('#zin').onclick=()=>{const v2=vp();zoomAt(v2.clientWidth/2,v2.clientHeight/2,1.25);};
  $('#zout').onclick=()=>{const v2=vp();zoomAt(v2.clientWidth/2,v2.clientHeight/2,.8);};
  $('#zfit').onclick=()=>fit(true);
  let lastW=v.clientWidth;
  new ResizeObserver(()=>{updateMktH();const w=v.clientWidth;const widthChanged=Math.abs(w-lastW)>2;lastW=w;
    if(!userZoomed&&(widthChanged||!ptrs.size))fit();if(S)layoutCards();}).observe(v);
  ['gesturestart','gesturechange','gestureend'].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}));
  // Safari's trackpad pinch arrives as gesture events (not ctrl+wheel); touch pinches are already handled by the pointers above
  let g0=1;v.addEventListener('gesturestart',e=>{g0=view.s;});
  v.addEventListener('gesturechange',e=>{if(ptrs.size>=2||!e.scale)return;const[x,y]=local(e.clientX,e.clientY);zoomAt(x,y,g0*e.scale/view.s);});
  document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
}

/* =========================================================
   CARDS — art & markup
   ========================================================= */
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function icon(sym,cls){return `<svg class="${cls||''}" viewBox="-10 -10 20 20"><use href="#i-${sym==='*'?'x':sym}" x="-10" y="-10" width="20" height="20"/></svg>`;}
const SCENE={
 g:`<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd19b"/><stop offset=".55" stop-color="#2f7a48"/><stop offset="1" stop-color="#123821"/></linearGradient></defs><rect width="100" height="70" fill="url(#sg)"/><path d="M0 40 Q20 30 40 38 T80 34 T100 36 V70 H0Z" fill="#1f5a35" opacity=".8"/><path d="M-5 70 Q5 30 22 18 Q14 40 18 70Z M105 70 Q95 26 76 14 Q86 40 82 70Z" fill="#0f3320"/><path d="M-4 16 Q14 12 26 26 Q10 26 -4 30Z M104 10 Q84 8 72 22 Q90 22 104 26Z" fill="#185c34"/><path d="M40 0 L52 0 L70 70 L30 70Z" fill="#fff" opacity=".07"/>`,
 b:`<defs><linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3fb"/><stop offset=".45" stop-color="#4d9ad6"/><stop offset="1" stop-color="#143e66"/></linearGradient></defs><rect width="100" height="70" fill="url(#sb)"/><path d="M0 30 Q25 26 50 30 T100 30 V36 H0Z" fill="#2e6a3f" opacity=".85"/><path d="M0 44 Q12 40 25 44 T50 44 T75 44 T100 44" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" fill="none"/><path d="M0 54 Q12 50 25 54 T50 54 T75 54 T100 54" stroke="#fff" stroke-opacity=".25" stroke-width="1.6" fill="none"/><path d="M0 63 Q12 59 25 63 T50 63 T75 63 T100 63" stroke="#fff" stroke-opacity=".18" stroke-width="1.6" fill="none"/>`,
 y:`<defs><linearGradient id="sy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a8"/><stop offset=".5" stop-color="#f0a948"/><stop offset="1" stop-color="#8f4f16"/></linearGradient></defs><rect width="100" height="70" fill="url(#sy)"/><circle cx="72" cy="24" r="12" fill="#fff4c9" opacity=".8"/><path d="M0 50 L10 50 L16 40 L22 50 L34 50 L42 38 L50 50 L64 50 L70 42 L76 50 L100 50 V70 H0Z" fill="#6b3a10" opacity=".85"/><path d="M0 58 Q50 52 100 58 V70 H0Z" fill="#4d290a"/>`,
 x:`<defs><radialGradient id="sx" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#c4b38b"/></radialGradient></defs><rect width="100" height="70" fill="url(#sx)"/><g stroke="#8a7a55" stroke-opacity=".35" fill="none"><circle cx="50" cy="35" r="26"/><circle cx="50" cy="35" r="18"/><path d="M50 3 V67 M18 35 H82 M27 12 L73 58 M73 12 L27 58"/></g>`,
 p:`<defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#261646"/><stop offset=".7" stop-color="#5a3a91"/><stop offset="1" stop-color="#7d5bb8"/></linearGradient></defs><rect width="100" height="70" fill="url(#sp)"/><g fill="#fff"><circle cx="12" cy="10" r=".9"/><circle cx="30" cy="18" r=".7"/><circle cx="84" cy="12" r="1"/><circle cx="70" cy="28" r=".6"/><circle cx="20" cy="34" r=".6"/><circle cx="90" cy="38" r=".8"/><circle cx="45" cy="8" r=".6"/></g><circle cx="82" cy="18" r="7" fill="#f3ecff" opacity=".8"/><circle cx="85" cy="16" r="6" fill="#2b1a4d"/><path d="M0 58 Q30 50 60 56 T100 54 V70 H0Z" fill="#170d2c"/>`,
};
const GLYPH={
 transmitter:`<g stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M0 -4 L-6 10 M0 -4 L6 10 M-3.6 4 H3.6 M-4.8 7 H4.8"/><path d="M-4.5 -8 Q-7 -4 -4.5 0 M4.5 -8 Q7 -4 4.5 0 M-8 -10.5 Q-12 -4 -8 2.5 M8 -10.5 Q12 -4 8 2.5"/></g><circle cy="-4" r="1.8" fill="#fff"/>`,
 cartographer:`<path d="M-10 -7 L-3.5 -9.5 L3.5 -7 L10 -9.5 V7 L3.5 9.5 L-3.5 7 L-10 9.5Z" fill="#f4e7c3" stroke="#6b4c1a" stroke-width=".8"/><path d="M-3.5 -9.5 V7 M3.5 -7 V9.5" stroke="#6b4c1a" stroke-width=".7"/><path d="M-7 3 Q-4 -3 0 0 T7 -4" stroke="#b33" stroke-width="1.1" fill="none" stroke-dasharray="1.6 1.2"/><path d="M5.5 -5.5 l2.4 2.4 M7.9 -5.5 l-2.4 2.4" stroke="#b33" stroke-width="1.1"/>`,
 scientist:`<path d="M-3 -10 H3 M-2 -10 V-3 L-8 8 Q-8.6 10 -6.4 10 H6.4 Q8.6 10 8 8 L2 -3 V-10" fill="#e8f4ff" fill-opacity=".25" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/><path d="M-5.6 4 H5.6 L7.4 8.2 Q7.6 9 6.6 9 H-6.6 Q-7.6 9 -7.4 8.2Z" fill="#8ef0c4"/><circle cx="-1" cy="1" r="1" fill="#8ef0c4"/><circle cx="1.5" cy="-2" r=".7" fill="#8ef0c4"/>`,
 compass:`<circle r="10" fill="#e9c46a" stroke="#6b4c1a" stroke-width="1"/><circle r="7.6" fill="#fff8e6"/><path d="M0 -7 L2 0 L0 7 L-2 0Z" fill="#b33"/><path d="M0 0 L2 0 L0 7 L-2 0Z" fill="#334"/><circle r="1.1" fill="#6b4c1a"/>`,
 travellog:`<path d="M-9 -8 Q-4.5 -9.6 0 -7.4 Q4.5 -9.6 9 -8 V8 Q4.5 6.4 0 8.6 Q-4.5 6.4 -9 8Z" fill="#f4e7c3" stroke="#6b4c1a" stroke-width=".9"/><path d="M0 -7.4 V8.6" stroke="#6b4c1a" stroke-width=".8"/><path d="M-7 -4 H-2 M-7 -1 H-2 M-7 2 H-3 M2 -4 H7 M2 -1 H7" stroke="#7d6a45" stroke-width=".7"/><path d="M3.5 1 L7 1 L7 7.5 L5.25 6 L3.5 7.5Z" fill="#b33"/>`,
 native:`<path d="M-6 10 Q-8 0 -2 -6 Q3 -11 8 -10 Q8 -4 3 2 Q-2 7 -6 10Z" fill="#f2e6c9" stroke="#6b4c1a" stroke-width=".8"/><path d="M-6 10 Q0 0 7 -9" stroke="#6b4c1a" stroke-width=".9" fill="none"/><path d="M-3.5 1 L-7 -1 M-1 -2.5 L-4.5 -5 M1.5 -5 L-1.5 -8.4 M1 1 L4.6 2 M3.4 -2 L7 -1" stroke="#b5553a" stroke-width="1"/>`,
};
function cardArt(t){
  const d=CT[t];let emb;
  if(d.c==='p')emb=`<g transform="translate(50 35) scale(2.1)">${GLYPH[t]}</g>`;
  else{const sym=d.s==='*'?'x':d.s;const col={j:'#f2fff5',w:'#f2f9ff',v:'#ffe08a',x:'#8a6a1f'}[sym];
    emb=`<g transform="translate(50 36)"><ellipse cx="0" cy="22" rx="18" ry="3.5" fill="rgba(0,0,0,.25)"/><g filter="none" style="color:${col}"><use href="#i-${sym}" x="-19" y="-19" width="38" height="38" style="color:rgba(0,0,0,.35)" transform="translate(1.5 2)"/><use href="#i-${sym}" x="-19" y="-19" width="38" height="38"/></g></g>`;}
  return `<svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice">${cardBg(t)}${emb}</svg>`;
}
function cardHTML(t){
  const d=CT[t];let body;
  if(d.c==='p'){const f=d.face||d.txt;body=`<div class="c-txt${f.length>16?' long':''}">${esc(f)}</div>`;}
  else{const sym=d.s==='*'?'*':d.s;body=`<div class="c-icons${d.p>=5?' many':''}">${icon(sym).repeat(d.p)}</div><div class="c-sub">${d.s==='*'?'Any one symbol':plural(d.p,SYMNAME[d.s])}</div>`;}
  const pow=d.c!=='p'?`<div class="c-pow"><b>${d.p}</b>${icon(d.s)}</div>`:'';
  const foot=`<div class="c-foot">${d.cost!=null?`<span class="c-cost">${d.cost}</span>`:'<span></span>'}${d.once?'<span class="c-once">Single use</span>':''}</div>`;
  return `<div class="cface k-${d.c}"><div class="c-art">${cardArt(t)}</div>${pow}<div class="c-title">${esc(d.n)}</div><div class="c-body">${body}</div>${foot}</div>`;
}
function cardTitle(t){const d=CT[t];let s=d.n;if(d.c!=='p')s+=` — ${d.p} ${d.s==='*'?'joker (machete, paddle or coin)':SYMNAME[d.s]}`;else s+=' — '+d.txt;if(d.once)s+=' Single use: removed from the game after its effect.';if(d.cost!=null)s+=` Cost ${d.cost}.`;return s;}
const cardW=()=>parseFloat(getComputedStyle($('#app')).getPropertyValue('--cw'))||132; // set per game-area size (container queries)

/* =========================================================
   CARDS — layout (hand floats over the board, fanned)
   ========================================================= */
const cardEls=new Map();let lastPlayer=-1;
function pileRect(which){const e=$(which==='deck'?'#deckStack':'#discStack');return e.getBoundingClientRect();}
function appRect(){return $('#app').getBoundingClientRect();}
function setT(el,x,y,rot,sc){el.__t={x,y,rot,sc};el.style.transform=`translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(3)})`;}
function placeAt(el,rect,rot){const cw=cardW(),ch=cw*1.4,A=appRect();const sc=rect.width/cw;setT(el,rect.left-A.left-(cw-rect.width)/2,rect.top-A.top-(ch-rect.height)/2,rot||0,sc);}
function layoutCards(){
  if(!S)return;
  const A=appRect(),W=A.width,H=A.height,cw=cardW(),ch=cw*1.4;
  document.documentElement.style.setProperty('--handH',(ch*.82)+'px');
  const pl=hp();const hidden=UI.cover;
  const hand=hidden?[]:pl.hand,play=hidden?[]:pl.play;
  const n=hand.length;
  const pileW=W<600?54:74;
  const avail=W-2*(pileW+32)-(W>900?140:0);
  const step=n>1?Math.min(cw*.86,Math.max(cw*.32,(avail-cw)/(n-1))):0;
  const hi=hand.indexOf(UI.hover);
  const paying=UI.mode==='pay'&&UI.buy&&!hidden;
  const lifted=id=>(UI.mode==='card'&&UI.card===id)||(!paying&&UI.picks.includes(id))||(drag&&drag.started&&drag.id===id);
  // purchase slot above the hand, spending tray to its right
  const bw=Math.round(cw*(W<600?.78:.72)),bx=W/2-bw/2,by=H-ch*1.02-14-bw*1.4-26;
  const bs=$('#buySlot');if(bs){bs.style.setProperty('--bw',bw+'px');bs.style.setProperty('--bx',bx+'px');bs.style.setProperty('--by',by+'px');}
  const tsc=bw/cw*.78,tw=cw*tsc;let tk=0;
  hand.forEach((id,i)=>{
    const el=cardEls.get(id);if(!el||el.classList.contains('free'))return;
    const off=i-(n-1)/2;
    let x=W/2+off*step-cw/2,y=H-ch*(W<600?.78:.9)+Math.abs(off)*Math.abs(off)*(W<600?1.6:2.6),rot=off*(W<600?2.4:3.2),sc=1,z=10+i;
    if(hi>=0&&i!==hi)x+=Math.sign(i-hi)*cw*.16;
    if(paying&&UI.picks.includes(id)){const k=tk++;x=bx+bw+18+k*tw*.55-(cw-tw)/2;y=by+bw*1.4*.5-ch/2+k*3;rot=4+k*3;sc=tsc;z=70+k;el.style.zIndex=z;setT(el,x,y,rot,sc);return;}
    if(lifted(id)){y=H-ch*1.02-14;rot*=.4;z=60+i;}
    if(i===hi&&!drag){y=H-ch*1.12-14;rot=0;sc=1.14;z=90;}
    el.style.zIndex=z;setT(el,x,y,rot,sc);
  });
  // play area: small overlapping stack left of the discard pile
  const psc=.46,pw=cw*psc,ph=ch*psc;
  const baseX=W-16-pileW-24-pw;const py=H-16-(W<600?76:104)+((W<600?76:104)-ph);
  play.forEach((id,i)=>{const el=cardEls.get(id);if(!el)return;const k=play.length-1-i;
    const vx=baseX-k*pw*.42;const x=vx-(cw-pw)/2,y=py-(ch-ph)/2;el.style.zIndex=5+i;setT(el,x,y,0,psc);});
  const lbl=$('#playLbl');lbl.style.opacity=play.length?1:0;lbl.style.left=(baseX-(play.length-1)*pw*.42)+'px';lbl.style.top=(py-18)+'px';
}
function renderCards(){
  const pl=hp();const layer=$('#cards');const vi=viewIdx();
  const switching=lastPlayer!==vi;lastPlayer=vi;const acting=canAct();
  const hidden=UI.cover;
  const want=hidden?[]:pl.hand.slice(),wantPlay=hidden?[]:pl.play.slice();
  const keep=new Set([...want,...wantPlay]);
  const A=appRect();
  for(const[id,el]of cardEls){if(keep.has(id))continue;
    cardEls.delete(id);el.style.pointerEvents='none';el.classList.add('anim');
    const t=el.__t||{x:0,y:0,rot:0,sc:1};
    if(switching||!S.cards[id]){setT(el,t.x,A.height+40,t.rot,t.sc);el.style.opacity=0;}
    else if(S.trash.includes(id)){setT(el,t.x,t.y-90,t.rot-8,t.sc*.9);el.style.opacity=0;}
    else{placeAt(el,pileRect('disc'),0);}
    setTimeout(()=>el.remove(),380);
  }
  const deckR=pileRect('deck');
  let k=0;
  for(const id of[...want,...wantPlay]){
    let el=cardEls.get(id);
    if(!el){el=document.createElement('div');el.className='card';el.innerHTML=cardHTML(typeOf(id));el.title=cardTitle(typeOf(id));
      layer.appendChild(el);cardEls.set(id,el);wireCard(el,id);
      if(switching){const cw=cardW();setT(el,A.width/2-cw/2,A.height+30,0,1);}
      else placeAt(el,deckR,0);
      el.style.transitionDelay=(switching?k*50:k*70)+'ms';k++;
      void el.offsetWidth;el.classList.add('anim');
      setTimeout(()=>{el.style.transitionDelay='';},400+k*70);
    }
  }
  // classes
  const act=S.turn.active;
  for(const id of want){const el=cardEls.get(id);
    let dim=false;
    if(UI.mode==='transmit')dim=id!==UI.card;
    if(acting&&(UI.mode==='idle'||UI.mode==='card')&&UI.card!==id)dim=!cardUsable(id);
    el.classList.toggle('sel',(UI.mode==='card'||UI.mode==='transmit')&&UI.card===id);
    el.classList.toggle('pick',UI.picks.includes(id));
    const dp=UI.mode==='discardFor'&&UI.picks.includes(id);el.classList.toggle('dpick',dp);if(dp)el.dataset.pk=UI.pending.kind==='camp'?'Remove':'Discard';
    el.classList.toggle('dim',dim);el.classList.remove('inplay','act');
    const b=el.querySelector('.left');if(b)b.remove();
  }
  for(const id of wantPlay){const el=cardEls.get(id);const isA=act&&act.id===id;
    let b=el.querySelector('.left');if(isA){if(!b){b=document.createElement('div');b.className='left';el.appendChild(b);}b.textContent=act.left+' left';}else if(b)b.remove();
    el.classList.toggle('sel',isA&&UI.mode==='card'&&UI.card===id);el.classList.add('inplay');el.classList.toggle('act',!!isA);el.classList.remove('pick','dim');}
  layoutCards();
  // piles
  $('#deckN').textContent=pl.deck.length;$('#discN').textContent=pl.discard.length;
  const dn=pl.deck.length;$('#deckStack').innerHTML=dn?'<div class="back'+(dn>2?' b3':'')+'"></div>'.repeat(0)+(dn>2?'<div class="back b3"></div>':'')+(dn>1?'<div class="back b2"></div>':'')+'<div class="back"></div>':'<div class="empty-slot"></div>';
  const ds=$('#discStack');const top=pl.discard[pl.discard.length-1];
  if((top||'')!==(ds.dataset.top||'')||switching){ds.dataset.top=top||'';ds.innerHTML=top?`<div class="mcard" style="--cw:${ds.clientWidth||74}px;position:absolute;inset:0">${cardHTML(typeOf(top))}</div>`:'<div class="empty-slot"></div>';}
}
function flyToDiscard(t,from){
  if(!from||!from.width)return;
  const layer=$('#cards');const el=document.createElement('div');el.className='card';el.innerHTML=cardHTML(t);el.style.pointerEvents='none';el.style.zIndex=200;
  layer.appendChild(el);placeAt(el,from,0);void el.offsetWidth;el.classList.add('anim');el.style.transitionDuration='.5s';
  requestAnimationFrame(()=>{const A=appRect(),cw=cardW();const t0=el.__t;setT(el,t0.x,t0.y-30,0,t0.sc*1.15);setTimeout(()=>{placeAt(el,pileRect('disc'),6);},180);setTimeout(()=>el.remove(),720);});
}
function marketRect(src,idx){const e=document.querySelector(src==='m'?(UI.mktOpen?`#market [data-i="${idx}"] .mcard`:'#mktBtn'):(UI.allOpen?`#reserve [data-i="${idx}"] .mcard`:(UI.mktOpen?'#allTile':'#mktBtn')));if(!e)return null;const r=e.getBoundingClientRect();
  if(src==='r'){const cw=86;return{left:r.left+r.width/2-cw/2,top:r.top-cw*.7+r.height/2,width:cw,height:cw*1.4};}return r;}

/* =========================================================
   OTHER PLAYERS' TURNS. What an AI or an online opponent plays, spends, buys and removes is shown in a row of small
   cards under the prompt (the same card faces as your own hand), with a caption per step; played cards fly out of their
   player chip, a bought card flies out of the market, and their moves leave a dotted trail on the board. After their
   turn the row stays as a recap until you act. Public information only: the engine's 'play' events carry the types of
   cards that became public (played, spent, removed, taken) and just counts for the cards kept at the end of a turn.
   ========================================================= */
const FEED={pl:-1,ended:false,groups:[],seq:0,fly:[],trail:[]};
/* whose actions get shown: the AIs (local), everyone but me (online); never in replays, where the actor's own hand is shown */
function feedWatch(pl){if(!S||REPLAY||pl==null||!S.players[pl])return false;return online()?S.owners[pl]!==myId():isAI(pl);}
function feedReset(){FEED.pl=-1;FEED.ended=false;FEED.groups=[];FEED.fly=[];FEED.trail=[];}
function feedClear(){if(FEED.pl<0&&!FEED.groups.length)return;feedReset();feedTrail();}
function chipRect(pl){const c=document.querySelectorAll('#players .pchip')[pl];return c?c.getBoundingClientRect():null;}
/* one engine event of a watched player (called from playEvents, before render) */
function feedEvent(e){
  if(e.e==='play'){
    if(FEED.pl!==e.pl||FEED.ended){feedReset();FEED.pl=e.pl;}
    const last=FEED.groups[FEED.groups.length-1];
    if(e.k==='move'&&e.more&&last&&last.k==='move'){last.n+=e.n;last.v++;return;} // leftover strength: same card, more spaces
    if(e.k==='trash'&&!e.ts.length)return;
    if(e.k==='end')FEED.ended=true;
    const g={...e,id:++FEED.seq,v:0};FEED.groups.push(g);
    if(g.ts&&g.ts.length)FEED.fly.push({gid:g.id,kind:'hand',from:chipRect(e.pl)});
    return;}
  if(FEED.pl!==e.pl)return;
  const last=FEED.groups[FEED.groups.length-1];if(!last)return;
  if(e.e==='gain'&&(last.k==='buy'||last.k==='transmit'))FEED.fly.push({gid:last.id,kind:'got',from:marketRect(e.src,e.idx)});
  else if(e.e==='block'){last.bl=e.n;last.v++;}
  else if(e.e==='arrive'){last.arr=true;last.v++;}
  else if(e.e==='move'){FEED.trail.push(e.path);feedTrail();}
}
function feedCap(g){
  const one=g.ts&&g.ts.length===1?CT[g.ts[0]].n:'',bl=g.bl?` · blockade #${g.bl}`:'',arr=g.arr?' · <b>El Dorado</b>':'';
  switch(g.k){
    case 'move':return`${esc(one)} · <b>${g.n}</b> ${g.n===1?'space':'spaces'}`+bl+arr;
    case 'native':return(g.n?'Native · <b>1</b> space':'Native')+bl+arr;
    case 'rubble':return`Discarded <b>${g.ts.length}</b> · rubble`;
    case 'camp':return`Removed <b>${g.ts.length}</b> · base camp`;
    case 'blr':return`Discarded <b>${g.ts.length}</b>`+bl;
    case 'action':return`${esc(one)} · drew <b>${g.n}</b>`;
    case 'trash':return`Removed <b>${g.ts.length}</b> from the game`;
    case 'transmit':return`Took <b>${esc(CT[g.got].n)}</b>`;
    case 'buy':return`Bought <b>${esc(CT[g.got].n)}</b> for ${fmt(g.paid)}`;
  }
  return'';
}
function feedGroupHTML(g){
  if(g.k==='end')return`<div class="fg fend" data-g="${g.id}"><div class="fpill">Ended turn</div><div class="fcap">${g.kept?`kept <b>${g.kept}</b>`:'kept none'}${g.disc?` · discarded ${g.disc}`:''}</div></div>`;
  const mini=(t,got)=>`<div class="fc${got?' got':''}" data-t="${t}" title="${esc(cardTitle(t))}"><div class="mcard">${cardHTML(t)}</div></div>`;
  return`<div class="fg f-${g.k}" data-g="${g.id}"><div class="frc"><div class="fcs">${g.ts.map(t=>mini(t)).join('')}</div>${g.got?`<span class="farr" aria-hidden="true">›</span>${mini(g.got,1)}`:''}</div><div class="fcap">${feedCap(g)}</div></div>`;
}
function feedRender(){
  const F=$('#feed');if(!F)return;
  if(!S||REPLAY||UI.cover||!FEED.groups.length||!S.players[FEED.pl]){if(!F.hidden){F.hidden=true;F.innerHTML='';F.dataset.pl='';}return;}
  if(F.dataset.pl!==String(FEED.pl)){F.innerHTML='<div class="fwho"></div><div class="frow"></div>';F.dataset.pl=FEED.pl;}
  const p=S.players[FEED.pl],recap=S.cur!==FEED.pl||S.over; // their turn is over: say whose turn this was
  const who=F.querySelector('.fwho'),wh=recap?`<i style="background:${p.color}"></i>${esc(p.name)}’s turn`:'';if(who.innerHTML!==wh)who.innerHTML=wh;who.hidden=!recap;
  const row=F.querySelector('.frow'),ids=new Set(FEED.groups.map(g=>String(g.id)));
  for(const el of[...row.children])if(!ids.has(el.dataset.g))el.remove();
  for(const g of FEED.groups){let el=row.querySelector(`[data-g="${g.id}"]`);
    if(!el){row.insertAdjacentHTML('beforeend',feedGroupHTML(g));el=row.lastElementChild;if(!reduceMotion)el.classList.add('new');el.dataset.v=g.v;}
    else if(el.dataset.v!==String(g.v)){el.dataset.v=g.v;const c=el.querySelector('.fcap');if(c)c.innerHTML=feedCap(g);}}
  F.hidden=false;
  // the newest steps that fit; older ones step out whole (never half a card or half a caption)
  const kids=[...row.children];kids.forEach(k=>k.classList.remove('gone'));
  const W=row.clientWidth,gap=parseFloat(getComputedStyle(row).columnGap)||0;let tot=-gap,cut=false;
  for(let i=kids.length-1;i>=0;i--){tot+=kids[i].offsetWidth+gap;if(cut||(tot>W+1&&i<kids.length-1)){cut=true;kids[i].classList.add('gone');}}
  if(FEED.fly.length){const list=FEED.fly;FEED.fly=[];if(!reduceMotion)feedFly(list);}
}
/* cards fly into the row: out of the player's chip (from their hand) or out of the market (a card they bought or took) */
function feedFly(list){
  for(const f of list){
    const gel=document.querySelector(`#feed [data-g="${f.gid}"]`);if(!gel||!f.from||!f.from.width)continue;
    [...gel.querySelectorAll(f.kind==='got'?'.fc.got':'.fcs .fc')].forEach((tEl,i)=>{
      const to=tEl.getBoundingClientRect();if(!to.width)return;
      const el=document.createElement('div');el.className='card';el.innerHTML=cardHTML(tEl.dataset.t);el.style.pointerEvents='none';el.style.zIndex=200;$('#cards').appendChild(el);
      const fr=f.kind==='hand'?{left:f.from.left+f.from.width/2-to.width*.4,top:f.from.top+f.from.height/2-to.height*.4,width:to.width*.8,height:to.height*.8}:f.from;
      placeAt(el,fr,f.kind==='hand'?-8:0);if(f.kind==='hand')el.style.opacity=0;tEl.style.opacity=0;
      void el.offsetWidth;el.classList.add('anim');el.style.transitionDuration=f.kind==='got'?'.55s':'.4s';el.style.transitionDelay=(i*70)+'ms';
      placeAt(el,to,0);el.style.opacity=1;
      setTimeout(()=>{tEl.style.opacity='';el.remove();},(f.kind==='got'?560:410)+i*70);
    });
  }
}
/* the watched player's moves this turn, as a dotted trail in their colour (static; redrawn only when it changes) */
function feedTrail(){
  if(!L.trail)return;L.trail.innerHTML='';const p=S&&S.players[FEED.pl];if(!p||!FEED.trail.length)return;
  for(const keys of FEED.trail){if(keys.length<2)continue;const d=keys.map((k,i)=>{const h=hexAt(k);return(i?'L':'M')+h.x.toFixed(1)+' '+h.y.toFixed(1);}).join(' ');
    sv('path',{d,fill:'none',stroke:'rgba(0,0,0,.45)','stroke-width':7,'stroke-linecap':'round','stroke-linejoin':'round'},L.trail);
    sv('path',{d,fill:'none',stroke:p.color,'stroke-width':3.2,'stroke-linecap':'round','stroke-linejoin':'round','stroke-dasharray':'.5 8'},L.trail);
    const h=hexAt(keys[0]);sv('circle',{cx:h.x,cy:h.y,r:5,fill:p.color,stroke:'rgba(0,0,0,.55)','stroke-width':2},L.trail);}
}

/* =========================================================
   DRAG TO PLAY (aim arrow for moves, free drag for actions)
   ========================================================= */
let drag=null;
/* ---- drag a card out of the market (strip or All cards) toward your hand to start buying it ---- */
let mdrag=null,mdragJustEnded=false;
function marketDown(e){
  if(e.button>0||!S||S.over||UI.cover||!canAct())return;
  const s=e.target.closest('.mslot[data-src]');if(!s||s.classList.contains('no'))return;
  mdrag={src:s.dataset.src,idx:+s.dataset.i,x0:e.clientX,y0:e.clientY,el:s,started:false,ghost:null,pid:e.pointerId};
  window.addEventListener('pointermove',marketMove);window.addEventListener('pointerup',marketUp);window.addEventListener('pointercancel',marketCancel);
}
function marketMove(e){const d=mdrag;if(!d||e.pointerId!==d.pid)return;
  if(!d.started){if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<7)return;d.started=true;
    const stack=d.src==='m'?S.market[d.idx]:S.reserve[d.idx];if(!stack)return marketCancel();
    const g=document.createElement('div');g.className='card mghost';g.innerHTML=cardHTML(stack.t);$('#cards').appendChild(g);d.ghost=g;d.t=stack.t;
    const r=d.el.querySelector('.mcard').getBoundingClientRect();placeAt(g,r,0);d.el.style.opacity=.35;
    if(UI.allOpen)openAll(false);sfx('pick');}
  const A=appRect(),cw=cardW(),ch=cw*1.4,sc=.72;setT(d.ghost,e.clientX-A.left-cw/2,e.clientY-A.top-ch*.45,(e.clientX-d.x0)*.015,sc);
}
function marketUp(e){const d=mdrag;if(!d||e.pointerId!==d.pid)return;marketEnd();
  if(!d.started)return; // plain click → handled by the click listener
  mdragJustEnded=true;setTimeout(()=>{mdragJustEnded=false;},0);
  const mk=$('#mkt').getBoundingClientRect(),overMarket=UI.mktOpen&&e.clientX>=mk.left-10&&e.clientY<=mk.bottom+10;
  if(overMarket){d.ghost.classList.add('anim');placeAt(d.ghost,d.el.querySelector('.mcard').getBoundingClientRect(),0);setTimeout(()=>d.ghost.remove(),260);return;}
  const transmit=UI.mode==='transmit';pickFromMarket(d.src,d.idx);
  // settle into the purchase slot (or fade for the Transmitter, whose card flies to the discard pile)
  const slot=document.querySelector('#buySlot:not([hidden]) .bs-card');
  d.ghost.classList.add('anim');
  if(slot&&!transmit){placeAt(d.ghost,slot.getBoundingClientRect(),0);setTimeout(()=>d.ghost.remove(),280);}
  else{d.ghost.style.opacity=0;setTimeout(()=>d.ghost.remove(),250);}
}
function marketCancel(){const d=mdrag;marketEnd();if(d&&d.ghost)d.ghost.remove();}
function marketEnd(){const d=mdrag;mdrag=null;if(d&&d.el)d.el.style.opacity='';window.removeEventListener('pointermove',marketMove);window.removeEventListener('pointerup',marketUp);window.removeEventListener('pointercancel',marketCancel);}
function wireCard(el,id){
  el.addEventListener('pointerenter',()=>{if(drag||!S||UI.cover)return;if(hp().hand.includes(id)){UI.hover=id;layoutCards();}});
  el.addEventListener('pointerleave',()=>{if(UI.hover===id){UI.hover=null;if(!drag)layoutCards();}});
  el.addEventListener('pointerdown',e=>{
    if(!S||S.over||UI.cover||UI.anim||e.button>0||!canAct())return;
    const inHand=cur().hand.includes(id);const isAct=S.turn.active&&S.turn.active.id===id;
    if(!inHand&&!isAct)return;
    e.preventDefault();
    const pickMode=['trashPick','endTurn','transmit'].includes(UI.mode);
    drag={id,x0:e.clientX,y0:e.clientY,started:false,pid:e.pointerId,kind:pickMode?'none':UI.mode==='discardFor'||UI.mode==='pay'?(inHand&&!UI.picks.includes(id)?'free':'none'):(isAct||isTargeted(id)?'aim':'free'),inHand,wasSel:UI.mode==='card'&&UI.card===id};
    try{el.setPointerCapture(e.pointerId);}catch(_){}
  });
  el.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==id||e.pointerId!==drag.pid)return;
    const dx=e.clientX-drag.x0,dy=e.clientY-drag.y0;
    if(!drag.started){if(Math.hypot(dx,dy)<8||drag.kind==='none')return;drag.started=true;UI.hover=null;
      if(drag.kind==='aim'){if(!(UI.mode==='card'&&UI.card===id)){UI.mode='card';UI.card=id;if(S.turn.active&&S.turn.active.id===id)UI.piece=S.turn.active.pi;UI.picks=[];render();}else layoutCards();}
      else{el.classList.add('free');el.classList.remove('anim');}}
    if(drag.kind==='aim'){drag.cx=e.clientX;drag.cy=e.clientY;startAim();}
    else{const A=appRect(),cw=cardW(),ch=cw*1.4;setT(el,e.clientX-A.left-cw/2,e.clientY-A.top-ch*.4,dx*.02,1.08);el.style.zIndex=150;
      const k=targetAt(e.clientX,e.clientY),dk=k&&isDisc(UI.targets.get(k))?k:null;setHot(dk);
      el.classList.toggle('go',!!dk||(UI.mode!=='discardFor'&&e.clientY<A.top+A.height-ch*1.25));if(UI.mode==='pay')$('#buySlot').classList.toggle('hot',e.clientY<A.top+A.height-ch*1.25);}
  });
  const end=e=>{
    if(!drag||drag.id!==id)return;const d=drag;d.hot=aim.hot;drag=null;
    if(!d.started){if(d.inHand)onHandCard(id);else onPlayCard(id);return;}
    if(d.kind==='aim'){
      const k=d.hot;
      if(k&&UI.targets.has(k)&&!UI.anim)doMove(k);
      else if(!d.wasSel&&!(S.turn.active&&S.turn.active.id===id)){UI.mode='idle';UI.card=null;render();}
      else render();
    }else if(d.kind==='free'){
      const A=appRect(),ch=cardW()*1.4;el.classList.remove('free','go');el.classList.add('anim');
      const k=targetAt(e.clientX,e.clientY),tg=k&&UI.targets.get(k);setHot(null);
      if(UI.mode==='pay'){$('#buySlot').classList.remove('hot');if(e.clientY<A.top+A.height-ch*1.25&&!UI.picks.includes(id)){sfx('pick');togglePick(id);}else layoutCards();}
      else if(isDisc(tg)&&!UI.anim){if(UI.mode==='discardFor')addDiscard(id);else startDiscard(k,id);}
      else if(UI.mode!=='discardFor'&&e.clientY<A.top+A.height-ch*1.25)playAction(id);else layoutCards();
    }
  };
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',e=>{if(drag&&drag.id===id){setHot(null);end(e);}});
}
function boardPoint(cx,cy){const r=vp().getBoundingClientRect();return[(cx-r.left-view.x)/view.s+MAP.minX,(cy-r.top-view.y)/view.s+MAP.minY];}
function hexRound(x,y){const q=(SQ3/3*x-y/3)/R,r=(2/3*y)/R;let rx=q,rz=r,ry=-q-r;let a=Math.round(rx),b=Math.round(ry),c=Math.round(rz);
  const dx=Math.abs(a-rx),dy=Math.abs(b-ry),dz=Math.abs(c-rz);if(dx>dy&&dx>dz)a=-b-c;else if(dy>dz)b=-a-c;else c=-a-b;return key(a,c);}
function targetAt(cx,cy){
  const[x,y]=boardPoint(cx,cy);
  for(const bi in blPos){const p=blPos[bi];if(UI.targets.has('B'+bi)&&Math.hypot(p[0]-x,p[1]-y)<24)return'B'+bi;}
  const k=hexRound(x,y);return UI.targets.has(k)?k:null;
}
/* Live aiming arrow: shown whenever a movement card is selected (by click or drag).
   Mouse: follows the cursor and snaps onto reachable spaces. Touch: points at the explorer
   that will move until you drag. Chevrons flow along the curve continuously. */
const aim={raf:0,mx:null,my:null,touch:false,hot:null,pool:null};
function setHot(hot){
  if(hot===aim.hot)return;
  if(aim.hot){const e=aim.hot[0]==='B'?document.querySelector(`[data-t="${aim.hot}"]`):tgtEls[aim.hot];if(e)e.classList.remove('hot');}
  aim.hot=hot;
  if(hot){const e=hot[0]==='B'?document.querySelector(`[data-t="${hot}"]`):tgtEls[hot];if(e)e.classList.add('hot');showHover(hot,UI.targets.get(hot));}
  else hideHover();
}
function boardToApp(bx,by){const A=appRect(),vr=vp().getBoundingClientRect();return[(bx-MAP.minX)*view.s+view.x+vr.left-A.left,(by-MAP.minY)*view.s+view.y+vr.top-A.top];}
function aimWanted(){return S&&!S.over&&!UI.cover&&UI.mode==='card'&&UI.card&&cardEls.has(UI.card)&&typeOf(UI.card)!=='transmitter';}
function startAim(){if(!aim.raf&&aimWanted())aim.raf=requestAnimationFrame(aimLoop);}
function stopAim(){if(aim.raf)cancelAnimationFrame(aim.raf);aim.raf=0;setHot(null);if(aim.pool)aim.pool.root.style.display='none';}
function aimLoop(ts){
  aim.raf=0;
  if(!aimWanted()){stopAim();return;}
  const el=cardEls.get(UI.card),A=appRect(),r=el.getBoundingClientRect();
  const sx=r.left+r.width/2-A.left,sy=r.top+Math.min(16,r.height*.1)-A.top;
  const dragging=drag&&drag.started&&drag.kind==='aim';
  let tx=null,ty=null,free=false;
  if(dragging){tx=drag.cx;ty=drag.cy;free=true;}
  else if(!aim.touch&&aim.mx!=null){tx=aim.mx;ty=aim.my;free=true;}
  let hot=null;
  if(free){hot=targetAt(tx,ty);tx-=A.left;ty-=A.top;}
  setHot(hot);
  let ex,ey;
  if(hot){if(hot[0]==='B'){[ex,ey]=boardToApp(...blPos[+hot.slice(1)]);}else{const h=hexAt(hot);[ex,ey]=boardToApp(h.x,h.y);}}
  else if(free){ex=tx;ey=ty;}
  else{const pi=S.turn.active&&S.turn.active.id===UI.card?S.turn.active.pi:UI.piece;const pk=cur().pieces[pi];
    if(!pk||pk==='done'){stopAim();return;}const h=hexAt(pk);[ex,ey]=boardToApp(h.x,h.y-R*.9);}
  // hide while the pointer is still down in the hand area
  const show=Math.hypot(ex-sx,ey-sy)>50&&ey<sy-10;
  drawArrow(sx,sy,ex,ey,!!hot,show,(ts/1100)%1);
  aim.raf=requestAnimationFrame(aimLoop);
}
function arrowPool(){
  if(aim.pool)return aim.pool;
  const svg=$('#arrow');const root=sv('g',null,svg);const segs=[];
  for(let i=0;i<26;i++){const g=sv('g',null,root);sv('path',{d:'M-6 -7 L4 0 L-6 7 L-2 0Z','stroke-width':1.5,'stroke-linejoin':'round',stroke:'rgba(0,0,0,.55)'},g);segs.push(g);}
  const head=sv('g',null,root);sv('path',{d:'M-24 -16 L5 0 L-24 16 L-15 0Z',stroke:'rgba(0,0,0,.6)','stroke-width':2,'stroke-linejoin':'round'},head);
  const ring=sv('circle',{r:12,fill:'none','stroke-width':2.5},root);
  aim.pool={root,segs,head,ring};return aim.pool;
}
function drawArrow(sx,sy,ex,ey,ok,show,phase){
  const P0=arrowPool();P0.root.style.display=show?'':'none';if(!show)return;
  const mx=(sx+ex)/2,my=Math.min(sy,ey)-Math.max(50,Math.abs(ex-sx)*.22);
  const cx1=sx+(mx-sx)*.15,cy1=my,cx2=ex-(ex-mx)*.25,cy2=my;
  const P=t=>{const u=1-t;return[u*u*u*sx+3*u*u*t*cx1+3*u*t*t*cx2+t*t*t*ex,u*u*u*sy+3*u*u*t*cy1+3*u*t*t*cy2+t*t*t*ey];};
  const len=Math.hypot(ex-sx,ey-sy)+Math.abs(my-sy)*.6;
  const nSeg=Math.max(5,Math.min(P0.segs.length,Math.round(len/30)));
  const col=ok?'#f8dc97':'#e9efe9';
  P0.segs.forEach((g,i)=>{
    if(i>=nSeg){g.style.display='none';return;}
    const t=(i+phase)/nSeg;if(t<.04||t>.93){g.style.display='none';return;}
    g.style.display='';const[x,y]=P(t),[x2,y2]=P(t+.01);const a=Math.atan2(y2-y,x2-x)*180/Math.PI;const sc=.5+.5*t;
    g.setAttribute('transform',`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)}) scale(${sc.toFixed(2)})`);
    g.firstChild.setAttribute('fill',col);g.style.opacity=Math.min(1,t*6).toFixed(2);
  });
  const[hx,hy]=P(.97);const ha=Math.atan2(ey-hy,ex-hx)*180/Math.PI;
  P0.head.setAttribute('transform',`translate(${ex.toFixed(1)} ${ey.toFixed(1)}) rotate(${ha.toFixed(1)})`);P0.head.firstChild.setAttribute('fill',col);
  P0.ring.setAttribute('cx',ex.toFixed(1));P0.ring.setAttribute('cy',ey.toFixed(1));P0.ring.setAttribute('stroke',col);
  P0.ring.style.opacity=ok?(.5+.4*Math.sin(phase*Math.PI*2)).toFixed(2):0;
}
function clearAim(){setHot(null);}
window.addEventListener('pointermove',e=>{aim.touch=e.pointerType!=='mouse';if(!aim.touch){aim.mx=e.clientX;aim.my=e.clientY;}},{passive:true});
window.addEventListener('pointerdown',e=>{aim.touch=e.pointerType!=='mouse';},{passive:true});

/* =========================================================
   SIDE / HUD / PROMPT
   ========================================================= */
/* ---------- market: floating strip (six market cards + "All cards" tile) and the all-cards spread ---------- */
function setMkt(open){UI.mktOpen=open;$('#mkt').classList.toggle('hid',!open);$('#mktBtn').classList.toggle('on',open);try{localStorage.setItem('eldorado-mkt',open?'1':'0');}catch(e){}
  updateMktH();if(!userZoomed)setTimeout(()=>fit(true),10);}
/* size the right-hand market stack so it always ends above the action buttons (End turn / Undo);
   shrink the cards, and add a column when that isn't enough */
function updateMktH(){
  const mk=$('#mkt');if(!mk)return;const v=vp(),W=v.clientWidth,H=v.clientHeight,phone=W<600;
  const top=mk.offsetTop,ab=$('#actBtns'),abBottom=ab?parseFloat(getComputedStyle(ab).bottom)||0:0;
  let avail=H-abBottom-150-top; // room for up to three stacked buttons below
  if(avail<60&&ab)avail=ab.getBoundingClientRect().top-v.getBoundingClientRect().top-top-12; // very short screens: just stay above the current ones
  const dp=$('#discPile');if(dp)avail=Math.min(avail,dp.getBoundingClientRect().top-v.getBoundingClientRect().top-top-10); // and above the discard pile
  const def=phone?44:72,min=phone?34:56,gap=phone?7:10,cg=phone?7:8,n=S?S.market.length+1:7;
  // try every column count against the room below (height) and beside (width: at most ~55% of the game area); keep the largest cards
  const availW=W*.55;let pick=null;
  for(let cols=phone?1:2;cols<=n;cols++){const rows=Math.ceil(n/cols);
    const mw=Math.min(def,(avail-(rows-1)*gap-8)/(rows*1.4),(availW-(cols-1)*cg)/cols);if(!pick||mw>pick.mw+.5)pick={cols,mw};}
  // no arrangement fits (tiny game area): the market steps aside; the Market button then opens the full card view
  const cramped=pick.mw<min*.8;mk.classList.toggle('cramped',cramped);
  const mw=Math.max(28,Math.floor(pick.mw));
  if(mk.dataset.sz!==pick.cols+'/'+mw){mk.dataset.sz=pick.cols+'/'+mw;mk.style.setProperty('--mw',mw+'px');$('#market').style.gridTemplateColumns=`repeat(${pick.cols},var(--mw))`;
    // the market's width, for everything that must stay clear of it (the prompt)
    $('#app').style.setProperty('--mktW',(pick.cols*mw+(pick.cols-1)*cg)+'px');}
}
function openAll(open){UI.allOpen=open;$('#allc').hidden=!open;if(open){$('#allc').scrollTop=0;renderMarket();}}
const ALL_ICON='<svg viewBox="-10 -10 20 20"><rect x="-8.5" y="-6.5" width="9" height="13" rx="1.6" fill="currentColor" opacity=".45" transform="rotate(-14)"/><rect x="-4.5" y="-7.5" width="9" height="13" rx="1.6" fill="currentColor" opacity=".7"/><rect x="-.5" y="-6.5" width="9" height="13" rx="1.6" fill="currentColor" transform="rotate(12)"/></svg>';
function renderMarket(){
  const canBuy=!S.turn.bought&&!S.over&&!UI.cover,tr=UI.mode==='transmit';
  const openSlot=S.market.some(s=>s.n===0),aff=new Set(tr?[]:affordable().map(a=>a.src+a.idx));
  const slot=(src,s,i,ok)=>{
    if(s.n<=0)return`<div class="mslot empty" data-i="${i}">Sold out${src==='m'?'<br>reserve open':''}</div>`;
    const chosen=UI.mode==='pay'&&UI.buy&&UI.buy.src===src&&UI.buy.idx===i;
    return`<div class="mslot${ok?'':' no'}${aff.has(src+i)?' can':chosen?'':' dimc'}${chosen?' chosen':''}" data-i="${i}" data-src="${src}" title="${esc(cardTitle(s.t))}"><div class="mcard">${cardHTML(s.t)}</div><span class="cnt">${s.n}</span></div>`;};
  const mOk=tr||canBuy,rOk=tr||(canBuy&&openSlot),resAff=[...aff].some(k=>k[0]==='r');
  $('#market').innerHTML=S.market.map((s,i)=>slot('m',s,i,mOk)).join('')+`<button class="alltile${openSlot||tr?' open':''}${resAff?' can':''}" id="allTile" title="See every card, including the reserve">${ALL_ICON}<span>All cards</span><small>${tr?'Pick any card':openSlot?'Reserve open':'Reserve locked'}</small></button>`;
  $('#mktBtn').classList.toggle('canbuy',aff.size>0&&!UI.mktOpen);
  updateMktH();
  if(!UI.allOpen)return;
  $('#allMarket').innerHTML=S.market.map((s,i)=>slot('m',s,i,mOk)).join('');
  $('#reserve').innerHTML=S.reserve.map((s,i)=>slot('r',s,i,rOk)).join('');
  $('#resNote').textContent=tr?'Transmitter: take any card for free.':openSlot?'A market slot is empty, so you may buy from the reserve.':'Opens once a market slot sells out.';
  $('#buyState').textContent=S.turn.bought?'bought this turn':'1 purchase per turn';
  $('#resState').textContent=openSlot?'open':'locked';
}
/* ---------- journal: the game log, newest first, grouped by round; its own HUD button; stays live while open ---------- */
function journalHTML(){
  let r=null,out='';const L=S.log.map((e,i)=>{if(e.r!=null)r=e.r;return{...e,r};}); // server-added lines carry no round: they belong to the one before
  for(let i=L.length-1;i>=0;i--){const e=L[i];
    if(i===L.length-1||e.r!==L[i+1].r)out+=e.r!=null?`<div class="lr">Round ${e.r}</div>`:'';
    const p=e.p!=null?S.players[e.p]:null;
    out+=`<div class="le${p?'':' sys'}">${p?`<i style="background:${p.color}"></i><b>${esc(p.name)}</b> `:''}${esc(e.t)}</div>`;}
  return out||'<p class="note">Nothing has happened yet.</p>';
}
function showJournal(){
  if(!S)return;
  modal(`<h2>Journal <span>newest first</span></h2><div id="log">${journalHTML()}</div><div class="mrow" style="margin-top:14px"><button class="btn pri" id="jClose">Close</button></div>`,
    sc=>{sc.classList.add('plain');sc.querySelector('.modal').classList.add('jrn');sc.querySelector('#jClose').onclick=closeModal;},true);
}
function renderJournal(){const l=document.querySelector('#overlay .modal.jrn #log');if(!l||!S)return;const last=S.log[S.log.length-1],sig=S.log.length+'|'+(last?last.t:'');if(l.dataset.sig!==sig){l.dataset.sig=sig;l.innerHTML=journalHTML();}}
function renderHeader(){
  $('#roundLbl').textContent='Round '+S.round+(S.endTriggered&&!S.over?' · final':'');
  $('#players').innerHTML=S.players.map((p,i)=>{
    const fin=p.pieces.filter(k=>k==='done').length;
    // blockades held: one diamond each, then how many and the biggest (what breaks a tie: most blockades, then the biggest one)
    const bmax=Math.max(0,...p.blocks.map(b=>S.blockades[b].n)),bk=p.blocks.length?p.blocks.map(b=>`<i style="background:${SYMCOL[S.blockades[b].k]}"></i>`).join('')+`<b title="${plural(p.blocks.length,'blockade')}, biggest #${bmax} (ties go to the most blockades, then the biggest one)">${p.blocks.length} · #${bmax}</b>`:'';
    const you=online()&&S.owners[i]===myId();const seat=online()&&NET.room&&NET.room.seats?NET.room.seats.find(x=>x.uid===S.owners[i]):null;const off=!!(seat&&!seat.online);
    return`<div class="pchip glass${i===S.cur&&!S.over?' on':''}" style="--pc:${p.color}${off?';opacity:.55':''}" title="${off?'offline':''}"><span class="dot"></span><span class="nm">${esc(p.name)}${you?' <span style="color:var(--muted);font-weight:600">(you)</span>':''}</span>${p.ai?'<span class="aitag" title="AI player">AI</span>':''}<span class="st">${p.deck.length+p.hand.length+p.discard.length+p.play.length} cards</span>${bk?`<span class="bk">${bk}</span>`:''}${fin?`<span class="fin">${p.pieces.length>1?fin+'/'+p.pieces.length+' ':''}★</span>`:''}</div>`;
  }).join('');
}
function renderPrompt(){
  const pl=cur();const P=$('#ptxt'),B=$('#actBtns');
  const who=`<span class="who"><i style="background:${pl.color}"></i>${esc(pl.name)}</span>`;
  let txt='',btns=[];
  if(REPLAY){P.innerHTML=replayPromptHTML();btnWire(B,[]);return;}
  const undoBtn={t:'Undo',id:'bUndo',dis:!canUndo()||NET.busy,fn:undo};const tm=online()&&!S.over?'<span id="turnTimer" class="timer" hidden></span>':'';
  if(S.over){P.innerHTML='The expedition is over.';btnWire(B,[{t:'Results',id:'bRes',fn:()=>showGameOver(S.players.map((p,i)=>i).filter(i=>playerDone(S.players[i])))},{t:'New game',id:'bNew',pri:1,big:1,fn:showSetup}]);return;}
  if(!canAct()){P.innerHTML=tm+who+(online()&&S.owners[S.cur]===myId()?'<span class="m">Reconnecting…</span>':(isAI(S.cur)?'is playing…':'is taking their turn…'))+(NET.status?` <span class="m">${esc(NET.status)}</span>`:'');btnWire(B,[]);renderTimer();return;}
  if(UI.cover){P.innerHTML=who+'is up next. Pass the device, then reveal the hand.';btnWire(B,[{t:'Reveal hand',id:'bRev',pri:1,big:1,fn:()=>{UI.cover=false;render();banner(cur().name,'Round '+S.round);}}]);return;}
  switch(UI.mode){
    case 'idle':{
      const hasDisc=[...UI.targets.values()].some(t=>t.kind==='rubble'||t.kind==='camp'||t.kind==='blr');
      txt=who+'Drag a card onto the board, or tap it'+(S.turn.bought?'.':', or buy from the market.')+(hasDisc?' <span class="m">Dashed spaces cost cards from your hand.</span>':'');
      if(pl.pieces.length>1&&pl.pieces.every(k=>k!=='done'))txt+=' <span class="m">Tap a pawn to switch.</span>';
      btns=[undoBtn,{t:'End turn',id:'bEnd',pri:1,big:1,fn:startEndTurn}];break;}
    case 'card':{
      const d=def(UI.card);const act=S.turn.active&&S.turn.active.id===UI.card;
      if(typeOf(UI.card)==='native')txt=who+'<b>Native</b>: move to any adjacent free space, or tear down an adjacent blockade.';
      else if(act)txt=who+`<b>${esc(d.n)}</b> has <b>${S.turn.active.left}</b> ${SYMNAME[S.turn.active.sym]}${S.turn.active.left>1?'s':''} left. Keep moving, or play another card.`;
      else txt=who+`<b>${esc(d.n)}</b> · ${d.p} ${d.s==='*'?'of any one symbol':SYMNAME[d.s]+(d.p>1?'s':'')}. Choose a highlighted space.`;
      if(!UI.targets.size)txt+=' <span class="m">No reachable spaces with this card.</span>';
      btns=[undoBtn,{t:act?'Done':'Cancel',id:'bCan',fn:cancelMode},{t:'End turn',id:'bEnd',pri:1,big:1,fn:startEndTurn}];break;}
    case 'pay':{
      const c=CT[UI.buy.t].cost,t=payTotal();
      // no Buy button: the card is bought as soon as the cards paid in cover its price (payProgress)
      txt=who+`Buying <b>${esc(CT[UI.buy.t].n)}</b>: <b>${fmt(t)}</b> of ${c} paid. <span class="m">Drag or tap cards to pay; it's bought as soon as they cover the price. Coin cards and jokers pay their value, others ½.</span>`;
      btns=[{t:'Cancel',id:'bCan',fn:cancelMode}];break;}
    case 'discardFor':{
      const P2=UI.pending;const verb=P2.kind==='camp'?'remove from the game':'discard';const left=P2.need-UI.picks.length;
      txt=who+`${P2.kind==='camp'?'Base camp':P2.kind==='blr'?'Blockade':'Rubble'}: <b>${UI.picks.length} of ${P2.need}</b> cards to ${verb}. `+(left?`<span class="m">Drag ${left} more card${left>1?'s':''} onto it, or tap cards.</span>`:'');
      btns=[{t:'Cancel',id:'bCan',fn:cancelMode},{t:'Confirm',id:'bOk',pri:1,big:1,dis:UI.picks.length!==P2.need,fn:confirmDiscardFor}];break;}
    case 'trashPick':{
      txt=who+`You may remove up to <b>${UI.max}</b> card${UI.max>1?'s':''} in hand from the game (${UI.picks.length}/${UI.max}).`;
      btns=[{t:UI.picks.length?'Remove':'Skip',id:'bOk',pri:1,big:1,fn:confirmTrash}];break;}
    case 'transmit':{txt=who+'<b>Transmitter</b>: choose any card in the market or reserve. It goes to your discard pile.';
      btns=[{t:'Cancel',id:'bCan',fn:cancelMode}];break;}
    case 'buyWarn':{const names=[...new Set(affordable().map(a=>CT[a.t].n))];
      txt=who+`You can still afford <b>${names.slice(0,3).map(esc).join(', ')}</b>${names.length>3?` and ${names.length-3} more`:''}. <span class="m">Buy one before ending your turn?</span>`;
      btns=[{t:'Back',id:'bCan',fn:cancelMode},{t:'See cards',id:'bMkt',fn:()=>{cancelMode();openAll(true);}},{t:'End turn anyway',id:'bEndA',pri:1,big:1,fn:startEndTurn}];break;}
    case 'endTurn':{const k=UI.picks.length;txt=who+(k?`Keeping <b>${k}</b> card${k>1?'s':''}; the rest are discarded.`:'Your leftover cards will be discarded.')+' <span class="m">Tap a card to keep it for next turn. Then you draw up to 4.</span>';
      btns=[{t:'Back',id:'bCan',fn:cancelMode},{t:k===pl.hand.length?'Keep none':'Keep all',id:'bAll',fn:()=>{UI.picks=UI.picks.length===pl.hand.length?[]:pl.hand.slice();render();}},{t:k?'End turn':'Discard & end turn',id:'bEnd2',pri:1,big:1,fn:finishTurn}];break;}
  }
  P.innerHTML=tm+txt;btnWire(B,btns);renderTimer();
}
function btnWire(B,btns){
  const main=btns.filter(b=>b.big),rest=btns.filter(b=>!b.big);
  const sig=btns.map(b=>b.id+(b.dis?'d':'')+b.t).join('|');
  const h=b=>`<button class="btn${b.pri?' pri':''}${b.big?' big':''}" id="${b.id}"${b.dis?' disabled':''}>${b.t}</button>`;
  if(B.dataset.sig!==sig){B.innerHTML=main.map(h).join('')+(rest.length?`<div class="brow">${rest.map(h).join('')}</div>`:'');B.dataset.sig=sig;
    $('#app').style.setProperty('--actFoot',(btns.length?B.offsetWidth+26:16)+'px');} // how far the turn buttons reach in from the right (short screens keep the prompt clear of them)
  btns.forEach(b=>{const e=document.getElementById(b.id);if(e)e.onclick=b.fn;});
}
function render(){
  if(!S)return;
  if(!online()&&!REPLAY&&!isAI(S.cur))UI.viewer=S.cur;
  computeTargets();if(REPLAY)replayDecorate();
  renderHeader();renderMarket();renderPrompt();feedRender();updateMktH();renderBuySlot();renderCards(); // re-size the market once the buttons exist
  renderBlockades();renderTargets();renderPieces();
  aim.hot=null;if(aimWanted())startAim();else stopAim();
  renderJournal();save();updateTitle();renderTimer();$('#menuBtn').textContent=REPLAY?'Exit replay':'Menu';
  if(REPLAY){replayAfterRender();replayBar();}
  aiKick();
}

/* =========================================================
   CHROME: banner, toast, modals
   ========================================================= */
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function banner(t,s){const b=$('#banner');b.querySelector('.t').textContent=t;b.querySelector('.s').textContent=s||'';
  b.getAnimations().forEach(a=>a.cancel());
  b.animate([{opacity:0,transform:'translate(-50%,-44%) scale(.96)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.18},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.75},{opacity:0,transform:'translate(-50%,-56%) scale(1)'}],{duration:1400,easing:'ease-out'});}
let toastT=0;function toast(t,ms){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('on'),ms||1700);}
function modal(html,onMount,dismiss){const o=$('#overlay');o.innerHTML=`<div class="scrim"><div class="modal">${html}</div></div>`;const sc=o.firstChild;
  if(dismiss)sc.addEventListener('click',e=>{if(e.target===sc)closeModal();});onMount&&onMount(sc);}
function closeModal(){const o=$('#overlay');const sc=o.firstChild;if(!sc)return;sc.classList.add('closing');const mo=sc.querySelector('.modal');if(mo)mo.className='modal';sc.style.pointerEvents='none';sc.animate([{opacity:1},{opacity:0}],{duration:160}).onfinish=()=>{sc.remove();};}

/* course list: official routes first; 'random' picks one of them */
function pickCourse(id){return id==='random'?COURSES[Math.floor(Math.random()*COURSES.length)]:(courseById(id)||COURSES[0]);}
function courseName(id){return id==='random'&&COURSES.length>1?'Random course':(courseById(id)||COURSES[0]).name;}
function coursePicker(gid,sel){
  const opts=COURSES.map(c=>[c.id,c.name,'Boards '+c.p.map(x=>x[0]).join(' · '),c.diff]);
  if(COURSES.length>1)opts.push(['random','Random course','Any course from this list']);
  return `<div class="clist" id="${gid}">${opts.map(([id,n,d,df])=>`<button data-c="${id}" class="${sel===id?'on':''}"><b>${esc(n)}${df?` <i class="dtag d-${esc(df.toLowerCase())}">${esc(df)}</i>`:''}</b><span>${esc(d)}</span></button>`).join('')}</div>`;
}
let setup={mode:'local',full:true,oMax:3,oPub:true,oRated:true,oTurn:90,oCourse:'first',n:3,names:['Ana','Ben','Cleo','Dev'],ai:['','','',''],colors:['crimson','ivory','violet','orange'],course:'first',privacy:false,seed:(Math.random()*1e9)|0};
function showSetup(){
  try{const a=JSON.parse(localStorage.getItem('eldorado-seats')||'null');if(Array.isArray(a)&&!setup.aiLoaded)a.slice(0,4).forEach((x,i)=>setup.ai[i]=aiById(x)?x:'');}catch(e){}setup.aiLoaded=true;if(!aiAllowed(setup.course,setup.n))setup.ai=setup.ai.map(()=>''); // saved AI seats only where AI plays
  const saved=loadSave();
  const canResume=saved&&!saved.over&&(saved.v===4||saved.v===5)&&(!S||S.over);
  const routeTxt=()=>MAP&&(!S||S.over)?`<div class="routeInfo">Boards <b>${MAP.route.join(' · ')}</b> · El Dorado (${MAP.endSym==='j'?'jungle':'water'} side) · ${MAP.blockDefs.length} blockades, dealt at random</div>`:'';
  const inGame=!!(S&&!S.over&&!REPLAY),rs=inGame?resignSeat():-1;
  const gameRow=()=>inGame?`<div class="ingame"><span><b>Game in progress</b> · round ${S.round}${online()?' · online':''}</span><span class="ig-b">${rs>=0?`<button class="btn" id="sResign">Resign${!online()&&S.players.filter(p=>!p.ai).length>1?' ('+esc(S.players[rs].name)+')':''}</button>`:''}<button class="btn pri" id="sBack">Back to game</button></span></div>`:'';
  const html=()=>`${gameRow()}<h2>El Dorado Expedition</h2><p class="sub">Race through the jungle to the golden city. Build your expedition deck, tear down blockades, and be first to reach El Dorado.</p>
    <div class="field"><label>How are you playing?</label><div class="seg" id="sMode"><button data-m="local" class="on">On this device</button><button data-m="online">Online</button></div></div>
    <div class="field"><label>Players</label><div class="seg" id="sN">${[2,3,4].map(n=>`<button data-n="${n}" class="${setup.n===n?'on':''}">${n}</button>`).join('')}</div>${setup.n===2?'<p class="note">Two players each lead two explorers. Both must reach El Dorado.</p>':''}</div>
    <div class="field"><label>Expedition leaders</label>${[...Array(setup.n)].map((_,i)=>{const A=aiById(setup.ai[i]);return`<div class="prow seat"><select class="who" id="pt${i}" aria-label="Player ${i+1}: human or AI"><option value="">Human</option><optgroup label="AI players">${AIS.map(a=>`<option value="${a.id}" ${setup.ai[i]===a.id?'selected':''} ${!aiAllowed(setup.course,setup.n)||setup.ai.slice(0,setup.n).some((x,j)=>j!==i&&x===a.id)?'disabled':''}>${a.name} · ${a.tier}</option>`).join('')}</optgroup></select>${A?`<div class="ainm" title="${esc(A.desc)}"><span>${esc(A.desc)}</span></div>`:`<input id="pn${i}" maxlength="14" value="${esc(setup.names[i])}" aria-label="Player ${i+1} name">`}<div class="sws">${COLORS.map(c=>`<button data-p="${i}" data-c="${c.id}" style="--c:${c.hex}" class="${setup.colors[i]===c.id?'on':''}" ${setup.colors.slice(0,setup.n).some((x,j)=>j!==i&&x===c.id)?'disabled':''} aria-label="${c.name}"></button>`).join('')}</div></div>`;}).join('')}${allAI()?'<p class="note" style="color:#f3c98b">Seat at least one human player.</p>':''}</div>
    <div class="field"><label>Course</label>${coursePicker('sC',setup.course)}<div id="rInfo">${routeTxt()}</div>${aiAllowed(setup.course,setup.n)?'':'<div class="aiNote">AI players are available on First Expedition with 3 or 4 players for now.</div>'}</div>
    <div class="field"><label>Game ends</label><div class="seg" id="sFull"><button data-f="1" class="${setup.full?'on':''}">When all but one arrive</button><button data-f="0" class="${setup.full?'':'on'}">At the first arrival (official)</button></div></div>
    <div class="field"><label class="chk"><input type="checkbox" id="sPriv" ${setup.privacy?'checked':''}> <span>Hide each hand until its player taps “Reveal” (for pass-and-play with others)</span></label></div>
    <div class="mrow"><button class="btn" id="sReplays">Replays</button>${canResume?'<button class="btn" id="sResume">Resume saved game</button>':''}<button class="btn pri big" id="sGo">${inGame?'Start a new game':'Start expedition'}</button></div>`;
  const allAI=()=>setup.ai.slice(0,setup.n).every(x=>x);
  const preview=()=>{if(S&&!S.over)return;try{setup.cur=pickCourse(setup.course);MAP=buildCourse(setup.cur,setup.seed);buildBoard();fit();L.pieces.innerHTML='';const ri=document.getElementById('rInfo');if(ri)ri.innerHTML=routeTxt();}catch(e){console.error(e);}};
  const mount=sc=>{
    const m=sc.querySelector('.modal');
    const sync=()=>{for(let i=0;i<setup.n;i++){const e=m.querySelector('#pn'+i);if(e)setup.names[i]=e.value.trim()||('Player '+(i+1));}const jc=m.querySelector('#jCode');if(jc)setup.code=jc.value.trim().toUpperCase();};
    const rerender=()=>{sync();m.innerHTML=html();wire();};
    const wire=()=>{
      m.querySelectorAll('#sMode button').forEach(b=>b.onclick=()=>{if(b.dataset.m==='online'){closeModal();setTimeout(showHub,170);}});
      m.querySelectorAll('#sN button').forEach(b=>b.onclick=()=>{setup.n=+b.dataset.n;if(!aiAllowed(setup.course,setup.n))setup.ai=setup.ai.map(()=>'');rerender();});
      m.querySelectorAll('#sC button').forEach(b=>b.onclick=()=>{setup.course=b.dataset.c;if(!aiAllowed(setup.course,setup.n))setup.ai=setup.ai.map(()=>'');preview();rerender();}); // AI seats only on AI courses
      m.querySelectorAll('.sws button').forEach(b=>b.onclick=()=>{setup.colors[+b.dataset.p]=b.dataset.c;rerender();});
      m.querySelectorAll('select.who').forEach(e=>e.onchange=()=>{sync();setup.ai[+e.id.slice(2)]=e.value;try{localStorage.setItem('eldorado-seats',JSON.stringify(setup.ai));}catch(_){}m.innerHTML=html();wire();});
      m.querySelector('#sGo').disabled=allAI();
      m.querySelector('#sPriv').onchange=e=>setup.privacy=e.target.checked;
      m.querySelectorAll('#sFull button').forEach(b=>b.onclick=()=>{setup.full=b.dataset.f==='1';rerender();});
      const rs=m.querySelector('#sResume');if(rs)rs.onclick=()=>{aiReset();UI.viewer=null;S=saved;REC=loadRec(S);MAP=mapFor(S);buildBoard();UI.mode='idle';UI.piece=Math.max(0,cur().pieces.findIndex(k=>k!=='done'));closeModal();lastPlayer=-1;render();fit();};
      const cl=m.querySelector('#sBack');if(cl)cl.onclick=closeModal;
      const rb=m.querySelector('#sResign');if(rb)rb.onclick=()=>{closeModal();setTimeout(()=>online()?resignOnline():resignLocal(),170);};
      m.querySelector('#sReplays').onclick=()=>{closeModal();setTimeout(showReplays,170);};
      m.querySelector('#sGo').onclick=()=>{sync();undoStack=[];if(online())exitOnline(); // an online game goes on without you (rejoin it from Online)
        for(const[,el]of cardEls)el.remove();cardEls.clear();
        if(allAI())return;aiReset();
        UI.lastReplay=null;REC=recNewGame({course:setup.cur||pickCourse(setup.course),seed:setup.seed,privacy:setup.privacy,fullRace:setup.full,players:[...Array(setup.n)].map((_,i)=>{const A=aiById(setup.ai[i]);return{name:A?A.name:setup.names[i]||('Player '+(i+1)),color:COLORS.find(c=>c.id===setup.colors[i]).hex,ai:A?A.id:undefined};})});
        if(S.players.some(p=>p.ai&&aiUsesNet(p.ai)))aiNetLoad();
        buildBoard();UI.mode='idle';UI.piece=0;UI.viewer=null;UI.cover=S.privacy&&!isAI(S.cur)&&S.players.filter(p=>!p.ai).length>1;lastPlayer=-1;closeModal();render();fit();
        if(!UI.cover)banner(cur().name,isAI(S.cur)?'AI · Round 1':'Round 1');
        setup.seed=(Math.random()*1e9)|0;};
    };
    m.innerHTML=html();wire();
  };
  for(let i=0;i<setup.n;i++){if(setup.colors.slice(0,i).includes(setup.colors[i]))setup.colors[i]=COLORS.find(c=>!setup.colors.slice(0,setup.n).includes(c.id)).id;}
  if(!S||S.over)preview();
  modal('',mount,!!(S&&!S.over));
}
function showRules(){
  modal(`<h2>How to play</h2><div class="rules">
  <p>Race to El Dorado: move onto one of the three finishing spaces on the El Dorado tile at the end of the route. Your explorer then steps into the city, freeing the space.</p><p><b>Game end.</b> Online games (and local games by default) continue until all but one expedition has arrived, then the round is finished; this gives every player a place. Players arriving in the same round are split by blockades held. The official rule, where the game ends after the round in which the first player arrives, is available for local games.</p><p><b>Online.</b> Each turn has a timer; when it runs out the turn ends and leftover cards are discarded. Missing 3 turns in a row forfeits. Rated games (the default) change Elo ratings; whoever creates a room can make it unrated.</p><p><b>AI players.</b> Any seat can be an AI: <b>Humboldt</b> (Master: a neural network that plans each whole turn), <b>Orellana</b> (Strong: the same network, one move at a time) or <b>Raleigh</b> (Steady: a hand-written route planner). Online, AIs play on the server and have ratings of their own. The network was trained on First Expedition; on other courses the AIs use the route planner.</p>
  <h4>Your turn</h4><ul><li><b>Play cards</b> in any order: move, play action cards, and buy <b>at most one</b> card.</li><li><b>End turn</b>: played cards go to your discard pile. You may discard any cards left in hand or keep them.</li><li><b>Draw</b> back up to 4 cards. An empty deck is refilled by shuffling your discard pile.</li></ul>
  <h4>Moving</h4><ul><li><b>Drag</b> a card onto a highlighted space, or tap the card and then the space.</li><li>A jungle, water or village space needs one card of that symbol with at least the shown strength. Cards can't be combined for one space.</li><li>Leftover strength keeps moving the same explorer over further spaces of that type. It's lost once you do something else.</li><li>Jokers (white) count as any one symbol, chosen when played.</li><li><b>Rubble</b> (grey): discard as many cards as shown — drag cards onto it one by one; you move once enough are in. <b>Base camp</b> (red): remove that many cards from the game.</li><li>Mountains are impassable. Occupied spaces can't be entered or crossed.</li></ul>
  <h4>Blockades</h4><p>At the start, a random blockade from #1–6 is placed on each connection between two boards. The first explorer to cross pays its cost (a matching card, or discards for grey ones) and keeps it; the Native can also tear one down. Ties at the end go to whoever holds the most blockades, then the highest-numbered one.</p>
  <h4>Buying</h4><ul><li>Coin cards and jokers pay their value; every other card pays ½ coin. No change.</li><li>Drag a market card toward your hand (or tap it), then drag or tap cards from your hand to pay. The purchase completes as soon as it's covered.</li><li>Bought cards go to your discard pile.</li><li>The reserve opens once a market slot is empty; that stack moves into the slot.</li></ul>
  <h4>Single-use cards</h4><p>Cards marked <b>Single use</b> are removed from the game after their effect. Spent only as ½ coin, they're discarded normally.</p>
  <h4>Two players</h4><p>Each player leads two explorers (starting spaces 1 & 3, and 2 & 4) and wins only when both reach El Dorado. Each card moves one of them.</p>
  <h4>About the boards</h4><p>Courses are fixed routes, starting with the rulebook's route for a first game (B · C · N · I · K), laid out as on the official setup sheet. Tiles B, C, I, K and N are copied space by space from the printed tiles; darker spaces are harder to cross.</p>
  <h4>Controls</h4><ul><li>Drag or scroll to pan, pinch or ctrl+scroll to zoom. <b>Esc</b> cancels, <b>Ctrl+Z</b> undoes until new cards are drawn.</li></ul>
  </div><div class="mrow"><button class="btn pri" id="rClose">Close</button></div>`,sc=>sc.querySelector('#rClose').onclick=closeModal,true);
}
function showGameOver(){
  const w=S.winners||[];const fin=S.players.map((p,i)=>i).filter(i=>playerDone(S.players[i]));
  const res=online()&&NET.room&&NET.room.results;const ord=S.players.map((p,i)=>i).sort((a,b)=>(S.places?S.places[a]-S.places[b]:0));
  const ordn=n=>n+(['th','st','nd','rd'][n%100>10&&n%100<14?0:Math.min(n%10,4)%4]||'th');
  const rows=ord.map(i=>[S.players[i],i]).map(([p,i])=>`<div class="prow" style="justify-content:space-between;padding:9px 12px;border-radius:10px;background:${w.includes(i)?'rgba(233,178,74,.14)':'#0c1512'};border:1px solid ${w.includes(i)?'var(--gold)':'var(--line)'}"><span style="display:flex;align-items:center;gap:8px">${S.places?`<b style="color:var(--gold2);min-width:34px">${ordn(S.places[i])}</b>`:''}<i style="width:12px;height:12px;border-radius:50%;background:${p.color};display:inline-block"></i><b>${esc(p.name)}</b></span><span style="color:var(--muted);font-size:13px">${playerDone(p)?'Reached El Dorado (round '+p.fin+')':p.resigned?'Left the game':'Still in the jungle'} · ${plural(p.blocks.length,'blockade')}${p.blocks.length?' (biggest #'+Math.max(...p.blocks.map(b=>S.blockades[b].n))+')':''}${res&&res.deltas?` · <b style="color:${res.deltas[i]>=0?'#8fe3a8':'#ff9c8a'}">${res.deltas[i]>=0?'+':''}${res.deltas[i]}</b> → ${Math.round(res.before[i]+res.deltas[i])}`:''}</span></div>`).join('');
  const rid=res&&res.replay||null;
  const tie=fin.length>1?'<p class="sub" style="margin:10px 0 0">Explorers arriving in the same round are split by blockades held, then the highest-numbered blockade.</p>':'';
  modal(`<h2>${w.length?w.map(i=>esc(S.players[i].name)).join(' & ')+' win'+(w.length>1?'':'s'):'Expedition over'}</h2><p class="sub">The race ended in round ${S.round}.${res&&res.deltas?' Ratings updated.':res&&res.unrated?' Unrated game: ratings unchanged.':''}</p>${rows}${tie}<div class="mrow">${rid||UI.lastReplay&&!online()?'<button class="btn" id="gRep">Watch replay</button>':''}<button class="btn" id="gClose">View board</button><button class="btn pri" id="gNew">New game</button></div>`,
    sc=>{sc.querySelector('#gClose').onclick=closeModal;
      const gr=sc.querySelector('#gRep');if(gr)gr.onclick=()=>{closeModal();if(online()){exitOnline();loadReplayId(rid);}else openReplay(UI.lastReplay,null);};sc.querySelector('#gNew').onclick=()=>{closeModal();if(online()){exitOnline();setTimeout(showHub,180);}else setTimeout(showSetup,180);};},true);
}
function showPile(which){
  if(!S||UI.cover)return;const pl=hp();
  const ids=which==='deck'?pl.deck.slice():pl.discard.slice();
  const order=Object.keys(CT);const sorted=ids.map(typeOf).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  const all=pl.deck.length+pl.hand.length+pl.discard.length+pl.play.length;
  modal(`<h2>${which==='deck'?'Draw pile':'Discard pile'}</h2><p class="sub">${plural(ids.length,'card')}${which==='deck'?', sorted (the real order is hidden)':''}. ${all} cards in your expedition.</p><div class="deckgrid">${sorted.map(t=>`<div class="mcard">${cardHTML(t)}</div>`).join('')||'<p class="note">Empty.</p>'}</div><div class="mrow"><button class="btn pri" id="pClose">Close</button></div>`,sc=>sc.querySelector('#pClose').onclick=closeModal,true);
}

